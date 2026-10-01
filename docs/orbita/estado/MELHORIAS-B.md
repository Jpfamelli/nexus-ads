# Frente B — Shell, conectividade e PWA (plano de 01/10/2026)

Plano: `docs/orbita/MELHORIAS-20261001.md` (frente B). Follow-up R119 na branch `codex/orbita-r119`; nada desta branch foi publicado, mesclado ou aplicado no banco.
Testes da frente: `node testes/shell.teste.mjs` (registrado em `testes/rodar-tudo.mjs`) e `node --test testes/dev-falso.teste.mjs`.

## Situação

| Item | Estado | Commit |
|---|---|---|
| dev-falso para C e D (onboarding, p_req, client_ref, nao_lidas) | feito | ver `git log --grep "Órbita (B)"` |
| M11 abertura em paralelo | feito; mediana dev-falso a 390×844: Início 1.518 ms, Conversas 1.699 ms, CRM 1.393 ms (5 rodadas, 150 ms RTT, 4 Mbps, sem cache) | ver `git log --grep "M11"` e `scripts/medir-abertura.mjs` |
| M12 service worker + versão | feito (falta só o `curl -I` em produção, depois da publicação) | ver `git log --grep "M12"` |
| M14 estado de conexão | feito | ver `git log --grep "M14"` |
| M15 leituras que insistem, escritas que não duplicam, boot | feito | ver `git log --grep "M15"` |
| M17 sessão que não derruba o trabalho + rascunhos | feito (migração só no repositório; smoke 16 rodado no PGlite local) | ver `git log --grep "M17"` |
| M16 telas que abrem com o último dado (cache.js) | feito | ver `git log --grep "M16"` |
| M21 ícones que dizem a coisa certa | feito | ver `git log --grep "M21"` |
| M22 acessibilidade de fluxo | feito; R119 axe em 6 telas × desktop/celular: 12/12 sem violações | ver o registro R119 em `MELHORIAS-B/C/D.md` |
| M18 paleta, ações, recentes e ajuda | feito; shell registra ações e os três produtos usam Ctrl/⌘+K | ver `git log --grep "M18"` e `testes/shell.teste.mjs` |
| M13 instalável com a marca e o produto certo | feito (ícones PNG, manifesto dinâmico em blob:, `manifest-src 'self' blob:`, Instalar o app; falta testar num celular de verdade) | ver `git log --grep "M13"` |

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

## M17 · Sessão que não derruba o trabalho e rascunhos que sobrevivem

**Feito**
- **Servidor (não aplicado):** `supabase/migrations/20261002b_sessao_pulso_push.sql` (parte sessão) — `nx_app_sessao` renova `expira_em` para `now() + 30 dias` quando faltam menos de 20 (UPDATE condicional por `token_hash`,
  uma escrita a cada ~10 dias; só depois de `nx_conta_do_token` aceitar; sessão vencida/token inválido continuam levantando `sessao_invalida` sem ressuscitar). O corpo da função é idêntico ao de `20260928c_plataforma.sql`
  (conferido por diff: só 2 linhas novas). Smoke `supabase/testes/16_sessao_pulso_push.sql` (begin … rollback): 10 dias renova, 25 e 21 não, 19 renova, segunda abertura não reescreve, vencida não renova, token inexistente/nulo, outra conta não é tocada,
  sessão ociosa vence. **Rodado só no PGlite local** (`supabase/testes/rodar-local.mjs 16`, sem tocar o banco compartilhado): verde com a migração, vermelho sem ela. O ensaio no banco real (begin … rollback pelo MCP) fica para a publicação.
- **Sessão expirada (`app.js`):** `sessao_invalida` com a app aberta NÃO desmonta mais a tela nem apaga o token: abre por cima a janela «Sua sessão expirou» (e-mail preenchido, «Entrar» e «Sair»; Esc/Voltar reabrem, ela é obrigatória).
  As LEITURAS que falharam esperam (uma só janela para todas) e se repetem com o token novo; escritas falham na hora com «Sua sessão expirou. Entre para continuar; o que você digitou fica guardado.». Entrou com a mesma conta → toast
  «Sessão renovada» e a tela segue (texto digitado intacto). Entrou com OUTRA conta → apaga todos os rascunhos, volta a `#/` e recarrega. Na abertura (sem sessão na memória) o caminho antigo continua (login com o destino guardado).
  O pulso lê assim que a aba volta ao primeiro plano, então ficar horas fora também cai na janela.
