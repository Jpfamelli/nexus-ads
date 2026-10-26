/* ============================================================
   NEXUS ADS — demo.js
   Cenário FICTÍCIO de clínica odontológica (120 dias) para o modo
   ?demo do painel e para popular um cliente de teste no banco.
   Devolve o mesmo "dataset" que nucleo.datasetDeLinhas() — o painel
   não sabe (nem precisa saber) se os números são reais.

   Calibração: conversas e "agendou/veio/fechou" saem de ACUMULADORES,
   não de sorteio um a um (com ~100 pacientes/mês, um paciente de
   aparelho invisível a mais mudava o mês inteiro). O sal "pdz" foi
   escolhido por critérios: retorno ~5,4x, 2→9→10→11 pacientes/mês e
   radar só com os cenários planejados.
   ============================================================ */
import { cfgCom, meioDia, hojeSP, isoDe } from "./nucleo.js";

function mulberry32(a) {
  return () => {
    a |= 0; a = a + 0x6D2B79F5 | 0;
    let t = Math.imul(a ^ a >>> 15, 1 | a);
    t = t + Math.imul(t ^ t >>> 7, 61 | t) ^ t;
    return ((t ^ t >>> 14) >>> 0) / 4294967296;
  };
}
const hash = s => { let h = 2166136261; for (const c of String(s)) { h ^= c.charCodeAt(0); h = Math.imul(h, 16777619); } return h >>> 0; };
const gauss = r => { let u = 0; while (!u) u = r(); return Math.sqrt(-2 * Math.log(u)) * Math.cos(2 * Math.PI * r()); };

export const CAMPANHAS_DEMO = [
  { id: "m1", plat: "meta", nome: "Invisível · ângulo dor", curto: "Invisível · dor", inicio: 0, verba: 12, cpa: 14, ctr: 1.6, cpm: 22, agenda: .32,
    criativos: [
      { id: "m1a", nome: "Reels · “Trava o sorriso nas fotos?”", curto: "Reels trava o sorriso", peso: .6 },
      { id: "m1b", nome: "Carrossel · como funciona o alinhador", curto: "Carrossel do alinhador", peso: .4 }],
    servicos: { "Aparelho invisível": .55, "Clínica geral": .25, "Clareamento": .2 } },
  // "semConversa": 4 dias em que o WhatsApp da clínica ficou desconectado — o radar pegou e foi resolvido
  { id: "m2", plat: "meta", nome: "Autoridade · Dra. explica", curto: "Autoridade", inicio: 0, verba: 9, cpa: 11, ctr: 1.3, cpm: 20, agenda: .36, semConversa: [12, 9],
    criativos: [
      { id: "m2a", nome: "Vídeo · 3 mitos do aparelho invisível", curto: "3 mitos do invisível", peso: .55 },
      { id: "m2b", nome: "Vídeo · como é a primeira avaliação", curto: "A primeira avaliação", peso: .45 }],
    servicos: { "Clínica geral": .35, "Aparelho invisível": .3, "Implante": .15, "Clareamento": .2 } },
  { id: "m3", plat: "meta", nome: "Prova social · nota 5,0", curto: "Prova social", inicio: 10, verba: 7, cpa: 14, ctr: 1.5, cpm: 22, agenda: .34,
    criativos: [
      { id: "m3a", nome: "Tour pela clínica", curto: "Tour pela clínica", peso: .55 },
      { id: "m3b", nome: "Print das avaliações 5,0", curto: "Print das avaliações", peso: .45, fadiga: true }],
    servicos: { "Clínica geral": .45, "Limpeza": .3, "Clareamento": .25 } },
  { id: "m4", plat: "meta", nome: "Remarketing · visitou o site", curto: "Remarketing", inicio: 40, verba: 4, cpa: 9.5, ctr: 2.1, cpm: 30, freqBase: 2.5, agenda: .45,
    criativos: [{ id: "m4a", nome: "Lembrete · sua avaliação te espera", curto: "Lembrete", peso: 1 }],
    servicos: { "Aparelho invisível": .4, "Clínica geral": .4, "Implante": .2 } },
  { id: "g1", plat: "google", nome: "Pesquisa · dentista na cidade", curto: "Dentista na cidade", inicio: 30, verba: 7, cpa: 17, ctr: 6.5, cpc: 2.3, agenda: .48,
    criativos: [{ id: "g1a", nome: "Anúncio · atendimento até as 20h", curto: "Até as 20h", peso: 1 }],
    servicos: { "Clínica geral": .45, "Limpeza": .25, "Canal / urgência": .15, "Implante": .15 } },
  { id: "g2", plat: "google", nome: "Pesquisa · aparelho invisível", curto: "Busca invisível", inicio: 30, verba: 6, cpa: 17, ctr: 5.2, cpc: 2.9, agenda: .44,
    criativos: [{ id: "g2a", nome: "Anúncio · alinhador transparente", curto: "Alinhador transparente", peso: 1 }],
    servicos: { "Aparelho invisível": .75, "Clínica geral": .25 } },
  // "pico": nos últimos 10 dias a concorrência subiu o lance — é o que o radar deve pegar
  { id: "g3", plat: "google", nome: "Pesquisa · dentista urgência", curto: "Urgência", inicio: 45, verba: 6, cpa: 15, ctr: 7.8, cpc: 2.6, agenda: .62, pico: true,
    criativos: [{ id: "g3a", nome: "Anúncio · dor de dente? atendemos hoje", curto: "Dor de dente", peso: 1 }],
    servicos: { "Canal / urgência": .75, "Clínica geral": .25 } },
];

