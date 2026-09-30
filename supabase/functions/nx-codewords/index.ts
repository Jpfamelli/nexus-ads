// nx-codewords — WhatsApp via CodeWords (modelo "aparelho"): API do agente (?ch=<segredo do canal>),
// ações do painel (admin) e sincronização de 2 em 2 min (pg_cron → nx_disparar, header x-nx-cron).
// Deploy a partir de supabase/dist/nx-codewords (scripts/montar-funcoes.mjs), verify_jwt: false:
// o handler autentica pelo segredo da URL, pela sessão do painel ou pelo cron_token.
import { tratar } from "./codewords.js";

function envObrigatorio(nome: string): string {
  const valor = Deno.env.get(nome);
  if (valor) return valor;
  throw new Error(`Variável de ambiente obrigatória ausente: ${nome}`);
}

const env = { url: envObrigatorio("SUPABASE_URL"), chave: envObrigatorio("SUPABASE_SERVICE_ROLE_KEY") };
// deno-lint-ignore no-explicit-any
const emSegundoPlano = (p: Promise<unknown>) => (globalThis as any).EdgeRuntime?.waitUntil(p) ?? p;

Deno.serve((req) => tratar(req, env, { emSegundoPlano }));