- **`web/app/rascunho.js`** (novo, módulo base com preload) e `ctx.rascunho.ligar(campo, chave, {seloEm?})` / `ctx.rascunho.apagar(chave)`: localStorage `nx-rasc:<conta>:<empresa>:<chave>`, debounce de 400 ms, TTL 7 dias,
  teto de ~200 KB no total (o mais antigo sai) e ~100 KB por rascunho, restaura com o selo «Rascunho restaurado · descartar» (dispara um `input` no campo; digitar tira o selo), grava ao esconder a aba/`pagehide`, só apaga quando o módulo chama
  `apagar` (servidor confirmou) ou a pessoa descarta. **Nunca guarda** senha, `type=password/hidden/file…`, `autocomplete=*-password/one-time-code/cc-*`, nem campo/ancestral com `data-segredo`. Todo acesso ao storage em try/catch
  (sem storage vira no-op; cota cheia limpa o mais velho e tenta uma vez). Logout (`sair()`) apaga tudo; `apagarTudo()` também desliga os campos (um flush depois não ressuscita o que foi apagado). Rascunho mexido nos últimos 10 min segura a atualização automática (M12).
- `dev-falso`: `simular/sessao-invalida?outra=1` faz o próximo `nx_entrar` devolver token de OUTRA conta; o BOOT só põe o token se não houver (entrar de novo sobrevive ao recarregar).

**Como verificar**
- `node testes/shell.teste.mjs` (10 testes de M17: rascunho.js com storage/relógio/DOM de mentira, app.js, migração).
- `PGlite`: copiar `supabase/{migrations,testes}` para uma pasta com `@electric-sql/pglite` e `node supabase/testes/rodar-local.mjs 16` → `OK 16_sessao_pulso_push.sql`.
- No dev-falso (Chrome 390×844, um `textarea` ligado ao `rascunho.js` real): `simular/sessao-invalida` com a pessoa na mesma tela → a janela abre em ≤ 10 s (próxima leitura do pulso), o texto continua no campo; «Entrar» fecha a janela, toast de sessão renovada, o pulso volta com o token novo;
  recarregar → o texto volta com o selo; «descartar» limpa o campo e o armazenamento; entrar com outra conta apaga os rascunhos.

## M16 · Telas que abrem com o último dado (stale-while-revalidate)

**Feito**
- `web/app/cache.js` (novo, módulo base com preload): IndexedDB `orbita-cache` (loja `rpc`), TTL de 12 h, versão do formato, resposta > 1 MB não fica. **Lista branca** (`CACHEAVEIS`): `nx_app_sessao`, `nx_marca_publica`, `nx_inicio`, `nx_crm_base`,
  `nx_negocios_kanban/_coluna`, `nx_contatos_listar`, `nx_empresas_listar`, `nx_tarefas_listar`, `nx_agenda_dia`, `nx_rel_vendas`, `nx_rel_atendimento`, `nx_dados`, `nx_cv_listar`; mais um filtro de palavras (`PROIBIDO`: config, admin, senha, chave, token,
  convite, domínio, plano, usuário, mensagens, canais, integração, notificações, `cv_ver`, `cv_base`, buscar…) como defesa em profundidade. **Nunca** corpo de mensagem, configurações ou Admin. `nx_cv_listar` só guarda o que a lista mostra
  (nome, prévia de até 80 caracteres e contadores; sem `mensagens`). Chave = `conta:empresa:rpc:hash(parâmetros)` (token, `p_cliente` e `p_req` fora do hash): outra conta/empresa nunca lê. Sem IndexedDB (janela anônima, Safari) o cache vira só memória da aba.
