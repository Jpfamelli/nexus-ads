/* ============================================================
   ÓRBITA — crm-negocio.js · frente F4 · T6 Gaveta do negócio
   - abrirNegocio(k, id, {aoMudar, aoFechar}): cabeçalho com título
     editável, valor, fita de etapas clicável, Ganhou/Perdeu/Reabrir,
     "Iniciar pós-venda", ⋮ (mover de funil com a trava do Ads, excluir);
     abas Resumo · Tarefas · Notas · Linha do tempo. Salva por campo.
   - novoNegocio(k, {contato_id, conversa_id, funil_id, estagio_id, nome, telefone}, {aoCriar})
   - abrirContato(k, id, {aoMudar}): ficha 360 numa gaveta larga
   - moverComPerguntas(k, card, estagio, ordem): o MESMO fluxo do
     kanban e da fita (valor ao ganhar, motivo ao perder, data e hora
     ao agendar) → nx_negocio_mover
   - plano 50 (04/10): pílula de tempo na etapa (escala do cartão), campos
     em grade de 2 colunas também no desktop (CSS) e ações num rodapé
     fixo no celular; a linha do tempo agrupada por dia vem do crm-tarefas
   ============================================================ */

/* ============================================================ campos personalizados */
/** Input de um campo personalizado (ui.campo com o tipo certo). */
export function campoPersonalizado(k, c, valor, { nome } = {}) {
  const { ui, L } = k;
  const n = nome || `campo__${c.chave}`;
  const base = { rotulo: c.rotulo, nome: n, obrigatorio: !!c.obrigatorio };
  switch (c.tipo) {
    case "texto_longo": return ui.campo({ ...base, tipo: "textarea", valor: valor ?? "", max: 5000 });
    case "numero": return ui.campo({ ...base, tipo: "texto", valor: valor ?? "", inputmode: "decimal" });
    case "moeda": return ui.campo({ ...base, tipo: "moeda", valor: typeof valor === "number" ? valor : (valor ?? "") });
    case "data": return ui.campo({ ...base, tipo: "data", valor: valor ?? "" });
    case "opcao": return ui.campo({ ...base, tipo: "select", valor: valor ?? "", opcoes: [{ valor: "", rotulo: "—" }, ...(c.opcoes || []).map(o => ({ valor: o, rotulo: o }))] });
    case "multi": return ui.campo({ ...base, tipo: "multipla", valor: Array.isArray(valor) ? valor : [], opcoes: (c.opcoes || []).map(o => ({ valor: o, rotulo: o })) });
    case "sim_nao": return ui.campo({ ...base, tipo: "select", valor: valor === true ? "sim" : valor === false ? "nao" : "", opcoes: [{ valor: "", rotulo: "—" }, { valor: "sim", rotulo: "Sim" }, { valor: "nao", rotulo: "Não" }] });
    case "telefone": return comAtalhos(k, ui.campo({ ...base, tipo: "tel", valor: valor ? L.formatarTel(valor) : "" }), "telefone", c.rotulo);
    case "email": return ui.campo({ ...base, tipo: "email", valor: valor ?? "" });
    case "url": return comAtalhos(k, ui.campo({ ...base, tipo: "url", valor: valor ?? "", placeholder: "https://" }), "url", c.rotulo);
    default: return ui.campo({ ...base, tipo: "texto", valor: valor ?? "", max: 500 });
  }
}

/**
 * plano 1000 (CR-230/231): ao lado do campo personalizado, as ações do valor — Link: «abrir» em nova aba (só https/http válido, noopener);
 * Telefone: ligar (tel:) e WhatsApp (wa.me). Os links acompanham o que é digitado e somem com o campo vazio/inválido.
 */
export function linksDoCampo(L, tipo, valor) {
  const v = String(valor ?? "").trim();
  if (!v) return [];
  if (tipo === "url") {
    // plano 1000b · RB-076: «www.site.com.br» também ganha «abrir» (o link vai com https://)
    const u = (typeof L.normalizarSite === "function" ? L.normalizarSite(v) : v) || "";
    return /^https?:\/\/[^\s.]+\.[^\s]{2,}/i.test(u) ? [{ tipo: "abrir", href: u, rotulo: "Abrir o link em nova aba", icone: "externo", nova: true }] : [];
  }
  if (tipo === "telefone") {
    const n = L.normalizarTelefone(v);
    return n ? [{ tipo: "ligar", href: `tel:+${n}`, rotulo: "Ligar", icone: "telefone" }, { tipo: "whatsapp", href: `https://wa.me/${n}`, rotulo: "Abrir no WhatsApp", icone: "whatsapp", nova: true }] : [];
  }
  return [];
}
function comAtalhos(k, campo, tipo, rotulo) {
  const { h, ui, L } = k;
  const inp = campo && campo.querySelector ? campo.querySelector("input") : null;
  if (!inp) return campo;
  const caixa = h("span", { class: "cp-links" });
  const pintar = () => {
    ui.limpar(caixa);
    for (const l of linksDoCampo(L, tipo, inp.value)) caixa.appendChild(h("a", { class: `bt-icone cp-link cp-link-${l.tipo}`, href: l.href, "aria-label": `${l.rotulo}: ${rotulo || ""}`.trim(), title: l.rotulo,
      ...(l.nova ? { target: "_blank", rel: "noopener noreferrer" } : {}) }, ui.icone(l.icone)));
    caixa.hidden = !caixa.firstChild;
  };
  inp.addEventListener("input", pintar); inp.addEventListener("change", pintar);
  pintar();
  campo.classList.add("cp-com-links");
  campo.appendChild(caixa);
  return campo;
}

/** Lê os campos personalizados de um formulário → {chave: valor normalizado} e erros [{nome, texto}]. */
export function lerCamposPersonalizados(k, form, campos) {
  const { ui, L } = k;
  const d = ui.lerForm(form);
  const valores = {}, erros = [];
  for (const c of campos) {
    const n = `campo__${c.chave}`;
    let v = d[n];
    // moeda: o texto cru — normalizarCampo usa L.lerNumero, o leitor do CRM inteiro (plano 1000b · RB-064: o ui.lerMoeda trata o milhar «1.500», mas lê
    // «1,234.56» diferente; o CRM fica com um leitor só)
    if (c.tipo === "moeda") { const el = form.querySelector(`[name="${n}"]`); v = el ? el.value : (typeof v === "number" ? String(v) : v); }
    const er = L.validarCampo(c, v);
    if (er) { erros.push({ nome: n, texto: er }); continue; }
    valores[c.chave] = L.normalizarCampo(c, v);
  }
  return { valores, erros };
}

/* ============================================================ perguntas ao mover */
/** plano 1000b · RB-038: sempre um nome FEMININO (como rel-logica.palavraAgenda) — «compromisso» saía «Agendar a compromisso», «Data e hora da compromisso». */
function nomeCompromisso(k) {
  return { odonto: "consulta", oficina: "visita", loja: "entrega" }[k.v.vertical] || "consulta";
}

/**
 * plano 1000b · RB-063: «Salvo» discreto AO LADO do campo (role=status, some em 2 s) — o toast a cada campo inundava o leitor de tela.
 * `perto` = o elemento ao qual o selo se junta (o dd do campo, o rótulo do campo personalizado).
 */
export function marcarSalvo(k, perto, texto = "Salvo") {
  if (!perto || typeof perto.appendChild !== "function") return null;
  let el = [...(perto.children || [])].find(c => c && c.classList && c.classList.contains("ed-ok")) || null;
  if (!el) { el = k.h("small", { class: "ed-ok", role: "status" }); perto.appendChild(el); }
  el.textContent = texto;
  el.hidden = false;
  clearTimeout(el._salvoTimer);
  el._salvoTimer = setTimeout(() => { el.hidden = true; el.textContent = ""; }, 2000);
  return el;
}

async function pedirGanho(k, card, estagio, detalhe) {
  const { ui, h, L } = k;
  const funil = k.funilDoEstagio(estagio.id);
  // plano 1000b · RB-058: sem conseguir ler o negócio não dá para saber o que já está preenchido — avisa e os obrigatórios ficam OPCIONAIS no
  // modal (só vai o que for digitado; o servidor confere o resto). Antes pedia todos como se estivessem vazios.
  const semConferir = !!(detalhe && detalhe.falhou);
  const faltam = L.obrigatoriosVazios(k.base.campos, "negocio", funil && funil.id, (detalhe && !semConferir && detalhe.campos) || card.campos || {})
    .map(c => (semConferir ? { ...c, obrigatorio: false } : c));
  const ticket = card.servico && k.base.ticket ? k.base.ticket[card.servico] : null;
  const sug = card.valor ?? card.valor_previsto ?? (Number.isFinite(Number(ticket)) ? Number(ticket) : null);
  const form = h("form", { class: "crm-form", novalidate: true },
    ui.campo({ rotulo: "Valor final", nome: "valor", tipo: "moeda", valor: sug ?? "", obrigatorio: true,
      ajuda: funil && funil.conta_no_ads ? "Entra na receita do retorno do anúncio (Anúncios e relatórios)." : "O valor que foi fechado de verdade." }),
    semConferir && faltam.length ? h("p", { class: "aviso aviso-aten ng-sem-conferir", role: "note" }, ui.icone("alerta"),
      h("span", null, "Não consegui conferir os campos agora. Preencha abaixo só os que ainda faltam; os que já estão preenchidos ficam como estão.")) : null,
    faltam.length && !semConferir ? h("p", { class: "sub" }, "Preencha também os campos obrigatórios deste funil:") : null,
    ...faltam.map(c => campoPersonalizado(k, c, null)));
  let zeroConfirmado = false;
  return ui.modal({
    titulo: `Marcar como «${estagio.nome}»`, corpo: form,
    descricao: `${L.tituloCard(card)}`,
    acoes: [
      { rotulo: "Cancelar", tipo: "neutro", valor: null },
      // plano 1000b · RB-043: só «Confirmar» (o título já diz «Marcar como «Fechou»»; «Confirmar fechou» soava errado)
      { rotulo: "Confirmar", tipo: "primario", fn: api => {
        ui.marcarErro(form, null);
        const d = ui.lerForm(form);
        d.valor = L.lerNumero(form.querySelector('[name="valor"]').value);   // "1.500" = mil e quinhentos
        if (d.valor === null || d.valor === undefined || !(d.valor >= 0)) { ui.marcarErro(form, "valor", "Informe o valor final."); zeroConfirmado = false; return false; }
        // plano 1000 (CR-053): R$ 0 pede uma segunda confirmação no próprio modal — num funil dos anúncios derruba o retorno sem a pessoa perceber
        if (d.valor === 0 && !zeroConfirmado) {
          zeroConfirmado = true;
          const txt = funil && funil.conta_no_ads ? "Valor zero não entra na receita do anúncio. Confirmar mesmo assim? Toque em «Confirmar» de novo."
            : "Valor zero: fica registrado sem valor. Confirmar mesmo assim? Toque em «Confirmar» de novo.";
          if (api && typeof api.erro === "function") api.erro(txt); else ui.marcarErro(form, "valor", txt);
          return false;
        }
        if (d.valor !== 0) zeroConfirmado = false;
        const { valores, erros } = lerCamposPersonalizados(k, form, faltam);
        if (erros.length) { ui.marcarErro(form, erros[0].nome, erros[0].texto); return false; }
        // RB-058: sem a conferência, só os valores digitados (vazio não apaga o que já existe no servidor)
        const enviar = semConferir ? Object.fromEntries(Object.entries(valores).filter(([, v]) => v !== null && v !== undefined && v !== "" && !(Array.isArray(v) && !v.length))) : valores;
        if (!faltam.length) return { valor: d.valor };
        return { valor: d.valor, ...(Object.keys(enviar).length ? { campos: enviar } : {}) };
      } },
    ],
  });
}

async function pedirPerda(k, card, estagio) {
  const { ui, h, L } = k;
  const motivos = k.base.motivos || [];
  const nomeRadio = L.idUnico ? L.idUnico("mot") : `mot-${Date.now()}`;      // plano 1500c · RC-090: dois modais no mesmo milissegundo não dividem o grupo
  const lista = h("div", { class: "crm-motivos", role: "radiogroup", "aria-label": "Motivo da perda" },
    motivos.map(m => h("label", { class: "crm-motivo" },
      h("input", { type: "radio", name: nomeRadio, value: m.id, dataset: { texto: m.exige_texto ? "1" : "" } }),
      h("span", null, m.nome, m.exige_texto ? h("small", null, "pede justificativa") : null))));
  const texto = ui.campo({ rotulo: motivos.length ? "Justificativa" : "O que aconteceu? (opcional)", nome: "motivo_perda_txt", tipo: "textarea", max: 500, linhas: 3 });
  // plano 1000 (CR-298): «Sem dinheiro agora» não some do radar — uma tarefa para retomar o contato daqui a 30/60/90 dias (opcional)
  const retomar = k.pode("atendente") ? h("select", { name: "retomar_dias", class: "sel", "aria-label": "Retomar o contato" },
    [["", "Não criar lembrete"], ["30", "Daqui a 30 dias"], ["60", "Daqui a 60 dias"], ["90", "Daqui a 90 dias"]].map(([v, t]) => h("option", { value: v }, t))) : null;
  const form = h("form", { class: "crm-form", novalidate: true },
    motivos.length ? h("div", { class: "pilha-p" }, h("span", { class: "campo-rot" }, "Por que não deu certo?", h("span", { class: "obrig", "aria-hidden": "true" }, " *")), lista) : null,
    texto,
    retomar ? h("label", { class: "campo crm-retomar" }, h("span", { class: "campo-rot" }, "Retomar o contato depois?"), retomar,
      // plano 1000b · RB-041: o termo da vertical («a este orçamento», «a esta oportunidade»)
      h("small", { class: "campo-ajuda" }, `Cria uma tarefa às 9h do dia escolhido, ligada a ${k.v.art("negocio") === "a" ? "esta" : "este"} ${k.v.min("negocio")}.`)) : null);
  return ui.modal({
    titulo: `Marcar como «${estagio.nome}»`, corpo: form, descricao: L.tituloCard(card),
    acoes: [
      { rotulo: "Cancelar", tipo: "neutro", valor: null },
      { rotulo: "Confirmar", tipo: "perigo", fn: api => {     // plano 1000b · RB-043
        const sel = form.querySelector(`input[name="${nomeRadio}"]:checked`);
        const t = form.querySelector("textarea").value.trim();
        if (motivos.length && !sel) { api.erro("Escolha o motivo da perda."); return false; }
        if (sel && sel.dataset.texto && !t) { ui.marcarErro(form, "motivo_perda_txt", "Esse motivo pede uma justificativa."); return false; }
        const dias = retomar && retomar.value ? Number(retomar.value) : 0;
        return { ...(sel ? { motivo_perda_id: sel.value } : {}), ...(t ? { motivo_perda_txt: t } : {}), ...(dias ? { retomar_dias: dias } : {}) };
      } },
    ],
  });
}

