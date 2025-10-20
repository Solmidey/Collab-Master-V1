import type { CollabRequest, CollabStore } from '../db/types.js';

const COOLDOWN_MS = 24 * 60 * 60 * 1000;

export interface RateLimitCheckResult {
  allowed: boolean;
  message?: string;
  pendingRequest?: CollabRequest;
}

export async function checkSubmissionAllowed(
  store: CollabStore,
  guildId: string,
  userId: string,
): Promise<RateLimitCheckResult> {
  const pending = await store.getPendingByUser(guildId, userId);
  if (pending) {
    return {
      allowed: false,
      message: 'You already have a pending collab request. Please wait for a decision before submitting another.',
      pendingRequest: pending,
    };
  }

  const lastDecision = await store.getLastDecision(guildId, userId);
  if (!lastDecision) {
    return { allowed: true };
  }
  if (!lastDecision.decidedAt) {
    return { allowed: true };
  }
  const elapsed = Date.now() - new Date(lastDecision.decidedAt).getTime();
  if (elapsed < COOLDOWN_MS) {
    const hoursLeft = Math.ceil((COOLDOWN_MS - elapsed) / (60 * 60 * 1000));
    return {
      allowed: false,
      message: `Please wait ${hoursLeft} more hour(s) before submitting another collab request.`,
    };
  }

  return { allowed: true };
}
