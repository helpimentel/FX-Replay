
# FX Replay Pro v6 - Manual do Operador

Terminal profissional de backtesting fidedigno com suporte a Pine Script e execuções interativas.

## 🛠️ Como Iniciar um Teste
1. **Asset Selection**: Clique no símbolo (ex: EUR/USD). O modal de sincronização abrirá.
2. **Deep History**: O sistema baixará ~3000 velas de contexto antes da sua data inicial. Isso garante que indicadores de longo prazo (como EMA 200) estejam estáveis no momento zero do replay.
3. **Go-To-Date**: Defina a data exata onde deseja começar a operar e clique em **Commence Testing**.

## 📊 Replay Dinâmico
- **Controle de Velocidade**: Ajuste de 0.25x (análise minuciosa) até 100x (simulação de dias em minutos).
- **Step-by-Step**: Use as setas para avançar vela a vela e validar seu "trigger" de entrada.
- **Modo Cego**: Os candles futuros ficam ocultos, simulando o "Right Side of the Chart".

## 💹 Gestão de Trade Interativa
- **Setup Visual**: Clique em LONG ou SHORT. Arraste as linhas no gráfico para ajustar Stop Loss e Take Profit.
- **Risco Automático**: O tamanho do lote (Size) é recalculado automaticamente baseado no seu % de risco definido e na distância do SL.
- **Trailing Stop**: Ative o Trailing Stop no painel de trade para que o SL persiga o preço conforme a operação se move a seu favor.

## 📝 Pine Script & Sessões
- **Editor**: Use o editor lateral para escrever seus próprios indicadores.
- **Overlay**: Indicadores com `overlay=true` aparecem sobre as velas.
- **Subgraph**: Indicadores com `overlay=false` ganham um painel exclusivo inferior.
- **Sessions**: O indicador de sessões destaca Londres, NY e Tóquio, permitindo operar em horários de alta liquidez.

---
*Desenvolvido para traders que buscam maestria através da repetição deliberada.*
