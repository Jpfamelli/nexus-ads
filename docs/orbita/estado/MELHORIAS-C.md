# Melhorias de 01/10/2026 — Frente C (CRM e Agenda)

Plano: `docs/orbita/MELHORIAS-20261001.md` (itens M23–M30). Branch `claude/automacoes-ia`. Nada de push, merge, Netlify nem banco:
a migração `supabase/migrations/20261002c_crm_idempotencia_lote.sql` (quando existir) só está no repositório, NÃO aplicada.
Arquivos que esta frente edita: `web/app/crm.js`, `crm-*.js`, `agenda.js`, `agenda-config.js`, `crm.css`, `agenda.css`, `testes/crm.teste.mjs` e esta nota.

## Como verificar (comum)

- `node --check web/app/crm-kanban.js` (e os demais) · `node testes/crm.teste.mjs`.
- Ver na tela: `ORBITA_DEV_FALSO_PORT=4361 node scripts/dev-falso.mjs` e abrir `http://127.0.0.1:4361/app/?dev-falso=1&dev=1#/crm`.
  Toque real: Chrome DevTools com emulação de celular (390×844) ou aparelho. O QA desta frente usou puppeteer-core + Chrome com
  `Input.dispatchTouchEvent` (`page.touchscreen`), 390×844 e 1440×900.

## M23 · Kanban no toque — FEITO

- Toque longo de 350 ms (com `navigator.vibrate(10)` quando existe) levanta o cartão; o dedo o arrasta com o mesmo fantasma, lugar, rolagem de borda
  e `soltar()` do mouse (as mesmas perguntas: valor, motivo, data). Rolagem vertical/horizontal normal **nunca** inicia arrasto: a decisão vem da
  máquina de estados pura `L.gestoToque` (`crm-logica.js`: `novoGesto`/`gestoTempo`/`gestoMover`/`gestoSoltar`/`gestoCancelar`, limiar de 10 px
  antes dos 350 ms = rolagem); `.kc` fica com `touch-action: pan-x pan-y` e só o `touchmove` do cartão levantado é cancelado (ouvinte não passivo no quadro).
- «Mover para…» sempre à mão: toque longo sem arrastar, botão ⋮ no cartão (celular/tablet e ao focar pelo teclado) e a tecla M no cartão focado.
  A folha lista as etapas com cor, nome e contagem, marca a atual e escolher = soltar no topo da etapa (com as mesmas perguntas).
- Celular (≤ 760 px): cabeçalho compacto (título + seletor de funil), busca + filtros numa linha, fita de etapas fixa sob a busca (também é destino do arrasto
  e leva à coluna ao tocar), totais numa linha «9 abertas · R$ 24.500 · previsão R$ 8.640» que expande ao toque, «Nova oportunidade» como botão
  flutuante acima da barra inferior, «Ganhou/Perdeu» também valem no toque. Quadro guarda a rolagem ao recarregar em silêncio.
- Correção de passagem: `.vista > .crm` deixava `transform: matrix(identidade)` depois da animação de entrada e isso prendia qualquer `position: fixed`
  dentro da tela (botão flutuante); agora `animation-fill-mode: backwards` no `.crm`.
- Verificado (puppeteer, 390×844, toque): rolagem vertical rápida sobre o cartão não arrasta; rolagem horizontal rola o quadro; toque longo + arrasto até a 2ª
  coluna (rolagem de borda) move o cartão (`nx_negocio_mover` com `p_ordem`); toque longo sem mexer abre a folha e escolher move; toque curto abre a gaveta;
  arrastar sobre um chip da fita funciona; 1º cartão em y = 423 (de 844) sem a faixa demo; sem rolagem horizontal da página; 0 erros de console. Desktop 1440 igual ao de antes.
- Testes: `crm.teste.mjs` — gesto de toque (toque, rolagem, longo, arrasto, cancelamento, timer atrasado), destino do arrasto e resumo dos totais, e o estático do kanban no toque.
- **Pendência para a frente A:** `testes/app.teste.mjs:842` (teste «acessibilidade: painel de inbox…») ainda exige o texto antigo da coluna vazia
  `Abra um cartão e escolha ‘Mover para…’`. O texto mudou de propósito (era o problema do plano): no toque agora é «Segure um cartão e arraste até aqui» e a
  alternativa é o botão ⋮ do cartão. A asserção deve passar a conferir `Segure um cartão e arraste até aqui` (a linha seguinte, `(pointer: coarse)`, continua valendo).
- Risco 11 do plano: só emulação de toque; falta provar em aparelho real antes de publicar (Android e iPhone).
