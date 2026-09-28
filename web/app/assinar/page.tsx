import type { Metadata } from "next";

export const metadata: Metadata = { title: "Planos" };

export default function Assinar() {
  const livre = ["Busca no mapa, no Brasil inteiro", "Ficha de cada imóvel, com as fontes e o histórico de preço"];
  const assinante = [
    "Todos os filtros: banco, valor, FGTS, financiamento, parcelamento, data do leilão, desconto e mais",
    "Calculadora de custos, lucro e lance máximo",
    "Alertas por e-mail, WhatsApp ou Telegram antes de cada leilão",
    "Buscas salvas",
  ];
  return (
    <main className="pagina estreita">
      <h1 className="titulo-pagina">Planos</h1>
      <div className="planos">
        <section className="painel">
          <span className="rotulo">Grátis</span>
          <h2>Para conhecer</h2>
          <ul className="lista-check">{livre.map((i) => <li key={i}>{i}</li>)}</ul>
        </section>
        <section className="painel destaque-assinante">
          <span className="rotulo">Assinante</span>
          <h2>Para decidir</h2>
          <ul className="lista-check">{[...livre, ...assinante].map((i) => <li key={i}>{i}</li>)}</ul>
          <p className="aviso">As assinaturas abrem em breve.</p>
        </section>
      </div>
    </main>
  );
}
