/* ============================================================
   ÓRBITA — enviar.js (nx-enviar, ESPEC §6.3)
   Modo PAINEL (corpo com token e cliente): texto, midia, template, lido,
   testar_canal, inscrever_app, sincronizar_templates, reenviar (P1).
   Ordem fixa: autenticar (nx_fn_ctx) → conferir conversa/canal/mensagem
   pelas internas (404 se não for do cliente ou não for visível) → só então
   Graph API / Storage. Toda saída é gravada por nx_cv_saida (também a que
   falhou, com o motivo: o atendente vê o "!" e a dica).
   Modo CRON (header x-nx-cron): {fila:true} | {ids:[…]} | {alerta:{cliente,texto}}.
   ============================================================ */
import { criarDb } from "./db.js";
import {
  lerCorpo, autenticarCron, limparErro, comPrazo, ErroHttp, json,
  ErroApi, respostaPainel, tratarPainel, lerCorpoPainel, autenticarPainel, interna,
} from "./comum.js";
import {
  enviarTextoCanal, enviarMidiaCanal, enviarTemplateCanal, marcarLido, infoNumero, appsInscritos,
  inscreverApp, listarTemplates, textoFalhaCanal, aplicarParametros, enviarParaTodos,
} from "./whatsapp.js";
import { criarStorage, pathDoCliente, tipoAceito, arquivosDaPasta } from "./midia.js";
import { enviarTextoCodeWords, testarCodeWords } from "./codewords.js";

const PAPEL = {
  texto: "atendente", midia: "atendente", template: "atendente", reenviar: "atendente", lido: "leitura",
  testar_canal: "admin", inscrever_app: "admin", sincronizar_templates: "admin", testar_codewords: "admin",
};
const TIPO_MSG = { image: "imagem", video: "video", audio: "audio", document: "documento" };
const UUID = /^[0-9a-f]{8}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{12}$/i;
const PRAZO_GRAPH_MS = 20_000;
const PRAZO_CODEWORDS_MS = 110_000;
const FILA_MAX_ITENS = 100;
const FILA_MAX_MS = 110_000;

const idConversa = v => {
  const n = Number(v);
  if (!Number.isSafeInteger(n) || n <= 0) throw new ErroApi("conversa_nao_encontrada", 404);
  return n;
};
const idCanal = v => {
  if (!UUID.test(String(v ?? ""))) throw new ErroApi("canal_nao_encontrado", 404);
  return String(v);
};
const primeiroNome = n => String(n ?? "").trim().split(/\s+/)[0] || "";
const destino = cx => cx?.contato?.wa_id || cx?.contato?.telefone || null;

/* ------------------------------------------------------------
   Peças do modo painel
   ------------------------------------------------------------ */

/** Conversa do cliente E visível ao usuário (senão 404 conversa_nao_encontrada, sem rede). */
const contextoConversa = (db, ctx, cliente, conversa) =>
  interna(db, "nx_cv_contexto_envio", { p_ctx: ctx, p_cliente: cliente, p_conversa: idConversa(conversa) });

/** Credencial do canal do cliente (senão 404 canal_nao_encontrado). */
async function credencial(db, canal, cliente, { exigirToken = true } = {}) {
  if (!canal) throw new ErroApi("canal_nao_encontrado", 404);
  const cred = await interna(db, "nx_canal_credencial", { p_canal: idCanal(canal), p_cliente: cliente });
  if (exigirToken && (cred?.provedor === "codewords" ? !cred?.codewords_api_key || !cred?.codewords_service_id : !cred?.token)) {
    throw new ErroApi(cred?.provedor === "codewords" ? "codewords_sem_credencial" : "canal_sem_token", 400);
  }
  return cred;
}

async function enviarTextoPeloCanal(cred, para, texto, options = {}) {
  if (cred?.provedor === "codewords") {
    return enviarTextoCodeWords(cred, para, texto, {
      fetch: options.fetch,
      clientRef: options.clientRef,
      conversationId: options.conversationId,
      timeoutMs: options.timeoutMs ?? PRAZO_CODEWORDS_MS,
    });
  }
  return enviarTextoCanal(cred, para, texto, options);
}

