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
  let notaEmVoo = false, notaReq = null;   // D2: nota interna a caminho (Enter repetido não grava duas) e o p_req da intenção
  let pedindoIA = false;                   // D7: «Sugerir com IA» a caminho (botão e menu «+» não pedem de novo)
  let avisadoOutro = null, perguntandoOutro = false;   // CA-075: «conversa:dono» já confirmado para responder conversa de colega
  let rrAberto = false, rrItens = [], rrSel = 0;

  const ta = h("textarea", { rows: 1, placeholder: "Mensagem  ·  / para respostas rápidas", "aria-label": "Mensagem", maxlength: 4096 });
  const contador = h("span", { class: "cvx-contador", hidden: true, "aria-live": "off" });
  const contadorAnuncio = h("span", { class: "sr-only", role: "status", "aria-live": "polite", "aria-atomic": "true" });
  const rotNota = h("div", { class: "cvx-rot-nota" }, ui.icone("nota"), "Nota interna — só a equipe vê");
  // plano 1000 · CA-077: com a assinatura ligada, quem escreve vê o que vai na frente do texto («Sai como: *Helena:* …»)
  const rotAssin = h("div", { class: "cvx-assin", hidden: true, title: "A assinatura com o seu nome entra na 1ª linha da mensagem (Configurações → Conversas)." });
  const campo = h("div", { class: "cvx-campo" }, rotNota, rotAssin, ta, contador, contadorAnuncio);
  // plano 1000 · CA-072: várias fotos de uma vez (até 10) — o seletor aceita mais de um arquivo
  const arquivo = h("input", { type: "file", hidden: true, multiple: true, accept: "image/jpeg,image/png,image/webp,video/mp4,video/3gpp,audio/aac,audio/mp4,audio/mpeg,audio/amr,audio/ogg,audio/wav,application/pdf,application/msword,application/vnd.ms-excel,application/vnd.ms-powerpoint,application/vnd.openxmlformats-officedocument.wordprocessingml.document,application/vnd.openxmlformats-officedocument.spreadsheetml.sheet,application/vnd.openxmlformats-officedocument.presentationml.presentation,text/plain" });
  const btClipe = h("button", { type: "button", class: "bt-icone", "aria-label": "Anexar arquivo", title: "Anexar (foto, vídeo, áudio, documento até 16 MB)" }, ui.icone("clipe"));
  const btAudio = h("button", { type: "button", class: "bt-icone cvx-audio", "aria-label": "Gravar áudio", title: "Gravar áudio para enviar" }, ui.icone("microfone"));
  const btModelos = h("button", { type: "button", class: "bt-icone so-largo", "aria-label": "Enviar modelo aprovado", title: "Modelos aprovados" }, A.icone("modelo"));
  const btNota = h("button", { type: "button", class: "bt-icone", "aria-label": "Nota interna", title: "Nota interna (a equipe vê, o cliente não)", "aria-pressed": "false" }, ui.icone("nota"));
  const btIA = h("button", { type: "button", class: "bt-icone so-largo", "aria-label": "Sugerir resposta com IA", title: "Sugerir com IA" }, ui.icone("ia"));
  // CA-060: quem cuida das respostas rápidas (supervisor+) também tem o «Mais» no computador: «Salvar como resposta rápida»
  const supervisor = !!(A.acoes.pode && A.acoes.pode("supervisor"));
  const btMaisM = h("button", { type: "button", class: ["bt-icone", supervisor ? "cvx-mais-sup" : "so-estreito"], "aria-label": "Mais opções", title: "Mais" }, ui.icone("mais"));
  // CA-067: no computador, um seletor curto de emoji (no celular o teclado já tem)
  const btEmoji = h("button", { type: "button", class: "bt-icone so-largo cvx-emoji-bt", "aria-label": "Inserir emoji", title: "Emoji (Win + . abre todos)", "aria-haspopup": "dialog", hidden: L.aparelhoDeToque() }, h("span", { class: "cvx-emoji-ic", "aria-hidden": "true" }, "😊"));
  // plano 50 · 36: o menu de respostas rápidas também abre por botão (no celular a «/» fica escondida no teclado)
  const btRR = h("button", { type: "button", class: "bt-icone cvx-rr-bt", "aria-label": "Respostas rápidas (/)", title: "Respostas rápidas: digite / ou toque aqui", "aria-expanded": "false", "aria-controls": "cvx-rr" }, ui.icone("raio"));
  const btEnviar = h("button", { type: "button", class: "bt bt-prim cvx-enviar", "aria-label": "Enviar" }, ui.icone("enviar"));
  const btInfo = h("button", { type: "button", class: "bt-icone cvx-info", "aria-label": "Por que não dá para gravar áudio?", "aria-expanded": "false", title: "Por que não dá para gravar áudio?", hidden: true }, ui.icone("info"));
  const ferr = h("div", { class: "cvx-ferr" }, btClipe, btInfo, btAudio, btRR, btEmoji, btModelos, btNota, btIA, btMaisM);
  const linha = h("div", { class: "cvx-linha" }, ferr, campo, btEnviar);
  const capInfo = h("p", { class: "cvx-cap-info", id: "cvx-cap-info", role: "status", "aria-live": "polite", hidden: true });
  let infoAberta = false, infoTimer = null;   // o aviso (navegador que não grava áudio) só aparece quando a pessoa toca no ⓘ (não ocupa a conversa o tempo todo)
  const tempoGravacao = h("span", { class: "cvx-rec-tempo", role: "timer", "aria-live": "off" }, "00:00");
  const btCancelarGravacao = h("button", { type: "button", class: "bt bt-fant bt-p" }, "Cancelar");
  // CA-030: barrinha do nível do microfone e o aviso de silêncio (microfone errado ou mudo)
  const nivelMic = h("span", { class: "cvx-rec-nivel", "aria-hidden": "true" }, h("i", null));
  const avisoMudo = h("span", { class: "cvx-rec-mudo", role: "alert", hidden: true }, "Não estamos ouvindo nada — confira o microfone.");
  const avisoFimGravacao = h("span", { class: "cvx-rec-fim", hidden: true }, "");
  const pintarNivel = n => { try { nivelMic.style.setProperty("--nivel", Number(n).toFixed(2)); } catch { /* sem estilo: só a barrinha não anda */ } };
  const painelGravacao = h("div", { class: "cvx-gravacao", role: "status", "aria-live": "polite", hidden: true },
    h("span", { class: "cvx-rec-ponto", "aria-hidden": "true" }), h("span", {}, "Gravando"), tempoGravacao, nivelMic, btCancelarGravacao, avisoMudo, avisoFimGravacao);
  const resp = h("div", { class: "cvx-resp", hidden: true });
  const seloRasc = h("div", { class: "cvx-rasc-selo" });       // "Rascunho restaurado · descartar" (o ctx.rascunho põe o selo aqui)
  let rasc = null;                                               // rascunho do campo ligado a esta conversa (ctx.rascunho.ligar)
  let idDoCampo = null;                                          // de QUAL conversa é o texto que está no campo (A.selId muda antes de a conversa nova carregar)
  const trava = h("div", { class: "cvx-trava", hidden: true });
  // plano 1000 · CA-074: a janela de 24 h fecha em menos de 30 min — a hora aparece no próprio campo (a pílula lá em cima passa despercebida)
  const avisoJanelaTxt = h("span", null, "");
  const avisoJanela = h("p", { class: "cvx-janela-aviso", role: "status", hidden: true }, ui.icone("relogio"), avisoJanelaTxt);
  const iaTrab = h("div", { class: "cvx-ia-trab", hidden: true, role: "status" }, "Escrevendo…");
  const dica = h("p", { class: "cvx-dica" });
  /** CA-068: «Enter envia» (padrão) ou «Ctrl+Enter envia» (Enter quebra a linha) — preferência por navegador; a dica acompanha. */
  const ctrlEnter = () => !!(A.acoes.enterQuebra && A.acoes.enterQuebra());
  function desenharDica() {
    ui.limpar(dica);
    if (ctrlEnter()) dica.append(h("kbd", null, "Ctrl"), "+", h("kbd", null, "Enter"), " envia · ", h("kbd", null, "Enter"), " quebra linha · ", h("kbd", null, "/"), " respostas rápidas");
    else dica.append(h("kbd", null, "Enter"), " envia · ", h("kbd", null, "Shift"), "+", h("kbd", null, "Enter"), " quebra linha · ", h("kbd", null, "/"), " respostas rápidas");
  }
  desenharDica();
  const rr = h("div", { class: "cvx-rr", role: "listbox", "aria-label": "Respostas rápidas", hidden: true, id: "cvx-rr" });
  const rrStatus = h("span", { class: "sr-only", role: "status", "aria-live": "polite", "aria-atomic": "true" });
  const el = h("div", { class: "cvx", hidden: true, dataset: { modo: "texto" } }, rr, rrStatus, resp, iaTrab, trava, avisoJanela, capInfo, painelGravacao, seloRasc, linha, dica, arquivo);

  ta.setAttribute("aria-controls", "cvx-rr");
  ta.setAttribute("aria-autocomplete", "list");
  /* plano 50: selo visível «Sugestão da IA no campo» com «Descartar» (some quando a pessoa edita, envia ou troca de conversa).
     Nasce aqui, junto do campo: definirConversa() e o «input» já podem escondê-lo sem depender da ordem do arquivo. */
  let sugestaoIA = null, textoAntesIA = "";
  const btDescartarIA = h("button", { type: "button", class: "bt bt-fant bt-p" }, "Descartar");
  // CA-062: outra sugestão sem descartar e pedir de novo (respeita a trava D7 e a cota: é o mesmo sugerir())
  const btOutraIA = h("button", { type: "button", class: "bt bt-fant bt-p cvx-ia-outra" }, "Outra sugestão");
  const seloIA = h("div", { class: "cvx-ia-selo", role: "status", hidden: true }, ui.icone("ia"), h("span", null, "Sugestão da IA no campo — revise antes de enviar."), btDescartarIA, btOutraIA);
  el.insertBefore(seloIA, linha);
  function mostrarSeloIA(textoNoCampo, antes) { sugestaoIA = textoNoCampo; textoAntesIA = antes; seloIA.hidden = false; }
  function esconderSeloIA() { sugestaoIA = null; textoAntesIA = ""; seloIA.hidden = true; }

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
    if (contato().bloqueado === true) return "bloqueado";      // D14: o servidor recusa (contato_bloqueado): a tela explica antes
    if (!c.canal_id) return "sem_canal";
    if (L.canalTemJanela(provedorCanal()) && !L.janela(c).aberta) return "janela";   // CodeWords não tem janela de 24 h
    if (!usaCodeWords() && c.canal && c.canal.tem_token === false) return "sem_token";
    return "ok";
  }
  /** CA-073: «Resolvido por Ana às 14:02. Reabra para responder.» (nx_cv_ver manda resolvida_por e resolvida_em) — quem reabre sabe o que desfaz. */
  function textoResolvida(c) {
    const p = c && c.resolvida_por, quando = c && c.resolvida_em;
    if (!p && !quando) return "Atendimento resolvido. Reabra para responder.";
    const quem = p ? (A.eu && p.id === A.eu.id ? "você" : (p.nome || "alguém da equipe")) : "";
    const hoje = quando && L.diaSP(quando) === L.diaSP(Date.now());
    const tempo = quando ? (hoje ? `às ${L.horaMsg(quando)}` : `em ${ui.dataHoraBR(quando)}`) : "";
    return `Resolvido${quem ? ` por ${quem}` : ""}${tempo ? ` ${tempo}` : ""}. Reabra para responder.`;
  }
  function podeTexto() { return modoNota ? A.podeEscrever && !!conv() : situacao() === "ok"; }
  /** CA-004: "sem" (IA não configurada para a empresa: o nx_cv_base sempre manda o objeto, com ligada:false) · "cota" (cota do mês gasta) · "ok". */
  function estadoIA() {
    const ia = A.base && A.base.ia;
    if (!ia || ia.ligada === false) return "sem";
    const cota = ia.cota;
    if (cota && cota.limite != null && Number(cota.usadas) >= Number(cota.limite)) return "cota";
    return "ok";
  }
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
    atualizarContador();
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
      trava.append(ui.icone("check"), h("p", null, textoResolvida(c)), b,
        h("button", { type: "button", class: "bt bt-fant bt-p", on: { click: () => alternarNota(true) } }, ui.icone("nota"), "Nota interna"));
    } else if (s === "bloqueado") {
      // D14: nada sai para contato bloqueado — quem pode desbloqueia aqui mesmo; a nota interna continua valendo
      trava.hidden = false; linha.hidden = !modoNota; dica.hidden = true;
      const sup = A.acoes.pode("supervisor");
      const bDesb = sup ? h("button", { type: "button", class: "bt bt-sec bt-p cvx-desbloquear", on: { click: () => A.acoes.ocultar(false) } }, ui.icone("check"), "Desbloquear") : null;
      trava.append(...[ui.icone("cadeado"), h("p", null, sup ? "Este contato está bloqueado: nada é enviado para ele. Desbloqueie para responder."
        : "Este contato está bloqueado: nada é enviado para ele. Peça a um supervisor para desbloquear (menu ⋮ da conversa)."), bDesb,
        h("button", { type: "button", class: "bt bt-fant bt-p", on: { click: () => alternarNota(true) } }, ui.icone("nota"), "Nota interna")].filter(Boolean));
    } else if (s === "sem_canal") {
      trava.hidden = false; dica.hidden = true;
      trava.append(ui.icone("alerta"), h("p", null, "O número deste atendimento foi removido. Comece uma nova conversa por outro número."),
        h("button", { type: "button", class: "bt bt-sec bt-p", on: { click: () => A.acoes.novaConversa({ contato: contato() }) } }, "Nova conversa"));
    } else if (s === "janela" && !modoNota) {
      trava.hidden = false;
      // (só chega aqui em canal da Meta: no CodeWords não existe janela — ver situacao())
      const b = h("button", { type: "button", class: "bt bt-prim bt-p" }, A.icone("modelo"), "Modelos");
      b.addEventListener("click", () => abrirModelos());
      // CA-089: sem «janela» nem «modelo» soltos — o que aconteceu e o que dá para fazer
      trava.append(ui.icone("relogio"), h("p", null, c && c.ultima_entrada_em ? L.JANELA_FECHADA_LONGO : L.JANELA_NUNCA_LONGO), b);
    } else if (s === "sem_token" && !modoNota) {
      trava.hidden = false;
      trava.append(...[ui.icone("alerta"), h("p", null, "Este número ainda não tem o token da Meta. Configure em Números de WhatsApp."),
        A.acoes.pode("admin") ? h("a", { class: "bt bt-sec bt-p", href: "#/config/numeros" }, "Números de WhatsApp") : null].filter(Boolean));
    }
    const ok = podeTexto();
    ta.disabled = !ok;
    const estreito = matchMedia("(max-width: 760px)").matches;
    ta.placeholder = modoNota ? (estreito ? "Nota para a equipe" : "Escreva uma nota para a equipe (o cliente não vê)")
      : s === "janela" ? "Passaram 24 h: só mensagem aprovada (modelo)"
      : estreito ? "Mensagem" : "Mensagem  ·  / para respostas rápidas";
    // CA-074: a janela fecha em menos de 30 min — a hora no próprio campo
    const avisoJ = s === "ok" && !modoNota && c && L.canalTemJanela(provedorCanal()) ? L.avisoJanelaFechando(L.janela(c)) : "";
    avisoJanela.hidden = !avisoJ;
    if (avisoJanelaTxt.textContent !== avisoJ) avisoJanelaTxt.textContent = avisoJ;
    // CA-077: assinatura ligada — o prefixo que o cliente vai ver
    const pref = !modoNota && s === "ok" && A.base && A.base.cfg && A.base.cfg.assinatura ? L.prefixoAssinatura((A.eu && A.eu.nome) || "") : "";
    rotAssin.hidden = !pref;
    if (pref && rotAssin.dataset.pref !== pref) { ui.limpar(rotAssin); rotAssin.append("Sai como: ", h("b", { class: "mono" }, pref), " …"); rotAssin.dataset.pref = pref; }
    btEnviar.disabled = !ok;
    btEnviar.setAttribute("aria-label", modoNota ? "Salvar nota" : "Enviar");
    btEnviar.title = modoNota ? "Salvar nota (só a equipe vê)" : "Enviar";
    // CA-154: no modo nota o botão diz «Salvar nota» (no computador, com o rótulo à vista) — Enter não manda nota achando que é mensagem
    ui.limpar(btEnviar); btEnviar.appendChild(ui.icone(modoNota ? "check" : "enviar"));
    if (modoNota) btEnviar.appendChild(h("span", { class: "cvx-enviar-rot", "aria-hidden": "true" }, "Salvar nota"));
    btEnviar.dataset.rotulo = modoNota ? "1" : "0";
    const codeWords = usaCodeWords();
    const gravavel = podeGravar();
    // CA-106: sem internet o arquivo não sobe — clipe e microfone ficam desligados com o motivo (o texto ainda vai para a fila)
    const offline = !!(A.acoes.offline && A.acoes.offline());
    btClipe.hidden = false;
    btModelos.hidden = codeWords;                    // modelo aprovado é coisa da Meta
    btClipe.setAttribute("aria-disabled", String(modoNota || s !== "ok" || offline));   // anexo vale nos dois canais (Meta e CodeWords)
    btClipe.title = offline ? "Sem internet: arquivos só saem com a conexão de volta (o texto espera na fila)." : "Anexar foto, vídeo, áudio ou documento (até 16 MB)";
    btClipe.setAttribute("aria-label", offline ? "Anexar arquivo (indisponível sem internet)" : "Anexar arquivo");
    btAudio.hidden = false;
    const gravando = !!gravacao;
    btAudio.disabled = !gravando && (modoNota || s !== "ok" || !gravavel || offline);
    btAudio.title = gravando ? "Parar e revisar o áudio"
      : offline ? "Sem internet: o áudio só sai com a conexão de volta."
      : !gravavel ? "Gravação indisponível neste navegador; você ainda pode anexar um áudio salvo."
      : `Gravar áudio para enviar (${L.textoLimiteGravacao()})`;
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
    // CA-004: sem a IA configurada (ia.ligada = false) o botão não aparece; com a cota do mês gasta, fica desligado dizendo por quê
    const iaEst = estadoIA();
    btIA.disabled = modoNota || s !== "ok" || pedindoIA || iaEst === "cota";
    btIA.title = iaEst === "cota" ? "A cota de IA do mês acabou" : "Sugerir com IA";
    btIA.setAttribute("aria-label", iaEst === "cota" ? "Sugerir resposta com IA (cota do mês acabou)" : "Sugerir resposta com IA");
    btRR.disabled = modoNota || s !== "ok";
    btRR.setAttribute("aria-expanded", String(rrAberto));
    btEmoji.disabled = !ok;
    btModelos.disabled = codeWords || modoNota || !(s === "ok" || s === "janela");
    btNota.disabled = !A.podeEscrever;
    btNota.setAttribute("aria-pressed", String(modoNota));
    btIA.hidden = iaEst === "sem";
    btOutraIA.hidden = iaEst !== "ok";
    desenharDica();
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

  /** Texto guardado no aparelho para uma chave de rascunho (ctx.rascunho), sem ligar nada. */
  function guardadoEm(chave) {
    const r = A.ctx && A.ctx.rascunho;
    if (!r || typeof r.texto !== "function") return "";
    try { const t = r.texto(chave); return t && t.trim() ? t : ""; } catch { return ""; }
  }
  /** CA-031: a gravação no meio é descartada (troca de conversa, saída de Conversas) — nunca calada. */
  function descartarGravacao(motivo) {
    if (!gravacao) return;
    pararGravacao(true);
    ui.toast(`Gravação descartada: ${motivo}. Nada foi enviado.`, { tipo: "info", ms: 7000 });
  }
  function definirConversa() {
    if (gravacao) descartarGravacao("você abriu outra conversa");
    // o rascunho da conversa ANTERIOR sai antes de o campo mudar: desligado depois, ele gravaria o texto da conversa nova na chave da antiga
    desligarRascunho();
    modoNota = false;
    respondendo = null;
    fecharRR();
    esconderSeloIA();                                // o selo fala do texto da conversa anterior: na nova ele seria falso
    desenharResposta();
    idDoCampo = A.selId || null;
    const daSessao = (idDoCampo && A.rascunhos.get(idDoCampo)) || "";
    // D5: o texto ficou guardado como NOTA interna (e não há rascunho de mensagem): o campo volta no modo nota com ele — antes abria em
    // mensagem, vazio, e o texto só reaparecia ligando «Nota interna» de novo
    if (!daSessao.trim() && idDoCampo && A.podeEscrever && guardadoEm(`conversa:${idDoCampo}:nota`) && !guardadoEm(`conversa:${idDoCampo}`)) {
      modoNota = true;
      ui.anunciar("Rascunho de nota interna restaurado.");
    }
    ta.value = modoNota ? "" : daSessao;
    atualizarContador();
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
  let faixaContador = "normal";
  /** D14: o teto que vale: 4096 menos a assinatura «*Nome:*» que o servidor põe na frente (nota interna não leva assinatura). */
  function teto() {
    if (modoNota) return L.LIMITE_TEXTO;
    return L.tetoTexto({ assinatura: !!(A.base && A.base.cfg && A.base.cfg.assinatura), nome: (A.eu && A.eu.nome) || "" });
  }
  function atualizarContador() {
    const t = teto();
    if (String(ta.getAttribute("maxlength")) !== String(t)) ta.setAttribute("maxlength", t);
    const valor = String(ta.value || "");
    const restantes = Math.max(0, t - valor.length);
    const duplos = restantes <= 200 ? L.contarDuplos(valor) : 0;      // emoji conta 2 (unidades UTF-16): a conta é a do WhatsApp
    contador.hidden = restantes > 200;
    contador.textContent = L.textoContador(restantes, duplos);
    contador.title = t < L.LIMITE_TEXTO ? `Limite de ${t.toLocaleString("pt-BR")} caracteres: a assinatura com o seu nome entra na frente da mensagem.` : "";
    contador.dataset.alerta = restantes <= 50 ? "1" : "0";
    const faixa = restantes === 0 ? "limite" : restantes <= 50 ? "critico" : restantes <= 200 ? "perto" : "normal";
    if (faixa !== faixaContador) {
      const tt = t.toLocaleString("pt-BR");
      contadorAnuncio.textContent = faixa === "limite" ? `Limite de ${tt} caracteres atingido.`
        : faixa === "critico" ? "Restam 50 caracteres ou menos."
        : faixa === "perto" ? `A mensagem está perto do limite de ${tt} caracteres${t < L.LIMITE_TEXTO ? " (a assinatura conta)" : ""}.`
        : "Há espaço para continuar a mensagem.";
      faixaContador = faixa;
    }
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
  // CA-059: até 30 opções roláveis (antes 8 e o resto só pelo atalho exato) e o cabeçalho diz quantas há
  const RR_MAX = 30;
  let rrTotal = 0;
  function abrirRR(termo) {
    const dep = conv() && conv().departamento_id;
    const todas = L.filtrarRespostas((A.base && A.base.respostas) || [], termo, { departamento: dep, max: Infinity });
    rrTotal = todas.length;
    rrItens = todas.slice(0, RR_MAX);
    rrSel = 0;
    rrAberto = true;
    desenharRR(termo);
  }
  /** Trecho com o termo buscado em <mark> (sem acento/caixa): o olho acha o porquê de cada item ter aparecido. */
  function comMarca(texto, termo) {
    const partes = L.partesDestaque(String(texto ?? ""), termo || "");
    return partes.map(p => (p.marca ? h("mark", null, p.t) : p.t));
  }
  /** Prévia com as variáveis pintadas: preenchidas em <mark class=cvx-var>, {campos a preencher} em <mark class=cvx-pend>. */
  function previaVariaveis(corpo) {
    return L.partesVariaveis(corpo, varsAtuais()).map(p => (p.tipo === "var" ? h("mark", { class: "cvx-var", title: `{${p.nome}}` }, p.t)
      : p.tipo === "pendente" ? h("mark", { class: "cvx-pend", title: "Você preenche depois de inserir" }, p.t) : p.t));
  }
  function nomeDepartamento(id) { return id ? ((A.base && A.base.departamentos) || []).find(d => d.id === id)?.nome || "" : ""; }
  function desenharRR(termo) {
    ui.limpar(rr);
    rr.hidden = false;
    btRR.setAttribute("aria-expanded", "true");
    rrStatus.textContent = rrItens.length
      ? `${rrItens.length} respostas rápidas disponíveis. Use as setas e Enter para escolher, ou Escape para fechar.`
      : (termo ? "Nenhuma resposta rápida encontrada." : "Nenhuma resposta rápida cadastrada.");
    // CA-018: no toque não há setas nem Esc — a dica de teclado sai; CA-059: o cabeçalho diz quantas há (e quando nem todas cabem)
    const mais = L.textoContagemRespostas(rrItens.length, rrTotal);
    rr.appendChild(h("div", { class: "cvx-rr-cab" },
      h("span", { class: "rotulo" }, termo ? `Respostas rápidas · «${termo}»` : "Respostas rápidas", rrItens.length ? h("span", { class: "cvx-rr-n dado" }, ` · ${mais || rrItens.length}`) : null),
      L.aparelhoDeToque() ? null : h("span", { class: "rotulo cvx-rr-teclas" }, "↑↓ Enter · Esc")));
    if (!rrItens.length) {
      rr.appendChild(h("p", { class: "cvx-rr-vazio" }, termo ? `Nenhuma resposta com «${termo}».` : "Nenhuma resposta cadastrada. ",
        A.acoes.pode("supervisor") ? h("a", { class: "link", href: "#/config/respostas" }, "Cadastrar respostas") : null));
      return;
    }
    const lista = h("div", { class: "cvx-rr-lista" });
    rrItens.forEach((r, i) => {
      const dep = nomeDepartamento(r.departamento_id);
      const meta = [r.usos ? `${r.usos} ${r.usos === 1 ? "uso" : "usos"}` : null, dep || null].filter(Boolean).join(" · ");
      const op = h("button", { type: "button", role: "option", class: "cvx-rr-op", id: `cvx-rr-${i}`, "aria-selected": String(i === rrSel), tabindex: "-1" },
        h("span", { class: "mono" }, "/", ...comMarca(r.atalho, termo)), h("b", null, ...comMarca(r.titulo, termo)),
        h("small", null, L.aplicarVariaveis(r.corpo, varsAtuais())),
        meta ? h("span", { class: "cvx-rr-meta dado" }, meta) : null);
      op.addEventListener("mousedown", ev => ev.preventDefault());
      // CA-019: passar o mouse só troca a marcação e a prévia — os botões ficam (antes a lista inteira era refeita e a rolagem pulava)
      op.addEventListener("mouseenter", () => { if (rrSel !== i) { rrSel = i; marcarRR(false); } });
      op.addEventListener("click", () => escolherRR(i));
      lista.appendChild(op);
    });
    const previa = h("div", { class: "cvx-rr-previa", "aria-hidden": "true" });
    rr.appendChild(h("div", { class: "cvx-rr-corpo" }, lista, previa));
    marcarRR(true);
  }
  /** Marca a opção rrSel (aria-selected), refaz só a prévia e, pelo teclado, rola até ela. */
  function marcarRR(rolar) {
    for (const op of rr.querySelectorAll(".cvx-rr-op")) op.setAttribute("aria-selected", String(op.id === `cvx-rr-${rrSel}`));
    const previa = rr.querySelector(".cvx-rr-previa");
    if (previa) {
      // prévia do item marcado (desktop): o texto inteiro com as variáveis pintadas e quantos campos ficam para preencher
      const sel = rrItens[rrSel];
      const pend = sel ? L.contarCampos(L.aplicarVariaveis(sel.corpo, varsAtuais())) : 0;
      ui.limpar(previa);
      previa.append(h("div", { class: "cvx-rr-previa-cab" }, h("b", null, sel ? sel.titulo : ""), h("span", { class: "mono" }, sel ? `/${sel.atalho}` : "")),
        h("p", { class: "cvx-rr-previa-txt" }, sel ? previaVariaveis(sel.corpo) : ""),
        h("p", { class: "cvx-rr-previa-rod" }, pend ? `${pend} ${pend === 1 ? "campo" : "campos"} para preencher depois de inserir (Tab pula entre eles)` : "Pronta para enviar: nenhum campo a preencher"));
    }
    ta.setAttribute("aria-activedescendant", `cvx-rr-${rrSel}`);
    const atual = rr.querySelector(`#cvx-rr-${rrSel}`);
    if (rolar && atual && typeof atual.scrollIntoView === "function") atual.scrollIntoView({ block: "nearest" });
  }
  function fecharRR() {
    rrAberto = false; rrItens = [];
    rr.hidden = true; ui.limpar(rr);
    btRR.setAttribute("aria-expanded", "false");
    rrStatus.textContent = "Respostas rápidas fechadas.";
    ta.removeAttribute("aria-activedescendant");
  }
  function escolherRR(i) {
    const r = rrItens[i];
    if (!r) return;
    const texto = L.aplicarVariaveis(r.corpo, varsAtuais());
    const base = ta.value;
    let inicio = 0;
    if (L.termoBarra(base) !== null || !base.trim()) ta.value = texto;        // «/termo» (ou campo vazio): a resposta ocupa o campo
    else {                                                                   // veio pelo botão com texto já digitado: entra no cursor, sem apagar nada
      const ini = ta.selectionStart ?? base.length, fim = ta.selectionEnd ?? ini;
      const antes = base.slice(0, ini), sep = antes && !/\s$/.test(antes) ? " " : "";
      ta.value = `${antes}${sep}${texto}${base.slice(fim)}`;
      inicio = antes.length + sep.length;
    }
    atualizarContador();
    fecharRR();
    const campos = L.contarCampos(texto);
    rrStatus.textContent = campos ? `Resposta rápida aplicada. ${campos} ${campos === 1 ? "campo" : "campos"} para preencher: Tab pula para o próximo.` : "Resposta rápida aplicada.";
    autoAltura();
    ta.focus();
    const campo = L.proximoCampo(ta.value, inicio);    // cai no primeiro {campo a preencher}
    if (campo) ta.setSelectionRange(campo[0], campo[1]);
    else { const fim = inicio + texto.length; ta.setSelectionRange(fim, fim); }
    if (!modoNota && idDoCampo) { A.rascunhos.set(idDoCampo, ta.value); A.acoes.rascunhoMudou(); }
    A.acoes.respostaUsada(r.id);
  }
  /** Tab com um {campo} selecionado pula para o próximo (Shift+Tab volta); sem outro campo, o Tab segue o caminho normal. */
  function pularCampo(ev) {
    const ini = ta.selectionStart, fim = ta.selectionEnd;
    if (ini === null || ini === undefined || fim === null || fim === undefined || fim <= ini) return false;
    if (!/^\{[^{}\n]+\}$/.test(ta.value.slice(ini, fim))) return false;
    const r = L.proximoCampo(ta.value, ev.shiftKey ? ini : fim, ev.shiftKey ? -1 : 1);
    if (!r || (r[0] === ini && r[1] === fim)) return false;
    ev.preventDefault();
    ta.setSelectionRange(r[0], r[1]);
    return true;
  }
  btRR.addEventListener("click", () => {
    if (rrAberto) { fecharRR(); ta.focus(); return; }
    if (btRR.disabled) return;
    if (!ta.value.trim()) { ta.value = "/"; atualizarContador(); autoAltura(); if (!modoNota && idDoCampo) A.rascunhos.set(idDoCampo, ta.value); }
    ta.focus();
    abrirRR(L.termoBarra(ta.value) ?? "");
  });

  ta.addEventListener("input", () => {
    autoAltura(); atualizarContador();
    if (!seloIA.hidden && ta.value !== sugestaoIA) esconderSeloIA();   // a pessoa mexeu no texto: a sugestão virou texto dela
    if (!modoNota && idDoCampo) { A.rascunhos.set(idDoCampo, ta.value); A.acoes.rascunhoMudou(); }
    if (modoNota) return;
    const t = L.termoBarra(ta.value);
    if (t !== null) abrirRR(t); else if (rrAberto) fecharRR();
  });
  ta.addEventListener("blur", () => setTimeout(() => { if (document.activeElement !== ta) fecharRR(); }, 120));
  ta.addEventListener("keydown", ev => {
    // plano 1000 · CA-159: Ctrl+/ abre as respostas rápidas no meio do texto (a mesma rotina do botão ⚡: entra no cursor, sem apagar nada)
    if ((ev.ctrlKey || ev.metaKey) && !ev.altKey && (ev.key === "/" || ev.code === "Slash") && !ev.isComposing) {
      ev.preventDefault();
      if (rrAberto) { fecharRR(); return; }
      if (!btRR.disabled && !modoNota) btRR.click();
      return;
    }
    if (rrAberto) {
      if (ev.key === "ArrowDown") { ev.preventDefault(); if (rrItens.length) { rrSel = (rrSel + 1) % rrItens.length; marcarRR(true); } return; }
      if (ev.key === "ArrowUp") { ev.preventDefault(); if (rrItens.length) { rrSel = (rrSel - 1 + rrItens.length) % rrItens.length; marcarRR(true); } return; }
      if (ev.key === "Enter" || ev.key === "Tab") { if (rrItens.length) { ev.preventDefault(); escolherRR(rrSel); } else if (ev.key === "Enter") ev.preventDefault(); return; }
      if (ev.key === "Escape") { ev.preventDefault(); fecharRR(); return; }
    }
    if (ev.key === "Tab" && !ev.isComposing && pularCampo(ev)) return;       // {campo} selecionado: Tab vai para o próximo campo da resposta rápida
    if (ev.key === "Escape" && respondendo) { ev.preventDefault(); respondendo = null; desenharResposta(); return; }
    // M35: Esc no campo devolve o foco à lista (o rascunho já está guardado); j/k, / e ? passam a valer fora do campo
    if (ev.key === "Escape" && !ev.isComposing) { ev.preventDefault(); A.acoes.focarLista(); return; }
    // CA-068: com «Ctrl+Enter envia» ligado, Enter só quebra a linha (quem escreve mensagem longa não envia por engano)
    if (ev.key === "Enter" && !ev.shiftKey && !ev.isComposing && !matchMedia("(pointer: coarse)").matches) {
      if (ctrlEnter() && !(ev.ctrlKey || ev.metaKey)) return;
      ev.preventDefault(); enviarDoCampo();
    }
  });
  btEnviar.addEventListener("click", () => enviarDoCampo());

  async function enviarDoCampo() {
    const texto = ta.value.trim();
    if (!texto || !podeTexto()) return;
    // o texto do campo é de uma conversa só: enquanto a aberta não for ela (troca em andamento), Enter não manda nada para ninguém
    if (!idDoCampo || idDoCampo !== A.selId || !conv() || conv().id !== idDoCampo) return;
    const limite = teto();
    if (texto.length > limite) {
      ui.toast(limite < L.LIMITE_TEXTO ? `A mensagem passou de ${limite.toLocaleString("pt-BR")} caracteres (a assinatura conta). Divida em duas.`
        : `A mensagem passou de ${limite.toLocaleString("pt-BR")} caracteres. Divida em duas.`, { tipo: "erro" });
      return;
    }
    if (modoNota) {
      // CA-107: sem internet a nota não sai — o texto fica no campo (e no rascunho) e o aviso diz o que fazer, sem erro técnico
      if (A.acoes.offline && A.acoes.offline()) { ui.toast("Sem internet: a nota fica no campo e você salva quando a conexão voltar.", { tipo: "info" }); return; }
      // D2: Enter repetido com a nota a caminho não grava outra; a mesma nota (depois de uma falha) repete o MESMO p_req
      if (notaEmVoo) return;
      notaEmVoo = true;
      btEnviar.disabled = true;
      const conversaNota = idDoCampo;
      if (!notaReq || notaReq.conversa !== conversaNota || notaReq.texto !== texto) notaReq = { conversa: conversaNota, texto, req: L.novoUuid() };
      try {
        await A.acoes.nota(texto, { req: notaReq.req, conversa: conversaNota });
        notaReq = null;
        // só limpa se o campo ainda é desta nota (a pessoa pode ter trocado de conversa ou escrito outra coisa enquanto ela ia)
        if (idDoCampo === conversaNota && ta.value.trim() === texto) {
          ta.value = ""; autoAltura(); atualizarContador();
          apagarRascunho();
          if (modoNota) alternarNota(false);
        } else if (idDoCampo !== conversaNota && guardadoEm(`conversa:${conversaNota}:nota`).trim() === texto) {
          // revisão: trocou de conversa com a nota a caminho — a troca guardou o texto como rascunho de nota daquela conversa; gravada a
          // nota, o rascunho igual a ela sai (senão voltava em modo nota, «restaurado», convidando a gravar em dobro com outro p_req)
          try { A.ctx.rascunho.apagar(`conversa:${conversaNota}:nota`); } catch { /* ok */ }
        }
      } catch (e) { A.acoes.tratarErro(e); }
      finally { notaEmVoo = false; btEnviar.disabled = !podeTexto(); }
      return;
    }
    // CA-075: a conversa está com outra pessoa — na 1ª mensagem, pergunta (assumir e responder · só responder) para os dois não
    // responderem o cliente ao mesmo tempo; a escolha vale para esta conversa até ela mudar de dono
    const c0 = conv();
    if (c0 && c0.atribuida_a && A.eu && c0.atribuida_a !== A.eu.id && avisadoOutro !== `${c0.id}:${c0.atribuida_a}`) {
      if (perguntandoOutro) return;
      const dono = (c0.atribuida && c0.atribuida.nome) || c0.atribuida_nome || "outra pessoa da equipe";
      perguntandoOutro = true;
      let escolha;
      try {
        escolha = await ui.modal({ titulo: `Esta conversa é de ${dono}`, largura: "p",
          corpo: h("p", null, `${dono} está atendendo este cliente. Se você responder também, ele pode receber duas respostas ao mesmo tempo.`),
          acoes: [{ rotulo: "Cancelar", tipo: "neutro" }, { rotulo: "Só responder", tipo: "neutro", valor: "so" }, { rotulo: "Assumir e responder", tipo: "primario", valor: "assumir" }] });
      } finally { perguntandoOutro = false; }
      if (!escolha || !mesmaConversa(c0.id)) return;
      avisadoOutro = `${c0.id}:${c0.atribuida_a}`;
      if (escolha === "assumir") await A.acoes.assumir();
      if (!mesmaConversa(c0.id) || ta.value.trim() !== texto) return;
    }
    const citada = respondendo;
    ta.value = ""; autoAltura(); atualizarContador();
    esconderSeloIA();
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
  arquivo.addEventListener("change", () => {
    const lista = arquivo.files ? [...arquivo.files] : [];
    if (lista.length > 1) anexarVarios(lista);       // CA-072
    else if (lista[0]) anexar(lista[0]);
  });
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
      const atual = { rec, fluxo, partes: [], cancelar: false, timer: null, inicio: Date.now(), avisou: false, amostras: [], medidor: null, guarda: null };
      gravacao = atual;
      // CA-031: recarregar/fechar a página com a gravação no meio pergunta antes (o shell cuida do aviso do navegador)
      if (A.ctx && typeof A.ctx.naoAtualizar === "function") { try { atual.guarda = A.ctx.naoAtualizar(() => gravacao === atual); } catch { atual.guarda = null; } }
      // CA-030: nível do microfone (AnalyserNode do mesmo fluxo) — barrinha e aviso de silêncio; sem Web Audio a gravação segue igual
      try {
        const AC = globalThis.AudioContext || globalThis.webkitAudioContext;
        if (AC && AC.prototype && typeof AC.prototype.createAnalyser === "function" && typeof AC.prototype.createMediaStreamSource === "function") {
          const actx = new AC();
          const an = actx.createAnalyser();
          an.fftSize = 512;
          actx.createMediaStreamSource(fluxo).connect(an);
          atual.medidor = { actx, an, buf: new Float32Array(an.fftSize) };
        }
      } catch { atual.medidor = null; }
      avisoMudo.hidden = true; avisoFimGravacao.hidden = true; pintarNivel(0);
      rec.addEventListener("dataavailable", ev => { if (ev.data && ev.data.size) atual.partes.push(ev.data); });
      rec.addEventListener("error", () => {
        // MediaRecorder ainda pode emitir dataavailable e stop depois do erro; o fragmento fica descartado.
        atual.cancelar = true;
        ui.toast("A gravação falhou e o áudio parcial foi descartado. Tente novamente ou anexe um áudio salvo.", { tipo: "erro" });
      }, { once: true });
      rec.addEventListener("stop", async () => {
        clearInterval(atual.timer);
        atual.fluxo.getTracks().forEach(t => t.stop());
        if (atual.medidor) { try { atual.medidor.actx.close(); } catch { /* ok */ } atual.medidor = null; }
        if (typeof atual.guarda === "function") { try { atual.guarda(); } catch { /* ok */ } atual.guarda = null; }
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
        if (atual.medidor) {
          try {
            atual.medidor.an.getFloatTimeDomainData(atual.medidor.buf);
            let soma = 0; for (const x of atual.medidor.buf) soma += x * x;
            const nivel = Math.sqrt(soma / atual.medidor.buf.length);
            const agora = Date.now();
            atual.amostras.push({ t: agora, nivel });
            while (atual.amostras.length && agora - atual.amostras[0].t > 4000) atual.amostras.shift();
            pintarNivel(Math.min(1, nivel * 8));
            avisoMudo.hidden = !L.microfoneMudo(atual.amostras);
          } catch { /* sem medidor: segue gravando */ }
        }
        // CA-029: até 5 minutos (antes 1); 30 s antes do fim o painel avisa
        if (segundos >= L.GRAVACAO_AVISO_S && !atual.avisou) {
          atual.avisou = true;
          avisoFimGravacao.textContent = `Faltam ${L.GRAVACAO_MAX_S - L.GRAVACAO_AVISO_S} s: a gravação para sozinha em ${L.GRAVACAO_MAX_S / 60} minutos.`;
          avisoFimGravacao.hidden = false;
        }
        if (segundos >= L.GRAVACAO_MAX_S) {
          pararGravacao(false);
          ui.toast(`Limite de ${L.GRAVACAO_MAX_S / 60} minutos atingido. Revise o áudio antes de enviar.`, { tipo: "info" });
        }
      }, 250);
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
    // CA-013: qualquer arquivo copiado (PDF do Explorer, planilha…) vai para o anexo — o validarArquivo recusa o que o WhatsApp não aceita
    const arquivos = itens.filter(i => i.kind === "file");
    if (!arquivos.length) {
      // CA-011: o texto colado não cabe (maxlength cortaria o fim calado): avisa com os números
      const colado = ev.clipboardData && typeof ev.clipboardData.getData === "function" ? String(ev.clipboardData.getData("text/plain") || ev.clipboardData.getData("text") || "") : "";
      const sel = Math.max(0, (ta.selectionEnd ?? 0) - (ta.selectionStart ?? 0));
      const aviso = L.avisoColagem({ colado: colado.length, atual: String(ta.value || "").length, selecionado: sel, teto: teto() });
      if (aviso) ui.toast(aviso, { tipo: "info", ms: 9000 });
      return;
    }
    ev.preventDefault();
    if (arquivos.length > 1) {
      const soImagens = arquivos.every(i => /^image\//.test(i.type || ""));
      ui.toast(soImagens ? `${arquivos.length} imagens copiadas; somente a primeira será anexada. Repita a colagem para enviar as demais.`
        : `${arquivos.length} arquivos copiados; somente o primeiro será anexado. Repita a colagem para enviar os demais.`, { tipo: "info" });
    }
    const f = arquivos[0].getAsFile();
    if (!f) return;
    const imagem = /^image\//.test(f.type || arquivos[0].type || "");
    anexar(imagem ? new File([f], f.name && f.name !== "image.png" ? f.name : `imagem-colada-${Date.now()}.png`, { type: f.type }) : f);
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
  function avisarAnexoIndisponivel() {
    const s = situacao();
    ui.toast(s === "resolvida" ? "O atendimento foi resolvido enquanto o arquivo estava aberto. Nada foi enviado; reabra para enviar."
      : s === "janela" ? "A janela de 24 h fechou enquanto o arquivo estava aberto. Nada foi enviado; use um modelo aprovado."
      : "O atendimento mudou e não está mais disponível para envio. O arquivo não foi enviado.", { tipo: "info", ms: 8000 });
  }

  async function anexar(f) {
    const idInicio = conv() ? conv().id : null;      // o arquivo foi escolhido para ESTA conversa
    if (!aceitaAnexo()) {
      ui.toast(situacao() === "janela" ? "Fora da janela de 24 h só vale modelo aprovado." : "Não dá para anexar agora.", { tipo: "info" });
      return;
    }
    // CA-106: sem internet o arquivo não sobe — avisa antes (antes ele tentava o nx-midia e caía num erro genérico)
    if (A.acoes.offline && A.acoes.offline()) { ui.toast("Sem internet: arquivos só saem com a conexão de volta. O texto você já pode mandar (ele espera na fila).", { tipo: "info", ms: 8000 }); return; }
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
      if (!aceitaAnexo()) { avisarAnexoIndisponivel(); return; }
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
    const leg = h("textarea", { id: "cvx-legenda", rows: 2, maxlength: 1024, placeholder: v.tipo === "audio" ? "Áudio vai sem legenda" : "Legenda (opcional)", disabled: v.tipo === "audio", "aria-describedby": "cvx-legenda-n" });
    // CA-071: a legenda tem 1.024 caracteres — o contador aparece a partir de 900 (como no campo principal)
    const legN = h("small", { class: "cvx-legenda-n dado", id: "cvx-legenda-n", "aria-live": "polite", hidden: true });
    leg.addEventListener("input", () => { const n = String(leg.value || "").length; legN.hidden = n < 900; legN.textContent = L.textoContador(1024 - n); });
    // CA-243: número da Meta com a janela de 24 h fechando — o aviso vem no próprio modal, antes de a pessoa escrever a legenda
    const jan = !codeWords && conv() ? L.janela(conv()) : null;
    const avisoJanela = jan && jan.aberta && jan.restanteMs < 2 * 60000
      ? h("p", { class: "aviso aviso-aten cv-aviso-janela", role: "alert" }, ui.icone("relogio"),
        h("span", null, `A janela de 24 h fecha em ${Math.max(1, Math.ceil(jan.restanteMs / 60000))} min: envie logo, senão só um modelo aprovado vale.`))
      : null;
    const resumo = otim && otim.otimizada ? L.resumoOtimizacao(f.size, otim.arquivo.size) : "";
    const info = h("p", { class: "sub cv-otim-info", role: "status" }, resumo || `${f.name} · ${L.tamanhoLegivel(f.size)}`);
    const chkOriginal = vOriginal && vOriginal.ok ? h("input", { type: "checkbox", id: "cvx-original", "data-sem-protecao": "" }) : null;
    if (chkOriginal) chkOriginal.addEventListener("change", () => {
      info.textContent = chkOriginal.checked ? `Vai a foto original (${L.tamanhoLegivel(f.size)}).` : resumo;
    });
    // o aparelho do CodeWords não manda vídeo como vídeo: ele vai pelo envio de arquivo, e a pessoa fica sabendo antes de mandar
    const avisoVideo = codeWords && v.tipo === "video" ? h("p", { class: "sub cv-aviso-canal" }, "Neste número o vídeo chega como arquivo para baixar.") : null;
    const corpo = h("div", { class: "pilha" }, avisoJanela, h("div", { class: "cv-anexo-previa" }, previa), info, avisoVideo,
      chkOriginal ? h("label", { class: "chip-check cv-original", for: "cvx-original" }, chkOriginal, `Enviar a original (${L.tamanhoLegivel(f.size)})`) : null,
      h("div", { class: "campo" }, h("label", { for: "cvx-legenda" }, "Legenda"), leg, legN));
    let ok;
    try {
      ok = await ui.modal({ titulo: `Enviar arquivo para ${nomeDestino()}`, corpo, largura: "m", aoAbrir: () => setTimeout(() => { if (!leg.disabled) leg.focus(); }, 40),
        acoes: [{ rotulo: "Cancelar", tipo: "neutro" }, { rotulo: "Enviar", tipo: "primario", valor: true }] });
    } finally { if (url) { try { URL.revokeObjectURL(url); } catch { /* navegador já descartou a URL */ } } }
    if (!ok) return;
    // a conversa mudou com o modal aberto (mensagem nova abriu outra, atalho de teclado): o arquivo não vai para quem não era o destino
    if (!mesmaConversa(idInicio)) { ui.toast("A conversa aberta mudou antes do envio: o arquivo não foi enviado. Anexe de novo na conversa certa.", { tipo: "info", ms: 8000 }); return; }
    if (!aceitaAnexo()) { avisarAnexoIndisponivel(); return; }
    const usaOriginal = !!(chkOriginal && chkOriginal.checked);
    const arquivoFinal = usaOriginal ? f : escolhidoInicial;
    // o aparelho do CodeWords não cita mensagem: a faixa «Respondendo…» sai para o arquivo não parecer uma resposta citada
    if (codeWords && respondendo) { respondendo = null; desenharResposta(); }
    await A.acoes.enviar({ tipo: "midia", conversa: idInicio, arquivo: arquivoFinal, validacao: usaOriginal ? vOriginal : v, legenda: v.tipo === "audio" ? "" : leg.value.trim(), client_ref: L.novoClientRef() });
  }

  /** plano 1000 · CA-072: várias fotos de uma vez — um modal só com as miniaturas (até 10) e uma legenda opcional por foto; saem em
      sequência, na ordem, pela mesma rotina de mídia (cada uma com o seu client_ref). Arquivos que não são todos fotos vão um por vez. */
  const MAX_FOTOS = 10;
  async function anexarVarios(lista) {
    const idInicio = conv() ? conv().id : null;
    if (!aceitaAnexo()) { ui.toast(situacao() === "janela" ? "Fora da janela de 24 h só vale mensagem aprovada (modelo)." : "Não dá para anexar agora.", { tipo: "info" }); return; }
    if (A.acoes.offline && A.acoes.offline()) { ui.toast("Sem internet: arquivos só saem com a conexão de volta. O texto você já pode mandar (ele espera na fila).", { tipo: "info", ms: 8000 }); return; }
    if (!lista.every(f => L.ehFoto(f))) {
      ui.toast(`${lista.length} arquivos escolhidos: vão um de cada vez, cada um com a sua prévia.`, { tipo: "info", ms: 7000 });
      for (const f of lista) { if (!mesmaConversa(idInicio)) return; await anexar(f); }
      return;
    }
    const escolhidas = lista.slice(0, MAX_FOTOS);
    if (lista.length > MAX_FOTOS) ui.toast(`Até ${MAX_FOTOS} fotos por vez: ${lista.length - MAX_FOTOS} ficaram de fora. Envie as outras em seguida.`, { tipo: "info", ms: 8000 });
    const prontas = [];
    otimStatus.hidden = false;
    try {
      for (const f of escolhidas) {
        let otim = null;
        try { otim = await otimizarFoto(f); }
        catch { if (/^image\/hei[cf]$/.test(L.mimeDe(f))) { ui.toast(`«${f.name}» é HEIC, que este navegador não abre: ficou de fora.`, { tipo: "erro" }); continue; } }
        const arq = otim ? otim.arquivo : f;
        const v = L.validarArquivo(arq, { provedor: provedorCanal() });
        if (!v.ok) { ui.toast(`«${f.name}» ficou de fora: ${v.erro === "midia_grande" ? `${L.tamanhoLegivel(arq.size)} passa do limite de 5 MB para fotos` : "tipo não aceito pelo WhatsApp"}.`, { tipo: "erro" }); continue; }
        prontas.push({ arq, v, nome: f.name });
      }
    } finally { otimStatus.hidden = true; }
    if (!mesmaConversa(idInicio)) { ui.toast("Você trocou de conversa enquanto as fotos eram preparadas: nada foi enviado. Anexe de novo na conversa certa.", { tipo: "info", ms: 8000 }); return; }
    if (!prontas.length) return;
    const urls = [];
    const itens = prontas.map((p, i) => {
      let url = null;
      try { url = URL.createObjectURL(p.arq); urls.push(url); } catch { url = null; }
      p.leg = h("input", { type: "text", maxlength: 1024, class: "cvx-multi-leg", placeholder: "Legenda (opcional)", "aria-label": `Legenda da foto ${i + 1} de ${prontas.length}`, autocomplete: "off" });
      return h("li", { class: "cvx-multi-item" }, url ? h("img", { src: url, alt: `Foto ${i + 1} de ${prontas.length}` }) : h("span", { class: "cvx-multi-sem" }, p.nome), p.leg);
    });
    const corpo = h("div", { class: "pilha" }, h("ul", { class: "cvx-multi", "aria-label": "Fotos escolhidas" }, itens),
      h("p", { class: "sub" }, `Saem uma depois da outra, na ordem acima (${prontas.length} ${prontas.length === 1 ? "foto" : "fotos"}).`));
    let ok;
    try {
      ok = await ui.modal({ titulo: `Enviar ${prontas.length} fotos para ${nomeDestino()}`, corpo, largura: "m",
        acoes: [{ rotulo: "Cancelar", tipo: "neutro" }, { rotulo: `Enviar ${prontas.length}`, tipo: "primario", valor: true }] });
    } finally { for (const u of urls) { try { URL.revokeObjectURL(u); } catch { /* ok */ } } }
    if (!ok) return;
    for (const p of prontas) {
      if (!mesmaConversa(idInicio)) { ui.toast("A conversa aberta mudou no meio do envio: as fotos que faltavam não foram enviadas.", { tipo: "info", ms: 8000 }); return; }
      if (!aceitaAnexo()) { avisarAnexoIndisponivel(); return; }
      await A.acoes.enviar({ tipo: "midia", conversa: idInicio, arquivo: p.arq, validacao: p.v, legenda: String(p.leg.value || "").trim(), client_ref: L.novoClientRef() });
    }
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
    // CA-058: grupo de opções de verdade (radiogroup + radio aria-checked; setas andam); o indisponível diz o motivo (aria-describedby)
    const lista = h("div", { class: "cv-modelos", role: "radiogroup", "aria-label": "Modelos" });
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
      if (bt.getAttribute("aria-disabled") === "true") return;
      escolhido = t;
      for (const b of lista.querySelectorAll(".cv-modelo")) { b.setAttribute("aria-checked", String(b === bt)); b.tabIndex = b === bt ? 0 : -1; }
      ui.limpar(params); campos.length = 0;
      const n = Number(t.num_parametros) || L.contarParametros(t.corpo);
      const vars = varsAtuais();
      for (let i = 1; i <= n; i++) {
        const id = `cvx-par-${i}`;
        // CA-028: nenhum parâmetro vem preenchido (o {{1}} pode ser a data, não o nome): o chip «Usar nome» preenche num toque
        const inp = h("input", { id, type: "text", maxlength: 300, value: "", placeholder: `Valor de {{${i}}}`, "aria-describedby": `cvx-par-${i}-erro` });
        const erro = h("small", { class: "campo-erro", id: `cvx-par-${i}-erro`, role: "alert", hidden: true });
        const corrigir = h("button", { type: "button", class: "bt bt-fant bt-p cvx-par-corrigir", hidden: true }, "Corrigir");
        const conferir = () => { const e = L.erroParametroModelo(inp.value, i); erro.textContent = e; erro.hidden = !e; corrigir.hidden = !e; inp.setAttribute("aria-invalid", e ? "true" : "false"); };
        inp.addEventListener("input", () => { atualizarPrevia(); if (!erro.hidden) conferir(); });
        inp.addEventListener("blur", conferir);
        corrigir.addEventListener("click", () => { inp.value = L.corrigirParametroModelo(inp.value); conferir(); atualizarPrevia(); inp.focus(); });
        campos.push(inp);
        const chip = vars.primeiro_nome ? h("button", { type: "button", class: "cvx-chip cvx-par-nome", on: { click: () => { inp.value = vars.primeiro_nome; conferir(); atualizarPrevia(); inp.focus(); } } }, `Usar nome: ${vars.primeiro_nome}`) : null;
        params.appendChild(h("div", { class: "campo" }, h("label", { for: id }, `Parâmetro {{${i}}}`), inp, erro, h("div", { class: "linha cvx-par-acoes" }, chip, corrigir)));
      }
      atualizarPrevia();
      if (campos[0]) setTimeout(() => campos[0].focus(), 30);
    }
    lista.addEventListener("keydown", ev => {
      if (!["ArrowDown", "ArrowRight", "ArrowUp", "ArrowLeft"].includes(ev.key)) return;
      const ops = [...lista.querySelectorAll(".cv-modelo")].filter(b => !b.hidden && b.getAttribute("aria-disabled") !== "true");
      if (!ops.length) return;
      ev.preventDefault();
      const i = ops.indexOf(document.activeElement);
      const j = (i + (ev.key === "ArrowDown" || ev.key === "ArrowRight" ? 1 : -1) + ops.length) % ops.length;
      ops[j].click(); ops[j].focus();
    });
    if (!todos.length) {
      lista.appendChild(ui.vazio({ titulo: "Nenhum modelo neste número.", icone: "alerta", tema: "conversas",
        texto: A.acoes.pode("admin") ? "Crie e aprove modelos no WhatsApp Manager da Meta e depois use “Sincronizar modelos” em Configurações → Números de WhatsApp."
          : "Peça ao administrador para sincronizar os modelos aprovados do número." }));
    }
    let primeiro = true;
    for (const [k, t] of todos.slice().sort((a, b) => (L.modeloDisponivel(b, { optin: ct.optin_marketing }).ok - L.modeloDisponivel(a, { optin: ct.optin_marketing }).ok) || String(a.nome).localeCompare(String(b.nome))).entries()) {
      const disp = L.modeloDisponivel(t, { optin: ct.optin_marketing });
      const cat = String(t.categoria || "").toUpperCase();
      const idMot = `cvx-mod-mot-${k}`;
      const b = h("button", { type: "button", class: "cv-modelo", role: "radio", "aria-checked": "false", tabindex: disp.ok && primeiro ? "0" : "-1",
        "aria-disabled": disp.ok ? null : "true", "aria-describedby": disp.ok ? null : idMot, dataset: { categoria: cat, busca: L.semAcento(`${t.nome} ${t.corpo || ""}`) } },
        h("span", { class: "cv-modelo-l1" }, h("span", { class: "mono" }, t.nome), ui.pilula(cat === "MARKETING" ? "Marketing" : cat === "UTILITY" ? "Utilidade" : cat === "AUTHENTICATION" ? "Autenticação" : (cat || "Modelo"), cat === "MARKETING" ? "aten" : "neutra",
            cat === "MARKETING" ? { title: L.dicaModeloMarketing(ct.optin_marketing) } : {}),
          h("span", { class: "fraco mono" }, t.idioma || "")),
        h("p", null, t.corpo || "(sem texto)"),
        disp.ok ? null : h("small", { id: idMot }, disp.motivo));
      if (disp.ok) primeiro = false;
      b.addEventListener("click", () => escolher(t, b));
      lista.appendChild(b);
    }
    // CA-069: com mais de 8 modelos, busca por nome/texto e chips de categoria
    let filtroBusca = null;
    if (todos.length > 8) {
      const inpBusca = h("input", { type: "search", class: "cvx-mod-busca", placeholder: "Buscar modelo pelo nome ou texto", "aria-label": "Buscar modelo", autocomplete: "off" });
      let cat = "";
      const nada = h("p", { class: "sub cvx-mod-nada", hidden: true }, "Nenhum modelo com esse termo.");
      const filtrar = () => {
        const q = L.semAcento(inpBusca.value.trim());
        let n = 0;
        for (const b of lista.querySelectorAll(".cv-modelo")) { const ok = (!q || b.dataset.busca.includes(q)) && (!cat || b.dataset.categoria === cat); b.hidden = !ok; if (ok) n++; }
        nada.hidden = n > 0;
      };
      inpBusca.addEventListener("input", filtrar);
      const cats = [...new Set(todos.map(t => String(t.categoria || "").toUpperCase()).filter(Boolean))];
      const nomeCat = c => (c === "MARKETING" ? "Marketing" : c === "UTILITY" ? "Utilidade" : c === "AUTHENTICATION" ? "Autenticação" : c);
      const chips = cats.length > 1 ? h("div", { class: "linha cvx-mod-cats", role: "group", "aria-label": "Categoria" }, [{ v: "", r: "Todas" }, ...cats.map(c => ({ v: c, r: nomeCat(c) }))].map(o => {
        const c = h("button", { type: "button", class: "cvx-chip", "aria-pressed": String(o.v === ""), dataset: { cat: o.v } }, o.r);
        c.addEventListener("click", () => { cat = o.v; for (const x of chips.querySelectorAll("button")) x.setAttribute("aria-pressed", String(x === c)); filtrar(); });
        return c;
      })) : null;
      filtroBusca = h("div", { class: "pilha-p cvx-mod-filtro" }, inpBusca, chips, nada);
    }
    const corpo = h("div", { class: "pilha" },
      h("p", { class: "sub" }, "Modelos aprovados pela Meta abrem ou retomam a conversa fora da janela de 24 h. A Meta cobra por modelo entregue. Marketing só não vai para quem pediu para sair."),
      filtroBusca, lista, params, previa);
    await ui.modal({ titulo: `Enviar modelo para ${nomeDestino()}`, corpo, largura: "m",
      acoes: [{ rotulo: "Cancelar", tipo: "neutro" }, { rotulo: "Enviar modelo", tipo: "primario", fn: api => {
        if (!mesmaConversa(idInicio)) { api.erro("A conversa aberta mudou. Feche e escolha o modelo de novo na conversa certa."); return false; }
        if (!escolhido) { api.erro("Escolha um modelo."); return false; }
         if (usaCodeWords() || !["ok", "janela"].includes(situacao())) { api.erro("Este atendimento não está mais disponível para envio de modelo. Confira o estado e tente novamente."); return false; }
         const modeloAtual = (A.base?.templates || []).find(t => t.id === escolhido.id && t.canal_id === conv()?.canal_id);
         const disponibilidade = L.modeloDisponivel(modeloAtual, { optin: contato().optin_marketing });
         if (!disponibilidade.ok) { api.erro(disponibilidade.motivo || "Este modelo não está mais disponível."); return false; }
         escolhido = modeloAtual;
        const vals = campos.map(x => x.value.trim());
        const falta = vals.findIndex(v => !v);
        if (falta >= 0) { api.erro(`Preencha o parâmetro {{${falta + 1}}}.`); campos[falta].focus(); return false; }
        // CA-027: a Meta recusa parâmetro com quebra de linha, tab ou 5+ espaços seguidos (132018) — o erro vem antes do envio
        const ruim = vals.findIndex((v, i) => L.erroParametroModelo(v, i + 1));
        if (ruim >= 0) { api.erro(`${L.erroParametroModelo(vals[ruim], ruim + 1)} Toque em «Corrigir» ao lado do campo.`); campos[ruim].dispatchEvent(new Event("blur")); campos[ruim].focus(); return false; }
        // D8: client_ref por intenção, como o texto e a mídia — «Enviar de novo» repete o MESMO (a Meta cobra cada modelo entregue)
        A.acoes.enviar({ tipo: "template", conversa: idInicio, template: escolhido, parametros: vals, client_ref: L.novoClientRef() });
        return true;
      } }] });
  }
  btModelos.addEventListener("click", () => abrirModelos());

  /* ---------------- IA (sugere; nunca envia) */
  async function sugerir({ outra = false } = {}) {
    if (pedindoIA || situacao() !== "ok") return;      // D7: um pedido por vez (botão, menu «+» do celular, «Outra sugestão» e atalho)
    // honesto e sem chamada: sem chave da IA ou cota do mês gasta, avisa na hora
    const ia = A.base && A.base.ia;
    if (ia && ia.ligada === false) { ui.toast("A IA ainda não foi configurada para esta empresa.", { tipo: "info" }); return; }
    const cota = ia && ia.cota;
    if (cota && cota.limite != null && Number(cota.usadas) >= Number(cota.limite)) { ui.toast("A cota de IA do mês acabou.", { tipo: "info" }); return; }
    pedindoIA = true;
    iaTrab.hidden = false;
    btIA.disabled = true; btOutraIA.disabled = true;
    const idPedido = idDoCampo;                       // a sugestão é para ESTA conversa
    // CA-062: «Outra sugestão» troca a sugestão que está no campo (o que a pessoa tinha escrito antes dela fica)
    const trocar = outra && sugestaoIA !== null && ta.value === sugestaoIA ? { antes: textoAntesIA, sugestao: sugestaoIA } : null;
    try {
      const r = await A.acoes.sugerirIA();
      const texto = r && typeof r.texto === "string" ? r.texto.trim() : "";
      if (!texto) throw Object.assign(new Error("ia_indisponivel"), { codigo: "ia_indisponivel" });
      // a IA pode levar dezenas de segundos: se a pessoa já está em outra conversa, a sugestão não entra no campo (seria texto de um cliente indo para outro)
      if (!idPedido || idDoCampo !== idPedido || A.selId !== idPedido) {
        ui.toast("A sugestão da IA chegou depois que você trocou de conversa e não foi usada. Peça de novo na conversa certa.", { tipo: "info", ms: 8000 });
        return;
      }
      if (trocar && ta.value === trocar.sugestao) { ta.value = trocar.antes; esconderSeloIA(); }
      if (ta.value.trim()) {
        // o campo já tem texto da pessoa: a sugestão entra ABAIXO (e só ela fica selecionada), nunca por cima do que foi digitado
        const base = `${ta.value.replace(/\s+$/, "")}\n\n`;
        ta.value = (base + texto).slice(0, teto()); atualizarContador();
        autoAltura();
        ta.focus();
        ta.setSelectionRange(Math.min(base.length, ta.value.length), ta.value.length);
        ui.anunciar("Sugestão da IA acrescentada abaixo do que você já tinha escrito. Revise antes de enviar.");
        mostrarSeloIA(ta.value, base.replace(/\n\n$/, ""));
      } else {
        ta.value = texto; atualizarContador();
        autoAltura();
        ta.focus();
        ta.select();
        ui.anunciar("Sugestão da IA no campo. Revise antes de enviar.");
        mostrarSeloIA(ta.value, "");
      }
      if (!modoNota) { A.rascunhos.set(idDoCampo, ta.value); A.acoes.rascunhoMudou(); }
    } catch (e) {
      // CA-088: cada motivo com o seu texto (sem chave, demorou, conversa sem mensagens…) — antes tudo virava «não está disponível»
      const er = L.erroIA(e);
      ui.toast(er.texto, { tipo: er.tipo });
    } finally {
      pedindoIA = false;
      iaTrab.hidden = true;
      btIA.disabled = modoNota || situacao() !== "ok" || estadoIA() === "cota";
      btOutraIA.disabled = false;
    }
  }
  btIA.addEventListener("click", () => sugerir());
  btOutraIA.addEventListener("click", () => sugerir({ outra: true }));
  // o selo (seloIA) nasce lá em cima, junto do campo
  btDescartarIA.addEventListener("click", () => {
    if (ta.value === sugestaoIA) { ta.value = textoAntesIA; atualizarContador(); autoAltura(); if (!modoNota && idDoCampo) { A.rascunhos.set(idDoCampo, ta.value); A.acoes.rascunhoMudou(); } }
    esconderSeloIA();
    ta.focus();
    ui.anunciar("Sugestão da IA descartada.");
  });

  /* ---------------- menu "+" (celular) */
  btMaisM.addEventListener("click", () => {
    const s = situacao();
    const iaEst = estadoIA();
    ui.menu(btMaisM, [
      !usaCodeWords() ? { rotulo: "Modelos aprovados", icone: "camadas", fn: () => abrirModelos(), desabilitado: !(s === "ok" || s === "janela") } : null,
      { rotulo: modoNota ? "Voltar para mensagem" : "Nota interna", icone: "nota", fn: () => alternarNota() },
      // CA-004: sem IA configurada o item não aparece; com a cota gasta aparece desligado com o motivo no rótulo
      iaEst !== "sem" ? { rotulo: pedindoIA ? "Sugerindo com IA…" : iaEst === "cota" ? "Sugerir com IA (cota do mês acabou)" : "Sugerir com IA", icone: "ia", fn: () => sugerir(), desabilitado: s !== "ok" || pedindoIA || iaEst === "cota" } : null,
      // CA-060: o supervisor guarda uma boa resposta como resposta rápida sem ir a Configurações
      supervisor && !modoNota ? { rotulo: "Salvar como resposta rápida", icone: "raio", fn: () => salvarComoResposta(), desabilitado: !ta.value.trim() } : null,
    ].filter(Boolean));
  });

  /** CA-060: o texto do campo vira resposta rápida (mesma RPC e regras do cv-config: atalho minúsculo sem acento, até 30). */
  async function salvarComoResposta() {
    const corpoTxt = ta.value.trim();
    if (!corpoTxt) { ui.toast("Escreva o texto da resposta no campo primeiro.", { tipo: "info" }); return; }
    const sugestao = L.semAcento(corpoTxt.split(/\s+/).slice(0, 2).join("-")).replace(/[^a-z0-9_-]/g, "").slice(0, 30);
    const inAtalho = h("input", { id: "cvx-rr-atalho", type: "text", maxlength: 31, value: sugestao, autocomplete: "off", "aria-describedby": "cvx-rr-atalho-ajuda" });
    const inTitulo = h("input", { id: "cvx-rr-titulo", type: "text", maxlength: 60, value: corpoTxt.slice(0, 40), autocomplete: "off" });
    const corpo = h("div", { class: "pilha" },
      h("div", { class: "campo" }, h("label", { for: "cvx-rr-atalho" }, "Atalho (depois da /)"), inAtalho,
        h("small", { class: "campo-ajuda", id: "cvx-rr-atalho-ajuda" }, "Letras minúsculas sem acento, números, - e _ (até 30).")),
      h("div", { class: "campo" }, h("label", { for: "cvx-rr-titulo" }, "Título"), inTitulo),
      h("p", { class: "rotulo" }, "Texto"), h("p", { class: "cvx-rr-salvar-previa" }, corpoTxt));
    const r = await ui.modal({ titulo: "Salvar como resposta rápida", corpo, largura: "p",
      acoes: [{ rotulo: "Cancelar", tipo: "neutro" }, { rotulo: "Salvar resposta", tipo: "primario", fn: async api => {
        const atalho = String(inAtalho.value || "").replace(/^\/+/, "").trim().toLowerCase();
        if (!/^[a-z0-9_-]{1,30}$/.test(atalho)) { api.erro("Atalho: use só letras minúsculas sem acento, números, - e _ (até 30)."); inAtalho.focus(); return false; }
        const titulo = String(inTitulo.value || "").trim();
        if (!titulo) { api.erro("Dê um título."); inTitulo.focus(); return false; }
        try {
          const salva = await A.api.rpcC("nx_resposta_salvar", { p_resposta: { atalho, titulo, corpo: corpoTxt, departamento_id: null, ativo: true } });
          return salva || { atalho, titulo, corpo: corpoTxt };
        } catch (e) {
          if (e && e.codigo === "atalho_em_uso") { api.erro(`Já existe a resposta /${atalho}. Escolha outro atalho.`); inAtalho.focus(); return false; }
          throw e;
        }
      } }] }).catch(e => { A.acoes.tratarErro(e); return null; });
    if (!r) return;
    if (A.base) A.base.respostas = [...(A.base.respostas || []).filter(x => !(r.id && x.id === r.id)), { id: r.id, atalho: r.atalho, titulo: r.titulo, corpo: r.corpo, ativo: true, usos: 0 }];
    ui.toast(`Resposta /${r.atalho} salva: já aparece no «/» para a equipe.`, { tipo: "ok" });
  }

  /* ---------------- emoji (CA-067): só no computador; insere no cursor */
  btEmoji.addEventListener("click", () => {
    if (btEmoji.disabled) return;
    const ini = ta.selectionStart ?? ta.value.length, fim = ta.selectionEnd ?? ini;
    const grade = h("div", { class: "cvx-emojis", role: "group", "aria-label": "Emojis" }, L.EMOJIS_RAPIDOS.map(e => h("button", { type: "button", class: "cvx-emoji", "aria-label": `Inserir ${e}` }, e)));
    const pop = ui.flutuante(btEmoji, h("div", { class: "pilha-p cvx-emoji-pop" }, grade, h("p", { class: "sub" }, "No Windows, ", h("kbd", null, "Win"), " + ", h("kbd", null, "."), " abre todos.")), { largura: 280 });
    grade.addEventListener("click", ev => {
      const b = ev.target && ev.target.closest ? ev.target.closest(".cvx-emoji") : null;
      if (!b) return;
      const e = b.textContent;
      if (ta.value.length + e.length > teto()) { ui.toast("O emoji não cabe: a mensagem está no limite.", { tipo: "info" }); return; }
      ta.value = `${ta.value.slice(0, ini)}${e}${ta.value.slice(fim)}`;
      try { pop.fechar(); } catch { /* ok */ }
      ta.focus();
      ta.setSelectionRange(ini + e.length, ini + e.length);
      ta.dispatchEvent(new Event("input", { bubbles: true }));
    });
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
      atualizarContador();
      if (modoNota) alternarNota(false);
      autoAltura(); ta.focus();
      ta.dispatchEvent(new Event("input", { bubbles: true }));
    },
    desmontar() { if (gravacao) descartarGravacao("você saiu de Conversas"); desligarRascunho(); },
    /** CA-031: há gravação de áudio em andamento (a central pergunta antes de trocar de tela). */
    get gravando() { return !!gravacao; },
    focar() { if (!ta.disabled) ta.focus(); },
  };
}
