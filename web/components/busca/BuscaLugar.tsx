"use client";

import { useEffect, useId, useState } from "react";
import type { Bbox } from "./MapaBusca";

type Lugar = { rotulo: string; uf: string; n: number; o: number; s: number; l: number; nn: number };

/** "Cidade ou bairro" → leva o mapa até lá. Livre para todos: é a busca pelo mapa. */
export default function BuscaLugar({ onEscolher }: { onEscolher: (b: Bbox) => void }) {
  const [texto, setTexto] = useState("");
  const [lugares, setLugares] = useState<Lugar[]>([]);
  const [aberto, setAberto] = useState(false);
  const [ativo, setAtivo] = useState(0);
  const [semResultado, setSemResultado] = useState(false);
  const id = useId();

  useEffect(() => {
    const q = texto.trim();
    if (q.length < 2) {
      setLugares([]);
      setSemResultado(false);
      return;
    }
    const ctl = new AbortController();
    const t = setTimeout(() => {
      fetch(`/api/lugares?q=${encodeURIComponent(q)}`, { signal: ctl.signal })
        .then((r) => r.json())
        .then((d) => {
          setLugares(d.lugares ?? []);
          setSemResultado((d.lugares ?? []).length === 0);
          setAtivo(0);
        })
        .catch(() => {});
    }, 200);
    return () => {
      clearTimeout(t);
      ctl.abort();
    };
  }, [texto]);

  const escolher = (l?: Lugar) => {
    if (!l) return;
    onEscolher([l.o, l.s, l.l, l.nn]);
    setTexto(l.rotulo);
    setAberto(false);
  };

  return (
    <form
      className="busca-lugar"
      role="search"
      onSubmit={(e) => {
        e.preventDefault();
        escolher(lugares[ativo]);
      }}
    >
      <label htmlFor={`${id}-q`} className="so-leitor">Cidade ou bairro</label>
      <div className="busca-lugar-campo">
        <input
          id={`${id}-q`}
          value={texto}
          placeholder="Cidade ou bairro"
          autoComplete="off"
          role="combobox"
          aria-expanded={aberto && lugares.length > 0}
          aria-controls={`${id}-lista`}
          aria-activedescendant={lugares.length ? `${id}-${ativo}` : undefined}
          onChange={(e) => {
            setTexto(e.target.value);
            setAberto(true);
          }}
          onFocus={() => setAberto(true)}
          onBlur={() => setTimeout(() => setAberto(false), 150)}
          onKeyDown={(e) => {
            if (e.key === "ArrowDown") setAtivo((a) => Math.min(a + 1, lugares.length - 1));
            if (e.key === "ArrowUp") setAtivo((a) => Math.max(a - 1, 0));
            if (e.key === "Escape") setAberto(false);
          }}
        />
        {aberto && lugares.length > 0 && (
          <ul id={`${id}-lista`} role="listbox" className="sugestoes">
            {lugares.map((l, i) => (
              <li
                key={l.rotulo}
                id={`${id}-${i}`}
                role="option"
                aria-selected={i === ativo}
                onMouseDown={(e) => {
                  e.preventDefault();
                  escolher(l);
                }}
              >
                <span>{l.rotulo}</span>
                <span className="muted num">{l.n} imóve{l.n === 1 ? "l" : "is"}</span>
              </li>
            ))}
          </ul>
        )}
        {aberto && semResultado && (
          <div className="sugestoes vazio-sugestao">Nenhum imóvel em leilão encontrado com esse nome.</div>
        )}
      </div>
      <button type="submit" className="botao">Ver no mapa</button>
    </form>
  );
}
