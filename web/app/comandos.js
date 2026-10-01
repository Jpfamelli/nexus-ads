/* ============================================================
   ÓRBITA — comandos.js (M18) · frente B · PURO (sem imports e sem DOM)
   O que a paleta Ctrl/⌘+K sabe, separado de como ela aparece (paleta.js, carregada sob demanda):
   - o registro de comandos que as telas oferecem (ctx.comandos.registrar) — vive no boot, porque a tela monta antes de alguém abrir a paleta;
   - o catálogo de ações do shell e quando cada uma vale (papel, plano, prontos, produto);
   - achar sem acento e sem caixa, prefixos «>» (só ações) e «#» (protocolo), destaque do trecho achado;
   - «Recentes» por empresa (localStorage) e os destinos de «Ir para».
   ============================================================ */

export const MAX_RECENTES = 5;

/** Sem acento, minúsculo, espaços únicos. */
export function normalizar(s) {
  return String(s ?? "").normalize("NFD").replace(/[̀-ͯ]/g, "").toLowerCase().replace(/\s+/g, " ").trim();
}

/**
 * Quanto `alvo` (e as palavras extras) casa com `termo`: 0 = não casa. Cada palavra do termo precisa aparecer; o começo do rótulo e o
 * começo de palavra valem mais que o meio; rótulo igual ao termo vence tudo.
 */
export function pontuar(termo, alvo, extras = "") {
  const t = normalizar(termo);
  if (!t) return 1;
  const a = normalizar(alvo), e = normalizar(extras);
  const todo = e ? `${a} ${e}` : a;
  let pontos = 0;
  for (const tok of t.split(" ")) {
    if (!todo.includes(tok)) return 0;
    const i = a.indexOf(tok);
    pontos += i === 0 ? 4 : i > 0 && a[i - 1] === " " ? 3 : i > 0 ? 2 : 1;
  }
  if (a === t) pontos += 6; else if (a.startsWith(t)) pontos += 3;
  return pontos;
}

/** Filtra e ordena (mais pontos primeiro; empate = ordem original). Sem termo devolve tudo na ordem de origem. */
export function filtrar(itens, termo, { rotulo = x => x.rotulo, extras = x => x.palavras || "", limite = Infinity } = {}) {
  const t = normalizar(termo);
  const r = [];
  itens.forEach((x, i) => { const p = pontuar(t, rotulo(x), extras(x)); if (p > 0) r.push({ x, p, i }); });
  if (t) r.sort((a, b) => b.p - a.p || a.i - b.i);
  return r.slice(0, limite).map(o => o.x);
}

/** O que foi digitado: «> nova» só ações; «#2026» protocolo de conversa; o resto busca em tudo. */
export function interpretar(entrada) {
  const s = String(entrada ?? "").trimStart();
  if (s.startsWith(">")) return { modo: "acoes", termo: s.slice(1).trim() };
  if (s.startsWith("#")) return { modo: "protocolo", termo: s.slice(1).trim() };
  return { modo: "tudo", termo: s.trim() };
}

/** Texto em partes para destacar o que casou: [{ texto, marca }]. Sem nós de HTML: quem desenha põe <mark> em nós de texto. */
export function partesDeRealce(texto, termo) {
  const s = String(texto ?? "");
  const chars = [...s];
  const base = c => c.normalize("NFD").replace(/[̀-ͯ]/g, "").toLowerCase();
  const n = chars.map(base);
  if (!normalizar(termo) || n.some(x => [...x].length !== 1)) return [{ texto: s, marca: false }];   // um caractere que vira outra quantidade ao normalizar: sem destaque, em vez de errar o trecho
  const plano = n.join("");
  const marcas = new Array(chars.length).fill(false);
  for (const tok of normalizar(termo).split(" ")) {
    const u = plano.indexOf(tok);
    if (u < 0) continue;
    const i = [...plano.slice(0, u)].length, len = [...tok].length;   // posição em caracteres (um emoji são 2 unidades do JavaScript)
    for (let j = i; j < i + len; j++) marcas[j] = true;
  }
  const partes = [];
  chars.forEach((c, i) => {
    const ult = partes[partes.length - 1];
    if (ult && ult.marca === marcas[i]) ult.texto += c; else partes.push({ texto: c, marca: marcas[i] });
  });
  return partes;
}

