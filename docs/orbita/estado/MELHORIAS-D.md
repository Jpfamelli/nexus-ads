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
| M37 | — | — |
| M38 | — | — |
| M31 | — | — |
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

## Pendências para outras frentes

- (A) nenhuma até aqui.
- (B) `scripts/dev-falso.mjs` — respostas fictícias novas que a frente D vai precisar: `nx_onboarding_estado` (M32), `client_ref` repetido no `nx-enviar` devolvendo a mesma mensagem (M36). Sem elas a frente D usa interceptação de requisição nas próprias provas (puppeteer), sem tocar no arquivo.
- (B) `ctx.rascunho` (M17), `ctx.comandos.registrar` (M18), `orbita:online`/`rede` e o motor de avisos (M19) ainda não existem na branch: a frente D codifica contra o contrato do plano com fallback quando ausentes.
