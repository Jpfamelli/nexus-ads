#!/usr/bin/env node
/* ============================================================
   NEXUS ADS — gera o refresh token do Google Ads (faz-se uma vez).

   Uso (na pasta nexus-ads):
     node scripts/google-refresh-token.mjs
     node scripts/google-refresh-token.mjs <client_id> <client_secret>
     node scripts/google-refresh-token.mjs --client-id=... --client-secret=... [--nao-abrir]

   O que acontece: sobe um servidorzinho só no seu computador
   (127.0.0.1), abre a tela de permissão do Google, recebe o código
   de volta e troca por um refresh token. Nada é salvo em disco — o
   token só aparece no terminal. Node 18+ sem dependências.
   ============================================================ */
import http from "node:http";
import { randomBytes, createHash } from "node:crypto";
import { spawn } from "node:child_process";
import { createInterface } from "node:readline/promises";
import { fileURLToPath } from "node:url";
import { resolve } from "node:path";

export const ESCOPO = "https://www.googleapis.com/auth/adwords";
export const URL_AUTORIZACAO = "https://accounts.google.com/o/oauth2/v2/auth";
export const URL_TOKEN = "https://oauth2.googleapis.com/token";
const PRAZO_MS = 5 * 60 * 1000;

/** Erro já explicado em português — o terminal mostra só a mensagem, sem pilha. */
export class ErroAmigavel extends Error {}

