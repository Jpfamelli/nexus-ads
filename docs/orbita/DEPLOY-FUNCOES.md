# Publicar as Edge Functions pelo GitHub Actions

Desde 30/09/2026 a publicação das funções do Órbita no Supabase (projeto `dtjznipitihnwmcgpzqh`) é feita pelo
workflow `.github/workflows/funcoes-supabase.yml`. O CLI do Supabase não roda neste Windows (executável sem
assinatura, "Acesso negado"), e **não se contorna isso** na máquina: nada de desligar proteção, copiar o executável,
usar WSL ou guardar credencial.

## Antes da primeira vez (só o dono)

1. Gerar um *access token* pessoal no Supabase (Account → Access Tokens), com o nome `github-actions-nexus-ads`.
2. No GitHub, em `Jpfamelli/nexus-ads` → Settings → Secrets and variables → Actions → **New repository secret**:
   nome `SUPABASE_ACCESS_TOKEN`, valor = o token. O token não vai para arquivo, commit, chat nem log
   (o workflow confere se está vazio e se abre o projeto na API de gestão — só o código HTTP vai para o log).

Sem o segredo, ou com o token vencido/revogado, o workflow para no primeiro passo, antes do checkout e da suíte, e nada é
publicado (plano 1000, SV-161: em 09/10 o token vencido só apareceu no passo de deploy, depois de ~2 min de testes).

## O que ele publica

`supabase/deploy-lista.txt`: uma função por linha (linhas vazias e `#comentário` são ignoradas). Hoje (13/10/2026) estão
as **sete**:

```
nx-ia
nx-codewords
nx-enviar
nx-whatsapp
nx-ciclo
nx-relatorio
nx-midia
```

Cada nome precisa casar com `^nx-[a-z]+$` e existir em `supabase/dist/<fn>/index.ts` depois do `montar-funcoes`;
nome repetido, fora do padrão ou lista vazia fazem o workflow falhar **antes** de publicar qualquer coisa.

**Quando reduzir a lista:** só quando a mudança NÃO tocou nada compartilhado. Mexeu em `supabase/functions/_compartilhado/comum.js`,
`db.js`, `whatsapp.js` ou em `web/nucleo.js` → as sete (todas carregam esses arquivos; `nucleo.js` vai em nx-ciclo, nx-relatorio e
nx-whatsapp). Mudança só num arquivo próprio (ex.: `midia.js`) → só a função dele. Na dúvida, as sete: republicar código igual
não muda comportamento, e deixar uma função com o `comum.js` antigo já causou divergência. `nx-ciclo` e `nx-relatorio` rodam o
Ads e os relatórios dos clientes: se entrarem na lista, confira depois o ciclo das :07 e o relatório das 8h (abaixo).

## Como disparar

Na branch/commit que deve ir ao ar, com a árvore limpa e `node testes/rodar-tudo.mjs` verde:

```
git tag funcoes-AAAAMMDD-N
git push origin funcoes-AAAAMMDD-N
```

Ex.: `git tag funcoes-20261002-1 && git push origin funcoes-20261002-1` (a `funcoes-20261001-1` já foi usada na
primeira publicação real; cada tag é única). Só tag `funcoes-*` dispara (não há
gatilho de `pull_request`, `pull_request_target`, `workflow_run` nem push de branch). O GitHub roda o workflow
**do commit da tag**: o código publicado é sempre o daquele commit. Empurrar a tag envia ao GitHub o commit dela
(e os anteriores), mesmo que a branch ainda não tenha sido empurrada. Push na `main` continua publicando só o
painel no GitHub Pages (outro workflow); tag não mexe em Pages nem no Netlify.

Dois deploys nunca rodam juntos (`concurrency: funcoes-supabase`, sem cancelar o que já começou): uma segunda tag
espera a primeira terminar.

## Passos do workflow

As três actions de terceiros ficam fixadas pelo SHA completo do commit da versão, com a versão num comentário
(`actions/checkout` v4.4.0 `11d5960a…`, `actions/setup-node` v4.4.0 `49933ea5…`, `supabase/setup-cli` v1.7.3
`1dedf2c6…`): uma tag movida no repositório delas não muda o que roda aqui. Para atualizar, pegar o SHA com
`gh api repos/<dono>/<repo>/git/ref/tags/<versão>` (se o objeto for `tag`, resolver até o commit com
`gh api repos/<dono>/<repo>/git/tags/<sha>`); `testes/scripts.teste.mjs` recusa `uses:` sem SHA de 40 hex.

1. confere que `SUPABASE_ACCESS_TOKEN` não está vazio e que abre o projeto (`GET https://api.supabase.com/v1/projects/<ref>`,
   só leitura; diferente de 200 → «renove SUPABASE_ACCESS_TOKEN»), sem imprimir o token (SV-161);
2. checkout do commit da tag (`persist-credentials: false`, `fetch-depth: 0` para trazer a `main`);
3. **portão da main:** `git merge-base --is-ancestor <commit da tag> origin/main` — tag numa branch de trabalho não publica
   (SV-277). Exceção: tags que terminam em `-volta` (plano de volta, commit antigo de propósito);
