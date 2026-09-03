const portal = window.INMUVI_PORTAL || {
  role: null,
  title: "Sistema de control de pagos",
  user: "caja",
  password: "caja123",
  views: ["consulta", "caja", "cobranza"]
};
const API = portal.apiBase || `/api/${portal.role || "caja"}`;
const state = {
  user: JSON.parse(localStorage.getItem("inmuvi-user") || "null"),
  rows: [],
  selected: null,
  query: "",
  view: portal.views[0] || "consulta"
};

const fields = {
  folio: "",
  nombre: "",
  domicilio: "",
  telefono: "",
  colonia_fraccionamiento: "",
  lote: "",
  manzana: "",
  superficie: "",
  concepto: "Vivienda social",
  monto_total_credito: "",
  mensualidad: "",
  fecha_inicio: new Date().toISOString().slice(0, 10),
  fecha_entrega: new Date().toISOString().slice(0, 10),
  enganche_total: ""
};

const root = document.getElementById("root");

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

async function api(path, options = {}) {
  const base = path === "/login" ? "/api" : API;
  const response = await fetch(`${base}${path}`, {
    headers: { "Content-Type": "application/json" },
    ...options
  });
  const data = await response.json();
  if (!response.ok && response.status === 404 && base !== "/api") {
    const fallbackResponse = await fetch(`/api${path}`, {
      headers: { "Content-Type": "application/json" },
      ...options
    });
    const fallbackData = await fallbackResponse.json();
    if (!fallbackResponse.ok) throw new Error(fallbackData.message || "Error de comunicacion");
    return fallbackData;
  }
  if (!response.ok) throw new Error(data.message || "Error de comunicacion");
  return data;
}

function notify(message) {
  const notice = document.createElement("div");
  notice.className = "notice";
  notice.textContent = message;
  document.body.appendChild(notice);
  setTimeout(() => notice.remove(), 2600);
}

