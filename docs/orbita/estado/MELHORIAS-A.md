# Melhorias de 01/10/2026 — Frente A (linguagem visual e componentes base)

Plano: `docs/orbita/MELHORIAS-20261001.md`. Arquivos da frente: `web/app/app.css`, `tema.js`, `ui.js`, `graficos.js`, `web/fonts/` (só adicionar), `testes/app.teste.mjs`.

## Etapa 1 — commit de contratos (feito)

Tudo que B, C e D consomem está na branch. Verificar: `node testes/app.teste.mjs` (127 ok · 0 falha; a seção `(i)` é a nova) e `node --test testes/app.teste.mjs`.
Os testes de componente rodam num DOM de mentira mínimo escrito dentro do próprio `app.teste.mjs` (sem dependências); a conferência em Chrome real (Esc/Voltar com texto, Ctrl+Z, indicador do segmentado, claro e escuro, 375 e 1100 px) foi feita numa página de prova fora do repositório.

### Assinaturas (como ficaram; quem consome codifica contra isto)

| API | Forma | Detalhes que importam |
|---|---|---|
| tokens `app.css :root` | `--fs-display/-h1/-h2/-h3/-num-xl/-num-l/-num-m/-corpo/-peq`, `--f-narr`, `--c-sup` `--c-poco` `--c-sup-3`, `--c-sev-info/-aten/-crit`, `--c-prod` | `--c-prod` vale `--c-prod-crm` por padrão e troca por `html[data-produto="crm"|"ads"|"atendimento"]` (CRM = primária, Ads = secundária, Atendimento = mistura). O `tema.js` escreve `--c-prod-crm/-ads/-atend` (não escreve `--c-prod`: o estilo inline venceria a regra do CSS). Todos ≥ 4,5:1 sobre fundo, cartão, poço e pressionado, claro e escuro. |
| classes | `.rotulo` (Satoshi 600, `--fs-peq`, minúscula), `.dado` (Plex 500, tabular), `.selo-caps` (único caixa-alta), `.narr` (Zodiak itálica), `.num-moeda`, `.entra`, `.assenta`, `.destaque`, `.bt-contorno-perigo` | `.num-moeda`: filhos `small` ou `.nm-rs`/`.nm-cent` ficam a 60 % (ou use `ui.numMoeda(valor, {centavos})`). Zodiak: `@font-face` com `font-display: swap`; `--f-narr` só aparece em `.narr`, então nada é baixado até um `.narr` entrar na tela (login não usa). |
| `ui.cabecalho({rotulo?, titulo, sub?, acoes?, nivel: 1\|2})` | `<header class="cab">` | nível 1 → `<h1 tabindex="-1">`; nível 2 → `<h2>`. `acoes` = Node ou lista (nulos ignorados). |
| `ui.segmentado({opcoes:[{valor, rotulo, contador?}], valor, tipo: "abas"\|"filtro", aoMudar, rotulo})` | `<div role="tablist" class="seg seg-abas\|seg-filtro">` | Os dois tipos usam `role=tab` + `aria-selected` (único) + roving tabindex. Extras no elemento: `.ativar(valor)` (não chama `aoMudar`), `.contar(valor, n)`, `.valor`, `.reposicionar()`. Setas/Home/End movem e ativam; Enter/Espaço ativam o foco. Indicador por `--seg-x/--seg-w`; sem animação com `prefers-reduced-motion`. |
| `ui.toqueLongo(el, fn, {ms = 350, mouse = false})` | devolve `desligar()` | só toque/caneta (mouse com `mouse: true`); mexer > 10 px cancela; engole o clique seguinte. |
| `ui.deslizar(el, {esquerda?, direita?, limiar = 72})` | devolve `desligar()` | `esquerda` roda ao deslizar PARA a esquerda; cada lado é `fn` ou `{fn, rotulo}`; só assume o gesto se começar horizontal (`touch-action: pan-y`); lado sem ação não se move; mouse não desliza. Sempre ofereça o botão equivalente. |
| `ui.esqueleto(tipo, opcoes)` | `tipo ∈ inicio, chat, lista, kanban, ads, tabela, agenda` (+ `cartoes` legado) | 2º argumento aceita número (como antes) ou `{n, cabecalho}`. Telas inteiras (`inicio`, `chat`, `ads`, `agenda`) trazem cabeçalho por padrão; `lista/kanban/tabela/cartoes` continuam só miolo (`cabecalho: true` liga). |
| `ui.trocarEsqueleto(el, conteudo, {ms = 120})` | Promise | `el` é o contêiner (ou o próprio `.esqueleto`); conteúdo = Node, lista ou nulo. Sem esqueleto na tela só põe o conteúdo; movimento reduzido troca na hora. |
| `ui.erroCartao(erro, tentar)` | Node | refaz `tentar()` UMA vez em `orbita:online` (disparado pelo `rede.js` do B no `window`), só se o cartão ainda está na tela. Texto sem URL/jargão (`ui.fraseDeErro`/`ui.mensagemErro` agora tratam "Failed to fetch…", import() e erro cru com endereço). Códigos `sem_conexao`, `tempo_esgotado`, `http_408/429/5xx` mostram "tentamos de novo sozinhos". |
| `ui.acaoComDesfazer({texto, aplicar, reverter, ms = 7000})` | `Promise<{estado: "mantida"\|"desfeita"\|"falhou", desfeita, erro?}>` | nunca rejeita. Resolve quando o toast fecha (`mantida`), a pessoa desfaz (`desfeita`) ou algo falha. Ctrl/⌘+Z desfaz o mais recente fora de campo de texto; fila de 3 (o 4º firma o mais antigo). `reverter` que falha → toast de erro com o estado real. |
| `ui.toast` | `{fechar, el}`; opção nova `aoFechar(motivo)` | motivo: `tempo`, `fechado`, `desfazer`, `fila`. Todo toast chama `ui.anunciar` (erro é urgente). O toast e a caixa deixaram de ter `role`/`aria-live` (uma voz só). |
| `ui.modal` / `ui.gaveta` | opção `protegerTexto` (padrão `true`) | Esc, clique fora e Voltar (modal) com texto digitado mostram a faixa "Descartar o que você digitou?" (Continuar editando / Descartar). X, botões do rodapé, `fechar()` do código e `ui.confirmar` fecham direto. Só conta campo COM `name` mexido pela pessoa; `type=search`, `type=file` e `[data-sem-protecao]` ficam de fora; formulário preenchido por RPC depois de abrir não conta. `api.estaSujo()` / `g.estaSujo()`. Em `pointer: coarse` o foco inicial vai para o próprio diálogo. |
| `ui.campo({..., validar})` | `validar: "telefone"\|"email"\|"senha"\|"moeda"\|fn(valor, {el, campo})` | valida ao sair e, depois do 1º erro, a cada tecla (✓/! além da cor, `aria-invalid`). `fn` devolve o texto do erro (ou vazio). `"telefone"` ganha máscara BR (aceita +55) e `ui.lerForm` devolve só os dígitos; `tipo: "moeda"` agora tem a máscara com cursor estável (continua lendo por `lerMoeda`); `"senha"` mostra o medidor; `max` mostra o contador perto do limite. Antes de enviar: `ui.validarForm(raiz)` (foca o primeiro erro) ou `ui.validarCampo(el)`. `tipo: "tel"` SEM `validar` não muda. Funções puras exportadas: `formatarTelefone`, `formatarMoeda`, `mascarar`, `forcaSenha`. |
| `ui.vazio({tipo, titulo, texto, acao?, passos?})` | `tipo ∈ primeiro_uso, em_dia, sem_resultado` | `primeiro_uso`: órbita em SVG (um satélite por passo, aceso se `feito`) + lista de passos + ação; `em_dia`: selo ✓ + `titulo` em `.narr`; `sem_resultado`: 1 linha + "Limpar filtros" (rótulo padrão). Sem `tipo` = vazio de antes. |
| `G.destacar(el)` (`graficos.js`) | devolve `el` | classe `.destaque` por 600 ms; chamar de novo reinicia; sem flash com movimento reduzido. |
| `ui.numMoeda(valor, {centavos = true})` | `<span class="num-moeda">` | extra (não estava no contrato). |

