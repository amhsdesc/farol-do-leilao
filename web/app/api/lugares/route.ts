import { NextResponse } from "next/server";
import { lugares } from "@/lib/consultas";

export const dynamic = "force-dynamic";

// GET /api/lugares?q=aguas → cidades e bairros com imóveis, com a área para o mapa enquadrar.
export async function GET(req: Request) {
  const q = (new URL(req.url).searchParams.get("q") ?? "").trim().slice(0, 60);
  if (q.length < 2) return NextResponse.json({ lugares: [] });
  return NextResponse.json({ lugares: await lugares(q) });
}
