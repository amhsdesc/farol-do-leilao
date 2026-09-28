import { dirname, join } from "node:path";
import { fileURLToPath } from "node:url";
import { existsSync, readFileSync } from "node:fs";

// Lê o .env da raiz do projeto (o mesmo do coletor), para não manter dois arquivos.
const raiz = join(dirname(fileURLToPath(import.meta.url)), "..");
const env = join(raiz, ".env");
if (existsSync(env)) {
  for (const linha of readFileSync(env, "utf8").split(/\r?\n/)) {
    const m = linha.match(/^\s*([A-Z0-9_]+)\s*=\s*(.*)\s*$/);
    if (m && !process.env[m[1]]) process.env[m[1]] = m[2].replace(/^["']|["']$/g, "");
  }
}

/** @type {import('next').NextConfig} */
const config = {
  serverExternalPackages: ["pg"],
};
export default config;
