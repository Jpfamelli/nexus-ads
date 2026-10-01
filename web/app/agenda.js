/* ============================================================
   ÓRBITA — agenda.js · consultas ligadas ao CRM
   Consulta e gravação usam as RPCs da agenda; o servidor é a
   autoridade para horários, capacidade e conflitos.
   M26: a agenda é uma GRADE DE HORÁRIO — eixo de horas, colunas por
   dia (semana) ou por responsável (dia), blocos com altura = duração
   e cor = procedimento (--pal-*), bloqueios hachurados, horário
   fechado sombreado, linha de «agora» e toque no vazio para marcar.
   Celular: faixa de dias rolável no topo + o dia com régua de horas;
   dia livre vira uma linha «Livre · Marcar». Dados: nx_agenda_dia
   (sem RPC nova). As contas de posição são puras e exportadas
   (testes/crm.teste.mjs).
   ============================================================ */

const FUSO = "America/Sao_Paulo";
const ORIGENS = {
  anuncio: "Anúncio", whatsapp: "WhatsApp", indicacao: "Indicação",
  organico: "Orgânico", manual: "Manual", site: "Site", importacao: "Importação",
};

/* ============================================================ contas puras (testáveis) */
export function diaISO(iso, delta = 0) {
  const [a, m, d] = String(iso).split("-").map(Number);
  const dt = new Date(Date.UTC(a, m - 1, d + delta, 12));
  return `${dt.getUTCFullYear()}-${String(dt.getUTCMonth() + 1).padStart(2, "0")}-${String(dt.getUTCDate()).padStart(2, "0")}`;
}
/** 0 = domingo … 6 = sábado (o dia civil, sem fuso). */
export function diaDaSemana(iso) {
  const [a, m, d] = String(iso).split("-").map(Number);
  return new Date(Date.UTC(a, m - 1, d, 12)).getUTCDay();
}
/** A segunda-feira da semana que contém `iso` (a semana da agenda vai de segunda a domingo). */
export function segundaDe(iso) { return diaISO(iso, -((diaDaSemana(iso) + 6) % 7)); }

const _partes = new Intl.DateTimeFormat("en-CA", { timeZone: FUSO, year: "numeric", month: "2-digit", day: "2-digit", hour: "2-digit", minute: "2-digit", hourCycle: "h23" });
/** Um instante → {dia: "AAAA-MM-DD", min: minutos desde 00:00} em São Paulo. */
export function partesSP(valor) {
  const d = valor instanceof Date ? valor : new Date(valor);
  if (Number.isNaN(d.getTime())) return null;
  const p = Object.fromEntries(_partes.formatToParts(d).map(x => [x.type, x.value]));
  return { dia: `${p.year}-${p.month}-${p.day}`, min: Number(p.hour) * 60 + Number(p.minute) };
}
const paraMin = hhmm => { const m = /^(\d{1,2}):(\d{2})/.exec(String(hhmm ?? "")); return m ? Number(m[1]) * 60 + Number(m[2]) : null; };
export const horaTxt = min => `${String(Math.floor(min / 60)).padStart(2, "0")}:${String(Math.round(min % 60)).padStart(2, "0")}`;

/** Faixas de atendimento do dia em minutos [[ini, fim], …] — `null` quando a configuração não traz horário (então nada é sombreado). */
export function faixasDoDia(config, iso) {
  const h = config && config.horario;
  if (!h || typeof h !== "object") return null;
  const faixas = h[String(diaDaSemana(iso))];
  if (!Array.isArray(faixas)) return [];
  return faixas.map(f => [paraMin(f && f[0]), paraMin(f && f[1])]).filter(f => f[0] !== null && f[1] !== null && f[1] > f[0]);
}
/** Intervalos (almoço…) da configuração em minutos. */
export function intervalosDaConfig(config) {
  return (config && Array.isArray(config.intervalos) ? config.intervalos : []).map(f => [paraMin(f && f[0]), paraMin(f && f[1])]).filter(f => f[0] !== null && f[1] !== null && f[1] > f[0]);
}
function subtrair(faixas, cortes) {
  let r = faixas.map(f => [f[0], f[1]]);
  for (const [a, b] of cortes) {
    const n = [];
    for (const [x, y] of r) {
      if (b <= x || a >= y) n.push([x, y]);
      else { if (a > x) n.push([x, a]); if (b < y) n.push([b, y]); }
    }
    r = n;
  }
  return r;
}
/** true/false se o minuto está dentro do atendimento (fora de intervalos); `null` se a configuração não diz. */
export function horarioAberto(config, iso, min) {
  const faixas = faixasDoDia(config, iso);
  if (faixas === null) return null;
  return subtrair(faixas, intervalosDaConfig(config)).some(([a, b]) => min >= a && min < b);
}
/** Janelas FECHADAS do dia dentro do eixo (minutos): fora do expediente, almoço e dia inteiro fechado. */
export function janelasFechadas(config, iso, eixo) {
  const faixas = faixasDoDia(config, iso);
  if (faixas === null) return [];
  const a0 = eixo.ini * 60, a1 = eixo.fim * 60;
  const abertas = subtrair(faixas, intervalosDaConfig(config)).sort((x, y) => x[0] - y[0]);
  const fechadas = [];
  let cur = a0;
  for (const [x, y] of abertas) {
    if (y <= a0 || x >= a1) continue;
    const xi = Math.max(x, a0), yi = Math.min(y, a1);
    if (xi > cur) fechadas.push([cur, xi]);
    cur = Math.max(cur, yi);
  }
  if (cur < a1) fechadas.push([cur, a1]);
  return fechadas;
}

function minutosDaConsulta(c, duracaoPadrao) {
  const s = partesSP(c.inicio);
  if (!s) return null;
  const e = c.fim ? partesSP(c.fim) : null;
  const fim = e && e.dia === s.dia && e.min > s.min ? e.min : s.min + duracaoPadrao;
  return { dia: s.dia, ini: s.min, fim: Math.max(fim, s.min + 15) };
}
/** Eixo de horas da grade [ini, fim) em horas inteiras: o expediente dos dias mostrados (ou 08–18 sem configuração), esticado para caber toda consulta. */
export function eixoDaGrade({ dias = [], consultas = [], config = null } = {}) {
  let ini = Infinity, fim = -Infinity;
  for (const iso of dias) {
    const f = faixasDoDia(config, iso);
    if (f) for (const [a, b] of f) { ini = Math.min(ini, a); fim = Math.max(fim, b); }
  }
  if (!Number.isFinite(ini)) { ini = 8 * 60; fim = 18 * 60; }
  const dur = Number(config && config.duracao_min) || 30;
  for (const c of consultas) {
    const p = minutosDaConsulta(c, dur);
    if (!p || !dias.includes(p.dia)) continue;
    ini = Math.min(ini, p.ini); fim = Math.max(fim, p.fim);
  }
  let h0 = Math.max(0, Math.floor(ini / 60)), h1 = Math.min(24, Math.ceil(fim / 60));
  if (h1 - h0 < 4) { h1 = Math.min(24, h0 + 4); h0 = Math.max(0, h1 - 4); }
  return { ini: h0, fim: h1 };
}
/** Posição de um item (consulta ou bloqueio) no dia `iso`, em HORAS a partir do topo do eixo: {topo, altura}; null se não cai no eixo. */
export function posicaoNoDia(item, iso, eixo, duracaoPadrao = 30) {
  const base = Date.parse(`${iso}T00:00:00-03:00`);
  const t0 = Date.parse(item.inicio);
  if (!Number.isFinite(t0) || !Number.isFinite(base)) return null;
  let t1 = item.fim ? Date.parse(item.fim) : NaN;
  if (!Number.isFinite(t1) || t1 <= t0) t1 = t0 + duracaoPadrao * 60000;
  let a = (t0 - base) / 60000, b = (t1 - base) / 60000;
  a = Math.max(a, eixo.ini * 60); b = Math.min(b, eixo.fim * 60);
  if (b <= a) return null;
  return { topo: (a - eixo.ini * 60) / 60, altura: (b - a) / 60 };
}
/**
 * Consultas no mesmo horário ficam LADO A LADO (como numa agenda de papel): cada bloco ganha `col` (0…) e `cols` (quantos dividem aquela faixa).
 * blocos = [{topo, altura, …}] (horas) → os mesmos blocos, na mesma ordem, com col/cols.
 */
