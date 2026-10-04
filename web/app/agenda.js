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

const dataAgendaValida = v => typeof v === "string" && /^\d{4}-\d{2}-\d{2}$/.test(v) && !Number.isNaN(Date.parse(`${v}T00:00:00Z`)) && new Date(`${v}T00:00:00Z`).toISOString().slice(0, 10) === v;

/** Preferências locais sem conteúdo de consulta; o escopo evita misturar empresas ou contas no mesmo navegador. */
export function chavePreferenciasAgenda(clienteId, contaId) {
  if (!clienteId) return null;
  return `nx-app-agenda-pref-v1:${encodeURIComponent(String(clienteId).slice(0, 120))}:${encodeURIComponent(String(contaId || "local").slice(0, 120))}`;
}

export function normalizarPreferenciasAgenda(valor, hoje = "") {
  const v = valor && typeof valor === "object" && !Array.isArray(valor) ? valor : {};
  // a DATA só volta no mesmo dia em que foi guardada: no dia seguinte a Agenda abre em hoje (senão «Marcar» pré-preenche um dia antigo)
  const mesmoDia = dataAgendaValida(hoje) && v.em === hoje;
  return {
    data: mesmoDia && dataAgendaValida(v.data) ? v.data : (dataAgendaValida(hoje) ? hoje : ""),
    modo: ["dia", "semana", "mes"].includes(v.modo) ? v.modo : "semana",
    agrupar: ["juntos", "responsavel"].includes(v.agrupar) ? v.agrupar : "responsavel",
    cor: ["servico", "profissional"].includes(v.cor) ? v.cor : "servico",      // critério da cor dos blocos (plano 50, item 39)
  };
}

/** Atalhos da Agenda sem modificador («[», «]», «T»), como o «?» do app: Alt+setas são Voltar/Avançar do navegador e não podem ser tomados.
    O chamador ignora campos editáveis e diálogos. */
export function acaoTeclaAgenda(ev) {
  if (!ev || ev.altKey || ev.ctrlKey || ev.metaKey || ev.shiftKey) return null;
  const k = String(ev.key).toLowerCase();
  if (k === "[") return "anterior";
  if (k === "]") return "proximo";
  if (k === "t") return "hoje";
  return null;
}

