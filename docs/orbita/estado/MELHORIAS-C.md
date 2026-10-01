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

## M25 · Desfazer e «foi salvo ou não?» no CRM e na Agenda — FEITO (migração só no repositório)

- **Migração `supabase/migrations/20261002c_crm_idempotencia_lote.sql` (NÃO aplicada):** tabela `nx_requisicoes` (RLS fechada) + ajudantes `nx_req_usar`/`nx_req_guardar`
  (service_role) + versões com `p_req uuid` de `nx_negocio_salvar`, `nx_contato_salvar`, `nx_tarefa_salvar` (só a CRIAÇÃO guarda a chave) e `nx_agenda_marcar`
  (só guarda `{ok:true}`). Chave por cliente, 24 h, advisory lock contra corrida; autentica (`nx_ctx`) antes de olhar o resultado guardado; erro não é guardado.
  Aditiva e sem `drop`: são sobrecargas NOVAS com o MESMO nome (a de 3/7 argumentos continua como está; o `p_req` não tem default para as duas assinaturas não
  colidirem no PostgREST — em `nx_agenda_marcar` ele vem antes dos argumentos com default, exigência do Postgres). **Smoke `supabase/testes/14_crm_idempotencia_lote.sql`**
  (begin … rollback; passa no Postgres local `node supabase/testes/rodar-local.mjs 14`): 2 chamadas com a mesma chave = 1 registro (negócio, contato sem telefone, tarefa), editar não guarda
  chave, chave de outro cliente não vaza, token de B não repete a chave de A, chave vencida (25 h) executa de novo, a mesma chave em outra operação = `dados_invalidos|req`,
  recusa/erro não ficam guardados, «marca → desmarca → repete a chave» devolve o resultado guardado e NÃO marca de novo, RLS e grants. Todos os smokes locais continuam verdes (o 02 falha por depender do banco real, como antes; o 09 varre as RPCs novas).
- **Cliente:** `L.novaReq`, `L.erroAmbiguo` (prazo, conexão, resposta ilegível, 502/503/504, `tempo_esgotado`), `L.escreverComReq(api, nome, params, {req, aoStatus})`: em erro ambíguo repete até 2× com a
  MESMA chave («Conferindo se foi salvo…»), sem sucesso lança `.ambigua` com `.req`. Usado em Nova oportunidade, Novo paciente, Nova tarefa, Iniciar pós-venda e Marcar consulta:
  o modal NÃO fecha, diz «Não foi possível confirmar se foi salvo. Toque em … de novo: é seguro, não duplica.» e o novo clique usa a mesma chave (mudou o conteúdo, chave nova).
  O `p_req` vai explícito nos parâmetros (`rpcC(nome, {…, p_req})`); **não** uso `{req:true}` do api.js da frente B para o «Salvar de novo» ter a mesma chave.
- **Kanban:** mover entre etapas ABERTAS grava na hora e o aviso «Desfazer» (ou Ctrl/⌘+Z) move de volta (devolve também a data da consulta se a etapa a mudou). Mover para/de GANHO ou PERDIDO
  (risco 10 do plano: dispara automações) fica **adiado pelos 7 s do aviso**: o cartão aparece no destino com borda tracejada («confirmando»), Desfazer antes disso = nada foi ao servidor;
  passados os 7 s, ao sair da tela, ao esconder a aba/aparelho ou ao fechar a página (best effort) o movimento vai. Erro ambíguo: consulta `nx_negocio_ver` ANTES de reverter — se o servidor já
  está na etapa nova o cartão fica; se está na antiga o cartão volta com mensagem clara; sem resposta fica «confirmando» e confere quando a internet voltar (`orbita:online`).
  O pulso não recarrega o quadro com movimentos pendentes e uma recarga reaplica os pendentes (a tela não «pula»).
- **Gaveta do negócio:** Ganhou/Perdeu/etapa da fita gravam e oferecem Desfazer (aviso: «Mensagens automáticas já enviadas não voltam.» em ganho/perdido); etiquetas do negócio e do contato
  oferecem Desfazer; **excluir tarefa e nota** deixam de pedir confirmação: somem na hora e a exclusão real só vai depois dos 7 s (Desfazer traz de volta); concluir tarefa usa `ui.acaoComDesfazer`.
  `ui.confirmar` ficou só no irreversível (excluir negócio/contato com «digitar excluir», excluir empresa, configurações).
