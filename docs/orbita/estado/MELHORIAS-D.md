# Melhorias de 01/10/2026 — Frente D (Conversas, Início, Anúncios/Relatórios, Automações, Configurações)

Plano: `docs/orbita/MELHORIAS-20261001.md` (seção "Frente D"). Arquivos da frente: `conversas.js`, `cv-*.js`, `conversas.css`, `inicio.js`, `rel-logica.js`, `relatorios.js`, `relatorios.css`,
`anuncios.js`, `ads-config.js`, `automacoes.js`, `auto-*.js`, `automacoes.css`, `config.js`, `rastreio-config.js`, `admin.js`, `testes/conversas*.teste.mjs`, `testes/relatorios.teste.mjs`,
`testes/automacoes*.teste.mjs`, `supabase/functions/_compartilhado/enviar.js`, migração `supabase/migrations/20261002d_conversas_client_ref_onboarding.sql` (NÃO aplicada) e este arquivo.
Nada foi publicado, aplicado no banco, enviado ou mesclado; o `?v=` do `index.html` e o `versao.json` não foram tocados.

Como ver: `ORBITA_DEV_FALSO_PORT=4740 node scripts/dev-falso.mjs` → `http://127.0.0.1:4740/app/?dev-falso=1&dev=1#/conversas/901` (ou `#/inicio`, `#/anuncios`, `#/relatorios`, `#/config`).

## Situação por item

| Item | Situação | Resumo |
|---|---|---|
| M34 | feito | Chat com um primário por estado, cabeçalho de uma linha no celular, aviso do canal virou ⓘ, abas em uma linha, selos da lista viram pontos de cor |
| M37 | feito | Foto do celular comprimida no aparelho (1600 px, JPEG 0,82, EXIF corrigido), resumo "de 7,3 MB para 216 KB", "enviar original" quando cabe, upload com barra, Cancelar e Tentar de novo sem recomprimir |
| M38 | feito | KPIs que cabem a 768-1440 px (container query), "R$" e centavos a 60 % (`.num-moeda`) em Relatórios, Anúncios e Início; sonda de navegador no teste |
| M31 | feito | Início com manchete editorial (frase em links, número no acento, verbo em Zodiak), blocos só com ação em ordem de urgência, "Mais detalhes" recolhido, "Tudo em dia.", esqueleto até o dado e destaque do número que muda |
| M32 | — | — |
| M33 | — | — |
| M35 | — | — |
| M36 | — | — |
| M39 | — | — |
| M40 | — | — |

## M34 — feito

- **Cabeçalho do chat** (`cv-chat.js`, regra pura `L.estadoCabecalho` em `cv-logica.js`): sem dono → "Assumir" primário e Resolver vira ícone neutro; minha → "Resolver" em contorno `--c-ok` (`.bt-resolver`);
  IA atendendo (CodeWords, IA ligada e viva) → "Assumir" (pausa a IA) e Resolver/Transferir/"Atribuir a mim" ficam no ⋮; IA pausada → "Devolver para a IA" entra no ⋮; resolvida → só "Reabrir" (secundário).
  Nunca mais de um `.bt-prim` no cabeçalho (teste com 180 combinações de estado).
- **Celular (≤ 760 px)**: cabeçalho de UMA linha (voltar, avatar, nome + telefone, ação principal, ⋮); dono + departamento viram UMA pílula na faixa de situação; janela e IA ganham texto curto ("Janela 18 h", "IA pausada até 23:59") com o texto completo no tooltip.
  Detalhes (número, protocolo) cedem espaço por container query (`.cvc-quem-txt`): some o "via número" e depois o protocolo, nunca sobra um "·" solto.
- **Composer**: o aviso permanente "Este número CodeWords envia texto…" saiu da conversa; vira o botão ⓘ ao lado do clipe (e o clipe, `aria-disabled`, também o explica ao toque); a faixa some sozinha em 9 s.
- **Lista**: abas em UMA linha com `ui.segmentado` (Minhas · Sem dono · Aguardando) + botão "Mais situações ▾" com Todas abertas / Pendentes / Resolvidas / Ocultas (supervisor) e contagem; com busca ou aba do menu nenhuma fica marcada
  (o subtítulo da lista mostra a situação). Etapa e etiquetas viram pontos de cor (nome no tooltip e no rótulo do item): nenhum selo é cortado com reticências. A coluna da lista ficou com 320 px mínimo a partir de 761 px (as 3 abas com contador cabem).
