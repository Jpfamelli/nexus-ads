/* ============================================================
   ÓRBITA — gerar-prompt-codewords.mjs
   Gera docs/orbita/CODEWORDS-PROMPT.md a partir de montarReceita()
   (supabase/functions/_compartilhado/codewords_prompt.js) — o MESMO texto que o painel
   entrega pela ação "receita", com a URL do canal no lugar de {{URL_DO_ORBITA}}.
   O teste testes/codewords.teste.mjs confere que o arquivo está em dia.
   Uso: node scripts/gerar-prompt-codewords.mjs
   ============================================================ */
import { writeFileSync } from "node:fs";
import { dirname, resolve } from "node:path";
import { fileURLToPath } from "node:url";
import { montarReceita, VERSAO_PROMPT } from "../supabase/functions/_compartilhado/codewords_prompt.js";

export const MARCADOR_URL = "{{URL_DO_ORBITA}}";
const RAIZ = resolve(dirname(fileURLToPath(import.meta.url)), "..");
export const ARQUIVO = resolve(RAIZ, "docs/orbita/CODEWORDS-PROMPT.md");

export function documento() {
  const prompt = montarReceita({ url: MARCADOR_URL });
  return [
    "# Prompt do CodeWords — fluxo de atendimento por WhatsApp (Órbita)",
    "",
    `**Prompt ${VERSAO_PROMPT}.** O fluxo ficou mais leve: só conversa, agenda, chama uma pessoa e repassa mensagens ao Órbita.`,
    "A etapa do funil, a origem, as notas, o resumo da conversa e os follow-ups agora são **Automações do Órbita** (com IA do Claude), em Órbita › Automações.",
    "",
    "Este é o texto que o DONO cola no construtor de fluxos do CodeWords (o Cody) para criar **um** fluxo que liga o aparelho de",
    "WhatsApp (pareado no `whatsapp_device_manager`) à IA do Órbita. O painel entrega o mesmo texto já com a URL do canal",
    "(ação `receita` da função `nx-codewords`); aqui a URL aparece como `{{URL_DO_ORBITA}}` — troque pela URL secreta do canal,",
    "que está em Órbita › Configurações › Números. **Essa URL é secreta**: cole só dentro do CodeWords, nunca em site, chat público ou repositório.",
    "",
    "Passo a passo do dono:",
    "",
    "1. Órbita › Configurações › Números: cadastre o número (canal CodeWords), clique em «Parear» e digite o código no celular.",
    "2. Copie o prompt abaixo (o painel já preenche a URL) e cole no Cody. Peça para ele publicar o fluxo.",
    "3. O Cody devolve o **Service ID** do fluxo. Cole-o no canal (Órbita › Configurações › Números) e clique em «Ligar ao fluxo de IA».",
    "4. Teste com um número seu: a IA responde, a resposta aparece no Órbita como resposta da IA, e uma mensagem sua pelo celular pausa a IA na conversa.",
    "",
    "Já tem um fluxo da versão 1? Não crie outro: cole este prompt no Cody pedindo para **atualizar o mesmo fluxo** (mesmo Service ID) e tirar dele as ferramentas etapa, origem e nota. A API do Órbita continua aceitando essas três ações, então o fluxo antigo segue funcionando até você atualizar.",
    "",
    "Este arquivo é gerado por `node scripts/gerar-prompt-codewords.mjs` a partir de `supabase/functions/_compartilhado/codewords_prompt.js`; não edite à mão.",
    "",
    "## Texto para colar",
    "",
    "```text",
    prompt,
    "```",
    "",
  ].join("\n");
}

if (process.argv[1] && resolve(process.argv[1]) === fileURLToPath(import.meta.url)) {
  writeFileSync(ARQUIVO, documento(), "utf8");
  console.log(`gerado: ${ARQUIVO}`);
}
