-- Run this in your Supabase SQL editor
-- Go to: supabase.com → your project → SQL Editor → New Query → paste this → Run

-- Clients table
create table if not exists clients (
  id uuid default gen_random_uuid() primary key,
  name text not null,
  emoji text default '👤',
  color_gradient text default 'linear-gradient(90deg,rgba(255,150,0,.95),rgba(255,80,0,.75))',
  created_at timestamp with time zone default now()
);

-- Tasks table
create table if not exists tasks (
  id uuid default gen_random_uuid() primary key,
  client_id uuid references clients(id) on delete cascade,
  title text not null,
  scheduled_time text,
  scheduled_date date default current_date,
  status text default 'today' check (status in ('today','backlog','done','missed')),
  priority text default 'normal' check (priority in ('normal','high','asap')),
  created_at timestamp with time zone default now()
);

-- Allow public read/write (we'll add auth later)
alter table clients enable row level security;
alter table tasks enable row level security;

create policy "Allow all" on clients for all using (true) with check (true);
create policy "Allow all" on tasks for all using (true) with check (true);

-- Sample data to get you started (optional — delete if you want a clean slate)
insert into clients (name, emoji, color_gradient) values
  ('GetFruity', '🍊', 'linear-gradient(90deg,rgba(255,150,0,.95),rgba(255,80,0,.75),rgba(255,210,140,.90))'),
  ('WebCraft', '🌊', 'linear-gradient(90deg,rgba(0,200,255,.95),rgba(0,255,170,.70),rgba(110,80,255,.92))'),
  ('BrightFinance', '⭐', 'linear-gradient(90deg,rgba(180,0,255,.95),rgba(255,0,140,.70),rgba(255,220,0,.80))');