const TAXAS = {
  fechar: { "Aparelho invisível": .18, "Implante": .25, "Clareamento": .33, "Clínica geral": .42, "Limpeza": .52, "Canal / urgência": .55 },
  comparecer: .66, comparecerUrgencia: .88,
};
// A clínica fictícia tem gestão da Nexus (R$ 997) e a tabela de valores configurada: é o que o núcleo
// precisa para estimar o resultado (o padrão do núcleo é neutro — fee 0 e sem tabela, plano 100).
export const CFG_DEMO = {
  // plano 1000 (AD-001): o núcleo não inventa mais metas — a demonstração (fictícia) traz as suas
  // AD-010: a meta de conversa (WhatsApp) não vale para o Google — a demo tem a dela (a «Urgência» do Google passa do limite)
  cpaAlvo: 15, cpaAlvoGoogle: 18, orcamento: 1500,
  fee: 997,
  ticket: { "Aparelho invisível": 5500, "Implante": 3500, "Clareamento": 1100, "Clínica geral": 420, "Limpeza": 250, "Canal / urgência": 850 },
  proximos: {
    "Aparelho invisível": "• Aumentar em 20% a verba do aparelho invisível — é o tratamento que mais rende.",
    "Canal / urgência": "• Manter a campanha de urgência ligada: quem resolve a dor costuma voltar para o tratamento completo.",
    "Clínica geral": "• Oferecer a avaliação completa a quem veio pela clínica geral — é a porta para os tratamentos maiores.",
    "Implante": "• Gravar um vídeo explicando o implante passo a passo: quem pesquisa implante quer segurança.",
  },
};
const NOMES_F = ["Ana", "Beatriz", "Camila", "Daniela", "Eduarda", "Fernanda", "Gabriela", "Helena", "Isabela", "Juliana", "Larissa", "Luana", "Mariana", "Natália", "Patrícia", "Renata", "Sabrina", "Tatiane", "Vanessa", "Yasmin", "Carolina", "Letícia", "Priscila", "Aline", "Bianca", "Débora"];
const NOMES_M = ["André", "Bruno", "Carlos", "Diego", "Eduardo", "Felipe", "Gustavo", "Henrique", "Igor", "João", "Lucas", "Marcelo", "Rafael", "Rodrigo", "Thiago", "Vinícius", "Paulo", "Renan", "Otávio", "Leandro"];
const INICIAIS = "ABCDFGLMNOPRSTV";

/**
 * @param {object} o
 * @param {string} [o.sal="pdz"]     escolhe a realização do cenário
 * @param {string} [o.hoje]          YYYY-MM-DD (padrão: hoje em São Paulo)
 * @param {string} [o.nome]          nome do cliente exibido
 * @param {object} [o.cfg]           configuração do cliente (metas, tickets…)
 */
/** Plano 2000d · DA-389: a mesma demonstração com a cara de uma OFICINA ou de uma LOJA (?vertical=oficina|loja) — os números são os
    mesmos (calibrados), só os nomes de serviço, campanha e criativo e o vocabulário mudam. */
