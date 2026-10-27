
import { createServer } from "node:http";
import { readFile } from "node:fs/promises";
import { fileURLToPath } from "node:url";
import path from "node:path";

const RAIZ = path.dirname(fileURLToPath(import.meta.url));
const PUERTO = Number(process.env.PORT) || 3000;


const CARPETAS_PUBLICAS = ["web", "src"].map((c) => path.join(RAIZ, c) + path.sep);

const TIPOS = {
  ".html": "text/html; charset=utf-8",
  ".js": "text/javascript; charset=utf-8",
  ".css": "text/css; charset=utf-8",
};

function responder(res, codigo, tipo, contenido) {
  res.writeHead(codigo, { "Content-Type": tipo });
  res.end(contenido);
}

const servidor = createServer(async (req, res) => {
  try {
    const { pathname } = new URL(req.url, "http://localhost");
    let ruta = decodeURIComponent(pathname);
    if (ruta === "/") {
      ruta = "/web/index.html";
    }

    const archivo = path.normalize(path.join(RAIZ, ruta));
    const permitido = CARPETAS_PUBLICAS.some((carpeta) => archivo.startsWith(carpeta));
    if (!permitido) {
      responder(res, 404, "text/plain; charset=utf-8", "No encontrado");
      return;
    }

    const contenido = await readFile(archivo);
    const tipo = TIPOS[path.extname(archivo)] ?? "application/octet-stream";
    responder(res, 200, tipo, contenido);
  } catch {
    responder(res, 404, "text/plain; charset=utf-8", "No encontrado");
  }
});

servidor.on("error", (error) => {
  if (error.code === "EADDRINUSE") {
    console.error(`El puerto ${PUERTO} ya está en uso. Cierra la otra terminal que corre la página, o usa otro puerto: PORT=3001 npm run web`);
  } else {
    console.error("No se pudo iniciar el servidor:", error.message);
  }
  process.exit(1);
});

servidor.listen(PUERTO, () => {
  console.log(`Página lista en http://localhost:${PUERTO}`);
  console.log("Para detener el servidor pulsa Control + C en esta terminal.");
});
