import {
  ActionRowBuilder,
  ChatInputCommandInteraction,
  ModalBuilder,
  SlashCommandBuilder,
  TextInputBuilder,
  TextInputStyle,
} from 'discord.js';

import type { BotContext } from '../lib/context.js';
import { isEligibleMember, isModerator } from '../lib/guard.js';
import { checkSubmissionAllowed } from '../lib/rateLimit.js';
import { SUBMIT_MODAL_ID } from '../interactions/modals.js';
import type { CollabStatus } from '../db/types.js';
import { buildApprovalEmbed } from '../lib/embeds.js';

export const collabCommand = new SlashCommandBuilder()
  .setName('collab')
  .setDescription('Collab Master portal commands')
  .addSubcommand((sub) =>
    sub.setName('submit').setDescription('Submit a new collaboration request.'),
  )
  .addSubcommandGroup((group) =>
    group
      .setName('config')
      .setDescription('Configuration utilities')
      .addSubcommand((sub) =>
        sub.setName('show').setDescription('Show current collab configuration.'),
      ),
  )
  .addSubcommand((sub) =>
    sub
      .setName('list')
      .setDescription('List collab requests by status')
      .addStringOption((option) =>
        option
          .setName('status')
          .setDescription('Filter by status')
          .setRequired(true)
          .addChoices(
            { name: 'Pending', value: 'PENDING' },
            { name: 'Approved', value: 'APPROVED' },
            { name: 'Denied', value: 'DENIED' },
          ),
      )
      .addIntegerOption((option) =>
        option
          .setName('limit')
          .setDescription('Number of results to return (1-50)')
          .setMinValue(1)
          .setMaxValue(50)
          .setRequired(false),
      ),
  )
  .addSubcommand((sub) =>
    sub
      .setName('reannounce')
      .setDescription('Re-send an approved announcement')
      .addStringOption((option) =>
        option.setName('id').setDescription('Request ID').setRequired(true),
      ),
  );

