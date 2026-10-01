/* ============================================================
   ÓRBITA — crm-listas.js · frente F4
   T7 Contatos (#/contatos): tabela com busca sem acento, filtros
      (etiquetas alguma/todas/nenhuma, origem, responsável, criados
      entre, com negócio aberto), ordenação, páginas de 50; "+ Novo",
      "Importar" (supervisor+). No celular a tabela vira cartões.
   Ficha 360 (#/contatos/<id> — página; também em gaveta pelo
      abrirContato): dados editáveis, campos, etiquetas, consentimento,
      RFM, negócios, atendimentos, tarefas, notas e linha do tempo.
   T8 Empresas (#/empresas, #/empresas/<id>).
   ============================================================ */

const POR_PAGINA = 50;
const ORDENS = [["recentes", "Mais recentes"], ["nome", "Nome (A–Z)"], ["ultimo_contato", "Último contato"]];

/* ============================================================ T7 — lista de contatos */
export async function montarContatos(k, el, rota) {
  const { ui, h, L, ctx } = k;
  ctx.titulo(k.v.contatos);
  const chaveLocal = `nx-app-crm-ct-${ctx.cliente.id}`;
  let salvo = {};
  try { salvo = JSON.parse(localStorage.getItem(chaveLocal) || "{}") || {}; } catch { salvo = {}; }
  const S = { filtro: salvo.filtro || {}, ordem: ORDENS.some(o => o[0] === salvo.ordem) ? salvo.ordem : "recentes", pagina: 1, seq: 0, vivo: true, total: null };
  if (rota.query && rota.query.busca) S.filtro.busca = rota.query.busca;
  const gravar = () => { try { localStorage.setItem(chaveLocal, JSON.stringify({ filtro: S.filtro, ordem: S.ordem })); } catch { /* ok */ } };

  const sub = h("p", { class: "sub" });
  const busca = h("input", { type: "search", placeholder: "Buscar por nome, telefone, e-mail ou documento", "aria-label": `Buscar ${k.v.min("contatos")}`, value: S.filtro.busca || "" });
  const aoBuscar = ui.debounce(() => { const q = busca.value.trim(); if (q) S.filtro.busca = q; else delete S.filtro.busca; S.pagina = 1; gravar(); carregar(); }, 320);
  busca.addEventListener("input", aoBuscar);
  const nF = h("span", { class: "crm-filtro-n", hidden: true });
  const btF = h("button", { type: "button", class: "bt bt-sec crm-filtro-bt", "aria-haspopup": "dialog" }, ui.icone("filtro"), "Filtros", nF);
  btF.addEventListener("click", abrirFiltros);
  const selOrdem = h("select", { class: "sel", "aria-label": "Ordenar" }, ORDENS.map(([v, t]) => h("option", { value: v, selected: v === S.ordem }, t)));
  selOrdem.addEventListener("change", () => { S.ordem = selOrdem.value; S.pagina = 1; gravar(); carregar(); });
  const chips = h("div", { class: "crm-chips", "aria-label": "Filtros ativos" });
  const corpo = h("div", { class: "pilha" });
  const pag = h("nav", { class: "ct-pag", "aria-label": "Páginas" });

  const acoes = h("div", { class: "crm-cab-acoes" },
    k.pode("admin") ? h("button", { type: "button", class: "bt bt-sec", title: "Baixa uma planilha (CSV) com os filtros atuais",
      on: { click: ev => exportar(ev.currentTarget) } }, ui.icone("seta-baixo"), "Exportar") : null,
    k.pode("supervisor") ? h("a", { class: "bt bt-sec", href: "#/contatos/importar" }, ui.icone("camadas"), "Importar") : null,
    k.pode("atendente") ? h("button", { type: "button", class: "bt bt-prim", on: { click: novoContato } }, ui.icone("mais"), k.v.novo("contato")) : null);
  el.append(
    h("header", { class: "crm-cab" }, h("div", null, h("p", { class: "rotulo" }, ctx.cliente.nome), h("h1", { class: "titulo-pag" }, k.v.contatos), sub), acoes),
    h("div", { class: "pilha-p" }, h("div", { class: "crm-fita" }, h("div", { class: "busca" }, ui.icone("busca"), busca), btF, selOrdem), chips),
    corpo, pag);

  const tab = ui.tabela({
    rotulo: k.v.contatos,
    colunas: [
      { chave: "nome", rotulo: "Nome", principal: true, render: c => h("div", { class: "cel-nome" }, ui.avatar(c.nome || c.telefone, c.id),
        h("div", null, h("b", null, c.nome || ui.telBR(c.telefone) || "Sem nome"), h("small", null, c.cidade || (c.optin_marketing === false ? "Não quer marketing" : L.ROTULO_ORIGEM[c.origem] || "")))) },
      { chave: "telefone", rotulo: "Telefone", render: c => c.telefone ? h("span", { class: "mono" }, ui.telBR(c.telefone)) : null },
      { chave: "email", rotulo: "E-mail" },
      { chave: "empresa", rotulo: "Empresa", render: c => c.empresa ? c.empresa.nome : null },
      { chave: "etiquetas", rotulo: "Etiquetas", render: c => {
        const e = (c.etiquetas || []).map(id => k.etiqueta(id)).filter(Boolean);
        return e.length ? h("div", { class: "ct-etqs" }, e.slice(0, 3).map(x => ui.etiqueta(x)), e.length > 3 ? h("span", { class: "kc-mais-etq" }, `+${e.length - 3}`) : null) : null;
      } },
      { chave: "origem", rotulo: "Origem", render: c => c.plataforma ? ui.pilula(c.plataforma === "google" ? "Google" : "Anúncio", c.plataforma === "google" ? "google" : "meta") : (L.ROTULO_ORIGEM[c.origem] || c.origem) },
      { chave: "negocios_abertos", rotulo: `${k.v.negocios} abert${k.v.art("negocio")}s`, alinhar: "dir", render: c => h("span", { class: ["ct-nneg", c.negocios_abertos > 0 && "tem"] }, String(c.negocios_abertos || 0)) },
      { chave: "ultimo_contato_em", rotulo: "Último contato", render: c => c.ultimo_contato_em ? ui.relativo(c.ultimo_contato_em) : null },
    ],
    aoClicar: c => ctx.navegar(`#/contatos/${c.id}`),
    vazio: "Nada encontrado com esses filtros.",
  });

  async function carregar() {
    const minha = ++S.seq;
    desenharChips();
    if (!corpo.contains(tab.el)) { ui.limpar(corpo); corpo.appendChild(ui.esqueleto("tabela", 8)); }
    else tab.el.setAttribute("aria-busy", "true");
    try {
      const r = await k.api.rpcC("nx_contatos_listar", { p_filtro: S.filtro, p_pagina: S.pagina, p_por_pagina: POR_PAGINA, p_ordem: S.ordem });
      if (minha !== S.seq || !S.vivo) return;
      tab.el.removeAttribute("aria-busy");
      S.total = r.total;
      const n = r.total != null ? r.total : r.total_aprox;
      sub.textContent = n != null ? `${ui.num(n)}${r.total == null ? "+" : ""} ${n === 1 ? k.v.min("contato") : k.v.min("contatos")}` : "";
      ui.limpar(corpo);
      if (!r.itens.length && L.filtroVazio(S.filtro) && S.pagina === 1) {
        const fem = k.v.art("contato") === "a";
        corpo.appendChild(ui.vazio({ titulo: `${k.v.nenhum("contato")} ainda.`, icone: "contato",
          texto: `${fem ? "Elas entram sozinhas" : "Eles entram sozinhos"} pelo WhatsApp ou pela importação de planilha.`,
          acao: k.pode("atendente") ? { rotulo: k.v.novo("contato"), fn: novoContato } : null,
          acoes: k.pode("supervisor") ? [{ rotulo: "Importar planilha", fn: () => ctx.navegar("#/contatos/importar") }] : [] }));
        ui.limpar(pag);
        return;
      }
      tab.atualizar(r.itens);
      corpo.appendChild(tab.el);
      desenharPaginas(r);
    } catch (e) {
      if (minha !== S.seq || !S.vivo) return;
      ui.limpar(corpo);
      corpo.appendChild(ui.erroCartao(e, carregar));
    }
  }

  function desenharPaginas(r) {
    ui.limpar(pag);
    const ini = (S.pagina - 1) * POR_PAGINA + 1, fim = ini + r.itens.length - 1;
    const tot = r.total != null ? ui.num(r.total) : `${ui.num(r.total_aprox || fim)}+`;
    pag.append(h("span", { "aria-live": "polite" }, r.itens.length ? `${ui.num(ini)}–${ui.num(fim)} de ${tot}` : "Nenhum resultado"),
      h("div", { class: "linha" },
        h("button", { type: "button", class: "bt bt-sec bt-p", disabled: S.pagina <= 1, on: { click: () => { S.pagina--; carregar(); el.scrollIntoView({ block: "start" }); } } }, ui.icone("seta-esq"), "Anterior"),
        h("button", { type: "button", class: "bt bt-sec bt-p", disabled: !r.tem_mais, on: { click: () => { S.pagina++; carregar(); el.scrollIntoView({ block: "start" }); } } }, "Próxima", ui.icone("seta-dir"))));
  }

  function desenharChips() {
    ui.limpar(chips);
    const f = S.filtro;
    let n = 0;
    const add = (txt, tirar) => { n++; chips.appendChild(h("span", { class: "crm-chip" }, h("span", null, txt),
      h("button", { type: "button", "aria-label": `Tirar o filtro ${txt}`, on: { click: () => { tirar(); S.pagina = 1; gravar(); carregar(); } } }, ui.icone("fechar")))); };
    if (f.etiquetas && f.etiquetas.ids && f.etiquetas.ids.length)
      add(`Etiquetas (${f.etiquetas.op || "alguma"}): ${f.etiquetas.ids.map(id => (k.etiqueta(id) || {}).nome).filter(Boolean).join(", ")}`, () => delete f.etiquetas);
    if (Array.isArray(f.origem) && f.origem.length) add(`Origem: ${f.origem.map(o => L.ROTULO_ORIGEM[o] || o).join(", ")}`, () => delete f.origem);
    if (f.dono) add(`Responsável: ${f.dono === "eu" ? "eu" : f.dono === "sem" ? "sem responsável" : (k.usuario(f.dono) || {}).nome || "—"}`, () => delete f.dono);
    if (f.criado_de || f.criado_ate) add(`Cadastrados ${f.criado_de ? `de ${ui.dataBR(f.criado_de)} ` : ""}${f.criado_ate ? `até ${ui.dataBR(f.criado_ate)}` : ""}`.trim(), () => { delete f.criado_de; delete f.criado_ate; });
    if (typeof f.tem_negocio_aberto === "boolean") add(f.tem_negocio_aberto ? `Com ${k.v.min("negocio")} abert${k.v.art("negocio")}` : `Sem ${k.v.min("negocio")} abert${k.v.art("negocio")}`, () => delete f.tem_negocio_aberto);
    if (f.empresa_id) add(`Empresa: ${f.empresa_nome || "escolhida"}`, () => { delete f.empresa_id; delete f.empresa_nome; });
    if (f.optin_marketing === false) add("Não querem marketing", () => delete f.optin_marketing);
    nF.textContent = String(n); nF.hidden = !n;
    btF.classList.toggle("ativo", n > 0);
    chips.hidden = !n;
  }

  function abrirFiltros() {
    const f = JSON.parse(JSON.stringify(S.filtro));
    const et = f.etiquetas || { op: "alguma", ids: [] };
    const orig = new Set(f.origem || []);
    const seg = (itens, atual, aoMudar, rotulo) => {
      const g = h("div", { class: "crm-seg", role: "group", "aria-label": rotulo });
      for (const [v, t] of itens) {
        const b = h("button", { type: "button", "aria-pressed": String(String(atual ?? "") === v) }, t);
        b.addEventListener("click", () => { for (const x of g.children) x.setAttribute("aria-pressed", "false"); b.setAttribute("aria-pressed", "true"); aoMudar(v); });
        g.appendChild(b);
      }
      return g;
    };
    const opsEt = h("div", { class: "crm-opcoes" }, k.base.etiquetas.map(e => {
      const inp = h("input", { type: "checkbox", checked: (et.ids || []).includes(e.id) });
      inp.addEventListener("change", () => { et.ids = inp.checked ? [...new Set([...(et.ids || []), e.id])] : (et.ids || []).filter(x => x !== e.id); });
      return h("label", { class: "crm-op" }, inp, h("span", { style: k.cor(e.cor) ? { "--cor": k.cor(e.cor) } : null }, h("i"), e.nome));
    }));
    const opsOrig = h("div", { class: "crm-opcoes" }, Object.entries(L.ROTULO_ORIGEM).map(([v, t]) => {
      const inp = h("input", { type: "checkbox", checked: orig.has(v) });
      inp.addEventListener("change", () => { inp.checked ? orig.add(v) : orig.delete(v); });
      return h("label", { class: "crm-op" }, inp, h("span", null, t));
    }));
    const selPessoa = ui.seletorPessoa({ usuarios: k.base.usuarios, valor: f.dono && !["eu", "sem"].includes(f.dono) ? f.dono : null, vazio: "Qualquer pessoa", rotulo: "Responsável", aoMudar: id => { f.dono = id || undefined; } });
    const de = h("input", { type: "date", "aria-label": "Cadastrados de", value: f.criado_de || "" });
    const ate = h("input", { type: "date", "aria-label": "Cadastrados até", value: f.criado_ate || "" });
    // empresa (busca no servidor; escolhe uma)
    let empresa = f.empresa_id ? { id: f.empresa_id, nome: f.empresa_nome } : null;
    const empBusca = h("input", { type: "search", placeholder: "Buscar empresa", "aria-label": "Buscar empresa", autocomplete: "off" });
    const empRes = h("div", { class: "crm-busca-res", role: "listbox", "aria-label": "Empresas encontradas" });
    const empEsc = h("div", { class: "crm-escolhido" });
    function desenharEmp() {
      ui.limpar(empEsc); ui.limpar(empRes);
      empEsc.hidden = !empresa; empBusca.hidden = !!empresa;
      if (empresa) empEsc.append(ui.icone("empresa"), h("span", null, h("b", null, empresa.nome || "Empresa escolhida")),
        h("button", { type: "button", class: "bt-icone", "aria-label": "Tirar a empresa do filtro", on: { click: () => { empresa = null; desenharEmp(); empBusca.focus(); } } }, ui.icone("fechar")));
    }
    let seqEmp = 0;
    empBusca.addEventListener("input", ui.debounce(async () => {
      const q = empBusca.value.trim(), minha = ++seqEmp;
      ui.limpar(empRes);
      if (q.length < 2) return;
      try {
        const r = await k.api.rpcC("nx_empresas_listar", { p_filtro: { busca: q }, p_por_pagina: 6 });
        if (minha !== seqEmp) return;
        if (!r.itens.length) { empRes.appendChild(h("p", { class: "fraco" }, "Nenhuma empresa com esse nome.")); return; }
        for (const e of r.itens) empRes.appendChild(h("button", { type: "button", role: "option", on: { click: () => { empresa = { id: e.id, nome: e.nome }; empBusca.value = ""; desenharEmp(); } } },
          ui.icone("empresa"), h("span", null, h("b", null, e.nome), h("small", null, [e.cidade, `${e.contatos || 0} ${k.v.min(e.contatos === 1 ? "contato" : "contatos")}`].filter(Boolean).join(" · ")))));
      } catch (err) { if (minha === seqEmp) empRes.appendChild(h("p", { class: "fraco" }, k.erro(err))); }
    }, 250));
    desenharEmp();
    const aplicar = h("button", { type: "button", class: "bt bt-prim bt-p" }, "Aplicar");
    const limpar = h("button", { type: "button", class: "bt bt-fant bt-p" }, "Limpar");
    const corpoF = h("div", { class: "crm-filtros" },
      k.base.etiquetas.length ? h("div", { class: "crm-filtros-grupo" }, h("span", { class: "rotulo" }, "Etiquetas"),
        seg([["alguma", "Alguma"], ["todas", "Todas"], ["nenhuma", "Nenhuma"]], et.op || "alguma", v => { et.op = v; }, "Como combinar as etiquetas"), opsEt) : null,
      h("div", { class: "crm-filtros-grupo" }, h("span", { class: "rotulo" }, "Origem"), opsOrig),
      h("div", { class: "crm-filtros-grupo" }, h("span", { class: "rotulo" }, "Responsável"),
        seg([["", "Todos"], ["eu", "Meus"], ["sem", "Sem responsável"]], ["eu", "sem"].includes(f.dono) ? f.dono : "", v => { f.dono = v || undefined; selPessoa.value = ""; }, "Responsável"), selPessoa),
      h("div", { class: "crm-filtros-grupo" }, h("span", { class: "rotulo" }, `${k.v.negocios} abert${k.v.art("negocio")}s`),
        seg([["", "Tanto faz"], ["true", "Com"], ["false", "Sem"]], typeof f.tem_negocio_aberto === "boolean" ? String(f.tem_negocio_aberto) : "", v => { f.tem_negocio_aberto = v === "" ? undefined : v === "true"; }, "Com negócio aberto")),
      h("div", { class: "crm-filtros-grupo" }, h("span", { class: "rotulo" }, "Cadastrados entre"), h("div", { class: "crm-filtros-linha" }, de, ate)),
      h("div", { class: "crm-filtros-grupo" }, h("span", { class: "rotulo" }, "Empresa"), empEsc, empBusca, empRes),
      h("div", { class: "crm-filtros-rod" }, limpar, aplicar));
    const pop = ui.flutuante(btF, corpoF, { classe: "flut-crm", largura: "auto" });
    limpar.addEventListener("click", () => { const b = S.filtro.busca; S.filtro = b ? { busca: b } : {}; S.pagina = 1; gravar(); pop.fechar(); carregar(); });
    aplicar.addEventListener("click", () => {
      const nf = { ...(S.filtro.busca ? { busca: S.filtro.busca } : {}) };
      if (et.ids && et.ids.length) nf.etiquetas = { op: et.op || "alguma", ids: et.ids };
      if (orig.size) nf.origem = [...orig];
      if (f.dono) nf.dono = f.dono;
      if (typeof f.tem_negocio_aberto === "boolean") nf.tem_negocio_aberto = f.tem_negocio_aberto;
      if (de.value) nf.criado_de = de.value;
      if (ate.value) nf.criado_ate = ate.value;
      if (empresa) { nf.empresa_id = empresa.id; nf.empresa_nome = empresa.nome; }
      S.filtro = nf; S.pagina = 1; gravar(); pop.fechar(); carregar();
    });
  }

  /** Exportar (admin): páginas de 2.000 do nx_contatos_exportar com os filtros atuais → CSV com ; e BOM. */
  async function exportar(bt) {
    const filtro = { ...S.filtro };
    delete filtro.empresa_nome;
    const itens = [];
    try {
      await ui.carregando(bt, (async () => {
        for (let p = 1; p <= 200 && S.vivo; p++) {
          const r = await k.api.rpcC("nx_contatos_exportar", { p_filtro: filtro, p_pagina: p });
          itens.push(...(r.itens || []));
          if (!r.tem_mais) break;
          ui.anunciar(`Exportando… ${itens.length} ${k.v.min("contatos")} até agora.`);
        }
      })());
    } catch (e) { k.toastErro(e); return; }
    if (!itens.length) { ui.toast("Nada para exportar com esses filtros.", { tipo: "info" }); return; }
    const { cabecalho, linhas } = L.linhasExportacao(itens, k.base.campos);
    const url = URL.createObjectURL(new Blob([L.gerarCSV(cabecalho, linhas)], { type: "text/csv;charset=utf-8" }));
    const a = h("a", { href: url, download: `${k.v.min("contatos")}-${ui.hojeSP()}.csv`, hidden: true });
    document.body.appendChild(a); a.click(); a.remove();
    setTimeout(() => URL.revokeObjectURL(url), 2000);
    ui.toast(`${ui.num(itens.length)} ${itens.length === 1 ? k.v.min("contato") : k.v.min("contatos")} na planilha.`, { tipo: "ok" });
  }

  async function novoContato() {
    const c = await formContato(k);
    if (c) { ui.toast(`${k.v.contato} cadastrad${k.v.art("contato")}.`, { tipo: "ok" }); ctx.navegar(`#/contatos/${c.id}`); }
  }

  await carregar();
  return { desmontar() { S.vivo = false; S.seq++; } };
}

