-- Expert Watch AI Customer Service — initial schema
-- All tables have RLS enabled with no policies: only the server (service role) can access them.

create extension if not exists pgcrypto;

-- ─── Settings & audit ──────────────────────────────────────
create table settings (
  key         text primary key,
  value       jsonb not null,
  updated_at  timestamptz not null default now(),
  updated_by  text
);

insert into settings (key, value) values
  ('mode', '"test"'),
  ('channels', '{"line": true, "messenger": true}'),
  ('test_users', '[]'),
  ('notify_hours', '{"days": [0,1,2,3,4,5,6], "start": "08:30", "end": "20:00", "holidays": []}'),
  ('sheet_state', '{"status": "ok"}');

create table audit_log (
  id          bigint generated always as identity primary key,
  actor       text not null,
  action      text not null,
  details     jsonb,
  created_at  timestamptz not null default now()
);
create index on audit_log (created_at desc);

-- ─── Admins (RBAC) ─────────────────────────────────────────
create table admins (
  line_user_id  text primary key,
  display_name  text,
  role          text not null check (role in ('super_admin', 'admin')),
  active        boolean not null default true,
  created_at    timestamptz not null default now(),
  created_by    text,
  revoked_at    timestamptz,
  revoked_by    text
);

create table pending_actions (
  id            uuid primary key default gen_random_uuid(),
  actor         text not null,
  action        jsonb not null,
  preview       text not null,
  status        text not null default 'pending' check (status in ('pending', 'confirmed', 'cancelled', 'expired')),
  created_at    timestamptz not null default now(),
  expires_at    timestamptz not null default now() + interval '10 minutes',
  decided_at    timestamptz
);

-- ─── Topic controls ────────────────────────────────────────
create table topic_rules (
  id          bigint generated always as identity primary key,
  kind        text not null check (kind in ('service', 'brand', 'model')),
  value       text not null,
  enabled     boolean not null default true,
  updated_at  timestamptz not null default now(),
  updated_by  text,
  unique (kind, value)                -- value is stored lower-cased
);

-- ─── Knowledge (Approved snapshot = backup of Google Sheets) ─
create table knowledge_items (
  key          text primary key,
  seq          bigint generated always as identity unique,
  sheet        text not null,
  question     text not null,
  answer       text not null,
  hash         text not null,
  source       text not null default 'sheet' check (source in ('sheet', 'line')),
  source_row   int,
  approved_by  text not null,
  approved_at  timestamptz not null default now()
);

create table change_batches (
  id          bigint generated always as identity primary key,
  kind        text not null check (kind in ('edit', 'recovery', 'line')),
  status      text not null default 'pending' check (status in ('pending', 'closed')),
  created_by  text not null default 'system',
  created_at  timestamptz not null default now(),
  notified_at timestamptz,
  closed_at   timestamptz
);

create table change_items (
  id           bigint generated always as identity primary key,
  batch_id     bigint not null references change_batches(id),
  item_key     text not null,
  sheet        text not null,
  source       text not null default 'sheet' check (source in ('sheet', 'line')),
  change_type  text not null check (change_type in ('add', 'update', 'delete')),
  source_row   int,
  old_question text,
  old_answer   text,
  new_question text,
  new_answer   text,
  new_hash     text not null,          -- 'DELETED' for deletions
  status       text not null default 'pending' check (status in ('pending', 'approved', 'rejected', 'superseded')),
  decided_by   text,
  decided_at   timestamptz,
  created_at   timestamptz not null default now()
);
create index on change_items (item_key, status);
create index on change_items (batch_id);

-- Approve or reject one change item atomically. Returns the item, or nothing if it was
-- already decided (prevents double approval).
create or replace function decide_change_item(p_item_id bigint, p_actor text, p_decision text)
returns setof change_items
language plpgsql
as $$
declare
  it change_items;
begin
  if p_decision not in ('approved', 'rejected') then
    raise exception 'invalid decision %', p_decision;
  end if;

  select * into it from change_items where id = p_item_id and status = 'pending' for update;
  if not found then
    return;
  end if;

  if p_decision = 'approved' then
    if it.change_type = 'delete' then
      delete from knowledge_items where key = it.item_key;
    else
      insert into knowledge_items (key, sheet, question, answer, hash, source, source_row, approved_by, approved_at)
      values (it.item_key, it.sheet, it.new_question, it.new_answer, it.new_hash, it.source, it.source_row, p_actor, now())
      on conflict (key) do update set
        sheet = excluded.sheet, question = excluded.question, answer = excluded.answer,
        hash = excluded.hash, source_row = excluded.source_row,
        approved_by = excluded.approved_by, approved_at = excluded.approved_at;
    end if;
  end if;

  update change_items set status = p_decision, decided_by = p_actor, decided_at = now()
  where id = p_item_id
  returning * into it;

  update change_batches set status = 'closed', closed_at = now()
  where id = it.batch_id and status = 'pending'
    and not exists (select 1 from change_items where batch_id = it.batch_id and status = 'pending');

  insert into audit_log (actor, action, details)
  values (p_actor, 'knowledge.' || p_decision,
          jsonb_build_object('item_id', it.id, 'batch_id', it.batch_id, 'key', it.item_key, 'type', it.change_type));

  return next it;
