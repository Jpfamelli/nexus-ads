# E2E — Órbita (E2E-A/B pela API, sem navegador) — 2026-09-30

status: executado (portão F8) · resultado: **15 de 16 casos ok; 1 bug real no backend (jid `@lid`)**
rodada: `456d6a` · início 20:45 UTC (17:45 SP) · fim 20:51 UTC · tenant `teste-e2e` (projeto `dtjznipitihnwmcgpzqh`)
autor: Claude (subagente do orquestrador). Sem commit, push, deploy, migração nem edição em `supabase/` ou `web/app/`.

## Como foi feito

- Script: `testes/e2e/orbita-e2e.mjs` (Node 24, sem dependência). Fala só com `…/rest/v1/rpc/nx_*` (chave publicável + `p_token` da sessão
  curta da "Conta E2E Órbita", admin do `teste-e2e`) e `…/functions/v1/nx-codewords | nx-enviar`. Cada caso tem asserção explícita
  (204 asserções REST: 203 ok, 1 falha). Tudo que cria leva o prefixo `E2E-3009` (nome/texto), telefone `5512993009xxx` ou campanha `E2E-3009-*`.
  Token, URL secreta do canal, chave do formulário e chave falsa nunca são impressos (filtro de redação; conferido por varredura do log).
- SQL (service role via `execute_sql`; o que a API não alcança), em `testes/e2e/sql/`:
  `00_ids_kamiguchi.sql` (ids só para NEGAR), `01_seed_metricas.sql` (métricas fictícias só no teste-e2e),
  `02_isolamento_rollback.sql` (106 sondas, em transação que termina em exceção), `03_cota_ia_rollback.sql` (32 asserções, idem),
  `04_limpeza_e_verificacao.sql`, `05_hash_kamiguchi_comparar.sql`.
- Sessão: 1 linha em `nx_sessoes` (hash sha256 de um token aleatório gerado localmente, 2 h, conta `Conta E2E Órbita`); token só em arquivo no
  scratchpad. A sessão foi apagada no fim (`sessoes do teste = 0`).
- Fase ENVIO (casos 2b e 7b): o script para em `AGUARDANDO_FLAG`; por SQL marquei no canal de teste `phone_id` falso, `conectado=false` e
  `numero_conferido=true` (a conferência vale 10 min: o envio pula o GET /connections; `conectado=false` tira o canal do cron de sincronização
  `nx-codewords-sync`, que chamaria o CodeWords), depois o script seguiu. Total de chamadas reais ao CodeWords: **2** (as duas com chave FALSA
  `cwk-teste-…`, ambas recusadas com HTTP 401 → "chave recusada", definitivo): 1 do `nx-enviar` (mensagem 621007) e 1 da fila
  (item 8725). Nenhuma chamada à IA (`nx_cv_base.ia.ligada = false`: sem chave Anthropic).
- Reproduzir: gerar `kam-ids.json` (00), criar a sessão (hash), rodar 01, `E2E_DIR=<pasta> node testes/e2e/orbita-e2e.mjs`, criar o arquivo
  `flag-envio-pronto` depois do SQL de marcação do aparelho, e rodar 04 + 05 no fim. `--so=`, `--manter`, `--sem-envio`, `--limpar` no cabeçalho do script.

## Resultado por caso

