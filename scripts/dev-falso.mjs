#!/usr/bin/env node
// Órbita local: servidor restrito a loopback, com respostas fictícias em memória.
// Não lê credenciais, não chama serviços externos e nunca altera prontos.js.
import http from "node:http";
import { readFile } from "node:fs/promises";
import { extname, resolve, sep } from "node:path";
import { fileURLToPath } from "node:url";
import { gerarDemo } from "../web/demo.js";
import * as N from "../web/nucleo.js";

const ROOT = resolve(fileURLToPath(new URL("../web/", import.meta.url)));
const HOST = "127.0.0.1";
const PORT = Math.max(1024, Number(process.env.ORBITA_DEV_FALSO_PORT) || 4173);
const MIME = { ".html": "text/html; charset=utf-8", ".js": "text/javascript; charset=utf-8", ".mjs": "text/javascript; charset=utf-8",
  ".css": "text/css; charset=utf-8", ".json": "application/json; charset=utf-8", ".webmanifest": "application/manifest+json; charset=utf-8",
  ".svg": "image/svg+xml", ".png": "image/png", ".jpg": "image/jpeg", ".jpeg": "image/jpeg", ".webp": "image/webp", ".woff2": "font/woff2" };
const ID = {
  cliente: "f1000000-0000-4000-8000-000000000001", org: "f1000000-0000-4000-8000-000000000002",
  eu: "f1000000-0000-4000-8000-000000000003", ana: "f1000000-0000-4000-8000-000000000004",
  funil: "f1", pos: "f2", dep: "d1", canal: "cw1", meta: "wa1",
};
const isoAgora = () => new Date().toISOString();
const spData = d => new Intl.DateTimeFormat("en-CA", { timeZone: "America/Sao_Paulo", year: "numeric", month: "2-digit", day: "2-digit" }).format(d);
const somaDia = (base, delta) => { const [y, m, d] = base.split("-").map(Number); const x = new Date(Date.UTC(y, m - 1, d + delta, 12)); return `${x.getUTCFullYear()}-${String(x.getUTCMonth()+1).padStart(2,"0")}-${String(x.getUTCDate()).padStart(2,"0")}`; };
const hora = (d, h, m = "00") => `${d}T${h}:${m}:00-03:00`;
const nomesEtapas = [
  { id: "s1", nome: "Nova conversa", tipo: "aberto", marco: "nova", probabilidade: 10, cor: "#6FA3CF" },
  { id: "s2", nome: "Avaliação agendada", tipo: "aberto", marco: "agendada", probabilidade: 30, cor: "#8FB8DD" },
  { id: "s3", nome: "Avaliou / orçamento", tipo: "aberto", marco: "orcamento", probabilidade: 50, cor: "#E5B35C" },
  { id: "s4", nome: "Faltou", tipo: "aberto", marco: "faltou", probabilidade: 10, cor: "#C9BFAF" },
  { id: "s5", nome: "Fechou tratamento", tipo: "ganho", marco: "fechou", probabilidade: 100, cor: "#7FD1A5" },
  { id: "s6", nome: "Não fechou", tipo: "perdido", marco: "nao_fechou", probabilidade: 0, cor: "#F08A74" },
  { id: "s7", nome: "Perdido", tipo: "perdido", marco: "perdida", probabilidade: 0, cor: "#9D9486" },
];
const funis = [
  { id: ID.funil, nome: "Pacientes", ativo: true, padrao: true, conta_no_ads: true, ordem: 1, estagios: nomesEtapas.map((e, i) => ({ ...e, funil_id: ID.funil, ordem: i + 1, ativo: true })) },
  { id: ID.pos, nome: "Pós-tratamento", ativo: true, padrao: false, conta_no_ads: false, ordem: 2, estagios: [
    { id: "p1", nome: "Em tratamento", tipo: "aberto", probabilidade: 60, ordem: 1, ativo: true },
    { id: "p2", nome: "Concluído", tipo: "ganho", probabilidade: 100, ordem: 2, ativo: true },
  ] },
];
const contatos = [
  { id: 501, nome: "Mariana Costa", telefone: "5500000000501", email: "mariana@example.test", origem: "anuncio", plataforma: "google", campanha_nome: "Aparelho invisível · pesquisa", cidade: "Taubaté", uf: "SP", etiquetas: ["e1"] },
  { id: 502, nome: "Rafael Mendes", telefone: "5500000000502", email: "rafael@example.test", origem: "whatsapp", plataforma: null, campanha_nome: null, cidade: "Taubaté", uf: "SP", etiquetas: ["e2"] },
  { id: 503, nome: "Bianca Ferreira", telefone: "5500000000503", email: "bianca@example.test", origem: "anuncio", plataforma: "meta", campanha_nome: "Avaliação humanizada", cidade: "Pindamonhangaba", uf: "SP", etiquetas: ["e3"] },
  { id: 504, nome: "Lucas Oliveira", telefone: "5500000000504", email: "lucas@example.test", origem: "indicacao", plataforma: null, campanha_nome: null, cidade: "Taubaté", uf: "SP", etiquetas: [] },
];
const negocios = [
  { id: 801, contato_id: 501, titulo: "Aparelho invisível", servico: "Alinhador transparente", estagio_id: "s3", valor_previsto: 5200, dono_id: ID.eu, consulta_offset: 1, origem: "anuncio", plataforma: "google", campanha_nome: "Aparelho invisível · pesquisa" },
  { id: 802, contato_id: 502, titulo: "Implante dentário", servico: "Implante", estagio_id: "s2", valor_previsto: 6800, dono_id: ID.ana, consulta_offset: 0, origem: "whatsapp" },
  { id: 803, contato_id: 503, titulo: "Clareamento", servico: "Clareamento", estagio_id: "s1", valor_previsto: 950, dono_id: null, origem: "anuncio", plataforma: "meta", campanha_nome: "Avaliação humanizada" },
  { id: 804, contato_id: 504, titulo: "Avaliação preventiva", servico: "Clínica geral", estagio_id: "s5", valor_previsto: 0, valor: 1450, dono_id: ID.eu, consulta_offset: -4, origem: "indicacao" },
];
const usuarios = [
  { id: ID.eu, nome: "Dra. Helena", papel: "admin", aprovado: true, departamentos: [ID.dep], recebe_conversas: true },
  { id: ID.ana, nome: "Ana Paula", papel: "atendente", aprovado: true, departamentos: [ID.dep], recebe_conversas: true },
];
const etiquetas = [{ id: "e1", nome: "Aparelho invisível", cor: "#A98BD6" }, { id: "e2", nome: "Implante", cor: "#6FA3CF" }, { id: "e3", nome: "Clareamento", cor: "#E5B35C" }];
const departamentos = [{ id: ID.dep, nome: "Recepção", cor: "#6FA3CF", padrao: true, distribuicao: "rodizio", ativo: true,
  horario: { 0: [], 1: [["08:00", "18:00"]], 2: [["08:00", "18:00"]], 3: [["08:00", "18:00"]], 4: [["08:00", "18:00"]], 5: [["08:00", "18:00"]], 6: [["08:00", "12:00"]] } }];
