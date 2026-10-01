# E2E-B — itens 8, 11, 12, 14 e 17 do ESPEC §8.5 — 2026-09-30

status: executado · resultado: **9 casos, 256 asserções, todas ok na rodada final**; 1 defeito real de interface (logo largo sobre o nome do produto) e 3 observações; 0 chamadas à IA real, 0 ao CodeWords
autor: Claude (subagente E2E-B do orquestrador). Sem commit, push, deploy, migração, republicação de função, edição de `web/app/` nem de `nx_config`. `web/app/prontos.js` do repositório não foi tocado (só a cópia de `web/` no scratchpad foi aberta).
ambiente: projeto `dtjznipitihnwmcgpzqh`; funções no ar durante toda a rodada: nx-whatsapp v5, nx-relatorio v4, nx-ciclo v4, nx-enviar v3, nx-midia v2, nx-ia v2, nx-codewords v2 (conferido no começo, no meio e no fim, com os mesmos hashes; ninguém republicou durante a minha rodada).
rodada: 21:52 a 22:21 UTC (18:52 a 19:21 SP). Dados de teste só no **tenant próprio** `eb-3009` (revenda) → `eb-3009-clinica` (cliente), com prefixo `EB-3009` e telefones fictícios `5511930090xxx` (CSV) e `5511930099xxx` (conversas). O `teste-e2e`, o `kamiguchi`, a org Nexus e o Vault dos outros não foram escritos (ver "Isolamento").

## Como foi feito

- Script: `testes/e2e/orbita-e2e-b.mjs` (Node 24; fala só com `…/rest/v1/rpc/nx_*` com a chave publicável + `p_token`, com `…/functions/v1/nx-codewords|nx-ia` e com um Chrome headless por `puppeteer-core`). Nada de service role no script.
- O que exige service role está em `testes/e2e/sql-b/` e roda por MCP `execute_sql`, com parada combinada ("AGUARDANDO_SQL <nome>" → arquivo `sql-<nome>.feito`):
  `b01` revenda + conta gestora de teste + sessão de 2 h · `b02` conta administradora do cliente + sessão de 2 h · `b03` ativar o domínio (passo manual do super) · `b05` retroagir a última entrada de UMA conversa · `b06` religar conversas ao canal atual ·
  `b08` varredura de resíduos (somente leitura) · `b09` limpeza final da revenda de teste · `b10` inventário do item 17 (somente leitura) · `b11` limpeza de um tenant (liberação) · `b12` limpeza fina do `teste-e2e` (liberação).
- Contas e sessões: duas contas SEM senha (`senha_hash` inválido de propósito; nenhuma senha real entrou em lugar nenhum), sessões de 2 h com token aleatório de 32 bytes gerado pelo script (só o sha256 foi ao SQL; o token ficou só no scratchpad). Sessões, contas e revenda apagadas no fim.
- Navegador: cópia de `web/` no scratchpad com `prontos.js` liberando tudo SÓ na cópia; servidor estático em 127.0.0.1 que serve `/app/*` com a mesma CSP do `netlify.toml` (violação de CSP apareceria no console); Chrome 1440×900 e 390×844 (celular: toque, DPR 2); um contexto limpo por cenário; sessão injetada em `localStorage` (`nx-token`, `nx-app-cliente`) como o QA mobile anterior.
- A rodada foi feita em etapas, cada uma com `--manter`: (1) `prep,w` · (2) `imp` · (3) `sr,ia` · (4) `srfim` · (5) `ui` (2 execuções) · (6) `srnova` · (7) `--limpar`. O relógio de 5 minutos do caso 12 correu em paralelo ao navegador.
- Reproduzir: `E2E_DIR=<pasta> node testes/e2e/orbita-e2e-b.mjs` (ou `--so=`); cabeçalho do script descreve grupos e flags.

### Incidentes desta rodada (honestos)

1. **Limpeza indevida com `--manter`.** Na 1ª versão do script, `--manter` pulava só o SQL final, mas o `finally` ainda chamava `nx_canal_excluir`. A execução `--so=ui` (que falhou logo por não achar o puppeteer) apagou o canal CodeWords de teste (e seus 2 segredos do Vault) enquanto o caso 12 já estava rodando. Efeitos: as 4 conversas ficaram com `canal_id = null` por ~3 min (as mensagens e os disparos não dependem do canal); criei outro canal de teste e religuei as conversas por SQL (`b06`). A regra do `sem_resposta` (`nx_auto_alvos_tempo`) não usa o canal, então a prova do item 12 não muda — o que dependia do canal (mensagem nova do cliente A) foi refeito depois do religamento (caso `c12c`). Corrigido no script (`--manter` agora não apaga NADA). Só dados do meu tenant foram afetados.
2. O caso `canal` não rodava com `--so=` (bug de filtro do script): a 1ª execução de `imp,sr,ia,srfim` fez o `c11` (ok) e falhou `c12a`/`c8a` sem URL do agente. Corrigido; `c12a` e `c8a` foram rodados de novo (ok). As automações/etiqueta que a execução falha deixou foram apagadas no início da seguinte (caso idempotente).
3. A 1ª execução do navegador com o script completo (22:02) falhou 23 de 72 asserções e caiu com erro por DEFEITOS DO TESTE (triplo clique não selecionava o campo de cor, então as cores digitadas saíam erradas; o texto da tela era lido do elemento escondido; `getComputedStyle` de `.previa` nulo no celular). Corrigidos os três, as execuções seguintes deram 100/100 (22:06) e 112/112 (22:12, com 12 asserções a mais: tela do convite, item Admin só da gestora, lista de clientes da tela do Admin). A rodada final (112/112) é a que vale; nenhuma das falhas anteriores apontou defeito do produto.

