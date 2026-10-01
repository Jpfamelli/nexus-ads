// nx-ia — IA do Órbita pela API oficial da Anthropic (SDK em ia.js). Ações (roteadas em ia_conversas.js):
//   sugerir / resumir (Conversas: a IA nunca envia, o texto volta para o atendente revisar),
//   automacao_montar (Automações: descrição → automação do catálogo, admin) e
//   automacao_decidir (decisões do motor — só o cron, com o x-nx-cron).
// Deploy a partir de supabase/dist/nx-ia (scripts/montar-funcoes.mjs), verify_jwt: false.
// O SDK da Anthropic só é carregado (ia.js) quando há chave e a conversa já foi conferida.
import { tratar } from "./ia_conversas.js";

function envObrigatorio(nome: string): string {
  const valor = Deno.env.get(nome);
  if (valor) return valor;
  throw new Error(`Variável de ambiente obrigatória ausente: ${nome}`);
}

const env = { url: envObrigatorio("SUPABASE_URL"), chave: envObrigatorio("SUPABASE_SERVICE_ROLE_KEY") };
// deno-lint-ignore no-explicit-any
const emSegundoPlano = (p: Promise<unknown>) => (globalThis as any).EdgeRuntime?.waitUntil(p) ?? p;

Deno.serve((req) => tratar(req, env, { emSegundoPlano, ia: () => import("./ia.js") }));
