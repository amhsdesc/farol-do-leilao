import type { Metadata } from "next";

export const metadata: Metadata = { title: "Privacidade" };

// RASCUNHO: revisar com advogado antes de publicar. Preencher [RAZÃO SOCIAL], [CNPJ] e [E-MAIL].
export default function Privacidade() {
  return (
    <main className="pagina estreita texto-legal">
      <h1 className="titulo-pagina">Política de privacidade</h1>
      <p className="muted">Última atualização: setembro de 2026</p>
      <p>
        Esta política explica, em linguagem simples, que dados pessoais o Farol do Leilão ([RAZÃO SOCIAL], CNPJ [CNPJ])
        trata e por quê, conforme a Lei Geral de Proteção de Dados (Lei 13.709/2018).
      </p>

      <h2>Que dados usamos</h2>
      <ul>
        <li><b>Da sua conta Google:</b> nome, e-mail e foto. Não temos acesso à sua senha.</li>
        <li><b>Celular:</b> para o código de confirmação e para os alertas que você pedir.</li>
        <li><b>Assinatura:</b> plano, datas e situação dos pagamentos. O CPF e os dados de pagamento vão direto para o Asaas; não guardamos seu CPF nem dados de cartão.</li>
        <li><b>Uso do site:</b> registros técnicos (endereço IP, páginas acessadas), para segurança e para melhorar o serviço.</li>
      </ul>
      <p>
        Sobre os imóveis, guardamos só dados do imóvel e do leilão. Não guardamos nomes ou documentos de antigos donos ou
        de pessoas citadas em processos.
      </p>

      <h2>Para que usamos</h2>
      <ul>
        <li>Criar e proteger sua conta, e garantir um teste grátis por pessoa (execução do contrato e prevenção a fraude).</li>
        <li>Cobrar a assinatura e emitir nota (execução do contrato e obrigação legal).</li>
        <li>Mandar os alertas de leilão que você configurar (execução do contrato).</li>
        <li>Avisos importantes sobre a conta. Propaganda só com o seu consentimento, e dá para sair a qualquer momento.</li>
      </ul>

      <h2>Com quem compartilhamos</h2>
      <ul>
        <li><b>Google:</b> login.</li>
        <li><b>Meta (WhatsApp):</b> envio do código e dos alertas.</li>
        <li><b>Asaas:</b> cobrança e nota fiscal.</li>
        <li><b>Hospedagem e banco de dados:</b> onde o site funciona.</li>
      </ul>
      <p>Não vendemos seus dados.</p>

      <h2>Por quanto tempo</h2>
      <p>
        Enquanto sua conta existir. Se você pedir a exclusão, apagamos em até 30 dias, menos o que a lei manda guardar
        (como registros de cobrança e de acesso, pelo prazo legal).
      </p>

      <h2>Seus direitos</h2>
      <p>
        Você pode pedir para ver, corrigir, levar para outro serviço ou apagar seus dados, e retirar consentimentos. Escreva
        para contato.faroldoleilao@gmail.com. Respondemos em até 15 dias.
      </p>
    </main>
  );
}
