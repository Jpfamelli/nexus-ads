/* ============================================================
   ÓRBITA — pwa.js · frente B · M12 (service worker + versão nova sem aba quebrada)
   O app.js carrega este arquivo DEPOIS do boot (nada daqui atrasa a primeira pintura) e o chama com o que ele precisa
   (ui, o elemento das faixas, a versão do ?v=). Aqui ficam:
   - o registro do sw.js (só em https ou localhost; no ambiente fictício local só com ?sw=1);
   - a conferência de versão (web/app/versao.json, sem cache) ao voltar ao primeiro plano e a cada 10 min;
   - a faixa «Nova versão do Órbita pronta · Atualizar», aplicada sozinha depois de 2 min ocioso, sem modal aberto,
     sem rascunho, sem fila e sem formulário mexido (o shell segura por 30 min depois da última edição, ou enquanto a aba
     estiver oculta com algo editado; quem tem trabalho pendente avisa por ctx.naoAtualizar). O botão «Atualizar» aplica na hora;
   - o desligamento de emergência (versao.json com "sw": false).
   Como a versão entra na URL do service worker (sw.js?v=<versão>), quem instala o worker novo é a PÁGINA nova: «Atualizar» recarrega,
   a página nova registra sw.js?v=<nova> e, como já roda a versão nova, pede o skipWaiting sozinha (sem faixa). As outras abas, que
   continuam na versão antiga, veem o controllerchange e mostram a faixa.
   Nada importa outro arquivo; tudo que toca o navegador entra por parâmetro (os testes rodam em Node).
   ============================================================ */

export const VERIFICAR_A_CADA_MS = 10 * 60 * 1000;
export const OCIOSO_MS = 2 * 60 * 1000;
export const INTERVALO_OCIOSIDADE_MS = 15 * 1000;
const CHAVE_RECARGA = "nx-versao-recarga";      // sessionStorage: quando a aba recarregou por causa de versão (anti-laço)
const CHAVE_SW_DESLIGADO = "nx-sw-desligado";   // sessionStorage: o desligamento de emergência já rodou nesta aba

/** Compara a versão em uso (?v= do app.js) com a do versao.json. */
export function decidirVersao(atual, remoto) {
  if (!remoto || typeof remoto !== "object" || Array.isArray(remoto)) return { acao: "nada" };
  if (remoto.sw === false) return { acao: "desligar" };
  const v = typeof remoto.versao === "string" ? remoto.versao.trim() : "";
  if (!/^[A-Za-z0-9._-]{1,40}$/.test(v)) return { acao: "nada" };
  return v !== atual ? { acao: "nova", versao: v } : { acao: "nada" };
}

/** O service worker só vale em https ou localhost (http); no ambiente fictício (?dev-falso=1) só com ?sw=1 (senão ele esconde arquivo editado). */
export function swPermitido({ nav, loc }) {
  if (!nav || !nav.serviceWorker || !loc) return false;
  const q = new URLSearchParams(loc.search || "");
  if (q.get("sw") === "0") return false;
  const local = /^(localhost|127\.0\.0\.1|\[::1\])$/.test(String(loc.hostname || ""));
  if (!(loc.protocol === "https:" || (local && loc.protocol === "http:"))) return false;
  if (q.get("dev-falso") === "1" && q.get("sw") !== "1") return false;
  return true;
}

/** Plano 100 · A4: nome de migração → chave comparável («20261008c_canais» → "20261008c"); sem data no começo → null. */
export function chaveMigracao(nome) {
  const m = /^(\d{8})([a-z]?)/.exec(String(nome ?? "").trim());
  return m ? m[1] + (m[2] || "") : null;
}
/** O banco (última migração aplicada, nx_app_sessao.migracao) está atrás do que este front exige (versao.json.min_migracao)? Sem um dos dois lados: false. */
export function migracaoPendente(banco, minima) {
  const b = chaveMigracao(banco), m = chaveMigracao(minima);
  return !!(b && m && b < m);
}

/** ?v= de uma URL de service worker (ou de qualquer arquivo versionado). */
export function versaoDaUrl(url) {
  try { return new URL(String(url), "http://x/").searchParams.get("v"); } catch { return null; }
}

/**
 * Máquina da faixa de versão (pura: relógio, busca e ações entram por parâmetro).
 *   versao, buscar(): Promise<{versao, sw}|null>, agora(), ocupado(): boolean, recarregou(): number|null (ms da última recarga por versão)
 *   aoPronta({versao, motivo}), aoAplicar(), aoDesligar()
 */
