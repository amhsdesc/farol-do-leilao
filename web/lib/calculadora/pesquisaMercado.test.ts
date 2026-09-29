// Rodar: node --experimental-strip-types --test lib/calculadora/pesquisaMercado.test.ts
import assert from "node:assert/strict";
import { afterEach, beforeEach, test } from "node:test";
import { mercadoConfigurado, pesquisarValorMercado } from "./pesquisaMercado.ts";

const CHAVE_ORIGINAL = process.env.ANTHROPIC_API_KEY;
const FETCH_ORIGINAL = globalThis.fetch;

beforeEach(() => {
  process.env.ANTHROPIC_API_KEY = "chave-de-teste";
});
afterEach(() => {
  process.env.ANTHROPIC_API_KEY = CHAVE_ORIGINAL;
  globalThis.fetch = FETCH_ORIGINAL;
});

function respostaAnthropic(texto: string) {
  return {
    ok: true,
    json: async () => ({ content: [{ type: "text", text: texto }] }),
  } as Response;
}

test("mercadoConfigurado reflete a variável de ambiente", async () => {
  assert.equal(await mercadoConfigurado(), true);
  delete process.env.ANTHROPIC_API_KEY;
  assert.equal(await mercadoConfigurado(), false);
});

test("sem chave configurada, devolve erro sem chamar a rede", async () => {
  delete process.env.ANTHROPIC_API_KEY;
  let chamou = false;
  globalThis.fetch = (async () => {
    chamou = true;
    throw new Error("não deveria chamar");
  }) as typeof fetch;
  const r = await pesquisarValorMercado({ uf: "GO", cidade: "Goiânia", tipo: "apartamento", area: 60 });
  assert.equal(r.ok, false);
  assert.equal(chamou, false);
});

test("valida entrada: sem cidade ou área, nem tenta pesquisar", async () => {
  const r1 = await pesquisarValorMercado({ uf: "GO", cidade: "", tipo: "apartamento", area: 60 });
  assert.equal(r1.ok, false);
  const r2 = await pesquisarValorMercado({ uf: "GO", cidade: "Goiânia", tipo: "apartamento", area: 0 });
  assert.equal(r2.ok, false);
});

test("extrai o bloco json da resposta e calcula a média quando ela não vem pronta", async () => {
  globalThis.fetch = (async () => respostaAnthropic(`Encontrei estes anúncios parecidos:

\`\`\`json
{
  "amostras": [
    {"titulo": "Apto 58m² Setor Bueno", "preco": 350000, "area": 58, "precoM2": 6034.48, "url": "https://exemplo.com/1"},
    {"titulo": "Apto 62m² Setor Bueno", "preco": 380000, "area": 62, "precoM2": 6129.03, "url": "https://exemplo.com/2"}
  ],
  "precoM2Medio": 6081.76,
  "observacao": "poucos anúncios recentes na região"
}
\`\`\``)) as typeof fetch;

  const r = await pesquisarValorMercado({ uf: "GO", cidade: "Goiânia", bairro: "Setor Bueno", tipo: "apartamento", area: 60 });
  assert.equal(r.ok, true);
  if (!r.ok) return;
  assert.equal(r.precoM2Medio, 6081.76);
  assert.equal(r.amostras.length, 2);
  assert.equal(r.observacao, "poucos anúncios recentes na região");
});

test("sem precoM2Medio explícito, calcula a média das amostras", async () => {
  globalThis.fetch = (async () => respostaAnthropic(`\`\`\`json
{"amostras": [{"titulo": "A", "preco": 200000, "area": 50}, {"titulo": "B", "preco": 300000, "area": 60}]}
\`\`\``)) as typeof fetch;
  const r = await pesquisarValorMercado({ uf: "SP", cidade: "Campinas", tipo: "casa", area: 55 });
  assert.equal(r.ok, true);
  if (!r.ok) return;
  // precoM2 de A = 4000, de B = 5000 -> média 4500
  assert.equal(r.precoM2Medio, 4500);
});

test("resposta sem anúncios úteis devolve erro amigável", async () => {
  globalThis.fetch = (async () => respostaAnthropic('```json\n{"amostras": [], "precoM2Medio": 0}\n```')) as typeof fetch;
  const r = await pesquisarValorMercado({ uf: "AC", cidade: "Rio Branco", tipo: "terreno", area: 300 });
  assert.equal(r.ok, false);
});

test("erro de rede vira mensagem amigável, não exceção", async () => {
  globalThis.fetch = (async () => {
    throw new Error("falha de conexão");
  }) as typeof fetch;
  const r = await pesquisarValorMercado({ uf: "GO", cidade: "Goiânia", tipo: "apartamento", area: 60 });
  assert.equal(r.ok, false);
});

test("resposta HTTP não-ok vira mensagem amigável", async () => {
  globalThis.fetch = (async () => ({ ok: false, status: 529, text: async () => "" }) as Response) as typeof fetch;
  const r = await pesquisarValorMercado({ uf: "GO", cidade: "Goiânia", tipo: "apartamento", area: 60 });
  assert.equal(r.ok, false);
});
