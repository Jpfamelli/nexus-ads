# Estado geral do Órbita

Atualizado: 2026-09-29 01:22 (America/Sao_Paulo)
Branch: `codex/orbita`
PR: [#1](https://github.com/Jpfamelli/nexus-ads/pull/1) — rascunho aberto

## Situação

O código das frentes está no branch para revisão. **O SaaS ainda não está publicado nem pronto para uso por clientes.** `web/app/prontos.js` mantém os módulos bloqueados até os aceites E2E. Não houve alteração de dados de produção nem de `nx_config` nesta retomada.

## Frentes

| Frente | Código/revisão | Estado de publicação |
|---|---|---|
| F1 — banco | Migrações `20260928a…h` aplicadas conforme o handoff e o `AGENTS.md` | Não revalidado nesta retomada |
| F2 — funções | Handlers e testes locais preparados para seis funções | Deploy do Órbita pendente; em produção permanecem as três funções v2 anteriores |
| F3 — acesso e white-label | Implementação local existente; módulos dependem do aceite geral | Sem URL Netlify confirmada |
| F4 — CRM | Implementação local e testes Node aprovados; revisão adversarial continua aberta | `04_crm.sql` e `04_crm_b.sql` precisam passar no Supabase |
| F5 — conversas | Implementação local e testes Node aprovados; revisão anterior aprovada conforme o handoff | Webhook/API real e E2E pendentes |
| F6 — anúncios e relatórios | Implementação local e testes Node aprovados; revisão anterior aprovada conforme o handoff | Integrações e E2E reais pendentes |
| F7 — automações | Implementação local e testes Node aprovados; revisão anterior aprovada conforme o handoff | Execução real e E2E pendentes |
| F8 — entrega | Runner serial, smoke SQL de isolamento, documentação e gating no branch | SQL, deploy, Netlify e E2E pendentes |

## Verificações locais

`node testes/rodar-tudo.mjs` passou em 11/11 suítes. Contagens: painel 70; app 46; CRM 34; conversas 33; relatórios 38; funções 39; scripts 12; funções de conversas 46; automações 24; isolamento estrutural 3; núcleo aprovado.

Nesta retomada, Chrome headless abriu o login em 375×812 e 390×844. Nos dois tamanhos `documentElement.scrollWidth` e `body.scrollWidth` bateram com a largura do viewport; o formulário apareceu e não houve erros de console. Isso valida somente o shell de login: sem backend autenticado, as telas e fluxos internos continuam sem verificação mobile. A suíte Node mais recente segue em 11/11; os testes de app, CRM e painel passaram 46/46, 34/34 e 70/70.

Nesta retomada, os seis entrypoints das Edge Functions passaram por `deno check` após validarem explicitamente as duas variáveis Supabase obrigatórias; os handlers também tipam `emSegundoPlano`. `node scripts/montar-funcoes.mjs` gerou as seis pastas planas; `node testes/rodar-tudo.mjs` passou 11/11 e `git diff --check` passou.

O smoke `supabase/testes/09_isolamento.sql` agora prepara a org Nexus e uma revenda B, contas admin/atendente, entidades de teste, varredura de RPCs concedidas a `anon` derivada de `pg_proc` e comparação de hash antes/depois das linhas de B. A sonda reconhece que `nx_sair` é idempotente e aceita somente a resposta pública exata `[{"ok":true}]` sem sessão; qualquer outro conteúdo ainda reprova. As 14 migrations e os 10 smokes SQL (`01` a `09`, incluindo os dois CRM) passaram numa instância efêmera PGlite. Esse ensaio usou stubs para pgcrypto/unaccent, Vault, Storage e pg_cron, e omitiu índices que dependem do pg_trgm; é uma checagem local de sintaxe e comportamento, não substitui a execução em PostgreSQL/Supabase. O aceite real de `04_crm.sql`, `04_crm_b.sql` e `09_isolamento.sql` continua pendente.

## Bloqueios e próximo passo

Bloqueios atuais: o CLI Supabase está disponível por `npx`, mas a checagem somente de leitura de funções no projeto autorizado retornou `AccessTokenRequired`; o login ainda não está disponível no shell. O CLI Netlify está autenticado, porém falta vincular o site. Sem essas etapas, não é possível confirmar os testes SQL, publicar as seis funções, validar o host ou executar os E2E reais. `gh pr checks 1` não reportou verificações automáticas.

O painel web do Supabase está autenticado no projeto correto e o Editor SQL abriu. Nenhuma consulta foi rodada. A política do navegador bloqueou abrir os arquivos SQL locais como página; sem um conector Supabase MCP, não consegui executar os smokes pelo Dashboard nesta sessão. Os smokes podem ser executados pelo João no Dashboard ou por um conector habilitado. Nenhum token foi usado; revogar os tokens que ficaram visíveis durante a tentativa.

O checkpoint de 00:31 registrava a árvore limpa; esta retomada acrescentou as correções locais descritas acima. Nenhuma validação de produção foi declarada concluída. A chave enviada no chat foi tratada como exposta e não foi usada; é necessário revogá-la. Não é preciso criar outro token para o fluxo pelo Dashboard.

Quando as conexões estiverem disponíveis:

1. Concluir o login do CLI Supabase e vincular o app ao site Netlify; executar `04_crm.sql`, `04_crm_b.sql` e `09_isolamento.sql` em transações de teste, corrigir falhas reais e fechar F4/isolamento apenas com resultado verde.
2. Montar as pastas com `node scripts/montar-funcoes.mjs`; publicar somente `supabase/dist/<função>` com `verify_jwt=false`.
3. Fazer o E2E-A/B em tenant de teste, verificar isolamento, CRM, WhatsApp, Ads, automações, layout a 390 px e console.
4. Validar Netlify (`/` e `/index.html` → `/app/`) e só então habilitar módulos aceitos em `prontos.js`.
5. Atualizar este arquivo, `F4.md` e `F8.md`; só depois considerar merge/publicação.

Não enviar segredos para arquivos, logs, Git ou mensagens. Não alterar `nx_config`, apagar dados de produção nem aplicar o seed fictício em produção.
