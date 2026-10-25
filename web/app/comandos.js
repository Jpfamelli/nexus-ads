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
/** plano 1500c · UCC-089/UCC-040: distância de edição com troca de vizinhas (Damerau, «cmr» → «crm» = 1). Para cedo quando passa de `teto`. */
export function distancia(a, b, teto = 3) {
  const s = String(a ?? ""), t = String(b ?? "");
  if (Math.abs(s.length - t.length) > teto) return teto + 1;
  const d = Array.from({ length: s.length + 1 }, (_, i) => [i, ...Array(t.length).fill(0)]);
  for (let j = 1; j <= t.length; j++) d[0][j] = j;
  for (let i = 1; i <= s.length; i++) {
    let menor = Infinity;
    for (let j = 1; j <= t.length; j++) {
      const c = s[i - 1] === t[j - 1] ? 0 : 1;
      d[i][j] = Math.min(d[i - 1][j] + 1, d[i][j - 1] + 1, d[i - 1][j - 1] + c);
      if (i > 1 && j > 1 && s[i - 1] === t[j - 2] && s[i - 2] === t[j - 1]) d[i][j] = Math.min(d[i][j], d[i - 2][j - 2] + 1);
      if (d[i][j] < menor) menor = d[i][j];
    }
    if (menor > teto) return teto + 1;
  }
  return d[s.length][t.length];
}
/** Um erro de digitação (1 letra trocada, faltando, sobrando ou duas vizinhas invertidas) numa palavra curta: «cmr» acha «crm». Só palavras de
    3+ letras com a mesma inicial, para não virar ruído. */
function quaseIgual(tok, todo) {
  if (tok.length < 3) return false;
  return todo.split(" ").some(p => p && p[0] === tok[0] && Math.abs(p.length - tok.length) <= 1 && distancia(tok, p, 1) <= 1);
}
/** plano 1500c · UCC-040: «Você quis dizer…?» — a rota existente mais parecida com o que foi digitado no endereço (distância ≤ 2), ou null. */
export function sugerirRota(digitado, opcoes = []) {
  const t = normalizar(digitado).replace(/[^a-z0-9]/g, "");
  if (t.length < 2) return null;
  let melhor = null, menor = 3;
  for (const op of opcoes) {
    const id = typeof op === "string" ? op : op && op.id;
    if (!id) continue;
    const alvos = [id, ...(typeof op === "object" && op.rotulo ? [normalizar(op.rotulo)] : [])];
    for (const a of alvos) {
      const d = a.startsWith(t) && t.length >= 3 ? 1 : distancia(t, a, 2);
      if (d < menor) { menor = d; melhor = id; }
    }
  }
  return melhor;
}