## Resultado por caso

| Caso | Item ESPEC | Resultado | Detalhe curto |
|---|---|---|---|
| `prep` | 14 (gestor) | ok 20/20 | gestora: papel `gestor`, NÃO é super, org = revenda; `nx_orgs_listar` só a dela; `nx_clientes_admin` sem Nexus; 14 RPCs de leitura + 2 escritas (payload inválido de propósito) no `kamiguchi` e no `teste-e2e` → `sem_acesso` |
| `c14a` | 14 | ok 49/49 | marca da revenda pela API, validação (`marca_invalida`), o que só o super faz, cliente criado pela gestora (plano padrão da revenda, limite de 1 empresa), tema do cliente, sessão do cliente recebe a marca na hora, cor ruim |
| `c14c` | 14 | ok 15/15 | domínio próprio: pendente não resolve, ativo resolve marca + tema do cliente (inclusive `host:porta`), convite com link do domínio, remover |
| `c14b` | 14 (e 8 na tela) | ok 112/112 | navegador, gestora e cliente, 390×844 e 1440×900: 38 telas sem rolagem lateral, 0 console, 0 exceção, 0 4xx/5xx; marca, editor salvo pela tela, cor ruim com aviso, convite, IA sem chave |
| `c11` | 11 | ok 29/29 | 1.000 linhas em 10 lotes, **1,93 s no total** (máx. 257 ms por lote, da máquina de teste); resumo e dedupe certos |
| `c12a` | 12 | ok 6/6 | 4 conversas, 150 mensagens seguidas (backlog de eventos) e 5 mensagens no meio do backlog |
| `c12b` | 12 | ok 12/12 | `sem_resposta` 5 min dispara UMA vez por conversa (A=1, B com 5 mensagens=1, D com 150=1); respondida não dispara; 155 execuções do backlog |
| `c12c` | 12 | ok 6/6 | nova mensagem do cliente = nova espera = 2º disparo em A; depois não repete |
| `c8a` | 8 | ok 7/7 | sem chave: aviso honesto, zero cota, zero chamada externa (API); tela em `c14b` |
| item 17 | 17 | inventário feito, limpeza NÃO executada | seção própria abaixo, com o SQL exato |

Total: 256 asserções, 0 falhas na rodada final (+ 3 do caso `canal`, repetido por etapa).

---

## Item 8 — "Sugerir com IA" sem chave (provado; o caso COM chave continua pendente)

**Como o produto decide** (lido no código, sem tocar em `nx_config`):
1. `nx_cv_base(p_token, p_cliente)` (migração `20260930e`) devolve `ia.ligada = (nx_config.anthropic_api_key não vazia)` e `ia.cota = {usadas, limite}`; a chave nunca sai do banco.
2. A tela (`cv-composer.js:474`, `cv-lateral.js:195`): `ia.ligada === false` → toast "A IA não está disponível agora." e **retorna antes de qualquer requisição**; cota do mês gasta → "A cota de IA do mês acabou."
3. O servidor (`nx-ia` → `ia_conversas.js:82`): autentica, confere a conversa (`nx_ia_contexto`), e sem chave devolve `{ok:false, erro:'ia_indisponivel', detalhe:'sem_chave'}` **antes** de `nx_ia_reservar` (linha 93) e da Anthropic: não reserva nem gasta cota.

**Provas** (cliente de teste, plano completo: cota 5.000/mês):
- `nx_cv_base.ia.ligada = false`, cota 0/5000; a resposta não contém `sk-ant` nem `anthropic_api_key`.
- `nx-ia sugerir` → HTTP 200 `{ok:false, erro:'ia_indisponivel', detalhe:'sem_chave'}`; `nx-ia resumir` → o mesmo.
- `nx_uso_plano.uso.ia_mes` = 0 antes e depois; `nx_ia_reservas` + `nx_ia_uso` = 0 no banco inteiro antes, durante e depois da rodada.
- Sessão deste cliente apontando `nx-ia` para o `kamiguchi` → recusado na autenticação; token inválido → 401.
- Tela (Chrome, 1440 e 390): conversa B aberta, clicar em "Sugerir resposta com IA" (no celular: menu "Mais opções" → "Sugerir com IA") → aparece "A IA não está disponível agora."; **0 requisições a `/functions/v1/nx-ia`** contadas no navegador; o campo de mensagem segue vazio.
- Total de chamadas reais (à Anthropic): **0** (o limite era 2). Chamadas ao `nx-ia`: 4 (2 sem chave, 1 cliente alheio, 1 token inválido), todas sem custo.
- **Pendente (não provado):** o caso COM chave (texto de verdade, reserva/registro, cota) — depende de o João cadastrar a chave em `nx_config`; continua no `ESTADO.md`.

