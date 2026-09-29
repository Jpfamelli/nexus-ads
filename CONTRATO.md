# NEXUS ADS — contrato de construção

Documento-fonte para quem constrói qualquer parte do sistema. As seções 0–6 descrevem
o Nexus Ads clássico. A seção 7 resume o SaaS Órbita; consulte também a especificação e
o estado de entrega antes de tratar qualquer módulo novo como publicado.

## 0. Visão geral

Central de tráfego pago **multi-cliente** da Nexus (agência de João Paulo, Taubaté-SP).
Primeiro cliente: clínica odontológica Kamiguchi. Fluxo:

```
Meta Ads + Google Ads ──(nx-ciclo, de hora em hora)──► nx_metricas_dia
WhatsApp da clínica ──(nx-whatsapp, webhook)─────────► nx_leads (com anúncio de origem)
nx-ciclo também roda o RADAR ──► nx_alertas ──► WhatsApp do gestor
nx-relatorio (8h diário / dia 1º mensal) ──► nx_relatorios ──► WhatsApp (+ leitura por IA)
Painel (GitHub Pages) ──(RPCs com token de sessão)──► tudo acima, por cliente
```

- Supabase: projeto `nexus-ads`, ref **`dtjznipitihnwmcgpzqh`**, região sa-east-1
- URL: `https://dtjznipitihnwmcgpzqh.supabase.co`
- Chave pública (painel): `sb_publishable_jy1CT7Lwi3gdPUAVSE791w_tOqYLVZr`
  (vai no header `apikey`; NÃO mandar `Authorization: Bearer` com ela)
- Funções: `https://dtjznipitihnwmcgpzqh.supabase.co/functions/v1/<nome>`
- Painel publicado em: `https://jpfamelli.github.io/nexus-ads/` (repo `Jpfamelli/nexus-ads`, pasta `web/` servida na raiz)
- Fuso de TODAS as datas: `America/Sao_Paulo`. "Ontem" é sempre o último dia fechado.

## 1. Banco (já aplicado — não recriar)

Todas as tabelas: RLS ligado, **sem política**, sem privilégio para anon/authenticated.
O painel só fala por RPC; as Edge Functions usam `service_role` (bypass de RLS).
As colunas/tabela em **negrito** e as RPCs internas de §2 vêm de
`supabase/migrations/20260927_melhorias.sql` (idempotente; aplicar de uma vez, ANTES do
deploy das funções).

| tabela | colunas principais |
|---|---|
| `nx_config` (1 linha, id=1) | cron_token, codigo_gestor, funcoes_url, painel_url, wa_access_token, wa_phone_number_id, wa_template, wa_verify_token, meta_app_secret, anthropic_api_key, modelo_ia (padrão `claude-opus-5`), google_api_versao |
| `nx_clientes` | id uuid, slug, nome, ativo, cfg jsonb, wa_phone_number_id (número da CLÍNICA na Cloud API, liga o webhook ao cliente) |
| `nx_integracoes` | id, cliente_id, canal ('meta'\|'google'), ativo, cred jsonb, ultimo_sync, status · unique(cliente_id, canal) |
| `nx_metricas_dia` | PK (cliente_id, plataforma, nivel, data, campanha_ext, anuncio_ext) · nivel 'campanha'\|'anuncio' · anuncio_ext = '' no nível campanha · campanha_nome, anuncio_nome, impressoes, alcance, frequencia, cliques, gasto numeric(12,2), conversoes numeric, valor_conversao, atualizado_em |
| `nx_leads` | id bigint, cliente_id, telefone (só dígitos), nome, origem ('anuncio'\|'whatsapp'\|'indicacao'\|'organico'\|'manual'\|'site'), plataforma ('meta'\|'google'\|null), campanha_ext, anuncio_ext, ctwa_clid, servico, etapa, data_conversa, data_agenda, data_consulta, valor, obs, criado_em, atualizado_em |
| `nx_alertas` | id, cliente_id, chave, regra, severidade ('critico'\|'alerta'\|'info'), mensagem, acao, valor, referencia date, criado_em, enviado_em, erro_envio, **wa_ids** text[], **wa_ids_template** text[], **entregue_em** |
| `nx_relatorios` | id, cliente_id, tipo ('diario'\|'mensal'), referencia date, texto, leitura_ia, destinos text[], enviado_em, erro, **wa_ids** text[], **wa_ids_template** text[], **entregue_em** · unique(cliente_id, tipo, referencia) |
| `nx_execucoes` | id, tarefa, inicio, fim, ok, resumo jsonb |
| `nx_travas` | nome text PK, ate timestamptz, dono text — trava com prazo, sempre POR CLIENTE (`nx-ciclo:<cliente_id>`, `nx-relatorio:<tipo>:<cliente_id>`) ou por recibo (`wa-reenvio:<wamid>`) |
| `nx_contas` / `nx_sessoes` / `nx_acessos` | login próprio (bcrypt), sessão = hash sha256 do token, 30 dias |

**Entrega do WhatsApp** (migração `supabase/migrations/20260927_melhorias.sql`):
`wa_ids` = wamid de cada TEXTO que a Cloud API aceitou (um por destino); `wa_ids_template` =
wamid de cada envio por TEMPLATE (fallback síncrono ou reenvio do webhook) — **template nunca
é reenviado**; `entregue_em` = primeiro recibo `delivered`/`read` de qualquer um desses
wamids (nulo = ainda sem confirmação). Índices GIN em `wa_ids` e `wa_ids_template`
(o webhook acha o envio com `or=(wa_ids.cs.{"<wamid>"},wa_ids_template.cs.{"<wamid>"})`).
Recibo `failed` acrescenta o motivo em `erro_envio` (alerta) / `erro` (relatório), separado
por " · ", sem apagar `enviado_em` (enviado = a API aceitou; entregue = chegou no celular).

