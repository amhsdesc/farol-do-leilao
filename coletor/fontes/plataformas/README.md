# Modelos por plataforma

Muitos leiloeiros usam o mesmo software de site (Soleon, Leilotech, Leilão PRO, Superbid e outros).
Quando dois ou mais leiloeiros usam a mesma plataforma, o coletor é escrito **uma vez**, aqui, e cada
leiloeiro vira um YAML de 5 linhas:

```yaml
# fontes/leiloeiros/leiloeiro-x.yaml
herda: plataformas/nome-da-plataforma.yaml
id: leiloeiro-x
nome: Leiloeiro X
site: https://www.leiloeirox.com.br
uf: [DF]
```

No modelo, escreva as URLs com `{site}` (ex.: `{site}/imoveis?pagina={pagina}`): o registro troca
pelo `site` de cada leiloeiro.

Como descobrir a plataforma: `python -m coletor inspecionar https://site-do-leiloeiro` mostra a
plataforma quando reconhece a assinatura. Novas assinaturas vão em `coletor/inspecionar.py` (PLATAFORMAS).
