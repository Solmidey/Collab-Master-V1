import type { ChatInputCommandInteraction } from "discord.js";
import { SlashCommandBuilder } from "discord.js";

import type { DealService } from "../../backend/src/services/dealService.js";

export const depositCommand = new SlashCommandBuilder()
  .setName("deposit")
  .setDescription("Record a deposit into an escrow")
  .addStringOption((option) => option.setName("deal_id").setDescription("Deal identifier").setRequired(true))
  .addStringOption((option) => option.setName("amount").setDescription("Amount in wei").setRequired(true))
  .addStringOption((option) => option.setName("wallet").setDescription("Depositor wallet address"));

export interface DepositCommandDeps {
  dealService: DealService;
  depositCap: bigint;
}

export async function handleDepositCommand(
  interaction: ChatInputCommandInteraction,
  { dealService, depositCap }: DepositCommandDeps
): Promise<void> {
  const dealId = interaction.options.getString("deal_id", true);
  const amountRaw = interaction.options.getString("amount", true);
  const amount = BigInt(amountRaw);
  const walletAddress = interaction.options.getString("wallet") ?? undefined;

  dealService.recordDeposit(dealId, amount, {
    walletAddress,
    discordId: interaction.user.id,
    cap: depositCap,
  });

  await interaction.reply({
    content: `Deposit of **${amount}** wei recorded for deal ${dealId}.`,
    ephemeral: true,
  });
}