**Etapas do paciente** (`nx_leads.etapa`): `nova` → `agendada` → `orcamento` (veio, avaliou, orçamento em aberto) → `fechou` | `nao_fechou`; ou `faltou`; ou `perdida`.

**`nx_clientes.cfg`** (tudo opcional; padrões em `nucleo.js → CFG_PADRAO`):
```json
{ "cpaAlvo": 15, "orcamento": 1500, "fee": 997, "nomeCurto": "Kamiguchi",
  "ticket": { "Aparelho invisível": 5500, "Implante": 3500, ... },
  "regrasOff": ["r4"], "assinatura": "João Paulo · Nexus",
  "waGestor": ["5512999998888"], "waCliente": ["5512997552370"] }
```
`waGestor` recebe alertas + relatório diário. `waCliente` recebe o resumo mensal (e `waGestor` recebe cópia).
Chaves só do painel (gravadas pelo gestor em Ajustes, via `nx_cliente_salvar`, que mescla):
`corMarca` (`"#RRGGBB"`), `logoUrl` (`data:image/(png|jpeg|webp);base64,…` ≤ 60 KB ou `https://…`;
nunca SVG) e `marcos` (`[{ "d": "AAAA-MM-DD", "t": "até 60 letras" }]`, no máximo 40, sempre
enviado inteiro). O servidor não lê nenhuma delas.

**Credenciais em `nx_integracoes.cred`** (mesmos nomes do indycar-ads):
- Meta: `meta_access_token`, `meta_ad_account_id` (com ou sem `act_`), `conta_nome`
- Google: `google_developer_token`, `google_customer_id`, `google_client_id`, `google_client_secret`, `google_refresh_token`, `google_login_customer_id` (opcional, MCC)

## 2. RPCs (POST `/rest/v1/rpc/<nome>` com JSON dos parâmetros)

Erros saem como exceção Postgres (HTTP 400/401/403 do PostgREST, `message` = código abaixo).
Códigos: `sessao_invalida`, `conta_pendente`, `credenciais_invalidas`, `codigo_invalido`,
`email_invalido`, `email_em_uso`, `senha_curta`, `nome_invalido`, `sem_acesso`, `so_gestor`,
`lead_nao_encontrado`, `cliente_nao_encontrado`, `nao_pode_rebaixar_a_si`, `papel_invalido`.

| RPC | parâmetros | retorno |
|---|---|---|
| `nx_criar_conta` | p_email, p_senha (≥8), p_nome, p_codigo? | {ok, papel, aprovado}. A 1ª conta EXIGE p_codigo = nx_config.codigo_gestor e vira gestor aprovado; as demais nascem `clinica` pendente |
| `nx_entrar` | p_email, p_senha | {token, nome, papel} |
| `nx_sair` | p_token | {ok} |
| `nx_sessao` | p_token | {conta:{id,nome,email,papel}, clientes:[{id,slug,nome,ativo,cfg}]} (gestor vê todos) |
| `nx_dados` | p_token, p_cliente uuid, p_dias int (padrão 130, 7–400) | ver §3 |
| `nx_lead_salvar` | p_token, p_cliente, p_lead jsonb | linha do lead. Sem `id` = cria. Com `id` = atualiza SÓ as chaves presentes (`nome, telefone, origem, plataforma, campanha_ext, servico, etapa, data_agenda, data_consulta, valor, obs`); string vazia zera o campo |
| `nx_cliente_salvar` (gestor) | p_token, p_cliente jsonb {id?, slug, nome, ativo?, cfg?, wa_phone_number_id?} | cliente. `cfg` é MESCLADO (`cfg || novo`) |
| `nx_integracao_salvar` (gestor) | p_token, p_cliente, p_canal, p_cred jsonb, p_ativo | igual a `nx_integracoes_status`. Campo vazio = mantém o valor antigo. **Nunca devolve credencial** |
| `nx_integracoes_status` | p_token, p_cliente | [{canal, ativo, ultimo_sync, status, preenchidos:[nomes dos campos com valor]}] |
| `nx_contas_listar` (gestor) | p_token | [{id,nome,email,papel,aprovado,criado_em,clientes:[uuid]}] |
| `nx_conta_definir` (gestor) | p_token, p_conta, p_aprovado, p_papel, p_clientes uuid[] | lista atualizada |
| `nx_config_ver` (gestor) | p_token | {webhook_url, wa_verify_token, painel_url, modelo_ia, wa_template, wa_phone_number_id, google_api_versao, tem_wa_token, tem_app_secret, tem_ia, ultimas_execucoes[]} |
| `nx_config_salvar` (gestor) | p_token, p_cfg jsonb (wa_access_token, wa_phone_number_id, wa_template, meta_app_secret, anthropic_api_key, modelo_ia, painel_url, google_api_versao) | igual a nx_config_ver. Segredo vazio = mantém |
| `nx_executar` (gestor) | p_token, p_tarefa ('nx-ciclo'\|'nx-relatorio'), p_corpo jsonb (ex.: {"cliente":"<uuid>"} ou {"tipo":"diario","cliente":"…","forcar":true}) | {ok, pedido} — dispara a função agora (assíncrono). Se o cron já estiver processando ESTE cliente na mesma função, o pedido é ignorado só para ele (ver `nx_travas`) |

**RPCs internas — só `service_role`** (revogadas de public/anon/authenticated; `security definer`,
`search_path = ''`). O painel NÃO as chama.

