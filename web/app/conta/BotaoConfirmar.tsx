"use client";

import { useState } from "react";

// Confirmação dentro da página (sem window.confirm).
export default function BotaoConfirmar({ acao, rotulo, pergunta }: { acao: () => Promise<void>; rotulo: string; pergunta: string }) {
  const [aberto, setAberto] = useState(false);
  if (!aberto) {
    return <button type="button" className="botao secundario" onClick={() => setAberto(true)}>{rotulo}</button>;
  }
  return (
    <form action={acao} className="confirmar">
      <p>{pergunta}</p>
      <div className="acoes-conta">
        <button className="botao perigo">Sim, cancelar</button>
        <button type="button" className="botao secundario" onClick={() => setAberto(false)}>Voltar</button>
      </div>
    </form>
  );
}
