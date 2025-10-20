import { GuildMember, PermissionFlagsBits } from 'discord.js';

import type { BotConfig } from '../config.js';

export function isEligibleMember(member: GuildMember, config: BotConfig): boolean {
  if (config.verifiedRoleIds.some((roleId) => member.roles.cache.has(roleId))) {
    return true;
  }

  const joinedAt = member.joinedAt ?? member.joinedTimestamp ? new Date(member.joinedTimestamp ?? 0) : null;
  if (!joinedAt) return false;
  const ageMs = Date.now() - joinedAt.getTime();
  const minMs = config.minMemberDays * 24 * 60 * 60 * 1000;
  return ageMs >= minMs;
}

export function isModerator(member: GuildMember, config: BotConfig): boolean {
  if (member.permissions.has(PermissionFlagsBits.ManageGuild)) {
    return true;
  }
  return config.modRoleIds.some((roleId) => member.roles.cache.has(roleId));
}