## Item 11 — importar CSV de 1.000 linhas (caminho real da tela)

**Caminho usado:** o mesmo da tela `#/contatos/importar` (`crm-importar.js`): `lerCSV` → `sugerirMapeamento` → `montarLinhas` (+ `checarLinha` na prévia) do `web/app/crm-logica.js` (importado do disco, sem cópia) e o RPC `nx_contatos_importar` em lotes de 100, com `importacao_id` acumulado e opção `negocio:{funil_id}` (1 negócio por contato), exatamente como `iniciar()`. A tela em si (arrastar o arquivo, clicar nos passos) não foi dirigida; a página `#/contatos/importar` foi carregada nas duas larguras sem erro.

**Arquivo:** `eb3009-importacao.csv` (gerado pelo script; 12 colunas, `;`, BOM, CRLF) com 1.000 linhas:
872 limpas e únicas (valores `R$ 1.050,00`, `1025` e `1.025,50`; "Indicação"/"Site"; nascimento; etiqueta), 28 casos especiais e **100 duplicados** em 4 formas: 36 "perto" (mesmo lote, `(11) 93009-0001`), 24 "longe" (2 lotes antes, `+55 11 93009-0001`), 16 "sem o 9" (`(11) 3009-0001`), 24 por e-mail repetido em CAIXA ALTA com telefone novo. Casos especiais: 5 linhas só com cidade (vazias), 5 com telefone inválido (`12345`), 4 e-mail inválido, 3 UF `XYZ`, 3 nascimento `31/02/2020`, 5 valor negativo (`-50`), 3 etapa inexistente. A expectativa é **por construção** (o gerador sabe quem é duplicata de quem), não calculada pelo código do app.

**Tempos (da máquina de teste até o Supabase, rede incluída):**

| lote | 1 | 2 | 3 | 4 | 5 | 6 | 7 | 8 | 9 | 10 | total |
|---|---|---|---|---|---|---|---|---|---|---|---|
| ms | 241 | 219 | 188 | 199 | 164 | 150 | 214 | 162 | 135 | 257 | **1.929 ms** |

0 `tempo_esgotado`, nenhum lote reduzido; critério do ESPEC (< 60 s no total, cada lote < 2 s): folga de ~30× e ~8×. A 2ª passada com o mesmo arquivo (todos já existentes) levou 43–64 ms por lote. O tempo de servidor isolado não foi medido.

**Resumo (bate com a expectativa):** criados 895 · atualizados 0 · ignorados 105 (100 duplicados + 5 vazias) · erros 0 · avisos 23; 895 + 0 + 105 + 0 = 1.000 (nada some). `nx_importacoes` guardou 1000/895/105/0.
- **Dedupe de telefone:** `(11) 93009-0001`, `+55 11 93009-0001` e `(11) 3009-0001` (sem o 9) acham UM contato, com o nome do ORIGINAL; nenhum contato "EB-3009 Duplicado …" existe. **Dedupe por e-mail** (caixa alta, telefone novo): segue 1 contato e o telefone novo não virou contato.
- **Contatos gravados:** 895 (nenhum duplicado). **Negócios:** 895 abertos, todos na 1ª etapa do funil padrão, soma prevista R$ 979.245,50 (bate com a soma esperada dos 3 formatos de número; valor negativo ignorado).
- **Linhas inválidas, com motivo e número da linha da planilha (cabeçalho = 1):** as 23 linhas com problema entram COM ressalva e o servidor diz o motivo de cada uma: "Telefone inválido — importado sem telefone" (5), "E-mail inválido — importado sem e-mail" (4), "UF inválida — ignorada" (3), "Nascimento inválido — ignorado" (3), "Valor do negócio inválido — ignorado" (5, o negativo), "Etapa «Etapa Que Não Existe» não existe ou está fechada — usamos «Nova conversa»" (3). A prévia da tela (`checarLinha`) já marca 20 delas (vazias, telefone, e-mail, UF, nascimento); valor negativo e etapa só o servidor acusa.
- **Rejeitadas de verdade (`erros`):** só a chamada direta alcança (a tela nunca manda): lote com `5`, `"texto solto"`, `null` e uma lista → 4 erros "Linha em formato inválido" com a linha, a linha boa do mesmo lote entra (1 criado); lote com 101 linhas → `dados_invalidos` (hint `linhas`); `nx_contatos_importar` em `p_cliente = kamiguchi` com esta sessão → `sem_acesso`.
- **2ª passada (mesmo arquivo, sem "atualizar"):** ignorados 995, criados 5 (as 5 linhas SEM telefone e SEM e-mail criam de novo: sem chave não há dedupe — por desenho), 0 erros. **3ª (atualizar=true, 10 linhas):** 10 atualizados, 0 criados, aviso "Já tinha negócio aberto nesse funil" nas 10, negócios não duplicaram (900 no total).

## Item 12 — "sem resposta há 5 min" e backlog

