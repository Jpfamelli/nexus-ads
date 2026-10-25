/* ============================================================
   ÓRBITA — crm-importar.js · frente F4 · T10 Importar (#/contatos/importar)
   4 passos: (1) arquivo .csv ou colar do Excel (lerCSV: ; , tab, aspas,
   BOM, CRLF; até 20.000 linhas; ANSI do Excel vira UTF-8); (2) mapear
   colunas (sugestão automática, "Ignorar coluna", campos personalizados);
   (3) opções (atualizar existentes, etiquetas para todos, negócio no
   funil/etapa, responsável) + prévia das 5 primeiras linhas com erros
   marcados; (4) importar em lotes de 100 (metade ao receber
   tempo_esgotado, mínimo 10), barra de progresso, Pausar, resumo final
   com "Baixar erros em CSV". Só supervisor+ (o servidor confere de novo).
   Plano 50 (04/10): no passo das colunas uma prévia ao vivo com o destino
   de cada coluna no cabeçalho (mapeada/ignorada) e a contagem que muda ao
   escolher; barra de progresso com porcentagem, listras enquanto roda e
   aria-valuetext.
   ============================================================ */

const LIMITE_LINHAS = 20000;
const PASSOS = [
  { id: 1, rotulo: "Arquivo" },
  { id: 2, rotulo: "Colunas" },
  { id: 3, rotulo: "Opções" },
  { id: 4, rotulo: "Importar" },
];
const esperar = ms => new Promise(r => setTimeout(r, ms));

