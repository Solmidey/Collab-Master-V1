import type { ChatInputCommandInteraction } from "discord.js";
import { SlashCommandBuilder } from "discord.js";
import type { Signer } from "ethers";

import type { DealService } from "../../backend/src/services/dealService.js";
import type { EscrowContractAdapter } from "../../backend/src/services/escrowService.js";

export const acceptMilestoneCommand = new SlashCommandBuilder()
  .setName("acceptmilestone")
  .setDescription("Accept a milestone and trigger escrow release")
  .addStringOption((option) => option.setName("deal_id").setDescription("Deal identifier").setRequired(true))
  .addStringOption((option) => option.setName("milestone_id").setDescription("Milestone identifier").setRequired(true));

export interface AcceptMilestoneDeps {
  dealService: DealService;
  contractResolver: (dealId: string) => EscrowContractAdapter;
  signerFactory: (dealId: string) => Promise<Signer[]>;
}

export async function handleAcceptMilestoneCommand(
  interaction: ChatInputCommandInteraction,
  { dealService, contractResolver, signerFactory }: AcceptMilestoneDeps
): Promise<void> {
  const dealId = interaction.options.getString("deal_id", true);
  const milestoneId = interaction.options.getString("milestone_id", true);

  const contract = contractResolver(dealId);
  const signers = await signerFactory(dealId);

  const milestone = await dealService.acceptMilestone({
    milestoneId,
    actor: { discordId: interaction.user.id },
    contract,
    signers,
  });

  await interaction.reply({
    content: `Milestone **${milestoneId}** accepted. Status: ${milestone.status}.`,
    ephemeral: true,
  });
}