- `api.js`: `rpcC/rpc/publica(nome, params, {cache: true, aoCache(dados, em)})` — a rede sai JÁ; o guardado chega antes por `aoCache` e a promessa devolve a rede (que também atualiza o cache sem atrasar a tela). Rede mais rápida que o cache nunca pinta o velho por cima do novo.
  Se a rede falha DEPOIS de pintar do cache, o erro sobe com `e.comCache = true` e a mensagem vira "Sem internet. Mostrando o que já tinha." (a tela deve manter o que mostra, não trocar por cartão de erro).
- `app.js`: **boot pelo cache** — com sessão guardada (IndexedDB + `nx-app-conta`) o shell (menu, empresa, marca) pinta na hora e a leitura de `nx_app_sessao` (já em voo) só confirma em segundo plano (`revalidarSessao`: se algo mudou, repinta;
  `sessao_invalida` abre a janela de login por cima do shell em cache). `trocar_senha` nunca abre pelo cache. **Selo único** em `#faixas-sistema`: «Mostrando dados de 14:02 · atualizando…» (e «· não foi possível atualizar» se a rede falhar; some quando a
  faixa de conexão assume); recomeça a cada tela; quando a conexão volta e a tela está com dado velho, o shell relê a tela. A faixa «Sem conexão» usa a hora do dado guardado ("dados de 14:02") quando ainda não houve chamada boa.
  **Privacidade:** `limparDadosDoAparelho()` (apaga o IndexedDB, `nx-app-conta` e a sessão guardada) em `sair()`, na queda de sessão da abertura e na troca de conta pela janela de sessão expirada.
- `rotas.esqueletoDaRota(modulo, partes)`: o esqueleto do shell enquanto o módulo carrega tem a forma da tela (`inicio`, `chat`, `kanban`, `lista`, `agenda`, `ads`, `tabela`) em vez de 4 cartões iguais.

**Medição (dev-falso, Chrome 390×844, rede lenta 150 ms/4 Mbps, SW ligado com `?sw=1`, 2ª abertura)**: shell visível em **472 ms** (meta < 500 ms) e conteúdo real do Início (já com o `{cache:true}` da frente D) em **685 ms** (antes: 2,4 s).
Reaberto SEM internet: shell + sessão + Início vêm do aparelho, faixa «Sem conexão · tentando em 4 s · Tentar agora» e o aviso "Sem internet. Mostrando o que já tinha.".

**Como verificar**
- `node testes/shell.teste.mjs` (9 testes de M16: lista negra/branca, chave, TTL, redutor de conversas, `limpar()` no logout, `api.js` com cache de mentira, app.js).
- IndexedDB real: no Chrome, `await import("./cache.js?v=…")` + `api.js` com `cache` → 2ª chamada devolve `aoCache` antes da rede (conferido nesta rodada).

## M21 · Ícones que dizem a coisa certa

**Feito**
- `index.html` (sprite): `i-anuncio` deixou de ser um alto-falante e virou **megafone** (cone que alarga, cabo e ondas) — aparece no menu, nos selos de origem e nas listas; novos `i-dente`, `i-chave`, `i-sacola`
  (CRM por vertical) e `i-meta`, `i-google` (monocromáticos, só `currentColor`, para C e D usarem nos selos de origem/campanha).
- **Achado:** seis ícones que as telas de Conversas já pediam NÃO existiam no sprite (apareciam em branco): `i-reabrir`, `i-transferir`, `i-lateral`, `i-baixar`, `i-modelo`, `i-responder`. Foram desenhados no mesmo estilo (24×24, traço).
- `vocab.js`: `ICONE_CRM` e `v.icone_crm` por vertical (odonto = dente, oficina = chave, loja = sacola, genérico = funil); `app.js` troca só o ícone do item CRM do menu e da barra inferior (o seletor «Seus produtos» continua com o funil: ali é o produto, não a vertical).
- `scripts/dev-falso.mjs`: `/__dev_falso/simular/vertical?v=oficina|loja|generico|odonto` para ver o menu em cada vertical.

**Como verificar**: `node testes/shell.teste.mjs` (3 testes: todo ícone usado no código existe no sprite — a regra pega qualquer `ui.icone("x")`/`icone: "x"`/`#i-x` novo sem símbolo; megafone e marcas sem cor fixa; vocab × menu).
Capturas conferidas no Chrome (menu lateral a 1440 e barra inferior a 390, nas 4 verticais): dente em Pacientes, chave em Orçamentos, sacola em Vendas, funil no genérico, megafone em Anúncios.

