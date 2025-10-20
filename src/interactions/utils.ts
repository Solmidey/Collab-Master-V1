import { nanoid } from 'nanoid';

const EXPIRY_MS = 60 * 60 * 1000; // 1 hour

export type InteractionKind = 'approve' | 'deny' | 'viewSummary';

export interface CustomIdPayload {
  id: string;
  kind: InteractionKind;
  requestId: string;
  expiresAt: number;
}

export function buildCustomId(kind: InteractionKind, requestId: string): string {
  const payload: CustomIdPayload = {
    id: nanoid(6),
    kind,
    requestId,
    expiresAt: Date.now() + EXPIRY_MS,
  };
  const encoded = Buffer.from(JSON.stringify(payload)).toString('base64url');
  return `collab:${encoded}`;
}

export function parseCustomId(customId: string): CustomIdPayload | null {
  if (!customId.startsWith('collab:')) return null;
  try {
    const encoded = customId.slice('collab:'.length);
    const decoded = Buffer.from(encoded, 'base64url').toString('utf8');
    const payload = JSON.parse(decoded) as CustomIdPayload;
    if (payload.expiresAt < Date.now()) {
      return null;
    }
    return payload;
  } catch {
    return null;
  }
}
