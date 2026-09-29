"use client";

import Link from "next/link";
import { useState } from "react";
import ControlesAlerta from "@/components/alertas/ControlesAlerta";
import type { LinhaAlerta } from "@/lib/alertas/tipos";
import { quando, reais, TIPOS } from "@/lib/formato";

export default function LinhaAlertaImovel({ a }: { a: LinhaAlerta }) {
  const [excluido, setExcluido] = useState(false);
  if (excluido) return null;

  const sumiu = a.imovel_id != null && a.imovel_tipo == null; // imóvel foi removido da base
  const titulo = a.imovel_tipo
    ? `${TIPOS[a.imovel_tipo] ?? "Imóvel"}${a.imovel_bairro ? ` em ${a.imovel_bairro}` : ""}, ${a.imovel_cidade}/${a.imovel_uf}`
    : "Imóvel não está mais disponível";

  return (
    <li className={`linha-alerta${a.ativo ? "" : " pausado"}`}>
      <div className="linha-alerta-foto" style={a.imovel_foto ? { backgroundImage: `url(${a.imovel_foto})` } : undefined} />
      <div className="linha-alerta-info">
        {sumiu ? (
          <b>{titulo}</b>
        ) : (
          <Link href={`/imovel/${a.imovel_id}`}><b>{titulo}</b></Link>
        )}
        <span className="muted num">
          {a.imovel_lance != null && `Lance mínimo ${reais(a.imovel_lance)}`}
          {a.imovel_data_leilao && ` · Leilão em ${quando(a.imovel_data_leilao)}`}
        </span>
        {!a.ativo && <span className="chip chip-aviso">Pausado</span>}
      </div>
      <ControlesAlerta a={a} onExcluido={() => setExcluido(true)} />
    </li>
  );
}
