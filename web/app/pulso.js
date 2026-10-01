/* ============================================================
   ÓRBITA — pulso.js · frente F3 · ESPEC D5 (§3.2)
   "Tempo real" por pulso: lê nx_pulso (uma linha por cliente) e
   só avisa quem assinou quando `v` muda.
   Intervalos: 3 s com Conversas aberta e aba visível · 10 s nas
   outras telas · 60 s com a aba escondida · parado sem internet.
   Erro de rede: espera dobrando até 60 s. sessao_invalida: para.
   A troca futura por Realtime Broadcast fica isolada aqui.
   ============================================================ */

export const INTERVALOS = Object.freeze({ conversas: 3000, normal: 10000, escondida: 60000, maximo: 60000 });

/**
 * @param {object} o
 *   ler(): Promise<{v, notif, agora}>   — chama nx_pulso da empresa ativa
 *   aoNotif(n)                          — não lidas do sino (opcional)
 *   agendar/cancelar                    — setTimeout/clearTimeout (testes)
 *   doc, nav, janela                    — document/navigator/window (testes)
 */
export function criarPulso(o) {
  const agendar = o.agendar || ((fn, ms) => setTimeout(fn, ms));
  const cancelar = o.cancelar || (t => clearTimeout(t));
  const doc = o.doc || globalThis.document;
  const nav = o.nav || globalThis.navigator;
  const jan = o.janela || globalThis.window;

  const assinantes = new Set();
  let modo = "normal", timer = null, rodando = false, v = null, notif = null, falhas = 0, lendo = false;

  function escondida() { return !!(doc && doc.visibilityState === "hidden"); }
  function offline() { return !!(nav && nav.onLine === false); }
  function intervalo() {
    if (falhas > 0) return Math.min(INTERVALOS.maximo, INTERVALOS.normal * 2 ** Math.min(falhas - 1, 3));
    if (escondida()) return INTERVALOS.escondida;
    return modo === "conversas" ? INTERVALOS.conversas : INTERVALOS.normal;
  }
  function programar(ms = intervalo()) {
    if (timer) cancelar(timer);
    timer = null;
    if (!rodando || offline()) return;
    timer = agendar(tique, ms);
  }
  async function tique() {
    timer = null;
    if (!rodando || lendo) return;
    lendo = true;
    try {
      const r = await o.ler();
      falhas = 0;
      if (r && typeof r === "object") {
        if (r.notif !== undefined && r.notif !== notif) { notif = r.notif; if (o.aoNotif) try { o.aoNotif(notif); } catch { /* segue */ } }
        if (r.v !== undefined && r.v !== v) {
          const primeira = v === null;
          v = r.v;
          if (!primeira) for (const fn of [...assinantes]) { try { fn(v); } catch (e) { console.error("pulso: assinante falhou", e); } }
        }
      }
    } catch (e) {
      if (e && e.codigo === "sessao_invalida") { rodando = false; lendo = false; return; }
      falhas++;
    }
    lendo = false;
    programar();
  }
  function aoVisibilidade() { if (rodando) programar(escondida() ? INTERVALOS.escondida : 0); }
  function aoOnline() { if (rodando) programar(0); }
  function aoOffline() { if (timer) { cancelar(timer); timer = null; } }
  if (doc && doc.addEventListener) doc.addEventListener("visibilitychange", aoVisibilidade);
  if (jan && jan.addEventListener) { jan.addEventListener("online", aoOnline); jan.addEventListener("offline", aoOffline); }

  return {
    /** fn(v) a cada mudança do pulso; devolve cancelar(). */
    assinar(fn) { assinantes.add(fn); return () => assinantes.delete(fn); },
    /** 'conversas' (3 s) ou 'normal' (10 s). */
    modo(m) { const novo = m === "conversas" ? "conversas" : "normal"; if (novo !== modo) { modo = novo; if (rodando) programar(); } },
    /** (re)começa do zero — troca de empresa zera a referência. */
    iniciar() { rodando = true; v = null; notif = null; falhas = 0; programar(0); },
    parar() { rodando = false; if (timer) cancelar(timer); timer = null; },
    /** lê agora (ex.: depois de uma ação do próprio usuário). */
    agora() { if (rodando) programar(0); },
    get estado() { return { rodando, modo, v, notif, falhas, intervalo: intervalo() }; },
    destruir() {
      this.parar(); assinantes.clear();
      if (doc && doc.removeEventListener) doc.removeEventListener("visibilitychange", aoVisibilidade);
      if (jan && jan.removeEventListener) { jan.removeEventListener("online", aoOnline); jan.removeEventListener("offline", aoOffline); }
    },
  };
}
