// Rodar: node --experimental-strip-types --test lib/calculadora/pesquisaMercado.test.ts
import assert from "node:assert/strict";
import { afterEach, beforeEach, test } from "node:test";
import { mercadoConfigurado, pesquisarValorMercado } from "./pesquisaMercado.ts";

const CHAVE_ORIGINAL = process.env.ANTHROPIC_API_KEY;
const FETCH_ORIGINAL = globalThis.fetch;

beforeEach(() => {
  process.env.ANTHROPIC_API_KEY = "chave-de-teste";
  process.env.MERCADO_SEM_MCP = "1"; // os testes abaixo cobrem só a reserva com IA; o caminho MCP está em mercadoMcp.test.ts
});
afterEach(() => {
  process.env.ANTHROPIC_API_KEY = CHAVE_ORIGINAL;
  delete process.env.MERCADO_SEM_MCP;
  globalThis.fetch = FETCH_ORIGINAL;
});

function respostaAnthropic(texto: string) {
  return {
    ok: true,
    json: async () => ({ content: [{ type: "text", text: texto }] }),
  } as Response;
}

test("mercadoConfigurado é sempre verdadeiro: o caminho sem IA não precisa de chave", async () => {
  assert.equal(await mercadoConfigurado(), true);
  delete process.env.ANTHROPIC_API_KEY;
  assert.equal(await mercadoConfigurado(), true);
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
  // só 2 anúncios: o aviso de baixa confiança vem na frente, e a observação da IA é mantida
  assert.match(r.observacao ?? "", /^Só 2 anúncios encontrados: poucos anúncios, confiança baixa\..*poucos anúncios recentes na região$/);
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

test("resposta cortada (já gastou tokens): NÃO tenta de novo, devolve erro amigável", async () => {
  let chamadas = 0;
  globalThis.fetch = (async () => {
    chamadas++;
    return respostaAnthropic('```json\n{"amostras": [{"titulo": "A", "preco": 300000, "area": 50, "precoM2":');
  }) as typeof fetch;
  const r = await pesquisarValorMercado({ uf: "GO", cidade: "Goiânia", tipo: "apartamento", area: 60 });
  assert.equal(chamadas, 1);
  assert.equal(r.ok, false);
});

test("API sobrecarregada (529): tenta uma segunda vez, pois ainda não gastou tokens", async () => {
  let chamadas = 0;
  globalThis.fetch = (async () => {
    chamadas++;
    return chamadas === 1
      ? ({ ok: false, status: 529, text: async () => "" } as Response)
      : respostaAnthropic('```json\n{"amostras": [{"titulo": "A", "preco": 300000, "area": 50}]}\n```');
  }) as typeof fetch;
  const r = await pesquisarValorMercado({ uf: "GO", cidade: "Goiânia", tipo: "apartamento", area: 60 });
  assert.equal(chamadas, 2);
  assert.equal(r.ok, true);
});

test("texto com chaves antes do JSON final: usa o último bloco válido", async () => {
  globalThis.fetch = (async () =>
    respostaAnthropic('Vou buscar {em portais}.\n```json\n{"amostras": [{"titulo": "A", "preco": 240000, "area": 40}], "precoM2Medio": 6000}\n```')) as typeof fetch;
  const r = await pesquisarValorMercado({ uf: "GO", cidade: "Goiânia", tipo: "apartamento", area: 60 });
  assert.equal(r.ok, true);
});

test("erro 401 não é repetido", async () => {
  let chamadas = 0;
  globalThis.fetch = (async () => {
    chamadas++;
    return new Response("{}", { status: 401 });
  }) as typeof fetch;
  const r = await pesquisarValorMercado({ uf: "GO", cidade: "Goiânia", tipo: "apartamento", area: 60 });
  assert.equal(chamadas, 1);
  assert.equal(r.ok, false);
});

test("pause_turn: reenvia o que veio e continua até ter o JSON (sem gastar uma pesquisa nova)", async () => {
  let chamadas = 0;
  let corpos: { messages: { role: string }[] }[] = [];
  globalThis.fetch = (async (_url: unknown, init: RequestInit) => {
    chamadas++;
    corpos.push(JSON.parse(String(init.body)));
    if (chamadas === 1) {
      return { ok: true, json: async () => ({ stop_reason: "pause_turn", content: [{ type: "server_tool_use", name: "web_search" }] }) } as Response;
    }
    return {
      ok: true,
      json: async () => ({
        stop_reason: "end_turn",
        content: [{ type: "text", text: '```json\n{"amostras":[{"titulo":"A","preco":300000,"area":60,"url":"https://x/1"}]}\n```' }],
      }),
    } as Response;
  }) as typeof fetch;
  const r = await pesquisarValorMercado({ uf: "DF", cidade: "Brasília", bairro: "Taguatinga Norte", tipo: "apartamento", area: 64 });
  assert.equal(r.ok, true);
  assert.equal(chamadas, 2);
  assert.equal(corpos[1].messages.at(-1)?.role, "assistant"); // reenviou a vez da API, sem nova pergunta
});

test("max_tokens sem texto: mensagem própria e nenhuma segunda tentativa (já cobrou)", async () => {
  let chamadas = 0;
  globalThis.fetch = (async () => {
    chamadas++;
    return { ok: true, json: async () => ({ stop_reason: "max_tokens", content: [{ type: "server_tool_use", name: "web_search" }] }) } as Response;
  }) as typeof fetch;
  const r = await pesquisarValorMercado({ uf: "DF", cidade: "Brasília", bairro: "Taguatinga Norte", tipo: "apartamento", area: 64 });
  assert.equal(r.ok, false);
  assert.equal(chamadas, 1);
  assert.match((r as { erro: string }).erro, /longa demais/);
});

test("só 1 anúncio: devolve com aviso de confiança baixa (e marca para não guardar no cache)", async () => {
  globalThis.fetch = (async () => respostaAnthropic('```json\n{"amostras":[{"titulo":"A","preco":290000,"area":56,"url":"https://x/1"}]}\n```')) as typeof fetch;
  const r = await pesquisarValorMercado({ uf: "DF", cidade: "Brasília", bairro: "Taguatinga Norte", tipo: "apartamento", area: 64 });
  assert.equal(r.ok, true);
  if (r.ok) {
    assert.equal(r.confianca, "baixa");
    assert.match(r.observacao ?? "", /confiança baixa/);
  }
});

test("3 ou mais anúncios: sem aviso de baixa confiança", async () => {
  const am = [1, 2, 3].map((i) => `{"titulo":"A${i}","preco":${300000 + i * 1000},"area":60,"url":"https://x/${i}"}`).join(",");
  globalThis.fetch = (async () => respostaAnthropic('```json\n{"amostras":[' + am + ']}\n```')) as typeof fetch;
  const r = await pesquisarValorMercado({ uf: "DF", cidade: "Brasília", bairro: "Asa Norte", tipo: "apartamento", area: 64 });
  assert.equal(r.ok, true);
  if (r.ok) assert.equal(r.confianca, undefined);
});
