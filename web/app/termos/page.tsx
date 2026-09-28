import type { Metadata } from "next";

export const metadata: Metadata = { title: "Termos de uso" };

// RASCUNHO: revisar com advogado antes de publicar. Preencher [RAZÃO SOCIAL], [CNPJ], [E-MAIL] e [CIDADE].
export default function Termos() {
  return (
    <main className="pagina estreita texto-legal">
      <h1 className="titulo-pagina">Termos de uso</h1>
      <p className="muted">Última atualização: setembro de 2026</p>

      <h2>1. O que é o Farol do Leilão</h2>
      <p>
        O Farol do Leilão, mantido por [RAZÃO SOCIAL], CNPJ [CNPJ], reúne num só lugar informações públicas sobre imóveis
        em leilão e venda direta, copiadas dos sites da Caixa, de bancos, de órgãos públicos e de leiloeiros oficiais. Não
        somos leiloeiros, não vendemos imóveis e não participamos dos leilões.
      </p>

      <h2>2. As informações são das fontes</h2>
      <p>
        Mostramos o que as fontes publicam e indicamos de onde veio cada dado. As fontes podem errar ou mudar as
        condições a qualquer momento. <b>Quem vale é o edital do leilão.</b> Antes de dar um lance, leia o edital, tire a
        matrícula atualizada e, se precisar, procure um advogado.
      </p>

      <h2>3. Não é recomendação de investimento</h2>
      <p>
        Calculadoras, descontos e estimativas são ferramentas de apoio, feitas com parâmetros médios. Não garantem lucro
        nem substituem a análise de um profissional. A decisão de comprar é sempre sua.
      </p>

      <h2>4. Conta</h2>
      <p>
        Para usar os recursos de assinante você entra com sua conta Google e confirma seu celular por um código no
        WhatsApp. A conta é pessoal. Um celular só pode estar ligado a uma conta.
      </p>

      <h2>5. Teste grátis, assinatura e cancelamento</h2>
      <ul>
        <li>O teste grátis de 7 dias vale uma vez por pessoa e por celular, e não pede cartão.</li>
        <li>Os planos mensal, trimestral e anual renovam sozinhos no fim de cada período, pelo valor da página de planos.</li>
        <li>A cobrança é feita pelo Asaas, por Pix, boleto ou cartão. Não guardamos dados do seu cartão.</li>
        <li>Você pode cancelar quando quiser em Minha conta. O acesso continua até o fim do período já pago.</li>
        <li>
          Pelo Código de Defesa do Consumidor (art. 49), você pode desistir em até 7 dias depois do primeiro pagamento e
          receber o valor de volta: escreva para [E-MAIL].
        </li>
        <li>Se um pagamento atrasar mais de 3 dias, os recursos de assinante ficam travados até a regularização.</li>
      </ul>

      <h2>6. Uso permitido</h2>
      <p>
        O conteúdo é para seu uso pessoal. Não é permitido copiar a base em massa, usar robôs para extrair dados,
        revender o acesso ou compartilhar a conta.
      </p>

      <h2>7. Responsabilidade</h2>
      <p>
        Fazemos o possível para manter o site no ar e os dados atualizados, mas não respondemos por prejuízos causados por
        informações erradas das fontes, por mudanças nos leilões ou por decisões de compra.
      </p>

      <h2>8. Mudanças e contato</h2>
      <p>
        Podemos atualizar estes termos; avisaremos os assinantes por e-mail antes de mudanças importantes. Dúvidas:
        [E-MAIL]. Fica eleito o foro de [CIDADE], sem prejuízo do foro do domicílio do consumidor.
      </p>
    </main>
  );
}