export function colocarEmFaixas(blocos) {
  const itens = blocos.map((b, i) => ({ ...b, _i: i, _ini: b.topo, _fim: b.topo + b.altura })).sort((a, b) => a._ini - b._ini || b._fim - a._fim);
  const saida = [];
  let grupo = [], faixas = [], fimGrupo = -Infinity;
  const fechar = () => { const cols = faixas.length; for (const g of grupo) saida.push({ ...g, cols }); grupo = []; faixas = []; fimGrupo = -Infinity; };
  for (const it of itens) {
    if (grupo.length && it._ini >= fimGrupo - 1e-9) fechar();
    let k = faixas.findIndex(f => f <= it._ini + 1e-9);
    if (k < 0) { k = faixas.length; faixas.push(it._fim); } else faixas[k] = it._fim;
    grupo.push({ ...it, col: k });
    fimGrupo = Math.max(fimGrupo, it._fim);
  }
  fechar();
  return saida.sort((a, b) => a._i - b._i).map(({ _i, _ini, _fim, ...b }) => b);
}
/** Índice (0–11) do token --pal-N para o procedimento: o mesmo procedimento tem sempre a mesma cor (sem acento/caixa); sem procedimento, areia. */
export function corDoProcedimento(servico) {
  const s = String(servico || "").normalize("NFD").replace(/[̀-ͯ]/g, "").trim().toLowerCase();
  if (!s) return 3;
  let h = 0;
  for (const ch of s) h = (h * 31 + ch.codePointAt(0)) >>> 0;
  return h % 12;
}
/** Consultas do dia `iso`, em ordem de horário. */
export function consultasDoDia(consultas, iso) {
  return (consultas || []).filter(c => { const p = c.inicio && partesSP(c.inicio); return p && p.dia === iso; }).sort((a, b) => Date.parse(a.inicio) - Date.parse(b.inicio));
}
/** Bloqueios que tocam o dia `iso`. */
export function bloqueiosDoDia(bloqueios, iso) {
  const ini = Date.parse(`${iso}T00:00:00-03:00`), fim = Date.parse(`${diaISO(iso, 1)}T00:00:00-03:00`);
  return (bloqueios || []).filter(b => b.inicio && b.fim && Date.parse(b.inicio) < fim && Date.parse(b.fim) > ini);
}
/** O horário (HH:MM) onde o clique caiu na coluna: eixo.ini + fração da altura, arredondado PARA BAIXO ao passo da agenda. */
export function horaDoClique(fracao, eixo, passoMin = 30) {
  const passo = Math.max(5, Number(passoMin) || 30);
  const bruto = eixo.ini * 60 + Math.max(0, Math.min(0.9999, fracao)) * (eixo.fim - eixo.ini) * 60;
  return horaTxt(Math.floor(bruto / passo) * passo);
}

/* ============================================================ textos */
function nomeDia(iso, longo = false) {
  const t = new Intl.DateTimeFormat("pt-BR", {
    weekday: longo ? "long" : "short", day: "2-digit", month: "short", timeZone: FUSO,
  }).format(new Date(`${iso}T12:00:00-03:00`));
  return t.charAt(0).toUpperCase() + t.slice(1); // só a 1ª letra ("Qui., 01 de out."); o CSS capitalize gerava "De Out."
}
const semanaCurta = iso => new Intl.DateTimeFormat("pt-BR", { weekday: "short", timeZone: FUSO }).format(new Date(`${iso}T12:00:00-03:00`)).replace(".", "");
const diaDoMes = iso => iso.slice(8, 10);

function origemDo(item) {
  const nome = item.plataforma === "google" ? "Google Ads"
    : item.plataforma === "meta" ? "Meta Ads"
      : ORIGENS[item.origem] || "Origem não informada";
  const rastreio = item.rastreio && typeof item.rastreio === "object" ? item.rastreio : {};
  const campanha = item.campanha_nome || item.campanha || rastreio.utm_campaign || item.campanha_ext;
  const anuncio = item.anuncio_nome || item.anuncio_titulo || rastreio.utm_content || item.anuncio_ext;
  return [nome, campanha, anuncio].filter(Boolean).join(" · ");
}

function erroResposta(r) {
  if (r && r.ok === false) throw Object.assign(new Error(r.erro || "dados_invalidos"), { codigo: r.erro || "dados_invalidos" });
  return r;
}

/* ============================================================ marcar / remarcar / desmarcar (M27) */
const logicaDe = ctx => import(`./crm-logica.js?v=${encodeURIComponent(ctx.versao)}`);

/** Horários do servidor ({inicio, livre, ocupados, capacidade}) → só os livres, agrupados por dia de São Paulo: [{dia, itens:[{inicio, dia, min, …}]}] em ordem. */
export function agruparLivres(horarios) {
  const mapa = new Map();
  for (const s of horarios || []) {
    if (!s || s.livre === false) continue;
    const p = partesSP(s.inicio);
    if (!p) continue;
    if (!mapa.has(p.dia)) mapa.set(p.dia, []);
    mapa.get(p.dia).push({ ...s, dia: p.dia, min: p.min });
  }
  return [...mapa.entries()].sort((a, b) => (a[0] < b[0] ? -1 : 1)).map(([dia, itens]) => ({ dia, itens: itens.sort((a, b) => a.min - b.min) }));
}
/** «Hoje», «Amanhã» ou «Sex 03/10». */
export function rotuloDoDia(iso, hojeISO) {
  if (iso === hojeISO) return "Hoje";
  if (iso === diaISO(hojeISO, 1)) return "Amanhã";
  const sem = semanaCurta(iso);
  return `${sem.charAt(0).toUpperCase()}${sem.slice(1)} ${iso.slice(8, 10)}/${iso.slice(5, 7)}`;
}
/** O primeiro horário livre de todos. */
export function primeiroLivre(grupos) { return (grupos && grupos[0] && grupos[0].itens[0]) || null; }
/** O primeiro horário livre de amanhã de manhã (antes do meio-dia); null se não há. */
export function amanhaDeManha(grupos, hojeISO) {
  const g = (grupos || []).find(x => x.dia === diaISO(hojeISO, 1));
  return (g && g.itens.find(s => s.min < 12 * 60)) || null;
}
/** O horário livre do dia `dia` mais perto de `hhmm` (o clique na grade); null se o dia não tem horário livre. */
export function slotMaisPerto(grupos, dia, hhmm) {
  const g = (grupos || []).find(x => x.dia === dia);
  const alvo = paraMin(hhmm);
  if (!g || alvo === null) return null;
  return g.itens.reduce((m, s) => (Math.abs(s.min - alvo) < Math.abs(m.min - alvo) ? s : m), g.itens[0]);
}

