drop table if exists public.memory_benchmarks;

create table if not exists public.experiment_results (
  id bigint generated always as identity primary key,
  lab text not null,
  name text not null,
  params jsonb not null default '{}'::jsonb,
  metrics jsonb not null default '{}'::jsonb,
  created_at timestamptz not null default now()
);

create index if not exists experiment_results_lab_idx
  on public.experiment_results (lab, created_at desc);

do $$
declare
  t text;
begin
  foreach t in array array[
    'memory_blocks', 'files', 'logs',
    'surveillance_clips', 'energy_devices', 'energy_usage',
    'experiment_results'
  ]
  loop
    execute format('alter table public.%I enable row level security', t);
    execute format('drop policy if exists "lectura publica" on public.%I', t);
    execute format(
      'create policy "lectura publica" on public.%I for select to anon, authenticated using (true)', t
    );
    execute format('drop policy if exists "escritura autenticada" on public.%I', t);
    execute format('drop policy if exists "escritura publica" on public.%I', t);
    execute format(
      'create policy "escritura publica" on public.%I for all to anon, authenticated using (true) with check (true)', t
    );
  end loop;
end $$;
