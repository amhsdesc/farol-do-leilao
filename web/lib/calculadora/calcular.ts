/**
 * Motor da calculadora do Farol do Leilão. Tudo parte do valor de arrematação (lance).
 * Funções puras: o mesmo motor serve a página da calculadora, a ficha do imóvel, a busca e os alertas.
 */
import * as P from "./parametros.ts";

export type Modalidade = "judicial" | "extrajudicial" | "venda_direta" | "licitacao" | "outros";

export type Entrada = {
  lance: number;
  uf: string;
  cidade?: string | null;
  modalidade: Modalidade;
  imovelNovo?: boolean;

  /** valor de mercado = área × preço do m² na região, salvo se `valorMercado` for informado */
  area: number;
  precoM2Regiao?: number;
  valorMercado?: number;

  comissaoLeiloeiroPct?: number;
  advogadoPct?: number;
  advogadoFixo?: number;
  itbiPct?: number;
  itbiBase?: "lance" | "mercado";
  cartorioManual?: number;           // escritura + registro, se o usuário já tiver o orçamento
  outrasTaxasCartorio?: number;

  reformaPadrao?: P.PadraoReforma;
  reformaAreaM2?: number;            // padrão: a área do imóvel
  reformaCustoM2?: number;           // substitui a estimativa por padrão

  debitosAssumidos?: number;         // IPTU/condomínio atrasados que o edital passa ao arrematante
  desocupacao?: number;
  mesesAteVender?: number;
  condominioMensal?: number;
  iptuMensal?: number;
  outrosCustos?: number;
  laudemio?: number;                 // terrenos de marinha

  corretagemVendaPct?: number;
  isencaoReinvestimento?: boolean;
  isencaoUnicoImovel?: boolean;

  metaRetornoPct?: number;           // se informado, calcula o lance máximo
};

export type Grupo = "arrematar" | "preparar" | "manter" | "vender";

export type Item = {
  id: string;
  grupo: Grupo;
  rotulo: string;
  valor: number;
  detalhe: string;
  fonte: P.Fonte;
};

export type Resultado = {
  itens: Item[];
  custoPorGrupo: Record<Exclude<Grupo, "vender">, number>;
  investimentoTotal: number;   // tudo o que sai do bolso até vender
  valorMercado: number;
  corretagem: number;
  impostoRenda: number;
  vendaLiquida: number;
  lucro: number;
  retornoPct: number;          // lucro ÷ investimento total
  retornoMensalPct: number;    // equivalente ao mês, pelo prazo informado
  descontoRealPct: number;     // quanto o investimento total fica abaixo do valor de mercado
  lanceMaximo: number | null;  // para a meta de retorno, se informada
};

const r2 = (v: number) => Math.round(v * 100) / 100;

function sem(texto: string): string {
  return texto.normalize("NFKD").replace(/[̀-ͯ]/g, "").toLowerCase().trim();
}

export function aliquotaItbi(uf: string, cidade?: string | null, novo = false): { pct: number; achou: boolean } {
  const U = uf.toUpperCase();
  if (U === "DF") return { pct: novo ? 1 : P.ITBI_UF_UNICA.DF, achou: true };
  const chave = `${U}|${sem(cidade ?? "")}`;
  if (chave in P.ITBI_CIDADE) return { pct: P.ITBI_CIDADE[chave], achou: true };
  return { pct: P.ITBI_PADRAO, achou: false };
}

export function custoReformaM2(padrao: P.PadraoReforma, uf: string): number {
  if (padrao === "nenhuma") return 0;
  const f = P.REFORMA_M2[padrao];
  return r2(((f.min + f.max) / 2) * (P.FATOR_REGIONAL[uf.toUpperCase()] ?? 1));
}

export function impostoGanhoCapital(ganho: number): number {
  if (ganho <= 0) return 0;
  let imposto = 0;
  let piso = 0;
  for (const f of P.IR_FAIXAS) {
    const parte = Math.min(ganho, f.ate) - piso;
    if (parte <= 0) break;
    imposto += parte * f.aliquota;
    piso = f.ate;
  }
  return r2(imposto);
}

function valorMercadoDe(e: Entrada): number {
  if (e.valorMercado && e.valorMercado > 0) return e.valorMercado;
  return (e.precoM2Regiao ?? 0) * e.area;
}

