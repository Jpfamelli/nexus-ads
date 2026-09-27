# NEXUS ADS — contrato de construção

Documento-fonte para quem constrói qualquer parte do sistema. Tudo que está aqui
**já existe e foi testado** (banco, RPCs, agendamento, núcleo, gerador demo). Não
mude nomes, assinaturas ou formatos daqui sem atualizar este arquivo.

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

| tabela | colunas principais |
|---|---|
| `nx_config` (1 linha, id=1) | cron_token, codigo_gestor, funcoes_url, painel_url, wa_access_token, wa_phone_number_id, wa_template, wa_verify_token, meta_app_secret, anthropic_api_key, modelo_ia (padrão `claude-opus-5`), google_api_versao |
| `nx_clientes` | id uuid, slug, nome, ativo, cfg jsonb, wa_phone_number_id (número da CLÍNICA na Cloud API, liga o webhook ao cliente) |
| `nx_integracoes` | id, cliente_id, canal ('meta'\|'google'), ativo, cred jsonb, ultimo_sync, status · unique(cliente_id, canal) |
| `nx_metricas_dia` | PK (cliente_id, plataforma, nivel, data, campanha_ext, anuncio_ext) · nivel 'campanha'\|'anuncio' · anuncio_ext = '' no nível campanha · campanha_nome, anuncio_nome, impressoes, alcance, frequencia, cliques, gasto numeric(12,2), conversoes numeric, valor_conversao, atualizado_em |
| `nx_leads` | id bigint, cliente_id, telefone (só dígitos), nome, origem ('anuncio'\|'whatsapp'\|'indicacao'\|'organico'\|'manual'\|'site'), plataforma ('meta'\|'google'\|null), campanha_ext, anuncio_ext, ctwa_clid, servico, etapa, data_conversa, data_agenda, data_consulta, valor, obs, criado_em, atualizado_em |
| `nx_alertas` | id, cliente_id, chave, regra, severidade ('critico'\|'alerta'\|'info'), mensagem, acao, valor, referencia date, criado_em, enviado_em, erro_envio |
| `nx_relatorios` | id, cliente_id, tipo ('diario'\|'mensal'), referencia date, texto, leitura_ia, destinos text[], enviado_em, erro · unique(cliente_id, tipo, referencia) |
| `nx_execucoes` | id, tarefa, inicio, fim, ok, resumo jsonb |
| `nx_contas` / `nx_sessoes` / `nx_acessos` | login próprio (bcrypt), sessão = hash sha256 do token, 30 dias |

**Etapas do paciente** (`nx_leads.etapa`): `nova` → `agendada` → `orcamento` (veio, avaliou, orçamento em aberto) → `fechou` | `nao_fechou`; ou `faltou`; ou `perdida`.

**`nx_clientes.cfg`** (tudo opcional; padrões em `nucleo.js → CFG_PADRAO`):
```json
{ "cpaAlvo": 15, "orcamento": 1500, "fee": 997, "nomeCurto": "Kamiguchi",
  "ticket": { "Aparelho invisível": 5500, "Implante": 3500, ... },
  "regrasOff": ["r4"], "assinatura": "João Paulo · Nexus",
  "waGestor": ["5512999998888"], "waCliente": ["5512997552370"] }
```
`waGestor` recebe alertas + relatório diário. `waCliente` recebe o resumo mensal (e `waGestor` recebe cópia).

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
| `nx_executar` (gestor) | p_token, p_tarefa ('nx-ciclo'\|'nx-relatorio'), p_corpo jsonb (ex.: {"cliente":"<uuid>"} ou {"tipo":"diario","cliente":"…","forcar":true}) | {ok, pedido} — dispara a função agora (assíncrono) |

## 3. Formato de `nx_dados` (e das linhas que as funções montam)

```json
{ "hoje": "2026-09-27",
  "cliente": {"id","slug","nome","cfg"},
  "metricas": [{"p":"meta","d":"2026-09-26","n":"anuncio","c":"<campanha_ext>","cn":"<nome>",
                "a":"<anuncio_ext>","an":"<nome>","imp":0,"alc":0,"freq":0,"cli":0,"g":0,"conv":0}],
  "leads": [ linhas de nx_leads (id, nome, telefone, origem, plataforma, campanha_ext, anuncio_ext,
             servico, etapa, data_conversa, data_agenda, data_consulta, valor, obs) ],
  "alertas": [{regra, chave, severidade, mensagem, acao, referencia, criado_em, enviado_em}],
  "relatorios": [{tipo, referencia, texto, leitura_ia, enviado_em, erro}],
  "integracoes": [{canal, ativo, ultimo_sync, status}] }
```
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

