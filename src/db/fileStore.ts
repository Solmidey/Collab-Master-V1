import { randomUUID } from 'node:crypto';
import { promises as fs } from 'node:fs';
import path from 'node:path';

import type {
  CollabRequest,
  CollabStatus,
  CollabStore,
  CreateCollabRequest,
  UpdateCollabRequest,
} from './types.js';

const FILE_LOCK = new Map<string, Promise<void>>();

async function ensureFile(filePath: string): Promise<void> {
  try {
    await fs.access(filePath);
  } catch {
    await fs.mkdir(path.dirname(filePath), { recursive: true });
    await fs.writeFile(filePath, '[]', 'utf8');
  }
}

async function withLock<T>(filePath: string, action: () => Promise<T>): Promise<T> {
  const previous = FILE_LOCK.get(filePath) ?? Promise.resolve();
  let release: () => void;
  const current = new Promise<void>((resolve) => {
    release = resolve;
  });
  FILE_LOCK.set(filePath, previous.then(() => current));

  try {
    await previous;
    const result = await action();
    return result;
  } finally {
    release!();
    if (FILE_LOCK.get(filePath) === current) {
      FILE_LOCK.delete(filePath);
    }
  }
}

export class FileStore implements CollabStore {
  constructor(private readonly filePath: string) {}

  async create(input: CreateCollabRequest): Promise<CollabRequest> {
    await ensureFile(this.filePath);
    return withLock(this.filePath, async () => {
      const requests = await this.readAll();
      const now = new Date().toISOString();
      const request: CollabRequest = {
        id: randomUUID(),
        guildId: input.guildId,
        userId: input.userId,
        username: input.username,
        wallet: input.wallet ?? null,
        projectLink: input.projectLink,
        handle: input.handle ?? null,
        summary: input.summary,
        status: 'PENDING',
        moderatorId: null,
        moderatorNote: null,
        decisionReason: null,
        createdAt: now,
        decidedAt: null,
      };
      requests.push(request);
      await this.saveAll(requests);
      return request;
    });
  }

  async getById(id: string): Promise<CollabRequest | null> {
    const requests = await this.readAll();
    return requests.find((item) => item.id === id) ?? null;
  }

  async getPendingByUser(guildId: string, userId: string): Promise<CollabRequest | null> {
    const requests = await this.readAll();
    return (
      requests
        .filter((item) => item.guildId === guildId && item.userId === userId && item.status === 'PENDING')
        .sort((a, b) => (a.createdAt > b.createdAt ? -1 : 1))[0] ?? null
    );
  }

  async getLastDecision(guildId: string, userId: string): Promise<CollabRequest | null> {
    const requests = await this.readAll();
    return (
      requests
        .filter((item) => item.guildId === guildId && item.userId === userId && item.status !== 'PENDING')
        .sort((a, b) => itemTime(b) - itemTime(a))[0] ?? null
    );
  }

  async listByStatus(
    guildId: string,
    status: CollabStatus,
    limit: number,
    offset = 0,
  ): Promise<CollabRequest[]> {
    const requests = await this.readAll();
    return requests
      .filter((item) => item.guildId === guildId && item.status === status)
      .sort((a, b) => new Date(b.createdAt).getTime() - new Date(a.createdAt).getTime())
      .slice(offset, offset + limit);
  }

  async update(id: string, patch: UpdateCollabRequest): Promise<CollabRequest | null> {
    await ensureFile(this.filePath);
    return withLock(this.filePath, async () => {
      const requests = await this.readAll();
      const index = requests.findIndex((item) => item.id === id);
      if (index === -1) return null;

      const existing = requests[index];
      const updated: CollabRequest = {
        ...existing,
        status: patch.status ?? existing.status,
        moderatorId: patch.moderatorId ?? existing.moderatorId ?? null,
        moderatorNote: patch.moderatorNote ?? existing.moderatorNote ?? null,
        decisionReason: patch.decisionReason ?? existing.decisionReason ?? null,
        decidedAt: patch.decidedAt ?? existing.decidedAt ?? null,
      };
      requests[index] = updated;
      await this.saveAll(requests);
      return updated;
    });
  }

  private async readAll(): Promise<CollabRequest[]> {
    await ensureFile(this.filePath);
    const raw = await fs.readFile(this.filePath, 'utf8');
    return JSON.parse(raw) as CollabRequest[];
  }

  private async saveAll(requests: CollabRequest[]): Promise<void> {
    await fs.writeFile(this.filePath, JSON.stringify(requests, null, 2), 'utf8');
  }
}

function itemTime(request: CollabRequest): number {
  return request.decidedAt ? new Date(request.decidedAt).getTime() : new Date(request.createdAt).getTime();
}
