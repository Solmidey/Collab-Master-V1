import 'dotenv/config';

import { Logger, logger } from './lib/logger.js';

export interface BotConfig {
  token: string;
  clientId: string;
  modReviewChannelId: string;
  collabsApprovedChannelId: string;
  collabsDeniedLogChannelId?: string;
  verifiedRoleIds: string[];
  modRoleIds: string[];
  approvedRoleId?: string;
  minMemberDays: number;
  createReviewThreads: boolean;
  supabaseUrl?: string;
  supabaseAnonKey?: string;
  dataFilePath: string;
  unverifiedDepositCapWei: bigint;
  refundConfirmThresholdWei: bigint;
  sweepThresholdWei: bigint;
  requireSafe: boolean;
}

function getEnvArray(key: string): string[] {
  const raw = process.env[key];
  if (!raw) return [];
  return raw
    .split(',')
    .map((value) => value.trim())
    .filter(Boolean);
}

function getBooleanEnv(key: string, defaultValue: boolean): boolean {
  const raw = process.env[key];
  if (!raw) return defaultValue;
  return ['1', 'true', 'yes', 'on'].includes(raw.toLowerCase());
}

function getBigIntEnv(key: string, defaultValue: bigint): bigint {
  const raw = process.env[key];
  if (!raw) return defaultValue;
  try {
    return BigInt(raw);
  } catch (error) {
    throw new Error(`Invalid bigint env value for ${key}: ${raw}`);
  }
}

function required(key: string, log: Logger): string {
  const value = process.env[key];
  if (!value) {
    log.warn(`Missing required environment variable: ${key}`);
    throw new Error(`Missing required environment variable: ${key}`);
  }
  return value;
}

export function loadConfig(log: Logger = logger): BotConfig {
  const token = required('DISCORD_TOKEN', log);
  const clientId = required('DISCORD_CLIENT_ID', log);
  const modReviewChannelId = required('MOD_REVIEW_CHANNEL_ID', log);
  const collabsApprovedChannelId = required('COLLABS_APPROVED_CHANNEL_ID', log);

  const config: BotConfig = {
    token,
    clientId,
    modReviewChannelId,
    collabsApprovedChannelId,
    collabsDeniedLogChannelId: process.env.COLLABS_DENIED_LOG_CHANNEL_ID,
    verifiedRoleIds: getEnvArray('VERIFIED_ROLE_IDS'),
    modRoleIds: getEnvArray('MOD_ROLE_IDS'),
    approvedRoleId: process.env.APPROVED_ROLE_ID,
    minMemberDays: Number.parseInt(process.env.MIN_MEMBER_DAYS ?? '3', 10),
    createReviewThreads: getBooleanEnv('CREATE_REVIEW_THREADS', false),
    supabaseUrl: process.env.SUPABASE_URL,
    supabaseAnonKey: process.env.SUPABASE_ANON_KEY,
    dataFilePath: new URL('../data/collabs.json', import.meta.url).pathname,
    unverifiedDepositCapWei: getBigIntEnv('UNVERIFIED_DEPOSIT_CAP_WEI', 0n),
    refundConfirmThresholdWei: getBigIntEnv('REFUND_CONFIRM_THRESHOLD_WEI', 0n),
    sweepThresholdWei: getBigIntEnv('SWEEP_THRESHOLD_WEI', 0n),
    requireSafe: getBooleanEnv('ESCROW_REQUIRE_SAFE', false),
  };

  if (Number.isNaN(config.minMemberDays) || config.minMemberDays < 0) {
    config.minMemberDays = 3;
  }

  return config;
}