/** Envio pela conversa: resolvida e janela fechada barram ANTES da Graph. */
function exigirConversaAberta(cx, { exigeJanela = true } = {}) {
  if (cx?.conversa?.status === "resolvida") throw new ErroApi("conversa_resolvida", 400);
  if (exigeJanela && !cx?.janela_aberta) throw new ErroApi("fora_da_janela", 400);
  if (!destino(cx)) throw new ErroApi("contato_nao_encontrado", 404);
}

/** Citação: só wamid de mensagem do MESMO contato neste cliente; senão é ignorada. */
async function citacaoValida(db, cliente, contatoId, wamid) {
  const w = String(wamid ?? "").trim();
  if (!w || w.length > 256 || !/^[\w.:=+/-]+$/.test(w) || !contatoId) return null;
  const [m] = await db.select("nx_mensagens", {
    wamid: `eq.${w}`, cliente_id: `eq.${cliente}`, contato_id: `eq.${contatoId}`, select: "id", limit: 1,
  });
  return m ? w : null;
}

/** Grava a saída (enviada ou falhou) e monta a resposta do painel. */
async function gravarSaida(db, ctx, cliente, conversa, msg, r) {
  const erro = r.ok ? null : textoFalhaCanal(r.erro);
  if (r.ambigua) return respostaPainel({
    ok: false, erro: "envio_falhou", ambigua: true,
    detalhe: "Confirmação pendente. A mensagem pode ter sido enviada; uma nova tentativa reutilizará a mesma referência.",
  }, 502);
  let mensagem;
  try {
    mensagem = await interna(db, "nx_cv_saida", {
      p_conta: ctx.conta_id, p_cliente: cliente, p_conversa: conversa,
      p_msg: {
        origem: "painel", ...msg, wamid: r.wamid || null,
        status: r.ok ? ({ delivered: "entregue", read: "lida" }[r.status] || "enviada") : "falhou", erro,
      },
    });
  } catch (e) {
    // O canal externo pode ter aceitado a mensagem antes de o banco falhar.
    // Preserva o client_ref no navegador para uma repetição idempotente.
    if (r.provedor === "codewords" && r.ok) return respostaPainel({
      ok: false, erro: "envio_falhou", ambigua: true,
      detalhe: "O CodeWords confirmou o envio, mas o Órbita não salvou a confirmação. Uma nova tentativa reutilizará a mesma referência.",
    }, 502);
    throw e;
  }
  return r.ok
    ? respostaPainel({ ok: true, mensagem })
    : respostaPainel({ ok: false, erro: "envio_falhou", detalhe: erro, mensagem });
}

/** @param {{conversa?, texto?, respondeA?, assinar?: boolean}} o  assinar:false = o texto já saiu assinado (reenviar) */
async function acaoTexto(db, ctx, corpo, deps, { conversa, texto, respondeA, assinar = true } = {}) {
  const cliente = String(corpo.cliente);
  const cx = await contextoConversa(db, ctx, cliente, conversa ?? corpo.conversa);
  const bruto = String(texto ?? corpo.texto ?? "").trim();
  if (!bruto || bruto.length > 4096) throw new ErroApi("dados_invalidos", 400, "texto");
  exigirConversaAberta(cx);
  const cred = await credencial(db, cx.canal_id, cliente);
  const citacao = await citacaoValida(db, cliente, cx.contato?.id, respondeA ?? corpo.responde_a);
  const nome = primeiroNome(cx.atendente_nome);
  const final = (assinar && cx.cfg_cv?.assinatura && nome ? `*${nome}:*\n${bruto}` : bruto).slice(0, 4096);
  const r = await enviarTextoPeloCanal(cred, destino(cx), final, {
    respondeA: citacao,
    fetch: cred.provedor === "codewords" ? (deps.fetch || deps.rede) : deps.rede,
    timeoutMs: PRAZO_CODEWORDS_MS,
    conversationId: cx.conversa.id,
    clientRef: corpo.client_ref,
  });
  return gravarSaida(db, ctx, cliente, cx.conversa.id, { tipo: "texto", corpo: final, responde_a_wamid: citacao }, r);
}