async function pedirAgenda(k, card, estagio) {
  const { ui, h, L } = k;
  const nome = nomeCompromisso(k);
  const amanha = new Date(Date.now() + 24 * 3600000);
  const padrao = card.consulta_em ? L.paraDataHoraLocal(card.consulta_em) : `${ui.hojeSP ? ui.hojeSP(amanha) : amanha.toISOString().slice(0, 10)}T09:00`;
  const form = h("form", { class: "crm-form", novalidate: true },
    ui.campo({ rotulo: `Data e hora da ${nome}`, nome: "consulta_em", tipo: "datahora", valor: padrao,
      ajuda: `É esta data que o lembrete automático usa (24 h antes da ${nome}).` }));
  let confirmadoPassado = null;
  return ui.modal({
    titulo: `Agendar a ${nome}`, corpo: form, descricao: L.tituloCard(card), largura: "p",
    acoes: [
      { rotulo: "Cancelar", tipo: "neutro", valor: null },
      { rotulo: "Mover sem data", tipo: "neutro", valor: {} },
      { rotulo: "Agendar", tipo: "primario", fn: api => {
        const d = ui.lerForm(form);
        if (!d.consulta_em) { ui.marcarErro(form, "consulta_em", "Escolha a data e a hora."); return false; }
        // plano 1000 (CR-052): data no passado pede confirmação (o lembrete de 24 h nunca rodaria) — o 2º «Agendar» com a mesma data confirma
        if (L.dataPassou(d.consulta_em) && confirmadoPassado !== d.consulta_em) {
          confirmadoPassado = d.consulta_em;
          const txt = `${L.TEXTO_DATA_PASSOU} O lembrete automático não vai rodar. Toque em «Agendar» de novo para confirmar.`;
          if (api && typeof api.erro === "function") api.erro(txt); else ui.marcarErro(form, "consulta_em", txt);
          return false;
        }
        return { consulta_em: d.consulta_em };
      } },
    ],
  });
}

/** O que precisa perguntar para mover `card` até `estagio` → extra {} | null (cancelado). */
export async function prepararMovimento(k, card, estagio) {
  const atual = k.estagio(card.estagio_id);
  const pedido = k.L.pedidoAoMover(estagio, atual);
  if (!pedido) return {};
  if (pedido === "ganho") {
    let detalhe = null;
    const funil = k.funilDoEstagio(estagio.id);
    const obrig = k.L.camposDe(k.base.campos, "negocio", funil && funil.id).some(c => c.obrigatorio);
    if (obrig && !card.campos) {
      try { detalhe = (await k.api.rpcC("nx_negocio_ver", { p_id: card.id })).negocio; } catch { detalhe = { falhou: true }; }     // plano 1000b · RB-058
    }
    return pedirGanho(k, card, estagio, detalhe);
  }
  if (pedido === "perdido") return pedirPerda(k, card, estagio);
  if (pedido === "agendada") return pedirAgenda(k, card, estagio);
  return {};
}

/** nx_negocio_mover → Card (lança o erro do servidor, com .codigo/.hint). `keepalive`: a página está saindo — o pedido termina mesmo com a aba fechada. */
export function moverNegocio(k, card, estagio, { ordem = null, extra = {}, keepalive = false } = {}) {
  // plano 1000 (CR-298): «retomar_dias» é da tela (não vai ao servidor) — depois da perda gravada, cria a tarefa de retomada
  const { retomar_dias: dias, ...resto } = extra || {};
  const p = k.api.rpcC("nx_negocio_mover", { p_id: card.id, p_estagio: estagio.id, p_ordem: ordem, p_extra: resto }, keepalive ? { keepalive: true } : {});
  if (!dias) return p;
  return p.then(r => { criarRetomada(k, card, dias, { keepalive }); return r; });
}
/** CR-298: a tarefa «Retomar contato» (às 9h de SP, daqui a N dias), ligada ao negócio e ao contato. Falhar aqui não desfaz a perda: avisa. */
async function criarRetomada(k, card, dias, { keepalive = false } = {}) {
  const vence = k.L.retomarEm(dias);
  if (!vence) return null;
  const idContato = card.contato && card.contato.id != null ? card.contato.id : (card.contato_id ?? null);
  // plano 1500c · RC-091: o tipo segue o que o contato tem — telefone → WhatsApp; só e-mail → e-mail; nenhum → tarefa
  const tel = card.telefone || (card.contato && card.contato.telefone);
  const mail = card.email || (card.contato && card.contato.email);
  const semInfo = tel === undefined && mail === undefined;      // o cartão não trouxe os meios de contato: fica como antes (WhatsApp)
  const tipo = tel || semInfo ? "whatsapp" : mail ? "email" : "tarefa";
  const p = { titulo: `Retomar contato — ${k.L.tituloCard(card)}`.slice(0, 160), tipo, vence_em: vence, negocio_id: card.id,
    ...(idContato != null ? { contato_id: idContato } : {}), ...(typeof k.eu === "function" && k.eu() ? { dono_id: k.eu() } : {}) };
  try {
    const t = await k.api.rpcC("nx_tarefa_salvar", { p_tarefa: p }, keepalive ? { keepalive: true } : {});
    if (k.ui && k.ui.anunciar) k.ui.anunciar(`Tarefa para retomar o contato em ${dias} dias criada.`);
    return t;
  } catch (e) {
    if (k.ui && k.ui.toast) k.ui.toast(`A perda foi registrada, mas a tarefa de retomada não foi criada: ${k.erro ? k.erro(e) : "tente criar à mão"}.`, { tipo: "erro" });
    return null;
  }
}

/** Pergunta o que for preciso e move. → Card | null (cancelado). Erros sobem. */
export async function moverComPerguntas(k, card, estagio, ordem = null) {
  const extra = await prepararMovimento(k, card, estagio);
  if (extra === null) return null;
  return moverNegocio(k, card, estagio, { ordem, extra });
}

/* ============================================================ edição por campo */
/** plano 1000 (CR-097): `salvar` devolve isto quando a pessoa desistiu (ex.: não confirmou) — nada foi gravado e o campo já voltou ao valor de antes. */
export const CANCELAR_EDICAO = Symbol("cancelar_edicao");
/** Linha dt/dd com input .ed que salva sozinho (change/blur). aoErro(e, erroEl) personaliza a mensagem. */
export function linhaEd(k, { rotulo, controle, salvar, ler, desabilitado, aoErro, validar, aviso, largo = false }) {
  const { ui, h } = k;
  const erro = h("small", { class: "ed-erro", role: "alert", hidden: true });
  // plano 1000 (CR-052): aviso que NÃO bloqueia (ex.: «Essa data já passou») — `aviso(controle)` → texto | null, conferido a cada mudança
  const avisoEl = aviso ? h("small", { class: "ed-aviso", role: "status", hidden: true }) : null;
  const pintarAviso = () => { if (!avisoEl) return; const t = aviso(controle); avisoEl.textContent = t || ""; avisoEl.hidden = !t; };
  const id = `ed-${Math.random().toString(36).slice(2, 9)}`;
  controle.id = id;
  controle.classList.add("ed");
  if (desabilitado) controle.disabled = true;
  let ultimo = ler(controle);
  let salvando = false;
  let outraMudanca = false;    // plano 1000 (CR-047): mudou de novo enquanto a gravação anterior não voltava — grava o valor novo depois
  // plano 1000 (CR-057): o Esc devolve o valor como ele aparece (dinheiro com 2 casas: «6.800,00», não «6800»)
  const exibir = v => (typeof v === "number" ? v.toLocaleString("pt-BR", { minimumFractionDigits: 2, maximumFractionDigits: 2 }) : (v ?? ""));
  /** validar(controle) → texto do erro ou null: texto que não vira valor (ex.: «abc» num campo de dinheiro) NÃO é gravado como se fosse «vazio». */
  const mostrarInvalido = texto => {
    ui.limpar(erro);
    erro.textContent = texto;
    erro.hidden = false;
    controle.setAttribute("aria-invalid", "true");
    controle.setAttribute("aria-describedby", erro.id = `${id}-er`);
  };
  async function aoMudar() {
    pintarAviso();
    const invalido = validar ? validar(controle) : null;
    if (invalido) { mostrarInvalido(invalido); return; }
    const v = ler(controle);
    if (salvando) { outraMudanca = true; return; }          // antes: descartado em silêncio (o 2º valor nunca era gravado)
    if (JSON.stringify(v) === JSON.stringify(ultimo)) {
      erro.hidden = true; controle.removeAttribute("aria-invalid");   // voltou ao valor que já estava gravado
      return;
    }
    salvando = true;
    erro.hidden = true; controle.removeAttribute("aria-invalid");
    try {
      if ((await salvar(v)) === CANCELAR_EDICAO) return;
      ultimo = v;
      marcarSalvo(k, controle.parentElement);      // plano 1000b · RB-063: status discreto ao lado do campo (antes: toast a cada campo)
    } catch (e) {
      ui.limpar(erro);
      // plano 1500c · RC-265: sem internet o valor digitado FICA no campo e a gravação é refeita sozinha quando a conexão voltar
      const semRede = (typeof navigator !== "undefined" && navigator && navigator.onLine === false) || (e && e.codigo === "sem_conexao");
      if (semRede) {
        erro.textContent = "Não salvo — tentaremos quando a conexão voltar.";
        if (!controle._esperaRede && typeof addEventListener === "function") {
          controle._esperaRede = () => { removeEventListener("online", controle._esperaRede); controle._esperaRede = null; if (controle.isConnected !== false) aoMudar(); };
          addEventListener("online", controle._esperaRede);
        }
      } else erro.textContent = k.erro(e);
      if (aoErro && !semRede) try { aoErro(e, erro); } catch { /* ok */ }
      erro.hidden = false;
      controle.setAttribute("aria-invalid", "true");
      controle.setAttribute("aria-describedby", erro.id = `${id}-er`);
    } finally {
      salvando = false;
      if (outraMudanca) { outraMudanca = false; await aoMudar(); }     // relê o campo: grava o valor novo (se ainda for diferente do gravado)
    }
  }
  const evento = controle.tagName === "SELECT" || controle.type === "date" || controle.type === "datetime-local" ? "change" : "blur";
  controle.addEventListener(evento, aoMudar);
  if (avisoEl && evento !== "change") controle.addEventListener("change", pintarAviso);
  // plano 1500c · RC-092: o Esc também desfaz (e não fecha a gaveta) na observação (TEXTAREA); Enter só sai do INPUT (no TEXTAREA é quebra de linha)
  if ((controle.tagName === "INPUT" && controle.type !== "date" && controle.type !== "datetime-local") || controle.tagName === "TEXTAREA") {
    controle.addEventListener("keydown", ev => {
      if (ev.key === "Enter" && controle.tagName === "INPUT") { ev.preventDefault(); controle.blur(); }
      if (ev.key === "Escape") {
        // plano 1000b · RB-057: com o valor mudado, o Esc só desfaz a edição — não sobe para o diálogo e não fecha a gaveta (como o título)
        if (controle.value !== exibir(ultimo)) { ev.preventDefault(); ev.stopPropagation(); }
        controle.value = exibir(ultimo); controle.blur();
      }
    });
  }
  // um bloco por campo (M24): no desktop é «rótulo | valor»; no celular os blocos formam uma grade de 2 colunas (`largo` ocupa a linha toda)
  return [h("div", { class: ["ng-campo", largo && "ng-campo-largo"] }, h("dt", null, h("label", { for: id }, rotulo)), h("dd", null, controle, avisoEl), erro)];
}

/* ============================================================ gaveta do negócio */
// celular (≤ 760 px): as ações (Marcar consulta, Fechou, Não fechou, ⋮) descem para um rodapé fixo da gaveta (plano 50, item 26)
const telaPequena = () => { try { return !!(globalThis.matchMedia && globalThis.matchMedia("(max-width: 760px)").matches); } catch { return false; } };

