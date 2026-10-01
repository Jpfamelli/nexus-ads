/* ============================================================
   NEXUS ADS — nucleo.js
   Lógica PURA (sem DOM, sem rede), usada igual no painel (navegador)
   e nas Edge Functions (Deno). Se o painel e o relatório do WhatsApp
   fizerem contas separadas, um dia vão discordar — então todo mundo
   calcula daqui.

   Modelo de dados ("dataset"):
     LINHAS  uma linha por criativo por dia
             { i, plat, camp, cri, gasto, impressoes, alcance, cliques, conversoes, freq }
     LEADS   um paciente por conversa
             { id, i, iAgenda, iConsulta, camp, cri, plat, servico, nome, telefone,
               compareceu, fechou, valor?, fator?, etapaReal?, obs? }
     CAMP    { [id]: { id, plat, nome, curto } }
     CRI     { [id]: { id, camp, plat, nome, curto } }
     CFG     { cpaAlvo, orcamento, fee, ticket{}, regrasOff[], assinatura, proximos{} }
     REF     Date (meio-dia de ONTEM no fuso do cliente) · DIAS = tamanho da janela
   Índice i: 0 … DIAS-1, onde DIAS-1 = ontem (sempre dia fechado).
   ============================================================ */

/* ============================================================
   1. FORMATAÇÃO
   ============================================================ */