**Para a frente A (app.css):** o plano pede traço de 1,6 e 22 px na barra inferior; hoje `.ic` tem `stroke-width: 1.7` e 18 px (arquivo da A). Os símbolos novos foram feitos para o traço atual.

## M22 · Acessibilidade de fluxo

**Feito**
- **Atalhos «Ir para…» ao receber o foco** (`#pular-regioes` no `index.html`, ANTES do «Pular para o conteúdo», que continua lá): `ctx.atalhosDeRegiao([{rotulo, alvo: Element | seletor | () => Element}])` para o módulo registrar os seus;
  sem chamar, valem as regiões padrão da rota em `rotas.REGIOES_DA_ROTA`: Conversas = «Ir para a lista de conversas», «Ir para a conversa», «Ir para o campo de mensagem» (nessa ordem); CRM = «Ir para o quadro».
  Os seletores usam o **rótulo acessível** (`aria-label`), não classe de CSS; um teste confere que Conversas e o CRM ainda têm esses rótulos. O alvo é resolvido na hora (conversa ainda não aberta = atalho escondido) e acompanha a tela (MutationObserver com `requestAnimationFrame`).
- **Foco no `<h1>` depois de navegar** (`focarTitulo`): o título da nova tela recebe `tabindex="-1"` e o foco, o leitor de tela ouve «Pacientes, carregado» (`ui.anunciar`); se o `<h1>` ainda não existe espera até 3 s; sem `<h1>` cai para o `<main>`. Navegação mais nova cancela a anterior. Só em navegação feita pela pessoa (não na primeira abertura).
- **`forced-colors`** em `shell.css`: foco com `Highlight`, faixas e pontos de estado com borda `CanvasText` (nunca só cor de fundo).
- `scripts/auditar-a11y.mjs`: axe-core nas telas principais a 1440 e 390 (precisa de `puppeteer-core` e `axe-core` fora do repositório: `PUPPETEER_CORE=… AXE_CORE=… node scripts/auditar-a11y.mjs [--telas …] [--moderadas]`; axe só entra nos testes, nada vai para o app).

**Verificado no Chrome (dev-falso)**: abertura limpa em `#/conversas/901`, do topo da página: Tab 1 «Ir para a lista de conversas» → Tab 2 «Ir para a conversa» → Tab 3 «Ir para o campo de mensagem» (+ Enter = foco no `textarea` «Mensagem»;
**3 Tabs**, meta ≤ 3) → Tab 4 «Pular para o conteúdo». Início → Pacientes pelo menu com o teclado: foco em `H1 «Pacientes»`, anúncio «Pacientes, carregado», atalhos trocam para «Ir para o quadro».
**Snapshot pré-R119 (histórico):** o shell não tinha violações, mas restavam achados em Conversas, CRM e Relatórios. A auditoria foi repetida após as correções R119 e agora passa em 6 telas × 2 larguras: 12/12, sem violações em nenhum nível; detalhes e regressões em `MELHORIAS-C.md` e `MELHORIAS-D.md`.

**Como verificar**: `node testes/shell.teste.mjs` (4 testes de M22) e `node scripts/auditar-a11y.mjs`.

## M13 · Instalável de verdade, com a marca do cliente e o produto certo

**O que existia**: o manifesto do `/app/` tinha só um ícone SVG (o Chrome reprova `icons` sem PNG 192/512), nenhum `apple-touch-icon`, e o app instalado vinha sempre com o nome "Órbita" e a cor escura, mesmo para uma org com marca própria.

**O que mudou** (arquivos de B: `web/app/{pwa.js,app.js,antes.js,index.html,login.js,rotas.js,shell.css,manifest.webmanifest,icones/*}`, `netlify.toml`, `scripts/{gerar-icones.mjs,dev-falso.mjs}`):