const canais = [
  { id: ID.canal, nome: "Recepção · CodeWords", provedor: "codewords", numero_exibicao: "+55 00 00000-0001", status: "ativo", departamento_id: ID.dep,
    codewords: { tem_api_key: true, service_id: "cw-demo-fluxo", ia_ligada: true, ia_volta_horas: 6, rota: "fluxo", numero: "+55 00 00000-0001", sync: { em: isoAgora() } } },
  { id: ID.meta, nome: "WhatsApp oficial · Meta", provedor: "meta", numero_exibicao: "+55 12 99123-4567", status: "ativo", departamento_id: ID.dep,
    tem_token: true, tem_app_secret: false, app_inscrito: true, qualidade: "GREEN", phone_number_id: "demo-phone-id", waba_id: "demo-waba-id", verificado_em: isoAgora() },
];
const respostas = [
  { id: "r1", atalho: "ola", titulo: "Boas-vindas", corpo: "Olá, {primeiro_nome}! Aqui é {atendente}, da {empresa}. Como posso ajudar?", ativo: true, ordem: 1, usos: 18 },
  { id: "r2", atalho: "endereco", titulo: "Endereço", corpo: "Estamos no Square Offices & Mall, em Taubaté.", ativo: true, ordem: 2, usos: 12 },
  { id: "r3", atalho: "avaliacao", titulo: "Avaliação", corpo: "A avaliação é o primeiro passo. Qual dia fica melhor para você?", ativo: true, ordem: 3, usos: 9 },
];
const templates = [{ id: "t1", canal_id: ID.meta, nome: "confirmacao_consulta", idioma: "pt_BR", categoria: "UTILITY", status: "APPROVED", corpo: "Olá {{1}}, confirmamos sua consulta para {{2}} às {{3}}.", num_parametros: 3 }];
const configuracaoIA = { sobre: "Clínica odontológica em Taubaté. Atendimento humanizado e equipe multidisciplinar.", servicos: "Aparelho invisível, implantes, estética e clínica geral.", horarios: "Segunda a sexta, das 8h às 18h.", regras: "Não diagnosticar; encaminhar urgências para a equipe.", proibido: "Não prometer resultados nem inventar preços.", tom: "proximo" };