### Mudanças visíveis em todas as telas (para o integrador saber)

- `.rotulo` virou Satoshi 600 13 px minúsculo (era Plex 11 px caixa-alta): todo `.rotulo` das telas muda de cara agora.
- Tema CLARO: `--c-sup` (cartão) ficou mais claro que a página e há `--c-poco`; com a página `#FAFAF8` a diferença ainda é sutil (o papel quente `#F3F0E9` entra em M01). O escuro saiu idêntico (teste de hash com 4 marcas).
- `.cartao` perdeu o `backdrop-filter`.
- `.sk` (esqueleto) agora varre uma faixa clara em 1,4 s; com movimento reduzido só pulsa a opacidade.
- `ui.mensagemErro` troca jargão/URL de erro de rede e de import() por frase em português.

## Itens M01–M10 (situação depois da etapa 1)

| Item | Situação | Feito | Falta |
|---|---|---|---|
| M01 papel e elevação | **feito** | ver "Etapa 2 · M01" abaixo | — |
| M02 escala + cabeçalho + Zodiak | parcial | 9 tokens `--fs-*`, `--f-narr`, `@font-face`, `.narr`, `ui.cabecalho` com testes | zerar `font-size` literal de `app.css`, marcador `/* escala: tokens */` e o teste dele, Clash só 600 |
| M03 rótulos | parcial | `.rotulo`, `.dado`, `.selo-caps` | as ~30 regras `uppercase`, piso 12/13 px, teste do piso |
| M04 cor com intenção | parcial | tokens `--c-sev-*` e `--c-prod-*`/`--c-prod`, regra `[data-produto]`, `.bt-contorno-perigo` | rotação de matiz das semânticas, glifos nas pílulas, `--c-google/--c-meta` próprios, `.produto-grade` em 1 coluna |
| M05 segmentado + gestos | feito (componentes) | `ui.segmentado`, `ui.toqueLongo`, `ui.deslizar` + testes | tirar as classes antigas quando C/D migrarem (M30/M40) |
| M06 esqueletos/erro | parcial | 7 tipos, `trocarEsqueleto`, `erroCartao` com `orbita:online`, frases sem URL | medir CLS depois que as telas usarem (M30/M31/M40) |
| M07 desfazer | feito (infra) | `acaoComDesfazer`, Ctrl/⌘+Z, fila de 3, toasts anunciados | uso em M25/M35 (C/B) |
| M08 formulários | feito (componentes) | `protegerTexto`, `validar`, máscaras, medidor, contador, foco em toque | uso nas telas (C/D) |
| M09 vazios | parcial | 3 tipos com SVG por `createElementNS` | tirar o ícone "+" padrão do vazio sem `tipo` (compatibilidade por ora), usos |
| M10 movimento | parcial | `.entra`, `.assenta`, `.destaque`, `G.destacar` | tirar sweep do botão e hover-lift, palco animado só em Login/Início (precisa de classe no `<body>` posta pelo shell, B), sonda CDP |