async function acaoMidia(db, ctx, corpo, deps, env) {
  const cliente = String(corpo.cliente);
  const cx = await contextoConversa(db, ctx, cliente, corpo.conversa);
  const path = String(corpo.path ?? "");
  // só arquivo que o próprio cliente subiu para ENVIAR (pasta out/)
  if (!pathDoCliente(path, cliente, "out")) throw new ErroApi("midia_nao_encontrada", 404);
  const tipo = tipoAceito(corpo.mime);
  if (!tipo) throw new ErroApi("midia_tipo", 400);
  exigirConversaAberta(cx);
  const cred = await credencial(db, cx.canal_id, cliente);
  if (cred.provedor === "codewords") throw new ErroApi("codewords_tipo_nao_suportado", 400, "mídia");
  const st = criarStorage(env, deps.fetch);
  const ass = await st.assinar([path], 3600);
  const link = ass.ok ? ass.urls[path] : null;
  if (!link) throw new ErroApi("midia_nao_encontrada", 404);
  const legenda = String(corpo.legenda ?? "").trim().slice(0, 1024) || null;
  const nome = String(corpo.nome ?? "").trim().slice(0, 200) || null;
  const citacao = await citacaoValida(db, cliente, cx.contato?.id, corpo.responde_a);
  const r = await enviarMidiaCanal(cred, destino(cx), { tipo: tipo.grupo, link, legenda, nome }, { respondeA: citacao, fetch: deps.rede });
  const mime = String(corpo.mime).split(";")[0].trim();
  const tamanho = Number(corpo.tamanho) > 0 ? Number(corpo.tamanho) : null;
  return gravarSaida(db, ctx, cliente, cx.conversa.id, {
    tipo: TIPO_MSG[tipo.grupo], corpo: tipo.grupo === "audio" ? null : legenda, responde_a_wamid: citacao,
    midia: { path, mime, nome, ...(tamanho ? { tamanho } : {}), estado: "ok" },
  }, r);
}

async function acaoTemplate(db, ctx, corpo, deps) {
  const cliente = String(corpo.cliente);
  const cx = await contextoConversa(db, ctx, cliente, corpo.conversa);
  if (!UUID.test(String(corpo.template_id ?? ""))) throw new ErroApi("template_invalido", 400);
  exigirConversaAberta(cx, { exigeJanela: false });   // modelo vale também sem janela ("Nova conversa")
  if (!cx.canal_id) throw new ErroApi("canal_nao_encontrado", 404);
  const tpl = await interna(db, "nx_template_ver", { p_cliente: cliente, p_template: String(corpo.template_id), p_canal: cx.canal_id });
  const parametros = Array.isArray(corpo.parametros) ? corpo.parametros.map(p => String(p ?? "").trim()) : [];
  if (parametros.length !== Number(tpl.num_parametros || 0) || parametros.some(p => !p || p.length > 1000)) {
    throw new ErroApi("template_invalido", 400, "parâmetros");
  }
  if (cx.contato?.optin_marketing === false && String(tpl.categoria).toUpperCase() === "MARKETING") {
    throw new ErroApi("template_invalido", 400, "o contato pediu para não receber mensagens de marketing");
  }
  const cred = await credencial(db, cx.canal_id, cliente);
  if (cred.provedor === "codewords") throw new ErroApi("codewords_tipo_nao_suportado", 400, "modelo");
  const r = await enviarTemplateCanal(cred, destino(cx), { nome: tpl.nome, idioma: tpl.idioma, corpo: tpl.corpo, parametros }, { fetch: deps.rede });
  return gravarSaida(db, ctx, cliente, cx.conversa.id, {
    tipo: "template", corpo: aplicarParametros(tpl.corpo, parametros).slice(0, 4096),
    template: { id: tpl.id, nome: tpl.nome, idioma: tpl.idioma, categoria: tpl.categoria, parametros },
  }, r);
}

