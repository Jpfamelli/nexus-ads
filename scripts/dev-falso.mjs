#!/usr/bin/env node
// Órbita local: servidor restrito a loopback, com respostas fictícias em memória.
// Não lê credenciais, não chama serviços externos e nunca altera prontos.js.
import http from "node:http";
import { readFile } from "node:fs/promises";
import { readFileSync } from "node:fs";
import { gzipSync } from "node:zlib";
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
/* ---------- estado mutável do ambiente fictício (reinicia junto com o servidor) ----------
   Serve às quatro frentes do plano de 01/10: contadores por RPC (conferir quantas chamadas uma tela fez),
   falhas programadas (503, atraso), sessão invalidada, mensagem de entrada simulada, idempotência por p_req /
   client_ref e o estado do onboarding. Nada daqui sai do computador. */
const dev = {
  chamadas: {}, enviosExternos: 0, falhas: [], verificarToken: false,
  tokens: new Set(["demo-local-session", "demo-local-token"]), seqToken: 0,
  reqs: new Map(), refs: new Map(), pulsoV: 1, seqMsg: 100000, seqNegocio: 900, seqContato: 600, seqTarefa: 100,
  empresas: 1, teste: null,    // simular/clientes?n=2 e simular/teste?dias=2|nenhum&status=ativo
};
const bater = () => { dev.pulsoV += 1; };
// mensagens ganham id estável (a mesma regra de antes: conversa × 10 + posição); as novas continuam a contar de 100000
const conversas = [
  { id: 901, contato_id: 501, canal_id: ID.canal, status: "aberta", aguardando: true, atribuida_a: ID.eu, atribuida_nome: "Dra. Helena", nao_lidas: 2, protocolo: "ORB-2026-00901", minutos: 3,
    mensagens: [{ direcao: "in", corpo: "Oi! Vi o anúncio do aparelho invisível. Como funciona a avaliação?", minutos: 7 }, { direcao: "out", corpo: "Olá, Mariana! Vamos explicar tudo com calma na avaliação.", minutos: 5 }, { direcao: "in", corpo: "Tem algum horário esta semana?", minutos: 3 }] },
  { id: 902, contato_id: 502, canal_id: ID.meta, status: "aberta", aguardando: true, atribuida_a: null, atribuida_nome: null, nao_lidas: 1, protocolo: "ORB-2026-00902", minutos: 15,
    mensagens: [{ direcao: "in", corpo: "Perdi um dente e gostaria de saber sobre implante.", minutos: 15 }] },
  { id: 903, contato_id: 503, canal_id: ID.canal, status: "pendente", aguardando: false, atribuida_a: ID.ana, atribuida_nome: "Ana Paula", nao_lidas: 0, protocolo: "ORB-2026-00903", minutos: 55,
    mensagens: [{ direcao: "in", corpo: "Queria saber o valor do clareamento.", minutos: 65 }, { direcao: "out", corpo: "A dentista consegue indicar a melhor opção após avaliar seu sorriso.", minutos: 55 }] },
];
for (const c of conversas) c.mensagens.forEach((m, i) => { m.id = c.id * 10 + i; m.criada = Date.now() - m.minutos * 60000; });
const tarefas = [{ id: 71, tipo: "ligacao", titulo: "Confirmar avaliação", vence_em: isoAgora(), concluida: false, contato_id: 501, negocio_id: 801, dono: { id: ID.eu, nome: "Dra. Helena" } }];

/* onboarding (nx_onboarding_estado, plano M32): 11 itens na ordem recomendada. O formato é o combinado com a frente D;
   se o contrato real da migração 20261002d for outro, quem muda é este bloco (e só ele). */
const ONB_ITENS = [
  { id: "chave_codewords", rotulo: "Chave do CodeWords salva", rota: "#/config/numeros" },
  { id: "aparelho_pareado", rotulo: "Aparelho pareado", rota: "#/config/numeros" },
  { id: "recebimento", rotulo: "Recebimento conferido", rota: "#/config/numeros" },
  { id: "ia_ou_direto", rotulo: "IA validada ou receber direto", rota: "#/config/numeros" },
  { id: "mensagem_teste", rotulo: "Mensagem de teste enviada", rota: "#/config/numeros" },
  { id: "departamento_horario", rotulo: "Departamento com horário", rota: "#/config/departamentos" },
  { id: "agenda_faixas", rotulo: "Faixas da agenda", rota: "#/config/agenda" },
  { id: "script_site", rotulo: "Script do site com contato recebido", rota: "#/config/rastreio" },
  { id: "colega_convidado", rotulo: "Colega convidado", rota: "#/config/usuarios" },
  { id: "funil_ajustado", rotulo: "Funil ajustado", rota: "#/config/funis" },
  { id: "anuncios_ligados", rotulo: "Anúncios ligados", rota: "#/config/anuncios", opcional: true },
];
const ONB_PRONTO = ["chave_codewords", "aparelho_pareado", "recebimento", "ia_ou_direto", "departamento_horario", "agenda_faixas", "colega_convidado", "funil_ajustado"];
const onb = { feitos: new Set(ONB_PRONTO), dispensado_ate: null };
function onboardingDefinir(modo) {
  onb.feitos = new Set(modo === "novo" ? [] : modo === "completo" ? ONB_ITENS.map(i => i.id) : ONB_PRONTO);
  onb.dispensado_ate = null;
  bater();
}
function onboardingEstado() {
  const itens = ONB_ITENS.map(i => ({ ...i, feito: onb.feitos.has(i.id), opcional: !!i.opcional }));
  const obrig = itens.filter(i => !i.opcional);
  const feitos = obrig.filter(i => i.feito).length;
  return { total: obrig.length, feitos, pct: Math.round(feitos * 100 / obrig.length), itens, dispensado_ate: onb.dispensado_ate, completo: feitos === obrig.length };
}
const marcarOnb = (...ids) => { for (const id of ids) onb.feitos.add(id); };

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

