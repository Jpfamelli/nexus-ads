/* ============================================================
   ÓRBITA — admin.js · frente F3 · ESPEC T15 (§7.7), §5.2
   #/admin/clientes (lista, criar), #/admin/clientes/<id> (plano,
   status, teste, módulos, limites extras, uso, usuários, convite do
   administrador, Entrar). P0-B: #/admin/revendas, #/admin/planos,
   #/admin/dominios (super / gestor), atrás de pronto('admin_revendas').
   Só gestor (revenda) e super (plataforma) chegam aqui (rotas.js).
   ============================================================ */

const STATUS = [
  { valor: "ativo", rotulo: "Ativo", cor: "ok" },
  { valor: "teste", rotulo: "Em teste", cor: "info" },
  { valor: "suspenso", rotulo: "Suspenso", cor: "aten" },
  { valor: "cancelado", rotulo: "Cancelado", cor: "ruim" },
];
const MODULOS = [
  { valor: "crm", rotulo: "CRM" }, { valor: "conversas", rotulo: "Conversas" }, { valor: "relatorios", rotulo: "Relatórios" },
  { valor: "ads", rotulo: "Anúncios" }, { valor: "automacoes", rotulo: "Automações" }, { valor: "marca", rotulo: "Marca própria" },
];
const CHAVES_LIMITE = [
  { chave: "usuarios", rotulo: "Usuários" }, { chave: "canais", rotulo: "Números de WhatsApp" }, { chave: "funis", rotulo: "Funis" },
  { chave: "automacoes", rotulo: "Automações" }, { chave: "contatos", rotulo: "Contatos" }, { chave: "ia_mes", rotulo: "Sugestões de IA por mês", curto: "IA no mês" },
];
const VERTICAIS = [
  { valor: "odonto", rotulo: "Clínica odontológica" }, { valor: "oficina", rotulo: "Oficina mecânica" },
  { valor: "loja", rotulo: "Loja" }, { valor: "generico", rotulo: "Outro negócio" },
];

/** Pacotes comerciais Nexus. O plano de acesso ao Órbita continua sendo uma decisão técnica separada. */
export const PACOTES_COMERCIAIS = Object.freeze([
  Object.freeze({ id: "essencial", nome: "PLANO ESSENCIAL", mensalCentavos: 129478, integracaoCentavos: 88945,
    acesso: "essencial", itens: Object.freeze(["Site profissional", "5 a 10 posts por mês", "1 diária de gravação por mês", "Edição de vídeo", "Sistema de atendimento"]) }),
  Object.freeze({ id: "profissional", nome: "PLANO PROFISSIONAL", mensalCentavos: 187253, integracaoCentavos: 119289,
    acesso: "profissional", itens: Object.freeze(["Tudo do Essencial", "IA no atendimento", "10 a 15 posts por mês", "Sistema de atendimento e CRM", "Gestão de tráfego pago"]) }),
  Object.freeze({ id: "ultra", nome: "PLANO ULTRA", mensalCentavos: 228734, integracaoCentavos: 134457,
    acesso: "completo", itens: Object.freeze(["Tudo do Profissional", "15 a 20 posts por mês", "Edição completa de conteúdos", "CRM e IA no atendimento", "Sistema de atendimento", "Gestão de tráfego pago e sistema de gestão", "Mais 1 sistema completo à sua escolha"]) }),
]);

/** O formulário aceita qualquer segmento; só os modelos já existentes são reconhecidos automaticamente. */
export function verticalPorSegmento(segmento) {
  const s = String(segmento || "").normalize("NFD").replace(/[\u0300-\u036f]/g, "").toLowerCase();
  if (/odont|dentist|dent[aá]ria/.test(s)) return "odonto";
  if (/oficina|mecanic|autopeca|automot/.test(s)) return "oficina";
  if (/\bloja\b|varejo|comercio|e-commerce/.test(s)) return "loja";
  return "generico";
}

function campoPacoteComercial(ui, selecionado = null, { obrigatorio = false, comercial = null } = {}) {
  const h = ui.h;
  const radios = PACOTES_COMERCIAIS.map(p => {
    const salvo = comercial && comercial.pacote === p.id ? comercial : null;
    const mensal = Number.isInteger(salvo && salvo.mensal_centavos) ? salvo.mensal_centavos : p.mensalCentavos;
    const integracao = Number.isInteger(salvo && salvo.integracao_centavos) ? salvo.integracao_centavos : p.integracaoCentavos;
    const radio = h("input", { type: "radio", name: "pacote_comercial", value: p.id, checked: selecionado === p.id, required: !!obrigatorio });
    return h("label", { class: "oferta-card" }, radio,
      h("span", { class: "oferta-conteudo" },
        h("span", { class: "oferta-cab" }, h("b", null, p.nome), h("span", { class: "oferta-preco" }, `${ui.brl(mensal / 100)}/mês`)),
        h("span", { class: "oferta-integracao" }, `${ui.brl(integracao / 100)} de integração · valor único`),
        h("span", { class: "oferta-inclusoes-tit" }, "Inclui"),
        h("span", { class: "oferta-inclusoes" }, p.itens.map(item => h("span", null, item)))));
  });
  const erro = h("small", { class: "campo-erro", hidden: true });
  return h("fieldset", { class: "campo campo-ofertas", dataset: { campo: "pacote_comercial" } },
    h("legend", null, "Plano comercial", obrigatorio ? h("span", { class: "obrig", "aria-hidden": "true" }, " *") : null),
    h("div", { class: "ofertas-grade", role: "radiogroup", "aria-label": "Escolha um plano comercial" }, radios),
    h("small", { class: "campo-ajuda" }, "O pacote registra o escopo contratado. O acesso aos recursos do Órbita segue a configuração técnica da empresa."), erro);
}

const comClasse = (el, cls) => { el.classList.add(cls); return el; };
function rotuloPacote(id) { return PACOTES_COMERCIAIS.find(p => p.id === id)?.nome || "Sem pacote comercial"; }

/** plano 1000 · AS-155: o endereço da lista com os filtros (?busca=&status=&org=) — sobrevive a abrir um cliente e voltar. */
export function hashClientes(filtro = {}) {
  const q = new URLSearchParams();
  if (filtro.busca) q.set("busca", filtro.busca);
  if (filtro.status) q.set("status", filtro.status);
  if (filtro.org_id) q.set("org", filtro.org_id);
  const t = q.toString();
  return t ? `#/admin/clientes?${t}` : "#/admin/clientes";
}

/** plano 1000 · AS-168: o nome do modelo que o segmento escrito vai aplicar («Clínica odontológica», «Outro negócio»…). */
export function rotuloModeloSegmento(segmento) {
  const v = verticalPorSegmento(segmento);
  return (VERTICAIS.find(x => x.valor === v) || { rotulo: "Outro negócio" }).rotulo;
}

/** Edição do cliente: o modelo (vertical) só é recalculado quando o segmento MUDOU — salvar outros dados não desfaz o modelo escolhido. */
export function verticalAoEditar(segmento, segmentoInicial, verticalAtual) {
  const norm = s => String(s || "").trim().replace(/\s+/g, " ").toLowerCase();
  if (!norm(segmento) || norm(segmento) === norm(segmentoInicial)) return verticalAtual;
  return verticalPorSegmento(segmento);
}

/**
 * plano 1000 · AS-161: trocar o plano não zera os módulos ligados à mão. Mantém os marcados que ainda valem (no plano novo; para a
 * plataforma, também os extras que ela ligou fora do plano antigo) e diz quais saíram.
 */
export function modulosAoTrocarPlano({ atuais = [], planoAntigo = [], planoNovo = [], superConta = false } = {}) {
  const novo = new Set(planoNovo);
  const marcados = new Set(planoNovo);
  for (const m of atuais) {
    const extra = !planoAntigo.includes(m);
    if (novo.has(m) || (superConta && extra)) marcados.add(m);
  }
  const lista = MODULOS.map(m => m.valor).filter(v => marcados.has(v));
  const sairam = atuais.filter(m => !marcados.has(m));
  return { marcados: lista, sairam };
}

/** plano 1000b · UB-116: teto de espera pela config.css antes do 1º desenho (o mesmo ESPERA_CSS_MS do config.js). */
export const ESPERA_CSS_MS = 1500;
/** plano 1000b · UB-201: validade do convite do administrador — as mesmas opções do convite em Usuários (config.js), padrão 3 dias. */
export const DIAS_CONVITE_ADMIN = "3";
const OPCOES_VALIDADE_CONVITE = [["1", "1 dia"], ["3", "3 dias"], ["7", "7 dias"], ["14", "14 dias"], ["30", "30 dias (menos seguro)"]].map(([valor, rotulo]) => ({ valor, rotulo }));
/** plano 1000b · UB-225: linhas da lista de clientes por vez («Mostrar mais» acrescenta outras tantas). */
export const POR_PAGINA_CLIENTES = 50;
let _ultimoHashClientes = "#/admin/clientes";
let _planos = null;
let _orgs = null;
let _limpeza = [];

export function desmontar() { for (const f of _limpeza) try { f(); } catch { /* ok */ } _limpeza = []; }

function statusDe(v) { return STATUS.find(s => s.valor === v) || { rotulo: v, cor: "neutra" }; }
export function sugerirSlug(nome) {
  return String(nome || "").normalize("NFD").replace(/[̀-ͯ]/g, "").toLowerCase()
    .replace(/[^a-z0-9]+/g, "-").replace(/^-+|-+$/g, "").slice(0, 40).replace(/-+$/g, "");
}

async function planos(ctx) { if (!_planos) _planos = await ctx.api.rpc("nx_planos_listar"); return _planos; }
async function orgs(ctx) { if (!_orgs) _orgs = await ctx.api.rpc("nx_orgs_listar"); return _orgs; }

/** Cliente usando 80 % ou mais de algum limite do plano. */
export const pertoDoLimite = it => { const u = (it && it.uso) || {}, lim = (it && it.limites) || {}; return Object.keys(lim).some(k => Number(lim[k]) > 0 && (Number(u[k]) || 0) / Number(lim[k]) >= .8); };

/** Resumo da lista de clientes (item 58): por situação e quantos estão perto de algum limite (≥ 80 %).
    plano 1000 · AS-164: «ativo» só conta quem não está pausado pela Nexus (ativo === false vira «pausados», à parte). */
export function resumoClientes(itens) {
  const l = Array.isArray(itens) ? itens : [];
  const r = { total: l.length, ativo: 0, teste: 0, suspenso: 0, cancelado: 0, perto_limite: 0 };
  for (const it of l) {
    if (it && it.ativo === false) r.pausados = (r.pausados || 0) + 1;     // só aparece quando há pausado
    if (it && Object.hasOwn(r, it.status) && it.status !== "total" && !(it.status === "ativo" && it.ativo === false)) r[it.status]++;
    if (pertoDoLimite(it)) r.perto_limite++;
  }
  return r;
}

/** plano 1000 · AS-165: filtro local dos KPIs que não são uma situação («perto» do limite, «pausados»).
    `status` = a situação filtrada no servidor: «ativo» segue a régua do contador (resumoClientes) — pausado pela Nexus não é «Ativo». */
export function filtrarLocal(itens, local, status = "") {
  let l = Array.isArray(itens) ? itens : [];
  if (status === "ativo") l = l.filter(it => !(it && it.ativo === false));
  if (local === "perto") return l.filter(pertoDoLimite);
  if (local === "pausados") return l.filter(it => it && it.ativo === false);
  return l;
}

/** plano 1000 · AS-158: dias desde o fim do teste (só status «teste» com a data já passada); null quando não venceu. hoje = AAAA-MM-DD. */
export function testeVencidoHa(it, hoje) {
  if (!it || it.status !== "teste" || !it.teste_ate || !hoje || String(it.teste_ate) >= String(hoje)) return null;
  const d = (Date.parse(`${hoje}T12:00:00Z`) - Date.parse(`${String(it.teste_ate).slice(0, 10)}T12:00:00Z`)) / 86400000;
  return Number.isFinite(d) ? Math.max(1, Math.round(d)) : null;
}
export const rotuloTesteVencido = dias => (dias === 1 ? "Teste vencido há 1 dia" : `Teste vencido há ${dias} dias`);