/* ------------------------------------------------------------ formulário de contato novo */
export async function formContato(k, { nome = "", telefone = "" } = {}) {
  const { ui, h, L } = k;
  const N = await k.mod("negocio");
  const campos = L.camposDe(k.base.campos, "contato").filter(c => c.obrigatorio);
  const form = h("form", { class: "crm-form", novalidate: true },
    h("div", { class: "crm-form-2" },
      h("div", { class: "inteiro" }, ui.campo({ rotulo: "Nome", nome: "nome", valor: nome, max: 160, autocomplete: "off" })),
      ui.campo({ rotulo: "Telefone / WhatsApp", nome: "telefone", tipo: "tel", valor: telefone, placeholder: "(12) 99830-3030", autocomplete: "off" }),
      ui.campo({ rotulo: "E-mail", nome: "email", tipo: "email", autocomplete: "off" }),
      ui.campo({ rotulo: "Origem", nome: "origem", tipo: "select", valor: "manual", opcoes: Object.entries(L.ROTULO_ORIGEM).filter(([v]) => v !== "importacao").map(([valor, rotulo]) => ({ valor, rotulo })) }),
      ui.campo({ rotulo: "Cidade", nome: "cidade", max: 80 })),
    ...campos.map(c => N.campoPersonalizado(k, c, null)),
    h("p", { class: "crm-status", role: "status", "aria-live": "polite", hidden: true }));
  const status = form.querySelector(".crm-status");
  let reqAtual = null, reqConteudo = "";   // M25: uma chave por intenção; erro ambíguo repete com a MESMA chave
  return ui.modal({
    titulo: k.v.novo("contato"), corpo: form,
    acoes: [
      { rotulo: "Cancelar", tipo: "neutro", valor: null },
      { rotulo: "Cadastrar", tipo: "primario", fn: async api => {
        ui.marcarErro(form, null);
        const d = ui.lerForm(form);
        if (!d.nome && !d.telefone && !d.email) { ui.marcarErro(form, "nome", "Informe o nome, o telefone ou o e-mail."); return false; }
        if (d.telefone && !L.normalizarTelefone(d.telefone)) { ui.marcarErro(form, "telefone", "Telefone inválido. Use DDD + número."); return false; }
        const { valores, erros } = N.lerCamposPersonalizados(k, form, campos);
        if (erros.length) { ui.marcarErro(form, erros[0].nome, erros[0].texto); return false; }
        const p = { nome: d.nome || null, telefone: d.telefone || null, email: d.email || null, origem: d.origem, cidade: d.cidade || null, ...(campos.length ? { campos: valores } : {}) };
        try {
          const conteudo = JSON.stringify(p);
          if (conteudo !== reqConteudo) { reqAtual = k.novaReq(); reqConteudo = conteudo; }
          const { resultado } = await k.escrever("nx_contato_salvar", { p_contato: p }, { req: reqAtual, aoStatus: txt => { status.textContent = txt; status.hidden = false; } });
          status.hidden = true;
          return resultado;
        }
        catch (e) {
          status.hidden = true;
          if (e && e.ambigua) { api.erro("Não foi possível confirmar se foi salvo. Toque em «Cadastrar» de novo: é seguro, não duplica."); return false; }
          if (e && e.codigo === "telefone_em_uso" && /^\d+$/.test(String(e.hint || ""))) {
            api.erro(`${k.erro(e)} Abrindo o cadastro existente…`);
            setTimeout(() => { api.fechar(null); k.ctx.navegar(`#/contatos/${e.hint}`); }, 900);
            return false;
          }
          api.erro(k.erro(e)); return false;
        }
      } },
    ],
  });
}

