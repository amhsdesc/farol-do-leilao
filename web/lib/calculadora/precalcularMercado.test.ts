// Rodar: node --experimental-strip-types --test lib/calculadora/precalcularMercado.test.ts
import assert from "node:assert/strict";
import { test } from "node:test";
import type { ArmazemMercado, LinhaMercado } from "./mercadoCore.ts";
import { resumir, type AnuncioMcp, type ResultadoMcp, type buscarNoChaves } from "./mercadoMcp.ts";
import { precalcularMercado, type Demanda } from "./precalcularMercado.ts";

const T0 = Date.UTC(2026, 9, 19, 12);
const DIA = 86_400_000;

function armazemMemoria() {
  const linhas: LinhaMercado[] = [];
  const a = {
    linhas,
    ia: 0,
    async ler(c) {
      const acha = (b: string) =>
        [...linhas].reverse().find((l) => l.uf === c.uf && l.cidadeChave === c.cidadeChave && l.tipo === c.tipo && l.faixaMin === c.faixaMin && l.faixaMax === c.faixaMax && l.bairroChave === b) ?? null;
      return { bairro: c.bairroChave ? acha(c.bairroChave) : null, cidade: acha("") };
    },
    async gravar(n) {
      linhas.push(...n);
    },
    async reservarIA() {
      a.ia++;
      return true;
    },
  } satisfies ArmazemMercado & { linhas: LinhaMercado[]; ia: number };
  return a;
}

const an = (bairro: string, m2: number): AnuncioMcp => ({ titulo: "x", preco: m2 * 60, area: 60, precoM2: m2, bairro });
const bons = (bairro: string, n: number) => Array.from({ length: n }, (_, i) => an(bairro, 10000 + i * 100));
function ok(anuncios: AnuncioMcp[], escopo: "bairro" | "cidade"): ResultadoMcp {
  const r = resumir(anuncios)!;
  return { ok: true, precoM2: r.precoM2, p25: r.p25, p75: r.p75, amostras: r.usados.slice(0, 6), total: r.usados.length, escopo, anuncios };
}

const demanda = (bairro: string | null, cidade = "Brasília", tipo = "apartamento", area = 62): Demanda => ({ uf: "DF", cidade, bairro, tipo, area });

test("agrupa imóveis da mesma região, prioriza a mais cheia e nunca usa IA", async () => {
  const a = armazemMemoria();
  const chamadas: (string | null | undefined)[] = [];
  const buscarMcp = (async (e) => {
    chamadas.push(e.bairro);
    return ok(bons(e.bairro ?? "Qualquer", 12), e.bairro ? "bairro" : "cidade");
  }) as typeof buscarNoChaves;
  const r = await precalcularMercado({
    demanda: [demanda("Asa Sul"), demanda("Asa Norte"), demanda("Asa Norte", "Brasília", "apartamento", 70), demanda("Asa Norte", "Brasília", "apartamento", 65)],
    atuais: [],
    armazem: a,
    buscarMcp,
    agora: () => T0,
    pausa: async () => {},
  });
  assert.equal(r.regioes, 2); // Asa Norte e Asa Sul (as três áreas caem na mesma faixa)
  assert.deepEqual(chamadas, ["Asa Norte", "Asa Sul"]); // a mais cheia primeiro
  assert.equal(r.comPreco, 2);
  assert.equal(a.ia, 0);
  assert.equal(r.paradoPor, "fim");
});

