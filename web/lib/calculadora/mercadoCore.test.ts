// Rodar: node --experimental-strip-types --test lib/calculadora/mercadoCore.test.ts
import assert from "node:assert/strict";
import { afterEach, beforeEach, test } from "node:test";
import {
  chaveDe,
  classificarConfianca,
  estimarMercado,
  estimativaGuardada,
  faixaDeArea,
  type ArmazemMercado,
  type Dependencias,
  type LinhaMercado,
} from "./mercadoCore.ts";
import { resumir, type AnuncioMcp, type ResultadoMcp } from "./mercadoMcp.ts";
import type { RespostaIA } from "./mercadoIA.ts";

const CHAVE_ORIGINAL = process.env.ANTHROPIC_API_KEY;
beforeEach(() => {
  process.env.ANTHROPIC_API_KEY = "chave-de-teste";
  delete process.env.ANTHROPIC_API_KEY_SITE;
  delete process.env.MERCADO_SEM_MCP;
});
afterEach(() => {
  process.env.ANTHROPIC_API_KEY = CHAVE_ORIGINAL;
});

// ───────────── dublês ─────────────
const DIA = 86_400_000;
const T0 = Date.UTC(2026, 9, 19, 12);

function armazemMemoria(tetoIA = 100) {
  const linhas: LinhaMercado[] = [];
  const a = {
    linhas,
    gravacoes: 0,
    usoIA: 0,
    async ler(c) {
      const acha = (b: string) =>
        [...linhas].reverse().find((l) => l.uf === c.uf && l.cidadeChave === c.cidadeChave && l.tipo === c.tipo && l.faixaMin === c.faixaMin && l.faixaMax === c.faixaMax && l.bairroChave === b) ?? null;
      return { bairro: c.bairroChave ? acha(c.bairroChave) : null, cidade: acha("") };
    },
    async gravar(novas) {
      a.gravacoes++;
      linhas.push(...novas);
    },
    async reservarIA() {
      if (a.usoIA >= tetoIA) return false;
      a.usoIA++;
      return true;
    },
  } satisfies ArmazemMercado & { linhas: LinhaMercado[]; gravacoes: number; usoIA: number };
  return a;
}

const an = (bairro: string, precoM2: number, area = 60): AnuncioMcp => ({ titulo: `Apto ${bairro}`, preco: precoM2 * area, area, precoM2, bairro, url: "https://exemplo.com/x" });
const varios = (bairro: string, n: number, base = 10000) => Array.from({ length: n }, (_, i) => an(bairro, base + i * 100));

function mcpOk(anuncios: AnuncioMcp[], escopo: "bairro" | "cidade"): ResultadoMcp {
  const r = resumir(anuncios)!;
  return { ok: true, precoM2: r.precoM2, p25: r.p25, p75: r.p75, amostras: r.usados.slice(0, 6), total: r.usados.length, escopo, anuncios };
}
const mcpFalha = (causa: "insuficiente" | "indisponivel" | "sem_cobertura", anuncios: AnuncioMcp[] = []): ResultadoMcp => ({ ok: false, motivo: `falha ${causa}`, causa, vistos: anuncios.length, anuncios });

/** Portal falso: responde por bairro (ou cidade, quando bairro é null) e conta as buscas. */
function portal(resp: { bairro?: ResultadoMcp; cidade?: ResultadoMcp }) {
  const estado = { buscas: [] as (string | null)[] };
  const buscarMcp: NonNullable<Dependencias["buscarMcp"]> = async (e) => {
    estado.buscas.push(e.bairro ?? null);
    return (e.bairro ? resp.bairro : resp.cidade) ?? mcpFalha("insuficiente");
  };
  return { estado, buscarMcp };
}

function iaFalsa(r: RespostaIA) {
  const estado = { chamadas: 0 };
  const buscarIA: NonNullable<Dependencias["buscarIA"]> = async () => {
    estado.chamadas++;
    return r;
  };
  return { estado, buscarIA };
}

