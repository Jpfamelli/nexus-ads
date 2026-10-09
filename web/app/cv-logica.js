/* ============================================================
   ÓRBITA — cv-logica.js (PURO, sem imports) · frente F5 · ESPEC §7.7 T4
   Regras da tela de Conversas que não dependem de DOM nem de rede:
   janela de 24 h, abas, variáveis das respostas rápidas, agrupamento
   por dia (fuso de São Paulo), resumo e status de mensagem (nunca
   azul), filtro das respostas com "/", mescla do delta (cursor duplo),
   validação de anexo (regras da nx-midia), modelos com {{n}}.
   Os testes Node importam este arquivo direto do disco.
   ============================================================ */

export const FUSO = "America/Sao_Paulo";
export const JANELA_MS = 24 * 3600 * 1000;

const ms = v => {
  if (v === null || v === undefined || v === "") return NaN;
  if (v instanceof Date) return v.getTime();
  if (typeof v === "number") return v;
  return Date.parse(v);
};

/* ------------------------------------------------------------ janela de 24 h */
/** janela(conversa, agora) → {aberta, ate, restanteMs, texto, nivel:'aberta'|'acabando'|'fechada'}.
    Usa janela_ate do servidor; senão ultima_entrada_em + 24 h. */
export function janela(conversa, agora = new Date()) {
  const c = conversa || {};
  let ate = ms(c.janela_ate);
  if (!Number.isFinite(ate)) {
    const ent = ms(c.ultima_entrada_em);
    ate = Number.isFinite(ent) ? ent + JANELA_MS : NaN;
  }
  const fechada = { aberta: false, ate: Number.isFinite(ate) ? new Date(ate).toISOString() : null, restanteMs: 0,
    texto: "Janela fechada — só modelos", nivel: "fechada" };
  if (!Number.isFinite(ate)) return fechada;
  const rest = ate - ms(agora);
  if (!(rest > 0)) return fechada;
  const h = Math.floor(rest / 3600000);
  const m = Math.max(1, Math.floor((rest % 3600000) / 60000));
  const texto = h >= 1 ? `Janela aberta · ${h} h ${h === 1 ? "restante" : "restantes"}`
    : `Janela aberta · ${m} min ${m === 1 ? "restante" : "restantes"}`;
  return { aberta: true, ate: new Date(ate).toISOString(), restanteMs: rest, texto, nivel: rest < 2 * 3600000 ? "acabando" : "aberta" };
}

/**
 * O canal tem a janela de 24 h? Só a API oficial da Meta. O aparelho do CodeWords é um WhatsApp comum: não há janela, e o servidor
 * (enviar.js, exigeJanela) deixa texto livre sair a qualquer hora — a tela não pode travar o que o servidor aceita.
 */
export function canalTemJanela(provedor) { return provedor !== "codewords"; }

/* ------------------------------------------------------------ abas */
export const ABAS = Object.freeze([
  { id: "minhas", rotulo: "Minhas", vazio: "Nenhuma conversa com você agora." },
  { id: "sem_dono", rotulo: "Sem dono", vazio: "Ninguém esperando por um responsável." },
  { id: "aguardando", rotulo: "Aguardando", vazio: "Nenhum cliente esperando resposta." },
  { id: "abertas", rotulo: "Todas abertas", vazio: "Nenhum atendimento aberto agora." },
  { id: "pendentes", rotulo: "Pendentes", vazio: "Nenhum atendimento pendente." },
  { id: "resolvidas", rotulo: "Resolvidas", vazio: "Nada resolvido nos últimos 30 dias." },
  { id: "ocultas", rotulo: "Ocultas", vazio: "Nenhuma conversa oculta.", min: "supervisor" },
]);

/** Abas sempre à vista (1 linha); as demais ficam no "Mais ▾". Quem não escreve não tem "Minhas". */
export const ABAS_FIXAS = Object.freeze(["minhas", "sem_dono", "aguardando"]);
export function abasVisiveis(papel, podeEscrever = true) {
  const todas = ABAS.filter(a => (!a.min || pode(papel, a.min)) && (a.id !== "minhas" || podeEscrever));
  return { fixas: todas.filter(a => ABAS_FIXAS.includes(a.id)), mais: todas.filter(a => !ABAS_FIXAS.includes(a.id)) };
}

/** Mesma regra do nx_cv_listar: a conversa pertence à aba? */
export function pertenceAba(c, aba, euId, agora = new Date()) {
  if (!c) return false;
  if (aba === "ocultas") return !!c.oculta;
  if (c.oculta) return false;
  const aberta = c.status === "aberta" || c.status === "pendente";
  switch (aba) {
    case "minhas": return aberta && !!euId && c.atribuida_a === euId;
    case "sem_dono": return aberta && !c.atribuida_a;
    case "aguardando": return c.status === "aberta" && !!c.aguardando;
    case "abertas": return c.status === "aberta";
    case "pendentes": return c.status === "pendente";
    case "resolvidas": {
      if (c.status !== "resolvida") return false;
      const r = ms(c.resolvida_em);
      return !Number.isFinite(r) || ms(agora) - r <= 30 * 86400000;
    }
    default: return false;
  }
}

/** A aba "natural" da conversa (a mais específica). */
export function abaDe(c, euId) {
  if (!c) return "abertas";
  if (c.oculta) return "ocultas";
  if (c.status === "resolvida") return "resolvidas";
  if (c.status === "pendente") return c.atribuida_a && c.atribuida_a === euId ? "minhas" : "pendentes";
  if (c.atribuida_a && c.atribuida_a === euId) return "minhas";
  if (!c.atribuida_a) return "sem_dono";
  if (c.aguardando) return "aguardando";
  return "abertas";
}

/* ------------------------------------------------------------ nomes e variáveis */
function soDigitos(s) { return String(s ?? "").replace(/\D/g, ""); }

/** "maria souza" → "Maria"; telefone/vazio → "". */
export function primeiroNome(nome) {
  const t = String(nome ?? "").trim();
  if (!t || /^[\d\s()+-]+$/.test(t)) return "";
  const p = t.split(/\s+/)[0];
  return p.charAt(0).toLocaleUpperCase("pt-BR") + p.slice(1);
}

export const VARIAVEIS = Object.freeze(["primeiro_nome", "nome", "atendente", "empresa", "protocolo"]);

/** Troca {primeiro_nome} {nome} {atendente} {empresa} {protocolo}. Variável sem valor some junto com
    a vírgula/espaço antes ("Olá, {primeiro_nome}!" → "Olá!"). Chaves desconhecidas ({dia 1}) ficam. */
export function aplicarVariaveis(texto, vars = {}) {
  const v = {
    primeiro_nome: vars.primeiro_nome ?? primeiroNome(vars.nome),
    nome: vars.nome ?? "",
    atendente: vars.atendente ?? "",
    empresa: vars.empresa ?? "",
    protocolo: vars.protocolo ?? "",
  };
  let s = String(texto ?? "");
  for (const k of VARIAVEIS) {
    const val = String(v[k] ?? "").trim();
    if (val) s = s.split(`{${k}}`).join(val);
    else s = s.replace(new RegExp(`(,\\s*|\\s+)?\\{${k}\\}`, "g"), "");
  }
  return s;
}

/* ------------------------------------------------------------ dias (fuso SP) */
const _fmtDia = new Intl.DateTimeFormat("en-CA", { timeZone: FUSO, year: "numeric", month: "2-digit", day: "2-digit" });
const _fmtLongo = new Intl.DateTimeFormat("pt-BR", { timeZone: FUSO, day: "numeric", month: "long" });
const _fmtLongoAno = new Intl.DateTimeFormat("pt-BR", { timeZone: FUSO, day: "numeric", month: "long", year: "numeric" });
const _fmtSemana = new Intl.DateTimeFormat("pt-BR", { timeZone: FUSO, weekday: "long" });

/** "2026-09-28" (dia no fuso de São Paulo). */
export function diaSP(v) {
  const t = ms(v);
  return Number.isFinite(t) ? _fmtDia.format(new Date(t)) : "";
}

/** Rótulo do separador: Hoje, Ontem, "segunda-feira" (até 6 dias), "28 de setembro", "28 de setembro de 2025". */
export function rotuloDia(dia, agora = new Date()) {
  const hoje = diaSP(agora);
  const dif = Math.round((Date.parse(hoje) - Date.parse(dia)) / 86400000);
  if (dif === 0) return "Hoje";
  if (dif === 1) return "Ontem";
  const d = new Date(`${dia}T12:00:00-03:00`);
  if (dif > 1 && dif < 7) { const s = _fmtSemana.format(d); return s.charAt(0).toUpperCase() + s.slice(1); }
  return (dia.slice(0, 4) === hoje.slice(0, 4) ? _fmtLongo : _fmtLongoAno).format(d);
}

/** agruparPorDia(msgs) → [{dia, rotulo, itens}] em ordem, pelo criado_em no fuso de SP. */
export function agruparPorDia(msgs, agora = new Date()) {
  const grupos = [];
  for (const m of msgs || []) {
    const dia = diaSP(m.criado_em) || diaSP(agora);
    const g = grupos[grupos.length - 1];
    if (g && g.dia === dia) g.itens.push(m);
    else grupos.push({ dia, rotulo: rotuloDia(dia, agora), itens: [m] });
  }
  return grupos;
}

/** Linhas prontas para o chat: separador de dia, separador de atendimento (quando muda a conversa)
    e mensagens (com `junta` = mesma direção/autor da anterior em até 5 min — bolhas coladas). */
export function montarLinhas(msgs, conversas = [], agora = new Date()) {
  const porId = new Map((conversas || []).map(c => [c.id, c]));
  const out = [];
  let dia = null, conv = null, ant = null;
  for (const m of msgs || []) {
    const d = diaSP(m.criado_em) || diaSP(agora);
    if (d !== dia) { out.push({ tipo: "dia", chave: `d-${d}`, dia: d, rotulo: rotuloDia(d, agora) }); dia = d; ant = null; }
    if (m.conversa_id != null && m.conversa_id !== conv) {
      if (conv !== null || porId.size > 1) {
        const c = porId.get(m.conversa_id);
        if (c) { out.push({ tipo: "atendimento", chave: `a-${c.id}-${out.length}`, conversa: c }); ant = null; }
      }
      conv = m.conversa_id;
    }
    const lateral = m.tipo !== "sistema";
    const junta = !!ant && lateral && ant.tipo !== "sistema" && ant.direcao === m.direcao
      && (ant.tipo === "nota") === (m.tipo === "nota")
      && ((ant.enviado_por && ant.enviado_por.id) || null) === ((m.enviado_por && m.enviado_por.id) || null)
      && ms(m.criado_em) - ms(ant.criado_em) < 5 * 60000;
    out.push({ tipo: "msg", chave: `m-${m.id}`, msg: m, junta });
    ant = m;
  }
  return out;
}

/* ------------------------------------------------------------ mensagens */
const ROTULO_TIPO = Object.freeze({
  imagem: "Foto", audio: "Áudio", video: "Vídeo", documento: "Documento", sticker: "Figurinha",
  localizacao: "Localização", contato: "Contato", interativo: "Resposta", template: "Modelo",
  desconhecido: "Mensagem não suportada",
});

function umaLinha(s, max = 140) {
  const t = String(s ?? "").replace(/\s+/g, " ").trim();
  return t.length > max ? t.slice(0, max - 1).trimEnd() + "…" : t;
}