4. Node 24 e **portão da suíte:** `node testes/rodar-tudo.mjs --exigir` — qualquer arquivo vermelho para tudo, e arquivo de
   teste listado que sumiu (apagado/renomeado) também (SV-160);
5. **portão do banco:** `node scripts/lint-migracoes.mjs` (migração nova aditiva/idempotente, SV-169) e `npm ci` +
   `node scripts/rodar-local.mjs` (todas as migrações aplicam no PGlite e os smokes passam; o `02_acesso` falha por desenho e
   está em `ESPERADAS`) — SV-262: erro bobo de SQL aparece aqui, não no ensaio em ROLLBACK no banco real;
6. `node scripts/montar-funcoes.mjs` (gera `supabase/dist/<fn>` planos e o `versao.js` de cada uma);
7. **portão de tipos:** `npx --yes deno@2.6.0 check --node-modules-dir=none supabase/dist/*/index.ts` (erro de tipo/import
   aparecia só no bundle do servidor, no meio da publicação);
8. **portão de espaço/conflito:** `git diff --check "$(git hash-object -t tree /dev/null)" HEAD -- supabase/functions web/nucleo.js
   web/app/auto-catalogo.js scripts supabase/deploy-lista.txt .github` (espaço sobrando e marcador de conflito no que vai ao ar);
9. Supabase CLI fixado em **2.118.0** (a mesma versão que publicou as versões de 29–30/09), instalado por
   `supabase/setup-cli` v1.7.3;
10. valida `supabase/deploy-lista.txt`;
11. para cada função: copia `supabase/dist/<fn>` para `supabase/functions/<fn>` numa pasta temporária e roda
   `supabase functions deploy <fn> --use-api --no-verify-jwt --project-ref dtjznipitihnwmcgpzqh`
   (bundle no servidor, `verify_jwt=false`: cada handler se autentica sozinho);
12. `supabase functions list` (versões no ar, no log);
13. sondas sem segredo, só das funções publicadas (SV-163: as sete; cada resposta também tem de trazer o cabeçalho
   `x-orbita-versao` começando por `<tag>+` — SV-164).
   - **Fatais:** nx-whatsapp POST sem assinatura → 401 e GET com verify token inválido → 403;
     nx-codewords `?ch=abc` → 401 e GET → 405; nx-enviar sem sessão → 401 e GET → 405; nx-ciclo e nx-relatorio POST sem
     `x-nx-cron` → 401 e GET → 405; nx-midia «ver» sem sessão → 401 e GET → 405; nx-ia «sugerir» sem sessão → 401 e GET → 405.
     Códigos conferidos no código (`testes/plano1000-ci.teste.mjs` chama cada `tratar()` como a sonda chama). Qualquer uma
     errada (ou versão diferente da tag) deixa o run vermelho (a função já está publicada: ver "plano de volta").
   - **Só aviso (bug 1 do E2E-meta, correção candidata por drenagem):** nx-whatsapp com corpo de 2 MiB + 1
     (Content-Length) e de 2,4 MB em pedaços → 413 em menos de 30 s (antes pendurava ~160 s e o gateway dava 503).
     Errada, emite `::warning::` com o código e o tempo e o run segue: vira pendência, nunca reversão.

## Como acompanhar

```
gh run list --workflow funcoes-supabase.yml --limit 5
gh run watch <id-da-execução> --exit-status
gh run view <id-da-execução> --log-failed
```

A sonda de 413 fica no log do passo de sondas (`ok … → 413 0.4s`) e, quando falha, também nas anotações do run
(`gh run view <id-da-execução>`, aviso amarelo com o código e o tempo). Com aviso, registrar em
`docs/orbita/estado/E2E-meta.md` (bug 1) e `F8.md` como pendência; o bug 1 só é dado como corrigido quando essa sonda
passar em produção (**passou na primeira publicação real, em 01/10/2026: ver "Primeiro deploy real" abaixo**).

Depois de verde, conferir pelo MCP do Supabase (ou Dashboard → Edge Functions): as funções da lista `ACTIVE`,
`verify_jwt=false` e versão +1. A primeira publicação pela Actions levou a **nx-codewords v3, nx-enviar v4 e
nx-whatsapp v6** (no ar em 30/09: v2, v3 e v5). Se nx-whatsapp, nx-ciclo ou nx-relatorio foram publicadas, conferir o
próximo ciclo em `net._http_response` (HTTP 200, `ok:true`, `kamiguchi ok:true`) e os logs da função sem erro.
Registrar o resultado em `docs/orbita/estado/F8.md`.

## Primeiro deploy real pela Actions (01/10/2026)

O fluxo documentado acima rodou de verdade pela primeira vez e deu certo:

| Item | Resultado |
|---|---|
| Tag / run | `funcoes-20261001-1` · run `36811688641` · 01/10/2026 03:42 UTC (00:42 em São Paulo) |
| Lista publicada | `nx-codewords`, `nx-enviar`, `nx-whatsapp` (`supabase/deploy-lista.txt`) |
| Versões que entraram | nx-codewords **v3**, nx-enviar **v4**, nx-whatsapp **v6** (correção `@lid` e 413 por drenagem) |
| Sondas de autenticação (fatais) | 401 / 403 / 405 ok |
| Sonda de 413 (bug 1 do E2E-meta) | 2 MiB + 1 com Content-Length → **413 em 0,19 s**; 2,4 MB em pedaços → **413 em 0,31 s** (antes ~160 s e 503): **corrigido em produção** |

