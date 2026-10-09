/* ============================================================
   ÓRBITA — midia.js (nx-midia, ESPEC §6.4) + Storage do bucket privado nx-midia
   Caminho: <cliente_id>/<in|out>/<AAAA-MM>/<uuid>.<ext>. Só a service_role
   (Edge Functions) lê e grava; o navegador recebe URL ASSINADA (1 h para ler,
   upload assinado para subir). Todo path recebido do painel precisa começar
   com "<cliente>/" — senão 404 midia_nao_encontrada, nada é assinado.
   ============================================================ */
import { criarDb } from "./db.js";
import {
  agoraDe, limparErro, ErroApi, respostaPainel, tratarPainel, lerCorpoPainel, autenticarPainel, interna,
} from "./comum.js";

// nome e legenda do arquivo são validados já no upload (antes só o enviar cortava): nome até 200 caracteres sem controle,
// legenda até 1024 — o que não cabe é recusado, não truncado em silêncio
const NOME_MAX = 200, LEGENDA_MAX = 1024;
const CONTROLE = /[\u0000-\u001f\u007f]/;

export const BUCKET = "nx-midia";
const MB = 1024 * 1024;

// tipos aceitos pelo WhatsApp (Cloud API) e o teto de cada grupo (+ WAV, só no canal CodeWords: ver abaixo)
const IMAGENS = { "image/jpeg": "jpg", "image/png": "png", "image/webp": "webp" };
const AV = { "video/mp4": "mp4", "video/3gpp": "3gp", "audio/aac": "aac", "audio/mp4": "m4a", "audio/mpeg": "mp3", "audio/amr": "amr", "audio/ogg": "ogg" };
const DOCS = {
  "application/pdf": "pdf", "application/msword": "doc", "application/vnd.ms-excel": "xls",
  "application/vnd.ms-powerpoint": "ppt", "text/plain": "txt",
  "application/vnd.openxmlformats-officedocument.wordprocessingml.document": "docx",
  "application/vnd.openxmlformats-officedocument.spreadsheetml.sheet": "xlsx",
  "application/vnd.openxmlformats-officedocument.presentationml.presentation": "pptx",
};
const EXT_EXTRA = { "image/gif": "gif", "video/quicktime": "mov", "audio/opus": "opus", "application/zip": "zip" };
// WAV não é do WhatsApp oficial: só o aparelho do CodeWords envia (o áudio gravado na tela vira WAV 16 kHz mono e
// chega como mensagem de voz). A Graph da Meta recusa: quem envia confere soAparelho() antes.
const WAV = "audio/wav";

/** Mime sem parâmetros, em minúsculas e com o apelido resolvido (audio/x-wav → audio/wav). */
export function mimeBase(mime) {
  const m = String(mime ?? "").split(";")[0].trim().toLowerCase();
  return m === "audio/x-wav" ? WAV : m;
}

/** Tipo que SÓ o aparelho do CodeWords envia (a Graph da Meta não aceita)? */
export const soAparelho = mime => mimeBase(mime) === WAV;

/** Tipo aceito para ENVIO? → {ext, max, grupo} ou null. */
export function tipoAceito(mime) {
  const m = mimeBase(mime);
  if (IMAGENS[m]) return { ext: IMAGENS[m], max: 5 * MB, grupo: "image" };
  if (m === WAV) return { ext: "wav", max: 16 * MB, grupo: "audio" };
  if (AV[m]) return { ext: AV[m], max: 16 * MB, grupo: m.startsWith("video/") ? "video" : "audio" };
  if (DOCS[m]) return { ext: DOCS[m], max: 16 * MB, grupo: "document" };
  if (/^application\/vnd\.openxmlformats-officedocument\.[\w.-]+$/.test(m)) return { ext: "bin", max: 16 * MB, grupo: "document" };
  return null;
}

/** Extensão para gravar (recebida pode ter qualquer tipo): mime conhecido → ext; senão a do nome; senão bin. */
export function extensaoDe(mime, nome) {
  const m = mimeBase(mime);
  const conhecido = IMAGENS[m] || AV[m] || DOCS[m] || EXT_EXTRA[m] || (m === WAV ? "wav" : null);
  if (conhecido) return conhecido;
  const doNome = String(nome ?? "").match(/\.([a-z0-9]{1,8})$/i);
  return doNome ? doNome[1].toLowerCase() : "bin";
}

/** Tipo da Graph (image|video|audio|document) de um mime já aceito; null = a Graph não envia (WAV é só do aparelho). */
export const tipoGraph = mime => (soAparelho(mime) ? null : tipoAceito(mime)?.grupo || "document");

