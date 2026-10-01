/* ============================================================
   ÓRBITA — crm-logica.js (PURO, sem imports) · frente F4 · ESPEC §5.3, §7.7 T5–T10
   Regras do CRM que não dependem de DOM nem de rede — os testes Node
   (testes/crm.teste.mjs) importam este arquivo direto do disco.
   - telefone: normalizarTelefone / telChave (MESMA regra de
     nx_tel_normalizar / nx_tel_chave do banco)
   - CSV: lerCSV (; , tab, aspas, quebra de linha dentro de aspas, BOM, CRLF),
     sugerirMapeamento, montarLinhas, lotes
   - kanban: ordemEntre, previsao, filtrar (local), moverLocal
   - campos personalizados: validarCampo, valorCampoTexto
   - textos: tituloCard, textoErro, textoTempo, relativoDias
   ============================================================ */

/* ------------------------------------------------------------ texto */
/** minúscula e sem acento (mesma ideia do unaccent do banco). */
export function semAcento(s) {
  return String(s ?? "").normalize("NFD").replace(/[̀-ͯ]/g, "").toLowerCase();
}

/** "Ana Maria Souza" → "AS"; "" → "?" */
export function iniciais(nome) {
  const p = String(nome || "").trim().split(/\s+/).filter(Boolean);
  if (!p.length) return "?";
  return ((p[0][0] || "") + (p.length > 1 ? p[p.length - 1][0] : (p[0][1] || ""))).toUpperCase();
}

/* ------------------------------------------------------------ telefone */
/**
 * Igual a public.nx_tel_normalizar: só dígitos. comDdi (número do WhatsApp):
 * 8–15 dígitos como está. Digitado/importado: 10–11 → prefixa 55; 12–15 como está. Fora disso → null.
 */
export function normalizarTelefone(p, comDdi = false) {
  const d = String(p ?? "").replace(/\D/g, "");
  if (comDdi) return d.length >= 8 && d.length <= 15 ? d : null;
  if (d.length >= 10 && d.length <= 11) return "55" + d;
  if (d.length >= 12 && d.length <= 15) return d;
  return null;
}

/**
 * Igual a public.nx_tel_chave: recebe o telefone JÁ normalizado. 12–13 dígitos começando
 * com 55 → tira o 55 e, se sobrar 11 com o 3º = 9, tira esse 9. Nunca acrescenta 55.
 */
export function telChave(p) {
  if (p === null || p === undefined) return null;
  const s0 = String(p);
  if (s0.length >= 12 && s0.length <= 13 && s0.startsWith("55")) {
    let s = s0.slice(2);
    if (s.length === 11 && s[2] === "9") s = s.slice(0, 2) + s.slice(3);
    return s;
  }
  return s0;
}

/** Mesma pessoa? (compara as chaves dos telefones digitados) */
export function mesmoTelefone(a, b) {
  const ka = telChave(normalizarTelefone(a)), kb = telChave(normalizarTelefone(b));
  return !!ka && ka === kb;
}

/* ------------------------------------------------------------ CSV */
const SEPARADORES = [";", ",", "\t"];

/** Conta separadores FORA de aspas numa linha (para detectar o separador). */
function contarFora(linha, sep) {
  let n = 0, dentro = false;
  for (let i = 0; i < linha.length; i++) {
    const c = linha[i];
    if (c === '"') { if (dentro && linha[i + 1] === '"') { i++; continue; } dentro = !dentro; }
    else if (!dentro && c === sep) n++;
  }
  return n;
}

/** Primeiras n linhas LÓGICAS (quebra de linha dentro de aspas não conta). */
function primeirasLinhas(s, n) {
  const out = [];
  let ini = 0, dentro = false;
  for (let i = 0; i < s.length && out.length < n; i++) {
    const c = s[i];
    if (c === '"') { if (dentro && s[i + 1] === '"') { i++; continue; } dentro = !dentro; }
    else if (!dentro && (c === "\n" || c === "\r")) {
      out.push(s.slice(ini, i));
      if (c === "\r" && s[i + 1] === "\n") i++;
      ini = i + 1;
    }
  }
  if (out.length < n && ini < s.length) out.push(s.slice(ini));
  return out;
}

/** Separador mais provável olhando as primeiras linhas (; ganha empate — padrão do Excel brasileiro). */
export function detectarSeparador(texto) {
  const linhas = primeirasLinhas(String(texto).replace(/^﻿/, ""), 12).filter(l => l.trim()).slice(0, 10);
  if (!linhas.length) return ";";
  let melhor = ";", pontos = -1;
  for (const sep of SEPARADORES) {
    const cont = linhas.map(l => contarFora(l, sep));
    const min = Math.min(...cont);
    if (min === 0) continue;
    const constante = cont.every(c => c === cont[0]);
    const p = min * 10 + (constante ? 5 : 0) + (sep === ";" ? 1 : 0);
    if (p > pontos) { pontos = p; melhor = sep; }
  }
  return melhor;
}

/**
 * lerCSV(texto, {separador?, limite?}) → {separador, cabecalho:[..], linhas:[[..]], numeros:[n], total, cortado}
 * numeros[i] = número da linha da planilha (cabeçalho = 1, contando as linhas vazias) — vai nos erros da importação.
 * RFC 4180 tolerante: aspas duplas escapadas (""), separador e quebra de linha dentro de aspas,
 * BOM, CRLF/CR/LF, linhas vazias ignoradas, colunas faltando viram "".
 */
export function lerCSV(texto, { separador, limite = 20000 } = {}) {
  let s = String(texto ?? "");
  if (s.charCodeAt(0) === 0xFEFF) s = s.slice(1);
  const sep = separador || detectarSeparador(s);
  const registros = [], nums = [];
  let campo = "", linha = [], dentro = false, i = 0, nReg = 0;
  const fimCampo = () => { linha.push(campo); campo = ""; };
  const fimLinha = () => { fimCampo(); nReg++; if (linha.some(c => c.trim() !== "")) { registros.push(linha); nums.push(nReg); } linha = []; };
  while (i < s.length) {
    const c = s[i];
    if (dentro) {
      if (c === '"') {
        if (s[i + 1] === '"') { campo += '"'; i += 2; continue; }
        dentro = false; i++; continue;
      }
      campo += c; i++; continue;
    }
    if (c === '"' && campo.trim() === "") { campo = ""; dentro = true; i++; continue; }
    if (c === sep) { fimCampo(); i++; continue; }
    if (c === "\r") { fimLinha(); i += s[i + 1] === "\n" ? 2 : 1; continue; }
    if (c === "\n") { fimLinha(); i++; continue; }
    campo += c; i++;
  }
  if (campo !== "" || linha.length) fimLinha();
  const cabecalho = (registros.shift() || []).map(h => h.trim());
  nums.shift();
  const larg = cabecalho.length;
  const total = registros.length;
  const cortado = total > limite;
  const linhas = registros.slice(0, limite).map(r => {
    const out = r.map(v => v.trim());
    while (out.length < larg) out.push("");
    return out;
  });
  return { separador: sep, cabecalho, linhas, numeros: nums.slice(0, limite), total, cortado };
}

/**
 * Célula que o Excel / Google Planilhas executaria como fórmula (começa com = + - @ tab ou CR) e não é
 * um número puro ("-5", "+5512…" continuam como estão). Nome de contato vem do perfil do WhatsApp — um
 * "=HYPERLINK(…)" ali não pode virar fórmula na planilha exportada (injeção de CSV, OWASP).
 */