export const VERTICAIS_DEMO = {
  oficina: { nome: "Oficina Demonstração",
    servicos: { "Aparelho invisível": "Retífica de motor", "Implante": "Troca de embreagem", "Clareamento": "Alinhamento e balanceamento", "Clínica geral": "Revisão completa", "Limpeza": "Troca de óleo", "Canal / urgência": "Socorro / guincho" },
    campanhas: { m1: ["Revisão · ângulo segurança", "Revisão · segurança"], m2: ["Autoridade · mecânico explica", "Autoridade"], m3: ["Prova social · nota 5,0", "Prova social"], m4: ["Remarketing · visitou o site", "Remarketing"],
      g1: ["Pesquisa · oficina na cidade", "Oficina na cidade"], g2: ["Pesquisa · retífica de motor", "Busca retífica"], g3: ["Pesquisa · socorro mecânico", "Socorro"] },
    criativos: { m1a: ["Reels · “Barulho no freio?”", "Reels barulho no freio"], m1b: ["Carrossel · o que entra na revisão", "Carrossel da revisão"], m2a: ["Vídeo · 3 mitos da troca de óleo", "3 mitos do óleo"],
      m2b: ["Vídeo · como é o diagnóstico", "O diagnóstico"], m3a: ["Tour pela oficina", "Tour pela oficina"], m3b: ["Print das avaliações 5,0", "Print das avaliações"], m4a: ["Lembrete · sua revisão te espera", "Lembrete"],
      g1a: ["Anúncio · atendimento até as 20h", "Até as 20h"], g2a: ["Anúncio · retífica com garantia", "Retífica com garantia"], g3a: ["Anúncio · quebrou? buscamos hoje", "Buscamos hoje"] } },
  loja: { nome: "Loja Demonstração",
    servicos: { "Aparelho invisível": "Sofá sob medida", "Implante": "Mesa de jantar", "Clareamento": "Poltrona", "Clínica geral": "Decoração", "Limpeza": "Almofadas", "Canal / urgência": "Pronta entrega" },
    campanhas: { m1: ["Sofá sob medida · ângulo conforto", "Sofá · conforto"], m2: ["Autoridade · designer explica", "Autoridade"], m3: ["Prova social · nota 5,0", "Prova social"], m4: ["Remarketing · visitou o site", "Remarketing"],
      g1: ["Pesquisa · loja de móveis na cidade", "Móveis na cidade"], g2: ["Pesquisa · sofá sob medida", "Busca sofá"], g3: ["Pesquisa · móveis pronta entrega", "Pronta entrega"] },
    criativos: { m1a: ["Reels · “Sofá que não cabe na sala?”", "Reels sofá na sala"], m1b: ["Carrossel · tecidos e medidas", "Carrossel dos tecidos"], m2a: ["Vídeo · 3 mitos do sofá retrátil", "3 mitos do retrátil"],
      m2b: ["Vídeo · como é o projeto", "O projeto"], m3a: ["Tour pela loja", "Tour pela loja"], m3b: ["Print das avaliações 5,0", "Print das avaliações"], m4a: ["Lembrete · seu orçamento te espera", "Lembrete"],
      g1a: ["Anúncio · aberto até as 20h", "Até as 20h"], g2a: ["Anúncio · sofá sob medida em 20 dias", "Sofá em 20 dias"], g3a: ["Anúncio · leve hoje", "Leve hoje"] } },
};
export function gerarDemo({ sal = "pdz", hoje = hojeSP(), nome = null, cfg = {}, vertical = "odonto" } = {}) {
  // plano 2000d · KX-019: «hoje» que não é data real (?hoje=amanha, 2026-02-31) cai no hoje de São Paulo — antes a demo saía toda NaN
  if (!/^\d{4}-\d{2}-\d{2}$/.test(String(hoje || "")) || Number.isNaN(meioDia(hoje).getTime()) || isoDe(meioDia(hoje)) !== hoje) hoje = hojeSP();
  const VD = VERTICAIS_DEMO[vertical] || null;
  if (nome == null) nome = VD ? VD.nome : "Clínica Demonstração";
  const DIAS = 120, R = DIAS - 1;
  const REF = meioDia(hoje); REF.setDate(REF.getDate() - 1);
  const dataDe = i => { const d = new Date(REF); d.setDate(d.getDate() + (i - R)); return d; };
  const fluxo = chave => mulberry32(hash(`${sal}:${chave}`));

  const CAMP = {}, CRI = {}, LINHAS = [], LEADS = [];
  for (const c of CAMPANHAS_DEMO) {
    CAMP[c.id] = { id: c.id, plat: c.plat, nome: c.nome, curto: c.curto };
    c.criativos.forEach(k => { CRI[k.id] = { id: k.id, camp: c.id, plat: c.plat, nome: k.nome, curto: k.curto }; });
  }

  const acc = {};
  const cruza = (chave, p) => {
    if (acc[chave] == null) acc[chave] = fluxo(`acc:${chave}`)();
    const antes = acc[chave];
    acc[chave] += p;
    return Math.floor(acc[chave]) > Math.floor(antes);
  };
  const rodizio = {};
  const servicoDe = c => {
    const st = rodizio[c.id] || (rodizio[c.id] = Object.fromEntries(Object.keys(c.servicos).map(k => [k, 0])));
    let tot = 0, esc = null;
    for (const [k, w] of Object.entries(c.servicos)) { st[k] += w; tot += w; if (esc == null || st[k] > st[esc]) esc = k; }
    st[esc] -= tot;
    return esc;
  };

  // plano 1500c · AC-007: o núcleo parou de arredondar a estimativa para a dezena — a demo arredonda o PRÓPRIO fator (valor de tabela
  // × fator cai em dezena redonda), e os números da demonstração (R$ 13.550, R$ 5,41…) seguem os mesmos
  const tkDemo = { ...CFG_DEMO.ticket, ...(cfg.ticket || {}) };
  const fatorRedondo = (servico, f) => { const t = +tkDemo[servico]; return t > 0 ? Math.round(t * f / 10) * 10 / t : f; };
  function novoLead(c, k, i, r) {
    const servico = servicoDe(c);
    const lista = r() < .62 ? NOMES_F : NOMES_M;
    const nomeP = `${lista[Math.floor(r() * lista.length)]} ${INICIAIS[Math.floor(r() * INICIAIS.length)]}.`;
    const L = { id: LEADS.length + 1, i, camp: c.id, cri: k.id, plat: c.plat, servico, nome: nomeP, telefone: "",
                iAgenda: null, iConsulta: null, compareceu: false, fechou: false, fator: fatorRedondo(servico, .85 + r() * .3) };
    const lag1 = [0, 0, 1, 1, 1, 2, 3][Math.floor(r() * 7)], lag2 = 1 + Math.floor(r() * 7);
    if (cruza(`ag:${c.id}`, c.agenda)) {
      L.iAgenda = i + lag1;
      L.iConsulta = L.iAgenda + lag2;
      const urg = servico === "Canal / urgência";
      L.compareceu = cruza(urg ? "cmp:urg" : "cmp", urg ? TAXAS.comparecerUrgencia : TAXAS.comparecer);
      L.fechou = L.compareceu && cruza(`fe:${servico}`, TAXAS.fechar[servico]);
    }
    return L;
  }

  const acum = {};
  for (const c of CAMPANHAS_DEMO) {
    const pesoTot = c.criativos.reduce((s, k) => s + k.peso, 0);
    for (let i = c.inicio; i < DIAS; i++) {
      const r = fluxo(`${c.id}:${i}`);
      const idade = i - c.inicio, ult = R - i, dow = dataDe(i).getDay();
      let verba = c.verba * (idade < 14 ? .85 : 1) * (1 + .12 * gauss(r));
      if (c.plat === "google" && !c.pico && (dow === 0 || dow === 6)) verba *= .75;
      verba = Math.max(verba, c.verba * .45);

      for (const k of c.criativos) {
        const rk = fluxo(`${k.id}:${i}`);
        const gasto = verba * k.peso / pesoTot;
        let mult = (1 + .5 * Math.exp(-idade / 10)) * Math.max(.6, 1 + .1 * gauss(rk));
        let ctr = c.ctr * Math.max(.6, 1 + .08 * gauss(rk)) * (1 - .15 * Math.exp(-idade / 10));
        let freq = null;
        if (k.fadiga && ult < 14) { const f = (14 - ult) / 14; mult *= 1 + 1.1 * f; ctr *= 1 - .5 * f; }

        let impressoes, cliques, alcance;
        if (c.plat === "meta") {
          impressoes = gasto / (c.cpm * Math.max(.7, 1 + .1 * gauss(rk))) * 1000;
          cliques = impressoes * ctr / 100;
          freq = k.fadiga && ult < 14 ? 2.2 + 1.3 * (14 - ult) / 14 : (c.freqBase || 1.15 + Math.min(idade, 70) * .014);
          alcance = impressoes / freq;
        } else {
          cliques = gasto / (c.cpc * Math.max(.7, 1 + .1 * gauss(rk)));
          impressoes = cliques / (ctr / 100);
          alcance = 0;
        }

        let conversoes;
        if (c.pico && ult < 10) conversoes = (ult === 7 || ult === 2) ? 1 : 0;
        else if (c.semConversa && ult <= c.semConversa[0] && ult >= c.semConversa[1]) conversoes = 0;
        else {
          if (acum[k.id] == null) acum[k.id] = fluxo(`ini:${k.id}`)();
          const antes = acum[k.id];
          acum[k.id] += gasto / (c.cpa * mult);
          conversoes = Math.floor(acum[k.id]) - Math.floor(antes);
        }
        conversoes = Math.min(conversoes, Math.max(0, Math.floor(cliques)));

        LINHAS.push({ i, plat: c.plat, camp: c.id, cri: k.id, gasto, impressoes, alcance, cliques, conversoes, freq });
        for (let n = 0; n < conversoes; n++) LEADS.push(novoLead(c, k, i, rk));
      }
    }
  }

  const cfgDemo = { ...CFG_DEMO, ...cfg, ticket: { ...CFG_DEMO.ticket, ...(cfg.ticket || {}) }, proximos: { ...CFG_DEMO.proximos, ...(cfg.proximos || {}) } };
  // plano 2000d · DA-389: troca os nomes da vertical (serviços nos leads, na tabela de valores e nas dicas; campanhas e criativos)
  if (VD) {
    const sv = s => VD.servicos[s] || s, troca = o => Object.fromEntries(Object.entries(o || {}).map(([k, v]) => [sv(k), v]));
    for (const L of LEADS) L.servico = sv(L.servico);
    cfgDemo.ticket = troca(cfgDemo.ticket);
    cfgDemo.proximos = Object.fromEntries(Object.entries(troca(cfgDemo.proximos)).map(([k, v]) => [k, `• Aumentar a verba de ${k.toLowerCase()} — é o que mais rende.`]));
    for (const [id, [n, c]] of Object.entries(VD.campanhas)) if (CAMP[id]) Object.assign(CAMP[id], { nome: n, curto: c });
    for (const [id, [n, c]] of Object.entries(VD.criativos)) if (CRI[id]) Object.assign(CRI[id], { nome: n, curto: c });
  }
  return { LINHAS, LEADS, CAMP, CRI, CFG: cfgCom(cfgDemo), REF, DIAS, vertical: VD ? vertical : "odonto", nome, curto: nome.split(" ")[0], demo: true };
}