export function criarVersao(o) {
  const agora = o.agora || (() => Date.now());
  const ocioso = o.ociosoMs || OCIOSO_MS;
  let pronta = null, ultimaAcao = agora(), aplicando = false;
  const api = {
    get pronta() { return pronta; },
    get aplicando() { return aplicando; },
    /** Marca "tem versão nova" (idempotente) e avisa a faixa. */
    marcarPronta(motivo, versao = null) {
      if (pronta) return false;
      pronta = { motivo, versao };
      if (o.aoPronta) try { o.aoPronta(pronta); } catch (e) { console.error(e); }
      return true;
    },
    /** Consulta o versao.json: versão diferente → pronta; "sw": false → desligar. Falha de rede nunca vira aviso. */
    async verificar() {
      let remoto = null;
      try { remoto = await o.buscar(); } catch { remoto = null; }
      const d = decidirVersao(o.versao, remoto);
      if (d.acao === "desligar") { if (o.aoDesligar) await o.aoDesligar(); }
      else if (d.acao === "nova") api.marcarPronta("versao", d.versao);
      return d;
    },
    interagiu() { ultimaAcao = agora(); },
    /** Pode aplicar sozinha? Pronta, ociosa há 2 min, nada pendente e sem recarga recente (anti-laço). */
    podeAplicarSozinha() {
      if (!pronta || aplicando) return false;
      if (agora() - ultimaAcao < ocioso) return false;
      const rec = o.recarregou ? o.recarregou() : null;
      if (rec != null && agora() - rec < 60_000) return false;
      return !(o.ocupado && o.ocupado());
    },
    /** Regra da ociosidade: chamada a cada 15 s. */
    tique() { return api.podeAplicarSozinha() ? api.aplicar() : null; },
    /** Aplica agora (clique em «Atualizar» ou ociosidade). */
    async aplicar() {
      if (aplicando) return false;
      aplicando = true;
      try { if (o.aoAplicar) await o.aoAplicar(); } catch (e) { aplicando = false; throw e; }
      return true;
    },
  };
  return api;
}

/** Faixa «Nova versão do Órbita pronta · Atualizar» (DOM só com ui.h). */
export function criarFaixaVersao(ui, produto, aoAtualizar) {
  const bt = ui.h("button", { type: "button", class: "bt bt-sec" }, "Atualizar");
  bt.addEventListener("click", () => aoAtualizar());
  return ui.h("div", { class: "faixa faixa-versao", role: "status" }, ui.icone("info"),
    ui.h("p", null, `Nova versão do ${produto || "Órbita"} pronta.`), bt);
}

/**
 * Liga tudo no navegador.
 *   versao, ui, alvo (elemento das faixas do sistema), produto(): string, ocupado(): boolean,
 *   urlsPrecache(): string[] (telas e CSS ainda não abertos), nav/doc/janela/loc/storage/fetchFn (para teste)
 * → { versao, registro, aplicar, verificar, precache, falhaDeImport, destruir }
 */
