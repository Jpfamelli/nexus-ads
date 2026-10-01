# Órbita — plano de melhorias de 01/10/2026

Branch de origem: `claude/automacoes-ia`. Autor do plano: Claude (juiz). Este arquivo é só o plano: nenhuma linha de código mudou.
Entradas: três auditorias feitas no `scripts/dev-falso.mjs` com puppeteer-core e o Chrome instalado (390×844, 1440×900, mais 768/1024/1180/1280),
nas lentes **Visual**, **Conectividade e robustez** e **Interatividade/UX**. Capturas e medições ficam no scratchpad da sessão
(`…\scratchpad\lv\`, `…\scratchpad\orbita-conect\`, `…\scratchpad\ux\`); os nomes citados abaixo são relativos a essas pastas.
A faixa "DEMO LOCAL" é só do dev-falso e foi descontada nas medidas de altura.

## Como o juiz decidiu

- **Já feito, não entra:** Ctrl+K básico (só busca), Voltar fecha modal (`a1fc214`), tema claro/escuro/marca, áudio e anexos,
  chips de filtro em Conversas, correções de contraste e de corte do QA de 30/09, balões que se ajustam, abas que quebram no desktop.
  Esses pontos só reaparecem quando a proposta vai além do que existe (por exemplo, a paleta M18 amplia o Ctrl+K).
- **Fundidos (vinham repetidos de lentes diferentes):** offline (Conectividade nº 3 + UX nº 12) → M14; rascunhos (Conectividade nº 9 + UX nº 5)
  → M17, M36 e M30; avisos fora de Conversas (Conectividade nº 10 + UX nº 9) → M19 e M20; PWA (Conectividade nº 11 + UX nº 9) → M13;
  celular com conteúdo tarde (Visual nº 5 + UX nº 3 + UX nº 13) → M23 e M39; agenda (Visual nº 16 + UX nº 8) → M26 e M27;
  Plex e caixa-alta (Visual nº 3) → M03; pulso e não lidas (Conectividade nº 13) → M19; versão nova (Conectividade nº 12) → M12.
- **Adiados (fora desta rodada):** visões salvas (ESPEC P1, exige 3 RPCs novas, pouco ganho imediato), passeio guiado de 4 passos
  (a Ajuda e as dicas mínimas entram em M18), "puxar para atualizar" (troca por botão compacto em M39), Background Sync do service worker.
- **Critério de "significativa":** muda o que a pessoa vê ou consegue fazer numa tela de uso diário, ou elimina uma falha medida
  (tela em branco, perda de texto, envio duplicado, número cortado, app que some offline). Ajuste cosmético isolado não entrou.

## Resumo

40 melhorias em 4 frentes com pastas disjuntas (A 10, B 12, C 8, D 10). Cobertura por lente principal:
**visual 14** (M01, M02, M03, M04, M05, M09, M10, M21, M30, M31, M34, M38, M39, M40; tipografia = M02, M03, M38; cor = M01, M04, M39),
**conectividade e robustez 12** (M06, M11, M12, M13, M14, M15, M16, M17, M19, M20, M36, M37),
**interatividade e UX 14** (M07, M08, M18, M22, M23, M24, M25, M26, M27, M28, M29, M32, M33, M35). Itens obrigatórios do pedido:

| Pedido obrigatório | Itens |
|---|---|
| PWA instalável com cache seguro do shell | M12 (service worker + cache por versão) e M13 (instalável com a marca) |
| Checklist de configuração na tela inicial (chave CodeWords → parear → IA → agenda → rastreio) | M32 (+ M33 assistente do número) |
| Paleta de comandos e atalhos | M18 (paleta) e M35 (atalhos da central) |
| Kanban arrastável no toque | M23 |
| Esqueletos e otimismo nas listas | M06 (componente), M07 (desfazer otimista), M25, M30, M31, M40 (uso nas telas) |
| Sessão expirada sem perder o que foi digitado | M17 (sessão + rascunho.js) e M36 (compositor do chat) |

## Frentes e posse de arquivos (disjuntas)

Cada arquivo tem UM dono. Uma frente nunca edita arquivo de outra: quando precisa, manda recado pela Ponte para o dono.

| Frente | Tema | Arquivos que só ela edita |
|---|---|---|
| **A** | Linguagem visual e componentes base | `web/app/app.css`, `web/app/tema.js`, `web/app/ui.js`, `web/app/graficos.js`, `web/fonts/` (só ADICIONAR arquivo; os atuais servem o painel clássico no ar), `testes/app.teste.mjs` |
| **B** | Shell, conectividade e PWA | `web/app/index.html`, `web/app/antes.js`, `web/app/app.js`, `web/app/api.js`, `web/app/pulso.js`, `web/app/login.js`, `web/app/rotas.js`, `web/app/vocab.js`, `web/app/manifest*.webmanifest`, `web/crm/`, `web/ads/`, `web/atendimento/`, `netlify.toml`, NOVOS `web/app/sw.js`, `rede.js`, `cache.js`, `rascunho.js`, `shell.css`, `versao.json`, `icones/`; `scripts/dev-falso.mjs`, `scripts/montar-funcoes.mjs`, `testes/rodar-tudo.mjs`, `testes/dev-falso.teste.mjs`, NOVO `testes/shell.teste.mjs`; `supabase/functions/nx-push/` (novo), `supabase/functions/_compartilhado/webhook.js`, `supabase/deploy-lista.txt`, `docs/orbita/DEPLOY-FUNCOES.md`; migração `supabase/migrations/20261002b_sessao_pulso_push.sql` |
| **C** | CRM e Agenda | `web/app/crm.js`, `crm-*.js` (kanban, negocio, listas, tarefas, logica, config, importar), `agenda.js`, `agenda-config.js`, `crm.css`, `agenda.css`, `testes/crm.teste.mjs`; migração `supabase/migrations/20261002c_crm_idempotencia_lote.sql` |
| **D** | Conversas, Início, Anúncios/Relatórios, Automações, Configurações | `web/app/conversas.js`, `cv-*.js`, `conversas.css`, `inicio.js`, `rel-logica.js`, `relatorios.js`, `relatorios.css`, `anuncios.js`, `ads-config.js`, `automacoes.js`, `auto-*.js`, `automacoes.css`, `config.js`, `rastreio-config.js`, `admin.js`, `testes/conversas.teste.mjs`, `testes/relatorios.teste.mjs`, `testes/conversas-funcoes.teste.mjs`, `testes/automacoes*.teste.mjs`, `supabase/functions/_compartilhado/enviar.js`; migração `supabase/migrations/20261002d_conversas_client_ref_onboarding.sql` |

Arquivos de estado: cada frente escreve só em `docs/orbita/estado/MELHORIAS-A.md` … `MELHORIAS-D.md`. O `?v=` do `index.html`
**não** é tocado pelas frentes: o integrador faz um único bump no fim (ver "Integração").

## Contratos entre frentes (assinaturas fixas; quem consome codifica contra elas)

A frente A entrega PRIMEIRO um commit só com estas APIs (podem nascer simples e melhorar depois). B, C e D começam pelos itens
que não dependem delas e passam a usá-las quando o commit de contratos estiver na branch de integração.

- Tokens (A, `app.css :root`): `--fs-display`, `--fs-h1`, `--fs-h2`, `--fs-h3`, `--fs-num-xl`, `--fs-num-l`, `--fs-num-m`, `--fs-corpo`, `--fs-peq`;
  `--f-narr` (Zodiak itálica); superfícies `--c-sup` (cartão), `--c-poco` (área rebaixada), `--c-sup-3` (pressionado);
  gravidade `--c-sev-info`, `--c-sev-aten`, `--c-sev-crit`; `--c-prod` (acento do produto). Classes: `.rotulo` (Satoshi 600 13 px),
  `.dado` (Plex, valores técnicos), `.selo-caps` (único uso de caixa-alta), `.narr` (Zodiak), `.num-moeda` (R$ a 60 %), `.entra` e `.destaque` (movimento).
- `ui.cabecalho({rotulo?, titulo, sub?, acoes?, nivel: 1|2})` → elemento.
- `ui.segmentado({opcoes:[{valor, rotulo, contador?}], valor, tipo: "abas"|"filtro", aoMudar})` → elemento.
- `ui.toqueLongo(el, fn, {ms: 350})` e `ui.deslizar(el, {esquerda?, direita?})` (sempre com botão equivalente visível).
- `ui.esqueleto(tipo, opcoes)` com `tipo ∈ "inicio" | "chat" | "lista" | "kanban" | "ads" | "tabela" | "agenda"`; `ui.trocarEsqueleto(el, conteudo)` (fade 120 ms).
- `ui.erroCartao(...)` reexecuta sozinho no evento `orbita:online` (disparado por `rede.js`, B).
- `ui.acaoComDesfazer({texto, aplicar, reverter, ms = 7000})` → Promise; Ctrl/⌘+Z desfaz a mais recente (fila de 3).
- `ui.modal` / `ui.gaveta`: opção `protegerTexto` (padrão `true`) que detecta formulário alterado; `ui.campo({..., validar: "telefone"|"email"|"senha"|"moeda"|fn})`.
- `ui.vazio({tipo: "primeiro_uso"|"em_dia"|"sem_resultado", titulo, texto, acao?, passos?})`.
- `G.destacar(el)` (graficos.js): flash de 600 ms quando um número muda.
- B: `ctx.rede` (`estado`, `aoVoltar(fn)`), `ctx.api.rpcC(nome, params, {cache?: true, aoCache?(dados, em), req?: true})`,
  `ctx.rascunho.ligar(campo, chave)` / `ctx.rascunho.apagar(chave)`, evento `orbita:rede` com `{estado}`.

## Ordem (ondas)

1. **Onda 1, fundação (paralela):** A — commit de contratos, depois M01–M04; B — M11, M12, M14, M15, M17; C — M23, M26; D — M34, M37, M38.
2. **Onda 2, uso dos contratos:** A — M05–M10 completos; B — M13, M16, M18, M19, M21, M22; C — M24, M25, M27, M28, M30; D — M31, M32, M33, M35, M36, M39, M40.
3. **Onda 3, grandes com servidor:** B — M20 (push); C — M29 (lote).

---

## Frente A — Linguagem visual e componentes base

### M01 · Papel e elevação no tema claro: cartão mais claro que a página
- **Lente:** Visual (cor, superfície). **Impacto:** alto. **Esforço:** médio. **Onda:** 1.
- **Problema hoje:** `derivarTema` mistura o fundo com a cor do TEXTO a 5/9/14 % (`tema.js:152`). No escuro isso clareia; no claro escurece:
  página `#FAFAF8`, cartão `#EFEFED`, bloco interno `#E5E6E5`, razão ≈ 1,1:1 entre camadas. O Início vira quatro cartões cinza de blocos cinza
  (`lv/shots/inicio-d.png`, `inicio-m.png`; o escuro em `inicio-escuro-d.png` funciona). `.cartao` ainda usa `backdrop-filter: blur(8px)` sendo opaco (`app.css:887`).
- **O que fazer:** ramificar a derivação por esquema (escuro intacto). No claro: fundo "papel" quente (o `#F3F0E9` que já está em `FUNDOS`),
  `--c-sup` = fundo misturado com branco ~70 % (≈ `#FBFAF6`) com borda de 1 px e sombra suave de duas camadas, `--c-poco` para campos e áreas rebaixadas,
  `--c-sup-3` só para pressionado. Remover `backdrop-filter` de `.cartao`. Blocos de número dentro de cartão perdem o fundo no CSS base (número + linha fina);
  `--c-prim-suave` fica reservado ao item que pede ação.
- **Aceite:** no claro, luminância do cartão > página; contraste texto/cartão e texto/poço ≥ 4,5:1 nas 4 marcas de teste do `app.teste.mjs`;
  nenhum `.cartao` com `backdrop-filter`; captura do Início claro com hierarquia visível sem depender de borda; tema escuro com as mesmas variáveis de antes (teste de igualdade).
- **Arquivos:** `web/app/tema.js`, `web/app/app.css`, `testes/app.teste.mjs`.

### M02 · Uma escala tipográfica, um cabeçalho de página e a voz da narração (Zodiak)
- **Lente:** Visual (tipografia). **Impacto:** alto. **Esforço:** médio. **Onda:** 1 (tokens e componente); as telas migram em M30 e M40.
- **Problema hoje:** os tokens `--fs-*` existem (`app.css:73-74`), mas `relatorios.css` tem 64 `font-size` literais e 0 tokens; há 13 `clamp()` de display diferentes.
  Anúncios usa a Clash em 7 tamanhos; a 1440 o H1 mede 33,6 px (Início/Anúncios), 36 px (CRM/Agenda/Config) e 25 px (Conversas). Configurações cria um
  SEGUNDO H1 de 36 px dentro da seção (`cv-config.js:29,556,684,975,1054`); no celular "Marca e tema" abre sem título (`lv/shots/cfg-marca-m.png`, `cfg-numeros-d.png`).
  A Zodiak itálica (`web/fonts/zodiak-variable-italic.woff2`) dá voz ao painel clássico (`painel.css:21,943-948`) mas o `/app` não a usa.
- **O que fazer:** sete degraus fluidos no `:root` (display 40→56, h1 28→36, h2 20, h3 16, número xl/l/m 44/32/24, corpo 15, pequeno 13), Clash com peso único 600,
  entrelinha e tracking embutidos. Declarar `@font-face` da Zodiak e o token `--f-narr` + classe `.narr` (só manchetes, vazios, resumo de IA; carregamento
  `font-display: swap`). Criar `ui.cabecalho()` (contrato). Teste novo: arquivo CSS que traz o marcador `/* escala: tokens */` não pode ter `font-size` literal fora do `:root`
  (C e D põem o marcador quando migrarem seus CSS; `app.css` já nasce com ele).
- **Aceite:** `app.css` sem `font-size` literal fora do `:root`; teste do marcador passa; `ui.cabecalho` com testes de DOM (nível 1 gera `h1`, nível 2 gera `h2`);
  Zodiak carregada só quando um `.narr` aparece (sem requisição na tela de login).
- **Arquivos:** `web/app/app.css`, `web/app/ui.js`, `testes/app.teste.mjs` (a fonte já existe em `web/fonts/`).

### M03 · Rótulos legíveis: Plex só para dado e fim do caixa-alta em toda parte
- **Lente:** Visual (tipografia). **Impacto:** alto. **Esforço:** pequeno no CSS base (o uso nas telas entra em M30/M40). **Onda:** 1.
- **Problema hoje:** `.rotulo` (`app.css:129`) é Plex 11 px, caixa-alta, tracking .12em, em 81 pontos do JS e 30 regras com `text-transform: uppercase`.
  Na tela CRM, 13 de 97 textos são Plex caixa-alta e 24 têm 11 px; há chips de 10 e 11,5 px. "OPORTUNIDADES ABERTAS" quebra em 2 linhas a 390 px
  (`lv/shots/crm-m.png`). Para dono de clínica/loja com 45+ anos é o texto menos legível do app e a assinatura de "dashboard de IA" que o João rejeita.
- **O que fazer:** `.rotulo` passa a Satoshi 600 13 px, minúscula, `--c-texto-2`, sem tracking. Nova `.dado` (Plex 500) para protocolo, hora de mensagem,
  telefone, IDs, DNS. `.selo-caps` é o único caixa-alta com tracking (selos como "ao vivo"). Piso de 12 px em qualquer texto e 13 px em contexto de toque
  (`@media (pointer: coarse)`). Atualizar regras de `app.css` que usam `uppercase`.
- **Aceite:** sonda de tipografia (script do QA) no Início, CRM e Config a 390 px: 0 textos < 12 px no shell, nenhum `uppercase` em `app.css` além de `.selo-caps`;
  teste em `app.teste.mjs` que trava o piso e a regra de `uppercase` em `app.css`.
- **Arquivos:** `web/app/app.css`, `testes/app.teste.mjs`.

### M04 · Cor com intenção: a marca não engole as cores de estado, estado nunca só por cor e cada produto ganha acento
- **Lente:** Visual (cor). **Impacto:** alto. **Esforço:** médio. **Onda:** 1.
- **Problema hoje:** `derivarTema` não protege a marca das semânticas fixas (`tema.js:41-44,189`): padrão `#B0761F` (36°) x `--c-aten` `#8A5A00` (39°) = 3°;
  marca vermelha x `--c-ruim` = 3°; verde x `--c-ok` = 11°; azul x `--c-info` = 9°. Com marca vermelha "Assumir" parece ação destrutiva
  (`lv/shots4/marca-vermelha-chat.png`, `marca-vermelha-crm.png`). No claro `--c-google` tem o mesmo hex de `--c-aten` (`tema.js:42`). Os três produtos
  têm a mesma cara (`lv/shots3/p-ads-d.png`, `p-atend-d.png`) e o modal "Seus produtos" corta "Atendimer" no desktop (`app.css:601`, grade de 3 colunas em modal de 560 px; `lv/shots2/i-produtos-d.png`).
- **O que fazer:** (1) se |matiz(marca) − matiz(semântica)| < 30°, girar a SEMÂNTICA (não a marca) para a vizinha mais próxima que mantenha 4,5:1 e registrar em `avisos`;
  (2) pílulas semânticas ganham glifo próprio por CSS (`::before` com ✓, ▲, ✕, i) e ação destrutiva usa contorno + ícone, nunca o preenchimento da marca;
  (3) `--c-google`/`--c-meta` deixam de reaproveitar `aten`/`info`; (4) tokens de gravidade `--c-sev-*` para o Radar (usados em M39);
  (5) `[data-produto]` no `<html>` (atributo posto por B em M13) troca `--c-prod` entre tokens da própria marca (CRM = primária, Ads = secundária clara,
  Atendimento = mistura); (6) `.produto-grade` vira lista de 1 coluna com cartões de 72 px.
- **Aceite:** teste com as marcas vermelha, verde, azul e padrão: distância de matiz marca x cada semântica ≥ 30° e contraste ≥ 4,5:1; nenhum hex fora de `:root`/`tema.js`;
  "Seus produtos" a 1440 sem texto cortado; tema escuro e white-label continuam passando nos testes atuais.
- **Arquivos:** `web/app/tema.js`, `web/app/app.css`, `testes/app.teste.mjs`.

### M05 · Um segmentado só, com indicador que desliza, e os gestos de toque do app
- **Lente:** Visual + Interatividade. **Impacto:** médio. **Esforço:** médio. **Onda:** 2 (contrato na onda 1).
- **Problema hoje:** "selecionado" tem quatro linguagens: pílula preta (`conversas.css:53,369`), dourado cheio (`relatorios.css:74`), cinza (`crm.css:49`, `app.css:359`)
  e bege com borda; Anúncios mostra bege e dourado na mesma tela (`lv/shots/anuncios-m.png`). Nenhum anima. Não existe gesto de toque no app (nenhum `touchstart`/swipe).
- **O que fazer:** `ui.segmentado` com 2 variantes por significado: `abas` (navegam: pílula neutra) e `filtro` (mudam dados: `--c-prim-suave` + texto escuro, nunca cheio);
  indicador deslizante (translateX/width, 220 ms, `--e-out`), contador em `.dado`, roving tabindex, `role="tablist"`/`aria-selected`. `ui.toqueLongo` e
  `ui.deslizar` com limiar, resistência e respeito a `prefers-reduced-motion`. Estilos em `app.css`; as classes antigas ficam até C/D migrarem (M30/M40) e saem depois.
- **Aceite:** testes de DOM (setas trocam o item, Enter/Espaço ativa, `aria-selected` único); com `prefers-reduced-motion` o indicador não anima; `ui.deslizar` não dispara com rolagem vertical (teste com eventos sintéticos).
- **Arquivos:** `web/app/ui.js`, `web/app/app.css`, `testes/app.teste.mjs`.

### M06 · Carregar, falhar e voltar: esqueletos com a forma da tela e erro que se recupera sozinho
- **Lente:** Visual + Robustez. **Impacto:** médio. **Esforço:** médio. **Onda:** 1 (contrato) e 2.
- **Problema hoje:** o brilho `.sk` vai de `--c-sup-2` a `--c-sup-3` (≈ 1,1:1 no claro, invisível; `app.css:405-424`); o esqueleto é genérico (`ui.js:482-491`): Conversas
  sem título/abas, CRM sem cabeçalho nem KPIs, Anúncios com 4 cartões para uma tela de manchete + 8 KPIs (`lv/shots2/sk-*.png`). `ui.erroCartao` (`ui.js:495-505`)
  não reage à volta da rede e mostra texto técnico com URL ("Failed to fetch dynamically imported module: http://…", `ux/offline-390.png`).
- **O que fazer:** `ui.esqueleto(tipo)` com formas por tela que reutilizam as mesmas classes de grade do conteúdo real (troca sem deslocar); shimmer com faixa clara
  (`--c-sup` → branco 40 %) em 1,4 s, pulso de opacidade com movimento reduzido; `ui.trocarEsqueleto` com fade de 120 ms. `ui.erroCartao` escuta `orbita:online`
  e reexecuta; erros de transporte e de `import()` viram frase em português, sem URL.
- **Aceite:** teste de DOM para cada tipo; nenhum texto de erro com `http` ou `import`; QA com rede lenta (150 ms RTT, 4 Mbps): mudança de layout (CLS) ≤ 0,02 na troca em Início, Conversas, CRM e Anúncios depois de M30/M31/M40.
- **Arquivos:** `web/app/ui.js`, `web/app/app.css`, `testes/app.teste.mjs`.

### M07 · Desfazer como padrão: ação imediata, toast "Desfazer" e Ctrl/⌘+Z
- **Lente:** Interatividade. **Impacto:** alto. **Esforço:** pequeno (infra; o uso fica em M25 e M35). **Onda:** 1.
- **Problema hoje:** 35 chamadas a `ui.confirmar`, várias dizendo "Não dá para desfazer"; o toast já aceita "Desfazer" (`ui.js:140-163`) mas só dois lugares usam
  (`inicio.js:225`, `crm-tarefas.js:104`). Toasts não são anunciados a leitor de tela.
- **O que fazer:** `ui.acaoComDesfazer({texto, aplicar, reverter, ms})`: aplica com UI otimista, toast de 7 s com "Desfazer", Ctrl/⌘+Z (fora de campo de texto)
  desfaz o mais recente, fila de até 3; se `reverter` falhar, toast de erro com o estado real. Todo toast chama `ui.anunciar`.
- **Aceite:** testes de unidade (aplicar → reverter; Ctrl+Z dentro de `textarea` não dispara; fila de 3); `ui.confirmar` permanece para o irreversível.
- **Arquivos:** `web/app/ui.js`, `web/app/app.css`, `testes/app.teste.mjs`.

### M08 · Formulários que protegem o texto e validam enquanto a pessoa digita
- **Lente:** Interatividade. **Impacto:** alto. **Esforço:** médio. **Onda:** 1 (proteção) e 2 (validação).
- **Problema hoje:** `ui.modal` fecha por Esc, clique fora ou Voltar sem checar alterações (`fecharFora = true`, `ui.js:258,303-306`; só 2 de 42 modais desligam).
  Testado: título digitado em "Nova oportunidade" + Esc = perdido. Validação só no envio (`login.js:74-75`, `crm-negocio.js:632-639`); telefone e moeda sem máscara.
  No celular a gaveta do negócio foca o input do título (`ui.js:310,370 focarPrimeiro`) e o teclado sobe ao abrir (`lv/shots/negocio-m.png`).
- **O que fazer:** modal/gaveta comparam `ui.lerForm` da abertura com o atual; sujo → faixa "Descartar o que você digitou?" (Continuar editando / Descartar) no Esc,
  clique fora e Voltar. `ui.campo` ganha `validar` (blur e, depois do 1º erro, a cada tecla; ✓/! além da cor; `aria-invalid`), máscara de telefone BR que aceita +55 colado,
  máscara de moeda com cursor estável, contador perto do limite, medidor de senha. Em `pointer: coarse` o foco inicial vai para o contêiner do diálogo, não para um input.
- **Aceite:** testes de DOM (Esc com texto mantém aberto; sem texto fecha); máscaras com cursor estável em 10 casos; no celular `document.activeElement` ao abrir a gaveta é o diálogo.
- **Arquivos:** `web/app/ui.js`, `web/app/app.css`, `testes/app.teste.mjs`.

### M09 · Vazios com personalidade e com a próxima ação
- **Lente:** Visual + UX. **Impacto:** médio. **Esforço:** médio. **Onda:** 2.
- **Problema hoje:** `ui.vazio` (`ui.js:473-480`) é caixa tracejada com círculo + título + texto, em 35 pontos; 9 chamadas sem ícone herdam um "+". Agenda repete
  "Sem consultas ou bloqueios." em 4 cartões (`lv/shots/agenda-d.png`). O único vazio com identidade é o central do chat (`conversas.css:117`).
- **O que fazer:** `ui.vazio({tipo})`: `primeiro_uso` (órbita em SVG montada com `createElementNS` e tokens, satélites que acendem conforme os passos, 1 ação e a lista de passos),
  `em_dia` (selo ✓ na órbita + frase em `.narr`), `sem_resultado` (1 linha + "Limpar filtros"). Cada um aceita a ação seguinte (Conectar número, Convidar, Criar funil).
- **Aceite:** testes de DOM dos 3 tipos sem `innerHTML`; ícone padrão "+" removido.
- **Arquivos:** `web/app/ui.js`, `web/app/app.css`, `testes/app.teste.mjs`.

### M10 · Movimento com propósito: sai o enfeite, entra a resposta ao dado
- **Lente:** Visual + Desempenho. **Impacto:** médio. **Esforço:** pequeno. **Onda:** 2.
- **Problema hoje:** brilho que varre o botão primário (`app.css:184-188`), hover-lift em ícones e menu (`app.css:599,878-891`), aurora + pontos orbitais animados com
  `blur(74px)` em TODAS as telas (`app.css:843-860,1131-1169`) contra a ESPEC §7.5 (brilhos estáticos no app de trabalho). CDP 6 s parado no chat: TaskDuration
  0,34 s com aurora x 0,25 s sem (+36 %; +46 % na emulação de celular). O que muda para o usuário não anima (sino, valores, mensagem nova).
- **O que fazer:** remover sweep e hover-lift; palco animado só no Login e no Início (classe no `<body>` posta pelo shell) e pausado com `document.hidden`; estático no resto.
  Utilitários: `.entra` (translateY 6 px + fade 160 ms), `.assenta` (escala 1,015 → 1) e `G.destacar(el)` (flash de 600 ms em `--c-prim-suave`). Tudo sob `prefers-reduced-motion`.
- **Aceite:** sonda CDP de 6 s no chat com TaskDuration ≤ 0,26 s; nenhuma animação infinita fora de Login/Início; testes que travam a ausência do sweep.
- **Arquivos:** `web/app/app.css`, `web/app/graficos.js`, `testes/app.teste.mjs`.

---

## Frente B — Shell, conectividade e PWA

### M11 · Abrir em ~1,5 s em vez de ~3,5 s: carregamento em paralelo
- **Lente:** Conectividade. **Impacto:** alto. **Esforço:** pequeno. **Onda:** 1.
- **Problema hoje:** 11 saltos seriais: `index.html → antes.js/app.css → app.js → 7 módulos base → prontos.js → nx_marca_publica → nx_app_sessao → módulo → deps → RPC`.
  `index.html` não tem `modulepreload`; `app.js:66-67` só paraleliza os módulos base, `:80` espera `prontos.js` depois, `:107` espera a marca antes da sessão, `:468` só
  pede a sessão dentro de `aoMudarRota`. Medido (390 px, 150 ms RTT, 4 Mbps, sem cache, 3 rodadas): 3,0 s Início, 3,4 s Conversas, 3,7 s CRM. Protótipo com
  as mudanças (a)-(c) numa cópia: 1,55 / 1,6 / 1,55 s (`orbita-conect/perf.cjs`, `perf2.cjs`).
- **O que fazer:** (a) `<link rel="modulepreload">` para `app.js` e os 8 módulos base com o mesmo `?v=`; (b) `antes.js` lê o hash e injeta o preload do módulo da rota
  (tabela mínima de 8 rotas); (c) `carregarSessao()` começa junto com `carregarMarcaPublica()` e `prontos.js` entra no `Promise.all`; `aoMudarRota` consome a promessa.
  (O `Promise.all` interno do CRM fica com C em M30.)
- **Aceite:** script de medição em `testes/` (ou `scripts/`) com as mesmas condições: conteúdo real ≤ 1,8 s nas três telas; teste em `shell.teste.mjs` que confere o
  `modulepreload` com o mesmo `?v=` do `app.js`; preload que falha não quebra o boot.
- **Arquivos:** `web/app/index.html`, `web/app/antes.js`, `web/app/app.js`, `testes/shell.teste.mjs`.

### M12 · Service worker com cache seguro do shell e versão nova sem aba quebrada
- **Lente:** Conectividade (obrigatório: cache seguro do shell). **Impacto:** alto. **Esforço:** médio. **Onda:** 1.
- **Problema hoje:** 0 service workers e 0 caches (`orbita-conect/off.cjs`); recarregar sem internet mostra o dinossauro (`off-reload-1440.png`) e o único botão do erro
  offline é "Recarregar" (`off-agenda-390.png`). Produção serve tudo com `Cache-Control: public,max-age=0,must-revalidate` (inclusive woff2 de 130 KB; HEAD em
  `orbita-nexus-ads.netlify.app`): ~22 revalidações por abertura. A inbox fica aberta o dia todo (`index.html:78`) e o Netlify ignora a query: depois de um deploy,
  a aba antiga carrega `agenda.js` NOVO com `ui.js` ANTIGO na memória (`app.js:11,618-660`); não há checagem de versão.
- **O que fazer:** `web/app/sw.js`, escopo `/app/`, registrado depois do boot (só https/localhost). Navegação: rede primeiro com 3 s de prazo e cai no cache;
  GET do mesmo domínio com `?v=`: cache primeiro, chave = URL completa; `/fonts/*`: cache primeiro; **nunca** intercepta `*.supabase.co`. Pré-cache da lista
  `rotas.ARQUIVOS` + módulos base. Cache nomeado pela versão; versões antigas apagadas no `activate`. `web/app/versao.json` (sem cache) consultado ao voltar ao
  primeiro plano e a cada 10 min: diferente → faixa "Nova versão do Órbita pronta · Atualizar", aplicada sozinha após 2 min ociosa sem modal aberto, rascunho ou fila;
  falha de `import()` vira o mesmo aviso. `netlify.toml`: `sw.js` e `versao.json` sem cache; `/app/*.js` e `/app/*.css` `max-age=31536000, immutable`;
  `/fonts/*` 30 dias; `.webmanifest` com `application/manifest+json`. Documentar a "chave de emergência" (sw.js que se desregistra).
- **Aceite:** no dev-falso, 2ª abertura offline mostra o shell e a tela já visitada com o aviso de M14; `shell.teste.mjs` garante: todo `import()` e `carregarCss` com `?v=`,
  o `sw.js` não contém `supabase.co` em rota de cache, `versao.json` bate com o `?v=` do `index.html`; `curl -I` em produção (depois da publicação) com os cabeçalhos novos.
- **Arquivos:** NOVOS `web/app/sw.js`, `web/app/versao.json`; `web/app/app.js`, `web/app/index.html`, `netlify.toml`, `testes/shell.teste.mjs`.

### M13 · Instalável com a marca do cliente e com o produto certo
- **Lente:** Conectividade + Identidade. **Impacto:** alto. **Esforço:** médio. **Onda:** 2 (depois de M12).
- **Problema hoje:** em `/app/` (o que um domínio próprio abre) o manifesto tem `icons: []` e o Chrome reprova a instalação (`manifest-missing-suitable-icon`,
  `no-acceptable-icon`); nas entradas o app instala sempre como "Órbita CRM"/"Nexus Ads"/"Órbita Atendimento" com ícone de órbita, mesmo com logo e nome do cliente;
  `background_color`/`theme_color` fixos em `#07090C` com o app abrindo claro (`#FAFAF8`): a splash pisca preta. Sem `apple-touch-icon` e ícones só SVG.
  O login não sabe qual produto foi aberto (`lv/shots3/login-ads-m.png`).
- **O que fazer:** ícones PNG 192/512 + maskable em `web/app/icones/`; manifesto dinâmico montado após resolver a marca (nome do produto da org, cores do esquema,
  ícones rasterizados por canvas do logo/favicon) apontado por URL `blob:` (CSP `manifest-src 'self' blob:` no `index.html` e no `netlify.toml`, também nas entradas),
  com volta ao manifesto estático se falhar; `apple-touch-icon` 180 e metas `apple-mobile-web-app-*` dinâmicas; "Instalar o app" no menu da conta e na folha Mais
  (`beforeinstallprompt`; no iPhone, passo a passo "Compartilhar › Adicionar à Tela de Início"), escondido em `display-mode: standalone`. `antes.js` põe
  `data-produto` no `<html>` (usado por M04); login e pílula do topo mostram nome, ícone e uma frase do produto.
- **Aceite:** `Page.getInstallabilityErrors` vazio em `/app/`, `/crm/`, `/ads/`, `/atendimento/`; com marca simulada o manifesto traz o nome da org; splash na cor do esquema;
  0 violações de CSP.
- **Arquivos:** `web/app/manifest*.webmanifest`, NOVOS `web/app/icones/*.png`, `web/app/app.js`, `web/app/antes.js`, `web/app/login.js`, `web/app/index.html`,
  `web/crm/index.html`, `web/ads/index.html`, `web/atendimento/index.html`, `netlify.toml`, `web/app/shell.css`.

### M14 · Estado de conexão honesto e recuperação automática
- **Lente:** Conectividade. **Impacto:** alto. **Esforço:** médio. **Onda:** 1.
- **Problema hoje:** 15 s offline no CRM e nenhum aviso; o pulso para em silêncio (`pulso.js:34-36,66`); ao trocar de tela offline aparece "se tentou salvar ou enviar,
  confira o resultado" numa tela só de leitura (`api.js:30-31`); 14 s depois de reconectar o cartão de erro continua (`orbita-conect/off-voltou-390.png`).
- **O que fazer:** `web/app/rede.js` com estados `online | lento | offline | servidor_fora`, alimentado por `online/offline`, resultado de cada chamada de `api.js`,
  falhas do pulso e um ping barato quando `navigator.onLine` mente. Faixa fina em `aria-live` que empurra o conteúdo ("Sem conexão · dados de 14:02 · tentando em 8 s ·
  Tentar agora"), "Reconectado" por 2 s; ponto de estado junto ao sino. Ao reconectar dispara `orbita:online`, `pulso.agora()` e a releitura da tela visível
  (`ctx.rede.aoVoltar`). Mensagens por contexto: leitura offline = "Sem internet. Mostrando o que já tinha."; escrita offline = "Sem internet: nada foi salvo.";
  "confira antes de repetir" só para prazo estourado com requisição em voo. Estilos em `shell.css` com tokens.
- **Aceite:** no dev-falso com rede cortada: faixa em ≤ 2 s; ao voltar, a tela de erro se refaz sozinha em ≤ 3 s sem toque; `shell.teste.mjs` cobre a máquina de estados.
- **Arquivos:** NOVO `web/app/rede.js`, `web/app/api.js`, `web/app/pulso.js`, `web/app/app.js`, `web/app/shell.css`, `testes/shell.teste.mjs`.

### M15 · Leituras que insistem, escritas que não duplicam e boot que se recupera
- **Lente:** Robustez. **Impacto:** alto. **Esforço:** pequeno. **Onda:** 1.
- **Problema hoje:** `api.js` faz uma tentativa com prazo de 20 s (`:215,250-300`). Um 503 em `nx_app_sessao` deixa a tela em
  "Não deu certo agora (servico_indisponivel)" com 1 tentativa (`orbita-conect/boot-503-390.png`); "Tentar de novo" = `location.reload()` e "Sair" apaga o token
  mesmo em erro de rede (`app.js:62-64`); `http_503` vaza cru (`api.js:272`).
- **O que fazer:** classificar RPCs de leitura (sufixos `_listar/_ver/_base/_kanban/_coluna/_buscar`, `nx_pulso`, `nx_app_sessao`, `nx_marca_publica`, `nx_inicio`, `nx_rel_*`,
  `nx_agenda_dia/livres`, `nx_cv_*` de leitura, `nx_notificacoes_listar`) e repetir até 2 vezes em transporte/408/429/502/503/504 (400 ms e 1,2 s + jitter,
  respeita `Retry-After`, orçamento ~8 s; offline espera o `online`). Escritas nunca repetem sozinhas, exceto com `{req: true}`: o `api.js` gera um uuid por intenção
  e o envia como `p_req` (contrato usado por C em M25). Aos 4 s emite `lento` para M14. Boot com laço automático visível ("Tentando de novo em 4 s…", 2/4/8/16 s)
  que refaz só a etapa que falhou; "Sair" só em erro de conta/sessão; mensagens em português para `servico_indisponivel` e `http_429/500/502/503/504`.
- **Aceite:** testes com `fetch` simulado: leitura com 503+503+200 resolve; escrita com 503 falha sem repetir; `{req:true}` repete com o MESMO uuid; boot com 1 falha 503 abre sozinho.
- **Arquivos:** `web/app/api.js`, `web/app/app.js`, `testes/shell.teste.mjs`.

### M16 · Telas que abrem com o último dado (stale-while-revalidate)
- **Lente:** Conectividade. **Impacto:** alto. **Esforço:** médio (infra; o uso nas telas fica em M30, M31 e M40). **Onda:** 2.
- **Problema hoje:** nenhum dado de negócio fica no aparelho; cada clique mostra esqueleto e espera a rede; o boot espera `nx_app_sessao` (até ~50 KB) mesmo para quem abriu
  há 5 min (`app.js:466-468,640-650`); a base do CRM em memória some ao recarregar (`crm.js:15-16,29-40`). Offline não dá para ver a fila nem o kanban.
- **O que fazer:** `web/app/cache.js` (IndexedDB `orbita-cache`, chave `conta:cliente:rpc:hash(params)`, TTL 12 h, versionado) e `rpcC(nome, params, {cache, aoCache})`
  que entrega o local e depois o da rede. O shell (menu, empresa, marca) pinta do cache e revalida; `sessao_invalida` continua levando ao login (M17). Selo único
  "Mostrando dados de 14:02 · atualizando…" (componente do shell). Privacidade: nunca corpo de mensagem, configurações ou Admin; apaga tudo em `nx_sair`,
  queda de sessão e troca de conta; storage sempre em try/catch.
- **Aceite:** 2ª abertura com rede lenta pinta o shell em < 500 ms; teste de que `nx_sair` limpa o banco local; teste de lista negra de RPCs não cacheáveis.
- **Arquivos:** NOVO `web/app/cache.js`, `web/app/api.js`, `web/app/app.js`, `web/app/shell.css`, `testes/shell.teste.mjs`.

### M17 · Sessão que não derruba o trabalho e rascunhos que sobrevivem
- **Lente:** Robustez (obrigatório: sessão expirada sem perder o que foi digitado). **Impacto:** alto. **Esforço:** médio. **Onda:** 1.
- **Problema hoje:** a sessão dura 30 dias fixos e nada renova (`20260928c_plataforma.sql:527-528`; nenhum `update public.nx_sessoes`): quem usa todo dia cai no dia 30.
  `sessaoCaiu()` desmonta a tela, apaga o token e vai ao login (`app.js:318-331`); os rascunhos do chat vivem num `Map` (`conversas.js:54,603-604`) e morrem junto.
- **O que fazer:** migração aditiva: `nx_app_sessao` renova `expira_em` para now()+30 dias quando faltam < 20 (UPDATE condicional). Cliente: `sessao_invalida` não
  desmonta mais; abre por cima um modal "Sua sessão expirou. Entre para continuar" com o e-mail preenchido; ao entrar guarda o token, relê a sessão e repete as leituras
  que falharam (escritas aparecem como "não enviadas · tentar de novo"); checa validade ao voltar ao primeiro plano depois de muito tempo. `web/app/rascunho.js`:
  `ligar(campo, chave)` grava no localStorage (debounce 400 ms, TTL 7 dias, chave conta+cliente+objeto, teto ~200 KB, limpo no logout), restaura com o selo
  "Rascunho restaurado · descartar" e só apaga quando o servidor confirma o envio. Nunca guarda senha nem chave de API (campos `type=password` e marcados `data-segredo` ignorados).
- **Aceite:** SQL de teste em transação com ROLLBACK prova a renovação e que a sessão ociosa expira; no dev-falso, `sessao_invalida` simulada com texto num campo:
  modal abre, entrar devolve a mesma tela com o texto; `shell.teste.mjs` cobre TTL, teto e limpeza no logout.
- **Arquivos:** NOVO `supabase/migrations/20261002b_sessao_pulso_push.sql` (parte sessão), NOVO `web/app/rascunho.js`, `web/app/app.js`, `web/app/login.js`,
  `web/app/api.js`, `web/app/shell.css`, `scripts/dev-falso.mjs`, `testes/shell.teste.mjs`.

### M18 · Paleta de comandos Ctrl/⌘+K nos três produtos, atalhos e Ajuda
- **Lente:** Interatividade (obrigatório: paleta de comandos/atalhos). **Impacto:** alto. **Esforço:** médio. **Onda:** 2.
- **Problema hoje:** o Ctrl+K só busca contato/negócio/conversa e abre em branco ("Digite pelo menos 2 letras", `ux/busca-vazia-1440.png`); `buscaDisponivel()`
  exige workspace null ou "crm" (`app.js:951-954`): em `/atendimento/` e `/ads/` não há busca nem atalho (`ux/prod-atendimento-1440.png`). O topo do celular tem
  7 controles (`lv/shots/inicio-m.png`); a faixa "Teste grátis" ocupa uma linha inteira e não se dispensa (`app.js:1135-1160`). Não há Ajuda: o menu da conta tem
  só Perfil, Configurações e Sair (`app.js:862-868`).
- **O que fazer:** a busca vira paleta: vazio mostra "Recentes" (5 últimos abertos, localStorage por cliente) e "Ir para" (rotas do MENU filtradas por papel, plano,
  `prontos.js` e produto); ao digitar, "Ações" que casam sem acento (Nova oportunidade, Marcar consulta, Nova conversa, Nova tarefa, Alternar tema, Trocar empresa,
  Abrir outro produto, Instalar o app, Sair) e depois os grupos de `nx_buscar`; prefixos `>` (só ações) e `#` (protocolo); atalho exibido ao lado. As ações de
  módulo chegam por um registro (`ctx.comandos.registrar({id, rotulo, atalho, fazer})`) que C e D usam. Folha de atalhos por `?` fora de campo e item "Ajuda" no menu
  da conta (Primeiros passos, Atalhos, "Falar com o suporte" pelo `suporte_wa` com tela e empresa no texto). Topo do celular: tema vai para o menu da conta; a faixa
  de teste vira pílula de 28 px junto ao chip da empresa, dispensável por 24 h.
- **Aceite:** em `/crm/`, `/ads/`, `/atendimento/` o Ctrl+K abre a paleta; teclado completo (setas, Enter, Esc) e `role="combobox"`/`listbox`; topo do celular com
  ≤ 5 controles; teste de filtragem por papel e produto em `shell.teste.mjs`.
- **Arquivos:** `web/app/app.js`, `web/app/rotas.js`, `web/app/shell.css`, `testes/shell.teste.mjs`.

### M19 · Avisos em qualquer tela, selo no ícone e pulso mais barato
- **Lente:** Conectividade + UX. **Impacto:** alto. **Esforço:** médio. **Onda:** 2.
- **Problema hoje:** som e notificação só disparam dentro de Conversas (`conversas.js:216,265-284`); em Agenda/CRM/Início ninguém ouve nada. Sem `setAppBadge`.
  Com Conversas visível o app chama `nx_pulso` a cada 3 s para sempre (10 chamadas em 31 s) em cada aba, sem jitter; cada mudança dispara um `nx_cv_listar`
  extra só para o contador (`app.js:1192-1203`).
- **O que fazer:** motor de avisos no shell (assina o pulso; preferência som/tela do menu 🔔; nunca para o chat aberto e visível; toast clicável "Mariana: Tem algum
  horário…" com "Abrir"; regra "cliente esperando há mais de N min", N = 5/10/15 configurável). `navigator.setAppBadge(n)` e ponto no favicon. Pulso: ocioso 3 min → 15 s,
  15 min → 30 s, volta a 3 s na interação; aba líder por `navigator.locks` + `BroadcastChannel` (outra assume se fechar); jitter ±15 %; `nx_pulso` passa a devolver
  `nao_lidas` e o maior id de mensagem de entrada visível (migração aditiva, `create or replace`). D remove o motor duplicado de `conversas.js` em M40.
- **Aceite:** 31 s em Conversas com o mouse parado após 3 min: ≤ 3 chamadas; duas abas: só uma consulta o pulso; aviso tocado estando no CRM; testes do agendador em `shell.teste.mjs`;
  SQL de `nx_pulso` testado com ROLLBACK.
- **Arquivos:** `web/app/pulso.js`, `web/app/app.js`, `supabase/migrations/20261002b_sessao_pulso_push.sql` (parte pulso), `scripts/dev-falso.mjs`, `testes/shell.teste.mjs`.

### M20 · Notificação push com o app fechado
- **Lente:** Conectividade. **Impacto:** alto. **Esforço:** grande. **Onda:** 3 (depende de M12, M13 e M19).
- **Problema hoje:** com a tela do celular bloqueada os timers congelam e nada chega; no Android `new Notification()` não é permitido (o try/catch engole);
  0 ocorrências de push/vapid no repositório.
- **O que fazer:** no `sw.js`, handlers `push` e `notificationclick` (abre/foca `/app/?produto=atendimento#/conversas/<id>`, `tag` por conversa). Opt-in "Receber avisos
  neste aparelho" no menu de avisos, com explicação. Servidor: tabela `nx_push_subs` (RLS fechada), RPCs `nx_push_assinar/cancelar`, Edge Function `nx-push`
  (chaves VAPID só no Vault) chamada pelo webhook ao gravar mensagem de entrada (via `EdgeRuntime.waitUntil`) e pelos tipos `atribuida`, `tarefa`, `sla_etapa`,
  `lead_anuncio`. Payload mínimo sem dado sensível; endpoints 404/410 removidos. iPhone só com o app instalado (iOS 16.4+).
- **Aceite:** testes de função (`node --test`) com envio simulado; publicação só por tag `funcoes-*`; prova em aparelho Android real antes de ligar para clientes.
- **Arquivos:** `web/app/sw.js`, `web/app/app.js`, NOVO `supabase/functions/nx-push/`, `supabase/functions/_compartilhado/webhook.js`, `supabase/deploy-lista.txt`,
  `scripts/montar-funcoes.mjs`, `docs/orbita/DEPLOY-FUNCOES.md`, migração `20261002b_sessao_pulso_push.sql` (parte push).

### M21 · Ícones que dizem a coisa certa
- **Lente:** Visual. **Impacto:** médio. **Esforço:** pequeno. **Onda:** 2.
- **Problema hoje:** `i-anuncio` (`index.html:38`) é um alto-falante e aparece no menu, no selo Meta/Google do cartão e na origem do contato; `i-funil` (`index.html:33`)
  é o ícone de Pacientes/Orçamentos/Vendas em qualquer vertical; Meta e Google são só texto em contorno (`lv/shots/campanhas-d.png`).
- **O que fazer:** megafone/alvo no lugar do alto-falante; ícone do CRM por vertical via `vocab.js` (odonto: dente; oficina: chave; loja: sacola; genérico: funil);
  símbolos `i-meta` e `i-google` monocromáticos em `currentColor` (usados por C e D); revisar o sprite (traço 1,6, cantos 1,5 px) e 22 px na barra inferior.
- **Aceite:** teste que todo `ui.icone(nome)` usado no código existe no sprite; capturas do menu nas 3 verticais.
- **Arquivos:** `web/app/index.html`, `web/app/vocab.js`, `web/app/rotas.js`, `testes/shell.teste.mjs`.

### M22 · Acessibilidade de fluxo: pular por região, foco no título e anúncios de rota
- **Lente:** UX (acessibilidade). **Impacto:** médio. **Esforço:** pequeno. **Onda:** 2.
- **Problema hoje:** um só skip link; em Conversas o teclado passa por 9 itens de menu, 6 botões do topo e as abas antes do chat; ao trocar de rota o foco vai ao `<main>`
  sem nomear a página (`app.js:664-671`).
- **O que fazer:** skip links contextuais que aparecem ao focar ("Ir para a lista de conversas", "Ir para a conversa", "Ir para o campo de mensagem", "Ir para o quadro"),
  registrados pelo módulo ativo (`ctx.atalhosDeRegiao([...])`); ao navegar, foco no `<h1>` (tabindex −1) + `ui.anunciar("Pacientes, carregado")`; reforço de foco em `forced-colors` em `shell.css`.
- **Aceite:** teste de teclado no dev-falso: do topo até o compositor em ≤ 3 Tabs; checagem com axe (pacote local, sem CDN) nas 6 telas principais com 0 violações sérias.
- **Arquivos:** `web/app/index.html`, `web/app/app.js`, `web/app/shell.css`, `testes/shell.teste.mjs`.

---

## Frente C — CRM e Agenda

### M23 · Kanban no toque: arrastar com o dedo, "Mover para…" e o primeiro cartão na primeira tela
- **Lente:** Interatividade (obrigatório: Kanban arrastável no toque). **Impacto:** alto. **Esforço:** médio. **Onda:** 1.
- **Problema hoje:** `inicioPonteiro` ignora toque e telas ≤ 760 px (`crm-kanban.js:466,468`); a coluna vazia manda "Abra um cartão e escolha Mover para…" (`:194`).
  A 390 px o 1º cartão começa em y = 961 (≈ 790 sem a faixa demo) numa tela de 844, depois de cabeçalho (~400 px), busca + filtros (~190 px) e KPIs empilhados
  (`crm.css:495-504`; `ux/crm-390.png`, `lv/shots2/i-kanban-m.png`).
- **O que fazer:** (a) toque longo de 350 ms (com `navigator.vibrate(10)` quando existir) levanta o cartão e o arrasto segue com pointer capture, `touch-action` correto
  e a rolagem de borda que já existe; soltar chama o mesmo `soltar()`/`prepararMovimento` (pergunta valor, motivo ou data só quando preciso); (b) toque longo sem arrastar
  abre a folha "Mover para…" (etapas com cor, nome, contagem e atual marcada) — alternativa acessível; (c) em ≤ 760 px a fita de etapas fica fixa sob a busca e substitui
  a legenda de distribuição; KPIs viram uma linha "3 abertas · R$ 12.950 · previsão R$ 4.735" que expande ao toque; "Nova oportunidade" vira botão flutuante acima da barra
  inferior; funil e filtros numa linha.
- **Aceite:** emulação de toque (CDP `Input.dispatchTouchEvent`) move um cartão de coluna a 390 px; 1ª coluna do Kanban visível sem rolar a 390×844 (sem a faixa demo);
  rolagem vertical normal não inicia arrasto; teste em `crm.teste.mjs` da lógica de soltar por toque.
- **Arquivos:** `web/app/crm-kanban.js`, `web/app/crm.css`, `web/app/crm-logica.js`, `testes/crm.teste.mjs`.

### M24 · Cartão do Kanban em 3 linhas, gaveta leve e cadastro sem duplicado
- **Lente:** Visual + UX. **Impacto:** médio. **Esforço:** médio. **Onda:** 2 (usa M08, M21).
- **Problema hoje:** o cartão (`crm.css:115-153`) junta até 8 peças com textos de 10-11,5 px (`lv/shots/crm-d.png`); "hoje" em Plex compete com o valor. A seção "Dados"
  da gaveta empilha 6 campos em ≈ 560 px no celular. Em "Novo negócio" a prevenção de duplicado é a frase fixa "Se o telefone já estiver cadastrado, usamos o mesmo
  cadastro" (`crm-negocio.js:576`): a recepção só descobre depois.
- **O que fazer:** cartão em 3 linhas: título 15 px/600; valor em Clash 16 px + "contato · procedimento" 13 px; rodapé com tempo na etapa (âmbar após o SLA), ponto vermelho
  de tarefa atrasada e avatar do dono. Origem/campanha viram glifo `i-meta`/`i-google`; etiquetas como até 3 pontos de cor com nome no tooltip e na gaveta. Gaveta:
  título editável pelo lápis, "Dados" em grade de 2 colunas no celular (rótulo 12 px, 8 px de folga). Novo paciente e Nova oportunidade: com 10-11 dígitos chama
  `nx_contatos_listar` e mostra "Já existe: Mariana Costa, última conversa há 2 dias · Usar este cadastro"; telefone e valor com `ui.campo({validar})`.
- **Aceite:** nenhum texto < 12 px no cartão (sonda); "Dados" com 6 campos ≤ 300 px a 390; teste de duplicado em `crm.teste.mjs` com o dev-falso.
- **Arquivos:** `web/app/crm-kanban.js`, `web/app/crm-negocio.js`, `web/app/crm-listas.js`, `web/app/crm.css`, `testes/crm.teste.mjs`.

### M25 · Desfazer e "foi salvo ou não?" no CRM e na Agenda
- **Lente:** Interatividade + Robustez. **Impacto:** alto. **Esforço:** médio. **Onda:** 2 (usa M07 e o `{req:true}` de M15).
- **Problema hoje:** mover para Ganho/Perdido, etiquetar, excluir tarefa/nota (`crm-tarefas.js:92,180`) usam confirmação ou não têm volta (`crm-kanban.js:343-345`).
  Criação de oportunidade, tarefa, contato e consulta não tem chave de idempotência (`rodada-seguranca-estabilidade-20260930.md`); `nx_negocio_salvar` cria outro negócio
  a cada chamada (`20260928d_crm.sql:734+`). Se o prazo estoura depois de o servidor aplicar o movimento, o cartão volta à coluna antiga às cegas (`crm-kanban.js:347`).
- **O que fazer:** `ui.acaoComDesfazer` em mover etapa (inclusive ganho/perdido: reverte para a etapa anterior/reabre), etiquetas, excluir tarefa e nota (exclusão real
  adiada 7 s). `ui.confirmar` fica só para excluir negócio/contato (com "digitar excluir"). Migração aditiva com `p_req uuid default null` em `nx_negocio_salvar`
  (criação), `nx_contato_salvar`, `nx_tarefa_salvar`, `nx_agenda_marcar`: guarda `(cliente, p_req)` 24 h e devolve o mesmo resultado se repetir. No cliente, `rpcC(…, {req:true})`;
  em erro ambíguo o modal não fecha ("Conferindo se foi salvo…" → "Foi salvo" ou "Não foi salvo · Salvar de novo" com o mesmo `p_req`); no Kanban o cartão fica em
  "confirmando…" (borda tracejada) e consulta o servidor antes de reverter.
- **Aceite:** SQL de teste (ROLLBACK): duas chamadas com o mesmo `p_req` criam 1 registro; teste no `crm.teste.mjs` de prazo estourado após aplicação (cartão fica na coluna nova);
  desfazer ganho em ≤ 7 s volta à etapa anterior.
- **Arquivos:** `web/app/crm-kanban.js`, `web/app/crm-negocio.js`, `web/app/crm-tarefas.js`, `web/app/crm-listas.js`, `web/app/agenda.js`,
  NOVO `supabase/migrations/20261002c_crm_idempotencia_lote.sql`, `testes/crm.teste.mjs`.

### M26 · Agenda como grade de horário
- **Lente:** Visual + UX. **Impacto:** alto. **Esforço:** grande. **Onda:** 1.
- **Problema hoje:** a semana é 7 cartões de dia numa grade de 3 colunas, consultas em texto corrido (`agenda.js:50-96`); dia vazio ocupa um cartão inteiro; não há eixo
  de horas, linha de "agora", duração nem conflito (`lv/shots/agenda-d.png`); no celular uma consulta ocupa ≈ 420 px (`agenda-m.png`). "Tem horário livre quinta de manhã?"
  não se responde olhando.
- **O que fazer:** grade CSS com eixo 07-20 h (granularidade da config da agenda), colunas por dia (semana) ou por profissional (dia), blocos com altura = duração e cor
  = procedimento (tokens `--pal-*`), bloqueios hachurados, linha de "agora" no acento, toque no vazio abre "Marcar consulta" já com o horário. Celular: lista do dia com
  régua lateral de horas e faixa de dias rolável no topo; Remarcar/Desmarcar no ⋮. Dia livre vira linha de 40 px "Livre · Marcar". Dados de `nx_agenda_dia`, sem RPC nova.
- **Aceite:** a 1440 a semana inteira 08-18 h cabe sem rolar a página; consulta de 60 min tem o dobro da altura de uma de 30; sem rolagem horizontal a 390; testes de layout
  de sobreposição (duas consultas no mesmo horário lado a lado) em `crm.teste.mjs`.
- **Arquivos:** `web/app/agenda.js`, `web/app/agenda.css`, `testes/crm.teste.mjs`.

### M27 · Marcar consulta em 2 toques
- **Lente:** Interatividade. **Impacto:** alto. **Esforço:** médio. **Onda:** 2 (depois de M26).
- **Problema hoje:** digitar → "Buscar negócios" → escolher → "Ver horários livres" → escolher → confirmar (`agenda.js:195-198,250-284`); Enter não busca, escolher
  não carrega horários, horários numa lista plana de 14 dias; só há uma entrada na tela (`:74`; `ux/agenda-modal-1440.png`).
- **O que fazer:** busca com debounce enquanto digita; escolher o negócio chama `nx_agenda_livres` na hora e mostra chips por dia ("Hoje", "Amanhã", "Sex 03/10") com
  horários em pílulas e o primeiro já selecionado; atalhos "Primeiro livre" e "Amanhã de manhã"; "+" no cabeçalho de cada dia e toque na grade (M26) abrem já no dia/hora;
  vindo do negócio entra pré-selecionado. Confirmar → toast "Marcada para qui 02/10 10:00 · Desfazer" (`nx_agenda_desmarcar`). Ação "Marcar consulta" registrada na paleta (M18).
- **Aceite:** do negócio aberto até consulta marcada em 2 toques (teste de fluxo no dev-falso); desfazer remove a consulta.
- **Arquivos:** `web/app/agenda.js`, `web/app/agenda.css`, `web/app/crm-negocio.js`, `testes/crm.teste.mjs`.

### M28 · Listas do celular compactas, com Ligar/WhatsApp e deslizar para agir
- **Lente:** Interatividade. **Impacto:** médio. **Esforço:** médio. **Onda:** 2 (usa M05).
- **Problema hoje:** cada paciente vira cartão de 322 px com 7 rótulos (≈ 2 por tela, `ux/contatos-390.png`); ligar exige abrir a ficha; o cabeçalho gasta 3 linhas
  (Exportar, Importar, Novo) antes da busca; em Tarefas lápis e lixeira lado a lado (`ux/tarefas-390.png`).
- **O que fazer:** em ≤ 760 px linha de ~72 px (avatar, nome, "telefone · cidade", uma pílula de origem/etiqueta, botões `tel:` e "Abrir conversa"); toque abre a ficha.
  `ui.deslizar`: contato → Tarefa/Oportunidade; tarefa → concluir (direita) e adiar/excluir com Desfazer (esquerda); sempre com botão equivalente. Exportar/Importar no ⋮;
  "Novo paciente" flutuante; busca fixa ao rolar.
- **Aceite:** ≥ 6 pacientes na primeira tela a 390×844; deslizar e botão produzem o mesmo resultado (teste).
- **Arquivos:** `web/app/crm-listas.js`, `web/app/crm-tarefas.js`, `web/app/crm.css`, `testes/crm.teste.mjs`.

### M29 · Seleção múltipla e ações em lote
- **Lente:** Interatividade. **Impacto:** médio. **Esforço:** grande. **Onda:** 3.
- **Problema hoje:** nenhuma lista seleciona vários itens; `ui.tabela` já tem `selecao`/`selecionados()` (`ui.js:631-680`) sem uso; `nx_negocios_massa` (ESPEC §2.3, P1) não existe.
  Etiquetar 80 contatos importados = abrir 80 fichas.
- **O que fazer:** modo "Selecionar" (botão; Shift/Ctrl+clique no desktop; toque longo no celular) em Pacientes, Oportunidades e Tarefas; barra fixa "3 selecionados · Mover
  para… · Responsável… · Etiquetar… · Excluir", Esc sai; lotes de até 100 com progresso, relatório de falhas por item e Desfazer do lote. `nx_negocios_massa` conforme o
  contrato da ESPEC na migração de C; até ela existir, RPCs unitárias com no máximo 5 em paralelo. (O lote de conversas fica para depois.)
- **Aceite:** SQL de teste (ROLLBACK) da massa com isolamento por cliente; teste de fluxo de 10 itens com 1 falha mostrando o relatório.
- **Arquivos:** `web/app/crm-listas.js`, `web/app/crm-kanban.js`, `web/app/crm-tarefas.js`, `web/app/crm.css`, `supabase/migrations/20261002c_crm_idempotencia_lote.sql`, `testes/crm.teste.mjs`.

### M30 · CRM e Agenda no novo sistema visual, com último dado e rascunho
- **Lente:** Visual + Conectividade (adoção dos contratos). **Impacto:** alto. **Esforço:** médio. **Onda:** 2.
- **Problema hoje:** `crm.css` e `agenda.css` têm tamanhos literais e caixa-alta própria (`crm.css:13,108`); o eyebrow "CLÍNICA SORRISO VIVO" se repete acima de todo H1
  (`crm-kanban.js:100`, `crm-listas.js:46,507`, `crm-tarefas.js:279`); "10% DE CHANCE", "DISTRIBUIÇÃO POR ETAPA" em Plex; o esqueleto do CRM vem sem cabeçalho nem KPIs
  (`lv/shots2/sk-crm-m.png`); `crm.js:46-48` carrega lógica → base → kanban → negócio em fila; notas do negócio/contato se perdem ao recarregar.
- **O que fazer:** marcador `/* escala: tokens */` em `crm.css` e `agenda.css` e só tokens; `ui.cabecalho` em todas as telas de C, sem eyebrow da empresa; rótulos em
  `.rotulo`, dados em `.dado`; abas de funil e período em `ui.segmentado`; vazios por `ui.vazio` (Kanban "Arraste um cartão para cá" vira linha discreta); esqueleto
  `kanban` com KPIs e `lista`; `rpcC(…, {cache:true})` no kanban, `nx_crm_base` e agenda do dia; `crm-kanban`/`crm-negocio` importados junto com `nx_crm_base`
  (`Promise.all`); `ctx.rascunho.ligar` nas notas e no modal de nova oportunidade/tarefa; registrar ações na paleta (Nova oportunidade, Nova tarefa, Novo paciente);
  `.assenta` ao soltar o cartão (M10).
- **Aceite:** teste do marcador passa em `crm.css` e `agenda.css`; sonda: 0 textos < 12 px e nenhum `uppercase` fora de `.selo-caps` no CRM; CLS ≤ 0,02 na troca do
  esqueleto; CRM abre com o último kanban em < 500 ms na 2ª visita.
- **Arquivos:** `web/app/crm.css`, `web/app/agenda.css`, `web/app/crm.js`, `web/app/crm-kanban.js`, `web/app/crm-listas.js`, `web/app/crm-tarefas.js`,
  `web/app/crm-negocio.js`, `web/app/crm-config.js`, `web/app/agenda.js`, `web/app/agenda-config.js`, `testes/crm.teste.mjs`.

---

## Frente D — Conversas, Início, Anúncios/Relatórios, Automações, Configurações

### M31 · Início que diz o que importa agora (manchete editorial)
- **Lente:** Visual (tipografia + cor) + UX. **Impacto:** alto. **Esforço:** médio. **Onda:** 2 (usa M02, M06, M09, M16).
- **Problema hoje:** o Início abre com "Boa noite, Dra." e 4 cartões iguais de blocos cinza (`lv/shots/inicio-d.png`); os momentos fortes do app são exceções em Anúncios
  ("Os anúncios trouxeram 107 conversas…", `anuncios-d.png`) e no vazio do chat. Com rede lenta o Início fica 2,8 s em branco: o esqueleto é apagado antes de `nx_inicio`
  responder (`inicio.js:29,50`; `lv/shots2/sk-inicio-d.png`).
- **O que fazer:** manchete de 1-2 linhas derivada de `nx_inicio` no degrau display, números no acento e o verbo de ação em `.narr`: "2 clientes esperam resposta há 15 min.
  Hoje tem 1 consulta e R$ 5.200 em orçamento aberto." — cada trecho é link (conversas aguardando, agenda, CRM). Abaixo só os blocos com ação, em ordem de urgência
  (atendimento, tarefas atrasadas, vendas); o resto recolhido; saudação vira linha pequena; sem pendência, `ui.vazio({tipo:"em_dia"})` "Tudo em dia.". Esqueleto `inicio`
  até os dados chegarem; `rpcC` com cache; `G.destacar` quando um número muda no pulso. Lógica da frase em `rel-logica.js` (pura, testável).
- **Aceite:** testes da frase em `relatorios.teste.mjs` (0, 1 e muitos; singular/plural; sem dado de agenda); nunca tela vazia com rede lenta; manchete visível em y ≤ 300 a 390.
- **Arquivos:** `web/app/inicio.js`, `web/app/rel-logica.js`, `web/app/relatorios.css`, `testes/relatorios.teste.mjs`.

### M32 · Checklist "Deixe o Órbita pronto" no Início e pendências nas Configurações
- **Lente:** Interatividade/onboarding (obrigatório). **Impacto:** alto. **Esforço:** médio. **Onda:** 2.
- **Problema hoje:** o cartão "Primeiros passos" tem 3 passos estáticos e some assim que existe qualquer número, conversa ou lead (`rel-logica.js:441-445`, `inicio.js:92-109`),
  sem marcar o que foi feito. O que trava a operação (chave CodeWords, aparelho pareado, IA validada, horários, agenda, script de rastreio, anúncios) não é acompanhado;
  o menu de Configurações tem 18 seções sem indicador de pendência (`config.js:68-88`; "IA ainda não validada" só aparece dentro do cartão do número, `cv-config.js:184`).
- **O que fazer:** cartão com barra de progresso e itens na ordem recomendada: 1 chave CodeWords salva → 2 aparelho pareado → 3 recebimento conferido → 4 IA validada ou
  "receber direto" escolhido → 5 mensagem de teste enviada → 6 departamento com horário → 7 faixas da agenda → 8 script do site com último contato recebido →
  9 colega convidado → 10 funil ajustado → 11 anúncios ligados (opcional). Cada item: feito/pendente/opcional, "Fazer agora" abrindo a seção exata (passos 1-5 abrem o
  assistente M33). Estado por uma RPC só de leitura `nx_onboarding_estado()` (migração de D, aditiva, calcula de tabelas existentes; nunca lê segredo, só "existe/não existe").
  "Dispensar por 7 dias"; só admin vê; some a 100 %. Mesmo estado vira o ponto `nav-selo` nas seções do menu de Configurações. `ui.vazio({tipo:"primeiro_uso"})` com os satélites acendendo.
- **Aceite:** SQL de teste (ROLLBACK) com tenant novo (0/11) e tenant pronto (11/11); testes de mapeamento item → rota em `relatorios.teste.mjs`; no dev-falso, salvar a
  chave marca o passo 1 sem recarregar.
- **Arquivos:** `web/app/inicio.js`, `web/app/rel-logica.js`, `web/app/config.js`, `web/app/relatorios.css`,
  NOVO `supabase/migrations/20261002d_conversas_client_ref_onboarding.sql` (parte onboarding), `testes/relatorios.teste.mjs`.

### M33 · Assistente passo a passo para conectar o número (CodeWords e Meta)
- **Lente:** Interatividade. **Impacto:** alto. **Esforço:** médio. **Onda:** 2.
- **Problema hoje:** salvo o canal CodeWords, "Conectar e validar" mostra seis botões do mesmo peso (Atualizar situação, Conectar WhatsApp, Ligar o número na IA, Receber
  direto, Enviar teste, Copiar prompt; `cv-config.js:259-266`); estado desconhecido aparece como "Não sei" (`:153,186`); o formulário mistura chave, service ID,
  departamento, IA 24 h e um parágrafo denso (`ux/numeros-cw-1440.png`).
- **O que fazer:** stepper com um primário por vez: 1 Chave salva → 2 Parear o aparelho (código/QR) → 3 Conferir recebimento → 4 "IA atende" ou "Receber direto" (dois
  cartões grandes) → 5 Mensagem de teste (✓ enviada, ✓✓ entregue). Passos feitos com ✓ e "Refazer". Nos passos 2 e 3 consulta o estado a cada ~5 s ("Aguardando você ler o
  código no celular…"); "Não sei" vira "Aguardando confirmação"; ajuda de 2 linhas por passo ("Onde encontro a chave?"). Meta com os mesmos marcos (token, inscrever app,
  sincronizar modelos). As ações e RPCs atuais continuam; só a ordem e a hierarquia mudam. Título da seção via `ui.cabecalho` nível 2 (fim do H1 duplicado).
- **Aceite:** testes em `conversas.teste.mjs` da máquina de passos (estado do servidor → passo atual); no dev-falso um passo por vez, sem 6 primários simultâneos.
- **Arquivos:** `web/app/cv-config.js`, `web/app/conversas.css`, `testes/conversas.teste.mjs`.

### M34 · Chat: um botão primário por vez, cabeçalho de uma linha e avisos que não roubam a conversa
- **Lente:** Visual + UX. **Impacto:** alto. **Esforço:** médio. **Onda:** 1.
- **Problema hoje:** com IA ativa em canal CodeWords o cabeçalho tem "Assumir" e "Resolver" dourados (`cv-chat.js:177-181,187`) além de "Nova" e "Enviar": 4 primários
  (`lv/shots/chat-d.png`). No celular o cabeçalho ocupa 182 px e o aviso permanente "Este número CodeWords envia texto…" (`cv-composer.js:154`) mais 69 px: as mensagens
  ficam com 358 de 844 px (42 %, `chat-m.png`). Na lista, 7 abas em pílulas ocupam 3-4 linhas e selos são cortados ("Avali…", "Ap…"; `lv/shots5/t1024-chat.png`).
- **O que fazer:** um primário por estado: sem dono → "Assumir" primário e "Resolver" ícone neutro; minha → "Resolver" em contorno `--c-ok`; IA atendendo → "Assumir" e o resto no ⋮.
  Cabeçalho de 1 linha no celular (voltar, avatar, nome + subtítulo, ⋮); janela/dono/departamento numa pílula de status com detalhes no ⋮/ficha. O aviso de canal vira ⓘ ao
  lado do clipe e só aparece em faixa ao tocar em anexar. Abas em 1 linha (Minhas, Sem dono, Aguardando + "Mais ▾"); selo de etapa vira ponto de cor + nome no tooltip.
- **Aceite:** sonda: ≤ 1 `.bt-prim` visível no cabeçalho em cada estado; mensagens ≥ 60 % da altura a 390×844; nenhum selo cortado com reticências na lista a 1024.
- **Arquivos:** `web/app/cv-chat.js`, `web/app/cv-composer.js`, `web/app/cv-lista.js`, `web/app/conversas.css`, `testes/conversas.teste.mjs`.

### M35 · Central de conversas por teclado: "Atender o próximo" e Resolver que avança
- **Lente:** Interatividade (atalhos). **Impacto:** alto. **Esforço:** médio. **Onda:** 2 (usa M07, M18).
- **Problema hoje:** o composer pega o foco e qualquer tecla vira texto ("?" foi digitado, `ux/ajuda-tecla-1440.png`); não há próxima/anterior, assumir, resolver, nota
  ou transferir por teclado; Resolver deixa a conversa resolvida aberta e sem Desfazer (`conversas.js:704-708`); o vazio "2 clientes esperam resposta" só tem contadores
  (`cv-chat.js:73-95`). Cerca de 4 cliques por conversa. A lista não anuncia conversas novas a leitor de tela (só o chat tem `role="log"`).
- **O que fazer:** botão "Atender o próximo" (abre e assume a que espera há mais tempo) no vazio e no cabeçalho da lista. Acordes que funcionam dentro do campo:
  Alt+↓/Alt+↑ próxima/anterior, Alt+Shift+A assumir, Alt+Shift+R resolver, Alt+Shift+N nota interna, Alt+Shift+T transferir (Shift evita AltGr do teclado ABNT2);
  Esc no composer devolve o foco à lista (j/k mover, / buscar, ? ajuda). Preferência "Ao resolver, abrir a próxima" com `ui.acaoComDesfazer` "Resolvida · Desfazer".
  Atalhos registrados na folha e na paleta (M18). `aria-live="polite"` na lista ("Nova mensagem de Mariana, aguardando há 3 min"), no máximo 1 a cada 10 s.
- **Aceite:** testes de teclado em `conversas.teste.mjs`; fluxo de 3 conversas resolvidas sem mouse no dev-falso; desfazer reabre a resolvida.
- **Arquivos:** `web/app/conversas.js`, `web/app/cv-lista.js`, `web/app/cv-chat.js`, `web/app/cv-composer.js`, `web/app/conversas.css`, `testes/conversas.teste.mjs`.

### M36 · Nada se perde no chat: rascunho persistente, fila de saída e envio idempotente
- **Lente:** Robustez (obrigatório: sessão expirada sem perder o texto, parte do chat). **Impacto:** alto. **Esforço:** grande. **Onda:** 2 (usa M17).
- **Problema hoje:** rascunhos num `Map` em memória (`conversas.js:54,603-604`; `cv-composer.js:171,291,300`): recarregar, sessão caída ou o Chrome descartando a aba apagam a
  resposta. Com rede cortada antes do envio aparece "Status incerto: Pode ter saído, confira no WhatsApp" (`orbita-conect/off-envio-1440.png`) embora nada tenha saído.
  O cliente manda `client_ref` ao `nx-enviar` mas o servidor ignora (0 ocorrências em `supabase/functions`; `conversas-funcoes.teste.mjs:1147-1149` até proíbe).
- **O que fazer:** composer e notas internas por `ctx.rascunho.ligar` (por conversa) e "Rascunho:" em itálico na linha da lista. Servidor: migração aditiva com `client_ref text`
  + índice único parcial `(cliente_id, client_ref)` em `nx_mensagens`; `enviar.js` devolve a mensagem já gravada quando o `client_ref` repete (sem novo envio à Meta/CodeWords).
  Cliente: offline ou falha antes de conectar → fila em IndexedDB (conversa, texto, client_ref, criada_em); bolha "Na fila · envia quando a internet voltar" com Cancelar e
  Enviar agora; "Status incerto" só para prazo estourado com requisição em voo, e a repetição usa o MESMO `client_ref`. A fila esvazia em ordem no `orbita:online`, no 1º pulso
  bom e a cada 20 s com backoff; `fora_da_janela` vira "Não enviada" com o motivo. Mensagem nova entra com `.entra` (M10). Texto primeiro; mídia usa a mesma fila em M37.
- **Aceite:** `conversas-funcoes.teste.mjs` atualizado: o mesmo `client_ref` duas vezes → 1 mensagem e 1 chamada externa; SQL (ROLLBACK) do índice; no dev-falso: rede cortada,
  enviar, reconectar → 1 mensagem; recarregar com texto digitado → texto volta. Publicar `nx-enviar` só por tag `funcoes-*`.
- **Arquivos:** `web/app/conversas.js`, `web/app/cv-composer.js`, `web/app/cv-chat.js`, `web/app/cv-lista.js`, `web/app/cv-logica.js`, `web/app/conversas.css`,
  `supabase/functions/_compartilhado/enviar.js`, `supabase/migrations/20261002d_conversas_client_ref_onboarding.sql` (parte client_ref),
  `testes/conversas.teste.mjs`, `testes/conversas-funcoes.teste.mjs`.

### M37 · Fotos do celular sem rejeição: comprimir no aparelho e mostrar o progresso
- **Lente:** Conectividade + UX. **Impacto:** alto. **Esforço:** médio. **Onda:** 1.
- **Problema hoje:** limite de 5 MB para foto (`cv-logica.js:383`) e recusa "Arquivo grande demais: 7,2 MB" (`cv-composer.js:382`): foto de câmera de 12 MP tem 3 a 8 MB.
  O upload é `fetch` PUT sem progresso (`conversas.js:797-801`) e o balão só diz "enviando…" (`cv-chat.js:316`); se a rede cai, recomeça do zero.
- **O que fazer:** antes de validar, jpeg/png/webp (heic quando o navegador decodificar) passam por `createImageBitmap` + `canvas.toBlob`: lado maior 1600 px, JPEG 0,82
  (WebP onde houver), orientação EXIF corrigida (alvo 200-500 KB); miniatura e "foto otimizada de 7,2 MB para 380 KB" com "enviar original" quando couber. Upload por
  `XMLHttpRequest` com `upload.onprogress`: barra no balão ("62 %"), Cancelar e "Tentar de novo" que reaproveita o blob comprimido. Vídeo e documento: só o progresso.
  Só nos canais com mídia (WhatsApp Cloud API), como hoje.
- **Aceite:** testes de `cv-logica` (dimensões e decisão de compressão); no dev-falso, foto de 7 MB sai < 600 KB com barra de progresso.
- **Arquivos:** `web/app/cv-composer.js`, `web/app/cv-logica.js`, `web/app/conversas.js`, `web/app/cv-chat.js`, `web/app/conversas.css`, `testes/conversas.teste.mjs`.

### M38 · Números que cabem e moeda editorial em Relatórios, Anúncios e Início
- **Lente:** Visual (tipografia de número). **Impacto:** alto (defeito visível). **Esforço:** pequeno. **Onda:** 1.
- **Problema hoje:** `.rel-kpis-6` mantém 6 colunas acima de 1100 px (`relatorios.css:122,434`) e `.rel-kpi-v` é Clash 28-30 px (`:125`): a 1180 px "R$ 28.400" passa 50 px do
  cartão e é coberto pelo vizinho ("R$ 28.40", `lv/shots3/rel-1180.png`); sonda 1024-1280: +37 a +46 px em Relatórios, +5 a +23 px no Início. O QA anterior só mediu
  375/390/1440. "R$" tem o mesmo peso do valor.
- **O que fazer:** `container-type: inline-size` no cartão e `font-size: clamp(1.25rem, 11cqi, 1.9rem)`; `.rel-kpis-6` vira `auto-fit(minmax(9.5rem, 1fr))`; "R$" a 60 % e
  peso 500 colado ao valor, centavos a 60 % (`.num-moeda`, montado em `anuncios.js`/`relatorios.js`/`inicio.js` com `textContent`); `tabular-nums` e alinhamento à direita
  em toda coluna numérica (Campanhas e Relatórios).
- **Aceite:** teste em puppeteer (ou sonda no `relatorios.teste.mjs` com o dev-falso): nenhum `.rel-num` com `scrollWidth > clientWidth` em 768/1024/1180/1280/1440.
- **Arquivos:** `web/app/relatorios.css`, `web/app/anuncios.js`, `web/app/relatorios.js`, `web/app/inicio.js`, `testes/relatorios.teste.mjs`.

### M39 · Painéis no celular: a manchete na primeira tela e um Radar com gravidade
- **Lente:** Visual + UX. **Impacto:** médio. **Esforço:** médio. **Onda:** 2 (usa M04 e M05).
- **Problema hoje:** em Anúncios e Relatórios a 390 px o 1º número aparece em y ≈ 560 (558/566) depois de 4-5 linhas de controles (Atualizado + Atualizar, abas, período,
  plataforma/funil, data; `ux/anuncios-390.png`, `ux/relatorios_vendas-390.png`). No Radar todos os alertas têm a mesma bolinha dourada (`lv/shots/radar-m.png`,
  `relatorios.css:249-251`).
- **O que fazer:** um chip-resumo "Últimos 30 dias · Tudo ▾" abre uma folha com período e plataforma/funil; abas por `ui.segmentado({tipo:"abas"})` em 1 linha; "Atualizado há 27 min"
  vira texto pequeno com botão-ícone. Radar com 3 níveis (`--c-sev-info/aten/crit`): barra lateral de 3 px, ícone, rótulo e ordem por gravidade (a gravidade já vem do alerta;
  sem RPC nova). Mesma barra compacta em Relatórios.
- **Aceite:** manchete de Anúncios em y ≤ 300 a 390×844; alerta crítico sempre no topo do Radar; teste da ordenação em `relatorios.teste.mjs`.
- **Arquivos:** `web/app/anuncios.js`, `web/app/relatorios.js`, `web/app/relatorios.css`, `testes/relatorios.teste.mjs`.

### M40 · Conversas, Anúncios, Relatórios, Automações e Configurações no novo sistema visual
- **Lente:** Visual + Conectividade (adoção dos contratos). **Impacto:** alto. **Esforço:** médio. **Onda:** 2.
- **Problema hoje:** `relatorios.css` com 64 tamanhos literais; Anúncios com a Clash em 7 tamanhos; Conversas com H1 de 25 px; Configurações com 3 sistemas de título e
  um segundo H1 dentro da seção (`cv-config.js:29,556,684,975,1054`, `config.js:85-87`); eyebrows da empresa (`cv-config.js:30,557,685`, `inicio.js:~53`); esqueletos
  genéricos em Conversas e Anúncios (`lv/shots2/sk-conversas-d.png`, `sk-anuncios-d.png`); o motor de avisos de `conversas.js` fica duplicado depois de M19.
- **O que fazer:** marcador `/* escala: tokens */` e só tokens em `relatorios.css`, `conversas.css`, `automacoes.css`; `ui.cabecalho` em todas as telas de D; Configurações:
  H1 só da página, toda seção abre com `ui.cabecalho` nível 2 e, no celular, o título da seção substitui "Configurações" no topo da vista; rótulos `.rotulo`/`.dado`;
  segmentados (abas de Conversas, período/plataforma, Semana); vazios por `ui.vazio` ("Nada encontrado." vira `sem_resultado` com "Limpar filtros"); esqueletos `chat` e `ads`;
  `rpcC` com cache na 1ª página da lista de conversas (só nome, prévia de até 80 caracteres e contadores); `ctx.rascunho.ligar` na descrição do "Criar com IA" de Automações;
  remover `avisarNovidades` de `conversas.js` em favor do motor do shell (M19); registrar ações na paleta (Nova conversa, Atender o próximo).
- **Aceite:** teste do marcador passa nos três CSS; 1 só `h1` por tela em todas as rotas de D (teste de DOM); sonda 390/1440 sem texto < 12 px; CLS ≤ 0,02 na troca dos esqueletos.
- **Arquivos:** `web/app/relatorios.css`, `web/app/conversas.css`, `web/app/automacoes.css`, `web/app/conversas.js`, `web/app/cv-lista.js`, `web/app/cv-config.js`,
  `web/app/config.js`, `web/app/ads-config.js`, `web/app/rastreio-config.js`, `web/app/admin.js`, `web/app/automacoes.js`, `web/app/auto-*.js`, `web/app/anuncios.js`,
  `web/app/relatorios.js`, `web/app/inicio.js`, `testes/conversas.teste.mjs`, `testes/relatorios.teste.mjs`.

---

## Riscos e o que exige cuidado

1. **CSP sem script inline.** Nada de `<script>` inline nem atributos `on*=` (o `app.teste.mjs` trava). Toda mudança de CSP vale em DOIS lugares: `<meta>` do
   `index.html` e cabeçalhos do `netlify.toml` (`/app/*`, `/crm/*`, `/ads/*`, `/atendimento/*`). M13 precisa de `manifest-src 'self' blob:`; o `sw.js` é do mesmo
   domínio (`worker-src` herda `script-src 'self'`). Nenhum CDN novo (o axe de M22 roda só nos testes, a partir de `node_modules`).
2. **Sem `innerHTML` com dado.** Só constante (travado). O SVG da órbita (M09) é montado com `createElementNS`; manchetes (M31), toasts e paleta usam `textContent`.
3. **Módulos:** nenhum `import` estático; todo `import()` e `carregarCss` com `?v=`. `rede.js`, `cache.js` e `rascunho.js` entram pelo `arq()` do `app.js`. Não há build.
4. **Travas do `app.teste.mjs`:** nenhum hex fora de `:root`/`tema.js`; `[hidden]{display:none!important}`; nenhum `1fr` solto (use `minmax(0,1fr)`); contraste 4,5:1 em 4 marcas.
   O arquivo é da frente A; se uma mudança de B, C ou D esbarrar numa trava, a frente pede ajuste à A pela Ponte. Nenhuma trava pode ser afrouxada para passar.
5. **`?v=` e cache:** as frentes não mexem no `?v=`. O integrador faz um único bump em `index.html` (e em `versao.json`, M12) depois do merge das quatro. Com `immutable`
   em `/app/*.js`, uma aba antiga que pegou arquivo novo sob URL velha guarda isso até o bump seguinte: é exatamente o que M12 detecta e resolve com o aviso de versão.
6. **Service worker:** nunca cachear `*.supabase.co`, nunca `skipWaiting` sem o clique ou a regra de ociosidade; nome de cache por versão; ter a "chave de emergência"
   (sw que se desregistra) documentada antes de publicar. Testar em localhost (o SW exige https ou localhost).
7. **Dados no aparelho (LGPD):** cache e rascunhos com chave por conta+cliente, limpos em `nx_sair`, sessão caída e troca de conta; nunca corpo de mensagem no cache,
   nunca senha, chave de API ou `data-segredo` no rascunho; todo acesso a storage em try/catch (janela anônima e Safari).
8. **Banco:** migrações novas e ADITIVAS, idempotentes, uma por frente (`20261002b`, `20261002c`, `20261002d`; não reusar nome), testadas antes em transação com ROLLBACK,
   aplicadas só no projeto `dtjznipitihnwmcgpzqh`, com a trava da Ponte e com o ok do João para produção. Nada de `drop`, nada em `nx_config`. Só B mexe em `nx_pulso`.
9. **Funções:** `nx-enviar` (D, M36) e `nx-push` + webhook (B, M20) só se publicam por tag `funcoes-*`; VAPID só no Vault. Mexeu em `web/nucleo.js`? Ninguém deve
   (fora do escopo). Não publicar no dia 1º às 12:00 UTC (relatório mensal).
10. **Desfazer x automações:** mover para Ganho/Perdido dispara automações (`negocio_ganho`, `negocio_estagio`, mensagens). Desfazer reverte a etapa, mas não "desenvia"
    mensagem. M25 deve adiar a efetivação de ganho/perdido pelos 7 s do toast ou deixar claro no toast que automações já rodaram.
11. **Toque e rolagem:** o arrasto por toque (M23) e o deslizar (M28) não podem roubar a rolagem vertical; usar limiar e `touch-action` por eixo; testar em aparelho real
    antes de publicar (o QA anterior só fez emulação).
12. **Atalhos:** no teclado ABNT2 o AltGr equivale a Ctrl+Alt; por isso M35 usa Alt+Shift+letra. Nada de atalho de letra solta dentro de campo de texto.
13. **Painel clássico no ar:** `web/fonts/` e `web/*.js` fora de `web/app/` servem o Nexus Ads clássico no GitHub Pages. A frente A só ADICIONA arquivos em `web/fonts/`;
    ninguém toca em `web/painel.css`, `web/nucleo.js` ou `web/demo.js`.
14. **Desempenho do tema claro (M01):** sombras de duas camadas em listas longas (Kanban, lista de conversas) podem custar no celular; preferir borda + sombra só no cartão
    elevado e medir com o mesmo CDP de M10.
15. **dev-falso:** `scripts/dev-falso.mjs` é da frente B. C e D pedem por recado as respostas fictícias novas (`nx_onboarding_estado`, `p_req`, `client_ref`, `nao_lidas`).

## Integração

1. Cada frente trabalha numa worktree/branch própria a partir de `claude/automacoes-ia` (`claude/melhorias-a` … `-d`), pega a trava da Ponte só para o banco/publicação
   e escreve o estado em `docs/orbita/estado/MELHORIAS-<frente>.md`.
2. Ordem de merge: A (contratos primeiro, depois o resto) → B → C → D. Depois de cada merge: `node testes/rodar-tudo.mjs` verde (B registra `testes/shell.teste.mjs` no `rodar-tudo.mjs`).
3. No fim: bump único do `?v=` + `versao.json`; QA com puppeteer-core a 390×844, 768, 1024, 1180, 1280 e 1440×900 (claro, escuro e 3 marcas), rede lenta e offline;
   console limpo e 0 violações de CSP; só então merge na `main` e publicação pelo Netlify CLI (o site não está ligado ao repositório).