**Montagem:** canal CodeWords de teste (chave FALSA `cwk-…`, sem pareamento → fora do cron de sincronização; 0 chamadas reais ao CodeWords), IA 24 h desligada. Duas automações ativas: `sem_resposta {minutos:5}` → `notificar admins`; `mensagem_recebida {palavras:[EB3009BK]}` → `etiquetar` a conversa. Mensagens pela API do agente (mesma rota do webhook): A (1 mensagem), C (1 mensagem e resposta da equipe pelo celular = controle), D (150 mensagens seguidas = backlog de eventos), B (5 mensagens em sequência, enviadas com o backlog ainda pendente).

**Relógio de 5 minutos (tempo real, sem retroagir nada):**

| conversa | última mensagem do cliente (UTC) | disparo (UTC) | espera | execuções |
|---|---|---|---|---|
| A (1 msg) | 21:59:14 | 22:04:21,9 | 5 min 08 s | 1 |
| D (150 msgs) | 21:59:33 | 22:04:37,0 | 5 min 04 s | 1 (não 150) |
| B (5 msgs) | 21:59:35 | 22:04:37,0 | 5 min 02 s | 1 (não 5) |
| C (respondida pelo celular) | — | nunca | — | 0 |

- Chave de dedupe `sr:<conversa>:<epoch da última entrada>` (ESPEC §5.7), todas as execuções `ok`; detalhe "aviso para 2 pessoas" (a administradora e a gestora). Sino da administradora: **3 notificações** `sem_resposta`, cada uma com o link `#/conversas/<id>` da sua conversa (a da conversa C não existe). Contador da automação na tela: 3.
- 130 s depois: continua 1 execução por conversa e 3 notificações (não repete a mesma espera).
- **Nova espera (`c12c`):** o cliente A escreve de novo (cai na MESMA conversa, sem disparar na hora) e, com a última entrada retroagida por SQL (`b05`) para 6 min atrás, o motor dispara o **2º** aviso de A (22:08:07, chave nova) — é o que a tela promete ("avisa uma vez por espera; se o cliente escrever de novo, conta outra vez"). Depois: A=2, B=1, D=1, C=0 e 4 notificações no total; 45 s depois não repete.
- **Backlog:** 150 mensagens de D entraram em 15,4 s (latência HTTP do agente p50 570 ms, p95 656 ms, máx. 822 ms; todas `registrada:true`). Quando B começou, **127 dos 150 eventos ainda não tinham sido processados** (23 execuções); as 5 mensagens de B levaram 343, 302, 251, 317 e 253 ms, todas registradas, na ordem, na mesma conversa. Os 155 eventos (150 + 5) viraram **155 execuções `ok`**, 0 erro, 0 pendente, entre 21:59:21 e 22:00:51 (90 s; 73 e 82 execuções por minuto, na faixa dos 100/min do ESPEC com lotes de 25 a cada 15 s). Nenhuma mensagem perdida por trava; a conversa B aparece na tela com a etiqueta do backlog.
- Mínimo do gatilho: `sem_resposta` com 2 minutos → `automacao_invalida` ("o tempo sem resposta vai de 5 a 1440 minutos").

## Item 14 — white-label como gestor

**API (`prep`, `c14a`, `c14c`):**
- Revenda `eb-3009` (limites: 1 empresa, 8 usuários, 3 canais, plano padrão `completo`) com 1 gestora de teste. A gestora: papel `gestor`, `super` falso; `nx_orgs_listar` e `nx_clientes_admin` só mostram o que é dela; leitura e escrita no `kamiguchi` e no `teste-e2e` → `sem_acesso`.
- Marca da revenda aplicada por `nx_org_salvar` (nome do produto, assinatura, logo, logo claro, favicon, 3 cores, título/texto da entrada, WhatsApp de suporte); a marca PÚBLICA (`nx_marca_publica`, anônimo, por `?org=`) devolve tudo isso sem id/limite/e-mail; sem `?org=` segue a da plataforma.
- Validação: 11 marcas inválidas (produto de 41 ou 1 caractere, cor não `#RRGGBB`, 3 dígitos, logo SVG, logo http, logo e favicon grandes, `suporte_wa` não numérico, título de 81, chave desconhecida) → `marca_invalida` com o campo no `hint`; nada grava. Só o super: `limites`, `status`, `slug`, `tipo`, criar outra revenda → `so_plataforma`; gravar a marca da org Nexus → `sem_permissao`.
- Cliente criado pela gestora (`nx_cliente_admin_salvar`): na org dela, plano = `plano_padrao` (completo), teste de 14 dias, modelo odonto aplicado (funil com 7 etapas, etiquetas, motivos); 2º cliente → `limite_plano` `org_empresas:1`; plano `interno`, limites extras e trocar de org → `so_plataforma`.
- **A sessão do cliente dessa org recebe a marca:** `nx_app_sessao` (conta `clinica`, papel admin, sem ser gestor/super) traz `org.marca` com nome, 3 cores, título da entrada, suporte e assinatura; sem imagens (leve, < 50 KB); `tem_tema` vira `true` quando a gestora salva o tema; `nx_cliente_tema` devolve as cores e o logo do cliente. Trocar a marca da revenda aparece na sessão do cliente na hora (sem relogar). O administrador do cliente não altera a marca da revenda, nem domínios, nem lista clientes/revendas (`so_gestor`).
- **Domínio próprio:** a gestora cadastra (`pendente`, instrução CNAME); ativar é do super (gestora → `so_plataforma`); pendente NÃO resolve a marca; depois de ativado (b03, simulando o super) `nx_marca_publica(host)` devolve a marca da revenda + o tema do cliente (também com `host:443`); `nx_convite_criar` gera o link `https://<host>/…#/convite/<token>`; `nx_convite_ver` (anônimo) mostra a marca da revenda e o nome do cliente; `link_base` do cliente na sessão é o domínio; remover domínio desfaz a resolução.
- **Cor ruim:** `#FFFF00` sobre fundo branco é aceito pelo servidor (só valida o formato); o app (`tema.js`) gera o aviso "A cor primária ficou clara demais sobre o fundo; usamos um tom mais escuro para texto", o texto/links passam a `#707000` (≥ 4,5:1 sobre o branco) e o texto do botão amarelo a `#0B1B2B` (≥ 4,5:1).

