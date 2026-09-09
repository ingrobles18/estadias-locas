import fs from "node:fs/promises";
import http from "node:http";
import path from "node:path";
import { fileURLToPath } from "node:url";
import { handleCaja } from "./caja.js";
import { handleCobranza } from "./cobranza.js";
import { handleSecretaria } from "./secretaria.js";
import { publicUser, readDb, readJson, send } from "./utils.js";
import supabase from "./supabase.js";

const __dirname = path.dirname(fileURLToPath(import.meta.url));
const rootDir = path.join(__dirname, "..");
const publicDir = path.join(rootDir, "public");
const PORT = process.env.PORT || 4000;

async function handleApi(req, res, url) {
  if (req.method === "OPTIONS") return send(res, 204, {});

  if (req.method === "POST" && url.pathname === "/api/login") {
    const body = await readJson(req);
    const { data: user, error } = await supabase
  .from("usuarios_sistema")
  .select("*")
  .eq("usuario", body.usuario)
  .eq("password", body.password)
  .single();

    if (error || !user) {
  console.log(error);
  return send(res, 401, { message: "Usuario o password incorrecto" });
}
    if (body.rol && user.rol !== body.rol) return send(res, 403, { message: `Esta cuenta no pertenece al portal de ${body.rol}` });
    return send(res, 200, { user: publicUser(user) });
  }

  if (req.method === "GET" && url.pathname === "/api/maps/config") {
    return send(res, 200, {
      googleMapsApiKey: process.env.GOOGLE_MAPS_API_KEY || ""
    });
  }

  const db = await readDb();

  if (url.pathname.startsWith("/api/caja/")) return await handleCaja(req, res, url, db);
  if (url.pathname.startsWith("/api/cobranza/")) return await handleCobranza(req, res, url, db);
  if (url.pathname.startsWith("/api/secretaria/")) return await handleSecretaria(req, res, url, db);

  return send(res, 404, { message: "Ruta no encontrada" });
}

async function serveStatic(req, res, url) {
  const requestedPath = url.pathname === "/" ? "/index.html" : url.pathname;
  const filePath = path.normalize(path.join(publicDir, requestedPath));
  if (!filePath.startsWith(publicDir)) return send(res, 403, "Acceso denegado", "text/plain");
  try {
    const file = await fs.readFile(filePath);
    const ext = path.extname(filePath);
    const contentTypes = {
      ".html": "text/html; charset=utf-8",
      ".css": "text/css; charset=utf-8",
      ".jsx": "text/babel; charset=utf-8",
      ".js": "application/javascript; charset=utf-8",
      ".svg": "image/svg+xml"
    };
    send(res, 200, file, contentTypes[ext] || "application/octet-stream");
  } catch {
    send(res, 404, "Archivo no encontrado", "text/plain");
  }
}

const server = http.createServer(async (req, res) => {
  try {
    const url = new URL(req.url, `http://${req.headers.host}`);
    if (url.pathname.startsWith("/api/")) return await handleApi(req, res, url);
    return await serveStatic(req, res, url);
  } catch (error) {
    send(res, 500, { message: error.message });
  }
});

server.listen(PORT, "0.0.0.0", () => {
  console.log(`INMUVI servidor iniciado en el puerto ${PORT}`);
});
