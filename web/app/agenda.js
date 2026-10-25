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
   Plano 100 (E): presença «Compareceu / Faltou» (nx_agenda_presenca,
   com Desfazer), encaixe e dono_nome do servidor, a próxima consulta
   fora do período (uma leitura de 7 dias), «Lembrar» que deixa o texto
   pronto na conversa (sem enviar) e a legenda por profissional com
   avatar (testes/plano100-agenda.teste.mjs).
   ============================================================ */

const FUSO = "America/Sao_Paulo";
const ORIGENS = {
  anuncio: "Anúncio", whatsapp: "WhatsApp", indicacao: "Indicação",
  organico: "Orgânico", manual: "Manual", site: "Site", importacao: "Importação",
  formulario: "Formulário",   // plano 1000b · CB-190: a lateral da central já tinha (cv-lateral.js); aqui caía em «Origem não informada»
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
    modo: ["dia", "semana", "mes", "lista"].includes(v.modo) ? v.modo : "semana",     // CA-269: «lista» (os próximos 7 dias em ordem)
    agrupar: ["juntos", "responsavel"].includes(v.agrupar) ? v.agrupar : "responsavel",
    cor: ["servico", "profissional"].includes(v.cor) ? v.cor : "servico",      // critério da cor dos blocos (plano 50, item 39)
  };
}
/** Plano 1000: as preferências novas, guardadas na mesma chave (CA-187 filtro por profissional; CA-186 dias fechados). */
export function normalizarExtrasAgenda(valor) {
  const v = valor && typeof valor === "object" && !Array.isArray(valor) ? valor : {};
  return {
    prof: typeof v.prof === "string" && v.prof && v.prof.length <= 80 ? v.prof : "todos",   // «todos», «eu» ou o id de um profissional
    fechados: v.fechados === "mostrar" ? "mostrar" : "ocultar",                              // dias fechados sem consulta somem da semana
    atalhos: v.atalhos === "desligados" ? "desligados" : "ligados",                         // plano 1000b · CB-151: atalhos de uma tecla (WCAG 2.1.4)
  };
}
/** Plano 1000b · CB-166: sem internet de verdade? O estado da rede do app (ctx.rede: Wi-Fi sem internet vira «offline» pelas falhas) vale
    primeiro; sem ele, o navigator.onLine. */
export function estaOffline(rede, nav = typeof navigator !== "undefined" ? navigator : null) {
  if (rede && typeof rede.estado === "string") return rede.estado === "offline";
  return !!nav && nav.onLine === false;
}
/** Plano 1000b · CB-160: o nome do serviço sem caixa nem acento («Avaliação» = «avaliacao»), para casar e achar repetidos. */
export const normServico = s => String(s || "").trim().normalize("NFD").replace(/[̀-ͯ]/g, "").toLocaleLowerCase("pt-BR");

/** CA-187: só as consultas do profissional escolhido («eu» = a conta de quem usa; «todos» = sem filtro). */
export function filtrarPorProfissional(consultas, filtro = "todos", eu = null) {
  const lista = Array.isArray(consultas) ? consultas : [];
  if (!filtro || filtro === "todos") return lista;
  const alvo = filtro === "eu" ? (eu ? String(eu) : null) : String(filtro);
  return alvo ? lista.filter(c => c && c.dono_id != null && String(c.dono_id) === alvo) : lista;
}
/** CA-186: dia fechado pela configuração (horário vazio) e sem nenhuma consulta → a semana pode escondê-lo. Sem configuração de horário, nunca. */
export function diaFechadoVazio(config, iso, consultas) {
  const f = faixasDoDia(config, iso);
  return Array.isArray(f) && f.length === 0 && consultasDoDia(consultas, iso).length === 0;
}
/** CA-161: a frase curta do status quando o período carrega («Semana de 12 a 18/10: 4 consultas»), no lugar de ler a grade inteira. */
export function textoAnuncioPeriodo({ modo = "semana", de, dias = 7, n = 0 } = {}) {
  if (!dataAgendaValida(de)) return "";
  const qtd = `${n} ${n === 1 ? "consulta" : "consultas"}`;
  const dm = iso => `${iso.slice(8, 10)}/${iso.slice(5, 7)}`;
  if (modo === "mes") return `${nomeDoMes(de)}: ${qtd}`;
  if (dias === 1) return `${nomeDia(de, true)}: ${qtd}`;
  const fim = diaISO(de, dias - 1);
  // plano 1000b · CB-194: a visão Lista são os 7 dias a partir de qualquer dia (não «a semana»)
  if (modo === "lista") return `De ${de.slice(5, 7) === fim.slice(5, 7) ? de.slice(8, 10) : dm(de)} a ${dm(fim)}: ${qtd}`;
  return `Semana de ${de.slice(5, 7) === fim.slice(5, 7) ? de.slice(8, 10) : dm(de)} a ${dm(fim)}: ${qtd}`;
}

/** Atalhos da Agenda sem modificador («[», «]», «T»), como o «?» do app: Alt+setas são Voltar/Avançar do navegador e não podem ser tomados.
    O chamador ignora campos editáveis e diálogos. */
