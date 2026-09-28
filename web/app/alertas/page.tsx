import type { Metadata } from "next";
import Travado from "@/components/Travado";
import { acesso } from "@/lib/acesso";

export const metadata: Metadata = { title: "Meus alertas" };
export const dynamic = "force-dynamic";

export default async function Alertas() {
  const { assinante } = await acesso();
  if (!assinante) {
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
  return (
    <main className="pagina estreita">
      <div className="painel">
        <h1>Meus alertas</h1>
        <p>Os alertas chegam numa próxima etapa.</p>
      </div>
    </main>
  );
}