const asaNorte = { uf: "DF", cidade: "Brasília", bairro: "Asa Norte", tipo: "apartamento", area: 62 };
const dep = (a: ReturnType<typeof armazemMemoria>, extra: Partial<Dependencias> = {}): Dependencias => ({ armazem: a, permitirIA: false, agora: () => T0, ...extra });

// ───────────── chave e estatística ─────────────
test("faixa de área agrupa imóveis de tamanho parecido; chave ignora acento, caixa e parênteses de bairro", () => {
  assert.deepEqual(faixaDeArea(62), faixaDeArea(75));
  assert.notDeepEqual(faixaDeArea(62), faixaDeArea(95));
  const c = chaveDe({ uf: "df", cidade: "Brasília", bairro: "  Águas Claras ", tipo: "apartamento", area: 70 });
  assert.equal(c.uf, "DF");
  assert.equal(c.cidadeChave, "brasilia");
  assert.equal(c.bairroChave, "aguas-claras");
  assert.equal(chaveDe({ ...asaNorte, bairro: null }).bairroChave, "");
});

test("confiança: bairro com muitos anúncios e pouca dispersão é alta; cidade nunca passa de média; IA é sempre baixa", () => {
  const base = { n: 20, p25: 9000, mediana: 10000, p75: 11000 };
  assert.equal(classificarConfianca({ ...base, escopo: "bairro", fonte: "chaves-na-mao" }), "alta");
  assert.equal(classificarConfianca({ ...base, n: 9, escopo: "bairro", fonte: "chaves-na-mao" }), "media");
  assert.equal(classificarConfianca({ ...base, p25: 6000, p75: 15000, escopo: "bairro", fonte: "chaves-na-mao" }), "baixa");
  assert.equal(classificarConfianca({ ...base, n: 60, escopo: "cidade", fonte: "chaves-na-mao" }), "media");
  assert.equal(classificarConfianca({ ...base, n: 10, escopo: "cidade", fonte: "chaves-na-mao" }), "baixa");
  assert.equal(classificarConfianca({ ...base, escopo: "bairro", fonte: "ia" }), "baixa");
});

// ───────────── degraus: banco → bairro → cidade ─────────────
test("valida a entrada antes de qualquer coisa", async () => {
  const a = armazemMemoria();
  const { estado, buscarMcp } = portal({});
  assert.equal((await estimarMercado({ ...asaNorte, cidade: "" }, dep(a, { buscarMcp }))).ok, false);
  assert.equal((await estimarMercado({ ...asaNorte, area: 0 }, dep(a, { buscarMcp }))).ok, false);
  assert.equal(estado.buscas.length, 0);
});

test("1ª pesquisa vai ao portal e grava; a 2ª, de outra área da mesma faixa, lê do banco sem rede", async () => {
  const a = armazemMemoria();
  const { estado, buscarMcp } = portal({ bairro: mcpOk(varios("Asa Norte", 12), "bairro") });
  const r1 = await estimarMercado(asaNorte, dep(a, { buscarMcp }));
  assert.equal(r1.ok && r1.escopo, "bairro");
  assert.equal(r1.ok && r1.fonte, "chaves-na-mao");
  assert.equal(estado.buscas.length, 1);
  assert.equal(a.linhas.length, 1);

  const r2 = await estimarMercado({ ...asaNorte, area: 75 }, dep(a, { buscarMcp }));
  assert.equal(estado.buscas.length, 1); // nada de rede
  assert.equal(r2.ok && r2.precoM2, r1.ok && r1.precoM2);
  assert.equal(r2.ok && r2.baixo <= r2.precoM2 && r2.precoM2 <= r2.alto, true);
});

