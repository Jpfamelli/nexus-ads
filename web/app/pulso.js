/* ============================================================
   ÓRBITA — pulso.js · F3
   Uma aba líder lê nx_pulso para cada empresa; as outras recebem o
   resultado por BroadcastChannel. Web Locks é opcional. Sem suporte,
   cada aba usa jitter para não consultar o servidor ao mesmo tempo.
   O intervalo desacelera com inatividade e volta ao normal no retorno.
   Plano 100 · A2: aba escondida lê a cada 15 s (era 60 s: o som e o aviso de área de trabalho só existem com a aba escondida, e chegavam
   até 1 min depois); todo resultado publicado por OUTRA aba (líder ou seguidora visível lendo no ritmo dela) vale para esta — inclusive para
   a líder escondida —, desde que seja mais novo que o último visto (`em`).
   ============================================================ */

export const INTERVALOS = Object.freeze({ conversas: 3000, normal: 10000, inativo: 15000, muitoInativo: 30000, escondida: 15000, eleicao: 12000, maximo: 60000 });
const JITTER = .15;

/**
 * @param {object} o
 *   ler(): Promise<{v, notif, nao_lidas, agora, canais?}>
 *   aoNotif(n), aoNaoLidas(n), aoCanais(lista): callbacks opcionais (aoCanais só quando o servidor manda `canais` e a lista muda — A10)
 *   escopo(): id da empresa ativa (para separar abas/empresas)
 *   agendar/cancelar/agora/aleatorio/doc/nav/janela: adaptadores para testes
 */