export async function abrirNegocio(k, id, { aoMudar, aoFechar, aoCarregar, vizinhos, aoNavegar } = {}) {
  const { ui, h, L } = k;
  let fechada = false;
  // revisão: fechar a gaveta com Ganhou/Perdeu/Reabrir ainda no prazo do «Desfazer» grava NA HORA — antes o movimento ficava solto: a
  // gaveta reaberta deixava fazer outro por cima e o arrasto no Kanban era sobrescrito 7 s depois pelo firmar desta gaveta
  let cancelarPulsoG = null;
  const soltarPulsoG = () => { if (cancelarPulsoG) { try { cancelarPulsoG(); } catch { /* ok */ } cancelarPulsoG = null; } };   // plano 1000 (CR-067)
  const g = ui.gaveta({ titulo: k.v.negocio, largura: "g", aoFechar: () => { fechada = true; if (pend && !pend.efetivado && pend.firmarAgora) pend.firmarAgora(); soltarPulsoG(); if (aoFechar) aoFechar(); } });
  const corpo = g.corpo;
  corpo.appendChild(ui.esqueleto("cartao"));
  let abaAtual = "resumo";
  // plano 100 · C1: Ganhou/Perdeu/Reabrir pela gaveta = o MESMO movimento adiado do Kanban (a tela muda já; o servidor — e as automações — só depois
  // dos 7 s do «Desfazer»). `pend` = o movimento que ainda pode ser desfeito ou está gravando; enquanto existe, a gaveta não aceita outro por cima.
  let pend = null;
  let ultimo = null;          // a última resposta de nx_negocio_ver (o «Desfazer» antes do servidor redesenha com ela)
  let focouTitulo = false, ultimaLeitura = 0;

  // plano 1000: conteúdo trocado pelo código (outro negócio, pulso, campo gravado) vira a base da proteção de texto não salvo — sem isso a
  // assinatura do 1º clique ficava congelada e o «›» seguinte travava com «Há texto não salvo» sem nada digitado
  const zerarProt = () => { if (typeof g.zerar === "function") g.zerar(); };
  async function carregar({ seMudou = false, zerar = false } = {}) {
    try {
      const d = await k.api.rpcC("nx_negocio_ver", { p_id: id });
      if (fechada) return;
      if (seMudou && JSON.stringify(d) === JSON.stringify(ultimo)) { ultimaLeitura = Date.now(); return; }
      ultimo = d;
      ultimaLeitura = Date.now();
      if (aoCarregar) try { aoCarregar(d); } catch (e) { console.error(e); }      // plano 1000 (CR-039)
      // chegou uma leitura no meio dos 7 s (outra aba, o pulso): a tela continua mostrando o destino pedido
      desenhar(pend && !pend.efetivado ? comPendente(d, pend) : d);
      if (zerar) zerarProt();
      // plano 1000 (CR-050): ao abrir, o foco vai para o TÍTULO da gaveta — nunca para um controle editável (seta no select «Responsável»
      // trocava o responsável sem querer). Depois do foco inicial do ui.gaveta (30 ms); não rouba o foco se a pessoa já foi para outro lugar.
      if (!focouTitulo) {
        focouTitulo = true;
        setTimeout(() => {
          if (typeof document === "undefined") return;
          const t = corpo.querySelector(".ng-titulo-txt");
          const a = document.activeElement;
          const raizG = g.el || corpo;
          if (t && !fechada && (!a || a === document.body || (raizG.contains && raizG.contains(a)))) { try { t.focus({ preventScroll: true }); } catch { t.focus(); } }
        }, 60);
      }
    } catch (e) {
      if (fechada) return;
      ui.limpar(corpo);
      corpo.appendChild(ui.erroCartao(e, carregar));
    }
  }

  /**
   * plano 1000 (CR-072): aberta pelo quadro, a gaveta anda pelos cartões da MESMA coluna (‹ › e as teclas J/K) sem fechar — a mesma gaveta troca de
   * negócio. Nada anda com um movimento esperando o «Desfazer» ou com texto não salvo.
   */
  function irPara(passo) {
    if (typeof vizinhos !== "function" || fechada) return false;
    const v = vizinhos(id) || {};
    const alvo = passo < 0 ? v.anterior : v.proximo;
    if (alvo == null) { ui.anunciar(passo < 0 ? "Este é o primeiro cartão da etapa." : "Este é o último cartão da etapa."); return false; }
    if (pend) { ui.toast("Espere o «Desfazer» terminar para ir a outro cartão.", { tipo: "info" }); return false; }
    if (typeof g.estaSujo === "function" && g.estaSujo()) { ui.toast("Há texto não salvo nesta gaveta.", { tipo: "info" }); return false; }
    id = alvo; focouTitulo = false; ultimo = null; abaAtual = "resumo";
    if (aoNavegar) try { aoNavegar(alvo); } catch (e) { console.error(e); }
    carregar({ zerar: true });
    return true;
  }
  const aoTeclaNav = ev => {
    if (fechada || ev.ctrlKey || ev.metaKey || ev.altKey || (ev.key !== "j" && ev.key !== "k" && ev.key !== "J" && ev.key !== "K")) return;
    const a = ev.target;
    if (a && (a.isContentEditable || /^(INPUT|TEXTAREA|SELECT)$/.test(a.tagName || ""))) return;
    if (typeof document !== "undefined" && document.querySelector && document.querySelector("dialog[open]") && !(g.el && g.el.contains && g.el.contains(a))) return;
    ev.preventDefault();
    irPara(ev.key.toLowerCase() === "j" ? 1 : -1);
  };
  if (typeof vizinhos === "function") corpo.addEventListener("keydown", aoTeclaNav);
  // plano 1500c · RC-281: G = ganhar, P = perder com a gaveta em foco (fora de campos de texto); o desenho de cada abertura diz o que cada tecla faz
  let atalhosGP = null;
  corpo.addEventListener("keydown", ev => {
    if (fechada || !atalhosGP || ev.ctrlKey || ev.metaKey || ev.altKey || ev.shiftKey) return;
    const tecla = String(ev.key || "").toLowerCase();
    if (tecla !== "g" && tecla !== "p") return;
    const a = ev.target;
    if (a && (a.isContentEditable || /^(INPUT|TEXTAREA|SELECT)$/.test(a.tagName || ""))) return;
    const fn = tecla === "g" ? atalhosGP.ganhar : atalhosGP.perder;
    if (!fn) return;
    ev.preventDefault();
    fn();
  });

  /** plano 1000b · RB-061: outro negócio (do mesmo contato) na MESMA gaveta, como o ‹ › — e entra em «Recentes» da paleta. */
  function trocarPara(alvo, titulo) {
    if (fechada || alvo == null || alvo === id) return false;
    if (pend) { ui.toast("Espere o «Desfazer» terminar para abrir outro.", { tipo: "info" }); return false; }
    if (typeof g.estaSujo === "function" && g.estaSujo()) { ui.toast("Há texto não salvo nesta gaveta.", { tipo: "info" }); return false; }
    id = alvo; focouTitulo = false; ultimo = null; abaAtual = "resumo";
    if (typeof k.lembrarRecente === "function") try { k.lembrarRecente({ hash: `#/crm/negocio/${alvo}`, titulo: titulo || k.v.negocio, tipo: "negocio" }); } catch { /* ok */ }
    carregar({ zerar: true });
    return true;
  }

  function avisar(n) { if (aoMudar && n) try { aoMudar(n); } catch (e) { console.error(e); } }

  /** A resposta do servidor com o movimento pendente aplicado na tela (etapa, status, valor final, data da consulta). */
  function comPendente(d, p) {
    return { ...d, negocio: { ...d.negocio, estagio_id: p.destino.id, ...L.patchMovimento(p.destino, p.extra) } };
  }

  /** Erro ambíguo (prazo, conexão): o servidor pode ter gravado. → a etapa em que o negócio está de verdade, ou null se não deu para saber. */
  async function etapaReal() {
    try { const r = await k.api.rpcC("nx_negocio_ver", { p_id: id }); return r && r.negocio ? r.negocio.estagio_id : null; }
    catch { return null; }
  }

  /**
   * C1: movimento que muda a natureza do negócio (aberto ↔ ganho/perdido). A gaveta já mostra o destino; `firmar` (a gravação de verdade) roda
   * quando o aviso fecha sem «Desfazer» — ou na hora, com keepalive, se a página sair/ficar oculta (ui.acaoComDesfazer cuida disso).
   * «Desfazer» antes disso = nada foi ao servidor, nenhuma automação disparou.
   */
  async function moverAdiado(n, destino, extra, dAntes) {
    const mov = { destino, extra, efetivado: false, promessa: null };
    pend = mov;
    if (!fechada) desenhar(comPendente(dAntes, mov));
    const titulo = L.tituloCard(n);
    const valor = destino.tipo === "ganho" ? (extra.valor ?? n.valor_previsto ?? null) : null;
    const texto = L.textoMovimento({ titulo, destino, valor, ganhar: k.v.ganhar, artigo: k.v.art("negocio"), brl: v => ui.brl(v) });
    ui.anunciar(`${titulo}: ${destino.nome}. Dá para desfazer por 7 segundos.`);
    const firmar = (o = null) => {
      if (mov.promessa) return mov.promessa;
      mov.efetivado = true;
      mov.promessa = (async () => {
        let card;
        try { card = await moverNegocio(k, n, destino, { extra, keepalive: !!(o && o.saindo) }); }
        catch (e) {
          // o servidor pode ter aplicado mesmo com o erro: confere ANTES de dizer que não foi
          if (!(L.erroAmbiguo(e) && (await etapaReal()) === destino.id)) { if (pend === mov) pend = null; throw e; }
          card = { id: n.id, estagio_id: destino.id };
        }
        if (pend === mov) pend = null;
        avisar(card);
        if (!fechada) await carregar();
        return card;
      })();
      return mov.promessa;
    };
    const reverter = async () => {
      const foi = mov.efetivado;
      if (pend === mov) pend = null;
      if (fechada) return;
      if (foi) await carregar();                       // a gravação falhou: a tela volta ao que o servidor tem
      else { desenhar(ultimo || dAntes); ui.anunciar("Movimento desfeito."); }
    };
    await ui.acaoComDesfazer({ texto, reverter, firmar, aoCriar: h => { mov.firmarAgora = h.firmarAgora; } });
  }

  function desenhar(d) {
    const n = d.negocio;
    const funil = k.funil(n.funil_id) || d.funil || (k.funilDoEstagio ? k.funilDoEstagio(n.estagio_id) : null);   // sem funil_id na resposta: o funil da etapa
    const estagio = k.estagio(n.estagio_id) || d.estagio;
    if (!n.status) n.status = n.estagio_tipo || (estagio && estagio.tipo) || "aberto";   // o status acompanha o tipo da etapa
    const podeEditar = k.pode("atendente");
    ui.limpar(corpo);
    g.trocarTitulo(`${k.v.negocio}${funil ? ` · ${funil.nome}` : ""}`);

    async function salvar(chaves) {
      const r = await k.api.rpcC("nx_negocio_salvar", { p_negocio: { id: n.id, ...chaves } });
      Object.assign(n, r);
      avisar(r);
      zerarProt();
      return r;
    }
    async function mover(e) {
      if (pend) {
        ui.toast(pend.efetivado ? "Ainda estamos gravando a última mudança. Tente de novo em instantes."
          : "A última mudança ainda pode ser desfeita. Toque em «Desfazer» ou espere alguns segundos.", { tipo: "info" });
        return;
      }
      // o que era antes: o «Desfazer» devolve a etapa (e, se for o caso, o valor final, o motivo da perda ou a data da consulta)
      const antes = { estagio: k.estagio(n.estagio_id), ordem: n.ordem ?? null, valor: n.valor, valor_previsto: n.valor_previsto, consulta_em: n.consulta_em ?? null,
        motivo_perda_id: n.motivo_perda_id, motivo_perda_txt: n.motivo_perda_txt };
      try {
        const extra = await prepararMovimento(k, n, e);
        if (extra === null) return;
        // ganho/perdido/reabrir: o mesmo movimento adiado do Kanban (as automações só disparam depois dos 7 s)
        if (L.movimentoAdiado(antes.estagio && antes.estagio.tipo, e.tipo)) { await moverAdiado(n, e, extra, d); return; }
        const card = await moverNegocio(k, n, e, { extra });
        avisar(card);
        // plano 1000b · RB-048: «Movida» quando o registro da vertical é feminino (oportunidade), como no quadro
        const movido = `Movid${k.v.art("negocio") === "a" ? "a" : "o"}`;
        ui.anunciar(`${movido} para ${e.nome}.`);
        await carregar();
        if (antes.estagio) ui.acaoComDesfazer({ texto: `${movido} para «${e.nome}».${e.tipo !== "aberto" ? " Mensagens automáticas já enviadas não voltam." : ""}`, reverter: async () => {
          const volta = await moverNegocio(k, { id: n.id }, antes.estagio, { ordem: antes.ordem, extra: L.extraDeVolta(antes) });
          // plano 1000b · RB-059: a 2ª gravação (a data) falhou — a etapa voltou, mas a data não: aviso específico (não o erro genérico)
          if (extra && extra.consulta_em && antes.consulta_em !== extra.consulta_em) {
            try { await k.api.rpcC("nx_negocio_salvar", { p_negocio: { id: n.id, consulta_em: antes.consulta_em } }); }
            catch { ui.toast(L.avisoDataNaoVoltou(k.v.vertical), { tipo: "erro" }); if (!fechada) await carregar(); return; }
          }
          avisar(volta);
          if (!fechada) await carregar();
        } });
      } catch (err) { k.toastErro(err); }
    }
    const pendente = !!pend;

    /* C6: presença na consulta que já passou («Compareceu / Faltou», nx_agenda_presenca). Tocar de novo no marcado limpa; «Desfazer» devolve o de antes.
       Servidor sem a função (migração ainda não aplicada) → a gaveta esconde o bloco nesta sessão. */
    function blocoPresenca() {
      const atual = L.presencaDe(n);
      if (k.__semPresenca || !n.consulta_em || !L.consultaPassou(n) || (n.status !== "aberto" && !atual)) return null;
      const nome = nomeCompromisso(k);
      const fechado = n.status !== "aberto";
      return h("div", { class: "ng-presenca", role: "group", "aria-label": `Presença na ${nome}` },
        h("span", { class: "ng-presenca-txt" }, ui.icone("calendario"),
          h("span", null, `${nome[0].toUpperCase()}${nome.slice(1)} de ${ui.dataCurtaBR ? ui.dataCurtaBR(n.consulta_em) : ui.dataBR(n.consulta_em)} às ${ui.horaBR(n.consulta_em)}`)),
        h("div", { class: "ng-presenca-bts" }, ["compareceu", "faltou"].map(est => {
          const P = L.PRESENCAS[est];
          const b = h("button", { type: "button", class: ["bt", "bt-sec", "bt-p", "ng-pres", `ng-pres-${est}`], dataset: { estado: est }, "aria-pressed": String(atual === est),
            disabled: !podeEditar || pendente || fechado, title: atual === est ? "Tocar de novo limpa a marcação" : null }, ui.icone(P.icone), P.rotulo);
          b.addEventListener("click", () => marcarPresenca(est, b));
          return b;
        })));
    }
    async function marcarPresenca(est, botao) {
      const anterior = L.presencaDe(n);
      const pedido = L.proximaPresenca(anterior, est);
      const etapaAntes = { estagio: k.estagio(n.estagio_id), ordem: n.ordem ?? null };
      let r;
      try { r = await ui.carregando(botao, k.api.rpcC("nx_agenda_presenca", { p_negocio: n.id, p_estado: pedido })); }
      catch (e) {
        if (L.rpcAusente(e)) {
          k.__semPresenca = true;
          ui.toast("O servidor ainda não registra a presença da consulta. Assim que a atualização estiver no ar, os botões voltam.", { tipo: "info" });
          if (!fechada) desenhar(ultimo || d);
          return;
        }
        k.toastErro(e); return;
      }
      const estagioDepois = (r && r.estagio_id) || n.estagio_id;
      const moveu = !!(etapaAntes.estagio && estagioDepois !== etapaAntes.estagio.id);
      const destino = moveu ? k.estagio(estagioDepois) : null;
      avisar({ ...n, estagio_id: estagioDepois, campos: { ...(n.campos || {}), presenca: r && "presenca" in r ? r.presenca : (pedido === "limpar" ? null : pedido) } });
      if (!fechada) await carregar();
      const nome = nomeCompromisso(k);
      const texto = pedido === "limpar" ? "Presença limpa"
        : `${pedido === "faltou" ? `Faltou à ${nome}` : `Compareceu à ${nome}`}${destino ? ` · movid${k.v.art("negocio")} para «${destino.nome}»` : ""}`;
      ui.acaoComDesfazer({ texto, reverter: async () => {
        await k.api.rpcC("nx_agenda_presenca", { p_negocio: n.id, p_estado: L.voltaPresenca(anterior) });
        // «faltou» levou à etapa de marco «faltou»: o Desfazer devolve a etapa de antes (aberta → aberta: sem perguntas)
        if (moveu && etapaAntes.estagio) await moverNegocio(k, { id: n.id }, etapaAntes.estagio, { ordem: etapaAntes.ordem, extra: L.extraDeVolta(etapaAntes) });
        avisar({ ...n });
        if (!fechada) await carregar();
      } });
    }

    /* ---------- topo ---------- */
    const statusPil = n.status === "ganho" ? ui.pilula(k.v.ganhar, "ok", { icone: "check" })
      : n.status === "perdido" ? ui.pilula(k.v.perder, "ruim", { icone: "fechar" }) : ui.pilula("Em aberto", "prim");
    const dono = k.usuario(n.dono_id);
    const titulo = h("input", { class: "ng-titulo", value: n.titulo || "", maxlength: 120, "aria-label": "Título",
      placeholder: (d.contato && d.contato.nome) || n.nome || `Sem título`, disabled: !podeEditar });
    let tituloAntes = n.titulo || "";
    titulo.addEventListener("blur", async () => {
      const t = titulo.value.trim();
      if (t === tituloAntes) return;
      try { await salvar({ titulo: t }); tituloAntes = t; tituloTxt.textContent = t || (d.contato && d.contato.nome) || n.nome || "Sem título"; ui.anunciar("Título salvo."); }     // plano 1000b · RB-063
      catch (e) { k.toastErro(e); titulo.value = tituloAntes; }
    });
    const tituloTxt = h("h3", { class: "ng-titulo ng-titulo-txt", tabindex: "-1" }, n.titulo || (d.contato && d.contato.nome) || n.nome || "Sem título");
    const caixaTitulo = h("div", { class: "ng-titulo-l" }, tituloTxt);
    const lapis = podeEditar ? h("button", { type: "button", class: "bt-icone ng-lapis", "aria-label": "Editar o título", title: "Editar o título" }, ui.icone("editar")) : null;
    if (lapis) caixaTitulo.appendChild(lapis);
    const mostrarTexto = () => { tituloTxt.textContent = tituloAntes || (d.contato && d.contato.nome) || n.nome || "Sem título"; ui.limpar(caixaTitulo); caixaTitulo.append(...[tituloTxt, lapis].filter(Boolean)); if (lapis) lapis.focus({ preventScroll: true }); };
    if (lapis) lapis.addEventListener("click", () => { ui.limpar(caixaTitulo); caixaTitulo.appendChild(titulo); titulo.focus(); titulo.select(); });
    titulo.addEventListener("blur", () => setTimeout(() => { if (caixaTitulo.contains(titulo)) mostrarTexto(); }, 0));
    // Esc só cancela a edição do título (não fecha a gaveta)
    titulo.addEventListener("keydown", ev => { if (ev.key === "Enter") { ev.preventDefault(); titulo.blur(); } if (ev.key === "Escape") { ev.preventDefault(); ev.stopPropagation(); titulo.value = tituloAntes; titulo.blur(); } });

    const valorFinal = n.status === "ganho";
    const valorEl = h("div", { class: ["ng-valor", valorFinal && "ganho"] },
      // plano 1500c · RC-287: centavos só quando o valor tem (a mesma régua do cartão: «R$ 1.500», não «R$ 1.500,00» num lugar e «R$ 1.500» no outro)
      h("b", null, (valorFinal ? n.valor : n.valor_previsto) != null ? ui.brl(valorFinal ? n.valor : n.valor_previsto, { centavos: L.temCentavos(valorFinal ? n.valor : n.valor_previsto) }) : "Sem valor"),
      h("small", null, valorFinal ? "valor final" : "previsto"));

    const acoes = h("div", { class: "ng-acoes" });
    const estGanho = (funil ? funil.estagios : []).find(e => e.tipo === "ganho");
    const estPerda = (funil ? funil.estagios : []).find(e => e.tipo === "perdido");
    // M27: marcar a consulta daqui são 2 toques — «Marcar consulta» abre a janela com os horários livres prontos e o primeiro selecionado; «Confirmar» é o 2º
    if (podeEditar && n.status === "aberto" && k.ctx.carregar) {
      const remarcar = n.consulta_em && Date.parse(n.consulta_em) > Date.now();
      acoes.appendChild(h("button", { type: "button", class: "bt bt-sec ng-marcar", on: { click: async () => {
        try {
          const ag = await k.ctx.carregar("agenda");
          await ag.marcarConsulta(k.ctx, { negocio: { id: n.id, titulo: n.titulo || (d.contato && d.contato.nome) || n.nome, servico: n.servico, funil_nome: funil ? funil.nome : "", inicio: n.consulta_em, estagio_id: n.estagio_id, ordem: n.ordem ?? null },
            aoMudar: () => { if (!fechada) carregar(); } });
        } catch (err) { k.toastErro(err); }
      } } }, ui.icone("calendario"), remarcar ? `Remarcar ${nomeCompromisso(k)}` : `Marcar ${nomeCompromisso(k)}`));      // plano 1000b · RB-040: «Marcar visita» na oficina
    }
    atalhosGP = null;
    if (podeEditar && n.status === "aberto") {
      // plano 1500c · RC-281: a dica do botão anuncia o atalho (G/P)
      if (estGanho) acoes.appendChild(h("button", { type: "button", class: "bt bt-sec ng-ganhou", disabled: pendente, title: `${k.v.ganhar} (G)`, "aria-keyshortcuts": "G", on: { click: () => mover(estGanho) } }, ui.icone("check"), k.v.ganhar));
      if (estPerda) acoes.appendChild(h("button", { type: "button", class: "bt bt-sec ng-perdeu", disabled: pendente, title: `${k.v.perder} (P)`, "aria-keyshortcuts": "P", on: { click: () => mover(estPerda) } }, ui.icone("fechar"), k.v.perder));
      if (!pendente) atalhosGP = { ganhar: estGanho ? () => mover(estGanho) : null, perder: estPerda ? () => mover(estPerda) : null };
    }
    if (podeEditar && n.status !== "aberto" && funil) {
      // plano 1500c · RC-286: reabre na etapa ABERTA em que estava antes de fechar (pela linha do tempo); sem o histórico, a 1ª etapa como antes
      const primeira = L.etapaParaReabrir(d.tempo, funil.estagios) || funil.estagios.find(e => e.tipo === "aberto");
      if (primeira) acoes.appendChild(h("button", { type: "button", class: "bt bt-sec ng-reabrir", disabled: pendente, title: `Volta para «${primeira.nome}»`, on: { click: () => mover(primeira) } }, ui.icone("relogio"), "Reabrir"));
    }
    if (podeEditar && n.status === "ganho" && d.contato && !pendente) {
      acoes.appendChild(h("button", { type: "button", class: "bt bt-prim", on: { click: () => iniciarPosVenda(k, n, d.contato, { aoCriar: nv => { avisar({ ...nv, criado: true }); } }) } },
        ui.icone("mais"), "Iniciar pós-venda"));
    }
    // plano 1000b · RB-264: «Tarefa» nas ações do topo (como na ficha) — antes era preciso ir à aba Tarefas
    if (podeEditar && !pendente) {
      acoes.appendChild(h("button", { type: "button", class: "bt bt-sec ng-nova-tarefa", on: { click: async () => {
        try {
          const T = await k.mod("tarefas");
          const t = await T.formTarefa(k, null, { negocio_id: n.id, ...(n.dono_id != null ? { dono_id: n.dono_id } : {}) /* plano 1500c · RC-240 */, contato_id: d.contato && d.contato.id != null ? d.contato.id : (n.contato_id ?? null) });
          if (t) { ui.toast("Tarefa criada.", { tipo: "ok", ms: 2200 }); if (!fechada) carregar(); }
        } catch (err) { k.toastErro(err); }
      } } }, ui.icone("tarefa"), "Tarefa"));
    }
    const menuBt = h("button", { type: "button", class: "bt-icone", "aria-label": "Mais ações" }, ui.icone("opcoes"));
    menuBt.addEventListener("click", () => {
      const itens = [];
      // plano 1000 (CR-048): com «Fechou/Não fechou» ainda no prazo do «Desfazer» (ou gravando), mover de funil gravaria a etapa de ganho do funil
      // ANTIGO e excluir faria a gravação falhar — os dois ficam travados, com a mesma explicação do quadro
      const travado = !!pend;
      const dicaTrava = pend && pend.efetivado ? " (gravando a última mudança…)" : " (espere o «Desfazer» terminar)";
      if (podeEditar) itens.push({ rotulo: `Mover para outro funil…${travado ? dicaTrava : ""}`, icone: "funil", desabilitado: travado, fn: () => moverDeFunil(k, n, { aoMover: async card => { avisar(card); await carregar(); } }) });
      if (d.contato) itens.push({ rotulo: `Ver ficha d${k.v.art("contato") === "a" ? "a" : "o"} ${k.v.min("contato")}`, icone: "contato", fn: () => abrirContato(k, d.contato.id, {}) });
      // plano 1500c · RC-082: «Duplicar» — orçamento parecido para o mesmo cliente sem redigitar (sem histórico, tarefas nem notas)
      if (podeEditar && k.pode("atendente")) itens.push({ rotulo: "Duplicar", icone: "camadas", fn: () => novoNegocio(k, L.dadosDuplicar(n, d.contato), { aoCriar: c => avisar({ ...c, atualizado: true }) }) });
      // plano 1000b · RB-045: sem linkPublico do shell, o endereço DO NEGÓCIO (aberto pelo cartão, location.href era só #/crm)
      itens.push({ rotulo: "Copiar link", icone: "link", fn: () => ui.copiar(k.ctx.linkPublico ? k.ctx.linkPublico(`#/crm/negocio/${n.id}`) : `${location.origin || ""}${location.pathname || ""}#/crm/negocio/${n.id}`) });
      if (k.pode("admin")) itens.push("-", { rotulo: `Excluir${travado ? dicaTrava : ""}`, icone: "lixeira", perigo: true, desabilitado: travado, fn: async () => {
        const ok = await ui.confirmar({ titulo: `Excluir ${k.v.min("negocio")}?`, texto: `As tarefas e notas d${k.v.art("negocio") === "a" ? "ela" : "ele"} também serão apagadas. Não dá para desfazer.`, perigo: true, digitar: "excluir" });
        if (!ok) return;
        // plano 1000b · RB-047: «Excluída.» para oportunidade/venda
        try { await k.api.rpcC("nx_negocio_excluir", { p_id: n.id }); ui.toast(`Excluíd${k.v.art("negocio") === "a" ? "a" : "o"}.`, { tipo: "ok" }); avisar({ id: n.id, excluido: true }); g.fechar(); }
        catch (e) { k.toastErro(e); }
      } });
      ui.menu(menuBt, itens);
    });
    acoes.appendChild(menuBt);

    /* fita de etapas */
    // plano 1000b · RB-060: <ol> com um <li> por etapa e o BOTÃO dentro (antes <button role=listitem>: o leitor não dizia que era botão)
    const fita = h("ol", { class: "ng-fita", role: "list", "aria-label": "Etapas do funil" });
    const ordemAtual = estagio ? estagio.ordem : -1;
    for (const e of (funil ? funil.estagios : [])) {
      const atual = e.id === n.estagio_id;
      // plano 1000 (CR-069): a etapa atual continua FOCÁVEL (aria-disabled, não disabled) para o leitor de tela ouvir «Etapa atual»
      const b = h("button", { type: "button", class: ["ng-etapa", e.tipo === "aberto" && e.ordem < ordemAtual && n.status === "aberto" && "feita"],
        style: k.cor(e.cor) ? { "--cor": k.cor(e.cor) } : null, "aria-current": atual ? "step" : null, "aria-disabled": atual ? "true" : null,
        disabled: !atual && (!podeEditar || pendente), title: atual ? `Etapa atual: ${e.nome}` : `Mover para ${e.nome}` },
        h("span", null, e.nome), atual ? h("span", { class: "sr-only" }, " (etapa atual)") : null);
      if (!atual && podeEditar) b.addEventListener("click", () => mover(e));
      fita.appendChild(h("li", { class: "ng-fita-it" }, b));
    }

    // tempo na etapa atual com a mesma escala do cartão (verde→âmbar→vermelho pelo prazo da etapa ou 3/7 dias); só quando o servidor manda estagio_em
    const faixa = n.status === "aberto" && estagio && n.estagio_em ? L.faixaTempoEtapa(n.estagio_em, estagio.sla_horas) : null;
    const movel = telaPequena();
    // C4: a origem com a pílula padrão (anúncio com a plataforma; cadastro manual não ganha pílula)
    const orig = L.origemPilula(n, { manual: false });
    // plano 1000 (CR-070): quem trabalha o cartão vê ANTES de clicar em «Fechou» que faltam campos obrigatórios — a pílula leva até eles
    const faltamCampos = n.status === "aberto" ? L.obrigatoriosVazios(k.base.campos, "negocio", n.funil_id, n.campos || {}) : [];
    const pilFaltam = faltamCampos.length ? h("button", { type: "button", class: "pilula pilula-aten ng-faltam", title: faltamCampos.map(c => c.rotulo).join(", "),
      on: { click: () => irParaCampos() } }, ui.icone("alerta"), `Falta${faltamCampos.length === 1 ? "" : "m"} ${faltamCampos.length} campo${faltamCampos.length === 1 ? "" : "s"}`) : null;
    const viz = typeof vizinhos === "function" ? (vizinhos(n.id) || {}) : null;
    const nav = viz ? h("div", { class: "ng-nav", role: "group", "aria-label": "Outros cartões desta etapa" },
      h("button", { type: "button", class: "bt-icone ng-nav-ant", disabled: viz.anterior == null, "aria-label": "Cartão anterior da etapa (K)", title: "Anterior (K)", on: { click: () => irPara(-1) } }, ui.icone("seta-esq")),
      h("button", { type: "button", class: "bt-icone ng-nav-prox", disabled: viz.proximo == null, "aria-label": "Próximo cartão da etapa (J)", title: "Próximo (J)", on: { click: () => irPara(1) } }, ui.icone("seta-dir"))) : null;
    const topo = h("div", { class: "ng-topo" },
      nav,
      h("div", { class: "ng-status" }, statusPil,
        // plano 1500c · RC-283: previsão de fechamento vencida (negócio aberto) chama atenção ao abrir, não só ao editar o campo
        n.status === "aberto" && L.previsaoVencida(n.previsao_fechamento, ui.hojeSP ? ui.hojeSP() : null) ? ui.pilula("Previsão vencida", "aten", { icone: "alerta", class: "ng-prev-vencida", title: `A previsão de fechamento era ${String(n.previsao_fechamento).split("-").reverse().join("/")}` }) : null,
        pendente ?ui.pilula("Confirmando…", "neutra", { icone: "relogio", class: "ng-confirmando", title: "Dá para desfazer pelo aviso por alguns segundos" }) : null,
        faixa ? ui.pilula(L.textoDiasEtapa(n.estagio_em), faixa.nivel === "ruim" ? "ruim" : faixa.nivel === "aten" ? "aten" : "neutra", { icone: "relogio", title: faixa.texto, class: "ng-tempo" }) : null,
        orig ? ui.pilula(null, orig.chave, { variante: "origem", plataforma: orig.plataforma, class: "ng-origem" }) : null,
        funil && funil.conta_no_ads ? ui.pilula("Conta nos anúncios", "neutra", { title: "Este funil entra nos números de Anúncios" }) : null,
        dono ? ui.pilula(dono.nome, "neutra", { icone: "usuario" }) : null, pilFaltam),
      caixaTitulo,
      h("div", { class: "ng-linha1" }, valorEl, movel ? null : acoes),
      fita,
      blocoPresenca(),
      n.status === "perdido" && (n.motivo_perda_id || n.motivo_perda_txt)
        ? h("p", { class: "aviso aviso-ruim" }, ui.icone("info"), h("span", null, L.textoMotivoPerda(k.motivosPorId()[n.motivo_perda_id], n.motivo_perda_txt))) : null);      // plano 1000b · RB-046

    /* ---------- abas ---------- */
    const secoes = { resumo: null, tarefas: null, notas: null, tempo: null };
    const conteudo = h("div", { class: "ng-sec" });
    const abasEl = ui.abas({ itens: [
      { id: "resumo", rotulo: "Resumo" },
      { id: "tarefas", rotulo: "Tarefas", n: (d.tarefas || []).filter(t => !t.concluida_em).length || null },
      { id: "notas", rotulo: "Notas", n: (d.notas || []).length || null },
      { id: "tempo", rotulo: "Linha do tempo" },
    ], ativo: abaAtual, rotulo: "Seções do negócio", aoMudar: idAba => { abaAtual = idAba; mostrar(); } });

    function mostrar() {
      ui.limpar(conteudo);
      if (!secoes[abaAtual]) secoes[abaAtual] = criarSecao(abaAtual);
      conteudo.appendChild(secoes[abaAtual]);
    }
    /** CR-070: abre o Resumo e leva ao bloco «Campos», com o foco no 1º obrigatório vazio. */
    function irParaCampos() {
      if (abaAtual !== "resumo") { abaAtual = "resumo"; if (abasEl.ativar) abasEl.ativar("resumo"); mostrar(); }
      const bloco = conteudo.querySelector('section[aria-label="Campos"]');
      if (!bloco) return;
      try { bloco.scrollIntoView({ block: "start", behavior: ui.comportamentoRolagem ? ui.comportamentoRolagem() : "auto" }); } catch { /* ok */ }
      const alvo = faltamCampos.map(c => bloco.querySelector(`[name="campo__${c.chave}"]`)).find(Boolean);
      if (alvo) try { alvo.focus({ preventScroll: true }); } catch { alvo.focus(); }
    }

    function criarSecao(qual) {
      const T = k.__tarefas;
      if (qual === "tarefas") return T.blocoTarefas(k, { tarefas: d.tarefas || [], negocio_id: n.id, contato_id: n.contato ? n.contato.id : null,
        aoMudar: lista => { d.tarefas = lista; abasEl.contar("tarefas", lista.filter(t => !t.concluida_em).length || null); avisar({ ...n, _tarefas: true }); secoes.tempo = null; } });
      if (qual === "notas") return T.blocoNotas(k, { notas: d.notas || [], negocio_id: n.id,
        aoMudar: lista => { d.notas = lista; abasEl.contar("notas", lista.length || null); secoes.tempo = null; } });
      if (qual === "tempo") return T.blocoTempo(k, d.tempo || [], { pagina: { p_negocio: n.id } });
      return resumo();
    }

    function resumo() {
      const el = h("div", { class: "ng-sec" });
      /* contato */
      if (d.contato) {
        const ct = d.contato;
        const conv = (d.conversas || []).find(c => c.status !== "resolvida");
        el.appendChild(h("section", { class: "ng-bloco", "aria-label": k.v.contato },
          h("div", { class: "ng-contato" },
            ui.avatar(ct.nome || ct.telefone, ct.id),
            // plano 1500c · UC-030: nome, telefone e e-mail borrados no modo apresentação. RX-029: o telefone liga com um toque (tel:)
            h("div", null, h("b", { class: "dado-pessoal" }, L.nomeContato(ct)),
              ct.telefone || ct.email ? h("small", { class: "dado-pessoal" },
                ct.telefone && L.hrefTel(ct.telefone) ? h("a", { class: "ng-tel", href: L.hrefTel(ct.telefone), "aria-label": `Ligar para ${ui.telBR(ct.telefone)}` }, ui.telBR(ct.telefone)) : ct.telefone ? ui.telBR(ct.telefone) : null,
                ct.telefone && ct.email ? " · " : null, ct.email || null) : h("small", null, "Sem telefone")),
            // plano 1500c · RX-078: sem o módulo Conversas, o WhatsApp abre direto (wa.me) — antes a gaveta não tinha como chamar o contato
            !(k.ctx.temModulo && k.ctx.temModulo("conversas")) && ct.telefone && L.hrefWhatsApp && L.hrefWhatsApp(ct.telefone)
              ? h("a", { class: "bt bt-sec bt-p ng-wa", href: L.hrefWhatsApp(ct.telefone), target: "_blank", rel: "noopener noreferrer", "aria-label": `Chamar ${L.nomeContato(ct)} no WhatsApp` }, ui.icone("whatsapp"), "WhatsApp") : null,
            h("div", { class: "linha" },
              k.ctx.temModulo && k.ctx.temModulo("conversas") ? h("button", { type: "button", class: "bt bt-sec bt-p", on: { click: () => {
                g.fechar();
                k.ctx.navegar(conv ? `#/conversas/${conv.id}` : `#/conversas?contato=${ct.id}`);
              } } }, ui.icone("whatsapp"), "Abrir conversa") : null,
              h("button", { type: "button", class: "bt bt-fant bt-p", on: { click: () => abrirContato(k, ct.id, {}) } }, "Ver ficha")))));
      } else {
        el.appendChild(h("p", { class: "aviso" }, ui.icone("info"), h("span", null, `Sem ${k.v.min("contato")} ligado (o cadastro foi removido). Os números d${k.v.art("negocio")} ${k.v.min("negocio")} continuam no retorno do anúncio.`)));   // plano 1000b · RB-049
      }
      /* C3: de onde veio — «Veio do site · campanha X · página Y · clique em 06/10 10:12», «Veio do anúncio «nome» · campanha …» (rastreio,
         campanha_ext/anuncio_ext, plataforma e campanha_nome de nx_negocio_ver; o bloco d.anuncio traz os nomes da métrica quando há) */
      const rs = L.resumoRastreio(n, { anuncio: d.anuncio, fmtData: iso => `${ui.dataCurtaBR ? ui.dataCurtaBR(iso) : ui.dataBR(iso)} ${ui.horaBR(iso)}` });
      if (rs) {
        el.appendChild(h("section", { class: ["ng-anuncio", "ng-rastreio", rs.plataforma === "google" && "google"], "aria-label": "De onde veio" },
          rs.chave ? ui.pilula(null, rs.chave, { variante: "origem", plataforma: rs.plataforma }) : ui.icone("anuncio"),
          h("div", { class: "ng-origem-detalhes" }, h("b", { class: "ng-rastreio-frase" }, rs.frase), ...rs.detalhes.map(t => h("small", null, t)))));
      }
      /* dados */
      const dl = h("dl", { class: "ng-kv" });
      const sel = (opcoes, valor) => h("select", null, opcoes.map(o => h("option", { value: o.valor, selected: String(o.valor) === String(valor ?? "") }, o.rotulo)));
      dl.append(...linhaEd(k, { rotulo: "Responsável", desabilitado: !podeEditar,
        // plano 1500c · RX-033: responsável que saiu da equipe aparece como «Fulano (desativado)» — antes o select mostrava «Sem responsável» (mentira)
        controle: sel([{ valor: "", rotulo: "Sem responsável" }, ...L.opcoesResponsavel(k.base.usuarios, n.dono_id, n.dono_nome || (n.dono && n.dono.nome) || null)], n.dono_id),
        ler: c => c.value || null, salvar: v => salvar({ dono_id: v }) }));
      // plano 1500c · RC-268: «R$» visível dentro do campo (os dois valores), como o ui.campo tipo moeda
      const comMoeda = blocos => {
        for (const b of blocos) {
          const dd = b.querySelector && b.querySelector("dd");
          const inp = dd && dd.querySelector("input");
          if (inp) { dd.insertBefore(h("span", { class: "ng-moeda", "aria-hidden": "true" }, "R$"), inp); dd.classList.add("ng-dd-moeda"); }
        }
        return blocos;
      };
      dl.append(...comMoeda(linhaEd(k, { rotulo: "Valor previsto", desabilitado: !podeEditar,
        controle: h("input", { type: "text", inputmode: "decimal", value: n.valor_previsto != null ? Number(n.valor_previsto).toLocaleString("pt-BR", { minimumFractionDigits: 2 }) : "", placeholder: "0,00" }),
        ler: c => k.L.lerNumero(c.value), validar: c => (k.L.erroDinheiro ? k.L.erroDinheiro(c.value) : k.L.dinheiroInvalido(c.value) ? "Valor inválido. Use só números, por exemplo 1.500,00." : null),      // plano 1500c · RX-071: negativo também
        salvar: v => salvar({ valor_previsto: v }) })));
      if (n.status === "ganho") dl.append(...comMoeda(linhaEd(k, { rotulo: "Valor final", desabilitado: !podeEditar || pendente,
        controle: h("input", { type: "text", inputmode: "decimal", value: n.valor != null ? Number(n.valor).toLocaleString("pt-BR", { minimumFractionDigits: 2 }) : "", placeholder: "0,00" }),
        ler: c => k.L.lerNumero(c.value), validar: c => (k.L.erroDinheiro ? k.L.erroDinheiro(c.value) : k.L.dinheiroInvalido(c.value) ? "Valor inválido. Use só números, por exemplo 1.500,00." : null),      // plano 1500c · RX-071: negativo também
        salvar: v => salvar({ valor: v }) })));
      const servicos = Object.keys(k.base.ticket || {});
      const idLista = `srv-${n.id}`;
      const inServ = h("input", { type: "text", value: n.servico || "", list: servicos.length ? idLista : null, maxlength: 120, placeholder: `Ex.: ${servicos[0] || k.v.servico}` });
      dl.append(...linhaEd(k, { rotulo: k.v.servico, desabilitado: !podeEditar, controle: inServ, largo: true,
        ler: c => c.value.trim() || null,
        salvar: async v => {
          const extra = {};
          // plano 1500c · RX-073: «implante» acha o ticket de «Implante»
          const t = v && k.base.ticket ? (L.ticketDoServico ? (L.ticketDoServico(k.base.ticket, v) ?? NaN) : Number(k.base.ticket[v])) : NaN;
          if (n.valor_previsto == null && Number.isFinite(t)) extra.valor_previsto = t;
          await salvar({ servico: v, ...extra });
          if (extra.valor_previsto != null) ui.toast(`Valor previsto sugerido pelo ticket: ${ui.brl(t)}.`, { tipo: "info" });
        } }));
      if (servicos.length) el.appendChild(h("datalist", { id: idLista }, servicos.map(s => h("option", { value: s }))));
      // plano 1000 (CR-052): data no passado é aceita (registro tardio), mas avisa — o lembrete automático de 24 h não roda para ela
      const avisoPassou = c => (L.dataPassou(c.value) ? `${L.TEXTO_DATA_PASSOU} O lembrete automático não vai rodar para ela.` : null);
      dl.append(...linhaEd(k, { rotulo: `Data e hora da ${nomeCompromisso(k)}`, desabilitado: !podeEditar, largo: true,
        controle: h("input", { type: "datetime-local", value: k.L.paraDataHoraLocal(n.consulta_em) }), aviso: avisoPassou,
        ler: c => c.value || null, salvar: v => salvar({ consulta_em: v }) }));
      const inPrevG = h("input", { type: "date", value: n.previsao_fechamento || "" });
      const blocoPrev = linhaEd(k, { rotulo: "Previsão de fechamento", desabilitado: !podeEditar,
        controle: inPrevG, aviso: c => (L.dataPassou(c.value) ? L.TEXTO_DATA_PASSOU : null),
        ler: c => c.value || null, salvar: v => salvar({ previsao_fechamento: v }) });
      // plano 1500c · RC-282: atalhos (Em 15 dias · Fim do mês · Fim do próximo mês) — grava pelo mesmo caminho do campo (evento change)
      if (podeEditar) {
        const ddPrev = blocoPrev[0].querySelector("dd");
        if (ddPrev) ddPrev.appendChild(h("div", { class: "tf-atalhos ng-prev-atalhos", role: "group", "aria-label": "Atalhos da previsão" },
          L.atalhosPrevisao(ui.hojeSP ? ui.hojeSP() : new Date().toISOString().slice(0, 10)).map(a => h("button", { type: "button", class: "bt bt-fant bt-p tf-atalho", dataset: { valor: a.valor },
            on: { click: () => { inPrevG.value = a.valor; if (typeof inPrevG.dispatchEvent === "function") inPrevG.dispatchEvent(new Event("change")); } } }, a.rotulo))));
      }
      dl.append(...blocoPrev);
      // plano 1000 (CR-046): origem nula (lead antigo do webhook) não pode aparecer como «Anúncio» (a 1ª opção) — e não grava nada até escolherem
      dl.append(...linhaEd(k, { rotulo: "Origem", desabilitado: !podeEditar || !!n.plataforma,
        controle: sel([...(n.origem ? [] : [{ valor: "", rotulo: "— não informada —" }]), ...k.L.origensManuais(n.origem).map(([valor, rotulo]) => ({ valor, rotulo }))], n.origem),
        ler: c => c.value || null, salvar: v => salvar({ origem: v }) }));
      // pontuação do lead (automação «preencher um campo» = score, ou a IA): só leitura, com o motivo e quando foi atribuída
      const pont = k.L.pontuacao(n);
      if (pont) dl.append(h("div", { class: "ng-campo ng-campo-largo" }, h("dt", null, "Pontuação do lead"), h("dd", { class: "ng-pontuacao" },
        ui.pilula(`${pont.score} de 100`, pont.faixa === "alta" ? "ok" : pont.faixa === "media" ? "aten" : "neutra", { icone: "ia" }),
        pont.motivo ? h("span", { class: "ng-pontuacao-motivo" }, pont.motivo) : null,
        pont.em ? h("small", { class: "ng-pontuacao-em" }, `Atribuída em ${L.quandoPontuacao(pont.em)}`) : null)));
      const ddEtq = h("dd", null);
      const montarEtq = marcadas => {
        const etq = ui.seletorEtiquetas({ todas: k.base.etiquetas, marcadas, rotulo: "Etiquetas do negócio",
          podeCriar: podeEditar ? nome => k.criarEtiqueta(nome) : false, aoMudar: ids => etiquetar(ids) });
        if (!podeEditar) for (const b of etq.querySelectorAll("button")) b.disabled = true;
        ui.limpar(ddEtq); ddEtq.appendChild(etq);
      };
      // M25: etiquetar grava na hora e oferece «Desfazer» — que desfaz só ESTA troca (uma etiqueta posta depois continua)
      async function etiquetar(ids) {
        const antes = (n.etiquetas || []).slice();
        const nomeDe = id => (k.etiqueta(id) || {}).nome || "etiqueta";
        const mais = ids.filter(i => !antes.includes(i)), menos = antes.filter(i => !ids.includes(i));
        // plano 1500c · RC-093: várias de uma vez → «3 etiquetas adicionadas: A, B e C» / «1 adicionada, 1 removida»
        const texto = (L.textoEtiquetasMudaram && L.textoEtiquetasMudaram(mais.map(nomeDe), menos.map(nomeDe))) || "Etiquetas atualizadas";
        try { await salvar({ etiquetas: ids }); }
        catch (e) { k.toastErro(e); montarEtq(antes); return; }
        ui.acaoComDesfazer({ texto, reverter: async () => {
          const volta = L.desfazerEtiquetas(n.etiquetas || [], mais, menos);
          await salvar({ etiquetas: volta });
          montarEtq(n.etiquetas || volta);
        } });
      }
      montarEtq(n.etiquetas || []);
      dl.append(h("div", { class: "ng-campo ng-campo-largo" }, h("dt", null, "Etiquetas"), ddEtq));
      el.appendChild(h("section", { class: "ng-bloco", "aria-label": "Dados" }, h("div", { class: "ng-bloco-cab" }, h("h3", null, "Dados")), dl));

      /* campos personalizados do funil */
      const campos = k.L.camposDe(k.base.campos, "negocio", n.funil_id);
      if (campos.length) {
        const form = h("form", { class: "crm-form", novalidate: true }, campos.map(c => campoPersonalizado(k, c, (n.campos || {})[c.chave])));
        if (!podeEditar) for (const x of form.querySelectorAll("input,select,textarea")) x.disabled = true;
        form.addEventListener("change", async ev => {
          const cmp = ev.target.closest("[data-campo]");
          if (!cmp) return;
          const c = campos.find(x => `campo__${x.chave}` === cmp.dataset.campo);
          if (!c) return;
          const { valores, erros } = lerCamposPersonalizados(k, form, [c]);
          ui.marcarErro(form, cmp.dataset.campo, "");
          if (erros.length && !(c.obrigatorio && erros[0].texto.startsWith("Preencha"))) { ui.marcarErro(form, erros[0].nome, erros[0].texto); return; }
          // plano 1000b · RB-220: a mesma regra da ficha — obrigatório pode ser limpo, com aviso (cobrado só ao marcar como ganho)
          const limpouObrig = c.obrigatorio && erros.length > 0;
          try {
            await salvar({ campos: { [c.chave]: valores[c.chave] ?? null } });
            // plano 1000b · RB-063: o «Salvo» fica ao lado do campo; o toast só para o aviso do obrigatório
            if (limpouObrig) ui.toast(`Salvo. «${c.rotulo}» é obrigatório: preencha antes de marcar como ${k.v.ganhar.toLowerCase()}.`, { tipo: "aten", ms: 5000 }); else marcarSalvo(k, cmp);
          }
          catch (e) { ui.marcarErro(form, cmp.dataset.campo, k.erro(e)); }
        });
        el.appendChild(h("section", { class: "ng-bloco", "aria-label": "Campos" }, h("div", { class: "ng-bloco-cab" }, h("h3", null, "Campos")),
          campos.some(c => c.obrigatorio) ? h("p", { class: "sub" }, `Campos com * precisam estar preenchidos para marcar como ${k.v.ganhar.toLowerCase()}.`) : null, form));
      }

      /* plano 1000 (CR-074): valores de campos de OUTRO funil (o negócio mudou de funil) continuam no banco — aparecem aqui, só leitura e recolhidos */
      const outros = L.camposDeOutrosFunis(k.base.campos, n.funil_id, n.campos || {});
      if (outros.length) {
        el.appendChild(h("details", { class: "ng-bloco ng-outros-campos" },
          h("summary", null, `Campos de outros funis (${outros.length})`),
          // plano 1000b · RB-049: o termo da vertical, com o artigo certo
          h("p", { class: "sub" }, `Preenchidos quando ${k.v.art("negocio") === "a" ? "esta" : "este"} ${k.v.min("negocio")} estava em outro funil. Ficam guardados; voltam a ser editáveis se ${k.v.art("negocio") === "a" ? "ela" : "ele"} voltar para lá.`),
          h("dl", { class: "ng-kv" }, outros.map(o => h("div", { class: "ng-campo" }, h("dt", null, o.rotulo), h("dd", null, o.texto))))));
      }

      /* observação */
      const obs = h("textarea", { rows: 3, maxlength: 5000, placeholder: `Observações sobre ${k.v.art("negocio") === "a" ? "esta" : "este"} ${k.v.min("negocio")}` /* plano 1000b · RB-049 */ }, n.obs || "");
      const dlObs = h("dl", { class: "ng-kv" }, ...linhaEd(k, { rotulo: "Observação", desabilitado: !podeEditar, controle: obs, largo: true,
        ler: c => c.value.trim() || null, salvar: v => salvar({ obs: v }) }));
      el.appendChild(h("section", { class: "ng-bloco" }, dlObs));

      /* outros negócios e atendimentos */
      if ((d.outros || []).length || (d.conversas || []).length) {
        const blk = h("section", { class: "ng-bloco", "aria-label": "Histórico do contato" }, h("div", { class: "ng-bloco-cab" }, h("h3", null, `Mais d${k.v.art("contato") === "a" ? "a" : "o"} ${k.v.min("contato")}`)));
        const lst = h("div", { class: "ng-outros" });
        // plano 1500c · RC-100: «Última mensagem há 5 dias» — o dado para decidir o próximo passo
        const ultMsg = L.ultimaMensagemEm ? L.ultimaMensagemEm(d.conversas) : null;
        if (ultMsg) blk.appendChild(h("p", { class: "ng-ult-msg sub" }, ui.icone("chat"), ` Última mensagem ${ui.relativo(ultMsg)}`));
        for (const o of d.outros || []) {
          const e = k.estagio(o.estagio_id);
          lst.appendChild(h("button", { type: "button", class: "ng-mini", style: e && k.cor(e.cor) ? { "--cor": k.cor(e.cor) } : null,
            // plano 1000b · RB-061: troca o negócio NA MESMA gaveta (como o ‹ ›) e entra em «Recentes» — antes fechava e reabria sem ‹ › nem Recentes
            on: { click: () => { trocarPara(o.id, k.L.tituloCard(o)); } } },
            h("i", { "aria-hidden": "true" }), h("span", null, `${k.L.tituloCard(o)} · ${e ? e.nome : ""}`),
            // plano 1500c · RC-094: sem valor → «Sem valor» (antes: ui.brl(null) = «R$ 0»), na régua do cartão (valor final ?? previsto)
            (o.status === "ganho" ? (o.valor ?? o.valor_previsto) : o.valor_previsto) != null
              ? h("b", null, ui.brl(L.valorCard(o), { centavos: L.temCentavos(L.valorCard(o)) })) : h("span", { class: "sem" }, "Sem valor")));      // plano 1500c · RX-034: centavos só quando há (a régua do cartão)
        }
        // plano 1000b · RB-051: sem o módulo Conversas o protocolo é só texto (o link levava a uma tela que a conta não tem)
        const temConversas = !!(k.ctx && typeof k.ctx.temModulo === "function" && k.ctx.temModulo("conversas"));
        for (const c of d.conversas || []) {
          lst.appendChild(h(temConversas ? "a" : "span", { class: "fx-proto", href: temConversas ? `#/conversas/${c.id}` : null }, ui.icone("chat"),
            h("b", { class: "mono" }, c.protocolo),
            h("span", null, L.linhaAtendimento(c, ui.dataBR))));
        }
        blk.appendChild(lst);
        el.appendChild(blk);
      }
      return el;
    }

    // no celular as ações ficam num rodapé fixo (sticky no fim da gaveta): sempre à mão, sem rolar de volta ao topo
    corpo.append(h("div", { class: ["ng", movel && "ng-com-rodape"], "aria-busy": pendente ? "true" : null }, topo, abasEl.el, conteudo, movel ? h("div", { class: "ng-acoes-rodape" }, acoes) : null));
    mostrar();
  }

  if (!k.__tarefas) k.__tarefas = await k.mod("tarefas");
  await carregar();
  // plano 1000 (CR-067): a gaveta aberta acompanha o que outra pessoa muda (etapa, campos) — no pulso, no máximo a cada 15 s, e nunca com um
  // campo em edição, texto não salvo ou movimento esperando o «Desfazer»
  cancelarPulsoG = k.ctx && k.ctx.pulso && typeof k.ctx.pulso.assinar === "function" ? k.ctx.pulso.assinar(() => {
    if (fechada || pend || (typeof document !== "undefined" && document.hidden)) return;
    if (Date.now() - ultimaLeitura < 15000) return;
    const a = typeof document !== "undefined" ? document.activeElement : null;
    if (a && corpo.contains(a) && /^(INPUT|TEXTAREA|SELECT)$/.test(a.tagName || "")) return;
    if (typeof g.estaSujo === "function" && g.estaSujo()) return;
    carregar({ seMudou: true, zerar: true });
  }) : null;
  if (fechada && cancelarPulsoG) { cancelarPulsoG(); cancelarPulsoG = null; }
  return g;
}

