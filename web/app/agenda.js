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
    cor: ["servico", "profissional", "sala"].includes(v.cor) ? v.cor : "servico",      // critério da cor dos blocos (plano 50, item 39); plano 2000d · DC-347: «sala»
  };
}
/** Plano 1000: as preferências novas, guardadas na mesma chave (CA-187 filtro por profissional; CA-186 dias fechados). */
export function normalizarExtrasAgenda(valor) {
  const v = valor && typeof valor === "object" && !Array.isArray(valor) ? valor : {};
  return {
    prof: typeof v.prof === "string" && v.prof && v.prof.length <= 80 ? v.prof : "todos",   // «todos», «eu» ou o id de um profissional
    fechados: v.fechados === "mostrar" ? "mostrar" : "ocultar",                              // dias fechados sem consulta somem da semana
    atalhos: v.atalhos === "desligados" ? "desligados" : "ligados",                         // plano 1000b · CB-151: atalhos de uma tecla (WCAG 2.1.4)
    ...(v.aviso10 === "ligado" ? { aviso10: "ligado" } : {}),                                // plano 2000d · DC-410
    roteiro: v.roteiro === "dispensado" ? "dispensado" : "mostrar",                         // plano 2000d · DC-399: «Já configurei»
    lista: v.lista === "aberta" || v.lista === "fechada" ? v.lista : null,                   // plano 2000d · DC-405: a «Lista do dia» do celular
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
  if (filtro === "sem") return lista.filter(c => c && (c.dono_id === null || c.dono_id === undefined || c.dono_id === ""));   // plano 1500c · GX-014
  const alvo = filtro === "eu" ? (eu ? String(eu) : null) : String(filtro);
  return alvo ? lista.filter(c => c && c.dono_id != null && String(c.dono_id) === alvo) : lista;
}
/** CA-186: dia fechado pela configuração (horário vazio) e sem nenhuma consulta → a semana pode escondê-lo. Sem configuração de horário, nunca. */
export function diaFechadoVazio(config, iso, consultas) {
  const f = faixasDoDia(config, iso);
  return Array.isArray(f) && f.length === 0 && consultasDoDia(consultas, iso).length === 0;
}
/** CA-161: a frase curta do status quando o período carrega («Semana de 12 a 18/10: 4 consultas»), no lugar de ler a grade inteira. */
export function textoAnuncioPeriodo({ modo = "semana", de, dias = 7, n = 0, palavra = "consulta" } = {}) {
  if (!dataAgendaValida(de)) return "";
  const qtd = `${n} ${n === 1 ? palavra : `${palavra}s`}`;   // plano 2000d · GY-001: a palavra da vertical («3 visitas»)
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
  if (!ev || ev.altKey || ev.ctrlKey || ev.metaKey) return null;
  if (ev.key === "/") return "filtrar";      // plano 1500c · GX-018: «/» vai ao «Filtrar nesta tela» (em alguns teclados o «/» vem com Shift)
  if (ev.shiftKey) return null;
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
  if (k === "r") return "atualizar";  // plano 2000d · DC-362: R relê a agenda
  if (k === "p") return "procurar";   // plano 2000d · DC-362: P abre «Procurar paciente»
  return null;
}
export const ATALHO_MODO = Object.freeze({ dia: "D", semana: "S", mes: "M", lista: "L" });
const _horaSP = new Intl.DateTimeFormat("pt-BR", { timeZone: FUSO, hour: "2-digit", minute: "2-digit" });
/** CA-220: «Atualizada às 14:02»; passados 5 min sem releitura certa, «Atualizada às 14:02 · há 12 min». */
export function textoCarimbo(lidaEm, agora = Date.now()) {
  if (!Number.isFinite(lidaEm) || lidaEm <= 0) return "";
  const min = Math.floor((agora - lidaEm) / 60000);
  // plano 1500c · GX-001: «há 1 h 30 min» (90 min não vira «há 1 h») e, passado um dia, «há mais de um dia» (não «há 26 h»)
  const ha = min < 60 ? `${min} min` : min < 24 * 60 ? `${Math.floor(min / 60)} h${min % 60 ? ` ${min % 60} min` : ""}` : "mais de um dia";
  return `Atualizada às ${_horaSP.format(new Date(lidaEm))}${min >= 5 ? ` · há ${ha}` : ""}`;
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
/** Plano 1500c · GX-045: o minuto cai numa PAUSA (almoço…) dentro do expediente? → [ini, fim] da pausa (minutos), ou null. */
export function pausaNoHorario(config, iso, min) {
  const faixas = faixasDoDia(config, iso);
  if (!faixas || !faixas.some(([a, b]) => min >= a && min < b)) return null;
  return intervalosDaConfig(config).find(([a, b]) => min >= a && min < b) || null;
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
  // plano 2000d · DC-390: a que passa da meia-noite (23:30–00:30) ocupa até o fim do dia do início (não vira a duração padrão)
  const fim = e && e.dia === s.dia && e.min > s.min ? e.min : e && e.dia === diaISO(s.dia, 1) && e.min <= s.min ? 24 * 60 : s.min + duracaoPadrao;
  return { dia: s.dia, ini: s.min, fim: Math.max(fim, s.min + 15) };
}
/** Eixo de horas da grade [ini, fim) em horas inteiras: o expediente dos dias mostrados (ou 08–18 sem configuração), esticado para caber toda consulta. */
export function eixoDaGrade({ dias = [], consultas = [], config = null, bloqueios = [] } = {}) {
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
  // plano 2000d · DC-392: o bloqueio de parte do dia fora do expediente (reunião das 07:00 às 08:00) também estica o eixo — antes sumia
  for (const iso of dias) for (const b of bloqueiosDoDia(bloqueios, iso)) {
    if (diaTodoBloqueado([b], iso)) continue;
    const i = partesSP(b.inicio), f = partesSP(b.fim);
    const a = i && i.dia === iso ? i.min : 0, z = f && f.dia === iso ? f.min : 24 * 60;
    if (z > a) { ini = Math.min(ini, a); fim = Math.max(fim, z); }
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
  // plano 2000d · DC-347: por sala/cadeira (sala_id/sala_nome, quando o servidor mandar)
  if (por === "sala") {
    const id = c && c.sala_id != null ? String(c.sala_id) : "";
    const nome = c && typeof c.sala_nome === "string" && c.sala_nome.trim() ? c.sala_nome.trim() : "";
    return { chave: `r:${id || "sem"}`, cor: id ? corDoProcedimento(nome || id, null) : 6, rotulo: id ? (nome || `Sala ${id}`) : "Sem sala" };
  }
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
  return `${pctTexto(oc.pct)} ocupado${oc.estimada ? " (estimado)" : ""}`;
}
/** Plano 1500c · GX-002: a porcentagem honesta — uma consulta num dia enorme não é «0%» («abaixo de 1%») e 99,6% não é «100%» (ainda cabe). */
export function pctTexto(pct) {
  const p = Number(pct);
  if (!Number.isFinite(p) || p <= 0) return "0%";
  if (p < .01) return "abaixo de 1%";
  if (p < 1) return `${Math.min(99, Math.round(p * 100))}%`;
  return "100%";
}
/** Ocupação do período (null se nenhum dia tem capacidade).
    Plano 1500c · GX-003: a soma do marcado sobre a soma da capacidade (o sábado de meio período não pesa como um dia inteiro). */
export function ocupacaoDoPeriodo(consultas, dias, config, bloqueios = [], opcoes = {}) {
  return ocupacaoPonderada((dias || []).map(d => ocupacaoDoDia(consultas, d, config, bloqueios, opcoes)));   // plano 1500c · CC-190
}
/** GX-003/GX-004: [{marcados, capacidade, pct}] → marcado/capacidade dos dias abertos; null sem nenhum. */
export function ocupacaoPonderada(dias) {
  const abertos = (dias || []).filter(o => o && o.pct !== null && o.capacidade > 0);
  if (!abertos.length) return null;
  const cap = abertos.reduce((s, o) => s + o.capacidade, 0);
  return Math.min(1, abertos.reduce((s, o) => s + Math.min(o.marcados, o.capacidade), 0) / cap);
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
  // plano 2000d · DC-290: o que vai até o fim do dia diz «das 18:00 até o fim do dia» (antes «às 23:59»)
  const quando = !i || !f ? "Bloqueado" : ini <= 0 && fim >= 24 * 60 ? "Bloqueado o dia todo"
    : fim >= 24 * 60 ? `Bloqueado das ${horaTxt(ini)} até o fim do dia` : `Bloqueado das ${horaTxt(ini)} às ${horaTxt(fim)}`;
  return `${quando}${motivo ? `: ${motivo}` : ""}`;
}
/** CA-198: o que o leitor de tela ouve no bloco: «10:00 às 10:30, Mariana Costa, Avaliação, com Dra. Helena, encaixe, faltou, próxima consulta».
    plano 2000d · DC-306: `dono` = o nome do profissional (quem chama passa só quando a agenda tem mais de um). */
export function rotuloDoBloco(c, { inicio = "", fim = "", nome = "", feita = false, falta = false, encaixe = false, proxima = false, dono = "", palavra = "consulta" } = {}) {
  const pres = c && c.presenca === "compareceu" ? "compareceu" : (c && c.presenca === "faltou") || falta ? "faltou" : null;
  // plano 2000d · GY-008: «próxima visita» na oficina (a palavra da vertical)
  return [`${inicio}${fim ? ` às ${fim}` : ""}`, nome, c && c.servico, dono ? `com ${dono}` : null, feita ? "concluída" : null, encaixe ? "encaixe" : null, pres, proxima ? `próxima ${palavra}` : null]
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
  for (let i = 0; i < 60; i++, d = diaISO(d, 1)) {
    const f = faixasDoDia(config, d);
    // plano 2000d · DC-280: sem horário configurado (null) o dia vale — mas o feriado bloqueado o dia inteiro continua pulado
    if ((f === null || f.length) && !diaTodoBloqueado(bloqueios, d)) return d;
  }
  return null;
}
/** Plano 2000d · DC-351: o motivo do bloqueio que fecha o dia inteiro («Natal»); "" sem motivo ou sem bloqueio do dia todo. */
export function motivoDoDiaBloqueado(bloqueios, iso) {
  const ini = instanteNoFuso(iso), fim = instanteNoFuso(diaISO(iso, 1));
  const b = bloqueiosDoDia(bloqueios, iso).find(x => Date.parse(x.inicio) <= ini && Date.parse(x.fim) >= fim);
  return b && typeof b.motivo === "string" ? b.motivo.trim() : "";
}
/** CC-168/CC-286: a Agenda ficou aberta e o dia de São Paulo virou (23:59 → 00:01)? */
export function diaVirou(ultimoHoje, hojeAgora) { return dataAgendaValida(ultimoHoje) && dataAgendaValida(hojeAgora) && hojeAgora !== ultimoHoje; }
/** CC-172/CC-284: quantos dias à frente a agenda abre (Configurações › Agenda, até 180); sem a configuração, 180. */
/** Plano 2000d · DC-397: a configuração pode passar de 180 (o retorno semestral cai em 181–186 dias) — até 366 quando o servidor aceitar; sem ela, 180. */
export function limiteDiasAgenda(config) { const n = Math.floor(Number(config && config.dias_a_frente)); return n >= 1 ? Math.min(366, n) : 180; }
/** Plano 1500c · GX-023: o instante `ms` cai dentro da antecedência mínima (config.antecedencia_horas)? Sem a configuração, nunca. */
export function dentroDaAntecedencia(config, ms, agora = Date.now()) {
  const hrs = Number(config && config.antecedencia_horas);
  return Number.isFinite(hrs) && hrs > 0 && Number.isFinite(ms) && ms >= agora && ms < agora + hrs * 3600e3;
}
/** GX-023: «Antecedência mínima de 2 h: só dá para marcar a partir das 12:00.» (com o dia quando não é hoje). */
export function textoAntecedencia(config, agora = Date.now()) {
  const hrs = Number(config && config.antecedencia_horas) || 0;
  const p = partesSP(new Date(agora + hrs * 3600e3)), hoje = (partesSP(new Date(agora)) || {}).dia;
  if (!p) return `Antecedência mínima de ${hrs} h.`;
  return `Antecedência mínima de ${hrs} h: só dá para marcar a partir ${p.dia === hoje ? "das" : `de ${rotuloDoDia(p.dia, hoje).toLowerCase()} às`} ${horaTxt(p.min)}.`;
}
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
  // plano 2000d · GY-072: nome curto (até 5 letras) aceita só 1 letra de diferença — «Raio» não vira «Rx»/«Reio» por acaso de 2 letras
  let melhor = null, dist = v.length <= 5 ? 2 : 3;
  for (const s of servicos || []) {
    const k = normServico(s);
    if (!k) continue;
    if (k === v) return null;
    const d = distancia(v, k);
    if (d < dist && !(k.length <= 5 && d > 1)) { dist = d; melhor = s; }
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
  for (const c of Array.isArray(r.consultas) ? r.consultas : []) if (c) partes.push(`${c.negocio_id}|${c.inicio}|${c.fim || ""}|${c.status || ""}|${c.presenca ?? ""}|${c.servico || ""}|${c.dono_id ?? ""}|${c.dono_nome || ""}|${c.nome || c.titulo || ""}|${c.encaixe ?? ""}|${c.marco || ""}|${c.atualizado_em || ""}|${c.confirmada_em || ""}|${c.obs || ""}|${c.marcado_por || ""}|${c.telefone || ""}|${c.contato_id ?? ""}`   // plano 2000d · DC-277: obs, quem marcou, telefone e contato também mudam a tela
    // plano 2000d · GY-074: «Chegou» (chegou_em), o lembrete enviado, a sala, a 1ª vez, o campo da 2ª linha e o aniversário também aparecem na tela
    + `|${c.chegou_em || ""}|${c.lembrete_enviado_em || ""}|${c.sala_id ?? ""}|${c.sala_nome || ""}|${c.primeira_vez ?? ""}|${c.campo_bloco || ""}|${c.aniversario_hoje ?? ""}|${c.presenca_em || ""}`
    // plano 2000d · GY-075: a origem (o megafone do anúncio) e quando foi marcada (a confirmação só vale depois dela, DC-394)
    + `|${c.plataforma || ""}|${c.origem || ""}|${c.marcada_em || ""}`);
  for (const b of Array.isArray(r.bloqueios) ? r.bloqueios : []) if (b) partes.push(`b${b.id}|${b.inicio}|${b.fim}|${b.motivo || ""}`);
  // plano 2000d · DC-277: as desmarcadas (a lista «N desmarcadas») entram na conta
  for (const d of Array.isArray(r.desmarcadas) ? r.desmarcadas : []) if (d) partes.push(`d${d.negocio_id ?? d.id ?? ""}|${d.inicio || ""}|${d.motivo || ""}`);
  const cfg = r.config ? JSON.stringify(r.config) : "";
  let hsh = 2166136261;
  for (const ch of `${partes.join("\n")}#${cfg}#${Array.isArray(r.ocupados) ? r.ocupados.length : ""}`) { hsh ^= ch.codePointAt(0); hsh = Math.imul(hsh, 16777619) >>> 0; }
  return `${partes.length}:${hsh.toString(36)}`;
}
/** CC-228: «tel:+55…» sem a crm-logica (o detalhe aberto antes de ela chegar): só dígitos, com +55 quando o número é brasileiro sem DDI. */
export function telLocal(t) {
  const d = digitosTelefone(t);
  if (d.length < 10) return null;   // plano 2000d · DC-391: sem DDD o celular não disca «+55 3622…» — o número fica só como texto
  return `tel:+${d.length <= 11 ? `55${d}` : d}`;
}
/** Plano 1500c · GX-005: os dígitos do telefone como se disca no Brasil — «(012) 99999-0000» e «0 15 12 99999-0000» (zero e operadora
    na frente) viram «12999990000»; antes o zero fazia o número parecer internacional («wa.me/012…», que não abre). */
export function digitosTelefone(t) {
  let d = String(t || "").replace(/\D/g, "");
  if (d.startsWith("00")) return d.replace(/^0+/, "");                 // 00 + DDI: internacional
  if (d.startsWith("0")) { d = d.replace(/^0+/, ""); if (d.length >= 12 && d.length <= 13 && !d.startsWith("55")) d = d.slice(2); }   // 0 + operadora + DDD
  return d;
}
/** CC-227: o link do WhatsApp do aparelho (wa.me) com o texto pronto; sem número válido, null. */
export function linkWhatsAppAgenda(t, texto = "") {
  const d = digitosTelefone(t);
  if (d.length < 10) return null;
  return `https://wa.me/${d.length <= 11 ? `55${d}` : d}${texto ? `?text=${encodeURIComponent(texto)}` : ""}`;
}
/** CC-256: a taxa de faltas das consultas que já passaram (falta = presença «faltou» ou etapa de faltas) → {faltas, de, pct, sem_marca} ou null.
    plano 2000d · DC-269: o denominador são as passadas com presença CONHECIDA (compareceu, faltou ou concluída) — a que ninguém marcou não é
    «não faltou»; `sem_marca` diz quantas ficaram sem marcação. Nenhuma marcada → null (com sem_marca, quem chama pode dizer). */
export function taxaFaltas(consultas, agora = Date.now()) {
  const passadas = (consultas || []).filter(c => c && Number.isFinite(Date.parse(c.inicio)) && Date.parse(c.inicio) < agora);
  if (!passadas.length) return null;
  const conhecida = c => { const k = classificarConsulta(c, null); return k.falta || k.feita || c.presenca === "compareceu"; };
  const marcadas = passadas.filter(conhecida);
  const sem_marca = passadas.length - marcadas.length;
  if (!marcadas.length) return { faltas: 0, de: 0, pct: null, sem_marca };
  const faltas = marcadas.filter(c => classificarConsulta(c, null).falta).length;
  return { faltas, de: marcadas.length, pct: faltas / marcadas.length, sem_marca };
}
/* plano 2000d · DC-268: célula que começa com = + - @ tab ou CR vira texto no Excel (apóstrofo na frente) — nome vindo do WhatsApp ou do
   anúncio como «=HIPERLINK(…)» não executa fórmula ao abrir a planilha */
const csvCampo = v => { let t = String(v ?? ""); if (/^[=+\-@\t\r]/.test(t)) t = `'${t}`; return /[";\n\r]/.test(t) ? `"${t.replace(/"/g, '""')}"` : t; };
/** CC-258: as consultas do período em CSV (separador «;», como o Excel em português abre): data, hora, paciente, serviço, profissional, presença, origem.
    plano 2000d · DC-382: e Telefone (formatado por `telBR`) e Observação — a recepção que confirma por telefone precisa do número. */
export function csvDaAgenda(consultas, { nomes = {}, contato = "Paciente", telBR = null } = {}) {
  // plano 1500c · GX-006: a coluna «Fim» (quem imprime a planilha vê até quando vai cada consulta)
  // plano 2000d · GY-022: a coluna «Confirmada» (a recepção que liga para confirmar filtra pelas que faltam)
  const linhas = [["Data", "Hora", "Fim", contato, "Serviço", "Profissional", "Presença", "Origem", "Telefone", "Observação", "Confirmada"]];
  for (const c of [...(consultas || [])].sort((a, b) => Date.parse(a.inicio) - Date.parse(b.inicio))) {
    const p = partesSP(c && c.inicio);
    if (!p) continue;
    // plano 2000d · GY-023: a falta registrada pela etapa (marco «faltou») também sai como «Faltou» (antes a linha ficava em branco)
    const pres = c.presenca === "compareceu" ? "Compareceu" : c.presenca === "faltou" || c.marco === "faltou" ? "Faltou" : c.status === "ganho" ? "Concluída" : "";
    const prof = c.dono_id ? (nomes[String(c.dono_id)] || c.dono_nome || "") : "";
    const orig = origemDo(c);
    const m = c.fim ? minutosDaConsulta(c, 30) : null;
    const tel = c.telefone ? (typeof telBR === "function" ? telBR(c.telefone) : String(c.telefone)) : "";
    const obs = typeof c.obs === "string" ? c.obs.replace(/\s+/g, " ").trim() : "";
    linhas.push([`${p.dia.slice(8, 10)}/${p.dia.slice(5, 7)}/${p.dia.slice(0, 4)}`, horaTxt(p.min), m ? horaTxt(m.fim) : "", c.nome || c.titulo || "", c.servico || "", prof, pres, orig === SEM_ORIGEM ? "" : orig, tel, obs, confirmadaValida(c) ? "Sim" : ""]);
  }
  return `${String.fromCodePoint(0xfeff)}${linhas.map(l => l.map(csvCampo).join(";")).join("\r\n")}\r\n`;
}
/** CC-261: a lista do dia em texto para mandar ao profissional: «Amanhã · Sex 24/10\n08:00 Maria Souza (Avaliação)…». */
export function textoCompartilharDia(consultas, iso, hojeISO, bloqueios = [], { soPrimeiroNome = false, palavra = "consulta" } = {}) {
  const itens = consultasDoDia(consultas, iso);
  const rot = rotuloDoDia(iso, hojeISO);
  const cab = rot === "Hoje" || rot === "Amanhã" || rot === "Ontem" ? `${rot} · ${nomeDia(iso, true)}` : nomeDia(iso, true);
  // plano 1500c · GX-008: os bloqueios do dia vão junto («Bloqueado das 12:00 às 13:00: almoço») — quem recebe sabe que o buraco é de propósito
  const travas = bloqueiosDoDia(bloqueios, iso).map(b => textoBloqueioNoDia(b, iso));
  if (!itens.length) return [`${cab}: sem ${palavra}s.`, ...travas].join("\n");   // plano 2000d · GY-009: «sem visitas» na oficina
  // GX-009: a presença já marcada vai na linha («— faltou», «— compareceu», «— concluída»): o dia que passou se lê sem abrir a agenda
  const marca = c => (c.presenca === "faltou" || c.marco === "faltou" ? " — faltou" : c.presenca === "compareceu" ? " — compareceu" : c.status === "ganho" ? " — concluída" : "");
  // plano 2000d · DC-383: o texto sai do sistema (WhatsApp do profissional) — com soPrimeiroNome, «Maria S.» em vez do nome completo (LGPD)
  const quem = c => (soPrimeiroNome ? nomeCurto(c.nome || c.titulo) : "") || c.nome || c.titulo || maiuscula(palavra);
  return [cab, ...itens.map(c => { const p = partesSP(c.inicio); return `${p ? horaTxt(p.min) : ""} ${quem(c)}${c.servico ? ` (${c.servico})` : ""}${marca(c)}`; }), ...travas].join("\n");
}
/** CC-294: «Última: 12/09 (compareceu)» — a consulta que já passou e a presença registrada; "" sem nada. */
export function textoUltimaConsulta(em, presenca = null) {
  const p = em ? partesSP(em) : null;
  if (!p) return "";
  return `Última: ${p.dia.slice(8, 10)}/${p.dia.slice(5, 7)}${presenca === "compareceu" ? " (compareceu)" : presenca === "faltou" ? " (faltou)" : ""}`;
}

/** Plano 1500c · GX-010: a consulta já começou e ainda não terminou (nem foi concluída nem é falta)? */
export function consultaEmAndamento(c, agora = Date.now(), duracaoPadrao = 30) {
  if (!c || c.status === "ganho" || c.presenca === "faltou" || c.marco === "faltou") return false;
  const t0 = Date.parse(c.inicio);
  if (!Number.isFinite(t0) || t0 > agora) return false;
  let t1 = Date.parse(c.fim);
  if (!Number.isFinite(t1) || t1 <= t0) t1 = t0 + Math.max(5, Number(duracaoPadrao) || 30) * 60000;
  return agora < t1;
}
/** Plano 1500c · GX-011/GX-012: a linha «quando» do detalhe — «Hoje · 10:00–10:45 · 45 min» (Amanhã/Ontem pelo nome; os outros dias, «Sex 24/10»). */
export function quandoDoDetalhe(c, hojeISO, duracaoPadrao = 30) {
  const p = partesSP(c && c.inicio);
  if (!p) return "";
  const m = minutosDaConsulta(c, Number(duracaoPadrao) || 30);
  const dia = dataAgendaValida(hojeISO) ? rotuloDoDia(p.dia, hojeISO) : p.dia;
  const dur = m ? m.fim - m.ini : null;
  return [dia, `${horaTxt(p.min)}${m && c.fim ? `–${horaTxt(m.fim)}` : ""}`, dur ? `${dur} min` : null].filter(Boolean).join(" · ");
}

/** Plano 1500c · GX-017: a chave do «Filtrar nesta tela» — nome e serviço sem acento/caixa e os dígitos do telefone (acha pelo final do número). */
export function chaveFiltroConsulta(c) {
  if (!c) return "";
  const tel = digitosTelefone(c.telefone);
  return `${normServico(`${c.nome || c.titulo || "Consulta sem nome"} ${c.servico || ""}`)}${tel ? ` ${tel}` : ""}`;
}
/** GX-017: o texto digitado casa com a chave? Só dígitos e sinais de telefone («9999-4321») comparam os dígitos; o resto, o texto normalizado. */
export function casaFiltroNome(chave, q) {
  const t = String(q || "").trim();
  if (!t) return true;
  if (/^[\d\s()+.-]+$/.test(t)) { const d = t.replace(/\D/g, ""); return !d || String(chave || "").includes(d); }
  return String(chave || "").includes(normServico(t));
}
/** GX-016: «2 de 14 consultas» / «Nenhuma consulta com «x»» — o retorno do filtro, para os olhos e para o leitor de tela. */
export function textoContaFiltro(n, total, q, palavra = "consulta") {
  if (!String(q || "").trim()) return "";
  // plano 2000d · GY-003: a palavra da vertical («Nenhuma visita com «zé»»)
  if (!n) return `Nenhuma ${palavra} com «${String(q).trim().slice(0, 40)}» nesta tela.`;
  return `${n} de ${total} ${total === 1 ? palavra : `${palavra}s`}`;
}

/** Plano 2000d · DC-272/DC-322: o estado do lembrete de uma consulta → {tipo: "enviado"|"pronto", rotulo, detalhe} ou null.
    «Lembrado» só quando o servidor diz que saiu (lembrete_enviado_em, com lembrete_por_nome); o que ficou pronto neste aparelho
    (`local` = {em, por}) é «Lembrete pronto» — a recepção não toma por enviado o texto que só foi copiado. */
export function estadoLembrete(c, local = null) {
  const hora = v => { const p = partesSP(v); return p ? horaTxt(p.min) : ""; };
  if (c && c.lembrete_enviado_em && Number.isFinite(Date.parse(c.lembrete_enviado_em))) {
    const por = typeof c.lembrete_por_nome === "string" && c.lembrete_por_nome.trim() ? ` por ${c.lembrete_por_nome.trim()}` : "";
    return { tipo: "enviado", rotulo: "Lembrado", detalhe: `Lembrado às ${hora(c.lembrete_enviado_em)}${por}` };
  }
  if (!local) return null;
  const quando = local.em && Number.isFinite(Number(local.em)) ? hora(new Date(Number(local.em))) : "";
  const por = typeof local.por === "string" && local.por.trim() ? ` por ${local.por.trim()}` : "";
  return { tipo: "pronto", rotulo: "Lembrete pronto", detalhe: `Lembrete preparado${quando ? ` às ${quando}` : ""}${por}: confira se foi enviado` };
}

/** Plano 2000d · DC-353: o aviso da cópia guardada — «Mostrando a cópia de 08:12 · atualizando…» (sem a hora, «a cópia guardada»). */
export function textoCopiaGuardada(em) {
  const t = Number(em) || Date.parse(em);
  return Number.isFinite(t) && t > 0 ? `Mostrando a cópia de ${_horaSP.format(new Date(t))} · atualizando…` : "Mostrando a cópia guardada · atualizando…";
}
/** Plano 2000d · DC-394: a confirmação vale para o horário em que foi dada — com `marcada_em` (o servidor manda quando remarca), só a
    confirmação DEPOIS da marcação conta; sem o campo, vale a confirmada_em (servidor de hoje). */
export function confirmadaValida(c) {
  if (!c || !c.confirmada_em) return false;
  const conf = Date.parse(c.confirmada_em), marc = Date.parse(c.marcada_em);
  return !(Number.isFinite(conf) && Number.isFinite(marc) && conf < marc);
}
/** Plano 2000d · DC-334/DC-335: a consulta veio de anúncio? (plataforma meta/google ou origem «anuncio») */
export function veioDeAnuncio(c) { return !!c && (c.plataforma === "meta" || c.plataforma === "google" || c.origem === "anuncio"); }
/** Plano 2000d · DC-323: as consultas que entraram entre duas leituras (chave negocio|inicio) — a releitura de 60 s destaca e anuncia. */
export function novasConsultas(antes, depois) {
  const k = c => (c ? `${c.negocio_id}|${c.inicio}` : "");
  const ja = new Set((Array.isArray(antes) ? antes : []).map(k));
  return (Array.isArray(depois) ? depois : []).filter(c => c && !ja.has(k(c)));
}
/** DC-323/DC-411: o anúncio das novas: «1 consulta nova: 10:00 Maria (pela IA)» / «3 consultas novas: 10:00 Maria, 11:00 João e mais 1». */
export function textoNovasConsultas(novas, palavra = "consulta") {
  const l = Array.isArray(novas) ? novas : [];
  if (!l.length) return "";
  const um = c => { const p = partesSP(c.inicio); return `${p ? horaTxt(p.min) : ""} ${primeiroNomeAgenda(c.nome || c.titulo) || c.nome || c.titulo || ""}`.trim() + (c.marcado_por === "ia" ? " (pela IA)" : ""); };
  return `${l.length} ${l.length === 1 ? `${palavra} nova` : `${palavra}s novas`}: ${l.slice(0, 2).map(um).join(", ")}${l.length > 2 ? ` e mais ${l.length - 2}` : ""}`;
}

/** Plano 2000d · DC-284/DC-285/DC-286 (DC-428): os textos com número e plural certo. */
export const textoLivresDoDia = n => (n === 1 ? "1 horário livre" : n ? `${n} horários livres` : "lotado");
export const textoQtd = (n, palavra = "consulta") => `${n} ${n === 1 ? palavra : `${palavra}s`}`;
/** DC-286: o aviso do bloqueio pela grade com consultas no trecho: concordância («Ela continua» / «Elas continuam») e o rótulo do botão em uso. */
export function avisoConsultasNoBloqueio(caem, botao = "Bloquear", palavra = "consulta") {
  const n = (caem || []).length;
  if (!n) return "";
  const lista = caem.slice(0, 2).map(x => `${horaTxt(x.p.ini)} ${x.c.nome || x.c.titulo || palavra}`).join(", ");
  return `${n === 1 ? `Há 1 ${palavra}` : `Há ${n} ${palavra}s`} nesse trecho (${lista}${n > 2 ? "…" : ""}). ${n === 1 ? "Ela continua marcada" : "Elas continuam marcadas"} — toque em «${botao}» de novo para fechar mesmo assim.`;
}

/** Plano 2000d · DC-292: «Amanhã», «Ontem», «Em 3 dias», «Há 5 dias» (o dia em relação a hoje; hoje → "Hoje"). */
export function textoDistanciaDia(iso, hojeISO) {
  if (!dataAgendaValida(iso) || !dataAgendaValida(hojeISO)) return "";
  const n = Math.round((Date.parse(`${iso}T12:00:00Z`) - Date.parse(`${hojeISO}T12:00:00Z`)) / 864e5);
  if (n === 0) return "Hoje";
  if (n === 1) return "Amanhã";
  if (n === -1) return "Ontem";
  return n > 0 ? `Em ${n} dias` : `Há ${-n} dias`;
}
/** Plano 2000d · DC-386: o bloqueio de um dia como a janela grava ({data, das?, ate?, motivo}) — o «Desfazer» da edição regrava assim. */
export function camposBloqueioDaGrade(b, iso) {
  const i = partesSP(b && b.inicio), f = partesSP(b && b.fim);
  if (!i || !f) return null;
  const todo = diaTodoBloqueado([b], iso);
  return { data: iso, ...(todo ? {} : { das: i.dia === iso ? horaTxt(i.min) : "00:00", ate: f.dia === iso ? horaTxt(f.min) : "24:00" }), motivo: (b && b.motivo) || null };
}

/** Plano 2000d · DC-332: o pedido de avaliação depois do atendimento (rascunho na conversa; nada sai sozinho). Sem link, "". */
export function textoAvaliacao(c, hojeISO, { empresa = "", link = "" } = {}) {
  if (!link) return "";
  const emp = String(empresa || "").trim();
  return `${saudacao(c)} Obrigado por vir${emp ? `, aqui é de ${emp}` : ""}. Se puder, conte como foi o atendimento: ${link}`;
}
/** Plano 2000d · DC-410: as consultas de `eu` que começam nos próximos 10 min (e ainda não começaram). */
export function consultasParaAvisar(consultas, eu, agora = Date.now()) {
  return (Array.isArray(consultas) ? consultas : []).filter(c => {
    const t = Date.parse(c && c.inicio);
    return c && eu != null && String(c.dono_id) === String(eu) && c.status !== "ganho" && Number.isFinite(t) && t > agora && t - agora <= 10 * 60000;
  });
}
/** Plano 2000d · DC-414: «esperando há 12 min» depois do «Chegou» (chegou_em), até a presença ou a consulta concluir; "" sem espera. */
export function textoEspera(c, agora = Date.now()) {
  const t = Date.parse(c && c.chegou_em);
  if (!Number.isFinite(t) || !c || c.presenca === "compareceu" || c.presenca === "faltou" || c.status === "ganho") return "";
  const min = Math.max(0, Math.floor((agora - t) / 60000));
  return min > 180 ? "" : min < 1 ? "chegou agora" : `esperando há ${min} min`;
}
/** Plano 2000d · DC-413: os parabéns (rascunho; nada sai sozinho). */
export function textoParabens(c, hojeISO, { empresa = "" } = {}) {
  const emp = String(empresa || "").trim();
  return `${saudacao(c)} Feliz aniversário! 🎉 Um abraço${emp ? ` de toda a equipe de ${emp}` : " de toda a equipe"}.`;
}
/** Plano 2000d · DC-415: a presença foi marcada há menos de 5 min por OUTRA pessoa, com outro estado? → «Ana marcou «Faltou» às 10:02» ou "". */
export function presencaRecenteDeOutro(c, pedido, eu = "", agora = Date.now()) {
  const t = Date.parse(c && c.presenca_em);
  const por = c && typeof c.presenca_por_nome === "string" ? c.presenca_por_nome.trim() : "";
  if (!por || !Number.isFinite(t) || agora - t > 5 * 60000 || !c.presenca || c.presenca === pedido || (eu && por.split(/\s+/)[0].toLowerCase() === String(eu).trim().split(/\s+/)[0].toLowerCase())) return "";
  const p = partesSP(c.presenca_em);
  return `${por} marcou «${c.presenca === "faltou" ? "Faltou" : "Compareceu"}»${p ? ` às ${horaTxt(p.min)}` : ""}`;
}
/** Plano 2000d · DC-383: «Maria Souza» → «Maria S.» (o primeiro nome da saudação e a inicial do último sobrenome). */
export function nomeCurto(nome) {
  const p = primeiroNomeAgenda(nome);
  if (!p) return "";
  const partes = String(nome || "").trim().split(/\s+/).filter(x => /\p{L}/u.test(x));
  const ult = partes.length > 1 ? partes[partes.length - 1].replace(/[^\p{L}]/gu, "") : "";
  return ult && ult.toLowerCase() !== p.toLowerCase() ? `${p} ${ult.charAt(0).toLocaleUpperCase("pt-BR")}.` : p;
}
/** Plano 2000d · DC-440: a consulta que começa em `min` e dura `duracao` termina depois da faixa de atendimento em que começa? */
export function passaDoHorario(config, iso, min, duracao) {
  const f = faixasDoDia(config, iso);
  if (!Array.isArray(f) || !f.length) return false;
  const faixa = f.find(([a, b]) => min >= a && min < b);
  return !!faixa && min + Math.max(5, Number(duracao) || 30) > faixa[1];
}
/** Plano 2000d · DC-361: a tecla do detalhe → o seletor do botão que ela toca (null: não é atalho). */
export function atalhoDoDetalhe(tecla) {
  return { c: '.ag-pres-bt[data-estado="compareceu"]', f: '.ag-pres-bt[data-estado="faltou"]', r: ".ag-det-remarcar", l: ".ag-det-lembrar" }[String(tecla || "").toLowerCase()] || null;
}
/** Plano 2000d · DC-400: «Fora do horário: na sexta a agenda atende das 08:00 às 12:00 e das 14:00 às 18:00.» (fechado: «na sexta a agenda não atende»). */
export function textoForaDoHorario(config, iso) {
  const f = faixasDoDia(config, iso);
  if (!Array.isArray(f) || !dataAgendaValida(iso)) return "Fora do horário de atendimento da agenda.";
  const dia = DIA_LONGO[new Date(`${iso}T12:00:00Z`).getUTCDay()];
  if (!f.length) return `Fora do horário: ${dia} a agenda não atende.`;
  const faixas = f.map(([a, b]) => `das ${horaTxt(a)} às ${horaTxt(Math.min(b, 24 * 60))}`);
  return `Fora do horário: ${dia} a agenda atende ${faixas.length > 1 ? `${faixas.slice(0, -1).join(", ")} e ${faixas.at(-1)}` : faixas[0]}.`;
}
const DIA_LONGO = ["no domingo", "na segunda", "na terça", "na quarta", "na quinta", "na sexta", "no sábado"];
/** Plano 2000d · DC-398: «3 profissionais atendem e a agenda aceita 1 atendimento por horário…» quando a capacidade é menor que a equipe. */
export function avisoCapacidade(nProf, capacidade) {
  const n = Math.floor(Number(nProf)), cap = Math.max(1, Math.floor(Number(capacidade)) || 1);
  if (!(n > cap)) return null;
  return `${n} profissionais atendem e a agenda aceita ${cap} ${cap === 1 ? "atendimento" : "atendimentos"} por horário: os horários lotam com gente livre.`;
}
/** Plano 2000d · DC-313: «agora 14:32, próxima às 15:00» (sem próxima: «agora 14:32, sem mais consultas hoje»). */
export function textoAgoraDoDia(consultas, agora = Date.now(), palavra = "consulta") {
  const n = partesSP(new Date(agora));
  if (!n) return "";
  const prox = (Array.isArray(consultas) ? consultas : []).filter(c => c && c.status !== "ganho" && Date.parse(c.inicio) > agora).sort((a, b) => Date.parse(a.inicio) - Date.parse(b.inicio))[0];
  const p = prox ? partesSP(prox.inicio) : null;
  return `agora ${horaTxt(n.min)}, ${p && p.dia === n.dia ? `próxima às ${horaTxt(p.min)}` : `sem mais ${palavra}s hoje`}`;   // plano 2000d · GY-069
}
/** Plano 2000d · DC-309: o que o cursor de teclado da grade diz do minuto — «, bloqueado: almoço», «, lotado (2 consultas)», «, 1 consulta» ou "". */
export function estadoDoMinuto(col, min, config = null, palavra = "consulta") {
  const b = (col && Array.isArray(col.bloqueios) ? col.bloqueios : []).find(x => {
    const i = partesSP(x && x.inicio), f = partesSP(x && x.fim);
    const ini = i && i.dia === col.iso ? i.min : 0, fim = f && f.dia === col.iso ? f.min : 24 * 60;
    return i && f && min >= ini && min < fim;
  });
  if (b) return `, bloqueado${b.motivo ? `: ${String(b.motivo).trim()}` : ""}`;
  const dur = Number(config && config.duracao_min) || 30, cap = Math.max(1, Number(config && config.capacidade) || 1);
  const n = (col && Array.isArray(col.consultas) ? col.consultas : []).filter(c => c && c.presenca !== "faltou" && c.marco !== "faltou")
    .map(c => minutosDaConsulta(c, dur)).filter(p => p && p.dia === col.iso && min >= p.ini && min < p.fim).length;
  if (!n) return "";
  const qtd = textoQtd(n, palavra);   // plano 2000d · GY-070: «1 visita» na oficina
  return n >= cap ? `, lotado (${qtd})` : `, ${qtd}`;
}
/** Plano 2000d · DC-326: as consultas por vir do contato em OUTROS negócios (nx_contato_ver.negocios), da mais próxima para a mais longe. */
export function outrasConsultasDoContato(negocios, negocioId, agora = Date.now()) {
  return (Array.isArray(negocios) ? negocios : [])
    .filter(n => n && String(n.id) !== String(negocioId) && n.status !== "perdido" && n.status !== "ganho" && Date.parse(n.consulta_em) > agora)
    .sort((a, b) => Date.parse(a.consulta_em) - Date.parse(b.consulta_em))
    .map(n => ({ id: n.id, consulta_em: n.consulta_em, titulo: typeof n.servico === "string" && n.servico.trim() ? n.servico.trim() : typeof n.titulo === "string" ? n.titulo.trim() : "" }));
}
/** Plano 2000d · DC-324: a leitura mais velha que isto é refeita antes de desmarcar/remarcar pelo detalhe. */
export const DETALHE_VELHO_MS = 30_000;
/** Plano 2000d · DC-331: «6 meses», «30 dias», «1 ano». */
export function textoRetornoDias(n) {
  const d = Math.floor(Number(n));
  if (!(d >= 1)) return "";                              // plano 2000d · GY-020: sem número válido, nada (antes «NaN dias» no botão)
  if (d >= 360) return "1 ano";
  if (d >= 60 && d % 30 <= 5) return `${Math.round(d / 30)} meses`;
  if (d < 60 && d % 7 === 0) return d === 7 ? "1 semana" : `${d / 7} semanas`;   // plano 2000d · GY-021: «2 semanas» (não «14 dias»)
  return d === 1 ? "1 dia" : `${d} dias`;
}
const maiuscula = t => { const s = String(t || ""); return s.charAt(0).toLocaleUpperCase("pt-BR") + s.slice(1); };
/** Plano 2000d · DC-325: « por Ana há 1 min» / « pela IA» quando a recusa horario_ocupado diz quem pegou (ocupado_por no erro ou no detalhe). */
export function sufixoOcupadoPor(e, agora = Date.now()) {
  const o = e && (e.ocupado_por || (e.detalhe && e.detalhe.ocupado_por) || (e.dados && e.dados.ocupado_por));
  if (!o || typeof o !== "object") return "";
  const quem = o.marcado_por === "ia" ? "pela IA" : typeof o.nome === "string" && o.nome.trim() ? `por ${o.nome.trim().slice(0, 40)}` : "";
  const t = Date.parse(o.em || o.marcado_em || "");
  const min = Number.isFinite(t) ? Math.max(0, Math.round((agora - t) / 60000)) : null;
  const ha = min === null ? "" : min < 1 ? " agora há pouco" : min < 60 ? ` há ${min} min` : "";
  return quem ? ` ${quem}${ha}` : "";
}
/** Plano 2000d · DC-324: a consulta mudou desde que o detalhe abriu? → "desmarcada" | "remarcada" | "alterada" | null. */
export function consultaMudou(antes, depois) {
  if (!antes) return null;
  if (!depois) return "desmarcada";
  if (Date.parse(antes.inicio) !== Date.parse(depois.inicio)) return "remarcada";
  // plano 2000d · GY-077: o serviço trocado por outra pessoa (outra duração) também conta como alterada
  if ((antes.atualizado_em || "") !== (depois.atualizado_em || "") || (antes.status || "") !== (depois.status || "") || String(antes.servico || "").trim() !== String(depois.servico || "").trim()) return "alterada";
  return null;
}
/** Plano 2000d · DC-330: a linha do tempo do lead (origem → marcou → confirmou → atendimento → fechou) a partir do que a linha já traz. */
export function passosDoLead(c, { vocab = null } = {}) {
  if (!c) return [];
  const pal = palavraCompromisso(vocab);
  const falta = c.presenca === "faltou" || c.marco === "faltou";
  const veio = c.presenca === "compareceu" || c.status === "ganho";
  return [
    { id: "origem", rotulo: veioDeAnuncio(c) ? "Anúncio" : "Contato", feito: true, icone: veioDeAnuncio(c) ? "anuncio" : "whatsapp" },
    { id: "marcou", rotulo: c.marcado_por === "ia" ? "IA marcou" : "Marcou", feito: true, icone: c.marcado_por === "ia" ? "ia" : "relogio" },
    { id: "confirmou", rotulo: "Confirmou", feito: confirmadaValida(c), icone: "check" },
    { id: "presenca", rotulo: falta ? "Faltou" : veio ? "Compareceu" : pal.charAt(0).toUpperCase() + pal.slice(1), feito: falta || veio, ruim: falta, icone: falta ? "fechar" : "check" },
    { id: "fechou", rotulo: "Fechou", feito: c.status === "ganho", icone: "check" },
  ];
}
/** Plano 2000d · DC-331: em quantos dias sai o retorno — o do serviço (config.retornos, quando o servidor guardar) ou o da vertical. */
export function retornoEmDias(c, config = null, vocab = null) {
  const r = config && config.retornos && typeof config.retornos === "object" ? config.retornos : null;
  const s = c && typeof c.servico === "string" ? c.servico.trim() : "";
  // plano 2000d · GY-019: «Avaliacao» na configuração casa com «Avaliação» na consulta (sem acento nem caixa, como as durações)
  const n = r && s ? Math.floor(Number(Object.entries(r).find(([k]) => normServico(k) === normServico(s))?.[1])) : NaN;
  if (n >= 1 && n <= 366) return n;
  const v = vocab && vocab.vertical;
  return v === "odonto" || !v ? 180 : v === "oficina" ? 180 : 30;
}
/** Plano 2000d · DC-274/DC-379: as linhas da tela da recepção — de hoje, sem as concluídas nem as que faltaram (presença ou etapa),
    até 10 min depois do fim; a que está acontecendo vem marcada {agora: true}. Até 8. */
export function proximasDaTV(consultas, hojeISO, agora = Date.now(), duracaoPadrao = 30) {
  return consultasDoDia(Array.isArray(consultas) ? consultas : [], hojeISO)
    .filter(c => c && c.status !== "ganho" && c.presenca !== "faltou" && c.marco !== "faltou" && Date.parse(c.fim || c.inicio) > agora - 10 * 60_000)
    .slice(0, 8).map(c => ({ c, agora: consultaEmAndamento(c, agora, duracaoPadrao) }));
}
/** Plano 2000d · DC-439: a consulta em andamento agora que termina mais tarde → {fim (minutos do dia), nome} ou null. */
export function ocupadaAgora(consultas, agora = Date.now(), duracaoPadrao = 30, capacidade = 1) {
  let melhor = null;
  // plano 2000d · GY-073: com 2 cadeiras e 1 atendimento em curso ainda cabe o encaixe agora — «ocupada» só com a capacidade inteira em uso
  const emCurso = (consultas || []).filter(c => consultaEmAndamento(c, agora, duracaoPadrao));
  if (emCurso.length < Math.max(1, Math.floor(Number(capacidade)) || 1)) return null;
  for (const c of emCurso) {
    const m = minutosDaConsulta(c, duracaoPadrao);
    if (m && (!melhor || m.fim > melhor.fim)) melhor = { fim: Math.min(24 * 60 - 5, m.fim), nome: primeiroNomeAgenda(c.nome || c.titulo) || c.nome || c.titulo || "em atendimento" };
  }
  return melhor;
}
/** Plano 2000d · DC-343: quem da equipe está livre AGORA (sem consulta aberta cruzando este minuto) → [{id, nome}]. */
export function profissionaisLivresAgora(equipe, consultas, agora = Date.now(), duracaoPadrao = 30) {
  const ocupados = new Set((consultas || []).filter(c => c && c.dono_id != null && consultaEmAndamento(c, agora, duracaoPadrao)).map(c => String(c.dono_id)));
  return (Array.isArray(equipe) ? equipe : []).filter(u => u && u.id != null && !ocupados.has(String(u.id)));
}

/** Plano 2000d · DC-337: «Lembrar» vale para a consulta de AMANHÃ e para a de HOJE que ainda está a mais de 2 h (a das 17h marcada cedo). */
export function podeLembrarConsulta(c, hojeISO, agora = Date.now()) {
  if (!c || c.contato_id == null || c.status === "ganho" || c.presenca === "faltou") return false;
  const t = Date.parse(c.inicio), p = partesSP(c.inicio);
  if (!p || !Number.isFinite(t) || t <= agora) return false;
  return p.dia === diaISO(hojeISO, 1) || (p.dia === hojeISO && t - agora > 2 * 3600e3);
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
export function montarLegenda({ h, itens = [], ativos = new Set(), aoAlternar, num = String, avatar = null, palavra = "consulta" } = {}) {   // plano 2000d · GY-007: palavra
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
      title: `${it.rotulo}: ${num(it.n)} ${it.n === 1 ? palavra : `${palavra}s`}`,
      on: { click: () => aoAlternar && aoAlternar(it) } },
      marca || h("i", { class: "ag-leg-cor", "aria-hidden": "true", style: it.cor === null || it.cor === undefined ? null : { "--cor-bloco": `var(--pal-${it.cor})` } }),
      h("span", { class: "ag-leg-nome" }, it.rotulo), h("b", { class: "ag-leg-n dado" }, num(it.n))));
  }
  if (ativos.size) el.appendChild(h("button", { type: "button", class: "ag-leg-chip ag-leg-limpar", on: { click: () => aoAlternar && aoAlternar(null) } }, "Mostrar todas"));
  return el;
}

/** Mini-calendário do mês com densidade: 6 × 7 botões (cada um com contagem, barra de ocupação, hoje e bloqueio), setas de mês e teclado. */
export function montarMiniCalendario({ h, mes, consultas = [], bloqueios = [], config = null, hoje, selecionado = null, aoEscolher, aoMudarMes, num = String, carregando = false, compacto = false,
  aoAbrirSemana = null, ocupacao = {}, palavra = "consulta" } = {}) {   // plano 1500c · CC-190: ocupacao = {ocupados} (trechos da clínica inteira); plano 2000d · GY-006: palavra
  const pals = `${palavra}s`;
  const comSemanas = typeof aoAbrirSemana === "function";      // CA-270: o número da semana (à esquerda) abre a semana inteira
  const celulas = gradeDoMes(mes);
  const dentro = celulas.filter(c => !c.foraDoMes).map(c => c.iso);
  const porDia = consultasPorDia(consultas);           // CA-218: uma passada; cada célula olha só as do próprio dia
  const doDia = iso => porDia.get(iso) || [];
  const total = dentro.reduce((s, d) => s + doDia(d).length, 0);
  // plano 1500c · GX-004: a ocupação do mês pesa cada dia pela capacidade (o sábado de 4 h não vale um dia de 10 h)
  const media = ocupacaoPonderada(dentro.map(d => ocupacaoDoDia(doDia(d), d, config, bloqueios, ocupacao)));
  const el = h("section", { class: ["ag-mes", compacto && "ag-mes-compacto", comSemanas && "ag-mes-com-semanas"], "aria-label": `Mês de ${nomeDoMes(mes)}`, "aria-busy": carregando ? "true" : null });
  el.appendChild(h("header", { class: "ag-mes-cab" },
    // plano 2000d · GY-065: as setas dizem PARA QUAL mês vão («Mês anterior: setembro de 2026»)
    h("button", { type: "button", class: "bt-icone ag-mes-nav", "aria-label": `Mês anterior: ${nomeDoMes(mesISO(mes, -1)).toLowerCase()}`, on: { click: () => aoMudarMes && aoMudarMes(-1) } }, h("span", { "aria-hidden": "true" }, "‹")),
    h("div", { class: "ag-mes-tit" }, h("h2", { class: "ag-mes-nome" }, nomeDoMes(mes)),
      h("p", { class: "ag-mes-resumo" },   /* plano 1000b · CB-176: sem role=status (um status novo a cada desenho); o anúncio do período (CA-161) já diz */ carregando ? "Carregando…" : `${num(total)} ${total === 1 ? palavra : pals}${media === null ? "" : ` · ocupação média ${pctTexto(media)}`}`)),
    h("button", { type: "button", class: "bt-icone ag-mes-nav", "aria-label": `Próximo mês: ${nomeDoMes(mesISO(mes, 1)).toLowerCase()}`, on: { click: () => aoMudarMes && aoMudarMes(1) } }, h("span", { "aria-hidden": "true" }, "›"))));
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
    const diaTodo = !cel.foraDoMes && diaTodoBloqueado(bloqueios, cel.iso);   // plano 2000d · DC-273: cobre o dia (não «dura 24 h»: 12:00→12:00 é parcial nos dois)
    // plano 1500c · CC-265: a tarde bloqueada (bloqueio de parte do dia) também aparece — meio hachurado e «bloqueio parcial»
    const parcial = !cel.foraDoMes && !diaTodo && bloqueioParcial(bloqueios, cel.iso);
    const nivel = nivelOcupacao(oc && oc.pct);
    const txtOc = textoOcupacao(oc);
    // plano 1500c · CC-264: ao passar o mouse (title) ou focar (aria-description), as 5 primeiras consultas do dia
    const primeiras = n ? consultasDoDia(doDia(cel.iso), cel.iso).slice(0, 5).map(c => { const p = partesSP(c.inicio); return `${p ? horaTxt(p.min) : ""} ${c.nome || c.titulo || maiuscula(palavra)}`; }) : [];
    const quem = primeiras.length ? `${primeiras.join(" · ")}${n > 5 ? ` e mais ${n - 5}` : ""}` : null;
    const motivoBloq = diaTodo ? motivoDoDiaBloqueado(bloqueios, cel.iso) : "";   // plano 2000d · DC-351: «bloqueado: Natal»
    const partes = [nomeDia(cel.iso, true), oc ? `${num(n)} ${n === 1 ? palavra : pals}` : null, txtOc || null, diaTodo ? `bloqueado${motivoBloq ? `: ${motivoBloq}` : ""}` : parcial ? "bloqueio parcial" : null, cel.iso === selecionado ? "selecionado" : null].filter(Boolean);
    const b = h("button", { type: "button", "aria-keyshortcuts": comSemanas ? "W" : null, class: ["ag-mes-dia", `ag-ocup-${nivel}`, cel.foraDoMes && "ag-mes-fora", cel.iso === hoje && "hoje", cel.iso === selecionado && "sel", diaTodo && "ag-mes-bloq", parcial && "ag-mes-parcial", oc && oc.fechado && "ag-mes-fechado", hoje && cel.iso < hoje && "ag-mes-passado"],
      "aria-label": partes.join(", "), "aria-description": quem, title: quem || (diaTodo ? `Bloqueado${motivoBloq ? `: ${motivoBloq}` : ""}` : null), "aria-current": cel.iso === hoje ? "date" : null, tabindex: cel.iso === foco ? "0" : "-1", dataset: { iso: cel.iso },
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
    // plano 2000d · DC-363: na borda da grade a seta troca de mês e o foco vai ao dia correspondente (como o seletor de datas do APG)
    const passoBorda = { ArrowDown: 7, ArrowUp: -7, ArrowRight: 1, ArrowLeft: -1 }[ev.key];
    if ((j === null || j === i) && passoBorda && aoMudarMes && celulas[i]) { ev.preventDefault(); aoMudarMes(passoBorda > 0 ? 1 : -1, diaISO(celulas[i].iso, passoBorda)); return; }
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
  telBR = String, imprimir = null, contatos = null, desmarcadas = null, compartilhar = null, rotuloCompartilhar = "Compartilhar",
  palavra = "consulta", cabImpressao = "" } = {}) {   // plano 1500c · CC-225/CC-226: contatos = {hrefTel, aoConversar, aoLembrar, lembrado}; plano 2000d · DC-293/DC-381
  const r = resumoDoDia(consultas, iso, config);
  const futuro = !!hoje && iso > hoje;
  const pals = `${palavra}s`, Pal = palavra.charAt(0).toUpperCase() + palavra.slice(1);
  const el = h("aside", { class: "ag-painel", "aria-label": "Resumo do dia" });
  // plano 2000d · DC-381: a folha impressa diz de quem é a agenda e quando foi impressa (só aparece na impressão)
  if (cabImpressao) el.appendChild(h("p", { class: "ag-so-impressao ag-impressao-cab" }, cabImpressao));
  // CA-189: «Imprimir dia» (desktop): o @media print do agenda.css deixa só este painel, com hora, paciente, serviço e telefone
  // plano 1500c · CC-302: «Amanhã» e «Ontem» ditos pelo nome; plano 2000d · DC-292: os outros dias pela distância («Em 3 dias», «Há 5 dias»)
  const subDia = iso === hoje ? nomeDia(iso, true) : hoje ? textoDistanciaDia(iso, hoje) : "";
  el.appendChild(h("header", { class: "ag-painel-cab" }, h("h2", { class: "ag-painel-titulo" }, titulo || (iso === hoje ? "Hoje" : nomeDia(iso, true))),
    h("p", { class: "ag-painel-sub" }, subDia),
    typeof imprimir === "function" && r.itens.length ? h("button", { type: "button", class: "bt bt-fant bt-p ag-painel-imprimir", on: { click: () => imprimir(iso) } }, "Imprimir dia") : null,
    typeof compartilhar === "function" && r.itens.length ? h("button", { type: "button", class: "bt bt-fant bt-p ag-painel-compartilhar", on: { click: () => compartilhar(iso) } }, rotuloCompartilhar) : null));   // plano 1500c · CC-261
  // plano 1500c · CC-270: as desmarcadas do dia (quando o servidor mandar), recolhidas — quem chega à tarde sabe que a das 10h caiu
  if (Array.isArray(desmarcadas) && desmarcadas.length) {
    el.appendChild(h("details", { class: "ag-desmarcadas" }, h("summary", null, `${num(desmarcadas.length)} ${desmarcadas.length === 1 ? "desmarcada" : "desmarcadas"} neste dia`),
      h("ul", null, desmarcadas.map(x => h("li", null, h("span", { class: "dado" }, horaBR(x.inicio)), ` ${x.nome || x.titulo || Pal}${x.motivo ? ` · ${x.motivo}` : ""}`)))));
  }
  const kpi = (valor, rotulo, cls) => h("div", { class: ["ag-kpi", cls] }, h("b", { class: "dado", dataset: { valor: String(valor) } }, num(valor)), h("span", null, rotulo));
  // CA-190: dia por vir não tem concluídas nem faltas — os zeros eram ruído (o que houver de verdade continua à mostra)
  el.appendChild(h("div", { class: "ag-painel-kpis" },
    kpi(r.total, r.total === 1 ? palavra : pals),
    futuro && !r.feitas ? null : kpi(r.feitas, r.feitas === 1 ? "concluída" : "concluídas", r.feitas && "ok"),
    futuro && !r.faltas ? null : kpi(r.faltas, r.faltas === 1 ? "falta" : "faltas", r.faltas && "ruim"),
    r.encaixes ? kpi(r.encaixes, r.encaixes === 1 ? "encaixe" : "encaixes", "aten") : null));   // plano 2000d · DC-303: sem «0 encaixes» (como a linha do dia, CB-178)
  // CA-192: no fim do dia, as que já passaram sem marca de uma vez (confirmação e um Desfazer só)
  const pendentes = presenca && presenca.L && pode && typeof presenca.aoLote === "function" ? pendentesDePresenca(consultas, iso, presenca.L, presenca.agora) : [];
  if (pendentes.length >= 2) el.appendChild(h("button", { type: "button", class: "bt bt-sec bt-p ag-pres-lote", on: { click: ev => presenca.aoLote(pendentes, ev.currentTarget || ev.target) } },
    presenca.icone ? presenca.icone("check") : null, `Marcar as ${num(pendentes.length)} que faltam como Compareceu`));
  if (!r.itens.length) {
    const acao = pode && aoMarcar && !(hoje && iso < hoje) ? { rotulo: `Marcar ${palavra}`, icone: "mais", fn: () => aoMarcar(iso) } : null;   // plano 1500c · GX-038: dia que passou não oferece marcar
    let v = null;
    if (typeof vazio === "function") try { v = vazio({ tema: "agenda", titulo: `Nenhuma ${palavra} neste dia.`, acao }); } catch { v = null; }
    el.appendChild(v ? h("div", { class: "ag-painel-vazio ag-painel-vazio-tema" }, v)
      : h("div", { class: "ag-painel-vazio" }, h("p", { class: "narr" }, `Nenhuma ${palavra} neste dia.`),
        acao ? h("button", { type: "button", class: "bt bt-sec bt-p", on: { click: acao.fn } }, `Marcar ${palavra}`) : null));
    return el;
  }
  const lista = h("ol", { class: "ag-painel-lista" });
  for (const it of r.itens) lista.appendChild(itemDoPainel({ h, it, presenca, pode, aoAbrir, horaBR, telBR, contatos, palavra }));
  el.appendChild(lista);
  return el;
}
/** CA-203: a linha curta do dia no celular: «2 consultas · 1 falta · 1 encaixe» (dia por vir: sem as faltas — CA-190).
    Plano 1500c · CC-303: dia vazio diz «Sem consultas» (o «vazio» soava como erro); dia por vir aberto, «Livre». */
export function textoResumoDia(r, { futuro = false, num = String, livre = false, palavra = "consulta" } = {}) {
  // plano 2000d · GY-004: a palavra da vertical («Sem visitas», «2 visitas · 1 falta»)
  if (!r || !r.total) return futuro && livre ? "Livre" : `Sem ${palavra}s`;
  const n = (v, um, varios) => `${num(v)} ${v === 1 ? um : varios}`;
  return [n(r.total, palavra, `${palavra}s`), r.feitas ? n(r.feitas, "concluída", "concluídas") : null, futuro && !r.faltas ? null : n(r.faltas, "falta", "faltas"),
    r.encaixes ? n(r.encaixes, "encaixe", "encaixes") : null].filter(Boolean).join(" · ");   // plano 1000b · CB-178: sem «0 encaixes»
}
/** Uma consulta da lista (painel do dia e visão «Lista»): hora, paciente, serviço, selos e, se já passou, «Compareceu / Faltou». */
function itemDoPainel({ h, it, presenca = null, pode = false, aoAbrir = null, horaBR = x => x, telBR = String, contatos = null, palavra = "consulta" }) {
  const c = it.c, nome = c.nome || c.titulo || `${maiuscula(palavra)} sem nome`;   // plano 2000d · GY-005: «Visita sem nome»
  const pr = presenca && presenca.L ? presencaDaConsulta(c, presenca.L, presenca.agora) : null;
  const grupo = pr && pr.possivel && typeof presenca.aoMarcar === "function"
    ? montarPresenca({ h, c, estado: pr.estado, aoMarcar: presenca.aoMarcar, icone: presenca.icone, rotulos: presenca.L.PRESENCAS, desabilitado: !pode, palavra }) : null;
  // a presença marcada já aparece no botão pressionado: o selo «Faltou» fica só para a falta pela etapa
  // plano 1500c · CC-239/CC-324: «Confirmada» (quando o servidor mandar confirmada_em) e «IA» (marcado_por = 'ia')
  const selos = [it.feita ? ["Concluída", "pilula-ok"] : null, it.falta && !(grupo && pr.estado === "faltou") ? ["Faltou", "pilula-ruim"] : null, it.encaixe ? ["Encaixe", "pilula-aten"] : null,
    // plano 2000d · DC-370: «Confirmada» na cor de informação (o verde é de «Concluída»); a IA fica neutra; DC-394: a confirmação vale até remarcar
    confirmadaValida(c) && !it.feita ? ["Confirmada", "pilula-info"] : null, c.marcado_por === "ia" ? ["Marcada pela IA", "pilula-sec"] : null,
    // plano 2000d · DC-413: aniversário hoje (aniversario_hoje, quando o servidor mandar); DC-414: há quanto tempo está esperando (chegou_em)
    c.aniversario_hoje === true ? ["🎂 Aniversário", "pilula-prim"] : null,
    textoEspera(c, Date.now()) ? [textoEspera(c, Date.now()), "pilula-aten"] : null].filter(Boolean);
  const bt = h("button", { type: "button", class: ["ag-painel-item", it.feita && "feita"], "aria-haspopup": "dialog", on: { click: () => aoAbrir && aoAbrir(c, bt) } },
    h("span", { class: "ag-painel-hora dado" }, horaBR(c.inicio)),
    // plano 1500c · GX-041: até quando vai (na lista do dia e na impressão ninguém via o fim)
    c.fim && horaBR(c.fim) ? h("span", { class: "ag-painel-fim dado" }, `até ${horaBR(c.fim)}`) : null,
    h("span", { class: "ag-painel-txt" }, h("b", { class: "dado-pessoal" }, nome), c.servico ? h("small", null, c.servico) : null,   // plano 1500c · UC-030: nome e telefone borrados no modo apresentação
      c.telefone ? h("small", { class: "ag-so-impressao dado dado-pessoal" }, telBR(c.telefone)) : null),
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
      // plano 2000d · DC-272/DC-322: «Lembrado» (verde) só com o envio registrado (lembrete_enviado_em); o texto deixado na conversa ou copiado
      // é «Lembrete pronto» (cinza) — com a hora e quem preparou no title e para o leitor de tela
      lembrado ? (() => { const est = typeof lembrado === "object" ? lembrado : estadoLembrete(c, { em: null });
        return est ? h("span", { class: ["pilula", est.tipo === "enviado" ? "pilula-ok" : null, "ag-li-lembrado", est.tipo === "pronto" && "ag-li-pronto"], title: est.detalhe || null },
          est.rotulo, est.detalhe ? h("span", { class: "sr-only" }, ` (${est.detalhe})`) : null) : null; })()
        : podeLembrar && typeof contatos.aoLembrar === "function" ? h("button", { type: "button", class: "bt bt-fant bt-p ag-li-lembrar", "aria-label": `Lembrar ${nome}`, on: { click: () => contatos.aoLembrar(c) } },
          contatos.icone ? contatos.icone("sino") : null, "Lembrar") : null,
    ].filter(Boolean);
    if (bts.length) rapidas = h("span", { class: "ag-li-rapidas" }, bts);
  }
  return h("li", { class: ["ag-painel-li", grupo && "com-presenca", rapidas && "com-rapidas"], dataset: { negocio: c.negocio_id ?? null, nome: chaveFiltroConsulta(c) } }, bt, rapidas, grupo);   // plano 1500c · GX-017: com os dígitos do telefone
}
/** CA-269: a visão «Lista» — os dias do período em ordem, cada um com as consultas (hora, paciente, serviço, selos, presença) ou «Livre».
    Para o celular, onde a grade de horas mostra uma consulta num mar vazio. */
export function montarListaDias({ h, dias = [], consultas = [], config = null, hoje = "", presenca = null, pode = false, aoAbrir = null, aoMarcar = null,
  horaBR = x => x, telBR = String, num = String, uid = "l", bloqueios = [], contatos = null, agora = Date.now(), palavra = "consulta" } = {}) {   // plano 1500c · GX-028: agora; plano 2000d · GY-005: palavra
  const el = h("div", { class: "ag-lista" });
  for (const iso of dias) {
    const r = resumoDoDia(consultas, iso, config);
    const id = `ag-lista-${uid}-${iso}`;
    const rot = rotuloDoDia(iso, hoje);
    // plano 2000d · GY-064: «Ontem · …» também (como o texto de compartilhar o dia); antes só Hoje e Amanhã
    const titulo = rot === "Hoje" || rot === "Amanhã" || rot === "Ontem" ? `${rot} · ${nomeDia(iso, true)}` : nomeDia(iso, true);
    const passado = !!hoje && iso < hoje;
    // plano 1500c · CC-174/CC-175/CC-304: dia bloqueado diz o motivo, dia fechado diz «Fechado» (sem «Marcar») e dia passado sem consulta não é «livre»
    const travas = bloqueiosDoDia(bloqueios, iso);
    const fechado = Array.isArray(faixasDoDia(config, iso)) && faixasDoDia(config, iso).length === 0;
    const todoBloq = diaTodoBloqueado(bloqueios, iso);
    const selo = r.total ? `${num(r.total)} ${r.total === 1 ? palavra : `${palavra}s`}` : passado ? `sem ${palavra}s` : todoBloq ? "bloqueado" : fechado ? "fechado" : "livre";
    const txtOcLista = r.total && !passado ? textoOcupacao(ocupacaoDoDia(consultas, iso, config, bloqueios)) : "";   // plano 2000d · DC-358: uma conta (eram duas)
    const sec = h("section", { class: ["ag-lista-dia", iso === hoje && "hoje", passado && "passado", (todoBloq || fechado) && !r.total && "ag-lista-fechado"], "aria-labelledby": id, dataset: { iso } },
      h("h3", { class: "ag-lista-tit", id }, h("span", null, titulo),
        h("small", { class: "dado" }, selo),
        // plano 1500c · GX-055: a ocupação do dia também na Lista («62% ocupado») — a grade mostrava, a Lista não
        r.total && !passado && txtOcLista ? h("span", { class: "ag-lista-ocup dado" }, txtOcLista) : null));
    if (travas.length) sec.appendChild(h("p", { class: "ag-lista-bloq" }, travas.map(b => textoBloqueioNoDia(b, iso)).join(" · ")));
    if (r.itens.length) {
      const ol = h("ol", { class: "ag-painel-lista" });
      // plano 1500c · GX-028: no dia de hoje, a linha «Agora» separa o que já passou do que vem (quem atende acha o próximo de relance)
      const iAgora = iso === hoje ? r.itens.findIndex(it => Date.parse(it.c.inicio) > agora) : -1;
      r.itens.forEach((it, i) => {
        if (i === iAgora && i > 0) ol.appendChild(h("li", { class: "ag-lista-agora", role: "separator", "aria-label": `Agora, ${horaTxt((partesSP(new Date(agora)) || { min: 0 }).min)}` }, h("span", { "aria-hidden": "true" }, "Agora")));
        ol.appendChild(itemDoPainel({ h, it, presenca, pode, aoAbrir, horaBR, telBR, contatos, palavra }));
      });
      sec.appendChild(ol);
      // plano 1500c · GX-027: o dia que já tem consultas também marca mais uma dali (antes só o dia vazio tinha «Livre · Marcar»)
      if (!passado && !todoBloq && !fechado && pode && typeof aoMarcar === "function")
        sec.appendChild(h("button", { type: "button", class: "bt bt-fant bt-p ag-lista-marcar", "aria-label": `Marcar ${palavra} em ${nomeDia(iso, true)}`, on: { click: () => aoMarcar(iso) } }, "+ Marcar neste dia"));
    } else if (todoBloq || passado) {
      /* o motivo do bloqueio já está escrito; dia passado não marca */
    } else if (fechado) {
      sec.appendChild(h("p", { class: "ag-livre ag-livre-leitura ag-lista-fechado-txt" }, "Fechado neste dia"));
    } else if (pode && typeof aoMarcar === "function") {
      sec.appendChild(h("button", { type: "button", class: "ag-livre ag-lista-livre", "aria-label": `Marcar ${palavra} em ${nomeDia(iso, true)}`, on: { click: () => aoMarcar(iso) } },
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
export function montarPresenca({ h, c, estado = null, aoMarcar, icone = null, rotulos = null, desabilitado = false, palavra = "consulta" } = {}) {
  const nome = (c && (c.nome || c.titulo)) || palavra;   // plano 2000d · GY-011: «Presença da visita» sem nome
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
export function textoSemProxima({ umDia = false, desde = null, hojeISO = null, palavra = "consulta" } = {}) {
  // plano 2000d · GY-002: a palavra da vertical («Nenhuma visita nos próximos 7 dias»)
  return desde && desde === hojeISO ? `Nenhuma ${palavra} nos próximos 7 dias.` : `Nenhuma ${palavra} por vir ${umDia ? "neste dia" : "nesta semana"} nem nos 7 dias seguintes.`;
}
/** CA-181: o primeiro nome para a saudação — a mesma regra do cv-logica.primeiroNome: telefone (o «nome» de quem não tem cadastro) não é nome
    e o pronome de tratamento sai («Dra. Helena Souza» → «Helena»). Sem nome válido, "" (a saudação vira «Olá!»). */
const TRATAMENTOS = new Set(["dr", "dra", "sr", "sra", "srta", "prof", "profa", "pe"]);
export function primeiroNomeAgenda(nome) {
  const t = String(nome ?? "").trim();
  if (!t || /^[\d\s()+-]+$/.test(t)) return "";
  // plano 2000d · DC-278: como o cv-logica (CX-006) — emoji e símbolos saem («🌸 Maria» → «Maria», «~Ana~» → «Ana»); só palavras com letra
  const partes = t.split(/\s+/).map(p => p.replace(/^[^\p{L}]+|[^\p{L}.]+$/gu, "")).filter(p => /\p{L}/u.test(p));
  if (!partes.length) return "";
  let i = 0;
  while (i < partes.length - 1 && TRATAMENTOS.has(partes[i].normalize("NFD").replace(/[̀-ͯ]/g, "").toLowerCase().replace(/\.$/, ""))) i++;
  if (TRATAMENTOS.has(partes[i].normalize("NFD").replace(/[̀-ͯ]/g, "").toLowerCase().replace(/\.$/, ""))) return "";   // só o título
  // plano 1500c · CC-210: nome todo em maiúsculas («MARIA SOUZA») vira «Maria» (a mesma regra proposta para o cv-logica)
  // plano 2000d · DC-279: sigla de até 2 letras fica («JP» é «JP», como na conversa)
  const p = partes[i].length > 2 && partes[i] === partes[i].toLocaleUpperCase("pt-BR") && partes[i] !== partes[i].toLocaleLowerCase("pt-BR")
    ? partes[i].toLocaleLowerCase("pt-BR") : partes[i];
  return p.charAt(0).toLocaleUpperCase("pt-BR") + p.slice(1);
}
const saudacao = c => { const n = primeiroNomeAgenda(c && c.nome); return `Olá${n ? `, ${n}` : ""}!`; };
const quandoTxt = (p, hojeISO) => (p.dia === hojeISO ? "hoje" : p.dia === diaISO(hojeISO, 1) ? "amanhã" : `dia ${p.dia.slice(8, 10)}/${p.dia.slice(5, 7)} (${semanaLonga(p.dia)})`);
/** Plano 2000d · DC-395: horários lidos há mais tempo que isto são relidos ao voltar a eles. */
export const HORARIOS_VELHOS_MS = 2 * 60 * 1000;
/** Plano 2000d · DC-294: exemplos da vertical para os campos (serviço, observação, capacidade). */
const EXEMPLOS_AGENDA = {
  odonto: { servicos: "Ex.: Avaliação, Limpeza, Clareamento", obs: "trazer exames", capacidade: "uma cadeira = 1" },
  oficina: { servicos: "Ex.: Revisão, Troca de óleo, Alinhamento", obs: "deixar a chave na recepção", capacidade: "um elevador = 1" },
  loja: { servicos: "Ex.: Entrega, Montagem, Retirada", obs: "interfone 12", capacidade: "uma equipe de entrega = 1" },
  generico: { servicos: "Ex.: Atendimento, Retorno", obs: "chegar 10 min antes", capacidade: "uma pessoa atendendo = 1" },
};
export function exemplosAgenda(vocab = null) {
  const v = vocab && vocab.vertical;
  return EXEMPLOS_AGENDA[v] || (v ? EXEMPLOS_AGENDA.generico : EXEMPLOS_AGENDA.odonto);
}
/** Plano 1500c · CC-205: a palavra do que a Agenda marca na vertical (consulta · visita · entrega; vocab.compromisso, sempre feminina). */
export function palavraCompromisso(vocab = null) { return vocab && typeof vocab.min === "function" && vocab.compromisso ? vocab.min("compromisso") : "consulta"; }
const servicoTxt = c => { const s = String((c && c.servico) || "").trim(); return s ? ` (${s})` : ""; };
/** E6: texto curto do lembrete (a pessoa confere e envia): «Olá, Mariana! Passando para lembrar da sua consulta (Avaliação) amanhã às 10:00. Podemos confirmar?»
    Plano 1500c · CC-205/CC-206: a palavra da vertical e, com `empresa`/`endereco`, de onde é e onde fica («Aqui é da Clínica Sorriso… na Rua X, 10»). */
export function textoLembrete(c, hojeISO, { vocab = null, empresa = "", endereco = "" } = {}) {
  const p = c && partesSP(c.inicio);
  if (!p) return "";
  const pal = palavraCompromisso(vocab), emp = String(empresa || "").trim(), end = String(endereco || "").replace(/\s+/g, " ").trim().slice(0, 160);
  // plano 2000d · DC-299: «Aqui é de …» (sem artigo: «da Auto Center João» soava errado); DC-298: o endereço em frase própria
  // («na Edifício Square Offices» também); DC-348: DDD de outro fuso ouve «(horário de Brasília)»
  if (emp || end) return `${saudacao(c)}${emp ? ` Aqui é de ${emp}.` : ""} Lembrando da sua ${pal}${servicoTxt(c)} ${quandoTxt(p, hojeISO)} às ${horaTxt(p.min)}${fusoTxt(c)}.${end ? ` Endereço: ${end}.` : ""} Podemos confirmar?`;
  return `${saudacao(c)} Passando para lembrar da sua ${pal}${servicoTxt(c)} ${quandoTxt(p, hojeISO)} às ${horaTxt(p.min)}${fusoTxt(c)}. Podemos confirmar?`;
}
/** Plano 2000d · DC-348: DDDs fora do horário de Brasília (AM, RR, RO, AC, MT, MS). */
const DDD_OUTRO_FUSO = new Set(["65", "66", "67", "68", "69", "92", "95", "97"]);
/** Plano 2000d · DC-348: o telefone é de um estado com outro fuso? (55 + DDD, ou DDD direto) */
export function dddDeOutroFuso(tel) {
  let d = digitosTelefone(tel);
  if (d.length >= 12 && d.startsWith("55")) d = d.slice(2);
  return d.length >= 10 && d.length <= 11 && DDD_OUTRO_FUSO.has(d.slice(0, 2));
}
const fusoTxt = c => (c && dddDeOutroFuso(c.telefone) ? " (horário de Brasília)" : "");
/** CA-176: a confirmação logo depois de marcar (rascunho na conversa; nada sai sozinho). CC-205: a palavra da vertical.
    Plano 2000d · DC-300: com `empresa`/`endereco` (os mesmos do lembrete) diz de onde é e onde fica; `chegada` (min) pede para chegar antes. */
export function textoConfirmacao(c, hojeISO, { vocab = null, empresa = "", endereco = "", chegada = 0 } = {}) {
  const p = c && partesSP(c.inicio);
  if (!p) return "";
  const pal = palavraCompromisso(vocab), emp = String(empresa || "").trim(), end = String(endereco || "").replace(/\s+/g, " ").trim().slice(0, 160);
  const ant = Math.floor(Number(chegada)) > 0 && Math.floor(Number(chegada)) <= 60 ? ` Chegue ${Math.floor(Number(chegada))} min antes.` : "";
  return `${saudacao(c)}${emp ? ` Aqui é de ${emp}.` : ""} Sua ${pal}${servicoTxt(c)} está marcada para ${quandoTxt(p, hojeISO)} às ${horaTxt(p.min)}${fusoTxt(c)}.${end ? ` Endereço: ${end}.` : ""}${ant} Qualquer imprevisto, é só avisar por aqui.`;
}
/** CA-178: o aviso de que a consulta foi desmarcada (rascunho; a pessoa confere e envia). CC-207: com o serviço; CC-205: a palavra da vertical. */
/** Plano 2000d · GY-014/GY-015/GY-016: «Aqui é de Clínica Sorriso.» — a mesma apresentação do lembrete e da confirmação (DC-299/DC-300). */
const deOndeTxt = empresa => { const emp = String(empresa || "").trim(); return emp ? ` Aqui é de ${emp}.` : ""; };
export function textoDesmarcacao(c, hojeISO, { vocab = null, empresa = "" } = {}) {
  const p = c && partesSP(c.inicio);
  if (!p) return "";
  // plano 2000d · GY-013: DDD de outro fuso ouve «(horário de Brasília)», como no lembrete (DC-348); GY-015: de onde é
  return `${saudacao(c)}${deOndeTxt(empresa)} Sua ${palavraCompromisso(vocab)}${servicoTxt(c)} de ${quandoTxt(p, hojeISO)} às ${horaTxt(p.min)}${fusoTxt(c)} foi desmarcada. Quer escolher um novo horário?`;
}
/** Plano 1500c · CC-178: o aviso de remarcação («Sua consulta (Avaliação) foi remarcada para amanhã às 10:00.») — `c.inicio` já é o horário NOVO. */
export function textoRemarcacao(c, hojeISO, { vocab = null, empresa = "" } = {}) {
  const p = c && partesSP(c.inicio);
  if (!p) return "";
  // plano 2000d · GY-012: o horário NOVO para quem está em Manaus diz «(horário de Brasília)»; GY-014: de onde é
  return `${saudacao(c)}${deOndeTxt(empresa)} Sua ${palavraCompromisso(vocab)}${servicoTxt(c)} foi remarcada para ${quandoTxt(p, hojeISO)} às ${horaTxt(p.min)}${fusoTxt(c)}. Se não puder, é só avisar por aqui.`;
}
/** Plano 1500c · CC-223: para quem faltou — «Sentimos sua falta na consulta de hoje. Vamos remarcar?». */
export function textoFalta(c, hojeISO, { vocab = null, empresa = "" } = {}) {
  const p = c && partesSP(c.inicio);
  if (!p) return "";
  const quando = p.dia === hojeISO ? "de hoje" : p.dia === diaISO(hojeISO, -1) ? "de ontem" : `do dia ${p.dia.slice(8, 10)}/${p.dia.slice(5, 7)}`;
  return `${saudacao(c)}${deOndeTxt(empresa)} Sentimos sua falta na ${palavraCompromisso(vocab)}${servicoTxt(c)} ${quando}. Vamos remarcar? Me diga o melhor dia e horário.`;   // plano 2000d · GY-016
}
/** E6: a conversa do contato onde o lembrete entra: a aberta; sem aberta, a mais recente (a mesma regra de #/conversas?contato=).
    plano 2000d · DC-437: com VÁRIAS abertas (Meta + CodeWords), a de mensagem do cliente mais recente (ultima_entrada_em; sem ela,
    aberta_em) — empate, a do canal padrão (`padrao` = true) — e não a primeira da lista. */
export function conversaDoContato(conversas) {
  const lista = Array.isArray(conversas) ? conversas.filter(c => c && c.id != null) : [];
  const t = c => { const x = Date.parse(c.ultima_entrada_em || c.aberta_em || ""); return Number.isFinite(x) ? x : -Infinity; };
  const abertas = lista.filter(c => c.status !== "resolvida").sort((a, b) => t(b) - t(a) || (b.padrao === true) - (a.padrao === true));
  return abertas[0] || lista.slice().sort((a, b) => String(b.aberta_em || "").localeCompare(String(a.aberta_em || "")))[0] || null;
}
/** Plano 2000d · DC-271: a janela de 24 h da conversa está FECHADA? A mesma regra do cv-logica.canalTemJanela: tem janela todo canal que
    NÃO é o aparelho (codewords) — provedor vazio ou desconhecido também confere janela_ate / ultima_entrada_em (antes só /meta|cloud|oficial/,
    e a conversa sem provedor na linha recebia texto livre com as 24 h fechadas). */
export function janelaFechadaConversa(conv, agora = Date.now()) {
  if (!conv) return false;
  const prov = String(conv.provedor || conv.canal_provedor || (conv.canal && conv.canal.provedor) || "").toLowerCase();
  if (prov === "codewords") return false;
  const ate = Date.parse(conv.janela_ate);
  const ent = Date.parse(conv.ultima_entrada_em);
  const fim = Number.isFinite(ate) ? ate : Number.isFinite(ent) ? ent + 24 * 3600e3 : NaN;
  if (!Number.isFinite(fim)) return /meta|cloud|oficial/.test(prov);   // sem dado nenhum: só o número oficial conhecido é tratado como fechado
  return !(fim > agora);
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
  const rastreio = it.rastreio && typeof it.rastreio === "object" ? it.rastreio : {};
  // plano 2000d · DC-304: anúncio da Meta diz se veio do Instagram ou do Facebook (utm_source / publisher_platform, quando houver)
  const fonte = String(rastreio.utm_source || it.publisher_platform || "").toLowerCase();
  const rede = /insta|^ig$/.test(fonte) ? "Instagram" : /face|^fb$/.test(fonte) ? "Facebook" : "";
  const nome = it.plataforma === "google" ? "Google Ads"
    : it.plataforma === "meta" ? (rede ? `${rede} (Meta Ads)` : "Meta Ads")
      : ORIGENS[it.origem] || SEM_ORIGEM;
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
  if (iso === diaISO(hojeISO, -1)) return "Ontem";     // plano 1500c · GX-007: «De ontem 10:00 → Hoje 15:00» (antes «Qua 14/10»)
  const sem = semanaCurta(iso);
  return `${sem.charAt(0).toUpperCase()}${sem.slice(1)} ${iso.slice(8, 10)}/${iso.slice(5, 7)}`;
}
/** O primeiro horário livre de todos. Plano 2000d · DC-270: pula os dias que só têm horários lotados (grupo sem livres, para o encaixe). */
export function primeiroLivre(grupos) { for (const g of grupos || []) if (g && g.itens && g.itens[0]) return g.itens[0]; return null; }
/** Plano 2000d · DC-270/DC-452: os dias da janela — os livres agrupados (agruparLivres) e, para quem ENCAIXA (supervisor+), também os dias
    em que tudo está lotado (grupo com `itens` vazio e `lotados`): com o dia inteiro cheio a janela ainda deixa escolher o encaixe. */
export function gruposParaEscolha(horarios, { encaixa = false } = {}) {
  const livres = agruparLivres(horarios);
  if (!encaixa) return livres;
  const ja = new Set(livres.map(g => g.dia)), lotados = new Map();
  for (const s of horarios || []) {
    if (!s || s.livre !== false) continue;
    const p = partesSP(s.inicio);
    if (!p || ja.has(p.dia)) continue;
    if (!lotados.has(p.dia)) lotados.set(p.dia, 0);
    lotados.set(p.dia, lotados.get(p.dia) + 1);
  }
  return [...livres, ...[...lotados.entries()].map(([dia, n]) => ({ dia, itens: [], lotados: n }))].sort((a, b) => (a.dia < b.dia ? -1 : a.dia > b.dia ? 1 : 0));
}
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
/** Plano 2000d · DC-445: o que fazer se a pessoa queria aquele dia — quem encaixa (supervisor, com horário lotado no dia): escolher um lotado;
    os demais: tentar outro dia. */
export function acaoOutroDia({ encaixa = false, temLotado = false } = {}) {
  return encaixa && temLotado ? "Para encaixar nesse dia, escolha um horário lotado." : "Se precisa ser nesse dia, escolha outra data ou fale com quem pode encaixar.";
}
/** Plano 2000d · DC-352: a data pedida (o retorno em 15 dias caiu no feriado) é bloqueada o dia todo e a janela mostra outro dia →
    «15/11 é feriado (Proclamação da República): mostrando 16/11». null quando não é o caso. */
export function avisoDiaBloqueado(diaPedido, slot, bloqueios, hojeISO) {
  if (!dataAgendaValida(diaPedido) || !diaTodoBloqueado(bloqueios, diaPedido) || (slot && slot.dia === diaPedido)) return null;
  const dm = iso => `${iso.slice(8, 10)}/${iso.slice(5, 7)}`;
  const motivo = motivoDoDiaBloqueado(bloqueios, diaPedido);
  return `${dm(diaPedido)} está fechado${motivo ? ` (${motivo})` : ""}${slot && slot.dia ? `: mostrando ${rotuloDoDia(slot.dia, hojeISO).toLowerCase()}` : ""}.`;
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
export function avisoVoltaEncaixe(r, palavra = "consulta") {
  if (!(r && r.voltou_como_encaixe)) return "";
  // plano 2000d · GY-010: «A visita voltou como encaixe» (a palavra da vertical)
  return r.motivo_encaixe === "horario_ocupado" ? `A ${palavra} voltou como encaixe: o horário já estava cheio.`
    : `A ${palavra} voltou como encaixe: o horário não aceitava mais marcação normal (antecedência ou horário de atendimento).`;
}

/** Plano 1500c · GX-031/GX-032: o que vai para a busca — telefone com máscara (só dígitos e sinais, 4+ dígitos) vira só os dígitos; nome fica. */
export function termoBusca(q) {
  const t = String(q || "").trim();
  return /^[\d\s()+.-]+$/.test(t) && t.replace(/\D/g, "").length >= 4 ? digitosTelefone(t) : t;
}
/** Oportunidades ABERTAS que casam com a busca (uma chamada: nx_buscar). Servidor sem a busca → cai no quadro do funil (mais lento). */
async function procurarNegocios(ctx, q) {
  const { api } = ctx;
  // plano 1500c · GX-031: telefone digitado com máscara («(12) 99999-0000») vai como dígitos — o cadastro guarda só os números
  q = termoBusca(q);
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
  // plano 2000d · DC-393: sem nx_buscar, os já GANHOS também (10 por funil) — o «Já atendidos · Marcar retorno» não some calado
  const ganhos = new Map(), mapaG = new Map();
  await comLimite(funis, 4, async funil => {
    try { lidos.set(funil, await api.rpcC("nx_negocios_kanban", { p_funil: funil.id, p_filtro: { busca: q, status: "aberto" }, p_por_coluna: 30 })); }
    catch (e) { erroFunil = erroFunil || e; }
    try { ganhos.set(funil, await api.rpcC("nx_negocios_kanban", { p_funil: funil.id, p_filtro: { busca: q, status: "ganho" }, p_por_coluna: 10 })); }
    catch { /* sem os ganhos: só os abertos */ }
  });
  if (erroFunil && !lidos.size) throw erroFunil;     // nenhum funil respondeu: o erro aparece (não «nenhuma oportunidade»)
  for (const funil of funis) {
    const rr = lidos.get(funil) || {};
    for (const coluna of rr.colunas || []) for (const item of coluna.itens || []) {
      if (item.status === "aberto" && !mapa.has(String(item.id))) mapa.set(String(item.id), { id: item.id, titulo: item.titulo || item.nome, contato_nome: item.contato && item.contato.nome, estagio_nome: item.estagio_nome || funil.nome, status: "aberto" });
    }
    for (const coluna of (ganhos.get(funil) || {}).colunas || []) for (const item of coluna.itens || []) {
      if (item.status === "ganho" && !mapaG.has(String(item.id))) mapaG.set(String(item.id), { id: item.id, titulo: item.titulo || item.nome, contato_nome: item.contato && item.contato.nome, contato_id: item.contato_id ?? (item.contato && item.contato.id) ?? null, estagio_nome: item.estagio_nome || funil.nome, status: "ganho" });
    }
  }
  return [...[...mapa.values()].slice(0, 30), ...[...mapaG.values()].slice(0, 10)];
}

/** Setas movem e escolhem dentro de um grupo de botões role=radio (só o marcado fica na ordem do Tab). */
function radiosComSetas(grupo) {
  grupo.addEventListener("keydown", ev => {
    const bts = [...grupo.querySelectorAll('[role="radio"]:not([aria-disabled="true"])')];   // plano 2000d · DC-446: o lotado desabilitado fica de fora
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
  encaixeAgora = false, consultas = [], bloqueios = [] } = {}) {   // plano 1500c · CC-253: «Encaixar agora» (quem chegou sem hora): o horário de agora já vem escolhido como encaixe
  // plano 2000d · DC-439/DC-352: as consultas e os bloqueios da tela (quem está na cadeira agora; o feriado em que o retorno cairia)
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
  const palM = palavraCompromisso(ctx.vocab);   // plano 2000d · GY-028: a palavra da vertical já no começo da janela
  const campoBusca = ui.campo({ rotulo: `Buscar ${P.neg} ${P.aberta}`, nome: "busca", tipo: "busca", placeholder: "Nome ou telefone", ajuda: `A ${palM} fica vinculada ${P.a === "a" ? "à" : "ao"} ${P.neg} ${P.escolhida}. Setas escolhem na lista.` });
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
  // plano 2000d · DC-294: o exemplo é da vertical (oficina: revisão, troca de óleo); DC-388: o mesmo limite da configuração (60)
  const servicoEl = ui.campo({ rotulo: "Serviço", nome: "servico", valor: sel && sel.servico || "", max: 60, placeholder: exemplosAgenda(ctx.vocab).servicos, ajuda: `Define a duração; vazio = o d${P.a} ${P.neg}.` });
  const servInput = servicoEl.querySelector("input");
  // CA-169: os serviços com duração própria (configuração da agenda) aparecem como sugestão; nome diferente avisa que vale a duração padrão
  const listaServ = h("datalist", { id: `ag-serv-${uid}` });
  servInput.setAttribute("list", listaServ.getAttribute("id"));
  const avisoServ = h("p", { class: "campo-ajuda ag-serv-aviso", "aria-live": "polite" });
  // plano 1500c · CC-204: no toque o datalist quase não aparece — os serviços da configuração viram chips acima do campo (o CSS mostra só no toque)
  const chipsServ = h("div", { class: "ag-serv-chips", role: "group", "aria-label": "Serviços cadastrados" });
  const outraData = ui.campo({ rotulo: "Ver a partir de", nome: "data", tipo: "data", valor: aPartirInicial });
  outraData.querySelector("input").setAttribute("min", hoje);   // plano 1000b · CB-169: o seletor não oferece dia passado
  // plano 1500c · GX-033: nem dia além do limite de dias à frente (Configurações › Agenda) — o calendário já não oferece o que o servidor recusa
  const ajustarMaxData = () => { if (cfgAgenda && Number(cfgAgenda.dias_a_frente) >= 1) outraData.querySelector("input").setAttribute("max", diaISO(hoje, limiteDiasAgenda(cfgAgenda))); };
  ajustarMaxData();
  // plano 1500c · CC-202: retorno em 1 semana, 15 ou 30 dias sem contar no calendário
  // plano 2000d · DC-342: o retorno conta da consulta atual (remarcando a da semana que vem) quando ela é futura, senão de hoje — o title diz de quando;
  // DC-314: o escolhido fica com aria-pressed (some quando a data muda à mão); DC-352: caindo num feriado bloqueado, o aviso diz
  let retornoEscolhido = null;
  let lidoEm = 0;                                          // plano 2000d · DC-395: quando os horários foram lidos
  const baseRetorno = () => { const p = sel && sel.consultaAtual ? partesSP(sel.consultaAtual) : null; return p && p.dia > hoje ? p.dia : hoje; };
  // plano 2000d · GY-033: o retorno da vertical/serviço («Em 6 meses» na odonto) também num toque, quando passa de 30 dias e cabe no limite
  const nRetorno = retornoEmDias({ servico: (sel && sel.servico) || "" }, cfgAgenda, ctx.vocab);
  const opcoesRetorno = [[7, "Em 1 semana"], [15, "15 dias"], [30, "30 dias"],
    ...(nRetorno > 30 && nRetorno <= limiteDiasAgenda(cfgAgenda) ? [[nRetorno, `Em ${textoRetornoDias(nRetorno)}`]] : [])];
  const retornoBts = opcoesRetorno.map(([n, rot]) => h("button", { type: "button", class: "bt bt-fant bt-p ag-retorno", dataset: { dias: String(n) }, "aria-pressed": "false",
    on: { click: () => {
      const base = baseRetorno(), alvo = diaISO(base, n);
      outraData.querySelector("input").value = alvo; retornoEscolhido = { n, alvo, base }; pintarRetornos(); aoTrocarData({ deRetorno: true });
    } } }, rot));
  function pintarRetornos() {
    const base = baseRetorno();
    for (const b of retornoBts) {
      const n = Number(b.dataset.dias), on = !!retornoEscolhido && retornoEscolhido.n === n && outraData.querySelector("input").value === retornoEscolhido.alvo;
      b.setAttribute("aria-pressed", String(on)); b.classList.toggle("ativo", on);
      b.setAttribute("title", base !== hoje ? `${n} dias depois de ${base.slice(8, 10)}/${base.slice(5, 7)}` : `${n} dias a partir de hoje`);
    }
  }
  const retornos = h("div", { class: "ag-retornos", role: "group", "aria-label": "Retorno em" }, retornoBts);
  // plano 1500c · CC-245: a observação da consulta («trazer exames») vai junto (p_observacao: o servidor grava na nota da marcação)
  const obsEl = soEscolher ? null : ui.campo({ rotulo: "Observação (opcional)", nome: "observacao", max: 200, placeholder: `Ex.: ${exemplosAgenda(ctx.vocab).obs}` });   // plano 2000d · DC-294
  const atalhos = h("div", { class: "ag-atalhos" });
  const diasEl = h("div", { class: "ag-dias", role: "radiogroup", "aria-label": "Dia" });
  const horasEl = h("div", { class: "ag-horas", role: "radiogroup", "aria-label": "Horário" });
  const maisEl = h("button", { type: "button", class: "bt bt-fant bt-p ag-mais-dias", hidden: true, on: { click: () => verMaisDias() } }, "Ver mais 14 dias");
  const info = h("p", { class: "campo-ajuda ag-info", role: "status", "aria-live": "polite" });
  // plano 2000d · DC-443: remarcando pela janela, «De sex 24/10 10:00 → Para seg 27/10 14:00» acima do Confirmar (como no arrasto)
  const deParaEl = h("p", { class: "ag-de-para", hidden: true });
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
    chipsServ, h("div", { class: "agenda-form-grade" }, servicoEl, outraData), avisoServ, listaServ, retornos, outroDia, atalhos, diasEl, horasEl, maisEl, info, deParaEl, encaixeEl, obsEl);   // plano 1500c · CC-202/CC-204/CC-245
  const formulario = h("form", { class: "agenda-form", novalidate: true }, quem, quando, statusEl, faltaEl);
  const avisarOutroDia = txt => { outroDiaTxt.textContent = txt || ""; outroDia.hidden = !txt; };
  radiosComSetas(diasEl); radiosComSetas(horasEl);
  const servicoValor = () => servInput.value.trim();
  const dataValor = () => outraData.querySelector("input").value || hoje;

  /* ---------- CA-169: durações por serviço ---------- */
  function avisarServico() {
    const dur = cfgAgenda && cfgAgenda.duracoes && typeof cfgAgenda.duracoes === "object" ? cfgAgenda.duracoes : null;
    const v = servicoValor();
    // plano 2000d · GY-098: o chip do serviço que está no campo fica pressionado (o CSS .ag-serv-chip[aria-pressed] já existia sem uso)
    for (const ch of chipsServ.querySelectorAll(".ag-serv-chip")) ch.setAttribute("aria-pressed", String(!!v && normServico(ch.dataset.servico) === normServico(v)));
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
      .then(r => { if (r && r.config && typeof r.config === "object") { cfgAgenda = r.config; pintarServicos(); ajustarMaxData(); } }).catch(() => { /* sem a configuração: sem sugestões */ });
  }
  servInput.addEventListener("input", avisarServico);

  /* ---------- CA-171: «Confirmar» só vale com a oportunidade e o horário ---------- */
  // plano 1500c · CC-199: vindo da busca, «Confirmar» espera a ficha (no máximo 1,5 s) — o aviso «será remarcada» aparece antes do 2º toque
  let fichaPendente = false;
  function atualizarConfirmar() {
    const falta = !sel ? `Escolha ${P.a} ${P.neg}.` : !slotSel ? "Escolha um dia e um horário livre." : fichaPendente ? `Conferindo se já tem ${palM} marcada…` : "";   // plano 2000d · GY-024
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
    pintarRetornos();                                      // plano 2000d · DC-342: a base do retorno muda com a consulta escolhida
    escolhido.append(h("div", { class: "linha agenda-escolhido-topo" },
      h("p", { class: "agenda-escolhido", role: "status" }, `${sel.titulo}${sel.funil_nome ? ` · ${sel.funil_nome}` : ""}`),
      negocio ? null : h("button", { type: "button", class: "bt bt-fant bt-p", on: { click: () => { sel = null; slotSel = null; grupos = []; diaSel = null; ui.limpar(atalhos); ui.limpar(diasEl); ui.limpar(horasEl); maisEl.hidden = true; info.textContent = ""; avisarOutroDia(null); pintarEscolhido(); inputBusca.focus(); } } }, "Trocar")));
    if (sel.consultaAtual && Date.parse(sel.consultaAtual) > Date.now()) {
      // plano 2000d · DC-293: a palavra da vertical (visita, entrega)
      escolhido.append(h("p", { class: "aviso aviso-aten" }, ui.icone("info"), h("span", null, `Já tem ${palavraCompromisso(ctx.vocab)} marcada para ${ui.dataHoraBR(sel.consultaAtual)}. Ao confirmar, ela será remarcada.`)));
    }
    // plano 2000d · DC-326: consulta por vir do mesmo contato em outro negócio
    if (Array.isArray(sel.outras) && sel.outras.length) {
      const o = sel.outras[0];
      escolhido.append(h("p", { class: "aviso aviso-aten ag-outra-consulta", role: "status" }, ui.icone("info"),
        h("span", null, `${sel.nome || "Esta pessoa"} já tem ${palavraCompromisso(ctx.vocab)} ${ui.dataHoraBR(o.consulta_em)}${o.titulo ? ` (${o.titulo})` : " (outro atendimento)"}. Confira se não é a mesma antes de confirmar.`)));
    }
  }

  /* ---------- horários: chips de dia, pílulas de hora, atalhos ---------- */
  function selecionarSlot(slot, diaEscolhido = null) {
    slotSel = slot || null;
    diaSel = slot ? slot.dia : diaEscolhido || (grupos[0] && grupos[0].dia) || null;   // plano 2000d · DC-270: o dia só de lotados fica escolhido sem horário
    // plano 1500c · CC-299/CC-318: escolher um horário LOTADO (só supervisor+) já liga o encaixe, com o aviso; outro horário desliga
    const lotado = !!(slot && slot.livre === false);
    encaixeChk.checked = lotado; encaixeEl.hidden = !lotado;
    desenharAtalhos(); desenharDias(); desenharHoras();
    // plano 1500c · CC-049: «horário de Brasília», o mesmo nome dos Departamentos (cv-config)
    // plano 1500c · GX-051: «das 10:00 às 10:45» — o fim já calculado (cabe antes do almoço? da reunião?)
    const ate = slot && Number(duracao) > 0 ? ` às ${horaTxt(Math.min(24 * 60 - 1, slot.min + Number(duracao)))}` : "";
    // plano 2000d · GY-096: servidor sem duracao_min não escreve «duração prevista null min»
    const durTxt = Number(duracao) > 0 ? ` · duração prevista ${ui.num(duracao)} min` : "";
    info.textContent = slot ? `${rotuloDoDia(slot.dia, hoje)}, ${ate ? "das " : ""}${ui.horaBR(slot.inicio)}${ate}${durTxt} · horário de Brasília${lotado ? " · encaixe" : ""}` : "";
    const deP = sel && sel.consultaAtual && Date.parse(sel.consultaAtual) > Date.now() ? partesSP(sel.consultaAtual) : null;
    deParaEl.textContent = deP && slot ? `De ${rotuloDoDia(deP.dia, hoje).toLowerCase()} ${horaTxt(deP.min)} → Para ${rotuloDoDia(slot.dia, hoje).toLowerCase()} ${horaTxt(slot.min)}` : "";
    deParaEl.hidden = !(deP && slot);
    atualizarConfirmar();
  }
  function desenharAtalhos() {
    ui.limpar(atalhos);
    const pl = primeiroLivre(grupos), am = amanhaDeManha(grupos, hoje);
    // plano 1500c · CC-201: «Hoje à tarde» e «Próxima semana», os pedidos mais comuns no telefone (sem repetir o que já é outro atalho)
    const ta = hojeATarde(grupos, hoje), ps = proximaSemana(grupos, hoje);
    const ja = new Set([pl, am].filter(Boolean).map(s => s.inicio));
    // plano 2000d · GY-097: o atalho do horário escolhido diz isso ao leitor de tela (aria-pressed), não só pela cor
    const bt = (s, rot, cls, ic = null) => h("button", { type: "button", class: ["bt", "bt-fant", "bt-p", cls, slotSel && s.inicio === slotSel.inicio && "ativo"], "aria-pressed": String(!!(slotSel && s.inicio === slotSel.inicio)), on: { click: () => selecionarSlot(s) } }, ic, rot);
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
        "aria-label": `${rotuloDoDia(g.dia, hoje)}, ${g.itens.length ? textoLivresDoDia(g.itens.length) : "lotado: escolha um horário para encaixar"}`,   // plano 2000d · DC-284: «1 horário livre»
        on: { click: () => {
          // trocar de dia mantém, se der, o mesmo horário
          const mesmo = slotSel && g.itens.length ? slotMaisPerto(grupos, g.dia, horaTxt(slotSel.min)) : null;
          selecionarSlot(mesmo || g.itens[0] || null, g.dia);
        } } }, rotuloDoDia(g.dia, hoje), g.itens.length ? null : h("small", { class: "ag-dia-chip-lotado", "aria-hidden": "true" }, " · lotado")));
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
            // plano 2000d · DC-446: para quem não encaixa, o lotado é um rádio desabilitado (fora do Tab e das setas), não texto solto no grupo
            : h("span", { role: "radio", "aria-disabled": "true", "aria-checked": "false", tabindex: "-1", class: "ag-hora-pill ag-hora-lotada dado", "aria-label": `${diaRot}, ${horaTxt(s.min)}, lotado` }, horaTxt(s.min), h("small", { class: "ag-hora-vagas", "aria-hidden": "true" }, "lotado")));
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
      lidoEm = Date.now();                                    // plano 2000d · DC-395
      const encaixa = ctx.pode("supervisor") && !soEscolher;
      grupos = gruposParaEscolha(r.horarios, { encaixa });   // plano 2000d · DC-270: o supervisor vê também os dias inteiros lotados
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
          // plano 2000d · DC-439: quem ainda está na cadeira (a das 14:00 vai até 14:45) — a recepção não promete um horário que não existe
          const cadeira = ocupadaAgora(consultas, Date.now(), Number(cfgAgenda && cfgAgenda.duracao_min) || 30, Number(cfgAgenda && cfgAgenda.capacidade) || 1);   // plano 2000d · GY-073
          if (cadeira && cadeira.fim > min) {
            const sug = { inicio: isoNoFuso(hoje, horaTxt(cadeira.fim)), dia: hoje, min: cadeira.fim, livre: false, capacidade: 1, ocupados: 1 };
            info.textContent = `${info.textContent} A cadeira está ocupada até ${horaTxt(cadeira.fim)} (${cadeira.nome}).`;
            avisarOutroDia(`A cadeira está ocupada até ${horaTxt(cadeira.fim)} (${cadeira.nome}).`);
            outroDia.appendChild(h("button", { type: "button", class: "bt bt-fant bt-p ag-encaixe-depois", on: { click: () => {
              if (!lotadosPorDia.get(hoje).some(x => x.inicio === sug.inicio)) lotadosPorDia.get(hoje).push(sug);
              selecionarSlot(sug); avisarOutroDia(null);
            } } }, `Usar ${horaTxt(cadeira.fim)}`));
          }
          return;
        }
      }
      // plano 2000d · DC-270: tudo lotado nos 14 dias — o supervisor escolhe um para encaixar (os dias cheios aparecem); os demais, o aviso
      const soLotados = grupos.length && !primeiroLivre(grupos);
      if (!grupos.length || soLotados) {
        slotSel = null;
        if (soLotados) { selecionarSlot(null, grupos[0].dia); info.textContent = "Todos os horários dos próximos 14 dias estão cheios: escolha um para encaixar."; return; }
        diaSel = null; atualizarConfirmar();
        info.textContent = lotadosPorDia.size ? "Todos os horários dos próximos 14 dias estão cheios. Veja mais dias, tente outra data ou peça a um supervisor para encaixar."
          : "Não há horários livres nos 14 dias a partir desta data. Veja mais dias, tente outra data ou confira as configurações da agenda.";
        return;
      }
      let escolha = null;
      if (inicial && preferido) escolha = slotMaisPerto(grupos, preferido.dia, preferido.hora);
      if (!escolha && slotSel) escolha = grupos.flatMap(g => g.itens).find(s => s.inicio === slotSel.inicio) || null;
      selecionarSlot(escolha || primeiroLivre(grupos));
      if (inicial) avisarOutroDia(avisoOutroDia(diaPedido, slotSel, hoje));
      if (inicial && !outroDia.hidden) outroDiaTxt.textContent = `${outroDiaTxt.textContent}. ${acaoOutroDia({ encaixa: ctx.pode("supervisor") && !soEscolher, temLotado: (lotadosPorDia.get(diaPedido) || []).length > 0 })}`;   // plano 2000d · DC-445
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
  function aoTrocarData({ deRetorno = false } = {}) {
    // plano 1000b · CB-169: data passada (digitada) vira hoje, com o aviso — o servidor só tem horário de hoje em diante
    const campo = outraData.querySelector("input");
    let aviso = "";
    if (!deRetorno) { retornoEscolhido = null; pintarRetornos(); }      // plano 2000d · DC-314: a data mudada à mão tira o «pressionado»
    if (campo.value && campo.value < hoje) { campo.value = hoje; aviso = "Essa data já passou: mostrando a partir de hoje."; }
    const pedida = campo.value;
    if (sel) {
      slotSel = null;
      carregarHorarios().then(() => {
        if (aviso && !info.textContent.startsWith(aviso)) info.textContent = `${aviso} ${info.textContent}`.trim();
        // plano 2000d · DC-352: a data pedida (retorno em 15 dias, ou digitada) é feriado/bloqueio do dia todo → diz qual e para onde foi
        const fer = avisoDiaBloqueado(pedida, slotSel, bloqueios, hoje);
        if (fer) avisarOutroDia(fer);
      });
    }
    else if (aviso) info.textContent = aviso;
  }
  outraData.querySelector("input").addEventListener("change", () => aoTrocarData());

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
    // plano 2000d · DC-326: a mesma pessoa já tem consulta por vir em OUTRO negócio (a colega marcou pelo outro atendimento)? avisa antes de confirmar
    if (!soEscolher) Promise.resolve(fichaP).then(() => {
      const cid = sel && sel.contato_id;
      if (cid == null) return null;
      return Promise.resolve(api.rpcC("nx_contato_ver", { p_id: cid })).then(r => {
        if (!sel || sel.contato_id !== cid) return;
        sel.outras = outrasConsultasDoContato(r && r.negocios, sel.id, Date.now());
        if (sel.outras.length) pintarEscolhido();
      });
    }).catch(() => { /* sem a ficha do contato: segue */ });
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
  let verTudoDe = "";                 // plano 2000d · DC-444
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
          ganhos.slice(0, 5).map(g => h("div", { class: "ag-ja-atendido" }, h("span", null, h("b", { class: "dado-pessoal" }, g.contato_nome || g.titulo || P.contato), g.titulo && g.titulo !== g.contato_nome ? h("small", null, ` · ${g.titulo}`) : null),
            h("button", { type: "button", class: "bt bt-sec bt-p ag-retorno-bt", on: { click: () => marcarRetorno(g) } }, "Marcar retorno")))));
      }
      // plano 2000d · GY-030: busca por telefone diz «com esse telefone» (não «com esse nome»)
      const comEsse = /^[\d\s()+.-]+$/.test(q) ? "com esse telefone" : "com esse nome";
      if (!itens.length) { resultados.appendChild(h("p", { class: "campo-ajuda" }, btNovo ? `${P.nenhuma} ${P.neg} ${P.aberta} ${comEsse}. Toque em «${P.novoContato}» para cadastrar.` : `${P.nenhuma} ${P.neg} ${P.aberta} ${comEsse}. Crie ou atualize pelo CRM.`)); return; }
      // plano 1500c · CC-197: o final do telefone separa homônimos («Maria Silva · final 4321»), quando a busca trouxer o número
      const finalTel = item => { const d = String(item.telefone || item.contato_telefone || "").replace(/\D/g, ""); return d.length >= 4 ? `final ${d.slice(-4)}` : null; };
      const opcao = (item, i) => h("button", { type: "button", class: "agenda-resultado", role: "option", id: `ag-res-${uid}-${i}`, tabindex: "-1", "aria-selected": "false", on: { click: () => escolher(item) } },
        h("b", { class: "dado-pessoal" }, item.titulo || item.contato_nome || "Negócio"),   // plano 1500c · UC-030
        // plano 1500c · GX-052: quem já tem consulta marcada aparece com ela («consulta sexta às 10:00») quando a busca trouxer consulta_em
        h("small", null, [item.contato_nome && item.contato_nome !== item.titulo ? item.contato_nome : null, finalTel(item), item.estagio_nome,
          item.consulta_em && Date.parse(item.consulta_em) > Date.now() ? `consulta ${rotuloProximaFora({ inicio: item.consulta_em }, Date.now(), hoje)}` : null].filter(Boolean).join(" · ")));
      // plano 1000b · CB-170: 8 à vista e «Ver mais» com o resto (as setas andam só nas que aparecem: achados = o que está na lista)
      // plano 2000d · DC-444: quem abriu «Ver mais» e continuou digitando (o termo só cresce) continua vendo tudo
      if (!(verTudoDe && q.toLowerCase().startsWith(verTudoDe))) verTudoDe = "";
      achados = verTudoDe ? itens.slice() : itens.slice(0, 8);
      achados.forEach((item, i) => resultados.appendChild(opcao(item, i)));
      if (itens.length > achados.length) {
        const verMais = h("button", { type: "button", class: "bt bt-fant bt-p agenda-res-mais", on: { click: () => {
          const ja = achados.length;
          verTudoDe = q.toLowerCase();     // plano 2000d · DC-444
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
    // plano 2000d · DC-364: o 1º Esc com texto limpa a busca e fecha a lista; o 2º fecha a janela
    if (ev.key === "Escape" && inputBusca.value) {
      ev.preventDefault(); if (ev.stopPropagation) ev.stopPropagation();
      inputBusca.value = ""; if (buscarDepois.cancelar) buscarDepois.cancelar();
      ui.limpar(resultados); ui.limpar(maisRes); inputBusca.setAttribute("aria-expanded", "false"); inputBusca.removeAttribute("aria-activedescendant");
      return;
    }
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
  // plano 1500c · GX-026: «Remarcar» só quando a consulta atual ainda vai acontecer (a que já passou é um retorno: «Marcar»)
  // plano 2000d · DC-293: os títulos com a palavra da vertical (Marcar visita, Remarcar entrega)
  const palJ = palavraCompromisso(ctx.vocab);
  const titulo = soEscolher ? `Escolher horário da ${palJ}` : encaixeAgora ? "Encaixar agora" : sel && sel.consultaAtual && Date.parse(sel.consultaAtual) > Date.now() ? `Remarcar ${palJ}` : `Marcar ${palJ}`;
  const rotuloConfirmar = soEscolher ? "Usar este horário" : `Confirmar ${palJ}`;   // plano 2000d · GY-025
  // plano 2000d · DC-395: horários lidos há mais de 2 min (a recepção atendeu o telefone com a janela aberta) são relidos ao voltar a eles
  const releituraVelha = () => { if (sel && lidoEm && Date.now() - lidoEm > HORARIOS_VELHOS_MS && horasEl.isConnected) { lidoEm = 0; carregarHorarios(); } };
  horasEl.addEventListener("focusin", releituraVelha);
  const aoVoltarAba = () => { if (!horasEl.isConnected) { document.removeEventListener("visibilitychange", aoVoltarAba); return; } if (!document.hidden) releituraVelha(); };
  if (typeof document !== "undefined" && document.addEventListener) document.addEventListener("visibilitychange", aoVoltarAba);
  const modal = ui.modal({
    titulo, corpo: formulario, largura: "m",
    descricao: soEscolher ? `Escolha o dia e o horário. A ${palJ} é gravada junto com ${P.a} ${P.neg}.` /* plano 2000d · GY-029 */ :"Escolha o dia e o horário. Se alguém pegar este horário antes de você confirmar, avisamos.",   // plano 2000d · DC-401
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
      { rotulo: rotuloConfirmar, tipo: "primario", fn: async m => {
        if (!sel) { m.erro(`Escolha ${P.uma} ${P.neg} ${P.aberta} para continuar.`); return false; }
        if (!slotSel) { m.erro("Escolha um dia e um horário livre."); return false; }
        if (fichaPendente) { m.erro(`Conferindo se já tem ${palJ} marcada… toque de novo em um instante.`); return false; }   // plano 1500c · CC-199; plano 2000d · GY-024
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
          // plano 2000d · GY-025: o nome do botão que está na tela («Confirmar visita», «Usar este horário»), não sempre «Confirmar consulta»
          m.erro(e && e.ambigua ? `Não foi possível confirmar se foi salvo. Toque em «${rotuloConfirmar}» de novo: é seguro, não marca duas vezes.`
            : encaixar ? "Esse horário acabou de lotar. Escolha outro ou marque «Encaixar mesmo assim»."
              : codigo === "horario_ocupado" ? `Esse horário acabou de ser ocupado${sufixoOcupadoPor(e, Date.now())}. Escolha outro (a lista foi atualizada).`   // plano 2000d · DC-325
                : codigo === "ja_agendada" ? `${P.esta} ${P.neg} já tem uma ${palJ} futura. Atualize a agenda antes de tentar novamente.`   // plano 2000d · GY-026
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
  // plano 2000d · GY-031: o aviso diz DE QUEM é («… · Maria») — com dois «Desfazer» seguidos a recepção sabe qual é qual;
  // GY-032: e que entrou como encaixe (passa da capacidade)
  const quemMarcou = primeiroNomeAgenda(sel.nome || sel.titulo);
  const foiEncaixe = !!(resultado.encaixe === true || (!encaixeEl.hidden && encaixeChk.checked));
  comDesfazer(ui, {
    texto: `${resultado.remarcada ? "Remarcada" : "Marcada"} para ${rotulo}${foiEncaixe ? " (encaixe)" : ""}${quemMarcou ? ` · ${quemMarcou}` : ""}`,
    // CA-176: «Avisar paciente» deixa a confirmação pronta na conversa (rascunho; nada sai sozinho)
    // plano 1000b · CB-123: o botão ESCREVE a confirmação (no campo da conversa, sem enviar) — o rótulo diz isso
    acao: typeof avisar === "function" ? { rotulo: rotuloAvisar("confirmacao", ctx.vocab), fn: () => avisar(consultaNova, "confirmacao") } : undefined,
    reverter: async () => {
      // remarcação volta ao horário (e ao serviço) anterior, como ENCAIXE (voltarAoHorario); consulta nova some
      if (anterior) { const av = avisoVoltaEncaixe(await voltarAoHorario(api, marcada.id, anterior, marcada.servicoAntes || servicoMarcado, encaixeAntes), palJ); if (av) ui.toast(av, { tipo: "info" }); }
      else erroResposta(await api.rpcC("nx_agenda_desmarcar", { p_negocio: marcada.id, p_motivo: "Desfeito logo depois de marcar" }));
      // marcar levou o cartão para «Agendada» (e desmarcar o leva para «Nova»): volta para a etapa em que estava
      if (resultado.etapa && !(await devolverEtapa(api, marcada.id, marcada.antes)))
        ui.toast(`A ${palJ} foi desfeita, mas o cartão não voltou para a etapa em que estava. Confira no CRM.`, { tipo: "info" });   // plano 2000d · GY-027
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
/** Plano 1500c · GX-056: os motivos de bloqueio mais comuns (chips na janela «Bloquear horário»). */
export const MOTIVOS_BLOQUEIO = Object.freeze(["Almoço", "Reunião", "Folga", "Manutenção", "Feriado"]);
/** CA-177: motivos padronizados de desmarcação (viram o começo do p_motivo; o detalhe livre continua opcional). */
export const MOTIVOS_DESMARCAR = Object.freeze(["Paciente cancelou", "Vai remarcar", "Erro de marcação", "Clínica cancelou"]);
/** Plano 1500c · CC-322: o chip que diz «não quero dizer o motivo» (vale como escolha; não vai para o p_motivo). */
/** Plano 2000d · DC-302: o aviso de quando não há como falar com a pessoa pela Agenda, nas palavras da vertical. */
export function textoSemCanal(tipo, vocab = null) {
  const P = palavrasAgenda(vocab), pal = palavraCompromisso(vocab);
  return `Esta ${pal} não tem ${tipo === "whatsapp" ? "telefone com WhatsApp" : "contato com conversa"}. ${P.abrirNeg === "Abrir negócio" ? "Abra o negócio" : `Abra ${P.a} ${P.neg}`} para falar com o ${P.contato}.`;
}
export const MOTIVO_SEM = "Sem motivo informado";   // plano 2000d · DC-297: quem escolhe é a recepção, não o paciente («Prefiro não dizer» soava na voz dele)
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
    h("span", null, `Essa ${palavraCompromisso(ctx.vocab)} já passou: para registrar falta use «Faltou».`),   // plano 2000d · GY-035
    typeof aoFaltou === "function" ? h("button", { type: "button", class: "bt bt-sec bt-p ag-desmarcar-faltou", on: { click: () => { if (fecharDesmarcar) fecharDesmarcar(null); aoFaltou(c); } } }, "Marcar «Faltou»") : null) : null;
  const r = await ui.modal({
    titulo: `Desmarcar ${palavraCompromisso(ctx.vocab)}`, largura: "p",   // plano 2000d · DC-293
    aoAbrir: avisoPassou ? a => { fecharDesmarcar = a && typeof a.fechar === "function" ? v => a.fechar(v) : null; } : undefined,
    // plano 1500c · GX-053: o serviço também (duas consultas da mesma pessoa no mesmo dia se distinguem)
    corpo: h("div", { class: "pilha" }, h("p", { class: "ag-desmarcar-quem" }, `${c.nome || c.titulo || `Esta ${palavraCompromisso(ctx.vocab)}`}${c.servico ? ` · ${c.servico}` : ""} · ${ui.dataHoraBR(c.inicio)}` /* plano 2000d · GY-036 */), avisoPassou,
      h("div", { class: "pilha-p" }, h("p", { class: "ag-motivos-rot" }, "Motivo"), chips), detalhe),
    acoes: [
      { rotulo: "Voltar", tipo: "neutro", valor: false },
      { rotulo: `Desmarcar ${palavraCompromisso(ctx.vocab)}`, tipo: "perigo", fn: async m => {
        const det = detalhe.querySelector("textarea").value;
        // plano 1500c · CC-322: um toque no motivo (ou «Prefiro não dizer») antes de desmarcar — o relatório de motivos nasce com dado
        if (!motivoSel && !String(det || "").trim()) {
          if (m && typeof m.erro === "function") m.erro(`Escolha um motivo (ou «${MOTIVO_SEM}»).`);   // plano 2000d · DC-297
          const b = botoesMotivo[0]; if (b) try { b.focus(); } catch { /* ok */ }
          return false;
        }
        return erroResposta(await api.rpcC("nx_agenda_desmarcar", { p_negocio: c.negocio_id, p_motivo: motivoDesmarcar(motivoSel, det, motivos) }));
      } },
    ],
  });
  if (!(r && r.ok)) return null;
  if (aoMudar) try { aoMudar(r); } catch (e) { console.error(e); }
  comDesfazer(ui, {
    // plano 1500c · GX-030: o aviso diz DE QUEM era (com dois «Desfazer» na tela, a pessoa sabe qual é qual)
    texto: `${c.nome || c.titulo ? `${c.nome || c.titulo} · ${palavraCompromisso(ctx.vocab)}` : maiuscula(palavraCompromisso(ctx.vocab))} de ${ui.dataHoraBR(c.inicio)} desmarcada`,   // plano 2000d · GY-037
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
      const avisoEncaixe = avisoVoltaEncaixe(volta, palavraCompromisso(ctx.vocab));   // plano 2000d · GY-010
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

/** Plano 2000d · DC-442: o último «Desfazer» da Agenda, para o Ctrl+Z (vale enquanto o aviso estaria na tela: 10 s, e uma vez só).
    Toda ação com Desfazer da tela passa por comDesfazer(ui, o) — o reverter vira «uma vez» (o toast e o Ctrl+Z não desfazem duas vezes). */
let desfazerAtual = null;
export const DESFAZER_MS = 10_000;
export function comDesfazer(ui, o) {
  if (!o || typeof o !== "object") return ui.acaoComDesfazer(o);
  let feito = false;
  const rev = o.reverter, firmar = o.firmar;
  const reg = { texto: o.texto || "", ate: Date.now() + DESFAZER_MS,
    reverter: async (...a) => { if (feito) return undefined; feito = true; if (desfazerAtual === reg) desfazerAtual = null; return typeof rev === "function" ? rev(...a) : undefined; } };
  desfazerAtual = reg;
  return ui.acaoComDesfazer({ ...o, reverter: reg.reverter,
    ...(typeof firmar === "function" ? { firmar: async (...a) => { feito = true; if (desfazerAtual === reg) desfazerAtual = null; return firmar(...a); } } : {}) });
}
/** DC-442: o Desfazer que o Ctrl+Z ainda pode chamar (null fora do prazo ou já usado). */
export function desfazerValido(agora = Date.now()) { return desfazerAtual && desfazerAtual.ate > agora ? desfazerAtual : null; }
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
  // plano 1500c · RC-198/RC-203/RC-341: #/agenda?dia=AAAA-MM-DD&hora=HH:MM (as barras e os «+N depois» do Início) abre NESSE dia e rola até a hora;
  // no Mês do computador, abre o Dia (o pedido é um dia)
  const pedidoRota = (ctx.rota && ctx.rota.query) || {};
  const horaPedida = /^([01]\d|2[0-3]):[0-5]\d$/.test(String(pedidoRota.hora || "")) ? String(pedidoRota.hora) : null;
  if (dataAgendaValida(pedidoRota.dia)) { data = pedidoRota.dia; if (modo === "mes" && !mq.matches) modo = "dia"; }
  let agrupar = preferencias.agrupar;      // dia com 2+ responsáveis: uma coluna por pessoa
  let corPor = preferencias.cor;           // cor dos blocos: por serviço ou por profissional (item 39)
  let extras = normalizarExtrasAgenda({});
  let profEscolhido = false;               // plano 1500c · CC-268: a pessoa já escolheu um filtro de profissional alguma vez?
  try { const bruto = JSON.parse(localStorage.getItem(chavePreferencias) || "{}"); extras = normalizarExtrasAgenda(bruto); profEscolhido = !!(bruto && typeof bruto.prof === "string"); } catch { /* padrão */ }
  let filtroProf = extras.prof;            // CA-187: «todos», «eu» ou o id de um profissional
  let mostrarFechados = extras.fechados === "mostrar";   // CA-186
  let roteiroDispensado = extras.roteiro === "dispensado";   // plano 2000d · DC-399
  let focoMesPendente = "";                                 // plano 2000d · DC-363
  let tiqueBase = null, tiqueChave = "", tiqueAte = 0;       // plano 2000d · DC-360
  // plano 2000d · DC-410: o aviso 10 min antes (preferência + permissão do navegador); cada consulta avisa uma vez
  let aviso10 = extras.aviso10 === "ligado";
  const avisadas = new Set();
  const podeAvisar = () => typeof globalThis.Notification === "function";
  async function alternarAviso10() {
    if (aviso10) { aviso10 = false; gravarPreferencias(); desenhar(); anunciar("Avisos desligados.", { repetir: true }); return; }
    let perm = globalThis.Notification.permission;
    if (perm === "default" && typeof globalThis.Notification.requestPermission === "function") { try { perm = await globalThis.Notification.requestPermission(); } catch { perm = "denied"; } }
    if (perm !== "granted") { ui.toast("O navegador não deixou mostrar avisos. Libere as notificações deste site para usar.", { tipo: "info" }); return; }
    aviso10 = true; gravarPreferencias(); desenhar(); ui.toast(`Pronto: você recebe um aviso 10 min antes das suas ${palavraCompromisso(ctx.vocab)}s enquanto a Agenda estiver aberta.`, { tipo: "ok" });   // plano 2000d · GY-040
  }
  function conferirAviso10(agora) {
    if (!aviso10 || !podeAvisar() || globalThis.Notification.permission !== "granted" || !atual || !Array.isArray(atual.consultas) || !eu) return;
    for (const c of consultasParaAvisar(atual.consultas, eu, agora)) {
      const k = chaveConsulta(c);
      if (avisadas.has(k)) continue;
      avisadas.add(k);
      const p = partesSP(c.inicio);
      try { new globalThis.Notification(`${maiuscula(palavraCompromisso(ctx.vocab))} às ${p ? horaTxt(p.min) : ""}`, { body: [primeiroNomeAgenda(c.nome || c.titulo) || c.nome || c.titulo, c.servico].filter(Boolean).join(" · "), tag: `agenda-${k}` }); } catch { /* o navegador recusou: segue */ }
    }
  }
  let listaDiaAberta = extras.lista === "aberta" ? true : extras.lista === "fechada" ? false : null;   // plano 2000d · DC-405
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
  let timerFiltro = null;                  // plano 2000d · DC-359
  let visiveisAtuais = [];                 // plano 1500c · GX-016: as consultas que a tela mostra (a conta do filtro)
  let semConfirmar = false;                // plano 1500c · CC-240: o servidor ainda não tem nx_agenda_confirmar
  let redesenhoPendente = false;           // plano 1500c · CC-249: o tique com a aba escondida deixa o redesenho para a volta
  let chavesNovas = new Set();             // plano 2000d · DC-323: as consultas que a releitura acabou de trazer (brilho de 3 s)
  // plano 2000d · DC-358: a ocupação do dia é calculada uma vez por dia e por desenho (faixa, cabeçalho da coluna); o desenho limpa
  const ocupMemo = new Map();
  const ocupacaoMemo = (consultas, iso, config, bloqueios, op = {}) => {
    const k = `${iso}|${Array.isArray(op && op.ocupados) ? "o" : "c"}`;
    if (!ocupMemo.has(k)) ocupMemo.set(k, ocupacaoDoDia(consultas, iso, config, bloqueios, op));
    return ocupMemo.get(k);
  };
  let soAnuncio = false;                   // plano 2000d · DC-334: «N vieram de anúncio» tocado destaca só elas
  // plano 2000d · GY-062/GY-063 (pendência DC-376/DC-450 da frente clássico): a semana de exemplo (web/demo.js) — {chave, dados, antes}; nada grava
  let exemplo = null;
  const avisarExemplo = () => ui.toast("Semana de exemplo: ninguém aqui é real e nada é gravado. Toque em «Sair do exemplo» para usar a agenda de verdade.", { tipo: "info" });
  async function verSemanaExemplo() {
    if (!vivo || exemplo) return;
    let s;
    try { s = (await import(`../demo.js?v=${encodeURIComponent(ctx.versao)}`)).semanaDeExemplo(segundaDe(ui.hojeSP())); }
    catch (e) { console.error(e); ui.toast("Não foi possível abrir a semana de exemplo.", { tipo: "erro" }); return; }
    if (!vivo || !s || !Array.isArray(s.consultas)) return;
    const cfgReal = (atual && atual.config) || {};
    const antes = { data, modo };
    data = s.dias[0];
    if (modo !== "semana" && !movel) modo = "semana";
    exemplo = { chave: `${segundaDe(data)}|7`, antes, dados: { consultas: s.consultas, bloqueios: [], desmarcadas: [], config: { ...cfgReal, capacidade: Math.max(Number(cfgReal.capacidade) || 1, (s.profissionais || []).length || 1) } } };
    await carregar();
    anunciar("Semana de exemplo aberta: ninguém aqui é real e nada é gravado.", { repetir: true });
  }
  function sairDoExemplo() {
    if (!exemplo) return;
    const antes = exemplo.antes;
    exemplo = null; atual = null; chaveAtual = ""; assinaturaAtual = "";
    if (antes) { data = antes.data; modo = antes.modo; }
    gravarPreferencias();
    carregar({ forcar: true });
    anunciar("Saiu da semana de exemplo.", { repetir: true });
  }
  /* plano 1500c · CC-226: «lembrado» fica marcado neste aparelho até o dia seguinte (sem conteúdo da consulta: só negocio|inicio) */
  const chaveLembrados = chavePreferencias ? `${chavePreferencias}:lembrados` : null;
  // plano 2000d · DC-322: cada item guarda QUANDO e QUEM preparou ({em, por}); a lista antiga (só as chaves) continua sendo lida
  const lembrados = (() => { try { const v = JSON.parse(localStorage.getItem(chaveLembrados) || "{}"); if (!(v && v.dia === hojeInicial && Array.isArray(v.itens))) return new Map();
    return new Map(v.itens.map(x => (Array.isArray(x) ? [String(x[0]), x[1] && typeof x[1] === "object" ? x[1] : { em: null }] : [String(x), { em: null }]))); } catch { return new Map(); } })();
  const meuNome = () => (ctx.sessao && ctx.sessao.conta && typeof ctx.sessao.conta.nome === "string" ? ctx.sessao.conta.nome.trim().split(/\s+/)[0] : "");
  const marcarLembrado = c => { lembrados.set(`${c.negocio_id}|${c.inicio}`, { em: Date.now(), por: meuNome() || null }); try { if (chaveLembrados) localStorage.setItem(chaveLembrados, JSON.stringify({ dia: ui.hojeSP(), itens: [...lembrados.entries()].slice(-200) })); } catch { /* ok */ } };
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
    anunciar(textoAnuncioPeriodo({ modo: !movel && modo === "mes" ? "mes" : modo, de: iv.de, dias: iv.dias, n, palavra: palavraCompromisso(ctx.vocab) }), { repetir });   // plano 2000d · GY-001
  }

  function gravarPreferencias() {
    try { localStorage.setItem(chavePreferencias, JSON.stringify({ data, modo, agrupar, cor: corPor, em: ui.hojeSP(), prof: filtroProf, fechados: mostrarFechados ? "mostrar" : "ocultar", atalhos: atalhosLigados ? "ligados" : "desligados", roteiro: roteiroDispensado ? "dispensado" : "mostrar", ...(aviso10 ? { aviso10: "ligado" } : {}), ...(listaDiaAberta === null ? {} : { lista: listaDiaAberta ? "aberta" : "fechada" }) })); } catch { /* preferências não bloqueiam a Agenda; plano 2000d · DC-399: roteiro */ }
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
    ctl.hoje = h("button", { type: "button", class: "bt bt-sec bt-p agenda-hoje", "aria-keyshortcuts": "T", on: { click: () => irParaHoje() } }, "Hoje");
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
      if (sem) { ctl.marcar.setAttribute("title", "Sem internet: marcar exige conexão"); ctl.marcar.setAttribute("aria-label", `Marcar ${palavraCompromisso(ctx.vocab)} (sem internet: marcar exige conexão)`); }   // plano 2000d · GY-039
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

  /** Plano 1500c · GX-047: «Hoje» (botão ou T) já vendo hoje não fica mudo — diz que já está em hoje e leva a vista até agora. */
  function irParaHoje() {
    const hojeAgora = ui.hojeSP(), iv = intervalo();
    const ja = !!atual && (movel && modo !== "lista" ? data === hojeAgora : periodoTemHoje(iv.de, iv.dias, hojeAgora));
    data = hojeAgora; gravarPreferencias();
    if (!ja) { carregar(); return; }
    anunciar("Você já está vendo hoje.", { repetir: true });
    if (movel) { diaFocado = ""; focarNoDia(); }
    else { agoraFocado = ""; focarAgoraDesktop(`${iv.de}|${iv.dias}|${modo}`); }
    carregar();     // mesmo período: só redesenha (o seletor de data e o «Dia» acompanham)
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
        hoje: ui.hojeSP(), selecionado: data, num: ui.num, carregando: !d, compacto: true, palavra: palavraCompromisso(ctx.vocab),   // plano 2000d · GY-006
        aoEscolher: iso => { if (fecharCom) fecharCom(iso); }, aoMudarMes: (delta, foco) => { mes = foco ? primeiroDoMes(foco) : mesISO(mes, delta); Promise.resolve(pintar()).then(() => { const b = foco ? caixa.querySelector(`.ag-mes-dia[data-iso="${foco}"]`) : null; if (b) try { b.focus(); } catch { /* ok */ } }); } }));   // plano 2000d · DC-363
      // plano 1500c · GX-050: longe do mês de hoje (foi ver dezembro), um toque volta — antes eram as setas mês a mês
      const mesHoje = primeiroDoMes(ui.hojeSP());
      if (meu !== mesHoje) caixa.appendChild(h("button", { type: "button", class: "bt bt-sec bt-p ag-mes-este", on: { click: () => { mes = mesHoje; pintar(); } } }, "Voltar a este mês"));
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
    // plano 2000d · DC-442: Ctrl/⌘+Z fora dos campos desfaz a última ação da Agenda (marcar, remarcar, desmarcar, presença, bloqueio)
    if ((ev.ctrlKey || ev.metaKey) && !ev.shiftKey && !ev.altKey && String(ev.key).toLowerCase() === "z") {
      const alvoZ = ev.target;
      if (alvoZ && (alvoZ.isContentEditable || /^(INPUT|TEXTAREA|SELECT)$/.test(alvoZ.tagName))) return;
      // plano 2000d · GY-038: com uma janela aberta por cima (outra ação em andamento), o Ctrl+Z não desfaz o que está por trás dela
      if ((alvoZ && alvoZ.closest && alvoZ.closest('[role="dialog"],dialog')) || (document.querySelector && document.querySelector("dialog[open]"))) return;
      const d = desfazerValido();
      if (!d) return;
      ev.preventDefault();
      Promise.resolve(d.reverter()).then(() => anunciar(`Desfeito${d.texto ? `: ${d.texto}` : ""}.`, { repetir: true })).catch(e => ui.toast(api.mensagemErro(e), { tipo: "erro" }));
      return;
    }
    if (!atalhosLigados) return;      // plano 1000b · CB-151 (WCAG 2.1.4): leitor de tela em modo navegação e comando de voz não trocam a tela sem querer
    const alvo = ev.target;
    const editando = alvo && (alvo.isContentEditable || /^(INPUT|TEXTAREA|SELECT)$/.test(alvo.tagName) || alvo.closest?.('[role="dialog"],dialog'));
    if (editando || document.querySelector("dialog[open]")) return;
    const acao = acaoTeclaAgenda(ev);
    if (!acao) return;
    ev.preventDefault();
    if (acao === "hoje") irParaHoje();   // plano 1500c · GX-047
    else if (acao === "marcar") { if (ctx.pode("atendente") && !ev.repeat) abrirAgendamento(null, { dia: movel || modo === "dia" ? data : null }); }   // plano 1500c · CC-300 (GX-019: tecla segurada não repete)
    else if (acao === "filtrar") {   // plano 1500c · GX-018
      const f = conteudo.querySelector(".agenda-filtro-nome");
      if (f) { try { f.focus(); } catch { /* ok */ } if (typeof f.select === "function") try { f.select(); } catch { /* ok */ } }
      else anunciar("Nada para filtrar nesta tela.", { repetir: true });
    }
    else if (acao === "atualizar") { if (!ev.repeat) atualizarAgora(); }       // plano 2000d · DC-362
    else if (acao === "procurar") { if (!ev.repeat) procurarPaciente(); }
    else if (acao === "anterior" || acao === "proximo") mover(acao === "anterior" ? -1 : 1);
    else trocarModo(acao);       // CA-259: D/S/M/L
  }
  document.addEventListener("keydown", aoTeclaAgenda);

  async function carregar({ silencioso = false, forcar = false, auto = false } = {}) {
    const iv = intervalo();
    const chave = `${iv.de}|${iv.dias}`;
    montarCabecalho();
    // plano 2000d · GY-062: na semana de exemplo nada vai ao servidor; sair da semana (setas, data) sai do exemplo
    if (exemplo) {
      if (chave === exemplo.chave) { atual = exemplo.dados; chaveAtual = chave; desenhar(); return true; }
      exemplo = null; atual = null; chaveAtual = ""; assinaturaAtual = "";
    }
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
    // plano 2000d · DC-320: durante a releitura silenciosa a grade fica com aria-busy (o leitor não lê a metade antiga)
    if (silencioso && atual) conteudo.setAttribute("aria-busy", "true");
    try {
      let doCache = false;
      const antes = silencioso && atual && chaveAtual === chave ? atual : null;   // CA-167: a releitura automática só redesenha se algo mudou («Atualizar» sempre refaz)
      const r = await api.rpcC("nx_agenda_dia", { p_data: iv.de, p_dias: iv.dias }, { cache: true, aoCache: (dc, em) => {
        // M16/M30: a 1ª pintura é a última agenda guardada para este período; a rede atualiza em seguida
        if (!vivo || minha !== sequencia || atual || !dc || typeof dc !== "object") return;
        atual = dc; chaveAtual = chave; doCache = !!Lg;      // desenhado sem a crm-logica (sem presença): a rede redesenha mesmo igual
        assinaturaAtual = assinaturaAgenda(dc);             // plano 1500c · CC-248
        // plano 2000d · DC-353: a cópia guardada diz que é cópia até a rede responder (em 3G a recepção marcava em cima da grade velha)
        mensagemAtualizacao = textoCopiaGuardada(em); montarCabecalho();
        desenhar();
      } });
      if (!vivo || minha !== sequencia) return false;
      await lgPronto;                                                          // a presença (E1) precisa da crm-logica: já veio em paralelo
      if (!vivo || minha !== sequencia) return false;
      // plano 1500c · CC-248: compara uma assinatura barata (chaves que mudam a tela, num hash) em vez de serializar as duas respostas inteiras
      const assNova = assinaturaAgenda(r);
      const igual = (doCache || (auto && antes && antes === atual)) && assinaturaAtual === assNova;     // nada mudou desde o guardado (ou desde a última leitura): não refaz a grade
      // plano 2000d · DC-323/DC-411: o que outra pessoa (ou a IA) marcou desde a última leitura ganha destaque e é anunciado
      const novas = antes && antes === atual && !igual && r ? novasConsultas(antes.consultas, filtrarPorProfissional(Array.isArray(r.consultas) ? r.consultas : [], filtroProf, eu)) : [];
      chavesNovas = new Set(novas.map(c => `${c.negocio_id}|${c.inicio}`));
      atual = r || { consultas: [], bloqueios: [] };
      assinaturaAtual = assNova;
      chaveAtual = chave;
      falhasReleitura = 0;     // plano 2000d · DC-354
      // plano 1500c · CC-268: na 1ª vez, quem atende (não admin) e tem consultas próprias abre na «Minha agenda»
      if (!profEscolhido && eu && !ctx.pode("admin") && filtroProf === "todos" && Array.isArray(atual.consultas) && atual.consultas.some(c => c && String(c.dono_id ?? "") === eu)) {
        profEscolhido = true; filtroProf = "eu"; gravarPreferencias();
      }
      // leitura certa: o aviso de agenda guardada/sem conexão não pode ficar preso
      if (mensagemAtualizacao && !mensagemAtualizacao.startsWith("Atualizada às")) { mensagemAtualizacao = ""; montarCabecalho(); }
      if (!igual) desenhar();
      conteudo.removeAttribute("aria-busy");
      ultimaLeitura = Date.now();
      pintarCarimbo();
      if (!auto) anunciarPeriodo();     // CA-161: a frase curta do período (só quando muda o período; «Atualizar» repete por conta própria)
      if (novas.length) avisarNovas(novas);
      return true;
    } catch (e) {
      conteudo.removeAttribute("aria-busy");
      if (!vivo || minha !== sequencia) return false;
      if (silencioso && atual && chaveAtual === chave) {
        // «sem conexão» só com evidência de rede: comCache vem em QUALQUER erro quando havia cópia guardada (até HTTP 400)
        const semRede = offline();   // plano 1000b · CB-166
        mensagemAtualizacao = semRede ? "Sem conexão · mostrando a última agenda guardada." : "Não foi possível atualizar · a agenda exibida foi mantida.";
        montarCabecalho();
        if (auto) agendarNovaTentativa();     // plano 2000d · DC-354: tenta de novo em 5 s, 15 s e 30 s (não espera o próximo minuto)
        return false;
      }
      if (e && e.comCache) {   // plano 2000d · DC-353: a rede falhou depois da cópia — o aviso deixa de dizer «atualizando…»
        if (atual && chaveAtual === chave) { mensagemAtualizacao = offline() ? "Sem conexão · mostrando a última agenda guardada." : "Não foi possível atualizar · mostrando a última agenda guardada."; montarCabecalho(); agendarNovaTentativa(); }
        return false;
      }
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

  /** Plano 2000d · DC-381: «Clínica Sorriso · Agenda de Dra. Helena · impresso 24/10 08:02» (o cabeçalho da folha impressa). */
  function cabecalhoImpressao() {
    const empresa = ctx.cliente && typeof ctx.cliente.nome === "string" ? ctx.cliente.nome.trim() : "";
    const de = filtroProf === "todos" ? "" : filtroProf === "eu" ? "Minha agenda" : filtroProf === "sem" ? "Sem responsável" : `Agenda de ${nomesAtuais[filtroProf] || "profissional"}`;
    const p = partesSP(new Date());
    const quando = p ? `impresso ${p.dia.slice(8, 10)}/${p.dia.slice(5, 7)} ${horaTxt(p.min)}` : "";
    return [empresa, de, quando].filter(Boolean).join(" · ");
  }
  /** Plano 2000d · DC-354: a releitura falhou — nova tentativa com recuo (5 s, 15 s, 30 s; depois o tique de 60 s segue); a volta da rede
      (aoMudarConexao) também relê. */
  let falhasReleitura = 0, timerTentativa = null;
  function agendarNovaTentativa() {
    if (!vivo || timerTentativa) return;
    const espera = [5_000, 15_000, 30_000][falhasReleitura];
    if (espera === undefined) return;
    falhasReleitura++;
    timerTentativa = setTimeout(() => { timerTentativa = null; if (vivo && atual && !arrasto && !janelaAberta()) carregar({ silencioso: true, forcar: true, auto: true }); }, espera);
  }
  /** Plano 2000d · DC-323/DC-411: as consultas novas brilham 3 s (sem animação com reduced-motion, no CSS) e são anunciadas; a da IA vira
      um aviso «A IA marcou: 15:00 Maria (Avaliação)» com «Ver». */
  function avisarNovas(novas) {
    const pal = palavraCompromisso(ctx.vocab);
    anunciar(textoNovasConsultas(novas, pal), { repetir: true });
    const daIA = novas.filter(c => c.marcado_por === "ia");
    if (daIA.length) {
      const c = daIA[0], p = partesSP(c.inicio);
      ui.toast(`A IA marcou: ${p ? `${rotuloDoDia(p.dia, ui.hojeSP()) === "Hoje" ? "" : `${rotuloDoDia(p.dia, ui.hojeSP())} `}${horaTxt(p.min)} ` : ""}${c.nome || c.titulo || ""}${c.servico ? ` (${c.servico})` : ""}${daIA.length > 1 ? ` e mais ${daIA.length - 1}` : ""}`,
        { tipo: "info", acao: { rotulo: "Ver", fn: () => irParaConsulta(c) } });
    }
    setTimeout(() => { chavesNovas = new Set(); for (const el of conteudo.querySelectorAll(".ag-item.ag-novo")) el.classList.remove("ag-novo"); }, 3000);
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
  /** Plano 2000d · DC-357: aplica o destaque da legenda nos blocos e chips que já estão na tela (sem refazer a grade). false = precisa redesenhar. */
  function aplicarLegendaNaTela(itens) {
    if ((itens || []).some(it => Array.isArray(it.chaves) && it.chaves.length > 1)) return false;
    const chips = conteudo.querySelectorAll(".ag-leg-chip[data-chave]");
    if (!chips.length) return false;
    for (const ch of chips) { const on = legendaAtivos.has(ch.dataset.chave); ch.classList.toggle("ativo", on); ch.setAttribute("aria-pressed", String(on)); }
    for (const li of conteudo.querySelectorAll(".ag-item[data-chave]"))
      li.classList.toggle("apagado", (legendaAtivos.size > 0 && !legendaAtivos.has(li.dataset.chave)) || (soAnuncio && li.dataset.anuncio !== "1"));
    return true;
  }
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
    // plano 2000d · DC-308: «Lembrar», «Conversa» e «Ligar» da linha, o «Livre» da Lista e o dia do Mês também voltam ao lugar depois do redesenho
    for (const c of ["ag-li-lembrar", "ag-li-conversa", "ag-li-ligar"]) if (cl(c) && neg) return `[data-negocio="${v(neg.dataset.negocio)}"] .${c}`;
    if (cl("ag-mes-dia") && el.dataset.iso) return `.ag-mes-dia[data-iso="${v(el.dataset.iso)}"]`;
    if ((cl("ag-lista-livre") || cl("ag-lista-marcar") || cl("ag-livre")) && el.closest) {
      const dia = el.closest("[data-iso]");
      const c = cl("ag-lista-livre") ? "ag-lista-livre" : cl("ag-lista-marcar") ? "ag-lista-marcar" : "ag-livre";
      return dia && dia.dataset.iso ? `[data-iso="${v(dia.dataset.iso)}"] .${c}` : `.${c}`;
    }
    // plano 1500c · GX-043/GX-044: o «Filtrar nesta tela» (digitando) e as ferramentas do resumo também guardam o foco no redesenho
    for (const c of ["ag-fechados-bt", "agenda-filtro-prof", "ag-pres-lote", "ag-painel-imprimir", "agenda-proxima", "agenda-filtro-nome", "agenda-exportar", "agenda-imprimir-semana",
      "agenda-tv", "agenda-encaixar-agora", "agenda-prox-livre", "ag-painel-compartilhar", "agenda-marcar-vazio"]) if (cl(c)) return `.${c}`;
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
    // plano 1500c · GX-043: o cursor do campo de filtro volta para o fim do que já foi digitado
    if (alvo && foco === ".agenda-filtro-nome" && typeof alvo.setSelectionRange === "function") try { const n = String(alvo.value || "").length; alvo.setSelectionRange(n, n); } catch { /* ok */ }
  }
  function desenharAgora() {
    ui.limpar(conteudo);
    seqBloco = 0;
    // plano 2000d · GY-063: a faixa que diz que é exemplo (e a saída), sempre no topo enquanto ele está na tela
    if (exemplo) conteudo.appendChild(h("div", { class: "aviso aviso-info ag-exemplo-aviso", role: "status" }, ui.icone("info"),
      h("span", null, "Semana de exemplo: ninguém aqui é real e nada é gravado."),
      h("button", { type: "button", class: "bt bt-sec bt-p ag-exemplo-sair", on: { click: sairDoExemplo } }, "Sair do exemplo")));
    // linhas de servidor antigo (sem `presenca`): vale o que já foi lido da ficha (E1)
    const todas = (Array.isArray(atual.consultas) ? atual.consultas : []).map(comPresencaLida);
    const hoje = ui.hojeSP();
    ultimoHojeTela = hoje;            // plano 1500c · CC-168
    const pal = palavraCompromisso(ctx.vocab), palC = pal.charAt(0).toUpperCase() + pal.slice(1);   // plano 2000d · DC-293
    ocupMemo.clear();                 // plano 2000d · DC-358
    // plano 1500c · CC-330: filtro guardado com alguém que saiu da equipe (e sem consulta no período) volta para «todos», com aviso
    if (filtroProf !== "todos" && filtroProf !== "eu" && filtroProf !== "sem") {
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
    const nota = h("p", { class: "agenda-fuso" }, "Horários de Brasília.");   // plano 1500c · CC-049 (pendência da frente conv): sem «horário» duas vezes
    proximaAtual = proximaConsulta(consultas);
    // plano 1500c · CC-306: empresa nova (horário padrão e nenhuma consulta) — o admin ganha o roteiro de 3 passos
    const roteiro = ctx.pode("admin") && fonte === "padrao" && !todas.length && !roteiroDispensado ? montarRoteiro() : null;   // plano 2000d · DC-399
    // plano 2000d · DC-398: mais profissionais atendendo do que atendimentos por horário — a agenda «lota» com gente livre; o admin fica sabendo
    const avisoCap = ctx.pode("admin") ? avisoCapacidade(ordemProfAtual.filter(x => x !== "sem").length, config && config.capacidade) : null;

    // mês (desktop): mini-calendário com densidade no lugar da grade; tocar um dia abre o dia
    if (!movel && modo === "mes") {
      eixoAtual = null;
      conteudo.append(...[roteiro, montarMiniCalendario({ h, mes: primeiroDoMes(data), consultas, bloqueios, config, hoje, selecionado: data, num: ui.num, ocupacao: opOcup, palavra: pal,   // plano 2000d · GY-006
        aoEscolher: iso => { data = iso; modo = "dia"; gravarPreferencias(); carregar(); }, aoMudarMes: (delta, foco) => { if (foco) { focoMesPendente = foco; data = foco; gravarPreferencias(); carregar(); } else mover(delta); },   // plano 2000d · DC-363
        aoAbrirSemana: iso => { data = iso; modo = "semana"; gravarPreferencias(); carregar(); } }), nota].filter(Boolean));     // CA-270
      return;
    }

    const eixo = eixoDaGrade({ dias: carregados, consultas, config, bloqueios });   // plano 2000d · DC-392
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
    visiveisAtuais = visiveis;              // plano 1500c · GX-016: a base da conta do filtro
    const nDentro = visiveis.length;
    const nBloq = bloqueios.filter(b => mostrados.some(d => bloqueiosDoDia([b], d).length)).length;
    const temResponsaveis = todas.some(c => c.dono_id);
    const temSalas = todas.some(c => c && c.sala_id != null);   // plano 2000d · DC-347
    if (corPor === "sala" && !temSalas) corPor = "servico";
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
      // plano 2000d · DC-448: TODOS os donos desconhecidos do desenho entram de uma vez — uma leitura só (antes, uma por id, em sequência)
      const novos = [...new Set(todas.filter(c => c && c.dono_id != null && !(typeof c.dono_nome === "string" && c.dono_nome.trim()) && !Object.hasOwn(nomesDonos, String(c.dono_id)) && !idsRelidos.has(String(c.dono_id))).map(c => String(c.dono_id)))];
      if (novos.length) { for (const id of novos) idsRelidos.add(id); releNomes(); }
    }
    const ocup = ocupacaoDoPeriodo(visiveis, mostrados, config, bloqueios, opOcup);
    // CA-187: «Profissional» — todos, a minha agenda ou a de cada um (lembrado nas preferências)
    let filtroEl = null;
    if (temResponsaveis || filtroProf !== "todos") {
      // plano 1500c · CC-191: as opções vêm da equipe (quem atende) e de quem tem consulta — o dentista com a semana vazia também aparece
      const ids = [...new Set([...todas.map(c => c.dono_id).filter(x => x != null).map(String), ...(equipe || []).map(u => u.id)])];
      if (filtroProf !== "todos" && filtroProf !== "eu" && filtroProf !== "sem" && !ids.includes(filtroProf)) ids.push(filtroProf);
      const nomeDe = id => nomesAtuais[id] || "Profissional";
      // plano 1500c · GX-014: «Sem responsável» acha as consultas que ninguém assumiu (para distribuir), quando houver alguma
      const temSemDono = todas.some(c => c && (c.dono_id === null || c.dono_id === undefined || c.dono_id === ""));
      const opcoes = [["todos", "Todos os profissionais"], eu ? ["eu", "Minha agenda"] : null,
        ...ids.filter(id => id !== eu).sort((a, b) => nomeDe(a).localeCompare(nomeDe(b), "pt-BR")).map(id => [id, nomeDe(id)]),
        temSemDono || filtroProf === "sem" ? ["sem", "Sem responsável"] : null].filter(Boolean);
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
      // plano 2000d · DC-365: Shift+Enter (ou Shift+clique) vai até a consulta e já abre o detalhe
      ? h("button", { type: "button", class: "agenda-proxima", title: "Shift+Enter abre o detalhe", on: { click: ev => { irParaConsulta(proxima); if (ev && ev.shiftKey) abrirDetalheDaTela(proxima); },
        keydown: ev => { if (ev.key === "Enter" && ev.shiftKey) { ev.preventDefault(); irParaConsulta(proxima); abrirDetalheDaTela(proxima); } } } },
        h("span", { class: "agenda-proxima-rot" }, "Próxima"), h("b", { class: "dado-pessoal" }, proxima.nome || proxima.titulo || palC), h("span", { class: "dado agenda-proxima-quando" }, rotuloProxima(proxima, Date.now(), hoje)))
      : h("span", { class: "agenda-proxima agenda-proxima-vazia narr" }, consultas.length   // plano 2000d · DC-293: a palavra da vertical
        ? `Nenhuma ${pal} por vir ${umDia ? "neste dia" : emLista ? "nestes 7 dias" : "nesta semana"}.`
        : `${umDia ? "Dia livre" : emLista ? "7 dias livres" : "Semana livre"} — nenhuma ${pal} marcada.`);
    const caixaProxima = h("span", { class: "agenda-proxima-caixa" }, chipProxima);
    // CA-262: período sem nenhuma consulta oferece marcar ali mesmo (o celular já tem «Livre · Marcar» no dia)
    const marcarVazio = !nDentro && !movel && !emLista && ctx.pode("atendente") && diaISO(iv.de, iv.dias - 1) >= hoje   // plano 1500c · GX-039: período todo no passado não oferece marcar
      ? h("button", { type: "button", class: "bt bt-sec bt-p agenda-marcar-vazio", on: { click: () => abrirAgendamento(null, { dia: modo === "dia" ? data : null }) } }, ui.icone("mais"), `Marcar ${palavraCompromisso(ctx.vocab)}`)
      : null;
    if (!proxima && !exemplo) completarProxima(caixaProxima, { de: inicioBuscaProxima(iv.de, iv.dias, hoje), umDia, hoje, chave: chaveAtual });
    const temHoje = periodoTemHoje(iv.de, iv.dias, hoje) || (movel && data === hoje);
    // plano 1500c · CC-252: «Próximo livre: hoje 15:30» à vista (com o paciente no telefone), que abre a marcação nele
    const caixaLivre = temHoje && ctx.pode("atendente") && !exemplo ? h("span", { class: "agenda-prox-livre-caixa" }) : null;
    if (caixaLivre) completarProximoLivre(caixaLivre, hoje);
    // plano 1500c · CC-253: quem chegou sem hora — supervisor+ encaixa no horário de agora
    // plano 2000d · DC-343: quem da equipe está livre agora (sem consulta cruzando este minuto) vai no nome e na dica do botão
    const livresAgora = temHoje && ctx.pode("supervisor") ? profissionaisLivresAgora(equipe, todas, Date.now(), Number(config.duracao_min) || 30) : [];
    const txtLivres = livresAgora.length ? `Livres agora: ${livresAgora.slice(0, 3).map(u => u.nome).join(", ")}${livresAgora.length > 3 ? ` e mais ${livresAgora.length - 3}` : ""}` : "";
    const encaixarAgoraBt = temHoje && ctx.pode("supervisor")
      ? h("span", { class: "agenda-encaixar-caixa" }, h("button", { type: "button", class: "bt bt-fant bt-p agenda-encaixar-agora", title: txtLivres || null, on: { click: () => abrirAgendamento(null, { dia: hoje, encaixeAgora: true }) } }, ui.icone("relogio"), "Encaixar agora"),
        txtLivres ? h("small", { class: "agenda-livres-agora" }, txtLivres) : null) : null;
    // plano 1500c · CC-256: a taxa de faltas das consultas já passadas do período; CC-324: quantas a IA marcou
    const tf = taxaFaltas(visiveis);
    const nIA = visiveis.filter(c => c && c.marcado_por === "ia").length;
    const nAnuncio = visiveis.filter(veioDeAnuncio).length;   // plano 2000d · DC-334
    // plano 1500c · CC-258/CC-260/CC-266/CC-323: exportar, imprimir a semana, filtrar por nome e a tela da recepção (desktop)
    const ferramentas = h("div", { class: "agenda-ferramentas" },
      visiveis.length ? h("label", { class: "agenda-filtro-nome-rot" }, h("span", { class: "sr-only" }, "Filtrar nesta tela"),
        h("input", { type: "search", class: "agenda-filtro-nome", placeholder: "Filtrar nesta tela", "aria-label": "Filtrar nesta tela", value: filtroNome, autocomplete: "off",   // plano 2000d · DU-326 (pendência da frente sis)
          "aria-keyshortcuts": atalhosLigados ? "/" : null, "aria-describedby": `ag-filtro-conta-${idTela}`,     // plano 1500c · GX-018
          // plano 2000d · DC-359: a varredura da grade espera 120 ms sem digitar (antes, a cada tecla)
          on: { input: ev => { filtroNome = String(ev.target.value || ""); clearTimeout(timerFiltro); timerFiltro = setTimeout(() => { if (vivo) aplicarFiltroNome({ anunciar: true }); }, 120); },
            // plano 1500c · GX-015: Esc limpa o filtro (e não fecha nada por trás); vazio, deixa o Esc seguir
            keydown: ev => { if (ev.key === "Escape" && filtroNome) { ev.preventDefault(); if (ev.stopPropagation) ev.stopPropagation(); ev.target.value = ""; filtroNome = ""; aplicarFiltroNome({ anunciar: true }); } } } }),
        // GX-016: «2 de 14 consultas» ao lado do campo (o leitor de tela ouve pelo status curto)
        h("span", { class: "agenda-filtro-conta dado", id: `ag-filtro-conta-${idTela}` })) : null,
      // plano 2000d · DC-410: «Avisar 10 min antes» (notificação do navegador, com permissão) da próxima consulta DESTA pessoa
      podeAvisar() && eu && todas.some(c => c && String(c.dono_id) === eu) ? h("button", { type: "button", class: ["bt", "bt-fant", "bt-p", "agenda-aviso10", aviso10 && "ativo"], "aria-pressed": String(aviso10),
        title: `Notificação do navegador 10 min antes das suas ${pal}s (com a Agenda aberta)`, on: { click: alternarAviso10 } }, ui.icone("sino"), "Avisar 10 min antes") : null,   // plano 2000d · GY-040
      // plano 1500c · GX-054: com o filtro, o CSV leva só o que a tela mostra
      !movel && visiveis.length ? h("button", { type: "button", class: "bt bt-fant bt-p agenda-exportar", on: { click: () => exportarCSV(visiveis.filter(c => casaFiltroNome(chaveFiltroConsulta(c), filtroNome)), mostrados) } }, "Exportar CSV") : null,
      !movel && (modo === "semana" || emLista) && visiveis.length ? h("button", { type: "button", class: "bt bt-fant bt-p agenda-imprimir-semana", on: { click: () => imprimirSemana(carregados, consultas, config, bloqueios, hoje) } }, "Imprimir semana") : null,
      !movel && temHoje ? h("button", { type: "button", class: "bt bt-fant bt-p agenda-tv", "aria-haspopup": "dialog", on: { click: abrirTV } }, "Tela da recepção") : null);

    const resumo = h("section", { class: "agenda-resumo", "aria-label": "Resumo do período" },
      h("div", { class: "agenda-resumo-data" },
        h("b", null, titulo), fonteEl),
      filtroEl, fechadosBt,
      porDono ? ui.segmentado({ opcoes: [{ valor: "juntos", rotulo: "Juntos" }, { valor: "responsavel", rotulo: "Por responsável" }], valor: agrupar, tipo: "filtro", rotulo: "Agrupar a agenda do dia", classe: "agenda-agrupar",
        aoMudar: v => { agrupar = v; gravarPreferencias(); desenhar(); } }) : null,
      h("div", { class: "agenda-resumo-num" },
        h("span", null, h("b", { class: "dado", dataset: { valor: String(nDentro) } }, ui.num(nDentro)), ` ${nDentro === 1 ? pal : `${pal}s`}`),   // plano 2000d · DC-293
        h("span", null, h("b", { class: "dado", dataset: { valor: String(nBloq) } }, ui.num(nBloq)), ` ${nBloq === 1 ? "bloqueio" : "bloqueios"}`),
        // plano 1000b · CB-192: com o filtro de profissional a conta é só da agenda filtrada — o rótulo diz isso (a clínica pode estar cheia)
        ocup === null ? null : h("span", { class: "agenda-resumo-ocup", title: filtroProf === "todos" ? "Horas marcadas sobre o expediente dos dias mostrados"
          : `Horas marcadas ${filtroProf === "eu" ? "da sua agenda" : `da agenda de ${nomesAtuais[filtroProf] || "quem foi escolhido"}`} sobre o expediente dos dias mostrados (as dos outros profissionais não entram)` },
          anelOcupacao(h, { pct: ocup }, { tamanho: 22 }), h("b", { class: "dado" }, pctTexto(ocup))   /* plano 1500c · GX-002 */, filtroProf === "todos" ? " ocupado" : filtroProf === "eu" ? " da sua agenda" : " desta agenda"),
        // plano 2000d · DC-269: a taxa é sobre as que têm presença marcada; as sem marcação aparecem à parte («(5 sem marcação)»)
        tf && tf.pct !== null ? h("span", { class: "agenda-resumo-faltas", title: `Das ${pal}s que já passaram nos dias mostrados e têm presença marcada` }, "Faltas: ", h("b", { class: "dado" }, pctTexto(tf.pct))   /* plano 2000d · GY-061: 1 de 300 é «abaixo de 1%», não «0%» */, ` (${ui.num(tf.faltas)} de ${ui.num(tf.de)})`,
          tf.sem_marca ? h("small", { class: "agenda-resumo-sem-marca" }, ` (${ui.num(tf.sem_marca)} sem marcação)`) : null)
          : tf && tf.sem_marca ? h("span", { class: "agenda-resumo-faltas" }, `${ui.num(tf.sem_marca)} sem marcação de presença`) : null,
        // plano 2000d · DC-377: a contagem da IA conta até o valor (graficos.contar) e diz o que vende: «sem ninguém da equipe tocar»
        nIA ? h("span", { class: "agenda-resumo-ia", title: "Marcadas pela IA sem ninguém da equipe tocar" }, ui.icone("ia"), h("b", { class: "dado", dataset: { valor: String(nIA) } }, ui.num(nIA)), ` ${nIA === 1 ? "marcada" : "marcadas"} pela IA`, h("small", null, " sem ninguém da equipe tocar")) : null,
        // plano 2000d · DC-334: quantas vieram de anúncio — tocar destaca só elas na grade
        nAnuncio ? h("button", { type: "button", class: ["agenda-resumo-anuncio", soAnuncio && "ativo"], "aria-pressed": String(soAnuncio), title: soAnuncio ? "Mostrar todas" : "Destacar só as que vieram de anúncio",
          on: { click: () => { soAnuncio = !soAnuncio; desenhar(); anunciar(soAnuncio ? `${nAnuncio} em destaque: vieram de anúncio.` : "Todas à mostra.", { repetir: true }); } } },
          ui.icone("anuncio"), h("b", { class: "dado" }, ui.num(nAnuncio)), ` ${nAnuncio === 1 ? "veio" : "vieram"} de anúncio`) : null),
      caixaProxima, caixaLivre, marcarVazio,
      // plano 2000d · GY-062: agenda sem nenhuma consulta — ver como fica uma semana cheia (dados de exemplo, nada é gravado)
      !todas.length && !exemplo ? h("button", { type: "button", class: "bt bt-fant bt-p agenda-ver-exemplo", on: { click: verSemanaExemplo } }, "Ver semana de exemplo") : null,
      encaixarAgoraBt, ferramentas,
      avisoCap ? h("p", { class: "aviso aviso-info agenda-aviso-capacidade" }, avisoCap, " ", h("a", { href: "#/config/agenda", on: { click: ev => { ev.preventDefault(); ctx.navegar("#/config/agenda"); } } }, "Ajustar")) : null);

    // legenda das cores: por serviço ou por profissional (a troca só aparece quando há responsáveis nas consultas)
    const itensLegenda = legendaDe(visiveis, { por: corPor, nomes: nomesAtuais, ordem: ordemServicos, ordemProf: ordemProfAtual });
    const legenda = !emLista && (itensLegenda.length >= 2 || legendaAtivos.size) ? h("div", { class: "ag-legenda-linha" },
      temResponsaveis || temSalas ? ui.segmentado({ opcoes: [{ valor: "servico", rotulo: "Por serviço" }, temResponsaveis ? { valor: "profissional", rotulo: "Por profissional" } : null, temSalas ? { valor: "sala", rotulo: "Por sala" } : null].filter(Boolean), valor: corPor, tipo: "filtro", rotulo: "Cor dos blocos", classe: "ag-legenda-por",   // plano 2000d · DC-347: «Por sala»
        aoMudar: v => { corPor = v; legendaAtivos = new Set(); gravarPreferencias(); desenhar(); } }) : null,
      montarLegenda({ h, itens: itensLegenda, ativos: legendaAtivos, num: ui.num, palavra: pal, avatar: corPor === "profissional" && typeof ui.avatar === "function" ? ui.avatar : null,
        aoAlternar: it => {
          const antesN = legendaAtivos.size;
          legendaAtivos = it ? alternarLegenda(legendaAtivos, it) : new Set();
          // plano 2000d · DC-357: tocar num chip só troca as classes (o critério é o mesmo) — redesenho inteiro só quando o «Mostrar todas» aparece ou some
          if (!((antesN > 0) === (legendaAtivos.size > 0) && aplicarLegendaNaTela(itensLegenda))) desenhar();
          // plano 1500c · GX-049: o destaque muda a grade em silêncio — o leitor de tela ouve quantas ficaram em destaque
          const n = visiveisAtuais.filter(c => legendaAtivos.has(corDaConsulta(c, corPor, nomesAtuais, ordemServicos, ordemProfAtual).chave)).length;
          // plano 2000d · GY-041: a palavra da vertical («2 visitas em destaque»)
          anunciar(legendaAtivos.size ? `${n} ${n === 1 ? `${pal} em destaque` : `${pal}s em destaque`}.` : `Todas as ${pal}s à mostra.`, { repetir: true });
        } })) : null;

    // E1: «Compareceu / Faltou» nas consultas que já passaram (servidor sem nx_agenda_presenca → some); E5: vazio com a ilustração da agenda
    const presencaPainel = Lg && !semPresenca && !exemplo ? {   // plano 2000d · GY-063: no exemplo, sem presença (nada grava)
      L: Lg, aoMarcar: marcarPresenca, aoLote: marcarPresencaLote, icone: ui.icone } : null;
    const contatosLinha = exemplo ? null : contatosDaLinha(hoje);     // plano 1500c · CC-225/CC-226; plano 2000d · GY-063: no exemplo, sem ligar/conversar
    const desmarcadasDia = Array.isArray(atual.desmarcadas) ? atual.desmarcadas.filter(x => x && partesSP(x.inicio) && partesSP(x.inicio).dia === data) : null;   // CC-270
    const painel = () => montarPainelDia({ h, iso: data, consultas, config, hoje, horaBR: ui.horaBR, num: ui.num, pode: ctx.pode("atendente"),
      presenca: presencaPainel, vazio: typeof ui.vazio === "function" ? ui.vazio : null, telBR: typeof ui.telBR === "function" ? ui.telBR : String,
      imprimir: movel ? null : imprimirDia, contatos: contatosLinha, desmarcadas: desmarcadasDia,
      // plano 1500c · CC-261: no celular, «Compartilhar» manda a lista do dia em texto (navigator.share) ao profissional
      // plano 1500c · GX-029: sem o compartilhar do aparelho (computador, alguns navegadores), «Copiar lista» leva o mesmo texto para colar no WhatsApp Web
      compartilhar: (movel && temShare()) || typeof ui.copiar === "function" ? iso => compartilharDia(iso, consultas, hoje, bloqueios) : null,
      rotuloCompartilhar: movel && temShare() ? "Compartilhar" : "Copiar lista",
      palavra: pal, cabImpressao: movel ? "" : cabecalhoImpressao(),   // plano 2000d · DC-293 / DC-381
      aoAbrir: (c, bt) => abrirDetalhe(c, bt), aoMarcar: iso => abrirAgendamento(null, { dia: iso }) });
    if (presencaPainel) lerPresencasQueFaltam(emLista ? visiveis : consultasDoDia(consultas, data));

    if (emLista) {
      conteudo.append(...[movel ? barraDoDia(hoje, { lista: true }) : null, roteiro, resumo, montarListaDias({ h, dias: carregados, consultas, config, hoje, presenca: presencaPainel, pode: ctx.pode("atendente"),
        aoAbrir: (c, bt) => abrirDetalhe(c, bt), aoMarcar: iso => abrirAgendamento(null, { dia: iso }), horaBR: ui.horaBR, telBR: typeof ui.telBR === "function" ? ui.telBR : String, num: ui.num, uid: idTela,
        bloqueios, contatos: contatosLinha, palavra: pal }), nota].filter(Boolean));   // plano 1500c · CC-174: os bloqueios entram na Lista; plano 2000d · GY-005
    } else if (movel) {
      const r = resumoDoDia(consultas, data, config);
      const faixasHoje = faixasDoDia(config, data);
      // CA-203: no celular os 4 cartões de números saem (CSS) e a linha do resumo diz o essencial: «2 consultas · 1 falta · 1 encaixe»
      // plano 2000d · DC-405: aberta/fechada como a pessoa deixou (lembrado); sem escolha, aberta quando há consultas
      const lista = h("details", { class: "ag-painel-det", open: listaDiaAberta === null ? r.total > 0 : listaDiaAberta,
        on: { toggle: ev => { const ab = !!(ev.target && ev.target.open); if (ab !== listaDiaAberta) { listaDiaAberta = ab; gravarPreferencias(); } } } }, h("summary", { class: "ag-painel-sum" }, h("span", null, "Lista do dia"),
        h("span", { class: "ag-painel-sum-n dado" }, textoResumoDia(r, { futuro: data > hoje, num: ui.num, palavra: pal, livre: !(Array.isArray(faixasHoje) && !faixasHoje.length) && !diaTodoBloqueado(bloqueios, data) }))), painel());
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
    if (!movel && !emLista) focarAgoraDesktop(`${iv.de}|${iv.dias}|${modo}`);   // plano 1500c · GX-035
    animarNumeros();
    aplicarFiltroNome();
    if (tvAberta) tvAberta.pintar();     // CC-323: a tela da recepção acompanha a releitura
    // plano 2000d · DC-363: a seta que passou da borda do mês leva o foco ao dia certo do mês novo
    if (focoMesPendente) { const b = conteudo.querySelector(`.ag-mes-dia[data-iso="${focoMesPendente}"]`); if (b) { focoMesPendente = ""; try { b.focus(); } catch { /* ok */ } } }
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
          on: { click: () => irParaHoje() } }, "Hoje")));   // plano 2000d · GY-060: o mesmo «Hoje» do cabeçalho (já em hoje, diz isso e leva até agora)
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

  /** Plano 1500c · RC-198: a hora pedida pelo endereço vira o cursor de horário na coluna do dia (visível) e a vista rola até ela; na Lista,
      até o dia. Hora fora do eixo vai para a ponta mais perto. */
  function irParaHoraPedida(hhmm) {
    if (modo === "lista") { const s = conteudo.querySelector(`.ag-lista-dia[data-iso="${data}"]`); if (s && s.scrollIntoView) try { s.scrollIntoView({ block: "start" }); } catch { /* ok */ } return; }
    const col = conteudo.querySelector(`.ag-col[data-iso="${data}"]`);
    const min = paraMin(hhmm);
    if (!col || !eixoAtual || min === null) return;
    cursorMin = Math.max(eixoAtual.ini * 60, Math.min(eixoAtual.fim * 60 - 5, min));
    mostrarCursor(col, eixoAtual);
    const cur = col.querySelector(".ag-cursor");
    if (cur && cur.scrollIntoView) try { cur.scrollIntoView({ block: "center", behavior: ui.comportamentoRolagem ? ui.comportamentoRolagem() : "auto" }); } catch { /* ok */ }
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
    anunciar(`Foco na ${palavraCompromisso(ctx.vocab)} das ${horaTxt(p.min)}.`, { repetir: true });   // plano 2000d · DC-365
  }
  /** Plano 2000d · DC-365: abre o detalhe da consulta pelo bloco dela na tela (depois de irParaConsulta). */
  function abrirDetalheDaTela(c) {
    const bt = blocoDaTela(c && c.negocio_id);
    if (bt) abrirDetalhe(c, bt);
  }

  /** Plano 1500c · GX-035: no computador, abrir o período de hoje com a grade comprida (07h às 22h) leva a vista até a linha de «agora»
      quando ela está fora da tela — uma vez por período (não briga com quem já rolou). */
  let agoraFocado = "";
  function focarAgoraDesktop(chave) {
    if (agoraFocado === chave) return;
    agoraFocado = chave;
    requestAnimationFrame(() => {
      if (!vivo) return;
      const el = conteudo.querySelector(".ag-agora:not([hidden])");
      if (!el) return;
      const r = el.getBoundingClientRect(), alt = typeof innerHeight === "number" ? innerHeight : 0;
      if (!alt || !r.width || (r.top >= 80 && r.top <= alt - 80)) return;      // sem largura = ainda sem layout
      try { globalThis.scrollBy({ top: Math.round(r.top - alt * 0.35), behavior: ui.comportamentoRolagem ? ui.comportamentoRolagem() : "auto" }); } catch { /* ok */ }
    });
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
      const oc = ocupacaoMemo(consultas, iso, config, bloqueios, opOcup);   // plano 2000d · DC-358: uma conta por dia e por desenho;   // anel de ocupação atrás do número do dia (item 40); CA-196: sem o horário bloqueado
      const n = oc.n, txtOc = textoOcupacao(oc);
      const sel = iso === data;
      // plano 1500c · CC-332: dia todo bloqueado (feriado) aparece na faixa — classe e «bloqueado» no nome
      const bloq = diaTodoBloqueado(bloqueios, iso);
      // plano 2000d · DC-321: hoje diz «hoje» (aria-current=date) — antes só a classe visual
      el.appendChild(h("button", { type: "button", role: "tab", class: ["ag-faixa-d", sel && "sel", iso === hoje && "hoje", oc.fechado && "fechado", bloq && "bloqueado"], "aria-selected": String(sel), tabindex: sel ? "0" : "-1",
        id: `ag-aba-${idTela}-${iso}`, "aria-controls": `ag-dia-painel-${idTela}`, "aria-current": iso === hoje ? "date" : null,
        "aria-label": `${nomeDia(iso, true)}${iso === hoje ? ", hoje" : ""}, ${textoQtd(n, palavraCompromisso(ctx.vocab))}${bloq ? ", bloqueado" : ""}${txtOc && !bloq ? `, ${txtOc}` : ""}`, dataset: { iso },
        on: { click: () => { const mudou = data !== iso; data = iso; gravarPreferencias(); montarCabecalho(); desenhar();
          // plano 1000b · CB-172: trocar o dia na faixa redesenha sem dizer nada — o status curto diz o dia e quantas consultas
          if (mudou) anunciar(`${nomeDia(iso, true)}: ${textoQtd(n, palavraCompromisso(ctx.vocab))}`); } } },   // plano 2000d · GY-042: a palavra da vertical
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
    // plano 2000d · DC-368: o painel acompanha o dedo (prévia do gesto) e volta ao lugar se não passar de 80 px; com movimento reduzido, sem acompanhar
    const semMovimento = () => typeof matchMedia === "function" && matchMedia("(prefers-reduced-motion: reduce)").matches;
    const voltar = () => { if (el.style) { el.style.setProperty("transform", ""); el.style.setProperty("transition", ""); } };
    el.addEventListener("touchstart", ev => { const t = ev.touches && ev.touches[0]; if (!t || ev.touches.length > 1) { x0 = null; return; } x0 = t.clientX; y0 = t.clientY; if (el.style) el.style.setProperty("transition", "none"); }, { passive: true });
    el.addEventListener("touchmove", ev => {
      const t = ev.touches && ev.touches[0];
      if (x0 === null || !t || arrasto || semMovimento()) return;
      const dx = t.clientX - x0, dy = t.clientY - y0;
      if (Math.abs(dy) > Math.abs(dx)) return;
      if (el.style) el.style.setProperty("transform", `translateX(${Math.max(-120, Math.min(120, dx * 0.6))}px)`);
    }, { passive: true });
    el.addEventListener("touchcancel", () => { x0 = null; voltar(); }, { passive: true });
    el.addEventListener("touchend", ev => {
      const t = ev.changedTouches && ev.changedTouches[0];
      voltar();
      if (x0 === null || !t) return;
      const dx = t.clientX - x0, dy = t.clientY - y0;
      x0 = null;
      if (Math.abs(dx) < 80 || Math.abs(dy) > Math.abs(dx) / 2 || arrasto) return;
      data = diaISO(data, dx < 0 ? 1 : -1); gravarPreferencias(); carregar();
      // plano 2000d · DC-319: o mesmo texto do toque na faixa («Sex, 24 de out.: 3 consultas»)
      const nDia = consultasDoDia(atual && Array.isArray(atual.consultas) ? atual.consultas : [], data).length;
      anunciar(`${nomeDia(data, true)}: ${textoQtd(nDia, palavraCompromisso(ctx.vocab))}`);
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
      // plano 2000d · DC-375: com passo de até 30 min, a meia hora também tem rótulo («:30»; o CSS mostra só onde cabe)
      passo <= 30 ? Array.from({ length: horas }, (_, i) => h("span", { class: "ag-hora-meia dado", style: { "--i": String(i) } }, ":30")) : null,
      colunas.some(c => c.hoje) ? h("span", { class: "ag-agora-rot dado", hidden: true }) : null);   // o rótulo da linha de «agora» (item 42) fica na régua
    const iFoco = Math.max(0, colunas.findIndex(c => c.iso === data));   // CA-197: uma coluna só na ordem do Tab (a do dia escolhido); setas andam entre elas
    const corpo = h("div", { class: "ag-corpo" }, regua, colunas.map((c, i) => colunaDoDia(c, eixo, config, passo, i === iFoco)));
    // plano 1500c · CC-220: a instrução das colunas é dita uma vez (aria-describedby comum), não repetida no nome de cada dia
    const instrucao = ctx.pode("atendente") ? h("p", { class: "sr-only", id: `ag-col-instr-${idTela}` }, `Enter marca ${palavraCompromisso(ctx.vocab)} neste dia; setas para cima e para baixo escolhem o horário; Page Up e Page Down andam uma hora.`)   /* plano 2000d · GY-044 */ : null;
    const grade = h("div", { class: ["ag-grade", ehMovel && "ag-movel"], style: { "--horas": String(horas), "--colunas": String(colunas.length) }, role: "group",
      "aria-label": ehMovel ? "Agenda do dia" : "Agenda", "aria-description": `Nas ${palavraCompromisso(ctx.vocab)}s, as setas andam entre elas` },   // plano 2000d · GY-044
      instrucao, ehMovel ? null : cab, corpo);
    ligarRovingBlocos(grade);
    return grade;
  }

  function cabecalhoDaColuna(c, ehMovel, modoDia, config, ocupacao = {}) {
    if (c.dono !== undefined) {
      return h("div", { class: ["ag-dia-cab", "ag-dono-cab"] }, h("b", { class: "ag-dono-nome", dataset: { dono: c.dono } }, c.titulo),
        h("span", { class: "ag-dia-total", title: textoQtd(c.consultas.length, palavraCompromisso(ctx.vocab)) }, c.consultas.length ? ui.num(c.consultas.length) : "livre"));   // plano 1500c · CC-192; plano 2000d · DC-285: «1 consulta»
    }
    const ehHoje = c.hoje;
    const oc = ocupacaoMemo(c.consultas, c.iso, config, c.bloqueios, ocupacao), txtOc = textoOcupacao(oc);
    // na semana, a data é um botão que abre o dia; em «Dia» é só texto
    const dataTxt = [h("span", { class: "ag-dia-sem" }, modoDia ? nomeDia(c.iso, true).replace(/,.*$/, "").replace(/\.$/, "") : semanaCurta(c.iso)), h("b", { class: "ag-dia-num dado" }, diaDoMes(c.iso))];
    const dataEl = modoDia ? dataTxt : h("button", { type: "button", class: "ag-dia-abrir", "aria-label": `Abrir o dia ${nomeDia(c.iso, true)}`, title: "Ver só este dia",
      on: { click: () => { data = c.iso; modo = "dia"; gravarPreferencias(); carregar(); } } }, dataTxt);
    return h("div", { class: ["ag-dia-cab", ehHoje && "hoje"], "aria-current": ehHoje ? "date" : null },
      dataEl,
      h("span", { class: "ag-dia-total", title: textoQtd(c.consultas.length, palavraCompromisso(ctx.vocab)) }, c.consultas.length ? ui.num(c.consultas.length) : ""),   // plano 2000d · GY-043
      // plano 1000b · CB-148: sem «+» em dia passado
      // plano 1500c · CC-165: o comentário tinha engolido o aria-label e o title (o «+» ficava sem nome) — cada um na sua linha
      // plano 1500c · GX-046: nem em dia fechado pela configuração ou bloqueado o dia todo (o «+» abria a janela em outro dia, sem dizer por quê)
      ctx.pode("atendente") && !(c.iso < ui.hojeSP()) && !(Array.isArray(faixasDoDia(config, c.iso)) && !faixasDoDia(config, c.iso).length) && !diaTodoBloqueado(c.bloqueios, c.iso)
        ? h("button", { type: "button", class: "bt-icone ag-dia-mais",
        "aria-label": `Marcar ${palavraCompromisso(ctx.vocab)} em ${nomeDia(c.iso, true)}`, title: `Marcar ${palavraCompromisso(ctx.vocab)} neste dia`,
        on: { click: () => abrirAgendamento(null, { dia: c.iso }) } }, ui.icone("mais")) : null,
      // barra de ocupação do dia (item 40): largura = fração do expediente marcada; a cor sobe com o nível
      txtOc ? h("i", { class: ["ag-dia-ocup", `ag-ocup-${nivelOcupacao(oc.pct)}`], style: { "--p": oc.pct === null ? "0" : oc.pct.toFixed(3) }, title: txtOc, "aria-hidden": "true" }) : null,
      txtOc ? h("span", { class: "sr-only" }, txtOc) : null,
      // plano 2000d · DC-313: a linha de «agora» é desenho — o leitor de tela ouve a hora e a próxima no cabeçalho de hoje
      ehHoje ? h("span", { class: "sr-only ag-agora-sr" }, textoAgoraDoDia(c.consultas, Date.now(), palavraCompromisso(ctx.vocab))) : null);
  }

  function colunaDoDia(c, eixo, config, passo, focavel = false) {
    const duracaoPadrao = Number(config.duracao_min) || 30;
    const edita = ctx.pode("atendente") && !(c.iso < ui.hojeSP());   // plano 1500c · GX-040: coluna de dia que passou não se diz marcável (sem cursor de clique nem «Enter marca»)
    // CA-197: pelo teclado a coluna também marca — Enter abre «Marcar» no dia; ↑↓ movem um cursor de horário visível; ←→ trocam de coluna
    // plano 1500c · CC-220: o nome é só o dia; a instrução vem do aria-describedby comum (o leitor não repete tudo a cada troca de dia)
    // plano 2000d · DC-310: os bloqueios do dia entram na descrição da coluna (para quem não é admin o bloqueio é um li sem foco e o leitor
    // nunca chegava nele); DC-374: o dia que já passou ganha a classe «passado» (fundo mais apagado)
    const idBloqDesc = c.bloqueios.length ? `ag-col-bloq-${idTela}-${String(c.chave).replace(/[^\w-]/g, "")}` : null;
    const col = h("ol", { class: ["ag-col", c.hoje && "hoje", edita && "ag-edita", c.iso < ui.hojeSP() && "passado"], dataset: { iso: c.iso, chave: c.chave },
      "aria-label": c.rotulo, "aria-describedby": [edita ? `ag-col-instr-${idTela}` : null, idBloqDesc].filter(Boolean).join(" ") || null,
      tabindex: edita ? (focavel ? "0" : "-1") : null });
    if (idBloqDesc) col.appendChild(h("li", { class: "sr-only ag-col-bloq-desc", id: idBloqDesc }, c.bloqueios.map(b => textoBloqueioNoDia(b, c.iso)).join(". ")));
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
      // plano 2000d · DC-291: um nome só — «Bloqueado» + o motivo (sem «Horário bloqueado —» no title nem «Dia indisponível» de reserva)
      const motivo = [String(b.motivo || "").trim() ? `Bloqueado: ${String(b.motivo).trim()}` : "Bloqueado", ui.periodoBR(b.inicio, b.fim, " · ")].filter(Boolean).join(" · ");
      // plano 1500c · CC-281: com altura (≥ 45 min), o período curto aparece no próprio bloco («12:00–13:00»): no toque ninguém via o title
      const txtBloq = textoBloqueioNoDia(b, c.iso);
      const periodoCurto = pos.altura >= 0.75 ? (/das (\d\d:\d\d) às (\d\d:\d\d)/.exec(txtBloq) || []).slice(1).join("–")
        || ((/das (\d\d:\d\d) até o fim do dia/.exec(txtBloq) || [])[1] ? `${/das (\d\d:\d\d)/.exec(txtBloq)[1]} em diante` : "")   // plano 2000d · DC-290
        || (/dia todo/.test(txtBloq) ? "o dia todo" : "") : "";
      // plano 1500c · CC-280: para o admin o bloqueio é um botão que abre o editar (sem ir às Configurações)
      const editaBloq = ctx.pode("admin") && b.id != null;
      const miolo = [h("span", { class: "ag-bloq-rot" }, ui.icone("fechar"), h("span", { "aria-hidden": "true" }, b.motivo || "Bloqueado")),
        periodoCurto ? h("span", { class: "ag-bloq-periodo dado", "aria-hidden": "true" }, periodoCurto) : null,
        // plano 1000b · CB-182: o período do bloqueio em texto (o title não é lido no toque nem pelo leitor de tela)
        h("span", { class: "sr-only ag-bloq-txt" }, txtBloq)];
      col.appendChild(h("li", { class: ["ag-bloq", editaBloq && "ag-bloq-edita"], title: motivo, style: { "--t": String(pos.topo), "--d": String(pos.altura) } },
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
    // plano 2000d · DC-403: com o mouse, a linha tracejada mostra a hora que o clique vai marcar (o mesmo arredondamento do clique)
    if (ctx.pode("atendente") && !movel && !(c.iso < ui.hojeSP())) {
      let linha = null;
      col.addEventListener("pointermove", ev => {
        if (ev.pointerType && ev.pointerType !== "mouse") return;
        if (arrasto || (ev.target && ev.target.closest && ev.target.closest(".ag-item, .ag-bloq"))) { if (linha) linha.hidden = true; return; }
        const r = col.getBoundingClientRect();
        if (!r.height) return;
        const hora = horaDoClique((ev.clientY - r.top) / r.height, eixo, passo);
        const min = paraMin(hora);
        if (!linha) { linha = h("i", { class: "ag-col-hover", "aria-hidden": "true" }, h("span", null, "")); col.appendChild(linha); }
        linha.hidden = false;
        linha.style.setProperty("top", `${((min / 60 - eixo.ini) / (eixo.fim - eixo.ini)) * 100}%`);
        linha.firstChild.textContent = hora;
      });
      col.addEventListener("pointerleave", () => { if (linha) linha.hidden = true; });
    }
    return col;
  }

  function blocoDaConsulta(b, col) {
    const c = b.consulta;
    const palB = palavraCompromisso(ctx.vocab);
    const nome = c.nome || c.titulo || `${maiuscula(palB)} sem nome`;   // plano 2000d · GY-045: «Visita sem nome»
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
    const ia = c.marcado_por === "ia", confirmada = confirmadaValida(c) && !feita;   // plano 2000d · DC-394: a confirmação de antes da remarcação não vale
    // plano 1500c · GX-010: a consulta que está acontecendo agora fica marcada (borda forte) e o leitor ouve «em andamento»
    const emCurso = consultaEmAndamento(c, Date.now(), Number(col.config && col.config.duracao_min) || 30);
    // plano 2000d · DC-335: o lead de anúncio ganha o megafone; DC-412: «1ª vez» (primeira_vez, quando o servidor mandar); DC-345: o campo da 2ª linha
    const deAnuncio = veioDeAnuncio(c), primeira = c.primeira_vez === true;
    const campoBloco = typeof c.campo_bloco === "string" && c.campo_bloco.trim() ? c.campo_bloco.trim().slice(0, 40) : "";
    // plano 2000d · DC-306: com mais de um profissional, o leitor ouve com quem é (na coluna por responsável o nome já está no cabeçalho)
    const donoNome = col.dono === undefined && c.dono_id != null && ordemProfAtual.filter(x => x !== "sem").length > 1 ? (nomesAtuais[String(c.dono_id)] || (typeof c.dono_nome === "string" ? c.dono_nome.trim() : "")) : "";
    const extrasRot = [emCurso ? "em andamento" : null, confirmada ? "confirmada" : null, ia ? "marcada pela IA" : null, deAnuncio ? "veio de anúncio" : null, primeira ? "primeira vez" : null,
      campoBloco || null, c.obs ? `observação: ${c.obs}` : null].filter(Boolean).join(", ");
    // plano 2000d · DC-305/DC-450: falta (riscado) e encaixe (borda tracejada) também para quem enxerga — classe e selo no bloco
    const selo = cl.falta ? ["Faltou", "ag-selo-falta"] : cl.encaixe && !feita ? ["Encaixe", "ag-selo-encaixe"] : null;
    const bt = h("button", { type: "button", class: ["ag-bloco", curto && "curto", feita && "feita", arrastavel && "ag-arrastavel", confirmada && "confirmada", emCurso && "ag-em-curso", cl.falta && "falta", cl.encaixe && "encaixe"], "aria-haspopup": "dialog",
      "aria-label": `${rotuloDoBloco(c, { inicio, fim, nome, feita, falta: cl.falta, encaixe: cl.encaixe, proxima: ehProxima, dono: donoNome, palavra: palB })}${extrasRot ? `, ${extrasRot}` : ""}`,
      // plano 1500c · CC-218: o title cita os atalhos de remarcar do detalhe (teclado sem mouse)
      title: [`${inicio}${fim ? `–${fim}` : ""}`, nome, c.servico, campoBloco || null, c.obs || null, corPor === "profissional" ? k.rotulo : donoNome ? `com ${donoNome}` : null, selo ? selo[0] : null, arrastavel ? "Arraste para remarcar (ou Enter › Dia seguinte)" : null].filter(Boolean).join(" · ") },
      h("span", { class: "ag-bloco-l1" }, h("span", { class: "ag-bloco-hora dado" }, inicio), h("b", { class: "ag-bloco-nome dado-pessoal" }, nome),
        ia && typeof ui.icone === "function" ? h("span", { class: "ag-bloco-ia", "aria-hidden": "true", title: "Marcada pela IA" }, ui.icone("ia")) : null,
        deAnuncio && typeof ui.icone === "function" ? h("span", { class: "ag-bloco-anuncio", "aria-hidden": "true", title: "Veio de anúncio" }, ui.icone("anuncio")) : null,
        primeira ? h("span", { class: "ag-bloco-1a", "aria-hidden": "true", title: "Primeira vez" }, "1ª") : null,
        confirmada ? h("span", { class: "ag-bloco-conf", "aria-hidden": "true" }, "✓") : null),
      selo ? h("span", { class: ["ag-bloco-selo", selo[1]], "aria-hidden": "true" }, selo[0]) : null,
      c.servico ? h("span", { class: "ag-bloco-serv" }, c.servico) : null,
      campoBloco ? h("span", { class: "ag-bloco-campo dado" }, campoBloco) : null,
      feita ? ui.icone("check") : null);
    bt.addEventListener("click", ev => {
      ev.stopPropagation();
      if (ignorarClique) { ignorarClique = false; return; }   // o clique que fecha um arrasto não abre o detalhe
      abrirDetalhe(c, bt);
    });
    // plano 2000d · DC-323 (ag-novo) / DC-334 (só anúncio: as outras apagadas)
    const item = h("li", { class: ["ag-item", ehProxima && "ag-proxima", apagado && "apagado", chavesNovas.has(chaveConsulta(c)) && "ag-novo", soAnuncio && !deAnuncio && "apagado"], dataset: { cols: b.cols, chave: k.chave, negocio: c.negocio_id ?? null, nome: chaveFiltroConsulta(c), anuncio: deAnuncio ? "1" : null },   // CC-266; plano 1500c · GX-017 (telefone)
      style: { "--t": String(b.topo), "--d": String(b.altura), "--col": String(b.col), "--cols": String(b.cols), "--cor-bloco": `var(--pal-${cor})`, "--i": String(seqBloco++) } },
      ehProxima ? h("span", { class: "ag-proxima-selo", "aria-hidden": "true" }, "Próxima") : null, bt);
    if (arrastavel) bt.addEventListener("pointerdown", ev => iniciarArrasto(ev, bt, item, c, col));
    return item;
  }

  /** CA-267: o marcador «+N» das consultas escondidas num horário lotado de encaixes; tocar lista as N (cada uma abre o detalhe). */
  function maisDoHorario(m) {
    const n = m.consultas.length;
    // plano 2000d · GY-046: a palavra da vertical no «+N» e na lista que ele abre
    const palM = palavraCompromisso(ctx.vocab);
    const bt = h("button", { type: "button", class: "ag-mais-bt dado", "aria-haspopup": "dialog", "aria-label": `Mais ${textoQtd(n, palM)} neste horário`,
      title: m.consultas.map(c => `${ui.horaBR(c.inicio)} ${c.nome || c.titulo || maiuscula(palM)}`).join(" · ") }, `+${n}`);
    bt.addEventListener("click", ev => {
      ev.stopPropagation();
      const lista = h("div", { class: "ag-mais-lista", role: "group", "aria-label": `${maiuscula(palM)}s neste horário` },
        m.consultas.map(c => h("button", { type: "button", class: "bt bt-fant bt-p ag-mais-item", on: { click: () => { pop.fechar(); abrirDetalhe(c, bt); } } },
          h("span", { class: "dado" }, ui.horaBR(c.inicio)), " ", c.nome || c.titulo || maiuscula(palM), c.servico ? h("small", null, ` · ${c.servico}`) : null)));
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
    if (exemplo) return;   // plano 2000d · GY-063
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
    // plano 1500c · GX-023: dentro da antecedência mínima (Configurações › Agenda) o servidor recusa a marcação normal — avisa já no soltar
    if (dentroDaAntecedencia(cfg, instanteNoFuso(d.iso, d.hora))) return "antecedencia";
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
        h("span", { class: "ag-bloco" }, h("span", { class: "ag-bloco-l1" }, a.rotulo, h("b", { class: "ag-bloco-nome" }, a.c.nome || a.c.titulo || maiuscula(palavraCompromisso(ctx.vocab))))));
    }
    if (a.fantasma.parentNode !== d.col) d.col.appendChild(a.fantasma);
    a.fantasma.hidden = false;
    a.fantasma.style.setProperty("--t", String(d.min / 60 - eixoAtual.ini));
    a.fantasma.style.setProperty("--d", String(a.duracao / 60));
    const motivo = destinoValido(d);
    // lotado: supervisor pode encaixar (fantasma em atenção); os demais veem o vermelho, como bloqueado, fechado e passado
    const encaixe = motivo === "lotado" && ctx.pode("supervisor");
    // plano 1500c · GX-024: o fantasma vermelho diz POR QUÊ («já passou», «fechado», «antecedência»), não só bloqueado e lotado
    const encaixeAnt = motivo === "antecedencia" && ctx.pode("supervisor");
    const porque = { bloqueado: " · bloqueado", passou: " · já passou", fechado: " · fechado", antecedencia: encaixeAnt ? " · encaixe" : " · antecedência" }[motivo]
      || (motivo === "lotado" ? (encaixe ? " · encaixe" : " · lotado") : "");
    // plano 2000d · DC-440: o início cabe, mas o fim passa do fechamento (10:30 + 60 min numa agenda que fecha às 11:00) — o fantasma avisa
    const passa = !motivo && passaDoHorario(atual && atual.config, d.iso, d.min, a.duracao) ? " · passa do horário" : "";
    a.rotulo.textContent = `${d.hora}–${horaTxt(d.min + a.duracao)}${porque}${passa}`;
    a.fantasma.classList.toggle("ag-fantasma-passa", !!passa);
    a.fantasma.classList.toggle("ag-fantasma-ruim", !!motivo && !encaixe && !encaixeAnt);
    a.fantasma.classList.toggle("ag-fantasma-encaixe", encaixe || encaixeAnt);
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
    if (motivo === "fechado") { ui.toast(textoForaDoHorario(atual && atual.config, d.iso), { tipo: "info" }); return false; }   // plano 2000d · DC-400
    // CA-164/CA-165: bloqueio e horário cheio avisam já no soltar (antes abria a confirmação e só o servidor recusava)
    if (motivo === "bloqueado") { ui.toast(`Horário bloqueado: ${d.conflito.rotulo}.`, { tipo: "info" }); return false; }
    if (motivo === "lotado" && !ctx.pode("supervisor")) { ui.toast(`Esse horário já está cheio. ${dica}`, { tipo: "info" }); return false; }
    // plano 1500c · GX-023: antecedência — o supervisor encaixa (com o aviso); os demais ficam sabendo a regra
    if (motivo === "antecedencia" && !ctx.pode("supervisor")) { ui.toast(`${textoAntecedencia((atual && atual.config) || {})} ${dica}`, { tipo: "info" }); return false; }
    confirmarRemarcacao(c, d, { encaixe: motivo === "lotado" || motivo === "antecedencia", porAntecedencia: motivo === "antecedencia", dica });   // plano 1000b · CB-149: o erro do servidor usa a dica de quem chamou
    return true;
  }
  /** Plano 1500c · GX-025: a duração da consulta em minutos (o fim que veio, ou a duração padrão). */
  const duracaoDe = c => { const m = c && c.inicio ? minutosDaConsulta(c, Number(atual && atual.config && atual.config.duracao_min) || 30) : null; return m ? m.fim - m.ini : null; };
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
  async function confirmarRemarcacao(c, d, { encaixe = false, dica = "Escolha outro horário.", porAntecedencia = false } = {}) {
    const palR = palavraCompromisso(ctx.vocab);   // plano 2000d · GY-048: «Remarcar visita?» na oficina
    const nome = c.nome || c.titulo || maiuscula(palR);
    const hoje = ui.hojeSP();
    const de = partesSP(c.inicio);
    if (!Lg) try { Lg = await logicaDe(ctx); } catch { ui.toast("Não foi possível abrir a remarcação. Tente de novo.", { tipo: "erro" }); return; }
    const req = Lg.novaReq();        // a mesma intenção em todas as tentativas desta janela: o servidor não marca duas vezes
    const inicioNovo = isoNoFuso(d.iso, d.hora);      // CA-194: o instante pelo fuso, sem «-03:00» fixo
    const corpo = h("div", { class: "ag-remarcar" },
      h("p", { class: "ag-remarcar-nome" }, h("b", { class: "dado-pessoal" }, nome), c.servico ? h("small", null, ` · ${c.servico}`) : null),
      h("div", { class: "ag-remarcar-de-para" },
        h("span", { class: "ag-remarcar-de" }, h("small", null, "De"), h("b", { class: "dado" }, de ? `${rotuloDoDia(de.dia, hoje)} ${horaTxt(de.min)}` : ui.dataHoraBR(c.inicio))),
        h("span", { class: "ag-remarcar-seta", "aria-hidden": "true" }, "→"),
        h("span", { class: "ag-remarcar-para" }, h("small", null, "Para"), h("b", { class: "dado" }, `${rotuloDoDia(d.iso, hoje)} ${d.hora}`),
          // plano 1500c · GX-025: até quando vai no horário novo («até 10:45»), para conferir se cabe antes do almoço
          duracaoDe(c) ? h("small", { class: "dado ag-remarcar-ate" }, `até ${horaTxt(d.min + duracaoDe(c))}`) : null)),
      encaixe ? h("p", { class: "aviso aviso-aten ag-remarcar-encaixe" }, ui.icone("info"), h("span", null, porAntecedencia
        ? `${textoAntecedencia((atual && atual.config) || {})} A ${palR} entra como encaixe.`      // plano 1500c · GX-023
        : `Esse horário já está cheio: a ${palR} entra como encaixe, acima da capacidade.`)) : null,
      h("p", { class: "campo-ajuda" }, "Se alguém pegar este horário antes de você confirmar, avisamos."));   // plano 2000d · DC-401
    const statusEl = h("p", { class: "crm-status", role: "status", "aria-live": "polite", hidden: true });
    corpo.appendChild(statusEl);
    // remarcar leva o cartão para a etapa «Agendada» (o servidor faz isso a cada marcar): lê a etapa de AGORA enquanto a pessoa confirma,
    // para o Desfazer devolvê-lo a ela — como a janela de marcar. Já em «Agendada»: nada a ler
    let antes = null;
    const fichaP = c.marco === "agendada" ? null : lerEtapa(api, c.negocio_id).then(x => { antes = x; });
    const r = await ui.modal({ titulo: `Remarcar ${palR}?`, corpo, largura: "p", protegerTexto: false, acoes: [
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
            : codigo === "horario_ocupado" ? `Outro atendimento entrou neste horário${sufixoOcupadoPor(e, Date.now())} (a agenda foi atualizada). ${dica}`
              : api.mensagemErro(e));
          // plano 2000d · DC-276: a recusa relê a grade — a consulta que o colega acabou de marcar aparece e a pessoa não tenta no mesmo lugar
          // DC-325: quem pegou (ocupado_por, quando o servidor mandar)
          if (codigo === "horario_ocupado" && vivo) recarregar();
          return false;
        }
      } },
    ] });
    if (!(r && r.ok)) return;
    const anterior = c.inicio, servico = c.servico || null, negocioId = c.negocio_id, etapaAntes = antes, encaixeAntes = typeof c.encaixe === "boolean" ? c.encaixe : undefined;
    recarregar().then(() => { if (vivo) confirmarNoBloco(negocioId, `${maiuscula(palR)} remarcada`); });   // E5: o bloco no horário novo confirma
    comDesfazer(ui, {
      texto: `Remarcada para ${rotuloDoDia(d.iso, hoje)} às ${d.hora}`,
      // plano 1500c · CC-178: como marcar e desmarcar, a remarcação oferece escrever o aviso ao paciente (o novo horário; nada sai sozinho)
      acao: avisarPaciente && c.contato_id != null ? { rotulo: rotuloAvisar("remarcacao", ctx.vocab), fn: () => avisarPaciente({ ...c, inicio: inicioNovo, fim: null }, "remarcacao") } : undefined,
      reverter: async () => {
        const av = avisoVoltaEncaixe(await voltarAoHorario(api, negocioId, anterior, servico, encaixeAntes), palavraCompromisso(ctx.vocab));   // plano 2000d · GY-010
        if (av) ui.toast(av, { tipo: "info" });
        // remarcar levou o cartão para «Agendada» (resposta com «etapa»): volta para a etapa em que estava, com a mesma rotina da janela
        if (r.etapa && !(await devolverEtapa(api, negocioId, etapaAntes)))
          ui.toast(`A ${palR} voltou ao horário, mas o cartão não voltou para a etapa em que estava. Confira no CRM.`, { tipo: "info" });
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
    // plano 1500c · GX-045: tocar no almoço diz que é a pausa (12:00–13:00), não «fora do horário de atendimento» no meio da tarde
    const pausa = pausaNoHorario(config, iso, min);
    if (pausa) { ui.toast(`Pausa das ${horaTxt(pausa[0])} às ${horaTxt(pausa[1])}: escolha outro horário.`, { tipo: "info" }); return; }
    if (horarioAberto(config, iso, min) === false) { ui.toast(textoForaDoHorario(config, iso), { tipo: "info" }); return; }   // plano 2000d · DC-400
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
      anunciar(`${horaTxt(cursorMin)}${horarioAberto(config, c.iso, cursorMin) === false ? ", fora do atendimento" : ""}${estadoDoMinuto(c, cursorMin, config, palavraCompromisso(ctx.vocab))}`, { repetir: true });   // plano 2000d · DC-309
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
      anunciar(`${horaTxt(cursorMin)}${horarioAberto(config, c.iso, cursorMin) === false ? ", fora do atendimento" : ""}${estadoDoMinuto(c, cursorMin, config, palavraCompromisso(ctx.vocab))}`, { repetir: true });   // plano 2000d · DC-309
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
    conferirAviso10(agora);   // plano 2000d · DC-410
    ultimoTique = agora;
    // plano 2000d · DC-360: só refaz a conta quando o relógio passa do próximo início (ou a agenda/filtro mudou) — antes, toda a lista a cada minuto
    const chaveTique = `${filtroProf}|${presencasLidas.size}`;
    if (atual && atual === tiqueBase && chaveTique === tiqueChave && agora < tiqueAte && !arrasto) { /* nada cruzou: nada a refazer */ }
    else if (atual && Array.isArray(atual.consultas) && !arrasto) {
      const lista = filtrarPorProfissional(atual.consultas.map(comPresencaLida), filtroProf, eu);
      tiqueBase = atual; tiqueChave = chaveTique;
      // plano 2000d · GY-059: o FIM também cruza — a borda «em andamento» sai quando a consulta termina (antes ficava até o próximo início)
      const durT = Number(atual.config && atual.config.duracao_min) || 30;
      const marcos = c => { const t0 = Date.parse(c && c.inicio); if (!Number.isFinite(t0)) return []; const t1 = Date.parse(c && c.fim); return [t0, Number.isFinite(t1) && t1 > t0 ? t1 : t0 + durT * 60000]; };
      tiqueAte = lista.reduce((m, c) => marcos(c).reduce((mm, t) => (t > agora && t < mm ? t : mm), m), Infinity);
      const cruzou = lista.some(c => marcos(c).some(t => t > antes && t <= agora));
      if (cruzou || chaveConsulta(proximaConsulta(lista, agora)) !== chaveConsulta(proximaAtual)) {
        // plano 1500c · CC-249: com a aba escondida o redesenho espera a volta (visibilitychange)
        if (typeof document !== "undefined" && document.hidden) redesenhoPendente = true;
        // plano 1500c · GX-042: com o detalhe (ou outra janela) aberto, o redesenho espera — o balão ficava preso a um bloco que saiu da tela
        else if (janelaAberta()) redesenhoPendente = true;
        else desenhar();
      }
    }
    if (redesenhoPendente && !document.hidden && !janelaAberta() && atual) { redesenhoPendente = false; desenhar(); }
    atualizarRelativos();
    releituraAutomatica();
  }
  /** Plano 1500c · GX-042: há uma janela ou o balão do detalhe aberto por cima da Agenda? */
  function janelaAberta() {
    return typeof document !== "undefined" && !!(document.querySelector && document.querySelector("dialog[open], .flut-ag"));
  }
  /** Plano 1500c · GX-020/GX-021: o que é relativo a «agora» acompanha o relógio sem redesenhar a grade — «em 25 min» da Próxima vira
      «em 24 min» a cada tique, e o «Próximo livre» que já passou é pedido de novo. */
  function atualizarRelativos() {
    if (!vivo || !atual) return;
    const hoje = ui.hojeSP();
    const q = conteudo.querySelector("button.agenda-proxima:not(.agenda-proxima-fora) .agenda-proxima-quando");
    if (q && proximaAtual) { const t = rotuloProxima(proximaAtual, Date.now(), hoje); if (q.textContent !== t) q.textContent = t; }
    const caixa = conteudo.querySelector(".agenda-prox-livre-caixa");
    if (caixa && livreCache.slot && Date.parse(livreCache.slot.inicio) <= Date.now()) { livreCache = { em: 0, chave: "", slot: null, p: null }; ui.limpar(caixa); completarProximoLivre(caixa, hoje); }
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
    if (exemplo) { avisarExemplo(); return; }   // plano 2000d · GY-063
    if (!Lg || semPresenca || !ctx.pode("atendente") || !c) return;
    const anterior = Lg.presencaDe(c);
    const pedido = Lg.proximaPresenca(anterior, est);
    const nome = c.nome || c.titulo || maiuscula(palavraCompromisso(ctx.vocab));
    // plano 2000d · DC-415: outra pessoa marcou o contrário há pouco (presenca_por_nome/presenca_em, quando o servidor mandar) — pergunta antes
    const outro = pedido !== "limpar" ? presencaRecenteDeOutro(c, pedido, meuNome(), Date.now()) : "";
    if (outro && typeof ui.confirmar === "function") {
      const ok = await ui.confirmar({ titulo: "Trocar a presença?", texto: `${outro}. Trocar para «${pedido === "faltou" ? "Faltou" : "Compareceu"}»?`, rotulo: "Trocar" });
      if (!ok || !vivo) return;
    }
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
      // plano 2000d · DC-355: sem internet a presença não se perde — fica na fila do aparelho e sai quando a conexão voltar
      if (pedido !== "limpar" && (offline() || (e && (e.codigo === "sem_conexao" || e.rede === true)))) {
        guardarPendentePresenca({ negocio: c.negocio_id, inicio: c.inicio, estado: pedido, nome });
        guardarPresenca(c, pedido);
        if (vivo && atual) desenhar();
        ui.toast(`Sem internet: «${pedido === "faltou" ? "Faltou" : "Compareceu"}» de ${nome} fica guardado e é enviado quando a conexão voltar.`, { tipo: "info" });
        return;
      }
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
    comDesfazer(ui, { texto,
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
  /** Plano 2000d · DC-355: a fila das presenças marcadas sem internet (localStorage por empresa; a RPC é idempotente por estado). */
  const chavePendentes = `agenda-presencas-pendentes:${(ctx.cliente && ctx.cliente.id) || ""}`;
  const lerPendentes = () => { try { const v = JSON.parse(localStorage.getItem(chavePendentes) || "[]"); return Array.isArray(v) ? v : []; } catch { return []; } };
  const gravarPendentes = l => { try { if (l.length) localStorage.setItem(chavePendentes, JSON.stringify(l.slice(-50))); else localStorage.removeItem(chavePendentes); } catch { /* sem armazenamento: segue */ } };
  function guardarPendentePresenca(p) { gravarPendentes([...lerPendentes().filter(x => !(x.negocio === p.negocio && x.inicio === p.inicio)), { ...p, em: Date.now() }]); }
  let enviandoPendentes = false;
  async function enviarPresencasPendentes() {
    const fila = lerPendentes();
    if (!fila.length || enviandoPendentes || !Lg) return;
    enviandoPendentes = true;
    const ficaram = [];
    try {
      for (const p of fila) {
        try { await api.rpcC("nx_agenda_presenca", { p_negocio: p.negocio, p_estado: p.estado }); }
        catch (e) { if (!(Lg.rpcAusente && Lg.rpcAusente(e))) ficaram.push(p); }
      }
    } finally { enviandoPendentes = false; }
    gravarPendentes(ficaram);
    const foram = fila.length - ficaram.length;
    if (foram && vivo) { ui.toast(`${foram === 1 ? "1 presença marcada sem internet foi enviada" : `${foram} presenças marcadas sem internet foram enviadas`}.`, { tipo: "ok" }); recarregar(); }
  }
  /** CA-192: «Marcar as N que faltam como Compareceu» — só as que já passaram sem marca; confirma antes e um Desfazer limpa todas. */
  async function marcarPresencaLote(lista, botao) {
    if (!Lg || semPresenca || !ctx.pode("atendente") || !Array.isArray(lista) || !lista.length) return;
    const n = lista.length;
    // plano 1500c · CC-224: cada consulta tem a caixa marcada (Compareceu); desmarcar a caixa grava «Faltou» — dia de chuva não é uma a uma
    const palL = palavraCompromisso(ctx.vocab);   // plano 2000d · GY-047: a palavra da vertical na janela do lote
    const caixas = lista.map(c => h("input", { type: "checkbox", class: "ag-lote-chk", checked: true, "aria-label": `${c.nome || c.titulo || maiuscula(palL)} compareceu` }));
    const ok = await ui.modal({ titulo: `Marcar ${n} como «Compareceu»?`, largura: "p", protegerTexto: false,
      corpo: h("div", { class: "pilha" }, h("p", null, `As ${palL}s que já passaram e ainda não têm presença marcada. Desmarque quem faltou:`),
        h("ul", { class: "ag-lote-lista" }, lista.map((c, i) => h("li", null, h("label", { class: "ag-lote-item" }, caixas[i], h("span", { class: "dado" }, ui.horaBR(c.inicio)), " ", c.nome || c.titulo || maiuscula(palL)))))),
      acoes: [{ rotulo: "Cancelar", tipo: "neutro", valor: false }, { rotulo: `Gravar ${n}`, tipo: "primario", valor: true }] });
    if (!ok || !vivo) return;
    const estados = new Map(lista.map((c, i) => [c, caixas[i].checked === false ? "faltou" : "compareceu"]));
    const feitas = [], falharam = [], etapasAntes = new Map();
    // plano 1500c · CC-182: até 4 gravações ao mesmo tempo (15 consultas no fim do dia eram 15 idas e voltas em fila)
    const gravar = () => comLimite(lista, 4, async c => {
      if (semPresenca) return;
      const est = estados.get(c);
      // plano 2000d · DC-275: a falta leva o negócio à etapa de faltas — a etapa de antes fica guardada para o Desfazer devolver
      if (est === "faltou" && c.marco !== "faltou") try { etapasAntes.set(c, await lerEtapa(api, c.negocio_id)); } catch { /* sem a etapa: o Desfazer só limpa */ }
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
    const nomeLote = c => `${c.nome || c.titulo || maiuscula(palL)} (${ui.horaBR(c.inicio)})`;
    const naoGravou = feitas.length < n ? (falharam.length
      ? ` · não gravaram: ${falharam.slice(0, 3).map(nomeLote).join(", ")}${falharam.length > 3 ? ` e mais ${falharam.length - 3}` : ""}. Marque essas uma a uma.`
      : ` (${n - feitas.length} não gravaram)`) : "";
    const nFaltou = feitas.filter(c => estados.get(c) === "faltou").length;
    const resumoLote = nFaltou ? `${feitas.length - nFaltou} «Compareceu» e ${nFaltou} «Faltou»` : `${feitas.length} ${feitas.length === 1 ? `${palL} marcada` : `${palL}s marcadas`} como «Compareceu»`;
    comDesfazer(ui, { texto: `${resumoLote}${naoGravou}`,
      reverter: async () => {
        // plano 1500c · CC-181: uma que falha não para as outras — as que não voltaram são ditas pelo nome
        const naoVoltaram = [];
        await comLimite(feitas, 4, async c => {
          try {
            await api.rpcC("nx_agenda_presenca", { p_negocio: c.negocio_id, p_estado: "limpar" }); guardarPresenca(c, null);
            if (etapasAntes.get(c) && !(await devolverEtapa(api, c.negocio_id, etapasAntes.get(c)))) naoVoltaram.push(c);   // plano 2000d · DC-275
          }
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
    for (const el of conteudo.querySelectorAll(".ag-impressao-cab")) el.textContent = cabecalhoImpressao();   // plano 2000d · DC-381: a hora da impressão
    if (corpo) corpo.classList.add("ag-imprimindo");
    const fim = () => { if (corpo) corpo.classList.remove("ag-imprimindo"); if (typeof removeEventListener === "function") removeEventListener("afterprint", fim); };
    if (typeof addEventListener === "function") addEventListener("afterprint", fim);
    try { globalThis.print(); } finally { setTimeout(fim, 1000); }
  }

  /* ============================================================ plano 1500c (frente agenda): peças novas da tela */
  /** CC-260: «Imprimir semana» — a folha leva os 7 dias em lista (hora, paciente, serviço, telefone) e some depois da impressão. */
  function imprimirSemana(dias, consultas, config, bloqueios, hoje) {
    if (typeof globalThis.print !== "function") return;
    const folha = h("div", { class: "ag-folha-semana" }, h("p", { class: "ag-impressao-cab" }, cabecalhoImpressao()),   // plano 2000d · DC-381
      h("h2", null, `Agenda · ${ui.dataCurtaBR(dias[0])} a ${ui.dataCurtaBR(dias[dias.length - 1])}`),
      montarListaDias({ h, dias, consultas, config, hoje, bloqueios, horaBR: ui.horaBR, telBR: typeof ui.telBR === "function" ? ui.telBR : String, num: ui.num, uid: `imp${idTela}`, palavra: palavraCompromisso(ctx.vocab) }));
    conteudo.appendChild(folha);
    const corpo = document.body && document.body.classList ? document.body : null;
    if (corpo) corpo.classList.add("ag-imprimindo-semana");
    const fim = () => { if (corpo) corpo.classList.remove("ag-imprimindo-semana"); folha.remove(); if (typeof removeEventListener === "function") removeEventListener("afterprint", fim); };
    if (typeof addEventListener === "function") addEventListener("afterprint", fim);
    try { globalThis.print(); } finally { setTimeout(fim, 1000); }
  }
  /** CC-258: as consultas do período num arquivo CSV (abre no Excel). */
  function exportarCSV(lista, dias) {
    // plano 2000d · GY-066: o filtro não deixou nada — avisa em vez de baixar uma planilha só com o cabeçalho
    if (!Array.isArray(lista) || !lista.length) { ui.toast(`Nenhuma ${palavraCompromisso(ctx.vocab)} com esse filtro para exportar.`, { tipo: "info" }); return; }
    const csv = csvDaAgenda(lista, { nomes: nomesAtuais, contato: palavrasAgenda(ctx.vocab).contato.replace(/^./, x => x.toUpperCase()), telBR: typeof ui.telBR === "function" ? ui.telBR : null });   // plano 2000d · DC-382
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
  const temShare = () => typeof navigator !== "undefined" && !!navigator && typeof navigator.share === "function";   // plano 1500c · GX-029
  /** CC-261: manda a lista do dia em texto pelo compartilhar do celular (WhatsApp, e-mail…). */
  async function compartilharDia(iso, consultas, hoje, bloqueios = []) {
    const texto = textoCompartilharDia(consultas, iso, hoje, bloqueios, { soPrimeiroNome: true, palavra: palavraCompromisso(ctx.vocab) });   // plano 1500c · GX-008: com os bloqueios do dia; plano 2000d · DC-383: só o primeiro nome
    // plano 1500c · GX-029: sem o compartilhar do celular, copia (o aviso diz que copiou)
    if (!(movel && temShare())) { const ok = await copiarSemAviso(texto); ui.toast(ok ? "Lista do dia copiada — cole no WhatsApp ou onde quiser." : "Não foi possível copiar neste aparelho.", { tipo: ok ? "ok" : "erro" }); return; }
    try { await navigator.share({ title: `Agenda · ${nomeDia(iso, true)}`, text: texto }); }   // plano 2000d · GY-058: o título diz o dia
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
      .then(r => {
        meu.slot = primeiroLivre(agruparLivres(r && r.horarios));
        if (livreCache !== meu) return;
        if (meu.slot) { pintar(meu.slot); return; }
        // plano 2000d · DC-338: sem vaga nos 3 dias a caixa diz (antes ficava vazia e parecia não ter carregado) e oferece ver mais dias
        if (!vivo) return;
        ui.limpar(caixa);
        caixa.appendChild(h("span", { class: "agenda-sem-livre" }, `Sem horário livre até ${rotuloDoDia(diaISO(hoje, 2), hoje).toLowerCase()}`));
        if (ctx.pode("atendente")) caixa.appendChild(h("button", { type: "button", class: "bt bt-fant bt-p agenda-sem-livre-mais", on: { click: () => abrirAgendamento(null, { dia: diaISO(hoje, 3) }) } }, "Ver mais dias"));
      })
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
      h("div", { class: "linha ag-roteiro-acoes" },
        h("a", { class: "bt bt-prim bt-p ag-roteiro-ir", href: "#/config/agenda", on: { click: ev => { ev.preventDefault(); ctx.navegar("#/config/agenda"); } } }, "Configurar a agenda"),
        // plano 2000d · DC-399: quem já configurou (ou usa o horário do departamento de propósito) dispensa o roteiro — fica lembrado
        h("button", { type: "button", class: "bt bt-fant bt-p ag-roteiro-dispensar", on: { click: () => { roteiroDispensado = true; gravarPreferencias(); desenhar(); anunciar("Roteiro dispensado.", { repetir: true }); } } }, "Já configurei"),
        // plano 2000d · GY-062: ver como fica uma semana cheia antes de configurar
        h("button", { type: "button", class: "bt bt-fant bt-p ag-roteiro-exemplo", on: { click: verSemanaExemplo } }, "Ver semana de exemplo")));
  }
  /** CC-266: «Filtrar nesta tela» apaga (sem redesenhar) os blocos e as linhas que não casam com o nome ou o serviço digitado. */
  function aplicarFiltroNome({ anunciar: dizer = false } = {}) {
    const q = String(filtroNome || "").trim();
    for (const el of conteudo.querySelectorAll(".ag-item[data-nome], .ag-painel-li[data-nome]")) el.classList.toggle("ag-filtrado", !!q && !casaFiltroNome(el.dataset.nome, q));   // plano 1500c · GX-017
    // plano 1500c · GX-016: a conta do que sobrou (cada consulta uma vez, mesmo aparecendo na grade e no painel)
    const conta = conteudo.querySelector(".agenda-filtro-conta");
    const n = visiveisAtuais.filter(c => casaFiltroNome(chaveFiltroConsulta(c), q)).length;
    const txt = textoContaFiltro(n, visiveisAtuais.length, q, palavraCompromisso(ctx.vocab));   // plano 2000d · GY-003
    if (conta && conta.textContent !== txt) conta.textContent = txt;
    if (dizer && txt) anunciar(txt, { repetir: true });
  }
  /** CC-225/CC-226: ligar, conversar e «Lembrar» direto nas linhas do painel e da Lista. */
  function contatosDaLinha(hoje) {
    const comConv = !!(ctx.temModulo && ctx.temModulo("conversas"));
    const pode = ctx.pode("atendente");
    return {
      icone: ui.icone,
      hrefTel: t => (Lg ? Lg.hrefTel(t) : telLocal(t)),
      aoConversar: comConv ? c => ctx.navegar(`#/conversas?contato=${encodeURIComponent(c.contato_id)}`) : null,
      // plano 2000d · DC-337: também a de HOJE com mais de 2 h de antecedência (a das 17h marcada cedo)
      podeLembrar: c => comConv && pode && podeLembrarConsulta(c, hoje),
      aoLembrar: c => { lembrar(c).then(() => { if (vivo && atual) desenhar(); }); },
      // plano 2000d · DC-272: o estado («Lembrado» com o envio do servidor; «Lembrete pronto» com o preparo deste aparelho)
      lembrado: c => (!!c && (partesSP(c.inicio) || {}).dia >= hoje ? estadoLembrete(c, lembrados.get(`${c.negocio_id}|${c.inicio}`) || null) : null),
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
      ui.toast(`${c.nome || c.titulo || maiuscula(palavraCompromisso(ctx.vocab))} · confirmada.`, { tipo: "ok" });
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
    // plano 2000d · DC-378: a identidade da empresa (o nome do white-label) no cabeçalho
    const empresa = nomeEmpresa();
    // plano 2000d · DC-418: saiu da tela cheia (Esc do navegador) → pergunta se a camada fica ou fecha
    const avisoTela = h("p", { class: "aviso aviso-info ag-tv-saiu", role: "status", hidden: true }, "Saiu da tela cheia. ",
      h("button", { type: "button", class: "bt bt-fant bt-p", on: { click: () => { avisoTela.hidden = true; try { if (el.requestFullscreen) el.requestFullscreen().catch(() => { /* ok */ }); } catch { /* ok */ } } } }, "Voltar à tela cheia"),
      h("button", { type: "button", class: "bt bt-fant bt-p", on: { click: () => fecharTV() } }, "Fechar a tela da recepção"));
    const el = h("div", { class: "ag-tv", role: "dialog", "aria-modal": "true", "aria-label": "Tela da recepção" },
      h("header", { class: "ag-tv-cab" }, h("div", { class: "ag-tv-id" }, empresa ? h("p", { class: "ag-tv-empresa" }, empresa) : null, h("h2", null, "Próximos atendimentos")), relogio, fechar), avisoTela, lista);
    const pintar = () => {
      if (!tvAberta) return;
      relogio.textContent = horaTxt((partesSP(new Date()) || { min: 0 }).min);
      ui.limpar(lista);
      const hojeAgora = ui.hojeSP();
      const linhas = proximasDaTV(atual && Array.isArray(atual.consultas) ? atual.consultas.map(comPresencaLida) : [], hojeAgora, Date.now(), Number(atual && atual.config && atual.config.duracao_min) || 30);
      if (!linhas.length) lista.appendChild(h("li", { class: "ag-tv-vazio" }, "Sem mais atendimentos hoje."));
      const variosProf = ordemProfAtual.filter(x => x !== "sem").length > 1;
      for (const { c, agora } of linhas) {
        const p = partesSP(c.inicio);
        // DC-378: «com Dra. Helena» quando há mais de um profissional; DC-379: «Agora» em destaque, as demais «A seguir»
        const com = variosProf && c.dono_id != null ? (nomesAtuais[String(c.dono_id)] || (typeof c.dono_nome === "string" ? c.dono_nome.trim() : "")) : "";
        lista.appendChild(h("li", { class: agora ? "ag-tv-agora" : null },
          h("small", { class: "ag-tv-rot" }, agora ? "Agora" : "A seguir"),
          h("b", { class: "dado" }, p ? horaTxt(p.min) : ""), h("span", null, primeiroNomeAgenda(c.nome || c.titulo) || palavrasAgenda(ctx.vocab).contato),
          com ? h("small", { class: "ag-tv-com" }, `com ${com}`) : null,
          textoEspera(c, Date.now()) ? h("small", { class: "ag-tv-espera" }, textoEspera(c, Date.now())) : null));   // plano 2000d · DC-414
      }
    };
    // plano 2000d · DC-417: o Tab não sai da tela (o resto fica inert enquanto ela está aberta)
    const tecla = ev => {
      if (ev.key === "Escape") { ev.preventDefault(); fecharTV(); return; }
      if (ev.key === "Tab") { const foc = [...el.querySelectorAll("button")].filter(b => !(avisoTela.hidden && avisoTela.contains(b)));
        if (foc.length) { const i = foc.indexOf(document.activeElement); ev.preventDefault(); const prox = foc[(i + (ev.shiftKey ? -1 : 1) + foc.length) % foc.length]; try { prox.focus(); } catch { /* ok */ } } }
    };
    const inertes = [...(document.body.children || [])].filter(x => x !== el && !x.inert);
    let entrouCheia = false;
    const aoTrocarCheia = () => { if (document.fullscreenElement === el) { entrouCheia = true; avisoTela.hidden = true; } else if (entrouCheia && tvAberta) avisoTela.hidden = false; };
    const timer = setInterval(pintar, 30_000);
    tvAberta = { el, pintar, fim: () => {
      clearInterval(timer); document.removeEventListener("keydown", tecla, true); document.removeEventListener("fullscreenchange", aoTrocarCheia);
      for (const x of inertes) try { x.inert = false; } catch { /* ok */ }
      el.remove(); try { if (document.fullscreenElement && document.exitFullscreen) document.exitFullscreen(); } catch { /* ok */ } } };
    document.addEventListener("keydown", tecla, true);
    document.addEventListener("fullscreenchange", aoTrocarCheia);
    document.body.appendChild(el);
    for (const x of inertes) try { x.inert = true; } catch { /* ok */ }
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
    const nome = viva.nome || viva.titulo || maiuscula(palavraCompromisso(ctx.vocab));
    const escolha = await ui.modal({ titulo: `Presença da ${palavraCompromisso(ctx.vocab)}`,   // plano 2000d · GY-053
      largura: "p", protegerTexto: false,
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
          h("span", { class: "agenda-proxima-rot" }, "Próxima"), h("b", { class: "dado-pessoal" }, px.nome || px.titulo || maiuscula(palavraCompromisso(ctx.vocab)))   /* plano 2000d · GY-054 */, h("span", { class: "dado agenda-proxima-quando" }, rotuloProximaFora(px, Date.now(), hoje)))
        : h("span", { class: "agenda-proxima agenda-proxima-vazia narr" }, textoSemProxima({ umDia, desde: de, hojeISO: hoje, palavra: palavraCompromisso(ctx.vocab) })));
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
        ui.toast(`Está na agenda de ${dono}: o filtro «${filtroProf === "eu" ? "Minha agenda" : filtroProf === "sem" ? "Sem responsável" : nomesAtuais[filtroProf] || "Profissional"}» esconde esta consulta.`, { tipo: "info",
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
  const janelaFechadaMeta = conv => janelaFechadaConversa(conv, Date.now());   // plano 2000d · DC-271: a regra do cv-logica (tudo que não é codewords)
  /** Plano 1500c · CC-206: o nome da empresa (ctx.cliente) e o endereço das configurações da IA (nx_cv_base; lido uma vez, só se houver Conversas). */
  let empresaP = null;
  /** Plano 2000d · DC-332: o link de avaliação (config.link_avaliacao, quando o servidor guardar) — só https. */
  const linkAvaliacao = () => { const l = atual && atual.config && typeof atual.config.link_avaliacao === "string" ? atual.config.link_avaliacao.trim() : ""; return /^https:\/\/\S+$/.test(l) ? l.slice(0, 300) : ""; };
  const nomeEmpresa = () => (ctx.cliente && typeof ctx.cliente.nome === "string" ? ctx.cliente.nome.trim().slice(0, 80) : "");   // plano 2000d · DC-301
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
    // plano 2000d · DC-300: a confirmação também diz de onde é; GY-017: a desmarcação, a remarcação e o convite de quem faltou também
    const extra = ["lembrete", "confirmacao", "avaliacao", "parabens", "desmarcacao", "remarcacao", "falta"].includes(tipo) ? { ...(await dadosDaEmpresa()) } : {};
    if (!vivo) return;
    if (tipo === "avaliacao") extra.link = linkAvaliacao();   // plano 2000d · DC-332
    const fn = { confirmacao: textoConfirmacao, desmarcacao: textoDesmarcacao, remarcacao: textoRemarcacao, falta: textoFalta, avaliacao: textoAvaliacao, parabens: textoParabens }[tipo] || textoLembrete;   // plano 2000d · DC-332/DC-413
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
    if (exemplo) { avisarExemplo(); return null; }   // plano 2000d · GY-063: o detalhe lê e grava no servidor — no exemplo, só o aviso
    const nome = c.nome || c.titulo || `${maiuscula(palavraCompromisso(ctx.vocab))} sem nome`;
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
    // plano 2000d · DC-301: o paciente sabe de onde vem a mensagem (o número do aparelho ele pode não ter salvo)
    const waLink = !comConversas && pode && c.telefone ? linkWhatsAppAgenda(c.telefone, futura ? textoLembrete(c, ui.hojeSP(), { vocab: ctx.vocab || null, empresa: nomeEmpresa() }) : faltou ? textoFalta(c, ui.hojeSP(), { vocab: ctx.vocab || null, empresa: nomeEmpresa() }) : "") : null;   // plano 2000d · GY-018: de onde é
    const acoes = h("div", { class: "ag-det-acoes" },
      comConversas ? h("button", { type: "button", class: "bt bt-sec bt-p", on: { click: () => { pop.fechar(); ctx.navegar(`#/conversas?contato=${encodeURIComponent(c.contato_id)}`); } } }, ui.icone("whatsapp"), "Abrir conversa") : null,
      waLink ? h("a", { class: "bt bt-sec bt-p ag-det-wa", href: waLink, target: "_blank", rel: "noopener noreferrer" }, ui.icone("whatsapp"), futura ? "Lembrar pelo seu WhatsApp" : "Seu WhatsApp") : null,   // plano 2000d · DC-438: sai do WhatsApp do aparelho (não do número da empresa)
      comConversas && pode && futura ? h("button", { type: "button", class: "bt bt-sec bt-p ag-det-lembrar", title: "Abre a conversa com o lembrete pronto no campo: você confere e envia",
        on: { click: () => { pop.fechar(); lembrar(c); } } }, ui.icone("sino"), "Lembrar") : null,
      // plano 1500c · CC-223: quem faltou ganha a mensagem pronta para remarcar
      comConversas && pode && faltou && !futura ? h("button", { type: "button", class: "bt bt-sec bt-p ag-det-falta", title: "Abre a conversa com a mensagem pronta no campo: você confere e envia",
        on: { click: () => { pop.fechar(); lembrar(c, "falta"); } } }, ui.icone("sino"), "Escrever convite para remarcar") : null,   // plano 2000d · DC-289
      // plano 2000d · DC-333: quem faltou vira tarefa no CRM («ligar amanhã» às 09:00, no responsável) — ninguém precisa lembrar de lembrar
      pode && faltou && !futura && c.negocio_id != null && !semTarefa ? h("button", { type: "button", class: "bt bt-sec bt-p ag-det-tarefa", on: { click: ev => criarTarefaFalta(c, ev.currentTarget || ev.target, pop) } }, ui.icone("relogio"), `Tarefa: ligar ${quandoDaTarefa().rotulo}`) : null,   // plano 2000d · GY-056
      // plano 2000d · DC-331: atendida (compareceu ou concluída) → o retorno já na data do serviço (6 meses na odonto)
      pode && !futura && (feita || c.presenca === "compareceu" || (pr && pr.estado === "compareceu")) && c.negocio_id != null ? h("button", { type: "button", class: "bt bt-sec bt-p ag-det-retorno",
        on: { click: () => { pop.fechar(); marcarRetornoDetalhe(c); } } }, ui.icone("mais"), `Marcar retorno (${textoRetornoDias(retornoEmDias(c, atual && atual.config, ctx.vocab))})`) : null,
      // plano 2000d · DC-332: atendida + link de avaliação configurado → o pedido de avaliação pronto na conversa
      comConversas && pode && !futura && (feita || c.presenca === "compareceu" || (pr && pr.estado === "compareceu")) && linkAvaliacao() ? h("button", { type: "button", class: "bt bt-sec bt-p ag-det-avaliacao",
        on: { click: () => { pop.fechar(); lembrar(c, "avaliacao"); } } }, ui.icone("sino"), "Pedir avaliação") : null,
      // plano 2000d · DC-413: aniversário hoje → os parabéns prontos na conversa
      comConversas && pode && c.aniversario_hoje === true ? h("button", { type: "button", class: "bt bt-sec bt-p ag-det-parabens", on: { click: () => { pop.fechar(); lembrar(c, "parabens"); } } }, "Escrever parabéns") : null,
      // plano 2000d · DC-339: trocar o serviço sem mexer no horário; DC-340: editar a observação depois de marcar
      pode && futura && c.negocio_id != null ? h("button", { type: "button", class: "bt bt-fant bt-p ag-det-servico", on: { click: () => { pop.fechar(); trocarServico(c); } } }, "Trocar serviço") : null,
      pode && !feita && c.negocio_id != null && !semObsSalvar ? h("button", { type: "button", class: "bt bt-fant bt-p ag-det-obs", on: { click: () => { pop.fechar(); editarObservacao(c); } } }, c.obs ? "Editar observação" : "Pôr observação") : null,
      // plano 1500c · CC-240: confirmou por telefone? registra (nx_agenda_confirmar; servidor sem a função → o botão some)
      pode && futura && !c.confirmada_em && !semConfirmar ? h("button", { type: "button", class: "bt bt-sec bt-p ag-det-confirmar", on: { click: ev => confirmarConsulta(c, ev.currentTarget || ev.target, pop) } }, ui.icone("check"), `${maiuscula(palavrasAgenda(ctx.vocab).contato)} confirmou`) : null,   // plano 2000d · DC-288: ação, não estado
      h("button", { type: "button", class: "bt bt-sec bt-p ag-det-negocio", on: { click: abrirNegocio } }, palavrasAgenda(ctx.vocab).abrirNeg),   // CB-189
      // plano 1500c · CC-180: consulta concluída não remarca nem desmarca (desmarcar apagava o horário do histórico)
      pode && !feita ? h("button", { type: "button", class: "bt bt-sec bt-p ag-det-remarcar", on: { click: async () => { pop.fechar(); const v = await conferirAntes(c); if (v) abrirAgendamento(v); } } }, "Remarcar") : null);   // plano 2000d · DC-324
    // plano 1500c · CC-301: «Desmarcar» (perigo) numa linha própria, separado por divisória — um toque errado não cai nele
    const perigo = pode && !feita ? h("div", { class: "ag-det-perigo" },
      h("button", { type: "button", class: "bt bt-contorno-perigo bt-p ag-det-desmarcar", on: { click: async () => { pop.fechar(); const v = await conferirAntes(c); if (v) desmarcar(v); } } }, "Desmarcar")) : null;   // plano 2000d · DC-324
    // CA-257: a observação/última nota do negócio («trazer exames»), numa linha — lida da ficha uma vez por negócio nesta tela
    // plano 1500c · CC-245/CC-246: a observação da consulta e a última nota, quando o servidor já mandar na linha, dispensam a leitura da ficha
    const notaEl = h("p", { class: "ag-det-nota", hidden: true });
    const notaPronta = typeof c.obs === "string" && c.obs.trim() ? `Observação: ${c.obs.trim()}` : typeof c.ultima_nota === "string" ? (c.ultima_nota.trim() ? ultimaNota([{ texto: c.ultima_nota }]) : "") : null;
    (notaPronta !== null ? Promise.resolve(notaPronta) : lerUltimaNota(c.negocio_id)).then(t => { if (t) { notaEl.textContent = t; notaEl.title = t; notaEl.hidden = false; } });
    const etapa = etapaDo(c), origemTxt = origemDo(c);
    const donoDet = c.dono_id != null ? (nomesAtuais[String(c.dono_id)] || (typeof c.dono_nome === "string" ? c.dono_nome.trim() : "")) : "";   // plano 2000d · DC-307
    // plano 2000d · DC-330: o caminho do lead (anúncio → marcou → confirmou → compareceu → fechou) numa faixa no topo do detalhe
    const passos = passosDoLead(c, { vocab: ctx.vocab });
    const linhaTempo = h("ol", { class: "ag-det-passos", "aria-label": "Caminho do contato" }, passos.map(ps => h("li", { class: ["ag-det-passo", ps.feito && "feito", ps.ruim && "ruim"] },
      typeof ui.icone === "function" ? ui.icone(ps.icone) : null, h("span", null, ps.rotulo), h("span", { class: "sr-only" }, ps.feito ? " (feito)" : " (ainda não)"))));
    const corpo = h("div", { class: "ag-det" },
      linhaTempo,
      h("b", { class: "ag-det-nome dado-pessoal" }, nome),   // plano 1500c · UC-030
      // plano 1500c · GX-011/GX-012: «Hoje · 10:00–10:45 · 45 min» (o dia pelo nome e a duração); GX-010: «em andamento» quando já começou
      h("span", { class: "ag-det-quando dado" }, quandoDoDetalhe(c, ui.hojeSP(), Number(atual && atual.config && atual.config.duracao_min) || 30),
        consultaEmAndamento(c, Date.now(), Number(atual && atual.config && atual.config.duracao_min) || 30) ? h("span", { class: "pilula pilula-info ag-det-agora" }, "em andamento") : null),
      c.servico ? h("span", null, c.servico) : null,
      c.telefone ? (hrefTel
        ? h("a", { class: "dado ag-det-tel dado-pessoal", href: hrefTel, "aria-label": `Ligar para ${nome}, ${ui.telBR(c.telefone)}` }, ui.icone("telefone"), ui.telBR(c.telefone))
        : h("span", { class: "dado dado-pessoal" }, ui.telBR(c.telefone))) : null,
      // plano 1500c · GX-013: no computador o «tel:» não disca — «Copiar» leva o número para o telefone fixo, o WhatsApp Web, a planilha
      c.telefone && typeof ui.copiar === "function" ? h("button", { type: "button", class: "bt bt-fant bt-p ag-det-copiar-tel", "aria-label": `Copiar o telefone de ${nome}`,
        on: { click: () => { Promise.resolve(ui.copiar(ui.telBR(c.telefone), { aviso: "Telefone copiado." })).catch(() => { /* o ui avisa */ }); } } }, ui.icone("copiar"), "Copiar") : null,
      // CA-280: origem e etapa em linhas próprias (antes «WhatsApp · Avaliação agendada» parecia uma coisa só)
      // plano 1000b · CB-164: sem origem conhecida a linha sai («Origem: Origem não informada» não dizia nada)
      origemTxt !== SEM_ORIGEM ? h("span", { class: "ag-det-origem" }, h("span", { class: "ag-det-rot" }, "Origem: "), origemTxt) : null,
      etapa ? h("span", { class: "ag-det-origem ag-det-etapa" }, h("span", { class: "ag-det-rot" }, "Etapa: "), etapa) : null,
      // plano 2000d · DC-307: com quem é o atendimento; DC-449: a sala/cadeira (sala_nome, quando o servidor mandar)
      donoDet ? h("span", { class: "ag-det-origem ag-det-com" }, h("span", { class: "ag-det-rot" }, "Com: "), donoDet) : null,
      typeof c.sala_nome === "string" && c.sala_nome.trim() ? h("span", { class: "ag-det-origem ag-det-sala" }, h("span", { class: "ag-det-rot" }, "Sala: "), c.sala_nome.trim().slice(0, 40)) : null,
      // plano 2000d · DC-370: «Confirmada» (agendamento) na cor de informação — o verde fica para «Concluída»; DC-394: só a confirmação depois da última marcação
      confirmadaValida(c) && !feita ? h("span", { class: "pilula pilula-info ag-det-confirmada" }, "Confirmada") : null,   // CC-239
      selosDoDetalhe(c, p, presencaEl),
      c.marcado_por === "ia" ? h("span", { class: "ag-det-origem ag-det-ia" }, ui.icone("ia"), "Marcada pela IA") : null,   // CC-324
      // plano 2000d · DC-328: quem da equipe marcou e quando (marcado_por_nome/marcado_em, quando o servidor mandar)
      c.marcado_por !== "ia" && typeof c.marcado_por_nome === "string" && c.marcado_por_nome.trim() ? h("span", { class: "ag-det-origem ag-det-marcou" },
        `Marcada por ${c.marcado_por_nome.trim().slice(0, 40)}${Number.isFinite(Date.parse(c.marcado_em)) ? ` · ${ui.dataHoraBR(c.marcado_em)}` : ""}`) : null,
      notaEl,
      presencaEl,
      atalhosRemarcar,
      acoes,
      perigo);
    // plano 2000d · DC-356: sem internet, as ações que gravam ficam indisponíveis já no detalhe (ligar e copiar continuam)
    if (offline()) {
      for (const b of corpo.querySelectorAll(".ag-det-remarcar, .ag-det-desmarcar, .ag-det-confirmar, .ag-det-retorno, .ag-det-tarefa, .ag-det-atalhos .bt, .ag-pres-bt")) {
        b.setAttribute("aria-disabled", "true"); b.setAttribute("title", "Sem internet: tente quando a conexão voltar");
      }
      corpo.addEventListener("click", ev => {
        const b = ev.target && ev.target.closest ? ev.target.closest('[aria-disabled="true"]') : null;
        if (b) { ev.preventDefault(); if (ev.stopPropagation) ev.stopPropagation(); ui.toast("Sem internet: tente quando a conexão voltar.", { tipo: "info" }); }
      }, true);
    }
    // plano 2000d · DC-361: atalhos no detalhe — C compareceu, F faltou, R remarcar, L lembrar (respeitam «atalhos desligados»)
    if (atalhosLigados) {
      corpo.setAttribute("title", "Atalhos: C compareceu · F faltou · R remarcar · L lembrar");
      corpo.addEventListener("keydown", ev => {
        if (ev.altKey || ev.ctrlKey || ev.metaKey || ev.shiftKey || (ev.target && /^(INPUT|TEXTAREA|SELECT)$/.test(ev.target.tagName))) return;
        const sel = atalhoDoDetalhe(ev.key);
        const b = sel ? corpo.querySelector(sel) : null;
        if (!b || b.getAttribute("aria-disabled") === "true") return;
        ev.preventDefault();
        b.click();
      });
    }
    const pop = ui.flutuante(ancora, corpo, { classe: "flut-ag" });
    // plano 1000b · CB-163: o diálogo do detalhe ganha nome («Consulta de Mariana Costa, Qui., 02 de out. 10:00»)
    const rotuloDet = `${maiuscula(palavraCompromisso(ctx.vocab))} de ${nome}${p ? `, ${nomeDia(p.dia)} ${horaTxt(p.min)}` : ""}`;   // plano 2000d · GY-050
    if (pop && pop.el && typeof pop.el.setAttribute === "function") pop.el.setAttribute("aria-label", rotuloDet);
    ligarFolhaArrastavel(pop);   // plano 2000d · DC-318
    return pop;
  }
  /** Plano 2000d · GY-099/GY-100/GY-101/GY-102/GY-103: o que a linha do painel e o bloco mostram também no detalhe — encaixe e falta pela
      etapa (GY-100), 1ª vez (GY-101), há quanto tempo espera (GY-102), aniversário (GY-103) e o estado do lembrete com hora e quem (GY-099). */
  function selosDoDetalhe(c, p, presencaEl) {
    const cfg = (atual && atual.config) || null;
    const vizinhas = p && atual && Array.isArray(atual.consultas) ? consultasDoDia(atual.consultas, p.dia) : [];
    const cl = classificarConsulta(c, cfg, { iso: p ? p.dia : null, vizinhas });
    const lemb = p && p.dia >= ui.hojeSP() ? estadoLembrete(c, lembrados.get(`${c.negocio_id}|${c.inicio}`) || null) : null;
    const espera = textoEspera(c, Date.now());
    const selos = [
      cl.encaixe && c.status !== "ganho" ? h("span", { class: "pilula pilula-aten ag-det-encaixe" }, "Encaixe") : null,
      cl.falta && !presencaEl ? h("span", { class: "pilula pilula-ruim ag-det-faltou" }, "Faltou") : null,
      c.primeira_vez === true ? h("span", { class: "pilula pilula-sec ag-det-1a" }, "1ª vez") : null,
      espera ? h("span", { class: "pilula pilula-aten ag-det-espera" }, espera) : null,
      c.aniversario_hoje === true ? h("span", { class: "pilula pilula-prim ag-det-aniv" }, "🎂 Aniversário hoje") : null,
      lemb ? h("span", { class: ["pilula", lemb.tipo === "enviado" ? "pilula-ok" : "pilula-sec", "ag-det-lembrete"], title: lemb.detalhe || null }, lemb.rotulo, lemb.detalhe ? h("span", { class: "sr-only" }, ` (${lemb.detalhe})`) : null) : null,
    ].filter(Boolean);
    return selos.length ? h("span", { class: "ag-det-selos" }, selos) : null;
  }
  /** Plano 2000d · DC-318: no celular o detalhe é folha inferior — a alça no topo e o deslizar para baixo (> 80 px) fecham;
      a alça é um botão «Fechar» para quem não usa gesto. Com movimento reduzido a folha não acompanha o dedo (só fecha). */
  function ligarFolhaArrastavel(pop) {
    const el = pop && pop.el;
    if (!el || typeof el.addEventListener !== "function" || typeof pop.fechar !== "function") return;
    const alca = h("button", { type: "button", class: "ag-det-alca", "aria-label": "Fechar o detalhe", on: { click: () => pop.fechar() } });
    if (typeof el.insertBefore === "function" && el.firstChild) el.insertBefore(alca, el.firstChild); else el.appendChild(alca);
    let y0 = null;
    const semMov = () => typeof matchMedia === "function" && matchMedia("(prefers-reduced-motion: reduce)").matches;
    const voltar = () => { if (el.style) el.style.setProperty("transform", ""); };
    el.addEventListener("touchstart", ev => {
      const t = ev.touches && ev.touches[0];
      // só pela alça ou com o conteúdo no topo (não rouba a rolagem da folha)
      y0 = t && ev.touches.length === 1 && (alca.contains(ev.target) || !(el.scrollTop > 0)) ? t.clientY : null;
    }, { passive: true });
    el.addEventListener("touchmove", ev => {
      const t = ev.touches && ev.touches[0];
      if (y0 === null || !t || semMov()) return;
      const dy = t.clientY - y0;
      if (el.style) el.style.setProperty("transform", dy > 0 ? `translateY(${Math.min(dy, 240)}px)` : "");
    }, { passive: true });
    el.addEventListener("touchcancel", () => { y0 = null; voltar(); }, { passive: true });
    el.addEventListener("touchend", ev => {
      const t = ev.changedTouches && ev.changedTouches[0];
      const dy = y0 !== null && t ? t.clientY - y0 : 0;
      y0 = null;
      voltar();
      if (dy > 80) pop.fechar();
    }, { passive: true });
  }
  /** Plano 2000d · DC-324: antes de desmarcar/remarcar pelo detalhe, se a leitura tem mais de 30 s, relê: se outra pessoa mexeu na consulta,
      avisa e reabre o detalhe com a versão nova (o Desfazer não devolve para um horário errado). → a consulta atual, ou null (não segue). */
  async function conferirAntes(c) {
    if (!c || !atual || Date.now() - ultimaLeitura < DETALHE_VELHO_MS) return c;
    try { await carregar({ silencioso: true, forcar: true }); } catch { return c; }
    if (!vivo || !atual) return null;
    const lista = Array.isArray(atual.consultas) ? atual.consultas : [];
    const nova = lista.find(x => x && x.negocio_id === c.negocio_id && x.inicio === c.inicio) || lista.find(x => x && x.negocio_id === c.negocio_id && x.status !== "ganho") || null;
    const mudou = consultaMudou(c, nova);
    if (!mudou) return nova || c;
    const quem = nova && typeof nova.atualizado_por_nome === "string" && nova.atualizado_por_nome.trim() ? ` por ${nova.atualizado_por_nome.trim().slice(0, 40)}` : "";
    ui.toast(mudou === "desmarcada" ? `Esta ${palavraCompromisso(ctx.vocab)} foi desmarcada${quem} enquanto o detalhe estava aberto. A agenda foi atualizada.`
      : `Esta ${palavraCompromisso(ctx.vocab)} foi ${mudou}${quem}${nova ? ` (agora ${ui.dataHoraBR(nova.inicio)})` : ""}. Confira e tente de novo.`, { tipo: "aten" });
    const bt = nova ? conteudo.querySelector(`.ag-item[data-negocio="${nova.negocio_id}"] .ag-bloco`) : null;
    if (bt) abrirDetalhe(nova, bt);
    return null;
  }
  /** Plano 2000d · DC-333: a tarefa «ligar amanhã» para quem faltou (nx_tarefa_salvar; servidor sem a função → o botão some). */
  let semTarefa = false;
  /** Plano 2000d · GY-056: quando vence a tarefa de ligar — o próximo dia de atendimento depois de hoje, às 09:00 ou quando a agenda abre
      (se abre mais tarde). → {dia, hora, rotulo: «amanhã» | «seg 27/10»} */
  function quandoDaTarefa() {
    const hoje = ui.hojeSP(), cfg = (atual && atual.config) || {};
    const dia = proximoDiaAberto(cfg, hoje, { bloqueios: atual && Array.isArray(atual.bloqueios) ? atual.bloqueios : [] }) || diaISO(hoje, 1);
    const fx = faixasDoDia(cfg, dia);
    const hora = Array.isArray(fx) && fx.length ? horaTxt(Math.max(fx[0][0], 9 * 60)) : "09:00";
    return { dia, hora, rotulo: rotuloDoDia(dia, hoje).toLowerCase() };
  }
  async function criarTarefaFalta(c, botao, pop) {
    const nome = primeiroNomeAgenda(c.nome || c.titulo) || c.nome || c.titulo || palavrasAgenda(ctx.vocab).contato;
    const quando = quandoDaTarefa();   // plano 2000d · GY-056: o próximo dia de atendimento (não o domingo fechado), na hora em que abre
    const p = { titulo: `Ligar para ${nome}: faltou e precisa remarcar`.slice(0, 120), tipo: "ligacao", vence_em: isoNoFuso(quando.dia, quando.hora),
      ...(c.negocio_id != null ? { negocio_id: c.negocio_id } : {}), ...(c.contato_id != null ? { contato_id: c.contato_id } : {}), ...(c.dono_id != null ? { dono_id: c.dono_id } : {}) };
    try {
      const salvar = () => api.rpcC("nx_tarefa_salvar", { p_tarefa: p });
      const t = await (typeof ui.carregando === "function" && botao ? ui.carregando(botao, salvar) : salvar());
      if (pop) pop.fechar();
      comDesfazer(ui, { texto: `Tarefa criada: ligar para ${nome} ${quando.rotulo} às ${quando.hora}`,
        reverter: async () => { if (t && t.id != null) await api.rpcC("nx_tarefa_salvar", { p_tarefa: { id: t.id, feita: true } }); } });
    } catch (e) {
      if (Lg && typeof Lg.rpcAusente === "function" && Lg.rpcAusente(e)) { semTarefa = true; ui.toast("O servidor ainda não cria tarefas por aqui. Crie no CRM.", { tipo: "info" }); return; }
      ui.toast(api.mensagemErro(e), { tipo: "erro" });
    }
  }
  /** Plano 2000d · DC-339: «Trocar serviço» — o mesmo horário com outro serviço (nx_agenda_marcar com o mesmo início; o servidor confere a nova duração). */
  async function trocarServico(c) {
    const antes = String(c.servico || "").trim();
    const campo = ui.campo({ rotulo: "Serviço", nome: "servico", valor: antes, max: 60, placeholder: exemplosAgenda(ctx.vocab).servicos, ajuda: "O horário continua o mesmo; a duração passa a ser a do serviço novo." });
    const r = await ui.modal({ titulo: "Trocar serviço", largura: "p", corpo: h("div", { class: "pilha" }, campo),
      acoes: [{ rotulo: "Cancelar", tipo: "neutro", valor: false }, { rotulo: "Trocar", tipo: "primario", fn: async m => {
        const novo = String(campo.querySelector("input").value || "").trim().slice(0, 60);
        // plano 2000d · GY-057: o mesmo serviço diz isso (antes pedia para «escrever o serviço novo» com o nome já escrito)
        if (!novo) { m.erro("Escreva o serviço novo."); return false; }
        if (normServico(novo) === normServico(antes)) { m.erro(`O serviço já é «${antes}». Escreva outro ou cancele.`); return false; }
        try { erroResposta(await api.rpcC("nx_agenda_marcar", { p_negocio: c.negocio_id, p_inicio: c.inicio, p_servico: novo, p_encaixe: c.encaixe === true })); return { ok: true, novo }; }
        catch (e) { m.erro(e && e.codigo === "horario_ocupado" ? `Com a duração de «${novo}» a ${palavraCompromisso(ctx.vocab)} invade o horário seguinte. Remarque em vez de trocar.` : api.mensagemErro(e)); return false; }
      } }] });
    if (!(r && r.ok) || !vivo) return;
    recarregar();
    comDesfazer(ui, { texto: `Serviço trocado para ${r.novo}`, reverter: async () => { erroResposta(await api.rpcC("nx_agenda_marcar", { p_negocio: c.negocio_id, p_inicio: c.inicio, p_servico: antes || null, p_encaixe: c.encaixe === true })); recarregar(); } });
  }
  /** Plano 2000d · DC-340: «Editar observação» depois de marcar (nx_agenda_obs_salvar; servidor sem a função → o botão some com o aviso). */
  let semObsSalvar = false;
  async function editarObservacao(c) {
    const antes = typeof c.obs === "string" ? c.obs : "";
    const campo = ui.campo({ rotulo: "Observação", nome: "observacao", tipo: "textarea", valor: antes, max: 200, placeholder: `Ex.: ${exemplosAgenda(ctx.vocab).obs}` });
    const r = await ui.modal({ titulo: `Observação da ${palavraCompromisso(ctx.vocab)}`,   // plano 2000d · GY-051
      largura: "p", corpo: h("div", { class: "pilha" }, campo),
      acoes: [{ rotulo: "Cancelar", tipo: "neutro", valor: false }, { rotulo: "Salvar", tipo: "primario", fn: async m => {
        const texto = String((campo.querySelector("textarea") || campo.querySelector("input")).value || "").trim().slice(0, 200);
        try { erroResposta(await api.rpcC("nx_agenda_obs_salvar", { p_negocio: c.negocio_id, p_inicio: c.inicio, p_texto: texto })); return { ok: true, texto }; }
        catch (e) {
          if (Lg && typeof Lg.rpcAusente === "function" && Lg.rpcAusente(e)) { semObsSalvar = true; m.erro("O servidor ainda não guarda a observação depois de marcar. Escreva uma nota no negócio."); return false; }
          m.erro(api.mensagemErro(e)); return false;
        }
      } }] });
    if (!(r && r.ok) || !vivo) return;
    notasLidas.delete(c.negocio_id);
    recarregar();
    comDesfazer(ui, { texto: r.texto ? "Observação salva" : "Observação apagada", reverter: async () => { erroResposta(await api.rpcC("nx_agenda_obs_salvar", { p_negocio: c.negocio_id, p_inicio: c.inicio, p_texto: antes })); recarregar(); } });
  }
  /** Plano 2000d · DC-331: «Marcar retorno» — a janela já abre na data do retorno (dentro do limite de dias à frente). */
  function marcarRetornoDetalhe(c) {
    const cfg = atual && atual.config;
    const n = Math.min(retornoEmDias(c, cfg, ctx.vocab), limiteDiasAgenda(cfg));
    const base = partesSP(c.inicio);
    const alvo = diaISO(base && base.dia > ui.hojeSP() ? base.dia : ui.hojeSP(), n);
    return abrirAgendamento({ ...c, inicio: null, consulta_em: null }, { dia: alvo });
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
  // plano 1500c · GX-022: marcou, remarcou ou desmarcou — o «Próximo livre» guardado (60 s) pode ter acabado de ser ocupado: é pedido de novo
  const recarregar = () => { livreCache = { em: 0, chave: "", slot: null, p: null }; return carregar({ silencioso: true, forcar: true }); };
  /** pre = consulta a remarcar (ou null); quando = {dia, hora} do clique na grade ou do «+» do dia */
  /** Marcou/remarcou pela janela: relê o período e o bloco da consulta confirma com o check (E5); o Desfazer (aoMudar(null)) só relê. */
  const aoMarcado = r => recarregar().then(() => {
    if (vivo && r && r.ok) confirmarNoBloco(r.negocio_id ?? (r.consulta && r.consulta.negocio_id), `${maiuscula(palavraCompromisso(ctx.vocab))} ${r.remarcada ? "remarcada" : "marcada"}`);   // plano 2000d · GY-049
  });
  /** CA-176/CA-178: «Avisar paciente» no aviso de marcar/desmarcar — a linha da agenda (já relida) dá o contato e o nome; nada é enviado sozinho. */
  const avisarPaciente = ctx.temModulo && ctx.temModulo("conversas") ? (info, tipo) => {
    const linha = atual && Array.isArray(atual.consultas) ? atual.consultas.find(x => x && info && x.negocio_id === info.negocio_id) : null;
    // o que veio do aviso (horário novo, serviço) vale; a linha relida completa o que faltar (contato, nome)
    const c = { ...(linha && tipo !== "desmarcacao" ? linha : {}), ...Object.fromEntries(Object.entries(info || {}).filter(([, v]) => v !== null && v !== undefined)) };
    // plano 2000d · DC-302: as palavras da vertical («Abra a ordem de serviço para falar com o cliente»)
    if (c.contato_id == null) { ui.toast(textoSemCanal("conversa", ctx.vocab), { tipo: "info" }); return; }
    lembrar(c, tipo);
  } : ctx.pode("atendente") ? (info, tipo) => {
    // plano 1500c · GX-034: sem o módulo Conversas, o aviso (confirmação, desmarcação, remarcação) abre o WhatsApp do aparelho (wa.me) com o
    // texto pronto — a pessoa confere e envia; antes o botão nem aparecia e o paciente não ficava sabendo
    const linha = atual && Array.isArray(atual.consultas) ? atual.consultas.find(x => x && info && x.negocio_id === info.negocio_id) : null;
    const c = { ...(linha || {}), ...Object.fromEntries(Object.entries(info || {}).filter(([, v]) => v !== null && v !== undefined)) };
    const fn = { confirmacao: textoConfirmacao, desmarcacao: textoDesmarcacao, remarcacao: textoRemarcacao, falta: textoFalta }[tipo] || textoLembrete;
    const link = linkWhatsAppAgenda(c.telefone, fn(c, ui.hojeSP(), { vocab: ctx.vocab || null, empresa: nomeEmpresa() }));   // plano 2000d · DC-301
    if (!link) { ui.toast(textoSemCanal("whatsapp", ctx.vocab), { tipo: "info" }); return; }   // plano 2000d · DC-302
    try { if (typeof globalThis.open === "function") globalThis.open(link, "_blank", "noopener"); } catch { /* janela bloqueada pelo navegador: nada a fazer */ }
  } : null;
  // plano 1500c · GX-019: dois toques rápidos em «Marcar» (ou N duas vezes) abriam duas janelas uma sobre a outra — uma de cada vez
  let marcando = false;
  const abrirAgendamento = (pre = null, quando = null) => {
    if (exemplo) { avisarExemplo(); return Promise.resolve(null); }   // plano 2000d · GY-063
    if (offline()) { ui.toast("Sem internet: marcar exige conexão. Assim que a conexão voltar, tente de novo.", { tipo: "info" }); return Promise.resolve(null); }
    if (marcando) return Promise.resolve(null);
    marcando = true;
    return Promise.resolve(marcarConsulta(ctx, { negocio: pre, dia: quando && quando.dia, hora: quando && quando.hora, base: data,
      config: atual && atual.config ? atual.config : null, avisar: avisarPaciente, encaixeAgora: !!(quando && quando.encaixeAgora),   // plano 1500c · CC-253
      busca: (quando && quando.busca) || "",                                                         // plano 2000d · DC-341
      consultas: atual && Array.isArray(atual.consultas) ? atual.consultas : [],                       // plano 2000d · DC-439: quem está na cadeira agora
      bloqueios: atual && Array.isArray(atual.bloqueios) ? atual.bloqueios : [],                       // plano 2000d · DC-352: o feriado do retorno
      aoBloquear: ctx.pode("admin") && quando && quando.dia && quando.hora ? bloquearHorario : null, aoMudar: aoMarcado }))
      .finally(() => { marcando = false; });
  };
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
    // plano 1500c · GX-056: os motivos mais comuns num toque (o campo continua livre)
    const inMotivo = motivo.querySelector("input");
    const chipsMotivo = h("div", { class: "ag-bloq-motivos", role: "group", "aria-label": "Motivos comuns" },
      MOTIVOS_BLOQUEIO.map(m => h("button", { type: "button", class: "ag-serv-chip ag-bloq-motivo", dataset: { motivo: m }, on: { click: () => { inMotivo.value = m; try { inMotivo.focus(); } catch { /* ok */ } } } }, m)));
    // plano 2000d · DC-402: sem parênteses e com a palavra da vertical
    const corpo = h("div", { class: "pilha ag-bloquear" }, h("p", null, `${nomeDia(dia, true)}. A equipe e a IA não marcam ${palavraCompromisso(ctx.vocab)} neste horário.`),
      h("label", { class: "ag-encaixe ag-bloq-dia-todo-rot" }, diaTodoChk, h("span", null, "Dia inteiro")), horas, motivo, chipsMotivo);
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
          m.erro(avisoConsultasNoBloqueio(caem, ed ? "Salvar bloqueio" : "Bloquear", palavraCompromisso(ctx.vocab)));   // plano 2000d · DC-286
          return false;
        }
        const p = { ...(ed && existente.id != null ? { id: existente.id } : {}), data: dia, ...(todo ? {} : { das: vDas, ate: vAte }), motivo: vMot || null };
        try { return erroResposta(await api.rpcC("nx_agenda_bloqueio_salvar", { p_bloqueio: p })); }
        catch (e) { m.erro(api.mensagemErro(e)); return false; }
      } },
    ].filter(Boolean) });
    if (!(r && r.ok) || !vivo) return;
    if (r.removido) { recarregar(); ui.toast("Bloqueio removido.", { tipo: "ok" }); return; }
    if (ed) {
      recarregar();
      // plano 2000d · DC-386: editar também tem «Desfazer» — regrava o trecho e o motivo de antes (pelo mesmo id)
      const ant = camposBloqueioDaGrade(existente, dia);
      if (existente.id != null && ant && typeof ui.acaoComDesfazer === "function")
        comDesfazer(ui, { texto: "Bloqueio atualizado.", reverter: async () => { erroResposta(await api.rpcC("nx_agenda_bloqueio_salvar", { p_bloqueio: { id: existente.id, ...ant } })); if (vivo) recarregar(); } });
      else ui.toast("Bloqueio atualizado.", { tipo: "ok" });
      return;
    }
    const texto = `Horário bloqueado: ${rotuloDoDia(dia, ui.hojeSP())}, ${diaTodoChk.checked ? "o dia inteiro" : `${das.querySelector("input").value}–${ate.querySelector("input").value}`}`;
    recarregar();
    // plano 1000b · CB-199: fechou o horário errado? «Desfazer» exclui o bloqueio criado (sem ir às Configurações)
    if (r.id != null && typeof ui.acaoComDesfazer === "function") {
      comDesfazer(ui, { texto, reverter: async () => { erroResposta(await api.rpcC("nx_agenda_bloqueio_excluir", { p_id: r.id })); if (vivo) recarregar(); } });
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
    const palP = palavraCompromisso(ctx.vocab);   // plano 2000d · GY-052: «visitas» na busca da oficina
    const campo = ui.campo({ rotulo: quemRot, nome: "paciente", tipo: "busca", placeholder: "Nome ou telefone", ajuda: `Mostra as próximas ${palP}s de quem tem o nome ou telefone.` });
    const input = campo.querySelector("input");
    // plano 1000b · CB-162: a lista NÃO é região viva (cada busca lia todos os nomes e datas); um status curto diz o resultado
    const lista = h("div", { class: "ag-procurar-lista" });
    const statusBusca = h("p", { class: "campo-ajuda ag-procurar-status", role: "status", "aria-live": "polite" });
    const dizer = t => { statusBusca.textContent = t || ""; };
    caixa.append(campo, statusBusca, lista);
    let fecharCom = null, seq = 0;
    const fichasLidas = new Map();   // CB-179
    let ultimaBusca = "";      // plano 1500c · GX-048: o texto da busca que está na tela
    async function buscar() {
      const q = input.value.trim();
      const minha = ++seq;
      ultimaBusca = q;
      ui.limpar(lista);
      dizer("");
      if (q.length < 2) { if (q.length) dizer(TEXTO_BUSCA_CURTA); return; }
      dizer("Procurando…");
      try {
        const r = await api.rpcC("nx_buscar", { p_q: termoBusca(q) });   // plano 1500c · GX-032: o telefone com máscara também acha
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
        if (!achadas.length && !ultimas.length) { dizer(negocios.length ? `Nenhuma ${palP} de hoje em diante para esse nome.` : "Ninguém com esse nome ou telefone."); return; }
        dizer(achadas.length ? `${achadas.length} ${achadas.length === 1 ? `${palP} encontrada` : `${palP}s encontradas`}.` : `Nenhuma ${palP} de hoje em diante para esse nome.`);
        for (const x of ultimas) {
          const nome = x.n.contato_nome || x.contato || x.n.titulo || quemRot;   // plano 2000d · DC-296: a palavra da vertical
          lista.appendChild(h("div", { class: "ag-procurar-item ag-procurar-ultima" },
            h("span", { class: "ag-procurar-txt" }, h("b", { class: "dado-pessoal" }, nome), h("small", { class: "dado" }, `${textoUltimaConsulta(x.em, x.presenca)}${x.n.titulo && x.n.titulo !== nome ? ` · ${x.n.titulo}` : ""}`)),
            // plano 2000d · DC-341: quem já foi atendido marca o retorno dali (negócio aberto: a janela já nele; fechado: a janela com a busca, «Já atendidos»)
            ctx.pode("atendente") ? h("button", { type: "button", class: "bt bt-sec bt-p ag-procurar-retorno", "aria-label": `Marcar retorno de ${nome}`,
              on: { click: () => { if (fecharCom) fecharCom({ retorno: x.n.status === "ganho" ? { busca: nome } : { negocio: { id: x.n.id, titulo: x.n.titulo || nome, nome, contato_id: x.n.contato_id ?? null } } }); } } }, "Marcar retorno") : null));
        }
        for (const x of achadas) {
          const nome = x.n.contato_nome || x.contato || x.n.titulo || quemRot;
          lista.appendChild(h("div", { class: "ag-procurar-item" },
            h("span", { class: "ag-procurar-txt" }, h("b", { class: "dado-pessoal" }, nome), h("small", { class: "dado" }, `${rotuloProximaFora({ inicio: x.em }, Date.now(), ui.hojeSP())}${x.n.titulo && x.n.titulo !== nome ? ` · ${x.n.titulo}` : ""}`)),
            h("button", { type: "button", class: "bt bt-sec bt-p", "aria-label": `Ir para a ${palP} de ${nome}`, on: { click: () => { if (fecharCom) fecharCom({ negocio_id: x.n.id, inicio: x.em }); } } }, "Ir para")));
        }
      } catch (e) { if (minha === seq) { ui.limpar(lista); dizer(""); lista.appendChild(h("p", { class: "agenda-erro", role: "alert" }, api.mensagemErro(e))); } }
    }
    const depois = ui.debounce(buscar, 300);
    input.addEventListener("input", depois);
    input.addEventListener("keydown", ev => {
      if (ev.key !== "Enter") return;
      ev.preventDefault();
      // plano 1500c · GX-048: com um resultado só já na tela, Enter vai direto para a consulta (sem caçar o «Ir para» com o Tab)
      const irs = lista.querySelectorAll(".ag-procurar-item:not(.ag-procurar-ultima) button");
      if (irs.length === 1 && input.value.trim() === ultimaBusca) { irs[0].click(); return; }
      if (depois.cancelar) depois.cancelar(); buscar();
    });
    const escolha = await ui.modal({ titulo: `Procurar ${PC.contato}`, corpo: caixa, largura: "p", protegerTexto: false,
      aoAbrir: a => { fecharCom = v => a.fechar(v); try { input.focus(); } catch { /* ok */ } },
      acoes: [{ rotulo: "Fechar", tipo: "neutro", valor: null }] });
    if (vivo && escolha && escolha.retorno) { abrirAgendamento(escolha.retorno.negocio || null, escolha.retorno.busca ? { busca: escolha.retorno.busca } : null); return; }   // plano 2000d · DC-341
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
    // plano 2000d · DC-295: o rótulo com a palavra da vertical (Marcar visita)
    ? ctx.comandos.registrar({ id: "agenda.marcar", rotulo: `Marcar ${palavraCompromisso(ctx.vocab)}`, palavras: "agenda consulta horário agendar", fazer: () => abrirAgendamento() }) : null;
  // CA-260: «Ir para a data…» na paleta (Agenda de 25/10 sem clicar semana a semana): abre o seletor de data do cabeçalho
  const desregistrarData = ctx.comandos && typeof ctx.comandos.registrar === "function"
    ? ctx.comandos.registrar({ id: "agenda.data", rotulo: "Ir para a data…", palavras: "agenda data dia ir calendario semana mes pular", icone: "calendario", fazer: irParaData }) : null;
  // plano 1500c · GX-036: «Minha agenda ⇄ todos os profissionais» pela paleta (Ctrl/⌘+K), sem procurar o seletor no resumo
  const desregistrarMinha = eu && ctx.comandos && typeof ctx.comandos.registrar === "function"
    ? ctx.comandos.registrar({ id: "agenda.minha", rotulo: "Agenda: alternar entre a minha agenda e todos os profissionais", palavras: "agenda minha meus profissional filtro todos",
      fazer: () => {
        if (!vivo) return;
        filtroProf = filtroProf === "eu" ? "todos" : "eu"; profEscolhido = true; legendaAtivos = new Set(); gravarPreferencias();
        if (atual) { desenhar(); anunciarPeriodo({ repetir: true }); }
        ui.toast(filtroProf === "eu" ? "Mostrando só a sua agenda." : "Mostrando todos os profissionais.", { tipo: "info" });
      } }) : null;
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
        ui.toast(atalhosLigados ? "Atalhos de uma tecla ligados (T, N, R, P, D, S, M, L, /, [ e ])."   /* plano 2000d · GY-055: R (atualizar) e P (procurar) também */ : "Atalhos de uma tecla desligados. Para ligar de novo, use a paleta (Ctrl+K).", { tipo: "info" });
      } });
  }
  function irParaData() {
    const s = ctl.seletor;
    if (!s || !vivo) return;
    try { s.focus({ preventScroll: false }); } catch { s.focus(); }
    try { if (typeof s.showPicker === "function") s.showPicker(); } catch { /* sem o seletor nativo: o campo já está com o foco */ }
  }
  // CA-263: a conexão caiu ou voltou — o «Marcar consulta» do cabeçalho acompanha
  // plano 2000d · DC-355: na volta da conexão, as presenças marcadas sem internet são enviadas
  const aoMudarConexao = () => { if (vivo) { montarCabecalho(); if (!offline()) enviarPresencasPendentes(); } };
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
    if (timerTentativa) { clearTimeout(timerTentativa); timerTentativa = null; }   // plano 2000d · DC-354
    clearTimeout(timerFiltro);                                                       // plano 2000d · DC-359
    desfazerAtual = null;                                                            // plano 2000d · DC-442: o Ctrl+Z não desfaz o que ficou de outra tela
    if (desarmarEngolir) desarmarEngolir();
    if (typeof desregistrar === "function") try { desregistrar(); } catch { /* ok */ }
    for (const f of [desregistrarData, desregistrarAtalhos, desregistrarMinha, ...desregistrarModos]) if (typeof f === "function") try { f(); } catch { /* ok */ }   // plano 1500c · GX-036
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
  if (vivo && !offline()) enviarPresencasPendentes();   // plano 2000d · DC-355: o que ficou de outra vez sem internet
  if (horaPedida && vivo) irParaHoraPedida(horaPedida);   // plano 1500c · RC-198
  // plano 2000d · CC-323 (pendência da frente sis): a rota #/agenda/tv chega com rota.partes[0] === "tv" — abre a tela da recepção direto
  if (vivo && ctx.rota && Array.isArray(ctx.rota.partes) && ctx.rota.partes[0] === "tv") abrirTV();
  return limpar;
}
