import { timingSafeEqual } from "node:crypto";
import { NextResponse } from "next/server";
import { processarEvento, type EventoAsaas } from "@/lib/conta/pagamentos";

export const dynamic = "force-dynamic";

// O Asaas chama este endereço a cada pagamento. Configure no painel do Asaas:
// URL https://SEU-SITE/api/asaas/webhook e o mesmo token de ASAAS_WEBHOOK_TOKEN.
export async function POST(req: Request) {
  const esperado = process.env.ASAAS_WEBHOOK_TOKEN ?? "";
  const recebido = req.headers.get("asaas-access-token") ?? "";
  const a = Buffer.from(esperado), b = Buffer.from(recebido);
  if (!esperado || a.length !== b.length || !timingSafeEqual(a, b)) {
    return NextResponse.json({ erro: "não autorizado" }, { status: 401 });
  }
  let ev: EventoAsaas;
  try {
    ev = await req.json();
  } catch {
    return NextResponse.json({ erro: "corpo inválido" }, { status: 400 });
  }
  if (!ev?.event) return NextResponse.json({ erro: "sem evento" }, { status: 400 });
  try {
    const r = await processarEvento(ev);
    return NextResponse.json({ ok: true, resultado: r });
  } catch (e) {
    console.error("webhook asaas:", e);
    // 500 faz o Asaas tentar de novo mais tarde
    return NextResponse.json({ erro: "falha ao processar" }, { status: 500 });
  }
}