end;
$$;

-- ─── Chats (operational state only — no message history) ───
create sequence chat_ref_seq start 1001;

create table chats (
  id                text primary key,          -- "<channel>:<external id>"
  channel           text not null check (channel in ('line', 'messenger')),
  external_id       text not null,
  ref_code          text not null unique default ('C' || nextval('chat_ref_seq')),
  ai_enabled        boolean not null default true,
  ai_off_reason     text,
  ai_off_at         timestamptz,
  ai_off_by         text,
  last_bot_reply_at timestamptz,
  lock_until        timestamptz,
  created_at        timestamptz not null default now()
);
create index on chats (ai_enabled) where ai_enabled = false;

create or replace function try_lock_chat(p_chat_id text, p_seconds int)
returns boolean
language sql
as $$
  with locked as (
    update chats set lock_until = now() + make_interval(secs => p_seconds)
    where id = p_chat_id and (lock_until is null or lock_until < now())
    returning 1
  )
  select exists (select 1 from locked);
$$;

-- Temporary buffer used to merge messages sent within 5 seconds. Rows are deleted as soon
-- as they are processed and purged after 10 minutes regardless. Media is never stored:
-- only the platform's message id / URL is kept so it can be fetched in memory.
create table message_buffer (
  id           bigint generated always as identity primary key,
  chat_id      text not null references chats(id) on delete cascade,
  part         jsonb not null,
  reply_token  text,
  received_at  timestamptz not null default now()
);
create index on message_buffer (chat_id, id);

-- Short-lived conversation context (text only), expires after inactivity.
create table chat_context (
  chat_id     text primary key references chats(id) on delete cascade,
  turns       jsonb not null default '[]',
  expires_at  timestamptz not null
);

create table processed_events (
  event_id    text primary key,
  source      text not null,
  created_at  timestamptz not null default now()
);

-- ─── Handoff & customer requests ───────────────────────────
create table customer_requests (
  id              bigint generated always as identity primary key,
  chat_id         text not null references chats(id),
  kind            text not null check (kind in ('appointment', 'callback')),
  name            text,
  phone           text,
  service         text,
  branch          text,
  preferred_time  text,
  status          text not null default 'new' check (status in ('new', 'done')),
  created_at      timestamptz not null default now()
);

create table handoffs (
  id               bigint generated always as identity primary key,
  chat_id          text not null references chats(id),
  category         text not null,
  summary          text,
  draft_reply      text,
  ai_paused        boolean not null default true,
  request_id       bigint references customer_requests(id),
  status           text not null default 'open' check (status in ('open', 'claimed', 'resolved')),
  notify_count     int not null default 0,
  last_notified_at timestamptz,
  claimed_by       text,
  claimed_by_name  text,
  claimed_at       timestamptz,
  resolved_by      text,
  resolved_at      timestamptz,
  created_at       timestamptz not null default now()
);
create index on handoffs (status, last_notified_at);

-- ─── Monitoring ────────────────────────────────────────────
create table system_events (
  id          bigint generated always as identity primary key,
  level       text not null check (level in ('info', 'warn', 'error')),
  source      text not null,
  message     text not null,
  meta        jsonb,
  alerted     boolean not null default false,
  created_at  timestamptz not null default now()
);
create index on system_events (created_at desc);
create index on system_events (level, source, created_at desc);

create table stats_daily (
  day      date not null,
  channel  text not null,
  metric   text not null,
  count    int not null default 0,
  primary key (day, channel, metric)
);

create or replace function increment_stat(p_channel text, p_metric text, p_by int default 1)
returns void
language sql
as $$
  insert into stats_daily (day, channel, metric, count)
  values ((now() at time zone 'Asia/Bangkok')::date, p_channel, p_metric, p_by)
  on conflict (day, channel, metric) do update set count = stats_daily.count + excluded.count;
$$;

-- ─── Row Level Security: deny all to anon/authenticated ────
alter table settings          enable row level security;
alter table audit_log         enable row level security;
alter table admins            enable row level security;
alter table pending_actions   enable row level security;
alter table topic_rules       enable row level security;
alter table knowledge_items   enable row level security;
alter table change_batches    enable row level security;
alter table change_items      enable row level security;
alter table chats             enable row level security;
alter table message_buffer    enable row level security;
alter table chat_context      enable row level security;
alter table processed_events  enable row level security;
alter table customer_requests enable row level security;
alter table handoffs          enable row level security;
alter table system_events     enable row level security;
alter table stats_daily       enable row level security;

revoke execute on function decide_change_item(bigint, text, text) from public, anon, authenticated;
revoke execute on function try_lock_chat(text, int) from public, anon, authenticated;
revoke execute on function increment_stat(text, text, int) from public, anon, authenticated;
grant execute on function decide_change_item(bigint, text, text) to service_role;
grant execute on function try_lock_chat(text, int) to service_role;
grant execute on function increment_stat(text, text, int) to service_role;
