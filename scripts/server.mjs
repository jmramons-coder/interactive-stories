import { createServer } from "node:http";
import { readFile } from "node:fs/promises";
import { extname, join, normalize } from "node:path";
import { fileURLToPath } from "node:url";

const root = join(fileURLToPath(new URL("..", import.meta.url)));
const port = Number(process.env.PORT || 4173);

const types = {
  ".css": "text/css; charset=utf-8",
  ".html": "text/html; charset=utf-8",
  ".js": "text/javascript; charset=utf-8",
  ".json": "application/json; charset=utf-8",
  ".png": "image/png",
  ".jpg": "image/jpeg",
  ".jpeg": "image/jpeg",
  ".webp": "image/webp",
  ".svg": "image/svg+xml",
  ".mp3": "audio/mpeg",
  ".wav": "audio/wav"
};

function resolvePath(url) {
  const requestPath = decodeURIComponent(new URL(url, "http://localhost").pathname);
  const cleanPath = normalize(requestPath === "/" ? "/index.html" : requestPath);
  const filePath = join(root, cleanPath);
  return filePath.startsWith(root) ? filePath : join(root, "index.html");
}

export async function handler(request, response) {
  try {
    const filePath = resolvePath(request.url || "/");
    const body = await readFile(filePath);
    response.writeHead(200, {
      "Content-Type": types[extname(filePath)] || "application/octet-stream"
    });
    response.end(body);
  } catch {
    const body = await readFile(join(root, "index.html"));
    response.writeHead(200, { "Content-Type": types[".html"] });
    response.end(body);
  }
}

export default handler;

if (!process.env.VERCEL) {
  const server = createServer(handler);
  server.listen(port, () => {
    console.log(`Interactive stories running at http://localhost:${port}`);
  });
}