| RPC | parâmetros | retorno |
|---|---|---|
| `nx_lead_webhook` | p_cliente uuid, p_telefone text, p_variantes text[], p_nome text, p_atr jsonb {origem, plataforma, anuncio_ext, campanha_ext, ctwa_clid} \| null, p_hoje date, p_dias int = 30 | `'existente'` \| `'atribuido'` \| `'criado'`. Procura → decide → grava numa transação, com `pg_advisory_xact_lock(hashtextextended(p_cliente \|\| ':' \|\| <menor variante do número>, 0))`: webhooks paralelos da mesma pessoa (com ou sem 55/9) viram UM lead. Mesma regra de §5 nx-whatsapp |
| `nx_trava_pegar` | p_nome, p_segundos, p_dono | boolean — `insert … on conflict (nome) do update … where ate < now()`: true só para quem pegou (livre ou vencida). Faz faxina das vencidas há mais de 1 dia |
| `nx_trava_soltar` | p_nome, p_dono | boolean — apaga só se o dono bate (quem perdeu a trava por prazo não solta a do outro) |
| `nx_wa_anotar` | p_tabela ('nx_alertas'\|'nx_relatorios'), p_ids bigint[], p_entregue_em?, p_wa_id_template?, p_erro? | nº de linhas. Anotação atômica do webhook: `entregue_em` só se nulo; template acrescentado sem repetir; erro acrescentado com " · " sem repetir (máx. 1000) |

## 3. Formato de `nx_dados` (e das linhas que as funções montam)

```json
{ "hoje": "2026-09-27",
  "cliente": {"id","slug","nome","cfg"},
  "metricas": [{"p":"meta","d":"2026-09-26","n":"anuncio","c":"<campanha_ext>","cn":"<nome>",
                "a":"<anuncio_ext>","an":"<nome>","imp":0,"alc":0,"freq":0,"cli":0,"g":0,"conv":0}],
  "leads": [ linhas de nx_leads (id, nome, telefone, origem, plataforma, campanha_ext, anuncio_ext,
             servico, etapa, data_conversa, data_agenda, data_consulta, valor, obs) ],
  "alertas": [{regra, chave, severidade, mensagem, acao, referencia, criado_em, enviado_em, entregue_em}],
  "relatorios": [{tipo, referencia, texto, leitura_ia, enviado_em, erro, entregue_em}],
  "integracoes": [{canal, ativo, ultimo_sync, status}] }
```
- `entregue_em` (desde 20260927): nulo = sem confirmação de entrega ainda (ou o webhook do
  número da Nexus não está assinado). `enviado_em` preenchido + `entregue_em` nulo + `erro`
  começando com "WhatsApp não entregou" = a API aceitou, mas não chegou.
- `alertas[].regra` pode ser um id que o núcleo NÃO conhece: `'integracao'` (conexão com
  Meta/Google parada — gerado só no servidor, ver §5 nx-ciclo). O painel deve tratar id
  desconhecido sem quebrar.
As Edge Functions, ao ler o banco com service_role, **devem montar exatamente esse
formato de `metricas`/`leads`** e chamar `datasetDeLinhas(...)` do núcleo.

## 4. Núcleo compartilhado — `web/nucleo.js` (ESM puro, roda no navegador e no Deno)

Já existe e está testado (`testes/nucleo.teste.mjs`). As Edge Functions levam uma
CÓPIA byte a byte dele junto no deploy (`import { ... } from "./nucleo.js"`).

```js
import { datasetDeLinhas, montar, hojeSP, brl, brl0, int, pc, dec, esc, waHtml, fmtN,
         variacao, plural, nomePlat, CFG_PADRAO, cfgCom, MESES, MES3, SEMANA } from "./nucleo.js";
const ds = datasetDeLinhas({ metricas, leads, cliente, hoje: hojeSP(), dias: 130 });
const M = montar(ds);
// M.R = índice de ontem · M.DIAS · M.CFG (cfg com padrões) · M.NOME (nome curto)
// M.consolidar(linhas) · M.linhasDe(de, ate, {plat, camp, cri}) · M.crmTot(de, ate, {plat, camp, organicos})
// M.porDia(plat) · M.media7 · M.soma7 · M.valorLead(L) · M.etapa(L)
// M.ritmoMes(ref) · M.mesesDados() · M.situacaoOrc(proj)
// M.avaliar(ref, comRitmo) → [{regra:{id,nome,janela,nivel,...}, chave, sev, valor, msg, acao}]
// M.historico() → episódios [{desde, ate, a}] · M.textoAlerta(alertas)
// M.relDiario(ref, leituraIA?) · M.relMensal(mes, leituraIA?) · M.contextoIA(ref)
// M.dataDe(i) · M.ddmm(i) · M.dataBR(i) · M.dMes(i) · M.CAMP · M.CRI · M.LINHAS · M.LEADS · M.REGRAS
```
- Leads sem anúncio identificado viram "campanha" `org:<origem>` com `plat: null` e ficam
  FORA do funil de anúncios (`crmTot` ignora, salvo `{organicos:true}`); aparecem no kanban.
- `web/demo.js` → `gerarDemo({sal, hoje, nome, cfg})` devolve o MESMO dataset (modo `?demo`).
- Regras do radar: r1 custo por conversa (> cpaAlvo×1,35, 14 dias, campanha), r2 sem conversa
  (3 dias, gasto ≥ 22, crítico), r3 CTR < 0,9% (3 dias, criativo Meta), r4 frequência > 3
  (7 dias, criativo Meta) + ritmo do orçamento. `cfg.regrasOff` desliga por id.
  O servidor acrescenta a regra `integracao` (conexão parada), que não existe no núcleo nem
  em `cfg.regrasOff`: só aparece em `nx_alertas` / `nx_dados.alertas`.

## 5. Edge Functions (Deno) — todas com `verify_jwt: false` e autenticação própria

