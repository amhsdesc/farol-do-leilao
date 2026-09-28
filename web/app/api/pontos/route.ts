import { NextResponse } from "next/server";
import { acesso } from "@/lib/acesso";
import { aplicarAcesso, lerFiltros } from "@/lib/busca/filtros";
import { pontos } from "@/lib/consultas";

export const dynamic = "force-dynamic";

// GET /api/pontos[?filtros de assinante] → { pontos: [[id, lat, lon, desconto], ...] }
export async function GET(req: Request) {
  const { assinante } = await acesso();
  const { filtros, bloqueados } = aplicarAcesso(lerFiltros(new URL(req.url).searchParams), assinante);
  return NextResponse.json({ pontos: await pontos(filtros), bloqueados });
}
