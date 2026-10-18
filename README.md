# Editor de Save — Idle Slayer

Editor local do save do Idle Slayer (versão Steam/PC). Mostra tudo o que você tem e não tem,
com nome em português, ícone e efeito de cada item, e deixa ligar/desligar ou mudar quantidades.

## Como usar

1. **Feche o Idle Slayer** (se o jogo estiver aberto, ele sobrescreve o save quando fechar).
2. Dê dois cliques em **`Abrir Editor.bat`**. O navegador abre em <http://localhost:5540>
   já com o seu `savedata.sav` carregado.
3. Edite o que quiser e clique em **Salvar no jogo**.
4. Abra o jogo.

Deixe a janela preta do `.bat` aberta enquanto usa o editor; feche quando terminar.

## O que dá para editar

| Aba | O que é |
|---|---|
| Recursos | Moedas, Pontos de Exterminador, Joias da Alma, Pontos de Divindade, Almas… Aceita `1e100`, `1,5e50`, `1.000.000`. Embaixo ficam todas as estatísticas com nome. |
| Missões | Buscas principais, de evento, diárias e semanais liberadas e não resgatadas, com descrição, progresso e meta. Também lista as liberadas que ainda estão em 0 (o jogo só grava a missão no save quando ela ganha progresso; o editor deduz pelo pacote de buscas comprado e, nas de evento, pelas datas do evento). Marque as que quiser e clique em **Completar selecionadas** (ou "Completar" numa só). O progresso vai para a meta; depois resgate a recompensa no jogo em "Reivindicar Recompensa". |
| Melhorias, Habilidades de Ascensão, Fabricáveis, Conquistas, Outros bônus | Interruptor **Tenho / Não tenho** em cada item, filtros e "Tenho todos" para marcar tudo o que está filtrado. |
| Divindades | **Comprada** e **Ativa** separadamente. |
| Equipamentos, Materiais, Pedras do Tempo, Bestiário | Quantidade de cada um. "Definir N filtrados" muda vários de uma vez. |
| Skins | Desbloquear/bloquear skins. |
| Arsenal | Armas no inventário: nível, excelente, quais benefícios/habilidades ela tem; adicionar armas novas. |
| NPCs, vila e vassalos | Valores compostos (`a#b#c`) editados como texto. |
| Avançado | Todas as chaves do save, inclusive as desconhecidas. Dá para editar, remover e adicionar. |

O botão **"N alterações"** no topo mostra a lista do que vai mudar antes de salvar.

## Segurança

- Toda gravação faz backup do save anterior em
  `%USERPROFILE%\AppData\LocalLow\Pablo Leban\Idle Slayer\editor-backups\`.
- O botão **Backups** lista esses arquivos e restaura qualquer um com um clique.
- **Baixar .sav** gera o arquivo editado sem mexer no jogo; **Abrir arquivo…** carrega um `.sav` de outro lugar.
- O jogo tem save na nuvem (conta Pablo Leban). Se ele perguntar qual versão manter, escolha a local (a editada).

## Depois de uma atualização do jogo

Itens novos aparecem só na aba Avançado até o catálogo ser regenerado:

```bat
python -m venv .venv
.venv\Scripts\pip install UnityPy
.venv\Scripts\python tools\extrair_catalogo.py
```

Isso relê os arquivos do jogo em `C:\Program Files (x86)\Steam\steamapps\common\Idle Slayer`
(passe outro caminho de `Idle Slayer_Data` como argumento se estiver instalado em outro lugar)
e recria `data/catalog.json` e `data/icons.json`.

## Detalhes técnicos

- `savedata.sav` é um JSON `{StringData, IntData, FloatData, BoolData}` (listas de `{Key, Value}`)
  cifrado com XOR pela frase *"If you manage to get this string you are allowed to hack the game all you want"*.
- Os itens usam IDs de 20 caracteres (ex.: `z2qsz4qj0gcm3l3relwe` = Espada Longa de Boreas); o catálogo
  vem dos assets do jogo (`resources.assets`) e as traduções do pacote `langpt-br`.
- Números grandes ficam em texto no formato do Windows em português (`1,5E+50`); o editor mantém esse formato.
- Opções do servidor: `node server.js --port 5540 --dir "C:\outra\pasta" --no-open`.
