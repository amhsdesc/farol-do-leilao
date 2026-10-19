// Rodar: node --experimental-strip-types --test lib/calculadora/mercadoIA.test.ts
import assert from "node:assert/strict";
import { afterEach, beforeEach, test } from "node:test";
import { buscarNaWeb, chaveIA } from "./mercadoIA.ts";

const FETCH_ORIGINAL = globalThis.fetch;
const CHAVE_ORIGINAL = process.env.ANTHROPIC_API_KEY;
const faixa = { min: 51, max: 92 };
const buscar = () => buscarNaWeb({ tipo: "apartamento" }, faixa, "Setor Bueno, Goiânia, GO");

beforeEach(() => {
  process.env.ANTHROPIC_API_KEY = "chave-de-teste";
  delete process.env.ANTHROPIC_API_KEY_SITE;
});
afterEach(() => {
  process.env.ANTHROPIC_API_KEY = CHAVE_ORIGINAL;
  globalThis.fetch = FETCH_ORIGINAL;
});

const resposta = (texto: string) => ({ ok: true, json: async () => ({ content: [{ type: "text", text: texto }] }) }) as Response;
const bloco = (j: string) => "```json\n" + j + "\n```";

test("chave própria do site tem prioridade sobre a geral", () => {
  assert.equal(chaveIA(), "chave-de-teste");
  process.env.ANTHROPIC_API_KEY_SITE = "chave-do-site";
  assert.equal(chaveIA(), "chave-do-site");
});

test("extrai o bloco json; o R$/m² é recalculado (preço ÷ área), nunca o que o modelo diz", async () => {
  globalThis.fetch = (async () =>
    resposta(`Encontrei estes anúncios:\n${bloco('{"amostras":[{"titulo":"A","preco":350000,"area":58,"precoM2":1,"url":"https://exemplo.com/1"},{"titulo":"B","preco":380000,"area":62}],"precoM2Medio":99999}')}`)) as typeof fetch;
  const r = await buscar();
  assert.equal(r.ok, true);
  if (!r.ok) return;
  assert.equal(r.anuncios.length, 2);
  assert.equal(r.anuncios[0].precoM2, 6034.48);
  assert.equal(r.anuncios[1].precoM2, 6129.03);
});

test("link que não é http(s) é descartado; preço ou área inválidos saem da lista", async () => {
  globalThis.fetch = (async () =>
    resposta(bloco('{"amostras":[{"titulo":"A","preco":300000,"area":50,"url":"javascript:alert(1)"},{"titulo":"B","preco":-5,"area":50},{"titulo":"C","preco":300000,"area":0}]}'))) as typeof fetch;
  const r = await buscar();
  assert.equal(r.ok, true);
  if (r.ok) {
    assert.equal(r.anuncios.length, 1);
    assert.equal(r.anuncios[0].url, undefined);
  }
});

test("resposta sem anúncios úteis: erro amigável e 'vazio' (já gastou, vale guardar)", async () => {
  globalThis.fetch = (async () => resposta(bloco('{"amostras": []}'))) as typeof fetch;
  const r = await buscar();
  assert.equal(r.ok, false);
  assert.equal(!r.ok && r.vazio, true);
});

test("erro de rede vira mensagem amigável e NÃO é guardado", async () => {
  globalThis.fetch = (async () => {
    throw new Error("falha de conexão");
  }) as typeof fetch;
  const r = await buscar();
  assert.equal(r.ok, false);
  assert.equal(!r.ok && r.vazio, false);
});

test("resposta cortada (já gastou tokens): NÃO tenta de novo e é guardada como vazia", async () => {
  let chamadas = 0;
  globalThis.fetch = (async () => {
    chamadas++;
    return resposta('```json\n{"amostras": [{"titulo": "A", "preco": 300000, "area": 50, "precoM2":');
  }) as typeof fetch;
  const r = await buscar();
  assert.equal(chamadas, 1);
  assert.equal(r.ok, false);
  assert.equal(!r.ok && r.vazio, true);
});

test("API sobrecarregada (529): tenta uma segunda vez, pois ainda não gastou tokens", async () => {
  let chamadas = 0;
  globalThis.fetch = (async () => {
    chamadas++;
    return chamadas === 1 ? ({ ok: false, status: 529, text: async () => "" } as Response) : resposta(bloco('{"amostras": [{"titulo": "A", "preco": 300000, "area": 50}]}'));
  }) as typeof fetch;
  const r = await buscar();
  assert.equal(chamadas, 2);
  assert.equal(r.ok, true);
});

test("texto com chaves antes do JSON final: usa o último bloco válido", async () => {
  globalThis.fetch = (async () => resposta(`Vou buscar {em portais}.\n${bloco('{"amostras": [{"titulo": "A", "preco": 240000, "area": 40}]}')}`)) as typeof fetch;
  const r = await buscar();
  assert.equal(r.ok, true);
});

test("erro 401 não é repetido", async () => {
  let chamadas = 0;
  globalThis.fetch = (async () => {
    chamadas++;
    return new Response("{}", { status: 401 });
  }) as typeof fetch;
  const r = await buscar();
  assert.equal(chamadas, 1);
  assert.equal(r.ok, false);
});

test("o prompt usa a faixa de área e não pede quartos", async () => {
  let corpo = "";
  globalThis.fetch = (async (_u: string, init: RequestInit) => {
    corpo = String(init.body);
    return resposta(bloco('{"amostras": [{"titulo": "A", "preco": 300000, "area": 50}]}'));
  }) as typeof fetch;
  await buscar();
  assert.match(corpo, /51 a 92 m²/);
  assert.doesNotMatch(corpo, /quarto/);
});
