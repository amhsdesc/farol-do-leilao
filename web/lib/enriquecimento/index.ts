/** Enriquecimento sob demanda de um lote: lê a página de detalhe (e a do leiloeiro, se houver) e extrai com IA
 * o que a lista original não trouxe. Só roda para ASSINANTE e só quando há lacuna (ver ./regras.ts).
 *
 * Custo sob controle, em camadas:
 *   1. a trava de assinante vem antes de qualquer rede ou IA;
 *   2. `pagina_cache` (mesma tabela do coletor): texto com o mesmo hash não é enviado de novo à IA;
 *   3. um lote só é refeito depois de REVALIDAR_DIAS, e só uma visita por vez (trava em `lote_enriquecimento`);
 *   4. teto diário de chamadas (ENRIQUECIMENTO_MAX_CHAMADAS_DIA, padrão 300), contado em `llm_uso_dia`.
 */
import { createHash } from "node:crypto";
import { lookup } from "node:dns/promises";
import { acesso } from "@/lib/acesso";
import { pool } from "@/lib/db";
import { FERRAMENTA, INSTRUCAO } from "./schema";
import {
  detectarCharset,
  extrairLinks,
  htmlParaTexto,
  ipPrivado,
  completarCom,
  mesclarExtracoes,
  normalizarExtracao,
  precisaEnriquecer,
  urlPublicaSegura,
  type Extracao,
  type EstadoEnriquecimento,
  type ImovelParaEnriquecer,
  type Link,
  type LoteParaEnriquecer,
} from "./regras";

const TIMEOUT_PAGINA_MS = 8_000;
const TIMEOUT_IA_MS = 30_000;
const MAX_BYTES_PAGINA = 2_000_000;
const AGENTE = "FarolDoLeilaoBot/1.0 (+https://faroldoleilao.com.br)";

const maxChamadasPorDia = () => Math.max(0, Number(process.env.ENRIQUECIMENTO_MAX_CHAMADAS_DIA ?? 300) || 0);
const modelo = () => process.env.MODELO_LLM || "claude-haiku-4-5-20251001";

export type Enriquecimento = { dados: Extracao; atualizado_em: string | null };

type LinhaEnr = { estado: EstadoEnriquecimento["estado"]; dados: Extracao; tentado_em: string; atualizado_em: string | null };

/** O que já foi descoberto sobre o lote (leitura rápida, sem rede). Vazio se nunca foi enriquecido. */
export async function enriquecimentoSalvo(loteId: number): Promise<Enriquecimento | null> {
  try {
    const { rows } = await pool.query<LinhaEnr>(
      "select estado, dados, tentado_em, atualizado_em from lote_enriquecimento where lote_id = $1 and atualizado_em is not null",
      [loteId],
    );
    return rows[0] ? { dados: rows[0].dados, atualizado_em: rows[0].atualizado_em } : null;
  } catch (e) {
    console.error("enriquecimentoSalvo", e); // ex.: migração 006 ainda não aplicada. A ficha segue sem o extra.
    return null;
  }
}

// ───────────────────────────── rede ─────────────────────────────

async function enderecoPublico(u: URL): Promise<boolean> {
  try {
    const achados = await lookup(u.hostname, { all: true });
    return achados.length > 0 && achados.every((a) => !ipPrivado(a.address));
  } catch {
    return false;
  }
}

/** Baixa uma página pública. Segue poucos redirecionamentos, conferindo cada destino (um site de terceiros não pode nos mandar para a rede interna).
 * Limite conhecido: o DNS é conferido aqui e resolvido de novo dentro do fetch; um domínio hostil que troque de IP entre
 * as duas consultas passaria. O risco é pequeno (só lemos HTML, com tamanho e tempo limitados) e fica registrado. */