function sessao(token = "") {
  const outra = String(token).includes("outra");
  return { conta: { id: outra ? ID.ana : ID.eu, nome: outra ? "Ana Paula" : "Dra. Helena", email: "demo@example.test", papel: "gestor", super: true, telefone: null },
    org: { id: ID.org, nome: "Nexus", slug: "nexus", marca: { produto: (dev.marca && dev.marca.produto) || "Órbita", cores: { primaria: "#B0761F", secundaria: "#6FA3CF", fundo: "#07090C" } }, img_hash: dev.marca ? `dev-${Object.keys(dev.marca).join("")}` : "dev-falso" },
    super: true, link_base_padrao: null, modulos_plano: {}, clientes: [{ id: ID.cliente, slug: "sorriso-vivo", nome: "Clínica Sorriso Vivo", plano: "completo", status: dev.teste ? dev.teste.status : "teste", vertical: dev.vertical || "odonto", papel: "admin", proprio: true,
      modulos: ["crm", "conversas", "relatorios", "ads", "automacoes"], teste_ate: dev.teste ? (dev.teste.dias === null ? null : somaDia(hoje, dev.teste.dias)) : somaDia(hoje, 14), tem_tema: false, cfg: {} },
      ...(dev.empresas > 1 ? [{ id: "00000000-0000-4000-8000-0000000000c2", slug: "oficina-central", nome: "Oficina Central", plano: "completo", status: "ativo", vertical: "oficina", papel: "admin", proprio: false,
        modulos: ["crm", "conversas", "relatorios", "ads", "automacoes"], teste_ate: null, tem_tema: false, cfg: {} }] : [])] };
}
const marcaPublica = { org: { id: ID.org, nome: "Nexus", slug: "nexus" }, marca: { produto: "Órbita", cores: { primaria: "#B0761F", secundaria: "#6FA3CF", fundo: "#07090C" }, login_titulo: "Seu atendimento em movimento", login_texto: "Entre para acompanhar conversas, pacientes e campanhas.", suporte_wa: "5500000000000" } };
/** Marca da org, com as sobreposições de simular/marca (nome do produto e logo): o manifesto instalável nasce delas. */
function marcaAtual() {
  if (!dev.marca) return marcaPublica;
  return { ...marcaPublica, marca: { ...marcaPublica.marca, ...dev.marca } };
}
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
    criado_em: new Date(Date.now() - 86400000 * 4).toISOString(), atualizado_em: isoAgora(), tarefas: tarefas.filter(x => x.negocio_id === n.id).map(x => ({ ...x })), notas: notas.filter(x => x.negocio_id === n.id).map(x => ({ ...x })), historico: [],
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

// o editor das automações só aceita ids em formato uuid; os ids curtos desta demo viram uuids estáveis
const IDS_CURTOS = new Set(["s1", "s2", "s3", "s4", "s5", "s6", "s7", "p1", "p2", "e1", "e2", "e3", "d1", "cw1", "wa1", "t1", "f1", "f2"]);
const uuidDe = id => "00000000-0000-4000-8000-" + Buffer.from(String(id)).toString("hex").padStart(12, "0").slice(-12);
const uuidizar = obj => JSON.parse(JSON.stringify(obj), (k, v) => (typeof v === "string" && IDS_CURTOS.has(v) ? uuidDe(v) : v));

