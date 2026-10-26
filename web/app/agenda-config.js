/* ============================================================
   ÓRBITA — Configurações da agenda · F8
   Horário, capacidade, duração e bloqueios por empresa.
   ============================================================ */

const DIAS = [
  ["0", "Domingo"], ["1", "Segunda-feira"], ["2", "Terça-feira"], ["3", "Quarta-feira"],
  ["4", "Quinta-feira"], ["5", "Sexta-feira"], ["6", "Sábado"],
];

export const secoesConfig = [
  // plano 1000 · AS-084: a Agenda mora com o CRM (as consultas são das oportunidades), não entre Números e Respostas do atendimento
  { id: "agenda", titulo: "Agenda", desc: "Horários, durações e dias fechados", grupo: "CRM", papelMin: "admin", modulo: "crm", icone: "calendario", montar: secaoAgenda },
];

const DIAS_CURTOS = ["dom", "seg", "ter", "qua", "qui", "sex", "sáb"];
const paraHoras = s => { const m = /^(\d{1,2}):(\d{2})$/.exec(String(s || "")); return m ? Number(m[1]) + Number(m[2]) / 60 : null; };
/** «8h», «8h30», «42h15». */
export function horasTxt(h) {
  const total = Math.round(Math.max(0, Number(h) || 0) * 60), hh = Math.floor(total / 60), mm = total % 60;
  return mm ? `${hh}h${String(mm).padStart(2, "0")}` : `${hh}h`;
}
/** Prévia da semana (pura, plano 50): por dia (segunda a domingo) as faixas abertas em horas decimais {a, d}, as pausas que caem dentro delas,
    as horas úteis do dia e o total da semana. Horário vazio ou inválido conta como fechado. */
export function previaSemana(horario, intervalos = []) {
  const pausas = (Array.isArray(intervalos) ? intervalos : []).map(f => [paraHoras(f && f[0]), paraHoras(f && f[1])]).filter(([a, b]) => a !== null && b !== null && b > a);
  const dias = [];
  let total = 0;
  // plano 2000d · DC-281: a faixa que passa da meia-noite (22:00–02:00) fica até as 24 h no dia e o resto (00–02) entra no dia seguinte
  const brutasDe = id => (horario && Array.isArray(horario[id]) ? horario[id] : []).map(f => [paraHoras(f && f[0]), paraHoras(f && f[1])]).filter(([a, b]) => a !== null && b !== null && a !== b);
  for (let i = 1; i <= 7; i++) {
    const id = String(i % 7), ontem = String((i + 6) % 7);
    const faixas = [...brutasDe(ontem).filter(([a, b]) => b < a && b > 0).map(([, b]) => [0, b]),
      ...brutasDe(id).map(([a, b]) => (b < a ? [a, 24] : [a, b]))].filter(([a, b]) => b > a).sort((x, y) => x[0] - y[0]);
    let horas = faixas.reduce((s, [a, b]) => s + (b - a), 0);
    for (const [pa, pb] of pausas) for (const [a, b] of faixas) horas -= Math.max(0, Math.min(b, pb) - Math.max(a, pa));   // a pausa só desconta o que cai dentro da faixa
    total += horas;
    dias.push({ id, nome: DIAS_CURTOS[Number(id)], fechado: !faixas.length, horas,
      faixas: faixas.map(([a, b]) => ({ a, d: b - a })), pausas: faixas.length ? pausas.map(([a, b]) => ({ a, d: b - a })) : [] });
  }
  return { dias, total };
}
/** Desenha a prévia (sete colunas de 0 a 24 h) a partir do que previaSemana devolve. */
export function montarPreviaSemana(h, previa) {
  // CA-277: as colunas são desenho (aria-hidden); quem usa leitor de tela recebe a mesma informação numa tabela (dia → horas)
  const el = h("div", { class: "agc-previa", role: "group", "aria-label": `Prévia da semana: ${horasTxt(previa.total)} de atendimento` });
  el.appendChild(h("div", { class: "agc-previa-cab" }, h("b", null, "Prévia da semana"),
    h("span", { class: "agc-previa-total" }, h("b", { class: "dado" }, horasTxt(previa.total)), " de atendimento por semana")));
  el.appendChild(h("table", { class: "sr-only agc-previa-tabela" },
    h("caption", null, "Horas de atendimento por dia"),
    h("thead", null, h("tr", null, h("th", { scope: "col" }, "Dia"), h("th", { scope: "col" }, "Atendimento"))),
    h("tbody", null, previa.dias.map(d => h("tr", null, h("th", { scope: "row" }, DIAS[Number(d.id)][1]), h("td", null, d.fechado ? "fechado" : horasTxt(d.horas)))))));
  el.appendChild(h("div", { class: "agc-previa-dias", "aria-hidden": "true" }, previa.dias.map(d => h("div", { class: ["agc-previa-dia", d.fechado && "fechado"] },
    h("span", null, d.nome),
    h("div", { class: "agc-previa-col" },
      [6, 12, 18].map(hh => h("i", { class: "agc-previa-marca", style: { "--h": String(hh) } })),
      d.faixas.map(f => h("i", { class: "agc-previa-faixa", style: { "--a": f.a.toFixed(3), "--d": f.d.toFixed(3) } })),
      d.pausas.map(p => h("i", { class: "agc-previa-pausa", style: { "--a": p.a.toFixed(3), "--d": p.d.toFixed(3) } }))),
    h("small", { class: "dado" }, d.fechado ? "—" : horasTxt(d.horas))))));
  return el;
}

/** Plano 1000 · CA-207: o primeiro par de faixas que se sobrepõe no mesmo dia ([["08:00","12:00"],["11:00","14:00"]] → os dois), ou null. */
export function faixasSobrepostas(faixas) {
  const ord = (Array.isArray(faixas) ? faixas : []).filter(f => f && f[0] && f[1]).slice().sort((a, b) => (a[0] < b[0] ? -1 : a[0] > b[0] ? 1 : 0));
  for (let i = 1; i < ord.length; i++) if (ord[i][0] < ord[i - 1][1]) return [ord[i - 1], ord[i]];
  return null;
}
/** Plano 1000b · CB-161: um bloqueio salvo ({inicio, fim, motivo}) → os campos da janela {data, data_fim, das, ate, motivo} no fuso de São Paulo.
    Dia inteiro (00:00 → 00:00): sem horários; data_fim só quando passa de um dia. */
export function camposDoBloqueio(b) {
  const fmt = new Intl.DateTimeFormat("en-CA", { timeZone: "America/Sao_Paulo", year: "numeric", month: "2-digit", day: "2-digit", hour: "2-digit", minute: "2-digit", hourCycle: "h23" });
  const partes = ms => { const p = Object.fromEntries(fmt.formatToParts(new Date(ms)).map(x => [x.type, x.value])); return { dia: `${p.year}-${p.month}-${p.day}`, hora: `${p.hour}:${p.minute}` }; };
  const i = Date.parse(b && b.inicio), f = Date.parse(b && b.fim);
  if (!Number.isFinite(i) || !Number.isFinite(f) || f <= i) return { data: "", data_fim: "", das: "", ate: "", motivo: (b && b.motivo) || "" };
  const a = partes(i), z = partes(f), ultimo = partes(f - 1);
  const diaInteiro = a.hora === "00:00" && z.hora === "00:00";
  return { data: a.dia, data_fim: diaInteiro && ultimo.dia !== a.dia ? ultimo.dia : "", das: diaInteiro ? "" : a.hora, ate: diaInteiro ? "" : z.hora, motivo: (b && b.motivo) || "" };
}
/** CA-211: a data inicial do bloqueio não pode ter passado (o bloqueio de ontem não aparece na lista e confunde). */
export function dataBloqueioPassada(data, hoje) { return !!data && !!hoje && String(data) < String(hoje); }
/** Plano 1000b · CB-146: as leituras da agenda para conferir um bloqueio longo — blocos de até 31 dias (o limite da nx_agenda_dia) até a data
    final, no máximo 6 (≈ 6 meses). → [{p_data, p_dias}] */
export function blocosDeLeitura(data, dataFim = null, max = 6) {
  const total = Math.max(1, Math.round((Date.parse(`${dataFim || data}T12:00:00Z`) - Date.parse(`${data}T12:00:00Z`)) / 864e5) + 1);
  const out = [];
  for (let feito = 0; feito < total && out.length < max; feito += 31) out.push({ p_data: somarDias(data, feito), p_dias: Math.min(31, total - feito) });
  return out;
}
/** Plano 1000b · CB-160: o nome do serviço sem caixa nem acento (a mesma regra do normServico da agenda.js). */
export const chaveServico = s => String(s || "").trim().normalize("NFD").replace(/[̀-ͯ]/g, "").toLocaleLowerCase("pt-BR");
/** CA-210: as consultas que caem no período do bloqueio — dias [data, data_fim] e, com horário, só as que cruzam [das, ate). */
export function consultasNoBloqueio(consultas, { data, data_fim = null, das = null, ate = null, duracao = 30 } = {}) {
  const fim = data_fim || data;
  const fmt = new Intl.DateTimeFormat("en-CA", { timeZone: "America/Sao_Paulo", year: "numeric", month: "2-digit", day: "2-digit", hour: "2-digit", minute: "2-digit", hourCycle: "h23" });
  return (Array.isArray(consultas) ? consultas : []).filter(c => {
    const t = Date.parse(c && c.inicio);
    if (!Number.isFinite(t)) return false;
    const p = Object.fromEntries(fmt.formatToParts(new Date(t)).map(x => [x.type, x.value]));
    const dia = `${p.year}-${p.month}-${p.day}`, hora = `${p.hour}:${p.minute}`;
    if (dia < data || dia > fim) return false;
    if (!das || !ate) return true;
    const tf = Date.parse(c.fim);
    // plano 1000b · CB-147: consulta sem fim ocupa a duração padrão (antes contava como um instante: 07:30 sem fim «não caía» em 08–10)
    const fimMs = Number.isFinite(tf) ? tf : t + Math.max(5, Number(duracao) || 30) * 60000;
    const q = Object.fromEntries(fmt.formatToParts(new Date(fimMs)).map(x => [x.type, x.value]));
    const horaFim = `${q.year}-${q.month}-${q.day}` > dia ? "24:00" : `${q.hour}:${q.minute}`;
    return hora < ate && (horaFim > das || hora >= das);
  });
}

/** Plano 1500c · CC-166/CC-285: o que gravar para um bloqueio da janela. O servidor, com horário, usa só a data inicial (ignora a final): «12 às 13
    de 01 a 05/11» vira UM bloqueio por dia (até 62 dias). Sem horário, um só (o servidor fecha o período inteiro). → [{data, das?, ate?, motivo}] */
