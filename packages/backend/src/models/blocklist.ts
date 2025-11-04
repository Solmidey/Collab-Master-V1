export interface BlocklistEntry {
  id: string;
  walletAddress?: string;
  discordId?: string;
  reason?: string;
  createdAt: Date;
}
