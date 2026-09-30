# Estado geral do Órbita

Atualizado: 2026-09-29 23:58 (America/Sao_Paulo)
Branch: `codex/orbita`
PR: [#1](https://github.com/Jpfamelli/nexus-ads/pull/1) — rascunho aberto

## Situação

O branch `codex/orbita` contém as frentes em revisão e o commit `40b4f7b` já foi enviado ao PR #1 (rascunho). As sete Edge Functions estão `ACTIVE` no Supabase e existe um preview público no Netlify: https://6abba26f4e8e3c05d376d3c8--orbita-nexus-ads.netlify.app. **O SaaS ainda não está pronto para uso por clientes.** `web/app/prontos.js` mantém os módulos bloqueados até os aceites E2E. As migrações CodeWords, agenda/rastreio e origem CRM/agenda estão aplicadas; os smokes SQL 05, 09, 10 e 11 passaram em transações revertidas segundo o registro da retomada anterior. O tenant isolado `teste-e2e` existe, mas a leitura atual encontrou apenas um canal Meta pendente, zero linhas de métricas e nenhum canal CodeWords. E2E-A/B real, webhook/envio/recibos CodeWords, paridade Ads, mobile autenticado, limpeza e publicação de produção seguem pendentes. Nesta retomada não li segredos nem alterei `nx_config`, dados da Kamiguchi ou produção.

## Frentes

| Frente | Código/revisão | Estado de publicação |
|---|---|---|
| F1 — banco | Migrações base, SaaS, CodeWords, agenda/rastreio e cards de origem aplicadas | Smokes 05, 09, 10 e 11 em `ROLLBACK`; sem alteração de dados da clínica |
| F2 — funções | Sete handlers compilados localmente; `deno check` 7/7 | `nx-whatsapp` v4, `nx-relatorio` v3, `nx-ciclo` v3, `nx-enviar` v2, `nx-midia` v1, `nx-ia` v1, `nx-codewords` v1 — todas `ACTIVE`, `verify_jwt=false` |
| F3 — acesso e white-label | Implementação local existente; módulos públicos seguem fechados | Preview Netlify responde; sem publicação em produção |
| F4 — CRM | Implementação, revisão e testes aprovados; origem de anúncio exibida nos cards | Smoke SQL com `ROLLBACK`; E2E autenticado do tenant segue parcial |
| F5 — conversas | Adaptador CodeWords, webhook, fila e recibos cobertos por testes locais; migração e funções publicadas | Nenhum canal CodeWords real está configurado no tenant de teste; envio e recibos reais pendentes |
| F6 — anúncios e relatórios | Implementação local e testes Node aprovados | Tenant de teste sem métricas; integrações reais e paridade CRM/Ads pendentes |
| F7 — automações | Implementação local e testes Node aprovados | Aceite autenticado de runtime permanece pendente |
| F8 — entrega | Runner serial 14/14, `deno check` 7/7, smoke local da agenda fictícia 1/1 | E2E-A/B real, CodeWords, paridade Ads, mobile autenticado e limpeza do tenant pendentes; `prontos.js` permanece fechado e sem deploy de produção |

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
