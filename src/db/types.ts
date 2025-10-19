export type CollabStatus = 'PENDING' | 'APPROVED' | 'DENIED';

export interface CollabRequest {
  id: string;
  guildId: string;
  userId: string;
  username: string;
  wallet?: string | null;
  projectLink: string;
  handle?: string | null;
  summary: string;
  status: CollabStatus;
  moderatorId?: string | null;
  moderatorNote?: string | null;
  decisionReason?: string | null;
  createdAt: string;
  decidedAt?: string | null;
}

export interface CreateCollabRequest {
  guildId: string;
  userId: string;
  username: string;
  wallet?: string | null;
  projectLink: string;
  handle?: string | null;
  summary: string;
}

export interface UpdateCollabRequest {
  status?: CollabStatus;
  moderatorId?: string | null;
  moderatorNote?: string | null;
  decisionReason?: string | null;
  decidedAt?: string | null;
}

export interface CollabStore {
  create(input: CreateCollabRequest): Promise<CollabRequest>;
  getById(id: string): Promise<CollabRequest | null>;
  getPendingByUser(guildId: string, userId: string): Promise<CollabRequest | null>;
  getLastDecision(guildId: string, userId: string): Promise<CollabRequest | null>;
  listByStatus(
    guildId: string,
    status: CollabStatus,
    limit: number,
    offset?: number,
  ): Promise<CollabRequest[]>;
  update(id: string, patch: UpdateCollabRequest): Promise<CollabRequest | null>;
}