function pareceFormula(s) {
  return /^[=+\-@\t\r]/.test(s) && !/^[+-]?\d+([.,]\d+)*$/.test(s);
}
/** Escapa um valor para CSV com ";" (o que o Excel brasileiro abre direto); fórmula ganha um ' na frente. */
export function csvCampo(v) {
  let s = v === null || v === undefined ? "" : String(v);
  if (pareceFormula(s)) s = `'${s}`;
  return /[";\r\n]/.test(s) || /^\s|\s$/.test(s) ? `"${s.replace(/"/g, '""')}"` : s;
}
/** Linhas → texto CSV com BOM (acentos certos no Excel). */
export function gerarCSV(cabecalho, linhas) {
  return "﻿" + [cabecalho, ...linhas].map(l => l.map(csvCampo).join(";")).join("\r\n");
}

/* ------------------------------------------------------------ mapeamento da importação */
/** Destinos fixos da importação (chaves da linha de nx_contatos_importar). */
export const DESTINOS_IMPORTACAO = Object.freeze([
  { chave: "nome", rotulo: "Nome" },
  { chave: "telefone", rotulo: "Telefone / WhatsApp" },
  { chave: "email", rotulo: "E-mail" },
  { chave: "empresa", rotulo: "Empresa" },
  { chave: "cidade", rotulo: "Cidade" },
  { chave: "uf", rotulo: "UF" },
  { chave: "nascimento", rotulo: "Nascimento" },
  { chave: "documento", rotulo: "CPF / CNPJ" },
  { chave: "obs", rotulo: "Observação" },
  { chave: "origem", rotulo: "Origem" },
  { chave: "etiquetas", rotulo: "Etiquetas (separadas por ;)" },
  { chave: "negocio_titulo", rotulo: "Título do negócio" },
  { chave: "negocio_valor", rotulo: "Valor do negócio" },
  { chave: "estagio", rotulo: "Etapa (nome)" },
]);

const SINONIMOS = [
  ["nome", ["nome", "nome completo", "cliente", "paciente", "contato", "name", "full name", "razao social"]],
  ["telefone", ["telefone", "celular", "whatsapp", "whats", "fone", "tel", "telefone 1", "celular 1", "phone", "mobile", "numero", "zap"]],
  ["email", ["email", "e-mail", "e mail", "mail", "correio eletronico"]],
  ["empresa", ["empresa", "companhia", "organizacao", "company", "convenio"]],
  ["cidade", ["cidade", "municipio", "city"]],
  ["uf", ["uf", "estado", "state"]],
  ["nascimento", ["nascimento", "data de nascimento", "data nascimento", "aniversario", "dt nascimento", "birthday", "nasc"]],
  ["documento", ["cpf", "cnpj", "cpf/cnpj", "cpf cnpj", "documento", "rg"]],
  ["obs", ["observacao", "observacoes", "obs", "nota", "notas", "anotacao", "comentario", "comentarios"]],
  ["origem", ["origem", "fonte", "canal", "source"]],
  ["etiquetas", ["etiquetas", "etiqueta", "tags", "tag", "marcadores", "grupo"]],
  ["negocio_titulo", ["titulo", "negocio", "oportunidade", "orcamento", "procedimento", "servico", "tratamento"]],
  ["negocio_valor", ["valor", "preco", "valor do negocio", "valor previsto", "ticket", "total"]],
  ["estagio", ["etapa", "estagio", "fase", "status", "situacao"]],
];

function chaveTexto(s) { return semAcento(s).replace(/[_\-./]+/g, " ").replace(/\s+/g, " ").trim(); }

/**
 * sugerirMapeamento(cabecalho, campos?) → lista (uma por coluna) de destino: chave fixa,
 * 'campo:<chave>' (campo personalizado de contato) ou null (Ignorar). Cada destino no máximo uma vez.
 */
export function sugerirMapeamento(cabecalho, campos = []) {
  const usados = new Set();
  const personal = (campos || []).filter(c => c && c.entidade === "contato");
  return (cabecalho || []).map(col => {
    const k = chaveTexto(col);
    if (!k) return null;
    let achou = null;
    for (const [dest, lista] of SINONIMOS) {
      if (usados.has(dest)) continue;
      if (lista.includes(k)) { achou = dest; break; }
    }
    if (!achou) {
      for (const c of personal) {
        const d = `campo:${c.chave}`;
        if (usados.has(d)) continue;
        if (chaveTexto(c.rotulo) === k || chaveTexto(c.chave) === k) { achou = d; break; }
      }
    }
    if (!achou) {
      for (const [dest, lista] of SINONIMOS) {
        if (usados.has(dest)) continue;
        if (lista.some(s => s.length >= 4 && (k.startsWith(s + " ") || k.endsWith(" " + s)))) { achou = dest; break; }
      }
    }
    if (achou) usados.add(achou);
    return achou;
  });
}

/** Aplica o mapeamento: linhas do CSV → linhas no formato de nx_contatos_importar. */
export function montarLinhas(linhas, mapa) {
  return (linhas || []).map(l => {
    const o = {};
    (mapa || []).forEach((dest, i) => {
      if (!dest) return;
      // o ' que o csvCampo põe na frente de "fórmula" sai na volta (exportar → importar sem perda)
      const v = (l[i] ?? "").trim().replace(/^'(?=[=+\-@])/, "");
      if (v === "") return;
      if (dest.startsWith("campo:")) { (o.campos || (o.campos = {}))[dest.slice(6)] = v; return; }
      if (o[dest] !== undefined && dest === "obs") { o.obs += " · " + v; return; }
      if (o[dest] === undefined) o[dest] = v;
    });
    return o;
  });
}

/** Problemas de uma linha montada (antes de mandar): [] = ok. Linha sem nome, telefone e e-mail → 'vazia'. */
export function checarLinha(o) {
  const erros = [];
  if (!o.nome && !o.telefone && !o.email) return ["Linha sem nome, telefone e e-mail — será ignorada"];
  if (o.telefone && !normalizarTelefone(o.telefone)) erros.push("Telefone inválido");
  if (o.email && !/^[^@\s]+@[^@\s]+\.[^@\s]+$/.test(o.email)) erros.push("E-mail inválido");
  if (o.uf && !/^[A-Za-z]{2}$/.test(o.uf)) erros.push("UF deve ter 2 letras");
  if (o.nascimento && !lerData(o.nascimento)) erros.push("Nascimento: use DD/MM/AAAA");
  if (o.negocio_valor && lerNumero(o.negocio_valor) === null) erros.push("Valor inválido");
  return erros;
}

/** Divide em lotes de n (padrão 100). */
export function lotes(lista, n = 100) {
  const out = [];
  for (let i = 0; i < (lista || []).length; i += n) out.push(lista.slice(i, i + n));
  return out;
}

/** Tamanho do próximo lote depois de um tempo_esgotado: metade, mínimo 10. */
export function metadeLote(n) { return Math.max(10, Math.floor(n / 2)); }

/* ------------------------------------------------------------ números e datas */
/** "1.234,56" | "1234.56" | "R$ 3.500" → número; inválido → null */
export function lerNumero(s) {
  if (s === null || s === undefined || s === "") return null;
  if (typeof s === "number") return Number.isFinite(s) ? s : null;
  let t = String(s).replace(/[R$\s ]/g, "");
  if (!t) return null;
  if (t.includes(",")) t = t.replace(/\./g, "").replace(",", ".");
  else if (/^\d{1,3}(\.\d{3})+$/.test(t)) t = t.replace(/\./g, "");
  const n = Number(t);
  return Number.isFinite(n) ? n : null;
}

/** O texto de um campo de dinheiro tem algo escrito que NÃO vira número («abc»)? Vazio não é inválido: é «sem valor». */
export function dinheiroInvalido(s) {
  const t = String(s ?? "").trim();
  return t !== "" && lerNumero(t) === null;
}

/** "31/12/1990" | "1990-12-31" → "1990-12-31"; inválido → null */
export function lerData(s) {
  const t = String(s ?? "").trim();
  let a, m, d;
  let r = /^(\d{4})-(\d{2})-(\d{2})/.exec(t);
  if (r) { a = +r[1]; m = +r[2]; d = +r[3]; }
  else if ((r = /^(\d{1,2})\/(\d{1,2})\/(\d{4})$/.exec(t))) { d = +r[1]; m = +r[2]; a = +r[3]; }
  else return null;
  const dt = new Date(Date.UTC(a, m - 1, d));
  if (dt.getUTCFullYear() !== a || dt.getUTCMonth() !== m - 1 || dt.getUTCDate() !== d) return null;
  return `${a}-${String(m).padStart(2, "0")}-${String(d).padStart(2, "0")}`;
}

/** Dias inteiros entre dois instantes (b − a). */
export function diasEntre(a, b = new Date()) {
  const x = new Date(a).getTime(), y = new Date(b).getTime();
  if (!Number.isFinite(x) || !Number.isFinite(y)) return null;
  return Math.floor((y - x) / 86400000);
}

/** "hoje" | "há 1 dia" | "há 12 dias" na etapa */
export function textoDiasEtapa(estagioEm, agora = new Date()) {
  const d = diasEntre(estagioEm, agora);
  if (d === null) return "";
  if (d <= 0) return "hoje na etapa";
  return d === 1 ? "há 1 dia na etapa" : `há ${d} dias na etapa`;
}

/** SLA da etapa (horas) estourado? */
export function slaEstourado(estagioEm, slaHoras, agora = new Date()) {
  if (!slaHoras || !estagioEm) return false;
  const t = new Date(estagioEm).getTime();
  return Number.isFinite(t) && (new Date(agora).getTime() - t) > slaHoras * 3600000;
}

/**
 * Valor para <input type="datetime-local"> a partir de um instante, no fuso de SP.
 * (o banco recebe o texto sem fuso e interpreta como São Paulo — nx_crm_ts)
 */
export function paraDataHoraLocal(iso) {
  if (!iso) return "";
  const d = new Date(iso);
  if (Number.isNaN(d.getTime())) return "";
  const p = new Intl.DateTimeFormat("en-CA", { timeZone: "America/Sao_Paulo", year: "numeric", month: "2-digit", day: "2-digit",
    hour: "2-digit", minute: "2-digit", hourCycle: "h23" }).formatToParts(d);
  const g = t => (p.find(x => x.type === t) || {}).value;
  return `${g("year")}-${g("month")}-${g("day")}T${g("hour")}:${g("minute")}`;
}

/* ------------------------------------------------------------ kanban */
/**
 * Posição (campo `ordem`, crescente = de cima para baixo) entre dois vizinhos.
 * antes = ordem do cartão de CIMA (ou null no topo), depois = do cartão de BAIXO (ou null no fim).
 */
export function ordemEntre(antes, depois, agora = Date.now()) {
  const a = antes === null || antes === undefined || !Number.isFinite(Number(antes)) ? null : Number(antes);
  const b = depois === null || depois === undefined || !Number.isFinite(Number(depois)) ? null : Number(depois);
  if (a === null && b === null) return -agora / 1000;
  if (a === null) return b - 1;
  if (b === null) return a + 1;
  if (a === b) return a;           // vizinhos empatados: o servidor desempata por id
  return a + (b - a) / 2;
}

/**
 * Ordem do cartão solto na posição `pos` entre `itens` (a coluna de destino SEM ele). Soltar no fim de uma coluna que ainda tem cartões
 * não carregados («Ver mais») não pode pular por cima deles: `proxima` = ordem do 1º cartão não carregado (null = esse cartão não tem ordem,
 * que o servidor põe no fim; undefined = não há mais cartões ou não deu para saber → comportamento de fim de lista).
 */
export function ordemDoSoltar(itens, pos, proxima, agora = Date.now()) {
  const antes = itens[pos - 1] ? itens[pos - 1].ordem : null;
  const depois = itens[pos] ? itens[pos].ordem : (proxima === undefined ? null : proxima);
  return ordemEntre(antes, depois, agora);
}

/* ------------------------------------------------------------ gesto de toque no Kanban (M23)
 * O DOM só repassa pontos e tempo; quem decide o que o dedo está fazendo é esta máquina de estados (pura, testável).
 *   espera ──(350 ms parado)──▶ levantado ──(mexeu ≥ 6 px)──▶ arrastando
 *   espera ──(mexeu > 10 px antes dos 350 ms)──▶ rolando  (a rolagem é do navegador: nunca vira arrasto)
 * Ao soltar: «toque» (antes dos 350 ms: o clique normal abre o cartão) · «mover_para» (levantou e soltou sem mexer: folha «Mover para…»)
 * · «soltar» (arrastou: soltar no destino) · «nada» (rolou ou o sistema cancelou). */
export const TOQUE = Object.freeze({ MS_LONGO: 350, LIMIAR_ROLAGEM: 10, LIMIAR_ARRASTO: 6 });

const dist2 = (x0, y0, x1, y1) => Math.hypot(x1 - x0, y1 - y0);

/** Dedo encostou no cartão em (x, y) no instante t (ms). */
export function novoGesto(x, y, t = 0) {
  return { estado: "espera", x0: x, y0: y, t0: t, xl: null, yl: null, acao: null };
}

/** O tempo andou até t: depois de MS_LONGO sem mexer o cartão é «levantado» (acao = "levantar"). */
export function gestoTempo(g, t) {
  if (g.estado === "espera" && t - g.t0 >= TOQUE.MS_LONGO) return { ...g, estado: "levantado", xl: g.xl ?? g.x0, yl: g.yl ?? g.y0, acao: "levantar" };
  return { ...g, acao: null };
}

/** O dedo foi para (x, y) no instante t. acao: "levantar" | "rolar" | "arrastar" | "mover" | null. */
export function gestoMover(g, x, y, t = g.t0) {
  let s = gestoTempo(g, t);
  const levantou = s.acao === "levantar";
  if (s.estado === "espera") {
    if (dist2(s.x0, s.y0, x, y) > TOQUE.LIMIAR_ROLAGEM) return { ...s, estado: "rolando", acao: "rolar" };
    return s;
  }
  if (s.estado === "levantado") {
    if (dist2(s.xl, s.yl, x, y) >= TOQUE.LIMIAR_ARRASTO) return { ...s, estado: "arrastando", acao: "arrastar", levantou };
    return levantou ? s : { ...s, acao: null };
  }
  if (s.estado === "arrastando") return { ...s, acao: "mover" };
  return { ...s, acao: null };
}

/** O dedo saiu da tela no instante t. acao: "toque" | "mover_para" | "soltar" | "nada". */
export function gestoSoltar(g, t = g.t0) {
  const s = gestoTempo(g, t);
  const acao = s.estado === "espera" ? "toque" : s.estado === "levantado" ? "mover_para" : s.estado === "arrastando" ? "soltar" : "nada";
  return { ...s, estado: "encerrado", acao };
}

/** O sistema tomou o gesto (pointercancel: rolagem, chamada, etc.). Nunca solta nem move nada. */
export function gestoCancelar(g) { return { ...g, estado: "encerrado", acao: "nada" }; }

/** Posição (0 = topo) em que um cartão arrastado entra numa coluna: antes do primeiro cartão cujo meio está abaixo de y. cartoes = [{top, bottom}] sem o arrastado. */
export function indiceDoPonto(cartoes, y) {
  const lista = cartoes || [];
  for (let i = 0; i < lista.length; i++) { if (y < lista[i].top + (lista[i].bottom - lista[i].top) / 2) return i; }
  return lista.length;
}

/** Em qual coluna/etapa o ponto cai. alvos = [{id, left, right, top, bottom}] → id | null. */
export function alvoDoPonto(alvos, x, y) {
  const a = (alvos || []).find(r => x >= r.left && x <= r.right && y >= r.top && y <= r.bottom);
  return a ? a.id : null;
}

/* ------------------------------------------------------------ cartão (M24) */
/** De onde veio o contato, em uma linha (tooltip do glifo do cartão): «Google Ads · Campanha X · Anúncio Y» ou o rótulo da origem («WhatsApp»). */
export function descricaoOrigem(c) {
  if (!c || typeof c !== "object") return "";
  const rastreio = c.rastreio && typeof c.rastreio === "object" ? c.rastreio : {};
  const plataforma = c.plataforma === "google" ? "Google Ads" : c.plataforma === "meta" ? "Meta Ads" : c.plataforma ? "Anúncio" : null;
  const campanha = c.campanha_nome || c.campanha || c.campanha_ext || rastreio.utm_campaign;
  const anuncio = c.anuncio_nome || c.anuncio_ext || rastreio.utm_content;
  const origem = !plataforma && c.origem ? (ROTULO_ORIGEM[c.origem] || c.origem) : null;
  return [plataforma || origem, campanha ? `Campanha ${campanha}` : null, anuncio ? `Anúncio ${anuncio}` : null].filter(Boolean).join(" · ");
}

/**
 * M24: o cadastro que a pessoa está prestes a duplicar. `itens` = resposta de nx_contatos_listar; `digitado` = o telefone na caixa (com máscara ou DDI).
 * Só vale com 10–13 dígitos; casa pela MESMA chave do banco (com/sem 55 e 9º dígito). → o contato ou null.
 */
export function acharDuplicado(itens, digitado, { ignorarId = null } = {}) {
  const dig = String(digitado ?? "").replace(/\D/g, "");
  if (dig.length < 10 || dig.length > 13) return null;
  return (itens || []).find(c => c && c.telefone && c.id !== ignorarId && mesmoTelefone(c.telefone, dig)) || null;
}

/* ------------------------------------------------------------ escrita segura (M25) */
/** Chave de idempotência (uuid v4) de UMA intenção: o mesmo p_req repetido nunca grava duas vezes no servidor (24 h). */
export function novaReq(c = globalThis.crypto) {
  if (c && typeof c.randomUUID === "function") return c.randomUUID();
  const b = c && typeof c.getRandomValues === "function" ? c.getRandomValues(new Uint8Array(16)) : Uint8Array.from({ length: 16 }, () => Math.floor(Math.random() * 256));
  b[6] = (b[6] & 0x0f) | 0x40; b[8] = (b[8] & 0x3f) | 0x80;
  const h = [...b].map(x => x.toString(16).padStart(2, "0")).join("");
  return `${h.slice(0, 8)}-${h.slice(8, 12)}-${h.slice(12, 16)}-${h.slice(16, 20)}-${h.slice(20)}`;
}

/**
 * O erro deixa dúvida se o servidor JÁ aplicou? Prazo estourado, conexão que caiu no meio, resposta ilegível e 502/503/504 (o pedido pode ter chegado
 * e sido gravado). Recusa do servidor (código do CRM, 4xx, 500 do banco) NÃO é ambígua: nada foi gravado.
 */
export function erroAmbiguo(e) {
  const c = String((e && (e.codigo || e.message)) || "");
  if (/^(tempo_rede|tempo_esgotado|sem_conexao|resposta_invalida|servico_indisponivel)$/.test(c)) return true;   // tempo_esgotado também vem de 504 do gateway (pode ter aplicado)
  if (/^http_50[234]$/.test(c)) return true;
  const st = Number(e && e.status);
  return Number.isFinite(st) && st >= 502 && st <= 504;
}

/** Espera `ms` ou até a internet voltar (o que vier primeiro). */
export function esperarOuOnline(ms) {
  return new Promise(resolve => {
    let t = null;
    const fim = () => { clearTimeout(t); if (typeof removeEventListener === "function") removeEventListener("online", fim); resolve(); };
    t = setTimeout(fim, ms);
    if (typeof addEventListener === "function") addEventListener("online", fim);
  });
}

/**
 * escreverComReq(api, nome, params, {req, aoStatus, esperas, dormir}) → {resultado, req, repetiu}.
 * Chama a RPC com `p_req`. Em erro AMBÍGUO repete com a MESMA chave (depois de 1,5 s e de 4 s): se o servidor já tinha aplicado, devolve o resultado
 * guardado; se não, aplica agora — nunca duplica. Sem sucesso depois das tentativas lança o erro com `.ambigua = true` e `.req` (para «Salvar de novo»).
 * Qualquer outro erro sobe na hora, com `.req`.
 */
export async function escreverComReq(api, nome, params, { req, aoStatus, esperas = [1500, 4000], dormir = esperarOuOnline } = {}) {
  const chave = req || novaReq();
  let ultimo = null;
  for (let i = 0; i <= esperas.length; i++) {
    try {
      const resultado = await api.rpcC(nome, { ...params, p_req: chave });
      return { resultado, req: chave, repetiu: i > 0 };
    } catch (e) {
      ultimo = e;
      if (!erroAmbiguo(e)) { try { e.req = chave; } catch { /* erro congelado */ } throw e; }
      if (i < esperas.length) { if (aoStatus) aoStatus("Conferindo se foi salvo…"); await dormir(esperas[i]); }
    }
  }
  try { ultimo.ambigua = true; ultimo.req = chave; } catch { /* erro congelado */ }
  throw ultimo;
}

/** Mover entre etapas de TIPO diferente (aberto ↔ ganho/perdido) dispara automações (mensagens, tarefas): essas só se efetivam depois dos 7 s do «Desfazer». */
export function movimentoAdiado(tipoOrigem, tipoDestino) {
  return !!tipoOrigem && !!tipoDestino && tipoOrigem !== tipoDestino;
}

/** Texto curto dos totais no celular: «3 abertas · R$ 12.950 · previsão R$ 4.735». artigo = "a" | "o". */
export function resumoDoFunil({ abertos = 0, soma = "", previsao: prev = "" } = {}, artigo = "o") {
  const n = Number(abertos) || 0;
  const rot = `abert${artigo === "a" ? "a" : "o"}${n === 1 ? "" : "s"}`;
  return [`${n} ${rot}`, soma, prev ? `previsão ${prev}` : ""].filter(Boolean).join(" · ");
}

/**
 * Pontuação do lead (0 a 100) gravada pelo passo «preencher um campo» ou pela IA: campos.score, com score_motivo e score_em.
 * Aceita o negócio completo (`campos` dentro) ou o cartão com `score` solto. null quando não há nota válida.
 */
export function pontuacao(x) {
  if (!x || typeof x !== "object") return null;
  const campos = x.campos && typeof x.campos === "object" ? x.campos : {};
  const bruto = x.score !== undefined && x.score !== null ? x.score : campos.score;
  const n = typeof bruto === "number" ? bruto : (typeof bruto === "string" && bruto.trim() !== "" ? Number(bruto) : NaN);
  if (!Number.isFinite(n) || n < 0 || n > 100) return null;
  const score = Math.round(n);
  const txt = v => (typeof v === "string" ? v.trim() : "");
  return { score, faixa: score >= 70 ? "alta" : score >= 40 ? "media" : "baixa",
    motivo: txt(x.score_motivo) || txt(campos.score_motivo), em: txt(x.score_em) || txt(campos.score_em) };
}

/** Valor que o cartão "vale" na coluna: final se ganho, senão o previsto. */
export function valorCard(c) {
  if (!c) return 0;
  const v = c.status === "ganho" ? (c.valor ?? c.valor_previsto) : c.valor_previsto;
  const n = Number(v);
  return Number.isFinite(n) ? n : 0;
}

/**
 * Totais do topo do funil a partir das colunas {estagio_id, total, soma_previsto, soma_valor, itens}
 * e das etapas {id, tipo, probabilidade}. Usa as somas do servidor (valem para a coluna INTEIRA,
 * inclusive os cartões ainda não carregados) — mesma conta de nx_negocios_kanban.totais.
 */
export function previsao(colunas, estagios) {
  const porId = new Map((estagios || []).map(e => [e.id, e]));
  let abertos = 0, somaAberto = 0, ponderada = 0;
  for (const c of colunas || []) {
    const e = porId.get(c.estagio_id);
    if (!e || e.tipo !== "aberto") continue;
    abertos += Number(c.total) || 0;
    const s = Number(c.soma_previsto) || 0;
    somaAberto += s;
    ponderada += s * (Number(e.probabilidade) || 0) / 100;
  }
  return { abertos, soma_aberto: round2(somaAberto), previsao_ponderada: round2(ponderada) };
}
function round2(n) { return Math.round(n * 100) / 100; }

/**
 * Move um cartão entre colunas em memória (otimista), ajustando total e somas das duas colunas.
 * colunas: [{estagio_id, total, soma_previsto, soma_valor, itens:[Card]}]. Devolve NOVAS colunas.
 */
export function moverLocal(colunas, id, estagioDestino, indice, novaOrdem, patch = {}) {
  let card = null, origem = null;
  const cols = (colunas || []).map(c => ({ ...c, itens: c.itens.slice() }));
  for (const c of cols) {
    const i = c.itens.findIndex(x => x.id === id);
    if (i >= 0) { card = c.itens[i]; origem = c; c.itens.splice(i, 1); break; }
  }
  if (!card) return cols;
  const dest = cols.find(c => c.estagio_id === estagioDestino);
  if (!dest) return colunas;
  const novo = { ...card, ...patch, estagio_id: estagioDestino, ordem: novaOrdem ?? card.ordem };
  if (origem !== dest) {
    origem.total = Math.max(0, (Number(origem.total) || 0) - 1);
    origem.soma_previsto = round2((Number(origem.soma_previsto) || 0) - (Number(card.valor_previsto) || 0));
    origem.soma_valor = round2((Number(origem.soma_valor) || 0) - (Number(card.valor) || 0));
    dest.total = (Number(dest.total) || 0) + 1;
    dest.soma_previsto = round2((Number(dest.soma_previsto) || 0) + (Number(novo.valor_previsto) || 0));
    dest.soma_valor = round2((Number(dest.soma_valor) || 0) + (Number(novo.valor) || 0));
  } else {
    dest.soma_valor = round2((Number(dest.soma_valor) || 0) - (Number(card.valor) || 0) + (Number(novo.valor) || 0));
    dest.soma_previsto = round2((Number(dest.soma_previsto) || 0) - (Number(card.valor_previsto) || 0) + (Number(novo.valor_previsto) || 0));
  }
  const pos = Math.max(0, Math.min(indice ?? 0, dest.itens.length));
  dest.itens.splice(pos, 0, novo);
  return cols;
}

/** O filtro está vazio? (fechados_dias não conta) */
export function filtroVazio(f) {
  if (!f) return true;
  return !Object.entries(f).some(([k, v]) => {
    if (k === "fechados_dias") return false;
    if (v === null || v === undefined || v === "") return false;
    if (Array.isArray(v)) return v.length > 0;
    if (typeof v === "object") return Array.isArray(v.ids) ? v.ids.length > 0 : Object.keys(v).length > 0;
    return true;
  });
}

/**
 * filtrar(cards, filtro, {eu}) — mesma semântica do servidor (§5.1) para o que dá para
 * conferir no cartão: busca (sem acento; só dígitos ≥ 4 → telefone), dono (eu|sem|id),
 * etiquetas {op, ids}, origem [..], status, valor_min/valor_max.
 */
export function filtrar(cards, filtro = {}, { eu } = {}) {
  const f = filtro || {};
  const q = String(f.busca || "").trim();
  const dig = q.replace(/\D/g, "");
  const porTel = q && /^[0-9\s().+-]+$/.test(q) && dig.length >= 4;
  const qn = semAcento(q);
  const ids = f.etiquetas && Array.isArray(f.etiquetas.ids) ? f.etiquetas.ids : [];
  const op = (f.etiquetas && f.etiquetas.op) || "alguma";
  return (cards || []).filter(c => {
    if (q) {
      if (porTel) {
        const tel = String(c.telefone || (c.contato && c.contato.telefone) || "");
        const k = telChave(normalizarTelefone(dig)) || dig;
        if (!tel.includes(dig) && !tel.includes(k)) return false;
      } else {
        const alvo = semAcento([c.titulo, c.nome, c.servico, c.contato && c.contato.nome].filter(Boolean).join(" "));
        if (!alvo.includes(qn)) return false;
      }
    }
    if (f.dono === "eu") { if (c.dono_id !== eu) return false; }
    else if (f.dono === "sem") { if (c.dono_id) return false; }
    else if (f.dono) { if (c.dono_id !== f.dono) return false; }
    if (ids.length) {
      const tem = new Set(c.etiquetas || []);
      const n = ids.filter(i => tem.has(i)).length;
      if (op === "alguma" && n === 0) return false;
      if (op === "todas" && n !== ids.length) return false;
      if (op === "nenhuma" && n > 0) return false;
    }
    if (Array.isArray(f.origem) && f.origem.length && !f.origem.includes(c.origem)) return false;
    if (f.status && f.status !== "todos" && c.status !== f.status) return false;
    const v = Number(c.valor ?? c.valor_previsto ?? 0);
    if (f.valor_min !== undefined && f.valor_min !== null && f.valor_min !== "" && v < Number(f.valor_min)) return false;
    if (f.valor_max !== undefined && f.valor_max !== null && f.valor_max !== "" && v > Number(f.valor_max)) return false;
    return true;
  });
}

/** O que precisa ser perguntado ao mover para a etapa e: 'ganho' | 'perdido' | 'agendada' | null */
export function pedidoAoMover(estagio, estagioAtual) {
  if (!estagio) return null;
  const muda = !estagioAtual || estagio.id !== estagioAtual.id;
  if (!muda) return null;
  if (estagio.tipo === "ganho") return "ganho";
  if (estagio.tipo === "perdido") return "perdido";
  if (estagio.marco === "agendada") return "agendada";
  return null;
}

/**
 * Funis para onde um negócio pode ir (TRAVA DO ADS, mesma regra do gatilho nx_tg_negocio_antes):
 * funil do Ads + negócio fechado → só o próprio funil; funil do Ads + aberto → só funis do Ads; senão qualquer funil.
 */
export function funisPermitidos(funis, funilAtual, status) {
  const atual = (funis || []).find(f => f.id === funilAtual);
  const ativos = (funis || []).filter(f => f.ativo !== false);
  if (!atual || !atual.conta_no_ads) return ativos;
  if (status !== "aberto") return ativos.filter(f => f.id === atual.id);
  return ativos.filter(f => f.conta_no_ads);
}

/* ------------------------------------------------------------ campos personalizados */
export const TIPOS_CAMPO = Object.freeze({
  texto: "Texto", texto_longo: "Texto longo", numero: "Número", moeda: "Moeda", data: "Data", opcao: "Opção",
  multi: "Múltipla escolha", sim_nao: "Sim/Não", telefone: "Telefone", email: "E-mail", url: "Link",
});

function vazioCampo(v) {
  return v === null || v === undefined || (typeof v === "string" && v.trim() === "") || (Array.isArray(v) && v.length === 0);
}

/**
 * validarCampo({tipo, obrigatorio, opcoes, rotulo}, valor) → null (ok) ou texto do erro.
 * Normaliza nada: só diz se o valor é aceitável para o tipo.
 */
export function validarCampo(campo, valor) {
  const c = campo || {};
  if (vazioCampo(valor)) return c.obrigatorio ? `Preencha ${c.rotulo ? `«${c.rotulo}»` : "este campo"}.` : null;
  const s = typeof valor === "string" ? valor.trim() : valor;
  switch (c.tipo) {
    case "numero": return lerNumero(s) === null ? "Use só números." : null;
    case "moeda": return lerNumero(s) === null || lerNumero(s) < 0 ? "Valor inválido." : null;
    case "data": return lerData(s) ? null : "Data inválida (DD/MM/AAAA).";
    case "email": return /^[^@\s]+@[^@\s]+\.[^@\s]+$/.test(String(s)) ? null : "E-mail inválido.";
    case "url": return /^https?:\/\/[^\s.]+\.[^\s]{2,}/i.test(String(s)) ? null : "Link inválido (comece com https://).";
    case "telefone": return normalizarTelefone(s) ? null : "Telefone inválido.";
    case "opcao": return (c.opcoes || []).includes(String(s)) ? null : "Escolha uma das opções.";
    case "multi": {
      const lista = Array.isArray(s) ? s : String(s).split(";").map(x => x.trim()).filter(Boolean);
      return lista.every(x => (c.opcoes || []).includes(x)) ? null : "Escolha entre as opções.";
    }
    case "sim_nao": return s === true || s === false || s === "sim" || s === "nao" || s === "true" || s === "false" ? null : "Escolha sim ou não.";
    case "texto": return String(s).length > 500 ? "Máximo de 500 caracteres." : null;
    case "texto_longo": return String(s).length > 5000 ? "Máximo de 5.000 caracteres." : null;
    default: return null;
  }
}

/** Valor normalizado para gravar no JSON `campos` (número como número, data ISO, multi como lista). */
export function normalizarCampo(campo, valor) {
  if (vazioCampo(valor)) return null;
  switch ((campo || {}).tipo) {
    case "numero": case "moeda": return lerNumero(valor);
    case "data": return lerData(valor);
    case "sim_nao": return valor === true || valor === "sim" || valor === "true";
    case "multi": return Array.isArray(valor) ? valor : String(valor).split(";").map(x => x.trim()).filter(Boolean);
    case "telefone": return normalizarTelefone(valor) || String(valor).trim();
    default: return typeof valor === "string" ? valor.trim() : valor;
  }
}

/** Campos personalizados que valem para a entidade (e o funil, no caso de negócio), na ordem. */
export function camposDe(campos, entidade, funilId) {
  return (campos || []).filter(c => c.entidade === entidade && c.ativo !== false
    && (entidade !== "negocio" || !c.funil_id || c.funil_id === funilId))
    .sort((a, b) => (a.ordem || 0) - (b.ordem || 0));
}

/** Obrigatórios vazios (bloqueiam GANHAR): [{chave, rotulo}] */
export function obrigatoriosVazios(campos, entidade, funilId, valores) {
  return camposDe(campos, entidade, funilId).filter(c => c.obrigatorio && vazioCampo((valores || {})[c.chave]));
}

/* ------------------------------------------------------------ textos */
/** Título do cartão: título → nome do contato → nome → telefone → "Sem nome". */
export function tituloCard(c) {
  if (!c) return "Sem nome";
  const t = (c.titulo || "").trim();
  if (t) return t;
  const n = (c.contato && c.contato.nome) || c.nome;
  if (n && String(n).trim()) return String(n).trim();
  const tel = (c.contato && c.contato.telefone) || c.telefone;
  return tel ? formatarTel(tel) : "Sem nome";
}

/** "5512998303030" → "(12) 99830-3030" (igual ao ui.telBR) */
export function formatarTel(digitos) {
  let d = String(digitos ?? "").replace(/\D/g, "");
  if (!d) return "";
  if (d.length >= 12 && d.length <= 13 && d.startsWith("55")) d = d.slice(2);
  if (d.length === 11) return `(${d.slice(0, 2)}) ${d.slice(2, 7)}-${d.slice(7)}`;
  if (d.length === 10) return `(${d.slice(0, 2)}) ${d.slice(2, 6)}-${d.slice(6)}`;
  return `+${d}`;
}

export const ROTULO_ORIGEM = Object.freeze({
  anuncio: "Anúncio", whatsapp: "WhatsApp", indicacao: "Indicação", organico: "Orgânico",
  manual: "Cadastro manual", site: "Site", importacao: "Importação",
});

export const ROTULO_TAREFA = Object.freeze({
  tarefa: "Tarefa", ligacao: "Ligação", reuniao: "Reunião", visita: "Visita", whatsapp: "WhatsApp", email: "E-mail",
});
export const ICONE_TAREFA = Object.freeze({
  tarefa: "tarefa", ligacao: "telefone", reuniao: "usuario", visita: "empresa", whatsapp: "whatsapp", email: "enviar",
});

/** Textos de erro do CRM (Apêndice B + códigos do CRM que o api.js não conhece). */
const ERROS_CRM = {
  tarefa_nao_encontrada: "Não encontramos essa tarefa — ela pode ter sido removida.",
  nota_nao_encontrada: "Não encontramos essa nota — ela pode ter sido removida.",
  etiqueta_nao_encontrada: "Não encontramos essa etiqueta — ela pode ter sido removida.",
  negocio_nao_encontrado: "Não encontramos esse registro — ele pode ter sido removido.",
  contato_nao_encontrado: "Não encontramos esse registro — ele pode ter sido removido.",
  valor_obrigatorio: "Informe o valor para marcar como ganho.",
  telefone_invalido: "Telefone inválido. Use DDD + número, por exemplo (12) 99830-3030.",
  telefone_em_uso: "Já existe um cadastro com esse telefone.",
  empresa_nao_encontrada: "Não encontramos essa empresa — ela pode ter sido removida.",
  campo_nao_encontrado: "Não encontramos esse campo — ele pode ter sido removido.",
  motivo_nao_encontrado: "Não encontramos esse motivo — ele pode ter sido removido.",
};
/** hints de funil_invalido / estagio_invalido (editor de funis, excluir funil, importar) */
const DICAS_FUNIL = {
  tipos: "O funil precisa de pelo menos uma etapa aberta, uma de ganho e uma de perda.",
  marcos: "Um funil que conta nos anúncios precisa das etapas com os marcos «Nova conversa» e «Fechou».",
  marco_obrigatorio: "No funil que conta nos anúncios, toda etapa precisa de um marco.",
  marco_tipo: "O marco escolhido não combina com o tipo da etapa.",
  marco: "Marco inválido.",
  nome: "Dê um nome ao funil.",
  nome_em_uso: "Já existe um funil com esse nome.",
  etapa_nome: "Dê um nome a cada etapa.",
  etapa_repetida: "Há duas etapas com o mesmo nome.",
  etapas: "O funil precisa ter de 1 a 25 etapas.",
  cor: "Cor inválida.", probabilidade: "Probabilidade entre 0 e 100%.", sla: "O prazo (SLA) vai de 1 a 2.160 horas.",
  padrao_sem_ads: "O funil padrão recebe as conversas do WhatsApp e precisa contar nos anúncios.",
  padrao_inativo: "O funil padrão não pode ficar desativado.",
  precisa_padrao: "Escolha outro funil como padrão antes de tirar este.",
  padrao: "O funil padrão não pode ser excluído. Escolha outro como padrão antes.",
  entra_no_ads: "Só um funil sem negócios pode passar a contar nos anúncios (ou os negócios dele irem para um que conta).",
  etapa_com_negocios: "Não dá para mudar o tipo ou o marco de uma etapa que tem negócios. Mova os negócios antes.",
  tem_fechados: "Este funil tem negócios fechados que contam nos anúncios. Desative-o em vez de excluir.",
  destino: "Escolha uma etapa de destino válida.",
  destino_tipo: "Os negócios só podem ir para uma etapa do mesmo tipo (aberta, ganho ou perda).",
  destino_sem_fechadas: "O funil de destino precisa ter etapas de ganho e de perda.",
  nao_encontrado: "Esse funil não existe mais. Recarregue a página.",
  funil_sem_etapa: "Esse funil não tem etapa aberta.",
  mover: "Confira para onde vão os negócios.", formato: "Confira os dados do funil.",
};
const DICAS_DADOS = {
  email: "Confira o e-mail.", uf: "UF deve ter 2 letras (ex.: SP).", dono_id: "Esse responsável não tem acesso a esta empresa.",
  valor_previsto: "Confira o valor.", valor: "Confira o valor.", titulo: "Informe o título.", texto: "Escreva o texto.",
  optin_origem: "Diga de onde veio a autorização (ex.: ficha assinada na recepção).", contato: "Informe o nome ou o telefone.",
  confirmacao: "Digite «excluir» para confirmar.", nome: "Informe o nome.", cor: "Cor inválida.",
  nome_em_uso: "Esse nome já está em uso.", motivo_perda_id: "Escolha um motivo da lista.",
  empresa_id: "Empresa não encontrada.", consulta_em: "Data e hora inválidas.", data_consulta: "Data inválida.",
  previsao_fechamento: "Data inválida.", nascimento: "Data de nascimento inválida.", campo: "Filtro de campo inválido.",
  rotulo: "Dê um nome ao campo.", rotulo_em_uso: "Já existe um campo com esse nome.", chave: "A chave não pode mudar depois de criada.",
  chave_em_uso: "Essa chave já está em uso.", max_campos: "Máximo de 50 campos por tipo de cadastro.",
  opcoes: "Informe de 1 a 50 opções (uma por linha).", tipo: "Tipo inválido.", entidade: "Escolha para qual cadastro é o campo.",
  site: "Site inválido (ex.: www.suaempresa.com.br).", linhas: "Envie de 1 a 100 linhas por vez.",
  importacao_id: "A importação não foi encontrada. Comece de novo.", atualizar: "Opção inválida.", opcoes_importacao: "Opções inválidas.",
};

/**
 * textoErro(e, {campos, vocab, padrao}) → texto para o usuário.
 * campo_obrigatorio usa o RÓTULO do campo (o hint é a chave); dados_invalidos usa a dica da chave.
 */
export function textoErro(e, { campos = [], padrao } = {}) {
  const c = e && (e.codigo || e.message);
  const hint = e && e.hint != null ? String(e.hint) : "";
  if (c === "campo_obrigatorio") {
    const cp = (campos || []).find(x => x.chave === hint);
    return `Preencha o campo "${cp ? cp.rotulo : hint || "obrigatório"}" antes de continuar.`;
  }
  if (c === "dados_invalidos" && DICAS_DADOS[hint]) return DICAS_DADOS[hint];
  if (c === "motivo_obrigatorio") return `Escolha o motivo da perda${hint === "texto" ? " e escreva a justificativa" : ""}.`;
  if ((c === "funil_invalido" || c === "estagio_invalido") && hint === "fechado_no_ads")
    return "Negócio fechado no funil de anúncios não muda de funil. Use Iniciar pós-venda.";
  if ((c === "funil_invalido" || c === "estagio_invalido") && hint === "sai_do_ads")
    return "Esse negócio veio do funil de anúncios e só pode ir para outro funil de anúncios.";
  if (c === "estagio_invalido" && hint === "fechado") return "Um negócio novo começa numa etapa aberta.";
  if ((c === "funil_invalido" || c === "estagio_invalido") && DICAS_FUNIL[hint]) return DICAS_FUNIL[hint];
  if (c === "estagio_com_negocios") {
    const n = Number(hint);
    return Number.isFinite(n) && n > 0 ? `Essa etapa tem ${n} negócio${n === 1 ? "" : "s"}. Escolha para onde ${n === 1 ? "ele vai" : "eles vão"}.`
      : "Essa etapa tem negócios. Escolha para onde eles vão.";
  }
  if (ERROS_CRM[c]) return ERROS_CRM[c];
  if (typeof padrao === "function") return padrao(e);
  return `Não deu certo agora${c ? ` (${String(c).slice(0, 60)})` : ""}. Tente de novo em instantes.`;
}

/**
 * Frase de um item da linha do tempo (ItemTempo). nomes: id da conta → nome; etapas: id → nome.
 */
export function textoTempo(it, { nomes = {}, vocab, brl = v => `R$ ${v}`, motivos = {} } = {}) {
  const d = (it && it.dados) || {};
  const neg = vocab ? vocab.min("negocio") : "negócio";
  const nomeDe = id => (id && nomes[id]) || (id ? "outra pessoa" : "ninguém");
  if (it.fonte === "nota") return `Nota: ${d.texto || ""}`;
  if (it.fonte === "tarefa") return it.tipo === "tarefa_concluida" ? `Concluiu a tarefa «${d.titulo || ""}»` : `Criou a tarefa «${d.titulo || ""}»`;
  switch (it.tipo) {
    case "negocio_criado": return `Criou ${vocab ? (vocab.art("negocio") === "a" ? "a " : "o ") : "o "}${neg}${d.titulo ? ` «${d.titulo}»` : ""}`;
    case "estagio": return `Moveu de «${d.de_nome || "—"}» para «${d.para_nome || "—"}»`;
    case "ganho": return `Marcou como ${vocab ? vocab.ganhar.toLowerCase() : "ganho"}${d.valor != null ? ` · ${brl(d.valor)}` : ""}`;
    case "perdido": return `Marcou como ${vocab ? vocab.perder.toLowerCase() : "perdido"}${d.motivo && motivos[d.motivo] ? ` · ${motivos[d.motivo]}` : ""}${d.texto ? ` — ${d.texto}` : ""}`;
    case "reaberto": return `Reabriu ${vocab ? (vocab.art("negocio") === "a" ? "a " : "o ") : "o "}${neg}`;
    case "dono": return d.para ? `Responsável: ${nomeDe(d.para)}` : "Ficou sem responsável";
    case "conversa_aberta": return `Atendimento ${d.protocolo || ""} aberto`.replace(/\s+/g, " ").trim();
    case "conversa_resolvida": return `Atendimento ${d.protocolo || ""} resolvido`.replace(/\s+/g, " ").trim();
    case "atribuida": return d.para ? `Conversa atribuída a ${nomeDe(d.para)}` : "Conversa ficou sem responsável";
    case "etiqueta": return "Etiquetas alteradas";
    case "importado": return "Veio da importação de planilha";
    case "automacao": return `Automação${d.nome ? ` «${d.nome}»` : ""} executada`;
    case "contato_mesclado": return "Cadastros duplicados foram unidos";
    default: return String(it.tipo || "Registro").replace(/_/g, " ");
  }
}

/** Ícone do sprite para um item da linha do tempo. */
export function iconeTempo(it) {
  if (it.fonte === "nota") return "nota";
  if (it.fonte === "tarefa") return it.tipo === "tarefa_concluida" ? "check" : "tarefa";
  return ({ negocio_criado: "mais", estagio: "seta-dir", ganho: "check", perdido: "fechar", reaberto: "relogio", dono: "usuario",
    conversa_aberta: "chat", conversa_resolvida: "checks", atribuida: "usuario", importado: "camadas", automacao: "raio",
    etiqueta: "etiqueta", contato_mesclado: "camadas" })[it.tipo] || "info";
}

/* ------------------------------------------------------------ editor de funis (T14 · CRM) */
/** Marcos do Ads (liga a etapa ao ROI do painel). Rótulos da interface. */
export const MARCOS = Object.freeze([
  { id: "nova", rotulo: "Nova conversa", tipo: "aberto" },
  { id: "agendada", rotulo: "Agendou", tipo: "aberto" },
  { id: "orcamento", rotulo: "Orçamento", tipo: "aberto" },
  { id: "faltou", rotulo: "Faltou", tipo: "aberto" },
  { id: "fechou", rotulo: "Fechou", tipo: "ganho" },
  { id: "nao_fechou", rotulo: "Não fechou", tipo: "perdido" },
  { id: "perdida", rotulo: "Perdida", tipo: "perdido" },
]);
export const TIPOS_ETAPA = Object.freeze({ aberto: "Aberta", ganho: "Ganho", perdido: "Perda" });

/** Marcos que combinam com o tipo da etapa (mesma regra do check nx_estagios_marco_tipo). */
export function marcosDoTipo(tipo) { return MARCOS.filter(m => m.tipo === tipo); }

/** Probabilidade padrão por tipo (a mesma do servidor). */
export function probPadrao(tipo) { return tipo === "ganho" ? 100 : tipo === "perdido" ? 0 : 10; }

/**
 * validarFunil({nome, conta_no_ads, estagios:[{nome,tipo,marco,probabilidade,sla_horas,cor}]}) →
 * [] (ok) ou [{indice|null, campo, hint, texto}] — mesmas regras de nx_funil_salvar, para avisar antes de salvar.
 */
export function validarFunil(f) {
  const erros = [];
  const add = (indice, campo, hint) => erros.push({ indice, campo, hint, texto: DICAS_FUNIL[hint] || "Confira os dados." });
  if (!String(f && f.nome || "").trim()) add(null, "nome", "nome");
  const est = (f && f.estagios) || [];
  if (est.length < 1 || est.length > 25) add(null, "estagios", "etapas");
  const nomes = new Set();
  const cont = { aberto: 0, ganho: 0, perdido: 0 };
  const marcos = new Set();
  est.forEach((e, i) => {
    const nome = String(e.nome || "").trim();
    if (!nome) add(i, "nome", "etapa_nome");
    else if (nomes.has(semAcento(nome))) add(i, "nome", "etapa_repetida");
    nomes.add(semAcento(nome));
    const tipo = e.tipo || "aberto";
    if (cont[tipo] === undefined) add(i, "tipo", "tipos"); else cont[tipo]++;
    if (f.conta_no_ads) {
      if (!e.marco) add(i, "marco", "marco_obrigatorio");
      else if (!MARCOS.some(m => m.id === e.marco && m.tipo === tipo)) add(i, "marco", "marco_tipo");
      else marcos.add(e.marco);
    }
    if (e.probabilidade !== null && e.probabilidade !== undefined && e.probabilidade !== "") {
      const p = Number(e.probabilidade);
      if (!Number.isInteger(p) || p < 0 || p > 100) add(i, "probabilidade", "probabilidade");
    }
    if (e.sla_horas !== null && e.sla_horas !== undefined && e.sla_horas !== "") {
      const s = Number(e.sla_horas);
      if (!Number.isInteger(s) || s < 1 || s > 2160) add(i, "sla_horas", "sla");
    }
  });
  if (est.length && (!cont.aberto || !cont.ganho || !cont.perdido)) add(null, "estagios", "tipos");
  if (f && f.conta_no_ads && est.length && !erros.some(x => x.hint === "marco_obrigatorio" || x.hint === "marco_tipo")
      && (!marcos.has("nova") || !marcos.has("fechou"))) add(null, "estagios", "marcos");
  return erros;
}

/** Etapas que existiam (com id) e saíram da lista editada. */
export function etapasRemovidas(originais, editadas) {
  const ficam = new Set((editadas || []).map(e => e.id).filter(Boolean));
  return (originais || []).filter(e => e.id && !ficam.has(e.id));
}

/** Destinos possíveis para os negócios de uma etapa removida: etapas mantidas (com id) do MESMO tipo. */
export function destinosPara(removida, editadas) {
  return (editadas || []).filter(e => e.id && e.id !== removida.id && (e.tipo || "aberto") === (removida.tipo || "aberto"));
}

/**
 * Remover uma etapa que já é DESTINO de outra removida: quem ia para ela passa a ir para `destino`
 * (senão o servidor recusa com estagio_invalido/destino e a tela mostraria «?»).
 * mover = {etapa_removida: etapa_destino}. Devolve um NOVO objeto; com `comNegocios`, a própria etapa entra também.
 */
export function repontarMover(mover, removidaId, destino, comNegocios = false) {
  const m = {};
  for (const [k, v] of Object.entries(mover || {})) m[k] = v === removidaId ? destino : v;
  if (comNegocios && removidaId && destino) m[removidaId] = destino;
  return m;
}
/** Etapas removidas cujos negócios iriam para a etapa `id`. */
export function quemVaiPara(mover, id) {
  return Object.keys(mover || {}).filter(k => mover[k] === id);
}

/** Corpo de nx_funil_salvar a partir do editor (etapas na ordem da tela; marco só no funil do Ads). */
export function payloadFunil(f, etapas, mover = {}) {
  const p = { nome: String(f.nome || "").trim(), conta_no_ads: !!f.conta_no_ads, ativo: f.ativo !== false };
  if (f.id) p.id = f.id;
  if (f.padrao !== undefined) p.padrao = !!f.padrao;
  p.estagios = (etapas || []).map(e => {
    const o = { nome: String(e.nome || "").trim(), tipo: e.tipo || "aberto", cor: e.cor || null,
      marco: f.conta_no_ads ? (e.marco || null) : null,
      probabilidade: e.probabilidade === "" || e.probabilidade === null || e.probabilidade === undefined ? null : Number(e.probabilidade),
      sla_horas: e.sla_horas === "" || e.sla_horas === null || e.sla_horas === undefined ? null : Number(e.sla_horas) };
    if (e.id) o.id = e.id;
    return o;
  });
  const m = {};
  for (const [k, v] of Object.entries(mover || {})) if (k && v) m[k] = v;
  if (Object.keys(m).length) p.mover = m;
  return p;
}

/** Move um item da lista de i para j (reordenar etapas/campos/motivos pelo teclado ou arrastando). */
export function moverItem(lista, i, j) {
  const a = (lista || []).slice();
  if (i < 0 || i >= a.length || j < 0 || j >= a.length || i === j) return a;
  const [x] = a.splice(i, 1);
  a.splice(j, 0, x);
  return a;
}

/* ------------------------------------------------------------ importação (T10) */
/** Destinos disponíveis no passo 2: fixos + campos personalizados de contato. */
export function destinosImportacao(campos = []) {
  return [...DESTINOS_IMPORTACAO.map(d => ({ valor: d.chave, rotulo: d.rotulo })),
    ...(campos || []).filter(c => c && c.entidade === "contato" && c.ativo !== false).map(c => ({ valor: `campo:${c.chave}`, rotulo: `Campo: ${c.rotulo}` }))];
}

/** O mapeamento tem o mínimo para achar/criar alguém (nome, telefone ou e-mail)? */
export function mapaValido(mapa) {
  return (mapa || []).some(d => d === "nome" || d === "telefone" || d === "email");
}

/** O mapeamento traz dados de negócio (título, valor, etapa)? */
export function mapaTemNegocio(mapa) {
  return (mapa || []).some(d => d === "negocio_titulo" || d === "negocio_valor" || d === "estagio");
}

/** Soma o resultado de um lote no acumulado do resumo. */
export function somarImportacao(acc, r) {
  const a = acc || { criados: 0, atualizados: 0, ignorados: 0, erros: [], avisos: [] };
  return {
    criados: a.criados + (Number(r && r.criados) || 0),
    atualizados: a.atualizados + (Number(r && r.atualizados) || 0),
    ignorados: a.ignorados + (Number(r && r.ignorados) || 0),
    erros: [...a.erros, ...((r && r.erros) || [])],
    avisos: [...a.avisos, ...((r && r.avisos) || [])],
  };
}

/** Texto curto do resumo final ("120 criados · 30 atualizados · 5 ignorados · 2 erros"). */
export function textoResumoImportacao(s) {
  const p = (n, um, varios) => `${n} ${n === 1 ? um : varios}`;
  return [p(s.criados, "criado", "criados"), p(s.atualizados, "atualizado", "atualizados"), p(s.ignorados, "ignorado", "ignorados"),
    p(s.erros.length, "erro", "erros")].join(" · ");
}

/** Decodifica o arquivo: UTF-8; se aparecer o caractere de substituição (planilha salva em ANSI), tenta Windows-1252. */
export function decodificarArquivo(bytes, Decodificador = globalThis.TextDecoder) {
  const utf = new Decodificador("utf-8").decode(bytes);
  if (!utf.includes("�")) return { texto: utf, codificacao: "utf-8" };
  try { return { texto: new Decodificador("windows-1252").decode(bytes), codificacao: "windows-1252" }; }
  catch { return { texto: utf, codificacao: "utf-8" }; }
}

/* ------------------------------------------------------------ exportar contatos (P1) */
/** "1990-12-31" → "31/12/1990"; ISO com hora → data no fuso de SP; vazio → "" */
export function dataCurtaCSV(v) {
  if (!v) return "";
  const s = String(v);
  if (/^\d{4}-\d{2}-\d{2}$/.test(s)) return `${s.slice(8, 10)}/${s.slice(5, 7)}/${s.slice(0, 4)}`;
  const d = new Date(s);
  if (Number.isNaN(d.getTime())) return "";
  return new Intl.DateTimeFormat("pt-BR", { timeZone: "America/Sao_Paulo", day: "2-digit", month: "2-digit", year: "numeric" }).format(d);
}

/**
 * Itens de nx_contatos_exportar → {cabecalho, linhas} para o gerarCSV (; com BOM).
 * Colunas com os mesmos nomes que a importação reconhece (dá para reimportar o arquivo).
 */
export function linhasExportacao(itens, campos = []) {
  const extras = (campos || []).filter(c => c && c.entidade === "contato" && c.ativo !== false)
    .sort((a, b) => (a.ordem || 0) - (b.ordem || 0));
  const cabecalho = ["Nome", "Telefone", "E-mail", "Empresa", "Cidade", "UF", "Nascimento", "CPF/CNPJ", "Origem", "Etiquetas",
    "Responsável", "Aceita marketing", "Cadastrado em", "Observação", ...extras.map(c => c.rotulo)];
  const valorCampo = (c, v) => {
    if (v === null || v === undefined || v === "") return "";
    if (Array.isArray(v)) return v.join("; ");
    if (typeof v === "boolean") return v ? "Sim" : "Não";
    if (c.tipo === "data") return dataCurtaCSV(v);
    if (c.tipo === "telefone") return formatarTel(v);
    if (c.tipo === "moeda" || c.tipo === "numero") return String(v).replace(".", ",");
    return String(v);
  };
  const linhas = (itens || []).map(k => [
    k.nome || "", k.telefone ? formatarTel(k.telefone) : "", k.email || "", k.empresa_nome || "", k.cidade || "", k.uf || "",
    dataCurtaCSV(k.nascimento), k.documento || "", ROTULO_ORIGEM[k.origem] || k.origem || "",
    (k.etiquetas_nomes || []).join("; "), k.dono_nome || "",
    k.optin_marketing === true ? "Sim" : k.optin_marketing === false ? "Não" : "", dataCurtaCSV(k.criado_em), k.obs || "",
    ...extras.map(c => valorCampo(c, (k.campos || {})[c.chave])),
  ]);
  return { cabecalho, linhas };
}
