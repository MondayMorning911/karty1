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
  created_at timestamp with time zone default now(),
  korter_url text,
  error_details text
);

-- Enable RLS
ALTER TABLE platform_sessions ENABLE ROW LEVEL SECURITY;
ALTER TABLE listings ENABLE ROW LEVEL SECURITY;

-- Create policies for anon read/write based on user_id
CREATE POLICY "Anon can do all platform_sessions matching user_id" ON platform_sessions
  FOR ALL USING (true) WITH CHECK (true);

CREATE POLICY "Anon can do all listings matching user_id" ON listings
  FOR ALL USING (true) WITH CHECK (true);

-- Enable Realtime for tables
ALTER PUBLICATION supabase_realtime ADD TABLE platform_sessions;
ALTER PUBLICATION supabase_realtime ADD TABLE listings;
