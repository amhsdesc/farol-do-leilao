import { notFound } from "next/navigation";
import { modoTeste } from "@/auth";
import { acesso } from "@/lib/acesso";
import { asaasConfigurado } from "@/lib/conta/asaas";
import { PLANOS, type PlanoId } from "@/lib/conta/regras";
import { simularPagamento } from "../acoes";

export const dynamic = "force-dynamic";

// Só existe no modo teste, sem Asaas configurado: faz o papel da página de pagamento do Asaas.
export default async function PagamentoTeste() {
  if (!modoTeste || asaasConfigurado()) notFound();
  const { assinatura } = await acesso();
  const plano = PLANOS[assinatura?.plano as PlanoId];
  return (
    <main className="pagina estreita">
      <section className="painel caixa-entrar">
        <span className="rotulo">Modo teste · página de pagamento simulada</span>
        <h1>Pagamento de teste</h1>
        <p className="texto">
          No site publicado, aqui a pessoa estaria na página do Asaas, pagando {plano ? `o plano ${plano.nome.toLowerCase()}` : "a assinatura"} com
          Pix, boleto ou cartão. Nenhum dinheiro de verdade passa por aqui.
        </p>
        <form action={simularPagamento}>
          <button className="botao grande">Simular pagamento aprovado</button>
        </form>
      </section>
    </main>
  );
}
