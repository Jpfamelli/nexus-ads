/* ============================================================
   ÓRBITA — rascunho.js · frente B · M17 (rascunhos que sobrevivem)
   ctx.rascunho.ligar(campo, chave) guarda o que a pessoa digita num campo (localStorage, debounce de 400 ms) e devolve o texto
   quando a tela volta a abrir (recarregou, a aba foi descartada, a sessão expirou) com o selo «Rascunho restaurado · descartar».
   Regras:
   - chave = conta + empresa + o que o módulo disser (ex.: "conversa:901" ou "negocio:42:nota"): um rascunho nunca aparece para outra conta/empresa;
   - TTL de 7 dias; teto de ~200 KB no total (o mais antigo sai primeiro) e ~100 KB por rascunho;
   - NUNCA guarda senha nem chave de API: campos type=password, type=hidden/file e qualquer coisa marcada com data-segredo
     (no próprio campo ou em um ancestral) são ignorados;
   - só se apaga quando o módulo diz que o servidor CONFIRMOU o envio (ctx.rascunho.apagar(chave)) ou quando a pessoa descarta;
   - sai tudo no logout (apagarTudo); sessão que caiu NÃO apaga (é justamente para não perder o que foi digitado).
   - todo acesso ao storage fica em try/catch (janela anônima, Safari, cota cheia): sem storage vira no-op, a tela funciona igual.
   Nada aqui importa outro arquivo (testes em Node): o storage, o relógio e o DOM entram por parâmetro.
   ============================================================ */

export const PREFIXO = "nx-rasc:";
export const TTL_MS = 7 * 24 * 3600 * 1000;
export const TETO_TOTAL_BYTES = 200 * 1024;
export const TETO_UM_BYTES = 100 * 1024;
export const DEBOUNCE_MS = 400;
export const RECENTE_MS = 10 * 60 * 1000;     // "rascunho pendente" para a atualização automática: mexido nos últimos 10 min

const TIPOS_PROIBIDOS = new Set(["password", "hidden", "file", "checkbox", "radio", "submit", "button", "reset", "image", "range", "color"]);

/** Este campo pode ter rascunho? (nunca senha, chave de API ou o que o módulo marcou com data-segredo). */
export function campoPermitido(campo) {
  if (!campo || typeof campo !== "object") return false;
  const tag = String(campo.tagName || "").toUpperCase();
  if (tag !== "TEXTAREA" && tag !== "INPUT" && !campo.isContentEditable) return false;
  const tipo = String(campo.type || "").toLowerCase();
  if (TIPOS_PROIBIDOS.has(tipo)) return false;
  const marcado = el => !!(el && typeof el.hasAttribute === "function" && el.hasAttribute("data-segredo"));
  if (marcado(campo)) return false;
  if (typeof campo.closest === "function" && campo.closest("[data-segredo]")) return false;
  const ac = typeof campo.getAttribute === "function" ? String(campo.getAttribute("autocomplete") || "").toLowerCase() : "";
  if (/(^|\s)(current-password|new-password|one-time-code|cc-number|cc-csc)(\s|$)/.test(ac)) return false;
  return true;
}

/**
 * @param {object} o
 *   storage  — Storage-like (getItem/setItem/removeItem/key/length) ou null
 *   conta(), cliente() — escopo atual (ids)
 *   agora(), agendar(fn, ms)/cancelar(t) — relógio (testes)
 *   doc      — document-like: createElement e addEventListener (flush ao esconder a aba)
 *   janela   — window-like: addEventListener("pagehide")
 */
