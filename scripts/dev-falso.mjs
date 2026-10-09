#!/usr/bin/env node
// Órbita local: servidor restrito a loopback, com respostas fictícias em memória.
// Não lê credenciais, não chama serviços externos e nunca altera prontos.js.
import http from "node:http";
import { readFile } from "node:fs/promises";
import { readFileSync, readdirSync } from "node:fs";
import { createHash } from "node:crypto";
import { gzipSync } from "node:zlib";
import { extname, resolve, sep } from "node:path";
import { fileURLToPath } from "node:url";
import { gerarDemo } from "../web/demo.js";
import * as N from "../web/nucleo.js";
// só as regras de tipo/tamanho/caminho da mídia (funções puras): o fictício valida igual ao nx-midia de verdade
import { tipoAceito, caminhoMidia, pathDoCliente, mimeBase } from "../supabase/functions/_compartilhado/midia.js";

const ROOT = resolve(fileURLToPath(new URL("../web/", import.meta.url)));
const MIGRACOES = resolve(fileURLToPath(new URL("../supabase/migrations/", import.meta.url)));
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
  { id: 501, nome: "Mariana Costa", telefone: "5500000000501", email: "mariana@example.test", origem: "anuncio", plataforma: "google", campanha_nome: "Aparelho invisível · pesquisa", cidade: "Taubaté", uf: "SP", etiquetas: ["e1"], dono_id: ID.eu },
  { id: 502, nome: "Rafael Mendes", telefone: "5500000000502", email: "rafael@example.test", origem: "whatsapp", plataforma: null, campanha_nome: null, cidade: "Taubaté", uf: "SP", etiquetas: ["e2"], dono_id: ID.ana },
  { id: 503, nome: "Bianca Ferreira", telefone: "5500000000503", email: "bianca@example.test", origem: "anuncio", plataforma: "meta", campanha_nome: "Avaliação humanizada", cidade: "Pindamonhangaba", uf: "SP", etiquetas: ["e3"], dono_id: ID.eu },
  { id: 504, nome: "Lucas Oliveira", telefone: "5500000000504", email: "lucas@example.test", origem: "indicacao", plataforma: null, campanha_nome: null, cidade: "Taubaté", uf: "SP", etiquetas: [], dono_id: null },
];
const negocios = [
  { id: 801, contato_id: 501, titulo: "Aparelho invisível", servico: "Alinhador transparente", estagio_id: "s3", valor_previsto: 5200, dono_id: ID.eu, consulta_offset: 1, origem: "anuncio", plataforma: "google", campanha_nome: "Aparelho invisível · pesquisa" },
  { id: 802, contato_id: 502, titulo: "Implante dentário", servico: "Implante", estagio_id: "s2", valor_previsto: 6800, dono_id: ID.ana, consulta_offset: 0, origem: "whatsapp" },
  { id: 803, contato_id: 503, titulo: "Clareamento", servico: "Clareamento", estagio_id: "s1", valor_previsto: 950, dono_id: null, origem: "anuncio", plataforma: "meta", campanha_nome: "Avaliação humanizada" },
  { id: 804, contato_id: 504, titulo: "Avaliação preventiva", servico: "Clínica geral", estagio_id: "s5", valor_previsto: 0, valor: 1450, dono_id: ID.eu, consulta_offset: -4, origem: "indicacao" },
];
// empresas (T8 · plano 50, item 30): linhas no formato da tabela nx_empresas; o vínculo contato → empresa fica em empresaDoContato
// (os contatos acima não mudam). nx_empresas_listar / nx_empresa_ver devolvem o mesmo formato das RPCs da migração 20260928d_crm_b.
const empresas = [
  { id: 71, nome: "Convênio Metalúrgica Vale", documento: "00.000.000/0001-00", site: null, telefone: "5500000000710", email: "rh@metalurgica.example.test",
    cidade: "Taubaté", uf: "SP", obs: "Convênio com desconto na avaliação para os funcionários.", campos: {}, criado_em: "2026-09-02T13:00:00Z", atualizado_em: "2026-09-20T13:00:00Z" },
  { id: 72, nome: "Frota Sul Transportes", documento: null, site: null, telefone: null, email: null,
    cidade: "Pindamonhangaba", uf: "SP", obs: null, campos: {}, criado_em: "2026-09-10T13:00:00Z", atualizado_em: "2026-09-10T13:00:00Z" },
  { id: 73, nome: "Escola Primeiros Passos", documento: null, site: null, telefone: null, email: null,
    cidade: null, uf: null, obs: null, campos: {}, criado_em: "2026-09-25T13:00:00Z", atualizado_em: "2026-09-25T13:00:00Z" },
];
const empresaDoContato = { 501: 71, 504: 71, 503: 72 };
const usuarios = [
  { id: ID.eu, nome: "Dra. Helena", papel: "admin", aprovado: true, departamentos: [ID.dep], recebe_conversas: true },
  { id: ID.ana, nome: "Ana Paula", papel: "atendente", aprovado: true, departamentos: [ID.dep], recebe_conversas: true },
];
const etiquetas = [{ id: "e1", nome: "Aparelho invisível", cor: "#A98BD6" }, { id: "e2", nome: "Implante", cor: "#6FA3CF" }, { id: "e3", nome: "Clareamento", cor: "#E5B35C" }];
const departamentos = [{ id: ID.dep, nome: "Recepção", cor: "#6FA3CF", padrao: true, distribuicao: "rodizio", ativo: true,
  horario: { 0: [], 1: [["08:00", "18:00"]], 2: [["08:00", "18:00"]], 3: [["08:00", "18:00"]], 4: [["08:00", "18:00"]], 5: [["08:00", "18:00"]], 6: [["08:00", "12:00"]] } }];
// estado do número (contratos 3 e 4): `estado` conectado | desconectado | desconhecido, desde quando e a última sincronização;
// simular/canal?id=cw1&estado=desconectado derruba o aparelho (histórico + notificação canal_caiu) e ...&estado=conectado traz de volta
const DESDE_CANAL = new Date(Date.now() - 2 * 86400e3 + 12 * 60000).toISOString();
const canais = [
  { id: ID.canal, nome: "Recepção · CodeWords", provedor: "codewords", numero_exibicao: "+55 00 00000-0001", status: "ativo", departamento_id: ID.dep,
    estado: "conectado", estado_desde: DESDE_CANAL, sync_em: isoAgora(),
    // o bloco «codewords» de nx_canal_json (20261008b): conferido_em, estado do aparelho, sync {em, erro, falhas}, forma, contadores (S-B11) e aviso_em
    codewords: { tem_api_key: true, service_id: "cw-demo-fluxo", ia_ligada: true, ia_volta_horas: 6, rota: "fluxo", numero: "+55 00 00000-0001",
      sync: { em: isoAgora(), erro: null, falhas: 0 }, phone_id: "cw-phone-demo", conectado: true, numero_conferido: true, conferido_em: isoAgora(), estado: "open",
      inscricao: "cw-demo-fluxo/webhook", forma_desconhecida: null, forma_em: null,
      contadores: { eco: 3, grupo: 1, lid: 0, payload_desconhecido: 2, http_422: 1, http_413: 0, desde: new Date(Date.now() - 3 * 86400e3).toISOString() }, aviso_em: null } },
  { id: ID.meta, nome: "WhatsApp oficial · Meta", provedor: "meta", numero_exibicao: "+55 12 99123-4567", status: "ativo", departamento_id: ID.dep,
    estado: "conectado", estado_desde: DESDE_CANAL, sync_em: null,
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
    status: "aberto", etapa: nomesEtapas.find(e => e.id === n.estagio_id)?.nome, marco: n.estagio_id === "s2" ? "agendada" : null, dono_id: n.dono_id || null, titulo: n.titulo,
    origem: n.origem, plataforma: n.plataforma || null, campanha_nome: n.campanha_nome || null, anuncio_nome: null, rastreio: null, encaixe: n.id === 804 };
});
const bloqueios = [{ id: "b1", inicio: hora(somaDia(hoje, 2), "12", "00"), fim: hora(somaDia(hoje, 2), "13", "00"), motivo: "Intervalo da equipe" }];
/* ---------- estado mutável do ambiente fictício (reinicia junto com o servidor) ----------
   Serve às quatro frentes do plano de 01/10: contadores por RPC (conferir quantas chamadas uma tela fez),
   falhas programadas (503, atraso), sessão invalidada, mensagem de entrada simulada, idempotência por p_req /
   client_ref e o estado do onboarding. Nada daqui sai do computador. */
/** Chave de instalação do rastreio: 48 hex como a do banco (nx_entrada_chave), estável por número de troca. */
const chaveDev = n => createHash("sha256").update(`dev-falso-chave-${n}`).digest("hex").slice(0, 48);
const dev = {
  chamadas: {}, enviosExternos: 0, falhas: [], verificarToken: false,
  tokens: new Set(["demo-local-session", "demo-local-token"]), seqToken: 0,
  reqs: new Map(), refs: new Map(), arquivos: new Map(), pulsoV: 1, seqMsg: 100000, seqNegocio: 900, seqContato: 600, seqTarefa: 100,
  empresas: 1, teste: null,    // simular/clientes?n=2 e simular/teste?dias=2|nenhum&status=ativo
  /* plano 100 (frente H): o que as frentes da onda 2 precisam ver sem a produção —
     chave do rastreio e cliques do site (contratos 1 e 2), histórico/estado dos números e notificações (3), pausa da IA por
     conversa, cliente ativo/pausado e versão do banco anunciada em nx_app_sessao (9), falha programada de integração (nx-ciclo). */
  chave: chaveDev(0), seqChave: 0, rastreio: [], seqRastreio: 0,
  notificacoes: [], seqNotif: 0, historicoCanais: [], seqHist: 0,
  iaPausada: new Map([["903", { quem: "Ana Paula", ate: new Date(Date.now() + 5 * 3600e3).toISOString(), so_manual: false }]]),
  cliente: { ativo: true, super: true }, migracao: null, integracaoFalha: null,
};
const bater = () => { dev.pulsoV += 1; };
/** Nome da última migração do repositório (o que nx_app_sessao.migracao devolve depois de aplicada); simular/migracao?nome= sobrepõe. */
function ultimaMigracao() {
  if (dev.migracao) return dev.migracao;
  try { return readdirSync(MIGRACOES).filter(f => /^\d{8}[a-z]?_.+\.sql$/.test(f)).sort().at(-1)?.replace(/\.sql$/, "") || null; }
  catch { return null; }
}
const naoLidasNotif = () => dev.notificacoes.filter(n => !n.lida_em).length;
/** Notificação para a conta (mesmo formato de nx_notificacoes_listar): o sino e o pulso (notif) a enxergam. */
function notificar(tipo, titulo, corpo, link = null, dados = null) {
  const n = { id: ++dev.seqNotif, tipo, titulo, corpo, link, dados, lida_em: null, criado_em: isoAgora() };
  dev.notificacoes.push(n); bater();
  return n;
}
/** Linha de nx_canal_historico (contrato 3): o número mudou de estado. */
function historicoCanal(canalId, estado, detalhe, em = isoAgora()) {
  const x = { id: ++dev.seqHist, canal_id: canalId, estado, detalhe, em };
  dev.historicoCanais.push(x);
  return x;
}
const canalPorId = id => canais.find(k => k.id === String(id) || uuidDe(k.id) === String(id));
/** Troca o estado do número como nx_codewords_situacao faria: histórico + notificação canal_caiu/canal_voltou para os admins. */
function canalEstado(canal, estado, detalhe = null) {
  if (!["conectado", "desconectado", "desconhecido"].includes(estado) || canal.estado === estado) return canal;
  canal.estado = estado; canal.estado_desde = isoAgora();
  if (canal.codewords) canal.codewords.conectado = estado === "conectado";
  historicoCanal(canal.id, estado, detalhe || (estado === "desconectado" ? "aparelho sem conexão" : estado === "conectado" ? "aparelho voltou" : "sem resposta do CodeWords"));
  // dados {canal_id, canal_nome, estado}: o MESMO contrato da 20261008b — sem eles o shell nunca dava o número por reconectado
  const dados = { canal_id: canal.id, canal_nome: canal.nome, estado };
  if (estado === "desconectado") notificar("canal_caiu", `${canal.nome}: número desconectado`, "O aparelho perdeu a conexão com o WhatsApp. Pareie ou reconecte pelo celular.", "#/config/numeros", dados);
  if (estado === "conectado") notificar("canal_voltou", `${canal.nome}: número voltou`, "O aparelho reconectou e já recebe mensagens.", "#/config/numeros", dados);
  bater();
  return canal;
}
// histórico de partida: cada número conectou há 3 dias, caiu anteontem às 14:00 e voltou 12 min depois
for (const k of canais) {
  const base = Date.now() - 2 * 86400e3;
  historicoCanal(k.id, "conectado", "aparelho pareado", new Date(base - 86400e3).toISOString());
  historicoCanal(k.id, "desconectado", "aparelho sem conexão", new Date(base).toISOString());
  historicoCanal(k.id, "conectado", "aparelho voltou", DESDE_CANAL);
}
// o sino nasce com duas não lidas (antes o pulso dizia 2 e a lista vinha vazia)
notificar("lead_anuncio", "Novo contato do anúncio: Bianca Ferreira", "Avaliação humanizada · Meta", "#/conversas/903");
notificar("tarefa", "Tarefa para hoje: Confirmar avaliação", "Mariana Costa", "#/tarefas");
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

