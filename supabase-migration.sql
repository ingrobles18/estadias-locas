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

alter table public.beneficiarios
  add column if not exists curp text default '',
  add column if not exists correo text default '',
  add column if not exists fecha_nacimiento date,
  add column if not exists ocupacion text default '',
  add column if not exists estado_civil text default '',
  add column if not exists ine text default '',
  add column if not exists observaciones_generales text default '';

update public.usuarios_sistema
set usuario = 'cobranza', rol = 'cobranza', password = 'cobranza123'
where usuario = 'finanzas' or rol = 'finanzas';

alter table public.consultas
  add column if not exists area text,
  add column if not exists motivo text;

-- Registros demo para pruebas de busqueda, saldos y meses atrasados.
with demo_personas (
  folio, nombre, curp, domicilio, telefono, correo, fecha_nacimiento, ocupacion, estado_civil, ine,
  colonia_fraccionamiento, lote, manzana, superficie, observaciones_generales
) as (
  values
    ('INM-001', 'Maria Gonzalez Lopez', 'GOLM900101MGTNPR01', 'Av. Principal 120', '477-123-45-67', 'maria.gonzalez@example.com', date '1990-01-01', 'Comerciante', 'Casada', '1234567890123', 'Centro', '12', '4', 96, 'Expediente completo.'),
    ('INM-002', 'Jose Luis Ramirez Perez', 'RAPJ850315HGTMRL02', 'Calle Roble 45', '477-223-45-67', 'jose.ramirez@example.com', date '1985-03-15', 'Albanil', 'Soltero', '2234567890123', 'Las Torres', '8', '2', 105, ''),
    ('INM-003', 'Ana Sofia Martinez Cruz', 'MACA920720MGTNRN03', 'Privada Naranjo 17', '477-323-45-67', 'ana.martinez@example.com', date '1992-07-20', 'Empleada', 'Union libre', '3234567890123', 'San Miguel', '21', '5', 90, ''),
    ('INM-004', 'Carlos Hernandez Vega', 'HEVC780512HGTNRR04', 'Blvd. Hidalgo 302', '477-423-45-67', 'carlos.hernandez@example.com', date '1978-05-12', 'Chofer', 'Casado', '4234567890123', 'El Mirador', '3', '1', 112, ''),
    ('INM-005', 'Lucia Torres Aguilar', 'TOAL881108MGTGRL05', 'Calle Sauce 88', '477-523-45-67', 'lucia.torres@example.com', date '1988-11-08', 'Maestra', 'Soltera', '5234567890123', 'La Esperanza', '14', '7', 100, 'Credito liquidado.'),
    ('INM-006', 'Miguel Angel Flores Diaz', 'FODM930204HGTLLG06', 'Circuito Reforma 64', '477-623-45-67', 'miguel.flores@example.com', date '1993-02-04', 'Tecnico', 'Casado', '6234567890123', 'Los Pinos', '6', '9', 98, ''),
    ('INM-007', 'Patricia Navarro Ruiz', 'NARP810930MGTZTR07', 'Av. Jardin 210', '477-723-45-67', 'patricia.navarro@example.com', date '1981-09-30', 'Costurera', 'Divorciada', '7234567890123', 'Jardines', '19', '3', 87, ''),
    ('INM-008', 'Roberto Salinas Mora', 'SAMR760618HGTLLB08', 'Cerrada Lago 33', '477-823-45-67', 'roberto.salinas@example.com', date '1976-06-18', 'Jubilado', 'Viudo', '8234567890123', 'Valle Verde', '5', '11', 120, ''),
    ('INM-009', 'Elena Castillo Moreno', 'CAME950427MGTLSL09', 'Calle Palma 59', '477-923-45-67', 'elena.castillo@example.com', date '1995-04-27', 'Enfermera', 'Soltera', '9234567890123', 'Santa Rosa', '22', '8', 92, ''),
    ('INM-010', 'Fernando Ortega Luna', 'OELF840713HGTNRR10', 'Camino Real 101', '477-103-45-67', 'fernando.ortega@example.com', date '1984-07-13', 'Herrero', 'Casado', '1034567890123', 'La Luz', '10', '6', 108, 'Expediente dado de baja.')
)
insert into public.beneficiarios (
  folio, nombre, curp, domicilio, telefono, correo, fecha_nacimiento, ocupacion, estado_civil, ine,
  colonia_fraccionamiento, lote, manzana, superficie, observaciones_generales
)
select *
from demo_personas
where not exists (
  select 1 from public.beneficiarios b where b.folio = demo_personas.folio
);

