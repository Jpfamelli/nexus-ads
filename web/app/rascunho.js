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
/* plano 1000 · CA-122: o texto para o paciente (chave «conversa:…») fica no máximo 24 h no aparelho — computador da recepção é
   compartilhado; as notas do CRM seguem com os 7 dias */
export const TTL_CONVERSA_MS = 24 * 3600 * 1000;
/* plano 1000 · CA-100: a varredura (JSON.parse de todas as chaves) roda no máximo 1 vez por minuto — antes, a cada gravação (400 ms digitando) */
export const VARRER_INTERVALO_MS = 60 * 1000;
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
  const ttlPadrao = o.ttlMs || TTL_MS, tetoTotal = o.tetoTotal || TETO_TOTAL_BYTES, tetoUm = o.tetoUm || TETO_UM_BYTES, debounce = o.debounceMs ?? DEBOUNCE_MS;
  const ttlConversa = Math.min(ttlPadrao, o.ttlConversaMs || TTL_CONVERSA_MS);
  const intervaloVarrer = o.varrerMs ?? VARRER_INTERVALO_MS;
  const ativos = new Set();     // controladores ligados (para o flush)

  const seguro = (fn, padrao = null) => { try { return fn(); } catch { return padrao; } };
  const chaveDe = chave => `${PREFIXO}${o.conta ? o.conta() || "-" : "-"}:${o.cliente ? o.cliente() || "-" : "-"}:${chave}`;
  /** CA-122: o prazo de cada chave — «conversa:…» (texto para o cliente) 24 h; o resto, 7 dias. `k` é a chave inteira do storage. */
  const ttlDe = k => (String(k).slice(PREFIXO.length).split(":").slice(2).join(":").startsWith("conversa:") ? ttlConversa : ttlPadrao);
  const venceu = (k, d) => agora() - d.em > ttlDe(k);
  const lerBruto = k => seguro(() => (storage ? storage.getItem(k) : null));
  const ler = k => {
    const bruto = lerBruto(k);
    if (!bruto) return null;
    try { const d = JSON.parse(bruto); return d && typeof d.t === "string" && Number.isFinite(d.em) ? d : null; } catch { return null; }
  };
  const apagarChave = k => { seguro(() => storage && storage.removeItem(k)); indice.delete(k); };
  const todasChaves = () => {
    if (!storage) return [];
    return seguro(() => { const ks = []; for (let i = 0; i < storage.length; i++) { const k = storage.key(i); if (k && k.startsWith(PREFIXO)) ks.push(k); } return ks; }, []);
  };

  /* CA-100: índice em memória (chave → {em, bytes}) montado pela varredura — entre uma varredura e outra o teto total é mantido por ele,
     sem ler e decodificar todas as chaves a cada gravação */
  let indice = new Map(), ultimaVarredura = 0;
  /** Tira o que venceu e mantém o total abaixo do teto (o mais antigo sai primeiro). */
  function varrer() {
    const itens = [];
    for (const k of todasChaves()) {
      const d = ler(k);
      if (!d || venceu(k, d)) { apagarChave(k); continue; }
      itens.push({ k, em: d.em, bytes: (k.length + (lerBruto(k) || "").length) * 2 });
    }
    indice = new Map(itens.map(x => [x.k, { em: x.em, bytes: x.bytes }]));
    aparar();
    ultimaVarredura = agora();
    return indice.size;
  }
  /** O total passou do teto: sai o mais antigo (pelo índice), até caber. */
  function aparar() {
    let total = 0;
    for (const x of indice.values()) total += x.bytes;
    if (total <= tetoTotal) return;
    const velhos = [...indice.entries()].sort((a, b) => a[1].em - b[1].em);
    while (total > tetoTotal && velhos.length) { const [k, x] = velhos.shift(); apagarChave(k); total -= x.bytes; }
  }
  varrer();

  function gravar(k, texto) {
    if (!storage) return false;
    if (!texto || !texto.trim()) { apagarChave(k); return true; }
    // plano 2000d · DC-218: grande demais — o último rascunho bom FICA (antes era apagado junto, calado); quem ligou é avisado (aoGrande)
    if (texto.length * 2 > tetoUm) return false;
    // plano 1500c · CX-042: o mesmo texto não é regravado — antes cada «salvarTudo» (esconder a aba, pagehide) renovava o «em» e o
    // texto do paciente nunca vencia as 24 h do CA-122 enquanto a aba ia e voltava
    const atual = ler(k);
    if (atual && atual.t === texto && !venceu(k, atual)) return true;
    const bruto = JSON.stringify({ t: texto, em: agora() });
    const ok = seguro(() => { storage.setItem(k, bruto); return true; }, false);
    // CA-100: gravou bem — a varredura completa só se já faz 1 min da última (senão o índice cuida do teto); a cota cheia (setItem falhou)
    // varre na hora e tenta uma vez
    if (ok) {
      indice.set(k, { em: agora(), bytes: (k.length + bruto.length) * 2 });
      if (agora() - ultimaVarredura >= intervaloVarrer) varrer(); else aparar();
      return true;
    }
    // plano 1500c · CC-021: a cota cheia varre e tenta de novo — se a 2ª deu certo, o rascunho FOI salvo (e entra no índice, senão o
    // aparar seguinte não o conhecia); antes devolvia false mesmo assim
    varrer();
    const ok2 = seguro(() => { storage.setItem(k, bruto); return true; }, false);
    if (ok2) indice.set(k, { em: agora(), bytes: (k.length + bruto.length) * 2 });
    return ok2;
  }

  /** plano 1500c · CC-023: «descartar» vira «Rascunho descartado · desfazer» por 7 s (um toque errado no celular não perde o texto). */
  const DESFAZER_MS = 7000;
  /** CX-040: «de 25 min atrás », «de 3 h atrás », «de 2 dias atrás » (com o espaço) ou "" quando é de agora há pouco (até 10 min). */
  function quandoRascunho(em) {
    const d = Number.isFinite(em) ? agora() - em : 0;
    if (!(d > 10 * 60000)) return "";
    if (d < 3600000) return `de ${Math.floor(d / 60000)} min atrás `;
    if (d < 86400000) return `de ${Math.floor(d / 3600000)} h atrás `;
    const dias = Math.floor(d / 86400000);
    return `de ${dias} ${dias === 1 ? "dia" : "dias"} atrás `;
  }
  function criarSelo(aoDescartar, aoDesfazer, aoFim, em = null, depois = 0) {
    if (!doc || typeof doc.createElement !== "function") return null;
    const p = doc.createElement("p");
    p.className = "rascunho-selo";
    p.setAttribute("role", "status");
    // plano 1500c · CX-040: rascunho antigo diz de quando é («Rascunho de 3 h atrás restaurado») — a pessoa sabe se ainda vale
    // plano 2000d · DC-110: e quantas mensagens vieram depois dele («· 3 mensagens depois dele»)
    const n = Number(depois) || 0;
    const txt = doc.createTextNode(`Rascunho ${quandoRascunho(em)}restaurado${n > 0 ? ` · ${n} ${n === 1 ? "mensagem" : "mensagens"} depois dele` : ""} · `);
    p.appendChild(txt);
    const b = doc.createElement("button");
    b.type = "button"; b.className = "link"; b.textContent = "descartar";
    // plano 1500c · CX-041: o leitor de tela ouve o que o botão faz (só «descartar», solto, não diz o quê)
    b.setAttribute("aria-label", "Descartar o rascunho restaurado");
    let modo = "restaurado", t = null;
    b.addEventListener("click", () => {
      if (modo === "restaurado") {
        aoDescartar();
        if (typeof aoDesfazer !== "function") { if (aoFim) aoFim(); return; }
        modo = "descartado";
        txt.data = "Rascunho descartado · "; if (typeof txt.textContent === "string") txt.textContent = "Rascunho descartado · ";
        b.textContent = "desfazer";
        b.setAttribute("aria-label", "Desfazer: devolver o rascunho ao campo");   // CX-041
        t = agendar(() => { t = null; modo = "fim"; if (aoFim) aoFim(); }, DESFAZER_MS);
      } else if (modo === "descartado") {
        if (t) { cancelar(t); t = null; }
        modo = "fim";
        aoDesfazer();
      }
    });
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
      // plano 2000d · DC-206: devolve se gravou (o composer só apaga a chave antiga depois de a nova ter ficado)
      const salvarAgora = () => { if (timer) { cancelar(timer); timer = null; } if (parado) return false; return gravar(k, valor()); };
      const tirarSelo = () => { if (selo && selo.parentNode) selo.parentNode.removeChild(selo); selo = null; };
      let avisouGrande = false;
      const aoDigitar = () => {
        if (nosso) return;                                    // o evento que NÓS disparamos ao restaurar não é digitação
        tirarSelo();                                          // a pessoa mexeu: o texto agora é dela
        if (timer) cancelar(timer);
        timer = agendar(() => {
          timer = null;
          const v = valor();
          const ok = gravar(k, v);
          // plano 2000d · DC-218: «rascunho grande demais para guardar» — uma vez, até o texto voltar a caber
          if (!ok && v.length * 2 > tetoUm) { if (!avisouGrande && typeof opcoes.aoGrande === "function") { avisouGrande = true; try { opcoes.aoGrande(); } catch { /* ok */ } } }
          else avisouGrande = false;
        }, debounce);
      };
      // plano 2000d · DC-111: a mesma conversa aberta em outra aba (dois monitores) mudou este rascunho — avisa em vez de gravar por cima calado
      const aoStorage = ev => {
        if (!ev || ev.key !== k || parado) return;
        let deLa = null;
        try { const d = ev.newValue ? JSON.parse(ev.newValue) : null; deLa = d && typeof d.t === "string" ? d.t : null; } catch { deLa = null; }
        if (deLa === null || deLa === valor()) return;
        if (typeof opcoes.aoConflito === "function") { try { opcoes.aoConflito(deLa); } catch { /* ok */ } return; }
        if (!doc || typeof doc.createElement !== "function") return;
        tirarSelo();
        const p = doc.createElement("p");
        p.className = "rascunho-selo rascunho-outra-aba";
        p.setAttribute("role", "status");
        p.appendChild(doc.createTextNode("Este rascunho foi alterado em outra aba · "));
        const b = doc.createElement("button");
        b.type = "button"; b.className = "link"; b.textContent = "usar o de lá";
        b.addEventListener("click", () => {
          if (campo.isContentEditable && campo.value === undefined) campo.textContent = deLa; else campo.value = deLa;
          nosso = true; try { campo.dispatchEvent(new (globalThis.Event || function Ev(t) { this.type = t; })("input", { bubbles: true })); } catch { /* ok */ } nosso = false;
          tirarSelo();
        });
        p.appendChild(b);
        selo = p;
        const alvo = opcoes.seloEm || null;
        if (alvo && typeof alvo.appendChild === "function") alvo.appendChild(p);
        else if (campo.parentNode && typeof campo.parentNode.insertBefore === "function") campo.parentNode.insertBefore(p, campo.nextSibling);
      };
      if (jan && typeof jan.addEventListener === "function") jan.addEventListener("storage", aoStorage);
      const soltarStorage = () => { if (jan && typeof jan.removeEventListener === "function") jan.removeEventListener("storage", aoStorage); };
      const guardado = ler(k);
      if (guardado && venceu(k, guardado)) apagarChave(k);
      else if (guardado && !valor().trim()) {
        // plano 1500c · CC-022: campo contentEditable (editor de nota rica) recebe o texto em textContent
        const porTexto = t => { if (campo.isContentEditable && campo.value === undefined) campo.textContent = t; else campo.value = t; };
        porTexto(guardado.t);
        restaurado = true;
        nosso = true;
        try { campo.dispatchEvent(new (globalThis.Event || function Ev(t) { this.type = t; })("input", { bubbles: true })); } catch { /* sem DOM */ }
        nosso = false;
        const disparar = () => { nosso = true; try { campo.dispatchEvent(new (globalThis.Event || function Ev(t) { this.type = t; })("input", { bubbles: true })); } catch { /* ok */ } nosso = false; };
        const textoGuardado = guardado.t;
        selo = criarSelo(
          () => { porTexto(""); disparar(); apagarChave(k); },
          () => { if (!valor().trim()) { porTexto(textoGuardado); disparar(); gravar(k, textoGuardado); } tirarSelo(); },   // CC-023: o Desfazer devolve o texto
          () => tirarSelo(), guardado.em,
          (() => { try { return typeof opcoes.depoisDe === "function" ? opcoes.depoisDe(guardado.em) : 0; } catch { return 0; } })());   // DC-110
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
        desligar() { salvarAgora(); campo.removeEventListener && campo.removeEventListener("input", aoDigitar); soltarStorage(); tirarSelo(); ativos.delete(ctl); },
        /** Para de guardar SEM gravar (logout, troca de conta): um flush depois (salvarAgora, desligar) não pode ressuscitar o que foi apagado. */
        parar() { parado = true; if (timer) { cancelar(timer); timer = null; } campo.removeEventListener && campo.removeEventListener("input", aoDigitar); soltarStorage(); tirarSelo(); ativos.delete(ctl); },
      };
      ativos.add(ctl);
      return ctl;
    },
    /** Apaga o rascunho de uma chave (o servidor confirmou o envio). */
    apagar(chave) { apagarChave(chaveDe(chave)); },
    existe(chave) { const d = ler(chaveDe(chave)); return !!d && !venceu(chaveDe(chave), d); },
    texto(chave) { const d = ler(chaveDe(chave)); return d && !venceu(chaveDe(chave), d) ? d.t : null; },
    /** Logout: some tudo (de qualquer conta) deste aparelho. */
    apagarTudo() { for (const c of [...ativos]) c.parar(); for (const k of todasChaves()) apagarChave(k); },
    /** Escreve o que está pendente no debounce (antes de sair da tela, esconder a aba…). */
    salvarTudo() { for (const c of [...ativos]) c.salvarAgora(); },
    /** Quantos rascunhos do escopo atual foram mexidos nos últimos 10 min: segura a atualização automática do app. */
    pendentes() {
      const base = `${PREFIXO}${o.conta ? o.conta() || "-" : "-"}:${o.cliente ? o.cliente() || "-" : "-"}:`;
      // plano 2000d · DC-217: pelo índice em memória (o «em» já está nele) — sem ler e decodificar todas as chaves a cada chamada
      let n = 0;
      for (const [k, x] of indice) if (k.startsWith(base) && agora() - x.em <= RECENTE_MS) n++;
      return n;
    },
    /** plano 2000d · DC-113: guarda um valor curto ao lado do rascunho (ex.: «conversa:9:cita» = id da mensagem citada); "" apaga. */
    guardar(chave, texto) { return gravar(chaveDe(chave), String(texto || "")); },
    varrer,
    total() { return todasChaves().length; },
  };
  if (doc && typeof doc.addEventListener === "function") doc.addEventListener("visibilitychange", () => { if (doc.visibilityState === "hidden") api.salvarTudo(); });
  if (jan && typeof jan.addEventListener === "function") jan.addEventListener("pagehide", () => api.salvarTudo());
  return api;
}