const hoje = spData(new Date());
const agendamentos = negocios.filter(n => n.consulta_offset != null).map(n => {
  const c = contatos.find(x => x.id === n.contato_id), dia = somaDia(hoje, n.consulta_offset);
  const h = n.id === 801 ? "10:00" : n.id === 802 ? "14:30" : n.id === 804 ? "09:00" : "16:00";
  const [hh, mm] = h.split(":").map(Number);
  const end = new Date(`${dia}T${h}:00-03:00`); end.setMinutes(end.getMinutes() + 45);
  return { negocio_id: n.id, contato_id: c.id, nome: c.nome, telefone: c.telefone, inicio: hora(dia, String(hh).padStart(2,"0"), String(mm).padStart(2,"0")), fim: end.toISOString(), servico: n.servico,
    status: "aberto", etapa: nomesEtapas.find(e => e.id === n.estagio_id)?.nome, marco: n.estagio_id === "s2" ? "agendada" : null, titulo: n.titulo,
    origem: n.origem, plataforma: n.plataforma || null, campanha_nome: n.campanha_nome || null, anuncio_nome: null, rastreio: null };
});
const bloqueios = [{ id: "b1", inicio: hora(somaDia(hoje, 2), "12", "00"), fim: hora(somaDia(hoje, 2), "13", "00"), motivo: "Intervalo da equipe" }];
const conversas = [
  { id: 901, contato_id: 501, canal_id: ID.canal, status: "aberta", aguardando: true, atribuida_a: ID.eu, atribuida_nome: "Dra. Helena", nao_lidas: 2, protocolo: "ORB-2026-00901", minutos: 3,
    mensagens: [{ direcao: "in", corpo: "Oi! Vi o anúncio do aparelho invisível. Como funciona a avaliação?", minutos: 7 }, { direcao: "out", corpo: "Olá, Mariana! Vamos explicar tudo com calma na avaliação.", minutos: 5 }, { direcao: "in", corpo: "Tem algum horário esta semana?", minutos: 3 }] },
  { id: 902, contato_id: 502, canal_id: ID.meta, status: "aberta", aguardando: true, atribuida_a: null, atribuida_nome: null, nao_lidas: 1, protocolo: "ORB-2026-00902", minutos: 15,
    mensagens: [{ direcao: "in", corpo: "Perdi um dente e gostaria de saber sobre implante.", minutos: 15 }] },
  { id: 903, contato_id: 503, canal_id: ID.canal, status: "pendente", aguardando: false, atribuida_a: ID.ana, atribuida_nome: "Ana Paula", nao_lidas: 0, protocolo: "ORB-2026-00903", minutos: 55,
    mensagens: [{ direcao: "in", corpo: "Queria saber o valor do clareamento.", minutos: 65 }, { direcao: "out", corpo: "A dentista consegue indicar a melhor opção após avaliar seu sorriso.", minutos: 55 }] },
];
const dataConv = c => {
  const ct = contatos.find(x => x.id === c.contato_id), canal = canais.find(x => x.id === c.canal_id);
  const when = new Date(Date.now() - c.minutos * 60000).toISOString();
  return { id: c.id, contato: { id: ct.id, nome: ct.nome, telefone: ct.telefone, optin_marketing: true, bloqueado: false }, canal_id: c.canal_id, departamento_id: ID.dep,
    atribuida_a: c.atribuida_a, atribuida_nome: c.atribuida_nome, status: c.status, aguardando: c.aguardando, nao_lidas: c.nao_lidas,
    ultima_msg_em: when, ultima_msg_resumo: c.mensagens.at(-1).corpo, ultima_msg_dir: c.mensagens.at(-1).direcao, ultima_entrada_em: when,
    janela_ate: new Date(Date.now() + (24 * 60 - c.minutos) * 60000).toISOString(), etiquetas: ct.etiquetas, protocolo: c.protocolo, oculta: false,
    negocio: negocios.filter(n => n.contato_id === ct.id).map(n => ({ id: n.id, titulo: n.titulo, status: "aberto", estagio_nome: nomesEtapas.find(e => e.id === n.estagio_id)?.nome, estagio_cor: "#6FA3CF" }))[0] || null,
    canal: canal ? { id: canal.id, nome: canal.nome, numero_exibicao: canal.numero_exibicao, status: canal.status, provedor: canal.provedor, tem_token: true } : null,
    departamento: departamentos[0] };
};

const demoAds = (() => {
  const ds = gerarDemo({ nome: "Clínica Sorriso Vivo", hoje });
  const M = N.montar(ds), data = i => N.isoDe(M.dataDe(i));
  return { hoje, cliente: { id: ID.cliente, slug: "sorriso-vivo", nome: "Clínica Sorriso Vivo", cfg: {} }, demo: true,
    metricas: ds.LINHAS.map(l => ({ p: l.plat, d: data(l.i), n: "anuncio", c: l.camp, cn: ds.CAMP[l.camp].nome, a: l.cri, an: ds.CRI[l.cri].nome,
      imp: l.impressoes, alc: l.alcance, freq: l.freq || 0, cli: l.cliques, g: l.gasto, conv: l.conversoes })),
    leads: ds.LEADS.filter(L => L.i <= M.R).map(L => ({ id: L.id, nome: L.nome, telefone: "", origem: "anuncio", plataforma: L.plat, campanha_ext: L.camp,
      anuncio_ext: L.cri, servico: L.servico, etapa: M.etapa(L), data_conversa: data(L.i), data_agenda: L.iAgenda != null ? data(L.iAgenda) : null,
      data_consulta: L.iConsulta != null ? data(L.iConsulta) : null, valor: L.fechou ? M.valorLead(L) : null, obs: "" })),
    alertas: M.avaliar(M.R, true).map((a, i) => ({ regra: a.regra.id, chave: a.chave, severidade: a.sev, mensagem: a.msg, acao: a.acao, referencia: data(M.R), criado_em: hora(data(M.R + 1), "08", `0${i}`), enviado_em: hora(data(M.R + 1), "08", `0${i}`), entregue_em: hora(data(M.R + 1), "08", `1${i}`) })),
    relatorios: [], integracoes: [{ canal: "meta", ativo: true, ultimo_sync: new Date(Date.now() - 18 * 60000).toISOString(), status: "ok — 58 linhas" },
      { canal: "google", ativo: true, ultimo_sync: new Date(Date.now() - 18 * 60000).toISOString(), status: "ok — 31 linhas" }] };
})();

function sessao() {
  return { conta: { id: ID.eu, nome: "Dra. Helena", email: "demo@example.test", papel: "gestor", super: true, telefone: null },
    org: { id: ID.org, nome: "Nexus", slug: "nexus", marca: { produto: "Órbita", cores: { primaria: "#B0761F", secundaria: "#6FA3CF", fundo: "#07090C" } }, img_hash: "dev-falso" },
    super: true, link_base_padrao: null, modulos_plano: {}, clientes: [{ id: ID.cliente, slug: "sorriso-vivo", nome: "Clínica Sorriso Vivo", plano: "completo", status: "teste", vertical: "odonto", papel: "admin", proprio: true,
      modulos: ["crm", "conversas", "relatorios", "ads", "automacoes"], teste_ate: somaDia(hoje, 14), tem_tema: false, cfg: {} }] };
}
const marcaPublica = { org: { id: ID.org, nome: "Nexus", slug: "nexus" }, marca: { produto: "Órbita", cores: { primaria: "#B0761F", secundaria: "#6FA3CF", fundo: "#07090C" }, login_titulo: "Seu atendimento em movimento", login_texto: "Entre para acompanhar conversas, pacientes e campanhas.", suporte_wa: "5500000000000" } };
const baseCrm = { funis, campos: [{ id: "cf1", entidade: "contato", chave: "convenio", rotulo: "Convênio", tipo: "texto", ativo: true }], etiquetas,
  motivos: [{ id: "m1", nome: "Preço", exige_texto: false }, { id: "m2", nome: "Sem retorno", exige_texto: false }], usuarios, ticket: 2600,
  eu: { id: ID.eu, nome: "Dra. Helena", papel: "admin" } };