/* ============================================================ mover de funil */
export async function moverDeFunil(k, n, { aoMover } = {}) {
  const { ui, h, L } = k;
  // plano 1000b · RB-255: funil de destino sem etapa ABERTA (só ganho/perda) não entra — o select de etapa ficaria vazio e «Mover» daria erro
  const permitidos = L.funisPermitidos(k.base.funis, n.funil_id, n.status).filter(f => f.id !== n.funil_id && (f.estagios || []).some(e => e.tipo === "aberto"));
  if (!permitidos.length) {
    const f = k.funil(n.funil_id);
    ui.toast(f && f.conta_no_ads && n.status !== "aberto" ? L.textoErro({ codigo: "funil_invalido", hint: "fechado_no_ads" }, { vocab: k.v })
      : f && f.conta_no_ads ? L.textoErro({ codigo: "funil_invalido", hint: "sai_do_ads" }, { vocab: k.v }) : "Não há outro funil disponível.", { tipo: "info" });
    return;
  }
  const selFunil = ui.campo({ rotulo: "Funil", nome: "funil", tipo: "select", valor: permitidos[0].id, opcoes: permitidos.map(f => ({ valor: f.id, rotulo: f.nome })) });
  const selEtapa = ui.campo({ rotulo: "Etapa", nome: "estagio", tipo: "select", opcoes: [] });
  const preencher = () => {
    const f = k.funil(selFunil.querySelector("select").value);
    const s = selEtapa.querySelector("select");
    ui.limpar(s);
    for (const e of (f ? f.estagios : []).filter(x => x.tipo === "aberto")) s.appendChild(h("option", { value: e.id }, e.nome));
  };
  selFunil.querySelector("select").addEventListener("change", preencher);
  preencher();
  const f = k.funil(n.funil_id);
  const aviso = f && f.conta_no_ads ? h("p", { class: "aviso aviso-aten" }, ui.icone("info"), h("span", null, `${k.v.art("negocio") === "a" ? "Esta" : "Este"} ${k.v.min("negocio")} está no funil de anúncios: só pode ir para outro funil de anúncios, para a receita e as conversas do anúncio não sumirem.`)) : null;
  // plano 1000b · RB-254: de onde o negócio sai
  const atual = k.estagio(n.estagio_id);
  const deOnde = h("p", { class: "sub ng-hoje-em" }, `Hoje em: ${f ? f.nome : "—"} → ${atual ? atual.nome : "—"}`);
  const corpo = h("form", { class: "crm-form", novalidate: true }, deOnde, aviso, selFunil, selEtapa);
  const r = await ui.modal({ titulo: "Mover para outro funil", corpo, largura: "p", acoes: [
    { rotulo: "Cancelar", tipo: "neutro", valor: null },
    { rotulo: "Mover", tipo: "primario", fn: async api => {
      const e = k.estagio(corpo.querySelector("[data-campo=estagio] select").value);
      if (!e) { api.erro("Escolha a etapa."); return false; }
      try { const card = await moverComPerguntas(k, n, e); return card || false; } catch (err) { api.erro(k.erro(err)); return false; }
    } }] });
  // plano 1000b · RB-047: «Movida para «Funil».» na vertical de termo feminino
  if (r) { const fd = k.funilDoEstagio && k.funilDoEstagio(r.estagio_id); ui.toast(`Movid${k.v.art("negocio") === "a" ? "a" : "o"}${fd && fd.nome ? ` para «${fd.nome}»` : ""}.`, { tipo: "ok" }); if (aoMover) aoMover(r); }
}