/* ============================================================ ficha 360 */
export async function montarFicha(k, el, id, { gaveta = null, aoMudar } = {}) {
  const { ui, h, L, ctx } = k;
  const N = await k.mod("negocio");
  const T = await k.mod("tarefas");
  let vivo = true;
  const idNum = Number(id);

  async function carregar() {
    ui.limpar(el);
    el.appendChild(ui.esqueleto("cartoes", 4));
    try {
      const d = await k.api.rpcC("nx_contato_ver", { p_id: idNum });
      if (!vivo) return;
      desenhar(d);
    } catch (e) {
      if (!vivo) return;
      ui.limpar(el);
      if (e && e.codigo === "contato_nao_encontrado") {
        el.appendChild(ui.vazio({ titulo: "Cadastro não encontrado", texto: "Ele pode ter sido removido ou você não tem acesso a ele.", icone: "contato",
          acao: gaveta ? { rotulo: "Fechar", fn: () => gaveta.fechar() } : { rotulo: `Ver ${k.v.min("contatos")}`, fn: () => ctx.navegar("#/contatos") } }));
      } else el.appendChild(ui.erroCartao(e, carregar));
    }
  }

  function desenhar(d) {
    const c = d.contato;
    const pode = k.pode("atendente");
    ui.limpar(el);
    if (!gaveta) ctx.titulo(c.nome || ui.telBR(c.telefone) || k.v.contato);
    else gaveta.trocarTitulo(c.nome || ui.telBR(c.telefone) || k.v.contato);
    const avisar = () => { if (aoMudar) try { aoMudar(c); } catch { /* ok */ } };
    async function salvar(chaves) {
      const r = await k.api.rpcC("nx_contato_salvar", { p_contato: { id: c.id, ...chaves } });
      Object.assign(c, r);
      avisar();
      return r;
    }
    const conv = (d.conversas || []).find(x => x.status !== "resolvida");

    /* cabeçalho */
    const nomeH = h("h1", null, c.nome || ui.telBR(c.telefone) || "Sem nome");
    const menuBt = h("button", { type: "button", class: "bt-icone", "aria-label": "Mais ações" }, ui.icone("opcoes"));
    menuBt.addEventListener("click", () => ui.menu(menuBt, [
      c.telefone ? { rotulo: "Copiar telefone", icone: "copiar", fn: () => ui.copiar(ui.telBR(c.telefone)) } : null,
      { rotulo: "Copiar link da ficha", icone: "link", fn: () => ui.copiar(ctx.linkPublico ? ctx.linkPublico(`#/contatos/${c.id}`) : location.href) },
      gaveta ? { rotulo: "Abrir em página", icone: "externo", fn: () => { gaveta.fechar(); ctx.navegar(`#/contatos/${c.id}`); } } : null,
      k.pode("admin") ? "-" : null,
      k.pode("admin") ? { rotulo: "Excluir cadastro (LGPD)", icone: "lixeira", perigo: true, fn: excluir } : null,
    ].filter(Boolean)));
    const cab = h("section", { class: "fx-cab", "aria-label": "Identificação" },
      ui.avatar(c.nome || c.telefone, c.id),
      h("div", { class: "fx-id" }, nomeH,
        h("p", null,
          c.telefone ? h("span", null, ui.icone("telefone"), h("span", { class: "mono" }, ui.telBR(c.telefone))) : null,
          c.email ? h("span", null, ui.icone("enviar"), c.email) : null,
          c.cidade ? h("span", null, ui.icone("globo"), `${c.cidade}${c.uf ? `/${c.uf}` : ""}`) : null),
        h("div", { class: "linha", style: { gap: ".35rem" } },
          c.plataforma ? ui.pilula(c.plataforma === "google" ? "Veio do Google" : "Veio do anúncio", c.plataforma === "google" ? "google" : "meta", { icone: "anuncio" })
            : ui.pilula(L.ROTULO_ORIGEM[c.origem] || c.origem, "neutra"),
          c.optin_marketing === false ? ui.pilula("Não quer marketing", "aten", { icone: "alerta" }) : null,
          c.bloqueado ? ui.pilula("Bloqueado", "ruim") : null)),
      h("div", { class: "fx-acoes" },
        ctx.temModulo && ctx.temModulo("conversas") ? h("button", { type: "button", class: "bt bt-prim", on: { click: () => {
          if (gaveta) gaveta.fechar();
          ctx.navegar(conv ? `#/conversas/${conv.id}` : `#/conversas?contato=${c.id}`);
        } } }, ui.icone("whatsapp"), "Abrir conversa") : null,
        pode ? h("button", { type: "button", class: "bt bt-sec", on: { click: () => N.novoNegocio(k, { contato_id: c.id }, { aoCriar: () => carregar() }) } }, ui.icone("mais"), k.v.negocio) : null,
        pode ? h("button", { type: "button", class: "bt bt-sec", on: { click: async () => {
          const t = await T.formTarefa(k, null, { contato_id: c.id });
          if (t) { ui.toast("Tarefa criada.", { tipo: "ok" }); carregar(); }
        } } }, ui.icone("tarefa"), "Tarefa") : null,
        menuBt));

    /* coluna da esquerda: dados */
    const dl = h("dl", { class: "ng-kv" });
    const inp = (tipo, valor, extra = {}) => h("input", { type: tipo, value: valor ?? "", ...extra });
    dl.append(
      ...N.linhaEd(k, { rotulo: "Nome", desabilitado: !pode, controle: inp("text", c.nome, { maxlength: 160 }), ler: x => x.value.trim() || null,
        salvar: async v => { await salvar({ nome: v }); nomeH.textContent = v || ui.telBR(c.telefone) || "Sem nome"; } }),
      ...N.linhaEd(k, { rotulo: "Telefone", desabilitado: !pode, controle: inp("tel", c.telefone ? ui.telBR(c.telefone) : "", { placeholder: "(12) 99830-3030" }),
        ler: x => { const dg = x.value.replace(/\D/g, ""); return dg || null; },
        salvar: v => salvar({ telefone: v }),
        aoErro: (e, erroEl) => {
          if (e && e.codigo === "telefone_em_uso" && /^\d+$/.test(String(e.hint || ""))) {
            erroEl.append(" ", h("a", { href: `#/contatos/${e.hint}`, class: "link" }, "Abrir cadastro"));
          }
        } }),
      ...N.linhaEd(k, { rotulo: "E-mail", desabilitado: !pode, controle: inp("email", c.email), ler: x => x.value.trim() || null, salvar: v => salvar({ email: v }) }),
      ...N.linhaEd(k, { rotulo: "CPF / CNPJ", desabilitado: !pode, controle: inp("text", c.documento, { maxlength: 40 }), ler: x => x.value.trim() || null, salvar: v => salvar({ documento: v }) }),
      ...N.linhaEd(k, { rotulo: "Nascimento", desabilitado: !pode, controle: inp("date", c.nascimento), ler: x => x.value || null, salvar: v => salvar({ nascimento: v }) }),
      ...N.linhaEd(k, { rotulo: "Cidade", desabilitado: !pode, controle: inp("text", c.cidade, { maxlength: 80 }), ler: x => x.value.trim() || null, salvar: v => salvar({ cidade: v }) }),
      ...N.linhaEd(k, { rotulo: "UF", desabilitado: !pode, controle: inp("text", c.uf, { maxlength: 2, style: { "text-transform": "uppercase", "max-width": "6rem" } }), ler: x => x.value.trim().toUpperCase() || null, salvar: v => salvar({ uf: v }) }),
      ...N.linhaEd(k, { rotulo: "Responsável", desabilitado: !pode,
        controle: h("select", null, h("option", { value: "" }, "Sem responsável"), k.base.usuarios.map(u => h("option", { value: u.id, selected: u.id === c.dono_id }, u.nome))),
        ler: x => x.value || null, salvar: v => salvar({ dono_id: v }) }),
      ...N.linhaEd(k, { rotulo: "Origem", desabilitado: !pode || !!c.plataforma,
        controle: h("select", null, Object.entries(L.ROTULO_ORIGEM).map(([v, t]) => h("option", { value: v, selected: v === c.origem }, t))),
        ler: x => x.value, salvar: v => salvar({ origem: v }) }));
    const ddEtq = h("dd", null);
    const montarEtq = marcadas => {
      const etq = ui.seletorEtiquetas({ todas: k.base.etiquetas, marcadas, rotulo: "Etiquetas",
        podeCriar: pode ? nome => k.criarEtiqueta(nome) : false, aoMudar: ids => etiquetar(ids) });
      if (!pode) for (const b of etq.querySelectorAll("button")) b.disabled = true;
      ui.limpar(ddEtq); ddEtq.appendChild(etq);
    };
    // M25: etiquetar grava na hora e oferece «Desfazer»
    async function etiquetar(ids) {
      const antes = (c.etiquetas || []).slice();
      const nomeDe = id => (k.etiqueta(id) || {}).nome || "etiqueta";
      const mais = ids.filter(i => !antes.includes(i)), menos = antes.filter(i => !ids.includes(i));
      const texto = mais.length ? `Etiqueta «${nomeDe(mais[0])}» adicionada` : menos.length ? `Etiqueta «${nomeDe(menos[0])}» removida` : "Etiquetas atualizadas";
      try { await salvar({ etiquetas: ids }); }
      catch (e) { k.toastErro(e); montarEtq(antes); return; }
      ui.acaoComDesfazer({ texto, reverter: async () => { await salvar({ etiquetas: antes }); montarEtq(antes); } });
    }
    montarEtq(c.etiquetas || []);
    dl.append(h("dt", null, "Etiquetas"), ddEtq);
    const obs = h("textarea", { rows: 3, maxlength: 5000, placeholder: "Observações gerais" }, c.obs || "");
    dl.append(...N.linhaEd(k, { rotulo: "Observação", desabilitado: !pode, controle: obs, ler: x => x.value.trim() || null, salvar: v => salvar({ obs: v }) }));
    const blocoDados = h("section", { class: "ng-bloco", "aria-label": "Dados" }, h("div", { class: "ng-bloco-cab" }, h("h3", null, "Dados")), dl);

    /* campos personalizados */
    const campos = L.camposDe(k.base.campos, "contato");
    let blocoCampos = null;
    if (campos.length) {
      const form = h("form", { class: "crm-form", novalidate: true }, campos.map(cp => N.campoPersonalizado(k, cp, (c.campos || {})[cp.chave])));
      if (!pode) for (const x of form.querySelectorAll("input,select,textarea")) x.disabled = true;
      form.addEventListener("change", async ev => {
        const cmp = ev.target.closest("[data-campo]");
        const cp = cmp && campos.find(x => `campo__${x.chave}` === cmp.dataset.campo);
        if (!cp) return;
        const { valores, erros } = N.lerCamposPersonalizados(k, form, [cp]);
        ui.marcarErro(form, cmp.dataset.campo, "");
        if (erros.length) { ui.marcarErro(form, erros[0].nome, erros[0].texto); return; }
        try { await salvar({ campos: { [cp.chave]: valores[cp.chave] ?? null } }); ui.toast("Salvo.", { tipo: "ok", ms: 1500 }); }
        catch (e) { ui.marcarErro(form, cmp.dataset.campo, k.erro(e)); }
      });
      blocoCampos = h("section", { class: "ng-bloco", "aria-label": "Campos" }, h("div", { class: "ng-bloco-cab" }, h("h3", null, "Campos")), form);
    }

    /* consentimento */
    const estadoOptin = c.optin_marketing === true ? ui.pilula("Aceita mensagens de marketing", "ok", { icone: "check" })
      : c.optin_marketing === false ? ui.pilula("Não quer marketing", "aten", { icone: "alerta" }) : ui.pilula("Sem registro", "neutra");
    const blocoConsent = h("section", { class: "ng-bloco", "aria-label": "Consentimento" },
      h("div", { class: "ng-bloco-cab" }, h("h3", null, "Consentimento de marketing"),
        pode ? h("button", { type: "button", class: "bt bt-fant bt-p", on: { click: registrarOptin } }, "Registrar") : null),
      h("div", { class: "fx-consent" }, estadoOptin,
        c.optin_em ? h("span", { class: "fraco", style: { "font-size": "var(--fs-13)" } }, `${ui.dataBR(c.optin_em)}${c.optin_origem ? ` · ${c.optin_origem}` : ""}`) : null),
      h("p", { class: "campo-ajuda" }, "Quem pediu para sair não recebe automações nem envios em lista. Resposta de atendimento continua possível."));

    /* coluna da direita */
    const rfm = d.rfm || {};
    const blocoRfm = h("section", { class: "fx-rfm", "aria-label": "Resumo de compras" },
      h("div", null, h("span", { class: "rotulo" }, "Total gasto"), h("b", null, ui.brl(rfm.total_gasto || 0, { centavos: false }))),
      h("div", null, h("span", { class: "rotulo" }, "Compras"), h("b", null, ui.num(rfm.ganhos || 0))),
      h("div", null, h("span", { class: "rotulo" }, "Última compra"), h("b", null, rfm.ultima_compra ? ui.dataBR(rfm.ultima_compra) : "—")),
      h("div", null, h("span", { class: "rotulo" }, "Ticket médio"), h("b", null, rfm.ticket_medio != null ? ui.brl(rfm.ticket_medio, { centavos: false }) : "—")));
    const listaNeg = h("div", { class: "ng-outros" });
    for (const n of d.negocios || []) {
      const e = k.estagio(n.estagio_id), f = k.funil(n.funil_id);
      listaNeg.appendChild(h("button", { type: "button", class: "ng-mini", style: e && k.cor(e.cor) ? { "--cor": k.cor(e.cor) } : null,
        on: { click: () => N.abrirNegocio(k, n.id, { aoMudar: () => carregar() }) } },
        h("i", { "aria-hidden": "true" }),
        h("span", null, `${L.tituloCard(n)} · ${e ? e.nome : "—"}${f ? ` · ${f.nome}` : ""}`),
        h("b", null, (n.status === "ganho" ? n.valor : n.valor_previsto) != null ? ui.brl(n.status === "ganho" ? n.valor : n.valor_previsto, { centavos: false }) : "—")));
    }
    if (!(d.negocios || []).length) listaNeg.appendChild(h("p", { class: "fraco", style: { "font-size": "var(--fs-14)" } }, `${k.v.nenhum("negocio")} ainda.`));
    const blocoNeg = h("section", { class: "ng-bloco", "aria-label": k.v.negocios },
      h("div", { class: "ng-bloco-cab" }, h("h3", null, k.v.negocios),
        pode ? h("button", { type: "button", class: "bt bt-sec bt-p", on: { click: () => N.novoNegocio(k, { contato_id: c.id }, { aoCriar: () => carregar() }) } }, ui.icone("mais"), k.v.negocio) : null),
      listaNeg);
    const listaConv = h("div", { class: "ng-outros" });
    for (const x of d.conversas || []) {
      listaConv.appendChild(h("a", { class: "fx-proto", href: `#/conversas/${x.id}`, on: { click: () => { if (gaveta) gaveta.fechar(); } } },
        ui.icone("chat"), h("b", { class: "mono" }, x.protocolo),
        h("span", null, `${x.status === "resolvida" ? "Resolvido" : x.status === "pendente" ? "Pendente" : "Aberto"} · ${ui.dataBR(x.aberta_em)}${x.atribuida_nome ? ` · ${x.atribuida_nome}` : ""}`),
        x.nao_lidas ? h("span", { class: "badge" }, String(x.nao_lidas)) : null));
    }
    if (!(d.conversas || []).length) listaConv.appendChild(h("p", { class: "fraco", style: { "font-size": "var(--fs-14)" } }, "Nenhum atendimento ainda."));
    const blocoConv = h("section", { class: "ng-bloco", "aria-label": "Atendimentos" }, h("div", { class: "ng-bloco-cab" }, h("h3", null, "Atendimentos")), listaConv);
    const blocoTar = T.blocoTarefas(k, { tarefas: d.tarefas || [], contato_id: c.id });
    const blocoNotas = T.blocoNotas(k, { notas: d.notas || [], contato_id: c.id });
    const blocoTempo = T.blocoTempo(k, d.tempo || []);

    el.append(...[
      !gaveta ? h("a", { class: "bt bt-fant bt-p fx-voltar", href: "#/contatos" }, ui.icone("seta-esq"), k.v.contatos) : null,
      h("div", { class: "fx" }, cab,
        h("div", { class: "fx-grade" },
          h("div", { class: "fx-col" }, blocoDados, blocoCampos, blocoConsent),
          h("div", { class: "fx-col" }, blocoRfm, blocoNeg, blocoConv, blocoTar, blocoNotas, blocoTempo)))].filter(Boolean));

    async function registrarOptin() {
      const nome = `opt-${Date.now()}`;
      const form = h("form", { class: "crm-form", novalidate: true },
        h("div", { class: "crm-motivos", role: "radiogroup", "aria-label": "Autorização" },
          h("label", { class: "crm-motivo" }, h("input", { type: "radio", name: nome, value: "sim", checked: c.optin_marketing !== false }), h("span", null, "Aceita receber mensagens de marketing")),
          h("label", { class: "crm-motivo" }, h("input", { type: "radio", name: nome, value: "nao", checked: c.optin_marketing === false }), h("span", null, "Não quer receber marketing"))),
        ui.campo({ rotulo: "Como foi registrado", nome: "optin_origem", max: 60, obrigatorio: true, placeholder: "Ex.: ficha assinada na recepção" }));
      const r = await ui.modal({ titulo: "Registrar consentimento", corpo: form, largura: "p", acoes: [
        { rotulo: "Cancelar", tipo: "neutro", valor: null },
        { rotulo: "Registrar", tipo: "primario", fn: async api => {
          const sel = form.querySelector(`input[name="${nome}"]:checked`);
          const o = form.querySelector("[name=optin_origem]").value.trim();
          if (!o) { ui.marcarErro(form, "optin_origem", "Diga de onde veio a autorização."); return false; }
          try { return await salvar({ optin_marketing: sel.value === "sim", optin_origem: o }); } catch (e) { api.erro(k.erro(e)); return false; }
        } }] });
      if (r) { ui.toast("Consentimento registrado.", { tipo: "ok" }); carregar(); }
    }

    async function excluir() {
      const ok = await ui.confirmar({
        titulo: "Excluir este cadastro?", perigo: true, digitar: "excluir", rotulo: "Excluir de vez",
        texto: `Some tudo o que identifica ${c.nome || "esta pessoa"}: cadastro, conversas, mensagens, fotos e arquivos, tarefas e notas. ${k.v.negocios} ficam sem o nome (como «Removido») para os números do anúncio e as vendas não mudarem. Não dá para desfazer.`,
      });
      if (!ok) return;
      try {
        const r = await k.api.rpcC("nx_contato_excluir", { p_id: c.id, p_confirmacao: "excluir" });
        ui.toast(`Cadastro excluído${r.midias_na_fila ? ` — ${r.midias_na_fila} arquivo(s) de mídia entram na faxina` : ""}.`, { tipo: "ok" });
        if (aoMudar) try { aoMudar({ id: c.id, excluido: true }); } catch { /* ok */ }
        if (gaveta) gaveta.fechar(); else ctx.navegar("#/contatos", { substituir: true });
      } catch (e) { k.toastErro(e); }
    }
  }

  await carregar();
  return { desmontar() { vivo = false; } };
}