- **Medido no dev-falso** (390×844, discontada a faixa DEMO): mensagens = 61-62 % da altura (antes 42 %); cabeçalho 56 px (antes 104-182); composer 113 px (antes 190). 1024 e 1440: 0 selo cortado, 0 erro de console.
- **Verificar**: `node testes/conversas.teste.mjs` (40 ok), `node testes/app.teste.mjs` (as travas de a11y do painel de inbox continuam valendo: mantive `aria-labelledby`, `role=group` na busca e `removeAttribute("aria-selected")`).

## M37 — feito

- **Compressão** (`cv-composer.js` `otimizarFoto`, regras puras em `cv-logica.js`: `dimensoesFoto`, `planoFoto`, `proximaQualidadeFoto`, `resumoOtimizacao`): antes de validar o limite de 5 MB, jpeg/png/webp/heic passam por `createImageBitmap` (`imageOrientation: "from-image"`; fallback `<img>`) + canvas e saem em JPEG com o lado maior em 1600 px, qualidade 0,82 (cai para 0,72 e 0,62 se passar de 500 KB). Foto pequena (≤ 300 KB e dentro de 1600 px) segue como veio; se a recompressão não ajudar o original é mantido. PNG com transparência ganha fundo branco. HEIC só funciona onde o navegador decodifica (Safari); fora dele aparece uma frase clara.
  Desvio consciente do plano: saída só em JPEG (não WebP), porque a API do WhatsApp só aceita JPEG/PNG como foto (WebP é só figurinha).
- **Pré-visualização**: miniatura do arquivo otimizado, frase "Foto otimizada de 7,3 MB para 216 KB" e, quando o original também cabe (≤ 5 MB), a opção "Enviar a original".
- **Upload com progresso** (`conversas.js`): `XMLHttpRequest` com `upload.onprogress` (no máximo ~8 atualizações/s), barra e "62 %" dentro do balão, **Cancelar** enquanto sobe, "Entregando…" depois, e **Tentar de novo** que reaproveita o arquivo já comprimido (e, se o arquivo já tinha subido, não sobe de novo — só repete a `nx-enviar`). Vídeo e documento usam a mesma barra. Só em canal com mídia (Cloud API), como antes.
- Correção de passagem: imagem que termina de carregar depois de a conversa rolar até o fim empurrava a barra de envio para baixo do compositor; a conversa agora se mantém no fim por 2,5 s depois de abrir/enviar.
- **Medido no dev-falso** (puppeteer, foto sintética de 7,3 MB 4032×3024 com EXIF orientação 6): saiu 1200×1600 (orientação certa) com 214–217 KB; barra "0 %" e Cancelar visíveis a 390 px; cancelar remove a bolha e avisa; falha de rede → "Não enviada… Tentar de novo" → reenvia o MESMO blob de 217 KB. Console limpo.
- **Não provado**: aparelho real (câmera de celular, iOS Safari/HEIC); o `progress` do XHR só foi exercitado na parte lógica (a interceptação do puppeteer não emite eventos de subida).
- **Verificar**: `node testes/conversas.teste.mjs` (46 ok).

## M38 — feito

- **Números que cabem**: `.rel-corpo` é container (`relcorpo`) e cada `.rel-kpi` também; o valor usa `clamp(var(--fs-h2), 11cqi, var(--fs-num-l))` (só tokens). A grade de 6 KPIs deixou de ser "6 colunas até 1100 px": 6 em uma linha só quando a área tem ≥ 62 rem, 3+3 de 31 rem até lá, 2 colunas abaixo. No Início o bloco `.ini-numero` também é container (`16cqi`) e a receita do mês usa `--fs-num-xl`.
  Desvio do plano: o plano pede `auto-fit(minmax(9.5rem, 1fr))`; `auto-fit` deixava uma linha órfã (5 + 1) em 1180 px, então a escolha de colunas é por container query (mesmo mínimo de 9,5 rem por cartão).
