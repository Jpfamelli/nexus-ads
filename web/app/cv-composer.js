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

  // plano 1500c · CC-123: «Mensagem» só (a dica do / fica na linha de dicas do computador; o leitor de tela lia «barra»)
  // plano 1500c · CX-031: o teclado do celular abre com maiúscula no começo da frase e corretor; a tecla Enter diz o que faz
  // (no toque ela quebra a linha; com teclado físico, envia)
  const ta = h("textarea", { rows: 1, placeholder: "Mensagem", "aria-label": "Mensagem", maxlength: 4096, autocapitalize: "sentences", spellcheck: "true",
    enterkeyhint: (() => { try { return matchMedia("(pointer: coarse)").matches ? "enter" : "send"; } catch { return "send"; } })() });
  const contador = h("span", { class: "cvx-contador", hidden: true, "aria-live": "off" });
  const contadorAnuncio = h("span", { class: "sr-only", role: "status", "aria-live": "polite", "aria-atomic": "true" });
  const rotNota = h("div", { class: "cvx-rot-nota" }, ui.icone("nota"), "Nota interna — só a equipe vê");
  // plano 1000 · CA-077: com a assinatura ligada, quem escreve vê o que vai na frente do texto («Sai como: *Helena:* …»)
  const rotAssin = h("div", { class: "cvx-assin", hidden: true, title: "A assinatura com o seu nome entra na 1ª linha da mensagem (Configurações → Conversas)." });
  const campo = h("div", { class: "cvx-campo" }, rotNota, rotAssin, ta, contador, contadorAnuncio);
  // plano 1000 · CA-072: várias fotos de uma vez (até 10) — o seletor aceita mais de um arquivo
  // plano 1000b · CB-079: HEIC/HEIF no accept — a foto do iPhone aparece no seletor do computador (a tela converte: ehFoto/otimizarFoto)
  const arquivo = h("input", { type: "file", hidden: true, multiple: true, accept: "image/jpeg,image/png,image/webp,image/heic,image/heif,.heic,.heif,video/mp4,video/3gpp,audio/aac,audio/mp4,audio/mpeg,audio/amr,audio/ogg,audio/wav,application/pdf,application/msword,application/vnd.ms-excel,application/vnd.ms-powerpoint,application/vnd.openxmlformats-officedocument.wordprocessingml.document,application/vnd.openxmlformats-officedocument.spreadsheetml.sheet,application/vnd.openxmlformats-officedocument.presentationml.presentation,text/plain" });
  const btClipe = h("button", { type: "button", class: "bt-icone", "aria-label": "Anexar arquivo", title: "Anexar (foto, vídeo, áudio, documento até 16 MB)" }, ui.icone("clipe"));
  const btAudio = h("button", { type: "button", class: "bt-icone cvx-audio", "aria-label": "Gravar áudio", title: "Gravar áudio para enviar" }, ui.icone("microfone"));
  const btModelos = h("button", { type: "button", class: "bt-icone so-largo", "aria-label": "Enviar modelo aprovado", title: "Modelos aprovados", "data-modelos": "" }, A.icone("modelo"));
  const btNota = h("button", { type: "button", class: "bt-icone", "aria-label": "Nota interna", title: "Nota interna (a equipe vê, o cliente não)", "aria-pressed": "false" }, ui.icone("nota"));
  const btIA = h("button", { type: "button", class: "bt-icone so-largo", "aria-label": "Sugerir resposta com IA", title: "Sugerir com IA" }, ui.icone("ia"));
  // CA-060: quem cuida das respostas rápidas (supervisor+) também tem o «Mais» no computador: «Salvar como resposta rápida»
  const supervisor = !!(A.acoes.pode && A.acoes.pode("supervisor"));
  const btMaisM = h("button", { type: "button", class: ["bt-icone", supervisor ? "cvx-mais-sup" : "so-estreito"], "aria-label": "Mais opções", title: "Mais" }, ui.icone("mais"));
  // CA-067: no computador, um seletor curto de emoji (no celular o teclado já tem)
  const btEmoji = h("button", { type: "button", class: "bt-icone so-largo cvx-emoji-bt", "aria-label": "Inserir emoji", title: dicaEmojiSistema(), "aria-haspopup": "dialog", hidden: L.aparelhoDeToque() }, h("span", { class: "cvx-emoji-ic", "aria-hidden": "true" }, "😊"));
  // plano 50 · 36: o menu de respostas rápidas também abre por botão (no celular a «/» fica escondida no teclado)
  const btRR = h("button", { type: "button", class: "bt-icone cvx-rr-bt", "aria-label": "Respostas rápidas (/)", title: "Respostas rápidas: digite / ou toque aqui", "aria-expanded": "false", "aria-controls": "cvx-rr" }, ui.icone("raio"));
  const btEnviar = h("button", { type: "button", class: "bt bt-prim cvx-enviar", "aria-label": "Enviar", title: "Enviar (botão direito ou toque longo: Enviar e resolver)" /* plano 1500c · CC-067 */ }, ui.icone("enviar"));
  const btInfo = h("button", { type: "button", class: "bt-icone cvx-info", "aria-label": "Por que não dá para gravar áudio?", "aria-expanded": "false", title: "Por que não dá para gravar áudio?", hidden: true }, ui.icone("info"));
  const ferr = h("div", { class: "cvx-ferr" }, btClipe, btInfo, btAudio, btRR, btEmoji, btModelos, btNota, btIA, btMaisM);
  const linha = h("div", { class: "cvx-linha" }, ferr, campo, btEnviar);
  const capInfo = h("p", { class: "cvx-cap-info", id: "cvx-cap-info", role: "status", "aria-live": "polite", hidden: true });
  let infoAberta = false, infoTimer = null;   // o aviso (navegador que não grava áudio) só aparece quando a pessoa toca no ⓘ (não ocupa a conversa o tempo todo)
  const tempoGravacao = h("span", { class: "cvx-rec-tempo", role: "timer", "aria-live": "off" }, "00:00");
  const btCancelarGravacao = h("button", { type: "button", class: "bt bt-fant bt-p" }, "Cancelar");
  // CA-030: barrinha do nível do microfone e o aviso de silêncio (microfone errado ou mudo)
  const nivelMic = h("span", { class: "cvx-rec-nivel", "aria-hidden": "true" }, h("i", null));
  // plano 2000d · DC-107: role=status (não alert) e com histerese no timer — o leitor de tela não repete o aviso a cada oscilação
  const avisoMudo = h("span", { class: "cvx-rec-mudo", role: "status", hidden: true }, "Não estamos ouvindo nada — confira o microfone.");
  const avisoFimGravacao = h("span", { class: "cvx-rec-fim", hidden: true }, "");
  const pintarNivel = n => { try { nivelMic.style.setProperty("--nivel", Number(n).toFixed(2)); } catch { /* sem estilo: só a barrinha não anda */ } };
  // plano 1500c · CC-095: pausar e continuar a gravação (interrupção no balcão não obriga a regravar); o relógio para junto
  const rotGravando = h("span", { class: "cvx-rec-rot" }, "Gravando");
  const rotPausar = h("span", null, "Pausar");
  const btPausarGravacao = h("button", { type: "button", class: "bt bt-fant bt-p cvx-rec-pausa", "aria-pressed": "false", hidden: true }, ui.icone("pausa"), rotPausar);
  // plano 2000d · DC-136: «Enviar» manda o áudio direto (sem o modal); «Ouvir antes» (o microfone) abre a revisão de sempre
  const btEnviarGravacao = h("button", { type: "button", class: "bt bt-prim bt-p cvx-rec-enviar", "aria-keyshortcuts": "Enter" }, ui.icone("enviar"), "Enviar");
  const btRevisarGravacao = h("button", { type: "button", class: "bt bt-fant bt-p cvx-rec-revisar", "aria-keyshortcuts": "Shift+Enter" }, "Ouvir antes");
  btCancelarGravacao.setAttribute("aria-keyshortcuts", "Escape");   // plano 2000d · DC-135
  btPausarGravacao.setAttribute("aria-keyshortcuts", "P");
  // plano 2000d · DC-253: perto dos 5 min, «Continuar em outro áudio» manda este e já começa o próximo
  const btContinuarGravacao = h("button", { type: "button", class: "link cvx-rec-continuar", hidden: true }, "Continuar em outro áudio");
  const painelGravacao = h("div", { class: "cvx-gravacao", role: "group", "aria-label": "Gravação de áudio", tabindex: "-1", hidden: true },
    h("span", { class: "cvx-rec-ponto", "aria-hidden": "true" }), rotGravando, tempoGravacao, nivelMic, btPausarGravacao, btCancelarGravacao, btRevisarGravacao, btEnviarGravacao, avisoMudo, avisoFimGravacao, btContinuarGravacao);
  // plano 2000d · DC-091/DC-092: o áudio gravado que não pôde sair (sem internet, conversa resolvida, janela fechada) fica guardado aqui
  const audioGuardadoTxt = h("span", null, "");
  const btAudioGuardadoEnviar = h("button", { type: "button", class: "bt bt-prim bt-p cvx-ag-enviar" }, "Enviar agora");
  const btAudioGuardadoBaixar = h("button", { type: "button", class: "bt bt-fant bt-p cvx-ag-baixar" }, A.icone("baixar"), "Baixar");
  const btAudioGuardadoDescartar = h("button", { type: "button", class: "bt bt-fant bt-p cvx-ag-descartar" }, "Descartar");
  const faixaAudioGuardado = h("div", { class: "cvx-audio-guardado", role: "status", hidden: true }, ui.icone("microfone"), audioGuardadoTxt,
    h("div", { class: "linha cvx-ag-bts" }, btAudioGuardadoEnviar, btAudioGuardadoBaixar, btAudioGuardadoDescartar));
  const resp = h("div", { class: "cvx-resp", hidden: true });
  const seloRasc = h("div", { class: "cvx-rasc-selo" });       // "Rascunho restaurado · descartar" (o ctx.rascunho põe o selo aqui)
  let rasc = null;                                               // rascunho do campo ligado a esta conversa (ctx.rascunho.ligar)
  let idDoCampo = null;                                          // de QUAL conversa é o texto que está no campo (A.selId muda antes de a conversa nova carregar)
  const trava = h("div", { class: "cvx-trava", id: "cvx-trava", hidden: true });   // plano 1000b · CB-139: id para o aria-describedby do Enviar
  // plano 1000 · CA-074: a janela de 24 h fecha em menos de 30 min — a hora aparece no próprio campo (a pílula lá em cima passa despercebida)
  const avisoJanelaTxt = h("span", null, "");
  const avisoJanela = h("p", { class: "cvx-janela-aviso", role: "status", hidden: true }, ui.icone("relogio"), avisoJanelaTxt);
  // plano 1000b · CB-043: o número da conversa caiu — o aviso fica em cima do campo (a pílula do cabeçalho passa despercebida); o envio continua
  const avisoCaidoTxt = h("span", null, "");
  const avisoCaido = h("p", { class: "cvx-janela-aviso cvx-caido-aviso", role: "status", hidden: true }, ui.icone("alerta"), avisoCaidoTxt);
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
  // plano 2000d · DC-108: «Ana acabou de responder (14:02): revise antes de enviar · Ver» — o 1º Enter só fecha o aviso
  const avisoColegaTxt = h("span", null, "");
  const btVerColega = h("button", { type: "button", class: "link cvx-colega-ver" }, "Ver");
  const btFecharColega = h("button", { type: "button", class: "bt-icone cvx-colega-x", "aria-label": "Fechar o aviso" }, ui.icone("fechar"));
  const faixaColega = h("p", { class: "cvx-janela-aviso cvx-colega", role: "alert", hidden: true }, ui.icone("alerta"), avisoColegaTxt, btVerColega, btFecharColega);
  let avisoColega = null;   // { conversa, id, pendente }
  // plano 2000d · DC-114: a IA atendendo no CodeWords
  const btPausarIA = h("button", { type: "button", class: "bt bt-fant bt-p cvx-ia-pausar" }, "Pausar IA e escrever");
  const faixaIA = h("p", { class: "cvx-janela-aviso cvx-ia-ativa", role: "status", hidden: true }, ui.icone("ia"), h("span", null, "A IA está atendendo esta conversa: se você escrever, o cliente pode receber as duas respostas."), btPausarIA);
  let perguntouIA = null;
  const el = h("div", { class: "cvx", hidden: true, dataset: { modo: "texto" } }, rr, rrStatus, resp, iaTrab, trava, avisoJanela, avisoCaido, faixaColega, faixaIA, capInfo, painelGravacao, faixaAudioGuardado, seloRasc, linha, dica, arquivo);

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
    // plano 1000b · CB-019: a trava só é refeita quando muda (situação + texto); o relógio de 60 s e o recarregarVer não tiram mais o
    // foco de quem está no «Reabrir» / «Desbloquear»
    const assinTrava = [s, modoNota ? 1 : 0, s === "resolvida" ? textoResolvida(c) : "", s === "bloqueado" ? String(!!A.acoes.pode("supervisor")) : "",
      s === "janela" ? String(!!(c && c.ultima_entrada_em)) : "", s === "sem_token" ? String(!!A.acoes.pode("admin")) : ""].join("|");
    const refazer = trava.dataset.assin !== assinTrava;
    if (refazer) { ui.limpar(trava); trava.dataset.assin = assinTrava; }
    trava.hidden = true;
    linha.hidden = false;
    dica.hidden = false;
    if (s === "leitura") {
      trava.hidden = false; linha.hidden = true; dica.hidden = true;
      if (refazer) trava.append(ui.icone("cadeado"), h("p", null, "Seu acesso é só de leitura. Você acompanha as conversas, mas não responde."));
    } else if (s === "resolvida") {
      trava.hidden = false; linha.hidden = !modoNota; dica.hidden = true;
      if (refazer) {
        // plano 1500c · CC-141: «Reabrir e responder» — reabre e já põe o cursor no campo
        const b = h("button", { type: "button", class: "bt bt-prim bt-p", dataset: { acao: "reabrir" } }, A.icone("reabrir"), "Reabrir e responder");
        b.addEventListener("click", async () => {
          try { await A.acoes.status("aberta", b); } catch { return; }
          setTimeout(() => { if (el.isConnected && podeTexto()) { try { ta.focus(); } catch { /* ok */ } } }, 0);
        });
        trava.append(ui.icone("check"), h("p", null, textoResolvida(c)), b,
          h("button", { type: "button", class: "bt bt-fant bt-p", on: { click: () => alternarNota(true) } }, ui.icone("nota"), "Nota interna"));
      }
    } else if (s === "bloqueado") {
      // D14: nada sai para contato bloqueado — quem pode desbloqueia aqui mesmo; a nota interna continua valendo
      trava.hidden = false; linha.hidden = !modoNota; dica.hidden = true;
      const sup = A.acoes.pode("supervisor");
      const bDesb = sup ? h("button", { type: "button", class: "bt bt-sec bt-p cvx-desbloquear", on: { click: () => A.acoes.ocultar(false) } }, ui.icone("check"), "Desbloquear") : null;
      if (refazer) trava.append(...[ui.icone("cadeado"), h("p", null, sup ? "Este contato está bloqueado: nada é enviado para ele. Desbloqueie para responder."
        : "Este contato está bloqueado: nada é enviado para ele. Peça a um supervisor para desbloquear (menu ⋮ da conversa)."), bDesb,
        h("button", { type: "button", class: "bt bt-fant bt-p", on: { click: () => alternarNota(true) } }, ui.icone("nota"), "Nota interna")].filter(Boolean));
    } else if (s === "sem_canal") {
      trava.hidden = false; dica.hidden = true;
      if (refazer) trava.append(ui.icone("alerta"), h("p", null, "O número deste atendimento foi removido. Comece uma nova conversa por outro número."),
        h("button", { type: "button", class: "bt bt-sec bt-p", on: { click: () => A.acoes.novaConversa({ contato: contato() }) } }, "Nova conversa"));
    } else if (s === "janela" && !modoNota) {
      trava.hidden = false;
      // (só chega aqui em canal da Meta: no CodeWords não existe janela — ver situacao())
      const b = h("button", { type: "button", class: "bt bt-prim bt-p", "data-modelos": "" }, A.icone("modelo"), "Modelos");
      b.addEventListener("click", () => abrirModelos());
      // CA-089: sem «janela» nem «modelo» soltos — o que aconteceu e o que dá para fazer
      if (refazer) trava.append(ui.icone("relogio"), h("p", null, c && c.ultima_entrada_em ? L.JANELA_FECHADA_LONGO : L.JANELA_NUNCA_LONGO), b);
    } else if (s === "sem_token" && !modoNota) {
      trava.hidden = false;
      // plano 1000b · CB-117: só o admin configura o token — atendente e supervisor são mandados ao administrador
      if (refazer) trava.append(...[ui.icone("alerta"), h("p", null, A.acoes.pode("admin") ? "Este número ainda não tem o token da Meta. Configure em Números de WhatsApp."
        : "Este número ainda não tem o token da Meta. Peça ao administrador para salvar o token deste número."),
        A.acoes.pode("admin") ? h("a", { class: "bt bt-sec bt-p", href: "#/config/numeros" }, "Números de WhatsApp") : null].filter(Boolean));
    }
    const ok = podeTexto();
    ta.disabled = !ok;
    const estreito = matchMedia("(max-width: 760px)").matches;
    ta.placeholder = modoNota ? (estreito ? "Nota para a equipe" : "Escreva uma nota para a equipe (o cliente não vê)")
      // plano 1000b · CB-106: conversa em que o cliente nunca escreveu não «passou 24 h» — o mesmo critério da trava (JANELA_NUNCA_LONGO)
      : s === "janela" ? (c && c.ultima_entrada_em ? "Passaram 24 h: só mensagem aprovada (modelo)" : "Para começar, só mensagem aprovada (modelo)")
      : "Mensagem";   // CC-123
    // CA-074: a janela fecha em menos de 30 min — a hora no próprio campo
    const avisoJ = s === "ok" && !modoNota && c && L.canalTemJanela(provedorCanal()) ? L.avisoJanelaFechando(L.janela(c)) : "";
    avisoJanela.hidden = !avisoJ;
    if (avisoJanelaTxt.textContent !== avisoJ) avisoJanelaTxt.textContent = avisoJ;
    // plano 1000b · CB-043: número desconectado (A.acoes.canalCaido) — «a mensagem espera até reconectar»; nota interna não depende do número
    const caido = !modoNota && c && c.canal_id && (s === "ok" || s === "janela") && typeof A.acoes.canalCaido === "function" ? A.acoes.canalCaido(c.canal_id) : null;
    const avisoC = caido ? `O número ${caido.nome || "desta conversa"} está desconectado: a mensagem espera até reconectar.` : "";
    avisoCaido.hidden = !avisoC;
    if (avisoCaidoTxt.textContent !== avisoC) avisoCaidoTxt.textContent = avisoC;
    // plano 2000d · DC-114: a IA está atendendo (CodeWords) — a faixa diz que as duas responderiam e oferece pausar
    faixaIA.hidden = !(s === "ok" && !modoNota && iaAtiva());
    // plano 2000d · DC-108: o aviso de colega some quando o campo esvazia ou a conversa troca
    if (avisoColega && (avisoColega.conversa !== (c && c.id) || modoNota)) esconderAvisoColega();
    if (citaPendente) restaurarCita();   // DC-113: as mensagens chegaram depois do rascunho
    // CA-077: assinatura ligada — o prefixo que o cliente vai ver
    const pref = !modoNota && s === "ok" && A.base && A.base.cfg && A.base.cfg.assinatura ? L.prefixoAssinatura((A.eu && A.eu.nome) || "") : "";
    rotAssin.hidden = !pref;
    if (pref && rotAssin.dataset.pref !== pref) { ui.limpar(rotAssin); rotAssin.append("Sai como: ", h("b", { class: "mono" }, pref), " …"); rotAssin.dataset.pref = pref; }
    btEnviar.disabled = !ok;
    // plano 1000b · CB-139: desligado com a trava à vista, o leitor de tela ouve o motivo (aria-describedby → texto da trava)
    if (!ok && !trava.hidden) btEnviar.setAttribute("aria-describedby", "cvx-trava"); else btEnviar.removeAttribute("aria-describedby");
    btEnviar.setAttribute("aria-label", modoNota ? "Salvar nota" : "Enviar");
    // plano 1500c · CX-067: a dica do «Enviar e resolver» (CC-067) não some no primeiro redesenho do campo
    btEnviar.title = modoNota ? "Salvar nota (só a equipe vê)" : "Enviar (botão direito ou toque longo: Enviar e resolver)";
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
    // plano 1500c · CC-307: quantas sugestões restam no mês (e «quase no fim» a partir de 90%)
    const cotaTxt = L.textoCotaIA(A.base && A.base.ia && A.base.ia.cota);
    btIA.title = iaEst === "cota" ? "A cota de IA do mês acabou" : cotaTxt ? `Sugerir com IA · ${cotaTxt}` : "Sugerir com IA";
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
    // plano 2000d · DC-110: o selo diz quantas mensagens a conversa teve DEPOIS do rascunho (um colega pode já ter respondido)
    const idR = idDoCampo;
    rasc = r.ligar(ta, `conversa:${idDoCampo}${modoNota ? ":nota" : ""}`, { seloEm: seloRasc,
      depoisDe: em => (A.selId === idR ? (A.msgs || []).filter(m => m && m.tipo !== "nota" && (Date.parse(m.criado_em || "") || 0) > em).length : 0),
      aoGrande: () => ui.toast("O texto ficou grande demais para guardar como rascunho neste aparelho: o último rascunho guardado continua valendo.", { tipo: "info", ms: 8000 }) });   // DC-218
    if (rasc && rasc.restaurado) { autoAltura(); A.acoes.rascunhoMudou(); }
    // plano 2000d · DC-112: há rascunho de mensagem E de nota — o selo oferece abrir a nota (antes ela ficava escondida até vencer)
    if (!modoNota && idDoCampo && A.podeEscrever && guardadoEm(`conversa:${idDoCampo}:nota`) && String(ta.value || "").trim()) {
      seloRasc.appendChild(h("p", { class: "rascunho-selo cvx-nota-guardada", role: "status" }, "Também há uma nota interna guardada · ",
        h("button", { type: "button", class: "link", on: { click: () => abrirNotaGuardada() } }, "abrir")));
    }
    // plano 2000d · DC-113: a citação («Respondendo a…») guardada volta junto com o texto
    citaPendente = null;
    if (!modoNota && idDoCampo && String(ta.value || "").trim()) {
      const cid = guardadoEm(`conversa:${idDoCampo}:cita`);
      if (cid) { citaPendente = { conversa: idDoCampo, id: cid }; restaurarCita(); }
    }
  }
  /** DC-112: guarda o texto da mensagem e abre a nota guardada (a mensagem continua no rascunho dela). */
  function abrirNotaGuardada() {
    if (!idDoCampo) return;
    A.rascunhos.set(idDoCampo, ta.value);
    desligarRascunho();                         // grava o texto da mensagem na chave dela
    modoNota = true;
    ta.value = "";
    ligarRascunho();                            // o campo vazio recebe a nota guardada
    atualizar();
    try { ta.focus(); } catch { /* ok */ }
  }
  /* plano 2000d · DC-113: citação guardada ao lado do rascunho */
  let citaPendente = null;
  function guardarCita() {
    const r = A.ctx && A.ctx.rascunho;
    if (!r || !idDoCampo || modoNota) return;
    try {
      if (respondendo && respondendo.id && typeof r.guardar === "function") r.guardar(`conversa:${idDoCampo}:cita`, String(respondendo.id));
      else r.apagar(`conversa:${idDoCampo}:cita`);
    } catch { /* ok */ }
  }
  function restaurarCita() {
    const p = citaPendente;
    if (!p || respondendo || p.conversa !== idDoCampo || modoNota) return;
    const m = (A.msgs || []).find(x => x && String(x.id) === String(p.id));
    if (!m) return;
    citaPendente = null;
    respondendo = m;
    desenharResposta();
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
    if (modoNota !== antes && rasc) {            // o texto digitado acompanha a pessoa para o outro modo: o rascunho novo nasce e o antigo sai
      // plano 2000d · DC-206: grava o novo ANTES de apagar o antigo — com o storage falhando, o texto continua guardado na chave antiga
      const velho = rasc, chaveVelha = `conversa:${idDoCampo}${antes ? ":nota" : ""}`;
      try { if (typeof velho.parar === "function") velho.parar(); else velho.desligar(); } catch { /* ok */ }
      rasc = null;
      ligarRascunho();
      const gravou = !ta.value.trim() || !rasc || rasc.salvarAgora() !== false;
      if (gravou) { try { A.ctx.rascunho.apagar(chaveVelha); } catch { /* ok */ } }
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
    // plano 1000b · CB-010: «Respondendo a Mariana» / «à sua mensagem» / «à IA» / «a Ana» (antes «Respondendo Você» para tudo que saiu)
    const rot = L.rotuloRespondendo(respondendo, { nomeContato: A.acoes.nomeContato(contato()), euId: A.eu && A.eu.id });
    resp.append(A.icone("responder"), h("div", null, h("b", null, rot), L.resumoMensagem(respondendo, 120)),
      h("button", { type: "button", class: "bt-icone", "aria-label": "Cancelar resposta", on: { click: () => { respondendo = null; desenharResposta(); guardarCita(); ta.focus(); } } }, ui.icone("fechar")));
  }
  /** plano 1000b · CB-011: por que não dá para responder citando — a janela só quando é a janela. */
  function motivoSemResposta(sit) {
    switch (sit) {
      case "resolvida": return "Este atendimento está resolvido. Reabra para responder citando.";
      case "bloqueado": return "Este contato está bloqueado. Desbloqueie para responder.";
      case "sem_token": return "Este número ainda não tem o token da Meta. Configure em Números de WhatsApp para responder.";
      case "sem_canal": return "O número deste atendimento foi removido. Comece uma nova conversa por outro número.";
      case "leitura": return "Seu acesso é só de leitura: dá para acompanhar, mas não responder.";
      case "janela": return "Para responder citando, a janela de 24 h precisa estar aberta.";
      default: return "Não dá para responder esta conversa agora.";
    }
  }
  function responder(m) {
    const sit = situacao();
    if (!m || sit !== "ok") { if (sit !== "ok") ui.toast(motivoSemResposta(sit), { tipo: "info" }); return; }
    if (modoNota) alternarNota(false);
    respondendo = m;
    citaPendente = null;
    desenharResposta();
    guardarCita();   // plano 2000d · DC-113
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
  let rrTermo = "";   // plano 1000b · CB-132: o termo da lista aberta (para refazê-la quando a base chegar)
  function abrirRR(termo) {
    rrTermo = termo;
    const dep = conv() && conv().departamento_id;
    const todas = L.filtrarRespostas((A.base && A.base.respostas) || [], termo, { departamento: dep, max: Infinity });
    rrTotal = todas.length;
    rrItens = todas.slice(0, RR_MAX);
    rrSel = 0;
    const abrindo = !rrAberto;
    rrAberto = true;
    desenharRR(termo);
    // plano 1000b · CB-132: ao abrir o «/», base com mais de 60 s é relida em segundo plano e a lista aberta se refaz
    const fresca = abrindo && A.acoes.baseFresca ? A.acoes.baseFresca(60000) : null;
    if (fresca) fresca.then(() => { if (rrAberto) abrirRR(rrTermo); }).catch(() => {});
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
    const estavaAberto = rrAberto;   // plano 1000b · CB-118: trocar de conversa (ou de nota) não anuncia o fechamento de um menu que nem abriu
    rrAberto = false; rrItens = [];
    rr.hidden = true; ui.limpar(rr);
    btRR.setAttribute("aria-expanded", "false");
    if (estavaAberto) rrStatus.textContent = "Respostas rápidas fechadas.";
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
      // plano 1500c · CX-032: PageUp/PageDown pulam 5 respostas; Ctrl+Home/Ctrl+End vão à primeira/última (Home/End puros continuam no texto)
      if (rrItens.length && (ev.key === "PageDown" || ev.key === "PageUp" || ((ev.ctrlKey || ev.metaKey) && (ev.key === "Home" || ev.key === "End")))) {
        ev.preventDefault();
        const ult = rrItens.length - 1;
        rrSel = ev.key === "PageDown" ? Math.min(ult, rrSel + 5) : ev.key === "PageUp" ? Math.max(0, rrSel - 5) : ev.key === "Home" ? 0 : ult;
        marcarRR(true);
        return;
      }
    }
    if (ev.key === "Tab" && !ev.isComposing && pularCampo(ev)) return;       // {campo} selecionado: Tab vai para o próximo campo da resposta rápida
    if (ev.key === "Escape" && respondendo) { ev.preventDefault(); respondendo = null; desenharResposta(); return; }
    // M35: Esc no campo devolve o foco à lista (o rascunho já está guardado); j/k, / e ? passam a valer fora do campo
    if (ev.key === "Escape" && !ev.isComposing) { ev.preventDefault(); A.acoes.focarLista(); return; }
    // CA-068: com «Ctrl+Enter envia» ligado, Enter só quebra a linha (quem escreve mensagem longa não envia por engano)
    // plano 1000b · CB-042: Ctrl/⌘+Enter SEMPRE envia (iPad com teclado, Chromebook de toque); no toque só o Enter puro fica desligado
    const comMod = ev.ctrlKey || ev.metaKey;
    if (ev.key === "Enter" && !ev.shiftKey && !ev.isComposing && (comMod || !matchMedia("(pointer: coarse)").matches)) {
      if (ctrlEnter() && !comMod) return;
      ev.preventDefault(); enviarDoCampo();
    }
  });
  btEnviar.addEventListener("click", () => enviarDoCampo());

  /* ---------------- plano 2000d · DC-108: colega (ou a IA) respondeu enquanto eu escrevia */
  let campoDesde = 0;   // quando o campo ganhou texto (ms)
  ta.addEventListener("input", () => {
    if (String(ta.value || "").trim()) { if (!campoDesde) campoDesde = Date.now(); }
    else { campoDesde = 0; if (avisoColega) esconderAvisoColega(); }
  });
  function esconderAvisoColega() { avisoColega = null; faixaColega.hidden = true; }
  btFecharColega.addEventListener("click", () => { esconderAvisoColega(); try { ta.focus(); } catch { /* ok */ } });
  btVerColega.addEventListener("click", () => { const a = avisoColega; if (a && A.chat && typeof A.chat.irPara === "function") A.chat.irPara(a.id); else if (a && A.acoes.irParaMensagem) A.acoes.irParaMensagem(a.id); if (a) a.pendente = false; });
  /** conversas.js chama com as mensagens que o delta trouxe. */
  function colegaRespondeu(itens = []) {
    const c = conv();
    if (!c || modoNota || !campoDesde || !String(ta.value || "").trim() || idDoCampo !== c.id) return;
    const eu = A.eu && A.eu.id;
    const m = (itens || []).filter(x => x && x.direcao === "out" && x.tipo !== "nota" && (x.conversa_id === undefined || x.conversa_id === c.id)
      && ((x.enviado_por && x.enviado_por.id && x.enviado_por.id !== eu) || (!x.enviado_por && x.origem === "ia"))
      && (Date.parse(x.criado_em || "") || Date.now()) >= campoDesde - 2000).at(-1);
    if (!m) return;
    const quem = m.enviado_por && m.enviado_por.nome ? L.primeiroNome(m.enviado_por.nome) || m.enviado_por.nome : "A IA";
    avisoColega = { conversa: c.id, id: m.id, pendente: true };
    avisoColegaTxt.textContent = `${quem} acabou de responder (${L.horaMsg(m.criado_em || new Date().toISOString())}): revise antes de enviar.`;
    faixaColega.hidden = false;
  }
  /** plano 2000d · DC-114: a IA está ligada e atendendo esta conversa do CodeWords. */
  function iaAtiva() {
    const ia = usaCodeWords() ? A.iaEstado : null;
    return !!(ia && ia.disponivel !== false && ia.ia_ligada && !ia.pausada);
  }
  btPausarIA.addEventListener("click", async () => { if (A.acoes.assumirIA) await A.acoes.assumirIA(btPausarIA); atualizar(); try { ta.focus(); } catch { /* ok */ } });

  async function enviarDoCampo() {
    const texto = ta.value.trim();
    if (!texto || !podeTexto()) return;
    // o texto do campo é de uma conversa só: enquanto a aberta não for ela (troca em andamento), Enter não manda nada para ninguém
    if (!idDoCampo || idDoCampo !== A.selId || !conv() || conv().id !== idDoCampo) return;
    // plano 2000d · DC-108: o 1º Enter depois do aviso «Ana acabou de responder» só fecha o aviso (a pessoa revisa)
    if (!modoNota && avisoColega && avisoColega.pendente && avisoColega.conversa === idDoCampo) {
      avisoColega.pendente = false;
      faixaColega.hidden = true;
      ui.anunciar("Aviso fechado. Revise e envie de novo se ainda fizer sentido.");
      return;
    }
    // plano 2000d · DC-114: a IA está atendendo — na 1ª mensagem pergunta (Pausar e enviar · Enviar mesmo assim)
    if (!modoNota && iaAtiva() && perguntouIA !== idDoCampo) {
      const id0 = idDoCampo;
      const r = await ui.modal({ titulo: "A IA está atendendo esta conversa", largura: "p",
        corpo: h("p", null, "Se você enviar agora, o cliente pode receber a sua resposta e a da IA."),
        acoes: [{ rotulo: "Cancelar", tipo: "neutro" }, { rotulo: "Enviar mesmo assim", tipo: "neutro", valor: "enviar" }, { rotulo: "Pausar a IA e enviar", tipo: "primario", valor: "pausar" }] });
      if (!r || !mesmaConversa(id0)) return;
      perguntouIA = id0;
      if (r === "pausar" && A.acoes.assumirIA) await A.acoes.assumirIA();
      if (!mesmaConversa(id0) || ta.value.trim() !== texto) return;
    }
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
    respondendo = null; desenharResposta(); guardarCita();   // DC-113: a citação guardada sai junto
    A.rascunhos.delete(idDoCampo);
    A.acoes.rascunhoMudou();
    ta.focus();
    const r = await A.acoes.enviar({ tipo: "texto", texto, respondeA: citada });
    if (r && r.persistido !== false) apagarRascunho();      // a mensagem está na fila (IndexedDB): o rascunho cumpriu o papel
    return !!r;   // plano 1500c · CC-067: o «Enviar e resolver» só resolve o que saiu
  }
  /** plano 1500c · CC-067: «Enviar e resolver» — botão direito (ou toque longo) no Enviar; envia e encadeia o Resolver (com Desfazer). */
  async function enviarEResolver() {
    if (modoNota || !ta.value.trim() || !podeTexto()) return;
    const id = idDoCampo;
    const ok = await enviarDoCampo();
    if (ok && mesmaConversa(id) && typeof A.acoes.resolver === "function") A.acoes.resolver();
  }
  btEnviar.addEventListener("contextmenu", ev => {
    if (modoNota || !ta.value.trim() || !podeTexto()) return;
    ev.preventDefault();
    ui.menu(btEnviar, [{ rotulo: "Enviar e resolver", icone: "check", fn: () => enviarEResolver() }]);
  });
  // plano 2000d · DC-099: o Safari do iPhone não dispara contextmenu no toque longo de botão — o toque longo abre o mesmo menu
  if (typeof ui.toqueLongo === "function") ui.toqueLongo(btEnviar, () => {
    if (modoNota || !ta.value.trim() || !podeTexto()) return;
    ui.menu(btEnviar, [{ rotulo: "Enviar e resolver", icone: "check", fn: () => enviarEResolver() }]);
  });

  /* ---------------- anexos */
  /** Anexo e gravação valem nos dois canais (Meta e CodeWords). No CodeWords a situação nunca é "janela" nem "sem_token" (ver situacao()). */
  function aceitaAnexo() { return !modoNota && situacao() === "ok"; }
  /** plano 1000b · CB-040/CB-006: por que o anexo não vale agora (o mesmo texto no clipe, no colar, no arrastar e no soltar). "" = vale. */
  function motivoSemAnexo() {
    if (modoNota && conv()) return "Nota interna não leva anexo: saia do modo nota para anexar.";
    const s = situacao();
    return s === "ok" ? ""
      : s === "sem" ? "Abra uma conversa para anexar."
      : s === "leitura" ? "Seu acesso é só de leitura: não dá para anexar."
      : s === "resolvida" ? "Atendimento resolvido: reabra para anexar."
      : s === "bloqueado" ? "Contato bloqueado: nada é enviado para ele."
      : s === "sem_canal" ? "O número deste atendimento foi removido: comece uma nova conversa."
      : s === "janela" ? "Fora da janela de 24 h só vale modelo aprovado."
      : s === "sem_token" ? "Este número ainda não tem o token da Meta."
      : "Não dá para anexar agora.";
  }
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
  // plano 2000d · DC-124: «Câmera» no «+» do celular — abre a câmera de trás direto e a foto entra no mesmo anexar()
  const camera = h("input", { type: "file", hidden: true, accept: "image/*", capture: "environment", class: "cvx-camera" });
  el.appendChild(camera);
  camera.addEventListener("change", () => { const f = camera.files && camera.files[0]; if (f) anexar(f); });
  function abrirCamera() { if (!aceitaAnexo()) { const m = motivoSemAnexo(); if (m) ui.toast(m, { tipo: "info" }); return; } camera.value = ""; camera.click(); }
  btAudio.addEventListener("click", () => gravacao ? pararGravacao(false) : iniciarGravacao());
  btCancelarGravacao.addEventListener("click", () => pararGravacao(true));
  // plano 2000d · DC-136: «Enviar» no painel manda direto; «Ouvir antes» abre a revisão
  btEnviarGravacao.addEventListener("click", () => { if (gravacao) { gravacao.enviarDireto = true; pararGravacao(false); } });
  btRevisarGravacao.addEventListener("click", () => pararGravacao(false));
  btContinuarGravacao.addEventListener("click", () => { if (gravacao) { gravacao.enviarDireto = true; gravacao.continuar = true; pararGravacao(false); } });
  // plano 2000d · DC-135: teclado no painel — Enter envia, Shift+Enter para e revisa, Esc cancela (com mais de 10 s pede confirmação), P pausa
  painelGravacao.addEventListener("keydown", async ev => {
    if (!gravacao) return;
    const alvo = ev.target;
    const emBotao = alvo && alvo.tagName === "BUTTON" && alvo !== painelGravacao;
    if (ev.key === "Escape") {
      ev.preventDefault(); ev.stopPropagation();
      const atual = gravacao;
      const seg = (Date.now() - atual.inicio) / 1000;
      if (seg > 10 && !(await ui.confirmar({ titulo: "Cancelar a gravação?", texto: `O áudio de ${tempoGravacaoTexto(seg)} será descartado.`, rotulo: "Descartar áudio", perigo: true }))) return;
      if (gravacao === atual) pararGravacao(true);
    } else if (ev.key === "Enter" && !emBotao) {
      ev.preventDefault();
      if (ev.shiftKey) pararGravacao(false); else { gravacao.enviarDireto = true; pararGravacao(false); }
    } else if ((ev.key === "p" || ev.key === "P") && !ev.ctrlKey && !ev.metaKey && !ev.altKey) {
      ev.preventDefault();
      if (!btPausarGravacao.hidden) btPausarGravacao.click();
    }
  });

  /* ---------------- plano 2000d · DC-091/DC-092: áudio gravado guardado (sem internet, conversa resolvida ou janela fechada) */
  let audioGuardado = null;   // { arquivo, gravadoS, conversa, para, client_ref, enviando }
  function guardarAudio(arquivoAudio, gravadoS, idConv, motivo) {
    audioGuardado = { arquivo: arquivoAudio, gravadoS, conversa: idConv, para: nomeDestino(), client_ref: L.novoClientRef(), enviando: false };
    pintarAudioGuardado(motivo);
    ui.anunciar(`Áudio gravado guardado: ${motivo}`);
  }
  function pintarAudioGuardado(motivo) {
    const g = audioGuardado;
    faixaAudioGuardado.hidden = !g;
    if (!g) return;
    const dur = L.formatarDuracao(g.gravadoS || 0);
    audioGuardadoTxt.textContent = motivo ? `Áudio gravado (${dur}) para ${g.para}: ${motivo}` : `Áudio gravado (${dur}) para ${g.para} espera para sair.`;
    const s = mesmaConversa(g.conversa) ? situacao() : null;
    btAudioGuardadoEnviar.textContent = s === "resolvida" ? "Reabrir e enviar" : "Enviar agora";
  }
  async function enviarAudioGuardado({ automatico = false } = {}) {
    const g = audioGuardado;
    if (!g || g.enviando) return;
    if (A.acoes.offline && A.acoes.offline()) { if (!automatico) ui.toast("Ainda sem internet: o áudio sai sozinho quando a conexão voltar.", { tipo: "info" }); return; }
    if (mesmaConversa(g.conversa) && situacao() === "resolvida" && !automatico) {
      if (A.acoes.status) await A.acoes.status("aberta");
    }
    if (mesmaConversa(g.conversa) && !aceitaAnexo()) { if (!automatico) ui.toast(motivoSemAnexo() || "Esta conversa não aceita áudio agora. Baixe o áudio para não perder.", { tipo: "info", ms: 8000 }); return; }
    const v = L.validarArquivo(g.arquivo, { provedor: provedorCanal() });
    if (!v.ok) { ui.toast("O áudio gravado não vale para este número. Baixe para não perder.", { tipo: "erro" }); return; }
    g.enviando = true;
    try {
      await A.acoes.enviar({ tipo: "midia", conversa: g.conversa, arquivo: g.arquivo, validacao: v, legenda: "", client_ref: g.client_ref, segundoPlano: true, para: g.para });
      if (audioGuardado === g) { audioGuardado = null; pintarAudioGuardado(); }
    } finally { g.enviando = false; }
  }
  btAudioGuardadoEnviar.addEventListener("click", () => enviarAudioGuardado());
  btAudioGuardadoBaixar.addEventListener("click", () => {
    const g = audioGuardado;
    if (!g) return;
    try {
      const url = URL.createObjectURL(g.arquivo);
      const a = h("a", { href: url, download: g.arquivo.name || "audio.ogg", hidden: true });
      document.body.appendChild(a); a.click(); a.remove();
      setTimeout(() => { try { URL.revokeObjectURL(url); } catch { /* ok */ } }, 4000);
    } catch { ui.toast("Este navegador não deixou baixar o áudio.", { tipo: "erro" }); }
  });
  btAudioGuardadoDescartar.addEventListener("click", () => { audioGuardado = null; pintarAudioGuardado(); ui.anunciar("Áudio gravado descartado."); });
  const aoVoltarInternet = () => { if (audioGuardado && el.isConnected) enviarAudioGuardado({ automatico: true }); };
  try { globalThis.addEventListener && globalThis.addEventListener("online", aoVoltarInternet); } catch { /* sem window */ }
  /** Para onde vai o áudio que acabou de ser gravado: direto (Enviar), guardado (não dá para sair agora) ou a revisão de sempre. */
  async function entregarGravado(arquivoAudio, gravadoS, idConv, atual) {
    const offline = !!(A.acoes.offline && A.acoes.offline());
    const mesma = mesmaConversa(idConv);
    if (offline) { guardarAudio(arquivoAudio, gravadoS, idConv, "sem internet — ele sai sozinho quando a conexão voltar."); return; }
    if (!mesma) { guardarAudio(arquivoAudio, gravadoS, idConv, "você trocou de conversa durante a gravação."); return; }
    if (!aceitaAnexo()) {
      const s = situacao();
      guardarAudio(arquivoAudio, gravadoS, idConv, s === "resolvida" ? "o atendimento foi resolvido durante a gravação." : s === "janela" ? "a janela de 24 h fechou durante a gravação." : (motivoSemAnexo() || "a conversa não aceita áudio agora."));
      return;
    }
    if (atual && atual.enviarDireto) {
      const v = L.validarArquivo(arquivoAudio, { provedor: provedorCanal() });
      if (!v.ok) { await anexar(arquivoAudio, { gravadoS }); return; }
      await A.acoes.enviar({ tipo: "midia", conversa: idConv, arquivo: arquivoAudio, validacao: v, legenda: "", client_ref: L.novoClientRef() });
      if (atual.continuar && el.isConnected && mesmaConversa(idConv)) iniciarGravacao();   // DC-253
      return;
    }
    await anexar(arquivoAudio, { gravadoS });
  }

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
      const atual = { rec, fluxo, partes: [], cancelar: false, timer: null, inicio: Date.now(), avisou: false, amostras: [], medidor: null, guarda: null, pausadaEm: 0, pausadaMs: 0 };
      const decorrido = () => (Date.now() - atual.inicio - atual.pausadaMs - (atual.pausadaEm ? Date.now() - atual.pausadaEm : 0)) / 1000;   // CC-095
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
          // plano 1000b · CB-037: criado depois do await do getUserMedia (fora do gesto) ele nasce «suspended» e o analisador devolve zeros
          try { if (actx.state === "suspended" && typeof actx.resume === "function") { const p = actx.resume(); if (p && typeof p.catch === "function") p.catch(() => {}); } } catch { /* ok */ }
        }
      } catch { atual.medidor = null; }
      avisoMudo.hidden = true; avisoFimGravacao.hidden = true; btContinuarGravacao.hidden = true; pintarNivel(0);
      try { if (globalThis.navigator && typeof navigator.vibrate === "function") navigator.vibrate(30); } catch { /* ok */ }   // plano 2000d · DC-252
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
          // a conversa mudou enquanto o áudio era convertido: ele não segue para o cliente aberto — fica guardado para a conversa de origem
          // plano 2000d · DC-091/DC-092/DC-136: entregarGravado decide (direto, guardado ou a revisão)
          await entregarGravado(new File([wav], `audio-orbita-${Date.now()}.wav`, { type: L.MIME_WAV }), decorrido(), idGravacao, atual);   // plano 1000b · CB-142 (1500c · CC-095: sem as pausas)
          return;
        }
        const ext = mime === "audio/mp4" ? "m4a" : "ogg";
        const arquivoAudio = new File([blob], `audio-orbita-${Date.now()}.${ext}`, { type: mime });
        await entregarGravado(arquivoAudio, decorrido(), idGravacao, atual);   // plano 2000d · DC-091/DC-092/DC-136 (1000b · CB-142; 1500c · CC-095)
      }, { once: true });
      rec.start(500);
      painelGravacao.hidden = false;
      tempoGravacao.textContent = "00:00";
      // CC-095: o botão só aparece onde o MediaRecorder sabe pausar
      btPausarGravacao.hidden = !(typeof rec.pause === "function" && typeof rec.resume === "function");
      btPausarGravacao.setAttribute("aria-pressed", "false"); rotPausar.textContent = "Pausar"; rotGravando.textContent = "Gravando";
      btPausarGravacao.onclick = () => {
        if (gravacao !== atual) return;
        try {
          if (!atual.pausadaEm) { rec.pause(); atual.pausadaEm = Date.now(); rotGravando.textContent = "Pausada"; rotPausar.textContent = "Continuar"; btPausarGravacao.setAttribute("aria-pressed", "true"); }
          else { rec.resume(); atual.pausadaMs += Date.now() - atual.pausadaEm; atual.pausadaEm = 0; rotGravando.textContent = "Gravando"; rotPausar.textContent = "Pausar"; btPausarGravacao.setAttribute("aria-pressed", "false"); }
          painelGravacao.dataset.pausada = atual.pausadaEm ? "1" : "0";
        } catch { ui.toast("Este navegador não deixou pausar a gravação.", { tipo: "info" }); }
      };
      atualizar();
      btCancelarGravacao.focus();
      atual.timer = setInterval(() => {
        const segundos = Math.floor(decorrido());   // CC-095: as pausas não contam
        if (atual.pausadaEm) { tempoGravacao.textContent = tempoGravacaoTexto(segundos); avisoMudo.hidden = true; atual.amostras = []; return; }
        tempoGravacao.textContent = tempoGravacaoTexto(segundos);
        // plano 1000b · CB-037: enquanto o áudio não está «running», nada de amostras nem do aviso «Não estamos ouvindo nada»
        if (atual.medidor && atual.medidor.actx.state && atual.medidor.actx.state !== "running") { avisoMudo.hidden = true; atual.amostras = []; }
        else if (atual.medidor) {
          try {
            atual.medidor.an.getFloatTimeDomainData(atual.medidor.buf);
            let soma = 0; for (const x of atual.medidor.buf) soma += x * x;
            const nivel = Math.sqrt(soma / atual.medidor.buf.length);
            const agora = Date.now();
            atual.amostras.push({ t: agora, nivel });
            while (atual.amostras.length && agora - atual.amostras[0].t > 4000) atual.amostras.shift();
            pintarNivel(Math.min(1, nivel * 8));
            atual.mudo = L.histereseMudo(atual.mudo, L.microfoneMudo(atual.amostras), agora);   // plano 2000d · DC-107
            avisoMudo.hidden = !atual.mudo.visivel;
          } catch { /* sem medidor: segue gravando */ }
        }
        // CA-029: até 5 minutos (antes 1); 30 s antes do fim o painel avisa
        if (segundos >= L.GRAVACAO_AVISO_S && !atual.avisou) {
          atual.avisou = true;
          avisoFimGravacao.textContent = `Faltam ${L.GRAVACAO_MAX_S - L.GRAVACAO_AVISO_S} s: a gravação para sozinha em ${L.GRAVACAO_MAX_S / 60} minutos.`;
          avisoFimGravacao.hidden = false;
          btContinuarGravacao.hidden = false;   // plano 2000d · DC-253
        }
        if (segundos >= L.GRAVACAO_MAX_S) {
          pararGravacao(false);
          ui.toast(`Limite de ${L.GRAVACAO_MAX_S / 60} minutos atingido. Revise o áudio antes de enviar.`, { tipo: "info" });
        }
      }, 250);
    } catch (e) {
      if (fluxo) fluxo.getTracks().forEach(t => t.stop());
      gravacao = null;
      painelGravacao.hidden = true;
      atualizar();
      ui.toast(L.textoErroMicrofone(e), { tipo: "erro", ms: 8000 });   // plano 1000b · CB-036: o motivo pelo e.name (permissão, sem microfone, em uso…)
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
      // plano 1500c · CC-048: várias imagens coladas vão pelo fluxo de várias fotos (antes só a 1ª entrava)
      if (soImagens) {
        const fs = arquivos.map((i, n) => { const f = i.getAsFile(); return f ? new File([f], f.name && f.name !== "image.png" ? f.name : `imagem-colada-${Date.now()}-${n + 1}.png`, { type: f.type || i.type }) : null; }).filter(Boolean);
        if (fs.length) { anexarVarios(fs); return; }
      }
      ui.toast(`${arquivos.length} arquivos copiados; somente o primeiro será anexado. Repita a colagem para enviar os demais.`, { tipo: "info" });
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
  // plano 2000d · DC-129/DC-131: progresso do lote de fotos
  const loteTxt = h("span", { class: "cvx-lote-txt" }, "");
  const loteBt = h("button", { type: "button", class: "bt bt-fant bt-p cvx-lote-parar", hidden: true }, "Parar");
  const loteStatus = h("p", { class: "cvx-otim cvx-lote", role: "status", "aria-live": "polite", hidden: true }, loteTxt, loteBt);
  el.insertBefore(loteStatus, linha);
  let loteAcao = null;
  loteBt.addEventListener("click", () => { loteBt.disabled = true; const f = loteAcao; if (f) f(); });

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

  /** plano 1000b · CB-108: a extensão do arquivo recusado («zip»), em minúsculas; "" sem extensão legível. */
  function extensaoDe(f) {
    const m = /\.([a-z0-9]{1,8})$/i.exec(String((f && f.name) || ""));
    return m ? m[1].toLowerCase() : "";
  }
  async function anexar(f, { gravadoS = null } = {}) {
    const gravado = Number.isFinite(Number(gravadoS)) && gravadoS !== null;   // plano 1000b · CB-142: veio do microfone (não do clipe)
    const idInicio = conv() ? conv().id : null;      // o arquivo foi escolhido para ESTA conversa
    if (!aceitaAnexo()) {
      ui.toast(motivoSemAnexo() || "Não dá para anexar agora.", { tipo: "info" });   // plano 1000b · CB-040: o motivo, não só «agora não»
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
        ? `Arquivo grande demais: ${L.tamanhoLegivel(escolhidoInicial.size)} (limite ${v.tipo === "imagem" ? "5 MB para fotos" : "16 MB"}).${v.tipo === "video" ? " Grave mais curto ou mande um link (Drive, Google Fotos)." : ""}`   // plano 1000b · CB-110
        : v.wav ? "Este número não aceita WAV: use MP3, OGG, AAC ou M4A."
        // plano 1500c · CX-005: arquivo vazio (0 byte: download que não terminou, atalho da nuvem) tem o próprio motivo
        : v.erro === "midia_vazia" ? `«${escolhidoInicial.name || "Arquivo"}» está vazio (0 byte). Se ele está na nuvem (Drive, iCloud), baixe para o aparelho antes de anexar.`
        // plano 1500c · CC-028: o .mov do iPhone ganha o caminho para resolver
        : L.ehVideoIphone(escolhidoInicial) ? L.TEXTO_MOV_IPHONE
        // plano 1000b · CB-108: diz QUAL arquivo foi recusado («.zip não é aceito…»)
        : `${extensaoDe(escolhidoInicial) ? `.${extensaoDe(escolhidoInicial)}` : "Este tipo de arquivo"} não é aceito pelo WhatsApp. Use foto (JPG, PNG, WEBP), vídeo MP4, áudio (MP3, OGG, AAC), PDF ou Office.`, { tipo: "erro" });
      return;
    }
    const vOriginal = otim && otim.otimizada ? L.validarArquivo(f) : null;      // "enviar original" só quando o original também cabe (≤ 5 MB)
    let url = null;
    let previa;
    if (v.tipo === "imagem") { url = URL.createObjectURL(escolhidoInicial); previa = h("img", { src: url, alt: "Prévia da foto" }); }
    else if (v.tipo === "video") { url = URL.createObjectURL(f); previa = h("video", { src: url, controls: true, preload: "metadata" }); }
    else if (v.tipo === "audio") { url = URL.createObjectURL(f); previa = h("audio", { src: url, controls: true }); }
    else previa = h("div", { class: "cv-doc" }, h("span", { class: "cv-doc-ic" }, L.siglaArquivo(f.name, L.mimeDe(f))),   // plano 1000b · CB-109
      h("span", { class: "cv-doc-txt" }, h("b", null, f.name), h("small", null, L.tamanhoLegivel(f.size))));
    const leg = h("textarea", { id: "cvx-legenda", rows: 2, maxlength: 1024, placeholder: v.tipo === "audio" ? "Áudio vai sem legenda" : "Legenda (opcional)", disabled: v.tipo === "audio", "aria-describedby": "cvx-legenda-n" });
    // CA-071: a legenda tem 1.024 caracteres — o contador aparece a partir de 900 (como no campo principal)
    // plano 1000b · CB-111: o contador não é região viva (lia a cada tecla depois de 900); um status à parte fala só ao entrar nas faixas
    const legN = h("small", { class: "cvx-legenda-n dado", id: "cvx-legenda-n", hidden: true });
    const legStatus = h("span", { class: "sr-only cvx-legenda-status", role: "status" });
    let legFaixa = 0;
    leg.addEventListener("input", () => {
      const n = String(leg.value || "").length; legN.hidden = n < 900; legN.textContent = L.textoContador(1024 - n);
      const faixa = n >= 1024 ? 3 : n >= 1000 ? 2 : n >= 900 ? 1 : 0;
      if (faixa > legFaixa) legStatus.textContent = faixa === 3 ? "Legenda no limite de 1.024 caracteres." : `Legenda: ${L.textoContador(1024 - n)}.`;
      legFaixa = faixa;
    });
    // CA-243: número da Meta com a janela de 24 h fechando — o aviso vem no próprio modal, antes de a pessoa escrever a legenda
    const jan = !codeWords && conv() ? L.janela(conv()) : null;
    // plano 1000b · CB-120: o mesmo limite de 30 min do campo (CA-074), com a hora em que fecha — a legenda longa não chega tarde
    const avisoJanela = jan && jan.aberta && jan.restanteMs < 30 * 60000
      ? h("p", { class: "aviso aviso-aten cv-aviso-janela", role: "alert" }, ui.icone("relogio"),
        h("span", null, `A janela de 24 h fecha às ${L.horaMsg(jan.ate)} (em ${Math.max(1, Math.ceil(jan.restanteMs / 60000))} min): envie logo, senão só um modelo aprovado vale.`))
      : null;
    const resumo = otim && otim.otimizada ? L.resumoOtimizacao(f.size, otim.arquivo.size) : "";
    const info = h("p", { class: "sub cv-otim-info", role: "status" }, resumo || (gravado ? `Áudio gravado · ${L.formatarDuracao(gravadoS)} · ${L.tamanhoLegivel(f.size)}` : `${f.name} · ${L.tamanhoLegivel(f.size)}`));
    const chkOriginal = vOriginal && vOriginal.ok ? h("input", { type: "checkbox", id: "cvx-original", "data-sem-protecao": "" }) : null;
    if (chkOriginal) chkOriginal.addEventListener("change", () => {
      info.textContent = chkOriginal.checked ? `Vai a foto original (${L.tamanhoLegivel(f.size)}).` : resumo;
    });
    // o aparelho do CodeWords não manda vídeo como vídeo: ele vai pelo envio de arquivo, e a pessoa fica sabendo antes de mandar
    const avisoVideo = codeWords && v.tipo === "video" ? h("p", { class: "sub cv-aviso-canal" }, "Neste número o vídeo chega como arquivo para baixar.") : null;
    const corpo = h("div", { class: "pilha" }, avisoJanela, h("div", { class: "cv-anexo-previa" }, previa), info, avisoVideo,
      chkOriginal ? h("label", { class: "chip-check cv-original", for: "cvx-original" }, chkOriginal, `Enviar a original (${L.tamanhoLegivel(f.size)})`) : null,
      h("div", { class: "campo" }, h("label", { for: "cvx-legenda" }, "Legenda"), leg, legN, legStatus));
    let ok;
    try {
      ok = await ui.modal({ titulo: gravado ? `Enviar áudio gravado (${L.formatarDuracao(gravadoS)}) para ${nomeDestino()}` : `Enviar arquivo para ${nomeDestino()}`, corpo, largura: "m", aoAbrir: () => setTimeout(() => { if (!leg.disabled) leg.focus(); }, 40),
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
    if (!aceitaAnexo()) { ui.toast(motivoSemAnexo() || "Não dá para anexar agora.", { tipo: "info" }); return; }   // plano 1000b · CB-040
    if (A.acoes.offline && A.acoes.offline()) { ui.toast("Sem internet: arquivos só saem com a conexão de volta. O texto você já pode mandar (ele espera na fila).", { tipo: "info", ms: 8000 }); return; }
    if (!lista.every(f => L.ehFoto(f))) {
      ui.toast(`${lista.length} arquivos escolhidos: vão um de cada vez, cada um com a sua prévia.`, { tipo: "info", ms: 7000 });
      for (const f of lista) { if (!mesmaConversa(idInicio)) return; await anexar(f); }
      return;
    }
    const escolhidas = lista.slice(0, MAX_FOTOS);
    if (lista.length > MAX_FOTOS) ui.toast(`Até ${MAX_FOTOS} fotos por vez: ${lista.length - MAX_FOTOS} ficaram de fora. Envie as outras em seguida.`, { tipo: "info", ms: 8000 });
    const prontas = [];
    const recusadas = [];   // plano 2000d · DC-130: as recusadas viram UM aviso no fim, não um por foto
    const prep = { cancelado: false };
    // plano 2000d · DC-129: «Preparando 3 de 10 fotos…» com Cancelar, em vez de «Otimizando a foto…» parado
    mostrarLote(`Preparando 1 de ${escolhidas.length} fotos…`, "Cancelar", () => { prep.cancelado = true; });
    try {
      for (let i = 0; i < escolhidas.length; i++) {
        if (prep.cancelado) break;
        const f = escolhidas[i];
        mostrarLote(`Preparando ${i + 1} de ${escolhidas.length} fotos…`);
        let otim = null;
        try { otim = await otimizarFoto(f); }
        catch { if (/^image\/hei[cf]$/.test(L.mimeDe(f))) { recusadas.push(`${f.name} (HEIC, que este navegador não abre)`); continue; } }
        const arq = otim ? otim.arquivo : f;
        const v = L.validarArquivo(arq, { provedor: provedorCanal() });
        if (!v.ok) { recusadas.push(`${f.name} (${v.erro === "midia_grande" ? `${L.tamanhoLegivel(arq.size)}, passa de 5 MB` : v.erro === "midia_vazia" ? "vazio" : "tipo não aceito"})`); continue; }
        prontas.push({ arq, v, nome: f.name, original: f });
      }
    } finally { esconderLote(); }
    if (prep.cancelado) { ui.anunciar("Preparação das fotos cancelada. Nada foi enviado."); return; }
    if (recusadas.length) ui.toast(L.resumoFotosRecusadas(recusadas), { tipo: "erro", ms: 10000 });
    if (!mesmaConversa(idInicio)) { ui.toast("Você trocou de conversa enquanto as fotos eram preparadas: nada foi enviado. Anexe de novo na conversa certa.", { tipo: "info", ms: 8000 }); return; }
    if (!prontas.length) return;
    // plano 1000b · CB-039: sobrou uma só (as outras ficaram de fora) — o fluxo de foto única, com legenda, em vez de «Enviar 1 fotos»
    if (prontas.length === 1) { await anexar(prontas[0].original); return; }
    const urls = [];
    // plano 1000b · CB-080: cada miniatura tem «Tirar» — a contagem, o título e o botão acompanham (antes só dava para cancelar tudo)
    let apiModal = null;
    const titulo = n => `Enviar ${n} ${n === 1 ? "foto" : "fotos"} para ${nomeDestino()}`;
    const ordem = h("p", { class: "sub cvx-multi-ordem" });
    const pintarContagem = () => {
      const vivas = prontas.filter(p => !p.tirada), n = vivas.length;
      ordem.textContent = `Saem uma depois da outra, na ordem acima (${n} ${n === 1 ? "foto" : "fotos"}).`;
      vivas.forEach((p, i) => { if (p.li) { const s = p.li.querySelector(".cvx-multi-sobe"), d = p.li.querySelector(".cvx-multi-desce"); if (s) s.disabled = i === 0; if (d) d.disabled = i === n - 1; }
        p.leg.setAttribute("aria-label", `Legenda da foto ${i + 1} de ${n}`); if (p.img) p.img.setAttribute("alt", `Foto ${i + 1} de ${n}`); p.btTirar.setAttribute("aria-label", `Tirar a foto ${i + 1} de ${n}`); });
      if (apiModal && apiModal.el) {
        const t = apiModal.el.querySelector("h2"); if (t) t.textContent = titulo(n);
        const b = apiModal.el.querySelector('[data-tipo="primario"]'); if (b) b.textContent = `Enviar ${n}`;
      }
      return n;
    };
    const itens = prontas.map((p, i) => {
      let url = null;
      try { url = URL.createObjectURL(p.arq); urls.push(url); } catch { url = null; }
      p.leg = h("input", { type: "text", maxlength: 1024, class: "cvx-multi-leg", placeholder: "Legenda (opcional)", "aria-label": `Legenda da foto ${i + 1} de ${prontas.length}`, autocomplete: "off" });
      p.img = url ? h("img", { src: url, alt: `Foto ${i + 1} de ${prontas.length}` }) : null;
      p.btTirar = h("button", { type: "button", class: "bt bt-fant bt-p cvx-multi-tirar", "aria-label": `Tirar a foto ${i + 1} de ${prontas.length}` }, ui.icone("fechar"), "Tirar");
      // plano 1500c · CC-085: subir/descer a foto (a ordem do envio é a da lista)
      const btSobe = h("button", { type: "button", class: "bt-icone cvx-multi-sobe", "aria-label": "Mover a foto para antes" }, ui.icone("seta-esq"));
      const btDesce = h("button", { type: "button", class: "bt-icone cvx-multi-desce", "aria-label": "Mover a foto para depois" }, ui.icone("seta-dir"));
      const li = h("li", { class: "cvx-multi-item" }, p.img || h("span", { class: "cvx-multi-sem" }, p.nome), p.leg, h("div", { class: "linha cvx-multi-ordem-bts" }, btSobe, btDesce), p.btTirar);
      p.li = li;
      btSobe.addEventListener("click", () => moverFoto(p, -1, btSobe));
      btDesce.addEventListener("click", () => moverFoto(p, 1, btDesce));
      p.btTirar.addEventListener("click", () => {
        p.tirada = true;
        const prox = li.nextSibling || null;
        li.remove();
        const n = pintarContagem();
        ui.anunciar(`Foto tirada. ${n} ${n === 1 ? "foto fica" : "fotos ficam"}.`);
        if (!n) { if (apiModal) apiModal.fechar(null); return; }
        const alvo = (prox && prox.querySelector && prox.querySelector(".cvx-multi-tirar")) || (ul.lastElementChild && ul.lastElementChild.querySelector(".cvx-multi-tirar"));
        try { if (alvo) alvo.focus(); } catch { /* ok */ }
      });
      return li;
    });
    const ul = h("ul", { class: "cvx-multi", "aria-label": "Fotos escolhidas" }, itens);
    function moverFoto(p, d, bt) {
      const vivas = prontas.filter(x => !x.tirada);
      const i = vivas.indexOf(p), j = i + d;
      if (i < 0 || j < 0 || j >= vivas.length) return;
      const outro = vivas[j];
      const a = prontas.indexOf(p), b = prontas.indexOf(outro);
      prontas[a] = outro; prontas[b] = p;
      if (d < 0) ul.insertBefore(p.li, outro.li); else ul.insertBefore(outro.li, p.li);
      pintarContagem();
      ui.anunciar(`Foto agora na posição ${j + 1} de ${vivas.length}.`);
      try { bt.focus(); } catch { /* ok */ }
    }
    const corpo = h("div", { class: "pilha" }, ul, ordem);
    pintarContagem();
    let ok;
    try {
      ok = await ui.modal({ titulo: titulo(prontas.length), corpo, largura: "m", aoAbrir: api => { apiModal = api; },
        acoes: [{ rotulo: "Cancelar", tipo: "neutro" }, { rotulo: `Enviar ${prontas.length}`, tipo: "primario", valor: true }] });
    } finally { for (const u of urls) { try { URL.revokeObjectURL(u); } catch { /* ok */ } } }
    if (!ok) return;
    // plano 2000d · DC-093: o destino vai explícito (conversa: idInicio) — abrir outra conversa no meio NÃO para as fotos que faltam;
    // só a conversa de origem fechada para envio (conferida enquanto ela é a aberta) interrompe. DC-131: «Enviando fotos: 4 de 10 · Parar»
    const fila = prontas.filter(x => !x.tirada);
    const envio = { parar: false };
    const paraNome = nomeDestino();
    try {
      for (let i = 0; i < fila.length; i++) {
        if (envio.parar) { ui.toast(`Envio parado: ${fila.length - i} ${fila.length - i === 1 ? "foto ficou" : "fotos ficaram"} sem enviar.`, { tipo: "info", ms: 8000 }); return; }
        if (mesmaConversa(idInicio) && !aceitaAnexo()) { avisarAnexoIndisponivel(); return; }
        mostrarLote(`Enviando fotos: ${i + 1} de ${fila.length}`, "Parar as que faltam", () => { envio.parar = true; });
        const p = fila[i];
        await A.acoes.enviar({ tipo: "midia", conversa: idInicio, arquivo: p.arq, validacao: p.v, legenda: String(p.leg.value || "").trim(), client_ref: L.novoClientRef(), segundoPlano: true, para: paraNome });
      }
    } finally { esconderLote(); }
  }
  /** plano 2000d · DC-129/DC-131: faixa do lote de fotos (preparando/enviando N de M) com um botão de parar. */
  function mostrarLote(texto, rotulo, fn) {
    loteTxt.textContent = texto;
    if (rotulo) { loteBt.textContent = rotulo; loteAcao = fn || null; loteBt.disabled = false; loteBt.hidden = false; }
    loteStatus.hidden = false;
  }
  function esconderLote() { loteStatus.hidden = true; loteBt.hidden = true; loteAcao = null; }

  /* ---------------- modelos (templates aprovados) */
  // revisão 1000b · CB-132: toque duplo durante a espera da base (até 1,5 s) abria dois modais — trava até o modal fechar;
  // os botões «Modelos» ficam aria-busy enquanto a base é relida
  let abrindoModelos = false;
  function modelosOcupado(sim) {
    for (const b of [btModelos, ...el.querySelectorAll("[data-modelos]")]) { if (sim) b.setAttribute("aria-busy", "true"); else b.removeAttribute("aria-busy"); }
  }
  async function abrirModelos() {
    if (abrindoModelos) return;
    abrindoModelos = true;
    try { await abrirModelosAgora(); } finally { abrindoModelos = false; modelosOcupado(false); }
  }
  async function abrirModelosAgora() {
    if (usaCodeWords()) { ui.toast("Modelos da Meta não estão disponíveis neste canal CodeWords.", { tipo: "info" }); return; }
    const c = conv();
    if (!c) return;
    if (!c.canal_id) { ui.toast("Este atendimento não tem mais número para enviar.", { tipo: "erro" }); return; }
    // plano 1000b · CB-132: base com mais de 60 s é relida antes (modelo recém-aprovado aparece); no máximo 1,5 s de espera
    const fresca = A.acoes.baseFresca ? A.acoes.baseFresca(60000) : null;
    if (fresca) { modelosOcupado(true); try { await Promise.race([fresca, new Promise(r => setTimeout(r, 1500))]); } finally { modelosOcupado(false); } }
    if (!conv() || conv().id !== c.id) return;
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
        // plano 1000b · CB-112: o trecho do texto em volta do {{n}} (o rótulo sozinho não diz o que vai ali)
        const trecho = L.trechoParametro(t.corpo, i);
        const ajuda = trecho ? h("small", { class: "sub cvx-par-trecho", id: `cvx-par-${i}-trecho` }, `No texto: «${trecho}»`) : null;
        // plano 1000b · CB-133: dado de paciente — sem preenchimento automático do navegador (nomes e datas de outros pacientes)
        const inp = h("input", { id, type: "text", maxlength: 300, value: "", autocomplete: "off", "data-sem-protecao": "", placeholder: `Valor de {{${i}}}`, "aria-describedby": `${ajuda ? `cvx-par-${i}-trecho ` : ""}cvx-par-${i}-erro` });
        const erro = h("small", { class: "campo-erro", id: `cvx-par-${i}-erro`, role: "alert", hidden: true });
        const corrigir = h("button", { type: "button", class: "bt bt-fant bt-p cvx-par-corrigir", hidden: true }, "Corrigir");
        const conferir = () => { const e = L.erroParametroModelo(inp.value, i); erro.textContent = e; erro.hidden = !e; corrigir.hidden = !e; inp.setAttribute("aria-invalid", e ? "true" : "false"); };
        inp.addEventListener("input", () => { atualizarPrevia(); if (!erro.hidden) conferir(); });
        inp.addEventListener("blur", conferir);
        corrigir.addEventListener("click", () => { inp.value = L.corrigirParametroModelo(inp.value); conferir(); atualizarPrevia(); inp.focus(); });
        campos.push(inp);
        const chip = vars.primeiro_nome ? h("button", { type: "button", class: "cvx-chip cvx-par-nome", on: { click: () => { inp.value = vars.primeiro_nome; conferir(); atualizarPrevia(); inp.focus(); } } }, `Usar nome: ${vars.primeiro_nome}`) : null;
        // plano 1500c · CC-084: data, hora e serviço da próxima consulta do contato (quando o nx_cv_ver manda contato.consultas)
        const sug = L.sugestoesParametroConsulta(contato().consultas).map(s => h("button", { type: "button", class: "cvx-chip cvx-par-consulta",
          on: { click: () => { inp.value = s.valor; conferir(); atualizarPrevia(); inp.focus(); } } }, `${s.rotulo}: ${s.valor}`));
        params.appendChild(h("div", { class: "campo" }, h("label", { for: id }, `Parâmetro {{${i}}}`), ajuda, inp, erro, h("div", { class: "linha cvx-par-acoes" }, chip, ...sug, corrigir)));
      }
      atualizarPrevia();
      if (campos[0]) setTimeout(() => campos[0].focus(), 30);
    }
    lista.addEventListener("keydown", ev => {
      if (!["ArrowDown", "ArrowRight", "ArrowUp", "ArrowLeft"].includes(ev.key)) return;
      // plano 1000b · CB-081: as setas andam também pelos indisponíveis (o motivo é lido no foco); só o disponível é escolhido
      const ops = [...lista.querySelectorAll(".cv-modelo")].filter(b => !b.hidden);
      if (!ops.length) return;
      ev.preventDefault();
      const i = ops.indexOf(document.activeElement);
      const j = (i + (ev.key === "ArrowDown" || ev.key === "ArrowRight" ? 1 : -1) + ops.length) % ops.length;
      if (ops[j].getAttribute("aria-disabled") !== "true") ops[j].click();
      else for (const b of ops) b.tabIndex = b === ops[j] ? 0 : -1;
      ops[j].focus();
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
        "aria-disabled": disp.ok ? null : "true", "aria-describedby": disp.ok ? null : idMot, dataset: { categoria: cat, busca: L.semAcento(`${String(t.nome).replace(/_/g, " ")} ${t.nome} ${t.corpo || ""}`) } },
        h("span", { class: "cv-modelo-l1" }, h("span", { class: "mono" }, t.nome), ui.pilula(cat === "MARKETING" ? "Marketing" : cat === "UTILITY" ? "Utilidade" : cat === "AUTHENTICATION" ? "Autenticação" : (cat || "Modelo"), cat === "MARKETING" ? "aten" : "neutra",
            cat === "MARKETING" ? { title: L.dicaModeloMarketing(ct.optin_marketing) } : {}),
          h("span", { class: "fraco", title: t.idioma || null }, L.rotuloIdioma(t.idioma))),   // plano 1500c · CX-069
        h("p", null, t.corpo || "(sem texto)"),
        disp.ok ? null : h("small", { id: idMot }, disp.motivo));
      if (disp.ok) primeiro = false;
      b.addEventListener("click", () => escolher(t, b));
      lista.appendChild(b);
    }
    // plano 1000b · CB-081: nenhum disponível — o 1º continua no Tab (aria-disabled), senão o motivo nunca é alcançado pelo teclado
    if (primeiro) { const b0 = lista.querySelector(".cv-modelo"); if (b0) b0.tabIndex = 0; }
    // CA-069: com mais de 8 modelos, busca por nome/texto e chips de categoria
    let filtroBusca = null;
    if (todos.length > 8) {
      const inpBusca = h("input", { type: "search", class: "cvx-mod-busca", placeholder: "Buscar modelo pelo nome ou texto", "aria-label": "Buscar modelo", autocomplete: "off" });
      let cat = "";
      const nada = h("p", { class: "sub cvx-mod-nada", hidden: true }, "Nenhum modelo com esse termo.");
      const filtrar = () => {
        const q = L.semAcento(inpBusca.value.trim());
        let n = 0;
        // plano 1500c · CX-068: várias palavras em qualquer ordem («lembrete consulta» acha «consulta_lembrete_v2»)
        const ps = q.split(/[\s_]+/).filter(Boolean);
        for (const b of lista.querySelectorAll(".cv-modelo")) { const ok = (!ps.length || ps.every(p => b.dataset.busca.includes(p))) && (!cat || b.dataset.categoria === cat); b.hidden = !ok; if (ok) n++; }
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
        // plano 1000b · CB-041: a sugestão passou do limite — o fim some, e a pessoa fica sabendo (mesma ideia do aviso de colagem)
        if ((base + texto).length > teto()) ui.toast("A sugestão passou do limite: o fim ficou de fora. Revise ou divida em duas mensagens.", { tipo: "info", ms: 8000 });
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
      btOutraIA.disabled = estadoIA() !== "ok";   // plano 1000b · CB-107: a cota acabou com esta sugestão — «Outra sugestão» desliga como o btIA
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
      !usaCodeWords() ? { rotulo: "Modelos aprovados", icone: "modelo" /* plano 1000b · CB-083: o mesmo ícone do botão do computador */, fn: () => abrirModelos(), desabilitado: !(s === "ok" || s === "janela") } : null,
      { rotulo: modoNota ? "Voltar para mensagem" : "Nota interna", icone: "nota", fn: () => alternarNota() },
      // CA-004: sem IA configurada o item não aparece; com a cota gasta aparece desligado com o motivo no rótulo
      iaEst !== "sem" ? { rotulo: pedindoIA ? "Sugerindo com IA…" : iaEst === "cota" ? "Sugerir com IA (cota do mês acabou)" : "Sugerir com IA", icone: "ia", fn: () => sugerir(), desabilitado: s !== "ok" || pedindoIA || iaEst === "cota" } : null,
      // CA-060: o supervisor guarda uma boa resposta como resposta rápida sem ir a Configurações
      supervisor && !modoNota ? { rotulo: "Salvar como resposta rápida", icone: "raio", fn: () => salvarComoResposta(), desabilitado: !ta.value.trim() } : null,
      // plano 2000d · DC-124: tirar a foto direto pela câmera (só no toque)
      !modoNota && L.aparelhoDeToque() ? { rotulo: "Câmera", icone: "clipe", fn: () => abrirCamera(), desabilitado: !aceitaAnexo() } : null,
      // plano 2000d · DC-099: «Enviar e resolver» também no «+» do celular (sem depender do toque longo)
      !modoNota && typeof A.acoes.resolver === "function" ? { rotulo: "Enviar e resolver", icone: "check", fn: () => enviarEResolver(), desabilitado: !ta.value.trim() || !podeTexto() } : null,
    ].filter(Boolean));
  });

  /** CA-060: o texto do campo vira resposta rápida (mesma RPC e regras do cv-config: atalho minúsculo sem acento, até 30). */
  async function salvarComoResposta() {
    const corpoTxt = ta.value.trim();
    if (!corpoTxt) { ui.toast("Escreva o texto da resposta no campo primeiro.", { tipo: "info" }); return; }
    const sugestao = L.semAcento(corpoTxt.split(/\s+/).slice(0, 2).join("-")).replace(/[^a-z0-9_-]/g, "").slice(0, 30);
    const inAtalho = h("input", { id: "cvx-rr-atalho", type: "text", maxlength: 31, value: sugestao, autocomplete: "off", "aria-describedby": "cvx-rr-atalho-ajuda" });
    // plano 1000b · CB-038: o nome deste paciente, o de quem atende e o protocolo voltam a ser variáveis (senão a resposta diz «Mariana»
    // para todos os clientes); a prévia mostra o resultado e «Manter como está» (desmarcar) grava o texto do jeito que foi escrito
    const gen = L.generalizarResposta(corpoTxt, { ...varsAtuais(), atendente_nome: (A.eu && A.eu.nome) || "" });
    const chkVars = gen.trocas ? h("input", { type: "checkbox", id: "cvx-rr-vars", checked: true }) : null;
    const corpoFinal = () => (chkVars && chkVars.checked ? gen.texto : corpoTxt);
    const previaTxt = h("p", { class: "cvx-rr-salvar-previa" }, corpoFinal());
    if (chkVars) chkVars.addEventListener("change", () => { previaTxt.textContent = corpoFinal(); });
    const inTitulo = h("input", { id: "cvx-rr-titulo", type: "text", maxlength: 60, value: corpoFinal().slice(0, 40), autocomplete: "off" });
    // plano 1500c · CC-086: «Para» — todos os departamentos ou só o desta conversa (quem é do Financeiro não polui as respostas da Recepção)
    const deps = (A.base && A.base.departamentos) || [];
    const depConv = conv() && conv().departamento_id ? deps.find(d => d.id === conv().departamento_id) : null;
    const selPara = depConv ? h("select", { id: "cvx-rr-para", class: "sel" }, h("option", { value: "" }, "Todos os departamentos"), h("option", { value: depConv.id }, `Só ${depConv.nome}`)) : null;
    const corpo = h("div", { class: "pilha" },
      selPara ? h("div", { class: "campo" }, h("label", { for: "cvx-rr-para" }, "Para"), selPara) : null,
      h("div", { class: "campo" }, h("label", { for: "cvx-rr-atalho" }, "Atalho (depois da /)"), inAtalho,
        h("small", { class: "campo-ajuda", id: "cvx-rr-atalho-ajuda" }, "Letras minúsculas sem acento, números, - e _ (até 30).")),
      h("div", { class: "campo" }, h("label", { for: "cvx-rr-titulo" }, "Título"), inTitulo),
      h("p", { class: "rotulo" }, "Texto"), previaTxt,
      chkVars ? h("label", { class: "chip-check cvx-rr-vars", for: "cvx-rr-vars" }, chkVars, "Trocar nomes e protocolo por variáveis (desmarque para manter como está)") : null);
    const r = await ui.modal({ titulo: "Salvar como resposta rápida", corpo, largura: "p",
      acoes: [{ rotulo: "Cancelar", tipo: "neutro" }, { rotulo: "Salvar resposta", tipo: "primario", fn: async api => {
        const atalho = String(inAtalho.value || "").replace(/^\/+/, "").trim().toLowerCase();
        if (!/^[a-z0-9_-]{1,30}$/.test(atalho)) { api.erro("Atalho: use só letras minúsculas sem acento, números, - e _ (até 30)."); inAtalho.focus(); return false; }
        const titulo = String(inTitulo.value || "").trim();
        if (!titulo) { api.erro("Dê um título."); inTitulo.focus(); return false; }
        try {
          const texto = corpoFinal();
          const salva = await A.api.rpcC("nx_resposta_salvar", { p_resposta: { atalho, titulo, corpo: texto, departamento_id: (selPara && selPara.value) || null, ativo: true } });
          return salva || { atalho, titulo, corpo: texto };
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
  const EMOJI_REC = "nx-cv-emoji-rec";
  function ehMac() { try { const n = globalThis.navigator; return /Mac|iPhone|iPad/i.test(String((n && (n.userAgentData && n.userAgentData.platform)) || (n && n.platform) || "")); } catch { return false; } }
  function dicaEmojiSistema() { return ehMac() ? "Emoji (Ctrl + ⌘ + Espaço abre todos)" : "Emoji (Win + . abre todos)"; }
  btEmoji.addEventListener("click", () => {
    if (btEmoji.disabled) return;
    const ini = ta.selectionStart ?? ta.value.length, fim = ta.selectionEnd ?? ini;
    // plano 1000b · CB-084: um só ponto de Tab na grade (roving tabindex); setas andam (8 por linha), Home e End
    // plano 1500c · CX-077: os emojis usados por último aparecem primeiro (a recepção usa sempre os mesmos 🙏 👍 😊)
    const recentes = (() => { try { return JSON.parse(localStorage.getItem(EMOJI_REC) || "[]"); } catch { return []; } })();
    const grade = h("div", { class: "cvx-emojis", role: "group", "aria-label": "Emojis" }, L.ordenarEmojis(recentes, L.EMOJIS_RAPIDOS).map((e, i) => h("button", { type: "button", class: "cvx-emoji", "aria-label": `Inserir ${e}`, tabindex: i === 0 ? "0" : "-1" }, e)));
    grade.addEventListener("keydown", ev => {
      const bts = [...grade.querySelectorAll(".cvx-emoji")];
      const i = bts.indexOf(document.activeElement);
      if (i < 0) return;
      const POR_LINHA = 8;
      const j = ev.key === "ArrowRight" ? Math.min(bts.length - 1, i + 1) : ev.key === "ArrowLeft" ? Math.max(0, i - 1)
        : ev.key === "ArrowDown" ? Math.min(bts.length - 1, i + POR_LINHA) : ev.key === "ArrowUp" ? Math.max(0, i - POR_LINHA)
        : ev.key === "Home" ? 0 : ev.key === "End" ? bts.length - 1 : null;
      if (j === null) return;
      ev.preventDefault();
      for (const b of bts) b.tabIndex = b === bts[j] ? 0 : -1;
      bts[j].focus();
    });
    // plano 1000b · CB-119: no Mac o atalho do sistema é Ctrl + ⌘ + Espaço (o «Win + .» só vale no Windows)
    const dicaSis = ehMac() ? h("p", { class: "sub" }, "No Mac, ", h("kbd", null, "Ctrl"), " + ", h("kbd", null, "⌘"), " + ", h("kbd", null, "Espaço"), " abre todos.")
      : h("p", { class: "sub" }, "No Windows, ", h("kbd", null, "Win"), " + ", h("kbd", null, "."), " abre todos.");
    const pop = ui.flutuante(btEmoji, h("div", { class: "pilha-p cvx-emoji-pop" }, grade, dicaSis), { largura: 280 });
    grade.addEventListener("click", ev => {
      const b = ev.target && ev.target.closest ? ev.target.closest(".cvx-emoji") : null;
      if (!b) return;
      const e = b.textContent;
      if (ta.value.length + e.length > teto()) { ui.toast("O emoji não cabe: a mensagem está no limite.", { tipo: "info" }); return; }
      ta.value = `${ta.value.slice(0, ini)}${e}${ta.value.slice(fim)}`;
      try { localStorage.setItem(EMOJI_REC, JSON.stringify(L.lembrarEmoji(recentes, e))); } catch { /* sem storage */ }   // CX-077
      try { pop.fechar(); } catch { /* ok */ }
      ta.focus();
      ta.setSelectionRange(ini + e.length, ini + e.length);
      ta.dispatchEvent(new Event("input", { bubbles: true }));
    });
  });

  return {
    el, atualizar, definirConversa, responder, anexar, aceitaAnexo, motivoSemAnexo, abrirModelos,
    anexarVarios,   // plano 1500c · CX-055: o chat solta várias fotos arrastadas pelo mesmo fluxo da colagem
    colegaRespondeu,   // plano 2000d · DC-108: o delta avisa quando chega resposta de outra pessoa com o campo escrito
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
      // plano 1500c · CC-096: a conversa foi resolvida (ou a janela fechou) nesse meio tempo — o texto vai para o rascunho e a pessoa sabe
      if (!podeTexto()) {
        if (idDoCampo) { A.rascunhos.set(idDoCampo, ta.value); A.acoes.rascunhoMudou(); }
        ui.toast("O texto ficou guardado como rascunho: reabra a conversa para enviar.", { tipo: "info" });
        return;
      }
      autoAltura(); ta.focus();
      ta.dispatchEvent(new Event("input", { bubbles: true }));
    },
    desmontar() {
      if (gravacao) descartarGravacao("você saiu de Conversas"); desligarRascunho();
      try { globalThis.removeEventListener && globalThis.removeEventListener("online", aoVoltarInternet); } catch { /* ok */ }   // plano 2000d · DC-091
    },
    /** plano 2000d · DC-091: há áudio gravado esperando para sair (a central avisa antes de trocar de tela). */
    get audioGuardado() { return !!audioGuardado; },
    /** CA-031: há gravação de áudio em andamento (a central pergunta antes de trocar de tela). */
    get gravando() { return !!gravacao; },
    focar() { if (!ta.disabled) ta.focus(); },
    /** plano 1000b · CB-078: «Anexar de novo» da bolha de mídia que não saiu abre o mesmo seletor do clipe. */
    escolherArquivo() { if (btClipe.hidden || btClipe.disabled) return false; btClipe.click(); return true; },
  };
}
