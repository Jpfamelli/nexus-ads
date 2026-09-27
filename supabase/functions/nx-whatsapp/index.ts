// nx-whatsapp — webhook da WhatsApp Cloud API. Deploy a partir de supabase/dist/nx-whatsapp (scripts/montar-funcoes.mjs).
import { tratar } from "./webhook.js";

Deno.serve((req) => tratar(req, { url: Deno.env.get("SUPABASE_URL"), chave: Deno.env.get("SUPABASE_SERVICE_ROLE_KEY") }));
