# Momentum Collab Portal Bot

Momentum Collab Portal Bot is a Discord bot for the Momentum Finance community. It lets verified members submit collaboration ideas, routes them to moderators for review, and shares approved collabs with the community. The project targets **Node.js 20** with **TypeScript** and `discord.js` v14, and stores collab data in Supabase (with a JSON file fallback for local development).

## Features

- `/collab submit` opens a modal for verified members to share wallet, project link, social handle, and summary (validated to 30–600 characters).
- Automatic eligibility checks: required roles or minimum server age, only one pending request, and 24-hour cooldown after a decision.
- Requests are posted to a moderator review channel with Approve / Deny buttons and a full summary button.
- Moderator actions capture optional approval notes or required denial reasons, send DMs to the requester, and log to the proper channels.
- Optional private review threads per request and optional approved-role assignment.
- Admin tools: `/collab config show`, `/collab list`, `/collab reannounce`.
- Supabase storage with graceful retries; fallback JSON store when Supabase credentials are missing.
- Structured logging (JSON in production, readable in development).
- Ready for deployment to Render (free tier) with `render.yaml` and `Procfile`.

## Project Structure

```
├── src/
│   ├── index.ts                # Bot bootstrap
│   ├── commands/collab.ts      # Slash command definitions & handler
│   ├── interactions/
│   │   ├── buttons.ts          # Approve/Deny/View Summary buttons
│   │   ├── modals.ts           # Modal submissions (submit, approve, deny)
│   │   └── utils.ts            # Custom-ID helpers with expiry
│   ├── db/
│   │   ├── fileStore.ts        # JSON fallback store
│   │   ├── supabase.ts         # Supabase adapter
│   │   └── types.ts            # Shared types and interfaces
│   ├── lib/
│   │   ├── context.ts          # Runtime context shape
│   │   ├── embeds.ts           # Consistent branded embeds
│   │   ├── guard.ts            # Role & permission helpers
│   │   ├── logger.ts           # Structured logging
│   │   └── rateLimit.ts        # Pending + cooldown guard
│   ├── config.ts               # Environment configuration loader
│   └── registerCommands.ts     # Command registration script
├── supabase/schema.sql         # Supabase table definition
├── render.yaml                 # Render deploy spec
├── Procfile                    # Process definition (Render/Railway)
├── tsconfig.json               # TypeScript configuration
├── eslint.config.js            # ESLint (flat config)
├── .prettierrc                 # Prettier rules
├── .env.example                # Example environment variables
└── package.json                # Scripts & dependencies
```

## Prerequisites

- Node.js 20+
- Discord server where you have permission to add bots
- Supabase project (optional; JSON fallback is automatic)

## Discord Application Setup

1. Visit <https://discord.com/developers/applications> and create a new application.
2. Under **Bot**, add a bot user and copy the token (set it in `.env`).
3. Enable **Privileged Gateway Intents** → _Server Members_.
4. Under **OAuth2 → URL Generator**, select scopes `bot` and `applications.commands`.
5. Select bot permissions: **Send Messages**, **Manage Threads**, **Embed Links**, **Read Message History** (and others required by your moderation flow).
6. Invite the bot to your server using the generated URL.

## Environment Variables

Copy `.env.example` to `.env` and fill in values:

```
DISCORD_TOKEN=...
DISCORD_CLIENT_ID=...
MOD_REVIEW_CHANNEL_ID=1234567890
COLLABS_APPROVED_CHANNEL_ID=1234567891
COLLABS_DENIED_LOG_CHANNEL_ID=1234567892
VERIFIED_ROLE_IDS=111111,222222
MOD_ROLE_IDS=333333,444444
APPROVED_ROLE_ID=555555
MIN_MEMBER_DAYS=3
CREATE_REVIEW_THREADS=true
SUPABASE_URL=https://xxxx.supabase.co
SUPABASE_ANON_KEY=xxxx
```

Notes:

- `VERIFIED_ROLE_IDS` is a comma-separated list of role IDs that qualify a member to submit.
- `MIN_MEMBER_DAYS` defaults to 3 if omitted.
- Leave `SUPABASE_URL` / `SUPABASE_ANON_KEY` blank to fall back to `data/collabs.json` (auto-created).

## Supabase Setup

1. Create a Supabase project.
2. In the SQL editor, run `supabase/schema.sql` to create the `collab_requests` table and indexes:

```sql
create table if not exists collab_requests (
  id uuid primary key default gen_random_uuid(),
  guild_id text not null,
  user_id text not null,
  username text not null,
  wallet text,
  project_link text not null,
  handle text,
  summary text not null,
  status text not null check (status in ('PENDING','APPROVED','DENIED')),
  moderator_id text,
  moderator_note text,
  decision_reason text,
  created_at timestamptz not null default now(),
  decided_at timestamptz
);

create index if not exists idx_collab_guild_status on collab_requests (guild_id, status);
create index if not exists idx_collab_user on collab_requests (user_id);
```

3. Grab the **Project URL** and **anon key** from Project Settings → API, and add them to `.env`.

## Local Development

```bash
npm install
cp .env.example .env  # fill in values
npm run dev
```

The bot runs with `tsx` in watch mode. Invite it to a test server and run the registration script once per guild:

```bash
npm run register:commands -- --guild <GUILD_ID>
```

### JSON Fallback Store

If `SUPABASE_URL` or `SUPABASE_ANON_KEY` is missing, the bot reads and writes requests to `data/collabs.json`. The file is ignored by git and will be created automatically.

## Production Build & Deploy

1. Build the project: `npm run build`.
2. Start the compiled bot: `npm start` (runs `node dist/index.js`).

### Render Deployment

- The included `render.yaml` and `Procfile` configure a Node service on the free plan.
- Render will run `npm install && npm run build`, then `npm run start`.
- Add the `.env` variables in the Render dashboard (never commit secrets).

### Railway Deployment

- Create a Node service, set the start command to `npm run start`, and copy the same environment variables.
- Optionally run `npm run build` during deploy by adding it to the Railway build step.

## Slash Command Reference

| Command | Who | Description |
| --- | --- | --- |
| `/collab submit` | Eligible members | Open the submission modal (wallet optional, project link required, 30–600 char summary).
| `/collab config show` | Mods / admins | Display current configuration (channels, roles, storage mode).
| `/collab list status:<STATUS> limit:<N>` | Mods | List recent requests by status (default 10, max 50).
| `/collab reannounce id:<REQUEST_ID>` | Mods | Re-post the approved announcement embed.

## Moderator Workflow

1. A verified member submits a request.
2. The bot posts an embed in the review channel with Approve/Deny buttons (and a “View full summary” button if needed).
3. Mods click Approve or Deny. A modal collects an optional note or required reason.
4. On approval, the bot updates the DB, DMs the requester, posts an announcement, and optionally assigns an approved role.
5. On denial, the bot updates the DB, DMs the requester with the reason, and logs to the denial channel if configured.
6. Rate limits enforce one pending request per user and a 24-hour cooldown after each decision.

## Troubleshooting

- **Bot offline or not responding:** confirm the bot token and intents are correct. Check Render/Railway logs for errors.
- **401 errors registering commands:** ensure the bot token matches the client ID and that the bot has the `applications.commands` scope.
- **Missing channel/role IDs:** double-check `.env` variables; the `/collab config show` command displays current values.
- **Rate limit warnings:** users must wait for mods to decide (pending request) and 24 hours after approval/denial.
- **Supabase outages:** the bot retries operations; if credentials are absent it falls back to the JSON file.
- **DM failures:** users might have DMs disabled; decisions still post to the configured channels.

## Privacy & Data Retention

- Collab submissions store usernames, Discord IDs, optional wallet and handles, project links, and summaries for moderation purposes.
- Data resides in Supabase (or a local JSON file in development). Remove records manually from the database if required.
- No personal data is shared outside the Discord server channels defined in configuration.

## Acceptance Tests / Manual Scenarios

1. **Eligibility guard:** A newcomer without a verified role and < `MIN_MEMBER_DAYS` cannot submit (`/collab submit` replies with an eligibility message).
2. **Happy path:** An eligible member submits a request, sees a success message, and a pending embed appears in the mod review channel.
3. **Approval flow:** A moderator approves via the button → requester receives a DM, the approved channel gets a “✅ Collab approved” embed, and the request status becomes `APPROVED`.
4. **Denial flow:** A moderator denies via the button → requester receives the reason via DM, the request status becomes `DENIED`, and the denial log channel (if set) logs the outcome.
5. **Rate limiting:** Attempting a second submission while one is pending or within 24 hours of a decision is blocked with a helpful message.
6. **JSON fallback:** Temporarily unset Supabase env variables and restart; submissions persist to `data/collabs.json`.

## Contributing

- Run `npm run lint` before committing.
- Keep secrets out of source control.
- Use structured logging for new features (see `src/lib/logger.ts`).