/** Recibo de leitura para o cliente. Nunca falha para o usuário. */
async function acaoLido(db, ctx, corpo, deps) {
  const cliente = String(corpo.cliente);
  const cx = await contextoConversa(db, ctx, cliente, corpo.conversa);   // 404 se não visível
  if (ctx.papel === "leitura" || !cx.janela_aberta || !cx.ultimo_wamid_in || cx.cfg_cv?.recibo_leitura === false || !cx.canal_id) {
    return respostaPainel({ ok: true, enviado: false });
  }
  try {
    const cred = await credencial(db, cx.canal_id, cliente, { exigirToken: false });
    if (cred?.provedor === "codewords") return respostaPainel({ ok: true, enviado: false });
    if (!cred?.token) return respostaPainel({ ok: true, enviado: false });
    const r = await marcarLido(cred, cx.ultimo_wamid_in, { fetch: deps.rede });
    return respostaPainel({ ok: true, enviado: !!r.ok });
  } catch {
    return respostaPainel({ ok: true, enviado: false });
  }
}

/** (1) número responde? (2) app inscrito na WABA? → nx_canal_verificado (ativo só com os dois). */
async function testarCanal(db, cliente, canal, deps) {
  const cred = await credencial(db, canal, cliente, { exigirToken: false });
  if (cred.provedor === "codewords") throw new ErroApi("use_testar_codewords", 400);
  if (!cred?.token) {
    await interna(db, "nx_canal_verificado", { p_canal: canal, p_cliente: cliente, p_ok: false, p_numero: null, p_qualidade: null, p_inscrito: null, p_erro: "número sem token" });
    throw new ErroApi("canal_sem_token", 400);
  }
  const info = await infoNumero(cred, { fetch: deps.rede });
  if (!info.ok) {
    const erro = textoFalhaCanal(info.erro);
    const v = await interna(db, "nx_canal_verificado", { p_canal: canal, p_cliente: cliente, p_ok: false, p_numero: null, p_qualidade: null, p_inscrito: null, p_erro: erro });
    return { ok: false, erro: "envio_falhou", detalhe: erro, status: v?.status || "erro" };
  }
  const ins = cred.waba_id ? await appsInscritos(cred, { fetch: deps.rede }) : { ok: false, erro: { code: "?", title: "WABA não informada" } };
  const inscrito = !!(ins.ok && ins.inscrito);
  const aviso = !ins.ok ? textoFalhaCanal(ins.erro)
    : !inscrito ? "O app não está inscrito na conta do WhatsApp (WABA) — use \"Inscrever o app\"; sem isso nenhuma mensagem chega." : null;
  const v = await interna(db, "nx_canal_verificado", {
    p_canal: canal, p_cliente: cliente, p_ok: true, p_numero: info.numero, p_qualidade: info.qualidade, p_inscrito: inscrito, p_erro: aviso,
  });
  return {
    ok: true, numero: info.numero, nome_verificado: info.nome_verificado, qualidade: info.qualidade,
    app_inscrito: inscrito, status: v?.status || (inscrito ? "ativo" : "pendente"), ...(aviso ? { aviso } : {}),
  };
}

async function acaoTestarCanal(db, ctx, corpo, deps) {
  const t = await testarCanal(db, String(corpo.cliente), idCanal(corpo.canal), deps);
  return respostaPainel(t);
}

