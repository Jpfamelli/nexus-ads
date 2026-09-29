# AGENTS.md — nexus-ads (Nexus Ads + SaaS Órbita)

Regras para qualquer assistente (Codex, Claude) que trabalhe neste repositório.
O Claude lê o `CLAUDE.md`, que aponta para cá. Se algo aqui conflitar com o `CONTRATO.md`
ou com `docs/orbita/ESPEC.md`, esses dois vencem.

## Coordenação (Ponte IA)
- Comece toda tarefa com `ponte_status` (MCP `ponte`, ou `PONTE_AGENTE=<você> node C:/Users/USER/.claude/backups/ponte-ia/servidor.mjs cli ponte_status`).
- Antes de editar: `ponte_trava_pegar` com `projeto: "nexus-ads"`. Se estiver OCUPADO, não mexa.
- Ao parar: atualize o arquivo de estado da frente, solte a trava e deixe um `ponte_recado_enviar` com
  o que mudou, os testes que rodou e o próximo passo.

## O que está NO AR (não pode quebrar)
- Painel clássico do Nexus Ads: `web/` (exceto `web/app/`), no GitHub Pages https://jpfamelli.github.io/nexus-ads/
  — publicado a cada push na `main` que mexa em `web/**` (Action `.github/workflows/pages.yml`).
  **Push na main publica.** Só faça merge/push na main quando os testes e o E2E passarem.
- Supabase `dtjznipitihnwmcgpzqh`: funções publicadas `nx-ciclo`, `nx-relatorio`, `nx-whatsapp` (versão 2, anterior ao Órbita);
  cron de hora em hora (nx-ciclo :07), relatório diário 8h e mensal dia 1º.
- Cliente real: `kamiguchi` (Kamiguchi Odontologia). O cliente de demonstração foi apagado de propósito;
  o modo `?demo` do painel continua como ferramenta de venda.

## Órbita — onde está (28/09/2026, ~80%)
- Fonte da verdade: `docs/orbita/ESPEC.md` (leia a §0 Regras de ouro e a §8 Frentes/contratos; §9 = entrega).
  Estado de cada frente: `docs/orbita/estado/F1.md` … `F7.md` (campo `proximo`). Pedidos entre frentes: `docs/orbita/PEDIDOS.md`.
- Branch `codex/orbita` enviada ao GitHub; PR #1 está aberto em rascunho. Migrações `supabase/migrations/20260928a…h` constam como aplicadas no handoff, mas não foram revalidadas nesta retomada.
- Construídas localmente: F1 banco, F2 funções (nx-enviar, nx-midia, nx-ia, webhook ampliado), F3 login/white-label/admin (`web/app/`),
  F4 CRM, F5 Conversas, F6 Anúncios/Relatórios, F7 Automações. A revisão da F4 segue aberta até repetir os smokes no banco.
- F8: runner serial 11/11 verde; migrations e 10 smokes SQL passaram numa simulação PGlite em memória com extensões/serviços stubados, mas ainda aguardam execução no PostgreSQL/Supabase real. Órbita ainda não publicado nem pronto para clientes; seis funções novas, SQL autenticado, E2E e Netlify pendentes. `web/app/prontos.js` mantém os módulos bloqueados.
- **Falta (em ordem):**
  1. Repetir `04_crm.sql` e `04_crm_b.sql` via Supabase autenticado em transação `ROLLBACK`; fechar F4 somente com resultado verde.
  2. Executar `09_isolamento.sql` no PostgreSQL, corrigir o que surgir e confirmar isolamento.
  3. Publicar seis Edge Functions e concluir E2E-A/B em tenant de teste; confirmar Netlify e validar `/` → `/app/`.
  4. Verificação final: fluxos, isolamento, 390 px, console e painel clássico; só então liberar módulos, atualizar URLs e considerar publicação.

## Testes (todos têm de passar antes de commit)
```
node testes/painel.teste.mjs
node testes/nucleo.teste.mjs
node testes/app.teste.mjs
node testes/crm.teste.mjs
node testes/conversas.teste.mjs
node testes/relatorios.teste.mjs
node --test testes/funcoes.teste.mjs
node --test testes/scripts.teste.mjs
node --test testes/conversas-funcoes.teste.mjs
node --test testes/automacoes.teste.mjs
```
Testes SQL (`supabase/testes/0*.sql`) rodam no banco real **dentro de transação que termina em ROLLBACK**.

## Regras de mudança
- Git: trabalhe na branch `codex/orbita` (ou `claude/...`), commits pequenos com mensagem clara. Merge na `main` só com tudo verde.
- Banco (Claude e Codex têm acesso ao Supabase): SÓ o projeto `dtjznipitihnwmcgpzqh` (nexus-ads) — os outros projetos
  da conta (IndyCar etc.) são de outros clientes: não leia nem mexa. Mudança só por arquivo novo em `supabase/migrations/`,
  sempre ADITIVA e idempotente (if not exists / create or replace); rode antes numa transação com ROLLBACK; aplique com
  o mesmo nome do arquivo. Nada de drop, nada de apagar/alterar dados de produção, nada de mexer em `nx_config`,
  nada de criar conta/sessão real fora de teste. A trava da ponte vale também para o banco e para publicar funções.
- Funções: `node scripts/montar-funcoes.mjs` e publicar a pasta `supabase/dist/<funcao>` com `verify_jwt = false`.
  **Mexeu em `web/nucleo.js`? Republique nx-ciclo, nx-relatorio e nx-whatsapp.** Não edite `web/demo.js` sem necessidade.
- Front: HTML/CSS/JS puro, módulos ES, sem build. `[hidden]{display:none!important}`, grids com `minmax(0,1fr)`,
  sem rolagem horizontal em 390 px, tudo com tokens de cor do white-label.
- Segredos: NUNCA em arquivo, commit, log ou resposta (tokens Meta/Google/WhatsApp, chave da Anthropic, service_role,
  código de ativação, cron_token). Eles ficam só no banco (`nx_config`/Vault).
