"""Leitor da página de detalhe de um imóvel da Caixa, por regra fixa (sem IA).

A lista oficial (CSV) não traz FGTS, financiamento, quem paga condomínio e tributos, datas das praças,
leiloeiro nem matrícula. Esses dados estão no HTML de `detalhe-imovel.asp`, em blocos de texto com rótulos fixos:

    Leilão SFI / Edital: 0046/0226 - CPA/RE / Leiloeiro(a): Fulana de Tal
    Data do 1º Leilão - 05/10/2026 - 10h00
    FORMAS DE PAGAMENTO ACEITAS:
        Recursos próprios.
        Permite utilização de FGTS. Consulte condições e enquadramento.
    REGRAS PARA PAGAMENTO DAS DESPESAS (caso existam):
        Condomínio: Sob responsabilidade do comprador.
        Tributos: Sob responsabilidade do comprador.

Regra do projeto: só afirma o que a página afirma. Texto que não reconhece vira `None` (= "não informado"),
nunca um palpite. Em especial, FGTS/financiamento/parcelamento só viram `False` quando a página nega de forma
explícita; a ausência do item na lista de formas de pagamento NÃO é tratada como "não aceita".
"""
from __future__ import annotations

import re
from typing import Any

from bs4 import BeautifulSoup

from ..normalizar import ocupacao as _ocupacao
from ..normalizar import simplificar

MOEDA = r"r\$\s*([\d.]+,\d{2})"  # usada sobre texto já simplificado (minúsculas)


def _linhas(html: str) -> list[str]:
    soup = BeautifulSoup(html, "lxml")
    for tag in soup(["script", "style", "noscript"]):
        tag.decompose()
    texto = soup.get_text("\n")
    return [re.sub(r"\s+", " ", l).strip() for l in texto.splitlines() if l.strip()]


def _bloco(linhas: list[str], simples: list[str], inicio: str, fins: tuple[str, ...]) -> list[str]:
    """Linhas depois do rótulo `inicio` e antes do próximo rótulo conhecido (comparação sem acento/maiúscula)."""
    for i, s in enumerate(simples):
        if s.startswith(inicio):
            resto = linhas[i][len(inicio):].strip(" :") if len(linhas[i]) > len(inicio) else ""
            saida = [resto] if resto else []
            for j in range(i + 1, len(linhas)):
                if any(simples[j].startswith(f) for f in fins):
                    break
                saida.append(linhas[j])
            return saida
    return []


def _valor(linhas: list[str], simples: list[str], rotulo: str) -> str | None:
    """Valor de uma linha 'Rótulo: valor' (ou valor na linha seguinte)."""
    for i, s in enumerate(simples):
        if s.startswith(rotulo):
            v = linhas[i].split(":", 1)[1].strip() if ":" in linhas[i] else ""
            if not v and i + 1 < len(linhas):
                v = linhas[i + 1].strip()
            return v or None
    return None


def _item(texto_simples: str, aceita: str, nega: str) -> bool | None:
    """True/False só quando há afirmação ou negação explícita; None quando o item não é mencionado."""
    if re.search(nega, texto_simples):
        return False
    if re.search(aceita, texto_simples):
        return True
    return None


def _responsavel(texto: str | None) -> str | None:
    """'comprador' | 'vendedor' | None para uma linha de despesa (Condomínio / Tributos)."""
    t = simplificar(texto)
    if not t:
        return None
    if re.search(r"comprador|arrematante|adquirente", t):
        # "CAIXA ... limitado a X%, excedente do comprador": o excedente é do comprador, então é o caso cauteloso
        return "comprador"
    if re.search(r"caixa|vendedor|comitente|credor", t):
        return "vendedor"
    return None