/** Erro que o servidor fictício devolve como o PostgREST faria ({code, message, hint}). */
class ErroDev extends Error { constructor(codigo, hint = null, status = 400) { super(codigo); this.codigo = codigo; this.hint = hint; this.status = status; } }
/** p_req (M25): a mesma intenção repetida devolve o MESMO resultado e não cria outra linha (24 h no servidor real). */
function comReq(nome, p, criar) {
  if (!p || !p.p_req) return criar();
  const chave = `${nome}:${p.p_req}`;
  if (dev.reqs.has(chave)) return dev.reqs.get(chave);
  const r = criar();
  dev.reqs.set(chave, r);
  return r;
}
const notas = [];
const soDigitos = s => String(s ?? "").replace(/\D/g, "");
function cardNegocio(n) { return crmNegocio(n.id).negocio; }
function negocioSalvar(d) {
  if (d.id) {
    const n = negocios.find(x => String(x.id) === String(d.id));
    if (!n) throw new ErroDev("negocio_nao_encontrado");
    for (const k of ["titulo", "servico", "valor_previsto", "dono_id", "origem"]) if (k in d) n[k] = d[k];
    bater();
    return cardNegocio(n);
  }
  let contato = d.contato_id ? contatos.find(x => String(x.id) === String(d.contato_id)) : null;
  if (!contato && d.contato) contato = contatoSalvar({ ...d.contato, origem: d.origem || "manual" }, { reaproveitar: true });
  if (!contato) throw new ErroDev("dados_invalidos");
  const n = { id: ++dev.seqNegocio, contato_id: contato.id, titulo: d.titulo || "Nova oportunidade", servico: d.servico || "Avaliação", estagio_id: "s1",
    valor_previsto: Number(d.valor_previsto) || 0, dono_id: ID.eu, origem: d.origem || "manual" };
  negocios.push(n);
  bater();
  return cardNegocio(n);
}
function contatoSalvar(d, { reaproveitar = false } = {}) {
  if (d.id) {
    const c = contatos.find(x => String(x.id) === String(d.id));
    if (!c) throw new ErroDev("contato_nao_encontrado");
    for (const k of ["nome", "email", "cidade", "origem"]) if (k in d) c[k] = d[k];
    bater();
    return c;
  }
  const tel = soDigitos(d.telefone);
  const igual = tel && contatos.find(x => soDigitos(x.telefone) === tel || (tel.length >= 10 && soDigitos(x.telefone).endsWith(tel)));
  if (igual) { if (reaproveitar) return igual; throw new ErroDev("telefone_em_uso", String(igual.id)); }
  const c = { id: ++dev.seqContato, nome: d.nome || null, telefone: tel || null, email: d.email || null, origem: d.origem || "manual", plataforma: null, campanha_nome: null,
    cidade: d.cidade || null, uf: null, etiquetas: [] };
  contatos.push(c);
  bater();
  return c;
}
function tarefaSalvar(d) {
  if (d.id) {
    const x = tarefas.find(y => String(y.id) === String(d.id));
    if (!x) throw new ErroDev("tarefa_nao_encontrada");
    for (const k of ["titulo", "tipo", "vence_em", "descricao"]) if (k in d) x[k] = d[k];
    bater();
    return { ...x };
  }
  const x = { id: ++dev.seqTarefa, tipo: d.tipo || "ligacao", titulo: d.titulo || "Tarefa", vence_em: d.vence_em || isoAgora(), concluida: false,
    contato_id: d.contato_id || null, negocio_id: d.negocio_id || null, dono: { id: ID.eu, nome: "Dra. Helena" } };
  tarefas.push(x);
  bater();
  return { ...x };
}
const conversaPorId = id => conversas.find(x => String(x.id) === String(id));
const usuarioPorId = id => usuarios.find(x => x.id === id);
function mensagemDe(c, m) {
  const em = new Date(m.criada).toISOString();
  return { id: m.id, conversa_id: c.id, direcao: m.direcao, tipo: m.nota ? "nota" : "texto", corpo: m.corpo, status: m.direcao === "in" ? "recebida" : "enviada", criado_em: em, atualizado_em: em,
    origem: m.direcao === "out" ? "painel" : null, enviado_por: m.direcao === "out" ? { id: ID.eu, nome: "Dra. Helena" } : null, referral: null, ...(m.client_ref ? { client_ref: m.client_ref } : {}) };
}
/** Mensagem de ENTRADA fictícia (o cliente escreve): o pulso muda, a conversa sobe na lista e ganha uma não lida. */
function simularEntrada(conversaId, texto) {
  const c = conversaPorId(conversaId || 901);
  if (!c) return null;
  const m = { id: ++dev.seqMsg, direcao: "in", corpo: String(texto || "Oi, tudo bem? Queria confirmar o horário."), minutos: 0, criada: Date.now() };
  c.mensagens.push(m);
  c.minutos = 0; c.nao_lidas += 1; c.aguardando = true; if (c.status === "resolvida") c.status = "aberta";
  bater();
  return mensagemDe(c, m);
}
/** nx-enviar (texto) com client_ref (M36): o MESMO client_ref devolve a mensagem já gravada e NÃO conta nova saída externa. */
function enviarTexto(p) {
  const c = conversaPorId(p.conversa);
  if (!c) return { ok: false, erro: "conversa_nao_encontrada" };
  const ref = p.client_ref ? `${c.id}:${p.client_ref}` : null;
  if (ref && dev.refs.has(ref)) return { ok: true, mensagem: dev.refs.get(ref), repetida: true };
  dev.enviosExternos += 1;
  const m = { id: ++dev.seqMsg, direcao: "out", corpo: String(p.texto || ""), minutos: 0, criada: Date.now(), ...(p.client_ref ? { client_ref: String(p.client_ref) } : {}) };
  c.mensagens.push(m);
  c.minutos = 0; c.aguardando = false;
  bater();
  const msg = mensagemDe(c, m);
  if (ref) dev.refs.set(ref, msg);
  return { ok: true, mensagem: msg };
}