/* onboarding (nx_onboarding_estado, plano M32): os 11 itens na ordem recomendada, no MESMO formato da migração 20261002d:
   {total: 11, feitos, obrigatorios: 9, obrigatorios_feitos, pct, completo, itens: [{id, rotulo, feito, opcional}]}.
   Script do site e anúncios são opcionais (não contam para o 100 %). Nada de campo que o banco real não devolve
   (a rota de cada passo e o "dispensar por 7 dias" são da tela, não do servidor). */
const ONB_ITENS = [
  { id: "chave_codewords", rotulo: "Chave do WhatsApp salva" },
  { id: "aparelho_pareado", rotulo: "Aparelho pareado" },
  { id: "recebimento", rotulo: "Recebimento conferido" },
  { id: "ia_ou_direto", rotulo: "IA validada ou receber direto" },
  { id: "mensagem_teste", rotulo: "Mensagem de teste enviada" },
  { id: "departamento_horario", rotulo: "Departamento com horário" },
  { id: "agenda_faixas", rotulo: "Faixas da agenda" },
  { id: "script_site", rotulo: "Script do site com contato recebido", opcional: true },
  { id: "colega_convidado", rotulo: "Colega convidado" },
  { id: "funil_ajustado", rotulo: "Funil ajustado" },
  { id: "anuncios_ligados", rotulo: "Anúncios ligados", opcional: true },
];
const ONB_PRONTO = ["chave_codewords", "aparelho_pareado", "recebimento", "ia_ou_direto", "departamento_horario", "agenda_faixas", "colega_convidado", "funil_ajustado"];
const onb = { feitos: new Set(ONB_PRONTO) };
function onboardingDefinir(modo) {
  onb.feitos = new Set(modo === "novo" ? [] : modo === "completo" ? ONB_ITENS.map(i => i.id) : ONB_PRONTO);
  bater();
}
function onboardingEstado() {
  const itens = ONB_ITENS.map(i => ({ ...i, feito: onb.feitos.has(i.id), opcional: !!i.opcional }));
  const obrig = itens.filter(i => !i.opcional);
  const obrigFeitos = obrig.filter(i => i.feito).length;
  return { total: itens.length, feitos: itens.filter(i => i.feito).length, obrigatorios: obrig.length, obrigatorios_feitos: obrigFeitos,
    pct: Math.round(obrigFeitos * 100 / obrig.length), completo: obrigFeitos === obrig.length, itens };
}
const marcarOnb = (...ids) => { for (const id of ids) onb.feitos.add(id); };

const RESUMO_MIDIA = { imagem: "Foto", audio: "Áudio", video: "Vídeo", documento: "Documento" };   // mídia sem legenda na lista (como o banco)
const dataConv = c => {
  const ct = contatos.find(x => x.id === c.contato_id), canal = canais.find(x => x.id === c.canal_id);
  // horários FIXOS pelas mensagens (antes: «agora − minutos» a cada leitura — a última entrada «andava» e todo Resolver caía em
  // «escreveu de novo»); a janela de 24 h conta da última mensagem RECEBIDA
  const ult = c.mensagens.at(-1), ultIn = [...c.mensagens].reverse().find(m => m.direcao === "in" && !m.nota);
  const when = new Date(ult && ult.criada ? ult.criada : Date.now() - c.minutos * 60000).toISOString();
  const entrada = ultIn && ultIn.criada ? ultIn.criada : null;
  return { id: c.id, contato: { id: ct.id, nome: ct.nome, telefone: ct.telefone, optin_marketing: true, bloqueado: false, origem: ct.origem || "whatsapp", plataforma: ct.plataforma || null }, canal_id: c.canal_id, departamento_id: ID.dep,
    atribuida_a: c.atribuida_a, atribuida_nome: c.atribuida_nome, status: c.status, aguardando: c.aguardando, nao_lidas: c.nao_lidas,
    ultima_msg_em: when, ultima_msg_resumo: c.mensagens.at(-1).corpo ?? RESUMO_MIDIA[c.mensagens.at(-1).tipo], ultima_msg_dir: c.mensagens.at(-1).direcao, ultima_entrada_em: entrada ? new Date(entrada).toISOString() : null,
    janela_ate: entrada ? new Date(entrada + 24 * 3600e3).toISOString() : null, etiquetas: ct.etiquetas, protocolo: c.protocolo, oculta: false,
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
    // contrato 5: hora_conversa = hora (0–23, São Paulo) da 1ª mensagem; null quando não houve mensagem (1 em cada 7)
    leads: ds.LEADS.filter(L => L.i <= M.R).map((L, k) => ({ id: L.id, nome: L.nome, telefone: "", origem: "anuncio", plataforma: L.plat, campanha_ext: L.camp,
      anuncio_ext: L.cri, servico: L.servico, etapa: M.etapa(L), data_conversa: data(L.i), data_agenda: L.iAgenda != null ? data(L.iAgenda) : null,
      data_consulta: L.iConsulta != null ? data(L.iConsulta) : null, valor: L.fechou ? M.valorLead(L) : null, obs: "",
      hora_conversa: k % 7 === 6 ? null : 8 + ((k * 7 + L.i) % 12) })),
    alertas: M.avaliar(M.R, true).map((a, i) => ({ regra: a.regra.id, chave: a.chave, severidade: a.sev, mensagem: a.msg, acao: a.acao, referencia: data(M.R), criado_em: hora(data(M.R + 1), "08", `0${i}`), enviado_em: hora(data(M.R + 1), "08", `0${i}`), entregue_em: hora(data(M.R + 1), "08", `1${i}`) })),
    relatorios: [], integracoes: [{ canal: "meta", ativo: true, ultimo_sync: new Date(Date.now() - 18 * 60000).toISOString(), status: "ok — 58 linhas" },
      { canal: "google", ativo: true, ultimo_sync: new Date(Date.now() - 18 * 60000).toISOString(), status: "ok — 31 linhas" }] };
})();

/* nx_app_sessao com os campos do contrato 9: clientes[].ativo (interruptor da Nexus) e migracao (última migração aplicada,
   aqui a última do repositório). simular/cliente?ativo=0&super=0 reproduz a conta comum em cliente pausado (erro cliente_pausado). */