/** resumoMensagem(msg) → texto curto (lista, citação, notificação). */
export function resumoMensagem(m, max = 140) {
  if (!m) return "";
  const corpo = umaLinha(m.corpo, max);
  switch (m.tipo) {
    case "texto": case "sistema": case "interativo": return corpo || ROTULO_TIPO[m.tipo] || "";
    case "nota": return umaLinha(`Nota: ${m.corpo ?? ""}`, max);
    case "template": {
      const nome = m.template && m.template.nome;
      return corpo || (nome ? `Modelo «${nome}»` : "Modelo");
    }
    case "documento": {
      const nome = m.midia && m.midia.nome;
      return umaLinha([nome ? `Documento: ${nome}` : "Documento", m.corpo].filter(Boolean).join(" · "), max);
    }
    case "imagem": case "video": case "audio": case "sticker":
      return corpo ? umaLinha(`${ROTULO_TIPO[m.tipo]}: ${m.corpo}`, max) : ROTULO_TIPO[m.tipo];
    default: return corpo || ROTULO_TIPO[m.tipo] || "Mensagem";
  }
}

/** Status de envio honesto: ◷ ✓ ✓✓ ✓✓+"lida" ! — nunca azul (cor só texto-3 ou ruim). */
export function iconeStatus(status) {
  switch (status) {
    case "pendente": return { simbolo: "◷", rotulo: "Enviando", texto: "", cor: "texto-3", classe: "st-pendente" };
    case "enviada": return { simbolo: "✓", rotulo: "Enviada", texto: "", cor: "texto-3", classe: "st-enviada" };
    case "entregue": return { simbolo: "✓✓", rotulo: "Entregue", texto: "", cor: "texto-3", classe: "st-entregue" };
    case "lida": return { simbolo: "✓✓", rotulo: "Lida", texto: "lida", cor: "texto-3", classe: "st-lida" };
    case "falhou": return { simbolo: "!", rotulo: "Não enviada", texto: "", cor: "ruim", classe: "st-falhou" };
    default: return null;   // recebida, nota, sistema: sem selo
  }
}

/* ------------------------------------------------------------ respostas rápidas */
export function semAcento(s) {
  return String(s ?? "").normalize("NFD").replace(/[̀-ͯ]/g, "").toLowerCase();
}

/** Termo depois da "/" no campo (só quando o texto começa com "/" e ainda não tem espaço). */
export function termoBarra(texto) {
  const m = /^\/([^\s]*)$/.exec(String(texto ?? ""));
  return m ? m[1] : null;
}

/** filtrarRespostas(lista, termo, {departamento, max}) — atalho que começa com o termo > atalho que contém >
    título > corpo; empate: do departamento da conversa, mais usada, atalho. */
