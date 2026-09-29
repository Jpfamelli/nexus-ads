# Estado geral do Órbita

Atualizado: 2026-09-28 23:35 (America/Sao_Paulo)
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

`node testes/rodar-tudo.mjs` passou em 11/11 suítes. Contagens: painel 70; app 46; CRM 34; conversas 33; relatórios 38; funções 39; scripts 12; funções de conversas 46; automações 24; isolamento estrutural 2; núcleo aprovado.

Nesta retomada, `node testes/app.teste.mjs` passou 46/46 e `node testes/crm.teste.mjs` 34/34. O preview local abriu a tela de login e foi conferido visualmente; sem backend autenticado, não cobre telas internas. A captura foi em desktop: o viewport de 390 px e o console não foram verificados nesta sessão.

O smoke `supabase/testes/09_isolamento.sql` foi ampliado localmente: agora prepara a org Nexus e uma revenda B, contas admin/atendente, entidades de teste, varredura de RPCs concedidas a `anon` derivada de `pg_proc` e comparação de hash antes/depois das linhas de B. Erros SQL estruturais (classe 42) não passam como negação segura, com exceção de `42501`. O teste Node verifica a presença estrutural desses contratos. **O SQL ainda não foi executado nem validado pelo parser PostgreSQL**, então o aceite de isolamento segue pendente. `04_crm.sql` e `04_crm_b.sql` também aguardam execução autenticada em transação com `ROLLBACK`.

## Bloqueios e próximo passo

Nesta sessão, os conectores Supabase e Netlify não estavam autenticados (`USER_NOT_LOGGED_IN`); não há CLI Supabase/Netlify nem vínculo local configurado. Sem essa conexão, não é possível confirmar os testes SQL, publicar as seis funções, validar o host ou executar os E2E reais. `gh pr checks 1` não reportou verificações automáticas.

Quando as conexões estiverem disponíveis:

1. Disponibilizar Supabase, executar `04_crm.sql`, `04_crm_b.sql` e `09_isolamento.sql` em transações de teste, corrigir falhas reais e fechar F4/isolamento apenas com resultado verde.
2. Montar as pastas com `node scripts/montar-funcoes.mjs`; publicar somente `supabase/dist/<função>` com `verify_jwt=false`.
3. Fazer o E2E-A/B em tenant de teste, verificar isolamento, CRM, WhatsApp, Ads, automações, layout a 390 px e console.
4. Validar Netlify (`/` e `/index.html` → `/app/`) e só então habilitar módulos aceitos em `prontos.js`.
5. Atualizar este arquivo, `F4.md` e `F8.md`; só depois considerar merge/publicação.

Não enviar segredos para arquivos, logs, Git ou mensagens. Não alterar `nx_config`, apagar dados de produção nem aplicar o seed fictício em produção.