**Navegador (`c14b`; 1440×900 e 390×844; Chrome headless; 38 telas medidas, todas com `scrollWidth ≤ innerWidth`, 0 erros/avisos de console, 0 exceções, 0 respostas 4xx/5xx, 0 requisições falhas, nenhum "null/undefined" na tela):**
- Entrada anônima `/app/?org=eb-3009`: título, texto e nome do produto da revenda; cores = as 3 cores da marca; favicon da marca; aba do navegador com o nome. Tela do convite (`#/convite/<token>`, sem `?org=`): marca da revenda + nome do cliente + cores; sem rolagem lateral.
- Gestora (9 telas): início, **Marca e tema (empresa)**, **Marca e tema (revenda)**, **Domínio próprio**, **Anúncios (integrações Meta/Google)**, Plano e uso, **Admin · clientes**, Admin · cliente (detalhe), **Admin · domínios**: cada uma mostra o conteúdo certo (não "sem acesso" nem "em obra"); a lista do Admin traz só o cliente da revenda (nenhum da Nexus nem de outros testes); o item Admin existe no menu dela. O app abre com o tema roxo do cliente por cima da marca da revenda, logo do cliente no menu e nome do produto da revenda.
- **Editor da revenda salvo pela tela:** em cada largura, a gestora digita as 3 cores (prévia ao vivo já mostra a primária nova antes de salvar), envia um logo novo, clica "Salvar marca" → `nx_marca_publica` (anônimo) passa a devolver as cores novas e o logo novo; uma entrada nova (contexto limpo) já nasce com as cores novas (1440: `#E4572E/#17BEBB/#0E1116`; 390: `#6A4C93/#FFCA3A/#0B1416`).
- **Cor ruim no editor:** fundo `#FFFFFF` + primária `#FFFF00` → a tela mostra os avisos (`aviso-aten`: primária e secundária "clara demais", "a cor primária quase some") e a primária para texto fica `#707000`, o texto do botão `#0B1B2B`; contraste medido ≥ 4,5:1 nos dois. Nada foi salvo nesse passo.
- Cliente (10 telas): início, conversas, CRM, importar, automações, Marca e tema (empresa), Plano e uso, e as 3 negadas (Domínio próprio, Admin, integrações → "Esta seção não está disponível" / "Você não tem acesso", sem chamar o banco; 0 links `#/admin` no menu). Com tema próprio o app usa o tema do cliente; **sem tema próprio usa a marca recém-salva da revenda** (primária, secundária e logo). O administrador do cliente salva o tema pela tela (interruptor "cores próprias" + 3 cores) → `nx_cliente_tema` tem as cores e o app repinta. No esquema "Tema da empresa" o fundo é o da marca.
- Amostras de tela conferidas a olho (login 1440, editor no celular, conversa com a etiqueta do backlog): ok, **menos o defeito abaixo**.

## Item 17 — limpeza final (LISTA; nada do `teste-e2e` foi apagado)

**O que sobraria** (inventário em 30/09/2026 ~22:19 UTC; `testes/e2e/sql-b/b10_inventario_limpeza_final.sql` refaz a consulta):

