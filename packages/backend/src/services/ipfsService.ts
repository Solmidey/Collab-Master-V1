import { createHash } from "node:crypto";

export interface PinResult {
  cid: string;
  checksum: string;
}

export class IpfsService {
  async pinToIpfs(buffer: Buffer): Promise<PinResult> {
    // TODO: integrate with production pinning provider.
    const checksum = createHash("sha256").update(buffer).digest("hex");
    const cid = `bafy${checksum.slice(0, 10)}`;
    return { cid, checksum };
  }
}
