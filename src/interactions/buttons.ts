import {
  ActionRowBuilder,
  ButtonInteraction,
  ModalBuilder,
  TextInputBuilder,
  TextInputStyle,
} from 'discord.js';

import type { BotContext } from '../lib/context.js';
import { isModerator } from '../lib/guard.js';
import { buildReviewEmbed } from '../lib/embeds.js';
import { APPROVE_MODAL_PREFIX, DENY_MODAL_PREFIX } from './modals.js';
import { parseCustomId } from './utils.js';

export async function handleButtonInteraction(
  interaction: ButtonInteraction,
  context: BotContext,
): Promise<void> {
  if (!interaction.customId.startsWith('collab:')) {
    return;
  }

  const payload = parseCustomId(interaction.customId);
  if (!payload) {
    await interaction.reply({ content: 'This action has expired.', ephemeral: true });
    return;
  }

  const { config, store } = context;

  switch (payload.kind) {
    case 'approve': {
      if (!interaction.member || !('roles' in interaction.member) || !isModerator(interaction.member, config)) {
        await interaction.reply({ content: 'You do not have permission to approve collabs.', ephemeral: true });
        return;
      }

      const modal = new ModalBuilder()
        .setCustomId(`${APPROVE_MODAL_PREFIX}${payload.requestId}:${interaction.message?.id ?? ''}`)
        .setTitle('Approve collab request');

      const noteInput = new TextInputBuilder()
        .setCustomId('note')
        .setLabel('Optional note to requester')
        .setStyle(TextInputStyle.Paragraph)
        .setRequired(false)
        .setMaxLength(500);

      modal.addComponents(new ActionRowBuilder<TextInputBuilder>().addComponents(noteInput));
      await interaction.showModal(modal);
      return;
    }
    case 'deny': {
      if (!interaction.member || !('roles' in interaction.member) || !isModerator(interaction.member, config)) {
        await interaction.reply({ content: 'You do not have permission to deny collabs.', ephemeral: true });
        return;
      }

      const modal = new ModalBuilder()
        .setCustomId(`${DENY_MODAL_PREFIX}${payload.requestId}:${interaction.message?.id ?? ''}`)
        .setTitle('Deny collab request');

      const reasonInput = new TextInputBuilder()
        .setCustomId('reason')
        .setLabel('Reason for denial')
        .setStyle(TextInputStyle.Paragraph)
        .setRequired(true)
        .setMinLength(10)
        .setMaxLength(500);

      modal.addComponents(new ActionRowBuilder<TextInputBuilder>().addComponents(reasonInput));
      await interaction.showModal(modal);
      return;
    }
    case 'viewSummary': {
      const request = await store.getById(payload.requestId);
      if (!request) {
        await interaction.reply({ content: 'Request not found.', ephemeral: true });
        return;
      }
      await interaction.reply({
        embeds: [buildReviewEmbed({ request, includeFullSummary: true })],
        ephemeral: true,
      });
    }
  }
}