Versões no ar depois dessa publicação: nx-codewords v3, nx-enviar v4, nx-whatsapp v6, nx-ciclo v4, nx-relatorio v4,
nx-ia v2, nx-midia v2. **As quatro últimas NÃO foram republicadas**: carregam a drenagem do corpo só no repositório e
vão ao ar numa publicação de rotina futura (acrescentar ao `supabase/deploy-lista.txt` e usar uma tag nova). Não
publicar nx-ciclo/nx-relatorio no dia 1º às 12:00 UTC, quando roda o relatório mensal; fora disso, conferir o ciclo
das :07 e o relatório das 8h depois. Depois desta publicação: a correção `@lid` foi **provada em produção** (01/10,
03:49–03:52 UTC, roteiro em `estado/F8.md`) e o ciclo das :07 da kamiguchi (04:07 UTC) voltou HTTP 200, `ok:true` e
`kamiguchi ok:true`, sem falha no pg_cron desde 03:42.

## Plano de volta

**Reverter SÓ quando** (depois de uma publicação):
- falhar uma sonda de autenticação (401/403/405, as fatais do passo 9 — o run fica vermelho);
- alguma função da lista não estiver `ACTIVE` ou estiver com `verify_jwt=true`;
- o ciclo das :07 da kamiguchi (nx-ciclo, em `net._http_response`) não der HTTP 200, `ok:true` e `kamiguchi ok:true`
  — vale quando a publicação incluiu nx-whatsapp, nx-ciclo ou nx-relatorio.

**Não reverter** por falha isolada da sonda de 413 (o `::warning::` do passo 9): ela vira pendência do bug 1 em
`E2E-meta.md`/`F8.md`. A versão anterior (nx-whatsapp v5) pendura do mesmo jeito com corpo grande, então voltar não
melhora nada — e desfaria a correção @lid (`a1fc214`), que **nunca** se reverte por causa dessa sonda.

A tag precisa apontar para um commit que **tenha este workflow**; uma tag num commit antigo (antes de 30/09) não
dispara nada. Para voltar:

1. `git revert <commit-que-quebrou>` na branch (desfaz código **e** testes juntos, então o portão continua verde;
   voltar só `supabase/functions` e manter os testes novos faria o portão barrar a volta);
2. ajustar `supabase/deploy-lista.txt` para as funções afetadas;
3. `git tag funcoes-AAAAMMDD-N-volta && git push origin funcoes-AAAAMMDD-N-volta` e acompanhar como acima.

Referências do que estava no ar antes da primeira publicação pela Actions (01/10/2026; ela é o "depois", a volta
republica estas): nx-whatsapp v5, nx-enviar v3 e nx-codewords v2 = dist de `49de8d8`; nx-ciclo v4, nx-relatorio v4, nx-ia v2 e nx-midia v2 = dist de `49de8d8`
(a correção @lid `a1fc214` e o 413 por drenagem `31404a4`, que substituiu `99003de`, vieram depois). Funções SQL
antigas: nas migrações `20260928*`, `20260929a` e `20260930*`.

Se o próprio workflow não puder rodar (Actions fora do ar, segredo revogado), a publicação fica parada até alguém
com o CLI funcionando seguir os mesmos passos 4–9 à mão. Não usar o deploy por MCP para estas funções
(130–230 KB de fontes por função).

## R122 — mídia CodeWords (01/10/2026)

Tag `funcoes-20261001-5`, commit `0583e2f`: workflow completo verde, suíte 19/19, montagem das sete funções e
sondas de autenticação. As sete ficaram `ACTIVE`, `verify_jwt=false`: nx-whatsapp v9, nx-relatorio v6,
nx-ciclo v6, nx-enviar v8, nx-midia v5, nx-ia v6 e nx-codewords v7. Sondas: WhatsApp 401/403, CodeWords
401/405 e nx-enviar 401; os dois testes de corpo 413 responderam em 0,186 s e 0,157 s. A tela do app
continua na versão `20261001e` até a etapa seguinte de publicação do front.

## Plano 100 — frente S-F (08–09/10/2026) — tag `funcoes-20261009-1`

As **sete** funções vão juntas, numa tag só (`funcoes-20261009-1`; o plano previa `funcoes-20261008-1`):
todas carregam `comum.js`, que ganhou `cortarTexto`, `telefoneBorda`, a `variantesTelefone` única, `traduzirErroIA`/
`MODELO_PADRAO`/`registrarUsoIA` e o `listarClientes` por status e com a `vertical`; e `web/nucleo.js` mudou na frente P.
**Nunca publicar perto do dia 1º às 12:00 UTC** (nx-ciclo/nx-relatorio: relatório mensal).
Portões do workflow nesta rodada: `rodar-tudo` (inclui `plano100-funcoes`), montagem, `deno check --node-modules-dir=none` dos
7 entrypoints e `git diff --check`.

O que muda em cada função (detalhe em `docs/orbita/PLANO-100-20261008.md`, itens S-F1…S-F17; testes em
`testes/plano100-funcoes.teste.mjs`, `codewords`, `funcoes`, `conversas-funcoes`, `automacoes-ia`; o caso «contrato: TODA RPC…»
confere que cada chamada das 7 funções casa com UMA assinatura viva das migrações, pelos nomes dos parâmetros):