/* ---------- registro de comandos das telas ---------- */

/**
 * criarComandos() → registro. `registrar({ id, rotulo, palavras?, atalho?, icone?, fazer })` devolve cancelar(): a tela chama ao sair
 * (o shell também cancela sozinho ao trocar de tela). Comando inválido não lança erro (não pode derrubar a tela): devolve um cancelar vazio.
 */
export function criarComandos() {
  const itens = new Map();
  const ouvintes = new Set();
  const avisar = () => { for (const f of [...ouvintes]) { try { f(); } catch { /* ouvinte não derruba o registro */ } } };
  return {
    registrar(cmd) {
      if (!cmd || typeof cmd.fazer !== "function" || !String(cmd.rotulo || "").trim()) return () => {};
      const item = {
        id: String(cmd.id || cmd.rotulo).slice(0, 80), rotulo: String(cmd.rotulo).trim().slice(0, 80), palavras: String(cmd.palavras || "").slice(0, 240),
        atalho: cmd.atalho ? String(cmd.atalho).slice(0, 40) : "", icone: /^[a-z0-9-]{1,24}$/.test(cmd.icone || "") ? cmd.icone : "raio", fazer: cmd.fazer, origem: "tela",
      };
      itens.set(item.id, item);
      avisar();
      return () => { if (itens.get(item.id) === item) { itens.delete(item.id); avisar(); } };
    },
    listar: () => [...itens.values()],
    obter: id => itens.get(id) || null,
    /** Há comando registrado com este atalho (a tela cuida dele: o shell não responde ao mesmo atalho). */
    temAtalho: atalho => [...itens.values()].some(c => c.atalho === atalho),
    /** Espera um comando aparecer (a tela acabou de abrir). Resolve com o comando ou com null depois de `ms`. */
    aguardar(id, ms = 5000) {
      const ja = itens.get(id);
      if (ja) return Promise.resolve(ja);
      return new Promise(resolver => {
        let t = null;
        const f = () => { const c = itens.get(id); if (c) { ouvintes.delete(f); clearTimeout(t); resolver(c); } };
        ouvintes.add(f);
        t = setTimeout(() => { ouvintes.delete(f); resolver(null); }, ms);
      });
    },
    aoMudar(fn) { ouvintes.add(fn); return () => ouvintes.delete(fn); },
  };
}

/* ---------- ações do shell ---------- */

/**
 * Catálogo. `quando(a)` decide por papel, plano, prontos e produto (a = ambiente do shell: workspace, vocab, rotaOk(módulo), pode(papel),
 * empresas, instalar, suporte, temCliente). A ação só aparece se o shell também souber executá-la (fazer[id]).
 * `rotaOk(m)` = a tela existe NESTE produto e a pessoa pode abri-la (rotas.acessoRota): «Nova conversa» some no CRM, «Marcar consulta» some em Anúncios.
 */
