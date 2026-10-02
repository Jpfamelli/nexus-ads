/* ============================================================
   ÓRBITA — pulso.js · F3
   Uma aba líder lê nx_pulso para cada empresa; as outras recebem o
   resultado por BroadcastChannel. Web Locks é opcional. Sem suporte,
   cada aba usa jitter para não consultar o servidor ao mesmo tempo.
   O intervalo desacelera com inatividade e volta ao normal no retorno.
   ============================================================ */

export const INTERVALOS = Object.freeze({ conversas: 3000, normal: 10000, inativo: 15000, muitoInativo: 30000, escondida: 60000, eleicao: 12000, maximo: 60000 });
const JITTER = .15;

/**
 * @param {object} o
 *   ler(): Promise<{v, notif, nao_lidas, agora}>
 *   aoNotif(n), aoNaoLidas(n): callbacks opcionais
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
  let modo = "normal", timer = null, rodando = false, v = null, notif = null, naoLidas = null, falhas = 0, lendo = false;
  let ultimaAtividade = agora(), papel = "parado", canal = null, escopoAtual = "", lockPendente = false, liberarLider = null;

  function escondida() { return !!(doc && doc.visibilityState === "hidden"); }
  function offline() { return !!(nav && nav.onLine === false); }
  function inatividade() { return Math.max(0, agora() - ultimaAtividade); }
  function baseIntervalo() {
    if (falhas > 0) return Math.min(INTERVALOS.maximo, INTERVALOS.normal * 2 ** Math.min(falhas - 1, 3));
    if (escondida()) return INTERVALOS.escondida;
    if (inatividade() >= 15 * 60_000) return INTERVALOS.muitoInativo;
    if (inatividade() >= 3 * 60_000) return INTERVALOS.inativo;
    return modo === "conversas" ? INTERVALOS.conversas : INTERVALOS.normal;
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
        if (rodando && papel === "seguidora" && d && d.tipo === "resultado") processar(d.dados);
      });
      return true;
    } catch { canal = null; return false; }
  }
  function publicar(r) { try { if (canal) canal.postMessage({ tipo: "resultado", dados: r }); } catch { /* seguidora consulta na próxima rodada */ } }
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
    const nome = `orbita-pulso:${globalThis.location && globalThis.location.host || "orbita"}:${escopoAtual}`;
    try {
      await nav.locks.request(nome, { mode: "exclusive", ifAvailable: true }, async lock => {
        lockPendente = false;
        if (!rodando) { papel = "parado"; return; }
        if (!lock) { papel = "seguidora"; programar(INTERVALOS.eleicao); return; }
        papel = "lider";
        programar(0);
        await new Promise(resolve => { liberarLider = resolve; });
        liberarLider = null;
        papel = "parado";
      });
    } catch {
      lockPendente = false;
      if (rodando) { papel = "solo"; programar(0); }
    }
  }
  async function tique() {
    timer = null;
    if (!rodando || lendo) return;
    if (papel === "seguidora") { await tentarLider(); return; }
    if (papel === "aguardando") return;
    lendo = true;
    try {
      const r = await o.ler();
      falhas = 0;
      processar(r);
      publicar(r);
    } catch (e) {
      if (e && e.codigo === "sessao_invalida") { parar(); return; }
      falhas++;
    }
    lendo = false;
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
    if (timer) cancelar(timer);
    timer = null;
    if (liberarLider) liberarLider();
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
      rodando = true; v = null; notif = null; naoLidas = null; falhas = 0; ultimaAtividade = agora();
      if (abrirCanal()) tentarLider();
      else { papel = "solo"; programar(0); }
    },
    parar,
    /** lê agora (ex.: depois de uma ação do próprio usuário). */
    agora() { if (rodando) programar(0); },
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
