import type { Metadata } from "next";
import CalculadoraApp, { type Prefill } from "@/components/calculadora/CalculadoraApp";
import Travado from "@/components/Travado";
import { acesso } from "@/lib/acesso";
import { mercadoConfigurado } from "@/lib/calculadora/pesquisaMercado";
import { resumo } from "@/lib/consultas";
import { TIPOS } from "@/lib/formato";

export const metadata: Metadata = { title: "Calculadora" };
export const dynamic = "force-dynamic";

export default async function Calculadora({ searchParams }: { searchParams: Promise<{ imovel?: string }> }) {
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
  const id = Number((await searchParams).imovel);
  const [im, pesquisaMercadoDisponivel] = await Promise.all([
    Number.isInteger(id) && id > 0 ? resumo(id) : Promise.resolve(null),
    mercadoConfigurado(),
  ]);
  const prefill: Prefill = im
    ? {
        imovelId: im.imovel_id,
        titulo: `${TIPOS[im.tipo] ?? "Imóvel"}${im.bairro ? ` em ${im.bairro}` : ""}, ${im.cidade}/${im.uf}`,
        lance: im.lance_minimo,
        uf: im.uf,
        cidade: im.cidade,
        bairro: im.bairro,
        tipo: im.tipo,
        modalidade: im.modalidade,
        area: im.area,
        avaliacao: im.valor_avaliacao,
        ocupado: im.ocupacao === "ocupado",
        debitosComVoce: im.debitos_por_conta === "arrematante",
      }
    : {};
  return (
    <main className="pagina calculadora-pagina">
      <header className="calc-topo">
        <h1 className="titulo-pagina">Faça a conta</h1>
        <p className="texto">Tudo parte do valor do lance. A conta muda enquanto você preenche.</p>
      </header>
      <CalculadoraApp prefill={prefill} pesquisaMercadoDisponivel={pesquisaMercadoDisponivel} />
    </main>
  );
}
