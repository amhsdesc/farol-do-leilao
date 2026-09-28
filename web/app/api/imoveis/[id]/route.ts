import { NextResponse } from "next/server";
import { resumo } from "@/lib/consultas";

export const dynamic = "force-dynamic";

// Resumo para o balão do mapa.
export async function GET(_req: Request, { params }: { params: Promise<{ id: string }> }) {
  const id = Number((await params).id);
  const r = Number.isInteger(id) && id > 0 ? await resumo(id) : null;
  return r ? NextResponse.json(r) : NextResponse.json({ erro: "não encontrado" }, { status: 404 });
}
