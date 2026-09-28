# Coleta todas as fontes ativas e geocodifica os imóveis novos.
# Agende no Agendador de Tarefas do Windows (ex.: 3 vezes ao dia) apontando para este arquivo.
$raiz = Split-Path -Parent $PSScriptRoot
Set-Location "$raiz\coletor"
& "$raiz\.venv\Scripts\python.exe" -m coletor coletar --todas *>> "$raiz\dados\coleta.log"
& "$raiz\.venv\Scripts\python.exe" -m coletor geocodificar --limite 300 *>> "$raiz\dados\coleta.log"
