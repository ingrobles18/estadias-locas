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
  curp: "",
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

function renderList() {
  return `
    <section class="list">
      <h3>Beneficiarios</h3>
      ${state.rows.map((row) => `
        <button data-action="select" data-id="${row.id}" class="${state.selected?.id === row.id ? "selected" : ""}">
          <b>${esc(row.folio)}</b>
          <span>${esc(row.nombre)}</span>
          <small>${money(row.resumen.saldo_pendiente)} pendiente</small>
        </button>
      `).join("")}
    </section>
  `;
}

function renderHistory(payments) {
  return `
    <section class="history">
      <h3>Historial de pagos</h3>
      <div class="table">
        <div class="head"><span>Fecha</span><span>Mes</span><span>Comprobante</span><span>Monto</span></div>
        ${payments.map((payment) => `
          <div class="row">
            <span>${esc(payment.fecha_pago)}</span>
            <span>${esc(payment.mes_correspondiente)}</span>
            <span>${esc(payment.comprobante)}</span>
            <b>${money(payment.monto_pagado)}</b>
          </div>
        `).join("") || `<div class="row"><span>Sin pagos registrados</span><span></span><span></span><b>${money(0)}</b></div>`}
      </div>
    </section>
  `;
}

function renderProfile(item) {
  return `
    <article class="profile">
      <div class="profile-head">
        <div>
          <p>${esc(item.folio)}</p>
          <h2>${esc(item.nombre)}</h2>
          <span>${esc(item.domicilio)} · Lote ${esc(item.lote)}, Manzana ${esc(item.manzana)}</span>
        </div>
        <button class="secondary" data-action="checkin">Check-in</button>
      </div>
      <div class="progress-label">
        <span>${money(item.resumen.total_pagado)} pagado de ${money(item.monto_total_credito)}</span>
        <b>${item.resumen.progreso}%</b>
      </div>
      <div class="progress"><div style="width:${Math.min(item.resumen.progreso, 100)}%"></div></div>
      <div class="info-grid">
        ${info("Mensualidad", money(item.mensualidad))}
        ${info("Va en mensualidad", `${item.resumen.mensualidad_actual} de ${item.resumen.mensualidades_totales}`)}
        ${info("Falta por pagar", money(item.resumen.saldo_pendiente))}
        ${info("Atrasadas", item.resumen.mensualidades_atrasadas, item.resumen.mensualidades_atrasadas > 0)}
        ${info("CURP", item.curp || "Sin dato")}
        ${info("Telefono", item.telefono || "Sin dato")}
      </div>
      ${renderHistory(item.pagos)}
    </article>
  `;
}

function renderCaja(item) {
  const nextMonth = item.resumen.mensualidad_actual + 1;
  return `
    <section class="actions">
      <form class="panel" id="paymentForm">
        <h3>Registrar abono</h3>
        <label>Monto<input name="monto_pagado" type="number" value="${item.mensualidad}" /></label>
        <label>Fecha<input name="fecha_pago" type="date" value="${new Date().toISOString().slice(0, 10)}" /></label>
        <label>Mensualidad<input name="mes_correspondiente" type="number" value="${nextMonth}" /></label>
        <label>Comprobante<input name="comprobante" placeholder="REC-0004" /></label>
        <button>Guardar abono</button>
      </form>
      <form class="panel" id="editForm">
        <h3>Corregir expediente</h3>
        <label>Monto total<input name="monto_total_credito" type="number" value="${item.monto_total_credito}" /></label>
        <label>Mensualidad<input name="mensualidad" type="number" value="${item.mensualidad}" /></label>
        <label>Estatus
          <select name="estatus">
            <option value="activo" ${item.estatus === "activo" ? "selected" : ""}>Activo</option>
            <option value="baja" ${item.estatus === "baja" ? "selected" : ""}>Baja</option>
          </select>
        </label>
        <button>Aplicar cambios</button>
      </form>
    </section>
    <section class="create">
      <button data-action="toggle-create">Nuevo beneficiario</button>
      <div id="createHolder"></div>
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
            type="${key.includes("fecha") ? "date" : ["monto_total_credito", "mensualidad", "enganche_total", "superficie"].includes(key) ? "number" : "text"}"
            value="${esc(fields[key])}"
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

  document.querySelector("[data-action='toggle-create']")?.addEventListener("click", () => {
    document.getElementById("createHolder").innerHTML = renderCreateForm();
    document.getElementById("createForm").addEventListener("submit", async (event) => {
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
  });
}

function render() {
  if (!state.user) {
    renderLogin();
    return;
  }

  const isCaja = state.user.rol === "caja";
  if (portal.role && state.user.rol !== portal.role) {
    localStorage.removeItem("inmuvi-user");
    state.user = null;
    renderLogin();
    return;
  }
  if (!portal.views.includes(state.view)) state.view = portal.views[0] || "consulta";
  const totals = {
    cartera: state.rows.reduce((sum, row) => sum + row.monto_total_credito, 0),
    pagado: state.rows.reduce((sum, row) => sum + row.resumen.total_pagado, 0),
    atrasos: state.rows.reduce((sum, row) => sum + row.resumen.mensualidades_atrasadas, 0)
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
          ${metric("Abonado", money(totals.pagado))}
          ${metric("Mensualidades atrasadas", totals.atrasos)}
        </section>
        <section class="grid">
          ${renderList()}
          <section class="detail">
            ${state.selected ? renderProfile(state.selected) : `<div class="empty">No hay beneficiarios para mostrar.</div>`}
            ${state.selected && state.view === "caja" && isCaja ? renderCaja(state.selected) : ""}
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
