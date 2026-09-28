import type { Metadata } from "next";
import Link from "next/link";
import { redirect } from "next/navigation";
import { signOut } from "@/auth";
import { acesso } from "@/lib/acesso";
import { celularLegivel, PLANOS, situacao, type PlanoId } from "@/lib/conta/regras";
import { cancelar, pagarAgora } from "../assinar/acoes";
import BotaoConfirmar from "./BotaoConfirmar";

export const metadata: Metadata = { title: "Minha conta" };
export const dynamic = "force-dynamic";

const data = (d: Date | string) => new Date(d).toLocaleDateString("pt-BR", { timeZone: "America/Sao_Paulo" });

export default async function Conta({ searchParams }: { searchParams: Promise<{ pago?: string; cancelada?: string }> }) {
  const { pago, cancelada } = await searchParams;
  const { usuario, assinatura: a } = await acesso();
  if (!usuario) redirect("/entrar?volta=/conta");
  const s = situacao(usuario, a);
  const plano = a?.plano ? PLANOS[a.plano as PlanoId] : null;

  return (
    <main className="pagina estreita conta">
      <h1 className="titulo-pagina">Minha conta</h1>
      {pago && <p className="aviso bom">Pagamento confirmado. Obrigado por assinar!</p>}
      {cancelada && <p className="aviso">Assinatura cancelada. Nada mais será cobrado.</p>}

      <section className="painel">
        <h2>Assinatura</h2>
        {s.tipo === "sem_celular" && (
          <p className="texto">Confirme seu celular para começar os 7 dias grátis. <Link href="/cadastro/celular?volta=/assinar">Confirmar agora</Link></p>
        )}
        {s.tipo === "pode_testar" && (
          <p className="texto">Você ainda não usou os 7 dias grátis. <Link href="/assinar">Começar agora</Link></p>
        )}
        {s.tipo === "em_teste" && (
          <p className="texto">
            Teste grátis até <b>{data(s.ate)}</b>.{" "}
            {plano ? <>Depois, plano {plano.nome.toLowerCase()} (a primeira cobrança vence nesse dia).</> : <Link href="/assinar">Escolher um plano</Link>}
          </p>
        )}
        {s.tipo === "ativa" && (
          <p className="texto">
            Plano {plano?.nome.toLowerCase()} · {s.cancelada ? <>cancelado, com acesso até <b>{data(s.ate)}</b></> : <>pago até <b>{data(s.ate)}</b>, renova sozinho</>}.
          </p>
        )}
        {s.tipo === "aguardando_pagamento" && <p className="texto">Falta concluir o pagamento do plano {plano?.nome.toLowerCase()}.</p>}
        {s.tipo === "vencida" && (
          <p className="texto">
            {a?.status === "atrasada" ? "Há uma cobrança em atraso." : "Seu acesso de assinante acabou."} <Link href="/assinar">Ver planos</Link>
          </p>
        )}

        <div className="acoes-conta">
          {a?.asaas_assinatura_id && ["aguardando_pagamento", "atrasada"].includes(a.status) && (
            <form action={pagarAgora}><button className="botao">Pagar agora</button></form>
          )}
          {a?.asaas_assinatura_id && a.status !== "cancelada" && (
            <BotaoConfirmar
              acao={cancelar}
              rotulo="Cancelar assinatura"
              pergunta={`Cancelar mesmo? Nada mais será cobrado${a.pago_ate ? ` e você continua com acesso até ${data(a.pago_ate)}` : ""}.`}
            />
          )}
          {(!a || a.status === "cancelada" || s.tipo === "em_teste") && s.tipo !== "pode_testar" && s.tipo !== "sem_celular" && !plano && (
            <Link className="botao" href="/assinar">Escolher plano</Link>
          )}
        </div>
      </section>

      <section className="painel">
        <h2>Seus dados</h2>
        <div className="dados">
          <div className="dado"><span>Nome</span><b>{usuario.name ?? "—"}</b></div>
          <div className="dado"><span>E-mail</span><b>{usuario.email ?? "—"}</b></div>
          <div className="dado">
            <span>WhatsApp</span>
            <b className="num">{usuario.telefone ? celularLegivel(usuario.telefone) : "não confirmado"}</b>
          </div>
        </div>
        <Link href="/cadastro/celular?trocar=1&volta=/conta" className="link">Trocar celular</Link>
      </section>

      <form
        action={async () => {
          "use server";
          await signOut({ redirectTo: "/" });
        }}
      >
        <button className="botao secundario">Sair</button>
      </form>
    </main>
  );
}
