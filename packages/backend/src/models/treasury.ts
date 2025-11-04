export interface TreasurySweepRecord {
  id: string;
  createdAt: Date;
  safeAddress: string;
  threshold: bigint;
  amount: bigint;
  transactionPayload: Record<string, unknown>;
  status: "PENDING" | "EXECUTED";
}
