/**
 * Parâmetros da calculadora. Cada valor diz de onde veio e se está confirmado.
 * "estimativa" = valor de partida editável pelo usuário, a confirmar com fonte oficial.
 * Revisar este arquivo a cada ano (tabelas de cartório e ITBI mudam em janeiro).
 */

export type Fonte = { descricao: string; url?: string; situacao: "confirmado" | "estimativa" };

// ---------------------------------------------------------------- leiloeiro

export const COMISSAO_LEILOEIRO_PCT = 5;
export const FONTE_COMISSAO: Fonte = {
  descricao: "Mínimo de 5% sobre a arrematação (Decreto 21.981/1932, art. 24; STJ, RMS 65.084/2023)",
  url: "https://www.stj.jus.br/sites/portalp/Paginas/Comunicacao/Noticias/2023/26072023-Comissao-de-leiloeiro-publico-deve-ser-fixada--no-minimo--em-5--sobre-os-bens-arrematados.aspx",
  situacao: "confirmado",
};

// ---------------------------------------------------------------- advogado

export const ADVOGADO_PCT = 2;
export const ADVOGADO_MINIMO = 4_000;
export const FONTE_ADVOGADO: Fonte = {
  descricao:
    "Valor de partida: 2% do lance, com mínimo de R$ 4.000 (análise do edital e da matrícula costuma justificar esse piso mesmo em lances baixos). Cada advogado cobra de um jeito " +
    "(percentual ou valor fixo); as tabelas da OAB de cada estado servem de referência. Troque pelo orçamento que receber.",
  situacao: "estimativa",
};

// ---------------------------------------------------------------- ITBI

/** Alíquota por município (capitais e grandes cidades). Chave: "UF|cidade sem acento, minúscula". */
export const ITBI_CIDADE: Record<string, number> = {
  "DF|brasilia": 2, "SP|sao paulo": 3, "RJ|rio de janeiro": 3, "BA|salvador": 3, "CE|fortaleza": 3,
  "MG|belo horizonte": 3, "AM|manaus": 2, "PR|curitiba": 2.7, "PE|recife": 3, "RS|porto alegre": 3,
  "PA|belem": 3, "GO|goiania": 2, "SP|guarulhos": 3, "SP|campinas": 3, "MA|sao luis": 2, "AL|maceio": 3,
  "MS|campo grande": 2, "PI|teresina": 2, "RJ|sao goncalo": 3, "PB|joao pessoa": 3, "RN|natal": 3,
  "SC|florianopolis": 2, "MT|cuiaba": 2, "SE|aracaju": 2, "RO|porto velho": 2, "AP|macapa": 2,
  "AC|rio branco": 2, "RR|boa vista": 2, "TO|palmas": 2, "ES|vitoria": 2, "SP|osasco": 3,
  "SP|santo andre": 2, "SP|sao bernardo do campo": 3, "SP|ribeirao preto": 2, "MG|uberlandia": 3,
  "SP|sorocaba": 2, "MG|contagem": 3, "SC|joinville": 2, "PR|londrina": 2, "RJ|niteroi": 3,
  "RJ|duque de caxias": 3, "SP|sao jose dos campos": 2.5,
};
/** No DF não há municípios: todo o território usa a alíquota de Brasília. */
export const ITBI_UF_UNICA: Record<string, number> = { DF: 2 };
export const ITBI_PADRAO = 3; // quando a cidade não está na tabela: usa o teto mais comum, conservador
export const FONTE_ITBI: Fonte = {
  descricao:
    "Tabela aproximada de alíquotas por cidade (mar/2026). No DF, 2% para imóvel usado e 1% para novo. Cidade fora da tabela: 3%, o mais comum. Confirme na prefeitura.",
  url: "https://conexaoimoveis.com.br/tabelas/itbi-por-cidade",
  situacao: "estimativa",
};
export const FONTE_ITBI_BASE: Fonte = {
  descricao:
    "A base é o valor de mercado (STJ, Tema 1.113; LC 227/2026). Em arrematação, o valor do lance costuma ser aceito, mas a prefeitura pode usar um valor de referência maior.",
  url: "https://www.stj.jus.br/sites/portalp/Paginas/Comunicacao/Noticias/09032022-Base-de-calculo-do-ITBI-e-o-valor-do-imovel-transmitido-em-condicoes-normais-de-mercado--define-Primeira-Secao.aspx",
  situacao: "confirmado",
};

// ---------------------------------------------------------------- cartório

type Faixa = { ate: number; valor: number };

