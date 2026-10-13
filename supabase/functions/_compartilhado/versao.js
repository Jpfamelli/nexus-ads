/* ÓRBITA — versao.js · plano 1000 (SV-164): a versão do código que responde (cabeçalho x-orbita-versao em toda resposta).
   No repositório vale "dev"; o scripts/montar-funcoes.mjs REESCREVE este arquivo em supabase/dist/<funcao>/ com a tag do deploy
   e o commit (ORBITA_VERSAO, ou GITHUB_REF_NAME + GITHUB_SHA no Actions, ou o git local). A sonda do workflow confere. */
export const VERSAO = "dev";
