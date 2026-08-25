import fs from "node:fs/promises";
import path from "node:path";
import { fileURLToPath } from "node:url";

const __dirname = path.dirname(fileURLToPath(import.meta.url));
const dbPath = path.join(__dirname, "db.json");

export async function readDb() {
  return JSON.parse(await fs.readFile(dbPath, "utf8"));
}

export async function writeDb(db) {
  await fs.writeFile(dbPath, JSON.stringify(db, null, 2));
}

export function nextId(rows) {
  return rows.length ? Math.max(...rows.map((row) => row.id)) + 1 : 1;
}

export function formatPhone(value) {
  const digits = String(value || "").replace(/\D/g, "").slice(0, 10);
  if (digits.length <= 3) return digits;
  if (digits.length <= 6) return `${digits.slice(0, 3)}-${digits.slice(3)}`;
  if (digits.length <= 8) return `${digits.slice(0, 3)}-${digits.slice(3, 6)}-${digits.slice(6)}`;
  return `${digits.slice(0, 3)}-${digits.slice(3, 6)}-${digits.slice(6, 8)}-${digits.slice(8)}`;
}

function monthsBetween(startDate, endDate = new Date()) {
  const start = new Date(`${startDate}T00:00:00`);
  return Math.max(1, (endDate.getFullYear() - start.getFullYear()) * 12 + endDate.getMonth() - start.getMonth() + 1);
}

function monthKey(dateText) {
  return String(dateText || "").slice(0, 7);
}

function addMonths(dateText, months) {
  const date = new Date(`${dateText}T00:00:00`);
  date.setMonth(date.getMonth() + months);
  return date.toISOString().slice(0, 10);
}

function latestPaymentDate(pagos) {
  return pagos.reduce((latest, payment) => {
    const paymentDate = new Date(`${payment.fecha_pago}T00:00:00`);
    return paymentDate > latest ? paymentDate : latest;
  }, new Date());
}

export function enrichBeneficiary(db, beneficiary) {
  const pagos = db.pagos
    .filter((payment) => payment.beneficiario_id === beneficiary.id)
    .sort((a, b) => new Date(b.fecha_pago) - new Date(a.fecha_pago));
  const totalPagado = pagos.reduce((sum, payment) => sum + Number(payment.monto_pagado), 0);
  const montoTotal = Number(beneficiary.monto_total_credito || 0);
  const mensualidad = Number(beneficiary.mensualidad || 0);
  const saldo = Math.max(montoTotal - totalPagado, 0);
  const mesesTotales = mensualidad > 0 ? Math.ceil(montoTotal / mensualidad) : 0;
  const paymentsByMonth = new Map(pagos.map((payment) => [monthKey(payment.fecha_pago), payment]));
  const paidMonthKeys = new Set(paymentsByMonth.keys());
  const mesesTranscurridos = monthsBetween(beneficiary.fecha_inicio, latestPaymentDate(pagos));
  const progreso = montoTotal > 0 ? Number(((totalPagado / montoTotal) * 100).toFixed(1)) : 0;
  const mesesRenderizados = Math.min(mesesTotales, 360);
  const mensualidades = Array.from({ length: mesesRenderizados }, (_, index) => {
    const numero = index + 1;
    const fechaVencimiento = addMonths(beneficiary.fecha_inicio, index);
    const pagado = paidMonthKeys.has(monthKey(fechaVencimiento));
    return {
      id: `${beneficiary.id}-${numero}`,
      beneficiario_id: beneficiary.id,
      numero_mes: numero,
      monto_esperado: Number(beneficiary.mensualidad),
      estatus: pagado ? "pagado" : numero <= mesesTranscurridos ? "atrasado" : "pendiente",
      fecha_vencimiento: fechaVencimiento,
      pago: paymentsByMonth.get(monthKey(fechaVencimiento)) || null
    };
  });
  const mensualidadActual = mensualidades.filter((month) => month.estatus === "pagado").length;
  const mensualidadesAtrasadas = mensualidades.filter((month) => month.estatus === "atrasado").length;
  const adeudoAtrasado = Math.min(mensualidadesAtrasadas * mensualidad, saldo);

  return {
    ...beneficiary,
    pagos,
    mensualidades,
    resumen: {
      total_pagado: totalPagado,
      saldo_pendiente: saldo,
      adeudo_atrasado: adeudoAtrasado,
      mensualidad_actual: mensualidadActual,
      mensualidades_totales: mesesTotales,
      mensualidades_atrasadas: mensualidadesAtrasadas,
      fechas_atrasadas: mensualidades
        .filter((month) => month.estatus === "atrasado")
        .map((month) => month.fecha_vencimiento),
      progreso
    }
  };
}

export function publicUser(user) {
  const { password, ...safeUser } = user;
  return safeUser;
}

export async function readJson(req) {
  const chunks = [];
  for await (const chunk of req) chunks.push(chunk);
  if (!chunks.length) return {};
  return JSON.parse(Buffer.concat(chunks).toString("utf8"));
}

export function send(res, status, data, contentType = "application/json") {
  res.writeHead(status, {
    "Content-Type": contentType,
    "Access-Control-Allow-Origin": "*",
    "Access-Control-Allow-Headers": "Content-Type",
    "Access-Control-Allow-Methods": "GET,POST,PATCH,DELETE,OPTIONS"
  });
  res.end(contentType === "application/json" ? JSON.stringify(data) : data);
}

export function listBeneficiaries(db, queryText, options = {}) {
  const query = String(queryText || "").toLowerCase().trim();
  return db.beneficiarios
    .filter((row) => options.includeInactive !== false || row.estatus !== "baja")
    .filter((row) => !query || row.folio.toLowerCase().includes(query) || row.nombre.toLowerCase().includes(query))
    .map((row) => enrichBeneficiary(db, row));
}

export function findBeneficiary(db, id) {
  return db.beneficiarios.find((row) => row.id === Number(id));
}

export async function registerConsultation(req, db, area) {
  const body = await readJson(req);
  const checkin = {
    id: nextId(db.consultas),
    beneficiario_id: Number(body.beneficiario_id),
    usuario_id: Number(body.usuario_id),
    area,
    motivo: body.motivo || "Consulta de expediente",
    fecha: new Date().toISOString()
  };
  db.consultas.push(checkin);
  await writeDb(db);
  return checkin;
}
