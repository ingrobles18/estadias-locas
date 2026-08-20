import {
  enrichBeneficiary,
  findBeneficiary,
  listBeneficiaries,
  nextId,
  readJson,
  registerConsultation,
  send,
  writeDb
} from "./utils.js";

export async function handleCaja(req, res, url, db) {
  if (req.method === "GET" && url.pathname === "/api/caja/beneficiarios") {
    return send(res, 200, listBeneficiaries(db, url.searchParams.get("q")));
  }

  const beneficiaryMatch = url.pathname.match(/^\/api\/caja\/beneficiarios\/(\d+)$/);
  if (beneficiaryMatch && req.method === "GET") {
    const beneficiary = findBeneficiary(db, beneficiaryMatch[1]);
    if (!beneficiary) return send(res, 404, { message: "Beneficiario no encontrado" });
    return send(res, 200, enrichBeneficiary(db, beneficiary));
  }

  if (req.method === "POST" && url.pathname === "/api/caja/beneficiarios") {
    const body = await readJson(req);
    if (db.beneficiarios.some((row) => row.folio === body.folio)) return send(res, 409, { message: "El folio ya existe" });
    const beneficiary = {
      id: nextId(db.beneficiarios),
      folio: body.folio,
      nombre: body.nombre,
      curp: body.curp || "",
      domicilio: body.domicilio || "",
      telefono: body.telefono || "",
      colonia_fraccionamiento: body.colonia_fraccionamiento || "",
      lote: body.lote || "",
      manzana: body.manzana || "",
      superficie: Number(body.superficie || 0),
      concepto: body.concepto || "Vivienda",
      monto_total_credito: Number(body.monto_total_credito || 0),
      mensualidad: Number(body.mensualidad || 0),
      fecha_inicio: body.fecha_inicio,
      fecha_entrega: body.fecha_entrega || body.fecha_inicio,
      enganche_total: Number(body.enganche_total || 0),
      estatus: "activo"
    };
    db.beneficiarios.push(beneficiary);
    await writeDb(db);
    return send(res, 201, enrichBeneficiary(db, beneficiary));
  }

  if (beneficiaryMatch && req.method === "PATCH") {
    const body = await readJson(req);
    const index = db.beneficiarios.findIndex((row) => row.id === Number(beneficiaryMatch[1]));
    if (index === -1) return send(res, 404, { message: "Beneficiario no encontrado" });
    db.beneficiarios[index] = {
      ...db.beneficiarios[index],
      ...body,
      id: db.beneficiarios[index].id,
      monto_total_credito: Number(body.monto_total_credito ?? db.beneficiarios[index].monto_total_credito),
      mensualidad: Number(body.mensualidad ?? db.beneficiarios[index].mensualidad),
      superficie: Number(body.superficie ?? db.beneficiarios[index].superficie),
      enganche_total: Number(body.enganche_total ?? db.beneficiarios[index].enganche_total)
    };
    delete db.beneficiarios[index].rol;
    await writeDb(db);
    return send(res, 200, enrichBeneficiary(db, db.beneficiarios[index]));
  }

  if (req.method === "POST" && url.pathname === "/api/caja/pagos") {
    const body = await readJson(req);
    const beneficiary = findBeneficiary(db, body.beneficiario_id);
    if (!beneficiary) return send(res, 404, { message: "Beneficiario no encontrado" });
    const id = nextId(db.pagos);
    db.pagos.push({
      id,
      beneficiario_id: Number(body.beneficiario_id),
      monto_pagado: Number(body.monto_pagado),
      fecha_pago: body.fecha_pago,
      mes_correspondiente: Number(body.mes_correspondiente),
      cajero_id: Number(body.cajero_id),
      comprobante: body.comprobante || `REC-${String(id).padStart(4, "0")}`
    });
    await writeDb(db);
    return send(res, 201, enrichBeneficiary(db, beneficiary));
  }

  if (req.method === "POST" && url.pathname === "/api/caja/consultas") {
    const checkin = await registerConsultation(req, db, "caja");
    return send(res, 201, checkin);
  }

  return send(res, 404, { message: "Ruta de Caja no encontrada" });
}
