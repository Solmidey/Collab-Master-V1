import type { Client } from 'discord.js';

import type { BotConfig } from '../config.js';
import type { CollabStore } from '../db/types.js';
import type { Logger } from './logger.js';

export interface BotContext {
  client: Client;
  config: BotConfig;
  store: CollabStore;
  logger: Logger;
}
