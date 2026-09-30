/** Busca sob demanda das fotos de um imóvel da Caixa.
 *
 * A lista oficial da Caixa (o CSV que o coletor baixa) não traz foto — só texto. As fotos só existem
 * na página de detalhe de cada imóvel, no site da Caixa. Buscar isso pra TODOS os imóveis durante a
 * coleta significaria uma requisição a mais por imóvel (são ~20 mil), deixando a coleta bem mais lenta.
 *
 * Por isso a busca acontece aqui, sob demanda: só quando alguém abre a ficha de um imóvel da Caixa que
 * ainda não tem foto salva (ver app/imovel/[id]/page.tsx). O resultado é gravado no lote, então a
 * próxima visita — de qualquer pessoa, inclusive na lista de busca — já vem com foto.
 */
import { pool } from "@/lib/db";

const TIMEOUT_MS = 8000;
const MAX_FOTOS = 12;

// <img src="...jpg|jpeg|png|webp">, com ou sem aspas simples
const RE_IMG = /<img[^>]+src=["']([^"']+\.(?:jpe?g|png|webp))["']/gi;
// ícones, logos e outros elementos de interface que não são foto do imóvel
const RE_IGNORAR = /logo|icone|icon|banner|seta|spacer|loading|selo|bandeira|placeholder/i;

export async function buscarFotosCaixa(urlDetalhe: string): Promise<string[]> {
  try {
    const controle = new AbortController();
    const cronometro = setTimeout(() => controle.abort(), TIMEOUT_MS);
    let resp: Response;
    try {
      resp = await fetch(urlDetalhe, {
        signal: controle.signal,
        headers: { "user-agent": "FarolDoLeilaoBot/1.0 (+https://faroldoleilao.com.br)" },
      });
    } finally {
      clearTimeout(cronometro);
    }
    if (!resp.ok) return [];
    const html = await resp.text();
    const achadas: string[] = [];
    const vistas = new Set<string>();
    for (const m of html.matchAll(RE_IMG)) {
      let src = m[1];
      if (RE_IGNORAR.test(src)) continue;
      if (src.startsWith("//")) src = "https:" + src;
      else if (src.startsWith("/")) src = new URL(src, urlDetalhe).toString();
      else if (!src.startsWith("http")) continue;
      if (vistas.has(src)) continue;
      vistas.add(src);
      achadas.push(src);
      if (achadas.length >= MAX_FOTOS) break;
    }
    return achadas;
  } catch {
    return []; // timeout, site fora do ar, layout mudou etc.: não trava a ficha por causa disso
  }
}

/** Só grava se o lote continuar sem foto (evita corrida entre duas visitas simultâneas). */
export async function salvarFotosLote(loteId: number, fotos: string[]): Promise<void> {
  if (!fotos.length) return;
  await pool.query("update lote set fotos = $2 where id = $1 and cardinality(fotos) = 0", [loteId, fotos]);
}