export function iniciar(o) {
  const nav = o.nav || globalThis.navigator;
  const doc = o.doc || globalThis.document;
  const jan = o.janela || globalThis.window;
  const loc = o.loc || globalThis.location;
  const guarda = o.storage || (() => { try { return globalThis.sessionStorage; } catch { return null; } })();
  const lerNum = k => { try { const v = guarda && guarda.getItem(k); return v ? Number(v) : null; } catch { return null; } };
  const gravar = (k, v) => { try { guarda && guarda.setItem(k, String(v)); } catch { /* sem armazenamento */ } };
  const buscarFn = o.fetchFn || ((...a) => globalThis.fetch(...a));
  const fins = [];
  const timers = [];
  let reg = null, faixa = null, recarregando = false, tinhaControle = false, trocas = 0, adotandoPropria = false;

  const temDialogo = () => !!(doc.querySelector && doc.querySelector("dialog[open]"));
  const recarregar = () => {
    if (recarregando) return;
    recarregando = true;
    gravar(CHAVE_RECARGA, Date.now());
    try { loc.reload(); } catch { recarregando = false; }
  };
  const mostrarFaixa = () => {
    if (!o.alvo || faixa) return;
    faixa = criarFaixaVersao(o.ui, o.produto ? o.produto() : "Órbita", () => { v.aplicar(); });
    o.alvo.appendChild(faixa);
    if (o.ui && o.ui.anunciar) o.ui.anunciar("Nova versão pronta. Use Atualizar quando quiser.");
  };
  const aplicarNoSW = async () => {
    const espera = reg && reg.waiting;
    if (espera) {
      espera.postMessage({ tipo: "pular" });
      // o controllerchange recarrega; se ele não vier (aba sem controlador), recarrega mesmo assim
      timers.push(setTimeout(recarregar, 2500));
    } else recarregar();
  };
  const desligarSW = async () => {
    if (lerNum(CHAVE_SW_DESLIGADO)) return;           // uma vez por aba: sem laço
    gravar(CHAVE_SW_DESLIGADO, 1);
    try { for (const r of await nav.serviceWorker.getRegistrations()) await r.unregister(); } catch { /* ok */ }
    try { for (const n of await globalThis.caches.keys()) if (n.startsWith("orbita-")) await globalThis.caches.delete(n); } catch { /* ok */ }
    recarregar();
  };
  const v = criarVersao({
    versao: o.versao,
    buscar: async () => {
      const r = await buscarFn(new URL(`versao.json?t=${Date.now()}`, loc.href).href, { cache: "no-store" });
      return r.ok ? r.json() : null;
    },
    ocupado: () => temDialogo() || !!(o.ocupado && o.ocupado()),
    recarregou: () => lerNum(CHAVE_RECARGA),
    aoPronta: () => mostrarFaixa(),
    aoAplicar: aplicarNoSW,
    aoDesligar: desligarSW,
  });

  const observar = () => {
    const sw = nav.serviceWorker;
    // um worker em espera: se é da MESMA versão desta página, ela já roda os arquivos novos → só ativa, sem faixa;
    // se é de outra versão (outra aba mais nova instalou), a faixa avisa
    const emEspera = w => {
      if (!w || !sw.controller) return;
      if (versaoDaUrl(w.scriptURL) === o.versao) { adotandoPropria = true; w.postMessage({ tipo: "pular" }); }
      else v.marcarPronta("sw");
    };
    emEspera(reg.waiting);
    reg.addEventListener("updatefound", () => {
      const w = reg.installing;
      if (w) w.addEventListener("statechange", () => { if (w.state === "installed") emEspera(w); });
    });
    sw.addEventListener("controllerchange", () => {
      trocas += 1;
      if (!tinhaControle && trocas === 1) return;     // primeira instalação (clients.claim): não é versão nova
      // o worker desta versão assumiu: agora a lista vai para ELE (no `ready` quem estava no controle era o antigo, cujo cache o activate do novo apaga)
      if (adotandoPropria) { adotandoPropria = false; api.precache(); return; }
      if (v.aplicando) { recarregar(); return; }      // fui eu quem clicou em «Atualizar»
      v.marcarPronta("sw");                           // outra aba trocou o worker: os arquivos antigos podem ter saído do cache
    });
  };

  const api = {
    get versao() { return v; },
    get registro() { return reg; },
    aplicar: () => v.aplicar(),
    verificar: () => v.verificar(),
    /** Manda ao service worker as telas que ainda não foram abertas (e tudo que a página já carregou). */
    precache() {
      try {
        const alvo = nav.serviceWorker && (nav.serviceWorker.controller || (reg && (reg.active || reg.waiting || reg.installing)));
        if (!alvo) return false;
        // worker de OUTRA versão (atualização em andamento): ele baixaria tudo para um cache que o novo apaga ao assumir; a lista vai no controllerchange
        if (alvo.scriptURL && versaoDaUrl(alvo.scriptURL) !== o.versao) return false;
        const vistos = (jan.performance && jan.performance.getEntriesByType ? jan.performance.getEntriesByType("resource") : []).map(e => e.name);
        alvo.postMessage({ tipo: "precache", urls: [...new Set([...(o.urlsPrecache ? o.urlsPrecache() : []), ...vistos])] });
        return true;
      } catch { return false; }
    },
    /** A falha de um import() de módulo (arquivo que a versão nova trocou) vira o mesmo aviso. */
    falhaDeImport() { return v.marcarPronta("import"); },
    destruir() { for (const t of timers) clearTimeout(t); timers.length = 0; for (const f of fins.splice(0)) f(); },
  };
  const ouvir = (alvo, ev, fn, opc) => { if (!alvo || !alvo.addEventListener) return; alvo.addEventListener(ev, fn, opc); fins.push(() => alvo.removeEventListener(ev, fn, opc)); };

  // ociosidade: qualquer toque, tecla ou rolagem zera o relógio
  for (const ev of ["pointerdown", "keydown", "touchstart", "wheel"]) ouvir(doc, ev, () => v.interagiu(), { passive: true, capture: true });
  const ocio = setInterval(() => { v.tique(); }, INTERVALO_OCIOSIDADE_MS);
  fins.push(() => clearInterval(ocio));
  // versão: ao voltar para a aba, ao reconectar e a cada 10 min
  ouvir(doc, "visibilitychange", () => { if (doc.visibilityState === "visible") v.verificar(); });
  ouvir(jan, "online", () => { v.verificar(); });
  const relogio = setInterval(() => { v.verificar(); }, o.verificarMs || VERIFICAR_A_CADA_MS);
  fins.push(() => clearInterval(relogio));

  if (swPermitido({ nav, loc })) {
    tinhaControle = !!nav.serviceWorker.controller;
    nav.serviceWorker.register(`sw.js?v=${encodeURIComponent(o.versao)}`, { scope: "./", updateViaCache: "none" }).then(r => {
      reg = r;
      observar();
      nav.serviceWorker.ready.then(() => api.precache()).catch(() => {});
    }).catch(e => { console.warn("service worker não registrou", e && e.message); });
  }
  return api;
}

