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

export const INTERVALOS = Object.freeze({ conversas: 3000, normal: 10000, inativo: 15000, muitoInativo: 30000, escondida: 15000, escondidaLonga: 60000, eleicao: 12000, maximo: 60000 });
/** Plano 1000 (AS-188): depois de 2 h escondida, a aba sem aviso de área de trabalho lê a cada 60 s. */
export const ESCONDIDA_LONGA_MS = 2 * 3600 * 1000;
const JITTER = .15;
/** plano 1500c · UCC-016/UCC-013: códigos em que repetir não adianta (conta pausada, suspensa, teste vencido, sem acesso): o pulso PARA e avisa o
    shell (aoParar(codigo)). O shell passa os do rede.js (CODIGOS_DE_CONTA) em `codigosDeParada`; estes são o padrão. */
export const CODIGOS_DE_PARADA = Object.freeze(new Set(["sessao_invalida", "conta_pendente", "conta_suspensa", "credenciais_invalidas", "sem_acesso", "teste_expirado", "cliente_pausado"]));
/** plano 1500c · UCC-017: voltar à aba só lê na hora se a última leitura tem mais que isto (alternar abas rápido não vira rajada). */
export const RELER_AO_VOLTAR_MS = 10_000;

/**
 * @param {object} o
 *   ler(): Promise<{v, notif, nao_lidas, agora, canais?}>
 *   aoNotif(n), aoNaoLidas(n), aoCanais(lista): callbacks opcionais (aoCanais só quando o servidor manda `canais` e a lista muda — A10)
 *   escopo(): id da empresa ativa (para separar abas/empresas)
 *   aoParar(motivo): plano 1000b · UB-279 — o pulso parou sozinho ("sessao_invalida"); o shell abre a janela de login
 *   avisoTela(): true quando a pessoa ligou o aviso de área de trabalho (a aba escondida há 2 h+ continua a 15 s; sem ele passa a 60 s)
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

  const paradas = o.codigosDeParada instanceof Set ? o.codigosDeParada : CODIGOS_DE_PARADA;   // plano 1500c · UCC-016
  let ultimaLeitura = -Infinity, clienteTxt = null;   // plano 1500c · UCC-017 (quando chegou o último resultado) · UCC-019 (situação da empresa)
  let escondidaDesde = null;     // plano 1000 (AS-188): desde quando a aba está escondida (conferido a cada rodada)
  function escondida() {
    const e = !!(doc && doc.visibilityState === "hidden");
    if (!e) escondidaDesde = null; else if (escondidaDesde === null) escondidaDesde = agora();
    return e;
  }
  function offline() { return !!(nav && nav.onLine === false); }
  function inatividade() { return Math.max(0, agora() - ultimaAtividade); }
  /** Aba esquecida escondida (mais de 2 h) e sem aviso de área de trabalho ligado: 60 s em vez de 15 s. A decisão A2 (15 s) continua valendo
      no expediente e para quem pediu o aviso de tela (`avisoTela()` → true). ~5.700 leituras por noite viram ~1.500. */
  function intervaloEscondida() {
    if (escondidaDesde !== null && agora() - escondidaDesde >= ESCONDIDA_LONGA_MS) {
      let querAviso = false;
      try { querAviso = typeof o.avisoTela === "function" && !!o.avisoTela(); } catch { querAviso = false; }
      if (!querAviso) return INTERVALOS.escondidaLonga;
    }
    return INTERVALOS.escondida;
  }
  function baseIntervalo() {
    if (falhas > 0) return Math.min(INTERVALOS.maximo, INTERVALOS.normal * 2 ** Math.min(falhas - 1, 3));
    if (escondida()) return intervaloEscondida();
    if (modo === "conversas") return INTERVALOS.conversas;   // Conversas aberta e visível: sempre 3 s (o atendente espera a mensagem sem tocar na tela)
    // plano 1500c · UCC-020: o shell diz que o app está ocioso (10 min sem toque nem tecla, pwa.js) → o teto, 60 s
    try { if (typeof o.ocioso === "function" && o.ocioso()) return INTERVALOS.maximo; } catch { /* segue o ritmo normal */ }
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
      // plano 1500c · UCC-018: com ultima_msg_em (servidor novo) o shell compara o carimbo, não só o total (uma lida + uma nova = mesmo total)
      if (o.aoNaoLidas) try { o.aoNaoLidas(naoLidas, typeof r.ultima_msg_em === "string" ? r.ultima_msg_em : null); } catch { /* callback isolado */ }
    }
    // plano 1500c · UCC-019: situação da empresa (status, teste_ate) quando o servidor manda — o teste que vence com o app aberto aparece na hora
    const cli = r.cliente && typeof r.cliente === "object" ? r.cliente : (r.status !== undefined || r.teste_ate !== undefined ? { status: r.status, teste_ate: r.teste_ate } : null);
    if (cli) {
      const sit = { status: cli.status ?? null, teste_ate: cli.teste_ate ?? null };
      const txt = JSON.stringify(sit);
      if (txt !== clienteTxt) { const primeira = clienteTxt === null; clienteTxt = txt; if (!primeira && o.aoCliente) try { o.aoCliente(sit); } catch { /* callback isolado */ } }
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
        ultimaLeitura = ultimoDeOutra;
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
      ultimaLeitura = em;
      if (em > ultimoVisto) ultimoVisto = em;
      processar(r);
      publicar(r, em);
    } catch (e) {
      if (g !== geracao) return;
      // plano 1000b · UB-279: parado por sessão inválida, o shell fica sabendo (abre a janela de login e reinicia o pulso depois)
      // plano 1500c · UCC-016: conta pausada/suspensa, teste vencido, sem acesso — repetir só gerava tráfego e erro: para também
      const cod = String((e && (e.codigo || e.message)) || "");
      if (paradas.has(cod)) { parar(); if (typeof o.aoParar === "function") try { o.aoParar(cod); } catch { /* callback isolado */ } return; }
      falhas++;
    }
    lendo = false;
    if (papel === "seguidora") { await tentarLider(); return; }   // a líder pode ter fechado: tenta assumir; senão reprograma no ritmo desta aba
    programar();
  }
  function aoVisibilidade() {
    if (!rodando) return;
    if (escondida()) { programar(intervalo()); return; }
    // plano 1500c · UCC-017: voltou à vista — lê na hora só se a última leitura já tem mais de 10 s (senão segue o ritmo)
    if (agora() - ultimaLeitura >= RELER_AO_VOLTAR_MS) programar(0);
    else if (!timer) programar();
  }
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
    doc.addEventListener("wheel", aoAtividade, { passive: true });   // plano 2000d · SX-039: quem lê rolando com a roda do mouse não está ausente
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
      rodando = true; v = null; notif = null; naoLidas = null; canaisTxt = null; clienteTxt = null; ultimaLeitura = -Infinity; falhas = 0; ultimaAtividade = agora(); ultimoDeOutra = -Infinity; ultimoVisto = -Infinity; largada = true;
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
        doc.removeEventListener("wheel", aoAtividade);   // plano 2000d · SX-039
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
/** plano 2000d · DU-268: horário silencioso ({de:"20:00", ate:"08:00"}, pode virar a meia-noite) — `agora` é um Date (hora local do aparelho).
    Sem horário válido: nunca silencioso. */
