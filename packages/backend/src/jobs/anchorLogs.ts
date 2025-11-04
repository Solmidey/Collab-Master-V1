import { createHash } from "node:crypto";

import type { AuditLogService } from "../services/auditLogService.js";

export interface AnchorContract {
  anchor(root: string, metadata: string): Promise<{ hash: string }>;
}

export interface AnchorJobDeps {
  auditLogService: AuditLogService;
  anchorContract: AnchorContract;
  limit?: number;
}

function merkleRoot(leaves: string[]): string {
  if (leaves.length === 0) {
    return createHash("sha256").update("empty").digest("hex");
  }
  let level = leaves.map((leaf) => Buffer.from(leaf.replace(/^0x/, ""), "hex"));
  while (level.length > 1) {
    const next: Buffer[] = [];
    for (let i = 0; i < level.length; i += 2) {
      const left = level[i];
      const right = level[i + 1] ?? left;
      const hash = createHash("sha256").update(Buffer.concat([left, right])).digest();
      next.push(hash);
    }
    level = next;
  }
  return `0x${level[0].toString("hex")}`;
}

export async function anchorLogsToChain({
  auditLogService,
  anchorContract,
  limit = 50,
}: AnchorJobDeps): Promise<string> {
  const logs = auditLogService.list().slice(-limit);
  const leaves = logs.map((log) =>
    createHash("sha256").update(JSON.stringify({ id: log.id, type: log.type, payload: log.payload })).digest("hex")
  );
  const root = merkleRoot(leaves);
  const metadata = createHash("sha256").update(String(Date.now())).digest("hex");
  const tx = await anchorContract.anchor(root, `0x${metadata}`);
  auditLogService.append("audit.anchor", { root, metadata: `0x${metadata}`, txHash: tx.hash });
  return tx.hash;
}