export function bloqueiosDoPeriodo({ data, data_fim = null, das = null, ate = null, motivo = null } = {}) {
  if (!data) return [];
  const m = motivo || null;
  if (!das || !ate) return [{ data, ...(data_fim && data_fim > data ? { data_fim } : {}), motivo: m }];
  const fim = data_fim && data_fim > data ? data_fim : data;
  const out = [];
  for (let d = data; d <= fim && out.length < 62; d = somarDias(d, 1)) out.push({ data: d, das, ate, motivo: m });
  return out;
}
/** Plano 1500c · CC-185: roda `fn` nos itens com no máximo `limite` ao mesmo tempo (os erros ficam com `fn`). */
export async function emParalelo(itens, limite, fn) {
  const lista = Array.isArray(itens) ? itens : [];
  let i = 0, ativos = 0, pico = 0;
  const trab = async () => { while (i < lista.length) { const it = lista[i++]; ativos++; pico = Math.max(pico, ativos); try { await fn(it); } catch { /* quem chama trata */ } finally { ativos--; } } };
  await Promise.all(Array.from({ length: Math.max(1, Math.min(Number(limite) || 1, lista.length)) }, trab));
  return pico;
}
/** Plano 1500c · CC-296: o servidor recusa bloqueio com mais de 1 ano (366 dias) — a janela avisa antes. */
export function bloqueioLongoDemais(data, dataFim) {
  if (!data || !dataFim) return false;
  return Math.round((Date.parse(`${dataFim}T12:00:00Z`) - Date.parse(`${data}T12:00:00Z`)) / 864e5) > 366;
}
/** Plano 1500c · CC-297: as recusas do servidor nos bloqueios em português claro (código → texto); null = a mensagem padrão. */
export function mensagemBloqueio(e) {
  const c = e && (e.codigo || e.erro || e.message);
  if (c === "limite_atingido") return "Há 500 bloqueios futuros (o limite). Exclua os antigos ou use Pausas para horários fixos.";
  if (c === "dados_invalidos" && e && e.hint === "data_fim") return "O bloqueio pode ter no máximo 1 ano.";
  return null;
}
/** Plano 1500c · CC-230: as consultas que ficam FORA do novo horário (dia desligado ou fora das faixas), para avisar antes de salvar. */
export function consultasForaDoHorario(consultas, horario, duracao = 30, intervalos = []) {
  // plano 2000d · DC-282: a consulta que cai numa pausa (o almoço novo) também fica fora do atendimento
  const minP = s => { const m = /^(\d{1,2}):(\d{2})$/.exec(String(s || "")); return m ? Number(m[1]) * 60 + Number(m[2]) : null; };
  const pausas = (Array.isArray(intervalos) ? intervalos : []).map(f => [minP(f && f[0]), minP(f && f[1])]).filter(([a, b]) => a !== null && b !== null && b > a);
  if (!horario || typeof horario !== "object") return [];
  const fmt = new Intl.DateTimeFormat("en-CA", { timeZone: "America/Sao_Paulo", year: "numeric", month: "2-digit", day: "2-digit", hour: "2-digit", minute: "2-digit", hourCycle: "h23", weekday: "short" });
  const DS = { Sun: 0, Mon: 1, Tue: 2, Wed: 3, Thu: 4, Fri: 5, Sat: 6 };
  const min = s => { const m = /^(\d{1,2}):(\d{2})$/.exec(String(s || "")); return m ? Number(m[1]) * 60 + Number(m[2]) : null; };
  return (Array.isArray(consultas) ? consultas : []).filter(c => {
    const t = Date.parse(c && c.inicio);
    if (!Number.isFinite(t)) return false;
    const p = Object.fromEntries(fmt.formatToParts(new Date(t)).map(x => [x.type, x.value]));
    const ini = Number(p.hour) * 60 + Number(p.minute);
    const tf = Date.parse(c.fim);
    const fim = ini + Math.max(5, Number.isFinite(tf) && tf > t ? Math.round((tf - t) / 60000) : Number(duracao) || 30);
    const faixas = (Array.isArray(horario[String(DS[p.weekday])]) ? horario[String(DS[p.weekday])] : []).map(f => [min(f && f[0]), min(f && f[1])]).filter(f => f[0] !== null && f[1] !== null);
    return !faixas.some(([a, b]) => ini >= a && fim <= b) || pausas.some(([a, b]) => ini < b && fim > a);
  });
}
/** Plano 1500c · CC-233: feriados do estado de São Paulo (Revolução Constitucionalista, 9 de julho) — a Consciência Negra já é nacional. */
export function feriadosEstaduaisSP(ano) { return [{ data: `${ano}-07-09`, nome: "Revolução Constitucionalista (SP)" }]; }

/** Plano 1500c · GX-060: as pausas que não cruzam NENHUM horário de atendimento (19:00–20:00 numa agenda que fecha às 18h) — salvas, não mudam nada. */
export function pausasSemEfeito(horario, pausas) {
  const min = s => { const m = /^(\d{1,2}):(\d{2})$/.exec(String(s || "")); return m ? Number(m[1]) * 60 + Number(m[2]) : null; };
  const faixas = Object.values(horario && typeof horario === "object" ? horario : {}).flatMap(l => (Array.isArray(l) ? l : [])).map(f => [min(f && f[0]), min(f && f[1])]).filter(([a, b]) => a !== null && b !== null && b > a);
  if (!faixas.length) return [];
  return (Array.isArray(pausas) ? pausas : []).filter(p => { const a = min(p && p[0]), b = min(p && p[1]); return a !== null && b !== null && b > a && !faixas.some(([x, y]) => a < y && b > x); });
}
/** Plano 1500c · GX-071: o erro de um número da configuração em português claro — «2,5» ou «2.5» pede número inteiro (antes: «deve ficar entre…»). */
export function erroNumeroInteiro(bruto, rotulo, min, max) {
  const t = String(bruto ?? "").trim();
  if (!t) return `${rotulo}: preencha um número de ${min} a ${max}.`;
  if (/^\d+[.,]\d+$/.test(t)) return `${rotulo}: use um número inteiro (sem vírgula), de ${min} a ${max}.`;
  return null;
}
/** Plano 1500c · GX-066: «Manhã» e «Tarde» do dia escolhido pelo horário configurado (sem horário: 08–12 e 12–18). → {manha:[das, ate], tarde:[das, ate]} */
export function meiosDoDia(horario, data, intervalos = []) {
  const dds = /^\d{4}-\d{2}-\d{2}$/.test(String(data || "")) ? new Date(`${data}T12:00:00Z`).getUTCDay() : null;
  const faixas = (dds !== null && horario && Array.isArray(horario[String(dds)]) ? horario[String(dds)] : []).filter(f => f && f[0] && f[1] && f[0] < f[1]).slice().sort((a, b) => (a[0] < b[0] ? -1 : 1));
  const ini = faixas.length ? faixas[0][0] : "08:00", fim = faixas.length ? faixas[faixas.length - 1][1] : "18:00";
  const almoco = (Array.isArray(intervalos) ? intervalos : []).find(p => p && p[0] && p[1] && p[0] >= "11:00" && p[0] <= "14:00");
  const corte = almoco ? almoco[0] : "12:00", volta = almoco ? almoco[1] : "12:00";
  return { manha: [ini < corte ? ini : "08:00", corte], tarde: [volta < fim ? volta : "12:00", fim > volta ? fim : "18:00"] };
}
/** Plano 1500c · GX-067/GX-068: o dia (São Paulo) de um instante, para o link #/agenda?dia=…; "" se não vale. */
export function diaSP(iso) { const t = Date.parse(iso); return Number.isFinite(t) ? _diaSP.format(new Date(t)) : ""; }
/** GX-067/GX-068: o início mais cedo de uma lista de consultas. */
export function primeiraDe(consultas) {
  return (Array.isArray(consultas) ? consultas : []).map(c => c && c.inicio).filter(x => Number.isFinite(Date.parse(x))).sort((a, b) => Date.parse(a) - Date.parse(b))[0] || null;
}
/** Plano 1500c · GX-056: os motivos de bloqueio mais comuns (chips na janela de bloqueio das Configurações; os mesmos da grade). */
export const MOTIVOS_BLOQUEIO_CFG = Object.freeze(["Feriado", "Folga", "Férias", "Reunião", "Manutenção"]);

/** Plano 1000b · CB-154: tira a linha e leva o foco para o «remover» da linha anterior (ou da seguinte); lista vazia → `reserva()` (o «Adicionar…»). */
export function removerComFoco(linha, reserva = null) {
  const pai = linha && linha.parentNode;
  const irmas = pai ? [...pai.children] : [];
  const i = irmas.indexOf(linha);
  const vizinha = irmas[i - 1] || irmas[i + 1] || null;
  if (linha) linha.remove();
  const alvo = (vizinha && (vizinha.querySelector(".agc-remover") || vizinha.querySelector("input"))) || (typeof reserva === "function" ? reserva() : null);
  if (alvo) try { alvo.focus(); } catch { /* ok */ }
  return alvo;
}
function listaFaixas(h, ui, dia, faixas, habilitado, aoEsvaziar = null) {
  const caixa = h("div", { class: "agc-faixas", hidden: !habilitado });
  const linhas = h("div", { class: "agc-faixas-linhas" });   // as faixas ficam antes dos botões (adicionar não cai depois de «Adicionar horário»)
  function adicionar([de = "08:00", ate = "18:00"] = []) {
    const inicio = h("input", { type: "time", value: de, step: 300, "aria-label": `${dia}: início do horário` });
    const fim = h("input", { type: "time", value: ate, step: 300, "aria-label": `${dia}: fim do horário` });
    // plano 1500c · GX-070: tirar a ÚLTIMA faixa fecha o dia (antes o dia ficava «ligado» sem horário e o Salvar reclamava)
    const remover = h("button", { type: "button", class: "bt-icone agc-remover", "aria-label": `Remover faixa de ${dia}`, on: { click: () => {
      removerComFoco(linha, () => add);
      if (!linhas.querySelector(".agc-faixa") && typeof aoEsvaziar === "function") aoEsvaziar();
    } } }, ui.icone("fechar"));   // CB-154
    const linha = h("div", { class: "agc-faixa" }, inicio, h("span", null, "até"), fim, remover);
    linhas.appendChild(linha);
  }
  // plano 2000d · DC-283: com 2 faixas o «Adicionar horário» fica indisponível e diz o porquê
  const travarAdd = () => {
    const cheio = linhas.querySelectorAll(".agc-faixa").length >= MAX_FAIXAS_DIA;
    add.setAttribute("aria-disabled", String(cheio));
    add.title = cheio ? `No máximo ${MAX_FAIXAS_DIA} faixas por dia. Para o almoço, use as Pausas.` : "";
  };
  const add = h("button", { type: "button", class: "bt bt-fant bt-p agc-add-faixa", on: { click: () => {
    if (add.getAttribute("aria-disabled") === "true") { if (ui.toast) ui.toast(add.title, { tipo: "info" }); return; }
    adicionar(); travarAdd();
    // plano 2000d · GY-082: o foco vai para o início da faixa nova (antes ficava no botão e quem usa teclado voltava com Shift+Tab)
    const nova = linhas.querySelectorAll(".agc-faixa"); const inp = nova.length ? nova[nova.length - 1].querySelector("input") : null;
    if (inp) try { inp.focus(); } catch { /* ok */ }
  } } }, ui.icone("mais"), "Adicionar horário");
  linhas.addEventListener("click", () => setTimeout(travarAdd, 0));   // remover uma faixa destrava
  for (const faixa of faixas) adicionar(faixa);
  travarAdd();
  const botoes = h("div", { class: "agc-faixas-bts" }, add);
  caixa.append(linhas, botoes);
  return { caixa, botoes, adicionar,
    ler: () => [...caixa.querySelectorAll(".agc-faixa")].map(l => [l.querySelector("input").value, l.querySelectorAll("input")[1].value]),
    /** CA-208: troca as faixas do dia pelas de outro (copiar para os dias úteis). */
    definir: novas => { ui.limpar(linhas); for (const f of novas || []) adicionar(f); travarAdd(); } };
}

/** Plano 2000d · DC-283: quantas faixas um dia aceita (o nx_agenda_config_salvar recusa a 3ª). */
export const MAX_FAIXAS_DIA = 2;
/** Plano 1000 · CA-279: o que está errado nas faixas de um dia ligado → {indice, campo: "inicio"|"fim"|null, msg} ou null (tudo certo). */
export function problemaDasFaixas(faixas) {
  const lista = Array.isArray(faixas) ? faixas : [];
  if (!lista.length) return { indice: -1, campo: null, msg: "adicione pelo menos uma faixa de horário ou desligue o dia." };
  // plano 2000d · DC-283: o servidor aceita no máximo 2 faixas por dia — o aviso vem antes de salvar (e o «Adicionar horário» trava na 2ª)
  if (lista.length > MAX_FAIXAS_DIA) return { indice: MAX_FAIXAS_DIA, campo: "inicio", msg: `no máximo ${MAX_FAIXAS_DIA} faixas por dia (use as Pausas para o intervalo).` };
  for (const [i, f] of lista.entries()) {
    const [a, b] = Array.isArray(f) ? f : [];
    if (!a) return { indice: i, campo: "inicio", msg: "preencha o início de cada faixa." };
    if (!b) return { indice: i, campo: "fim", msg: "preencha o fim de cada faixa." };
    if (a >= b) return { indice: i, campo: "fim", msg: `o fim (${b}) precisa ser depois do início (${a}).` };
  }
  return null;
}
/** CA-275: o passo dos horários maior que a duração padrão deixa buracos sem oferta — o aviso explica (null = nada a dizer). */
/** Plano 2000d · GY-086: a palavra do compromisso da vertical (consulta/visita/entrega) — «consulta» sem vocab. */
export function palavraDaAgenda(vocab = null) { return vocab && typeof vocab.min === "function" && vocab.compromisso ? vocab.min("compromisso") : "consulta"; }
// plano 2000d · GY-089: a palavra da vertical no aviso do passo («a visita padrão dura 60 min»)
export function avisoPassoDuracao(passo, duracao, palavra = "consulta") {
  const p = Number(passo), d = Number(duracao);
  if (!Number.isInteger(p) || !Number.isInteger(d) || p <= 0 || d <= 0 || p <= d) return null;
  return `Os horários saem a cada ${p} min, mas a ${palavra} padrão dura ${d} min: sobram ${p - d} min sem horário oferecido entre uma ${palavra} e outra.`;
}