/** Calcula tudo para um lance. Não calcula o lance máximo (ver `calcular`). */
function calcularParaLance(e: Entrada): Omit<Resultado, "lanceMaximo"> {
  const itens: Item[] = [];
  const add = (i: Item) => i.valor > 0 && itens.push({ ...i, valor: r2(i.valor) });
  const L = e.lance;
  const uf = e.uf.toUpperCase();
  const mercado = valorMercadoDe(e);

  // ---- para arrematar
  const comPct = e.comissaoLeiloeiroPct ?? P.COMISSAO_LEILOEIRO_PCT;
  add({ id: "leiloeiro", grupo: "arrematar", rotulo: "Comissão do leiloeiro", valor: (L * comPct) / 100,
        detalhe: `${comPct}% do lance, pagos ao leiloeiro no dia do arremate`, fonte: P.FONTE_COMISSAO });

  const advPct = e.advogadoPct ?? P.ADVOGADO_PCT;
  const adv = e.advogadoFixo && e.advogadoFixo > 0 ? e.advogadoFixo : (L * advPct) / 100;
  add({ id: "advogado", grupo: "arrematar", rotulo: "Advogado",
        valor: adv, detalhe: e.advogadoFixo ? "valor fixo informado" : `${advPct}% do lance: análise do edital, matrícula e acompanhamento`,
        fonte: P.FONTE_ADVOGADO });

  const itbi = aliquotaItbi(uf, e.cidade, e.imovelNovo);
  const itbiPct = e.itbiPct ?? itbi.pct;
  const baseItbi = e.itbiBase === "mercado" && mercado > L ? mercado : L;
  add({ id: "itbi", grupo: "arrematar", rotulo: "ITBI (imposto de transmissão)", valor: (baseItbi * itbiPct) / 100,
        detalhe: `${itbiPct}% sobre ${e.itbiBase === "mercado" ? "o valor de mercado" : "o lance"}${itbi.achou ? "" : " (cidade fora da tabela: confirme na prefeitura)"}`,
        fonte: itbi.achou ? P.FONTE_ITBI : { ...P.FONTE_ITBI, situacao: "estimativa" } });

  // escritura só existe fora do leilão judicial (no judicial, registra-se a carta de arrematação)
  const precisaEscritura = e.modalidade !== "judicial";
  if (e.cartorioManual && e.cartorioManual > 0) {
    add({ id: "cartorio", grupo: "arrematar", rotulo: "Cartório (escritura e registro)", valor: e.cartorioManual,
          detalhe: "valor informado por você", fonte: { descricao: "Orçamento do cartório", situacao: "confirmado" } });
  } else if (uf === "DF") {
    if (precisaEscritura)
      add({ id: "escritura", grupo: "arrematar", rotulo: "Escritura (tabelionato)", valor: P.valorFaixa(P.DF_ESCRITURA, L),
            detalhe: "tabela oficial do DF pela faixa de valor", fonte: P.FONTE_CARTORIO_DF });
    add({ id: "registro", grupo: "arrematar", rotulo: e.modalidade === "judicial" ? "Registro da carta de arrematação" : "Registro na matrícula",
          valor: P.valorFaixa(P.DF_REGISTRO, L), detalhe: "tabela oficial do DF pela faixa de valor", fonte: P.FONTE_CARTORIO_DF });
  } else {
    if (precisaEscritura)
      add({ id: "escritura", grupo: "arrematar", rotulo: "Escritura (tabelionato)", valor: (L * P.ESCRITURA_PCT_PADRAO) / 100,
            detalhe: `cerca de ${P.ESCRITURA_PCT_PADRAO}% do valor`, fonte: P.FONTE_CARTORIO_PADRAO });
    add({ id: "registro", grupo: "arrematar", rotulo: e.modalidade === "judicial" ? "Registro da carta de arrematação" : "Registro na matrícula",
          valor: (L * P.REGISTRO_PCT_PADRAO) / 100, detalhe: `cerca de ${P.REGISTRO_PCT_PADRAO}% do valor`, fonte: P.FONTE_CARTORIO_PADRAO });
  }
  add({ id: "taxas", grupo: "arrematar", rotulo: "Certidões e taxas (e-Notariado, prenotação)",
        valor: e.outrasTaxasCartorio ?? P.OUTRAS_TAXAS_CARTORIO, detalhe: "valor de partida", fonte: P.FONTE_OUTRAS_TAXAS });
  add({ id: "laudemio", grupo: "arrematar", rotulo: "Laudêmio", valor: e.laudemio ?? 0,
        detalhe: "só para terrenos de marinha e outros foros", fonte: { descricao: "Informado por você", situacao: "confirmado" } });
  add({ id: "debitos", grupo: "arrematar", rotulo: "Dívidas que o edital passa para você", valor: e.debitosAssumidos ?? 0,
        detalhe: "IPTU e condomínio atrasados, quando o edital diz que ficam com o arrematante",
        fonte: { descricao: "Leia o edital: é ele que define", situacao: "confirmado" } });

  // ---- para deixar pronto
  add({ id: "desocupacao", grupo: "preparar", rotulo: "Desocupação", valor: e.desocupacao ?? 0,
        detalhe: "acordo com o ocupante ou ação na justiça", fonte: { descricao: "Informado por você", situacao: "estimativa" } });
  const padrao = e.reformaPadrao ?? "nenhuma";
  const m2Reforma = e.reformaCustoM2 && e.reformaCustoM2 > 0 ? e.reformaCustoM2 : custoReformaM2(padrao, uf);
  const areaReforma = e.reformaAreaM2 ?? e.area;
  add({ id: "reforma", grupo: "preparar", rotulo: `Reforma${padrao !== "nenhuma" ? ` (padrão ${padrao === "medio" ? "médio" : padrao})` : ""}`,
        valor: m2Reforma * areaReforma,
        detalhe: `${areaReforma.toLocaleString("pt-BR")} m² × R$ ${m2Reforma.toLocaleString("pt-BR")}/m²`, fonte: P.FONTE_REFORMA });

  // ---- para manter até vender
  const meses = e.mesesAteVender ?? 12;
  add({ id: "condominio", grupo: "manter", rotulo: "Condomínio até vender", valor: (e.condominioMensal ?? 0) * meses,
        detalhe: `${meses} meses`, fonte: { descricao: "Informado por você", situacao: "estimativa" } });
  add({ id: "iptu", grupo: "manter", rotulo: "IPTU até vender", valor: (e.iptuMensal ?? 0) * meses,
        detalhe: `${meses} meses`, fonte: { descricao: "Informado por você", situacao: "estimativa" } });
  add({ id: "outros", grupo: "manter", rotulo: "Outros custos", valor: e.outrosCustos ?? 0,
        detalhe: "água, luz, seguro, vistoria, o que mais houver", fonte: { descricao: "Informado por você", situacao: "estimativa" } });

  const soma = (g: Grupo) => itens.filter((i) => i.grupo === g).reduce((s, i) => s + i.valor, 0);
  const custoPorGrupo = { arrematar: r2(soma("arrematar")), preparar: r2(soma("preparar")), manter: r2(soma("manter")) };
  const investimentoTotal = r2(L + custoPorGrupo.arrematar + custoPorGrupo.preparar + custoPorGrupo.manter);

  // ---- na venda
  const corrPct = e.corretagemVendaPct ?? P.CORRETAGEM_VENDA_PCT;
  const corretagem = r2((mercado * corrPct) / 100);
  // custo de aquisição aceito pela Receita: lance, comissão, ITBI, cartório, laudêmio e reforma comprovada.
  // Advogado, dívidas assumidas e custos de manutenção ficam de fora (critério conservador).
  const dedutiveis = new Set(["leiloeiro", "itbi", "escritura", "registro", "cartorio", "taxas", "laudemio", "reforma"]);
  const custoAquisicao = L + itens.filter((i) => dedutiveis.has(i.id)).reduce((s, i) => s + i.valor, 0);
  const ganho = mercado - corretagem - custoAquisicao;
  const isento = e.isencaoReinvestimento || (e.isencaoUnicoImovel && mercado <= P.IR_LIMITE_UNICO_IMOVEL);
  const impostoRenda = isento ? 0 : impostoGanhoCapital(ganho);
  if (corretagem > 0)
    itens.push({ id: "corretagem", grupo: "vender", rotulo: "Corretagem na venda", valor: corretagem,
                 detalhe: `${corrPct}% do valor de venda`, fonte: P.FONTE_CORRETAGEM });
  itens.push({ id: "ir", grupo: "vender", rotulo: "Imposto de renda sobre o lucro", valor: impostoRenda,
               detalhe: isento ? "isento pela opção marcada" : `sobre um ganho de R$ ${r2(Math.max(0, ganho)).toLocaleString("pt-BR")}`,
               fonte: P.FONTE_IR });

  const vendaLiquida = r2(mercado - corretagem - impostoRenda);
  const lucro = r2(vendaLiquida - investimentoTotal);
  const retorno = investimentoTotal > 0 ? lucro / investimentoTotal : 0;
  const retornoMensal = meses > 0 && retorno > -1 ? Math.pow(1 + retorno, 1 / meses) - 1 : 0;
  return {
    itens,
    custoPorGrupo,
    investimentoTotal,
    valorMercado: r2(mercado),
    corretagem,
    impostoRenda,
    vendaLiquida,
    lucro,
    retornoPct: r2(retorno * 100),
    retornoMensalPct: r2(retornoMensal * 100),
    descontoRealPct: mercado > 0 ? r2((1 - investimentoTotal / mercado) * 100) : 0,
  };
}

/**
 * Maior lance que ainda entrega a meta de retorno (lucro ÷ investimento total).
 * O retorno cai à medida que o lance sobe, então uma busca binária resolve (até R$ 1 de precisão).
 */
export function lanceMaximo(e: Entrada, metaPct: number): number | null {
  const mercado = valorMercadoDe(e);
  if (mercado <= 0) return null;
  const ret = (L: number) => calcularParaLance({ ...e, lance: L }).retornoPct;
  let baixo = 0;
  let alto = mercado * 1.5;
  if (ret(1) < metaPct) return 0; // nem de graça bate a meta (custos fixos altos demais)
  for (let i = 0; i < 60 && alto - baixo > 1; i++) {
    const meio = (baixo + alto) / 2;
    if (ret(meio) >= metaPct) baixo = meio;
    else alto = meio;
  }
  return Math.floor(baixo / 100) * 100; // arredonda para baixo, em centenas
}

export function calcular(e: Entrada): Resultado {
  const base = calcularParaLance(e);
  const meta = e.metaRetornoPct;
  return { ...base, lanceMaximo: meta != null && meta > -100 ? lanceMaximo(e, meta) : null };
}
