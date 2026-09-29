# Estado geral do Órbita

Atualizado: 2026-09-28 22:01 (America/Sao_Paulo)
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

`node testes/rodar-tudo.mjs` passou em 10/10 suítes. Contagens desta execução: painel 70; app 46; CRM 34; conversas 33; relatórios 38; funções 39; scripts 12; funções de conversas 46; automações 24; núcleo aprovado.

O smoke `supabase/testes/09_isolamento.sql` foi criado, mas **não foi executado**. Os smokes `04_crm.sql` e `04_crm_b.sql` também aguardam execução autenticada em transação com `ROLLBACK`.

## Bloqueios e próximo passo

Nesta sessão, os conectores Supabase e Netlify não estavam autenticados (`USER_NOT_LOGGED_IN`); não há CLI Supabase/Netlify nem vínculo local configurado. Sem essa conexão, não é possível confirmar os testes SQL, publicar as seis funções, validar o host ou executar os E2E reais. `gh pr checks 1` não reportou verificações automáticas.

Quando as conexões estiverem disponíveis:

1. Rodar `04_crm.sql`, `04_crm_b.sql` e `09_isolamento.sql` em transações de teste e fechar F4 apenas com resultado verde.
2. Montar as pastas com `node scripts/montar-funcoes.mjs`; publicar somente `supabase/dist/<função>` com `verify_jwt=false`.
3. Fazer o E2E-A/B em tenant de teste, verificar isolamento, CRM, WhatsApp, Ads, automações, layout a 390 px e console.
4. Validar Netlify (`/` e `/index.html` → `/app/`) e só então habilitar módulos aceitos em `prontos.js`.
5. Atualizar este arquivo, `F4.md` e `F8.md`; só depois considerar merge/publicação.

Não enviar segredos para arquivos, logs, Git ou mensagens. Não alterar `nx_config`, apagar dados de produção nem aplicar o seed fictício em produção.