/** <cliente>/<in|out>/<AAAA-MM>/<uuid>.<ext> (mês em São Paulo). */
export function caminhoMidia(cliente, sentido, quando, ext) {
  const sp = new Date(new Date(quando).getTime() - 3 * 3600e3);   // SP sem horário de verão (desde 2019)
  const mes = sp.toISOString().slice(0, 7);
  return `${cliente}/${sentido}/${mes}/${crypto.randomUUID()}.${ext || "bin"}`;
}

/** O path é deste cliente (e não tenta sair da pasta)? */
export function pathDoCliente(path, cliente, sentido) {
  const p = String(path ?? "");
  if (!p || p.length > 300 || p.includes("..") || p.includes("\\") || p.startsWith("/")) return false;
  if (!/^[\w./-]+$/.test(p)) return false;
  return p.startsWith(`${cliente}/${sentido ? `${sentido}/` : ""}`);
}

/** Storage do Supabase com a chave da service_role (sem SDK). */
export function criarStorage({ url, chave } = {}, f = globalThis.fetch) {
  const base = `${String(url ?? "").replace(/\/+$/, "")}/storage/v1`;
  const cab = { apikey: chave };
  if (!String(chave ?? "").startsWith("sb_")) cab.Authorization = `Bearer ${chave}`;
  const codificar = p => String(p).split("/").map(encodeURIComponent).join("/");

  async function pedir(metodo, caminho, { corpo, cabecalhos = {}, cru = false } = {}) {
    let r;
    try {
      r = await f(`${base}/${caminho}`, {
        method: metodo,
        headers: { ...cab, ...(cru ? {} : corpo !== undefined ? { "Content-Type": "application/json" } : {}), ...cabecalhos },
        body: corpo === undefined ? undefined : cru ? corpo : JSON.stringify(corpo),
      });
    } catch (e) { return { ok: false, status: 0, erro: limparErro(e?.message || e) }; }
    const txt = await r.text();
    let dados = null;
    try { dados = txt ? JSON.parse(txt) : null; } catch { dados = txt; }
    if (!r.ok) {
      const m = dados && typeof dados === "object" ? (dados.message || dados.error || dados.statusCode) : dados;
      return { ok: false, status: r.status, erro: limparErro(`HTTP ${r.status}${m ? `: ${m}` : ""}`), dados };
    }
    return { ok: true, status: r.status, dados };
  }

  return {
    base,
    /** Grava bytes (x-upsert). */
    subir: (path, bytes, mime) => pedir("POST", `object/${BUCKET}/${codificar(path)}`,
      { corpo: bytes, cru: true, cabecalhos: { "Content-Type": mime || "application/octet-stream", "x-upsert": "true" } }),
    /** URL de upload assinada (o navegador faz PUT nela). */
    async assinarUpload(path) {
      const r = await pedir("POST", `object/upload/sign/${BUCKET}/${codificar(path)}`, { corpo: {} });
      if (!r.ok || !r.dados?.url) return { ok: false, erro: r.erro || "sem url" };
      return { ok: true, url: `${base}${r.dados.url.startsWith("/") ? "" : "/"}${r.dados.url}` };
    },
    /** URLs assinadas de leitura: {path: url completa}. */
    async assinar(paths, expiresIn = 3600) {
      const r = await pedir("POST", `object/sign/${BUCKET}`, { corpo: { expiresIn, paths } });
      if (!r.ok) return { ok: false, erro: r.erro };
      const urls = {};
      for (const x of Array.isArray(r.dados) ? r.dados : []) {
        if (x?.signedURL && !x.error) urls[x.path] = `${base}${x.signedURL.startsWith("/") ? "" : "/"}${x.signedURL}`;
      }
      return { ok: true, urls };
    },
    apagar: prefixes => pedir("DELETE", `object/${BUCKET}`, { corpo: { prefixes } }),
    /** Uma "pasta" (um nível): [{name, id|null (null = subpasta)}]. */
    listar: (prefixo, { limit = 1000, offset = 0 } = {}) =>
      pedir("POST", `object/list/${BUCKET}`, { corpo: { prefix: prefixo, limit, offset, sortBy: { column: "name", order: "asc" } } }),
  };
}

/** Todos os arquivos de uma pasta (recursivo, até `max`). */
export async function arquivosDaPasta(st, pasta, max = 1000) {
  const out = [], fila = [pasta.replace(/\/+$/, "")];
  while (fila.length && out.length < max) {
    const p = fila.shift();
    for (let offset = 0; out.length < max; offset += 1000) {
      const r = await st.listar(p, { limit: 1000, offset });
      if (!r.ok) throw new Error(`Storage (listar ${p}): ${r.erro}`);
      const itens = Array.isArray(r.dados) ? r.dados : [];
      for (const it of itens) {
        if (!it?.name) continue;
        if (it.id == null) fila.push(`${p}/${it.name}`);
        else if (out.length < max) out.push(`${p}/${it.name}`);
      }
      if (itens.length < 1000) break;
    }
  }
  return { arquivos: out, completo: !fila.length && out.length < max };
}

