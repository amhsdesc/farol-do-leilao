"use server";

import { revalidatePath } from "next/cache";
import { acesso } from "@/lib/acesso";
import type { Filtros } from "@/lib/busca/filtros";
import { consulta } from "@/lib/db";
import { limiteAlertas } from "@/lib/conta/regras";
import { alertaDoImovel } from "@/lib/alertas/consultas";

export type ResultadoAlerta = { ok: true; ativo: boolean } | { ok: false; erro: string };

/** Quantos alertas ativos (imóvel + busca) a pessoa já tem, e quantos o plano dela permite. */
async function verificarLimite(usuarioId: number, plano: string | null): Promise<string | null> {
  const limite = limiteAlertas(plano);
  if (limite === null) return null; // sem limite (plano anual)
  const [{ n }] = await consulta<{ n: number }>(
    `select count(*)::int n from alerta where usuario_id = $1 and ativo = true`,
    [usuarioId],
  );
  if (n >= limite) {
    return `Seu plano permite até ${limite} alerta${limite === 1 ? "" : "s"} ativo${limite === 1 ? "" : "s"} ao mesmo tempo. Pause ou exclua um alerta, ou troque de plano em Minha conta.`;
  }
  return null;
}

/** Liga ou desliga (pausa) o alerta de um imóvel. Cria o alerta na primeira vez. */
export async function alternarAlertaImovel(imovelId: number, ligar: boolean): Promise<ResultadoAlerta> {
  const { usuario, assinante, assinatura } = await acesso();
  if (!usuario) return { ok: false, erro: "Entre na sua conta para criar um alerta." };
  if (!assinante) return { ok: false, erro: "Alertas são para assinantes." };
  if (!Number.isInteger(imovelId) || imovelId <= 0) return { ok: false, erro: "Imóvel inválido." };

  if (ligar) {
    const existente = await alertaDoImovel(usuario.id, imovelId);
    if (!existente || !existente.ativo) {
      const erroLimite = await verificarLimite(usuario.id, assinatura?.plano ?? null);
      if (erroLimite) return { ok: false, erro: erroLimite };
    }
    await consulta(
      `insert into alerta (usuario_id, tipo, imovel_id, ativo)
       values ($1, 'imovel', $2, true)
       on conflict (usuario_id, imovel_id) where tipo = 'imovel'
       do update set ativo = true, pausado_em = null`,
      [usuario.id, imovelId],
    );
  } else {
    await consulta(
      `update alerta set ativo = false, pausado_em = now()
       where usuario_id = $1 and tipo = 'imovel' and imovel_id = $2`,
      [usuario.id, imovelId],
    );
  }
  revalidatePath(`/imovel/${imovelId}`);
  revalidatePath("/alertas");
  return { ok: true, ativo: ligar };
}

/** Salva a busca atual (filtros da tela) como um alerta de novos imóveis compatíveis. */
export async function criarAlertaBusca(filtros: Filtros, nome?: string): Promise<ResultadoAlerta> {
  const { usuario, assinante, assinatura } = await acesso();
  if (!usuario) return { ok: false, erro: "Entre na sua conta para salvar essa busca." };
  if (!assinante) return { ok: false, erro: "Buscas salvas são para assinantes." };

  // posição do mapa e ordenação não fazem parte do que define a busca salva
  const { pagina: _pagina, bbox: _bbox, centro: _centro, raio_km: _raio, ordem: _ordem, ...f } = filtros;
  if (Object.keys(f).length === 0) return { ok: false, erro: "Escolha pelo menos um filtro antes de salvar a busca." };

  const erroLimite = await verificarLimite(usuario.id, assinatura?.plano ?? null);
  if (erroLimite) return { ok: false, erro: erroLimite };

  await consulta(`insert into alerta (usuario_id, tipo, filtros, nome) values ($1, 'busca', $2, $3)`, [
    usuario.id,
    JSON.stringify(f),
    nome?.trim() || null,
  ]);
  revalidatePath("/alertas");
  return { ok: true, ativo: true };
}

export type DadosAlerta = { ativo?: boolean; canal_email?: boolean; canal_whatsapp?: boolean; canal_telegram?: boolean };

/** Pausar/retomar um alerta existente, ou trocar os canais de aviso. */
export async function atualizarAlerta(id: number, dados: DadosAlerta): Promise<ResultadoAlerta> {
  const { usuario, assinatura } = await acesso();
  if (!usuario) return { ok: false, erro: "Entre na sua conta." };

  if (dados.ativo === true) {
    const erroLimite = await verificarLimite(usuario.id, assinatura?.plano ?? null);
    if (erroLimite) return { ok: false, erro: erroLimite };
  }

  const campos: string[] = [];
  const valores: unknown[] = [];
  const add = (coluna: string, v: unknown) => {
    valores.push(v);
    campos.push(`${coluna} = $${valores.length}`);
  };
  if (dados.ativo !== undefined) {
    add("ativo", dados.ativo);
    add("pausado_em", dados.ativo ? null : new Date());
  }
  if (dados.canal_email !== undefined) add("canal_email", dados.canal_email);
  if (dados.canal_whatsapp !== undefined) add("canal_whatsapp", dados.canal_whatsapp);
  if (dados.canal_telegram !== undefined) add("canal_telegram", dados.canal_telegram);
  if (!campos.length) return { ok: true, ativo: dados.ativo ?? true };

  valores.push(id, usuario.id);
  const r = await consulta<{ ativo: boolean }>(
    `update alerta set ${campos.join(", ")} where id = $${valores.length - 1} and usuario_id = $${valores.length} returning ativo`,
    valores,
  );
  if (!r.length) return { ok: false, erro: "Alerta não encontrado." };
  revalidatePath("/alertas");
  return { ok: true, ativo: r[0].ativo };
}

export async function excluirAlerta(id: number): Promise<ResultadoAlerta> {
  const { usuario } = await acesso();
  if (!usuario) return { ok: false, erro: "Entre na sua conta." };
  await consulta(`delete from alerta where id = $1 and usuario_id = $2`, [id, usuario.id]);
  revalidatePath("/alertas");
  return { ok: true, ativo: false };
}
