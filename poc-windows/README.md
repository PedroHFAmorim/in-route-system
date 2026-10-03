# POC: localizacao indoor por Wi-Fi (Windows)

Script unico em PowerShell 5.1, sem dependencias. Guarda fingerprints em `places.json` (ao lado do script).

1. Ative a localizacao: Configuracoes > Privacidade > Localizacao (inclusive "Permitir que aplicativos da area de trabalho acessem sua localizacao").
2. Rode da pasta do projeto:

```
powershell -ExecutionPolicy Bypass -File poc-windows\wifi-locate.ps1 selftest
powershell -ExecutionPolicy Bypass -File poc-windows\wifi-locate.ps1 scan
powershell -ExecutionPolicy Bypass -File poc-windows\wifi-locate.ps1 save -Name "Sala 3" -X 0 -Y 0
powershell -ExecutionPolicy Bypass -File poc-windows\wifi-locate.ps1 where
powershell -ExecutionPolicy Bypass -File poc-windows\wifi-locate.ps1 watch
```

Mapeie varios pontos (varios `save`, mesmo nome = mais amostras), depois caminhe com `watch`.
Calibrar uma area (cantos): use o **mesmo nome** em todos os pontos, mudando so `-X`/`-Y` (ex.: `-X 0 -Y 0`, `-X 8 -Y 0`, `-X 8 -Y 5`, `-X 0 -Y 5`); o `where` estima a posicao dentro da area.
Comandos extras: `list`, `delete -Name "..."`. Redes `_nomap` e BSSIDs aleatorios sao ignorados.
