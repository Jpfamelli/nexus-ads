/* ============================================================
   ÓRBITA — midia.js (nx-midia, ESPEC §6.4) + Storage do bucket privado nx-midia
   Caminho: <cliente_id>/<in|out>/<AAAA-MM>/<uuid>.<ext>. Só a service_role
   (Edge Functions) lê e grava; o navegador recebe URL ASSINADA (1 h para ler,
   upload assinado para subir). Todo path recebido do painel precisa começar
   com "<cliente>/" — senão 404 midia_nao_encontrada, nada é assinado.
   ============================================================ */
import { criarDb } from "./db.js";
import {
  agoraDe, limparErro, ErroApi, respostaPainel, tratarPainel, lerCorpoPainel, autenticarPainel, interna, comPrazo, funcaoAusente, auditar,
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

/* Plano 1000 (SV-219): assinatura dos primeiros bytes por tipo. O mime vem do navegador; um .exe/.zip renomeado para
   image/jpeg ia ao aparelho como foto. Tipo sem assinatura conhecida (text/plain) passa. */
const comeca = (b, ...x) => x.every((v, i) => v == null || b[i] === v);
const ascii = (b, ini, t) => [...t].every((c, i) => b[ini + i] === c.charCodeAt(0));
const OLE = [0xd0, 0xcf, 0x11, 0xe0, 0xa1, 0xb1, 0x1a, 0xe1];
const ZIP = b => ascii(b, 0, "PK") && b[2] === 3 && b[3] === 4;
const MP4 = b => ascii(b, 4, "ftyp");
const ASSINATURAS = {
  "image/jpeg": b => comeca(b, 0xff, 0xd8, 0xff),
  "image/png": b => comeca(b, 0x89, 0x50, 0x4e, 0x47, 0x0d, 0x0a, 0x1a, 0x0a),
  "image/webp": b => ascii(b, 0, "RIFF") && ascii(b, 8, "WEBP"),
  "video/mp4": MP4, "audio/mp4": MP4, "video/3gpp": MP4,
  "audio/ogg": b => ascii(b, 0, "OggS"),
  "audio/wav": b => ascii(b, 0, "RIFF") && ascii(b, 8, "WAVE"),
  "audio/mpeg": b => ascii(b, 0, "ID3") || (b[0] === 0xff && (b[1] & 0xe0) === 0xe0),
  "audio/aac": b => ascii(b, 0, "ADIF") || (b[0] === 0xff && (b[1] & 0xf6) === 0xf0),
  "audio/amr": b => ascii(b, 0, "#!AMR"),
  "application/pdf": b => ascii(b, 0, "%PDF"),
  "application/msword": b => comeca(b, ...OLE), "application/vnd.ms-excel": b => comeca(b, ...OLE),
  "application/vnd.ms-powerpoint": b => comeca(b, ...OLE),
};

/** Os bytes batem com o tipo declarado? Tipo sem assinatura conhecida → true; office moderno (openxmlformats) = ZIP. */
export function confereAssinatura(bytes, mime) {
  const b = bytes instanceof Uint8Array ? bytes : new Uint8Array(bytes || []);
  const m = mimeBase(mime);
  if (/^application\/vnd\.openxmlformats-officedocument\./.test(m)) return ZIP(b);
  const f = ASSINATURAS[m];
  return f ? b.length >= 4 && f(b) : true;
}

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

export const PRAZO_STORAGE_MS = 20_000;
export const PRAZO_STORAGE_SUBIR_MS = 60_000;

/** Storage do Supabase com a chave da service_role (sem SDK). Plano 1000 (SV-055): toda chamada tem prazo (20 s; 60 s para
    subir arquivo) — um Storage lento segurava a nx-midia, a nx-enviar e o download de mídia do webhook até o corte de 150 s. */
export function criarStorage({ url, chave } = {}, f = globalThis.fetch, { prazoMs = PRAZO_STORAGE_MS, prazoSubirMs = PRAZO_STORAGE_SUBIR_MS } = {}) {
  const base = `${String(url ?? "").replace(/\/+$/, "")}/storage/v1`;
  const cab = { apikey: chave };
  if (!String(chave ?? "").startsWith("sb_")) cab.Authorization = `Bearer ${chave}`;
  const codificar = p => String(p).split("/").map(encodeURIComponent).join("/");

  async function pedir(metodo, caminho, { corpo, cabecalhos = {}, cru = false, ms = prazoMs } = {}) {
    let r, txt;
    try {
      r = await comPrazo(f, ms)(`${base}/${caminho}`, {
        method: metodo,
        headers: { ...cab, ...(cru ? {} : corpo !== undefined ? { "Content-Type": "application/json" } : {}), ...cabecalhos },
        body: corpo === undefined ? undefined : cru ? corpo : JSON.stringify(corpo),
      });
      txt = await r.text();
    } catch (e) { return { ok: false, status: 0, erro: limparErro(e?.message || e) }; }
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
      { corpo: bytes, cru: true, ms: prazoSubirMs, cabecalhos: { "Content-Type": mime || "application/octet-stream", "x-upsert": "true" } }),
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

/** Paths que a conta enxerga (nx_midia_visiveis, migração 20261013b). Banco sem a RPC → todos (comportamento anterior). */
async function pathsVisiveis(db, ctx, cliente, paths) {
  try {
    const r = await db.rpc("nx_midia_visiveis", { p_ctx: ctx, p_cliente: cliente, p_paths: paths });
    const ok = new Set(Array.isArray(r) ? r.map(String) : []);
    return paths.filter(p => ok.has(p));
  } catch (e) {
    if (funcaoAusente(e, "nx_midia_visiveis")) return paths;
    throw e;
  }
}

/** Plano 1000 (SV-220): validade da URL assinada de LEITURA pedida pelo painel. */
export const PRAZO_VER_S = 600;
/** Plano 1000 (SV-060): uploads por conta numa janela (nx_taxa_usar da 20261013a). */
export const UPLOADS_POR_JANELA = 60;
export const JANELA_UPLOAD_S = 600;
async function limiteUpload(db, ctx) {
  let r;
  try { r = await db.rpc("nx_taxa_usar", { p_chave: `midia:${ctx.conta_id}`, p_limite: UPLOADS_POR_JANELA, p_janela_s: JANELA_UPLOAD_S }); }
  catch (e) { if (funcaoAusente(e, "nx_taxa_usar")) return; throw e; }
  if (r && r.ok === false) throw new ErroApi("limite_taxa", 429);
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
    const ctx = await autenticarPainel(db, corpo, PAPEL[acao]);
    const cliente = String(corpo.cliente);
    await interna(db, "nx_exigir_modulo", { p_cliente: cliente, p_modulo: "conversas" });
    const st = criarStorage(env, f);

    if (acao === "subir" || acao === "subir_direto") {
      // plano 1000 (SV-060): teto de uploads por conta (60 em 10 min) — um script com um token válido enchia o bucket
      await limiteUpload(db, ctx);
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
      // plano 1000 (SV-058): só assina o que esta conta VÊ (mídia de conversa visível — departamento, atribuição — ou upload
      // próprio ainda sem mensagem); o resto fica fora de urls, como um path que não existe
      const visiveis = await pathsVisiveis(db, ctx, cliente, [...new Set(paths)]);
      if (!visiveis.length) return respostaPainel({ ok: true, urls: {} });
      // plano 1000 (SV-220): o link de leitura vale 10 min (o painel reassina ao abrir de novo); 1 h só no envio (a Graph busca)
      // plano 1000b · CB-035: {download: true, nome?} → URL com download= (o Storage manda Content-Disposition: attachment) — o
      // «Baixar» e os documentos de tipo incomum não abrem inline no navegador
      const baixar = corpo.download === true;
      if (baixar && corpo.nome != null && (typeof corpo.nome !== "string" || corpo.nome.length > NOME_MAX || CONTROLE.test(corpo.nome))) throw new ErroApi("dados_invalidos", 400, "nome");
      const r = await st.assinar(visiveis, PRAZO_VER_S);
      if (!r.ok) throw new ErroApi("erro_interno", 502, `Storage: ${r.erro}`);
      if (!baixar) return respostaPainel({ ok: true, urls: r.urls });
      const comDownload = u => `${u}${u.includes("?") ? "&" : "?"}download=${encodeURIComponent(corpo.nome ? String(corpo.nome).trim() : "")}`;
      return respostaPainel({ ok: true, urls: Object.fromEntries(Object.entries(r.urls).map(([p, u]) => [p, comDownload(u)])) });
    }
    // apagar (uso manual; a exclusão de contato usa a fila nx_midia_lixo)
    const r = await st.apagar(paths);
    if (!r.ok) throw new ErroApi("erro_interno", 502, `Storage: ${r.erro}`);
    // plano 1000 (SV-057): as mensagens do cliente com esses arquivos ficam «apagada» (sem path) — a bolha não tenta abrir um
    // arquivo que não existe mais (404). Banco sem a RPC → como antes.
    let mensagens = null;
    try { mensagens = await db.rpc("nx_midia_apagada", { p_cliente: cliente, p_paths: [...new Set(paths)] }); }
    catch (e) { if (!funcaoAusente(e, "nx_midia_apagada")) throw e; }
    await auditar(db, ctx, cliente, "midia_apagada", { arquivos: paths.length });
    return respostaPainel({ ok: true, ...(Number.isFinite(Number(mensagens)) && mensagens != null ? { mensagens: Number(mensagens) } : {}) });
  }, deps.drenagem);
}
