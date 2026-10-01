# Frente B — Shell, conectividade e PWA (plano de 01/10/2026)

Plano: `docs/orbita/MELHORIAS-20261001.md` (frente B). Branch: `claude/automacoes-ia`. Nada foi publicado, mesclado ou aplicado no banco.
Testes da frente: `node testes/shell.teste.mjs` (registrado em `testes/rodar-tudo.mjs`) e `node --test testes/dev-falso.teste.mjs`.

## Situação

| Item | Estado | Commit |
|---|---|---|
| dev-falso para C e D (onboarding, p_req, client_ref, nao_lidas) | feito | ver `git log --grep "Órbita (B)"` |
| M11 abertura em paralelo | feito (Início 1,8 s; Conversas e CRM melhoram ~0,7 s, o resto é cadeia interna das telas) | ver `git log --grep "M11"` |
| M12 service worker + versão | feito (falta só o `curl -I` em produção, depois da publicação) | ver `git log --grep "M12"` |
| M14 estado de conexão | feito | ver `git log --grep "M14"` |
| M15 leituras que insistem, escritas que não duplicam, boot | feito | ver `git log --grep "M15"` |

## M11 · Abrir em ~1,5 s em vez de ~3,5 s

**Feito**
- `index.html`: `<link rel="modulepreload">` de `app.js`, `../dados.js`, dos módulos base (`api, ui, tema, vocab, rotas, pulso`) e `prontos.js`, todos com o mesmo `?v=` do `app.js`.
  O `antes.js` foi para o FIM do `<head>`: um script síncrono segura o que vem depois dele (medido no Chrome: os pedidos só saíam quando ele terminava), então
  os preloads precisam estar escritos antes dele. Efeito direto: os arquivos saem com o pedido do `antes.js`, não depois.
- `antes.js`: lê o hash e injeta o `modulepreload` da tela (8 telas: inicio, conversas, crm/contatos/empresas/tarefas, agenda, anuncios, automacoes, relatorios, config; sem sessão guardada ou rota pública: `login.js`).
  Usa o `?v=` do próprio script (`document.currentScript`); sem ele, ou com `?v=` fora do padrão, não faz nada. Tudo em try/catch: preload que falha não derruba o boot.
- `app.js`: `MODULOS_BASE` (lista única que o teste compara com o index.html); `prontos.js` entra junto dos módulos base; `lerSessao()` (só a chamada) sai ANTES de `await carregarMarcaPublica()`
  e o `aoMudarRota` consome a promessa (`E.sessaoPromessa`); `adotarSessao()` completa com as imagens da org. Promessa antecipada com `.catch` (sem “unhandled rejection”).
- `scripts/medir-abertura.mjs`: a medição do plano (390x844, 150 ms, 4 Mbps, sem cache, 3 rodadas, mediana por tela, limite 1,8 s). Roda o dev-falso numa porta livre.
  Precisa do Chrome e do `puppeteer-core` (`PUPPETEER_CORE=<pasta do pacote>`); `--raiz` mede outra cópia (usei para comparar com o HEAD de antes).
- `scripts/dev-falso.mjs`: texto sai comprimido (gzip), como no Netlify, e o `boot.js` do ambiente fictício entra no fim do `<head>` (antes estava no `<body>` e custava um salto serial a mais que a produção não tem).

**Medição (mesma máquina, mesmas condições, sem cache; mediana de 3 rodadas, em ms)**

| Tela | Antes (HEAD) | Depois | Meta |
|---|---|---|---|
| Início | 2573 | 1773 | ≤ 1800 |
| Conversas | 2807 | 2102 | ≤ 1800 |
| CRM | 3162 | 2382 | ≤ 1800 |

**Parcial (não depende da frente B)**: Conversas e CRM ficam acima de 1,8 s por cadeias DENTRO da própria tela, que o plano já separa:
- CRM: `crm.js → crm-logica.js → nx_crm_base → crm-kanban.js → crm-negocio.js → nx_negocios_kanban` em fila (C, M30: `Promise.all`).
- Conversas: sessão → `cv-*.js` → `nx_cv_base` → `nx_cv_listar` em fila (D, M40: pedir `nx_cv_base` e `nx_cv_listar` juntos e não esperar os módulos de apoio).
- Início: sessão → `rel-logica/graficos/relatorios.css` → `nx_inicio` (D, M31). Com a rede de produção (HTTP/2 + brotli) o ganho de (a)-(c) é maior que no dev-falso (HTTP/1.1, 6 conexões).

