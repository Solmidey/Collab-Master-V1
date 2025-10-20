import { Client, Events, GatewayIntentBits, MessageFlags, Partials } from 'discord.js';

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

  logger.info('Starting Momentum Finance collab bot', {
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
          await interaction.followUp({ content, flags: MessageFlags.Ephemeral });
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
