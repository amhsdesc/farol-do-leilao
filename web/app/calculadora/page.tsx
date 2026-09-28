import type { Metadata } from "next";
import Travado from "@/components/Travado";
import { acesso } from "@/lib/acesso";

export const metadata: Metadata = { title: "Calculadora" };
export const dynamic = "force-dynamic";

export default async function Calculadora() {
  const { assinante } = await acesso();
  if (!assinante) {
    return (
      <Travado
        titulo="Faça a conta antes do lance"
        texto="A partir do valor do lance, a calculadora soma todos os custos até vender e diz quanto sobra."
        itens={[
          "Leiloeiro, advogado, ITBI, escritura, registro e taxas de cartório",
          "Reforma em três padrões, pelo custo da sua região",
          "Imposto sobre o lucro na venda",
          "Lucro e retorno em %, e o lance máximo para a meta que você escolher",
        ]}
      />
    );
  }
  return (
    <main className="pagina estreita">
      <div className="painel">
        <h1>Calculadora</h1>
        <p>A conta já está pronta por dentro; a tela chega na próxima etapa.</p>
      </div>
    </main>
  );
}
