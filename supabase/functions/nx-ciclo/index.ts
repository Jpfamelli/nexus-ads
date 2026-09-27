// nx-ciclo — sync Meta/Google + radar. Deploy a partir de supabase/dist/nx-ciclo (scripts/montar-funcoes.mjs).
import { tratar } from "./ciclo.js";

Deno.serve((req) => tratar(req, { url: Deno.env.get("SUPABASE_URL"), chave: Deno.env.get("SUPABASE_SERVICE_ROLE_KEY") }));
