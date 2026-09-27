#!/usr/bin/env node
/* ============================================================
   NEXUS ADS — popular-demo.mjs
   Gera supabase/seed-demo.sql com o cenário fictício de web/demo.js
   gravado no formato das tabelas, para um cliente de teste
   ("demo-clinica") aparecer no painel real igual ao modo ?demo.

   Uso:  node scripts/popular-demo.mjs [--hoje=AAAA-MM-DD]

   As datas no SQL são RELATIVAS ao dia em que ele for executado
   (último dia do cenário = ontem em São Paulo), então o arquivo
   continua valendo se for aplicado dias depois de gerado.
   ============================================================ */
import { writeFileSync, mkdirSync } from "node:fs";
import { dirname, resolve } from "node:path";
import { fileURLToPath } from "node:url";
import { gerarDemo } from "../web/demo.js";
import { montar, datasetDeLinhas, hojeSP, isoDe } from "../web/nucleo.js";

export const SLUG = "demo-clinica";
export const NOME = "Clínica Demonstração";
export const CFG = { cpaAlvo: 15, orcamento: 1500 };
const PREFIXO = "demo-";
const LOTE = 400;   // linhas por INSERT: mantém cada comando num tamanho que o editor do Supabase aceita bem

const r2 = v => Math.round(v * 100) / 100;
const r4 = v => Math.round(v * 1e4) / 1e4;

/** Cenário da demo convertido para linhas de nx_metricas_dia e nx_leads. */
export function montarSeed({ hoje = hojeSP() } = {}) {
  const ds = gerarDemo({ hoje, nome: NOME, cfg: CFG });
  const M = montar(ds);
  const R = M.R;
  const iso = i => (i == null ? null : isoDe(M.dataDe(i)));

  // Nível anúncio: arredonda como o banco guarda (contagens inteiras, dinheiro em centavos).
  const anuncios = ds.LINHAS.map(l => ({
    nivel: "anuncio", i: l.i, plataforma: l.plat,
    campanha_ext: PREFIXO + l.camp, campanha_nome: ds.CAMP[l.camp].nome,
    anuncio_ext: PREFIXO + l.cri, anuncio_nome: ds.CRI[l.cri].nome,
    impressoes: Math.round(l.impressoes), alcance: Math.round(l.alcance || 0),
    frequencia: l.freq ? r4(l.freq) : 0, cliques: Math.round(l.cliques),
    gasto: r2(l.gasto), conversoes: l.conversoes,
  }));

  // Nível campanha = soma dos anúncios do mesmo dia (sem resíduo, então o
  // núcleo não cria o criativo "Outros anúncios da campanha").
  const soma = new Map();
  for (const a of anuncios) {
    const k = `${a.campanha_ext}|${a.i}`;
    const s = soma.get(k) || { nivel: "campanha", i: a.i, plataforma: a.plataforma, campanha_ext: a.campanha_ext,
      campanha_nome: a.campanha_nome, anuncio_ext: "", anuncio_nome: null,
      impressoes: 0, alcance: 0, cliques: 0, gasto: 0, conversoes: 0 };
    s.impressoes += a.impressoes; s.alcance += a.alcance; s.cliques += a.cliques;
    s.gasto += a.gasto; s.conversoes += a.conversoes;
    soma.set(k, s);
  }
  const campanhas = [...soma.values()].map(s => ({
    ...s, gasto: r2(s.gasto), frequencia: s.alcance > 0 ? r4(s.impressoes / s.alcance) : 0,
  }));
  const metricas = [...anuncios, ...campanhas].sort((a, b) => a.i - b.i || a.nivel.localeCompare(b.nivel)
    || a.campanha_ext.localeCompare(b.campanha_ext) || a.anuncio_ext.localeCompare(b.anuncio_ext));

  // Leads: a etapa de HOJE vem do núcleo; as datas saem dos índices do cenário.
  const leads = ds.LEADS.map(L => {
    const etapa = M.etapa(L);
    // "nova"/"perdida" ainda não marcaram (se a demo previa agenda depois de ontem, ela ainda não aconteceu)
    const marcou = etapa !== "nova" && etapa !== "perdida";
    return {
      i: L.i, nome: L.nome, origem: "anuncio", plataforma: L.plat,
      campanha_ext: PREFIXO + L.camp, anuncio_ext: PREFIXO + L.cri, servico: L.servico, etapa,
      iAgenda: marcou ? L.iAgenda : null,
      // agendada: dia marcado para a consulta (pode ser futuro); demais: dia em que veio ou faltou
      iConsulta: marcou ? L.iConsulta : null,
      valor: etapa === "fechou" ? M.valorLead(L) : null,
    };
  }).sort((a, b) => a.i - b.i);

  // Mesmas linhas no formato de nx_dados (é o que o painel e as funções leem).
  const nxMetricas = metricas.map(m => ({
    p: m.plataforma, d: iso(m.i), n: m.nivel, c: m.campanha_ext, cn: m.campanha_nome, a: m.anuncio_ext, an: m.anuncio_nome,
    imp: m.impressoes, alc: m.alcance, freq: m.frequencia, cli: m.cliques, g: m.gasto, conv: m.conversoes,
  }));
  const nxLeads = leads.map((L, n) => ({
    id: n + 1, nome: L.nome, telefone: null, origem: L.origem, plataforma: L.plataforma,
    campanha_ext: L.campanha_ext, anuncio_ext: L.anuncio_ext, servico: L.servico, etapa: L.etapa,
    data_conversa: iso(L.i), data_agenda: iso(L.iAgenda), data_consulta: iso(L.iConsulta), valor: L.valor, obs: null,
  }));

  return { hoje, R, ds, M, metricas, leads, nxMetricas, nxLeads, diasAtras: i => R - i + 1 };
}

