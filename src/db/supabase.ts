import { createClient, PostgrestError } from '@supabase/supabase-js';

import type {
  CollabRequest,
  CollabStatus,
  CollabStore,
  CreateCollabRequest,
  UpdateCollabRequest,
} from './types.js';

interface SupabaseConfig {
  url: string;
  key: string;
}

const TABLE = 'collab_requests';

function mapRow(row: Record<string, any>): CollabRequest {
  return {
    id: row.id,
    guildId: row.guild_id,
    userId: row.user_id,
    username: row.username,
    wallet: row.wallet,
    projectLink: row.project_link,
    handle: row.handle,
    summary: row.summary,
    status: row.status as CollabStatus,
    moderatorId: row.moderator_id,
    moderatorNote: row.moderator_note,
    decisionReason: row.decision_reason,
    createdAt: row.created_at,
    decidedAt: row.decided_at,
  };
}

async function withRetry<T>(fn: () => Promise<T>, attempts = 3): Promise<T> {
  let lastError: unknown;
  for (let i = 0; i < attempts; i += 1) {
    try {
      return await fn();
    } catch (error) {
      lastError = error;
      await new Promise((resolve) => setTimeout(resolve, (i + 1) * 200));
    }
  }
  throw lastError;
}

export class SupabaseStore implements CollabStore {
  private readonly client;

  constructor(config: SupabaseConfig) {
    this.client = createClient(config.url, config.key, {
      auth: { persistSession: false },
    });
  }

  async create(input: CreateCollabRequest): Promise<CollabRequest> {
    const result = await withRetry(async () =>
      this.client
        .from(TABLE)
        .insert({
          guild_id: input.guildId,
          user_id: input.userId,
          username: input.username,
          wallet: input.wallet,
          project_link: input.projectLink,
          handle: input.handle,
          summary: input.summary,
          status: 'PENDING',
        })
        .select()
        .single(),
    );

    if (result.error) {
      throw new Error(`Supabase insert failed: ${formatError(result.error)}`);
    }

    return mapRow(result.data);
  }

  async getById(id: string): Promise<CollabRequest | null> {
    const result = await withRetry(async () =>
      this.client.from(TABLE).select('*').eq('id', id).maybeSingle(),
    );
    if (result.error) {
      throw new Error(`Supabase select failed: ${formatError(result.error)}`);
    }
    return result.data ? mapRow(result.data) : null;
  }

  async getPendingByUser(guildId: string, userId: string): Promise<CollabRequest | null> {
    const result = await withRetry(async () =>
      this.client
        .from(TABLE)
        .select('*')
        .eq('guild_id', guildId)
        .eq('user_id', userId)
        .eq('status', 'PENDING')
        .order('created_at', { ascending: false })
        .maybeSingle(),
    );
    if (result.error && result.error.code !== 'PGRST116') {
      throw new Error(`Supabase select failed: ${formatError(result.error)}`);
    }
    return result.data ? mapRow(result.data) : null;
  }

  async getLastDecision(guildId: string, userId: string): Promise<CollabRequest | null> {
    const result = await withRetry(async () =>
      this.client
        .from(TABLE)
        .select('*')
        .eq('guild_id', guildId)
        .eq('user_id', userId)
        .neq('status', 'PENDING')
        .order('decided_at', { ascending: false, nullsFirst: false })
        .limit(1)
        .maybeSingle(),
    );
    if (result.error && result.error.code !== 'PGRST116') {
      throw new Error(`Supabase select failed: ${formatError(result.error)}`);
    }
    return result.data ? mapRow(result.data) : null;
  }

  async listByStatus(
    guildId: string,
    status: CollabStatus,
    limit: number,
    offset = 0,
  ): Promise<CollabRequest[]> {
    const result = await withRetry(async () =>
      this.client
        .from(TABLE)
        .select('*')
        .eq('guild_id', guildId)
        .eq('status', status)
        .order('created_at', { ascending: false })
        .range(offset, offset + limit - 1),
    );
    if (result.error) {
      throw new Error(`Supabase select failed: ${formatError(result.error)}`);
    }
    return (result.data ?? []).map(mapRow);
  }

  async update(id: string, patch: UpdateCollabRequest): Promise<CollabRequest | null> {
    const payload: Record<string, unknown> = {};
    if (patch.status) payload.status = patch.status;
    if (patch.moderatorId !== undefined) payload.moderator_id = patch.moderatorId;
    if (patch.moderatorNote !== undefined) payload.moderator_note = patch.moderatorNote;
    if (patch.decisionReason !== undefined) payload.decision_reason = patch.decisionReason;
    if (patch.decidedAt !== undefined) payload.decided_at = patch.decidedAt;

    const result = await withRetry(async () =>
      this.client.from(TABLE).update(payload).eq('id', id).select('*').maybeSingle(),
    );
    if (result.error) {
      throw new Error(`Supabase update failed: ${formatError(result.error)}`);
    }
    return result.data ? mapRow(result.data) : null;
  }
}

function formatError(error: PostgrestError): string {
  return `${error.message} (${error.code})`;
}
