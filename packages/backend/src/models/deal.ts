export interface Deal {
  id: string;
  guildId: string;
  buyerDiscordId: string;
  sellerDiscordId: string;
  escrowAddress: string;
  escrowChainId: number;
  requiredSigners: string[];
  controllerSafe?: string;
  refundWindowSeconds: number;
  blockRefundValueThreshold: bigint;
  milestones: string[];
}
