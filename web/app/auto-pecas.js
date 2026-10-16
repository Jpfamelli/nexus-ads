/* ============================================================
   ÓRBITA — auto-pecas.js · frente F7 · peças de formulário das Automações
   Fábrica pecas(ui, L): devolve os campos usados pelo editor (interruptor, seletor, entrada, chips de
   dias da semana, chips de tempo de espera, cartões de escolha). Texto de usuário só por textContent
   (ui.h), nenhuma cor aqui (só classes do automacoes.css/app.css), sem import estático.
   `L` = auto-logica.js (decomporDuracao, comporDuracao, formatarDuracao, DIAS_SEMANA, ATALHOS_DIAS, PRESETS_ESPERA).
   ============================================================ */

let seq = 0;
const novoId = p => `au-${p}-${++seq}`;

export function pecas(ui, L) {
  const h = ui.h;

  /** Interruptor acessível (button role=switch). */
  function interruptor({ ligado, rotulo, aoMudar, desabilitado, mostrarTexto = false, textos = ["Desligada", "Ligada"] }) {
    const txt = h("span", { class: "au-sw-txt" }, ligado ? textos[1] : textos[0]);
    const b = h("button", { type: "button", role: "switch", class: "au-sw", "aria-checked": String(!!ligado), "aria-label": rotulo,
      disabled: !!desabilitado }, h("span", { class: "au-sw-trilho", "aria-hidden": "true" }, h("span", { class: "au-sw-bola" })),
      mostrarTexto ? txt : null);
    b.definir = v => { b.setAttribute("aria-checked", String(!!v)); txt.textContent = v ? textos[1] : textos[0]; };
    b.ligado = () => b.getAttribute("aria-checked") === "true";
    b.addEventListener("click", () => { if (b.disabled) return; const v = !b.ligado(); b.definir(v); if (aoMudar) aoMudar(v, b); });
    return b;
  }

  /** <select> com rótulo, opções simples ou em grupos ({grupo, opcoes}). */
  function seletor({ rotulo, valor, opcoes, vazio, aoMudar, desabilitado, ajuda, obrigatorio, classe }) {
    const id = novoId("sel");
    const opt = o => h("option", { value: String(o.valor ?? ""), selected: String(o.valor ?? "") === String(valor ?? ""), disabled: !!o.desabilitado }, o.rotulo);
    const filhos = [];
    if (vazio !== undefined && vazio !== null) filhos.push(h("option", { value: "", selected: valor == null || valor === "" }, vazio));
    for (const o of opcoes || []) {
      if (o.grupo) filhos.push(h("optgroup", { label: o.grupo }, (o.opcoes || []).map(opt)));
      else filhos.push(opt(o));
    }
    // plano 1000b · UB-015: a ajuda («Vazio = primeira etapa do funil»…) é anunciada junto com o campo (aria-describedby)
    const sel = h("select", { id, disabled: !!desabilitado, required: !!obrigatorio, "aria-describedby": ajuda ? `${id}-aj` : null }, filhos);
    if (aoMudar) sel.addEventListener("change", () => aoMudar(sel.value, sel));
    return h("div", { class: ["campo", "campo-select", classe] },
      rotulo ? h("label", { for: id }, rotulo, obrigatorio ? h("span", { class: "obrig", "aria-hidden": "true" }, " *") : null) : null,
      sel, ajuda ? h("small", { class: "campo-ajuda", id: `${id}-aj` }, ajuda) : null);
  }

  function entrada({ rotulo, valor, tipo = "text", max, min, passo, placeholder, aoMudar, desabilitado, ajuda, sufixo, variaveis, linhas, obrigatorio, rotuloOculto, classe }) {
    const id = novoId("in");
    const attrs = { id, disabled: !!desabilitado, placeholder: placeholder || null, required: !!obrigatorio,
      "aria-describedby": ajuda ? `${id}-aj` : null,          // plano 1000b · UB-015
      dataset: variaveis ? { variaveis: "1" } : null };
    let ctl;
    if (tipo === "textarea") ctl = h("textarea", { ...attrs, rows: linhas || 3, maxlength: max || null }, valor ?? "");
    else ctl = h("input", { ...attrs, type: tipo, value: valor ?? "", maxlength: tipo !== "number" && tipo !== "time" && max ? max : null,
      max: tipo === "number" && max != null ? max : null, min: tipo === "number" && min != null ? min : null, step: passo || null,
      // plano 1000b · UB-016: passo inteiro (horas, minutos, prazo, quantidade) abre o teclado numérico sem vírgula
      inputmode: tipo === "number" ? (Number.isInteger(Number(passo ?? 1)) ? "numeric" : "decimal") : null });
    if (aoMudar) ctl.addEventListener("input", () => aoMudar(ctl.value, ctl));
    const lab = rotulo ? h("label", { for: id, class: rotuloOculto ? "sr-only" : null }, rotulo,
      obrigatorio ? h("span", { class: "obrig", "aria-hidden": "true" }, " *") : null) : null;
    return h("div", { class: ["campo", tipo === "textarea" ? "campo-textarea" : "campo-texto", sufixo && "au-com-sufixo", classe] },
      lab, sufixo ? h("div", { class: "au-sufixo" }, ctl, h("span", { class: "au-sufixo-txt", "aria-hidden": "true" }, sufixo)) : ctl,
      ajuda ? h("small", { class: "campo-ajuda", id: `${id}-aj` }, ajuda) : null);
  }

  /** Botão-chip. `modo`: "radio" (um só) ou "marcar" (vários, aria-pressed). */
  function chip({ rotulo, ligado, modo, desabilitado, aoClicar, titulo, extra }) {
    const attrs = modo === "radio" ? { role: "radio", "aria-checked": String(!!ligado) } : { "aria-pressed": String(!!ligado) };
    const b = h("button", { type: "button", class: ["au-chip", extra], disabled: !!desabilitado, title: titulo || null, ...attrs }, rotulo);
    b.marcar = v => { b.setAttribute(modo === "radio" ? "aria-checked" : "aria-pressed", String(!!v)); };
    if (aoClicar) b.addEventListener("click", () => { if (!b.disabled) aoClicar(b); });
    return b;
  }

  /**
   * Grupo de «rádios» (chips): setas, Home e End movem a escolha, como num radiogroup nativo, e o grupo é UMA parada de Tab
   * (roving tabindex: só o marcado — ou o 1º, se nenhum — entra na ordem do Tab; sem isso eram 13 paradas por grupo).
   */
  function setas(grupo) {
    const sincronizar = () => {
      const bs = [...grupo.querySelectorAll("[role=radio]:not(:disabled)")];
      if (!bs.length) return;
      const marcado = bs.find(b => b.getAttribute("aria-checked") === "true") || bs[0];
      for (const b of bs) b.tabIndex = b === marcado ? 0 : -1;
    };
    sincronizar();
    if (typeof MutationObserver === "function") {
      new MutationObserver(sincronizar).observe(grupo, { attributes: true, attributeFilter: ["aria-checked", "disabled"], subtree: true, childList: true });
    }
    grupo.addEventListener("keydown", ev => {
      const bs = [...grupo.querySelectorAll("[role=radio]:not(:disabled)")];
      const i = bs.indexOf(document.activeElement);
      if (i < 0) return;
      let j = null;
      if (ev.key === "ArrowRight" || ev.key === "ArrowDown") j = (i + 1) % bs.length;
      else if (ev.key === "ArrowLeft" || ev.key === "ArrowUp") j = (i - 1 + bs.length) % bs.length;
      else if (ev.key === "Home") j = 0;
      else if (ev.key === "End") j = bs.length - 1;
      if (j === null) return;
      ev.preventDefault(); bs[j].focus(); bs[j].click();
    });
    return grupo;
  }

  /** Dias da semana: sete chips + atalhos («Dias úteis»…). valor = [0..6]; aoMudar(novoArray). */
  function campoDias({ rotulo, valor, aoMudar, desabilitado, ajuda }) {
    let sel = L.normalizarDias(valor);
    const id = novoId("dias");
    const chips = new Map();
    const atalhos = [];
    const marcar = () => {
      for (const [d, b] of chips) b.marcar(sel.includes(d));
      for (const [b, dias] of atalhos) b.marcar(JSON.stringify(dias) === JSON.stringify(sel));
      aviso.hidden = sel.length > 0;
    };
    const muda = nv => { sel = L.normalizarDias(nv); marcar(); aoMudar(sel.slice()); };
    const grupo = h("div", { class: "au-chips", role: "group", "aria-labelledby": id });
    for (const [d, curto, nome] of L.DIAS_SEMANA.slice(1).concat([L.DIAS_SEMANA[0]])) {
      const b = chip({ rotulo: curto, titulo: nome.charAt(0).toUpperCase() + nome.slice(1), modo: "marcar", desabilitado,
        aoClicar: () => muda(sel.includes(d) ? sel.filter(x => x !== d) : sel.concat([d])) });
      b.setAttribute("aria-label", nome.charAt(0).toUpperCase() + nome.slice(1));
      chips.set(d, b); grupo.appendChild(b);
    }
    const linhaAtalhos = h("div", { class: "au-chips au-chips-atalho", role: "group", "aria-label": "Atalhos de dias" });
    for (const [nome, dias] of L.ATALHOS_DIAS) {
      const b = chip({ rotulo: nome, modo: "marcar", desabilitado, extra: "au-chip-atalho", aoClicar: () => muda(dias.slice()) });
      atalhos.push([b, L.normalizarDias(dias)]); linhaAtalhos.appendChild(b);
    }
    const aviso = h("small", { class: "campo-erro", role: "status", hidden: true }, "Escolha pelo menos um dia.");
    const el = h("div", { class: "campo au-campo-dias" },
      h("span", { class: "campo-rot", id }, rotulo || "Dias da semana"), grupo, linhaAtalhos, aviso,
      ajuda ? h("small", { class: "campo-ajuda" }, ajuda) : null);
    marcar();
    return el;
  }

  /**
   * Tempo de espera em minutos: chips prontos + «Outro» (número + minutos/horas/dias).
   * valor = minutos | undefined; aoMudar(minutos | null) — null = valor fora de 1 min…30 dias ou vazio.
   */
  function campoDuracao({ rotulo, valor, aoMudar, desabilitado, min = 1, max = 43200, ajuda }) {
    let atual = Number.isFinite(Number(valor)) && Number(valor) > 0 ? Math.round(Number(valor)) : null;
    const id = novoId("dur");
    const ehPronto = m => L.PRESETS_ESPERA.some(([k]) => k === m);
    let outro = atual != null && !ehPronto(atual);
    const chips = [];
    const grupo = h("div", { class: "au-chips", role: "radiogroup", "aria-labelledby": id, "aria-describedby": `${id}-res` });
    // plano 1000b · UB-193: o resumo não é região viva (mudava a cada dígito com a data de exemplo) — fica ligado ao campo por aria-describedby
    const resumo = h("small", { class: "au-dur-resumo", id: `${id}-res` });
    const dec = L.decomporDuracao(atual || 0);
    const num = entrada({ rotulo: "Quantidade", valor: dec.n || "", tipo: "number", min: 1, passo: 1, desabilitado, rotuloOculto: true, classe: "au-dur-num" });
    num.querySelector("input").setAttribute("aria-describedby", `${id}-res`);
    const un = seletor({ rotulo: "Unidade", valor: dec.un, desabilitado, classe: "au-dur-un",
      opcoes: [{ valor: "min", rotulo: "minutos" }, { valor: "horas", rotulo: "horas" }, { valor: "dias", rotulo: "dias" }] });
    un.querySelector("label").classList.add("sr-only");
    const linhaOutro = h("div", { class: "au-dur-outro", hidden: !outro }, num, un);
    const pintar = () => {
      chips.forEach(([m, b]) => b.marcar(!outro && atual === m));
      btOutro.marcar(outro);
      linhaOutro.hidden = !outro;
      const ok = atual != null && atual >= min && atual <= max;
      // plano 1000 · AS-223: «Esperar 2 dias. Exemplo: se começar agora, continua qui, 16/10 às 10:00.»
      const ex = ok && typeof L.exemploContinuacao === "function" ? L.exemploContinuacao(atual) : "";
      resumo.textContent = atual == null ? (outro ? "Digite um tempo." : "") : ok ? `Esperar ${L.formatarDuracao(atual)}.${ex ? ` ${ex}` : ""}` : "Use de 1 minuto a 30 dias.";
      resumo.classList.toggle("campo-erro", atual != null && !ok || (atual == null && outro));
    };
    const define = m => { atual = m; aoMudar(atual != null && atual >= min && atual <= max ? atual : null); pintar(); };
    for (const [m, rot] of L.PRESETS_ESPERA) {
      const b = chip({ rotulo: rot, modo: "radio", desabilitado, aoClicar: () => { outro = false; define(m); } });
      chips.push([m, b]); grupo.appendChild(b);
    }
    const btOutro = chip({ rotulo: "Outro", modo: "radio", desabilitado, aoClicar: () => {
      outro = true;
      const d = L.decomporDuracao(atual || 0);
      num.querySelector("input").value = d.n || "";
      un.querySelector("select").value = d.un;
      pintar();
      num.querySelector("input").focus();
    } });
    grupo.appendChild(btOutro);
    setas(grupo);
    const lerOutro = () => { const m = L.comporDuracao(num.querySelector("input").value, un.querySelector("select").value); define(m); };
    num.querySelector("input").addEventListener("input", lerOutro);
    un.querySelector("select").addEventListener("change", lerOutro);
    const el = h("div", { class: "campo au-campo-dur" }, h("span", { class: "campo-rot", id }, rotulo || "Esperar"), grupo, linhaOutro, resumo,
      ajuda ? h("small", { class: "campo-ajuda" }, ajuda) : null);
    pintar();
    return el;
  }

  /** Escolha entre cartões (radio): opcoes [{valor, titulo, texto}]. */
  function escolhaCartoes({ rotulo, valor, opcoes, aoMudar, desabilitado }) {
    const id = novoId("esc");
    const bts = [];
    const grupo = h("div", { class: "au-esc", role: "radiogroup", "aria-labelledby": id });
    const marcar = v => bts.forEach(([k, b]) => b.setAttribute("aria-checked", String(k === v)));
    for (const o of opcoes) {
      const b = h("button", { type: "button", role: "radio", class: "au-esc-op", "aria-checked": String(o.valor === valor), disabled: !!desabilitado },
        h("span", { class: "au-esc-tit" }, o.titulo), h("span", { class: "au-esc-txt" }, o.texto));
      b.addEventListener("click", () => { if (b.disabled) return; marcar(o.valor); aoMudar(o.valor); });
      bts.push([o.valor, b]); grupo.appendChild(b);
    }
    setas(grupo);
    return h("div", { class: "campo au-campo-esc" }, h("span", { class: "campo-rot", id }, rotulo), grupo);
  }

  /** Opções vindas da base do editor. */
  function opcoesBase(dados, tipo, { funil, atual } = {}) {
    const b = dados.base || {};
    switch (tipo) {
      case "funil": return (b.funis || []).filter(f => f.ativo !== false).map(f => ({ valor: f.id, rotulo: f.nome + (f.padrao ? " (padrão)" : "") }));
      case "estagio": {
        const grupos = (b.funis || []).filter(f => f.ativo !== false && (!funil || f.id === funil))
          .map(f => ({ grupo: f.nome, opcoes: (f.estagios || []).map(e => ({ valor: e.id, rotulo: e.nome })) }));
        // plano 1000 · AS-040: a etapa JÁ escolhida de um funil desligado continua no seletor (rotulada) — antes sumia e a tela mentia «Escolha a etapa…»
        if (atual) for (const f of b.funis || []) {
          if (f.ativo !== false) continue;
          const e = (f.estagios || []).find(x => x.id === atual);
          if (e) grupos.push({ grupo: `${f.nome} (funil desligado)`, opcoes: [{ valor: e.id, rotulo: `${e.nome} (funil desligado)` }] });
        }
        return grupos;
      }
      // plano 1000b · UB-194: número que caiu (status «erro» do CodeWords ou estado «desconectado») vem marcado no seletor
      case "canal": return (b.canais || []).map(c => ({ valor: c.id, rotulo: c.nome + (c.numero_exibicao ? ` · ${c.numero_exibicao}` : "")
        + (c.estado === "desconectado" || c.status === "erro" ? " (desconectado)" : c.status === "pendente" ? " (aguardando conexão)" : "") }));
      case "departamento": return (b.departamentos || []).map(d => ({ valor: d.id, rotulo: d.nome + (d.padrao ? " (padrão)" : "") }));
      case "etiqueta": return (b.etiquetas || []).map(e => ({ valor: e.id, rotulo: e.nome }));
      case "pessoa": return (b.usuarios || []).map(u => ({ valor: u.id, rotulo: u.nome }));
      case "campo_contato": {   // campos do cadastro, da oportunidade e a pontuação, em grupos
        const grupos = new Map();
        for (const [chave, c] of L.indexarBase(b).camposAtualizar) {
          if (!grupos.has(c.grupo)) grupos.set(c.grupo, []);
          grupos.get(c.grupo).push({ valor: chave, rotulo: c.rotulo });
        }
        return [...grupos].map(([grupo, opcoes]) => ({ grupo, opcoes }));
      }
      default: return [];
    }
  }

  /* ================================================================ plano 50 (frente G) */

  const reduzido = () => { try { return typeof matchMedia === "function" && matchMedia("(prefers-reduced-motion: reduce)").matches; } catch { return false; } };
  const SVG = "http://www.w3.org/2000/svg";
  /** Nó SVG (o ui.h só conhece algumas tags de SVG; aqui precisamos de rect/text/line/use). */
  function s(tag, attrs = {}, ...filhos) {
    const el = document.createElementNS(SVG, tag);
    for (const [k, v] of Object.entries(attrs)) { if (v === null || v === undefined || v === false) continue; el.setAttribute(k, v === true ? "" : String(v)); }
    for (const f of filhos.flat()) if (f !== null && f !== undefined && f !== false) el.append(typeof f === "string" ? document.createTextNode(f) : f);
    return el;
  }

  /** Mini-barra da taxa de sucesso (role=meter): «87 % deram certo» · «ainda sem execuções». */
  function barraTaxa({ pct, total = 0, rotulo = "Taxa de sucesso" }) {
    const nivel = L.nivelTaxa(pct);
    const texto = pct == null ? "ainda sem execuções" : `${pct}% deram certo (${total} ${total === 1 ? "execução" : "execuções"})`;
    return h("span", { class: ["au-taxa", `au-taxa-${nivel}`], role: "meter", "aria-valuemin": "0", "aria-valuemax": "100", "aria-valuenow": String(pct ?? 0),
      "aria-label": rotulo, "aria-valuetext": texto, title: `${rotulo}: ${texto}` },
      h("span", { class: "au-taxa-trilho", "aria-hidden": "true" }, h("i", { style: { "--p": `${pct ?? 0}%` } })),
      h("span", { class: "au-taxa-txt mono", "aria-hidden": "true" }, pct == null ? "—" : `${pct}%`));
  }

  /** Ponto de estado (ligada pulsa de leve; desligada fica parado). Só decoração: o texto vem do switch e das pilulas. */
  function pontoEstado(ligado, { erro = false } = {}) {
    return h("span", { class: ["au-ponto", ligado ? "au-ponto-on" : "au-ponto-off", erro && "au-ponto-erro"], "aria-hidden": "true" });
  }

  /** KPI simples (número grande em Plex Mono + rótulo + ajuda) — usado quando a frente A ainda não entregou ui.kpi. */
  function kpi({ rotulo, valor, ajuda, tom, icone }) {
    const id = novoId("kpi");
    return h("div", { class: ["au-kpi", tom && `au-kpi-${tom}`], role: "group", "aria-labelledby": `${id}-r`, "aria-describedby": ajuda ? `${id}-a` : null, title: ajuda || null },
      h("span", { class: "au-kpi-rot", id: `${id}-r` }, icone ? ui.icone(icone) : null, rotulo),
      h("span", { class: "au-kpi-val mono dado" }, String(valor)),
      ajuda ? h("span", { class: "au-kpi-aj", id: `${id}-a` }, ajuda) : null);
  }

  /**
   * Diagrama ao vivo do fluxo em SVG puro: gatilho → condições → passos. Cada nó é um botão (role=button, foco por Tab,
   * Enter/Espaço) que chama aoFocar(no) — o editor leva o foco até o bloco certo. `nos` vem de L.nosDoDiagrama; o texto
   * alternativo (L.textoDiagrama) vai no <title> e no aria-label do grupo.
   */
  function diagrama({ nos, aoFocar, largura = 300 }) {
    const lista = Array.isArray(nos) ? nos : [];
    const W = Math.max(220, Math.round(largura));
    const ALT = 44, GAP = 16, PX = 6, TRILHO = 22;     // altura do nó, vão entre nós, margem lateral, x da linha-tronco
    const H = PX + lista.length * (ALT + GAP) - GAP + PX;
    const alt = L.textoDiagrama(lista);
    const svg = s("svg", { class: "au-dg-svg", viewBox: `0 0 ${W} ${Math.max(ALT + 2 * PX, H)}`, width: "100%", role: "group", "aria-label": `Diagrama do fluxo. ${alt}`, preserveAspectRatio: "xMinYMin meet" });
    // plano 1000b · UB-195: só o aria-label (um <title> igual fazia o leitor de tela ler o texto inteiro duas vezes)
    // tronco: do centro do 1º nó ao centro do último
    if (lista.length > 1) svg.append(s("line", { class: "au-dg-tronco", x1: TRILHO, x2: TRILHO, y1: PX + ALT / 2, y2: PX + (lista.length - 1) * (ALT + GAP) + ALT / 2, "aria-hidden": "true" }));
    const maxTxt = Math.max(14, Math.floor((W - 64) / 6.6));      // ~6,6 px por letra a 12 px: corta antes de sair do nó
    const corta = (t, n) => { const x = String(t || ""); return x.length > n ? `${x.slice(0, n - 1).trimEnd()}…` : x; };
    lista.forEach((no, i) => {
      const y = PX + i * (ALT + GAP);
      const g = s("g", { class: ["au-dg-no", `au-dg-${no.tipo}`, `au-dg-tom-${no.tom}`, no.inalcancavel && "au-dg-nunca"].filter(Boolean).join(" "),
        // plano 1000b · UB-042: roving tabindex — só o 1º nó entra no Tab; setas ↑↓ (Home/End) andam entre os nós; Enter leva ao bloco
        role: "button", tabindex: i === 0 ? "0" : "-1", "aria-label": `${no.tipo === "mais" ? "" : no.tipo === "gatilho" ? "Gatilho: " : no.tipo === "condicao" ? `Condição ${no.n}: ` : `Passo ${no.n || ""}: `.replace(" :", ":")}${no.rotulo}${no.sub ? `. ${no.sub}` : ""}. Ir até este bloco.`,
        "data-id": no.id, "data-onde": no.onde, "data-indice": no.indice == null ? "" : String(no.indice) });
      g.append(s("rect", { class: "au-dg-ret", x: PX, y, width: W - 2 * PX, height: ALT, rx: no.tipo === "condicao" ? 8 : 12 }));
      g.append(s("rect", { class: "au-dg-faixa", x: PX, y, width: 4, height: ALT, rx: 2 }));
      // bolinha do tronco com o ícone do sprite
      g.append(s("circle", { class: "au-dg-bola", cx: TRILHO, cy: y + ALT / 2, r: 11 }));
      const uso = s("use", { href: `#i-${no.icone || "raio"}`, x: TRILHO - 6, y: y + ALT / 2 - 6, width: 12, height: 12, class: "au-dg-ic" });
      g.append(uso);
      const semSub = !no.sub;
      g.append(s("text", { class: "au-dg-rot", x: TRILHO + 20, y: y + (semSub ? ALT / 2 + 4 : 18) }, corta(no.rotulo, maxTxt)));
      if (!semSub) g.append(s("text", { class: "au-dg-sub", x: TRILHO + 20, y: y + 33 }, corta(no.sub, maxTxt + 4)));
      if (no.n != null && no.tipo === "passo") g.append(s("text", { class: "au-dg-n", x: W - PX - 10, y: y + ALT / 2 + 4, "text-anchor": "end" }, String(no.n)));
      const ir = ev => { if (ev) ev.preventDefault(); if (typeof aoFocar === "function") aoFocar(no); };
      g.addEventListener("click", ir);
      g.addEventListener("keydown", ev => {
        if (ev.key === "Enter" || ev.key === " ") { ir(ev); return; }
        const nosG = [...svg.querySelectorAll(".au-dg-no")];
        const k = nosG.indexOf(g);
        const j = ev.key === "ArrowDown" || ev.key === "ArrowRight" ? Math.min(k + 1, nosG.length - 1)
          : ev.key === "ArrowUp" || ev.key === "ArrowLeft" ? Math.max(k - 1, 0) : ev.key === "Home" ? 0 : ev.key === "End" ? nosG.length - 1 : null;
        if (j === null || k < 0) return;
        ev.preventDefault();
        nosG.forEach((x, n) => x.setAttribute("tabindex", n === j ? "0" : "-1"));
        nosG[j].focus();
      });
      svg.append(g);
    });
    if (!reduzido()) svg.classList.add("au-dg-anim");
    return svg;
  }

  /**
   * Execuções por dia (barras empilhadas: deram certo · em espera · puladas · com erro), calculadas no navegador.
   * `serie` vem de L.execucoesPorDia. Tem título, unidade, estado vazio e «Ver como tabela» (a versão acessível).
   * `carregadas` (número): a série saiu só das últimas N execuções carregadas (janela recortada) e o subtítulo diz isso.
   */
  /** servidor: a série veio de nx_automacao_execucoes_dia (conta todas as execuções da janela, mas só separa «sem erro» × «com erro»). */
  // plano 1000b · UB-039: diaAtivo (AAAA-MM-DD) marca a barra escolhida (aria-pressed + classe); raiz.marcarDia(dia) troca depois
  function graficoDias({ serie, dias, n, titulo = "Execuções por dia", unidade = "execuções", carregadas = null, servidor = false, aoEscolherDia = null, diaAtivo = null }) {
    const lista = Array.isArray(serie) ? serie : [];
    const raiz = h("div", { class: ["au-gd", servidor && "au-gd-servidor"], dataset: { fonte: servidor ? "servidor" : "local" } });
    const nd = dias || lista.length;
    const janela = nd === 1 ? "Hoje" : `Últimos ${nd} dias`;
    const sub = carregadas ? `${janela} · nas últimas ${carregadas} ${carregadas === 1 ? "execução carregada" : "execuções carregadas"}`
      : servidor ? `${janela} · ${n || 0} ${n === 1 ? "execução" : "execuções"}, contadas no servidor`
        : `${janela} · ${n || 0} ${n === 1 ? "execução registrada" : "execuções registradas"}`;
    const cab = h("div", { class: "au-gd-cab" },
      h("div", null, h("p", { class: "rotulo" }, titulo), h("p", { class: "sub au-gd-sub" }, sub)));
    raiz.appendChild(cab);
    const max = Math.max(0, ...lista.map(p => p.total));
    if (!max) {
      // plano 1000b · UB-041: a mesma janela do subtítulo («hoje» com 1 dia; nada de «nos últimos 1 dias»)
      raiz.appendChild(h("p", { class: "au-gd-vazio" }, ui.icone("relogio"), h("span", null, `Nenhuma execução ${nd === 1 ? "hoje" : `nos últimos ${nd} dias`}. Quando a automação rodar, as barras aparecem aqui.`)));
      raiz.marcarDia = () => {};
      return raiz;
    }
    // barras em CSS (grade de colunas): escalam com a largura sem esticar o texto, como um SVG «none» faria
    // o servidor não separa espera/pulada de «deu certo»: o rótulo diz só o que ele sabe («sem erro»)
    const ORDEM = servidor ? [["ok", "sem erro"], ["erro", "com erro"]] : [["ok", "deram certo"], ["espera", "em espera"], ["pulado", "puladas"], ["erro", "com erro"]];
    const n0 = lista.length, cada = n0 > 10 ? Math.ceil(n0 / 7) : 1;
    // plano 1000 · AS-227: com aoEscolherDia, cada dia com execução é um botão que filtra a lista (o grupo deixa de ser uma imagem)
    const clicavel = typeof aoEscolherDia === "function";
    const barras = h("div", { class: ["au-gd-barras", !reduzido() && "au-gd-anim", clicavel && "au-gd-clicavel"], role: clicavel ? "group" : "img", style: { "--n": String(n0) },
      "aria-label": `${titulo}: ${n} ${unidade} em ${nd} ${nd === 1 ? "dia" : "dias"}${carregadas ? `, contando só as últimas ${carregadas} carregadas` : ""}; pico de ${max} em um dia.` },
      h("span", { class: "au-gd-eixo au-gd-eixo-max mono", "aria-hidden": "true" }, String(max)),
      h("span", { class: "au-gd-eixo au-gd-eixo-zero mono", "aria-hidden": "true" }, "0"));
    lista.forEach((p, i) => {
      const titulo2 = `${p.semana} ${p.rotulo}: ${p.total} ${p.total === 1 ? "execução" : "execuções"}${p.total ? ` (${ORDEM.filter(([k]) => p[k]).map(([k, r]) => `${p[k]} ${r}`).join(", ")})` : ""}`;
      const pilha = h("span", { class: "au-gd-pilha" });
      for (const [k] of ORDEM) if (p[k]) pilha.appendChild(h("i", { class: `au-gd-seg au-gd-${k}`, style: { "--h": `${((p[k] / max) * 100).toFixed(2)}%` } }));
      if (!p.total) pilha.appendChild(h("i", { class: "au-gd-seg au-gd-zero" }));
      // todo dia leva o rótulo; o CSS mostra 1 a cada 2 (ou 1 a cada 4 no celular) para as datas não se encavalarem
      const botao = clicavel && p.total && p.dia;
      const col = h(botao ? "button" : "div", { type: botao ? "button" : null, class: ["au-gd-col", p.total && "au-gd-col-tem", (i % cada === 0 || i === n0 - 1) && "au-gd-col-rot"],
        style: { "--i": String(i) }, title: titulo2, "aria-label": botao ? `${titulo2}. Ver só este dia na lista.` : null, dataset: p.dia ? { dia: p.dia } : null,
        "aria-pressed": botao ? String(p.dia === diaAtivo) : null },
        pilha, h("span", { class: "au-gd-x mono", "aria-hidden": "true" }, p.rotulo));
      if (botao) col.addEventListener("click", () => aoEscolherDia(p.dia));
      barras.appendChild(col);
    });
    const caixaG = h("div", { class: "au-gd-caixa" }, barras,
      h("ul", { class: "au-gd-leg", "aria-hidden": "true" }, ORDEM.filter(([k]) => lista.some(p => p[k])).map(([k, r]) => h("li", null, h("i", { class: `au-gd-marca au-gd-${k}` }), r))));
    // a mesma informação em tabela (leitor de tela e quem prefere números)
    const tabela = h("div", { class: "au-gd-tabela", hidden: true },
      h("table", { class: "au-gd-tab" }, h("caption", { class: "sr-only" }, `${titulo}, ${unidade}`),
        h("thead", null, h("tr", null, h("th", { scope: "col" }, "Dia"), ORDEM.map(([, r]) => h("th", { scope: "col", class: "num" }, r)), h("th", { scope: "col", class: "num" }, "Total"))),
        h("tbody", null, lista.filter(p => p.total).map(p => h("tr", null, h("th", { scope: "row" }, `${p.semana} ${p.rotulo}`), ORDEM.map(([k]) => h("td", { class: "num mono" }, String(p[k]))), h("td", { class: "num mono" }, String(p.total)))))));
    const bt = h("button", { type: "button", class: "bt bt-fant bt-p au-gd-alt", "aria-pressed": "false" }, "Ver como tabela");
    bt.addEventListener("click", () => {
      const ligar = tabela.hidden;
      tabela.hidden = !ligar; caixaG.hidden = ligar;
      // plano 1000b · UB-040: o texto fica fixo e o aria-pressed diz o estado («Ver como tabela, pressionado»)
      bt.setAttribute("aria-pressed", String(ligar));
    });
    cab.appendChild(bt);
    raiz.append(caixaG, tabela);
    raiz.marcarDia = dia => {
      for (const c of barras.querySelectorAll("button.au-gd-col")) { const sim = !!dia && c.dataset.dia === dia; c.setAttribute("aria-pressed", String(sim)); c.classList.toggle("au-gd-col-ativa", sim); }
    };
    raiz.marcarDia(diaAtivo);
    return raiz;
  }

  /**
   * plano 1000 · AS-038: tempo em HORAS digitado como horas ou dias (número + unidade). valor = horas | undefined;
   * aoMudar(horas | null) — null = vazio ou fora de min…max (o resumo diz o porquê).
   */
  // plano 1000b · UB-030: min 0 aceita «0» (o prazo da tarefa: «para já») e `ajuda` fica acima da faixa
  function campoHoras({ rotulo, valor, aoMudar, desabilitado, min = 1, max = 2160, obrigatorio, ajuda = null }) {
    const zero = min === 0 && valor !== undefined && valor !== null && valor !== "" && Number(valor) === 0;
    const dec = zero ? { n: 0, un: "horas" } : L.decomporHoras(valor);
    const num = entrada({ rotulo, valor: dec.n, tipo: "number", min: min === 0 ? 0 : 1, passo: 1, desabilitado, obrigatorio, classe: "au-hr-num" });
    const un = seletor({ rotulo: "Unidade", valor: dec.un, desabilitado, classe: "au-dur-un",
      opcoes: [{ valor: "horas", rotulo: "horas" }, { valor: "dias", rotulo: "dias" }] });
    un.querySelector("label").classList.add("sr-only");
    const resumo = h("small", { class: "campo-ajuda au-hr-resumo" });
    const ler = () => {
      const bruto = String(num.querySelector("input").value).trim();
      const hh = min === 0 && bruto !== "" && Number(bruto) === 0 ? 0 : L.comporHoras(bruto, un.querySelector("select").value);
      const ok = hh != null && hh >= min && hh <= max;
      const faixa = min === 0 ? `Até ${max >= 48 ? `${max / 24} dias` : `${max} h`}` : `De ${min} h a ${max >= 48 ? `${max / 24} dias` : `${max} h`}`;
      const pre = ajuda ? `${ajuda} ` : "";
      resumo.textContent = hh == null ? `${pre}${faixa}.` : ok ? (hh === 0 && ajuda ? ajuda : `= ${hh} ${hh === 1 ? "hora" : "horas"}`) : `Use ${faixa.charAt(0).toLowerCase()}${faixa.slice(1)}.`;
      resumo.classList.toggle("campo-erro", hh != null && !ok);
      return ok ? hh : null;
    };
    num.querySelector("input").addEventListener("input", () => aoMudar(ler()));
    un.querySelector("select").addEventListener("change", () => aoMudar(ler()));
    ler();
    return h("div", { class: "campo au-campo-hr" }, h("div", { class: "au-dur-outro" }, num, un), resumo);
  }

  /**
   * plano 1000 · AS-039: tempo em MINUTOS digitado como minutos ou horas («4 horas» em vez de fazer a conta de 240). valor = minutos;
   * aoMudar(minutos | null) — null = vazio ou fora de min…max.
   */
  function campoMinutos({ rotulo, valor, aoMudar, desabilitado, min = 1, max = 1440, obrigatorio }) {
    const m0 = Math.round(Number(valor) || 0);
    const dec = m0 > 0 && m0 % 60 === 0 ? { n: m0 / 60, un: "horas" } : { n: m0 || "", un: "min" };
    const num = entrada({ rotulo, valor: dec.n, tipo: "number", min: 1, passo: 1, desabilitado, obrigatorio, classe: "au-hr-num" });
    const un = seletor({ rotulo: "Unidade", valor: dec.un, desabilitado, classe: "au-dur-un",
      opcoes: [{ valor: "min", rotulo: "minutos" }, { valor: "horas", rotulo: "horas" }] });
    un.querySelector("label").classList.add("sr-only");
    const resumo = h("small", { class: "campo-ajuda au-hr-resumo" });
    const faixa = `De ${L.formatarMinutos(min)} a ${L.formatarMinutos(max)}.`;
    const ler = () => {
      const mm = L.comporDuracao(num.querySelector("input").value, un.querySelector("select").value);
      const ok = mm != null && mm >= min && mm <= max;
      resumo.textContent = mm == null ? faixa : ok ? `= ${mm} ${mm === 1 ? "minuto" : "minutos"}` : `Use ${faixa.charAt(0).toLowerCase()}${faixa.slice(1)}`;
      resumo.classList.toggle("campo-erro", mm != null && !ok);
      return ok ? mm : null;
    };
    num.querySelector("input").addEventListener("input", () => aoMudar(ler()));
    un.querySelector("select").addEventListener("change", () => aoMudar(ler()));
    ler();
    return h("div", { class: "campo au-campo-hr au-campo-min" }, h("div", { class: "au-dur-outro" }, num, un), resumo);
  }

  return { interruptor, seletor, entrada, chip, setas, campoDias, campoDuracao, campoHoras, campoMinutos, escolhaCartoes, opcoesBase, novoId, barraTaxa, pontoEstado, kpi, diagrama, graficoDias };
}
