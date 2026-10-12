// Rodar: node --experimental-strip-types --test lib/calculadora/mercadoMcp.test.ts
import assert from "node:assert/strict";
import { afterEach, beforeEach, test } from "node:test";
import { bairroConfere, buscarNoChaves, mediana, resumir } from "./mercadoMcp.ts";
import { pesquisarValorMercado } from "./pesquisaMercado.ts";

const FETCH_ORIGINAL = globalThis.fetch;
const sempausa = async () => {};
beforeEach(() => {
  delete process.env.MERCADO_SEM_MCP;
  process.env.ANTHROPIC_API_KEY = "chave-de-teste";
});
afterEach(() => {
  globalThis.fetch = FETCH_ORIGINAL;
});

function anuncio(bairro: string, preco: number, area: number) {
  return { id: String(Math.random()), title: "Apto", url: "https://www.chavesnamao.com.br/x", priceBRL: preco, areaM2: area, location: { city: "Brasília", state: "DF", neighborhood: bairro } };
}
function pagina(itens: object[]) {
  return JSON.stringify({ jsonrpc: "2.0", id: 1, result: { content: [{ type: "text", text: JSON.stringify({ results: itens }) }] } });
}
/** Servidor MCP falso: devolve as páginas na ordem; conta as chamadas de busca. */
function mcpFalso(paginas: object[][], estado = { buscas: 0, anthropic: 0, filtros: [] as unknown[] }) {
  globalThis.fetch = (async (url: string, init: RequestInit) => {
    if (String(url).includes("anthropic")) {
      estado.anthropic++;
      return new Response(JSON.stringify({ content: [{ type: "text", text: '```json\n{"amostras":[{"titulo":"A","preco":300000,"area":50}]}\n```' }] }), { status: 200 });
    }
    const corpo = JSON.parse(String(init.body));
    if (corpo.method === "initialize") return new Response(JSON.stringify({ jsonrpc: "2.0", id: 1, result: {} }), { status: 200, headers: { "mcp-session-id": "s1" } });
    if (corpo.method === "notifications/initialized") return new Response("", { status: 202 });
    estado.buscas++;
    estado.filtros.push(corpo.params.arguments.filters);
    return new Response(pagina(paginas[estado.buscas - 1] ?? []), { status: 200 });
  }) as typeof fetch;
  return estado;
}

test("bairro: 'Asa Norte' não casa com 'Samambaia Norte'; '(Taguatinga)' é ignorado", () => {
  assert.equal(bairroConfere("Asa Norte", "Asa Norte"), true);
  assert.equal(bairroConfere("Asa Norte", "Samambaia Norte"), false);
  assert.equal(bairroConfere("Taguatinga Sul", "Taguatinga Sul (Taguatinga)"), true);
  assert.equal(bairroConfere("Águas Claras", "AGUAS CLARAS"), true);
  assert.equal(bairroConfere("Norte", "Norte (Águas Claras)"), true);
});

test("mediana e descarte de valores absurdos", () => {
  assert.equal(mediana([1, 3, 2]), 2);
  const r = resumir([6000, 6200, 5800, 6100, 90000].map((m, i) => ({ titulo: "x", preco: m * 50, area: 50, precoM2: m, bairro: "b" + i })));
  assert.equal(r?.usados.length, 4);
  assert.equal(r?.precoM2, 6050);
});

test("MCP com anúncios suficientes do bairro: calcula sem tocar na IA", async () => {
  const bons = Array.from({ length: 9 }, (_, i) => anuncio("Asa Norte", 600000 + i * 10000, 60));
  const outros = Array.from({ length: 6 }, () => anuncio("Samambaia Norte", 300000, 60));
  const est = mcpFalso([[...bons, ...outros]]);
  const r = await pesquisarValorMercado({ uf: "DF", cidade: "Brasília", bairro: "Asa Norte", tipo: "apartamento", area: 62 });
  assert.equal(r.ok, true);
  if (!r.ok) return;
  assert.equal(r.fonte, "chaves-na-mao");
  assert.equal(est.anthropic, 0);
  assert.equal(r.precoM2Medio, 10666.67); // mediana de 600..680 mil (640 mil) / 60 m²
  assert.ok(r.amostras.length <= 6);
  assert.match(r.observacao ?? "", /9 anúncios.*Asa Norte/);
});

