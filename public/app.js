const portal = window.INMUVI_PORTAL || {
  role: null,
  title: "Sistema de control de pagos",
  user: "caja",
  password: "caja123",
  views: ["consulta", "caja", "cobranza"]
};
const API = portal.apiBase || `/api/${portal.role || "caja"}`;
const portalOptions = [
  { role: "caja", title: "Caja", user: "caja", password: "caja123", href: "caja.html" },
  { role: "cobranza", title: "Cobranza", user: "cobranza", password: "cobranza123", href: "cobranza.html" },
  { role: "secretaria", title: "Secretaria Tecnica", user: "secretaria", password: "secretaria123", href: "secretaria.html" }
];
const state = {
  user: JSON.parse(localStorage.getItem("inmuvi-user") || "null"),
  rows: [],
  selected: null,
  query: "",
  listFilter: "debt",
  listCollapsed: false,
  menuHidden: localStorage.getItem("inmuvi-menu-hidden") === "true",
  cobranzaFilters: {
    manzana: "",
    lote: "",
    min_mensualidades: "",
    min_adeudo: ""
  },
  view: portal.views[0] || "consulta"
};

const fields = {
  folio: "",
  nombre: "",
  curp: "",
  domicilio: "",
  telefono: "",
  correo: "",
  fecha_nacimiento: "",
  ocupacion: "",
  estado_civil: "",
  ine: "",
  colonia_fraccionamiento: "",
  lote: "",
  manzana: "",
  superficie: "",
  concepto: "Vivienda social",
  monto_total_credito: "",
  mensualidad: "",
  fecha_inicio: new Date().toISOString().slice(0, 10),
  fecha_entrega: new Date().toISOString().slice(0, 10),
  enganche_total: "",
  observaciones_generales: ""
};

const root = document.getElementById("root");

function brand() {
  return `
    <div class="brand">
      <img class="brand-logo" src="inmuvi-logo.svg" alt="INMUVI" />
      <div><b>INMUVI</b><span>${esc(portal.title)}</span></div>
    </div>
  `;
}

function money(value) {
  return new Intl.NumberFormat("es-MX", { style: "currency", currency: "MXN" }).format(Number(value || 0));
}

function phone(value) {
  const digits = String(value || "").replace(/\D/g, "").slice(0, 10);
  if (digits.length <= 3) return digits;
  if (digits.length <= 6) return `${digits.slice(0, 3)}-${digits.slice(3)}`;
  if (digits.length <= 8) return `${digits.slice(0, 3)}-${digits.slice(3, 6)}-${digits.slice(6)}`;
  return `${digits.slice(0, 3)}-${digits.slice(3, 6)}-${digits.slice(6, 8)}-${digits.slice(8)}`;
}

function date(value) {
  if (!value) return "Sin fecha";
  return new Intl.DateTimeFormat("es-MX", { day: "2-digit", month: "short", year: "numeric" }).format(new Date(`${value}T00:00:00`));
}

function addMonths(dateText, months) {
  const date = new Date(`${dateText}T00:00:00`);
  date.setMonth(date.getMonth() + months);
  return date.toISOString().slice(0, 10);
}

function createDemoBeneficiary(data) {
  const mensualidadesTotales = Math.ceil(data.monto_total_credito / data.mensualidad);
  const pagos = Array.from({ length: data.meses_pagados }, (_, index) => ({
    id: Number(`${data.id}${String(index + 1).padStart(2, "0")}`),
    beneficiario_id: data.id,
    fecha_pago: addMonths(data.fecha_inicio, index),
    monto_pagado: data.mensualidad,
    comprobante: `REC-${String(data.id).padStart(2, "0")}${String(index + 1).padStart(2, "0")}`
  }));
  const mensualidades = Array.from({ length: Math.min(mensualidadesTotales, data.meses_pagados + data.meses_atrasados + 3) }, (_, index) => {
    const numeroMes = index + 1;
    const pago = pagos[index] || null;
    const estatus = pago ? "pagado" : numeroMes <= data.meses_pagados + data.meses_atrasados ? "atrasado" : "pendiente";
    return {
      id: `${data.id}-${numeroMes}`,
      beneficiario_id: data.id,
      numero_mes: numeroMes,
      monto_esperado: data.mensualidad,
      estatus,
      fecha_vencimiento: addMonths(data.fecha_inicio, index),
      pago
    };
  });
  const totalPagado = pagos.reduce((sum, payment) => sum + payment.monto_pagado, 0);
  const saldoPendiente = Math.max(data.monto_total_credito - totalPagado, 0);
  const mensualidadesAtrasadas = mensualidades.filter((month) => month.estatus === "atrasado").length;
  return {
    id: data.id,
    folio: data.folio,
    nombre: data.nombre,
    curp: data.curp,
    domicilio: data.domicilio,
    telefono: data.telefono,
    correo: data.correo,
    fecha_nacimiento: data.fecha_nacimiento,
    ocupacion: data.ocupacion,
    estado_civil: data.estado_civil,
    ine: data.ine,
    colonia_fraccionamiento: data.colonia_fraccionamiento,
    lote: data.lote,
    manzana: data.manzana,
    superficie: data.superficie,
    concepto: data.concepto || "Vivienda social",
    monto_total_credito: data.monto_total_credito,
    mensualidad: data.mensualidad,
    fecha_inicio: data.fecha_inicio,
    fecha_entrega: data.fecha_entrega,
    enganche_total: data.enganche_total,
    observaciones_generales: data.observaciones_generales || "",
    estatus: data.estatus || "activo",
    observaciones_cobranza: data.observaciones_cobranza || "",
    pagos,
    mensualidades,
    resumen: {
      total_pagado: totalPagado,
      saldo_pendiente: saldoPendiente,
      adeudo_atrasado: Math.min(mensualidadesAtrasadas * data.mensualidad, saldoPendiente),
      mensualidad_actual: data.meses_pagados,
      mensualidades_totales: mensualidadesTotales,
      mensualidades_atrasadas: mensualidadesAtrasadas,
      fechas_atrasadas: mensualidades.filter((month) => month.estatus === "atrasado").map((month) => month.fecha_vencimiento),
      progreso: data.monto_total_credito > 0 ? Number(((totalPagado / data.monto_total_credito) * 100).toFixed(1)) : 0
    }
  };
}