function sessao(token = "") {
  const outra = String(token).includes("outra");
  const sup = dev.cliente.super !== false;
  return { conta: { id: outra ? ID.ana : ID.eu, nome: outra ? "Ana Paula" : "Dra. Helena", email: "demo@example.test", papel: sup ? "gestor" : "admin", super: sup, telefone: null },
    org: { id: ID.org, nome: "Nexus", slug: "nexus", marca: { produto: (dev.marca && dev.marca.produto) || "Órbita", cores: { primaria: "#B0761F", secundaria: "#6FA3CF", fundo: "#07090C" } }, img_hash: dev.marca ? `dev-${Object.keys(dev.marca).join("")}` : "dev-falso" },
    super: sup, link_base_padrao: null, modulos_plano: {}, migracao: ultimaMigracao(),
    clientes: [{ id: ID.cliente, slug: "sorriso-vivo", nome: "Clínica Sorriso Vivo", plano: "completo", status: dev.teste ? dev.teste.status : "teste", vertical: dev.vertical || "odonto", papel: "admin", proprio: true,
      ativo: dev.cliente.ativo !== false,
      modulos: ["crm", "conversas", "relatorios", "ads", "automacoes"], teste_ate: dev.teste ? (dev.teste.dias === null ? null : somaDia(hoje, dev.teste.dias)) : somaDia(hoje, 14), tem_tema: false, cfg: {} },
      ...(dev.empresas > 1 ? [{ id: "00000000-0000-4000-8000-0000000000c2", slug: "oficina-central", nome: "Oficina Central", plano: "completo", status: "ativo", vertical: "oficina", papel: "admin", proprio: false, ativo: true,
        modulos: ["crm", "conversas", "relatorios", "ads", "automacoes"], teste_ate: null, tem_tema: false, cfg: {} }] : [])] };
}
/* Admin → Clientes: o mesmo item de nx_cliente_admin_item (org, comercial, ativo, uso × limites) + canais com estado (G10). */
function clienteAdminItem(c) {
  const proprio = c.id === ID.cliente;
  return { ...c, status: c.status || "ativo", org: { id: ID.org, slug: "nexus", nome: "Nexus", tipo: "plataforma" },
    comercial: proprio ? { segmento: "Clínica odontológica", especificacoes: "Avaliação e aparelho invisível; relatório diário para a dona.", pacote: "completo" } : null,
    criado_em: "2026-09-02T13:00:00Z", ativo: proprio ? dev.cliente.ativo !== false : true,
    uso: { usuarios: usuarios.length, canais: proprio ? canais.length : 1, funis: proprio ? funis.length : 1, automacoes: proprio ? 4 : 0, contatos: proprio ? contatos.length : 12, ia_mes: proprio ? 42 : 0 },
    limites: { usuarios: 5, canais: 2, funis: 3, automacoes: 8, contatos: 2000, ia_mes: 300 }, limites_extra: {},
    canais: proprio ? canais.map(k => ({ id: k.id, nome: k.nome, provedor: k.provedor, estado: k.estado })) : [] };
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
  // como nx_agenda_marcar_core: a consulta leva o negócio à etapa com marco «agendada» do funil e a resposta diz a etapa e a anterior
  const anterior = idx >= 0 ? { inicio: agendamentos[idx].inicio, rotulo: rotuloAgenda(agendamentos[idx].inicio) } : null;
  const etapaAg = nomesEtapas.find(e => e.marco === "agendada");
  if (etapaAg && n.estagio_id !== etapaAg.id) n.estagio_id = etapaAg.id;
  const item = { negocio_id: n.id, contato_id: c.id, nome: c.nome, telefone: c.telefone, inicio, fim,
    servico: String(p.p_servico || n.servico || "").slice(0, 80), status: "aberto",
    etapa: nomesEtapas.find(e => e.id === n.estagio_id)?.nome, marco: "agendada", dono_id: n.dono_id || null, titulo: n.titulo,
    origem: n.origem, plataforma: n.plataforma || null, campanha_nome: n.campanha_nome || null, anuncio_nome: null, rastreio: n.rastreio || null,
    encaixe: !!p.p_encaixe };
  if (idx >= 0) agendamentos[idx] = item; else agendamentos.push(item);
  n.consulta_inicio = inicio;
  n.consulta_offset = Math.round((Date.parse(inicio.slice(0, 10)) - Date.parse(`${hoje}T00:00:00Z`)) / 86400000);
  n.servico = item.servico;
  bater();
  return { ok: true, mudou: true, remarcada: idx >= 0, negocio_id: n.id, contato_id: c.id,
    consulta: { ...item, rotulo: rotuloAgenda(inicio), duracao_min: duracao }, anterior, etapa: etapaAg ? etapaAg.nome : null };
}
/** «seg., 06/10, 10:00» em São Paulo (o nx_agenda_rotulo do banco). */
function rotuloAgenda(iso) {
  const d = new Date(iso);
  return Number.isNaN(d.getTime()) ? String(iso) : new Intl.DateTimeFormat("pt-BR", { timeZone: "America/Sao_Paulo", weekday: "short", day: "2-digit", month: "2-digit", hour: "2-digit", minute: "2-digit" }).format(d);
}
const donoNome = id => (usuarios.find(u => u.id === id) || {}).nome || null;
/** Linha de nx_agenda_dia (20260929c: rotulo, campanha_ext/anuncio_ext, campanha_nome da métrica ou do utm) + contrato 6 (encaixe,
    dono_nome) + a etapa atual do negócio. `presenca` é o que nx_agenda_presenca gravou em nx_leads.campos (a tela mostra o estado). */