/**
 * Tabelas reais de emolumentos por UF, por faixa de valor. Cada estado publica a sua (normalmente via
 * corregedoria/ANOREG local) e elas mudam em janeiro. Preenchidas aos poucos, um estado de cada vez —
 * ver a UF em `FONTE_CARTORIO_UF` para a fonte e a data de cada tabela. Onde ainda não há tabela real,
 * a calculadora cai no percentual de partida (`ESCRITURA_PCT_PADRAO`/`REGISTRO_PCT_PADRAO`).
 */
export const DF_ESCRITURA: Faixa[] = [
  { ate: 200_351.09, valor: 2_020.76 },
  { ate: 343_224.42, valor: 2_196.48 },
  { ate: 858_882.16, valor: 2_372.2 },
  { ate: 1_313_777.69, valor: 2_547.92 },
  { ate: Infinity, valor: 2_723.63 },
];
export const DF_REGISTRO: Faixa[] = [
  { ate: 143_365.99, valor: 1_107.02 },
  { ate: 200_351.09, valor: 1_199.28 },
  { ate: 263_576.65, valor: 1_254.62 },
  { ate: 286_567.76, valor: 1_263.84 },
  { ate: 1_477_999.89, valor: 1_273.07 },
  { ate: Infinity, valor: 1_291.52 },
];

/** SP 2026 (ARISP, tabela de registro de imóveis — "registro com valor declarado", capital e interior). */
export const SP_REGISTRO: Faixa[] = [
  { ate: 2_306, valor: 257.2 },
  { ate: 5_761, valor: 412.72 },
  { ate: 9_603, valor: 740.42 },
  { ate: 19_210, valor: 1_098.57 },
  { ate: 38_420, valor: 1_335.6 },
  { ate: 115_260, valor: 1_489.46 },
  { ate: 192_100, valor: 1_901.09 },
  { ate: 230_520, valor: 2_311.88 },
  { ate: 268_940, valor: 2_516.87 },
  { ate: 307_360, valor: 2_723.02 },
  { ate: 345_780, valor: 2_870.61 },
  { ate: 384_200, valor: 2_945.43 },
  { ate: 768_400, valor: 3_284.18 },
  { ate: 1_152_600, valor: 3_846.1 },
  { ate: 1_536_800, valor: 4_427.79 },
  { ate: Infinity, valor: 4_427.79 }, // tabela sobe por faixas maiores; confirme para imóveis acima de R$ 1,5 milhão
];

/** MG 2026 (Corregedoria-Geral de Justiça de MG, tabela 4 — "registro com conteúdo financeiro", valor final ao usuário). */
export const MG_REGISTRO: Faixa[] = [
  { ate: 1_400, valor: 224.25 },
  { ate: 2_720, valor: 365.8 },
  { ate: 5_440, valor: 530.1 },
  { ate: 7_000, valor: 733.86 },
  { ate: 14_000, valor: 978.62 },
  { ate: 28_000, valor: 1_264.34 },
  { ate: 42_000, valor: 1_590.32 },
  { ate: 56_000, valor: 1_957.62 },
  { ate: 70_000, valor: 2_365.56 },
  { ate: 105_000, valor: 2_977.2 },
  { ate: 140_000, valor: 3_780.6 },
  { ate: 175_000, valor: 4_042.86 },
  { ate: 210_000, valor: 4_305.6 },
  { ate: 280_000, valor: 4_843.46 },
  { ate: 350_000, valor: 4_976.89 },
  { ate: 420_000, valor: 5_110.92 },
  { ate: 560_000, valor: 5_600.46 },
  { ate: 700_000, valor: 5_908.27 },
  { ate: 840_000, valor: 6_216.7 },
  { ate: 1_120_000, valor: 6_956.63 },
  { ate: 1_400_000, valor: 7_535.23 },
  { ate: 1_680_000, valor: 8_114.82 },
  { ate: 3_200_000, valor: 8_695.59 },
  { ate: Infinity, valor: 8_695.59 }, // acima disso a tabela usa regra própria por faixa de R$ 500 mil; confirme no cartório
];

/** Tabelas de escritura por UF (faixa de valor). Só DF por enquanto. */
export const ESCRITURA_FAIXAS_UF: Record<string, Faixa[]> = {
  DF: DF_ESCRITURA,
};
/** Tabelas de registro por UF (faixa de valor). */
export const REGISTRO_FAIXAS_UF: Record<string, Faixa[]> = {
  DF: DF_REGISTRO,
  SP: SP_REGISTRO,
  MG: MG_REGISTRO,
};