const demoBeneficiaries = [
  createDemoBeneficiary({
    id: 1,
    folio: "INM-001",
    nombre: "Maria Gonzalez Lopez",
    curp: "GOLM900101MGTNPR01",
    domicilio: "Av. Principal 120",
    telefono: "4771234567",
    correo: "maria.gonzalez@example.com",
    fecha_nacimiento: "1990-01-01",
    ocupacion: "Comerciante",
    estado_civil: "Casada",
    ine: "1234567890123",
    colonia_fraccionamiento: "Centro",
    lote: "12",
    manzana: "4",
    superficie: 96,
    monto_total_credito: 120000,
    mensualidad: 2500,
    fecha_inicio: "2026-01-01",
    fecha_entrega: "2026-01-15",
    enganche_total: 10000,
    meses_pagados: 2,
    meses_atrasados: 1,
    observaciones_generales: "Expediente completo.",
    observaciones_cobranza: "Pendiente de llamada de seguimiento."
  }),
  createDemoBeneficiary({ id: 2, folio: "INM-002", nombre: "Jose Luis Ramirez Perez", curp: "RAPJ850315HGTMRL02", domicilio: "Calle Roble 45", telefono: "4772234567", correo: "jose.ramirez@example.com", fecha_nacimiento: "1985-03-15", ocupacion: "Albanil", estado_civil: "Soltero", ine: "2234567890123", colonia_fraccionamiento: "Las Torres", lote: "8", manzana: "2", superficie: 105, monto_total_credito: 98000, mensualidad: 2200, fecha_inicio: "2026-02-01", fecha_entrega: "2026-02-12", enganche_total: 8000, meses_pagados: 1, meses_atrasados: 3, observaciones_cobranza: "Tiene tres mensualidades atrasadas." }),
  createDemoBeneficiary({ id: 3, folio: "INM-003", nombre: "Ana Sofia Martinez Cruz", curp: "MACA920720MGTNRN03", domicilio: "Privada Naranjo 17", telefono: "4773234567", correo: "ana.martinez@example.com", fecha_nacimiento: "1992-07-20", ocupacion: "Empleada", estado_civil: "Union libre", ine: "3234567890123", colonia_fraccionamiento: "San Miguel", lote: "21", manzana: "5", superficie: 90, monto_total_credito: 110000, mensualidad: 2500, fecha_inicio: "2026-03-01", fecha_entrega: "2026-03-18", enganche_total: 9000, meses_pagados: 4, meses_atrasados: 0 }),
  createDemoBeneficiary({ id: 4, folio: "INM-004", nombre: "Carlos Hernandez Vega", curp: "HEVC780512HGTNRR04", domicilio: "Blvd. Hidalgo 302", telefono: "4774234567", correo: "carlos.hernandez@example.com", fecha_nacimiento: "1978-05-12", ocupacion: "Chofer", estado_civil: "Casado", ine: "4234567890123", colonia_fraccionamiento: "El Mirador", lote: "3", manzana: "1", superficie: 112, monto_total_credito: 150000, mensualidad: 3000, fecha_inicio: "2026-01-01", fecha_entrega: "2026-01-20", enganche_total: 12000, meses_pagados: 0, meses_atrasados: 5, observaciones_cobranza: "Prioridad de cobranza por cinco atrasos." }),
  createDemoBeneficiary({ id: 5, folio: "INM-005", nombre: "Lucia Torres Aguilar", curp: "TOAL881108MGTGRL05", domicilio: "Calle Sauce 88", telefono: "4775234567", correo: "lucia.torres@example.com", fecha_nacimiento: "1988-11-08", ocupacion: "Maestra", estado_civil: "Soltera", ine: "5234567890123", colonia_fraccionamiento: "La Esperanza", lote: "14", manzana: "7", superficie: 100, monto_total_credito: 75000, mensualidad: 2500, fecha_inicio: "2025-10-01", fecha_entrega: "2025-10-16", enganche_total: 15000, meses_pagados: 30, meses_atrasados: 0, estatus: "activo", observaciones_generales: "Credito liquidado." }),
  createDemoBeneficiary({ id: 6, folio: "INM-006", nombre: "Miguel Angel Flores Diaz", curp: "FODM930204HGTLLG06", domicilio: "Circuito Reforma 64", telefono: "4776234567", correo: "miguel.flores@example.com", fecha_nacimiento: "1993-02-04", ocupacion: "Tecnico", estado_civil: "Casado", ine: "6234567890123", colonia_fraccionamiento: "Los Pinos", lote: "6", manzana: "9", superficie: 98, monto_total_credito: 132000, mensualidad: 2750, fecha_inicio: "2026-04-01", fecha_entrega: "2026-04-14", enganche_total: 11000, meses_pagados: 2, meses_atrasados: 2 }),
  createDemoBeneficiary({ id: 7, folio: "INM-007", nombre: "Patricia Navarro Ruiz", curp: "NARP810930MGTZTR07", domicilio: "Av. Jardin 210", telefono: "4777234567", correo: "patricia.navarro@example.com", fecha_nacimiento: "1981-09-30", ocupacion: "Costurera", estado_civil: "Divorciada", ine: "7234567890123", colonia_fraccionamiento: "Jardines", lote: "19", manzana: "3", superficie: 87, monto_total_credito: 90000, mensualidad: 2000, fecha_inicio: "2026-05-01", fecha_entrega: "2026-05-11", enganche_total: 7000, meses_pagados: 1, meses_atrasados: 0 }),
  createDemoBeneficiary({ id: 8, folio: "INM-008", nombre: "Roberto Salinas Mora", curp: "SAMR760618HGTLLB08", domicilio: "Cerrada Lago 33", telefono: "4778234567", correo: "roberto.salinas@example.com", fecha_nacimiento: "1976-06-18", ocupacion: "Jubilado", estado_civil: "Viudo", ine: "8234567890123", colonia_fraccionamiento: "Valle Verde", lote: "5", manzana: "11", superficie: 120, monto_total_credito: 160000, mensualidad: 3200, fecha_inicio: "2026-02-01", fecha_entrega: "2026-02-22", enganche_total: 13000, meses_pagados: 3, meses_atrasados: 4, observaciones_cobranza: "Programar visita domiciliaria." }),
  createDemoBeneficiary({ id: 9, folio: "INM-009", nombre: "Elena Castillo Moreno", curp: "CAME950427MGTLSL09", domicilio: "Calle Palma 59", telefono: "4779234567", correo: "elena.castillo@example.com", fecha_nacimiento: "1995-04-27", ocupacion: "Enfermera", estado_civil: "Soltera", ine: "9234567890123", colonia_fraccionamiento: "Santa Rosa", lote: "22", manzana: "8", superficie: 92, monto_total_credito: 104000, mensualidad: 2600, fecha_inicio: "2026-03-01", fecha_entrega: "2026-03-19", enganche_total: 8500, meses_pagados: 2, meses_atrasados: 1 }),
  createDemoBeneficiary({ id: 10, folio: "INM-010", nombre: "Fernando Ortega Luna", curp: "OELF840713HGTNRR10", domicilio: "Camino Real 101", telefono: "4771034567", correo: "fernando.ortega@example.com", fecha_nacimiento: "1984-07-13", ocupacion: "Herrero", estado_civil: "Casado", ine: "1034567890123", colonia_fraccionamiento: "La Luz", lote: "10", manzana: "6", superficie: 108, monto_total_credito: 118000, mensualidad: 2400, fecha_inicio: "2026-01-01", fecha_entrega: "2026-01-17", enganche_total: 9500, meses_pagados: 0, meses_atrasados: 0, estatus: "baja", observaciones_generales: "Expediente dado de baja." })
];