export const CATALOGO = Object.freeze([
  { id: "nova-oportunidade", rotulo: a => a.vocab.novo("negocio"), palavras: "nova oportunidade negocio venda orcamento lead criar adicionar", icone: "funil", quando: a => a.rotaOk("crm") && a.pode("atendente") },
  { id: "marcar-consulta", rotulo: () => "Marcar consulta", palavras: "agenda agendar consulta horario marcar atendimento visita", icone: "calendario", quando: a => a.rotaOk("agenda") && a.pode("atendente") },
  { id: "nova-conversa", rotulo: () => "Nova conversa", palavras: "conversa mensagem whatsapp iniciar contato enviar", icone: "chat", quando: a => a.rotaOk("conversas") && a.pode("atendente") },
  { id: "nova-tarefa", rotulo: () => "Nova tarefa", palavras: "tarefa lembrete afazer pendencia criar", icone: "tarefa", quando: a => a.rotaOk("tarefas") && a.pode("atendente") },
  { id: "alternar-tema", rotulo: () => "Alternar tema", palavras: "tema claro escuro aparencia modo noturno dark", icone: "pincel", quando: () => true },
  { id: "trocar-empresa", rotulo: () => "Trocar empresa", palavras: "empresa cliente conta trocar mudar", icone: "empresa", quando: a => a.empresas > 1 },
  { id: "abrir-produto", rotulo: () => "Abrir outro produto", palavras: "produto crm anuncios ads atendimento trocar espaco area", icone: "camadas", quando: a => !!a.temCliente },
  { id: "instalar", rotulo: () => "Instalar o app", palavras: "instalar app aplicativo celular tela inicial", icone: "baixar", quando: a => !!a.instalar },
  { id: "atalhos", rotulo: () => "Atalhos de teclado", palavras: "atalhos teclado ajuda teclas", icone: "ajuda", atalho: "?", quando: () => true },
  { id: "primeiros-passos", rotulo: () => "Primeiros passos", palavras: "primeiros passos comecar configurar checklist ajuda deixe pronto", icone: "check", quando: a => a.rotaOk("inicio") && a.pode("admin") },
  { id: "suporte", rotulo: () => "Falar com o suporte", palavras: "suporte ajuda whatsapp falar contato", icone: "whatsapp", quando: a => !!a.suporte },
  { id: "sair", rotulo: () => "Sair", palavras: "sair logout encerrar desconectar", icone: "sair", quando: () => true },
]);

/** As ações do shell que valem agora para esta pessoa, neste produto. `fazer` = { [id]: () => void }. */
export function acoesPadrao(a, fazer = {}) {
  return CATALOGO.filter(c => typeof fazer[c.id] === "function" && c.quando(a))
    .map(c => ({ id: c.id, rotulo: c.rotulo(a), palavras: c.palavras, icone: c.icone, atalho: c.atalho || "", fazer: fazer[c.id], origem: "shell" }));
}

/** A tela aberta manda nos comandos de mesmo nome (ex.: a Agenda registra «Marcar consulta»): a ação genérica do shell não repete. */
export function juntarAcoes(padrao, daTela) {
  const vistos = new Set(daTela.map(c => normalizar(c.rotulo)));
  return { daTela, geral: padrao.filter(c => !vistos.has(normalizar(c.rotulo))) };
}

/** `rotaOk` do ambiente: a tela existe neste produto E a pessoa pode abri-la. */
export function criarRotaOk({ rotas, op, workspace = null }) {
  return modulo => rotas.rotaNoProduto(workspace, modulo) && rotas.acessoRota(modulo, op) === "ok";
}

/* ---------- Ir para ---------- */

export const PALAVRAS_DESTINO = Object.freeze({
  inicio: "home painel resumo hoje", conversas: "atendimento mensagens whatsapp caixa de entrada inbox",
  crm: "funil oportunidades negocios vendas pipeline kanban contatos pacientes clientes", agenda: "calendario consultas horarios marcar",
  empresas: "organizacoes", tarefas: "afazeres lembretes pendencias", anuncios: "ads meta google campanhas trafego",
  automacoes: "robos fluxos regras", relatorios: "graficos metricas numeros resultados", config: "ajustes preferencias configuracao numero canais equipe",
  admin: "clientes revendas planos dominios plataforma",
});
/** Itens do menu (rotas.itensDoMenu) → destinos da paleta. */
export function destinos(itens) {
  return itens.map(it => ({ id: it.id, rotulo: it.rotulo, hash: `#/${it.rota}`, icone: it.icone, palavras: PALAVRAS_DESTINO[it.id] || "", emConstrucao: !!it.emConstrucao }));
}

/* ---------- Recentes ---------- */

export const TIPOS_RECENTE = Object.freeze({ contato: { icone: "contato", rotulo: "Contato" }, negocio: { icone: "funil", rotulo: "Oportunidade" }, conversa: { icone: "chat", rotulo: "Conversa" } });
export const chaveRecentes = (conta, cliente) => `nx-rec:${conta || "-"}:${cliente || "-"}`;
export const PREFIXO_RECENTES = "nx-rec:";