export function criarPulso(o) {
  const agendar = o.agendar || ((fn, ms) => setTimeout(fn, ms));
  const cancelar = o.cancelar || (t => clearTimeout(t));
  const doc = o.doc || globalThis.document;
  const nav = o.nav || globalThis.navigator;
  const jan = o.janela || globalThis.window;
  const agora = o.agora || (() => Date.now());
  const aleatorio = o.aleatorio || Math.random;

  const assinantes = new Set();
  let modo = "normal", timer = null, rodando = false, v = null, notif = null, naoLidas = null, falhas = 0, lendo = false, canaisTxt = null;
  let ultimaAtividade = agora(), papel = "parado", canal = null, escopoAtual = "", lockPendente = false, liberarLider = null;
  // geracao: cada parar()/iniciar() invalida leituras e pedidos de trava em voo · ultimoDeOutra: quando chegou o último resultado de outra aba
  // largada: a 1ª rodada depois do iniciar() lê na hora, mesmo como seguidora (fixa a referência e o sino sem esperar a líder)
  // ultimoVisto: instante (relógio da máquina) do resultado mais novo já processado — uma publicação atrasada não regride o estado
  let geracao = 0, ultimoDeOutra = -Infinity, largada = false, ultimoVisto = -Infinity;

  function escondida() { return !!(doc && doc.visibilityState === "hidden"); }
  function offline() { return !!(nav && nav.onLine === false); }
  function inatividade() { return Math.max(0, agora() - ultimaAtividade); }
  function baseIntervalo() {
    if (falhas > 0) return Math.min(INTERVALOS.maximo, INTERVALOS.normal * 2 ** Math.min(falhas - 1, 3));
    if (escondida()) return INTERVALOS.escondida;
    if (modo === "conversas") return INTERVALOS.conversas;   // Conversas aberta e visível: sempre 3 s (o atendente espera a mensagem sem tocar na tela)
    if (inatividade() >= 15 * 60_000) return INTERVALOS.muitoInativo;
    if (inatividade() >= 3 * 60_000) return INTERVALOS.inativo;
    return INTERVALOS.normal;
  }
  function intervalo() {
    const base = baseIntervalo();
    const fator = 1 - JITTER + Math.min(1, Math.max(0, Number(aleatorio()) || 0)) * JITTER * 2;
    return Math.max(250, Math.min(INTERVALOS.maximo, Math.round(base * fator)));
  }
  function idEscopo() {
    const bruto = typeof o.escopo === "function" ? o.escopo() : "cliente";
    return String(bruto || "cliente").replace(/[^a-zA-Z0-9_-]/g, "_").slice(0, 100);
  }
  function processar(r) {
    if (!r || typeof r !== "object") return;
    if (r.notif !== undefined && r.notif !== notif) {
      notif = r.notif;
      if (o.aoNotif) try { o.aoNotif(notif); } catch { /* callback isolado */ }
    }
    if (typeof r.nao_lidas === "number") {
      naoLidas = Math.max(0, r.nao_lidas);
      if (o.aoNaoLidas) try { o.aoNaoLidas(naoLidas); } catch { /* callback isolado */ }
    }
    // A10: estado dos números de WhatsApp quando o servidor manda (por detecção); só avisa quando a lista muda
    if (Array.isArray(r.canais)) {
      const txt = JSON.stringify(r.canais);
      if (txt !== canaisTxt) { canaisTxt = txt; if (o.aoCanais) try { o.aoCanais(r.canais.slice()); } catch { /* callback isolado */ } }
    }
    if (r.v !== undefined && r.v !== v) {
      const primeira = v === null;
      v = r.v;
      if (!primeira) for (const fn of [...assinantes]) { try { fn(v); } catch (e) { console.error("pulso: assinante falhou", e); } }
    }
  }
  function abrirCanal() {
    if (canal) { try { canal.close(); } catch { /* ok */ } canal = null; }
    escopoAtual = idEscopo();
    if (!nav || !nav.locks || typeof nav.locks.request !== "function" || typeof globalThis.BroadcastChannel !== "function") return false;
    try {
      const host = globalThis.location && globalThis.location.host || "orbita";
      canal = new BroadcastChannel(`orbita-pulso:${host}:${escopoAtual}`);
      canal.addEventListener("message", ev => {
        const d = ev && ev.data;
        if (!rodando || !d || d.tipo !== "resultado") return;
        // resultado de OUTRA aba: vale para qualquer papel (a líder escondida aproveita a seguidora visível, que lê a cada 3 s) —
        // menos quando é mais velho que o último já visto (publicação que chegou atrasada)
        const em = Number(d.em);
        if (Number.isFinite(em)) { if (em < ultimoVisto) return; ultimoVisto = em; }
        ultimoDeOutra = agora();
        falhas = 0;
        processar(d.dados);
        if (papel === "lider" || papel === "solo") programar();   // conta como a leitura desta rodada: a próxima sai um intervalo inteiro depois
      });
      return true;
    } catch { canal = null; return false; }
  }
  function publicar(r, em) { try { if (canal) canal.postMessage({ tipo: "resultado", dados: r, em }); } catch { /* seguidora consulta na próxima rodada */ } }
  function programar(ms = intervalo()) {
    if (timer) cancelar(timer);
    timer = null;
    if (!rodando || offline() || papel === "aguardando") return;
    timer = agendar(tique, ms);
  }
  async function tentarLider() {
    if (!rodando || papel === "lider" || papel === "solo" || lockPendente) return;
    lockPendente = true;
    papel = "aguardando";
    const g = geracao;
    const nome = `orbita-pulso:${globalThis.location && globalThis.location.host || "orbita"}:${escopoAtual}`;
    try {
      await nav.locks.request(nome, { mode: "exclusive", ifAvailable: true }, async lock => {
        // resposta de um pedido antigo (parar()/iniciar() no meio): devolve a trava na hora e não mexe no estado da rodada nova
        if (g !== geracao) return;
        lockPendente = false;
        if (!lock) { papel = "seguidora"; const ms = largada ? 0 : intervalo(); largada = false; programar(ms); return; }
        papel = "lider";
        const ms = largada ? 0 : intervalo(); largada = false;
        programar(ms);
        await new Promise(resolve => { liberarLider = resolve; });   // só o parar() resolve (e ele mesmo zera liberarLider e o papel)
      });
    } catch {
      if (g !== geracao) return;
      lockPendente = false;
      if (rodando) { papel = "solo"; programar(0); }
    }
  }
  async function tique() {
    timer = null;
    if (!rodando || lendo || papel === "aguardando") return;
    // a seguidora só deixa de ler enquanto outra aba entrega no ritmo que ESTA aba precisa (líder oculta lê a cada 15 s; congelada, nunca)
    if (papel === "seguidora" && agora() - ultimoDeOutra < baseIntervalo() * 1.5) { await tentarLider(); return; }
    const g = geracao;
    lendo = true;
    try {
      const r = await o.ler();
      if (g !== geracao) return;          // parou ou trocou de empresa no meio: o resultado é da rodada anterior
      falhas = 0;
      const em = agora();
      if (em > ultimoVisto) ultimoVisto = em;
      processar(r);
      publicar(r, em);
    } catch (e) {
      if (g !== geracao) return;
      if (e && e.codigo === "sessao_invalida") { parar(); return; }
      falhas++;
    }
    lendo = false;
    if (papel === "seguidora") { await tentarLider(); return; }   // a líder pode ter fechado: tenta assumir; senão reprograma no ritmo desta aba
    programar();
  }
  function aoVisibilidade() { if (rodando) programar(escondida() ? intervalo() : 0); }
  function aoOnline() { if (rodando) programar(0); }
  function aoOffline() { if (timer) { cancelar(timer); timer = null; } }
  function aoAtividade() {
    const antes = inatividade();
    ultimaAtividade = agora();
    if (rodando && antes >= 3 * 60_000) programar(0);
  }
  if (doc && doc.addEventListener) {
    doc.addEventListener("visibilitychange", aoVisibilidade);
    doc.addEventListener("pointerdown", aoAtividade, { passive: true });
    doc.addEventListener("keydown", aoAtividade);
    doc.addEventListener("touchstart", aoAtividade, { passive: true });
  }
  if (jan && jan.addEventListener) { jan.addEventListener("online", aoOnline); jan.addEventListener("offline", aoOffline); }

  function parar() {
    rodando = false;
    geracao++;
    lendo = false;
    if (timer) cancelar(timer);
    timer = null;
    if (liberarLider) { const soltar = liberarLider; liberarLider = null; soltar(); }
    lockPendente = false;
    papel = "parado";
    if (canal) { try { canal.close(); } catch { /* ok */ } canal = null; }
  }
  return {
    /** fn(v) a cada mudança do pulso; devolve cancelar(). */
    assinar(fn) { assinantes.add(fn); return () => assinantes.delete(fn); },
    /** 'conversas' (3 s) ou 'normal' (10 s), com intervalo adaptativo. */
    modo(m) { const novo = m === "conversas" ? "conversas" : "normal"; if (novo !== modo) { modo = novo; if (rodando) programar(); } },
    /** (re)começa do zero — troca de empresa zera referência e escolhe novo líder. */
    iniciar() {
      parar();
      rodando = true; v = null; notif = null; naoLidas = null; canaisTxt = null; falhas = 0; ultimaAtividade = agora(); ultimoDeOutra = -Infinity; ultimoVisto = -Infinity; largada = true;
      if (abrirCanal()) tentarLider();
      else { papel = "solo"; programar(0); }
    },
    parar,
    /** lê agora (ex.: depois de uma ação do próprio usuário). */
    agora() { if (rodando) { ultimoDeOutra = -Infinity; programar(0); } },
    get estado() { return { rodando, modo, v, notif, naoLidas, falhas, papel, intervalo: intervalo() }; },
    destruir() {
      parar(); assinantes.clear();
      if (doc && doc.removeEventListener) {
        doc.removeEventListener("visibilitychange", aoVisibilidade);
        doc.removeEventListener("pointerdown", aoAtividade);
        doc.removeEventListener("keydown", aoAtividade);
        doc.removeEventListener("touchstart", aoAtividade);
      }
      if (jan && jan.removeEventListener) { jan.removeEventListener("online", aoOnline); jan.removeEventListener("offline", aoOffline); }
    },
  };
}