function paymentMonth(value) {
  return String(value || "").slice(5, 7) || "Sin mes";
}

function esc(value) {
  return String(value ?? "").replace(/[&<>"']/g, (char) => ({
    "&": "&amp;",
    "<": "&lt;",
    ">": "&gt;",
    '"': "&quot;",
    "'": "&#039;"
  })[char]);
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

function matchesSearch(row, queryText) {
  const tokens = queryTokens(queryText);
  if (!tokens.length) return true;
  const amount = searchAmount(queryText);
  const hasDebtSearch = tokens.some(isDebtToken);
  if (hasDebtSearch && amount !== null && !debtAmountMatch(row, amount)) return false;
  const text = searchableBeneficiaryText(row);
  return tokens.every((token) => {
    if (hasDebtSearch && amount !== null && isMoneyToken(token)) return true;
    const semanticMatch = semanticTokenMatch(row, token);
    return semanticMatch === null ? text.includes(token) : semanticMatch;
  });
}

function readBody(options) {
  try {
    return JSON.parse(options.body || "{}");
  } catch {
    return {};
  }
}

function demoApi(path, options = {}) {
  const url = new URL(path, window.location.origin);
  const method = options.method || "GET";
  if (url.pathname === "/login" && method === "POST") {
    const body = readBody(options);
    if (body.usuario === portal.user && body.password === portal.password) {
      return {
        user: {
          id: 1,
          usuario: portal.user,
          nombre: portal.title,
          rol: portal.role || body.rol || "caja"
        }
      };
    }
    throw new Error("Usuario o password incorrecto");
  }
  if (url.pathname === "/beneficiarios" && method === "GET") {
    return demoBeneficiaries.filter((row) => matchesSearch(row, url.searchParams.get("q")));
  }
  const beneficiaryMatch = url.pathname.match(/^\/beneficiarios\/(\d+)$/);
  if (beneficiaryMatch && method === "GET") {
    return demoBeneficiaries.find((row) => row.id === Number(beneficiaryMatch[1]));
  }
  if (url.pathname === "/consultas" && method === "POST") return { ok: true };
  throw new Error("Backend no disponible. Configura Supabase o usa los datos demo para revisar la pantalla.");
}

async function api(path, options = {}) {
  const base = path === "/login" ? "/api" : API;

  try {
    const response = await fetch(`${base}${path}`, {
      headers: { "Content-Type": "application/json" },
      ...options
    });
    const text = await response.text();
    let data = null;
    try {
      data = text ? JSON.parse(text) : {};
    } catch {
      data = { message: text };
    }
    if (!response.ok && response.status === 404 && base !== "/api") {
      const fallbackResponse = await fetch(`/api${path}`, {
        headers: { "Content-Type": "application/json" },
        ...options
      });
      const fallbackText = await fallbackResponse.text();
      let fallbackData = null;
      try {
        fallbackData = fallbackText ? JSON.parse(fallbackText) : {};
      } catch {
        fallbackData = { message: fallbackText };
      }
      if (!fallbackResponse.ok && fallbackResponse.status === 404) return demoApi(path, options);
      if (!fallbackResponse.ok) throw new Error(fallbackData.message || "Error de comunicacion");
      return fallbackData;
    }
    if (!response.ok && response.status === 404) return demoApi(path, options);
    if (!response.ok) throw new Error(data.message || "Error de comunicacion");
    return data;
  } catch (error) {
    const fallbackMode = window.location.protocol === "file:" || window.location.protocol === "about:";
    if (fallbackMode || error instanceof TypeError) {
      return demoApi(path, options);
    }
    throw error;
  }
}

