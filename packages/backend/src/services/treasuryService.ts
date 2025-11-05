import { randomUUID } from "node:crypto";

import type { AuditLogService } from "./auditLogService.js";
import type { StateService } from "./stateService.js";
import type { TreasurySweepRecord } from "../models/treasury.js";

export interface SafeTransactionPayload {
  to: string;
  value: string;
  data: string;
  operation: number;
}

export interface SafeSdkStub {
  prepareTransaction(payload: SafeTransactionPayload): Promise<{ safeTxHash: string }>;
}

export class TreasuryService {
  constructor(
    private readonly stateService: StateService,
    private readonly auditLogService: AuditLogService,
    private readonly safeFactory?: (safeAddress: string) => SafeSdkStub
  ) {}

  async queueSweep(
    safeAddress: string,
    hotWalletAddress: string,
    balance: bigint,
    threshold: bigint
  ): Promise<TreasurySweepRecord | undefined> {
    if (balance <= threshold) {
      return undefined;
    }

    const payload: SafeTransactionPayload = {
      to: hotWalletAddress,
      value: balance.toString(),
      data: "0x",
      operation: 0,
    };

    let safeTxHash = randomUUID();
    if (this.safeFactory) {
      const sdk = this.safeFactory(safeAddress);
      // TODO: integrate Safe transaction builder when service keys are available.
      const result = await sdk.prepareTransaction(payload);
      safeTxHash = result.safeTxHash;
    }

    const record = this.stateService.createTreasuryRecord({
      safeAddress,
      threshold,
      amount: balance,
      transactionPayload: { safeTxHash, payload },
    });
    this.auditLogService.append("treasury.sweep.enqueued", {
      safeAddress,
      hotWalletAddress,
      balance: balance.toString(),
      threshold: threshold.toString(),
      safeTxHash,
    });
    return record;
  }

  listPending(): TreasurySweepRecord[] {
    return this.stateService.listTreasuryRecords().filter((record) => record.status === "PENDING");
  }
}
