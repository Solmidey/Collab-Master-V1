import { randomUUID } from "node:crypto";

import type { AuditLogRecord } from "../models/auditLog.js";
import { InMemoryDatabase } from "../db/inMemoryDatabase.js";

export class AuditLogService {
  private readonly records: AuditLogRecord[] = [];

  constructor(private readonly db: InMemoryDatabase) {}

  append(type: string, payload: Record<string, unknown>): AuditLogRecord {
    const statement = this.db.prepare<[AuditLogRecord], AuditLogRecord>(
      "insert_audit_log",
      (record) => {
        this.records.push(record);
        return record;
      }
    );

    const record: AuditLogRecord = {
      id: randomUUID(),
      type,
      payload,
      createdAt: new Date(),
    };

    return statement.run(record);
  }

  list(): AuditLogRecord[] {
    return [...this.records];
  }

  attachTxHash(id: string, txHash: string): void {
    const statement = this.db.prepare<[string, string], void>(
      "update_audit_log_tx",
      (recordId, hash) => {
        const record = this.records.find((entry) => entry.id === recordId);
        if (record) {
          record.txHash = hash;
        }
      }
    );
    statement.run(id, txHash);
  }
}
