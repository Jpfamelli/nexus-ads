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
  for (let i = 1; i <= 7; i++) {
    const id = String(i % 7);
    const brutas = horario && Array.isArray(horario[id]) ? horario[id] : [];
    const faixas = brutas.map(f => [paraHoras(f && f[0]), paraHoras(f && f[1])]).filter(([a, b]) => a !== null && b !== null && b > a);
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
/** CA-211: a data inicial do bloqueio não pode ter passado (o bloqueio de ontem não aparece na lista e confunde). */
export function dataBloqueioPassada(data, hoje) { return !!data && !!hoje && String(data) < String(hoje); }
/** CA-210: as consultas que caem no período do bloqueio — dias [data, data_fim] e, com horário, só as que cruzam [das, ate). */
export function consultasNoBloqueio(consultas, { data, data_fim = null, das = null, ate = null } = {}) {
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
    const horaFim = Number.isFinite(tf) ? (() => { const q = Object.fromEntries(fmt.formatToParts(new Date(tf)).map(x => [x.type, x.value])); return `${q.hour}:${q.minute}`; })() : hora;
    return hora < ate && (horaFim > das || hora >= das);
  });
}

function listaFaixas(h, ui, dia, faixas, habilitado) {
  const caixa = h("div", { class: "agc-faixas", hidden: !habilitado });
  const linhas = h("div", { class: "agc-faixas-linhas" });   // as faixas ficam antes dos botões (adicionar não cai depois de «Adicionar horário»)
  function adicionar([de = "08:00", ate = "18:00"] = []) {
    const inicio = h("input", { type: "time", value: de, step: 300, "aria-label": `${dia}: início do horário` });
    const fim = h("input", { type: "time", value: ate, step: 300, "aria-label": `${dia}: fim do horário` });
    const remover = h("button", { type: "button", class: "bt-icone agc-remover", "aria-label": `Remover faixa de ${dia}`, on: { click: () => linha.remove() } }, ui.icone("fechar"));
    const linha = h("div", { class: "agc-faixa" }, inicio, h("span", null, "até"), fim, remover);
    linhas.appendChild(linha);
  }
  for (const faixa of faixas) adicionar(faixa);
  const add = h("button", { type: "button", class: "bt bt-fant bt-p agc-add-faixa", on: { click: () => adicionar() } }, ui.icone("mais"), "Adicionar horário");
  const botoes = h("div", { class: "agc-faixas-bts" }, add);
  caixa.append(linhas, botoes);
  return { caixa, botoes, adicionar,
    ler: () => [...caixa.querySelectorAll(".agc-faixa")].map(l => [l.querySelector("input").value, l.querySelectorAll("input")[1].value]),
    /** CA-208: troca as faixas do dia pelas de outro (copiar para os dias úteis). */
    definir: novas => { ui.limpar(linhas); for (const f of novas || []) adicionar(f); } };
}