| Função | Mudança |
|---|---|
| nx-codewords | `[ref]`/frase do botão também na reentrega e na sincronização; `duplicada` ainda decide quando a mensagem ficou sem resposta; sync avisa «mensagem recuperada sem resposta»; telefone normalizado na borda; grupo só por sinal confiável; saída `{from, to, from_me}` vira «celular»; ack numérico; `codewords_forma` 1×/h; `message_id` ou `timestamp` obrigatórios (422); 404 do aparelho reconfere o número; **vigia do aparelho** no cron da sync (aviso ao gestor com `codewords_aviso_em`) e contadores por canal (`nx_codewords_contar`); referral de post não vira `anuncio_ext` |
| nx-whatsapp | `request_welcome`/`order` da Meta; `[ref]` do site pelo canal Meta; reentrega reagenda mídia «baixando»; `nx_config` só com as colunas usadas; `nx_wa_canal` falhando por banco não cai no caminho antigo (503, retry) |
| nx-enviar | `texto_longo` com teto efetivo (assinatura); `contato_bloqueado`; fila nunca rebaixa envio feito (`enviado_sem_confirmacao`); wamid provisório só CodeWords; tamanho e MIME no caminho Meta; `baixarMidia` com teto do tipo; saídas Meta ambíguas > 24 h → `sem_confirmacao`; reserva presa repete `marcar` e devolve a última saída; resumo em `nx_execucoes`; `{ids}`+`{fila:true}` somados; `testar_canal` devolve `app_secret_global` |
| nx-midia | `subir` valida nome (≤ 200, sem controle) e legenda (≤ 1024); Content-Type normalizado |
| nx-ia | texto de terceiros entre aspas (JSON) nos prompts; `traduzirErroIA` único (nada do provedor chega ao painel); modelo padrão `claude-opus-5-5`; custo/`stop_reason`/ms registrados; pré-checagens antes de reservar cota; **pausa por plataforma** (401/403 e cota: `nx_auto_ia_falhar` com a assinatura de sempre, `p_tentar` + `p_conta=false` + `p_em=1800` → `adiado` na 20261008c, que avisa os admins 1×/24 h; com o banco antigo a função avisa); limites iguais no prompt e no schema do montar; automação reprovada volta para o editor; prompt caching no catálogo; 35 s sem retentativa por decisão |
| nx-ciclo | janela 7 d por hora e 28 d às 03:07 UTC; tolerância de 3 h também na 1ª leitura (memória em `nx_travas`); erro passageiro = «instável» (alerta) sem «Abra Ajustes»; mapa de erros Meta (2635 versão desligada, 100 campo); fallback de versão da Graph com memória; nomes antigos reescritos na rodada diária; fuso/moeda da conta no status (+ aviso único); status `parcial`; `nx_atribuicao_completar` depois do sync; telefones/wamids anonimizados no resumo; textos do radar no vocabulário da `vertical` do cliente; **modo painel** `{token, cliente, dias:1}` («Testar conexão», admin + módulo `ads`, sem radar) |
| nx-relatorio | prazo de IA por cliente (25 s); falha de IA fora de `nx_relatorios.erro` (vai para `ia_erro` no resumo); sem destino = pulado + aviso semanal ao admin; `listarClientes` ignora suspenso/cancelado/teste vencido; mesmo filtro de leads do `nx_dados`; vocabulário da `vertical` do cliente (oficina: «visitas», «Na oficina»); envio anonimizado no resumo |

**Banco necessário ANTES da tag:** migrações `20261008a` (rastreio pendente, `nx_lead_webhook` v2, `nx_wa_entrada` com
horário, `nx_atribuicao_completar`) e `20261008b` (contrato 3: `nx_codewords_vigia_alvos`, `nx_codewords_contar`,
`nx_canal_historico`, `nx_canais.codewords_aviso_em`/`codewords_contadores`, `nx_fila_concluir` com backoff).
**Recomendada antes, tolerada se faltar:** `20261008c` (contrato 7) — `nx_ia_registrar_reserva(…, p_custo_usd, p_stop_reason,
p_ms)` (sem ela o registro cai nos 5 argumentos e lembra por 10 min) e o estado `adiado` de `nx_auto_ia_falhar` (MESMA
assinatura `p_pedido, p_erro, p_tentar, p_em, p_conta`; sem a c o pedido volta como `pendente` no mesmo prazo, sem contar a
tentativa, e o aviso sai da própria função). **Correção de 13/10 (plano 1000, SV-177):** a coluna `nx_config.meta_api_versao` e
o status `sem_confirmacao` no CHECK de `nx_mensagens.status` JÁ estão na `20261008b_operacao_seguranca` (aplicada em 09/10); a
tolerância da função (versão da Graph não lembrada / varredura recusada, só log) vale apenas para banco anterior à 20261008b e
fica como histórico.

**Depois de publicar:** o ciclo das :07 (HTTP 200, `ok:true`; a rodada das 03:07 UTC traz `diaria:true` e `janela:28`), o
relatório das 8h (`ia_erro` no resumo não é falha), a sincronização do CodeWords de 2 em 2 min (`vigia:{canais, caidos, avisos}`;
`pulado:"rpc ausente"` só sem a migração b) e as sondas de autenticação do workflow. Nunca perto do dia 1º às 12:00 UTC.

