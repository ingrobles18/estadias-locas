-- Ejecutar una sola vez en Supabase SQL Editor.
-- Completa las columnas que la aplicacion ya utiliza.

alter table public.creditos
  add column if not exists observaciones_finanzas text default '',
  add column if not exists fecha_observacion_finanzas timestamp without time zone,
  add column if not exists usuario_observacion_finanzas_id bigint references public.usuarios_sistema(id_usuario);

alter table public.consultas
  add column if not exists area text,
  add column if not exists motivo text;
