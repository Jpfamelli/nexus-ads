# AGENTS.md — nexus-ads (Nexus Ads + SaaS Órbita)

Regras para qualquer assistente (Codex, Claude) que trabalhe neste repositório.
O Claude lê o `CLAUDE.md`, que aponta para cá. Se algo aqui conflitar com o `CONTRATO.md`
ou com `docs/orbita/ESPEC.md`, esses dois vencem.

## Coordenação (Ponte IA)
- Comece toda tarefa com `ponte_status` (MCP `ponte`, ou `PONTE_AGENTE=<você> node C:/Users/USER/.claude/backups/ponte-ia/servidor.mjs cli ponte_status`).
- Antes de editar: `ponte_trava_pegar` com `projeto: "nexus-ads"`. Se estiver OCUPADO, não mexa.
- Ao parar: atualize o arquivo de estado da frente, solte a trava e deixe um `ponte_recado_enviar` com
  o que mudou, os testes que rodou e o próximo passo.

## O que está NO AR (último estado remoto confirmado em 01/10/2026)
- Painel clássico do Nexus Ads: https://jpfamelli.github.io/nexus-ads/. Órbita em produção: https://orbita-nexus-ads.netlify.app. A F8 foi aceita; PR #1 foi mesclado. Esta sessão não revalidou os serviços remotos.
- Supabase `dtjznipitihnwmcgpzqh`: estado em 01/10/2026 19:41 UTC (tag `funcoes-20261001-4`): nx-ia v5, nx-codewords v6, nx-enviar v7, nx-whatsapp v8, nx-midia v4, nx-ciclo v5 e nx-relatorio v5; todas ACTIVE com `verify_jwt=false` e autenticação própria. Migrações aplicadas até `20261002d`. Não consultar outros projetos.
- O conector Supabase desta sessão falhou na renovação OAuth. Não usar CLI alternativo, token copiado no chat ou outro projeto como contorno; sem conexão, nenhuma migração, consulta sensível, deploy de função ou publicação de produção.
- Edge Functions são publicadas exclusivamente pelo GitHub Actions (`.github/workflows/funcoes-supabase.yml`) com tag `funcoes-*`, a lista `supabase/deploy-lista.txt` e o segredo já configurado no repositório. Guia e plano de volta: `docs/orbita/DEPLOY-FUNCOES.md`.
- O Netlify de produção é `orbita-nexus-ads`, site `32718bf4-1a15-442e-9bd9-b5c067afd55e`, e não está ligado ao repositório. Release manual somente de checkout limpo/LF da `main` e com os gates concluídos.
- Cliente real: `kamiguchi` (Kamiguchi Odontologia). Preservar seus dados e configuração; nunca escrever segredos em arquivos, logs ou mensagens.

## Órbita — estado e fonte da verdade
- Fonte técnica: `CONTRATO.md` e `docs/orbita/ESPEC.md`; evidências e estado: `docs/orbita/estado/F1.md`…`F8.md`, `ESTADO.md` e `MELHORIAS-*.md`.
- F8 está ACEITA e publicada desde 01/10/2026. O pacote R119 é follow-up separado e permanece fora de produção até sua integração/aprovação. Branch `codex/orbita-r119`; PR #2 está aberto em rascunho: https://github.com/Jpfamelli/nexus-ads/pull/2.
- A suíte local consolidada é `node testes/rodar-tudo.mjs` (19/19 arquivos nesta revisão); também executar montagem das sete funções, `deno check` dos sete entrypoints e `git diff --check` antes de commitar.
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
