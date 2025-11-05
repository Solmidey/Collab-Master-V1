import { InMemoryDatabase } from "../db/inMemoryDatabase.js";
import { AuditLogService } from "../services/auditLogService.js";
import { StateService } from "../services/stateService.js";
import { runMilestoneWatchdog } from "../jobs/milestoneWatchdog.js";
import { runTreasurySweepJob } from "../jobs/treasurySweep.js";
import { TreasuryService } from "../services/treasuryService.js";

const db = new InMemoryDatabase();
const auditLog = new AuditLogService(db);
const state = new StateService(db);

state.upsertDeal({
  id: "deal-1",
  guildId: "guild",
  buyerDiscordId: "buyer",
  sellerDiscordId: "seller",
  escrowAddress: "0xescrow",
  escrowChainId: 31337,
  requiredSigners: [],
  refundWindowSeconds: 3600,
  controllerSafe: undefined,
  blockRefundValueThreshold: 0n,
  milestones: ["milestone-1"],
});
state.insertMilestone({
  id: "milestone-1",
  dealId: "deal-1",
  amount: 10n,
  recipients: ["0x00000000000000000000000000000000000000b1"],
  deadline: new Date(Date.now() - 7200 * 1000),
  status: "PENDING",
  autoReleaseCondition: "NONE",
});

describe("jobs", () => {
  it("triggers refund when beyond refund window", async () => {
    let refunded = false;
    await runMilestoneWatchdog({
      stateService: state,
      auditLogService: auditLog,
      dispatchReminder: async () => {},
      triggerRefund: async ({ requiresDualConfirmation }) => {
        expect(typeof requiresDualConfirmation).toBe("boolean");
        refunded = true;
      },
      now: new Date(),
    });
    expect(refunded).toBe(true);
  });

  it("enqueues treasury sweep when threshold met", async () => {
    const treasuryService = new TreasuryService(state, auditLog, () => ({
      async prepareTransaction() {
        return { safeTxHash: "0xsafe" };
      },
    }));
    await runTreasurySweepJob({
      treasuryService,
      hotWalletBalanceFetcher: async () => 5n,
      hotWalletAddress: "0xhot",
      safeAddress: "0xsafe",
      threshold: 1n,
    });
    const pending = treasuryService.listPending();
    expect(pending.length).toBeGreaterThan(0);
    expect(pending[0].transactionPayload.safeTxHash).toBeDefined();
  });
});
