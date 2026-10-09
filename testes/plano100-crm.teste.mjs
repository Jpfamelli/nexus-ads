/* ÓRBITA — plano «100+ melhorias» (08/10/2026), frente C (CRM). node --test testes/plano100-crm.teste.mjs
   (a) lógica pura nova do crm-logica.js (C1 movimento, C3 rastreio, C4 origem, C6 presença, C7 telefone, C8 marcos, C9 ordem, C10 anúncio);
   (b) comportamento das telas num DOM de mentira: gaveta do negócio (C1 adiado com Desfazer, C3, C6), novo negócio pela conversa (C2),
   Kanban (C4, C5, C10), Contatos (C4, C9), Tarefas (C5), Funis (C8) e Importação (C7); (c) complementos estáticos do crm.css.
   Sem rede, sem serviços reais. */
import assert from "node:assert/strict";
import { test } from "node:test";
import { readFileSync } from "node:fs";
import { dirname, join } from "node:path";
import { fileURLToPath } from "node:url";

const raiz = dirname(fileURLToPath(import.meta.url));
const ler = nome => readFileSync(join(raiz, "..", "web", "app", nome), "utf8");
const L = await import("../web/app/crm-logica.js");
const tique = () => new Promise(r => setTimeout(r, 0));
const esperar = ms => new Promise(r => setTimeout(r, ms));
const iso = (dias, hora = 12) => new Date(Date.now() + dias * 86400000 + (hora - 12) * 3600000).toISOString();

/* ============================================================ (a) lógica */
test("C7 telefone: DDD válido para ganhar 55, «+» preserva o país, zero de tronco sai, fixo × celular na chave", () => {
  assert.equal(L.normalizarTelefone("(12) 99830-3030"), "5512998303030");
  assert.equal(L.normalizarTelefone("(12) 3456-7890"), "551234567890", "fixo com 3º dígito 2–9");
  assert.equal(L.normalizarTelefone("012 99777-3031"), "5512997773031", "zero de tronco fora");
  assert.equal(L.normalizarTelefone("1 212 555 1234"), null, "11 dígitos sem DDD brasileiro: não vira +55 inexistente");
  assert.equal(L.normalizarTelefone("+1 212 555 1234"), "12125551234", "com «+» fica como está");
  assert.equal(L.normalizarTelefone("(00) 99999-9999"), null);
  assert.equal(L.normalizarTelefone("4915112345678"), "4915112345678", "12–15 dígitos como está");
  assert.equal(L.telefoneSemPais("1 212 555 1234"), true);
  assert.equal(L.telefoneSemPais("+1 212 555 1234"), false, "com o país informado não é «sem país»");
  assert.equal(L.telefoneSemPais("(12) 99830-3030"), false);
  assert.equal(L.telefoneSemPais("123"), false);
  assert.ok(L.dddValido("12") && L.dddValido("99") && !L.dddValido("20") && !L.dddValido("00"));
  assert.equal(L.telChave("5512998303030"), "1298303030", "celular: tira o 9");
  assert.equal(L.telChave("551233334444"), "1233334444", "fixo de 12 dígitos");
  assert.equal(L.telChave("5512933334444"), "12933334444", "9 seguido de 3 não é o 9 do celular");
});

test("C7 telefoneImportado e checarLinha: Brasil, exterior com «+», sem país, inválido e vazio", () => {
  const fmtBR = n => `BR:${n}`;
  assert.deepEqual(L.telefoneImportado("(12) 99830-3030", { fmtBR }), { tipo: "br", texto: "BR:5512998303030" });
  assert.deepEqual(L.telefoneImportado("+55 12 99830-3030"), { tipo: "br", texto: "5512998303030" });
  assert.deepEqual(L.telefoneImportado("+1 212 555 1234"), { tipo: "exterior", texto: "+1 2125551234" });
  assert.deepEqual(L.telefoneImportado("+44 20 7946 0958"), { tipo: "exterior", texto: "+44 2079460958" });
  assert.deepEqual(L.telefoneImportado("1 212 555 1234"), { tipo: "sem_pais", texto: "1 212 555 1234" });
  assert.deepEqual(L.telefoneImportado("123"), { tipo: "invalido", texto: "123" });
  assert.deepEqual(L.telefoneImportado(""), { tipo: "vazio", texto: "" });
  assert.deepEqual(L.telefoneImportado(null), { tipo: "vazio", texto: "" });
  assert.match(L.checarLinha({ nome: "Ana", telefone: "1 212 555 1234" })[0], /sem DDD brasileiro.*\+código do país/);
  assert.deepEqual(L.checarLinha({ nome: "Ana", telefone: "+1 212 555 1234" }), []);
  assert.deepEqual(L.checarLinha({ nome: "Ana", telefone: "123" }), ["Telefone inválido"]);
});

test("rpcAusente: 404/PGRST202 (migração não aplicada) × erro de negócio", () => {
  assert.equal(L.rpcAusente({ status: 404, codigo: "http_404" }), true);
  assert.equal(L.rpcAusente({ codigo: "Could not find the function public.nx_agenda_presenca(p_estado, p_negocio, p_token) in the schema cache" }), true);
  assert.equal(L.rpcAusente({ codigo: "PGRST202" }), true);
  assert.equal(L.rpcAusente({ codigo: "negocio_nao_encontrado", status: 400 }), false);
  assert.equal(L.rpcAusente(null), false);
});

test("C1 textoMovimento / patchMovimento / extraDeVolta: o mesmo para o Kanban e a gaveta", () => {
  const brl = v => `R$ ${v}`;
  assert.equal(L.textoMovimento({ titulo: "Ana", destino: { tipo: "ganho", nome: "Fechou" }, valor: 900, ganhar: "Fechou", brl }), "Fechou! «Ana» · R$ 900");
  assert.equal(L.textoMovimento({ titulo: "Ana", destino: { tipo: "ganho", nome: "Fechou" }, valor: 0, ganhar: "Fechou", brl }), "Fechou! «Ana» · R$ 0", "zero é valor");
  assert.equal(L.textoMovimento({ titulo: "Ana", destino: { tipo: "ganho" }, valor: null, ganhar: "Ganhou" }), "Ganhou! «Ana»");
  assert.equal(L.textoMovimento({ titulo: "Ana", destino: { tipo: "perdido", nome: "Não fechou" }, artigo: "a" }), "«Ana» registrada como «Não fechou»");
  assert.equal(L.textoMovimento({ titulo: "Ana", destino: { tipo: "aberto", nome: "Nova" } }), "«Ana» reaberto em «Nova»");
  assert.deepEqual(L.patchMovimento({ tipo: "ganho" }, { valor: 900, campos: {} }), { status: "ganho", valor: 900 });
  assert.deepEqual(L.patchMovimento({ tipo: "aberto", marco: "agendada" }, { consulta_em: "2026-10-09T13:00" }), { status: "aberto", consulta_em: "2026-10-09T13:00" });
  assert.deepEqual(L.patchMovimento({ tipo: "perdido" }, null), { status: "perdido" });
  assert.deepEqual(L.extraDeVolta({ estagio: { tipo: "ganho" }, valor: null, valor_previsto: 500 }), { valor: 500 }, "voltar ao ganho exige o valor");
  assert.deepEqual(L.extraDeVolta({ tipo: "ganho" }), { valor: 0 });
  assert.deepEqual(L.extraDeVolta({ estagio: { tipo: "perdido" }, motivo_perda_id: "m1", motivo_perda_txt: "" }), { motivo_perda_id: "m1" });
  assert.deepEqual(L.extraDeVolta({ estagio: { tipo: "aberto" }, valor: 10 }), {});
  assert.deepEqual(L.extraDeVolta(null), {});
  assert.equal(L.movimentoAdiado("aberto", "ganho"), true); assert.equal(L.movimentoAdiado("ganho", "aberto"), true); assert.equal(L.movimentoAdiado("aberto", "aberto"), false);
});

test("C6 presença: estado gravado (solto ou em campos), consulta que já passou, alternar e o Desfazer", () => {
  assert.equal(L.presencaDe({ presenca: "faltou" }), "faltou");
  assert.equal(L.presencaDe({ campos: { presenca: "compareceu" } }), "compareceu");
  assert.equal(L.presencaDe({ presenca: null, campos: { presenca: "faltou" } }), "faltou", "nx_agenda_dia sem o campo: lê de campos (nx_negocio_ver)");
  assert.equal(L.presencaDe({ presenca: "talvez" }), null);
  assert.equal(L.presencaDe(null), null);
  const agora = Date.parse("2026-10-08T15:00:00Z");
  assert.equal(L.consultaPassou({ consulta_em: "2026-10-08T14:00:00Z" }, agora), true);
  assert.equal(L.consultaPassou({ consulta_em: "2026-10-08T16:00:00Z" }, agora), false);
  assert.equal(L.consultaPassou({ consulta_em: null }, agora), false);
  assert.equal(L.consultaPassou({ consulta_em: "ruim" }, agora), false);
  assert.equal(L.proximaPresenca("faltou", "faltou"), "limpar", "tocar de novo limpa");
  assert.equal(L.proximaPresenca(null, "faltou"), "faltou");
  assert.equal(L.proximaPresenca("compareceu", "faltou"), "faltou");
  assert.equal(L.voltaPresenca(null), "limpar"); assert.equal(L.voltaPresenca("compareceu"), "compareceu");
  assert.equal(L.PRESENCAS.faltou.rotulo, "Faltou");
  assert.equal(L.textoTempo({ tipo: "presenca", dados: { presenca: "faltou" } }), "Faltou à consulta");
  assert.equal(L.textoTempo({ tipo: "presenca", dados: { presenca: null } }), "Presença da consulta limpa");
  assert.equal(L.iconeTempo({ tipo: "presenca", dados: { presenca: "compareceu" } }), "check");
});

