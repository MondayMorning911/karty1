-- Run this in Supabase SQL editor

CREATE TABLE platform_sessions (
  user_id text not null,
  platform text not null,
  state jsonb not null,
  created_at timestamp with time zone default now(),
  updated_at timestamp with time zone default now(),
  primary key(user_id, platform)
);

CREATE TABLE listings (
  id uuid default uuid_generate_v4() primary key,
  user_id text not null,
  title text not null,
  description text,
  status text not null default 'draft',
  platforms jsonb default '[]'::jsonb,
  cover_image text,
  images jsonb default '[]'::jsonb,
  created_at timestamp with time zone default now(),
  listing_urls jsonb default '{}'::jsonb,
  error_details text
);

CREATE TABLE listing_publications (
  id uuid default uuid_generate_v4() primary key,
  listing_id uuid not null references listings(id) on delete cascade,
  user_id text not null,
  platform text not null,
  task_id text,
  status text not null default 'pending',
  listing_url text,
  error_details text,
  created_at timestamp with time zone default now(),
  updated_at timestamp with time zone default now(),
  UNIQUE(listing_id, platform)
);

-- Presentations: PDF presentations builder
CREATE TABLE presentations (
  id uuid default uuid_generate_v4() primary key,
  user_id text not null,
  name text not null default 'Моя презентация',
  template jsonb default '{}'::jsonb,
  objects jsonb default '[]'::jsonb,
  created_at timestamp with time zone default now(),
  updated_at timestamp with time zone default now()
);

-- Planner: notes and tasks
CREATE TABLE planner_notes (
  id uuid default uuid_generate_v4() primary key,
  user_id text not null,
  text text not null,
  listing_id uuid references listings(id) on delete set null,
  created_at timestamp with time zone default now()
);

CREATE TABLE planner_tasks (
  id uuid default uuid_generate_v4() primary key,
  user_id text not null,
  text text not null,
  listing_id uuid references listings(id) on delete set null,
  remind_at timestamp with time zone,
  done boolean default false,
  created_at timestamp with time zone default now()
);

-- Enable RLS
ALTER TABLE platform_sessions ENABLE ROW LEVEL SECURITY;
ALTER TABLE listings ENABLE ROW LEVEL SECURITY;
ALTER TABLE listing_publications ENABLE ROW LEVEL SECURITY;
ALTER TABLE presentations ENABLE ROW LEVEL SECURITY;
ALTER TABLE planner_notes ENABLE ROW LEVEL SECURITY;
ALTER TABLE planner_tasks ENABLE ROW LEVEL SECURITY;

-- Restrict client access to the authenticated Supabase user. Anonymous
-- Supabase sessions still have auth.uid(), so Mini App users remain isolated.
CREATE POLICY "Users own platform sessions" ON platform_sessions
  FOR ALL TO authenticated
  USING (user_id = auth.uid()::text)
  WITH CHECK (user_id = auth.uid()::text);

CREATE POLICY "Users own listings" ON listings
  FOR ALL TO authenticated
  USING (user_id = auth.uid()::text)
  WITH CHECK (user_id = auth.uid()::text);

CREATE POLICY "Users own listing publications" ON listing_publications
  FOR ALL TO authenticated
  USING (user_id = auth.uid()::text)
  WITH CHECK (user_id = auth.uid()::text);

CREATE POLICY "Users own presentations" ON presentations
  FOR ALL TO authenticated
  USING (user_id = auth.uid()::text)
  WITH CHECK (user_id = auth.uid()::text);

CREATE POLICY "Users own planner notes" ON planner_notes
  FOR ALL TO authenticated
  USING (user_id = auth.uid()::text)
  WITH CHECK (user_id = auth.uid()::text);

CREATE POLICY "Users own planner tasks" ON planner_tasks
  FOR ALL TO authenticated
  USING (user_id = auth.uid()::text)
  WITH CHECK (user_id = auth.uid()::text);

-- Enable Realtime for tables
ALTER PUBLICATION supabase_realtime ADD TABLE platform_sessions;
ALTER PUBLICATION supabase_realtime ADD TABLE listings;
ALTER PUBLICATION supabase_realtime ADD TABLE listing_publications;
ALTER PUBLICATION supabase_realtime ADD TABLE presentations;
ALTER PUBLICATION supabase_realtime ADD TABLE planner_notes;
ALTER PUBLICATION supabase_realtime ADD TABLE planner_tasks;