**Como verificar**: `PUPPETEER_CORE=<pasta> node scripts/medir-abertura.mjs` (e `--raiz <cópia do HEAD anterior>` para comparar); `node testes/shell.teste.mjs` (7 testes de M11).

## M12 · Service worker com cache seguro do shell e versão nova sem aba quebrada

**Feito**
- `web/app/sw.js` (escopo `/app/`): navegação com rede primeiro e prazo de 3 s, cai no `index.html` guardado (qualquer query); arquivo com `?v=` e `/fonts/*` = cache primeiro com a URL completa
  como chave; **nunca** intercepta outro domínio, outro método que não GET, `/__dev_falso/`, `versao.json`, `sw.js` nem arquivo sem `?v=`. Cache `orbita-shell-<v>` (a versão vem de `sw.js?v=`);
  `activate` apaga só as versões antigas do próprio prefixo e assume as abas; `skipWaiting` só pela mensagem `{tipo:"pular"}`. A instalação lê os arquivos do shell do próprio `index.html` do ar
  (nenhuma lista para esquecer); sem `app.js`, `app.css` ou `shell.css` a instalação falha e tenta de novo (nunca guarda um shell quebrado).
- `web/app/pwa.js` (carregado DEPOIS do boot, não é preload): registra `sw.js?v=<versão>` (`scope: "./"`, `updateViaCache: "none"`) só em https ou localhost (no dev-falso só com `?sw=1`; `?sw=0` desliga),
  manda ao worker as telas e os CSS ainda não abertos + tudo que a página já carregou (`precache`), confere `versao.json` ao voltar à aba, ao reconectar e a cada 10 min.
  Versão diferente → faixa `Nova versão do Órbita pronta · Atualizar` (em `#faixas-sistema`, empurra o conteúdo); aplicada sozinha depois de 2 min ocioso, SEM `dialog` aberto e sem trabalho pendente
  (`ctx.naoAtualizar(fn)`: o módulo devolve true enquanto tem rascunho/fila; o rascunho do M17 entra aqui) e com trava anti-laço (não recarrega por versão duas vezes em 60 s).
  Falha de `import()` de módulo vira a mesma faixa. Como a versão entra na URL do worker, quem instala o worker novo é a página nova (que já roda a versão nova e pede o `skipWaiting` sozinha, sem faixa);
  as outras abas veem o `controllerchange` e mostram a faixa.
- `web/app/versao.json` (`{"versao": "<v>", "sw": true}`), `web/app/shell.css` (novo, estilos do shell; só tokens), `#faixas-sistema` no `index.html`.
- `netlify.toml`: `/app/*.js` e `/app/*.css` com `max-age=31536000, immutable`; `/app/sw.js` e `/app/versao.json` `no-cache` (declarados DEPOIS do `*.js`: o específico por último); `/fonts/*` 30 dias; `.webmanifest` com `application/manifest+json`.
- `scripts/bump-versao.mjs <nova>`: o bump único do integrador (index.html, entradas e versao.json juntos).

**Chave de emergência (documentada também no cabeçalho do `sw.js`)**
1. Substituir `web/app/sw.js` por um arquivo que se desregistra (texto no cabeçalho do próprio `sw.js`; os testes executam esse texto) e publicar — o navegador confere o `sw.js` a cada abertura.
2. Antes disso, se as páginas ainda abrem: `versao.json` com `"sw": false` desregistra o worker, apaga os caches `orbita-*` e recarrega uma vez por aba.
Depois de resolver: voltar ao `sw.js` normal, `"sw": true` e subir o `?v=`.

**Como verificar**
- `node testes/shell.teste.mjs` (21 testes de M12: comportamento do sw.js num mundo de mentira, pwa.js, versao.json × index.html, cabeçalhos do netlify.toml).
- No dev-falso com `?sw=1` (Chrome): o worker instala e guarda ~36 arquivos; recarregar offline mostra o shell em vez do dinossauro; `/__dev_falso/simular/versao?v=X` + voltar à aba mostra a faixa.
  (Dado de negócio offline depende de M14/M16 — por ora o boot offline mostra a tela de erro de abertura.)