## 5. Edge Functions (Deno) — todas com `verify_jwt: false` e autenticação própria

Arquivos em `supabase/functions/<nome>/`. Deploy pelo conector (sem CLI): cada função leva
seus arquivos (entrypoint `index.ts` + `nucleo.js` + módulos compartilhados copiados).
Variáveis já injetadas pelo Supabase: `SUPABASE_URL`, `SUPABASE_SERVICE_ROLE_KEY`.
Acesso ao banco: PostgREST com `apikey` + `Authorization: Bearer <service_role>`.

### nx-ciclo — POST, header `x-nx-cron` = `nx_config.cron_token` (senão 401)
Corpo opcional `{ "cliente": "<uuid>" }` (só esse cliente). Para cada cliente ativo:
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
   `M.textoAlerta(novos)` para `cfg.waGestor`; marcar `enviado_em`/`erro_envio`.
3. Registrar `nx_execucoes` (tarefa 'nx-ciclo', ok, resumo por cliente) e responder JSON.

### nx-relatorio — POST, mesmo header; corpo `{ tipo: "diario"|"mensal", cliente?, forcar? }`
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
- Gravar/atualizar `nx_relatorios` (upsert em cliente,tipo,referencia) e enviar.

### nx-whatsapp — webhook da WhatsApp Cloud API
- GET (verificação): se `hub.mode=subscribe` e `hub.verify_token === nx_config.wa_verify_token`
  → 200 com `hub.challenge` em texto; senão 403.
- POST: validar `X-Hub-Signature-256` = `sha256=` + HMAC-SHA256(meta_app_secret, corpo CRU)
  com comparação em tempo constante; sem `meta_app_secret` configurado ou assinatura errada → 401.
  Para cada `entry[].changes[].value` com `messages`: `metadata.phone_number_id` → cliente
  (`nx_clientes.wa_phone_number_id`); nome em `contacts[].profile.name`; para cada mensagem
  (`from` = telefone):
  - se já existe lead do mesmo cliente+telefone com `data_conversa` nos últimos 30 dias:
    se a mensagem tem `referral` e o lead não tem `anuncio_ext` → completar a atribuição; senão nada.
  - senão criar lead: `origem` = 'anuncio' se `referral.source_type === "ad"`, senão 'whatsapp';
    `plataforma` = 'meta' se veio de anúncio; `anuncio_ext` = `referral.source_id`;
    `ctwa_clid` = `referral.ctwa_clid`; `campanha_ext` = buscar em `nx_metricas_dia` (nivel
    anuncio, mesmo cliente, anuncio_ext = source_id) se houver; `data_conversa` = hoje (SP);
    `etapa` = 'nova'.
  - Ignorar `statuses` (recibos). Responder 200 rápido sempre que a assinatura for válida
    (mesmo que o número não seja de nenhum cliente).

### Envio de WhatsApp (módulo compartilhado)
Cloud API com `nx_config.wa_access_token` + `wa_phone_number_id` (número da NEXUS, não da clínica):
`POST https://graph.facebook.com/v23.0/{phone_number_id}/messages`, texto livre (limite 4096).
Número: só dígitos, prefixar `55` se tiver ≤ 11 dígitos. Se falhar por janela de 24h
(erro 131047 / "re-engagement") e `nx_config.wa_template` estiver definido → reenviar como
template (`language: pt_BR`, parâmetros do corpo: [título curto, link do painel]).
Sem WhatsApp configurado → não é erro fatal: registrar "whatsapp não configurado".
Um destino quebrado não impede os outros.

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
  servidor ("enviado no WhatsApp às HH:MM"). Regras: switch grava `cfg.regrasOff` (gestor).
- Relatórios (real): últimos relatórios do servidor (`relatorios` de nx_dados) + prévia
  calculada no navegador para o dia/mês escolhido.
- Estado vazio honesto: cliente sem integração/sem dados → cartão explicando o próximo passo
  (gestor: "Conecte o Meta/Google em Ajustes"; clínica: "Os números aparecem aqui assim que
  os anúncios começarem a rodar").
