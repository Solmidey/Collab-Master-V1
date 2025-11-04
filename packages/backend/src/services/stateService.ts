import { randomUUID } from "node:crypto";

import type { InMemoryDatabase } from "../db/inMemoryDatabase.js";
import type { Deal } from "../models/deal.js";
import type { Milestone } from "../models/milestone.js";
import type { Dispute } from "../models/dispute.js";
import type { BlocklistEntry } from "../models/blocklist.js";
import type { TreasurySweepRecord } from "../models/treasury.js";

export class StateService {
  private readonly deals = new Map<string, Deal>();
  private readonly milestones = new Map<string, Milestone>();
  private readonly disputes = new Map<string, Dispute>();
  private readonly blocklist = new Map<string, BlocklistEntry>();
  private readonly treasury = new Map<string, TreasurySweepRecord>();

  constructor(private readonly db: InMemoryDatabase) {}

  upsertDeal(deal: Deal): Deal {
    const statement = this.db.prepare<[Deal], Deal>("upsert_deal", (record) => {
      this.deals.set(record.id, record);
      return record;
    });
    return statement.run(deal);
  }

  getDeal(id: string): Deal | undefined {
    return this.deals.get(id);
  }

  listDeals(): Deal[] {
    return [...this.deals.values()];
  }

  insertMilestone(milestone: Milestone): Milestone {
    const statement = this.db.prepare<[Milestone], Milestone>("insert_milestone", (record) => {
      this.milestones.set(record.id, record);
      return record;
    });
    return statement.run(milestone);
  }

  updateMilestone(milestone: Milestone): Milestone {
    const statement = this.db.prepare<[Milestone], Milestone>("update_milestone", (record) => {
      this.milestones.set(record.id, record);
      return record;
    });
    return statement.run(milestone);
  }

  getMilestone(id: string): Milestone | undefined {
    return this.milestones.get(id);
  }

  listMilestonesByDeal(dealId: string): Milestone[] {
    return [...this.milestones.values()].filter((record) => record.dealId === dealId);
  }

  openDispute(dispute: Omit<Dispute, "id" | "evidence"> & { evidence?: Dispute["evidence"] }): Dispute {
    const id = randomUUID();
    const record: Dispute = {
      ...dispute,
      id,
      evidence: dispute.evidence ?? [],
    };
    const statement = this.db.prepare<[Dispute], Dispute>("insert_dispute", (entry) => {
      this.disputes.set(entry.id, entry);
      return entry;
    });
    return statement.run(record);
  }

  updateDispute(dispute: Dispute): Dispute {
    const statement = this.db.prepare<[Dispute], Dispute>("update_dispute", (entry) => {
      this.disputes.set(entry.id, entry);
      return entry;
    });
    return statement.run(dispute);
  }

  getDispute(id: string): Dispute | undefined {
    return this.disputes.get(id);
  }

  addBlocklistEntry(entry: Omit<BlocklistEntry, "id" | "createdAt">): BlocklistEntry {
    const record: BlocklistEntry = {
      id: randomUUID(),
      createdAt: new Date(),
      ...entry,
    };
    const statement = this.db.prepare<[BlocklistEntry], BlocklistEntry>("insert_block", (block) => {
      this.blocklist.set(block.id, block);
      return block;
    });
    return statement.run(record);
  }

  isBlocked({ walletAddress, discordId }: { walletAddress?: string; discordId?: string }): boolean {
    const normalizedWallet = walletAddress?.toLowerCase();
    for (const entry of this.blocklist.values()) {
      if (
        (normalizedWallet && entry.walletAddress?.toLowerCase() === normalizedWallet) ||
        (discordId && entry.discordId === discordId)
      ) {
        return true;
      }
    }
    return false;
  }

  createTreasuryRecord(record: Omit<TreasurySweepRecord, "id" | "createdAt" | "status">): TreasurySweepRecord {
    const prepared = this.db.prepare<[TreasurySweepRecord], TreasurySweepRecord>(
      "insert_treasury",
      (entry) => {
        this.treasury.set(entry.id, entry);
        return entry;
      }
    );
    const stored: TreasurySweepRecord = {
      id: randomUUID(),
      createdAt: new Date(),
      status: "PENDING",
      ...record,
    };
    return prepared.run(stored);
  }

  listTreasuryRecords(): TreasurySweepRecord[] {
    return [...this.treasury.values()];
  }
}
