# Frente B — Shell, conectividade e PWA (plano de 01/10/2026)

Plano: `docs/orbita/MELHORIAS-20261001.md` (frente B). Branch: `claude/automacoes-ia`. Nada foi publicado, mesclado ou aplicado no banco.
Testes da frente: `node testes/shell.teste.mjs` (registrado em `testes/rodar-tudo.mjs`) e `node --test testes/dev-falso.teste.mjs`.

## Situação

| Item | Estado | Commit |
|---|---|---|
| dev-falso para C e D (onboarding, p_req, client_ref, nao_lidas) | feito | ver `git log --grep "Órbita (B)"` |
| M11 abertura em paralelo | feito (Início 1,8 s; Conversas e CRM melhoram ~0,7 s, o resto é cadeia interna das telas) | |

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

## Pendências para outras frentes
- (preenchido ao longo do trabalho)
