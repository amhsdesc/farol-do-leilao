import type { Metadata } from "next";
import Link from "next/link";
import { acesso } from "@/lib/acesso";
import { DIAS_TESTE, economia, PLANOS, porMes, situacao } from "@/lib/conta/regras";
import { comecarTeste } from "./acoes";

export const metadata: Metadata = { title: "Planos" };
export const dynamic = "force-dynamic";

const LIVRE = ["Busca no mapa, no Brasil inteiro", "Ficha de cada imóvel, com fontes e histórico de preço"];
const ASSINANTE = [
  "Todos os filtros: banco, valor, FGTS, financiamento, parcelamento, data do leilão, desconto e mais",
  "Link direto para o site do leiloeiro e o edital",
  "Calculadora de custos, lucro e lance máximo",
  "Alertas no WhatsApp antes de cada leilão",
];
const centavos = (v: number) => v.toLocaleString("pt-BR", { style: "currency", currency: "BRL" });
const data = (d: Date) => d.toLocaleDateString("pt-BR", { timeZone: "America/Sao_Paulo" });

export default async function Assinar({ searchParams }: { searchParams: Promise<{ erro?: string }> }) {
  const { erro } = await searchParams;
  const { usuario, assinatura } = await acesso();
  const s = situacao(usuario, assinatura);

  // o botão principal muda conforme a etapa da pessoa
  const cta =
    s.tipo === "sem_conta" ? (
      <Link className="botao grande" href="/entrar?volta=/assinar">Começar {DIAS_TESTE} dias grátis</Link>
    ) : s.tipo === "sem_celular" ? (
      <Link className="botao grande" href="/cadastro/celular?volta=/assinar">Confirmar celular e começar</Link>
    ) : s.tipo === "pode_testar" ? (
      <form action={comecarTeste}><button className="botao grande">Começar {DIAS_TESTE} dias grátis</button></form>
    ) : null;

  return (
    <main className="pagina estreita planos-pagina">
      <header className="planos-topo">
        <h1 className="titulo-pagina">Encontre, faça a conta e decida com calma</h1>
        <p className="texto">
          {DIAS_TESTE} dias grátis, sem cartão. Depois, escolha um plano. Cancele quando quiser, em dois cliques.
        </p>
        {erro === "teste_usado" && <p className="aviso">O teste grátis já foi usado nesta conta ou neste celular. Escolha um plano abaixo.</p>}
        {s.tipo === "em_teste" && (
          <p className="aviso">Seu teste grátis vai até <b>{data(s.ate)}</b>. Escolha um plano para continuar depois disso; a primeira cobrança só vence no fim do teste.</p>
        )}
        {s.tipo === "ativa" && (
          <p className="aviso">Você já é assinante{s.cancelada ? `, com acesso até ${data(s.ate)}` : ""}. <Link href="/conta">Ver minha conta</Link></p>
        )}
        {s.tipo === "aguardando_pagamento" && (
          <p className="aviso">Falta concluir o pagamento. <Link href="/conta">Ir para minha conta</Link></p>
        )}
        {cta}
      </header>

      <div className="grade-planos">
        {Object.values(PLANOS).map((p) => {
          const eco = economia(p);
          return (
            <section key={p.id} className={`plano${p.id === "anual" ? " destaque" : ""}`}>
              {p.id === "anual" && <span className="selo-plano">Mais barato</span>}
              <h2>{p.nome}</h2>
              <div className="plano-preco num">
                <b>{centavos(porMes(p))}</b>
                <span>por mês</span>
              </div>
              <span className="muted num">
                {p.meses === 1 ? "cobrado todo mês" : `${centavos(p.valor)} a cada ${p.meses === 12 ? "ano" : `${p.meses} meses`}`}
              </span>
              {eco > 0 ? (
                <span className="economia num">Economize {Math.round(eco * 100)}% ({centavos(PLANOS.mensal.valor * p.meses - p.valor)})</span>
              ) : (
                <span className="economia vazia">Sem compromisso</span>
              )}
              {s.tipo !== "sem_conta" && s.tipo !== "sem_celular" && s.tipo !== "pode_testar" && !(s.tipo === "ativa" && !s.cancelada) ? (
                <Link className={`botao${p.id === "anual" ? "" : " secundario"}`} href={`/assinar/pagar?plano=${p.id}`}>
                  Assinar {p.nome.toLowerCase()}
                </Link>
              ) : null}
            </section>
          );
        })}
      </div>

      <div className="planos">
        <section className="painel">
          <span className="rotulo">Grátis, sem cadastro</span>
          <ul className="lista-check">{LIVRE.map((i) => <li key={i}>{i}</li>)}</ul>
        </section>
        <section className="painel destaque-assinante">
          <span className="rotulo">Assinante (e no teste grátis)</span>
          <ul className="lista-check">{[...LIVRE, ...ASSINANTE].map((i) => <li key={i}>{i}</li>)}</ul>
        </section>
      </div>

      <section className="painel perguntas">
        <h2>Perguntas rápidas</h2>
        <details><summary>Preciso de cartão para testar?</summary><p>Não. Os {DIAS_TESTE} dias grátis começam só com a conta Google e o celular confirmado.</p></details>
        <details><summary>Como eu pago?</summary><p>Pix, boleto ou cartão, na página de pagamento do Asaas, nosso parceiro de cobrança. O Farol nunca vê os dados do seu cartão.</p></details>
        <details><summary>E se eu assinar durante o teste?</summary><p>A primeira cobrança só vence no último dia do teste. Você não perde nenhum dia grátis.</p></details>
        <details><summary>Como cancelo?</summary><p>Em Minha conta, no botão Cancelar. Você continua com acesso até o fim do período já pago.</p></details>
      </section>
    </main>
  );
}