async function baixarPagina(inicial: string, diag?: { motivo?: string }): Promise<{ html: string; url: string } | null> {
  const falha = (motivo: string) => {
    if (diag) diag.motivo = motivo; // vai para a coluna `erro`: diz por que a página não foi lida
    return null;
  };
  let atual = inicial;
  for (let salto = 0; salto < 3; salto++) {
    const u = urlPublicaSegura(atual);
    if (!u || !(await enderecoPublico(u))) return falha("endereço não público ou inválido");
    const controle = new AbortController();
    const cronometro = setTimeout(() => controle.abort(), TIMEOUT_PAGINA_MS);
    try {
      const resp = await fetch(u, {
        signal: controle.signal,
        redirect: "manual",
        headers: { "user-agent": AGENTE, accept: "text/html,application/xhtml+xml" },
      });
      if (resp.status >= 300 && resp.status < 400) {
        const destino = resp.headers.get("location");
        if (!destino) return falha(`redirecionamento ${resp.status} sem destino`);
        atual = new URL(destino, u).toString();
        continue;
      }
      if (!resp.ok) return falha(`o site respondeu HTTP ${resp.status}`);
      const tipo = resp.headers.get("content-type");
      if (tipo && !/html|text/i.test(tipo)) return falha(`tipo de conteúdo ${tipo.slice(0, 60)}`); // PDF e afins ficam para uma etapa futura (resumo do edital)
      const bytes = new Uint8Array(await resp.arrayBuffer()).slice(0, MAX_BYTES_PAGINA);
      const charset = detectarCharset(tipo, new TextDecoder("latin1").decode(bytes.slice(0, 2048)));
      let html: string;
      try {
        html = new TextDecoder(charset).decode(bytes);
      } catch {
        html = new TextDecoder("utf-8").decode(bytes);
      }
      return { html, url: u.toString() };
    } catch (e) {
      return falha(`falha de rede: ${e instanceof Error ? e.message : String(e)}`.slice(0, 120)); // timeout, site fora do ar, certificado ruim...
    } finally {
      clearTimeout(cronometro);
    }
  }
  return falha("redirecionamentos demais");
}

// ───────────────────────────── IA, cache e teto ─────────────────────────────

/** Reserva uma chamada do dia; false se o teto foi atingido. Atômico: duas visitas ao mesmo tempo não passam do teto. */
async function reservarChamada(): Promise<boolean> {
  const teto = maxChamadasPorDia();
  if (teto <= 0) return false;
  const { rowCount } = await pool.query(
    `insert into llm_uso_dia (dia, chamadas) values ((now() at time zone 'America/Sao_Paulo')::date, 1)
     on conflict (dia) do update set chamadas = llm_uso_dia.chamadas + 1 where llm_uso_dia.chamadas < $1`,
    [teto],
  );
  return (rowCount ?? 0) > 0;
}

async function chamarIA(texto: string, url: string, links: Link[]): Promise<unknown> {
  // chave própria do site (assim o Console mostra o gasto dele à parte do coletor); sem ela, usa a geral
  const chave = process.env.ANTHROPIC_API_KEY_SITE || process.env.ANTHROPIC_API_KEY;
  if (!chave) throw new Error("ANTHROPIC_API_KEY_SITE não configurada no site");
  const lista = links.length ? links.map((l, i) => `[${i}] ${l.texto || "(sem texto)"} -> ${l.url}`).join("\n") : "(nenhum)";
  const controle = new AbortController();
  const cronometro = setTimeout(() => controle.abort(), TIMEOUT_IA_MS);
  try {
    const r = await fetch("https://api.anthropic.com/v1/messages", {
      method: "POST",
      signal: controle.signal,
      headers: { "x-api-key": chave, "anthropic-version": "2023-06-01", "content-type": "application/json" },
      body: JSON.stringify({
        model: modelo(),
        max_tokens: 1024,
        system: INSTRUCAO,
        tools: [FERRAMENTA],
        tool_choice: { type: "tool", name: FERRAMENTA.name },
        messages: [{ role: "user", content: `URL: ${url}\n\nLinks da página:\n${lista}\n\nTexto da página:\n${texto}` }],
      }),
    });
    if (!r.ok) throw new Error(`IA respondeu ${r.status}`);
    const corpo = (await r.json()) as { content?: { type: string; input?: unknown }[] };
    return corpo.content?.find((b) => b.type === "tool_use")?.input ?? {};
  } finally {
    clearTimeout(cronometro);
  }
}