test("o resultado traz faixa p25–p75, confiança, amostras e observação", async () => {
  const a = armazemMemoria();
  const { buscarMcp } = portal({ bairro: mcpOk(varios("Asa Norte", 16), "bairro") });
  const r = await estimarMercado(asaNorte, dep(a, { buscarMcp }));
  assert.equal(r.ok, true);
  if (!r.ok) return;
  assert.equal(r.confianca, "alta");
  assert.equal(r.n, 16);
  assert.ok(r.baixo < r.precoM2 && r.precoM2 < r.alto);
  assert.ok(r.amostras.length <= 6);
  assert.match(r.observacao, /16 anúncios.*Asa Norte/);
});

test("registro vencido (mais de 30 dias) é refeito; dentro do prazo, não", async () => {
  const a = armazemMemoria();
  const { estado, buscarMcp } = portal({ bairro: mcpOk(varios("Asa Norte", 12), "bairro") });
  await estimarMercado(asaNorte, dep(a, { buscarMcp }));
  await estimarMercado(asaNorte, dep(a, { buscarMcp, agora: () => T0 + 29 * DIA }));
  assert.equal(estado.buscas.length, 1);
  await estimarMercado(asaNorte, dep(a, { buscarMcp, agora: () => T0 + 31 * DIA }));
  assert.equal(estado.buscas.length, 2);
  assert.equal(a.linhas.length, 2); // só se acrescenta: o histórico fica
});

test("validade menor (pré-cálculo) renova antes dos 30 dias", async () => {
  const a = armazemMemoria();
  const { estado, buscarMcp } = portal({ bairro: mcpOk(varios("Asa Norte", 12), "bairro") });
  await estimarMercado(asaNorte, dep(a, { buscarMcp }));
  await estimarMercado(asaNorte, dep(a, { buscarMcp, agora: () => T0 + 26 * DIA, validade: { preco: 25, tentativa: 7 } }));
  assert.equal(estado.buscas.length, 2);
});

test("bairro sem anúncios suficientes: usa a cidade, guarda a tentativa vazia do bairro e os bairros que bastaram", async () => {
  const a = armazemMemoria();
  const naCidade = [...varios("Lago Sul", 10, 14000), ...varios("Guará I", 5, 8000), ...varios("Asa Sul", 12, 11000), an("Asa Norte", 12000)];
  const { estado, buscarMcp } = portal({ bairro: mcpFalha("insuficiente"), cidade: mcpOk(naCidade, "cidade") });
  const r = await estimarMercado(asaNorte, dep(a, { buscarMcp }));
  assert.deepEqual(estado.buscas, ["Asa Norte", null]);
  assert.equal(r.ok && r.escopo, "cidade");
  assert.match(r.ok ? r.observacao : "", /Poucos anúncios no bairro Asa Norte; usamos a cidade/);

  const porBairro = new Map(a.linhas.map((l) => [l.bairroChave, l]));
  assert.equal(porBairro.get("asa-norte")?.precoM2, null); // tentativa vazia
  assert.equal(porBairro.get("")?.escopo, "cidade");
  assert.equal(porBairro.get("lago-sul")?.escopo, "bairro"); // reaproveitado: 10 anúncios bastam
  assert.equal(porBairro.get("asa-sul")?.escopo, "bairro");
  assert.equal(porBairro.has("guara-i"), false); // só 5: abaixo do mínimo
});

test("reaproveitamento: bairro que veio de carona na busca da cidade é respondido do banco, sem rede", async () => {
  const a = armazemMemoria();
  const naCidade = [...varios("Lago Sul", 10, 14000), ...varios("Asa Sul", 12, 11000)];
  const p1 = portal({ bairro: mcpFalha("insuficiente"), cidade: mcpOk(naCidade, "cidade") });
  await estimarMercado(asaNorte, dep(a, { buscarMcp: p1.buscarMcp }));
  const p2 = portal({});
  const r = await estimarMercado({ ...asaNorte, bairro: "Lago Sul" }, dep(a, { buscarMcp: p2.buscarMcp }));
  assert.equal(p2.estado.buscas.length, 0);
  assert.equal(r.ok && r.escopo, "bairro");
});

