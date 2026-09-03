-- Ejecutar una sola vez en Supabase SQL Editor.
-- Completa las columnas que la aplicacion ya utiliza.

do $$
begin
  if exists (select 1 from information_schema.columns where table_schema = 'public' and table_name = 'creditos' and column_name = 'observaciones_finanzas') then
    alter table public.creditos rename column observaciones_finanzas to observaciones_cobranza;
  end if;
  if exists (select 1 from information_schema.columns where table_schema = 'public' and table_name = 'creditos' and column_name = 'fecha_observacion_finanzas') then
    alter table public.creditos rename column fecha_observacion_finanzas to fecha_observacion_cobranza;
  end if;
  if exists (select 1 from information_schema.columns where table_schema = 'public' and table_name = 'creditos' and column_name = 'usuario_observacion_finanzas_id') then
    alter table public.creditos rename column usuario_observacion_finanzas_id to usuario_observacion_cobranza_id;
  end if;
end $$;

alter table public.creditos
  add column if not exists observaciones_cobranza text default '',
  add column if not exists fecha_observacion_cobranza timestamp without time zone,
  add column if not exists usuario_observacion_cobranza_id bigint references public.usuarios_sistema(id_usuario);

update public.usuarios_sistema
set usuario = 'cobranza', rol = 'cobranza', password = 'cobranza123'
where usuario = 'finanzas' or rol = 'finanzas';

alter table public.consultas
  add column if not exists area text,
  add column if not exists motivo text;
