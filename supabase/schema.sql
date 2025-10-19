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