export async function handleCollabCommand(
  interaction: ChatInputCommandInteraction,
  context: BotContext,
): Promise<void> {
  const { config, store, logger } = context;

  if (!interaction.guildId || !interaction.guild) {
    await interaction.reply({
      content: 'This command can only be used within a server.',
      ephemeral: true,
    });
    return;
  }

  const group = interaction.options.getSubcommandGroup(false);
  const subcommand = interaction.options.getSubcommand();

  if (group === 'config') {
    if (subcommand === 'show') {
      const member = interaction.member;
      if (!member || !('roles' in member) || !isModerator(member, config)) {
        await interaction.reply({
          content: 'You do not have permission to view the collab configuration.',
          ephemeral: true,
        });
        return;
      }

      const details = [
        `Mod Review Channel: <#${config.modReviewChannelId}>`,
        `Approved Channel: <#${config.collabsApprovedChannelId}>`,
        config.collabsDeniedLogChannelId
          ? `Denied Log Channel: <#${config.collabsDeniedLogChannelId}>`
          : 'Denied Log Channel: not set',
        `Verified Roles: ${config.verifiedRoleIds.length ? config.verifiedRoleIds.map((id) => `<@&${id}>`).join(', ') : 'none'}`,
        `Moderator Roles: ${config.modRoleIds.length ? config.modRoleIds.map((id) => `<@&${id}>`).join(', ') : 'none'}`,
        config.approvedRoleId ? `Approved Role: <@&${config.approvedRoleId}>` : 'Approved Role: not set',
        `Minimum Member Age: ${config.minMemberDays} day(s)`,
        `Create Review Threads: ${config.createReviewThreads ? 'enabled' : 'disabled'}`,
        `Storage: ${config.supabaseUrl && config.supabaseAnonKey ? 'Supabase' : 'Local JSON file'}`,
      ].join('\n');

      await interaction.reply({ content: details, ephemeral: true });
      return;
    }

    await interaction.reply({ content: 'Unknown config action.', ephemeral: true });
    return;
  }

  switch (subcommand) {
    case 'submit': {
      const member = interaction.member;
      if (!member || !('roles' in member)) {
        await interaction.reply({
          content: 'Unable to verify your membership. Please try again later.',
          ephemeral: true,
        });
        return;
      }

      if (!isEligibleMember(member, config)) {
        await interaction.reply({
          content:
            'You must be a verified member or meet the minimum membership age before submitting a collab request.',
          ephemeral: true,
        });
        return;
      }

      const rateResult = await checkSubmissionAllowed(store, interaction.guildId, interaction.user.id);
      if (!rateResult.allowed) {
        await interaction.reply({
          content: rateResult.message ?? 'You cannot submit a new collab request right now.',
          ephemeral: true,
        });
        return;
      }

      const modal = new ModalBuilder().setTitle('Collab Master Submission').setCustomId(SUBMIT_MODAL_ID);

      const walletInput = new TextInputBuilder()
        .setCustomId('wallet')
        .setLabel('Your Wallet (optional)')
        .setPlaceholder('0x… or sui…')
        .setStyle(TextInputStyle.Short)
        .setRequired(false);

      const projectLinkInput = new TextInputBuilder()
        .setCustomId('project_link')
        .setLabel('Project Link')
        .setPlaceholder('https://example.com/project')
        .setStyle(TextInputStyle.Short)
        .setRequired(true);

      const handleInput = new TextInputBuilder()
        .setCustomId('handle')
        .setLabel('Your X / Farcaster Handle (optional)')
        .setPlaceholder('@example')
        .setStyle(TextInputStyle.Short)
        .setRequired(false);

      const summaryInput = new TextInputBuilder()
        .setCustomId('summary')
        .setLabel('Summary (30-600 characters)')
        .setStyle(TextInputStyle.Paragraph)
        .setRequired(true)
        .setMinLength(30)
        .setMaxLength(600);

      modal.addComponents(
        new ActionRowBuilder<TextInputBuilder>().addComponents(walletInput),
        new ActionRowBuilder<TextInputBuilder>().addComponents(projectLinkInput),
        new ActionRowBuilder<TextInputBuilder>().addComponents(handleInput),
        new ActionRowBuilder<TextInputBuilder>().addComponents(summaryInput),
      );

      await interaction.showModal(modal);
      return;
    }
    case 'list': {
      const member = interaction.member;
      if (!member || !('roles' in member) || !isModerator(member, config)) {
        await interaction.reply({
          content: 'You do not have permission to list collab requests.',
          ephemeral: true,
        });
        return;
      }

      const status = interaction.options.getString('status', true) as CollabStatus;
      const limit = interaction.options.getInteger('limit') ?? 10;
      const requests = await store.listByStatus(interaction.guildId, status, limit);

      if (requests.length === 0) {
        await interaction.reply({
          content: `No collab requests found with status **${status}**.`,
          ephemeral: true,
        });
        return;
      }

      const rows = requests.map((request) => {
        const decided = request.decidedAt
          ? `<t:${Math.floor(new Date(request.decidedAt).getTime() / 1000)}:R>`
          : '—';
        return `• **${request.username}** — ${request.status} — ID: ${request.id} — Decided: ${decided}`;
      });

      await interaction.reply({
        content: rows.join('\n'),
        ephemeral: true,
      });
      return;
    }
    case 'reannounce': {
      const member = interaction.member;
      if (!member || !('roles' in member) || !isModerator(member, config)) {
        await interaction.reply({
          content: 'You do not have permission to re-announce collabs.',
          ephemeral: true,
        });
        return;
      }

      const id = interaction.options.getString('id', true);
      const request = await store.getById(id);
      if (!request || request.status !== 'APPROVED') {
        await interaction.reply({
          content: 'Unable to find an approved collab request with that ID.',
          ephemeral: true,
        });
        return;
      }

      const channel =
        (interaction.guild &&
          (await interaction.guild.channels.fetch(config.collabsApprovedChannelId).catch(() => null))) ||
        (await interaction.client.channels.fetch(config.collabsApprovedChannelId).catch(() => null));
      if (!channel || !channel.isTextBased()) {
        await interaction.reply({
          content: 'Configured approved channel is not accessible.',
          ephemeral: true,
        });
        return;
      }

      await channel.send({ embeds: [buildApprovalEmbed(request, request.moderatorNote)] });

      await interaction.reply({
        content: `Announcement re-posted for request **${id}**.`,
        ephemeral: true,
      });
      logger.info('Re-announced collab', { requestId: id, moderator: interaction.user.id });
      return;
    }
    default:
      await interaction.reply({ content: 'Unknown subcommand.', ephemeral: true });
  }
}
