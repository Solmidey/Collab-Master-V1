import {
  ActionRowBuilder,
  ButtonBuilder,
  ChannelType,
  ComponentType,
  ModalSubmitInteraction,
} from 'discord.js';

import type { BotContext } from '../lib/context.js';
import {
  buildApprovalEmbed,
  buildDecisionButtons,
  buildDeniedLogEmbed,
  buildReviewEmbed,
  buildSummaryButtonRow,
} from '../lib/embeds.js';
import { isModerator } from '../lib/guard.js';
import type { CollabRequest } from '../db/types.js';
import { buildCustomId } from './utils.js';

export const SUBMIT_MODAL_ID = 'collab:modal:submit';
export const APPROVE_MODAL_PREFIX = 'collab:modal:approve:';
export const DENY_MODAL_PREFIX = 'collab:modal:deny:';

export async function handleModalSubmit(
  interaction: ModalSubmitInteraction,
  context: BotContext,
): Promise<void> {
  if (interaction.customId === SUBMIT_MODAL_ID) {
    await handleSubmitModal(interaction, context);
    return;
  }

  if (interaction.customId.startsWith(APPROVE_MODAL_PREFIX)) {
    await handleApproveModal(interaction, context);
    return;
  }

  if (interaction.customId.startsWith(DENY_MODAL_PREFIX)) {
    await handleDenyModal(interaction, context);
  }
}

async function handleSubmitModal(interaction: ModalSubmitInteraction, context: BotContext) {
  const { store, config, logger } = context;

  if (!interaction.guildId || !interaction.guild) {
    await interaction.reply({
      content: 'Collab requests can only be submitted from within a server.',
      ephemeral: true,
    });
    return;
  }

  const wallet = sanitizeOptional(interaction.fields.getTextInputValue('wallet'));
  const projectLink = sanitizeRequired(interaction.fields.getTextInputValue('project_link'));
  const handle = sanitizeOptional(interaction.fields.getTextInputValue('handle'));
  const summary = sanitizeRequired(interaction.fields.getTextInputValue('summary'));

  if (!isValidUrl(projectLink)) {
    await interaction.reply({
      content: 'Please provide a valid project link (must start with http or https).',
      ephemeral: true,
    });
    return;
  }

  if (summary.length < 30 || summary.length > 600) {
    await interaction.reply({
      content: 'Summary must be between 30 and 600 characters.',
      ephemeral: true,
    });
    return;
  }

  const request = await store.create({
    guildId: interaction.guildId,
    userId: interaction.user.id,
    username: interaction.user.tag,
    wallet,
    projectLink,
    handle,
    summary,
  });

  const reviewChannel = await interaction.client.channels
    .fetch(config.modReviewChannelId)
    .catch((error) => {
      logger.error('Failed to fetch review channel for collab submission', {
        channelId: config.modReviewChannelId,
        error: error instanceof Error ? error.message : String(error),
      });
      return null;
    });

  if (!reviewChannel || !reviewChannel.isTextBased()) {
    await interaction.reply({
      content: 'Collab request saved, but the review channel could not be reached. Please contact a moderator.',
      ephemeral: true,
    });
    logger.error('Failed to post collab request to review channel', {
      requestId: request.id,
    });
    return;
  }

  const approveId = buildCustomId('approve', request.id);
  const denyId = buildCustomId('deny', request.id);
  const viewSummaryId = buildCustomId('viewSummary', request.id);

  const embed = buildReviewEmbed({ request });
  const components = [...buildDecisionButtons(approveId, denyId)];
  if (request.summary.length > 1024) {
    components.push(buildSummaryButtonRow(request.id, viewSummaryId));
  }

  const message = await reviewChannel.send({ embeds: [embed], components });

  if (config.createReviewThreads && reviewChannel.type === ChannelType.GuildText) {
    const shortId = request.id.slice(0, 6);
    await message
      .startThread({
        name: `collab-${shortId}-${interaction.user.username}`.toLowerCase().replace(/[^a-z0-9-]/g, ''),
        autoArchiveDuration: 1440,
        type: ChannelType.PrivateThread,
        reason: 'Auto-collab review thread',
      })
      .catch((error) => {
        logger.warn('Failed to create review thread', {
          requestId: request.id,
          error: error instanceof Error ? error.message : String(error),
        });
      });
  }

  await interaction.reply({
    content: 'Your collab request was submitted for moderator review. Thank you!',
    ephemeral: true,
  });

  logger.info('Collab request submitted', {
    requestId: request.id,
    userId: interaction.user.id,
  });
}

