/**
 * Pré-cálculo do valor de mercado das regiões que TÊM imóvel em leilão ativo, sem IA e sem ninguém clicar.
 * Roda uma vez por semana (workflow "Valor de mercado"): só trabalha no que falta ou vence em até 5 dias, então a
 * primeira rodada enche o banco aos poucos e as seguintes quase não fazem consulta externa. O resultado fica em
 * `mercado_preco`: a ficha do imóvel lê dali (custo zero por visita) e a calculadora já encontra a região pronta.
 *
 * Educado com o portal: uma busca por vez, com intervalo entre elas (o limite deles é 60 requisições por minuto por IP),
 * orçamento de buscas e limite de tempo por rodada. A IA NUNCA é usada aqui.
 */
import {
  chaveDe,
  estimarMercado,
  idadeEmDias,
  REVALIDAR_ANTES_DIAS,
  VALIDADE_TENTATIVA_DIAS,
  type ArmazemMercado,
  type ChaveRegiao,
  type Dependencias,
  type EntradaMercado,
} from "./mercadoCore.ts";
import { buscarNoChaves } from "./mercadoMcp.ts";

export type Demanda = { uf: string; cidade: string; bairro: string | null; tipo: string; area: number };
export type Atual = ChaveRegiao & { precoM2: number | null; coletadoEm: string | Date };

export type RelatorioPrecalculo = {
  regioes: number; // regiões distintas com imóvel ativo
  pendentes: number; // as que faltavam ou venciam
  resolvidas: number; // as que exigiram ida ao portal (e foram gravadas)
  comPreco: number;
  semDados: number;
  paradoPor: "fim" | "orcamento" | "tempo";
};

export const idDaChave = (c: ChaveRegiao) => [c.uf, c.cidadeChave, c.bairroChave, c.tipo, c.faixaMin, c.faixaMax].join("|");

export async function precalcularMercado(d: {
  demanda: Demanda[];
  atuais: Atual[];
  armazem: ArmazemMercado;
  buscarMcp?: typeof buscarNoChaves;
  agora?: () => number;
  pausa?: (ms: number) => Promise<void>;
  maxResolucoes?: number;
  limiteMs?: number;
  intervaloMs?: number;
  aoProgredir?: (msg: string) => void;
}): Promise<RelatorioPrecalculo> {
  const agora = d.agora ?? Date.now;
  const pausa = d.pausa ?? ((ms: number) => new Promise<void>((r) => setTimeout(r, ms)));
  const maxResolucoes = d.maxResolucoes ?? 120;
  const limiteMs = d.limiteMs ?? 40 * 60_000;
  const intervaloMs = d.intervaloMs ?? 3_000;
  const inicio = agora();

  // regiões distintas, com quantos imóveis ativos cada uma tem (as mais cheias primeiro)
  const regioes = new Map<string, { entrada: EntradaMercado; lotes: number; chave: ChaveRegiao }>();
  for (const x of d.demanda) {
    if (!x.uf || !x.cidade || !(x.area > 0)) continue;
    const entrada: EntradaMercado = { uf: x.uf, cidade: x.cidade, bairro: x.bairro, tipo: x.tipo, area: x.area };
    const chave = chaveDe(entrada);
    const id = idDaChave(chave);
    const r = regioes.get(id);
    if (r) r.lotes++;
    else regioes.set(id, { entrada, lotes: 1, chave });
  }

  const atuais = new Map(d.atuais.map((a) => [idDaChave(a), a]));
  const pendentes = [...regioes.entries()]
    .filter(([id]) => {
      const a = atuais.get(id); // sem bairro, a chave tem bairro vazio e a linha é a da cidade
      return !a || idadeEmDias(a, agora()) >= (a.precoM2 != null ? REVALIDAR_ANTES_DIAS : VALIDADE_TENTATIVA_DIAS);
    })
    .sort((a, b) => b[1].lotes - a[1].lotes);

  // conta as gravações (= idas ao portal que deram o que guardar) e espaça as buscas
  let resolvidas = 0;
  const armazem: ArmazemMercado = {
    ler: (c) => d.armazem.ler(c),
    gravar: async (l) => {
      resolvidas++;
      await d.armazem.gravar(l);
    },
    reservarIA: async () => false,
  };
  let fimUltimaBusca = 0;
  const base = d.buscarMcp;
  const espacada: typeof buscarNoChaves = async (e, faixa, p) => {
    const espera = fimUltimaBusca + intervaloMs - agora();
    if (fimUltimaBusca && espera > 0) await pausa(espera);
    try {
      return await (base ?? buscarNoChaves)(e, faixa, p ?? pausa);
    } finally {
      fimUltimaBusca = agora();
    }
  };

  const dep: Dependencias = {
    armazem,
    permitirIA: false,
    agora: d.agora,
    buscarMcp: espacada,
    pausa,
    validade: { preco: REVALIDAR_ANTES_DIAS, tentativa: VALIDADE_TENTATIVA_DIAS },
  };

  let comPreco = 0;
  let semDados = 0;
  let paradoPor: RelatorioPrecalculo["paradoPor"] = "fim";
  for (const [, r] of pendentes) {
    if (resolvidas >= maxResolucoes) {
      paradoPor = "orcamento";
      break;
    }
    if (agora() - inicio > limiteMs) {
      paradoPor = "tempo";
      break;
    }
    const antes = resolvidas;
    const res = await estimarMercado(r.entrada, dep);
    if (resolvidas === antes) continue; // já estava pronta (outra região da mesma cidade trouxe os dados): nada gasto
    if (res.ok) comPreco++;
    else semDados++;
    d.aoProgredir?.(`${r.entrada.tipo} ${r.entrada.bairro ?? ""} ${r.entrada.cidade}/${r.entrada.uf}: ${res.ok ? `R$ ${res.precoM2}/m² (${res.escopo}, n=${res.n})` : res.erro}`);
  }
  return { regioes: regioes.size, pendentes: pendentes.length, resolvidas, comPreco, semDados, paradoPor };
}
