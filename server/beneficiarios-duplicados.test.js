import assert from "node:assert/strict";
import test from "node:test";
import { findDuplicateBeneficiary } from "./utils.js";

const existentes = [
  {
    id: 1,
    nombre: "Juan Pérez",
    manzana: "5",
    lote: "10",
    domicilio: "Calle A"
  }
];

test("Caso 1: guarda un beneficiario nuevo con datos distintos", () => {
  const duplicado = findDuplicateBeneficiary(existentes, {
    nombre: "María López",
    manzana: "5",
    lote: "10",
    domicilio: "Calle B"
  });

  assert.equal(duplicado, undefined);
});

test("Caso 2: rechaza un beneficiario duplicado exacto", () => {
  const duplicado = findDuplicateBeneficiary(existentes, {
    nombre: "Juan Pérez",
    manzana: "5",
    lote: "10",
    domicilio: "Calle A"
  });

  assert.ok(duplicado);
  assert.equal(duplicado.id, 1);
});

test("Caso 3: permite la misma persona con otro lote", () => {
  const duplicado = findDuplicateBeneficiary(existentes, {
    nombre: "Juan Pérez",
    manzana: "5",
    lote: "11",
    domicilio: "Calle A"
  });

  assert.equal(duplicado, undefined);
});