| # | Caso | Resultado | Detalhe curto |
|---|------|-----------|---------------|
| prep | Sessão, canal CodeWords falso, URL pela ação `receita` | ok (8/8) | canal `provedor=codewords`, rota fluxo, IA ligada, sem devolver a chave; `receita` devolve url (`/nx-codewords?ch=<64 hex>`) + prompt de 11 KB; segredo trocado → 401 `canal_invalido` |
| 1.1 | Rastreio (utm_source=google, campanha fictícia) + mensagem `[ref CODIGO]` | ok (14/14) | `registrada:true, responder:true`; contexto com as 6 chaves; negócio com origem anúncio/google e **nome** da campanha e do anúncio; UTMs sem gclid; 2º telefone com o mesmo código não atribui; CTWA (referral Meta) atribui campanha pelas métricas |
| 1.2 | horarios / agendar / horario_ocupado / remarcar / cancelar | ok (12/12) | lista ≤12 em America/Sao_Paulo; negócio vai a `agendada` com `consulta_em`; `nx_agenda_dia` traz a consulta com plataforma e campanha (29c); mesmo horário por outro contato → `horario_ocupado` + sugestões; `ja_agendada`, `passado`; cancelar volta o negócio para `nova` |
| 1.3 | origem, etapa, nota, contexto | ok (8/8) | `origem` não sobrescreve Google (`ja_tem_anuncio`); `etapa orcamento` move; `etapa fechou` → `etapa_invalida` |
| 1.4 | humano, celular, devolver, limite, recibos | ok (18/18) | `humano` → IA pausada (`pausada_por=humano`) + notificação + aviso no chat; saída `autor:celular` pausa; devolver no painel → `responder:true`; 8 respostas da IA em 10 min → entrada seguinte `limite` (aviso 1×); recibos `status` |
| 1.5 | duplicada, grupo, @lid, protocolo | **falha (11/12)** | duplicada e grupo ok; 400/405/413/422 ok; eco do próprio número ok; **`@lid` vira telefone falso (BUG, abaixo)** |
| 1.6 | payload cru sem `acao` (rota direta) | ok (7/7) | grava entrada (`ia_desligada`), saída `is_from_me`, grupo cru ignorado, `ack` cru sem erro; canal volta para rota `fluxo` |
| 2a | Envio pelo painel sem aparelho | ok (2/2) | 400 `codewords_sem_aparelho`, nada gravado, sem rede |
| 2b | Envio pelo painel, aparelho falso + chave FALSA | ok (6/6) | HTTP 200 `{ok:false, erro:"envio_falhou", detalhe:"O CodeWords recusou a chave (cwk-)…"}`; mensagem `falhou` com o motivo; **não** é "STATUS INCERTO"; **IA NÃO ficou pausada** (falhou de vez); 75 s depois continua 1 mensagem; fila 0 |
| 3 | Memória aprovada (30a/30e) | ok (11/11) | salvar → `nx_cv_base.config.ia.memoria_aprovada` → `contexto.empresa.memoria_aprovada` → bloco "MEMÓRIA OPERACIONAL APROVADA" nas instruções; salvar sem o campo **não** apaga; `memoria_aprovada:""` apaga (é o que a tela faz ao limpar); >3000 e tipo errado → `dados_invalidos` |
| 4 | Pacotes comerciais (30b) | ok (19/19) | admin do teste-e2e não altera oferta, plano, limites, módulos, não cria cliente, não lê nem grava config global/planos/orgs/contas/domínios, não usa `nx_executar` (todos `so_gestor`/`so_plataforma`); sessão/app-sessão não trazem `comercial`; uso do plano de outro cliente → `sem_acesso` |
| 5 | CRM | ok (20/20) | funil Pacientes (7 marcos) e Pós-tratamento; criar; mover; ganhar exige valor (`valor_obrigatorio`); `fechado_em`; trava `fechado_no_ads`; perder exige motivo; reabrir; tarefa/nota; `nx_negocios_kanban` traz `campanha_ext/campanha_nome/anuncio_nome` (29c) sem gclid/código |
| 6 | Ads: `nx_dados` × `web/nucleo.js` | ok (29/29) | 28 linhas de métrica (2 plataformas × campanha/anúncio × 7 dias) batem; gasto 784 (G 490 + M 294), conversas 27, impressões 25.200, cliques 868, CPA 784/27, CTR, CPC, CPM, frequência 1,8 (resíduo de campanha sem anúncio incluso); negócio no Pós-tratamento **não** entra; relatório diário/mensal (texto WhatsApp) e `nx_rel_vendas`/`nx_rel_atendimento` sem erro |
| 7a | Automação simples | ok (8/8) | `negocio_estagio` (etiqueta de teste) → tarefa + aviso; execução gravada `ok:true`; negócio sem a etiqueta não dispara |
| 7b | Lembrete `antes_da_data` | ok (7/7) | item na fila do canal CodeWords; cron envia → CodeWords 401 → item `falhou`, `tentativas=1`; mensagem `falhou` com motivo; 130 s depois nada novo (sem reenvio) |
| 8 | Cota/reserva da IA (30c), só SQL | ok (32/32) | ver abaixo |
| 9 | Isolamento | ok (API 23/23 + SQL 106/106) | ver abaixo |

### 8 — cota/reserva da IA (`testes/e2e/sql/03_cota_ia_rollback.sql`, tudo em ROLLBACK, sem chamar a IA)
Reservas 3/3 cabem e a 4ª → `ia_cota`; reserva não conta como uso até registrar; registrar é idempotente (mesma reserva 2× = 1 uso); registrar inexistente → `ok:false`;
**toda tentativa conta** (1 falhada + 1 ok + 1 falhada = `nx_uso` 3; usadas+reservadas no teto → `ia_cota`); reserva expirada libera a vaga; limite por minuto = 20 por
**conta** (21ª → `muitos_pedidos`; colega não é afetado; reservas com >1 min e uso registrado no último minuto entram na conta certa); conta sem acesso → `sem_acesso`;
cota de um cliente não consome a de outro; ACL só service_role; a função usa `pg_advisory_xact_lock(nx-ia-reservas, cliente)`.
**Não provado:** concorrência real entre duas transações — tentei com dois `execute_sql` em paralelo (um segurando o advisory lock por 9 s, outro pedindo reserva):
o conector serializou as chamadas (o 2º levou 5 ms), então só ficou provado por leitura do código que há lock, não que ele bloqueia.