/* ============================================================ T8 — Empresas */
export async function montarEmpresas(k, el) {
  const { ui, h, ctx } = k;
  ctx.titulo("Empresas");
  const S = { busca: "", pagina: 1, seq: 0 };
  const busca = h("input", { type: "search", placeholder: "Buscar empresa", "aria-label": "Buscar empresa" });
  const corpo = h("div", { class: "pilha" });
  const pag = h("nav", { class: "ct-pag", "aria-label": "Páginas" });
  busca.addEventListener("input", ui.debounce(() => { S.busca = busca.value.trim(); S.pagina = 1; carregar(); }, 300));
  el.append(
    h("header", { class: "crm-cab" }, h("div", null, h("p", { class: "rotulo" }, ctx.cliente.nome), h("h1", { class: "titulo-pag" }, "Empresas"),
      h("p", { class: "sub" }, "Convênios, frotas, parceiros — as organizações por trás dos seus contatos.")),
      h("div", { class: "crm-cab-acoes" }, k.pode("atendente") ? h("button", { type: "button", class: "bt bt-prim", on: { click: async () => {
        const e = await formEmpresa(k, null);
        if (e) ctx.navegar(`#/empresas/${e.id}`);
      } } }, ui.icone("mais"), "Empresa") : null)),
    h("div", { class: "crm-fita" }, h("div", { class: "busca" }, ui.icone("busca"), busca)), corpo, pag);
  const tab = ui.tabela({ rotulo: "Empresas", colunas: [
    { chave: "nome", rotulo: "Nome", principal: true, render: e => h("div", { class: "cel-nome" }, ui.avatar(e.nome, e.id), h("div", null, h("b", null, e.nome), h("small", null, e.documento || ""))) },
    { chave: "cidade", rotulo: "Cidade", render: e => e.cidade ? `${e.cidade}${e.uf ? `/${e.uf}` : ""}` : null },
    { chave: "contatos", rotulo: k.v.contatos, alinhar: "dir", render: e => h("span", { class: "ct-nneg" }, String(e.contatos || 0)) },
    { chave: "negocios_abertos", rotulo: `${k.v.negocios} abert${k.v.art("negocio")}s`, alinhar: "dir", render: e => h("span", { class: ["ct-nneg", e.negocios_abertos > 0 && "tem"] }, String(e.negocios_abertos || 0)) },
  ], aoClicar: e => ctx.navegar(`#/empresas/${e.id}`), vazio: "Nada encontrado." });
  async function carregar() {
    const minha = ++S.seq;
    if (!corpo.contains(tab.el)) { ui.limpar(corpo); corpo.appendChild(ui.esqueleto("tabela", 6)); }
    try {
      const r = await k.api.rpcC("nx_empresas_listar", { p_filtro: S.busca ? { busca: S.busca } : {}, p_pagina: S.pagina });
      if (minha !== S.seq) return;
      ui.limpar(corpo); ui.limpar(pag);
      if (!r.itens.length && !S.busca && S.pagina === 1) {
        corpo.appendChild(ui.vazio({ titulo: "Nenhuma empresa ainda.", texto: "Cadastre empresas quando atender outras empresas (convênios, frotas, parceiros).", icone: "empresa",
          acao: k.pode("atendente") ? { rotulo: "Cadastrar empresa", fn: async () => { const e = await formEmpresa(k, null); if (e) ctx.navegar(`#/empresas/${e.id}`); } } : null }));
        return;
      }
      tab.atualizar(r.itens);
      corpo.appendChild(tab.el);
      pag.append(h("span", null, `${ui.num(r.total)} empresa${r.total === 1 ? "" : "s"}`), h("div", { class: "linha" },
        h("button", { type: "button", class: "bt bt-sec bt-p", disabled: S.pagina <= 1, on: { click: () => { S.pagina--; carregar(); } } }, ui.icone("seta-esq"), "Anterior"),
        h("button", { type: "button", class: "bt bt-sec bt-p", disabled: !r.tem_mais, on: { click: () => { S.pagina++; carregar(); } } }, "Próxima", ui.icone("seta-dir"))));
    } catch (e) { if (minha === S.seq) { ui.limpar(corpo); corpo.appendChild(ui.erroCartao(e, carregar)); } }
  }
  await carregar();
  return { desmontar() { S.seq++; } };
}