Arquivos em `supabase/functions/<nome>/`. Deploy pelo conector (sem CLI): cada função leva
seus arquivos (entrypoint `index.ts` + `nucleo.js` + módulos compartilhados copiados).
Variáveis já injetadas pelo Supabase: `SUPABASE_URL`, `SUPABASE_SERVICE_ROLE_KEY`.
Acesso ao banco: PostgREST com `apikey` + `Authorization: Bearer <service_role>`.

**Ordem de publicação:** a migração `20260927_melhorias.sql` vai ANTES do deploy das funções
(as funções novas chamam `nx_trava_pegar`, `nx_lead_webhook` e `nx_wa_anotar`; as funções
antigas continuam funcionando com a migração aplicada).

### nx-ciclo — POST, header `x-nx-cron` = `nx_config.cron_token` (senão 401)
Corpo opcional `{ "cliente": "<uuid>" }` (só esse cliente). Um cliente por vez: trava
`nx-ciclo:<cliente_id>` (170 s) em `nx_travas`, pega antes de processar cada cliente e solta
num `finally` (vence sozinha se a função for cortada). Cliente que outra execução já está
processando entra no resumo como `{ cliente, ok: true, pulado: "já em execução" }` e os outros
seguem — o botão de uma clínica NUNCA faz o cron pular as demais. Se TODOS os clientes pedidos
estavam travados → `{ ok: true, pulado: "já em execução" }` sem registrar em `nx_execucoes`.
Falha ao pegar a trava (ex.: função da migração ausente) = erro daquele cliente, sem processar.
Para cada cliente ativo:
1. **Sync**: para cada `nx_integracoes` ativa, janela dos últimos 7 dias (a atribuição do Meta
   muda dias passados), níveis `campanha` e `anuncio`, upsert em `nx_metricas_dia`
   (`on_conflict=cliente_id,plataforma,nivel,data,campanha_ext,anuncio_ext`,
   `Prefer: resolution=merge-duplicates`). Atualiza `ultimo_sync`/`status` ("ok — N linhas" ou
   "erro — mensagem"). Uma plataforma quebrada NÃO derruba a outra nem o próximo cliente.
   - Meta: porte do `indycar-ads/meta.js` (Graph `v23.0`, insights `time_increment=1`,
     conversões = conversas/leads/compras, paginação com teto de 60 páginas).
   - Google: porte do `indycar-ads/google.js` (OAuth refresh → searchStream, `cost_micros/1e6`,
     sem alcance/frequência). Versão da API: `nx_config.google_api_versao` se houver, senão
     tentar `["v23","v22","v21","v20"]` em ordem até uma não responder 404/UNIMPLEMENTED, e
     lembrar a que funcionou. Consultas por nível: campaign e ad_group_ad.
2. **Radar**: ler 45 dias de métricas + leads do cliente → `montar(datasetDeLinhas(...))` →
   `M.avaliar(M.R, true)`. Para cada alerta: se NÃO existe `nx_alertas` com a mesma `chave`
   criado nas últimas 24h → inserir (referencia = ontem). Os NOVOS vão num único texto
   `M.textoAlerta(novos)` para `cfg.waGestor`; marcar `enviado_em`/`erro_envio` e os wamids
   (`wa_ids`/`wa_ids_template`) numa escrita só, depois de todos os envios.
   - **Regra `integracao`** (aviso de conexão quebrada): cada integração cujo sync falhou vira
     um candidato `{regra: 'integracao', chave: 'integracao|<canal>', severidade: 'critico',
     valor: null, mensagem: "A conexão com o <Meta|Google> da <nome curto> parou: <erro curto>.
     Abra Ajustes → Integrações.", acao: <o que fazer>}` e segue o MESMO caminho do radar
     (deduplicação de 24h por chave, mesmo texto, mesmo WhatsApp). O erro técnico é traduzido
     por `explicarErroIntegracao(canal, erro)` (token vencido, sem permissão, developer token
     não aprovado, conta não encontrada…; nunca leva token). Erro passageiro (rede, 5xx, limite
     de consultas) só avisa se `ultimo_sync` tiver mais de 3 h (ou nunca sincronizou), com
     "(sem atualizar há mais de 3 h)". Voltou a funcionar → nada é enviado. Se o radar em si
     falhar, o aviso de integração sai assim mesmo.
3. Registrar `nx_execucoes` (tarefa 'nx-ciclo', ok, resumo por cliente) e responder JSON.

### nx-relatorio — POST, mesmo header; corpo `{ tipo: "diario"|"mensal", cliente?, forcar? }`
- Trava por tipo E cliente (`nx-relatorio:diario:<cliente_id>` / `nx-relatorio:mensal:<cliente_id>`,
  170 s), mesma regra do nx-ciclo: cliente travado → `pulado: "já em execução"` no resumo e os
  outros seguem (o relatório do dia roda uma vez só: um clique às 8h não tira o das outras
  clínicas); todos travados → `{ ok: true, tipo, pulado: "já em execução" }` sem registrar.
- Diário: referência = ontem (`M.R`). Se já existe `nx_relatorios(cliente,'diario',ref)` com
  `enviado_em` e não `forcar` → pular. Texto = `M.relDiario(M.R, leituraIA)`. Destinos: `cfg.waGestor`.
- Mensal: último mês COMPLETO de `M.mesesDados()`; referência = 1º dia desse mês. Texto =
  `M.relMensal(mes, leituraIA)`. Destinos: `cfg.waCliente` + `cfg.waGestor`.