function handleAction(action) {
  return async (event) => {
    try {
      await action(event);
    } catch (error) {
      notify(error.message);
    }
  };
}

function notify(message) {
  const notice = document.createElement("div");
  notice.className = "notice";
  notice.setAttribute("role", "alert");
  notice.textContent = message;
  document.body.appendChild(notice);
  setTimeout(() => notice.remove(), 6000);
}

async function loadRows(search = state.query) {
  if (!state.user) return;
  const params = new URLSearchParams({ q: search });
  if (state.user.rol === "cobranza") {
    Object.entries(state.cobranzaFilters).forEach(([key, value]) => {
      if (String(value).trim() !== "") params.set(key, value);
    });
  }
  state.rows = await api(`/beneficiarios?${params.toString()}`);
  state.selected = state.rows.find((row) => row.id === state.selected?.id) || state.rows[0] || null;
  render();
}

async function refreshSelected(id = state.selected?.id) {
  if (!id) return;
  const fresh = await api(`/beneficiarios/${id}`);
  state.selected = fresh;
  state.rows = state.rows.map((row) => row.id === fresh.id ? fresh : row);
  render();
}

function renderLogin() {
  const activePortal = portalOptions.find((option) => option.role === portal.role) || portalOptions[0];
  root.innerHTML = `
    <main class="login">
      <section class="login-visual">
        <div class="login-copy">
          <img class="login-emblem" src="inmuvi-logo.svg" alt="INMUVI" />
          <p>Control institucional</p>
          <h1>${esc(portal.title)}</h1>
          <span>Consulta expedientes, pagos y seguimiento desde un portal seguro.</span>
        </div>
        <div class="login-stats">
          <span><b>Pagos</b> al dia</span>
          <span><b>Expedientes</b> claros</span>
          <span><b>Cobranza</b> activa</span>
        </div>
      </section>
      <section class="login-card">
        <form class="login-box" id="loginForm">
          ${brand()}
          <div class="login-heading">
            <p>Acceso institucional</p>
            <h1>Iniciar sesion</h1>
          </div>
          <div class="login-portals" aria-label="Seleccionar usuario">
            ${portalOptions.map((option) => `
              <a
                class="${option.role === activePortal.role ? "active" : ""}"
                href="${option.href}"
                title="${esc(option.user)} / ${esc(option.password)}"
              >
                <b>${esc(option.title)}</b>
                <span>${esc(option.user)} / ${esc(option.password)}</span>
              </a>
            `).join("")}
          </div>
          <label>Usuario<input name="usuario" autocomplete="username" value="${esc(portal.user)}" /></label>
          <label>Password<input name="password" type="password" autocomplete="current-password" value="${esc(portal.password)}" /></label>
          <p class="error" id="loginError"></p>
          <button>Entrar al portal</button>
          <div class="demo">
            <span>Credenciales de prueba</span>
            <b>${esc(portal.user)} / ${esc(portal.password)}</b>
          </div>
        </form>
      </section>
    </main>
  `;

  document.getElementById("loginForm").addEventListener("submit", async (event) => {
    event.preventDefault();
    const body = Object.fromEntries(new FormData(event.currentTarget));
    try {
      const result = await api("/login", { method: "POST", body: JSON.stringify({ ...body, rol: portal.role }) });
      if (portal.role && result.user.rol !== portal.role) {
        throw new Error(`Este acceso corresponde al portal de ${portal.role}`);
      }
      state.user = result.user;
      localStorage.setItem("inmuvi-user", JSON.stringify(result.user));
      await loadRows("");
    } catch (error) {
      document.getElementById("loginError").textContent = error.message;
    }
  });
}

function metric(label, value) {
  return `<article class="metric"><span>${label}</span><b>${value}</b></article>`;
}

function info(label, value, danger = false) {
  return `<div class="info ${danger ? "danger" : ""}"><span>${label}</span><b>${esc(value)}</b></div>`;
}

function renderLateDates(item) {
  const dates = item.resumen.fechas_atrasadas || [];
  return `
    <section class="late-dates">
      <h3>Fechas atrasadas</h3>
      <div class="months">
        ${dates.map((dueDate) => `<span class="atrasado">${date(dueDate)}</span>`).join("") || `<span>Sin fechas atrasadas</span>`}
      </div>
    </section>
  `;
}

