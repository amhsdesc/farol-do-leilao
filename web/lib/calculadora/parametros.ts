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
export const FONTE_ADVOGADO: Fonte = {
  descricao:
    "Valor de partida. Cada advogado cobra de um jeito (percentual ou valor fixo); as tabelas da OAB de cada estado servem de referência. Troque pelo orçamento que receber.",
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

/** DF 2026 (ANOREG-DF, tabela completa de emolumentos). Emolumentos + CCRCPN. */
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
export const FONTE_CARTORIO_DF: Fonte = {
  descricao: "Tabela de emolumentos 2026 do DF (escritura e registro de compra e venda ou carta de arrematação).",
  url: "https://anoregdf.org.br/wp-content/uploads/2025/12/TABELA-COMPLETA-DE-EMOLUMENTOS-2026.pdf",
  situacao: "confirmado",
};
/** Demais UFs até a tabela de cada estado entrar: percentuais de partida. */
export const ESCRITURA_PCT_PADRAO = 1.0;
export const REGISTRO_PCT_PADRAO = 0.6;
export const FONTE_CARTORIO_PADRAO: Fonte = {
  descricao:
    "Estimativa até a tabela de emolumentos deste estado entrar na calculadora. Cada estado tem sua tabela, publicada pelo Tribunal de Justiça.",
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
