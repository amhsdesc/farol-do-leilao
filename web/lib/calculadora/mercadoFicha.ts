/**
 * Valor de mercado na ficha do imóvel: SÓ LEITURA do que o banco já tem (pré-cálculo semanal ou pesquisas anteriores).
 * Nunca vai à rede nem à IA: abrir a ficha não custa nada. Quem preenche o banco é o pré-cálculo e a calculadora.
 */
import { armazemBanco } from "./mercadoArmazem.ts";
import { estimativaGuardada, type Estimativa } from "./mercadoCore.ts";
import { TIPOS_COBERTOS } from "./mercadoMcp.ts";

export type MercadoDaFicha = Estimativa & {
  area: number;
  valorEstimado: number;
  /** quanto o lance fica abaixo do valor estimado (0,25 = 25% abaixo); negativo se estiver acima */
  descontoSobreMercado: number | null;
};

export async function mercadoDaFicha(
  im: { tipo: string; uf: string | null; cidade: string | null; bairro: string | null; area_privativa: number | null; area_total: number | null; area_terreno: number | null },
  lance: number | null | undefined,
): Promise<MercadoDaFicha | null> {
  const area = im.area_privativa ?? im.area_total ?? im.area_terreno; // mesma regra da vw_busca
  if (!im.uf || !im.cidade || !area || area <= 0 || !TIPOS_COBERTOS.includes(im.tipo)) return null;
  const r = await estimativaGuardada({ uf: im.uf, cidade: im.cidade, bairro: im.bairro, tipo: im.tipo, area }, armazemBanco);
  if (!r || !r.ok) return null;
  const valorEstimado = Math.round(r.precoM2 * area);
  return { ...r, area, valorEstimado, descontoSobreMercado: lance && lance > 0 && valorEstimado > 0 ? 1 - lance / valorEstimado : null };
}