async function acaoTestarCodeWords(db, ctx, corpo, deps) {
  const cliente = String(corpo.cliente), canal = idCanal(corpo.canal);
  const cred = await credencial(db, canal, cliente, { exigirToken: false });
  if (cred.provedor !== "codewords") throw new ErroApi("canal_nao_encontrado", 404);
  const r = await testarCodeWords(cred, { fetch: deps.fetch || deps.rede });
  const status = await interna(db, "nx_codewords_canal_verificado", {
    p_canal: canal, p_cliente: cliente, p_ok: !!r.ok, p_erro: r.ok ? null : String(r.erro || "workflow não respondeu"),
  });
  return respostaPainel({ ...r, status: status?.status || (r.ok ? "ativo" : "erro") });
}

async function acaoInscreverApp(db, ctx, corpo, deps) {
  const cliente = String(corpo.cliente), canal = idCanal(corpo.canal);
  const cred = await credencial(db, canal, cliente);
  if (cred.provedor === "codewords") throw new ErroApi("canal_nao_encontrado", 404);
  if (!cred.waba_id) throw new ErroApi("dados_invalidos", 400, "waba_id");
  const r = await inscreverApp(cred, { fetch: deps.rede });
  if (!r.ok) {
    const perm = [10, 200, 190, 100].includes(Number(r.erro?.code));
    return respostaPainel({
      ok: false, erro: "envio_falhou",
      detalhe: perm ? `${textoFalhaCanal(r.erro)} — o token precisa da permissão whatsapp_business_management` : textoFalhaCanal(r.erro),
    });
  }
  const t = await testarCanal(db, cliente, canal, deps);
  return respostaPainel({ ...t, ok: t.ok, app_inscrito: !!t.app_inscrito });
}

async function acaoSincronizar(db, ctx, corpo, deps) {
  const cliente = String(corpo.cliente), canal = idCanal(corpo.canal);
  const cred = await credencial(db, canal, cliente);
  if (cred.provedor === "codewords") throw new ErroApi("canal_nao_encontrado", 404);
  if (!cred.waba_id) throw new ErroApi("dados_invalidos", 400, "waba_id");
  const r = await listarTemplates(cred, { fetch: deps.rede });
  if (!r.ok) return respostaPainel({ ok: false, erro: "envio_falhou", detalhe: textoFalhaCanal(r.erro) });
  const g = await interna(db, "nx_templates_gravar", { p_canal: canal, p_cliente: cliente, p_lista: r.lista });
  return respostaPainel({ ok: true, total: Number(g?.total) || 0, completo: r.completo });
}

async function acaoReenviar(db, ctx, corpo, deps) {
  const id = Number(corpo.mensagem);
  if (!Number.isSafeInteger(id) || id <= 0) throw new ErroApi("mensagem_nao_encontrada", 404);
  const m = await interna(db, "nx_cv_msg_reenvio", { p_ctx: ctx, p_cliente: String(corpo.cliente), p_mensagem: id });
  // o corpo gravado já é o texto que saiu (com a assinatura, se estava ligada): reenviar igual, sem assinar de novo
  return acaoTexto(db, ctx, corpo, deps, { conversa: m.conversa_id, texto: m.corpo, respondeA: m.responde_a_wamid, assinar: false });
}

/* ------------------------------------------------------------
   Fila (automações, fora do horário, agendadas) — modo cron e webhook
   ------------------------------------------------------------ */