/** Recalcula tudo a partir das linhas do banco e compara com a demo original.
    Devolve a lista de diferenças (vazia = o painel real vai mostrar o mesmo que o ?demo). */
export function conferir(seed) {
  const { ds, M: Md, R } = seed;
  const ds2 = datasetDeLinhas({ metricas: seed.nxMetricas, leads: seed.nxLeads, cliente: { nome: NOME, cfg: CFG }, hoje: seed.hoje, dias: ds.DIAS });
  const M2 = montar(ds2);
  const difs = [];
  const igual = (rot, a, b, tol = 0) => { if (!(Math.abs(a - b) <= tol)) difs.push(`${rot}: demo ${a} × banco ${b}`); };

  const janelas = [[R - 6, R, "7 dias"], [R - 29, R, "30 dias"], [0, R, "período todo"],
    ...Md.mesesDados().map(m => [m.de, m.ate, `mês ${m.mes + 1}/${m.ano}`])];
  for (const [de, ate, rot] of janelas) {
    const a = Md.crmTot(de, ate), b = M2.crmTot(de, ate);
    for (const k of ["conversas", "agendadas", "compareceram", "faltaram", "fecharam"]) igual(`${rot} · ${k}`, a[k], b[k]);
    igual(`${rot} · receita`, a.receita, b.receita, 0.005);
    const la = Md.linhasDe(de, ate), ta = Md.consolidar(la), tb = M2.consolidar(M2.linhasDe(de, ate));
    // cada linha foi arredondada para centavos: meio centavo de folga por linha
    igual(`${rot} · gasto`, ta.gasto, tb.gasto, 0.005 * la.length + 1e-9);
    igual(`${rot} · conversões`, ta.conversoes, tb.conversoes);
  }

  const etapas = M => M.LEADS.reduce((o, L) => ((o[M.etapa(L)] = (o[M.etapa(L)] || 0) + 1), o), {});
  const ea = etapas(Md), eb = etapas(M2);
  for (const k of new Set([...Object.keys(ea), ...Object.keys(eb)])) igual(`etapa ${k}`, ea[k] || 0, eb[k] || 0);

  // chave da demo ("r1|g3") → chave do banco ("r1|google:demo-g3")
  const chaveBanco = a => {
    if (a.chave === "ritmo") return a.chave;
    const id = a.chave.split("|")[1], ent = a.regra.nivel === "campanha" ? ds.CAMP[id] : ds.CRI[id];
    return `${a.regra.id}|${ent.plat}:${PREFIXO}${id}`;
  };
  const radarA = Md.avaliar(R, true).map(chaveBanco).sort().join(", ");
  const radarB = M2.avaliar(R, true).map(a => a.chave).sort().join(", ");
  if (radarA !== radarB) difs.push(`radar de ontem: demo [${radarA}] × banco [${radarB}]`);
  const epA = Md.historico().map(e => `${chaveBanco(e.a)}@${e.desde}-${e.ate}`).sort().join(", ");
  const epB = M2.historico().map(e => `${e.a.chave}@${e.desde}-${e.ate}`).sort().join(", ");
  if (epA !== epB) difs.push(`episódios do radar: demo [${epA}] × banco [${epB}]`);

  if (Object.keys(ds2.CRI).some(k => k.endsWith(":outros"))) difs.push("apareceu criativo \"Outros anúncios\" (campanha ≠ soma dos anúncios)");
  return difs;
}