/** Oportunidades ABERTAS que casam com a busca (uma chamada: nx_buscar). Servidor sem a busca → cai no quadro do funil (mais lento). */
async function procurarNegocios(ctx, q) {
  const { api } = ctx;
  const r = await api.rpcC("nx_buscar", { p_q: q });
  if (r && Array.isArray(r.negocios)) return r.negocios.filter(n => n.status === "aberto").slice(0, 8);
  const crm = await ctx.carregar("crm");
  const k = await crm.kit(ctx);
  const mapa = new Map();
  for (const funil of (k.base.funis || []).filter(f => f.ativo !== false)) {
    const rr = await api.rpcC("nx_negocios_kanban", { p_funil: funil.id, p_filtro: { busca: q, status: "aberto" }, p_por_coluna: 30 });
    for (const coluna of rr.colunas || []) for (const item of coluna.itens || []) {
      if (item.status === "aberto" && !mapa.has(String(item.id))) mapa.set(String(item.id), { id: item.id, titulo: item.titulo || item.nome, contato_nome: item.contato && item.contato.nome, estagio_nome: item.estagio_nome || funil.nome, status: "aberto" });
    }
  }
  return [...mapa.values()].slice(0, 8);
}

/** Setas movem e escolhem dentro de um grupo de botões role=radio (só o marcado fica na ordem do Tab). */
function radiosComSetas(grupo) {
  grupo.addEventListener("keydown", ev => {
    const bts = [...grupo.querySelectorAll('[role="radio"]')];
    const i = bts.indexOf(document.activeElement);
    if (i < 0) return;
    let j = null;
    if (ev.key === "ArrowRight" || ev.key === "ArrowDown") j = (i + 1) % bts.length;
    else if (ev.key === "ArrowLeft" || ev.key === "ArrowUp") j = (i - 1 + bts.length) % bts.length;
    else if (ev.key === "Home") j = 0; else if (ev.key === "End") j = bts.length - 1;
    if (j === null) return;
    ev.preventDefault(); bts[j].focus(); bts[j].click();
  });
}

/**
 * marcarConsulta(ctx, {negocio, dia, hora, base, aoMudar}) → Promise<resultado | null>.
 * Marcar em 2 toques: com a oportunidade já escolhida (vindo do negócio, da consulta a remarcar ou da grade) a janela abre com os horários livres
 * prontos — dias em chips («Hoje», «Amanhã», «Sex 03/10»), horários em pílulas, o primeiro (ou o mais perto do clique) já selecionado — e «Confirmar» é o 2º toque.
 * Sem oportunidade: busca enquanto digita; escolher o resultado já carrega os horários. Atalhos «Primeiro livre» e «Amanhã de manhã».
 * Confirmar → aviso «Marcada para qui 02/10 às 10:00 · Desfazer» (desmarca, ou volta ao horário anterior se era remarcação).
 * negocio: {id | negocio_id, titulo | nome, servico?, funil_nome?, inicio? (consulta atual: é remarcação)}; dia/hora: o que veio do clique na grade; base: dia aberto na tela.
 */