- Limitação conhecida: o Desfazer de mover entre etapas abertas move de volta, mas uma automação por etapa que já tenha disparado (ex.: mensagem imediata) não é «desenviada».
- Verificado (puppeteer + dev-falso da frente B com `simular/falha`): aberto→aberto + Desfazer (2 chamadas `nx_negocio_mover`); ganho adiado (0 chamadas antes dos 7 s, 1 depois; Desfazer = 0 chamadas);
  504 depois de aplicar = cartão fica; 504 sem aplicar = cartão volta com mensagem; criar oportunidade com 504 depois de aplicar = 2 pedidos com a MESMA chave e +1 negócio; marcar consulta idem = 1 consulta;
  excluir tarefa (0 envios até os 7 s; Desfazer volta; sem Desfazer envia 1); etiquetar + Desfazer; Ganhou na gaveta + Desfazer.
- Testes: `crm.teste.mjs` — `escreverComReq` com servidor falso (aplica e perde a resposta → repete com a mesma chave → 1 registro; caiu antes → aplica na repetição; sem sucesso → `.ambigua` + chave e o «Salvar de novo» não duplica; recusa não repete),
  `erroAmbiguo`, `movimentoAdiado`.
- Pedido para a frente B: `api.rpcC` deve repassar `p_req` explícito sem sobrescrever (hoje repassa); o dev-falso de B já tem a idempotência por `p_req` (usada nos testes de C).

## M27 · Marcar consulta em 2 toques — FEITO

- `agenda.js` exporta `marcarConsulta(ctx, {negocio, dia, hora, base, aoMudar})` e `desmarcarConsulta(ctx, consulta, {aoMudar})` (a janela deixou de ser um fechamento da tela: o CRM abre a MESMA).
  Com a oportunidade já escolhida (gaveta do negócio, «Remarcar» da consulta, clique/«+» da grade) a janela abre com os horários livres prontos: **chips de dia** («Hoje», «Amanhã», «Sex 03/10»),
  **pílulas de horário**, o primeiro livre (ou o mais perto do clique na grade, no mesmo dia) já selecionado e o foco em «Confirmar consulta» → **2 toques**: «Marcar consulta» (gaveta do negócio) e «Confirmar».
  Sem oportunidade: **busca enquanto digita** (debounce 300 ms, Enter busca na hora e escolhe se há um só), por UMA chamada (`nx_buscar`; sem ela cai no quadro do funil); escolher o resultado já carrega os horários
  (`nx_agenda_livres` com `p_negocio`: o servidor deduz serviço e duração) e a ficha (`nx_negocio_ver`) traz o serviço e avisa «Já tem consulta marcada para …; ao confirmar, será remarcada».
  Atalhos «Primeiro livre» e «Amanhã de manhã», «Ver a partir de» (outra data) e «Serviço» (muda a duração) recarregam os horários; setas movem chips e pílulas (radios).
- Confirmar → aviso **«Marcada para qui 02/10 às 10:00 · Desfazer»** (desmarca; se era remarcação, volta ao horário anterior); «Desmarcar» (pede o motivo) também ganha Desfazer (marca de volta o mesmo horário).
  A escrita usa a chave `p_req` do M25 (erro ambíguo repete com a mesma chave e não marca duas vezes).
- Botão **«Marcar consulta»/«Remarcar consulta»** na gaveta do negócio aberto (`crm-negocio.js`); ação «Marcar consulta» registrada na paleta (`ctx.comandos.registrar`, só se o registro existir — é da frente B/M18).
  O CSS da agenda também carrega quando a janela abre pelo CRM.
- Verificado (puppeteer + dev-falso): do negócio aberto à consulta marcada em **2 toques** (gaveta → «Marcar consulta» → «Confirmar consulta»): `nx_agenda_marcar` com `p_req`, aviso com Desfazer, Desfazer chama `nx_agenda_desmarcar`
  e a consulta some; busca digitando «Camila» = 1 pedido (debounce), resultado → horários → «Amanhã de manhã» seleciona amanhã antes do meio-dia; Esc com texto digitado mostra a faixa «Descartar o que você digitou?» (M08 da frente A); 390 px sem corte.
- Testes (`crm.teste.mjs`): `agruparLivres`, `rotuloDoDia`, `primeiroLivre`, `amanhaDeManha`, `slotMaisPerto` e o estático da janela e do botão na gaveta.
- Excluir tarefa/nota passou a usar o `firmar` do `ui.acaoComDesfazer` da frente A (Ctrl/⌘+Z, saída da página e erro devolvendo a tela).
