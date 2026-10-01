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
    const sel = h("select", { id, disabled: !!desabilitado, required: !!obrigatorio }, filhos);
    if (aoMudar) sel.addEventListener("change", () => aoMudar(sel.value, sel));
    return h("div", { class: ["campo", "campo-select", classe] },
      rotulo ? h("label", { for: id }, rotulo, obrigatorio ? h("span", { class: "obrig", "aria-hidden": "true" }, " *") : null) : null,
      sel, ajuda ? h("small", { class: "campo-ajuda" }, ajuda) : null);
  }

  function entrada({ rotulo, valor, tipo = "text", max, min, passo, placeholder, aoMudar, desabilitado, ajuda, sufixo, variaveis, linhas, obrigatorio, rotuloOculto, classe }) {
    const id = novoId("in");
    const attrs = { id, disabled: !!desabilitado, placeholder: placeholder || null, required: !!obrigatorio,
      dataset: variaveis ? { variaveis: "1" } : null };
    let ctl;
    if (tipo === "textarea") ctl = h("textarea", { ...attrs, rows: linhas || 3, maxlength: max || null }, valor ?? "");
    else ctl = h("input", { ...attrs, type: tipo, value: valor ?? "", maxlength: tipo !== "number" && tipo !== "time" && max ? max : null,
      max: tipo === "number" && max != null ? max : null, min: tipo === "number" && min != null ? min : null, step: passo || null,
      inputmode: tipo === "number" ? "decimal" : null });
    if (aoMudar) ctl.addEventListener("input", () => aoMudar(ctl.value, ctl));
    const lab = rotulo ? h("label", { for: id, class: rotuloOculto ? "sr-only" : null }, rotulo,
      obrigatorio ? h("span", { class: "obrig", "aria-hidden": "true" }, " *") : null) : null;
    return h("div", { class: ["campo", tipo === "textarea" ? "campo-textarea" : "campo-texto", sufixo && "au-com-sufixo", classe] },
      lab, sufixo ? h("div", { class: "au-sufixo" }, ctl, h("span", { class: "au-sufixo-txt", "aria-hidden": "true" }, sufixo)) : ctl,
      ajuda ? h("small", { class: "campo-ajuda" }, ajuda) : null);
  }

  /** Botão-chip. `modo`: "radio" (um só) ou "marcar" (vários, aria-pressed). */
  function chip({ rotulo, ligado, modo, desabilitado, aoClicar, titulo, extra }) {
    const attrs = modo === "radio" ? { role: "radio", "aria-checked": String(!!ligado) } : { "aria-pressed": String(!!ligado) };
    const b = h("button", { type: "button", class: ["au-chip", extra], disabled: !!desabilitado, title: titulo || null, ...attrs }, rotulo);
    b.marcar = v => { b.setAttribute(modo === "radio" ? "aria-checked" : "aria-pressed", String(!!v)); };
    if (aoClicar) b.addEventListener("click", () => { if (!b.disabled) aoClicar(b); });
    return b;
  }

  /** Grupo de «rádios» (chips): setas, Home e End movem a escolha, como num radiogroup nativo. */
  function setas(grupo) {
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
    const grupo = h("div", { class: "au-chips", role: "radiogroup", "aria-labelledby": id });
    const resumo = h("small", { class: "au-dur-resumo", "aria-live": "polite" });
    const dec = L.decomporDuracao(atual || 0);
    const num = entrada({ rotulo: "Quantidade", valor: dec.n || "", tipo: "number", min: 1, passo: 1, desabilitado, rotuloOculto: true, classe: "au-dur-num" });
    const un = seletor({ rotulo: "Unidade", valor: dec.un, desabilitado, classe: "au-dur-un",
      opcoes: [{ valor: "min", rotulo: "minutos" }, { valor: "horas", rotulo: "horas" }, { valor: "dias", rotulo: "dias" }] });
    un.querySelector("label").classList.add("sr-only");
    const linhaOutro = h("div", { class: "au-dur-outro", hidden: !outro }, num, un);
    const pintar = () => {
      chips.forEach(([m, b]) => b.marcar(!outro && atual === m));
      btOutro.marcar(outro);
      linhaOutro.hidden = !outro;
      const ok = atual != null && atual >= min && atual <= max;
      resumo.textContent = atual == null ? (outro ? "Digite um tempo." : "") : ok ? `Esperar ${L.formatarDuracao(atual)}.` : "Use de 1 minuto a 30 dias.";
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
  function opcoesBase(dados, tipo, { funil } = {}) {
    const b = dados.base || {};
    switch (tipo) {
      case "funil": return (b.funis || []).filter(f => f.ativo !== false).map(f => ({ valor: f.id, rotulo: f.nome + (f.padrao ? " (padrão)" : "") }));
      case "estagio": return (b.funis || []).filter(f => f.ativo !== false && (!funil || f.id === funil))
        .map(f => ({ grupo: f.nome, opcoes: (f.estagios || []).map(e => ({ valor: e.id, rotulo: e.nome })) }));
      case "canal": return (b.canais || []).map(c => ({ valor: c.id, rotulo: c.nome + (c.numero_exibicao ? ` · ${c.numero_exibicao}` : "") }));
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

  return { interruptor, seletor, entrada, chip, setas, campoDias, campoDuracao, escolhaCartoes, opcoesBase, novoId };
}