const baseConversas = { eu: { id: ID.eu, nome: "Dra. Helena", papel: "admin", departamentos: [ID.dep], ver_todas: true }, canais,
  departamentos, respostas, etiquetas, usuarios, templates, cfg: { recibo_leitura: true, assinatura: false },
  ia: { ligada: true, cota: { usadas: 42, limite: 300 } }, config: { departamentos, ia: configuracaoIA } };
const horarioDefault = { 0: [], 1: [["08:00", "18:00"]], 2: [["08:00", "18:00"]], 3: [["08:00", "18:00"]], 4: [["08:00", "18:00"]], 5: [["08:00", "18:00"]], 6: [["08:00", "12:00"]] };
const relVendas = () => {
  const receitasGanhos = [3150, 3200, 2800, 3600, 2900, 3150, 3000, 3100, 3500];
  let ganho = 0;
  const serie = Array.from({ length: 14 }, (_, i) => {
    const d = somaDia(hoje, i - 13);
    const criados = 1 + i % 4 + (i % 5 === 0 ? 1 : 0);
    const ganhos = (i % 3 === 0 ? 1 : 0) + ([2, 5, 8, 11].includes(i) ? 1 : 0);
    const receita = Array.from({ length: ganhos }, () => receitasGanhos[ganho++]).reduce((s, v) => s + v, 0);
    return { d, criados, ganhos, receita };
  });
  return { funis: funis.map(f => ({ id: f.id, nome: f.nome })), funil_ref: { id: ID.funil, nome: "Pacientes" },
  kpis: { criados: 36, ganhos: 9, receita: 28400, conversao_pct: 69.2, ticket_medio: 3155.56, ciclo_medio_dias: 12, abertos: 18, valor_aberto: 67400, previsao_ponderada: 26200, perdidos: 4, valor_perdido: 9800 },
  kpis_anterior: { criados: 29, ganhos: 7, receita: 20300, conversao_pct: 28, ticket_medio: 2900, ciclo_medio_dias: 16, perdidos: 18 },
  funil: nomesEtapas.map((e, i) => ({ nome: e.nome, cor: e.cor, tipo: e.tipo, qtd_atual: [8, 5, 4, 1, 9, 2, 2][i], valor_atual: [0, 0, 0, 0, 28400, 9800, 0][i], passaram: [36, 21, 14, 6, 9, 4, 2][i], avancaram: [21, 14, 9, 2, 0, 0, 0][i], conversao_proxima_pct: [58, 67, 64, 33, null, null, null][i] })),
  serie,
  por_origem: [{ origem: "anuncio", plataforma: "google", nome: "Google Ads", criados: 16, ganhos: 5, perdidos: 2, receita: 16200, conversao_pct: 71.4 }, { origem: "whatsapp", nome: "WhatsApp", criados: 12, ganhos: 2, perdidos: 1, receita: 6300, conversao_pct: 66.7 }, { origem: "indicacao", nome: "Indicação", criados: 8, ganhos: 2, perdidos: 1, receita: 5900, conversao_pct: 66.7 }],
  motivos_perda: [{ nome: "Preço", qtd: 3, valor: 7400 }, { nome: "Sem retorno", qtd: 1, valor: 2400 }],
  por_dono: [{ nome: "Dra. Helena", criados: 22, ganhos: 6, receita: 19200, ticket_medio: 3200, abertos: 11 }, { nome: "Ana Paula", criados: 14, ganhos: 3, receita: 9200, ticket_medio: 3066.67, abertos: 7 }],
  parados: [] };
};
const relAtendimento = () => ({ kpis: { novas: 64, resolvidas: 58, msgs_in: 192, msgs_out: 247, tpr_mediana_min: 8, tpr_media_min: 12, resolucao_mediana_h: 3.2, abertas_agora: 5, aguardando_agora: 2, sem_resposta: 3 },
  kpis_anterior: { novas: 53, resolvidas: 47, msgs_in: 160, msgs_out: 205, tpr_mediana_min: 11, tpr_media_min: 15, resolucao_mediana_h: 4.1, sem_resposta: 6 },
  departamentos: departamentos.map(d => ({ id: d.id, nome: d.nome })),
  serie: Array.from({ length: 14 }, (_, i) => ({ d: somaDia(hoje, i - 13), novas: 2 + i % 5, resolvidas: 1 + i % 4 })),
  mapa_calor: Array.from({ length: 10 }, (_, i) => ({ dow: (i + 1) % 6, hora: 8 + i % 9, qtd: 2 + i % 8 })),
  por_atendente: [{ nome: "Dra. Helena", novas: 37, resolvidas: 33, abertas_agora: 3, tpr_mediana_min: 6 }, { nome: "Ana Paula", novas: 27, resolvidas: 25, abertas_agora: 2, tpr_mediana_min: 10 }],
  por_departamento: [{ nome: "Recepção", novas: 64, resolvidas: 58, abertas_agora: 5, tpr_mediana_min: 8 }],
  por_canal: [{ nome: "CodeWords", novas: 39, resolvidas: 34, abertas_agora: 3, tpr_mediana_min: 6 }, { nome: "WhatsApp oficial · Meta", novas: 25, resolvidas: 24, abertas_agora: 2, tpr_mediana_min: 10 }] });

