// Roda uma vez: processa a fila de eventos e os lembretes, imprime um resumo e sai.
// Uso: npm run notificacoes   (agendar num cron a cada 15-30 min, junto com a coleta)
import { processarNotificacoes } from "./motor.ts";
import { pool } from "../db.ts";

processarNotificacoes()
  .then(({ eventos, lembretes }) => {
    console.log(
      `eventos: ${eventos.enviados} enviados, ${eventos.ignorados} ignorados, ${eventos.falhas} falhas | ` +
        `lembretes: ${lembretes.enviados} enviados, ${lembretes.ignorados} ignorados, ${lembretes.falhas} falhas`,
    );
  })
  .catch((e) => {
    console.error("notificacoes: erro", e);
    process.exitCode = 1;
  })
  .finally(() => pool.end());
