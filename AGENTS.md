# AGENTS.md — nexus-ads (Nexus Ads + SaaS Órbita)

Regras para qualquer assistente (Codex, Claude) que trabalhe neste repositório.
O Claude lê o `CLAUDE.md`, que aponta para cá. Se algo aqui conflitar com o `CONTRATO.md`
ou com `docs/orbita/ESPEC.md`, esses dois vencem.

## Coordenação (Ponte IA)
- Comece toda tarefa com `ponte_status` (MCP `ponte`, ou `PONTE_AGENTE=<você> node C:/Users/USER/.claude/backups/ponte-ia/servidor.mjs cli ponte_status`).
- Antes de editar: `ponte_trava_pegar` com `projeto: "nexus-ads"`. Se estiver OCUPADO, não mexa.
- Ao parar: atualize o arquivo de estado da frente, solte a trava e deixe um `ponte_recado_enviar` com
  o que mudou, os testes que rodou e o próximo passo.

## O que está NO AR (confirmado em 01/10/2026 21:39 UTC)
- Painel clássico do Nexus Ads: https://jpfamelli.github.io/nexus-ads/. Órbita em produção: https://orbita-nexus-ads.netlify.app. F8/PR #1, R119/PR #2 e R122/PR #3 foram mesclados.
- Supabase `dtjznipitihnwmcgpzqh` (09/10/2026): migrações aplicadas até `20261009d_origem_frase_sem_negocio` (plano 100: `20261008a/b/c`, `20261009a/b/c/d`, smokes 19–25 ensaiados em ROLLBACK no banco real). **Funções ainda nas versões de 02/10** (nx-ia v7, nx-codewords v8, nx-enviar v9, nx-whatsapp v10, nx-midia v6, nx-ciclo v7, nx-relatorio v7): a tag `funcoes-20261009-1` (run 37957796176) falhou com «Invalid access token» — o segredo `SUPABASE_ACCESS_TOKEN` do repositório precisa ser renovado pelo João; depois, `gh run rerun 37957796176` (ou nova tag `funcoes-20261009-2`). Front `20261009a` no Netlify (deploy 6ac9134c46e0a18b1fc6a7eb, md5 conferido) — tolera as funções antigas por detecção. Não consultar outros projetos.
- R122 não incluiu migração nem alteração de dados/`nx_config`; o front `20261001f` foi publicado manualmente, a partir de arquivo limpo de `origin/main`, no deploy Netlify `6abed2b47eab05dec79aaf0f`. Verificação HTTP: `/app/index.html` 200, raiz 302 para `/app/`, CSP presente. O site não está ligado ao repositório.
- Plano 1000 (13/10, frente srv): migrações `20261013a_operacao_fila_codewords` e `20261013b_seguranca_dados` (smokes 26 e 27) e a tag `funcoes-20261013-1` — ainda NÃO aplicadas/publicadas (o integrador ensaia em ROLLBACK e aplica; a tag espera o token renovado, procedimento em `docs/orbita/DEPLOY-FUNCOES.md`). Também NÃO aplicadas: `20261013c_operacao_indices` (smoke 28; `nx_saude`, `nx_envios_pausar`, crons por cliente, faxina em lotes) e `20261013d_contratos_telas` (smoke 29), nessa ordem; as funções novas exigem tag nova (ex.: `funcoes-20261013-2`) depois delas e toleram banco sem elas. Lote srv-3: `20261013e_funcoes_seguranca`
  (smoke 30), `20261013f_entrada_contratos` (smoke 31) e `20261013g_validar_status_mensagens` (smoke 32, fora do horário) — NÃO aplicadas;
  conferir `nx_config.funcoes_url` antes da `e` (o `nx_disparar` passa a recusar outro domínio) e ver `docs/orbita/DEPLOY-FUNCOES.md`. CI novo em `.github/workflows/ci.yml` (suíte, smokes PGlite, montagem, deno check, diff --check e `scripts/varrer-segredos.mjs`) em todo PR e push.