- `leituraIA`: só se `nx_config.anthropic_api_key`. SDK oficial `import Anthropic from "npm:@anthropic-ai/sdk"`.
  Modelo = `nx_config.modelo_ia` (padrão `claude-opus-5`). `max_tokens: 16000`,
  `output_config: { effort: "medium" }`. Para `claude-opus-5`/`claude-fable-5-1` usar
  `client.beta.messages.create({ ..., betas: ["server-side-fallback-2026-07-01"], fallbacks: "default" })`
  (fallback automático se o modelo recusar); para outros modelos `client.messages.create` sem esses campos.
  System (pt-BR): gestor de tráfego da Nexus escrevendo para o dono da clínica ler no WhatsApp;
  diário: máx. 4 linhas curtas "• fato + causa provável + o que fazer", citar números, sem
  saudação; se estável, 1 linha. Mensal: 2–3 linhas "• ação para o próximo mês", linguagem de
  quem não é do marketing. User = `JSON.stringify(M.contextoIA(M.R))`.
  Checar `stop_reason === "refusal"` antes de ler o texto; juntar os blocos `type === "text"`.
  Erro (Anthropic.APIError / rede) → leitura por regras + registrar em `nx_relatorios.erro`.
  **Nunca** deixar a IA impedir o relatório.
- Enviar e gravar/atualizar `nx_relatorios` (upsert em cliente,tipo,referencia). Envio com
  ao menos um destino certo → grava `enviado_em`, os wamids novos e `entregue_em = null`
  (o webhook confirma de novo). Envio que falhou em todos os destinos não apaga horário,
  wamids nem entrega de um envio anterior que deu certo.

### nx-whatsapp — webhook da WhatsApp Cloud API
- GET (verificação): se `hub.mode=subscribe` e `hub.verify_token === nx_config.wa_verify_token`
  → 200 com `hub.challenge` em texto; senão 403.
- POST: validar `X-Hub-Signature-256` = `sha256=` + HMAC-SHA256(meta_app_secret, corpo CRU)
  com comparação em tempo constante; sem `meta_app_secret` configurado ou assinatura errada → 401.
  Um webhook, dois tipos de número (`value.metadata.phone_number_id`):
- **Número da CLÍNICA** (`nx_clientes.wa_phone_number_id`), `value.messages` → leads.
  Nome em `contacts[].profile.name`; para cada mensagem (`from` = telefone), tudo dentro da
  RPC `nx_lead_webhook` (uma transação, trava por cliente + telefone):
  - se já existe lead do mesmo cliente+telefone (variantes com/sem 55 e 9) com `data_conversa`
    nos últimos 30 dias: se a mensagem tem `referral` e o lead não tem `anuncio_ext` →
    completar a atribuição; senão nada.
  - senão criar lead: `origem` = 'anuncio' se `referral.source_type === "ad"`, senão 'whatsapp';
    `plataforma` = 'meta' se veio de anúncio; `anuncio_ext` = `referral.source_id`;
    `ctwa_clid` = `referral.ctwa_clid`; `campanha_ext` = buscar em `nx_metricas_dia` (nivel
    anuncio, mesmo cliente, anuncio_ext = source_id; feito no JS antes da RPC) se houver;
    `data_conversa` = hoje (SP); `etapa` = 'nova'.
  - `statuses` de número de clínica continuam ignorados.
- **Número da NEXUS** (`nx_config.wa_phone_number_id`), `value.statuses` → recibos dos avisos.
  Para cada recibo, acha o alerta/relatório pelo wamid (`wa_ids` OU `wa_ids_template`):
  - `sent`: ignorado. `delivered`/`read` → `entregue_em` (só se nulo; hora do `timestamp`).
  - `failed` → "WhatsApp não entregou (código X): <título>" (+ dica em português para os
    códigos comuns) em `erro_envio`/`erro`.
  - `failed` com código 131047 (ou "re-engagement") + `wa_template` configurado + o wamid que
    falhou é de TEXTO (não está em `wa_ids_template`) → reenvia como template para o
    `recipient_id`, com o MESMO título curto do envio original, acrescenta o wamid novo em
    `wa_ids_template` e registra "fora da janela de 24h — reenviado como template". Uma vez
    só: trava `wa-reenvio:<wamid>` (7 dias) barra o recibo repetido/simultâneo, e template
    nunca é reenviado (sem laço).
  - Recibo recente de wamid ainda não gravado (a Meta pode avisar antes de o nx-ciclo /
    nx-relatorio gravar) → espera 4 s e confere de novo, uma vez.
- Assinatura obrigatória em tudo. Assinatura válida → sempre 200 (mesmo com número
  desconhecido ou erro); um item com erro não derruba os outros do lote (resposta traz
  `erros` e o primeiro `erro`). O reenvio por template usa prazo de rede de 10 s.

### Envio de WhatsApp (módulo compartilhado)
Cloud API com `nx_config.wa_access_token` + `wa_phone_number_id` (número da NEXUS, não da clínica):
`POST https://graph.facebook.com/v23.0/{phone_number_id}/messages`, texto livre (limite 4096).
Número: só dígitos, prefixar `55` se tiver ≤ 11 dígitos. Se falhar por janela de 24h
(erro 131047 / "re-engagement") e `nx_config.wa_template` estiver definido → reenviar como
template (`language: pt_BR`, parâmetros do corpo: [título curto, link do painel]).
Sem WhatsApp configurado → não é erro fatal: registrar "whatsapp não configurado".
Um destino quebrado não impede os outros. `enviarParaTodos` devolve
`[{destino, ok: true, via: 'texto'|'template', id: <wamid>} | {destino, ok: false, erro}]`;
`idsDoEnvio(envio)` → `{wa_ids, wa_ids_template}` no formato do banco. `enviarTemplate(cfg,
destino, titulo)` é o mesmo template usado pelo webhook no reenvio.
A resposta 200 do envio NÃO garante entrega: fora da janela a Cloud API costuma aceitar e
só depois mandar o recibo `failed` 131047 no webhook do número da Nexus (ver nx-whatsapp).

