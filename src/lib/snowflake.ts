export function sanitizeSnowflake(raw: string): string {
  const trimmed = raw.trim();
  if (!trimmed) {
    return '';
  }

  const urlCandidate = extractFromUrl(trimmed);
  if (urlCandidate) {
    return urlCandidate;
  }

  const match = trimmed.match(/\d{15,20}/g);
  if (match && match.length > 0) {
    return match[match.length - 1];
  }

  const digitsOnly = trimmed.replace(/\D/g, '');
  if (digitsOnly.length >= 15 && digitsOnly.length <= 20) {
    return digitsOnly;
  }

  return '';
}

export function sanitizeSnowflakeArray(raw: string): string[] {
  return raw
    .split(',')
    .map((value) => sanitizeSnowflake(value))
    .filter((value) => value.length > 0);
}

export function sanitizeOptionalSnowflake(raw: string | undefined): string | undefined {
  if (!raw) {
    return undefined;
  }
  const sanitized = sanitizeSnowflake(raw);
  return sanitized.length > 0 ? sanitized : undefined;
}

function extractFromUrl(candidate: string): string | undefined {
  if (!candidate.startsWith('http')) {
    return undefined;
  }

  try {
    const url = new URL(candidate);
    const segments = url.pathname.split('/').filter(Boolean);
    const lastSegment = segments[segments.length - 1];
    if (lastSegment && /\d{15,20}/.test(lastSegment)) {
      return lastSegment;
    }
  } catch {
    // Ignore URL parsing errors and fall back to other strategies.
  }

  return undefined;
}