function consultaDia(a) {
  const n = negocios.find(x => x.id === a.negocio_id);
  const e = n && nomesEtapas.find(x => x.id === n.estagio_id);
  const rastreio = n && n.rastreio ? n.rastreio : a.rastreio || null;
  return { ...a, rotulo: rotuloAgenda(a.inicio), encaixe: !!a.encaixe, dono_nome: donoNome(a.dono_id), etapa: e ? e.nome : a.etapa, marco: e ? e.marco || null : a.marco,
    status: e && e.tipo !== "aberto" ? e.tipo : a.status, plataforma: (n && n.plataforma) || a.plataforma || null,
    campanha_ext: (n && n.campanha_ext) || null, anuncio_ext: (n && n.anuncio_ext) || null,
    campanha_nome: (n && n.campanha_nome) || (rastreio && rastreio.utm_campaign) || a.campanha_nome || null, rastreio,
    presenca: n && n.campos && n.campos.presenca ? n.campos.presenca : null };
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
const semNulos = o => Object.fromEntries(Object.entries(o).filter(([, v]) => v != null));

/* ---------- rastreio do site (contratos 1 e 2) ----------
   nx_rastreio_registrar é o que o script do site (web/rastreio.js) chama no clique do WhatsApp; aqui ele é servido também em
   /rest/v1/rpc/nx_rastreio_registrar (sem o prefixo) com CORS, para o snippet gerado em ?dev-falso=1 e a página /__dev_falso/site.html
   baterem SÓ neste servidor. nx_rastreio_atribuir aplica o código ao negócio aberto do telefone (canal codewords OU meta); sem negócio o
   código fica pendente e é aplicado quando o negócio nasce (o gatilho nx_tg_rastreio_pendente do banco). */
const ALFABETO_REF = "ABCDEFGHJKMNPQRSTUVWXYZ23456789";
const RE_REF = /^[A-HJKMNP-Z2-9]{5}$/;
// as MESMAS listas de nx_rastreio_plataforma (20261008a): fontes Meta/Google, mediums pagos e orgânicos
const SRC_META = ["facebook", "fb", "instagram", "ig", "meta", "facebook_ads", "meta_ads", "fb_ads", "instagram_ads", "ig_ads"];
const SRC_GOOGLE = ["google", "adwords", "googleads", "google_ads", "google-ads", "gads", "youtube"];
const MEDIUM_PAGO = ["cpc", "ppc", "paid", "paidsocial", "paid_social", "paid-social", "social_paid", "social-paid", "display", "cpm", "ads", "ad",
  "pmax", "performance_max", "video", "remarketing", "retargeting", "cpv", "cpa"];
const MEDIUM_ORGANICO = ["organic", "organico", "orgânico", "seo", "social", "bio"];
function codigoRef() {
  let c;
  do { c = ""; for (let i = 0; i < 5; i++) c += ALFABETO_REF[Math.floor(Math.random() * ALFABETO_REF.length)]; } while (dev.rastreio.some(r => r.codigo === c));
  return c;
}
const txtRastreio = (d, k, max) => { const s = String(d[k] ?? "").replace(/[\u0000-\u001f\u007f]+/g, " ").trim().slice(0, max); return s || null; };
/** {plataforma, origem, pago} do clique — a MESMA regra de nx_rastreio_plataforma (20261008a): gclid/gbraid/wbraid → google;
    utm_source google* com medium pago ou campanha → google; fonte Meta ou fbclid → meta (medium pago = anúncio, senão orgânico:
    link da bio, post); fora disso medium pago → anúncio, organic/seo/social/bio → orgânico, senão site. */
function classificarRastreio(r) {
  const src = String(r.utm_source || "").toLowerCase(), med = String(r.utm_medium || "").toLowerCase();
  const pago = MEDIUM_PAGO.includes(med);
  const plataforma = r.gclid || r.gbraid || r.wbraid ? "google"
    : SRC_GOOGLE.includes(src) && (pago || r.utm_campaign) ? "google"
    : SRC_META.includes(src) || r.fbclid ? "meta" : null;
  const origem = plataforma === "google" ? "anuncio" : plataforma === "meta" ? (pago ? "anuncio" : "organico")
    : pago ? "anuncio" : MEDIUM_ORGANICO.includes(med) ? "organico" : "site";
  return { plataforma, origem, pago };
}
/** Casa utm_campaign / utm_content com as campanhas e anúncios que o nx-ciclo leu (nx_metricas_dia — aqui, as linhas da demo), por id
    OU nome, como nx_rastreio_aplicar: campanha conhecida vira anúncio mesmo sem medium pago; sem par, fica o texto cru (≤ 100). */
function casarCampanha(plataforma, campanha, anuncio) {
  const linhas = plataforma ? demoAds.metricas.filter(m => m.p === plataforma) : [];
  const igual = (a, b) => a != null && b != null && String(a).toLowerCase() === String(b).toLowerCase();
  const mc = campanha ? linhas.find(m => m.c === campanha) || linhas.find(m => igual(m.cn, campanha)) : null;
  const ma = anuncio ? linhas.find(m => (m.a === anuncio || igual(m.an, anuncio)) && (!mc || m.c === mc.c)) : null;
  return { casou: !!mc, campanha_ext: mc ? mc.c : campanha ? campanha.slice(0, 100) : null, campanha_nome: mc ? mc.cn : null,
    anuncio_ext: ma ? ma.a : anuncio ? anuncio.slice(0, 100) : null };
}
function rastreioRegistrar(p) {
  const d = p.p_dados && typeof p.p_dados === "object" && !Array.isArray(p.p_dados) ? p.p_dados : {};
  const chave = String(p.p_chave || "");
  // chave errada ou cliente pausado: código plausível SEM gravar (não revela nada), como o banco
  if (!/^[0-9a-f]{48}$/.test(chave) || chave !== dev.chave || dev.cliente.ativo === false) return { ok: true, codigo: codigoRef() };
  if (String(d.teste) === "1") return { ok: true, codigo: codigoRef(), teste: true };
  const agora = Date.now();
  const hora = dev.rastreio.filter(r => !r.semente && agora - r.criado < 3600e3);
  if (hora.filter(r => agora - r.criado < 60e3).length >= 120 || hora.length >= 1000) {
    throw new ErroDev("limite_taxa", "Muitos cliques registrados em pouco tempo (120 por minuto, 1.000 por hora). Tente de novo em instantes.");
  }
  const pagina = String(d.pagina || "").split("#")[0].split("?")[0].slice(0, 300);
  const r = { id: ++dev.seqRastreio, codigo: codigoRef(), criado: agora, pagina: /^https?:\/\//i.test(pagina) ? pagina : null,
    utm_source: txtRastreio(d, "utm_source", 100), utm_medium: txtRastreio(d, "utm_medium", 100), utm_campaign: txtRastreio(d, "utm_campaign", 150),
    utm_content: txtRastreio(d, "utm_content", 150), utm_term: txtRastreio(d, "utm_term", 150),
    gclid: txtRastreio(d, "gclid", 250), gbraid: txtRastreio(d, "gbraid", 250), wbraid: txtRastreio(d, "wbraid", 250), fbclid: txtRastreio(d, "fbclid", 250),
    telefone: null, negocio_id: null, usado_em: null, resultado: null, pendente: false };
  dev.rastreio.push(r);
  return { ok: true, codigo: r.codigo };
}
const negocioAberto = contatoId => negocios.find(x => x.contato_id === contatoId && (nomesEtapas.find(e => e.id === x.estagio_id) || {}).tipo === "aberto");
/** nx_rastreio_aplicar: o código vai para o negócio (nunca sobrescreve anúncio), o contato recebe o 1º toque e nx_rastreio.resultado
    guarda {aplicado, motivo, em, negocio_id, plataforma, origem, campanha_ext}; a resposta é a da RPC real. */
function aplicarRastreio(r, n, tel) {
  r.usado_em = r.usado_em || isoAgora(); r.telefone = r.telefone || tel; r.negocio_id = n.id; r.pendente = false;
  if (n.rastreio && n.rastreio.codigo === r.codigo) {
    return { ok: true, aplicado: true, repetido: true, negocio_id: n.id, origem: n.origem, plataforma: n.plataforma || null,
      campanha_ext: n.campanha_ext || null, anuncio_ext: n.anuncio_ext || null, gclid: !!n.gclid };
  }
  const motivo = n.plataforma || n.anuncio_ext || n.gclid || n.origem === "anuncio" ? "ja_tem_anuncio" : !["whatsapp", "site"].includes(n.origem) ? "origem_definida" : null;
  if (motivo) { r.resultado = { aplicado: false, motivo, em: isoAgora(), negocio_id: n.id }; return { ok: true, aplicado: false, motivo, negocio_id: n.id }; }
  const cls = classificarRastreio(r), plataforma = cls.plataforma;
  const casado = plataforma ? casarCampanha(plataforma, r.utm_campaign, r.utm_content) : { casou: false, campanha_ext: null, campanha_nome: null, anuncio_ext: null };
  const origem = casado.casou ? "anuncio" : cls.origem;   // utm_campaign que casa com uma campanha conhecida é anúncio, mesmo sem medium pago
  n.origem = origem; n.plataforma = plataforma; n.gclid = r.gclid || n.gclid || null;
  n.campanha_ext = casado.campanha_ext || n.campanha_ext || null; n.anuncio_ext = casado.anuncio_ext || n.anuncio_ext || null;
  if (casado.campanha_nome || r.utm_campaign) n.campanha_nome = casado.campanha_nome || r.utm_campaign;   // o que nx_agenda_dia/kanban mostram (métrica, senão o utm cru)
  n.rastreio = semNulos({ codigo: r.codigo, utm_source: r.utm_source, utm_medium: r.utm_medium, utm_campaign: r.utm_campaign, utm_content: r.utm_content,
    utm_term: r.utm_term, gbraid: r.gbraid, wbraid: r.wbraid, fbclid: r.fbclid, pagina: r.pagina, clique_em: new Date(r.criado).toISOString() });
  const c = contatos.find(x => x.id === n.contato_id);
  if (c) {   // 1º toque do contato: só preenche o vazio; a origem padrão «whatsapp» vira a real
    if (c.origem === "whatsapp") c.origem = origem;
    c.plataforma = c.plataforma || plataforma; c.campanha_ext = c.campanha_ext || casado.campanha_ext; c.anuncio_ext = c.anuncio_ext || casado.anuncio_ext;
    c.campanha_nome = c.campanha_nome || casado.campanha_nome || r.utm_campaign || null;
  }
  r.resultado = semNulos({ aplicado: true, motivo: "aplicado", em: isoAgora(), negocio_id: n.id, plataforma, origem, campanha_ext: casado.campanha_ext });
  marcarOnb("script_site");
  bater();
  return { ok: true, aplicado: true, negocio_id: n.id, origem, plataforma, campanha_ext: casado.campanha_ext, campanha_nome: casado.campanha_nome,
    anuncio_ext: casado.anuncio_ext, gclid: !!r.gclid };
}
function rastreioAtribuir(p) {
  const canal = canalPorId(p.p_canal);
  if (!canal || !["codewords", "meta"].includes(canal.provedor)) throw new ErroDev("canal_nao_encontrado");
  const cod = String(p.p_codigo || "").trim().toUpperCase();
  if (!RE_REF.test(cod)) return { ok: true, aplicado: false, motivo: "codigo_invalido" };
  const tel = soDigitos(p.p_telefone);
  if (tel.length < 8 || tel.length > 15) throw new ErroDev("dados_invalidos", "telefone");
  const r = dev.rastreio.find(x => x.codigo === cod && Date.now() - x.criado < 30 * 86400e3);
  if (!r) return { ok: true, aplicado: false, motivo: "codigo_desconhecido" };
  if (r.telefone && r.telefone.slice(-8) !== tel.slice(-8)) return { ok: true, aplicado: false, motivo: "codigo_ja_usado" };
  const contato = contatos.find(c => soDigitos(c.telefone).slice(-8) === tel.slice(-8));
  const n = contato && negocioAberto(contato.id);
  r.telefone = tel;   // o código passa a valer só para este telefone (também quando ainda não há negócio)
  if (!n) {
    Object.assign(r, { pendente: true, resultado: { aplicado: false, motivo: "sem_negocio", em: isoAgora(), pendente: true } });
    return { ok: true, aplicado: false, motivo: "sem_negocio", pendente: true };
  }
  return aplicarRastreio(r, n, tel);
}
/** O gatilho do banco: negócio novo de um telefone com código pendente (30 dias) recebe a origem do clique. */
function aplicarRastreioPendente(contato, n) {
  const tel = soDigitos(contato && contato.telefone);
  if (!tel) return null;
  const r = dev.rastreio.find(x => x.pendente && x.telefone && x.telefone.slice(-8) === tel.slice(-8) && Date.now() - x.criado < 30 * 86400e3);
  return r ? aplicarRastreio(r, n, tel) : null;
}
/** nx_rastreio_listar (20261008a): {dias, itens ≤ 500 sem o código, totais {cliques, casados, usados, pendentes}}; plataforma/origem vêm do
    resultado gravado (senão da classificação) e motivo é «pendente» enquanto o código espera o negócio nascer. */
function rastreioListar(p) {
  const dias = Math.max(1, Math.min(90, Number(p.p_dias) || 30)), desde = Date.now() - dias * 86400e3;
  const janela = dev.rastreio.filter(r => r.criado >= desde).sort((a, b) => b.criado - a.criado);
  const itens = janela.slice(0, 500).map(r => {
    const n = r.negocio_id ? negocios.find(x => x.id === r.negocio_id) : null, c = n && contatos.find(x => x.id === n.contato_id);
    const res = r.resultado || {}, cls = classificarRastreio(r);
    return { em: new Date(r.criado).toISOString(), pagina: r.pagina, utm_source: r.utm_source, utm_medium: r.utm_medium, utm_campaign: r.utm_campaign,
      utm_content: r.utm_content, plataforma: res.plataforma || cls.plataforma, origem: res.origem || cls.origem, casou: !!res.aplicado,
      motivo: r.pendente ? "pendente" : res.motivo || null, usado_em: r.usado_em, negocio_id: r.negocio_id, contato_nome: c ? c.nome : n ? n.titulo : null };
  });
  return { dias, itens, totais: { cliques: janela.length, casados: janela.filter(r => r.resultado && r.resultado.aplicado).length,
    usados: janela.filter(r => r.usado_em).length, pendentes: janela.filter(r => r.pendente).length } };
}
// cliques de partida (últimos 10 dias): dois casaram, um ficou pendente, um é orgânico do Instagram e um nunca foi usado
(function semearRastreio() {
  const dia = n => Date.now() - n * 86400e3;
  const semente = (o, extra = {}) => dev.rastreio.push({ id: ++dev.seqRastreio, codigo: codigoRef(), semente: true, telefone: null, negocio_id: null, usado_em: null,
    resultado: null, pendente: false, utm_source: null, utm_medium: null, utm_campaign: null, utm_content: null, utm_term: null, gclid: null, gbraid: null, wbraid: null, fbclid: null, ...o, ...extra });
  const pag = "https://sorrisovivo.example.test/";
  semente({ criado: dia(9), pagina: pag, utm_source: "google", utm_medium: "cpc", utm_campaign: "Aparelho invisível · pesquisa", utm_content: "Vídeo de apresentação", gclid: "Cj0KCQ-demo-1" },
    { telefone: "5500000000501", negocio_id: 801, usado_em: new Date(dia(9) + 600e3).toISOString(),
      resultado: { aplicado: true, motivo: "aplicado", em: new Date(dia(9) + 600e3).toISOString(), negocio_id: 801, plataforma: "google", origem: "anuncio", campanha_ext: "Aparelho invisível · pesquisa" } });
  semente({ criado: dia(6), pagina: `${pag}avaliacao`, utm_source: "instagram", utm_medium: "paid_social", utm_campaign: "Avaliação humanizada", utm_content: "Carrossel sorriso", fbclid: "IwAR-demo-2" },
    { telefone: "5500000000503", negocio_id: 803, usado_em: new Date(dia(6) + 300e3).toISOString(),
      resultado: { aplicado: true, motivo: "aplicado", em: new Date(dia(6) + 300e3).toISOString(), negocio_id: 803, plataforma: "meta", origem: "anuncio", campanha_ext: "Avaliação humanizada" } });
  semente({ criado: dia(3), pagina: pag, utm_source: "instagram", utm_medium: "social", utm_campaign: null, fbclid: "IwAR-demo-3" });
  semente({ criado: dia(2), pagina: `${pag}implante`, utm_source: "google", utm_medium: "cpc", utm_campaign: "Implante · pesquisa", gclid: "Cj0KCQ-demo-4" },
    { telefone: "5500000000999", pendente: true, resultado: { aplicado: false, motivo: "sem_negocio", em: new Date(dia(2) + 120e3).toISOString(), pendente: true } });
  semente({ criado: dia(1), pagina: pag, utm_source: "facebook", utm_medium: "paid_social", utm_campaign: "Avaliação humanizada", utm_content: "Vídeo depoimento" });
})();

/* execuções fictícias por automação, espalhadas por 14 dias (contrato 7): a lista (nx_automacao_execucoes) e a série
   (nx_automacao_execucoes_dia) nascem da MESMA fonte, então os números batem na tela. */
function execucoesDe(autoId) {
  const semente = [...String(autoId || "x")].reduce((s, ch) => s + ch.charCodeAt(0), 0);
  const lista = [];
  for (let d = 13; d >= 0; d--) {
    const n = (semente + d * 7) % 4;
    for (let i = 0; i < n; i++) {
      const k = (semente + d * 3 + i) % 9;
      const estado = k === 0 ? "erro" : k === 1 ? "esperando" : k === 2 ? "cancelada" : "concluida";
      const em = new Date(Date.now() - d * 86400e3 - (i * 3 + 1) * 3600e3).toISOString();
      const detalhe = estado === "erro" ? "codewords_sem_aparelho" : estado === "esperando" ? "Mensagem na fila para Mariana Costa"
        : estado === "cancelada" ? "O cliente respondeu · cancelada: o cliente respondeu" : k % 2 ? "Tarefa criada para Dra. Helena" : "Pulada: contato pediu para não receber";
      lista.push({ criado_em: em, ok: estado !== "erro", detalhe, chave: `ev:${d}${i}`, estado, passo: estado === "concluida" ? 4 : estado === "erro" ? 1 : 2, total_passos: 4,
        continua_em: estado === "esperando" ? new Date(Date.now() + 86400e3).toISOString() : null, link: k % 2 ? "#/crm/negocio/801" : "#/conversas/901", atualizado_em: em });
    }
  }
  return lista.sort((a, b) => b.criado_em.localeCompare(a.criado_em));
}
function execucoesPorDia(autoId, dias) {
  const n = Math.max(1, Math.min(60, Number(dias) || 14));
  const mapa = new Map(Array.from({ length: n }, (_, i) => { const d = somaDia(hoje, i - n + 1); return [d, { dia: d, ok: 0, erro: 0 }]; }));
  for (const x of execucoesDe(autoId)) { const p = mapa.get(spData(new Date(x.criado_em))); if (p) p[x.ok ? "ok" : "erro"]++; }
  return [...mapa.values()];
}
/** Estado da IA numa conversa: EXATAMENTE os campos de nx_cv_ia_json (20260929a); nx_cv_ia_estado/pausar/devolver devolvem este objeto.
    (A cota do mês e «ligada» que o composer lê vêm de nx_cv_base.ia, não daqui — como no banco.) */
function iaEstadoDe(convId) {
  const c = conversaPorId(convId), canal = c && canais.find(k => k.id === c.canal_id);
  const cw = !!canal && canal.provedor === "codewords";
  const pausa = dev.iaPausada.get(String(convId)) || null, pausada = !!pausa;
  return { conversa_id: Number(convId), disponivel: cw, ia_ligada: cw, pausada,
    pausada_ate: pausada && !pausa.so_manual ? pausa.ate : null, so_manual: pausada && !!pausa.so_manual,
    pausada_por: pausada ? "manual" : null, pausada_por_nome: pausada ? pausa.quem : null,
    volta_horas: cw ? 6 : null, respostas_10min: 1, limite_10min: 8, respondendo: cw && !pausada };
}
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
  aplicarRastreioPendente(contato, n);   // código do site que chegou antes do negócio (gatilho nx_tg_rastreio_pendente)
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
  return { id: m.id, conversa_id: c.id, direcao: m.direcao, tipo: m.nota ? "nota" : m.tipo || "texto", corpo: m.corpo, status: m.direcao === "in" ? "recebida" : "enviada", criado_em: em, atualizado_em: em,
    origem: m.direcao === "out" ? "painel" : null, enviado_por: m.direcao === "out" ? { id: ID.eu, nome: "Dra. Helena" } : null, referral: null, ...(m.midia ? { midia: m.midia } : {}),
    ...(m.client_ref ? { client_ref: m.client_ref } : {}) };
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
/* Mídia fictícia (foto, áudio, vídeo, documento), em qualquer canal da demo: o nx-midia "subir" valida tipo e tamanho como o
   de verdade e devolve um endereço de upload que só existe aqui (host .invalid: o boot.js troca pelo servidor local; sem ele,
   nada sai do computador); o PUT só conta os bytes (nada é guardado em disco) e o nx-enviar "midia" grava a saída com a mídia. */
const HOST_UPLOAD = "dev-falso.invalid";
const ROTA_UPLOAD = "/__dev_falso/storage/v1/object/upload/sign/nx-midia/";
const TIPO_MSG_MIDIA = { image: "imagem", audio: "audio", video: "video", document: "documento" };
function subirMidia(p) {
  const tipo = tipoAceito(p.mime);
  if (!tipo) return { ok: false, erro: "midia_tipo" };
  const tamanho = Number(p.tamanho);
  if (!Number.isFinite(tamanho) || tamanho <= 0) return { ok: false, erro: "dados_invalidos" };
  if (tamanho > tipo.max) return { ok: false, erro: "midia_grande" };
  const path = caminhoMidia(ID.cliente, "out", new Date(), tipo.ext);
  return { ok: true, path, upload_url: `https://${HOST_UPLOAD}/storage/v1/object/upload/sign/nx-midia/${path}?token=dev-falso` };
}
/** nx-enviar (midia): mesma idempotência por client_ref do texto; a mensagem volta «enviada» com midia {path, mime, nome, tamanho, estado}. */
function enviarMidia(p) {
  const c = conversaPorId(p.conversa);
  if (!c) return { ok: false, erro: "conversa_nao_encontrada" };
  const path = String(p.path ?? "");
  if (!pathDoCliente(path, ID.cliente, "out")) return { ok: false, erro: "midia_nao_encontrada" };
  const tipo = tipoAceito(p.mime);
  if (!tipo) return { ok: false, erro: "midia_tipo" };
  const ref = p.client_ref ? `${c.id}:${p.client_ref}` : null;
  if (ref && dev.refs.has(ref)) return { ok: true, mensagem: dev.refs.get(ref), repetida: true };
  dev.enviosExternos += 1;
  const tamanho = Number(p.tamanho) > 0 ? Number(p.tamanho) : dev.arquivos.get(path)?.tamanho || null;
  const legenda = String(p.legenda ?? "").trim().slice(0, 1024) || null;
  const m = { id: ++dev.seqMsg, direcao: "out", tipo: TIPO_MSG_MIDIA[tipo.grupo], corpo: tipo.grupo === "audio" ? null : legenda, minutos: 0, criada: Date.now(),
    midia: { path, mime: mimeBase(p.mime), nome: String(p.nome ?? "").trim().slice(0, 200) || null, ...(tamanho ? { tamanho } : {}), estado: "ok" },
    ...(p.client_ref ? { client_ref: String(p.client_ref) } : {}) };
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
    case "nx_entrar": {   // {token, nome, papel} como a RPC real
      const token = `demo-local-${dev.proximaContaOutra ? "outra" : "token"}-${++dev.seqToken}`; dev.tokens.add(token);
      return { token, nome: dev.proximaContaOutra ? "Ana Paula" : "Dra. Helena", papel: dev.cliente.super !== false ? "gestor" : "admin" };
    }
    case "nx_sair": dev.tokens.clear(); return { ok: true };
    case "nx_app_sessao": {
      // contrato 9: conta comum em cliente pausado pela Nexus não entra
      if (dev.cliente.ativo === false && dev.cliente.super === false) throw new ErroDev("cliente_pausado", "A conta desta empresa está pausada pela Nexus. Fale com o suporte.");
      return sessao(p.p_token);
    }
    case "nx_cliente_tema": return { tema: {}, marca_cliente: {}, atualizado: "dev-falso" };
    case "nx_pulso": {
      // EXATAMENTE os campos da RPC (20261008b + 20261009b): v, notif (não lidas do sino), nao_lidas (conversas abertas/pendentes visíveis
      // com não lidas), canais [{id, nome, estado, desde}] (o número caído aparece no próximo pulso) e agora
      const vis = conversas.filter(c => !c.oculta && ["aberta", "pendente"].includes(c.status));
      const desde = id => { const h = dev.historicoCanais.filter(x => x.canal_id === id).sort((a, b) => String(b.em).localeCompare(String(a.em)))[0]; return h ? h.em : null; };
      return { v: dev.pulsoV, notif: naoLidasNotif(), nao_lidas: vis.filter(c => c.nao_lidas > 0).length,
        canais: canais.map(k => ({ id: k.id, nome: k.nome, estado: k.estado || "desconhecido", desde: desde(k.id) })), agora: isoAgora() };
    }
    case "nx_onboarding_estado": return onboardingEstado();
    case "nx_notificacoes_listar": {
      const lim = Math.max(1, Math.min(100, Number(p.p_limite) || 30));
      const itens = [...dev.notificacoes].sort((a, b) => b.id - a.id).slice(0, lim).map(n => ({ ...n }));
      return { itens, nao_lidas: naoLidasNotif() };
    }
    case "nx_notificacoes_marcar": {
      const ids = Array.isArray(p.p_ids) ? p.p_ids.map(String) : null;
      for (const n of dev.notificacoes) if (!n.lida_em && (!ids || ids.includes(String(n.id)))) n.lida_em = isoAgora();
      return { ok: true, nao_lidas: naoLidasNotif() };
    }
    case "nx_inicio": {
      // as contagens de conversas saem do MESMO estado das abas (como a RPC real); o resto é fixo
      const vis = conversas.filter(c => !c.oculta), ativas = vis.filter(c => ["aberta", "pendente"].includes(c.status));
      const aguard = vis.filter(c => c.status === "aberta" && c.aguardando);
      const esperaMin = c => Math.max(0, Math.round((Date.now() - ((c.mensagens.filter(m => m.direcao === "in").at(-1) || {}).criada || Date.now())) / 60000));
      const d14 = (base, passo) => Array.from({ length: 14 }, (_, i) => Math.max(0, Math.round(base + Math.sin(i / 2) * passo + (i % 3))));
      return { hoje, agora: isoAgora(),
        conversas: { aguardando: aguard.length, sem_dono: ativas.filter(c => !c.atribuida_a).length, minhas: ativas.filter(c => c.atribuida_a === ID.eu).length,
          abertas: vis.filter(c => c.status === "aberta").length, pendentes: vis.filter(c => c.status === "pendente").length,
          espera_mais_antiga_min: aguard.length ? Math.max(...aguard.map(esperaMin)) : null,
          // contrato 4: 1ª resposta em até 15 min (7 dias) e quem espera agora (≤ 5, a mais antiga primeiro; canal = provedor do número)
          respondidas_no_prazo_pct: 78,
          aguardando_lista: aguard.map(c => ({ id: c.id, nome: (contatos.find(x => x.id === c.contato_id) || {}).nome || null, espera_min: esperaMin(c),
            canal: (canais.find(k => k.id === c.canal_id) || {}).provedor || null })).sort((a, b) => b.espera_min - a.espera_min).slice(0, 5) },
        leads: { hoje: 4, hoje_anuncio: 2, semana: 23, semana_anuncio: 14 },
        negocios: { ganhos_mes: 9, abertos: 18, valor_aberto: 67400, previsao_ponderada: 26200, receita_mes: 28400, receita_mes_anterior: 20300, ganhos_mes_anterior: 7, receita_mes_anterior_parcial: 20300, dia_do_mes: Number(hoje.slice(-2)) },
        // tarefas.proximas no formato da RPC real (id, titulo, tipo, vence_em, atrasada, contato_nome, contato_id, negocio_id)
        tarefas: { hoje: 4, atrasadas: 1, abertas: 7, proximas: [{ id: 71, titulo: "Confirmar avaliação com Mariana", tipo: "ligacao", vence_em: isoAgora(), atrasada: false, contato_nome: "Mariana Costa", contato_id: 501, negocio_id: 801 }] },
        // contrato 4: funil do mês até hoje e séries de 14 dias (mais antigo primeiro)
        funil_mes: { leads: 23, conversas: 19, agendados: 11, ganhos: 9 },
        series_14d: { aguardando: d14(2, 1), consultas: d14(3, 2), valor_aberto: d14(60000, 8000), leads: d14(3, 2) },
        canais: canais.map(c => ({ id: c.id, nome: c.nome, numero_exibicao: c.numero_exibicao, status: c.status, provedor: c.provedor, ultimo_erro: null,
          estado: c.estado, desde: c.estado_desde, sync_em: c.sync_em, app_inscrito: true, verificado_em: isoAgora(), ultima_entrada_em: isoAgora() })),
        notificacoes_nao_lidas: naoLidasNotif() };
    }
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
      // os filtros de nx_crm_filtro_contatos (20260928d) que as telas usam: busca, dono (eu | sem | id), origem (LISTA \u2014 string solta n\u00e3o filtra,
      // como no banco), empresa_id e tem_negocio_aberto; p_ordem nome | ultimo_contato | recentes; resposta no formato da RPC real
      if (p.p_filtro != null && (typeof p.p_filtro !== "object" || Array.isArray(p.p_filtro))) throw new ErroDev("dados_invalidos", "filtro");
      const f = p.p_filtro || {}, busca = String(f.busca || "").trim();
      const dig = soDigitos(busca), norm = s => String(s || "").normalize("NFD").replace(/[\u0300-\u036f]/g, "").toLowerCase();
      const abertos = c => negocios.filter(n => n.contato_id === c.id && (nomesEtapas.find(e => e.id === n.estagio_id) || {}).tipo === "aberto").length;
      const ultimo = c => { const m = conversas.filter(v => v.contato_id === c.id).flatMap(v => v.mensagens.map(x => x.criada)); return m.length ? new Date(Math.max(...m)).toISOString() : null; };
      const criadoEm = c => new Date(Date.now() - 86400000 * (c.id % 11 + 2)).toISOString();
      const origens = Array.isArray(f.origem) && f.origem.length ? f.origem.map(String) : null;
      const achados = contatos.filter(c => (!busca || norm(c.nome).includes(norm(busca)) || (dig.length >= 4 && soDigitos(c.telefone).includes(dig)))
        && (f.dono === "eu" ? c.dono_id === ID.eu : f.dono === "sem" ? !c.dono_id : f.dono ? c.dono_id === f.dono : true)
        && (!origens || origens.includes(c.origem))
        && (!f.empresa_id || String(empresaDoContato[c.id] || "") === String(f.empresa_id))
        && (typeof f.tem_negocio_aberto !== "boolean" || (abertos(c) > 0) === f.tem_negocio_aberto));
      const ordem = p.p_ordem === "nome" ? (a, b) => String(a.nome || "").localeCompare(String(b.nome || ""), "pt-BR") || a.id - b.id
        : p.p_ordem === "ultimo_contato" ? (a, b) => String(ultimo(b) || "").localeCompare(String(ultimo(a) || "")) || b.id - a.id
        : (a, b) => criadoEm(b).localeCompare(criadoEm(a)) || b.id - a.id;
      const por = Math.max(1, Math.min(100, Number(p.p_por_pagina) || 50)), pg = Math.max(1, Number(p.p_pagina) || 1);
      const itens = [...achados].sort(ordem).slice((pg - 1) * por, pg * por).map(c => ({ ...c, dono_id: c.dono_id || null,
        empresa: empresaDoContato[c.id] ? { id: empresaDoContato[c.id], nome: (empresas.find(e => e.id === empresaDoContato[c.id]) || {}).nome } : null,
        negocios_abertos: abertos(c), ultimo_contato_em: ultimo(c), criado_em: criadoEm(c), optin_marketing: true }));
      return { itens, total: achados.length, total_aprox: null, pagina: pg, por_pagina: por, tem_mais: pg * por < achados.length };
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
    case "nx_cv_nota": return comReq(nome, p, () => {   // p_req (S-B13): Enter repetido não cria a nota duas vezes
      const c = conversaPorId(p.p_conversa); if (!c) throw new ErroDev("conversa_nao_encontrada");
      const texto = String(p.p_texto || "").trim();
      if (!texto || texto.length > 4096) throw new ErroDev("dados_invalidos", "texto");
      const m = { id: ++dev.seqMsg, direcao: "out", nota: true, corpo: texto, minutos: 0, criada: Date.now() };
      c.mensagens.push(m); bater();
      return mensagemDe(c, m);
    });
    case "nx_cv_marcar_lida": { const c = conversaPorId(p.p_conversa); if (c) { c.nao_lidas = 0; bater(); } return { ok: true }; }
    case "nx_contato_ver": { const c = contatos.find(x => String(x.id) === String(p.p_id)) || contatos[0]; return { contato: { ...c }, negocios: negocios.filter(n => n.contato_id === c.id), conversas: conversas.filter(v => v.contato_id === c.id).map(v => dataConv(v)), tarefas: [], notas: [] }; }
    // empresas: mesmo formato de nx_empresas_listar / nx_empresa_ver (20260928d_crm_b.sql) — contagens de contatos e de negócios abertos por empresa
    case "nx_empresas_listar": {
      const norm = s => String(s || "").normalize("NFD").replace(/[̀-ͯ]/g, "").toLowerCase();
      const q = norm(String((p.p_filtro && p.p_filtro.busca) || "").trim());
      const por = Math.max(1, Math.min(100, Number(p.p_por_pagina) || 50)), pg = Math.max(1, Number(p.p_pagina) || 1);
      const achadas = empresas.filter(e => !q || norm(`${e.nome} ${e.documento || ""} ${e.cidade || ""}`).includes(q)).sort((a, b) => norm(a.nome).localeCompare(norm(b.nome)) || a.id - b.id);
      const doContato = e => contatos.filter(c => empresaDoContato[c.id] === e.id);
      const abertoDe = n => (nomesEtapas.find(s => s.id === n.estagio_id) || {}).tipo === "aberto";
      return { itens: achadas.slice((pg - 1) * por, pg * por).map(e => ({ id: e.id, nome: e.nome, documento: e.documento, cidade: e.cidade, uf: e.uf, telefone: e.telefone, email: e.email, site: e.site, criado_em: e.criado_em,
        contatos: doContato(e).length, negocios_abertos: negocios.filter(n => empresaDoContato[n.contato_id] === e.id && abertoDe(n)).length })),
        total: achadas.length, pagina: pg, por_pagina: por, tem_mais: pg * por < achadas.length };
    }
    case "nx_empresa_ver": {
      const e = empresas.find(x => String(x.id) === String(p.p_id));
      if (!e) throw new ErroDev("empresa_nao_encontrada");
      const doContato = contatos.filter(c => empresaDoContato[c.id] === e.id);
      const cards = negocios.filter(n => empresaDoContato[n.contato_id] === e.id).map(n => {
        const s = nomesEtapas.find(x => x.id === n.estagio_id) || {};
        return { ...n, contato: { ...contatos.find(c => c.id === n.contato_id) }, funil_id: ID.funil, funil_nome: "Pacientes", estagio_nome: s.nome, estagio_cor: s.cor, estagio_tipo: s.tipo, status: s.tipo, valor: n.valor || null };
      }).sort((a, b) => (b.status === "aberto") - (a.status === "aberto"));
      return { empresa: { ...e, cliente_id: ID.cliente },
        contatos: doContato.map(c => ({ id: c.id, nome: c.nome, telefone: c.telefone, email: c.email, etiquetas: c.etiquetas, dono_id: null })), negocios: cards };
    }
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
        return { id: m.id, conversa_id: c.id, direcao: m.direcao, tipo: m.nota ? "nota" : m.tipo || "texto", wamid: `wamid.demo.${c.id}.${i}`, corpo: m.corpo,
          status: m.direcao === "in" ? "recebida" : "entregue", criado_em: em, atualizado_em: em, origem: m.direcao === "out" ? "painel" : null,
          enviado_por: m.direcao === "out" ? { id: ID.eu, nome: "Dra. Helena" } : null, referral: null, ...(m.midia ? { midia: m.midia } : {}),
          ...(m.client_ref ? { client_ref: m.client_ref } : {}) }; });
      return { itens, tem_mais: false, conversas: [{ id: c.id, protocolo: c.protocolo, aberta_em: when(c.minutos + 40), status: c.status, canal_id: c.canal_id }], agora: isoAgora(), ultimo_id: itens.at(-1)?.id || null }; }
    case "nx_cv_ia_estado": return iaEstadoDe(p.p_conversa);
    // pausar/devolver devolvem o estado COMPLETO (nx_cv_ia_json), como o banco; só em canal CodeWords
    case "nx_cv_ia_pausar": case "nx_cv_ia_devolver": {
      const c = conversaPorId(p.p_conversa); if (!c) throw new ErroDev("conversa_nao_encontrada");
      const horas = p.p_horas == null ? null : Number(p.p_horas);
      if (horas != null && !(Number.isInteger(horas) && horas >= 0 && horas <= 168)) throw new ErroDev("dados_invalidos", "horas");
      if ((canais.find(k => k.id === c.canal_id) || {}).provedor !== "codewords") throw new ErroDev("ia_indisponivel", "canal");
      // p_horas 0 = só manual (sem volta); null = volta no prazo do número (ia_volta_horas); N = volta em N horas
      if (nome === "nx_cv_ia_pausar") dev.iaPausada.set(String(c.id), { quem: "Dra. Helena", so_manual: horas === 0, ate: new Date(Date.now() + (horas || 6) * 3600e3).toISOString() });
      else dev.iaPausada.delete(String(c.id));
      bater();
      return iaEstadoDe(c.id);
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
      // o dia da consulta é o de São Paulo (como consulta_em no banco): 22:00 em SP ainda é hoje, mesmo gravada em UTC
      consultas: agendamentos.filter(a => { const d = spData(new Date(a.inicio)); return d >= de && d < ate; }).map(consultaDia), bloqueios: bloqueios.filter(b => b.inicio.slice(0,10) < ate && b.fim.slice(0,10) >= de) }; }
    // contrato 6: presença da consulta; «faltou» leva ao estágio de marco «faltou» do funil
    case "nx_agenda_presenca": {
      const n = negocios.find(x => String(x.id) === String(p.p_negocio));
      if (!n) throw new ErroDev("negocio_nao_encontrado");
      const estado = String(p.p_estado || "");
      if (!["compareceu", "faltou", "limpar"].includes(estado)) throw new ErroDev("dados_invalidos", "presença: compareceu, faltou ou limpar");
      n.campos = { ...(n.campos || {}) };
      if (estado === "limpar") delete n.campos.presenca; else n.campos.presenca = estado;
      const faltou = nomesEtapas.find(e => e.marco === "faltou");
      if (estado === "faltou" && faltou) n.estagio_id = faltou.id;
      bater();
      return { ok: true, presenca: n.campos.presenca || null, estagio_id: n.estagio_id };
    }
    case "nx_agenda_config_ver": return { config: { horario_fonte: "agenda", horario: horarioDefault, intervalos: [["12:00", "13:00"]], duracao_min: 30, capacidade: 1, antecedencia_horas: 2, dias_a_frente: 30, passo_min: 30,
      duracoes: { "Avaliação": 30, "Implante": 60, "Limpeza": 45 } }, bloqueios };
    case "nx_agenda_livres": return agendaLivres(p);
    case "nx_agenda_marcar": return comReq(nome, p, () => agendaMarcar(p));
    case "nx_agenda_desmarcar": return agendaDesmarcar(p);
    // chave de instalação do rastreio: 48 hex como a real; p_gerar troca (a antiga deixa de valer no nx_rastreio_registrar daqui)
    case "nx_entrada_chave": { if (p.p_gerar) dev.chave = chaveDev(++dev.seqChave); return { chave: dev.chave }; }
    case "nx_rastreio_registrar": return rastreioRegistrar(p);
    case "nx_rastreio_atribuir": return rastreioAtribuir(p);
    case "nx_rastreio_listar": return rastreioListar(p);
    case "nx_canal_historico_listar": {
      const canal = canalPorId(p.p_canal);
      if (!canal) throw new ErroDev("canal_nao_encontrado");
      const lim = Math.max(1, Math.min(200, Number(p.p_limite) || 50));
      return dev.historicoCanais.filter(x => x.canal_id === canal.id).sort((a, b) => b.id - a.id).slice(0, lim).map(x => ({ ...x }));
    }
    // o MESMO formato do banco (20260928b): uma LISTA, cada integração com os nomes das credenciais preenchidas (nunca os valores)
    case "nx_integracoes_status": return demoAds.integracoes.map(i => ({ ...i, preenchidos: i.canal === "meta" ? ["meta_access_token", "meta_ad_account_id"]
      : ["google_developer_token", "google_customer_id", "google_client_id", "google_client_secret", "google_refresh_token"] }));
    case "nx_automacao_execucoes": return execucoesDe(p.p_id).slice(0, Math.max(1, Math.min(200, Number(p.p_limite) || 50)));
    case "nx_automacao_execucoes_dia": return execucoesPorDia(p.p_automacao, p.p_dias);
    case "nx_ia_uso_dia": {
      const dias = Math.max(1, Math.min(90, Number(p.p_dias) || 14));
      return Array.from({ length: dias }, (_, i) => {
        const chamadas = (i * 5 + 3) % 9, tokens_in = chamadas * 5200, tokens_out = chamadas * 310;
        return { dia: somaDia(hoje, i - dias + 1), chamadas, tokens_in, tokens_out, custo_usd: Math.round((tokens_in * 4 + tokens_out * 20) / 1e6 * 1e4) / 1e4 };
      });
    }
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
    case "nx_clientes_admin": {
      const f = p.p_filtro || {}, norm = s => String(s || "").normalize("NFD").replace(/[̀-ͯ]/g, "").toLowerCase();
      return sessao().clientes.map(clienteAdminItem).filter(c => (!f.id || c.id === f.id) && (!f.status || c.status === f.status)
        && (!f.org_id || c.org.id === f.org_id) && (!f.busca || norm(`${c.nome} ${c.slug}`).includes(norm(f.busca))));
    }
    case "nx_usuarios_listar": return { itens: usuarios, total: usuarios.length };
    case "nx_config": return { codigo_gestor: null };
    // mesmo formato da RPC real (20261001b): plano, status, uso × limites, storage e (só revenda) a soma da agência
    case "nx_uso_plano": { const c = sessao().clientes[0]; return { plano: { id: "profissional", nome: "Profissional", preco_mensal: 497 }, status: c.status, teste_ate: c.teste_ate, modulos: c.modulos,
      uso: { usuarios: usuarios.length, canais: canais.length, funis: funis.length, automacoes: 4, contatos: contatos.length, ia_mes: 42 },
      limites: { usuarios: 5, canais: 2, funis: 3, automacoes: 8, contatos: 2000, ia_mes: 300 }, org: null, storage_mb: 12.4 }; }
    case "nx_relatorios": return { itens: [] };
    case "nx_dominio_status": return { ok: true };
    // como o real (nx_auto_item): o item volta com id e ativo, para a lista recontar «Ligadas de N»
    case "nx_automacao_ativar": return { id: p.p_id, ativo: !!p.p_ativo };
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
  if (nome === "nx-codewords" && p.acao === "receita") return { ok: true, url: "https://exemplo.invalid/functions/v1/nx-codewords?ch=DEMO", cabecalhos: {}, prompt: "PROMPT DE DEMONSTRAÇÃO (ambiente fictício local)\n\nVocê é a assistente da clínica. Converse, veja horários e agende.\nURL: https://exemplo.invalid/functions/v1/nx-codewords?ch=DEMO\n" + "Linha de exemplo do prompt.\n".repeat(30) };
  if (nome === "nx-codewords") {
    // «estado» (Reconferir agora) e as outras ações do painel: formato de estadoCanalCodeWords (codewords.js), com o aparelho no estado
    // simulado (simular/canal) e `canal` como nx_codewords_situacao devolve (nx_canal_json sem o webhook: contadores, aviso_em, histórico à parte)
    const k = canalPorId(p.canal) || canais[0], ligado = k.estado === "conectado";
    const { webhook, ...canal } = k;   // eslint-disable-line no-unused-vars
    return { ok: true, achado: true, conectado: ligado, numero_confere: true, estado: ligado ? "open" : "close", rota_atual: "fluxo", rota_esperada: "fluxo",
      inscrito_certo: ligado, rota: "fluxo", service_id: "cw-demo-fluxo",
      motivo: ligado ? "Ambiente fictício local — nenhuma chamada saiu do computador." : "Aparelho desconectado (simulação local: simular/canal?estado=conectado traz de volta).", canal };
  }
  if (nome === "nx-enviar") return p.acao === "texto" ? enviarTexto(p) : p.acao === "midia" ? enviarMidia(p) : { ok: true, app_inscrito: true, total: 1, numero: "+55 00 00000-0001" };
  if (nome === "nx-midia") return p.acao === "subir" ? subirMidia(p) : { ok: true, url: null };
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
  // mesmo formato de _compartilhado/ia_conversas.js (sugerir e resumir devolvem { ok, texto, acao })
  if (nome === "nx-ia") return { ok: true, texto: p.acao === "resumir" ? "Resumo fictício: a pessoa quer saber o preço e horários da avaliação." : "Resposta fictícia de demonstração. Revise antes de enviar.", acao: p.acao || "sugerir" };
  // nx-ciclo {cliente, dias:1} = «Testar conexão» (F6): mesmo formato de tratarCiclo ({ok, hoje, clientes:[{cliente, ok, sync, ...}]});
  // simular/integracao?canal=meta&erro=token|rede faz a plataforma falhar com a explicação de explicarErroIntegracao
  if (nome === "nx-ciclo") {
    const dias = Math.max(1, Math.min(28, Number(p.dias) || 7)), f = dev.integracaoFalha;
    const sync = { meta: "ok — 58 linhas", google: "ok — 31 linhas" };
    const cli = { cliente: "sorriso-vivo", ok: true, dias, sync, alertas_ativos: 1, alertas_novos: 0 };
    if (f) {
      const plat = f.canal === "google" ? "Google" : "Meta";
      const expl = f.erro === "rede" ? { curto: `o ${plat} não está respondendo`, acao: "Nada a fazer agora: a leitura tenta de novo na próxima hora.", passageiro: true }
        : { curto: `o ${plat} recusou o token de acesso`, acao: "Gere um token novo e salve em Ajustes → Integrações.", passageiro: false };
      sync[f.canal] = `erro — ${f.erro === "rede" ? "fetch failed" : `${plat} 401 token inválido`}`;
      Object.assign(cli, { ok: false, falhas: [{ canal: f.canal, ultimo_sync: demoAds.integracoes.find(x => x.canal === f.canal)?.ultimo_sync || null, ...expl }] });
    }
    return { ok: cli.ok, hoje, dias, clientes: [cli] };
  }
  return { ok: true, simulado: true };
}

