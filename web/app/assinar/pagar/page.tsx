import type { Metadata } from "next";
import Link from "next/link";
import { redirect } from "next/navigation";
import { acesso } from "@/lib/acesso";
import { economia, PLANOS, porMes, type PlanoId } from "@/lib/conta/regras";
import FormPagar from "./FormPagar";

export const metadata: Metadata = { title: "Assinar" };
export const dynamic = "force-dynamic";

const centavos = (v: number) => v.toLocaleString("pt-BR", { style: "currency", currency: "BRL" });

export default async function Pagar({ searchParams }: { searchParams: Promise<{ plano?: string }> }) {
  const { plano: id } = await searchParams;
  const plano = PLANOS[id as PlanoId];
  if (!plano) redirect("/assinar");
  const { usuario, assinatura } = await acesso();
  const volta = `/assinar/pagar?plano=${plano.id}`;
  if (!usuario) redirect(`/entrar?volta=${encodeURIComponent(volta)}`);
  if (!usuario.telefone_validado_em) redirect(`/cadastro/celular?volta=${encodeURIComponent(volta)}`);
  const inicio = new Date(Math.max(Date.now(), +(assinatura?.teste_ate ? new Date(assinatura.teste_ate) : 0), +(assinatura?.pago_ate ? new Date(assinatura.pago_ate) : 0)));
  const hoje = inicio.getTime() - Date.now() < 86_400_000;

  return (
    <main className="pagina estreita">
      <section className="painel caixa-entrar">
        <Link href="/assinar" className="voltar">← Trocar de plano</Link>
        <span className="rotulo">Plano {plano.nome.toLowerCase()}</span>
        <h1 className="num">{centavos(plano.valor)} {plano.meses === 1 ? "por mês" : plano.meses === 12 ? "por ano" : `a cada ${plano.meses} meses`}</h1>
        <p className="texto">
          {plano.meses > 1 && <>Sai por {centavos(porMes(plano))} por mês, {Math.round(economia(plano) * 100)}% menos que o mensal. </>}
          {hoje ? "A primeira cobrança vence hoje." : `A primeira cobrança só vence em ${inicio.toLocaleDateString("pt-BR", { timeZone: "America/Sao_Paulo" })}, quando acaba o período que você já tem.`}
          {" "}Renova sozinho; cancele quando quiser.
        </p>
        <FormPagar plano={plano.id} nomeSugerido={usuario.name ?? ""} />
      </section>
    </main>
  );
}
