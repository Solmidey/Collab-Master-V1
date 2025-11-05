import { randomUUID } from "node:crypto";

import type { AuditLogService } from "./auditLogService.js";
import type { EscrowService, EscrowContractAdapter } from "./escrowService.js";
import type { Signer } from "ethers";
import type { IpfsService } from "./ipfsService.js";
import type { StateService } from "./stateService.js";
import type { Deal } from "../models/deal.js";
import type { Milestone, AutoReleaseCondition } from "../models/milestone.js";
import type { Dispute, EvidenceArtifact } from "../models/dispute.js";

export interface AcceptanceActor {
  discordId: string;
  walletAddress?: string;
}

export interface AcceptanceOptions {
  milestoneId: string;
  actor: AcceptanceActor;
  contract: EscrowContractAdapter;
  signers: Signer[];
  safeAddress?: string;
}

export interface DeliverableInput {
  milestoneId: string;
  buffer: Buffer;
  expectedChecksum?: string;
}

export type DisputeDecision = "release" | "refund" | "split";

export class AuthorizationError extends Error {}
export class VerificationError extends Error {}
export class BlockedParticipantError extends Error {}

export class DealService {
  constructor(
    private readonly stateService: StateService,
    private readonly auditLogService: AuditLogService,
    private readonly escrowService: EscrowService,
    private readonly ipfsService: IpfsService,
    private readonly testRunner: (milestone: Milestone) => Promise<boolean> = async () => true
  ) {}

  assertNotBlocked(walletAddress?: string, discordId?: string): void {
    if (this.stateService.isBlocked({ walletAddress, discordId })) {
      this.auditLogService.append("compliance.block", { walletAddress, discordId });
      throw new BlockedParticipantError("Participant is blocklisted");
    }
  }

  createDeal(deal: Deal): Deal {
    this.assertNotBlocked(undefined, deal.buyerDiscordId);
    this.assertNotBlocked(undefined, deal.sellerDiscordId);
    return this.stateService.upsertDeal(deal);
  }

  recordDeposit(dealId: string, amount: bigint, { walletAddress, discordId, cap }: {
    walletAddress?: string;
    discordId?: string;
    cap: bigint;
  }): void {
    this.assertNotBlocked(walletAddress, discordId);
    if (amount > cap) {
      throw new VerificationError("Deposit exceeds configured cap for unverified user");
    }
    this.auditLogService.append("escrow.deposit.recorded", {
      dealId,
      amount: amount.toString(),
      walletAddress,
      discordId,
    });
  }

  async storeDeliverable({ milestoneId, buffer, expectedChecksum }: DeliverableInput): Promise<Milestone> {
    const milestone = this.stateService.getMilestone(milestoneId);
    if (!milestone) {
      throw new Error("Milestone not found");
    }
    const pin = await this.ipfsService.pinToIpfs(buffer);
    const updated: Milestone = {
      ...milestone,
      deliverableIpfsHash: pin.cid,
      deliverableChecksum: pin.checksum,
      expectedChecksum: expectedChecksum ?? milestone.expectedChecksum,
    };
    this.auditLogService.append("deliverable.pinned", {
      milestoneId,
      cid: pin.cid,
      checksum: pin.checksum,
    });
    return this.stateService.updateMilestone(updated);
  }

  private ensureActorCanAccept(deal: Deal, actor: AcceptanceActor): void {
    const allowed = deal.buyerDiscordId === actor.discordId || deal.requiredSigners.includes(actor.walletAddress ?? "");
    if (!allowed) {
      throw new AuthorizationError("Actor is not authorized to accept this milestone");
    }
  }

  private async runAutoVerification(milestone: Milestone, condition: AutoReleaseCondition): Promise<void> {
    switch (condition) {
      case "NONE":
        return;
      case "HASH_MATCH": {
        if (!milestone.expectedChecksum) {
          throw new VerificationError("Expected checksum not set");
        }
        if (milestone.expectedChecksum !== milestone.deliverableChecksum) {
          throw new VerificationError("Deliverable checksum mismatch");
        }
        return;
      }
      case "TESTS_PASS": {
        const result = await this.testRunner(milestone);
        if (!result) {
          throw new VerificationError("Automated tests failed");
        }
        return;
      }
      default:
        throw new VerificationError(`Unknown auto release condition: ${condition}`);
    }
  }