function renderList() {
  const canCreate = state.user?.rol === "caja" && state.view === "caja";
  const isCobranza = state.user?.rol === "cobranza";
  const groups = [
    {
      type: "debt",
      title: "Personas que deben",
      rows: state.rows.filter((row) => row.estatus !== "baja" && row.resumen.saldo_pendiente > 0),
      empty: "Sin personas con adeudo"
    },
    {
      type: "paid",
      title: "Ya terminaron de pagar",
      rows: state.rows.filter((row) => row.estatus !== "baja" && row.resumen.saldo_pendiente <= 0),
      empty: "Sin expedientes liquidados"
    },
    {
      type: "inactive",
      title: "Dados de baja",
      rows: state.rows.filter((row) => row.estatus === "baja"),
      empty: "Sin personas dadas de baja"
    }
  ];
  const visibleGroups = groups.filter((group) => group.type === state.listFilter);

  const renderRow = (row) => {
    const isPaid = row.estatus !== "baja" && row.resumen.saldo_pendiente <= 0;
    return `
      <button data-action="select" data-id="${row.id}" class="${state.selected?.id === row.id ? "selected" : ""}">
        <b>
          ${esc(row.folio)}
          ${row.estatus === "baja" ? `<em>Baja</em>` : isPaid ? `<em class="paid">Liquidado</em>` : ""}
        </b>
        <span>${esc(row.nombre)}</span>
        ${isCobranza ? `
          <small>Manzana ${esc(row.manzana || "—")} · Lote ${esc(row.lote || "—")}</small>
          <small>${money(row.mensualidad)} mensual · ${row.resumen.mensualidades_atrasadas} atrasadas</small>
          <small>${money(row.resumen.adeudo_atrasado)} de adeudo atrasado</small>
        ` : `<small>${isPaid ? "Pago terminado" : `${money(row.resumen.saldo_pendiente)} pendiente`}</small>`}
      </button>
    `;
  };

  return `
    <section class="list">
      <h3>Beneficiarios</h3>
      ${canCreate ? `<button class="new-beneficiary-button" data-action="toggle-create">Nuevo beneficiario</button>` : ""}
      <div class="list-filters" aria-label="Filtrar beneficiarios">
        ${groups.map((group) => `
          <button
            type="button"
            data-list-filter="${group.type}"
            class="${state.listFilter === group.type ? "active" : ""}"
          >
            <span>${esc(group.title)}</span>
            <b>${group.rows.length}</b>
          </button>
        `).join("")}
      </div>
      ${state.listCollapsed ? "" : `
        <div class="list-results">
          ${visibleGroups.map((group) => `
            <div class="list-group list-group-${group.type}">
              <div class="list-group-title">
                <span>${group.title}</span>
                <div>
                  <b>${group.rows.length}</b>
                  <button class="list-close" type="button" data-action="collapse-list" aria-label="Ocultar personas">×</button>
                </div>
              </div>
              <div class="list-group-rows">
                ${group.rows.map(renderRow).join("") || `<p class="list-empty">${group.empty}</p>`}
              </div>
            </div>
          `).join("")}
        </div>
      `}
    </section>
  `;
}

function renderCobranzaFilters() {
  const filters = state.cobranzaFilters;
  return `
    <form class="cobranza-filters" id="cobranzaFiltersForm">
      <h3>Filtros de cobranza</h3>
      <label>Manzana
        <input name="manzana" value="${esc(filters.manzana)}" placeholder="Ej. 5" />
      </label>
      <label>Lote
        <input name="lote" value="${esc(filters.lote)}" placeholder="Ej. 10" />
      </label>
      <label>Mensualidades atrasadas desde
        <input name="min_mensualidades" type="number" min="0" step="1" value="${esc(filters.min_mensualidades)}" placeholder="Ej. 3" />
      </label>
      <label>Adeudo atrasado desde
        <input name="min_adeudo" type="number" min="0" step="0.01" value="${esc(filters.min_adeudo)}" placeholder="Ej. 10000" />
      </label>
      <button>Aplicar filtros</button>
      <button type="button" class="secondary" data-action="clear-cobranza-filters">Limpiar</button>
    </form>
  `;
}

function renderHistory(item) {
  const rows = (item.mensualidades || [])
    .filter((month) => month.estatus === "pagado" || month.estatus === "atrasado")
    .slice()
    .sort((a, b) => new Date(b.fecha_vencimiento) - new Date(a.fecha_vencimiento));

  return `
    <section class="history">
      <h3>Historial de pagos</h3>
      <div class="table">
        <div class="head"><span>Fecha</span><span>Mes</span><span>Comprobante</span><span>Monto</span></div>
        ${rows.map((month) => {
          const payment = month.pago;
          return `
          <div class="row ${month.estatus}">
            <span>${esc(payment?.fecha_pago || month.fecha_vencimiento)}</span>
            <span>${paymentMonth(month.fecha_vencimiento)}</span>
            <span>${payment ? esc(payment.comprobante) : "Atrasado"}</span>
            <b>${money(payment?.monto_pagado || month.monto_esperado)}</b>
          </div>
        `;
        }).join("") || `<div class="row"><span>Sin pagos registrados</span><span></span><span></span><b>${money(0)}</b></div>`}
      </div>
    </section>
  `;
}

function renderProfile(item) {
  const isPaid = item.estatus !== "baja" && item.resumen.saldo_pendiente <= 0;
  return `
    <article class="profile">
      <div class="profile-head">
        <div>
          <p>${esc(item.folio)}</p>
          <h2>${esc(item.nombre)}</h2>
          ${item.estatus === "baja" ? `<strong class="status-baja">Baja</strong>` : ""}
          ${isPaid ? `<strong class="status-paid">Liquidado</strong>` : ""}
          <small>Inicio: ${date(item.fecha_inicio)} - Superficie ${esc(item.superficie || 0)} m2</small>
          <span>${esc(item.domicilio)} · Lote ${esc(item.lote)}, Manzana ${esc(item.manzana)}</span>
        </div>
        <button class="secondary" data-action="checkin">Check-in</button>
      </div>
      <div class="progress-label">
        <span>${money(item.resumen.total_pagado)} pagado de ${money(item.monto_total_credito)} costo total</span>
        <b>${item.resumen.progreso}%</b>
      </div>
      <div class="progress"><div style="width:${Math.min(item.resumen.progreso, 100)}%"></div></div>
      <div class="info-grid">
        ${info("Mensualidad", money(item.mensualidad))}
        ${info("Va en mensualidad", `${item.resumen.mensualidad_actual} de ${item.resumen.mensualidades_totales}`)}
        ${info("Costo total del terreno", money(item.monto_total_credito))}
        ${info("Falta por pagar", money(item.resumen.saldo_pendiente))}
        ${info("Atrasadas", item.resumen.mensualidades_atrasadas, item.resumen.mensualidades_atrasadas > 0)}
        ${info("Adeudo atrasado", money(item.resumen.adeudo_atrasado), item.resumen.adeudo_atrasado > 0)}
        ${info("Telefono", phone(item.telefono) || "Sin dato")}
        ${info("CURP", item.curp || "Sin dato")}
        ${info("Correo", item.correo || "Sin dato")}
        ${info("Fecha nacimiento", item.fecha_nacimiento ? date(item.fecha_nacimiento) : "Sin dato")}
        ${info("Ocupacion", item.ocupacion || "Sin dato")}
        ${info("Estado civil", item.estado_civil || "Sin dato")}
        ${info("INE", item.ine || "Sin dato")}
      </div>
      ${item.observaciones_generales ? `<section class="late-dates"><h3>Observaciones generales</h3><p>${esc(item.observaciones_generales)}</p></section>` : ""}
      ${renderLateDates(item)}
      ${renderHistory(item)}
    </article>
  `;
}