## 6. Painel — `web/` (HTML/CSS/JS puro, ESM, sem build)

Base visual: o painel demo da Kamiguchi (`../kamiguchi-odontologia/painel.{html,css,js}`,
já revisado e corrigido). Identidade da **Nexus**: ink `#0B1B2B`, preto `#05080C`, bronze
`#B0761F`, creme `#F5E9D6`; fontes Clash Display (display) + Satoshi (corpo) via Fontshare
(`https://api.fontshare.com/v2/css?f[]=clash-display@600,700&f[]=satoshi@400,500,700&display=swap`)
+ IBM Plex Mono (Google Fonts). Cantos 16px, botões pílula (o dono pediu "menos quadrado").
Tudo gateado por `prefers-reduced-motion`; `[hidden]{display:none!important}` obrigatório;
grids com `minmax(0,1fr)` (nunca `1fr` puro — estoura a largura no celular).

Arquivos: `index.html`, `painel.css`, `painel.js` (UI), `dados.js` (cliente RPC),
`nucleo.js` e `demo.js` (prontos — NÃO alterar a lógica).
- `?demo` → sem login, `gerarDemo()`, faixa "Demonstração", somente leitura, tour ligado.
- Sem `?demo` → tela de login/criar conta (campo "código de ativação" só aparece se o
  servidor responder `codigo_invalido`, ou num link "primeiro acesso"). Token em
  `localStorage` (`nx-token`), `sessao_invalida` → volta pro login.
- Gestor: seletor de cliente no menu + aba **Ajustes** (cliente: nome, metas, tickets,
  destinos de WhatsApp, `wa_phone_number_id`, regras ligadas; integrações Meta/Google com
  campos de credencial tipo password que nunca são preenchidos de volta, só "✓ preenchido";
  botões "Atualizar dados agora"/"Gerar relatório agora" via `nx_executar`; contas pendentes
  com aprovação e vínculo a clientes; configuração global: WhatsApp da Nexus, template,
  app secret, chave da IA, modelo, e o webhook URL + verify token para copiar).
- Clínica: vê só os clientes vinculados; sem Ajustes.
- Abas: Visão geral, Campanhas, Pacientes, Radar, Relatórios (+ Ajustes p/ gestor).
- Pacientes (real): clicar num cartão abre gaveta para mudar etapa (ao marcar `agendada`
  pede data da consulta e grava `data_agenda` = hoje se vazia; `fechou` pede valor com
  sugestão do ticket do serviço e grava `data_consulta` = hoje se vazia), serviço, origem,
  observação. Botão "+ Paciente" cria lead manual (indicação, orgânico…). Salvar →
  `nx_lead_salvar` → recarregar dados.
- Radar (real): mostra `M.historico()` calculado no navegador + o registro de `alertas` do
  servidor ("enviado no WhatsApp às HH:MM"; com `entregue_em`, "entregue às HH:MM").
  Alerta com `regra` que o núcleo não conhece (`integracao`) aparece NO TOPO da lista com nome
  próprio ("Conexão com Meta" / "Conexão com Google") e leva o gestor a Ajustes → Integrações.
  Regras: switch grava `cfg.regrasOff` (gestor).
- Relatórios (real): últimos relatórios do servidor (`relatorios` de nx_dados) + prévia
  calculada no navegador para o dia/mês escolhido.