test("C3/C4 origemPilula e resumoRastreio: anúncio com plataforma, site com página e clique, orgânico, WhatsApp, nada", () => {
  assert.deepEqual(L.origemPilula({ plataforma: "google", origem: "anuncio" }), { chave: "anuncio", plataforma: "google" });
  assert.deepEqual(L.origemPilula({ anuncio: true }), { chave: "anuncio", plataforma: null });
  assert.deepEqual(L.origemPilula({ origem: "site" }), { chave: "site", plataforma: null });
  assert.deepEqual(L.origemPilula({ plataforma: "tiktok", origem: "whatsapp" }), { chave: "whatsapp", plataforma: null }, "plataforma desconhecida não vira anúncio");
  assert.equal(L.origemPilula({ origem: "manual" }, { manual: false }), null);
  assert.deepEqual(L.origemPilula({ origem: "manual" }), { chave: "manual", plataforma: null });
  assert.equal(L.origemPilula({ origem: "xyz" }), null);
  assert.equal(L.origemPilula(null), null);
  const fmtData = () => "06/10 10:12";
  const site = L.resumoRastreio({ origem: "site", rastreio: { codigo: "AB12CD", utm_source: "google", utm_medium: "cpc", utm_campaign: "Implante SP", pagina: "/implante", clique_em: "2026-10-06T13:12:00Z" } }, { fmtData });
  assert.equal(site.chave, "site");
  assert.equal(site.frase, "Veio do site · campanha «Implante SP» · página /implante · clique em 06/10 10:12");
  assert.deepEqual(site.detalhes, ["Parâmetros do site: google / cpc"], "o código do rastreio não aparece na tela");
  const an = L.resumoRastreio({ origem: "anuncio", plataforma: "meta", campanha_nome: "Avaliação humanizada", anuncio_ext: "2385" }, { anuncio: { anuncio_nome: "Vídeo sorriso" } });
  assert.deepEqual([an.chave, an.plataforma, an.frase], ["anuncio", "meta", "Veio do anúncio «Vídeo sorriso» · campanha «Avaliação humanizada»"]);
  assert.equal(L.resumoRastreio({ plataforma: "google" }).frase, "Veio do anúncio (Google)");
  assert.equal(L.resumoRastreio({ origem: "organico", rastreio: { utm_source: "instagram" } }).frase, "Veio do Instagram (orgânico)");
  assert.equal(L.resumoRastreio({ origem: "whatsapp" }).frase, "Chamou no WhatsApp");
  const so = L.resumoRastreio({ rastreio: { utm_campaign: "x" } });
  assert.deepEqual([so.chave, so.frase], [null, "Origem do contato · campanha «x»"]);
  assert.equal(L.resumoRastreio({}), null);
  assert.equal(L.resumoRastreio({ origem: "xyz" }), null);
  assert.equal(L.resumoRastreio(null), null);
});

test("C10 contarDeAnuncio, C9 ordemAoClicar/ariaSortDe e C8 marcosFaltando", () => {
  assert.deepEqual(L.contarDeAnuncio({ total: 3, itens: [{ plataforma: "meta" }, { origem: "anuncio" }, { origem: "whatsapp" }] }), { n: 2, parcial: false, texto: "2 de anúncio" });
  assert.deepEqual(L.contarDeAnuncio({ total: 9, itens: [{ anuncio: true }] }), { n: 1, parcial: true, texto: "1+ de anúncio" }, "com «Ver mais» pendente");
  assert.equal(L.contarDeAnuncio({ itens: [{ origem: "site" }] }).texto, "");
  assert.equal(L.contarDeAnuncio(null).n, 0);
  assert.equal(L.ordemAoClicar("nome", "recentes"), "nome");
  assert.equal(L.ordemAoClicar("nome", "nome"), "recentes", "de novo volta a Recentes");
  assert.equal(L.ordemAoClicar("ultimo_contato_em", "nome"), "ultimo_contato");
  assert.equal(L.ordemAoClicar("email", "nome"), "nome", "coluna sem ordem no servidor não muda nada");
  assert.equal(L.ariaSortDe("nome", "nome"), "ascending");
  assert.equal(L.ariaSortDe("ultimo_contato_em", "ultimo_contato"), "descending");
  assert.equal(L.ariaSortDe("nome", "recentes"), "none");
  const completo = [{ marco: "nova" }, { marco: "agendada" }, { marco: "faltou" }, { marco: "fechou" }, { marco: "nao_fechou" }];
  assert.deepEqual(L.marcosFaltando({ conta_no_ads: true }, completo), []);
  assert.deepEqual(L.marcosFaltando({ conta_no_ads: true }, completo.filter(e => e.marco !== "faltou")).map(x => x.marco), ["faltou"]);
  assert.deepEqual(L.marcosFaltando({ conta_no_ads: true }, [{ marco: "nova" }, { marco: "perdida" }]).map(x => x.rotulo), ["Ganho", "Faltou", "Agendou"], "«perdida» também serve de perda");
  assert.deepEqual(L.marcosFaltando({ conta_no_ads: false }, []), [], "funil fora dos anúncios não usa marcos");
  assert.equal(L.textoMarcosFaltando([]), "");
  assert.match(L.textoMarcosFaltando(L.marcosFaltando({ conta_no_ads: true }, [])), /^Ganho\/Perdido\/Faltou\/Agendou sem etapa: a automação não vai conseguir mover para «ganho»/);
});

