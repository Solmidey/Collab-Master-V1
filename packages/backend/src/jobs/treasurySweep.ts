import type { TreasuryService } from "../services/treasuryService.js";

export interface TreasurySweepJobDeps {
  treasuryService: TreasuryService;
  hotWalletBalanceFetcher: () => Promise<bigint>;
  hotWalletAddress: string;
  safeAddress: string;
  threshold: bigint;
}

export async function runTreasurySweepJob({
  treasuryService,
  hotWalletBalanceFetcher,
  hotWalletAddress,
  safeAddress,
  threshold,
}: TreasurySweepJobDeps): Promise<void> {
  const balance = await hotWalletBalanceFetcher();
  await treasuryService.queueSweep(safeAddress, hotWalletAddress, balance, threshold);
}