### 9 — isolamento
- **Hash das linhas do kamiguchi, antes × depois da rodada inteira:** 40 tabelas comparadas (as 7 pedidas — `nx_leads`, `nx_contatos`, `nx_conversas`,
  `nx_mensagens`, `nx_canais`, `nx_metricas_dia`, `nx_funis` — mais 33 com `cliente_id` e a linha de `nx_clientes`; `nx_integracoes` e `nx_config` fora): **0 diferenças**.
  Antes (~20:22 UTC) e depois (~20:53 UTC): mesmos hashes, por exemplo `nx_funis=bf6cf95a…`, `nx_estagios=5d0cff60…`, `nx_clientes(linha)=a7dd170e…`; Vault 2 → 2.
  Atenção: no banco o kamiguchi **só tem estrutura** (2 funis, 12 etapas, 9 etiquetas, 2 departamentos, 8 respostas, 6 motivos, auditoria, 1 pulso): 0 leads,
  0 contatos, 0 conversas, 0 mensagens, 0 canais, 0 métricas. Logo os hashes das 7 tabelas pedidas são "vazio" (prova que nada foi criado lá, não que dados reais resistem).
- **API com a sessão do teste-e2e (script):** 64 RPCs de painel (CRM, agenda, conversas, canais, automações, IA, chave/rastreio, relatórios, dados) com `p_cliente = kamiguchi` →
  todas `sem_acesso` (escritas com payload inválido de propósito: se o portão falhasse, morreria em `dados_invalidos` sem gravar no cliente real); 23 operações com cliente próprio +
  ids/objetos do kamiguchi ou inexistentes → todas negadas (`funil_invalido`, `estagio_invalido`, `*_nao_encontrado`…); etiqueta do kamiguchi passada a um negócio meu é descartada em silêncio (não grava).
- **SQL em ROLLBACK (`02_isolamento_rollback.sql`)** com a MESMA conta e uma sessão temporária: fixture de um cliente B de OUTRA organização (negócio, contato, conversa, mensagem, tarefa, nota, canal, automação,
  funil, etapa, etiqueta, departamento, resposta, motivo) + objetos reais do kamiguchi: 106 sondas (portão com `p_cliente` alheio, ids de B e do kamiguchi em 40+ RPCs de leitura e escrita, token de B em A e no kamiguchi) →
  **106 negadas**; hash do kamiguchi e do cliente B iguais dentro da transação; meu negócio não mudou de funil/etapa. Só existe 1 organização no banco (Nexus): "outra org" foi provada com a fixture (desfeita; `orgs_total = 1`).
- **Segredo do canal:** a API do agente ignora `cliente_id`/`canal_id` do corpo (grava no teste-e2e); `receita`, `estado` e `nx-enviar` com `cliente = kamiguchi` → 403 antes de qualquer rede; canal inexistente/alheio → 404; token inválido → 401;
  cron falso → 401 em `nx-enviar`, `nx-codewords`, `nx-relatorio`. Anônimo: `GET /rest/v1/{nx_contatos,nx_leads,nx_conversas,nx_mensagens,nx_canais,nx_sessoes,nx_contas,nx_funis}` só com a chave pública → negado; RPC de painel sem token → erro.

## Limpeza (feita em `finally` pelo script + SQL final; conferida por SQL)

- API: canal (e segredos) via `nx_canal_excluir`, conversas/mensagens (em cascata), contatos, negócios, tarefas, notas, etiqueta e automações.
- SQL (`04_limpeza_e_verificacao.sql`): notificações (todas com E2E-3009 no título), eventos, código de rastreio, métricas fictícias (28), auditoria do canal de teste, `cfg.ia` do teste-e2e (volta a não ter a chave `ia`), item/mensagem de fila e a sessão temporária.
- Conferência final: **0 linha** com `E2E-3009`/`5512993009`/`E2E-3009-*` em contatos, leads, mensagens, notas, tarefas, notificações, etiquetas, automações, canais, rastreio, métricas e fila; 0 fixtures (orgs/clientes/contas `e2e3009-*`);
  **Vault = 2 segredos (igual ao de antes)**; 0 reservas/uso de IA; 0 sessões do teste; contagem de linhas das 39 tabelas com `cliente_id` do teste-e2e **igual à de antes** (inclusive `nx_auditoria` 15 e `nx_historico` 6).
  Ficaram: contadores (`nx_seq`, `nx_pulsos`) do tenant, que só crescem; 5 sessões no total (eram 4: a rodada de outro teste criou uma; a minha foi apagada). Dados `QA-3009` de outro teste no mesmo tenant não foram tocados.