/* ------------------------------------------------------------
   Handler da nx-midia
   ------------------------------------------------------------ */
const PAPEL = { subir: "atendente", subir_direto: "atendente", ver: "leitura", apagar: "admin" };

/** @param {{fetch?: Function, agora?: Date|Function, emSegundoPlano?: (p: Promise<unknown>) => void,
 *           drenagem?: {prazoMs?: number, teto?: number}}} [deps] */
export async function tratar(req, env, deps = {}) {
  const f = deps.fetch || globalThis.fetch;
  return tratarPainel(req, async () => {
    const corpo = await lerCorpoPainel(req, 8 * MB, deps.drenagem);
    const acao = String(corpo.acao ?? "");
    // só as chaves próprias ("constructor", "__proto__"… não são ações)
    if (!Object.hasOwn(PAPEL, acao)) throw new ErroApi("dados_invalidos", 400, "acao");
    const db = criarDb(env, f);
    await autenticarPainel(db, corpo, PAPEL[acao]);
    const cliente = String(corpo.cliente);
    await interna(db, "nx_exigir_modulo", { p_cliente: cliente, p_modulo: "conversas" });
    const st = criarStorage(env, f);

    if (acao === "subir" || acao === "subir_direto") {
      const tipo = tipoAceito(corpo.mime);
      if (!tipo) throw new ErroApi("midia_tipo", 400);
      if (corpo.nome != null && (typeof corpo.nome !== "string" || corpo.nome.length > NOME_MAX || CONTROLE.test(corpo.nome))) throw new ErroApi("dados_invalidos", 400, "nome");
      if (corpo.legenda != null && (typeof corpo.legenda !== "string" || corpo.legenda.length > LEGENDA_MAX)) throw new ErroApi("dados_invalidos", 400, "legenda");
      let bytes = null, tamanho = Number(corpo.tamanho);
      if (acao === "subir_direto") {
        const b64 = String(corpo.base64 ?? "").replace(/^data:[^,]*,/, "");
        if (!b64 || !/^[A-Za-z0-9+/=\s]+$/.test(b64)) throw new ErroApi("dados_invalidos", 400);
        // base64 malformado ("a", "ab==x"): atob lança — é dado inválido (400), não erro interno (500)
        let bin;
        try { bin = atob(b64.replace(/\s+/g, "")); } catch { throw new ErroApi("dados_invalidos", 400, "base64"); }
        bytes = Uint8Array.from(bin, c => c.charCodeAt(0));
        tamanho = bytes.length;
        if (tamanho > 5 * MB) throw new ErroApi("midia_grande", 400);
      }
      if (!Number.isFinite(tamanho) || tamanho <= 0) throw new ErroApi("dados_invalidos", 400);
      if (tamanho > tipo.max) throw new ErroApi("midia_grande", 400);
      const path = caminhoMidia(cliente, "out", agoraDe(deps), tipo.ext === "bin" ? extensaoDe(corpo.mime, corpo.nome) : tipo.ext);
      if (bytes) {
        const up = await st.subir(path, bytes, mimeBase(corpo.mime));   // Content-Type normalizado (nunca 'IMAGE/PNG')
        if (!up.ok) throw new ErroApi("erro_interno", 502, `Storage: ${up.erro}`);
        return respostaPainel({ ok: true, path });
      }
      const r = await st.assinarUpload(path);
      if (!r.ok) throw new ErroApi("erro_interno", 502, `Storage: ${r.erro}`);
      return respostaPainel({ ok: true, path, upload_url: r.url });
    }

    const paths = Array.isArray(corpo.paths) ? corpo.paths.map(String) : [];
    if (!paths.length || paths.length > 50) throw new ErroApi("dados_invalidos", 400);
    // QUALQUER path fora da pasta do cliente → 404 e nada é assinado/apagado
    if (!paths.every(p => pathDoCliente(p, cliente))) throw new ErroApi("midia_nao_encontrada", 404);

    if (acao === "ver") {
      const r = await st.assinar([...new Set(paths)], 3600);
      if (!r.ok) throw new ErroApi("erro_interno", 502, `Storage: ${r.erro}`);
      return respostaPainel({ ok: true, urls: r.urls });
    }
    // apagar (uso manual; a exclusão de contato usa a fila nx_midia_lixo)
    const r = await st.apagar(paths);
    if (!r.ok) throw new ErroApi("erro_interno", 502, `Storage: ${r.erro}`);
    return respostaPainel({ ok: true });
  }, deps.drenagem);
}
