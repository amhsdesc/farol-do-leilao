// Roda uma vez: processa a fila de eventos e os lembretes, imprime um resumo e sai.
// Uso: npm run notificacoes   (agendar num cron a cada 15-30 min, junto com a coleta)
import { processarNotificacoes } from "./motor.ts";
import { pool } from "../db.ts";

processarNotificacoes()
  .then(({ eventos, lembretes, buscas }) => {
    const linha = (nome: string, r: { enviados: number; ignorados: number; falhas: number }) =>
      `${nome}: ${r.enviados} enviados, ${r.ignorados} ignorados, ${r.falhas} falhas`;
    console.log([linha("eventos", eventos), linha("lembretes", lembretes), linha("buscas salvas", buscas)].join(" | "));
  })
  .catch((e) => {
    console.error("notificacoes: erro", e);
    process.exitCode = 1;
  })
  .finally(() => pool.end());
