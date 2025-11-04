export type MilestoneStatus =
  | "PENDING"
  | "ACCEPTED"
  | "RELEASED"
  | "REFUNDED"
  | "DISPUTED";

export type AutoReleaseCondition = "NONE" | "HASH_MATCH" | "TESTS_PASS";

export interface Milestone {
  id: string;
  dealId: string;
  amount: bigint;
  recipients: string[];
  deadline: Date;
  acceptedAt?: Date;
  status: MilestoneStatus;
  autoReleaseCondition: AutoReleaseCondition;
  deliverableIpfsHash?: string;
  deliverableChecksum?: string;
  expectedChecksum?: string;
  disputeId?: string;
}
