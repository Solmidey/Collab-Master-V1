import { REST, Routes } from '@discordjs/rest';
import { SlashCommandBuilder } from 'discord.js';

import { loadConfig } from './config.js';
import { collabCommand } from './commands/collab.js';
import { logger } from './lib/logger.js';

const args = process.argv.slice(2);
const guildFlagIndex = args.indexOf('--guild');
const guildId = guildFlagIndex >= 0 ? args[guildFlagIndex + 1] : undefined;

if (!guildId) {
  logger.error('You must pass --guild <GUILD_ID> to register commands.');
  process.exit(1);
}

async function register(): Promise<void> {
  const config = loadConfig(logger);
  const rest = new REST({ version: '10' }).setToken(config.token);

  const commands: SlashCommandBuilder[] = [collabCommand];
  const payload = commands.map((command) => command.toJSON());

  logger.info('Registering commands', { guildId });
  await rest.put(Routes.applicationGuildCommands(config.clientId, guildId), { body: payload });
  logger.info('Commands registered successfully', { guildId });
}

register().catch((error) => {
  logger.error('Failed to register commands', {
    error: error instanceof Error ? error.message : String(error),
  });
  process.exit(1);
});