export function filtrarRespostas(lista, termo, { departamento = null, max = 8 } = {}) {
  const q = semAcento(String(termo ?? "").replace(/^\//, "").trim());
  const pontos = r => {
    const a = semAcento(r.atalho), t = semAcento(r.titulo), c = semAcento(r.corpo);
    if (!q) return 1;
    if (a.startsWith(q)) return 4;
    if (a.includes(q)) return 3;
    if (t.includes(q)) return 2;
    if (c.includes(q)) return 1;
    return 0;
  };
  return (lista || [])
    .filter(r => r && r.ativo !== false)
    .map(r => ({ r, p: pontos(r) }))
    .filter(x => x.p > 0)
    .sort((x, y) => (y.p - x.p)
      || ((y.r.departamento_id === departamento && departamento ? 1 : 0) - (x.r.departamento_id === departamento && departamento ? 1 : 0))
      || ((y.r.usos || 0) - (x.r.usos || 0))
      || String(x.r.atalho).localeCompare(String(y.r.atalho)))
    .slice(0, max)
    .map(x => x.r);
}

/* ------------------------------------------------------------ delta (cursor duplo) */
const ehLocal = id => typeof id === "string" && id.startsWith("tmp-");

/** mesclarDelta(atuais, novos): junta por id sem duplicar; a versão nova substitui a antiga (a não ser
    que seja mais velha por atualizado_em); ordem por id; itens locais (id "tmp-…", envio otimista)
    ficam no fim, na ordem em que entraram, até o servidor devolver a mensagem de verdade. */
export function mesclarDelta(atuais, novos) {
  const mapa = new Map();
  const locais = [];
  for (const m of atuais || []) {
    if (!m) continue;
    if (ehLocal(m.id)) locais.push(m); else mapa.set(Number(m.id), m);
  }
  for (const m of novos || []) {
    if (!m || m.id === null || m.id === undefined) continue;
    if (ehLocal(m.id)) { locais.push(m); continue; }
    const id = Number(m.id);
    const velho = mapa.get(id);
    if (velho && Number.isFinite(ms(velho.atualizado_em)) && Number.isFinite(ms(m.atualizado_em))
        && ms(m.atualizado_em) < ms(velho.atualizado_em)) continue;
    mapa.set(id, m);
  }
  return [...[...mapa.entries()].sort((a, b) => a[0] - b[0]).map(e => e[1]), ...locais];
}

/** Maior id numérico da lista (cursor do próximo delta). */
export function ultimoId(msgs, atual = null) {
  let mx = atual === null || atual === undefined ? null : Number(atual);
  for (const m of msgs || []) {
    if (m && !ehLocal(m.id)) { const n = Number(m.id); if (Number.isFinite(n) && (mx === null || n > mx)) mx = n; }
  }
  return mx;
}

let _seqLocal = 0;
/** Mensagem otimista (◷) enquanto a nx-enviar responde. */
export function mensagemOtimista({ conversaId, tipo = "texto", corpo = "", eu = null, respondeA = null, midia = null, template = null, agora = new Date() } = {}) {
  const iso = new Date(ms(agora)).toISOString();
  return {
    id: `tmp-${++_seqLocal}`, conversa_id: conversaId, direcao: "out", tipo, corpo, midia, template,
    status: "pendente", erro: null, enviado_por: eu, origem: "painel", responde_a: respondeA,
    reacao: null, referral: null, criado_em: iso, atualizado_em: iso, local: true,
  };
}

/* ------------------------------------------------------------ formatação do WhatsApp */
/** formatarWhats("oi *Ana*, veja https://x.com") → [{tipo:'texto'|'negrito'|'italico'|'riscado'|'mono'|'link', v}]
    Só produz segmentos (a tela cria nós de texto/elementos — nunca HTML cru). Links só http(s). */
export function formatarWhats(texto) {
  const s = String(texto ?? "");
  const out = [];
  const re = /(https?:\/\/[^\s<>"']+[^\s<>"'.,;:!?)\]])|```([^`]+)```|\*([^*\n]+)\*|_([^_\n]+)_|~([^~\n]+)~/g;
  let i = 0, m;
  const antesOk = pos => pos === 0 || /[\s(["'¡¿]/.test(s[pos - 1]);
  while ((m = re.exec(s))) {
    const ini = m.index;
    if (!m[1] && !m[2] && !antesOk(ini)) continue;
    if (ini > i) out.push({ tipo: "texto", v: s.slice(i, ini) });
    if (m[1]) out.push({ tipo: "link", v: m[1] });
    else if (m[2]) out.push({ tipo: "mono", v: m[2] });
    else if (m[3]) out.push({ tipo: "negrito", v: m[3] });
    else if (m[4]) out.push({ tipo: "italico", v: m[4] });
    else if (m[5]) out.push({ tipo: "riscado", v: m[5] });
    i = ini + m[0].length;
  }
  if (i < s.length) out.push({ tipo: "texto", v: s.slice(i) });
  return out;
}

/* ------------------------------------------------------------ espera */
/** "agora", "5 min", "2 h", "3 d" — tempo desde `desde`. */
export function tempoEspera(desde, agora = new Date()) {
  const d = ms(agora) - ms(desde);
  if (!Number.isFinite(d)) return "";
  if (d < 60000) return "agora";
  if (d < 3600000) return `${Math.floor(d / 60000)} min`;
  if (d < 86400000) return `${Math.floor(d / 3600000)} h`;
  return `${Math.floor(d / 86400000)} d`;
}

/** Hora curta da lista: hoje → "14:05"; ontem → "Ontem"; semana → "seg."; senão "28/09". */
const _fmtHora = new Intl.DateTimeFormat("pt-BR", { timeZone: FUSO, hour: "2-digit", minute: "2-digit" });
const _fmtCurta = new Intl.DateTimeFormat("pt-BR", { timeZone: FUSO, day: "2-digit", month: "2-digit" });
const _fmtSem = new Intl.DateTimeFormat("pt-BR", { timeZone: FUSO, weekday: "short" });
export function horaLista(iso, agora = new Date()) {
  const t = ms(iso); if (!Number.isFinite(t)) return "";
  const dif = Math.round((Date.parse(diaSP(agora)) - Date.parse(diaSP(t))) / 86400000);
  if (dif <= 0) return _fmtHora.format(new Date(t));
  if (dif === 1) return "Ontem";
  if (dif < 7) return _fmtSem.format(new Date(t));
  return _fmtCurta.format(new Date(t));
}
export function horaMsg(iso) { const t = ms(iso); return Number.isFinite(t) ? _fmtHora.format(new Date(t)) : ""; }

/* ------------------------------------------------------------ anexos (regras da nx-midia, §6.4) */
const MB = 1024 * 1024;
const TIPOS_IMAGEM = new Set(["image/jpeg", "image/png", "image/webp"]);
const TIPOS_16 = new Set(["video/mp4", "video/3gpp", "audio/aac", "audio/mp4", "audio/mpeg", "audio/amr", "audio/ogg",
  "application/pdf", "application/msword", "application/vnd.ms-excel", "application/vnd.ms-powerpoint", "text/plain"]);
/** WAV: só o número conectado pelo CodeWords aceita (a Meta recusa). É também o formato em que a tela entrega o áudio gravado nesse canal. */
export const MIME_WAV = "audio/wav";
const APELIDOS_WAV = new Set(["audio/x-wav", "audio/wave", "audio/vnd.wave", "audio/x-pn-wav"]);   // o mesmo WAV, como cada navegador/sistema o chama
const EXT_MIME = Object.freeze({
  jpg: "image/jpeg", jpeg: "image/jpeg", png: "image/png", webp: "image/webp", heic: "image/heic", heif: "image/heif", mp4: "video/mp4", "3gp": "video/3gpp",
  aac: "audio/aac", m4a: "audio/mp4", mp3: "audio/mpeg", amr: "audio/amr", ogg: "audio/ogg", opus: "audio/ogg", wav: MIME_WAV,
  pdf: "application/pdf", doc: "application/msword", xls: "application/vnd.ms-excel", ppt: "application/vnd.ms-powerpoint",
  docx: "application/vnd.openxmlformats-officedocument.wordprocessingml.document",
  xlsx: "application/vnd.openxmlformats-officedocument.spreadsheetml.sheet",
  pptx: "application/vnd.openxmlformats-officedocument.presentationml.presentation", txt: "text/plain",
});

/** Tipo que o navegador informou, ou deduzido da extensão (arquivo sem type). */
export function mimeDe(arquivo) {
  const t = String(arquivo && arquivo.type || "").toLowerCase().split(";")[0].trim();
  if (t) return APELIDOS_WAV.has(t) ? MIME_WAV : t;
  const ext = String(arquivo && arquivo.name || "").toLowerCase().split(".").pop();
  return EXT_MIME[ext] || "";
}

/**
 * validarArquivo({name,type,size}, {provedor}) → {ok, erro?, mime, tipo:'imagem'|'video'|'audio'|'documento', limite, wav?}
 * `provedor` é o do canal da conversa ("meta" se não vier). O WAV só passa em número do CodeWords; na Meta volta midia_tipo com
 * wav:true, para a tela dizer o motivo certo em vez do aviso genérico.
 */
export function validarArquivo(arquivo, { provedor = "meta" } = {}) {
  const mime = mimeDe(arquivo);
  const size = Number(arquivo && arquivo.size) || 0;
  let tipo = null, limite = 16 * MB;
  if (TIPOS_IMAGEM.has(mime)) { tipo = "imagem"; limite = 5 * MB; }
  else if (mime === MIME_WAV) {
    if (provedor !== "codewords") return { ok: false, erro: "midia_tipo", mime, tipo: null, limite, wav: true };
    tipo = "audio";
  }
  else if (mime.startsWith("video/") && TIPOS_16.has(mime)) tipo = "video";
  else if (mime.startsWith("audio/") && TIPOS_16.has(mime)) tipo = "audio";
  else if (TIPOS_16.has(mime) || mime.startsWith("application/vnd.openxmlformats-officedocument.")) tipo = "documento";
  if (!tipo) return { ok: false, erro: "midia_tipo", mime, tipo: null, limite };
  if (size <= 0) return { ok: false, erro: "midia_tipo", mime, tipo, limite };
  if (size > limite) return { ok: false, erro: "midia_grande", mime, tipo, limite };
  return { ok: true, mime, tipo, limite };
}

/* ------------------------------------------------------------ áudio gravado em número do CodeWords: PCM → WAV */
export const WAV_TAXA = 16000;
/**
 * wavDePcm(amostras, taxa) → Uint8Array com um WAV PCM de 16 bits, mono, little-endian: cabeçalho RIFF de 44 bytes + as amostras.
 * `amostras` é o canal único já reamostrado (Float32Array em [-1, 1]; o que passar disso é cortado e o que não for número vira silêncio).
 * WAV 16 kHz mono é o formato que o aparelho do CodeWords entrega como mensagem de voz, qualquer que seja o formato que o navegador grava.
 */
export function wavDePcm(amostras, taxa = WAV_TAXA) {
  const pcm = amostras && typeof amostras.length === "number" ? amostras : [];
  const hz = Math.round(Number(taxa)) > 0 ? Math.round(Number(taxa)) : WAV_TAXA;
  const n = pcm.length;
  const v = new DataView(new ArrayBuffer(44 + n * 2));
  const escrever = (pos, txt) => { for (let i = 0; i < txt.length; i++) v.setUint8(pos + i, txt.charCodeAt(i)); };
  escrever(0, "RIFF"); v.setUint32(4, 36 + n * 2, true); escrever(8, "WAVE");
  escrever(12, "fmt "); v.setUint32(16, 16, true);       // o bloco "fmt " tem 16 bytes
  v.setUint16(20, 1, true);                                // 1 = PCM sem compressão
  v.setUint16(22, 1, true);                                // mono
  v.setUint32(24, hz, true);
  v.setUint32(28, hz * 2, true);                           // bytes por segundo: taxa × 2 bytes × 1 canal
  v.setUint16(32, 2, true);                                // bytes por amostra
  v.setUint16(34, 16, true);                               // bits por amostra
  escrever(36, "data"); v.setUint32(40, n * 2, true);
  for (let i = 0; i < n; i++) {
    const x = Number(pcm[i]);
    const a = Number.isFinite(x) ? Math.max(-1, Math.min(1, x)) : 0;
    v.setInt16(44 + i * 2, Math.round(a < 0 ? a * 0x8000 : a * 0x7fff), true);
  }
  return new Uint8Array(v.buffer);
}

/** 1536 → "1,5 KB" */
export function tamanhoLegivel(bytes) {
  const n = Number(bytes);
  if (!Number.isFinite(n) || n < 0) return "";
  if (n < 1024) return `${n} B`;
  const f = new Intl.NumberFormat("pt-BR", { maximumFractionDigits: 1 });
  if (n < MB) return `${f.format(n / 1024)} KB`;
  return `${f.format(n / MB)} MB`;
}

/* ------------------------------------------------------------ modelos (templates) */
/** Maior {{n}} do corpo. */
export function contarParametros(corpo) {
  let mx = 0;
  for (const m of String(corpo ?? "").matchAll(/\{\{\s*(\d+)\s*\}\}/g)) mx = Math.max(mx, Number(m[1]));
  return mx;
}
/** preencherModelo("Olá {{1}}", ["Ana"]) → "Olá Ana"; parâmetro vazio mostra «{{n}}». */
export function preencherModelo(corpo, params = []) {
  return String(corpo ?? "").replace(/\{\{\s*(\d+)\s*\}\}/g, (_, n) => {
    const v = params[Number(n) - 1];
    return v !== undefined && v !== null && String(v).trim() !== "" ? String(v) : `{{${n}}}`;
  });
}
/** Modelo pode ser usado agora? (aprovado; marketing bloqueado SÓ para quem pediu para sair — decisão 3 do plano 100: opt-in
    desconhecido (null) passa, é a regra do nx-enviar). */
export function modeloDisponivel(t, { optin = null } = {}) {
  if (!t) return { ok: false, motivo: "Modelo inexistente." };
  if (String(t.status || "").toUpperCase() !== "APPROVED") return { ok: false, motivo: "Ainda não aprovado pela Meta." };
  if (String(t.categoria || "").toUpperCase() === "MARKETING" && optin === false)
    return { ok: false, motivo: "O contato pediu para não receber marketing." };
  return { ok: true, motivo: "" };
}

/* ------------------------------------------------------------ telefone digitado */
/** Mesma regra do nx_cv_nova: "+<DDI>…" ou "00<DDI>…" = número internacional completo (8–15 dígitos,
    como veio — ex.: "+1 415 555 1234" → 14155551234); sem prefixo = nx_tel_normalizar(p, false):
    10–11 dígitos → 55 + …; 12–15 como está; senão null. */
export function normalizarTelefone(txt) {
  const s = String(txt ?? "").trim();
  if (/^(\+|00)/.test(s)) {
    const di = soDigitos(s.replace(/^(\+|00)/, ""));
    return di.length >= 8 && di.length <= 15 ? di : null;
  }
  const d = soDigitos(s);
  if (d.length >= 10 && d.length <= 11) return "55" + d;
  if (d.length >= 12 && d.length <= 15) return d;
  return null;
}

/* ------------------------------------------------------------ papéis */
const RANK = { leitura: 0, atendente: 1, supervisor: 2, admin: 3, gestor: 4, super: 5 };
export function pode(papel, min) { return (RANK[papel] ?? -1) >= (RANK[min] ?? 99); }

/** Dicas para erros do envio (texto que acompanha o "!"). */
export function dicaErroEnvio(codigo) {
  return {
    fora_da_janela: "Mais de 24 h desde a última mensagem do cliente. Envie um modelo aprovado.",
    conversa_resolvida: "Atendimento resolvido. Reabra para responder.",
    canal_sem_token: "Este número ainda não tem o token da Meta.",
    sem_conexao: "Sem internet agora. Tente de novo.",
    tempo_esgotado: "Demorou demais. Tente de novo.",
    upload_falhou: "O arquivo não subiu — confira a internet e toque em Tentar de novo (a foto já está pronta).",
  }[codigo] || "";
}

/* ============================================================ P0-B */
/* ------------------------------------------------------------ horário de funcionamento (§3.8) */
export const DIAS = Object.freeze(["Dom", "Seg", "Ter", "Qua", "Qui", "Sex", "Sáb"]);
export const DIAS_LONGOS = Object.freeze(["Domingo", "Segunda", "Terça", "Quarta", "Quinta", "Sexta", "Sábado"]);
const RE_INI = /^([01]\d|2[0-3]):[0-5]\d$/;
const RE_FIM = /^(([01]\d|2[0-3]):[0-5]\d|24:00)$/;

/** Horário padrão para começar a editar: seg–sex 08:00–18:00, sáb 08:00–12:00, dom fechado. */
export function horarioPadrao() {
  const r = {};
  for (let d = 0; d < 7; d++) r[d] = d === 0 ? [] : d === 6 ? [["08:00", "12:00"]] : [["08:00", "18:00"]];
  return r;
}

/** Mesma regra do nx_cv_horario_normalizar (servidor): null = 24 h; dias "0".."6"; até 2 faixas;
    início < fim; sem sobrepor. → {ok, horario (7 chaves), erro:{dia, texto}|null} */
export function validarHorario(h) {
  if (h === null || h === undefined) return { ok: true, horario: null, erro: null };
  if (typeof h !== "object" || Array.isArray(h)) return { ok: false, horario: null, erro: { dia: null, texto: "Horário inválido." } };
  for (const k of Object.keys(h)) if (!/^[0-6]$/.test(k)) return { ok: false, horario: null, erro: { dia: null, texto: "Dia da semana inválido." } };
  const r = {};
  for (let d = 0; d < 7; d++) {
    const dia = h[d] ?? h[String(d)] ?? [];
    if (!Array.isArray(dia) || dia.length > 2) return { ok: false, horario: null, erro: { dia: d, texto: `${DIAS_LONGOS[d]}: no máximo 2 faixas.` } };
    let ant = null;
    const faixas = [];
    for (const f of dia) {
      const [ini, fim] = Array.isArray(f) ? f : [];
      if (!RE_INI.test(String(ini || "")) || !RE_FIM.test(String(fim || ""))) return { ok: false, horario: null, erro: { dia: d, texto: `${DIAS_LONGOS[d]}: use horas como 08:00.` } };
      if (!(ini < fim)) return { ok: false, horario: null, erro: { dia: d, texto: `${DIAS_LONGOS[d]}: o fim precisa ser depois do início.` } };
      if (ant && ini < ant) return { ok: false, horario: null, erro: { dia: d, texto: `${DIAS_LONGOS[d]}: as faixas se sobrepõem.` } };
      ant = fim;
      faixas.push([ini, fim]);
    }
    r[d] = faixas;
  }
  return { ok: true, horario: r, erro: null };
}

/** "Seg a Sex 08:00–18:00 · Sáb 08:00–12:00 · Dom fechado" (dias seguidos iguais viram faixa); null → "24 horas". */
export function resumoHorario(h) {
  if (h === null || h === undefined) return "24 horas, todos os dias";
  const txt = d => { const fx = h[d] ?? h[String(d)] ?? []; return fx.length ? fx.map(([a, b]) => `${a}–${b}`).join(" e ") : "fechado"; };
  const ordem = [1, 2, 3, 4, 5, 6, 0];            // semana começando na segunda
  const grupos = [];
  for (const d of ordem) {
    const t = txt(d);
    const g = grupos[grupos.length - 1];
    if (g && g.t === t) g.dias.push(d); else grupos.push({ t, dias: [d] });
  }
  if (grupos.length === 1) return grupos[0].t === "fechado" ? "Fechado todos os dias" : `Todos os dias ${grupos[0].t}`;
  return grupos.map(g => {
    const nome = g.dias.length === 1 ? DIAS[g.dias[0]] : g.dias.length === 2 ? `${DIAS[g.dias[0]]} e ${DIAS[g.dias[1]]}` : `${DIAS[g.dias[0]]} a ${DIAS[g.dias[g.dias.length - 1]]}`;
    return `${nome} ${g.t}`;
  }).join(" · ");
}

const _fmtHM = new Intl.DateTimeFormat("en-GB", { timeZone: FUSO, weekday: "short", hour: "2-digit", minute: "2-digit", hourCycle: "h23" });
const _DOW = { Sun: 0, Mon: 1, Tue: 2, Wed: 3, Thu: 4, Fri: 5, Sat: 6 };
/** Mesma regra do nx_horario_aberto (F1), no fuso de SP: null = aberto. */
export function horarioAberto(h, quando = new Date()) {
  if (h === null || h === undefined) return true;
  const t = ms(quando);
  if (!Number.isFinite(t)) return false;
  const partes = Object.fromEntries(_fmtHM.formatToParts(new Date(t)).map(p => [p.type, p.value]));
  const dow = _DOW[partes.weekday];
  const hm = `${partes.hour}:${partes.minute}`;
  const fx = h[dow] ?? h[String(dow)] ?? [];
  return Array.isArray(fx) && fx.some(f => Array.isArray(f) && hm >= f[0] && hm < f[1]);
}

/* ------------------------------------------------------------ assistente de IA */
export const IA_CAMPOS = Object.freeze(["sobre", "servicos", "horarios", "regras", "proibido", "memoria_aprovada"]);
export const IA_MAX = 15000;
/** Soma dos textos (mesma conta do nx_ia_config_salvar, com os textos aparados). */
export function contarIA(cfg) {
  return IA_CAMPOS.reduce((s, k) => s + String((cfg && cfg[k]) ?? "").trim().length, 0);
}

/* ------------------------------------------------------------ busca nas mensagens */
/** Partes do trecho para destacar o termo sem innerHTML: [{t, marca:bool}] (sem acento/caixa). */
export function partesDestaque(texto, termo) {
  const s = String(texto ?? "");
  const q = semAcento(String(termo ?? "").trim());
  if (!q) return [{ t: s, marca: false }];
  const base = semAcento(s);
  // semAcento preserva o comprimento (NFD sem marcas → mesma contagem para letras latinas comuns)
  if (base.length !== s.length) return [{ t: s, marca: false }];
  const out = [];
  let i = 0;
  for (;;) {
    const j = base.indexOf(q, i);
    if (j < 0) { if (i < s.length) out.push({ t: s.slice(i), marca: false }); break; }
    if (j > i) out.push({ t: s.slice(i, j), marca: false });
    out.push({ t: s.slice(j, j + q.length), marca: true });
    i = j + q.length;
  }
  return out;
}

/* ------------------------------------------------------------ cabeçalho do chat (M34): um primário por estado */
/**
 * estadoCabecalho({conv, eu, pode, codeWords, ia}) → {primaria, estilo, resolverIcone, resolverNoMenu, devolverIA}
 *  - sem permissão para escrever → nada;
 *  - resolvida → "reabrir" (secundário);
 *  - IA atendendo (CodeWords, IA ligada e viva) → "assumir_ia" (primário), Resolver em ícone (plano 100 · D12) e o resto no ⋮;
 *  - minha → "resolver" em contorno de `--c-ok` (sem primário);
 *  - sem dono ou com colega → "assumir" (primário) e Resolver vira ícone neutro.
 * Nunca há mais de um primário; "devolverIA" liga a entrada no ⋮ quando a IA está pausada.
 */
export function estadoCabecalho({ conv, eu = null, pode: podeEscrever = true, codeWords = false, ia = null } = {}) {
  const base = { primaria: null, estilo: null, resolverIcone: false, resolverNoMenu: false, devolverIA: false };
  if (!conv || !podeEscrever) return base;
  if (conv.status === "resolvida") return { ...base, primaria: "reabrir", estilo: "sec" };
  const iaViva = !!(codeWords && ia && ia.disponivel !== false && ia.ia_ligada);
  const minha = !!(eu && conv.atribuida_a && conv.atribuida_a === eu);
  const devolverIA = iaViva && !!ia.pausada;
  // plano 100 · D12: com a IA atendendo, o Resolver continua à vista como ícone (e também no ⋮)
  if (iaViva && !ia.pausada) return { ...base, primaria: "assumir_ia", estilo: "prim", resolverIcone: true, resolverNoMenu: true };
  if (minha) return { ...base, primaria: "resolver", estilo: "contorno", devolverIA };
  return { ...base, primaria: "assumir", estilo: "prim", resolverIcone: true, devolverIA };
}

/** Texto curto da janela de 24 h para o celular: "18 h", "25 min" ou "fechada". */
export function janelaCurta(j) {
  if (!j || !j.aberta) return "Janela fechada";
  const m = Math.floor((Number(j.restanteMs) || 0) / 60000);
  return m >= 60 ? `Janela ${Math.floor(m / 60)} h` : `Janela ${Math.max(1, m)} min`;
}

/* ------------------------------------------------------------ fotos do celular (M37): comprimir no aparelho antes de validar */
export const FOTO_LADO_MAX = 1600;                 // lado maior, em px
export const FOTO_QUALIDADES = Object.freeze([0.82, 0.72, 0.62]);   // 1ª tentativa e reduções para chegar perto do alvo
export const FOTO_PEQUENA = 300 * 1024;            // até isto (e dentro do lado máximo) o original segue sem recompressão
export const FOTO_ALVO = 500 * 1024;               // alvo do JPEG (200–500 KB para uma foto de câmera)
const TIPOS_FOTO = new Set(["image/jpeg", "image/png", "image/webp", "image/heic", "image/heif"]);

/** O arquivo é uma foto que vale tentar otimizar? (heic/heif só dá certo onde o navegador decodifica — quem chama trata a falha.) */
export function ehFoto(arquivo) { return TIPOS_FOTO.has(mimeDe(arquivo)); }

/** dimensoesFoto(4032, 3024) → {w: 1600, h: 1200, mudou: true}; nunca amplia; arredonda; lado mínimo 1. */
export function dimensoesFoto(largura, altura, max = FOTO_LADO_MAX) {
  const w0 = Math.max(1, Math.round(Number(largura) || 0)), h0 = Math.max(1, Math.round(Number(altura) || 0));
  const maior = Math.max(w0, h0);
  if (!(maior > max)) return { w: w0, h: h0, mudou: false };
  const f = max / maior;
  return { w: Math.max(1, Math.round(w0 * f)), h: Math.max(1, Math.round(h0 * f)), mudou: true };
}

/** planoFoto({tipo, bytes, largura, altura}) → {acao: "manter"|"otimizar", w, h}.
    Foto pequena (≤ 300 KB e dentro de 1600 px) segue como veio; o resto é redimensionado e recodificado. HEIC sempre otimiza (o WhatsApp não aceita). */
export function planoFoto({ tipo, bytes, largura, altura } = {}, { pequena = FOTO_PEQUENA, max = FOTO_LADO_MAX } = {}) {
  const d = dimensoesFoto(largura, altura, max);
  const heic = /^image\/hei[cf]$/.test(String(tipo || ""));
  if (!heic && !d.mudou && Number(bytes) <= pequena) return { acao: "manter", w: d.w, h: d.h };
  return { acao: "otimizar", w: d.w, h: d.h };
}

/** Qualidade da próxima tentativa (ou null quando acabaram): só insiste se ainda passou do alvo. */
export function proximaQualidadeFoto(bytes, tentativa = 0, { alvo = FOTO_ALVO } = {}) {
  if (!(Number(bytes) > alvo)) return null;
  return FOTO_QUALIDADES[tentativa + 1] ?? null;
}

/** "Foto otimizada de 7,2 MB para 380 KB" — ou a frase neutra quando nada mudou. */
export function resumoOtimizacao(antes, depois) {
  if (!(Number(antes) > 0) || !(Number(depois) > 0) || depois >= antes) return "";
  return `Foto otimizada de ${tamanhoLegivel(antes)} para ${tamanhoLegivel(depois)}`;
}

/** Nome do arquivo otimizado: troca a extensão por .jpg (mantém o nome que a pessoa conhece). */
export function nomeFotoOtimizada(nome) {
  const base = String(nome || "foto").replace(/\.[A-Za-z0-9]{1,5}$/, "").slice(0, 80) || "foto";
  return `${base}.jpg`;
}

/** Progresso de envio como texto e como fração: progressoEnvio(620, 1000) → {pct: 62, texto: "62 %"}; nunca passa de 99 antes de acabar. */
export function progressoEnvio(enviados, total) {
  const t = Number(total), e = Number(enviados);
  if (!(t > 0) || !(e >= 0)) return { pct: 0, texto: "0 %" };
  const pct = Math.max(0, Math.min(99, Math.floor((e / t) * 100)));
  return { pct, texto: `${pct} %` };
}

/* ------------------------------------------------------------ fila de saída e rascunho (M36) */
export const FILA_BACKOFF_MS = Object.freeze([20000, 40000, 80000, 160000, 300000]);   // 20 s, dobrando até 5 min
export const FILA_TTL_MS = 7 * 24 * 3600 * 1000;                                       // item que ninguém reenviou em 7 dias some
export const FILA_ESPERA_REENVIO_MS = 90000;       // depois de um pedido sair, o MESMO item só é retransmitido 90 s depois (o primeiro ainda pode estar a caminho)
export const FILA_AUTO_MAX_MS = 15 * 60000;        // mensagem parada há mais de 15 min não sai sozinha: a pessoa decide
export const FILA_EM_ANDAMENTO_MS = 20000;         // o servidor disse "envio em andamento" (409): pergunta de novo em ~20 s

/** client_ref de uma intenção de envio ("orbita:<uuid>"): o MESMO valor em toda repetição da mesma mensagem. */
export function novoClientRef(uuid) {
  const id = String(uuid || `${Date.now().toString(36)}-${Math.random().toString(36).slice(2, 10)}`).replace(/[^A-Za-z0-9_.-]/g, "");
  return `orbita:${id}`.slice(0, 80);
}

/** Quando tentar de novo: 20 s, 40 s, 80 s, 160 s e 5 min daí em diante (jitter opcional, em ms). */
export function proximaTentativaFila(tentativas, agora = Date.now(), jitter = 0) {
  const n = Math.max(0, Math.min(Number(tentativas) || 0, FILA_BACKOFF_MS.length - 1));
  return agora + FILA_BACKOFF_MS[n] + (Number(jitter) || 0);
}

const REDE_SEM_CONEXAO = /^(sem_conexao)$/;
const REDE_EM_VOO = /^(tempo_esgotado|tempo_rede)$/;
const REDE_SERVIDOR = /^(servico_indisponivel|http_(408|425|429|5\d\d))$/;
const SO_SESSAO = /^(sessao_invalida|sessao_expirada)$/;
/**
 * O que fazer com um erro de envio de TEXTO (com client_ref, repetir é seguro):
 *   {tipo:"rede", subtipo:"sem_conexao"}  nunca chegou ao servidor → "Na fila · envia quando a internet voltar";
 *   {tipo:"rede", subtipo:"em_voo"}       prazo estourado com a requisição em voo → "Status incerto" e repete com o MESMO client_ref;
 *   {tipo:"rede", subtipo:"servidor"}     503/429/5xx do servidor → repete com backoff;
 *   {tipo:"rede", subtipo:"em_andamento"} 409 envio_em_andamento: outro pedido com o MESMO client_ref ainda está sendo enviado → não é falha,
 *                                         só pergunta de novo em ~20 s (sem motivo na tela);
 *   {tipo:"sessao"}                       sessão caída → espera o login (o rascunho/fila ficam);
 *   {tipo:"definitiva", codigo, motivo}   fora_da_janela, conversa_resolvida, dados_invalidos… → "Não enviada" com o motivo (não repete sozinho).
 */
export function classificarFalhaEnvio(e) {
  const cod = String((e && (e.codigo || e.code)) || "");
  const status = Number(e && e.status);
  const salva = !!(e && e.resposta && e.resposta.mensagem && e.resposta.mensagem.id);
  if (SO_SESSAO.test(cod) || status === 401) return { tipo: "sessao", codigo: cod || "sessao_invalida", motivo: "Sua sessão expirou. Entre de novo: a mensagem continua guardada." };
  if (cod === "envio_em_andamento") return { tipo: "rede", subtipo: "em_andamento", codigo: cod, motivo: null };
  if (e && e.resposta && e.resposta.ambigua === true) return { tipo: "definitiva", codigo: "ambigua", motivo: "Pode ter saído — confira no WhatsApp antes de reenviar.", ambigua: true, salva };
  if (REDE_SEM_CONEXAO.test(cod)) return { tipo: "rede", subtipo: "sem_conexao", codigo: cod, motivo: "Sem internet: a mensagem espera na fila." };
  if (REDE_EM_VOO.test(cod) || status === 504) return { tipo: "rede", subtipo: "em_voo", codigo: cod || "http_504", motivo: "O servidor não respondeu a tempo: tentando de novo sem enviar em dobro." };
  if (REDE_SERVIDOR.test(cod) || (status >= 500 && !salva)) return { tipo: "rede", subtipo: "servidor", codigo: cod || `http_${status}`, motivo: "O servidor está ocupado: tentando de novo." };
  return { tipo: "definitiva", codigo: cod || "envio_falhou", motivo: dicaErroEnvio(cod) || "", salva };
}

/**
 * O que acontece com um item da fila depois de uma falha de envio em que o servidor NÃO gravou a mensagem. `c` é o classificarFalhaEnvio.
 * Devolve {fim, campos}: `campos` são os que mudam no item; `fim` = true quando ele não sai mais sozinho (a pessoa decide).
 *   409 em andamento → "andamento": não conta como tentativa, não mostra motivo, pergunta de novo em ~20 s (enviada_em zera: o servidor respondeu
 *                      que ESTE pedido não enviou nada, e a reserva do client_ref é que impede o dobro);
 *   sessão caída     → volta à fila e tenta 15 s depois (o servidor recusou antes de enviar: enviada_em zera);
 *   rede             → "fila" (ou "incerto", se o prazo estourou com o pedido a caminho) com o backoff; os 90 s desde enviada_em continuam valendo;
 *   pode ter saído   → "ambigua": fica com o aviso e nunca é reenviada sozinha;
 *   definitiva       → "falhou" com o motivo.
 */
export function aposFalhaFila(item, c, { agora = Date.now(), jitter = 0, textoErro = "" } = {}) {
  const tent = Number(item && item.tentativas) || 0;
  if (c && c.tipo === "rede" && c.subtipo === "em_andamento") {
    return { fim: false, campos: { estado: "andamento", motivo: null, enviada_em: 0, proxima_em: agora + FILA_EM_ANDAMENTO_MS } };
  }
  if (c && c.tipo === "sessao") return { fim: false, campos: { estado: "fila", motivo: c.motivo, enviada_em: 0, tentativas: tent + 1, proxima_em: agora + 15000 } };
  if (c && c.tipo === "rede") {
    // «sem conexão»: o pedido nem saiu (e, se saiu, a reserva do client_ref no servidor responde «em andamento» ou devolve a gravada): sem trava de 90 s
    return { fim: false, campos: { estado: c.subtipo === "em_voo" ? "incerto" : "fila", motivo: c.motivo, tentativas: tent + 1, proxima_em: proximaTentativaFila(tent, agora, jitter),
      ...(c.subtipo === "sem_conexao" ? { enviada_em: 0 } : {}) } };
  }
  if (c && c.ambigua) return { fim: true, campos: { estado: "ambigua", motivo: c.motivo || "Pode ter saído — confira no WhatsApp antes de reenviar." } };
  return { fim: true, campos: { estado: "falhou", motivo: (c && c.motivo) || textoErro || "A mensagem não foi enviada." } };
}

/** Estados em que a fila manda o item sozinha. "falhou" e "ambigua" (pode ter saído) esperam a pessoa; "enviando" já está a caminho. */
const SAI_SOZINHO = new Set(["fila", "incerto", "andamento"]);

/** Quanto falta (ms) para o item poder ser retransmitido (0 = já pode): depois de um pedido sair (enviada_em), nunca antes de 90 s —
    o primeiro pedido ainda pode estar a caminho do WhatsApp, e repetir antes disso é o que faz a mensagem chegar em dobro. */
export function esperaReenvioFila(item, agora = Date.now()) {
  const em = Number(item && item.enviada_em) || 0;
  return em ? Math.max(0, em + FILA_ESPERA_REENVIO_MS - agora) : 0;
}

/** Quando o item sai de novo (ms): o maior entre o backoff e os 90 s desde o último pedido. */
export function proximaSaidaFila(item) {
  const em = Number(item && item.enviada_em) || 0;
  return Math.max(Number(item && item.proxima_em) || 0, em ? em + FILA_ESPERA_REENVIO_MS : 0);
}

/** Itens da fila prontos para sair agora, na ordem em que a pessoa mandou. `forcar` (a internet voltou) ignora o backoff,
    mas NUNCA os 90 s desde o último pedido do mesmo item. */
export function filaDevidos(itens, agora = Date.now(), { forcar = false } = {}) {
  return (itens || []).filter(x => x && SAI_SOZINHO.has(x.estado) && (forcar || !(Number(x.proxima_em) > agora)) && esperaReenvioFila(x, agora) === 0)
    .sort((a, b) => (Number(a.criada_em) || 0) - (Number(b.criada_em) || 0));
}

/** Item que ainda sairia sozinho mas está parado há mais de 15 min: não sai mais sem a pessoa pedir (nada de mensagem de sexta chegando na segunda). */
export function filaParada(item, agora = Date.now()) {
  return !!item && SAI_SOZINHO.has(item.estado) && agora - (Number(item.criada_em) || 0) > FILA_AUTO_MAX_MS;
}

/** "Ficou na fila desde hoje às 14:02" · "…ontem às 18:02" · "…sex. às 18:02" · "…25/09 às 18:02". */
export function motivoFilaParada(criadaEm, agora = new Date()) {
  const t = Number(criadaEm);
  if (!Number.isFinite(t) || t <= 0) return "Ficou na fila sem ser enviada";
  const dif = Math.round((Date.parse(diaSP(agora)) - Date.parse(diaSP(t))) / 86400000);
  const dia = dif <= 0 ? "hoje" : dif === 1 ? "ontem" : dif < 7 ? _fmtSem.format(new Date(t)) : _fmtCurta.format(new Date(t));
  return `Ficou na fila desde ${dia} às ${_fmtHora.format(new Date(t))}`;
}

/** O que fazer com um item guardado ao abrir a fila: "usar" (desta conta e desta empresa), "apagar" (desta conta e empresa, parado há mais
    de 7 dias) ou "pular" (de outra conta ou empresa: fica onde está, é de quem o escreveu — nunca se apaga o que é de outro escopo). */
export function filaDestino(item, { conta, cliente, agora = Date.now() } = {}) {
  if (!item || !item.id) return "pular";
  if (item.conta !== conta || item.cliente !== cliente) return "pular";
  return agora - (Number(item.criada_em) || 0) > FILA_TTL_MS ? "apagar" : "usar";
}

/** Texto da bolha que espera na fila: o motivo real (internet, servidor ocupado, sessão) e a hora da próxima tentativa, quando há. */
export function textoFila({ estado, motivo, proxima } = {}, agora = Date.now()) {
  const hora = Number(proxima) > agora ? ` · nova tentativa às ${horaMsg(Number(proxima))}` : "";
  if (estado === "incerto") return `Sem resposta do servidor · tentando de novo (nada sai em dobro)${hora}`;
  const m = String(motivo || "").trim();
  if (!m || /^sem internet/i.test(m)) return "Na fila · envia quando a internet voltar";
  if (/sessão/i.test(m)) return m;
  return `Na fila · ${m.replace(/:\s*tentando de novo\.?$/i, "").replace(/\.$/, "")}${hora}`;
}

/** "Rascunho:" da lista: uma linha só, no máximo 80 caracteres. */
export function textoRascunhoLista(texto, max = 80) {
  const t = String(texto ?? "").replace(/\s+/g, " ").trim();
  if (!t) return "";
  return t.length > max ? `${t.slice(0, max - 1).trimEnd()}…` : t;
}

/* ------------------------------------------------------------ assistente do número CodeWords (M33): passo atual a partir do estado do servidor */
export const PASSOS_CODEWORDS = Object.freeze([
  { id: "chave", rotulo: "Chave salva" },
  { id: "parear", rotulo: "Parear o aparelho" },
  { id: "conferir", rotulo: "Conferir o recebimento" },
  { id: "destino", rotulo: "Quem atende primeiro" },
  { id: "teste", rotulo: "Mensagem de teste" },
]);

/**
 * Situação do canal CodeWords: [rótulo, tom] — "Conectado" · "Desconectado" · "Conectado mas sem receber" · "Aguardando confirmação"
 * (antes "Não sei"). `estado` é a resposta viva de nx-codewords/estado (quando já foi consultada nesta tela); senão vale o que o banco guardou.
 */
export function situacaoCodeWords(canal, estado = null) {
  const cw = (canal && canal.codewords) || {};
  const s = estado || null;
  if (s) {
    if (s.inscrito_certo) return ["Conectado", "ok"];
    if (!s.pareado || s.conectado === false) return ["Desconectado", "ruim"];
    if (s.pareado && s.conectado && (s.numero_confere !== true || s.rota_atual !== s.rota_esperada)) return ["Conectado mas sem receber", "aten"];
  }
  if (cw.conectado === false && cw.phone_id) return ["Desconectado", "ruim"];
  if (cw.conectado === true) {
    if (cw.numero_conferido === false) return ["Conectado mas sem receber", "aten"];
    if (cw.numero_conferido === true) {
      const rotaOk = cw.rota === "direta"
        ? String(cw.inscricao || "").includes("URL deste canal")
        : !!cw.service_id && String(cw.inscricao || "").startsWith(cw.service_id);
      return rotaOk ? ["Conectado", "ok"] : ["Conectado mas sem receber", "aten"];
    }
  }
  return ["Aguardando confirmação", "neutra"];
}

/**
 * passosCodeWords({canal, estado, testeEnviado, testeChegou, aguardandoCodigo}) → {passos, atual}
 *  passos[i] = {id, rotulo, feito, estado: "feito"|"atual"|"futuro", texto}; atual = 1..5 (o 1º passo não feito) ou 6 (tudo pronto).
 *  Um passo só vale se os anteriores valem: sem chave não há aparelho; sem aparelho não há recebimento a conferir, etc.
 */
export function passosCodeWords({ canal = null, estado = null, testeEnviado = false, testeChegou = false, aguardandoCodigo = false } = {}) {
  const cw = (canal && canal.codewords) || {};
  const [sit] = situacaoCodeWords(canal, estado);
  const temCanal = !!(canal && canal.id);
  const f1 = temCanal && !!cw.tem_api_key;
  const tudoOk = !!(estado && estado.inscrito_certo === true);      // o servidor já confirmou aparelho, número e destino
  const f2 = f1 && (tudoOk || (estado && estado.pareado !== undefined ? !!estado.pareado && estado.conectado !== false : cw.conectado === true));
  const f3 = f2 && (tudoOk || (estado && estado.numero_confere !== undefined ? estado.numero_confere === true : cw.numero_conferido === true));
  const f4 = f3 && sit === "Conectado";
  const f5 = f4 && !!testeChegou;
  const feitos = [f1, f2, f3, f4, f5];
  const atual = feitos.indexOf(false) === -1 ? 6 : feitos.indexOf(false) + 1;
  const rotaTxt = cw.rota === "direta" ? "Recebendo direto na caixa Conversas" : cw.service_id ? "A IA atende primeiro" : "";
  const textos = [
    f1 ? "Chave guardada com segurança" : "Cole a chave do CodeWords para começar",
    f2 ? "Aparelho pareado" : aguardandoCodigo ? "Aguardando você ler o código no celular…" : "Gere o código e digite no WhatsApp do celular",
    f3 ? "O número do aparelho confere" : f2 ? (sit === "Aguardando confirmação" ? "Aguardando confirmação do aparelho…" : "Conferindo se as mensagens chegam ao Órbita…") : "Depois de parear",
    f4 ? rotaTxt || "Destino das mensagens configurado" : f3 ? "Escolha quem responde primeiro" : "Depois de conferir o número",
    f5 ? "Mensagem de teste entregue" : testeEnviado ? "Enviada — confirme se chegou no WhatsApp" : f4 ? "Mande uma mensagem de teste para o número conectado" : "Por último",
  ];
  return { atual, passos: PASSOS_CODEWORDS.map((p, i) => ({ ...p, feito: feitos[i], estado: feitos[i] ? "feito" : atual === i + 1 ? "atual" : "futuro", texto: textos[i] })) };
}

/** Marcos de um número da Meta (os mesmos 3 do CodeWords: chave, recebimento, destino): token · app inscrito · modelos sincronizados. */
export function marcosMeta(canal, modelos = 0) {
  const c = canal || {};
  return [
    { id: "token", rotulo: "Token salvo", feito: c.tem_token === true },
    { id: "inscrito", rotulo: "App inscrito", feito: c.app_inscrito === true },
    { id: "modelos", rotulo: Number(modelos) > 0 ? `${modelos} ${Number(modelos) === 1 ? "modelo sincronizado" : "modelos sincronizados"}` : "Modelos sincronizados", feito: Number(modelos) > 0 },
  ];
}

/* ============================================================ M35 — central de conversas por teclado */
/** Os acordes da central. Dentro de campo só valem os com Alt (+Shift): Alt+Shift+letra evita o AltGr do ABNT2 (que chega como Ctrl+Alt). */
export const ACORDES = Object.freeze([
  { id: "atender", teclas: "Alt+Shift+P", rotulo: "Atender o próximo (a que espera há mais tempo)", grupo: "Atender", dentroDeCampo: true },
  { id: "proxima", teclas: "Alt+↓", rotulo: "Próxima conversa", grupo: "Atender", dentroDeCampo: true },
  { id: "anterior", teclas: "Alt+↑", rotulo: "Conversa anterior", grupo: "Atender", dentroDeCampo: true },
  { id: "assumir", teclas: "Alt+Shift+A", rotulo: "Assumir a conversa", grupo: "Atender", dentroDeCampo: true },
  { id: "resolver", teclas: "Alt+Shift+R", rotulo: "Resolver (com Desfazer)", grupo: "Atender", dentroDeCampo: true },
  { id: "nota", teclas: "Alt+Shift+N", rotulo: "Nota interna", grupo: "Atender", dentroDeCampo: true },
  { id: "transferir", teclas: "Alt+Shift+T", rotulo: "Transferir", grupo: "Atender", dentroDeCampo: true },
  { id: "foco_lista", teclas: "Esc", rotulo: "No campo de mensagem: voltar o foco à lista", grupo: "Na lista", dentroDeCampo: true },
  { id: "mover_baixo", teclas: "J", rotulo: "Descer na lista (Enter abre)", grupo: "Na lista", dentroDeCampo: false },
  { id: "mover_cima", teclas: "K", rotulo: "Subir na lista", grupo: "Na lista", dentroDeCampo: false },
  { id: "buscar", teclas: "/", rotulo: "Buscar conversas", grupo: "Na lista", dentroDeCampo: false },
  { id: "ajuda", teclas: "?", rotulo: "Mostrar esta folha", grupo: "Na lista", dentroDeCampo: false },
]);
export const ANUNCIO_INTERVALO_MS = 10000;

/**
 * Que comando um keydown pede (ou null). Só olha o evento: `emCampo` diz se o foco está num campo de texto.
 *   Alt+↓ / Alt+↑ → proxima / anterior · Alt+Shift+A/R/N/T/P → assumir / resolver / nota / transferir / atender.
 *   Sem modificador e FORA de campo: j / k / / / ? . Ctrl ou Meta junto (AltGr do ABNT2 chega como Ctrl+Alt) nunca dispara.
 */
export function acordeDoEvento(ev, { emCampo = false } = {}) {
  if (!ev || ev.isComposing || ev.ctrlKey || ev.metaKey) return null;
  try { if (typeof ev.getModifierState === "function" && ev.getModifierState("AltGraph")) return null; } catch { /* ok */ }
  const k = String(ev.key || ""), cod = String(ev.code || "");
  if (ev.altKey) {
    if (!ev.shiftKey) return k === "ArrowDown" ? "proxima" : k === "ArrowUp" ? "anterior" : null;
    const letra = /^Key[A-Z]$/.test(cod) ? cod.slice(3).toLowerCase() : k.toLowerCase();     // no Mac Alt+letra muda o caractere: o código físico vale mais
    return { a: "assumir", r: "resolver", n: "nota", t: "transferir", p: "atender" }[letra] || null;
  }
  if (emCampo) return null;
  if (k === "j") return "mover_baixo";
  if (k === "k") return "mover_cima";
  if (k === "/") return "buscar";
  if (k === "?") return "ajuda";
  return null;
}

/** Id da conversa seguinte (dir > 0) ou anterior (dir < 0) na lista; sem conversa aberta, a primeira (ou a última). null no fim da lista. */
export function proximaConversa(itens, selId, dir) {
  const lista = (itens || []).filter(c => c && !c.oculta);
  if (!lista.length) return null;
  const i = lista.findIndex(c => c.id === selId);
  if (i < 0) return (dir > 0 ? lista[0] : lista[lista.length - 1]).id;
  const j = i + (dir > 0 ? 1 : -1);
  return j >= 0 && j < lista.length ? lista[j].id : null;
}

/** A conversa que espera resposta há mais tempo e que a pessoa pode atender: aberta, aguardando, sem dono ou dela. */
export function proximaParaAtender(itens, eu) {
  const t = c => { const n = ms(c.ultima_entrada_em); return Number.isFinite(n) ? n : Infinity; };
  const cand = (itens || []).filter(c => c && c.status === "aberta" && c.aguardando && !c.oculta && (!c.atribuida_a || c.atribuida_a === eu));
  cand.sort((a, b) => (t(a) === t(b) ? 0 : t(a) < t(b) ? -1 : 1) || Number(a.id) - Number(b.id));
  return cand[0] || null;
}

/** Para onde ir depois de resolver `id`: a seguinte na lista (ou, no fim dela, a anterior), sem as já resolvidas (salvo na aba Resolvidas). */
export function proximaAposResolver(itens, id, { aba } = {}) {
  const lista = (itens || []).filter(c => c && !c.oculta);
  const i = lista.findIndex(c => c.id === id);
  const serve = c => c.id !== id && (aba === "resolvidas" || c.status !== "resolvida");
  return lista.slice(i + 1).find(serve) || lista.slice(0, Math.max(i, 0)).reverse().find(serve) || null;
}

/** Conversas em que chegou mensagem do cliente desde a lista anterior (a aberta fica de fora: quem a lê já viu). */
export function novasEntradas(antes, depois, { ignorar = null } = {}) {
  const mapa = new Map((antes || []).map(x => [x.id, x]));
  return (depois || []).filter(c => c.ultima_msg_dir === "in" && !c.oculta && c.id !== ignorar
    && (Number(c.nao_lidas) || 0) > (Number((mapa.get(c.id) || {}).nao_lidas) || 0));
}

/** "Nova mensagem de Mariana, aguardando há 3 min" (uma) ou "2 conversas com mensagem nova, a primeira de Mariana" (várias). */
export function textoNovaMensagem(lista, agora = new Date()) {
  const quem = c => (c.contato && c.contato.nome && String(c.contato.nome).trim()) || "um contato";
  if (!lista || !lista.length) return "";
  if (lista.length > 1) return `${lista.length} conversas com mensagem nova, a primeira de ${quem(lista[0])}`;
  const c = lista[0];
  const espera = c.status === "aberta" && c.aguardando && c.ultima_entrada_em ? tempoEspera(c.ultima_entrada_em, agora) : "";
  return espera && espera !== "agora" ? `Nova mensagem de ${quem(c)}, aguardando há ${espera}` : `Nova mensagem de ${quem(c)}`;
}

/** Quanto falta (ms) para a lista poder anunciar de novo: 0 = já pode. No máximo 1 anúncio a cada 10 s. */
export function esperaAnuncio(ultimoEm, agora = Date.now(), intervalo = ANUNCIO_INTERVALO_MS) {
  if (!ultimoEm) return 0;
  return Math.max(0, intervalo - (agora - ultimoEm));
}

/* ============================================================ Plano 50 (04/10/2026) — frente D · Conversas
   Regras puras das melhorias visuais do chat, da lista, da lateral e do composer. Tudo testável em Node. */

/* ---------- 31. bolhas agrupadas: cauda só na última do grupo · «Mensagens novas» ---------- */
/** Marca `cauda` nas linhas de mensagem: a última de um grupo colado (a seguinte não é `junta`). Devolve a MESMA lista. */
export function marcarCaudas(linhas) {
  const msgs = (linhas || []).filter(l => l && l.tipo === "msg");
  for (let i = 0; i < msgs.length; i++) msgs[i].cauda = !(msgs[i + 1] && msgs[i + 1].junta);
  return linhas;
}

/** Id da primeira mensagem não lida: a N-ésima mensagem do cliente de trás para a frente (N = nao_lidas). null sem não lidas. */
export function primeiraNaoLida(msgs, naoLidas) {
  const n = Number(naoLidas) || 0;
  if (n <= 0) return null;
  const entradas = (msgs || []).filter(m => m && m.direcao === "in" && m.tipo !== "sistema" && !ehLocal(m.id));
  const m = entradas[Math.max(0, entradas.length - n)];
  return m ? m.id : null;
}

/**
 * Põe o separador «Mensagens novas» antes da mensagem `id` (quando ela está nas linhas). Devolve lista nova.
 * O chat chama ANTES de agruparMidia/agruparSistema (o separador fecha a grade); se receber linhas já agrupadas,
 * acha o id dentro da grade de fotos ou do bloco do sistema e põe o separador antes do grupo, em vez de sumir.
 */
export function inserirNovas(linhas, id) {
  if (id === null || id === undefined) return linhas;
  const alvo = String(id);
  const contem = l => {
    if (!l) return false;
    if (l.tipo === "msg") return !!l.msg && String(l.msg.id) === alvo;
    if (l.tipo === "grade" || l.tipo === "sistema_grupo") return (l.msgs || []).some(m => m && String(m.id) === alvo);
    return false;
  };
  const i = (linhas || []).findIndex(contem);
  if (i < 0) return linhas;
  const out = linhas.slice();
  out.splice(i, 0, { tipo: "novas", chave: "novas" });
  return out;
}

/** Quantas mensagens do cliente chegaram depois de `desdeId` (a pílula «Novas mensagens ↓» mostra o número). */
export function contarNovasEntradas(msgs, desdeId) {
  const base = Number(desdeId) || 0;
  return (msgs || []).filter(m => m && m.direcao === "in" && !ehLocal(m.id) && Number(m.id) > base).length;
}

/* ---------- 32. mídia em grade · áudio ---------- */
/** Foto «limpa» que pode entrar numa grade: gravada, sem legenda, sem citação, sem reação, com arquivo. */
export function entraNaGrade(m) {
  if (!m || m.tipo !== "imagem" || m.local || m.status === "falhou") return false;
  if (m.corpo || m.responde_a || m.reacao) return false;
  const md = m.midia || {};
  return !!(md.path || md.local_url) && (md.estado || "ok") === "ok";
}

/** Fotos seguidas e coladas (mesmo remetente, até 5 min) viram UMA linha {tipo:"grade", msgs}; sozinhas continuam bolha. */
export function agruparMidia(linhas, { minimo = 2, maximo = 6 } = {}) {
  const out = [];
  let grupo = null;
  const fechar = () => {
    if (!grupo) return;
    if (grupo.length >= minimo) {
      out.push({ tipo: "grade", chave: `g-${grupo[0].msg.id}`, msgs: grupo.map(l => l.msg), junta: !!grupo[0].junta, cauda: grupo[grupo.length - 1].cauda !== false });
    } else out.push(...grupo);
    grupo = null;
  };
  for (const l of linhas || []) {
    const cand = l && l.tipo === "msg" && entraNaGrade(l.msg);
    if (cand && grupo && l.junta && grupo.length < maximo) { grupo.push(l); continue; }
    fechar();
    if (cand) { grupo = [l]; continue; }
    out.push(l);
  }
  fechar();
  return out;
}

/** As fotos da conversa (para o visualizador andar com as setas), na ordem das mensagens. */
export function imagensDaConversa(msgs) {
  return (msgs || []).filter(m => m && m.tipo === "imagem" && m.midia && (m.midia.path || m.midia.local_url) && (m.midia.estado || "ok") === "ok")
    .map(m => ({ id: m.id, path: m.midia.path || null, local_url: m.midia.local_url || null, nome: m.midia.nome || null, legenda: m.corpo || "", criado_em: m.criado_em, direcao: m.direcao }));
}

export const VELOCIDADES_AUDIO = Object.freeze([1, 1.5, 2]);
/** 1 → 1,5 → 2 → 1 (valor desconhecido volta a 1). */
export function proximaVelocidade(v) {
  const i = VELOCIDADES_AUDIO.indexOf(Number(v));
  return VELOCIDADES_AUDIO[(i + 1) % VELOCIDADES_AUDIO.length];
}
export function velocidadeValida(v) { const n = Number(v); return VELOCIDADES_AUDIO.includes(n) ? n : 1; }
/** "1×" · "1,5×" · "2×" */
export function rotuloVelocidade(v) { return `${String(velocidadeValida(v)).replace(".", ",")}×`; }
/** 65 → "1:05"; 3725 → "1:02:05"; sem número → "–:––". */
export function formatarDuracao(seg) {
  const s = Number(seg);
  if (!Number.isFinite(s) || s < 0) return "–:––";
  const t = Math.round(s), hh = Math.floor(t / 3600), mm = Math.floor((t % 3600) / 60), ss = t % 60;
  const p2 = n => String(n).padStart(2, "0");
  return hh ? `${hh}:${p2(mm)}:${p2(ss)}` : `${mm}:${p2(ss)}`;
}

/** Grupo visual do documento pela extensão (cor do ícone): pdf · texto · planilha · slides · outro. */
export function grupoDocumento(nome, mime = "") {
  const ext = String(nome || "").toLowerCase().split(".").pop();
  const m = String(mime || "").toLowerCase();
  if (ext === "pdf" || m === "application/pdf") return "pdf";
  if (["xls", "xlsx", "csv"].includes(ext) || /spreadsheet|ms-excel|csv/.test(m)) return "planilha";
  if (["ppt", "pptx"].includes(ext) || /presentation|powerpoint/.test(m)) return "slides";
  if (["doc", "docx", "txt", "rtf"].includes(ext) || /wordprocessing|msword|text\/plain/.test(m)) return "texto";
  return "outro";
}

/* ---------- 34. lista: tipo da última mensagem · SLA de espera ---------- */
const TIPO_POR_RESUMO = Object.freeze({ Foto: "imagem", "Áudio": "audio", "Vídeo": "video", Documento: "documento", Figurinha: "sticker",
  "Localização": "localizacao", Contato: "contato", Modelo: "template" });
/** O servidor só manda o resumo ("Foto", "Áudio: …"): deduz o tipo para o ícone da linha. null = texto comum. */
export function tipoDoResumo(resumo) {
  const m = /^(Foto|Áudio|Vídeo|Documento|Figurinha|Localização|Contato|Modelo)(?=:|$)/.exec(String(resumo || "").trim());
  return m ? TIPO_POR_RESUMO[m[1]] || null : null;
}

export const SLA_MINUTOS = Object.freeze({ aten: 15, ruim: 30, critico: 60 });
/** Quanto o cliente espera e em que faixa: ok (< 15 min) · aten (15–29) · ruim (30–59) · critico (60+). */
export function nivelEspera(desde, agora = new Date()) {
  const d = ms(agora) - ms(desde);
  if (!Number.isFinite(d)) return { minutos: 0, nivel: "ok" };
  const minutos = Math.max(0, Math.floor(d / 60000));
  const nivel = minutos >= SLA_MINUTOS.critico ? "critico" : minutos >= SLA_MINUTOS.ruim ? "ruim" : minutos >= SLA_MINUTOS.aten ? "aten" : "ok";
  return { minutos, nivel };
}

/** Fração restante da janela de 24 h (0–1), para a barrinha sob a pílula. */
export function fracaoJanela(j) {
  if (!j || !j.aberta) return 0;
  return Math.max(0, Math.min(1, (Number(j.restanteMs) || 0) / JANELA_MS));
}

/* ---------- 35. lateral: resumo do contato · interações por dia ---------- */
/** Contadores do painel lateral a partir do que nx_cv_ver já devolve (negócios abertos e valor, atendimentos, tarefas). */
export function resumoContato(ver) {
  const negs = (ver && ver.negocios) || [];
  const abertos = negs.filter(n => n && (!n.status || n.status === "aberto"));
  const tarefas = (ver && ver.tarefas) || [];
  return { negocios: abertos.length, valor: abertos.reduce((s, n) => s + (Number(n.valor_previsto) || 0), 0),
    atendimentos: ((ver && ver.atendimentos) || []).length, tarefas: tarefas.length, atrasadas: tarefas.filter(t => t && t.atrasada).length };
}

/** Mensagens (sem sistema/nota) por dia nos últimos `dias`, a partir das mensagens CARREGADAS: [{dia, rotulo, entrada, saida}]. */
export function interacoesPorDia(msgs, agora = new Date(), dias = 7) {
  const base = Date.parse(`${diaSP(agora)}T12:00:00-03:00`);
  const out = [], idx = new Map();
  for (let k = dias - 1; k >= 0; k--) {
    const d = new Date(base - k * 86400000), dia = diaSP(d);
    idx.set(dia, out.length);
    out.push({ dia, rotulo: _fmtSem.format(d).replace(".", "").slice(0, 3), entrada: 0, saida: 0 });
  }
  for (const m of msgs || []) {
    if (!m || m.tipo === "sistema" || m.tipo === "nota") continue;
    const i = idx.get(diaSP(m.criado_em));
    if (i === undefined) continue;
    if (m.direcao === "in") out[i].entrada++; else out[i].saida++;
  }
  return out;
}

/* ---------- 36. respostas rápidas: variáveis destacadas · próximo {campo} ---------- */
/**
 * Segmentos do corpo com as variáveis marcadas (a prévia pinta cada tipo): texto · var (preenchida) · pendente ({campo} que a pessoa completa).
 * A concatenação dos `t` é IGUAL a aplicarVariaveis(corpo, vars) — inclusive a vírgula que some com a variável vazia.
 */
export function partesVariaveis(corpo, vars = {}) {
  const v = { primeiro_nome: vars.primeiro_nome ?? primeiroNome(vars.nome), nome: vars.nome ?? "", atendente: vars.atendente ?? "", empresa: vars.empresa ?? "", protocolo: vars.protocolo ?? "" };
  const s = String(corpo ?? "");
  const re = /\{([^{}\n]+)\}/g;
  const out = [];
  let i = 0, m;
  const texto = t => { if (!t) return; const u = out[out.length - 1]; if (u && u.tipo === "texto") u.t += t; else out.push({ t, tipo: "texto" }); };
  while ((m = re.exec(s))) {
    texto(s.slice(i, m.index));
    const k = m[1];
    if (VARIAVEIS.includes(k)) {
      const val = String(v[k] ?? "").trim();
      if (val) out.push({ t: val, tipo: "var", nome: k });
      else { const u = out[out.length - 1]; if (u && u.tipo === "texto") { u.t = u.t.replace(/(,\s*|\s+)$/, ""); if (!u.t) out.pop(); } }
    } else out.push({ t: m[0], tipo: "pendente" });
    i = m.index + m[0].length;
  }
  texto(s.slice(i));
  return out;
}

/** Próximo {campo a preencher} a partir de `desde` ([ini, fim]); dir < 0 volta; dá a volta no fim; null sem campos. */
export function proximoCampo(texto, desde = 0, dir = 1) {
  const s = String(texto ?? "");
  const re = /\{[^{}\n]+\}/g;
  const todos = [];
  let m;
  while ((m = re.exec(s))) todos.push([m.index, m.index + m[0].length]);
  if (!todos.length) return null;
  if (dir >= 0) return todos.find(([a]) => a >= desde) || todos[0];
  return todos.slice().reverse().find(([a]) => a < desde) || todos[todos.length - 1];
}
export function contarCampos(texto) { return (String(texto ?? "").match(/\{[^{}\n]+\}/g) || []).length; }

/* ---------- 37. linha do tempo do sistema (IA, transferências…) ---------- */
/** Mensagens de sistema seguidas (≥ minimo) viram UMA linha {tipo:"sistema_grupo", msgs}; a solta continua como está. */
export function agruparSistema(linhas, { minimo = 2 } = {}) {
  const out = [];
  let grupo = null;
  const fechar = () => {
    if (!grupo) return;
    if (grupo.length >= minimo) out.push({ tipo: "sistema_grupo", chave: `s-${grupo[0].msg.id}`, msgs: grupo.map(l => l.msg) });
    else out.push(...grupo);
    grupo = null;
  };
  for (const l of linhas || []) {
    if (l && l.tipo === "msg" && l.msg && l.msg.tipo === "sistema") { (grupo || (grupo = [])).push(l); continue; }
    fechar();
    out.push(l);
  }
  fechar();
  return out;
}

/** Ícone de um evento do sistema pelo texto (IA, transferência, resolvido, atribuição…). */
export function iconeSistema(texto) {
  const t = semAcento(texto);
  if (/\bia\b|assistente|codewords|pausad|retomou|retomad/.test(t)) return "ia";
  if (/transfer|departamento/.test(t)) return "transferir";
  if (/reabert|reabriu/.test(t)) return "reabrir";
  if (/resolvid|encerr|finaliz/.test(t)) return "check";
  if (/atribu|assumiu|responsavel/.test(t)) return "usuario";
  if (/etiqueta/.test(t)) return "etiqueta";
  if (/automac/.test(t)) return "raio";
  if (/ocult|bloque/.test(t)) return "alerta";
  return "info";
}

/** "3 eventos do sistema" · "4 eventos do sistema · 2 da IA" */
export function resumoGrupoSistema(msgs) {
  const n = (msgs || []).length;
  const ia = (msgs || []).filter(m => iconeSistema(m && m.corpo) === "ia").length;
  return `${n} ${n === 1 ? "evento" : "eventos"} do sistema${ia ? ` · ${ia} da IA` : ""}`;
}

/* ---------- 38. barra de ações: atalho de cada comando ---------- */
export function atalhoDe(id) { const a = ACORDES.find(x => x.id === id); return a ? a.teclas : ""; }
/** "Alt+Shift+A" → "Alt+Shift+A" (aria-keyshortcuts usa os nomes das teclas: ↓/↑ viram ArrowDown/ArrowUp). */
export function ariaKeyshortcuts(teclas) {
  return String(teclas || "").split("+").map(t => ({ "↓": "ArrowDown", "↑": "ArrowUp", Esc: "Escape" }[t] || t)).join("+");
}

/* ============================================================ Plano 100 (08/10/2026) — frente D · Conversas
   Regras puras da rodada: RPC nova por detecção, páginas da lista no pulso, teto do texto com assinatura, telefone da «Nova
   conversa», fila entre abas, rastreio na lateral, «Enviar agora» com motivo e a pílula do modelo de marketing. */

/** O servidor ainda não conhece a função COM estes parâmetros (PostgREST 404 · PGRST202): a migração nova não está no ar. */
export function rpcAusente(e) {
  if (!e) return false;
  const c = String(e.codigo || e.code || e.message || "");
  const r = e.resposta && typeof e.resposta === "object" ? e.resposta : null;
  return Number(e.status) === 404 || /PGRST202|could not find the function|function .* does not exist/i.test(c)
    || String((r && r.code) || "").toUpperCase() === "PGRST202";
}

/* ---------- D6. lista: o pulso relê a 1ª página e as páginas seguintes já carregadas ficam ---------- */
/** A ordem do nx_cv_listar: Aguardando sem busca = quem espera há mais tempo primeiro (nulos no fim); senão a mais recente primeiro
    (no Postgres, «desc» põe os nulos na frente) e, no empate, o id maior. */
export function compararLista(a, b, { aguardando = false } = {}) {
  if (aguardando) {
    const ta = ms(a && a.ultima_entrada_em), tb = ms(b && b.ultima_entrada_em);
    const fa = Number.isFinite(ta), fb = Number.isFinite(tb);
    if (fa !== fb) return fa ? -1 : 1;
    if (fa && ta !== tb) return ta - tb;
  }
  const ma = ms(a && a.ultima_msg_em), mb = ms(b && b.ultima_msg_em);
  const va = Number.isFinite(ma) ? ma : Infinity, vb = Number.isFinite(mb) ? mb : Infinity;
  if (va !== vb) return vb > va ? 1 : -1;
  return (Number(b && b.id) || 0) - (Number(a && a.id) || 0);
}
/** Página nova (1ª) + o que já estava carregado DEPOIS dela: «Carregar mais» não é desfeito pelo pulso. Sem `temMais` a 1ª página é a
    lista inteira (o resto sumiu de verdade). Devolve {itens, preservadas}. */
export function mesclarPaginaLista(antigos, frescos, { temMais = false, aguardando = false } = {}) {
  const novos = (frescos || []).filter(Boolean);
  if (!temMais || !novos.length) return { itens: novos, preservadas: 0 };
  const ids = new Set(novos.map(c => c.id));
  const ultima = novos[novos.length - 1];
  const resto = (antigos || []).filter(c => c && !ids.has(c.id) && compararLista(c, ultima, { aguardando }) > 0);
  return { itens: [...novos, ...resto], preservadas: resto.length };
}

/* ---------- D14. texto com assinatura: o teto efetivo é o do nx-enviar ---------- */
export const LIMITE_TEXTO = 4096;
/** Quanto texto cabe: 4096 menos a assinatura «*Nome:*\n» que o servidor põe na frente quando a empresa liga (cfg.assinatura) — a
    MESMA conta do nx-enviar (1ª palavra do nome de quem envia). */
export function tetoTexto({ assinatura = false, nome = "" } = {}) {
  const p = String(nome ?? "").trim().split(/\s+/)[0] || "";
  return assinatura && p ? LIMITE_TEXTO - `*${p}:*\n`.length : LIMITE_TEXTO;
}
/** Emoji e alguns símbolos contam 2 no limite do WhatsApp (unidades UTF-16): quantos o texto tem. */
export function contarDuplos(texto) { return (String(texto ?? "").match(/[\uD800-\uDBFF][\uDC00-\uDFFF]/g) || []).length; }
/** «86 caracteres restantes» (+ «· emoji conta 2» quando há emoji no texto). */
export function textoContador(restantes, duplos = 0) {
  const r = Math.max(0, Number(restantes) || 0);
  return `${r} caractere${r === 1 ? "" : "s"} restante${r === 1 ? "" : "s"}${duplos > 0 ? " · emoji conta 2" : ""}`;
}

/* ---------- D13. telefone digitado em «Nova conversa» ---------- */
const DDD_VALIDO = /^(1[1-9]|2[124789]|3[1-578]|4[1-9]|5[13-5]|6[1-9]|7[13-579]|8[1-9]|9[1-9])$/;   // nx_ddd_valido (20261008a)
/** Máscara: número do Brasil vira «(12) 99999-9999» enquanto a pessoa digita; com «+» ou «00» (outro país), com zero na frente e com
    mais de 11 dígitos (já com o 55) fica como foi digitado — a máscara nunca muda o número. */
export function mascaraTelefone(txt) {
  const s = String(txt ?? "");
  if (/^\s*(\+|00)/.test(s)) return s;
  const d = soDigitos(s);
  if (!d || d.length > 11 || d[0] === "0") return s;
  if (d.length <= 2) return `(${d}`;
  const local = d.slice(2);
  const corte = d.length === 11 ? 5 : 4;
  return local.length <= corte ? `(${d.slice(0, 2)}) ${local}` : `(${d.slice(0, 2)}) ${local.slice(0, corte)}-${local.slice(corte)}`;
}
/** Erro do telefone (texto para o campo) ou "" quando vale — a regra do nx_tel_normalizar (20261008a): «+»/«00» = 8–15 dígitos como
    está; sem «+», zero de tronco sai e 10–11 dígitos só valem com DDD do Brasil (11 dígitos: o 3º é o 9 do celular); 12–15 como está. */
export function erroTelefone(txt) {
  const s = String(txt ?? "").trim();
  if (!s) return "Digite o telefone com DDD.";
  if (/^(\+|00)/.test(s)) {
    const d = soDigitos(s.replace(/^(\+|00)/, ""));
    return d.length >= 8 && d.length <= 15 ? "" : "Número de outro país: código do país e o número, de 8 a 15 dígitos (ex.: +1 415 555 1234).";
  }
  let d = soDigitos(s);
  if (d[0] === "0" && (d.length === 11 || d.length === 12) && d[1] !== "0") d = d.slice(1);
  if (d.length < 10) return `Faltam números: o DDD e o telefone têm 10 ou 11 dígitos (você digitou ${d.length}).`;
  if (d.length <= 11) {
    if (!DDD_VALIDO.test(d.slice(0, 2))) return `DDD ${d.slice(0, 2)} não existe no Brasil. Número de outro país: comece com + e o código do país.`;
    if (d.length === 11 && d[2] !== "9") return "Celular com 11 dígitos começa com 9 depois do DDD. Confira o número.";
    if (d.length === 10 && d[2] < "2") return "Telefone fixo começa com 2 a 9 depois do DDD. Confira o número.";
    return "";
  }
  return d.length <= 15 ? "" : "Número longo demais: no máximo 15 dígitos com o código do país.";
}

/* ---------- D19. fila de saída entre abas ---------- */
/** Antes de transmitir, o que está GUARDADO no IndexedDB manda (outra aba pode ter mandado ou concluído o mesmo item):
    "sumiu" (outra aba concluiu ou cancelou: só tira a bolha), "outra_aba" (outra aba pediu há menos de 90 s, ou o item já espera a
    pessoa lá) ou "ok". */
export function filaConferirGuardado(guardado, local, agora = Date.now()) {
  if (!guardado) return "sumiu";
  const em = Number(guardado.enviada_em) || 0;
  if (em && em !== (Number(local && local.enviada_em) || 0) && agora - em < FILA_ESPERA_REENVIO_MS) return "outra_aba";
  const esperaPessoa = x => !!x && (x.estado === "falhou" || x.estado === "ambigua");
  if (esperaPessoa(guardado) && !esperaPessoa(local)) return "outra_aba";
  return "ok";
}

/* ---------- D10. «Enviar agora» com motivo ---------- */
/** Por que «Enviar agora» está desligado (texto) ou "" quando pode: sem internet, ou dentro dos 90 s do último pedido do item. */
export function motivoEnviarAgora({ offline = false, espera = 0, agora = Date.now() } = {}) {
  if (offline) return "Sem internet agora: sai sozinha quando a conexão voltar.";
  if (Number(espera) > 0) return `A última tentativa ainda pode estar a caminho: pode sair às ${horaMsg(agora + Number(espera))}.`;
  return "";
}

/* ---------- D17. de onde a pessoa veio (lateral) ---------- */
function paginaCurta(p) {
  const s = String(p ?? "").trim().replace(/^https?:\/\/[^/?#]+/i, "").split(/[?#]/)[0] || "/";
  return s.length > 40 ? `${s.slice(0, 39)}…` : s;
}
/** O que o negócio sabe de onde a pessoa veio (nx_negocio_ver: origem, campanha_nome, rastreio{utm_*, pagina, clique_em}):
    {titulo, detalhe} ou null sem rastreio. «Veio do site» · «campanha «x» · página /y · clique em 08/10 14:02». */
export function linhaRastreio(n) {
  if (!n || typeof n !== "object") return null;
  const r = n.rastreio && typeof n.rastreio === "object" ? n.rastreio : null;
  if (!r && n.origem !== "site") return null;
  const partes = [];
  const camp = n.campanha_nome || (r && r.utm_campaign) || null;
  if (camp) partes.push(`campanha «${camp}»`);
  if (r && r.pagina) partes.push(`página ${paginaCurta(r.pagina)}`);
  const em = r ? ms(r.clique_em) : NaN;
  if (Number.isFinite(em)) partes.push(`clique em ${_fmtCurta.format(new Date(em))} ${_fmtHora.format(new Date(em))}`);
  const titulo = n.origem === "anuncio" ? "Veio do anúncio" : n.origem === "organico" ? "Veio de um post (orgânico)" : "Veio do site";
  return { titulo, detalhe: partes.join(" · ") };
}

/** D11: o negócio que o atalho «Agenda» da lateral leva para marcar consulta: o ligado à conversa; sem ele, o único aberto do contato. */
export function negocioParaAgenda(ver) {
  const negs = ((ver && ver.negocios) || []).filter(n => n && (!n.status || n.status === "aberto"));
  const ligado = ver && ver.conversa && ver.conversa.negocio && ver.conversa.negocio.id;
  return (ligado && negs.find(n => n.id === ligado)) || (negs.length === 1 ? negs[0] : null);
}

/** D16: dica da pílula «Marketing» dos modelos (decisão 3): só não vai para quem pediu para sair. */
export function dicaModeloMarketing(optin) {
  return optin === false ? "O contato pediu para não receber marketing: este modelo não vai para ele."
    : "Marketing: vai para todos os contatos, menos para quem pediu para sair.";
}

/** D2: uuid v4 da INTENÇÃO de uma escrita (p_req do nx_cv_nota): o mesmo valor em toda repetição dela. */
export function novoUuid() {
  const c = globalThis.crypto;
  if (c && typeof c.randomUUID === "function") return c.randomUUID();
  const b = new Uint8Array(16);
  if (c && typeof c.getRandomValues === "function") c.getRandomValues(b); else for (let i = 0; i < 16; i++) b[i] = Math.floor(Math.random() * 256);
  b[6] = (b[6] & 0x0f) | 0x40; b[8] = (b[8] & 0x3f) | 0x80;
  const x = [...b].map(v => v.toString(16).padStart(2, "0")).join("");
  return `${x.slice(0, 8)}-${x.slice(8, 12)}-${x.slice(12, 16)}-${x.slice(16, 20)}-${x.slice(20)}`;
}
