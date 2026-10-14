// nx-whatsapp — webhook da WhatsApp Cloud API. Deploy a partir de supabase/dist/nx-whatsapp (scripts/montar-funcoes.mjs).
// Mídia recebida e mensagem "fora do horário" saem em segundo plano (EdgeRuntime.waitUntil): a Meta recebe o 200 logo.
import { tratar } from "./webhook.js";
import { comVersao } from "./comum.js";

function envObrigatorio(nome: string): string {
  const valor = Deno.env.get(nome);
  if (valor) return valor;
  throw new Error(`Variável de ambiente obrigatória ausente: ${nome}`);
}

const env = { url: envObrigatorio("SUPABASE_URL"), chave: envObrigatorio("SUPABASE_SERVICE_ROLE_KEY") };
// deno-lint-ignore no-explicit-any
const emSegundoPlano = (p: Promise<unknown>) => (globalThis as any).EdgeRuntime?.waitUntil(p) ?? p;

// plano 1000 (SV-164): toda resposta diz a versão que está no ar (x-orbita-versao)
Deno.serve(async (req) => comVersao(await tratar(req, env, { emSegundoPlano })));