/* ---------- SQL ---------- */
const txt = s => (s == null ? "null" : `'${String(s).replace(/'/g, "''")}'`);
const num = v => (v == null ? "null" : String(v));
const CLIENTE = `(select id from public.nx_clientes where slug = ${txt(SLUG)})`;
const ORIGEM = `(select id, (now() at time zone 'America/Sao_Paulo')::date as hoje from public.nx_clientes where slug = ${txt(SLUG)}) c`;

function lotes(arr, n) { const out = []; for (let k = 0; k < arr.length; k += n) out.push(arr.slice(k, k + n)); return out; }

export function gerarSql(seed) {
  const { metricas, leads, diasAtras, hoje } = seed;
  const S = [];
  S.push(
    "-- ============================================================",
    "-- NEXUS ADS — dados de demonstração (cliente 'demo-clinica')",
    `-- Gerado por scripts/popular-demo.mjs em ${hoje}. NÃO edite à mão: rode o script de novo.`,
    "-- Cenário FICTÍCIO (web/demo.js). Datas relativas ao dia da execução: o último dia = ontem.",
    "-- Pode rodar quantas vezes quiser: apaga e recria só os dados deste cliente.",
    `-- ${metricas.length} linhas de métricas · ${leads.length} pacientes`,
    "-- ============================================================",
    "",
    "begin;",
    "",
    "-- 1. cliente (cria ou reaproveita; cfg é mesclado)",
    "insert into public.nx_clientes as cl (slug, nome, cfg)",
    `values (${txt(SLUG)}, ${txt(NOME)}, ${txt(JSON.stringify(CFG))}::jsonb)`,
    "on conflict (slug) do update set nome = excluded.nome, cfg = cl.cfg || excluded.cfg;",
    "",
    "-- 2. limpa os dados anteriores deste cliente (só dele)",
    `delete from public.nx_alertas      where cliente_id = ${CLIENTE};`,
    `delete from public.nx_relatorios   where cliente_id = ${CLIENTE};`,
    `delete from public.nx_leads        where cliente_id = ${CLIENTE};`,
    `delete from public.nx_metricas_dia where cliente_id = ${CLIENTE};`,
    "",
    "-- 3. métricas por dia (nível anúncio e nível campanha)",
  );

  for (const bloco of lotes(metricas, LOTE)) {
    S.push(
      "insert into public.nx_metricas_dia",
      "  (cliente_id, plataforma, nivel, data, campanha_ext, campanha_nome, anuncio_ext, anuncio_nome,",
      "   impressoes, alcance, frequencia, cliques, gasto, conversoes, valor_conversao)",
      "select c.id, v.plataforma, v.nivel, c.hoje - v.dias_atras::int, v.campanha_ext, v.campanha_nome, v.anuncio_ext, v.anuncio_nome,",
      "       v.impressoes::bigint, v.alcance::bigint, v.frequencia::numeric, v.cliques::bigint, v.gasto::numeric, v.conversoes::numeric, 0",
      `from ${ORIGEM}`,
      "cross join (values",
      bloco.map(m => `  (${[txt(m.plataforma), txt(m.nivel), num(diasAtras(m.i)), txt(m.campanha_ext), txt(m.campanha_nome),
        txt(m.anuncio_ext), txt(m.anuncio_nome), num(m.impressoes), num(m.alcance), num(m.frequencia), num(m.cliques),
        num(m.gasto), num(m.conversoes)].join(", ")})`).join(",\n"),
      ") as v(plataforma, nivel, dias_atras, campanha_ext, campanha_nome, anuncio_ext, anuncio_nome,",
      "       impressoes, alcance, frequencia, cliques, gasto, conversoes)",
      "on conflict (cliente_id, plataforma, data, nivel, campanha_ext, anuncio_ext) do nothing;",
      "",
    );
  }

  S.push("-- 4. pacientes (etapas e valores calculados pelo núcleo; telefone vazio de propósito)");
  const d = i => (i == null ? "null" : String(diasAtras(i)));
  for (const bloco of lotes(leads, LOTE)) {
    S.push(
      "insert into public.nx_leads",
      "  (cliente_id, nome, origem, plataforma, campanha_ext, anuncio_ext, servico, etapa,",
      "   data_conversa, data_agenda, data_consulta, valor, criado_em)",
      "select c.id, v.nome, v.origem, v.plataforma, v.campanha_ext, v.anuncio_ext, v.servico, v.etapa,",
      "       c.hoje - v.conversa::int, c.hoje - v.agenda::int, c.hoje - v.consulta::int, v.valor::numeric,",
      "       ((c.hoje - v.conversa::int) + time '12:00') at time zone 'America/Sao_Paulo'",
      `from ${ORIGEM}`,
      "cross join (values",
      bloco.map(L => `  (${[txt(L.nome), txt(L.origem), txt(L.plataforma), txt(L.campanha_ext), txt(L.anuncio_ext),
        txt(L.servico), txt(L.etapa), d(L.i), d(L.iAgenda), d(L.iConsulta), num(L.valor)].join(", ")})`).join(",\n"),
      ") as v(nome, origem, plataforma, campanha_ext, anuncio_ext, servico, etapa, conversa, agenda, consulta, valor);",
      "",
    );
  }

  S.push(
    "commit;",
    "",
    "-- conferência",
    "select",
    `  (select count(*) from public.nx_metricas_dia where cliente_id = ${CLIENTE} and nivel = 'anuncio')  as metricas_anuncio,`,
    `  (select count(*) from public.nx_metricas_dia where cliente_id = ${CLIENTE} and nivel = 'campanha') as metricas_campanha,`,
    `  (select count(*) from public.nx_leads where cliente_id = ${CLIENTE}) as pacientes;`,
    "",
  );
  return S.join("\n");
}