  async acceptMilestone({ milestoneId, actor, contract, signers, safeAddress }: AcceptanceOptions): Promise<Milestone> {
    const milestone = this.stateService.getMilestone(milestoneId);
    if (!milestone) {
      throw new Error("Milestone not found");
    }
    if (milestone.status === "DISPUTED") {
      throw new VerificationError("Milestone is locked by an active dispute");
    }
    const deal = this.stateService.getDeal(milestone.dealId);
    if (!deal) {
      throw new Error("Deal not found");
    }
    this.ensureActorCanAccept(deal, actor);

    const updated: Milestone = {
      ...milestone,
      acceptedAt: new Date(),
      status: "ACCEPTED",
    };

    await this.runAutoVerification(updated, milestone.autoReleaseCondition);

    const recipients = milestone.recipients;
    const amounts = milestone.recipients.map(() => milestone.amount / BigInt(milestone.recipients.length));

    const releaseResult = await this.escrowService.release({
      contract,
      recipients,
      amounts,
      signers,
      safeAddress: safeAddress ?? deal.controllerSafe,
    });

    const finalMilestone: Milestone = {
      ...updated,
      status: "RELEASED",
    };
    this.stateService.updateMilestone(finalMilestone);
    this.auditLogService.append("milestone.released", {
      milestoneId,
      dealId: milestone.dealId,
      txHash: releaseResult.txHash,
      safeRequestId: releaseResult.safeRequestId,
    });
    return finalMilestone;
  }

  openDispute(milestoneId: string, openedBy: string, description?: string): Dispute {
    const milestone = this.stateService.getMilestone(milestoneId);
    if (!milestone) {
      throw new Error("Milestone not found");
    }
    if (milestone.status === "RELEASED") {
      throw new VerificationError("Milestone already released");
    }
    const dispute = this.stateService.openDispute({
      milestoneId,
      openedBy,
      status: "OPEN",
      evidence: description
        ? [
            {
              id: randomUUID(),
              checksum: "",
              description,
              ipfsHash: "",
              submittedBy: openedBy,
              submittedAt: new Date(),
            },
          ]
        : [],
    });
    const updated: Milestone = {
      ...milestone,
      status: "DISPUTED",
      disputeId: dispute.id,
    };
    this.stateService.updateMilestone(updated);
    this.auditLogService.append("dispute.opened", {
      milestoneId,
      disputeId: dispute.id,
      openedBy,
    });
    return dispute;
  }

  addEvidence(disputeId: string, artifact: Omit<EvidenceArtifact, "id" | "submittedAt">): Dispute {
    const dispute = this.stateService.getDispute(disputeId);
    if (!dispute) {
      throw new Error("Dispute not found");
    }
    const enriched: EvidenceArtifact = {
      ...artifact,
      id: randomUUID(),
      submittedAt: new Date(),
    };
    dispute.evidence.push(enriched);
    this.stateService.updateDispute(dispute);
    this.auditLogService.append("dispute.evidence", {
      disputeId,
      artifact: enriched,
    });
    return dispute;
  }

  escalateToArbitrator(disputeId: string): Dispute {
    const dispute = this.stateService.getDispute(disputeId);
    if (!dispute) {
      throw new Error("Dispute not found");
    }
    dispute.status = "ESCALATED";
    this.stateService.updateDispute(dispute);
    this.auditLogService.append("dispute.escalated", { disputeId });
    return dispute;
  }

  resolveDispute(disputeId: string, decision: DisputeDecision, details: string, resolver: string): Dispute {
    const dispute = this.stateService.getDispute(disputeId);
    if (!dispute) {
      throw new Error("Dispute not found");
    }
    dispute.status = "RESOLVED";
    dispute.resolution = {
      decision,
      details,
      resolvedBy: resolver,
      resolvedAt: new Date(),
    };
    this.stateService.updateDispute(dispute);
    const milestone = this.stateService.getMilestone(dispute.milestoneId);
    if (milestone) {
      milestone.status = decision === "release" ? "RELEASED" : "REFUNDED";
      this.stateService.updateMilestone(milestone);
    }
    this.auditLogService.append("dispute.resolved", {
      disputeId,
      decision,
      details,
    });
    return dispute;
  }
}
