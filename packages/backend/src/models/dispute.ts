export type DisputeStatus = "OPEN" | "ESCALATED" | "RESOLVED";

export interface EvidenceArtifact {
  id: string;
  ipfsHash: string;
  checksum: string;
  submittedBy: string;
  submittedAt: Date;
  description?: string;
}

export interface Dispute {
  id: string;
  milestoneId: string;
  openedBy: string;
  status: DisputeStatus;
  evidence: EvidenceArtifact[];
  resolution?: {
    decision: "release" | "refund" | "split";
    details: string;
    resolvedBy: string;
    resolvedAt: Date;
  };
}
