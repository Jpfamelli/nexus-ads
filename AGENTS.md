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
- Supabase `dtjznipitihnwmcgpzqh`: sete funções ACTIVE (conferido por `list_edge_functions` em 30/09 ~20h) — `nx-whatsapp` v5,
  `nx-enviar` v3, `nx-codewords` v2, `nx-ciclo` v4, `nx-relatorio` v4, `nx-ia` v2, `nx-midia` v2; todas com `verify_jwt=false` e
  autenticação própria do handler. **No ar ainda NÃO estão** a correção @lid (`a1fc214`) nem o 413 do corpo grande (correção
  candidata por drenagem, que substitui `99003de`; só vale como corrigido quando a sonda de produção passar):
  vão na primeira publicação pela Actions. Cron continua de hora em hora (nx-ciclo :07), relatório diário 8h e mensal dia 1º.
- **Publicação das funções = GitHub Actions** (`.github/workflows/funcoes-supabase.yml`), disparada SÓ por tag `funcoes-*`
  (`git tag funcoes-AAAAMMDD-N && git push origin <tag>`), com a lista em `supabase/deploy-lista.txt` e o segredo
  `SUPABASE_ACCESS_TOKEN` do repositório. O CLI do Supabase não roda neste Windows e não se contorna isso.
  Guia, acompanhamento e plano de volta: `docs/orbita/DEPLOY-FUNCOES.md`.
- Netlify: site `orbita-nexus-ads` criado; o preview original continua em https://6abba26f4e8e3c05d376d3c8--orbita-nexus-ads.netlify.app. A pedido do João, em 29/09 foi criado um segundo deploy de rascunho com overlay temporário de navegação em https://6abbd2ff7054e92bd9532b7b--orbita-nexus-ads.netlify.app. Ele expõe Início, Conversas, CRM e Ads no preview; a conta precisa entrar novamente nesse hostname. A origem `web/app/prontos.js` e a `main` continuam bloqueadas. Ainda não existe deploy de produção nem domínio confirmado.
- Cliente real: `kamiguchi` (Kamiguchi Odontologia). O cliente de demonstração foi apagado de propósito;
  o modo `?demo` do painel continua como ferramenta de venda.

## Órbita — estado verificado (29/09/2026)
- Fonte da verdade: `docs/orbita/ESPEC.md` (leia a §0 Regras de ouro e a §8 Frentes/contratos; §9 = entrega).
  Estado de cada frente: `docs/orbita/estado/F1.md` … `F7.md` (campo `proximo`). Pedidos entre frentes: `docs/orbita/PEDIDOS.md`.
- Branch `codex/orbita` enviada ao GitHub; PR #1 está aberto em rascunho. Migrações `supabase/migrations/20260928a…h` constam como aplicadas no handoff, mas não foram revalidadas nesta retomada.
- Construídas localmente: F1 banco, F2 funções (nx-enviar, nx-midia, nx-ia, webhook ampliado), F3 login/white-label/admin (`web/app/`),
  F4 CRM, F5 Conversas, F6 Anúncios/Relatórios, F7 Automações. Em 29/09, os 10 smokes SQL (`01`–`09`, incluindo `04_crm_b`) passaram no SQL Editor autenticado do projeto autorizado, com `ROLLBACK`; marcadores finais e algumas exclusões de fixtures foram adaptados apenas no texto temporário por causa da tradução automática. Os arquivos SQL do repositório não foram alterados.
- F8: runner serial 11/11 verde e smokes SQL reais aprovados. As seis funções foram publicadas e verificadas no projeto correto; o preview Netlify responde e redireciona para `/app/`. Órbita ainda não está pronto para clientes: E2E-A/B autenticados, produção Netlify e verificação mobile autenticada permanecem pendentes. `web/app/prontos.js` mantém os módulos bloqueados.
- **Falta (em ordem):**
  1. Usar a conta gestora existente para entrar no preview e concluir E2E-A/B num tenant de teste dedicado, incluindo isolamento, integração/webhook e limpeza das fixtures.
  2. Validar os fluxos autenticados em 375×812 e 390×844, console e painel clássico; só liberar os módulos aceitos em `web/app/prontos.js`.
  3. Depois dos aceites, publicar em produção no Netlify, validar `/` e `/index.html` → `/app/` e definir a URL do app pelo caminho administrativo autorizado.

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
node --test testes/corpo-limite.teste.mjs
node --test testes/automacoes.teste.mjs
node --test testes/codewords.teste.mjs
node --test testes/rastreio.teste.mjs
node --test testes/isolamento.teste.mjs
```
Testes SQL (`supabase/testes/0*.sql`, `10_codewords.sql`, `11_agenda_rastreio.sql`) rodam no banco real **dentro de transação que termina em ROLLBACK**.

## Regras de mudança
- Git: trabalhe na branch `codex/orbita` (ou `claude/...`), commits pequenos com mensagem clara. Merge na `main` só com tudo verde.
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
