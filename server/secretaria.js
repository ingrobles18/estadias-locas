import { enrichBeneficiary, findBeneficiary, listBeneficiaries, readJson, registerConsultation, send } from "./utils.js";

export async function handleSecretaria(req, res, url, db) {
  if (req.method === "GET" && url.pathname === "/api/secretaria/beneficiarios") {
    return send(res, 200, listBeneficiaries(db, url.searchParams.get("q")));
  }

  const beneficiaryMatch = url.pathname.match(/^\/api\/secretaria\/beneficiarios\/(\d+)$/);
  if (beneficiaryMatch && req.method === "GET") {
    const beneficiary = findBeneficiary(db, beneficiaryMatch[1]);
    if (!beneficiary) return send(res, 404, { message: "Beneficiario no encontrado" });
    return send(res, 200, enrichBeneficiary(db, beneficiary));
  }

  if (req.method === "GET" && url.pathname === "/api/secretaria/expedientes") {
    const rows = listBeneficiaries(db, url.searchParams.get("q")).map((row) => ({
      id: row.id,
      folio: row.folio,
      nombre: row.nombre,
      curp: row.curp,
      domicilio: row.domicilio,
      telefono: row.telefono,
      colonia_fraccionamiento: row.colonia_fraccionamiento,
      lote: row.lote,
      manzana: row.manzana,
      superficie: row.superficie,
      concepto: row.concepto,
      fecha_inicio: row.fecha_inicio,
      fecha_entrega: row.fecha_entrega,
      estatus: row.estatus
    }));
    return send(res, 200, rows);
  }

  if (req.method === "POST" && url.pathname === "/api/secretaria/consultas") {
    const body = await readJson(req);
    const beneficiary = findBeneficiary(db, body.beneficiario_id);
    if (!beneficiary) return send(res, 404, { message: "Beneficiario no encontrado" });
    const checkin = await registerConsultation(body, beneficiary, "secretaria");
    return send(res, 201, checkin);
  }

  return send(res, 404, { message: "Ruta de Secretaria no encontrada" });
}