/** plano 1000 · AS-166: CSV da lista de clientes (separador «;» e BOM para o Excel em português). */
export function csvClientes(itens, nomeDoPlano = id => id) {
  // plano 1000b · UB-103: valor que começa com = + - @ (ou tab/CR) vira fórmula no Excel — sai com apóstrofo na frente (texto puro)
  const esc = v => { let s = v === null || v === undefined ? "" : String(v); if (/^[=+\-@\t\r]/.test(s)) s = `'${s}`; return /[;"\n\r]/.test(s) ? `"${s.replace(/"/g, '""')}"` : s; };
  const cab = ["Cliente", "Endereço", "Revenda", "Plano", "Pacote comercial", "Situação", "Pausado pela Nexus", "Fim do teste", "Criado em",
    ...CHAVES_LIMITE.flatMap(k => [`${k.rotulo} (uso)`, `${k.rotulo} (limite)`])];
  const linhas = (Array.isArray(itens) ? itens : []).map(it => [it.nome, it.slug, it.org ? it.org.nome : "", nomeDoPlano(it.plano),
    it.comercial && it.comercial.pacote ? rotuloPacote(it.comercial.pacote) : "", statusDe(it.status).rotulo, it.ativo === false ? "sim" : "não",
    it.teste_ate || "", String(it.criado_em || "").slice(0, 10),
    ...CHAVES_LIMITE.flatMap(k => [it.uso && it.uso[k.chave] != null ? it.uso[k.chave] : "", it.limites && it.limites[k.chave] != null ? it.limites[k.chave] : "sem limite"])]);
  return "\uFEFF" + [cab, ...linhas].map(l => l.map(esc).join(";")).join("\r\n");
}

/** plano 1000 · AS-169: o endereço digitado já é de outro cliente? (a busca do servidor acha por trecho; aqui só o slug idêntico). */
export function slugTomado(itens, slug, idProprio = null) {
  const s = String(slug || "").trim().toLowerCase();
  if (!s) return null;
  return (Array.isArray(itens) ? itens : []).find(it => it && it.id !== idProprio && String(it.slug || "").toLowerCase() === s) || null;
}

/** plano 1000 · AS-171: domínios por situação e busca (endereço, cliente ou revenda; sem acento). */
export function filtrarDominios(lista, { status = "", busca = "" } = {}) {
  const n = s => String(s || "").normalize("NFD").replace(/[\u0300-\u036f]/g, "").toLowerCase();
  const q = n(busca).trim();
  return (Array.isArray(lista) ? lista : []).filter(d => (!status || d.status === status)
    && (!q || n(`${d.host} ${d.cliente ? d.cliente.nome : ""} ${d.org ? d.org.nome : ""}`).includes(q)));
}

/** plano 1000 · AS-248: o «Entrar» guarda de onde veio (o detalhe do cliente) para o «Sair» da faixa de suporte voltar para lá. */
export const CHAVE_VOLTA_ADMIN = "nx-admin-volta";
export function lembrarVoltaAdmin(hash, armazenamento = globalThis.sessionStorage) {
  try { if (armazenamento && /^#\/admin\//.test(String(hash || ""))) { armazenamento.setItem(CHAVE_VOLTA_ADMIN, String(hash)); return true; } } catch { /* sem storage */ }
  return false;
}

/** nx_saude (só plataforma) → {ok, problemas[], pausaGeral, clientesPausados} para o cartão do Admin; null quando a resposta não é a esperada. */
export function resumoSaude(r) {
  if (!r || typeof r !== "object" || !Array.isArray(r.problemas)) return null;
  return { ok: !r.problemas.length, problemas: r.problemas.map(String).slice(0, 12), pausaGeral: r.envios_pausados === true,
    clientesPausados: Math.max(0, Number(r.clientes_pausados) || 0), em: r.em || null };
}
const semFuncao = e => /pgrst202|could not find the function|http_404|funcao_invalida/i.test(String((e && (e.codigo || e.message)) || ""));

/* ------------------------------------------------------------ plano 100 (frente G): uso de IA por dia, números, pacote, convite */

/**
 * nx_ia_uso_dia → [{dia, chamadas, tokens_in, tokens_out, custo_usd}] (mais antigo primeiro). Resumo para o Admin: totais, as séries
 * do sparkline e `custoIncompleto` (dia com chamada e custo zero = chamada registrada antes do custo existir; o total fica por baixo).
 * null quando a resposta não é a série (banco antigo).
 */
export function resumoUsoIA(lista) {
  if (!Array.isArray(lista) || !lista.length) return null;
  const linhas = [];
  for (const x of lista) {
    if (!x || !/^\d{4}-\d{2}-\d{2}$/.test(String(x.dia || ""))) return null;
    const n = v => Math.max(0, Number(v) || 0);
    linhas.push({ dia: x.dia, chamadas: Math.floor(n(x.chamadas)), tokens_in: Math.floor(n(x.tokens_in)), tokens_out: Math.floor(n(x.tokens_out)), custo_usd: n(x.custo_usd) });
  }
  linhas.sort((a, b) => (a.dia < b.dia ? -1 : a.dia > b.dia ? 1 : 0));
  const soma = k => linhas.reduce((s, x) => s + x[k], 0);
  return { dias: linhas.length, linhas, chamadas: soma("chamadas"), tokens_in: soma("tokens_in"), tokens_out: soma("tokens_out"),
    custo_usd: Math.round(soma("custo_usd") * 1e4) / 1e4, serieChamadas: linhas.map(x => x.chamadas), serieCusto: linhas.map(x => x.custo_usd),
    custoIncompleto: linhas.some(x => x.chamadas > 0 && !(x.custo_usd > 0)) };
}

/** US$ com 2 casas (4 abaixo de 1 dólar: o custo por dia de IA costuma ser de centavos). */
export function dolar(v) {
  const n = Number(v) || 0;
  return `US$ ${n.toLocaleString("pt-BR", { minimumFractionDigits: 2, maximumFractionDigits: n > 0 && n < 1 ? 4 : 2 })}`;
}

/**
 * Situação dos números de WhatsApp de um cliente (G10): `canais` do nx_clientes_admin quando vier; null quando o servidor não manda
 * (a coluna some). → {total, conectados, caidos, rotulo, tom}.
 */
export function estadoNumerosCliente(canais) {
  if (!Array.isArray(canais)) return null;
  const total = canais.length;
  const conectados = canais.filter(c => c && c.estado === "conectado").length;
  const caidos = canais.filter(c => c && c.estado === "desconectado").length;
  if (!total) return { total, conectados, caidos, rotulo: "Sem número", tom: "neutra" };
  if (caidos) return { total, conectados, caidos, rotulo: caidos === 1 ? "1 desconectado" : `${caidos} desconectados`, tom: "ruim" };
  if (conectados === total) return { total, conectados, caidos, rotulo: total === 1 ? "Conectado" : `${total} conectados`, tom: "ok" };
  return { total, conectados, caidos, rotulo: "Sem confirmação", tom: "neutra" };
}

/** Cliente sem pacote comercial registrado (criado pelo painel clássico ou antes das ofertas): pílula «Sem pacote» e aviso para completar. */
export const semPacote = it => !!it && !(it.comercial && it.comercial.pacote);

/** O app pode ser servido deste host? (Netlify ou domínio próprio sim; GitHub Pages, localhost e .test/.localhost não.) */
export function hostServeApp(host) {
  const x = String(host || "").toLowerCase();
  if (/\.netlify\.app$/.test(x)) return true;
  return x.includes(".") && !/(^|\.)github\.io$/.test(x) && !/^(localhost|127\.0\.0\.1|\[::1\])$/.test(x) && !/\.(localhost|test)$/.test(x);
}

/**
 * Link de convite seguro (H305): o servidor manda absoluto quando tem o endereço do Órbita (saas_url/domínio); relativo («#/convite/…»)
 * vira absoluto com o endereço desta tela SÓ se ela estiver num host que serve o app. Senão → {link:null, motivo}: o link sairia quebrado.
 */
export function linkConvite(link, loc) {
  const l = String(link || "");
  if (/^https?:\/\//i.test(l)) return { link: l, motivo: null };
  if (!l.startsWith("#")) return { link: null, motivo: "O servidor não devolveu um link de convite válido." };
  const host = loc && loc.hostname;
  if (!hostServeApp(host)) return { link: null,
    motivo: `Esta tela está aberta em ${host || "um endereço local"}, que não abre o Órbita para o cliente, e a plataforma ainda não tem o «Endereço do Órbita» cadastrado: o link sairia quebrado. Abra o Admin pelo endereço oficial (ou cadastre o endereço do Órbita) e gere o convite de novo — este expira sozinho.` };
  return { link: new URL("./", loc.href).href.split("#")[0] + l, motivo: null };
}

const SVG_NS = "http://www.w3.org/2000/svg";
function svgEl(tag, attrs = {}, texto = null) {
  const el = document.createElementNS(SVG_NS, tag);
  for (const [k, v] of Object.entries(attrs)) if (v !== null && v !== undefined) el.setAttribute(k, String(v));
  if (texto !== null) el.appendChild(document.createTextNode(String(texto)));
  return el;
}

/** Anel de uso (role=meter): uso ÷ limite, com cor por faixa; sem limite mostra só o número. Usado no uso de IA do cliente. */
export function anelUso(ui, { uso, limite, rotulo = "Uso" } = {}) {
  const h = ui.h;
  const u = Math.max(0, Number(uso) || 0);
  const semLimite = limite === null || limite === undefined || !(Number(limite) > 0);
  const p = semLimite ? 0 : Math.min(100, Math.round((u / Number(limite)) * 100));
  const r = 44, C = 2 * Math.PI * r;
  const nivel = semLimite ? "neutra" : p >= 100 ? "ruim" : p >= 80 ? "aten" : "ok";
  const txt = semLimite ? `${ui.num(u)} · sem limite` : `${ui.num(u)} de ${ui.num(limite)} (${p}%)`;
  const svg = svgEl("svg", { class: `adm-anel adm-anel-${nivel}`, viewBox: "0 0 112 112", role: "meter", "aria-valuemin": "0",
    "aria-valuemax": String(semLimite ? Math.max(u, 1) : Number(limite)), "aria-valuenow": String(u), "aria-label": rotulo, "aria-valuetext": txt });
  svg.appendChild(svgEl("circle", { class: "adm-anel-trilho", cx: 56, cy: 56, r, fill: "none", "stroke-width": 10 }));
  svg.appendChild(svgEl("circle", { class: "adm-anel-arco", cx: 56, cy: 56, r, fill: "none", "stroke-width": 10, "stroke-linecap": "round",
    "stroke-dasharray": C.toFixed(1), "stroke-dashoffset": (C * (1 - (semLimite ? 1 : p / 100))).toFixed(1), transform: "rotate(-90 56 56)" }));
  svg.appendChild(svgEl("text", { class: "adm-anel-num", x: 56, y: 53, "text-anchor": "middle" }, semLimite ? ui.num(u) : `${p}%`));
  svg.appendChild(svgEl("text", { class: "adm-anel-sub", x: 56, y: 71, "text-anchor": "middle" }, semLimite ? "sem limite" : "do limite"));
  return h("div", { class: "adm-anel-caixa" }, svg, h("div", { class: "adm-anel-txt" }, h("b", null, rotulo), h("span", null, txt)));
}

export async function montar(ctx) {
  desmontar();
  _planos = null; _orgs = null;
  const aba = ctx.rota.partes[0] || "clientes";
  const id = ctx.rota.partes[1] || null;
  const { ui } = ctx;
  const h = ui.h;
  // plano 1000b · UB-116: a folha config.css chega ANTES do 1º desenho (sem o salto de layout da lista), com o mesmo teto do config.js
  const css = Promise.resolve(typeof ui.carregarCss === "function" ? ui.carregarCss("config") : true).catch(() => false);
  let relogioCss = null;
  await Promise.race([css, new Promise(r => { relogioCss = setTimeout(r, ESPERA_CSS_MS); })]).finally(() => clearTimeout(relogioCss));
  const superConta = !!ctx.sessao.conta.super;
  const extras = ctx.pronto("admin_revendas");
  const abas = [
    { id: "clientes", rotulo: "Clientes", icone: "empresa" },
    ...(extras && superConta ? [{ id: "revendas", rotulo: "Revendas", icone: "camadas" }, { id: "planos", rotulo: "Planos", icone: "cartao" }] : []),
    ...(extras ? [{ id: "dominios", rotulo: "Domínios", icone: "globo" }] : []),
  ];
  if (!abas.some(a => a.id === aba)) { ctx.navegar("#/admin/clientes", { substituir: true }); return; }

  const nav = ui.abas({ itens: abas, ativo: aba, rotulo: "Áreas do Admin", aoMudar: a => ctx.navegar(`#/admin/${a}`) });
  const corpo = h("div", { class: "pilha" });
  ui.limpar(ctx.alvo);
  if (id) {
    // detalhe: só o caminho de volta; o cartão do cliente faz o papel de título
    ctx.alvo.append(h("a", { class: "voltar-link adm-voltar", href: _ultimoHashClientes }, ui.icone("seta-esq"), "Clientes"), corpo);
    return telaCliente(ctx, corpo, id);
  }
  ctx.alvo.append(
    h("header", { class: "cab-pag" }, h("div", null,
      h("p", { class: "rotulo" }, `Admin · ${ctx.sessao.org ? ctx.sessao.org.nome : ""}${superConta ? " · plataforma" : ""}`),
      h("h1", { class: "titulo-pag" }, { clientes: "Clientes", revendas: "Revendas", planos: "Planos", dominios: "Domínios" }[aba]),
      h("p", { class: "sub" }, {
        clientes: "Crie clientes, acompanhe o uso de cada um e entre no ambiente deles como suporte.",
        revendas: "Agências que revendem com a própria marca, com limites somados de todos os clientes delas.",
        planos: "Preço, limites e módulos de cada plano. Mudar aqui vale na hora, sem publicar nada.",
        dominios: "Endereços próprios das revendas e dos clientes. Depois do CNAME, a plataforma ativa o domínio.",
      }[aba])),
    abas.length > 1 ? nav.el : null),
    corpo);

  if (aba === "clientes") return telaClientes(ctx, corpo);
  if (typeof EXTRAS[aba] === "function") return EXTRAS[aba](ctx, corpo);
}

/* ============================================================
   LISTA DE CLIENTES
   ============================================================ */
async function telaClientes(ctx, corpo) {
  const { ui, api } = ctx;
  const h = ui.h;
  ctx.titulo("Clientes");
  const superConta = !!ctx.sessao.conta.super;
  const filtro = { busca: ctx.rota.query.busca || "", status: ctx.rota.query.status || "", org_id: ctx.rota.query.org || "", local: "" };
  // plano 1000 · AS-155: cada mudança de filtro vai para o endereço (replaceState: sem entrada nova no histórico nem nova montagem)
  const gravarFiltro = () => {
    _ultimoHashClientes = hashClientes(filtro);
    try { if (typeof history !== "undefined" && history.replaceState && typeof location !== "undefined" && location.hash !== _ultimoHashClientes) history.replaceState(history.state, "", _ultimoHashClientes); } catch { /* sem histórico: só o link de voltar lembra */ }
  };
  _ultimoHashClientes = hashClientes(filtro);

  const busca = h("input", { type: "search", value: filtro.busca, placeholder: "Buscar por nome ou endereço", "aria-label": "Buscar cliente" });
  // filtro de situação como segmentado com contagem (item 58); as contagens vêm da lista sem filtro de situação
  const segStatus = ui.segmentado({ tipo: "filtro", rotulo: "Filtrar por situação", classe: "adm-seg-status", valor: filtro.status || "",
    opcoes: [{ valor: "", rotulo: "Todas" }, ...STATUS.map(s => ({ valor: s.valor, rotulo: s.rotulo }))],
    aoMudar: v => { filtro.status = v; gravarFiltro(); carregar(); } });
  const selOrg = superConta ? h("select", { class: "sel", "aria-label": "Filtrar por revenda" }, h("option", { value: "" }, "Todas as orgs")) : null;
  const novo = h("button", { type: "button", class: "bt bt-prim" }, ui.icone("mais"), "Cliente");
  novo.setAttribute("aria-label", "Novo cliente");
  // plano 1000 · AS-166: a lista que está na tela (com os filtros) vira CSV para a cobrança e o relatório da revenda
  const btCsv = h("button", { type: "button", class: "bt bt-fant adm-csv" }, ui.icone("baixar"), "Exportar CSV");
  const segStatusEl = segStatus && segStatus.nodeType ? segStatus : segStatus.el;     // ui.segmentado devolve o elemento (ou {el}, nas versões anteriores)
  const faixa = h("div", { class: "adm-kpis", role: "group", "aria-label": "Resumo dos clientes", hidden: true });
  const chipLocal = h("p", { class: "linha adm-filtro-local", hidden: true });
  const saude = superConta ? h("div", { class: "adm-saude", hidden: true }) : null;
  const lista = h("div");
  corpo.append(...[saude, faixa, h("div", { class: "adm-filtros" }, h("label", { class: "busca" }, ui.icone("busca"), busca), segStatusEl, selOrg, btCsv, novo), chipLocal, lista].filter(Boolean));
  // AS-165: KPI que filtra — situação vai para o segmentado; «perto do limite» e «pausados» são filtro local (com chip removível)
  let ultimosItens = [];
  const kpi = typeof ui.kpi === "function"
    ? o => ui.kpi({ rotulo: o.rotulo, valor: o.valor, ajuda: o.ajuda, aoClicar: o.aoClicar || null })
    : o => h("div", { class: "adm-kpi", title: o.ajuda || null }, h("span", { class: "adm-kpi-rot" }, o.rotulo), h("span", { class: "adm-kpi-val mono dado" }, ui.num(o.valor)));
  function aplicarKpi({ status = "", local = "" }) {
    filtro.local = local;
    if (status !== undefined && filtro.status !== status) {
      filtro.status = status;
      if (typeof segStatus.ativar === "function") segStatus.ativar(status);
      gravarFiltro();
    }
    carregar();
  }
  function pintarChipLocal() {
    ui.limpar(chipLocal);
    chipLocal.hidden = !filtro.local;
    if (!filtro.local) return;
    const tirar = h("button", { type: "button", class: "bt bt-fant bt-p" }, ui.icone("fechar"), "Tirar filtro");
    tirar.addEventListener("click", () => { filtro.local = ""; carregar(); });
    chipLocal.append(ui.pilula(filtro.local === "perto" ? "Só quem está perto do limite" : "Só os pausados pela Nexus", "info"), tirar);
  }
  btCsv.addEventListener("click", () => {
    if (!ultimosItens.length) { ui.toast("Nenhum cliente na lista para exportar.", { tipo: "info" }); return; }
    if (baixarArquivoTexto(csvClientes(ultimosItens, nomePlano), `clientes-${ui.hojeSP()}.csv`, "text/csv")) ui.toast(`${ultimosItens.length} ${ultimosItens.length === 1 ? "cliente exportado" : "clientes exportados"}.`, { tipo: "ok" });
    else ui.toast("O navegador não deixou baixar o arquivo.", { tipo: "erro" });
  });
  // nx_saude (20261013c, só plataforma): a saúde da operação no topo da lista; servidor antigo → o cartão nem aparece
  if (saude) cartaoSaude(ctx, saude);
  // o resumo é sempre da lista SEM situação nem busca (só a revenda do filtro): é o que dá as contagens do segmentado
  let resumoDaOrg = null, seqResumo = 0;          // de qual org_id ("" = todas) é o resumo pintado
  function pintarResumo(itens, orgId) {
    const r = resumoClientes(itens);
    resumoDaOrg = orgId;
    ui.limpar(faixa);
    const ajudaTotal = orgId ? "Todos os clientes da revenda escolhida no filtro." : superConta ? "Todos os clientes da plataforma." : "Todos os clientes desta revenda.";
    faixa.append(...[
      kpi({ rotulo: "Clientes", valor: r.total, ajuda: ajudaTotal, aoClicar: () => aplicarKpi({ status: "", local: "" }) }),
      kpi({ rotulo: "Ativos", valor: r.ativo, ajuda: "Pagando e com acesso liberado (sem os pausados pela Nexus).", aoClicar: () => aplicarKpi({ status: "ativo", local: "" }) }),
      kpi({ rotulo: "Em teste", valor: r.teste, ajuda: "Período de avaliação em andamento.", aoClicar: () => aplicarKpi({ status: "teste", local: "" }) }),
      kpi({ rotulo: "Perto do limite", valor: r.perto_limite, ajuda: "Usando 80 % ou mais de algum limite do plano.", aoClicar: () => aplicarKpi({ local: "perto" }) }),
      r.pausados ? kpi({ rotulo: "Pausados", valor: r.pausados, ajuda: "Pausados pela Nexus: a equipe do cliente não entra.", aoClicar: () => aplicarKpi({ local: "pausados" }) }) : null].filter(Boolean));
    faixa.hidden = false;
    if (typeof segStatus.contar === "function") { for (const s of STATUS) segStatus.contar(s.valor, r[s.valor]); segStatus.contar("", r.total); }
  }
  /** Aberto com ?status= ou ?busca= (ou trocou a revenda com eles ligados): busca à parte a lista sem esses filtros, só para o resumo. */
  // plano 1000b · UB-118: o resumo de uma org é pedido UMA vez (buscas seguidas, antes de a 1ª resposta chegar, não repetem a lista inteira)
  let resumoPedido = null;
  async function carregarResumo() {
    const n = ++seqResumo, orgId = filtro.org_id || "";
    if (resumoPedido === orgId) return;
    resumoPedido = orgId;
    try {
      const todos = await api.rpc("nx_clientes_admin", { p_filtro: { busca: null, status: null, org_id: orgId || null } });
      if (n !== seqResumo || orgId !== (filtro.org_id || "")) return;
      pintarResumo(Array.isArray(todos) ? todos : [], orgId);
    } catch { /* sem resumo: a lista continua; a faixa só aparece com números de verdade */ }
    finally { if (resumoPedido === orgId) resumoPedido = null; }
  }

  if (superConta) {
    orgs(ctx).then(os => { for (const o of os) selOrg.appendChild(h("option", { value: o.id, selected: o.id === filtro.org_id }, o.nome)); }).catch(() => { /* filtro some */ });
  }

  let seq = 0;
  const hoje = ui.hojeSP();
  let mostrar = POR_PAGINA_CLIENTES, ultimosDoFiltro = [];
  async function carregar() {
    const n = ++seq;
    mostrar = POR_PAGINA_CLIENTES;
    // plano 1000b · UB-117: esqueleto só na 1ª carga — nas buscas seguintes a tabela fica (aria-busy) até a resposta chegar
    if (!lista.firstChild) lista.appendChild(ui.esqueleto("tabela", 6));
    lista.setAttribute("aria-busy", "true");
    try {
      const todosDoFiltro = await api.rpc("nx_clientes_admin", { p_filtro: { busca: filtro.busca || null, status: filtro.status || null, org_id: filtro.org_id || null } });
      if (n !== seq) return;
      lista.removeAttribute("aria-busy");
      ultimosDoFiltro = todosDoFiltro;
      pintarLista(todosDoFiltro);
    } catch (e) {
      if (n !== seq) return;
      lista.removeAttribute("aria-busy");
      ui.limpar(lista);
      lista.appendChild(ui.erroCartao(e, carregar));
    }
  }
  function pintarLista(todosDoFiltro) {
    {
      const itens = filtrarLocal(todosDoFiltro, filtro.local, filtro.status);
      ultimosItens = itens;
      pintarChipLocal();
      ui.limpar(lista);
      if (!filtro.status && !filtro.busca) { seqResumo++; pintarResumo(todosDoFiltro, filtro.org_id || ""); }
      else if (resumoDaOrg !== (filtro.org_id || "")) carregarResumo();
      if (!itens.length && !filtro.busca && !filtro.status && !filtro.org_id && !filtro.local) {
        lista.appendChild(ui.vazio({ titulo: "Nenhum cliente ainda.", texto: "Crie o primeiro — o funil, as etiquetas e as respostas rápidas da área dele entram prontos.",
          icone: "empresa", acao: { rotulo: "Criar o primeiro cliente", fn: () => criarCliente(ctx) } }));
        return;
      }
      // uso × limite como mini-barra (item 58): a cor avisa quem está perto do teto
      const uso = (it, k, rot) => {
        const u = it.uso ? it.uso[k] : null, l = it.limites ? it.limites[k] : null;
        return h("span", { class: "adm-uso-mini" }, ui.barraUso(rot, u ?? 0, l));
      };
      // G10: a coluna do número só existe quando o servidor manda `canais` (senão não há o que mostrar com honestidade)
      const comNumeros = itens.some(it => Array.isArray(it.canais));
      const tab = ui.tabela({
        rotulo: "Clientes",
        colunas: [
          // plano 1000 · AS-289: o nome é um link de verdade (Ctrl+clique abre em outra aba; dá para copiar o endereço)
          { chave: "nome", rotulo: "Cliente", ordenavel: true, principal: true, render: it => h("div", { class: "cel-nome" }, ui.avatar(it.nome, it.id),
            h("div", null, h("a", { class: "adm-nome-link", href: `#/admin/clientes/${encodeURIComponent(it.id)}` }, h("b", null, it.nome)), h("small", null, it.slug))) },
          ...(superConta ? [{ chave: "org_nome", rotulo: "Org", ordenavel: true, render: it => it.org ? it.org.nome : "—" }] : []),
          // G5 [H306]: sem pacote comercial registrado (criado pelo clássico) → pílula; o detalhe ensina a completar
          { chave: "plano", rotulo: "Plano", ordenavel: true, render: it => h("span", { class: "adm-pilulas" }, ui.pilula(nomePlano(it.plano), it.plano === "interno" ? "sec" : "prim"),
            semPacote(it) ? ui.pilula("Sem pacote", "aten", { title: "Sem pacote comercial registrado. Abra o cliente para escolher um." }) : null) },
          { chave: "status", rotulo: "Situação", ordenavel: true, render: it => h("span", { class: "adm-pilulas" }, ui.pilula(statusDe(it.status).rotulo, statusDe(it.status).cor),
            it.ativo === false ? ui.pilula("Pausado", "ruim", { icone: "cadeado", title: "Pausado pela Nexus: a equipe do cliente não entra." }) : null) },
          ...(comNumeros ? [{ chave: "n_numeros", rotulo: "Número", ordenavel: true, render: it => {
            const e = estadoNumerosCliente(it.canais);
            return e ? h("span", { class: "adm-numero", dataset: { tom: e.tom } }, ui.pilula(e.rotulo, e.tom, { icone: e.tom === "ok" ? "check" : e.tom === "ruim" ? "alerta" : "whatsapp" })) : "—";
          } }] : []),
          { chave: "teste_ate", rotulo: "Fim do teste", ordenavel: true, render: it => {
            if (!(it.status === "teste" && it.teste_ate)) return "—";
            const venc = testeVencidoHa(it, hoje);      // plano 1000 · AS-158: data passada não fica muda
            return venc ? h("span", { class: "adm-pilulas" }, ui.pilula(rotuloTesteVencido(venc), "ruim", { icone: "alerta" }), h("small", { class: "fraco" }, ui.dataBR(it.teste_ate))) : ui.dataBR(it.teste_ate);
          } },
          { chave: "u_usuarios", rotulo: "Usuários", render: it => uso(it, "usuarios", "Usuários") },
          { chave: "u_canais", rotulo: "Números", render: it => uso(it, "canais", "Números de WhatsApp") },
          { chave: "u_contatos", rotulo: "Contatos", render: it => uso(it, "contatos", "Contatos") },
          { chave: "criado_em", rotulo: "Criado em", ordenavel: true, render: it => ui.dataBR(it.criado_em) },
        ],
        // ordenar «Número»: desconectados primeiro (o que precisa de atenção), depois sem confirmação, depois conectados
        // plano 1000b · UB-225: 50 linhas por vez (paginação local) — com 300 clientes a tabela não desenha tudo de uma vez
        linhas: itens.slice(0, mostrar).map(it => { const e = estadoNumerosCliente(it.canais);
          return { ...it, org_nome: it.org ? it.org.nome : "", u_usuarios: it.uso && it.uso.usuarios, n_numeros: e ? (e.caidos ? 0 : e.tom === "ok" ? 2 : 1) : null }; }),
        aoClicar: it => ctx.navegar(`#/admin/clientes/${it.id}`),
        vazio: "Nenhum cliente com esse filtro.",
      });
      lista.appendChild(tab.el);
      if (itens.length > mostrar) {
        const mais = h("button", { type: "button", class: "bt bt-sec adm-mais" }, `Mostrar mais (${ui.num(Math.min(POR_PAGINA_CLIENTES, itens.length - mostrar))} de ${ui.num(itens.length - mostrar)} restantes)`);
        mais.addEventListener("click", () => { mostrar += POR_PAGINA_CLIENTES; pintarLista(ultimosDoFiltro); });
        lista.appendChild(h("div", { class: "linha adm-mais-linha" }, h("p", { class: "fraco" }, `Mostrando ${ui.num(mostrar)} de ${ui.num(itens.length)} clientes.`), mais));
      }
    }
  }
  const aoBuscar = ui.debounce(() => { filtro.busca = busca.value.trim(); gravarFiltro(); carregar(); }, 300);
  busca.addEventListener("input", aoBuscar);
  if (selOrg) selOrg.addEventListener("change", () => { filtro.org_id = selOrg.value; gravarFiltro(); carregar(); });
  novo.addEventListener("click", () => criarCliente(ctx));
  _limpeza.push(() => aoBuscar.cancelar());
  try { await planos(ctx); } catch { /* nomes de plano caem no id */ }
  await carregar();
}

function baixarArquivoTexto(texto, nome, tipo) {
  try {
    const url = URL.createObjectURL(new Blob([texto], { type: `${tipo};charset=utf-8` }));
    const a = document.createElement("a"); a.href = url; a.download = nome; document.body.appendChild(a); a.click(); a.remove();
    setTimeout(() => URL.revokeObjectURL(url), 4000);
    return true;
  } catch { return false; }
}

/** Saúde da operação (nx_saude, só plataforma) + pausa de emergência de TODOS os envios (nx_envios_pausar sem cliente). */
function cartaoSaude(ctx, caixa) {
  const { ui, api } = ctx;
  const h = ui.h;
  async function carregar() {
    let s = null, falha = null;
    try { s = resumoSaude(await api.rpc("nx_saude")); } catch (e) { if (semFuncao(e)) { caixa.hidden = true; return; } falha = e; }
    ui.limpar(caixa);
    // plano 1000b · UB-104: erro de verdade não esconde o cartão — a plataforma vê que a saúde NÃO foi conferida e pode tentar de novo
    if (falha) {
      const tentar = h("button", { type: "button", class: "bt bt-sec bt-p" }, ui.icone("reabrir"), "Tentar de novo");
      tentar.addEventListener("click", () => ui.carregando(tentar, carregar()));
      caixa.hidden = false;
      caixa.append(h("div", { class: "aviso aviso-aten adm-saude-cx adm-saude-falha", role: "status" }, ui.icone("alerta"),
        h("div", { class: "pilha-p" }, h("p", null, h("b", null, "Não deu para conferir a saúde da operação agora."), ` ${api.mensagemErro(falha)}`), h("div", { class: "linha" }, tentar))));
      return;
    }
    if (!s) { caixa.hidden = true; return; }
    caixa.hidden = false;
    const bPausa = h("button", { type: "button", class: s.pausaGeral ? "bt bt-prim bt-p" : "bt bt-sec bt-p" }, ui.icone(s.pausaGeral ? "play" : "pausa"), s.pausaGeral ? "Retomar todos os envios" : "Pausar todos os envios");
    bPausa.addEventListener("click", async () => {
      const pausar = !s.pausaGeral;
      if (!(await ui.confirmar(pausar
        ? { titulo: "Pausar os envios automáticos de TODOS os clientes?", rotulo: "Pausar tudo", perigo: true, digitar: "pausar",
            texto: "A fila de WhatsApp e as decisões de IA das automações param na plataforma inteira até você retomar. Mensagens digitadas pela equipe nas conversas continuam saindo." }
        : { titulo: "Retomar os envios automáticos?", rotulo: "Retomar", texto: "A fila volta a andar para os clientes que não estão pausados um a um." }))) return;
      try {
        await ui.carregando(bPausa, api.rpc("nx_envios_pausar", { p_cliente: null, p_pausar: pausar, p_motivo: pausar ? "Pausa de emergência pelo Admin" : null }));
        ui.toast(pausar ? "Envios automáticos pausados na plataforma." : "Envios automáticos retomados.", { tipo: "ok" });
        carregar();
      } catch (e) { ui.toast(api.mensagemErro(e), { tipo: "erro" }); }
    });
    caixa.append(h("div", { class: ["aviso", s.pausaGeral ? "aviso-ruim" : s.ok ? "aviso-ok" : "aviso-aten", "adm-saude-cx"] },
      ui.icone(s.ok ? "check" : "alerta"),
      h("div", { class: "pilha-p" },
        h("p", null, h("b", null, s.ok ? "Operação em ordem." : `${s.problemas.length} ${s.problemas.length === 1 ? "ponto de atenção" : "pontos de atenção"} na operação.`),
          s.clientesPausados ? ` ${s.clientesPausados} ${s.clientesPausados === 1 ? "cliente com envios pausados" : "clientes com envios pausados"}.` : ""),
        s.problemas.length ? h("ul", { class: "adm-saude-lista" }, s.problemas.map(p => h("li", null, p))) : null,
        h("div", { class: "linha" }, bPausa))));
  }
  carregar();
}

function nomePlano(id) {
  const p = (_planos || []).find(x => x.id === id);
  return p ? p.nome : id || "—";
}

/* ============================================================
   NOVO CLIENTE
   ============================================================ */
async function criarCliente(ctx) {
  const { ui, api } = ctx;
  const h = ui.h;
  const superConta = !!ctx.sessao.conta.super;
  let ps = [], os = [];
  try { ps = await planos(ctx); } catch (e) { ui.toast(api.mensagemErro(e), { tipo: "erro" }); return; }
  try { os = await orgs(ctx); } catch { os = []; }
  const orgPadrao = ctx.sessao.org ? ctx.sessao.org.id : null;
  const minhaOrg = os.find(o => o.id === orgPadrao);
  const padraoOrg = minhaOrg && minhaOrg.limites && minhaOrg.limites.plano_padrao;
  const planoPadrao = superConta ? "interno"
    : (ps.some(p => p.id === padraoOrg) ? padraoOrg : ps.some(p => p.id === "essencial") ? "essencial" : (ps[0] && ps[0].id));
  const form = h("form", { class: "pilha", novalidate: true },
    h("div", { class: "form-grade" },
      ui.campo({ rotulo: "Nome do cliente", nome: "nome", obrigatorio: true, max: 80, placeholder: "Ex.: Clínica Sorriso", autocomplete: "off" }),
      ui.campo({ rotulo: "Endereço (slug)", nome: "slug", obrigatorio: true, max: 40, ajuda: "Letras minúsculas, números e hífen.", autocomplete: "off" }),
      ui.campo({ rotulo: "Segmento do cliente", nome: "segmento", max: 120, placeholder: "Escreva livremente, por exemplo: clínica odontológica, loja de roupas, consultoria…",
        ajuda: "Sem opções predefinidas. Clínicas odontológicas, oficinas e lojas reconhecidas recebem o modelo correspondente; os demais usam o modelo genérico." }),
      ui.campo({ rotulo: "Situação", nome: "status", tipo: "select", valor: "teste", opcoes: STATUS.slice(0, 2) }),
      ui.campo({ rotulo: "Dias de teste", nome: "dias", tipo: "numero", valor: 14, min: 1, max: 90 }),
      superConta && os.length ? ui.campo({ rotulo: "Revenda / plataforma", nome: "org_id", tipo: "select", valor: orgPadrao, opcoes: os.map(o => ({ valor: o.id, rotulo: `${o.nome}${o.tipo === "plataforma" ? " (plataforma)" : ""}` })) }) : null),
    // plano 1000b · UB-113: nenhum pacote vem marcado — a escolha é obrigatória de verdade («Escolha um dos três» aparece se pular)
    campoPacoteComercial(ui, null, { obrigatorio: true }),
    ui.campo({ rotulo: "Especificações do cliente", nome: "especificacoes", tipo: "textarea", max: 5000, linhas: 4,
      placeholder: "Escreva necessidades, objetivos, entregas combinadas e observações…", ajuda: "Campo livre, sem modelos ou respostas predefinidas." }));
  const nome = form.querySelector("input[name=nome]"), slug = form.querySelector("input[name=slug]");
  // plano 1000 · AS-168: «Vamos usar o modelo: …» ao digitar o segmento, com opção de trocar
  const inpSegNovo = form.querySelector("input[name=segmento]");
  const selModelo = h("select", { class: "sel adm-modelo-sel", "aria-label": "Modelo do cliente" }, VERTICAIS.map(v => h("option", { value: v.valor }, v.rotulo)));
  const linhaModeloNovo = h("p", { class: "campo-ajuda adm-modelo" }, h("span", null, "Vamos usar o modelo: "), selModelo);
  let modeloMexido = false;
  selModelo.addEventListener("change", () => { modeloMexido = true; });
  const pintarModeloNovo = () => { if (!modeloMexido) selModelo.value = verticalPorSegmento(inpSegNovo.value); };
  if (inpSegNovo) { inpSegNovo.addEventListener("input", pintarModeloNovo); inpSegNovo.closest("[data-campo]") ? inpSegNovo.closest("[data-campo]").appendChild(linhaModeloNovo) : inpSegNovo.parentNode.appendChild(linhaModeloNovo); pintarModeloNovo(); }
  let slugMexido = false;
  const conferirSlug = conferidorDeSlug(ctx, slug, null);
  nome.addEventListener("input", () => { if (!slugMexido) { slug.value = sugerirSlug(nome.value); conferirSlug(); } });
  slug.addEventListener("input", () => { slugMexido = true; conferirSlug(); });
  const selStatus = form.querySelector("select[name=status]");
  const campoDias = form.querySelector("[data-campo=dias]");
  let pacoteCriado = "essencial";
  const ajustarDias = () => { campoDias.hidden = selStatus.value !== "teste"; };
  selStatus.addEventListener("change", ajustarDias); ajustarDias();
  // plano 1000b · UB-112: «Termina em dd/mm/aaaa» ao lado dos dias; fora de 1–90 vira erro na hora (antes era corrigido em silêncio)
  const inpDias = form.querySelector("input[name=dias]");
  const fimTeste = h("p", { class: "campo-ajuda adm-teste-fim", "aria-live": "polite" });
  if (campoDias) campoDias.appendChild(fimTeste);
  const pintarFimTeste = () => {
    const n = diasDeTesteValidos(inpDias && inpDias.value);
    fimTeste.textContent = n ? `Termina em ${ui.dataBR(isoMais(ui.hojeSP(), n))}.` : "";
    ui.marcarErro(form, "dias", n || !String(inpDias && inpDias.value || "").trim() ? null : "Use de 1 a 90 dias.");
  };
  if (inpDias) { inpDias.addEventListener("input", pintarFimTeste); pintarFimTeste(); }

  const r = await ui.modal({
    titulo: "Novo cliente", corpo: form, largura: "g",
    descricao: "Registre o segmento e as necessidades com suas próprias palavras e escolha uma das três ofertas comerciais.",
    acoes: [
      { rotulo: "Cancelar", tipo: "neutro" },
      { rotulo: "Criar cliente", tipo: "primario", fn: async () => {
        ui.marcarErro(form, null);
        const d = ui.lerForm(form);
        if (!d.nome || d.nome.length < 2) { ui.marcarErro(form, "nome", "Informe o nome."); return false; }
        if (!/^[a-z0-9-]{2,40}$/.test(d.slug || "")) { ui.marcarErro(form, "slug", "Use de 2 a 40 letras minúsculas, números ou hífen."); return false; }
        const oferta = PACOTES_COMERCIAIS.find(p => p.id === d.pacote_comercial);
        if (!oferta) { ui.marcarErro(form, "pacote_comercial", "Escolha um dos três planos comerciais."); return false; }
        pacoteCriado = oferta.id;
        const planoAcesso = superConta ? planoPadrao : oferta.acesso;
        if (!ps.some(p => p.id === planoAcesso && (superConta || p.ativo !== false))) {
          ui.marcarErro(form, "pacote_comercial", "O plano de acesso correspondente não está disponível para esta revenda. Fale com a plataforma."); return false;
        }
        const dias = diasDeTesteValidos(d.dias);
        if (d.status === "teste" && !dias) { ui.marcarErro(form, "dias", "Use de 1 a 90 dias."); return false; }      // UB-112
        const teste = d.status === "teste" ? isoMais(ui.hojeSP(), dias) : null;
        const p = { nome: d.nome, slug: d.slug, vertical: VERTICAIS.some(v => v.valor === selModelo.value) ? selModelo.value : verticalPorSegmento(d.segmento), plano: planoAcesso, status: d.status, teste_ate: teste,
          comercial: { pacote: oferta.id, segmento: d.segmento || "", especificacoes: d.especificacoes || "" } };
        if (superConta && d.org_id) p.org_id = d.org_id;
        try {
          return await api.rpc("nx_cliente_admin_salvar", { p_cliente: p });
        } catch (e) {
          if (e.codigo === "slug_em_uso") { ui.marcarErro(form, "slug", "Esse endereço já está em uso."); return false; }
          if (e.codigo === "dados_invalidos" && e.hint === "comercial") { ui.marcarErro(form, "especificacoes", "Revise as especificações informadas."); return false; }
          throw e;
        }
      } },
    ],
  });
  if (r && r.id) {
    ui.toast(`Cliente criado com ${rotuloPacote(r.comercial?.pacote || pacoteCriado)}.`, { tipo: "ok" });
    try { await ctx.shell.recarregarSessao(); } catch { /* o seletor atualiza na próxima entrada */ }
    ctx.navegar(`#/admin/clientes/${r.id}`);
  }
}

/** plano 1000 · AS-169: confere o endereço enquanto digita (400 ms parado) com nx_clientes_admin {busca: slug} — aviso embaixo do campo. */
function conferidorDeSlug(ctx, inp, idProprio) {
  const { ui, api } = ctx;
  const campo = inp.closest("[data-campo]") || inp.parentNode;
  const aviso = ui.h("small", { class: "campo-erro adm-slug-tomado", role: "status", hidden: true });
  campo.appendChild(aviso);
  let seq = 0;
  const conferir = ui.debounce(async () => {
    const n = ++seq, v = inp.value.trim().toLowerCase();
    if (!/^[a-z0-9-]{2,40}$/.test(v)) { aviso.hidden = true; return; }
    let achado = null;
    try { achado = slugTomado(await api.rpc("nx_clientes_admin", { p_filtro: { busca: v } }), v, idProprio); } catch { return; }
    if (n !== seq) return;
    aviso.hidden = !achado;
    aviso.textContent = achado ? `Esse endereço já é de «${achado.nome}». Escolha outro.` : "";
  }, 400);
  return conferir;
}

/** plano 1000b · UB-112: dias de teste digitados → inteiro de 1 a 90, ou null (fora da faixa, vazio ou não numérico). */
export function diasDeTesteValidos(v) {
  const n = typeof v === "number" ? v : Number(String(v ?? "").trim().replace(",", "."));
  return String(v ?? "").trim() !== "" && Number.isInteger(n) && n >= 1 && n <= 90 ? n : null;
}

export function isoMais(iso, dias) {
  const [a, m, d] = iso.split("-").map(Number);
  const dt = new Date(Date.UTC(a, m - 1, d + dias));
  return dt.toISOString().slice(0, 10);
}

/* ============================================================
   DETALHE DO CLIENTE
   ============================================================ */
async function telaCliente(ctx, corpo, id) {
  const { ui, api } = ctx;
  const h = ui.h;
  const superConta = !!ctx.sessao.conta.super;
  corpo.appendChild(ui.esqueleto("cartoes", 3));
  let cli, ps;
  try {
    const [lista, planosLista] = await Promise.all([api.rpc("nx_clientes_admin", { p_filtro: { id } }), planos(ctx)]);
    cli = lista && lista[0];
    ps = planosLista;
    if (!cli) throw Object.assign(new Error("cliente_nao_encontrado"), { codigo: "cliente_nao_encontrado" });
  } catch (e) {
    ui.limpar(corpo);
    corpo.append(ui.erroCartao(e, () => telaCliente(ctx, (ui.limpar(corpo), corpo), id)));
    return;
  }
  ctx.titulo(cli.nome);
  ui.limpar(corpo);
  const hojeDet = ui.hojeSP();
  // plano 1000 · AS-162: cabeçalho redesenhável (salvar atualiza nome, situação, plano e pílulas sem remontar a tela)
  const cabNome = h("h1", { class: "titulo-sec" }, cli.nome);
  const cabPilulas = h("div", { class: "linha" });
  const cabAvatar = h("span", { class: "adm-cab-av" }, ui.avatar(cli.nome, cli.id));
  function pintarCabecalho() {
    const s = statusDe(cli.status);
    cabNome.textContent = cli.nome;
    cabAvatar.replaceChildren(ui.avatar(cli.nome, cli.id));
    const venc = testeVencidoHa(cli, hojeDet);
    cabPilulas.replaceChildren(...[ui.pilula(s.rotulo, s.cor), ui.pilula(nomePlano(cli.plano), cli.plano === "interno" ? "sec" : "prim"),
      cli.comercial && cli.comercial.pacote ? ui.pilula(rotuloPacote(cli.comercial.pacote), "info") : ui.pilula("Sem pacote", "aten"),
      venc ? ui.pilula(rotuloTesteVencido(venc), "ruim", { icone: "alerta" }) : null,
      cli.ativo === false ? ui.pilula("Pausado pela Nexus", "ruim", { icone: "cadeado" }) : null,
      h("span", { class: "fraco" }, `${cli.org ? cli.org.nome : ""} · desde ${ui.dataBR(cli.criado_em)}`)].filter(Boolean));
  }
  pintarCabecalho();

  // ---- ações de topo
  const btEntrar = h("button", { type: "button", class: "bt bt-prim" }, ui.icone("seta-dir"), "Entrar");
  // plano 1000b · UB-102: entrar como suporte com try/catch — falha vira toast e o botão continua utilizável (antes a promessa rejeitava muda)
  // UB-226: o mesmo caminho serve ao «Ver números» (entra e abre #/config/numeros)
  async function entrarComo(botao, destino) {
    lembrarVoltaAdmin(`#/admin/clientes/${cli.id}`);      // plano 1000 · AS-248: o «Sair» da faixa de suporte volta para este cliente
    try {
      await ui.carregando(botao, (async () => {
        if (!ctx.shell.clientes().some(c => c.id === cli.id)) await ctx.shell.recarregarSessao();
        await ctx.shell.escolherCliente(cli.id, { remontar: false });
      })());
    } catch (e) {
      ui.toast(`Não deu para entrar na ${cli.nome}. ${api.mensagemErro(e)}`, { tipo: "erro" });
      return;
    }
    ctx.navegar(destino);
  }
  btEntrar.addEventListener("click", () => entrarComo(btEntrar, "#/"));
  const btNumeros = typeof cli.modulos === "object" && Array.isArray(cli.modulos) && !cli.modulos.includes("conversas") ? null
    : h("button", { type: "button", class: "bt bt-sec adm-ver-numeros" }, ui.icone("whatsapp"), "Ver números");
  if (btNumeros) btNumeros.addEventListener("click", () => entrarComo(btNumeros, "#/config/numeros"));
  const btConvite = h("button", { type: "button", class: "bt bt-sec" }, ui.icone("convidar"), "Gerar convite do administrador");
  let convitesPend = [];        // preenchido pela lista de usuários (nx_usuarios_listar → convites)
  btConvite.addEventListener("click", async () => {
    // plano 1000 · AS-159: cada clique criava mais um convite; com um já aguardando, pergunta antes de gerar outro
    const admins = convitesPend.filter(c => !c.papel || c.papel === "admin");
    if (admins.length && !(await ui.confirmar({ titulo: "Já existe um convite aguardando", rotulo: "Gerar outro link",
      texto: `${admins.length === 1 ? "Há 1 convite de administrador" : `Há ${admins.length} convites de administrador`} ainda não usado${admins.length === 1 ? "" : "s"}. Gerar outro cria um link novo (os anteriores continuam valendo até você revogar em «Usuários com acesso»).` }))) return;
    // plano 1000b · UB-201: a validade é escolhida antes de gerar (1 a 30 dias, padrão 3) — a mesma régua do convite em Usuários
    const form = h("form", { class: "pilha", novalidate: true },
      h("p", null, `Envie para quem vai administrar a ${cli.nome}. O link cria a conta de administrador (ou acrescenta o acesso, se a pessoa já usa o sistema).`),
      ui.campo({ rotulo: "O link vale por", nome: "dias", tipo: "select", valor: DIAS_CONVITE_ADMIN, opcoes: OPCOES_VALIDADE_CONVITE }));
    let criado = null;
    try {
      await ui.modal({
        titulo: "Convite do administrador", corpo: form, largura: "m",
        acoes: [
          { rotulo: "Cancelar", tipo: "neutro" },
          { rotulo: "Gerar link", tipo: "primario", fn: async m => {
            if (criado) return true;
            const dias = Number(ui.lerForm(form).dias) || Number(DIAS_CONVITE_ADMIN);
            const r = await api.rpc("nx_convite_criar", { p_cliente: cli.id, p_dados: { papel: "admin", dias }, p_org: null });
            criado = r;
            convitesPend.push({ id: r.id || null, papel: "admin", expira_em: r.expira_em || null });   // o próximo clique já sabe que há um aguardando
            // G5 [H305]: link relativo aberto num host que não serve o app (Pages, localhost) sairia quebrado → aviso no lugar do link
            const lc = linkConvite(r.link, typeof location !== "undefined" ? location : null);
            ui.limpar(m.corpo);
            m.corpo.append(h("div", { class: "pilha" },
              lc.link ? ui.blocoLink(lc.link, { rotulo: "Link do convite", textoWhats: `Olá! Aqui está o acesso de administrador da ${cli.nome} no ${ctx.shell.marcaEfetiva().produto}. Crie sua conta por este link:` })
                : h("div", { class: "aviso aviso-ruim adm-link-ruim", role: "alert" }, ui.icone("alerta"), h("p", null, lc.motivo)),
              h("p", { class: "fraco" }, `Vale até ${ui.dataHoraBR(r.expira_em)} e só uma vez.`)));
            const bt = m.el.querySelector(".modal-rod [data-tipo=primario]"); if (bt) bt.textContent = "Concluir";
            const cancelar = m.el.querySelector(".modal-rod [data-tipo=neutro]"); if (cancelar) cancelar.hidden = true;
            return false;
          } },
        ],
      });
    } catch (e) { ui.toast(api.mensagemErro(e), { tipo: "erro" }); }
    // plano 1000b · UB-202: o convite gerado entra na lista «aguardando» sem recarregar a tela
    if (criado) pintarConvitesAdmin();
  });

  // ---- formulário: acesso ao Órbita, pacote comercial, segmento e especificações
  const planoAtual = () => ps.find(p => p.id === form.querySelector("select[name=plano]").value) || ps.find(p => p.id === cli.plano) || { modulos: [], limites: {} };
  const opcoesPlano = ps.some(p => p.id === cli.plano) ? ps : [{ id: cli.plano, nome: cli.plano, modulos: cli.modulos, limites: {} }, ...ps];
  const comercial = cli.comercial || {};
  let segmentoInicial = comercial.segmento || (VERTICAIS.find(v => v.valor === cli.vertical) || {}).rotulo || "";
  const segmento = ui.campo({ rotulo: "Segmento do cliente", nome: "segmento", valor: segmentoInicial, max: 120,
    placeholder: "Escreva livremente o ramo de atividade…",
    ajuda: "Sem opções predefinidas. Clínicas odontológicas, oficinas e lojas reconhecidas recebem o modelo correspondente; os demais usam o genérico." });
  const especificacoes = ui.campo({ rotulo: "Especificações do cliente", nome: "especificacoes", tipo: "textarea", valor: comercial.especificacoes || "", max: 5000, linhas: 4,
    placeholder: "Necessidades, objetivos, entregas combinadas e observações…", ajuda: "Texto livre. Até 5.000 caracteres." });
  segmento.classList.add("inteiro"); especificacoes.classList.add("inteiro");
  // plano 1000 · AS-168: o modelo que o segmento escrito aplica, à vista (antes a escolha odonto/oficina/loja/genérico era silenciosa)
  const linhaModelo = h("p", { class: "campo-ajuda adm-modelo", "aria-live": "polite" });
  const inpSeg = segmento.querySelector("input");
  const pintarModelo = () => {
    const v = verticalAoEditar(inpSeg.value, segmentoInicial, cli.vertical);
    const rot = (VERTICAIS.find(x => x.valor === v) || { rotulo: "Outro negócio" }).rotulo;
    linhaModelo.textContent = v !== cli.vertical ? `Ao salvar, passa a usar o modelo: ${rot}.` : `Modelo em uso: ${rot}.`;
  };
  if (inpSeg) { inpSeg.addEventListener("input", pintarModelo); segmento.appendChild(linhaModelo); pintarModelo(); }
  const form = h("form", { class: "pilha", novalidate: true },
    h("div", { class: "form-grade" },
      ui.campo({ rotulo: "Nome", nome: "nome", valor: cli.nome, obrigatorio: true, max: 80 }),
      ui.campo({ rotulo: "Endereço (slug)", nome: "slug", valor: cli.slug, obrigatorio: true, max: 40 }),
      ui.campo({ rotulo: "Plano de acesso ao Órbita", nome: "plano", tipo: "select", valor: cli.plano, opcoes: opcoesPlano.map(p => ({ valor: p.id, rotulo: `${p.nome}${p.preco_mensal != null ? ` — ${ui.brl(p.preco_mensal, { centavos: false })}/mês` : ""}` })) }),
      ui.campo({ rotulo: "Situação", nome: "status", tipo: "select", valor: cli.status, opcoes: STATUS }),
      ui.campo({ rotulo: "Fim do teste", nome: "teste_ate", tipo: "data", valor: cli.teste_ate || "" }),
      segmento, especificacoes),
    campoPacoteComercial(ui, comercial.pacote || null, { comercial }),
    // G5 (contrato 9): o interruptor da Nexus. Só aparece quando o servidor diz o estado (cli.ativo) e só a plataforma muda
    superConta && typeof cli.ativo === "boolean" ? comClasse(ui.campo({ rotulo: "Cliente ativo", nome: "ativo", tipo: "interruptor", valor: cli.ativo,
        // plano 1000b · UB-120: ajuda curta; o detalhe (anúncios, relatórios, rastreio, vigia, sessão aberta) vai no diálogo de confirmação
        ajuda: "Desligado: a equipe do cliente não entra e as rotinas param. Os dados ficam guardados." }), "adm-ativo") : null,
    h("div", { class: "campo-modulos" }),
    superConta ? h("fieldset", { class: "campo" }, h("legend", null, "Limites extras (só a plataforma)"),
      h("p", { class: "campo-ajuda" }, "Em branco = o limite do plano. 0 bloqueia o recurso (nenhum permitido)."),
      h("div", { class: "form-grade" }, CHAVES_LIMITE.map(k => ui.campo({ rotulo: k.rotulo, nome: `lim_${k.chave}`, tipo: "numero", min: 0,
        valor: cli.limites_extra && cli.limites_extra[k.chave] != null ? cli.limites_extra[k.chave] : "" })))) : null,
    h("div", { class: "linha linha-fim" }, h("button", { type: "submit", class: "bt bt-prim" }, "Salvar alterações")));

  const caixaMod = form.querySelector(".campo-modulos");
  const inpSlugDet = form.querySelector("input[name=slug]");
  inpSlugDet.addEventListener("input", conferidorDeSlug(ctx, inpSlugDet, cli.id));      // AS-169
  function desenharModulos(marcados) {
    ui.limpar(caixaMod);
    const doPlano = planoAtual().modulos || [];
    const opcoes = MODULOS.map(m => ({ ...m, desabilitado: !superConta && !doPlano.includes(m.valor), rotulo: m.rotulo + (!doPlano.includes(m.valor) ? " (fora do plano)" : "") }));
    caixaMod.appendChild(ui.campo({ rotulo: "Módulos ligados", nome: "modulos", tipo: "multipla", valor: marcados, opcoes,
      ajuda: superConta ? "A plataforma pode ligar módulo fora do plano. CRM e Conversas andam juntos." : "Só os módulos do plano. CRM e Conversas andam juntos." }));
    // CRM e Conversas juntos
    const cbs = caixaMod.querySelectorAll("input[type=checkbox]");
    const par = { crm: "conversas", conversas: "crm" };
    for (const cb of cbs) cb.addEventListener("change", () => {
      const outro = [...cbs].find(x => x.value === par[cb.value]);
      if (outro && !outro.disabled) outro.checked = cb.checked;
    });
  }
  desenharModulos(cli.modulos);
  const selPlano = form.querySelector("select[name=plano]");
  let planoAntes = (planoAtual().modulos || []).slice();
  const avisoModulos = h("p", { class: "aviso aviso-aten adm-mod-aviso", role: "status", hidden: true });
  caixaMod.after(avisoModulos);
  selPlano.addEventListener("change", () => {
    // plano 1000 · AS-161: os módulos que a plataforma ligou à mão continuam; os que saíram são ditos (antes o plano novo zerava tudo)
    const atuais = [...caixaMod.querySelectorAll("input[type=checkbox]")].filter(x => x.checked).map(x => x.value);
    const r = modulosAoTrocarPlano({ atuais, planoAntigo: planoAntes, planoNovo: planoAtual().modulos || [], superConta });
    planoAntes = (planoAtual().modulos || []).slice();
    desenharModulos(r.marcados);
    ui.limpar(avisoModulos);
    avisoModulos.hidden = !r.sairam.length;
    if (r.sairam.length) avisoModulos.append(ui.icone("alerta"), h("span", null,
      `Fora do plano novo: ${r.sairam.map(v => (MODULOS.find(m => m.valor === v) || { rotulo: v }).rotulo).join(", ")}. Ao salvar, ${r.sairam.length === 1 ? "esse módulo é desligado" : "esses módulos são desligados"}.`));
  });
  const selSt = form.querySelector("select[name=status]");
  const campoTeste = form.querySelector("[data-campo=teste_ate]");
  const inpTeste = form.querySelector("input[name=teste_ate]");
  // plano 1000b · UB-109: «Em teste» sempre com data de fim — vazio ganha hoje + 14 dias (e apagar a data vira erro ao salvar)
  const ajustarTeste = () => {
    campoTeste.hidden = selSt.value !== "teste";
    if (selSt.value === "teste" && inpTeste && !inpTeste.value) inpTeste.value = isoMais(ui.hojeSP(), 14);
  };
  selSt.addEventListener("change", ajustarTeste); ajustarTeste();

  form.addEventListener("submit", async ev => {
    ev.preventDefault();
    ui.marcarErro(form, null);
    const d = ui.lerForm(form);
    if (!d.nome || d.nome.length < 2) return ui.marcarErro(form, "nome", "Informe o nome.");
    if (!/^[a-z0-9-]{2,40}$/.test(d.slug || "")) return ui.marcarErro(form, "slug", "Use de 2 a 40 letras minúsculas, números ou hífen.");
    if (d.status === "teste" && !d.teste_ate) return ui.marcarErro(form, "teste_ate", "Informe até quando vai o teste.");      // UB-109
    const p = { id: cli.id, nome: d.nome, slug: d.slug, plano: d.plano, status: d.status,
      vertical: verticalAoEditar(d.segmento, segmentoInicial, cli.vertical),      // segmento igual: mantém o modelo escolhido
      teste_ate: d.status === "teste" ? (d.teste_ate || null) : cli.teste_ate, modulos: d.modulos || [],
      comercial: { pacote: d.pacote_comercial || null, segmento: d.segmento || "", especificacoes: d.especificacoes || "" } };
    if (superConta) {
      const lim = {};
      for (const k of CHAVES_LIMITE) { const v = d[`lim_${k.chave}`]; if (v !== null && v !== undefined && v !== "" && Number.isFinite(v)) lim[k.chave] = Math.max(0, Math.floor(v)); }
      p.limites = lim;
    }
    const pedeAtivo = superConta && typeof cli.ativo === "boolean" && typeof d.ativo === "boolean" && d.ativo !== cli.ativo ? d.ativo : null;
    if (pedeAtivo !== null) {
      p.ativo = pedeAtivo;
      if (!pedeAtivo && !(await ui.confirmar({ titulo: `Pausar ${cli.nome}?`, rotulo: "Pausar cliente", perigo: true,
        texto: "O Órbita para de ler os anúncios e de mandar relatórios e alertas deste cliente, o rastreio do site e a vigia do número param, e a equipe dele passa a ver «conta pausada» ao abrir o app (quem já está com ele aberto é bloqueado na próxima leitura da sessão). Os dados continuam guardados e dá para religar aqui. A situação (ativo, teste, suspenso) é outra coisa: é a do contrato." }))) return;
    }
    if ((d.status === "suspenso" || d.status === "cancelado") && d.status !== cli.status) {
      const ok = await ui.confirmar({ titulo: d.status === "suspenso" ? "Suspender o cliente?" : "Cancelar o cliente?",
        texto: "A equipe do cliente deixa de acessar na hora. Os dados continuam guardados e a situação pode voltar a Ativo.", rotulo: d.status === "suspenso" ? "Suspender" : "Cancelar cliente", perigo: true });
      if (!ok) return;
    }
    try {
      const r = await ui.carregando(form.querySelector("[type=submit]"), api.rpc("nx_cliente_admin_salvar", { p_cliente: p }));
      cli = { ...cli, ...r, uso: r && r.uso ? r.uso : cli.uso };      // UB-111: o uso que a resposta não traz continua o de antes
      segmentoInicial = d.segmento || segmentoInicial;     // o segmento salvo vira a referência (o modelo só muda se mudar de novo)
      if (inpSeg) pintarModelo();
      // por detecção: o servidor que ainda não grava «ativo» devolve o valor antigo — a tela diz a verdade em vez de fingir que pausou
      if (pedeAtivo !== null && r && r.ativo !== pedeAtivo) {
        ui.toast(`Os outros dados foram salvos, mas o servidor ainda não grava ${pedeAtivo ? "a religação" : "a pausa"} por aqui. Use o painel clássico (cadastro do cliente → «Cliente ativo») por enquanto.`, { tipo: "info", ms: 9000 });
      } else ui.toast(pedeAtivo === false ? "Cliente pausado." : pedeAtivo === true ? "Cliente religado." : "Cliente atualizado.", { tipo: "ok" });
      try { await ctx.shell.recarregarSessao(); } catch { /* ok */ }
      // plano 1000 · AS-162: o cabeçalho e as pílulas se atualizam no lugar — a tela não remonta nem volta ao topo
      pintarCabecalho();
      pintarUso();          // plano 1000b · UB-111: as barras usam os limites novos (plano ou limites extras) sem recarregar
      formSalvo = estadoDoForm();      // UB-267: o que está na tela agora é o salvo
      ctx.titulo(cli.nome);
    } catch (e) {
      if (e.codigo === "slug_em_uso") return ui.marcarErro(form, "slug", "Esse endereço já está em uso.");
      if (e.codigo === "dados_invalidos" && e.hint === "comercial") return ui.marcarErro(form, "especificacoes", "Revise as especificações informadas.");
      ui.toast(api.mensagemErro(e), { tipo: "erro" });
    }
  });

  // ---- uso × limite
  const usoEl = h("div", { class: "adm-uso" });
  function pintarUso() { usoEl.replaceChildren(...CHAVES_LIMITE.map(k => barraUso(ui, k.curto || k.rotulo, cli.uso ? cli.uso[k.chave] : 0, cli.limites ? cli.limites[k.chave] : null))); }
  pintarUso();

  // plano 1000b · UB-267: sair do detalhe («‹ Clientes», menu, voltar do navegador) com o formulário mexido pergunta antes
  const estadoDoForm = () => { try { return JSON.stringify(ui.lerForm(form)); } catch { return ""; } };
  let formSalvo = estadoDoForm();
  if (typeof ctx.aoSairDaRota === "function") {
    try {
      const c = ctx.aoSairDaRota(async () => {
        if (!form.isConnected || estadoDoForm() === formSalvo) return true;
        return ui.confirmar({ titulo: `Sair sem salvar ${cli.nome}?`, rotulo: "Sair sem salvar", perigo: true,
          texto: "As mudanças em «Plano e situação» ainda não foram salvas e serão perdidas." });
      });
      if (typeof c === "function") _limpeza.push(c);
    } catch { /* a guarda é um extra */ }
  }

  // ---- usuários com acesso
  // revisão 1000b · UB-209: esqueleto secundário (o detalhe do cliente já anunciou «Carregando…») — não fala de novo
  const usuariosEl = h("div", { class: "pilha-p" }, ui.esqueleto("lista", { n: 2, anunciar: false }));
  api.rpc("nx_usuarios_listar", { p_cliente: cli.id }).then(r => {
    ui.limpar(usuariosEl);
    const us = r.usuarios || [];
    if (!us.length) usuariosEl.appendChild(h("p", { class: "fraco" }, "Ninguém com acesso ainda. Gere o convite do administrador."));
    // plano 1000 · AS-160: ações de suporte por pessoa (link de nova senha) sem precisar «Entrar» no cliente
    for (const u of us) {
      const b = h("button", { type: "button", class: "bt-icone adm-us-acoes", "aria-label": `Ações de suporte para ${u.nome}` }, ui.icone("opcoes"));
      b.addEventListener("click", () => ui.menu(b, [{ rotulo: "Gerar link de nova senha", icone: "cadeado", fn: () => linkSenhaSuporte(u) }]));
      usuariosEl.appendChild(h("div", { class: "cel-nome adm-us-linha" }, ui.avatar(u.nome, u.conta_id),
        h("div", null, h("b", null, u.nome), h("small", null, `${({ admin: "Administrador", supervisor: "Supervisor", atendente: "Atendente", leitura: "Somente leitura" })[u.papel] || u.papel} · ${u.email}`)),
        u.editavel === false ? null : b));
    }
    convitesPend = Array.isArray(r.convites) ? r.convites : [];
    usuariosCarregados = true;
    pintarConvitesAdmin();
  }).catch(e => { ui.limpar(usuariosEl); usuariosEl.appendChild(h("p", { class: "fraco" }, ui.mensagemErro(e))); });
  /** UB-202: (re)desenha a lista «N convites aguardando» dentro do cartão de usuários. */
  let usuariosCarregados = false;
  function pintarConvitesAdmin() {
    if (!usuariosCarregados) return;          // a lista ainda vai chegar e desenhar com o convite novo (convitesPend já o tem)
    for (const v of usuariosEl.querySelectorAll(".adm-convites")) v.remove();
    if (convitesPend.length) usuariosEl.appendChild(listaConvitesAdmin());
  }

  async function linkSenhaSuporte(u) {
    try {
      const r = await api.rpc("nx_senha_link_criar", { p_cliente: cli.id, p_conta: u.conta_id });
      const lc = linkConvite(r.link, location);
      await ui.modal({ titulo: `Link de nova senha · ${u.nome}`, largura: "m",
        corpo: h("div", { class: "pilha" },
          h("p", null, `Envie para ${u.nome}. Quem abrir cria uma senha nova e todas as sessões abertas dessa conta são encerradas.`),
          lc.link ? ui.blocoLink(lc.link, { rotulo: "Link de nova senha", textoWhats: `Olá, ${String(u.nome).split(" ")[0]}! Crie sua senha nova por este link:` })
            : h("div", { class: "aviso aviso-ruim adm-link-ruim", role: "alert" }, ui.icone("alerta"), h("p", null, lc.motivo)),
          r.expira_em ? h("p", { class: "fraco" }, `Vale até ${ui.dataHoraBR(r.expira_em)} e só uma vez.`) : null),
        acoes: [{ rotulo: "Concluir", tipo: "primario", valor: true }] });
    } catch (e) { ui.toast(api.mensagemErro(e), { tipo: "erro" }); }
  }

  /** nx_envios_pausar (20261013c, só plataforma): pausa de emergência dos envios automáticos DESTE cliente. */
  function cartaoEnvios() {
    if (!superConta) return null;
    let pausado = typeof cli.envios_pausados === "boolean" ? cli.envios_pausados : null;
    const estado = h("p", { class: "sub adm-envios-estado" });
    const bPausar = h("button", { type: "button", class: "bt bt-sec bt-p" }, ui.icone("pausa"), "Pausar envios");
    const bRetomar = h("button", { type: "button", class: "bt bt-sec bt-p" }, ui.icone("play"), "Retomar envios");
    const pintar = () => {
      estado.textContent = pausado === true ? "Pausados: a fila de WhatsApp e as decisões de IA das automações deste cliente estão paradas."
        : pausado === false ? "Saindo normalmente." : "A situação atual não vem nesta tela; use os botões para pausar ou retomar.";
      bPausar.hidden = pausado === true; bRetomar.hidden = pausado === false;
    };
    const acao = pausar => async () => {
      if (pausar && !(await ui.confirmar({ titulo: `Pausar os envios automáticos de ${cli.nome}?`, rotulo: "Pausar envios", perigo: true,
        texto: "A fila de WhatsApp (lembretes, campanhas, automações) e as decisões de IA deste cliente param até você retomar. As mensagens que a equipe digita nas conversas continuam saindo." }))) return;
      try {
        const r = await ui.carregando(pausar ? bPausar : bRetomar, api.rpc("nx_envios_pausar", { p_cliente: cli.id, p_pausar: pausar, p_motivo: pausar ? "Pausa de emergência pelo Admin" : null }));
        pausado = r && typeof r.pausado === "boolean" ? r.pausado : pausar;
        pintar();
        ui.toast(pausado ? "Envios automáticos pausados." : "Envios automáticos retomados.", { tipo: "ok" });
      } catch (e) {
        ui.toast(semFuncao(e) ? "Este servidor ainda não tem a pausa de envios." : api.mensagemErro(e), { tipo: "erro" });
      }
    };
    bPausar.addEventListener("click", acao(true));
    bRetomar.addEventListener("click", acao(false));
    pintar();
    return h("div", { class: "cartao adm-envios" }, h("div", { class: "cartao-cab" }, h("div", null, h("h2", null, "Envios automáticos"),
      h("p", { class: "sub" }, "Pausa de emergência: para tudo que sai sozinho deste cliente, sem desligar as automações uma a uma."))),
      estado, h("div", { class: "linha" }, bPausar, bRetomar));
  }

  /** plano 1000 · AS-159: os convites que aguardam, cada um com «Revogar» (o link deixa de valer na hora). */
  function listaConvitesAdmin() {
    const caixa = h("div", { class: "pilha-p adm-convites" }, h("p", { class: "rotulo" }, convitesPend.length === 1 ? "1 convite aguardando" : `${convitesPend.length} convites aguardando`));
    for (const cv of convitesPend) {
      const b = h("button", { type: "button", class: "bt bt-fant bt-p" }, "Revogar");
      b.addEventListener("click", async () => {
        if (!(await ui.confirmar({ titulo: "Revogar convite?", texto: "O link deixa de funcionar na hora.", rotulo: "Revogar", perigo: true }))) return;
        try {
          await ui.carregando(b, api.rpc("nx_convite_revogar", { p_cliente: cli.id, p_convite: cv.id }));
          convitesPend = convitesPend.filter(x => x.id !== cv.id);
          const nova = convitesPend.length ? listaConvitesAdmin() : null;
          if (nova) caixa.replaceWith ? caixa.replaceWith(nova) : (caixa.parentNode.insertBefore(nova, caixa), caixa.remove()); else caixa.remove();
          ui.toast("Convite revogado.", { tipo: "ok" });
        } catch (e) { ui.toast(api.mensagemErro(e), { tipo: "erro" }); }
      });
      const papel = ({ admin: "Administrador", supervisor: "Supervisor", atendente: "Atendente", leitura: "Somente leitura" })[cv.papel] || cv.papel || "Administrador";
      caixa.appendChild(h("div", { class: "convite-item" }, ui.icone("link"),
        h("div", null, h("b", null, cv.nome || cv.email || "Convite sem nome"),
          h("small", null, [papel, cv.expira_em ? `vence ${ui.relativo(cv.expira_em)}` : null].filter(Boolean).join(" · "))), b));
    }
    return caixa;
  }

  /** G5 [H306]: cliente sem pacote comercial (criado pelo clássico): diz o que falta e leva ao campo. */
  function avisoSemPacote() {
    const ir = h("button", { type: "button", class: "bt bt-sec bt-p" }, "Escolher o pacote");
    ir.addEventListener("click", () => {
      const campo = form.querySelector("[data-campo=pacote_comercial]");
      if (!campo) return;
      campo.scrollIntoView({ block: "center", behavior: ui.comportamentoRolagem() });
      const r = campo.querySelector("input[type=radio]");
      if (r) r.focus({ preventScroll: true });
    });
    return h("div", { class: "aviso aviso-aten adm-sem-pacote", role: "note" }, ui.icone("alerta"),
      h("div", { class: "pilha-p" }, h("p", null, "Este cliente não tem pacote comercial registrado (provavelmente criado pelo painel clássico). Escolha um dos três em «Plano e situação» e salve: o registro comercial do cliente fica completo."),
        h("div", { class: "linha" }, ir)));
  }

  corpo.append(...[
    h("div", { class: "cartao" },
      h("div", { class: "cartao-cab" },
        h("div", { class: "cel-nome" }, cabAvatar, h("div", null, cabNome, cabPilulas)),
        h("div", { class: "linha" }, btConvite, btNumeros, btEntrar))),
    semPacote(cli) ? avisoSemPacote() : null,
    h("div", { class: "adm-det" },
      h("div", { class: "pilha" },
        h("div", { class: "cartao" }, h("div", { class: "cartao-cab" }, h("div", null, h("h2", null, "Plano e situação"),
          h("p", { class: "sub" }, superConta ? "Como plataforma, você também define limites extras." : "O plano Interno e os limites extras são só da plataforma."))), form)),
      h("div", { class: "pilha" },
        // uso de IA do mês em anel (item 58) + a série por dia do servidor (G2, nx_ia_uso_dia) com o custo estimado
        h("div", { class: "cartao adm-ia" }, h("div", { class: "cartao-cab" }, h("div", null, h("h2", null, "IA neste mês"), h("p", { class: "sub" }, "Sugestões da IA usadas no mês corrente. Zera todo dia 1."))),
          anelUso(ui, { uso: cli.uso ? cli.uso.ia_mes : 0, limite: cli.limites ? cli.limites.ia_mes : null, rotulo: "Sugestões de IA" }),
          usoIAPorDia(ctx, cli)),
        h("div", { class: "cartao" }, h("div", { class: "cartao-cab" }, h("div", null, h("h2", null, "Uso do plano"), h("p", { class: "sub" }, "Contagem de agora; sugestões de IA no mês corrente."))), usoEl),
        h("div", { class: "cartao" }, h("div", { class: "cartao-cab" }, h("div", null, h("h2", null, "Usuários com acesso"))), usuariosEl),
        cartaoEnvios(),
        EXTRAS.dominiosCliente ? EXTRAS.dominiosCliente(ctx, cli) : null))].filter(Boolean));
}

export function barraUso(ui, rotulo, uso, limite) { return ui.barraUso(rotulo, uso, limite); }

/**
 * G2 (contrato 7): uso de IA por dia do cliente (nx_ia_uso_dia, 14 dias) — chamadas e custo com sparkline (ui.kpi) e a tabela por dia.
 * O custo é ESTIMADO (calculado pelos tokens no momento da chamada) e aparece como estimativa. Banco antigo: uma nota, nada inventado.
 */
export function usoIAPorDia(ctx, cli, { dias = 14 } = {}) {
  const { ui, api } = ctx;
  const h = ui.h;
  const caixa = h("div", { class: "adm-ia-dia", "aria-live": "polite" }, ui.esqueleto("kpi", { n: 2, anunciar: false }));   // revisão 1000b · UB-209
  const pronto = (async () => {
    let r = null, falha = null;
    try { r = resumoUsoIA(await api.rpc("nx_ia_uso_dia", { p_cliente: cli.id, p_dias: dias })); } catch (e) { falha = e; }
    ui.limpar(caixa);
    if (!r) {
      const semRpc = !falha || /pgrst202|could not find the function|http_404/i.test(String((falha && (falha.codigo || falha.message)) || ""));
      caixa.appendChild(h("p", { class: "fraco adm-ia-dia-nota" }, ui.icone("info"),
        h("span", null, semRpc ? "O uso de IA por dia ainda não vem deste servidor." : `Não deu para ler o uso por dia: ${api.mensagemErro(falha)}`)));
      return false;
    }
    const kpis = h("div", { class: "adm-ia-kpis" },
      ui.kpi({ rotulo: `Chamadas · ${r.dias} dias`, valor: r.chamadas, serie: r.serieChamadas, ajuda: "Chamadas à IA feitas por este cliente (sugestões, resumos, automações), por dia." }),
      ui.kpi({ rotulo: `Custo · ${r.dias} dias`, valor: r.custo_usd, formato: dolar, serie: r.serieCusto, estimativa: true,
        ajuda: `Estimado pelos tokens de cada chamada (${ui.num(r.tokens_in)} de entrada e ${ui.num(r.tokens_out)} de saída), em dólares.` }));
    const tab = h("table", { class: "adm-ia-tab" },
      h("caption", { class: "sr-only" }, `Uso de IA por dia, últimos ${r.dias} dias`),
      h("thead", null, h("tr", null, h("th", { scope: "col" }, "Dia"), h("th", { scope: "col", class: "num" }, "Chamadas"), h("th", { scope: "col", class: "num" }, "Tokens"), h("th", { scope: "col", class: "num" }, "Custo estimado"))),
      h("tbody", null, r.linhas.filter(x => x.chamadas).reverse().map(x => h("tr", null,
        h("th", { scope: "row" }, `${x.dia.slice(8, 10)}/${x.dia.slice(5, 7)}`), h("td", { class: "num mono" }, ui.num(x.chamadas)),
        h("td", { class: "num mono" }, ui.num(x.tokens_in + x.tokens_out)), h("td", { class: "num mono" }, x.custo_usd > 0 ? dolar(x.custo_usd) : "—")))));
    // plano 1000b · UB-268: a revenda cobra em reais — o custo em dólar diz o que é (estimativa, sem cotação do dia)
    const notaDolar = ctx.sessao && ctx.sessao.conta && ctx.sessao.conta.super ? null
      : h("p", { class: "fraco adm-ia-dolar" }, ui.icone("info"), h("span", null, "Custo estimado em dólar (cotação do dia não aplicada)."));
    caixa.append(...[kpis, notaDolar,
      r.custoIncompleto ? h("p", { class: "fraco adm-ia-dia-nota" }, ui.icone("info"), h("span", null, "Há dias com chamadas sem custo registrado (feitas antes de o custo ser gravado): o custo total está por baixo.")) : null,
      r.chamadas ? h("details", { class: "adm-ia-det" }, h("summary", null, "Ver por dia"), tab) : h("p", { class: "fraco" }, `Nenhuma chamada de IA nos últimos ${r.dias} dias.`)].filter(Boolean));
    return true;
  })();
  caixa.pronto = pronto;
  return caixa;
}

/* ============================================================
   P0-B: revendas, planos, domínios
   ============================================================ */
const EXTRAS = { revendas: telaRevendas, planos: telaPlanos, dominios: telaDominios, dominiosCliente: cartaoDominiosCliente };

/** config.js tem o editor de marca e o cartão de domínio: carregado com o MESMO ?v= do roteador. */
function modConfig(ctx) { return import(`./config.js?v=${encodeURIComponent(ctx.versao)}`); }
const LIMITES_ORG = [{ chave: "empresas", rotulo: "Clientes" }, { chave: "usuarios", rotulo: "Usuários (soma)" }, { chave: "canais", rotulo: "Números de WhatsApp (soma)" }];

/* ---------------- REVENDAS (super) ---------------- */
async function telaRevendas(ctx, corpo) {
  const { ui, api } = ctx;
  const h = ui.h;
  ctx.titulo("Revendas");
  const novo = h("button", { type: "button", class: "bt bt-prim" }, ui.icone("mais"), "Revenda");
  novo.setAttribute("aria-label", "Nova revenda");
  const lista = h("div", { class: "pilha" }, ui.esqueleto("cartoes", 3));
  corpo.append(h("div", { class: "adm-filtros adm-filtros-fim" }, novo), lista);
  novo.addEventListener("click", () => formRevenda(ctx, null, carregar));

  async function carregar() {
    ui.limpar(lista);
    lista.append(ui.esqueleto("cartoes", 3));
    let os;
    try { _orgs = null; os = await orgs(ctx); await planos(ctx); }
    catch (e) { ui.limpar(lista); lista.append(ui.erroCartao(e, carregar)); return; }
    ui.limpar(lista);
    const plat = os.find(o => o.tipo === "plataforma");
    const revs = os.filter(o => o.tipo === "revenda").sort((a, b) => a.nome.localeCompare(b.nome, "pt-BR"));
    if (plat) {
      lista.append(h("div", { class: "cartao rev-plat" },
        h("div", { class: "rev-cab" }, marcaMini(ctx, plat),
          h("div", { class: "rev-tit" }, h("b", null, plat.nome), h("small", { class: "mono" },
            `plataforma · ${contagem(plat.empresas, "cliente", "clientes")} · ${contagem(plat.usuarios, "usuário", "usuários")}`))),      // plano 1000b · UB-105
        h("div", { class: "linha" },
          h("a", { class: "bt bt-sec bt-p", href: "#/config/marca?de=org" }, ui.icone("pincel"), "Marca da plataforma"),
          h("a", { class: "bt bt-fant bt-p", href: `#/admin/clientes?org=${encodeURIComponent(plat.id)}` }, "Ver clientes"))));
    }
    if (!revs.length) {
      lista.append(ui.vazio({ titulo: "Nenhuma revenda ainda.", icone: "camadas",
        texto: "Uma revenda é uma agência que vende o sistema com a própria marca, dentro dos limites que você define.",
        acao: { rotulo: "Criar a primeira revenda", fn: () => formRevenda(ctx, null, carregar) } }));
      return;
    }
    lista.append(h("div", { class: "rev-grade" }, revs.map(o => cartaoRevenda(ctx, o, carregar))));
  }
  await carregar();
}

/** plano 1000b · UB-105: «1 cliente», «3 clientes» (sem número vira 0). */
export function contagem(n, um, varios) { const v = Math.max(0, Number(n) || 0); return `${v} ${v === 1 ? um : varios}`; }
/** plano 1000b · UB-115: rótulo e cor da situação da revenda (cancelada não é «Suspensa»). */
export function statusRevenda(status) {
  return ({ ativo: ["Ativa", "ok"], suspenso: ["Suspensa", "aten"], cancelado: ["Cancelada", "ruim"] })[status] || [status ? String(status) : "—", "neutra"];
}
/** plano 1000b · UB-114: as três cores da revenda numa frase para o leitor de tela. */
export function rotuloCoresRevenda(cores = {}) {
  return `Cores: primária ${cores.primaria || "padrão"}, secundária ${cores.secundaria || "padrão"}, fundo ${cores.fundo || "padrão"}`;
}

function marcaMini(ctx, o) {
  const { ui } = ctx;
  const h = ui.h;
  const T = ctx.shell.tema;
  const ef = T.marcaEfetiva(o.marca || {}, {});
  const logo = ef.logo || ef.logo_claro;
  const el = h("span", { class: "rev-logo", style: { "--cor": ui.corOk(ef.cores.fundo) } },
    logo ? h("img", { src: logo, alt: "" }) : h("svg", { viewBox: "0 0 48 48", "aria-hidden": "true" }, h("use", { href: "#marca-orbita" })));
  return el;
}

function cartaoRevenda(ctx, o, recarregar) {
  const { ui, api } = ctx;
  const h = ui.h;
  const T = ctx.shell.tema;
  const ef = T.marcaEfetiva(o.marca || {}, {});
  const lim = o.limites || {};
  const pp = (_planos || []).find(p => p.id === lim.plano_padrao);
  const btEditar = h("button", { type: "button", class: "bt bt-sec bt-p" }, ui.icone("editar"), "Editar");
  const btConvite = h("button", { type: "button", class: "bt bt-sec bt-p" }, ui.icone("convidar"), "Convidar gestor");
  const btMarca = h("button", { type: "button", class: "bt bt-fant bt-p" }, ui.icone("pincel"), "Marca");
  btEditar.addEventListener("click", () => formRevenda(ctx, o, recarregar));
  btConvite.addEventListener("click", () => convidarGestor(ctx, o, btConvite));
  btMarca.addEventListener("click", () => editarMarcaOrg(ctx, o, recarregar));
  return h("article", { class: "cartao rev-cartao" },
    h("div", { class: "rev-cab" }, marcaMini(ctx, o),
      h("div", { class: "rev-tit" }, h("b", null, o.nome), h("small", { class: "mono" }, `${ef.produto} · ?org=${o.slug}`)),
      ui.pilula(...statusRevenda(o.status))),       // plano 1000b · UB-115
    // plano 1000b · UB-114: role=img com as três cores no nome (antes aria-label numa div sem papel e cada cor só no title)
    h("div", { class: "rev-cores", role: "img", "aria-label": rotuloCoresRevenda(ef.cores) }, ["primaria", "secundaria", "fundo"].map(k =>
      h("span", { class: "rev-cor", "aria-hidden": "true", style: { "--cor": ui.corOk(ef.cores[k]) }, title: `${{ primaria: "Primária", secundaria: "Secundária", fundo: "Fundo" }[k]} ${ef.cores[k]}` }))),
    h("div", { class: "adm-uso" },
      ui.barraUso("Clientes", o.empresas, lim.empresas ?? null),
      ui.barraUso("Usuários", o.usuarios, lim.usuarios ?? null),
      ui.barraUso("Números de WhatsApp", o.canais, lim.canais ?? null)),
    h("p", { class: "fraco rev-pp" }, `Plano padrão dos clientes novos: ${pp ? pp.nome : lim.plano_padrao || "Essencial"}`),
    h("div", { class: "linha" }, btEditar, btConvite, btMarca,
      h("a", { class: "bt bt-fant bt-p", href: `#/admin/clientes?org=${encodeURIComponent(o.id)}` }, "Clientes")));
}

async function formRevenda(ctx, o, aoSalvar) {
  const { ui, api } = ctx;
  const h = ui.h;
  const T = ctx.shell.tema;
  let ps = [], falhaPlanos = null;
  try { ps = (await planos(ctx)).filter(p => p.ativo && p.id !== "interno"); } catch (e) { ps = []; falhaPlanos = e; }
  const lim = (o && o.limites) || { empresas: 10, usuarios: 50, canais: 10, plano_padrao: "essencial" };
  const form = h("form", { class: "pilha", novalidate: true },
    h("div", { class: "form-grade" },
      ui.campo({ rotulo: "Nome da agência", nome: "nome", valor: o ? o.nome : "", obrigatorio: true, max: 80, autocomplete: "off", placeholder: "Ex.: Agência Conecta" }),
      ui.campo({ rotulo: "Endereço (slug)", nome: "slug", valor: o ? o.slug : "", obrigatorio: true, max: 40, autocomplete: "off",
        ajuda: "Vira o link de entrada: /app/?org=slug (até ter domínio próprio)." }),
      o ? ui.campo({ rotulo: "Situação", nome: "status", tipo: "select", valor: o.status, opcoes: [{ valor: "ativo", rotulo: "Ativa" }, { valor: "suspenso", rotulo: "Suspensa (os clientes da agência não entram)" }],
        ajuda: "Suspensa: as equipes dos clientes da agência deixam de entrar. O gestor continua entrando para organizar e exportar." }) : null,
      ui.campo({ rotulo: "Plano padrão dos clientes novos", nome: "plano_padrao", tipo: "select", valor: lim.plano_padrao || "essencial",
        opcoes: ps.map(p => ({ valor: p.id, rotulo: p.nome })) })),
    h("fieldset", { class: "campo" }, h("legend", null, "Limites da agência (somados em todos os clientes)"),
      h("p", { class: "campo-ajuda" }, "Em branco = sem limite."),
      h("div", { class: "form-grade form-grade-3" }, LIMITES_ORG.map(k => ui.campo({ rotulo: k.rotulo, nome: `lim_${k.chave}`, tipo: "numero", min: 0, valor: lim[k.chave] ?? "" })))),
    o ? null : h("fieldset", { class: "campo" }, h("legend", null, "Marca inicial"),
      h("p", { class: "campo-ajuda" }, "A agência completa (logo, textos do login, WhatsApp) depois, em Configurações → Marca e tema."),
      h("div", { class: "form-grade" },
        ui.campo({ rotulo: "Nome do produto", nome: "produto", max: 40, placeholder: "Ex.: Conecta CRM", autocomplete: "off" }),
        ui.campo({ rotulo: "Cor primária", nome: "cor_primaria", tipo: "cor", valor: T.PADRAO.cores.primaria, paleta: ctx.paleta }),
        ui.campo({ rotulo: "Cor secundária", nome: "cor_secundaria", tipo: "cor", valor: T.PADRAO.cores.secundaria, paleta: ctx.paleta }),
        ui.campo({ rotulo: "Cor de fundo", nome: "cor_fundo", tipo: "cor", valor: T.PADRAO.cores.fundo, paleta: T.FUNDOS }))));
  // plano 1000b · UB-119: sem a lista de planos o «Plano padrão» sairia vazio — o modal diz e não deixa salvar
  if (falhaPlanos) form.prepend(h("div", { class: "aviso aviso-ruim adm-planos-falha", role: "alert" }, ui.icone("alerta"),
    h("p", null, `Não deu para carregar os planos: ${api.mensagemErro(falhaPlanos)} Feche e abra de novo para salvar.`)));
  const nome = form.querySelector("input[name=nome]"), slug = form.querySelector("input[name=slug]");
  let slugMexido = !!o;
  // plano 1000b · UB-203: o endereço já usado por outra revenda aparece enquanto digita (a lista nx_orgs_listar já está carregada)
  const conferirSlug = conferidorSlugRevenda(ctx, slug, o ? o.id : null);
  nome.addEventListener("input", () => { if (!slugMexido) { slug.value = sugerirSlug(nome.value); conferirSlug(); } });
  slug.addEventListener("input", () => { slugMexido = true; conferirSlug(); });

  const r = await ui.modal({
    titulo: o ? `Editar ${o.nome}` : "Nova revenda", corpo: form, largura: "g",
    acoes: [
      { rotulo: "Cancelar", tipo: "neutro" },
      { rotulo: o ? "Salvar" : "Criar revenda", tipo: "primario", desabilitado: !!falhaPlanos, fn: async () => {
        if (falhaPlanos) return false;
        ui.marcarErro(form, null);
        const d = ui.lerForm(form);
        if (!d.nome || d.nome.length < 2) { ui.marcarErro(form, "nome", "Informe o nome."); return false; }
        if (!/^[a-z0-9-]{2,40}$/.test(d.slug || "")) { ui.marcarErro(form, "slug", "Use de 2 a 40 letras minúsculas, números ou hífen."); return false; }
        const limites = {};
        for (const k of LIMITES_ORG) { const v = d[`lim_${k.chave}`]; if (v !== null && v !== undefined && v !== "" && Number.isFinite(v)) limites[k.chave] = Math.max(0, Math.floor(v)); }
        if (d.plano_padrao) limites.plano_padrao = d.plano_padrao;
        const p = { nome: d.nome, slug: d.slug, limites };
        if (o) { p.id = o.id; p.status = d.status; }
        else {
          const marca = { cores: {} };
          if (d.produto) marca.produto = d.produto;
          for (const k of ["primaria", "secundaria", "fundo"]) { const c = T.normalizarHex(d[`cor_${k}`]); if (c) marca.cores[k] = c; }
          p.marca = marca;
        }
        if (o && o.status === "ativo" && d.status === "suspenso"
          && !(await ui.confirmar({ titulo: `Suspender ${o.nome}?`, texto: "As equipes de TODOS os clientes da agência deixam de acessar na hora. O gestor da agência continua entrando. Os dados ficam guardados.", rotulo: "Suspender", perigo: true }))) return false;
        try { return await api.rpc("nx_org_salvar", { p_org: p }); }
        catch (e) {
          if (e.codigo === "slug_em_uso") { ui.marcarErro(form, "slug", "Esse endereço já está em uso."); return false; }
          if (e.codigo === "dados_invalidos" && /^limites\./.test(e.hint || "")) { ui.marcarErro(form, `lim_${e.hint.slice(8)}`, "Use um número inteiro (ou deixe em branco)."); return false; }
          if (e.codigo === "marca_invalida") throw e;
          throw e;
        }
      } },
    ],
  });
  if (r && r.id) {
    ui.toast(o ? "Revenda atualizada." : `Revenda criada. Convide o gestor para ${r.nome} começar.`, { tipo: "ok" });
    if (aoSalvar) await aoSalvar();
    if (!o) convidarGestor(ctx, r, null);
  }
}

/** plano 1000b · UB-203: a revenda que já usa o endereço (slug idêntico, sem contar a própria) ou null. */
export function slugDeRevendaTomado(orgsLista, slug, idProprio = null) {
  const s = String(slug || "").trim().toLowerCase();
  if (!s) return null;
  return (Array.isArray(orgsLista) ? orgsLista : []).find(x => x && x.id !== idProprio && String(x.slug || "").toLowerCase() === s) || null;
}
/** UB-203: aviso embaixo do slug da revenda, com 300 ms de pausa, pela lista de orgs em memória (sem nova chamada se já carregou). */
function conferidorSlugRevenda(ctx, inp, idProprio) {
  const { ui } = ctx;
  const campo = inp.closest("[data-campo]") || inp.parentNode;
  const aviso = ui.h("small", { class: "campo-erro adm-slug-tomado", role: "status", hidden: true });
  campo.appendChild(aviso);
  return ui.debounce(async () => {
    const v = inp.value.trim().toLowerCase();
    if (!/^[a-z0-9-]{2,40}$/.test(v)) { aviso.hidden = true; return; }
    let achado = null;
    try { achado = slugDeRevendaTomado(await orgs(ctx), v, idProprio); } catch { return; }
    if (inp.value.trim().toLowerCase() !== v) return;
    aviso.hidden = !achado;
    aviso.textContent = achado ? `Esse endereço já é da revenda «${achado.nome}». Escolha outro.` : "";
  }, 300);
}

async function convidarGestor(ctx, o, botao) {
  const { ui, api } = ctx;
  const h = ui.h;
  const form = h("form", { class: "pilha", novalidate: true },
    h("div", { class: "aviso" }, ui.icone("info"), h("p", null, "O link cria uma conta NOVA de gestor desta agência. Quem já tem conta no sistema precisa usar outro e-mail.")),
    h("div", { class: "form-grade" },
      ui.campo({ rotulo: "Nome (opcional)", nome: "nome", max: 80, autocomplete: "off" }),
      ui.campo({ rotulo: "E-mail (opcional)", nome: "email", tipo: "email", autocomplete: "off" })));
  let feito = null;
  await ui.modal({
    titulo: `Convidar gestor · ${o.nome}`, corpo: form, largura: "m",
    acoes: [
      { rotulo: "Cancelar", tipo: "neutro" },
      { rotulo: "Gerar link", tipo: "primario", fn: async m => {
        if (feito) return true;
        const d = ui.lerForm(form);
        if (d.email && !/^[^@\s]+@[^@\s]+\.[^@\s]+$/.test(d.email)) { ui.marcarErro(form, "email", "Esse e-mail não parece válido."); return false; }
        const r = await (botao ? ui.carregando(botao, api.rpc("nx_convite_criar", { p_cliente: null, p_dados: { papel: "gestor", dias: 7, nome: d.nome || null, email: d.email || null }, p_org: o.id }))
          : api.rpc("nx_convite_criar", { p_cliente: null, p_dados: { papel: "gestor", dias: 7, nome: d.nome || null, email: d.email || null }, p_org: o.id }));
        feito = r;
        const lc = linkConvite(r.link, location);
        ui.limpar(m.corpo);
        m.corpo.append(...[
          lc.link ? h("div", { class: "aviso aviso-ok" }, ui.icone("check"), h("p", null, "Convite de gestor criado. Envie o link — ele não chega por e-mail.")) : null,
          lc.link ? ui.blocoLink(lc.link, { rotulo: "Link do convite de gestor", textoWhats: `Olá${d.nome ? `, ${d.nome.split(" ")[0]}` : ""}! Aqui está o seu acesso de gestor da ${o.nome}. Crie sua conta por este link:` })
            : h("div", { class: "aviso aviso-ruim adm-link-ruim", role: "alert" }, ui.icone("alerta"), h("p", null, lc.motivo)),
          h("p", { class: "fraco" }, `Vale até ${ui.dataHoraBR(r.expira_em)}, uma vez só, e apenas para conta nova.`)].filter(Boolean));
        const bt = m.el.querySelector(".modal-rod [data-tipo=primario]"); if (bt) bt.textContent = "Concluir";
        const cancelar = m.el.querySelector(".modal-rod [data-tipo=neutro]"); if (cancelar) cancelar.hidden = true;
        return false;
      } },
    ],
  });
}

async function editarMarcaOrg(ctx, o, aoFechar) {
  const { ui } = ctx;
  const h = ui.h;
  let limpar = null;
  const corpo = h("div", { class: "pilha" });
  const g = ui.gaveta({ titulo: `Marca · ${o.nome}`, corpo, largura: "g",
    aoFechar: () => { if (limpar) try { limpar(); } catch { /* ok */ } if (aoFechar) aoFechar(); } });
  // plano 1000b · UB-204: fechar a gaveta (X, voltar, clique fora ou Esc) com cor/logo mexidos e não salvos pergunta antes — editorMarca
  // expõe .sujo(); a proteção de texto da gaveta não vê troca de cor nem de imagem
  const sujo = () => !!(limpar && typeof limpar.sujo === "function" && limpar.sujo());
  let perguntando = false;
  const perguntarEFechar = async () => {
    if (perguntando) return;
    perguntando = true;
    try {
      if (await ui.confirmar({ titulo: "Fechar sem salvar a marca?", rotulo: "Fechar sem salvar", perigo: true,
        texto: `As mudanças da marca da ${o.nome} ainda não foram salvas e serão perdidas.` })) g.fechar();
    } finally { perguntando = false; }
  };
  if (g && g.el && typeof g.el.addEventListener === "function") {
    g.el.addEventListener("click", ev => {
      const t = ev.target;
      const fechar = t === g.el || (t && t.closest && t.closest(".gaveta-x, .gaveta-voltar"));
      if (!fechar || !sujo()) return;
      ev.preventDefault(); ev.stopPropagation();
      perguntarEFechar();
    }, true);
    g.el.addEventListener("keydown", ev => {
      if (ev.key !== "Escape" || !sujo()) return;
      ev.preventDefault(); ev.stopPropagation();
      perguntarEFechar();
    }, true);
  }
  try {
    const cfg = await modConfig(ctx);
    limpar = await cfg.editorMarca(ctx, corpo, { tipo: "org", org: o });
  } catch (e) {
    ui.limpar(corpo);
    corpo.append(ui.erroCartao(e, null));
  }
  return g;
}

/* ---------------- PLANOS (super) ---------------- */
async function telaPlanos(ctx, corpo) {
  const { ui, api } = ctx;
  const h = ui.h;
  ctx.titulo("Planos");
  const novo = h("button", { type: "button", class: "bt bt-prim" }, ui.icone("mais"), "Plano");
  novo.setAttribute("aria-label", "Novo plano");
  const grade = h("div", { class: "plano-grade" }, ui.esqueleto("cartoes", 3));
  corpo.append(h("div", { class: "adm-filtros adm-filtros-fim" },
    h("p", { class: "fraco adm-dica" }, "Limite em branco = sem limite. Mudanças valem na hora para todos os clientes do plano (exceto limites extras de cada cliente)."), novo), grade);

  async function carregar() {
    ui.limpar(grade); grade.append(ui.esqueleto("cartoes", 3));
    let ps;
    try { _planos = null; ps = await planos(ctx); }
    catch (e) { ui.limpar(grade); grade.append(ui.erroCartao(e, carregar)); return; }
    ui.limpar(grade);
    for (const p of ps) grade.append(cartaoPlano(ctx, p, carregar));
    sujos.clear();
  }
  novo.addEventListener("click", async () => {
    const form = h("form", { class: "pilha", novalidate: true },
      h("div", { class: "form-grade" },
        ui.campo({ rotulo: "Nome", nome: "nome", obrigatorio: true, max: 40, autocomplete: "off", placeholder: "Ex.: Premium" }),
        ui.campo({ rotulo: "Código", nome: "id", obrigatorio: true, max: 30, autocomplete: "off", ajuda: "Minúsculas, números e _ (não muda depois)." })));
    const nome = form.querySelector("input[name=nome]"), id = form.querySelector("input[name=id]");
    let mexido = false;
    nome.addEventListener("input", () => { if (!mexido) id.value = sugerirSlug(nome.value).replace(/-/g, "_").slice(0, 30); });
    id.addEventListener("input", () => { mexido = true; });
    const r = await ui.modal({ titulo: "Novo plano", corpo: form, largura: "m", acoes: [
      { rotulo: "Cancelar", tipo: "neutro" },
      { rotulo: "Criar plano", tipo: "primario", fn: async () => {
        ui.marcarErro(form, null);
        const d = ui.lerForm(form);
        if (!d.nome || d.nome.length < 2) { ui.marcarErro(form, "nome", "Informe o nome."); return false; }
        if (!/^[a-z0-9_]{2,30}$/.test(d.id || "")) { ui.marcarErro(form, "id", "Use de 2 a 30 letras minúsculas, números ou _."); return false; }
        if ((_planos || []).some(p => p.id === d.id)) { ui.marcarErro(form, "id", "Já existe um plano com esse código."); return false; }
        return api.rpc("nx_plano_salvar", { p_plano: { id: d.id, nome: d.nome, ativo: false, modulos: ["crm", "conversas", "relatorios"],
          ordem: ((_planos || []).reduce((mx, p) => Math.max(mx, p.ordem || 0), 0) + 1) } });
      } },
    ] });
    if (r && r.id) { ui.toast("Plano criado desligado. Ajuste preço, limites e módulos e ligue quando estiver pronto.", { tipo: "ok" }); await carregar(); }
  });
  // plano 1000b · UB-266: cartão de plano mexido e não salvo → sair da tela (Clientes, menu, voltar) pergunta antes
  const sujos = new Set();
  grade.addEventListener("input", ev => { const c = ev.target && ev.target.closest ? ev.target.closest(".plano-cartao") : null; if (c) sujos.add(c); });
  grade.addEventListener("change", ev => { const c = ev.target && ev.target.closest ? ev.target.closest(".plano-cartao") : null; if (c) sujos.add(c); });
  if (typeof ctx.aoSairDaRota === "function") {
    try {
      const c = ctx.aoSairDaRota(async () => {
        const abertos = [...sujos].filter(x => x.isConnected);
        if (!abertos.length) return true;
        return ui.confirmar({ titulo: abertos.length === 1 ? "Sair sem salvar o plano?" : `Sair sem salvar ${abertos.length} planos?`, rotulo: "Sair sem salvar", perigo: true,
          texto: "Há mudanças de preço, limites ou módulos que ainda não foram salvas e serão perdidas." });
      });
      if (typeof c === "function") _limpeza.push(c);
    } catch { /* a guarda é um extra */ }
  }
  await carregar();
}

/** plano 1000b · UB-110: os limites ou os módulos do plano mudaram em relação ao salvo? (sem limite = chave ausente) */
export function mudouLimitesOuModulos(plano, { limites = {}, modulos = [] } = {}) {
  const a = (plano && plano.limites) || {};
  const chaves = new Set([...Object.keys(a), ...Object.keys(limites)]);
  for (const k of chaves) if ((a[k] ?? null) !== (limites[k] ?? null)) return true;
  const m1 = [...((plano && plano.modulos) || [])].sort().join(","), m2 = [...modulos].sort().join(",");
  return m1 !== m2;
}
/** UB-110: quantos clientes usam o plano (pela lista do nx_clientes_admin). */
export function contarClientesDoPlano(itens, planoId) { return (Array.isArray(itens) ? itens : []).filter(it => it && it.plano === planoId).length; }

function cartaoPlano(ctx, p, recarregar) {
  const { ui, api } = ctx;
  const h = ui.h;
  const lim = p.limites || {};
  const form = h("form", { class: "pilha", novalidate: true },
    h("div", { class: "form-grade" },
      ui.campo({ rotulo: "Nome", nome: "nome", valor: p.nome, max: 40 }),
      ui.campo({ rotulo: "Preço por mês (R$)", nome: "preco_mensal", tipo: "moeda", valor: p.preco_mensal != null ? Number(p.preco_mensal) : "", ajuda: "Em branco = sob consulta." }),
      ui.campo({ rotulo: "Ordem", nome: "ordem", tipo: "numero", valor: p.ordem ?? 0, min: 0 }),
      ui.campo({ tipo: "interruptor", nome: "ativo", rotulo: "Disponível para novos clientes", valor: !!p.ativo })),
    h("fieldset", { class: "campo" }, h("legend", null, "Limites"),
      h("div", { class: "form-grade form-grade-3" }, CHAVES_LIMITE.map(k => ui.campo({ rotulo: k.curto || k.rotulo, nome: `lim_${k.chave}`, tipo: "numero", min: 0, valor: lim[k.chave] ?? "", placeholder: "sem limite" })))),
    ui.campo({ rotulo: "Módulos", nome: "modulos", tipo: "multipla", valor: p.modulos || [], opcoes: MODULOS, ajuda: "CRM e Conversas andam juntos." }),
    h("div", { class: "linha linha-fim" }, h("button", { type: "submit", class: "bt bt-prim" }, "Salvar plano")));
  const cbs = form.querySelectorAll("[data-multi=modulos] input[type=checkbox]");
  for (const cb of cbs) cb.addEventListener("change", () => {
    const par = { crm: "conversas", conversas: "crm" }[cb.value];
    const outro = [...cbs].find(x => x.value === par);
    if (outro) outro.checked = cb.checked;
  });
  form.addEventListener("submit", async ev => {
    ev.preventDefault();
    ui.marcarErro(form, null);
    const d = ui.lerForm(form);
    if (!d.nome || d.nome.length < 2) return ui.marcarErro(form, "nome", "Informe o nome.");
    const limites = {};
    for (const k of CHAVES_LIMITE) { const v = d[`lim_${k.chave}`]; if (v !== null && v !== undefined && v !== "" && Number.isFinite(v)) limites[k.chave] = Math.max(0, Math.floor(v)); }
    if (p.id === "interno" && d.ativo === false && !(await ui.confirmar({ titulo: "Desligar o plano Interno?", texto: "Os clientes da plataforma continuam nele; ele só deixa de aparecer para novos clientes.", rotulo: "Desligar" }))) return;
    // plano 1000b · UB-110: mudar limite ou módulo vale na hora para TODOS os clientes do plano — antes de salvar, diz quantos
    if (mudouLimitesOuModulos(p, { limites, modulos: d.modulos || [] })) {
      let n = null;
      try { n = contarClientesDoPlano(await api.rpc("nx_clientes_admin", { p_filtro: { busca: null, status: null, org_id: null } }), p.id); } catch { /* sem a contagem: pergunta assim mesmo */ }
      const quem = n === null ? "todos os clientes deste plano" : n === 1 ? "1 cliente" : `${n} clientes`;
      if (n !== 0 && !(await ui.confirmar({ titulo: n === null ? `Mudar os limites ou módulos do plano ${p.nome}?` : `Afeta ${quem}`, rotulo: "Salvar plano",
        texto: `A mudança de limites ou módulos vale na hora para ${quem} (exceto os limites extras de cada cliente).` }))) return;
    }
    try {
      const r = await ui.carregando(form.querySelector("[type=submit]"), api.rpc("nx_plano_salvar", { p_plano: {
        id: p.id, nome: d.nome, preco_mensal: d.preco_mensal, ordem: Number.isFinite(d.ordem) ? Math.max(0, Math.floor(d.ordem)) : 0,
        ativo: !!d.ativo, limites, modulos: d.modulos || [] } }));
      Object.assign(p, r);
      _planos = null;
      ui.toast(`Plano ${r.nome} salvo. Vale na hora para os clientes dele.`, { tipo: "ok" });
      if (recarregar) await recarregar();
    } catch (e) {
      if (e.codigo === "dados_invalidos" && /^limites\./.test(e.hint || "")) return ui.marcarErro(form, `lim_${e.hint.slice(8)}`, "Use um número inteiro (ou deixe em branco).");
      if (e.codigo === "nome_invalido") return ui.marcarErro(form, "nome", "Use de 2 a 40 caracteres.");
      ui.toast(api.mensagemErro(e), { tipo: "erro" });
    }
  });
  return h("article", { class: ["cartao", "plano-cartao", !p.ativo && "inativo"] },
    h("div", { class: "cartao-cab" },
      h("div", null, h("h2", { class: "titulo-sec" }, p.nome),
        h("p", { class: "mono fraco" }, `${p.id}${p.preco_mensal != null ? ` · ${ui.brl(p.preco_mensal, { centavos: false })}/mês` : ""}`)),
      ui.pilula(p.id === "interno" ? "Só plataforma" : p.ativo ? "Disponível" : "Desligado", p.id === "interno" ? "sec" : p.ativo ? "ok" : "neutra")),
    form);
}

/** plano 1000b · UB-265: o endereço da tela de domínios com os filtros. */
export function hashDominios({ status = "", busca = "" } = {}) {
  const q = new URLSearchParams();
  if (status) q.set("status", status);
  if (busca) q.set("busca", busca);
  const t = q.toString();
  return t ? `#/admin/dominios?${t}` : "#/admin/dominios";
}

/* ---------------- DOMÍNIOS (super: todos, com ativação · gestor: os da org) ---------------- */
async function telaDominios(ctx, corpo) {
  const { ui, api } = ctx;
  const h = ui.h;
  ctx.titulo("Domínios");
  const superConta = !!ctx.sessao.conta.super;
  const filtro = h("select", { class: "sel", "aria-label": "Filtrar por situação" },
    h("option", { value: "" }, "Todos"), h("option", { value: "pendente" }, "Pendentes"), h("option", { value: "ativo" }, "Ativos"));
  const novo = h("button", { type: "button", class: "bt bt-prim" }, ui.icone("mais"), "Domínio");
  novo.setAttribute("aria-label", "Novo domínio");
  // plano 1000 · AS-171: busca por endereço, cliente ou revenda (além da situação)
  const buscaDom = h("input", { type: "search", placeholder: "Buscar endereço ou cliente", "aria-label": "Buscar domínio", autocomplete: "off" });
  const lista = h("div", { class: "dom-grade" }, ui.esqueleto("cartoes", 2));
  corpo.append(...[
    superConta ? h("div", { class: "aviso" }, ui.icone("info"), h("p", null, "Para ativar: no Netlify, em Domain management → Add a domain alias, adicione o endereço; espere o certificado HTTPS sair e só então clique em Marcar ativo.")) : null,
    h("div", { class: "adm-filtros" }, h("label", { class: "busca" }, ui.icone("busca"), buscaDom), filtro, novo), lista].filter(Boolean));
  // plano 1000b · UB-265: situação e busca vão para o endereço (?status=&busca=, replaceState) — recarregar mantém o filtro
  const q0 = (ctx.rota && ctx.rota.query) || {};
  if (["pendente", "ativo"].includes(q0.status)) filtro.value = q0.status;
  if (q0.busca) buscaDom.value = String(q0.busca);
  const gravarFiltroDom = () => {
    const alvoHash = hashDominios({ status: filtro.value, busca: buscaDom.value.trim() });
    try { if (typeof history !== "undefined" && history.replaceState && typeof location !== "undefined" && location.hash !== alvoHash) history.replaceState(history.state, "", alvoHash); } catch { /* sem histórico */ }
  };
  buscaDom.addEventListener("input", ui.debounce(() => { gravarFiltroDom(); desenhar(); }, 150));
  let dados = [], cfg = null;
  async function carregar() {
    ui.limpar(lista); lista.append(ui.esqueleto("cartoes", 2));
    try {
      const [resposta, modulo] = await Promise.all([api.rpc("nx_dominios_listar"), cfg || modConfig(ctx)]);
      cfg = modulo;
      dados = cfg.validarListaDominios(resposta);
    }
    catch (e) { ui.limpar(lista); lista.append(ui.erroCartao(e, carregar)); return; }
    desenhar();
  }
  function desenhar() {
    ui.limpar(lista);
    const itens = filtrarDominios(dados, { status: filtro.value, busca: buscaDom.value });
    if (!itens.length) {
      lista.append(ui.vazio({ titulo: dados.length ? "Nenhum domínio com esse filtro ou busca." : "Nenhum domínio ainda.", icone: "globo",
        texto: dados.length ? "" : "Revendas e clientes podem usar o próprio endereço (ex.: crm.agencia.com.br) com a marca deles." }));
      return;
    }
    for (const d of itens) lista.append(cfg.cartaoDominio(ctx, d, {
      mostrarOrg: superConta,
      aoRemover: carregar,
      aoStatus: superConta ? async ativo => { dados = cfg.validarListaDominios(await api.rpc("nx_dominio_status", { p_host: d.host, p_ativo: ativo })); ui.toast(ativo ? `${d.host} ativo.` : `${d.host} voltou a pendente.`, { tipo: "ok" }); desenhar(); } : null,
    }));
  }
  filtro.addEventListener("change", () => { gravarFiltroDom(); desenhar(); });
  novo.addEventListener("click", async () => {
    const clientes = ctx.shell.clientes();
    const form = h("form", { class: "pilha", novalidate: true },
      ui.campo({ rotulo: "Endereço", nome: "host", placeholder: "crm.agencia.com.br", autocomplete: "off", ajuda: "Subdomínio (domínio raiz não aceita CNAME)." }),
      ui.campo({ rotulo: "Para quem", nome: "cliente", tipo: "select", valor: "",
        opcoes: [{ valor: "", rotulo: superConta ? "Plataforma (sem cliente)" : "Toda a agência" }, ...clientes.map(c => ({ valor: c.id, rotulo: `${c.nome}${c.org_nome ? ` (${c.org_nome})` : ""}` }))] }));
    const r = await ui.modal({ titulo: "Novo domínio", corpo: form, largura: "m", acoes: [
      { rotulo: "Cancelar", tipo: "neutro" },
      { rotulo: "Cadastrar", tipo: "primario", fn: async () => {
        ui.marcarErro(form, null);
        const d = ui.lerForm(form);
        // plano 1000b · UB-106/UB-107: a mesma limpeza e as mesmas checagens das Configurações (protocolo, barra, maiúsculas; domínio raiz)
        const c = cfg || (cfg = await modConfig(ctx));
        const host = c.normalizarHost(d.host);
        const erroHost = c.erroHostDominio(host, typeof location !== "undefined" ? location.hostname : "");
        if (erroHost) { ui.marcarErro(form, "host", erroHost); return false; }
        if (c.ehDominioRaiz(host) && !(await ui.confirmar({ titulo: "Isso parece um domínio raiz", rotulo: "Usar mesmo assim",
          texto: `«${host}» não aceita CNAME na maioria dos provedores, e sem CNAME o domínio não ativa. Prefira um subdomínio, como crm.${host} ou app.${host}.` }))) {
          ui.marcarErro(form, "host", `Use um subdomínio, como crm.${host}.`); return false;
        }
        try { return await api.rpc("nx_dominio_salvar", { p_host: host, p_cliente: d.cliente || null }); }
        catch (e) {
          if (e.codigo === "dominio_invalido" || e.codigo === "dominio_em_uso") { ui.marcarErro(form, "host", api.mensagemErro(e)); return false; }
          throw e;
        }
      } },
    ] });
    if (r !== null && r !== undefined) {
      try { dados = cfg.validarListaDominios(r); desenhar(); ui.toast("Domínio cadastrado como pendente.", { tipo: "ok" }); }
      catch (e) { ui.toast(api.mensagemErro(e), { tipo: "erro" }); await carregar(); }
    }
  });
  await carregar();
}

/** Cartão "Domínios" no detalhe do cliente (P0-B, atrás de admin_revendas). */
function cartaoDominiosCliente(ctx, cli) {
  if (!ctx.pronto("admin_revendas")) return null;
  const { ui, api } = ctx;
  const h = ui.h;
  const lista = h("div", { class: "pilha-p" }, ui.esqueleto("lista", { n: 1, anunciar: false }));   // revisão 1000b · UB-209: cartão dentro do detalhe
  // plano 1000b · UB-205: placeholder genérico (o slug do cliente não é um domínio que ele tenha)
  const host = h("input", { type: "text", placeholder: "crm.empresadocliente.com.br", "aria-label": `Novo domínio para ${cli.nome}`, autocomplete: "off", inputmode: "url" });
  const bt = h("button", { type: "submit", class: "bt bt-sec bt-p" }, ui.icone("mais"), "Adicionar");
  const erro = h("small", { class: "campo-erro", role: "alert", hidden: true });
  const form = h("form", { class: "dom-add", novalidate: true }, host, bt);
  async function carregar() {
    try {
      const modulo = await modConfig(ctx);
      const todos = modulo.validarListaDominios(await api.rpc("nx_dominios_listar"));
      const meus = todos.filter(d => d.cliente && d.cliente.id === cli.id);
      ui.limpar(lista);
      if (!meus.length) lista.append(h("p", { class: "fraco" }, "Sem domínio próprio. Os links usam o endereço da agência."));
      for (const d of meus) lista.append(h("div", { class: "dom-linha" }, ui.icone("globo"), h("span", { class: "mono" }, d.host),
        ui.pilula(d.status === "ativo" ? "Ativo" : "Pendente", d.status === "ativo" ? "ok" : "aten")));
    } catch (e) {
      ui.limpar(lista);
      const tentar = h("button", { type: "button", class: "bt bt-sec bt-p" }, "Tentar novamente");
      tentar.addEventListener("click", carregar);
      lista.append(h("p", { class: "fraco", role: "alert" }, api.mensagemErro(e)), tentar);
    }
  }
  form.addEventListener("submit", async ev => {
    ev.preventDefault();
    erro.hidden = true;
    try {
      // plano 1000b · UB-108: a mesma limpeza (HTTPS://Crm.X.com.br/ → crm.x.com.br) e a checagem de domínio raiz do UB-106/UB-107
      const c = await modConfig(ctx);
      const limpo = c.normalizarHost(host.value);
      const erroHost = c.erroHostDominio(limpo, typeof location !== "undefined" ? location.hostname : "");
      if (erroHost) { erro.textContent = erroHost; erro.hidden = false; host.focus(); return; }
      if (c.ehDominioRaiz(limpo) && !(await ui.confirmar({ titulo: "Isso parece um domínio raiz", rotulo: "Usar mesmo assim",
        texto: `«${limpo}» não aceita CNAME na maioria dos provedores, e sem CNAME o domínio não ativa. Prefira um subdomínio, como crm.${limpo}.` }))) {
        erro.textContent = `Use um subdomínio, como crm.${limpo}.`; erro.hidden = false; return;
      }
      await ui.carregando(bt, api.rpc("nx_dominio_salvar", { p_host: limpo, p_cliente: cli.id }));
      host.value = ""; ui.toast("Domínio cadastrado. Veja a instrução de DNS em Admin → Domínios.", { tipo: "ok" }); carregar();
    }
    catch (e) { erro.textContent = api.mensagemErro(e); erro.hidden = false; }
  });
  carregar();
  return h("div", { class: "cartao" }, h("div", { class: "cartao-cab" }, h("div", null, h("h2", null, "Domínios do cliente"),
    h("p", { class: "sub" }, "Quem entra por esse endereço já cai nesta empresa, com a marca dela."))),
    lista, form, erro, h("a", { class: "voltar-link adm-voltar", href: "#/admin/dominios" }, "Instruções de DNS e ativação", ui.icone("seta-dir")));
}
