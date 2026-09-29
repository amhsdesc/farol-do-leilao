# Configurar as contas de verdade (Google, WhatsApp, Asaas)

Enquanto isso não é feito, use `FAROL_MODO_TESTE=permitir` no seu computador. Cada passo abaixo gera chaves que
vão no arquivo `web/.env.local` (no seu computador) e nas variáveis do servidor quando o site for publicado.
**Nunca mande essas chaves por e-mail ou chat, nem as coloque no Git.**

Antes de tudo: `AUTH_SECRET`. Na pasta `web`, rode `npx auth secret` e ele grava um segredo no `.env.local`.

## 1. Login com Google (grátis)

1. Entre em https://console.cloud.google.com e crie um projeto chamado "Farol do Leilão".
2. Menu **APIs e serviços → Tela de permissão OAuth**: tipo *Externo*; nome do app "Farol do Leilão"; seu e-mail de
   suporte; em *Domínios autorizados* ponha o domínio do site (ex.: faroldoleilao.com.br); links para
   `/privacidade` e `/termos`. Escopos: só os básicos (email, profile, openid).
3. Menu **Credenciais → Criar credenciais → ID do cliente OAuth** → *Aplicativo da Web*.
   - Origens JavaScript autorizadas: `http://localhost:3000` e `https://SEU-DOMINIO`
   - URIs de redirecionamento: `http://localhost:3000/api/auth/callback/google` e
     `https://SEU-DOMINIO/api/auth/callback/google`
4. Copie o **ID do cliente** para `AUTH_GOOGLE_ID` e a **Chave secreta** para `AUTH_GOOGLE_SECRET`.
5. Enquanto o app estiver "em teste" no Google, só os e-mails que você cadastrar como testadores conseguem entrar.
   Para abrir ao público, clique em *Publicar aplicativo* (com só email/profile, não precisa de análise demorada).

## 2. Código pelo WhatsApp (cerca de R$ 0,035 por código)

1. Crie um Portfólio Empresarial em https://business.facebook.com (precisa de um número de celular que **não** esteja
   em uso no WhatsApp comum — um chip novo serve).
2. Em https://developers.facebook.com crie um app do tipo *Empresa* e adicione o produto **WhatsApp**.
3. Em *WhatsApp → Configuração da API*, cadastre o número do Farol e anote o **Phone number ID** →
   `WHATSAPP_PHONE_NUMBER_ID`.
4. Crie um **usuário do sistema** no Portfólio (Configurações → Usuários do sistema), dê acesso ao app e ao número, e
   gere um token permanente com as permissões `whatsapp_business_messaging` e `whatsapp_business_management` →
   `WHATSAPP_TOKEN`.
5. Em *Gerenciador do WhatsApp → Modelos de mensagem*, crie um modelo da categoria **Autenticação**, idioma
   **Português (BR)**, nome `codigo_verificacao`, com o botão **Copiar código**. A Meta aprova em minutos.
6. Cadastre uma forma de pagamento no Portfólio (a Meta cobra por mensagem).
7. Verifique o Portfólio (documento da empresa ou MEI) para subir o limite de envios.

## 3. Cobrança pelo Asaas

1. Crie a conta em https://www.asaas.com (pessoa física ou MEI — confira o que eles pedem na hora).
2. Para testar sem dinheiro de verdade, crie também uma conta **sandbox** em https://sandbox.asaas.com.
3. Em *Integrações → Chave de API*, gere a chave → `ASAAS_API_KEY` (a do sandbox com `ASAAS_AMBIENTE=sandbox`;
   a de produção com `ASAAS_AMBIENTE=producao`).
4. Em *Integrações → Webhooks*, crie um webhook:
   - URL: `https://SEU-DOMINIO/api/asaas/webhook`
   - Token de autenticação: invente um texto longo e aleatório e ponha o mesmo em `ASAAS_WEBHOOK_TOKEN`
   - Eventos: todos de **Cobranças** e de **Assinaturas**
   - Versão da API: v3; tipo de envio: sequencial
5. Em *Minha conta → Notas fiscais*, configure a emissão automática se você tiver CNPJ.

Depois de colar as chaves, reinicie o site e faça um teste completo no sandbox: entrar, confirmar celular, assinar,
pagar com o Pix de teste do Asaas e ver a assinatura ativa em Minha conta.

## 4. Avisos de alerta (e-mail pela Resend e WhatsApp)

Os alertas (mudança de preço/data, suspensão, indisponibilidade e lembretes antes do leilão) são detectados pelo
coletor e mandados por um script separado — `npm run notificacoes` — que você agenda para rodar a cada 15-30
minutos (o mesmo cron que já roda `python -m coletor coletar --todas`). Sem as chaves abaixo, o alerta continua
sendo criado e a mudança detectada normalmente; só o envio de verdade fica pendente (rodar o script sem chave não
manda nada e não dá erro).

**E-mail (Resend, plano grátis cobre o começo):**
1. Crie a conta em https://resend.com.
2. Em *Domains*, adicione e verifique o domínio do site (registros DNS que a Resend mostra na hora).
3. Em *API Keys*, crie uma chave → `RESEND_API_KEY`.
4. Em `RESEND_REMETENTE`, ponha um endereço desse domínio, ex. `Farol do Leilão <avisos@SEU-DOMINIO>`.

**WhatsApp (reaproveita o número já configurado no passo 2):**
1. Em *Gerenciador do WhatsApp → Modelos de mensagem*, crie um segundo modelo, categoria **Utilidade**, idioma
   **Português (BR)**, nome `alerta_leilao`, corpo com uma variável de texto (`{{1}}`) — é nela que entra a
   mensagem do alerta. A Meta aprova em minutos (utilidade é mais rápido que marketing).
2. Se usar outro nome de modelo, ajuste `WHATSAPP_MODELO_ALERTA`.

Ponha também `SITE_URL=https://SEU-DOMINIO` (sem isso o link nos avisos aponta para localhost).
