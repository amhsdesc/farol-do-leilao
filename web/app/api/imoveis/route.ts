import { NextResponse } from "next/server";
import { buscar, type Filtros } from "@/lib/consultas";

export const dynamic = "force-dynamic";

// GET /api/imoveis?uf=DF&tipo=apartamento&desconto_min=30&pagina=1
// Mesma busca da página inicial, em JSON (base para app, alertas e parceiros).
export async function GET(req: Request) {
  const params = Object.fromEntries(new URL(req.url).searchParams) as Filtros;
  const { itens, total, pagina } = await buscar(params);
  return NextResponse.json({ total, pagina, itens });
}