/** Lê uma página e devolve a extração. Texto igual ao já processado vem do cache, sem chamar a IA. */
async function extrairDaPagina(endereco: string, diag?: { motivo?: string }): Promise<{ extracao: Extracao; url: string } | null> {
  const pagina = await baixarPagina(endereco, diag);
  if (!pagina) return null;
  const texto = htmlParaTexto(pagina.html);
  if (texto.length < 80) {
    if (diag) diag.motivo = `página sem texto útil (${texto.length} caracteres, ${pagina.html.length} bytes de HTML)`;
    return null;
  } // página vazia (precisa de JavaScript, bloqueio etc.)
  const links = extrairLinks(pagina.html, pagina.url);
  const hash = createHash("sha1").update(texto).digest("hex");

  // Mesma tabela do coletor, chave própria ("enr:" + url): o coletor guarda sob a URL pura outro formato de
  // texto e de resultado, e se os dois usassem a mesma linha ficariam se sobrescrevendo e pagando a IA em loop.
  // Aqui vai a extração já limpa, com os endereços dos links já resolvidos.
  const chave = `enr:${pagina.url}`;
  const { rows } = await pool.query<{ hash_texto: string; extraido: { extracao?: Extracao } | null }>(
    "select hash_texto, extraido from pagina_cache where url = $1",
    [chave],
  );
  if (rows[0]?.hash_texto === hash && rows[0].extraido?.extracao) {
    return { extracao: rows[0].extraido.extracao, url: pagina.url };
  }

  if (!(await reservarChamada())) throw new Error("teto diário de chamadas de IA atingido");
  const extracao = normalizarExtracao(await chamarIA(texto, pagina.url, links), links);
  await pool.query(
    `insert into pagina_cache (url, hash_texto, extraido) values ($1, $2, $3)
     on conflict (url) do update set hash_texto = excluded.hash_texto, extraido = excluded.extraido, atualizado_em = now()`,
    [chave, hash, JSON.stringify({ extracao, origem: "site" })],
  );
  return { extracao, url: pagina.url };
}

// ───────────────────────────── orquestração ─────────────────────────────

/** Trava: só uma visita por vez enriquece o mesmo lote, e falha recente não é repetida de imediato. */
async function reservarLote(loteId: number): Promise<boolean> {
  const { rowCount } = await pool.query(
    `insert into lote_enriquecimento (lote_id, estado, tentado_em) values ($1, 'em_andamento', now())
     on conflict (lote_id) do update set estado = 'em_andamento', tentado_em = now()
       where lote_enriquecimento.estado = 'ok'
          or (lote_enriquecimento.estado = 'falhou' and lote_enriquecimento.tentado_em < now() - interval '60 minutes')
          or (lote_enriquecimento.estado = 'em_andamento' and lote_enriquecimento.tentado_em < now() - interval '3 minutes')`,
    [loteId],
  );
  return (rowCount ?? 0) > 0;
}

type LoteBanco = LoteParaEnriquecer & { id: number };

/**
 * Enriquece o lote se for o caso e devolve o que se sabe sobre ele (ou null).
 * `assinante` vem da sessão do servidor, nunca do navegador. Para quem não assina, não faz nada: nem rede, nem IA.
 */
export async function enriquecerLote(lote: LoteBanco, imovel: ImovelParaEnriquecer): Promise<Enriquecimento | null> {
  try {
    return await enriquecerLoteSemRede(lote, imovel);
  } catch (e) {
    console.error("enriquecerLote", e); // o enriquecimento é um extra: nunca derruba a ficha
    return null;
  }
}