| onde | o quê |
|---|---|
| `teste-e2e` (tenant) | cliente `teste-e2e`, status `teste`, plano `profissional`; estrutura do modelo odonto (2 funis, 12 etapas, 9 etiquetas, 8 respostas, 6 motivos, 2 departamentos, 1 acesso) |
| negócio | **161333** "Oportunidade sintética E2E", ganho R$ 1.000 (criado em 29/09 13:40 pela conta do João) + 3 linhas de `nx_historico` (89307–89309) |
| contato | **176997** "Contato Teste Órbita" |
| canal | **537e6a70-5535-43ba-a6e3-04cd3bac36d3** "WhatsApp E2E (falso)" (Meta) + **2 segredos do Vault** (o Vault inteiro tem hoje 2 secrets, e são estes) |
| convites | 3: `5b5af1f8…` (admin, aberto até 06/10), `7695c4fe…` (admin, aberto até 06/10), `740abbdc…` (admin, usado na criação da Conta E2E) |
| conta | **Conta E2E Órbita** (`3d052dbe-…`, papel `clinica`, admin só do `teste-e2e`) |
| sessão | 1 sessão de **30 dias** da Conta E2E (criada 29/09 10:54 SP, expira 29/10 10:54) — a única sessão de teste de longa duração |
| auditoria | 15 linhas `nx_auditoria` do `teste-e2e` (cliente criado, 8 "suporte entrou", 3 convites, canal, convite aceito, chave do formulário) |
| histórico do ciclo | `nx_execucoes` (sem `cliente_id`) guarda o slug de cada cliente em cada ciclo horário (`nx-ciclo` :07): as linhas de ciclo citam `teste-e2e` (e, no ciclo das 22:07, `meta-3009`, cliente do E2E-A que já foi apagado) |
| Storage | bucket `nx-midia`: **0 objetos** (nada a apagar) |
| outros tenants de teste | `meta-3009` (E2E-A) não existe mais; `eb-3009*` (este relatório) foi apagado; nenhuma linha com `E2E-3009`, `QA-3009`, `META-3009`, `FIX-3009` ou `EB-3009` em texto/jsonb de nenhuma tabela `nx_*` (varredura de 22:19) |
| contadores | `nx_seq` e `nx_pulsos` do tenant (só crescem; inofensivos) |

Totais de conferência agora: 1 org (Nexus), 2 clientes (`kamiguchi`, `teste-e2e`), 2 contas (João e Conta E2E), 4 sessões, Vault 2, `nx_ia_reservas` 0, `nx_ia_uso` 0, `nx_eventos` pendentes 0, `nx_dominios` 0.

### SQL exato, opção 1 — limpeza FINA (mantém o tenant e a Conta E2E) · `testes/e2e/sql-b/b12_limpeza_fina_teste_e2e.sql`

Ensaiado hoje num bloco que termina em exceção (rollback): `canal=1, vault 2→0, historico=3, lead=1, contato=1, convites=3, sessoes=1, auditoria=15`; conferido depois que nada foi apagado.

```sql
do $$
declare v_cli uuid := (select id from public.nx_clientes where slug = 'teste-e2e'); k public.nx_canais;
begin
  if v_cli is null then raise exception 'teste-e2e não existe'; end if;
  -- 1) canal Meta falso 537e6a70… e os 2 segredos do Vault dele (o mesmo que nx_canal_excluir faz)
  select * into k from public.nx_canais where id = '537e6a70-5535-43ba-a6e3-04cd3bac36d3' and cliente_id = v_cli;
  if k.id is not null then
    delete from public.nx_canais where id = k.id;
    delete from vault.secrets where id in (k.token_segredo, k.app_secret_segredo, k.codewords_api_segredo, k.codewords_hook_segredo);
    perform set_config('nx.sem_gatilho_canal', '1', true);
    update public.nx_clientes set wa_phone_number_id = null where id = v_cli and wa_phone_number_id = k.phone_number_id;
    perform set_config('nx.sem_gatilho_canal', '', true);
  end if;
  -- 2) negócio 161333 e contato 176997, com a linha do tempo deles
  delete from public.nx_historico where cliente_id = v_cli and (negocio_id = 161333 or contato_id = 176997);
  delete from public.nx_leads where id = 161333 and cliente_id = v_cli;
  delete from public.nx_contatos where id = 176997 and cliente_id = v_cli;
  -- 3) os 3 convites que sobraram
  delete from public.nx_convites where cliente_id = v_cli;
  -- 4) a sessão de 30 dias da Conta E2E Órbita (a conta continua)
  delete from public.nx_sessoes where conta_id = (select c.id from public.nx_contas c where c.nome = 'Conta E2E Órbita' and c.papel = 'clinica');
  -- 5) a trilha de auditoria dos testes
  delete from public.nx_auditoria where cliente_id = v_cli;
end $$;
-- conferência: 0 em tudo (o Vault deve ficar em 0)
select (select count(*) from public.nx_leads where id = 161333) as lead, (select count(*) from public.nx_contatos where id = 176997) as contato,
       (select count(*) from public.nx_canais where id = '537e6a70-5535-43ba-a6e3-04cd3bac36d3') as canal,
       (select count(*) from public.nx_convites where cliente_id = (select id from public.nx_clientes where slug = 'teste-e2e')) as convites,
       (select count(*) from vault.secrets) as vault_total_esperado_0;
```

### SQL exato, opção 2 — remoção TOTAL do tenant `teste-e2e` (+ Conta E2E) · `testes/e2e/sql-b/b11_limpeza_tenant_liberacao.sql`

Este é o mesmo SQL que **já rodou de verdade nesta rodada** no meu tenant (`eb-3009-clinica`): apagou o cliente com 905 contatos, 904 negócios, 159 mensagens, 159 execuções, a conta administradora, a sessão, a auditoria e o Vault do canal; a conferência depois deu 0. Troque `{{SLUG}}` por `teste-e2e`. Recusa `kamiguchi`; só apaga conta `clinica` cujos acessos estejam TODOS neste tenant.