function renderCobranzaObservations(item) {
  return `
    <section class="observations panel">
      <h3>Observaciones de Cobranza</h3>
      <form id="cobranzaNotesForm">
        <label>Observaciones
          <textarea name="observaciones_cobranza" rows="5" placeholder="Escribe observaciones del expediente">${esc(item.observaciones_cobranza || "")}</textarea>
        </label>
        <button>Guardar observaciones</button>
      </form>
    </section>
  `;
}

function renderCaja(item) {
  const nextMonth = item.resumen.mensualidad_actual + 1;
  return `
    <section class="actions">
      <form class="panel" id="paymentForm">
        <h3>Registrar abono</h3>
        <label>Monto<input name="monto_pagado" type="number" step="0.01" min="0.01" value="${Number(item.mensualidad || 0).toFixed(2)}" /></label>
        <label>Fecha<input name="fecha_pago" type="date" value="${new Date().toISOString().slice(0, 10)}" /></label>
        <label>Mensualidad<input name="mes_correspondiente" type="number" value="${nextMonth}" /></label>
        <label>Comprobante<input name="comprobante" placeholder="REC-0004" /></label>
        <button>Guardar abono</button>
      </form>
      <form class="panel" id="editForm">
        <h3>Corregir expediente</h3>
        <label>Nombre<input name="nombre" value="${esc(item.nombre)}" /></label>
        <label>CURP<input name="curp" value="${esc(item.curp || "")}" /></label>
        <label>Monto total<input name="monto_total_credito" type="number" step="0.01" min="0" value="${item.monto_total_credito}" /></label>
        <label>Mensualidad<input name="mensualidad" type="number" step="0.01" min="0" value="${item.mensualidad}" /></label>
        <label>Telefono<input name="telefono" type="tel" inputmode="numeric" maxlength="13" value="${esc(phone(item.telefono))}" /></label>
        <label>Correo<input name="correo" type="email" value="${esc(item.correo || "")}" /></label>
        <label>Fecha nacimiento<input name="fecha_nacimiento" type="date" value="${esc(item.fecha_nacimiento || "")}" /></label>
        <label>Ocupacion<input name="ocupacion" value="${esc(item.ocupacion || "")}" /></label>
        <label>Estado civil<input name="estado_civil" value="${esc(item.estado_civil || "")}" /></label>
        <label>INE<input name="ine" value="${esc(item.ine || "")}" /></label>
        <label>Domicilio<input name="domicilio" value="${esc(item.domicilio || "")}" /></label>
        <label>Colonia/fraccionamiento<input name="colonia_fraccionamiento" value="${esc(item.colonia_fraccionamiento || "")}" /></label>
        <label>Lote<input name="lote" value="${esc(item.lote || "")}" /></label>
        <label>Manzana<input name="manzana" value="${esc(item.manzana || "")}" /></label>
        <label>Observaciones generales<textarea name="observaciones_generales" rows="4">${esc(item.observaciones_generales || "")}</textarea></label>
        <label>Estatus
          <select name="estatus">
            <option value="activo" ${item.estatus === "activo" ? "selected" : ""}>Activo</option>
            <option value="baja" ${item.estatus === "baja" ? "selected" : ""}>Baja</option>
          </select>
        </label>
        <button>Aplicar cambios</button>
        <button type="button" class="danger-button" data-action="delete-beneficiary">Eliminar persona</button>
      </form>
    </section>
  `;
}

function renderCreateSection(expanded = false) {
  return `
    <section class="create">
      <button data-action="toggle-create">Nuevo beneficiario</button>
      <div id="createHolder">${expanded ? renderCreateForm() : ""}</div>
    </section>
  `;
}

function renderCreateForm() {
  const numberFields = ["monto_total_credito", "mensualidad", "enganche_total", "superficie"];
  const requiredFields = ["folio", "nombre", "monto_total_credito", "mensualidad", "fecha_inicio"];
  return `
    <form class="create-form" id="createForm">
      ${Object.keys(fields).map((key) => key === "observaciones_generales" ? `
        <label>${key.replaceAll("_", " ")}
          <textarea name="${key}" rows="4">${esc(fields[key])}</textarea>
        </label>
      ` : `
        <label>${key.replaceAll("_", " ")}
          <input
            name="${key}"
            type="${key === "telefono" ? "tel" : key === "correo" ? "email" : key.includes("fecha") ? "date" : numberFields.includes(key) ? "number" : "text"}"
            value="${esc(fields[key])}"
            ${key === "telefono" ? `inputmode="numeric" maxlength="13"` : ""}
            ${numberFields.includes(key) ? `step="0.01" min="0"` : ""}
            ${requiredFields.includes(key) ? "required" : ""}
          />
        </label>
      `).join("")}
      <button>Crear expediente</button>
    </form>
  `;
}