async function enriquecerLoteSemRede(lote: LoteBanco, imovel: ImovelParaEnriquecer): Promise<Enriquecimento | null> {
  const { assinante } = await acesso();
  if (!assinante) return null;

  const { rows } = await pool.query<LinhaEnr>(
    "select estado, dados, tentado_em, atualizado_em from lote_enriquecimento where lote_id = $1",
    [lote.id],
  );
  const atual = rows[0] ?? null;
  // vale "já terminou bem alguma vez" (atualizado_em), e não o estado: uma revalidação que falha não esconde o que já se sabe
  const salvo = atual?.atualizado_em ? { dados: atual.dados, atualizado_em: atual.atualizado_em } : null;
  if (!precisaEnriquecer(lote, imovel, atual)) return salvo;
  if (!(await reservarLote(lote.id))) return salvo;

  const paginas: string[] = [];
  try {
    const diag: { motivo?: string } = {};
    const primeira = await extrairDaPagina(lote.url!, diag);
    if (!primeira) throw new Error(`não foi possível ler a página do lote: ${diag.motivo ?? "motivo desconhecido"}`);
    paginas.push(primeira.url);
    let total = primeira.extracao;
    let parcial: string | null = null;

    // segundo passo, no máximo um: a página do imóvel no site do leiloeiro (costuma ter bem mais informação)
    const destino = primeira.extracao.url_leiloeiro;
    if (destino && destino !== lote.url && !paginas.includes(destino)) {
      try {
        const segunda = await extrairDaPagina(destino);
        if (segunda && segunda.extracao.eh_pagina_do_imovel) {
          paginas.push(segunda.url);
          total = mesclarExtracoes(total, segunda.extracao);
        }
        // segunda === null: página ilegível (precisa de JavaScript, bloqueio, fora do ar). Não repete à toa: vale a revalidação normal.
      } catch (e) {
        // falha transitória (IA fora do ar, teto do dia): guarda o que veio e tenta o segundo passo de novo em 1h
        parcial = `segunda página não lida: ${e instanceof Error ? e.message : String(e)}`.slice(0, 300);
      }
    }

    // não trata como imóvel quem a IA disse que não é (evita gravar lixo de página de erro ou de lista)
    if (!total.eh_pagina_do_imovel) throw new Error("a página não parece ser de um imóvel");

    // resultado incompleto não apaga o que um passo anterior já tinha descoberto
    if (parcial) total = completarCom(atual?.atualizado_em ? atual.dados : null, total);

    await pool.query(
      `update lote_enriquecimento set estado = $4, dados = $2, paginas = $3, atualizado_em = now(), erro = $5 where lote_id = $1`,
      [lote.id, JSON.stringify(total), paginas, parcial ? "falhou" : "ok", parcial],
    );
    return { dados: total, atualizado_em: new Date().toISOString() };
  } catch (e) {
    await pool.query(
      `update lote_enriquecimento set estado = 'falhou', erro = $2, paginas = $3 where lote_id = $1`,
      [lote.id, (e instanceof Error ? e.message : String(e)).slice(0, 300), paginas],
    );
    return salvo; // se havia uma versão boa anterior, continua valendo
  }
}

/** Endereço guardado para o /ir/ (edital ou página do leiloeiro), só no servidor. */
export async function destinoEnriquecido(loteId: number, para: "edital" | "leiloeiro"): Promise<string | null> {
  try {
    const { rows } = await pool.query<{ d: string | null }>(
      "select dados->>$2 d from lote_enriquecimento where lote_id = $1 and atualizado_em is not null",
      [loteId, para === "edital" ? "edital_url" : "url_leiloeiro"],
    );
    return rows[0]?.d ?? null;
  } catch (e) {
    console.error("destinoEnriquecido", e);
    return null;
  }
}
