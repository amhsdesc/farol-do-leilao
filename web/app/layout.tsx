import type { Metadata } from "next";
import Link from "next/link";
import { Simbolo } from "@/components/Logo";
import { Cadeado } from "@/components/busca/PainelFiltros";
import { acesso } from "@/lib/acesso";
import "maplibre-gl/dist/maplibre-gl.css";
import "./globals.css";

export const metadata: Metadata = {
  title: { default: "Farol do Leilão — Encontre. Faça a conta. Decida.", template: "%s · Farol do Leilão" },
  description: "Leilão de imóveis sem susto, para quem está começando: Caixa, bancos e leiloeiros oficiais numa busca só, com a conta feita antes do lance.",
};

export default async function Layout({ children }: { children: React.ReactNode }) {
  const { assinante, modoTeste } = await acesso();
  const trava = assinante ? null : <Cadeado tamanho={12} />;
  return (
    <html lang="pt-BR">
      <body>
        <header className="topo">
          <div className="topo-in">
            <Link href="/" className="marca" aria-label="Farol do Leilão, página inicial">
              <Simbolo tamanho={34} />
              farol <span>do leilão</span>
            </Link>
            <nav aria-label="Principal">
              <Link href="/">Buscar no mapa</Link>
              <Link href="/calculadora">Calculadora {trava}</Link>
              <Link href="/alertas">Meus alertas {trava}</Link>
              {!assinante && <Link href="/assinar">Planos</Link>}
            </nav>
            <div className="topo-acoes">
              {assinante ? (
                <span className="selo-assinante">Assinante</span>
              ) : (
                <Link href="/assinar" className="botao">Assinar</Link>
              )}
            </div>
          </div>
        </header>
        {children}
        <footer className="rodape">
          <span>Farol do Leilão · dados copiados das fontes oficiais; confira sempre o edital antes de dar lance.</span>
          <Link href="/fontes">Fontes e atualização</Link>
          {modoTeste && (
            <a className="teste" href={`/api/teste-assinante?ligar=${assinante ? 0 : 1}`}>
              Modo teste: {assinante ? "ver como visitante" : "ver como assinante"}
            </a>
          )}
        </footer>
      </body>
    </html>
  );
}