- Edge Functions são publicadas exclusivamente pelo GitHub Actions (`.github/workflows/funcoes-supabase.yml`) com tag `funcoes-*`, a lista `supabase/deploy-lista.txt` e o segredo já configurado no repositório. Guia e plano de volta: `docs/orbita/DEPLOY-FUNCOES.md`.
- A publicação manual no Netlify exige checkout limpo/LF da `main` e todos os gates concluídos.
- Cliente real: `kamiguchi` (Kamiguchi Odontologia). Preservar seus dados e configuração; nunca escrever segredos em arquivos, logs ou mensagens.

## Órbita — estado e fonte da verdade
- Fonte técnica: `CONTRATO.md` e `docs/orbita/ESPEC.md`; evidências e estado: `docs/orbita/estado/F1.md`…`F8.md`, `ESTADO.md` e `MELHORIAS-*.md`.
- F8 está ACEITA e publicada desde 01/10/2026. O follow-up R119/PR #2 e o adendo R122/PR #3 estão mesclados; R122 (mídia CodeWords) está publicado em produção. Falta somente a prova manual de foto/áudio/arquivo com aparelho CodeWords pareado. Evidências: `docs/orbita/estado/F8.md` e `ESTADO.md`.
- A suíte local consolidada é `node testes/rodar-tudo.mjs`: **80 arquivos** na lista `COMANDOS` (conferido em 26/10/2026; os 9
  `plano1000-*`, os 11 `plano1000b-*`, os 10 `plano1500c-*` e os 10 `plano2000d-*` são opcionais até a frente entregar, os `plano100-*` são obrigatórios). Também executar `node scripts/rodar-local.mjs`
  (migrações + smokes no PGlite; só o `02_acesso` falha, por desenho, e está em `ESPERADAS`), `node scripts/lint-migracoes.mjs`,
  montagem das sete funções, `deno check` dos sete entrypoints e `git diff --check` antes de commitar. Relógio controlado para
  testes: `ORBITA_AGORA=02:50Z TZ=America/Sao_Paulo node testes/rodar-tudo.mjs` (`testes/apoio/relogio.mjs`).
- **Funções no ar (conferido em 13/10/2026):** ainda as de 02/10 (nx-ia v7, nx-codewords v8, nx-enviar v9, nx-whatsapp v10,
  nx-midia v6, nx-ciclo v7, nx-relatorio v7) — o deploy está parado desde 09/10 pelo `SUPABASE_ACCESS_TOKEN` vencido, que só o
  João renova. Passo a passo (gerar, testar sem publicar, `gh run rerun`), portões do workflow, crons, backup e plano de volta:
  `docs/orbita/DEPLOY-FUNCOES.md`. Incidentes de operação (número caiu, token Meta, cota de IA, fila, cron, mídia): `docs/orbita/OPERACAO.md`.
- As migrações `20261002b`, `20261002c` e `20261002d` foram ensaiadas em rollback e aplicadas em 01/10/2026 (18:24 e 19:39 UTC). A `20261002d` traz a reserva do `client_ref` antes do envio (`nx_envio_refs`, `nx_cv_ref_reservar/liberar`): o nx-enviar responde 409 `envio_em_andamento` e nunca envia a mesma intenção duas vezes. Front novo exige essas migrações e a tag `funcoes-20261001-4`.

## Testes
Antes de commit, rode `node testes/rodar-tudo.mjs`, `node scripts/montar-funcoes.mjs`, `deno check` nos sete entrypoints de `supabase/dist` e `git diff --check`. QA browser/axe deve usar exclusivamente `dev-falso`; nunca dados ou integrações reais. Testes SQL locais/PGlite não equivalem a aceite no PostgreSQL/Supabase real.
## Regras de mudança
- Git: trabalhe na branch `codex/orbita` para a F8, `codex/orbita-*` para follow-ups, ou `claude/...`; use commits pequenos com mensagem clara. Merge na `main` só com tudo verde.
- Banco (Claude e Codex têm acesso ao Supabase): SÓ o projeto `dtjznipitihnwmcgpzqh` (nexus-ads) — os outros projetos
  da conta (IndyCar etc.) são de outros clientes: não leia nem mexa. Mudança só por arquivo novo em `supabase/migrations/`,
  sempre ADITIVA e idempotente (if not exists / create or replace); rode antes numa transação com ROLLBACK; aplique com
  o mesmo nome do arquivo. Nada de drop, nada de apagar/alterar dados de produção, nada de mexer em `nx_config`,
  nada de criar conta/sessão real fora de teste. A trava da ponte vale também para o banco e para publicar funções.
