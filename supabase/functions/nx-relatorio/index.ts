// nx-relatorio — relatório diário/mensal no WhatsApp. Deploy a partir de supabase/dist/nx-relatorio (scripts/montar-funcoes.mjs).
import { tratar } from "./relatorio.js";

Deno.serve((req) => tratar(req, { url: Deno.env.get("SUPABASE_URL"), chave: Deno.env.get("SUPABASE_SERVICE_ROLE_KEY") }));