**Fica para depois (S-F17, [B65]):** coexistência Meta — gravar `smb_message_echoes` (mensagem enviada pelo app do celular num
número Cloud API) como saída «celular». Exige RPC nova (`nx_wa_eco`) e um ramo no webhook para `field = 'smb_message_echoes'`;
hoje o campo é ignorado e a tela manda falar com o suporte. Pedido de banco registrado para a próxima rodada.

**Também fica para o banco ([A29]):** `nx_codewords_origem` ainda grava a origem contada (e a frase «Vim pelo anúncio
(instagram)» do botão do site) como `organico` sem `plataforma`; a função já manda a fonte (`instagram`/`facebook`/`google`),
falta a RPC guardar a plataforma quando o negócio não tem anúncio.

## Token do Supabase vencido («Invalid access token») — procedimento (plano 1000, SV-204)

Desde 09/10 as funções no ar são as de 02/10: a tag `funcoes-20261009-1` (run 37957796176) parou no passo de deploy com
«Invalid access token» — o segredo `SUPABASE_ACCESS_TOKEN` do repositório venceu. Não há conserto no código; só o dono resolve:

1. **João:** supabase.com → Account → Access Tokens → «Generate new token» (nome `github-actions-orbita`, sem prazo curto).
   Copie o valor UMA vez.
2. **João:** GitHub → `Jpfamelli/nexus-ads` → Settings → Secrets and variables → Actions → `SUPABASE_ACCESS_TOKEN` → Update
   (colar; nunca em chat, arquivo ou commit). Conferir que o passo «Segredo SUPABASE_ACCESS_TOKEN presente» sai verde.
3. Republicar: `gh run rerun 37957796176` só se o código da tag antiga ainda for o desejado; o normal é uma tag NOVA no commit
   integrado (as funções de 09/10 já estão superadas pelo plano 1000): `git tag funcoes-20261013-1 && git push origin funcoes-20261013-1`.
4. Conferir: `supabase functions list --project-ref dtjznipitihnwmcgpzqh` (passo «Versões no ar») com versões novas nas 7;
   sondas verdes; o ciclo das :07 com `ok:true`; a sincronização do CodeWords de 2 em 2 min (`sincronizacao`, `vigia`).
5. Registrar no `AGENTS.md` (seção «O que está NO AR») as versões e o run.

## Plano 1000 — frente srv, lote srv-1 (13/10/2026) — tag `funcoes-20261013-1`

As **sete** funções vão juntas (comum.js, db.js e whatsapp.js mudaram em todas). **Banco ANTES da tag:** `20261013a`
(fila/aparelho/mídia presa/ciclo por cliente/crons/modelos) e `20261013b` (segurança e dados). Toda RPC nova é tolerada se faltar
(função ausente → comportamento anterior), mas a ordem certa é migração → tag. O cron `nx-ciclo` passa a chamar
`nx_ciclo_chamar()` (um disparo por cliente): publicar as funções ANTES ou junto (a função de 02/10 já aceita `{cliente}`).

| Função | O que muda |
|---|---|
| todas | `limparErro` mascara telefone e e-mail; erro interno do painel sem detalhe técnico, com `req_id` (corpo, cabeçalho `x-orbita-req` exposto no CORS e log); `cliente_pausado` → 403; GET do PostgREST repete 1× em 502/503/504/conexão; corpo de cron ilegível → 400 (depois de autenticar); `listarClientes` tira revenda suspensa/cancelada; SDK da Anthropic fixo em `npm:@anthropic-ai/sdk@0.131.0` (o `montar-funcoes` recusa `npm:` sem versão exata) |
| nx-whatsapp | 2ª passada dos recibos (4 s) em 2º plano; recibos buscados num SELECT por tabela (overlap); `nx_config` em cache de 60 s (assinatura que não confere relê 1×); `message_template_status_update` → `nx_template_status`; lead falhando por banco no mesmo wamid na 3ª entrega → 200 + `nx_execucoes`; download de mídia com teto em streaming |
| nx-enviar | limite por conta (`nx_envio_vez`, 30/min e 600/h → 429 `limite_taxa`); HEAD do arquivo antes da Graph (tamanho real); assinatura dos bytes na mídia pelo aparelho; fila: só falta de tempo encerra a rodada, ritmo do aparelho (`nx_codewords_envio_vez` + `nx_fila_adiar`, espera curta na rodada), `nx_cv_saida` repete 1× e avisa na conversa, automação que não saiu avisa na conversa; mídia recebida presa (`nx_midia_presas`); aviso de automação com trava de 10 min, teto de 30/dia (`nx_taxa_usar`) e rastro em `nx_execucoes` |
| nx-codewords | trava única da sync (`nx-codewords:sync`); rastro em `nx_execucoes` quando houve trabalho; resposta do device manager com teto de 1 MB; segredo também pelo cabeçalho `x-nx-canal` (receita devolve `url_sem_segredo` + `cabecalho_canal`); recibos em lote (`nx_codewords_status_lote`); sync com tudo falhando por desconexão grava o estado; aviso «recuperada» 1×/30 min por conversa; conferência do aparelho vale para a fila inteira; vigia: número trocado/destino errado, pareamento abandonado não avisa, prazo de 10 s no envio, aviso que não saiu volta em ~1 h e notifica o painel |
| nx-ciclo | rodada diária por trava (03:00–08:59 UTC, a 1ª que der certo); retentativa (2 s/8 s) em páginas da Meta e consultas do Google; token da Meta no cabeçalho; janela grande demais dividida ao meio; chave do alerta de integração com a severidade; alerta que não saiu reenviado (até 3×, 6 h, `nx_alertas.tentativas_envio`) |
| nx-relatorio | reserva (`nx_relatorios.enviando_em`) antes de mandar: registro final falhando não reenvia (só `forcar`); crons de segunda chance (13:00 UTC diário; dia 1 15:00 e dia 2 12:00 mensal) |
| nx-midia | Storage com prazo (20 s; 60 s para subir); «ver» só assina o que a conta enxerga (`nx_midia_visiveis`) |

