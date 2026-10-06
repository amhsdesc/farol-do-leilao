import { NextResponse } from "next/server";
import { acesso } from "@/lib/acesso";
import { consulta } from "@/lib/db";
import { destinoEnriquecido } from "@/lib/enriquecimento";

export const dynamic = "force-dynamic";

// /ir/123            → site do leiloeiro (página do lote)
// /ir/123?para=edital → edital do lote (o da fonte; se ela não tiver, o que o enriquecimento achou)
// /ir/123?para=leiloeiro → página do imóvel no site do leiloeiro, achada pelo enriquecimento
// Só assinantes são levados ao site. Visitante vai para a página de planos.
// O endereço real nunca aparece na página: ele só sai daqui, no redirecionamento.
export async function GET(req: Request, { params }: { params: Promise<{ lote: string }> }) {
  const base = new URL(req.url);
  const id = Number((await params).lote);
  const pedido = base.searchParams.get("para");
  const para = pedido === "edital" ? "edital" : pedido === "leiloeiro" ? "leiloeiro" : "site";

  const { assinante } = await acesso();
  if (!assinante) {
    return NextResponse.redirect(new URL(`/assinar?de=${para}`, base), 303);
  }
  if (!Number.isInteger(id) || id <= 0) return NextResponse.json({ erro: "lote inválido" }, { status: 404 });

  const [l] = await consulta<{ url: string | null; edital_url: string | null }>(
    "select url, edital_url from lote where id = $1",
    [id],
  );
  const destino =
    para === "edital"
      ? (l?.edital_url ?? (await destinoEnriquecido(id, "edital")))
      : para === "leiloeiro"
        ? await destinoEnriquecido(id, "leiloeiro")
        : l?.url;
  if (!destino || !/^https?:\/\//i.test(destino)) {
    return NextResponse.json({ erro: "endereço não disponível" }, { status: 404 });
  }
  const res = NextResponse.redirect(destino, 302);
  res.headers.set("Cache-Control", "private, no-store");
  return res;
}
