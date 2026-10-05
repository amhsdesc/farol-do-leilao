import type { Metadata } from "next";
import Link from "next/link";
import LinhaAlertaBusca from "@/components/alertas/LinhaAlertaBusca";
import LinhaAlertaImovel from "@/components/alertas/LinhaAlertaImovel";
import Travado from "@/components/Travado";
import { acesso } from "@/lib/acesso";
import { meusAlertas } from "@/lib/alertas/consultas";
import { limiteAlertas } from "@/lib/conta/regras";

export const metadata: Metadata = { title: "Meus alertas" };
export const dynamic = "force-dynamic";

export default async function Alertas() {
  const { assinante, usuario, assinatura } = await acesso();
  if (!assinante || !usuario) {
    return (
      <Travado
        titulo="Não perca o dia do leilão"
        texto="Escolha um imóvel e receba o aviso onde preferir: e-mail, WhatsApp ou Telegram."
        itens={[
          "7 dias antes, para ler o edital e se cadastrar no leiloeiro",
          "1 dia e 1 hora antes de começar",
          "Se a data, o preço ou o edital mudarem",
          "Se o leilão for suspenso ou cancelado",
        ]}
      />
    );
  }

  const alertas = await meusAlertas(usuario.id);
  const doImovel = alertas.filter((a) => a.tipo === "imovel");
  const deBusca = alertas.filter((a) => a.tipo === "busca");
  const ativos = alertas.filter((a) => a.ativo).length;
  const limite = limiteAlertas(assinatura?.plano ?? null);

  return (
    <main className="pagina estreita alertas-pagina">
      <header className="calc-topo">
        <h1 className="titulo-pagina">Meus alertas</h1>
        <p className="texto">
          Por e-mail e WhatsApp, por enquanto (Telegram chega numa próxima etapa). Ative ou pause quando quiser.
        </p>
        <p className="muted">
          {limite === null ? `${ativos} alerta${ativos === 1 ? "" : "s"} ativo${ativos === 1 ? "" : "s"}` : `${ativos} de ${limite} alertas ativos`}
        </p>
      </header>

      {!alertas.length && (
        <div className="painel vazio-calc">
          <h2>Nenhum alerta ainda</h2>
          <p>
            Abra um imóvel e clique em <b>&quot;Me avise antes do leilão&quot;</b>, ou salve uma busca no{" "}
            <Link href="/">mapa</Link> para ser avisado de imóveis novos.
          </p>
        </div>
      )}

      {doImovel.length > 0 && (
        <section className="painel lista-alertas">
          <h2>Imóveis ({doImovel.length})</h2>
          <ul>
            {doImovel.map((a) => <LinhaAlertaImovel key={a.id} a={a} />)}
          </ul>
        </section>
      )}

      {deBusca.length > 0 && (
        <section className="painel lista-alertas">
          <h2>Buscas salvas ({deBusca.length})</h2>
          <ul>
            {deBusca.map((a) => <LinhaAlertaBusca key={a.id} a={a} />)}
          </ul>
        </section>
      )}
    </main>
  );
}