export function pontuar(termo, alvo, extras = "") {
  const t = normalizar(termo);
  if (!t) return 1;
  const a = normalizar(alvo), e = normalizar(extras);
  const todo = e ? `${a} ${e}` : a;
  let pontos = 0;
  for (const tok of t.split(" ")) {
    if (!todo.includes(tok)) {
      if (quaseIgual(tok, todo)) { pontos += 1; continue; }   // plano 1500c · UCC-089: tolera 1 erro de digitação (vale menos que o acerto)
      return 0;
    }
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
 * Plano 100 · A13: comandos que as telas desta rodada registram e a paleta já conhece — rótulo, grupo, ícone e palavras padrão.
 * A tela só manda `{ id, fazer }` (pode trocar o rótulo ou acrescentar palavras); ids: Configurações › Números registra
 * "config.reconferir-numero" (G1), o painel do rastreio "rastreio.painel" (F10) e a Agenda "agenda.presenca" (E1).
 */
export const COMANDOS_CONHECIDOS = Object.freeze({
  "config.reconferir-numero": Object.freeze({ rotulo: "Reconferir o número", grupo: "Nesta tela", icone: "whatsapp", palavras: "reconferir numero whatsapp aparelho conexao codewords estado conectado desconectado sincronizar" }),
  "rastreio.painel": Object.freeze({ rotulo: "Rastreio do site", grupo: "Ir e ver", icone: "globo", palavras: "rastreio site cliques utm campanha origem codigo visitas chave" }),
  "agenda.presenca": Object.freeze({ rotulo: "Presença da consulta", grupo: "Nesta tela", icone: "check", palavras: "presenca compareceu faltou consulta falta comparecimento" }),
});

/**
 * criarComandos() → registro. `registrar({ id, rotulo, palavras?, atalho?, icone?, grupo?, fazer })` devolve cancelar(): a tela chama ao sair
 * (o shell também cancela sozinho ao trocar de tela). Comando inválido não lança erro (não pode derrubar a tela): devolve um cancelar vazio.
 * Id de COMANDOS_CONHECIDOS completa o que a tela não mandou (rótulo, grupo, ícone, palavras).
 */
export function criarComandos() {
  const itens = new Map();
  const ouvintes = new Set();
  const avisar = () => { for (const f of [...ouvintes]) { try { f(); } catch { /* ouvinte não derruba o registro */ } } };
  return {
    registrar(cmd) {
      const base = cmd && Object.hasOwn(COMANDOS_CONHECIDOS, String(cmd.id || "")) ? COMANDOS_CONHECIDOS[cmd.id] : null;
      const rotulo = String((cmd && cmd.rotulo) || (base && base.rotulo) || "").trim();
      if (!cmd || typeof cmd.fazer !== "function" || !rotulo) return () => {};
      const palavras = [base && base.palavras, cmd.palavras].filter(Boolean).join(" ");
      const item = {
        id: String(cmd.id || rotulo).slice(0, 80), rotulo: rotulo.slice(0, 80), palavras: palavras.slice(0, 240),
        atalho: cmd.atalho ? String(cmd.atalho).slice(0, 40) : "", icone: /^[a-z0-9-]{1,24}$/.test(cmd.icone || "") ? cmd.icone : (base ? base.icone : "raio"), fazer: cmd.fazer, origem: "tela",
        grupo: GRUPOS_ACAO.includes(cmd.grupo) ? cmd.grupo : (base ? base.grupo : "Nesta tela"),
        // plano 1000 (CR-187): o comando que sabe criar algo com o texto digitado («Cadastrar «Mariana» como paciente») quando a busca não acha nada
        comTermo: typeof cmd.comTermo === "function" ? cmd.comTermo : null,
        rotuloTermo: typeof cmd.rotuloTermo === "function" ? cmd.rotuloTermo : null,
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
/** O compromisso da agenda na vertical: oficina marca «visita», loja marca «entrega», os demais «consulta» (a mesma palavra das Automações e do Início). */
const palavraAgenda = vertical => (vertical === "oficina" ? "visita" : vertical === "loja" ? "entrega" : "consulta");

/** Grupos das ações na paleta (item 59), na ordem em que aparecem. Comando de tela sem grupo cai em «Nesta tela». */
export const GRUPOS_ACAO = Object.freeze(["Nesta tela", "Criar", "Ir e ver", "Aparência e app", "Ajuda", "Conta"]);

export const CATALOGO = Object.freeze([
  { id: "nova-oportunidade", grupo: "Criar", rotulo: a => a.vocab.novo("negocio"), palavras: "nova oportunidade negocio venda orcamento lead criar adicionar", icone: "funil", quando: a => a.rotaOk("crm") && a.pode("atendente") },
  // `naTela` = o id do comando que a Agenda registra para a mesma ação: com ela aberta, a genérica não repete mesmo que os rótulos difiram
  { id: "marcar-consulta", grupo: "Criar", rotulo: a => `Marcar ${palavraAgenda(a && a.vocab && a.vocab.vertical)}`, palavras: "agenda agendar consulta horario marcar atendimento visita entrega", icone: "calendario", naTela: "agenda.marcar", quando: a => a.rotaOk("agenda") && a.pode("atendente") },
  { id: "nova-conversa", grupo: "Criar", rotulo: () => "Nova conversa", palavras: "conversa mensagem whatsapp iniciar contato enviar", icone: "chat", quando: a => a.rotaOk("conversas") && a.pode("atendente") },
  { id: "nova-tarefa", grupo: "Criar", rotulo: () => "Nova tarefa", palavras: "tarefa lembrete afazer pendencia criar", icone: "tarefa", quando: a => a.rotaOk("tarefas") && a.pode("atendente") },
  { id: "alternar-tema", grupo: "Aparência e app", rotulo: () => "Alternar tema", palavras: "tema claro escuro aparencia modo noturno dark", icone: "pincel", quando: () => true },
  { id: "trocar-empresa", grupo: "Ir e ver", rotulo: () => "Trocar empresa", palavras: "empresa cliente conta trocar mudar", icone: "empresa", quando: a => a.empresas > 1 },
  { id: "abrir-produto", grupo: "Ir e ver", rotulo: () => "Abrir outro produto", palavras: "produto crm anuncios ads atendimento trocar espaco area", icone: "camadas", quando: a => !!a.temCliente },
  { id: "instalar", grupo: "Aparência e app", rotulo: () => "Instalar o app", palavras: "instalar app aplicativo celular tela inicial", icone: "baixar", quando: a => !!a.instalar },
  { id: "atalhos", grupo: "Ajuda", rotulo: () => "Atalhos de teclado", palavras: "atalhos teclado ajuda teclas", icone: "ajuda", atalho: "?", quando: () => true },
  { id: "primeiros-passos", grupo: "Ir e ver", rotulo: () => "Primeiros passos", palavras: "primeiros passos comecar configurar checklist ajuda deixe pronto", icone: "check", quando: a => a.rotaOk("inicio") && a.pode("admin") },
  { id: "suporte", grupo: "Ajuda", rotulo: () => "Falar com o suporte", palavras: "suporte ajuda whatsapp falar contato", icone: "whatsapp", quando: a => !!a.suporte },
  { id: "sair", grupo: "Conta", rotulo: () => "Sair", palavras: "sair logout encerrar desconectar", icone: "sair", quando: () => true },
  // plano 1500c · UCC-082…085: ajuda, plano, tour, recarregar e notificações também pela paleta
  { id: "central-ajuda", grupo: "Ajuda", rotulo: () => "Central de ajuda", palavras: "ajuda duvida duvidas suporte central artigos como faco tutorial", icone: "ajuda", quando: () => true },
  { id: "ver-plano", grupo: "Ir e ver", rotulo: () => "Ver plano e assinar", palavras: "plano assinar assinatura upgrade contratar pagar preco teste gratis limite uso", icone: "cartao", quando: a => !!a.temCliente && a.pode("admin") },
  { id: "tour", grupo: "Ajuda", rotulo: () => "Fazer o tour", palavras: "tour guia passo a passo apresentacao conhecer o sistema", icone: "info", quando: () => true },
  { id: "recarregar", grupo: "Aparência e app", rotulo: () => "Recarregar o app", palavras: "recarregar atualizar reload f5 reiniciar travou", icone: "reabrir", quando: () => true },
  { id: "notificacoes", grupo: "Ir e ver", rotulo: () => "Ver notificações", palavras: "notificacoes avisos sino alertas novidades", icone: "sino", quando: () => true },
  // plano 1500c · UC-028: os três primeiros passos de quem acabou de chegar, direto pela paleta
  { id: "convidar-pessoa", grupo: "Criar", rotulo: () => "Convidar pessoa para a equipe", palavras: "convidar pessoa equipe usuario funcionario colaborador atendente acesso login adicionar", icone: "usuario", quando: a => !!a.temCliente && a.pode("admin") },
  { id: "conectar-whatsapp", grupo: "Criar", rotulo: () => "Conectar WhatsApp", palavras: "conectar whatsapp numero celular qr code ligar canal zap", icone: "whatsapp", quando: a => !!a.temCliente && a.pode("admin") && a.rotaOk("conversas") },
  { id: "importar-contatos", grupo: "Criar", rotulo: a => `Importar ${(a && a.vocab && a.vocab.contatos ? a.vocab.contatos : "contatos").toLowerCase()}`, palavras: "importar contatos planilha excel csv lista clientes pacientes trazer subir", icone: "baixar", quando: a => a.rotaOk("crm") && a.pode("atendente") },
  // plano 1500c · UC-012/UC-037/UC-038: «Comece aqui», novidades da versão e a situação dos serviços
  { id: "comece-aqui", grupo: "Ajuda", rotulo: () => "Comece aqui", palavras: "comece aqui primeiros passos comecar checklist perfil instalar avisos", icone: "check", quando: a => !!a.passosEquipe },
  { id: "novidades", grupo: "Ajuda", rotulo: () => "Novidades desta versão", palavras: "novidades novo mudou atualizacao versao changelog", icone: "info", quando: a => !!a.novidades },
  { id: "situacao-servicos", grupo: "Ajuda", rotulo: () => "Situação dos serviços", palavras: "situacao servicos status conexao numero whatsapp caiu ia funcionando", icone: "info", quando: a => !!a.temCliente },
]);

/** plano 1500c · UCC-098: o tour de primeira vez — 4 paradas no topo do app (o que cada uma faz, em uma frase). `seletor` = onde o balão aponta;
    parada sem o elemento na tela (produto único, celular) é pulada. */
export const PASSOS_TOUR = Object.freeze([
  Object.freeze({ id: "paleta", seletor: ".topo-busca", titulo: "Busca e comandos", texto: "Ache um contato, uma conversa ou faça uma ação sem procurar no menu. Atalho: Ctrl/⌘ + K." }),
  Object.freeze({ id: "produtos", seletor: ".topo-produtos", titulo: "Seus produtos", texto: "Troque entre CRM, Anúncios e Atendimento por aqui. A conta é a mesma." }),
  Object.freeze({ id: "sino", seletor: "#bt-sino", titulo: "Notificações", texto: "Mensagens novas, números que caíram e avisos do sistema chegam no sino." }),
  Object.freeze({ id: "ajuda", seletor: "#bt-conta-topo, .lat-conta", titulo: "Ajuda", texto: "No menu da sua conta: Central de ajuda, atalhos e o suporte. Dá para rever este tour por lá." }),
]);
export const chaveTour = conta => `nx-tour-visto:${conta || "-"}`;
/** As paradas que existem nesta tela (doc.querySelector acha o elemento), na ordem. */
export function paradasDoTour(doc, passos = PASSOS_TOUR) {
  const out = [];
  for (const p of passos) { let el = null; try { el = doc.querySelector(p.seletor); } catch { el = null; } if (el && !el.hidden && !(el.closest && el.closest("[hidden]"))) out.push({ ...p, el }); }
  return out;
}

/** plano 1500c · UCC-086: navegação em sequência — «g» e depois a letra (em até 1,2 s, fora de campo de texto). */
export const SEQUENCIAS_G = Object.freeze({ i: "#/inicio", c: "#/conversas", r: "#/crm", a: "#/agenda", t: "#/tarefas", n: "#/anuncios", u: "#/automacoes", s: "#/config" });
export function criarSequenciaG({ agora = () => Date.now(), janelaMs = 1200, mapa = SEQUENCIAS_G } = {}) {
  let gEm = -Infinity;
  return {
    /** tecla(letra) → o hash a abrir, true (esperando a 2ª letra) ou null (nada). */
    tecla(k) {
      const t = String(k || "").toLowerCase();
      if (agora() - gEm <= janelaMs) { gEm = -Infinity; return Object.hasOwn(mapa, t) ? mapa[t] : null; }
      if (t === "g") { gEm = agora(); return true; }
      return null;
    },
    get esperando() { return agora() - gEm <= janelaMs; },
  };
}

/** As ações do shell que valem agora para esta pessoa, neste produto. `fazer` = { [id]: () => void }. */
export function acoesPadrao(a, fazer = {}) {
  return CATALOGO.filter(c => typeof fazer[c.id] === "function" && c.quando(a))
    .map(c => ({ id: c.id, rotulo: c.rotulo(a), palavras: c.palavras, icone: c.icone, atalho: c.atalho || "", fazer: fazer[c.id], origem: "shell", naTela: c.naTela || "", grupo: c.grupo || "Ir e ver" }));
}

/** Ações por grupo, na ordem de GRUPOS_ACAO (grupo desconhecido vai para o fim); grupos vazios ficam de fora. */
export function agruparAcoes(acoes) {
  const mapa = new Map();
  for (const c of acoes || []) {
    const g = c && c.grupo && GRUPOS_ACAO.includes(c.grupo) ? c.grupo : (c && c.origem === "tela" ? "Nesta tela" : (c && c.grupo) || "Ir e ver");
    if (!mapa.has(g)) mapa.set(g, []);
    mapa.get(g).push(c);
  }
  const ordem = [...GRUPOS_ACAO, ...[...mapa.keys()].filter(g => !GRUPOS_ACAO.includes(g))];
  return ordem.filter(g => mapa.has(g)).map(g => ({ grupo: g, itens: mapa.get(g) }));
}

/* ---------- Últimos usados (ações da paleta) ---------- */

export const MAX_ULTIMOS = 6;
export const chaveUltimos = conta => `nx-cmd:${conta || "-"}`;

/**
 * Os últimos comandos executados pela pessoa neste aparelho (por conta, não por empresa: «Alternar tema» vale em qualquer uma).
 * `armazenamento` = localStorage (ou um igual). Guarda [{id, em}], mais recente primeiro. Nunca lança erro.
 */
export function criarUltimosComandos({ armazenamento, chave, max = MAX_ULTIMOS }) {
  const ler = () => {
    try {
      const v = JSON.parse(armazenamento.getItem(chave) || "[]");
      return Array.isArray(v) ? v.filter(x => x && typeof x.id === "string" && x.id.length <= 80).map(x => ({ id: x.id, em: Number(x.em) || 0 })).slice(0, max) : [];
    } catch { return []; }
  };
  const gravar = lista => { try { armazenamento.setItem(chave, JSON.stringify(lista)); } catch { /* sem armazenamento: some ao recarregar */ } };
  return {
    ler,
    registrar(id, agora = Date.now()) {
      const s = String(id || "").slice(0, 80);
      if (!s) return ler();
      const lista = [{ id: s, em: agora }, ...ler().filter(x => x.id !== s)].slice(0, max);
      gravar(lista);
      return lista;
    },
    limpar() { try { armazenamento.removeItem(chave); } catch { /* ok */ } },
  };
}

/** As ações (das que valem agora) que a pessoa usou por último, na ordem de uso; no máximo `n`. */
export function ultimosUsados(acoes, ultimos, n = 4) {
  const por = new Map((acoes || []).map(c => [c.id, c]));
  return (ultimos || []).map(u => por.get(u.id)).filter(Boolean).slice(0, n);
}

/** Reordena as ações pondo as usadas por último na frente (empate = ordem original). Não altera a lista de entrada. */
export function ordenarPorUso(acoes, ultimos) {
  const pos = new Map((ultimos || []).map((u, i) => [u.id, i]));
  return (acoes || []).map((c, i) => ({ c, i })).sort((a, b) => (pos.has(a.c.id) ? pos.get(a.c.id) : 1e9) - (pos.has(b.c.id) ? pos.get(b.c.id) : 1e9) || a.i - b.i).map(x => x.c);
}

/** A tela aberta manda nos comandos de mesmo nome (ex.: a Agenda registra «Marcar consulta»): a ação genérica do shell não repete. */
export function juntarAcoes(padrao, daTela) {
  const vistos = new Set(daTela.map(c => normalizar(c.rotulo)));
  const ids = new Set(daTela.map(c => c.id));
  return { daTela, geral: padrao.filter(c => !vistos.has(normalizar(c.rotulo)) && !(c.naTela && ids.has(c.naTela))) };
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
  // plano 1500c · UCC-086
  Object.freeze({ teclas: ["G", "C"], rotulo: "Ir para Conversas (G e depois I Início, R CRM, A Agenda, T Tarefas, N Anúncios, U Automações, S Configurações)" }),
]);

/** plano 1500c · UCC-138: trocar de empresa direto pela paleta — digitando parte do nome, as empresas da conta (menos a atual) aparecem
    no grupo «Empresas». Só com 2+ empresas e 2+ letras; todas as palavras do termo precisam aparecer no nome. → [{id, nome}] (até max). */
export function empresasDaPaleta(clientes, termo, { atualId = null, max = 4 } = {}) {
  const lista = Array.isArray(clientes) ? clientes : [];
  const t = normalizar(String(termo || "").replace(/^[>#]\s*/, "")).trim();
  if (lista.length < 2 || t.length < 2) return [];
  const palavras = t.split(/\s+/).filter(Boolean);
  return lista.filter(c => c && c.id !== atualId && palavras.every(p => normalizar(c.nome || "").includes(p))).slice(0, max).map(c => ({ id: c.id, nome: c.nome }));
}

/** plano 1500c · UC-012: o «Comece aqui» de quem é da equipe (não admin) — 4 passos pessoais guardados no aparelho por conta.
    estado = {feitos: [ids], avisos: "default"|"granted"|"denied"|"sem", instalado, podeInstalar, temConversas}.
    Passo que o aparelho não permite (avisos negados/sem suporte, nada para instalar, empresa sem Conversas) sai da lista. */
export const PASSOS_EQUIPE = Object.freeze([
  Object.freeze({ id: "perfil", rotulo: "Completar o seu perfil (nome e foto)", hash: "#/config/perfil" }),
  Object.freeze({ id: "avisos", rotulo: "Permitir avisos de mensagem nova" }),
  Object.freeze({ id: "instalar", rotulo: "Instalar o app neste aparelho" }),
  Object.freeze({ id: "responder", rotulo: "Responder a primeira conversa", hash: "#/conversas" }),
]);
export const chavePassosEquipe = conta => `nx-passos-equipe:${conta || "-"}`;
export function passosDaEquipe(estado = {}) {
  const feitos = new Set(Array.isArray(estado.feitos) ? estado.feitos : []);
  const itens = [];
  for (const p of PASSOS_EQUIPE) {
    if (p.id === "avisos" && (estado.avisos === "denied" || estado.avisos === "sem")) continue;
    if (p.id === "instalar" && !estado.instalado && !estado.podeInstalar) continue;
    if (p.id === "responder" && !estado.temConversas) continue;
    const feito = p.id === "avisos" ? estado.avisos === "granted" || feitos.has("avisos") : p.id === "instalar" ? !!estado.instalado || feitos.has("instalar") : feitos.has(p.id);
    itens.push({ ...p, feito });
  }
  const n = itens.filter(i => i.feito).length;
  return { itens, feitos: n, total: itens.length, completo: itens.length > 0 && n === itens.length };
}