## Bugs reais no backend (NÃO corrigidos)

1. **API do agente aceita `@lid` como telefone** (`supabase/functions/_compartilhado/codewords.js`, `lerPayload`/`digitosDoJid`; só `@g.us`, `@broadcast`, `@newsletter` e `status@` são filtrados por `GRUPO_TXT`).
   Cenário: `POST ?ch=<segredo>` `{acao:"mensagem", direcao:"entrada", telefone:"178190287962245@lid", texto:"…", message_id:"…"}` → `registrada:true, responder:true` e cria contato, conversa e
   negócio com o telefone falso `178190287962245` (o id interno do WhatsApp tem 15 dígitos e passa em 8–15). O fluxo então tentaria responder a um número que não existe (ou a outra pessoa). Esperado: ignorar (`motivo:"grupo"`/novo motivo) ou resolver o número real.

**Correção (30/09, commit a1fc214; PUBLICADA em 01/10/2026 03:42 UTC, run `36811688641` (nx-codewords v3, nx-enviar v4, nx-whatsapp v6); PROVADA em produção em 01/10/2026 03:49–03:52 UTC pelo roteiro do F8.md — `@lid` sem número → `lid_sem_numero` sem gravar nada; com `sender_pn`/`remoteJidAlt` usa o número real; telefone normal registra; grupo é ignorado):** `@lid` nunca vira telefone; com o número real em `sender_pn`/`remoteJidAlt`/`participant_pn`/`phone_number`/`jid_alt` usa o real; sem ele a mensagem é ignorada (`motivo: "lid_sem_numero"`, `registrada:false`, `responder:false`, só a forma do payload é guardada). Mesma regra na saída/eco, nas ações com telefone (400), no envio, no teste do painel e na sincronização. Testes em `testes/codewords.teste.mjs` (6 novos). `codewords_sem_aparelho` e os demais códigos de `nx-enviar`/`nx-codewords` ganharam texto em `MENSAGENS` (teste varre o backend).

## Observações (não são bug de backend)

- UX: `codewords_sem_aparelho` (nx-enviar sem aparelho pareado) não está em `MENSAGENS` de `web/app/api.js`: a tela mostraria "Não deu certo agora (codewords_sem_aparelho)".
- Desenho do painel: o Ads conta até ONTEM; negócio criado/fechado HOJE só aparece nos números amanhã (provado: hoje `fecharam=0`; "como se fosse amanhã" R$ 3.200 fechados sobre R$ 784 investidos = 4,08×). Não é defeito, mas explica "fechei e o Ads não mudou".
- Cada aviso da IA ("A IA pediu ajuda", "IA segurada", "Consulta marcada pela IA") gera 1 notificação por destinatário (admin do teste + gestor): 2 linhas por evento.
- O tenant `teste-e2e` tem um negócio de anúncio de outro teste (`QA-3009`): as expectativas do Ads saem das linhas de `nx_dados`, não de números fixos.
- `nx_cv_base.ia.ligada=false`: a IA real (nx-ia) não está ligada no banco; nenhuma rota de IA foi exercitada.

## O que NÃO pôde ser provado sem a chave real do CodeWords

- Entrega de verdade no WhatsApp (envio pelo proxy `/proxy/send/message` com `code SUCCESS`), pareamento, `estado`, `ligar_fluxo`, `receber_aqui` (as ações de rede do painel não foram chamadas para não gastar as 2 chamadas reais) e o fluxo do Cody.
- Recibos reais (`delivered`/`read` vindos do aparelho): só a rota `status` com ids simulados e o caso "recibo antes do eco" (`pendente:true`) foram exercitados.
- **`message_id` devolvido pelo envio × `id` da lista `/proxy/chat/<jid>/messages`:** se forem diferentes, a sincronização (`nx_codewords_sync_gravar`) não reconhece a mensagem mandada pelo painel/IA (a "gêmea" por texto ±5 min só vale para wamid nulo ou provisório
  `orbita-…`), grava uma **cópia duplicada** e ainda **pausa a IA como "celular"**. Só se vê com a chave real (comparar o id do envio com a lista).
- Erro ambíguo (timeout/5xx do CodeWords → "STATUS INCERTO", id provisório, adoção pela gêmea): coberto só pelos testes Node com fetch falso, não contra o serviço.
- `nx-relatorio` (Edge Function) não foi executada: exige o `cron_token` (em `nx_config`, que não pode ser lido) e `nx_executar` é só de gestor. Provei o mesmo texto do WhatsApp pelo `web/nucleo.js` (que a função usa) e os RPCs de relatório do app; nada foi enviado.
- Concorrência real da cota da IA (duas transações) e o cron `nx-codewords-sync` contra um aparelho real.
- Fora de escopo desta etapa (API): UI/mobile autenticado, mídia recebida, console do navegador.