/** Índice para o roving tabindex das abas de dias no celular. */
export function indiceAbaAgendaTecla(tecla, atual, total) {
  const n = Math.max(0, Number(total) || 0), i = Math.max(0, Math.min(n - 1, Number(atual) || 0));
  if (!n) return null;
  if (tecla === "Home") return 0;
  if (tecla === "End") return n - 1;
  if (tecla === "ArrowRight" || tecla === "ArrowDown") return (i + 1) % n;
  if (tecla === "ArrowLeft" || tecla === "ArrowUp") return (i - 1 + n) % n;
  return null;
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

/* ============================================================ plano 50 (E): cor por pessoa, ocupação, mês, próxima, arrasto, painel do dia */
/** Índice (0–11) do token --pal-N para um responsável: o mesmo id tem sempre a mesma cor; sem responsável, cinza quente (6). */
export function corDoResponsavel(id) {
  const s = String(id || "").trim();
  if (!s) return 6;
  let h = 7;
  for (const ch of s) h = (h * 33 + ch.codePointAt(0)) >>> 0;
  return h % 12;
}
/** Chave, cor e rótulo de uma consulta pelo critério de cor («servico» ou «profissional»). `nomes` = {dono_id: nome}. */
export function corDaConsulta(c, por = "servico", nomes = {}) {
  if (por === "profissional") {
    const id = c && c.dono_id ? String(c.dono_id) : "";
    return { chave: `p:${id || "sem"}`, cor: corDoResponsavel(id), rotulo: id ? (nomes[id] || "Responsável") : "Sem responsável" };
  }
  const s = String((c && c.servico) || "").trim();
  return { chave: `s:${s.normalize("NFD").replace(/[̀-ͯ]/g, "").toLowerCase()}`, cor: corDoProcedimento(s), rotulo: s || "Sem serviço" };
}
/** Legenda das cores em uso: um item por chave, do mais frequente ao menos; passando de `max`, o resto vira «Outros». */
export function legendaDe(consultas, { por = "servico", nomes = {}, max = 8 } = {}) {
  const mapa = new Map();
  for (const c of consultas || []) {
    const k = corDaConsulta(c, por, nomes);
    const it = mapa.get(k.chave) || { ...k, n: 0 };
    it.n++;
    mapa.set(k.chave, it);
  }
  const itens = [...mapa.values()].sort((a, b) => b.n - a.n || a.rotulo.localeCompare(b.rotulo, "pt-BR"));
  if (itens.length <= max) return itens;
  const resto = itens.slice(max);
  return [...itens.slice(0, max), { chave: "outros", cor: null, rotulo: `Outros (${resto.length})`, n: resto.reduce((s, x) => s + x.n, 0), chaves: resto.map(x => x.chave) }];
}
/** Tocar um item da legenda liga/desliga o destaque dele (conjunto vazio = tudo à mostra); «Outros» liga as chaves que agrupa. */
export function alternarLegenda(ativos, item) {
  const s = new Set(ativos || []);
  const chaves = item.chaves || [item.chave];
  const todas = chaves.every(k => s.has(k));
  for (const k of chaves) { if (todas) s.delete(k); else s.add(k); }
  return s;
}

/** Ocupação do dia: minutos marcados sobre a capacidade do expediente (faixas − intervalos, × atendimentos simultâneos).
    pct = null quando a configuração não diz o horário (então a capacidade é estimada em 10 h e `estimada` = true) e também quando o dia é fechado. */
export function ocupacaoDoDia(consultas, iso, config) {
  const dur = Number(config && config.duracao_min) || 30;
  const itens = consultasDoDia(consultas, iso);
  let marcados = 0;
  for (const c of itens) { const p = minutosDaConsulta(c, dur); if (p) marcados += p.fim - p.ini; }
  const faixas = faixasDoDia(config, iso);
  const simult = Math.max(1, Number(config && config.capacidade) || 1);
  const estimada = faixas === null;
  const capacidade = (estimada ? 10 * 60 : subtrair(faixas, intervalosDaConfig(config)).reduce((s, [a, b]) => s + (b - a), 0)) * simult;
  const fechado = !estimada && capacidade === 0;
  return { n: itens.length, marcados, capacidade, estimada, fechado, pct: capacidade > 0 ? Math.min(1, marcados / capacidade) : null };
}
/** Nível 0–4 da ocupação (livre, pouca, metade, cheia, lotada): vira classe de cor e texto. */
export function nivelOcupacao(pct) {
  if (pct === null || pct === undefined || !(pct > 0)) return 0;
  if (pct < .35) return 1;
  if (pct < .7) return 2;
  if (pct < .95) return 3;
  return 4;
}
export function textoOcupacao(oc) {
  if (!oc) return "";
  if (oc.fechado) return "fechado";
  if (oc.pct === null) return "";
  return `${Math.round(oc.pct * 100)}% ocupado${oc.estimada ? " (estimado)" : ""}`;
}
/** Ocupação média dos dias abertos de um período (null se nenhum dia tem capacidade). */
export function ocupacaoDoPeriodo(consultas, dias, config) {
  const abertos = (dias || []).map(d => ocupacaoDoDia(consultas, d, config)).filter(o => o.pct !== null);
  if (!abertos.length) return null;
  return abertos.reduce((s, o) => s + o.pct, 0) / abertos.length;
}

/* ---------- mês ---------- */
export function primeiroDoMes(iso) { return `${String(iso).slice(0, 7)}-01`; }
export function diasNoMes(iso) { const [a, m] = String(iso).split("-").map(Number); return new Date(Date.UTC(a, m, 0)).getUTCDate(); }
/** O 1º dia do mês `delta` meses depois (ou antes) de `iso`. */
export function mesISO(iso, delta = 0) {
  const [a, m] = String(iso).split("-").map(Number);
  const d = new Date(Date.UTC(a, m - 1 + delta, 1, 12));
  return `${d.getUTCFullYear()}-${String(d.getUTCMonth() + 1).padStart(2, "0")}-01`;
}
/** As 42 células (6 semanas, de segunda a domingo) que mostram o mês de `iso`; `foraDoMes` marca as de antes e depois. */
export function gradeDoMes(iso) {
  const ini = segundaDe(primeiroDoMes(iso)), mes = String(iso).slice(0, 7);
  return Array.from({ length: 42 }, (_, i) => { const d = diaISO(ini, i); return { iso: d, foraDoMes: d.slice(0, 7) !== mes }; });
}
/** Teclado na grade do mês: setas movem um dia ou uma semana; Home/End vão ao começo e ao fim da semana. null = não é tecla da grade. */
export function indiceCelulaMesTecla(tecla, i, total = 42) {
  const n = Math.max(1, Number(total) || 42), k = Math.max(0, Math.min(n - 1, Number(i) || 0));
  if (tecla === "ArrowRight") return Math.min(n - 1, k + 1);
  if (tecla === "ArrowLeft") return Math.max(0, k - 1);
  if (tecla === "ArrowDown") return k + 7 < n ? k + 7 : null;
  if (tecla === "ArrowUp") return k - 7 >= 0 ? k - 7 : null;
  if (tecla === "Home") return k - (k % 7);
  if (tecla === "End") return Math.min(n - 1, k - (k % 7) + 6);
  return null;
}
/** «Outubro de 2026». */
export function nomeDoMes(iso) {
  const t = new Intl.DateTimeFormat("pt-BR", { month: "long", year: "numeric", timeZone: FUSO }).format(new Date(`${primeiroDoMes(iso)}T12:00:00-03:00`));
  return t.charAt(0).toUpperCase() + t.slice(1);
}

/* ---------- próxima consulta ---------- */
/** A próxima consulta a partir de `agora` (ms): a primeira que ainda não começou e não foi concluída; null se nenhuma. */
export function proximaConsulta(consultas, agora = Date.now()) {
  let melhor = null, tm = Infinity;
  for (const c of consultas || []) {
    const t = Date.parse(c && c.inicio);
    if (!Number.isFinite(t) || t < agora || c.status === "ganho") continue;
    if (t < tm) { melhor = c; tm = t; }
  }
  return melhor;
}
/** «em 25 min», «em 2 h», «amanhã às 09:00», «sex 03/10 às 14:30». */
export function rotuloProxima(c, agora = Date.now(), hojeISO = null) {
  if (!c) return "";
  const t = Date.parse(c.inicio), p = partesSP(c.inicio);
  if (!p) return "";
  const hoje = hojeISO || (partesSP(new Date(agora)) || {}).dia;
  const hora = horaTxt(p.min);
  if (p.dia === hoje) {
    const min = Math.max(0, Math.round((t - agora) / 60000));
    if (min < 60) return `em ${min} min · ${hora}`;
    return `em ${Math.round(min / 60)} h · ${hora}`;
  }
  return `${rotuloDoDia(p.dia, hoje).toLowerCase()} às ${hora}`;
}

/* ---------- arrastar para remarcar (desktop, mouse) ---------- */
/** O arrasto é permitido? Só mouse, só desktop, só quem pode marcar e só consulta futura não concluída. */
export function podeArrastar({ pointerType, movel, pode, consulta, agora = Date.now() } = {}) {
  if (pointerType !== "mouse" || movel || !pode || !consulta || consulta.status === "ganho") return false;
  const t = Date.parse(consulta.inicio);
  return Number.isFinite(t) && t > agora;
}
/** Destino do arrasto: fração da altura da coluna onde está o ponteiro (menos o ponto em que o bloco foi pego) → início em minutos,
    arredondado ao passo e com o bloco inteiro dentro do eixo. */
export function alvoDoArrasto({ fracao, eixo, passo = 30, duracao = 30, pegouEm = 0 } = {}) {
  const p = Math.max(5, Number(passo) || 30), dur = Math.max(5, Number(duracao) || 30);
  const total = (eixo.fim - eixo.ini) * 60;
  let min = eixo.ini * 60 + Math.max(0, Math.min(1, Number(fracao) || 0)) * total - (Number(pegouEm) || 0);
  min = Math.round(min / p) * p;
  min = Math.max(eixo.ini * 60, Math.min(eixo.fim * 60 - dur, min));
  return { min, hora: horaTxt(min) };
}
/** O destino muda alguma coisa? Mesmo dia e mesmo horário = nada a remarcar. */
export function destinoMudou(c, iso, hora) {
  const p = partesSP(c && c.inicio);
  return !p || p.dia !== iso || horaTxt(p.min) !== hora;
}

/* ---------- painel do dia ---------- */
/** O que a consulta é: concluída (status ganho), falta (etapa com marco «faltou») e encaixe (fora do horário de atendimento ou
    acima dos atendimentos simultâneos configurados). O servidor não manda um sinal de encaixe: isto é derivado da configuração. */
export function classificarConsulta(c, config, { iso = null, vizinhas = [] } = {}) {
  const p = partesSP(c && c.inicio);
  const dia = iso || (p && p.dia);
  const feita = !!c && c.status === "ganho";
  const falta = !!c && c.marco === "faltou";
  const dur = Number(config && config.duracao_min) || 30;
  const foraDoHorario = !!(p && dia && horarioAberto(config, dia, p.min) === false);
  let acimaDaCapacidade = false;
  if (p && vizinhas.length) {
    const eu = minutosDaConsulta(c, dur);
    const simult = Math.max(1, Number(config && config.capacidade) || 1);
    const juntas = vizinhas.filter(o => o !== c).map(o => minutosDaConsulta(o, dur)).filter(o => o && eu && o.dia === eu.dia && o.ini < eu.fim && o.fim > eu.ini).length;
    acimaDaCapacidade = juntas >= simult;
  }
  return { feita, falta, encaixe: foraDoHorario || acimaDaCapacidade };
}
/** Resumo do dia para o painel: total, concluídas, faltas, encaixes e os itens em ordem de horário com a classificação. */
export function resumoDoDia(consultas, iso, config) {
  const itens = consultasDoDia(consultas, iso);
  const r = { total: itens.length, feitas: 0, faltas: 0, encaixes: 0, itens: [] };
  for (const c of itens) {
    const k = classificarConsulta(c, config, { iso, vizinhas: itens });
    if (k.feita) r.feitas++;
    if (k.falta) r.faltas++;
    if (k.encaixe) r.encaixes++;
    r.itens.push({ c, ...k });
  }
  return r;
}

/* ---------- peças de tela (recebem o `h` do ui: dá para montar sem navegador) ---------- */
/** Anel de ocupação (SVG): o traço preenche a fração ocupada; o nível vira classe (.ag-ocup-N) para a cor. */
export function anelOcupacao(h, oc, { tamanho = 30, texto = "" } = {}) {
  const r = 12, c = 2 * Math.PI * r;
  const pct = oc && oc.pct !== null && oc.pct !== undefined ? Math.max(0, Math.min(1, oc.pct)) : 0;
  return h("svg", { class: ["ag-anel", `ag-ocup-${nivelOcupacao(oc && oc.pct)}`], viewBox: "0 0 30 30", width: String(tamanho), height: String(tamanho), "aria-hidden": "true", focusable: "false" },
    h("circle", { class: "ag-anel-trilho", cx: "15", cy: "15", r: String(r) }),
    h("circle", { class: "ag-anel-valor", cx: "15", cy: "15", r: String(r), "stroke-dasharray": `${(pct * c).toFixed(2)} ${c.toFixed(2)}`, transform: "rotate(-90 15 15)" }),
    texto ? h("text", { class: "ag-anel-txt", x: "15", y: "15", "text-anchor": "middle", "dominant-baseline": "central" }, texto) : null);
}

/** Legenda das cores (serviço ou profissional): tocar um item destaca só aquelas consultas (aria-pressed); «Mostrar todas» limpa. */
export function montarLegenda({ h, itens = [], ativos = new Set(), aoAlternar, num = String } = {}) {
  const el = h("div", { class: "ag-legenda", role: "group", "aria-label": "Legenda das cores" });
  for (const it of itens) {
    const on = (it.chaves || [it.chave]).every(k => ativos.has(k));
    el.appendChild(h("button", { type: "button", class: ["ag-leg-chip", on && "ativo"], "aria-pressed": String(on), dataset: { chave: it.chave },
      title: `${it.rotulo}: ${num(it.n)} ${it.n === 1 ? "consulta" : "consultas"}`,
      on: { click: () => aoAlternar && aoAlternar(it) } },
      h("i", { class: "ag-leg-cor", "aria-hidden": "true", style: it.cor === null || it.cor === undefined ? null : { "--cor-bloco": `var(--pal-${it.cor})` } }),
      h("span", { class: "ag-leg-nome" }, it.rotulo), h("b", { class: "ag-leg-n dado" }, num(it.n))));
  }
  if (ativos.size) el.appendChild(h("button", { type: "button", class: "ag-leg-chip ag-leg-limpar", on: { click: () => aoAlternar && aoAlternar(null) } }, "Mostrar todas"));
  return el;
}

/** Mini-calendário do mês com densidade: 6 × 7 botões (cada um com contagem, barra de ocupação, hoje e bloqueio), setas de mês e teclado. */
export function montarMiniCalendario({ h, mes, consultas = [], bloqueios = [], config = null, hoje, selecionado = null, aoEscolher, aoMudarMes, num = String, carregando = false, compacto = false } = {}) {
  const celulas = gradeDoMes(mes);
  const dentro = celulas.filter(c => !c.foraDoMes).map(c => c.iso);
  const total = dentro.reduce((s, d) => s + consultasDoDia(consultas, d).length, 0);
  const media = ocupacaoDoPeriodo(consultas, dentro, config);
  const el = h("section", { class: ["ag-mes", compacto && "ag-mes-compacto"], "aria-label": `Mês de ${nomeDoMes(mes)}`, "aria-busy": carregando ? "true" : null });
  el.appendChild(h("header", { class: "ag-mes-cab" },
    h("button", { type: "button", class: "bt-icone ag-mes-nav", "aria-label": "Mês anterior", on: { click: () => aoMudarMes && aoMudarMes(-1) } }, h("span", { "aria-hidden": "true" }, "‹")),
    h("div", { class: "ag-mes-tit" }, h("h2", { class: "ag-mes-nome" }, nomeDoMes(mes)),
      h("p", { class: "ag-mes-resumo", role: "status" }, carregando ? "Carregando…" : `${num(total)} ${total === 1 ? "consulta" : "consultas"}${media === null ? "" : ` · ocupação média ${media > 0 && media < .005 ? "abaixo de 1%" : `${Math.round(media * 100)}%`}`}`)),
    h("button", { type: "button", class: "bt-icone ag-mes-nav", "aria-label": "Próximo mês", on: { click: () => aoMudarMes && aoMudarMes(1) } }, h("span", { "aria-hidden": "true" }, "›"))));
  el.appendChild(h("div", { class: "ag-mes-sem", "aria-hidden": "true" }, ["seg", "ter", "qua", "qui", "sex", "sáb", "dom"].map(d => h("span", null, d))));
  const grade = h("div", { class: "ag-mes-grade", role: "group", "aria-label": `Dias de ${nomeDoMes(mes).toLowerCase()}` });
  const foco = selecionado && celulas.some(c => c.iso === selecionado) ? selecionado : (celulas.some(c => c.iso === hoje && !c.foraDoMes) ? hoje : primeiroDoMes(mes));
  const botoes = [];
  celulas.forEach((cel, i) => {
    const oc = cel.foraDoMes || carregando ? null : ocupacaoDoDia(consultas, cel.iso, config);
    const n = oc ? oc.n : 0;
    const diaTodo = !cel.foraDoMes && bloqueiosDoDia(bloqueios, cel.iso).some(b => Date.parse(b.fim) - Date.parse(b.inicio) >= 24 * 3600e3 - 1);
    const nivel = nivelOcupacao(oc && oc.pct);
    const txtOc = textoOcupacao(oc);
    const partes = [nomeDia(cel.iso, true), oc ? `${num(n)} ${n === 1 ? "consulta" : "consultas"}` : null, txtOc || null, diaTodo ? "bloqueado" : null, cel.iso === selecionado ? "selecionado" : null].filter(Boolean);
    const b = h("button", { type: "button", class: ["ag-mes-dia", `ag-ocup-${nivel}`, cel.foraDoMes && "ag-mes-fora", cel.iso === hoje && "hoje", cel.iso === selecionado && "sel", diaTodo && "ag-mes-bloq", oc && oc.fechado && "ag-mes-fechado", hoje && cel.iso < hoje && "ag-mes-passado"],
      "aria-label": partes.join(", "), "aria-current": cel.iso === hoje ? "date" : null, tabindex: cel.iso === foco ? "0" : "-1", dataset: { iso: cel.iso },
      style: { "--p": oc && oc.pct !== null ? oc.pct.toFixed(3) : "0" }, on: { click: () => aoEscolher && aoEscolher(cel.iso) } },
      h("b", { class: "ag-mes-num dado" }, cel.iso.slice(8, 10)),
      h("span", { class: ["ag-mes-n", n > 0 && "tem"], "aria-hidden": "true" }, n > 0 ? num(n) : ""),
      h("i", { class: "ag-mes-barra", "aria-hidden": "true" }));
    botoes.push(b);
    grade.appendChild(b);
  });
  grade.addEventListener("keydown", ev => {
    const i = botoes.indexOf(ev.target);
    if (i < 0) return;
    if (ev.key === "PageUp" || ev.key === "PageDown") { ev.preventDefault(); if (aoMudarMes) aoMudarMes(ev.key === "PageUp" ? -1 : 1); return; }
    const j = indiceCelulaMesTecla(ev.key, i, botoes.length);
    if (j === null) return;
    ev.preventDefault();
    for (const [k, b] of botoes.entries()) b.tabIndex = k === j ? 0 : -1;
    botoes[j].focus();
  });
  el.appendChild(grade);
  el.appendChild(h("p", { class: "ag-mes-legenda", "aria-hidden": "true" }, h("span", null, "livre"), [0, 1, 2, 3, 4].map(k => h("i", { class: ["ag-mes-amostra", `ag-ocup-${k}`] })), h("span", null, "lotado")));
  return el;
}

/** Painel do dia: 4 números (consultas, concluídas, faltas, encaixes) e a lista em ordem de horário; tocar abre o detalhe. Só leitura:
    «confirmar presença» depende de uma RPC que ainda não existe. */
export function montarPainelDia({ h, iso, consultas = [], config = null, hoje, aoAbrir, aoMarcar, horaBR = x => x, num = String, pode = false, titulo = null } = {}) {
  const r = resumoDoDia(consultas, iso, config);
  const el = h("aside", { class: "ag-painel", "aria-label": "Resumo do dia" });
  el.appendChild(h("header", { class: "ag-painel-cab" }, h("h2", { class: "ag-painel-titulo" }, titulo || (iso === hoje ? "Hoje" : nomeDia(iso, true))),
    h("p", { class: "ag-painel-sub" }, iso === hoje ? nomeDia(iso, true) : (hoje && iso < hoje ? "Dia passado" : "Dia por vir"))));
  const kpi = (valor, rotulo, cls) => h("div", { class: ["ag-kpi", cls] }, h("b", { class: "dado", dataset: { valor: String(valor) } }, num(valor)), h("span", null, rotulo));
  el.appendChild(h("div", { class: "ag-painel-kpis" },
    kpi(r.total, r.total === 1 ? "consulta" : "consultas"), kpi(r.feitas, r.feitas === 1 ? "concluída" : "concluídas", r.feitas && "ok"),
    kpi(r.faltas, r.faltas === 1 ? "falta" : "faltas", r.faltas && "ruim"), kpi(r.encaixes, r.encaixes === 1 ? "encaixe" : "encaixes", r.encaixes && "aten")));
  if (!r.itens.length) {
    el.appendChild(h("div", { class: "ag-painel-vazio" }, h("p", { class: "narr" }, "Nenhuma consulta neste dia."),
      pode && aoMarcar ? h("button", { type: "button", class: "bt bt-sec bt-p", on: { click: () => aoMarcar(iso) } }, "Marcar consulta") : null));
    return el;
  }
  const lista = h("ol", { class: "ag-painel-lista" });
  for (const it of r.itens) {
    const c = it.c, nome = c.nome || c.titulo || "Consulta sem nome";
    const selos = [it.feita ? ["Concluída", "pilula-ok"] : null, it.falta ? ["Faltou", "pilula-ruim"] : null, it.encaixe ? ["Encaixe", "pilula-aten"] : null].filter(Boolean);
    const bt = h("button", { type: "button", class: ["ag-painel-item", it.feita && "feita"], "aria-haspopup": "dialog", on: { click: () => aoAbrir && aoAbrir(c, bt) } },
      h("span", { class: "ag-painel-hora dado" }, horaBR(c.inicio)),
      h("span", { class: "ag-painel-txt" }, h("b", null, nome), c.servico ? h("small", null, c.servico) : null),
      selos.length ? h("span", { class: "ag-painel-selos" }, selos.map(([t, cls]) => h("span", { class: ["pilula", cls] }, t))) : null);
    lista.appendChild(h("li", null, bt));
  }
  el.appendChild(lista);
  return el;
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

/**
 * O dia pedido (clique na grade, «+» do dia) não tem horário livre e a janela abriu em outro: «Sem horário livre em qui 02/10 — mostrando o próximo: sex 03/10».
 * null quando o horário selecionado é do dia pedido (ou não houve dia pedido).
 */
export function avisoOutroDia(diaPedido, slot, hojeISO) {
  if (!diaPedido || !slot || !slot.dia || slot.dia === diaPedido) return null;
  const nome = iso => (iso === hojeISO ? "hoje" : iso === diaISO(hojeISO, 1) ? "amanhã" : `${semanaCurta(iso)} ${iso.slice(8, 10)}/${iso.slice(5, 7)}`);
  const pedido = nome(diaPedido);
  return `Sem horário livre ${pedido === "hoje" || pedido === "amanhã" ? pedido : `em ${pedido}`} — mostrando o próximo: ${nome(slot.dia)}`;
}

/**
 * «Desfazer» devolve a oportunidade à etapa (e à posição) em que estava: marcar leva o cartão para «Agendada» e desmarcar, para «Nova».
 * antes = {estagio_id, ordem} lido ANTES de marcar. → true se deu certo (ou não havia o que devolver); false se a etapa não pôde ser devolvida
 * (a consulta já foi desfeita: isso não vira erro do Desfazer).
 */
export async function devolverEtapa(api, negocioId, antes) {
  if (!antes || !antes.estagio_id) return true;
  try {
    await api.rpcC("nx_negocio_mover", { p_id: negocioId, p_estagio: antes.estagio_id, p_ordem: antes.ordem ?? null, p_extra: {} });
    return true;
  } catch (e) { console.error("agenda: não devolveu a etapa", e); return false; }
}

/** A etapa (e a posição) em que a oportunidade está AGORA, pela ficha (nx_negocio_ver): lida ANTES de remarcar pelo arrasto, para o Desfazer
    devolver o cartão a ela (a janela faz o mesmo com a sua ficha). → {estagio_id, ordem} ou null (sem a ficha, o Desfazer devolve só o horário). */
export async function lerEtapa(api, negocioId) {
  try {
    const d = await api.rpcC("nx_negocio_ver", { p_id: negocioId });
    return d && d.negocio && d.negocio.estagio_id ? { estagio_id: d.negocio.estagio_id, ordem: d.negocio.ordem ?? null } : null;
  } catch { return null; }
}

/** Devolve a consulta ao horário anterior como ENCAIXE (o Desfazer de uma remarcação, pela janela ou pelo arrasto): devolver o que já estava
    marcado não passa pela regra de antecedência nem de horário de atendimento (senão desfazer em cima da hora era recusado). */
export async function voltarAoHorario(api, negocioId, inicio, servico) {
  return erroResposta(await api.rpcC("nx_agenda_marcar", { p_negocio: negocioId, p_inicio: inicio, p_servico: servico || null, p_encaixe: true }));
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
 * negocio: {id | negocio_id, titulo | nome, servico?, funil_nome?, inicio? (consulta atual: é remarcação), estagio_id?, ordem? (etapa atual: o Desfazer devolve o cartão a ela)};
 * dia/hora: o que veio do clique na grade; base: dia aberto na tela.
 */
export async function marcarConsulta(ctx, { negocio = null, dia = null, hora = null, base = null, aoMudar = null } = {}) {
  if (!ctx.pode("atendente")) return null;
  const { ui, api } = ctx;
  const h = ui.h;
  const [Lg] = await Promise.all([logicaDe(ctx), ui.carregarCss("agenda")]);   // o CSS da agenda também vale quando a janela abre pelo CRM (gaveta do negócio)
  const hoje = ui.hojeSP();
  let sel = negocio ? { id: negocio.id || negocio.negocio_id, titulo: negocio.titulo || negocio.nome || "Negócio", servico: negocio.servico || "", funil_nome: negocio.funil_nome || negocio.estagio_nome || "",
    consultaAtual: negocio.inicio || negocio.consulta_em || null,
    antes: negocio.estagio_id ? { estagio_id: negocio.estagio_id, ordem: negocio.ordem ?? null } : null } : null;
  const diaPedido = dia && dia >= hoje ? dia : null;      // o dia que a pessoa pediu (clique na grade ou «+» do dia)
  const aPartirInicial = diaPedido || (base && base >= hoje ? base : hoje);
  let grupos = [], diaSel = null, slotSel = null, duracao = null, seqH = 0, seqB = 0;
  let reqAtual = null, reqConteudo = "";
  const preferido = dia && hora ? { dia, hora } : null;

  const campoBusca = ui.campo({ rotulo: "Buscar oportunidade aberta", nome: "busca", tipo: "busca", placeholder: "Nome ou telefone", ajuda: "A consulta fica vinculada à oportunidade escolhida." });
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
  // o dia pedido não tem vaga e a janela abriu em outro: avisa com destaque (senão «Confirmar», o 2º toque, marcaria no dia errado)
  const outroDiaTxt = h("span");
  const outroDia = h("p", { class: "aviso aviso-aten ag-outro-dia", role: "status", hidden: true }, ui.icone("info"), outroDiaTxt);
  const statusEl = h("p", { class: "crm-status", role: "status", "aria-live": "polite", hidden: true });
  const formulario = h("form", { class: "agenda-form", novalidate: true }, secBusca, escolhido,
    h("div", { class: "agenda-form-grade" }, servicoEl, outraData), outroDia, atalhos, diasEl, horasEl, info, statusEl);
  const avisarOutroDia = txt => { outroDiaTxt.textContent = txt || ""; outroDia.hidden = !txt; };
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
      negocio ? null : h("button", { type: "button", class: "bt bt-fant bt-p", on: { click: () => { sel = null; slotSel = null; grupos = []; diaSel = null; ui.limpar(atalhos); ui.limpar(diasEl); ui.limpar(horasEl); info.textContent = ""; avisarOutroDia(null); pintarEscolhido(); inputBusca.focus(); } } }, "Trocar")));
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
    avisarOutroDia(null);
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
      if (inicial) avisarOutroDia(avisoOutroDia(diaPedido, slotSel, hoje));
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
  /** A ficha diz em que etapa a oportunidade está AGORA (o «Desfazer» devolve o cartão a ela) e, na busca, traz o serviço e a consulta atual. */
  let fichaP = null;
  function lerFicha({ completar = false } = {}) {
    const id = sel.id;
    fichaP = api.rpcC("nx_negocio_ver", { p_id: id }).then(d => {
      if (!d || !d.negocio || !sel || sel.id !== id) return;
      if (d.negocio.estagio_id) sel.antes = { estagio_id: d.negocio.estagio_id, ordem: d.negocio.ordem ?? null };
      if (!completar) return;
      sel.servico = d.negocio.servico || "";
      sel.consultaAtual = d.negocio.consulta_em || null;
      const campo = servicoEl.querySelector("input");
      if (!campo.value && sel.servico) campo.value = sel.servico;
      pintarEscolhido();
    }).catch(() => { /* sem a ficha: segue só com os horários */ });
  }
  function escolher(item) {
    sel = { id: item.id, titulo: item.titulo || item.contato_nome || "Negócio", servico: "", funil_nome: item.estagio_nome || "", consultaAtual: null, antes: null };
    pintarEscolhido();
    carregarHorarios({ inicial: true });
    // a ficha traz o serviço e a consulta atual (se houver, o aviso de que será remarcada); a duração já vem do servidor pelo negócio
    lerFicha({ completar: true });
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
      if (!sel.antes) lerFicha();        // quem abriu a janela não disse a etapa: lê agora, enquanto a pessoa escolhe o horário
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
          // a etapa de antes ainda está chegando? espera um instante (no máximo 1,5 s): depois de marcar o cartão já estará em «Agendada»
          if (!sel.antes && fichaP) await Promise.race([fichaP, new Promise(r => setTimeout(r, 1500))]);
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
  const marcada = { id: sel.id, antes: sel.antes || null, servicoAntes: sel.servico || null };      // o que valia ANTES de marcar
  if (aoMudar) try { aoMudar(resultado); } catch (e) { console.error(e); }
  ui.acaoComDesfazer({
    texto: `${resultado.remarcada ? "Remarcada" : "Marcada"} para ${rotulo}`,
    reverter: async () => {
      // remarcação volta ao horário (e ao serviço) anterior, como ENCAIXE (voltarAoHorario); consulta nova some
      if (anterior) await voltarAoHorario(api, marcada.id, anterior, marcada.servicoAntes || servicoMarcado);
      else erroResposta(await api.rpcC("nx_agenda_desmarcar", { p_negocio: marcada.id, p_motivo: "Desfeito logo depois de marcar" }));
      // marcar levou o cartão para «Agendada» (e desmarcar o leva para «Nova»): volta para a etapa em que estava
      if (resultado.etapa && !(await devolverEtapa(api, marcada.id, marcada.antes)))
        ui.toast("A consulta foi desfeita, mas o cartão não voltou para a etapa em que estava. Confira no CRM.", { tipo: "info" });
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
      // a consulta estava numa etapa que não é «Agendada» (e por isso o cartão não saiu dela ao desmarcar)? marcar de volta o levaria para «Agendada»:
      // lê a etapa de agora para devolvê-lo a ela depois
      let antes = null;
      if (!r.voltou_para_nova && c.marco !== "agendada") {
        try { const d = await api.rpcC("nx_negocio_ver", { p_id: c.negocio_id }); if (d && d.negocio && d.negocio.estagio_id) antes = { estagio_id: d.negocio.estagio_id, ordem: d.negocio.ordem ?? null }; }
        catch { /* sem a ficha: a consulta volta, a etapa fica a que o servidor escolher */ }
      }
      // marca de volta como ENCAIXE: devolver a consulta que já existia não passa pela regra de antecedência (desfazer às 14h a consulta das 15h era recusado)
      const volta = erroResposta(await api.rpcC("nx_agenda_marcar", { p_negocio: c.negocio_id, p_inicio: c.inicio, p_servico: c.servico || null, p_encaixe: true }));
      if (antes && volta && volta.etapa) await devolverEtapa(api, c.negocio_id, antes);
      if (aoMudar) try { aoMudar(null); } catch (e) { console.error(e); }
    },
  });
  return r;
}

/** Limpeza da tela aberta (relógio da linha de «agora», ouvinte de largura, comando da paleta). O shell chama desmontar() ao sair da rota. */
let limpezaAtual = null;
export function desmontar() {
  const limpar = limpezaAtual;
  limpezaAtual = null;
  if (limpar) try { limpar(); } catch (e) { console.error(e); }
}

export async function montar(ctx) {
  desmontar();          // montar de novo sem ter saído (troca de empresa, recarga da rota): a tela anterior não fica viva por trás
  const { ui, api } = ctx;
  const h = ui.h;
  ui.carregarCss("agenda");
  ctx.titulo("Agenda");

  const mq = typeof matchMedia === "function" ? matchMedia("(max-width: 760px)") : { matches: false, addEventListener() {}, removeEventListener() {} };
  let movel = mq.matches;
  const chavePreferencias = chavePreferenciasAgenda(ctx.cliente && ctx.cliente.id, ctx.sessao && ctx.sessao.conta && ctx.sessao.conta.id);
  const hojeInicial = ui.hojeSP();
  let preferencias = {};
  try { preferencias = normalizarPreferenciasAgenda(JSON.parse(localStorage.getItem(chavePreferencias) || "{}"), hojeInicial); }
  catch { preferencias = normalizarPreferenciasAgenda({}, hojeInicial); }
  let data = preferencias.data || hojeInicial;
  let modo = preferencias.modo;
  let agrupar = preferencias.agrupar;      // dia com 2+ responsáveis: uma coluna por pessoa
  let corPor = preferencias.cor;           // cor dos blocos: por serviço ou por profissional (item 39)
  let atual = null, chaveAtual = "";
  let sequencia = 0;
  let vivo = true;
  let atualizandoManual = false;
  let mensagemAtualizacao = "";
  let eixoAtual = null;
  let nomesDonos = null;
  let legendaAtivos = new Set();           // chaves destacadas pela legenda (vazio = todas à mostra)
  let proximaAtual = null;                 // a próxima consulta do período carregado (destacada na grade e no resumo)
  let seqBloco = 0;                        // ordem de entrada dos blocos (animação em escada)
  let ignorarClique = false;               // o clique que vem logo depois de soltar um arrasto não abre o detalhe
  let Lg = null;                    // crm-logica.js (hrefTel do balão da consulta): chega em paralelo, a tela não espera por ele
  logicaDe(ctx).then(m => { Lg = m; }).catch(() => { /* sem ele o telefone aparece como texto */ });
  let G = null;                     // graficos.js (números que contam): opcional, a tela não espera por ele
  import(`./graficos.js?v=${encodeURIComponent(ctx.versao)}`).then(m => { G = m; }).catch(() => { /* sem ele os números aparecem prontos */ });

  // M30: ui.cabecalho (sem a empresa em cima); os controles de data e as ações entram no lugar das ações do cabeçalho
  const controles = h("div", { class: "agenda-cab-controles" });
  const cabecalho = ui.cabecalho({ titulo: "Agenda", acoes: controles });
  cabecalho.classList.add("agenda-cab");
  const conteudo = h("div", { class: "agenda-conteudo", "aria-live": "polite" });
  ui.limpar(ctx.alvo);
  ctx.alvo.append(cabecalho, conteudo);

  function gravarPreferencias() {
    try { localStorage.setItem(chavePreferencias, JSON.stringify({ data, modo, agrupar, cor: corPor, em: ui.hojeSP() })); } catch { /* preferências não bloqueiam a Agenda */ }
  }

  /** O que o servidor precisa devolver: a semana (segunda a domingo) na semana e no celular; o dia só no desktop em «Dia»;
      o mês inteiro em «Mês» (cabe num pedido só: a RPC aceita até 31 dias). */
  function intervalo() {
    if (modo === "mes" && !movel) return { de: primeiroDoMes(data), dias: diasNoMes(data) };
    const semanal = modo === "semana" || movel;
    return { de: semanal ? segundaDe(data) : data, dias: semanal ? 7 : 1 };
  }
  const passoDeNavegacao = () => (movel ? 7 : modo === "dia" ? 1 : modo === "mes" ? 30 : 7);
  const nomeDoPasso = () => (passoDeNavegacao() === 1 ? "dia" : passoDeNavegacao() === 30 ? "mes" : "semana");

  function montarCabecalho() {
    ui.limpar(controles);
    const passo = nomeDoPasso();
    const anterior = h("button", { type: "button", class: "bt-icone", "aria-label": passo === "dia" ? "Dia anterior" : passo === "mes" ? "Mês anterior" : "Semana anterior", "aria-keyshortcuts": "[", on: { click: () => mover(-1) } }, ui.icone("seta-esq"));
    const proximo = h("button", { type: "button", class: "bt-icone", "aria-label": passo === "dia" ? "Próximo dia" : passo === "mes" ? "Próximo mês" : "Próxima semana", "aria-keyshortcuts": "]", on: { click: () => mover(1) } }, ui.icone("seta-dir"));
    const hoje = h("button", { type: "button", class: "bt bt-sec bt-p", "aria-keyshortcuts": "T", on: { click: () => { data = ui.hojeSP(); gravarPreferencias(); carregar(); } } }, "Hoje");
    const seletor = h("input", { class: "agenda-data", type: "date", value: data, "aria-label": "Escolher data" });
    seletor.addEventListener("change", () => { if (dataAgendaValida(seletor.value)) { data = seletor.value; gravarPreferencias(); carregar(); } });
    const periodo = h("div", { class: "agenda-periodo" }, anterior, seletor, proximo, hoje);
    const alternador = ui.segmentado({ opcoes: [{ valor: "dia", rotulo: "Dia" }, { valor: "semana", rotulo: "Semana" }, { valor: "mes", rotulo: "Mês" }], valor: modo, rotulo: "Visualização da agenda", classe: "agenda-abas",
      aoMudar: id => { modo = id; gravarPreferencias(); carregar(); } });
    // celular: o mês abre numa janela (a visão do dia com a faixa da semana continua sendo a tela)
    const verMes = h("button", { type: "button", class: "bt bt-sec bt-p agenda-mes-bt", on: { click: abrirMesMovel } }, ui.icone("calendario"), "Mês");
    const atualizar = h("button", { type: "button", class: "bt bt-sec bt-p agenda-atualizar", disabled: atualizandoManual, "aria-busy": String(atualizandoManual), on: { click: atualizarAgora } }, atualizandoManual ? "Atualizando…" : "Atualizar");
    const estado = h("span", { class: "agenda-atualizacao", role: "status", "aria-live": "polite" }, mensagemAtualizacao);
    const acoes = h("div", { class: "agenda-acoes" }, estado, alternador, verMes, atualizar,
      ctx.pode("atendente") ? h("button", { type: "button", class: "bt bt-prim agenda-marcar", on: { click: () => abrirAgendamento(null, { dia: movel || modo === "dia" ? data : null }) } }, ui.icone("mais"), "Marcar consulta") : null);
    controles.append(periodo, acoes);
  }

  function mover(delta) {
    data = nomeDoPasso() === "mes" ? mesISO(data, delta) : diaISO(data, delta * passoDeNavegacao());
    gravarPreferencias();
    carregar();
  }

  /** Celular: janela com o mini-calendário do mês (pedido próprio ao servidor, um por mês visitado); escolher um dia leva a ele. */
  async function abrirMesMovel() {
    let mes = primeiroDoMes(data);
    const caixa = h("div", { class: "ag-mes-caixa" });
    const pedidos = new Map();
    let fecharCom = null;
    async function pintar() {
      const meu = mes;
      const d = pedidos.get(meu);
      ui.limpar(caixa);
      caixa.appendChild(montarMiniCalendario({ h, mes: meu, consultas: d ? d.consultas : [], bloqueios: d ? d.bloqueios : [], config: d && d.config ? d.config : (atual && atual.config) || null,
        hoje: ui.hojeSP(), selecionado: data, num: ui.num, carregando: !d, compacto: true,
        aoEscolher: iso => { if (fecharCom) fecharCom(iso); }, aoMudarMes: delta => { mes = mesISO(mes, delta); pintar(); } }));
      if (d && d.erro) caixa.appendChild(h("p", { class: "agenda-erro" }, api.mensagemErro(d.erro)));
      if (d) return;
      try {
        const r = await api.rpcC("nx_agenda_dia", { p_data: meu, p_dias: diasNoMes(meu) }, { cache: true });
        pedidos.set(meu, { consultas: Array.isArray(r && r.consultas) ? r.consultas : [], bloqueios: Array.isArray(r && r.bloqueios) ? r.bloqueios : [], config: (r && r.config) || null });
      } catch (e) { pedidos.set(meu, { consultas: [], bloqueios: [], config: null, erro: e }); }
      if (vivo && mes === meu && caixa.isConnected) pintar();
    }
    pintar();
    const iso = await ui.modal({ titulo: "Escolher o dia", corpo: caixa, largura: "p", protegerTexto: false,
      // o foco vai para o dia selecionado (depois do foco inicial do modal, que cai no rodapé)
      aoAbrir: a => { fecharCom = v => a.fechar(v); setTimeout(() => { if (!vivo) return; const b = caixa.querySelector('.ag-mes-dia[tabindex="0"]'); if (b) try { b.focus({ preventScroll: true }); } catch { /* ok */ } }, 80); },
      acoes: [{ rotulo: "Fechar", tipo: "neutro", valor: null }] });
    if (!vivo || !dataAgendaValida(iso)) return;
    data = iso; gravarPreferencias(); carregar();
  }

  async function atualizarAgora() {
    if (atualizandoManual || !vivo) return;
    atualizandoManual = true; mensagemAtualizacao = "Buscando alterações…"; montarCabecalho();
    const ok = await carregar({ silencioso: true, forcar: true, manual: true });
    if (!vivo) return;
    atualizandoManual = false;
    if (ok) mensagemAtualizacao = `Atualizada às ${new Intl.DateTimeFormat("pt-BR", { timeZone: "America/Sao_Paulo", hour: "2-digit", minute: "2-digit" }).format(new Date())}.`;
    montarCabecalho();
  }

  function aoTeclaAgenda(ev) {
    const alvo = ev.target;
    const editando = alvo && (alvo.isContentEditable || /^(INPUT|TEXTAREA|SELECT)$/.test(alvo.tagName) || alvo.closest?.("[role=dialog],dialog"));
    if (editando || document.querySelector("dialog[open]")) return;
    const acao = acaoTeclaAgenda(ev);
    if (!acao) return;
    ev.preventDefault();
    if (acao === "hoje") { data = ui.hojeSP(); gravarPreferencias(); carregar(); }
    else mover(acao === "anterior" ? -1 : 1);
  }
  document.addEventListener("keydown", aoTeclaAgenda);

  async function carregar({ silencioso = false, forcar = false } = {}) {
    const iv = intervalo();
    const chave = `${iv.de}|${iv.dias}`;
    montarCabecalho();
    if (!forcar && atual && chave === chaveAtual) { desenhar(); return true; }   // mesmo período já em mãos (ex.: outro dia da mesma semana)
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
      if (!vivo || minha !== sequencia) return false;
      const igual = doCache && JSON.stringify(atual) === JSON.stringify(r);     // nada mudou desde o guardado: não refaz a grade
      atual = r || { consultas: [], bloqueios: [] };
      chaveAtual = chave;
      // leitura certa: o aviso de agenda guardada/sem conexão não pode ficar preso
      if (mensagemAtualizacao && !mensagemAtualizacao.startsWith("Atualizada às")) { mensagemAtualizacao = ""; montarCabecalho(); }
      if (!igual) desenhar();
      return true;
    } catch (e) {
      if (!vivo || minha !== sequencia) return false;
      if (silencioso && atual && chaveAtual === chave) {
        // «sem conexão» só com evidência de rede: comCache vem em QUALQUER erro quando havia cópia guardada (até HTTP 400)
        const semRede = typeof navigator !== "undefined" && navigator.onLine === false;
        mensagemAtualizacao = semRede ? "Sem conexão · mostrando a última agenda guardada." : "Não foi possível atualizar · a agenda exibida foi mantida.";
        montarCabecalho();
        return false;
      }
      if (e && e.comCache) return false;
      atual = null; chaveAtual = "";
      ui.limpar(conteudo);
      conteudo.appendChild(ui.erroCartao(e, () => carregar({ forcar: true })));
      return false;
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
    seqBloco = 0;
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
    const nota = h("p", { class: "agenda-fuso" }, "Horários no fuso de São Paulo.");
    proximaAtual = proximaConsulta(consultas);

    // mês (desktop): mini-calendário com densidade no lugar da grade; tocar um dia abre o dia
    if (!movel && modo === "mes") {
      eixoAtual = null;
      conteudo.append(montarMiniCalendario({ h, mes: primeiroDoMes(data), consultas, bloqueios, config, hoje, selecionado: data, num: ui.num,
        aoEscolher: iso => { data = iso; modo = "dia"; gravarPreferencias(); carregar(); }, aoMudarMes: delta => mover(delta) }), nota);
      return;
    }

    const eixo = eixoDaGrade({ dias: carregados, consultas, config });
    eixoAtual = eixo;

    // o que a tela mostra agora
    let mostrados, titulo;
    if (movel) { mostrados = [data]; titulo = nomeDia(data, true); }
    else if (modo === "dia") { mostrados = [data]; titulo = nomeDia(data, true); }
    else { mostrados = carregados; titulo = `${ui.dataCurtaBR(carregados[0])} — ${ui.dataCurtaBR(carregados[6])}`; }
    const visiveis = consultas.filter(c => { const p = c.inicio && partesSP(c.inicio); return p && mostrados.includes(p.dia); });
    const nDentro = visiveis.length;
    const nBloq = bloqueios.filter(b => mostrados.some(d => bloqueiosDoDia([b], d).length)).length;
    const donos = new Set(consultasDoDia(consultas, data).map(c => c.dono_id || "sem"));
    const porDono = !movel && modo === "dia" && donos.size >= 2;
    const temResponsaveis = consultas.some(c => c.dono_id);
    if (temResponsaveis && !nomesDonos) carregarNomes().then(() => { if (vivo && atual) desenhar(); });   // os nomes chegam uma vez; a legenda redesenha com eles
    const ocup = ocupacaoDoPeriodo(visiveis, mostrados, config);

    // próxima consulta: do período carregado (pode ser em outro dia da semana); tocar leva até ela. Sem próxima, o texto diz o período que de fato
    // foi olhado — a semana carregada (semana e celular) ou o dia («Dia» no desktop) —, sem prometer nada além dele (a de amanhã pode estar na semana seguinte)
    const proxima = proximaAtual;
    const umDia = iv.dias === 1;
    const chipProxima = proxima
      ? h("button", { type: "button", class: "agenda-proxima", on: { click: () => irParaConsulta(proxima) } },
        h("span", { class: "agenda-proxima-rot" }, "Próxima"), h("b", null, proxima.nome || proxima.titulo || "Consulta"), h("span", { class: "dado agenda-proxima-quando" }, rotuloProxima(proxima, Date.now(), hoje)))
      : h("span", { class: "agenda-proxima agenda-proxima-vazia narr" }, consultas.length
        ? `Nenhuma consulta por vir ${umDia ? "neste dia" : "nesta semana"}.`
        : `${umDia ? "Dia livre" : "Semana livre"} — nenhuma consulta marcada.`);

    const resumo = h("section", { class: "agenda-resumo", "aria-label": "Resumo do período" },
      h("div", { class: "agenda-resumo-data" },
        h("b", null, titulo), legendaFonte ? h("small", null, legendaFonte) : null),
      porDono ? ui.segmentado({ opcoes: [{ valor: "juntos", rotulo: "Juntos" }, { valor: "responsavel", rotulo: "Por responsável" }], valor: agrupar, tipo: "filtro", rotulo: "Agrupar a agenda do dia",
        aoMudar: v => { agrupar = v; gravarPreferencias(); desenhar(); } }) : null,
      h("div", { class: "agenda-resumo-num" },
        h("span", null, h("b", { class: "dado", dataset: { valor: String(nDentro) } }, ui.num(nDentro)), ` ${nDentro === 1 ? "consulta" : "consultas"}`),
        h("span", null, h("b", { class: "dado", dataset: { valor: String(nBloq) } }, ui.num(nBloq)), ` ${nBloq === 1 ? "bloqueio" : "bloqueios"}`),
        ocup === null ? null : h("span", { class: "agenda-resumo-ocup", title: "Horas marcadas sobre o expediente dos dias mostrados" },
          anelOcupacao(h, { pct: ocup }, { tamanho: 22 }), h("b", { class: "dado" }, `${Math.round(ocup * 100)}%`), " ocupado")),
      chipProxima);

    // legenda das cores: por serviço ou por profissional (a troca só aparece quando há responsáveis nas consultas)
    const itensLegenda = legendaDe(visiveis, { por: corPor, nomes: nomesDonos || {} });
    const legenda = itensLegenda.length >= 2 || legendaAtivos.size ? h("div", { class: "ag-legenda-linha" },
      temResponsaveis ? ui.segmentado({ opcoes: [{ valor: "servico", rotulo: "Por serviço" }, { valor: "profissional", rotulo: "Por profissional" }], valor: corPor, tipo: "filtro", rotulo: "Cor dos blocos", classe: "ag-legenda-por",
        aoMudar: v => { corPor = v; legendaAtivos = new Set(); gravarPreferencias(); desenhar(); } }) : null,
      montarLegenda({ h, itens: itensLegenda, ativos: legendaAtivos, num: ui.num, aoAlternar: it => { legendaAtivos = it ? alternarLegenda(legendaAtivos, it) : new Set(); desenhar(); } })) : null;

    const painel = () => montarPainelDia({ h, iso: data, consultas, config, hoje, horaBR: ui.horaBR, num: ui.num, pode: ctx.pode("atendente"),
      aoAbrir: (c, bt) => abrirDetalhe(c, bt), aoMarcar: iso => abrirAgendamento(null, { dia: iso }) });

    if (movel) {
      const r = resumoDoDia(consultas, data, config);
      const lista = h("details", { class: "ag-painel-det", open: r.total > 0 }, h("summary", { class: "ag-painel-sum" }, h("span", null, "Lista do dia"),
        h("span", { class: "ag-painel-sum-n dado" }, r.total ? `${ui.num(r.total)} ${r.total === 1 ? "consulta" : "consultas"}${r.faltas ? ` · ${ui.num(r.faltas)} ${r.faltas === 1 ? "falta" : "faltas"}` : ""}` : "vazio")), painel());
      conteudo.append(...[resumo, legenda, faixaDeDias(carregados, consultas, hoje, config), visaoDoDiaMovel(data, consultas, bloqueios, config, eixo, hoje), lista, nota].filter(Boolean));
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
      const grade = montarGrade(colunas, eixo, config, { modoDia: modo === "dia" });
      // «Dia»: a grade e, ao lado, o painel do dia (consultas, concluídas, faltas, encaixes e a lista)
      conteudo.append(...[resumo, legenda, modo === "dia" ? h("div", { class: "ag-dia-layout" }, grade, painel()) : grade, nota].filter(Boolean));
    }
    posicionarAgora();
    animarNumeros();
    if (movel) focarNoDia();
  }

  /** Os números do resumo e do painel contam até o valor (graficos.contar) na 1ª vez que aparecem e acendem (graficos.destacar) quando mudam;
      redesenhar sem mudar o número (chip da legenda, «Por serviço/Por profissional», os nomes chegando) não reconta — animação só explica mudança.
      Cada número é lembrado pela posição («r0» consultas, «r1» bloqueios; «k0»… os do painel). Sem graficos.js, aparecem prontos. */
  const numerosVistos = new Map();
  function animarNumeros() {
    const els = [...conteudo.querySelectorAll(".agenda-resumo-num b[data-valor]")].map((el, i) => [`r${i}`, el])
      .concat([...conteudo.querySelectorAll(".ag-kpi b[data-valor]")].map((el, i) => [`k${i}`, el]));
    for (const [chave, el] of els) {
      const v = Number(el.dataset.valor);
      if (!Number.isFinite(v)) continue;
      const antes = numerosVistos.get(chave);
      numerosVistos.set(chave, v);
      if (antes === v || !G) continue;
      try {
        if (antes === undefined) { if (v > 0 && typeof G.contar === "function") G.contar(el, v, n => ui.num(Math.round(n))); }
        else if (typeof G.destacar === "function") G.destacar(el);
      } catch { /* o número já está escrito */ }
    }
  }

  /** Leva a vista até a consulta (troca o dia no celular ou em «Dia», se preciso) e põe o foco no bloco. */
  function irParaConsulta(c) {
    const p = partesSP(c.inicio);
    if (!p) return;
    if (p.dia !== data && (movel || modo === "dia")) { data = p.dia; gravarPreferencias(); montarCabecalho(); desenhar(); }
    const alvo = [...conteudo.querySelectorAll(".ag-item.ag-proxima .ag-bloco")][0] || conteudo.querySelector(".ag-item .ag-bloco");
    if (!alvo) return;
    try { alvo.scrollIntoView({ block: "center", behavior: ui.comportamentoRolagem() }); } catch { /* ok */ }
    try { alvo.focus({ preventScroll: true }); } catch { alvo.focus(); }
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
  function faixaDeDias(dias, consultas, hoje, config = null) {
    const el = h("div", { class: "ag-faixa", role: "tablist", "aria-label": "Dias da semana" });
    for (const iso of dias) {
      const oc = ocupacaoDoDia(consultas, iso, config);   // anel de ocupação atrás do número do dia (item 40)
      const n = oc.n, txtOc = textoOcupacao(oc);
      const sel = iso === data;
      el.appendChild(h("button", { type: "button", role: "tab", class: ["ag-faixa-d", sel && "sel", iso === hoje && "hoje", oc.fechado && "fechado"], "aria-selected": String(sel), tabindex: sel ? "0" : "-1",
        "aria-label": `${nomeDia(iso, true)}, ${n} ${n === 1 ? "consulta" : "consultas"}${txtOc ? `, ${txtOc}` : ""}`, dataset: { iso },
        on: { click: () => { data = iso; gravarPreferencias(); montarCabecalho(); desenhar(); } } },
        h("span", { class: "ag-faixa-sem" }, semanaCurta(iso)),
        h("span", { class: "ag-faixa-disco" }, anelOcupacao(h, oc, { tamanho: 36 }), h("b", { class: "dado ag-faixa-num" }, diaDoMes(iso))),
        h("i", { class: ["ag-faixa-n", n && "tem"], "aria-hidden": "true" }, n ? String(n) : "")));
    }
    const abas = [...el.querySelectorAll('[role="tab"]')];
    for (const [i, botao] of abas.entries()) botao.addEventListener("keydown", ev => {
      const alvo = indiceAbaAgendaTecla(ev.key, i, abas.length);
      if (alvo == null) return;
      ev.preventDefault();
      abas[alvo].click();   // redesenha a faixa inteira: o foco tem de ir para a aba NOVA, senão cai no body
      const nova = conteudo.querySelector('.ag-faixa [role="tab"][aria-selected="true"]');
      if (nova) { try { nova.focus({ preventScroll: true }); } catch { nova.focus(); } }
    });
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
    const cab = h("div", { class: "ag-topo" }, h("span", { class: "ag-canto", "aria-hidden": "true" }), colunas.map(c => cabecalhoDaColuna(c, ehMovel, modoDia, config)));
    const regua = h("div", { class: "ag-regua", "aria-hidden": "true" },
      Array.from({ length: horas }, (_, i) => h("span", { class: "ag-hora-rot dado", style: { "--i": String(i) } }, `${String(eixo.ini + i).padStart(2, "0")}h`)),
      colunas.some(c => c.hoje) ? h("span", { class: "ag-agora-rot dado", hidden: true }) : null);   // o rótulo da linha de «agora» (item 42) fica na régua
    const corpo = h("div", { class: "ag-corpo" }, regua, colunas.map(c => colunaDoDia(c, eixo, config, passo)));
    return h("div", { class: ["ag-grade", ehMovel && "ag-movel"], style: { "--horas": String(horas), "--colunas": String(colunas.length) }, role: "group", "aria-label": ehMovel ? "Agenda do dia" : "Agenda" },
      ehMovel ? null : cab, corpo);
  }

  function cabecalhoDaColuna(c, ehMovel, modoDia, config) {
    if (c.dono !== undefined) {
      return h("div", { class: ["ag-dia-cab", "ag-dono-cab"] }, h("b", { class: "ag-dono-nome", dataset: { dono: c.dono } }, c.titulo),
        h("span", { class: "ag-dia-total", title: `${c.consultas.length} consultas` }, ui.num(c.consultas.length)));
    }
    const ehHoje = c.hoje;
    const oc = ocupacaoDoDia(c.consultas, c.iso, config), txtOc = textoOcupacao(oc);
    // na semana, a data é um botão que abre o dia; em «Dia» é só texto
    const dataTxt = [h("span", { class: "ag-dia-sem" }, modoDia ? nomeDia(c.iso, true).replace(/,.*$/, "").replace(/\.$/, "") : semanaCurta(c.iso)), h("b", { class: "ag-dia-num dado" }, diaDoMes(c.iso))];
    const dataEl = modoDia ? dataTxt : h("button", { type: "button", class: "ag-dia-abrir", "aria-label": `Abrir o dia ${nomeDia(c.iso, true)}`, title: "Ver só este dia",
      on: { click: () => { data = c.iso; modo = "dia"; gravarPreferencias(); carregar(); } } }, dataTxt);
    return h("div", { class: ["ag-dia-cab", ehHoje && "hoje"], "aria-current": ehHoje ? "date" : null },
      dataEl,
      h("span", { class: "ag-dia-total", title: `${c.consultas.length} ${c.consultas.length === 1 ? "consulta" : "consultas"}` }, c.consultas.length ? ui.num(c.consultas.length) : ""),
      ctx.pode("atendente") ? h("button", { type: "button", class: "bt-icone ag-dia-mais", "aria-label": `Marcar consulta em ${nomeDia(c.iso, true)}`, title: "Marcar consulta neste dia",
        on: { click: () => abrirAgendamento(null, { dia: c.iso }) } }, ui.icone("mais")) : null,
      // barra de ocupação do dia (item 40): largura = fração do expediente marcada; a cor sobe com o nível
      txtOc ? h("i", { class: ["ag-dia-ocup", `ag-ocup-${nivelOcupacao(oc.pct)}`], style: { "--p": oc.pct === null ? "0" : oc.pct.toFixed(3) }, title: txtOc, "aria-hidden": "true" }) : null,
      txtOc ? h("span", { class: "sr-only" }, txtOc) : null);
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
    for (const b of colocarEmFaixas(blocos)) col.appendChild(blocoDaConsulta(b, { iso: c.iso, chave: c.chave, dono: c.dono, passo }));
    // «agora»
    if (c.hoje) col.appendChild(h("li", { class: "ag-agora", "aria-hidden": "true", hidden: true }));
    if (ctx.pode("atendente")) col.addEventListener("click", ev => aoClicarNoVazio(ev, col, c.iso, eixo, config, passo));
    return col;
  }

  function blocoDaConsulta(b, col) {
    const c = b.consulta;
    const nome = c.nome || c.titulo || "Consulta sem nome";
    const inicio = ui.horaBR(c.inicio), fim = c.fim ? ui.horaBR(c.fim) : "";
    const curto = b.altura <= 0.6;          // até ~35 min: uma linha só (hora + nome); acima, o procedimento vem numa 2ª linha
    const k = corDaConsulta(c, corPor, nomesDonos || {});
    const cor = k.cor;
    const feita = c.status === "ganho";
    const ehProxima = !!proximaAtual && proximaAtual === c;
    const arrastavel = podeArrastar({ pointerType: "mouse", movel, pode: ctx.pode("atendente"), consulta: c });
    const apagado = legendaAtivos.size > 0 && !legendaAtivos.has(k.chave);
    const bt = h("button", { type: "button", class: ["ag-bloco", curto && "curto", feita && "feita", arrastavel && "ag-arrastavel"], "aria-haspopup": "dialog",
      "aria-label": `${inicio}${fim ? ` às ${fim}` : ""}, ${nome}${c.servico ? `, ${c.servico}` : ""}${feita ? ", concluída" : ""}${ehProxima ? ", próxima consulta" : ""}`,
      title: [`${inicio}${fim ? `–${fim}` : ""}`, nome, c.servico, corPor === "profissional" ? k.rotulo : null, arrastavel ? "Arraste para remarcar" : null].filter(Boolean).join(" · ") },
      h("span", { class: "ag-bloco-l1" }, h("span", { class: "ag-bloco-hora dado" }, inicio), h("b", { class: "ag-bloco-nome" }, nome)),
      c.servico ? h("span", { class: "ag-bloco-serv" }, c.servico) : null,
      feita ? ui.icone("check") : null);
    bt.addEventListener("click", ev => {
      ev.stopPropagation();
      if (ignorarClique) { ignorarClique = false; return; }   // o clique que fecha um arrasto não abre o detalhe
      abrirDetalhe(c, bt);
    });
    const item = h("li", { class: ["ag-item", ehProxima && "ag-proxima", apagado && "apagado"], dataset: { cols: b.cols, chave: k.chave },
      style: { "--t": String(b.topo), "--d": String(b.altura), "--col": String(b.col), "--cols": String(b.cols), "--cor-bloco": `var(--pal-${cor})`, "--i": String(seqBloco++) } },
      ehProxima ? h("span", { class: "ag-proxima-selo", "aria-hidden": "true" }, "Próxima") : null, bt);
    if (arrastavel) bt.addEventListener("pointerdown", ev => iniciarArrasto(ev, bt, item, c, col));
    return item;
  }

  /* ---------- arrastar para remarcar (item 41): só desktop e só com o mouse; soltar abre a confirmação com o horário novo; o servidor valida ---------- */
  let arrasto = null;
  function iniciarArrasto(ev, bt, item, c, col) {
    if (ev.button !== 0 || arrasto || !podeArrastar({ pointerType: ev.pointerType, movel, pode: ctx.pode("atendente"), consulta: c })) return;
    const dur = Number(atual && atual.config && atual.config.duracao_min) || 30;
    const p0 = minutosDaConsulta(c, dur);
    if (!p0 || !eixoAtual) return;
    const r = item.getBoundingClientRect();
    const hHora = r.height / Math.max(0.25, Number(item.style.getPropertyValue("--d")) || 0.5);   // px por hora, medido no próprio bloco
    arrasto = { bt, item, c, col, id: ev.pointerId, x0: ev.clientX, y0: ev.clientY, moveu: false, destino: null, fantasma: null, rotulo: null,
      duracao: p0.fim - p0.ini, pegouEm: hHora > 0 ? ((ev.clientY - r.top) / hHora) * 60 : 0 };
    try { bt.setPointerCapture(ev.pointerId); } catch { /* sem captura o arrasto ainda funciona dentro do bloco */ }
    bt.addEventListener("pointermove", moverArrasto);
    bt.addEventListener("pointerup", soltarArrasto);
    bt.addEventListener("pointercancel", cancelarArrasto);
    document.addEventListener("keydown", teclaArrasto, true);
  }
  function moverArrasto(ev) {
    const a = arrasto;
    if (!a || ev.pointerId !== a.id) return;
    if (!a.moveu) {
      if (Math.hypot(ev.clientX - a.x0, ev.clientY - a.y0) < 6) return;   // um tremor do mouse não é arrasto
      a.moveu = true;
      conteudo.classList.add("ag-arrastando");
      a.item.classList.add("ag-origem");
    }
    ev.preventDefault();
    const sob = document.elementFromPoint(ev.clientX, ev.clientY);
    const colEl = sob && sob.closest ? sob.closest(".ag-col") : null;
    // por responsável: só dentro da mesma coluna (trocar a pessoa não é remarcar)
    if (!colEl || (a.col.dono !== undefined && colEl.dataset.chave !== a.col.chave)) { a.destino = null; mostrarFantasma(null); return; }
    const r = colEl.getBoundingClientRect();
    if (!r.height) return;
    const alvo = alvoDoArrasto({ fracao: (ev.clientY - r.top) / r.height, eixo: eixoAtual, passo: a.col.passo, duracao: a.duracao, pegouEm: a.pegouEm });
    a.destino = { iso: colEl.dataset.iso, hora: alvo.hora, min: alvo.min, col: colEl };
    mostrarFantasma(a.destino);
  }
  function destinoValido(d) {
    if (Date.parse(`${d.iso}T${d.hora}:00-03:00`) < Date.now()) return "passou";
    if (horarioAberto((atual && atual.config) || {}, d.iso, d.min) === false) return "fechado";
    return null;
  }
  function mostrarFantasma(d) {
    const a = arrasto;
    if (!a) return;
    if (!d) { if (a.fantasma) a.fantasma.hidden = true; return; }
    if (!a.fantasma) {
      a.rotulo = h("span", { class: "ag-bloco-hora dado" });
      a.fantasma = h("li", { class: "ag-item ag-fantasma", "aria-hidden": "true", style: { "--cols": "1", "--col": "0", "--cor-bloco": a.item.style.getPropertyValue("--cor-bloco") } },
        h("span", { class: "ag-bloco" }, h("span", { class: "ag-bloco-l1" }, a.rotulo, h("b", { class: "ag-bloco-nome" }, a.c.nome || a.c.titulo || "Consulta"))));
    }
    if (a.fantasma.parentNode !== d.col) d.col.appendChild(a.fantasma);
    a.fantasma.hidden = false;
    a.fantasma.style.setProperty("--t", String(d.min / 60 - eixoAtual.ini));
    a.fantasma.style.setProperty("--d", String(a.duracao / 60));
    a.rotulo.textContent = `${d.hora}–${horaTxt(d.min + a.duracao)}`;
    a.fantasma.classList.toggle("ag-fantasma-ruim", !!destinoValido(d));
  }
  function limparArrasto() {
    const a = arrasto;
    arrasto = null;
    if (!a) return;
    a.bt.removeEventListener("pointermove", moverArrasto);
    a.bt.removeEventListener("pointerup", soltarArrasto);
    a.bt.removeEventListener("pointercancel", cancelarArrasto);
    document.removeEventListener("keydown", teclaArrasto, true);
    try { a.bt.releasePointerCapture(a.id); } catch { /* ok */ }
    if (a.fantasma) a.fantasma.remove();
    a.item.classList.remove("ag-origem");
    conteudo.classList.remove("ag-arrastando");
    return a;
  }
  function teclaArrasto(ev) { if (ev.key === "Escape" && arrasto) { ev.preventDefault(); ev.stopPropagation(); cancelarArrasto(); } }
  function cancelarArrasto() {
    const a = limparArrasto();
    if (a && a.moveu) { engolirCliqueAoSoltar(); ui.toast("Remarcação cancelada.", { tipo: "info", ms: 2500 }); }
  }
  /* Esc no meio do arrasto: o botão do mouse continua apertado e, ao soltá-lo, o navegador manda o clique ao ancestral comum (a coluna), que
     abriria «Marcar consulta» onde o mouse parou. Engole SÓ esse clique (o que vem logo depois do próximo pointerup, na mesma tarefa);
     um aperto novo desarma (soltou fora da janela e não houve pointerup). */
  let desarmarEngolir = null;
  function engolirCliqueAoSoltar() {
    if (desarmarEngolir) desarmarEngolir();
    let espera = 0;
    const engolir = ev => { ev.stopPropagation(); ev.preventDefault(); };
    const aoSoltar = () => { clearTimeout(espera); espera = setTimeout(desarmar, 0); };
    function desarmar() {
      clearTimeout(espera);
      document.removeEventListener("click", engolir, true);
      document.removeEventListener("pointerup", aoSoltar, true);
      document.removeEventListener("pointerdown", desarmar, true);
      if (desarmarEngolir === desarmar) desarmarEngolir = null;
    }
    document.addEventListener("click", engolir, true);
    document.addEventListener("pointerup", aoSoltar, true);
    document.addEventListener("pointerdown", desarmar, true);
    desarmarEngolir = desarmar;
  }
  function soltarArrasto(ev) {
    const a = arrasto;
    if (!a || ev.pointerId !== a.id) return;
    limparArrasto();
    if (!a.moveu) return;
    ignorarClique = true; setTimeout(() => { ignorarClique = false; }, 0);
    const d = a.destino;
    if (!d || !destinoMudou(a.c, d.iso, d.hora)) return;
    const motivo = destinoValido(d);
    if (motivo === "passou") { ui.toast("Esse horário já passou.", { tipo: "info" }); return; }
    if (motivo === "fechado") { ui.toast("Fora do horário de atendimento da agenda.", { tipo: "info" }); return; }
    confirmarRemarcacao(a.c, d);
  }
  /** Confirmação «De → Para»; confirmar grava com p_req (nx_agenda_marcar, como a janela) e oferece Desfazer (volta como encaixe). */
  async function confirmarRemarcacao(c, d) {
    const nome = c.nome || c.titulo || "Consulta";
    const hoje = ui.hojeSP();
    const de = partesSP(c.inicio);
    if (!Lg) try { Lg = await logicaDe(ctx); } catch { ui.toast("Não foi possível abrir a remarcação. Tente de novo.", { tipo: "erro" }); return; }
    const req = Lg.novaReq();        // a mesma intenção em todas as tentativas desta janela: o servidor não marca duas vezes
    const inicioNovo = new Date(`${d.iso}T${d.hora}:00-03:00`).toISOString();
    const corpo = h("div", { class: "ag-remarcar" },
      h("p", { class: "ag-remarcar-nome" }, h("b", null, nome), c.servico ? h("small", null, ` · ${c.servico}`) : null),
      h("div", { class: "ag-remarcar-de-para" },
        h("span", { class: "ag-remarcar-de" }, h("small", null, "De"), h("b", { class: "dado" }, de ? `${rotuloDoDia(de.dia, hoje)} ${horaTxt(de.min)}` : ui.dataHoraBR(c.inicio))),
        h("span", { class: "ag-remarcar-seta", "aria-hidden": "true" }, "→"),
        h("span", { class: "ag-remarcar-para" }, h("small", null, "Para"), h("b", { class: "dado" }, `${rotuloDoDia(d.iso, hoje)} ${d.hora}`))),
      h("p", { class: "campo-ajuda" }, "A disponibilidade é validada de novo ao salvar."));
    const statusEl = h("p", { class: "crm-status", role: "status", "aria-live": "polite", hidden: true });
    corpo.appendChild(statusEl);
    // remarcar leva o cartão para a etapa «Agendada» (o servidor faz isso a cada marcar): lê a etapa de AGORA enquanto a pessoa confirma,
    // para o Desfazer devolvê-lo a ela — como a janela de marcar. Já em «Agendada»: nada a ler
    let antes = null;
    const fichaP = c.marco === "agendada" ? null : lerEtapa(api, c.negocio_id).then(x => { antes = x; });
    const r = await ui.modal({ titulo: "Remarcar consulta?", corpo, largura: "p", protegerTexto: false, acoes: [
      { rotulo: "Cancelar", tipo: "neutro", valor: false },
      { rotulo: "Remarcar", tipo: "primario", fn: async m => {
        try {
          // a etapa de antes ainda está chegando? espera um instante (no máximo 1,5 s): depois de remarcar o cartão já estará em «Agendada»
          if (fichaP && !antes) await Promise.race([fichaP, new Promise(res => setTimeout(res, 1500))]);
          const { resultado } = await Lg.escreverComReq(api, "nx_agenda_marcar", { p_negocio: c.negocio_id, p_inicio: inicioNovo, p_servico: c.servico || null },
            { req, aoStatus: t => { statusEl.textContent = t; statusEl.hidden = false; } });
          statusEl.hidden = true;
          return erroResposta(resultado);
        } catch (e) {
          statusEl.hidden = true;
          const codigo = e && e.codigo;
          m.erro(e && e.ambigua ? "Não foi possível confirmar se foi salvo. Toque em «Remarcar» de novo: é seguro, não marca duas vezes."
            : codigo === "horario_ocupado" ? "Esse horário está ocupado. Arraste para outro."
              : api.mensagemErro(e));
          return false;
        }
      } },
    ] });
    if (!(r && r.ok)) return;
    const anterior = c.inicio, servico = c.servico || null, negocioId = c.negocio_id, etapaAntes = antes;
    recarregar();
    ui.acaoComDesfazer({
      texto: `Remarcada para ${rotuloDoDia(d.iso, hoje)} às ${d.hora}`,
      reverter: async () => {
        await voltarAoHorario(api, negocioId, anterior, servico);
        // remarcar levou o cartão para «Agendada» (resposta com «etapa»): volta para a etapa em que estava, com a mesma rotina da janela
        if (r.etapa && !(await devolverEtapa(api, negocioId, etapaAntes)))
          ui.toast("A consulta voltou ao horário, mas o cartão não voltou para a etapa em que estava. Confira no CRM.", { tipo: "info" });
        recarregar();
      },
    });
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
    const fora = t < 0 || t > eixoAtual.fim - eixoAtual.ini;
    for (const el of conteudo.querySelectorAll(".ag-agora")) {
      el.hidden = fora;
      el.style.setProperty("--t", String(t));
    }
    // o rótulo com a hora de agora acompanha a linha (item 42)
    for (const el of conteudo.querySelectorAll(".ag-agora-rot")) {
      el.hidden = fora;
      el.style.setProperty("--t", String(t));
      el.textContent = horaTxt(n.min);
    }
  }
  const relogio = setInterval(posicionarAgora, 60_000);

  /** Detalhe da consulta ao tocar no bloco: quem, quando, telefone (toque para ligar), origem e as ações (Abrir conversa, Abrir negócio, Remarcar, Desmarcar). */
  function abrirDetalhe(c, ancora) {
    const nome = c.nome || c.titulo || "Consulta sem nome";
    const p = partesSP(c.inicio);
    const hrefTel = c.telefone && Lg ? Lg.hrefTel(c.telefone) : null;
    const comConversas = !!(c.contato_id && ctx.temModulo && ctx.temModulo("conversas"));
    const acoes = h("div", { class: "ag-det-acoes" },
      comConversas ? h("button", { type: "button", class: "bt bt-sec bt-p", on: { click: () => { pop.fechar(); ctx.navegar(`#/conversas?contato=${encodeURIComponent(c.contato_id)}`); } } }, ui.icone("whatsapp"), "Abrir conversa") : null,
      h("button", { type: "button", class: "bt bt-sec bt-p", on: { click: () => { pop.fechar(); ctx.navegar(`#/crm/negocio/${encodeURIComponent(c.negocio_id)}`); } } }, "Abrir negócio"),
      ctx.pode("atendente") ? h("button", { type: "button", class: "bt bt-sec bt-p", on: { click: () => { pop.fechar(); abrirAgendamento(c); } } }, "Remarcar") : null,
      ctx.pode("atendente") ? h("button", { type: "button", class: "bt bt-contorno-perigo bt-p", on: { click: () => { pop.fechar(); desmarcar(c); } } }, "Desmarcar") : null);
    const corpo = h("div", { class: "ag-det" },
      h("b", { class: "ag-det-nome" }, nome),
      h("span", { class: "ag-det-quando dado" }, `${p ? nomeDia(p.dia) : ""} · ${ui.horaBR(c.inicio)}${c.fim ? `–${ui.horaBR(c.fim)}` : ""}`),
      c.servico ? h("span", null, c.servico) : null,
      c.telefone ? (hrefTel
        ? h("a", { class: "dado ag-det-tel", href: hrefTel, "aria-label": `Ligar para ${nome}, ${ui.telBR(c.telefone)}` }, ui.icone("telefone"), ui.telBR(c.telefone))
        : h("span", { class: "dado" }, ui.telBR(c.telefone))) : null,
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

  // a limpeza fica guardada no módulo ANTES de qualquer espera: se a pessoa sair da Agenda com a 1ª carga em andamento, o desmontar() já a encontra
  const limpar = () => {
    vivo = false; sequencia++;
    limparArrasto();
    document.removeEventListener("keydown", aoTeclaAgenda);
    if (desarmarEngolir) desarmarEngolir();
    if (typeof desregistrar === "function") try { desregistrar(); } catch { /* ok */ }
    clearInterval(relogio);
    if (mq.removeEventListener) mq.removeEventListener("change", aoMudarLargura);
  };
  limpezaAtual = limpar;
  montarCabecalho();
  await carregar();
  return limpar;
}
