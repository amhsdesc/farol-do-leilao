import { NextResponse } from "next/server";
import { acesso } from "@/lib/acesso";
import { aplicarAcesso, lerFiltros } from "@/lib/busca/filtros";
import { pontos, semLocalizacao } from "@/lib/consultas";

export const dynamic = "force-dynamic";

// GET /api/pontos[?filtros de assinante] → { pontos: [[id, lat, lon, desconto], ...], sem_local: n }
export async function GET(req: Request) {
  const { assinante } = await acesso();
  const { filtros, bloqueados } = aplicarAcesso(lerFiltros(new URL(req.url).searchParams), assinante);
  const [ps, sem_local] = await Promise.all([pontos(filtros), semLocalizacao(filtros)]);
  return NextResponse.json({ pontos: ps, sem_local, bloqueados });
}
