create table if not exists public.software_projects (
  id text primary key,
  user_id uuid not null references auth.users(id) on delete cascade,
  name text not null check (char_length(name) between 1 and 160),
  project jsonb not null,
  created_at timestamptz not null default now(),
  updated_at timestamptz not null default now()
);

create index if not exists software_projects_user_updated_idx
  on public.software_projects (user_id, updated_at desc);

alter table public.software_projects enable row level security;

create policy "Users can view their software projects"
  on public.software_projects for select to authenticated
  using (auth.uid() = user_id);

create policy "Users can create their software projects"
  on public.software_projects for insert to authenticated
  with check (auth.uid() = user_id);

create policy "Users can update their software projects"
  on public.software_projects for update to authenticated
  using (auth.uid() = user_id) with check (auth.uid() = user_id);

create policy "Users can delete their software projects"
  on public.software_projects for delete to authenticated
  using (auth.uid() = user_id);