/** Plano 1000 · CA-279: o que está errado nas faixas de um dia ligado → {indice, campo: "inicio"|"fim"|null, msg} ou null (tudo certo). */
export function problemaDasFaixas(faixas) {
  const lista = Array.isArray(faixas) ? faixas : [];
  if (!lista.length) return { indice: -1, campo: null, msg: "adicione pelo menos uma faixa de horário ou desligue o dia." };
  for (const [i, f] of lista.entries()) {
    const [a, b] = Array.isArray(f) ? f : [];
    if (!a) return { indice: i, campo: "inicio", msg: "preencha o início de cada faixa." };
    if (!b) return { indice: i, campo: "fim", msg: "preencha o fim de cada faixa." };
    if (a >= b) return { indice: i, campo: "fim", msg: `o fim (${b}) precisa ser depois do início (${a}).` };
  }
  return null;
}
/** CA-275: o passo dos horários maior que a duração padrão deixa buracos sem oferta — o aviso explica (null = nada a dizer). */
export function avisoPassoDuracao(passo, duracao) {
  const p = Number(passo), d = Number(duracao);
  if (!Number.isInteger(p) || !Number.isInteger(d) || p <= 0 || d <= 0 || p <= d) return null;
  return `Os horários saem a cada ${p} min, mas a consulta padrão dura ${d} min: sobram ${p - d} min sem horário oferecido entre uma consulta e outra.`;
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
export function feriadosParaBloquear(hoje, bloqueios = []) {
  const ano = Number(String(hoje).slice(0, 4));
  if (!Number.isInteger(ano)) return [];
  const dias = (Array.isArray(bloqueios) ? bloqueios : []).map(b => {
    const i = Date.parse(b && b.inicio), f = Date.parse(b && b.fim);
    return Number.isFinite(i) && Number.isFinite(f) && f > i ? [_diaSP.format(new Date(i)), _diaSP.format(new Date(f - 1))] : null;
  }).filter(Boolean);
  return [...feriadosNacionais(ano), ...feriadosNacionais(ano + 1)].filter(x => x.data >= hoje && !dias.some(([a, b]) => a <= x.data && x.data <= b));
}

function linhaIntervalo(h, ui, de = "12:00", ate = "13:00", rotulo = "Intervalo") {
  const inicio = h("input", { type: "time", value: de, step: 300, "aria-label": `${rotulo}: início` });
  const fim = h("input", { type: "time", value: ate, step: 300, "aria-label": `${rotulo}: fim` });
  const linha = h("div", { class: "agc-faixa" }, inicio, h("span", null, "até"), fim,
    h("button", { type: "button", class: "bt-icone agc-remover", "aria-label": `Remover ${rotulo.toLowerCase()}`, on: { click: () => linha.remove() } }, ui.icone("fechar")));
  return linha;
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
  let sujo = false;
  const marcarSujo = () => { sujo = true; };

  const usarAgenda = ui.campo({ tipo: "interruptor", nome: "usar_horario", rotulo: "Definir horários nesta agenda", valor: cfg.horario_fonte === "agenda",
    ajuda: cfg.horario_fonte === "departamento" ? "No momento, os horários vêm do departamento padrão." : cfg.horario_fonte === "padrao" ? "No momento, vale o padrão de segunda a sexta, das 8h às 18h." : "Desligado, a agenda usa o horário do departamento padrão." });
  const gradeDias = h("div", { class: "agc-dias" });
  const controlesDia = [];
  for (const [id, nome] of DIAS) {
    const atual = cfg.horario && cfg.horario[id];
    const faixas = Array.isArray(atual) ? atual : [];
    const ligada = ui.campo({ tipo: "interruptor", nome: `dia_${id}`, rotulo: nome, valor: faixas.length > 0 });
    const linhas = listaFaixas(h, ui, nome, faixas, faixas.length > 0);
    ligada.querySelector("input").addEventListener("change", ev => {
      linhas.caixa.hidden = !ev.target.checked;
      if (ev.target.checked && !linhas.caixa.querySelector(".agc-faixa")) linhas.adicionar();
    });
    // CA-208: o horário de um dia vai para segunda a sexta num toque (configurar a semana não exige repetir as faixas 5 vezes)
    linhas.botoes.appendChild(h("button", { type: "button", class: "bt bt-fant bt-p agc-copiar", on: { click: () => copiarParaUteis(id) } }, "Copiar para os dias úteis"));
    const erroDia = h("p", { class: "agc-erro-dia", role: "alert", hidden: true });   // CA-207/CA-279: o erro aparece no próprio dia
    gradeDias.appendChild(h("div", { class: "agc-dia", dataset: { dia: id } }, ligada, erroDia, linhas.caixa));
    controlesDia.push({ id, nome, ligada: ligada.querySelector("input"), linhas, erroDia });
  }
  function copiarParaUteis(deId) {
    const origem = controlesDia.find(d => d.id === deId);
    const faixas = origem.linhas.ler();
    for (const d of controlesDia) {
      if (d.id === deId || !["1", "2", "3", "4", "5"].includes(d.id)) continue;
      d.ligada.checked = faixas.length > 0;
      d.linhas.caixa.hidden = !faixas.length;
      d.linhas.definir(faixas);
      d.erroDia.hidden = true;
    }
    marcarSujo();
    pintarPrevia();
    ui.toast(`Horário de ${origem.nome} copiado para os dias úteis.`, { tipo: "ok" });
  }

  const intervalos = h("div", { class: "agc-intervalos" });
  const pausas = Array.isArray(cfg.intervalos) ? cfg.intervalos : [];
  for (const faixa of pausas) intervalos.appendChild(linhaIntervalo(h, ui, faixa[0], faixa[1]));
  const addIntervalo = h("button", { type: "button", class: "bt bt-fant bt-p", on: { click: () => intervalos.appendChild(linhaIntervalo(h, ui)) } }, ui.icone("mais"), "Adicionar intervalo");

  const duracoes = h("div", { class: "agc-duracoes" });
  function adicionarDuracao(nome = "", minutos = cfg.duracao_min || 30) {
    const servico = h("input", { type: "text", value: nome, maxlength: 60, placeholder: "Nome do serviço", "aria-label": "Nome do serviço" });
    const tempo = h("input", { type: "number", min: 5, max: 480, step: 5, value: String(minutos), "aria-label": `Duração em minutos para ${nome || "o serviço"}` });
    const linha = h("div", { class: "agc-duracao" }, servico, h("label", null, "min", tempo),
      h("button", { type: "button", class: "bt-icone agc-remover", "aria-label": `Remover duração de ${nome || "serviço"}`, on: { click: () => linha.remove() } }, ui.icone("fechar")));
    duracoes.appendChild(linha);
  }
  for (const [nome, minutos] of Object.entries(cfg.duracoes || {})) adicionarDuracao(nome, minutos);
  const addDuracao = h("button", { type: "button", class: "bt bt-fant bt-p", on: { click: () => adicionarDuracao() } }, ui.icone("mais"), "Adicionar serviço");

  // prévia ao vivo: o que está marcado acima vira sete colunas de 0 a 24 h (horas úteis por dia e por semana)
  const previaCaixa = h("div", { class: "agc-previa-caixa" });
  function pintarPrevia() {
    ui.limpar(previaCaixa);
    if (!fonteAgenda.checked) { previaCaixa.appendChild(h("p", { class: "campo-ajuda" }, "A prévia aparece quando os horários são definidos nesta agenda.")); return; }
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
    const txt = avisoPasso && avisoPassoDuracao(campoPasso.querySelector("input").value, campoDuracao.querySelector("input").value);
    avisoPasso.textContent = txt || "";
    avisoPasso.hidden = !txt;
  }
  const btSalvar = h("button", { type: "submit", class: "bt bt-prim agc-salvar" }, ui.icone("check"), "Salvar agenda");
  const form = h("form", { class: "pilha agc-form", novalidate: true },
    h("section", { class: "cartao pilha" },
      h("div", { class: "cartao-cab" }, h("div", null, h("h3", { class: "titulo-sec" }, "Disponibilidade"), h("p", { class: "sub" }, "Os horários livres são calculados no fuso de São Paulo."))),
      usarAgenda, gradeDias, previaCaixa,
      h("div", { class: "pilha-p" }, h("div", null, h("h4", null, "Pausas e almoço"), h("p", { class: "sub" }, "Intervalos aplicados a todos os dias de atendimento.")), intervalos, addIntervalo)),
    h("section", { class: "cartao pilha" },
      h("div", { class: "cartao-cab" }, h("div", null, h("h3", { class: "titulo-sec" }, "Duração e capacidade"), h("p", { class: "sub" }, "Ajuste o tempo por serviço. O padrão é usado quando um serviço não tem duração própria."))),
      h("div", { class: "form-grade" },
        campoDuracao,
        ui.campo({ rotulo: "Atendimentos no mesmo horário", nome: "capacidade", tipo: "numero", valor: cfg.capacidade || 1, min: 1, max: 50 }),
        ui.campo({ rotulo: "Antecedência mínima (horas)", nome: "antecedencia_horas", tipo: "numero", valor: cfg.antecedencia_horas ?? 2, min: 0, max: 720,
          ajuda: "Ex.: 2 = ninguém (nem a IA) marca consulta para as próximas 2 horas." }),
        ui.campo({ rotulo: "Agendamento até (dias à frente)", nome: "dias_a_frente", tipo: "numero", valor: cfg.dias_a_frente || 30, min: 1, max: 180 }),
        campoPasso),
      avisoPasso,
      h("div", { class: "pilha-p" }, h("div", null, h("h4", null, "Duração por serviço"), h("p", { class: "sub" }, "Ex.: avaliação 30 min, limpeza 45 min. Até 30 serviços.")), duracoes, addDuracao),
      h("div", { class: "linha linha-fim" }, btSalvar)));

  const fonteAgenda = usarAgenda.querySelector("input");
  const fonteToggle = () => { gradeDias.hidden = !fonteAgenda.checked; pintarPrevia(); };
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
  form.addEventListener("submit", async ev => {
    ev.preventDefault();
    ui.marcarErro(form, null);
    limparInvalidos();
    const dados = ui.lerForm(form);
    const numero = nome => Number(dados[nome]);
    const duracao = numero("duracao_min");
    const capacidade = numero("capacidade");
    const antecedencia = numero("antecedencia_horas");
    const dias = numero("dias_a_frente");
    const passoTxt = dados.passo_min == null || dados.passo_min === "" ? null : Number(dados.passo_min);
    if (!Number.isInteger(duracao) || duracao < 5 || duracao > 480) return ui.toast("A duração padrão deve ficar entre 5 e 480 minutos.", { tipo: "erro" });
    if (!Number.isInteger(capacidade) || capacidade < 1 || capacidade > 50) return ui.toast("A capacidade deve ficar entre 1 e 50 atendimentos.", { tipo: "erro" });
    if (![antecedencia, dias].every(Number.isInteger) || antecedencia < 0 || antecedencia > 720 || dias < 1 || dias > 180) return ui.toast("Confira a antecedência e o limite de dias da agenda.", { tipo: "erro" });
    if (passoTxt !== null && (!Number.isInteger(passoTxt) || passoTxt < 5 || passoTxt > 480)) return ui.toast("O intervalo entre horários deve ficar entre 5 e 480 minutos.", { tipo: "erro" });

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
    const pausasSalvas = [...intervalos.querySelectorAll(".agc-faixa")].map(l => [...l.querySelectorAll("input")].map(x => x.value));
    if (pausasSalvas.some(([a, b]) => !a || !b || a >= b)) return ui.toast("Confira os horários dos intervalos.", { tipo: "erro" });
    const duracoesSalvas = {};
    for (const linha of duracoes.querySelectorAll(".agc-duracao")) {
      const [campoNome, campoTempo] = linha.querySelectorAll("input");
      const nome = campoNome.value.trim();
      if (!nome) { if (campoTempo.value) return ui.toast("Informe o nome de cada serviço com duração própria.", { tipo: "erro" }); continue; }
      const chave = nome.toLocaleLowerCase("pt-BR");
      const minutos = Number(campoTempo.value);
      if (!Number.isInteger(minutos) || minutos < 5 || minutos > 480) return ui.toast(`A duração de “${nome}” deve ficar entre 5 e 480 minutos.`, { tipo: "erro" });
      if (Object.keys(duracoesSalvas).some(s => s.toLocaleLowerCase("pt-BR") === chave)) return ui.toast(`O serviço “${nome}” aparece mais de uma vez.`, { tipo: "erro" });
      duracoesSalvas[nome] = minutos;
    }
    if (Object.keys(duracoesSalvas).length > 30) return ui.toast("A agenda aceita até 30 durações por serviço.", { tipo: "erro" });
    const cfgNova = {
      duracao_min: duracao, capacidade, antecedencia_horas: antecedencia, dias_a_frente: dias,
      passo_min: passoTxt, horario: fonteAgenda.checked ? horario : null,
      intervalos: pausasSalvas, duracoes: duracoesSalvas,
    };
    try {
      const salvo = await ui.carregando(btSalvar, api.rpcC("nx_agenda_config_salvar", { p_cfg: cfgNova }));
      // CA-212: a seção NÃO é redesenhada (a rolagem e o foco ficavam no topo): o estado é atualizado e o «Salvar» confirma com o check
      if (salvo && typeof salvo === "object" && Array.isArray(salvo.bloqueios)) { estado = salvo; desenharBloqueios(); }
      sujo = false;
      ui.toast("Agenda salva.", { tipo: "ok" });
      try { btSalvar.focus({ preventScroll: true }); } catch { btSalvar.focus(); }
      if (typeof ui.checkSucesso === "function") ui.checkSucesso(btSalvar, { texto: "Agenda salva" });
    } catch (e) { ui.toast(api.mensagemErro(e), { tipo: "erro" }); }
  });

  /* ---------- bloqueios (CA-278: um nome só — «Bloqueio»: «Bloquear horário», «Bloqueios futuros») ---------- */
  const listaBloqueios = h("div", { class: "agc-bloqueios", role: "list" });
  const POR_PAGINA = 30;
  let mostrar = POR_PAGINA;                 // CA-273: «Ver mais» pagina no cliente (estado.bloqueios já vem inteiro)
  const ocultos = new Set();                // CA-272: removidos com «Desfazer» ainda no prazo (a exclusão real sai quando o aviso fecha)
  function desenharBloqueios() {
    ui.limpar(listaBloqueios);
    const todos = (estado.bloqueios || []).filter(b => b.fim && new Date(b.fim) > new Date() && !ocultos.has(b.id));
    const futuros = todos.slice(0, mostrar);
    if (!futuros.length) listaBloqueios.appendChild(h("p", { class: "sub" }, "Nenhum bloqueio futuro."));
    for (const b of futuros) {
      const excluir = h("button", { type: "button", class: "bt bt-fant bt-p", "aria-label": `Remover bloqueio de ${ui.dataHoraBR(b.inicio)}`, on: { click: () => removerBloqueio(b, excluir) } }, ui.icone("lixeira"), "Remover");
      listaBloqueios.appendChild(h("article", { class: "agc-bloqueio", role: "listitem", dataset: { id: b.id } },
        h("div", null, h("b", null, b.motivo || "Bloqueio"), h("small", null, ui.periodoBR(b.inicio, b.fim, " — "))), excluir));
    }
    if (todos.length > futuros.length) {
      const resto = todos.length - futuros.length;
      listaBloqueios.appendChild(h("button", { type: "button", class: "bt bt-fant bt-p agc-ver-mais", on: { click: () => { mostrar += POR_PAGINA; desenharBloqueios(); } } },
        `Ver mais ${Math.min(resto, POR_PAGINA)} de ${resto}`));
    }
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
      aplicar: () => { ocultos.add(b.id); desenharBloqueios(); },
      firmar: excluirAgora,
      reverter: () => { ocultos.delete(b.id); desenharBloqueios(); },
    });
  }
  desenharBloqueios();

  const btBloqueio = h("button", { type: "button", class: "bt bt-sec", on: { click: criarBloqueio } }, ui.icone("mais"), "Bloquear horário");
  const btFeriados = h("button", { type: "button", class: "bt bt-fant agc-feriados", on: { click: bloquearFeriados } }, ui.icone("calendario"), "Bloquear feriados nacionais");
  raiz.append(form, h("section", { class: "cartao pilha" },
    h("div", { class: "cartao-cab" }, h("div", null, h("h3", { class: "titulo-sec" }, "Bloqueios futuros"), h("p", { class: "sub" }, "Feche um dia inteiro ou só algumas horas: feriado, folga, manutenção.")),
      h("div", { class: "linha agc-bloq-acoes" }, btFeriados, btBloqueio)),
    listaBloqueios));

  /** CA-258: os feriados nacionais de hoje até o fim do ano que vem viram bloqueios do dia inteiro (com o nome como motivo); os já bloqueados ficam. */
  async function bloquearFeriados() {
    const hoje = ui.hojeSP();
    const lista = feriadosParaBloquear(hoje, estado.bloqueios || []);
    const ate = `dez/${Number(hoje.slice(0, 4)) + 1}`;
    if (!lista.length) { ui.toast(`Os feriados nacionais até ${ate} já estão bloqueados.`, { tipo: "info" }); return; }
    const dm = iso => `${iso.slice(8, 10)}/${iso.slice(5, 7)}/${iso.slice(0, 4)}`;
    const ok = await ui.modal({ titulo: `Bloquear ${lista.length} feriado${lista.length === 1 ? "" : "s"}?`, largura: "p",
      corpo: h("div", { class: "pilha" },
        h("p", null, `Os feriados nacionais até ${ate} que ainda não têm bloqueio ficam fechados o dia inteiro — para a equipe e para a IA.`),
        h("ul", { class: "agc-feriados-lista" }, lista.map(f => h("li", null, h("span", { class: "dado" }, dm(f.data)), ` · ${f.nome}`))),
        h("p", { class: "campo-ajuda" }, "Carnaval e Corpus Christi são ponto facultativo e ficam de fora. Feriados da cidade e do estado: use «Bloquear horário».")),
      acoes: [{ rotulo: "Cancelar", tipo: "neutro", valor: false }, { rotulo: `Bloquear ${lista.length}`, tipo: "primario", valor: true }] });
    if (!ok) return;
    let feitos = 0;
    const gravar = async () => {
      for (const f of lista) {
        const r = await api.rpcC("nx_agenda_bloqueio_salvar", { p_bloqueio: { data: f.data, motivo: f.nome } });
        if (r && Array.isArray(r.bloqueios)) estado = r;
        feitos++;
      }
    };
    try { await ui.carregando(btFeriados, gravar()); }
    catch (e) { ui.toast(`${feitos ? `${feitos} feriado${feitos === 1 ? "" : "s"} bloqueado${feitos === 1 ? "" : "s"}; o resto não foi salvo: ` : ""}${api.mensagemErro(e)}`, { tipo: "erro" }); }
    desenharBloqueios();
    if (feitos === lista.length) ui.toast(`${feitos} feriado${feitos === 1 ? "" : "s"} bloqueado${feitos === 1 ? "" : "s"}.`, { tipo: "ok" });
  }

  async function criarBloqueio() {
    const corpo = h("div", { class: "pilha agc-form" },
      h("div", { class: "form-grade" },
        ui.campo({ rotulo: "Data inicial", nome: "data", tipo: "data", valor: ui.hojeSP() }),
        ui.campo({ rotulo: "Data final (opcional)", nome: "data_fim", tipo: "data" })),
      h("p", { class: "campo-ajuda" }, "Deixe os horários vazios para bloquear o dia inteiro. Para bloquear algumas horas, preencha início e fim."),
      h("div", { class: "form-grade" },
        ui.campo({ rotulo: "Das", nome: "das", tipo: "hora" }),
        ui.campo({ rotulo: "Até", nome: "ate", tipo: "hora" })),
      ui.campo({ rotulo: "Motivo (opcional)", nome: "motivo", max: 120, placeholder: "Ex.: feriado, manutenção" }));
    // CA-210: consultas já marcadas no período — avisa antes de salvar (os pacientes continuariam marcados num horário fechado)
    const avisoTxt = h("span");
    const aviso = h("div", { class: "aviso aviso-aten agc-aviso-consultas", role: "alert", hidden: true }, ui.icone("info"),
      h("div", null, avisoTxt, " ", h("a", { href: "#/agenda", class: "agc-ver-agenda", on: { click: ev => { ev.preventDefault(); if (fecharModal) fecharModal(null); if (typeof ctx.navegar === "function") ctx.navegar("#/agenda"); } } }, "Abrir a Agenda")));
    corpo.appendChild(aviso);
    let conferido = "", fecharModal = null;
    const r = await ui.modal({ titulo: "Bloquear horário", corpo, largura: "p", aoAbrir: a => { fecharModal = v => a.fechar(v); }, acoes: [
      { rotulo: "Cancelar", tipo: "neutro", valor: null },
      { rotulo: "Salvar bloqueio", tipo: "primario", fn: async m => {
        const d = ui.lerForm(corpo);
        if (!d.data) { m.erro("Escolha uma data inicial."); return false; }
        if (dataBloqueioPassada(d.data, ui.hojeSP())) { m.erro("A data inicial já passou. Escolha hoje ou uma data futura."); return false; }   // CA-211
        if (d.data_fim && d.data_fim < d.data) { m.erro("A data final precisa ser igual ou posterior à data inicial."); return false; }
        if (!!d.das !== !!d.ate) { m.erro("Preencha os dois horários ou deixe os dois vazios."); return false; }
        if (d.das && (!/^([01]\d|2[0-3]):[0-5]\d$/.test(d.das) || !/^([01]\d|2[0-3]):[0-5]\d$/.test(d.ate) || d.das >= d.ate)) { m.erro("Confira o intervalo. O horário final precisa ser posterior ao inicial."); return false; }
        const periodo = JSON.stringify([d.data, d.data_fim || "", d.das || "", d.ate || ""]);
        if (periodo !== conferido) {
          try {
            const dias = Math.min(31, Math.max(1, Math.round((Date.parse(`${d.data_fim || d.data}T12:00:00Z`) - Date.parse(`${d.data}T12:00:00Z`)) / 864e5) + 1));
            const ag = await api.rpcC("nx_agenda_dia", { p_data: d.data, p_dias: dias });
            const caem = consultasNoBloqueio(ag && ag.consultas, { data: d.data, data_fim: d.data_fim || null, das: d.das || null, ate: d.ate || null });
            conferido = periodo;
            if (caem.length) {
              const nomes = caem.slice(0, 3).map(c => `${c.nome || c.titulo || "consulta"} (${ui.dataHoraBR(c.inicio)})`).join(", ");
              avisoTxt.textContent = `${caem.length === 1 ? "1 consulta cai" : `${caem.length} consultas caem`} neste bloqueio: ${nomes}${caem.length > 3 ? "…" : ""}. Os pacientes continuam marcados — remarque ou desmarque pela Agenda. Para bloquear mesmo assim, toque em «Salvar bloqueio» de novo.`;
              aviso.hidden = false;
              m.erro(`${caem.length === 1 ? "Há 1 consulta" : `Há ${caem.length} consultas`} marcada${caem.length === 1 ? "" : "s"} neste período.`);
              return false;
            }
          } catch { conferido = periodo; /* sem a leitura da agenda: o servidor decide */ }
        }
        try {
          const dados = { data: d.data, ...(d.data_fim ? { data_fim: d.data_fim } : {}), ...(d.das ? { das: d.das, ate: d.ate } : {}), motivo: d.motivo || null };
          return await api.rpcC("nx_agenda_bloqueio_salvar", { p_bloqueio: dados });
        } catch (e) { m.erro(api.mensagemErro(e)); return false; }
      } },
    ] });
    if (r && r.ok) { estado = r; desenharBloqueios(); ui.toast("Bloqueio salvo.", { tipo: "ok" }); }
  }
  return {
    limpar: () => {},
    pendente: () => sujo,
    podeSair: async () => !sujo || ui.confirmar({ titulo: "Sair sem salvar a agenda?", rotulo: "Sair sem salvar", perigo: true,
      texto: "As mudanças de horários e durações ainda não foram salvas e serão perdidas." }),
  };
}
