import Link from "next/link";
import type { ItemBusca } from "@/lib/consultas";
import { area, diaMes, MODALIDADES, OCUPACAO, porcento, reais, TIPOS } from "@/lib/formato";

export function quandoLeilao(i: Pick<ItemBusca, "modalidade" | "praca_atual" | "data_leilao">) {
  if (i.modalidade === "venda_direta") return "Venda direta: compra a qualquer momento";
  if (!i.data_leilao) return i.praca_atual ? `${i.praca_atual}ª praça, data a confirmar` : null;
  return `${i.praca_atual ? `${i.praca_atual}ª praça` : "Leilão"} em ${diaMes(i.data_leilao)}`;
}

export function tituloCurto(i: Pick<ItemBusca, "tipo" | "bairro" | "cidade" | "quartos">) {
  const tipo = TIPOS[i.tipo] ?? "Imóvel";
  const q = i.quartos ? ` ${i.quartos} quarto${i.quartos > 1 ? "s" : ""}` : "";
  return `${tipo}${q}${i.bairro ? ` · ${i.bairro}` : ""}`;
}

export function Chips({ i }: { i: ItemBusca }) {
  const ocup = OCUPACAO[i.ocupacao] ?? OCUPACAO.nao_informado;
  return (
    <div className="chips">
      {i.modalidade !== "outros" && <span className="chip">{MODALIDADES[i.modalidade] ?? i.modalidade}</span>}
      <span className={`chip ${ocup.classe}`}>{ocup.rotulo}</span>
      {i.debitos_por_conta === "vendedor" && <span className="chip chip-bom">Dívidas com o vendedor</span>}
      {i.debitos_por_conta === "arrematante" && <span className="chip chip-aviso">Dívidas com quem arremata</span>}
      {i.aceita_fgts && <span className="chip">FGTS</span>}
      {i.aceita_financiamento && <span className="chip">Financia</span>}
      {i.aceita_parcelamento && <span className="chip">Parcela</span>}
      {i.preco_caiu && <span className="chip chip-luz">Preço caiu</span>}
      {i.n_fontes > 1 && <span className="chip chip-fontes">{i.n_fontes} fontes</span>}
      {i.status === "suspenso" && <span className="chip chip-ruim">Suspenso</span>}
    </div>
  );
}

export default function CardImovel({ i, ativo, onFocar }: { i: ItemBusca; ativo?: boolean; onFocar?: () => void }) {
  const quando = quandoLeilao(i);
  return (
    <Link
      href={`/imovel/${i.imovel_id}`}
      className={`cartao${ativo ? " ativo" : ""}`}
      onMouseEnter={onFocar}
      onFocus={onFocar}
    >
      <div className="cartao-foto" style={i.foto ? { backgroundImage: `url(${i.foto})` } : undefined}>
        {i.foto ? null : <span>{TIPOS[i.tipo] ?? "Imóvel"}</span>}
        {i.desconto_avaliacao != null && i.desconto_avaliacao > 0 && (
          <b className="selo-desconto">−{porcento(i.desconto_avaliacao)}</b>
        )}
      </div>
      <div className="cartao-corpo">
        <h3>{tituloCurto(i)}</h3>
        <span className="muted">
          {[i.cidade && `${i.cidade}/${i.uf}`, area(i.area), i.comitente].filter(Boolean).join(" · ")}
        </span>
        <div className="cartao-preco">
          <span>Lance mínimo</span>
          <b>{reais(i.lance_minimo)}</b>
        </div>
        {quando && <span className="cartao-quando">{quando}</span>}
        <Chips i={i} />
      </div>
    </Link>
  );
}