**Depois de publicar:** as conferências da seção anterior + `nx_execucoes` com `tarefa = 'nx-codewords'` quando a sync trabalha;
`cron.job` com `nx-ciclo` → `nx_ciclo_chamar()` e os três jobs `nx-relatorio-*-2/3`.

## Plano 1000 — frente srv, lote srv-3 (13/10/2026) — migrações `20261013e`, `20261013f`, `20261013g` e a próxima tag de funções

**Banco (ensaio em ROLLBACK, depois aplicar, nesta ordem):** `20261013e_funcoes_seguranca` (smoke 30), `20261013f_entrada_contratos`
(smoke 31) e — **fora do horário, sozinha** — `20261013g_validar_status_mensagens` (smoke 32: `VALIDATE CONSTRAINT` varre `nx_mensagens`;
não bloqueia escrita). Antes da `e`, conferir que `select funcoes_url ~ '^https://[a-z0-9]{20}\.supabase\.co/functions/v1/?$' from nx_config`
dá `true`: o `nx_disparar` passa a recusar outro domínio (SV-140) e os crons parariam com `funcoes_url_invalida`. Depois da `f`,
rodar uma vez `select public.nx_canais_estado_desde_preencher();` (o `nx_pulso` funciona sem, pelo histórico).

**Funções:** as sete mudam (comum.js). Toleram o banco sem `e/f` (RPC ausente → comportamento anterior), mas o certo é migração → tag.

| Função | O que muda |
|---|---|
| todas | respostas JSON com `cache-control: no-store` e `x-content-type-options: nosniff`; `limparErro` cobre `AIza…`, `sbp_…`, app secret em texto e `apikey:`; limites (`limite_taxa`, `muitas_tentativas`, `muitos_pedidos`, `aguarde`) → 429; `autenticarCron` confere SÓ o `cron_token` antes de ler o resto da `nx_config`; resumo de `nx_execucoes` com teto de 64 KB; consulta ao PostgREST ≥ 2 s vira linha `banco_lento` no log; modelo de IA desconhecido cai no padrão com aviso |
| nx-whatsapp | canal por `?c=`/phone_number_id em cache de 5 min (30 s quando não existe; assinatura/verify token que não confere relê); `phone_number_quality_update`/`account_update` → `nx_canal_qualidade` (aviso aos admins 1×/dia/evento); contadores do dia por número (`nx_canal_contar`); mídia recebida conferida por tamanho e SHA-256; medida do caminho antigo (abaixo) |
| nx-enviar | fila: canais diferentes em paralelo (3), item sem conversa reabre a do contato; «Reenviar» mídia e modelo (`nx_cv_msg_reenvio_v2`); faxina diária dos uploads de `out/` com mais de 7 dias sem mensagem (`nx_midia_referenciadas`); auditoria de testar canal e inscrever app |
| nx-codewords | teto por minuto separado mensagem × resto e `responder:false, motivo:'suspenso'` para cliente suspenso (`nx_codewords_canal(p_chave, p_tipo)`); recibos até 200 ids; «Parear» 1×/90 s e «Enviar teste» 1×/30 s por canal; vigia em paralelo (3) e «WhatsApp reconectado» ao gestor; contexto sem o telefone inteiro e histórico ≤ 8.000 caracteres |
| nx-ciclo | Meta e Google do cliente em paralelo, `ms` por integração no resumo; «Testar conexão» 1×/60 s por cliente (repetição devolve o último resultado) e auditado; aviso diário de custo de IA alto à equipe (`nx_ia_custo_alto`, teto `nx_config.ia_aviso_custo_usd`, padrão US$ 10); `appsecret_proof` quando a integração tem `meta_app_secret`; OAuth do Google com 1 retentativa |
| nx-relatorio | texto longo em várias mensagens (todas com wamid) |
| nx-ia | sugerir/resumir com 30 s e sem retentativa; só as colunas da IA da `nx_config`; resumo repetido sem mensagem nova volta do cache (`nx_ia_cache`, 30 min); recuo crescente das decisões (120 s × 2ⁿ, até 1 h) |
| nx-midia | apagar marca as mensagens `midia.estado = 'apagada'` (`nx_midia_apagada`) e audita; 60 uploads por conta em 10 min (429); «ver» assina por 10 min |

