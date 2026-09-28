// nx-midia — upload assinado, URL assinada de leitura e remoção no bucket privado nx-midia. Deploy a partir de supabase/dist/nx-midia (scripts/montar-funcoes.mjs), verify_jwt: false.
import { tratar } from "./midia.js";

const env = { url: Deno.env.get("SUPABASE_URL"), chave: Deno.env.get("SUPABASE_SERVICE_ROLE_KEY") };
// deno-lint-ignore no-explicit-any
const emSegundoPlano = (p: Promise<unknown>) => (globalThis as any).EdgeRuntime?.waitUntil(p) ?? p;

Deno.serve((req) => tratar(req, env, { emSegundoPlano }));