/* ============================================================
   M13 — instalável com a marca do cliente e com o produto certo
   O app.js monta o manifesto DEPOIS de resolver a marca (nome do produto da org, cores do esquema, ícones do logo) e o põe num blob:
   (CSP manifest-src 'self' blob:). Se qualquer passo falhar, o <link rel="manifest"> estático segue valendo. No iPhone o ícone vem do
   apple-touch-icon (o iOS ignora o manifesto), então ele e as metas apple-mobile-web-app-* também acompanham a marca.
   ============================================================ */

/** O objeto do manifesto (puro). URLs ABSOLUTAS: um manifesto em blob: não resolve caminho relativo. */
export function construirManifesto({ nome, base, workspace = null, rota = null, fundo, icones = [], lang = "pt-BR" }) {
  const escopo = new URL("./", base).href;
  const inicio = workspace ? `${escopo}?produto=${workspace}${rota ? `#/${rota}` : ""}` : escopo;
  return {
    id: workspace ? `${escopo}?produto=${workspace}` : escopo,
    name: nome.name, short_name: nome.short_name, description: nome.description, lang,
    start_url: inicio, scope: escopo, display: "standalone",
    background_color: fundo, theme_color: fundo,
    icons: icones,
  };
}

/** Ícones estáticos (PNG empacotados) em URL absoluta: valem quando o cliente não tem logo próprio ou a rasterização falha. */
export function iconesPadrao(base) {
  const u = n => new URL(`icones/${n}`, base).href;
  return [
    { src: u("icon-192.png"), sizes: "192x192", type: "image/png", purpose: "any" },
    { src: u("icon-512.png"), sizes: "512x512", type: "image/png", purpose: "any" },
    { src: u("icon-maskable-512.png"), sizes: "512x512", type: "image/png", purpose: "maskable" },
  ];
}

/**
 * Logo/favicon da marca → ícones PNG em data: URL (192 e 512 qualquer, 512 maskable com a zona segura, 180 para o iOS).
 * Lança erro se a imagem não decodificar ou o canvas ficar contaminado (https de outro site sem CORS): o chamador volta aos estáticos.
 */
