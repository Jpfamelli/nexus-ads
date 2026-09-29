// nx-codewords — eventos bidirecionais do canal CodeWords para conversas do Órbita.
// Deploy a partir de supabase/dist/nx-codewords, verify_jwt=false; o handler valida a chave do canal.
import { tratar } from "./codewords.js";

function envObrigatorio(nome: string): string {
  const valor = Deno.env.get(nome);
  if (valor) return valor;
  throw new Error(`Variável de ambiente obrigatória ausente: ${nome}`);
}

const env = { url: envObrigatorio("SUPABASE_URL"), chave: envObrigatorio("SUPABASE_SERVICE_ROLE_KEY") };
Deno.serve(req => tratar(req, env));