**Deploy com aprovação (SV-165):** o job `publicar` usa `environment: producao`. Para a trava valer, o João cadastra o revisor em
Settings → Environments → `producao` → Required reviewers; daí toda tag espera o «Approve» na aba Actions.

**Caminho antigo do webhook (SV-013):** número sem `nx_canais` (só `nx_clientes.wa_phone_number_id`) agora deixa a linha de log
`{"evento":"webhook_caminho_antigo","caminho":"antigo","pid":…,"n":…}` e a contagem `caminho_antigo` na resposta. Critério para
desligar o caminho: 30 dias seguidos sem nenhuma linha `webhook_caminho_antigo` no Logs Explorer da nx-whatsapp (e nenhum cliente
com `wa_phone_number_id` sem canal correspondente).

## Renovar o SUPABASE_ACCESS_TOKEN (plano 1000, SV-178)

O token pessoal do Supabase é o que deixa o Actions publicar. Ele vence (o de 30/09 parou de valer em 09/10) ou pode ser
revogado; o workflow agora confere o token no **1º passo** e, se não abrir o projeto, para com «renove SUPABASE_ACCESS_TOKEN»
antes de rodar qualquer teste. Só o João faz:

1. **Gerar:** https://supabase.com/dashboard/account/tokens → «Generate new token». Nome `github-actions-orbita-AAAAMMDD`.
   Se a tela oferecer validade, escolher a mais longa permitida e anotar a data de expiração no `docs/orbita/estado/ESTADO.md`
   (pendência «token do Supabase vence em …»), para renovar ANTES de vencer. Copiar o valor UMA vez.
2. **Gravar no GitHub:** `Jpfamelli/nexus-ads` → Settings → Secrets and variables → Actions → `SUPABASE_ACCESS_TOKEN` →
   Update secret (colar; nunca em chat, arquivo, commit ou log). Pela linha de comando, sem deixar o valor no histórico:
   `gh secret set SUPABASE_ACCESS_TOKEN --repo Jpfamelli/nexus-ads` (o `gh` pede o valor).
3. **Testar sem publicar:** o 1º passo do workflow faz só um GET de leitura em `https://api.supabase.com/v1/projects/dtjznipitihnwmcgpzqh`.
   Para conferir antes de qualquer tag, na máquina do João (o valor fica numa variável da sessão, nunca no comando):
   `curl -s -o /dev/null -w '%{http_code}\n' -H "Authorization: Bearer $SUPABASE_ACCESS_TOKEN" https://api.supabase.com/v1/projects/dtjznipitihnwmcgpzqh`
   → `200` = token bom; `401` = errado ou vencido; `403`/`404` = token de outra conta, sem acesso a este projeto.
4. **Refazer o run:** se a última tag parou por token, `gh run rerun <id-do-run>` (ex.: `gh run rerun 37957796176`) roda de novo
   o MESMO commit da tag. Se o código desejado é mais novo, tag nova no commit da `main`:
   `git tag funcoes-AAAAMMDD-N && git push origin funcoes-AAAAMMDD-N`. Acompanhar com `gh run watch <id> --exit-status`.
5. **Registrar** no `AGENTS.md` («O que está NO AR») as versões e o run, e no `ESTADO.md` a nova data de expiração.

## Crons (pg_cron) — o que roda sozinho (plano 1000, SV-180)

Extraído das migrações (o `cron.job` do PGlite depois de `node scripts/rodar-local.mjs` traz a mesma lista). Horários em UTC
(São Paulo = UTC − 3). Cada job chama uma função do banco, que dispara a Edge Function por `nx_disparar` (pg_net, com o
`cron_token`) — a função confere o `x-nx-cron`.

| Job | Agenda | Chama | O que faz | Migração |
|---|---|---|---|---|
| `nx-ciclo` | `7 * * * *` (de hora em hora, :07) | `nx_ciclo_chamar()` → nx-ciclo, um disparo por cliente | sincroniza Meta/Google Ads (janela de 7 dias; 28 dias na rodada diária 03:00–08:59), radar de alertas | 20260926 (comentado), 20261013a |
| `nx-relatorio-diario` | `0 11 * * *` (08:00 SP) | `nx_relatorio_chamar('diario')` → nx-relatorio | relatório diário no WhatsApp | 20261013a/c |
| `nx-relatorio-diario-2` | `0 13 * * *` | idem | segunda chance (a reserva não deixa sair 2×) | 20261013a/c |
| `nx-relatorio-mensal` | `0 12 1 * *` (dia 1º, 09:00 SP) | `nx_relatorio_chamar('mensal')` | relatório do mês | 20261013a/c |
| `nx-relatorio-mensal-2` / `-3` | `0 15 1 * *` / `0 12 2 * *` | idem | segunda e terceira chance | 20261013a/c |
| `nx-fila` | `* * * * *` (todo minuto) | `nx_fila_chamar()` → nx-enviar `{fila:true}` | envia a fila (automação, fora do horário, agendadas) | 20260928h |
| `nx-automacoes` | `15 seconds` | `nx_auto_lote(100)` (SQL) | motor das automações (gatilhos → ações, pedidos de IA) | 20260928h, 20261001b |
| `nx-codewords-sync` | `*/2 * * * *` | `nx_codewords_sync_chamar()` → nx-codewords | sincroniza conversas do aparelho e roda o vigia | 20260929a |
| `nx-faxina-saas` | `40 6 * * *` | `nx_saas_faxina()` (SQL) | apaga eventos/fila/notificações velhos (em lotes desde a 20261013c) | 20260928h |
| `nx-faxina-auto` | `50 6 * * *` | `nx_auto_faxina()` (SQL) | limpeza das automações e pedidos de IA velhos | 20261001a |

