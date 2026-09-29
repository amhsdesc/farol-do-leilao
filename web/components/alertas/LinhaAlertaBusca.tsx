"use client";

import Link from "next/link";
import { useState } from "react";
import ControlesAlerta from "@/components/alertas/ControlesAlerta";
import { rotuloAlerta, type LinhaAlerta } from "@/lib/alertas/tipos";
import { paraUrl } from "@/lib/busca/filtros";

export default function LinhaAlertaBusca({ a }: { a: LinhaAlerta }) {
  const [excluido, setExcluido] = useState(false);
  if (excluido) return null;

  const url = a.filtros ? `/?${paraUrl(a.filtros)}` : "/";

  return (
    <li className={`linha-alerta${a.ativo ? "" : " pausado"}`}>
      <div className="linha-alerta-info">
        <Link href={url}><b>{rotuloAlerta(a)}</b></Link>
        <span className="muted">Avisa quando aparecer um imóvel novo compatível</span>
        {!a.ativo && <span className="chip chip-aviso">Pausado</span>}
      </div>
      <ControlesAlerta a={a} onExcluido={() => setExcluido(true)} />
    </li>
  );
}
