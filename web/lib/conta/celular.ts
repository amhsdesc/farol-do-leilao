import { createHash, randomInt, timingSafeEqual } from "node:crypto";
import { modoTeste } from "@/auth";
import { consulta, pool } from "@/lib/db";
import { normalizarCelular } from "./regras";
import { enviarCodigoWhatsapp, whatsappConfigurado } from "./whatsapp";

const VALIDADE_MIN = 10;
const MAX_TENTATIVAS = 5;
const MAX_ENVIOS_10MIN = 3;
const MAX_ENVIOS_DIA = 8;

function hash(usuarioId: number, telefone: string, codigo: string) {
  return createHash("sha256").update(`${process.env.AUTH_SECRET}|${usuarioId}|${telefone}|${codigo}`).digest("hex");
}

export type ResultadoEnvio =
  | { ok: true; telefone: string; codigoTeste?: string }
  | { ok: false; erro: string };

export async function pedirCodigo(usuarioId: number, texto: string): Promise<ResultadoEnvio> {
  const telefone = normalizarCelular(texto);
  if (!telefone) return { ok: false, erro: "Confira o número: DDD + celular com 9 dígitos, ex.: (61) 99999-8888." };

  const [dono] = await consulta<{ id: number }>("select id from users where telefone = $1 and id <> $2", [telefone, usuarioId]);
  if (dono) return { ok: false, erro: "Este celular já está ligado a outra conta. Entre com a conta Google que você usou antes." };

  const [envios] = await consulta<{ dez: number; dia: number }>(
    `select count(*) filter (where criado_em > now() - interval '10 minutes')::int dez,
            count(*) filter (where criado_em > now() - interval '1 day')::int dia
     from codigo_celular where usuario_id = $1`,
    [usuarioId],
  );
  if (envios.dez >= MAX_ENVIOS_10MIN || envios.dia >= MAX_ENVIOS_DIA) {
    return { ok: false, erro: "Muitos códigos pedidos. Espere alguns minutos e tente de novo." };
  }

  const codigo = String(randomInt(0, 1_000_000)).padStart(6, "0");
  await consulta(
    `insert into codigo_celular (usuario_id, telefone, codigo_hash, expira_em)
     values ($1, $2, $3, now() + interval '${VALIDADE_MIN} minutes')`,
    [usuarioId, telefone, hash(usuarioId, telefone, codigo)],
  );

  if (whatsappConfigurado()) {
    try {
      await enviarCodigoWhatsapp(telefone, codigo);
    } catch (e) {
      return { ok: false, erro: (e as Error).message };
    }
    return { ok: true, telefone };
  }
  if (modoTeste) return { ok: true, telefone, codigoTeste: codigo };
  return { ok: false, erro: "O envio por WhatsApp ainda não foi configurado neste site." };
}

export type ResultadoConfirma = { ok: true } | { ok: false; erro: string };

export async function confirmarCodigo(usuarioId: number, telefone: string, codigo: string): Promise<ResultadoConfirma> {
  const limpo = (codigo ?? "").replace(/\D/g, "");
  if (limpo.length !== 6) return { ok: false, erro: "O código tem 6 números." };
  const [c] = await consulta<{ id: number; codigo_hash: string; tentativas: number; vencido: boolean }>(
    `select id, codigo_hash, tentativas, expira_em < now() vencido from codigo_celular
     where usuario_id = $1 and telefone = $2 and usado_em is null
     order by criado_em desc limit 1`,
    [usuarioId, telefone],
  );
  if (!c) return { ok: false, erro: "Peça um código primeiro." };
  if (c.vencido) return { ok: false, erro: "Este código venceu. Peça outro." };
  if (c.tentativas >= MAX_TENTATIVAS) return { ok: false, erro: "Tentativas demais com este código. Peça outro." };

  const esperado = Buffer.from(c.codigo_hash, "hex");
  const recebido = Buffer.from(hash(usuarioId, telefone, limpo), "hex");
  if (!timingSafeEqual(esperado, recebido)) {
    await consulta("update codigo_celular set tentativas = tentativas + 1 where id = $1", [c.id]);
    const resta = MAX_TENTATIVAS - c.tentativas - 1;
    return { ok: false, erro: resta > 0 ? `Código errado. Você ainda tem ${resta} tentativa${resta > 1 ? "s" : ""}.` : "Código errado. Peça outro." };
  }

  const cli = await pool.connect();
  try {
    await cli.query("begin");
    await cli.query("update codigo_celular set usado_em = now() where id = $1", [c.id]);
    await cli.query("update users set telefone = $2, telefone_validado_em = now() where id = $1", [usuarioId, telefone]);
    await cli.query("commit");
  } catch (e) {
    await cli.query("rollback");
    if ((e as { code?: string }).code === "23505") {
      return { ok: false, erro: "Este celular acabou de ser ligado a outra conta." };
    }
    throw e;
  } finally {
    cli.release();
  }
  return { ok: true };
}