function colunaFunil(funilId) {
  const f = funis.find(x => x.id === funilId) || funis[0];
  return { colunas: f.estagios.map(e => {
    const itens = negocios.filter(n => n.estagio_id === e.id && f.id === ID.funil).map(n => {
      const c = contatos.find(x => x.id === n.contato_id);
      const quando = n.consulta_inicio || (n.consulta_offset == null ? null : hora(somaDia(hoje, n.consulta_offset), n.id === 802 ? "14" : "10", n.id === 802 ? "30" : "00"));
      return { ...n, titulo: n.titulo, contato: { ...c }, funil_id: f.id, funil_nome: f.nome, estagio_nome: e.nome, estagio_cor: e.cor, estagio_tipo: e.tipo,
        status: e.tipo, valor: n.valor || null, ordem: 0, criado_em: new Date(Date.now() - 86400000 * (n.id % 9 + 1)).toISOString(), estagio_em: isoAgora(),
        anuncio: n.origem === "anuncio", campanha_nome: n.campanha_nome || null, consulta_em: quando, nao_lidas: n.id === 801 ? 2 : 0, tarefa: null };
    });
    return { estagio_id: e.id, total: itens.length, soma_previsto: itens.reduce((s,n)=>s+(+n.valor_previsto||0),0), soma_valor: itens.reduce((s,n)=>s+(+n.valor||0),0), itens };
  }) };
}

function crmNegocio(id) {
  const n = negocios.find(x => String(x.id) === String(id));
  if (!n) return { negocio: null };
  const c = contatos.find(x => x.id === n.contato_id), e = nomesEtapas.find(x => x.id === n.estagio_id);
  return { contato: { ...c }, conversas: conversas.filter(v => v.contato_id === c.id).map(dataConv),
    negocio: { ...n, contato: { ...c }, funil_nome: "Pacientes", estagio_nome: e?.nome, estagio_cor: e?.cor, estagio_tipo: e?.tipo,
    criado_em: new Date(Date.now() - 86400000 * 4).toISOString(), atualizado_em: isoAgora(), tarefas: [], notas: [], historico: [],
    anuncio: n.origem === "anuncio", campanha_nome: n.campanha_nome || null,
    consulta_em: n.consulta_inicio || (n.consulta_offset == null ? null : hora(somaDia(hoje, n.consulta_offset), "10")) } };
}

function duracaoAgenda(servico) {
  const s = String(servico || "").normalize("NFD").replace(/[\u0300-\u036f]/g, "").toLowerCase();
  return s.includes("implante") ? 60 : s.includes("limpeza") ? 45 : 30;
}

function agendaLivres(p) {
  const de = String(p.p_a_partir || hoje).slice(0, 10);
  const dias = Math.max(1, Math.min(30, Number(p.p_dias) || 14));
  const duracao = duracaoAgenda(p.p_servico);
  const ignorarId = String(p.p_negocio ?? "");
  const horarios = [];
  for (let i = 0; i < dias && horarios.length < 8; i++) {
    const dia = somaDia(de, i);
    if (new Date(`${dia}T12:00:00-03:00`).getDay() === 0) continue;
    for (const h of ["09", "11", "13", "15", "17"]) {
      const inicio = hora(dia, h);
      const iniMs = Date.parse(inicio);
      const fimMs = iniMs + duracao * 60000;
      if (!Number.isFinite(iniMs) || iniMs < Date.now() + 2 * 60 * 60000) continue;
      const ocupados = agendamentos.some(a => String(a.negocio_id) !== ignorarId
        && iniMs < Date.parse(a.fim) && fimMs > Date.parse(a.inicio))
        || bloqueios.some(b => iniMs < Date.parse(b.fim) && fimMs > Date.parse(b.inicio));
      horarios.push({ inicio, rotulo: `${dia} ${h}:00`, ocupados: ocupados ? 1 : 0, capacidade: 1, livre: !ocupados });
      if (horarios.length >= 8) break;
    }
  }
  return { fuso: "America/Sao_Paulo", duracao_min: duracao, horarios };
}

function agendaMarcar(p) {
  const negocioId = String(p.p_negocio ?? "");
  const n = negocios.find(x => String(x.id) === negocioId);
  const inicioMs = Date.parse(p.p_inicio);
  if (!n) return { ok: false, erro: "negocio_nao_encontrado" };
  if (!Number.isFinite(inicioMs)) return { ok: false, erro: "dados_invalidos" };
  const inicio = new Date(inicioMs).toISOString();
  const duracao = duracaoAgenda(p.p_servico || n.servico);
  const fim = new Date(inicioMs + duracao * 60000).toISOString();
  const conflito = agendamentos.some(a => String(a.negocio_id) !== negocioId
    && inicioMs < Date.parse(a.fim) && inicioMs + duracao * 60000 > Date.parse(a.inicio))
    || bloqueios.some(b => inicioMs < Date.parse(b.fim) && inicioMs + duracao * 60000 > Date.parse(b.inicio));
  if (conflito) return { ok: false, erro: "horario_ocupado" };
  const c = contatos.find(x => x.id === n.contato_id);
  const idx = agendamentos.findIndex(a => String(a.negocio_id) === negocioId);
  const item = { negocio_id: n.id, contato_id: c.id, nome: c.nome, telefone: c.telefone, inicio, fim,
    servico: String(p.p_servico || n.servico || "").slice(0, 80), status: "aberto",
    etapa: nomesEtapas.find(e => e.id === n.estagio_id)?.nome, marco: "agendada", titulo: n.titulo,
    origem: n.origem, plataforma: n.plataforma || null, campanha_nome: n.campanha_nome || null, anuncio_nome: null, rastreio: null };
  if (idx >= 0) agendamentos[idx] = item; else agendamentos.push(item);
  n.consulta_inicio = inicio;
  n.consulta_offset = Math.round((Date.parse(inicio.slice(0, 10)) - Date.parse(`${hoje}T00:00:00Z`)) / 86400000);
  n.servico = item.servico;
  return { ok: true, remarcada: idx >= 0, consulta: item };
}