function rpc(nome, p = {}) {
  switch (nome) {
    case "nx_marca_publica": return marcaAtual();
    case "nx_entrar": { const token = `demo-local-${dev.proximaContaOutra ? "outra" : "token"}-${++dev.seqToken}`; dev.tokens.add(token); return { token }; }
    case "nx_sair": dev.tokens.clear(); return { ok: true };
    case "nx_app_sessao": return sessao(p.p_token);
    case "nx_cliente_tema": return { tema: {}, marca_cliente: {}, atualizado: "dev-falso" };
    case "nx_pulso": {
      const vis = conversas.filter(c => !c.oculta);
      const entradas = vis.flatMap(c => c.mensagens.filter(m => m.direcao === "in").map(m => m.id));
      return { v: dev.pulsoV, notif: 2, agora: isoAgora(), nao_lidas: vis.filter(c => c.nao_lidas > 0).length, ultima_entrada_id: entradas.length ? Math.max(...entradas) : null };
    }
    case "nx_onboarding_estado": return onboardingEstado();
    case "nx_onboarding_dispensar": { onb.dispensado_ate = somaDia(hoje, Number(p.p_dias) || 7); return onboardingEstado(); }
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
    case "nx_buscar": {
      const norm = s => String(s || "").normalize("NFD").replace(/[\u0300-\u036f]/g, "").toLowerCase();
      const q = norm(String(p.p_q || "").trim());
      if (q.length < 2) return { contatos: [], negocios: [], conversas: [] };
      const ct = id => contatos.find(c => c.id === id) || {};
      return {
        contatos: contatos.filter(c => norm(c.nome).includes(q) || soDigitos(c.telefone).includes(soDigitos(q) || "x")).slice(0, 8).map(c => ({ id: c.id, nome: c.nome, telefone: c.telefone })),
        negocios: negocios.filter(n => norm(n.titulo).includes(q) || norm(ct(n.contato_id).nome).includes(q)).slice(0, 8)
          .map(n => ({ id: n.id, titulo: n.titulo, contato_nome: ct(n.contato_id).nome || null, estagio_nome: (funis[0].estagios.find(e => e.id === n.estagio_id) || {}).nome || null, status: "aberto" })),
        conversas: conversas.filter(c => norm(c.protocolo).includes(q) || norm(ct(c.contato_id).nome).includes(q)).slice(0, 8)
          .map(c => ({ id: c.id, contato_nome: ct(c.contato_id).nome || null, protocolo: c.protocolo, status: c.status })),
      };
    }
    case "nx_contatos_listar": {
      const busca = String((p.p_filtro && p.p_filtro.busca) || "").trim();
      const dig = soDigitos(busca), norm = s => String(s || "").normalize("NFD").replace(/[\u0300-\u036f]/g, "").toLowerCase();
      const achados = contatos.filter(c => !busca || norm(c.nome).includes(norm(busca)) || (dig.length >= 4 && soDigitos(c.telefone).includes(dig)));
      const por = Math.max(1, Math.min(100, Number(p.p_por_pagina) || 50));
      return { itens: achados.slice(0, por).map(c => ({ ...c })), total: achados.length, pagina: 1, paginas: Math.max(1, Math.ceil(achados.length / por)) };
    }
    case "nx_contato_salvar": return comReq(nome, p, () => ({ ...contatoSalvar(p.p_contato || {}) }));
    case "nx_negocio_salvar": return comReq(nome, p, () => negocioSalvar(p.p_negocio || {}));
    case "nx_negocio_mover": {
      const n = negocios.find(x => String(x.id) === String(p.p_id));
      const e = nomesEtapas.find(x => x.id === p.p_estagio);
      if (!n) throw new ErroDev("negocio_nao_encontrado");
      if (!e) throw new ErroDev("estagio_invalido");
      n.estagio_id = e.id;
      if (e.tipo === "ganho") n.valor = Number((p.p_extra && p.p_extra.valor) ?? n.valor_previsto) || 0;
      bater();
      return { ...cardNegocio(n), estagio_id: e.id };
    }
    case "nx_negocio_excluir": { const i = negocios.findIndex(x => String(x.id) === String(p.p_id)); if (i >= 0) negocios.splice(i, 1); bater(); return { ok: true }; }
    case "nx_tarefa_salvar": return comReq(nome, p, () => tarefaSalvar(p.p_tarefa || {}));
    case "nx_tarefa_concluir": { const x = tarefas.find(y => String(y.id) === String(p.p_id)); if (!x) throw new ErroDev("tarefa_nao_encontrada"); x.concluida = p.p_concluida !== false; bater(); return { ...x }; }
    case "nx_tarefa_excluir": { const i = tarefas.findIndex(y => String(y.id) === String(p.p_id)); if (i >= 0) tarefas.splice(i, 1); bater(); return { ok: true }; }
    case "nx_nota_salvar": {
      const d = p.p_nota || {};
      if (d.id) { const x = notas.find(y => String(y.id) === String(d.id)); if (!x) throw new ErroDev("nota_nao_encontrada"); Object.assign(x, d); return { ...x }; }
      const x = { id: notas.length + 1, texto: d.texto || "", negocio_id: d.negocio_id || null, contato_id: d.contato_id || null, fixada: false, criado_em: isoAgora(), autor: { id: ID.eu, nome: "Dra. Helena" } };
      notas.push(x);
      return { ...x };
    }
    case "nx_nota_excluir": { const i = notas.findIndex(y => String(y.id) === String(p.p_id)); if (i >= 0) notas.splice(i, 1); return { ok: true }; }
    case "nx_cv_status": {
      const c = conversaPorId(p.p_conversa); if (!c) throw new ErroDev("conversa_nao_encontrada");
      c.status = ["aberta", "pendente", "resolvida"].includes(p.p_status) ? p.p_status : c.status;
      if (c.status === "resolvida") c.aguardando = false;
      bater();
      return dataConv(c);
    }
    case "nx_cv_atribuir": {
      const c = conversaPorId(p.p_conversa); if (!c) throw new ErroDev("conversa_nao_encontrada");
      const u = usuarioPorId(p.p_conta);
      c.atribuida_a = u ? u.id : null; c.atribuida_nome = u ? u.nome : null;
      bater();
      return dataConv(c);
    }
    case "nx_cv_nota": {
      const c = conversaPorId(p.p_conversa); if (!c) throw new ErroDev("conversa_nao_encontrada");
      const m = { id: ++dev.seqMsg, direcao: "out", nota: true, corpo: String(p.p_texto || ""), minutos: 0, criada: Date.now() };
      c.mensagens.push(m); bater();
      return mensagemDe(c, m);
    }
    case "nx_cv_marcar_lida": { const c = conversaPorId(p.p_conversa); if (c) { c.nao_lidas = 0; bater(); } return { ok: true }; }
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
      const itens = c.mensagens.map((m, i) => { const em = m.criada ? new Date(m.criada).toISOString() : when(m.minutos);
        return { id: m.id, conversa_id: c.id, direcao: m.direcao, tipo: m.nota ? "nota" : "texto", wamid: `wamid.demo.${c.id}.${i}`, corpo: m.corpo,
          status: m.direcao === "in" ? "recebida" : "entregue", criado_em: em, atualizado_em: em, origem: m.direcao === "out" ? "painel" : null,
          enviado_por: m.direcao === "out" ? { id: ID.eu, nome: "Dra. Helena" } : null, referral: null, ...(m.client_ref ? { client_ref: m.client_ref } : {}) }; });
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
    case "nx_automacoes_listar": return uuidizar({ vertical: "odonto", pode_editar: true, limite: { usadas: 4, limite: 8 },
      itens: [
        { id: "auto-lembrete", nome: "Lembrete 24 h antes da consulta", gatilho: "antes_da_data", ativo: false, execucoes: 11, erros: 0, ultima_execucao_em: null, condicoes: [],
          acoes: [{ tipo: "enviar_mensagem", texto: "Olá, {primeiro_nome}! Lembrando da sua consulta amanhã, {data_consulta}, às {hora_consulta}." }], config: { campo: "consulta", horas: 24 } },
        { id: "auto-followup", nome: "Acompanhar orçamento sem resposta", gatilho: "negocio_estagio", ativo: true, execucoes: 7, erros: 1, em_espera: 3, ultima_execucao_em: isoAgora(), respeitar_horario: true,
          config: { estagio_id: "s3" }, condicoes: [],
          acoes: [{ tipo: "esperar", minutos: 1440, cancelar_se_cliente_responder: true }, { tipo: "enviar_mensagem", texto: "Oi, {primeiro_nome}! Ficou alguma dúvida sobre o orçamento?" },
            { tipo: "esperar", minutos: 2880, cancelar_se_cliente_responder: true }, { tipo: "criar_tarefa", titulo: "Ligar para {primeiro_nome}", tipo_tarefa: "ligacao", vence_em_horas: 0, dono: "responsavel" }] },
        { id: "auto-ia", nome: "IA classifica a etapa", gatilho: "mensagem_recebida", ativo: true, execucoes: 23, erros: 0, ultima_execucao_em: isoAgora(), config: {},
          condicoes: [{ campo: "estagio_id", op: "igual", valor: "s1" }], acoes: [{ tipo: "ia_decidir", tarefa: "classificar_etapa" }] },
        // criada antes do «dono»: grava «modo» (só a conversa muda; o servidor usa a regra de distribuição do departamento)
        { id: "auto-atribuir-antigo", nome: "Conversa nova → rodízio (antiga)", gatilho: "conversa_nova", ativo: true, execucoes: 5, erros: 0, ultima_execucao_em: null,
          config: {}, condicoes: [], acoes: [{ tipo: "atribuir", modo: "rodizio" }] },
        { id: "auto-agendado", nome: "Bom dia: orçamentos parados", gatilho: "agendado", ativo: false, execucoes: 0, erros: 0, ultima_execucao_em: null,
          config: { horario: "09:00", dias_semana: [1, 2, 3, 4, 5], estagio_id: "s3" }, condicoes: [],
          acoes: [{ tipo: "criar_tarefa", titulo: "Retomar {primeiro_nome}", tipo_tarefa: "whatsapp", vence_em_horas: 4, dono: "responsavel" }] },
      ],
      base: { ...baseConversas, funis, canais, departamentos, templates, campos: baseCrm.campos.map(c => ({ chave: c.chave, rotulo: c.rotulo, tipo: c.tipo })),
        campos_negocio: [{ chave: "origem_detalhe", rotulo: "Detalhe da origem", tipo: "texto" }] },
      ia: { disponivel: true, usadas: 42, limite: 300 }, sistema: [{ nome: "Nova conversa → oportunidade", descricao: "Cada novo atendimento entra no funil automaticamente." }, { nome: "Atribuição de campanha", descricao: "Origem e anúncio acompanham o contato." }] });
    case "nx_agenda_dia": { const de = p.p_data || hoje, ate = somaDia(de, Number(p.p_dias || 1)); return { data: de, dias: Number(p.p_dias || 1), fuso: "America/Sao_Paulo", config: { horario_fonte: "agenda", duracao_min: 30, capacidade: 1 },
      consultas: agendamentos.filter(a => a.inicio.slice(0,10) >= de && a.inicio.slice(0,10) < ate), bloqueios: bloqueios.filter(b => b.inicio.slice(0,10) < ate && b.fim.slice(0,10) >= de) }; }
    case "nx_agenda_config_ver": return { config: { horario_fonte: "agenda", horario: horarioDefault, intervalos: [["12:00", "13:00"]], duracao_min: 30, capacidade: 1, antecedencia_horas: 2, dias_a_frente: 30, passo_min: 30,
      duracoes: { "Avaliação": 30, "Implante": 60, "Limpeza": 45 } }, bloqueios };
    case "nx_agenda_livres": return agendaLivres(p);
    case "nx_agenda_marcar": return comReq(nome, p, () => agendaMarcar(p));
    case "nx_agenda_desmarcar": return agendaDesmarcar(p);
    case "nx_entrada_chave": return { chave: "FALSO-CHAVE-LOCAL" };
    case "nx_integracoes_status": return { integracoes: demoAds.integracoes, preenchidos: ["meta", "google"] };
    case "nx_automacao_execucoes": return [
      { criado_em: isoAgora(), ok: true, detalhe: "Mensagem na fila para Mariana Costa", chave: "ev:1", estado: "esperando", passo: 2, total_passos: 4, continua_em: new Date(Date.now() + 86400e3).toISOString(), link: "#/crm" },
      { criado_em: new Date(Date.now() - 3600e3).toISOString(), ok: false, detalhe: "codewords_sem_aparelho", chave: "ev:2", estado: "erro", passo: 1, total_passos: 4 },
      { criado_em: new Date(Date.now() - 7200e3).toISOString(), ok: true, detalhe: "Pulada: contato pediu para não receber", chave: "ev:3", estado: "concluida", passo: 4, total_passos: 4 },
      { criado_em: new Date(Date.now() - 20000e3 / 4).toISOString(), ok: true, detalhe: "O cliente respondeu: sequência cancelada", chave: "ev:5", estado: "cancelada", passo: 2, total_passos: 4 },
      { criado_em: new Date(Date.now() - 86400e3).toISOString(), ok: true, detalhe: "Tarefa criada para Dra. Helena", chave: "ev:4", estado: "concluida", passo: 4, total_passos: 4 }];
    case "nx_auto_simular": return { ok: true, automacao: p.p_automacao || {}, tamanho_amostra: 5, amostra: [
      { rotulo: "Mariana Costa", negocio_id: 801, contato_id: 501, link: "#/crm/negocio/801", casa_gatilho: true, passa_condicoes: true, erro: null, parou: false, passos: [
        { n: 0, tipo: "esperar", texto: "esperaria 1 dia (parando se o cliente responder)", pulado: false, depois_min: 0 },
        { n: 1, tipo: "enviar_mensagem", texto: "mensagem na fila para Mariana Costa: «Oi, Mariana! Ficou alguma dúvida…»", pulado: false, depois_min: 1440 }] },
      { rotulo: "Bianca Ferreira", negocio_id: 803, contato_id: 503, link: "#/crm/negocio/803", casa_gatilho: true, passa_condicoes: true, erro: null, parou: false, passos: [
        { n: 0, tipo: "enviar_mensagem", texto: "mensagem pulada: contato pediu para não receber", pulado: true, depois_min: 0 }] },
      { rotulo: "Lucas Oliveira", negocio_id: 804, contato_id: 504, link: "#/crm/negocio/804", casa_gatilho: true, passa_condicoes: false, erro: null, parou: false, passos: [] }],
      aviso: null };
    case "nx_automacao_salvar": return { ...p.p_auto, id: p.p_auto.id || "auto-novo", execucoes: 0, erros: 0, ultima_execucao_em: null };
    case "nx_tarefas_listar": return { itens: tarefas.map(x => ({ ...x })), hoje: tarefas.filter(x => !x.concluida).length, atrasadas: 0 };
    case "nx_planos_listar": return [{ id: "essencial", nome: "Essencial", ativo: true, modulos: ["crm", "conversas"] }, { id: "profissional", nome: "Profissional", ativo: true, modulos: ["crm", "conversas", "relatorios", "ads", "automacoes"] }];
    case "nx_orgs_listar": return [{ id: ID.org, nome: "Nexus", slug: "nexus", ativa: true }];
    case "nx_clientes_admin": return [sessao().clientes[0]];
    case "nx_usuarios_listar": return { itens: usuarios, total: usuarios.length };
    case "nx_config": return { codigo_gestor: null };
    case "nx_uso_plano": return { clientes: 1, usuarios: 2, canais: 2, automacoes: 2 };
    case "nx_relatorios": return { itens: [] };
    case "nx_dominio_status": case "nx_automacao_ativar": case "nx_notificacoes_marcar": return { ok: true };
    case "nx_codewords_canal_salvar": marcarOnb("chave_codewords"); return { ok: true, codewords: { tem_api_key: true } };
    case "nx_departamento_salvar": marcarOnb("departamento_horario"); return { ...(p.p_departamento || {}), ok: true };
    case "nx_convite_criar": marcarOnb("colega_convidado"); return { ok: true, link: "http://127.0.0.1/app/#/convite/" + "0".repeat(64) };
    case "nx_funil_salvar": marcarOnb("funil_ajustado"); return { ...(p.p_funil || {}), ok: true };
    case "nx_integracao_salvar": marcarOnb("anuncios_ligados"); return { ok: true };
    case "nx_perfil_salvar": case "nx_tema_salvar": case "nx_cliente_salvar": case "nx_agenda_config_salvar": if (nome === "nx_agenda_config_salvar") marcarOnb("agenda_faixas"); return { ...p.p_cfg, config: p.p_cfg || {}, ok: true };
    default: return {};
  }
}