export function acaoTeclaAgenda(ev) {
  if (!ev || ev.altKey || ev.ctrlKey || ev.metaKey || ev.shiftKey) return null;
  const k = String(ev.key).toLowerCase();
  if (k === "[") return "anterior";
  if (k === "]") return "proximo";
  if (k === "t") return "hoje";
  // plano 1000 · CA-259: D, S, M e L trocam a visão (Dia, Semana, Mês, Lista) sem o mouse
  if (k === "d") return "dia";
  if (k === "s") return "semana";
  if (k === "m") return "mes";
  if (k === "l") return "lista";
  if (k === "n") return "marcar";     // plano 1500c · CC-300: N abre «Marcar consulta» (a ação mais usada)
  return null;
}
export const ATALHO_MODO = Object.freeze({ dia: "D", semana: "S", mes: "M", lista: "L" });
const _horaSP = new Intl.DateTimeFormat("pt-BR", { timeZone: FUSO, hour: "2-digit", minute: "2-digit" });
/** CA-220: «Atualizada às 14:02»; passados 5 min sem releitura certa, «Atualizada às 14:02 · há 12 min». */
export function textoCarimbo(lidaEm, agora = Date.now()) {
  if (!Number.isFinite(lidaEm) || lidaEm <= 0) return "";
  const min = Math.floor((agora - lidaEm) / 60000);
  return `Atualizada às ${_horaSP.format(new Date(lidaEm))}${min >= 5 ? ` · há ${min < 60 ? `${min} min` : `${Math.floor(min / 60)} h`}` : ""}`;
}
/** CA-261: o período mostrado já contém hoje? (o «Hoje» fica neutro, com aria-current). */
export function periodoTemHoje(de, dias, hojeISO) {
  return dataAgendaValida(de) && dataAgendaValida(hojeISO) && hojeISO >= de && hojeISO < diaISO(de, Math.max(1, Number(dias) || 1));
}
/** CA-270: o número da semana ISO (segunda a domingo) de `iso`. */
export function semanaISO(iso) {
  const [a, m, d] = String(iso).split("-").map(Number);
  const t = new Date(Date.UTC(a, m - 1, d, 12));
  t.setUTCDate(t.getUTCDate() + 3 - ((t.getUTCDay() + 6) % 7));        // a quinta-feira da semana decide o ano
  const ano = t.getUTCFullYear(), jan4 = new Date(Date.UTC(ano, 0, 4, 12));
  return 1 + Math.round(((t - jan4) / 864e5 - 3 + ((jan4.getUTCDay() + 6) % 7)) / 7);
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
const _partesMemo = new Map();      // CA-218: o mesmo instante (texto ISO) não passa de novo pelo Intl a cada célula do mês
export function partesSP(valor) {
  const chave = typeof valor === "string" ? valor : null;
  if (chave !== null && _partesMemo.has(chave)) { const m = _partesMemo.get(chave); return m && { ...m }; }
  const d = valor instanceof Date ? valor : new Date(valor);
  let r = null;
  if (!Number.isNaN(d.getTime())) {
    const p = Object.fromEntries(_partes.formatToParts(d).map(x => [x.type, x.value]));
    r = { dia: `${p.year}-${p.month}-${p.day}`, min: Number(p.hour) * 60 + Number(p.minute) };
  }
  if (chave !== null) { if (_partesMemo.size > 5000) _partesMemo.clear(); _partesMemo.set(chave, r && { ...r }); }
  return r;
}
/** CA-218: as consultas agrupadas por dia de São Paulo, numa passada só (o mês reaproveita nas 42 células em vez de filtrar tudo por célula). */
export function consultasPorDia(consultas) {
  const m = new Map();
  for (const c of consultas || []) {
    const p = c && c.inicio ? partesSP(c.inicio) : null;
    if (!p) continue;
    if (!m.has(p.dia)) m.set(p.dia, []);
    m.get(p.dia).push(c);
  }
  return m;
}
const paraMin = hhmm => { const m = /^(\d{1,2}):(\d{2})/.exec(String(hhmm ?? "")); return m ? Number(m[1]) * 60 + Number(m[2]) : null; };
export const horaTxt = min => `${String(Math.floor(min / 60)).padStart(2, "0")}:${String(Math.round(min % 60)).padStart(2, "0")}`;

/* plano 1000 · CA-194: o relógio de parede do fuso vira instante pelo Intl (sem «-03:00» fixo): se o horário de verão voltar, a grade não desloca 1 h */
const _fmtFuso = new Map();
/** Minutos que o relógio de `fuso` está à frente do UTC no instante `ms` (São Paulo hoje: −180). */
export function deslocamentoFuso(ms, fuso = FUSO) {
  let f = _fmtFuso.get(fuso);
  if (!f) { f = new Intl.DateTimeFormat("en-US", { timeZone: fuso, hourCycle: "h23", year: "numeric", month: "2-digit", day: "2-digit", hour: "2-digit", minute: "2-digit", second: "2-digit" }); _fmtFuso.set(fuso, f); }
  const p = Object.fromEntries(f.formatToParts(new Date(ms)).map(x => [x.type, x.value]));
  return Math.round((Date.UTC(+p.year, +p.month - 1, +p.day, +p.hour, +p.minute, +p.second) - Math.floor(ms / 1000) * 1000) / 60000);
}
const _instantes = new Map();
/** O instante (ms) de `iso` às `hhmm` no relógio de `fuso`. Duas passadas acertam o dia em que o relógio muda. NaN se a data não vale. */
export function instanteNoFuso(iso, hhmm = "00:00", fuso = FUSO) {
  const k = `${iso}|${hhmm}|${fuso}`;
  if (_instantes.has(k)) return _instantes.get(k);
  const [a, m, d] = String(iso).split("-").map(Number), min = paraMin(hhmm);
  let t = NaN;
  if (Number.isInteger(a) && Number.isInteger(m) && Number.isInteger(d) && min !== null) {
    const parede = Date.UTC(a, m - 1, d, 0, min);
    t = parede - deslocamentoFuso(parede, fuso) * 60000;
    t = parede - deslocamentoFuso(t, fuso) * 60000;
  }
  if (_instantes.size > 2000) _instantes.clear();
  _instantes.set(k, t);
  return t;
}
/** O mesmo instante em ISO (UTC), para gravar. */
export const isoNoFuso = (iso, hhmm, fuso = FUSO) => new Date(instanteNoFuso(iso, hhmm, fuso)).toISOString();

/** Faixas de atendimento do dia em minutos [[ini, fim], …] — `null` quando a configuração não traz horário (então nada é sombreado). */
export function faixasDoDia(config, iso) {
  const h = config && config.horario;
  if (!h || typeof h !== "object") return null;
  // plano 1000b · CB-191: faixa que passa da meia-noite (22:00–02:00) vale até 24:00 no dia e de 00:00 ao fim no dia seguinte
  // (a mesma regra do horarioAberto do cv-logica); antes ela sumia e o dia parecia fechado
  const ler = d => (Array.isArray(h[String(d)]) ? h[String(d)] : []).map(f => [paraMin(f && f[0]), paraMin(f && f[1])]).filter(f => f[0] !== null && f[1] !== null && f[1] !== f[0]);
  const dds = diaDaSemana(iso);
  const doDia = ler(dds).map(([a, b]) => [a, b > a ? b : 24 * 60]);
  const daVespera = ler((dds + 6) % 7).filter(([a, b]) => b < a && b > 0).map(([, b]) => [0, b]);
  return [...daVespera, ...doDia].sort((x, y) => x[0] - y[0]);
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
export function posicaoNoDia(item, iso, eixo, duracaoPadrao = 30, fuso = FUSO) {
  const base = instanteNoFuso(iso, "00:00", fuso);
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
/** Plano 1000 · CA-267: com 4+ consultas no mesmo horário cada bloco ficava com ~30 px. Grupo com mais de `max` colunas: mostra os blocos das
    `max - 1` primeiras colunas (com `cols = max`) e um marcador «+N» na última, cobrindo o trecho das escondidas.
    blocos = saída de colocarEmFaixas → {blocos (os que aparecem, mesma ordem), mais: [{topo, altura, col, cols, consultas: [...]}]}. */
export function limitarSobrepostos(blocos, max = 3) {
  const lim = Math.max(2, Number(max) || 3);
  const ord = blocos.map((b, i) => ({ b, i, ini: b.topo, fim: b.topo + b.altura })).sort((x, y) => x.ini - y.ini || y.fim - x.fim);
  const grupos = [];
  let g = null, fimG = -Infinity;
  for (const it of ord) {
    if (!g || it.ini >= fimG - 1e-9) { g = []; grupos.push(g); fimG = -Infinity; }
    g.push(it); fimG = Math.max(fimG, it.fim);
  }
  const visiveis = new Map(), mais = [];
  for (const gr of grupos) {
    const cols = Math.max(...gr.map(x => x.b.cols || 1));
    if (cols <= lim) { for (const x of gr) visiveis.set(x.i, x.b); continue; }
    const escondidos = gr.filter(x => (x.b.col || 0) >= lim - 1);
    for (const x of gr) if ((x.b.col || 0) < lim - 1) visiveis.set(x.i, { ...x.b, cols: lim });
    const ini = Math.min(...escondidos.map(x => x.ini)), fim = Math.max(...escondidos.map(x => x.fim));
    mais.push({ topo: ini, altura: fim - ini, col: lim - 1, cols: lim, consultas: escondidos.sort((a, b) => a.ini - b.ini).map(x => x.b.consulta).filter(Boolean) });
  }
  return { blocos: [...visiveis.entries()].sort((a, b) => a[0] - b[0]).map(([, b]) => b), mais };
}
/** Índice (0–11) do token --pal-N para o procedimento: o mesmo procedimento tem sempre a mesma cor (sem acento/caixa); sem procedimento, areia. */
/* plano 1000 · CA-266: os serviços da configuração (duracoes) ganham cores pela ORDEM da lista — dois serviços cadastrados nunca dividem a cor
   (o hash % 12 juntava «Limpeza» e «Implante»); o hash fica para nomes que a configuração não conhece. 3 (areia) é «sem serviço». */
const CORES_EM_ORDEM = [0, 1, 2, 4, 5, 6, 7, 8, 9, 10, 11];
const normCor = v => String(v || "").normalize("NFD").replace(/[̀-ͯ]/g, "").trim().toLowerCase();
export function corDoProcedimento(servico, ordem = null) {
  const s = normCor(servico);
  if (!s) return 3;
  if (Array.isArray(ordem) && ordem.length) {
    const i = ordem.map(normCor).filter(Boolean).indexOf(s);
    if (i >= 0) return CORES_EM_ORDEM[i % CORES_EM_ORDEM.length];
  }
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
  const ini = instanteNoFuso(iso), fim = instanteNoFuso(diaISO(iso, 1));
  return (bloqueios || []).filter(b => b.inicio && b.fim && Date.parse(b.inicio) < fim && Date.parse(b.fim) > ini);
}
/** CA-196/CA-164: os bloqueios do dia `iso` em minutos do dia [[ini, fim], …] (o que começa antes do dia conta de 0; o que passa dele, até 24 h). */
export function cortesDeBloqueios(bloqueios, iso) {
  const ini = instanteNoFuso(iso);
  return bloqueiosDoDia(bloqueios, iso).map(b => [Math.max(0, (Date.parse(b.inicio) - ini) / 60000), Math.min(24 * 60, (Date.parse(b.fim) - ini) / 60000)])
    .filter(([a, b]) => b > a);
}
/**
 * CA-164/CA-165: o destino de um arrasto (dia `iso`, `min` de início, `duracao` em minutos) cai num bloqueio ou num horário já cheio?
 * → {motivo: "bloqueado", rotulo} | {motivo: "lotado", ocupados, capacidade} | null. `ignorar` = a própria consulta (não conta contra ela mesma).
 */
export function conflitoNoDestino({ iso, min, duracao = 30, bloqueios = [], consultas = [], config = null, ignorar = null, ocupados: ocupadosServidor = null } = {}) {
  const fim = min + Math.max(5, Number(duracao) || 30);
  for (const b of bloqueiosDoDia(bloqueios, iso)) {
    const [corte] = cortesDeBloqueios([b], iso);
    if (corte && corte[0] < fim && corte[1] > min) return { motivo: "bloqueado", rotulo: String(b.motivo || "").trim() || "Horário bloqueado" };
  }
  const dur = Number(config && config.duracao_min) || 30;
  const capacidade = Math.max(1, Number(config && config.capacidade) || 1);
  const mesma = c => ignorar && c && c.negocio_id === ignorar.negocio_id && c.inicio === ignorar.inicio;
  // plano 1500c · CC-169: «lotado» é o PICO de consultas ao mesmo tempo no trecho (09:00–09:15 + 09:15–09:30 nunca são 2 juntas), não a soma
  // CC-190: `ocupados` (trechos anônimos da clínica inteira, quando o servidor mandar) vale no lugar das consultas visíveis; a própria sai uma vez
  let base = consultasDoDia(consultas, iso).filter(c => !mesma(c));
  if (Array.isArray(ocupadosServidor)) {
    let tirou = !ignorar;
    base = ocupadosServidor.filter(o => { if (!tirou && o && o.inicio === ignorar.inicio) { tirou = true; return false; } return true; });
  }
  const ocupados = picoSimultaneo(base.map(c => minutosDaConsulta(c, dur)).filter(p => p && p.dia === iso), min, fim);
  return ocupados >= capacidade ? { motivo: "lotado", ocupados, capacidade } : null;
}
/** Plano 1500c · CC-169/CC-170: o máximo de intervalos ({ini, fim} em minutos) abertos AO MESMO TEMPO dentro de [de, ate) — varredura de
    eventos; o que termina às 09:15 não encosta no que começa às 09:15. */
export function picoSimultaneo(intervalos, de = -Infinity, ate = Infinity) {
  const ev = [];
  for (const p of intervalos || []) {
    if (!p) continue;
    const a = Math.max(Number(p.ini), de), b = Math.min(Number(p.fim), ate);
    if (b > a) ev.push([a, 1], [b, -1]);
  }
  ev.sort((x, y) => x[0] - y[0] || x[1] - y[1]);
  let n = 0, max = 0;
  for (const [, d] of ev) { n += d; if (n > max) max = n; }
  return max;
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
/** Plano 1000b · CB-175: a cor do profissional pela ORDEM dos profissionais do período (dois nunca dividem a cor, como os serviços no
    CA-266); o hash (corDoResponsavel) fica de reserva para quem não está na lista. 6 é «sem responsável». */
export function corDoProfissional(id, ordem = null) {
  const s = String(id || "").trim();
  if (!s) return 6;
  if (Array.isArray(ordem) && ordem.length) {
    const i = ordem.map(x => String(x)).filter(x => x && x !== "sem").indexOf(s);
    if (i >= 0) return CORES_PROF[i % CORES_PROF.length];
  }
  return corDoResponsavel(s);
}
const CORES_PROF = [0, 1, 2, 3, 4, 5, 7, 8, 9, 10, 11];   // sem o 6 (cinza quente = sem responsável)
/** Os profissionais em ordem estável (pelo id) — a base das cores por profissional (CB-175).
    revisão 1000b · CB-175: a ordem vem da EQUIPE (base.usuarios, `equipe` = ids) e não só de quem tem consulta no período — senão a
    cor de cada um mudava ao trocar de semana (entrou/saiu alguém da lista). Quem tem consulta e não está na equipe vai no fim. */
export function ordemProfissionais(consultas, equipe = null) {
  const limpar = l => [...new Set((l || []).filter(x => x != null && x !== "").map(String))].sort();
  const daEquipe = limpar(Array.isArray(equipe) ? equipe : []);
  const doPeriodo = limpar((consultas || []).map(c => c && c.dono_id)).filter(id => !daEquipe.includes(id));
  return [...daEquipe, ...doPeriodo];
}
/** Chave, cor e rótulo de uma consulta pelo critério de cor («servico» ou «profissional»). `nomes` = {dono_id: nome}. */
export function corDaConsulta(c, por = "servico", nomes = {}, ordem = null, ordemProf = null) {
  if (por === "profissional") {
    const id = c && c.dono_id ? String(c.dono_id) : "";
    return { chave: `p:${id || "sem"}`, cor: corDoProfissional(id, ordemProf), rotulo: id ? (nomes[id] || (typeof c.dono_nome === "string" && c.dono_nome.trim()) || "Responsável") : "Sem responsável" };
  }
  const s = String((c && c.servico) || "").trim();
  return { chave: `s:${s.normalize("NFD").replace(/[̀-ͯ]/g, "").toLowerCase()}`, cor: corDoProcedimento(s, ordem), rotulo: s || "Sem serviço" };
}
/** Legenda das cores em uso: um item por chave, do mais frequente ao menos; passando de `max`, o resto vira «Outros». */
export function legendaDe(consultas, { por = "servico", nomes = {}, max = 8, ordem = null, ordemProf = null } = {}) {
  const mapa = new Map();
  for (const c of consultas || []) {
    const k = corDaConsulta(c, por, nomes, ordem, ordemProf);
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
export function ocupacaoDoDia(consultas, iso, config, bloqueios = [], { ocupados = null } = {}) {
  const dur = Number(config && config.duracao_min) || 30;
  const itens = consultasDoDia(consultas, iso);
  const faixas = faixasDoDia(config, iso);
  const simult = Math.max(1, Number(config && config.capacidade) || 1);
  const estimada = faixas === null;
  // CA-196: o horário bloqueado (feriado, meia folga) sai da capacidade — meio dia bloqueado não mostra «10% ocupado» sobre o dia inteiro
  const cortes = [...intervalosDaConfig(config), ...cortesDeBloqueios(bloqueios, iso)];
  const abertas = estimada ? null : subtrair(faixas, cortes);
  // plano 1500c · CC-171: falta não ocupa a cadeira e o encaixe das 20h (fora do expediente) não enche o dia — cada consulta conta só o que
  // cai nas faixas abertas. CC-190: com `ocupados` (trechos sem dados pessoais que o servidor manda para o atendente restrito), a conta é da
  // clínica inteira e não só das consultas que ele enxerga
  const falta = c => !!c && (c.presenca === "faltou" || c.marco === "faltou" || !!(c.campos && c.campos.presenca === "faltou"));
  const trechos = Array.isArray(ocupados)
    ? ocupados.map(o => minutosDaConsulta(o, dur)).filter(p => p && p.dia === iso)
    : itens.filter(c => !falta(c)).map(c => minutosDaConsulta(c, dur)).filter(Boolean);
  let marcados = 0;
  for (const p of trechos) marcados += abertas ? abertas.reduce((s, [a, b]) => s + Math.max(0, Math.min(b, p.fim) - Math.max(a, p.ini)), 0) : p.fim - p.ini;
  const capacidade = (estimada ? 10 * 60 : abertas.reduce((s, [a, b]) => s + (b - a), 0)) * simult;
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
export function ocupacaoDoPeriodo(consultas, dias, config, bloqueios = [], opcoes = {}) {
  const abertos = (dias || []).map(d => ocupacaoDoDia(consultas, d, config, bloqueios, opcoes)).filter(o => o.pct !== null);   // plano 1500c · CC-190
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
const _fmtMes = new Intl.DateTimeFormat("pt-BR", { month: "long", year: "numeric", timeZone: FUSO });   // plano 1000b · CB-165
export function nomeDoMes(iso) {
  const t = _fmtMes.format(new Date(`${primeiroDoMes(iso)}T12:00:00-03:00`));
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
/** «em 25 min», «em 1 h 30», «hoje às 14:30» (mais de 3 h), «amanhã às 09:00», «sex 03/10 às 14:30».
    Plano 1000 · CA-182/183: horas e minutos sem arredondar (90 min não vira «em 2 h»); acima de 3 h, a hora do relógio (de madrugada,
    «em 13 h» era uma conta para quem lê). */
export function rotuloProxima(c, agora = Date.now(), hojeISO = null) {
  if (!c) return "";
  const t = Date.parse(c.inicio), p = partesSP(c.inicio);
  if (!p) return "";
  const hoje = hojeISO || (partesSP(new Date(agora)) || {}).dia;
  const hora = horaTxt(p.min);
  if (p.dia === hoje) {
    const min = Math.max(0, Math.round((t - agora) / 60000));
    if (min === 0) return `agora · ${hora}`;   // plano 1000b · CB-177: «em 0 min» na hora em que começa
    if (min < 60) return `em ${min} min · ${hora}`;
    if (min <= 180) { const mm = min % 60; return `em ${Math.floor(min / 60)} h${mm ? ` ${String(mm).padStart(2, "0")}` : ""} · ${hora}`; }
    return `hoje às ${hora}`;
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
/** O que a consulta é: concluída (status ganho), falta (etapa com marco «faltou» ou presença «faltou») e encaixe. Encaixe: o que o
    servidor diz (`encaixe` boolean, contrato 6: marcada como encaixe); servidor antigo sem o campo → derivado da configuração (fora do
    horário de atendimento ou acima dos atendimentos simultâneos). */
export function classificarConsulta(c, config, { iso = null, vizinhas = [] } = {}) {
  const p = partesSP(c && c.inicio);
  const dia = iso || (p && p.dia);
  const feita = !!c && c.status === "ganho";
  const falta = !!c && (c.marco === "faltou" || c.presenca === "faltou" || !!(c.campos && c.campos.presenca === "faltou"));
  if (c && typeof c.encaixe === "boolean") return { feita, falta, encaixe: c.encaixe };
  const dur = Number(config && config.duracao_min) || 30;
  const foraDoHorario = !!(p && dia && horarioAberto(config, dia, p.min) === false);
  let acimaDaCapacidade = false;
  if (p && vizinhas.length) {
    const eu = minutosDaConsulta(c, dur);
    const simult = Math.max(1, Number(config && config.capacidade) || 1);
    // plano 1500c · CC-170: o pico de vizinhas AO MESMO TEMPO durante a consulta (vizinhas encadeadas não somam)
    const juntas = eu ? picoSimultaneo(vizinhas.filter(o => o !== c).map(o => minutosDaConsulta(o, dur)).filter(o => o && o.dia === eu.dia), eu.ini, eu.fim) : 0;
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

/** Plano 1000b · CB-182: «Bloqueado das 12:00 às 13:00: almoço» (no dia `iso`; o que começa antes ou termina depois do dia conta o dia todo). */
export function textoBloqueioNoDia(b, iso) {
  const i = partesSP(b && b.inicio), f = partesSP(b && b.fim);
  const motivo = String((b && b.motivo) || "").trim();
  const ini = i && i.dia === iso ? i.min : 0;
  const fim = f && f.dia === iso ? f.min : 24 * 60;
  const quando = !i || !f ? "Bloqueado" : ini <= 0 && fim >= 24 * 60 ? "Bloqueado o dia todo" : `Bloqueado das ${horaTxt(ini)} às ${horaTxt(Math.min(fim, 24 * 60 - 1))}`;
  return `${quando}${motivo ? `: ${motivo}` : ""}`;
}
/** CA-198: o que o leitor de tela ouve no bloco: «10:00 às 10:30, Mariana Costa, Avaliação, encaixe, faltou, próxima consulta». */
export function rotuloDoBloco(c, { inicio = "", fim = "", nome = "", feita = false, falta = false, encaixe = false, proxima = false } = {}) {
  const pres = c && c.presenca === "compareceu" ? "compareceu" : (c && c.presenca === "faltou") || falta ? "faltou" : null;
  return [`${inicio}${fim ? ` às ${fim}` : ""}`, nome, c && c.servico, feita ? "concluída" : null, encaixe ? "encaixe" : null, pres, proxima ? "próxima consulta" : null]
    .filter(Boolean).join(", ");
}

/* ============================================================ plano 1500c (frente agenda): contas puras novas */
/** CC-174/CC-265/CC-332: o bloqueio de `iso` fecha o dia inteiro? (o que começa antes e termina depois conta) */
export function diaTodoBloqueado(bloqueios, iso) {
  const ini = instanteNoFuso(iso), fim = instanteNoFuso(diaISO(iso, 1));
  return bloqueiosDoDia(bloqueios, iso).some(b => Date.parse(b.inicio) <= ini && Date.parse(b.fim) >= fim);
}
/** CC-265: há bloqueio de PARTE do dia (meio dia, almoço extra)? */
export function bloqueioParcial(bloqueios, iso) { return !diaTodoBloqueado(bloqueios, iso) && bloqueiosDoDia(bloqueios, iso).length > 0; }
/** CC-177/CC-288: o próximo dia de atendimento a partir de `iso + passo` (pula dia fechado pela configuração e dia todo bloqueado; até 60 dias).
    Sem configuração de horário, o próprio `iso + passo`. */
export function proximoDiaAberto(config, iso, { passo = 1, bloqueios = [] } = {}) {
  let d = diaISO(iso, Math.max(1, Number(passo) || 1));
  if (faixasDoDia(config, d) === null) return d;
  for (let i = 0; i < 60; i++, d = diaISO(d, 1)) {
    const f = faixasDoDia(config, d);
    if (f && f.length && !diaTodoBloqueado(bloqueios, d)) return d;
  }
  return null;
}
/** CC-168/CC-286: a Agenda ficou aberta e o dia de São Paulo virou (23:59 → 00:01)? */
export function diaVirou(ultimoHoje, hojeAgora) { return dataAgendaValida(ultimoHoje) && dataAgendaValida(hojeAgora) && hojeAgora !== ultimoHoje; }
/** CC-172/CC-284: quantos dias à frente a agenda abre (Configurações › Agenda, até 180); sem a configuração, 180. */
export function limiteDiasAgenda(config) { const n = Math.floor(Number(config && config.dias_a_frente)); return n >= 1 ? Math.min(180, n) : 180; }
/** CC-172/CC-284: «Ver mais 14 dias» ainda tem o que mostrar? (o próximo pedido começaria antes do último dia aberto) */
export function podeVerMais({ janelaIni, janelaDias = 0, hoje, config = null } = {}) {
  if (!dataAgendaValida(janelaIni) || !dataAgendaValida(hoje)) return false;
  return diaISO(janelaIni, janelaDias) <= diaISO(hoje, limiteDiasAgenda(config));
}
/** CC-172: o aviso do limite («A agenda abre até 30 dias à frente (Configurações › Agenda).»). */
export function textoLimiteDias(config) {
  const n = limiteDiasAgenda(config);
  return n >= 180 ? LIMITE_DIAS_TXT : `A agenda abre até ${n} dias à frente (Configurações › Agenda).`;
}
/** CC-173: a data pedida passa do limite? → «A agenda só abre até 20/11.» (null quando está dentro). */
export function avisoAlemDoLimite(data, hoje, config) {
  if (!dataAgendaValida(data) || !dataAgendaValida(hoje)) return null;
  const ultimo = diaISO(hoje, limiteDiasAgenda(config));
  return data > ultimo ? `A agenda só abre até ${ultimo.slice(8, 10)}/${ultimo.slice(5, 7)}.` : null;
}
/** CC-201: o primeiro horário livre de hoje à tarde (a partir das 12:00); null se não há. */
export function hojeATarde(grupos, hojeISO) {
  const g = (grupos || []).find(x => x.dia === hojeISO);
  return (g && g.itens.find(s => s.min >= 12 * 60 && s.livre !== false)) || null;
}
/** CC-201: o primeiro horário livre a partir da segunda-feira da semana que vem. */
export function proximaSemana(grupos, hojeISO) {
  const seg = diaISO(segundaDe(hojeISO), 7);
  for (const g of grupos || []) if (g.dia >= seg) { const s = g.itens.find(x => x.livre !== false); if (s) return s; }
  return null;
}
/** CC-200: os horários do dia em Manhã (até 12h), Tarde (12h–18h) e Noite. Só os períodos com horário. */
export function periodosDoDia(itens) {
  const p = [["Manhã", x => x.min < 12 * 60], ["Tarde", x => x.min >= 12 * 60 && x.min < 18 * 60], ["Noite", x => x.min >= 18 * 60]];
  return p.map(([rotulo, f]) => ({ rotulo, itens: (itens || []).filter(f) })).filter(g => g.itens.length);
}
/** CC-203: distância de edição (Levenshtein) entre dois textos curtos. */
function distancia(a, b) {
  const m = a.length, n = b.length;
  if (!m) return n; if (!n) return m;
  let ant = Array.from({ length: n + 1 }, (_, j) => j);
  for (let i = 1; i <= m; i++) {
    const cur = [i];
    for (let j = 1; j <= n; j++) cur[j] = Math.min(ant[j] + 1, cur[j - 1] + 1, ant[j - 1] + (a[i - 1] === b[j - 1] ? 0 : 1));
    ant = cur;
  }
  return ant[n];
}
/** CC-203: «Avalição» → «Avaliação» (o serviço cadastrado mais parecido, até 2 letras de diferença); igual ou longe demais → null. */
export function servicoParecido(nome, servicos) {
  const v = normServico(nome);
  if (v.length < 3) return null;
  let melhor = null, dist = 3;
  for (const s of servicos || []) {
    const k = normServico(s);
    if (!k) continue;
    if (k === v) return null;
    const d = distancia(v, k);
    if (d < dist) { dist = d; melhor = s; }
  }
  return melhor;
}
/** CC-293/CC-325: a busca de «Procurar paciente» confere até `limite` negócios (abertos e ganhos) — o corte para 8 vem DEPOIS de ler as consultas. */
export function escolherCandidatos(negocios, limite = 30) {
  return (Array.isArray(negocios) ? negocios : []).filter(n => n && (n.status === "aberto" || n.status === "ganho")).slice(0, Math.max(1, limite));
}
/** CC-248: uma assinatura barata da resposta da agenda (sem serializar tudo): as chaves que mudam a tela, num hash curto. */
export function assinaturaAgenda(r) {
  if (!r || typeof r !== "object") return "";
  const partes = [];
  for (const c of Array.isArray(r.consultas) ? r.consultas : []) if (c) partes.push(`${c.negocio_id}|${c.inicio}|${c.fim || ""}|${c.status || ""}|${c.presenca ?? ""}|${c.servico || ""}|${c.dono_id ?? ""}|${c.dono_nome || ""}|${c.nome || c.titulo || ""}|${c.encaixe ?? ""}|${c.marco || ""}|${c.atualizado_em || ""}|${c.confirmada_em || ""}`);
  for (const b of Array.isArray(r.bloqueios) ? r.bloqueios : []) if (b) partes.push(`b${b.id}|${b.inicio}|${b.fim}|${b.motivo || ""}`);
  const cfg = r.config ? JSON.stringify(r.config) : "";
  let hsh = 2166136261;
  for (const ch of `${partes.join("\n")}#${cfg}#${Array.isArray(r.ocupados) ? r.ocupados.length : ""}`) { hsh ^= ch.codePointAt(0); hsh = Math.imul(hsh, 16777619) >>> 0; }
  return `${partes.length}:${hsh.toString(36)}`;
}
/** CC-228: «tel:+55…» sem a crm-logica (o detalhe aberto antes de ela chegar): só dígitos, com +55 quando o número é brasileiro sem DDI. */
export function telLocal(t) {
  const d = String(t || "").replace(/\D/g, "");
  if (d.length < 8) return null;
  return `tel:+${d.length <= 11 ? `55${d}` : d}`;
}
/** CC-227: o link do WhatsApp do aparelho (wa.me) com o texto pronto; sem número válido, null. */
export function linkWhatsAppAgenda(t, texto = "") {
  const d = String(t || "").replace(/\D/g, "");
  if (d.length < 10) return null;
  return `https://wa.me/${d.length <= 11 ? `55${d}` : d}${texto ? `?text=${encodeURIComponent(texto)}` : ""}`;
}
/** CC-256: a taxa de faltas das consultas que já passaram (falta = presença «faltou» ou etapa de faltas) → {faltas, de, pct} ou null sem nenhuma. */
export function taxaFaltas(consultas, agora = Date.now()) {
  const passadas = (consultas || []).filter(c => c && Number.isFinite(Date.parse(c.inicio)) && Date.parse(c.inicio) < agora);
  if (!passadas.length) return null;
  const faltas = passadas.filter(c => classificarConsulta(c, null).falta).length;
  return { faltas, de: passadas.length, pct: faltas / passadas.length };
}
const csvCampo = v => { const t = String(v ?? ""); return /[";\n\r]/.test(t) ? `"${t.replace(/"/g, '""')}"` : t; };
/** CC-258: as consultas do período em CSV (separador «;», como o Excel em português abre): data, hora, paciente, serviço, profissional, presença, origem. */
export function csvDaAgenda(consultas, { nomes = {}, contato = "Paciente" } = {}) {
  const linhas = [["Data", "Hora", contato, "Serviço", "Profissional", "Presença", "Origem"]];
  for (const c of [...(consultas || [])].sort((a, b) => Date.parse(a.inicio) - Date.parse(b.inicio))) {
    const p = partesSP(c && c.inicio);
    if (!p) continue;
    const pres = c.presenca === "compareceu" ? "Compareceu" : c.presenca === "faltou" ? "Faltou" : c.status === "ganho" ? "Concluída" : "";
    const prof = c.dono_id ? (nomes[String(c.dono_id)] || c.dono_nome || "") : "";
    const orig = origemDo(c);
    linhas.push([`${p.dia.slice(8, 10)}/${p.dia.slice(5, 7)}/${p.dia.slice(0, 4)}`, horaTxt(p.min), c.nome || c.titulo || "", c.servico || "", prof, pres, orig === SEM_ORIGEM ? "" : orig]);
  }
  return `${String.fromCodePoint(0xfeff)}${linhas.map(l => l.map(csvCampo).join(";")).join("\r\n")}\r\n`;
}
/** CC-261: a lista do dia em texto para mandar ao profissional: «Amanhã · Sex 24/10\n08:00 Maria Souza (Avaliação)…». */
export function textoCompartilharDia(consultas, iso, hojeISO) {
  const itens = consultasDoDia(consultas, iso);
  const rot = rotuloDoDia(iso, hojeISO);
  const cab = rot === "Hoje" || rot === "Amanhã" ? `${rot} · ${nomeDia(iso, true)}` : nomeDia(iso, true);
  if (!itens.length) return `${cab}: sem consultas.`;
  return [cab, ...itens.map(c => { const p = partesSP(c.inicio); return `${p ? horaTxt(p.min) : ""} ${c.nome || c.titulo || "Consulta"}${c.servico ? ` (${c.servico})` : ""}`; })].join("\n");
}
/** CC-294: «Última: 12/09 (compareceu)» — a consulta que já passou e a presença registrada; "" sem nada. */
export function textoUltimaConsulta(em, presenca = null) {
  const p = em ? partesSP(em) : null;
  if (!p) return "";
  return `Última: ${p.dia.slice(8, 10)}/${p.dia.slice(5, 7)}${presenca === "compareceu" ? " (compareceu)" : presenca === "faltou" ? " (faltou)" : ""}`;
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

/** Legenda das cores (serviço ou profissional): tocar um item destaca só aquelas consultas (aria-pressed); «Mostrar todas» limpa.
    E7: com `avatar` (o ui.avatar), cada profissional aparece com as iniciais do nome na MESMA cor dos blocos dele (corDoResponsavel, estável
    pelo id); «Sem responsável» e «Outros» ficam com a amostra de cor. */
export function montarLegenda({ h, itens = [], ativos = new Set(), aoAlternar, num = String, avatar = null } = {}) {
  const el = h("div", { class: "ag-legenda", role: "group", "aria-label": "Legenda das cores" });
  for (const it of itens) {
    const on = (it.chaves || [it.chave]).every(k => ativos.has(k));
    const pessoa = typeof avatar === "function" && /^p:./.test(it.chave) && it.chave !== "p:sem" ? it.chave.slice(2) : null;
    let marca = null;
    if (pessoa) {
      try { marca = avatar(it.rotulo, pessoa, null, { tamanho: "p" }); } catch { marca = null; }
      if (marca && marca.style && it.cor !== null && it.cor !== undefined) marca.style.setProperty("--cor", `var(--pal-${it.cor})`);
      if (marca && marca.classList) marca.classList.add("ag-leg-av");
    }
    el.appendChild(h("button", { type: "button", class: ["ag-leg-chip", on && "ativo", marca && "ag-leg-pessoa"], "aria-pressed": String(on), dataset: { chave: it.chave },
      title: `${it.rotulo}: ${num(it.n)} ${it.n === 1 ? "consulta" : "consultas"}`,
      on: { click: () => aoAlternar && aoAlternar(it) } },
      marca || h("i", { class: "ag-leg-cor", "aria-hidden": "true", style: it.cor === null || it.cor === undefined ? null : { "--cor-bloco": `var(--pal-${it.cor})` } }),
      h("span", { class: "ag-leg-nome" }, it.rotulo), h("b", { class: "ag-leg-n dado" }, num(it.n))));
  }
  if (ativos.size) el.appendChild(h("button", { type: "button", class: "ag-leg-chip ag-leg-limpar", on: { click: () => aoAlternar && aoAlternar(null) } }, "Mostrar todas"));
  return el;
}

/** Mini-calendário do mês com densidade: 6 × 7 botões (cada um com contagem, barra de ocupação, hoje e bloqueio), setas de mês e teclado. */
export function montarMiniCalendario({ h, mes, consultas = [], bloqueios = [], config = null, hoje, selecionado = null, aoEscolher, aoMudarMes, num = String, carregando = false, compacto = false,
  aoAbrirSemana = null, ocupacao = {} } = {}) {   // plano 1500c · CC-190: ocupacao = {ocupados} (trechos da clínica inteira)
  const comSemanas = typeof aoAbrirSemana === "function";      // CA-270: o número da semana (à esquerda) abre a semana inteira
  const celulas = gradeDoMes(mes);
  const dentro = celulas.filter(c => !c.foraDoMes).map(c => c.iso);
  const porDia = consultasPorDia(consultas);           // CA-218: uma passada; cada célula olha só as do próprio dia
  const doDia = iso => porDia.get(iso) || [];
  const total = dentro.reduce((s, d) => s + doDia(d).length, 0);
  const ocDentro = dentro.map(d => ocupacaoDoDia(doDia(d), d, config, bloqueios, ocupacao)).filter(o => o.pct !== null);
  const media = ocDentro.length ? ocDentro.reduce((s, o) => s + o.pct, 0) / ocDentro.length : null;
  const el = h("section", { class: ["ag-mes", compacto && "ag-mes-compacto", comSemanas && "ag-mes-com-semanas"], "aria-label": `Mês de ${nomeDoMes(mes)}`, "aria-busy": carregando ? "true" : null });
  el.appendChild(h("header", { class: "ag-mes-cab" },
    h("button", { type: "button", class: "bt-icone ag-mes-nav", "aria-label": "Mês anterior", on: { click: () => aoMudarMes && aoMudarMes(-1) } }, h("span", { "aria-hidden": "true" }, "‹")),
    h("div", { class: "ag-mes-tit" }, h("h2", { class: "ag-mes-nome" }, nomeDoMes(mes)),
      h("p", { class: "ag-mes-resumo" },   /* plano 1000b · CB-176: sem role=status (um status novo a cada desenho); o anúncio do período (CA-161) já diz */ carregando ? "Carregando…" : `${num(total)} ${total === 1 ? "consulta" : "consultas"}${media === null ? "" : ` · ocupação média ${media > 0 && media < .005 ? "abaixo de 1%" : `${Math.round(media * 100)}%`}`}`)),
    h("button", { type: "button", class: "bt-icone ag-mes-nav", "aria-label": "Próximo mês", on: { click: () => aoMudarMes && aoMudarMes(1) } }, h("span", { "aria-hidden": "true" }, "›"))));
  el.appendChild(h("div", { class: "ag-mes-sem", "aria-hidden": "true" }, comSemanas ? h("span", { class: "ag-mes-sem-n" }, "sem") : null, ["seg", "ter", "qua", "qui", "sex", "sáb", "dom"].map(d => h("span", null, d))));
  const grade = h("div", { class: "ag-mes-grade", role: "group", "aria-label": `Dias de ${nomeDoMes(mes).toLowerCase()}` });
  const foco = selecionado && celulas.some(c => c.iso === selecionado) ? selecionado : (celulas.some(c => c.iso === hoje && !c.foraDoMes) ? hoje : primeiroDoMes(mes));
  const botoes = [];
  celulas.forEach((cel, i) => {
    if (comSemanas && i % 7 === 0) {
      const fim = diaISO(cel.iso, 6), dm = x => `${x.slice(8, 10)}/${x.slice(5, 7)}`;
      // plano 1000b · CB-193: os números da semana saem da ordem do Tab (eram 6 paradas a mais); pelo teclado, W no dia focado abre a semana
      grade.appendChild(h("button", { type: "button", class: "ag-mes-semana dado", tabindex: "-1", "aria-label": `Abrir a semana de ${dm(cel.iso)} a ${dm(fim)}`, title: `Semana ${semanaISO(cel.iso)} · abrir a semana (W)`,
        dataset: { iso: cel.iso }, on: { click: () => aoAbrirSemana(cel.iso) } }, String(semanaISO(cel.iso))));
    }
    const oc = cel.foraDoMes || carregando ? null : ocupacaoDoDia(doDia(cel.iso), cel.iso, config, bloqueios, ocupacao);
    const n = oc ? oc.n : 0;
    const diaTodo = !cel.foraDoMes && bloqueiosDoDia(bloqueios, cel.iso).some(b => Date.parse(b.fim) - Date.parse(b.inicio) >= 24 * 3600e3 - 1);
    // plano 1500c · CC-265: a tarde bloqueada (bloqueio de parte do dia) também aparece — meio hachurado e «bloqueio parcial»
    const parcial = !cel.foraDoMes && !diaTodo && bloqueioParcial(bloqueios, cel.iso);
    const nivel = nivelOcupacao(oc && oc.pct);
    const txtOc = textoOcupacao(oc);
    // plano 1500c · CC-264: ao passar o mouse (title) ou focar (aria-description), as 5 primeiras consultas do dia
    const primeiras = n ? consultasDoDia(doDia(cel.iso), cel.iso).slice(0, 5).map(c => { const p = partesSP(c.inicio); return `${p ? horaTxt(p.min) : ""} ${c.nome || c.titulo || "Consulta"}`; }) : [];
    const quem = primeiras.length ? `${primeiras.join(" · ")}${n > 5 ? ` e mais ${n - 5}` : ""}` : null;
    const partes = [nomeDia(cel.iso, true), oc ? `${num(n)} ${n === 1 ? "consulta" : "consultas"}` : null, txtOc || null, diaTodo ? "bloqueado" : parcial ? "bloqueio parcial" : null, cel.iso === selecionado ? "selecionado" : null].filter(Boolean);
    const b = h("button", { type: "button", "aria-keyshortcuts": comSemanas ? "W" : null, class: ["ag-mes-dia", `ag-ocup-${nivel}`, cel.foraDoMes && "ag-mes-fora", cel.iso === hoje && "hoje", cel.iso === selecionado && "sel", diaTodo && "ag-mes-bloq", parcial && "ag-mes-parcial", oc && oc.fechado && "ag-mes-fechado", hoje && cel.iso < hoje && "ag-mes-passado"],
      "aria-label": partes.join(", "), "aria-description": quem, title: quem, "aria-current": cel.iso === hoje ? "date" : null, tabindex: cel.iso === foco ? "0" : "-1", dataset: { iso: cel.iso },
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
    if (comSemanas && (ev.key === "w" || ev.key === "W") && !ev.ctrlKey && !ev.metaKey && !ev.altKey) { ev.preventDefault(); aoAbrirSemana(celulas[i - (i % 7)].iso); return; }   // CB-193
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

/** Painel do dia: 4 números (consultas, concluídas, faltas, encaixes) e a lista em ordem de horário; tocar abre o detalhe.
    E1: com `presenca` ({L: crm-logica, aoMarcar(c, estado, botao), icone?, agora?}) cada consulta que já passou ganha «Compareceu / Faltou»
    (botões com aria-pressed; tocar de novo no marcado limpa). E5: com `vazio` (o ui.vazio) o dia sem consulta usa a ilustração da agenda. */
/** CA-192: as consultas do dia que já passaram, abertas e ainda SEM marca de presença (as que o «Marcar as que faltam» cobre). */
export function pendentesDePresenca(consultas, iso, L, agora = Date.now()) {
  return consultasDoDia(consultas, iso).filter(c => { const p = presencaDaConsulta(c, L, agora); return p.possivel && p.conhecida && !p.estado && c.status !== "ganho"; });
}

export function montarPainelDia({ h, iso, consultas = [], config = null, hoje, aoAbrir, aoMarcar, horaBR = x => x, num = String, pode = false, titulo = null, presenca = null, vazio = null,
  telBR = String, imprimir = null, contatos = null, desmarcadas = null, compartilhar = null } = {}) {   // plano 1500c · CC-225/CC-226: contatos = {hrefTel, aoConversar, aoLembrar, lembrado}
  const r = resumoDoDia(consultas, iso, config);
  const futuro = !!hoje && iso > hoje;
  const el = h("aside", { class: "ag-painel", "aria-label": "Resumo do dia" });
  // CA-189: «Imprimir dia» (desktop): o @media print do agenda.css deixa só este painel, com hora, paciente, serviço e telefone
  // plano 1500c · CC-302: «Amanhã» e «Ontem» ditos pelo nome (antes «Dia por vir»/«Dia passado»)
  const subDia = iso === hoje ? nomeDia(iso, true) : hoje && iso === diaISO(hoje, 1) ? "Amanhã" : hoje && iso === diaISO(hoje, -1) ? "Ontem" : (hoje && iso < hoje ? "Dia passado" : "Dia por vir");
  el.appendChild(h("header", { class: "ag-painel-cab" }, h("h2", { class: "ag-painel-titulo" }, titulo || (iso === hoje ? "Hoje" : nomeDia(iso, true))),
    h("p", { class: "ag-painel-sub" }, subDia),
    typeof imprimir === "function" && r.itens.length ? h("button", { type: "button", class: "bt bt-fant bt-p ag-painel-imprimir", on: { click: () => imprimir(iso) } }, "Imprimir dia") : null,
    typeof compartilhar === "function" && r.itens.length ? h("button", { type: "button", class: "bt bt-fant bt-p ag-painel-compartilhar", on: { click: () => compartilhar(iso) } }, "Compartilhar") : null));   // plano 1500c · CC-261
  // plano 1500c · CC-270: as desmarcadas do dia (quando o servidor mandar), recolhidas — quem chega à tarde sabe que a das 10h caiu
  if (Array.isArray(desmarcadas) && desmarcadas.length) {
    el.appendChild(h("details", { class: "ag-desmarcadas" }, h("summary", null, `${num(desmarcadas.length)} ${desmarcadas.length === 1 ? "desmarcada" : "desmarcadas"} neste dia`),
      h("ul", null, desmarcadas.map(x => h("li", null, h("span", { class: "dado" }, horaBR(x.inicio)), ` ${x.nome || x.titulo || "Consulta"}${x.motivo ? ` · ${x.motivo}` : ""}`)))));
  }
  const kpi = (valor, rotulo, cls) => h("div", { class: ["ag-kpi", cls] }, h("b", { class: "dado", dataset: { valor: String(valor) } }, num(valor)), h("span", null, rotulo));
  // CA-190: dia por vir não tem concluídas nem faltas — os zeros eram ruído (o que houver de verdade continua à mostra)
  el.appendChild(h("div", { class: "ag-painel-kpis" },
    kpi(r.total, r.total === 1 ? "consulta" : "consultas"),
    futuro && !r.feitas ? null : kpi(r.feitas, r.feitas === 1 ? "concluída" : "concluídas", r.feitas && "ok"),
    futuro && !r.faltas ? null : kpi(r.faltas, r.faltas === 1 ? "falta" : "faltas", r.faltas && "ruim"),
    kpi(r.encaixes, r.encaixes === 1 ? "encaixe" : "encaixes", r.encaixes && "aten")));
  // CA-192: no fim do dia, as que já passaram sem marca de uma vez (confirmação e um Desfazer só)
  const pendentes = presenca && presenca.L && pode && typeof presenca.aoLote === "function" ? pendentesDePresenca(consultas, iso, presenca.L, presenca.agora) : [];
  if (pendentes.length >= 2) el.appendChild(h("button", { type: "button", class: "bt bt-sec bt-p ag-pres-lote", on: { click: ev => presenca.aoLote(pendentes, ev.currentTarget || ev.target) } },
    presenca.icone ? presenca.icone("check") : null, `Marcar as ${num(pendentes.length)} que faltam como Compareceu`));
  if (!r.itens.length) {
    const acao = pode && aoMarcar ? { rotulo: "Marcar consulta", icone: "mais", fn: () => aoMarcar(iso) } : null;
    let v = null;
    if (typeof vazio === "function") try { v = vazio({ tema: "agenda", titulo: "Nenhuma consulta neste dia.", acao }); } catch { v = null; }
    el.appendChild(v ? h("div", { class: "ag-painel-vazio ag-painel-vazio-tema" }, v)
      : h("div", { class: "ag-painel-vazio" }, h("p", { class: "narr" }, "Nenhuma consulta neste dia."),
        acao ? h("button", { type: "button", class: "bt bt-sec bt-p", on: { click: acao.fn } }, "Marcar consulta") : null));
    return el;
  }
  const lista = h("ol", { class: "ag-painel-lista" });
  for (const it of r.itens) lista.appendChild(itemDoPainel({ h, it, presenca, pode, aoAbrir, horaBR, telBR, contatos }));
  el.appendChild(lista);
  return el;
}
/** CA-203: a linha curta do dia no celular: «2 consultas · 1 falta · 1 encaixe» (dia por vir: sem as faltas — CA-190).
    Plano 1500c · CC-303: dia vazio diz «Sem consultas» (o «vazio» soava como erro); dia por vir aberto, «Livre». */
export function textoResumoDia(r, { futuro = false, num = String, livre = false } = {}) {
  if (!r || !r.total) return futuro && livre ? "Livre" : "Sem consultas";
  const n = (v, um, varios) => `${num(v)} ${v === 1 ? um : varios}`;
  return [n(r.total, "consulta", "consultas"), r.feitas ? n(r.feitas, "concluída", "concluídas") : null, futuro && !r.faltas ? null : n(r.faltas, "falta", "faltas"),
    r.encaixes ? n(r.encaixes, "encaixe", "encaixes") : null].filter(Boolean).join(" · ");   // plano 1000b · CB-178: sem «0 encaixes»
}
/** Uma consulta da lista (painel do dia e visão «Lista»): hora, paciente, serviço, selos e, se já passou, «Compareceu / Faltou». */
function itemDoPainel({ h, it, presenca = null, pode = false, aoAbrir = null, horaBR = x => x, telBR = String, contatos = null }) {
  const c = it.c, nome = c.nome || c.titulo || "Consulta sem nome";
  const pr = presenca && presenca.L ? presencaDaConsulta(c, presenca.L, presenca.agora) : null;
  const grupo = pr && pr.possivel && typeof presenca.aoMarcar === "function"
    ? montarPresenca({ h, c, estado: pr.estado, aoMarcar: presenca.aoMarcar, icone: presenca.icone, rotulos: presenca.L.PRESENCAS, desabilitado: !pode }) : null;
  // a presença marcada já aparece no botão pressionado: o selo «Faltou» fica só para a falta pela etapa
  // plano 1500c · CC-239/CC-324: «Confirmada» (quando o servidor mandar confirmada_em) e «IA» (marcado_por = 'ia')
  const selos = [it.feita ? ["Concluída", "pilula-ok"] : null, it.falta && !(grupo && pr.estado === "faltou") ? ["Faltou", "pilula-ruim"] : null, it.encaixe ? ["Encaixe", "pilula-aten"] : null,
    c.confirmada_em && !it.feita ? ["Confirmada", "pilula-ok"] : null, c.marcado_por === "ia" ? ["Marcada pela IA", "pilula-info"] : null].filter(Boolean);
  const bt = h("button", { type: "button", class: ["ag-painel-item", it.feita && "feita"], "aria-haspopup": "dialog", on: { click: () => aoAbrir && aoAbrir(c, bt) } },
    h("span", { class: "ag-painel-hora dado" }, horaBR(c.inicio)),
    h("span", { class: "ag-painel-txt" }, h("b", null, nome), c.servico ? h("small", null, c.servico) : null,
      c.telefone ? h("small", { class: "ag-so-impressao dado" }, telBR(c.telefone)) : null),
    selos.length ? h("span", { class: "ag-painel-selos" }, selos.map(([t, cls]) => h("span", { class: ["pilula", cls] }, t))) : null);
  // plano 1500c · CC-225: ligar e abrir a conversa direto da linha (44 px, celular); CC-226: «Lembrar» nas consultas de amanhã, com a marca «lembrado»
  let rapidas = null;
  if (contatos) {
    const tel = c.telefone && typeof contatos.hrefTel === "function" ? contatos.hrefTel(c.telefone) : null;
    const lembrado = typeof contatos.lembrado === "function" && contatos.lembrado(c);
    const podeLembrar = typeof contatos.podeLembrar === "function" && contatos.podeLembrar(c);
    const bts = [
      tel ? h("a", { class: "bt-icone ag-li-tel", href: tel, "aria-label": `Ligar para ${nome}`, title: `Ligar · ${telBR(c.telefone)}` }, contatos.icone ? contatos.icone("telefone") : "☎") : null,
      c.contato_id != null && typeof contatos.aoConversar === "function" ? h("button", { type: "button", class: "bt-icone ag-li-conversa", "aria-label": `Abrir a conversa de ${nome}`, title: "Abrir conversa",
        on: { click: () => contatos.aoConversar(c) } }, contatos.icone ? contatos.icone("whatsapp") : "✉") : null,
      lembrado ? h("span", { class: "pilula pilula-ok ag-li-lembrado" }, "Lembrado")
        : podeLembrar && typeof contatos.aoLembrar === "function" ? h("button", { type: "button", class: "bt bt-fant bt-p ag-li-lembrar", "aria-label": `Lembrar ${nome}`, on: { click: () => contatos.aoLembrar(c) } },
          contatos.icone ? contatos.icone("sino") : null, "Lembrar") : null,
    ].filter(Boolean);
    if (bts.length) rapidas = h("span", { class: "ag-li-rapidas" }, bts);
  }
  return h("li", { class: ["ag-painel-li", grupo && "com-presenca", rapidas && "com-rapidas"], dataset: { negocio: c.negocio_id ?? null, nome: normServico(`${nome} ${c.servico || ""}`) } }, bt, rapidas, grupo);
}
/** CA-269: a visão «Lista» — os dias do período em ordem, cada um com as consultas (hora, paciente, serviço, selos, presença) ou «Livre».
    Para o celular, onde a grade de horas mostra uma consulta num mar vazio. */
export function montarListaDias({ h, dias = [], consultas = [], config = null, hoje = "", presenca = null, pode = false, aoAbrir = null, aoMarcar = null,
  horaBR = x => x, telBR = String, num = String, uid = "l", bloqueios = [], contatos = null } = {}) {
  const el = h("div", { class: "ag-lista" });
  for (const iso of dias) {
    const r = resumoDoDia(consultas, iso, config);
    const id = `ag-lista-${uid}-${iso}`;
    const rot = rotuloDoDia(iso, hoje);
    const titulo = rot === "Hoje" || rot === "Amanhã" ? `${rot} · ${nomeDia(iso, true)}` : nomeDia(iso, true);
    const passado = !!hoje && iso < hoje;
    // plano 1500c · CC-174/CC-175/CC-304: dia bloqueado diz o motivo, dia fechado diz «Fechado» (sem «Marcar») e dia passado sem consulta não é «livre»
    const travas = bloqueiosDoDia(bloqueios, iso);
    const fechado = Array.isArray(faixasDoDia(config, iso)) && faixasDoDia(config, iso).length === 0;
    const todoBloq = diaTodoBloqueado(bloqueios, iso);
    const selo = r.total ? `${num(r.total)} ${r.total === 1 ? "consulta" : "consultas"}` : passado ? "sem consultas" : todoBloq ? "bloqueado" : fechado ? "fechado" : "livre";
    const sec = h("section", { class: ["ag-lista-dia", iso === hoje && "hoje", passado && "passado", (todoBloq || fechado) && !r.total && "ag-lista-fechado"], "aria-labelledby": id, dataset: { iso } },
      h("h3", { class: "ag-lista-tit", id }, h("span", null, titulo),
        h("small", { class: "dado" }, selo)));
    if (travas.length) sec.appendChild(h("p", { class: "ag-lista-bloq" }, travas.map(b => textoBloqueioNoDia(b, iso)).join(" · ")));
    if (r.itens.length) {
      const ol = h("ol", { class: "ag-painel-lista" });
      for (const it of r.itens) ol.appendChild(itemDoPainel({ h, it, presenca, pode, aoAbrir, horaBR, telBR, contatos }));
      sec.appendChild(ol);
    } else if (todoBloq || passado) {
      /* o motivo do bloqueio já está escrito; dia passado não marca */
    } else if (fechado) {
      sec.appendChild(h("p", { class: "ag-livre ag-livre-leitura ag-lista-fechado-txt" }, "Fechado neste dia"));
    } else if (pode && typeof aoMarcar === "function") {
      sec.appendChild(h("button", { type: "button", class: "ag-livre ag-lista-livre", "aria-label": `Marcar consulta em ${nomeDia(iso, true)}`, on: { click: () => aoMarcar(iso) } },
        h("span", null, "Livre"), h("span", { class: "ag-livre-acao" }, "Marcar")));
    }
    el.appendChild(sec);
  }
  return el;
}

/* ============================================================ plano 100 (E): presença, servidor no lugar da inferência, próxima fora do período, lembrete */
/** E1: presença da consulta pelas regras do CRM (crm-logica: presencaDe/consultaPassou) → {estado, possivel, conhecida}.
    possivel = a hora já passou e (está aberta ou já tem marca); conhecida = a linha trouxe `presenca` (contrato 6) — senão a tela lê a ficha. */
export function presencaDaConsulta(c, L, agora = Date.now()) {
  if (!c || !L || typeof L.presencaDe !== "function") return { estado: null, possivel: false, conhecida: false };
  const estado = L.presencaDe(c);
  const passou = typeof L.consultaPassou === "function" && L.consultaPassou({ consulta_em: c.inicio }, agora ?? Date.now());
  return { estado, possivel: !!passou && (!c.status || c.status === "aberto" || !!estado), conhecida: Object.hasOwn(c, "presenca") };
}
/** E1: «Compareceu / Faltou» de uma consulta (grupo de dois botões com aria-pressed). `rotulos` = crm-logica PRESENCAS ({rotulo, icone}). */
export function montarPresenca({ h, c, estado = null, aoMarcar, icone = null, rotulos = null, desabilitado = false } = {}) {
  const nome = (c && (c.nome || c.titulo)) || "consulta";
  const P = rotulos || { compareceu: { rotulo: "Compareceu", icone: "check" }, faltou: { rotulo: "Faltou", icone: "fechar" } };
  const el = h("div", { class: "ag-pres", role: "group", "aria-label": `Presença de ${nome}`, dataset: { negocio: c && c.negocio_id != null ? String(c.negocio_id) : null } });
  for (const est of ["compareceu", "faltou"]) {
    const on = estado === est;
    const b = h("button", { type: "button", class: ["ag-pres-bt", `ag-pres-${est}`], dataset: { estado: est }, "aria-pressed": String(on), disabled: desabilitado,
      title: on ? "Tocar de novo pergunta se quer limpar a marcação" : null },   // plano 1500c · CC-221: limpar pede confirmação
      typeof icone === "function" ? icone(P[est].icone) : null, P[est].rotulo);
    b.addEventListener("click", () => { if (aoMarcar) aoMarcar(c, est, b); });
    el.appendChild(b);
  }
  return el;
}
/** E2: nomes dos responsáveis que o servidor mandou nas linhas (`dono_nome`, contrato 6) → {dono_id: nome}. */
export function nomesDasConsultas(consultas) {
  const r = {};
  for (const c of consultas || []) if (c && c.dono_id && typeof c.dono_nome === "string" && c.dono_nome.trim()) r[String(c.dono_id)] = c.dono_nome.trim();
  return r;
}
/** E2: a base do CRM só é lida para os nomes quando alguma linha com responsável veio SEM o campo `dono_nome` (servidor antigo). */
export function faltamNomes(consultas) { return (consultas || []).some(c => c && c.dono_id && !Object.hasOwn(c, "dono_nome")); }
/** E3: o 1º dia da busca da próxima consulta FORA do período (null = não buscar). Só com o período já começado (hoje ou antes): o dia
    seguinte ao fim dele, ou hoje se o período inteiro já passou. Período no futuro não busca (a próxima de verdade pode vir antes dele). */
export function inicioBuscaProxima(de, dias, hojeISO) {
  if (!dataAgendaValida(de) || !dataAgendaValida(hojeISO) || de > hojeISO) return null;
  const seguinte = diaISO(de, Math.max(1, Math.floor(Number(dias)) || 1));
  return seguinte > hojeISO ? seguinte : hojeISO;
}
const semanaLonga = iso => _fmtSemLonga.format(new Date(`${iso}T12:00:00-03:00`)).replace(/-feira$/, "");   // CB-165: formatador do módulo
/** E3: «amanhã às 10:00», «sexta às 14:00» (até 6 dias à frente), senão «sex 24/10 às 14:00»; hoje continua «em 25 min · 10:25». */
export function rotuloProximaFora(c, agora = Date.now(), hojeISO = null) {
  const p = c && partesSP(c.inicio);
  if (!p) return "";
  const hoje = hojeISO || (partesSP(new Date(agora)) || {}).dia;
  const dist = Math.round((Date.parse(`${p.dia}T12:00:00Z`) - Date.parse(`${hoje}T12:00:00Z`)) / 864e5);
  if (dist >= 2 && dist <= 6) return `${semanaLonga(p.dia)} às ${horaTxt(p.min)}`;
  return rotuloProxima(c, agora, hoje);
}
/** E3: o texto quando não há próxima nem no período nem nos 7 dias buscados. */
export function textoSemProxima({ umDia = false, desde = null, hojeISO = null } = {}) {
  return desde && desde === hojeISO ? "Nenhuma consulta nos próximos 7 dias." : `Nenhuma consulta por vir ${umDia ? "neste dia" : "nesta semana"} nem nos 7 dias seguintes.`;
}
/** CA-181: o primeiro nome para a saudação — a mesma regra do cv-logica.primeiroNome: telefone (o «nome» de quem não tem cadastro) não é nome
    e o pronome de tratamento sai («Dra. Helena Souza» → «Helena»). Sem nome válido, "" (a saudação vira «Olá!»). */
const TRATAMENTOS = new Set(["dr", "dra", "sr", "sra", "srta", "prof", "profa", "pe"]);
export function primeiroNomeAgenda(nome) {
  const t = String(nome ?? "").trim();
  if (!t || /^[\d\s()+-]+$/.test(t)) return "";
  const partes = t.split(/\s+/);
  let i = 0;
  while (i < partes.length - 1 && TRATAMENTOS.has(partes[i].normalize("NFD").replace(/[̀-ͯ]/g, "").toLowerCase().replace(/\.$/, ""))) i++;
  if (TRATAMENTOS.has(partes[i].normalize("NFD").replace(/[̀-ͯ]/g, "").toLowerCase().replace(/\.$/, ""))) return "";   // só o título
  // plano 1500c · CC-210: nome todo em maiúsculas («MARIA SOUZA») vira «Maria» (a mesma regra proposta para o cv-logica)
  const p = partes[i].length > 1 && partes[i] === partes[i].toLocaleUpperCase("pt-BR") && partes[i] !== partes[i].toLocaleLowerCase("pt-BR")
    ? partes[i].toLocaleLowerCase("pt-BR") : partes[i];
  return p.charAt(0).toLocaleUpperCase("pt-BR") + p.slice(1);
}
const saudacao = c => { const n = primeiroNomeAgenda(c && c.nome); return `Olá${n ? `, ${n}` : ""}!`; };
const quandoTxt = (p, hojeISO) => (p.dia === hojeISO ? "hoje" : p.dia === diaISO(hojeISO, 1) ? "amanhã" : `dia ${p.dia.slice(8, 10)}/${p.dia.slice(5, 7)} (${semanaLonga(p.dia)})`);
/** Plano 1500c · CC-205: a palavra do que a Agenda marca na vertical (consulta · visita · entrega; vocab.compromisso, sempre feminina). */
export function palavraCompromisso(vocab = null) { return vocab && typeof vocab.min === "function" && vocab.compromisso ? vocab.min("compromisso") : "consulta"; }
const servicoTxt = c => { const s = String((c && c.servico) || "").trim(); return s ? ` (${s})` : ""; };
/** E6: texto curto do lembrete (a pessoa confere e envia): «Olá, Mariana! Passando para lembrar da sua consulta (Avaliação) amanhã às 10:00. Podemos confirmar?»
    Plano 1500c · CC-205/CC-206: a palavra da vertical e, com `empresa`/`endereco`, de onde é e onde fica («Aqui é da Clínica Sorriso… na Rua X, 10»). */
export function textoLembrete(c, hojeISO, { vocab = null, empresa = "", endereco = "" } = {}) {
  const p = c && partesSP(c.inicio);
  if (!p) return "";
  const pal = palavraCompromisso(vocab), emp = String(empresa || "").trim(), end = String(endereco || "").replace(/\s+/g, " ").trim().slice(0, 160);
  if (emp || end) return `${saudacao(c)}${emp ? ` Aqui é da ${emp}.` : ""} Lembrando da sua ${pal}${servicoTxt(c)} ${quandoTxt(p, hojeISO)} às ${horaTxt(p.min)}${end ? `, na ${end}` : ""}. Podemos confirmar?`;
  return `${saudacao(c)} Passando para lembrar da sua ${pal}${servicoTxt(c)} ${quandoTxt(p, hojeISO)} às ${horaTxt(p.min)}. Podemos confirmar?`;
}
/** CA-176: a confirmação logo depois de marcar (rascunho na conversa; nada sai sozinho). CC-205: a palavra da vertical. */
export function textoConfirmacao(c, hojeISO, { vocab = null } = {}) {
  const p = c && partesSP(c.inicio);
  if (!p) return "";
  const pal = palavraCompromisso(vocab);
  return `${saudacao(c)} Sua ${pal}${servicoTxt(c)} está marcada para ${quandoTxt(p, hojeISO)} às ${horaTxt(p.min)}. Qualquer imprevisto, é só avisar por aqui.`;
}
/** CA-178: o aviso de que a consulta foi desmarcada (rascunho; a pessoa confere e envia). CC-207: com o serviço; CC-205: a palavra da vertical. */
export function textoDesmarcacao(c, hojeISO, { vocab = null } = {}) {
  const p = c && partesSP(c.inicio);
  if (!p) return "";
  return `${saudacao(c)} Sua ${palavraCompromisso(vocab)}${servicoTxt(c)} de ${quandoTxt(p, hojeISO)} às ${horaTxt(p.min)} foi desmarcada. Quer escolher um novo horário?`;
}
/** Plano 1500c · CC-178: o aviso de remarcação («Sua consulta (Avaliação) foi remarcada para amanhã às 10:00.») — `c.inicio` já é o horário NOVO. */
export function textoRemarcacao(c, hojeISO, { vocab = null } = {}) {
  const p = c && partesSP(c.inicio);
  if (!p) return "";
  return `${saudacao(c)} Sua ${palavraCompromisso(vocab)}${servicoTxt(c)} foi remarcada para ${quandoTxt(p, hojeISO)} às ${horaTxt(p.min)}. Se não puder, é só avisar por aqui.`;
}
/** Plano 1500c · CC-223: para quem faltou — «Sentimos sua falta na consulta de hoje. Vamos remarcar?». */
export function textoFalta(c, hojeISO, { vocab = null } = {}) {
  const p = c && partesSP(c.inicio);
  if (!p) return "";
  const quando = p.dia === hojeISO ? "de hoje" : p.dia === diaISO(hojeISO, -1) ? "de ontem" : `do dia ${p.dia.slice(8, 10)}/${p.dia.slice(5, 7)}`;
  return `${saudacao(c)} Sentimos sua falta na ${palavraCompromisso(vocab)}${servicoTxt(c)} ${quando}. Vamos remarcar? Me diga o melhor dia e horário.`;
}
/** E6: a conversa do contato onde o lembrete entra: a aberta; sem aberta, a mais recente (a mesma regra de #/conversas?contato=). */
export function conversaDoContato(conversas) {
  const lista = Array.isArray(conversas) ? conversas.filter(c => c && c.id != null) : [];
  return lista.find(c => c.status !== "resolvida") || lista.slice().sort((a, b) => String(b.aberta_em || "").localeCompare(String(a.aberta_em || "")))[0] || null;
}
/** Plano 1000b · CB-195 / CB-200: o aviso quando o contato não tem conversa aberta (o rascunho iria para um campo travado). */
export function avisoSemConversaAberta(resolvida, copiou, texto = "") {
  const onde = resolvida ? "A conversa está resolvida: reabra a conversa ou comece uma nova (no número da Meta, só com modelo)."
    : "Sem conversa aberta: comece pela Nova conversa (no número da Meta, só com modelo).";
  return copiou ? `${onde} O texto foi copiado para você colar.` : `${onde} Texto: ${texto}`;
}
/** E6: deixa `texto` como rascunho da conversa pelo ctx.rascunho (o composer o devolve ao abrir, com «Rascunho restaurado») — nada é enviado.
    Nunca passa por cima de um rascunho que a pessoa já tem. → true se ficou guardado. */
export function prepararRascunho(rascunho, chave, texto, criarCampo = () => document.createElement("textarea")) {
  if (!rascunho || typeof rascunho.ligar !== "function" || !chave || !texto) return false;
  try {
    if (typeof rascunho.existe === "function" && rascunho.existe(chave)) return false;
    const campo = criarCampo();
    campo.value = texto;
    const ctl = rascunho.ligar(campo, chave);
    if (!ctl || typeof ctl.salvarAgora !== "function") return false;
    ctl.salvarAgora();
    if (typeof ctl.desligar === "function") ctl.desligar();
    return typeof rascunho.texto === "function" ? rascunho.texto(chave) === texto : true;
  } catch { return false; }
}

/* ============================================================ textos */
/* plano 1000b · CB-165: os formatadores de data ficam no módulo (antes um Intl.DateTimeFormat novo a cada rótulo de dia) */
const _fmtDia = { true: new Intl.DateTimeFormat("pt-BR", { weekday: "long", day: "2-digit", month: "short", timeZone: FUSO }),
  false: new Intl.DateTimeFormat("pt-BR", { weekday: "short", day: "2-digit", month: "short", timeZone: FUSO }) };
const _fmtSemLonga = new Intl.DateTimeFormat("pt-BR", { weekday: "long", timeZone: FUSO });
const _fmtSemCurta = new Intl.DateTimeFormat("pt-BR", { weekday: "short", timeZone: FUSO });
function nomeDia(iso, longo = false) {
  const t = _fmtDia[!!longo].format(new Date(`${iso}T12:00:00-03:00`));
  return t.charAt(0).toUpperCase() + t.slice(1); // só a 1ª letra ("Qui., 01 de out."); o CSS capitalize gerava "De Out."
}
const semanaCurta = iso => _fmtSemCurta.format(new Date(`${iso}T12:00:00-03:00`)).replace(".", "");
const diaDoMes = iso => iso.slice(8, 10);

/** A origem da consulta em português («Meta Ads · Aparelho invisível · Vídeo 1»). Plano 1000 · CA-280: id cru de campanha/anúncio
    (campanha_ext/anuncio_ext, «120211…») nunca aparece — sem o nome, fica só a plataforma. A etapa vai em outra linha (etapaDo). */
const SEM_ORIGEM = "Origem não informada";
export function origemDo(item) {
  const it = item && typeof item === "object" ? item : {};
  const nome = it.plataforma === "google" ? "Google Ads"
    : it.plataforma === "meta" ? "Meta Ads"
      : ORIGENS[it.origem] || SEM_ORIGEM;
  const rastreio = it.rastreio && typeof it.rastreio === "object" ? it.rastreio : {};
  const semId = v => (typeof v === "string" && v.trim() && !/^\d{6,}$/.test(v.trim()) ? v.trim() : null);
  const campanha = semId(it.campanha_nome) || semId(it.campanha) || semId(rastreio.utm_campaign);
  const anuncio = semId(it.anuncio_nome) || semId(it.anuncio_titulo) || semId(rastreio.utm_content);
  return [nome, campanha, anuncio].filter(Boolean).join(" · ");
}
/** CA-257: a nota mais recente da ficha (nx_negocio_ver.notas já vem com a fixada primeiro e depois da mais nova) em uma linha: «Última nota: …». */
export function ultimaNota(notas) {
  const n = (Array.isArray(notas) ? notas : []).find(x => x && typeof x.texto === "string" && x.texto.trim());
  if (!n) return "";
  const t = n.texto.replace(/\s+/g, " ").trim();
  return `Última nota: ${t.length > 160 ? `${t.slice(0, 159).trimEnd()}…` : t}`;
}
/** CA-280: a etapa do negócio (linha própria no detalhe). */
export function etapaDo(item) {
  const it = item && typeof item === "object" ? item : {};
  return (typeof it.etapa === "string" && it.etapa.trim()) || (it.marco === "agendada" ? "Agendada" : "");
}

function erroResposta(r) {
  if (r && r.ok === false) throw Object.assign(new Error(r.erro || "dados_invalidos"), { codigo: r.erro || "dados_invalidos" });
  return r;
}

/* ============================================================ marcar / remarcar / desmarcar (M27) */
const logicaDe = ctx => import(`./crm-logica.js?v=${encodeURIComponent(ctx.versao)}`);

/** CA-219: roda `fn` sobre os itens com no máximo `limite` promessas ao mesmo tempo; resolve quando todas acabam (erros ficam com `fn`). */
export async function comLimite(itens, limite, fn) {
  const lista = Array.isArray(itens) ? itens : [];
  let i = 0;
  const trabalhador = async () => { while (i < lista.length) { const it = lista[i++]; try { await fn(it); } catch { /* quem chama trata */ } } };
  await Promise.all(Array.from({ length: Math.max(1, Math.min(Number(limite) || 1, lista.length)) }, trabalhador));
}
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

/** Devolve a consulta ao horário anterior (o Desfazer de uma remarcação, pela janela ou pelo arrasto, e o de desmarcar). Consulta que NÃO era
    encaixe volta como normal; se o servidor recusar (antecedência, horário de atendimento, ou o horário já cheio por um encaixe
    marcado depois), volta como ENCAIXE — devolver o que já estava marcado nunca é barrado. Sem saber (`encaixe` ausente) vai direto como encaixe. */
export async function voltarAoHorario(api, negocioId, inicio, servico, encaixe) {
  const args = { p_negocio: negocioId, p_inicio: inicio, p_servico: servico || null };
  let recusa = null;
  if (encaixe === false) {
    const r = await api.rpcC("nx_agenda_marcar", { ...args, p_encaixe: false });
    if (!(r && r.ok === false)) return r;
    recusa = r.erro || "recusado";
  }
  const volta = erroResposta(await api.rpcC("nx_agenda_marcar", { ...args, p_encaixe: true }));
  // plano 1000 · CA-283: a volta normal foi recusada e a consulta voltou como encaixe (furando a capacidade): quem desfez fica sabendo
  return recusa && volta && typeof volta === "object" ? { ...volta, voltou_como_encaixe: true, motivo_encaixe: recusa } : volta;
}
/** CA-283: o aviso quando o Desfazer só conseguiu devolver a consulta como encaixe ("" quando voltou normal). */
export function avisoVoltaEncaixe(r) {
  if (!(r && r.voltou_como_encaixe)) return "";
  return r.motivo_encaixe === "horario_ocupado" ? "A consulta voltou como encaixe: o horário já estava cheio."
    : "A consulta voltou como encaixe: o horário não aceitava mais marcação normal (antecedência ou horário de atendimento).";
}

/** Oportunidades ABERTAS que casam com a busca (uma chamada: nx_buscar). Servidor sem a busca → cai no quadro do funil (mais lento). */
async function procurarNegocios(ctx, q) {
  const { api } = ctx;
  const r = await api.rpcC("nx_buscar", { p_q: q });
  // plano 1000b · CB-170: até 30 (a janela mostra 8 e «Ver mais»; homônimos não ficam de fora)
  // plano 1500c · CC-198: e até 10 já GANHOS (tratamento fechado) para «Marcar retorno» — quem chama separa pelo status
  if (r && Array.isArray(r.negocios)) return [...r.negocios.filter(n => n.status === "aberto").slice(0, 30), ...r.negocios.filter(n => n.status === "ganho").slice(0, 10)];
  const crm = await ctx.carregar("crm");
  const k = await crm.kit(ctx);
  const mapa = new Map();
  // plano 1000b · CB-171: os funis em paralelo (no máximo 4 leituras ao mesmo tempo), não um por um; a ordem dos funis é mantida no resultado
  const funis = (k.base.funis || []).filter(f => f.ativo !== false);
  const lidos = new Map();
  let erroFunil = null;
  await comLimite(funis, 4, async funil => {
    try { lidos.set(funil, await api.rpcC("nx_negocios_kanban", { p_funil: funil.id, p_filtro: { busca: q, status: "aberto" }, p_por_coluna: 30 })); }
    catch (e) { erroFunil = erroFunil || e; }
  });
  if (erroFunil && !lidos.size) throw erroFunil;     // nenhum funil respondeu: o erro aparece (não «nenhuma oportunidade»)
  for (const funil of funis) {
    const rr = lidos.get(funil) || {};
    for (const coluna of rr.colunas || []) for (const item of coluna.itens || []) {
      if (item.status === "aberto" && !mapa.has(String(item.id))) mapa.set(String(item.id), { id: item.id, titulo: item.titulo || item.nome, contato_nome: item.contato && item.contato.nome, estagio_nome: item.estagio_nome || funil.nome, status: "aberto" });
    }
  }
  return [...mapa.values()].slice(0, 30);
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
    // plano 1000 · CA-287: escolher redesenha os chips (dia → horários): o foco segue para o NOVO marcado, senão fica num botão que saiu da tela
    const marcado = grupo.querySelector('[role="radio"][aria-checked="true"]');
    if (marcado && marcado !== document.activeElement) try { marcado.focus(); } catch { /* ok */ }
  });
}

/**
 * marcarConsulta(ctx, {negocio, dia, hora, base, aoMudar, soEscolher, config, avisar}) → Promise<resultado | null>.
 * Marcar em 2 toques: com a oportunidade já escolhida (vindo do negócio, da consulta a remarcar ou da grade) a janela abre com os horários livres
 * prontos — dias em chips («Hoje», «Amanhã», «Sex 03/10»), horários em pílulas, o primeiro (ou o mais perto do clique) já selecionado — e «Confirmar» é o 2º toque.
 * Sem oportunidade: busca enquanto digita (setas escolhem na lista, Enter marca o resultado e leva ao horário); escolher o resultado já carrega os horários.
 * Atalhos «Primeiro livre» e «Amanhã de manhã»; «Ver mais 14 dias» estende a lista (CA-173).
 * Confirmar → aviso «Marcada para qui 02/10 às 10:00 · Desfazer» (desmarca, ou volta ao horário anterior se era remarcação); com `avisar`, o aviso
 * oferece «Avisar paciente» (CA-176: rascunho na conversa, nada sai sozinho).
 * negocio: {id | negocio_id, titulo | nome, servico?, funil_nome?, inicio? (consulta atual: é remarcação), estagio_id?, ordem? (etapa atual: o Desfazer devolve o cartão a ela)};
 * dia/hora: o que veio do clique na grade; base: dia aberto na tela; config: a configuração da agenda já em mãos (durações por serviço — CA-169).
 * Plano 1000: soEscolher = true (o modal do CRM) só ESCOLHE o horário e devolve {consulta_em, servico} sem gravar nada.
 */
let seqJanela = 0;
/** Plano 1000b · CB-189: as palavras da Agenda pelo vocabulário da empresa (ctx.vocab: oportunidade/orçamento/venda/negócio; paciente/cliente).
    Sem vocabulário, as de sempre (oportunidade, negócio, paciente). */
export function palavrasAgenda(vocab = null) {
  const v = vocab && typeof vocab.min === "function" ? vocab : null;
  const neg = v ? v.min("negocio") : "oportunidade", fem = v ? v.art("negocio") === "a" : true;
  return {
    neg, negs: v ? v.min("negocios") : "oportunidades", Negs: v ? v.negocios : "Oportunidades",
    aberta: fem ? "aberta" : "aberto", a: fem ? "a" : "o", uma: fem ? "uma" : "um", nenhuma: fem ? "Nenhuma" : "Nenhum", esta: fem ? "Esta" : "Este",
    escolhida: fem ? "escolhida" : "escolhido", abrirNeg: v ? `Abrir ${v.min("negocio")}` : "Abrir negócio",
    contato: v ? v.min("contato") : "paciente", novoContato: v && typeof v.novo === "function" ? v.novo("contato") : "Novo paciente",
  };
}
/** Plano 1000b · CB-150: a busca roda com 2 caracteres de qualquer tipo («quatro números» não era a regra). */
export const LIMITE_DIAS_TXT = "A agenda abre até 180 dias à frente.";
export const TEXTO_BUSCA_CURTA = "Digite pelo menos 2 letras ou números.";
export async function marcarConsulta(ctx, { negocio = null, dia = null, hora = null, base = null, aoMudar = null, soEscolher = false, config = null, avisar = null, aoBloquear = null, busca = "",
  encaixeAgora = false } = {}) {   // plano 1500c · CC-253: «Encaixar agora» (quem chegou sem hora): o horário de agora já vem escolhido como encaixe
  const { ui, api } = ctx;
  if (!ctx.pode("atendente")) {
    // CA-005: quem só vê a agenda (papel leitura) recebe a explicação — antes o atalho «Agenda» não abria nada nem dizia por quê
    if (ui && typeof ui.toast === "function") ui.toast("Seu acesso só permite ver a agenda. Para marcar, peça a alguém da equipe com acesso de atendente.", { tipo: "info" });
    return null;
  }
  const h = ui.h;
  const [Lg] = await Promise.all([logicaDe(ctx), ui.carregarCss("agenda")]);   // o CSS da agenda também vale quando a janela abre pelo CRM (gaveta do negócio)
  const hoje = ui.hojeSP();
  const uid = ++seqJanela;
  const deNegocio = n => ({ id: n.id ?? n.negocio_id ?? null, titulo: n.titulo || n.nome || "Negócio", servico: n.servico || "", funil_nome: n.funil_nome || n.estagio_nome || "",
    consultaAtual: n.inicio || n.consulta_em || null, contato_id: n.contato_id ?? null, nome: n.nome || null,
    antes: n.estagio_id ? { estagio_id: n.estagio_id, ordem: n.ordem ?? null } : null });
  // soEscolher sem negócio (o CRM ainda está criando): os horários vêm sem oportunidade
  let sel = negocio ? deNegocio(negocio) : soEscolher ? { id: null, titulo: "", servico: "", funil_nome: "", consultaAtual: null, contato_id: null, nome: null, antes: null } : null;
  const diaPedido = dia && dia >= hoje ? dia : null;      // o dia que a pessoa pediu (clique na grade ou «+» do dia)
  const aPartirInicial = diaPedido || (base && base >= hoje ? base : hoje);
  let grupos = [], diaSel = null, slotSel = null, duracao = null, seqH = 0, seqB = 0;
  let janelaIni = null, janelaDias = 0;                    // CA-173: o que já foi pedido ao servidor (a partir de, quantos dias)
  let reqAtual = null, reqConteudo = "";
  let btConf = null, focarHoraAoCarregar = false;
  let cfgAgenda = config && typeof config === "object" ? config : null;
  const preferido = dia && hora ? { dia, hora } : null;

  const P = palavrasAgenda(ctx.vocab);   // plano 1000b · CB-189: vocabulário da empresa
  const campoBusca = ui.campo({ rotulo: `Buscar ${P.neg} ${P.aberta}`, nome: "busca", tipo: "busca", placeholder: "Nome ou telefone", ajuda: `A consulta fica vinculada ${P.a === "a" ? "à" : "ao"} ${P.neg} ${P.escolhida}. Setas escolhem na lista.` });
  const inputBusca = campoBusca.querySelector("input");
  const resultados = h("div", { class: "agenda-resultados", role: "listbox", id: `ag-res-${uid}`, "aria-label": `${P.Negs} encontrad${P.a}s` });
  // CA-282: o campo controla a lista (combobox): setas movem a seleção (aria-activedescendant) e Enter escolhe
  inputBusca.setAttribute("role", "combobox");
  inputBusca.setAttribute("aria-controls", resultados.getAttribute("id"));
  inputBusca.setAttribute("aria-autocomplete", "list");
  inputBusca.setAttribute("aria-expanded", "false");
  // CA-170: paciente novo no balcão — cria a oportunidade sem sair da janela (a mesma gaveta do CRM) e ela já fica escolhida
  const btNovo = typeof ctx.novoNegocio === "function" && !soEscolher
    ? h("button", { type: "button", class: "bt bt-fant bt-p ag-novo-paciente", on: { click: () => novoPaciente() } }, ui.icone("mais"), P.novoContato) : null;
  const maisRes = h("div", { class: "agenda-res-mais-caixa" });     // plano 1000b · CB-170: «Ver mais» da busca
  const secBusca = h("section", { class: "agenda-busca" }, campoBusca, resultados, maisRes, btNovo);
  // plano 1000 · CA-215: o admin que tocou num horário vazio da grade pode FECHAR o horário em vez de marcar (sem ir às Configurações)
  let fecharJanela = null;
  const btBloquear = typeof aoBloquear === "function" && dia && hora && !negocio && !soEscolher && ctx.pode("admin")
    ? h("button", { type: "button", class: "bt bt-fant bt-p ag-bloquear-horario", on: { click: () => { if (fecharJanela) fecharJanela(null); aoBloquear({ dia, hora }); } } },
      ui.icone("fechar"), `Bloquear este horário (${hora})`)
    : null;
  const escolhido = h("div", { class: "agenda-escolhido-l" });
  const servicoEl = ui.campo({ rotulo: "Serviço", nome: "servico", valor: sel && sel.servico || "", max: 80, placeholder: "Ex.: avaliação, limpeza", ajuda: `Define a duração; vazio = o d${P.a} ${P.neg}.` });
  const servInput = servicoEl.querySelector("input");
  // CA-169: os serviços com duração própria (configuração da agenda) aparecem como sugestão; nome diferente avisa que vale a duração padrão
  const listaServ = h("datalist", { id: `ag-serv-${uid}` });
  servInput.setAttribute("list", listaServ.getAttribute("id"));
  const avisoServ = h("p", { class: "campo-ajuda ag-serv-aviso", "aria-live": "polite" });
  // plano 1500c · CC-204: no toque o datalist quase não aparece — os serviços da configuração viram chips acima do campo (o CSS mostra só no toque)
  const chipsServ = h("div", { class: "ag-serv-chips", role: "group", "aria-label": "Serviços cadastrados" });
  const outraData = ui.campo({ rotulo: "Ver a partir de", nome: "data", tipo: "data", valor: aPartirInicial });
  outraData.querySelector("input").setAttribute("min", hoje);   // plano 1000b · CB-169: o seletor não oferece dia passado
  // plano 1500c · CC-202: retorno em 1 semana, 15 ou 30 dias sem contar no calendário
  const retornos = h("div", { class: "ag-retornos", role: "group", "aria-label": "Retorno em" },
    [[7, "Em 1 semana"], [15, "15 dias"], [30, "30 dias"]].map(([n, rot]) => h("button", { type: "button", class: "bt bt-fant bt-p ag-retorno", dataset: { dias: String(n) },
      on: { click: () => { outraData.querySelector("input").value = diaISO(hoje, n); aoTrocarData(); } } }, rot)));
  // plano 1500c · CC-245: a observação da consulta («trazer exames») vai junto (p_observacao: o servidor grava na nota da marcação)
  const obsEl = soEscolher ? null : ui.campo({ rotulo: "Observação (opcional)", nome: "observacao", max: 200, placeholder: "Ex.: trazer exames" });
  const atalhos = h("div", { class: "ag-atalhos" });
  const diasEl = h("div", { class: "ag-dias", role: "radiogroup", "aria-label": "Dia" });
  const horasEl = h("div", { class: "ag-horas", role: "radiogroup", "aria-label": "Horário" });
  const maisEl = h("button", { type: "button", class: "bt bt-fant bt-p ag-mais-dias", hidden: true, on: { click: () => verMaisDias() } }, "Ver mais 14 dias");
  const info = h("p", { class: "campo-ajuda ag-info", role: "status", "aria-live": "polite" });
  // o dia pedido não tem vaga e a janela abriu em outro: avisa com destaque (senão «Confirmar», o 2º toque, marcaria no dia errado)
  const outroDiaTxt = h("span");
  const outroDia = h("p", { class: "aviso aviso-aten ag-outro-dia", role: "status", hidden: true }, ui.icone("info"), outroDiaTxt);
  // CA-193: supervisor+ pode encaixar num horário que acabou de lotar (p_encaixe), com o aviso de capacidade
  const encaixeChk = h("input", { type: "checkbox", name: "encaixe" });
  const encaixeEl = h("label", { class: "ag-encaixe", hidden: true }, encaixeChk, h("span", null, "Encaixar mesmo assim (passa da capacidade deste horário)"));
  const statusEl = h("p", { class: "crm-status", role: "status", "aria-live": "polite", hidden: true });
  const faltaEl = h("p", { class: "campo-ajuda ag-falta", id: `ag-falta-${uid}` });
  // CA-172: dois passos — «Quem» e, depois de escolher, «Quando» (serviço, data e horários só aparecem com a oportunidade escolhida)
  const passo = (n, t) => h("h3", { class: "ag-passo" }, h("span", { class: "ag-passo-n dado", "aria-hidden": "true" }, String(n)), t);
  const quem = h("section", { class: "ag-quem", "aria-label": "Quem", hidden: soEscolher && !(sel && sel.id) }, passo(1, "Quem"), secBusca, escolhido, btBloquear);
  const quando = h("section", { class: "ag-quando", "aria-label": "Quando", hidden: !sel },
    soEscolher && !(sel && sel.id) ? null : passo(2, "Quando"),
    chipsServ, h("div", { class: "agenda-form-grade" }, servicoEl, outraData), avisoServ, listaServ, retornos, outroDia, atalhos, diasEl, horasEl, maisEl, info, encaixeEl, obsEl);   // plano 1500c · CC-202/CC-204/CC-245
  const formulario = h("form", { class: "agenda-form", novalidate: true }, quem, quando, statusEl, faltaEl);
  const avisarOutroDia = txt => { outroDiaTxt.textContent = txt || ""; outroDia.hidden = !txt; };
  radiosComSetas(diasEl); radiosComSetas(horasEl);
  const servicoValor = () => servInput.value.trim();
  const dataValor = () => outraData.querySelector("input").value || hoje;

  /* ---------- CA-169: durações por serviço ---------- */
  function avisarServico() {
    const dur = cfgAgenda && cfgAgenda.duracoes && typeof cfgAgenda.duracoes === "object" ? cfgAgenda.duracoes : null;
    const v = servicoValor();
    if (!v || !dur || !Object.keys(dur).length) { avisoServ.textContent = ""; return; }
    const k = Object.keys(dur).find(n => normServico(n) === normServico(v));
    ui.limpar(avisoServ);
    if (k) { avisoServ.textContent = `Duração de «${k}»: ${dur[k]} min.`; return; }
    // plano 1500c · CC-203: «Avalição» não vira serviço novo sem a pessoa saber — «Quis dizer Avaliação?» troca num toque
    const parecido = servicoParecido(v, Object.keys(dur));
    avisoServ.append(`Serviço sem duração própria: ${Number(cfgAgenda.duracao_min) || 30} min (padrão).`);
    if (parecido) avisoServ.append(" ", h("button", { type: "button", class: "bt-link ag-serv-parecido", on: { click: () => { servInput.value = parecido; avisarServico(); if (sel) { ultimoServicoLido = parecido; carregarHorarios(); } } } }, `Quis dizer ${parecido}?`));
  }
  function pintarServicos() {
    ui.limpar(listaServ);
    ui.limpar(chipsServ);
    // plano 1000b · CB-185: a sugestão mostra a duração («Avaliação · 30 min»); o valor continua só o nome
    const servs = Object.entries((cfgAgenda && cfgAgenda.duracoes) || {});
    for (const [nome, min] of servs) listaServ.appendChild(h("option", { value: nome, label: Number(min) > 0 ? `${nome} · ${min} min` : nome }));
    // CC-204: os 6 primeiros da configuração em chips (44 px no toque)
    for (const [nome] of servs.slice(0, 6)) chipsServ.appendChild(h("button", { type: "button", class: "ag-serv-chip", dataset: { servico: nome },
      on: { click: () => { servInput.value = nome; avisarServico(); if (sel) { ultimoServicoLido = nome; carregarHorarios(); } } } }, nome));
    chipsServ.hidden = !servs.length;
    avisarServico();
  }
  pintarServicos();
  if (!cfgAgenda) {
    Promise.resolve(api.rpcC("nx_agenda_dia", { p_data: hoje, p_dias: 1 }, { cache: true }))
      .then(r => { if (r && r.config && typeof r.config === "object") { cfgAgenda = r.config; pintarServicos(); } }).catch(() => { /* sem a configuração: sem sugestões */ });
  }
  servInput.addEventListener("input", avisarServico);

  /* ---------- CA-171: «Confirmar» só vale com a oportunidade e o horário ---------- */
  // plano 1500c · CC-199: vindo da busca, «Confirmar» espera a ficha (no máximo 1,5 s) — o aviso «será remarcada» aparece antes do 2º toque
  let fichaPendente = false;
  function atualizarConfirmar() {
    const falta = !sel ? `Escolha ${P.a} ${P.neg}.` : !slotSel ? "Escolha um dia e um horário livre." : fichaPendente ? "Conferindo se já tem consulta marcada…" : "";
    faltaEl.textContent = falta;
    if (!btConf) return;
    btConf.setAttribute("aria-disabled", String(!!falta));
    btConf.setAttribute("aria-describedby", faltaEl.getAttribute("id"));
  }

  function pintarEscolhido() {
    ui.limpar(escolhido);
    secBusca.hidden = !!sel;
    escolhido.hidden = !sel || (soEscolher && !sel.id);
    quando.hidden = !sel;
    atualizarConfirmar();
    if (!sel || (soEscolher && !sel.id)) return;
    escolhido.append(h("div", { class: "linha agenda-escolhido-topo" },
      h("p", { class: "agenda-escolhido", role: "status" }, `${sel.titulo}${sel.funil_nome ? ` · ${sel.funil_nome}` : ""}`),
      negocio ? null : h("button", { type: "button", class: "bt bt-fant bt-p", on: { click: () => { sel = null; slotSel = null; grupos = []; diaSel = null; ui.limpar(atalhos); ui.limpar(diasEl); ui.limpar(horasEl); maisEl.hidden = true; info.textContent = ""; avisarOutroDia(null); pintarEscolhido(); inputBusca.focus(); } } }, "Trocar")));
    if (sel.consultaAtual && Date.parse(sel.consultaAtual) > Date.now()) {
      escolhido.append(h("p", { class: "aviso aviso-aten" }, ui.icone("info"), h("span", null, `Já tem consulta marcada para ${ui.dataHoraBR(sel.consultaAtual)}. Ao confirmar, ela será remarcada.`)));
    }
  }

  /* ---------- horários: chips de dia, pílulas de hora, atalhos ---------- */
  function selecionarSlot(slot) {
    slotSel = slot || null;
    diaSel = slot ? slot.dia : (grupos[0] && grupos[0].dia) || null;
    // plano 1500c · CC-299/CC-318: escolher um horário LOTADO (só supervisor+) já liga o encaixe, com o aviso; outro horário desliga
    const lotado = !!(slot && slot.livre === false);
    encaixeChk.checked = lotado; encaixeEl.hidden = !lotado;
    desenharAtalhos(); desenharDias(); desenharHoras();
    // plano 1500c · CC-049: «horário de Brasília», o mesmo nome dos Departamentos (cv-config)
    info.textContent = slot ? `${rotuloDoDia(slot.dia, hoje)}, ${ui.horaBR(slot.inicio)} · duração prevista ${ui.num(duracao)} min · horário de Brasília${lotado ? " · encaixe" : ""}` : "";
    atualizarConfirmar();
  }
  function desenharAtalhos() {
    ui.limpar(atalhos);
    const pl = primeiroLivre(grupos), am = amanhaDeManha(grupos, hoje);
    // plano 1500c · CC-201: «Hoje à tarde» e «Próxima semana», os pedidos mais comuns no telefone (sem repetir o que já é outro atalho)
    const ta = hojeATarde(grupos, hoje), ps = proximaSemana(grupos, hoje);
    const ja = new Set([pl, am].filter(Boolean).map(s => s.inicio));
    const bt = (s, rot, cls, ic = null) => h("button", { type: "button", class: ["bt", "bt-fant", "bt-p", cls, slotSel && s.inicio === slotSel.inicio && "ativo"], on: { click: () => selecionarSlot(s) } }, ic, rot);
    atalhos.append(...[
      pl ? bt(pl, "Primeiro livre", "ag-at-primeiro", ui.icone("relogio")) : null,
      am ? bt(am, "Amanhã de manhã", "ag-at-amanha") : null,
      ta && !ja.has(ta.inicio) ? bt(ta, "Hoje à tarde", "ag-at-tarde") : null,
      ps && !ja.has(ps.inicio) ? bt(ps, "Próxima semana", "ag-at-semana") : null,
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
    // plano 1500c · CC-299: os horários LOTADOS do dia aparecem também («10:00 · lotado»): a recepção sabe que está cheio, não fechado
    const itens = [...(g ? g.itens : []), ...(lotadosPorDia.get(diaSel) || [])].sort((a, b) => a.min - b.min);
    const encaixa = ctx.pode("supervisor") && !soEscolher;
    const diaRot = diaSel ? rotuloDoDia(diaSel, hoje) : "";
    // plano 1500c · CC-200: em Manhã / Tarde / Noite, sem caixa com rolagem própria (a janela rola)
    for (const per of periodosDoDia(itens)) {
      const caixa = h("div", { class: "ag-horas-per", role: "group", "aria-label": per.rotulo }, h("p", { class: "ag-horas-per-tit", "aria-hidden": "true" }, per.rotulo));
      for (const s of per.itens) {
        if (s.livre === false) {
          caixa.appendChild(encaixa
            ? h("button", { type: "button", role: "radio", class: "ag-hora-pill ag-hora-lotada dado", "aria-checked": String(!!(slotSel && s.inicio === slotSel.inicio)), tabindex: slotSel && s.inicio === slotSel.inicio ? "0" : "-1",
              "aria-label": `${diaRot}, ${horaTxt(s.min)}, lotado: escolher marca como encaixe`, title: "Lotado: escolher marca como encaixe", on: { click: () => selecionarSlot(s) } }, horaTxt(s.min), h("small", { class: "ag-hora-vagas", "aria-hidden": "true" }, "lotado"))
            : h("span", { class: "ag-hora-pill ag-hora-lotada dado", "aria-label": `${diaRot}, ${horaTxt(s.min)}, lotado` }, horaTxt(s.min), h("small", { class: "ag-hora-vagas", "aria-hidden": "true" }, "lotado")));
          continue;
        }
        const on = slotSel && s.inicio === slotSel.inicio;
        const vagas = (Number(s.capacidade) || 1) - (Number(s.ocupados) || 0);
        // plano 1500c · CC-320: o nome da pílula diz o dia («Sex 24/10, 10:00, 1 vaga»)
        caixa.appendChild(h("button", { type: "button", role: "radio", class: "ag-hora-pill dado", "aria-checked": String(!!on), tabindex: on ? "0" : "-1", title: `${vagas} vaga${vagas === 1 ? "" : "s"}`,
          "aria-label": `${diaRot ? `${diaRot}, ` : ""}${horaTxt(s.min)}, ${vagas} vaga${vagas === 1 ? "" : "s"}`, on: { click: () => selecionarSlot(s) } }, horaTxt(s.min),
          // plano 1000b · CB-184: horário que aceita mais de um mostra as vagas na pílula (no toque ninguém via o title)
          (Number(s.capacidade) || 1) > 1 ? h("small", { class: "ag-hora-vagas", "aria-hidden": "true" }, `${vagas} ${vagas === 1 ? "vaga" : "vagas"}`) : null));
      }
      horasEl.appendChild(caixa);
    }
  }
  /** CC-299: os horários lotados (livre = false) por dia, guardados ao lado dos livres. */
  const lotadosPorDia = new Map();
  function guardarLotados(horarios, limpar = false) {
    if (limpar) lotadosPorDia.clear();
    for (const s of horarios || []) {
      if (!s || s.livre !== false) continue;
      const p = partesSP(s.inicio);
      if (!p) continue;
      if (!lotadosPorDia.has(p.dia)) lotadosPorDia.set(p.dia, []);
      if (!lotadosPorDia.get(p.dia).some(x => x.inicio === s.inicio)) lotadosPorDia.get(p.dia).push({ ...s, dia: p.dia, min: p.min });
    }
  }
  const argsLivres = de => ({ p_a_partir: de, p_dias: 14, p_servico: servicoValor() || null, p_negocio: sel ? sel.id : null });
  async function carregarHorarios({ inicial = false } = {}) {
    if (!sel) return;
    const minha = ++seqH;
    info.textContent = "Buscando horários livres…";
    avisarOutroDia(null);
    maisEl.hidden = true;
    ui.limpar(atalhos); ui.limpar(diasEl); ui.limpar(horasEl);
    try {
      const de = dataValor();
      // plano 1500c · CC-173: data depois do limite de dias à frente — o motivo é o limite, não a falta de horário
      const alem = avisoAlemDoLimite(de, hoje, cfgAgenda);
      if (alem) {
        grupos = []; slotSel = null; diaSel = null; lotadosPorDia.clear(); atualizarConfirmar();
        info.textContent = `${alem} Escolha uma data até lá (o limite fica em Configurações › Agenda).`;
        return;
      }
      const r = await api.rpcC("nx_agenda_livres", argsLivres(de));
      if (minha !== seqH) return;
      janelaIni = de; janelaDias = 14;
      duracao = r.duracao_min;
      grupos = agruparLivres(r.horarios);
      guardarLotados(r.horarios, true);
      // plano 1500c · CC-172: «Ver mais 14 dias» respeita o limite configurado (dias_a_frente), não os 180 fixos
      maisEl.hidden = !podeVerMais({ janelaIni, janelaDias, hoje, config: cfgAgenda });
      if (encaixeAgora && inicial) {
        // CC-253: o horário de agora (arredondado para cima, de 5 em 5 min) já escolhido como encaixe
        const n = partesSP(new Date());
        const min = n ? Math.min(23 * 60 + 55, Math.ceil((n.min + 1) / 5) * 5) : null;
        if (n && min !== null) {
          const s = { inicio: isoNoFuso(hoje, horaTxt(min)), dia: hoje, min, livre: false, capacidade: 1, ocupados: 1 };
          if (!lotadosPorDia.has(hoje)) lotadosPorDia.set(hoje, []);
          lotadosPorDia.get(hoje).push(s);
          if (!grupos.some(g => g.dia === hoje)) grupos = [{ dia: hoje, itens: [] }, ...grupos];
          selecionarSlot(s);
          info.textContent = `Encaixe agora: hoje às ${horaTxt(min)} (passa da capacidade e da antecedência). Confira e confirme.`;
          return;
        }
      }
      if (!grupos.length) { slotSel = null; diaSel = null; atualizarConfirmar(); info.textContent = "Não há horários livres nos 14 dias a partir desta data. Veja mais dias, tente outra data ou confira as configurações da agenda."; return; }
      let escolha = null;
      if (inicial && preferido) escolha = slotMaisPerto(grupos, preferido.dia, preferido.hora);
      if (!escolha && slotSel) escolha = grupos.flatMap(g => g.itens).find(s => s.inicio === slotSel.inicio) || null;
      selecionarSlot(escolha || primeiroLivre(grupos));
      if (inicial) avisarOutroDia(avisoOutroDia(diaPedido, slotSel, hoje));
      // CA-281: escolheu pelo Enter da busca → o foco vai para o horário (não para «Confirmar»: Enter de novo não marca sem a pessoa ver)
      if (focarHoraAoCarregar) {
        focarHoraAoCarregar = false;
        const pill = horasEl.querySelector('[aria-checked="true"]') || horasEl.querySelector(".ag-hora-pill");
        if (pill) try { pill.focus({ preventScroll: false }); } catch { pill.focus(); }
      }
    } catch (e) {
      if (minha !== seqH) return;
      info.textContent = "";
      ui.limpar(horasEl);
      // plano 1000b · CB-167: erro ao buscar os horários tem «Tentar de novo» (antes era trocar a data ou fechar a janela)
      horasEl.appendChild(h("div", { class: "agenda-erro ag-horas-erro", role: "alert" }, h("p", null, api.mensagemErro(e)),
        h("button", { type: "button", class: "bt bt-sec bt-p ag-tentar-horarios", on: { click: () => carregarHorarios() } }, "Tentar de novo")));
    }
  }
  /** CA-173: mais 14 dias depois do último pedido, somados ao fim da lista (retornos de 30/60 dias sem trocar a data à mão). */
  async function verMaisDias() {
    // plano 1500c · CC-172: o limite é o da configuração (dias_a_frente, até 180), contado de hoje
    if (!sel || !janelaIni || !podeVerMais({ janelaIni, janelaDias, hoje, config: cfgAgenda })) return;
    const minha = ++seqH;
    const de = diaISO(janelaIni, janelaDias);
    maisEl.disabled = true;
    try {
      const r = await api.rpcC("nx_agenda_livres", argsLivres(de));
      if (minha !== seqH) return;
      janelaDias += 14;
      if (duracao == null) duracao = r.duracao_min;
      guardarLotados(r.horarios);
      const novos = agruparLivres(r.horarios).filter(g => !grupos.some(x => x.dia === g.dia));
      grupos = grupos.concat(novos);
      const noLimite = !podeVerMais({ janelaIni, janelaDias, hoje, config: cfgAgenda });
      maisEl.hidden = noLimite;
      // plano 1000b · CB-168: o botão some no limite — o aviso diz por quê
      const limite = noLimite ? ` ${textoLimiteDias(cfgAgenda)}` : "";
      if (!novos.length) { info.textContent = `Nenhum horário livre até ${ui.dataBR ? ui.dataBR(diaISO(janelaIni, janelaDias - 1)) : diaISO(janelaIni, janelaDias - 1)}.${limite}`; return; }
      if (slotSel) { desenharAtalhos(); desenharDias(); } else selecionarSlot(primeiroLivre(grupos));
      const primeiroNovo = diasEl.querySelector(`[data-dia="${novos[0].dia}"]`);
      if (primeiroNovo && primeiroNovo.scrollIntoView) try { primeiroNovo.scrollIntoView({ block: "nearest", inline: "nearest" }); } catch { /* ok */ }
      info.textContent = `${novos.length} ${novos.length === 1 ? "dia novo" : "dias novos"} com horário livre.${limite}`;
    } catch (e) { if (minha === seqH) ui.toast(api.mensagemErro(e), { tipo: "erro" }); }
    finally { maisEl.disabled = false; }
  }
  // plano 1500c · CC-321: digitar o serviço já relê os horários (a duração muda) — antes só ao sair do campo, e a pílula tocada era da duração antiga
  let ultimoServicoLido = servicoValor();
  const releituraServico = () => { if (sel && servicoValor() !== ultimoServicoLido) { ultimoServicoLido = servicoValor(); carregarHorarios(); } };
  const releituraServicoDepois = typeof ui.debounce === "function" ? ui.debounce(releituraServico, 500) : releituraServico;
  servInput.addEventListener("input", releituraServicoDepois);
  servInput.addEventListener("change", () => { if (releituraServicoDepois.cancelar) releituraServicoDepois.cancelar(); if (sel) { ultimoServicoLido = servicoValor(); carregarHorarios(); } });
  function aoTrocarData() {
    // plano 1000b · CB-169: data passada (digitada) vira hoje, com o aviso — o servidor só tem horário de hoje em diante
    const campo = outraData.querySelector("input");
    let aviso = "";
    if (campo.value && campo.value < hoje) { campo.value = hoje; aviso = "Essa data já passou: mostrando a partir de hoje."; }
    if (sel) { slotSel = null; carregarHorarios().then(() => { if (aviso && !info.textContent.startsWith(aviso)) info.textContent = `${aviso} ${info.textContent}`.trim(); }); }
    else if (aviso) info.textContent = aviso;
  }
  outraData.querySelector("input").addEventListener("change", aoTrocarData);

  /* ---------- busca enquanto digita ---------- */
  /** A ficha diz em que etapa a oportunidade está AGORA (o «Desfazer» devolve o cartão a ela) e, na busca, traz o serviço e a consulta atual. */
  let fichaP = null;
  function lerFicha({ completar = false } = {}) {
    const id = sel && sel.id;
    if (id === null || id === undefined) return;
    fichaP = api.rpcC("nx_negocio_ver", { p_id: id }).then(d => {
      if (!d || !d.negocio || !sel || sel.id !== id) return;
      if (d.negocio.estagio_id) sel.antes = { estagio_id: d.negocio.estagio_id, ordem: d.negocio.ordem ?? null };
      if (d.negocio.contato_id != null && sel.contato_id == null) sel.contato_id = d.negocio.contato_id;
      if (!completar) return;
      sel.servico = d.negocio.servico || "";
      sel.consultaAtual = d.negocio.consulta_em || null;
      if (!servInput.value && sel.servico) { servInput.value = sel.servico; avisarServico(); }
      pintarEscolhido();
    }).catch(() => { /* sem a ficha: segue só com os horários */ });
  }
  function escolher(item, { teclado = false } = {}) {
    sel = { id: item.id, titulo: item.titulo || item.contato_nome || "Negócio", servico: "", funil_nome: item.estagio_nome || "", consultaAtual: null, contato_id: item.contato_id ?? null, nome: item.contato_nome || null, antes: null };
    focarHoraAoCarregar = teclado;
    fichaPendente = true;     // CC-199
    pintarEscolhido();
    carregarHorarios({ inicial: true });
    // a ficha traz o serviço e a consulta atual (se houver, o aviso de que será remarcada); a duração já vem do servidor pelo negócio
    lerFicha({ completar: true });
    const meu = sel;
    const soltar = () => { if (sel === meu && fichaPendente) { fichaPendente = false; atualizarConfirmar(); } };
    Promise.race([fichaP || Promise.resolve(), new Promise(r => setTimeout(r, 1500))]).then(soltar, soltar);
  }
  /** CC-198: retorno de quem já foi atendido — a gaveta do CRM cria a oportunidade com o mesmo contato e ela já fica escolhida. */
  async function marcarRetorno(g) {
    try {
      await ctx.novoNegocio({ ...(g.contato_id != null ? { contato_id: g.contato_id } : {}), nome: g.contato_nome || g.titulo || "" }, { aoCriar: n => {
        if (!n || n.atualizado || n.id === null || n.id === undefined) return;
        escolher({ id: n.id, titulo: n.titulo || n.nome || g.contato_nome || "Retorno", estagio_nome: n.estagio_nome || "", contato_id: n.contato_id ?? g.contato_id ?? null, contato_nome: n.contato_nome || g.contato_nome || null });
      } });
    } catch (e) { ui.toast(api.mensagemErro(e), { tipo: "erro" }); }
  }
  async function novoPaciente() {
    const q = inputBusca.value.trim();
    const dados = /^[\d\s()+-]+$/.test(q) ? { telefone: q } : q ? { nome: q } : {};   // o CRM pode usar para começar preenchido
    try {
      await ctx.novoNegocio(dados, { aoCriar: n => {
        if (!n || n.atualizado || n.id === null || n.id === undefined) return;
        escolher({ id: n.id, titulo: n.titulo || n.nome || q || "Novo paciente", estagio_nome: n.estagio_nome || "", contato_id: n.contato_id ?? null, contato_nome: n.contato_nome || n.nome || null });
      } });
    } catch (e) { ui.toast(api.mensagemErro(e), { tipo: "erro" }); }
  }
  let ativo = -1;
  const opcoesBusca = () => resultados.querySelectorAll(".agenda-resultado");
  function marcarAtivo(i) {
    const ops = opcoesBusca();
    ativo = ops.length ? Math.max(0, Math.min(ops.length - 1, i)) : -1;
    ops.forEach((o, k) => o.setAttribute("aria-selected", String(k === ativo)));
    if (ativo >= 0) {
      inputBusca.setAttribute("aria-activedescendant", ops[ativo].getAttribute("id"));
      if (ops[ativo].scrollIntoView) try { ops[ativo].scrollIntoView({ block: "nearest" }); } catch { /* ok */ }
    } else inputBusca.removeAttribute("aria-activedescendant");
  }
  let achados = [];
  async function buscarAgora() {
    const q = inputBusca.value.trim();
    const minha = ++seqB;
    ui.limpar(resultados); ui.limpar(maisRes);
    achados = []; ativo = -1; inputBusca.removeAttribute("aria-activedescendant"); inputBusca.setAttribute("aria-expanded", "false");
    if (q.length < 2) { if (q.length) resultados.appendChild(h("p", { class: "campo-ajuda" }, TEXTO_BUSCA_CURTA)); return; }
    resultados.setAttribute("aria-busy", "true");
    try {
      const todos = await procurarNegocios(ctx, q);
      if (minha !== seqB) return;
      ui.limpar(resultados);
      const itens = todos.filter(n => n.status !== "ganho");
      const ganhos = btNovo ? todos.filter(n => n.status === "ganho") : [];
      // plano 1500c · CC-198: «Já atendidos» (negócio ganho) com «Marcar retorno»: cria a oportunidade nova já com o contato e a escolhe
      if (ganhos.length) {
        maisRes.appendChild(h("div", { class: "ag-ja-atendidos" }, h("p", { class: "ag-ja-atendidos-tit" }, "Já atendidos"),
          ganhos.slice(0, 5).map(g => h("div", { class: "ag-ja-atendido" }, h("span", null, h("b", null, g.contato_nome || g.titulo || P.contato), g.titulo && g.titulo !== g.contato_nome ? h("small", null, ` · ${g.titulo}`) : null),
            h("button", { type: "button", class: "bt bt-sec bt-p ag-retorno-bt", on: { click: () => marcarRetorno(g) } }, "Marcar retorno")))));
      }
      if (!itens.length) { resultados.appendChild(h("p", { class: "campo-ajuda" }, btNovo ? `${P.nenhuma} ${P.neg} ${P.aberta} com esse nome. Toque em «${P.novoContato}» para cadastrar.` : `${P.nenhuma} ${P.neg} ${P.aberta} com esse nome. Crie ou atualize pelo CRM.`)); return; }
      // plano 1500c · CC-197: o final do telefone separa homônimos («Maria Silva · final 4321»), quando a busca trouxer o número
      const finalTel = item => { const d = String(item.telefone || item.contato_telefone || "").replace(/\D/g, ""); return d.length >= 4 ? `final ${d.slice(-4)}` : null; };
      const opcao = (item, i) => h("button", { type: "button", class: "agenda-resultado", role: "option", id: `ag-res-${uid}-${i}`, tabindex: "-1", "aria-selected": "false", on: { click: () => escolher(item) } },
        h("b", null, item.titulo || item.contato_nome || "Negócio"),
        h("small", null, [item.contato_nome && item.contato_nome !== item.titulo ? item.contato_nome : null, finalTel(item), item.estagio_nome].filter(Boolean).join(" · ")));
      // plano 1000b · CB-170: 8 à vista e «Ver mais» com o resto (as setas andam só nas que aparecem: achados = o que está na lista)
      achados = itens.slice(0, 8);
      achados.forEach((item, i) => resultados.appendChild(opcao(item, i)));
      if (itens.length > achados.length) {
        const verMais = h("button", { type: "button", class: "bt bt-fant bt-p agenda-res-mais", on: { click: () => {
          const ja = achados.length;
          achados = itens.slice();
          verMais.remove();
          for (let i = ja; i < itens.length; i++) resultados.appendChild(opcao(itens[i], i));
          resultados.dataset.n = String(itens.length);
          marcarAtivo(ja);
          try { inputBusca.focus(); } catch { /* ok */ }      // o combobox continua no campo; a 1ª nova fica escolhida (aria-activedescendant)
        } } }, `Ver mais ${itens.length - achados.length}`);
        maisRes.appendChild(verMais);   // fora do listbox (só opções lá dentro)
      }
      resultados.dataset.n = String(achados.length);
      inputBusca.setAttribute("aria-expanded", "true");
    } catch (e) { if (minha === seqB) { ui.limpar(resultados); resultados.appendChild(h("p", { class: "agenda-erro" }, api.mensagemErro(e))); } }
    finally { if (minha === seqB) resultados.removeAttribute("aria-busy"); }
  }
  const buscarDepois = ui.debounce(buscarAgora, 300);
  inputBusca.addEventListener("input", buscarDepois);
  inputBusca.addEventListener("keydown", ev => {
    if (ev.key === "ArrowDown" || ev.key === "ArrowUp") {
      if (!opcoesBusca().length) return;
      ev.preventDefault();
      marcarAtivo(ativo < 0 ? (ev.key === "ArrowDown" ? 0 : opcoesBusca().length - 1) : ativo + (ev.key === "ArrowDown" ? 1 : -1));
      return;
    }
    if (ev.key !== "Enter") return;
    ev.preventDefault();
    if (ativo >= 0 && achados[ativo]) { escolher(achados[ativo], { teclado: true }); return; }
    if (buscarDepois.cancelar) buscarDepois.cancelar();
    buscarAgora().then(() => { if (achados.length === 1) escolher(achados[0], { teclado: true }); else if (achados.length > 1) marcarAtivo(0); });
  });

  /* ---------- a janela ---------- */
  pintarEscolhido();
  const titulo = soEscolher ? "Escolher horário da consulta" : encaixeAgora ? "Encaixar agora" : sel && sel.consultaAtual ? "Remarcar consulta" : "Marcar consulta";
  const modal = ui.modal({
    titulo, corpo: formulario, largura: "m",
    descricao: soEscolher ? `Escolha o dia e o horário. A consulta é gravada junto com ${P.a} ${P.neg}.` : "Escolha o dia e o horário. A disponibilidade é validada de novo ao salvar.",
    aoAbrir: a => {
      fecharJanela = a && typeof a.fechar === "function" ? v => a.fechar(v) : null;
      btConf = a && a.el ? a.el.querySelector('.modal-rod [data-tipo="primario"]') : null;
      if (btConf) btConf.classList.add("ag-confirmar");
      atualizarConfirmar();
      if (!sel) {
        // plano 1000b · CB-124: vindo da Conversa sem negócio único, a busca já começa com o nome do contato (a pessoa só escolhe)
        const q = typeof busca === "string" ? busca.trim().slice(0, 80) : "";
        if (q && !soEscolher) { inputBusca.value = q; buscarAgora().then(() => { if (achados.length) marcarAtivo(0); }); }
        return;
      }
      carregarHorarios({ inicial: true });
      if (!sel.antes) lerFicha();        // quem abriu a janela não disse a etapa: lê agora, enquanto a pessoa escolhe o horário
      // oportunidade já escolhida: o foco vai direto para «Confirmar consulta» (Enter = o 2º toque)
      if (btConf) try { btConf.focus({ preventScroll: true }); } catch { /* ok */ }
    },
    acoes: [
      { rotulo: "Cancelar", tipo: "neutro", valor: false },
      { rotulo: soEscolher ? "Usar este horário" : "Confirmar consulta", tipo: "primario", fn: async m => {
        if (!sel) { m.erro(`Escolha ${P.uma} ${P.neg} ${P.aberta} para continuar.`); return false; }
        if (!slotSel) { m.erro("Escolha um dia e um horário livre."); return false; }
        if (fichaPendente) { m.erro("Conferindo se já tem consulta marcada… toque de novo em um instante."); return false; }   // plano 1500c · CC-199
        if (soEscolher) return { ok: true, consulta_em: slotSel.inicio, servico: servicoValor() || null };
        try {
          // a etapa de antes ainda está chegando? espera um instante (no máximo 1,5 s): depois de marcar o cartão já estará em «Agendada»
          if (!sel.antes && fichaP) await Promise.race([fichaP, new Promise(r => setTimeout(r, 1500))]);
          const params = { p_negocio: sel.id, p_inicio: slotSel.inicio, p_servico: servicoValor() || null };
          if (!encaixeEl.hidden && encaixeChk.checked) params.p_encaixe = true;
          const obs = obsEl ? String(obsEl.querySelector("input").value || "").trim().slice(0, 200) : "";
          if (obs) params.p_observacao = obs;      // plano 1500c · CC-245
          const conteudo = JSON.stringify(params);
          if (conteudo !== reqConteudo) { reqAtual = Lg.novaReq(); reqConteudo = conteudo; }
          const { resultado } = await Lg.escreverComReq(api, "nx_agenda_marcar", params, { req: reqAtual, aoStatus: t => { statusEl.textContent = t; statusEl.hidden = false; } });
          statusEl.hidden = true;
          return erroResposta(resultado);
        } catch (e) {
          statusEl.hidden = true;
          const codigo = e && e.codigo;
          const encaixar = codigo === "horario_ocupado" && ctx.pode("supervisor");
          m.erro(e && e.ambigua ? "Não foi possível confirmar se foi salvo. Toque em «Confirmar consulta» de novo: é seguro, não marca duas vezes."
            : encaixar ? "Esse horário acabou de lotar. Escolha outro ou marque «Encaixar mesmo assim»."
              : codigo === "horario_ocupado" ? "Esse horário acabou de ser ocupado. Escolha outro (a lista foi atualizada)."
                : codigo === "ja_agendada" ? `${P.esta} ${P.neg} já tem uma consulta futura. Atualize a agenda antes de tentar novamente.`
                  : api.mensagemErro(e));
          if (encaixar) { encaixeEl.hidden = false; return false; }            // o horário continua escolhido: a pessoa decide encaixar
          if (!(e && e.ambigua)) { slotSel = null; carregarHorarios(); }      // recusa: traz os horários de novo; dúvida de conexão: o horário escolhido continua valendo
          return false;
        }
      } },
    ],
  });

  const resultado = await modal;
  if (!(resultado && resultado.ok)) return null;
  if (soEscolher) return { consulta_em: resultado.consulta_em, servico: resultado.servico };
  const rotulo = (resultado.consulta && resultado.consulta.rotulo) || ui.dataHoraBR(slotSel && slotSel.inicio);
  const anterior = resultado.remarcada && resultado.anterior ? resultado.anterior.inicio : null;
  const encaixeAntes = resultado.anterior && typeof resultado.anterior.encaixe === "boolean" ? resultado.anterior.encaixe : undefined;
  const servicoMarcado = servicoValor() || null;
  const marcada = { id: sel.id, antes: sel.antes || null, servicoAntes: sel.servico || null };      // o que valia ANTES de marcar
  const consultaNova = { negocio_id: sel.id, contato_id: sel.contato_id ?? null, nome: sel.nome || sel.titulo, servico: servicoMarcado || sel.servico || null,
    inicio: (resultado.consulta && resultado.consulta.inicio) || (slotSel && slotSel.inicio) };
  if (aoMudar) try { aoMudar(resultado); } catch (e) { console.error(e); }
  ui.acaoComDesfazer({
    texto: `${resultado.remarcada ? "Remarcada" : "Marcada"} para ${rotulo}`,
    // CA-176: «Avisar paciente» deixa a confirmação pronta na conversa (rascunho; nada sai sozinho)
    // plano 1000b · CB-123: o botão ESCREVE a confirmação (no campo da conversa, sem enviar) — o rótulo diz isso
    acao: typeof avisar === "function" ? { rotulo: rotuloAvisar("confirmacao", ctx.vocab), fn: () => avisar(consultaNova, "confirmacao") } : undefined,
    reverter: async () => {
      // remarcação volta ao horário (e ao serviço) anterior, como ENCAIXE (voltarAoHorario); consulta nova some
      if (anterior) { const av = avisoVoltaEncaixe(await voltarAoHorario(api, marcada.id, anterior, marcada.servicoAntes || servicoMarcado, encaixeAntes)); if (av) ui.toast(av, { tipo: "info" }); }
      else erroResposta(await api.rpcC("nx_agenda_desmarcar", { p_negocio: marcada.id, p_motivo: "Desfeito logo depois de marcar" }));
      // marcar levou o cartão para «Agendada» (e desmarcar o leva para «Nova»): volta para a etapa em que estava
      if (resultado.etapa && !(await devolverEtapa(api, marcada.id, marcada.antes)))
        ui.toast("A consulta foi desfeita, mas o cartão não voltou para a etapa em que estava. Confira no CRM.", { tipo: "info" });
      if (aoMudar) try { aoMudar(null); } catch (e) { console.error(e); }
    },
  });
  return resultado;
}

/** Plano 1000b · CB-123: o rótulo da ação do aviso depois de marcar/desmarcar — o texto vai para o campo da conversa e a pessoa envia:
    «Escrever confirmação»; desmarcação: «Escrever aviso ao paciente» (cliente/contato pela vertical; sem vocabulário, paciente). */
export function rotuloAvisar(tipo, vocab = null) {
  if (tipo === "confirmacao") return "Escrever confirmação";
  const quem = vocab && typeof vocab.min === "function" ? vocab.min("contato") : "paciente";
  const art = vocab && typeof vocab.art === "function" ? vocab.art("contato") : "o";
  return `Escrever aviso ${art === "a" ? "à" : "ao"} ${quem}`;
}
/** CA-177: motivos padronizados de desmarcação (viram o começo do p_motivo; o detalhe livre continua opcional). */
export const MOTIVOS_DESMARCAR = Object.freeze(["Paciente cancelou", "Vai remarcar", "Erro de marcação", "Clínica cancelou"]);
/** Plano 1500c · CC-322: o chip que diz «não quero dizer o motivo» (vale como escolha; não vai para o p_motivo). */
export const MOTIVO_SEM = "Prefiro não dizer";
/** Plano 1500c · CC-208: os motivos pela vertical («Cliente cancelou», «A empresa cancelou»); sem vocabulário, os de clínica de sempre. */
export function motivosDesmarcar(vocab = null) {
  if (!(vocab && typeof vocab.min === "function" && vocab.vertical && vocab.vertical !== "odonto")) return [...MOTIVOS_DESMARCAR];
  return [`${vocab.contato} cancelou`, "Vai remarcar", "Erro de marcação", "A empresa cancelou"];
}
/** O p_motivo: «Paciente cancelou · viajou» (até 200 caracteres); nada escolhido nem escrito → null. CC-208: `lista` = os motivos da vertical. */
export function motivoDesmarcar(chip, texto, lista = MOTIVOS_DESMARCAR) {
  const validos = [...MOTIVOS_DESMARCAR, ...(Array.isArray(lista) ? lista : [])];
  const t = [chip && chip !== MOTIVO_SEM && validos.includes(chip) ? chip : null, String(texto || "").trim() || null].filter(Boolean).join(" · ");
  return t ? t.slice(0, 200) : null;
}

/** Desmarcar (motivo em chips + detalhe opcional) com «Desfazer»: marcar de volta o mesmo horário. Com `avisar`, «Avisar paciente» (CA-178). */
export async function desmarcarConsulta(ctx, c, { aoMudar = null, avisar = null, aoFaltou = null } = {}) {
  if (!ctx.pode("atendente")) {
    // plano 1500c · CC-331: quem só vê a agenda recebe a mesma explicação do marcar (antes nada acontecia)
    if (ctx.ui && typeof ctx.ui.toast === "function") ctx.ui.toast("Seu acesso só permite ver a agenda. Para desmarcar, peça a alguém da equipe com acesso de atendente.", { tipo: "info" });
    return null;
  }
  const { ui, api } = ctx;
  const h = ui.h;
  let motivoSel = null;
  const motivos = [...motivosDesmarcar(ctx.vocab), MOTIVO_SEM];   // plano 1500c · CC-208 (vertical) e CC-322 («Prefiro não dizer» também é escolha)
  const chips = h("div", { class: "ag-motivos", role: "radiogroup", "aria-label": "Motivo" });
  const botoesMotivo = motivos.map((m, i) => h("button", { type: "button", role: "radio", class: "ag-motivo-chip", "aria-checked": "false", tabindex: i === 0 ? "0" : "-1", dataset: { motivo: m },
    on: { click: () => escolherMotivo(m) } }, m));
  chips.append(...botoesMotivo);
  function escolherMotivo(m) {
    motivoSel = motivoSel === m ? null : m;
    for (const b of botoesMotivo) { const on = b.dataset.motivo === motivoSel; b.setAttribute("aria-checked", String(on)); b.tabIndex = on || (!motivoSel && b === botoesMotivo[0]) ? 0 : -1; }
  }
  radiosComSetas(chips);
  const detalhe = ui.campo({ rotulo: "Detalhe (opcional)", nome: "motivo", tipo: "textarea", max: 160, linhas: 2 });
  // plano 1000b · CB-174: consulta que já passou — o certo costuma ser registrar a falta (desmarcar apaga o histórico do horário)
  let fecharDesmarcar = null;
  const passou = Date.parse(c && c.inicio) < Date.now();
  const avisoPassou = passou ? h("div", { class: "aviso aviso-aten ag-desmarcar-passou", role: "note" }, ui.icone("info"),
    h("span", null, "Essa consulta já passou: para registrar falta use «Faltou»."),
    typeof aoFaltou === "function" ? h("button", { type: "button", class: "bt bt-sec bt-p ag-desmarcar-faltou", on: { click: () => { if (fecharDesmarcar) fecharDesmarcar(null); aoFaltou(c); } } }, "Marcar «Faltou»") : null) : null;
  const r = await ui.modal({
    titulo: "Desmarcar consulta", largura: "p",
    aoAbrir: avisoPassou ? a => { fecharDesmarcar = a && typeof a.fechar === "function" ? v => a.fechar(v) : null; } : undefined,
    corpo: h("div", { class: "pilha" }, h("p", null, `${c.nome || c.titulo || "Esta consulta"} · ${ui.dataHoraBR(c.inicio)}`), avisoPassou,
      h("div", { class: "pilha-p" }, h("p", { class: "ag-motivos-rot" }, "Motivo"), chips), detalhe),
    acoes: [
      { rotulo: "Voltar", tipo: "neutro", valor: false },
      { rotulo: "Desmarcar consulta", tipo: "perigo", fn: async m => {
        const det = detalhe.querySelector("textarea").value;
        // plano 1500c · CC-322: um toque no motivo (ou «Prefiro não dizer») antes de desmarcar — o relatório de motivos nasce com dado
        if (!motivoSel && !String(det || "").trim()) {
          if (m && typeof m.erro === "function") m.erro("Escolha um motivo (ou «Prefiro não dizer»).");
          const b = botoesMotivo[0]; if (b) try { b.focus(); } catch { /* ok */ }
          return false;
        }
        return erroResposta(await api.rpcC("nx_agenda_desmarcar", { p_negocio: c.negocio_id, p_motivo: motivoDesmarcar(motivoSel, det, motivos) }));
      } },
    ],
  });
  if (!(r && r.ok)) return null;
  if (aoMudar) try { aoMudar(r); } catch (e) { console.error(e); }
  ui.acaoComDesfazer({
    texto: `Consulta de ${ui.dataHoraBR(c.inicio)} desmarcada`,
    acao: typeof avisar === "function" && c.contato_id != null ? { rotulo: rotuloAvisar("desmarcacao", ctx.vocab), fn: () => avisar(c, "desmarcacao") } : undefined,   // plano 1000b · CB-123
    reverter: async () => {
      // a consulta estava numa etapa que não é «Agendada» (e por isso o cartão não saiu dela ao desmarcar)? marcar de volta o levaria para «Agendada»:
      // lê a etapa de agora para devolvê-lo a ela depois
      let antes = null;
      if (!r.voltou_para_nova && c.marco !== "agendada") {
        try { const d = await api.rpcC("nx_negocio_ver", { p_id: c.negocio_id }); if (d && d.negocio && d.negocio.estagio_id) antes = { estagio_id: d.negocio.estagio_id, ordem: d.negocio.ordem ?? null }; }
        catch { /* sem a ficha: a consulta volta, a etapa fica a que o servidor escolher */ }
      }
      // marca de volta no MESMO estado (encaixe ou não); se a regra de antecedência recusar (desfazer às 14h a consulta das 15h), volta como encaixe
      const volta = await voltarAoHorario(api, c.negocio_id, c.inicio, c.servico, typeof c.encaixe === "boolean" ? c.encaixe : undefined);
      const avisoEncaixe = avisoVoltaEncaixe(volta);
      if (avisoEncaixe) ui.toast(avisoEncaixe, { tipo: "info" });
      if (antes && volta && volta.etapa) await devolverEtapa(api, c.negocio_id, antes);
      if (aoMudar) try { aoMudar(null); } catch (e) { console.error(e); }
    },
  });
  return r;
}

/** Limpeza da tela aberta (relógio da linha de «agora», ouvinte de largura, comando da paleta). O shell chama desmontar() ao sair da rota. */
let limpezaAtual = null;
let seqTela = 0;
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
  let extras = normalizarExtrasAgenda({});
  let profEscolhido = false;               // plano 1500c · CC-268: a pessoa já escolheu um filtro de profissional alguma vez?
  try { const bruto = JSON.parse(localStorage.getItem(chavePreferencias) || "{}"); extras = normalizarExtrasAgenda(bruto); profEscolhido = !!(bruto && typeof bruto.prof === "string"); } catch { /* padrão */ }
  let filtroProf = extras.prof;            // CA-187: «todos», «eu» ou o id de um profissional
  let mostrarFechados = extras.fechados === "mostrar";   // CA-186
  let atalhosLigados = extras.atalhos !== "desligados";  // plano 1000b · CB-151: T, D, S, M, L, [ e ] podem ser desligados na paleta
  const eu = ctx.sessao && ctx.sessao.conta && ctx.sessao.conta.id != null ? String(ctx.sessao.conta.id) : null;
  let atual = null, chaveAtual = "";
  let sequencia = 0;
  let vivo = true;
  let atualizandoManual = false;
  let mensagemAtualizacao = "";
  let eixoAtual = null;
  let nomesDonos = null;
  let equipe = null;                       // plano 1500c · CC-191/CC-192: a equipe (base.usuarios: id, nome, papel) — filtro e colunas por responsável
  let ultimoHojeTela = hojeInicial;        // plano 1500c · CC-168: o «hoje» do último desenho (a virada do dia relê)
  let assinaturaAtual = "";                // plano 1500c · CC-248: a assinatura barata do que está na tela
  let filtroNome = "";                     // plano 1500c · CC-266: «Filtrar nesta tela»
  let semConfirmar = false;                // plano 1500c · CC-240: o servidor ainda não tem nx_agenda_confirmar
  let redesenhoPendente = false;           // plano 1500c · CC-249: o tique com a aba escondida deixa o redesenho para a volta
  /* plano 1500c · CC-226: «lembrado» fica marcado neste aparelho até o dia seguinte (sem conteúdo da consulta: só negocio|inicio) */
  const chaveLembrados = chavePreferencias ? `${chavePreferencias}:lembrados` : null;
  const lembrados = (() => { try { const v = JSON.parse(localStorage.getItem(chaveLembrados) || "{}"); return v && v.dia === hojeInicial && Array.isArray(v.itens) ? new Set(v.itens) : new Set(); } catch { return new Set(); } })();
  const marcarLembrado = c => { lembrados.add(`${c.negocio_id}|${c.inicio}`); try { if (chaveLembrados) localStorage.setItem(chaveLembrados, JSON.stringify({ dia: ui.hojeSP(), itens: [...lembrados].slice(-200) })); } catch { /* ok */ } };
  let legendaAtivos = new Set();           // chaves destacadas pela legenda (vazio = todas à mostra)
  let proximaAtual = null;                 // a próxima consulta do período carregado (destacada na grade e no resumo)
  let seqBloco = 0;                        // ordem de entrada dos blocos (animação em escada)
  let ultimaLeitura = 0;                   // CA-167: quando a agenda foi lida (a releitura automática e a volta à aba usam)
  let ignorarClique = false;               // o clique que vem logo depois de soltar um arrasto não abre o detalhe
  let Lg = null;                    // crm-logica.js (hrefTel do balão, presença): chega em paralelo com a 1ª leitura; o desenho da rede espera por ele
  const lgPronto = logicaDe(ctx).then(m => { Lg = m; }).catch(() => { /* sem ele o telefone aparece como texto e a presença não aparece */ });
  let semPresenca = false;          // o servidor ainda não tem nx_agenda_presenca: os botões somem nesta tela
  const presencasLidas = new Map(); // «negocio|inicio» → presença lida da ficha (linha de servidor antigo, sem o campo `presenca`)
  const lendoPresenca = new Set();
  const proximasFora = new Map();   // E3: dia de início da busca → {p, pronto, valor} (uma leitura de 7 dias por período, guardada)
  const idTela = String(++seqTela);    // CA-200: ids únicos das abas da faixa e do painel do dia
  let cabecalhoFora = false, barraAtual = null, observadorCab = null;   // CA-204: as setas do cabeçalho saíram da tela? (a barra fixa do celular aparece)
  let ordemServicos = [];           // CA-266: os serviços da configuração, na ordem (cada um com a sua cor)
  let ordemProfAtual = [];          // plano 1000b · CB-175: os profissionais do período, na ordem (cada um com a sua cor)
  let nomesAtuais = {};             // E2: dono_id → nome (dono_nome do servidor; a base do CRM só se faltar)
  let consultaSelecionada = null, desregistrarPresenca = null;   // a consulta do último detalhe aberto (comando «Presença da consulta» da paleta)
  let G = null;                     // graficos.js (números que contam): opcional, a tela não espera por ele
  import(`./graficos.js?v=${encodeURIComponent(ctx.versao)}`).then(m => { G = m; }).catch(() => { /* sem ele os números aparecem prontos */ });

  // M30: ui.cabecalho (sem a empresa em cima); os controles de data e as ações entram no lugar das ações do cabeçalho
  const controles = h("div", { class: "agenda-cab-controles" });
  const cabecalho = ui.cabecalho({ titulo: "Agenda", acoes: controles });
  cabecalho.classList.add("agenda-cab");
  // CA-161: o conteúdo NÃO é região viva (a cada carga, legenda ou relógio o leitor de tela lia a semana inteira); o que muda de período
  // é anunciado por uma frase curta neste status («Semana de 12 a 18/10: 4 consultas»), fora da grade
  const conteudo = h("div", { class: "agenda-conteudo" });
  const anuncio = h("p", { class: "sr-only agenda-anuncio", role: "status", "aria-live": "polite", "aria-atomic": "true" });
  ui.limpar(ctx.alvo);
  ctx.alvo.append(cabecalho, anuncio, conteudo);
  let anunciado = "";
  function anunciar(texto, { repetir = false } = {}) {
    if (!texto || (!repetir && texto === anunciado)) return;
    anunciado = texto;
    anuncio.textContent = "";
    setTimeout(() => { if (vivo) anuncio.textContent = texto; }, 30);
  }
  /** A frase do período em mãos (consultas do período carregado, já com o filtro de profissional). */
  function anunciarPeriodo({ repetir = false } = {}) {
    if (!atual) return;
    const iv = intervalo();
    const lista = filtrarPorProfissional(Array.isArray(atual.consultas) ? atual.consultas : [], filtroProf, eu);
    const fim = diaISO(iv.de, iv.dias);
    const n = lista.filter(c => { const p = c && c.inicio && partesSP(c.inicio); return p && p.dia >= iv.de && p.dia < fim; }).length;
    anunciar(textoAnuncioPeriodo({ modo: !movel && modo === "mes" ? "mes" : modo, de: iv.de, dias: iv.dias, n }), { repetir });
  }

  function gravarPreferencias() {
    try { localStorage.setItem(chavePreferencias, JSON.stringify({ data, modo, agrupar, cor: corPor, em: ui.hojeSP(), prof: filtroProf, fechados: mostrarFechados ? "mostrar" : "ocultar", atalhos: atalhosLigados ? "ligados" : "desligados" })); } catch { /* preferências não bloqueiam a Agenda */ }
  }

  /** O que o servidor precisa devolver: a semana (segunda a domingo) na semana e no celular; o dia só no desktop em «Dia»;
      o mês inteiro em «Mês» (cabe num pedido só: a RPC aceita até 31 dias). */
  function intervalo() {
    if (modo === "lista") return { de: data, dias: 7 };            // CA-269: os 7 dias a partir da data (hoje, ao abrir)
    if (modo === "mes" && !movel) return { de: primeiroDoMes(data), dias: diasNoMes(data) };
    const semanal = modo === "semana" || movel;
    return { de: semanal ? segundaDe(data) : data, dias: semanal ? 7 : 1 };
  }
  const passoDeNavegacao = () => (movel || modo === "lista" ? 7 : modo === "dia" ? 1 : modo === "mes" ? 30 : 7);
  const nomeDoPasso = () => (passoDeNavegacao() === 1 ? "dia" : passoDeNavegacao() === 30 ? "mes" : "semana");

  /* CA-162: os controles são montados UMA vez; navegar só troca rótulo, valor e estado (antes cada carga recriava setas, «Hoje» e Dia/Semana/Mês
     e o foco de quem usa o teclado caía no body a cada clique) */
  const ctl = {};
  function criarControles() {
    ctl.anterior = h("button", { type: "button", class: "bt-icone agenda-anterior", "aria-keyshortcuts": "[", on: { click: () => mover(-1) } }, ui.icone("seta-esq"));
    ctl.proximo = h("button", { type: "button", class: "bt-icone agenda-proximo", "aria-keyshortcuts": "]", on: { click: () => mover(1) } }, ui.icone("seta-dir"));
    ctl.hoje = h("button", { type: "button", class: "bt bt-sec bt-p agenda-hoje", "aria-keyshortcuts": "T", on: { click: () => { data = ui.hojeSP(); gravarPreferencias(); carregar(); } } }, "Hoje");
    ctl.seletor = h("input", { class: "agenda-data", type: "date", value: data, "aria-label": "Escolher data" });
    ctl.seletor.addEventListener("change", () => { if (dataAgendaValida(ctl.seletor.value)) { data = ctl.seletor.value; gravarPreferencias(); carregar(); } });
    const periodo = h("div", { class: "agenda-periodo" }, ctl.anterior, ctl.seletor, ctl.proximo, ctl.hoje);
    ctl.alternador = ui.segmentado({ opcoes: [{ valor: "dia", rotulo: "Dia" }, { valor: "semana", rotulo: "Semana" }, { valor: "mes", rotulo: "Mês" }, { valor: "lista", rotulo: "Lista" }], valor: modo, rotulo: "Visualização da agenda", classe: "agenda-abas",
      aoMudar: id => trocarModo(id) });
    // CA-259: os atalhos D/S/M/L aparecem para o leitor de tela (e na folha «?» pela paleta)
    for (const b of ctl.alternador.querySelectorAll("[data-valor]")) { const t = ATALHO_MODO[b.dataset.valor]; if (t) b.setAttribute("aria-keyshortcuts", t); }
    // celular: o mês abre numa janela (a visão do dia com a faixa da semana continua sendo a tela); CA-269: «Lista» troca a grade pelos próximos dias
    const verMes = h("button", { type: "button", class: "bt bt-sec bt-p agenda-mes-bt", on: { click: abrirMesMovel } }, ui.icone("calendario"), "Mês");
    ctl.lista = h("button", { type: "button", class: "bt bt-sec bt-p agenda-lista-bt", "aria-pressed": String(modo === "lista"), on: { click: () => trocarModo(modo === "lista" ? "semana" : "lista") } }, "Lista");
    // CA-188: «quando é minha consulta?» sem navegar semana a semana
    // plano 1500c · CC-209: «Procurar paciente/cliente» e «Marcar consulta/visita» pela vertical
    const procurar = h("button", { type: "button", class: "bt bt-sec bt-p agenda-procurar", "aria-haspopup": "dialog", on: { click: procurarPaciente } }, ui.icone("busca"), h("span", { class: "agenda-procurar-rot" }, `Procurar ${palavrasAgenda(ctx.vocab).contato}`));
    ctl.atualizar = h("button", { type: "button", class: "bt bt-sec bt-p agenda-atualizar", on: { click: atualizarAgora } }, "Atualizar");
    ctl.estado = h("span", { class: "agenda-atualizacao", role: "status", "aria-live": "polite" });
    // CA-220: «Atualizada às 14:02» sempre à vista (fora da região viva: a releitura de 60 s não é lida em voz alta); cinza depois de 5 min
    ctl.carimbo = h("span", { class: "agenda-atualizada dado", hidden: true });
    ctl.marcar = ctx.pode("atendente") ? h("button", { type: "button", class: "bt bt-prim agenda-marcar", "aria-keyshortcuts": "N", on: { click: () => abrirAgendamento(null, { dia: movel || modo === "dia" ? data : null }) } }, ui.icone("mais"), `Marcar ${palavraCompromisso(ctx.vocab)}`) : null;
    const acoes = h("div", { class: "agenda-acoes" }, ctl.estado, ctl.carimbo, ctl.alternador, h("div", { class: "agenda-vista-movel" }, verMes, ctl.lista), procurar, ctl.atualizar, ctl.marcar);
    controles.append(periodo, acoes);
    observarCabecalho();
  }
  // CA-204: quando as setas de data do cabeçalho saem por cima da tela (descontada a barra do topo), a barra fixa do celular aparece
  function observarCabecalho() {
    if (typeof IntersectionObserver === "function" && ctl.anterior && ctl.anterior.parentNode) {
      try {
        const topo = Number.parseFloat(getComputedStyle(document.documentElement).getPropertyValue("--topo")) || 0;
        observadorCab = new IntersectionObserver(ents => {
          const e = ents[ents.length - 1];
          const fora = !e.isIntersecting && e.boundingClientRect.top < topo + 1;
          if (fora !== cabecalhoFora) { cabecalhoFora = fora; aplicarBarra(); }
        }, { rootMargin: `-${Math.round(topo)}px 0px 0px 0px` });
        observadorCab.observe(ctl.anterior.parentNode);
      } catch { observadorCab = null; }
    }
  }

  /** CA-259/CA-269: troca a visão (abas, atalho D/S/M/L, «Lista» do celular). No celular, «Mês» abre a janela e «Dia»/«Semana» voltam à grade do dia. */
  function trocarModo(id) {
    if (!["dia", "semana", "mes", "lista"].includes(id)) return;
    if (movel && id === "mes") { abrirMesMovel(); return; }
    modo = movel && id === "dia" ? "semana" : id;
    if (modo === "lista" && !dataAgendaValida(data)) data = ui.hojeSP();
    gravarPreferencias();
    carregar();
  }
  /** CA-220: o carimbo da última leitura certa; cinza (e «há N min») quando passou de 5 min sem conseguir reler. */
  function pintarCarimbo() {
    if (!ctl.carimbo || !ultimaLeitura) return;
    const txt = textoCarimbo(ultimaLeitura, Date.now());
    if (ctl.carimbo.textContent !== txt) ctl.carimbo.textContent = txt;
    ctl.carimbo.hidden = false;
    ctl.carimbo.classList.toggle("velha", Date.now() - ultimaLeitura > 5 * 60_000);
  }
  const offline = () => estaOffline(ctx.rede);   // plano 1000b · CB-166: o estado da rede do app primeiro (Wi-Fi sem internet), o navigator de reserva
  function montarCabecalho() {
    if (!ctl.anterior) { criarControles(); aplicarAtalhos(); }   // plano 1000b · CB-151: atalhos e comandos conforme a preferência
    const passo = nomeDoPasso();
    const ehLista = modo === "lista";
    ctl.anterior.setAttribute("aria-label", ehLista ? "7 dias antes" : passo === "dia" ? "Dia anterior" : passo === "mes" ? "Mês anterior" : "Semana anterior");
    ctl.proximo.setAttribute("aria-label", ehLista ? "Próximos 7 dias" : passo === "dia" ? "Próximo dia" : passo === "mes" ? "Próximo mês" : "Próxima semana");
    // CA-261: já no período de hoje, «Hoje» fica neutro e diz isso (aria-current); fora dele, é o atalho de volta
    const iv = intervalo(), hojeAgora = ui.hojeSP();
    const temHoje = movel && modo !== "lista" ? data === hojeAgora : periodoTemHoje(iv.de, iv.dias, hojeAgora);
    if (temHoje) ctl.hoje.setAttribute("aria-current", "date"); else ctl.hoje.removeAttribute("aria-current");
    ctl.hoje.classList.toggle("agenda-hoje-atual", temHoje);
    ctl.hoje.setAttribute("title", temHoje ? "Você já está vendo hoje" : atalhosLigados ? "Voltar para hoje (T)" : "Voltar para hoje");
    ctl.lista.setAttribute("aria-pressed", String(ehLista));
    // CA-263: sem internet, «Marcar consulta» avisa antes de abrir a janela (os horários vêm do servidor)
    if (ctl.marcar) {
      const sem = offline();
      ctl.marcar.setAttribute("aria-disabled", String(sem));
      if (sem) { ctl.marcar.setAttribute("title", "Sem internet: marcar exige conexão"); ctl.marcar.setAttribute("aria-label", "Marcar consulta (sem internet: marcar exige conexão)"); }
      else { ctl.marcar.removeAttribute("title"); ctl.marcar.removeAttribute("aria-label"); }
    }
    pintarCarimbo();
    if (ctl.seletor.value !== data) ctl.seletor.value = data;
    if (typeof ctl.alternador.ativar === "function" && ctl.alternador.valor !== modo) ctl.alternador.ativar(modo);
    // aria-disabled (e não disabled): o botão em uso continua com o foco enquanto atualiza (atualizarAgora já ignora o 2º toque)
    ctl.atualizar.setAttribute("aria-disabled", String(atualizandoManual));
    ctl.atualizar.setAttribute("aria-busy", String(atualizandoManual));
    const rot = atualizandoManual ? "Atualizando…" : "Atualizar";
    if (ctl.atualizar.textContent !== rot) ctl.atualizar.textContent = rot;
    if (ctl.estado.textContent !== mensagemAtualizacao) ctl.estado.textContent = mensagemAtualizacao;
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
      // plano 1500c · CC-327: o erro não fica guardado para sempre — «Tentar de novo» apaga e pede outra vez (voltar ao mês também tenta)
      if (d && d.erro) {
        pedidos.delete(meu);
        caixa.appendChild(h("div", { class: "agenda-erro ag-mes-erro", role: "alert" }, h("p", null, api.mensagemErro(d.erro)),
          h("button", { type: "button", class: "bt bt-sec bt-p ag-mes-tentar", on: { click: () => pintar() } }, "Tentar de novo")));
        return;
      }
      if (d) { preCarregar(mesISO(meu, 1)); return; }      // CC-251: o mês seguinte já vem em segundo plano
      try {
        const r = await ler(meu);
        pedidos.set(meu, r);
      } catch (e) { pedidos.set(meu, { consultas: [], bloqueios: [], config: null, erro: e }); }
      if (vivo && mes === meu && caixa.isConnected) pintar();
    }
    async function ler(meu) {
      const r = await api.rpcC("nx_agenda_dia", { p_data: meu, p_dias: diasNoMes(meu) }, { cache: true });
      return { consultas: Array.isArray(r && r.consultas) ? r.consultas : [], bloqueios: Array.isArray(r && r.bloqueios) ? r.bloqueios : [], config: (r && r.config) || null };
    }
    /** CC-251: pede o mês em segundo plano (sem pintar; o erro não fica guardado). */
    function preCarregar(m) {
      if (pedidos.has(m) || preCarregando.has(m) || !vivo) return;
      preCarregando.add(m);
      ler(m).then(r => { if (!pedidos.has(m)) pedidos.set(m, r); }).catch(() => { /* ao abrir o mês, ele tenta de novo */ }).finally(() => preCarregando.delete(m));
    }
    const preCarregando = new Set();
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
    notasLidas.clear();                   // plano 1500c · CC-328: a última nota também é relida
    const ok = await carregar({ silencioso: true, forcar: true, manual: true });
    if (ok && nomesDonos) releNomes();    // plano 1500c · CC-329: a equipe é relida junto
    if (!vivo) return;
    atualizandoManual = false;
    // CA-220: o carimbo à vista já diz a hora; quem usa leitor de tela ouve a confirmação pelo status do período
    if (ok) { mensagemAtualizacao = ""; anunciar(`Agenda atualizada às ${_horaSP.format(new Date(Date.now()))}.`, { repetir: true }); }
    montarCabecalho();
  }

  function aoTeclaAgenda(ev) {
    if (!atalhosLigados) return;      // plano 1000b · CB-151 (WCAG 2.1.4): leitor de tela em modo navegação e comando de voz não trocam a tela sem querer
    const alvo = ev.target;
    const editando = alvo && (alvo.isContentEditable || /^(INPUT|TEXTAREA|SELECT)$/.test(alvo.tagName) || alvo.closest?.('[role="dialog"],dialog'));
    if (editando || document.querySelector("dialog[open]")) return;
    const acao = acaoTeclaAgenda(ev);
    if (!acao) return;
    ev.preventDefault();
    if (acao === "hoje") { data = ui.hojeSP(); gravarPreferencias(); carregar(); }
    else if (acao === "marcar") { if (ctx.pode("atendente")) abrirAgendamento(null, { dia: movel || modo === "dia" ? data : null }); }   // plano 1500c · CC-300
    else if (acao === "anterior" || acao === "proximo") mover(acao === "anterior" ? -1 : 1);
    else trocarModo(acao);       // CA-259: D/S/M/L
  }
  document.addEventListener("keydown", aoTeclaAgenda);

  async function carregar({ silencioso = false, forcar = false, auto = false } = {}) {
    const iv = intervalo();
    const chave = `${iv.de}|${iv.dias}`;
    montarCabecalho();
    if (!forcar && atual && chave === chaveAtual) { desenhar(); return true; }   // mesmo período já em mãos (ex.: outro dia da mesma semana)
    const minha = ++sequencia;
    if (forcar && !auto) proximasFora.clear();      // marcou, remarcou ou «Atualizar»: a próxima fora do período pode ter mudado (a releitura automática não)
    if (!silencioso || !atual) {
      ui.limpar(conteudo);
      // E5: a forma do que vem — a grade e, no «Dia» (e no celular), o cartão do painel do dia
      const grade = ui.esqueleto("agenda", { cabecalho: false });
      if (!movel && modo === "dia") conteudo.appendChild(h("div", { class: "ag-dia-layout" }, grade, ui.esqueleto("cartao")));
      else conteudo.append(...[grade, movel ? ui.esqueleto("cartao") : null].filter(Boolean));
    }
    try {
      let doCache = false;
      const antes = silencioso && atual && chaveAtual === chave ? atual : null;   // CA-167: a releitura automática só redesenha se algo mudou («Atualizar» sempre refaz)
      const r = await api.rpcC("nx_agenda_dia", { p_data: iv.de, p_dias: iv.dias }, { cache: true, aoCache: dc => {
        // M16/M30: a 1ª pintura é a última agenda guardada para este período; a rede atualiza em seguida
        if (!vivo || minha !== sequencia || atual || !dc || typeof dc !== "object") return;
        atual = dc; chaveAtual = chave; doCache = !!Lg;      // desenhado sem a crm-logica (sem presença): a rede redesenha mesmo igual
        assinaturaAtual = assinaturaAgenda(dc);             // plano 1500c · CC-248
        desenhar();
      } });
      if (!vivo || minha !== sequencia) return false;
      await lgPronto;                                                          // a presença (E1) precisa da crm-logica: já veio em paralelo
      if (!vivo || minha !== sequencia) return false;
      // plano 1500c · CC-248: compara uma assinatura barata (chaves que mudam a tela, num hash) em vez de serializar as duas respostas inteiras
      const assNova = assinaturaAgenda(r);
      const igual = (doCache || (auto && antes && antes === atual)) && assinaturaAtual === assNova;     // nada mudou desde o guardado (ou desde a última leitura): não refaz a grade
      atual = r || { consultas: [], bloqueios: [] };
      assinaturaAtual = assNova;
      chaveAtual = chave;
      // plano 1500c · CC-268: na 1ª vez, quem atende (não admin) e tem consultas próprias abre na «Minha agenda»
      if (!profEscolhido && eu && !ctx.pode("admin") && filtroProf === "todos" && Array.isArray(atual.consultas) && atual.consultas.some(c => c && String(c.dono_id ?? "") === eu)) {
        profEscolhido = true; filtroProf = "eu"; gravarPreferencias();
      }
      // leitura certa: o aviso de agenda guardada/sem conexão não pode ficar preso
      if (mensagemAtualizacao && !mensagemAtualizacao.startsWith("Atualizada às")) { mensagemAtualizacao = ""; montarCabecalho(); }
      if (!igual) desenhar();
      ultimaLeitura = Date.now();
      pintarCarimbo();
      if (!auto) anunciarPeriodo();     // CA-161: a frase curta do período (só quando muda o período; «Atualizar» repete por conta própria)
      return true;
    } catch (e) {
      if (!vivo || minha !== sequencia) return false;
      if (silencioso && atual && chaveAtual === chave) {
        // «sem conexão» só com evidência de rede: comCache vem em QUALQUER erro quando havia cópia guardada (até HTTP 400)
        const semRede = offline();   // plano 1000b · CB-166
        mensagemAtualizacao = semRede ? "Sem conexão · mostrando a última agenda guardada." : "Não foi possível atualizar · a agenda exibida foi mantida.";
        montarCabecalho();
        return false;
      }
      if (e && e.comCache) return false;
      atual = null; chaveAtual = ""; assinaturaAtual = "";
      ui.limpar(conteudo);
      // plano 1500c · CC-237: sem internet e sem cópia guardada, o cartão diz que é a conexão (o erro genérico não dizia)
      conteudo.appendChild(offline()
        ? h("div", { class: "agenda-erro ag-sem-rede", role: "alert" }, ui.icone("info"),
          h("p", null, "Sem internet e nenhuma agenda guardada neste aparelho. Conecte e toque em «Tentar de novo»."),
          h("button", { type: "button", class: "bt bt-sec bt-p ag-sem-rede-tentar", on: { click: () => carregar({ forcar: true }) } }, "Tentar de novo"))
        : ui.erroCartao(e, () => carregar({ forcar: true })));
      return false;
    }
  }

  /* ============================================================ desenho */
  /** Nomes dos responsáveis (da base do CRM; só quando o dia tem 2+ pessoas). */
  let nomesP = null, idsRelidos = new Set();
  async function carregarNomes({ forcar = false } = {}) {
    if (nomesDonos && !forcar) return nomesDonos;
    if (nomesP) return nomesP;
    nomesP = (async () => {
      try {
        const crm = await ctx.carregar("crm");
        // plano 1500c · CC-329: relendo de propósito, a base do CRM em memória é esquecida (senão volta a mesma equipe velha)
        if (forcar && typeof crm.invalidarBase === "function") try { crm.invalidarBase(ctx.cliente && ctx.cliente.id); } catch { /* ok */ }
        const k = await crm.kit(ctx);
        const us = Array.isArray(k.base.usuarios) ? k.base.usuarios : [];
        nomesDonos = Object.fromEntries(us.map(u => [u.id, u.nome]));
        // plano 1500c · CC-191/CC-192: quem atende (não «somente leitura», aprovado) — o filtro e as colunas por responsável usam a equipe
        equipe = us.filter(u => u && u.id != null && u.aprovado !== false && u.papel !== "leitura").map(u => ({ id: String(u.id), nome: u.nome || "Profissional", papel: u.papel || "" }));
      } catch { nomesDonos = {}; equipe = []; }
      nomesP = null;
      return nomesDonos;
    })();
    return nomesP;
  }
  /** Plano 1500c · CC-329: a equipe lida fica velha (profissional novo vira «Responsável»): «Atualizar» e um dono desconhecido sem nome releem —
      em segundo plano, e a tela só redesenha se a equipe mudou de fato. */
  function releNomes() {
    const antes = JSON.stringify([nomesDonos, equipe]);
    return carregarNomes({ forcar: true }).then(() => { if (vivo && atual && JSON.stringify([nomesDonos, equipe]) !== antes) desenhar(); });
  }

  /* CA-163: redesenhar (presença, legenda, «Por serviço», nomes chegando, releitura) não tira o foco de quem usa o teclado nem a rolagem:
     guarda O QUE estava focado (chave estável: data-chave, data-negocio, data-valor) e a rolagem, e devolve depois de desenhar */
  function seletorDoFoco() {
    const el = typeof document !== "undefined" ? document.activeElement : null;
    if (!el || el === conteudo || !el.classList || !conteudo.contains(el)) return null;
    const v = x => String(x ?? "").replace(/["\\]/g, "");
    const neg = el.closest ? el.closest("[data-negocio]") : null;
    const cl = c => el.classList.contains(c);
    if (cl("ag-leg-limpar")) return ".ag-leg-limpar";
    if (cl("ag-leg-chip") && el.dataset.chave) return `.ag-leg-chip[data-chave="${v(el.dataset.chave)}"]`;
    if (el.dataset && el.dataset.valor !== undefined && el.closest) {
      const seg = el.closest(".ag-legenda-por, .agenda-agrupar");
      if (seg) return `.${seg.classList.contains("ag-legenda-por") ? "ag-legenda-por" : "agenda-agrupar"} [data-valor="${v(el.dataset.valor)}"]`;
    }
    if (cl("ag-bloco") && neg) return `.ag-item[data-negocio="${v(neg.dataset.negocio)}"] .ag-bloco`;
    if (cl("ag-mais-bt") && el.closest) { const li = el.closest(".ag-item"); if (li && li.dataset.mais) return `.ag-item[data-mais="${v(li.dataset.mais)}"] .ag-mais-bt`; }
    if (cl("ag-painel-item") && neg) return `.ag-painel-li[data-negocio="${v(neg.dataset.negocio)}"] .ag-painel-item`;
    if (cl("ag-pres-bt") && neg) return `.ag-painel-li[data-negocio="${v(neg.dataset.negocio)}"] .ag-pres-bt[data-estado="${v(el.dataset.estado)}"]`;
    if (cl("ag-col") && el.dataset.chave) return `.ag-col[data-chave="${v(el.dataset.chave)}"]`;
    for (const c of ["ag-fechados-bt", "agenda-filtro-prof", "ag-pres-lote", "ag-painel-imprimir", "agenda-proxima"]) if (cl(c)) return `.${c}`;
    return null;
  }
  function desenhar() {
    const foco = seletorDoFoco();
    const y = typeof scrollY === "number" ? scrollY : null;
    desenharAgora();
    if (y !== null && typeof scrollTo === "function" && Math.abs(scrollY - y) > 1) try { scrollTo({ top: y }); } catch { /* ok */ }
    // plano 1000b · CB-197: «Mostrar todas» some depois do clique — o foco vai para o 1º chip da legenda (antes caía no body)
    const alvo = foco ? (conteudo.querySelector(foco) || (foco === ".ag-leg-limpar" ? conteudo.querySelector(".ag-leg-chip") : null)) : null;
    if (alvo) try { alvo.focus({ preventScroll: true }); } catch { alvo.focus(); }
  }
  function desenharAgora() {
    ui.limpar(conteudo);
    seqBloco = 0;
    // linhas de servidor antigo (sem `presenca`): vale o que já foi lido da ficha (E1)
    const todas = (Array.isArray(atual.consultas) ? atual.consultas : []).map(comPresencaLida);
    const hoje = ui.hojeSP();
    ultimoHojeTela = hoje;            // plano 1500c · CC-168
    // plano 1500c · CC-330: filtro guardado com alguém que saiu da equipe (e sem consulta no período) volta para «todos», com aviso
    if (filtroProf !== "todos" && filtroProf !== "eu") {
      const noPeriodo = todas.some(c => c && String(c.dono_id ?? "") === filtroProf);
      if (!noPeriodo && equipe && !equipe.some(u => u.id === filtroProf)) {
        filtroProf = "todos"; gravarPreferencias();
        ui.toast("O profissional escolhido no filtro não está mais na equipe: mostrando todos.", { tipo: "info" });
      } else if (!noPeriodo && !equipe) carregarNomes().then(() => { if (vivo && atual) desenhar(); });
    }
    // CA-187: o filtro por profissional vale para tudo o que a tela mostra (grade, ocupação, legenda, painel, próxima)
    const consultas = filtrarPorProfissional(todas, filtroProf, eu);
    const bloqueios = Array.isArray(atual.bloqueios) ? atual.bloqueios : [];
    const config = atual.config || {};
    ordemServicos = config.duracoes && typeof config.duracoes === "object" ? Object.keys(config.duracoes) : [];   // CA-266
    ordemProfAtual = ordemProfissionais(todas, nomesDonos ? Object.keys(nomesDonos) : null);   // plano 1000b · CB-175 (revisão: pela equipe)
    // plano 1500c · CC-190: com «todos», a ocupação usa os trechos da clínica inteira quando o servidor mandar (`ocupados`, sem dados pessoais)
    const opOcup = filtroProf === "todos" && Array.isArray(atual.ocupados) ? { ocupados: atual.ocupados } : {};
    const iv = intervalo();
    const carregados = Array.from({ length: iv.dias }, (_, i) => diaISO(iv.de, i));
    const fonte = config.horario_fonte;
    const legendaFonte = fonte === "agenda" ? "Horário da agenda"
      : fonte === "departamento" ? "Horário herdado do departamento"
        : fonte === "padrao" ? "Horário padrão · seg a sex, 8h–18h" : null;
    // plano 1500c · CC-305: no horário padrão, o admin vai direto para configurar
    const fonteEl = !legendaFonte ? null : fonte === "padrao" && ctx.pode("admin")
      ? h("a", { class: "agenda-fonte-link", href: "#/config/agenda", title: "Ajustar em Configurações › Agenda", on: { click: ev => { ev.preventDefault(); ctx.navegar("#/config/agenda"); } } }, legendaFonte, " · ajustar")
      : h("small", null, legendaFonte);
    // plano 1500c · CC-049: «horário de Brasília», o mesmo nome dos Departamentos (cv-config)
    const nota = h("p", { class: "agenda-fuso" }, "Horários no horário de Brasília.");
    proximaAtual = proximaConsulta(consultas);
    // plano 1500c · CC-306: empresa nova (horário padrão e nenhuma consulta) — o admin ganha o roteiro de 3 passos
    const roteiro = ctx.pode("admin") && fonte === "padrao" && !todas.length ? montarRoteiro() : null;

    // mês (desktop): mini-calendário com densidade no lugar da grade; tocar um dia abre o dia
    if (!movel && modo === "mes") {
      eixoAtual = null;
      conteudo.append(...[roteiro, montarMiniCalendario({ h, mes: primeiroDoMes(data), consultas, bloqueios, config, hoje, selecionado: data, num: ui.num, ocupacao: opOcup,
        aoEscolher: iso => { data = iso; modo = "dia"; gravarPreferencias(); carregar(); }, aoMudarMes: delta => mover(delta),
        aoAbrirSemana: iso => { data = iso; modo = "semana"; gravarPreferencias(); carregar(); } }), nota].filter(Boolean));     // CA-270
      return;
    }

    const eixo = eixoDaGrade({ dias: carregados, consultas, config });
    eixoAtual = eixo;

    // o que a tela mostra agora
    let mostrados, titulo;
    const emLista = modo === "lista";    // CA-269
    // CA-186: na semana (desktop), dia fechado pela configuração e sem consulta não ocupa coluna (sábado e domingo fechados espremiam os dias úteis)
    const fechadosVazios = !movel && modo === "semana" ? carregados.filter(iso => diaFechadoVazio(config, iso, consultas)) : [];
    if (emLista) { mostrados = carregados; titulo = `${ui.dataCurtaBR(carregados[0])} — ${ui.dataCurtaBR(carregados[carregados.length - 1])}`; }
    else if (movel) { mostrados = [data]; titulo = nomeDia(data, true); }
    else if (modo === "dia") { mostrados = [data]; titulo = nomeDia(data, true); }
    else {
      mostrados = mostrarFechados || fechadosVazios.length >= carregados.length ? carregados : carregados.filter(iso => !fechadosVazios.includes(iso));
      titulo = `${ui.dataCurtaBR(carregados[0])} — ${ui.dataCurtaBR(carregados[6])}`;
    }
    const visiveis = consultas.filter(c => { const p = c.inicio && partesSP(c.inicio); return p && mostrados.includes(p.dia); });
    const nDentro = visiveis.length;
    const nBloq = bloqueios.filter(b => mostrados.some(d => bloqueiosDoDia([b], d).length)).length;
    const temResponsaveis = todas.some(c => c.dono_id);
    // plano 1500c · CC-192: «Por responsável» mostra também quem da equipe está livre no dia (coluna vazia para tocar e marcar); equipe grande
    // (mais de 8) fica só com quem tem consulta
    const donos = new Set(consultasDoDia(consultas, data).map(c => (c.dono_id != null ? String(c.dono_id) : "sem")));
    if (temResponsaveis && equipe && equipe.length && equipe.length <= 8 && filtroProf === "todos") for (const u of equipe) donos.add(u.id);
    const porDono = !movel && modo === "dia" && donos.size >= 2;
    // E2: os nomes vêm nas linhas (dono_nome); a base do CRM só é lida se alguma linha não trouxer o campo (servidor antigo)
    const precisaNomes = faltamNomes(todas);
    nomesAtuais = { ...(nomesDonos || {}), ...nomesDasConsultas(todas) };
    // revisão 1000b · CB-175: com «cor por profissional», a equipe (base) é lida uma vez — é ela que fixa a cor de cada um
    // plano 1500c · CC-191/CC-192: com responsáveis nas consultas, a equipe também é lida (filtro e colunas mostram quem está sem consulta)
    if ((precisaNomes || corPor === "profissional" || temResponsaveis) && !nomesDonos) carregarNomes().then(() => { if (vivo && atual) desenhar(); });   // os nomes chegam uma vez; a legenda redesenha com eles
    // plano 1500c · CC-329: dono desconhecido e sem nome na linha (profissional cadastrado depois) relê a equipe uma vez
    else if (nomesDonos && !nomesP) {
      const novo = todas.find(c => c && c.dono_id != null && !(typeof c.dono_nome === "string" && c.dono_nome.trim()) && !Object.hasOwn(nomesDonos, String(c.dono_id)) && !idsRelidos.has(String(c.dono_id)));
      if (novo) { idsRelidos.add(String(novo.dono_id)); releNomes(); }
    }
    const ocup = ocupacaoDoPeriodo(visiveis, mostrados, config, bloqueios, opOcup);
    // CA-187: «Profissional» — todos, a minha agenda ou a de cada um (lembrado nas preferências)
    let filtroEl = null;
    if (temResponsaveis || filtroProf !== "todos") {
      // plano 1500c · CC-191: as opções vêm da equipe (quem atende) e de quem tem consulta — o dentista com a semana vazia também aparece
      const ids = [...new Set([...todas.map(c => c.dono_id).filter(x => x != null).map(String), ...(equipe || []).map(u => u.id)])];
      if (filtroProf !== "todos" && filtroProf !== "eu" && !ids.includes(filtroProf)) ids.push(filtroProf);
      const nomeDe = id => nomesAtuais[id] || "Profissional";
      const opcoes = [["todos", "Todos os profissionais"], eu ? ["eu", "Minha agenda"] : null,
        ...ids.filter(id => id !== eu).sort((a, b) => nomeDe(a).localeCompare(nomeDe(b), "pt-BR")).map(id => [id, nomeDe(id)])].filter(Boolean);
      // plano 1000b · CB-173: rótulo visível «Profissional» (o nome acessível é o mesmo texto que se vê)
      const sel = h("select", { class: "agenda-filtro-prof", id: `ag-prof-${idTela}` },
        opcoes.map(([valor, rotulo]) => h("option", { value: valor, selected: valor === filtroProf }, rotulo)));
      sel.value = filtroProf;
      sel.addEventListener("change", () => { filtroProf = sel.value || "todos"; legendaAtivos = new Set(); gravarPreferencias(); desenhar(); anunciarPeriodo(); });
      filtroEl = h("label", { class: "agenda-filtro-prof-rot", for: `ag-prof-${idTela}` }, h("span", null, "Profissional"), sel);
    }
    const nOcultos = !movel && modo === "semana" ? fechadosVazios.length : 0;
    const fechadosBt = nOcultos && nOcultos < carregados.length
      ? h("button", { type: "button", class: "bt bt-fant bt-p ag-fechados-bt", "aria-pressed": String(mostrarFechados),
        on: { click: () => { mostrarFechados = !mostrarFechados; gravarPreferencias(); desenhar(); } } },
        mostrarFechados ? "Só dias de atendimento" : `Mostrar ${nOcultos === 1 ? "o dia fechado" : `os ${nOcultos} dias fechados`}`) : null;

    // próxima consulta: do período carregado (pode ser em outro dia da semana); tocar leva até ela. Sem próxima, o texto diz o período que de fato
    // foi olhado — a semana carregada (semana e celular) ou o dia («Dia» no desktop) — e, com o período já começado, UMA leitura dos 7 dias
    // seguintes (E3, guardada por período) completa: «amanhã às 10:00», «sexta às 14:00» ou «nenhuma nos 7 dias seguintes»
    const proxima = proximaAtual;
    const umDia = iv.dias === 1;
    const chipProxima = proxima
      ? h("button", { type: "button", class: "agenda-proxima", on: { click: () => irParaConsulta(proxima) } },
        h("span", { class: "agenda-proxima-rot" }, "Próxima"), h("b", null, proxima.nome || proxima.titulo || "Consulta"), h("span", { class: "dado agenda-proxima-quando" }, rotuloProxima(proxima, Date.now(), hoje)))
      : h("span", { class: "agenda-proxima agenda-proxima-vazia narr" }, consultas.length
        ? `Nenhuma consulta por vir ${umDia ? "neste dia" : emLista ? "nestes 7 dias" : "nesta semana"}.`
        : `${umDia ? "Dia livre" : emLista ? "7 dias livres" : "Semana livre"} — nenhuma consulta marcada.`);
    const caixaProxima = h("span", { class: "agenda-proxima-caixa" }, chipProxima);
    // CA-262: período sem nenhuma consulta oferece marcar ali mesmo (o celular já tem «Livre · Marcar» no dia)
    const marcarVazio = !nDentro && !movel && !emLista && ctx.pode("atendente")
      ? h("button", { type: "button", class: "bt bt-sec bt-p agenda-marcar-vazio", on: { click: () => abrirAgendamento(null, { dia: modo === "dia" ? data : null }) } }, ui.icone("mais"), `Marcar ${palavraCompromisso(ctx.vocab)}`)
      : null;
    if (!proxima) completarProxima(caixaProxima, { de: inicioBuscaProxima(iv.de, iv.dias, hoje), umDia, hoje, chave: chaveAtual });
    const temHoje = periodoTemHoje(iv.de, iv.dias, hoje) || (movel && data === hoje);
    // plano 1500c · CC-252: «Próximo livre: hoje 15:30» à vista (com o paciente no telefone), que abre a marcação nele
    const caixaLivre = temHoje && ctx.pode("atendente") ? h("span", { class: "agenda-prox-livre-caixa" }) : null;
    if (caixaLivre) completarProximoLivre(caixaLivre, hoje);
    // plano 1500c · CC-253: quem chegou sem hora — supervisor+ encaixa no horário de agora
    const encaixarAgoraBt = temHoje && ctx.pode("supervisor")
      ? h("button", { type: "button", class: "bt bt-fant bt-p agenda-encaixar-agora", on: { click: () => abrirAgendamento(null, { dia: hoje, encaixeAgora: true }) } }, ui.icone("relogio"), "Encaixar agora") : null;
    // plano 1500c · CC-256: a taxa de faltas das consultas já passadas do período; CC-324: quantas a IA marcou
    const tf = taxaFaltas(visiveis);
    const nIA = visiveis.filter(c => c && c.marcado_por === "ia").length;
    // plano 1500c · CC-258/CC-260/CC-266/CC-323: exportar, imprimir a semana, filtrar por nome e a tela da recepção (desktop)
    const ferramentas = h("div", { class: "agenda-ferramentas" },
      visiveis.length ? h("label", { class: "agenda-filtro-nome-rot" }, h("span", { class: "sr-only" }, "Filtrar nesta tela"),
        h("input", { type: "search", class: "agenda-filtro-nome", placeholder: "Filtrar nesta tela", value: filtroNome, autocomplete: "off",
          on: { input: ev => { filtroNome = String(ev.target.value || ""); aplicarFiltroNome(); } } })) : null,
      !movel && visiveis.length ? h("button", { type: "button", class: "bt bt-fant bt-p agenda-exportar", on: { click: () => exportarCSV(visiveis, mostrados) } }, "Exportar CSV") : null,
      !movel && (modo === "semana" || emLista) && visiveis.length ? h("button", { type: "button", class: "bt bt-fant bt-p agenda-imprimir-semana", on: { click: () => imprimirSemana(carregados, consultas, config, bloqueios, hoje) } }, "Imprimir semana") : null,
      !movel && temHoje ? h("button", { type: "button", class: "bt bt-fant bt-p agenda-tv", "aria-haspopup": "dialog", on: { click: abrirTV } }, "Tela da recepção") : null);

    const resumo = h("section", { class: "agenda-resumo", "aria-label": "Resumo do período" },
      h("div", { class: "agenda-resumo-data" },
        h("b", null, titulo), fonteEl),
      filtroEl, fechadosBt,
      porDono ? ui.segmentado({ opcoes: [{ valor: "juntos", rotulo: "Juntos" }, { valor: "responsavel", rotulo: "Por responsável" }], valor: agrupar, tipo: "filtro", rotulo: "Agrupar a agenda do dia", classe: "agenda-agrupar",
        aoMudar: v => { agrupar = v; gravarPreferencias(); desenhar(); } }) : null,
      h("div", { class: "agenda-resumo-num" },
        h("span", null, h("b", { class: "dado", dataset: { valor: String(nDentro) } }, ui.num(nDentro)), ` ${nDentro === 1 ? "consulta" : "consultas"}`),
        h("span", null, h("b", { class: "dado", dataset: { valor: String(nBloq) } }, ui.num(nBloq)), ` ${nBloq === 1 ? "bloqueio" : "bloqueios"}`),
        // plano 1000b · CB-192: com o filtro de profissional a conta é só da agenda filtrada — o rótulo diz isso (a clínica pode estar cheia)
        ocup === null ? null : h("span", { class: "agenda-resumo-ocup", title: filtroProf === "todos" ? "Horas marcadas sobre o expediente dos dias mostrados"
          : `Horas marcadas ${filtroProf === "eu" ? "da sua agenda" : `da agenda de ${nomesAtuais[filtroProf] || "quem foi escolhido"}`} sobre o expediente dos dias mostrados (as dos outros profissionais não entram)` },
          anelOcupacao(h, { pct: ocup }, { tamanho: 22 }), h("b", { class: "dado" }, `${Math.round(ocup * 100)}%`), filtroProf === "todos" ? " ocupado" : filtroProf === "eu" ? " da sua agenda" : " desta agenda"),
        tf ? h("span", { class: "agenda-resumo-faltas", title: "Das consultas que já passaram nos dias mostrados" }, "Faltas: ", h("b", { class: "dado" }, `${Math.round(tf.pct * 100)}%`), ` (${ui.num(tf.faltas)} de ${ui.num(tf.de)})`) : null,
        nIA ? h("span", { class: "agenda-resumo-ia" }, h("b", { class: "dado" }, ui.num(nIA)), ` ${nIA === 1 ? "marcada" : "marcadas"} pela IA`) : null),
      caixaProxima, caixaLivre, marcarVazio, encaixarAgoraBt, ferramentas);

    // legenda das cores: por serviço ou por profissional (a troca só aparece quando há responsáveis nas consultas)
    const itensLegenda = legendaDe(visiveis, { por: corPor, nomes: nomesAtuais, ordem: ordemServicos, ordemProf: ordemProfAtual });
    const legenda = !emLista && (itensLegenda.length >= 2 || legendaAtivos.size) ? h("div", { class: "ag-legenda-linha" },
      temResponsaveis ? ui.segmentado({ opcoes: [{ valor: "servico", rotulo: "Por serviço" }, { valor: "profissional", rotulo: "Por profissional" }], valor: corPor, tipo: "filtro", rotulo: "Cor dos blocos", classe: "ag-legenda-por",
        aoMudar: v => { corPor = v; legendaAtivos = new Set(); gravarPreferencias(); desenhar(); } }) : null,
      montarLegenda({ h, itens: itensLegenda, ativos: legendaAtivos, num: ui.num, avatar: corPor === "profissional" && typeof ui.avatar === "function" ? ui.avatar : null,
        aoAlternar: it => { legendaAtivos = it ? alternarLegenda(legendaAtivos, it) : new Set(); desenhar(); } })) : null;

    // E1: «Compareceu / Faltou» nas consultas que já passaram (servidor sem nx_agenda_presenca → some); E5: vazio com a ilustração da agenda
    const presencaPainel = Lg && !semPresenca ? { L: Lg, aoMarcar: marcarPresenca, aoLote: marcarPresencaLote, icone: ui.icone } : null;
    const contatosLinha = contatosDaLinha(hoje);     // plano 1500c · CC-225/CC-226
    const desmarcadasDia = Array.isArray(atual.desmarcadas) ? atual.desmarcadas.filter(x => x && partesSP(x.inicio) && partesSP(x.inicio).dia === data) : null;   // CC-270
    const painel = () => montarPainelDia({ h, iso: data, consultas, config, hoje, horaBR: ui.horaBR, num: ui.num, pode: ctx.pode("atendente"),
      presenca: presencaPainel, vazio: typeof ui.vazio === "function" ? ui.vazio : null, telBR: typeof ui.telBR === "function" ? ui.telBR : String,
      imprimir: movel ? null : imprimirDia, contatos: contatosLinha, desmarcadas: desmarcadasDia,
      // plano 1500c · CC-261: no celular, «Compartilhar» manda a lista do dia em texto (navigator.share) ao profissional
      compartilhar: movel && typeof navigator !== "undefined" && navigator && typeof navigator.share === "function" ? iso => compartilharDia(iso, consultas, hoje) : null,
      aoAbrir: (c, bt) => abrirDetalhe(c, bt), aoMarcar: iso => abrirAgendamento(null, { dia: iso }) });
    if (presencaPainel) lerPresencasQueFaltam(emLista ? visiveis : consultasDoDia(consultas, data));

    if (emLista) {
      conteudo.append(...[movel ? barraDoDia(hoje, { lista: true }) : null, roteiro, resumo, montarListaDias({ h, dias: carregados, consultas, config, hoje, presenca: presencaPainel, pode: ctx.pode("atendente"),
        aoAbrir: (c, bt) => abrirDetalhe(c, bt), aoMarcar: iso => abrirAgendamento(null, { dia: iso }), horaBR: ui.horaBR, telBR: typeof ui.telBR === "function" ? ui.telBR : String, num: ui.num, uid: idTela,
        bloqueios, contatos: contatosLinha }), nota].filter(Boolean));   // plano 1500c · CC-174: os bloqueios entram na Lista
    } else if (movel) {
      const r = resumoDoDia(consultas, data, config);
      const faixasHoje = faixasDoDia(config, data);
      // CA-203: no celular os 4 cartões de números saem (CSS) e a linha do resumo diz o essencial: «2 consultas · 1 falta · 1 encaixe»
      const lista = h("details", { class: "ag-painel-det", open: r.total > 0 }, h("summary", { class: "ag-painel-sum" }, h("span", null, "Lista do dia"),
        h("span", { class: "ag-painel-sum-n dado" }, textoResumoDia(r, { futuro: data > hoje, num: ui.num, livre: !(Array.isArray(faixasHoje) && !faixasHoje.length) && !diaTodoBloqueado(bloqueios, data) }))), painel());
      // CA-200: a faixa de dias (abas) controla o painel do dia (role=tabpanel, aria-labelledby a aba escolhida)
      const painelDia = h("div", { class: "ag-dia-painel", id: `ag-dia-painel-${idTela}`, role: "tabpanel", "aria-labelledby": `ag-aba-${idTela}-${data}` },
        visaoDoDiaMovel(data, consultas, bloqueios, config, eixo, hoje));
      ligarDeslizar(painelDia);     // plano 1500c · CC-262
      conteudo.append(...[barraDoDia(hoje), roteiro, resumo, legenda, faixaDeDias(carregados, consultas, hoje, config, bloqueios, opOcup), painelDia, lista, nota].filter(Boolean));
    } else {
      let colunas;
      if (modo === "dia" && porDono && agrupar === "responsavel") {
        const nomeCol = d => nomesAtuais[d] || ((equipe || []).find(u => u.id === d) || {}).nome;
        const ordem = [...donos].sort((a, b) => (a === "sem") - (b === "sem") || String(a).localeCompare(String(b)));
        colunas = ordem.map(d => ({ iso: data, chave: String(d), dono: d, rotulo: d === "sem" ? "Sem responsável" : (nomeCol(d) || "Responsável"), titulo: d === "sem" ? "Sem responsável" : (nomeCol(d) || "…"),
          consultas: consultasDoDia(consultas, data).filter(c => (c.dono_id != null ? String(c.dono_id) : "sem") === d), bloqueios: bloqueiosDoDia(bloqueios, data), hoje: data === hoje }));
        if (precisaNomes) carregarNomes().then(n => { if (!vivo) return; for (const t of conteudo.querySelectorAll("[data-dono]")) { const id = t.dataset.dono; if (id !== "sem") t.textContent = nomesAtuais[id] || n[id] || "Responsável"; } });
      } else {
        colunas = mostrados.map(iso => ({ iso, chave: iso, rotulo: `${nomeDia(iso, true)} ${ui.dataBR(iso)}`, consultas: consultasDoDia(consultas, iso),
          bloqueios: bloqueiosDoDia(bloqueios, iso), hoje: iso === hoje }));
      }
      const grade = montarGrade(colunas, eixo, config, { modoDia: modo === "dia", ocupacao: opOcup });
      // «Dia»: a grade e, ao lado, o painel do dia (consultas, concluídas, faltas, encaixes e a lista)
      conteudo.append(...[roteiro, resumo, legenda, modo === "dia" ? h("div", { class: "ag-dia-layout" }, grade, painel()) : grade, nota].filter(Boolean));
    }
    posicionarAgora();
    animarNumeros();
    aplicarFiltroNome();
    if (tvAberta) tvAberta.pintar();     // CC-323: a tela da recepção acompanha a releitura
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

  /** CA-204: celular — ao rolar o dia, as setas e a data do cabeçalho saem da tela: uma barra fina e fixa (sticky) com ‹ dia › e «Hoje» aparece
      enquanto o cabeçalho está fora de vista (sem empurrar o conteúdo: a barra tem altura zero e o miolo flutua). Na «Lista», ‹ › andam 7 dias. */
  function barraDoDia(hoje, { lista = false } = {}) {
    const passo = lista ? 7 : 1;
    const ir = delta => { data = diaISO(data, delta); gravarPreferencias(); carregar(); };
    const rot = lista ? `${ui.dataCurtaBR(data)} — ${ui.dataCurtaBR(diaISO(data, 6))}` : nomeDia(data, true);
    const el = h("div", { class: ["ag-barra-dia", cabecalhoFora && "visivel"], "aria-hidden": cabecalhoFora ? null : "true" },
      h("div", { class: "ag-barra-dia-in" },
        h("button", { type: "button", class: "bt-icone ag-barra-ant", tabindex: cabecalhoFora ? null : "-1", "aria-label": lista ? "7 dias antes" : "Dia anterior", on: { click: () => ir(-passo) } }, ui.icone("seta-esq")),
        h("b", { class: "ag-barra-rot" }, rot),
        h("button", { type: "button", class: "bt-icone ag-barra-prox", tabindex: cabecalhoFora ? null : "-1", "aria-label": lista ? "Próximos 7 dias" : "Próximo dia", on: { click: () => ir(passo) } }, ui.icone("seta-dir")),
        h("button", { type: "button", class: "bt bt-sec bt-p ag-barra-hoje", tabindex: cabecalhoFora ? null : "-1", "aria-current": (lista ? periodoTemHoje(data, 7, hoje) : data === hoje) ? "date" : null,
          on: { click: () => { data = ui.hojeSP(); gravarPreferencias(); carregar(); } } }, "Hoje")));
    barraAtual = el;
    return el;
  }
  /** Mostra/esconde a barra fixa conforme o cabeçalho (as setas de data) sai ou volta à tela. */
  function aplicarBarra() {
    const el = barraAtual;
    if (!el || !el.isConnected) return;
    el.classList.toggle("visivel", cabecalhoFora);
    if (cabecalhoFora) el.removeAttribute("aria-hidden"); else el.setAttribute("aria-hidden", "true");
    for (const b of el.querySelectorAll("button")) { if (cabecalhoFora) b.removeAttribute("tabindex"); else b.setAttribute("tabindex", "-1"); }
  }

  /** Leva a vista até a consulta (troca o dia no celular ou em «Dia», se preciso) e põe o foco no bloco. */
  function irParaConsulta(c) {
    const p = partesSP(c.inicio);
    if (!p) return;
    if (p.dia !== data && (movel || modo === "dia")) { data = p.dia; gravarPreferencias(); montarCabecalho(); desenhar(); }
    // plano 1500c · CC-187: procura o bloco DESTA consulta (pelo negócio); escondida no «+N», o foco vai para o «+N» e a lista abre
    let alvo = blocoDaTela(c.negocio_id);
    let maisBt = null;
    if (!alvo && c.negocio_id != null) {
      const v = String(c.negocio_id);
      const li = [...conteudo.querySelectorAll(".ag-item.ag-mais")].find(x => String(x.dataset.mais || "").split(",").includes(v));
      maisBt = li ? li.querySelector(".ag-mais-bt") : null;
      alvo = maisBt;
    }
    if (!alvo) alvo = conteudo.querySelector(".ag-item.ag-proxima .ag-bloco");
    if (!alvo) return;
    try { alvo.scrollIntoView({ block: "center", behavior: ui.comportamentoRolagem() }); } catch { /* ok */ }
    try { alvo.focus({ preventScroll: true }); } catch { alvo.focus(); }
    if (maisBt) maisBt.click();
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
  function faixaDeDias(dias, consultas, hoje, config = null, bloqueios = [], opOcup = {}) {
    const el = h("div", { class: "ag-faixa", role: "tablist", "aria-label": "Dias da semana" });
    for (const iso of dias) {
      const oc = ocupacaoDoDia(consultas, iso, config, bloqueios, opOcup);   // anel de ocupação atrás do número do dia (item 40); CA-196: sem o horário bloqueado
      const n = oc.n, txtOc = textoOcupacao(oc);
      const sel = iso === data;
      // plano 1500c · CC-332: dia todo bloqueado (feriado) aparece na faixa — classe e «bloqueado» no nome
      const bloq = diaTodoBloqueado(bloqueios, iso);
      el.appendChild(h("button", { type: "button", role: "tab", class: ["ag-faixa-d", sel && "sel", iso === hoje && "hoje", oc.fechado && "fechado", bloq && "bloqueado"], "aria-selected": String(sel), tabindex: sel ? "0" : "-1",
        id: `ag-aba-${idTela}-${iso}`, "aria-controls": `ag-dia-painel-${idTela}`,
        "aria-label": `${nomeDia(iso, true)}, ${n} ${n === 1 ? "consulta" : "consultas"}${bloq ? ", bloqueado" : ""}${txtOc && !bloq ? `, ${txtOc}` : ""}`, dataset: { iso },
        on: { click: () => { const mudou = data !== iso; data = iso; gravarPreferencias(); montarCabecalho(); desenhar();
          // plano 1000b · CB-172: trocar o dia na faixa redesenha sem dizer nada — o status curto diz o dia e quantas consultas
          if (mudou) anunciar(`${nomeDia(iso, true)}: ${n} ${n === 1 ? "consulta" : "consultas"}`); } } },
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
    // plano 1500c · CC-263: setas nas pontas da faixa trocam a semana (antes só as do cabeçalho)
    return h("div", { class: "ag-faixa-caixa" },
      h("button", { type: "button", class: "bt-icone ag-faixa-sem-ant", "aria-label": "Semana anterior", on: { click: () => mover(-1) } }, ui.icone("seta-esq")),
      el,
      h("button", { type: "button", class: "bt-icone ag-faixa-sem-prox", "aria-label": "Próxima semana", on: { click: () => mover(1) } }, ui.icone("seta-dir")));
  }
  /** Plano 1500c · CC-262: no dia do celular, deslizar para o lado (mais de 80 px, quase sem mexer na vertical) troca o dia. */
  function ligarDeslizar(el) {
    let x0 = null, y0 = null;
    el.addEventListener("touchstart", ev => { const t = ev.touches && ev.touches[0]; if (!t || ev.touches.length > 1) { x0 = null; return; } x0 = t.clientX; y0 = t.clientY; }, { passive: true });
    el.addEventListener("touchend", ev => {
      const t = ev.changedTouches && ev.changedTouches[0];
      if (x0 === null || !t) return;
      const dx = t.clientX - x0, dy = t.clientY - y0;
      x0 = null;
      if (Math.abs(dx) < 80 || Math.abs(dy) > Math.abs(dx) / 2 || arrasto) return;
      data = diaISO(data, dx < 0 ? 1 : -1); gravarPreferencias(); carregar();
      anunciar(nomeDia(data, true));
    });
  }

  function visaoDoDiaMovel(iso, consultas, bloqueios, config, eixo, hoje) {
    const itens = consultasDoDia(consultas, iso), travas = bloqueiosDoDia(bloqueios, iso);
    // plano 1500c · CC-176: dia fechado pela configuração não vira «Livre · Marcar» — diz que está fechado e leva ao próximo dia de atendimento
    const faixas = faixasDoDia(config, iso);
    if (!itens.length && !travas.length && Array.isArray(faixas) && !faixas.length) {
      const prox = proximoDiaAberto(config, iso, { bloqueios });
      return h("div", { class: "ag-livre ag-livre-leitura ag-dia-fechado" }, h("span", null, "Fechado neste dia"),
        ctx.pode("atendente") && prox && !(hoje && prox < hoje)
          ? h("button", { type: "button", class: "bt bt-sec bt-p ag-prox-aberto", on: { click: () => abrirAgendamento(null, { dia: prox }) } }, `Marcar ${rotuloDoDia(prox, hoje).toLowerCase()}`) : null);
    }
    if (!itens.length && !travas.length) {
      // plano 1000b · CB-148: dia que já passou não oferece «Marcar» (a janela abria a partir de hoje e a pessoa achava que marcou ontem)
      return ctx.pode("atendente") && !(hoje && iso < hoje)
        ? h("button", { type: "button", class: "ag-livre", on: { click: () => abrirAgendamento(null, { dia: iso }) } }, h("span", null, "Livre"), h("span", { class: "ag-livre-acao" }, ui.icone("mais"), "Marcar"))
        : h("p", { class: "ag-livre ag-livre-leitura" }, "Livre");
    }
    return montarGrade([{ iso, chave: iso, rotulo: `${nomeDia(iso, true)} ${ui.dataBR(iso)}`, consultas: itens, bloqueios: travas, hoje: iso === hoje }], eixo, config, { movel: true });
  }

  /* ---------- a grade ---------- */
  function montarGrade(colunas, eixo, config, { movel: ehMovel = false, modoDia = false, ocupacao = {} } = {}) {
    const horas = eixo.fim - eixo.ini;
    const passo = Number(config.passo_min) || Number(config.duracao_min) || 30;
    const cab = h("div", { class: "ag-topo" }, h("span", { class: "ag-canto", "aria-hidden": "true" }), colunas.map(c => cabecalhoDaColuna(c, ehMovel, modoDia, config, ocupacao)));
    const regua = h("div", { class: "ag-regua", "aria-hidden": "true" },
      Array.from({ length: horas }, (_, i) => h("span", { class: "ag-hora-rot dado", style: { "--i": String(i) } }, `${String(eixo.ini + i).padStart(2, "0")}h`)),
      colunas.some(c => c.hoje) ? h("span", { class: "ag-agora-rot dado", hidden: true }) : null);   // o rótulo da linha de «agora» (item 42) fica na régua
    const iFoco = Math.max(0, colunas.findIndex(c => c.iso === data));   // CA-197: uma coluna só na ordem do Tab (a do dia escolhido); setas andam entre elas
    const corpo = h("div", { class: "ag-corpo" }, regua, colunas.map((c, i) => colunaDoDia(c, eixo, config, passo, i === iFoco)));
    // plano 1500c · CC-220: a instrução das colunas é dita uma vez (aria-describedby comum), não repetida no nome de cada dia
    const instrucao = ctx.pode("atendente") ? h("p", { class: "sr-only", id: `ag-col-instr-${idTela}` }, "Enter marca consulta neste dia; setas para cima e para baixo escolhem o horário; Page Up e Page Down andam uma hora.") : null;
    const grade = h("div", { class: ["ag-grade", ehMovel && "ag-movel"], style: { "--horas": String(horas), "--colunas": String(colunas.length) }, role: "group",
      "aria-label": ehMovel ? "Agenda do dia" : "Agenda", "aria-description": "Nas consultas, as setas andam entre elas" },
      instrucao, ehMovel ? null : cab, corpo);
    ligarRovingBlocos(grade);
    return grade;
  }

  function cabecalhoDaColuna(c, ehMovel, modoDia, config, ocupacao = {}) {
    if (c.dono !== undefined) {
      return h("div", { class: ["ag-dia-cab", "ag-dono-cab"] }, h("b", { class: "ag-dono-nome", dataset: { dono: c.dono } }, c.titulo),
        h("span", { class: "ag-dia-total", title: `${c.consultas.length} consultas` }, c.consultas.length ? ui.num(c.consultas.length) : "livre"));   // plano 1500c · CC-192
    }
    const ehHoje = c.hoje;
    const oc = ocupacaoDoDia(c.consultas, c.iso, config, c.bloqueios, ocupacao), txtOc = textoOcupacao(oc);
    // na semana, a data é um botão que abre o dia; em «Dia» é só texto
    const dataTxt = [h("span", { class: "ag-dia-sem" }, modoDia ? nomeDia(c.iso, true).replace(/,.*$/, "").replace(/\.$/, "") : semanaCurta(c.iso)), h("b", { class: "ag-dia-num dado" }, diaDoMes(c.iso))];
    const dataEl = modoDia ? dataTxt : h("button", { type: "button", class: "ag-dia-abrir", "aria-label": `Abrir o dia ${nomeDia(c.iso, true)}`, title: "Ver só este dia",
      on: { click: () => { data = c.iso; modo = "dia"; gravarPreferencias(); carregar(); } } }, dataTxt);
    return h("div", { class: ["ag-dia-cab", ehHoje && "hoje"], "aria-current": ehHoje ? "date" : null },
      dataEl,
      h("span", { class: "ag-dia-total", title: `${c.consultas.length} ${c.consultas.length === 1 ? "consulta" : "consultas"}` }, c.consultas.length ? ui.num(c.consultas.length) : ""),
      // plano 1000b · CB-148: sem «+» em dia passado
      // plano 1500c · CC-165: o comentário tinha engolido o aria-label e o title (o «+» ficava sem nome) — cada um na sua linha
      ctx.pode("atendente") && !(c.iso < ui.hojeSP()) ? h("button", { type: "button", class: "bt-icone ag-dia-mais",
        "aria-label": `Marcar ${palavraCompromisso(ctx.vocab)} em ${nomeDia(c.iso, true)}`, title: `Marcar ${palavraCompromisso(ctx.vocab)} neste dia`,
        on: { click: () => abrirAgendamento(null, { dia: c.iso }) } }, ui.icone("mais")) : null,
      // barra de ocupação do dia (item 40): largura = fração do expediente marcada; a cor sobe com o nível
      txtOc ? h("i", { class: ["ag-dia-ocup", `ag-ocup-${nivelOcupacao(oc.pct)}`], style: { "--p": oc.pct === null ? "0" : oc.pct.toFixed(3) }, title: txtOc, "aria-hidden": "true" }) : null,
      txtOc ? h("span", { class: "sr-only" }, txtOc) : null);
  }

  function colunaDoDia(c, eixo, config, passo, focavel = false) {
    const duracaoPadrao = Number(config.duracao_min) || 30;
    const edita = ctx.pode("atendente");
    // CA-197: pelo teclado a coluna também marca — Enter abre «Marcar» no dia; ↑↓ movem um cursor de horário visível; ←→ trocam de coluna
    // plano 1500c · CC-220: o nome é só o dia; a instrução vem do aria-describedby comum (o leitor não repete tudo a cada troca de dia)
    const col = h("ol", { class: ["ag-col", c.hoje && "hoje", edita && "ag-edita"], dataset: { iso: c.iso, chave: c.chave },
      "aria-label": c.rotulo, "aria-describedby": edita ? `ag-col-instr-${idTela}` : null,
      tabindex: edita ? (focavel ? "0" : "-1") : null });
    if (edita) col.addEventListener("keydown", ev => teclaNaColuna(ev, col, c, eixo, config, passo));
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
      // plano 1500c · CC-281: com altura (≥ 45 min), o período curto aparece no próprio bloco («12:00–13:00»): no toque ninguém via o title
      const txtBloq = textoBloqueioNoDia(b, c.iso);
      const periodoCurto = pos.altura >= 0.75 ? (/das (\d\d:\d\d) às (\d\d:\d\d)/.exec(txtBloq) || []).slice(1).join("–") || (/dia todo/.test(txtBloq) ? "o dia todo" : "") : "";
      // plano 1500c · CC-280: para o admin o bloqueio é um botão que abre o editar (sem ir às Configurações)
      const editaBloq = ctx.pode("admin") && b.id != null;
      const miolo = [h("span", { class: "ag-bloq-rot" }, ui.icone("fechar"), h("span", { "aria-hidden": "true" }, b.motivo || "Bloqueado")),
        periodoCurto ? h("span", { class: "ag-bloq-periodo dado", "aria-hidden": "true" }, periodoCurto) : null,
        // plano 1000b · CB-182: o período do bloqueio em texto (o title não é lido no toque nem pelo leitor de tela)
        h("span", { class: "sr-only ag-bloq-txt" }, txtBloq)];
      col.appendChild(h("li", { class: ["ag-bloq", editaBloq && "ag-bloq-edita"], title: `Horário bloqueado — ${motivo}`, style: { "--t": String(pos.topo), "--d": String(pos.altura) } },
        editaBloq ? h("button", { type: "button", class: "ag-bloq-bt", "aria-haspopup": "dialog", "aria-label": `${txtBloq}. Editar bloqueio`,
          on: { click: ev => { ev.stopPropagation(); editarBloqueioDaGrade(b, c.iso); } } }, miolo) : miolo));
    }
    // consultas, lado a lado quando se sobrepõem
    const blocos = [];
    for (const k of c.consultas) {
      const pos = posicaoNoDia(k, c.iso, eixo, duracaoPadrao);
      if (pos) blocos.push({ ...pos, consulta: k });
    }
    // CA-267: até 3 lado a lado; passou disso, 2 blocos e «+N» que abre a lista daquele horário
    const { blocos: aparentes, mais } = limitarSobrepostos(colocarEmFaixas(blocos), 3);
    for (const b of aparentes) col.appendChild(blocoDaConsulta(b, { iso: c.iso, chave: c.chave, dono: c.dono, passo, config, vizinhas: c.consultas }));
    for (const m of mais) col.appendChild(maisDoHorario(m));
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
    const k = corDaConsulta(c, corPor, nomesAtuais, ordemServicos, ordemProfAtual);
    const cor = k.cor;
    const feita = c.status === "ganho";
    const ehProxima = !!proximaAtual && proximaAtual === c;
    const arrastavel = podeArrastar({ pointerType: "mouse", movel, pode: ctx.pode("atendente"), consulta: c });
    const apagado = legendaAtivos.size > 0 && !legendaAtivos.has(k.chave);
    // CA-198: o leitor de tela ouve também «encaixe» e «faltou» (pela etapa), como o painel do dia mostra nos selos
    const cl = classificarConsulta(c, col.config || null, { iso: col.iso, vizinhas: col.vizinhas || [] });
    // plano 1500c · CC-324: o que a IA marcou sozinha ganha o ícone; CC-239: a confirmada (confirmada_em, quando o servidor mandar) o selo
    const ia = c.marcado_por === "ia", confirmada = !!c.confirmada_em && !feita;
    const extrasRot = [confirmada ? "confirmada" : null, ia ? "marcada pela IA" : null, c.obs ? `observação: ${c.obs}` : null].filter(Boolean).join(", ");
    const bt = h("button", { type: "button", class: ["ag-bloco", curto && "curto", feita && "feita", arrastavel && "ag-arrastavel", confirmada && "confirmada"], "aria-haspopup": "dialog",
      "aria-label": `${rotuloDoBloco(c, { inicio, fim, nome, feita, falta: cl.falta, encaixe: cl.encaixe, proxima: ehProxima })}${extrasRot ? `, ${extrasRot}` : ""}`,
      // plano 1500c · CC-218: o title cita os atalhos de remarcar do detalhe (teclado sem mouse)
      title: [`${inicio}${fim ? `–${fim}` : ""}`, nome, c.servico, c.obs || null, corPor === "profissional" ? k.rotulo : null, arrastavel ? "Arraste para remarcar (ou Enter › Dia seguinte)" : null].filter(Boolean).join(" · ") },
      h("span", { class: "ag-bloco-l1" }, h("span", { class: "ag-bloco-hora dado" }, inicio), h("b", { class: "ag-bloco-nome" }, nome),
        ia && typeof ui.icone === "function" ? h("span", { class: "ag-bloco-ia", "aria-hidden": "true", title: "Marcada pela IA" }, ui.icone("ia")) : null,
        confirmada ? h("span", { class: "ag-bloco-conf", "aria-hidden": "true" }, "✓") : null),
      c.servico ? h("span", { class: "ag-bloco-serv" }, c.servico) : null,
      feita ? ui.icone("check") : null);
    bt.addEventListener("click", ev => {
      ev.stopPropagation();
      if (ignorarClique) { ignorarClique = false; return; }   // o clique que fecha um arrasto não abre o detalhe
      abrirDetalhe(c, bt);
    });
    const item = h("li", { class: ["ag-item", ehProxima && "ag-proxima", apagado && "apagado"], dataset: { cols: b.cols, chave: k.chave, negocio: c.negocio_id ?? null, nome: normServico(`${nome} ${c.servico || ""}`) },   // CC-266
      style: { "--t": String(b.topo), "--d": String(b.altura), "--col": String(b.col), "--cols": String(b.cols), "--cor-bloco": `var(--pal-${cor})`, "--i": String(seqBloco++) } },
      ehProxima ? h("span", { class: "ag-proxima-selo", "aria-hidden": "true" }, "Próxima") : null, bt);
    if (arrastavel) bt.addEventListener("pointerdown", ev => iniciarArrasto(ev, bt, item, c, col));
    return item;
  }

  /** CA-267: o marcador «+N» das consultas escondidas num horário lotado de encaixes; tocar lista as N (cada uma abre o detalhe). */
  function maisDoHorario(m) {
    const n = m.consultas.length;
    const bt = h("button", { type: "button", class: "ag-mais-bt dado", "aria-haspopup": "dialog", "aria-label": `Mais ${n} ${n === 1 ? "consulta" : "consultas"} neste horário`,
      title: m.consultas.map(c => `${ui.horaBR(c.inicio)} ${c.nome || c.titulo || "Consulta"}`).join(" · ") }, `+${n}`);
    bt.addEventListener("click", ev => {
      ev.stopPropagation();
      const lista = h("div", { class: "ag-mais-lista", role: "group", "aria-label": "Consultas neste horário" },
        m.consultas.map(c => h("button", { type: "button", class: "bt bt-fant bt-p ag-mais-item", on: { click: () => { pop.fechar(); abrirDetalhe(c, bt); } } },
          h("span", { class: "dado" }, ui.horaBR(c.inicio)), " ", c.nome || c.titulo || "Consulta", c.servico ? h("small", null, ` · ${c.servico}`) : null)));
      const pop = ui.flutuante(bt, lista, { classe: "flut-ag" });
    });
    return h("li", { class: "ag-item ag-mais", dataset: { mais: m.consultas.map(c => c.negocio_id).join(",") },
      style: { "--t": String(m.topo), "--d": String(Math.max(m.altura, .4)), "--col": String(m.col), "--cols": String(m.cols), "--i": String(seqBloco++) } }, bt);
  }

  /* CA-199: as consultas da grade são UM ponto no Tab (roving tabindex): ↑↓ andam no mesmo dia, ←→ vão ao dia ao lado (a consulta mais perto
     no horário, pulando dias vazios), Home/End vão à primeira e à última do dia — 40 consultas na semana não são 40 Tabs */
  let blocoRoving = "";
  const chaveDoBloco = b => { const li = b && b.closest ? b.closest(".ag-item") : null; return li ? String(li.dataset.negocio || li.dataset.mais || "") : ""; };
  const tDoBloco = b => { const li = b.closest(".ag-item"); return Number(li && li.style.getPropertyValue("--t")) || 0; };
  function ligarRovingBlocos(grade) {
    const cols = [...grade.querySelectorAll(".ag-col")];
    const doDia = col => [...col.querySelectorAll(".ag-bloco, .ag-mais-bt")].filter(b => !b.closest(".ag-fantasma"))
      .sort((x, y) => tDoBloco(x) - tDoBloco(y) || (Number(x.closest(".ag-item").style.getPropertyValue("--col")) || 0) - (Number(y.closest(".ag-item").style.getPropertyValue("--col")) || 0));
    const todos = cols.flatMap(doDia);
    if (!todos.length) return;
    const doDiaAtual = cols.find(c => c.dataset.iso === data);
    const inicial = todos.find(b => blocoRoving && chaveDoBloco(b) === blocoRoving) || (doDiaAtual && doDia(doDiaAtual)[0]) || todos[0];
    const marcar = alvo => { for (const b of todos) b.tabIndex = b === alvo ? 0 : -1; blocoRoving = chaveDoBloco(alvo); };
    for (const b of todos) b.tabIndex = b === inicial ? 0 : -1;
    grade.addEventListener("focusin", ev => { if (todos.includes(ev.target)) marcar(ev.target); });
    grade.addEventListener("keydown", ev => {
      const t = ev.target;
      if (!todos.includes(t) || ev.altKey || ev.ctrlKey || ev.metaKey || ev.shiftKey) return;
      const col = t.closest(".ag-col"), lista = doDia(col), i = lista.indexOf(t);
      let alvo = null;
      if (ev.key === "ArrowDown") alvo = lista[i + 1] || null;
      else if (ev.key === "ArrowUp") alvo = lista[i - 1] || null;
      else if (ev.key === "Home") alvo = lista[0];
      else if (ev.key === "End") alvo = lista[lista.length - 1];
      else if (ev.key === "ArrowLeft" || ev.key === "ArrowRight") {
        const passo = ev.key === "ArrowRight" ? 1 : -1, tt = tDoBloco(t);
        for (let j = cols.indexOf(col) + passo; j >= 0 && j < cols.length && !alvo; j += passo) {
          const l = doDia(cols[j]);
          if (l.length) alvo = l.reduce((m, b) => (Math.abs(tDoBloco(b) - tt) < Math.abs(tDoBloco(m) - tt) ? b : m), l[0]);
        }
      } else return;
      ev.preventDefault();
      if (!alvo || alvo === t) return;
      marcar(alvo);
      try { alvo.focus({ preventScroll: false }); } catch { alvo.focus(); }
    });
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
    a.ultX = ev.clientX; a.ultY = ev.clientY;
    atualizarDestino(a, ev.clientX, ev.clientY);
    rolarNoArrasto();
  }
  function atualizarDestino(a, x, y) {
    const sob = document.elementFromPoint(x, y);
    const colEl = sob && sob.closest ? sob.closest(".ag-col") : null;
    // por responsável: só dentro da mesma coluna (trocar a pessoa não é remarcar)
    if (!colEl || (a.col.dono !== undefined && colEl.dataset.chave !== a.col.chave)) { a.destino = null; mostrarFantasma(null); return; }
    const r = colEl.getBoundingClientRect();
    if (!r.height) return;
    const alvo = alvoDoArrasto({ fracao: (y - r.top) / r.height, eixo: eixoAtual, passo: a.col.passo, duracao: a.duracao, pegouEm: a.pegouEm });
    a.destino = { iso: colEl.dataset.iso, hora: alvo.hora, min: alvo.min, col: colEl };
    mostrarFantasma(a.destino);
  }
  /* CA-166: perto da borda de cima (abaixo do cabeçalho fixo da grade) ou de baixo da janela, a página rola sozinha enquanto se arrasta
     (das 8h para as 17h sem a hora de destino já estar à vista); o destino acompanha a rolagem */
  const BORDA_ROLAGEM = 48, PASSO_ROLAGEM = 12;
  function direcaoDaRolagem(y) {
    const cab = conteudo.querySelector(".ag-topo");
    const topo = Math.max(cab ? cab.getBoundingClientRect().bottom : 0, 0);
    const alt = typeof innerHeight === "number" ? innerHeight : 0;
    if (!alt) return 0;
    if (y < topo + BORDA_ROLAGEM) return -1;
    if (y > alt - BORDA_ROLAGEM) return 1;
    return 0;
  }
  function rolarNoArrasto() {
    const a = arrasto;
    if (!a || !a.moveu || a.rolando) return;
    const passo = () => {
      const b = arrasto;
      if (!b || b !== a || !vivo) return;
      const dir = direcaoDaRolagem(b.ultY);
      if (!dir || typeof globalThis.scrollBy !== "function") { b.rolando = null; return; }
      globalThis.scrollBy(0, dir * PASSO_ROLAGEM);
      atualizarDestino(b, b.ultX, b.ultY);
      b.rolando = requestAnimationFrame(passo);
    };
    if (direcaoDaRolagem(a.ultY)) a.rolando = requestAnimationFrame(passo);
  }
  /** O destino vale? passou · fechado (fora do atendimento) · bloqueado (CA-164) · lotado (CA-165: a capacidade já está cheia ali). */
  function destinoValido(d, quem = null) {
    if (instanteNoFuso(d.iso, d.hora) < Date.now()) return "passou";
    const cfg = (atual && atual.config) || {};
    if (horarioAberto(cfg, d.iso, d.min) === false) return "fechado";
    const a = quem || arrasto || ultimoArrasto;    // quem = {c, duracao} (atalho do detalhe, CA-206); senão o arrasto
    const k = conflitoNoDestino({ iso: d.iso, min: d.min, duracao: a ? a.duracao : 30, config: cfg, ignorar: a ? a.c : null,
      bloqueios: atual && Array.isArray(atual.bloqueios) ? atual.bloqueios : [], consultas: atual && Array.isArray(atual.consultas) ? atual.consultas : [],
      ocupados: atual && Array.isArray(atual.ocupados) ? atual.ocupados : null });   // plano 1500c · CC-190
    if (k) { d.conflito = k; return k.motivo; }
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
    const motivo = destinoValido(d);
    // lotado: supervisor pode encaixar (fantasma em atenção); os demais veem o vermelho, como bloqueado, fechado e passado
    const encaixe = motivo === "lotado" && ctx.pode("supervisor");
    a.rotulo.textContent = `${d.hora}–${horaTxt(d.min + a.duracao)}${motivo === "bloqueado" ? " · bloqueado" : motivo === "lotado" ? (encaixe ? " · encaixe" : " · lotado") : ""}`;
    a.fantasma.classList.toggle("ag-fantasma-ruim", !!motivo && !encaixe);
    a.fantasma.classList.toggle("ag-fantasma-encaixe", encaixe);
  }
  let ultimoArrasto = null;
  function limparArrasto() {
    const a = arrasto;
    arrasto = null;
    if (!a) return;
    ultimoArrasto = a;
    if (a.rolando) { try { cancelAnimationFrame(a.rolando); } catch { /* ok */ } a.rolando = null; }
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
    remarcarPara(a.c, d, null, "Arraste para outro.");
  }
  /** O destino (arrasto ou atalho do detalhe) vale? Avisa o motivo (passou, fechado, bloqueado, cheio) ou abre a confirmação «De → Para». */
  function remarcarPara(c, d, quem = null, dica = "Escolha outro horário.") {
    const motivo = destinoValido(d, quem);
    if (motivo === "passou") { ui.toast("Esse horário já passou.", { tipo: "info" }); return false; }
    if (motivo === "fechado") { ui.toast("Fora do horário de atendimento da agenda.", { tipo: "info" }); return false; }
    // CA-164/CA-165: bloqueio e horário cheio avisam já no soltar (antes abria a confirmação e só o servidor recusava)
    if (motivo === "bloqueado") { ui.toast(`Horário bloqueado: ${d.conflito.rotulo}.`, { tipo: "info" }); return false; }
    if (motivo === "lotado" && !ctx.pode("supervisor")) { ui.toast(`Esse horário já está cheio. ${dica}`, { tipo: "info" }); return false; }
    confirmarRemarcacao(c, d, { encaixe: motivo === "lotado", dica });   // plano 1000b · CB-149: o erro do servidor usa a dica de quem chamou
    return true;
  }
  /** CA-206: no celular não há arrasto — «Dia seguinte» e «Semana seguinte» (mesmo horário) abrem a mesma confirmação «De → Para». */
  function remarcarAtalho(c, dias) {
    const p = partesSP(c && c.inicio);
    if (!p) return false;
    const dur = Number(atual && atual.config && atual.config.duracao_min) || 30;
    const m = minutosDaConsulta(c, dur);
    const iso = diaDoAtalho(p.dia, dias);
    if (!iso) { ui.toast("Nenhum dia de atendimento nos próximos 60 dias.", { tipo: "info" }); return false; }
    return remarcarPara(c, { iso, hora: horaTxt(p.min), min: p.min }, { c, duracao: m ? m.fim - m.ini : dur });
  }
  /** Plano 1500c · CC-177: o «Dia seguinte» é o próximo dia de ATENDIMENTO (pula domingo fechado e feriado bloqueado); a «Semana seguinte», o
      primeiro dia aberto a partir de 7 dias depois. */
  function diaDoAtalho(dia, dias) {
    const cfg = (atual && atual.config) || {}, bl = atual && Array.isArray(atual.bloqueios) ? atual.bloqueios : [];
    return dias >= 7 ? proximoDiaAberto(cfg, diaISO(dia, dias - 1), { bloqueios: bl }) : proximoDiaAberto(cfg, dia, { passo: dias, bloqueios: bl });
  }
  /** Confirmação «De → Para»; confirmar grava com p_req (nx_agenda_marcar, como a janela) e oferece Desfazer (volta como encaixe).
      encaixe = o destino está cheio e quem arrasta é supervisor+: grava como encaixe (p_encaixe), com o aviso na confirmação. */
  async function confirmarRemarcacao(c, d, { encaixe = false, dica = "Escolha outro horário." } = {}) {
    const nome = c.nome || c.titulo || "Consulta";
    const hoje = ui.hojeSP();
    const de = partesSP(c.inicio);
    if (!Lg) try { Lg = await logicaDe(ctx); } catch { ui.toast("Não foi possível abrir a remarcação. Tente de novo.", { tipo: "erro" }); return; }
    const req = Lg.novaReq();        // a mesma intenção em todas as tentativas desta janela: o servidor não marca duas vezes
    const inicioNovo = isoNoFuso(d.iso, d.hora);      // CA-194: o instante pelo fuso, sem «-03:00» fixo
    const corpo = h("div", { class: "ag-remarcar" },
      h("p", { class: "ag-remarcar-nome" }, h("b", null, nome), c.servico ? h("small", null, ` · ${c.servico}`) : null),
      h("div", { class: "ag-remarcar-de-para" },
        h("span", { class: "ag-remarcar-de" }, h("small", null, "De"), h("b", { class: "dado" }, de ? `${rotuloDoDia(de.dia, hoje)} ${horaTxt(de.min)}` : ui.dataHoraBR(c.inicio))),
        h("span", { class: "ag-remarcar-seta", "aria-hidden": "true" }, "→"),
        h("span", { class: "ag-remarcar-para" }, h("small", null, "Para"), h("b", { class: "dado" }, `${rotuloDoDia(d.iso, hoje)} ${d.hora}`))),
      encaixe ? h("p", { class: "aviso aviso-aten ag-remarcar-encaixe" }, ui.icone("info"), h("span", null, "Esse horário já está cheio: a consulta entra como encaixe, acima da capacidade.")) : null,
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
          const { resultado } = await Lg.escreverComReq(api, "nx_agenda_marcar", { p_negocio: c.negocio_id, p_inicio: inicioNovo, p_servico: c.servico || null, ...(encaixe ? { p_encaixe: true } : {}) },
            { req, aoStatus: t => { statusEl.textContent = t; statusEl.hidden = false; } });
          statusEl.hidden = true;
          return erroResposta(resultado);
        } catch (e) {
          statusEl.hidden = true;
          const codigo = e && e.codigo;
          m.erro(e && e.ambigua ? "Não foi possível confirmar se foi salvo. Toque em «Remarcar» de novo: é seguro, não marca duas vezes."
            : codigo === "horario_ocupado" ? `Esse horário está ocupado. ${dica}`
              : api.mensagemErro(e));
          return false;
        }
      } },
    ] });
    if (!(r && r.ok)) return;
    const anterior = c.inicio, servico = c.servico || null, negocioId = c.negocio_id, etapaAntes = antes, encaixeAntes = typeof c.encaixe === "boolean" ? c.encaixe : undefined;
    recarregar().then(() => { if (vivo) confirmarNoBloco(negocioId, "Consulta remarcada"); });   // E5: o bloco no horário novo confirma
    ui.acaoComDesfazer({
      texto: `Remarcada para ${rotuloDoDia(d.iso, hoje)} às ${d.hora}`,
      // plano 1500c · CC-178: como marcar e desmarcar, a remarcação oferece escrever o aviso ao paciente (o novo horário; nada sai sozinho)
      acao: avisarPaciente && c.contato_id != null ? { rotulo: rotuloAvisar("remarcacao", ctx.vocab), fn: () => avisarPaciente({ ...c, inicio: inicioNovo, fim: null }, "remarcacao") } : undefined,
      reverter: async () => {
        const av = avisoVoltaEncaixe(await voltarAoHorario(api, negocioId, anterior, servico, encaixeAntes));
        if (av) ui.toast(av, { tipo: "info" });
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
    pedirMarcarEm(iso, horaDoClique((ev.clientY - r.top) / r.height, eixo, passo), config);
  }
  /** Marcar num horário da grade (clique no vazio ou Enter no cursor do teclado): o que já passou, está fora do atendimento ou bloqueado avisa. */
  function pedirMarcarEm(iso, hora, config) {
    const min = paraMin(hora);
    if (instanteNoFuso(iso, hora) < Date.now()) { ui.toast("Esse horário já passou.", { tipo: "info" }); return; }
    if (horarioAberto(config, iso, min) === false) { ui.toast("Fora do horário de atendimento da agenda.", { tipo: "info" }); return; }
    const bloq = conflitoNoDestino({ iso, min, duracao: 5, bloqueios: atual && Array.isArray(atual.bloqueios) ? atual.bloqueios : [] });
    if (bloq && bloq.motivo === "bloqueado") { ui.toast(`Horário bloqueado: ${bloq.rotulo}.`, { tipo: "info" }); return; }
    abrirAgendamento(null, { dia: iso, hora });
  }

  /* CA-197: teclado na coluna — o cursor de horário (minutos) vale para todas as colunas: trocar de dia mantém a hora */
  let cursorMin = null;
  function mostrarCursor(col, eixo) {
    for (const v of conteudo.querySelectorAll(".ag-cursor")) v.remove();
    if (cursorMin === null) return;
    col.appendChild(h("li", { class: "ag-cursor", "aria-hidden": "true", style: { "--t": String(cursorMin / 60 - eixo.ini) } }, h("span", { class: "ag-cursor-rot dado" }, horaTxt(cursorMin))));
  }
  function teclaNaColuna(ev, col, c, eixo, config, passo) {
    if (ev.target !== col || ev.altKey || ev.ctrlKey || ev.metaKey) return;
    const p = Math.max(5, Number(passo) || 30);
    const ini = eixo.ini * 60, fim = eixo.fim * 60 - p;
    // plano 1500c · CC-219: PageUp/PageDown andam 1 h; Home/End vão ao começo e ao fim do expediente do dia
    const salto = { ArrowDown: p, ArrowUp: -p, PageDown: 60, PageUp: -60 }[ev.key];
    if (ev.key === "Home" || ev.key === "End") {
      ev.preventDefault();
      const fx = faixasDoDia(config, c.iso) || [];
      cursorMin = ev.key === "Home" ? (fx.length ? fx[0][0] : ini) : (fx.length ? fx[fx.length - 1][1] - p : fim);
      cursorMin = Math.max(ini, Math.min(fim, cursorMin));
      mostrarCursor(col, eixo);
      anunciar(`${horaTxt(cursorMin)}${horarioAberto(config, c.iso, cursorMin) === false ? ", fora do atendimento" : ""}`, { repetir: true });
      return;
    }
    if (salto !== undefined) {
      ev.preventDefault();
      if (cursorMin === null) {
        // começa no que importa: agora (hoje), senão a 1ª faixa de atendimento, senão o topo do eixo
        const n = partesSP(new Date());
        const faixa = (faixasDoDia(config, c.iso) || [])[0];
        cursorMin = c.iso === (n && n.dia) ? Math.ceil(n.min / p) * p : faixa ? faixa[0] : ini;
      } else cursorMin += salto;
      cursorMin = Math.max(ini, Math.min(fim, cursorMin));
      mostrarCursor(col, eixo);
      anunciar(`${horaTxt(cursorMin)}${horarioAberto(config, c.iso, cursorMin) === false ? ", fora do atendimento" : ""}`, { repetir: true });
      return;
    }
    if (ev.key === "ArrowLeft" || ev.key === "ArrowRight") {
      const cols = col.parentNode ? [...col.parentNode.querySelectorAll(".ag-col")] : [];
      const j = cols.indexOf(col) + (ev.key === "ArrowRight" ? 1 : -1);
      if (j < 0 || j >= cols.length) return;
      ev.preventDefault();
      for (const k of cols) k.tabIndex = k === cols[j] ? 0 : -1;
      try { cols[j].focus({ preventScroll: false }); } catch { cols[j].focus(); }
      mostrarCursor(cols[j], eixo);
      return;
    }
    if (ev.key === "Enter" || ev.key === " ") {
      ev.preventDefault();
      if (cursorMin === null) abrirAgendamento(null, { dia: c.iso }); else pedirMarcarEm(c.iso, horaTxt(cursorMin), config);
      return;
    }
    if (ev.key === "Escape" && cursorMin !== null) { ev.preventDefault(); cursorMin = null; mostrarCursor(col, eixo); }
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
  /* O relógio de 60 s: a linha de «agora»; CA-168: a consulta que acabou de começar troca a «Próxima» e ganha «Compareceu / Faltou» (redesenho
     só quando algo cruzou o horário); CA-167: a agenda se relê sozinha (marcações da IA ou de outro atendente aparecem) — em silêncio,
     sem redesenhar quando nada mudou, e nunca no meio de um arrasto, com a aba escondida ou com uma janela aberta */
  const chaveConsulta = c => (c ? `${c.negocio_id}|${c.inicio}` : "");
  let ultimoTique = Date.now();
  function tique() {
    if (!vivo) return;
    // plano 1500c · CC-168: a Agenda ficou aberta e virou o dia — a data (se era hoje) e a coluna «hoje» andam, e o período é relido
    const hojeAgora = ui.hojeSP();
    if (diaVirou(ultimoHojeTela, hojeAgora) && !arrasto) {
      const eraHoje = data === ultimoHojeTela;
      ultimoHojeTela = hojeAgora;
      if (eraHoje) { data = hojeAgora; gravarPreferencias(); }
      diaFocado = "";
      carregar({ forcar: true, silencioso: !!atual });
      return;
    }
    posicionarAgora();
    pintarCarimbo();
    const agora = Date.now(), antes = ultimoTique;
    ultimoTique = agora;
    if (atual && Array.isArray(atual.consultas) && !arrasto) {
      const lista = filtrarPorProfissional(atual.consultas.map(comPresencaLida), filtroProf, eu);
      const cruzou = lista.some(c => { const t = Date.parse(c && c.inicio); return Number.isFinite(t) && t > antes && t <= agora; });
      if (cruzou || chaveConsulta(proximaConsulta(lista, agora)) !== chaveConsulta(proximaAtual)) {
        // plano 1500c · CC-249: com a aba escondida o redesenho espera a volta (visibilitychange)
        if (typeof document !== "undefined" && document.hidden) redesenhoPendente = true; else desenhar();
      }
    }
    releituraAutomatica();
  }
  function releituraAutomatica({ minimo = 55_000 } = {}) {
    if (!vivo || !atual || arrasto || atualizandoManual || Date.now() - ultimaLeitura < minimo) return;
    if (typeof document !== "undefined" && (document.hidden || (document.querySelector && document.querySelector("dialog[open], .flut-ag")))) return;
    carregar({ silencioso: true, forcar: true, auto: true });
  }
  const relogio = setInterval(tique, 60_000);
  const aoVoltarAba = () => {
    if (typeof document !== "undefined" && !document.hidden) {
      if (redesenhoPendente && vivo && atual) { redesenhoPendente = false; desenhar(); }   // plano 1500c · CC-249
      posicionarAgora(); releituraAutomatica({ minimo: 30_000 });
    }
  };
  document.addEventListener("visibilitychange", aoVoltarAba);

  /* ============================================================ E1 · presença (nx_agenda_presenca, contrato 6) */
  const chavePresenca = c => `${c.negocio_id}|${c.inicio}`;
  /** Linha sem o campo `presenca` (servidor antigo): uma cópia com o que já foi lido da ficha; com o campo, a própria linha. */
  function comPresencaLida(c) {
    if (!c || Object.hasOwn(c, "presenca") || !presencasLidas.has(chavePresenca(c))) return c;
    return { ...c, presenca: presencasLidas.get(chavePresenca(c)) };
  }
  /** Servidor antigo: a presença das consultas passadas vem da ficha (nx_negocio_ver.campos.presenca), uma leitura por consulta (até 12 por vez). */
  function lerPresencasQueFaltam(lista) {
    if (!Lg || semPresenca) return Promise.resolve(false);
    const faltam = (lista || []).filter(c => { const p = presencaDaConsulta(c, Lg); return p.possivel && !p.conhecida && !lendoPresenca.has(chavePresenca(c)); }).slice(0, 12);
    if (!faltam.length) return Promise.resolve(false);
    for (const c of faltam) lendoPresenca.add(chavePresenca(c));
    // CA-219: no máximo 4 leituras ao mesmo tempo (eram até 12 de uma vez a cada desenho); a que falhou não é pedida de novo nesta tela
    return comLimite(faltam, 4, c => api.rpcC("nx_negocio_ver", { p_id: c.negocio_id })
      .then(d => { presencasLidas.set(chavePresenca(c), Lg.presencaDe(d && d.negocio)); })
      .catch(() => { presencasLidas.set(chavePresenca(c), null); }))
      .then(() => { if (vivo && atual) desenhar(); return true; });
  }
  /** Grava a presença na linha em mãos (o redesenho já mostra) e na memória das linhas de servidor antigo. */
  function guardarPresenca(c, estado) {
    presencasLidas.set(chavePresenca(c), estado);
    const linha = atual && Array.isArray(atual.consultas) ? atual.consultas.find(x => x && x.negocio_id === c.negocio_id && x.inicio === c.inicio) : null;
    if (linha && Object.hasOwn(linha, "presenca")) linha.presenca = estado;
  }
  /** «Compareceu / Faltou»: tocar de novo no marcado limpa; «Desfazer» devolve a marca de antes («limpar» se não havia) e, se «faltou» levou o
      negócio à etapa de faltas, a etapa de antes (lida da ficha ANTES de gravar). Servidor sem a função → os botões somem nesta tela. */
  async function marcarPresenca(c, est, botao) {
    if (!Lg || semPresenca || !ctx.pode("atendente") || !c) return;
    const anterior = Lg.presencaDe(c);
    const pedido = Lg.proximaPresenca(anterior, est);
    const nome = c.nome || c.titulo || "Consulta";
    // plano 1500c · CC-221: tocar de novo no botão marcado não limpa sem querer (duplo toque) — pergunta antes; a paleta já pergunta
    if (pedido === "limpar" && botao) {
      const ok = typeof ui.confirmar === "function"
        ? await ui.confirmar({ titulo: "Limpar a presença?", texto: `${nome} está marcada como «${(Lg.PRESENCAS[anterior] || {}).rotulo || anterior}». Limpar a marcação?`, rotulo: "Limpar marcação" })
        : true;   // shell sem ui.confirmar: segue como antes (o Desfazer devolve)
      if (!ok || !vivo) return;
    }
    let etapaAntes = null, r;
    try {
      r = await ui.carregando(botao, async () => {
        if (pedido === "faltou" && c.marco !== "faltou") etapaAntes = await lerEtapa(api, c.negocio_id);
        return api.rpcC("nx_agenda_presenca", { p_negocio: c.negocio_id, p_estado: pedido });
      });
    } catch (e) {
      if (Lg.rpcAusente(e)) {
        semPresenca = true; limparComandoPresenca();
        ui.toast("O servidor ainda não registra a presença da consulta. Assim que a atualização estiver no ar, os botões voltam.", { tipo: "info" });
        if (vivo && atual) desenhar();
        return;
      }
      ui.toast(api.mensagemErro(e), { tipo: "erro" });
      return;
    }
    const novo = r && Object.hasOwn(r, "presenca") ? Lg.presencaDe(r) : (pedido === "limpar" ? null : pedido);
    guardarPresenca(c, novo);
    const moveu = !!(etapaAntes && r && r.estagio_id != null && String(r.estagio_id) !== String(etapaAntes.estagio_id));
    if (vivo && atual) { desenhar(); recarregar(); }
    const texto = pedido === "limpar" ? `Presença de ${nome} limpa`
      : `${nome} · ${pedido === "faltou" ? "faltou" : "compareceu"}${moveu ? " · foi para a etapa de faltas" : ""}`;
    ui.acaoComDesfazer({ texto,
      // CA-191: compareceu → atalho opcional para o negócio (fechar, próxima etapa); a decisão de etapa continua de quem atende
      // plano 1500c · CC-222: faltou → «Remarcar» abre a janela com o negócio (o próximo passo natural)
      acao: pedido === "compareceu" && c.negocio_id != null ? { rotulo: palavrasAgenda(ctx.vocab).abrirNeg, fn: () => abrirFicha(c.negocio_id) } // CB-189
        : pedido === "faltou" && c.negocio_id != null && ctx.pode("atendente") ? { rotulo: "Remarcar", fn: () => abrirAgendamento({ ...c, inicio: null, consulta_em: null }) } : undefined,
      reverter: async () => {
        await api.rpcC("nx_agenda_presenca", { p_negocio: c.negocio_id, p_estado: Lg.voltaPresenca(anterior) });
        guardarPresenca(c, anterior);
        if (moveu && !(await devolverEtapa(api, c.negocio_id, etapaAntes)))
          ui.toast("A presença voltou, mas o negócio não voltou para a etapa em que estava. Confira no CRM.", { tipo: "info" });
        if (vivo && atual) { desenhar(); recarregar(); }
      } });
  }
  /** CA-192: «Marcar as N que faltam como Compareceu» — só as que já passaram sem marca; confirma antes e um Desfazer limpa todas. */
  async function marcarPresencaLote(lista, botao) {
    if (!Lg || semPresenca || !ctx.pode("atendente") || !Array.isArray(lista) || !lista.length) return;
    const n = lista.length;
    // plano 1500c · CC-224: cada consulta tem a caixa marcada (Compareceu); desmarcar a caixa grava «Faltou» — dia de chuva não é uma a uma
    const caixas = lista.map(c => h("input", { type: "checkbox", class: "ag-lote-chk", checked: true, "aria-label": `${c.nome || c.titulo || "Consulta"} compareceu` }));
    const ok = await ui.modal({ titulo: `Marcar ${n} como «Compareceu»?`, largura: "p", protegerTexto: false,
      corpo: h("div", { class: "pilha" }, h("p", null, "As consultas que já passaram e ainda não têm presença marcada. Desmarque quem faltou:"),
        h("ul", { class: "ag-lote-lista" }, lista.map((c, i) => h("li", null, h("label", { class: "ag-lote-item" }, caixas[i], h("span", { class: "dado" }, ui.horaBR(c.inicio)), " ", c.nome || c.titulo || "Consulta"))))),
      acoes: [{ rotulo: "Cancelar", tipo: "neutro", valor: false }, { rotulo: `Gravar ${n}`, tipo: "primario", valor: true }] });
    if (!ok || !vivo) return;
    const estados = new Map(lista.map((c, i) => [c, caixas[i].checked === false ? "faltou" : "compareceu"]));
    const feitas = [], falharam = [];
    // plano 1500c · CC-182: até 4 gravações ao mesmo tempo (15 consultas no fim do dia eram 15 idas e voltas em fila)
    const gravar = () => comLimite(lista, 4, async c => {
      if (semPresenca) return;
      const est = estados.get(c);
      try { await api.rpcC("nx_agenda_presenca", { p_negocio: c.negocio_id, p_estado: est }); feitas.push(c); guardarPresenca(c, est); }
      catch (e) {
        if (Lg.rpcAusente(e)) { semPresenca = true; limparComandoPresenca(); return; }
        falharam.push(c);
        console.error("agenda: presença em lote", e);
      }
    });
    try { if (typeof ui.carregando === "function" && botao) await ui.carregando(botao, gravar); else await gravar(); } catch (e) { ui.toast(api.mensagemErro(e), { tipo: "erro" }); }
    if (vivo && atual) { desenhar(); recarregar(); }
    if (!feitas.length) { ui.toast(semPresenca ? "O servidor ainda não registra a presença da consulta." : "Nenhuma presença foi gravada. Tente de novo.", { tipo: "info" }); return; }
    // plano 1000b · CB-186: quem não gravou aparece pelo nome (antes só «(1 não gravou)» e o erro no console)
    const nomeLote = c => `${c.nome || c.titulo || "Consulta"} (${ui.horaBR(c.inicio)})`;
    const naoGravou = feitas.length < n ? (falharam.length
      ? ` · não gravaram: ${falharam.slice(0, 3).map(nomeLote).join(", ")}${falharam.length > 3 ? ` e mais ${falharam.length - 3}` : ""}. Marque essas uma a uma.`
      : ` (${n - feitas.length} não gravaram)`) : "";
    const nFaltou = feitas.filter(c => estados.get(c) === "faltou").length;
    const resumoLote = nFaltou ? `${feitas.length - nFaltou} «Compareceu» e ${nFaltou} «Faltou»` : `${feitas.length} ${feitas.length === 1 ? "consulta marcada" : "consultas marcadas"} como «Compareceu»`;
    ui.acaoComDesfazer({ texto: `${resumoLote}${naoGravou}`,
      reverter: async () => {
        // plano 1500c · CC-181: uma que falha não para as outras — as que não voltaram são ditas pelo nome
        const naoVoltaram = [];
        await comLimite(feitas, 4, async c => {
          try { await api.rpcC("nx_agenda_presenca", { p_negocio: c.negocio_id, p_estado: "limpar" }); guardarPresenca(c, null); }
          catch (e) { naoVoltaram.push(c); console.error("agenda: desfazer presença em lote", e); }
        });
        if (naoVoltaram.length) ui.toast(`Não voltaram: ${naoVoltaram.slice(0, 3).map(nomeLote).join(", ")}${naoVoltaram.length > 3 ? ` e mais ${naoVoltaram.length - 3}` : ""}. Limpe essas uma a uma.`, { tipo: "erro" });
        if (vivo && atual) { desenhar(); recarregar(); }
      } });
  }
  /** CA-189: «Imprimir dia» — a impressão mostra só o painel do dia (o @media print do agenda.css); a tela volta como estava. */
  function imprimirDia() {
    if (typeof globalThis.print !== "function") return;
    const corpo = document.body && document.body.classList ? document.body : null;
    if (corpo) corpo.classList.add("ag-imprimindo");
    const fim = () => { if (corpo) corpo.classList.remove("ag-imprimindo"); if (typeof removeEventListener === "function") removeEventListener("afterprint", fim); };
    if (typeof addEventListener === "function") addEventListener("afterprint", fim);
    try { globalThis.print(); } finally { setTimeout(fim, 1000); }
  }

  /* ============================================================ plano 1500c (frente agenda): peças novas da tela */
  /** CC-260: «Imprimir semana» — a folha leva os 7 dias em lista (hora, paciente, serviço, telefone) e some depois da impressão. */
  function imprimirSemana(dias, consultas, config, bloqueios, hoje) {
    if (typeof globalThis.print !== "function") return;
    const folha = h("div", { class: "ag-folha-semana" }, h("h2", null, `Agenda · ${ui.dataCurtaBR(dias[0])} a ${ui.dataCurtaBR(dias[dias.length - 1])}`),
      montarListaDias({ h, dias, consultas, config, hoje, bloqueios, horaBR: ui.horaBR, telBR: typeof ui.telBR === "function" ? ui.telBR : String, num: ui.num, uid: `imp${idTela}` }));
    conteudo.appendChild(folha);
    const corpo = document.body && document.body.classList ? document.body : null;
    if (corpo) corpo.classList.add("ag-imprimindo-semana");
    const fim = () => { if (corpo) corpo.classList.remove("ag-imprimindo-semana"); folha.remove(); if (typeof removeEventListener === "function") removeEventListener("afterprint", fim); };
    if (typeof addEventListener === "function") addEventListener("afterprint", fim);
    try { globalThis.print(); } finally { setTimeout(fim, 1000); }
  }
  /** CC-258: as consultas do período num arquivo CSV (abre no Excel). */
  function exportarCSV(lista, dias) {
    const csv = csvDaAgenda(lista, { nomes: nomesAtuais, contato: palavrasAgenda(ctx.vocab).contato.replace(/^./, x => x.toUpperCase()) });
    const nome = `agenda-${dias[0]}${dias.length > 1 ? `-a-${dias[dias.length - 1]}` : ""}.csv`;
    try {
      const url = URL.createObjectURL(new Blob([csv], { type: "text/csv;charset=utf-8" }));
      const a = h("a", { href: url, download: nome, hidden: true });
      (document.body || conteudo).appendChild(a);
      a.click();
      setTimeout(() => { a.remove(); try { URL.revokeObjectURL(url); } catch { /* ok */ } }, 1000);
      ui.toast(`Arquivo ${nome} baixado.`, { tipo: "ok" });
    } catch (e) { ui.toast("Não foi possível gerar o arquivo neste aparelho.", { tipo: "erro" }); console.error(e); }
  }
  /** CC-261: manda a lista do dia em texto pelo compartilhar do celular (WhatsApp, e-mail…). */
  async function compartilharDia(iso, consultas, hoje) {
    const texto = textoCompartilharDia(consultas, iso, hoje);
    try { await navigator.share({ title: "Agenda do dia", text: texto }); }
    catch (e) { if (!(e && e.name === "AbortError")) { const ok = await copiarSemAviso(texto); ui.toast(ok ? "Lista copiada para colar onde quiser." : "Não foi possível compartilhar.", { tipo: "info" }); } }
  }
  /** CC-252: «Próximo livre: hoje 15:30» — nx_agenda_livres dos próximos 3 dias (guardado por 60 s); tocar abre a marcação nele. */
  let livreCache = { em: 0, chave: "", slot: null, p: null };
  function completarProximoLivre(caixa, hoje) {
    if (offline()) return;
    const chave = hoje;
    const pintar = slot => {
      if (!vivo || !slot) return;
      ui.limpar(caixa);
      const rot = `${rotuloDoDia(slot.dia, hoje)} ${horaTxt(slot.min)}`;
      caixa.appendChild(h("button", { type: "button", class: "bt bt-fant bt-p agenda-prox-livre", "aria-label": `Próximo horário livre: ${rot}. Marcar nele`,
        on: { click: () => abrirAgendamento(null, { dia: slot.dia, hora: horaTxt(slot.min) }) } }, h("span", { class: "agenda-proxima-rot" }, "Próximo livre"), h("b", { class: "dado" }, rot)));
    };
    if (livreCache.chave === chave && Date.now() - livreCache.em < 60_000) { if (livreCache.slot) pintar(livreCache.slot); else if (livreCache.p) livreCache.p.then(() => pintar(livreCache.slot)); return; }
    livreCache = { em: Date.now(), chave, slot: null, p: null };
    const meu = livreCache;
    meu.p = Promise.resolve(api.rpcC("nx_agenda_livres", { p_a_partir: hoje, p_dias: 3, p_servico: null, p_negocio: null }))
      .then(r => { meu.slot = primeiroLivre(agruparLivres(r && r.horarios)); if (livreCache === meu) pintar(meu.slot); })
      .catch(() => { if (livreCache === meu) livreCache = { em: 0, chave: "", slot: null, p: null }; });
  }
  /** CC-306: empresa nova — «Deixe a agenda pronta em 3 passos» (horário, serviços, feriados), só para o admin enquanto vale o horário padrão. */
  function montarRoteiro() {
    const passo = (n, t, d) => h("li", { class: "ag-roteiro-passo" }, h("span", { class: "ag-passo-n dado", "aria-hidden": "true" }, String(n)),
      h("span", null, h("b", null, t), h("small", null, d)));
    return h("section", { class: "cartao ag-roteiro", "aria-labelledby": `ag-roteiro-${idTela}` },
      h("h2", { class: "ag-roteiro-tit", id: `ag-roteiro-${idTela}` }, "Deixe a agenda pronta em 3 passos"),
      h("ol", { class: "ag-roteiro-lista" },
        passo(1, "Horário de atendimento", "Os dias e horas em que a equipe atende (a IA usa o mesmo)."),
        passo(2, "Serviços e durações", "Ex.: avaliação 30 min, limpeza 45 min."),
        passo(3, "Feriados", "Um toque fecha os feriados nacionais do ano.")),
      h("a", { class: "bt bt-prim bt-p ag-roteiro-ir", href: "#/config/agenda", on: { click: ev => { ev.preventDefault(); ctx.navegar("#/config/agenda"); } } }, "Configurar a agenda"));
  }
  /** CC-266: «Filtrar nesta tela» apaga (sem redesenhar) os blocos e as linhas que não casam com o nome ou o serviço digitado. */
  function aplicarFiltroNome() {
    const q = normServico(filtroNome);
    for (const el of conteudo.querySelectorAll(".ag-item[data-nome], .ag-painel-li[data-nome]")) el.classList.toggle("ag-filtrado", !!q && !String(el.dataset.nome || "").includes(q));
  }
  /** CC-225/CC-226: ligar, conversar e «Lembrar» direto nas linhas do painel e da Lista. */
  function contatosDaLinha(hoje) {
    const comConv = !!(ctx.temModulo && ctx.temModulo("conversas"));
    const pode = ctx.pode("atendente");
    const amanha = diaISO(hoje, 1);
    return {
      icone: ui.icone,
      hrefTel: t => (Lg ? Lg.hrefTel(t) : telLocal(t)),
      aoConversar: comConv ? c => ctx.navegar(`#/conversas?contato=${encodeURIComponent(c.contato_id)}`) : null,
      podeLembrar: c => comConv && pode && c && c.contato_id != null && c.status !== "ganho" && (partesSP(c.inicio) || {}).dia === amanha && Date.parse(c.inicio) > Date.now(),
      aoLembrar: c => { lembrar(c).then(() => { if (vivo && atual) desenhar(); }); },
      lembrado: c => !!c && lembrados.has(`${c.negocio_id}|${c.inicio}`) && (partesSP(c.inicio) || {}).dia >= hoje,
    };
  }
  /** CC-240: «Confirmada» no detalhe — registra que o paciente confirmou (por telefone ou mensagem). Servidor sem a função: o botão some. */
  async function confirmarConsulta(c, botao, pop) {
    try {
      const r = await ui.carregando(botao, () => api.rpcC("nx_agenda_confirmar", { p_negocio: c.negocio_id, p_inicio: c.inicio }));
      erroResposta(r);
      const linha = atual && Array.isArray(atual.consultas) ? atual.consultas.find(x => x && x.negocio_id === c.negocio_id && x.inicio === c.inicio) : null;
      if (linha) linha.confirmada_em = (r && r.confirmada_em) || new Date().toISOString();
      if (pop && typeof pop.fechar === "function") pop.fechar();
      if (vivo && atual) desenhar();
      ui.toast(`${c.nome || c.titulo || "Consulta"} · confirmada.`, { tipo: "ok" });
    } catch (e) {
      if (Lg && typeof Lg.rpcAusente === "function" && Lg.rpcAusente(e)) {
        semConfirmar = true;
        if (botao && typeof botao.remove === "function") botao.remove();
        ui.toast("O servidor ainda não registra a confirmação da consulta. Assim que a atualização estiver no ar, o botão volta.", { tipo: "info" });
        return;
      }
      ui.toast(api.mensagemErro(e), { tipo: "erro" });
    }
  }
  /** CC-323: «Tela da recepção» — tela cheia, só leitura, letras grandes: os próximos atendimentos de hoje (primeiro nome e horário). */
  let tvAberta = null;
  function abrirTV() {
    if (tvAberta || typeof document === "undefined" || !document.body) return;
    const lista = h("ol", { class: "ag-tv-lista" });
    const relogio = h("p", { class: "ag-tv-hora dado", "aria-hidden": "true" });
    const fechar = h("button", { type: "button", class: "bt bt-sec ag-tv-fechar", on: { click: () => fecharTV() } }, "Sair da tela da recepção");
    const el = h("div", { class: "ag-tv", role: "dialog", "aria-modal": "true", "aria-label": "Tela da recepção" },
      h("header", { class: "ag-tv-cab" }, h("h2", null, "Próximos atendimentos"), relogio, fechar), lista);
    const pintar = () => {
      if (!tvAberta) return;
      relogio.textContent = horaTxt((partesSP(new Date()) || { min: 0 }).min);
      ui.limpar(lista);
      const hojeAgora = ui.hojeSP();
      const proximas = consultasDoDia(atual && Array.isArray(atual.consultas) ? atual.consultas : [], hojeAgora)
        .filter(c => c.status !== "ganho" && Date.parse(c.fim || c.inicio) > Date.now() - 10 * 60_000).slice(0, 8);
      if (!proximas.length) lista.appendChild(h("li", { class: "ag-tv-vazio" }, "Sem mais atendimentos hoje."));
      for (const c of proximas) { const p = partesSP(c.inicio); lista.appendChild(h("li", null, h("b", { class: "dado" }, p ? horaTxt(p.min) : ""), h("span", null, primeiroNomeAgenda(c.nome || c.titulo) || "Paciente"))); }
    };
    const tecla = ev => { if (ev.key === "Escape") { ev.preventDefault(); fecharTV(); } };
    const timer = setInterval(pintar, 30_000);
    tvAberta = { el, pintar, fim: () => { clearInterval(timer); document.removeEventListener("keydown", tecla, true); el.remove(); try { if (document.fullscreenElement && document.exitFullscreen) document.exitFullscreen(); } catch { /* ok */ } } };
    document.addEventListener("keydown", tecla, true);
    document.body.appendChild(el);
    pintar();
    try { if (el.requestFullscreen) el.requestFullscreen().catch(() => { /* sem tela cheia: a camada cobre a janela */ }); } catch { /* ok */ }
    try { fechar.focus(); } catch { /* ok */ }
  }
  function fecharTV() { const t = tvAberta; tvAberta = null; if (t) t.fim(); }

  function limparComandoPresenca() {
    if (typeof desregistrarPresenca === "function") try { desregistrarPresenca(); } catch { /* ok */ }
    desregistrarPresenca = null;
  }
  /** A consulta do detalhe aberto é a «selecionada»: se cabe presença, a paleta (Ctrl/⌘+K) ganha «Presença da consulta» (A13); senão sai. */
  function selecionarConsulta(c) {
    consultaSelecionada = c;
    const p = Lg && !semPresenca && ctx.pode("atendente") ? presencaDaConsulta(c, Lg) : null;
    if (!p || !p.possivel) { limparComandoPresenca(); return; }
    if (!desregistrarPresenca && ctx.comandos && typeof ctx.comandos.registrar === "function")
      desregistrarPresenca = ctx.comandos.registrar({ id: "agenda.presenca", fazer: () => perguntarPresenca(consultaSelecionada) });
  }
  /** O comando da paleta: janela curta com «Compareceu», «Faltou» e, se já marcada, «Limpar marcação». */
  async function perguntarPresenca(c) {
    if (!c || !Lg || !vivo) return;
    const viva = (atual && Array.isArray(atual.consultas) ? atual.consultas.map(comPresencaLida).find(x => x && x.negocio_id === c.negocio_id && x.inicio === c.inicio) : null) || c;
    const estado = Lg.presencaDe(viva);
    const nome = viva.nome || viva.titulo || "Consulta";
    const escolha = await ui.modal({ titulo: "Presença da consulta", largura: "p", protegerTexto: false,
      corpo: h("p", null, `${nome} · ${ui.dataHoraBR(viva.inicio)}${estado ? ` · marcada como «${Lg.PRESENCAS[estado].rotulo}»` : ""}`),
      acoes: [{ rotulo: "Cancelar", tipo: "neutro", valor: null },
        estado ? { rotulo: "Limpar marcação", tipo: "neutro", valor: "limpar" } : null,
        { rotulo: Lg.PRESENCAS.faltou.rotulo, tipo: "neutro", valor: "faltou" },
        { rotulo: Lg.PRESENCAS.compareceu.rotulo, tipo: "primario", valor: "compareceu" }].filter(Boolean) });
    if (!escolha || !vivo || escolha === estado) return;
    await marcarPresenca(viva, escolha === "limpar" ? estado : escolha, null);
  }

  /* ============================================================ E3 · próxima consulta fora do período; E5 · confirmação no bloco */
  /** Sem próxima no período: UMA leitura dos 7 dias seguintes (nx_agenda_dia, guardada por período) troca o texto pelo chip da próxima
      («amanhã às 10:00», «sexta às 14:00») ou por «nenhuma nos 7 dias seguintes». Falha de leitura: fica o texto do período. */
  function completarProxima(caixa, { de, umDia, hoje, chave }) {
    if (!de || (!movel && modo === "mes")) return;
    // plano 1000b · CB-144: a próxima de fora respeita o profissional escolhido («Minha agenda» não mostra paciente de outra pessoa);
    // o filtro entra na chave da memória (trocar o filtro não reaproveita a próxima de outro)
    const k = `${de}|${filtroProf}`, filtro = filtroProf;
    let e = proximasFora.get(k);
    if (!e) {
      e = { pronto: false, valor: null, p: null };
      const meu = e;
      e.p = api.rpcC("nx_agenda_dia", { p_data: de, p_dias: 7 })
        .then(r => { meu.valor = proximaConsulta(filtrarPorProfissional(Array.isArray(r && r.consultas) ? r.consultas : [], filtro, eu)); meu.pronto = true; })
        .catch(() => { if (proximasFora.get(k) === meu) proximasFora.delete(k); });
      proximasFora.set(k, e);
    }
    const pintar = sincrono => {
      if (!vivo || !e.pronto || chaveAtual !== chave || (!sincrono && !caixa.isConnected)) return;
      const px = e.valor;
      ui.limpar(caixa);
      caixa.appendChild(px
        ? h("button", { type: "button", class: "agenda-proxima agenda-proxima-fora", on: { click: () => irParaConsultaFora(px) } },
          h("span", { class: "agenda-proxima-rot" }, "Próxima"), h("b", null, px.nome || px.titulo || "Consulta"), h("span", { class: "dado agenda-proxima-quando" }, rotuloProximaFora(px, Date.now(), hoje)))
        : h("span", { class: "agenda-proxima agenda-proxima-vazia narr" }, textoSemProxima({ umDia, desde: de, hojeISO: hoje })));
    };
    if (e.pronto) pintar(true); else e.p.then(() => pintar(false));
  }
  /** Leva a tela ao dia da próxima consulta (outro período: uma leitura nova) e põe o foco no bloco dela. */
  async function irParaConsultaFora(c) {
    const p = partesSP(c && c.inicio);
    if (!p || !vivo) return;
    data = p.dia;
    if (!movel && modo === "mes") modo = "dia";     // plano 1500c · CC-188: no Mês não há bloco para focar — abre o dia
    gravarPreferencias();
    if (!(await carregar()) || !vivo) return;
    const alvo = blocoDaTela(c.negocio_id);
    if (!alvo) {
      // plano 1500c · CC-189: o filtro de profissional esconde a consulta — diz de quem é e oferece «Ver todos»
      if (filtroProf !== "todos") {
        const linha = atual && Array.isArray(atual.consultas) ? atual.consultas.find(x => x && x.negocio_id === c.negocio_id) : null;
        const dono = linha && linha.dono_id != null ? (nomesAtuais[String(linha.dono_id)] || linha.dono_nome || "outro profissional") : "outro profissional";
        ui.toast(`Está na agenda de ${dono}: o filtro «${filtroProf === "eu" ? "Minha agenda" : nomesAtuais[filtroProf] || "Profissional"}» esconde esta consulta.`, { tipo: "info",
          acao: { rotulo: "Ver todos", fn: () => { filtroProf = "todos"; gravarPreferencias(); desenhar(); anunciarPeriodo(); const b = blocoDaTela(c.negocio_id); if (b) try { b.focus({ preventScroll: false }); } catch { b.focus(); } } } });
      }
      return;
    }
    try { alvo.scrollIntoView({ block: "center", behavior: ui.comportamentoRolagem() }); } catch { /* ok */ }
    try { alvo.focus({ preventScroll: true }); } catch { alvo.focus(); }
  }
  /** O bloco (ou o item do painel) da consulta deste negócio na tela, ou null. */
  function blocoDaTela(id) {
    if (id === null || id === undefined) return null;
    const v = String(id).replace(/["\\]/g, "");
    return conteudo.querySelector(`.ag-item[data-negocio="${v}"] .ag-bloco`) || conteudo.querySelector(`.ag-painel-li[data-negocio="${v}"] .ag-painel-item`);
  }
  /** E5: marcou ou remarcou — o bloco da consulta, já no lugar novo, confirma com o check (ui.checkSucesso). */
  function confirmarNoBloco(id, texto) {
    const alvo = blocoDaTela(id);
    if (alvo && typeof ui.checkSucesso === "function") ui.checkSucesso(alvo, { texto });
    return !!alvo;
  }

  /* ============================================================ E6 · «Lembrar» */
  const copiarSemAviso = async t => { try { return typeof ui.copiar === "function" ? !!(await ui.copiar(t, { aviso: null })) : false; } catch { return false; } };
  /** Plano 1500c · CC-179: a conversa é do número oficial da Meta e a janela de 24 h fechou? (aparelho CodeWords não tem janela) */
  function janelaFechadaMeta(conv) {
    const prov = String(conv.provedor || conv.canal_provedor || (conv.canal && conv.canal.provedor) || "").toLowerCase();
    if (!/meta|cloud|oficial/.test(prov)) return false;
    if (Lg && typeof Lg.janelaAberta === "function") try { return !Lg.janelaAberta(conv); } catch { /* segue a conta local */ }
    const ate = Date.parse(conv.janela_ate);
    const ent = Date.parse(conv.ultima_entrada_em);
    const fim = Number.isFinite(ate) ? ate : Number.isFinite(ent) ? ent + 24 * 3600e3 : NaN;
    return !(fim > Date.now());
  }
  /** Plano 1500c · CC-206: o nome da empresa (ctx.cliente) e o endereço das configurações da IA (nx_cv_base; lido uma vez, só se houver Conversas). */
  let empresaP = null;
  function dadosDaEmpresa() {
    if (!empresaP) {
      const empresa = ctx.cliente && typeof ctx.cliente.nome === "string" ? ctx.cliente.nome.trim().slice(0, 80) : "";
      empresaP = !(ctx.temModulo && ctx.temModulo("conversas")) ? Promise.resolve({ empresa, endereco: "" })
        : Promise.resolve(api.rpcC("nx_cv_base", {}, { cache: true })).then(b => ({ empresa, endereco: (b && b.config && b.config.ia && typeof b.config.ia.endereco === "string" && b.config.ia.endereco) || (b && b.ia && typeof b.ia.endereco === "string" && b.ia.endereco) || "" }))
          .catch(() => ({ empresa, endereco: "" }));
    }
    return empresaP;
  }
  /** Abre a conversa do contato com o lembrete pronto no campo (rascunho da conversa; o composer mostra «Rascunho restaurado»). Nada é enviado
      sozinho. Sem conversa, ou com um rascunho da pessoa lá, o texto vai para a área de transferência (o rascunho dela nunca é sobrescrito). */
  async function lembrar(c, tipo = "lembrete") {
    // CA-176/CA-178: a mesma rotina deixa pronta a confirmação (depois de marcar) e o aviso de desmarcação
    // plano 1500c · CC-205/CC-206: a palavra da vertical; o lembrete diz de onde é (empresa) e onde fica (endereço da IA, quando houver)
    const extra = tipo === "lembrete" ? await dadosDaEmpresa() : {};
    if (!vivo) return;
    const fn = { confirmacao: textoConfirmacao, desmarcacao: textoDesmarcacao, remarcacao: textoRemarcacao, falta: textoFalta }[tipo] || textoLembrete;
    const texto = fn(c, ui.hojeSP(), { vocab: ctx.vocab || null, ...extra });
    if (!texto || !c || c.contato_id == null) return;
    let conv = null, leu = false;
    try { const r = await api.rpcC("nx_contato_ver", { p_id: c.contato_id }); conv = conversaDoContato(r && r.conversas); leu = !!(r && Array.isArray(r.conversas)); }
    catch { /* sem a ficha: a rota por contato escolhe a conversa */ }
    if (!vivo) return;
    // plano 1500c · CC-179: no número da Meta, com a janela de 24 h fechada, texto livre não sai — copia e manda usar o modelo
    if (conv && conv.status !== "resolvida" && janelaFechadaMeta(conv)) {
      const copiou = await copiarSemAviso(texto);
      if (!vivo) return;
      ctx.navegar(`#/conversas/${encodeURIComponent(conv.id)}`);
      ui.toast(`Fora das 24 h do número da Meta: texto livre não sai. Use o modelo de lembrete (botão de modelos da conversa).${copiou ? " O texto sugerido foi copiado." : ` Texto: ${texto}`}`, { tipo: "info", ms: 9000 });
      if (tipo === "lembrete") marcarLembrado(c);
      return;
    }
    if (tipo === "lembrete") marcarLembrado(c);      // CC-226: a linha mostra «Lembrado» até amanhã
    // plano 1000b · CB-195 / CB-200: sem conversa ABERTA o campo não aceita texto (resolvida = travada; a Nova conversa no número da Meta
    // só sai com modelo) — o texto vai para a área de transferência e o aviso diz o caminho, sem prometer «confira e envie»
    if (conv ? conv.status === "resolvida" : leu) {
      const copiou = await copiarSemAviso(texto);
      if (!vivo) return;
      ctx.navegar(conv ? `#/conversas/${encodeURIComponent(conv.id)}` : `#/conversas?contato=${encodeURIComponent(c.contato_id)}`);
      ui.toast(avisoSemConversaAberta(!!conv, copiou, texto), { tipo: "info", ms: 9000 });
      return;
    }
    const chave = conv ? `conversa:${conv.id}` : null;
    const jaTinha = !!(chave && ctx.rascunho && typeof ctx.rascunho.existe === "function" && ctx.rascunho.existe(chave));
    const pronto = chave && !jaTinha ? prepararRascunho(ctx.rascunho, chave, texto) : false;
    const copiado = pronto ? false : await copiarSemAviso(texto);
    ctx.navegar(conv ? `#/conversas/${encodeURIComponent(conv.id)}` : `#/conversas?contato=${encodeURIComponent(c.contato_id)}`);
    const lemb = tipo === "lembrete";
    ui.toast(pronto ? (lemb ? "Lembrete pronto no campo da conversa — confira e envie." : "Mensagem pronta no campo da conversa — confira e envie.")
      : jaTinha ? (copiado ? `A conversa já tinha um rascunho: ${lemb ? "o lembrete" : "a mensagem"} foi copiad${lemb ? "o" : "a"} para você colar.` : `A conversa já tinha um rascunho. ${lemb ? "Lembrete" : "Mensagem"}: ${texto}`)
        : copiado ? (lemb ? "Lembrete copiado — cole na conversa e envie." : "Mensagem copiada — cole na conversa e envie.") : `${lemb ? "Lembrete" : "Mensagem"}: ${texto}`, { tipo: "info", ms: 7000 });
  }

  /** CA-256: o negócio abre na gaveta por cima da Agenda (como em Conversas) e a agenda relê se ele mudar; sem a ponte do shell, a rota do CRM. */
  function abrirFicha(id) {
    if (typeof ctx.abrirNegocio === "function") {
      try { ctx.abrirNegocio(id, { aoMudar: () => { notasLidas.delete(id); if (vivo) recarregar(); } }); return; } catch (e) { console.error(e); }   // plano 1500c · CC-328
    }
    ctx.navegar(`#/crm/negocio/${encodeURIComponent(id)}`);
  }
  /** Detalhe da consulta ao tocar no bloco: quem, quando, telefone (toque para ligar), origem, presença (E1, consulta que já passou) e as ações
      (Abrir conversa, Lembrar, Abrir negócio, Remarcar, Desmarcar). Abrir o detalhe «seleciona» a consulta para a paleta. */
  function abrirDetalhe(c, ancora) {
    const nome = c.nome || c.titulo || "Consulta sem nome";
    const p = partesSP(c.inicio);
    // plano 1500c · CC-228: sem a crm-logica ainda (detalhe aberto no primeiro segundo), o tel: sai de uma regra local mínima
    const hrefTel = c.telefone ? (Lg ? Lg.hrefTel(c.telefone) : telLocal(c.telefone)) : null;
    const comConversas = !!(c.contato_id && ctx.temModulo && ctx.temModulo("conversas"));
    const pode = ctx.pode("atendente");
    const futura = Date.parse(c.inicio) > Date.now() && c.status !== "ganho";
    const feita = c.status === "ganho";
    selecionarConsulta(c);
    const pr = Lg && !semPresenca ? presencaDaConsulta(c, Lg) : null;
    const presencaEl = pr && pr.possivel ? montarPresenca({ h, c, estado: pr.estado, icone: ui.icone, rotulos: Lg.PRESENCAS, desabilitado: !pode,
      aoMarcar: (cc, est, b) => { pop.fechar(); marcarPresenca(cc, est, b); } }) : null;
    if (presencaEl && !pr.conhecida) lerPresencasQueFaltam([c]).then(() => {
      const est = presencasLidas.get(chavePresenca(c)) || null;
      for (const b of presencaEl.querySelectorAll(".ag-pres-bt")) b.setAttribute("aria-pressed", String(b.dataset.estado === est));
    });
    const abrirNegocio = () => { pop.fechar(); abrirFicha(c.negocio_id); };
    // CA-206: no celular (sem arrasto) remarcar para o dia ou a semana seguinte no mesmo horário é um toque + a confirmação «De → Para»
    // plano 1500c · CC-218: também no desktop (remarcar sem mouse); CC-177: o rótulo diz o dia REAL (o próximo dia de atendimento)
    const dAm = p ? diaDoAtalho(p.dia, 1) : null, dSem = p ? diaDoAtalho(p.dia, 7) : null;
    const atalhosRemarcar = pode && !feita && p && (dAm || dSem)
      ? h("div", { class: "ag-det-atalhos", role: "group", "aria-label": "Remarcar no mesmo horário" },
        dAm ? h("button", { type: "button", class: "bt bt-fant bt-p ag-det-amanha", "aria-label": `Remarcar para ${rotuloDoDia(dAm, ui.hojeSP()).toLowerCase()} às ${horaTxt(p.min)}`,
          on: { click: () => { pop.fechar(); remarcarAtalho(c, 1); } } }, dAm === diaISO(p.dia, 1) ? "Dia seguinte" : `Próximo dia (${rotuloDoDia(dAm, ui.hojeSP()).toLowerCase()})`) : null,
        dSem ? h("button", { type: "button", class: "bt bt-fant bt-p ag-det-semana", "aria-label": `Remarcar para ${rotuloDoDia(dSem, ui.hojeSP()).toLowerCase()} às ${horaTxt(p.min)}`,
          on: { click: () => { pop.fechar(); remarcarAtalho(c, 7); } } }, dSem === diaISO(p.dia, 7) ? "Semana seguinte" : `${rotuloDoDia(dSem, ui.hojeSP())}`) : null)
      : null;
    const faltou = !!(pr && pr.estado === "faltou") || c.marco === "faltou" || c.presenca === "faltou";
    // plano 1500c · CC-227: sem o módulo Conversas, o WhatsApp do aparelho (wa.me) com o lembrete pronto
    const waLink = !comConversas && pode && c.telefone ? linkWhatsAppAgenda(c.telefone, futura ? textoLembrete(c, ui.hojeSP(), { vocab: ctx.vocab || null }) : faltou ? textoFalta(c, ui.hojeSP(), { vocab: ctx.vocab || null }) : "") : null;
    const acoes = h("div", { class: "ag-det-acoes" },
      comConversas ? h("button", { type: "button", class: "bt bt-sec bt-p", on: { click: () => { pop.fechar(); ctx.navegar(`#/conversas?contato=${encodeURIComponent(c.contato_id)}`); } } }, ui.icone("whatsapp"), "Abrir conversa") : null,
      waLink ? h("a", { class: "bt bt-sec bt-p ag-det-wa", href: waLink, target: "_blank", rel: "noopener noreferrer" }, ui.icone("whatsapp"), futura ? "Lembrar pelo WhatsApp" : "WhatsApp") : null,
      comConversas && pode && futura ? h("button", { type: "button", class: "bt bt-sec bt-p ag-det-lembrar", title: "Abre a conversa com o lembrete pronto no campo: você confere e envia",
        on: { click: () => { pop.fechar(); lembrar(c); } } }, ui.icone("sino"), "Lembrar") : null,
      // plano 1500c · CC-223: quem faltou ganha a mensagem pronta para remarcar
      comConversas && pode && faltou && !futura ? h("button", { type: "button", class: "bt bt-sec bt-p ag-det-falta", title: "Abre a conversa com a mensagem pronta no campo: você confere e envia",
        on: { click: () => { pop.fechar(); lembrar(c, "falta"); } } }, ui.icone("sino"), "Escrever: remarcar") : null,
      // plano 1500c · CC-240: confirmou por telefone? registra (nx_agenda_confirmar; servidor sem a função → o botão some)
      pode && futura && !c.confirmada_em && !semConfirmar ? h("button", { type: "button", class: "bt bt-sec bt-p ag-det-confirmar", on: { click: ev => confirmarConsulta(c, ev.currentTarget || ev.target, pop) } }, ui.icone("check"), "Confirmada") : null,
      h("button", { type: "button", class: "bt bt-sec bt-p ag-det-negocio", on: { click: abrirNegocio } }, palavrasAgenda(ctx.vocab).abrirNeg),   // CB-189
      // plano 1500c · CC-180: consulta concluída não remarca nem desmarca (desmarcar apagava o horário do histórico)
      pode && !feita ? h("button", { type: "button", class: "bt bt-sec bt-p ag-det-remarcar", on: { click: () => { pop.fechar(); abrirAgendamento(c); } } }, "Remarcar") : null);
    // plano 1500c · CC-301: «Desmarcar» (perigo) numa linha própria, separado por divisória — um toque errado não cai nele
    const perigo = pode && !feita ? h("div", { class: "ag-det-perigo" },
      h("button", { type: "button", class: "bt bt-contorno-perigo bt-p ag-det-desmarcar", on: { click: () => { pop.fechar(); desmarcar(c); } } }, "Desmarcar")) : null;
    // CA-257: a observação/última nota do negócio («trazer exames»), numa linha — lida da ficha uma vez por negócio nesta tela
    // plano 1500c · CC-245/CC-246: a observação da consulta e a última nota, quando o servidor já mandar na linha, dispensam a leitura da ficha
    const notaEl = h("p", { class: "ag-det-nota", hidden: true });
    const notaPronta = typeof c.obs === "string" && c.obs.trim() ? `Observação: ${c.obs.trim()}` : typeof c.ultima_nota === "string" ? (c.ultima_nota.trim() ? ultimaNota([{ texto: c.ultima_nota }]) : "") : null;
    (notaPronta !== null ? Promise.resolve(notaPronta) : lerUltimaNota(c.negocio_id)).then(t => { if (t) { notaEl.textContent = t; notaEl.title = t; notaEl.hidden = false; } });
    const etapa = etapaDo(c), origemTxt = origemDo(c);
    const corpo = h("div", { class: "ag-det" },
      h("b", { class: "ag-det-nome" }, nome),
      h("span", { class: "ag-det-quando dado" }, `${p ? nomeDia(p.dia) : ""} · ${ui.horaBR(c.inicio)}${c.fim ? `–${ui.horaBR(c.fim)}` : ""}`),
      c.servico ? h("span", null, c.servico) : null,
      c.telefone ? (hrefTel
        ? h("a", { class: "dado ag-det-tel", href: hrefTel, "aria-label": `Ligar para ${nome}, ${ui.telBR(c.telefone)}` }, ui.icone("telefone"), ui.telBR(c.telefone))
        : h("span", { class: "dado" }, ui.telBR(c.telefone))) : null,
      // CA-280: origem e etapa em linhas próprias (antes «WhatsApp · Avaliação agendada» parecia uma coisa só)
      // plano 1000b · CB-164: sem origem conhecida a linha sai («Origem: Origem não informada» não dizia nada)
      origemTxt !== SEM_ORIGEM ? h("span", { class: "ag-det-origem" }, h("span", { class: "ag-det-rot" }, "Origem: "), origemTxt) : null,
      etapa ? h("span", { class: "ag-det-origem ag-det-etapa" }, h("span", { class: "ag-det-rot" }, "Etapa: "), etapa) : null,
      c.confirmada_em && !feita ? h("span", { class: "pilula pilula-ok ag-det-confirmada" }, "Confirmada") : null,   // CC-239
      c.marcado_por === "ia" ? h("span", { class: "ag-det-origem ag-det-ia" }, ui.icone("ia"), "Marcada pela IA") : null,   // CC-324
      notaEl,
      presencaEl,
      atalhosRemarcar,
      acoes,
      perigo);
    const pop = ui.flutuante(ancora, corpo, { classe: "flut-ag" });
    // plano 1000b · CB-163: o diálogo do detalhe ganha nome («Consulta de Mariana Costa, Qui., 02 de out. 10:00»)
    const rotuloDet = `Consulta de ${nome}${p ? `, ${nomeDia(p.dia)} ${horaTxt(p.min)}` : ""}`;
    if (pop && pop.el && typeof pop.el.setAttribute === "function") pop.el.setAttribute("aria-label", rotuloDet);
    return pop;
  }
  /** CA-257: o texto da nota mais recente (a fixada primeiro, como a ficha mostra) — "" sem nota ou sem a leitura. */
  const notasLidas = new Map();     // plano 1500c · CC-328: esvaziada no «Atualizar» e quando a gaveta do negócio muda algo
  function lerUltimaNota(id) {
    if (id === null || id === undefined) return Promise.resolve("");
    if (!notasLidas.has(id)) {
      notasLidas.set(id, Promise.resolve(api.rpcC("nx_negocio_ver", { p_id: id }))
        .then(d => ultimaNota(d && d.notas))
        .catch(() => { notasLidas.delete(id); return ""; }));
    }
    return notasLidas.get(id);
  }

  /* ============================================================ marcar / remarcar / desmarcar (as janelas são marcarConsulta e desmarcarConsulta) */
  const recarregar = () => carregar({ silencioso: true, forcar: true });
  /** pre = consulta a remarcar (ou null); quando = {dia, hora} do clique na grade ou do «+» do dia */
  /** Marcou/remarcou pela janela: relê o período e o bloco da consulta confirma com o check (E5); o Desfazer (aoMudar(null)) só relê. */
  const aoMarcado = r => recarregar().then(() => {
    if (vivo && r && r.ok) confirmarNoBloco(r.negocio_id ?? (r.consulta && r.consulta.negocio_id), r.remarcada ? "Consulta remarcada" : "Consulta marcada");
  });
  /** CA-176/CA-178: «Avisar paciente» no aviso de marcar/desmarcar — a linha da agenda (já relida) dá o contato e o nome; nada é enviado sozinho. */
  const avisarPaciente = ctx.temModulo && ctx.temModulo("conversas") ? (info, tipo) => {
    const linha = atual && Array.isArray(atual.consultas) ? atual.consultas.find(x => x && info && x.negocio_id === info.negocio_id) : null;
    // o que veio do aviso (horário novo, serviço) vale; a linha relida completa o que faltar (contato, nome)
    const c = { ...(linha && tipo !== "desmarcacao" ? linha : {}), ...Object.fromEntries(Object.entries(info || {}).filter(([, v]) => v !== null && v !== undefined)) };
    if (c.contato_id == null) { ui.toast("Esta consulta não tem contato com conversa. Abra o negócio para falar com o paciente.", { tipo: "info" }); return; }
    lembrar(c, tipo);
  } : null;
  const abrirAgendamento = (pre = null, quando = null) => offline()
    ? (ui.toast("Sem internet: marcar exige conexão. Assim que a conexão voltar, tente de novo.", { tipo: "info" }), Promise.resolve(null))
    : marcarConsulta(ctx, { negocio: pre, dia: quando && quando.dia, hora: quando && quando.hora, base: data,
    config: atual && atual.config ? atual.config : null, avisar: avisarPaciente, encaixeAgora: !!(quando && quando.encaixeAgora),   // plano 1500c · CC-253
    aoBloquear: ctx.pode("admin") && quando && quando.dia && quando.hora ? bloquearHorario : null, aoMudar: aoMarcado });
  /** CA-215: «Bloquear este horário» (admin, a partir do clique no vazio): das HH:MM até HH:MM + o passo da agenda, motivo opcional
      (nx_agenda_bloqueio_salvar, o mesmo das Configurações). Consulta que já cai no trecho avisa antes (2º toque salva mesmo assim). */
  async function bloquearHorario({ dia, hora, existente = null }) {
    if (!vivo || !dataAgendaValida(dia)) return;
    const cfg = (atual && atual.config) || {};
    const passo = Math.max(5, Number(cfg.passo_min) || Number(cfg.duracao_min) || 30);
    // plano 1500c · CC-280: editar o bloqueio tocado na grade (mesmo trecho e motivo; o servidor atualiza pelo id)
    const ed = existente ? (() => { const i = partesSP(existente.inicio), f = partesSP(existente.fim); const todo = diaTodoBloqueado([existente], dia);
      return { das: !todo && i && i.dia === dia ? horaTxt(i.min) : "", ate: !todo && f && f.dia === dia ? horaTxt(f.min) : "", todo, motivo: existente.motivo || "" }; })() : null;
    const ini = ed ? (paraMin(ed.das) ?? 8 * 60) : paraMin(hora);
    if (ini === null) return;
    const ateMin = Math.min(23 * 60 + 59, ini + passo);
    const das = ui.campo({ rotulo: "Das", nome: "das", tipo: "hora", valor: ed ? ed.das : hora });
    const ate = ui.campo({ rotulo: "Até", nome: "ate", tipo: "hora", valor: ed ? ed.ate : horaTxt(ateMin) });
    const motivo = ui.campo({ rotulo: "Motivo (opcional)", nome: "motivo", max: 120, placeholder: "Ex.: reunião, folga, manutenção", valor: ed ? ed.motivo : undefined });
    // plano 1500c · CC-229: «Dia inteiro» fecha o dia todo pela grade (grava sem das/até), sem ir às Configurações
    const diaTodoChk = h("input", { type: "checkbox", name: "dia_inteiro", class: "ag-bloq-dia-todo", checked: !!(ed && ed.todo) });
    const horas = h("div", { class: "agenda-form-grade", hidden: !!(ed && ed.todo) }, das, ate);
    diaTodoChk.addEventListener("change", () => { horas.hidden = diaTodoChk.checked; });
    const corpo = h("div", { class: "pilha ag-bloquear" }, h("p", null, `${nomeDia(dia, true)}. Ninguém (nem a IA) marca consulta neste trecho.`),
      h("label", { class: "ag-encaixe ag-bloq-dia-todo-rot" }, diaTodoChk, h("span", null, "Dia inteiro")), horas, motivo);
    let conferido = "";
    const r = await ui.modal({ titulo: ed ? "Editar bloqueio" : "Bloquear horário", corpo, largura: "p", acoes: [
      { rotulo: "Cancelar", tipo: "neutro", valor: null },
      ed && existente.id != null ? { rotulo: "Remover bloqueio", tipo: "neutro", fn: async m => {
        try { return { ...erroResposta(await api.rpcC("nx_agenda_bloqueio_excluir", { p_id: existente.id })), removido: true }; } catch (e) { m.erro(api.mensagemErro(e)); return false; }
      } } : null,
      { rotulo: ed ? "Salvar bloqueio" : "Bloquear", tipo: "primario", fn: async m => {
        const todo = diaTodoChk.checked;
        const vDas = todo ? "00:00" : das.querySelector("input").value, vAte = todo ? "24:00" : ate.querySelector("input").value, vMot = motivo.querySelector("input").value.trim();
        const a = paraMin(vDas), b = paraMin(vAte);
        if (a === null || b === null || b <= a) { m.erro("O horário final precisa ser depois do inicial."); return false; }
        const caem = consultasDoDia(atual && Array.isArray(atual.consultas) ? atual.consultas : [], dia)
          .map(c => ({ c, p: minutosDaConsulta(c, Number(cfg.duracao_min) || 30) })).filter(x => x.p && x.p.ini < b && x.p.fim > a);
        const chave = `${vDas}|${vAte}`;
        if (caem.length && chave !== conferido) {
          conferido = chave;
          m.erro(`${caem.length === 1 ? "Há 1 consulta" : `Há ${caem.length} consultas`} nesse trecho (${caem.slice(0, 2).map(x => `${horaTxt(x.p.ini)} ${x.c.nome || x.c.titulo || "consulta"}`).join(", ")}). Ela continua marcada — toque em «Bloquear» de novo para fechar mesmo assim.`);
          return false;
        }
        const p = { ...(ed && existente.id != null ? { id: existente.id } : {}), data: dia, ...(todo ? {} : { das: vDas, ate: vAte }), motivo: vMot || null };
        try { return erroResposta(await api.rpcC("nx_agenda_bloqueio_salvar", { p_bloqueio: p })); }
        catch (e) { m.erro(api.mensagemErro(e)); return false; }
      } },
    ].filter(Boolean) });
    if (!(r && r.ok) || !vivo) return;
    if (r.removido) { recarregar(); ui.toast("Bloqueio removido.", { tipo: "ok" }); return; }
    if (ed) { recarregar(); ui.toast("Bloqueio atualizado.", { tipo: "ok" }); return; }
    const texto = `Horário bloqueado: ${rotuloDoDia(dia, ui.hojeSP())}, ${diaTodoChk.checked ? "o dia inteiro" : `${das.querySelector("input").value}–${ate.querySelector("input").value}`}`;
    recarregar();
    // plano 1000b · CB-199: fechou o horário errado? «Desfazer» exclui o bloqueio criado (sem ir às Configurações)
    if (r.id != null && typeof ui.acaoComDesfazer === "function") {
      ui.acaoComDesfazer({ texto, reverter: async () => { erroResposta(await api.rpcC("nx_agenda_bloqueio_excluir", { p_id: r.id })); if (vivo) recarregar(); } });
    } else ui.toast(`${texto}.`, { tipo: "ok" });
  }
  /** Plano 1500c · CC-280: tocar no bloqueio da grade (admin) abre o editar desse bloqueio. */
  function editarBloqueioDaGrade(b, iso) {
    if (!ctx.pode("admin")) return;
    const i = partesSP(b.inicio), f = partesSP(new Date(Date.parse(b.fim) - 1));
    // bloqueio de vários dias (férias) não é editado por um dia só (salvar cortaria o resto): vai às Configurações
    if (!i || !f || i.dia !== f.dia) {
      ui.toast("Bloqueio de vários dias: edite em Configurações › Agenda.", { tipo: "info", acao: { rotulo: "Abrir", fn: () => ctx.navegar("#/config/agenda") } });
      return;
    }
    bloquearHorario({ dia: iso, hora: null, existente: b });
  }
  const desmarcar = c => desmarcarConsulta(ctx, c, { aoMudar: recarregar, avisar: avisarPaciente,
    aoFaltou: Lg && !semPresenca ? cc => marcarPresenca(cc, "faltou", null) : null });   // plano 1000b · CB-174

  /** CA-188: «Procurar paciente» — busca as oportunidades (nx_buscar), lê a consulta de cada uma (até 8) e lista as que têm consulta de hoje
      em diante, com «Ir para» (leva a tela ao dia e foca o bloco). */
  async function procurarPaciente() {
    const caixa = h("div", { class: "pilha ag-procurar" });
    const PC = palavrasAgenda(ctx.vocab), quemRot = PC.contato.charAt(0).toUpperCase() + PC.contato.slice(1);   // plano 1500c · CC-209
    const campo = ui.campo({ rotulo: quemRot, nome: "paciente", tipo: "busca", placeholder: "Nome ou telefone", ajuda: "Mostra as próximas consultas de quem tem o nome ou telefone." });
    const input = campo.querySelector("input");
    // plano 1000b · CB-162: a lista NÃO é região viva (cada busca lia todos os nomes e datas); um status curto diz o resultado
    const lista = h("div", { class: "ag-procurar-lista" });
    const statusBusca = h("p", { class: "campo-ajuda ag-procurar-status", role: "status", "aria-live": "polite" });
    const dizer = t => { statusBusca.textContent = t || ""; };
    caixa.append(campo, statusBusca, lista);
    let fecharCom = null, seq = 0;
    const fichasLidas = new Map();   // CB-179
    async function buscar() {
      const q = input.value.trim();
      const minha = ++seq;
      ui.limpar(lista);
      dizer("");
      if (q.length < 2) { if (q.length) dizer(TEXTO_BUSCA_CURTA); return; }
      dizer("Procurando…");
      try {
        const r = await api.rpcC("nx_buscar", { p_q: q });
        // plano 1500c · CC-293: confere até 30 (cache, 4 por vez) e corta em 8 DEPOIS de achar quem tem consulta — a do 12º não some
        const negocios = escolherCandidatos(r && Array.isArray(r.negocios) ? r.negocios : [], 30);
        // plano 1000b · CB-179: a ficha de cada um é lida uma vez por janela (cache por id), no máximo 4 ao mesmo tempo; se a busca já trouxer
        // consulta_em, nem lê
        const fichas = [];
        await comLimite(negocios, 4, async n => {
          if (Object.hasOwn(n, "consulta_em")) { fichas.push({ n, d: { negocio: { consulta_em: n.consulta_em } } }); return; }
          if (!fichasLidas.has(n.id)) fichasLidas.set(n.id, api.rpcC("nx_negocio_ver", { p_id: n.id }).catch(() => { fichasLidas.delete(n.id); return null; }));
          fichas.push({ n, d: await fichasLidas.get(n.id) });
        });
        if (minha !== seq || !vivo) return;
        const hojeIni = instanteNoFuso(ui.hojeSP());
        const todasF = fichas.map(({ n, d }) => ({ n, em: d && d.negocio ? d.negocio.consulta_em : null, contato: d && d.contato ? d.contato.nome : null,
          presenca: d && d.negocio ? ((d.negocio.campos && d.negocio.campos.presenca) || d.negocio.presenca || null) : null }));
        const achadas = todasF.filter(x => x.em && Date.parse(x.em) >= hojeIni).sort((a, b) => Date.parse(a.em) - Date.parse(b.em)).slice(0, 8);
        // plano 1500c · CC-294: quem não tem consulta futura mostra a última («Última: 12/09 (compareceu)»)
        const comFutura = new Set(todasF.filter(x => x.em && Date.parse(x.em) >= hojeIni).map(x => x.n.id));
        const ultimas = todasF.filter(x => x.em && Date.parse(x.em) < hojeIni && !comFutura.has(x.n.id)).sort((a, b) => Date.parse(b.em) - Date.parse(a.em)).slice(0, 5);
        ui.limpar(lista);
        if (!achadas.length && !ultimas.length) { dizer(negocios.length ? "Nenhuma consulta de hoje em diante para esse nome." : "Ninguém com esse nome ou telefone."); return; }
        dizer(achadas.length ? `${achadas.length} ${achadas.length === 1 ? "consulta encontrada" : "consultas encontradas"}.` : "Nenhuma consulta de hoje em diante para esse nome.");
        for (const x of ultimas) {
          const nome = x.n.contato_nome || x.contato || x.n.titulo || "Paciente";
          lista.appendChild(h("div", { class: "ag-procurar-item ag-procurar-ultima" },
            h("span", { class: "ag-procurar-txt" }, h("b", null, nome), h("small", { class: "dado" }, `${textoUltimaConsulta(x.em, x.presenca)}${x.n.titulo && x.n.titulo !== nome ? ` · ${x.n.titulo}` : ""}`))));
        }
        for (const x of achadas) {
          const nome = x.n.contato_nome || x.contato || x.n.titulo || "Paciente";
          lista.appendChild(h("div", { class: "ag-procurar-item" },
            h("span", { class: "ag-procurar-txt" }, h("b", null, nome), h("small", { class: "dado" }, `${rotuloProximaFora({ inicio: x.em }, Date.now(), ui.hojeSP())}${x.n.titulo && x.n.titulo !== nome ? ` · ${x.n.titulo}` : ""}`)),
            h("button", { type: "button", class: "bt bt-sec bt-p", "aria-label": `Ir para a consulta de ${nome}`, on: { click: () => { if (fecharCom) fecharCom({ negocio_id: x.n.id, inicio: x.em }); } } }, "Ir para")));
        }
      } catch (e) { if (minha === seq) { ui.limpar(lista); dizer(""); lista.appendChild(h("p", { class: "agenda-erro", role: "alert" }, api.mensagemErro(e))); } }
    }
    const depois = ui.debounce(buscar, 300);
    input.addEventListener("input", depois);
    input.addEventListener("keydown", ev => { if (ev.key === "Enter") { ev.preventDefault(); if (depois.cancelar) depois.cancelar(); buscar(); } });
    const escolha = await ui.modal({ titulo: `Procurar ${PC.contato}`, corpo: caixa, largura: "p", protegerTexto: false,
      aoAbrir: a => { fecharCom = v => a.fechar(v); try { input.focus(); } catch { /* ok */ } },
      acoes: [{ rotulo: "Fechar", tipo: "neutro", valor: null }] });
    if (!vivo || !escolha || !escolha.inicio) return;
    irParaConsultaFora(escolha);
  }

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
  // CA-260: «Ir para a data…» na paleta (Agenda de 25/10 sem clicar semana a semana): abre o seletor de data do cabeçalho
  const desregistrarData = ctx.comandos && typeof ctx.comandos.registrar === "function"
    ? ctx.comandos.registrar({ id: "agenda.data", rotulo: "Ir para a data…", palavras: "agenda data dia ir calendario semana mes pular", icone: "calendario", fazer: irParaData }) : null;
  /* plano 1000b · CB-151: «Desligar/Ligar atalhos de uma tecla» na paleta (lembrado nas preferências); desligados, os botões deixam de
     anunciar aria-keyshortcuts e a folha «?» não lista D/S/M/L */
  let desregistrarAtalhos = null, desregistrarModos = [];
  function aplicarAtalhos() {
    const pares = [[ctl.anterior, "["], [ctl.proximo, "]"], [ctl.hoje, "T"], [ctl.marcar, "N"],   // plano 1500c · CC-300
      ...(ctl.alternador ? [...ctl.alternador.querySelectorAll("[data-valor]")].map(b => [b, ATALHO_MODO[b.dataset.valor]]) : [])];
    for (const [b, t] of pares) if (b && t) { if (atalhosLigados) b.setAttribute("aria-keyshortcuts", t); else b.removeAttribute("aria-keyshortcuts"); }
    if (ctl.hoje) ctl.hoje.setAttribute("title", ctl.hoje.classList.contains("agenda-hoje-atual") ? "Você já está vendo hoje" : atalhosLigados ? "Voltar para hoje (T)" : "Voltar para hoje");
    if (!(ctx.comandos && typeof ctx.comandos.registrar === "function")) return;
    for (const f of [desregistrarAtalhos, ...desregistrarModos]) if (typeof f === "function") try { f(); } catch { /* ok */ }
    // CA-259: os atalhos de visão aparecem na folha «?» (a tela trata as teclas em aoTeclaAgenda) — só quando ligados
    desregistrarModos = atalhosLigados ? Object.entries(ATALHO_MODO).map(([m, t]) => ctx.comandos.registrar({ id: `agenda.ver-${m}`, rotulo: `Ver ${m === "mes" ? "o mês" : m === "lista" ? "a lista" : m === "dia" ? "o dia" : "a semana"}`, atalho: t, palavras: "agenda visão", fazer: () => trocarModo(m) })) : [];
    desregistrarAtalhos = ctx.comandos.registrar({ id: "agenda.atalhos", rotulo: atalhosLigados ? "Desligar atalhos de uma tecla da Agenda" : "Ligar atalhos de uma tecla da Agenda",
      palavras: "agenda atalhos teclado tecla acessibilidade leitor voz", fazer: () => {
        atalhosLigados = !atalhosLigados; gravarPreferencias(); aplicarAtalhos();
        ui.toast(atalhosLigados ? "Atalhos de uma tecla ligados (T, N, D, S, M, L, [ e ])." : "Atalhos de uma tecla desligados. Para ligar de novo, use a paleta (Ctrl+K).", { tipo: "info" });
      } });
  }
  function irParaData() {
    const s = ctl.seletor;
    if (!s || !vivo) return;
    try { s.focus({ preventScroll: false }); } catch { s.focus(); }
    try { if (typeof s.showPicker === "function") s.showPicker(); } catch { /* sem o seletor nativo: o campo já está com o foco */ }
  }
  // CA-263: a conexão caiu ou voltou — o «Marcar consulta» do cabeçalho acompanha
  const aoMudarConexao = () => { if (vivo) montarCabecalho(); };
  if (typeof addEventListener === "function") { addEventListener("online", aoMudarConexao); addEventListener("offline", aoMudarConexao); }
  // plano 1000b · CB-166: o estado da rede do app (offline por falhas, com o navigator dizendo online) também atualiza o botão
  let desassinarRede = null;
  // (ctx.rede.assinar avisa na queda E na volta; shell antigo só tem aoVoltar — «Marcar» confere estaOffline na hora do toque de qualquer jeito)
  const assinarRede = ctx.rede && (typeof ctx.rede.assinar === "function" ? ctx.rede.assinar : typeof ctx.rede.aoVoltar === "function" ? ctx.rede.aoVoltar : null);
  if (assinarRede) try { desassinarRede = assinarRede.call(ctx.rede, aoMudarConexao); } catch { desassinarRede = null; }

  // a limpeza fica guardada no módulo ANTES de qualquer espera: se a pessoa sair da Agenda com a 1ª carga em andamento, o desmontar() já a encontra
  const limpar = () => {
    vivo = false; sequencia++;
    limparArrasto();
    document.removeEventListener("keydown", aoTeclaAgenda);
    fecharTV();      // plano 1500c · CC-323
    if (desarmarEngolir) desarmarEngolir();
    if (typeof desregistrar === "function") try { desregistrar(); } catch { /* ok */ }
    for (const f of [desregistrarData, desregistrarAtalhos, ...desregistrarModos]) if (typeof f === "function") try { f(); } catch { /* ok */ }
    if (typeof removeEventListener === "function") { removeEventListener("online", aoMudarConexao); removeEventListener("offline", aoMudarConexao); }
    if (typeof desassinarRede === "function") try { desassinarRede(); } catch { /* ok */ }
    limparComandoPresenca();
    clearInterval(relogio);
    if (observadorCab) try { observadorCab.disconnect(); } catch { /* ok */ }
    document.removeEventListener("visibilitychange", aoVoltarAba);
    if (mq.removeEventListener) mq.removeEventListener("change", aoMudarLargura);
  };
  limpezaAtual = limpar;
  montarCabecalho();
  await carregar();
  return limpar;
}