/* ============================================================ DOM de mentira (elementos, classes, dataset, ouvintes, seletores simples e descendentes) */
function domDeMentira({ medias = {} } = {}) {
  let ativo = null, sobOPonto = null;
  const rolagens = [];
  class El {
    constructor(tag) {
      this.tagName = String(tag).toUpperCase(); this.children = []; this.parentElement = null; this.attrs = {}; this.dataset = {}; this.hidden = false; this.disabled = false;
      this._cls = new Set(); this._l = {}; this._t = ""; this.rect = null; this.scrollLeft = 0; this.scrollTop = 0; this.checked = false;
      this.style = new Proxy({}, { get: (o, p) => (p === "setProperty" ? (a, b) => { o[a] = b; } : p === "getPropertyValue" ? a => o[a] : o[p]), set: (o, p, v) => { o[p] = v; return true; } });
      const eu = this;
      this.classList = { add: (...c) => c.forEach(x => eu._cls.add(x)), remove: (...c) => c.forEach(x => eu._cls.delete(x)), contains: c => eu._cls.has(c),
        toggle: (c, f) => { const on = f === undefined ? !eu._cls.has(c) : !!f; if (on) eu._cls.add(c); else eu._cls.delete(c); return on; } };
    }
    get id() { return this.attrs.id || ""; } set id(v) { this.attrs.id = String(v); }
    get className() { return [...this._cls].join(" "); }
    get value() { return this._v ?? ""; } set value(v) { this._v = v; }
    setAttribute(a, v) { this.attrs[a] = String(v); } getAttribute(a) { return a in this.attrs ? this.attrs[a] : null; } removeAttribute(a) { delete this.attrs[a]; }
    get els() { return this.children.filter(c => c instanceof El); }
    appendChild(c) { if (c instanceof El) { c.remove(); c.parentElement = this; } this.children.push(c); return c; }
    // como o append NATIVO: null/undefined viram o texto «null»/«undefined» (o h() de mentira filtra antes, como o ui.h)
    append(...cs) { for (const c of cs) this.appendChild(c instanceof El ? c : { texto: String(c) }); }
    appendFiltrado(...cs) { for (const c of cs.flat(Infinity)) { if (c === null || c === undefined || c === false) continue; this.appendChild(c instanceof El ? c : { texto: String(c) }); } }
    prepend(...cs) { const antigos = this.children; this.children = []; this.append(...cs); this.children.push(...antigos); }
    insertBefore(n, ref) { n.remove(); const i = ref ? this.children.indexOf(ref) : -1; if (i < 0) this.children.push(n); else this.children.splice(i, 0, n); n.parentElement = this; return n; }
    after(...ns) { const p = this.parentElement; if (!p) return; let ref = this.nextSibling; for (const n of ns) p.insertBefore(n, ref); }
    remove() { const p = this.parentElement; if (!p) return; const i = p.children.indexOf(this); if (i >= 0) p.children.splice(i, 1); this.parentElement = null; }
    get firstChild() { return this.children[0] || null; } get lastChild() { return this.children[this.children.length - 1] || null; }
    get nextSibling() { const p = this.parentElement; return p ? p.children[p.children.indexOf(this) + 1] || null : null; }
    contains(x) { for (let n = x; n; n = n.parentElement) if (n === this) return true; return false; }
    get isConnected() { return doc.body.contains(this); } get offsetWidth() { return 0; } get offsetParent() { return this.parentElement; }
    matches(sel) { return sel.split(",").some(s => this._desc(s.trim().split(/\s+/))); }
    _desc(partes) {
      if (!this._m(partes[partes.length - 1])) return false;
      if (partes.length === 1) return true;
      for (let p = this.parentElement; p; p = p.parentElement) if (p._desc(partes.slice(0, -1))) return true;
      return false;
    }
    _m(s) {
      const m = /^([a-z0-9]*)((?:\.[\w-]+|\[[\w-]+(?:=(?:"[^"]*"|[\w-]+))?\]|:not\(\[hidden\]\))*)$/i.exec(s);
      if (!m) throw new Error("seletor não suportado no DOM de mentira: " + s);
      if (m[1] && m[1].toUpperCase() !== this.tagName) return false;
      for (const p of m[2].match(/\.[\w-]+|\[[\w-]+(?:=(?:"[^"]*"|[\w-]+))?\]|:not\(\[hidden\]\)/g) || []) {
        if (p[0] === ".") { if (!this._cls.has(p.slice(1))) return false; continue; }
        if (p === ":not([hidden])") { if (this.hidden) return false; continue; }
        const a = /^\[([\w-]+)(?:=(?:"([^"]*)"|([\w-]+)))?\]$/.exec(p);
        const esperado = a[2] !== undefined ? a[2] : a[3];
        const v = a[1].startsWith("data-") ? this.dataset[a[1].slice(5)] : this.attrs[a[1]];
        if (v === undefined || v === null || (esperado !== undefined && String(v) !== esperado)) return false;
      }
      return true;
    }
    querySelectorAll(sel) { const out = []; (function ir(n) { for (const c of n.els) { if (c.matches(sel)) out.push(c); ir(c); } })(this); return out; }
    querySelector(sel) { return this.querySelectorAll(sel)[0] || null; }
    closest(sel) { for (let n = this; n; n = n.parentElement) if (n.matches(sel)) return n; return null; }
    addEventListener(t, f) { (this._l[t] || (this._l[t] = [])).push(f); } removeEventListener(t, f) { this._l[t] = (this._l[t] || []).filter(x => x !== f); }
    dispara(t, ev = {}) { for (const f of [...(this._l[t] || [])]) f({ type: t, target: this, currentTarget: this, preventDefault() {}, stopPropagation() {}, ...ev }); }
    clique() { this.dispara("click"); }
    getBoundingClientRect() { const r = this.rect || { left: 0, top: 0, right: 0, bottom: 0 }; return { ...r, width: r.right - r.left, height: r.bottom - r.top }; }
    focus() { ativo = this; } blur() { if (ativo === this) ativo = null; } select() {} scrollTo(o) { rolagens.push({ el: this, ...o }); } scrollIntoView() { rolagens.push({ el: this, into: true }); }
    cloneNode() { const c = new El(this.tagName); c._cls = new Set(this._cls); c.attrs = { ...this.attrs }; c.dataset = { ...this.dataset }; return c; }
    get textContent() { return this._t + this.children.map(c => (c instanceof El ? c.textContent : c.texto)).join(""); }
    set textContent(v) { for (const c of this.els) c.parentElement = null; this.children = []; this._t = String(v ?? ""); }
    get innerText() { return this.textContent; }
  }
  const h = (tag, attrs, ...filhos) => {
    const el = new El(tag);
    for (const [a, v] of Object.entries(attrs || {})) {
      if (v === null || v === undefined || v === false) continue;
      if (a === "class") [].concat(v).flat(Infinity).filter(Boolean).forEach(c => String(c).split(/\s+/).filter(Boolean).forEach(x => el._cls.add(x)));
      else if (a === "dataset") for (const [x, y] of Object.entries(v)) el.dataset[x] = String(y);
      else if (a === "style") for (const [x, y] of Object.entries(v || {})) el.style[x] = y;
      else if (a === "on") for (const [x, y] of Object.entries(v)) el.addEventListener(x, y);
      else if (a === "hidden" || a === "disabled" || a === "checked" || a === "selected") el[a] = !!v;
      else if (a === "value") el.value = v;
      else el.setAttribute(a, v === true ? "" : v);
    }
    el.appendFiltrado(...filhos);
    return el;
  };
  const daJanela = {}, doDoc = {};
  const doc = { body: new El("body"), hidden: false, get activeElement() { return ativo || this.body; },
    addEventListener: (t, f) => (doDoc[t] || (doDoc[t] = [])).push(f), removeEventListener: (t, f) => { doDoc[t] = (doDoc[t] || []).filter(x => x !== f); },
    getElementById: () => null, querySelector: sel => doc.body.querySelector(sel), elementFromPoint: () => sobOPonto, createTextNode: t => ({ texto: String(t) }) };
  const storage = new Map();
  const globais = { document: doc, addEventListener: (t, f) => (daJanela[t] || (daJanela[t] = [])).push(f), removeEventListener: (t, f) => { daJanela[t] = (daJanela[t] || []).filter(x => x !== f); },
    localStorage: { getItem: k => storage.get(k) ?? null, setItem: (k, v) => storage.set(k, String(v)), removeItem: k => storage.delete(k) },
    matchMedia: q => ({ matches: !!medias[q] }), requestAnimationFrame: () => 1, cancelAnimationFrame() {}, history: { state: null, replaceState() {} },
    location: { pathname: "/app/", search: "", hash: "#/crm" }, innerHeight: 800, scrollBy() {} };
  const antes = {};
  for (const [nome, v] of Object.entries(globais)) { antes[nome] = Object.getOwnPropertyDescriptor(globalThis, nome); Object.defineProperty(globalThis, nome, { value: v, configurable: true, writable: true }); }
  return { h, doc, daJanela, doDoc, storage, rolagens, ativo: () => ativo, sob: el => { sobOPonto = el || null; },
    documento: (t, ev = {}) => { for (const f of [...(doDoc[t] || [])]) f({ type: t, preventDefault() {}, ...ev }); },
    janela: (t, ev = {}) => { for (const f of [...(daJanela[t] || [])]) f({ type: t, preventDefault() {}, ...ev }); },
    desfazer() { for (const nome of Object.keys(globais)) { if (antes[nome]) Object.defineProperty(globalThis, nome, antes[nome]); else delete globalThis[nome]; } } };
}

/** ui de mentira: o suficiente para as telas do CRM montarem (cada stub devolve um elemento com a classe real). */
function uiDeMentira(h, registro = {}) {
  const seg = o => {
    const el = h("div", { class: ["seg", o.classe], role: "tablist", "aria-label": o.rotulo });
    for (const op of o.opcoes || []) el.appendChild(h("button", { type: "button", class: "seg-op", role: "tab", "aria-selected": String(op.valor === o.valor), dataset: { valor: op.valor },
      on: { click: () => { el.ativar(op.valor); if (o.aoMudar) o.aoMudar(op.valor); } } }, op.rotulo, h("span", { class: "seg-n" })));
    el.valor = o.valor;
    el.ativar = v => { el.valor = v; for (const b of el.querySelectorAll(".seg-op")) b.setAttribute("aria-selected", String(b.dataset.valor === v)); };
    el.contar = (id, n) => { const b = el.querySelectorAll(".seg-op").find(x => x.dataset.valor === id); if (b) b.querySelector(".seg-n").textContent = n == null ? "" : String(n); };
    el.__mudar = v => { el.ativar(v); if (o.aoMudar) o.aoMudar(v); };
    return el;
  };
  return {
    h, limpar: el => { el.textContent = ""; return el; }, icone: n => h("svg", { class: "ic", dataset: { n } }), debounce: f => f,
    cabecalho: o => h("header", { class: "cab" }, h("h1", { class: "cab-titulo" }, o.titulo), o.sub || null, ...[].concat(o.acoes || []).filter(Boolean)),
    segmentado: seg, abas: o => { const el = seg({ ...o, classe: "abas" }); return { el, ativar: el.ativar, contar: el.contar, get ativo() { return el.valor; } }; },
    esqueleto: () => h("div", { class: "esqueleto" }), vazio: o => h("div", { class: ["vazio", o.tipo && `vazio-${o.tipo}`] }, o.titulo || ""), erroCartao: e => h("div", { class: "erro-cartao" }, String(e && (e.codigo || e.message))),
    brl: (v, o) => `R$ ${o && o.centavos === false ? Math.round(Number(v)) : Number(v).toFixed(2)}`, num: v => String(v), pct: v => `${Math.round(v * 100)}%`,
    relativo: isoT => (Date.parse(isoT) < Date.now() ? "há 2 dias" : "amanhã"), hojeSP: d => (d ? new Date(d) : new Date()).toISOString().slice(0, 10),
    dataBR: () => "04/10/2026", dataCurtaBR: () => "04/10", horaBR: isoT => String(isoT || "").slice(11, 16), dataHoraBR: isoT => `04/10/2026 ${String(isoT || "").slice(11, 16)}`, telBR: t => `(${String(t).slice(2, 4)}) …`,
    avatar: (nome, id) => h("span", { class: "avatar", dataset: { id: String(id) }, title: nome }), pilula: (t, cor, x = {}) => h("span", { class: ["pilula", `pilula-${cor}`, x.class], title: x.title || null, dataset: x.variante ? { variante: x.variante, chave: cor } : null }, String(t ?? cor)),
    etiqueta: e => h("span", { class: "etiq" }, e.nome),
    tabela: o => {
      const el = h("div", { class: "tabela-env" }, h("table", { class: "tabela" }, h("tbody")));
      registro.colunas = o.colunas;
      const api = { el, atualizar(l) { registro.linhas = l; const tb = el.querySelector("tbody"); tb.textContent = ""; for (const x of l) tb.appendChild(h("tr", null, o.colunas.map(c => h("td", null, c.render ? c.render(x) : x[c.chave])))); }, selecionados: () => [] };
      api.atualizar(o.linhas || []);
      return api;
    },
    toast: t => { (registro.toasts || (registro.toasts = [])).push(t); return { fechar() {} }; }, anunciar: t => { (registro.avisos || (registro.avisos = [])).push(t); }, comportamentoRolagem: () => "auto",
    acaoComDesfazer: o => new Promise(res => { (registro.desfazer || (registro.desfazer = [])).push({ ...o, res }); if (o.aplicar) o.aplicar(); }),
    modal: async () => null, confirmar: async () => true, menu: () => ({ fechar() {} }), deslizar: () => {}, flutuante: () => ({ fechar() {} }), carregando: async (b, p) => p,
    campo: o => h("label", { class: "campo", dataset: { campo: o.nome } }, o.rotulo || "", h(o.tipo === "textarea" ? "textarea" : o.tipo === "select" ? "select" : "input", { name: o.nome, type: o.tipo === "interruptor" ? "checkbox" : "text", value: o.valor ?? "", checked: !!o.valor })),
    seletorEtiquetas: () => h("div", { class: "sel-etiq" }), seletorPessoa: () => h("select", { class: "sel" }), lerForm: () => ({}), marcarErro() {}, copiar: async () => {},
  };
}

function h0(D, ...a) { const el = D.h(...a); D.doc.body.appendChild(el); return el; }
const V = { crm: "CRM", negocio: "Oportunidade", negocios: "Oportunidades", contato: "Paciente", contatos: "Pacientes", servico: "Procedimento", vertical: "odonto",
  ganhar: "Fechou", perder: "Não fechou", min: x => ({ negocios: "oportunidades", negocio: "oportunidade", contato: "paciente", contatos: "pacientes" })[x] || x,
  art: () => "a", novo: x => (x === "contato" ? "Novo paciente" : "Nova oportunidade"), nenhum: () => "Nenhuma oportunidade" };
const ETAPAS = [{ id: "s1", nome: "Nova", tipo: "aberto", marco: "nova", probabilidade: 10, ordem: 1 }, { id: "s2", nome: "Agendada", tipo: "aberto", marco: "agendada", probabilidade: 30, ordem: 2 },
  { id: "s4", nome: "Faltou", tipo: "aberto", marco: "faltou", probabilidade: 10, ordem: 3 },
  { id: "s5", nome: "Fechou", tipo: "ganho", marco: "fechou", probabilidade: 100, ordem: 4 }, { id: "s6", nome: "Não fechou", tipo: "perdido", marco: "nao_fechou", probabilidade: 0, ordem: 5 }];

/**
 * Gaveta do negócio de verdade (crm-negocio.js) com o servidor de mentira: `srv.neg` é o negócio guardado (nx_negocio_ver devolve, nx_negocio_mover e
 * nx_agenda_presenca mudam). `falhas[nome]` = erro a lançar uma vez. ui.modal responde com `respModal` (o valor do ganho, o motivo da perda).
 */
async function montarGaveta(D, { negocio, respModal = {}, falhas = {}, presencaAusente = false } = {}) {
  const { h } = D;
  const reg = { chamadas: [], gavetas: [], aoMudar: [], toastsO: [] };
  const ui = uiDeMentira(h, reg);
  ui.gaveta = o => { const g = { corpo: h("div", { class: "gaveta-corpo" }), titulo: o.titulo, trocarTitulo(t) { g.titulo = t; }, fechar() { g.fechada = true; if (o.aoFechar) o.aoFechar(); } }; reg.gavetas.push(g); D.doc.body.appendChild(g.corpo); return g; };
  ui.modal = async () => respModal;
  ui.toast = (t, o = {}) => { (reg.toasts || (reg.toasts = [])).push(t); reg.toastsO.push({ t, ...o }); return { fechar() {} }; };
  ui.dataCurtaBR = () => "06/10";
  const srv = { neg: { id: 801, titulo: "Ana Souza", status: "aberto", estagio_id: "s2", funil_id: "f1", valor_previsto: 1200, campos: {}, origem: "whatsapp", ...negocio } };
  const base = { funis: [{ id: "f1", nome: "Pacientes", padrao: true, ativo: true, conta_no_ads: true, estagios: ETAPAS }], etiquetas: [], usuarios: [], campos: [], motivos: [{ id: "m1", nome: "Preço" }], ticket: {} };
  const estagio = id => ETAPAS.find(e => e.id === id) || null;
  const k = { ui, h, L, base, v: V, ctx: { cliente: { id: "cli-g" }, navegar() {}, temModulo: () => false },
    api: { rpcC: async (nome, p, o = {}) => {
      reg.chamadas.push({ nome, p, o });
      if (falhas[nome]) { const e = falhas[nome]; delete falhas[nome]; throw e; }
      if (nome === "nx_contato_ver") return { contato: { id: 501, nome: "Ana Souza", telefone: "5512998303030" } };
      if (nome === "nx_negocio_ver") return { negocio: { ...srv.neg, status: estagio(srv.neg.estagio_id).tipo }, contato: { id: 501, nome: "Ana Souza", telefone: "5512998303030" }, tarefas: [], notas: [], tempo: [], conversas: [] };
      if (nome === "nx_negocio_mover") { srv.neg.estagio_id = p.p_estagio; if (p.p_extra && p.p_extra.valor != null) srv.neg.valor = p.p_extra.valor; return { id: p.p_id, estagio_id: p.p_estagio }; }
      if (nome === "nx_agenda_presenca") {
        if (presencaAusente) throw Object.assign(new Error("x"), { status: 404, codigo: "Could not find the function public.nx_agenda_presenca(p_estado, p_negocio, p_token) in the schema cache" });
        srv.neg.campos = { ...srv.neg.campos }; if (p.p_estado === "limpar") delete srv.neg.campos.presenca; else srv.neg.campos.presenca = p.p_estado;
        if (p.p_estado === "faltou") srv.neg.estagio_id = "s4";
        return { ok: true, presenca: srv.neg.campos.presenca || null, estagio_id: srv.neg.estagio_id };
      }
      return {};
    } },
    pode: () => true, eu: () => "u1", cor: () => null, usuario: () => null, etiqueta: () => null, motivosPorId: () => ({ m1: "Preço" }),
    toastErro: e => { reg.erros = (reg.erros || []).concat(String(e && (e.codigo || e.message))); }, erro: e => String(e && (e.codigo || e.message)),
    funil: id => base.funis.find(f => f.id === id) || null, funilDoEstagio: () => base.funis[0], funilPadrao: () => base.funis[0], estagio,
    mod: async () => ({ blocoTarefas: () => h("div"), blocoNotas: () => h("div"), blocoTempo: () => h("div") }), criarEtiqueta: async () => null,
    novaReq: () => "req-1", escrever: async (nome, p) => { reg.chamadas.push({ nome, p }); return { resultado: { id: 977, ...p.p_negocio } }; }, rascunho: () => ({ apagar() {} }) };
  const N = await import("../web/app/crm-negocio.js");
  const g = await N.abrirNegocio(k, srv.neg.id, { aoMudar: c => reg.aoMudar.push(c) });
  const cham = nome => reg.chamadas.filter(c => c.nome === nome);
  const corpo = () => g.corpo;
  return { k, N, g, reg, srv, cham, corpo, desfazer: () => reg.desfazer || [] };
}

test("C1 gaveta (DOM): «Fechou» é adiado como no Kanban — a tela muda já, NADA vai ao servidor nos 7 s; Desfazer antes = nada aconteceu", async () => {
  const D = domDeMentira();
  try {
    const t = await montarGaveta(D, { respModal: { valor: 900 } });
    const ganhou = t.corpo().querySelector(".ng-ganhou");
    assert.ok(ganhou && !ganhou.disabled);
    ganhou.clique(); await tique(); await tique();
    assert.equal(t.cham("nx_negocio_mover").length, 0, "nada foi ao servidor ainda");
    assert.equal(t.desfazer().length, 1);
    const av = t.desfazer()[0];
    assert.equal(av.texto, "Fechou! «Ana Souza» · R$ 900.00", "o mesmo texto do Kanban (L.textoMovimento)");
    assert.equal(typeof av.firmar, "function", "a gravação de verdade é o firmar do aviso");
    // a tela já mostra o destino: status «Fechou», selo «Confirmando…», ações e fita travadas, valor final
    assert.ok(t.corpo().querySelector(".ng-confirmando"), "selo «Confirmando…»");
    assert.equal(t.corpo().querySelector(".ng").attrs["aria-busy"], "true");
    assert.equal(t.corpo().querySelector(".ng-ganhou"), null, "status já é ganho");
    assert.ok(t.corpo().querySelector(".ng-reabrir").disabled, "não aceita outro movimento por cima");
    assert.ok(t.corpo().querySelectorAll(".ng-etapa").every(b => b.disabled), "fita travada");
    assert.match(t.corpo().querySelector(".ng-valor").textContent, /900.*valor final/);
    // Desfazer antes dos 7 s: só a tela volta
    await av.reverter(); av.res({ estado: "desfeita" }); await tique();
    assert.equal(t.cham("nx_negocio_mover").length, 0, "desfeito antes dos 7 s = nada aconteceu no servidor");
    assert.ok(t.corpo().querySelector(".ng-ganhou") && !t.corpo().querySelector(".ng-ganhou").disabled, "voltou ao aberto");
    assert.equal(t.corpo().querySelector(".ng-confirmando"), null);
    assert.equal(t.reg.aoMudar.length, 0, "o quadro não foi avisado de nada");
  } finally { D.desfazer(); }
});

test("C1 gaveta (DOM): o aviso fecha → firmar grava (com o valor) e avisa o quadro; página saindo → keepalive; erro ambíguo confere no servidor", async () => {
  const D = domDeMentira();
  try {
    const t = await montarGaveta(D, { respModal: { valor: 900 } });
    t.corpo().querySelector(".ng-ganhou").clique(); await tique(); await tique();
    const av = t.desfazer()[0];
    // outro clique no meio dos 7 s (pelo «Reabrir» travado não dá; pela fita também não): nada novo é pedido
    assert.equal(t.desfazer().length, 1);
    await av.firmar(); av.res({ estado: "mantida" }); await tique();
    const mv = t.cham("nx_negocio_mover");
    assert.equal(mv.length, 1);
    assert.deepEqual(mv[0].p, { p_id: 801, p_estagio: "s5", p_ordem: null, p_extra: { valor: 900 } });
    assert.deepEqual(mv[0].o, {}, "aviso fechado normalmente: pedido comum");
    assert.deepEqual(t.reg.aoMudar.map(c => c.estagio_id), ["s5"], "o quadro foi avisado só depois de gravar");
    assert.equal(t.corpo().querySelector(".ng-confirmando"), null, "recarregou do servidor sem o selo");
    await av.firmar();
    assert.equal(t.cham("nx_negocio_mover").length, 1, "firmar de novo não grava duas vezes");
    // reabrir (ganho → aberto) também é adiado; a página sai antes dos 7 s → keepalive
    t.corpo().querySelector(".ng-reabrir").clique(); await tique(); await tique();
    const av2 = t.desfazer()[1];
    assert.equal(av2.texto, "«Ana Souza» reaberta em «Nova»");
    assert.equal(t.cham("nx_negocio_mover").length, 1);
    await av2.firmar({ saindo: true });
    assert.deepEqual(t.cham("nx_negocio_mover")[1].o, { keepalive: true });
    av2.res({ estado: "mantida" });
  } finally { D.desfazer(); }
  // erro ambíguo (prazo) com o servidor já no destino = gravou; erro de verdade = firmar falha (o aviso volta a tela)
  const D2 = domDeMentira();
  try {
    const t = await montarGaveta(D2, { respModal: { motivo_perda_id: "m1" }, falhas: { nx_negocio_mover: Object.assign(new Error("tempo"), { codigo: "tempo_esgotado" }) } });
    t.srv.neg.estagio_id = "s2";
    const perdeu = t.corpo().querySelector(".ng-perdeu");
    perdeu.clique(); await tique(); await tique();
    const av = t.desfazer()[0];
    assert.equal(av.texto, "«Ana Souza» registrada como «Não fechou»");
    t.srv.neg.estagio_id = "s6";                // o servidor aplicou mesmo com o prazo estourado
    const card = await av.firmar();
    assert.equal(card.estagio_id, "s6");
    assert.deepEqual(t.reg.aoMudar.map(c => c.estagio_id), ["s6"]);
    av.res({ estado: "mantida" }); await tique();
  } finally { D2.desfazer(); }
  const D3 = domDeMentira();
  try {
    const t = await montarGaveta(D3, { respModal: { valor: 10 }, falhas: { nx_negocio_mover: Object.assign(new Error("valor"), { codigo: "dados_invalidos" }) } });
    t.corpo().querySelector(".ng-ganhou").clique(); await tique(); await tique();
    const av = t.desfazer()[0];
    await assert.rejects(av.firmar(), e => e.codigo === "dados_invalidos", "firmar lança: o ui.acaoComDesfazer mostra o erro e chama reverter");
    await av.reverter(); await tique();
    assert.ok(t.corpo().querySelector(".ng-ganhou") && !t.corpo().querySelector(".ng-ganhou").disabled, "a tela voltou ao que o servidor tem");
    assert.equal(t.reg.aoMudar.length, 0);
  } finally { D3.desfazer(); }
});

test("C1 gaveta (DOM): mover entre etapas abertas continua imediato, com Desfazer que devolve a etapa", async () => {
  const D = domDeMentira();
  try {
    const t = await montarGaveta(D, { negocio: { estagio_id: "s1" } });
    const etapa = t.corpo().querySelectorAll(".ng-etapa").find(b => b.textContent === "Faltou");
    etapa.clique(); await tique(); await tique();
    assert.deepEqual(t.cham("nx_negocio_mover").map(c => c.p.p_estagio), ["s4"], "aberto → aberto grava na hora");
    const av = t.desfazer()[0];
    assert.equal(av.firmar, undefined);
    await av.reverter();
    assert.deepEqual(t.cham("nx_negocio_mover").map(c => [c.p.p_estagio, c.p.p_extra]), [["s4", {}], ["s1", {}]]);
  } finally { D.desfazer(); }
});

test("C3 gaveta (DOM): «de onde veio» com a pílula de origem e a frase do rastreio (site, campanha, página, clique)", async () => {
  const D = domDeMentira();
  try {
    const t = await montarGaveta(D, { negocio: { origem: "site", rastreio: { codigo: "AB12CD", utm_source: "google", utm_medium: "cpc", utm_campaign: "Implante SP", pagina: "/implante", clique_em: "2026-10-06T13:12:00Z" } } });
    const bloco = t.corpo().querySelector(".ng-rastreio");
    assert.ok(bloco);
    assert.equal(bloco.querySelector(".ng-rastreio-frase").textContent, "Veio do site · campanha «Implante SP» · página /implante · clique em 06/10 13:12");
    assert.equal(bloco.querySelector(".pilula").dataset.chave, "site");
    assert.ok(!/AB12CD/.test(t.corpo().textContent), "o código do rastreio não aparece");
    // o topo também leva a pílula de origem (manual não)
    assert.equal(t.corpo().querySelector(".ng-status .ng-origem").dataset.chave, "site");
  } finally { D.desfazer(); }
  const D2 = domDeMentira();
  try {
    const t = await montarGaveta(D2, { negocio: { origem: "anuncio", plataforma: "meta", campanha_nome: "Avaliação humanizada" } });
    assert.equal(t.corpo().querySelector(".ng-rastreio-frase").textContent, "Veio do anúncio (Meta) · campanha «Avaliação humanizada»");
    const t2 = await montarGaveta(D2, { negocio: { origem: "manual" } });
    assert.equal(t2.corpo().querySelector(".ng-status .ng-origem"), null, "cadastro manual não ganha pílula no topo");
  } finally { D2.desfazer(); }
});

test("C6 gaveta (DOM): consulta que passou mostra Compareceu/Faltou; Faltou grava, move para «Faltou» e o Desfazer limpa e devolve a etapa", async () => {
  const D = domDeMentira();
  try {
    const t = await montarGaveta(D, { negocio: { consulta_em: iso(-1, 10) } });
    const bloco = t.corpo().querySelector(".ng-presenca");
    assert.ok(bloco, "consulta de ontem: pergunta a presença");
    assert.match(bloco.querySelector(".ng-presenca-txt").textContent, /^Consulta de 06\/10 às/);
    const bts = bloco.querySelectorAll(".ng-pres");
    assert.deepEqual(bts.map(b => [b.dataset.estado, b.attrs["aria-pressed"]]), [["compareceu", "false"], ["faltou", "false"]]);
    bts[1].clique(); for (let i = 0; i < 4; i++) await tique();
    assert.deepEqual(t.cham("nx_agenda_presenca").map(c => c.p), [{ p_negocio: 801, p_estado: "faltou" }]);
    assert.equal(t.desfazer()[0].texto, "Faltou à consulta · movida para «Faltou»");
    assert.equal(t.reg.aoMudar.at(-1).estagio_id, "s4", "o quadro sabe que a etapa mudou");
    assert.equal(t.corpo().querySelector(".ng-pres-faltou").attrs["aria-pressed"], "true", "recarregou com a marca");
    // Desfazer: limpa (não havia marca) e devolve a etapa de antes (aberta → aberta, sem perguntas)
    await t.desfazer()[0].reverter();
    assert.deepEqual(t.cham("nx_agenda_presenca").map(c => c.p.p_estado), ["faltou", "limpar"]);
    assert.deepEqual(t.cham("nx_negocio_mover").map(c => [c.p.p_estagio, c.p.p_extra]), [["s2", {}]]);
    assert.equal(t.srv.neg.estagio_id, "s2");
    // tocar de novo no marcado limpa
    t.corpo().querySelector(".ng-pres-compareceu").clique(); for (let i = 0; i < 4; i++) await tique();
    t.corpo().querySelector(".ng-pres-compareceu").clique(); for (let i = 0; i < 4; i++) await tique();
    assert.deepEqual(t.cham("nx_agenda_presenca").map(c => c.p.p_estado).slice(-2), ["compareceu", "limpar"]);
  } finally { D.desfazer(); }
});

test("C6 gaveta (DOM): sem consulta passada não pergunta; servidor sem nx_agenda_presenca esconde o bloco na sessão", async () => {
  const D = domDeMentira();
  try {
    const futuro = await montarGaveta(D, { negocio: { consulta_em: iso(2) } });
    assert.equal(futuro.corpo().querySelector(".ng-presenca"), null, "consulta futura");
    const sem = await montarGaveta(D, { negocio: { consulta_em: null } });
    assert.equal(sem.corpo().querySelector(".ng-presenca"), null, "sem consulta");
    const fechado = await montarGaveta(D, { negocio: { consulta_em: iso(-3), estagio_id: "s5" } });
    assert.equal(fechado.corpo().querySelector(".ng-presenca"), null, "fechado e sem marca: não pergunta");
    const t = await montarGaveta(D, { negocio: { consulta_em: iso(-1) }, presencaAusente: true });
    t.corpo().querySelector(".ng-pres-faltou").clique(); for (let i = 0; i < 4; i++) await tique();
    assert.equal(t.k.__semPresenca, true);
    assert.equal(t.corpo().querySelector(".ng-presenca"), null, "o bloco some");
    assert.match(t.reg.toasts.at(-1), /ainda não registra a presença/);
    assert.equal(t.desfazer().length, 0);
  } finally { D.desfazer(); }
});

test("C2 novo negócio (DOM): criado pela conversa NÃO abre a gaveta (aviso com «Abrir»); criado fora dela abre", async () => {
  const D = domDeMentira();
  try {
    const t = await montarGaveta(D);
    const antes = t.reg.gavetas.length;
    await t.N.novoNegocio(t.k, { contato_id: 501, conversa_id: 61 }, { aoCriar: n => t.reg.aoMudar.push({ criado: n.id }) });
    const g = t.reg.gavetas.at(-1);
    g.corpo.querySelector("form").dispara("submit"); for (let i = 0; i < 4; i++) await tique();
    const criado = t.reg.chamadas.find(c => c.nome === "nx_negocio_salvar");
    assert.equal(criado.p.p_negocio.conversa_id, 61);
    assert.ok(g.fechada, "o formulário fecha");
    await esperar(320);
    assert.equal(t.reg.gavetas.length, antes + 1, "nenhuma gaveta do negócio por cima da conversa");
    const aviso = t.reg.toastsO.at(-1);
    assert.match(aviso.t, /criada e ligada a este atendimento/);
    assert.equal(aviso.acao.rotulo, "Abrir");
    assert.deepEqual(t.reg.aoMudar.at(-1), { criado: 977 });
    aviso.acao.fn(); await tique(); await tique();
    assert.equal(t.reg.gavetas.length, antes + 2, "«Abrir» abre a gaveta do negócio criado");
    // fora da conversa (Kanban, contatos): abre sozinho como antes
    await t.N.novoNegocio(t.k, { contato_id: 501 }, {});
    t.reg.gavetas.at(-1).corpo.querySelector("form").dispara("submit"); for (let i = 0; i < 4; i++) await tique();
    const n = t.reg.gavetas.length;
    await esperar(320);
    assert.equal(t.reg.gavetas.length, n + 1);
    assert.equal(t.reg.toastsO.at(-1).acao, undefined);
  } finally { D.desfazer(); }
});

/* ============================================================ (b) Kanban */
const quadroP100 = () => ({ colunas: [
  { estagio_id: "s1", total: 4, soma_previsto: 300, soma_valor: 0, itens: [
    { id: 1, titulo: "Ana", status: "aberto", estagio_id: "s1", valor_previsto: 100, ordem: 1, origem: "anuncio", plataforma: "meta", anuncio: true },
    { id: 2, titulo: "Bia", status: "aberto", estagio_id: "s1", valor_previsto: 200, ordem: 2, origem: "site" },
    { id: 5, titulo: "Edu", status: "aberto", estagio_id: "s1", valor_previsto: null, ordem: 3, origem: "manual" }] },
  { estagio_id: "s2", total: 1, soma_previsto: 50, soma_valor: 0, itens: [{ id: 3, titulo: "Caio", status: "aberto", estagio_id: "s2", valor_previsto: 50, ordem: 1, origem: "whatsapp" }] },
  { estagio_id: "s5", total: 0, soma_previsto: 0, soma_valor: 0, itens: [] }, { estagio_id: "s6", total: 0, soma_previsto: 0, soma_valor: 0, itens: [] }] });

async function montarKanbanP100(D, { coluna = async () => ({ itens: [], tem_mais: false }) } = {}) {
  const { h } = D;
  const reg = { leituras: [] };
  const ui = uiDeMentira(h, reg);
  ui.esqueleto = tipo => h("div", { class: ["esqueleto", `esqueleto-${tipo || "lista"}`] });
  const etapas = ETAPAS.filter(e => e.id !== "s4");
  const base = { funis: [{ id: "f1", nome: "Pacientes", padrao: true, ativo: true, estagios: etapas }], etiquetas: [], usuarios: [], campos: [], motivos: [], ticket: {} };
  const k = { ui, h, L, base, G: null, v: V, ctx: { cliente: { id: "cli-p100" }, titulo() {}, navegar() {}, pulso: null },
    mod: async nome => nome === "visoes" ? { controlesVisoes: () => ({ el: h("div"), atualizar() {} }) } : ({ abrirNegocio() {}, novoNegocio() {}, prepararMovimento: async () => ({}), moverNegocio: async () => ({}) }),
    api: { rpcC: async (nome, p) => { reg.leituras.push(nome); if (nome === "nx_negocios_coluna") return coluna(p); return nome === "nx_negocios_kanban" ? quadroP100() : {}; } },
    pode: () => true, cor: c => c || null, usuario: () => null, etiqueta: () => null, toastErro() {}, erro: e => String(e && e.codigo),
    funil: id => base.funis.find(f => f.id === id) || null, funilPadrao: () => base.funis[0], funilDoEstagio: () => base.funis[0], estagio: id => etapas.find(x => x.id === id) || null, aoBaseMudar: () => () => {} };
  const { montarKanban } = await import("../web/app/crm-kanban.js");
  const tela = h0(D, "div", { class: "crm" });
  const api = await montarKanban(k, tela, { query: {} });
  return { tela, api, reg };
}

test("C4/C10 Kanban (DOM): pílula de origem no cartão (manual sem pílula) e «x de anúncio» no cabeçalho da coluna (com + quando falta carregar)", async () => {
  const D = domDeMentira();
  try {
    const { tela, api } = await montarKanbanP100(D);
    const cartao = id => tela.querySelector(`.kc[data-id="${id}"]`);
    const p1 = cartao(1).querySelector(".kc-rod .kc-origem");
    assert.deepEqual([p1.dataset.variante, p1.dataset.chave], ["origem", "anuncio"]);
    assert.ok(!p1.classList.contains("kc-origem-outra"));
    assert.equal(cartao(2).querySelector(".kc-origem-outra").dataset.chave, "site");
    assert.equal(cartao(3).querySelector(".kc-origem-outra").dataset.chave, "whatsapp");
    assert.equal(cartao(5).querySelector(".kc-origem"), null, "cadastro manual não ganha pílula");
    const anun = id => tela.querySelector(`.kb-col[data-estagio="${id}"] .kb-col-anuncio`);
    assert.ok(!anun("s1").hidden);
    assert.equal(anun("s1").textContent, "1+ de anúncio", "4 na etapa, 3 carregados: o número é parcial");
    assert.match(anun("s1").querySelector(".pilula").attrs.title, /entre os cartões carregados/);
    assert.ok(anun("s2").hidden, "coluna sem anúncio não mostra nada");
    api.desmontar();
  } finally { D.desfazer(); }
});

test("C5 Kanban (DOM): «Ver mais» põe um cartão-esqueleto no fim da coluna enquanto a página chega; ele some depois", async () => {
  const D = domDeMentira();
  try {
    let liberar;
    const chegou = new Promise(r => { liberar = r; });
    const { tela, api } = await montarKanbanP100(D, { coluna: () => chegou });
    const col = tela.querySelector('.kb-col[data-estagio="s1"]');
    const bt = col.querySelector(".kb-mais");
    assert.ok(bt, "há «Ver mais»");
    bt.clique(); await tique();
    const sk = col.querySelector(".kb-sk");
    assert.ok(sk && sk.querySelector(".esqueleto-cartao"), "esqueleto do tipo cartão");
    assert.ok(sk.nextSibling && sk.nextSibling.classList.contains("kb-mais-item"), "antes do botão");
    liberar({ itens: [{ id: 9, titulo: "Gil", status: "aberto", estagio_id: "s1", origem: "anuncio", plataforma: "google" }], tem_mais: false });
    await tique(); await tique();
    assert.equal(col.querySelector(".kb-sk"), null, "o esqueleto saiu");
    assert.ok(tela.querySelector('.kc[data-id="9"]'));
    assert.equal(col.querySelector(".kb-col-anuncio").textContent, "2 de anúncio", "a contagem acompanha os cartões carregados");
    api.desmontar();
  } finally { D.desfazer(); }
});

/* ============================================================ (b) Contatos */
test("C4/C9 Contatos (DOM): pílula de origem na coluna; «Nome» e «Último contato» ordenam no servidor (p_ordem) com aria-sort; de novo volta a Recentes", async () => {
  const D = domDeMentira();
  try {
    const { h } = D;
    const reg = { chamadas: [] };
    const ui = uiDeMentira(h, reg);
    // tabela com cabeçalho (o ui.tabela real tem <thead> com um <th> por coluna)
    ui.tabela = o => {
      reg.colunas = o.colunas;
      const tb = h("tbody");
      const el = h("div", { class: "tabela-env" }, h("table", { class: "tabela" }, h("thead", null, h("tr", null, o.colunas.map(c => h("th", { scope: "col" }, c.rotulo)))), tb));
      return { el, atualizar(l) { ui.limpar(tb); for (const x of l) tb.appendChild(h("tr", null, o.colunas.map(c => h("td", null, c.render ? c.render(x) : x[c.chave])))); }, selecionados: () => [] };
    };
    const base = { usuarios: [], etiquetas: [], campos: [], motivos: [], funis: [] };
    const k = { ui, h, L, base, v: V, ctx: { cliente: { id: "cli-ct100" }, titulo() {}, navegar() {}, temModulo: () => false },
      api: { rpcC: async (nome, p) => { reg.chamadas.push({ nome, p }); return { itens: [{ id: 1, nome: "Ana", telefone: "5512999990000", origem: "anuncio", plataforma: "google", ultimo_contato_em: iso(-2) }, { id: 2, nome: "Bia", origem: "site" }], total: 2, tem_mais: false }; } },
      pode: () => true, eu: () => "u1", erro: e => String(e && e.codigo), toastErro() {}, cor: () => null, etiqueta: () => null, usuario: () => null,
      mod: async nome => nome === "visoes" ? { controlesVisoes: () => ({ el: h("div"), atualizar() {} }) } : {} };
    const { montarContatos } = await import("../web/app/crm-listas.js");
    const tela = h0(D, "div", { class: "crm" });
    const api = await montarContatos(k, tela, { query: {} });
    // origem: a pílula padrão
    const pilOrigem = reg.colunas.find(c => c.chave === "origem").render({ origem: "anuncio", plataforma: "google" });
    assert.deepEqual([pilOrigem.dataset.variante, pilOrigem.dataset.chave], ["origem", "anuncio"]);
    assert.equal(reg.colunas.find(c => c.chave === "origem").render({ origem: "manual" }).dataset.chave, "manual");
    // cabeçalhos ordenáveis no servidor
    const ths = tela.querySelectorAll("thead th");
    const thNome = ths[reg.colunas.findIndex(c => c.chave === "nome")], thUlt = ths[reg.colunas.findIndex(c => c.chave === "ultimo_contato_em")];
    assert.deepEqual([thNome.attrs["aria-sort"], thUlt.attrs["aria-sort"]], ["none", "none"]);
    assert.ok(thNome.querySelector("button.th-ord") && thUlt.querySelector("button.th-ord"));
    assert.equal(ths[reg.colunas.findIndex(c => c.chave === "email")].querySelector("button"), null, "e-mail não ordena (o servidor não sabe)");
    const ordem = () => reg.chamadas.filter(c => c.nome === "nx_contatos_listar").at(-1).p.p_ordem;
    assert.equal(ordem(), "recentes");
    thNome.querySelector("button").clique(); await tique();
    assert.equal(ordem(), "nome"); assert.equal(thNome.attrs["aria-sort"], "ascending");
    assert.equal(tela.querySelector("select.sel").value, "nome", "o seletor «Ordenar» acompanha");
    thUlt.querySelector("button").clique(); await tique();
    assert.equal(ordem(), "ultimo_contato"); assert.deepEqual([thNome.attrs["aria-sort"], thUlt.attrs["aria-sort"]], ["none", "descending"]);
    assert.equal(reg.chamadas.at(-1).p.p_pagina, 1, "volta à 1ª página");
    thUlt.querySelector("button").clique(); await tique();
    assert.equal(ordem(), "recentes"); assert.equal(thUlt.attrs["aria-sort"], "none");
    assert.match(reg.avisos.at(-1), /mais recentes/);
    // o seletor também atualiza o aria-sort
    const sel = tela.querySelector("select.sel");
    sel.value = "nome"; sel.dispara("change"); await tique();
    assert.equal(thNome.attrs["aria-sort"], "ascending");
    api.desmontar();
  } finally { D.desfazer(); }
});

/* ============================================================ (b) Tarefas */
test("C5 Tarefas (DOM): concluir mostra o ✓ de sucesso ANTES de a linha mudar de lugar; reabrir não comemora; um toque por vez", async () => {
  const D = domDeMentira();
  try {
    const { h } = D;
    const ordem = [];
    const ui = uiDeMentira(h, {});
    let soltarCheck;
    ui.checkSucesso = (el, o) => { ordem.push(["check", el.classList.contains("tf"), o.texto]); return new Promise(r => { soltarCheck = () => r(true); }); };
    const chamadas = [];
    const k = { ui, h, L, pode: () => true, toastErro() {}, api: { rpcC: async (nome, p) => { chamadas.push([nome, p]); return { id: p.p_id, concluida_em: p.p_concluida ? iso(0) : null }; } } };
    const { itemTarefa } = await import("../web/app/crm-tarefas.js");
    const t = { id: 41, titulo: "Ligar", tipo: "ligacao", vence_em: iso(1), concluida_em: null };
    const li = itemTarefa(k, t, { aoMudar: ev => ordem.push(["mudou", ev.tarefa.id]) });
    const check = li.querySelector(".tf-check input");
    check.checked = true; check.dispara("change"); await tique(); await tique();
    assert.deepEqual(ordem, [["check", true, "Tarefa concluída."]], "o ✓ cobre a linha; a lista ainda não mudou");
    check.checked = false; check.dispara("change"); await tique();
    assert.equal(chamadas.length, 1, "toque no meio do ✓ não vira outra gravação");
    soltarCheck(); await tique(); await tique();
    assert.deepEqual(ordem.at(-1), ["mudou", 41]);
    // reabrir: sem ✓
    const feita = itemTarefa(k, { ...t, concluida_em: iso(0) }, { aoMudar: ev => ordem.push(["mudou2", ev.tarefa.id]) });
    const c2 = feita.querySelector(".tf-check input");
    c2.checked = false; c2.dispara("change"); await tique(); await tique();
    assert.deepEqual(ordem.at(-1), ["mudou2", 41]);
    assert.equal(ordem.filter(x => x[0] === "check").length, 1);
  } finally { D.desfazer(); }
});

/* ============================================================ (b) Funis (C8) */
test("C8 Funis (DOM): funil dos anúncios sem etapa «Faltou» ganha o aviso inline; escolher o marco tira o aviso; fora dos anúncios não avisa", async () => {
  const D = domDeMentira();
  try {
    const { h } = D;
    const reg = {};
    const ui = uiDeMentira(h, reg);
    ui.campo = o => h("label", { class: "campo", dataset: { campo: o.nome } }, o.rotulo || "", h("input", { name: o.nome, type: o.tipo === "interruptor" ? "checkbox" : "text", value: o.valor ?? "", checked: !!o.valor }));
    const etapas = [{ id: "a1", nome: "Nova", tipo: "aberto", marco: "nova", probabilidade: 10 }, { id: "a2", nome: "Agendou", tipo: "aberto", marco: "agendada", probabilidade: 30 },
      { id: "a3", nome: "Avaliou", tipo: "aberto", marco: "orcamento", probabilidade: 50 }, { id: "a5", nome: "Fechou", tipo: "ganho", marco: "fechou", probabilidade: 100 }, { id: "a6", nome: "Não fechou", tipo: "perdido", marco: "nao_fechou", probabilidade: 0 }];
    const base = { funis: [{ id: "f1", nome: "Pacientes", ordem: 1, padrao: true, ativo: true, conta_no_ads: true, estagios: etapas },
      { id: "f2", nome: "Pós-venda", ordem: 2, ativo: true, conta_no_ads: false, estagios: [{ id: "b1", nome: "Novo", tipo: "aberto" }, { id: "b2", nome: "Feito", tipo: "ganho" }] }] };
    const k = { ui, h, L, base, v: V, cor: () => null, api: { rpcC: async () => ({ colunas: [] }) }, erro: e => String(e), recarregarBase: async () => base };
    const ctx = { ui: { carregarCss() {} }, carregar: async () => ({ kit: async () => k }), paleta: [] };
    const { secoesConfig } = await import("../web/app/crm-config.js");
    const alvo = h0(D, "div");
    await secoesConfig.find(s => s.id === "funis").montar(ctx, alvo);
    alvo.querySelectorAll("button").find(b => b.attrs["aria-label"] === "Editar o funil Pacientes").clique();
    for (let i = 0; i < 4; i++) await tique();
    const aviso = alvo.querySelector(".fe-marcos");
    assert.ok(aviso && !aviso.hidden, "falta a etapa de marco «Faltou»");
    assert.match(aviso.textContent, /^Faltou sem etapa: a presença «Faltou» da consulta não vai mover o negócio/);
    const marcoAvaliou = alvo.querySelectorAll(".fe-marco")[2];
    marcoAvaliou.value = "faltou"; marcoAvaliou.dispara("change");
    assert.ok(alvo.querySelector(".fe-marcos").hidden, "com o marco escolhido o aviso some");
    // funil fora dos anúncios não usa marcos
    const alvo2 = h0(D, "div");
    await secoesConfig.find(s => s.id === "funis").montar(ctx, alvo2);
    alvo2.querySelectorAll("button").find(b => b.attrs["aria-label"] === "Editar o funil Pós-venda").clique();
    for (let i = 0; i < 4; i++) await tique();
    assert.ok(alvo2.querySelector(".fe-marcos").hidden);
  } finally { D.desfazer(); }
});

/* ============================================================ (b) Importação (C7) */
test("C7 Importação (DOM): telefone de outro país com «+» aparece como «+1 …» na prévia; sem DDD brasileiro ganha o aviso com o jeito de corrigir", async () => {
  const D = domDeMentira();
  try {
    const { h } = D;
    const reg = { chamadas: [] };
    const ui = uiDeMentira(h, reg);
    const base = { usuarios: [], etiquetas: [], campos: [], motivos: [], funis: [{ id: "f1", nome: "Pacientes", ativo: true, padrao: true, conta_no_ads: false, estagios: [{ id: "s1", nome: "Nova", tipo: "aberto" }] }] };
    const k = { ui, h, L, base, v: V, ctx: { cliente: { id: "cli-i100" }, titulo() {}, navegar() {} }, api: { rpcC: async () => ({}) },
      pode: () => true, erro: e => String(e && e.codigo), toastErro() {}, cor: () => null, funil: id => base.funis.find(f => f.id === id) || null, funilPadrao: () => base.funis[0], estagio: () => base.funis[0].estagios[0],
      etiqueta: () => null, usuario: () => null, recarregarBase: async () => base, criarEtiqueta: async () => null };
    const { montarImportar } = await import("../web/app/crm-importar.js");
    const tela = h0(D, "div", { class: "crm" });
    const api = await montarImportar(k, tela, {});
    const botao = txt => tela.querySelectorAll("button").find(b => b.textContent.trim() === txt);
    tela.querySelector("textarea").value = "Nome;Telefone\nAna;(12) 99830-3030\nJohn;+1 212 555 1234\nMary;1 212 555 1234\nZé;202 555 0143\n";
    botao("Usar o texto colado").clique();
    botao("Continuar").clique();
    botao("Continuar").clique();
    const aviso = tela.querySelector(".imp-aviso-tel");
    assert.ok(aviso, "aviso dos telefones");
    assert.match(aviso.textContent, /2 linhas têm telefone sem DDD brasileiro.*\+ e o código do país.*entram sem telefone/);
    assert.match(aviso.textContent, /1 telefone de outro país \(com \+\) entra como está, sem o 55/);
    const linhas = reg.linhas;
    const tel = reg.colunas.find(c => c.chave === "telefone");
    assert.equal(tel.render(linhas[1]), "+1 2125551234", "exterior não vira «(12) …»");
    assert.equal(tel.render(linhas[2]), "1 212 555 1234", "sem país: como foi digitado");
    assert.match(String(tel.render(linhas[0])), /^\(12\)/, "brasileiro no formato de sempre");
    assert.match(linhas[2]._erros[0], /sem DDD brasileiro/);
    api.desmontar();
  } finally { D.desfazer(); }
});

/* ============================================================ (c) estáticos */
test("crm.css (plano 100): só tokens, alvos de 44 px no toque, movimento novo só fora de reduced-motion, nada abaixo de 12 px no cartão", () => {
  const css = ler("crm.css");
  const bloco = css.slice(css.indexOf("Plano 100 (08/10/2026) — frente C"));
  assert.ok(bloco.length > 1000, "o bloco do plano 100 existe");
  assert.ok(!/#[0-9a-fA-F]{3,8}\b/.test(bloco) && !/\brgba?\(/.test(bloco), "sem cor fixa");
  assert.ok(!/transition:\s*all/.test(css));
  assert.ok(/@media \(max-width: 760px\), \(pointer: coarse\) \{\s*\.ng-pres \{ min-height: 44px; \}/.test(bloco), "presença com 44 px no toque");
  // toda animação do bloco fica dentro de prefers-reduced-motion: no-preference
  const semMov = bloco.replace(/@media \(prefers-reduced-motion: no-preference\) \{[\s\S]*?\n\}/g, "");
  assert.ok(!/animation:|@keyframes/.test(semMov), "movimento só fora de reduced-motion");
  assert.ok(/\.kc-origem\.pilula \{ font-size: var\(--fs-12\)/.test(css), "a pílula do cartão não desce a 11 px");
  assert.ok(!/^\.kc-origem \{ display: inline-grid/m.test(css), "o glifo antigo saiu do CSS");
  assert.ok(/\.ng-anuncio > \.ic \{/.test(css), "a cor da Meta não pinta o ícone da pílula de origem");
  const neg = ler("crm-negocio.js"), kb = ler("crm-kanban.js");
  assert.ok(/L\.movimentoAdiado\(antes\.estagio && antes\.estagio\.tipo, e\.tipo\)/.test(neg) && /ui\.acaoComDesfazer\(\{ texto, reverter, firmar, aoCriar: h => \{ mov\.firmarAgora = h\.firmarAgora; \} \}\)/.test(neg), "gaveta: movimento adiado com firmar (e firmarAgora ao fechar — revisão)");
  assert.ok(/L\.textoMovimento\(/.test(kb) && /L\.patchMovimento\(destino, extra\)/.test(kb) && /L\.extraDeVolta\(/.test(kb), "Kanban usa as mesmas peças");
  assert.ok(/ui\.esqueleto\("cartao"\)/.test(neg) && /ui\.esqueleto\("cartao"\)/.test(kb));
  assert.ok(/tema: "crm"/.test(kb) && /tema: "crm"/.test(ler("crm-listas.js")) && /tema: "crm"/.test(ler("crm-tarefas.js")), "vazios com o tema do CRM");
});

test("revisão · formulários que só guardam as etiquetas (Novo negócio, Importar) emitem na hora: a etiqueta marcada logo antes do «Criar» não se perde", () => {
  const neg = readFileSync(new URL("../web/app/crm-negocio.js", import.meta.url), "utf8"), imp = readFileSync(new URL("../web/app/crm-importar.js", import.meta.url), "utf8");
  assert.match(neg, /aoMudar: ids => \{ etiquetas = ids; \}, debounceMs: 0 \}\);/);
  assert.match(imp, /ui\.seletorEtiquetas\(\{ debounceMs: 0, todas: k\.base\.etiquetas, marcadas: o\.etiquetas/);
});
