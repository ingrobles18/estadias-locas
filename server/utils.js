import supabase from "./supabase.js";

function throwDbError(error, context) {
  if (error) throw new Error(`${context}: ${error.message}`);
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
  const mesesTotales = Number(beneficiary.numero_mensualidades) || (mensualidad > 0 ? Math.ceil(montoTotal / mensualidad) : 0);
  const paymentsByMonth = new Map(pagos.map((payment) => [monthKey(payment.fecha_pago), payment]));
  const paidMonthKeys = new Set(paymentsByMonth.keys());
  const mesesTranscurridos = monthsBetween(beneficiary.fecha_inicio, latestPaymentDate(pagos));
  const progreso = montoTotal > 0 ? Number(((totalPagado / montoTotal) * 100).toFixed(1)) : 0;
  const mensualidades = Array.from({ length: Math.min(mesesTotales, 360) }, (_, index) => {
    const numero = index + 1;
    const fechaVencimiento = addMonths(beneficiary.fecha_inicio, index);
    const pagado = paidMonthKeys.has(monthKey(fechaVencimiento));
    return {
      id: `${beneficiary.id}-${numero}`,
      beneficiario_id: beneficiary.id,
      numero_mes: numero,
      monto_esperado: mensualidad,
      estatus: pagado ? "pagado" : numero <= mesesTranscurridos ? "atrasado" : "pendiente",
      fecha_vencimiento: fechaVencimiento,
      pago: paymentsByMonth.get(monthKey(fechaVencimiento)) || null
    };
  });
  const mensualidadActual = mensualidades.filter((month) => month.estatus === "pagado").length;
  const mensualidadesAtrasadas = mensualidades.filter((month) => month.estatus === "atrasado").length;
  return {
    ...beneficiary,
    pagos,
    mensualidades,
    resumen: {
      total_pagado: totalPagado,
      saldo_pendiente: saldo,
      adeudo_atrasado: Math.min(mensualidadesAtrasadas * mensualidad, saldo),
      mensualidad_actual: mensualidadActual,
      mensualidades_totales: mesesTotales,
      mensualidades_atrasadas: mensualidadesAtrasadas,
      fechas_atrasadas: mensualidades.filter((month) => month.estatus === "atrasado").map((month) => month.fecha_vencimiento),
      progreso
    }
  };
}

export async function readDb() {
  const [beneficiariosResult, creditosResult, pagosResult] = await Promise.all([
    supabase.from("beneficiarios").select("*"),
    supabase.from("creditos").select("*"),
    supabase.from("pagos").select("*")
  ]);
  throwDbError(beneficiariosResult.error, "No se pudieron leer los beneficiarios");
  throwDbError(creditosResult.error, "No se pudieron leer los creditos");
  throwDbError(pagosResult.error, "No se pudieron leer los pagos");
  const peopleByFolio = new Map(beneficiariosResult.data.map((row) => [row.folio, row]));
  const beneficiarios = creditosResult.data.map((credito) => ({
    ...(peopleByFolio.get(credito.folio) || {}),
    ...credito,
    id: Number(credito.id_credito),
    superficie: Number(peopleByFolio.get(credito.folio)?.superficie || 0),
    monto_total_credito: Number(credito.monto_total_credito || 0),
    mensualidad: Number(credito.mensualidad || 0),
    enganche_total: Number(credito.enganche_total || 0)
  }));
  const pagos = pagosResult.data.map((row) => ({
    ...row,
    id: Number(row.id_pago),
    beneficiario_id: Number(row.id_credito),
    cajero_id: Number(row.usuario_id),
    monto_pagado: Number(row.monto_pagado)
  }));
  return { beneficiarios, pagos };
}

