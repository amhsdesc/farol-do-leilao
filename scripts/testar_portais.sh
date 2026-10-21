#!/usr/bin/env bash
# Teste avulso: os portais de anúncios deixam um robô ler a página de lista a partir do GitHub Actions?
# Faz UMA requisição por portal (e espera 10 s entre elas, o Crawl-delay do ZAP e do Viva Real), com o nome do nosso
# robô. Não guarda nada: só imprime status, tamanho e o que há na página. Não usa banco, nem IA.
# PORTAIS="nome|url nome|url" substitui a lista (usado nos testes locais).
set -u
UA="FarolDoLeilaoBot/1.0 (+https://faroldoleilao.com.br)"
PAUSA="${PAUSA:-10}"
PORTAIS="${PORTAIS:-zap|https://www.zapimoveis.com.br/venda/apartamentos/df+brasilia/
vivareal|https://www.vivareal.com.br/venda/distrito-federal/brasilia/apartamento_residencial/
imovelweb|https://www.imovelweb.com.br/apartamentos-venda-brasilia-df.html
quintoandar|https://www.quintoandar.com.br/comprar/imovel/brasilia-df-brasil}"

primeiro=1
while IFS='|' read -r nome url; do
  [ -z "$nome" ] && continue
  [ "$primeiro" = 1 ] || sleep "$PAUSA"
  primeiro=0
  corpo="$(mktemp)"; cab="$(mktemp)"
  linha="$(curl -s -o "$corpo" -D "$cab" -w "HTTP %{http_code}, %{size_download} bytes" -m 30 -A "$UA" "$url" || echo "curl falhou")"
  echo "=== $nome ==="
  echo "$linha"
  # Cloudflare avisa por cabeçalho quando segura a requisição com um desafio.
  grep -i -E '^(cf-mitigated|server|content-type):' "$cab" | tr -d '\r' || true
  echo "desafio no corpo (\"Just a moment\" / \"Attention Required\"): $(grep -c -i -E 'just a moment|attention required|challenge-platform/h/b/orchestrate' "$corpo" || true)"
  echo "JSON-LD tipo Apartment: $(grep -o '"@type":"Apartment"' "$corpo" | wc -l)"
  echo "__NEXT_DATA__: $(grep -c '__NEXT_DATA__' "$corpo" || true), salePrice: $(grep -o '"salePrice"' "$corpo" | wc -l)"
  echo "preços 'R\$ ' no HTML: $(grep -o 'R\$ [0-9.]*' "$corpo" | wc -l)"
  echo "--- começo da resposta ---"
  head -c 300 "$corpo" | tr -d '\r' || true
  echo
  rm -f "$corpo" "$cab"
done <<< "$PORTAIS"