/* ============================================================ pós-venda */
/** "Iniciar pós-venda": negócio NOVO do mesmo contato num funil sem Ads (nx_negocio_salvar, origem manual). */
export async function iniciarPosVenda(k, n, contato, { aoCriar } = {}) {
  const { ui, h } = k;
  const funis = k.base.funis.filter(f => !f.conta_no_ads && f.ativo !== false);
  // plano 1000b · RB-050: sem o jargão «fora do Ads»
  if (!funis.length) { ui.toast("Crie um funil de pós-venda (que não conta nos anúncios) em Configurações → Funis e etapas.", { tipo: "info" }); return; }
  const doAds = !!(k.funil(n.funil_id) || {}).conta_no_ads;
  // plano 1500c · RC-095: sem nome, «este paciente»/«este cliente» (termo da vertical), não «este contato» fixo
  const form = h("form", { class: "crm-form", novalidate: true },
    h("p", { class: "sub" }, `Cria ${k.v.art("negocio") === "a" ? "uma nova" : "um novo"} ${k.v.min("negocio")} para ${contato.nome || `est${k.v.art("contato") === "a" ? "a" : "e"} ${k.v.min("contato")}`}. ${k.v.art("negocio") === "a" ? "A" : "O"} atual continua ${k.v.ganhar.toLowerCase()}${doAds ? " no funil de anúncios — a receita do anúncio não muda" : ""}.`),     // plano 1000b · RB-050
    ui.campo({ rotulo: "Título", nome: "titulo", valor: `Pós-venda — ${contato.nome || k.L.tituloCard(n)}`.slice(0, 120), max: 120 }));
  // plano 1000 (CR-220): a etapa em que nasce (as abertas do funil escolhido; antes era sempre a 1ª) e (CR-221) o serviço e o responsável do negócio
  // ganho já preenchidos (dá para trocar) — antes o pós-venda vinha só com o título
  const selFunil = h("select", { name: "funil_id", class: "sel", "aria-label": "Funil" }, funis.map(f => h("option", { value: f.id }, f.nome)));
  selFunil.value = funis[0].id;
  const selEtapa = h("select", { name: "estagio_id", class: "sel", "aria-label": "Etapa" });
  const pintarEtapas = () => {
    const f = funis.find(x => String(x.id) === String(selFunil.value)) || funis[0];
    ui.limpar(selEtapa);
    const abertas = (f.estagios || []).filter(e => e.tipo === "aberto");
    for (const e of abertas) selEtapa.appendChild(h("option", { value: e.id }, e.nome));
    selEtapa.value = abertas[0] ? abertas[0].id : "";
  };
  selFunil.addEventListener("change", pintarEtapas);
  pintarEtapas();
  const inServico = h("input", { type: "text", name: "servico", maxlength: 120, value: n.servico || "", "aria-label": k.v.servico || "Serviço" });
  const selDono = h("select", { name: "dono_id", class: "sel", "aria-label": "Responsável" }, h("option", { value: "" }, "Sem responsável"),
    (k.base.usuarios || []).map(u => h("option", { value: u.id }, u.nome)));
  selDono.value = n.dono_id && (k.base.usuarios || []).some(u => u.id === n.dono_id) ? n.dono_id : "";
  form.insertBefore(h("div", { class: "crm-form-2 pv-campos" },
    h("label", { class: "campo" }, h("span", { class: "campo-rot" }, "Funil"), selFunil),
    h("label", { class: "campo" }, h("span", { class: "campo-rot" }, "Etapa"), selEtapa),
    h("label", { class: "campo" }, h("span", { class: "campo-rot" }, k.v.servico || "Serviço"), inServico),
    h("label", { class: "campo" }, h("span", { class: "campo-rot" }, "Responsável"), selDono)), form.lastChild);
  let reqAtual = null, reqConteudo = "";   // M25: uma chave por intenção
  const r = await ui.modal({ titulo: "Iniciar pós-venda", corpo: form, acoes: [
    { rotulo: "Cancelar", tipo: "neutro", valor: null },
    { rotulo: "Criar", tipo: "primario", fn: async api => {
      const titulo = (form.querySelector("[name=titulo]") || {}).value || "";
      try {
        const p = { contato_id: contato.id, funil_id: selFunil.value, titulo: titulo.trim() || null, origem: "manual",
          ...(selEtapa.value ? { estagio_id: selEtapa.value } : {}), ...(inServico.value.trim() ? { servico: inServico.value.trim() } : {}), ...(selDono.value ? { dono_id: selDono.value } : {}) };
        const conteudo = JSON.stringify(p);
        if (conteudo !== reqConteudo) { reqAtual = k.novaReq(); reqConteudo = conteudo; }
        return (await k.escrever("nx_negocio_salvar", { p_negocio: p }, { req: reqAtual })).resultado;
      }
      catch (e) { api.erro(e && e.ambigua ? "Não foi possível confirmar se foi salvo. Toque em «Criar» de novo: é seguro, não duplica." : k.erro(e)); return false; }
    } }] });
  if (!r) return;
  ui.toast(`Pós-venda criado em «${(k.funil(r.funil_id) || {}).nome || "pós-venda"}».`, { tipo: "ok", desfazer: null });
  if (aoCriar) aoCriar(r);
  abrirNegocio(k, r.id, {});
}

