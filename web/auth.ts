import PostgresAdapter from "@auth/pg-adapter";
import NextAuth from "next-auth";
import Credentials from "next-auth/providers/credentials";
import Google from "next-auth/providers/google";
import { pool } from "@/lib/db";

// Login com Google. Variáveis: AUTH_SECRET, AUTH_GOOGLE_ID, AUTH_GOOGLE_SECRET (ver docs/configurar-contas.md).
// FAROL_MODO_TESTE=permitir liga um login de teste por e-mail, sem senha — SÓ no seu computador.
export const modoTeste = process.env.FAROL_MODO_TESTE === "permitir";
export const googleConfigurado = Boolean(process.env.AUTH_GOOGLE_ID && process.env.AUTH_GOOGLE_SECRET);

export const { handlers, auth, signIn, signOut } = NextAuth({
  adapter: PostgresAdapter(pool),
  // sessão em cookie assinado; usuário e vínculo com o Google ficam no banco
  session: { strategy: "jwt", maxAge: 60 * 60 * 24 * 30 },
  trustHost: true,
  pages: { signIn: "/entrar", error: "/entrar" },
  providers: [
    ...(googleConfigurado ? [Google] : []),
    ...(modoTeste
      ? [
          Credentials({
            id: "teste",
            name: "Teste",
            credentials: { email: { label: "E-mail" } },
            async authorize(c) {
              const email = String(c?.email ?? "").trim().toLowerCase();
              if (!/^[^@\s]+@[^@\s]+\.[^@\s]+$/.test(email)) return null;
              const r = await pool.query(
                `insert into users (name, email) values ($1, $2)
                 on conflict ((lower(email))) do update set email = excluded.email
                 returning id, name, email`,
                [email.split("@")[0], email],
              );
              const u = r.rows[0];
              return { id: String(u.id), name: u.name, email: u.email };
            },
          }),
        ]
      : []),
  ],
  callbacks: {
    jwt({ token, user }) {
      if (user?.id) token.sub = String(user.id);
      return token;
    },
    session({ session, token }) {
      if (token.sub && session.user) session.user.id = token.sub;
      return session;
    },
  },
});