/** Um item da fila: pula/falha com motivo ou envia e grava por nx_cv_saida. Nunca lança. */
async function enviarItem(db, item, creds, rede) {
  const concluir = (status, erro, msgId) => db.rpc("nx_fila_concluir", {
    p_id: item.id, p_status: status, p_erro: erro ? limparErro(erro).slice(0, 500) : null, p_mensagem: msgId ?? null,
  });
  try {
    if (!item.conversa_id || !item.conversa) { await concluir("falhou", "item sem conversa"); return "falhou"; }
    if (item.contato?.bloqueado) { await concluir("pulado", "contato bloqueado"); return "pulado"; }
    const para = item.contato?.wa_id || item.contato?.telefone;
    if (!para) { await concluir("falhou", "contato sem telefone"); return "falhou"; }
    let corpoMsg, envio;
    if (item.tipo === "texto") {
      if (!item.janela_aberta) { await concluir("pulado", "fora da janela de 24 h"); return "pulado"; }
      corpoMsg = String(item.texto ?? "").trim().slice(0, 4096);
      if (!corpoMsg) { await concluir("falhou", "texto vazio"); return "falhou"; }
    } else {
      const modelo = item.modelo;
      if (!modelo || modelo.status !== "APPROVED") { await concluir("falhou", "modelo não aprovado ou não encontrado neste número"); return "falhou"; }
      if (item.contato?.optin_marketing === false && String(modelo.categoria).toUpperCase() === "MARKETING") {
        await concluir("pulado", "contato pediu para não receber mensagens de marketing"); return "pulado";
      }
      const parametros = (Array.isArray(item.template?.parametros) ? item.template.parametros : []).map(p => String(p ?? ""));
      if (parametros.length !== Number(modelo.num_parametros || 0)) { await concluir("falhou", "número de parâmetros não bate com o modelo"); return "falhou"; }
      corpoMsg = aplicarParametros(modelo.corpo, parametros).slice(0, 4096);
      envio = { nome: modelo.nome, idioma: modelo.idioma, corpo: modelo.corpo, parametros };
    }
    const chave = `${item.cliente_id}:${item.canal_id}`;
    if (!creds.has(chave)) {
      creds.set(chave, await db.rpc("nx_canal_credencial", { p_canal: item.canal_id, p_cliente: item.cliente_id }).catch(() => null));
    }
    const cred = creds.get(chave);
    if (cred?.provedor === "codewords" && item.tipo !== "texto") {
      await concluir("falhou", "CodeWords: fila aceita somente mensagens de texto neste momento"); return "falhou";
    }
    if (cred?.provedor === "codewords" ? (!cred?.codewords_api_key || !cred?.codewords_service_id) : !cred?.token) {
      await concluir("falhou", cred?.provedor === "codewords" ? "integração CodeWords sem credencial" : "número sem token"); return "falhou";
    }
    const r = item.tipo === "texto"
      ? await enviarTextoPeloCanal(cred, para, corpoMsg, {
        fetch: cred.provedor === "codewords" ? (creds.fetchCodeWords || rede) : rede,
        timeoutMs: PRAZO_CODEWORDS_MS,
        conversationId: item.conversa_id,
        clientRef: cred.provedor === "codewords" ? `orbita:fila:${item.id}` : undefined,
      })
      : await enviarTemplateCanal(cred, para, envio, { fetch: rede });
    const erro = r.ok ? null : textoFalhaCanal(r.erro);
    const msg = await db.rpc("nx_cv_saida", {
      p_conta: item.origem === "agendada" ? (item.criado_por ?? null) : null,
      p_cliente: item.cliente_id, p_conversa: item.conversa_id,
      p_msg: {
        tipo: item.tipo === "texto" ? "texto" : "template", corpo: corpoMsg, origem: item.origem,
        ...(envio ? { template: { id: item.modelo.id, nome: envio.nome, idioma: envio.idioma, categoria: item.modelo.categoria, parametros: envio.parametros } } : {}),
        wamid: r.wamid || null, status: r.ok ? "enviada" : "falhou", erro,
      },
    }).catch(() => null);
    await concluir(r.ok ? "enviado" : "falhou", erro, msg?.id);
    return r.ok ? "enviado" : "falhou";
  } catch (e) {
    try { await concluir("falhou", e?.message || e); } catch { /* o item volta pela faxina da fila (F7) */ }
    return "falhou";
  }
}

/**
 * Esvazia a fila: com ids (webhook, item que acabou de criar) só esses; sem ids (cron) em
 * lotes de 20 até esvaziar, 100 itens ou 110 s. nx_fila_pegar marca 'enviando' com skip
 * locked: webhook e cron nunca mandam o mesmo item duas vezes.
 */