export const fin = v => v != null && Number.isFinite(v);
export const brl = v => fin(v) ? v.toLocaleString("pt-BR", { style: "currency", currency: "BRL" }) : "—";
export const brl0 = v => fin(v) ? v.toLocaleString("pt-BR", { style: "currency", currency: "BRL", maximumFractionDigits: 0 }) : "—";
export const int = v => fin(v) ? Math.round(v).toLocaleString("pt-BR") : "—";
export const pc = (v, d = 1) => fin(v) ? v.toFixed(d).replace(".", ",") + "%" : "—";
export const dec = (v, d = 1) => fin(v) ? v.toFixed(d).replace(".", ",") : "—";
export const esc = s => String(s ?? "").replace(/[&<>"]/g, c => ({ "&": "&amp;", "<": "&lt;", ">": "&gt;", '"': "&quot;" }[c]));
export const fmtN = (v, f) => f === "brl" ? brl(v) : f === "brl0" ? brl0(v) : f === "x" ? dec(v, 1) + "x" : int(v);
export const razao = (a, b) => (b ? a / b * 100 : null);
/** Variação percentual. null quando não há base (mesma regra do metricas.js). */
export const variacao = (a, b) => (!fin(a) || !fin(b)) ? null : b === 0 ? (a === 0 ? 0 : null) : (a - b) / b * 100;
export const seta = v => (v == null ? "" : v > .5 ? " ↑" : v < -.5 ? " ↓" : " →");
export const varTxt = (a, b) => { const v = variacao(a, b); return v == null ? "—" : `${v > 0 ? "+" : ""}${v.toFixed(0)}%${seta(v)}`; };
export const plural = (n, um, varios) => `${int(n)} ${Math.round(n) === 1 ? um : varios}`;
export const nomePlat = p => (p === "meta" ? "Meta" : p === "google" ? "Google" : "Sem anúncio");

/** *negrito* e _itálico_ do WhatsApp → HTML (texto escapado antes). */
export const waHtml = txt => esc(txt)
  .replace(/\*([^*\n]+)\*/g, "<b>$1</b>")
  .replace(/(^|[\s(])_([^_\n]+)_/g, "$1<i>$2</i>")
  .replace(/\n/g, "<br>");

export const MESES = ["janeiro", "fevereiro", "março", "abril", "maio", "junho", "julho", "agosto", "setembro", "outubro", "novembro", "dezembro"];
export const MES3 = ["jan", "fev", "mar", "abr", "mai", "jun", "jul", "ago", "set", "out", "nov", "dez"];
export const SEMANA = ["dom", "seg", "ter", "qua", "qui", "sex", "sáb"];
const p2 = n => String(n).padStart(2, "0");

/** "Hoje" no fuso de São Paulo, como YYYY-MM-DD — independente do fuso do servidor. */
export function hojeSP(agora = new Date()) {
  const [d, m, a] = new Intl.DateTimeFormat("pt-BR", { timeZone: "America/Sao_Paulo" }).format(agora).split("/");
  return `${a}-${m}-${d}`;
}
/** Date ao meio-dia (evita pulo de horário de verão) a partir de YYYY-MM-DD. */
export const meioDia = iso => { const [a, m, d] = iso.split("-").map(Number); return new Date(a, m - 1, d, 12, 0, 0, 0); };
export const isoDe = d => `${d.getFullYear()}-${p2(d.getMonth() + 1)}-${p2(d.getDate())}`;
const DIA_MS = 86400000;
const difDias = (a, b) => Math.round((meioDia(isoDe(a)) - meioDia(isoDe(b))) / DIA_MS);

/** Nome curto e legível para campanha/anúncio vindo da plataforma. */
export function encurtar(nome, max = 30) {
  const s = String(nome || "").replace(/^\s*\[[^\]]*\]\s*/, "").replace(/\s+/g, " ").trim();
  return s.length > max ? s.slice(0, max - 1).trimEnd() + "…" : s || "—";
}

/* ============================================================
   2. CONFIGURAÇÃO PADRÃO (clínica odontológica)
   ============================================================ */
export const CFG_PADRAO = {
  cpaAlvo: 15,
  orcamento: 1500,
  fee: 997,
  ticket: { "Aparelho invisível": 5500, "Implante": 3500, "Clareamento": 1100, "Clínica geral": 420, "Limpeza": 250, "Canal / urgência": 850 },
  regrasOff: [],
  assinatura: "Equipe Nexus · gestão de tráfego",
  proximos: {
    "Aparelho invisível": "• Aumentar em 20% a verba do aparelho invisível — é o tratamento que mais rende.",
    "Canal / urgência": "• Manter a campanha de urgência ligada: quem resolve a dor costuma voltar para o tratamento completo.",
    "Clínica geral": "• Oferecer a avaliação completa a quem veio pela clínica geral — é a porta para os tratamentos maiores.",
    "Implante": "• Gravar um vídeo explicando o implante passo a passo: quem pesquisa implante quer segurança.",
  },
};
export const cfgCom = cfg => ({
  ...CFG_PADRAO, ...(cfg || {}),
  ticket: { ...CFG_PADRAO.ticket, ...((cfg && cfg.ticket) || {}) },
  proximos: { ...CFG_PADRAO.proximos, ...((cfg && cfg.proximos) || {}) },
  regrasOff: (cfg && cfg.regrasOff) || [],
});

/* ============================================================
   3. DO BANCO PARA O DATASET
   Recebe o formato de nx_dados (chaves curtas) — o painel e as
   Edge Functions montam o mesmo dataset a partir do mesmo formato.
   ============================================================ */
export const ETAPAS_COM_AVALIACAO = new Set(["orcamento", "fechou", "nao_fechou"]);

export function datasetDeLinhas({ metricas = [], leads = [], cliente = {}, hoje = hojeSP(), dias = 130 }) {
  const DIAS = dias, R = DIAS - 1;
  const REF = meioDia(hoje); REF.setDate(REF.getDate() - 1);
  const idx = iso => (iso ? R - difDias(REF, meioDia(String(iso).slice(0, 10))) : null);

  const CAMP = {}, CRI = {}, LINHAS = [];
  const somaAd = new Map();   // "camp|i" → soma dos anúncios, p/ achar o resíduo da campanha

  const campDe = (plat, c, nome) => {
    const id = `${plat}:${c}`;
    if (!CAMP[id]) CAMP[id] = { id, plat, nome: nome || `Campanha ${c}`, curto: encurtar(nome || `Campanha ${c}`, 26) };
    else if (nome && CAMP[id].nome.startsWith("Campanha ")) { CAMP[id].nome = nome; CAMP[id].curto = encurtar(nome, 26); }
    return id;
  };

  for (const m of metricas) {
    if (m.n !== "anuncio") continue;
    const i = idx(m.d);
    if (i == null || i < 0 || i > R) continue;
    const camp = campDe(m.p, m.c, m.cn);
    const cri = `${m.p}:${m.a || "?"}`;
    if (!CRI[cri]) CRI[cri] = { id: cri, camp, plat: m.p, nome: m.an || `Anúncio ${m.a}`, curto: encurtar(m.an || `Anúncio ${m.a}`, 28) };
    const l = { i, plat: m.p, camp, cri, gasto: +m.g || 0, impressoes: +m.imp || 0, alcance: +m.alc || 0,
                cliques: +m.cli || 0, conversoes: +m.conv || 0, freq: +m.freq > 0 ? +m.freq : null };
    LINHAS.push(l);
    const k = `${camp}|${i}`, s = somaAd.get(k) || { g: 0, imp: 0, cli: 0, conv: 0 };
    s.g += l.gasto; s.imp += l.impressoes; s.cli += l.cliques; s.conv += l.conversoes;
    somaAd.set(k, s);
  }
  // Campanha sem detalhe por anúncio (Performance Max, por exemplo) ou com
  // diferença entre o total da campanha e a soma dos anúncios: o resíduo vira
  // um "criativo" próprio — senão o gasto some do painel.
  for (const m of metricas) {
    if (m.n !== "campanha") continue;
    const i = idx(m.d);
    if (i == null || i < 0 || i > R) continue;
    const camp = campDe(m.p, m.c, m.cn);
    const s = somaAd.get(`${camp}|${i}`) || { g: 0, imp: 0, cli: 0, conv: 0 };
    const g = (+m.g || 0) - s.g, conv = Math.max(0, (+m.conv || 0) - s.conv);
    if (g <= 0.01 && conv < 1) continue;
    const cri = `${camp}:outros`;
    if (!CRI[cri]) CRI[cri] = { id: cri, camp, plat: m.p, nome: "Outros anúncios da campanha", curto: "Outros anúncios" };
    LINHAS.push({ i, plat: m.p, camp, cri, gasto: Math.max(0, g), impressoes: Math.max(0, (+m.imp || 0) - s.imp),
                  alcance: 0, cliques: Math.max(0, (+m.cli || 0) - s.cli), conversoes: conv, freq: null });
  }

  const ORIGEM = { indicacao: "Indicação", organico: "Orgânico", whatsapp: "WhatsApp direto", manual: "Cadastro manual", site: "Site" };
  const LEADS = [];
  for (const L of leads) {
    const i = idx(L.data_conversa);
    if (i == null) continue;
    let camp = null, cri = null, plat = L.plataforma || null;
    if (L.anuncio_ext && plat) {
      cri = `${plat}:${L.anuncio_ext}`;
      if (CRI[cri]) camp = CRI[cri].camp;
    }
    if (!camp && L.campanha_ext && plat) camp = campDe(plat, L.campanha_ext, null);
    if (!camp) {
      // sem anúncio identificado: vira uma "campanha" de origem, fora do funil de anúncios
      const o = L.origem || "whatsapp";
      camp = `org:${o}`;
      if (!CAMP[camp]) CAMP[camp] = { id: camp, plat: null, nome: ORIGEM[o] || o, curto: ORIGEM[o] || o };
      plat = null;
    }
    const etapa = L.etapa || "nova";
    const iConsulta = idx(L.data_consulta);
    const temAvaliacao = ETAPAS_COM_AVALIACAO.has(etapa) || etapa === "faltou";
    LEADS.push({
      id: L.id, i, camp, cri, plat, servico: L.servico || "Clínica geral", nome: L.nome || "Sem nome", telefone: L.telefone || "",
      obs: L.obs || "", origem: L.origem, etapaReal: etapa,
      iAgenda: L.data_agenda ? idx(L.data_agenda) : (etapa !== "nova" && etapa !== "perdida" ? i : null),
      // marcou "veio/fechou" sem dizer quando: conta no dia do agendamento (ou da conversa)
      iConsulta: iConsulta != null ? iConsulta : (temAvaliacao ? (L.data_agenda ? idx(L.data_agenda) : i) : null),
      compareceu: ETAPAS_COM_AVALIACAO.has(etapa),
      fechou: etapa === "fechou",
      valor: L.valor != null ? +L.valor : null,
      bruto: L,
    });
  }
  return { LINHAS, LEADS, CAMP, CRI, CFG: cfgCom(cliente.cfg), REF, DIAS, nome: cliente.nome || "", curto: (cliente.cfg && cliente.cfg.nomeCurto) || encurtar(cliente.nome || "Cliente", 22) };
}

/* ============================================================
   4. O MOTOR — tudo que depende do dataset
   ============================================================ */
export function montar(ds) {
  const { LINHAS, LEADS, CAMP, CRI, REF, DIAS } = ds;
  const CFG = cfgCom(ds.CFG);
  const R = DIAS - 1;
  const NOME = ds.curto || ds.nome || "Cliente";

  const dataDe = i => { const d = new Date(REF); d.setDate(d.getDate() + (i - R)); return d; };
  const ddmm = i => { const d = dataDe(i); return `${p2(d.getDate())}/${p2(d.getMonth() + 1)}`; };
  const dataBR = i => { const d = dataDe(i); return `${p2(d.getDate())}/${p2(d.getMonth() + 1)}/${d.getFullYear()}`; };
  const dMes = i => { const d = dataDe(i); return `${d.getDate()} de ${MES3[d.getMonth()]}`; };
  const DATAS = Array.from({ length: DIAS }, (_, i) => dataDe(i));

  /* ---------- matemática (porte do metricas.js) ---------- */
  function consolidar(ls) {
    const t = { gasto: 0, impressoes: 0, alcance: 0, cliques: 0, conversoes: 0 };
    let fp = 0, fs = 0;
    for (const l of ls) {
      t.gasto += l.gasto; t.impressoes += l.impressoes; t.alcance += l.alcance;
      t.cliques += l.cliques; t.conversoes += l.conversoes;
      // frequência não soma: média ponderada por impressões
      if (l.freq) { fs += l.freq * l.impressoes; fp += l.impressoes; }
    }
    t.freq = fp > 0 ? fs / fp : null;
    t.ctr = t.impressoes > 0 ? t.cliques / t.impressoes * 100 : null;
    t.cpc = t.cliques > 0 ? t.gasto / t.cliques : null;
    t.cpm = t.impressoes > 0 ? t.gasto / t.impressoes * 1000 : null;
    t.cpa = t.conversoes > 0 ? t.gasto / t.conversoes : null;   // custo por conversa
    return t;
  }
  const linhasDe = (de, ate, f = {}) => LINHAS.filter(l =>
    l.i >= de && l.i <= ate && (!f.plat || l.plat === f.plat) && (!f.camp || l.camp === f.camp) && (!f.cri || l.cri === f.cri));

  const valorLead = L => (L.valor != null ? L.valor : Math.round((CFG.ticket[L.servico] || 0) * (L.fator || 1) / 10) * 10);

  /** Em que pé cada paciente está HOJE. */
  function etapa(L) {
    if (L.etapaReal) return L.etapaReal;
    if (L.iAgenda == null) return L.i >= R - 2 ? "nova" : "perdida";
    if (L.iAgenda > R) return "nova";
    if (L.iConsulta > R) return "agendada";
    if (!L.compareceu) return "faltou";
    if (L.fechou) return "fechou";
    return L.iConsulta >= R - 6 ? "orcamento" : "nao_fechou";
  }

  /** O que o consultório viu no período, pela data de cada evento. Orgânicos ficam de fora
      por padrão: o funil é dos ANÚNCIOS (f.organicos = true inclui). */
  function crmTot(de, ate, f = {}) {
    const c = { conversas: 0, agendadas: 0, compareceram: 0, faltaram: 0, fecharam: 0, receita: 0, serv: {} };
    for (const L of LEADS) {
      if (!L.plat && !f.organicos) continue;
      if (f.plat && L.plat !== f.plat) continue;
      if (f.camp && L.camp !== f.camp) continue;
      if (L.i >= de && L.i <= ate) c.conversas++;
      if (L.iAgenda != null && L.iAgenda >= de && L.iAgenda <= ate) c.agendadas++;
      if (L.iConsulta != null && L.iConsulta >= de && L.iConsulta <= ate && L.iConsulta <= R) {
        if (!L.compareceu) { if (etapa(L) === "faltou" || !L.etapaReal) c.faltaram++; continue; }
        c.compareceram++;
        if (L.fechou) {
          const v = valorLead(L);
          c.fecharam++; c.receita += v;
          const s = c.serv[L.servico] || (c.serv[L.servico] = { n: 0, v: 0 });
          s.n++; s.v += v;
        }
      }
    }
    return c;
  }

  const _serie = {};
  function porDia(plat) {
    const k = plat || "";
    if (_serie[k]) return _serie[k];
    const z = () => new Array(DIAS).fill(0);
    const s = { meta: z(), google: z(), conv: z(), ag: z(), fe: z(), rec: z() };
    for (const l of LINHAS) { if (plat && l.plat !== plat) continue; s[l.plat][l.i] += l.gasto; s.conv[l.i] += l.conversoes; }
    for (const L of LEADS) {
      if (!L.plat || (plat && L.plat !== plat)) continue;
      if (L.iAgenda != null && L.iAgenda >= 0 && L.iAgenda <= R) s.ag[L.iAgenda]++;
      if (L.iConsulta != null && L.iConsulta >= 0 && L.iConsulta <= R && L.fechou) { s.fe[L.iConsulta]++; s.rec[L.iConsulta] += valorLead(L); }
    }
    return (_serie[k] = s);
  }
  const soma7 = (arr, i) => { let s = 0; for (let j = Math.max(0, i - 6); j <= i; j++) s += arr[j]; return s; };
  const media7 = (arr, i) => soma7(arr, i) / (Math.min(i, 6) + 1);

  /** Mesma régua (tolerância de 2%) no radar, no cartão de ritmo e no relatório. */
  const situacaoOrc = proj => proj > CFG.orcamento * 1.02 ? "🔺 acima do orçamento"
    : proj >= CFG.orcamento * .98 ? "≈ no limite do orçamento" : "🔻 abaixo do orçamento";

  function ritmoMes(ref) {
    const d = dataDe(ref), mes = d.getMonth(), ano = d.getFullYear();
    const ini = Math.max(0, ref - (d.getDate() - 1));
    const gasto = linhasDe(ini, ref).reduce((s, l) => s + l.gasto, 0);
    const diasMes = new Date(ano, mes + 1, 0).getDate(), pass = d.getDate();
    return { mes, ano, gasto, pass, diasMes, restam: diasMes - pass, proj: gasto / pass * diasMes };
  }

  function mesesDados() {
    const m = new Map();
    for (let i = 0; i < DIAS; i++) {
      const d = DATAS[i], k = d.getFullYear() * 12 + d.getMonth();
      if (!m.has(k)) m.set(k, { mes: d.getMonth(), ano: d.getFullYear(), de: i, ate: i });
      else m.get(k).ate = i;
    }
    return [...m.values()].map(x => ({
      ...x,
      completo: DATAS[x.de].getDate() === 1 && DATAS[x.ate].getDate() === new Date(x.ano, x.mes + 1, 0).getDate(),
    }));
  }

  /* ---------- radar (porte do radar.js) ---------- */
  const CMP = { ">": (a, b) => a > b, "<": (a, b) => a < b, ">=": (a, b) => a >= b, "<=": (a, b) => a <= b };
  const FMT_MET = { cpa: brl, ctr: v => pc(v, 2), freq: v => dec(v, 1), conversoes: int };
  const REGRAS = [
    // janela de 14 dias: com 2–3 conversas por semana, 7 dias oscila só pelo arredondamento
    { id: "r1", nome: "Custo por conversa alto", nivel: "campanha", metrica: "cpa", op: ">", limite: () => CFG.cpaAlvo * 1.35,
      janela: 14, minGasto: 60, minImpr: 0, sev: "alerta",
      msg: "{entidade} está pagando {valor} por conversa nos últimos {janela} dias (limite {limite}).",
      acao: n => `Reduzir a verba de “${n}” até o custo por conversa voltar para perto de ${brl(CFG.cpaAlvo)}.` },
    { id: "r2", nome: "Campanha sem conversa", nivel: "campanha", metrica: "conversoes", op: "<=", limite: () => 0,
      janela: 3, minGasto: 22, minImpr: 0, sev: "critico",
      msg: "{entidade} gastou {gasto} em {janela} dias sem nenhuma conversa no WhatsApp.",
      acao: n => `Checar “${n}”: gastou sem trazer conversa (anúncio reprovado? link do WhatsApp?).` },
    { id: "r3", nome: "Criativo com CTR baixo", nivel: "anuncio", plat: "meta", metrica: "ctr", op: "<", limite: () => .9,
      janela: 3, minGasto: 0, minImpr: 300, sev: "alerta",
      msg: "O criativo {entidade} está com CTR de {valor} — pouca gente clicando (limite {limite}).",
      acao: n => `Trocar o criativo “${n}” — quase ninguém está clicando.` },
    { id: "r4", nome: "Fadiga de criativo", nivel: "anuncio", plat: "meta", metrica: "freq", op: ">", limite: () => 3,
      janela: 7, minGasto: 0, minImpr: 300, sev: "info",
      msg: "{entidade} já apareceu {valor} vezes para as mesmas pessoas — hora de trocar o criativo.",
      acao: n => `Subir uma versão nova do criativo “${n}”: o público já cansou dele.` },
  ].map(r => ({ ...r, ativa: !CFG.regrasOff.includes(r.id) }));
  const RITMO = { id: "ritmo", nome: "Ritmo do orçamento" };
  const ORD = { critico: 0, alerta: 1, info: 2 };
  const ICONE = { critico: "🔴", alerta: "🟠", info: "🔵" };

  function avaliar(ref, comRitmo = false) {
    const out = [];
    for (const r of REGRAS) {
      if (!r.ativa) continue;
      const de = ref - r.janela + 1, grupos = new Map();
      for (const l of LINHAS) {
        if (l.i < de || l.i > ref || (r.plat && l.plat !== r.plat)) continue;
        const k = r.nivel === "campanha" ? l.camp : l.cri;
        if (!grupos.has(k)) grupos.set(k, []);
        grupos.get(k).push(l);
      }
      for (const [k, ls] of grupos) {
        const t = consolidar(ls);
        // o gasto é soma de centavos em ponto flutuante (1,16 + 14,87 + 5,97 = 21,999999999999996): compara em centavos, senão gasto
        // exatamente igual ao mínimo da regra deixava de alertar
        if (Math.round(t.gasto * 100) < Math.round(r.minGasto * 100) || t.impressoes < r.minImpr) continue;
        const v = t[r.metrica];
        if (!fin(v)) continue;          // sem base (CPA sem conversa) — coberto pela r2
        const lim = r.limite();
        if (!CMP[r.op](v, lim)) continue;
        const camp = r.nivel === "campanha" ? CAMP[k] : CAMP[CRI[k].camp];
        // um criativo pode rodar em várias campanhas: a campanha vai junto no aviso
        const nome = r.nivel === "campanha" ? camp.nome : `${CRI[k].nome} (em ${camp.curto})`;
        const f = FMT_MET[r.metrica];
        out.push({
          regra: r, chave: `${r.id}|${k}`, sev: r.sev, valor: v,
          msg: r.msg.replace("{entidade}", nome).replace("{valor}", f(v)).replace("{limite}", f(lim))
            .replace("{janela}", r.janela).replace("{gasto}", brl(t.gasto)),
          acao: r.acao(r.nivel === "campanha" ? camp.curto : CRI[k].curto),
        });
      }
    }
    if (comRitmo) {
      const m = ritmoMes(ref);
      if (m.restam > 0 && m.proj > CFG.orcamento * 1.02) {
        const excesso = m.proj - CFG.orcamento;
        out.push({
          regra: RITMO, chave: "ritmo", sev: "info", valor: m.proj,
          msg: `No ritmo atual, ${MESES[m.mes]} fecha em ${brl0(m.proj)} — ${brl0(excesso)} acima do orçamento de ${brl0(CFG.orcamento)}.`,
          acao: `Segurar ${brl(excesso / m.restam)} por dia até o fim do mês para fechar dentro do orçamento.`,
        });
      }
    }
    return out.sort((a, b) => ORD[a.sev] - ORD[b.sev]);
  }

  /** Últimos 14 dias agrupados em episódios ("desde quando", "ainda ativo?"). */
  function historico() {
    const eps = [], ult = new Map();
    for (let ref = R - 13; ref <= R; ref++) {
      for (const a of avaliar(ref)) {
        const e = ult.get(a.chave);
        // 1 dia de folga ainda é o mesmo episódio: alerta que "pisca" não vira dois itens
        if (e && e.ate >= ref - 2) { e.ate = ref; e.a = a; }
        else { const n = { desde: ref, ate: ref, a }; eps.push(n); ult.set(a.chave, n); }
      }
    }
    const rit = avaliar(R, true).find(a => a.chave === "ritmo");
    if (rit) eps.push({ desde: R, ate: R, a: rit });
    return eps.sort((x, y) => (y.ate - x.ate) || (ORD[x.a.sev] - ORD[y.a.sev]) || (x.desde - y.desde));
  }

  function textoAlerta(as) {
    if (!as.length) return `📡 *${NOME} · Radar de tráfego*\n\nNenhuma regra disparou: todas as campanhas dentro dos limites. ✅`;
    const crit = as.filter(a => a.sev === "critico").length;
    const cab = crit
      ? `⚠️ *${NOME} · Radar de tráfego* — ${crit} ${crit === 1 ? "item crítico" : "itens críticos"}`
      : `📡 *${NOME} · Radar de tráfego*`;
    return `${cab}\n\n${as.map(a => `${ICONE[a.sev]} ${a.msg}`).join("\n\n")}\n\n_Avaliado sobre dias fechados. Abra o painel para ver o histórico._`;
  }

  /* ---------- relatórios (formato do relatorio.js) ---------- */
  function leituraDia(ref, sem, al) {
    const ant = consolidar(linhasDe(ref - 13, ref - 7)), out = [];
    const crit = al.find(a => a.sev === "critico");
    if (crit) out.push(`• Prioridade: ${crit.acao}`);
    if (fin(sem.cpa) && fin(ant.cpa)) {
      const v = variacao(sem.cpa, ant.cpa);
      if (v <= -5) out.push(`• Custo por conversa da semana caiu ${Math.abs(v).toFixed(0)}% (${brl(ant.cpa)} → ${brl(sem.cpa)}). Manter o que está rodando.`);
      else if (v >= 8) out.push(`• Custo por conversa subiu ${v.toFixed(0)}% na semana (${brl(ant.cpa)} → ${brl(sem.cpa)}).`);
      else out.push(`• Custo por conversa estável na semana (${brl(sem.cpa)}).`);
    }
    al.filter(a => a.sev !== "critico").slice(0, 2).forEach(a => out.push(`• ${a.acao}`));
    if (!al.length) out.push("• Nenhuma campanha fora da meta. Seguir como está.");
    return out;
  }

  /** @param leituraIA texto opcional escrito pela IA — substitui a leitura por regras */
  function relDiario(ref, leituraIA = null) {
    const dia = consolidar(linhasDe(ref, ref)), ant = consolidar(linhasDe(ref - 1, ref - 1)), sem = consolidar(linhasDe(ref - 6, ref));
    const L = [`📊 *${NOME} · Tráfego pago* — ${dataBR(ref)}`, "", "*No dia*"];
    L.push(`• Investido: ${brl(dia.gasto)} (${varTxt(dia.gasto, ant.gasto)} vs. dia anterior)`);
    L.push(`• Conversas no WhatsApp: ${int(dia.conversoes)} (${varTxt(dia.conversoes, ant.conversoes)})`);
    L.push(`• Custo por conversa: ${brl(dia.cpa)} · meta ${brl(CFG.cpaAlvo)}`);

    const plats = ["meta", "google"].map(p => ({ p, t: consolidar(linhasDe(ref, ref, { plat: p })) })).filter(x => x.t.gasto > 0);
    if (plats.length) {
      L.push("", "*Por plataforma*");
      for (const { p, t } of plats) L.push(`• ${nomePlat(p)}: ${brl(t.gasto)} → ${plural(t.conversoes, "conversa", "conversas")} · CTR ${pc(t.ctr, 2)}`);
    }

    L.push("", "*Últimos 7 dias*");
    L.push(`• ${brl(sem.gasto)} investidos · ${plural(sem.conversoes, "conversa", "conversas")} · ${brl(sem.cpa)} por conversa`);
    // melhor e pior da semana, com piso para não eleger campanha de R$ 5
    const el = Object.values(CAMP).filter(c => c.plat).map(c => ({ c, t: consolidar(linhasDe(ref - 6, ref, { camp: c.id })) }))
      .filter(x => x.t.gasto >= 20 && x.t.conversoes > 0).sort((a, b) => a.t.cpa - b.t.cpa);
    if (el.length >= 2) {
      L.push(`• 🟢 Melhor: ${el[0].c.nome} — ${brl(el[0].t.cpa)}`);
      L.push(`• 🔴 Pior: ${el[el.length - 1].c.nome} — ${brl(el[el.length - 1].t.cpa)}`);
    }

    const m = ritmoMes(ref);
    L.push("", "*Mês*", `• ${brl0(m.gasto)} de ${brl0(CFG.orcamento)} · projeção ${brl0(m.proj)} (${situacaoOrc(m.proj)})`);

    const c7 = crmTot(ref - 6, ref);
    L.push("", "*No consultório (7 dias)*",
      `• ${plural(c7.agendadas, "avaliação agendada", "avaliações agendadas")} · ${int(c7.compareceram)} ${c7.compareceram === 1 ? "compareceu" : "compareceram"} · ${int(c7.fecharam)} ${c7.fecharam === 1 ? "fechou" : "fecharam"} · ${brl0(c7.receita)} em tratamentos`);

    const al = avaliar(ref);
    if (al.length) { L.push("", "*Alertas*"); al.slice(0, 4).forEach(a => L.push(`${ICONE[a.sev]} ${a.msg}`)); }
    L.push("", "*Leitura do dia*", ...(leituraIA ? [leituraIA.trim()] : leituraDia(ref, sem, al)));
    return L.join("\n");
  }

  function relMensal(m, leituraIA = null) {
    const t = consolidar(linhasDe(m.de, m.ate)), c = crmTot(m.de, m.ate);
    const lista = mesesDados(), idx = lista.findIndex(x => x.de === m.de), prev = idx > 0 ? lista[idx - 1] : null;
    const roas = t.gasto ? c.receita / t.gasto : null;
    const L = [
      `🦷 *${NOME} · Resultados de ${MESES[m.mes]}*`, "",
      `👁 Anúncios vistos ${int(t.impressoes)} vezes`,
      `💬 ${plural(t.conversoes, "conversa", "conversas")} no WhatsApp (custo médio ${brl(t.cpa)})`,
      `📅 ${plural(c.agendadas, "avaliação agendada", "avaliações agendadas")}`,
      `✅ ${int(c.compareceram)} ${c.compareceram === 1 ? "compareceu" : "compareceram"}`,
      `🦷 *${plural(c.fecharam, "paciente fechou", "pacientes fecharam")} tratamento*`, "",
      `💰 Investido em anúncios: ${brl0(t.gasto)}`,
      `📈 Tratamentos fechados: ${brl0(c.receita)} _(estimativa pelo valor de cada tratamento)_`,
    ];
    if (fin(roas) && c.receita > 0) L.push(`Cada R$ 1 em anúncio virou *R$ ${dec(roas, 1)}* em tratamentos.`);
    if (prev && prev.ate - prev.de >= 19) {
      const cp = crmTot(prev.de, prev.ate), v = variacao(c.fecharam, cp.fecharam);
      // sem paciente fechado nos dois meses a comparação seria ruído («+0% (0 → 0)») no WhatsApp do cliente
      if (v != null && (c.fecharam > 0 || cp.fecharam > 0)) L.push("", `Em relação a ${MESES[prev.mes]}: ${v >= 0 ? "+" : ""}${v.toFixed(0)}% em pacientes novos (${cp.fecharam} → ${c.fecharam}).`);
    }
    const top = Object.entries(c.serv).sort((a, b) => b[1].v - a[1].v)[0];
    const campTop = Object.values(CAMP).filter(cc => cc.plat).map(cc => ({ cc, k: crmTot(m.de, m.ate, { camp: cc.id }) }))
      .sort((a, b) => b.k.receita - a.k.receita)[0];
    if (top || (campTop && campTop.k.receita)) {
      L.push("", "*Destaques*");
      if (top) L.push(`• ${plural(top[1].n, "paciente", "pacientes")} de ${top[0].toLowerCase()} — ${pc(top[1].v / c.receita * 100, 0)} do resultado do mês`);
      if (campTop && campTop.k.receita) L.push(`• Anúncio que mais trouxe resultado: _${campTop.cc.nome}_`);
    }

    L.push("", "*Para o próximo mês*");
    if (leituraIA) L.push(leituraIA.trim());
    else {
      if (top && CFG.proximos[top[0]]) L.push(CFG.proximos[top[0]]);
      const cansados = Object.values(CRI).filter(k => k.plat === "meta")
        .map(k => consolidar(linhasDe(m.ate - 6, m.ate, { cri: k.id }))).filter(x => fin(x.freq) && x.freq > 2.6);
      L.push(cansados.length
        ? "• Gravar 2 vídeos novos — alguns anúncios já foram vistos muitas vezes pelas mesmas pessoas."
        : "• Gravar 1 vídeo novo — anúncio com rosto de quem atende é o que mais traz conversa.");
      L.push("• Pedir avaliação no Google aos pacientes satisfeitos: mais avaliações deixam os anúncios mais baratos.");
    }
    L.push("", "_Qualquer dúvida, é só responder aqui._", CFG.assinatura);
    return L.join("\n");
  }

  /** Números crus do dia/semana/mês para a IA interpretar (nunca o texto já formatado). */
  function contextoIA(ref) {
    const r2 = v => (fin(v) ? +v.toFixed(2) : null);
    const enx = t => ({ gasto: r2(t.gasto), conversas: Math.round(t.conversoes), custo_conversa: r2(t.cpa), ctr: r2(t.ctr), cpm: r2(t.cpm), frequencia: r2(t.freq) });
    const sem = consolidar(linhasDe(ref - 6, ref)), ant = consolidar(linhasDe(ref - 13, ref - 7));
    return {
      data: dataBR(ref), cliente: ds.nome,
      metas: { custo_conversa: CFG.cpaAlvo, orcamento_mes: CFG.orcamento },
      ontem: enx(consolidar(linhasDe(ref, ref))), ultimos_7_dias: enx(sem), semana_anterior: enx(ant),
      mes: (m => ({ gasto: r2(m.gasto), projecao: r2(m.proj), dias_restantes: m.restam }))(ritmoMes(ref)),
      campanhas_7d: Object.values(CAMP).filter(c => c.plat).map(c => ({ nome: c.nome, plataforma: c.plat, ...enx(consolidar(linhasDe(ref - 6, ref, { camp: c.id }))) }))
        .filter(c => c.gasto > 0),
      consultorio_7d: (c => ({ agendadas: c.agendadas, compareceram: c.compareceram, fecharam: c.fecharam, receita: r2(c.receita) }))(crmTot(ref - 6, ref)),
      alertas: avaliar(ref, true).map(a => a.msg),
    };
  }

  return {
    CFG, R, DIAS, DATAS, REF, NOME, LINHAS, LEADS, CAMP, CRI, REGRAS, ICONE, ORD, FMT_MET,
    dataDe, ddmm, dataBR, dMes,
    consolidar, linhasDe, crmTot, porDia, soma7, media7, valorLead, etapa,
    situacaoOrc, ritmoMes, mesesDados, avaliar, historico, textoAlerta, leituraDia, relDiario, relMensal, contextoIA,
  };
}