test("tentativa vazia vale 7 dias: o mesmo bairro não repete a consulta; depois disso, tenta de novo", async () => {
  const a = armazemMemoria();
  const naCidade = varios("Asa Sul", 20);
  const { estado, buscarMcp } = portal({ bairro: mcpFalha("insuficiente"), cidade: mcpOk(naCidade, "cidade") });
  await estimarMercado(asaNorte, dep(a, { buscarMcp }));
  const antes = estado.buscas.length;
  const r = await estimarMercado(asaNorte, dep(a, { buscarMcp, agora: () => T0 + 3 * DIA }));
  assert.equal(estado.buscas.length, antes);
  assert.equal(r.ok && r.escopo, "cidade"); // responde com a cidade guardada
  await estimarMercado(asaNorte, dep(a, { buscarMcp, agora: () => T0 + 8 * DIA }));
  assert.equal(estado.buscas.includes("Asa Norte"), true);
  assert.ok(estado.buscas.length > antes);
});

test("sem bairro informado: vai direto à cidade", async () => {
  const a = armazemMemoria();
  const { estado, buscarMcp } = portal({ cidade: mcpOk(varios("Asa Sul", 30), "cidade") });
  const r = await estimarMercado({ ...asaNorte, bairro: null }, dep(a, { buscarMcp }));
  assert.deepEqual(estado.buscas, [null]);
  assert.equal(r.ok && r.escopo, "cidade");
});

test("portal fora do ar: não guarda nada, não insiste na cidade e, sem IA permitida, devolve erro", async () => {
  const a = armazemMemoria();
  const { estado, buscarMcp } = portal({ bairro: mcpFalha("indisponivel") });
  const r = await estimarMercado(asaNorte, dep(a, { buscarMcp }));
  assert.equal(r.ok, false);
  assert.equal(estado.buscas.length, 1);
  assert.equal(a.linhas.length, 0);
});

test("MERCADO_SEM_MCP=1 pula o portal", async () => {
  process.env.MERCADO_SEM_MCP = "1";
  const a = armazemMemoria();
  const { estado, buscarMcp } = portal({ bairro: mcpOk(varios("Asa Norte", 12), "bairro") });
  const r = await estimarMercado(asaNorte, dep(a, { buscarMcp }));
  assert.equal(estado.buscas.length, 0);
  assert.equal(r.ok, false);
});

// ───────────── IA: último recurso ─────────────
const anunciosIA = [an("", 9000), an("", 9500), an("", 10000), an("", 10500)];

test("sem permissão (pré-cálculo, visitante): a IA nunca é chamada", async () => {
  const a = armazemMemoria();
  const { buscarMcp } = portal({});
  const ia = iaFalsa({ ok: true, anuncios: anunciosIA });
  const r = await estimarMercado(asaNorte, dep(a, { buscarMcp, buscarIA: ia.buscarIA, permitirIA: false }));
  assert.equal(r.ok, false);
  assert.equal(ia.estado.chamadas, 0);
  assert.equal(a.usoIA, 0);
});

test("com permissão: a IA entra só depois do portal falhar; resultado é recalculado, sempre confiança baixa, e fica guardado", async () => {
  const a = armazemMemoria();
  const { buscarMcp } = portal({});
  const ia = iaFalsa({ ok: true, anuncios: anunciosIA });
  const r = await estimarMercado(asaNorte, dep(a, { buscarMcp, buscarIA: ia.buscarIA, permitirIA: true }));
  assert.equal(ia.estado.chamadas, 1);
  assert.equal(a.usoIA, 1);
  assert.equal(r.ok && r.fonte, "ia");
  assert.equal(r.ok && r.confianca, "baixa");
  assert.equal(r.ok && r.precoM2, 9750); // mediana de 9000, 9500, 10000, 10500

  const r2 = await estimarMercado(asaNorte, dep(a, { buscarMcp, buscarIA: ia.buscarIA, permitirIA: true }));
  assert.equal(ia.estado.chamadas, 1); // 2ª vez: banco, zero IA
  assert.equal(r2.ok && r2.fonte, "ia");
});