export async function enviarFila(db, { ids } = {}, ctx = {}) {
  const fetchCru = ctx.fetch || globalThis.fetch;
  const rede = ctx.rede || comPrazo(fetchCru, PRAZO_GRAPH_MS);
  const redeCodeWords = ctx.redeCodeWords || comPrazo(fetchCru, PRAZO_CODEWORDS_MS);
  const res = { total: 0, enviado: 0, pulado: 0, falhou: 0 };
  const creds = new Map();
  creds.fetchCodeWords = redeCodeWords;
  const inicio = Date.now();
  const lista = Array.isArray(ids) ? ids.map(Number).filter(n => Number.isSafeInteger(n) && n > 0).slice(0, 100) : null;
  if (lista && !lista.length) return res;
  for (;;) {
    const lote = lista
      ? await db.rpc("nx_fila_pegar", { p_limite: lista.length, p_ids: lista })
      : await db.rpc("nx_fila_pegar", { p_limite: 20 });
    if (!Array.isArray(lote) || !lote.length) break;
    for (const item of lote) { res[await enviarItem(db, item, creds, rede)]++; res.total++; }
    if (lista || res.total >= FILA_MAX_ITENS || Date.now() - inicio > FILA_MAX_MS) break;
  }
  return res;
}

/** Lixo de mídia (contato/cliente excluído): apaga do Storage no servidor. Nunca lança. */
export async function limparMidia(db, env, f) {
  const res = { apagados: 0, pastas: 0, erros: 0 };
  let itens;
  try { itens = await db.rpc("nx_midia_lixo_pegar", { p_limite: 100 }); } catch (e) { return { ...res, erro: limparErro(e?.message || e) }; }
  if (!Array.isArray(itens) || !itens.length) return res;
  const st = criarStorage(env, f);
  const concluir = (ids, erro) => db.rpc("nx_midia_lixo_concluir", { p_ids: ids, p_erro: erro ?? null }).catch(() => null);
  // arquivos soltos: só dentro da pasta do próprio cliente
  const arquivos = itens.filter(i => !String(i.path).endsWith("/") && pathDoCliente(i.path, i.cliente_id));
  const invalidos = itens.filter(i => !String(i.path).endsWith("/") && !pathDoCliente(i.path, i.cliente_id));
  if (invalidos.length) { await concluir(invalidos.map(i => i.id), "path fora da pasta do cliente"); res.erros += invalidos.length; }
  for (let i = 0; i < arquivos.length; i += 100) {
    const parte = arquivos.slice(i, i + 100);
    const r = await st.apagar(parte.map(x => x.path));
    if (r.ok) { await concluir(parte.map(x => x.id), null); res.apagados += parte.length; }
    else { await concluir(parte.map(x => x.id), `Storage: ${r.erro}`); res.erros += parte.length; }
  }
  // pasta inteira (cliente excluído): lista recursivo e apaga; o que sobrar fica para a próxima rodada
  for (const p of itens.filter(i => String(i.path).endsWith("/")).slice(0, 5)) {
    if (String(p.path) !== `${p.cliente_id}/`) { await concluir([p.id], "pasta fora do cliente"); res.erros++; continue; }
    try {
      const { arquivos: lista, completo } = await arquivosDaPasta(st, p.path, 1000);
      for (let i = 0; i < lista.length; i += 100) {
        const r = await st.apagar(lista.slice(i, i + 100));
        if (!r.ok) throw new Error(`Storage: ${r.erro}`);
        res.apagados += Math.min(100, lista.length - i);
      }
      if (completo) { await concluir([p.id], null); res.pastas++; }
    } catch (e) { await concluir([p.id], limparErro(e?.message || e)); res.erros++; }
  }
  return res;
}

/* ------------------------------------------------------------
   Handler
   ------------------------------------------------------------ */
const CHAVES_CRON = new Set(["fila", "alerta", "ids"]);

