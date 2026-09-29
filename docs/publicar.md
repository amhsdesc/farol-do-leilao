# Publicar o site (Vercel + Neon + GitHub Actions)

Caminho escolhido para colocar o Farol do Leilão no ar sem custo de servidor: o site roda na **Vercel** (grátis
pro tamanho do projeto agora), o banco fica na **Neon** (Postgres com PostGIS, tem plano grátis) e a coleta +
os alertas rodam sozinhos nos horários certos pelo **GitHub Actions** (grátis também, dentro do limite de minutos
do plano). Sem servidor pra administrar.

Faça nesta ordem — cada passo depende do anterior.

## 1. Banco de dados (Neon)

1. Crie a conta em https://neon.tech (pode entrar com o GitHub).
2. Crie um projeto novo, região `South America (São Paulo)` se aparecer (senão, a mais perto disso).
3. No painel do projeto, abra o **SQL Editor** e rode:
   ```sql
   create extension if not exists postgis;
   create extension if not exists unaccent;
   create extension if not exists pg_trgm;
   ```
   (as migrações também tentam criar essas extensões sozinhas, mas a Neon às vezes pede que seja feito
   pelo usuário `owner` do jeito acima — se der erro de permissão nas migrações, é porque faltou este passo.)
4. Em **Connection string**, copie a URL (formato `postgresql://usuario:senha@ep-xxxx.sa-east-1.aws.neon.tech/neondb?sslmode=require`).
   Essa é a sua `DATABASE_URL` — guarde, ela entra em três lugares: seu computador (`.env`), a Vercel e os
   segredos do GitHub Actions.
5. No seu computador, com essa URL, rode as migrações uma vez pra criar as tabelas:
   ```
   cd coletor
   DATABASE_URL="a-url-que-voce-copiou" python -m coletor migrar
   ```

## 2. Repositório no GitHub

1. Crie a conta em https://github.com se ainda não tiver.
2. Crie um repositório novo, **privado** (o código tem a estrutura de tabelas e lógica de cobrança — não
   precisa ser público), nome sugerido `farol-do-leilao`.
3. No seu computador, dentro da pasta do projeto:
   ```
   git remote add origin https://github.com/SEU-USUARIO/farol-do-leilao.git
   git push -u origin master
   ```
4. Em **Settings → Secrets and variables → Actions** desse repositório, cadastre (aba **Secrets**, são
   informações sensíveis):
   - `DATABASE_URL` — a mesma URL da Neon
   - `ANTHROPIC_API_KEY` — a chave da Fase 2 (cauda longa de leiloeiros)
   - `RESEND_API_KEY`, `WHATSAPP_TOKEN`, `WHATSAPP_PHONE_NUMBER_ID` — quando você criar essas contas (o
     workflow de notificações roda sem problema antes disso, só não manda nada de verdade ainda)

   E na aba **Variables** (não são segredo, só configuração):
   - `CONTATO_EMAIL` — o e-mail do site
   - `SITE_URL` — `https://faroldoleilao.com.br` (ou o domínio que você registrar)
   - `RESEND_REMETENTE` — ex. `Farol do Leilão <avisos@faroldoleilao.com.br>`
   - `WHATSAPP_MODELO_ALERTA` — `alerta_leilao`

   Os workflows já estão no repositório (`.github/workflows/coletar.yml` e `notificacoes.yml`) — assim que os
   segredos existirem, eles passam a rodar sozinhos nos horários definidos ali (coleta a cada 6h, notificações
   a cada 20 min). Dá pra testar na hora sem esperar o horário: aba **Actions** do repositório → escolha o
   workflow → **Run workflow**.

## 3. Site (Vercel)

1. Crie a conta em https://vercel.com entrando com o GitHub (facilita a próxima etapa).
2. **Add New → Project**, escolha o repositório `farol-do-leilao`.
3. Em **Root Directory**, clique em *Edit* e escolha `web` (o projeto Next.js fica dentro dessa pasta, não na
   raiz do repositório).
4. Em **Environment Variables**, cadastre as mesmas chaves de `web/.env.local` que valem para o site publicado
   (não repita as só-de-coleta como `ANTHROPIC_API_KEY` do coletor — essa fica só nos secrets do Actions,
   a não ser que você também use o botão "Pesquisar valor de mercado" da calculadora, que pede a mesma chave
   aqui no site):
   - `DATABASE_URL` (a da Neon)
   - `AUTH_SECRET` (gere com `npx auth secret` no seu computador, dentro de `web/`)
   - `AUTH_GOOGLE_ID`, `AUTH_GOOGLE_SECRET`
   - `WHATSAPP_TOKEN`, `WHATSAPP_PHONE_NUMBER_ID`, `WHATSAPP_MODELO_CODIGO`, `WHATSAPP_MODELO_ALERTA`
   - `ASAAS_API_KEY`, `ASAAS_AMBIENTE`, `ASAAS_WEBHOOK_TOKEN`
   - `RESEND_API_KEY`, `RESEND_REMETENTE`
   - `SITE_URL` — a URL final do site (`https://faroldoleilao.com.br`)
   - **Nunca** `FAROL_MODO_TESTE` — isso é só para o seu computador.
5. Clique em **Deploy**. A Vercel builda e publica; você recebe uma URL tipo `farol-do-leilao.vercel.app`
   pra conferir antes de ligar o domínio de verdade.

## 4. Domínio

1. Depois de comprar `faroldoleilao.com.br` no registro.br (Fase 1 do documento de pendências), vá em
   **Vercel → seu projeto → Settings → Domains** e adicione o domínio.
2. A Vercel mostra os registros DNS pra você cadastrar no registro.br (geralmente um `A` ou `CNAME` apontando
   pra Vercel). Depois de propagar (minutos a poucas horas), o site responde em `https://faroldoleilao.com.br`.
3. Atualize `SITE_URL` na Vercel e nas variáveis do GitHub Actions pra esse domínio final, e os redirecionamentos
   do Google/Asaas/Meta que pedem a URL do site (docs/configurar-contas.md).

## Checklist de verificação depois de publicar

- [ ] `https://SEU-DOMINIO` abre e mostra o mapa
- [ ] Login com Google funciona (sem `FAROL_MODO_TESTE`)
- [ ] Código de validação chega de verdade no WhatsApp
- [ ] Assinatura de teste no Asaas sandbox completa e libera os recursos de assinante
- [ ] Aba Actions do GitHub: os dois workflows aparecem rodando (verde) nos horários certos
- [ ] `python -m coletor status` (do seu computador, apontando pra `DATABASE_URL` da Neon) mostra imóveis
- [ ] Um alerta de teste chega por e-mail e WhatsApp

## Se algo der errado

- **Migração falha na Neon com erro de permissão em `create extension`** → rode as três linhas do passo 1.3
  direto no SQL Editor da Neon (ali você é owner de verdade).
- **Build falha na Vercel** → confira se `Root Directory` está em `web` e se `DATABASE_URL` está cadastrada
  (o build roda `next build`, que não bate no banco, mas o `npm install` precisa rodar limpo).
- **Workflow do GitHub falha** → aba Actions → clique na execução vermelha → o log mostra a linha exata;
  na maioria das vezes é segredo faltando ou digitado errado.