/** Resumo para imprimir e para os testes. */
export function contagens(seed) {
  const c = { anuncio: 0, campanha: 0, gasto: 0, conversoes: 0, etapas: {}, receita: 0 };
  for (const m of seed.metricas) {
    c[m.nivel]++;
    if (m.nivel === "anuncio") { c.gasto += m.gasto; c.conversoes += m.conversoes; }
  }
  for (const L of seed.leads) { c.etapas[L.etapa] = (c.etapas[L.etapa] || 0) + 1; c.receita += L.valor || 0; }
  c.gasto = r2(c.gasto);
  return c;
}

/* ---------- linha de comando ---------- */
function principal() {
  const arg = process.argv.slice(2).find(a => a.startsWith("--hoje="));
  const hoje = arg ? arg.slice(7) : hojeSP();
  if (!/^\d{4}-\d{2}-\d{2}$/.test(hoje)) { console.error(`Data inválida em --hoje: "${hoje}" (use AAAA-MM-DD).`); process.exitCode = 1; return; }

  const seed = montarSeed({ hoje });
  const difs = conferir(seed);
  const sql = gerarSql(seed);
  const destino = resolve(dirname(fileURLToPath(import.meta.url)), "../supabase/seed-demo.sql");
  mkdirSync(dirname(destino), { recursive: true });
  writeFileSync(destino, sql, "utf8");

  const c = contagens(seed), primeiro = isoDe(seed.M.dataDe(0)), ultimo = isoDe(seed.M.dataDe(seed.R));
  console.log(`Arquivo: ${destino} (${(Buffer.byteLength(sql) / 1024).toFixed(0)} KB)`);
  console.log(`Cliente: ${SLUG} · ${NOME} · cfg ${JSON.stringify(CFG)}`);
  console.log(`Período (se rodar hoje, ${hoje}): ${primeiro} a ${ultimo}`);
  console.log(`Métricas: ${c.anuncio} linhas de anúncio + ${c.campanha} de campanha = ${c.anuncio + c.campanha}`);
  console.log(`Investido: R$ ${c.gasto.toFixed(2)} · conversas: ${c.conversoes}`);
  console.log(`Pacientes: ${seed.leads.length} · ${Object.entries(c.etapas).sort((a, b) => b[1] - a[1]).map(([k, v]) => `${k} ${v}`).join(" · ")}`);
  console.log(`Tratamentos fechados (valor): R$ ${c.receita.toFixed(2)}`);
  if (difs.length) {
    console.log(`\nConferência: ${difs.length} diferença(s) entre a demo e o que o banco vai mostrar:`);
    difs.forEach(x => console.log("  - " + x));
    process.exitCode = 1;
  } else {
    console.log("\nConferência: ok — recalculando a partir das linhas do banco, o painel mostra os mesmos números do ?demo.");
  }
}

const chamadoDireto = process.argv[1] && resolve(process.argv[1]).toLowerCase() === fileURLToPath(import.meta.url).toLowerCase();
if (chamadoDireto) principal();