- **Moeda editorial**: `rel-logica.js` ganhou `partesMoeda`, `textoMoeda`, `preencherMoeda(ui, el, valor, {centavos})` e `contarMoeda(ui, G, el, valor, …)` (o contador de G.contar, mas com o formato editorial; só nós de texto e spans `nm-rs`/`nm-cent`, CSS do `.num-moeda` é da frente A). Usado nos KPIs de Relatórios, em todo valor em R$ de `num()` de Anúncios e do Início (receita, previsão, barras do mês). Tabelas e textos corridos continuam com `ui.brl` (texto), já alinhadas à direita e com `tabular-nums`.
- **Medido** (puppeteer + dev-falso, antes → depois): Relatórios › Vendas a 1180 px `R$ 28.400` passava 33 px do cartão e a 1280 px 21 px; Início `R$ 26.200` passava 7 px a 1180 px e 2 px a 390 px. Depois: 0 número fora do cartão em 768, 1024, 1180, 1280, 1440 e 390 px nas 5 telas (Vendas, Atendimento, Anúncios, Campanhas, Início).
- **Verificar**: `node testes/relatorios.teste.mjs` (45 ok); a sonda de navegador entra com `ORBITA_QA_NAVEGADOR=1 ORBITA_PUPPETEER=<pasta com node_modules/puppeteer-core> node testes/relatorios.teste.mjs` (sem a variável o teste é pulado: o repositório não depende de puppeteer).

## M31 — feito

- **Manchete** (`rel-logica.js`: `manchete`, `consultasHoje`, `blocosInicio`, `numerosMudaram` — tudo puro e testado): "2 pacientes esperam resposta há 15 min e 1 tarefa atrasada. Hoje tem 1 consulta e R$ 67.400 em oportunidades abertas." Vocabulário da vertical (pacientes/clientes, oportunidades/orçamentos, concordância de gênero); cada trecho é link (conversas aguardando, tarefas atrasadas, agenda, CRM) e vira texto sem permissão. Número no acento (`--c-prod`; tarefa atrasada em `--c-ruim`), dinheiro em `.num-moeda`, o verbo em `.narr` (Zodiak). Frase curta usa o degrau display; a longa (> 70 caracteres) usa o h1 e fica em 2-3 linhas. É o próprio `<h1>` da tela (com `aria-label` da frase inteira), montado por `ui.cabecalho` (saudação pequena em `.rotulo`).
  A agenda de hoje vem de `nx_agenda_dia` (já existente; `nx_inicio` não traz consultas) em paralelo, como complemento: se falhar ou o módulo não existir a frase só não fala de consulta.
- **Só o que pede ação**: grade de 2 colunas (o último bloco ímpar ocupa a linha) com Atendimento, Tarefas, Número de WhatsApp com problema (ou sem número) e Vendas, nessa ordem; Leads e o que está calmo vão para "Mais detalhes" (`<details>`, estado lembrado entre atualizações). Sem pendência (ninguém esperando, sem tarefa para hoje, sem conversa sem dono) aparece o selo `ui.vazio({tipo:"em_dia"})` "Tudo em dia." e a manchete fala só do dia.
- **Nunca em branco**: `ui.esqueleto("inicio")` até o dado chegar (antes o esqueleto era apagado antes de `nx_inicio` responder) e `ui.trocarEsqueleto` na 1ª pintura; com rede de 3,5 s de atraso o esqueleto ficou na tela e a manchete entrou depois. `rpcC("nx_inicio", {}, {cache: true, aoCache})` já passa as opções do contrato (a B ainda não as lê: sem cache o comportamento é o de antes). `G.destacar` acende o número que mudou entre duas leituras (testado com Atualizar). Os números só contam até o valor depois que o esqueleto sai (corrige a animação que parava no 1º quadro).
- **Medido** (dev-falso): manchete começa em y = 197 a 390×844 (≤ 300); 1 `h1` por tela; 0 erro de console; estado calmo, rede lenta e destaque conferidos por puppeteer.
- Desvio: o texto do plano pede o cache do último dado; ele depende do `rpcC({cache})` da frente B (M16), que não está na branch.
- **Verificar**: `node testes/relatorios.teste.mjs` (52 ok).

## Pendências para outras frentes

- (A) nenhuma até aqui.
- (B) `scripts/dev-falso.mjs` — respostas fictícias novas que a frente D vai precisar: `nx_onboarding_estado` (M32), `client_ref` repetido no `nx-enviar` devolvendo a mesma mensagem (M36). Sem elas a frente D usa interceptação de requisição nas próprias provas (puppeteer), sem tocar no arquivo.
- (B) `ctx.rascunho` (M17), `ctx.comandos.registrar` (M18), `orbita:online`/`rede` e o motor de avisos (M19) ainda não existem na branch: a frente D codifica contra o contrato do plano com fallback quando ausentes.