/* «Site» de mentira para provar o rastreio de ponta a ponta sem sair do computador: carrega o web/rastreio.js de verdade com a chave desta
   empresa e data-url apontando para ESTE servidor; o link do WhatsApp recebe o [ref] no clique (com ?sem_navegar=1 o clique não sai da página). */
const SITE_TESTE = () => `<!doctype html>
<html lang="pt-BR"><head><meta charset="utf-8"><meta name="viewport" content="width=device-width, initial-scale=1"><link rel="icon" href="data:,">
<title>Site de teste · rastreio do Órbita (local)</title>
<style>:root{color-scheme:light dark}body{font:16px/1.5 system-ui,sans-serif;max-width:40rem;margin:2rem auto;padding:0 1rem}code{font-family:ui-monospace,monospace}a.wa{display:inline-block;padding:.75rem 1.25rem;border:2px solid currentColor;border-radius:999px;font-weight:700;min-height:44px;box-sizing:border-box}</style>
</head><body>
<h1>Site de teste (local)</h1>
<p>Abra com parâmetros, por exemplo <code>?utm_source=instagram&amp;utm_medium=paid_social&amp;utm_campaign=Avaliação humanizada</code>, passe o mouse no botão e clique.</p>
<p><a class="wa" id="wa" href="https://wa.me/5500000000001?text=Ol%C3%A1!%20Vim%20pelo%20site." target="_blank" rel="noopener">Falar no WhatsApp</a></p>
<p>Parâmetros guardados: <code id="dados">—</code><br>Código: <code id="codigo">—</code><br>Link final: <code id="link">—</code></p>
<script>
  document.getElementById("wa").addEventListener("click", e => { if (new URLSearchParams(location.search).get("sem_navegar") === "1") e.preventDefault(); });
  function mostrar() {
    var R = window.OrbitaRastreio; if (!R) return;
    document.getElementById("dados").textContent = JSON.stringify(R.dados());
    document.getElementById("link").textContent = document.getElementById("wa").getAttribute("href");
    R.codigo().then(function (c) { document.getElementById("codigo").textContent = c || "(sem código)"; mostrar2(); });
  }
  function mostrar2() { document.getElementById("link").textContent = document.getElementById("wa").getAttribute("href"); }
  window.addEventListener("load", mostrar);
  document.addEventListener("click", function () { setTimeout(mostrar2, 50); }, true);
</script>
<script src="/rastreio.js" data-chave="${dev.chave}" data-url="/rest/v1/rpc/nx_rastreio_registrar" data-apikey="dev-falso" defer></script>
</body></html>`;

