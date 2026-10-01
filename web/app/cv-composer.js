/* ============================================================
   ÓRBITA — cv-composer.js · frente F5 · ESPEC §7.7 T4 (composer)
   Campo que cresce até 6 linhas; Enter envia, Shift+Enter quebra;
   "/" abre as respostas rápidas (↑↓ Enter Esc; Enter não envia com o
   menu aberto) com variáveis; anexos (clipe, colar imagem, arrastar);
   modelos aprovados com parâmetros e prévia; nota interna (amarela,
   nunca vai ao WhatsApp); "Sugerir com IA" (põe o texto no campo,
   nunca envia); responder citando. Janela de 24 h fechada trava o
   texto e oferece modelo; resolvida pede "Reabrir".
   Número do CodeWords (aparelho): anexa e grava como na Meta, sem
   janela de 24 h, sem modelos e sem citação; o áudio gravado vira
   WAV 16 kHz mono antes de subir e o vídeo chega como arquivo.
   ============================================================ */

export function criarComposer(A) {
  const { ui, L } = A;
  const h = ui.h;

  let modoNota = false;
  let respondendo = null;       // mensagem citada
  let rrAberto = false, rrItens = [], rrSel = 0;

  const ta = h("textarea", { rows: 1, placeholder: "Mensagem  ·  / para respostas rápidas", "aria-label": "Mensagem", maxlength: 4096 });
  const rotNota = h("div", { class: "cvx-rot-nota" }, ui.icone("nota"), "Nota interna — só a equipe vê");
  const campo = h("div", { class: "cvx-campo" }, rotNota, ta);
  const arquivo = h("input", { type: "file", hidden: true, accept: "image/jpeg,image/png,image/webp,video/mp4,video/3gpp,audio/aac,audio/mp4,audio/mpeg,audio/amr,audio/ogg,audio/wav,application/pdf,application/msword,application/vnd.ms-excel,application/vnd.ms-powerpoint,application/vnd.openxmlformats-officedocument.wordprocessingml.document,application/vnd.openxmlformats-officedocument.spreadsheetml.sheet,application/vnd.openxmlformats-officedocument.presentationml.presentation,text/plain" });
  const btClipe = h("button", { type: "button", class: "bt-icone", "aria-label": "Anexar arquivo", title: "Anexar (foto, vídeo, áudio, documento até 16 MB)" }, ui.icone("clipe"));
  const btAudio = h("button", { type: "button", class: "bt-icone cvx-audio", "aria-label": "Gravar áudio", title: "Gravar áudio para enviar" }, ui.icone("microfone"));
  const btModelos = h("button", { type: "button", class: "bt-icone so-largo", "aria-label": "Enviar modelo aprovado", title: "Modelos aprovados" }, A.icone("modelo"));
  const btNota = h("button", { type: "button", class: "bt-icone", "aria-label": "Nota interna", title: "Nota interna (a equipe vê, o cliente não)", "aria-pressed": "false" }, ui.icone("nota"));
  const btIA = h("button", { type: "button", class: "bt-icone so-largo", "aria-label": "Sugerir resposta com IA", title: "Sugerir com IA" }, ui.icone("ia"));
  const btMaisM = h("button", { type: "button", class: "bt-icone so-estreito", "aria-label": "Mais opções", title: "Mais" }, ui.icone("mais"));
  const btEnviar = h("button", { type: "button", class: "bt bt-prim cvx-enviar", "aria-label": "Enviar" }, ui.icone("enviar"));
  const btInfo = h("button", { type: "button", class: "bt-icone cvx-info", "aria-label": "Por que não dá para gravar áudio?", "aria-expanded": "false", title: "Por que não dá para gravar áudio?", hidden: true }, ui.icone("info"));
  const ferr = h("div", { class: "cvx-ferr" }, btClipe, btInfo, btAudio, btModelos, btNota, btIA, btMaisM);
  const linha = h("div", { class: "cvx-linha" }, ferr, campo, btEnviar);
  const capInfo = h("p", { class: "cvx-cap-info", id: "cvx-cap-info", role: "status", "aria-live": "polite", hidden: true });
  let infoAberta = false, infoTimer = null;   // o aviso (navegador que não grava áudio) só aparece quando a pessoa toca no ⓘ (não ocupa a conversa o tempo todo)
  const tempoGravacao = h("span", { class: "cvx-rec-tempo", role: "timer", "aria-live": "off" }, "00:00");
  const btCancelarGravacao = h("button", { type: "button", class: "bt bt-fant bt-p" }, "Cancelar");
  const painelGravacao = h("div", { class: "cvx-gravacao", role: "status", "aria-live": "polite", hidden: true },
    h("span", { class: "cvx-rec-ponto", "aria-hidden": "true" }), h("span", {}, "Gravando"), tempoGravacao, btCancelarGravacao);
  const resp = h("div", { class: "cvx-resp", hidden: true });
  const seloRasc = h("div", { class: "cvx-rasc-selo" });       // "Rascunho restaurado · descartar" (o ctx.rascunho põe o selo aqui)
  let rasc = null;                                               // rascunho do campo ligado a esta conversa (ctx.rascunho.ligar)
  let idDoCampo = null;                                          // de QUAL conversa é o texto que está no campo (A.selId muda antes de a conversa nova carregar)
  const trava = h("div", { class: "cvx-trava", hidden: true });
  const iaTrab = h("div", { class: "cvx-ia-trab", hidden: true, role: "status" }, "Escrevendo…");
  const dica = h("p", { class: "cvx-dica" }, h("kbd", null, "Enter"), " envia · ", h("kbd", null, "Shift"), "+", h("kbd", null, "Enter"), " quebra linha · ", h("kbd", null, "/"), " respostas rápidas");
  const rr = h("div", { class: "cvx-rr", role: "listbox", "aria-label": "Respostas rápidas", hidden: true, id: "cvx-rr" });
  const rrStatus = h("span", { class: "sr-only", role: "status", "aria-live": "polite", "aria-atomic": "true" });
  const el = h("div", { class: "cvx", hidden: true, dataset: { modo: "texto" } }, rr, rrStatus, resp, iaTrab, trava, capInfo, painelGravacao, seloRasc, linha, dica, arquivo);

  ta.setAttribute("aria-controls", "cvx-rr");
  ta.setAttribute("aria-autocomplete", "list");

  /* ---------------- estado da conversa */
  function conv() { return A.ver && A.ver.conversa; }
  function contato() { return (A.ver && A.ver.contato) || (conv() && conv().contato) || {}; }
  function provedorCanal() {
    const c = conv();
    if (c?.canal?.provedor) return c.canal.provedor;
    return (A.base?.canais || []).find(k => k.id === c?.canal_id)?.provedor || "meta";
  }
  function usaCodeWords() { return provedorCanal() === "codewords"; }
  function situacao() {
    const c = conv();
    if (!c) return "sem";
    if (!A.podeEscrever) return "leitura";
    if (c.status === "resolvida") return "resolvida";
    if (!c.canal_id) return "sem_canal";
    if (L.canalTemJanela(provedorCanal()) && !L.janela(c).aberta) return "janela";   // CodeWords não tem janela de 24 h
    if (!usaCodeWords() && c.canal && c.canal.tem_token === false) return "sem_token";
    return "ok";
  }
  function podeTexto() { return modoNota ? A.podeEscrever && !!conv() : situacao() === "ok"; }
  function formatoGravacao() {
    const MR = globalThis.MediaRecorder;
    if (!MR || typeof MR.isTypeSupported !== "function") return null;
    return ["audio/ogg;codecs=opus", "audio/mp4"].find(tipo => {
      try { return MR.isTypeSupported(tipo); } catch { return false; }
    }) || null;
  }
  /** CodeWords: a gravação sai no formato que o navegador tiver e a tela converte para WAV (paraWav) — basta existir gravador e decodificador. */
  function gravaWav() {
    return typeof globalThis.MediaRecorder === "function" && !!(globalThis.AudioContext || globalThis.webkitAudioContext)
      && !!(globalThis.OfflineAudioContext || globalThis.webkitOfflineAudioContext);
  }
  /** Dá para gravar neste navegador, para o canal da conversa? Na Meta só com ogg/opus ou m4a prontos; no CodeWords, qualquer formato (vira WAV). */
  function podeGravar() { return !!globalThis.isSecureContext && (usaCodeWords() ? gravaWav() : !!formatoGravacao()); }
  let gravacao = null;
  function pararGravacao(cancelar = false) {
    const atual = gravacao;
    if (!atual) return;
    atual.cancelar = cancelar;
    if (atual.rec.state !== "inactive") atual.rec.stop();
  }
  function tempoGravacaoTexto(segundos) {
    const s = Math.max(0, Math.floor(segundos));
    return `${String(Math.floor(s / 60)).padStart(2, "0")}:${String(s % 60).padStart(2, "0")}`;
  }

  function atualizar() {
    const s = situacao();
    const c = conv();
    el.dataset.modo = modoNota ? "nota" : "texto";
    ui.limpar(trava);
    trava.hidden = true;
    linha.hidden = false;
    dica.hidden = false;
    if (s === "leitura") {
      trava.hidden = false; linha.hidden = true; dica.hidden = true;
      trava.append(ui.icone("cadeado"), h("p", null, "Seu acesso é só de leitura. Você acompanha as conversas, mas não responde."));
    } else if (s === "resolvida") {
      trava.hidden = false; linha.hidden = !modoNota; dica.hidden = true;
      const b = h("button", { type: "button", class: "bt bt-prim bt-p" }, A.icone("reabrir"), "Reabrir");
      b.addEventListener("click", () => A.acoes.status("aberta", b));
      trava.append(ui.icone("check"), h("p", null, "Atendimento resolvido. Reabra para responder."), b,
        h("button", { type: "button", class: "bt bt-fant bt-p", on: { click: () => alternarNota(true) } }, ui.icone("nota"), "Nota interna"));
    } else if (s === "sem_canal") {
      trava.hidden = false; dica.hidden = true;
      trava.append(ui.icone("alerta"), h("p", null, "O número deste atendimento foi removido. Comece uma nova conversa por outro número."),
        h("button", { type: "button", class: "bt bt-sec bt-p", on: { click: () => A.acoes.novaConversa({ contato: contato() }) } }, "Nova conversa"));
    } else if (s === "janela" && !modoNota) {
      trava.hidden = false;
      // (só chega aqui em canal da Meta: no CodeWords não existe janela — ver situacao())
      const b = h("button", { type: "button", class: "bt bt-prim bt-p" }, A.icone("modelo"), "Modelos");
      b.addEventListener("click", () => abrirModelos());
      trava.append(ui.icone("relogio"), h("p", null, c && c.ultima_entrada_em
        ? "Mais de 24 h desde a última mensagem do cliente. Envie um modelo aprovado para retomar a conversa."
        : "O cliente ainda não mandou mensagem por este número. Para começar, envie um modelo aprovado."), b);
    } else if (s === "sem_token" && !modoNota) {
      trava.hidden = false;
      trava.append(...[ui.icone("alerta"), h("p", null, "Este número ainda não tem o token da Meta. Configure em Números de WhatsApp."),
        A.acoes.pode("admin") ? h("a", { class: "bt bt-sec bt-p", href: "#/config/numeros" }, "Números de WhatsApp") : null].filter(Boolean));
    }
    const ok = podeTexto();
    ta.disabled = !ok;
    const estreito = matchMedia("(max-width: 760px)").matches;
    ta.placeholder = modoNota ? (estreito ? "Nota para a equipe" : "Escreva uma nota para a equipe (o cliente não vê)")
      : s === "janela" ? "Janela fechada — envie um modelo aprovado"
      : estreito ? "Mensagem" : "Mensagem  ·  / para respostas rápidas";
    btEnviar.disabled = !ok;
    btEnviar.setAttribute("aria-label", modoNota ? "Salvar nota" : "Enviar");
    btEnviar.title = modoNota ? "Salvar nota" : "Enviar";
    ui.limpar(btEnviar); btEnviar.appendChild(ui.icone(modoNota ? "check" : "enviar"));
    const codeWords = usaCodeWords();
    const gravavel = podeGravar();
    btClipe.hidden = false;
    btModelos.hidden = codeWords;                    // modelo aprovado é coisa da Meta
    btClipe.setAttribute("aria-disabled", String(modoNota || s !== "ok"));   // anexo vale nos dois canais (Meta e CodeWords)
    btClipe.title = "Anexar foto, vídeo, áudio ou documento (até 16 MB)";
    btAudio.hidden = false;
    const gravando = !!gravacao;
    btAudio.disabled = !gravando && (modoNota || s !== "ok" || !gravavel);
    btAudio.title = gravando ? "Parar e revisar o áudio"
      : !gravavel ? "Gravação indisponível neste navegador; você ainda pode anexar um áudio salvo."
      : "Gravar áudio para enviar (até 1 minuto)";
    btAudio.setAttribute("aria-label", btAudio.title);
    btAudio.setAttribute("aria-pressed", String(gravando));
    ui.limpar(btAudio); btAudio.appendChild(ui.icone(gravando ? "parar" : "microfone"));
    const temAviso = !gravavel;
    btInfo.hidden = !temAviso;
    btInfo.setAttribute("aria-controls", "cvx-cap-info");
    if (!temAviso) infoAberta = false;
    capInfo.hidden = !temAviso || !infoAberta;
    btInfo.setAttribute("aria-expanded", String(temAviso && infoAberta));
    capInfo.textContent = codeWords
      ? "Este navegador não grava áudio. Você ainda pode anexar um áudio salvo (MP3, OGG, AAC, M4A ou WAV)."
      : "Este navegador não grava áudio em formato aceito. Você ainda pode anexar um áudio MP3, OGG, AAC ou M4A.";
    btIA.disabled = modoNota || s !== "ok";
    btModelos.disabled = codeWords || modoNota || !(s === "ok" || s === "janela");
    btNota.disabled = !A.podeEscrever;
    btNota.setAttribute("aria-pressed", String(modoNota));
    btIA.hidden = !(A.base && A.base.ia);
    if (s === "janela" && !modoNota) btModelos.classList.add("bt-destaque"); else btModelos.classList.remove("bt-destaque");
    autoAltura();
  }

  /** M36: o que se digita fica guardado no aparelho (por conversa, e a nota à parte) e volta depois de recarregar, da sessão cair ou da aba ser descartada. */
  /** Desliga o rascunho da conversa do campo. O desligar GRAVA o texto do campo na chave dela: só pode rodar com o texto dela ainda no campo. */
  function desligarRascunho() { if (rasc) { try { rasc.desligar(); } catch { /* ok */ } rasc = null; } }
  function ligarRascunho() {
    desligarRascunho();
    ui.limpar(seloRasc);
    const r = A.ctx && A.ctx.rascunho;
    if (!r || !idDoCampo || typeof r.ligar !== "function") return;
    rasc = r.ligar(ta, `conversa:${idDoCampo}${modoNota ? ":nota" : ""}`, { seloEm: seloRasc });
    if (rasc && rasc.restaurado) { autoAltura(); A.acoes.rascunhoMudou(); }
  }
  /** Apaga o rascunho guardado — só depois de o servidor/fila terem a mensagem (e se a pessoa já não digitou outra coisa). */
  function apagarRascunho() { if (rasc && !ta.value.trim()) { try { rasc.apagar(); } catch { /* ok */ } } }

  function definirConversa() {
    if (gravacao) pararGravacao(true);
    // o rascunho da conversa ANTERIOR sai antes de o campo mudar: desligado depois, ele gravaria o texto da conversa nova na chave da antiga
    desligarRascunho();
    modoNota = false;
    respondendo = null;
    fecharRR();
    desenharResposta();
    idDoCampo = A.selId || null;
    ta.value = (idDoCampo && A.rascunhos.get(idDoCampo)) || "";
    ligarRascunho();
    atualizar();
    el.hidden = false;
    if (!matchMedia("(pointer: coarse)").matches && podeTexto()) setTimeout(() => ta.focus({ preventScroll: true }), 30);
  }

  /* ---------------- altura automática (até 6 linhas; o máximo está no CSS) */
  function autoAltura() {
    ta.style.height = "auto";
    ta.style.height = `${Math.min(ta.scrollHeight, 400)}px`;
  }

  /* ---------------- nota interna */
  function alternarNota(forcar) {
    const antes = modoNota;
    modoNota = typeof forcar === "boolean" ? forcar : !modoNota;
    if (modoNota !== antes && rasc) {            // o texto digitado acompanha a pessoa para o outro modo: o rascunho antigo sai e o novo nasce
      try { rasc.apagar(); if (typeof rasc.parar === "function") rasc.parar(); else rasc.desligar(); } catch { /* ok */ }
      rasc = null;
      ligarRascunho();
      if (rasc && ta.value.trim()) rasc.salvarAgora();
    }
    if (modoNota !== antes && idDoCampo) {       // o rascunho da sessão segue a mesma regra: texto de nota nunca fica guardado como mensagem para o cliente
      if (modoNota) A.rascunhos.delete(idDoCampo); else A.rascunhos.set(idDoCampo, ta.value);
      A.acoes.rascunhoMudou();
    }
    if (modoNota) { respondendo = null; desenharResposta(); fecharRR(); }
    atualizar();
    if (!ta.disabled) ta.focus();
  }
  btNota.addEventListener("click", () => alternarNota());

  /* ---------------- responder citando */
  function desenharResposta() {
    ui.limpar(resp);
    resp.hidden = !respondendo;
    if (!respondendo) return;
    const quem = respondendo.direcao === "in" ? A.acoes.nomeContato(contato()) || "Cliente" : "Você";
    resp.append(A.icone("responder"), h("div", null, h("b", null, `Respondendo ${quem}`), L.resumoMensagem(respondendo, 120)),
      h("button", { type: "button", class: "bt-icone", "aria-label": "Cancelar resposta", on: { click: () => { respondendo = null; desenharResposta(); ta.focus(); } } }, ui.icone("fechar")));
  }
  function responder(m) {
    if (!m || situacao() !== "ok") { if (situacao() !== "ok") ui.toast("Para responder citando, a janela de 24 h precisa estar aberta.", { tipo: "info" }); return; }
    if (modoNota) alternarNota(false);
    respondendo = m;
    desenharResposta();
    ta.focus();
  }

  /* ---------------- respostas rápidas "/" */
  function varsAtuais() {
    const c = conv() || {}, ct = contato();
    const eu = (A.eu && A.eu.nome) || "";
    return { nome: ct.nome || "", primeiro_nome: L.primeiroNome(ct.nome), atendente: L.primeiroNome(eu) || eu,
      empresa: (A.ctx.cliente && A.ctx.cliente.nome) || "", protocolo: c.protocolo || "" };
  }
  function abrirRR(termo) {
    const dep = conv() && conv().departamento_id;
    rrItens = L.filtrarRespostas((A.base && A.base.respostas) || [], termo, { departamento: dep, max: 8 });
    rrSel = 0;
    rrAberto = true;
    desenharRR(termo);
  }
  function desenharRR(termo) {
    ui.limpar(rr);
    rr.hidden = false;
    rrStatus.textContent = rrItens.length
      ? `${rrItens.length} respostas rápidas disponíveis. Use as setas e Enter para escolher, ou Escape para fechar.`
      : (termo ? "Nenhuma resposta rápida encontrada." : "Nenhuma resposta rápida cadastrada.");
    rr.appendChild(h("div", { class: "cvx-rr-cab" }, h("span", { class: "rotulo" }, "Respostas rápidas"), h("span", { class: "rotulo" }, "↑↓ Enter · Esc")));
    if (!rrItens.length) {
      rr.appendChild(h("p", { class: "cvx-rr-vazio" }, termo ? `Nenhuma resposta com «${termo}».` : "Nenhuma resposta cadastrada. ",
        A.acoes.pode("supervisor") ? h("a", { class: "link", href: "#/config/respostas" }, "Cadastrar respostas") : null));
      return;
    }
    rrItens.forEach((r, i) => {
      const op = h("button", { type: "button", role: "option", class: "cvx-rr-op", id: `cvx-rr-${i}`, "aria-selected": String(i === rrSel), tabindex: "-1" },
        h("span", { class: "mono" }, `/${r.atalho}`), h("b", null, r.titulo), h("small", null, L.aplicarVariaveis(r.corpo, varsAtuais())));
      op.addEventListener("mousedown", ev => ev.preventDefault());
      op.addEventListener("click", () => escolherRR(i));
      rr.appendChild(op);
    });
    ta.setAttribute("aria-activedescendant", `cvx-rr-${rrSel}`);
    const atual = rr.querySelector(`#cvx-rr-${rrSel}`);
    if (atual) atual.scrollIntoView({ block: "nearest" });
  }
  function fecharRR() {
    rrAberto = false; rrItens = [];
    rr.hidden = true; ui.limpar(rr);
    rrStatus.textContent = "Respostas rápidas fechadas.";
    ta.removeAttribute("aria-activedescendant");
  }
  function escolherRR(i) {
    const r = rrItens[i];
    if (!r) return;
    ta.value = L.aplicarVariaveis(r.corpo, varsAtuais());
    fecharRR();
    rrStatus.textContent = "Resposta rápida aplicada.";
    autoAltura();
    ta.focus();
    const pos = ta.value.search(/\{[^}]+\}/);    // cai no primeiro {campo a preencher}
    if (pos >= 0) { const fim = ta.value.indexOf("}", pos) + 1; ta.setSelectionRange(pos, fim); }
    else ta.setSelectionRange(ta.value.length, ta.value.length);
    A.acoes.respostaUsada(r.id);
  }

  ta.addEventListener("input", () => {
    autoAltura();
    if (!modoNota && idDoCampo) { A.rascunhos.set(idDoCampo, ta.value); A.acoes.rascunhoMudou(); }
    if (modoNota) return;
    const t = L.termoBarra(ta.value);
    if (t !== null) abrirRR(t); else if (rrAberto) fecharRR();
  });
  ta.addEventListener("blur", () => setTimeout(() => { if (document.activeElement !== ta) fecharRR(); }, 120));
  ta.addEventListener("keydown", ev => {
    if (rrAberto) {
      if (ev.key === "ArrowDown") { ev.preventDefault(); if (rrItens.length) { rrSel = (rrSel + 1) % rrItens.length; desenharRR(L.termoBarra(ta.value) || ""); } return; }
      if (ev.key === "ArrowUp") { ev.preventDefault(); if (rrItens.length) { rrSel = (rrSel - 1 + rrItens.length) % rrItens.length; desenharRR(L.termoBarra(ta.value) || ""); } return; }
      if (ev.key === "Enter" || ev.key === "Tab") { if (rrItens.length) { ev.preventDefault(); escolherRR(rrSel); } else if (ev.key === "Enter") ev.preventDefault(); return; }
      if (ev.key === "Escape") { ev.preventDefault(); fecharRR(); return; }
    }
    if (ev.key === "Escape" && respondendo) { ev.preventDefault(); respondendo = null; desenharResposta(); return; }
    // M35: Esc no campo devolve o foco à lista (o rascunho já está guardado); j/k, / e ? passam a valer fora do campo
    if (ev.key === "Escape" && !ev.isComposing) { ev.preventDefault(); A.acoes.focarLista(); return; }
    if (ev.key === "Enter" && !ev.shiftKey && !ev.isComposing && !matchMedia("(pointer: coarse)").matches) { ev.preventDefault(); enviarDoCampo(); }
  });
  btEnviar.addEventListener("click", () => enviarDoCampo());

  async function enviarDoCampo() {
    const texto = ta.value.trim();
    if (!texto || !podeTexto()) return;
    // o texto do campo é de uma conversa só: enquanto a aberta não for ela (troca em andamento), Enter não manda nada para ninguém
    if (!idDoCampo || idDoCampo !== A.selId || !conv() || conv().id !== idDoCampo) return;
    if (texto.length > 4096) { ui.toast("A mensagem passou de 4.096 caracteres. Divida em duas.", { tipo: "erro" }); return; }
    if (modoNota) {
      btEnviar.disabled = true;
      try {
        await A.acoes.nota(texto);
        ta.value = ""; autoAltura();
        apagarRascunho();
        alternarNota(false);
      } catch (e) { A.acoes.tratarErro(e); }
      finally { btEnviar.disabled = !podeTexto(); }
      return;
    }
    const citada = respondendo;
    ta.value = ""; autoAltura();
    respondendo = null; desenharResposta();
    A.rascunhos.delete(idDoCampo);
    A.acoes.rascunhoMudou();
    ta.focus();
    const r = await A.acoes.enviar({ tipo: "texto", texto, respondeA: citada });
    if (r && r.persistido !== false) apagarRascunho();      // a mensagem está na fila (IndexedDB): o rascunho cumpriu o papel
  }

  /* ---------------- anexos */
  /** Anexo e gravação valem nos dois canais (Meta e CodeWords). No CodeWords a situação nunca é "janela" nem "sem_token" (ver situacao()). */
  function aceitaAnexo() { return !modoNota && situacao() === "ok"; }
  function mostrarInfoCanal(abrir = !infoAberta) {
    clearTimeout(infoTimer);
    infoAberta = abrir;
    atualizar();
    if (infoAberta) infoTimer = setTimeout(() => { infoAberta = false; atualizar(); }, 9000);
  }
  btInfo.addEventListener("click", () => mostrarInfoCanal());
  btClipe.addEventListener("click", () => {
    if (btClipe.getAttribute("aria-disabled") === "true") return;
    arquivo.value = ""; arquivo.click();
  });
  arquivo.addEventListener("change", () => { const f = arquivo.files && arquivo.files[0]; if (f) anexar(f); });
  btAudio.addEventListener("click", () => gravacao ? pararGravacao(false) : iniciarGravacao());
  btCancelarGravacao.addEventListener("click", () => pararGravacao(true));

  /** Áudio gravado (no formato que o navegador tiver) → WAV 16 kHz mono 16 bits, que o aparelho do CodeWords entrega como mensagem de voz. */
  async function paraWav(blob) {
    const AC = globalThis.AudioContext || globalThis.webkitAudioContext;
    const OAC = globalThis.OfflineAudioContext || globalThis.webkitOfflineAudioContext;
    const ctx = new AC();
    let audio;
    try {
      const bruto = await blob.arrayBuffer();
      // Safari antigo só tem a forma com callbacks; os demais devolvem a promessa
      audio = await new Promise((ok, no) => { const p = ctx.decodeAudioData(bruto, ok, no); if (p && typeof p.then === "function") p.then(ok, no); });
    } finally { try { await ctx.close(); } catch { /* ok */ } }      // contexto aberto segura o dispositivo de áudio: fecha mesmo se a decodificação falhar
    if (!audio || !(audio.duration > 0)) throw new Error("audio_vazio");
    const off = new OAC(1, Math.max(1, Math.round(audio.duration * L.WAV_TAXA)), L.WAV_TAXA);   // 1 canal a 16 kHz: reamostra e junta estéreo em mono
    const fonte = off.createBufferSource();
    fonte.buffer = audio;
    fonte.connect(off.destination);
    fonte.start();
    const pronto = await off.startRendering();
    return new Blob([L.wavDePcm(pronto.getChannelData(0), L.WAV_TAXA)], { type: L.MIME_WAV });
  }

  async function iniciarGravacao() {
    if (!aceitaAnexo()) { atualizar(); return; }
    const emWav = usaCodeWords();                    // CodeWords: grava no formato padrão do navegador e converte para WAV ao parar
    const mimePreferido = emWav ? null : formatoGravacao();
    if (!podeGravar() || !navigator.mediaDevices?.getUserMedia) {
      ui.toast(emWav ? "A gravação não está disponível aqui. Anexe um áudio salvo em MP3, OGG, AAC, M4A ou WAV."
        : "A gravação não está disponível aqui. Anexe um áudio salvo em MP3, OGG, AAC ou M4A.", { tipo: "info" });
      return;
    }
    let fluxo;
    const idGravacao = conv() ? conv().id : null;    // intenção capturada antes da permissão; não muda com a seleção do chat
    if (!idGravacao) return;
    try {
      fluxo = await navigator.mediaDevices.getUserMedia({ audio: { echoCancellation: true, noiseSuppression: true, autoGainControl: true } });
      if (!el.isConnected || !aceitaAnexo() || !mesmaConversa(idGravacao)) {
        fluxo.getTracks().forEach(t => t.stop());
        if (el.isConnected && !mesmaConversa(idGravacao)) ui.toast("A conversa mudou antes de liberar o microfone. A gravação não foi iniciada.", { tipo: "info", ms: 8000 });
        return;
      }
      const rec = emWav ? new MediaRecorder(fluxo) : new MediaRecorder(fluxo, { mimeType: mimePreferido });
      const atual = { rec, fluxo, partes: [], cancelar: false, timer: null, inicio: Date.now() };
      gravacao = atual;
      rec.addEventListener("dataavailable", ev => { if (ev.data && ev.data.size) atual.partes.push(ev.data); });
      rec.addEventListener("error", () => ui.toast("A gravação foi interrompida. Tente novamente ou anexe um áudio salvo.", { tipo: "erro" }), { once: true });
      rec.addEventListener("stop", async () => {
        clearInterval(atual.timer);
        atual.fluxo.getTracks().forEach(t => t.stop());
        if (gravacao === atual) gravacao = null;
        painelGravacao.hidden = true;
        atualizar();
        if (atual.cancelar) { ui.anunciar("Gravação cancelada."); return; }
        const mime = String(rec.mimeType || mimePreferido || "").split(";")[0].toLowerCase();
        const blob = new Blob(atual.partes, { type: mime });
        if (!blob.size) { ui.toast("O áudio ficou vazio. Grave novamente.", { tipo: "info" }); return; }
        if (emWav) {
          let wav = null;
          audioStatus.hidden = false;
          try { wav = await paraWav(blob); } catch { wav = null; } finally { audioStatus.hidden = true; }
          if (!wav) {      // a gravação não some calada: diz o que houve e por onde seguir
            ui.toast("Não foi possível preparar o áudio gravado neste navegador, e ele não foi enviado. Toque no clipe para anexar um áudio salvo (MP3, OGG, AAC, M4A ou WAV).", { tipo: "erro", ms: 10000 });
            return;
          }
          // a conversa mudou enquanto o áudio era convertido: ele não segue para outro cliente
          if (!mesmaConversa(idGravacao)) { ui.toast("Você trocou de conversa enquanto o áudio era preparado: nada foi enviado. Grave de novo na conversa certa.", { tipo: "info", ms: 8000 }); return; }
          await anexar(new File([wav], `audio-orbita-${Date.now()}.wav`, { type: L.MIME_WAV }));
          return;
        }
        const ext = mime === "audio/mp4" ? "m4a" : "ogg";
        const arquivoAudio = new File([blob], `audio-orbita-${Date.now()}.${ext}`, { type: mime });
        await anexar(arquivoAudio);
      }, { once: true });
      rec.start(500);
      painelGravacao.hidden = false;
      tempoGravacao.textContent = "00:00";
      atualizar();
      btCancelarGravacao.focus();
      atual.timer = setInterval(() => {
        const segundos = Math.floor((Date.now() - atual.inicio) / 1000);
        tempoGravacao.textContent = tempoGravacaoTexto(segundos);
        if (segundos >= 60) {
          pararGravacao(false);
          ui.toast("Limite de 1 minuto atingido. Revise o áudio antes de enviar.", { tipo: "info" });
        }
      }, 500);
    } catch {
      if (fluxo) fluxo.getTracks().forEach(t => t.stop());
      gravacao = null;
      painelGravacao.hidden = true;
      atualizar();
      ui.toast("Não foi possível acessar o microfone. Libere a permissão do navegador e tente de novo.", { tipo: "erro" });
    }
  }

  ta.addEventListener("paste", ev => {
    const itens = ev.clipboardData && ev.clipboardData.items ? [...ev.clipboardData.items] : [];
    const img = itens.find(i => i.kind === "file" && /^image\//.test(i.type));
    if (!img) return;
    ev.preventDefault();
    const f = img.getAsFile();
    if (f) anexar(new File([f], f.name && f.name !== "image.png" ? f.name : `imagem-colada-${Date.now()}.png`, { type: f.type }));
  });

  /* ---------------- fotos: otimiza no aparelho antes de validar (M37) */
  const otimStatus = h("p", { class: "cvx-otim", role: "status", "aria-live": "polite", hidden: true }, "Otimizando a foto…");
  el.insertBefore(otimStatus, linha);
  const audioStatus = h("p", { class: "cvx-otim", role: "status", "aria-live": "polite", hidden: true }, "Preparando o áudio…");   // CodeWords: gravação virando WAV
  el.insertBefore(audioStatus, linha);

  /** Decodifica a foto (EXIF corrigido), reduz o lado maior para 1600 px e recodifica em JPEG 0,82 (cai para 0,72 e 0,62 se passar do alvo).
      Devolve {arquivo, original, otimizada}; lança "foto_ilegivel" quando o navegador não decodifica (ex.: HEIC fora do Safari). */
  async function otimizarFoto(f) {
    let fonte = null, w = 0, h2 = 0, urlTmp = null;
    try {
      try { fonte = await createImageBitmap(f, { imageOrientation: "from-image" }); w = fonte.width; h2 = fonte.height; }
      catch { fonte = null; }
      if (!fonte) {   // navegador sem createImageBitmap com opções: o <img> também aplica o EXIF
        urlTmp = URL.createObjectURL(f);
        fonte = await new Promise((ok, no) => { const i = new Image(); i.onload = () => ok(i); i.onerror = () => no(Object.assign(new Error("foto_ilegivel"), { codigo: "foto_ilegivel" })); i.src = urlTmp; });
        w = fonte.naturalWidth; h2 = fonte.naturalHeight;
      }
      if (!(w > 0 && h2 > 0)) throw Object.assign(new Error("foto_ilegivel"), { codigo: "foto_ilegivel" });
      const plano = L.planoFoto({ tipo: L.mimeDe(f), bytes: f.size, largura: w, altura: h2 });
      if (plano.acao === "manter") return { arquivo: f, original: f, otimizada: false };
      const tela = document.createElement("canvas");
      tela.width = plano.w; tela.height = plano.h;
      const c2 = tela.getContext("2d");
      if (!c2) throw Object.assign(new Error("foto_ilegivel"), { codigo: "foto_ilegivel" });
      c2.fillStyle = "white";            // PNG com fundo transparente vira JPEG: o fundo precisa ser opaco
      c2.fillRect(0, 0, plano.w, plano.h);
      c2.imageSmoothingQuality = "high";
      c2.drawImage(fonte, 0, 0, plano.w, plano.h);
      let blob = null;
      for (let t = 0; t < L.FOTO_QUALIDADES.length; t++) {
        blob = await new Promise(ok => tela.toBlob(ok, "image/jpeg", L.FOTO_QUALIDADES[t]));
        if (!blob) throw Object.assign(new Error("foto_ilegivel"), { codigo: "foto_ilegivel" });
        if (L.proximaQualidadeFoto(blob.size, t) === null) break;
      }
      tela.width = tela.height = 0;
      // recodificar não pode piorar: se ficou maior que o original (e o original é aceito), segue o original
      const heic = /^image\/hei[cf]$/.test(L.mimeDe(f));
      if (!heic && blob.size >= f.size && L.validarArquivo(f).ok) return { arquivo: f, original: f, otimizada: false };
      return { arquivo: new File([blob], L.nomeFotoOtimizada(f.name), { type: "image/jpeg", lastModified: Date.now() }), original: f, otimizada: true, w: plano.w, h: plano.h };
    } finally {
      try { if (fonte && typeof fonte.close === "function") fonte.close(); } catch { /* ok */ }
      if (urlTmp) URL.revokeObjectURL(urlTmp);
    }
  }

  /** Nome de quem vai receber (título dos modais de envio: a última conferência antes de mandar foto ou modelo). */
  function nomeDestino() { return A.acoes.nomeContato(contato()) || "este contato"; }
  /** A conversa aberta ainda é a `id`? Anexo e modelo esperam (otimizar a foto, o modal): nesse meio tempo a pessoa pode ter aberto outra. */
  function mesmaConversa(id) { return !!id && A.selId === id && !!conv() && conv().id === id; }

  async function anexar(f) {
    const idInicio = conv() ? conv().id : null;      // o arquivo foi escolhido para ESTA conversa
    if (!aceitaAnexo()) {
      ui.toast(situacao() === "janela" ? "Fora da janela de 24 h só vale modelo aprovado." : "Não dá para anexar agora.", { tipo: "info" });
      return;
    }
    const codeWords = usaCodeWords();                // o canal é o da conversa: não muda enquanto ela for a aberta
    // foto de câmera tem 3 a 8 MB: reduz no aparelho ANTES de olhar o limite de 5 MB (e a pessoa vê o ganho no resumo)
    let otim = null;
    if (L.ehFoto(f)) {
      otimStatus.hidden = false;
      try { otim = await otimizarFoto(f); }
      catch (e) {
        otim = null;
        if (/^image\/hei[cf]$/.test(L.mimeDe(f))) {
          ui.toast("Este navegador não abre fotos HEIC. Tire a foto em JPEG ou envie pelo celular.", { tipo: "erro" });
          return;
        }
      } finally { otimStatus.hidden = true; }
      // a conversa mudou enquanto a foto era reduzida: o arquivo não segue para outro cliente
      if (!mesmaConversa(idInicio)) { ui.toast("Você trocou de conversa enquanto a foto era preparada: nada foi enviado. Anexe de novo na conversa certa.", { tipo: "info", ms: 8000 }); return; }
      if (!aceitaAnexo()) return;
    }
    const escolhidoInicial = otim ? otim.arquivo : f;
    const v = L.validarArquivo(escolhidoInicial, { provedor: provedorCanal() });   // WAV só vale em número do CodeWords
    if (!v.ok) {
      ui.toast(v.erro === "midia_grande"
        ? `Arquivo grande demais: ${L.tamanhoLegivel(escolhidoInicial.size)} (limite ${v.tipo === "imagem" ? "5 MB para fotos" : "16 MB"}).`
        : v.wav ? "Este número não aceita WAV: use MP3, OGG, AAC ou M4A."
        : "Tipo de arquivo não aceito pelo WhatsApp. Use foto (JPG, PNG, WEBP), vídeo MP4, áudio (MP3, OGG, AAC), PDF ou Office.", { tipo: "erro" });
      return;
    }
    const vOriginal = otim && otim.otimizada ? L.validarArquivo(f) : null;      // "enviar original" só quando o original também cabe (≤ 5 MB)
    let url = null;
    let previa;
    if (v.tipo === "imagem") { url = URL.createObjectURL(escolhidoInicial); previa = h("img", { src: url, alt: "Prévia da foto" }); }
    else if (v.tipo === "video") { url = URL.createObjectURL(f); previa = h("video", { src: url, controls: true, preload: "metadata" }); }
    else if (v.tipo === "audio") { url = URL.createObjectURL(f); previa = h("audio", { src: url, controls: true }); }
    else previa = h("div", { class: "cv-doc" }, h("span", { class: "cv-doc-ic" }, (f.name.split(".").pop() || "ARQ").slice(0, 4).toUpperCase()),
      h("span", { class: "cv-doc-txt" }, h("b", null, f.name), h("small", null, L.tamanhoLegivel(f.size))));
    const leg = h("textarea", { id: "cvx-legenda", rows: 2, maxlength: 1024, placeholder: v.tipo === "audio" ? "Áudio vai sem legenda" : "Legenda (opcional)", disabled: v.tipo === "audio" });
    const resumo = otim && otim.otimizada ? L.resumoOtimizacao(f.size, otim.arquivo.size) : "";
    const info = h("p", { class: "sub cv-otim-info", role: "status" }, resumo || `${f.name} · ${L.tamanhoLegivel(f.size)}`);
    const chkOriginal = vOriginal && vOriginal.ok ? h("input", { type: "checkbox", id: "cvx-original", "data-sem-protecao": "" }) : null;
    if (chkOriginal) chkOriginal.addEventListener("change", () => {
      info.textContent = chkOriginal.checked ? `Vai a foto original (${L.tamanhoLegivel(f.size)}).` : resumo;
    });
    // o aparelho do CodeWords não manda vídeo como vídeo: ele vai pelo envio de arquivo, e a pessoa fica sabendo antes de mandar
    const avisoVideo = codeWords && v.tipo === "video" ? h("p", { class: "sub cv-aviso-canal" }, "Neste número o vídeo chega como arquivo para baixar.") : null;
    const corpo = h("div", { class: "pilha" }, h("div", { class: "cv-anexo-previa" }, previa), info, avisoVideo,
      chkOriginal ? h("label", { class: "chip-check cv-original", for: "cvx-original" }, chkOriginal, `Enviar a original (${L.tamanhoLegivel(f.size)})`) : null,
      h("div", { class: "campo" }, h("label", { for: "cvx-legenda" }, "Legenda"), leg));
    const ok = await ui.modal({ titulo: `Enviar arquivo para ${nomeDestino()}`, corpo, largura: "m", aoAbrir: () => setTimeout(() => { if (!leg.disabled) leg.focus(); }, 40),
      acoes: [{ rotulo: "Cancelar", tipo: "neutro" }, { rotulo: "Enviar", tipo: "primario", valor: true }] });
    if (url) URL.revokeObjectURL(url);
    if (!ok) return;
    // a conversa mudou com o modal aberto (mensagem nova abriu outra, atalho de teclado): o arquivo não vai para quem não era o destino
    if (!mesmaConversa(idInicio)) { ui.toast("A conversa aberta mudou antes do envio: o arquivo não foi enviado. Anexe de novo na conversa certa.", { tipo: "info", ms: 8000 }); return; }
    const usaOriginal = !!(chkOriginal && chkOriginal.checked);
    const arquivoFinal = usaOriginal ? f : escolhidoInicial;
    // o aparelho do CodeWords não cita mensagem: a faixa «Respondendo…» sai para o arquivo não parecer uma resposta citada
    if (codeWords && respondendo) { respondendo = null; desenharResposta(); }
    await A.acoes.enviar({ tipo: "midia", conversa: idInicio, arquivo: arquivoFinal, validacao: usaOriginal ? vOriginal : v, legenda: v.tipo === "audio" ? "" : leg.value.trim(), client_ref: L.novoClientRef() });
  }

  /* ---------------- modelos (templates aprovados) */
  async function abrirModelos() {
    if (usaCodeWords()) { ui.toast("Modelos da Meta não estão disponíveis neste canal CodeWords.", { tipo: "info" }); return; }
    const c = conv();
    if (!c) return;
    if (!c.canal_id) { ui.toast("Este atendimento não tem mais número para enviar.", { tipo: "erro" }); return; }
    const idInicio = c.id;                            // o modelo é para ESTA conversa
    const ct = contato();
    const todos = ((A.base && A.base.templates) || []).filter(t => t.canal_id === c.canal_id && String(t.status || "").toUpperCase() !== "DELETED");
    const lista = h("div", { class: "cv-modelos", role: "listbox", "aria-label": "Modelos" });
    const params = h("div", { class: "pilha-p" });
    const previa = h("div", { class: "cv-previa", hidden: true, "aria-live": "polite" });
    let escolhido = null;
    const campos = [];
    function atualizarPrevia() {
      if (!escolhido) { previa.hidden = true; return; }
      previa.hidden = false;
      previa.textContent = L.preencherModelo(escolhido.corpo || "", campos.map(x => x.value));
    }
    function escolher(t, bt) {
      escolhido = t;
      for (const b of lista.querySelectorAll(".cv-modelo")) b.setAttribute("aria-pressed", String(b === bt));
      ui.limpar(params); campos.length = 0;
      const n = Number(t.num_parametros) || L.contarParametros(t.corpo);
      const vars = varsAtuais();
      for (let i = 1; i <= n; i++) {
        const id = `cvx-par-${i}`;
        const inp = h("input", { id, type: "text", maxlength: 300, value: i === 1 && vars.primeiro_nome ? vars.primeiro_nome : "", placeholder: `Valor de {{${i}}}` });
        inp.addEventListener("input", atualizarPrevia);
        campos.push(inp);
        params.appendChild(h("div", { class: "campo" }, h("label", { for: id }, `Parâmetro {{${i}}}`), inp));
      }
      atualizarPrevia();
      if (campos[0]) setTimeout(() => campos[0].focus(), 30);
    }
    if (!todos.length) {
      lista.appendChild(ui.vazio({ titulo: "Nenhum modelo neste número.", icone: "alerta",
        texto: A.acoes.pode("admin") ? "Crie e aprove modelos no WhatsApp Manager da Meta e depois use “Sincronizar modelos” em Configurações → Números de WhatsApp."
          : "Peça ao administrador para sincronizar os modelos aprovados do número." }));
    }
    for (const t of todos.slice().sort((a, b) => (L.modeloDisponivel(b, { optin: ct.optin_marketing }).ok - L.modeloDisponivel(a, { optin: ct.optin_marketing }).ok) || String(a.nome).localeCompare(String(b.nome)))) {
      const disp = L.modeloDisponivel(t, { optin: ct.optin_marketing });
      const cat = String(t.categoria || "").toUpperCase();
      const b = h("button", { type: "button", class: "cv-modelo", role: "option", "aria-pressed": "false", disabled: !disp.ok },
        h("span", { class: "cv-modelo-l1" }, h("span", { class: "mono" }, t.nome), ui.pilula(cat === "MARKETING" ? "Marketing" : cat === "UTILITY" ? "Utilidade" : cat === "AUTHENTICATION" ? "Autenticação" : (cat || "Modelo"), cat === "MARKETING" ? "aten" : "neutra"),
          h("span", { class: "fraco mono" }, t.idioma || "")),
        h("p", null, t.corpo || "(sem texto)"),
        disp.ok ? null : h("small", null, disp.motivo));
      b.addEventListener("click", () => escolher(t, b));
      lista.appendChild(b);
    }
    const corpo = h("div", { class: "pilha" },
      h("p", { class: "sub" }, "Modelos aprovados pela Meta abrem ou retomam a conversa fora da janela de 24 h. A Meta cobra por modelo entregue."),
      lista, params, previa);
    await ui.modal({ titulo: `Enviar modelo para ${nomeDestino()}`, corpo, largura: "m",
      acoes: [{ rotulo: "Cancelar", tipo: "neutro" }, { rotulo: "Enviar modelo", tipo: "primario", fn: api => {
        if (!mesmaConversa(idInicio)) { api.erro("A conversa aberta mudou. Feche e escolha o modelo de novo na conversa certa."); return false; }
        if (!escolhido) { api.erro("Escolha um modelo."); return false; }
        const vals = campos.map(x => x.value.trim());
        const falta = vals.findIndex(v => !v);
        if (falta >= 0) { api.erro(`Preencha o parâmetro {{${falta + 1}}}.`); campos[falta].focus(); return false; }
        A.acoes.enviar({ tipo: "template", conversa: idInicio, template: escolhido, parametros: vals });
        return true;
      } }] });
  }
  btModelos.addEventListener("click", () => abrirModelos());

  /* ---------------- IA (sugere; nunca envia) */
  async function sugerir() {
    if (situacao() !== "ok") return;
    // honesto e sem chamada: sem chave da IA ou cota do mês gasta, avisa na hora
    const ia = A.base && A.base.ia;
    if (ia && ia.ligada === false) { ui.toast("A IA não está disponível agora.", { tipo: "info" }); return; }
    const cota = ia && ia.cota;
    if (cota && cota.limite != null && Number(cota.usadas) >= Number(cota.limite)) { ui.toast("A cota de IA do mês acabou.", { tipo: "info" }); return; }
    iaTrab.hidden = false;
    btIA.disabled = true;
    const idPedido = idDoCampo;                       // a sugestão é para ESTA conversa
    try {
      const r = await A.acoes.sugerirIA();
      const texto = r && typeof r.texto === "string" ? r.texto.trim() : "";
      if (!texto) throw Object.assign(new Error("ia_indisponivel"), { codigo: "ia_indisponivel" });
      // a IA pode levar dezenas de segundos: se a pessoa já está em outra conversa, a sugestão não entra no campo (seria texto de um cliente indo para outro)
      if (!idPedido || idDoCampo !== idPedido || A.selId !== idPedido) {
        ui.toast("A sugestão da IA chegou depois que você trocou de conversa e não foi usada. Peça de novo na conversa certa.", { tipo: "info", ms: 8000 });
        return;
      }
      if (ta.value.trim()) {
        // o campo já tem texto da pessoa: a sugestão entra ABAIXO (e só ela fica selecionada), nunca por cima do que foi digitado
        const base = `${ta.value.replace(/\s+$/, "")}\n\n`;
        ta.value = (base + texto).slice(0, 4096);
        autoAltura();
        ta.focus();
        ta.setSelectionRange(Math.min(base.length, ta.value.length), ta.value.length);
        ui.anunciar("Sugestão da IA acrescentada abaixo do que você já tinha escrito. Revise antes de enviar.");
      } else {
        ta.value = texto;
        autoAltura();
        ta.focus();
        ta.select();
        ui.anunciar("Sugestão da IA no campo. Revise antes de enviar.");
      }
      if (!modoNota) { A.rascunhos.set(idDoCampo, ta.value); A.acoes.rascunhoMudou(); }
    } catch (e) {
      const c = e && e.codigo;
      ui.toast(c === "ia_cota" ? "A cota de IA do mês acabou." : c === "muitos_pedidos" ? "Muitos pedidos seguidos; espere um minuto." : "A IA não está disponível agora.", { tipo: c === "ia_cota" || c === "muitos_pedidos" ? "info" : "erro" });
    } finally {
      iaTrab.hidden = true;
      btIA.disabled = situacao() !== "ok";
    }
  }
  btIA.addEventListener("click", () => sugerir());

  /* ---------------- menu "+" (celular) */
  btMaisM.addEventListener("click", () => {
    const s = situacao();
    ui.menu(btMaisM, [
      !usaCodeWords() ? { rotulo: "Modelos aprovados", icone: "camadas", fn: () => abrirModelos(), desabilitado: !(s === "ok" || s === "janela") } : null,
      { rotulo: modoNota ? "Voltar para mensagem" : "Nota interna", icone: "nota", fn: () => alternarNota() },
      A.base && A.base.ia ? { rotulo: "Sugerir com IA", icone: "ia", fn: () => sugerir(), desabilitado: s !== "ok" } : null,
    ].filter(Boolean));
  });

  return {
    el, atualizar, definirConversa, responder, anexar, aceitaAnexo, abrirModelos,
    /** Alt+Shift+N: liga/desliga a nota interna (true/false força; sem argumento alterna). Devolve se o campo está em nota. */
    alternarNota(forcar) { if (el.hidden || !A.podeEscrever) return false; alternarNota(forcar); return modoNota; },
    get emNota() { return modoNota; },
    /** Guarda o texto do campo como rascunho (da sessão) da conversa a que ele PERTENCE — não da que está selecionada agora — e nunca o de uma nota interna. */
    guardar() { if (idDoCampo && !modoNota) A.rascunhos.set(idDoCampo, ta.value); },
    /** O texto do campo, se ele é da conversa `id` e não é nota interna (para o "Rascunho:" da lista); senão "". */
    textoDe(id) { return idDoCampo === id && !modoNota ? ta.value : ""; },
    /** "Cancelar" na fila: o texto volta ao campo (se já houver algo, vai embaixo). */
    devolverTexto(texto) {
      const t = String(texto || "");
      if (!t) return;
      ta.value = ta.value.trim() ? `${ta.value.replace(/\s+$/, "")}\n${t}` : t;
      if (modoNota) alternarNota(false);
      autoAltura(); ta.focus();
      ta.dispatchEvent(new Event("input", { bubbles: true }));
    },
    desmontar() { if (gravacao) pararGravacao(true); desligarRascunho(); },
    focar() { if (!ta.disabled) ta.focus(); },
  };
}