- Regras de toda migração nova (conferidas por `node scripts/lint-migracoes.mjs` a partir da `20261013c`, no CI e no deploy):
  - nada de `drop table/column/function/index`, `delete`/`truncate` fora de corpo de função (bloco `do` conta), `alter column … type`;
    `create table/index` e `add column` com `if not exists`, `create or replace function/view`. Exceção só anotada:
    `-- lint:permitido <motivo>` na linha (ou na de cima).
  - **Permissões explícitas** para toda função nova: `revoke all on function … from public, anon, authenticated` + `grant execute …
    to service_role` (ou `to anon` só para RPC de painel com `p_token` que passa pelo `nx_ctx`/`nx_fn_ctx`), e/ou
    `select public.nx_revogar_authenticated();` no fim — no Supabase, função nova nasce executável por anon/authenticated
    (o `rodar-local` imita isso; o smoke 09 recusa função sem `p_token` executável por anon fora da lista pública).
  - `insert into public.nx_versao_banco (nome) values ('<nome do arquivo sem .sql>') on conflict (nome) do update set aplicada_em = now();`
    e, como ÚLTIMO comando, `notify pgrst, 'reload schema';`.
  - Mudou uma função existente? **Mesma assinatura** (nomes, tipos e defaults) e corpo copiado da definição **EM VIGOR** — que pode
    estar numa migração posterior à original, ou ter sido corrigida por âncora (ex.: a `20261003a` em `nx_codewords_sync_gravar` e
    `nx_codewords_saida`: a cópia tem de manter o «-- gêmea de MÍDIA do painel»). `testes/plano1000-ci.teste.mjs` confere isso, o
    bloco de permissões e o `nx_ctx` das RPCs com `p_token`.
  - Smoke novo em `supabase/testes/NN_*.sql` (begin … rollback), verde no PGlite (`node scripts/rodar-local.mjs NN`) antes do ensaio
    em ROLLBACK no banco real.
- Funções: `node scripts/montar-funcoes.mjs` gera `supabase/dist/<funcao>`; quem publica é o workflow
  `funcoes-supabase.yml` (tag `funcoes-*`, `verify_jwt = false`), com as funções listadas em `supabase/deploy-lista.txt`.
  **Mexeu em `web/nucleo.js`? Republique nx-ciclo, nx-relatorio e nx-whatsapp.** Não edite `web/demo.js` sem necessidade.
- Corpo de requisição nas funções: sempre por `lerCorpoLimitado`/`lerCorpoPainel`/`lerCorpo` (comum.js), antes de tocar no
  banco; acima do teto o resto é DRENADO e descartado (`drenarCorpo`: prazo 10 s, teto absoluto 16 MiB) e só então sai o 413;
  resposta que não lê o corpo também o drena (`soltandoCorpo`). No Edge Runtime, responder antes de consumir o corpo — com
  ou sem cancelar o leitor — pendura a função (~160 s, 503); cancelar é só o último recurso (prazo/teto estourados).
- Front: HTML/CSS/JS puro, módulos ES, sem build. `[hidden]{display:none!important}`, grids com `minmax(0,1fr)`,
  sem rolagem horizontal em 390 px, tudo com tokens de cor do white-label.
- Segredos: NUNCA em arquivo, commit, log ou resposta (tokens Meta/Google/WhatsApp, chave da Anthropic, service_role,
  código de ativação, cron_token). Eles ficam só no banco (`nx_config`/Vault).
