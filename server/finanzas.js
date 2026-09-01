import { enrichBeneficiary, findBeneficiary, listBeneficiaries, readJson, registerConsultation, saveFinanceObservations, send } from "./utils.js";

export async function handleFinanzas(req, res, url, db) {
  if (req.method === "GET" && url.pathname === "/api/finanzas/beneficiarios") {
    return send(res, 200, listBeneficiaries(db, url.searchParams.get("q")));
  }

  const beneficiaryMatch = url.pathname.match(/^\/api\/finanzas\/beneficiarios\/(\d+)$/);
  if (beneficiaryMatch && req.method === "GET") {
    const beneficiary = findBeneficiary(db, beneficiaryMatch[1]);
    if (!beneficiary) return send(res, 404, { message: "Beneficiario no encontrado" });
    return send(res, 200, enrichBeneficiary(db, beneficiary));
  }

  const observationsMatch = url.pathname.match(/^\/api\/finanzas\/beneficiarios\/(\d+)\/observaciones$/);
  if (observationsMatch && req.method === "PATCH") {
    const body = await readJson(req);
    const beneficiary = findBeneficiary(db, observationsMatch[1]);
    if (!beneficiary) return send(res, 404, { message: "Beneficiario no encontrado" });
    await saveFinanceObservations(beneficiary, body);
    return send(res, 200, { ...enrichBeneficiary(db, beneficiary), observaciones_finanzas: body.observaciones_finanzas || "" });
  }

  if (req.method === "GET" && url.pathname === "/api/finanzas/resumen") {
    const rows = listBeneficiaries(db, url.searchParams.get("q"));
    const resumen = rows.reduce(
      (totals, row) => ({
        cartera: totals.cartera + row.monto_total_credito,
        pagado: totals.pagado + row.resumen.total_pagado,
        saldo_pendiente: totals.saldo_pendiente + row.resumen.saldo_pendiente,
        mensualidades_atrasadas: totals.mensualidades_atrasadas + row.resumen.mensualidades_atrasadas
      }),
      { cartera: 0, pagado: 0, saldo_pendiente: 0, mensualidades_atrasadas: 0 }
    );
    return send(res, 200, resumen);
  }

  if (req.method === "POST" && url.pathname === "/api/finanzas/consultas") {
    const body = await readJson(req);
    const beneficiary = findBeneficiary(db, body.beneficiario_id);
    if (!beneficiary) return send(res, 404, { message: "Beneficiario no encontrado" });
    const checkin = await registerConsultation(body, beneficiary, "finanzas");
    return send(res, 201, checkin);
  }

  return send(res, 404, { message: "Ruta de Finanzas no encontrada" });
}