async function handleApproveModal(interaction: ModalSubmitInteraction, context: BotContext) {
  const { store, config, logger } = context;
  const [requestId, messageId] = parseDecisionModalId(interaction.customId, APPROVE_MODAL_PREFIX);

  if (!interaction.member || !('roles' in interaction.member) || !isModerator(interaction.member, config)) {
    await interaction.reply({ content: 'You do not have permission to approve collabs.', ephemeral: true });
    return;
  }

  const note = sanitizeOptional(interaction.fields.getTextInputValue('note'));

  const request = await store.getById(requestId);
  if (!request) {
    await interaction.reply({ content: 'Request could not be found.', ephemeral: true });
    return;
  }

  if (request.status !== 'PENDING') {
    await interaction.reply({
      content: `This request has already been processed (${request.status}).`,
      ephemeral: true,
    });
    return;
  }

  const decidedAt = new Date().toISOString();
  const updated = await store.update(requestId, {
    status: 'APPROVED',
    moderatorId: interaction.user.id,
    moderatorNote: note ?? null,
    decidedAt,
  });

  if (!updated) {
    await interaction.reply({ content: 'Failed to update the request.', ephemeral: true });
    return;
  }

  await finalizeDecision(interaction, updated, messageId);

  const approvedChannel = await interaction.client.channels
    .fetch(config.collabsApprovedChannelId)
    .catch((error) => {
      logger.warn('Failed to fetch approved announcement channel', {
        channelId: config.collabsApprovedChannelId,
        error: error instanceof Error ? error.message : String(error),
      });
      return null;
    });
  if (approvedChannel && approvedChannel.isTextBased()) {
    await approvedChannel.send({ embeds: [buildApprovalEmbed(updated, note)] });
  }

  const requester = await interaction.client.users.fetch(updated.userId).catch(() => null);
  if (requester) {
    await requester
      .send(
        `✅ Your collab request has been approved!${
          note ? `\n\nModerator note: ${note}` : ''
        }\n\nWe will reach out with next steps soon.`,
      )
      .catch(() => {
        logger.warn('Failed to DM requester about approval', { requestId: updated.id });
      });
  }

  if (config.approvedRoleId) {
    const guild = interaction.guild ?? (interaction.guildId ? await interaction.client.guilds.fetch(interaction.guildId) : null);
    if (guild) {
      const member = await guild.members.fetch(updated.userId).catch(() => null);
      if (member && !member.roles.cache.has(config.approvedRoleId)) {
        await member.roles.add(config.approvedRoleId).catch((error) => {
          logger.warn('Failed to assign approved role', {
            requestId: updated.id,
            error: error instanceof Error ? error.message : String(error),
          });
        });
      }
    }
  }

  await interaction.reply({
    content: `Approved collab request ${updated.id}.`,
    ephemeral: true,
  });

  logger.info('Collab request approved', {
    requestId: updated.id,
    moderatorId: interaction.user.id,
  });
}

async function handleDenyModal(interaction: ModalSubmitInteraction, context: BotContext) {
  const { store, config, logger } = context;
  const [requestId, messageId] = parseDecisionModalId(interaction.customId, DENY_MODAL_PREFIX);

  if (!interaction.member || !('roles' in interaction.member) || !isModerator(interaction.member, config)) {
    await interaction.reply({ content: 'You do not have permission to deny collabs.', ephemeral: true });
    return;
  }

  const reason = sanitizeRequired(interaction.fields.getTextInputValue('reason'));

  const request = await store.getById(requestId);
  if (!request) {
    await interaction.reply({ content: 'Request could not be found.', ephemeral: true });
    return;
  }

  if (request.status !== 'PENDING') {
    await interaction.reply({
      content: `This request has already been processed (${request.status}).`,
      ephemeral: true,
    });
    return;
  }

  const decidedAt = new Date().toISOString();
  const updated = await store.update(requestId, {
    status: 'DENIED',
    moderatorId: interaction.user.id,
    decisionReason: reason,
    decidedAt,
  });

  if (!updated) {
    await interaction.reply({ content: 'Failed to update the request.', ephemeral: true });
    return;
  }

  await finalizeDecision(interaction, updated, messageId);

  const requester = await interaction.client.users.fetch(updated.userId).catch(() => null);
  if (requester) {
    await requester
      .send(`❌ Your collab request was denied.\n\nReason: ${reason}`)
      .catch(() => {
        logger.warn('Failed to DM requester about denial', { requestId: updated.id });
      });
  }

  if (config.collabsDeniedLogChannelId) {
    const deniedChannel = await interaction.client.channels.fetch(config.collabsDeniedLogChannelId).catch(() => null);
    if (deniedChannel && deniedChannel.isTextBased()) {
      await deniedChannel.send({ embeds: [buildDeniedLogEmbed(updated, reason)] });
    }
  }

  await interaction.reply({
    content: `Denied collab request ${updated.id}.`,
    ephemeral: true,
  });

  logger.info('Collab request denied', {
    requestId: updated.id,
    moderatorId: interaction.user.id,
  });
}

function sanitizeOptional(value: string | null | undefined): string | null {
  if (!value) return null;
  return sanitizeRequired(value);
}

function sanitizeRequired(value: string): string {
  return value.trim().replace(/[`\u0000-\u001f]/g, '').replace(/@(everyone|here)/gi, '@\u200b$1');
}

function isValidUrl(value: string): boolean {
  try {
    const url = new URL(value);
    return url.protocol === 'http:' || url.protocol === 'https:';
  } catch {
    return false;
  }
}

async function finalizeDecision(
  interaction: ModalSubmitInteraction,
  request: CollabRequest,
  messageId: string | null,
): Promise<void> {
  if (!messageId) return;
  if (!interaction.channelId) return;
  const channel = await interaction.client.channels.fetch(interaction.channelId).catch(() => null);
  if (!channel || !channel.isTextBased()) return;

  const message = await channel.messages.fetch(messageId).catch(() => null);
  if (!message) return;

  const components = message.components.map((row) => {
    const rowBuilder = new ActionRowBuilder<ButtonBuilder>();
    row.components.forEach((component) => {
      if (component.type !== ComponentType.Button) return;
      const button = ButtonBuilder.from(component).setDisabled(true);
      rowBuilder.addComponents(button);
    });
    return rowBuilder;
  });

  const embed = buildReviewEmbed({ request });
  await message.edit({ embeds: [embed], components: components.filter(Boolean) as ActionRowBuilder<ButtonBuilder>[] });
}

function parseDecisionModalId(customId: string, prefix: string): [string, string | null] {
  const raw = customId.slice(prefix.length);
  const [requestId, messageId] = raw.split(':');
  return [requestId, messageId || null];
}