## Pendências para outras frentes

- **B (`rede.js`, `app.js`)**: disparar `window.dispatchEvent(new Event("orbita:online"))` ao reconectar (o `erroCartao` já escuta). Pôr `data-produto` no `<html>` (M13) para o `--c-prod` trocar. Para M10: classe no `<body>` quando a tela for Login/Início (palco animado só ali). A busca global (`type=search`) já fica fora da proteção de texto; qualquer modal do shell com campo `name` que seja filtro/busca deve passar `protegerTexto: false` ou `data-sem-protecao`.
- **C e D**: `ui.cabecalho` nível 1 só uma vez por tela; `esqueleto('kanban'|'lista'|'tabela', n)` continua igual (miolo). `ui.acaoComDesfazer` não rejeita: confira `.estado`. Modais de formulário passam a proteger o texto sozinhos; se algum modal tiver campo com `name` que não é "dado digitado" (filtro, busca), passe `protegerTexto: false`.
- **Todos**: para CSS novo seguir as travas (nenhum hex fora de `:root`, `minmax(0, 1fr)`, tamanhos por `--fs-*`, caixa-alta só `.selo-caps`); o bloco "LINGUAGEM VISUAL — contratos da frente A" no fim do `app.css` é conferido por teste.

## Etapa 2 — itens completos (cada um com o seu commit)

### M01 · papel e elevação no claro — FEITO

- **O que mudou:** o claro padrão é o papel quente `#F3F0E9` (`FUNDOS_ESQUEMA.claro`, `PADRAO.cores.fundo`; a lista `FUNDOS` do editor de marca começa por ele). Cartão (`--c-sup`) = papel + 70 % de branco (≈ `#FBFBF8`), poço (`--c-poco`) = papel → texto 5 %, pressionado (`--c-sup-3`) segue o mais escuro. **`--c-sup-2` no claro** passou a ser "um sopro abaixo do cartão" (cartão → texto 5 %): antes (papel → texto 9 %) cada bloco dentro de um cartão virava um retângulo cinza pesado. O escuro continua exatamente como era.
- **CSS:** `.cartao` com borda de 1 px e sombra de duas camadas (contato curto + queda longa; o escuro mantém a sombra de antes), sem `backdrop-filter`. Campos, caixas de marcar, busca flutuante, bloco de link e DNS no poço. Tokens novos `--c-pop` (o que flutua: menu, popover, toast = cartão no claro, 2º degrau no escuro) e `--c-hover` (realce de item sob o mouse). O `:root` do `app.css` agora é o tema padrão claro EXATO (teste de sincronia: nenhum token em hex defasado antes da 1ª pintura).
- **Como verificar:** `node testes/app.teste.mjs` (seção (i): "papel quente…", ":root = o tema padrão claro", golden do escuro). Visual: `scripts/dev-falso.mjs` → Início claro (cartões acima do papel, com borda e sombra) e escuro (idêntico).
- **Para as outras frentes:** (D) `relatorios.css` (`.ini-numero`, `.rel-kpi`, `.ini-canal`, `.ini-passo`, `.ads-cri-resumo>div`…): os blocos de número dentro de cartão ainda têm fundo `--c-sup-2`; para o plano ("número + linha fina") tirar o fundo e usar só uma borda de baixo; `--c-prim-suave` só no item que pede ação. (B) `index.html`: `<meta name="theme-color">` e o favicon ainda usam `#FAFAF8`; o papel é `#F3F0E9`. O cache `nx-app-marca` lido por `antes.js` guarda as variáveis ANTIGAS até o `app.js` reaplicar: haverá um piscar único depois do deploy (nada a fazer, só saber).