function renderCobranza(item) {
  const next = item.mensualidades.filter((month) => month.estatus !== "pagado").slice(0, 8);
  return `
    <section class="cobranza">
      <h3>Recuperacion y cobranza</h3>
      <div class="info-grid">
        ${info("Descuento VIN", item.concepto.includes("Terreno") ? "No aplicado" : "Sujeto a revision")}
        ${info("Monto mensualidad", money(item.mensualidad))}
        ${info("Atrasadas", item.resumen.mensualidades_atrasadas, item.resumen.mensualidades_atrasadas > 0)}
      </div>
      <div class="months">
        ${next.map((month) => `<span class="${month.estatus}">${month.numero_mes} · ${month.estatus}</span>`).join("")}
      </div>
    </section>
  `;
}

function attachCreateForm() {
  const createForm = document.getElementById("createForm");
  if (!createForm) return;

  createForm.querySelector("input[name='telefono']")?.addEventListener("input", (event) => {
    event.currentTarget.value = phone(event.currentTarget.value);
  });

  createForm.addEventListener("submit", handleAction(async (event) => {
    event.preventDefault();
    const body = Object.fromEntries(new FormData(event.currentTarget));
    const row = await api("/beneficiarios", {
      method: "POST",
      body: JSON.stringify({ ...body, rol: state.user.rol })
    });
    notify("Beneficiario creado");
    state.selected = row;
    await loadRows("");
  }));
}

function attachHandlers() {
  document.querySelectorAll("[data-action='select']").forEach((button) => {
    button.addEventListener("click", () => {
      state.selected = state.rows.find((row) => row.id === Number(button.dataset.id));
      render();
    });
  });

  document.querySelectorAll("[data-view]").forEach((button) => {
    button.addEventListener("click", () => {
      state.view = button.dataset.view;
      render();
    });
  });

  document.querySelectorAll("[data-list-filter]").forEach((button) => {
    button.addEventListener("click", () => {
      state.listFilter = button.dataset.listFilter;
      state.listCollapsed = false;
      render();
    });
  });

  document.querySelector("[data-action='collapse-list']")?.addEventListener("click", () => {
    state.listCollapsed = true;
    render();
  });

  const listResults = document.querySelector(".list-results");
  const listFilters = document.querySelector(".list-filters");
  if (listResults && listFilters) {
    let previousScrollTop = listResults.scrollTop;
    let filtersHidden = false;
    listResults.addEventListener("scroll", () => {
      const currentScrollTop = listResults.scrollTop;
      const scrollingDown = currentScrollTop > previousScrollTop + 2;
      const scrollingUp = currentScrollTop < previousScrollTop - 2;

      if ((currentScrollTop <= 4 || scrollingUp) && filtersHidden) {
        listFilters.classList.remove("is-hidden");
        filtersHidden = false;
      } else if (scrollingDown && !filtersHidden) {
        listFilters.classList.add("is-hidden");
        filtersHidden = true;
      }
      previousScrollTop = currentScrollTop;
    });
  }

  document.getElementById("logout")?.addEventListener("click", () => {
    localStorage.removeItem("inmuvi-user");
    state.user = null;
    state.rows = [];
    state.selected = null;
    render();
  });

  document.querySelectorAll("[data-action='toggle-menu']").forEach((button) => {
    button.addEventListener("click", () => {
      state.menuHidden = !state.menuHidden;
      localStorage.setItem("inmuvi-menu-hidden", String(state.menuHidden));
      render();
    });
  });

  document.getElementById("searchForm")?.addEventListener("submit", handleAction(async (event) => {
    event.preventDefault();
    state.query = event.currentTarget.query.value;
    await loadRows(state.query);
  }));

  document.querySelector("[data-action='clear-search']")?.addEventListener("click", async () => {
    const searchInput = document.querySelector("#searchForm input[name='query']");
    if (searchInput) searchInput.value = "";
    state.query = "";
    await loadRows("");
  });

  document.querySelector("#searchForm input[name='query']")?.addEventListener("input", (event) => {
    document.querySelector("[data-action='clear-search']")?.toggleAttribute("hidden", !event.currentTarget.value.trim());
  });

  document.getElementById("cobranzaFiltersForm")?.addEventListener("submit", handleAction(async (event) => {
    event.preventDefault();
    state.cobranzaFilters = Object.fromEntries(new FormData(event.currentTarget));
    await loadRows(state.query);
  }));

  document.querySelector("[data-action='clear-cobranza-filters']")?.addEventListener("click", handleAction(async () => {
    state.cobranzaFilters = { manzana: "", lote: "", min_mensualidades: "", min_adeudo: "" };
    await loadRows(state.query);
  }));

  document.querySelector("[data-action='checkin']")?.addEventListener("click", handleAction(async () => {
    await api("/consultas", {
      method: "POST",
      body: JSON.stringify({
        beneficiario_id: state.selected.id,
        usuario_id: state.user.id,
        area: state.user.rol,
        motivo: state.view
      })
    });
    notify("Check-in registrado");
  }));

  document.getElementById("paymentForm")?.addEventListener("submit", handleAction(async (event) => {
    event.preventDefault();
    const body = Object.fromEntries(new FormData(event.currentTarget));
    await api("/pagos", {
      method: "POST",
      body: JSON.stringify({ ...body, beneficiario_id: state.selected.id, cajero_id: state.user.id, rol: state.user.rol })
    });
    notify("Abono registrado correctamente");
    await refreshSelected();
  }));

  document.getElementById("editForm")?.addEventListener("submit", handleAction(async (event) => {
    event.preventDefault();
    const body = Object.fromEntries(new FormData(event.currentTarget));
    await api(`/beneficiarios/${state.selected.id}`, {
      method: "PATCH",
      body: JSON.stringify({ ...body, rol: state.user.rol })
    });
    notify("Expediente actualizado");
    await refreshSelected();
  }));

  document.querySelector("[data-action='delete-beneficiary']")?.addEventListener("click", handleAction(async () => {
    if (!window.confirm(`Eliminar a ${state.selected.nombre} y todo su historial de pagos?`)) return;
    await api(`/beneficiarios/${state.selected.id}`, { method: "DELETE" });
    notify("Persona eliminada");
    state.selected = null;
    await loadRows(state.query);
  }));

  document.getElementById("cobranzaNotesForm")?.addEventListener("submit", handleAction(async (event) => {
    event.preventDefault();
    const body = Object.fromEntries(new FormData(event.currentTarget));
    await api(`/beneficiarios/${state.selected.id}/observaciones`, {
      method: "PATCH",
      body: JSON.stringify({ ...body, usuario_id: state.user.id })
    });
    notify("Observaciones guardadas");
    await refreshSelected();
  }));

  document.querySelectorAll("[data-action='toggle-create']").forEach((button) => button.addEventListener("click", () => {
    const holder = document.getElementById("createHolder");
    if (!document.getElementById("createForm")) {
      holder.innerHTML = renderCreateForm();
      attachCreateForm();
    }
    holder.scrollIntoView({ behavior: "smooth", block: "start" });
    holder.querySelector("input")?.focus({ preventScroll: true });
  }));

  attachCreateForm();

  document.querySelectorAll("input[name='telefono']").forEach((input) => {
    input.addEventListener("input", () => {
      input.value = phone(input.value);
    });
  });
}

