-- Run this in your Supabase SQL editor

create table if not exists locations (
  id         uuid             default gen_random_uuid() primary key,
  name       text             not null,
  lat        double precision not null,
  lng        double precision not null,
  expires_at timestamptz      not null,
  updated_at timestamptz      default now()
);

-- Required for Realtime DELETE payloads to include the row id
alter table locations replica identity full;

-- Enable realtime for this table
alter publication supabase_realtime add table locations;

-- Row Level Security
alter table locations enable row level security;

create policy "Public read"   on locations for select using (true);
create policy "Public insert" on locations for insert with check (true);
create policy "Public update" on locations for update using (true);
create policy "Public delete" on locations for delete using (true);

-- Optional: auto-delete expired rows (requires pg_cron extension)
-- select cron.schedule('cleanup-expired-locations', '*/5 * * * *',
--   $$delete from locations where expires_at < now()$$);
