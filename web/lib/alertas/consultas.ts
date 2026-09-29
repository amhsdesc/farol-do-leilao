import { consulta } from "@/lib/db";
import type { LinhaAlerta } from "./tipos";

export type { LinhaAlerta } from "./tipos";
export { rotuloAlerta } from "./tipos";

/** Alertas da pessoa (imóvel e busca salva), mais recentes primeiro. */
export async function meusAlertas(usuarioId: number): Promise<LinhaAlerta[]> {
  const linhas = await consulta<LinhaAlerta>(
    `select a.id, a.tipo, a.imovel_id, a.filtros, a.nome, a.canal_email, a.canal_whatsapp, a.canal_telegram,
            a.ativo, a.criado_em,
            v.tipo imovel_tipo, v.uf imovel_uf, v.cidade imovel_cidade, v.bairro imovel_bairro,
            v.lance_minimo imovel_lance, v.data_leilao imovel_data_leilao, v.foto imovel_foto
     from alerta a
     left join vw_busca v on v.imovel_id = a.imovel_id
     where a.usuario_id = $1
     order by a.criado_em desc`,
    [usuarioId],
  );
  return linhas;
}

/** Se já existe um alerta (de qualquer status) desta pessoa para este imóvel. */
export async function alertaDoImovel(usuarioId: number, imovelId: number) {
  const [a] = await consulta<{ id: number; ativo: boolean }>(
    `select id, ativo from alerta where usuario_id = $1 and tipo = 'imovel' and imovel_id = $2`,
    [usuarioId, imovelId],
  );
  return a ?? null;
}
