"use server";

/**
 * Server Action do botão "Pesquisar valor de mercado" da calculadora. Fica fina de propósito: a lógica (banco →
 * Chaves na Mão no bairro → na cidade → IA) está em ./mercadoCore.ts, igual para o pré-cálculo e para os testes.
 * Arquivo "use server" só pode exportar funções assíncronas, por isso os tipos e as constantes ficam no núcleo.
 */
import { acesso } from "@/lib/acesso";
import { armazemBanco } from "./mercadoArmazem.ts";
import { estimarMercado, type EntradaMercado, type ResultadoMercado } from "./mercadoCore.ts";

export async function mercadoConfigurado() {
  return true; // o caminho sem IA (banco e portal) não precisa de chave; a IA só entra como reserva, se houver chave
}

export async function pesquisarValorMercado(e: EntradaMercado): Promise<ResultadoMercado> {
  // Uma Server Action pode ser chamada direto, sem passar pela página: a trava de assinante tem que valer aqui também.
  const { assinante } = await acesso();
  if (!assinante) return { ok: false, erro: "A pesquisa de valor de mercado é para assinantes." };
  return estimarMercado(
    { uf: String(e.uf ?? ""), cidade: String(e.cidade ?? ""), bairro: e.bairro ? String(e.bairro) : null, tipo: String(e.tipo ?? "outros"), area: Number(e.area) },
    { armazem: armazemBanco, permitirIA: true },
  );
}