/** Plano 2000d · DC-387: o mês do início do bloqueio em São Paulo («2026-11»), a conta por mês e o nome («Novembro de 2026»). */
export function mesDoBloqueio(b) { const t = Date.parse(b && b.inicio); return Number.isFinite(t) ? _diaSP.format(new Date(t)).slice(0, 7) : ""; }
export function contarPorMes(bloqueios) {
  const m = new Map();
  for (const b of Array.isArray(bloqueios) ? bloqueios : []) { const k = mesDoBloqueio(b); if (k) m.set(k, (m.get(k) || 0) + 1); }
  return m;
}
const MESES = ["Janeiro", "Fevereiro", "Março", "Abril", "Maio", "Junho", "Julho", "Agosto", "Setembro", "Outubro", "Novembro", "Dezembro"];
export function nomeMes(am) { const [a, m] = String(am || "").split("-").map(Number); return a && m ? `${MESES[m - 1]} de ${a}` : ""; }
/** Plano 2000d · DC-349/DC-433: os pontos facultativos móveis (pela Páscoa): Carnaval (segunda e terça) e Corpus Christi. */
export function pontosFacultativos(ano) {
  const p = pascoa(ano);
  return [{ data: somarDias(p, -48), nome: "Carnaval (segunda)" }, { data: somarDias(p, -47), nome: "Carnaval (terça)" }, { data: somarDias(p, 60), nome: "Corpus Christi" }];
}
/** Plano 2000d · DC-350: em novembro e dezembro, os feriados do ano seguinte ao próximo (o bloqueio em lote vai até dez do ano que vem)
    ainda sem bloqueio? → «Os feriados de 2028 ainda não estão bloqueados.» ou null. Só para quem já usa o bloqueio de feriados. */
export function avisoRenovarFeriados(hoje, bloqueios = []) {
  const ano = Number(String(hoje).slice(0, 4)), mes = Number(String(hoje).slice(5, 7));
  if (!Number.isInteger(ano) || mes < 11) return null;
  const lista = Array.isArray(bloqueios) ? bloqueios : [];
  const nomes = new Set(feriadosNacionais(ano + 1).map(f => f.nome));
  if (!lista.some(b => b && nomes.has(String(b.motivo || "").trim()))) return null;     // nunca bloqueou feriado: nada a lembrar
  const proximo = feriadosParaBloquear(`${ano + 1}-01-01`, lista).filter(f => f.data.startsWith(String(ano + 1)));
  return proximo.length ? `Os feriados de ${ano + 1} ainda não estão bloqueados.` : null;
}
/* CA-258: feriados nacionais (lei 662/1949, 6.802/1980, 14.759/2023 e a Sexta-feira Santa, móvel). Carnaval e Corpus Christi são ponto
   facultativo e ficam de fora (cada clínica decide). */
const FERIADOS_FIXOS = [["01-01", "Confraternização Universal"], ["04-21", "Tiradentes"], ["05-01", "Dia do Trabalho"], ["09-07", "Independência do Brasil"],
  ["10-12", "Nossa Senhora Aparecida"], ["11-02", "Finados"], ["11-15", "Proclamação da República"], ["11-20", "Dia da Consciência Negra"], ["12-25", "Natal"]];
/** Domingo de Páscoa (calendário gregoriano, algoritmo de Meeus) → "AAAA-MM-DD". */
export function pascoa(ano) {
  const a = ano % 19, b = Math.floor(ano / 100), c = ano % 100, d = Math.floor(b / 4), e = b % 4, f = Math.floor((b + 8) / 25), g = Math.floor((b - f + 1) / 3);
  const hh = (19 * a + b - d - g + 15) % 30, i = Math.floor(c / 4), k = c % 4, l = (32 + 2 * e + 2 * i - hh - k) % 7, m = Math.floor((a + 11 * hh + 22 * l) / 451);
  const mes = Math.floor((hh + l - 7 * m + 114) / 31), dia = ((hh + l - 7 * m + 114) % 31) + 1;
  return `${ano}-${String(mes).padStart(2, "0")}-${String(dia).padStart(2, "0")}`;
}
const somarDias = (iso, n) => { const [a, m, d] = iso.split("-").map(Number); const t = new Date(Date.UTC(a, m - 1, d + n, 12)); return t.toISOString().slice(0, 10); };
/** Os feriados nacionais do ano, em ordem: [{data, nome}]. */
export function feriadosNacionais(ano) {
  const lista = FERIADOS_FIXOS.map(([md, nome]) => ({ data: `${ano}-${md}`, nome }));
  lista.push({ data: somarDias(pascoa(ano), -2), nome: "Sexta-feira Santa" });
  return lista.sort((x, y) => (x.data < y.data ? -1 : 1));
}
const _diaSP = new Intl.DateTimeFormat("en-CA", { timeZone: "America/Sao_Paulo", year: "numeric", month: "2-digit", day: "2-digit" });
/** CA-258: os feriados de hoje até 31/12 do ano seguinte que ainda não têm bloqueio tocando o dia (nenhum duplicado). */
export function feriadosParaBloquear(hoje, bloqueios = [], { estado = null, cidade = null, facultativos = false } = {}) {
  const ano = Number(String(hoje).slice(0, 4));
  if (!Number.isInteger(ano)) return [];
  const dias = (Array.isArray(bloqueios) ? bloqueios : []).map(b => {
    const i = Date.parse(b && b.inicio), f = Date.parse(b && b.fim);
    return Number.isFinite(i) && Number.isFinite(f) && f > i ? [_diaSP.format(new Date(i)), _diaSP.format(new Date(f - 1))] : null;
  }).filter(Boolean);
  // plano 1500c · CC-233: com estado = "SP", o 9 de julho; com cidade = {md: "MM-DD", nome}, o feriado da cidade (data fixa), nos dois anos
  // plano 2000d · DC-349: com facultativos, Carnaval (seg e ter) e Corpus Christi
  const extras = a => [...(estado === "SP" ? feriadosEstaduaisSP(a) : []), ...(facultativos ? pontosFacultativos(a) : []),
    ...(cidade && /^\d{2}-\d{2}$/.test(String(cidade.md || "")) ? [{ data: `${a}-${cidade.md}`, nome: String(cidade.nome || "Feriado da cidade").slice(0, 60) }] : [])];
  const todos = [...feriadosNacionais(ano), ...extras(ano), ...feriadosNacionais(ano + 1), ...extras(ano + 1)].sort((x, y) => (x.data < y.data ? -1 : x.data > y.data ? 1 : 0));
  const vistos = new Set();
  return todos.filter(x => { if (vistos.has(x.data)) return false; vistos.add(x.data); return x.data >= hoje && !dias.some(([a, b]) => a <= x.data && x.data <= b); });
}

function linhaIntervalo(h, ui, de = "12:00", ate = "13:00", rotulo = "Intervalo", reserva = null) {
  const inicio = h("input", { type: "time", value: de, step: 300, "aria-label": `${rotulo}: início` });
  const fim = h("input", { type: "time", value: ate, step: 300, "aria-label": `${rotulo}: fim` });
  const linha = h("div", { class: "agc-faixa" }, inicio, h("span", null, "até"), fim,
    h("button", { type: "button", class: "bt-icone agc-remover", "aria-label": `Remover ${rotulo.toLowerCase()}`, on: { click: () => removerComFoco(linha, reserva) } }, ui.icone("fechar")));   // CB-154
  return linha;
}

/** Plano 1500c · GX-057: um ouvinte de «beforeunload» por vez (o da seção montada agora). */
let saidaAtual = null;
let secaoViva = null;     // plano 1500c · GX-072: a montagem da seção que está na tela (o «Descartar» remonta)
function trocarAvisoSaida(fn) {
  if (saidaAtual && typeof removeEventListener === "function") removeEventListener("beforeunload", saidaAtual);
  saidaAtual = fn || null;
  if (saidaAtual && typeof addEventListener === "function") addEventListener("beforeunload", saidaAtual);
}

