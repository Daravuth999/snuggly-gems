
create type public.app_role as enum ('admin');

create table public.user_roles (
  id uuid primary key default gen_random_uuid(),
  user_id uuid references auth.users(id) on delete cascade not null,
  role app_role not null,
  created_at timestamptz not null default now(),
  unique (user_id, role)
);
grant select on public.user_roles to authenticated;
grant all on public.user_roles to service_role;
alter table public.user_roles enable row level security;

create or replace function public.has_role(_user_id uuid, _role app_role)
returns boolean language sql stable security definer set search_path = public as $$
  select exists (select 1 from public.user_roles where user_id = _user_id and role = _role)
$$;

create policy "admins read roles" on public.user_roles for select to authenticated
using (public.has_role(auth.uid(), 'admin'));

create table public.admin_invites (
  email text primary key,
  created_at timestamptz not null default now()
);
grant select, insert, delete on public.admin_invites to authenticated;
grant all on public.admin_invites to service_role;
alter table public.admin_invites enable row level security;
create policy "admins manage invites" on public.admin_invites for all to authenticated
using (public.has_role(auth.uid(), 'admin')) with check (public.has_role(auth.uid(), 'admin'));

create table public.videos (
  id uuid primary key default gen_random_uuid(),
  created_by uuid references auth.users(id) on delete set null,
  title text not null,
  storage_path text not null,
  duration_sec numeric,
  narration_language text not null default 'en',
  status text not null default 'uploaded',
  error text,
  created_at timestamptz not null default now()
);
grant select, insert, update, delete on public.videos to authenticated;
grant all on public.videos to service_role;
alter table public.videos enable row level security;
create policy "admins manage videos" on public.videos for all to authenticated
using (public.has_role(auth.uid(), 'admin')) with check (public.has_role(auth.uid(), 'admin'));

create table public.transcript_cues (
  id uuid primary key default gen_random_uuid(),
  video_id uuid not null references public.videos(id) on delete cascade,
  idx int not null,
  start_ms int not null,
  end_ms int not null,
  speaker text,
  text text not null
);
create index transcript_cues_video_idx on public.transcript_cues(video_id, idx);
grant select, insert, update, delete on public.transcript_cues to authenticated;
grant all on public.transcript_cues to service_role;
alter table public.transcript_cues enable row level security;
create policy "admins manage transcript" on public.transcript_cues for all to authenticated
using (public.has_role(auth.uid(), 'admin')) with check (public.has_role(auth.uid(), 'admin'));

create table public.narration_lines (
  id uuid primary key default gen_random_uuid(),
  video_id uuid not null references public.videos(id) on delete cascade,
  idx int not null,
  start_ms int not null,
  end_ms int not null,
  language text not null default 'en',
  text text not null,
  audio_path text,
  audio_ms int
);
create index narration_lines_video_idx on public.narration_lines(video_id, idx);
grant select, insert, update, delete on public.narration_lines to authenticated;
grant all on public.narration_lines to service_role;
alter table public.narration_lines enable row level security;
create policy "admins manage narration" on public.narration_lines for all to authenticated
using (public.has_role(auth.uid(), 'admin')) with check (public.has_role(auth.uid(), 'admin'));

create policy "admins read studio files" on storage.objects for select to authenticated
using (bucket_id = 'studio' and public.has_role(auth.uid(), 'admin'));
create policy "admins write studio files" on storage.objects for insert to authenticated
with check (bucket_id = 'studio' and public.has_role(auth.uid(), 'admin'));
create policy "admins update studio files" on storage.objects for update to authenticated
using (bucket_id = 'studio' and public.has_role(auth.uid(), 'admin'));
create policy "admins delete studio files" on storage.objects for delete to authenticated
using (bucket_id = 'studio' and public.has_role(auth.uid(), 'admin'));
