import { NextResponse } from "next/server";
import { COOKIE_TESTE, modoTesteLigado } from "@/lib/acesso";

// Só para testes locais (FAROL_TESTE_ASSINANTE=permitir). No site publicado responde 404.
export async function GET(req: Request) {
  if (!modoTesteLigado()) return NextResponse.json({ erro: "não disponível" }, { status: 404 });
  const url = new URL(req.url);
  const ligar = url.searchParams.get("ligar") === "1";
  const res = NextResponse.redirect(new URL(url.searchParams.get("voltar")?.startsWith("/") ? url.searchParams.get("voltar")! : "/", url));
  res.cookies.set(COOKIE_TESTE, ligar ? "1" : "0", { httpOnly: true, sameSite: "lax", path: "/" });
  return res;
}
