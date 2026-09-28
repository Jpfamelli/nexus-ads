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
- Commit local `57e0385` (ainda NÃO está no GitHub). Migrações `supabase/migrations/20260928a…h` **já estão aplicadas no banco real**.
- Construídas: F1 banco, F2 funções (nx-enviar, nx-midia, nx-ia, webhook ampliado), F3 login/white-label/admin (`web/app/`),
  F4 CRM, F5 Conversas, F6 Anúncios/Relatórios, F7 Automações. Revisões aprovadas: F1, F2, F3, F5, F6, F7.
- **Falta (em ordem):**
  1. Revisão adversarial da F4 (CRM): contrato §5.3, isolamento entre empresas, trava do Ads, importação em lotes, tempo < 2 s.
  2. F8 — entrega (ESPEC §8/§9): conferir a ordem das migrações; gerar e rodar `supabase/testes/09_isolamento.sql`;
     criar `testes/rodar-tudo.mjs`; E2E dos aceites; `web/app/prontos.js` só com módulos aprovados; publicar as funções
     novas e a `nx-whatsapp` nova; Netlify (`netlify.toml` já existe; publish = `web`, `/` → `/app/`); push; docs
     (`CONTRATO.md` §7 e `LEIA-ME.md` com o passo a passo do João).
  3. Verificação final (fluxos principais, isolamento, 390 px, console sem erros, painel clássico intacto).

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