(Com a `20261013c_operacao_indices` — ainda NÃO aplicada em 13/10 — os crons dos relatórios passam a chamar
`nx_relatorio_chamar('diario'|'mensal')`, um disparo do nx-relatorio por cliente, com a mesma agenda; os jobs que faltarem são
criados; e a `nx_saas_faxina` apaga em lotes e também rastreio > 45 dias, travas vencidas > 1 dia, `nx_execucoes` > 60 dias e
`net._http_response` > 3 dias. Antes dela os relatórios chamam `nx_disparar('nx-relatorio', {tipo})` direto.)

**Pausar um job** (incidente; SÓ com a trava da Ponte e registro no ESTADO.md — muda o banco de produção):
`select cron.alter_job((select jobid from cron.job where jobname = 'nx-fila'), active := false);` e, para voltar,
`active := true`. Não usar `cron.unschedule` (apaga o job; a migração recria só na próxima aplicação). Para parar TODOS os envios
de um cliente (ou da plataforma) sem mexer em cron, a 20261013c traz `nx_envios_pausar(p_token, p_cliente, p_pausar, p_motivo)`
(só plataforma, auditado). Conferir o que rodou: `select jobname, status, end_time from cron.job_run_details d join cron.job j
using (jobid) order by end_time desc limit 20;` (só leitura).

## Backup do banco (plano 1000, SV-186)

`.github/workflows/backup.yml` roda todo dia às 06:17 UTC (03:17 SP) e sob demanda (Actions → «Backup do banco» → Run workflow):
`pg_dump` (cliente 17) **só das tabelas `public.nx_*`**, formato custom, sem dono/privilégios, numa sessão
`default_transaction_read_only=on`; criptografa com `gpg --symmetric` (AES256, senha pelo descritor 3, nunca na linha de comando)
e guarda como artefato `backup-nexus-ads` por **14 dias** (com o `.sha256` e a contagem de tabelas). Nada é escrito no banco.

**O que o João precisa criar (nada disso foi criado):**
1. Um papel SOMENTE LEITURA no projeto `dtjznipitihnwmcgpzqh` (SQL Editor do Supabase, como `postgres`):
   `create role orbita_backup login password '<senha forte>' bypassrls;`
   `grant usage on schema public to orbita_backup;`
   `grant select on all tables in schema public to orbita_backup;`
   `alter default privileges in schema public grant select on tables to orbita_backup;`
   `alter role orbita_backup set default_transaction_read_only = on;`
   O `BYPASSRLS` é necessário: todas as tabelas `nx_*` têm RLS ligada e o `pg_dump` recusa tabela com RLS sem ele (sem ele o
   dump sai vazio/erro). O papel não tem nenhum privilégio de escrita.
2. Segredo `BACKUP_DB_URL` no repositório: a URL de conexão do **pooler em modo sessão** (porta 5432) com o usuário
   `orbita_backup.dtjznipitihnwmcgpzqh` e a senha acima, `?sslmode=require`.
3. Segredo `BACKUP_SENHA`: uma senha longa só para o arquivo, guardada também no cofre do João (sem ela o backup não abre).
Sem os dois segredos o workflow falha no 1º passo, dizendo qual falta. A action `actions/upload-artifact` está fixada pelo SHA
da v4.6.2 — conferir o SHA com `gh api repos/actions/upload-artifact/git/ref/tags/v4.6.2` antes do primeiro run.

**Ensaio de restauração** (uma vez por mês e depois de toda mudança no workflow; nunca no banco de produção):
1. `gh run download <id> -n backup-nexus-ads` → `nexus-ads-<data>.dump.gpg`, `.sha256`, `.tabelas.txt`; `sha256sum -c *.sha256`.
2. `gpg --decrypt --output nexus-ads.dump nexus-ads-<data>.dump.gpg` (pede a `BACKUP_SENHA`).
3. Postgres local descartável (17): `createdb ensaio && psql ensaio -f` com os mesmos stubs do `scripts/rodar-local.mjs` (roles,
   schemas extensions/vault/net/cron/storage) e as migrações; depois `pg_restore --data-only --disable-triggers -d ensaio nexus-ads.dump`.
   (Alternativa sem servidor: `pg_restore -f dados.sql nexus-ads.dump` e conferir o conteúdo.)
4. Conferir: `select count(*)` de `nx_clientes`, `nx_contatos`, `nx_conversas`, `nx_mensagens`, `nx_leads` e `nx_metricas_dia`
   contra o banco real (consulta SÓ de leitura pelo MCP) e o número de tabelas do `.tabelas.txt`.
5. Apagar o arquivo descriptografado e o banco de ensaio; registrar data e contagens no `docs/orbita/estado/ESTADO.md`.