- Ícones PNG empacotados em `web/app/icones/` (192, 512, 512 maskable com zona segura, `apple-touch-icon` 180), gerados por `node scripts/gerar-icones.mjs` (sem dependência: PNG escrito à mão). `manifest.webmanifest` os lista; `index.html` ganhou `apple-touch-icon` e as metas `mobile-web-app-capable`/`apple-mobile-web-app-*`.
- Manifesto dinâmico: depois de resolver a marca, o `app.js` monta o manifesto (`pwa.construirManifesto`) com o nome do produto da org + a área aberta (`rotas.nomeDoApp`: "Conecta Atendimento", "Órbita CRM", "Nexus Ads · Órbita"), `start_url`/`id` do produto (`?produto=` + rota inicial), `theme_color`/`background_color` = fundo do esquema atual (a splash abre clara com o app claro) e os ícones rasterizados do logo do cliente em canvas (`pwa.rasterizarIcones`). Vai para o `<link rel="manifest">` como `blob:` (revoga o anterior). Qualquer falha (logo sem CORS, canvas contaminado, `createObjectURL`) volta ao manifesto estático do produto e aos PNG empacotados. Várias pinturas seguidas viram uma montagem só (350 ms; montagem antiga não sobrescreve a nova).
- CSP: `manifest-src 'self' blob:` na `<meta>` do `index.html` e no cabeçalho `/app/*` do `netlify.toml` (mesmo texto nos dois). As entradas `/crm/`, `/ads/`, `/atendimento/` seguem sem a diretiva (só redirecionam, não têm manifesto).
- `antes.js` põe `data-produto` no `<html>` antes da primeira pintura (acento do produto não pisca). O login mostra o produto aberto (ícone + nome + frase). A pílula do topo usa o ícone do produto (o CRM acompanha a vertical da empresa).
- "Instalar o app": evento `beforeinstallprompt` guardado cedo (e o aviso automático do Chrome escondido); item no menu da conta e na folha "Mais"; no iPhone/iPad (sem evento) abre um passo a passo; some quando já está em modo standalone.
- Marca pública que chega DEPOIS da sessão guardada (boot pelo cache, M16) repinta o shell e refaz o manifesto.
- dev-falso: `/__dev_falso/simular/marca?produto=Conecta&logo=1` (e sem parâmetros para zerar) para ver o manifesto white-label.

**Verificação**: `testes/shell.teste.mjs` (84 verdes, 9 deles do M13). No Chrome real (puppeteer-core): `Page.getInstallabilityErrors` = `[]` em `/app/`, `/crm/`, `/ads/` e `/atendimento/`; manifesto lido pelo CDP (`Page.getAppManifest`) com nome/curto/start/cores/ícones corretos, inclusive white-label com logo; `apple-touch-icon` com o logo após a repintura tardia; 0 violações de CSP; "Instalar o app" chama `prompt()`; login do Nexus Ads mostra "Conecta Anúncios · Campanhas, origem dos leads e retorno.".

**Não coberto**: instalar de fato num Android/iPhone (só o navegador desktop foi usado; o passo a passo do iOS é texto e não foi visto num Safari real) e a rasterização de logo `https:` de outro domínio sem CORS (cai nos PNG empacotados, é o esperado).

## Pendências para outras frentes

