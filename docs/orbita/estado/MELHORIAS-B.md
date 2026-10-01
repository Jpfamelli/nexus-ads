# Frente B — Shell, conectividade e PWA (plano de 01/10/2026)

Plano: `docs/orbita/MELHORIAS-20261001.md` (frente B). Branch: `claude/automacoes-ia`. Nada foi publicado, mesclado ou aplicado no banco.
Testes da frente: `node testes/shell.teste.mjs` (registrado em `testes/rodar-tudo.mjs`) e `node --test testes/dev-falso.teste.mjs`.

## Situação

| Item | Estado | Commit |
|---|---|---|
| dev-falso para C e D (onboarding, p_req, client_ref, nao_lidas) | feito | ver `git log --grep "Órbita (B)"` |
| M11 abertura em paralelo | feito (Início 1,8 s; Conversas e CRM melhoram ~0,7 s, o resto é cadeia interna das telas) | ver `git log --grep "M11"` |
| M12 service worker + versão | feito (falta só o `curl -I` em produção, depois da publicação) | ver `git log --grep "M12"` |

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

## Pendências para outras frentes
- (preenchido ao longo do trabalho)