/* ============================================================
   plano 2000d · DC-376/DC-450: SEMANA DE EXEMPLO da Agenda (só dev-falso/demo — botão «Preencher semana de exemplo»)
   5 dias (seg–sex) × 3 profissionais, horários das 8h às 16h (9 por dia), 60% ocupados; 2 encaixes (um num horário CHEIO de terça às
   10h, marcado pela IA — DC-450 — e um fora do horário, quinta às 18h), 2 faltas, 3 marcadas pela IA (com o encaixe de terça),
   4 confirmadas e 3 vindas de anúncio (utm_source «instagram»). Determinística: a mesma segunda dá sempre a mesma semana.
   Formato das consultas da Agenda (negocio_id, inicio/fim com -03:00, dono_id/dono_nome, marcado_por, encaixe, presenca…). PURO.
   ============================================================ */
export const PROFS_EXEMPLO = [{ id: "p1", nome: "Dra. Helena" }, { id: "p2", nome: "Dr. Paulo" }, { id: "p3", nome: "Ana (higienista)" }];
const SERV_EXEMPLO = ["Avaliação", "Limpeza", "Clareamento", "Aparelho invisível", "Implante", "Clínica geral"];
export function semanaDeExemplo(segISO = null) {
  // a segunda-feira pedida (ou a desta semana); outro dia da semana recua até a segunda
  let seg = /^\d{4}-\d{2}-\d{2}$/.test(String(segISO || "")) ? meioDia(segISO) : meioDia(hojeSP());
  if (Number.isNaN(seg.getTime())) seg = meioDia(hojeSP());
  seg.setDate(seg.getDate() - ((seg.getDay() + 6) % 7));
  const dias = Array.from({ length: 5 }, (_, k) => { const d = new Date(seg); d.setDate(d.getDate() + k); return isoDe(d); });
  const r = mulberry32(hash(`semana:${dias[0]}`));
  const hm = h => `${String(h).padStart(2, "0")}:00`;
  const vagas = [];
  for (let d = 0; d < 5; d++) for (const p of PROFS_EXEMPLO) for (let h = 8; h <= 16; h++) vagas.push({ d, p, h });
  // embaralha (Fisher–Yates com a semente da semana) e ocupa 60% — o horário de terça 10h da Dra. Helena fica sempre ocupado (DC-450)
  for (let k = vagas.length - 1; k > 0; k--) { const j = Math.floor(r() * (k + 1)); [vagas[k], vagas[j]] = [vagas[j], vagas[k]]; }
  const n = Math.round(vagas.length * 0.6);
  const fixa = vagas.findIndex(v => v.d === 1 && v.p.id === "p1" && v.h === 10);
  if (fixa >= n) [vagas[fixa], vagas[0]] = [vagas[0], vagas[fixa]];
  const ocup = vagas.slice(0, n).sort((a, b) => (a.d - b.d) || (a.h - b.h) || a.p.id.localeCompare(b.p.id));
  const nome = () => { const l = r() < .62 ? NOMES_F : NOMES_M; return `${l[Math.floor(r() * l.length)]} ${INICIAIS[Math.floor(r() * INICIAIS.length)]}.`; };
  let id = 9000;
  const consulta = (v, extra = {}) => ({
    negocio_id: ++id, contato_id: id + 1000, inicio: `${dias[v.d]}T${hm(v.h)}:00-03:00`, fim: `${dias[v.d]}T${hm(v.h + 1)}:00-03:00`,
    status: "aberto", presenca: null, servico: SERV_EXEMPLO[Math.floor(r() * SERV_EXEMPLO.length)], dono_id: v.p.id, dono_nome: v.p.nome,
    nome: nome(), telefone: "", encaixe: false, marcado_por: "recepcao", confirmada_em: null, exemplo: true, ...extra,
  });
  const lista = ocup.map(v => consulta(v));
  // 2 faltas (segunda e terça, dias que já passaram na semana de exemplo), 4 confirmadas, 2 pela IA e 3 de anúncio — espalhadas
  const pega = (filtro, q) => lista.filter(filtro).filter((_, k, a) => k % Math.max(1, Math.floor(a.length / q)) === 0).slice(0, q);
  for (const c of pega(c => c.inicio.startsWith(dias[0]) || c.inicio.startsWith(dias[1]), 2)) c.presenca = "faltou";
  for (const c of pega(c => !c.presenca && c.inicio >= dias[2], 4)) c.confirmada_em = `${c.inicio.slice(0, 10)}T07:30:00-03:00`;
  for (const c of pega(c => !c.presenca && !c.confirmada_em, 2)) c.marcado_por = "ia";
  for (const c of pega(c => !c.presenca && c.marcado_por !== "ia", 3)) Object.assign(c, { origem: "anuncio", plataforma: "meta", utm_source: "instagram" });
  // DC-450: horário cheio (capacidade 1) com encaixe marcado pela IA — terça 10h, Dra. Helena; e um encaixe fora do horário (quinta 18h)
  lista.push(consulta({ d: 1, p: PROFS_EXEMPLO[0], h: 10 }, { encaixe: true, marcado_por: "ia", servico: "Canal / urgência" }));
  lista.push(consulta({ d: 3, p: PROFS_EXEMPLO[1], h: 18 }, { encaixe: true }));
  return { profissionais: PROFS_EXEMPLO.map(p => ({ ...p })), dias, consultas: lista.sort((a, b) => a.inicio.localeCompare(b.inicio) || a.dono_id.localeCompare(b.dono_id)) };
}
