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

  const passosEl = h("ol", { class: "imp-passos", "aria-label": "Passos da importação" });
  const corpo = h("section", { class: "cartao imp-corpo", "aria-live": "polite" });
  const rodape = h("div", { class: "imp-rod" });
  el.append(
    ui.cabecalho({ titulo: `Importar ${v.min("contatos")}`, sub: "Traga a sua planilha. Quem já existe é reconhecido pelo telefone (com ou sem 55 e 9) ou pelo e-mail.",
      acoes: h("a", { class: "bt bt-sec", href: "#/contatos" }, ui.icone("seta-esq"), v.contatos) }),
    passosEl, corpo, rodape);

  // não perder uma importação no meio sem aviso
  const antesDeSair = ev => { if (S.rodando) { ev.preventDefault(); ev.returnValue = ""; } };
  addEventListener("beforeunload", antesDeSair);

  function desenharPassos() {
    ui.limpar(passosEl);
    for (const p of PASSOS) {
      passosEl.appendChild(h("li", { class: ["imp-passo", p.id < S.passo && "feito"], "aria-current": p.id === S.passo ? "step" : null }, p.rotulo));
    }
  }

  function ir(passo) {
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

  const botao = (rotulo, tipo, fn, extra = {}) => h("button", { type: "button", class: ["bt", tipo === "prim" ? "bt-prim" : tipo === "fant" ? "bt-fant" : "bt-sec"], on: { click: fn }, ...extra }, rotulo);

  /* ------------------------------------------------------------ 1. arquivo */
  function passoArquivo() {
    const entrada = h("input", { type: "file", accept: ".csv,.txt,text/csv,text/plain", class: "sr-only", id: "imp-arquivo" });
    const solta = h("label", { class: "imp-solta", for: "imp-arquivo" },
      ui.icone("clipe"),
      h("b", null, "Arraste o arquivo aqui ou clique para escolher"),
      h("p", null, "Aceita .csv (separado por ponto e vírgula, vírgula ou tabulação). No Excel ou no Google Planilhas: Arquivo → Salvar como / Fazer download → CSV. Até 20.000 linhas por arquivo."));
    const status = h("div", { class: "imp-arq", hidden: true });
    const avisoCortado = h("p", { class: "aviso aviso-aten imp-aviso", hidden: true }, ui.icone("alerta"), h("span"));
    const colar = h("textarea", { rows: 6, placeholder: "Nome\tTelefone\tE-mail\nAna Souza\t(12) 99830-3030\tana@exemplo.com.br", "aria-label": "Colar linhas da planilha" });
    const usarColado = botao("Usar o texto colado", "sec", () => {
      if (!colar.value.trim()) { ui.toast("Cole as linhas da planilha, com o cabeçalho na primeira linha.", { tipo: "info" }); colar.focus(); return; }
      carregarTexto(colar.value, { nome: "Colado do Excel", tamanho: colar.value.length, codificacao: "utf-8" });
    });
    const colarBloco = h("details", { class: "imp-colar" },
      h("summary", null, "Ou cole direto do Excel"),
      h("div", { class: "pilha-p" }, h("p", { class: "sub" }, "Selecione as células no Excel (com a linha do cabeçalho), copie e cole aqui."), colar, h("div", { class: "linha" }, usarColado)));

    entrada.addEventListener("change", () => { if (entrada.files && entrada.files[0]) lerArquivo(entrada.files[0]); });
    for (const ev of ["dragenter", "dragover"]) solta.addEventListener(ev, e => { e.preventDefault(); solta.classList.add("sobre"); });
    for (const ev of ["dragleave", "drop"]) solta.addEventListener(ev, e => { e.preventDefault(); solta.classList.remove("sobre"); });
    solta.addEventListener("drop", e => { const f = e.dataTransfer && e.dataTransfer.files && e.dataTransfer.files[0]; if (f) lerArquivo(f); });

    async function lerArquivo(f) {
      if (f.size > 25 * 1024 * 1024) { ui.toast("Arquivo grande demais (até 25 MB). Divida a planilha em partes.", { tipo: "erro" }); return; }
      if (!/\.(csv|txt)$/i.test(f.name) && !/text|csv/.test(f.type || "")) {
        ui.toast("Esse arquivo não parece um CSV. No Excel, use Salvar como → CSV (separado por vírgulas ou ponto e vírgula).", { tipo: "erro", ms: 8000 });
        return;
      }
      try {
        const bytes = new Uint8Array(await f.arrayBuffer());
        const d = L.decodificarArquivo(bytes);
        carregarTexto(d.texto, { nome: f.name, tamanho: f.size, codificacao: d.codificacao });
      } catch (e) {
        console.error(e);
        ui.toast("Não foi possível ler o arquivo. Tente salvar de novo como CSV.", { tipo: "erro" });
      }
    }

    function carregarTexto(texto, info) {
      const d = L.lerCSV(texto, { limite: LIMITE_LINHAS });
      if (!d.cabecalho.length || !d.linhas.length) {
        S.dados = null; S.arquivo = null;
        mostrarStatus();
        ui.toast("Não achamos linhas nessa planilha. A primeira linha precisa ser o cabeçalho (Nome, Telefone…).", { tipo: "erro", ms: 8000 });
        return;
      }
      S.arquivo = info; S.dados = d;
      S.mapa = L.sugerirMapeamento(d.cabecalho, k.base.campos);
      S.opcoes.criarNegocio = L.mapaTemNegocio(S.mapa);
      S.resumo = null; S.feitas = 0; S.terminou = false; S.erroFatal = null; S.imp = null;
      mostrarStatus();
      ui.anunciar(`${d.linhas.length} linhas encontradas.`);
    }

    function mostrarStatus() {
      ui.limpar(status);
      status.hidden = !S.dados;
      if (!S.dados) { avisoCortado.hidden = true; continuar.disabled = true; return; }
      const d = S.dados;
      const sepNome = { ";": "ponto e vírgula", ",": "vírgula", "\t": "tabulação" }[d.separador] || d.separador;
      status.append(
        h("span", { class: "imp-arq-ic", "aria-hidden": "true" }, ui.icone("check")),
        h("div", null,
          h("b", null, S.arquivo.nome),
          h("small", null, `${ui.num(d.linhas.length)} linha${d.linhas.length === 1 ? "" : "s"} · ${d.cabecalho.length} coluna${d.cabecalho.length === 1 ? "" : "s"} · separador ${sepNome}${S.arquivo.codificacao === "windows-1252" ? " · acentos convertidos do Excel" : ""}`)),
        h("button", { type: "button", class: "bt bt-fant bt-p", on: { click: () => { S.dados = null; S.arquivo = null; entrada.value = ""; mostrarStatus(); } } }, "Trocar"));
      avisoCortado.hidden = !d.cortado;
      avisoCortado.querySelector("span").textContent = d.cortado ? `A planilha tem ${ui.num(d.total)} linhas; vamos importar as primeiras ${ui.num(LIMITE_LINHAS)}. Importe o restante num segundo arquivo.` : "";
      continuar.disabled = false;
    }

    const continuar = botao("Continuar", "prim", () => ir(2), { disabled: true });
    corpo.append(h("h2", { class: "imp-tit" }, "Escolha a planilha"), entrada, solta, status, avisoCortado, colarBloco);
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

    d.cabecalho.forEach((col, i) => {
      const exemplos = d.linhas.map(l => l[i]).filter(x => x && x.trim()).slice(0, 3);
      const sel = h("select", { "aria-label": `Destino da coluna ${col || i + 1}` },
        h("option", { value: "" }, "Ignorar coluna"),
        h("optgroup", { label: "Cadastro" }, destinos.filter(x => !x.valor.startsWith("campo:") && !["negocio_titulo", "negocio_valor", "estagio"].includes(x.valor))
          .map(x => h("option", { value: x.valor }, x.rotulo))),
        h("optgroup", { label: k.v.negocio }, destinos.filter(x => ["negocio_titulo", "negocio_valor", "estagio"].includes(x.valor)).map(x => h("option", { value: x.valor }, x.rotulo))),
        destinos.some(x => x.valor.startsWith("campo:"))
          ? h("optgroup", { label: "Campos personalizados" }, destinos.filter(x => x.valor.startsWith("campo:")).map(x => h("option", { value: x.valor }, x.rotulo.replace(/^Campo: /, ""))))
          : null);
      sel.value = S.mapa[i] || "";
      const linha = h("div", { class: ["imp-mapa-l", !S.mapa[i] && "ignorada"], role: "listitem" },
        h("div", { class: "imp-mapa-col" }, h("b", null, col || `Coluna ${i + 1}`), h("small", null, exemplos.length ? exemplos.join(" · ") : "(vazia)")),
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
      subTxt.textContent = `Sugerimos pelo nome do cabeçalho — confira. ${nMap()} de ${d.cabecalho.length} colunas reconhecidas. Colunas ignoradas não entram.`;
      const cab = L.cabecalhoPrevia(d.cabecalho, S.mapa, destinos);
      previa.appendChild(h("div", { class: "tabela-env imp-previa-cx" }, h("table", { class: "tabela imp-previa imp-previa-mapa" },
        h("caption", { class: "sr-only" }, "Prévia das 3 primeiras linhas com o destino de cada coluna"),
        h("thead", null, h("tr", null, cab.map(c => h("th", { scope: "col", class: ["imp-th", c.destino ? "mapeada" : "ignorada"] },
          h("span", { class: "imp-th-col" }, c.coluna), h("span", { class: "imp-th-dest" }, ui.icone(c.destino ? "seta-dir" : "fechar"), c.rotulo))))),
        h("tbody", null, d.linhas.slice(0, 3).map(l => h("tr", null, cab.map(c => h("td", { class: c.destino ? null : "ignorada" }, (l[c.i] || "").trim() || "—"))))))));
    }
    function validar() {
      const ok = L.mapaValido(S.mapa);
      aviso.hidden = ok;
      continuar.disabled = !ok;
      desenharPrevia();
      return ok;
    }
    const continuar = botao("Continuar", "prim", () => { if (validar()) { if (L.mapaTemNegocio(S.mapa)) S.opcoes.criarNegocio = true; ir(3); } });
    corpo.append(
      h("h2", { class: "imp-tit" }, "O que é cada coluna?"),
      subTxt,
      lista, aviso,
      h("h3", { class: "imp-sub" }, "Como vai ficar"), previa);
    rodape.append(botao("Voltar", "sec", () => ir(1)), continuar);
    validar();
  }

  /* ------------------------------------------------------------ 3. opções + prévia */
  function passoOpcoes() {
    const o = S.opcoes;
    const d = S.dados;
    const linhasMontadas = L.montarLinhas(d.linhas, S.mapa);
    const funis = k.base.funis.filter(f => f.ativo !== false);
    if (!o.funil_id || !funis.some(f => f.id === o.funil_id)) o.funil_id = (funis.find(f => !f.conta_no_ads) || k.funilPadrao() || funis[0] || {}).id || null;

    const atualizar = ui.campo({ tipo: "interruptor", nome: "atualizar", rotulo: "Atualizar quem já existe", valor: o.atualizar,
      ajuda: "Ligado: quando o telefone ou o e-mail já estiverem cadastrados, completamos o cadastro com os dados da planilha (nome, cidade, etiquetas…). Desligado: a linha é pulada." });
    atualizar.querySelector("input").addEventListener("change", ev => { o.atualizar = ev.target.checked; });

    const etiquetas = ui.seletorEtiquetas({ todas: k.base.etiquetas, marcadas: o.etiquetas, rotulo: "Etiquetas para todos",
      aoMudar: ids => { o.etiquetas = ids; }, podeCriar: k.pode("atendente") ? nome => k.criarEtiqueta(nome) : false });

    const dono = ui.seletorPessoa({ usuarios: k.base.usuarios, valor: o.dono_id, rotulo: "Responsável", aoMudar: id => { o.dono_id = id; } });

    // negócio por linha
    const neg = ui.campo({ tipo: "interruptor", nome: "negocio", rotulo: `Criar ${k.v.art("negocio") === "a" ? "uma" : "um"} ${k.v.min("negocio")} para cada linha`, valor: o.criarNegocio,
      ajuda: L.mapaTemNegocio(S.mapa) ? `Sua planilha tem título, valor ou etapa: eles vão para ${k.v.art("negocio")} ${k.v.min("negocio")}.` : `Útil para trazer uma lista de ${k.v.min("contatos")} já em andamento.` });
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
    function desenharEtapas() {
      const f = funis.find(x => x.id === o.funil_id);
      ui.limpar(selEtapa);
      const abertas = f ? f.estagios.filter(e => e.tipo === "aberto") : [];
      if (!abertas.some(e => e.id === o.estagio_id)) o.estagio_id = abertas[0] ? abertas[0].id : null;
      for (const e of abertas) selEtapa.appendChild(h("option", { value: e.id, selected: e.id === o.estagio_id }, e.nome));
      avisoAds.hidden = !(f && f.conta_no_ads);
      blocoNeg.hidden = !o.criarNegocio;
    }
    selFunil.addEventListener("change", () => { o.funil_id = selFunil.value; o.estagio_id = null; desenharEtapas(); });
    selEtapa.addEventListener("change", () => { o.estagio_id = selEtapa.value; });
    neg.querySelector("input").addEventListener("change", ev => { o.criarNegocio = ev.target.checked; desenharEtapas(); });
    desenharEtapas();

    // prévia das 5 primeiras linhas + contagem de problemas
    const problemas = linhasMontadas.map(l => L.checarLinha(l));
    const vazias = problemas.filter(p => p.length && /ignorada/.test(p[0])).length;
    const comProblema = problemas.filter(p => p.length && !/ignorada/.test(p[0])).length;
    const cols = [];
    const vistos = S.mapa.filter(Boolean);
    const rot = { nome: "Nome", telefone: "Telefone", email: "E-mail", empresa: "Empresa", cidade: "Cidade", uf: "UF", etiquetas: "Etiquetas", negocio_valor: "Valor", estagio: "Etapa" };
    for (const dest of ["nome", "telefone", "email", "empresa", "cidade", "uf", "etiquetas", "negocio_valor", "estagio"]) {
      if (!vistos.includes(dest)) continue;
      cols.push({ chave: dest, rotulo: rot[dest], render: l => dest === "telefone" && l.telefone ? (L.normalizarTelefone(l.telefone) ? ui.telBR(L.normalizarTelefone(l.telefone)) : l.telefone) : l[dest] || null });
    }
    cols.push({ chave: "_sit", rotulo: "Situação", render: l => l._erros.length
      ? h("span", { class: "imp-erro-txt" }, l._erros.join(" · "))
      : h("span", { class: "imp-ok-txt" }, ui.icone("check"), "Pronta") });
    const previa = ui.tabela({ rotulo: "Prévia das primeiras linhas", colunas: cols, chave: "_n",
      linhas: linhasMontadas.slice(0, 5).map((l, i) => ({ ...l, _n: i, _erros: problemas[i] })) });
    previa.el.classList.add("imp-previa");
    for (const [i, tr] of [...previa.el.querySelectorAll("tbody tr")].entries()) if (problemas[i] && problemas[i].length) tr.classList.add("tr-erro");

    const resumoPrevia = h("p", { class: ["aviso", comProblema || vazias ? "aviso-aten" : "aviso-ok"] }, ui.icone(comProblema || vazias ? "info" : "check"),
      h("span", null, comProblema || vazias
        ? `Das ${ui.num(linhasMontadas.length)} linhas, ${comProblema ? `${ui.num(comProblema)} ${comProblema === 1 ? "tem" : "têm"} algum dado com problema (a linha entra sem esse dado)` : ""}${comProblema && vazias ? " e " : ""}${vazias ? `${ui.num(vazias)} não ${vazias === 1 ? "tem" : "têm"} nome, telefone nem e-mail (${vazias === 1 ? "será pulada" : "serão puladas"})` : ""}.`
        : `As ${ui.num(linhasMontadas.length)} linhas estão prontas para entrar.`));

    corpo.append(
      h("h2", { class: "imp-tit" }, "Como importar"),
      h("div", { class: "imp-opcoes" },
        h("div", { class: "pilha" }, atualizar,
          h("div", { class: "imp-grupo" }, h("span", { class: "rotulo" }, "Etiquetas para todos"), etiquetas),
          h("div", { class: "imp-grupo" }, h("span", { class: "rotulo" }, "Responsável"), dono,
            h("small", { class: "campo-ajuda" }, `Sem responsável: todo mundo da equipe vê ${k.v.art("contato") === "a" ? "as novas" : "os novos"} ${k.v.min("contatos")}.`))),
        h("div", { class: "pilha" }, neg, blocoNeg)),
      h("h3", { class: "imp-sub" }, "Prévia"), resumoPrevia, previa.el);
    rodape.append(botao("Voltar", "sec", () => ir(2)), botao("Continuar", "prim", () => ir(4)));
  }

  /* ------------------------------------------------------------ 4. importar */
  function passoImportar() {
    const total = S.dados.linhas.length;
    const barra = h("div", { class: "imp-barra", role: "progressbar", "aria-valuemin": "0", "aria-valuemax": String(total), "aria-valuenow": "0", "aria-label": "Progresso da importação" }, h("i"));
    const pctTxt = h("b", { class: "imp-barra-pct dado" }, "0%");
    const barraLinha = h("div", { class: "imp-barra-linha" }, barra, pctTxt);
    const texto = h("p", { class: "imp-prog-txt", "aria-live": "polite" });
    const resultado = h("div", { class: "pilha" });
    const btPausar = botao("Pausar", "sec", () => {
      S.pausado = !S.pausado;
      btPausar.textContent = S.pausado ? "Continuar" : "Pausar";
      atualizarBarra();
    }, { hidden: true });
    const faltam = total - S.feitas;
    const btIniciar = botao(S.feitas > 0 ? `Importar ${faltam === 1 ? "a linha que falta" : `as ${ui.num(faltam)} linhas que faltam`}`
      : `Importar ${ui.num(total)} linha${total === 1 ? "" : "s"}`, "prim", () => iniciar());
    const btVoltar = botao("Voltar", "sec", () => ir(3));
    const o = S.opcoes;
    const f = k.funil(o.funil_id);
    const etapa = o.estagio_id ? k.estagio(o.estagio_id) : null;
    const lista = [
      `${ui.num(total)} linha${total === 1 ? "" : "s"} de «${S.arquivo.nome}»`,
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
    rodape.append(btVoltar, h("div", { class: "linha" }, btPausar, btIniciar));

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
        : S.pausado ? `Pausado em ${ui.num(S.feitas)} de ${ui.num(total)} linhas. Nada se perde: continue quando quiser.`
        : `Importando… ${ui.num(S.feitas)} de ${ui.num(total)} linhas (lotes de ${S.lote}).`;
    }

    async function iniciar() {
      if (S.rodando) return;
      S.rodando = true; S.pausado = false; S.cancelado = false; S.erroFatal = null;
      corpo.querySelector(".imp-lista").hidden = true;
      corpo.querySelector(".imp-prog").hidden = false;
      btIniciar.hidden = true; btVoltar.hidden = true; btPausar.hidden = false;
      const linhas = L.montarLinhas(S.dados.linhas, S.mapa).map((l, i) => ({ ...l, _linha: (S.dados.numeros && S.dados.numeros[i]) || i + 2 }));
      const opcoes = { atualizar: !!o.atualizar, etiquetas: o.etiquetas, arquivo: String(S.arquivo.nome || "").slice(0, 200),
        ...(o.dono_id ? { dono_id: o.dono_id } : {}),
        ...(o.criarNegocio && o.funil_id ? { negocio: { funil_id: o.funil_id, ...(o.estagio_id ? { estagio_id: o.estagio_id } : {}) } } : {}) };
      let i = S.feitas;
      S.resumo = S.resumo || { criados: 0, atualizados: 0, ignorados: 0, erros: [], avisos: [] };
      atualizarBarra();
      while (i < linhas.length && S.vivo && !S.cancelado) {
        while (S.pausado && S.vivo) await esperar(200);
        if (!S.vivo) break;
        const lote = linhas.slice(i, i + S.lote);
        try {
          const r = await k.api.rpcC("nx_contatos_importar", { p_linhas: lote, p_opcoes: { ...opcoes, importacao_id: S.imp } });
          S.imp = r.importacao_id || S.imp;
          S.resumo = L.somarImportacao(S.resumo, r);
          i += lote.length; S.feitas = i;
          atualizarBarra();
        } catch (e) {
          if (e && e.codigo === "tempo_esgotado" && S.lote > 10) { S.lote = L.metadeLote(S.lote); atualizarTexto(); continue; }
          S.erroFatal = e;
          break;
        }
      }
      S.rodando = false;
      S.terminou = true;
      btPausar.hidden = true;
      corpo.querySelector("h2").textContent = S.erroFatal ? "Importação interrompida" : "Importação concluída";
      atualizarBarra();
      if (S.resumo.criados || S.resumo.atualizados) k.recarregarBase().catch(() => {});
      desenharResultado();
      ui.anunciar(`Importação ${S.erroFatal ? "interrompida" : "concluída"}: ${L.textoResumoImportacao(S.resumo)}.`);
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
        resultado.append(h("p", { class: "aviso aviso-ruim", role: "alert" }, ui.icone("alerta"),
          h("span", null, `${k.erro(S.erroFatal)} O que já entrou ficou salvo (${ui.num(S.feitas)} de ${ui.num(total)} linhas).`)));
      }
      const problemas = [...s.erros.map(x => ({ ...x, tipo: "Erro" })), ...s.avisos.map(x => ({ ...x, tipo: "Aviso" }))]
        .sort((a, b) => (a.linha || 0) - (b.linha || 0));
      if (problemas.length) {
        const lista = h("ul", { class: "imp-problemas" }, problemas.slice(0, 60).map(p =>
          h("li", { class: p.tipo === "Erro" ? "erro" : null }, h("span", { class: "mono" }, `linha ${p.linha}`), h("span", null, p.motivo))));
        resultado.append(h("details", { class: "imp-det", open: s.erros.length > 0 },
          h("summary", null, `${problemas.length} linha${problemas.length === 1 ? "" : "s"} com observação${s.erros.length ? ` (${s.erros.length === 1 ? "1 não entrou" : `${s.erros.length} não entraram`})` : ""}`),
          lista, problemas.length > 60 ? h("p", { class: "sub" }, `Mostrando 60 de ${problemas.length}. Baixe o CSV para ver todas.`) : null,
          h("div", { class: "linha" }, botao("Baixar erros em CSV", "sec", () => baixar(problemas)))));
      }
      ui.limpar(rodape);
      rodape.append(
        botao("Importar outra planilha", "sec", () => { Object.assign(S, { dados: null, arquivo: null, mapa: [], resumo: null, feitas: 0, terminou: false, erroFatal: null, lote: 100, imp: null }); ir(1); }),
        S.erroFatal && S.feitas < total
          ? botao("Tentar o restante", "prim", () => { S.terminou = false; S.erroFatal = null; ir(4); })
          : h("a", { class: "bt bt-prim", href: "#/contatos" }, `Ver ${k.v.min("contatos")}`));
    }

    function baixar(problemas) {
      const csv = L.gerarCSV(["linha", "tipo", "motivo"], problemas.map(p => [p.linha, p.tipo, p.motivo]));
      const url = URL.createObjectURL(new Blob([csv], { type: "text/csv;charset=utf-8" }));
      const a = h("a", { href: url, download: "erros-da-importacao.csv", hidden: true });
      document.body.appendChild(a); a.click(); a.remove();
      setTimeout(() => URL.revokeObjectURL(url), 2000);
    }

    if (S.terminou) { atualizarBarra(); desenharResultado(); }
  }

  ir(1);
  return {
    desmontar() {
      S.vivo = false; S.cancelado = true;
      removeEventListener("beforeunload", antesDeSair);
    },
  };
}
