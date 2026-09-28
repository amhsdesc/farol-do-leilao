import type { Metadata } from "next";
import { redirect } from "next/navigation";
import { acesso, caminhoVolta } from "@/lib/acesso";
import { celularLegivel } from "@/lib/conta/regras";
import FormCelular from "./FormCelular";

export const metadata: Metadata = { title: "Confirmar celular" };
export const dynamic = "force-dynamic";

export default async function Celular({ searchParams }: { searchParams: Promise<{ volta?: string; trocar?: string }> }) {
  const { volta: v, trocar } = await searchParams;
  const volta = caminhoVolta(v, "/assinar");
  const { usuario } = await acesso();
  if (!usuario) redirect(`/entrar?volta=${encodeURIComponent(volta)}`);
  if (usuario.telefone_validado_em && !trocar) redirect(volta);

  return (
    <main className="pagina estreita">
      <section className="painel caixa-entrar">
        <span className="rotulo">Passo 2 de 2</span>
        <h1>Confirme seu celular</h1>
        <p className="texto">
          É por WhatsApp que avisamos antes de cada leilão que você acompanha. Confirmar o número também garante um
          teste grátis por pessoa.
        </p>
        {usuario.telefone && trocar && (
          <p className="muted">Celular atual: <b className="num">{celularLegivel(usuario.telefone)}</b></p>
        )}
        <FormCelular volta={volta} />
        <p className="muted nota">Usamos seu número só para códigos e para os alertas que você pedir. Nada de propaganda.</p>
      </section>
    </main>
  );
}
