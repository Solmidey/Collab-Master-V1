export interface AuditLogRecord {
  id: string;
  type: string;
  payload: Record<string, unknown>;
  createdAt: Date;
  txHash?: string;
}