function fn(nome, p = {}) {
  if (nome === "nx-codewords" && /teste/i.test(String(p.acao || ""))) marcarOnb("mensagem_teste");
  if (nome === "nx-codewords") return { ok: true, inscrito_certo: true, conectado: true, numero_confere: true, rota: "fluxo", service_id: "cw-demo-fluxo", motivo: "Ambiente fictício local — nenhuma chamada saiu do computador." };
  if (nome === "nx-enviar") return p.acao === "texto" ? enviarTexto(p) : { ok: true, app_inscrito: true, total: 1, numero: "+55 00 00000-0001" };
  if (nome === "nx-midia") return { ok: true, url: null };
  if (nome === "nx-ia" && p.acao === "automacao_montar") {
    if (/cota/i.test(String(p.descricao || ""))) return { ok: false, erro: "ia_cota" };
    if (/chave/i.test(String(p.descricao || ""))) return { ok: false, erro: "ia_indisponivel", detalhe: "sem_chave" };
    return uuidizar({ ok: true, explicacao: "Quando um orçamento ficar parado, espero 2 dias; se o cliente não responder, mando uma mensagem e aviso o responsável.",
      avisos: ["Confira o texto da mensagem antes de ligar.", "Escolhi a etapa «Avaliou / orçamento» porque você falou em orçamento."],
      automacao: { nome: "Orçamento sem resposta em 2 dias", gatilho: { tipo: "negocio_estagio", campos: { estagio_id: "s3" } }, condicoes: [],
        acoes: [{ tipo: "esperar", campos: { minutos: 2880, cancelar_se_cliente_responder: true } },
          { tipo: "enviar_mensagem", campos: { texto: "Oi, {primeiro_nome}! Ficou alguma dúvida sobre o orçamento?" } },
          { tipo: "notificar", campos: { para: "responsavel", titulo: "{nome} não respondeu o orçamento", texto: "Sem resposta há 2 dias." } }] } });
  }
  if (nome === "nx-ia") return { ok: true, sugestao: "Resposta fictícia de demonstração. Revise antes de enviar." };
  return { ok: true, simulado: true };
}