export async function rasterizarIcones({ origem, fundo, doc = globalThis.document, ImagemCtor = globalThis.Image }) {
  if (!origem) return null;
  const img = new ImagemCtor();
  if (/^https?:/i.test(origem)) img.crossOrigin = "anonymous";
  img.decoding = "async";
  img.src = origem;
  await img.decode();
  const w = img.naturalWidth || img.width, h = img.naturalHeight || img.height;
  if (!w || !h) throw new Error("imagem_vazia");
  const desenhar = (tam, { cheio = false, escala = 0.82 } = {}) => {
    const c = doc.createElement("canvas");
    c.width = c.height = tam;
    const g = c.getContext("2d");
    if (cheio) { g.fillStyle = fundo; g.fillRect(0, 0, tam, tam); }
    const lado = tam * escala, r = Math.min(lado / w, lado / h);
    g.drawImage(img, (tam - w * r) / 2, (tam - h * r) / 2, w * r, h * r);
    return c.toDataURL("image/png");
  };
  return {
    any192: desenhar(192, { escala: 0.86 }), any512: desenhar(512, { escala: 0.86 }),
    maskable512: desenhar(512, { cheio: true, escala: 0.6 }),     // dentro da zona segura (o Android recorta em círculo)
    apple180: desenhar(180, { cheio: true, escala: 0.72 }),
  };
}
export function iconesDeRaster(r) {
  return [
    { src: r.any192, sizes: "192x192", type: "image/png", purpose: "any" },
    { src: r.any512, sizes: "512x512", type: "image/png", purpose: "any" },
    { src: r.maskable512, sizes: "512x512", type: "image/png", purpose: "maskable" },
  ];
}

/** Põe o manifesto no <link rel="manifest"> como blob: (revoga o anterior). Devolve true se aplicou. */
export function aplicarManifesto({ doc = globalThis.document, manifesto, estado, URLCtor = globalThis.URL, BlobCtor = globalThis.Blob }) {
  const link = doc.getElementById("manifest");
  if (!link || typeof URLCtor.createObjectURL !== "function") return false;
  let url;
  try { url = URLCtor.createObjectURL(new BlobCtor([JSON.stringify(manifesto)], { type: "application/manifest+json" })); } catch { return false; }
  const anterior = estado.blob;
  if (!estado.original) estado.original = link.getAttribute("href");
  link.setAttribute("href", url);
  estado.blob = url;
  if (anterior) try { URLCtor.revokeObjectURL(anterior); } catch { /* ok */ }
  return true;
}
/** Falhou algum passo: volta ao manifesto estático (o do produto aberto). */
export function voltarAoEstatico({ doc = globalThis.document, estado, URLCtor = globalThis.URL }) {
  const link = doc.getElementById("manifest");
  if (link && estado.original) link.setAttribute("href", estado.original);
  if (estado.blob) { try { URLCtor.revokeObjectURL(estado.blob); } catch { /* ok */ } estado.blob = null; }
}

/** apple-touch-icon e metas apple-mobile-web-app-* (iPhone/iPad): ícone 180, título e barra de status conforme o esquema. */
export function atualizarMetasApple({ doc = globalThis.document, titulo, icone = null, escuro = false }) {
  const meta = (nome, valor) => { const m = doc.querySelector(`meta[name="${nome}"]`); if (m) m.setAttribute("content", valor); };
  meta("apple-mobile-web-app-title", String(titulo || "Órbita").slice(0, 30));
  meta("apple-mobile-web-app-status-bar-style", escuro ? "black-translucent" : "default");
  const link = doc.getElementById("apple-icone");
  if (link && icone) link.setAttribute("href", icone);
}

/* ---------- instalar o app (menu da conta e folha «Mais») ---------- */
export function emStandalone({ janela = globalThis.window, nav = globalThis.navigator } = {}) {
  try { return !!(janela && janela.matchMedia && janela.matchMedia("(display-mode: standalone)").matches) || (nav && nav.standalone === true); } catch { return false; }
}
export function ehIOS({ ua = "", plataforma = "", toques = 0 } = {}) {
  return /iphone|ipad|ipod/i.test(ua) || (plataforma === "MacIntel" && toques > 1);   // iPad com Safari "desktop"
}
/** Como instalar neste navegador: "evento" (Chrome/Edge/Android: beforeinstallprompt), "ios" (passo a passo) ou null (já instalado ou sem suporte). */
export function modoDeInstalacao({ evento = null, janela = globalThis.window, nav = globalThis.navigator } = {}) {
  if (emStandalone({ janela, nav })) return null;
  if (evento && typeof evento.prompt === "function") return "evento";
  if (ehIOS({ ua: (nav && nav.userAgent) || "", plataforma: (nav && nav.platform) || "", toques: (nav && nav.maxTouchPoints) || 0 })) return "ios";
  return null;
}
export const PASSOS_IOS = Object.freeze(["Toque no botão Compartilhar (o quadrado com a seta para cima).", "Escolha «Adicionar à Tela de Início».", "Confirme em «Adicionar»: o app aparece na tela do aparelho."]);
