import type { Deal } from "../models/deal.js";
import type { Milestone } from "../models/milestone.js";
import type { StateService } from "../services/stateService.js";
import type { AuditLogService } from "../services/auditLogService.js";

export interface WatchdogDependencies {
  stateService: StateService;
  auditLogService: AuditLogService;
  dispatchReminder: (payload: { deal: Deal; milestone: Milestone; hoursBefore: number }) => Promise<void>;
  triggerRefund: (payload: { deal: Deal; milestone: Milestone; requiresDualConfirmation: boolean }) => Promise<void>;
  now?: Date;
}

const REMINDER_WINDOWS = [72, 24, 6];

export async function runMilestoneWatchdog({
  stateService,
  auditLogService,
  dispatchReminder,
  triggerRefund,
  now = new Date(),
}: WatchdogDependencies): Promise<void> {
  for (const deal of stateService.listDeals()) {
    const milestones = stateService.listMilestonesByDeal(deal.id);
    for (const milestone of milestones) {
      if (milestone.status === "DISPUTED" || milestone.status === "RELEASED" || milestone.status === "REFUNDED") {
        continue;
      }
      const msUntilDeadline = milestone.deadline.getTime() - now.getTime();
      const hoursUntilDeadline = Math.floor(msUntilDeadline / (1000 * 60 * 60));
      if (msUntilDeadline > 0) {
        for (const window of REMINDER_WINDOWS) {
          if (hoursUntilDeadline === window) {
            await dispatchReminder({ deal, milestone, hoursBefore: window });
            auditLogService.append("milestone.watchdog.reminder", {
              milestoneId: milestone.id,
              dealId: deal.id,
              hoursBefore: window,
            });
          }
        }
      } else {
        const deadlinePassedMs = now.getTime() - milestone.deadline.getTime();
        const refundWindowMs = deal.refundWindowSeconds * 1000;
        if (deadlinePassedMs >= refundWindowMs && milestone.status !== "REFUNDED") {
          const requiresDualConfirmation = milestone.amount >= deal.blockRefundValueThreshold;
          await triggerRefund({ deal, milestone, requiresDualConfirmation });
          auditLogService.append("milestone.watchdog.refund_triggered", {
            milestoneId: milestone.id,
            dealId: deal.id,
            requiresDualConfirmation,
          });
        }
      }
    }
  }
}