// Boot do modo fictício: ARQUIVO (não inline) — o index.html traz a mesma CSP do Netlify em <meta>
// (script-src 'self'), então um <script> inline injetado seria bloqueado.
// Além do fetch, troca o destino do XMLHttpRequest (o upload de mídia usa XHR, pela barra de progresso): nada vai ao Supabase.
const BOOT = `(function(){if(location.hostname!=="127.0.0.1"&&location.hostname!=="localhost")return;var q=new URLSearchParams(location.search);try{if(q.has("login")){localStorage.removeItem("nx-token");location.hash="#/login";}else if(!localStorage.getItem("nx-token")){localStorage.setItem("nx-token","demo-local-session");}sessionStorage.setItem("nx-app-dev","1");}catch(e){}window.ORBITA_DEV_FALSO={origem:location.origin,rastreio:{script:location.origin+"/rastreio.js",url:location.origin+"/rest/v1/rpc/nx_rastreio_registrar",apikey:"dev-falso",site:location.origin+"/__dev_falso/site.html"}};var falso=function(h){return h==="dtjznipitihnwmcgpzqh.supabase.co"||h==="${HOST_UPLOAD}";};var original=window.fetch.bind(window);window.fetch=function(input,init){var u;try{u=new URL(typeof input==="string"?input:input.url,location.href);}catch(e){return original(input,init);}if(falso(u.hostname)){u=new URL("/__dev_falso"+u.pathname+u.search,location.origin);return original(u,init);}return original(input,init);};var abrir=XMLHttpRequest.prototype.open;XMLHttpRequest.prototype.open=function(){var a=Array.prototype.slice.call(arguments);try{var x=new URL(String(a[1]),location.href);if(falso(x.hostname))a[1]=new URL("/__dev_falso"+x.pathname+x.search,location.origin).href;}catch(e){}return abrir.apply(this,a);};})();`;