// Boot do modo fictício: ARQUIVO (não inline) — o index.html traz a mesma CSP do Netlify em <meta>
// (script-src 'self'), então um <script> inline injetado seria bloqueado.
const BOOT = `(function(){if(location.hostname!=="127.0.0.1"&&location.hostname!=="localhost")return;var q=new URLSearchParams(location.search);try{if(q.has("login")){localStorage.removeItem("nx-token");location.hash="#/login";}else if(!localStorage.getItem("nx-token")){localStorage.setItem("nx-token","demo-local-session");}sessionStorage.setItem("nx-app-dev","1");}catch(e){}var original=window.fetch.bind(window);window.fetch=function(input,init){var u;try{u=new URL(typeof input==="string"?input:input.url,location.href);}catch(e){return original(input,init);}if(u.hostname==="dtjznipitihnwmcgpzqh.supabase.co"){u=new URL("/__dev_falso"+u.pathname+u.search,location.origin);return original(u,init);}return original(input,init);};})();`;

const dormir = ms => new Promise(r => setTimeout(r, ms));
const ROTAS_SEM_SESSAO = new Set(["nx_marca_publica", "nx_entrar", "nx_convite_ver", "nx_convite_aceitar", "nx_senha_redefinir"]);
/** Falha programada para a próxima chamada de uma RPC/função (ou de qualquer uma, com rpc=*). */
function proximaFalha(nome) {
  const i = dev.falhas.findIndex(f => (f.rpc === "*" || f.rpc === nome) && f.restam > 0);
  if (i < 0) return null;
  const f = dev.falhas[i];
  f.restam -= 1;
  if (f.restam <= 0) dev.falhas.splice(i, 1);
  return f;
}
const CORPO_FALHA = { 429: { message: "muitos_pedidos" }, 500: { message: "erro_interno" } };
/** Resposta de uma RPC ou função: contadores, sessão, falha programada (antes ou DEPOIS de aplicar), erro do PostgREST. */
async function atender(tipo, nome, corpo, json, res) {
  dev.chamadas[nome] = (dev.chamadas[nome] || 0) + 1;
  const token = tipo === "rpc" ? corpo.p_token : corpo.token;
  if (dev.verificarToken && !ROTAS_SEM_SESSAO.has(nome) && token != null && !dev.tokens.has(token)) return json(401, { code: "28000", message: "sessao_invalida", hint: null, details: null });
  const f = proximaFalha(nome);
  if (f && f.atraso) await dormir(f.atraso);
  const executar = () => (tipo === "rpc" ? rpc(nome, corpo) : fn(nome, corpo));
  if (f && f.status) {
    if (f.depois) { try { executar(); } catch { /* o servidor aplicou ou falhou; a resposta já está decidida */ } }
    const cab = { "content-type": "application/json; charset=utf-8", "cache-control": "no-store" };
    if (f.retryAfter) cab["retry-after"] = String(f.retryAfter);
    res.writeHead(f.status, cab);
    const c = f.codigo ? { message: f.codigo } : CORPO_FALHA[f.status] || null;
    return res.end(c ? JSON.stringify(c) : "");
  }
  try { return json(200, executar()); }
  catch (e) {
    if (e instanceof ErroDev) return json(e.status, { code: "P0001", message: e.codigo, hint: e.hint, details: null });
    throw e;
  }
}
/** /__dev_falso/simular/<acao>?...  e  /__dev_falso/estado — só para testes locais (o servidor escuta apenas em loopback). */
function simular(acao, q) {
  const n = chave => Number(q.get(chave));
  switch (acao) {
    case "falha": {
      dev.falhas.push({ rpc: q.get("rpc") || "*", status: n("status") || 0, restam: n("vezes") || 1, atraso: n("atraso") || 0, depois: q.get("depois") === "1",
        codigo: q.get("codigo") || null, retryAfter: n("retryAfter") || 0 });
      return { ok: true, falhas: dev.falhas.length };
    }
    case "sessao-invalida": dev.tokens.clear(); dev.verificarToken = true; dev.proximaContaOutra = q.get("outra") === "1"; return { ok: true };
    case "sessao-valida": dev.verificarToken = false; return { ok: true };
    case "mensagem": return { ok: true, mensagem: simularEntrada(q.get("conversa") || 901, q.get("texto")) };
    case "onboarding": onboardingDefinir(q.get("modo") || "parcial"); return { ok: true, estado: onboardingEstado() };
    case "versao": dev.versao = q.get("v") || null; return { ok: true, versao: dev.versao };
    case "marca": {
      if (!q.get("produto") && q.get("logo") !== "1") { dev.marca = null; return { ok: true, marca: null }; }
      const logo = q.get("logo") === "1" ? `data:image/png;base64,${readFileSync(resolve(ROOT, "app/icones/icon-192.png")).toString("base64")}` : undefined;
      dev.marca = { ...(q.get("produto") ? { produto: q.get("produto") } : {}), ...(logo ? { logo, logo_claro: logo, favicon: logo } : {}) };
      return { ok: true, marca: Object.keys(dev.marca) };
    }
    case "clientes": dev.empresas = Math.max(1, Math.min(2, Number(q.get("n")) || 1)); return { ok: true, empresas: dev.empresas };
    case "teste": dev.teste = q.get("status") || q.get("dias") ? { status: q.get("status") || "teste", dias: q.get("dias") === "nenhum" ? null : Number(q.get("dias") ?? 14) } : null; return { ok: true, teste: dev.teste };
    case "vertical": dev.vertical = ["odonto", "oficina", "loja", "generico"].includes(q.get("v")) ? q.get("v") : null; return { ok: true, vertical: dev.vertical };
    case "zerar": dev.chamadas = {}; dev.falhas = []; dev.enviosExternos = 0; dev.reqs.clear(); dev.refs.clear(); return { ok: true };
    default: return { ok: false, erro: "acao_desconhecida" };
  }
}
const estadoDev = () => ({ chamadas: dev.chamadas, enviosExternos: dev.enviosExternos, pulsoV: dev.pulsoV, falhas: dev.falhas.length, tokensValidos: dev.tokens.size,
  verificarToken: dev.verificarToken, onboarding: onboardingEstado(), versao: dev.versao || null,
  mensagens: conversas.map(c => ({ id: c.id, status: c.status, nao_lidas: c.nao_lidas, total: c.mensagens.length })), tarefas: tarefas.length, negocios: negocios.length, contatos: contatos.length });

