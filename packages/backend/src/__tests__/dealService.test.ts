import { InMemoryDatabase } from "../db/inMemoryDatabase.js";
import { AuditLogService } from "../services/auditLogService.js";
import { StateService } from "../services/stateService.js";
import { IpfsService } from "../services/ipfsService.js";
import { DealService, VerificationError, BlockedParticipantError } from "../services/dealService.js";
import { EscrowService, MissingControllerKeyError } from "../services/escrowService.js";
import { ethers } from "ethers";

describe("DealService", () => {
  const controllerKey = ethers.Wallet.createRandom().privateKey;
  const provider = new ethers.JsonRpcProvider("http://127.0.0.1:8545");
  let db: InMemoryDatabase;
  let auditLog: AuditLogService;
  let state: StateService;
  let dealService: DealService;
  let escrowService: EscrowService;
  let contractReleaseCalled: boolean;

  beforeEach(() => {
    process.env.ESCROW_CONTROLLER_PRIVATE_KEY = controllerKey;
    db = new InMemoryDatabase();
    auditLog = new AuditLogService(db);
    state = new StateService(db);
    escrowService = new EscrowService(provider, auditLog);
    dealService = new DealService(state, auditLog, escrowService, new IpfsService(), async () => true);
    contractReleaseCalled = false;
  });

  afterEach(() => {
    delete process.env.ESCROW_CONTROLLER_PRIVATE_KEY;
  });

  function seedDealAndMilestone() {
    const deal = state.upsertDeal({
      id: "deal-1",
      guildId: "guild",
      buyerDiscordId: "buyer",
      sellerDiscordId: "seller",
      escrowAddress: "0xescrow",
      escrowChainId: 31337,
      requiredSigners: [],
      controllerSafe: undefined,
      refundWindowSeconds: 3600,
      blockRefundValueThreshold: 0n,
      milestones: ["milestone-1"],
    });
    state.insertMilestone({
      id: "milestone-1",
      dealId: deal.id,
      amount: 2n,
      recipients: ["0x00000000000000000000000000000000000000a1", "0x00000000000000000000000000000000000000a2"],
      deadline: new Date(Date.now() + 3600 * 1000),
      status: "PENDING",
      autoReleaseCondition: "HASH_MATCH",
      deliverableChecksum: "hash",
      expectedChecksum: "hash",
    });
    return deal;
  }

  function buildContract(): any {
    return {
      address: "0xescrow",
      chainId: 31337,
      getNonce: async () => 0n,
      release: async () => {
        contractReleaseCalled = true;
        return { hash: "0xrelease" };
      },
    };
  }

  it("accepts milestone and triggers release when hash matches", async () => {
    seedDealAndMilestone();
    const contract = buildContract();
    const signer = ethers.Wallet.createRandom();
    const result = await dealService.acceptMilestone({
      milestoneId: "milestone-1",
      actor: { discordId: "buyer" },
      contract,
      signers: [signer],
    });
    expect(result.status).toBe("RELEASED");
    expect(contractReleaseCalled).toBe(true);
  });

  it("prevents release when dispute is open", async () => {
    seedDealAndMilestone();
    const dispute = dealService.openDispute("milestone-1", "buyer");
    expect(dispute.status).toBe("OPEN");
    await expect(
      dealService.acceptMilestone({
        milestoneId: "milestone-1",
        actor: { discordId: "buyer" },
        contract: buildContract(),
        signers: [ethers.Wallet.createRandom()],
      })
    ).rejects.toThrow(VerificationError);
  });

  it("enforces blocklist on deposit", () => {
    state.addBlocklistEntry({ discordId: "bad-user" });
    expect(() =>
      dealService.recordDeposit("deal-1", 5n, { discordId: "bad-user", cap: 10n })
    ).toThrow(BlockedParticipantError);
  });

  it("throws when controller key missing and safe not provided", async () => {
    delete process.env.ESCROW_CONTROLLER_PRIVATE_KEY;
    escrowService = new EscrowService(provider, auditLog);
    dealService = new DealService(state, auditLog, escrowService, new IpfsService(), async () => true);
    seedDealAndMilestone();
    await expect(
      dealService.acceptMilestone({
        milestoneId: "milestone-1",
        actor: { discordId: "buyer" },
        contract: buildContract(),
        signers: [ethers.Wallet.createRandom()],
      })
    ).rejects.toBeInstanceOf(MissingControllerKeyError);
  });
});