const dormir = ms => new Promise(r => setTimeout(r, ms));
const ROTAS_SEM_SESSAO = new Set(["nx_marca_publica", "nx_entrar", "nx_convite_ver", "nx_convite_aceitar", "nx_senha_redefinir"]);
/** Falha programada para a próxima chamada de uma RPC/função (ou de qualquer uma, com rpc=*).
    Ex.: simular/falha?rpc=nx-enviar&status=409&codigo=envio_em_andamento&vezes=2 → o nx-enviar responde duas vezes
    409 {ok:false, erro:"envio_em_andamento"} sem enviar (outro pedido com o mesmo client_ref ainda está enviando). */
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
    const cab = { "content-type": "application/json; charset=utf-8", "cache-control": "no-store", ...CORS };
    if (f.retryAfter) cab["retry-after"] = String(f.retryAfter);
    res.writeHead(f.status, cab);
    // Edge Function responde {ok:false, erro}; RPC responde {message, hint} (PostgREST)
    const c = f.codigo ? (tipo === "fn" ? { ok: false, erro: f.codigo, ...(f.hint ? { detalhe: f.hint } : {}) } : { code: "P0001", message: f.codigo, hint: f.hint || null, details: null }) : CORPO_FALHA[f.status] || null;
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
      // hint: texto que o PostgREST devolveria em `hint` (ex.: muitas_tentativas com os minutos de bloqueio)
      dev.falhas.push({ rpc: q.get("rpc") || "*", status: n("status") || 0, restam: n("vezes") || 1, atraso: n("atraso") || 0, depois: q.get("depois") === "1",
        codigo: q.get("codigo") || null, hint: q.get("hint") || null, retryAfter: n("retryAfter") || 0 });
      return { ok: true, falhas: dev.falhas.length };
    }
    // número caiu/voltou (contrato 3): histórico + notificação canal_caiu/canal_voltou; nx_inicio.canais e nx_cv_base.canais refletem
    case "canal": {
      const canal = canalPorId(q.get("id") || ID.canal);
      if (!canal) return { ok: false, erro: "canal_nao_encontrado" };
      canalEstado(canal, q.get("estado") || "desconectado", q.get("detalhe"));
      return { ok: true, canal: { id: canal.id, estado: canal.estado, desde: canal.estado_desde }, notificacoes: naoLidasNotif() };
    }
    // rastreio: ?chave=0 apaga a chave (tela «Gerar chave»), ?chave=1 restaura; ?limpar=1 descarta os cliques registrados ao vivo
    case "rastreio": {
      if (q.get("chave") === "0") dev.chave = null;
      if (q.get("chave") === "1" && !dev.chave) dev.chave = chaveDev(++dev.seqChave);
      if (q.get("limpar") === "1") dev.rastreio = dev.rastreio.filter(r => r.semente);
      return { ok: true, chave: !!dev.chave, cliques: dev.rastreio.length };
    }
    // cliente pausado pela Nexus (contrato 9): ?ativo=0 derruba o interruptor; com &super=0 a conta deixa de ser super e nx_app_sessao recusa
    case "cliente": {
      if (q.has("ativo")) dev.cliente.ativo = q.get("ativo") !== "0";
      if (q.has("super")) dev.cliente.super = q.get("super") !== "0";
      return { ok: true, cliente: { ...dev.cliente } };
    }
    // versão do banco anunciada em nx_app_sessao.migracao (vazio = a última migração do repositório)
    case "migracao": dev.migracao = q.get("nome") || null; return { ok: true, migracao: ultimaMigracao() };
    // integração de anúncios com falha no «Testar conexão» (nx-ciclo): ?canal=meta|google&erro=token|rede; sem parâmetros limpa
    case "integracao": {
      const canal = q.get("canal");
      dev.integracaoFalha = ["meta", "google"].includes(canal) ? { canal, erro: q.get("erro") === "rede" ? "rede" : "token" } : null;
      return { ok: true, integracao: dev.integracaoFalha };
    }
    case "sessao-invalida": dev.tokens.clear(); dev.verificarToken = true; dev.proximaContaOutra = q.get("outra") === "1"; return { ok: true };
    case "sessao-valida": dev.verificarToken = false; return { ok: true };
    case "mensagem": return { ok: true, mensagem: simularEntrada(q.get("conversa") || 901, q.get("texto")) };
    case "onboarding": onboardingDefinir(q.get("modo") || "parcial"); return { ok: true, estado: onboardingEstado() };
    case "versao": dev.versao = q.get("v") || null; return { ok: true, versao: dev.versao };
    case "marca": {
      if (!q.get("produto") && q.get("logo") !== "1" && !["primaria", "secundaria", "fundo"].some(k => q.has(k))) { dev.marca = null; return { ok: true, marca: null }; }
      const logo = q.get("logo") === "1" ? `data:image/png;base64,${readFileSync(resolve(ROOT, "app/icones/icon-192.png")).toString("base64")}` : undefined;
      const cores = Object.fromEntries(["primaria", "secundaria", "fundo"].flatMap(k => {
        const v = q.get(k);
        return v && /^#[0-9a-f]{6}$/i.test(v) ? [[k, v.toUpperCase()]] : [];
      }));
      dev.marca = { ...(q.get("produto") ? { produto: q.get("produto") } : {}), ...(Object.keys(cores).length ? { cores } : {}), ...(logo ? { logo, logo_claro: logo, favicon: logo } : {}) };
      return { ok: true, marca: Object.keys(dev.marca) };
    }
    case "clientes": dev.empresas = Math.max(1, Math.min(2, Number(q.get("n")) || 1)); return { ok: true, empresas: dev.empresas };
    case "teste": dev.teste = q.get("status") || q.get("dias") ? { status: q.get("status") || "teste", dias: q.get("dias") === "nenhum" ? null : Number(q.get("dias") ?? 14) } : null; return { ok: true, teste: dev.teste };
    case "vertical": dev.vertical = ["odonto", "oficina", "loja", "generico"].includes(q.get("v")) ? q.get("v") : null; return { ok: true, vertical: dev.vertical };
    case "zerar": dev.chamadas = {}; dev.falhas = []; dev.enviosExternos = 0; dev.reqs.clear(); dev.refs.clear(); dev.arquivos.clear(); dev.integracaoFalha = null; return { ok: true };
    default: return { ok: false, erro: "acao_desconhecida" };
  }
}
const estadoDev = () => ({ chamadas: dev.chamadas, enviosExternos: dev.enviosExternos, pulsoV: dev.pulsoV, falhas: dev.falhas.length, tokensValidos: dev.tokens.size,
  verificarToken: dev.verificarToken, onboarding: onboardingEstado(), versao: dev.versao || null, uploads: dev.arquivos.size,
  mensagens: conversas.map(c => ({ id: c.id, status: c.status, nao_lidas: c.nao_lidas, total: c.mensagens.length })), tarefas: tarefas.length, negocios: negocios.length, contatos: contatos.length,
  rastreio: { cliques: dev.rastreio.length, casados: dev.rastreio.filter(r => r.resultado && r.resultado.aplicado).length, pendentes: dev.rastreio.filter(r => r.pendente).length, chave: !!dev.chave },
  notificacoes: { total: dev.notificacoes.length, nao_lidas: naoLidasNotif() }, canais: canais.map(k => ({ id: k.id, estado: k.estado })),
  cliente: { ...dev.cliente }, migracao: ultimaMigracao(), integracaoFalha: dev.integracaoFalha });