export async function marcarConsulta(ctx, { negocio = null, dia = null, hora = null, base = null, aoMudar = null } = {}) {
  if (!ctx.pode("atendente")) return null;
  const { ui, api } = ctx;
  const h = ui.h;
  const [Lg] = await Promise.all([logicaDe(ctx), ui.carregarCss("agenda")]);   // o CSS da agenda também vale quando a janela abre pelo CRM (gaveta do negócio)
  const hoje = ui.hojeSP();
  let sel = negocio ? { id: negocio.id || negocio.negocio_id, titulo: negocio.titulo || negocio.nome || "Negócio", servico: negocio.servico || "", funil_nome: negocio.funil_nome || negocio.estagio_nome || "",
    consultaAtual: negocio.inicio || negocio.consulta_em || null } : null;
  const aPartirInicial = dia && dia >= hoje ? dia : (base && base >= hoje ? base : hoje);
  let grupos = [], diaSel = null, slotSel = null, duracao = null, seqH = 0, seqB = 0;
  let reqAtual = null, reqConteudo = "";
  const preferido = dia && hora ? { dia, hora } : null;

  const campoBusca = ui.campo({ rotulo: "Buscar oportunidade aberta", nome: "busca", tipo: "busca", placeholder: "Nome, serviço ou telefone", ajuda: "A consulta fica vinculada à oportunidade escolhida." });
  const inputBusca = campoBusca.querySelector("input");
  const resultados = h("div", { class: "agenda-resultados", role: "listbox", "aria-label": "Oportunidades encontradas" });
  const secBusca = h("section", { class: "agenda-busca" }, campoBusca, resultados);
  const escolhido = h("div", { class: "agenda-escolhido-l" });
  const servicoEl = ui.campo({ rotulo: "Serviço", nome: "servico", valor: sel && sel.servico || "", max: 80, placeholder: "Ex.: avaliação, limpeza", ajuda: "Define a duração; vazio = o da oportunidade." });
  const outraData = ui.campo({ rotulo: "Ver a partir de", nome: "data", tipo: "data", valor: aPartirInicial });
  const atalhos = h("div", { class: "ag-atalhos" });
  const diasEl = h("div", { class: "ag-dias", role: "radiogroup", "aria-label": "Dia" });
  const horasEl = h("div", { class: "ag-horas", role: "radiogroup", "aria-label": "Horário" });
  const info = h("p", { class: "campo-ajuda ag-info", role: "status", "aria-live": "polite" });
  const statusEl = h("p", { class: "crm-status", role: "status", "aria-live": "polite", hidden: true });
  const formulario = h("form", { class: "agenda-form", novalidate: true }, secBusca, escolhido,
    h("div", { class: "agenda-form-grade" }, servicoEl, outraData), atalhos, diasEl, horasEl, info, statusEl);
  radiosComSetas(diasEl); radiosComSetas(horasEl);
  const servicoValor = () => servicoEl.querySelector("input").value.trim();
  const dataValor = () => outraData.querySelector("input").value || hoje;

  function pintarEscolhido() {
    ui.limpar(escolhido);
    secBusca.hidden = !!sel;
    escolhido.hidden = !sel;
    if (!sel) return;
    escolhido.append(h("div", { class: "linha agenda-escolhido-topo" },
      h("p", { class: "agenda-escolhido", role: "status" }, `${sel.titulo}${sel.funil_nome ? ` · ${sel.funil_nome}` : ""}`),
      negocio ? null : h("button", { type: "button", class: "bt bt-fant bt-p", on: { click: () => { sel = null; slotSel = null; grupos = []; diaSel = null; ui.limpar(atalhos); ui.limpar(diasEl); ui.limpar(horasEl); info.textContent = ""; pintarEscolhido(); inputBusca.focus(); } } }, "Trocar")));
    if (sel.consultaAtual && Date.parse(sel.consultaAtual) > Date.now()) {
      escolhido.append(h("p", { class: "aviso aviso-aten" }, ui.icone("info"), h("span", null, `Já tem consulta marcada para ${ui.dataHoraBR(sel.consultaAtual)}. Ao confirmar, ela será remarcada.`)));
    }
  }

  /* ---------- horários: chips de dia, pílulas de hora, atalhos ---------- */
  function selecionarSlot(slot) {
    slotSel = slot || null;
    diaSel = slot ? slot.dia : (grupos[0] && grupos[0].dia) || null;
    desenharAtalhos(); desenharDias(); desenharHoras();
    info.textContent = slot ? `${rotuloDoDia(slot.dia, hoje)}, ${ui.horaBR(slot.inicio)} · duração prevista ${ui.num(duracao)} min · horário de São Paulo` : "";
  }
  function desenharAtalhos() {
    ui.limpar(atalhos);
    const pl = primeiroLivre(grupos), am = amanhaDeManha(grupos, hoje);
    atalhos.append(...[
      pl ? h("button", { type: "button", class: ["bt", "bt-fant", "bt-p", slotSel && pl.inicio === slotSel.inicio && "ativo"], on: { click: () => selecionarSlot(pl) } }, ui.icone("relogio"), "Primeiro livre") : null,
      am ? h("button", { type: "button", class: ["bt", "bt-fant", "bt-p", slotSel && am.inicio === slotSel.inicio && "ativo"], on: { click: () => selecionarSlot(am) } }, "Amanhã de manhã") : null,
    ].filter(Boolean));
  }
  function desenharDias() {
    ui.limpar(diasEl);
    for (const g of grupos) {
      const on = g.dia === diaSel;
      diasEl.appendChild(h("button", { type: "button", role: "radio", class: "ag-dia-chip", "aria-checked": String(on), tabindex: on ? "0" : "-1", dataset: { dia: g.dia },
        "aria-label": `${rotuloDoDia(g.dia, hoje)}, ${g.itens.length} horários livres`,
        on: { click: () => {
          // trocar de dia mantém, se der, o mesmo horário
          const mesmo = slotSel ? slotMaisPerto(grupos, g.dia, horaTxt(slotSel.min)) : null;
          selecionarSlot(mesmo || g.itens[0]);
        } } }, rotuloDoDia(g.dia, hoje)));
    }
    queueMicrotask(() => { const s = diasEl.querySelector('[aria-checked="true"]'); if (s && s.scrollIntoView) try { s.scrollIntoView({ block: "nearest", inline: "nearest" }); } catch { /* ok */ } });
  }
  function desenharHoras() {
    ui.limpar(horasEl);
    const g = grupos.find(x => x.dia === diaSel);
    for (const s of (g ? g.itens : [])) {
      const on = slotSel && s.inicio === slotSel.inicio;
      const vagas = (Number(s.capacidade) || 1) - (Number(s.ocupados) || 0);
      horasEl.appendChild(h("button", { type: "button", role: "radio", class: "ag-hora-pill dado", "aria-checked": String(!!on), tabindex: on ? "0" : "-1", title: `${vagas} vaga${vagas === 1 ? "" : "s"}`,
        "aria-label": `${horaTxt(s.min)}, ${vagas} vaga${vagas === 1 ? "" : "s"}`, on: { click: () => selecionarSlot(s) } }, horaTxt(s.min)));
    }
  }
  async function carregarHorarios({ inicial = false } = {}) {
    if (!sel) return;
    const minha = ++seqH;
    info.textContent = "Buscando horários livres…";
    ui.limpar(atalhos); ui.limpar(diasEl); ui.limpar(horasEl);
    try {
      const r = await api.rpcC("nx_agenda_livres", { p_a_partir: dataValor(), p_dias: 14, p_servico: servicoValor() || null, p_negocio: sel.id });
      if (minha !== seqH) return;
      duracao = r.duracao_min;
      grupos = agruparLivres(r.horarios);
      if (!grupos.length) { slotSel = null; diaSel = null; info.textContent = "Não há horários livres nos 14 dias a partir desta data. Tente outra data ou confira as configurações da agenda."; return; }
      let escolha = null;
      if (inicial && preferido) escolha = slotMaisPerto(grupos, preferido.dia, preferido.hora);
      if (!escolha && slotSel) escolha = grupos.flatMap(g => g.itens).find(s => s.inicio === slotSel.inicio) || null;
      selecionarSlot(escolha || primeiroLivre(grupos));
    } catch (e) {
      if (minha !== seqH) return;
      info.textContent = "";
      ui.limpar(horasEl);
      horasEl.appendChild(h("p", { class: "agenda-erro" }, api.mensagemErro(e)));
    }
  }
  servicoEl.querySelector("input").addEventListener("change", () => { if (sel) carregarHorarios(); });
  outraData.querySelector("input").addEventListener("change", () => { if (sel) { slotSel = null; carregarHorarios(); } });

  /* ---------- busca enquanto digita ---------- */
  function escolher(item) {
    sel = { id: item.id, titulo: item.titulo || item.contato_nome || "Negócio", servico: "", funil_nome: item.estagio_nome || "", consultaAtual: null };
    pintarEscolhido();
    carregarHorarios({ inicial: true });
    // a ficha traz o serviço e a consulta atual (se houver, o aviso de que será remarcada); a duração já vem do servidor pelo negócio
    api.rpcC("nx_negocio_ver", { p_id: item.id }).then(d => {
      if (!d || !d.negocio || !sel || sel.id !== item.id) return;
      sel.servico = d.negocio.servico || "";
      sel.consultaAtual = d.negocio.consulta_em || null;
      const campo = servicoEl.querySelector("input");
      if (!campo.value && sel.servico) campo.value = sel.servico;
      pintarEscolhido();
    }).catch(() => { /* sem a ficha: segue só com os horários */ });
  }
  async function buscarAgora() {
    const q = inputBusca.value.trim();
    const minha = ++seqB;
    ui.limpar(resultados);
    if (q.length < 2) { if (q.length) resultados.appendChild(h("p", { class: "campo-ajuda" }, "Digite pelo menos duas letras ou quatro números.")); return; }
    resultados.setAttribute("aria-busy", "true");
    try {
      const itens = await procurarNegocios(ctx, q);
      if (minha !== seqB) return;
      ui.limpar(resultados);
      if (!itens.length) { resultados.appendChild(h("p", { class: "campo-ajuda" }, "Nenhuma oportunidade aberta com esse nome. Crie ou atualize pelo CRM.")); return; }
      for (const item of itens) {
        resultados.appendChild(h("button", { type: "button", class: "agenda-resultado", role: "option", "aria-selected": "false", on: { click: () => escolher(item) } },
          h("b", null, item.titulo || item.contato_nome || "Negócio"),
          h("small", null, [item.contato_nome && item.contato_nome !== item.titulo ? item.contato_nome : null, item.estagio_nome].filter(Boolean).join(" · "))));
      }
      resultados.dataset.n = String(itens.length);
    } catch (e) { if (minha === seqB) { ui.limpar(resultados); resultados.appendChild(h("p", { class: "agenda-erro" }, api.mensagemErro(e))); } }
    finally { if (minha === seqB) resultados.removeAttribute("aria-busy"); }
  }
  const buscarDepois = ui.debounce(buscarAgora, 300);
  inputBusca.addEventListener("input", buscarDepois);
  inputBusca.addEventListener("keydown", ev => {
    if (ev.key !== "Enter") return;
    ev.preventDefault();
    if (buscarDepois.cancelar) buscarDepois.cancelar();
    buscarAgora().then(() => { const unico = resultados.querySelectorAll(".agenda-resultado"); if (unico.length === 1) unico[0].click(); });
  });

  /* ---------- a janela ---------- */
  pintarEscolhido();
  const modal = ui.modal({
    titulo: sel && sel.consultaAtual ? "Remarcar consulta" : "Marcar consulta", corpo: formulario, largura: "m",
    descricao: "Escolha o dia e o horário. A disponibilidade é validada de novo ao salvar.",
    aoAbrir: a => {
      if (!sel) return;
      carregarHorarios({ inicial: true });
      // oportunidade já escolhida: o foco vai direto para «Confirmar consulta» (Enter = o 2º toque)
      const bt = a.el.querySelector('.modal-rod [data-tipo="primario"]');
      if (bt) try { bt.focus({ preventScroll: true }); } catch { /* ok */ }
    },
    acoes: [
      { rotulo: "Cancelar", tipo: "neutro", valor: false },
      { rotulo: "Confirmar consulta", tipo: "primario", fn: async m => {
        if (!sel) { m.erro("Escolha uma oportunidade aberta para continuar."); return false; }
        if (!slotSel) { m.erro("Escolha um dia e um horário livre."); return false; }
        try {
          const params = { p_negocio: sel.id, p_inicio: slotSel.inicio, p_servico: servicoValor() || null };
          const conteudo = JSON.stringify(params);
          if (conteudo !== reqConteudo) { reqAtual = Lg.novaReq(); reqConteudo = conteudo; }
          const { resultado } = await Lg.escreverComReq(api, "nx_agenda_marcar", params, { req: reqAtual, aoStatus: t => { statusEl.textContent = t; statusEl.hidden = false; } });
          statusEl.hidden = true;
          return erroResposta(resultado);
        } catch (e) {
          statusEl.hidden = true;
          const codigo = e && e.codigo;
          m.erro(e && e.ambigua ? "Não foi possível confirmar se foi salvo. Toque em «Confirmar consulta» de novo: é seguro, não marca duas vezes."
            : codigo === "horario_ocupado" ? "Esse horário acabou de ser ocupado. Escolha outro (a lista foi atualizada)."
              : codigo === "ja_agendada" ? "Esta oportunidade já tem uma consulta futura. Atualize a agenda antes de tentar novamente."
                : api.mensagemErro(e));
          if (!(e && e.ambigua)) { slotSel = null; carregarHorarios(); }      // recusa: traz os horários de novo; dúvida de conexão: o horário escolhido continua valendo
          return false;
        }
      } },
    ],
  });

  const resultado = await modal;
  if (!(resultado && resultado.ok)) return null;
  const rotulo = (resultado.consulta && resultado.consulta.rotulo) || ui.dataHoraBR(slotSel && slotSel.inicio);
  const anterior = resultado.remarcada && resultado.anterior ? resultado.anterior.inicio : null;
  const servicoMarcado = servicoValor() || null;
  if (aoMudar) try { aoMudar(resultado); } catch (e) { console.error(e); }
  ui.acaoComDesfazer({
    texto: `${resultado.remarcada ? "Remarcada" : "Marcada"} para ${rotulo}`,
    reverter: async () => {
      // remarcação volta ao horário anterior; consulta nova some
      if (anterior) erroResposta(await api.rpcC("nx_agenda_marcar", { p_negocio: sel.id, p_inicio: anterior, p_servico: servicoMarcado }));
      else erroResposta(await api.rpcC("nx_agenda_desmarcar", { p_negocio: sel.id, p_motivo: "Desfeito logo depois de marcar" }));
      if (aoMudar) try { aoMudar(null); } catch (e) { console.error(e); }
    },
  });
  return resultado;
}