```sql
do $$
declare v_cli uuid; v_contas uuid[]; v_vault uuid[]; n_aud int := 0; n_ct int := 0; n_cli int := 0; n_ses int := 0; n_cv int := 0;
begin
  if 'teste-e2e' = 'kamiguchi' then raise exception 'RECUSADO: kamiguchi é o cliente real'; end if;
  select id into v_cli from public.nx_clientes where slug = 'teste-e2e';
  if v_cli is null then raise notice 'LIMPEZA_TENANT teste-e2e: já removido'; return; end if;
  select coalesce(array_agg(c.id), '{}') into v_contas from public.nx_contas c
   where c.papel = 'clinica'
     and exists (select 1 from public.nx_acessos a where a.conta_id = c.id and a.cliente_id = v_cli)
     and not exists (select 1 from public.nx_acessos a where a.conta_id = c.id and a.cliente_id <> v_cli);
  select coalesce(array_agg(x), '{}') into v_vault from (
    select unnest(array[k.token_segredo, k.app_secret_segredo, k.codewords_api_segredo, k.codewords_hook_segredo]) as x
      from public.nx_canais k where k.cliente_id = v_cli) s where x is not null;
  select count(*) into n_cv from public.nx_contatos where cliente_id = v_cli;
  delete from vault.secrets where id = any(v_vault);
  delete from public.nx_auditoria where cliente_id = v_cli or conta_id = any(v_contas);
  get diagnostics n_aud = row_count;
  delete from public.nx_midia_lixo where cliente_id = v_cli;
  delete from public.nx_sessoes where conta_id = any(v_contas);
  get diagnostics n_ses = row_count;
  delete from public.nx_clientes where id = v_cli;
  get diagnostics n_cli = row_count;
  delete from public.nx_contas where id = any(v_contas);
  get diagnostics n_ct = row_count;
  raise notice 'LIMPEZA_TENANT teste-e2e: cliente=% contatos_que_iam_junto=% contas=% sessoes=% auditoria=% vault_apagados=%', n_cli, n_cv, n_ct, n_ses, n_aud, cardinality(v_vault);
end $$;

-- Histórico do ciclo horário (nx_execucoes.resumo): tira só a entrada de teste-e2e das linhas de ciclo (opcional; é só histórico).
update public.nx_execucoes e
   set resumo = jsonb_set(e.resumo, '{clientes}', coalesce((select jsonb_agg(x) from jsonb_array_elements(e.resumo -> 'clientes') x where x ->> 'cliente' <> 'teste-e2e'), '[]'::jsonb))
 where jsonb_typeof(e.resumo -> 'clientes') = 'array' and e.resumo::text like '%"teste-e2e"%';
```
Depois, conferir com `b08_varredura_eb3009.sql`/`b10` (varredura de prefixos): nenhuma linha; Vault 0 (o `teste-e2e` tem os 2 únicos secrets); `nx_clientes` = só `kamiguchi`; `nx_contas` = só o João. Para o `meta-3009`, se ainda existir, é o mesmo comando com `meta-3009` no lugar de `teste-e2e`.

Se a liberação quiser tirar a menção a `meta-3009` do histórico do ciclo (linha `nx_execucoes` id 95, ciclo das 22:07 UTC), é o mesmo `UPDATE` com `'meta-3009'` no lugar de `'teste-e2e'`.

---

## Bugs reais (NÃO corrigidos; código do produto não foi tocado)

1. **Logo largo fica POR CIMA do nome do produto no menu lateral (desktop).** O app marca o `<img>` como `largo` quando largura > 1,6 × altura (`web/app/app.js:265`) e o CSS só dimensiona (`web/app/app.css:529`, `width:auto; max-width:150px; height:32px`), mas a caixa `#lat-logo` segue com 36 px e o nome do produto (`#lat-produto`, `app.css:530`) continua no mesmo lugar. Medido em 1440: imagem x=18…114 (96 px), nome começa em x=66 → **48 px de sobreposição**; a captura mostra "EB-300…" escrito em cima do logo. A tela de entrada trata o caso (`login.js:32`: logo largo não repete o nome); o menu não. Como logos de agência costumam ser largos, atinge o white-label de verdade (qualquer revenda com logotipo horizontal). Sugestão: esconder `#lat-produto` (ou empurrá-lo) quando o `<img>` tiver a classe `largo`, como a entrada faz. No celular o topo só mostra o logo e não tem o problema.
   **Situação (30/09, depois desta rodada): corrigido em `e11770b`** — a caixa `#lat-logo` cresce com o logo largo e o nome vira `.sr-only` (fica para leitor de tela), como na entrada; outra pintura com logo quadrado devolve o nome; no menu só de ícones o logo largo encolhe para 36 px. Conferido no mock local a 1440 (logo 150 px, sem sobrepor o botão de recolher), 1440 recolhido e 1024. Teste de regressão em `testes/app.teste.mjs`.

## Observações (não são defeito de backend)