function agendaDesmarcar(p) {
  const id = String(p.p_negocio ?? "");
  const idx = agendamentos.findIndex(a => String(a.negocio_id) === id);
  if (idx < 0) return { ok: false, erro: "consulta_nao_encontrada" };
  agendamentos.splice(idx, 1);
  const n = negocios.find(x => String(x.id) === id);
  if (n) { n.consulta_inicio = null; n.consulta_offset = null; }
  return { ok: true, negocio_id: Number(id), motivo: String(p.p_motivo || "").slice(0, 200) || null };
}

function rpc(nome, p = {}) {
  switch (nome) {
    case "nx_marca_publica": return marcaPublica;
    case "nx_entrar": return { token: "demo-local-token" };
    case "nx_app_sessao": return sessao();
    case "nx_cliente_tema": return { tema: {}, marca_cliente: {}, atualizado: "dev-falso" };
    case "nx_pulso": return { v: 1, notif: 2, agora: isoAgora() };
    case "nx_notificacoes_listar": return { itens: [], nao_lidas: 0 };
    case "nx_inicio": return { hoje, agora: isoAgora(), conversas: { aguardando: 2, sem_dono: 1, minhas: 1, abertas: 3, espera_mais_antiga_min: 15 },
      leads: { hoje: 4, hoje_anuncio: 2, semana: 23, semana_anuncio: 14 },
      negocios: { ganhos_mes: 9, abertos: 18, valor_aberto: 67400, previsao_ponderada: 26200, receita_mes: 28400, receita_mes_anterior: 20300, ganhos_mes_anterior: 7, receita_mes_anterior_parcial: 20300, dia_do_mes: Number(hoje.slice(-2)) },
      tarefas: { hoje: 4, atrasadas: 1, abertas: 7, proximas: [{ id: 71, tipo: "ligacao", titulo: "Confirmar avaliação com Mariana", vence_em: isoAgora(), atrasada: false, contato_id: 501, dono: { id: ID.eu, nome: "Dra. Helena" } }] },
      canais: canais.map(c => ({ nome: c.nome, numero_exibicao: c.numero_exibicao, status: c.status, provedor: c.provedor, app_inscrito: true, verificado_em: isoAgora(), ultima_entrada_em: isoAgora() })) };
    case "nx_crm_base": return baseCrm;
    case "nx_negocios_kanban": return colunaFunil(p.p_funil);
    case "nx_negocios_coluna": return { itens: [] };
    case "nx_negocio_ver": return crmNegocio(p.p_id);
    case "nx_contatos_listar": return { itens: contatos.map(c => ({ ...c })), total: contatos.length, pagina: 1, paginas: 1 };
    case "nx_contato_ver": { const c = contatos.find(x => String(x.id) === String(p.p_id)) || contatos[0]; return { contato: { ...c }, negocios: negocios.filter(n => n.contato_id === c.id), conversas: conversas.filter(v => v.contato_id === c.id).map(v => dataConv(v)), tarefas: [], notas: [] }; }
    case "nx_cv_base": return baseConversas;
    case "nx_canais_listar": return canais;
    case "nx_cv_listar": {
      const f = p.p_filtro || {}, aba = f.aba || "abertas", q = String(f.busca || "").trim();
      const visiveis = conversas.filter(c => !c.oculta);
      const porAba = c => {
        if (aba === "ocultas") return !!c.oculta;
        if (q.length >= 2) return true; // busca real percorre todas as abas, exceto Ocultas
        switch (aba) {
          case "minhas": return ["aberta", "pendente"].includes(c.status) && c.atribuida_a === ID.eu;
          case "sem_dono": return ["aberta", "pendente"].includes(c.status) && !c.atribuida_a;
          case "aguardando": return c.status === "aberta" && !!c.aguardando;
          case "abertas": return c.status === "aberta";
          case "pendentes": return c.status === "pendente";
          case "resolvidas": return c.status === "resolvida";
          default: return false;
        }
      };
      const correspondeBusca = c => {
        if (q.length < 2 || aba === "ocultas") return true;
        const ct = contatos.find(x => x.id === c.contato_id);
        const normalizar = s => String(s || "").normalize("NFD").replace(/[\u0300-\u036f]/g, "").toLocaleLowerCase("pt-BR");
        const qn = normalizar(q), dig = q.replace(/\D/g, "");
        return normalizar(ct?.nome).includes(qn) || normalizar(c.protocolo).includes(qn)
          || (dig.length >= 4 && String(ct?.telefone || "").replace(/\D/g, "").includes(dig));
      };
      const filtradas = visiveis.filter(c => porAba(c)
        && (!f.departamento_id || f.departamento_id === ID.dep)
        && (!f.canal_id || c.canal_id === f.canal_id)
        && (!f.atendente || (f.atendente === "eu" ? c.atribuida_a === ID.eu : f.atendente === "sem" ? !c.atribuida_a : c.atribuida_a === f.atendente))
        && (!Array.isArray(f.etiquetas) || !f.etiquetas.length || f.etiquetas.some(id => (contatos.find(x => x.id === c.contato_id)?.etiquetas || []).includes(id)))
        && (!f.nao_lidas || c.nao_lidas > 0)
        && correspondeBusca(c));
      const ordenar = (a, b) => aba === "aguardando" && q.length < 2
        ? b.minutos - a.minutos
        : a.minutos - b.minutos;
      filtradas.sort(ordenar);
      const limite = Math.min(100, Math.max(1, Number(p.p_limite) || 50));
      const itens = filtradas.slice(0, limite).map(dataConv);
      const contagens = {
        minhas: visiveis.filter(c => ["aberta", "pendente"].includes(c.status) && c.atribuida_a === ID.eu).length,
        sem_dono: visiveis.filter(c => ["aberta", "pendente"].includes(c.status) && !c.atribuida_a).length,
        aguardando: visiveis.filter(c => c.status === "aberta" && c.aguardando).length,
        abertas: visiveis.filter(c => c.status === "aberta").length,
        pendentes: visiveis.filter(c => c.status === "pendente").length,
        nao_lidas: visiveis.filter(c => c.nao_lidas > 0).length,
      };
      return { itens, tem_mais: filtradas.length > limite, aba, busca: q.length >= 2, contagens };
    }
    case "nx_cv_ver": { const c = conversas.find(x => String(x.id) === String(p.p_id)) || conversas[0], ct = contatos.find(x => x.id === c.contato_id);
      return { conversa: dataConv(c), contato: { ...ct }, anuncio: ct.plataforma ? { plataforma: ct.plataforma, campanha_nome: ct.campanha_nome, anuncio_nome: "Vídeo de apresentação" } : null,
        negocios: negocios.filter(n => n.contato_id === ct.id), atendimentos: [{ id: c.id, protocolo: c.protocolo, status: c.status, aberta_em: isoAgora(), canal_id: c.canal_id, atribuida_nome: c.atribuida_nome }], tarefas: [] }; }
    case "nx_cv_mensagens": { const c = conversas.find(x => String(x.id) === String(p.p_conversa)) || conversas[0], when = i => new Date(Date.now() - i * 60000).toISOString();
      const itens = c.mensagens.map((m, i) => ({ id: c.id * 10 + i, conversa_id: c.id, direcao: m.direcao, tipo: "texto", wamid: `wamid.demo.${c.id}.${i}`, corpo: m.corpo,
        status: m.direcao === "in" ? "recebida" : "entregue", criado_em: when(m.minutos), atualizado_em: when(m.minutos), origem: m.direcao === "out" ? "painel" : null,
        enviado_por: m.direcao === "out" ? { id: ID.eu, nome: "Dra. Helena" } : null, referral: null }));
      return { itens, tem_mais: false, conversas: [{ id: c.id, protocolo: c.protocolo, aberta_em: when(c.minutos + 40), status: c.status, canal_id: c.canal_id }], agora: isoAgora(), ultimo_id: itens.at(-1)?.id || null }; }
    case "nx_cv_ia_estado": {
      const pausada = String(p.p_conversa) === "903";
      return { disponivel: true, modo: pausada ? "pausada" : "ativa", pausada, ligada: true, ia_ligada: true,
        respondendo: !pausada, pausada_por: pausada ? "atendente" : null, pausada_por_nome: pausada ? "Ana Paula" : null,
        pausada_ate: pausada ? hora(hoje, "23", "59") : null, so_manual: false, cota: { usadas: 42, limite: 300 } };
    }
    case "nx_rel_vendas": return relVendas();
    case "nx_rel_atendimento": return relAtendimento();
    case "nx_dados": return demoAds;
    case "nx_automacoes_listar": return { vertical: "odonto", pode_editar: true, limite: { usadas: 2, limite: 8 },
      itens: [{ id: "auto-lembrete", nome: "Lembrete de consulta", gatilho: "antes_da_data", ativo: false, execucoes: 11, erros: 0, ultima_execucao_em: null, condicoes: [], acoes: [], config: {} }],
      base: { ...baseConversas, funis, canais, departamentos, templates } , sistema: [{ nome: "Nova conversa → oportunidade", descricao: "Cada novo atendimento entra no funil automaticamente." }, { nome: "Atribuição de campanha", descricao: "Origem e anúncio acompanham o contato." }] };
    case "nx_agenda_dia": { const de = p.p_data || hoje, ate = somaDia(de, Number(p.p_dias || 1)); return { data: de, dias: Number(p.p_dias || 1), fuso: "America/Sao_Paulo", config: { horario_fonte: "agenda", duracao_min: 30, capacidade: 1 },
      consultas: agendamentos.filter(a => a.inicio.slice(0,10) >= de && a.inicio.slice(0,10) < ate), bloqueios: bloqueios.filter(b => b.inicio.slice(0,10) < ate && b.fim.slice(0,10) >= de) }; }
    case "nx_agenda_config_ver": return { config: { horario_fonte: "agenda", horario: horarioDefault, intervalos: [["12:00", "13:00"]], duracao_min: 30, capacidade: 1, antecedencia_horas: 2, dias_a_frente: 30, passo_min: 30,
      duracoes: { "Avaliação": 30, "Implante": 60, "Limpeza": 45 } }, bloqueios };
    case "nx_agenda_livres": return agendaLivres(p);
    case "nx_agenda_marcar": return agendaMarcar(p);
    case "nx_agenda_desmarcar": return agendaDesmarcar(p);
    case "nx_entrada_chave": return { chave: "FALSO-CHAVE-LOCAL" };
    case "nx_integracoes_status": return { integracoes: demoAds.integracoes, preenchidos: ["meta", "google"] };
    case "nx_automacao_execucoes": return { itens: [], total: 0 };
    case "nx_tarefas_listar": return { itens: [{ id: 71, tipo: "ligacao", titulo: "Confirmar avaliação", vence_em: isoAgora(), concluida: false, contato_id: 501, negocio_id: 801, dono: { id: ID.eu, nome: "Dra. Helena" } }], hoje: 1, atrasadas: 0 };
    case "nx_planos_listar": return [{ id: "essencial", nome: "Essencial", ativo: true, modulos: ["crm", "conversas"] }, { id: "profissional", nome: "Profissional", ativo: true, modulos: ["crm", "conversas", "relatorios", "ads", "automacoes"] }];
    case "nx_orgs_listar": return [{ id: ID.org, nome: "Nexus", slug: "nexus", ativa: true }];
    case "nx_clientes_admin": return [sessao().clientes[0]];
    case "nx_usuarios_listar": return { itens: usuarios, total: usuarios.length };
    case "nx_config": return { codigo_gestor: null };
    case "nx_uso_plano": return { clientes: 1, usuarios: 2, canais: 2, automacoes: 2 };
    case "nx_relatorios": return { itens: [] };
    case "nx_dominio_status": case "nx_automacao_ativar": case "nx_notificacoes_marcar": return { ok: true };
    case "nx_perfil_salvar": case "nx_tema_salvar": case "nx_cliente_salvar": case "nx_agenda_config_salvar": return { ...p.p_cfg, config: p.p_cfg || {}, ok: true };
    default: return {};
  }
}

