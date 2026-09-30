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

Ex.: `git tag funcoes-20261001-1 && git push origin funcoes-20261001-1`. Só tag `funcoes-*` dispara (não há
gatilho de `pull_request`, `pull_request_target`, `workflow_run` nem push de branch). O GitHub roda o workflow
**do commit da tag**: o código publicado é sempre o daquele commit. Empurrar a tag envia ao GitHub o commit dela
(e os anteriores), mesmo que a branch ainda não tenha sido empurrada. Push na `main` continua publicando só o
painel no GitHub Pages (outro workflow); tag não mexe em Pages nem no Netlify.

Dois deploys nunca rodam juntos (`concurrency: funcoes-supabase`, sem cancelar o que já começou): uma segunda tag
espera a primeira terminar.

## Passos do workflow

1. confere que `SUPABASE_ACCESS_TOKEN` não está vazio (sem imprimir);
2. checkout do commit da tag (`persist-credentials: false`), Node 24;
3. **portão:** `node testes/rodar-tudo.mjs` — qualquer suíte vermelha para tudo;
4. `node scripts/montar-funcoes.mjs` (gera `supabase/dist/<fn>` planos);
5. Supabase CLI fixado em **2.118.0** (`supabase/setup-cli@v1`, a mesma versão que publicou as versões de 29–30/09);
6. valida `supabase/deploy-lista.txt`;
7. para cada função: copia `supabase/dist/<fn>` para `supabase/functions/<fn>` numa pasta temporária e roda
   `supabase functions deploy <fn> --use-api --no-verify-jwt --project-ref dtjznipitihnwmcgpzqh`
   (bundle no servidor, `verify_jwt=false`: cada handler se autentica sozinho);
8. `supabase functions list` (versões no ar, no log);
9. sondas sem segredo, só das funções publicadas: nx-whatsapp POST sem assinatura → 401, GET com verify token
   inválido → 403, **corpo de 2 MiB + 1 → 413 em menos de 30 s** (com Content-Length e em pedaços; bug 1 do
   E2E-meta: antes pendurava ~160 s e o gateway dava 503); nx-codewords `?ch=abc` → 401 e GET → 405; nx-enviar
   sem sessão → 401. Sonda errada faz o workflow terminar vermelho (a função já está publicada: ver "plano de volta").

## Como acompanhar

```
gh run list --workflow funcoes-supabase.yml --limit 5
gh run watch <id-da-execução> --exit-status
gh run view <id-da-execução> --log-failed
```

Depois de verde, conferir pelo MCP do Supabase (ou Dashboard → Edge Functions): as funções da lista `ACTIVE`,
`verify_jwt=false` e versão +1. A primeira publicação pela Actions deve levar a **nx-codewords v3, nx-enviar v4 e
nx-whatsapp v6** (no ar em 30/09: v2, v3 e v5). Se nx-whatsapp, nx-ciclo ou nx-relatorio foram publicadas, conferir o
próximo ciclo em `net._http_response` (HTTP 200, `ok:true`, `kamiguchi ok:true`) e os logs da função sem erro.
Registrar o resultado em `docs/orbita/estado/F8.md`.

## Plano de volta

A tag precisa apontar para um commit que **tenha este workflow**; uma tag num commit antigo (antes de 30/09) não
dispara nada. Para voltar:

1. `git revert <commit-que-quebrou>` na branch (desfaz código **e** testes juntos, então o portão continua verde;
   voltar só `supabase/functions` e manter os testes novos faria o portão barrar a volta);
2. ajustar `supabase/deploy-lista.txt` para as funções afetadas;
3. `git tag funcoes-AAAAMMDD-N-volta && git push origin funcoes-AAAAMMDD-N-volta` e acompanhar como acima.

Referências do que estava no ar antes da primeira publicação pela Actions: nx-whatsapp v5, nx-enviar v3 e
nx-codewords v2 = dist de `49de8d8`; nx-ciclo v4, nx-relatorio v4, nx-ia v2 e nx-midia v2 = dist de `49de8d8`
(a correção @lid `a1fc214` e o 413 `99003de` vieram depois). Funções SQL antigas: nas migrações `20260928*`,
`20260929a` e `20260930*`.

Se o próprio workflow não puder rodar (Actions fora do ar, segredo revogado), a publicação fica parada até alguém
com o CLI funcionando seguir os mesmos passos 4–9 à mão. Não usar o deploy por MCP para estas funções
(130–230 KB de fontes por função).