/** Desmarcar (pede o motivo) com «Desfazer»: marcar de volta o mesmo horário. */
export async function desmarcarConsulta(ctx, c, { aoMudar = null } = {}) {
  if (!ctx.pode("atendente")) return null;
  const { ui, api } = ctx;
  const h = ui.h;
  const motivo = ui.campo({ rotulo: "Motivo (opcional)", nome: "motivo", tipo: "textarea", max: 200, linhas: 2 });
  const r = await ui.modal({
    titulo: "Desmarcar consulta", largura: "p",
    corpo: h("div", { class: "pilha" }, h("p", null, `${c.nome || c.titulo || "Esta consulta"} · ${ui.dataHoraBR(c.inicio)}`), motivo),
    acoes: [
      { rotulo: "Voltar", tipo: "neutro", valor: false },
      { rotulo: "Desmarcar consulta", tipo: "perigo", fn: async () => erroResposta(await api.rpcC("nx_agenda_desmarcar", {
        p_negocio: c.negocio_id, p_motivo: motivo.querySelector("textarea").value.trim() || null,
      })) },
    ],
  });
  if (!(r && r.ok)) return null;
  if (aoMudar) try { aoMudar(r); } catch (e) { console.error(e); }
  ui.acaoComDesfazer({
    texto: `Consulta de ${ui.dataHoraBR(c.inicio)} desmarcada`,
    reverter: async () => {
      erroResposta(await api.rpcC("nx_agenda_marcar", { p_negocio: c.negocio_id, p_inicio: c.inicio, p_servico: c.servico || null }));
      if (aoMudar) try { aoMudar(null); } catch (e) { console.error(e); }
    },
  });
  return r;
}

export function desmontar() {}

