-- Apply after the security migration in Supabase SQL Editor.

CREATE TABLE IF NOT EXISTS public.listing_publications (
  id uuid default uuid_generate_v4() primary key,
  listing_id uuid not null references public.listings(id) on delete cascade,
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

ALTER TABLE public.listing_publications ENABLE ROW LEVEL SECURITY;

DROP POLICY IF EXISTS "Users own listing publications" ON public.listing_publications;
CREATE POLICY "Users own listing publications" ON public.listing_publications
  FOR ALL TO authenticated
  USING (user_id = auth.uid()::text)
  WITH CHECK (user_id = auth.uid()::text);

ALTER PUBLICATION supabase_realtime ADD TABLE public.listing_publications;
