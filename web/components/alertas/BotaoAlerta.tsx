"use client";

import { useState, useTransition } from "react";
import { alternarAlertaImovel } from "@/app/alertas/acoes";

type Props = {
  imovelId: number;
  ativoInicial: boolean;
  textoCriar: string;
  textoLigado?: string;
};

/** Botão "Me avise…" da ficha e do balão do mapa. Cria o alerta na primeira vez; clicar de novo pausa. */
export default function BotaoAlerta({ imovelId, ativoInicial, textoCriar, textoLigado = "Alerta ativo" }: Props) {
  const [ativo, setAtivo] = useState(ativoInicial);
  const [erro, setErro] = useState("");
  const [pendente, iniciar] = useTransition();

  function alternar() {
    setErro("");
    iniciar(async () => {
      const r = await alternarAlertaImovel(imovelId, !ativo);
      if (!r.ok) {
        setErro(r.erro);
        return;
      }
      setAtivo(r.ativo);
    });
  }

  return (
    <span className="botao-alerta-wrap">
      <button
        type="button"
        className={`botao secundario${ativo ? " ligado" : ""}`}
        onClick={alternar}
        disabled={pendente}
        title={ativo ? "Clique para não receber mais avisos deste imóvel" : undefined}
      >
        {pendente ? "…" : ativo ? `✓ ${textoLigado}` : textoCriar}
      </button>
      {erro && <span className="nota ruim aviso-alerta">{erro}</span>}
    </span>
  );
}
