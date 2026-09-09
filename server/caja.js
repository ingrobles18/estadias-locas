import {
  deleteBeneficiary,
  enrichBeneficiary,
  findBeneficiary,
  insertBeneficiary,
  insertPayment,
  listBeneficiaries,
  readJson,
  readDb,
  registerConsultation,
  send,
  updateBeneficiary
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

    try {
      const id = await insertBeneficiary(body);
      const freshDb = await readDb();
      return send(res, 201, enrichBeneficiary(freshDb, findBeneficiary(freshDb, id)));
    } catch (error) {
      if (error?.statusCode === 400) {
        return send(res, 400, { message: "Ya existe un beneficiario registrado con los mismos datos." });
      }
      if (error && (error.code === "23505" || /duplicate key|violates unique constraint|beneficiario_unico/i.test(String(error.message)))) {
        return send(res, 400, { error: "El beneficiario ya existe con esos mismos datos" });
      }
      throw error;
    }
  }

  if (beneficiaryMatch && req.method === "PATCH") {
    const body = await readJson(req);
    const beneficiary = findBeneficiary(db, beneficiaryMatch[1]);
    if (!beneficiary) return send(res, 404, { message: "Beneficiario no encontrado" });
    await updateBeneficiary(beneficiary, body);
    const freshDb = await readDb();
    return send(res, 200, enrichBeneficiary(freshDb, findBeneficiary(freshDb, beneficiary.id)));
  }

  if (beneficiaryMatch && req.method === "DELETE") {
    const beneficiary = findBeneficiary(db, beneficiaryMatch[1]);
    if (!beneficiary) return send(res, 404, { message: "Beneficiario no encontrado" });
    await deleteBeneficiary(beneficiary);
    return send(res, 200, { ok: true });
  }

  if (req.method === "POST" && url.pathname === "/api/caja/pagos") {
    const body = await readJson(req);
    const beneficiary = findBeneficiary(db, body.beneficiario_id);
    if (!beneficiary) return send(res, 404, { message: "Beneficiario no encontrado" });
    const amount = Number(body.monto_pagado);
    if (!Number.isFinite(amount) || amount <= 0) return send(res, 400, { message: "El monto debe ser mayor a cero" });
    await insertPayment(beneficiary, body);
    const freshDb = await readDb();
    return send(res, 201, enrichBeneficiary(freshDb, findBeneficiary(freshDb, beneficiary.id)));
  }

  if (req.method === "POST" && url.pathname === "/api/caja/consultas") {
    const body = await readJson(req);
    const beneficiary = findBeneficiary(db, body.beneficiario_id);
    if (!beneficiary) return send(res, 404, { message: "Beneficiario no encontrado" });
    const checkin = await registerConsultation(body, beneficiary, "caja");
    return send(res, 201, checkin);
  }

  return send(res, 404, { message: "Ruta de Caja no encontrada" });
}