export async function montar(ctx) {
  const { ui, api } = ctx;
  const h = ui.h;
  ui.carregarCss("agenda");
  ctx.titulo("Agenda");

  const mq = typeof matchMedia === "function" ? matchMedia("(max-width: 760px)") : { matches: false, addEventListener() {}, removeEventListener() {} };
  let movel = mq.matches;
  let data = ui.hojeSP();
  let modo = "semana";
  let agrupar = "responsavel";      // dia com 2+ responsáveis: uma coluna por pessoa
  let atual = null, chaveAtual = "";
  let sequencia = 0;
  let vivo = true;
  let eixoAtual = null;
  let nomesDonos = null;

  // M30: ui.cabecalho (sem a empresa em cima); os controles de data e as ações entram no lugar das ações do cabeçalho
  const controles = h("div", { class: "agenda-cab-controles" });
  const cabecalho = ui.cabecalho({ titulo: "Agenda", acoes: controles });
  cabecalho.classList.add("agenda-cab");
  const conteudo = h("div", { class: "agenda-conteudo", "aria-live": "polite" });
  ui.limpar(ctx.alvo);
  ctx.alvo.append(cabecalho, conteudo);

  /** O que o servidor precisa devolver: a semana (segunda a domingo) na semana e no celular; o dia só no desktop em «Dia». */
  function intervalo() {
    const semanal = modo === "semana" || movel;
    return { de: semanal ? segundaDe(data) : data, dias: semanal ? 7 : 1 };
  }
  const passoDeNavegacao = () => (modo === "dia" && !movel ? 1 : 7);

  function montarCabecalho() {
    ui.limpar(controles);
    const anterior = h("button", { type: "button", class: "bt-icone", "aria-label": passoDeNavegacao() === 1 ? "Dia anterior" : "Semana anterior", on: { click: () => mover(-1) } }, ui.icone("seta-esq"));
    const proximo = h("button", { type: "button", class: "bt-icone", "aria-label": passoDeNavegacao() === 1 ? "Próximo dia" : "Próxima semana", on: { click: () => mover(1) } }, ui.icone("seta-dir"));
    const hoje = h("button", { type: "button", class: "bt bt-sec bt-p", on: { click: () => { data = ui.hojeSP(); carregar(); } } }, "Hoje");
    const seletor = h("input", { class: "agenda-data", type: "date", value: data, "aria-label": "Escolher data" });
    seletor.addEventListener("change", () => { if (seletor.value) { data = seletor.value; carregar(); } });
    const periodo = h("div", { class: "agenda-periodo" }, anterior, seletor, proximo, hoje);
    const alternador = ui.segmentado({ opcoes: [{ valor: "dia", rotulo: "Dia" }, { valor: "semana", rotulo: "Semana" }], valor: modo, rotulo: "Visualização da agenda", classe: "agenda-abas",
      aoMudar: id => { modo = id; carregar(); } });
    const acoes = h("div", { class: "agenda-acoes" }, alternador,
      ctx.pode("atendente") ? h("button", { type: "button", class: "bt bt-prim agenda-marcar", on: { click: () => abrirAgendamento(null, { dia: movel || modo === "dia" ? data : null }) } }, ui.icone("mais"), "Marcar consulta") : null);
    controles.append(periodo, acoes);
  }

  function mover(delta) {
    data = diaISO(data, delta * passoDeNavegacao());
    carregar();
  }

  async function carregar({ silencioso = false, forcar = false } = {}) {
    const iv = intervalo();
    const chave = `${iv.de}|${iv.dias}`;
    montarCabecalho();
    if (!forcar && atual && chave === chaveAtual) { desenhar(); return; }   // mesmo período já em mãos (ex.: outro dia da mesma semana)
    const minha = ++sequencia;
    if (!silencioso || !atual) {
      ui.limpar(conteudo);
      conteudo.appendChild(ui.esqueleto("agenda", { cabecalho: false }));
    }
    try {
      let doCache = false;
      const r = await api.rpcC("nx_agenda_dia", { p_data: iv.de, p_dias: iv.dias }, { cache: true, aoCache: dc => {
        // M16/M30: a 1ª pintura é a última agenda guardada para este período; a rede atualiza em seguida
        if (!vivo || minha !== sequencia || atual || !dc || typeof dc !== "object") return;
        atual = dc; chaveAtual = chave; doCache = true;
        desenhar();
      } });
      if (!vivo || minha !== sequencia) return;
      const igual = doCache && JSON.stringify(atual) === JSON.stringify(r);     // nada mudou desde o guardado: não refaz a grade
      atual = r || { consultas: [], bloqueios: [] };
      chaveAtual = chave;
      if (!igual) desenhar();
    } catch (e) {
      if (!vivo || minha !== sequencia) return;
      if (e && e.comCache) return;      // a rede falhou depois de pintar a última agenda: fica o que está na tela
      atual = null; chaveAtual = "";
      ui.limpar(conteudo);
      conteudo.appendChild(ui.erroCartao(e, () => carregar({ forcar: true })));
    }
  }

  /* ============================================================ desenho */
  /** Nomes dos responsáveis (da base do CRM; só quando o dia tem 2+ pessoas). */
  async function carregarNomes() {
    if (nomesDonos) return nomesDonos;
    try {
      const crm = await ctx.carregar("crm");
      const k = await crm.kit(ctx);
      nomesDonos = Object.fromEntries((k.base.usuarios || []).map(u => [u.id, u.nome]));
    } catch { nomesDonos = {}; }
    return nomesDonos;
  }

  function desenhar() {
    ui.limpar(conteudo);
    const consultas = Array.isArray(atual.consultas) ? atual.consultas : [];
    const bloqueios = Array.isArray(atual.bloqueios) ? atual.bloqueios : [];
    const config = atual.config || {};
    const iv = intervalo();
    const carregados = Array.from({ length: iv.dias }, (_, i) => diaISO(iv.de, i));
    const hoje = ui.hojeSP();
    const fonte = config.horario_fonte;
    const legendaFonte = fonte === "agenda" ? "Horário da agenda"
      : fonte === "departamento" ? "Horário herdado do departamento"
        : fonte === "padrao" ? "Horário padrão · seg a sex, 8h–18h" : null;
    const eixo = eixoDaGrade({ dias: carregados, consultas, config });
    eixoAtual = eixo;

    // o que a tela mostra agora
    let mostrados, titulo;
    if (movel) { mostrados = [data]; titulo = nomeDia(data, true); }
    else if (modo === "dia") { mostrados = [data]; titulo = nomeDia(data, true); }
    else { mostrados = carregados; titulo = `${ui.dataCurtaBR(carregados[0])} — ${ui.dataCurtaBR(carregados[6])}`; }
    const nDentro = consultas.filter(c => { const p = c.inicio && partesSP(c.inicio); return p && mostrados.includes(p.dia); }).length;
    const nBloq = bloqueios.filter(b => mostrados.some(d => bloqueiosDoDia([b], d).length)).length;
    const donos = new Set(consultasDoDia(consultas, data).map(c => c.dono_id || "sem"));
    const porDono = !movel && modo === "dia" && donos.size >= 2;

    const resumo = h("section", { class: "agenda-resumo", "aria-label": "Resumo do período" },
      h("div", { class: "agenda-resumo-data" },
        h("b", null, titulo), legendaFonte ? h("small", null, legendaFonte) : null),
      porDono ? ui.segmentado({ opcoes: [{ valor: "juntos", rotulo: "Juntos" }, { valor: "responsavel", rotulo: "Por responsável" }], valor: agrupar, tipo: "filtro", rotulo: "Agrupar a agenda do dia",
        aoMudar: v => { agrupar = v; desenhar(); } }) : null,
      h("div", { class: "agenda-resumo-num" },
        h("span", null, h("b", { class: "dado" }, ui.num(nDentro)), ` ${nDentro === 1 ? "consulta" : "consultas"}`),
        h("span", null, h("b", { class: "dado" }, ui.num(nBloq)), ` ${nBloq === 1 ? "bloqueio" : "bloqueios"}`)));

    const nota = h("p", { class: "agenda-fuso" }, "Horários no fuso de São Paulo.");
    if (movel) {
      conteudo.append(resumo, faixaDeDias(carregados, consultas, hoje), visaoDoDiaMovel(data, consultas, bloqueios, config, eixo, hoje), nota);
    } else {
      let colunas;
      if (modo === "dia" && porDono && agrupar === "responsavel") {
        const ordem = [...donos].sort((a, b) => (a === "sem") - (b === "sem") || String(a).localeCompare(String(b)));
        colunas = ordem.map(d => ({ iso: data, chave: String(d), dono: d, rotulo: d === "sem" ? "Sem responsável" : "Responsável", titulo: d === "sem" ? "Sem responsável" : "…",
          consultas: consultasDoDia(consultas, data).filter(c => (c.dono_id || "sem") === d), bloqueios: bloqueiosDoDia(bloqueios, data), hoje: data === hoje }));
        carregarNomes().then(n => { if (!vivo) return; for (const t of conteudo.querySelectorAll("[data-dono]")) { const id = t.dataset.dono; if (id !== "sem") t.textContent = n[id] || "Responsável"; } });
      } else {
        colunas = mostrados.map(iso => ({ iso, chave: iso, rotulo: `${nomeDia(iso, true)} ${ui.dataBR(iso)}`, consultas: consultasDoDia(consultas, iso),
          bloqueios: bloqueiosDoDia(bloqueios, iso), hoje: iso === hoje }));
      }
      conteudo.append(resumo, montarGrade(colunas, eixo, config, { modoDia: modo === "dia" }), nota);
    }
    posicionarAgora();
    if (movel) focarNoDia();
  }

  /** Celular: ao abrir um dia (ou trocar de dia) leva a vista para o que importa — a linha de agora (hoje) ou a 1ª consulta —, sem brigar com a rolagem de quem já rolou. */
  let diaFocado = "";
  function focarNoDia() {
    if (diaFocado === data) return;
    diaFocado = data;
    const alvo = (data === ui.hojeSP() && conteudo.querySelector(".ag-agora:not([hidden])")) || conteudo.querySelector(".ag-item");
    if (!alvo) return;
    requestAnimationFrame(() => {
      const r = alvo.getBoundingClientRect();
      if (r.top > innerHeight - 220) window.scrollBy({ top: r.top - Math.round(innerHeight * 0.38), behavior: ui.comportamentoRolagem() });
    });
  }

  /** Celular: sete botões de dia (rolável), com a quantidade de consultas; escolher troca o dia sem pedir nada ao servidor. */
  function faixaDeDias(dias, consultas, hoje) {
    const el = h("div", { class: "ag-faixa", role: "tablist", "aria-label": "Dias da semana" });
    for (const iso of dias) {
      const n = consultasDoDia(consultas, iso).length;
      const sel = iso === data;
      el.appendChild(h("button", { type: "button", role: "tab", class: ["ag-faixa-d", sel && "sel", iso === hoje && "hoje"], "aria-selected": String(sel), tabindex: sel ? "0" : "-1",
        "aria-label": `${nomeDia(iso, true)}, ${n} ${n === 1 ? "consulta" : "consultas"}`, dataset: { iso },
        on: { click: () => { data = iso; montarCabecalho(); desenhar(); } } },
        h("span", { class: "ag-faixa-sem" }, semanaCurta(iso)), h("b", { class: "dado ag-faixa-num" }, diaDoMes(iso)),
        h("i", { class: ["ag-faixa-n", n && "tem"], "aria-hidden": "true" }, n ? String(n) : "")));
    }
    // o dia escolhido sempre à vista na faixa
    queueMicrotask(() => { const s = el.querySelector(".sel"); if (s && s.scrollIntoView) try { s.scrollIntoView({ block: "nearest", inline: "center" }); } catch { /* ok */ } });
    return el;
  }

  function visaoDoDiaMovel(iso, consultas, bloqueios, config, eixo, hoje) {
    const itens = consultasDoDia(consultas, iso), travas = bloqueiosDoDia(bloqueios, iso);
    if (!itens.length && !travas.length) {
      return ctx.pode("atendente")
        ? h("button", { type: "button", class: "ag-livre", on: { click: () => abrirAgendamento(null, { dia: iso }) } }, h("span", null, "Livre"), h("span", { class: "ag-livre-acao" }, ui.icone("mais"), "Marcar"))
        : h("p", { class: "ag-livre ag-livre-leitura" }, "Livre");
    }
    return montarGrade([{ iso, chave: iso, rotulo: `${nomeDia(iso, true)} ${ui.dataBR(iso)}`, consultas: itens, bloqueios: travas, hoje: iso === hoje }], eixo, config, { movel: true });
  }

  /* ---------- a grade ---------- */
  function montarGrade(colunas, eixo, config, { movel: ehMovel = false, modoDia = false } = {}) {
    const horas = eixo.fim - eixo.ini;
    const passo = Number(config.passo_min) || Number(config.duracao_min) || 30;
    const cab = h("div", { class: "ag-topo" }, h("span", { class: "ag-canto", "aria-hidden": "true" }), colunas.map(c => cabecalhoDaColuna(c, ehMovel, modoDia)));
    const regua = h("div", { class: "ag-regua", "aria-hidden": "true" },
      Array.from({ length: horas }, (_, i) => h("span", { class: "ag-hora-rot dado", style: { "--i": String(i) } }, `${String(eixo.ini + i).padStart(2, "0")}h`)));
    const corpo = h("div", { class: "ag-corpo" }, regua, colunas.map(c => colunaDoDia(c, eixo, config, passo)));
    return h("div", { class: ["ag-grade", ehMovel && "ag-movel"], style: { "--horas": String(horas), "--colunas": String(colunas.length) }, role: "group", "aria-label": ehMovel ? "Agenda do dia" : "Agenda" },
      ehMovel ? null : cab, corpo);
  }

  function cabecalhoDaColuna(c, ehMovel, modoDia) {
    if (c.dono !== undefined) {
      return h("div", { class: ["ag-dia-cab", "ag-dono-cab"] }, h("b", { class: "ag-dono-nome", dataset: { dono: c.dono } }, c.titulo),
        h("span", { class: "ag-dia-total", title: `${c.consultas.length} consultas` }, ui.num(c.consultas.length)));
    }
    const ehHoje = c.hoje;
    return h("div", { class: ["ag-dia-cab", ehHoje && "hoje"], "aria-current": ehHoje ? "date" : null },
      h("span", { class: "ag-dia-sem" }, modoDia ? nomeDia(c.iso, true).replace(/,.*$/, "").replace(/\.$/, "") : semanaCurta(c.iso)),
      h("b", { class: "ag-dia-num dado" }, diaDoMes(c.iso)),
      h("span", { class: "ag-dia-total", title: `${c.consultas.length} ${c.consultas.length === 1 ? "consulta" : "consultas"}` }, c.consultas.length ? ui.num(c.consultas.length) : ""),
      ctx.pode("atendente") ? h("button", { type: "button", class: "bt-icone ag-dia-mais", "aria-label": `Marcar consulta em ${nomeDia(c.iso, true)}`, title: "Marcar consulta neste dia",
        on: { click: () => abrirAgendamento(null, { dia: c.iso }) } }, ui.icone("mais")) : null);
  }

  function colunaDoDia(c, eixo, config, passo) {
    const duracaoPadrao = Number(config.duracao_min) || 30;
    const col = h("ol", { class: ["ag-col", c.hoje && "hoje", ctx.pode("atendente") && "ag-edita"], "aria-label": c.rotulo, dataset: { iso: c.iso, chave: c.chave } });
    // horário fechado (fora do expediente, almoço, dia inteiro)
    const fechadas = janelasFechadas(config, c.iso, eixo);
    for (const [a, b] of fechadas) col.appendChild(h("li", { class: "ag-fechado", "aria-hidden": "true", style: { "--t": String(a / 60 - eixo.ini), "--d": String((b - a) / 60) } }));
    const diaBloqueado = c.bloqueios.some(b => { const pos = posicaoNoDia(b, c.iso, eixo); return pos && pos.topo <= 0.001 && pos.altura >= eixo.fim - eixo.ini - 0.001; });
    if (!diaBloqueado && fechadas.length === 1 && fechadas[0][0] <= eixo.ini * 60 && fechadas[0][1] >= eixo.fim * 60) col.appendChild(h("li", { class: "ag-fechado-rot", "aria-hidden": "true" }, "Fechado"));
    // bloqueios
    for (const b of c.bloqueios) {
      const pos = posicaoNoDia(b, c.iso, eixo);
      if (!pos) continue;
      const motivo = [b.motivo, ui.periodoBR(b.inicio, b.fim, " · ")].filter(Boolean).join(" · ") || "Dia indisponível";
      col.appendChild(h("li", { class: "ag-bloq", title: `Horário bloqueado — ${motivo}`, style: { "--t": String(pos.topo), "--d": String(pos.altura) } },
        h("span", { class: "ag-bloq-rot" }, ui.icone("fechar"), h("span", null, b.motivo || "Bloqueado"))));
    }
    // consultas, lado a lado quando se sobrepõem
    const blocos = [];
    for (const k of c.consultas) {
      const pos = posicaoNoDia(k, c.iso, eixo, duracaoPadrao);
      if (pos) blocos.push({ ...pos, consulta: k });
    }
    for (const b of colocarEmFaixas(blocos)) col.appendChild(blocoDaConsulta(b));
    // «agora»
    if (c.hoje) col.appendChild(h("li", { class: "ag-agora", "aria-hidden": "true", hidden: true }));
    if (ctx.pode("atendente")) col.addEventListener("click", ev => aoClicarNoVazio(ev, col, c.iso, eixo, config, passo));
    return col;
  }

  function blocoDaConsulta(b) {
    const c = b.consulta;
    const nome = c.nome || c.titulo || "Consulta sem nome";
    const inicio = ui.horaBR(c.inicio), fim = c.fim ? ui.horaBR(c.fim) : "";
    const curto = b.altura <= 0.6;          // até ~35 min: uma linha só (hora + nome); acima, o procedimento vem numa 2ª linha
    const cor = corDoProcedimento(c.servico);
    const feita = c.status === "ganho";
    const bt = h("button", { type: "button", class: ["ag-bloco", curto && "curto", feita && "feita"], "aria-haspopup": "dialog",
      "aria-label": `${inicio}${fim ? ` às ${fim}` : ""}, ${nome}${c.servico ? `, ${c.servico}` : ""}${feita ? ", concluída" : ""}`,
      title: [`${inicio}${fim ? `–${fim}` : ""}`, nome, c.servico].filter(Boolean).join(" · ") },
      h("span", { class: "ag-bloco-l1" }, h("span", { class: "ag-bloco-hora dado" }, inicio), h("b", { class: "ag-bloco-nome" }, nome)),
      c.servico ? h("span", { class: "ag-bloco-serv" }, c.servico) : null,
      feita ? ui.icone("check") : null);
    bt.addEventListener("click", ev => { ev.stopPropagation(); abrirDetalhe(c, bt); });
    return h("li", { class: "ag-item", dataset: { cols: b.cols }, style: { "--t": String(b.topo), "--d": String(b.altura), "--col": String(b.col), "--cols": String(b.cols), "--cor-bloco": `var(--pal-${cor})` } }, bt);
  }

  /** Clique no vazio da coluna: abre «Marcar consulta» já no dia e no horário (a menos que já tenha passado ou esteja fora do atendimento). */
  function aoClicarNoVazio(ev, col, iso, eixo, config, passo) {
    if (ev.target.closest(".ag-item, .ag-bloq")) return;   // bloco de consulta tem o próprio clique; bloqueio não marca
    const r = col.getBoundingClientRect();
    if (!r.height) return;
    const hora = horaDoClique((ev.clientY - r.top) / r.height, eixo, passo);
    const min = paraMin(hora);
    if (Date.parse(`${iso}T${hora}:00-03:00`) < Date.now()) { ui.toast("Esse horário já passou.", { tipo: "info" }); return; }
    if (horarioAberto(config, iso, min) === false) { ui.toast("Fora do horário de atendimento da agenda.", { tipo: "info" }); return; }
    abrirAgendamento(null, { dia: iso, hora });
  }

  function posicionarAgora() {
    if (!eixoAtual) return;
    const n = partesSP(new Date());
    if (!n) return;
    const t = n.min / 60 - eixoAtual.ini;
    for (const el of conteudo.querySelectorAll(".ag-agora")) {
      el.hidden = t < 0 || t > eixoAtual.fim - eixoAtual.ini;
      el.style.setProperty("--t", String(t));
    }
  }
  const relogio = setInterval(posicionarAgora, 60_000);

  /** Detalhe da consulta ao tocar no bloco: quem, quando, origem e as ações (Abrir negócio, Remarcar, Desmarcar). */
  function abrirDetalhe(c, ancora) {
    const nome = c.nome || c.titulo || "Consulta sem nome";
    const p = partesSP(c.inicio);
    const acoes = h("div", { class: "ag-det-acoes" },
      h("button", { type: "button", class: "bt bt-sec bt-p", on: { click: () => { pop.fechar(); ctx.navegar(`#/crm/negocio/${encodeURIComponent(c.negocio_id)}`); } } }, "Abrir negócio"),
      ctx.pode("atendente") ? h("button", { type: "button", class: "bt bt-sec bt-p", on: { click: () => { pop.fechar(); abrirAgendamento(c); } } }, "Remarcar") : null,
      ctx.pode("atendente") ? h("button", { type: "button", class: "bt bt-contorno-perigo bt-p", on: { click: () => { pop.fechar(); desmarcar(c); } } }, "Desmarcar") : null);
    const corpo = h("div", { class: "ag-det" },
      h("b", { class: "ag-det-nome" }, nome),
      h("span", { class: "ag-det-quando dado" }, `${p ? nomeDia(p.dia) : ""} · ${ui.horaBR(c.inicio)}${c.fim ? `–${ui.horaBR(c.fim)}` : ""}`),
      c.servico ? h("span", null, c.servico) : null,
      c.telefone ? h("span", { class: "dado" }, ui.telBR(c.telefone)) : null,
      h("span", { class: "ag-det-origem" }, [origemDo(c), c.etapa || (c.marco === "agendada" ? "Agendada" : null)].filter(Boolean).join(" · ")),
      acoes);
    const pop = ui.flutuante(ancora, corpo, { classe: "flut-ag" });
    return pop;
  }

  /* ============================================================ marcar / remarcar / desmarcar (as janelas são marcarConsulta e desmarcarConsulta) */
  const recarregar = () => carregar({ silencioso: true, forcar: true });
  /** pre = consulta a remarcar (ou null); quando = {dia, hora} do clique na grade ou do «+» do dia */
  const abrirAgendamento = (pre = null, quando = null) => marcarConsulta(ctx, { negocio: pre, dia: quando && quando.dia, hora: quando && quando.hora, base: data, aoMudar: recarregar });
  const desmarcar = c => desmarcarConsulta(ctx, c, { aoMudar: recarregar });

  // atravessar os 760 px (girar o aparelho, redimensionar a janela) troca de visão
  const aoMudarLargura = () => {
    if (!vivo || mq.matches === movel) return;
    movel = mq.matches;
    carregar();
  };
  if (mq.addEventListener) mq.addEventListener("change", aoMudarLargura);

  // paleta de comandos (Ctrl/⌘+K, frente B): a ação «Marcar consulta» aparece enquanto a Agenda está aberta
  const desregistrar = ctx.comandos && typeof ctx.comandos.registrar === "function"
    ? ctx.comandos.registrar({ id: "agenda.marcar", rotulo: "Marcar consulta", palavras: "agenda consulta horário agendar", fazer: () => abrirAgendamento() }) : null;

  montarCabecalho();
  await carregar();
  return () => {
    vivo = false; sequencia++;
    if (typeof desregistrar === "function") try { desregistrar(); } catch { /* ok */ }
    clearInterval(relogio);
    if (mq.removeEventListener) mq.removeEventListener("change", aoMudarLargura);
  };
}