- **Linhas ignoradas na importação não têm motivo por linha.** Duplicadas (por telefone/e-mail) e vazias entram só na contagem `ignorados`; "Baixar erros em CSV" só traz erros e avisos. O dono da planilha não consegue ver QUAIS linhas foram tratadas como duplicadas (só quantas). Está de acordo com o ESPEC §5.3 (`ignorados` é contagem), mas é uma lacuna de UX.
- **Reimportar o mesmo arquivo duplica as linhas sem telefone e sem e-mail** (5 de 1.000 no teste): sem chave não há dedupe, e a tela não avisa. Por desenho, vale um aviso na tela.
- **`nx_canal_excluir` deixa as conversas do canal com `canal_id = null`** (elas e as mensagens ficam). Na tela, essas conversas viram "sem canal" e não dá para responder; só dá para religar pelo banco. Provavelmente intencional (não perder histórico), mas o texto de confirmação de excluir número deveria dizer isso.
- **O ciclo horário do Ads (`nx-ciclo`) inclui cliente de teste** e grava o slug dele em `nx_execucoes.resumo`, tabela sem `cliente_id`: apagar o tenant não limpa esse histórico (cuidado já embutido no `b09`/`b11`). Não afeta ninguém; só a varredura de resíduos.
- Cada "Salvar marca" grava uma linha de auditoria (`marca`/`tema`): 12 + 22 linhas nesta rodada por causa dos testes; nada a fazer.

## O que NÃO foi provado (ou feito)

- **IA real (com chave):** nenhuma chamada à Anthropic; o caso com chave continua pendente do João. Só o caso sem chave.
- **Importação pela tela:** não dirigi a tela passo a passo (arrastar arquivo, mapear colunas, barra de progresso, "Pausar", "Baixar erros"); usei as MESMAS funções puras (`crm-logica.js`) e o MESMO RPC em lotes. A página de importar carregou sem erro nas duas larguras. Tempos medidos com a rede incluída; o tempo só do servidor não foi separado.
- **Convite da gestora feito pelo super** (`nx_convite_criar` com `p_org` da revenda → conta nasce `gestor`) e o aceite por senha: a conta gestora foi criada por SQL, sem senha (ESPEC §8.5 item 3/4 P0-B; é do E2E-A).
- **Domínio real:** o host `app-…​.invalid` resolve a marca pela RPC (`nx_marca_publica`), mas o navegador não abriu esse host (servidor local em 127.0.0.1; o alias/CNAME no Netlify, o certificado e o redirecionamento `/` → `/app/` de verdade não foram testados). Os cabeçalhos do Netlify foram imitados por um servidor local, não testados no Netlify.
- **`sem_resposta` com `so_no_horario` ou com `departamento_id`:** não exercitados (só o caso base de 5 min).
- Dispositivo real, iOS Safari, Firefox, teclado virtual, gesto de toque real (arrastar cartão), leitor de tela; upload de logo grande (> 60 KB) e imagens reais de marca (só PNG pequeno enviado pelo seletor de arquivos).
- Concorrência real entre duas importações simultâneas do mesmo cliente.
- Relatórios (vendas/atendimento) e Ads do cliente de teste: fora do escopo desta etapa.

## Isolamento e limpeza (conferidos por SQL)

- **Nada fora do tenant de teste foi escrito:** `kamiguchi` com 0 auditoria, 0 histórico, 0 notificações, 0 eventos e 0 contatos desde o início da rodada; `teste-e2e` sem nenhum negócio além do 161333; as 7 RPCs de leitura e 2 de escrita (payload inválido) apontadas para `kamiguchi` e `teste-e2e` foram todas negadas (`sem_acesso`).
- **Limpeza do que EU criei (feita no fim; `b11` + `b09`):** org `eb-3009`, cliente `eb-3009-clinica` (905 contatos, 904 negócios, 4 conversas, 159 mensagens, 159 execuções, 8 notificações, 4 importações), 2 contas, 2 sessões, 1 canal (2 segredos do Vault, apagados por `nx_canal_excluir`), domínios, convites e 47 linhas de auditoria. Conferência final (b08, 22:19 UTC): **0 linhas** com `EB-3009`/`eb3009`/`5511930090xxx`/`5511930099xxx` em texto ou jsonb de qualquer tabela `nx_*`; 0 org, 0 cliente e 0 conta `eb-3009*`; **Vault = 2 (igual ao começo)**; sessões 4 (as 2 minhas saíram); `nx_ia_reservas` e `nx_ia_uso` = 0; eventos pendentes 0. O único resíduo que encontrei fora das tabelas com FK foi a entrada `eb-3009-clinica` no histórico do ciclo (`nx_execucoes` id 95, sem `cliente_id`): removida só essa entrada do JSON.
- Baseline do início (b08, 21:45 UTC): 1 org, 3 clientes (`kamiguchi`, `teste-e2e`, `meta-3009` do E2E-A), 4 contas, 6 sessões, Vault 2, 0 resíduos. Durante a rodada o E2E-A apagou o `meta-3009` (e as contas e sessões dele): por isso o total de hoje é 2 clientes, 2 contas e 4 sessões. O Vault passou por 4 enquanto o meu canal existia (2 do `teste-e2e` + 2 do meu), por 5 num instante em que o canal do E2E-A também existia, e terminou em 2, igual ao começo (os 2 do canal Meta do `teste-e2e`; conferido pelos ids das colunas de segredo de `nx_canais`, sem ler conteúdo).
