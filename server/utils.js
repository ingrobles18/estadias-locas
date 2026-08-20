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

function monthsBetween(startDate, endDate = new Date()) {
  const start = new Date(`${startDate}T00:00:00`);
  return Math.max(1, (endDate.getFullYear() - start.getFullYear()) * 12 + endDate.getMonth() - start.getMonth() + 1);
}

function addMonths(dateText, months) {
  const date = new Date(`${dateText}T00:00:00`);
  date.setMonth(date.getMonth() + months);
  return date.toISOString().slice(0, 10);
}

export function enrichBeneficiary(db, beneficiary) {
  const pagos = db.pagos
    .filter((payment) => payment.beneficiario_id === beneficiary.id)
    .sort((a, b) => new Date(b.fecha_pago) - new Date(a.fecha_pago));
  const totalPagado = pagos.reduce((sum, payment) => sum + Number(payment.monto_pagado), 0);
  const saldo = Math.max(Number(beneficiary.monto_total_credito) - totalPagado, 0);
  const mesesTotales = Math.ceil(Number(beneficiary.monto_total_credito) / Number(beneficiary.mensualidad));
  const mensualidadActual = Math.min(Math.floor(totalPagado / Number(beneficiary.mensualidad)), mesesTotales);
  const mesesTranscurridos = monthsBetween(beneficiary.fecha_inicio);
  const mensualidadesAtrasadas = Math.max(mesesTranscurridos - mensualidadActual, 0);
  const progreso = Number(((totalPagado / Number(beneficiary.monto_total_credito)) * 100).toFixed(1));
  const mensualidades = Array.from({ length: mesesTotales }, (_, index) => {
    const numero = index + 1;
    const pagado = numero <= mensualidadActual;
    return {
      id: `${beneficiary.id}-${numero}`,
      beneficiario_id: beneficiary.id,
      numero_mes: numero,
      monto_esperado: Number(beneficiary.mensualidad),
      estatus: pagado ? "pagado" : numero <= mesesTranscurridos ? "atrasado" : "pendiente",
      fecha_vencimiento: addMonths(beneficiary.fecha_inicio, index)
    };
  });

  return {
    ...beneficiary,
    pagos,
    mensualidades,
    resumen: {
      total_pagado: totalPagado,
      saldo_pendiente: saldo,
      mensualidad_actual: mensualidadActual,
      mensualidades_totales: mesesTotales,
      mensualidades_atrasadas: mensualidadesAtrasadas,
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
    "Access-Control-Allow-Methods": "GET,POST,PATCH,OPTIONS"
  });
  res.end(contentType === "application/json" ? JSON.stringify(data) : data);
}

export function listBeneficiaries(db, queryText) {
  const query = String(queryText || "").toLowerCase().trim();
  return db.beneficiarios
    .filter((row) => row.estatus !== "baja")
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
