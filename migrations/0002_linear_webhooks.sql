-- Durable Linear webhook inbox (workspace-level, not per-user).
create table if not exists linear_webhook_deliveries (
  id           text primary key,
  received_at  timestamptz not null default now(),
  source       text not null,
  signature    text not null,
  event        text not null,
  action       text not null,
  type         text not null,
  identifier   text not null,
  title        text not null,
  state        text not null default '',
  actor        text not null default 'unknown',
  url          text,
  changed      jsonb not null default '[]'::jsonb
);

create index if not exists linear_webhook_deliveries_received_at_idx
  on linear_webhook_deliveries (received_at desc);
