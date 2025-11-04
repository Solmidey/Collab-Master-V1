import type { ChatInputCommandInteraction } from "discord.js";
import { SlashCommandBuilder } from "discord.js";

import type { DealService } from "../../backend/src/services/dealService.js";

export const openDisputeCommand = new SlashCommandBuilder()
  .setName("opendispute")
  .setDescription("Open a dispute on a milestone")
  .addStringOption((option) => option.setName("milestone_id").setDescription("Milestone identifier").setRequired(true))
  .addStringOption((option) => option.setName("description").setDescription("Reason for dispute"));

export interface OpenDisputeDeps {
  dealService: DealService;
}

export async function handleOpenDisputeCommand(
  interaction: ChatInputCommandInteraction,
  { dealService }: OpenDisputeDeps
): Promise<void> {
  const milestoneId = interaction.options.getString("milestone_id", true);
  const description = interaction.options.getString("description") ?? undefined;

  const dispute = dealService.openDispute(milestoneId, interaction.user.id, description);

  await interaction.reply({
    content: `Dispute ${dispute.id} opened for milestone ${milestoneId}.`,
    ephemeral: true,
  });
}
