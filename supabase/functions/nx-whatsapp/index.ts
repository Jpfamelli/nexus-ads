// nx-whatsapp — webhook da WhatsApp Cloud API. Deploy a partir de supabase/dist/nx-whatsapp (scripts/montar-funcoes.mjs).
// Mídia recebida e mensagem "fora do horário" saem em segundo plano (EdgeRuntime.waitUntil): a Meta recebe o 200 logo.
import { tratar } from "./webhook.js";

function envObrigatorio(nome: string): string {
  const valor = Deno.env.get(nome);
  if (valor) return valor;
  throw new Error(`Variável de ambiente obrigatória ausente: ${nome}`);
}

const env = { url: envObrigatorio("SUPABASE_URL"), chave: envObrigatorio("SUPABASE_SERVICE_ROLE_KEY") };
// deno-lint-ignore no-explicit-any
const emSegundoPlano = (p: Promise<unknown>) => (globalThis as any).EdgeRuntime?.waitUntil(p) ?? p;

Deno.serve((req) => tratar(req, env, { emSegundoPlano }));
