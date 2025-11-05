import {
  ActionRowBuilder,
  APIEmbedField,
  ButtonBuilder,
  ButtonStyle,
  EmbedBuilder,
} from 'discord.js';

import type { CollabRequest } from '../db/types.js';

const ACCENT_COLOR = 0x3174f1;
const AUTHOR_NAME = 'Collab Master – Portal';

export interface ReviewEmbedOptions {
  request: CollabRequest;
  includeFullSummary?: boolean;
}

export function buildReviewEmbed({ request, includeFullSummary = false }: ReviewEmbedOptions): EmbedBuilder {
  const fields: APIEmbedField[] = [
    {
      name: 'Wallet',
      value: request.wallet || '—',
      inline: true,
    },
    {
      name: 'Project Link',
      value: `[Open Project](${request.projectLink})`,
      inline: true,
    },
    {
      name: 'Handle',
      value: request.handle || '—',
      inline: true,
    },
    {
      name: 'Summary',
      value: includeFullSummary ? request.summary : truncateSummary(request.summary),
    },
    {
      name: 'Created',
      value: `<t:${Math.floor(new Date(request.createdAt).getTime() / 1000)}:f>`,
      inline: true,
    },
    {
      name: 'Status',
      value: request.status,
      inline: true,
    },
  ];

  if (request.moderatorNote) {
    fields.push({ name: 'Moderator Note', value: request.moderatorNote });
  }

  if (request.decisionReason) {
    fields.push({ name: 'Decision Reason', value: request.decisionReason });
  }

  if (request.decidedAt) {
    fields.push({
      name: 'Decided',
      value: `<t:${Math.floor(new Date(request.decidedAt).getTime() / 1000)}:f>`,
      inline: true,
    });
  }

  return new EmbedBuilder()
    .setColor(ACCENT_COLOR)
    .setAuthor({ name: AUTHOR_NAME })
    .setTitle(`New Collab Request – ${request.username}`)
    .setDescription(`Requester: <@${request.userId}>`)
    .setFooter({
      text: `Request ID: ${request.id} • Created ${new Date(request.createdAt).toLocaleString()}`,
    })
    .setFields(fields);
}

export function buildApprovalEmbed(request: CollabRequest, note?: string | null): EmbedBuilder {
  const embed = new EmbedBuilder()
    .setColor(ACCENT_COLOR)
    .setAuthor({ name: AUTHOR_NAME })
    .setTitle('✅ Collab approved')
    .setDescription(`Approved request from <@${request.userId}>`)
    .addFields(
      { name: 'Project Link', value: `[View Project](${request.projectLink})` },
      { name: 'Summary', value: truncateSummary(request.summary, 1024, false) },
    )
    .setFooter({ text: `Request ID: ${request.id}` });

  if (note) {
    embed.addFields({ name: 'Moderator Note', value: note });
  }

  return embed;
}

export function buildDeniedLogEmbed(
  request: CollabRequest,
  reason: string,
): EmbedBuilder {
  return new EmbedBuilder()
    .setColor(0xeb5a46)
    .setAuthor({ name: AUTHOR_NAME })
    .setTitle('Collab request denied')
    .setDescription(`Request from <@${request.userId}> was denied.`)
    .addFields(
      { name: 'Project Link', value: `[View Project](${request.projectLink})` },
      { name: 'Reason', value: reason },
    )
    .setFooter({ text: `Request ID: ${request.id}` });
}

export function buildSummaryButtonRow(
  _requestId: string,
  customId: string,
): ActionRowBuilder<ButtonBuilder> {
  return new ActionRowBuilder<ButtonBuilder>().addComponents(
    new ButtonBuilder()
      .setCustomId(customId)
      .setStyle(ButtonStyle.Secondary)
      .setLabel('View full summary'),
  );
}

export function buildDecisionButtons(
  approveId: string,
  denyId: string,
): ActionRowBuilder<ButtonBuilder>[] {
  const approveRow = new ActionRowBuilder<ButtonBuilder>().addComponents(
    new ButtonBuilder().setCustomId(approveId).setLabel('Approve').setStyle(ButtonStyle.Success),
    new ButtonBuilder().setCustomId(denyId).setLabel('Deny').setStyle(ButtonStyle.Danger),
  );

  return [approveRow];
}

function truncateSummary(summary: string, maxLength = 1024, appendEllipsis = true): string {
  if (summary.length <= maxLength) {
    return summary;
  }
  const truncated = summary.slice(0, maxLength - 3);
  return appendEllipsis ? `${truncated}...` : truncated;
}
