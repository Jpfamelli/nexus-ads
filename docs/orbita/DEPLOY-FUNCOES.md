# Publicar as Edge Functions pelo GitHub Actions

Desde 30/09/2026 a publicação das funções do Órbita no Supabase (projeto `dtjznipitihnwmcgpzqh`) é feita pelo
workflow `.github/workflows/funcoes-supabase.yml`. O CLI do Supabase não roda neste Windows (executável sem
assinatura, "Acesso negado"), e **não se contorna isso** na máquina: nada de desligar proteção, copiar o executável,
usar WSL ou guardar credencial.

## Antes da primeira vez (só o dono)

1. Gerar um *access token* pessoal no Supabase (Account → Access Tokens), com o nome `github-actions-nexus-ads`.
2. No GitHub, em `Jpfamelli/nexus-ads` → Settings → Secrets and variables → Actions → **New repository secret**:
   nome `SUPABASE_ACCESS_TOKEN`, valor = o token. O token não vai para arquivo, commit, chat nem log
   (o workflow só confere se está vazio e nunca o imprime).

Sem o segredo o workflow para no primeiro passo, antes do checkout, e nada é publicado.

## O que ele publica

`supabase/deploy-lista.txt`: uma função por linha (linhas vazias e `#comentário` são ignoradas). Hoje:

```
nx-codewords
nx-enviar
nx-whatsapp
```

Cada nome precisa casar com `^nx-[a-z]+$` e existir em `supabase/dist/<fn>/index.ts` depois do `montar-funcoes`;
nome repetido, fora do padrão ou lista vazia fazem o workflow falhar **antes** de publicar qualquer coisa.
Ponha na lista só o que mudou e precisa ir ao ar. `nx-ciclo` e `nx-relatorio` rodam o Ads e os relatórios da
Kamiguchi: se entrarem na lista, confira depois o ciclo das :07 e o relatório das 8h (abaixo).

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

1. confere que `SUPABASE_ACCESS_TOKEN` não está vazio (sem imprimir);
2. checkout do commit da tag (`persist-credentials: false`), Node 24;
3. **portão:** `node testes/rodar-tudo.mjs` — qualquer suíte vermelha para tudo;
4. `node scripts/montar-funcoes.mjs` (gera `supabase/dist/<fn>` planos);
5. Supabase CLI fixado em **2.118.0** (a mesma versão que publicou as versões de 29–30/09), instalado por
   `supabase/setup-cli` v1.7.3;
6. valida `supabase/deploy-lista.txt`;
7. para cada função: copia `supabase/dist/<fn>` para `supabase/functions/<fn>` numa pasta temporária e roda
   `supabase functions deploy <fn> --use-api --no-verify-jwt --project-ref dtjznipitihnwmcgpzqh`
   (bundle no servidor, `verify_jwt=false`: cada handler se autentica sozinho);
8. `supabase functions list` (versões no ar, no log);
9. sondas sem segredo, só das funções publicadas.
   - **Fatais (autenticação):** nx-whatsapp POST sem assinatura → 401 e GET com verify token inválido → 403;
     nx-codewords `?ch=abc` → 401 e GET → 405; nx-enviar sem sessão → 401. Qualquer uma errada deixa o run
     vermelho (a função já está publicada: ver "plano de volta").
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
tentativa, e o aviso sai da própria função). **Ainda sem migração (pedido à S-B), tolerado:** a coluna
`nx_config.meta_api_versao` (sem ela a versão da Graph que respondeu não é lembrada — só log) e o status `sem_confirmacao` no
CHECK de `nx_mensagens.status` (sem ele a varredura horária das saídas Meta ambíguas > 24 h é recusada pelo banco — só log; as
mensagens continuam `pendente`).

**Depois de publicar:** o ciclo das :07 (HTTP 200, `ok:true`; a rodada das 03:07 UTC traz `diaria:true` e `janela:28`), o
relatório das 8h (`ia_erro` no resumo não é falha), a sincronização do CodeWords de 2 em 2 min (`vigia:{canais, caidos, avisos}`;
`pulado:"rpc ausente"` só sem a migração b) e as sondas de autenticação do workflow. Nunca perto do dia 1º às 12:00 UTC.

**Fica para depois (S-F17, [B65]):** coexistência Meta — gravar `smb_message_echoes` (mensagem enviada pelo app do celular num
número Cloud API) como saída «celular». Exige RPC nova (`nx_wa_eco`) e um ramo no webhook para `field = 'smb_message_echoes'`;
hoje o campo é ignorado e a tela manda falar com o suporte. Pedido de banco registrado para a próxima rodada.

**Também fica para o banco ([A29]):** `nx_codewords_origem` ainda grava a origem contada (e a frase «Vim pelo anúncio
(instagram)» do botão do site) como `organico` sem `plataforma`; a função já manda a fonte (`instagram`/`facebook`/`google`),
falta a RPC guardar a plataforma quando o negócio não tem anúncio.