function limpo(x) {
  if (!x || typeof x.hash !== "string" || !/^#\/[a-z]/.test(x.hash) || x.hash.length > 200) return null;
  const titulo = String(x.titulo || "").trim().slice(0, 80);
  if (!titulo) return null;
  return { hash: x.hash, titulo, sub: String(x.sub || "").trim().slice(0, 80), tipo: Object.hasOwn(TIPOS_RECENTE, x.tipo) ? x.tipo : "contato" };
}

/** Os últimos abertos (5) de UMA empresa de UMA conta, no aparelho. `armazenamento` = localStorage (ou um igual). Nunca lança erro. */
export function criarRecentes({ armazenamento, chave, max = MAX_RECENTES }) {
  const ler = () => {
    try { const v = JSON.parse(armazenamento.getItem(chave) || "[]"); return Array.isArray(v) ? v.map(limpo).filter(Boolean).slice(0, max) : []; } catch { return []; }
  };
  const gravar = lista => { try { armazenamento.setItem(chave, JSON.stringify(lista)); } catch { /* sem armazenamento: some ao recarregar */ } };
  return {
    ler,
    registrar(item) {
      const n = limpo(item);
      if (!n) return ler();
      const atual = ler();
      if (atual[0] && atual[0].hash === n.hash && atual[0].titulo === n.titulo && atual[0].sub === n.sub) return atual;
      const lista = [n, ...atual.filter(x => x.hash !== n.hash)].slice(0, max);
      gravar(lista);
      return lista;
    },
    limpar() { try { armazenamento.removeItem(chave); } catch { /* ok */ } },
  };
}

/** Tela de detalhe aberta (contato, oportunidade, conversa) + o título que ela pôs → item de «Recentes», ou null. */
export function recenteDaRota(r, titulo) {
  const t = String(titulo || "").trim();
  if (!r || !t) return null;
  const partes = r.partes || [];
  const id = x => (/^[A-Za-z0-9_-]{1,64}$/.test(String(x || "")) ? String(x) : null);
  let tipo = null, caminho = null, generico = [];
  if (r.modulo === "contatos" && id(partes[0])) { tipo = "contato"; caminho = `#/contatos/${partes[0]}`; generico = ["contatos", "pacientes", "clientes", "leads"]; }
  else if (r.modulo === "crm" && partes[0] === "negocio" && id(partes[1])) { tipo = "negocio"; caminho = `#/crm/negocio/${partes[1]}`; generico = ["crm", "oportunidades", "orcamentos", "vendas", "negocios", "pacientes", "clientes"]; }
  else if (r.modulo === "conversas" && id(partes[0])) { tipo = "conversa"; caminho = `#/conversas/${partes[0]}`; generico = ["conversas"]; }
  if (!tipo) return null;
  if (generico.includes(normalizar(t))) return null;      // a tela ainda não disse o nome da pessoa
  return { hash: caminho, titulo: t, sub: TIPOS_RECENTE[tipo].rotulo, tipo };
}

/* ---------- atalhos de teclado (folha «?») ---------- */

/** {mod} vira Ctrl ou ⌘ conforme o aparelho. */
export const ATALHOS_GERAIS = Object.freeze([
  Object.freeze({ teclas: ["{mod}", "K"], rotulo: "Abrir a paleta: buscar, ir para uma tela, fazer uma ação" }),
  Object.freeze({ teclas: ["?"], rotulo: "Mostrar esta folha (fora de campos de texto)" }),
  Object.freeze({ teclas: ["↑", "↓"], rotulo: "Na paleta: escolher; Enter abre; Esc fecha" }),
  Object.freeze({ teclas: [">"], rotulo: "Na paleta, no começo do texto: só ações («> nova»)" }),
  Object.freeze({ teclas: ["#"], rotulo: "Na paleta, no começo do texto: achar conversa pelo protocolo" }),
  Object.freeze({ teclas: ["Esc"], rotulo: "Fechar janela, painel, menu ou paleta" }),
  Object.freeze({ teclas: ["{mod}", "Z"], rotulo: "Desfazer a última ação que mostrou «Desfazer»" }),
  Object.freeze({ teclas: ["Tab"], rotulo: "No começo da página: «Ir para…» o conteúdo, a lista, o campo de mensagem" }),
]);
