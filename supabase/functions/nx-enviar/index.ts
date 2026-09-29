// nx-enviar — envio pelo WhatsApp dos clientes (painel) e fila/lixo de mídia (cron). Deploy a partir de supabase/dist/nx-enviar (scripts/montar-funcoes.mjs), verify_jwt: false.
import { tratar } from "./enviar.js";

function envObrigatorio(nome: string): string {
  const valor = Deno.env.get(nome);
  if (valor) return valor;
  throw new Error(`Variável de ambiente obrigatória ausente: ${nome}`);
}

const env = { url: envObrigatorio("SUPABASE_URL"), chave: envObrigatorio("SUPABASE_SERVICE_ROLE_KEY") };
// deno-lint-ignore no-explicit-any
const emSegundoPlano = (p: Promise<unknown>) => (globalThis as any).EdgeRuntime?.waitUntil(p) ?? p;

Deno.serve((req) => tratar(req, env, { emSegundoPlano }));