async function secaoAgenda(ctx, alvo) {
  const { ui, api } = ctx;
  const h = ui.h;
  ui.carregarCss("agenda");
  ui.limpar(alvo);
  alvo.appendChild(ui.esqueleto("cartoes", 2));
  let estado;
  try { estado = await api.rpcC("nx_agenda_config_ver", {}); }
  catch (e) { ui.limpar(alvo); alvo.appendChild(ui.erroCartao(e, () => secaoAgenda(ctx, alvo))); return; }

  const cfg = estado.config || {};
  const raiz = h("div", { class: "agc" });
  const top = h("header", { class: "pilha" },
    h("h2", { class: "titulo-sec" }, "Agenda e horários"),
    h("p", { class: "sub" }, "Defina quando sua equipe atende, quanto tempo cada serviço ocupa e quando a agenda deve ficar fechada."));
  alvo.replaceChildren(top, raiz);
  // CA-213: mudou algo e ainda não salvou? Trocar de seção ou de tela pergunta antes (config.js lê pendente/podeSair)
  let sujo = false, barraSujo = null;
  const marcarSujo = () => { sujo = true; if (barraSujo) barraSujo.hidden = false; };   // CB-202: a barra fixa aparece
  // plano 1500c · GX-057: fechar a aba (ou recarregar) com horários não salvos pergunta — a guarda de rota só valia dentro do app
  const avisoSaida = ev => { if (!sujo) return; ev.preventDefault(); ev.returnValue = ""; return ""; };
  const tirarAvisoSaida = () => { if (saidaAtual === avisoSaida) trocarAvisoSaida(null); };
  trocarAvisoSaida(avisoSaida);     // remontar a seção troca o ouvinte (nunca dois)

  const usarAgenda = ui.campo({ tipo: "interruptor", nome: "usar_horario", rotulo: "Definir horários nesta agenda", valor: cfg.horario_fonte === "agenda" });
  // plano 1000b · CB-180: a ajuda acompanha o interruptor (antes ficava «os horários vêm do departamento» mesmo depois de ligar)
  const ajudaFonte = h("p", { class: "campo-ajuda agc-fonte-ajuda", id: "agc-fonte-ajuda", "aria-live": "polite" });
  const textoFonte = ligado => (ligado ? "Os horários abaixo valem para a agenda (e para a IA que marca consultas)."
    : cfg.horario_fonte === "padrao" ? "Desligado: vale o padrão de segunda a sexta, das 8h às 18h." : "Desligado: a agenda usa o horário do departamento padrão.");
  const gradeDias = h("div", { class: "agc-dias" });
  const controlesDia = [];
  for (const [id, nome] of DIAS) {
    const atual = cfg.horario && cfg.horario[id];
    const faixas = Array.isArray(atual) ? atual : [];
    const ligada = ui.campo({ tipo: "interruptor", nome: `dia_${id}`, rotulo: nome, valor: faixas.length > 0 });
    // plano 1500c · GX-069: o dia desligado diz «Fechado» (o interruptor sozinho não dizia o que significa)
    const fechadoTxt = h("small", { class: "agc-dia-fechado", hidden: faixas.length > 0 }, "Fechado");
    const inLigada = ligada.querySelector("input");
    const linhas = listaFaixas(h, ui, nome, faixas, faixas.length > 0, () => {   // GX-070
      inLigada.checked = false; linhas.caixa.hidden = true; fechadoTxt.hidden = false;
      try { inLigada.focus(); } catch { /* ok */ }
      ui.toast(`${nome} ficou fechado (sem nenhum horário).`, { tipo: "info" });
    });
    inLigada.addEventListener("change", ev => {
      linhas.caixa.hidden = !ev.target.checked;
      fechadoTxt.hidden = !!ev.target.checked;
      if (ev.target.checked && !linhas.caixa.querySelector(".agc-faixa")) linhas.adicionar();
    });
    // CA-208: o horário de um dia vai para segunda a sexta num toque (configurar a semana não exige repetir as faixas 5 vezes)
    // plano 1500c · CC-231: «Copiar para…» escolhe os dias (quem atende de terça a sábado também copia num toque)
    linhas.botoes.appendChild(h("button", { type: "button", class: "bt bt-fant bt-p agc-copiar", "aria-haspopup": "dialog", on: { click: () => escolherDiasCopia(id) } }, "Copiar para…"));
    const erroDia = h("p", { class: "agc-erro-dia", role: "alert", hidden: true });   // CA-207/CA-279: o erro aparece no próprio dia
    gradeDias.appendChild(h("div", { class: "agc-dia", dataset: { dia: id } }, ligada, fechadoTxt, erroDia, linhas.caixa));
    controlesDia.push({ id, nome, ligada: inLigada, linhas, erroDia, fechadoTxt });
  }
  /** Plano 1500c · CC-231: janela curta com os 7 dias (os úteis já marcados) para escolher o destino da cópia. */
  async function escolherDiasCopia(deId) {
    const origem = controlesDia.find(d => d.id === deId);
    const caixas = DIAS.filter(([id]) => id !== deId).map(([id, nome]) => {
      const chk = h("input", { type: "checkbox", name: `copiar_${id}`, checked: ["1", "2", "3", "4", "5"].includes(id), dataset: { dia: id } });
      return { id, el: h("label", { class: "agc-copiar-dia" }, chk, h("span", null, nome)), chk };
    });
    const ok = await ui.modal({ titulo: `Copiar o horário de ${origem.nome}`, largura: "p",
      corpo: h("div", { class: "pilha" }, h("p", null, "Para quais dias?"), h("div", { class: "agc-copiar-dias", role: "group", "aria-label": "Dias de destino" }, caixas.map(x => x.el)),
        h("p", { class: "campo-ajuda agc-copiar-nota" }, "Copia só as faixas de atendimento. As pausas valem para todos os dias."),   // plano 2000d · DC-389
        // plano 2000d · GY-090: copiar um dia FECHADO fecha os dias escolhidos — a janela avisa antes
        !origem.ligada.checked ? h("p", { class: "aviso aviso-aten agc-copiar-fechado", role: "note" }, `${origem.nome} está fechado: os dias escolhidos também ficarão fechados.`) : null),
      acoes: [{ rotulo: "Cancelar", tipo: "neutro", valor: false }, { rotulo: origem.ligada.checked ? "Copiar" : "Fechar estes dias", tipo: "primario", valor: true }] });   // GY-090
    if (!ok) return;
    const alvos = caixas.filter(x => x.chk.checked).map(x => x.id);
    if (alvos.length) copiarParaUteis(deId, alvos);
  }
  function copiarParaUteis(deId, alvos = ["1", "2", "3", "4", "5"]) {
    const origem = controlesDia.find(d => d.id === deId);
    const faixas = origem.ligada.checked ? origem.linhas.ler() : [];   // plano 2000d · GY-091: dia fechado copia «fechado» (não as faixas escondidas)
    // plano 1000b · CB-158: guarda como estavam os outros dias úteis — o aviso oferece «Desfazer»
    const antes = controlesDia.filter(d => d.id !== deId && alvos.includes(d.id)).map(d => ({ d, ligada: d.ligada.checked, faixas: d.linhas.ler() }));
    for (const d of controlesDia) {
      if (d.id === deId || !alvos.includes(d.id)) continue;
      d.ligada.checked = faixas.length > 0;
      d.linhas.caixa.hidden = !faixas.length; d.fechadoTxt.hidden = faixas.length > 0;   // GX-069
      d.linhas.definir(faixas);
      d.erroDia.hidden = true;
    }
    marcarSujo();
    pintarPrevia();
    const uteisOutros = ["1", "2", "3", "4", "5"].filter(x => x !== deId);
    const uteis = alvos.length === uteisOutros.length && uteisOutros.every(x => alvos.includes(x));
    const texto = `Horário de ${origem.nome} copiado para ${uteis ? "os dias úteis" : alvos.map(x => DIAS_CURTOS[Number(x)]).join(", ")}.`;
    if (typeof ui.acaoComDesfazer !== "function") { ui.toast(texto, { tipo: "ok" }); return; }
    ui.acaoComDesfazer({ texto, reverter: () => {
      for (const x of antes) { x.d.ligada.checked = x.ligada; x.d.linhas.caixa.hidden = !x.ligada; x.d.fechadoTxt.hidden = x.ligada; x.d.linhas.definir(x.faixas); x.d.erroDia.hidden = true; }
      marcarSujo();
      pintarPrevia();
    } });
  }

  const intervalos = h("div", { class: "agc-intervalos" });
  // plano 1000b · CB-201: com o horário do departamento a grade some, mas as pausas continuam valendo (e são salvas) — o aviso diz isso
  const avisoPausas = h("p", { class: "campo-ajuda agc-aviso-pausas", hidden: true }, "As pausas valem também com o horário do departamento.");
  // plano 1500c · GX-060: pausa que não cruza nenhum horário (19:00–20:00 com a agenda fechando às 18h) é avisada na hora — salva, não muda nada
  const avisoPausaFora = h("p", { class: "campo-ajuda agc-pausa-fora", role: "status", hidden: true });
  function conferirPausas() {
    const hor = fonteAgenda && fonteAgenda.checked ? Object.fromEntries(controlesDia.map(d => [d.id, d.ligada.checked ? d.linhas.ler() : []])) : horarioHerdado;
    const ps = [...intervalos.querySelectorAll(".agc-faixa")].map(l => [...l.querySelectorAll("input")].map(x => x.value));
    const fora = pausasSemEfeito(hor, ps);
    avisoPausaFora.textContent = fora.length ? `${fora.length === 1 ? "A pausa" : "As pausas"} ${fora.map(p => `${p[0]}–${p[1]}`).join(", ")} ${fora.length === 1 ? "fica" : "ficam"} fora de todos os horários de atendimento: não ${fora.length === 1 ? "muda" : "mudam"} nada.` : "";
    avisoPausaFora.hidden = !fora.length;
  }
  const pausas = Array.isArray(cfg.intervalos) ? cfg.intervalos : [];
  const reservaPausa = () => addIntervalo;   // CB-154: sem pausa nenhuma, o foco vai para «Adicionar intervalo»
  for (const faixa of pausas) intervalos.appendChild(linhaIntervalo(h, ui, faixa[0], faixa[1], "Intervalo", reservaPausa));
  const addIntervalo = h("button", { type: "button", class: "bt bt-fant bt-p agc-add-intervalo", on: { click: () => {
    // plano 2000d · GY-084: já existe a pausa 12:00–13:00? a nova nasce vazia (antes nascia igual e o Salvar acusava «se sobrepõem»)
    const ja = [...intervalos.querySelectorAll(".agc-faixa")].some(l => { const i = l.querySelectorAll("input"); return i[0] && i[0].value === "12:00" && i[1] && i[1].value === "13:00"; });
    const linha = intervalos.appendChild(ja ? linhaIntervalo(h, ui, "", "", "Intervalo", reservaPausa) : linhaIntervalo(h, ui, undefined, undefined, "Intervalo", reservaPausa));
    // plano 2000d · GY-081: o foco vai para o início da pausa nova
    const inp = linha && linha.querySelector("input"); if (inp) try { inp.focus(); } catch { /* ok */ }
  } } }, ui.icone("mais"), "Adicionar intervalo");

  const duracoes = h("div", { class: "agc-duracoes" });
  // plano 1500c · CC-295: o serviço novo nasce com a duração padrão que está no CAMPO (mesmo antes de salvar), não com a salva
  const duracaoAtual = () => { const v = Number(campoDuracao && campoDuracao.querySelector("input").value); return Number.isInteger(v) && v >= 5 && v <= 480 ? v : (cfg.duracao_min || 30); };
  function adicionarDuracao(nome = "", minutos = duracaoAtual()) {
    const servico = h("input", { type: "text", value: nome, maxlength: 60, placeholder: "Nome do serviço", "aria-label": "Nome do serviço" });
    const tempo = h("input", { type: "number", min: 5, max: 480, step: 5, value: String(minutos), "aria-label": `Duração em minutos para ${nome || "o serviço"}`,
      dataset: { inicial: String(minutos) } });   // plano 1000b · CB-145: linha em branco só avisa se a duração foi mexida
    const remover = h("button", { type: "button", class: "bt-icone agc-remover", "aria-label": `Remover duração de ${nome || "serviço"}`, on: { click: () => removerComFoco(linha, () => addDuracao) } }, ui.icone("fechar"));   // CB-154
    const linha = h("div", { class: "agc-duracao" }, servico, h("label", null, "min", tempo), remover);
    // plano 1000b · CB-155: os rótulos acompanham o nome digitado (as linhas novas ficavam «Remover duração de serviço»)
    servico.addEventListener("input", () => {
      const n = servico.value.trim();
      tempo.setAttribute("aria-label", `Duração em minutos para ${n || "o serviço"}`);
      remover.setAttribute("aria-label", `Remover duração de ${n || "serviço"}`);
    });
    // plano 1500c · GX-059: Enter no nome do serviço abre a próxima linha (antes o Enter salvava a agenda inteira no meio da digitação)
    servico.addEventListener("keydown", ev => {
      if (ev.key !== "Enter") return;
      ev.preventDefault();
      if (!servico.value.trim()) return;
      const n = duracoes.querySelectorAll(".agc-duracao").length;
      if (n >= 30) return;
      adicionarDuracao();
      const novo = duracoes.querySelectorAll(".agc-duracao")[n];
      const campo = novo && novo.querySelector("input");
      if (campo) try { campo.focus(); } catch { /* ok */ }
    });
    // plano 1500c · GX-062: nome repetido avisa ao sair do campo (antes só no Salvar, depois de rolar tudo)
    servico.addEventListener("blur", () => conferirRepetidos());
    duracoes.appendChild(linha);
    contarServicos();
  }
  // plano 1500c · CC-298: «12 de 30 serviços» à vista; no 30 o «Adicionar serviço» desliga (antes o limite só aparecia ao salvar)
  const contadorServ = h("span", { class: "campo-ajuda agc-serv-contador dado", "aria-live": "polite" });
  const avisoDupServ = h("p", { class: "agc-erro-dia agc-serv-dup", role: "alert", hidden: true });   // plano 1500c · GX-062
  function conferirRepetidos() {
    const vistos = new Map(), reps = new Set();
    for (const inp of duracoes.querySelectorAll(".agc-duracao input[type=\"text\"]")) {
      const k = chaveServico(inp.value);
      inp.removeAttribute("aria-invalid");
      if (!k) continue;
      if (vistos.has(k)) { reps.add(inp); reps.add(vistos.get(k)); } else vistos.set(k, inp);
    }
    for (const inp of reps) inp.setAttribute("aria-invalid", "true");
    const nome = reps.size ? [...reps][0].value.trim() : "";
    avisoDupServ.textContent = nome ? `«${nome}» aparece mais de uma vez. Deixe um só (a duração vale por serviço).` : "";
    avisoDupServ.hidden = !nome;
    return !!nome;
  }
  let addDuracao = null;
  function contarServicos() {
    const n = duracoes.querySelectorAll(".agc-duracao").length;
    contadorServ.textContent = `${n} de 30 serviços`;
    if (addDuracao) { addDuracao.setAttribute("aria-disabled", String(n >= 30)); addDuracao.setAttribute("title", n >= 30 ? "Limite de 30 serviços" : ""); }   // plano 2000d · GY-088
  }
  addDuracao = h("button", { type: "button", class: "bt bt-fant bt-p agc-add-duracao", on: { click: () => {
    // plano 2000d · GY-088: no limite o botão fica aria-disabled (o foco não se perde) e diz o porquê ao tocar
    if (addDuracao.getAttribute("aria-disabled") === "true") { if (ui.toast) ui.toast("Limite de 30 serviços. Remova um para incluir outro.", { tipo: "info" }); return; }
    adicionarDuracao();
    // plano 2000d · GY-083: o foco vai para o nome do serviço novo
    const todas = duracoes.querySelectorAll(".agc-duracao"); const inp = todas.length ? todas[todas.length - 1].querySelector("input") : null;
    if (inp) try { inp.focus(); } catch { /* ok */ }
  } } }, ui.icone("mais"), "Adicionar serviço");
  for (const [nome, minutos] of Object.entries(cfg.duracoes || {})) adicionarDuracao(nome, minutos);
  duracoes.addEventListener("click", () => queueMicrotask(contarServicos));   // remover uma linha atualiza a conta

  // prévia ao vivo: o que está marcado acima vira sete colunas de 0 a 24 h (horas úteis por dia e por semana)
  const previaCaixa = h("div", { class: "agc-previa-caixa" });
  // plano 1500c · CC-235: com o horário herdado (departamento ou padrão), a prévia mostra o que vale (lido da agenda: nx_agenda_dia), só leitura
  let horarioHerdado = null, herdadoP = null;
  function lerHerdado() {
    if (herdadoP) return;
    herdadoP = Promise.resolve(api.rpcC("nx_agenda_dia", { p_data: ui.hojeSP(), p_dias: 1 })).then(r => {
      const hr = r && r.config && r.config.horario && typeof r.config.horario === "object" ? r.config.horario : null;
      horarioHerdado = hr || (cfg.horario_fonte === "padrao" ? { 1: [["08:00", "18:00"]], 2: [["08:00", "18:00"]], 3: [["08:00", "18:00"]], 4: [["08:00", "18:00"]], 5: [["08:00", "18:00"]] } : null);
      if (!fonteAgenda.checked) pintarPrevia();
    }).catch(() => { herdadoP = null; });
  }
  function pintarPrevia() {
    conferirPausas();
    ui.limpar(previaCaixa);
    if (!fonteAgenda.checked) {
      const pausasH = [...intervalos.querySelectorAll(".agc-faixa")].map(l => [...l.querySelectorAll("input")].map(x => x.value));
      if (horarioHerdado) {
        previaCaixa.appendChild(h("p", { class: "campo-ajuda agc-previa-herdada" }, cfg.horario_fonte === "padrao" ? "Horário que vale hoje (padrão), só leitura:" : "Horário que vale hoje (do departamento), só leitura:"));
        previaCaixa.appendChild(montarPreviaSemana(h, previaSemana(horarioHerdado, pausasH)));
      } else { previaCaixa.appendChild(h("p", { class: "campo-ajuda" }, "A prévia aparece quando os horários são definidos nesta agenda.")); lerHerdado(); }
      return;
    }
    const horario = Object.fromEntries(controlesDia.map(d => [d.id, d.ligada.checked ? d.linhas.ler() : []]));
    const pausas = [...intervalos.querySelectorAll(".agc-faixa")].map(l => [...l.querySelectorAll("input")].map(x => x.value));
    previaCaixa.appendChild(montarPreviaSemana(h, previaSemana(horario, pausas)));
  }
  // CA-216/CA-217: os dois campos que mais confundem ganham exemplo e um nome que não lembra o almoço
  const campoDuracao = ui.campo({ rotulo: "Duração padrão (minutos)", nome: "duracao_min", tipo: "numero", valor: cfg.duracao_min || 30, min: 5, max: 480, passo: 5 });
  const campoPasso = ui.campo({ rotulo: "De quanto em quanto tempo oferecer horários (minutos)", nome: "passo_min", tipo: "numero", valor: cfg.passo_min || "", min: 5, max: 480, passo: 5, placeholder: "Igual à duração",
    ajuda: "Vazio = igual à duração padrão. Ex.: 30 oferece 08:00, 08:30, 09:00…" });
  // CA-275: passo maior que a duração deixa buracos na oferta de horários — o aviso explica na hora
  const avisoPasso = h("p", { class: "aviso aviso-aten agc-aviso-passo", role: "status", hidden: true });
  function conferirPasso() {
    const txt = avisoPasso && avisoPassoDuracao(campoPasso.querySelector("input").value, campoDuracao.querySelector("input").value, palavraDaAgenda(ctx.vocab));   // plano 2000d · GY-089
    avisoPasso.textContent = txt || "";
    avisoPasso.hidden = !txt;
  }
  const btSalvar = h("button", { type: "submit", class: "bt bt-prim agc-salvar" }, ui.icone("check"), "Salvar agenda");
  // plano 1500c · CC-230: o aviso das consultas que ficam fora do horário novo (junto do «Salvar»)
  const avisoFora = h("p", { class: "aviso aviso-aten agc-aviso-fora", role: "alert", tabindex: "-1", hidden: true });
  // plano 1000b · CB-202: o «Salvar agenda» fica no fim de um formulário longo — com mudança não salva, uma barra fixa embaixo leva o salvar junto
  barraSujo = h("div", { class: "agc-barra-sujo", hidden: true },
    h("span", { class: "agc-barra-sujo-txt" }, "Alterações não salvas"),
    h("button", { type: "submit", class: "bt bt-prim bt-p agc-barra-salvar" }, "Salvar"),
    // plano 1500c · GX-072: «Descartar» volta ao que está salvo (antes era sair da tela e responder «sair sem salvar»)
    h("button", { type: "button", class: "bt bt-fant bt-p agc-barra-descartar", on: { click: async () => {
      const ok = typeof ui.confirmar === "function" ? await ui.confirmar({ titulo: "Descartar as alterações?", texto: "Os horários e durações voltam ao que está salvo.", rotulo: "Descartar", perigo: true }) : true;
      if (!ok) return;
      sujo = false; tirarAvisoSaida();
      secaoAgenda(ctx, alvo);
    } } }, "Descartar"));
  const form = h("form", { class: "pilha agc-form", novalidate: true },
    h("section", { class: "cartao pilha" },
      // plano 1500c · CC-049: «horário de Brasília», o mesmo nome dos Departamentos (cv-config)
      h("div", { class: "cartao-cab" }, h("div", null, h("h3", { class: "titulo-sec" }, "Disponibilidade"), h("p", { class: "sub" }, "Os horários livres são calculados no horário de Brasília."))),
      usarAgenda, ajudaFonte, gradeDias, previaCaixa,
      h("div", { class: "pilha-p" }, h("div", null, h("h4", null, "Pausas e almoço"), h("p", { class: "sub" }, "Intervalos aplicados a todos os dias de atendimento.")), avisoPausas, intervalos, avisoPausaFora, addIntervalo)),   // GX-060
    h("section", { class: "cartao pilha" },
      h("div", { class: "cartao-cab" }, h("div", null, h("h3", { class: "titulo-sec" }, "Duração e capacidade"), h("p", { class: "sub" }, "Ajuste o tempo por serviço. O padrão é usado quando um serviço não tem duração própria."))),
      h("div", { class: "form-grade" },
        campoDuracao,
        ui.campo({ rotulo: "Atendimentos no mesmo horário", nome: "capacidade", tipo: "numero", valor: cfg.capacidade || 1, min: 1, max: 50,
          ajuda: "Ex.: 2 = duas cadeiras ou salas atendendo ao mesmo tempo." }),   // plano 1000b · CB-188
        ui.campo({ rotulo: "Antecedência mínima (horas)", nome: "antecedencia_horas", tipo: "numero", valor: cfg.antecedencia_horas ?? 2, min: 0, max: 720,
          ajuda: "Ex.: 2 = ninguém (nem a IA) marca consulta para as próximas 2 horas." }),
        ui.campo({ rotulo: "Agendamento até (dias à frente)", nome: "dias_a_frente", tipo: "numero", valor: cfg.dias_a_frente || 30, min: 1, max: 180,
          ajuda: "Ex.: 30 = ninguém (nem a IA) marca para depois de 30 dias." }),   // plano 1000b · CB-187
        campoPasso),
      avisoPasso,
      h("div", { class: "pilha-p" }, h("div", null, h("h4", null, "Duração por serviço"), h("p", { class: "sub" }, "Ex.: avaliação 30 min, limpeza 45 min. Até 30 serviços.")), duracoes, avisoDupServ, h("div", { class: "linha agc-serv-rod" }, addDuracao, contadorServ)),   // GX-062
      avisoFora, h("div", { class: "linha linha-fim" }, btSalvar)),
    barraSujo);

  const fonteAgenda = usarAgenda.querySelector("input");
  fonteAgenda.setAttribute("aria-describedby", [fonteAgenda.getAttribute("aria-describedby"), "agc-fonte-ajuda"].filter(Boolean).join(" "));
  const fonteToggle = () => {
    gradeDias.hidden = !fonteAgenda.checked;
    ajudaFonte.textContent = textoFonte(fonteAgenda.checked);       // CB-180
    avisoPausas.hidden = fonteAgenda.checked;                        // CB-201
    pintarPrevia();
  };
  fonteAgenda.addEventListener("change", fonteToggle);
  fonteToggle();
  conferirPasso();
  // qualquer mudança de horário (digitar, ligar um dia, adicionar ou remover faixa/pausa) redesenha a prévia; o clique chega depois do remove()
  form.addEventListener("input", pintarPrevia);
  form.addEventListener("change", pintarPrevia);
  form.addEventListener("input", () => { marcarSujo(); conferirPasso(); });
  form.addEventListener("change", () => { marcarSujo(); conferirPasso(); });
  form.addEventListener("click", ev => {
    if (!(ev.target.closest && ev.target.closest('button[type="button"]'))) return;
    marcarSujo();
    queueMicrotask(pintarPrevia);
  });
  const limparInvalidos = () => { for (const el of form.querySelectorAll("[aria-invalid]")) el.removeAttribute("aria-invalid"); };
  let horarioConferido = "";     // plano 1500c · CC-230
  let avisouFonte = false;       // plano 2000d · DC-396
  form.addEventListener("submit", ev => salvarAgenda(ev));
  // plano 1500c · GX-058: Ctrl/⌘+S salva a agenda (sem o navegador abrir «Salvar página como…»)
  form.addEventListener("keydown", ev => {
    if (!(ev.ctrlKey || ev.metaKey) || ev.altKey || String(ev.key).toLowerCase() !== "s") return;
    ev.preventDefault();
    salvarAgenda(null);
  });
  let salvando = false;          // plano 2000d · GY-080
  async function salvarAgenda(ev) {
    if (ev && typeof ev.preventDefault === "function") ev.preventDefault();
    // plano 2000d · GY-080: Ctrl+S e o clique (ou dois toques) não mandam dois salvamentos ao mesmo tempo
    if (salvando) return;
    salvando = true;
    try { return await salvarAgoraAgenda(); } finally { salvando = false; }
  }
  async function salvarAgoraAgenda() {
    ui.marcarErro(form, null);
    limparInvalidos();
    const dados = ui.lerForm(form);
    const numero = nome => Number(dados[nome]);
    const duracao = numero("duracao_min");
    const capacidade = numero("capacidade");
    const antecedencia = numero("antecedencia_horas");
    const dias = numero("dias_a_frente");
    const passoTxt = dados.passo_min == null || dados.passo_min === "" ? null : Number(dados.passo_min);
    // plano 1000b · CB-156: o erro dos números marca o campo (ui.marcarErro: aria-invalid e texto junto dele) e leva o foco até ele
    // plano 1500c · GX-071: «2,5» (ou vazio) diz o que fazer — número inteiro / preencha — em vez de «deve ficar entre…»
    const qual = (nome, rot, a, b, padrao) => (passoTxt === null && nome === "passo_min" ? padrao : erroNumeroInteiro(dados[nome], rot, a, b) || padrao);
    const errosNum = [
      !Number.isInteger(duracao) || duracao < 5 || duracao > 480 ? ["duracao_min", qual("duracao_min", "Duração padrão", 5, 480, "A duração padrão deve ficar entre 5 e 480 minutos.")] : null,
      !Number.isInteger(capacidade) || capacidade < 1 || capacidade > 50 ? ["capacidade", qual("capacidade", "Atendimentos no mesmo horário", 1, 50, "A capacidade deve ficar entre 1 e 50 atendimentos.")] : null,
      !Number.isInteger(antecedencia) || antecedencia < 0 || antecedencia > 720 ? ["antecedencia_horas", qual("antecedencia_horas", "Antecedência", 0, 720, "A antecedência deve ficar entre 0 e 720 horas.")] : null,
      !Number.isInteger(dias) || dias < 1 || dias > 180 ? ["dias_a_frente", qual("dias_a_frente", "Dias à frente", 1, 180, "O limite de dias deve ficar entre 1 e 180.")] : null,
      passoTxt !== null && (!Number.isInteger(passoTxt) || passoTxt < 5 || passoTxt > 480) ? ["passo_min", qual("passo_min", "Intervalo entre horários", 5, 480, "O intervalo entre horários deve ficar entre 5 e 480 minutos.")] : null,
    ].filter(Boolean);
    if (errosNum.length) {
      for (const [nome, texto] of errosNum) {
        ui.marcarErro(form, nome, texto);
        const el = form.querySelector(`[name="${nome}"]`);
        if (el) el.setAttribute("aria-invalid", "true");
      }
      const primeiro = form.querySelector(`[name="${errosNum[0][0]}"]`);
      if (primeiro) try { primeiro.focus(); } catch { /* ok */ }
      return ui.toast(errosNum[0][1], { tipo: "erro" });
    }

    const horario = Object.fromEntries(controlesDia.map(d => [d.id, d.ligada.checked ? d.linhas.ler() : []]));
    for (const d of controlesDia) { d.erroDia.hidden = true; d.erroDia.textContent = ""; }
    // CA-279: o aviso diz O QUE está errado (faixa vazia, sem início/fim, fim antes do início) e marca o campo (aria-invalid)
    for (const d of controlesDia) {
      const prob = d.ligada.checked ? problemaDasFaixas(horario[d.id]) : null;
      if (!prob) continue;
      d.erroDia.textContent = `${d.nome}: ${prob.msg}`;
      d.erroDia.hidden = false;
      const linha = prob.indice >= 0 ? d.linhas.caixa.querySelectorAll(".agc-faixa")[prob.indice] : null;
      const campo = linha ? linha.querySelectorAll("input")[prob.campo === "fim" ? 1 : 0] : d.linhas.caixa.querySelector("button");
      if (campo && linha) campo.setAttribute("aria-invalid", "true");
      if (campo) try { campo.focus(); } catch { /* ok */ }
      return ui.toast(`${d.nome}: ${prob.msg}`, { tipo: "erro" });
    }
    // CA-207: 08–12 e 11–14 no mesmo dia não vão ao servidor — o aviso fica no dia e o foco vai para ele
    for (const d of controlesDia) {
      const par = d.ligada.checked ? faixasSobrepostas(horario[d.id]) : null;
      if (!par) continue;
      d.erroDia.textContent = `As faixas ${par[0][0]}–${par[0][1]} e ${par[1][0]}–${par[1][1]} se sobrepõem. Junte-as numa só ou ajuste os horários.`;
      d.erroDia.hidden = false;
      const campo = d.linhas.caixa.querySelector("input");
      if (campo) try { campo.focus(); } catch { /* ok */ }
      return ui.toast(`Os horários de ${DIAS[Number(d.id)][1]} se sobrepõem.`, { tipo: "erro" });
    }
    const linhasPausa = [...intervalos.querySelectorAll(".agc-faixa")];
    const pausasSalvas = linhasPausa.map(l => [...l.querySelectorAll("input")].map(x => x.value));
    // plano 1000b · CB-157: diz QUAL pausa está errada e marca a linha (aria-invalid no campo, foco nele)
    const iPausa = pausasSalvas.findIndex(([a, b]) => !a || !b || a >= b);
    if (iPausa >= 0) {
      const [a, b] = pausasSalvas[iPausa];
      const campo = linhasPausa[iPausa].querySelectorAll("input")[!a ? 0 : 1];
      if (campo) { campo.setAttribute("aria-invalid", "true"); try { campo.focus(); } catch { /* ok */ } }
      return ui.toast(`Pausa ${iPausa + 1}: ${!a ? "preencha o início." : !b ? "preencha o fim." : "o fim precisa ser depois do início."}`, { tipo: "erro" });
    }
    // plano 1500c · GX-061: duas pausas que se sobrepõem (12:00–13:00 e 12:30–14:00) — a regra dos dias vale para as pausas também
    const parPausa = faixasSobrepostas(pausasSalvas);
    if (parPausa) {
      const i2 = pausasSalvas.findIndex(p => p[0] === parPausa[1][0] && p[1] === parPausa[1][1]);
      const campo = i2 >= 0 ? linhasPausa[i2].querySelector("input") : null;
      if (campo) { campo.setAttribute("aria-invalid", "true"); try { campo.focus(); } catch { /* ok */ } }
      return ui.toast(`As pausas ${parPausa[0][0]}–${parPausa[0][1]} e ${parPausa[1][0]}–${parPausa[1][1]} se sobrepõem. Junte-as numa só.`, { tipo: "erro" });
    }
    const duracoesSalvas = {};
    const vazias = [];
    for (const linha of duracoes.querySelectorAll(".agc-duracao")) {
      const [campoNome, campoTempo] = linha.querySelectorAll("input");
      const nome = campoNome.value.trim();
      // plano 1000b · CB-145: linha em branco (o «Adicionar serviço» sem nome) é ignorada e sai; só avisa se a duração foi mexida
      if (!nome) {
        const mexida = campoTempo.value && campoTempo.value !== (campoTempo.dataset.inicial ?? campoTempo.getAttribute("data-inicial"));
        if (mexida) { campoNome.setAttribute("aria-invalid", "true"); try { campoNome.focus(); } catch { /* ok */ } return ui.toast("Informe o nome de cada serviço com duração própria.", { tipo: "erro" }); }
        vazias.push(linha); continue;
      }
      const chave = chaveServico(nome);     // plano 1000b · CB-160: «Avaliação» e «Avaliacao» são o mesmo serviço
      const minutos = Number(campoTempo.value);
      if (!Number.isInteger(minutos) || minutos < 5 || minutos > 480) { campoTempo.setAttribute("aria-invalid", "true"); try { campoTempo.focus(); } catch { /* ok */ } return ui.toast(`A duração de “${nome}” deve ficar entre 5 e 480 minutos.`, { tipo: "erro" }); }
      if (Object.keys(duracoesSalvas).some(s => chaveServico(s) === chave)) { campoNome.setAttribute("aria-invalid", "true"); try { campoNome.focus(); } catch { /* ok */ } return ui.toast(`O serviço “${nome}” aparece mais de uma vez.`, { tipo: "erro" }); }
      duracoesSalvas[nome] = minutos;
    }
    for (const l of vazias) l.remove();
    if (Object.keys(duracoesSalvas).length > 30) return ui.toast("A agenda aceita até 30 durações por serviço.", { tipo: "erro" });
    // plano 2000d · DC-396: desligar «horários nesta agenda» apaga a semana que estava aqui — avisa uma vez; o 2º «Salvar» grava assim
    if (!fonteAgenda.checked && cfg.horario && typeof cfg.horario === "object" && Object.values(cfg.horario).some(l => Array.isArray(l) && l.length) && !avisouFonte) {
      avisouFonte = true;
      return ui.toast("Os horários desta agenda não serão usados (vale o do departamento) e somem ao salvar. Toque em «Salvar agenda» de novo para salvar assim.", { tipo: "info" });
    }
    const cfgNova = {
      duracao_min: duracao, capacidade, antecedencia_horas: antecedencia, dias_a_frente: dias,
      passo_min: passoTxt, horario: fonteAgenda.checked ? horario : null,
      intervalos: pausasSalvas, duracoes: duracoesSalvas,
    };
    // plano 1500c · CC-230: o horário novo deixa consultas marcadas fora do atendimento? (próximos 31 dias) — avisa; o 2º «Salvar» grava mesmo assim
    if (fonteAgenda.checked) {
      const chaveHor = JSON.stringify(horario);
      const mudou = JSON.stringify(cfg.horario || null) !== chaveHor;
      if (mudou && chaveHor !== horarioConferido) {
        let fora = [];
        try {
          const ag = await api.rpcC("nx_agenda_dia", { p_data: ui.hojeSP(), p_dias: 31 });
          fora = consultasForaDoHorario(ag && Array.isArray(ag.consultas) ? ag.consultas.filter(c => Date.parse(c.inicio) > Date.now()) : [], horario, duracao, pausasSalvas);   // plano 2000d · DC-282: as pausas também
        } catch { fora = []; /* sem a leitura: salva */ }
        horarioConferido = chaveHor;
        if (fora.length) {
          const palF = palavraDaAgenda(ctx.vocab);   // plano 2000d · GY-086
          avisoFora.textContent = `${fora.length === 1 ? `1 ${palF} marcada fica` : `${fora.length} ${palF}s marcadas ficam`} fora do novo horário: ${fora.slice(0, 3).map(c => `${c.nome || c.titulo || palF} (${ui.dataHoraBR(c.inicio)})`).join(", ")}${fora.length > 3 ? "…" : ""}. Elas continuam marcadas — remarque pela Agenda. Toque em «Salvar agenda» de novo para salvar mesmo assim.`;
          // plano 1500c · GX-068: um toque leva à Agenda no dia da primeira consulta que ficou de fora (para remarcar)
          const diaFora = diaSP(primeiraDe(fora));
          if (diaFora) avisoFora.append(" ", h("a", { href: `#/agenda?dia=${diaFora}`, class: "agc-fora-ver", on: { click: ev2 => { ev2.preventDefault(); if (typeof ctx.navegar === "function") ctx.navegar(`#/agenda?dia=${diaFora}`); } } }, "Ver na Agenda"));
          avisoFora.hidden = false;
          try { avisoFora.focus(); } catch { /* ok */ }
          return ui.toast(`${fora.length === 1 ? "Uma consulta fica" : `${fora.length} consultas ficam`} fora do novo horário.`, { tipo: "info" });
        }
      }
    }
    avisoFora.hidden = true;
    try {
      const salvo = await ui.carregando(btSalvar, api.rpcC("nx_agenda_config_salvar", { p_cfg: cfgNova }));
      // CA-212: a seção NÃO é redesenhada (a rolagem e o foco ficavam no topo): o estado é atualizado e o «Salvar» confirma com o check
      if (salvo && typeof salvo === "object" && Array.isArray(salvo.bloqueios)) { estado = salvo; desenharBloqueios(); }
      const mudouHorario = JSON.stringify(cfg.horario || null) !== JSON.stringify(cfgNova.horario || null) || JSON.stringify(cfg.intervalos || []) !== JSON.stringify(pausasSalvas);
      cfg.horario = cfgNova.horario; cfg.intervalos = pausasSalvas;
      // plano 2000d · GY-078: o resto do que foi salvo também passa a valer na tela (a duração do serviço novo, o «Descartar», o aviso das consultas fora)
      Object.assign(cfg, { duracao_min: cfgNova.duracao_min, capacidade: cfgNova.capacidade, antecedencia_horas: cfgNova.antecedencia_horas, dias_a_frente: cfgNova.dias_a_frente, passo_min: cfgNova.passo_min, duracoes: { ...duracoesSalvas } });
      // plano 2000d · GY-079: a fonte do horário muda com o interruptor salvo — a ajuda deixa de dizer «vale o padrão» depois de definir aqui
      if (salvo && typeof salvo === "object" && salvo.config && typeof salvo.config.horario_fonte === "string") cfg.horario_fonte = salvo.config.horario_fonte;
      else if (fonteAgenda.checked) cfg.horario_fonte = "agenda";
      else if (cfg.horario_fonte === "agenda") cfg.horario_fonte = "departamento";
      ajudaFonte.textContent = textoFonte(fonteAgenda.checked);
      avisouFonte = false;
      sujo = false;
      barraSujo.hidden = true;     // CB-202
      // plano 1500c · CC-236: mudou o horário? a IA tem o texto próprio de horários — o aviso leva até ele
      if (mudouHorario && typeof ctx.navegar === "function") ui.toast("Agenda salva. A IA tem um texto próprio de horários: confira se ela diz o horário novo.", { tipo: "ok", acao: { rotulo: "Atualizar o texto da IA", fn: () => ctx.navegar("#/config/ia") } });
      else ui.toast("Agenda salva.", { tipo: "ok" });
      try { btSalvar.focus({ preventScroll: true }); } catch { btSalvar.focus(); }
      if (typeof ui.checkSucesso === "function") ui.checkSucesso(btSalvar, { texto: "Agenda salva" });
    } catch (e) { ui.toast(api.mensagemErro(e), { tipo: "erro" }); }
  }

  /* ---------- bloqueios (CA-278: um nome só — «Bloqueio»: «Bloquear horário», «Bloqueios futuros») ---------- */
  const listaBloqueios = h("div", { class: "agc-bloqueios", role: "list" });
  const contBloq = h("span", { class: "agc-cont-bloq dado" });   // plano 1500c · GX-063
  const POR_PAGINA = 30;
  let mostrar = POR_PAGINA;                 // CA-273: «Ver mais» pagina no cliente (estado.bloqueios já vem inteiro)
  const ocultos = new Set();                // CA-272: removidos com «Desfazer» ainda no prazo (a exclusão real sai quando o aviso fecha)
  function desenharBloqueios() {
    ui.limpar(listaBloqueios);
    const todos = (estado.bloqueios || []).filter(b => b.fim && new Date(b.fim) > new Date() && !ocultos.has(b.id));
    contBloq.textContent = todos.length ? ` (${todos.length})` : "";   // plano 1500c · GX-063: quantos bloqueios futuros há (a lista pagina de 30 em 30)
    // plano 2000d · DC-387: em ordem de data e com o mês no meio («Novembro de 2026 · 3»), não na ordem do servidor
    todos.sort((a, b) => Date.parse(a.inicio) - Date.parse(b.inicio));
    const futuros = todos.slice(0, mostrar);
    if (!futuros.length) listaBloqueios.appendChild(h("p", { class: "sub" }, "Nenhum bloqueio futuro."));
    const porMes = contarPorMes(todos);
    let mesAtual = "";
    for (const b of futuros) {
      const mes = mesDoBloqueio(b);
      if (mes && mes !== mesAtual) {
        mesAtual = mes;
        listaBloqueios.appendChild(h("h4", { class: "agc-bloq-mes", role: "presentation" }, `${nomeMes(mes)} · ${porMes.get(mes) || 0}`));
      }
      const excluir = h("button", { type: "button", class: "bt bt-fant bt-p", "aria-label": `Remover bloqueio${b.motivo ? ` «${b.motivo}»` : ""} de ${ui.dataHoraBR(b.inicio)}`,   /* plano 2000d · GY-085 */ on: { click: () => removerBloqueio(b, excluir) } }, ui.icone("lixeira"), "Remover");
      // plano 1000b · CB-161: «Editar» abre a mesma janela preenchida (o servidor atualiza pelo id; o aviso de consultas vale igual)
      const editar = h("button", { type: "button", class: "bt bt-fant bt-p agc-editar-bloqueio", "aria-label": `Editar bloqueio${b.motivo ? ` «${b.motivo}»` : ""} de ${ui.dataHoraBR(b.inicio)}`,   /* plano 2000d · GY-085 */ on: { click: () => criarBloqueio(b) } }, "Editar");
      listaBloqueios.appendChild(h("article", { class: "agc-bloqueio", role: "listitem", dataset: { id: b.id } },
        // plano 1500c · CC-279: quem fechou o horário (quando o servidor mandar criado_por_nome)
        h("div", null, h("b", null, b.motivo || "Bloqueio"), h("small", null, ui.periodoBR(b.inicio, b.fim, " — "), typeof b.criado_por_nome === "string" && b.criado_por_nome.trim() ? ` · por ${b.criado_por_nome.trim()}` : ""),
          // plano 1500c · GX-064: o bloqueio que já começou (férias em curso) diz «em andamento»
          Date.parse(b.inicio) <= Date.now() ? h("span", { class: "pilula pilula-aten agc-bloq-agora" }, "em andamento") : null),
        h("div", { class: "linha agc-bloqueio-acoes" }, editar, excluir)));
    }
    if (todos.length > futuros.length) {
      const resto = todos.length - futuros.length;
      // plano 1000b · CB-198: o botão some ao redesenhar — o foco vai para o 1º bloqueio novo (antes caía no body)
      listaBloqueios.appendChild(h("button", { type: "button", class: "bt bt-fant bt-p agc-ver-mais", on: { click: () => { const ja = futuros.length; mostrar += POR_PAGINA; desenharBloqueios(); focarBloqueio(ja); } } },
        `Ver mais ${Math.min(resto, POR_PAGINA)} de ${resto}`));
    }
  }
  /** CB-198: foco no bloqueio de índice `i` da lista (o botão «Remover» dele); sem ele, o anterior; sem nenhum, o «Bloquear horário». */
  function focarBloqueio(i) {
    const itens = listaBloqueios.querySelectorAll(".agc-bloqueio");
    const alvo = itens[Math.min(i, itens.length - 1)];
    const bt = alvo ? (alvo.querySelector(".agc-editar-bloqueio") || alvo.querySelector("button")) : btBloqueio;   // (só chamada depois de a seção montar)
    if (bt) try { bt.focus(); } catch { /* ok */ }
  }
  /** CA-272: remover tem «Desfazer» — some da lista na hora; a exclusão no servidor só vale quando o aviso fecha sem desfazer. */
  async function removerBloqueio(b, botao) {
    const excluirAgora = async () => {
      estado = await api.rpcC("nx_agenda_bloqueio_excluir", { p_id: b.id });
      ocultos.delete(b.id);
      desenharBloqueios();
    };
    if (typeof ui.acaoComDesfazer !== "function") {
      if (!(await ui.confirmar({ titulo: "Remover bloqueio?", texto: "Os horários deste período voltarão a aparecer como disponíveis.", perigo: true, rotulo: "Remover bloqueio" }))) return;
      try { await ui.carregando(botao, excluirAgora()); ui.toast("Bloqueio removido.", { tipo: "ok" }); } catch (e) { ui.toast(api.mensagemErro(e), { tipo: "erro" }); }
      return;
    }
    await ui.acaoComDesfazer({
      texto: `Bloqueio removido${b.motivo ? ` (${b.motivo})` : ""}`,
      // plano 1000b · CB-198: o «Remover» some com a linha — o foco vai para o bloqueio seguinte (ou o anterior, ou «Bloquear horário»)
      aplicar: () => { const i = [...listaBloqueios.querySelectorAll(".agc-bloqueio")].findIndex(x => String(x.dataset.id) === String(b.id)); ocultos.add(b.id); desenharBloqueios(); focarBloqueio(Math.max(0, i)); },
      firmar: excluirAgora,
      reverter: () => { ocultos.delete(b.id); desenharBloqueios(); },
    });
  }
  desenharBloqueios();

  const btBloqueio = h("button", { type: "button", class: "bt bt-sec", on: { click: criarBloqueio } }, ui.icone("mais"), "Bloquear horário");
  const btFeriados = h("button", { type: "button", class: "bt bt-fant agc-feriados", on: { click: bloquearFeriados } }, ui.icone("calendario"), "Bloquear feriados nacionais");
  // plano 2000d · DC-350: em novembro, o lembrete de renovar os feriados do ano que vem
  const txtRenovar = avisoRenovarFeriados(typeof ui.hojeSP === "function" ? ui.hojeSP() : _diaSP.format(new Date()), estado.bloqueios || []);
  const avisoRenovar = txtRenovar ? h("p", { class: "aviso aviso-info agc-renovar-feriados", role: "status" }, txtRenovar, " ",
    h("button", { type: "button", class: "bt bt-fant bt-p", on: { click: () => bloquearFeriados() } }, "Bloquear agora")) : null;
  raiz.append(form, h("section", { class: "cartao pilha" },
    h("div", { class: "cartao-cab" }, h("div", null, h("h3", { class: "titulo-sec" }, "Bloqueios futuros", contBloq), h("p", { class: "sub" }, "Feche um dia inteiro ou só algumas horas: feriado, folga, manutenção.")),
      h("div", { class: "linha agc-bloq-acoes" }, btFeriados, btBloqueio)),
    avisoRenovar,
    listaBloqueios));

  /** CA-258: os feriados nacionais de hoje até o fim do ano que vem viram bloqueios do dia inteiro (com o nome como motivo); os já bloqueados ficam. */
  async function bloquearFeriados() {
    const hoje = ui.hojeSP();
    const ate = `dez/${Number(hoje.slice(0, 4)) + 1}`;
    // plano 1500c · CC-233: «Incluir feriado de SP» (9 de julho) e «Feriado da cidade» (data fixa, ex.: aniversário da cidade) no mesmo fluxo
    const chkSP = h("input", { type: "checkbox", name: "feriado_sp", class: "agc-feriado-sp" });
    // plano 2000d · DC-349: os pontos facultativos (quase toda clínica fecha na terça de Carnaval) como opção, desmarcada
    const chkFac = h("input", { type: "checkbox", name: "feriado_facultativos", class: "agc-feriado-fac" });
    const cidadeData = ui.campo({ rotulo: "Feriado da cidade (opcional)", nome: "cidade_data", tipo: "data" });
    const cidadeNome = ui.campo({ rotulo: "Nome do feriado da cidade", nome: "cidade_nome", max: 60, placeholder: "Ex.: Aniversário de Taubaté" });
    const dm = iso => `${iso.slice(8, 10)}/${iso.slice(5, 7)}/${iso.slice(0, 4)}`;
    const listaEl = h("ul", { class: "agc-feriados-lista" });
    let lista = [], caixas = [];
    const opcoes = () => {
      const d = cidadeData.querySelector("input").value;
      return { estado: chkSP.checked ? "SP" : null, facultativos: chkFac.checked, cidade: d ? { md: d.slice(5, 10), nome: cidadeNome.querySelector("input").value.trim() || "Feriado da cidade" } : null };
    };
    // plano 1500c · CC-234: cada feriado com a caixa marcada — quem abre na Consciência Negra desmarca e pronto
    const pintarLista = () => {
      lista = feriadosParaBloquear(hoje, estado.bloqueios || [], opcoes());
      ui.limpar(listaEl);
      caixas = lista.map(f => h("input", { type: "checkbox", checked: true, class: "agc-feriado-chk", dataset: { data: f.data }, "aria-label": `${dm(f.data)} · ${f.nome}` }));
      lista.forEach((f, i) => listaEl.appendChild(h("li", null, h("label", { class: "agc-feriado-item" }, caixas[i], h("span", { class: "dado" }, dm(f.data)), ` · ${f.nome}`))));
      if (!lista.length) listaEl.appendChild(h("li", { class: "sub" }, `Os feriados até ${ate} já estão bloqueados.`));
    };
    chkSP.addEventListener("change", pintarLista);
    chkFac.addEventListener("change", pintarLista);   // plano 2000d · DC-349
    cidadeData.querySelector("input").addEventListener("change", pintarLista);
    cidadeNome.querySelector("input").addEventListener("change", pintarLista);
    pintarLista();
    if (!lista.length) { ui.toast(`Os feriados nacionais até ${ate} já estão bloqueados.`, { tipo: "info" }); return; }
    const ok = await ui.modal({ titulo: "Bloquear feriados", largura: "p",
      corpo: h("div", { class: "pilha" },
        h("p", null, `Os feriados até ${ate} que ainda não têm bloqueio ficam fechados o dia inteiro — para a equipe e para a IA. Desmarque os dias em que vai abrir.`),
        h("label", { class: "agc-copiar-dia" }, chkSP, h("span", null, "Incluir o feriado do estado de São Paulo (9 de julho)")),
        h("label", { class: "agc-copiar-dia" }, chkFac, h("span", null, "Incluir Carnaval (segunda e terça) e Corpus Christi")),
        h("div", { class: "form-grade" }, cidadeData, cidadeNome),
        // plano 1500c · GX-065: marcar ou desmarcar os ~20 feriados de uma vez (quem só fecha 2 ou 3 não desmarca um a um)
        h("div", { class: "agc-feriados-todos", role: "group", "aria-label": "Seleção dos feriados" },
          h("button", { type: "button", class: "bt bt-fant bt-p agc-feriados-marcar", on: { click: () => { for (const c of caixas) c.checked = true; } } }, "Marcar todos"),
          h("button", { type: "button", class: "bt bt-fant bt-p agc-feriados-desmarcar", on: { click: () => { for (const c of caixas) c.checked = false; } } }, "Desmarcar todos")),
        listaEl,
        h("p", { class: "campo-ajuda" }, "Carnaval e Corpus Christi são ponto facultativo: entram só com a caixa acima marcada.")),
      acoes: [{ rotulo: "Cancelar", tipo: "neutro", valor: false }, { rotulo: "Bloquear os marcados", tipo: "primario", valor: true }] });
    if (!ok) return;
    const escolhidos = lista.filter((f, i) => caixas[i] && caixas[i].checked !== false);
    if (!escolhidos.length) { ui.toast("Nenhum feriado marcado.", { tipo: "info" }); return; }
    let feitos = 0;
    const criados = [], falhas = [];      // plano 1000b · CB-159: os ids criados — o «Desfazer» exclui só eles
    // plano 1500c · CC-185: até 4 gravações ao mesmo tempo (eram ~20 em fila); a lista de bloqueios fica com a resposta mais completa
    const gravar = () => emParalelo(escolhidos, 4, async f => {
      try {
        const r = await api.rpcC("nx_agenda_bloqueio_salvar", { p_bloqueio: { data: f.data, motivo: f.nome } });
        if (r && Array.isArray(r.bloqueios) && (!Array.isArray(estado.bloqueios) || r.bloqueios.length >= estado.bloqueios.length)) estado = r;
        if (r && r.id != null) criados.push(r.id);
        feitos++;
      } catch (e) { falhas.push([f, e]); }
    });
    await ui.carregando(btFeriados, gravar());
    desenharBloqueios();
    if (falhas.length) {
      ui.toast(`${feitos ? `${feitos} feriado${feitos === 1 ? "" : "s"} bloqueado${feitos === 1 ? "" : "s"}; ` : ""}não salvos: ${falhas.slice(0, 3).map(([f]) => dm(f.data)).join(", ")}${falhas.length > 3 ? "…" : ""} (${mensagemBloqueio(falhas[0][1]) || api.mensagemErro(falhas[0][1])})`, { tipo: "erro" });
      if (!feitos) return;
    }
    const texto = `${feitos} feriado${feitos === 1 ? "" : "s"} bloqueado${feitos === 1 ? "" : "s"}.`;
    if (!criados.length || typeof ui.acaoComDesfazer !== "function") { if (!falhas.length) ui.toast(texto, { tipo: "ok" }); return; }
    ui.acaoComDesfazer({ texto, reverter: async () => {
      // plano 1500c · CC-184: um erro não para os outros — o aviso diz quantos não foram desfeitos
      let erros = 0;
      for (const id of criados) {
        try { const r = await api.rpcC("nx_agenda_bloqueio_excluir", { p_id: id }); if (r && Array.isArray(r.bloqueios)) estado = r; }
        catch (e) { erros++; console.error("agenda: desfazer feriado", e); }
      }
      desenharBloqueios();
      if (erros) ui.toast(`${erros} feriado${erros === 1 ? " não foi desfeito" : "s não foram desfeitos"}. Remova pela lista de bloqueios.`, { tipo: "erro" });
    } });
  }

  async function criarBloqueio(existente = null) {
    const ed = existente && existente.id != null ? camposDoBloqueio(existente) : null;   // CB-161: editando
    const campoData = ui.campo({ rotulo: "Data inicial", nome: "data", tipo: "data", valor: ed ? ed.data : ui.hojeSP() });
    const campoFim = ui.campo({ rotulo: "Data final (opcional)", nome: "data_fim", tipo: "data", valor: ed ? ed.data_fim : undefined });
    // plano 1000b · CB-181: a data final não oferece dia antes da inicial (min acompanha a inicial)
    const inData = campoData.querySelector("input"), inFim = campoFim.querySelector("input");
    const ajustarMin = () => { if (inData.value) inFim.setAttribute("min", inData.value); else inFim.removeAttribute("min"); if (inFim.value && inData.value && inFim.value < inData.value) inFim.value = inData.value; };
    inData.addEventListener("change", ajustarMin);
    ajustarMin();
    const corpo = h("div", { class: "pilha agc-form" },
      h("div", { class: "form-grade" }, campoData, campoFim),
      h("p", { class: "campo-ajuda" }, "Deixe os horários vazios para bloquear o dia inteiro. Para bloquear algumas horas, preencha início e fim."),
      h("div", { class: "form-grade" },
        ui.campo({ rotulo: "Das", nome: "das", tipo: "hora", valor: ed ? ed.das : undefined }),
        ui.campo({ rotulo: "Até", nome: "ate", tipo: "hora", valor: ed ? ed.ate : undefined })),
      // plano 1500c · GX-066: «Manhã» / «Tarde» preenchem os horários pelo expediente do dia escolhido (meia folga em um toque)
      h("div", { class: "agc-meio-dia", role: "group", "aria-label": "Preencher os horários" },
        h("button", { type: "button", class: "bt bt-fant bt-p agc-manha", on: { click: () => preencherMeio("manha") } }, "Manhã"),
        h("button", { type: "button", class: "bt bt-fant bt-p agc-tarde", on: { click: () => preencherMeio("tarde") } }, "Tarde"),
        h("button", { type: "button", class: "bt bt-fant bt-p agc-dia-inteiro", on: { click: () => preencherMeio(null) } }, "Dia inteiro")),
      ui.campo({ rotulo: "Motivo (opcional)", nome: "motivo", max: 120, placeholder: "Ex.: feriado, manutenção", valor: ed ? ed.motivo : undefined }),
      // plano 1500c · GX-056: os motivos comuns num toque (o mesmo da janela da grade)
      h("div", { class: "agc-motivos", role: "group", "aria-label": "Motivos comuns" },
        MOTIVOS_BLOQUEIO_CFG.map(mv => h("button", { type: "button", class: "ag-serv-chip agc-motivo", dataset: { motivo: mv }, on: { click: () => { const i = corpo.querySelector('input[name="motivo"]'); if (i) { i.value = mv; try { i.focus(); } catch { /* ok */ } } for (const c of corpo.querySelectorAll(".agc-motivo")) c.setAttribute("aria-pressed", String(c.dataset.motivo === mv)); } }, "aria-pressed": String(!!(ed && ed.motivo === mv)) }, mv))));   // plano 2000d · GY-087
    function preencherMeio(qual) {
      const das = corpo.querySelector('input[name="das"]'), ate = corpo.querySelector('input[name="ate"]');
      if (!das || !ate) return;
      if (!qual) { das.value = ""; ate.value = ""; return; }
      const meios = meiosDoDia(cfg.horario || horarioHerdado || null, corpo.querySelector('input[name="data"]').value, cfg.intervalos || []);
      [das.value, ate.value] = meios[qual];
    }
    // CA-210: consultas já marcadas no período — avisa antes de salvar (os pacientes continuariam marcados num horário fechado)
    let linkAgenda = null;
    const avisoTxt = h("span");
    const aviso = h("div", { class: "aviso aviso-aten agc-aviso-consultas", role: "alert", hidden: true }, ui.icone("info"),
      // plano 1500c · GX-067: «Abrir a Agenda» vai ao DIA da primeira consulta afetada (#/agenda?dia=…), não à semana de hoje
      h("div", null, avisoTxt, " ", linkAgenda = h("a", { href: "#/agenda", class: "agc-ver-agenda", on: { click: ev => { ev.preventDefault(); if (fecharModal) fecharModal(null); if (typeof ctx.navegar === "function") ctx.navegar(linkAgenda.getAttribute("href") || "#/agenda"); } } }, "Abrir a Agenda")));
    corpo.appendChild(aviso);
    let conferido = "", fecharModal = null;
    const r = await ui.modal({ titulo: ed ? "Editar bloqueio" : "Bloquear horário", corpo, largura: "p", aoAbrir: a => { fecharModal = v => a.fechar(v); }, acoes: [
      { rotulo: "Cancelar", tipo: "neutro", valor: null },
      { rotulo: "Salvar bloqueio", tipo: "primario", fn: async m => {
        const d = ui.lerForm(corpo);
        if (!d.data) { m.erro("Escolha uma data inicial."); return false; }
        if (dataBloqueioPassada(d.data, ui.hojeSP()) && !(ed && d.data === ed.data)) { m.erro("A data inicial já passou. Escolha hoje ou uma data futura."); return false; }   // CA-211 (editar um bloqueio em curso mantém a data)
        if (d.data_fim && d.data_fim < d.data) { m.erro("A data final precisa ser igual ou posterior à data inicial."); return false; }
        if (bloqueioLongoDemais(d.data, d.data_fim)) { m.erro("O bloqueio pode ter no máximo 1 ano."); return false; }   // plano 1500c · CC-296
        // plano 1500c · CC-166: horas em vários dias viram um bloqueio por dia — até 62 dias (mais que isso: Pausas)
        if (d.das && d.ate && d.data_fim && d.data_fim > d.data && Math.round((Date.parse(`${d.data_fim}T12:00:00Z`) - Date.parse(`${d.data}T12:00:00Z`)) / 864e5) >= 62) {
          m.erro("Para algumas horas em mais de 2 meses de dias, use «Pausas e almoço» (vale para todos os dias)."); return false;
        }
        if (!!d.das !== !!d.ate) { m.erro("Preencha os dois horários ou deixe os dois vazios."); return false; }
        if (d.das && (!/^([01]\d|2[0-3]):[0-5]\d$/.test(d.das) || !/^([01]\d|2[0-3]):[0-5]\d$/.test(d.ate) || d.das >= d.ate)) { m.erro("Confira o intervalo. O horário final precisa ser posterior ao inicial."); return false; }
        const periodo = JSON.stringify([d.data, d.data_fim || "", d.das || "", d.ate || ""]);
        if (periodo !== conferido) {
          try {
            // plano 1000b · CB-146: férias de 45 dias liam só 31 — agora em blocos de 31 até a data final (no máximo 6)
            const lidas = [];
            for (const p of blocosDeLeitura(d.data, d.data_fim || null)) { const ag = await api.rpcC("nx_agenda_dia", p); if (ag && Array.isArray(ag.consultas)) lidas.push(...ag.consultas); }
            const caem = consultasNoBloqueio(lidas, { data: d.data, data_fim: d.data_fim || null, das: d.das || null, ate: d.ate || null, duracao: Number(cfg.duracao_min) || 30 });
            conferido = periodo;
            if (caem.length) {
              if (linkAgenda && diaSP(primeiraDe(caem))) linkAgenda.setAttribute("href", `#/agenda?dia=${diaSP(primeiraDe(caem))}`);   // GX-067
              const palB = palavraDaAgenda(ctx.vocab);   // plano 2000d · GY-086: a palavra da vertical (e «As pessoas», não «Os pacientes», fora da saúde)
              const nomes = caem.slice(0, 3).map(c => `${c.nome || c.titulo || palB} (${ui.dataHoraBR(c.inicio)})`).join(", ");
              avisoTxt.textContent = `${caem.length === 1 ? `1 ${palB} cai` : `${caem.length} ${palB}s caem`} neste bloqueio: ${nomes}${caem.length > 3 ? "…" : ""}. ${palB === "consulta" ? "Os pacientes continuam marcados" : "As pessoas continuam marcadas"} — remarque ou desmarque pela Agenda. Para bloquear mesmo assim, toque em «Salvar bloqueio» de novo.`;
              aviso.hidden = false;
              m.erro(`${caem.length === 1 ? `Há 1 ${palB}` : `Há ${caem.length} ${palB}s`} marcada${caem.length === 1 ? "" : "s"} neste período.`);
              return false;
            }
          } catch { conferido = periodo; /* sem a leitura da agenda: o servidor decide */ }
        }
        // plano 1500c · CC-166: com horário e data final, um bloqueio por dia (o servidor só usava a data inicial e a tela dizia «salvo»)
        const partes = bloqueiosDoPeriodo({ data: d.data, data_fim: d.data_fim || null, das: d.das || null, ate: d.ate || null, motivo: d.motivo || null });
        const criados = [];
        let ultimo = null;
        try {
          for (const [i, p] of partes.entries()) {
            const dados = { ...(ed && i === 0 ? { id: existente.id } : {}), ...p };
            ultimo = await api.rpcC("nx_agenda_bloqueio_salvar", { p_bloqueio: dados });
            if (ultimo && ultimo.ok === false) throw Object.assign(new Error(ultimo.erro || "dados_invalidos"), { codigo: ultimo.erro, hint: ultimo.hint });
            if (!(ed && i === 0) && ultimo && ultimo.id != null) criados.push(ultimo.id);
          }
          return { ...(ultimo || {}), ok: true, _criados: criados, _dias: partes.length };
        } catch (e) {
          // plano 1500c · CC-297: «limite_atingido» e o «1 ano» do servidor em português claro
          const txt = mensagemBloqueio(e) || api.mensagemErro(e);
          if (criados.length) {
            // parte dos dias foi gravada: desfaz o que entrou (a janela continua aberta para corrigir)
            for (const id of criados) { try { const rr = await api.rpcC("nx_agenda_bloqueio_excluir", { p_id: id }); if (rr && Array.isArray(rr.bloqueios)) estado = rr; } catch { /* fica na lista */ } }
            desenharBloqueios();
          }
          m.erro(txt); return false;
        }
      } },
    ] });
    if (r && r.ok) {
      if (Array.isArray(r.bloqueios)) estado = r;
      desenharBloqueios();
      const n = r._dias || 1;
      const texto = ed ? "Bloqueio atualizado." : n > 1 ? `${n} bloqueios salvos (um por dia).` : "Bloqueio salvo.";
      // plano 2000d · DC-385: um bloqueio só também tem «Desfazer» (antes só o grupo de vários dias)
      const idsNovos = Array.isArray(r._criados) && r._criados.length ? r._criados.slice() : r.id != null ? [r.id] : [];
      if (!ed && idsNovos.length && typeof ui.acaoComDesfazer === "function") {
        const ids = idsNovos;
        ui.acaoComDesfazer({ texto, reverter: async () => {     // um «Desfazer» só para o grupo
          let erros = 0;
          for (const id of ids) { try { const rr = await api.rpcC("nx_agenda_bloqueio_excluir", { p_id: id }); if (rr && Array.isArray(rr.bloqueios)) estado = rr; } catch { erros++; } }
          desenharBloqueios();
          if (erros) ui.toast(`${erros} bloqueio${erros === 1 ? " não foi desfeito" : "s não foram desfeitos"}. Remova pela lista.`, { tipo: "erro" });
        } });
      } else ui.toast(texto, { tipo: "ok" });
    }
  }
  // plano 1500c · GX-072: o «Descartar» remonta a seção — quem guardou o retorno da 1ª montagem (config.js) passa a ler a montagem viva
  const minha = { sujo: () => sujo };
  secaoViva = minha;
  const sujaAgora = () => (secaoViva ? secaoViva.sujo() : sujo);
  return {
    limpar: () => { trocarAvisoSaida(null); secaoViva = null; },   // plano 1500c · GX-057 (a montagem viva, mesmo depois do «Descartar»)
    pendente: () => sujaAgora(),
    podeSair: async () => !sujaAgora() || ui.confirmar({ titulo: "Sair sem salvar a agenda?", rotulo: "Sair sem salvar", perigo: true,
      texto: "As mudanças de horários e durações ainda não foram salvas e serão perdidas." }),
  };
}
