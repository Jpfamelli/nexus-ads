# Estado geral do Órbita

Atualizado: 2026-09-29 08:15 (America/Sao_Paulo)
Branch: `codex/orbita`
PR: [#1](https://github.com/Jpfamelli/nexus-ads/pull/1) — rascunho aberto

## Situação

O código das frentes está no branch para revisão. **O SaaS ainda não está publicado nem pronto para uso por clientes.** `web/app/prontos.js` mantém os módulos bloqueados até os aceites E2E. Os 10 smokes SQL reais passaram em transações revertidas; não houve alteração persistente de dados nem de `nx_config` nesta retomada.

## Frentes

| Frente | Código/revisão | Estado de publicação |
|---|---|---|
| F1 — banco | Migrações `20260928a…h` aplicadas conforme o handoff e o `AGENTS.md` | Não revalidado nesta retomada |
| F2 — funções | Handlers e testes locais preparados para seis funções | Deploy do Órbita pendente; em produção permanecem as três funções v2 anteriores |
| F3 — acesso e white-label | Implementação local existente; módulos dependem do aceite geral | Sem URL Netlify confirmada |
| F4 — CRM | Implementação, revisão e testes aprovados | `04_crm.sql` e `04_crm_b.sql` passaram no Supabase com `ROLLBACK` |
| F5 — conversas | Implementação local e testes Node aprovados; revisão anterior aprovada conforme o handoff | Webhook/API real e E2E pendentes |
| F6 — anúncios e relatórios | Implementação local e testes Node aprovados; revisão anterior aprovada conforme o handoff | Integrações e E2E reais pendentes |
| F7 — automações | Implementação local e testes Node aprovados; revisão anterior aprovada conforme o handoff | Execução real e E2E pendentes |
| F8 — entrega | Runner serial e 10 smokes SQL reais aprovados; documentação e gating no branch | Deploy das funções, Netlify e E2E pendentes |

## Verificações locais

`node testes/rodar-tudo.mjs` passou em 11/11 suítes. Contagens: painel 70; app 46; CRM 34; conversas 33; relatórios 38; funções 39; scripts 12; funções de conversas 46; automações 24; isolamento estrutural 3; núcleo aprovado.

Nesta retomada, Chrome headless abriu o login em 375×812 e 390×844. Nos dois tamanhos `documentElement.scrollWidth` e `body.scrollWidth` bateram com a largura do viewport; o formulário apareceu e não houve erros de console. Isso valida somente o shell de login: sem backend autenticado, as telas e fluxos internos continuam sem verificação mobile. A suíte Node mais recente segue em 11/11; os testes de app, CRM e painel passaram 46/46, 34/34 e 70/70.

Nesta retomada, os seis entrypoints das Edge Functions passaram por `deno check` após validarem explicitamente as duas variáveis Supabase obrigatórias; os handlers também tipam `emSegundoPlano`. `node scripts/montar-funcoes.mjs` gerou as seis pastas planas; `node testes/rodar-tudo.mjs` passou 11/11 e `git diff --check` passou.

O smoke `supabase/testes/09_isolamento.sql` agora prepara a org Nexus e uma revenda B, contas admin/atendente, entidades de teste, varredura de RPCs concedidas a `anon` derivada de `pg_proc` e comparação de hash antes/depois das linhas de B. A sonda reconhece que `nx_sair` é idempotente e aceita somente a resposta pública exata `[{"ok":true}]` sem sessão; qualquer outro conteúdo ainda reprova. As 14 migrations e os 10 smokes SQL (`01` a `09`, incluindo os dois CRM) passaram numa instância efêmera PGlite. Esse ensaio usou stubs para pgcrypto/unaccent, Vault, Storage e pg_cron, e omitiu índices que dependem do pg_trgm; é uma checagem local de sintaxe e comportamento, não substitui a execução em PostgreSQL/Supabase. O aceite real de `04_crm.sql`, `04_crm_b.sql` e `09_isolamento.sql` continua pendente.

## Bloqueios e próximo passo

Bloqueios atuais: CLI/MCP Supabase ou Netlify não estão disponíveis para publicar as seis funções ou vincular o host; não existe tenant `teste-e2e` dedicado nem URL Netlify confirmada. Assim, E2E-A/B e validação mobile autenticada permanecem pendentes. `prontos.js` continua bloqueando os módulos, a `main` não foi publicada e o PR #1 permanece draft.

Na retomada das 01:22, o painel web do Supabase abriu o projeto correto, mas ainda não havia consulta. A política do navegador bloqueou abrir os arquivos SQL locais como página; sem um conector Supabase MCP, os smokes integrais continuavam pendentes. A retomada das 01:37 confirmou acesso de leitura pelo Dashboard, conforme registrado abaixo. Nenhum token foi usado; revogar os tokens que ficaram visíveis durante a tentativa.

## Retomada 2026-09-29 01:37

O Dashboard autenticado no projeto `dtjznipitihnwmcgpzqh` respondeu a consultas somente leitura: banco `postgres`, 35 migrations registradas e tabelas `nx_leads`, `nx_funis`, `nx_conversas` e `nx_canais` presentes. `demo-clinica` e `teste-e2e` não existem. Nenhuma escrita, exclusão, alteração em `nx_config` ou uso de credenciais ocorreu. O MCP ainda não aparece no catálogo deste chat; a validação integral de F4/F8 continua pendente.

## Retomada 2026-09-29 01:44

O Dashboard segue autenticado no projeto `dtjznipitihnwmcgpzqh`. Consultas somente leitura confirmaram 35 migrations no total e 32 registros nas versões `20260928%`/`20260929%`, com registros de CRM, conversas, plataforma, automações e funções. A lista de Edge Functions mostra apenas `nx-ciclo`, `nx-relatorio` e `nx-whatsapp`; as funções novas do Órbita ainda não foram publicadas. `demo-clinica` e `teste-e2e` estão ausentes. Nenhuma escrita, exclusão, leitura de `nx_config` ou uso de credenciais ocorreu.

O Codex não recebeu ferramenta Supabase MCP e o CLI segue sem autenticação. Os smokes `04_crm.sql`, `04_crm_b.sql` e `09_isolamento.sql` continuam sem execução real; a contagem de migrations não substitui esse aceite. Netlify permanece sem site vinculado. Não houve deploy. A suíte local e a montagem de funções passaram na verificação anterior (11/11); `deno` não está instalado nesta sessão. O projeto continua não publicado e não pronto para clientes.

## Retomada 2026-09-29 02:48

Revisão da documentação da F4: os registros “verde” descrevem execuções históricas; o arquivo `04_crm.sql` recebeu 12 asserções S2 depois delas. Os smokes completos atuais `04_crm.sql` e `04_crm_b.sql` ainda precisam ser repetidos no banco. Atualizei esse esclarecimento em F4 e F8; não houve mudança de código, banco ou publicação. A última suíte Node continua 11/11.

## Retomada 2026-09-29 02:52

Repeti `node testes/rodar-tudo.mjs`: 11/11 suítes passaram. Nesta sessão não há comandos `supabase`, `netlify` ou `deno`, nem MCPs de Supabase/Netlify. Os smokes no Postgres, deploy, E2E e URL do app continuam bloqueados; não houve alteração no banco ou publicação.

## Retomada 2026-09-29 03:21

Montei novamente as seis pastas de Edge Functions; `npx --yes deno check` passou nos seis entrypoints e `node testes/rodar-tudo.mjs` passou 11/11. Supabase/Netlify continuam sem CLI ou MCP disponível; não houve SQL real, deploy ou publicação.

O checkpoint de 00:31 registrava a árvore limpa; esta retomada acrescentou as correções locais descritas acima. Nenhuma validação de produção foi declarada concluída. A chave enviada no chat foi tratada como exposta e não foi usada; é necessário revogá-la. Não é preciso criar outro token para o fluxo pelo Dashboard.

Quando as conexões estiverem disponíveis:

1. Concluir o login do CLI Supabase e vincular o app ao site Netlify; executar `04_crm.sql`, `04_crm_b.sql` e `09_isolamento.sql` em transações de teste, corrigir falhas reais e fechar F4/isolamento apenas com resultado verde.
2. Montar as pastas com `node scripts/montar-funcoes.mjs`; publicar somente `supabase/dist/<função>` com `verify_jwt=false`.
3. Fazer o E2E-A/B em tenant de teste, verificar isolamento, CRM, WhatsApp, Ads, automações, layout a 390 px e console.
4. Validar Netlify (`/` e `/index.html` → `/app/`) e só então habilitar módulos aceitos em `prontos.js`.
5. Atualizar este arquivo, `F4.md` e `F8.md`; só depois considerar merge/publicação.

Não enviar segredos para arquivos, logs, Git ou mensagens. Não alterar `nx_config`, apagar dados de produção nem aplicar o seed fictício em produção.

## Retomada 2026-09-29 06:22

Repeti `node testes/rodar-tudo.mjs`: 11/11 suítes passaram. `node scripts/montar-funcoes.mjs` regenerou as seis pastas planas e `npx --yes deno check` passou nos seis entrypoints de `supabase/dist`, a estrutura de deploy definida pelo contrato.

Sem ferramentas Supabase/Netlify autenticadas nesta sessão, permanecem pendentes os smokes em PostgreSQL real, publicação das seis funções, configuração da URL no host e E2E. Nenhum banco, credencial ou serviço externo foi alterado; `prontos.js` continua bloqueando módulos sem aceite.

## Retomada 2026-09-29 08:15

Os 10 smokes SQL (`01` a `09`, incluindo `04_crm_b`) passaram no SQL Editor autenticado do projeto `dtjznipitihnwmcgpzqh`. Cada execução terminou em `ROLLBACK`; marcadores de sucesso e algumas exclusões exclusivas de fixtures foram adaptados semanticamente apenas no texto temporário enviado ao editor para contornar a tradução automática, sem modificar os arquivos fonte. Resultados conferidos na interface. A revisão F4 foi fechada.

`node testes/rodar-tudo.mjs` passou 11/11 suítes. Ainda faltam publicar as seis Edge Functions, criar um tenant de teste isolado, concluir E2E-A/B, vincular/configurar Netlify e validar telas autenticadas a 390 px e o console. Não houve deploy, alteração persistente no banco, edição de `nx_config` ou publicação na `main`; os módulos seguem bloqueados em `web/app/prontos.js`.
