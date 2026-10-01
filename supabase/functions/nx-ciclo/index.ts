// nx-ciclo — sync Meta/Google + radar. Deploy a partir de supabase/dist/nx-ciclo (scripts/montar-funcoes.mjs).
import { tratar } from "./ciclo.js";

function envObrigatorio(nome: string): string {
  const valor = Deno.env.get(nome);
  if (valor) return valor;
  throw new Error(`Variável de ambiente obrigatória ausente: ${nome}`);
}

const env = { url: envObrigatorio("SUPABASE_URL"), chave: envObrigatorio("SUPABASE_SERVICE_ROLE_KEY") };
Deno.serve((req) => tratar(req, env));