test("sem chave da IA: nem reserva o teto nem chama", async () => {
  delete process.env.ANTHROPIC_API_KEY;
  const a = armazemMemoria();
  const ia = iaFalsa({ ok: true, anuncios: anunciosIA });
  const r = await estimarMercado(asaNorte, dep(a, { buscarMcp: portal({}).buscarMcp, buscarIA: ia.buscarIA, permitirIA: true }));
  assert.equal(r.ok, false);
  assert.equal(ia.estado.chamadas, 0);
  assert.equal(a.usoIA, 0);
});

test("teto diário atingido: erro claro e nenhuma chamada", async () => {
  const a = armazemMemoria(0);
  const ia = iaFalsa({ ok: true, anuncios: anunciosIA });
  const r = await estimarMercado(asaNorte, dep(a, { buscarMcp: portal({}).buscarMcp, buscarIA: ia.buscarIA, permitirIA: true }));
  assert.equal(ia.estado.chamadas, 0);
  assert.equal(!r.ok && /limite de hoje/.test(r.erro), true);
});

test("IA respondeu mas sem anúncios úteis: guarda a tentativa e não paga de novo na mesma região", async () => {
  const a = armazemMemoria();
  const { buscarMcp } = portal({});
  const ia = iaFalsa({ ok: false, vazio: true, erro: "Não encontrei anúncios parecidos." });
  await estimarMercado(asaNorte, dep(a, { buscarMcp, buscarIA: ia.buscarIA, permitirIA: true }));
  await estimarMercado(asaNorte, dep(a, { buscarMcp, buscarIA: ia.buscarIA, permitirIA: true, agora: () => T0 + DIA }));
  assert.equal(ia.estado.chamadas, 1);
  assert.equal(a.usoIA, 1);
});

test("falha de rede da IA não é guardada: a próxima tentativa pode repetir", async () => {
  const a = armazemMemoria();
  const { buscarMcp } = portal({});
  const ia = iaFalsa({ ok: false, vazio: false, erro: "Não consegui pesquisar agora." });
  await estimarMercado(asaNorte, dep(a, { buscarMcp, buscarIA: ia.buscarIA, permitirIA: true }));
  await estimarMercado(asaNorte, dep(a, { buscarMcp, buscarIA: ia.buscarIA, permitirIA: true }));
  assert.equal(ia.estado.chamadas, 2);
});

test("IA com menos de 3 anúncios úteis (ou valores absurdos) não vira estimativa", async () => {
  const a = armazemMemoria();
  const ia = iaFalsa({ ok: true, anuncios: [an("", 9000), an("", 9500)] });
  const r = await estimarMercado(asaNorte, dep(a, { buscarMcp: portal({}).buscarMcp, buscarIA: ia.buscarIA, permitirIA: true }));
  assert.equal(r.ok, false);
});

// ───────────── leitura para a ficha ─────────────
test("estimativaGuardada: só lê; devolve o bairro, senão a cidade, senão nada", async () => {
  const a = armazemMemoria();
  assert.equal(await estimativaGuardada(asaNorte, a, T0), null);
  const naCidade = [...varios("Asa Sul", 30)];
  await estimarMercado({ ...asaNorte, bairro: null }, dep(a, { buscarMcp: portal({ cidade: mcpOk(naCidade, "cidade") }).buscarMcp }));
  const r = await estimativaGuardada(asaNorte, a, T0 + DIA);
  assert.equal(r?.ok && r.escopo, "cidade");
  assert.equal(await estimativaGuardada(asaNorte, a, T0 + 40 * DIA), null); // vencido
});
