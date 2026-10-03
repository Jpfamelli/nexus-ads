# Estado geral do Órbita

Atualizado: 2026-10-01 18:39 (America/Sao_Paulo)
Follow-up R122: PR [#3](https://github.com/Jpfamelli/nexus-ads/pull/3) mesclado em `main` (merge `f0602b9`); produção publicada com front `20261001f`.
Follow-up R119: `codex/orbita-r119` · PR [#2](https://github.com/Jpfamelli/nexus-ads/pull/2) mesclado
Base em produção: F8/PR [#1](https://github.com/Jpfamelli/nexus-ads/pull/1) mesclado; https://orbita-nexus-ads.netlify.app

## Seguimento R122 — mídia CodeWords — 01/10/2026

- **Implementação local na branch `codex/midia-codewords`:** envio de foto, áudio e arquivo pelo aparelho pareado; áudio gravado convertido em WAV 16 kHz mono; `client_ref` na mídia; validação MIME/limites; download do Storage em fluxo com corte efetivo no limite; proteção contra permissão tardia do microfone em outra conversa.
- **Verificações locais:** suíte completa 19/19, montagem de sete funções, `deno check` 7/7 e `git diff --check`; teste automatizado opcional do Chrome indisponível porque `puppeteer-core` não está instalado. A central local abriu no navegador integrado.
- **Backend publicado:** `funcoes-20261001-5`, commit `0583e2f`, Actions 36929001866 verde; sete funções ACTIVE e probes 401/403/405/413 aprovadas. Versões: whatsapp v9, relatorio v6, ciclo v6, enviar v8, midia v5, ia v6, codewords v7.
- **Front publicado:** PR #3 mesclado (`f0602b9`); release Netlify `6abed2b47eab05dec79aaf0f`, produção em https://orbita-nexus-ads.netlify.app. A verificação HTTP encontrou `/app/index.html` em 200 com `app.js?v=20261001f`, a raiz em 302 para `/app/` e cabeçalho CSP presente.
- **Aceite técnico R122:** suíte Node 19/19, `deno check` 7/7, montagem das sete funções e probes 401/403/405/413 verdes. Funções ativas: nx-whatsapp v9, nx-relatorio v6, nx-ciclo v6, nx-enviar v8, nx-midia v5, nx-ia v6 e nx-codewords v7. A entrega real de foto/áudio/arquivo ainda precisa de aparelho CodeWords pareado e teste manual do João. Nenhuma alteração de banco/credenciais.

## Follow-up R119 — integração local, não publicado — 2026-10-01 14:26 -03

- **Fechado localmente:** WIP de B/C/D integrado na branch `codex/orbita-r119`: paleta/ações do shell; CRM/Agenda; chips compactos e ordenação do Radar; pré-carregamento, Conversas com base/lista em paralelo; leitura de rascunho persistido; correções de acessibilidade. O shell está na versão `20261001d`; o teste novo confirma `ctx.rascunho.existe/texto` e seu uso em Conversas.
- **Verificações:** `node testes/rodar-tudo.mjs` passou **19/19 arquivos** após a última correção; `testes/app.teste.mjs` 147/147; montagem das sete funções passou; Axe em 6 telas × desktop/celular, **12/12 sem violações**. QA browser em dev-falso: Conversas 70/70 e Relatórios/Anúncios 62/62. Três smokes de migração passaram somente em ambiente local/PGlite com rollback. O handoff registrou `deno check` 7/7; não consegui repetir agora porque `deno` não está instalado/no PATH neste shell.
- **Fora do pacote fechado:** M19 (motor global de avisos/pulso entre abas) não foi implementado; fila IndexedDB pode reter mensagem não enviada até TTL/limpeza. Aparelho real (iOS/Android) não foi testado nesta rodada.
- **Bloqueio de publicação:** o Supabase MCP falhou ao renovar OAuth. As migrações `20261002b/c/d` não foram confirmadas/aplicadas no remoto; não publiquei funções nem deploy Netlify. A produção permanece no F8 já aceita.
- **PR:** #2 está em rascunho e o GitHub marcou o branch como mergeable; nenhum status check foi retornado. Revisar a sequência das migrações e os arquivos incluídos antes de qualquer merge.
- **Próximo gate:** reconectar Supabase MCP pela interface; conferir e ensaiar/aplicar as migrações aprovadas em ordem; publicar funções pelas Actions depois das migrações; só após revisão e gates verdes mesclar e fazer release manual de checkout LF da `main`. Não mexer em `nx_config`.

## F8 ACEITA em 01/10/2026 — 2026-10-01 01:15 -03

- **Aceite:** o dono aceitou a F8 e liberou tudo (CRM + Ads + Atendimento + pacotes), com merge na `main` e produção no Netlify. A tabela completa de evidências está em `F8.md` (seção "F8 ACEITA em 01/10/2026").
- **Evidências:** E2E CodeWords 15/16 casos (o defeito `@lid` corrigido e provado em produção); E2E Meta 26/27 casos (o bug 1, 413, corrigido em produção); E2E-B 256/256 asserções; isolamento (106/106 sondas SQL negadas, 64 RPCs + 23 operações pela API negadas, `09_isolamento` verde, hash do `kamiguchi` sem diferença); QA final de interface **201/201** telas×larguras sem defeito; sondas de produção 401/403/405 e **413 em 0,19 s / 0,31 s**; **prova do `@lid` em produção** (01/10 03:49–03:52 UTC: `lid_sem_numero` sem gravar nada, número real por `sender_pn`/`remoteJidAlt`, telefone normal registrado, grupo ignorado); **ciclo :07 ok** (04:07 UTC: 200, `ok:true`, `kamiguchi ok:true`, pg_cron sem falhas desde 03:42); **limpeza fina b12 aplicada** (04:09:48 UTC: canal falso, Vault 0, lead, contato, convites, sessão de 30 dias e auditoria do `teste-e2e`; tenant e Conta E2E mantidos; impressão digital do `kamiguchi` igual antes e depois). Suíte local `rodar-tudo` 15/15.
- **Limitações conhecidas:** só a chave real do CodeWords/WhatsApp/Meta prova a entrega real, os recibos reais e se o id do envio bate com o da lista do aparelho (senão a sincronização duplica a mensagem e pausa a IA como "celular"); IA real com chave não exercitada; mídia recebida não é durável; mutação RPC genérica sem reconciliação depois de timeout; nx-ciclo, nx-relatorio, nx-ia e nx-midia com a drenagem do corpo só no repositório (rotina futura, nunca dia 1º às 12:00 UTC); `nx_execucoes` id 95 aceita como histórico; aparelho real/iOS/Firefox não testados.
- **Publicação (esta etapa, depois deste commit):** push, PR #1 pronto e merge na `main` (commit de merge), GitHub Pages pelo push na `main` e deploy de produção no Netlify `orbita-nexus-ads`. O resultado conferido fica no PR #1 e na Ponte. `nx_config.saas_url` fica com o João (os agentes não alteram `nx_config`).

## Atualização anterior — 2026-10-01 01:05 -03 (aceite F8: liberar tudo)

- **Primeiro deploy real pela GitHub Actions** (run `36811688641`, tag `funcoes-20261001-1`, 01/10 03:42 UTC): nx-codewords **v3**, nx-enviar **v4**, nx-whatsapp **v6** (correção @lid + 413 por drenagem). Sondas em produção: 401/403/405 ok; 2 MiB + 1 → **413 em 0,19 s** e 2,4 MB em pedaços → **413 em 0,31 s**: o bug 1 do E2E-meta está **corrigido em produção** (antes ~160 s e 503). A prova em produção do @lid (roteiro em `F8.md`) ainda não foi feita.
- **Versões no ar:** nx-codewords v3, nx-enviar v4, nx-whatsapp v6, nx-ciclo v4, nx-relatorio v4, nx-ia v2, nx-midia v2. As quatro últimas **não foram republicadas**: a drenagem do corpo está só no repositório; publicação de rotina futura, nunca no dia 1º às 12:00 UTC (relatório mensal).
- **Aceite do dono:** LIBERAR TUDO (CRM + Ads + Atendimento + pacotes), com merge na `main` e produção no Netlify autorizados. Limpeza do §8.5-17 = **limpeza fina (b12)**: mantém o tenant `teste-e2e` e a Conta E2E para futuros E2E.
- **No repositório (commit desta atualização):** `web/app/prontos.js` libera os 9 módulos (`inicio`, `conversas`, `crm`, `empresas`, `tarefas`, `ads`, `automacoes`, `relatorios`, `admin_revendas`) e as 18 seções de configuração; `app.teste.mjs` passou a conferir as duas listas contra o código (rotas, `pronto("...")` e seções `*-config.js`), a provar que com a lista real todas as rotas abrem, a manter o portão com lista injetada e o padrão fechado se o arquivo não carregar. `netlify.toml` sem a regra `ignore` que pulava o build da `main` (teste atualizado). Cache do app `20261001a`.
- **Validação:** `node testes/rodar-tudo.mjs` **15/15**; `node --check` em todos os `web/app/*.js`; `git diff --check` limpo (só avisos de fim de linha).
- **Ainda não feito (próximas etapas, fora deste commit):** push, merge na `main`, deploy de produção no Netlify e conferência do site publicado. Até o merge, a produção continua como estava; o painel clássico no Pages só muda com push na `main`.

## Atualização anterior — 2026-09-30 20:15 -03

Correções pós-E2E commitadas (sem push): 413 nas Edge Functions por drenagem e descarte do corpo (`31404a4`, correção candidata que substitui `99003de`; só vale como corrigida quando a sonda de produção passar), plano de volta com a sonda de 413 só como aviso (`5b03f41`), actions do deploy fixadas por SHA (`5818937`), logo largo no menu (`e11770b`), CSP também em `<meta>` para o GitHub Pages (`97460df`), publicação das funções por **GitHub Actions** com tag `funcoes-*` (`cf1a2a5`, guia em `docs/orbita/DEPLOY-FUNCOES.md`) e os E2E-A/B registrados (`dd12be4`). Suíte 15/15, `deno check` 7/7. No ar continuam nx-whatsapp v5, nx-enviar v3, nx-codewords v2, nx-ciclo v4, nx-relatorio v4, nx-ia v2 e nx-midia v2: a correção @lid e o 413 só vão ao ar na primeira publicação pela Actions, que depende do segredo `SUPABASE_ACCESS_TOKEN` no repositório. Sobra `nx_midia_lixo` 21 (órfã do E2E-B) apagada; `nx_execucoes` 95 fica como histórico. Detalhes em `F8.md`.

## Atualização anterior — 2026-09-30 09:36 -03

O branch `codex/orbita` contém três rodadas de UX: tema claro padrão com modos claro/escuro/marca persistentes; gravação de áudio e anexos com indicação honesta dos limites de CodeWords; diagnóstico Meta/Google com atualização de estado e balões ajustados ao conteúdo. A verificação mais recente passou em 14/14 arquivos da suíte serial Node. O código segue para revisão no PR #1; não houve deploy, alteração de Supabase ou mudança em `main`. F8 continua aberta e os módulos permanecem bloqueados.

## Situação (texto de 30/09, histórico; o estado de 01/10 está na atualização atual acima)

O branch `codex/orbita` contém as frentes em revisão e o commit `40b4f7b` já foi enviado ao PR #1 (rascunho). As sete Edge Functions estão `ACTIVE` no Supabase e existe um preview público no Netlify: https://6abba26f4e8e3c05d376d3c8--orbita-nexus-ads.netlify.app. **O SaaS ainda não está pronto para uso por clientes.** `web/app/prontos.js` mantém os módulos bloqueados até os aceites E2E. As migrações CodeWords, agenda/rastreio e origem CRM/agenda estão aplicadas; os smokes SQL 05, 09, 10 e 11 passaram em transações revertidas segundo o registro da retomada anterior. O tenant isolado `teste-e2e` existe, mas a leitura atual encontrou apenas um canal Meta pendente, zero linhas de métricas e nenhum canal CodeWords. E2E-A/B real, webhook/envio/recibos CodeWords, paridade Ads, mobile autenticado, limpeza e publicação de produção seguem pendentes. Nesta retomada não li segredos nem alterei `nx_config`, dados da Kamiguchi ou produção.

## Frentes

| Frente | Código/revisão | Estado de publicação |
|---|---|---|
| F1 — banco | Migrações base, SaaS, CodeWords, agenda/rastreio e cards de origem aplicadas | Smokes 05, 09, 10 e 11 em `ROLLBACK`; sem alteração de dados da clínica |
| F2 — funções | Sete handlers; `deno check` 7/7; publicação por GitHub Actions (tag `funcoes-*`) | `nx-codewords` v3, `nx-enviar` v4, `nx-whatsapp` v6 (Actions, 01/10 03:42 UTC; @lid e 413 no ar, bug 1 corrigido em produção); `nx-ciclo` v4, `nx-relatorio` v4, `nx-ia` v2, `nx-midia` v2 sem republicar (drenagem só no repositório) — todas `ACTIVE`, `verify_jwt=false` |
| F3 — acesso e white-label | Implementação local existente; `prontos.js` libera todos os módulos e telas (01/10) | Preview Netlify responde; produção só depois do merge na `main` |
| F4 — CRM | Implementação, revisão e testes aprovados; origem de anúncio exibida nos cards | Smoke SQL com `ROLLBACK`; E2E autenticado do tenant segue parcial |
| F5 — conversas | Adaptador CodeWords, webhook, fila e recibos cobertos por testes locais; migração e funções publicadas | Nenhum canal CodeWords real está configurado no tenant de teste; envio e recibos reais pendentes |
| F6 — anúncios e relatórios | Implementação local e testes Node aprovados | Tenant de teste sem métricas; integrações reais e paridade CRM/Ads pendentes |
| F7 — automações | Implementação local e testes Node aprovados | Aceite autenticado de runtime permanece pendente |
| F8 — entrega | **ACEITA em 01/10/2026.** Runner serial 15/15, `deno check` 7/7; E2E CodeWords 15/16, E2E Meta 26/27 e E2E-B 256/256, com os defeitos corrigidos e o `@lid` e o 413 provados em produção; QA final 201/201 | Limpeza fina b12 aplicada (mantém `teste-e2e` e a Conta E2E); `prontos.js` liberado e `netlify.toml` sem a regra `ignore`; publicado em 01/10: merge 4db317d na `main`, Pages run 36814384242 ok, Netlify produção https://orbita-nexus-ads.netlify.app |

## Retomada CodeWords — 2026-09-29 13:42

O smoke `supabase/testes/10_codewords.sql` agora cobre a configuração do canal dentro de rollback: só admin configura, a chave de teste é gravada no Vault sem aparecer na resposta, a URL do webhook é emitida e booleano inválido é rejeitado. É uma chave sintética, sem chamada ao Runtime.

`node testes/rodar-tudo.mjs` passou 12/12; `conversas-funcoes` 48/48 e `codewords` 9/9. A montagem gerou as sete pastas flat; `deno check` foi executado nos sete entrypoints. A alteração nova do smoke SQL ainda não teve dry run no PostgreSQL. Migration e `nx-codewords`/`nx-enviar` não foram aplicados/publicados. Sem mudanças remotas.

F8 continua aberta: falta executar E2E-A/B em tenant e canal de teste, validar entrada/saída/recibos reais, paridade Ads, mobile autenticado e isolamento, limpar fixtures e receber os aceites antes de publicar produção. `prontos.js` e `main` seguem bloqueados.

## QA local — 2026-09-29 13:51

`node testes/rodar-tudo.mjs` passou em 12/12 arquivos. `deno check` passou nos sete entrypoints de `supabase/dist`; `git diff --check` passou, com avisos de normalização de fim de linha apenas. A suíte valida o adaptador e a montagem local. O smoke SQL `10_codewords.sql` ainda não foi executado em PostgreSQL, portanto a migration CodeWords não está aprovada nem aplicada.

Nenhum acesso ou alteração remota nesta rodada. Permanecem pendentes os deploys de `nx-codewords` e `nx-enviar` atualizado, a configuração e a troca real no workflow/número de teste, E2E-A/B, paridade Ads, mobile autenticado, isolamento/limpeza e produção. `web/app/prontos.js` e `main` continuam bloqueados.

## Verificações locais

Nesta retomada, `node testes/rodar-tudo.mjs` passou em 12/12 arquivos, incluindo sete casos novos do adaptador CodeWords. `npx --yes deno check supabase/dist/nx-codewords/index.ts` e `git diff --check` passaram. Isso valida somente o contrato local com `fetch` falso; não prova webhook ou envio real.

Nesta retomada, Chrome headless abriu o login em 375×812 e 390×844. Nos dois tamanhos `documentElement.scrollWidth` e `body.scrollWidth` bateram com a largura do viewport; o formulário apareceu e não houve erros de console. Isso valida somente o shell de login: sem backend autenticado, as telas e fluxos internos continuam sem verificação mobile. A suíte Node mais recente segue em 11/11; os testes de app, CRM e painel passaram 46/46, 34/34 e 70/70.

Nesta retomada, os seis entrypoints das Edge Functions passaram por `deno check` após validarem explicitamente as duas variáveis Supabase obrigatórias; os handlers também tipam `emSegundoPlano`. `node scripts/montar-funcoes.mjs` gerou as seis pastas planas; `node testes/rodar-tudo.mjs` passou 11/11 e `git diff --check` passou.

O smoke `supabase/testes/09_isolamento.sql` prepara a org Nexus e uma revenda B, contas admin/atendente, entidades de teste, varredura de RPCs concedidas a `anon` derivada de `pg_proc` e comparação de hash antes/depois das linhas de B. A sonda reconhece que `nx_sair` é idempotente e aceita somente a resposta pública exata `[{"ok":true}]` sem sessão; qualquer outro conteúdo reprova. As 14 migrations e os 10 smokes SQL passaram numa instância efêmera PGlite com stubs/índices omitidos; além disso, nesta retomada os 10 smokes passaram no Supabase real, em transações revertidas. O teste de interface E2E continua pendente.

## Bloqueios e próximo passo

Bloqueios atuais: executar E2E-A/B no tenant `teste-e2e`, incluindo webhook assinado, recibos, origem e métricas de anúncio; testar telas autenticadas a 375×812 e 390×844 e revisar console/isolamento; depois limpar o tenant e só então publicar produção. A conta administrativa sintética autenticou no tenant e não acessa a rota global de clientes. O preview Netlify ainda não é produção. `prontos.js` continua bloqueando os módulos, a `main` não foi publicada e o PR #1 permanece draft.

## Retomada 2026-09-29 10:25

João autenticou a conta gestora existente no preview Netlify. Pelo painel de plataforma, criei o tenant descartável `teste-e2e` (clínica odontológica, plano Profissional, teste até 13/10/2026); a tela inicial carregou e o CRM mostrou os dois funis padrão e as sete etapas de Pacientes. `?dev=1` foi usado apenas no preview para abrir módulos em construção; `web/app/prontos.js` continua bloqueando a liberação pública. Um convite de administrador foi gerado para o tenant, mas não foi compartilhado nem usado; João autorizou criar/remover a conta sintética e definirá a senha no navegador no passo do convite. O E2E-A/B segue pendente. Sem alterações em `nx_config`, dados da Kamiguchi ou produção.

## Retomada 2026-09-29 10:47

No tenant `teste-e2e`, criei um contato e uma oportunidade sintéticos, marquei o negócio como fechado e confirmei que sua origem permanece “Cadastro manual”. A tela Anúncios ainda não tem campanhas nem métricas, portanto não foi possível aceitar a paridade Ads/CRM. O canal de WhatsApp usa apenas valores falsos; a chamada de conexão retornou 190, como esperado para o token inválido. A conta isolada foi convidada e o formulário de criação de acesso está aberto numa aba Chrome separada; João digitará a senha diretamente ali. `node testes/rodar-tudo.mjs` passou 11/11. E2E do webhook/conversa/recibos, isolamento da conta, telas autenticadas em mobile e limpeza continuam pendentes. Sem uso de credenciais reais ou alterações em `nx_config`, Kamiguchi ou produção.

## Retomada 2026-09-29 10:59

João concluiu o convite da conta sintética. A sessão autenticada mostra “Conta E2E Órbita”, papel Administrador e o tenant de teste; a rota global `#/admin/clientes` foi negada com “Você não tem acesso a esta área”. A rota `#/crm` mostrou “Esta área chega em breve”, mantendo os módulos fechados em `prontos.js`. O painel de suporte segue no tenant `teste-e2e`. Não consultei URL de webhook, token ou app secret. Permanecem pendentes os testes assinados de conversa/recibo, paridade Ads (não há métricas no tenant), mobile autenticado, limpeza, publicação de produção e aceites E2E-A/B.

O teste anônimo somente de leitura `GET /rest/v1/nx_contatos?select=id&limit=1`, sem sessão e usando a chave pública do app, respondeu HTTP 401. Nenhuma chave ou resposta de erro foi impressa.

## Retomada 2026-09-29 09:42

João autorizou expressamente a recuperação de acesso da própria conta gestora. Confirmei no projeto Supabase autorizado que a conta está aprovada, RLS está habilitado e havia zero links válidos antes da operação. A tentativa anterior sem resultado acessível foi consumida; o banco agora tem exatamente um link de recuperação válido por 24 horas. O formulário de nova senha está aberto no preview Netlify. João ainda precisa preencher e salvar a senha; o agente não leu nem definiu senha. `nx_config`, clientes e leads não foram alterados. A suíte Node passou 11/11 e `git diff --check` passou. E2E, produção e liberação de módulos seguem pendentes.

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

## Retomada 2026-09-29 11:12

João confirmou a criação da conta administrativa descartável. A sessão mostrou o tenant de teste; a conta já havia sido impedida de abrir a administração global e continua sem ver módulos ainda não aceitos. No suporte do gestor, o CRM e a lista de Conversas abriram no preview; o CRM mostra apenas a oportunidade sintética fechada e Conversas está vazia. O canal WhatsApp de teste permanece pendente, com token falso.

Rodei novamente `node testes/rodar-tudo.mjs` (11/11), gerei as seis pastas com `node scripts/montar-funcoes.mjs`, validei os seis entrypoints com `npx --yes deno check` (código 0) e confirmei `git diff --check`. Nenhum dado foi gravado neste ciclo. `web/app/prontos.js` segue com módulos vazios. E2E-A/B, assinatura de webhook e recibos, métricas e paridade Ads, testes autenticados a 375×812/390×844 com console, limpeza e produção continuam pendentes; por isso não liberei módulos nem publiquei na `main` ou no Netlify de produção.

## Retomada 2026-09-29 10:01

João informou que salvou a senha. Ao conferir a página, o preview ainda mostrava o formulário de criação de senha, sem confirmação de sucesso; naveguei para `#/login` e deixei a autenticação com João para preservar a senha. A suíte `node testes/rodar-tudo.mjs` passou em 11/11 arquivos. O próximo passo é João entrar no preview e responder `entrei`; então sigo com tenant de teste, E2E-A/B e validação mobile autenticada. Nenhum dado de cliente, `nx_config` ou ambiente de produção foi alterado.

## Retomada 2026-09-29 10:04

A tentativa manual de entrar no preview mostrou “E-mail ou senha não conferem”. A sessão continua sem autenticação e o E2E permanece bloqueado. A suíte `node testes/rodar-tudo.mjs` passou em 11/11 arquivos. Aguardo João confirmar se viu a mensagem de sucesso após salvar a senha para decidir o próximo passo de recuperação. Nenhuma credencial foi lida ou alterada pelo agente; sem mudanças em `nx_config`, clientes ou produção.

## Retomada 2026-09-29 10:18

João pediu para reiniciar a recuperação. Substituí o link ainda ativo por um novo, temporário, e confirmei no Supabase que há exatamente um link válido para a conta gestora existente; uma consulta separada confirmou que o RLS da tabela continua habilitado. O formulário de nova senha está aberto no preview; João deve definir e salvar a própria senha. A conta gestora aprovada já existe, então não criei outra conta nem alterei o código de ativação ou `nx_config`. Não houve alteração de dados de cliente nem de produção. F8 aguarda a confirmação visual do salvamento e login para continuar o E2E autenticado.

## Conector CodeWords — preparo local

Adicionei em Configurações → Formulário do site um cartão para conectar um workflow do CodeWords ao CRM: instruções copiáveis, endpoint e formato do POST. Ele usa `nx_lead_entrada`, a chave de entrada do cliente e a chave pública já existente. O lead chega como origem “Site” e guarda `utm_source=codewords-whatsapp` na observação. A automação deve enviar somente uma vez por novo lead qualificado; não deve disparar em cada mensagem. Esta primeira ligação não importa conversas e não requer API key do CodeWords. A direção inversa — Órbita chamando workflow no runtime CodeWords — e a sincronização da caixa de mensagens ainda não estão implementadas.

O código está somente na branch `codex/orbita`; o preview ainda não foi atualizado. `F8` continua bloqueada pelos aceites E2E-A/B, validação autenticada/mobile e limpeza do tenant de teste. Nenhuma credencial CodeWords foi fornecida ou guardada.

Verificação da alteração CodeWords: `node testes/relatorios.teste.mjs` 39/39, `node testes/rodar-tudo.mjs` 11/11 e `git diff --check` aprovados.

## Acesso do tenant de teste no preview — 2026-09-29

No Chrome, a sessão aberta é `Conta E2E Órbita` com papel `ADMINISTRADOR`; a navegação mostra Configurações e, dentro dela, apenas Perfil. Isso é consequência do bloqueio intencional em `web/app/prontos.js` (`MODULOS_PRONTOS=[]`, `CONFIG_PRONTAS=["perfil"]`). A opção `?dev=1` exige `conta.super`, então não habilita os módulos para essa conta. O suporte da Nexus vê o CRM em outra sessão, sem compartilhar acesso com esse usuário. O link `#/crm` não contorna as permissões. Não houve alteração de permissões, banco, preview ou produção. F8 permanece pendente dos aceites E2E-A/B e mobile autenticado; depois deles, liberar os módulos aceitos conforme ESPEC §8–9.

## Preview de navegação solicitado por João — 2026-09-29 12:05

João pediu liberar as abas no preview e confirmou o escopo de Início, Conversas, CRM e Ads. Criei um overlay temporário fora da árvore Git e publiquei o deploy Netlify de rascunho `6abbd2ff7054e92bd9532b7b`: https://6abbd2ff7054e92bd9532b7b--orbita-nexus-ads.netlify.app. O arquivo servido `app/prontos.js` respondeu HTTP 200 com essas quatro chaves; `CONFIG_PRONTAS` continua em Perfil. A origem `web/app/prontos.js`, a `main` e a produção seguem fechadas. A nova URL exige login de novo; a tela Entrar carregou, mas não fiz login nem li senha. Não houve alteração de banco ou dados. Esse preview de avaliação não conclui F8: ainda faltam E2E-A/B autenticados, mobile autenticado e limpeza.

## CodeWords como canal de conversas — preparação local — 2026-09-29 12:38

João confirmou que o plano pago CodeWords cobre entrada de mensagens, envio pelo workflow e recibos. Preparei o adaptador bidirecional para a central do Órbita, separado do fluxo anterior de lead qualificado em `#/config/formulario`.

O código local acrescenta `supabase/migrations/20260929a_codewords.sql`, `supabase/functions/nx-codewords/` e `supabase/functions/_compartilhado/codewords.js`; atualiza `nx-enviar`, o compositor de Conversas, Números de WhatsApp, textos de erro e o montador de funções. No painel, um admin cadastra Service ID, telefone, departamento e chave reutilizável `cwk-`; o backend guarda a chave no Vault e cria uma URL secreta por canal. O workflow envia mensagens/eventos e os recibos à timeline do mesmo CRM; respostas digitadas na caixa são encaminhadas ao Runtime API. O canal inicial envia só texto, dentro da janela de 24 h, e não usa modelos da Meta ou mídia.

A migração está **local e não aplicada**; `nx-codewords` e `nx-enviar` não foram republicadas; preview não atualizado. Nenhum teste/build ou chamada a CodeWords foi executado nesta etapa. F8 segue em andamento e os módulos continuam sujeitos aos aceites E2E-A/B, testes mobile autenticados, isolamento, limpeza e publicação.

## Validação local do adaptador CodeWords — 2026-09-29 12:55

Adicionei sete testes com chamadas falsas para entrada, saída via Runtime API, recibos `delivered`, captura de referral/anúncio, variações de telefone, validação do evento de saúde, rejeição de payload grande e redação da API key nos erros. O teste de montagem agora inclui `nx-codewords`, e o runner F8 passou a incluir a nova suíte. Corrigi também uma expectativa antiga de mensagem para refletir o texto neutro por provedor.

Verificações: `node testes/rodar-tudo.mjs` 12/12; `npx --yes deno check supabase/dist/nx-codewords/index.ts`; `git diff --check`. A checagem do `index.ts` no diretório-fonte, fora do dist plano, não resolve o import local esperado; o artefato de deploy plano passou.

A migração `20260929a_codewords.sql` permanece sem aplicação, a função e a atualização de `nx-enviar` sem deploy, e o preview não foi atualizado. Não consultei nem usei a API key do João e não alterei banco, `nx_config`, número ou dados de cliente. F8 ainda exige fluxo real de entrada, resposta e recibos em número de teste, E2E-A/B, mobile autenticado, isolamento, limpeza e aceite antes de produção.

## Retomada 2026-09-29 13:08

Corrigi a retentativa de saída CodeWords para preservar uma referência estável por mensagem. O navegador cria `client_ref` no envio e guarda o mesmo valor no pedido otimista; nx-enviar o repassa ao Runtime API. Timeout, 408/425/429, 5xx e resposta 2xx sem `message_id` ficam como confirmação pendente, sem gravar uma falha que ofereça uma segunda tentativa sem correlação. Falha explícita do provedor continua registrada. Se CodeWords aceitar a mensagem e a gravação no banco falhar, o painel também recebe estado ambíguo para repetir com a mesma referência. A fila usa o ID persistente do item como referência. O assistente do canal orienta o workflow a persistir e deduplicar `client_ref`.

O teste da Edge Function simula envio aceito com resposta 503, seguido da repetição com o mesmo ID: uma só mensagem enviada e uma linha final persistida. `node testes/rodar-tudo.mjs` passou em 12/12 arquivos (incluindo 47 casos do teste de Edge Functions e oito do adaptador); montagem das sete funções, `npx --yes deno check` dos sete entrypoints e `git diff --check` passaram.

Esse aceite é local, com rede falsa. A migration `20260929a_codewords.sql` não foi aplicada; `nx-codewords` e `nx-enviar` atualizado não foram publicados; não consultei nem usei a chave CodeWords e não alterei banco, `nx_config`, canais ou produção. F8 segue aberta até integração real em número de teste, E2E-A/B, mobile autenticado, isolamento, limpeza e publicação aprovada.

## Revisão local CodeWords — 2026-09-29 13:32 -03

A revisão encontrou uma corrida de ordenação: o serviço pode notificar `delivered/read/failed` antes do eco outbound. Antes, esse recibo era ignorado enquanto a linha não existia. Corrigi localmente com tabela pendente por canal/ID (TTL de sete dias), RPC `nx_codewords_status` e advisory lock compartilhado com `nx_codewords_saida`. O eco aplica o estado pendente usando `nx_wa_status`; a fila mantém estados monotônicos. `rotacionar_webhook` valida boolean e respostas síncronas `delivered/read` deixam o status correto.

Adicionei caso Node para status antes do eco e `supabase/testes/10_codewords.sql` para confirmar a fila real em transação revertida quando houver sessão de banco. `node testes/rodar-tudo.mjs` passou 12/12 arquivos (`conversas-funcoes` 48/48; CodeWords 9/9); montagem das sete funções e `deno check` dos sete artefatos passaram. A migration permanece local; sem dry run, deploy nem chamada real ao CodeWords nesta etapa. F8 continua bloqueada por E2E-A/B em canal real de teste, validação mobile autenticada, isolamento/limpeza e publicação aprovada.

## Marco 2026-09-29 23:29 -03 — migração 29c

A migração aditiva `20260929c_cards_origem.sql` foi ensaiada com o smoke 11 em transação revertida, aplicada ao Supabase `dtjznipitihnwmcgpzqh` (versão `20260930022742`) e validada novamente com o smoke 11 em rollback (`SMOKE_11_APPLIED_OK`). CRM e agenda recebem nomes de campanha/anúncio e UTMs permitidas sem IDs de clique; assinaturas e grants permaneceram iguais. Nenhum dado de clínica ou `nx_config` foi alterado. F8 continua aberta para E2E, QA mobile, isolamento, limpeza e decisão dos gates de publicação.

## Retomada Codex — QA e estado remoto — 2026-09-29 23:54

- `node testes/rodar-tudo.mjs`: **14/14 arquivos passaram**. A primeira rodada revelou versões de cache divergentes em `web/app/index.html`; padronizei `antes.js`, `app.css` e `app.js` em `20260929d` e a suíte passou novamente.
- `node scripts/montar-funcoes.mjs` gerou as sete pastas planas. `npx --yes deno check` passou nos sete entrypoints. O teste da agenda fictícia passou 1/1; `git diff --check` passou, com avisos de normalização LF/CRLF do Windows.
- QA de interface local realizado em Início, Conversas, CRM, Agenda, Configurações/Números e Administração/Clientes, em 375×812, 390×812 e 1440×900: sem overflow horizontal e sem erro de console. A marcação, conflito e desmarcação de consulta foram exercitados apenas contra o servidor local fictício, sem rede externa. Telefones e identidade da clínica foram removidos desse mock.
- Leitura remota, sem segredos: migrações `20260929a_codewords`, `20260929b_agenda_rastreio` e `20260929c_cards_origem` constam aplicadas; as sete Edge Functions estão ACTIVE nas versões registradas no quadro acima. O tenant `teste-e2e` existe, mas só tem um canal Meta pendente, zero linhas de métricas e nenhum canal CodeWords.
- Nada nesta rodada foi escrito no banco ou publicado. `prontos.js` mantém todos os módulos bloqueados; o branch `codex/orbita` segue separado da `main`.
- F8 continua sem aceite E2E-A/B: faltam credencial/canal CodeWords de teste para ida e volta com recibos, métricas Meta/Google isoladas para validar atribuição e paridade, teste mobile autenticado e limpeza do tenant após os testes. Não usei dados de produção para tentar cobrir essas faltas.

## Atualização do PR e preview — 2026-09-29 23:58

O commit `40b4f7b` foi enviado a `origin/codex/orbita`; PR #1 segue aberto como rascunho e sem verificações de CI reportadas. O preview único `6abba26f4e8e3c05d376d3c8--orbita-nexus-ads.netlify.app/app/` responde 200 com CSP, mas o preview-overlay `6abbd2ff7054e92bd9532b7b` ainda serve uma configuração anterior com Início/Conversas/CRM/Ads; a raiz `orbita-nexus-ads.netlify.app` responde 404. Não encontrei ferramenta ou autenticação Netlify disponível nesta sessão para criar um novo deploy. Nenhum deploy de produção foi feito.
## Retomada 2026-09-30 00:06 — Netlify e próximo aceite

O repositório está limpo na branch `codex/orbita`, commit `14b5a32`; PR #1 permanece aberto como draft e sem status checks reportados. A sessão autenticada do Netlify confirmou que `orbita-nexus-ads` ainda não está conectado a um repositório e não tem deploy de produção; os dois previews existentes são anteriores e não recebem os commits atuais. Para gerar um Deploy Preview do PR, é necessário vincular `Jpfamelli/nexus-ads`, o que concede ao Netlify acesso ao repositório. Nenhuma conexão ou publicação foi feita enquanto essa permissão não é confirmada.

F8 segue em andamento. Os testes locais (14/14 suítes, sete `deno check` e QA responsivo descritos em F8) estão verdes. O tenant `teste-e2e` ainda precisa de canal CodeWords e métricas Meta/Google isoladas para concluir o teste de ida e volta, recibos e paridade de Ads; continuam pendentes o E2E autenticado, validação mobile autenticada e limpeza. `web/app/prontos.js` permanece bloqueado e a `main`/produção não foram alteradas.

## Retomada Codex — polimento visual do Órbita — 2026-09-30 00:32 -03

- Revisei o mock local no CRM em desktop e no chat em tela estreita. O CRM agora tem cabeçalho de funil e cartões com mais hierarquia; o chat prioriza nome/telefone e separa as ações no celular.
- O shell ganhou uma aurora lenta, pontos orbitais, feedback de navegação e foco visível; a marca branca continua a controlar as cores e movimento reduzido desativa os efeitos.
- Assets do shell versionados como `20260930a`. `node testes/rodar-tudo.mjs`: **14/14**; `git diff --check`: aprovado.
- O commit `e80158c` (`feat(ui): elevar a experiência visual do Órbita`) foi enviado a `origin/codex/orbita` e está no PR #1, ainda draft. Netlify não conectado ao repositório nesta etapa. Não houve deploy, alteração em dados/configuração do Supabase, nem publicação na `main`. F8 segue incompleta pelos gates E2E-A/B, canal CodeWords de teste, métricas Ads isoladas, QA mobile autenticado e limpeza de fixtures.

## Proteção para Deploy Preview — 2026-09-30 00:35 -03

- `netlify.toml` ignora builds da branch `main` antes do aceite F8; Deploy Previews da branch do PR continuam elegíveis. O comando exato de ignore passou no Bash para `main` (retorna 0/ignora) e `codex/orbita` (retorna 1/continua). A regra cobre builds contínuos, não deploys manuais ou build hooks.
- O site `orbita-nexus-ads` ainda não está conectado ao repositório. O vínculo aguarda confirmação de ação no momento da conexão, pois concede acesso persistente ao repo.
- Nenhum deploy remoto nem escrita em Supabase foi feito. F8 segue aberta para E2E-A/B, canal CodeWords de teste, métricas Ads isoladas, QA mobile autenticado e limpeza de fixtures.

## Vínculo Netlify — autenticação pendente — 2026-09-30 00:43 -03

- João confirmou conectar o Netlify `orbita-nexus-ads` ao repo `Jpfamelli/nexus-ads`. O site está autenticado no Chrome, mas o GitHub não tem sessão ativa e abriu a tela de login.
- Não inseri credenciais nem alterei a configuração do projeto. A aba GitHub ficou aberta para autenticação manual; após João entrar, continuar o vínculo e verificar o Deploy Preview. Produção segue protegida pela regra da `main`.
- A suíte Node 14/14 passou antes do fluxo. Nenhum deploy remoto ou escrita no Supabase foi feito; F8 permanece aberta pelos gates documentados.

## Netlify GitHub App instalado — 2026-09-30 01:07 -03

- Após a autenticação manual do João, instalei o GitHub App do Netlify com acesso somente a `Jpfamelli/nexus-ads` e selecionei esse repo no projeto `orbita-nexus-ads`.
- O fluxo chegou à configuração final, que implantaria `main` pelo botão “Deploy nexus-ads”. Como `origin/main` ainda não tem o `netlify.toml` de proteção (a regra existe somente em `codex/orbita`) e F8 não foi aceita, parei antes de iniciar o deploy.
- O vínculo ainda não foi concluído; nenhum deploy novo, mudança na `main` ou escrita no Supabase. F8 continua pendente pelos E2E-A/B, canal CodeWords de teste, métricas Ads isoladas, mobile autenticado e limpeza de fixtures.

## Entrega local das três rodadas — 2026-09-30 01:57 -03

- Branch `codex/orbita`; melhoria cross-app, aliases, manifestos PWA, ajuste tipográfico/visual, contexto de IA por vertical e memória operacional aprovada estão no working tree e detalhados em `docs/orbita/rodadas-melhoria-20260930.md`.
- Deep links testados no preview local: Atendimento → oportunidade CRM 801 (com origem/campanha) → conversa 901. Demo sinalizada como fictícia em `http://127.0.0.1:4174/app/?dev-falso=1&dev=1#/inicio`.
- Verificação: Node 14/14 arquivos; teste de app 49 verificações; montagem e `deno check` 7/7; `git diff --check` aprovado (somente avisos LF/CRLF).
- Integrações CodeWords/Meta/Google/IA reais não foram chamadas nem configuradas nesta rodada. A migration de memória está local, `nx_config` e dados remotos não foram alterados, `prontos.js` permanece fechado.
- F8 continua aberta para os E2E reais em tenant/canais de teste, QA mobile autenticado, isolamento e limpeza. Netlify/preview hospedado e publicação de produção não foram atualizados; PR #1 permanece draft. Não foi feita mudança em `main`.

## Commit da rodada — 2026-09-30 02:02 -03

`6055700` (`feat(orbita): separar CRM, Ads e atendimento`) enviado para `origin/codex/orbita`. PR #1 continua aberto como draft, cabeça confirmada pelo GitHub; nenhuma mudança em `main`.

## Rodadas de melhoria — tema, atendimento e integrações — 2026-09-30 09:36 -03

- Registro detalhado: `docs/orbita/rodadas-melhoria-20260930-claro-audio-conectividade.md`.
- Verificação após a alteração final: `node testes/rodar-tudo.mjs` passou em **14/14 arquivos**; `node testes/app.teste.mjs` passou em 50 verificações; `node testes/conversas.teste.mjs` passou em 33; `git diff --check` aprovado (avisos de LF/CRLF do Windows).
- Os botões de mídia e gravação não enviam nada em CodeWords; o canal atual é textual. O fluxo Cloud API mantém suporte a mídia existente. Não houve acesso à câmera/microfone, serviço de anúncio, credenciais ou integração externa real.
- `web/app/prontos.js`, `main`, dados do Supabase e `nx_config` não mudaram. Não houve deploy Netlify. F8 continua aberta para E2E-A/B, métricas/canal de teste, QA mobile autenticado, isolamento e limpeza.

## Cadastro de clientes e pacotes comerciais — 2026-09-30

- No Admin, “Novo cliente” agora recebe segmento e especificações por texto livre e oferece exatamente Essencial, Profissional e Ultra com os preços/entregas definidos pelo João. A edição permite atualizar os mesmos campos; o cadastro separa pacote de marketing do nível técnico de acesso ao Órbita.
- O snapshot comercial é validado no servidor, em centavos, pela migration aditiva `20260930b_pacotes_comerciais.sql`; edição de especificações não altera o preço previamente combinado. Migration e smoke SQL estão na branch e não foram aplicados ao banco.
- Verificação: `node testes/rodar-tudo.mjs` passou em 14/14 arquivos antes do ajuste final da notificação; depois do ajuste, `node --check web/app/admin.js` e `node testes/app.teste.mjs` passaram. `git diff --check` passou, com avisos normais LF/CRLF.
- Não houve escrita no Supabase, alteração de `nx_config`, deploy Netlify, alteração em `main` ou liberação de `web/app/prontos.js`. F8 continua aberta pelos gates registrados em `F8.md`.

## Correções dos prompts anexados — 2026-09-30 10:58 -03

- Corrigida a validação da lista de domínios no Admin; resposta inválida gera erro recuperável em vez de falhar em `.filter`.
- Métricas da fixture de vendas reconciliadas: 36 criados, 9 ganhos, 4 perdidos e R$ 28.400 na série e nos KPIs. Prévia/envio e origem do valor do CRM ficam explícitos.
- Inbox da demo aplica critérios e filtros das filas, mostra chips ativos removíveis, e mantém a faixa fictícia fora do compositor. O chat responde a resize em janelas baixas.
- Verificação: `node testes/rodar-tudo.mjs` — **14/14 arquivos passaram**; 53 checks de app, 35 de Atendimento e 40 de relatórios. QA local em 360, 390, 768, 879×513, 1024 e 1440 px; botão Enviar visível e sem sobreposição.
- Detalhes: `docs/orbita/rodadas-melhoria-20260930-prompts.md`. Sem APIs reais, mensagens, gravações no Supabase/`nx_config`, liberação de `prontos.js` ou publicação de produção. O push atualiza somente o PR; eventual Deploy Preview depende da integração automática do Netlify. F8 segue em andamento.

## Segurança, estabilidade e conectividade — 2026-09-30 12:12 -03

- Revisores independentes nas frentes segurança, estabilidade/conectividade e UX/a11y; os principais ajustes locais estão em `docs/orbita/rodada-seguranca-estabilidade-20260930.md`.
- Suíte serial: 14/14; montagem Edge Functions: 7; `deno check`: 7/7. Quatro URLs locais (hub, CRM, Ads, Atendimento) responderam HTTP 200.
- Nada foi publicado nem gravado em Supabase; preview Netlify público está defasado (`20260928a`). Migrations 30c/30d locais aguardam smoke SQL com rollback.
- F8 segue em andamento. Risco conhecido: recuperação durável da mídia ainda ausente, além dos gates reais autenticados documentados no `F8.md`.
- O navegador alerta para conferir mutações após timeout, mas não há reconciliação genérica por chave de idempotência; risco descrito no estado F3/F8.

## Migrações 30a–30e aplicadas e funções republicadas — 2026-09-30 17:10 -03

- Aplicadas no Supabase (ensaiadas antes em ROLLBACK): memória operacional da IA (30a) e sua leitura na tela (30e), pacotes comerciais (30b), reservas atômicas de cota da IA (30c) e fila com STATUS INCERTO (30d). Smokes 03, 05, 06, 08, 09, 10 e 11 verdes depois de aplicado. A cota da IA agora conta toda tentativa.
- Sete Edge Functions republicadas: nx-ciclo v4, nx-relatorio v4, nx-whatsapp v5, nx-enviar v3, nx-midia v2, nx-ia v2, nx-codewords v2. Autenticação conferida; ciclo das 20:07 UTC devolveu 200/ok para kamiguchi. Detalhes e plano de volta em F8.md.
- Não houve Netlify, merge na main, alteração de prontos.js ou mudança em dados de produção. F8 segue em andamento pelos gates de E2E e mobile.

## Follow-up — três rodadas de melhorias — 2026-10-02

- Entregues 37 melhorias locais em três rodadas para UX móvel, conectividade/cache e segurança/estados de CRM e atendimento. Inventário e arquivos de evidência: `docs/orbita/estado/MELHORIAS-20261002.md`.
- `node testes/rodar-tudo.mjs`: **20/20 arquivos**; montagem das sete Edge Functions e `npx --yes deno check` dos sete entrypoints também concluíram com código 0.
- Chrome headless com `dev-falso`: Atendimento, CRM, Ads e Início em 390 × 844 sem overflow da página; jornada simulada anúncio → conversa → agenda → CodeWords → CRM → receita Ads coberta por testes.
- Sem chamadas a APIs reais, sem alterações no banco, `nx_config`, `prontos.js`, `main` ou produção. F8 permanece ACEITA conforme o registro mais recente no `AGENTS.md`; este follow-up não altera `F8.md` nem seus gates.
- Branch: `codex/orbita-melhorias-20261002`. A11y axe não executado porque `puppeteer-core` não está instalado; conferir o relatório datado para esse limite e as demais verificações.

## Follow-up — 58 melhorias adicionais — 2026-10-03

- CRM/Agenda: 15; Atendimento: 11; visual/acessibilidade transversal: 18; Ads/Início/Relatórios: 14. Inventário e evidências: [`MELHORIAS-20261003.md`](MELHORIAS-20261003.md).
- Verificação fresca: `node testes/rodar-tudo.mjs` — **23/23 arquivos**; focados CRM 15/15, Atendimento 103/103, visual 18/18 e Ads 14/14. Montagem das sete funções e `npx --yes deno check` 7/7 passaram; `node --check` 73 arquivos JavaScript/ESM e `git diff --check` limpos.
- Smoke no Chrome em `dev-falso`: Anúncios/Campanhas e o modo claro carregaram; busca de campanha retornou 1/7, filtro CRM e comparação de duas campanhas funcionaram; telas CRM e Atendimento carregaram com fixtures; nenhum erro no console. Nenhuma mensagem foi enviada e nenhuma API real foi chamada.
- Escopo somente local/front/testes/documentação na branch `codex/orbita-40-melhorias-20261003`. Sem API externa, banco, `nx_config`, `prontos.js`, `main` ou deploy. F8 permanece aceita; este follow-up não altera seu estado/gates.
