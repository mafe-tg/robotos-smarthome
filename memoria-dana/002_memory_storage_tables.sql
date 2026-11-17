create table if not exists public.memory_blocks (
  id bigint generated always as identity primary key,
  owner text not null,
  start_kb integer not null check (start_kb >= 0),
  size_kb integer not null check (size_kb > 0),
  allocated_at timestamptz not null default now()
);

create table if not exists public.files (
  id bigint generated always as identity primary key,
  path text not null unique,
  content text not null default '',
  size_bytes bigint not null default 0 check (size_bytes >= 0),
  created_at timestamptz not null default now(),
  modified_at timestamptz not null default now()
);

create table if not exists public.logs (
  id bigint generated always as identity primary key,
  created_at timestamptz not null default now(),
  level text not null check (level in ('DEBUG', 'INFO', 'WARNING', 'ERROR', 'CRITICAL')),
  source text not null,
  message text not null
);

create table if not exists public.surveillance_clips (
  id bigint generated always as identity primary key,
  camera_id text not null,
  path text not null unique,
  size_mb numeric(8, 2) not null check (size_mb > 0),
  is_protected boolean not null default false,
  recorded_at timestamptz not null default now()
);

create table if not exists public.energy_devices (
  device text primary key,
  watts numeric not null check (watts >= 0)
);

create table if not exists public.energy_usage (
  id bigint generated always as identity primary key,
  device text not null references public.energy_devices (device) on delete cascade,
  seconds numeric not null check (seconds >= 0),
  recorded_at timestamptz not null default now()
);

create index if not exists logs_created_at_idx on public.logs (created_at desc);
create index if not exists logs_level_idx on public.logs (level);
create index if not exists energy_usage_device_idx on public.energy_usage (device);

do $$
declare
  t text;
begin
  foreach t in array array[
    'memory_blocks', 'files', 'logs',
    'surveillance_clips', 'energy_devices', 'energy_usage'
  ]
  loop
    execute format('alter table public.%I enable row level security', t);
    execute format('drop policy if exists "lectura publica" on public.%I', t);
    execute format(
      'create policy "lectura publica" on public.%I for select to anon, authenticated using (true)', t
    );
    execute format('drop policy if exists "escritura autenticada" on public.%I', t);
    execute format(
      'create policy "escritura autenticada" on public.%I for all to authenticated using (true) with check (true)', t
    );
  end loop;
end $$;
