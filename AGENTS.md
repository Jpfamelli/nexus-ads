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
- Supabase `dtjznipitihnwmcgpzqh`: sete funções ACTIVE, todas com `verify_jwt=false` e autenticação própria do handler.
  Versões no ar: `nx-codewords` v3, `nx-enviar` v4, `nx-whatsapp` v6 (primeira publicação real pela Actions, 01/10/2026
  03:42 UTC, run `36811688641`, tag `funcoes-20261001-1`; trazem a correção @lid `a1fc214` e o 413 por drenagem) e
  `nx-ciclo` v4, `nx-relatorio` v4, `nx-ia` v2, `nx-midia` v2 (estas quatro NÃO foram republicadas: carregam a drenagem do
  corpo só no repositório; publicação de rotina futura, nunca no dia 1º às 12:00 UTC, quando roda o relatório mensal).
  **Bug 1 do E2E-meta (413) CORRIGIDO em produção:** sondas de 01/10 — 2 MiB + 1 → 413 em 0,19 s e 2,4 MB em pedaços → 413
  em 0,31 s; autenticação 401/403/405 ok. A prova em produção do @lid (roteiro em `estado/F8.md`) ainda não foi feita.
  Cron continua de hora em hora (nx-ciclo :07), relatório diário 8h e mensal dia 1º.
- **Publicação das funções = GitHub Actions** (`.github/workflows/funcoes-supabase.yml`), disparada SÓ por tag `funcoes-*`
  (`git tag funcoes-AAAAMMDD-N && git push origin <tag>`), com a lista em `supabase/deploy-lista.txt` e o segredo
  `SUPABASE_ACCESS_TOKEN` do repositório. O CLI do Supabase não roda neste Windows e não se contorna isso.
  Guia, acompanhamento e plano de volta: `docs/orbita/DEPLOY-FUNCOES.md`.
- Netlify: site `orbita-nexus-ads` criado; o preview original continua em https://6abba26f4e8e3c05d376d3c8--orbita-nexus-ads.netlify.app. A pedido do João, em 29/09 foi criado um segundo deploy de rascunho com overlay temporário de navegação em https://6abbd2ff7054e92bd9532b7b--orbita-nexus-ads.netlify.app. Ele expõe Início, Conversas, CRM e Ads no preview; a conta precisa entrar novamente nesse hostname. A origem `web/app/prontos.js` e a `main` continuam bloqueadas. Esses previews foram feitos com `prontos.js` fechado. Em 01/10/2026 (aceite F8) `web/app/prontos.js` passou a liberar tudo e o `netlify.toml` perdeu a regra `ignore` que pulava o build da `main`: o app só vai à produção quando a `main` receber o merge e o Netlify publicar. Ainda não existe deploy de produção nem domínio confirmado.
- Cliente real: `kamiguchi` (Kamiguchi Odontologia). O cliente de demonstração foi apagado de propósito;
  o modo `?demo` do painel continua como ferramenta de venda.

## Órbita — estado verificado (29/09/2026; F8 atualizada em 01/10/2026)
- Fonte da verdade: `docs/orbita/ESPEC.md` (leia a §0 Regras de ouro e a §8 Frentes/contratos; §9 = entrega).
  Estado de cada frente: `docs/orbita/estado/F1.md` … `F7.md` (campo `proximo`). Pedidos entre frentes: `docs/orbita/PEDIDOS.md`.
- Branch `codex/orbita` enviada ao GitHub; PR #1 está aberto em rascunho. Migrações `supabase/migrations/20260928a…h` constam como aplicadas no handoff, mas não foram revalidadas nesta retomada.
- Construídas localmente: F1 banco, F2 funções (nx-enviar, nx-midia, nx-ia, webhook ampliado), F3 login/white-label/admin (`web/app/`),
  F4 CRM, F5 Conversas, F6 Anúncios/Relatórios, F7 Automações. Em 29/09, os 10 smokes SQL (`01`–`09`, incluindo `04_crm_b`) passaram no SQL Editor autenticado do projeto autorizado, com `ROLLBACK`; marcadores finais e algumas exclusões de fixtures foram adaptados apenas no texto temporário por causa da tradução automática. Os arquivos SQL do repositório não foram alterados.
- F8 (01/10/2026): runner serial 15/15 verde, smokes SQL reais aprovados, E2E pela API (tenant `teste-e2e`), E2E-A do caminho Meta e E2E-B (clientes de teste próprios, já apagados) executados (`estado/E2E*.md`) e funções publicadas pela Actions (ver "O que está NO AR"). **O dono aceitou e escolheu LIBERAR TUDO** (CRM + Ads + Atendimento + pacotes) e autorizou o merge na `main` e a produção no Netlify. No repositório: `web/app/prontos.js` libera os 9 módulos e as 18 telas de configuração (`app.teste.mjs` confere as listas contra o código e mantém o portão com lista injetada) e o `netlify.toml` não pula mais o build da `main`. Limpeza decidida (§8.5-17): **limpeza fina (b12)** — mantém o tenant `teste-e2e` e a Conta E2E para futuros E2E.
- **Falta (em ordem):**
  1. Merge na `main` (PR #1 sai de rascunho) com a suíte verde; o push na `main` também publica o painel clássico no GitHub Pages.
  2. Produção no Netlify: conferir o deploy da `main`, validar `/` e `/index.html` → `/app/` e definir a URL do app pelo caminho administrativo autorizado.
  3. Depois de no ar: conferir o site publicado (login e uma tela por módulo em 390 px, console limpo), provar o @lid em produção (roteiro em `estado/F8.md`) e publicar de rotina nx-ciclo/nx-relatorio/nx-ia/nx-midia (fora do dia 1º às 12:00 UTC).

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