- Depois da publicação: `curl -I https://<site>/app/sw.js` (`no-cache`), `/app/app.js?v=…` (`immutable`), `/fonts/satoshi-variable.woff2` (30 dias), `/app/manifest.webmanifest` (`application/manifest+json`).
  Atenção: se o Netlify somar em vez de substituir o `Cache-Control` quando duas regras casam (`/app/*.js` e `/app/sw.js`), o `sw.js` não é afetado na prática (`updateViaCache: "none"` e a checagem do navegador ignoram o cache HTTP), mas confira.
- Nota de QA: o Cache Storage do Chrome no Windows falha ("Entry already exists") com perfil em caminho longo (como o do scratchpad). Os testes de navegador da frente B usam `--user-data-dir` curto (`C:/Temp/ob/<perfil>`).

## M14 · Estado de conexão honesto e recuperação automática

**Feito**
- `web/app/rede.js` (novo, módulo base com preload): estados `online | lento | offline | servidor_fora`. Alimentado por `online/offline` do navegador, pelo resultado de CADA chamada do `api.js`
  (`sucesso()`, `falha({codigo,status})`, `lento(±1)` aos 4 s) e por um ping barato à própria página (`versao.json`) quando `navigator.onLine` mente:
  página responde = internet existe e o servidor está fora; não responde = offline. Só 502/503/504, `servico_indisponivel`, `sem_conexao` e timeout (2 seguidos) contam como "fora";
  erro de regra de negócio, 4xx, 500 de função e 57014 provam que o servidor respondeu.
  Em offline/servidor fora tenta de novo sozinho (2-4-8-15-30 s; também ao abrir já offline) e no «Tentar agora»; ao voltar chama `aoVoltar`, dispara `orbita:online` (o `ui.erroCartao` da frente A refaz sozinho) e `orbita:rede`,
  e guarda "Reconectado" por 2 s.
- `api.js`: opções `rede` e `contexto` (ligadas pelo shell; sem elas o cliente se comporta como antes, os testes da frente A seguem verdes). Erros de conexão carregam `contexto.leitura`;
  mensagens por contexto: leitura offline = "Sem internet. Confira a conexão e tente de novo." (com dado já mostrado: "Sem internet. Mostrando o que já tinha."), escrita offline = "Sem internet: nada foi salvo.",
  "confira antes de repetir" só no prazo estourado de uma ESCRITA. Textos novos em português para `servico_indisponivel` e `http_429/500/502/503/504` (nada de código técnico na tela). `ehLeitura(nome)` exportado.
- `app.js`: faixa fina em `#faixas-sistema` ("Sem conexão · dados de 14:02 · tentando em 8 s · Tentar agora", `aria-live` só no texto que muda por estado; a contagem regressiva não é anunciada), "Reconectado" por 2 s,
  ponto de estado junto ao sino (e no rótulo acessível dele), `ctx.rede = { estado, aoVoltar(fn) }`, o pulso lê assim que a conexão volta. O erro de abertura de tela virou `ui.erroCartao` (frase sem URL e refaz sozinho).
- **Achado de QA:** o Chrome GUARDA a falha de um `import()` para aquela URL (mesmo com a rede de volta a mesma URL continua falhando). `arq()` agora conta as falhas e repete com `&r=<n>`;
  quando a falha é de uma DEPENDÊNCIA (importada dentro do módulo da tela), o «Tentar de novo» recarrega a página. Os módulos de C e D que fazem `import()` direto de dependências continuam sujeitos a isso (ver pendências).

**Como verificar**
- `node testes/shell.teste.mjs` (12 testes de M14: máquina de estados com relógio de mentira, backoff, api com fetch simulado, mensagens por contexto, `ehLeitura`).
- No dev-falso (Chrome, 390×844, CDP `Network.emulateNetworkConditions`): rede cortada → faixa em 9 ms (meta: ≤ 2 s); tela nova offline → cartão de erro em português; rede de volta → tela se refaz sozinha em 87 ms (meta: ≤ 3 s) e "Reconectado" some em 2 s;
  `/__dev_falso/simular/falha?rpc=nx_pulso&status=503&vezes=30` → "Servidor indisponível"; «Tentar agora» recupera em ~0,6 s.