function fn(nome, p = {}) {
  if (nome === "nx-codewords") return { ok: true, inscrito_certo: true, conectado: true, numero_confere: true, rota: "fluxo", service_id: "cw-demo-fluxo", motivo: "Ambiente fictício local — nenhuma chamada saiu do computador." };
  if (nome === "nx-enviar") return { ok: true, app_inscrito: true, total: 1, numero: "+55 00 00000-0001" };
  if (nome === "nx-midia") return { ok: true, url: null };
  if (nome === "nx-ia") return { ok: true, sugestao: "Resposta fictícia de demonstração. Revise antes de enviar." };
  return { ok: true, simulado: true };
}

const servidor = http.createServer(async (req, res) => {
  const url = new URL(req.url || "/", `http://${HOST}:${PORT}`);
  const json = (status, body) => { res.writeHead(status, { "content-type": "application/json; charset=utf-8", "cache-control": "no-store", "x-content-type-options": "nosniff" }); res.end(JSON.stringify(body)); };
  if (req.method === "OPTIONS") { res.writeHead(204, { "cache-control": "no-store" }); return res.end(); }
  if (url.pathname.startsWith("/__dev_falso/rest/v1/rpc/")) {
    const name = url.pathname.split("/").at(-1);
    let raw = ""; for await (const chunk of req) raw += chunk;
    let body = {}; try { body = raw ? JSON.parse(raw) : {}; } catch { return json(400, { message: "dados_invalidos" }); }
    return json(200, rpc(name, body));
  }
  if (url.pathname.startsWith("/__dev_falso/functions/v1/")) {
    const name = url.pathname.split("/").at(-1);
    let raw = ""; for await (const chunk of req) raw += chunk;
    let body = {}; try { body = raw ? JSON.parse(raw) : {}; } catch { return json(400, { ok: false, erro: "dados_invalidos" }); }
    return json(200, fn(name, body));
  }
  if (url.pathname === "/" || url.pathname === "/index.html") { res.writeHead(302, { location: "/app/?dev-falso=1&dev=1#/inicio", "cache-control": "no-store" }); return res.end(); }
  let decoded; try { decoded = decodeURIComponent(url.pathname); } catch { return json(400, { erro: "caminho_invalido" }); }
  const caminho = decoded.endsWith("/") ? `${decoded}index.html` : decoded;
  const alvo = resolve(ROOT, `.${caminho}`);
  if (alvo !== ROOT && !alvo.startsWith(ROOT + sep)) return json(403, { erro: "caminho_invalido" });
  try {
    let arquivo = await readFile(alvo);
    if (decoded === "/app/prontos.js" && /dev-falso=1/.test(req.headers.referer || "")) {
      arquivo = Buffer.from('export const MODULOS_PRONTOS = ["inicio","conversas","crm","empresas","tarefas","ads","automacoes","relatorios","admin"];\nexport const CONFIG_PRONTAS = ["perfil","usuarios","marca","dominio","plano","numeros","respostas","atendimento","ia","departamentos","funis","campos","etiquetas","motivos","anuncios","formulario","agenda","rastreio"];\n');
    }
    if (caminho === "/app/index.html" && url.searchParams.get("dev-falso") === "1") {
      const boot = `<script>(function(){if(location.hostname!=="127.0.0.1"&&location.hostname!=="localhost")return;var q=new URLSearchParams(location.search);try{if(q.has("login")){localStorage.removeItem("nx-token");location.hash="#/login";}else{localStorage.setItem("nx-token","demo-local-session");}sessionStorage.setItem("nx-app-dev","1");}catch(e){}var original=window.fetch.bind(window);window.fetch=function(input,init){var u;try{u=new URL(typeof input==="string"?input:input.url,location.href);}catch(e){return original(input,init);}if(u.hostname==="dtjznipitihnwmcgpzqh.supabase.co"){u=new URL("/__dev_falso"+u.pathname+u.search,location.origin);return original(u,init);}return original(input,init);};})();</script>`;
      arquivo = Buffer.from(arquivo.toString("utf8").replace("<body>", `<body>\n${boot}`));
    }
    res.writeHead(200, { "content-type": MIME[extname(alvo).toLowerCase()] || "application/octet-stream", "cache-control": "no-store", "x-content-type-options": "nosniff", "referrer-policy": "same-origin" });
    res.end(arquivo);
  } catch { res.writeHead(404, { "content-type": "text/plain; charset=utf-8", "cache-control": "no-store" }); res.end("Não encontrado"); }
});

servidor.listen(PORT, HOST, () => console.log(`Órbita fictício local: http://${HOST}:${PORT}/app/?dev-falso=1&dev=1#/inicio`));