- **C e D (M14):** o navegador guarda a falha de `import()` por URL. Se um módulo seu importa dependências com `import()` direto e a rede cair no meio, o cartão de erro precisa de recarga (o shell já faz isso quando a mensagem é de import). Para tentar de novo SEM recarregar, repetir com `&r=<n>` depois do `?v=` (a regra de `?v=` dos testes aceita).
- **C e D (M14):** use `ctx.rede.aoVoltar(fn)` para reler dados que ficaram na tela quando a conexão volta (o shell só refaz sozinho os cartões de erro).
- **C (M25) e D (M36):** escrita idempotente = `ctx.api.rpcC("nx_...", params, { req: true })` (o `api.js` manda `p_req` e repete com o mesmo uuid em transporte/408/429/50x); para o «Salvar de novo» depois de erro ambíguo, passe `{ req: erro.req }`. Só use `req` em função que aceite `p_req` (a migração de C); `p_req` num RPC que não o conhece dá 404 do PostgREST.
- **C e D (M30/M36/M40), integrado em R119:** `ctx.rascunho` oferece `ligar/apagar/existe/texto`; CRM salva rascunhos dos formulários suportados e Conversas persiste texto/notas por conversa. O apagamento continua condicionado à confirmação de envio. A fila IndexedDB e sua política de saída no logout ficam documentadas como limitação em `MELHORIAS-D.md`.
- **D (M36):** a janela de sessão expirada espera as LEITURAS e repete com o token novo; escritas falham na hora (o erro tem `codigo: "sessao_invalida"`): mostre «não enviada · tentar de novo» em vez de descartar o texto.
- **Integração/publicação:** aplicar `supabase/migrations/20261002b_sessao_pulso_push.sql` só com o ok do dono (ensaio em begin … rollback pelo MCP com `supabase/testes/16_sessao_pulso_push.sql` antes); ela vem ANTES de 20261002c/d na ordem de nome.
- **C e D (M16):** quem usa `{cache: true, aoCache}` precisa tratar `e.comCache` (rede falhou DEPOIS de pintar do cache): mantenha a tela e mostre só um aviso (a mensagem do erro já é "Sem internet. Mostrando o que já tinha."), não troque por cartão de erro. A frente D já faz isso no Início; confira CRM (kanban, `nx_crm_base`, agenda) e a 1ª página de `nx_cv_listar`. Só estas RPCs ficam no aparelho (`CACHEAVEIS` em `web/app/cache.js`): se uma tela precisar de outra, peça a inclusão a B (não vale pôr nome com config/admin/mensagens/usuários).
- **A (M21):** `app.css` `.ic` está com `stroke-width: 1.7` e 18 px; o plano pede 1,6 e 22 px na barra inferior (`.barra-b .ic`). Os símbolos novos funcionam nos dois.
- **C e D (M21):** `i-meta` e `i-google` estão no sprite (use `ui.icone("meta")`/`ui.icone("google")` nos selos de origem). Qualquer ícone novo precisa de um `<symbol id="i-…">` em `web/app/index.html` (arquivo de B): o teste `todo ícone usado no código existe no sprite` falha se faltar.
- **D (M22/M40), resolvido em R119:** removido `aria-expanded` inválido do textarea; adicionadas regiões nomeadas e focalizáveis às tabelas roláveis; listas de Kanban agora mantêm filhos `listitem` inclusive nos estados vazios e na ação «Ver mais». Axe reexecutado em 6 telas × 2 viewports: 12/12, zero violações em todos os níveis.
- **C e D (M22):** o shell já mostra «Ir para a lista de conversas / a conversa / o campo de mensagem» e «Ir para o quadro» pelos `aria-label` que as telas têm (um teste confere); se mudarem esses rótulos, registrem os seus com `ctx.atalhosDeRegiao([{rotulo, alvo}])`. Cada tela precisa de UM `<h1>`: o shell move o foco para ele depois de navegar e anuncia «<título>, carregado».
- A (testes/app.teste.mjs, ~linha 1213): o teste do netlify.toml compara o cabeçalho `/app/*` com a CSP antiga exata e falha. A CSP nova (M13) é: `default-src 'self'; script-src 'self'; style-src 'self' 'unsafe-inline'; img-src 'self' data: blob: https:; media-src 'self' blob: https://dtjznipitihnwmcgpzqh.supabase.co; connect-src 'self' https://dtjznipitihnwmcgpzqh.supabase.co; font-src 'self'; manifest-src 'self' blob:; frame-ancestors 'none'; base-uri 'self'; form-action 'self'` (só ganhou `manifest-src 'self' blob:` depois de `font-src 'self';`). O mesmo texto está na `<meta>` do index.html (sem frame-ancestors).
- A (manifestos de produto): `manifest-crm/ads/atendimento.webmanifest` ficaram com o ícone SVG único (o teste de A exige `icons.length === 1`). Eles já são instaláveis (installabilityErrors = [] verificado); quando o `/app/` abre, o manifesto dinâmico em blob: os substitui por um com PNG e a marca do cliente. Se A quiser PNG também nos estáticos, é só acrescentar `icones/*.png` e relaxar o teste.