with demo_creditos (
  folio, concepto, monto_total_credito, mensualidad, numero_mensualidades, fecha_inicio, fecha_entrega,
  enganche_total, estatus, observaciones_cobranza, meses_pagados
) as (
  values
    ('INM-001', 'Vivienda social', 120000, 2500, 48, date '2026-01-01', date '2026-01-15', 10000, 'activo', 'Pendiente de llamada de seguimiento.', 2),
    ('INM-002', 'Vivienda social', 98000, 2200, 45, date '2026-02-01', date '2026-02-12', 8000, 'activo', 'Tiene tres mensualidades atrasadas.', 1),
    ('INM-003', 'Vivienda social', 110000, 2500, 44, date '2026-03-01', date '2026-03-18', 9000, 'activo', '', 4),
    ('INM-004', 'Vivienda social', 150000, 3000, 50, date '2026-01-01', date '2026-01-20', 12000, 'activo', 'Prioridad de cobranza por cinco atrasos.', 0),
    ('INM-005', 'Vivienda social', 75000, 2500, 30, date '2025-10-01', date '2025-10-16', 15000, 'activo', '', 30),
    ('INM-006', 'Vivienda social', 132000, 2750, 48, date '2026-04-01', date '2026-04-14', 11000, 'activo', '', 2),
    ('INM-007', 'Vivienda social', 90000, 2000, 45, date '2026-05-01', date '2026-05-11', 7000, 'activo', '', 1),
    ('INM-008', 'Vivienda social', 160000, 3200, 50, date '2026-02-01', date '2026-02-22', 13000, 'activo', 'Programar visita domiciliaria.', 3),
    ('INM-009', 'Vivienda social', 104000, 2600, 40, date '2026-03-01', date '2026-03-19', 8500, 'activo', '', 2),
    ('INM-010', 'Vivienda social', 118000, 2400, 50, date '2026-01-01', date '2026-01-17', 9500, 'baja', '', 0)
)
insert into public.creditos (
  folio, concepto, monto_total_credito, mensualidad, numero_mensualidades, fecha_inicio, fecha_entrega,
  enganche_total, estatus, observaciones_cobranza
)
select
  folio, concepto, monto_total_credito, mensualidad, numero_mensualidades, fecha_inicio, fecha_entrega,
  enganche_total, estatus, observaciones_cobranza
from demo_creditos
where not exists (
  select 1 from public.creditos c where c.folio = demo_creditos.folio
);

with demo_pagos (folio, mensualidad, fecha_inicio, meses_pagados) as (
  values
    ('INM-001', 2500, date '2026-01-01', 2),
    ('INM-002', 2200, date '2026-02-01', 1),
    ('INM-003', 2500, date '2026-03-01', 4),
    ('INM-004', 3000, date '2026-01-01', 0),
    ('INM-005', 2500, date '2025-10-01', 30),
    ('INM-006', 2750, date '2026-04-01', 2),
    ('INM-007', 2000, date '2026-05-01', 1),
    ('INM-008', 3200, date '2026-02-01', 3),
    ('INM-009', 2600, date '2026-03-01', 2),
    ('INM-010', 2400, date '2026-01-01', 0)
),
pagos_generados as (
  select
    c.id_credito,
    d.mensualidad,
    (d.fecha_inicio + ((g.numero - 1) || ' months')::interval)::date as fecha_pago,
    coalesce((select id_usuario from public.usuarios_sistema order by id_usuario limit 1), 1) as usuario_id,
    'REC-' || replace(d.folio, 'INM-', '') || lpad(g.numero::text, 2, '0') as comprobante
  from demo_pagos d
  join public.creditos c on c.folio = d.folio
  join lateral generate_series(1, d.meses_pagados) as g(numero) on true
)
insert into public.pagos (id_credito, monto_pagado, fecha_pago, usuario_id, comprobante)
select id_credito, mensualidad, fecha_pago, usuario_id, comprobante
from pagos_generados pg
where not exists (
  select 1 from public.pagos p where p.comprobante = pg.comprobante
);