test("só faz o que falta ou vence em até 5 dias", async () => {
  const a = armazemMemoria();
  const chamadas: (string | null | undefined)[] = [];
  const buscarMcp = (async (e) => {
    chamadas.push(e.bairro);
    return ok(bons(e.bairro ?? "Qualquer", 12), "bairro");
  }) as typeof buscarNoChaves;
  // 1ª rodada enche o banco
  const demandas = [demanda("Asa Sul"), demanda("Asa Norte")];
  const r1 = await precalcularMercado({ demanda: demandas, atuais: [], armazem: a, buscarMcp, agora: () => T0, pausa: async () => {} });
  const atuaisEm = (dias: number) => {
    const m = new Map(a.linhas.map((l) => [`${l.bairroChave}`, l]));
    return [...m.values()].map((l) => ({ ...l, coletadoEm: new Date(T0 - dias * DIA).toISOString() }));
  };
  assert.equal(r1.pendentes, 2);
  // 2ª rodada, uma semana depois: nada a fazer
  chamadas.length = 0;
  const r2 = await precalcularMercado({ demanda: demandas, atuais: atuaisEm(7), armazem: a, buscarMcp, agora: () => T0 + 7 * DIA, pausa: async () => {} });
  assert.equal(r2.pendentes, 0);
  assert.equal(chamadas.length, 0);
  // com 26 dias de idade, renova
  const r3 = await precalcularMercado({ demanda: demandas, atuais: atuaisEm(0), armazem: a, buscarMcp, agora: () => T0 + 26 * DIA, pausa: async () => {} });
  assert.equal(r3.pendentes, 2);
});

test("respeita o orçamento de gravações e o limite de tempo", async () => {
  const buscarMcp = (async (e) => ok(bons(e.bairro ?? "X", 12), "bairro")) as typeof buscarNoChaves;
  const muitos = ["A", "B", "C", "D", "E"].map((b) => demanda(b));
  const r = await precalcularMercado({ demanda: muitos, atuais: [], armazem: armazemMemoria(), buscarMcp, agora: () => T0, pausa: async () => {}, maxResolucoes: 2 });
  assert.equal(r.resolvidas, 2);
  assert.equal(r.paradoPor, "orcamento");

  let relogio = T0;
  const lento = (async (e) => {
    relogio += 11 * 60_000;
    return ok(bons(e.bairro ?? "X", 12), "bairro");
  }) as typeof buscarNoChaves;
  const t = await precalcularMercado({ demanda: muitos, atuais: [], armazem: armazemMemoria(), buscarMcp: lento, agora: () => relogio, pausa: async () => {}, limiteMs: 15 * 60_000, intervaloMs: 0 });
  assert.equal(t.paradoPor, "tempo");
});

test("espaça as buscas ao portal e reaproveita: região servida de carona não gasta busca", async () => {
  const a = armazemMemoria();
  let agora = T0;
  const esperas: number[] = [];
  let buscas = 0;
  const buscarMcp = (async (e) => {
    buscas++;
    agora += 1_000; // a busca leva 1 s
    if (e.bairro) return { ok: false, motivo: "poucos", causa: "insuficiente", vistos: 0, anuncios: [] } as ResultadoMcp;
    // a cidade traz Asa Sul e Lago Sul com anúncios de sobra
    return ok([...bons("Asa Sul", 12), ...bons("Lago Sul", 12)], "cidade");
  }) as typeof buscarNoChaves;
  const r = await precalcularMercado({
    demanda: [demanda("Asa Sul"), demanda("Asa Sul"), demanda("Lago Sul")],
    atuais: [],
    armazem: a,
    buscarMcp,
    agora: () => agora,
    pausa: async (ms) => {
      esperas.push(ms);
      agora += ms;
    },
    intervaloMs: 3_000,
  });
  // Asa Sul: bairro (falha) + cidade (traz Asa Sul e Lago Sul). Lago Sul já está no banco: zero rede.
  assert.equal(buscas, 2);
  assert.equal(r.regioes, 2);
  assert.ok(esperas.some((ms) => ms >= 2_000 && ms <= 3_000)); // esperou entre a busca do bairro e a da cidade
  assert.equal(a.linhas.some((l) => l.bairroChave === "lago-sul" && l.precoM2 != null), true);
});

test("regiões com bairro sem anúncios e portal fora do ar: segue para a próxima sem travar", async () => {
  const buscarMcp = (async () => ({ ok: false, motivo: "HTTP 500", causa: "indisponivel", vistos: 0, anuncios: [] }) as ResultadoMcp) as typeof buscarNoChaves;
  const r = await precalcularMercado({ demanda: [demanda("A"), demanda("B")], atuais: [], armazem: armazemMemoria(), buscarMcp, agora: () => T0, pausa: async () => {}, intervaloMs: 0 });
  assert.equal(r.paradoPor, "fim");
  assert.equal(r.comPreco, 0);
});