/* ============================================================ duplicado (M24) */
/**
 * Com 10–13 dígitos no telefone procura o cadastro que já existe e avisa ANTES de criar: «Já existe: Mariana Costa, última conversa há 2 dias · Usar este cadastro».
 * inputTel = o <input> do telefone; aoUsar(contato) = o que fazer ao aceitar; ignorarId = o próprio cadastro (edição). → a caixa (insira no formulário).
 */
export function avisoDuplicado(k, inputTel, { aoUsar, ignorarId = null, checarJa = false } = {}) {
  const { ui, h, L } = k;
  const caixa = h("div", { class: "crm-dup", role: "status", "aria-live": "polite", hidden: true });
  let seq = 0;
  const checar = ui.debounce(async () => {
    const minha = ++seq;
    // plano 1000b · RB-086: com «+» (número de fora) confere até 15 dígitos — a mesma régua do acharDuplicado
    const dig = L.digitosDuplicado(inputTel.value);
    ui.limpar(caixa); caixa.hidden = true;
    if (!dig) return;
    try {
      const r = await k.api.rpcC("nx_contatos_listar", { p_filtro: { busca: dig }, p_por_pagina: 5 });
      if (minha !== seq) return;
      const achado = L.acharDuplicado(r && r.itens, inputTel.value, { ignorarId });
      if (!achado) return;
      const quando = achado.ultimo_contato_em ? `última conversa ${ui.relativo(achado.ultimo_contato_em)}` : "ainda sem conversa";
      caixa.append(ui.icone("info"),
        h("span", { class: "crm-dup-txt" }, h("b", null, "Já existe: "), `${L.nomeContato(achado)}, ${quando}`),
        h("button", { type: "button", class: "bt bt-sec bt-p", on: { click: () => { if (aoUsar) aoUsar(achado); } } }, "Usar este cadastro"));
      caixa.hidden = false;
    } catch { /* sem a checagem o servidor ainda não duplica: reaproveita o cadastro (nx_negocio_salvar) ou recusa (telefone_em_uso) */ }
  }, 400);
  inputTel.addEventListener("input", checar);
  if (checarJa && inputTel.value) checar();      // telefone que já veio preenchido (ex.: da Agenda) também é conferido
  return caixa;
}

