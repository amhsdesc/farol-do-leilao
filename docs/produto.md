# Produto: o que é livre e o que é de assinante

Decisão do Desc (set/2026). A busca é o centro da página inicial.

| Recurso | Visitante | Assinante |
|---|---|---|
| Busca no mapa (Brasil inteiro, mover, aproximar, "cidade ou bairro") | ✓ | ✓ |
| Lista dos imóveis da área visível do mapa | ✓ | ✓ |
| Balão do imóvel no mapa e ficha do imóvel (detalhes, fontes, histórico) | ✓ | ✓ |
| Ir ao site do leiloeiro e abrir o edital (redirecionamento `/ir/<lote>`) | travado | ✓ |
| Filtros (todos) e ordenação | travado | ✓ |
| Calculadora (página própria `/calculadora`) | travado | ✓ |
| Alertas de leilão (e-mail, WhatsApp, Telegram) | travado | ✓ |
| Buscas salvas | travado | ✓ |

## Filtros de assinante

- **Onde:** estado, cidade, distância até N km do centro do mapa.
- **Quem vende:** banco ou vendedor (comitente), modalidade (judicial, extrajudicial, venda direta, licitação), leiloeiro.
- **Quanto:** lance de/até, desconto mínimo sobre a avaliação, preço por m² até.
- **Como pagar:** aceita FGTS, financiamento, parcelamento.
- **Quando:** leilão nos próximos 7/15/30/60 dias, só 2ª praça, novos nesta semana.
- **O imóvel:** tipo, quartos, vagas, área.
- **Menos risco:** só desocupados, dívidas com o vendedor, preço caiu nos últimos 30 dias, anunciado em mais de um site, com fotos.

Regra de dados: ocupação, dívidas e parcelamento só são afirmados quando a fonte afirma (`nao_informado` / `null` caso contrário).
Os filtros "só desocupados" e "dívidas com o vendedor" mostram só o que a fonte confirmou.

## Alertas (a construir)

Canais: e-mail, WhatsApp, Telegram (a pessoa escolhe um ou mais).
Momentos: 7 dias antes, 1 dia antes, 1 hora antes, mudança de data/preço/edital, suspensão ou cancelamento, resultado.

## Como a trava funciona

- `web/lib/acesso.ts` diz se a pessoa é assinante: logada (Google) e com teste grátis ou pagamento em dia
  (regras em `web/lib/conta/regras.ts`: 7 dias de teste, 3 dias de tolerância depois do vencimento).
- `aplicarAcesso()` tira da consulta todo filtro de assinante enviado por visitante; as APIs devolvem `bloqueados`.
- O endereço do site do leiloeiro e do edital nunca vai para a página nem para a API: o botão aponta para
  `/ir/<lote>`, que confere a assinatura e só então redireciona. Visitante cai em `/assinar`.
- Teste local: `FAROL_MODO_TESTE=permitir` em `web/.env.local` (login por e-mail, código na tela, pagamento simulado).

## Cadastro e assinatura

1. Entrar com Google → 2. confirmar celular com código de 6 números pelo WhatsApp → 3. 7 dias grátis, sem cartão
(uma vez por conta e por celular) → 4. plano mensal R$ 44,90, trimestral R$ 109,90 ou anual R$ 399,90, pago na
página do Asaas (Pix, boleto ou cartão). Assinando durante o teste, a 1ª cobrança vence no fim do teste.
Cancelamento em Minha conta; acesso segue até o fim do período pago. O webhook do Asaas (`/api/asaas/webhook`)
atualiza o `pago_ate`; cada aviso fica guardado em `evento_pagamento`.
