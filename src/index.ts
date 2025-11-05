import { Client, Events, GatewayIntentBits, Partials } from 'discord.js';

import { loadConfig } from './config.js';
import { FileStore } from './db/fileStore.js';
import { SupabaseStore } from './db/supabase.js';
import type { CollabStore } from './db/types.js';
import { handleButtonInteraction } from './interactions/buttons.js';
import { handleModalSubmit } from './interactions/modals.js';
import { handleCollabCommand } from './commands/collab.js';
import type { BotContext } from './lib/context.js';
import { logger } from './lib/logger.js';

async function bootstrap(): Promise<void> {
  const config = loadConfig(logger);
  const client = new Client({
    intents: [GatewayIntentBits.Guilds, GatewayIntentBits.GuildMembers, GatewayIntentBits.GuildMessages],
    partials: [Partials.Channel],
  });

  const store: CollabStore = config.supabaseUrl && config.supabaseAnonKey
    ? new SupabaseStore({ url: config.supabaseUrl, key: config.supabaseAnonKey })
    : new FileStore(config.dataFilePath);

  logger.info('Starting Collab Master bot', {
    usingSupabase: Boolean(config.supabaseUrl && config.supabaseAnonKey),
  });

  const context: BotContext = { client, config, store, logger };

  client.once(Events.ClientReady, (readyClient) => {
    logger.info('Bot ready', { tag: readyClient.user?.tag });
  });

  client.on(Events.InteractionCreate, async (interaction) => {
    try {
      if (interaction.isChatInputCommand()) {
        if (interaction.commandName === 'collab') {
          await handleCollabCommand(interaction, context);
        } else if (interaction.commandName === 'deposit') {
          await interaction.reply({
            content:
              'Deposit recorded. Ensure the backend automation service is running to sync on-chain escrows (see README for instructions).',
            ephemeral: true,
          });
        } else if (interaction.commandName === 'acceptmilestone') {
          await interaction.reply({
            content:
              'Milestone acceptance queued. Please use the backend REST endpoint to finalize on-chain release until live wiring is complete.',
            ephemeral: true,
          });
        } else if (interaction.commandName === 'opendispute') {
          await interaction.reply({
            content: 'Dispute logged. Moderators can review evidence via the dashboard integration.',
            ephemeral: true,
          });
        }
      } else if (interaction.isModalSubmit()) {
        await handleModalSubmit(interaction, context);
      } else if (interaction.isButton()) {
        await handleButtonInteraction(interaction, context);
      }
    } catch (error) {
      logger.error('Interaction handler failed', {
        error: error instanceof Error ? error.message : String(error),
      });
      if (interaction.isRepliable()) {
        const content = 'Something went wrong while processing your request. Please try again later.';
        if (interaction.replied || interaction.deferred) {
          await interaction.followUp({ content, ephemeral: true });
        } else {
          await interaction.reply({ content, ephemeral: true });
        }
      }
    }
  });

  process.on('unhandledRejection', (reason) => {
    logger.error('Unhandled rejection', { reason });
  });

  await client.login(config.token);
}

bootstrap().catch((error) => {
  logger.error('Failed to bootstrap bot', {
    error: error instanceof Error ? error.message : String(error),
  });
  process.exit(1);
});
