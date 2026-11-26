-- Reminders are pinned notes. Run once in the Supabase SQL editor.
alter table public.notes add column if not exists pinned boolean not null default false;
