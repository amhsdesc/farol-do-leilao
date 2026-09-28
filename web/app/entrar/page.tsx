import type { Metadata } from "next";
import Link from "next/link";
import { redirect } from "next/navigation";
import { googleConfigurado, modoTeste, signIn } from "@/auth";
import { acesso, caminhoVolta } from "@/lib/acesso";

export const metadata: Metadata = { title: "Entrar" };
export const dynamic = "force-dynamic";

const ERROS: Record<string, string> = {
  OAuthAccountNotLinked: "Este e-mail já tem conta por outro caminho de login.",
  AccessDenied: "O acesso foi negado. Tente de novo.",
  CredentialsSignin: "E-mail inválido.",
};

export default async function Entrar({ searchParams }: { searchParams: Promise<{ volta?: string; error?: string }> }) {
  const { volta, error } = await searchParams;
  const destino = caminhoVolta(volta, "/assinar");
  const { usuario } = await acesso();
  if (usuario) redirect(usuario.telefone_validado_em ? destino : `/cadastro/celular?volta=${encodeURIComponent(destino)}`);
  // depois do Google, passa pela validação do celular (a página do celular devolve para o destino)
  const depois = `/cadastro/celular?volta=${encodeURIComponent(destino)}`;

  return (
    <main className="pagina estreita">
      <section className="painel caixa-entrar">
        <span className="rotulo">Entrar ou criar conta</span>
        <h1>Bem-vindo ao Farol do Leilão</h1>
        <p className="texto">
          Use sua conta Google. Depois, confirmamos seu celular com um código pelo WhatsApp: é por lá que chegam os
          alertas dos leilões.
        </p>
        {error && <p className="aviso">{ERROS[error] ?? "Não deu certo entrar. Tente de novo."}</p>}

        {googleConfigurado ? (
          <form
            action={async () => {
              "use server";
              await signIn("google", { redirectTo: depois });
            }}
          >
            <button className="botao botao-google" type="submit">
              <svg width="18" height="18" viewBox="0 0 48 48" aria-hidden="true">
                <path fill="#FFC107" d="M43.6 20.5H42V20H24v8h11.3C33.7 32.7 29.2 36 24 36c-6.6 0-12-5.4-12-12s5.4-12 12-12c3.1 0 5.8 1.2 7.9 3.1l5.7-5.7C34 6.1 29.3 4 24 4 12.9 4 4 12.9 4 24s8.9 20 20 20 20-8.9 20-20c0-1.3-.1-2.4-.4-3.5z" />
                <path fill="#FF3D00" d="m6.3 14.7 6.6 4.8C14.7 15.1 19 12 24 12c3.1 0 5.8 1.2 7.9 3.1l5.7-5.7C34 6.1 29.3 4 24 4 16.3 4 9.7 8.3 6.3 14.7z" />
                <path fill="#4CAF50" d="M24 44c5.2 0 9.9-2 13.4-5.2l-6.2-5.2C29.2 35.1 26.7 36 24 36c-5.2 0-9.6-3.3-11.3-8l-6.5 5C9.5 39.6 16.2 44 24 44z" />
                <path fill="#1976D2" d="M43.6 20.5H42V20H24v8h11.3c-.8 2.2-2.2 4.2-4.1 5.6l6.2 5.2C37 39.2 44 34 44 24c0-1.3-.1-2.4-.4-3.5z" />
              </svg>
              Continuar com Google
            </button>
          </form>
        ) : (
          <p className="aviso">O login com Google ainda não foi configurado neste site (falta AUTH_GOOGLE_ID).</p>
        )}

        {modoTeste && (
          <form
            className="form-teste"
            action={async (fd: FormData) => {
              "use server";
              await signIn("teste", { email: String(fd.get("email") ?? ""), redirectTo: depois });
            }}
          >
            <b>Modo teste</b>
            <span className="muted">Entra sem Google, só com um e-mail qualquer. Não existe no site publicado.</span>
            <label className="campo">
              <span>E-mail de teste</span>
              <input name="email" type="email" required placeholder="teste@exemplo.com" />
            </label>
            <button className="botao secundario" type="submit">Entrar como teste</button>
          </form>
        )}

        <p className="muted nota">
          Ao continuar, você concorda com os <Link href="/termos">Termos de uso</Link> e a{" "}
          <Link href="/privacidade">Política de privacidade</Link>.
        </p>
      </section>
    </main>
  );
}