const b64url = buf => buf.toString("base64url");
const limpar = s => String(s ?? "").trim().replace(/^["']|["']$/g, "").trim();

/* ---------- mensagens de erro do Google, traduzidas em "o que fazer" ---------- */
export function explicarErroToken(codigo, descricao = "") {
  const det = descricao ? ` (Google: ${descricao})` : "";
  switch (codigo) {
    case "invalid_client":
      return `O Client ID ou o Client secret não conferem${det}.\n` +
        "Copie os dois de novo em Google Cloud → APIs e serviços → Credenciais (sem espaços antes ou depois).";
    case "invalid_grant":
      return `O código de autorização expirou ou já foi usado${det}.\n` +
        "Rode o script de novo e conclua a autorização logo em seguida.";
    case "redirect_uri_mismatch":
    case "unauthorized_client":
      return `O Google recusou o endereço de retorno${det}.\n` +
        "Isso acontece quando o cliente OAuth não é do tipo \"App para computador\". Crie um cliente novo com esse tipo e use o Client ID dele.";
    default:
      return `O Google recusou a troca do código pelo token: ${codigo || "erro desconhecido"}${det}.`;
  }
}

export function explicarErroAutorizacao(codigo, descricao = "") {
  const det = descricao ? ` (Google: ${descricao})` : "";
  if (codigo === "access_denied") {
    return `A autorização não foi concedida${det}.\n` +
      "Se você clicou em \"Cancelar\", é só rodar de novo e clicar em \"Continuar\"/\"Permitir\".\n" +
      "Se apareceu \"acesso bloqueado\", abra Google Cloud → Tela de consentimento OAuth (Google Auth Platform) e\n" +
      "publique o app (Em produção) ou adicione o seu e-mail em \"Usuários de teste\".";
  }
  return `O Google devolveu um erro na autorização: ${codigo}${det}.`;
}

/* ---------- argumentos ---------- */
export function lerArgumentos(args) {
  const o = { abrir: true, ajuda: false };
  const soltos = [];
  for (let k = 0; k < args.length; k++) {
    const a = args[k];
    if (a === "--nao-abrir" || a === "--no-browser") o.abrir = false;
    else if (a === "-h" || a === "--ajuda" || a === "--help") o.ajuda = true;
    else if (a.startsWith("--client-id=")) o.clientId = limpar(a.slice("--client-id=".length));
    else if (a.startsWith("--client-secret=")) o.clientSecret = limpar(a.slice("--client-secret=".length));
    else if (a === "--client-id" || a === "--client-secret") {
      const v = args[++k];
      if (v == null || v.startsWith("--")) throw new ErroAmigavel(`Falta o valor depois de ${a}.`);
      o[a === "--client-id" ? "clientId" : "clientSecret"] = limpar(v);
    }
    else if (a.startsWith("--")) throw new ErroAmigavel(`Opção desconhecida: ${a}. Use --ajuda para ver as opções.`);
    else soltos.push(limpar(a));
  }
  if (!o.clientId && soltos[0]) o.clientId = soltos[0];
  if (!o.clientSecret && soltos[1]) o.clientSecret = soltos[1];
  return o;
}

export const AJUDA = `
Gera o refresh token do Google Ads para colar no Nexus Ads (Ajustes → Google).

  node scripts/google-refresh-token.mjs
  node scripts/google-refresh-token.mjs <client_id> <client_secret>
  node scripts/google-refresh-token.mjs --client-id=... --client-secret=... [--nao-abrir]

  --nao-abrir   não abre o navegador sozinho; só mostra o link para você copiar
  --ajuda       mostra esta mensagem

Prefira a primeira forma e cole o Client ID e o Client secret quando o script
pedir: o que vai na linha do comando fica salvo no histórico do terminal.

Antes: crie no Google Cloud um cliente OAuth do tipo "App para computador" e
habilite a Google Ads API no mesmo projeto. Faça login com a conta Google que
tem acesso à conta de gerente (MCC) da Nexus.
`;

/* ---------- navegador ---------- */
export function abrirNoNavegador(url) {
  // rundll32 no Windows: "start" do cmd corta a URL no primeiro "&"
  const [cmd, args] = process.platform === "win32" ? ["rundll32", ["url.dll,FileProtocolHandler", url]]
    : process.platform === "darwin" ? ["open", [url]] : ["xdg-open", [url]];
  const p = spawn(cmd, args, { detached: true, stdio: "ignore" });
  p.on("error", () => {});   // sem navegador: o link já foi impresso no terminal
  p.unref();
}

/* ---------- servidor local que recebe o código ---------- */
function subirServidor() {
  return new Promise((ok, falha) => {
    const servidor = http.createServer();
    servidor.once("error", e => falha(new ErroAmigavel(`Não consegui abrir uma porta local para receber a resposta do Google: ${e.message}`)));
    servidor.listen(0, "127.0.0.1", () => ok({ servidor, porta: servidor.address().port }));
  });
}

const pagina = (titulo, texto) => `<!doctype html><html lang="pt-BR"><meta charset="utf-8"><title>${titulo}</title>
<body style="font:16px/1.5 system-ui,sans-serif;background:#F5E9D6;color:#0B1B2B;display:grid;place-items:center;min-height:100vh;margin:0">
<div style="max-width:460px;padding:32px;background:#fff;border-radius:16px;box-shadow:0 8px 30px #0B1B2B22">
<h1 style="font-size:22px;margin:0 0 8px">${titulo}</h1><p style="margin:0">${texto}</p></div></body></html>`;

function responder(res, status, titulo, texto) {
  res.writeHead(status, { "Content-Type": "text/html; charset=utf-8", "Connection": "close" });
  res.end(pagina(titulo, texto));
}

/** Espera o Google redirecionar o navegador para cá. Só aceita a resposta com o "state" certo. */
function esperarCodigo(servidor, estado, prazoMs) {
  return new Promise((ok, falha) => {
    const relogio = setTimeout(() => falha(new ErroAmigavel(
      `Tempo esgotado: ${Math.round(prazoMs / 60000) || 1} minuto(s) sem resposta do navegador. Rode o script de novo.`)), prazoMs);
    servidor.on("request", (req, res) => {
      const u = new URL(req.url, "http://127.0.0.1");
      const code = u.searchParams.get("code"), erro = u.searchParams.get("error");
      if (!code && !erro) { res.writeHead(404, { Connection: "close" }); res.end(); return; }   // favicon e afins
      if (u.searchParams.get("state") !== estado) {
        responder(res, 400, "Link antigo ou de outra tentativa",
          "Esta resposta não é da tentativa atual. Volte ao terminal e use o link que ele mostrou por último.");
        return;
      }
      clearTimeout(relogio);
      if (erro) {
        responder(res, 200, "Autorização não concedida", "Volte ao terminal para ver o que fazer.");
        falha(new ErroAmigavel(explicarErroAutorizacao(erro, u.searchParams.get("error_description") || "")));
        return;
      }
      ok({ code, res });
    });
  });
}

async function trocarCodigo({ code, clientId, clientSecret, redirectUri, verificador, urlToken }) {
  let r;
  try {
    r = await fetch(urlToken, {
      method: "POST",
      headers: { "Content-Type": "application/x-www-form-urlencoded", Accept: "application/json" },
      body: new URLSearchParams({
        code, client_id: clientId, client_secret: clientSecret, redirect_uri: redirectUri,
        grant_type: "authorization_code", code_verifier: verificador,
      }),
    });
  } catch (e) {
    throw new ErroAmigavel(`Não consegui falar com o Google para trocar o código (sem internet?): ${e.cause?.message || e.message}`);
  }
  const corpo = await r.json().catch(() => ({}));
  if (!r.ok) throw new ErroAmigavel(explicarErroToken(corpo.error, corpo.error_description || (corpo.error ? "" : `HTTP ${r.status}`)));
  return corpo;
}

/**
 * Fluxo completo. Devolve { refresh_token, access_token, scope, ... }.
 * `abrirNavegador`, `urlToken` e `prazoMs` existem para os testes.
 */
export async function obterRefreshToken({
  clientId, clientSecret, abrir = true, log = console.log,
  abrirNavegador = abrirNoNavegador, urlToken = URL_TOKEN, prazoMs = PRAZO_MS,
}) {
  clientId = limpar(clientId); clientSecret = limpar(clientSecret);
  if (!clientId) throw new ErroAmigavel("Falta o Client ID (Google Cloud → Credenciais → seu cliente OAuth).");
  if (!clientSecret) throw new ErroAmigavel("Falta o Client secret (Google Cloud → Credenciais → seu cliente OAuth).");
  if (!clientId.endsWith(".apps.googleusercontent.com")) {
    log("Aviso: o Client ID costuma terminar em \".apps.googleusercontent.com\". Confira se não colou o campo errado.\n");
  }

  // PKCE + state: o código só serve para quem começou o fluxo, e só esta tentativa é aceita
  const verificador = b64url(randomBytes(32));
  const desafio = b64url(createHash("sha256").update(verificador).digest());
  const estado = b64url(randomBytes(16));

  const { servidor, porta } = await subirServidor();
  const redirectUri = `http://127.0.0.1:${porta}`;
  const url = `${URL_AUTORIZACAO}?${new URLSearchParams({
    client_id: clientId, redirect_uri: redirectUri, response_type: "code", scope: ESCOPO,
    access_type: "offline", prompt: "consent", state: estado,
    code_challenge: desafio, code_challenge_method: "S256",
  })}`;

  try {
    log("1. Abra este link no navegador (se ele não abrir sozinho):\n");
    log(url + "\n");
    log("2. Entre com a conta Google que tem acesso à conta de gerente (MCC) da Nexus e clique em Permitir.");
    log("   Se aparecer \"O Google não verificou este app\", clique em Avançado → Acessar (é o seu próprio app).");
    log(`3. Aguardando a resposta do Google em ${redirectUri} (até ${Math.round(prazoMs / 60000) || 1} min)...\n`);
    if (abrir) { try { abrirNavegador(url); } catch { /* o link já está no terminal */ } }

    const { code, res } = await esperarCodigo(servidor, estado, prazoMs);
    let tokens;
    try {
      tokens = await trocarCodigo({ code, clientId, clientSecret, redirectUri, verificador, urlToken });
    } catch (e) {
      responder(res, 200, "Não deu certo", "O Google recusou a troca do código. Volte ao terminal para ver o motivo.");
      throw e;
    }
    if (!tokens.refresh_token) {
      responder(res, 200, "Faltou o refresh token", "Volte ao terminal para ver o que fazer.");
      throw new ErroAmigavel(
        "O Google autorizou, mas não mandou o refresh token.\n" +
        "Remova o acesso do app em https://myaccount.google.com/permissions e rode o script de novo.");
    }
    responder(res, 200, "Pronto!", "O refresh token apareceu no terminal. Pode fechar esta aba.");
    return tokens;
  } finally {
    servidor.close();
    servidor.closeAllConnections?.();
  }
}

/* ---------- linha de comando ---------- */
async function principal() {
  let o;
  try { o = lerArgumentos(process.argv.slice(2)); }
  catch (e) { console.error(`\n[erro] ${e.message}`); process.exitCode = 1; return; }
  if (o.ajuda) { console.log(AJUDA); return; }

  console.log("\nNexus Ads · refresh token do Google Ads\n");
  if (!o.clientId || !o.clientSecret) {
    // iterador em vez de rl.question: com entrada colada/encaminhada, question() perde a 2ª linha
    const rl = createInterface({ input: process.stdin, crlfDelay: Infinity });
    const linhas = rl[Symbol.asyncIterator]();
    const perguntar = async q => { process.stdout.write(q); const { value, done } = await linhas.next(); return done ? "" : limpar(value); };
    try {
      if (!o.clientId) o.clientId = await perguntar("Cole o Client ID e aperte Enter: ");
      if (!o.clientSecret) o.clientSecret = await perguntar("Cole o Client secret e aperte Enter: ");
    } finally { rl.close(); }
    console.log("");
  }

  try {
    const t = await obterRefreshToken(o);
    console.log("[ok] Autorizado. Este é o seu refresh token:\n");
    console.log(`   ${t.refresh_token}\n`);
    console.log("Agora:");
    console.log("  1. Copie a linha acima inteira (começa com \"1//\").");
    console.log("  2. No Nexus Ads, abra Ajustes → Google e cole no campo \"Refresh token\".");
    console.log("  3. Preencha também Client ID e Client secret com os MESMOS valores usados aqui.");
    console.log("  4. Salve e clique em \"Atualizar dados agora\".\n");
    console.log("Guarde esse token como uma senha. Ele não foi salvo em nenhum arquivo:");
    console.log("se fechar o terminal sem copiar, é só rodar o script de novo.");
    if (t.scope && !String(t.scope).includes(ESCOPO)) {
      console.log(`\nAviso: a permissão concedida (${t.scope}) não inclui o Google Ads. Rode de novo e marque a caixa do Google Ads.`);
    }
  } catch (e) {
    console.error(`\n[erro] ${e instanceof ErroAmigavel ? e.message : `Erro inesperado: ${e.stack || e}`}`);
    process.exitCode = 1;
  }
}

const chamadoDireto = process.argv[1] && resolve(process.argv[1]).toLowerCase() === fileURLToPath(import.meta.url).toLowerCase();
if (chamadoDireto) principal();