/* ============================================================ novo negócio */
export async function novoNegocio(k, dados = {}, { aoCriar, aoFechar } = {}) {
  const { ui, h, L } = k;
  if (!k.pode("atendente")) { ui.toast("Seu acesso é só de leitura.", { tipo: "info" }); return null; }
  let contato = null;
  let abertosDoContato = null;      // plano 1000 (CR-061): negócios abertos do contato escolhido (quando nx_contato_ver os traz)
  if (dados.contato_id) {
    try {
      const r = await k.api.rpcC("nx_contato_ver", { p_id: dados.contato_id });
      contato = r.contato;
      if (Array.isArray(r.negocios)) abertosDoContato = r.negocios.filter(x => !x.status || x.status === "aberto");
    } catch (e) { k.toastErro(e); return null; }
  }
  const g = ui.gaveta({ titulo: k.v.novo ? k.v.novo("negocio") : `Novo ${k.v.min("negocio")}`, largura: "m", aoFechar });
  const funis = k.base.funis.filter(f => f.ativo !== false);
  // plano 1000b · RB-056: sem funil ativo o formulário mandaria funil vazio (erro técnico do servidor) — a gaveta explica e leva às configurações
  if (!(dados.funis || funis).length) {
    const admin = typeof k.pode === "function" && k.pode("admin");
    g.corpo.appendChild(ui.vazio({ titulo: "Crie um funil antes.", tema: "crm",
      texto: admin ? `Para criar ${k.v.art("negocio") === "a" ? "uma" : "um"} ${k.v.min("negocio")}, ative ou crie um funil em Configurações → Funis e etapas.` : "Peça ao administrador para criar ou ativar um funil.",
      acao: admin && k.ctx && typeof k.ctx.navegar === "function" ? { rotulo: "Abrir configurações", fn: () => { g.fechar(); k.ctx.navegar("#/config/funis"); } } : null }));
    return g;
  }
  const funilIni = k.funil(dados.funil_id) || k.funilDoEstagio(dados.estagio_id) || k.funilPadrao();
  const form = h("form", { class: "crm-form", novalidate: true });

  /* contato: escolhido OU busca OU novo */
  const zonaContato = h("div", { class: "pilha-p" });
  // plano 1000 (pedido da Agenda): sem contato escolhido, o nome ou o telefone que veio (dados.nome / dados.telefone) já abre o cadastro novo preenchido
  const preNome = !contato && dados.nome ? String(dados.nome).trim().slice(0, 160) : "";
  const preTel = !contato && dados.telefone ? String(dados.telefone).trim().slice(0, 40) : "";
  let modoNovo = !!(preNome || preTel);
  // plano 1000 (CR-059): ir de «cadastrar novo» para «buscar existente» e voltar não apaga o nome/telefone/e-mail já digitados
  const digitado = { c_nome: preNome, c_telefone: preTel, c_email: "" };
  let primeiraVez = true;
  function desenharContato() {
    for (const n of Object.keys(digitado)) { const x = zonaContato.querySelector(`[name=${n}]`); if (x) digitado[n] = x.value; }
    const veioPronto = primeiraVez && modoNovo;
    primeiraVez = false;
    ui.limpar(zonaContato);
    zonaContato.appendChild(h("span", { class: "campo-rot" }, k.v.contato, h("span", { class: "obrig", "aria-hidden": "true" }, " *")));
    if (contato) {
      zonaContato.appendChild(h("div", { class: "crm-escolhido" }, ui.avatar(contato.nome || contato.telefone, contato.id),
        h("span", null, h("b", null, L.nomeContato(contato)), h("small", null, contato.telefone ? ui.telBR(contato.telefone) : contato.email || "")),
        dados.contato_id ? null : h("button", { type: "button", class: "bt bt-fant bt-p", on: { click: () => { contato = null; abertosDoContato = null; desenharContato(); } } }, "Trocar")));
      // plano 1000 (CR-061): quem volta continua no MESMO negócio aberto (decisão 1) — criar outro sem querer duplica o funil. Avisa; ainda dá para criar.
      const lista = abertosDoContato || [];
      const n = lista.length || Number(contato.negocios_abertos) || 0;
      if (n > 0) {
        const t = L.termosNegocio(k.v);
        const um = lista[0];
        zonaContato.appendChild(h("p", { class: "aviso aviso-aten crm-ja-aberto", role: "status" }, ui.icone("info"),
          h("span", null, `Já tem ${n} ${n === 1 ? t.n : t.ns} abert${t.a}${n === 1 ? "" : "s"}${um ? `: «${L.tituloCard(um)}»` : ""}. Criar outr${t.a} só se for mesmo outro assunto.`),
          // plano 1000b · RB-061: o aberto daqui também entra em «Recentes»
          um ? h("button", { type: "button", class: "bt bt-sec bt-p", on: { click: () => {
            if (typeof k.lembrarRecente === "function") try { k.lembrarRecente({ hash: `#/crm/negocio/${um.id}`, titulo: L.tituloCard(um), tipo: "negocio" }); } catch { /* ok */ }
            g.fechar(); setTimeout(() => abrirNegocio(k, um.id, {}), 240);
          } } }, "Abrir")
            : h("button", { type: "button", class: "bt bt-sec bt-p", on: { click: () => abrirContato(k, contato.id, {}) } }, "Ver ficha")));
      }
      return;
    }
    if (modoNovo) {
      const grade = h("div", { class: "crm-form-2" },
        ui.campo({ rotulo: "Nome", nome: "c_nome", max: 160, autocomplete: "off" }),
        ui.campo({ rotulo: "Telefone / WhatsApp", nome: "c_telefone", tipo: "tel", placeholder: "(12) 99830-3030", autocomplete: "off", validar: "telefone" }),
        h("div", { class: "inteiro" }, ui.campo({ rotulo: "E-mail (opcional)", nome: "c_email", tipo: "email", autocomplete: "off" })));
      // M24: o aviso de cadastro já existente aparece enquanto digita o telefone («Já existe: Mariana Costa, última conversa há 2 dias · Usar este cadastro»)
      for (const n of Object.keys(digitado)) { const x = grade.querySelector(`[name=${n}]`); if (x && digitado[n]) x.value = digitado[n]; }
      zonaContato.append(grade,
        avisoDuplicado(k, grade.querySelector("[name=c_telefone]"), { aoUsar: achado => { contato = achado; modoNovo = false; desenharContato(); }, checarJa: veioPronto }),
        h("button", { type: "button", class: "bt bt-fant bt-p", on: { click: () => { modoNovo = false; desenharContato(); } } }, "Buscar um cadastro existente"));
      return;
    }
    const busca = h("input", { type: "search", enterkeyhint: "search", placeholder: "Buscar por nome ou telefone", "aria-label": `Buscar ${k.v.min("contato")}`, autocomplete: "off" });
    const res = h("div", { class: "crm-busca-res", role: "group", "aria-label": "Resultados" });   // plano 1000b · RB-052: grupo de botões comuns (Tab entre eles) — era listbox sem setas nem aria-selected
    let seq = 0;
    const buscar = ui.debounce(async () => {
      const q = busca.value.trim();
      const minha = ++seq;
      ui.limpar(res);
      if (q.length < 2) return;
      try {
        const r = await k.api.rpcC("nx_contatos_listar", { p_filtro: { busca: q }, p_por_pagina: 8 });
        if (minha !== seq) return;
        if (!r.itens.length) res.appendChild(h("p", { class: "flut-vazio" }, "Nada encontrado. Cadastre como novo."));
        for (const c of r.itens) res.appendChild(h("button", { type: "button", on: { click: () => { contato = c; desenharContato(); } } },
          ui.avatar(c.nome || c.telefone, c.id), h("span", null, h("b", null, L.nomeContato(c)), h("small", null, [c.telefone ? ui.telBR(c.telefone) : null, c.email].filter(Boolean).join(" · ")))));
      } catch (e) { if (minha === seq) res.appendChild(h("p", { class: "flut-vazio" }, k.erro(e))); }
    }, 250);
    busca.addEventListener("input", buscar);
    zonaContato.append(h("div", { class: "busca" }, ui.icone("busca"), busca), res,
      h("button", { type: "button", class: "bt bt-sec bt-p", on: { click: () => {
        modoNovo = true; desenharContato();
        const q = busca.value.trim();
        const alvo = /^[0-9\s().+-]+$/.test(q) ? zonaContato.querySelector("[name=c_telefone]") : zonaContato.querySelector("[name=c_nome]");
        if (alvo && q) alvo.value = q;
        (alvo || zonaContato.querySelector("input")).focus();
      } } }, ui.icone("mais"), `Cadastrar ${k.v.min("contato")} novo`));
    // plano 1500c · RC-096: no toque o teclado cobriria metade da gaveta antes de a pessoa ver as opções — foco automático só com mouse
    let ponteiroFino = true;
    try { ponteiroFino = !(globalThis.matchMedia && globalThis.matchMedia("(pointer: coarse)").matches); } catch { /* ok */ }
    if (ponteiroFino) setTimeout(() => busca.focus(), 60);
  }
  desenharContato();

  /* funil e etapa */
  const selFunil = ui.campo({ rotulo: "Funil", nome: "funil_id", tipo: "select", valor: funilIni && funilIni.id,
    opcoes: (dados.funis || funis).map(f => ({ valor: f.id, rotulo: f.nome })) });
  const selEtapa = ui.campo({ rotulo: "Etapa", nome: "estagio_id", tipo: "select", opcoes: [] });
  const preencherEtapas = () => {
    const f = k.funil(selFunil.querySelector("select").value);
    const s = selEtapa.querySelector("select");
    ui.limpar(s);
    for (const e of (f ? f.estagios : []).filter(x => x.tipo === "aberto")) s.appendChild(h("option", { value: e.id, selected: e.id === dados.estagio_id }, e.nome));
  };
  selFunil.querySelector("select").addEventListener("change", preencherEtapas);
  preencherEtapas();

  const servicos = Object.keys(k.base.ticket || {});
  const inServico = ui.campo({ rotulo: k.v.servico, nome: "servico", max: 120, placeholder: servicos.length ? `Ex.: ${servicos[0]}` : "" });
  if (servicos.length) {
    // plano 1000 (CR-058): id único — a gaveta e o modal da conversa abertos juntos não disputam o mesmo datalist
    const idSrv = `srv-novo-${Math.random().toString(36).slice(2, 9)}`;
    const lista = h("datalist", { id: idSrv }, servicos.map(s => h("option", { value: s })));
    inServico.querySelector("input").setAttribute("list", idSrv);
    inServico.appendChild(lista);
  }
  const inValor = ui.campo({ rotulo: "Valor previsto", nome: "valor_previsto", tipo: "moeda", placeholder: "R$ 0,00", validar: "moeda" });
  inServico.querySelector("input").addEventListener("change", ev => {
    const t = Number(k.base.ticket && k.base.ticket[ev.target.value]);
    const iv = inValor.querySelector("input");
    if (Number.isFinite(t) && !iv.value) iv.value = t.toLocaleString("pt-BR", { minimumFractionDigits: 2 });
  });
  // plano 1000b · RB-207: o rótulo aponta para o seletor (clicar em «Responsável» foca o select)
  const selDonoNovo = ui.seletorPessoa({ usuarios: k.base.usuarios, valor: k.eu(), rotulo: "Responsável" });
  const idDonoNovo = L.idUnico("ng-dono");
  (selDonoNovo.tagName === "SELECT" ? selDonoNovo : selDonoNovo.querySelector("select")).id = idDonoNovo;
  const dono = h("div", { class: "campo" }, h("label", { for: idDonoNovo }, "Responsável"), selDonoNovo);
  dono.querySelector("select").name = "dono_id";
  let etiquetas = [];
  // formulário que só GUARDA o valor (grava no «Criar»): emite na hora — com a pausa de 300 ms a etiqueta marcada logo antes do «Criar» ficava fora
  const etq = ui.seletorEtiquetas({ todas: k.base.etiquetas, marcadas: Array.isArray(dados.etiquetas) ? dados.etiquetas.slice() : [], podeCriar: nome => k.criarEtiqueta(nome), aoMudar: ids => { etiquetas = ids; }, debounceMs: 0 });
  const erro = h("p", { class: "modal-erro", role: "alert", hidden: true });
  // M25: uma chave por intenção. Erro ambíguo (prazo estourado depois de o servidor aplicar) repete com a MESMA chave; mudou o conteúdo, chave nova.
  const status = h("p", { class: "crm-status", role: "status", "aria-live": "polite", hidden: true });
  let reqAtual = null, reqConteudo = "";
  // plano 1000b · RB-062: data da consulta no passado avisa aqui também (CR-052 — a gaveta e o modal da agenda já avisavam); não bloqueia
  const campoConsulta = ui.campo({ rotulo: `Data e hora da ${nomeCompromisso(k)}`, nome: "consulta_em", tipo: "datahora" });
  const avisoConsulta = h("small", { class: "ed-aviso", role: "status", hidden: true });
  campoConsulta.appendChild(avisoConsulta);
  const inConsulta = campoConsulta.querySelector("input");
  if (inConsulta) inConsulta.addEventListener("change", () => {
    const passou = !!inConsulta.value && L.dataPassou(inConsulta.value);
    avisoConsulta.textContent = passou ? `${L.TEXTO_DATA_PASSOU} O lembrete automático não vai rodar para ela.` : "";
    avisoConsulta.hidden = !passou;
  });

  // plano 1500c · RC-097: previsão de fechamento já no cadastro (opcional), com atalhos — depois quase ninguém volta para pôr
  const inPrev = h("input", { type: "date", name: "previsao_fechamento", class: "inp", "aria-label": "Previsão de fechamento (opcional)" });
  const hojeSPn = ui.hojeSP ? ui.hojeSP() : new Date().toISOString().slice(0, 10);
  const campoPrev = h("div", { class: "campo ng-prev-novo" }, h("span", { class: "campo-rot" }, "Previsão de fechamento (opcional)"), inPrev,
    h("div", { class: "tf-atalhos", role: "group", "aria-label": "Atalhos da previsão" }, L.atalhosPrevisao(hojeSPn).map(a =>
      h("button", { type: "button", class: "bt bt-fant bt-p tf-atalho", dataset: { valor: a.valor }, on: { click: () => { inPrev.value = a.valor; ui.anunciar && ui.anunciar(`Previsão: ${a.rotulo}.`); } } }, a.rotulo))));
  // plano 1500c · RC-082: «Duplicar» chega com o título, o serviço, o valor e as etiquetas do original
  if (dados.servico) inServico.querySelector("input").value = String(dados.servico);
  if (dados.valor_previsto != null && Number.isFinite(Number(dados.valor_previsto))) inValor.querySelector("input").value = Number(dados.valor_previsto).toLocaleString("pt-BR", { minimumFractionDigits: 2 });
  if (Array.isArray(dados.etiquetas)) etiquetas = dados.etiquetas.slice();
  const inTitulo = ui.campo({ rotulo: "Título (opcional)", nome: "titulo", max: 120, placeholder: `Ex.: ${servicos[0] || L.exemploTituloNegocio(k.v && k.v.vertical)}` });
  if (dados.titulo) { const it = inTitulo.querySelector("input"); if (it) it.value = String(dados.titulo).slice(0, 120); }
  form.append(zonaContato,
    // plano 1000b · RB-042: sem serviços no ticket o exemplo é da vertical (oficina não vê «Implante superior»)
    inTitulo,
    h("div", { class: "crm-form-2" }, selFunil, selEtapa, inServico, inValor, campoConsulta, dono, campoPrev),
    h("div", { class: "pilha-p" }, h("span", { class: "campo-rot" }, "Etiquetas"), etq),
    status, erro,
    h("div", { class: "linha linha-fim" },
      h("button", { type: "button", class: "bt bt-sec", on: { click: () => g.fechar() } }, "Cancelar"),
      h("button", { type: "submit", class: "bt bt-prim" }, ui.icone("check"), `Criar ${k.v.min("negocio")}`)));
  // M30: título e procedimento digitados sobrevivem a uma recarga/queda de sessão («Rascunho restaurado · descartar»); só somem quando o servidor confirmar
  const chaveRasc = `negocio:novo:${dados.contato_id ? `contato:${dados.contato_id}` : dados.conversa_id ? `conversa:${dados.conversa_id}` : "avulso"}`;
  const rascunhos = ["titulo", "servico"].map(n => k.rascunho(form.querySelector(`[name=${n}]`), `${chaveRasc}:${n}`));
  form.addEventListener("submit", async ev => {
    ev.preventDefault();
    erro.hidden = true;
    ui.marcarErro(form, null);
    const d = ui.lerForm(form);
    const campoValor = form.querySelector('[name="valor_previsto"]');
    // plano 1000 (CR-060): «mil» não vira «sem valor» em silêncio — erro no campo e nada vai ao servidor
    if (campoValor && L.dinheiroInvalido(campoValor.value)) { ui.marcarErro(form, "valor_previsto", "Valor inválido. Use só números, por exemplo 1.500,00."); return; }
    if (campoValor) d.valor_previsto = k.L.lerNumero(campoValor.value);   // "1.500" = mil e quinhentos
    const p = { funil_id: d.funil_id, estagio_id: d.estagio_id, titulo: d.titulo || null, servico: d.servico || null,
      valor_previsto: d.valor_previsto, consulta_em: d.consulta_em || null, dono_id: d.dono_id || null, etiquetas, origem: "manual" };
    if (inPrev.value) p.previsao_fechamento = inPrev.value;      // plano 1500c · RC-097
    if (dados.campos && typeof dados.campos === "object") p.campos = { ...dados.campos };      // plano 1500c · RC-082: campos do original
    if (dados.conversa_id) p.conversa_id = dados.conversa_id;
    if (contato) p.contato_id = contato.id;
    else if (modoNovo) {
      if (!d.c_nome && !d.c_telefone) { ui.marcarErro(form, "c_nome", "Informe o nome ou o telefone."); return; }
      if (d.c_telefone && !L.normalizarTelefone(d.c_telefone)) { ui.marcarErro(form, "c_telefone", L.textoTelefoneInvalido(d.c_telefone)); return; }      // plano 1500c · RC-098
      // plano 1000b · RB-053: e-mail conferido aqui, no campo (a mesma regra da ficha) — antes o erro voltava genérico do servidor
      if (d.c_email && !/^[^@\s]+@[^@\s]+\.[^@\s]+$/.test(String(d.c_email).trim())) { ui.marcarErro(form, "c_email", "E-mail inválido. Confira, por exemplo: ana@exemplo.com.br."); return; }
      p.contato = { nome: d.c_nome || null, telefone: d.c_telefone || null, email: d.c_email || null };
    } else { erro.textContent = `Escolha ${k.v.art("contato") === "a" ? "a" : "o"} ${k.v.min("contato")} ou cadastre ${k.v.art("contato") === "a" ? "uma nova" : "um novo"}.`; erro.hidden = false; return; }
    const conteudo = JSON.stringify(p);
    if (conteudo !== reqConteudo) { reqAtual = k.novaReq(); reqConteudo = conteudo; }
    try {
      const { resultado: n } = await ui.carregando(form.querySelector("[type=submit]"),
        k.escrever("nx_negocio_salvar", { p_negocio: p }, { req: reqAtual, aoStatus: t => { status.textContent = t; status.hidden = false; } }));
      status.hidden = true;
      for (const rc of rascunhos) rc.apagar();
      const abrirCriado = () => abrirNegocio(k, n.id, { aoMudar: aoCriar ? c => aoCriar({ ...c, atualizado: true }) : null });
      // C2: criado pela conversa, a pessoa continua no atendimento — a gaveta não abre por cima; o aviso traz «Abrir»
      if (dados.conversa_id) ui.toast(`${k.v.negocio} criad${k.v.art("negocio")} e ligad${k.v.art("negocio")} a este atendimento.`, { tipo: "ok", acao: { rotulo: "Abrir", fn: abrirCriado } });
      else ui.toast(`${k.v.negocio} criad${k.v.art("negocio")}.`, { tipo: "ok" });
      if (aoCriar) try { aoCriar(n); } catch (e2) { console.error(e2); }
      g.fechar();
      if (!dados.conversa_id) setTimeout(abrirCriado, 260);
    } catch (e) {
      status.hidden = true;
      if (e && e.ambigua) { erro.textContent = "Não foi possível confirmar se foi salvo. Toque em «Criar» de novo: é seguro, não duplica."; erro.hidden = false; }
      else if (e && e.codigo === "telefone_invalido") ui.marcarErro(form, "c_telefone", k.erro(e));
      else { erro.textContent = k.erro(e); erro.hidden = false; }
    }
  });
  g.corpo.appendChild(form);
  return g;
}

/* ============================================================ ficha 360 numa gaveta */
export async function abrirContato(k, id, { aoMudar } = {}) {
  const { ui, h } = k;
  let tela = null, fechou = false;
  // plano 1000 (CR-104): a ficha na gaveta assina o pulso — fechar a gaveta desliga
  const g = ui.gaveta({ titulo: k.v.contato, largura: "g", aoFechar: () => { fechou = true; if (tela && tela.desmontar) tela.desmontar(); } });
  const alvo = h("div", { class: "crm" });
  g.corpo.appendChild(alvo);
  const Lst = await k.mod("listas");
  tela = await Lst.montarFicha(k, alvo, id, { gaveta: g, aoMudar });
  if (fechou && tela && tela.desmontar) tela.desmontar();
  return g;
}
