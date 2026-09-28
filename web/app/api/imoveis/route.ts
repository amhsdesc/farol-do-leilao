import { NextResponse } from "next/server";
import { acesso } from "@/lib/acesso";
import { aplicarAcesso, lerFiltros } from "@/lib/busca/filtros";
import { buscar } from "@/lib/consultas";

export const dynamic = "force-dynamic";

// GET /api/imoveis?bbox=oeste,sul,leste,norte&pagina=1[&filtros de assinante]
// Visitante: só o recorte do mapa. Filtros de assinante enviados por visitante são ignorados
// e listados em `bloqueados` — a trava vale no servidor, não só na tela.
export async function GET(req: Request) {
  const { assinante } = await acesso();
  const { filtros, bloqueados } = aplicarAcesso(lerFiltros(new URL(req.url).searchParams), assinante);
  const r = await buscar(filtros);
  return NextResponse.json({ ...r, bloqueados });
}