## M15 · Leituras que insistem, escritas que não duplicam e boot que se recupera

**Feito**
- `api.js` (opção `retentar`, ligada pelo shell; sem ela o cliente é o de sempre): leituras (`ehLeitura`: sufixos `_listar/_ver/_base/_kanban/_coluna/_buscar`, `nx_pulso`, `nx_app_sessao`, `nx_marca_publica`, `nx_inicio`, `nx_rel_*`,
  `nx_agenda_dia/livres`, `nx_cv_*` de leitura, `nx_dados`…) repetem até 2 vezes em transporte/408/429/502/503/504 (400 ms e 1,2 s ±25 %, respeita `Retry-After`, orçamento ~8 s; **offline não gasta repetição**: quem cuida da volta é o `rede.js`).
  Escritas NUNCA repetem sozinhas, exceto com `{req: true}` (ou `{req: "<uuid>"}`, ou `p_req` já nos parâmetros): o `api.js` gera um uuid v4 por INTENÇÃO, manda como `p_req` e repete com o MESMO uuid; o erro final traz `e.req`
  para o «Salvar de novo». Erro de negócio, 4xx, 500 e sessão nunca repetem. O `rede.js` só recebe o resultado FINAL (503 + 200 não vira "servidor indisponível"); "lento" conta a chamada inteira (aos 4 s).
  Funções (`api.fn`) nunca repetem (envio é escrita; a idempotência do chat é o `client_ref` da frente D).
- Boot que se recupera (`app.js` + `rede.js: repetirAbertura/erroDeConta/ESPERAS_ABERTURA`): a etapa dos módulos e a da sessão repetem SOZINHAS (2, 4, 8, 16 s, depois de 16 em 16 s) mostrando
  "Servidor indisponível. Tentando de novo em 4 s…" (ou "Sem conexão.", "O servidor demorou a responder."), refazendo só a etapa que falhou; «Tentar agora» e a volta da internet pulam a espera; enquanto a nova tentativa está em voo a tela diz
  "Tentando de novo…". Depois de 8 (módulos) ou 12 (sessão) tentativas aparece o erro com «Tentar de novo» (recomeça o laço sem recarregar). **«Sair» só aparece em erro de conta/sessão** (`conta_pendente`, `conta_suspensa`, `sem_acesso`…):
  erro de rede nunca apaga o token. O `dados.js` ganhou a mesma memória de falhas de `import()` do `arq()` (`arqRaiz`).
- Mensagens em português para `servico_indisponivel` e `http_429/500/502/503/504` (feito em M14).

**Como verificar**
- `node testes/shell.teste.mjs` (9 testes de M15: 503+503+200 resolve; escrita 503 falha com 1 chamada; `{req:true}` repete com o mesmo uuid; Retry-After, orçamento e offline; resultado final ao rede.js; `sessao_invalida`; laço de abertura).
- No dev-falso (Chrome, 390×844) com falhas programadas (`/__dev_falso/simular/falha?rpc=nx_app_sessao&status=503&vezes=N`): 1 falha → abre em 0,5 s (2 chamadas); 7 falhas → mostra o laço e abre sozinho em 8 s;
  falha permanente → «Tentar agora» abre em 0,16 s depois de limpar a falha; sessão inválida na abertura → login sem laço.

## Pendências para outras frentes

- **C e D (M14):** o navegador guarda a falha de `import()` por URL. Se um módulo seu importa dependências com `import()` direto e a rede cair no meio, o cartão de erro precisa de recarga (o shell já faz isso quando a mensagem é de import). Para tentar de novo SEM recarregar, repetir com `&r=<n>` depois do `?v=` (a regra de `?v=` dos testes aceita).
- **C e D (M14):** use `ctx.rede.aoVoltar(fn)` para reler dados que ficaram na tela quando a conexão volta (o shell só refaz sozinho os cartões de erro).
- **C (M25) e D (M36):** escrita idempotente = `ctx.api.rpcC("nx_...", params, { req: true })` (o `api.js` manda `p_req` e repete com o mesmo uuid em transporte/408/429/50x); para o «Salvar de novo» depois de erro ambíguo, passe `{ req: erro.req }`. Só use `req` em função que aceite `p_req` (a migração de C); `p_req` num RPC que não o conhece dá 404 do PostgREST.
