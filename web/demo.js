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
import { cfgCom, meioDia, hojeSP } from "./nucleo.js";

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
export function gerarDemo({ sal = "pdz", hoje = hojeSP(), nome = "Clínica Demonstração", cfg = {} } = {}) {
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

  function novoLead(c, k, i, r) {
    const servico = servicoDe(c);
    const lista = r() < .62 ? NOMES_F : NOMES_M;
    const nomeP = `${lista[Math.floor(r() * lista.length)]} ${INICIAIS[Math.floor(r() * INICIAIS.length)]}.`;
    const L = { id: LEADS.length + 1, i, camp: c.id, cri: k.id, plat: c.plat, servico, nome: nomeP, telefone: "",
                iAgenda: null, iConsulta: null, compareceu: false, fechou: false, fator: .85 + r() * .3 };
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

  return { LINHAS, LEADS, CAMP, CRI, CFG: cfgCom(cfg), REF, DIAS, nome, curto: nome.split(" ")[0], demo: true };
}