export const FONTE_CARTORIO_UF: Record<string, Fonte> = {
  DF: {
    descricao: "Tabela de emolumentos 2026 do DF (escritura e registro de compra e venda ou carta de arrematação).",
    url: "https://anoregdf.org.br/wp-content/uploads/2025/12/TABELA-COMPLETA-DE-EMOLUMENTOS-2026.pdf",
    situacao: "confirmado",
  },
  SP: {
    descricao:
      "Tabela de emolumentos 2026 de SP (ARISP), item de registro com valor declarado. Não inclui ISS do município (varia por cidade). Escritura de SP ainda não está na calculadora: usa o percentual de partida.",
    url: "https://arisp.com.br/wp-content/uploads/2026/01/0.pdf",
    situacao: "confirmado",
  },
  MG: {
    descricao:
      "Tabela de emolumentos 2026 da Corregedoria-Geral de Justiça de MG (item 5-e, registro com conteúdo financeiro), valor final ao usuário (já com FUNDESP/FAJUD e taxa judiciária). Escritura de MG ainda não está na calculadora: usa o percentual de partida.",
    url: "https://betim.ribmg.org.br/wp-content/uploads/sites/87/2026/01/Tabela-4-de-Emolumentos-2026.pdf",
    situacao: "confirmado",
  },
};

/** Demais UFs (e escritura fora do DF) até a tabela de cada estado entrar: percentuais de partida. */
export const ESCRITURA_PCT_PADRAO = 1.0;
export const REGISTRO_PCT_PADRAO = 0.6;
export const FONTE_CARTORIO_PADRAO: Fonte = {
  descricao:
    "Estimativa até a tabela de emolumentos deste estado entrar na calculadora. Cada estado tem sua tabela, publicada pelo Tribunal de Justiça ou pela associação de cartórios local.",
  url: "https://www.anoreg.org.br/site/tabela-de-emolumentos/",
  situacao: "estimativa",
};

/** Certidões, prenotação, certificado digital do e-Notariado, taxas de protocolo. */
export const OUTRAS_TAXAS_CARTORIO = 800;
export const FONTE_OUTRAS_TAXAS: Fonte = {
  descricao: "Certidões, prenotação, e-Notariado e taxas de protocolo. Valor de partida.",
  situacao: "estimativa",
};

export function valorFaixa(faixas: Faixa[], valor: number): number {
  return (faixas.find((f) => valor <= f.ate) ?? faixas[faixas.length - 1]).valor;
}

// ---------------------------------------------------------------- reforma

export type PadraoReforma = "nenhuma" | "simples" | "medio" | "alto";
/** R$/m², média nacional 2026 (meio de cada faixa). */
export const REFORMA_M2: Record<Exclude<PadraoReforma, "nenhuma">, { min: number; max: number }> = {
  simples: { min: 500, max: 800 },
  medio: { min: 900, max: 1_500 },
  alto: { min: 1_600, max: 2_500 },
};
/** Ajuste regional: Sul e Sudeste 15–20% acima da média; SP e RJ 15–25%. */
export const FATOR_REGIONAL: Record<string, number> = {
  SP: 1.2, RJ: 1.2, MG: 1.15, ES: 1.15, PR: 1.15, SC: 1.15, RS: 1.15,
};
export const FONTE_REFORMA: Fonte = {
  descricao:
    "Faixas nacionais de 2026 por padrão (simples R$ 500–800/m², médio R$ 900–1.500/m², alto R$ 1.600–2.500/m²), com ajuste de +15% a +20% no Sul e Sudeste. Próxima versão: CUB de cada estado.",
  url: "https://www.reformeconstrua.com.br/blog/quanto-custa-reforma-por-m2",
  situacao: "estimativa",
};

// ---------------------------------------------------------------- venda

export const CORRETAGEM_VENDA_PCT = 6;
export const FONTE_CORRETAGEM: Fonte = { descricao: "Percentual usual de corretagem na revenda. Valor de partida.", situacao: "estimativa" };

/** IR sobre ganho de capital de pessoa física (Lei 13.259/2016): alíquota por faixa do ganho. */
export const IR_FAIXAS = [
  { ate: 5_000_000, aliquota: 0.15 },
  { ate: 10_000_000, aliquota: 0.175 },
  { ate: 30_000_000, aliquota: 0.2 },
  { ate: Infinity, aliquota: 0.225 },
];
export const IR_LIMITE_UNICO_IMOVEL = 440_000;
export const FONTE_IR: Fonte = {
  descricao:
    "Pessoa física: 15% sobre o lucro até R$ 5 milhões (17,5%, 20% e 22,5% acima). Isenções: vender o único imóvel por até R$ 440 mil, ou usar o dinheiro para comprar outro imóvel residencial em 180 dias. Pago por DARF até o último dia útil do mês seguinte à venda.",
  url: "https://o-tributo.com/ganho-de-capital-irpf-2026-aliquotas-calculo",
  situacao: "confirmado",
};
