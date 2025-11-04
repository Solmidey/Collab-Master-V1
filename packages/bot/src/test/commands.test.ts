import { jest } from "@jest/globals";
import { InMemoryDatabase } from "../../backend/src/db/inMemoryDatabase.js";
import { AuditLogService } from "../../backend/src/services/auditLogService.js";
import { StateService } from "../../backend/src/services/stateService.js";
import { IpfsService } from "../../backend/src/services/ipfsService.js";
import { DealService } from "../../backend/src/services/dealService.js";
import { EscrowService } from "../../backend/src/services/escrowService.js";
import { ethers } from "ethers";
import type { ChatInputCommandInteraction } from "discord.js";
import { handleDepositCommand } from "../commands/deposit.js";
import { handleOpenDisputeCommand } from "../commands/openDispute.js";
import { handleAcceptMilestoneCommand } from "../commands/acceptMilestone.js";

function createInteraction(options: Record<string, string | undefined>): ChatInputCommandInteraction {
  return {
    options: {
      getString: (name: string, required?: boolean) => {
        const value = options[name];
        if (value === undefined && required) {
          throw new Error(`Missing option ${name}`);
        }
        return value ?? null;
      },
    },
    reply: jest.fn().mockResolvedValue(undefined),
    user: { id: "user" },
  } as unknown as ChatInputCommandInteraction;
}

describe("bot commands", () => {
  const controllerKey = ethers.Wallet.createRandom().privateKey;
  const provider = new ethers.JsonRpcProvider("http://127.0.0.1:8545");
  let db: InMemoryDatabase;
  let auditLog: AuditLogService;
  let state: StateService;
  let escrowService: EscrowService;
  let dealService: DealService;

  beforeEach(() => {
    process.env.ESCROW_CONTROLLER_PRIVATE_KEY = controllerKey;
    db = new InMemoryDatabase();
    auditLog = new AuditLogService(db);
    state = new StateService(db);
    escrowService = new EscrowService(provider, auditLog);
    dealService = new DealService(state, auditLog, escrowService, new IpfsService(), async () => true);

    state.upsertDeal({
      id: "deal-1",
      guildId: "guild",
      buyerDiscordId: "user",
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
      dealId: "deal-1",
      amount: 2n,
      recipients: ["0x00000000000000000000000000000000000000c1", "0x00000000000000000000000000000000000000c2"],
      deadline: new Date(Date.now() + 3600 * 1000),
      status: "PENDING",
      autoReleaseCondition: "NONE",
    });
  });

  afterEach(() => {
    delete process.env.ESCROW_CONTROLLER_PRIVATE_KEY;
  });

  it("records deposit via command", async () => {
    const interaction = createInteraction({ deal_id: "deal-1", amount: "1" });
    await handleDepositCommand(interaction, { dealService, depositCap: 10n });
    expect(interaction.reply).toHaveBeenCalled();
  });

  it("opens dispute via command", async () => {
    const interaction = createInteraction({ milestone_id: "milestone-1", description: "Issue" });
    await handleOpenDisputeCommand(interaction, { dealService });
    expect(interaction.reply).toHaveBeenCalledWith(expect.objectContaining({ content: expect.stringContaining("Dispute") }));
  });

  it("accepts milestone via command", async () => {
    const interaction = createInteraction({ deal_id: "deal-1", milestone_id: "milestone-1" });
    const contract = {
      address: "0xescrow",
      chainId: 31337,
      getNonce: async () => 0n,
      release: async () => ({ hash: "0xhash" }),
    };
    await handleAcceptMilestoneCommand(interaction, {
      dealService,
      contractResolver: () => contract,
      signerFactory: async () => [ethers.Wallet.createRandom()],
    });
    expect(interaction.reply).toHaveBeenCalledWith(
      expect.objectContaining({ content: expect.stringContaining("Milestone **milestone-1** accepted") })
    );
  });
});