def ler_detalhe(html: str) -> dict[str, Any]:
    """Extrai da página de detalhe o que ela afirma. Chaves ausentes = a página não disse."""
    linhas = _linhas(html)
    simples = [simplificar(l) for l in linhas]
    todo = " ".join(simples)
    saida: dict[str, Any] = {}

    # --- formas de pagamento
    formas = _bloco(
        linhas, simples, "formas de pagamento aceitas",
        ("regras para pagamento", "baixar", "descricao", "endereco", "leilao sfi", "edital:"),
    )
    if formas:
        saida["formas_pagamento"] = [f.strip(" .") for f in formas if f.strip(" .")][:8]
        t = simplificar(" . ".join(formas))  # " . " separa os itens: uma negação não vaza para o item seguinte
        fgts = _item(t, r"(?:permite|aceita|admite)[^.]{0,30}fgts", r"(?:nao|vedad[oa])[^.]{0,30}(?:permite|aceita|admite|utilizacao)[^.]{0,30}fgts|fgts[^.]{0,20}(?:nao (?:e )?(?:permitid|aceit)|vedad)")
        fin = _item(t, r"(?:permite|aceita|admite)[^.]{0,30}financiamento", r"(?:nao|vedad[oa])[^.]{0,30}(?:permite|aceita|admite)[^.]{0,30}financiamento|financiamento[^.]{0,20}(?:nao (?:e )?(?:permitid|aceit)|vedad)")
        par = _item(t, r"(?:permite|aceita|admite)[^.]{0,30}parcelamento", r"(?:nao|vedad[oa])[^.]{0,30}(?:permite|aceita|admite)[^.]{0,30}parcelamento|parcelamento[^.]{0,20}(?:nao (?:e )?(?:permitid|aceit)|vedad)")
        for campo, v in (("aceita_fgts", fgts), ("aceita_financiamento", fin), ("aceita_parcelamento", par)):
            if v is not None:
                saida[campo] = v

    # --- despesas (condomínio e tributos)
    despesas = _bloco(
        linhas, simples, "regras para pagamento das despesas",
        ("baixar", "descricao", "endereco", "formas de pagamento", "leilao sfi", "edital:", "valor de avaliacao"),
    )
    cond = trib = None
    for l in despesas:
        s = simplificar(l)
        if s.startswith("condominio"):
            cond = l.split(":", 1)[1].strip() if ":" in l else l
        elif s.startswith("tributos") or s.startswith("iptu"):
            trib = l.split(":", 1)[1].strip() if ":" in l else l
    if cond:
        saida["condominio"] = cond[:300]
    if trib:
        saida["tributos"] = trib[:300]
    resp = [r for r in (_responsavel(cond), _responsavel(trib)) if r]
    if resp:
        # basta uma despesa com o comprador para o aviso ser "comprador" (mesmo critério cauteloso de normalizar.debitos_por_conta)
        saida["debitos_por_conta"] = "arrematante" if "comprador" in resp else "vendedor"

    # --- leilão: edital, leiloeiro e praças
    edital = _valor(linhas, simples, "edital")
    if edital and re.search(r"\d", edital):
        saida["edital_numero"] = edital[:80]
    item = _valor(linhas, simples, "numero do item")
    if item:
        saida["numero_item"] = item[:20]
    leiloeiro = _valor(linhas, simples, "leiloeiro")
    if leiloeiro and len(leiloeiro) > 3:
        saida["leiloeiro"] = leiloeiro[:120]
    for n in ("1", "2"):
        m = re.search(
            rf"data do {n}[ºo°]? leilao\s*-?\s*(\d{{1,2}}/\d{{1,2}}/\d{{4}})(?:\s*-?\s*(\d{{1,2}})h(\d{{2}})?)?", todo
        )
        if m:
            hora = f" {int(m.group(2)):02d}:{int(m.group(3) or 0):02d}" if m.group(2) else ""
            saida[f"data_praca{n}"] = m.group(1) + hora
        v = re.search(rf"valor minimo de venda {n}[ºo°]? leilao\s*:?\s*{MOEDA}", todo)
        if v:
            saida[f"valor_praca{n}"] = v.group(1)

    # --- cadastro do imóvel
    mat = _valor(linhas, simples, "matricula")
    if mat:
        digitos = re.sub(r"\D", "", mat)
        if digitos:
            saida["matricula"] = digitos[:30]
    oficio = _valor(linhas, simples, "oficio")
    comarca = _valor(linhas, simples, "comarca")
    if comarca:
        saida["comarca"] = comarca[:80]
        num = re.sub(r"\D", "", oficio or "")
        if num:
            saida["cartorio"] = f"{int(num)}º Ofício de {comarca.strip()}"[:120]
    insc = _valor(linhas, simples, "inscricao imobiliaria")
    if insc:
        saida["inscricao_imobiliaria"] = insc[:40]
    averb = _valor(linhas, simples, "averbacao dos leiloes negativos")
    if averb:
        saida["averbacao_leiloes_negativos"] = averb[:80]

    # --- ocupação: só do texto de descrição do imóvel, que é onde a Caixa a menciona quando a menciona
    descricao = _bloco(
        linhas, simples, "descricao",
        ("formas de pagamento", "regras para pagamento", "baixar", "endereco", "valor de avaliacao"),
    )
    if descricao:
        oc = _ocupacao(" ".join(descricao))
        if oc != "nao_informado":
            saida["ocupacao"] = oc
    return saida