export function criarRascunhos(o = {}) {
  const storage = o.storage !== undefined ? o.storage : (() => { try { return globalThis.localStorage; } catch { return null; } })();
  const agora = o.agora || (() => Date.now());
  const agendar = o.agendar || ((fn, ms) => setTimeout(fn, ms));
  const cancelar = o.cancelar || (t => clearTimeout(t));
  const doc = o.doc !== undefined ? o.doc : globalThis.document;
  const jan = o.janela !== undefined ? o.janela : globalThis.window;
  const ttl = o.ttlMs || TTL_MS, tetoTotal = o.tetoTotal || TETO_TOTAL_BYTES, tetoUm = o.tetoUm || TETO_UM_BYTES, debounce = o.debounceMs ?? DEBOUNCE_MS;
  const ativos = new Set();     // controladores ligados (para o flush)

  const seguro = (fn, padrao = null) => { try { return fn(); } catch { return padrao; } };
  const chaveDe = chave => `${PREFIXO}${o.conta ? o.conta() || "-" : "-"}:${o.cliente ? o.cliente() || "-" : "-"}:${chave}`;
  const lerBruto = k => seguro(() => (storage ? storage.getItem(k) : null));
  const ler = k => {
    const bruto = lerBruto(k);
    if (!bruto) return null;
    try { const d = JSON.parse(bruto); return d && typeof d.t === "string" && Number.isFinite(d.em) ? d : null; } catch { return null; }
  };
  const apagarChave = k => { seguro(() => storage && storage.removeItem(k)); };
  const todasChaves = () => {
    if (!storage) return [];
    return seguro(() => { const ks = []; for (let i = 0; i < storage.length; i++) { const k = storage.key(i); if (k && k.startsWith(PREFIXO)) ks.push(k); } return ks; }, []);
  };

  /** Tira o que venceu e mantém o total abaixo do teto (o mais antigo sai primeiro). */
  function varrer() {
    const itens = [];
    for (const k of todasChaves()) {
      const d = ler(k);
      if (!d || agora() - d.em > ttl) { apagarChave(k); continue; }
      itens.push({ k, em: d.em, bytes: (k.length + (lerBruto(k) || "").length) * 2 });
    }
    let total = itens.reduce((s, x) => s + x.bytes, 0);
    itens.sort((a, b) => a.em - b.em);
    while (total > tetoTotal && itens.length) { const x = itens.shift(); apagarChave(x.k); total -= x.bytes; }
    return itens.length;
  }
  varrer();

  function gravar(k, texto) {
    if (!storage) return false;
    if (!texto || !texto.trim()) { apagarChave(k); return true; }
    if (texto.length * 2 > tetoUm) { apagarChave(k); return false; }
    const ok = seguro(() => { storage.setItem(k, JSON.stringify({ t: texto, em: agora() })); return true; }, false);
    if (ok) varrer();
    else { varrer(); seguro(() => storage.setItem(k, JSON.stringify({ t: texto, em: agora() }))); }   // cota cheia: limpa o mais velho e tenta uma vez
    return ok;
  }

  function criarSelo(aoDescartar) {
    if (!doc || typeof doc.createElement !== "function") return null;
    const p = doc.createElement("p");
    p.className = "rascunho-selo";
    p.setAttribute("role", "status");
    p.appendChild(doc.createTextNode("Rascunho restaurado · "));
    const b = doc.createElement("button");
    b.type = "button"; b.className = "link"; b.textContent = "descartar";
    b.addEventListener("click", () => aoDescartar());
    p.appendChild(b);
    return p;
  }

  const api = {
    /**
     * Liga o campo ao rascunho `chave` (do módulo). Devolve {restaurado, apagar(), desligar(), salvarAgora()}.
     * opcoes: { seloEm: elemento onde o selo entra (padrão: logo depois do campo) }
     */
    ligar(campo, chave, opcoes = {}) {
      const inerte = { restaurado: false, apagar() {}, desligar() {}, salvarAgora() {} };
      if (!campoPermitido(campo) || !chave) return inerte;
      const k = chaveDe(chave);
      let timer = null, selo = null, nosso = false, restaurado = false;
      let parado = false;       // depois de parar() (logout) nada mais é gravado: o desligar() da tela que desmonta em seguida não pode ressuscitar o rascunho
      const valor = () => (campo.isContentEditable && campo.value === undefined ? String(campo.textContent || "") : String(campo.value ?? ""));
      const salvarAgora = () => { if (timer) { cancelar(timer); timer = null; } if (parado) return; gravar(k, valor()); };
      const tirarSelo = () => { if (selo && selo.parentNode) selo.parentNode.removeChild(selo); selo = null; };
      const aoDigitar = () => {
        if (nosso) return;                                    // o evento que NÓS disparamos ao restaurar não é digitação
        tirarSelo();                                          // a pessoa mexeu: o texto agora é dela
        if (timer) cancelar(timer);
        timer = agendar(() => { timer = null; gravar(k, valor()); }, debounce);
      };
      const guardado = ler(k);
      if (guardado && agora() - guardado.em > ttl) apagarChave(k);
      else if (guardado && !valor().trim()) {
        campo.value = guardado.t;
        restaurado = true;
        nosso = true;
        try { campo.dispatchEvent(new (globalThis.Event || function Ev(t) { this.type = t; })("input", { bubbles: true })); } catch { /* sem DOM */ }
        nosso = false;
        selo = criarSelo(() => { campo.value = ""; nosso = true; try { campo.dispatchEvent(new (globalThis.Event || function Ev(t) { this.type = t; })("input", { bubbles: true })); } catch { /* ok */ } nosso = false; apagarChave(k); tirarSelo(); });
        const alvo = opcoes.seloEm || null;
        if (selo) {
          if (alvo && typeof alvo.appendChild === "function") alvo.appendChild(selo);
          else if (campo.parentNode && typeof campo.parentNode.insertBefore === "function") campo.parentNode.insertBefore(selo, campo.nextSibling);
        }
      }
      campo.addEventListener("input", aoDigitar);
      const ctl = {
        restaurado,
        salvarAgora,
        /** O servidor confirmou o envio: some o rascunho e o selo. */
        apagar() { if (timer) { cancelar(timer); timer = null; } apagarChave(k); tirarSelo(); },
        desligar() { salvarAgora(); campo.removeEventListener && campo.removeEventListener("input", aoDigitar); tirarSelo(); ativos.delete(ctl); },
        /** Para de guardar SEM gravar (logout, troca de conta): um flush depois (salvarAgora, desligar) não pode ressuscitar o que foi apagado. */
        parar() { parado = true; if (timer) { cancelar(timer); timer = null; } campo.removeEventListener && campo.removeEventListener("input", aoDigitar); tirarSelo(); ativos.delete(ctl); },
      };
      ativos.add(ctl);
      return ctl;
    },
    /** Apaga o rascunho de uma chave (o servidor confirmou o envio). */
    apagar(chave) { apagarChave(chaveDe(chave)); },
    existe(chave) { const d = ler(chaveDe(chave)); return !!d && agora() - d.em <= ttl; },
    texto(chave) { const d = ler(chaveDe(chave)); return d && agora() - d.em <= ttl ? d.t : null; },
    /** Logout: some tudo (de qualquer conta) deste aparelho. */
    apagarTudo() { for (const c of [...ativos]) c.parar(); for (const k of todasChaves()) apagarChave(k); },
    /** Escreve o que está pendente no debounce (antes de sair da tela, esconder a aba…). */
    salvarTudo() { for (const c of [...ativos]) c.salvarAgora(); },
    /** Quantos rascunhos do escopo atual foram mexidos nos últimos 10 min: segura a atualização automática do app. */
    pendentes() {
      const base = `${PREFIXO}${o.conta ? o.conta() || "-" : "-"}:${o.cliente ? o.cliente() || "-" : "-"}:`;
      let n = 0;
      for (const k of todasChaves()) { if (!k.startsWith(base)) continue; const d = ler(k); if (d && agora() - d.em <= RECENTE_MS) n++; }
      return n;
    },
    varrer,
    total() { return todasChaves().length; },
  };
  if (doc && typeof doc.addEventListener === "function") doc.addEventListener("visibilitychange", () => { if (doc.visibilityState === "hidden") api.salvarTudo(); });
  if (jan && typeof jan.addEventListener === "function") jan.addEventListener("pagehide", () => api.salvarTudo());
  return api;
}