test("MCP com poucos anúncios do bairro: cai para a IA", async () => {
  const poucos = [anuncio("Asa Norte", 700000, 60), ...Array.from({ length: 14 }, () => anuncio("Samambaia Norte", 300000, 60))];
  const est = mcpFalso([poucos, [], []]);
  const r = await pesquisarValorMercado({ uf: "DF", cidade: "Brasília", bairro: "Asa Norte", tipo: "apartamento", area: 62 });
  assert.equal(est.anthropic, 1);
  assert.equal(r.ok, true);
  if (r.ok) assert.equal(r.fonte, "ia");
});

test("MCP insuficiente e sem chave da IA: erro claro, sem chamar a Anthropic", async () => {
  delete process.env.ANTHROPIC_API_KEY;
  const est = mcpFalso([[anuncio("Asa Norte", 700000, 60)]]);
  const r = await pesquisarValorMercado({ uf: "DF", cidade: "Brasília", bairro: "Asa Norte", tipo: "apartamento", area: 62 });
  assert.equal(r.ok, false);
  assert.equal(est.anthropic, 0);
});

test("MCP fora do ar (HTTP 500): cai para a IA", async () => {
  let ia = 0;
  globalThis.fetch = (async (url: string) => {
    if (String(url).includes("anthropic")) {
      ia++;
      return new Response(JSON.stringify({ content: [{ type: "text", text: '```json\n{"amostras":[{"titulo":"A","preco":300000,"area":50}]}\n```' }] }), { status: 200 });
    }
    return new Response("erro", { status: 500 });
  }) as typeof fetch;
  const r = await pesquisarValorMercado({ uf: "GO", cidade: "Goiânia", bairro: "Setor Bueno", tipo: "apartamento", area: 60 });
  assert.equal(ia, 1);
  assert.equal(r.ok, true);
});

test("sem bairro: usa a cidade, exigindo mais anúncios", async () => {
  const lista = Array.from({ length: 15 }, (_, i) => anuncio("Guará I", 500000 + i * 5000, 70));
  mcpFalso([lista]);
  const r = await buscarNoChaves({ uf: "DF", cidade: "Brasília", tipo: "apartamento", area: 70 }, { min: 60, max: 92 }, sempausa);
  assert.equal(r.ok, true);
  if (r.ok) assert.equal(r.escopo, "cidade");
});

test("pagina enquanto só há anúncios do bairro; para quando aparecem vizinhos; envia filtros certos", async () => {
  const doBairro = () => Array.from({ length: 15 }, () => anuncio("Asa Norte", 600000, 60));
  const misto = [...Array.from({ length: 5 }, () => anuncio("Asa Norte", 600000, 60)), ...Array.from({ length: 10 }, () => anuncio("Samambaia Norte", 300000, 60))];
  const est = mcpFalso([doBairro(), misto, doBairro()]);
  const r = await buscarNoChaves({ uf: "df", cidade: "Brasília", bairro: "Asa Norte", tipo: "apartamento", area: 62 }, { min: 51, max: 92 }, sempausa);
  assert.equal(r.ok, true);
  assert.equal(est.buscas, 2); // pág. 1 só do bairro (15 < 16): pede a 2ª; ela traz vizinhos, então não pede a 3ª
  assert.equal(r.ok && r.total, 20);
  assert.deepEqual(est.filtros[0], { transaction: "venda", propertyType: "apartamento", city: "Brasília", state: "DF", minArea: 51, maxArea: 92, neighborhood: "Asa Norte" });
});

test("só vizinhos na 1ª página (bairro sem anúncios): para na hora e falha", async () => {
  const cheia = () => Array.from({ length: 15 }, () => anuncio("Asa Sul", 300000, 30));
  const est = mcpFalso([cheia(), cheia()]);
  const r = await buscarNoChaves({ uf: "DF", cidade: "Brasília", bairro: "Taguatinga Sul", tipo: "comercial", area: 35 }, { min: 25, max: 52 }, sempausa);
  assert.equal(r.ok, false);
  assert.equal(est.buscas, 1);
});

test("tipo sem cobertura (vaga): nem chama o MCP", async () => {
  const est = mcpFalso([]);
  const r = await buscarNoChaves({ uf: "DF", cidade: "Brasília", tipo: "vaga", area: 12 }, { min: 10, max: 20 }, sempausa);
  assert.equal(r.ok, false);
  assert.equal(est.buscas, 0);
});
