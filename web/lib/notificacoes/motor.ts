// Motor de envio de alertas: processa a fila de eventos (evento_alerta) gravada pelo coletor e varre os
// lembretes de leilão (7 dias, 1 dia, 1 hora antes). Idempotente por causa da chave única em
// notificacao_enviada (alerta_id, imovel_id, tipo_evento, canal): a linha é inserida ANTES de tentar enviar,
// então uma corrida ou uma segunda chamada nunca manda o mesmo aviso duas vezes. Se o envio falhar, o erro
// fica registrado ali e não é reprocessado sozinho (é preciso rodar de novo à mão, ou o alerta some no próximo
// evento de verdade).
import { consulta } from "../db.ts";
import { enviarAlertaWhatsapp, whatsappConfigurado } from "../conta/whatsapp.ts";
import { mensagemEvento, mensagemLembrete, type ImovelResumo, type TipoLembrete } from "./mensagens.ts";
import { enviarEmail, resendConfigurado } from "./resend.ts";

function siteUrl(): string {
  return process.env.SITE_URL ?? "http://localhost:3000";
}

type Destinatario = {
  alerta_id: number;
  canal_email: boolean;
  canal_whatsapp: boolean;
  email: string | null;
  telefone: string | null;
};

export type ResultadoEnvio = { enviados: number; ignorados: number; falhas: number };

/** Reserva a linha de envio (evita duplicar); devolve o id se coube a este processo mandar, ou null se já foi. */
async function reservar(alertaId: number, imovelId: number, tipoEvento: string, canal: string): Promise<number | null> {
  const r = await consulta<{ id: number }>(
    `insert into notificacao_enviada (alerta_id, imovel_id, tipo_evento, canal)
     values ($1, $2, $3, $4) on conflict do nothing returning id`,
    [alertaId, imovelId, tipoEvento, canal],
  );
  return r[0]?.id ?? null;
}

async function registrarErro(notificacaoId: number, erro: unknown): Promise<void> {
  await consulta("update notificacao_enviada set erro = $1 where id = $2", [String((erro as Error)?.message ?? erro), notificacaoId]);
}

async function mandarParaDestinatario(
  d: Destinatario,
  imovelId: number,
  tipoEvento: string,
  msg: { assunto: string; texto: string },
  r: ResultadoEnvio,
): Promise<void> {
  if (d.canal_email && d.email && resendConfigurado()) {
    const id = await reservar(d.alerta_id, imovelId, tipoEvento, "email");
    if (id == null) {
      r.ignorados++;
    } else {
      try {
        await enviarEmail(d.email, msg.assunto, msg.texto);
        r.enviados++;
      } catch (e) {
        await registrarErro(id, e);
        r.falhas++;
      }
    }
  }
  if (d.canal_whatsapp && d.telefone && whatsappConfigurado()) {
    const id = await reservar(d.alerta_id, imovelId, tipoEvento, "whatsapp");
    if (id == null) {
      r.ignorados++;
    } else {
      try {
        await enviarAlertaWhatsapp(d.telefone, msg.texto);
        r.enviados++;
      } catch (e) {
        await registrarErro(id, e);
        r.falhas++;
      }
    }
  }
}

async function imovelResumo(imovelId: number): Promise<ImovelResumo> {
  const [i] = await consulta<ImovelResumo>(
    `select i.tipo, i.uf, i.cidade, i.bairro, v.lance_minimo as "lanceMinimo", v.data_leilao as "dataLeilao"
     from imovel i left join vw_busca v on v.imovel_id = i.id
     where i.id = $1`,
    [imovelId],
  );
  return i ?? { tipo: null, cidade: "", uf: "", bairro: null, lanceMinimo: null, dataLeilao: null };
}

async function destinatarios(imovelId: number): Promise<Destinatario[]> {
  return consulta<Destinatario>(
    `select a.id as alerta_id, a.canal_email, a.canal_whatsapp, u.email, u.telefone
     from alerta a join users u on u.id = a.usuario_id
     where a.tipo = 'imovel' and a.ativo = true and a.imovel_id = $1`,
    [imovelId],
  );
}

/** Processa a fila de mudanças (preço, data, suspensão, indisponibilidade) gravada pelo coletor. */
export async function processarEventosAlerta(limite = 500): Promise<ResultadoEnvio> {
  const r: ResultadoEnvio = { enviados: 0, ignorados: 0, falhas: 0 };
  const eventos = await consulta<{
    id: number; imovel_id: number; tipo: "preco" | "data" | "suspenso" | "indisponivel";
    valor_anterior: string | null; valor_novo: string | null;
  }>(`select id, imovel_id, tipo, valor_anterior, valor_novo from evento_alerta where processado_em is null order by id limit $1`, [limite]);

  for (const ev of eventos) {
    const ds = await destinatarios(ev.imovel_id);
    if (ds.length > 0) {
      const imovel = await imovelResumo(ev.imovel_id);
      const msg = mensagemEvento(ev.tipo, ev.imovel_id, imovel, ev.valor_anterior, ev.valor_novo, siteUrl());
      for (const d of ds) await mandarParaDestinatario(d, ev.imovel_id, ev.tipo, msg, r);
    }
    await consulta("update evento_alerta set processado_em = now() where id = $1", [ev.id]);
  }
  return r;
}

const LIMIARES: { tipo: TipoLembrete; intervalo: string }[] = [
  { tipo: "lembrete_7d", intervalo: "7 days" },
  { tipo: "lembrete_1d", intervalo: "1 day" },
  { tipo: "lembrete_1h", intervalo: "1 hour" },
];

/** Varre alertas de imóvel com leilão chegando e manda o lembrete de cada faixa (7d/1d/1h) uma vez só. */
export async function processarLembretes(): Promise<ResultadoEnvio> {
  const r: ResultadoEnvio = { enviados: 0, ignorados: 0, falhas: 0 };
  for (const { tipo, intervalo } of LIMIARES) {
    const candidatos = await consulta<
      Destinatario & ImovelResumo & { imovel_id: number }
    >(
      `select a.id as alerta_id, a.imovel_id, a.canal_email, a.canal_whatsapp, u.email, u.telefone,
              v.tipo, v.uf, v.cidade, v.bairro, v.lance_minimo as "lanceMinimo", v.data_leilao as "dataLeilao"
       from alerta a
       join users u on u.id = a.usuario_id
       join vw_busca v on v.imovel_id = a.imovel_id
       where a.tipo = 'imovel' and a.ativo = true
         and v.data_leilao is not null
         and now() >= v.data_leilao - interval '${intervalo}'
         and now() < v.data_leilao`,
      [],
    );
    for (const c of candidatos) {
      const msg = mensagemLembrete(tipo, c.imovel_id, c, siteUrl());
      await mandarParaDestinatario(c, c.imovel_id, tipo, msg, r);
    }
  }
  return r;
}

export async function processarNotificacoes(): Promise<{ eventos: ResultadoEnvio; lembretes: ResultadoEnvio }> {
  const eventos = await processarEventosAlerta();
  const lembretes = await processarLembretes();
  return { eventos, lembretes };
}