async function formEmpresa(k, emp) {
  const { ui, h, L } = k;
  const e = emp || {};
  const N = await k.mod("negocio");
  // na criação, os campos obrigatórios de empresa já entram no formulário (o servidor recusa sem eles)
  const obrig = emp ? [] : L.camposDe(k.base.campos, "empresa").filter(c => c.obrigatorio);
  const form = h("form", { class: "crm-form", novalidate: true },
    ui.campo({ rotulo: "Nome", nome: "nome", valor: e.nome || "", obrigatorio: true, max: 160 }),
    h("div", { class: "crm-form-2" },
      ui.campo({ rotulo: "CNPJ / documento", nome: "documento", valor: e.documento || "", max: 40 }),
      ui.campo({ rotulo: "Telefone", nome: "telefone", tipo: "tel", valor: e.telefone || "" }),
      ui.campo({ rotulo: "E-mail", nome: "email", tipo: "email", valor: e.email || "" }),
      ui.campo({ rotulo: "Site", nome: "site", tipo: "url", valor: e.site || "", placeholder: "https://" }),
      ui.campo({ rotulo: "Cidade", nome: "cidade", valor: e.cidade || "", max: 80 }),
      ui.campo({ rotulo: "UF", nome: "uf", valor: e.uf || "", max: 2 })),
    ui.campo({ rotulo: "Observação", nome: "obs", tipo: "textarea", valor: e.obs || "", max: 5000 }),
    obrig.map(c => N.campoPersonalizado(k, c, null)));
  return ui.modal({ titulo: emp ? "Editar empresa" : "Nova empresa", corpo: form, acoes: [
    { rotulo: "Cancelar", tipo: "neutro", valor: null },
    { rotulo: emp ? "Salvar" : "Cadastrar", tipo: "primario", fn: async api => {
      const d = ui.lerForm(form);
      ui.marcarErro(form, null);
      if (!d.nome) { ui.marcarErro(form, "nome", "Informe o nome."); return false; }
      const { valores, erros } = N.lerCamposPersonalizados(k, form, obrig);
      if (erros.length) { ui.marcarErro(form, erros[0].nome, erros[0].texto); return false; }
      const dados = Object.fromEntries(Object.entries(d).filter(([kk]) => !kk.startsWith("campo__")));
      try { return await k.api.rpcC("nx_empresa_salvar", { p_empresa: { ...(emp ? { id: emp.id } : {}), ...dados, uf: dados.uf ? dados.uf.toUpperCase() : null, ...(obrig.length ? { campos: valores } : {}) } }); }
      catch (err) {
        if (err && err.codigo === "telefone_invalido") { ui.marcarErro(form, "telefone", k.erro(err)); return false; }
        if (err && err.codigo === "dados_invalidos" && ["email", "site", "uf"].includes(err.hint)) { ui.marcarErro(form, err.hint, k.erro(err)); return false; }
        api.erro(k.erro(err)); return false;
      }
    } }] });
}