const servidor = http.createServer(async (req, res) => {
  const url = new URL(req.url || "/", `http://${HOST}:${PORT}`);
  const json = (status, body) => { res.writeHead(status, { "content-type": "application/json; charset=utf-8", "cache-control": "no-store", "x-content-type-options": "nosniff" }); res.end(JSON.stringify(body)); };
  if (url.pathname === "/__dev_falso/estado") return json(200, estadoDev());
  if (url.pathname.startsWith("/__dev_falso/simular/")) return json(200, simular(url.pathname.split("/").at(-1), url.searchParams));
  if (url.pathname === "/app/versao.json" && dev.versao) return json(200, { versao: dev.versao });
  if (req.method === "OPTIONS") { res.writeHead(204, { "cache-control": "no-store" }); return res.end(); }
  if (url.pathname === "/__dev_falso/boot.js") {
    res.writeHead(200, { "content-type": "text/javascript; charset=utf-8", "cache-control": "no-store", "x-content-type-options": "nosniff" });
    return res.end(BOOT);
  }
  if (url.pathname.startsWith("/__dev_falso/rest/v1/rpc/")) {
    const name = url.pathname.split("/").at(-1);
    let raw = ""; for await (const chunk of req) raw += chunk;
    let body = {}; try { body = raw ? JSON.parse(raw) : {}; } catch { return json(400, { message: "dados_invalidos" }); }
    return atender("rpc", name, body, json, res);
  }
  if (url.pathname.startsWith("/__dev_falso/functions/v1/")) {
    const name = url.pathname.split("/").at(-1);
    let raw = ""; for await (const chunk of req) raw += chunk;
    let body = {}; try { body = raw ? JSON.parse(raw) : {}; } catch { return json(400, { ok: false, erro: "dados_invalidos" }); }
    return atender("fn", name, body, json, res);
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
      const boot = `<script src="/__dev_falso/boot.js"></script>`;
      // no fim do <head> (depois do antes.js): o pedido sai junto com os outros em vez de esperar o <body> — como na produção, sem um salto a mais
      arquivo = Buffer.from(arquivo.toString("utf8").replace("</head>", `${boot}\n</head>`));
    }
    const tipo = MIME[extname(alvo).toLowerCase()] || "application/octet-stream";
    const cab = { "content-type": tipo, "cache-control": "no-store", "x-content-type-options": "nosniff", "referrer-policy": "same-origin" };
    // como o Netlify: texto vai comprimido (as medições de rede lenta ficam parecidas com a produção)
    if (/\bgzip\b/.test(String(req.headers["accept-encoding"] || "")) && /^(text\/|application\/(json|manifest)|image\/svg)/.test(tipo)) {
      arquivo = gzipSync(arquivo); cab["content-encoding"] = "gzip"; cab.vary = "Accept-Encoding";
    }
    res.writeHead(200, cab);
    res.end(arquivo);
  } catch { res.writeHead(404, { "content-type": "text/plain; charset=utf-8", "cache-control": "no-store" }); res.end("Não encontrado"); }
});

servidor.listen(PORT, HOST, () => console.log(`Órbita fictício local: http://${HOST}:${PORT}/app/?dev-falso=1&dev=1#/inicio`));
