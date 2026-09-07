import assert from "node:assert/strict";
import test from "node:test";
import { filterCobranzaBeneficiaries } from "./cobranza.js";
import { enrichBeneficiary } from "./utils.js";

function dateWithMonthOffset(offset) {
  const value = new Date();
  value.setDate(1);
  value.setMonth(value.getMonth() + offset);
  return value.toISOString().slice(0, 10);
}

const db = {
  beneficiarios: [
    {
      id: 1,
      folio: "A-1",
      nombre: "Persona con atraso",
      manzana: "5",
      lote: "10",
      mensualidad: 2100,
      monto_total_credito: 100000,
      numero_mensualidades: 48,
      fecha_inicio: dateWithMonthOffset(-8),
      estatus: "activo"
    },
    {
      id: 2,
      folio: "A-2",
      nombre: "Persona futura",
      manzana: "5",
      lote: "11",
      mensualidad: 1500,
      monto_total_credito: 50000,
      numero_mensualidades: 24,
      fecha_inicio: dateWithMonthOffset(1),
      estatus: "activo"
    },
    {
      id: 3,
      folio: "A-3",
      nombre: "Otra manzana",
      manzana: "15",
      lote: "10",
      mensualidad: 1000,
      monto_total_credito: 50000,
      numero_mensualidades: 24,
      fecha_inicio: dateWithMonthOffset(-4),
      estatus: "activo"
    }
  ],
  pagos: []
};

function filter(query = "") {
  return filterCobranzaBeneficiaries(db, new URLSearchParams(query)).rows;
}

test("no marca como atrasada una mensualidad futura", () => {
  const future = enrichBeneficiary(db, db.beneficiarios[1]);
  assert.equal(future.resumen.mensualidades_atrasadas, 0);
  assert.equal(future.resumen.adeudo_atrasado, 0);
});

test("filtra manzana y lote mediante coincidencia exacta", () => {
  assert.deepEqual(filter("manzana=5").map((row) => row.id), [1, 2]);
  assert.deepEqual(filter("manzana=5&lote=10").map((row) => row.id), [1]);
});

test("aplica mínimos con comparación mayor o igual", () => {
  const rows = filter("min_mensualidades=5&min_adeudo=10000");
  assert.deepEqual(rows.map((row) => row.id), [1]);
  assert.ok(rows[0].resumen.mensualidades_atrasadas >= 5);
  assert.ok(rows[0].resumen.adeudo_atrasado >= 10000);
});

test("combina todos los filtros con AND", () => {
  assert.deepEqual(
    filter("manzana=5&lote=10&min_mensualidades=5&min_adeudo=10000").map((row) => row.id),
    [1]
  );
  assert.equal(filter("manzana=5&lote=11&min_mensualidades=1").length, 0);
});

test("rechaza mínimos negativos o no numéricos", () => {
  assert.ok(filterCobranzaBeneficiaries(db, new URLSearchParams("min_adeudo=-1")).error);
  assert.ok(filterCobranzaBeneficiaries(db, new URLSearchParams("min_mensualidades=abc")).error);
});