// CORS: o script do site roda em OUTRA origem (o site da clínica) e manda o cabeçalho apikey — o preflight precisa passar aqui também
const CORS = { "access-control-allow-origin": "*", "access-control-allow-headers": "apikey, authorization, content-type, prefer, x-client-info", "access-control-allow-methods": "GET, POST, OPTIONS" };

const servidor = http.createServer(async (req, res) => {
  const url = new URL(req.url || "/", `http://${HOST}:${PORT}`);
  const json = (status, body) => { res.writeHead(status, { "content-type": "application/json; charset=utf-8", "cache-control": "no-store", "x-content-type-options": "nosniff", ...CORS }); res.end(JSON.stringify(body)); };
  if (url.pathname === "/__dev_falso/estado") return json(200, estadoDev());
  if (url.pathname.startsWith("/__dev_falso/simular/")) return json(200, simular(url.pathname.split("/").at(-1), url.searchParams));
  if (url.pathname === "/app/versao.json" && dev.versao) return json(200, { versao: dev.versao });
  if (req.method === "OPTIONS") { res.writeHead(204, { "cache-control": "no-store", ...CORS }); return res.end(); }
  if (url.pathname === "/__dev_falso/boot.js") {
    res.writeHead(200, { "content-type": "text/javascript; charset=utf-8", "cache-control": "no-store", "x-content-type-options": "nosniff" });
    return res.end(BOOT);
  }
  if (url.pathname === "/__dev_falso/site.html") {
    res.writeHead(200, { "content-type": "text/html; charset=utf-8", "cache-control": "no-store", "x-content-type-options": "nosniff" });
    return res.end(SITE_TESTE());
  }
  // as RPCs e funções também SEM o prefixo (/rest/v1/rpc/…, /functions/v1/…): é o endereço que o snippet do rastreio e o
  // site de teste usam — o que o navegador manda para cá nunca chega ao Supabase
  const rota = url.pathname.replace(/^\/__dev_falso(?=\/)/, "");
  if (req.method === "PUT" && url.pathname.startsWith(ROTA_UPLOAD)) {
    // upload fictício da mídia: conta os bytes e descarta (nada vai para o disco); só aceita o caminho que o "subir" devolveu
    let path = ""; try { path = decodeURIComponent(url.pathname.slice(ROTA_UPLOAD.length)); } catch { /* fica inválido */ }
    let tamanho = 0; for await (const parte of req) tamanho += parte.length;
    if (!pathDoCliente(path, ID.cliente, "out")) return json(400, { message: "caminho_invalido" });
    if (!tamanho || tamanho > 16 * 1024 * 1024) return json(tamanho ? 413 : 400, { message: tamanho ? "arquivo_grande" : "arquivo_vazio" });
    dev.arquivos.set(path, { tamanho, mime: String(req.headers["content-type"] || "") });
    return json(200, { Key: `nx-midia/${path}` });
  }
  if (rota.startsWith("/rest/v1/rpc/")) {
    const name = rota.split("/").at(-1);
    let raw = ""; for await (const chunk of req) raw += chunk;
    let body = {}; try { body = raw ? JSON.parse(raw) : {}; } catch { return json(400, { message: "dados_invalidos" }); }
    return atender("rpc", name, body, json, res);
  }
  if (rota.startsWith("/functions/v1/")) {
    const name = rota.split("/").at(-1);
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
    if (caminho === "/app/index.html" && url.searchParams.get("dev-falso") === "1" && url.searchParams.get("boot") !== "0") {
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