async function loadRows(search = state.query) {
  if (!state.user) return;
  state.rows = await api(`/beneficiarios?q=${encodeURIComponent(search)}`);
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
  root.innerHTML = `
    <main class="login">
      <form class="login-box" id="loginForm">
        <div class="brand">
          <div class="mark">IN</div>
          <div><b>INMUVI</b><span>${esc(portal.title)}</span></div>
        </div>
        <label>Usuario<input name="usuario" value="${esc(portal.user)}" /></label>
        <label>Password<input name="password" type="password" value="${esc(portal.password)}" /></label>
        <p class="error" id="loginError"></p>
        <button>Entrar al portal</button>
        <div class="demo">
          <span>Acceso de este portal:</span>
          <b>${esc(portal.user)}/${esc(portal.password)}</b>
          <a href="/">Cambiar de portal</a>
        </div>
      </form>
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
  const groups = [
    {
      title: "Personas que deben",
      rows: state.rows.filter((row) => row.estatus !== "baja" && row.resumen.saldo_pendiente > 0),
      empty: "Sin personas con adeudo"
    },
    {
      title: "Ya terminaron de pagar",
      rows: state.rows.filter((row) => row.estatus !== "baja" && row.resumen.saldo_pendiente <= 0),
      empty: "Sin expedientes liquidados"
    },
    {
      title: "Dados de baja",
      rows: state.rows.filter((row) => row.estatus === "baja"),
      empty: "Sin personas dadas de baja"
    }
  ];

  const renderRow = (row) => {
    const isPaid = row.estatus !== "baja" && row.resumen.saldo_pendiente <= 0;
    return `
      <button data-action="select" data-id="${row.id}" class="${state.selected?.id === row.id ? "selected" : ""}">
        <b>
          ${esc(row.folio)}
          ${row.estatus === "baja" ? `<em>Baja</em>` : isPaid ? `<em class="paid">Liquidado</em>` : ""}
        </b>
        <span>${esc(row.nombre)}</span>
        <small>${isPaid ? "Pago terminado" : `${money(row.resumen.saldo_pendiente)} pendiente`}</small>
      </button>
    `;
  };

  return `
    <section class="list">
      <h3>Beneficiarios</h3>
      ${canCreate ? `<button class="new-beneficiary-button" data-action="toggle-create">Nuevo beneficiario</button>` : ""}
      ${groups.map((group) => `
        <div class="list-group">
          <div class="list-group-title"><span>${group.title}</span><b>${group.rows.length}</b></div>
          ${group.rows.map(renderRow).join("") || `<p class="list-empty">${group.empty}</p>`}
        </div>
      `).join("")}
    </section>
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
      </div>
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
        <label>Monto total<input name="monto_total_credito" type="number" step="0.01" min="0" value="${item.monto_total_credito}" /></label>
        <label>Mensualidad<input name="mensualidad" type="number" step="0.01" min="0" value="${item.mensualidad}" /></label>
        <label>Telefono<input name="telefono" type="tel" inputmode="numeric" maxlength="13" value="${esc(phone(item.telefono))}" /></label>
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
  return `
    <form class="create-form" id="createForm">
      ${Object.keys(fields).map((key) => `
        <label>${key.replaceAll("_", " ")}
          <input
            name="${key}"
            type="${key === "telefono" ? "tel" : key.includes("fecha") ? "date" : ["monto_total_credito", "mensualidad", "enganche_total", "superficie"].includes(key) ? "number" : "text"}"
            value="${esc(fields[key])}"
            ${key === "telefono" ? `inputmode="numeric" maxlength="13"` : ""}
            ${["monto_total_credito", "mensualidad", "enganche_total", "superficie"].includes(key) ? `step="0.01" min="0"` : ""}
            ${["folio", "nombre", "monto_total_credito", "mensualidad", "fecha_inicio"].includes(key) ? "required" : ""}
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

  createForm.addEventListener("submit", async (event) => {
    event.preventDefault();
    const body = Object.fromEntries(new FormData(event.currentTarget));
    const row = await api("/beneficiarios", {
      method: "POST",
      body: JSON.stringify({ ...body, rol: state.user.rol })
    });
    notify("Beneficiario creado");
    state.selected = row;
    await loadRows("");
  });
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

  document.getElementById("logout")?.addEventListener("click", () => {
    localStorage.removeItem("inmuvi-user");
    state.user = null;
    state.rows = [];
    state.selected = null;
    render();
  });

  document.getElementById("searchForm")?.addEventListener("submit", async (event) => {
    event.preventDefault();
    state.query = event.currentTarget.query.value;
    await loadRows(state.query);
  });

  document.querySelector("[data-action='checkin']")?.addEventListener("click", async () => {
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
  });

  document.getElementById("paymentForm")?.addEventListener("submit", async (event) => {
    event.preventDefault();
    const body = Object.fromEntries(new FormData(event.currentTarget));
    await api("/pagos", {
      method: "POST",
      body: JSON.stringify({ ...body, beneficiario_id: state.selected.id, cajero_id: state.user.id, rol: state.user.rol })
    });
    notify("Abono registrado correctamente");
    await refreshSelected();
  });

  document.getElementById("editForm")?.addEventListener("submit", async (event) => {
    event.preventDefault();
    const body = Object.fromEntries(new FormData(event.currentTarget));
    await api(`/beneficiarios/${state.selected.id}`, {
      method: "PATCH",
      body: JSON.stringify({ ...body, rol: state.user.rol })
    });
    notify("Expediente actualizado");
    await refreshSelected();
  });

  document.querySelector("[data-action='delete-beneficiary']")?.addEventListener("click", async () => {
    if (!window.confirm(`Eliminar a ${state.selected.nombre} y todo su historial de pagos?`)) return;
    await api(`/beneficiarios/${state.selected.id}`, { method: "DELETE" });
    notify("Persona eliminada");
    state.selected = null;
    await loadRows(state.query);
  });

  document.getElementById("cobranzaNotesForm")?.addEventListener("submit", async (event) => {
    event.preventDefault();
    const body = Object.fromEntries(new FormData(event.currentTarget));
    await api(`/beneficiarios/${state.selected.id}/observaciones`, {
      method: "PATCH",
      body: JSON.stringify({ ...body, usuario_id: state.user.id })
    });
    notify("Observaciones guardadas");
    await refreshSelected();
  });

  document.querySelectorAll("[data-action='toggle-create']").forEach((button) => button.addEventListener("click", () => {
    document.getElementById("createHolder").innerHTML = renderCreateForm();
    attachCreateForm();
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
    <main class="app-shell">
      <aside class="sidebar">
        <div class="brand"><div class="mark">IN</div><div><b>INMUVI</b><span>${esc(portal.title)}</span></div></div>
        ${portal.views.includes("consulta") ? `<button data-view="consulta" class="${state.view === "consulta" ? "active" : ""}">Consulta</button>` : ""}
        ${portal.views.includes("caja") && isCaja ? `<button data-view="caja" class="${state.view === "caja" ? "active" : ""}">Caja</button>` : ""}
        ${portal.views.includes("cobranza") ? `<button data-view="cobranza" class="${state.view === "cobranza" ? "active" : ""}">Cobranza</button>` : ""}
        <div class="role"><b>${esc(state.user.nombre)}</b><span>${esc(state.user.rol)}</span></div>
        <button class="logout" id="logout">Salir</button>
      </aside>
      <section class="workspace">
        <header class="topbar">
          <div>
            <p>${state.view === "caja" ? "Administracion de caja" : "Consulta institucional"}</p>
            <h1>${state.view === "cobranza" ? "Seguimiento de cobranza" : "Expedientes y pagos"}</h1>
          </div>
          <form class="search" id="searchForm">
            <input name="query" value="${esc(state.query)}" placeholder="Buscar por folio o nombre" />
            <button>Buscar</button>
          </form>
        </header>
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
            ${state.view === "caja" && isCaja ? renderCreateSection(!state.selected) : ""}
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
if (state.user) loadRows("");
