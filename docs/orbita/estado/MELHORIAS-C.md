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

## M26 · Agenda como grade de horário — FEITO

- `agenda.js` + `agenda.css` reescritos. Eixo de horas (o expediente dos dias mostrados vindo de `config.horario`, ou 08–18 sem configuração; estica para caber
  qualquer consulta; mínimo 4 h), colunas por dia (semana de segunda a domingo) ou por responsável (Dia com 2+ pessoas, com «Juntos | Por responsável»),
  blocos com altura = duração (`posicaoNoDia`) e cor = procedimento (`--pal-N` por hash do nome, sempre a mesma), consultas no mesmo horário LADO A LADO
  (`colocarEmFaixas`), bloqueios hachurados (inclusive o de dia inteiro), horário fechado sombreado (fora do expediente e almoço), linha de «agora» no acento
  (atualiza a cada minuto), toque/clique no vazio abre «Marcar consulta» já no dia e perto do horário (arredonda ao passo da agenda; avisa se já passou ou se
  está fora do atendimento), «+» no cabeçalho de cada dia, clique no bloco abre o detalhe (quem, quando, origem; Abrir negócio · Remarcar · Desmarcar).
- Celular (≤ 760 px): faixa de dias rolável (com a contagem de consultas), o dia com régua de horas (64 px por hora), dia livre vira a linha de 40 px
  «Livre · Marcar», título e «Marcar consulta» na mesma linha, sem Dia/Semana. Troca de dia dentro da semana não pede nada ao servidor.
- Dados: `nx_agenda_dia` como antes (sem RPC nova; usa `config.horario`, `intervalos`, `passo_min` quando vêm).
- Verificado (puppeteer): 1440×900 a semana 08–18 h cabe sem rolar a página (`.vista` termina em 900; o 1 px de `scrollHeight` é o `div.sr-only` do aviso do shell);
  consulta de 60 min = 55 px e a de 30 min = 28 px; Terça 09:00 com duas consultas lado a lado (78 px cada); sem rolagem horizontal em 390, 768, 1024 e 1440;
  tema escuro conferido; 0 erros de console. 390: dia livre = 40 px.
- Testes (`crm.teste.mjs`, seção a2): semana/dia civil/fuso, faixas e janelas fechadas, eixo, posição (60 min = 2 × 30 min), sobreposição lado a lado
  (duas no mesmo horário, três, cadeia, grupos independentes, bloco dentro de bloco), cor do procedimento, consultas/bloqueios do dia, hora do clique;
  e o estático de `agenda.css` (só tokens, hachura, altura = duração × hora, celular sem Dia/Semana). `agenda.js`/`agenda-config.js` entram nos estáticos do CRM.
- Adiado de propósito para o M27: reescrever o modal «Marcar consulta» (hoje só recebe o dia e o horário do clique) e o desfazer.