export function publicUser(user) {
  const { password, id_usuario, ...safeUser } = user;
  return { id: Number(id_usuario), ...safeUser };
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

function normalizeSearchText(value) {
  return String(value ?? "")
    .normalize("NFD")
    .replace(/[\u0300-\u036f]/g, "")
    .toLowerCase();
}

function compactNumber(value) {
  const number = Number(value || 0);
  return Number.isFinite(number) ? String(Math.round(number * 100) / 100).replace(/\.0+$/, "") : "";
}

function queryTokens(queryText) {
  return normalizeSearchText(queryText)
    .replace(/(\d),(?=\d{3}\b)/g, "$1")
    .split(/[^a-z0-9.]+/)
    .filter((token) => token && !["de", "del", "la", "el", "los", "las", "por", "con", "y"].includes(token));
}

function searchAmount(queryText) {
  const match = String(queryText || "").match(/\$?\s*\d[\d,]*(?:\.\d{1,2})?/);
  if (!match) return null;
  const amount = Number(match[0].replace(/[$,\s]/g, ""));
  return Number.isFinite(amount) ? Math.round(amount * 100) : null;
}

function isMoneyToken(token) {
  return /^\d+(?:\.\d{1,2})?$/.test(token);
}

function cents(value) {
  return Math.round(Number(value || 0) * 100);
}

function debtAmountMatch(row, amount) {
  const resumen = row.resumen || {};
  return cents(resumen.saldo_pendiente) === amount || cents(resumen.adeudo_atrasado) === amount;
}

function isDebtToken(token) {
  return ["adeudo", "adeudos", "deuda", "deudas", "debe", "deudor", "deudores", "saldo", "pendiente"].includes(token);
}

function semanticTokenMatch(row, token) {
  const resumen = row.resumen || {};
  if (isDebtToken(token)) {
    return Number(resumen.saldo_pendiente || 0) > 0;
  }
  if (["atraso", "atrasos", "atrasado", "atrasados", "vencido", "vencidos"].includes(token)) {
    return Number(resumen.adeudo_atrasado || 0) > 0 || Number(resumen.mensualidades_atrasadas || 0) > 0;
  }
  if (["liquidado", "liquidados", "pagado", "pagados"].includes(token)) {
    return row.estatus !== "baja" && Number(resumen.saldo_pendiente || 0) <= 0;
  }
  if (["baja", "bajas"].includes(token)) {
    return row.estatus === "baja";
  }
  return null;
}

function searchableBeneficiaryText(row) {
  const resumen = row.resumen || {};
  const values = [
    row.folio,
    row.nombre,
    row.curp,
    row.domicilio,
    row.telefono,
    row.correo,
    row.fecha_nacimiento,
    row.ocupacion,
    row.estado_civil,
    row.ine,
    row.colonia_fraccionamiento,
    row.lote,
    row.manzana,
    row.concepto,
    row.estatus,
    row.observaciones_generales,
    "mensualidad mensualidades pago pagos",
    row.monto_total_credito,
    row.mensualidad,
    row.enganche_total,
    resumen.total_pagado,
    resumen.saldo_pendiente,
    resumen.adeudo_atrasado,
    resumen.mensualidad_actual,
    resumen.mensualidades_totales,
    resumen.mensualidades_atrasadas,
    ...(resumen.fechas_atrasadas || [])
  ];
  const rawText = values.map((value) => String(value ?? "")).join(" ");
  const compactAmounts = [
    row.monto_total_credito,
    row.mensualidad,
    row.enganche_total,
    resumen.total_pagado,
    resumen.saldo_pendiente,
    resumen.adeudo_atrasado
  ].map(compactNumber);
  return normalizeSearchText(`${rawText} ${compactAmounts.join(" ")}`);
}

export function listBeneficiaries(db, queryText) {
  const tokens = queryTokens(queryText);
  const amount = searchAmount(queryText);
  const hasDebtSearch = tokens.some(isDebtToken);
  const matchesQuery = (row) => {
    if (hasDebtSearch && amount !== null && !debtAmountMatch(row, amount)) return false;
    const text = searchableBeneficiaryText(row);
    return tokens.every((token) => {
      if (hasDebtSearch && amount !== null && isMoneyToken(token)) return true;
      const semanticMatch = semanticTokenMatch(row, token);
      return semanticMatch === null ? text.includes(token) : semanticMatch;
    });
  };
  return db.beneficiarios
    .map((row) => enrichBeneficiary(db, row))
    .filter((row) => !tokens.length || matchesQuery(row));
}

export function findBeneficiary(db, id) {
  return db.beneficiarios.find((row) => row.id === Number(id));
}

export async function insertBeneficiary(body) {
  const person = {
    folio: body.folio,
    nombre: body.nombre,
    curp: body.curp || "",
    domicilio: body.domicilio || "",
    telefono: formatPhone(body.telefono),
    correo: body.correo || "",
    fecha_nacimiento: body.fecha_nacimiento || null,
    ocupacion: body.ocupacion || "",
    estado_civil: body.estado_civil || "",
    ine: body.ine || "",
    colonia_fraccionamiento: body.colonia_fraccionamiento || "",
    lote: body.lote || "",
    manzana: body.manzana || "",
    superficie: Number(body.superficie || 0),
    observaciones_generales: body.observaciones_generales || ""
  };
  const { error: personError } = await supabase.from("beneficiarios").insert(person);
  throwDbError(personError, "No se pudo crear el beneficiario");
  const mensualidad = Number(body.mensualidad || 0);
  const monto = Number(body.monto_total_credito || 0);
  const credit = {
    folio: body.folio,
    concepto: body.concepto || "Vivienda",
    monto_total_credito: monto,
    mensualidad,
    numero_mensualidades: mensualidad > 0 ? Math.ceil(monto / mensualidad) : 0,
    fecha_inicio: body.fecha_inicio,
    fecha_entrega: body.fecha_entrega || body.fecha_inicio,
    enganche_total: Number(body.enganche_total || 0),
    estatus: "activo"
  };
  const { data, error } = await supabase.from("creditos").insert(credit).select("id_credito").single();
  if (error) {
    await supabase.from("beneficiarios").delete().eq("folio", body.folio);
    throwDbError(error, "No se pudo crear el credito");
  }
  return Number(data.id_credito);
}

export async function updateBeneficiary(existing, body) {
  const personFields = [
    "nombre",
    "curp",
    "domicilio",
    "correo",
    "fecha_nacimiento",
    "ocupacion",
    "estado_civil",
    "ine",
    "colonia_fraccionamiento",
    "lote",
    "manzana",
    "observaciones_generales"
  ];
  const person = Object.fromEntries(personFields.filter((key) => body[key] !== undefined).map((key) => [key, body[key]]));
  if (person.fecha_nacimiento === "") person.fecha_nacimiento = null;
  if (body.telefono !== undefined) person.telefono = formatPhone(body.telefono);
  if (body.superficie !== undefined) person.superficie = Number(body.superficie);
  if (Object.keys(person).length) {
    const { error } = await supabase.from("beneficiarios").update(person).eq("folio", existing.folio);
    throwDbError(error, "No se pudo actualizar el beneficiario");
  }
  const creditFields = ["concepto", "fecha_inicio", "fecha_entrega", "estatus"];
  const credit = Object.fromEntries(creditFields.filter((key) => body[key] !== undefined).map((key) => [key, body[key]]));
  for (const key of ["monto_total_credito", "mensualidad", "enganche_total"]) {
    if (body[key] !== undefined) credit[key] = Number(body[key]);
  }
  const monto = credit.monto_total_credito ?? existing.monto_total_credito;
  const mensualidad = credit.mensualidad ?? existing.mensualidad;
  credit.numero_mensualidades = mensualidad > 0 ? Math.ceil(monto / mensualidad) : 0;
  const { error } = await supabase.from("creditos").update(credit).eq("id_credito", existing.id);
  throwDbError(error, "No se pudo actualizar el credito");
}

export async function deleteBeneficiary(existing) {
  const { error: paymentsError } = await supabase.from("pagos").delete().eq("id_credito", existing.id);
  throwDbError(paymentsError, "No se pudieron eliminar los pagos");
  const { error: consultationsError } = await supabase.from("consultas").delete().eq("folio", existing.folio);
  throwDbError(consultationsError, "No se pudieron eliminar las consultas");
  const { error: creditError } = await supabase.from("creditos").delete().eq("id_credito", existing.id);
  throwDbError(creditError, "No se pudo eliminar el credito");
  const { count, error: remainingError } = await supabase.from("creditos").select("id_credito", { count: "exact", head: true }).eq("folio", existing.folio);
  throwDbError(remainingError, "No se pudo comprobar el expediente");
  if (!count) {
    const { error } = await supabase.from("beneficiarios").delete().eq("folio", existing.folio);
    throwDbError(error, "No se pudo eliminar el beneficiario");
  }
}

export async function insertPayment(beneficiary, body) {
  const amount = Number(body.monto_pagado);
  const payment = {
    id_credito: beneficiary.id,
    monto_pagado: Number(amount.toFixed(2)),
    fecha_pago: body.fecha_pago,
    usuario_id: Number(body.cajero_id),
    comprobante: body.comprobante || null
  };
  const { data, error } = await supabase.from("pagos").insert(payment).select("id_pago").single();
  throwDbError(error, "No se pudo registrar el pago");
  if (!payment.comprobante) {
    const comprobante = `REC-${String(data.id_pago).padStart(4, "0")}`;
    const { error: updateError } = await supabase.from("pagos").update({ comprobante }).eq("id_pago", data.id_pago);
    throwDbError(updateError, "No se pudo generar el comprobante");
  }
}

export async function registerConsultation(body, beneficiary, area) {
  const consultation = {
    folio: beneficiary.folio,
    usuario_id: Number(body.usuario_id),
    area,
    motivo: body.motivo || "Consulta de expediente",
    fecha: new Date().toISOString()
  };
  let { data, error } = await supabase.from("consultas").insert(consultation).select("*").single();
  if (error?.code === "PGRST204") {
    ({ data, error } = await supabase.from("consultas").insert({
      folio: consultation.folio,
      usuario_id: consultation.usuario_id,
      fecha: consultation.fecha
    }).select("*").single());
  }
  throwDbError(error, "No se pudo registrar la consulta");
  return { ...data, id: Number(data.id_consulta), beneficiario_id: beneficiary.id };
}

export async function saveCobranzaObservations(existing, body) {
  const values = {
    observaciones_cobranza: body.observaciones_cobranza || "",
    fecha_observacion_cobranza: new Date().toISOString(),
    usuario_observacion_cobranza_id: Number(body.usuario_id)
  };
  const { error } = await supabase.from("creditos").update(values).eq("id_credito", existing.id);
  throwDbError(error, "No se pudieron guardar las observaciones");
}