async function modoCron(req, env, deps, f) {
  const db = criarDb(env, f);
  const cfg = await autenticarCron(req, db);   // 401 sem o cron_token
  const corpo = await lerCorpo(req);
  const chaves = Object.keys(corpo);
  // só o nx_disparar chama este modo; qualquer chave desconhecida é recusada (nunca repassa nada)
  if (!chaves.length || chaves.some(k => !CHAVES_CRON.has(k))) return json({ ok: false, erro: "dados_invalidos" }, 400);
  const rede = comPrazo(f, deps.prazoRede ?? PRAZO_GRAPH_MS);
  const ctx = { rede, fetch: f };
  const out = { ok: true };
  if (Array.isArray(corpo.ids)) out.fila = await enviarFila(db, { ids: corpo.ids }, ctx);
  if (corpo.fila === true) {
    out.fila = await enviarFila(db, {}, ctx);
    out.midia = await limparMidia(db, env, f);
  }
  if (corpo.alerta != null) {
    const a = corpo.alerta && typeof corpo.alerta === "object" ? corpo.alerta : {};
    const texto = String(a.texto ?? "").trim().slice(0, 1000);
    let destinos = [];
    try {
      if (!UUID.test(String(a.cliente ?? ""))) throw new Error("cliente_nao_encontrado");
      destinos = (await db.rpc("nx_alerta_destinos", { p_cliente: String(a.cliente) }))?.destinos || [];
    } catch (e) {
      console.error("nx-enviar alerta:", limparErro(e?.message || e));
      out.alerta = { enviados: 0, erro: "cliente_nao_encontrado" };
    }
    if (!out.alerta) {
      const envio = texto && destinos.length ? await enviarParaTodos(cfg, destinos, texto, { fetch: rede, titulo: "Aviso da automação" }) : [];
      out.alerta = { enviados: envio.filter(e => e.ok).length, falhas: envio.filter(e => !e.ok).length };
    }
  }
  return json(out);
}

/**
 * @param {Request} req
 * @param {{url: string, chave: string}} env
 * @param {{fetch?: Function, agora?: Date|Function, prazoRede?: number, emSegundoPlano?: (p: Promise<unknown>) => void}} [deps]
 */
export async function tratar(req, env, deps = {}) {
  const f = deps.fetch || globalThis.fetch;
  if (req.method === "POST" && req.headers.get("x-nx-cron") != null) {
    try { return await modoCron(req, env, deps, f); }
    catch (e) {
      if (e instanceof ErroHttp) return json({ ok: false, erro: e.message }, e.status);
      return json({ ok: false, erro: limparErro(e?.message || e) }, 500);
    }
  }
  return tratarPainel(req, async () => {
    const corpo = await lerCorpoPainel(req);
    const acao = String(corpo.acao ?? "");
    // só as chaves próprias ("constructor", "__proto__"… não são ações)
    if (!Object.hasOwn(PAPEL, acao)) throw new ErroApi("dados_invalidos", 400, "acao");
    const db = criarDb(env, f);
    const ctx = await autenticarPainel(db, corpo, PAPEL[acao]);
    const d = { ...deps, fetch: f, rede: comPrazo(f, deps.prazoRede ?? PRAZO_GRAPH_MS) };
    if (PAPEL[acao] === "admin") await interna(db, "nx_exigir_modulo", { p_cliente: String(corpo.cliente), p_modulo: "conversas" });
    switch (acao) {
      case "texto": return acaoTexto(db, ctx, corpo, d);
      case "midia": return acaoMidia(db, ctx, corpo, d, env);
      case "template": return acaoTemplate(db, ctx, corpo, d);
      case "lido": return acaoLido(db, ctx, corpo, d);
      case "testar_canal": return acaoTestarCanal(db, ctx, corpo, d);
      case "testar_codewords": return acaoTestarCodeWords(db, ctx, corpo, d);
      case "inscrever_app": return acaoInscreverApp(db, ctx, corpo, d);
      case "sincronizar_templates": return acaoSincronizar(db, ctx, corpo, d);
      case "reenviar": return acaoReenviar(db, ctx, corpo, d);
    }
    throw new ErroApi("dados_invalidos", 400, "acao");
  });
}