function render() {
  if (!state.user) {
    renderLogin();
    return;
  }

  const isCaja = state.user.rol === "caja";
  const isCobranza = state.user.rol === "cobranza";
  if (portal.role && state.user.rol !== portal.role) {
    localStorage.removeItem("inmuvi-user");
    state.user = null;
    renderLogin();
    return;
  }
  if (!portal.views.includes(state.view)) state.view = portal.views[0] || "consulta";
  const activeRows = state.rows.filter((row) => row.estatus !== "baja");
  const debtRows = activeRows.filter((row) => row.resumen.saldo_pendiente > 0);
  const paidRows = activeRows.filter((row) => row.resumen.saldo_pendiente <= 0);
  const inactiveRows = state.rows.filter((row) => row.estatus === "baja");
  const totals = {
    cartera: activeRows.reduce((sum, row) => sum + row.monto_total_credito, 0),
    pagado: activeRows.reduce((sum, row) => sum + row.resumen.total_pagado, 0),
    atrasos: activeRows.reduce((sum, row) => sum + row.resumen.mensualidades_atrasadas, 0),
    deudores: debtRows.length,
    liquidados: paidRows.length,
    bajas: inactiveRows.length
  };

  root.innerHTML = `
    <main class="app-shell ${state.menuHidden ? "menu-hidden" : ""}">
      <aside class="sidebar">
        <div class="sidebar-menu">
          <button class="menu-hide" type="button" data-action="toggle-menu">Ocultar menu</button>
          ${brand()}
          ${portal.views.includes("consulta") ? `<button data-view="consulta" class="${state.view === "consulta" ? "active" : ""}">Consulta</button>` : ""}
          ${portal.views.includes("caja") && isCaja ? `<button data-view="caja" class="${state.view === "caja" ? "active" : ""}">Caja</button>` : ""}
          ${portal.views.includes("cobranza") ? `<button data-view="cobranza" class="${state.view === "cobranza" ? "active" : ""}">Cobranza</button>` : ""}
        </div>
        <div class="sidebar-footer">
          <div class="role"><b>${esc(portal.title)}</b><span>${esc(state.user.rol)}</span></div>
          <button class="logout" id="logout">Cerrar sesion</button>
        </div>
      </aside>
      <section class="workspace">
        <header class="topbar">
          <div class="topbar-title">
            <button class="menu-logo-toggle" type="button" data-action="toggle-menu" aria-label="Mostrar menu">
              <img src="inmuvi-logo.svg" alt="" />
            </button>
            <div>
              <p>${state.view === "caja" ? "Administracion de caja" : "Consulta institucional"}</p>
              <h1>${state.view === "cobranza" ? "Seguimiento de cobranza" : "Expedientes y pagos"}</h1>
            </div>
          </div>
          <form class="search" id="searchForm">
            <input name="query" value="${esc(state.query)}" placeholder="Buscar nombre, folio, adeudos o $10,000" />
            <button class="search-clear" type="button" data-action="clear-search" aria-label="Limpiar busqueda" ${state.query ? "" : "hidden"}>&times;</button>
            <button>Buscar</button>
          </form>
        </header>
        ${isCobranza ? renderCobranzaFilters() : ""}
        <section class="metrics">
          ${metric("Cartera activa", money(totals.cartera))}
          ${metric("Personas que deben", totals.deudores)}
          ${metric("Liquidados", totals.liquidados)}
          ${metric("Dados de baja", totals.bajas)}
        </section>
        <section class="grid">
          ${renderList()}
          <section class="detail">
            ${state.selected ? renderProfile(state.selected) : `<div class="empty">No hay beneficiarios para mostrar.</div>`}
            ${state.selected && state.view === "caja" && isCaja ? renderCaja(state.selected) : ""}
            ${isCaja ? renderCreateSection(!state.selected) : ""}
            ${state.selected && isCobranza ? renderCobranzaObservations(state.selected) : ""}
            ${state.selected && state.view === "cobranza" ? renderCobranza(state.selected) : ""}
          </section>
        </section>
      </section>
    </main>
  `;
  attachHandlers();
}

render();
if (state.user) loadRows("").catch((error) => notify(error.message));