export async function montarEmpresa(k, el, id) {
  const { ui, h, L, ctx } = k;
  const N = await k.mod("negocio");
  let vivo = true;
  async function carregar() {
    ui.limpar(el); el.appendChild(ui.esqueleto("cartoes", 3));
    try {
      const d = await k.api.rpcC("nx_empresa_ver", { p_id: Number(id) });
      if (!vivo) return;
      const e = d.empresa;
      ctx.titulo(e.nome);
      ui.limpar(el);
      const contatos = h("div", { class: "ng-outros" }, (d.contatos || []).map(c => h("a", { class: "fx-proto", href: `#/contatos/${c.id}` },
        ui.avatar(c.nome || c.telefone, c.id), h("b", null, c.nome || ui.telBR(c.telefone)), h("span", null, c.telefone ? ui.telBR(c.telefone) : c.email || ""))));
      if (!(d.contatos || []).length) contatos.appendChild(h("p", { class: "fraco" }, `Nenhum ${k.v.min("contato")} ligado. Abra a ficha de alguém e escolha esta empresa.`));
      const negs = h("div", { class: "ng-outros" }, (d.negocios || []).map(n => {
        const est = k.estagio(n.estagio_id);
        return h("button", { type: "button", class: "ng-mini", style: est && k.cor(est.cor) ? { "--cor": k.cor(est.cor) } : null, on: { click: () => N.abrirNegocio(k, n.id, { aoMudar: carregar }) } },
          h("i"), h("span", null, `${L.tituloCard(n)} · ${est ? est.nome : ""}`), h("b", null, ui.brl(n.status === "ganho" ? n.valor : n.valor_previsto, { centavos: false })));
      }));
      if (!(d.negocios || []).length) negs.appendChild(h("p", { class: "fraco" }, `${k.v.nenhum("negocio")} por aqui.`));
      // campos personalizados da empresa (salva ao sair do campo)
      const campos = L.camposDe(k.base.campos, "empresa");
      let blocoCampos = null;
      if (campos.length) {
        const pode = k.pode("atendente");
        const form = h("form", { class: "crm-form", novalidate: true }, campos.map(cp => N.campoPersonalizado(k, cp, (e.campos || {})[cp.chave])));
        if (!pode) for (const x of form.querySelectorAll("input,select,textarea")) x.disabled = true;
        form.addEventListener("change", async ev => {
          const cmp = ev.target.closest("[data-campo]");
          const cp = cmp && campos.find(x => `campo__${x.chave}` === cmp.dataset.campo);
          if (!cp) return;
          const { valores, erros } = N.lerCamposPersonalizados(k, form, [cp]);
          ui.marcarErro(form, cmp.dataset.campo, "");
          if (erros.length) { ui.marcarErro(form, erros[0].nome, erros[0].texto); return; }
          try { await k.api.rpcC("nx_empresa_salvar", { p_empresa: { id: e.id, campos: { [cp.chave]: valores[cp.chave] ?? null } } }); ui.toast("Salvo.", { tipo: "ok", ms: 1500 }); }
          catch (err) { ui.marcarErro(form, cmp.dataset.campo, k.erro(err)); }
        });
        blocoCampos = h("section", { class: "ng-bloco", "aria-label": "Campos" }, h("div", { class: "ng-bloco-cab" }, h("h3", null, "Campos")), form);
      }
      el.append(h("a", { class: "bt bt-fant bt-p fx-voltar", href: "#/empresas" }, ui.icone("seta-esq"), "Empresas"),
        h("div", { class: "fx" },
          h("section", { class: "fx-cab" }, ui.avatar(e.nome, e.id),
            h("div", { class: "fx-id" }, h("h1", null, e.nome), h("p", null,
              e.documento ? h("span", null, e.documento) : null, e.telefone ? h("span", null, ui.icone("telefone"), ui.telBR(e.telefone)) : null,
              e.email ? h("span", null, e.email) : null, e.cidade ? h("span", null, ui.icone("globo"), `${e.cidade}${e.uf ? `/${e.uf}` : ""}`) : null,
              e.site ? h("a", { href: /^https?:\/\//.test(e.site) ? e.site : null, target: "_blank", rel: "noopener noreferrer", class: "link" }, e.site) : null)),
            h("div", { class: "fx-acoes" },
              k.pode("atendente") ? h("button", { type: "button", class: "bt bt-sec", on: { click: async () => { if (await formEmpresa(k, e)) carregar(); } } }, ui.icone("editar"), "Editar") : null,
              k.pode("admin") ? h("button", { type: "button", class: "bt bt-fant", on: { click: async () => {
                if (!(await ui.confirmar({ titulo: "Excluir empresa?", texto: `Os ${k.v.min("contatos")} continuam; só deixam de estar ligados a ela.`, perigo: true }))) return;
                try { await k.api.rpcC("nx_empresa_excluir", { p_id: e.id }); ui.toast("Empresa excluída.", { tipo: "ok" }); ctx.navegar("#/empresas", { substituir: true }); } catch (err) { k.toastErro(err); }
              } } }, ui.icone("lixeira"), "Excluir") : null)),
          e.obs ? h("p", { class: "aviso" }, ui.icone("nota"), h("span", null, e.obs)) : null,
          blocoCampos,
          h("div", { class: "fx-grade" },
            h("section", { class: "ng-bloco" }, h("div", { class: "ng-bloco-cab" }, h("h3", null, k.v.contatos)), contatos),
            h("section", { class: "ng-bloco" }, h("div", { class: "ng-bloco-cab" }, h("h3", null, k.v.negocios)), negs))));
    } catch (err) {
      if (!vivo) return;
      ui.limpar(el);
      el.appendChild(ui.erroCartao(err, carregar));
    }
  }
  await carregar();
  return { desmontar() { vivo = false; } };
}