export async function montarImportar(k, el) {
  const { ui, h, L, ctx, v } = k;
  ctx.titulo(`Importar ${v.min("contatos")}`);

  if (!k.pode("supervisor")) {
    el.appendChild(ui.vazio({ titulo: "Você não tem acesso à importação.", icone: "cadeado",
      texto: "Importar planilhas é para supervisores e administradores. Fale com o administrador da sua empresa.",
      acao: { rotulo: `Ver ${v.min("contatos")}`, fn: () => ctx.navegar("#/contatos") } }));
    return {};
  }

  const S = {
    passo: 1, vivo: true,
    arquivo: null,           // {nome, tamanho, codificacao}
    dados: null,             // resultado do lerCSV
    mapa: [],                // destino por coluna ('nome', 'campo:x' ou null)
    opcoes: { atualizar: false, etiquetas: [], dono_id: null, criarNegocio: false, funil_id: null, estagio_id: null },
    rodando: false, pausado: false, cancelado: false, terminou: false,
    resumo: null, erroFatal: null, feitas: 0, lote: 100,
    imp: null,               // importacao_id: "Tentar o restante" continua no MESMO registro
  };

  /** plano 1000 (CR-125): as linhas montadas (e os problemas de cada uma) só são refeitas quando o arquivo ou o mapa mudam — voltar e avançar não recalcula 20.000 linhas. */
  let memo = { dados: null, mapa: "", linhas: null, problemas: null };
  function linhasDoMapa() {
    const chave = JSON.stringify(S.mapa);
    // plano 1000b · RB-068: com os campos, a opção da planilha («unimed») vira a oficial («Unimed»)
    if (memo.dados !== S.dados || memo.mapa !== chave) memo = { dados: S.dados, mapa: chave, linhas: L.montarLinhas(S.dados.linhas, S.mapa, k.base.campos), problemas: null };
    return memo.linhas;
  }
  function problemasDoMapa() {
    const linhas = linhasDoMapa();
    if (!memo.problemas) memo.problemas = linhas.map(l => L.checarLinha(l, { campos: k.base.campos }));     // plano 1000 (CR-232): campos personalizados conferidos na prévia
    return memo.problemas;
  }
  /** plano 1500c · RC-263: o conferirPlanilha das linhas é guardado por (linhas, funil, etapas, etiquetas) — trocar de funil e voltar não refaz 20.000 linhas. */
  let memoConf = { chave: "", linhas: null, r: null };
  function conferirMemo(linhas, estagios) {
    const chave = JSON.stringify([(estagios || []).map(e => [e.id, e.nome, e.tipo]), (k.base.etiquetas || []).map(e => e.nome)]);
    if (memoConf.linhas !== linhas || memoConf.chave !== chave) memoConf = { chave, linhas, r: L.conferirPlanilha(linhas, { estagios, etiquetas: k.base.etiquetas }) };
    return memoConf.r;
  }
  // plano 1000 (CR-122): o mapa de colunas é lembrado por planilha (assinatura do cabeçalho) neste aparelho — a planilha de toda semana já vem mapeada
  const chaveMapas = `nx-app-crm-imp-mapas-${ctx.cliente.id}`;
  const lerMapas = () => { try { const o = JSON.parse(localStorage.getItem(chaveMapas) || "{}"); return o && typeof o === "object" ? o : {}; } catch { return {}; } };
  function guardarMapa() {
    if (!S.dados) return;
    const o = lerMapas();
    o[L.assinaturaCabecalho(S.dados.cabecalho)] = { mapa: S.mapa, em: Date.now() };
    const chaves = Object.keys(o).sort((a, b) => (o[b].em || 0) - (o[a].em || 0)).slice(0, 10);     // só as 10 últimas planilhas
    try { localStorage.setItem(chaveMapas, JSON.stringify(Object.fromEntries(chaves.map(x => [x, o[x]])))); } catch { /* ok */ }
  }
  /** CR-120: os 2 primeiros bytes são «PK» (arquivo zip = .xlsx renomeado)? */
  async function comecaComPK(f) {
    try { const b = new Uint8Array(await (f.slice ? f.slice(0, 2) : f).arrayBuffer()); return b[0] === 0x50 && b[1] === 0x4b; } catch { return false; }
  }

  const passosEl = h("ol", { class: "imp-passos", "aria-label": "Passos da importação" });
  // plano 1000 (CR-124): o corpo NÃO é aria-live (cada troca de passo era lida inteira); o que precisa ser ouvido vai por ui.anunciar e pelo status do progresso
  const corpo = h("section", { class: "cartao imp-corpo" });
  const rodape = h("div", { class: "imp-rod" });
  el.append(
    ui.cabecalho({ titulo: `Importar ${v.min("contatos")}`, sub: "Traga a sua planilha. Quem já existe é reconhecido pelo telefone (com ou sem o código do Brasil e o 9 do celular) ou pelo e-mail.",     // plano 1000 (CR-279)
      acoes: h("a", { class: "bt bt-sec", href: "#/contatos" }, ui.icone("seta-esq"), v.contatos) }),
    passosEl, corpo, rodape);

  // não perder uma importação no meio sem aviso
  const antesDeSair = ev => { if (S.rodando) { ev.preventDefault(); ev.returnValue = ""; } };
  addEventListener("beforeunload", antesDeSair);
  // plano 1000 (CR-117): enquanto importa, a atualização automática do app espera (ela recarregaria a página no meio)
  const soltarNaoAtualizar = ctx.naoAtualizar ? ctx.naoAtualizar(() => S.rodando) : null;

  function desenharPassos() {
    ui.limpar(passosEl);
    for (const p of PASSOS) {
      passosEl.appendChild(h("li", { class: ["imp-passo", p.id < S.passo && "feito"], "aria-current": p.id === S.passo ? "step" : null }, p.rotulo));
    }
  }

  // plano 1000b · RB-126: no passo 1, soltar o arquivo FORA da área não faz o navegador abrir o CSV (e perder a tela) — a janela segura o soltar
  let soltarJanela = null;
  function pararJanela() { if (soltarJanela) { soltarJanela(); soltarJanela = null; } }
  function ir(passo) {
    pararJanela();
    S.passo = passo;
    desenharPassos();
    ui.limpar(corpo); ui.limpar(rodape);
    if (passo === 1) passoArquivo();
    else if (passo === 2) passoColunas();
    else if (passo === 3) passoOpcoes();
    else passoImportar();
    const alvo = corpo.querySelector("h2");
    if (alvo) { alvo.setAttribute("tabindex", "-1"); try { alvo.focus({ preventScroll: false }); } catch { /* ok */ } }
  }

  /** plano 1000b · RB-129: deixa o navegador pintar (rAF; com teto de 50 ms para aba em segundo plano, onde o rAF não roda). */
  const cederQuadro = () => new Promise(r => {
    let feito = false;
    const f = () => { if (!feito) { feito = true; r(); } };
    try { if (typeof requestAnimationFrame === "function") requestAnimationFrame(f); } catch { /* sem rAF */ }
    setTimeout(f, 50);
  });
  /** plano 1000b · RB-219: aparelho de toque (sem matchMedia, como no Node, é «não»). */
  const toque = () => { try { return typeof matchMedia === "function" && !!matchMedia("(pointer: coarse)").matches; } catch { return false; } };
  const botao = (rotulo, tipo, fn, extra = {}) => h("button", { type: "button", class: ["bt", tipo === "prim" ? "bt-prim" : tipo === "fant" ? "bt-fant" : "bt-sec"], on: { click: fn }, ...extra }, rotulo);

  /* ------------------------------------------------------------ 1. arquivo */
  function passoArquivo() {
    const entrada = h("input", { type: "file", accept: ".csv,.txt,text/csv,text/plain", class: "sr-only", id: "imp-arquivo" });
    const solta = h("label", { class: "imp-solta", for: "imp-arquivo" },
      ui.icone("clipe"),
      // plano 1000b · RB-219: no toque não há arrastar
      h("b", null, toque() ? "Toque para escolher o arquivo" : "Arraste o arquivo aqui ou clique para escolher"),
      h("p", null, "Aceita .csv (separado por ponto e vírgula, vírgula, tabulação ou barra vertical). No Excel ou no Google Planilhas: Arquivo → Salvar como / Fazer download → CSV. Até 20.000 linhas por arquivo."));
    const status = h("div", { class: "imp-arq", hidden: true });
    const avisoCortado = h("p", { class: "aviso aviso-aten imp-aviso", hidden: true }, ui.icone("alerta"), h("span"));
    // plano 1000b · RB-070: aspas abertas e nunca fechadas engolem o resto do arquivo numa célula — a tela diz em que linha
    const avisoAspas = h("p", { class: "aviso aviso-aten imp-aviso-aspas", role: "alert", hidden: true }, ui.icone("alerta"), h("span"));
    const colar = h("textarea", { rows: 6, placeholder: "Nome\tTelefone\tE-mail\nAna Souza\t(12) 99830-3030\tana@exemplo.com.br", "aria-label": "Colar linhas da planilha" });
    const usarColado = botao("Usar o texto colado", "sec", () => {
      if (!colar.value.trim()) { ui.toast("Cole as linhas da planilha, com o cabeçalho na primeira linha.", { tipo: "info" }); colar.focus(); return; }
      carregarTexto(colar.value, { nome: "Colado do Excel", tamanho: colar.value.length, codificacao: "utf-8" });
    });
    // plano 1500c · RC-175: contador ao vivo do que foi colado («12 linhas · 4 colunas»), antes de «Usar o texto colado»
    const contColado = h("small", { class: "sub imp-colar-cont", role: "status" });
    let tColar = null;
    colar.addEventListener("input", () => { clearTimeout(tColar); tColar = setTimeout(() => { contColado.textContent = L.contagemColado(colar.value); }, 250); });
    const colarBloco = h("details", { class: "imp-colar" },
      h("summary", null, "Ou cole direto do Excel"),
      h("div", { class: "pilha-p" }, h("p", { class: "sub" }, "Selecione as células no Excel (com a linha do cabeçalho), copie e cole aqui."), colar, contColado, h("div", { class: "linha" }, usarColado)));

    entrada.addEventListener("change", () => { if (entrada.files && entrada.files[0]) lerArquivo(entrada.files[0]); });
    for (const ev of ["dragenter", "dragover"]) solta.addEventListener(ev, e => { e.preventDefault(); solta.classList.add("sobre"); });
    for (const ev of ["dragleave", "drop"]) solta.addEventListener(ev, e => { e.preventDefault(); solta.classList.remove("sobre"); });
    solta.addEventListener("drop", e => { const f = e.dataTransfer && e.dataTransfer.files && e.dataTransfer.files[0]; if (f) lerArquivo(f); });
    {
      const segurar = e => { if (e && typeof e.preventDefault === "function") e.preventDefault(); };
      const soltouFora = e => {
        segurar(e);
        if (e && e.target && typeof solta.contains === "function" && solta.contains(e.target)) return;     // a área já leu
        const f = e && e.dataTransfer && e.dataTransfer.files && e.dataTransfer.files[0];
        if (f) lerArquivo(f);
      };
      addEventListener("dragover", segurar);
      addEventListener("drop", soltouFora);
      soltarJanela = () => { removeEventListener("dragover", segurar); removeEventListener("drop", soltouFora); };
    }

    async function lerArquivo(f) {
      if (f.size > 25 * 1024 * 1024) { ui.toast("Arquivo grande demais (até 25 MB). Divida a planilha em partes.", { tipo: "erro" }); return; }
      // plano 1500c · RX-050: arquivo vazio (0 byte, comum quando o download não terminou) ganha a frase certa, não «não achamos linhas»
      if (f.size === 0) { ui.toast(`O arquivo «${f.name || "arquivo"}» está vazio. Baixe ou salve a planilha de novo.`, { tipo: "erro", ms: 8000 }); return; }
      // plano 1000 (CR-120): planilha do Excel (.xlsx/.xls, ou o «PK» do zip no começo) ganha o passo a passo em vez do «não parece CSV»
      if (/\.xls[xmb]?$/i.test(f.name || "") || /spreadsheetml|ms-excel/.test(f.type || "") || await comecaComPK(f)) {
        ui.toast("É uma planilha do Excel. Abra no Excel e use Arquivo → Salvar como → «CSV UTF-8 (separado por vírgulas)» e escolha o arquivo .csv aqui. Ou copie as células e use «Ou cole direto do Excel».", { tipo: "erro", ms: 12000 });
        return;
      }
      if (!/\.(csv|txt)$/i.test(f.name) && !/text|csv/.test(f.type || "")) {
        ui.toast("Esse arquivo não parece um CSV. No Excel, use Salvar como → CSV (separado por vírgulas ou ponto e vírgula).", { tipo: "erro", ms: 8000 });
        return;
      }
      try {
        // plano 1000b · RB-129: «Lendo a planilha…» aparece ANTES de a leitura ocupar a tela (um quadro cedido antes de decodificar e antes do lerCSV)
        ui.limpar(status); status.hidden = false;
        status.append(h("span", { class: "imp-lendo", role: "status" }, `Lendo a planilha «${f.name || "arquivo"}»…`));
        continuar.disabled = true;
        await cederQuadro();
        const bytes = new Uint8Array(await f.arrayBuffer());
        const d = L.decodificarArquivo(bytes);
        await cederQuadro();
        carregarTexto(d.texto, { nome: f.name, tamanho: f.size, codificacao: d.codificacao });
      } catch (e) {
        console.error(e);
        ui.toast("Não foi possível ler o arquivo. Tente salvar de novo como CSV.", { tipo: "erro" });
      }
    }

    function carregarTexto(texto, info, separador = null) {
      const d = L.lerCSV(texto, { limite: LIMITE_LINHAS, ...(separador ? { separador } : {}) });
      S.texto = texto; S.separadorEscolhido = separador;
      if (!d.cabecalho.length || !d.linhas.length) {
        S.dados = null; S.arquivo = null;
        mostrarStatus();
        ui.toast("Não achamos linhas nessa planilha. A primeira linha precisa ser o cabeçalho (Nome, Telefone…).", { tipo: "erro", ms: 8000 });
        return;
      }
      S.arquivo = info; S.dados = d;
      S.mapa = L.sugerirMapeamento(d.cabecalho, k.base.campos);
      const lembrado = (lerMapas()[L.assinaturaCabecalho(d.cabecalho)] || {}).mapa;
      const reaproveitado = L.mapaGuardado(lembrado, d.cabecalho, L.destinosImportacao(k.base.campos));
      S.mapaLembrado = !!reaproveitado;
      if (reaproveitado) S.mapa = reaproveitado;
      S.opcoes.criarNegocio = L.mapaTemNegocio(S.mapa);
      S.resumo = null; S.feitas = 0; S.terminou = false; S.erroFatal = null; S.imp = null;
      mostrarStatus();
      ui.anunciar(`${ui.num(d.linhas.length)} ${d.linhas.length === 1 ? "linha encontrada" : "linhas encontradas"}.`);      // plano 1500c · RX-051: singular e número com ponto (20.000)
    }

    function mostrarStatus() {
      ui.limpar(status);
      status.hidden = !S.dados;
      if (!S.dados) { avisoCortado.hidden = true; avisoAspas.hidden = true; continuar.disabled = true; return; }
      const d = S.dados;
      const sepNome = { ";": "ponto e vírgula", ",": "vírgula", "\t": "tabulação", "|": "barra vertical" }[d.separador] || d.separador;      // plano 1500c · RX-014
      status.append(
        h("span", { class: "imp-arq-ic", "aria-hidden": "true" }, ui.icone("check")),
        h("div", null,
          h("b", null, S.arquivo.nome),
          h("small", null, `${ui.num(d.linhas.length)} linha${d.linhas.length === 1 ? "" : "s"} · ${d.cabecalho.length} coluna${d.cabecalho.length === 1 ? "" : "s"} · separador ${sepNome}${S.arquivo.codificacao === "windows-1252" ? " · acentos convertidos do Excel" : ""}`)),
        h("button", { type: "button", class: "bt bt-fant bt-p", on: { click: () => { S.dados = null; S.arquivo = null; entrada.value = ""; mostrarStatus(); } } }, "Trocar"));
      // plano 1000 (CR-115): o separador escolhido sozinho pode errar (CSV com «;» e vírgula decimal, tudo numa coluna só) — dá para trocar e reler na hora
      const autoNome = S.separadorEscolhido ? null : sepNome;
      const selSep = h("select", { class: "sel imp-sep", "aria-label": "Separador das colunas" },
        h("option", { value: "", selected: !S.separadorEscolhido }, `Automático${autoNome ? ` (${autoNome})` : ""}`),
        [[";", "Ponto e vírgula (;)"], [",", "Vírgula (,)"], ["\t", "Tabulação"], ["|", "Barra vertical (|)"]].map(([v, t]) => h("option", { value: v, selected: S.separadorEscolhido === v }, t)));
      selSep.addEventListener("change", () => {
        const info = S.arquivo;
        carregarTexto(S.texto, info, selSep.value || null);
        if (S.dados) ui.anunciar(`Separador trocado: ${S.dados.cabecalho.length} coluna${S.dados.cabecalho.length === 1 ? "" : "s"}.`);
        const novo = status.querySelector(".imp-sep"); if (novo) novo.focus();
      });
      status.append(h("label", { class: "imp-sep-l" }, h("span", { class: "rotulo" }, "Separador"), selSep));
      avisoAspas.hidden = !d.aspasAbertas;
      avisoAspas.querySelector("span").textContent = d.aspasAbertas
        ? `Há aspas (") sem fechar na linha ${d.linhaAspas}: dali em diante tudo virou uma célula só e podem faltar linhas. Corrija a planilha e escolha o arquivo de novo.` : "";
      avisoCortado.hidden = !d.cortado;
      avisoCortado.querySelector("span").textContent = d.cortado ? `A planilha tem ${ui.num(d.total)} linhas; vamos importar as primeiras ${ui.num(LIMITE_LINHAS)}. Importe o restante num segundo arquivo.` : "";
      continuar.disabled = false;
    }

    const continuar = botao("Continuar", "prim", () => ir(2), { disabled: true });
    // plano 1000 (CR-239): quem não tem planilha pronta baixa o modelo (colunas que a importação reconhece sozinha + 2 linhas de exemplo)
    const modelo = h("p", { class: "sub imp-modelo" }, "Não tem a planilha pronta? ",
      h("button", { type: "button", class: "link imp-modelo-bt", on: { click: baixarModelo } }, ui.icone("baixar"), "Baixar modelo (CSV)"),
      " — preencha no Excel e escolha o arquivo aqui.");
    function baixarModelo() {
      const m = L.modeloImportacao(k.base.campos);
      const url = URL.createObjectURL(new Blob([L.gerarCSV(m.cabecalho, m.linhas)], { type: "text/csv;charset=utf-8" }));
      const a = h("a", { href: url, download: `modelo-${v.min("contatos")}.csv`, hidden: true });
      document.body.appendChild(a); a.click(); a.remove();
      setTimeout(() => URL.revokeObjectURL(url), 2000);
    }
    corpo.append(h("h2", { class: "imp-tit" }, "Escolha a planilha"), entrada, solta, modelo, status, avisoAspas, avisoCortado, colarBloco);
    rodape.append(h("span"), continuar);
    mostrarStatus();
  }

  /* ------------------------------------------------------------ 2. colunas */
  function passoColunas() {
    const d = S.dados;
    const destinos = L.destinosImportacao(k.base.campos);
    const rotuloDe = val => (destinos.find(x => x.valor === val) || {}).rotulo || val;
    const lista = h("div", { class: "imp-mapa", role: "list" });
    const aviso = h("p", { class: "aviso aviso-ruim", role: "alert", hidden: true }, ui.icone("alerta"),
      h("span", null, "Escolha pelo menos a coluna do nome, do telefone ou do e-mail."));
    const selects = [];
    // plano 1000b · RB-071: cabeçalho repetido («Telefone» duas vezes) ganha «(2ª)» e um aviso — antes eram duas colunas iguais sem dizer qual é qual
    const { rotulos: rotCol, repetidas } = L.rotulosColunas(d.cabecalho);
    const avisoRep = repetidas ? h("p", { class: "aviso aviso-aten imp-aviso-rep", role: "note" }, ui.icone("alerta"),
      h("span", null, "Colunas com o mesmo nome: confira os exemplos de cada uma antes de escolher o destino.")) : null;

    d.cabecalho.forEach((col, i) => {
      const exemplos = d.linhas.map(l => l[i]).filter(x => x && x.trim()).slice(0, 3);
      const sel = h("select", { class: "sel imp-map-sel", "aria-label": `Destino da coluna ${rotCol[i]}` },   // plano 1000b · RB-131: o select padrão do CRM
        h("option", { value: "" }, "Ignorar coluna"),
        h("optgroup", { label: "Cadastro" }, destinos.filter(x => !x.valor.startsWith("campo:") && !["negocio_titulo", "negocio_valor", "estagio"].includes(x.valor))
          .map(x => h("option", { value: x.valor }, x.rotulo))),
        h("optgroup", { label: k.v.negocio }, destinos.filter(x => ["negocio_titulo", "negocio_valor", "estagio"].includes(x.valor)).map(x => h("option", { value: x.valor }, x.rotulo))),
        destinos.some(x => x.valor.startsWith("campo:"))
          ? h("optgroup", { label: "Campos personalizados" }, destinos.filter(x => x.valor.startsWith("campo:")).map(x => h("option", { value: x.valor }, x.rotulo.replace(/^Campo: /, ""))))
          : null);
      sel.value = S.mapa[i] || "";
      const linha = h("div", { class: ["imp-mapa-l", !S.mapa[i] && "ignorada"], role: "listitem" },
        h("div", { class: "imp-mapa-col" }, h("b", null, rotCol[i]), h("small", null, exemplos.length ? exemplos.join(" · ") : "(vazia)")),
        h("span", { class: "imp-mapa-seta", "aria-hidden": "true" }, ui.icone("seta-dir")),
        sel);
      sel.addEventListener("change", () => {
        const val = sel.value || null;
        if (val) {
          const j = S.mapa.findIndex((x, n) => x === val && n !== i);
          if (j >= 0) {
            S.mapa[j] = null; selects[j].value = ""; selects[j].closest(".imp-mapa-l").classList.add("ignorada");
            ui.anunciar(`«${rotuloDe(val)}» agora vem da coluna ${col || i + 1}; a coluna ${d.cabecalho[j] || j + 1} ficou ignorada.`);
          }
        }
        S.mapa[i] = val;
        linha.classList.toggle("ignorada", !val);
        validar();
      });
      selects.push(sel);
      lista.appendChild(linha);
    });

    const nMap = () => S.mapa.filter(Boolean).length;
    const subTxt = h("p", { class: "sub imp-col-sub", "aria-live": "polite" });
    // prévia ao vivo (plano 50, item 29): as 3 primeiras linhas com o destino de cada coluna no cabeçalho — mapeada em destaque, ignorada apagada
    const previa = h("div", { class: "imp-previa-env" });
    function desenharPrevia() {
      ui.limpar(previa);
      subTxt.textContent = `${S.mapaLembrado ? "Usamos o mesmo mapa da última vez que esta planilha foi importada — confira." : "Sugerimos pelo nome do cabeçalho — confira."} ${nMap()} de ${d.cabecalho.length} colunas reconhecidas. Colunas ignoradas não entram.`;
      const cab = L.cabecalhoPrevia(d.cabecalho, S.mapa, destinos);
      previa.appendChild(h("div", { class: "tabela-env imp-previa-cx" }, h("table", { class: "tabela imp-previa imp-previa-mapa" },
        h("caption", { class: "sr-only" }, "Prévia das 3 primeiras linhas com o destino de cada coluna"),
        h("thead", null, h("tr", null, cab.map(c => h("th", { scope: "col", class: ["imp-th", c.destino ? "mapeada" : "ignorada"] },
          h("span", { class: "imp-th-col" }, c.coluna), h("span", { class: "imp-th-dest" }, ui.icone(c.destino ? "seta-dir" : "fechar"), c.rotulo))))),
        h("tbody", null, d.linhas.slice(0, 3).map(l => h("tr", null, cab.map(c => h("td", { class: c.destino ? null : "ignorada" }, (l[c.i] || "").trim() || "—"))))))));
    }
    // plano 1000b · RB-239: quantas linhas ficariam de fora (sem nome, telefone e e-mail) com o mapa de agora
    const avisoFora = h("p", { class: "aviso aviso-aten imp-aviso-fora", hidden: true }, ui.icone("info"), h("span"));
    function contarFora() {
      const cols = S.mapa.map((x, i) => (x === "nome" || x === "telefone" || x === "email" ? i : -1)).filter(i => i >= 0);
      if (!cols.length) { avisoFora.hidden = true; return; }
      const n = d.linhas.filter(l => cols.every(i => !String(l[i] ?? "").trim())).length;
      avisoFora.hidden = !n;
      avisoFora.querySelector("span").textContent = n ? `${ui.num(n)} ${n === 1 ? "linha ficaria" : "linhas ficariam"} de fora: ${n === 1 ? "não tem" : "não têm"} nome, telefone nem e-mail nas colunas escolhidas.` : "";
    }
    function validar() {
      const ok = L.mapaValido(S.mapa);
      contarFora();
      aviso.hidden = ok;
      continuar.disabled = !ok;
      desenharPrevia();
      pintarSoMapeadas();     // plano 1500c · RC-305
      return ok;
    }
    // plano 1500c · RC-305: planilha larga (exportação de outro CRM, 40 colunas): as não reconhecidas já entram como «Ignorar coluna» —
    // «Mostrar só as reconhecidas» esconde as ignoradas para conferir só o que vai entrar (de novo mostra todas)
    let soMapeadas = false;
    const btSoMapeadas = d.cabecalho.length > 8 ? h("button", { type: "button", class: "bt bt-fant bt-p imp-so-mapeadas", "aria-pressed": "false" }) : null;
    function pintarSoMapeadas() {
      if (!btSoMapeadas) return;
      const ign = d.cabecalho.length - nMap();
      btSoMapeadas.setAttribute("aria-pressed", String(soMapeadas));
      btSoMapeadas.textContent = soMapeadas ? `Mostrar todas as colunas (${ui.num(ign)} ignorada${ign === 1 ? "" : "s"} escondida${ign === 1 ? "" : "s"})` : `Mostrar só as reconhecidas (esconder ${ui.num(ign)} ignorada${ign === 1 ? "" : "s"})`;
      lista.querySelectorAll(".imp-mapa-l").forEach((l, i) => { l.hidden = soMapeadas && !S.mapa[i]; });
    }
    if (btSoMapeadas) btSoMapeadas.addEventListener("click", () => { soMapeadas = !soMapeadas; pintarSoMapeadas(); ui.anunciar(soMapeadas ? "Mostrando só as colunas reconhecidas." : "Mostrando todas as colunas."); });
    const continuar = botao("Continuar", "prim", () => { if (validar()) { if (L.mapaTemNegocio(S.mapa)) S.opcoes.criarNegocio = true; guardarMapa(); ir(3); } });
    corpo.append(
      h("h2", { class: "imp-tit" }, "O que é cada coluna?"),
      subTxt,
      avisoRep,
      btSoMapeadas, lista, aviso, avisoFora,
      h("h3", { class: "imp-sub" }, "Como vai ficar"), previa);
    rodape.append(botao("Voltar", "sec", () => ir(1)), continuar);
    validar();
  }

  /* ------------------------------------------------------------ 3. opções + prévia */
  function passoOpcoes() {
    const o = S.opcoes;
    const d = S.dados;
    const linhasMontadas = linhasDoMapa();
    const funis = k.base.funis.filter(f => f.ativo !== false);
    if (!o.funil_id || !funis.some(f => f.id === o.funil_id)) o.funil_id = (funis.find(f => !f.conta_no_ads) || k.funilPadrao() || funis[0] || {}).id || null;
    // plano 1000b · RB-134: sem nenhum funil ativo não dá para criar negócio — o interruptor fica desligado e explica (antes ligava e o pedido ia sem negócio, calado)
    const semFunil = !funis.length;
    if (semFunil) o.criarNegocio = false;

    // plano 1500c · RC-177: uma frase curta no interruptor; a regra completa (CR-240) fica no «Detalhes» recolhível
    const atualizar = ui.campo({ tipo: "interruptor", nome: "atualizar", rotulo: "Atualizar quem já existe", valor: o.atualizar,
      ajuda: "Ligado: telefone ou e-mail já cadastrado atualiza o cadastro. Desligado: a linha é pulada." });
    atualizar.appendChild(h("details", { class: "imp-det-regra" }, h("summary", null, "Detalhes"),
      // plano 1000 (CR-240): a regra do servidor (nx_contatos_importar) dita em português — o que é somado, o que é substituído e o que fica
      h("p", { class: "sub" }, "As etiquetas são somadas às que a pessoa já tem; nome, e-mail, cidade, UF, nascimento e documento são substituídos quando vierem preenchidos na planilha (célula vazia não apaga nada); o telefone fica o mesmo e a observação é acrescentada.")));
    atualizar.querySelector("input").addEventListener("change", ev => { o.atualizar = ev.target.checked; });

    // só guarda o valor para o «Continuar»: emite na hora (debounceMs: 0) — a pausa de 300 ms perdia a última etiqueta marcada
    const etiquetas = ui.seletorEtiquetas({ debounceMs: 0, todas: k.base.etiquetas, marcadas: o.etiquetas, rotulo: "Etiquetas para todos",
      aoMudar: ids => { o.etiquetas = ids; }, podeCriar: k.pode("atendente") ? nome => k.criarEtiqueta(nome) : false });

    const dono = ui.seletorPessoa({ usuarios: k.base.usuarios, valor: o.dono_id, rotulo: "Responsável", aoMudar: id => { o.dono_id = id; } });
    // plano 1500c · RC-173: continua vazio (escolha consciente), mas com o atalho «Eu» ao lado
    const euId = typeof k.eu === "function" ? k.eu() : null;
    const btEu = euId ? h("button", { type: "button", class: "bt bt-fant bt-p imp-dono-eu", on: { click: () => {
      o.dono_id = euId;
      const sel = dono.tagName === "SELECT" ? dono : dono.querySelector && dono.querySelector("select");
      if (sel) { sel.value = euId; try { sel.dispatchEvent(new Event("change", { bubbles: true })); } catch { /* ok */ } }
      ui.anunciar("Responsável: você.");
    } } }, "Eu") : null;

    // negócio por linha
    const neg = ui.campo({ tipo: "interruptor", nome: "negocio", rotulo: `Criar ${k.v.art("negocio") === "a" ? "uma" : "um"} ${k.v.min("negocio")} para cada linha`, valor: o.criarNegocio,
      desabilitado: semFunil,
      ajuda: semFunil ? `Crie um funil antes (Configurações → Funis e etapas) para criar ${k.v.min("negocios")} na importação.` : L.mapaTemNegocio(S.mapa) ? `Sua planilha tem título, valor ou etapa: eles vão para ${k.v.art("negocio")} ${k.v.min("negocio")}.` : `Útil para trazer uma lista de ${k.v.min("contatos")} já em andamento.` });
    const selFunil = h("select", { class: "sel", "aria-label": "Funil" }, funis.map(f => h("option", { value: f.id, selected: f.id === o.funil_id }, f.nome)));
    const selEtapa = h("select", { class: "sel", "aria-label": "Etapa" });
    const avisoAds = h("p", { class: "aviso aviso-aten" }, ui.icone("alerta"),
      h("span", null, `Esse funil conta nos anúncios: cada ${k.v.min("negocio")} importad${k.v.art("negocio")} entra como conversa de hoje (origem Importação) nos números de Anúncios. Para uma base antiga, prefira um funil fora dos anúncios.`));
    // o banco dispara as automações de "negócio criado" / "entrou na etapa" para cada negócio importado
    const avisoAuto = h("p", { class: "aviso" }, ui.icone("raio"),
      h("span", null, `Automações ligadas a «${k.v.min("negocio")} criad${k.v.art("negocio")}» ou à etapa escolhida rodam para cada linha importada. Se alguma envia mensagem, desligue-a antes de importar uma base antiga.`));
    const blocoNeg = h("div", { class: "imp-neg" },
      h("label", { class: "imp-neg-l" }, h("span", { class: "rotulo" }, "Funil"), selFunil),
      h("label", { class: "imp-neg-l" }, h("span", { class: "rotulo" }, "Etapa"), selEtapa), avisoAds, avisoAuto);
    // plano 1000b · RB-133: com «Criar …» desligado, as colunas de negócio mapeadas não entram — a tela diz quais (antes: descartadas em silêncio)
    const colsNeg = L.colunasNegocioMapeadas(S.mapa);
    const avisoIgnora = h("p", { class: "aviso aviso-aten imp-aviso-ignora", role: "status", hidden: true }, ui.icone("info"),
      h("span", null, colsNeg.length ? `${colsNeg.length === 1 ? "A coluna" : "As colunas"} ${L.juntarE(colsNeg)} ${colsNeg.length === 1 ? "vai ser ignorada" : "vão ser ignoradas"}: ligue «Criar ${k.v.art("negocio") === "a" ? "uma" : "um"} ${k.v.min("negocio")} para cada linha» para usá-${colsNeg.length === 1 ? "la" : "las"}.` : ""));
    function desenharEtapas() {
      avisoIgnora.hidden = !!o.criarNegocio || !colsNeg.length;
      const f = funis.find(x => x.id === o.funil_id);
      ui.limpar(selEtapa);
      const abertas = f ? f.estagios.filter(e => e.tipo === "aberto") : [];
      if (!abertas.some(e => e.id === o.estagio_id)) o.estagio_id = abertas[0] ? abertas[0].id : null;
      for (const e of abertas) selEtapa.appendChild(h("option", { value: e.id, selected: e.id === o.estagio_id }, e.nome));
      avisoAds.hidden = !(f && f.conta_no_ads);
      blocoNeg.hidden = !o.criarNegocio;
    }
    selFunil.addEventListener("change", () => { o.funil_id = selFunil.value; o.estagio_id = null; desenharEtapas(); desenharConferir(); });
    selEtapa.addEventListener("change", () => { o.estagio_id = selEtapa.value; desenharConferir(); });
    if (semFunil) { const x = neg.querySelector("input"); if (x) { x.checked = false; x.disabled = true; } }
    neg.querySelector("input").addEventListener("change", ev => { o.criarNegocio = !semFunil && ev.target.checked; desenharEtapas(); desenharConferir(); });
    desenharEtapas();

    // prévia das 5 primeiras linhas + contagem de problemas
    const problemas = problemasDoMapa();
    // plano 1000b · RB-087: a linha vazia é reconhecida pela constante da lógica, não por /ignorada/ no texto da mensagem
    const vazias = problemas.filter(p => L.linhaVazia(p)).length;
    const comProblema = problemas.filter(p => p.length && !L.linhaVazia(p)).length;
    const cols = [];
    const vistos = S.mapa.filter(Boolean);
    // plano 1500c · RC-167: TODOS os destinos mapeados na prévia (nascimento, documento, observação, campos personalizados…), na ordem do mapa
    for (const c of L.colunasPrevia(vistos, L.destinosImportacao(k.base.campos))) {
      const dest = c.dest;
      // C7: telefone de fora com «+» aparece como «+1 2125551234» (não no formato brasileiro); sem DDD brasileiro e sem «+», como foi digitado (com o aviso)
      cols.push({ chave: dest, rotulo: c.rotulo, render: l => (dest === "telefone" && l.telefone ? L.telefoneImportado(l.telefone, { fmtBR: ui.telBR }).texto
        : c.campo ? (l.campos && l.campos[c.campo]) || null : l[dest] || null) });
    }
    cols.push({ chave: "_sit", rotulo: "Situação", render: l => l._erros.length
      ? h("span", { class: "imp-erro-txt" }, l._erros.join(" · "))
      : h("span", { class: "imp-ok-txt" }, ui.icone("check"), "Pronta") });
    const numeroDa = i => (d.numeros && d.numeros[i]) || i + 2;
    cols.unshift({ chave: "_linha", rotulo: "Linha", render: l => h("span", { class: "mono" }, String(l._linha)) });
    const previa = ui.tabela({ rotulo: "Prévia das primeiras linhas", colunas: cols, chave: "_n",
      linhas: linhasMontadas.slice(0, 5).map((l, i) => ({ ...l, _n: i, _linha: numeroDa(i), _erros: problemas[i] })) });
    previa.el.classList.add("imp-previa");
    const marcarErros = () => { for (const tr of previa.el.querySelectorAll("tbody tr")) tr.classList.add("tr-erro"); };
    for (const [i, tr] of [...previa.el.querySelectorAll("tbody tr")].entries()) if (problemas[i] && problemas[i].length) tr.classList.add("tr-erro");
    // plano 1000 (CR-121): com centenas de linhas ruins, ver só as que têm problema (até 100) e baixar a lista inteira ANTES de importar
    const ruins = linhasMontadas.map((l, i) => ({ ...l, _n: i, _linha: numeroDa(i), _erros: problemas[i] })).filter(l => l._erros.length);
    let soRuins = false;
    const btRuins = ruins.length ? botao(`Ver só as linhas com problema (${ui.num(ruins.length)})`, "sec", () => {
      soRuins = !soRuins;
      previa.atualizar(soRuins ? ruins.slice(0, 100) : linhasMontadas.slice(0, 5).map((l, i) => ({ ...l, _n: i, _linha: numeroDa(i), _erros: problemas[i] })));
      if (soRuins) marcarErros(); else for (const [i, tr] of [...previa.el.querySelectorAll("tbody tr")].entries()) tr.classList.toggle("tr-erro", !!(problemas[i] && problemas[i].length));
      btRuins.textContent = soRuins ? "Ver as primeiras linhas" : `Ver só as linhas com problema (${ui.num(ruins.length)})`;
      btRuins.setAttribute("aria-pressed", String(soRuins));
      notaRuins.hidden = !(soRuins && ruins.length > 100);
    }, { "aria-pressed": "false" }) : null;
    const notaRuins = h("p", { class: "sub", hidden: true }, `Mostrando 100 de ${ui.num(ruins.length)}. Baixe a lista para ver todas.`);
    const btBaixarRuins = ruins.length ? botao("Baixar a lista de problemas", "fant", () => {
      const csv = L.gerarCSV(["linha", "problema"], ruins.map(l => [l._linha, l._erros.join(" · ")]));
      const url = URL.createObjectURL(new Blob([csv], { type: "text/csv;charset=utf-8" }));
      const a = h("a", { href: url, download: L.nomeArquivoImportacao ? L.nomeArquivoImportacao("problemas", S.arquivo && S.arquivo.nome, ui.hojeSP ? ui.hojeSP() : "") : "problemas-da-planilha.csv", hidden: true });      // plano 1500c · RX-069
      document.body.appendChild(a); a.click(); a.remove();
      setTimeout(() => URL.revokeObjectURL(url), 2000);
    }) : null;
    // plano 1000 (CR-118): a mesma pessoa duas vezes na planilha (telefone com/sem 55 e 9, ou e-mail) — a 2ª linha só atualizaria a 1ª
    const dups = L.duplicadosPlanilha(linhasMontadas, d.numeros);
    const avisoDup = dups.length ? h("p", { class: "aviso aviso-aten imp-aviso-dup" }, ui.icone("alerta"), h("span", null,
      // plano 1000b · RB-130: o termo da vertical («pacientes aparecem»)
      `${ui.num(dups.length)} ${dups.length === 1 ? `${k.v.min("contato")} aparece` : `${k.v.min("contatos")} aparecem`} mais de uma vez na planilha (a linha seguinte atualiza a anterior): `
      + dups.slice(0, 5).map(g => `${g.tipo === "telefone" ? "telefone" : "e-mail"} ${g.valor} nas linhas ${g.linhas.join(", ")}`).join("; ")
      + (dups.length > 5 ? `; e mais ${ui.num(dups.length - 5)}.` : "."))) : null;
    // plano 1000 (CR-123): etapas que não existem no funil escolhido (entram na 1ª etapa) e etiquetas que serão criadas — antes de importar
    const avisoConferir = h("div", { class: "imp-conferir" });
    function desenharConferir() {
      ui.limpar(avisoConferir);
      const f = k.funil(o.funil_id);
      const cf = conferirMemo(linhasMontadas, o.criarNegocio && f ? f.estagios : []);      // plano 1500c · RC-263
      const etapaPadrao = f ? (f.estagios.find(e => e.id === o.estagio_id) || f.estagios.find(e => e.tipo === "aberto") || {}).nome : null;
      if (o.criarNegocio && cf.etapasDesconhecidas.length) avisoConferir.appendChild(h("p", { class: "aviso aviso-aten imp-aviso-etapa" }, ui.icone("alerta"),
        h("span", null, `Etapa${cf.etapasDesconhecidas.length === 1 ? "" : "s"} da planilha que não ${cf.etapasDesconhecidas.length === 1 ? "existe" : "existem"} (aberta${cf.etapasDesconhecidas.length === 1 ? "" : "s"}) em «${f ? f.nome : "funil"}»: ${cf.etapasDesconhecidas.map(x => `«${x}»`).join(", ")}. ${cf.etapasDesconhecidas.length === 1 ? "Essa linha entra" : "Essas linhas entram"} em «${etapaPadrao || "1ª etapa"}».`)));
      // plano 1500c · RC-011: etapa de ganho/perda na planilha tem aviso próprio (não é «etapa que não existe»)
      if (o.criarNegocio && cf.avisos) for (const a of cf.avisos) avisoConferir.appendChild(h("p", { class: "aviso aviso-aten imp-aviso-fechada", dataset: { codigo: a.codigo } }, ui.icone("alerta"), h("span", null, a.texto)));
      // plano 1000b · RB-250: «VIP, Retorno» viraria UMA etiqueta — avisa para separar com «;»
      if (cf.etiquetasComVirgula && cf.etiquetasComVirgula.length) avisoConferir.appendChild(h("p", { class: "aviso aviso-aten imp-aviso-virgula" }, ui.icone("alerta"),
        h("span", null, `Etiquetas separadas por vírgula viram uma etiqueta só (ex.: «${cf.etiquetasComVirgula[0]}»). Para separar, use ; na planilha (VIP; Retorno).`)));
      if (cf.etiquetasNovas.length) avisoConferir.appendChild(h("p", { class: "aviso imp-aviso-etq" }, ui.icone("etiqueta"),
        h("span", null, `${cf.etiquetasNovas.length === 1 ? "Etiqueta nova que será criada" : "Etiquetas novas que serão criadas"}: ${cf.etiquetasNovas.slice(0, 12).map(x => `«${x}»`).join(", ")}${cf.etiquetasNovas.length > 12 ? ` e mais ${cf.etiquetasNovas.length - 12}` : ""}.`)));
    }

    const resumoPrevia = h("p", { class: ["aviso", comProblema || vazias ? "aviso-aten" : "aviso-ok"] }, ui.icone(comProblema || vazias ? "info" : "check"),
      h("span", null, comProblema || vazias
        ? `Das ${ui.num(linhasMontadas.length)} linhas, ${comProblema ? `${ui.num(comProblema)} ${comProblema === 1 ? "tem" : "têm"} algum dado com problema (a linha entra sem esse dado)` : ""}${comProblema && vazias ? " e " : ""}${vazias ? `${ui.num(vazias)} não ${vazias === 1 ? "tem" : "têm"} nome, telefone nem e-mail (${vazias === 1 ? "será pulada" : "serão puladas"})` : ""}.`
        : `As ${ui.num(linhasMontadas.length)} linhas estão prontas para entrar.`));
    // C7: número de outro país sem o «+» (DDD que não existe no Brasil) ganharia 55 e viraria um número inexistente — avisa quantas são e como corrigir
    const tels = linhasMontadas.map(l => L.telefoneImportado(l.telefone).tipo);
    const semPais = tels.filter(t => t === "sem_pais").length, exterior = tels.filter(t => t === "exterior").length;
    const avisoTel = semPais || exterior ? h("p", { class: ["aviso", semPais ? "aviso-aten" : "aviso-ok", "imp-aviso-tel"] }, ui.icone(semPais ? "alerta" : "globo"),
      h("span", null, [
        semPais ? `${ui.num(semPais)} ${semPais === 1 ? "linha tem" : "linhas têm"} telefone sem DDD brasileiro: se ${semPais === 1 ? "for" : "forem"} de fora do Brasil, escreva com + e o código do país na planilha (ex.: +1 212 555 1234). Como está, ${semPais === 1 ? "entra" : "entram"} sem telefone.` : null,
        exterior ? `${ui.num(exterior)} ${exterior === 1 ? "telefone de outro país (com +) entra" : "telefones de outros países (com +) entram"} como ${exterior === 1 ? "está" : "estão"}, sem o 55.` : null,
      ].filter(Boolean).join(" "))) : null;

    corpo.append(
      h("h2", { class: "imp-tit" }, "Como importar"),
      h("div", { class: "imp-opcoes" },
        h("div", { class: "pilha" }, atualizar,
          h("div", { class: "imp-grupo" }, h("span", { class: "rotulo" }, "Etiquetas para todos"), etiquetas),
          h("div", { class: "imp-grupo" }, h("span", { class: "rotulo" }, "Responsável"), h("div", { class: "linha imp-dono" }, dono, btEu),
            h("small", { class: "campo-ajuda" }, `Sem responsável: todo mundo da equipe vê ${k.v.art("contato") === "a" ? "as novas" : "os novos"} ${k.v.min("contatos")}.`))),
        h("div", { class: "pilha" }, neg, avisoIgnora, blocoNeg)),
      ...[h("h3", { class: "imp-sub" }, "Prévia"), resumoPrevia, avisoTel, avisoDup, avisoConferir,
        btRuins || btBaixarRuins ? h("div", { class: "linha imp-ruins" }, btRuins, btBaixarRuins) : null, previa.el, notaRuins].filter(Boolean));
    desenharConferir();
    rodape.append(botao("Voltar", "sec", () => ir(2)), botao("Continuar", "prim", () => ir(4)));
  }

  /* ------------------------------------------------------------ 4. importar */
  function passoImportar() {
    const total = S.dados.linhas.length;
    const barra = h("div", { class: "imp-barra", role: "progressbar", "aria-valuemin": "0", "aria-valuemax": String(total), "aria-valuenow": "0", "aria-label": "Progresso da importação" }, h("i"));
    const pctTxt = h("b", { class: "imp-barra-pct dado" }, "0%");
    const barraLinha = h("div", { class: "imp-barra-linha" }, barra, pctTxt);
    // plano 1500c · RC-168: o texto NÃO é região viva (20.000 linhas = 200 anúncios); o leitor ouve a cada 10%, na pausa e no fim (ui.anunciar)
    const texto = h("p", { class: "imp-prog-txt" });
    const resultado = h("div", { class: "pilha" });
    // plano 1500c · RC-176: a pausa espera uma Promise que o «Continuar»/«Parar» resolve (antes: laço de 200 ms gastando bateria)
    let soltarPausa = null;
    const esperarRetomar = () => new Promise(r => { soltarPausa = r; });
    const retomar = () => { if (soltarPausa) { const f = soltarPausa; soltarPausa = null; f(); } };
    S.retomar = retomar;
    const btPausar = botao("Pausar", "sec", () => {
      S.pausado = !S.pausado;
      btPausar.textContent = S.pausado ? "Continuar" : "Pausar";
      if (!S.pausado) retomar();
      atualizarBarra();
      ui.anunciar(S.pausado ? `Importação pausada em ${ui.num(S.feitas)} de ${ui.num(total)} linhas.` : "Importação retomada.");
    }, { hidden: true });
    // plano 1000b · RB-128: «Parar aqui» — encerra depois do lote em curso e mostra o resumo do que entrou (com «Tentar o restante»)
    const btParar = botao("Parar aqui", "fant", () => { S.parado = true; S.cancelado = true; S.pausado = false; btParar.disabled = true; retomar(); atualizarTexto(); }, { hidden: true });
    // plano 1500c · RC-171: as linhas vazias (sem nome, telefone e e-mail) não contam no botão — são citadas à parte
    const nVazias = S.feitas > 0 ? 0 : problemasDoMapa().filter(p => L.linhaVazia(p)).length;
    const faltam = total - S.feitas;
    const uteis = total - nVazias;
    const btIniciar = botao(S.feitas > 0 ? `Importar ${faltam === 1 ? "a linha que falta" : `as ${ui.num(faltam)} linhas que faltam`}`
      : `Importar ${ui.num(uteis)} linha${uteis === 1 ? "" : "s"}`, "prim", () => iniciar());
    const btVoltar = botao("Voltar", "sec", () => ir(3));
    const o = S.opcoes;
    const f = k.funil(o.funil_id);
    const etapa = o.estagio_id ? k.estagio(o.estagio_id) : null;
    const lista = [
      `${ui.num(uteis)} linha${uteis === 1 ? "" : "s"} de «${S.arquivo.nome}»${nVazias ? ` (${ui.num(nVazias)} vazia${nVazias === 1 ? "" : "s"} ${nVazias === 1 ? "será pulada" : "serão puladas"})` : ""}`,      // plano 1500c · RC-171
      o.atualizar ? "quem já existe é atualizado" : "quem já existe é pulado",
      o.etiquetas.length ? `etiquetas: ${o.etiquetas.map(id => (k.etiqueta(id) || {}).nome).filter(Boolean).join(", ")}` : null,
      `responsável: ${o.dono_id ? (k.usuario(o.dono_id) || {}).nome || "—" : "ninguém"}`,
      o.criarNegocio && f ? `${k.v.art("negocio") === "a" ? "uma" : "um"} ${k.v.min("negocio")} em «${f.nome} → ${etapa ? etapa.nome : "1ª etapa"}» para cada linha` : null,
    ].filter(Boolean);

    corpo.append(
      h("h2", { class: "imp-tit" }, S.terminou ? "Importação concluída" : "Tudo pronto"),
      h("ul", { class: "imp-lista", hidden: S.rodando || S.terminou }, lista.map(t => h("li", null, t))),
      h("div", { class: "imp-prog", hidden: !S.rodando && !S.terminou }, barraLinha, texto),
      resultado);
    rodape.append(btVoltar, h("div", { class: "linha" }, btParar, btPausar, btIniciar));

    function atualizarBarra() {
      const p = total ? Math.round((S.feitas / total) * 100) : 100;
      barra.querySelector("i").style.setProperty("--p", `${p}%`);
      barra.setAttribute("aria-valuenow", String(S.feitas));
      barra.setAttribute("aria-valuetext", `${p}% — ${ui.num(S.feitas)} de ${ui.num(total)} linhas`);
      pctTxt.textContent = `${p}%`;
      // listras em movimento só enquanto importa (param na pausa e no fim; somem com movimento reduzido pelo CSS)
      barra.classList.toggle("andando", S.rodando && !S.pausado && !S.terminou);
      barra.classList.toggle("pronta", S.terminou && !S.erroFatal);
      atualizarTexto();
    }
    function atualizarTexto() {
      texto.textContent = S.terminou ? `${ui.num(S.feitas)} de ${ui.num(total)} linhas processadas.`
        : S.pausado && S.semRede ? `Sem internet: pausado em ${ui.num(S.feitas)} de ${ui.num(total)} linhas. Continua sozinho quando a conexão voltar.`     // plano 1500c · RC-332
        : S.pausado ? `Pausado em ${ui.num(S.feitas)} de ${ui.num(total)} linhas. Nada se perde: continue quando quiser.`
        : S.parado ? `Parando em ${ui.num(S.feitas)} de ${ui.num(total)} linhas…`
        : `Importando… ${ui.num(S.feitas)} de ${ui.num(total)} linhas.${(est => (est ? ` Falta ${est}.` : ""))(L.estimativaRestante(S.msGastos, S.feitasNaVez, total - S.feitas))}`;      // plano 1000b · RB-211: sem o jargão «lotes de 100»; plano 1500c · RC-169: estimativa
    }

    async function iniciar() {
      if (S.rodando) return;
      S.rodando = true; S.pausado = false; S.cancelado = false; S.erroFatal = null; S.parado = false; S.loteIncerto = null;
      corpo.querySelector(".imp-lista").hidden = true;
      corpo.querySelector(".imp-prog").hidden = false;
      btIniciar.hidden = true; btVoltar.hidden = true; btPausar.hidden = false; btParar.hidden = false; btParar.disabled = false;
      const linhas = linhasDoMapa().map((l, i) => ({ ...l, _linha: (S.dados.numeros && S.dados.numeros[i]) || i + 2 }));
      const opcoes = { atualizar: !!o.atualizar, etiquetas: o.etiquetas, arquivo: String(S.arquivo.nome || "").slice(0, 200),
        ...(o.dono_id ? { dono_id: o.dono_id } : {}),
        ...(o.criarNegocio && o.funil_id ? { negocio: { funil_id: o.funil_id, ...(o.estagio_id ? { estagio_id: o.estagio_id } : {}) } } : {}) };
      let i = S.feitas;
      S.resumo = S.resumo || { criados: 0, atualizados: 0, ignorados: 0, erros: [], avisos: [] };
      S.msGastos = 0; S.feitasNaVez = 0;      // plano 1500c · RC-169: base da estimativa (só o que foi feito nesta rodada)
      // plano 1500c · RC-332: sem internet a importação PAUSA (não termina com erro) e continua sozinha no evento «online», do mesmo lote e com a mesma importacao_id
      const offline = () => typeof navigator !== "undefined" && navigator && navigator.onLine === false;
      const pausarSemRede = () => {
        S.semRede = true; S.pausado = true; btPausar.textContent = "Continuar";
        atualizarBarra();
        ui.anunciar(`Sem internet: importação pausada em ${ui.num(S.feitas)} de ${ui.num(total)} linhas. Continua quando a conexão voltar.`);
      };
      const aoVoltarRede = () => {
        if (!S.semRede) return;
        S.semRede = false;
        if (S.pausado && S.vivo && !S.cancelado) { S.pausado = false; btPausar.textContent = "Pausar"; ui.anunciar("Conexão de volta: importação retomada."); retomar(); }
      };
      const janela = typeof globalThis !== "undefined" ? globalThis : null;      // no navegador, a janela
      if (janela && janela.addEventListener) janela.addEventListener("online", aoVoltarRede);
      atualizarBarra();
      while (i < linhas.length && S.vivo && !S.cancelado) {
        if (offline() && !S.pausado) pausarSemRede();      // plano 1500c · RC-332
        while (S.pausado && S.vivo && !S.cancelado) await esperarRetomar();      // plano 1500c · RC-176
        if (S.cancelado) break;
        if (!S.vivo) break;
        const lote = linhas.slice(i, i + S.lote);
        try {
          const t0 = Date.now();
          const r = await k.api.rpcC("nx_contatos_importar", { p_linhas: lote, p_opcoes: { ...opcoes, importacao_id: S.imp } });
          S.msGastos += Date.now() - t0; S.feitasNaVez += lote.length;
          S.imp = r.importacao_id || S.imp;
          S.resumo = L.somarImportacao(S.resumo, r);
          const marco = L.marcoProgresso(i, i + lote.length, total);      // plano 1500c · RC-168
          i += lote.length; S.feitas = i;
          atualizarBarra();
          if (marco) ui.anunciar(`${marco}% importado.`);
        } catch (e) {
          if (e && e.codigo === "tempo_esgotado" && S.lote > 10) { S.lote = L.metadeLote(S.lote); atualizarTexto(); continue; }
          if (offline() && S.vivo && !S.cancelado) { pausarSemRede(); continue; }      // plano 1500c · RC-332: a rede caiu no meio do lote — espera e reenvia o MESMO lote
          S.erroFatal = e;
          // plano 1000b · RB-127: erro ambíguo (rede caiu, 502–504) — o servidor pode ter aplicado ESTE lote; a tela diz quais linhas conferir
          if (L.erroAmbiguo(e) && lote.length) S.loteIncerto = { de: lote[0]._linha, ate: lote[lote.length - 1]._linha, linhas: lote };
          break;
        }
      }
      if (janela && janela.removeEventListener) janela.removeEventListener("online", aoVoltarRede);      // plano 1500c · RC-332
      S.semRede = false;
      S.rodando = false;
      S.terminou = true;
      btPausar.hidden = true; btParar.hidden = true;
      corpo.querySelector("h2").textContent = S.erroFatal ? "Importação interrompida" : S.parado && S.feitas < total ? "Importação parada" : "Importação concluída";
      atualizarBarra();
      if (S.resumo.criados || S.resumo.atualizados) k.recarregarBase().catch(() => {});
      desenharResultado();
      ui.anunciar(`Importação ${S.erroFatal ? "interrompida" : S.parado && S.feitas < total ? "parada" : "concluída"}: ${L.textoResumoImportacao(S.resumo)}.`);
      // plano 1500c · RC-170: terminou com a aba escondida — o título da aba avisa até a pessoa voltar
      try {
        if (typeof document !== "undefined" && document.hidden) {
          const tituloAntes = document.title;
          document.title = S.erroFatal ? "! Importação interrompida" : "✓ Importação concluída";
          const voltar = () => { if (!document.hidden) { document.title = tituloAntes; document.removeEventListener("visibilitychange", voltar); } };
          document.addEventListener("visibilitychange", voltar);
        }
      } catch { /* ok */ }
    }

    function desenharResultado() {
      ui.limpar(resultado);
      const s = S.resumo;
      resultado.append(h("div", { class: "imp-res" },
        h("div", { class: "ok" }, h("b", null, ui.num(s.criados)), h("span", null, `criad${k.v.art("contato")}s`)),
        h("div", null, h("b", null, ui.num(s.atualizados)), h("span", null, `atualizad${k.v.art("contato")}s`)),
        h("div", null, h("b", null, ui.num(s.ignorados)), h("span", null, "pulados")),
        h("div", { class: s.erros.length ? "ruim" : null }, h("b", null, ui.num(s.erros.length)), h("span", null, s.erros.length === 1 ? "erro" : "erros"))));
      if (S.erroFatal) {
        const inc = S.loteIncerto;
        resultado.append(h("p", { class: "aviso aviso-ruim", role: "alert" }, ui.icone("alerta"),
          h("span", null, inc
            // plano 1000b · RB-127: com a conexão caindo no meio, o último lote pode ter entrado — reenviar sem conferir duplicaria negócios
            ? `${k.erro(S.erroFatal)} As linhas ${inc.de}–${inc.ate} podem ter entrado; confira antes de tentar o restante. O que entrou antes delas ficou salvo (${ui.num(S.feitas)} de ${ui.num(total)} linhas).`
            : `${k.erro(S.erroFatal)} O que já entrou ficou salvo (${ui.num(S.feitas)} de ${ui.num(total)} linhas).`)));
        if (inc) resultado.append(h("div", { class: "linha imp-incerto" }, botao(`Baixar as linhas ${inc.de}–${inc.ate}`, "sec", () => baixarIncertas(inc))));
      } else if (S.parado && S.feitas < total) {
        resultado.append(h("p", { class: "aviso aviso-aten", role: "status" }, ui.icone("info"),
          h("span", null, `Importação parada em ${ui.num(S.feitas)} de ${ui.num(total)} linhas. O que entrou ficou salvo; o restante pode ser importado depois.`)));      // plano 1000b · RB-128
      }
      const problemas = [...s.erros.map(x => ({ ...x, tipo: "Erro" })), ...s.avisos.map(x => ({ ...x, tipo: "Aviso" }))]
        .sort((a, b) => (a.linha || 0) - (b.linha || 0));
      if (problemas.length) {
        const lista = h("ul", { class: "imp-problemas" });
        const nota = h("p", { class: "sub", hidden: true });
        // plano 1500c · RC-178: abas «Não entraram» / «Entraram com aviso» com a contagem de cada (antes: 60 misturados)
        let filtroTipo = s.erros.length ? "Erro" : "Aviso";
        const pintarLista = () => {
          const vis = problemas.filter(p => p.tipo === filtroTipo);
          ui.limpar(lista);
          for (const p of vis.slice(0, 60)) lista.appendChild(h("li", { class: p.tipo === "Erro" ? "erro" : null }, h("span", { class: "mono" }, `linha ${p.linha}`), h("span", null, p.motivo)));
          nota.hidden = vis.length <= 60;
          nota.textContent = vis.length > 60 ? `Mostrando 60 de ${vis.length}. Baixe o CSV para ver todas.` : "";
        };
        const abasTipo = s.erros.length && s.avisos.length ? ui.segmentado({ rotulo: "Tipo de observação", classe: "imp-abas-prob", valor: filtroTipo,
          opcoes: [{ valor: "Erro", rotulo: `Não entraram (${ui.num(s.erros.length)})` }, { valor: "Aviso", rotulo: `Entraram com aviso (${ui.num(s.avisos.length)})` }],
          aoMudar: v => { filtroTipo = v; pintarLista(); } }) : null;
        pintarLista();
        resultado.append(h("details", { class: "imp-det", open: s.erros.length > 0 },
          h("summary", null, `${problemas.length} linha${problemas.length === 1 ? "" : "s"} com observação${s.erros.length ? ` (${s.erros.length === 1 ? "1 não entrou" : `${s.erros.length} não entraram`})` : ""}`),
          abasTipo, lista, nota,
          h("div", { class: "linha" }, botao("Baixar erros em CSV", "sec", () => baixar(problemas)))));
      }
      ui.limpar(rodape);
      rodape.append(
        // plano 1000 (CR-127): a próxima importação começa limpa — etiquetas, responsável e o negócio da anterior não vão junto sem aviso
        botao("Importar outra planilha", "sec", () => { Object.assign(S, { dados: null, arquivo: null, mapa: [], resumo: null, feitas: 0, terminou: false, erroFatal: null, lote: 100, imp: null, parado: false, cancelado: false, loteIncerto: null,
          opcoes: { atualizar: false, etiquetas: [], dono_id: null, criarNegocio: false, funil_id: null, estagio_id: null } }); ir(1); }),
        (S.erroFatal || S.parado) && S.feitas < total
          ? botao("Tentar o restante", "prim", () => { S.terminou = false; S.erroFatal = null; S.parado = false; S.cancelado = false; ir(4); })      // plano 1000b · RB-128: também depois de «Parar aqui»
          // plano 1000 (CR-126): o atalho abre a lista de QUEM ENTROU (origem importação, cadastrados hoje e a etiqueta escolhida, se for uma só)
          // plano 1000b · RB-132: o filtro mostra só os NOVOS — o rótulo diz isso («Ver os 3 novos»); sem novos, abre a lista inteira
          : s.criados ? h("a", { class: "bt bt-prim imp-ver-quem", href: `#/contatos?origem=importacao&criado_de=${encodeURIComponent(ui.hojeSP())}${o.etiquetas.length === 1 ? `&etiqueta=${encodeURIComponent(o.etiquetas[0])}` : ""}` },
            s.criados === 1 ? `Ver ${k.v.art("contato")} nov${k.v.art("contato")}` : `Ver ${k.v.art("contato")}s ${ui.num(s.criados)} nov${k.v.art("contato")}s`)
            : h("a", { class: "bt bt-prim imp-ver-quem", href: "#/contatos" }, `Ver ${k.v.min("contatos")}`));
      if (s.criados && s.atualizados) resultado.append(h("p", { class: "sub imp-nota-atual" },
        `${s.atualizados === 1 ? `${k.v.art("contato") === "a" ? "A" : "O"} atualizad${k.v.art("contato")} mantém` : `${k.v.art("contato") === "a" ? "As" : "Os"} ${ui.num(s.atualizados)} atualizad${k.v.art("contato")}s mantêm`} a origem de antes e não ${s.atualizados === 1 ? "aparece" : "aparecem"} nessa lista.`));
    }

    /** plano 1000b · RB-127: as linhas do lote incerto num CSV (para conferir na lista antes de reenviar). */
    function baixarIncertas(inc) {
      const cab = ["linha", "nome", "telefone", "email"];
      const csv = L.gerarCSV(cab, inc.linhas.map(l => [l._linha, l.nome || "", l.telefone || "", l.email || ""]));
      const url = URL.createObjectURL(new Blob([csv], { type: "text/csv;charset=utf-8" }));
      const a = h("a", { href: url, download: `linhas-${inc.de}-a-${inc.ate}-para-conferir.csv`, hidden: true });
      document.body.appendChild(a); a.click(); a.remove();
      setTimeout(() => URL.revokeObjectURL(url), 2000);
    }

    function baixar(problemas) {
      const csv = L.gerarCSV(["linha", "tipo", "motivo"], problemas.map(p => [p.linha, p.tipo, p.motivo]));
      const url = URL.createObjectURL(new Blob([csv], { type: "text/csv;charset=utf-8" }));
      const a = h("a", { href: url, download: L.nomeArquivoImportacao ? L.nomeArquivoImportacao("erros", S.arquivo && S.arquivo.nome, ui.hojeSP ? ui.hojeSP() : "") : "erros-da-importacao.csv", hidden: true });      // plano 1500c · RX-069
      document.body.appendChild(a); a.click(); a.remove();
      setTimeout(() => URL.revokeObjectURL(url), 2000);
    }

    if (S.terminou) { atualizarBarra(); desenharResultado(); }
  }

  ir(1);
  return {
    desmontar() {
      // plano 1000 (CR-117): sair pelo menu no meio da importação não pode parar «em silêncio» — o aviso diz até onde foi e como continuar
      // (a pergunta ANTES de sair depende de uma guarda de rota do shell: pendência registrada para a frente sis)
      if (S.rodando && !S.terminou) {
        const total = S.dados ? S.dados.linhas.length : 0;
        ui.toast(`Importação parada em ${ui.num(S.feitas)} de ${ui.num(total)} linhas porque você saiu da tela. O que entrou ficou salvo; importe o restante pela planilha.`, { tipo: "aten", ms: 10000 });
      }
      S.vivo = false; S.cancelado = true;
      if (typeof S.retomar === "function") S.retomar();      // plano 1500c · RC-176: solta a espera da pausa
      pararJanela();
      removeEventListener("beforeunload", antesDeSair);
      if (typeof soltarNaoAtualizar === "function") soltarNaoAtualizar();
    },
  };
}