export function emHorarioSilencioso(silencio, agora = new Date()) {
  // plano 2000d · SX-093: «8:00» (sem o zero) e «20h» também valem — antes o horário inteiro era ignorado e o silêncio nunca ligava
  const min = s => { const m = /^([01]?\d|2[0-3])(?::([0-5]\d)|h([0-5]\d)?)$/.exec(String(s || "").trim().toLowerCase()); return m ? Number(m[1]) * 60 + Number(m[2] || m[3] || 0) : null; };
  if (!silencio || typeof silencio !== "object") return false;
  const de = min(silencio.de), ate = min(silencio.ate);
  if (de === null || ate === null || de === ate || !(agora instanceof Date) || !Number.isFinite(agora.getTime())) return false;
  const t = agora.getHours() * 60 + agora.getMinutes();
  return de < ate ? t >= de && t < ate : t >= de || t < ate;
}
export function avisoDeNaoLidas({ antes, depois, emConversas = false, escondida = false, pref = {}, ultimaAntes = null, ultimaDepois = null, agora = null } = {}) {
  const a = Number(antes), d = Number(depois);
  if (antes === null || antes === undefined || !Number.isFinite(a) || !Number.isFinite(d)) return { som: false, tela: false, novas: 0 };
  let novas = Math.max(0, Math.round(d - a));
  // plano 1500c · UCC-018: mesmo total (uma foi lida, outra chegou no mesmo ciclo) mas a última mensagem é mais nova → há 1 nova
  const ua = Date.parse(String(ultimaAntes || "")), ud = Date.parse(String(ultimaDepois || ""));
  if (!novas && d > 0 && Number.isFinite(ua) && Number.isFinite(ud) && ud > ua) novas = 1;
  if (!novas || emConversas) return { som: false, tela: false, novas };
  const p = pref && typeof pref === "object" ? pref : {};
  // plano 2000d · DU-268: no horário silencioso o número do menu sobe, mas sem som e sem aviso de tela
  if (agora && emHorarioSilencioso(p.silencio, agora)) return { som: false, tela: false, novas, silencio: true };
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
