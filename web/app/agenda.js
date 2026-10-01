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
  // a lógica pura do CRM (chave de idempotência, erro ambíguo): carregada sob demanda, com o mesmo ?v= do shell
  let logicaP = null;
  const logica = () => logicaP || (logicaP = import(`./crm-logica.js?v=${encodeURIComponent(ctx.versao)}`));

  const cabecalho = h("header", { class: "agenda-cab" });
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
    ui.limpar(cabecalho);
    const anterior = h("button", { type: "button", class: "bt-icone", "aria-label": passoDeNavegacao() === 1 ? "Dia anterior" : "Semana anterior", on: { click: () => mover(-1) } }, ui.icone("seta-esq"));
    const proximo = h("button", { type: "button", class: "bt-icone", "aria-label": passoDeNavegacao() === 1 ? "Próximo dia" : "Próxima semana", on: { click: () => mover(1) } }, ui.icone("seta-dir"));
    const hoje = h("button", { type: "button", class: "bt bt-sec bt-p", on: { click: () => { data = ui.hojeSP(); carregar(); } } }, "Hoje");
    const seletor = h("input", { class: "agenda-data", type: "date", value: data, "aria-label": "Escolher data" });
    seletor.addEventListener("change", () => { if (seletor.value) { data = seletor.value; carregar(); } });
    const periodo = h("div", { class: "agenda-periodo" }, anterior, seletor, proximo, hoje);
    const alternador = h("div", { class: "agenda-abas", role: "group", "aria-label": "Visualização da agenda" },
      ...[["dia", "Dia"], ["semana", "Semana"]].map(([id, rotulo]) => h("button", {
        type: "button", class: ["bt", modo === id ? "bt-prim" : "bt-fant", "bt-p"],
        "aria-pressed": String(modo === id), on: { click: () => { modo = id; carregar(); } },
      }, rotulo)));
    const acoes = h("div", { class: "agenda-acoes" }, alternador,
      ctx.pode("atendente") ? h("button", { type: "button", class: "bt bt-prim agenda-marcar", on: { click: () => abrirAgendamento(null, { dia: movel || modo === "dia" ? data : null }) } }, ui.icone("mais"), "Marcar consulta") : null);
    cabecalho.append(
      h("div", { class: "agenda-cab-titulo" },
        h("p", { class: "rotulo" }, ctx.cliente && ctx.cliente.nome || ""),
        h("h1", { class: "titulo-pag" }, "Agenda")),
      h("div", { class: "agenda-cab-controles" }, periodo, acoes));
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
      const r = await api.rpcC("nx_agenda_dia", { p_data: iv.de, p_dias: iv.dias });
      if (!vivo || minha !== sequencia) return;
      atual = r || { consultas: [], bloqueios: [] };
      chaveAtual = chave;
      desenhar();
    } catch (e) {
      if (!vivo || minha !== sequencia) return;
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

  /* ============================================================ marcar / remarcar / desmarcar */
  async function procurarNegocios(q) {
    const crm = await ctx.carregar("crm");
    if (!crm || typeof crm.kit !== "function") throw new Error("CRM indisponível.");
    const k = await crm.kit(ctx);
    const funis = (k.base.funis || []).filter(f => f.ativo !== false);
    const mapa = new Map();
    for (const funil of funis) {
      const r = await api.rpcC("nx_negocios_kanban", {
        p_funil: funil.id, p_filtro: { busca: q, status: "aberto" }, p_por_coluna: 100,
      });
      for (const coluna of r.colunas || []) for (const item of coluna.itens || []) {
        if (item.status === "aberto" && !item.consulta_em && !mapa.has(String(item.id))) mapa.set(String(item.id), { ...item, funil_nome: funil.nome });
      }
    }
    return [...mapa.values()].slice(0, 30);
  }

  /** quando = {dia, hora?}: o clique na grade ou no «+» do dia já leva o dia (e o horário) para o formulário. */
  async function abrirAgendamento(preselecionado = null, quando = null) {
    if (!ctx.pode("atendente")) return;
    let selecionado = preselecionado ? {
      ...preselecionado,
      id: preselecionado.id || preselecionado.negocio_id,
      titulo: preselecionado.titulo || preselecionado.nome,
    } : null;
    let horarios = [];
    const diaInicial = (quando && quando.dia) || (data >= ui.hojeSP() ? data : ui.hojeSP());   // a partir do dia na tela (nunca no passado)
    const busca = ui.campo({ rotulo: "Buscar oportunidade aberta", nome: "busca", tipo: "busca", placeholder: "Nome, serviço ou telefone", ajuda: "A consulta fica vinculada ao negócio escolhido." });
    const campoBusca = busca.querySelector("input");
    const lista = h("div", { class: "agenda-resultados", role: "listbox", "aria-label": "Oportunidades encontradas" });
    const escolhido = h("p", { class: "agenda-escolhido", role: "status" });
    const btBuscar = h("button", { type: "button", class: "bt bt-sec bt-p" }, "Buscar negócios");
    const dataEl = ui.campo({ rotulo: "A partir de", nome: "data", tipo: "data", valor: diaInicial });
    const servicoEl = ui.campo({ rotulo: "Serviço", nome: "servico", valor: selecionado && selecionado.servico || "", max: 80, placeholder: "Ex.: avaliação, limpeza" });
    const btHorarios = h("button", { type: "button", class: "bt bt-sec bt-p" }, "Ver horários livres");
    const slots = h("div", { class: "agenda-slots", role: "status", "aria-live": "polite" });
    const statusEl = h("p", { class: "crm-status", role: "status", "aria-live": "polite", hidden: true });
    let reqAtual = null, reqConteudo = "";      // M25: uma chave por intenção; erro ambíguo repete com a MESMA chave (nunca marca duas vezes)
    const formulario = h("div", { class: "agenda-form" },
      selecionado ? null : h("section", { class: "agenda-busca" }, busca, btBuscar, lista),
      escolhido, h("div", { class: "agenda-form-grade" }, dataEl, servicoEl), btHorarios, slots, statusEl);

    function pintarEscolhido() {
      escolhido.textContent = selecionado
        ? `${selecionado.titulo || selecionado.nome || "Negócio"}${selecionado.funil_nome ? ` · ${selecionado.funil_nome}` : ""}`
        : "Selecione um negócio para continuar.";
      if (selecionado && servicoEl.querySelector("input")) servicoEl.querySelector("input").value = selecionado.servico || "";
    }

    const modal = ui.modal({
      titulo: selecionado ? "Remarcar consulta" : "Marcar consulta", corpo: formulario, largura: "m",
      descricao: "Escolha um horário livre. A disponibilidade é validada novamente ao salvar.",
      acoes: [
        { rotulo: "Cancelar", tipo: "neutro", valor: false },
        { rotulo: "Confirmar consulta", tipo: "primario", fn: async m => {
          if (!selecionado) { m.erro("Escolha um negócio aberto para continuar."); return false; }
          const radio = slots.querySelector('input[name="agenda-slot"]:checked');
          const slot = radio && horarios[Number(radio.value)];
          if (!slot) { m.erro("Busque e selecione um horário livre."); return false; }
          try {
            const Lg = await logica();
            const params = { p_negocio: selecionado.id, p_inicio: slot.inicio, p_servico: servicoEl.querySelector("input").value.trim() || null };
            const conteudo = JSON.stringify(params);
            if (conteudo !== reqConteudo) { reqAtual = Lg.novaReq(); reqConteudo = conteudo; }
            const { resultado } = await Lg.escreverComReq(api, "nx_agenda_marcar", params, { req: reqAtual, aoStatus: t => { statusEl.textContent = t; statusEl.hidden = false; } });
            statusEl.hidden = true;
            return erroResposta(resultado);
          } catch (e) {
            statusEl.hidden = true;
            const codigo = e && e.codigo;
            const texto = e && e.ambigua ? "Não foi possível confirmar se foi salvo. Toque em «Confirmar consulta» de novo: é seguro, não marca duas vezes."
              : codigo === "horario_ocupado" ? "Esse horário acabou de ser ocupado. Busque os horários livres novamente."
              : codigo === "ja_agendada" ? "Este negócio já tem uma consulta futura. Atualize a agenda antes de tentar novamente."
                : api.mensagemErro(e);
            m.erro(texto);
            if (!(e && e.ambigua)) { horarios = []; ui.limpar(slots); }   // recusa: busca de novo; dúvida de conexão: o horário escolhido continua valendo para o «Salvar de novo»
            return false;
          }
        } },
      ],
    });

    pintarEscolhido();
    btBuscar.addEventListener("click", async () => {
      const q = campoBusca.value.trim();
      ui.limpar(lista);
      if (q.length < 2) { lista.appendChild(h("p", { class: "campo-ajuda" }, "Digite pelo menos duas letras ou quatro números.")); return; }
      lista.appendChild(h("p", { class: "campo-ajuda" }, "Buscando oportunidades…"));
      try {
        const itens = await ui.carregando(btBuscar, procurarNegocios(q));
        ui.limpar(lista);
        if (!itens.length) { lista.appendChild(h("p", { class: "campo-ajuda" }, "Nenhum negócio aberto sem consulta marcada. Crie ou atualize a oportunidade pelo CRM.")); return; }
        for (const item of itens) {
          const botao = h("button", { type: "button", class: "agenda-resultado", role: "option", "aria-selected": "false" },
            h("b", null, item.titulo || item.nome || "Negócio"),
            h("small", null, [item.contato && item.contato.nome, item.servico, item.funil_nome].filter(Boolean).join(" · ")));
          botao.addEventListener("click", () => {
            selecionado = item;
            for (const op of lista.querySelectorAll("[aria-selected]")) op.setAttribute("aria-selected", "false");
            botao.setAttribute("aria-selected", "true");
            pintarEscolhido();
            horarios = [];
            ui.limpar(slots);
          });
          lista.appendChild(botao);
        }
      } catch (e) { ui.limpar(lista); lista.appendChild(h("p", { class: "agenda-erro" }, api.mensagemErro(e))); }
    });

    btHorarios.addEventListener("click", async () => {
      ui.limpar(slots);
      if (!selecionado) { slots.appendChild(h("p", { class: "agenda-erro" }, "Escolha um negócio primeiro.")); return; }
      const dia = dataEl.querySelector("input").value || data;
      if (!dia) { slots.appendChild(h("p", { class: "agenda-erro" }, "Escolha uma data.")); return; }
      try {
        const r = await ui.carregando(btHorarios, api.rpcC("nx_agenda_livres", {
          p_a_partir: dia, p_dias: 14, p_servico: servicoEl.querySelector("input").value.trim() || null,
          p_negocio: selecionado.id,
        }));
        horarios = (r.horarios || []).filter(x => x.livre);
        if (!horarios.length) { slots.appendChild(h("p", { class: "agenda-vazio" }, "Não há horários livres nos próximos 14 dias. Tente outra data ou confira as configurações da agenda.")); return; }
        // o clique na grade leva o horário: seleciona o livre mais perto dele (no mesmo dia, senão o primeiro)
        let preferido = 0;
        if (quando && quando.hora && quando.dia === dia) {
          const alvo = paraMin(quando.hora);
          const doDia = horarios.map((s, i) => ({ i, p: partesSP(s.inicio) })).filter(x => x.p && x.p.dia === dia);
          if (doDia.length) preferido = doDia.reduce((m, x) => (Math.abs(x.p.min - alvo) < Math.abs(m.p.min - alvo) ? x : m)).i;
        }
        const opcoes = h("div", { class: "agenda-slots-grade", role: "radiogroup", "aria-label": "Horários livres" },
          horarios.map((slot, i) => {
            const id = `ag-slot-${Date.now()}-${i}`;
            const radio = h("input", { type: "radio", name: "agenda-slot", id, value: String(i), checked: i === preferido });
            return h("label", { class: "agenda-slot", for: id }, radio,
              h("span", null, h("b", null, ui.dataHoraBR(slot.inicio)), h("small", null, `${ui.num(slot.capacidade - slot.ocupados)} vaga${slot.capacidade - slot.ocupados === 1 ? "" : "s"}`)));
          }));
        slots.append(opcoes, h("p", { class: "campo-ajuda" }, `Duração prevista: ${ui.num(r.duracao_min)} min. O servidor confirma o horário ao salvar.`));
      } catch (e) { slots.appendChild(h("p", { class: "agenda-erro" }, api.mensagemErro(e))); }
    });

    const resultado = await modal;
    if (resultado && resultado.ok) {
      ui.toast(resultado.remarcada ? "Consulta remarcada." : "Consulta marcada.", { tipo: "ok" });
      carregar({ silencioso: true, forcar: true });
    }
  }

  async function desmarcar(c) {
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
    if (r && r.ok) { ui.toast("Consulta desmarcada.", { tipo: "ok" }); carregar({ silencioso: true, forcar: true }); }
  }

  // atravessar os 760 px (girar o aparelho, redimensionar a janela) troca de visão
  const aoMudarLargura = () => {
    if (!vivo || mq.matches === movel) return;
    movel = mq.matches;
    carregar();
  };
  if (mq.addEventListener) mq.addEventListener("change", aoMudarLargura);

  montarCabecalho();
  await carregar();
  return () => {
    vivo = false; sequencia++;
    clearInterval(relogio);
    if (mq.removeEventListener) mq.removeEventListener("change", aoMudarLargura);
  };
}