- Estado vazio honesto: cliente sem integração/sem dados → cartão explicando o próximo passo
  (gestor: "Conecte o Meta/Google em Ajustes"; clínica: "Os números aparecem aqui assim que
  os anúncios começarem a rodar").

### 6.1 Plano-sequência noturno (visual v2)

Três camadas, três leis. **Palco** (`web/cinema.js`): um fundo escuro único `#07090C` atrás
de tudo, login incluído — bokeh quente em canvas a 0,34× (semente: painel 1, login 3, curta 5),
2 vazamentos de luz, grão, vinheta e respiração de ±4 px. Só ele se move sem parar; pausa com a
aba oculta, é estático no celular (≤ 700 px ou toque) e vira 1 quadro fixo com `?noanim` ou
`prefers-reduced-motion`. **Objetos**: herói de vidro fumê (`--vidro`, único com
`backdrop-filter`, junto de topbar/tabbar/gaveta), cartões de dados opacos (`--surface` a 94%),
papel creme (`--papel #F3E9D8` / `--papel-txt #16212C`) nas fichas do kanban, telas de
WhatsApp, cartão do login e tour; celulares de verdade (`.fone`, `--fw` = largura). **Câmera**
(`web/efeitos.js`): uma lente só — tokens no `:root` do `painel.css` (`--e-out`, `--e-io`,
`--e-gaveta`, `--mola`, `--mola-suave`, `--t-micro 120ms`, `--t-ui 220ms`, `--t-move 620ms`,
`--t-dados 900ms`, `--escada 40ms`…); nenhuma curva nem duração solta fora do `:root`, nunca
ease-in. Blocos `[data-cena]` entram em quadro uma vez (puxada de foco); depois os números
rolam como odômetro do valor anterior (`data-k`) e as barras interpolam (FLIP).

- **Fontes locais** em `web/fonts/` com nomes próprios na frente da pilha: `"Nx Clash"`
  (200–700), `"Nx Satoshi"` (300–900), `"Nx Plex"` (500), `"Nx Zodiak"` (itálico, só na
  narração da Leitura e nas legendas do curta). Preload de Clash e Satoshi. Os `<link>` da
  Fontshare/Google continuam no HTML como **reserva** (`media="print" data-reserva`): não
  bloqueiam nem baixam nada; o `painel.js` só os liga se as locais falharem. O conteúdo espera
  as fontes (teto de 1,2 s) sobre o palco já aceso — nunca sai em Segoe.
- Escala: Clash só a partir de 20 px (títulos, números grandes); h2 dos cartões em Satoshi 700
  17 px; rótulos em Plex 11 px (nunca menos); botões Satoshi 600 14–15 px, só a inicial
  maiúscula; rótulos da tabbar ≥ 10 px.
- Status no escuro: ok `#7FD1A5`, ruim `#F08A74`, atenção `#E5B35C`, Meta `#6FA3CF`,
  Google `#CF9540`. Número grande em `--fg` ou `--bronze-luz #E2B066` (≥ 7:1). Foco: anel
  `#CF9540` de 2 px, offset 3 px. Tiques de WhatsApp nunca em azul (azul = "lido").
- Monograma N×X (diagonal bronze compartilhada) como `<symbol id="nx-mono">` inline: menu,
  topo do celular, avatar da Nexus nos celulares e favicon. Vinheta de abertura (≤ 1,2 s,
  1× por sessão, `sessionStorage nx-vinheta`, pula com clique/tecla).
- URL: `?aba=<geral|campanhas|pacientes|radar|relatorios|ajustes>` tem precedência sobre o
  `#hash` (capturas headless) e sai da URL depois de aplicado (fica o `#aba`: o F5 volta para a
  aba em que a pessoa estava); `?noanim` = quadro final estático e determinístico.
- Topo (desktop): duas linhas — [selo · eyebrow ··· leitura] e [título ··· filtros · Tour ·
  Apresentar], na mesma posição em todas as abas. Ao rolar, gruda com `top` negativo (`--cima`,
  medido no `painel.js`): fica só a faixa de baixo (~64 px) com o título em 20 px. Só opacity e
  transform (o conteúdo não pula). Na demo a pílula diz só "Demonstração" (a data já está ao lado).
- Clash: todo texto nela leva `word-spacing: var(--ws-d)` (o espaço dela, e o NBSP de "R$ 1.314",
  é estreito) e o tracking nunca passa de −.02em.
- Degradação: `efeitos.js` e `cinema.js` entram por `import()` dinâmico com `catch`; sem eles
  o painel funciona igual (sem `.cena-on`, nada fica escondido). Efeitos de mouse (luz do
  cursor, cantos de autofoco, luz-chave, tilt só no herói ≤ 2° e nos celulares ≤ 6°, botões
  magnéticos) só com `pointer:fine`. Números, tabelas, régua, kanban e formulários nunca se
  movem com o mouse.
- Linguagem de consultório onde o dentista lê ("Cada R$ 1 investido virou R$ 5,41", "de cada
  100 que viram, 2 tocaram"); o gestor continua vendo CTR/ROAS. O retorno é o MESMO de sempre
  (tratamentos ÷ (anúncios + gestão)), só reescrito — no herói, no curta e na folha. O "só
  anúncio" aparece como apoio (folha: "só anúncio: R$ X"; Campanhas: coluna "Retorno do anúncio").
  No Radar, a clínica lê os nomes e as condições das regras em linguagem leiga (o técnico fica no
  `title`) e, depois de "CTR de 0,83%", a conta "(de cada 100 que viram, menos de 1 tocou)". Nos objetos, só primeiro nome + inicial;
  notificação de lead real diz "Chamou pelo anúncio «…»" (nunca texto de mensagem inventado).

### 6.2 Recursos da reunião (curta, folha, marca, celebração)

Módulos por `import()` dinâmico com `catch` (versão `?v=` no caminho): `curta.js` (modo
apresentação), `folha.js` (folha A4), `marca.js` (logo → webp ≤ 60 KB e cores sugeridas),
`paleta.js` (Ctrl/⌘+K), `arrastar.js` (kanban). CSS próprio em `recursos.css`. Sem eles o
painel segue de pé. Todos os números saem das mesmas funções de `M` (herói = régua = curta =
folha); a folha repete os números do resumo mensal do WhatsApp (investido, tratamentos,
pacientes, vezes na tela), mas o "Cada R$ 1 investido virou" dela soma a gestão do mês, como o
herói e o curta (o "só anúncio" do resumo fica como linha de apoio).

- **Envios** (`statusEnvio`): `!` não enviado/não entregue · `✓` enviado (entrega ainda não
  confirmada) · `✓✓` entregue às HH:MM (`entregue_em`). Nunca azul. Relatórios, avisos do
  Radar e o celular de prévia usam a mesma régua; o item expandido mostra a linha do tempo.
  Relatório que não saiu não ganha hora no balão (escreve "não enviado !") nem "chega" na tela
  bloqueada.
- **Conexão** (`estadoIntegracao`): pílula no topo (ok "Atualizado há X min" · âmbar "Leitura
  atrasada" > 2 h · tijolo "<canal> desconectado" com `status` começando por `erro` ou aviso
  `integracao` das últimas 24 h sem leitura boa depois). Faixa `role=status` em todas as abas;
  células da régua do canal parado com "leitura parada em DD/MM". "Próxima leitura" = última
  leitura + 1 h (o ciclo é de hora em hora). O popover repete o recado da faixa (ele pode
  cobri-la) e a conexão caída conta como alerta ativo no status do Radar e no badge do menu.
- **URL**: `?clinica=<nome ≤ 40>` e `?cor=RRGGBB` (só na demo: `gerarDemo({nome})` + marca;
  números iguais) · `?apresentar` (cartão "Começar ▶") e `?cena=1–7` · `?folha=AAAA-MM` (só mês
  fechado com números de anúncio) · `?simular=integracao` (só na demo; ignorado no modo real).
  Teclas fora de campos de texto: `P` apresenta, `1/2/3` = 7/30/60 dias, Ctrl/⌘+K busca.
- **Marca da clínica** (`aplicarMarca`): `--marca`, `--marca-txt` (preto ou branco pelo
  contraste ≥ 4,5:1), `--marca-suave`, `--marca-escura`. Só nos objetos (selo do topo, celular
  do Resumo, post/cartões/recibo do curta, faixa da folha); nunca em menu, CTA da Nexus ou
  status. Nome sempre por `textContent`; logo só por `img.src` validado.
- **Kanban**: "Não seguiu" só oferece os motivos da coluna de origem (Nova conversa → "Não
  agendou"; Agendada → "Faltou" ou "Não agendou"; Orçamento/Fechou → "Avaliou e não fechou"):
  nunca inventa uma consulta.
- **Demo**: relatórios e avisos de EXEMPLO (chip "exemplo") gerados no `painel.js`; arrastar
  e celebrar só na memória (recarregar volta a 106 / 44 / 13 / R$ 13.550); simulador "E na sua
  clínica?" só existe na demo (faixa ±20%, "não é promessa").
- **Armazenamento local** (conveniência, sempre em `try/catch`): `nx-recentes` (paleta),
  `nx-fechados-<cliente>` ("Desde a sua última visita", só conta de clínica), `sessionStorage
  nx-vinheta` (abertura 1× por sessão). O que precisa durar vai no `cfg`.

## 7. SaaS Órbita

O app em `web/app/` é a camada multiempresa da plataforma. O Nexus Ads clássico permanece
em `web/`; os dois usam o mesmo projeto Supabase e o mesmo núcleo de métricas de anúncios.
O app não é liberado por existir código: `web/app/prontos.js` é a lista de módulos aceitos,
e `docs/orbita/estado/` registra os resultados de cada frente.

### 7.1 Empresas e permissões

- Uma organização (`nx_orgs`) pertence à Nexus ou a uma revenda. Ela reúne contas, clientes,
  planos e configuração de marca. Cada cliente (`nx_clientes`) tem a própria equipe, módulos,
  canais, funis e dados.
- Sessões próprias usam token aleatório no navegador; no banco é armazenado somente o hash.
  `nx_ctx` valida sessão, organização, cliente, papel, estado da conta e acesso ao módulo.
- Papéis efetivos: gestor de plataforma/revenda, admin, supervisor, atendente e leitura.
  Limites de planos são aplicados no servidor, inclusive os totais da organização de revenda.
- RLS está habilitada nas tabelas. O navegador não recebe acesso direto a tabelas: usa RPCs
  explicitamente concedidas a `anon`/`authenticated`; funções internas ficam restritas a
  `service_role`. Tokens de Meta, Google, WhatsApp e IA nunca voltam nas respostas do painel.

### 7.2 CRM e WhatsApp

- `nx_contatos` guarda a ficha do contato; `nx_leads` guarda cada oportunidade. A mesma
  oportunidade alimenta o CRM e o cálculo de retorno de anúncios. Funis fora de Ads são
  excluídos desse cálculo. Ganhos podem iniciar um negócio separado de pós-venda.
- `nx_cv_*` atende conversas, mensagens, canais, departamentos, responsáveis, notas, modelos
  e recibos. A integração padrão é a WhatsApp Cloud API oficial. Webhooks autenticados criam
  ou localizam contato e oportunidade; CTWA preserva campanha, anúncio e `ctwa_clid`.
- Organizações com plano CodeWords que inclua API podem conectar um workflow como canal: a
  chave reutilizável `cwk-` fica no Vault, o Órbita envia texto pelo Runtime API e recebe mensagens,
  ecos de saída e recibos pela URL secreta do canal. Recibos anteriores ao eco ficam numa fila
  transacional por até sete dias e são aplicados quando a mensagem outbound é gravada. Os eventos usam o mesmo CRM e inbox. O MVP
  não envia mídia nem modelos Meta; `cwotk-` de uso único não serve para essa conexão contínua.
- Mídia fica em bucket privado, com URLs temporárias. O servidor aplica a janela de 24 horas,
  consentimento de marketing e opt-out. Sugestões de IA voltam como rascunho para revisão
  humana; a IA não envia mensagens sozinha.

### 7.3 Anúncios, automações e marca

- O módulo Ads usa `nx_dados` e `web/nucleo.js`, o mesmo cálculo do painel clássico. O funil
  de Ads filtra CRM, radar, campanhas e relatórios da mesma forma.
- `nx_eventos`, automações e filas executam gatilhos em lotes curtos, com deduplicação,
  limite de profundidade e respeito aos horários e opt-out.
- A marca da organização define nome, logo, favicon, cores e domínio. As cores são derivadas
  de tokens CSS com contraste verificado. A personalização de domínio requer ativação no host.

### 7.4 Publicação e estado de liberação

- O app é servido a partir de `web/app/` no host do SaaS. A raiz do Netlify redireciona para
  `/app/`; GitHub Pages continua servindo o painel clássico.
- Edge Functions são montadas em diretórios planos com `node scripts/montar-funcoes.mjs` e
  publicadas a partir de `supabase/dist/<nome>/`, com `verify_jwt: false` e autenticação
  própria em cada handler.
- `MODULOS_PRONTOS` e `CONFIG_PRONTAS` só recebem módulos depois dos aceites definidos em
  `docs/orbita/ESPEC.md` e verificados no ambiente real. Até lá, os caminhos não liberados
  ficam fora do menu de clientes.
- Para o status exato, confira `docs/orbita/estado/ESTADO.md` e os detalhes de cada frente em `docs/orbita/estado/F1.md`…`F8.md`.
  O runner local é `node testes/rodar-tudo.mjs`; ele executa serialmente a suíte Node, não
  substitui os smokes SQL nem os E2E no Supabase/host.
