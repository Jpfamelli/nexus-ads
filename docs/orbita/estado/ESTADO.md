# Estado geral do Órbita

Atualizado: 2026-09-29 09:02 (America/Sao_Paulo)
Branch: `codex/orbita`
PR: [#1](https://github.com/Jpfamelli/nexus-ads/pull/1) — rascunho aberto

## Situação

O código das frentes está no branch para revisão. As seis Edge Functions estão ativas no Supabase e há um preview público no Netlify: https://6abba26f4e8e3c05d376d3c8--orbita-nexus-ads.netlify.app. **O SaaS ainda não está pronto para uso por clientes.** `web/app/prontos.js` mantém os módulos bloqueados até os aceites E2E. Os 10 smokes SQL reais passaram em transações revertidas; não houve alteração persistente de dados nem de `nx_config` nesta retomada.

## Frentes

| Frente | Código/revisão | Estado de publicação |
|---|---|---|
| F1 — banco | Migrações `20260928a…h` aplicadas conforme o handoff e o `AGENTS.md` | Não revalidado nesta retomada |
| F2 — funções | Handlers e testes locais preparados para seis funções; 11/11 suítes e seis `deno check` verdes | Deploy confirmado: `nx-ciclo`, `nx-relatorio`, `nx-whatsapp` v3; `nx-enviar`, `nx-midia`, `nx-ia` v1; todas ACTIVE, `verify_jwt=false` |
| F3 — acesso e white-label | Implementação local existente; módulos dependem do aceite geral | Preview Netlify criado; `/` e `/index.html` redirecionam para `/app/`; sem deploy de produção |
| F4 — CRM | Implementação, revisão e testes aprovados | `04_crm.sql` e `04_crm_b.sql` passaram no Supabase com `ROLLBACK` |
| F5 — conversas | Implementação local e testes Node aprovados; revisão anterior aprovada conforme o handoff | Webhook/API real e E2E pendentes |
| F6 — anúncios e relatórios | Implementação local e testes Node aprovados; revisão anterior aprovada conforme o handoff | Integrações e E2E reais pendentes |
| F7 — automações | Implementação local e testes Node aprovados; revisão anterior aprovada conforme o handoff | Execução real e E2E pendentes |
| F8 — entrega | Runner serial e 10 smokes SQL reais aprovados; documentação e gating no branch | Funções e preview implantados; E2E autenticado, validação mobile e produção pendentes |

## Verificações locais

Nesta retomada, `node testes/rodar-tudo.mjs` passou em 11/11 suítes; `npx --yes deno check` passou nos seis entrypoints e o deploy de cada função foi confirmado no Supabase. Chamadas sem sessão aos seis endpoints foram recusadas (401 nos handlers de painel, 403 no challenge inválido do webhook). Contagens históricas da suíte: painel 70; app 46; CRM 34; conversas 33; relatórios 38; funções 39; scripts 12; funções de conversas 46; automações 24; isolamento estrutural 3; núcleo aprovado.

Nesta retomada, Chrome headless abriu o login em 375×812 e 390×844. Nos dois tamanhos `documentElement.scrollWidth` e `body.scrollWidth` bateram com a largura do viewport; o formulário apareceu e não houve erros de console. Isso valida somente o shell de login: sem backend autenticado, as telas e fluxos internos continuam sem verificação mobile. A suíte Node mais recente segue em 11/11; os testes de app, CRM e painel passaram 46/46, 34/34 e 70/70.

Nesta retomada, os seis entrypoints das Edge Functions passaram por `deno check` após validarem explicitamente as duas variáveis Supabase obrigatórias; os handlers também tipam `emSegundoPlano`. `node scripts/montar-funcoes.mjs` gerou as seis pastas planas; `node testes/rodar-tudo.mjs` passou 11/11 e `git diff --check` passou.

O smoke `supabase/testes/09_isolamento.sql` prepara a org Nexus e uma revenda B, contas admin/atendente, entidades de teste, varredura de RPCs concedidas a `anon` derivada de `pg_proc` e comparação de hash antes/depois das linhas de B. A sonda reconhece que `nx_sair` é idempotente e aceita somente a resposta pública exata `[{"ok":true}]` sem sessão; qualquer outro conteúdo reprova. As 14 migrations e os 10 smokes SQL passaram numa instância efêmera PGlite com stubs/índices omitidos; além disso, nesta retomada os 10 smokes passaram no Supabase real, em transações revertidas. O teste de interface E2E continua pendente.

## Bloqueios e próximo passo

Bloqueios atuais: não há tenant `teste-e2e`; o app de preview aguarda login pela conta gestora existente (a sessão ativa no painel clássico tem outra origem e não é compartilhada). O preview Netlify está disponível, mas não é deploy de produção. E2E-A/B e validação mobile autenticada permanecem pendentes. `prontos.js` continua bloqueando os módulos, a `main` não foi publicada e o PR #1 permanece draft.

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

## Retomada 2026-09-29 08:20

Os 10 smokes SQL (`01` a `09`, incluindo `04_crm_b`) passaram no SQL Editor autenticado do projeto `dtjznipitihnwmcgpzqh`. Cada execução terminou em `ROLLBACK`; marcadores de sucesso e algumas exclusões exclusivas de fixtures foram adaptados semanticamente apenas no texto temporário enviado ao editor para contornar a tradução automática, sem modificar os arquivos fonte. Resultados conferidos na interface. A revisão F4 foi fechada.

`node testes/rodar-tudo.mjs` passou 11/11 suítes. Ainda faltam publicar as seis Edge Functions, criar um tenant de teste isolado, concluir E2E-A/B, vincular/configurar Netlify e validar telas autenticadas a 390 px e o console. Não houve deploy, alteração persistente no banco, edição de `nx_config` ou publicação na `main`; os módulos seguem bloqueados em `web/app/prontos.js`.

## Retomada 2026-09-29 08:38

Concluído o login oficial autorizado do Supabase CLI. As seis funções foram implantadas no projeto `dtjznipitihnwmcgpzqh` a partir das pastas planas geradas em `supabase/dist`, todas com `verify_jwt=false`: `nx-ciclo`, `nx-relatorio` e `nx-whatsapp` estão na v3; `nx-enviar`, `nx-midia` e `nx-ia` na v1. A lista remota confirma as seis `ACTIVE`; chamadas anônimas foram recusadas pelos handlers (401) e challenge inválido do webhook (403).

Criado o site Netlify `orbita-nexus-ads` e realizado deploy de preview, sem conectar ou alterar outros sites. URL: https://6abba26f4e8e3c05d376d3c8--orbita-nexus-ads.netlify.app. Verificação remota: `/` e `/index.html` devolvem 302 para `/app/`; `/app/` responde 200 com CSP. O site ainda não recebeu deploy de produção.

`node scripts/montar-funcoes.mjs`, `node testes/rodar-tudo.mjs` (11/11), `npx --yes deno check` (6/6) e `git diff --check` passaram. Não houve escrita no banco, alteração em `nx_config`, exclusão de dados nem publicação na `main`. F8 continua aberta: falta João entrar no preview com a conta gestora existente; depois disso, criar o tenant de teste, executar E2E-A/B e validar telas autenticadas/mobile. Só após os aceites liberar módulos e publicar produção.

## Retomada 2026-09-29 08:49

Auditei os 42 assets locais referenciados pelo preview Netlify (HTML, JavaScript, CSS, manifest, imagens e fontes): todos responderam com HTTP 2xx/3xx, sem arquivos ausentes. `node testes/rodar-tudo.mjs` passou em 11/11 arquivos e `git diff --check` passou. A tela continua aguardando a autenticação manual de João; E2E-A/B e validação autenticada/mobile ainda dependem dessa sessão. Nenhum dado ou configuração de produção foi alterado.

## Retomada 2026-09-29 09:02

Corrigi em F8.md uma afirmação histórica desatualizada sobre `09_isolamento.sql`: o arquivo atual já passou no Supabase em transação revertida, conforme o marco das 08:20. Consultei o PR #1: continua aberto em rascunho e o GitHub não reporta checks configurados para o branch. O bloqueio funcional continua sendo o login manual no preview.
