insert into public.memory_blocks (owner, start_kb, size_kb) values
  ('luces', 0, 128),
  ('camaras', 128, 256),
  ('cerraduras', 384, 64),
  ('clima', 448, 192),
  ('sensores', 640, 96);

insert into public.files (path, content, size_bytes)
select v.path, v.content, octet_length(v.content)
from (values
  ('/config/home.json', '{"casa":"RobotOS SmartHome","ramKb":1024,"discoBytes":10000000}'),
  ('/config/rutinas.json', '{"noche":{"luces":"off","cerraduras":"on"},"manana":{"luces":"on","clima":"22C"}}'),
  ('/logs/system.log', 'Sistema iniciado correctamente')
) as v(path, content)
on conflict (path) do nothing;

insert into public.files (path, content, size_bytes) values
  ('/surveillance/camara_1/clip_001.clip', 'clip:camara_1:1', 1500000),
  ('/surveillance/camara_1/clip_002.clip', 'clip:camara_1:2', 1200000),
  ('/surveillance/camara_2/clip_003.clip', 'clip:camara_2:3', 1800000)
on conflict (path) do nothing;

insert into public.surveillance_clips (camera_id, path, size_mb, is_protected, recorded_at) values
  ('camara_1', '/surveillance/camara_1/clip_001.clip', 1.50, false, now() - interval '3 hours'),
  ('camara_1', '/surveillance/camara_1/clip_002.clip', 1.20, true, now() - interval '2 hours'),
  ('camara_2', '/surveillance/camara_2/clip_003.clip', 1.80, false, now() - interval '1 hour')
on conflict (path) do nothing;

insert into public.logs (created_at, level, source, message) values
  (now() - interval '6 hours', 'INFO', 'storage', 'Modulo de almacenamiento iniciado'),
  (now() - interval '5 hours', 'INFO', 'surveillance', 'Clip guardado /surveillance/camara_1/clip_001.clip (1.5 MB, protegido=false)'),
  (now() - interval '4 hours', 'DEBUG', 'memory', 'Bloque asignado a luces (128 KB)'),
  (now() - interval '3 hours', 'WARNING', 'surveillance', 'Clip antiguo eliminado: /surveillance/camara_1/clip_000.clip'),
  (now() - interval '2 hours', 'INFO', 'surveillance', 'Clip guardado /surveillance/camara_1/clip_002.clip (1.2 MB, protegido=true)'),
  (now() - interval '90 minutes', 'WARNING', 'energy', 'Consumo total 6.07 kWh supera el umbral de 5.0 kWh'),
  (now() - interval '1 hour', 'ERROR', 'surveillance', 'Sin espacio para clip de camara_2 (2.0 MB)'),
  (now() - interval '30 minutes', 'CRITICAL', 'memory', 'Memoria disponible por debajo del 10%'),
  (now() - interval '5 minutes', 'INFO', 'storage', 'Rotacion de logs completada');

insert into public.energy_devices (device, watts) values
  ('luces_sala', 12),
  ('camara_1', 8),
  ('camara_2', 8),
  ('cerradura_principal', 5),
  ('aire_acondicionado', 1500)
on conflict (device) do nothing;

insert into public.energy_usage (device, seconds, recorded_at) values
  ('luces_sala', 21600, now() - interval '1 day'),
  ('aire_acondicionado', 14400, now() - interval '1 day'),
  ('camara_1', 86400, now() - interval '1 day'),
  ('camara_2', 86400, now() - interval '1 day'),
  ('cerradura_principal', 86400, now() - interval '1 day'),
  ('luces_sala', 18000, now() - interval '2 hours'),
  ('aire_acondicionado', 7200, now() - interval '2 hours');
