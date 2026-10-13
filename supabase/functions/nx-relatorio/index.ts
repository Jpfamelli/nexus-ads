// nx-relatorio — relatório diário/mensal no WhatsApp. Deploy a partir de supabase/dist/nx-relatorio (scripts/montar-funcoes.mjs).
import { tratar } from "./relatorio.js";
import { comVersao } from "./comum.js";

function envObrigatorio(nome: string): string {
  const valor = Deno.env.get(nome);
  if (valor) return valor;
  throw new Error(`Variável de ambiente obrigatória ausente: ${nome}`);
}

const env = { url: envObrigatorio("SUPABASE_URL"), chave: envObrigatorio("SUPABASE_SERVICE_ROLE_KEY") };
// plano 1000 (SV-164): toda resposta diz a versão que está no ar (x-orbita-versao)
Deno.serve(async (req) => comVersao(await tratar(req, env)));