/* ============================================================
   Decisões puras do shell sobre o que o pulso trouxe (plano 100 · A2 e A10) — testáveis sem DOM
   ============================================================ */
/**
 * A2 · avisar ou não quando as não lidas sobem (nx_pulso.nao_lidas). `antes` nulo = primeira leitura (só fixa a referência).
 * Dentro de Conversas a própria tela avisa (conversas.js); fora dela o shell toca o som (preferência `som`, ligada por padrão) e,
 * com a aba escondida e permissão dada, o aviso de área de trabalho (preferência `tela`). Devolve {som, tela, novas}.
 */
export function avisoDeNaoLidas({ antes, depois, emConversas = false, escondida = false, pref = {} } = {}) {
  const a = Number(antes), d = Number(depois);
  if (antes === null || antes === undefined || !Number.isFinite(a) || !Number.isFinite(d)) return { som: false, tela: false, novas: 0 };
  const novas = Math.max(0, Math.round(d - a));
  if (!novas || emConversas) return { som: false, tela: false, novas };
  const p = pref && typeof pref === "object" ? pref : {};
  return { som: p.som !== false, tela: p.tela === true && !!escondida, novas };
}

/**
 * A10 · números de WhatsApp caídos a partir do que o servidor manda, por detecção: `canais` ([{id, nome, estado, desde}] de nx_pulso /
 * nx_app_sessao) quando existir; senão as notificações do sino (canal_caiu / canal_voltou — por canal, a mais recente decide).
 * → [{id, nome, desde, fonte: "canais" | "notificacao"}]
 */
export function canaisCaidosDe({ canais = null, notificacoes = null } = {}) {
  if (Array.isArray(canais)) {
    return canais.filter(c => c && typeof c === "object" && c.estado === "desconectado")
      .map(c => ({ id: c.id ?? null, nome: String(c.nome || "Número de WhatsApp"), desde: c.desde || c.estado_desde || null, fonte: "canais" }));
  }
  if (!Array.isArray(notificacoes)) return [];
  const eventos = notificacoes.filter(n => n && (n.tipo === "canal_caiu" || n.tipo === "canal_voltou"))
    .map(n => {
      const d = n.dados && typeof n.dados === "object" ? n.dados : {};
      const id = d.canal_id ?? d.canal ?? n.canal_id ?? null;
      return { id, chave: String(id ?? n.titulo ?? "canal"), tipo: n.tipo, nome: String(d.canal_nome || d.nome || n.titulo || "Número de WhatsApp"), em: Date.parse(n.criado_em || "") || 0 };
    })
    .sort((a, b) => a.em - b.em);
  const porCanal = new Map();
  for (const e of eventos) porCanal.set(e.chave, e);   // ordem crescente: o último evento de cada canal fica
  return [...porCanal.values()].filter(e => e.tipo === "canal_caiu")
    .map(e => ({ id: e.id, nome: e.nome, desde: e.em ? new Date(e.em).toISOString() : null, fonte: "notificacao" }));
}
