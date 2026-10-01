/* ============================================================
   ÓRBITA — enviar.js (nx-enviar, ESPEC §6.3)
   Modo PAINEL (corpo com token e cliente): texto, midia, template, lido,
   testar_canal, inscrever_app, sincronizar_templates, reenviar (P1).
   Ordem fixa: autenticar (nx_fn_ctx) → conferir conversa/canal/mensagem
   pelas internas (404 se não for do cliente ou não for visível) → só então
   Graph API / Storage. Toda saída é gravada por nx_cv_saida (também a que
   falhou, com o motivo: o atendente vê o "!" e a dica).
   Modo CRON (header x-nx-cron): {fila:true} | {ids:[…]} | {alerta:{cliente,texto}}.
   Canal CodeWords (modelo "aparelho", codewords.js): TEXTO (form-urlencoded,
   60 s) e MÍDIA do painel — foto, áudio, vídeo e documento (multipart, 75 s:
   o arquivo é baixado do Storage e vai em bytes para o proxy do aparelho) —,
   sem janela de 24 h, sem citação e sem modelo da Meta. Áudio WAV (gravado na
   tela) só existe neste canal: em canal Meta é midia_tipo. A fila de envios
   automáticos continua só texto. Timeout/5xx é ambíguo: grava 'pendente' com
   id provisório (a sincronização adota a gêmea) e NUNCA reenvia sozinho.
   Atendente respondeu → pausa a IA.
   Idempotência (M36): o painel manda um `client_ref` por INTENÇÃO de envio
   (texto, mídia e modelo). O ref é RESERVADO no banco (nx_cv_ref_reservar)
   depois de conferir o pedido e ANTES de falar com a Meta/CodeWords, então
   dois pedidos simultâneos com o mesmo ref nunca enviam em dobro:
     novo         → este pedido envia;
     gravada      → devolve a saída que já existe (repetida:true), sem enviar;
     em_andamento → 409 envio_em_andamento (outro pedido está enviando agora:
                    o painel espera e tenta depois, sem contar como falha);
     antiga       → 502 envio_falhou + ambigua (reservado há mais de 150 s e
                    sem saída gravada: pode ter saído; NUNCA reenvia).
   Erro antes de qualquer contato com o canal (conversa resolvida, número sem
   credencial…) solta a reserva (nx_cv_ref_liberar): a próxima tentativa envia.
   Sem a migração 20261002d (função ausente, 404) cai na conferência antiga
   (nx_cv_ref_ver) e, sem ela também, envia como sempre.
   ============================================================ */
import { criarDb } from "./db.js";
import {
  lerCorpo, autenticarCron, limparErro, comPrazo, ErroHttp, json,
  ErroApi, respostaPainel, tratarPainel, lerCorpoPainel, autenticarPainel, interna, soltandoCorpo,
} from "./comum.js";
import {
  enviarTextoCanal, enviarMidiaCanal, enviarTemplateCanal, marcarLido, infoNumero, appsInscritos,
  inscreverApp, listarTemplates, textoFalhaCanal, aplicarParametros, enviarParaTodos,
} from "./whatsapp.js";
import { criarStorage, pathDoCliente, tipoAceito, arquivosDaPasta, soAparelho, mimeBase } from "./midia.js";
import { enviarTextoCodeWords, enviarMidiaCodeWords, estadoCanalCodeWords, MAX_MIDIA } from "./codewords.js";

const PAPEL = {
  texto: "atendente", midia: "atendente", template: "atendente", reenviar: "atendente", lido: "leitura",
  testar_canal: "admin", inscrever_app: "admin", sincronizar_templates: "admin", testar_codewords: "admin",
};
const TIPO_MSG = { image: "imagem", video: "video", audio: "audio", document: "documento" };
const UUID = /^[0-9a-f]{8}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{12}$/i;
const PRAZO_GRAPH_MS = 20_000;
// mídia pelo aparelho: baixar do Storage é rápido (mesma região); o resto dos 100 s da tela fica para o envio (75 s) e a conferência (15 s)
const PRAZO_BAIXAR_MS = 8_000;
// fila: uma Edge Function morre em 150 s; envio que não cabe no que sobra volta para a fila sem sair
const FILA_LIMITE_MS = 140_000;
const RESERVA_ENVIO_MS = { codewords: 62_000, meta: 22_000 };
const FILA_MAX_ITENS = 100;
const FILA_MAX_MS = 110_000;

const REF_CLIENTE = /^[A-Za-z0-9:_.-]{8,80}$/;
/** client_ref do painel: ausente = comportamento de sempre; malformado = 400 dados_invalidos (hint client_ref). */
function clientRefDe(corpo) {
  const v = corpo?.client_ref;
  if (v === undefined || v === null || v === "") return null;
  if (typeof v !== "string" || !REF_CLIENTE.test(v)) throw new ErroApi("dados_invalidos", 400, "client_ref");
  return v;
}

/**
 * Resposta do painel para um client_ref que JÁ tem saída gravada (nada é enviado de novo).
 * Saída que falhou volta como falha (a pessoa decide "Tentar de novo", que é uma intenção NOVA, com outro client_ref);
 * saída em dúvida (CodeWords, timeout) volta como ambígua — nunca reenvia sozinho.
 */
function respostaDaGravada(m) {
  if (m.status === "falhou") return respostaPainel({ ok: false, erro: "envio_falhou", detalhe: m.erro || "O canal não aceitou a mensagem.", mensagem: m, repetida: true });
  return respostaPainel({ ok: true, mensagem: m, repetida: true, ...(m.status === "pendente" ? { ambigua: true, aviso: m.erro || null } : {}) });
}

/** Função interna que ainda não existe no banco (migração não aplicada): o PostgREST responde 404 citando o nome dela. */
const funcaoAusente = (e, nome) => e?.status === 404 && String(e?.message).includes(nome);

/**
 * Conferência antiga (sem reserva): o mesmo client_ref já gravou uma saída nesta conversa? Devolve a resposta do painel SEM
 * enviar nada (null = ainda não). Só é usada quando nx_cv_ref_reservar não existe no banco.
 */
async function respostaJaGravada(db, cliente, conversa, ref) {
  if (!ref) return null;
  let m;
  try { m = await interna(db, "nx_cv_ref_ver", { p_cliente: cliente, p_conversa: conversa, p_ref: ref }); }
  catch (e) {
    // a função só existe depois da migração 20261002d: sem ela o envio segue como sempre (sem idempotência), em vez de travar o chat
    if (funcaoAusente(e, "nx_cv_ref_ver")) { console.error("nx-enviar: nx_cv_ref_ver ausente (aplicar 20261002d); enviando sem idempotência"); return null; }
    throw e;
  }
  return m ? respostaDaGravada(m) : null;
}

/**
 * RESERVA o client_ref antes de falar com o canal: só UM pedido por ref segue para o envio (dois pedidos simultâneos com o
 * mesmo ref não enviam em dobro). Devolve {resposta} quando não é para enviar (responder isso e parar) ou {ref, dono} para
 * seguir; dono = este pedido segura a reserva e a solta se der erro antes do canal (liberarRef).
 */
async function reservarRef(db, cliente, conversa, ref) {
  if (!ref) return { ref: null, dono: false };
  let r;
  try { r = await interna(db, "nx_cv_ref_reservar", { p_cliente: cliente, p_conversa: conversa, p_ref: ref }); }
  catch (e) {
    if (!funcaoAusente(e, "nx_cv_ref_reservar")) throw e;
    // banco ainda sem a reserva (20261002d): vale a conferência antiga, que não segura dois pedidos simultâneos
    console.error("nx-enviar: nx_cv_ref_reservar ausente (aplicar 20261002d); sem reserva, só a conferência antes do envio");
    const resposta = await respostaJaGravada(db, cliente, conversa, ref);
    return resposta ? { resposta } : { ref, dono: false };
  }
  if (r?.estado === "novo") return { ref, dono: true };
  if (r?.estado === "gravada" && r.mensagem) return { resposta: respostaDaGravada(r.mensagem) };
  // outro pedido com este ref está enviando agora: o painel espera e tenta depois (não é falha)
  if (r?.estado === "em_andamento") return { resposta: respostaPainel({ ok: false, erro: "envio_em_andamento" }, 409) };
  // reservado há mais tempo do que uma função vive e sem saída gravada: pode ter saído; reenviar daria mensagem em dobro
  if (r?.estado === "antiga") {
    return { resposta: respostaPainel({
      ok: false, erro: "envio_falhou", ambigua: true,
      detalhe: "A mensagem pode ter saído, mas o Órbita não conseguiu confirmar. Confira no WhatsApp antes de mandar de novo.",
    }, 502) };
  }
  throw new Error("nx_cv_ref_reservar devolveu um estado desconhecido");   // sem saber o estado, não envia
}

/** Solta a reserva de quem a segura (erro em que com certeza nada saiu). Nunca lança: se falhar, o ref fica "em andamento" e depois ambíguo. */
async function liberarRef(db, cliente, reserva) {
  if (!reserva?.dono) return;
  try { await interna(db, "nx_cv_ref_liberar", { p_cliente: cliente, p_ref: reserva.ref }); }
  catch (e) { console.error("nx-enviar liberar client_ref:", limparErro(e?.message || e)); }
}

/** Roda o preparo do envio (tudo o que vem ANTES de falar com o canal). Se ele falhar, nada saiu: solta a reserva e repassa o erro. */
async function antesDoCanal(db, cliente, reserva, preparar) {
  try { return await preparar(); }
  catch (e) { await liberarRef(db, cliente, reserva); throw e; }
}

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
  if (exigirToken && cred?.provedor === "codewords") {
    if (!cred?.codewords_api_key) throw new ErroApi("codewords_sem_credencial", 400);
    if (!cred?.codewords_phone_id) throw new ErroApi("codewords_sem_aparelho", 400);
  } else if (exigirToken && !cred?.token) {
    throw new ErroApi("canal_sem_token", 400);
  }
  return cred;
}

const ehCodeWords = cred => cred?.provedor === "codewords";

/** Texto: Meta pela Graph; CodeWords pelo proxy do aparelho (confere o número do aparelho antes). */
function enviarTextoPeloCanal(cred, para, texto, options = {}) {
  if (ehCodeWords(cred)) return enviarTextoCodeWords(cred, para, texto, { fetch: options.fetchCru, db: options.db });
  return enviarTextoCanal(cred, para, texto, options);
}

/** Erro de envio legível: o CodeWords já vem em português claro; a Graph passa pelas dicas. */
const textoFalha = r => {
  if (r.ok) return null;
  const base = r.provedor === "codewords" ? String(r.erro?.title || "O CodeWords não aceitou a mensagem.").slice(0, 500) : textoFalhaCanal(r.erro);
  return r.ambigua ? `STATUS INCERTO: ${base}`.slice(0, 500) : base;
};

/** Id provisório do envio ambíguo: a sincronização troca pelo id do aparelho (gêmea: mesmo texto, ±5 min). */
const wamidProvisorio = canal => `cw:${canal}:orbita-p-${crypto.randomUUID().replace(/-/g, "")}`;

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

/**
 * Grava a saída (enviada, falhou ou — CodeWords ambíguo — pendente) e monta a resposta do painel.
 * CodeWords: resposta de atendente pausa a IA da conversa (também quando o envio ficou em dúvida).
 */
async function gravarSaida(db, ctx, cliente, conversa, msg, r, canal, ref = null) {
  const erro = textoFalha(r);
  const duvida = !r.ok && r.ambigua;
  const pausarIA = async () => {
    if (r.provedor === "codewords" && (r.ok || duvida)) {
      try { await interna(db, "nx_cv_ia_pausa_auto", { p_cliente: cliente, p_conversa: conversa, p_por: "painel", p_conta: ctx.conta_id }); }
      catch (e) { console.error("nx-enviar pausa da IA:", limparErro(e?.message || e)); }   // a mensagem já saiu
    }
  };
  let mensagem;
  try {
    mensagem = await interna(db, "nx_cv_saida", {
      p_conta: ctx.conta_id, p_cliente: cliente, p_conversa: conversa,
      p_msg: {
        origem: "painel", ...msg,
        wamid: r.wamid || (duvida ? wamidProvisorio(canal) : null),
        status: r.ok ? "enviada" : duvida ? "pendente" : "falhou", erro,
      },
    });
  } catch (e) {
    // O aparelho pode ter enviado antes de o banco falhar: um 500 aqui faria o atendente clicar de novo e o
    // cliente receber a mensagem duas vezes. A sincronização traz a mensagem de volta pelo aparelho.
    if (r.ok || duvida) {
      console.error("nx-enviar gravar saída:", limparErro(e?.message || e));
      await pausarIA();
      return respostaPainel({
        ok: false, erro: "envio_falhou", ambigua: true,
        detalhe: "A mensagem pode ter saído, mas o Órbita não conseguiu salvá-la. Confira no WhatsApp antes de mandar de novo.",
      }, 502);
    }
    throw e;
  }
  // grava o client_ref na saída e aponta a reserva para ela: daqui em diante a repetição devolve esta mensagem.
  // Se o marcar falhar, a reserva fica sem mensagem e a repetição responde "pode ter saído" — nunca reenvia.
  if (ref && mensagem?.id) {
    try { await interna(db, "nx_cv_ref_marcar", { p_cliente: cliente, p_mensagem: mensagem.id, p_ref: ref }); }
    catch (e) { console.error("nx-enviar marcar client_ref:", limparErro(e?.message || e)); }
  }
  await pausarIA();
  if (duvida) return respostaPainel({ ok: true, mensagem, ambigua: true, aviso: erro });
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
  // M36: o mesmo client_ref não envia de novo (vale até para conversa resolvida/janela fechada depois: a saída já existe)
  const reserva = await reservarRef(db, cliente, cx.conversa.id, clientRefDe(corpo));
  if (reserva.resposta) return reserva.resposta;
  const { cred, citacao, final } = await antesDoCanal(db, cliente, reserva, async () => {
    // o aparelho do CodeWords não tem janela de 24 h (é um WhatsApp comum)
    exigirConversaAberta(cx, { exigeJanela: cx.canal?.provedor !== "codewords" });
    const cred = await credencial(db, cx.canal_id, cliente);
    // citação (resposta a uma mensagem) só existe na Graph
    const citacao = ehCodeWords(cred) ? null : await citacaoValida(db, cliente, cx.contato?.id, respondeA ?? corpo.responde_a);
    const nome = primeiroNome(cx.atendente_nome);
    const final = (assinar && cx.cfg_cv?.assinatura && nome ? `*${nome}:*\n${bruto}` : bruto).slice(0, 4096);
    return { cred, citacao, final };
  });
  const r = await enviarTextoPeloCanal(cred, destino(cx), final, { respondeA: citacao, fetch: deps.rede, fetchCru: deps.fetch, db });
  return gravarSaida(db, ctx, cliente, cx.conversa.id, { tipo: "texto", corpo: final, responde_a_wamid: citacao }, r, cx.canal_id, reserva.ref);
}

/**
 * Bytes do arquivo no Storage (pela URL assinada): o proxy do aparelho recebe o ARQUIVO, não um link.
 * Não baixou ou veio vazio → 404 midia_nao_encontrada; acima de 16 MB (declarado ou real) → 400 midia_grande.
 */
async function baixarMidia(link, f) {
  const ctl = new AbortController();
  let r = null, leitor = null, timer;
  const prazo = new Promise((_, rejeita) => {
    timer = setTimeout(() => {
      const erro = new Error("prazo do download excedido");
      ctl.abort(erro);
      rejeita(erro);
    }, PRAZO_BAIXAR_MS);
  });
  const cancelar = () => {
    try {
      const p = leitor ? leitor.cancel() : r?.body?.cancel();
      if (p && typeof p.catch === "function") p.catch(() => null);
    } catch { /* melhor esforço: não prende a Edge numa resposta recusada */ }
  };
  try {
    r = await Promise.race([f(link, { signal: ctl.signal }), prazo]);
    if (!r.ok) throw new ErroApi("midia_nao_encontrada", 404);
    const declarado = Number(r.headers.get("content-length"));
    if (Number.isFinite(declarado) && declarado > MAX_MIDIA) throw new ErroApi("midia_grande", 400);
    if (!r.body) throw new ErroApi("midia_nao_encontrada", 404);
    leitor = r.body.getReader();
    const partes = [];
    let total = 0;
    while (true) {
      const item = await Promise.race([leitor.read(), prazo]);
      if (item.done) break;
      const parte = item.value instanceof Uint8Array ? item.value : new Uint8Array(item.value);
      // O teto vale enquanto o corpo chega, inclusive sem Content-Length ou com cabeçalho incorreto.
      if (parte.byteLength > MAX_MIDIA - total) throw new ErroApi("midia_grande", 400);
      if (parte.byteLength) { partes.push(parte.slice()); total += parte.byteLength; }
    }
    if (!total) throw new ErroApi("midia_nao_encontrada", 404);
    const bytes = new Uint8Array(total);
    let offset = 0;
    for (const parte of partes) { bytes.set(parte, offset); offset += parte.byteLength; }
    return bytes;
  } catch (e) {
    cancelar();
    if (e instanceof ErroApi) throw e;
    throw new ErroApi("midia_nao_encontrada", 404);
  } finally {
    clearTimeout(timer);
  }
}

async function acaoMidia(db, ctx, corpo, deps, env) {
  const cliente = String(corpo.cliente);
  const cx = await contextoConversa(db, ctx, cliente, corpo.conversa);
  const path = String(corpo.path ?? "");
  // só arquivo que o próprio cliente subiu para ENVIAR (pasta out/)
  if (!pathDoCliente(path, cliente, "out")) throw new ErroApi("midia_nao_encontrada", 404);
  const tipo = tipoAceito(corpo.mime);
  if (!tipo) throw new ErroApi("midia_tipo", 400);
  // WAV só sai pelo aparelho do CodeWords: a Graph da Meta não aceita (recusa antes de reservar o client_ref)
  const wav = soAparelho(corpo.mime);
  if (wav && cx.canal?.provedor !== "codewords") throw new ErroApi("midia_tipo", 400);
  const reserva = await reservarRef(db, cliente, cx.conversa.id, clientRefDe(corpo));
  if (reserva.resposta) return reserva.resposta;
  const legenda = String(corpo.legenda ?? "").trim().slice(0, 1024) || null;
  const nome = String(corpo.nome ?? "").trim().slice(0, 200) || null;
  const { cred, link, citacao, bytes } = await antesDoCanal(db, cliente, reserva, async () => {
    // o aparelho do CodeWords não tem janela de 24 h (é um WhatsApp comum)
    exigirConversaAberta(cx, { exigeJanela: cx.canal?.provedor !== "codewords" });
    const cred = await credencial(db, cx.canal_id, cliente);
    if (wav && !ehCodeWords(cred)) throw new ErroApi("midia_tipo", 400);   // quem escolhe a rota é a credencial: WAV nunca segue para a Graph
    const st = criarStorage(env, deps.fetch);
    const ass = await st.assinar([path], 3600);
    const link = ass.ok ? ass.urls[path] : null;
    if (!link) throw new ErroApi("midia_nao_encontrada", 404);
    // aparelho: o arquivo vai em bytes (baixado aqui, antes do canal: se falhar, nada saiu) e não há citação
    if (ehCodeWords(cred)) {
      const bytes = await baixarMidia(link, deps.fetch);
      if (bytes.byteLength > tipo.max) throw new ErroApi("midia_grande", 400);
      return { cred, link, citacao: null, bytes };
    }
    const citacao = await citacaoValida(db, cliente, cx.contato?.id, corpo.responde_a);
    return { cred, link, citacao };
  });
  const cw = ehCodeWords(cred);
  const mime = wav ? mimeBase(corpo.mime) : String(corpo.mime).split(";")[0].trim();
  const r = cw
    ? await enviarMidiaCodeWords(cred, destino(cx), { grupo: tipo.grupo, bytes, mime, nome, legenda }, { fetch: deps.fetch, db })
    : await enviarMidiaCanal(cred, destino(cx), { tipo: tipo.grupo, link, legenda, nome }, { respondeA: citacao, fetch: deps.rede });
  const tamanho = Number(corpo.tamanho) > 0 ? Number(corpo.tamanho) : null;
  // com o canal, a saída em dúvida do aparelho ganha o id provisório (igual ao texto)
  return gravarSaida(db, ctx, cliente, cx.conversa.id, {
    tipo: TIPO_MSG[tipo.grupo], corpo: tipo.grupo === "audio" ? null : legenda, responde_a_wamid: citacao,
    midia: { path, mime, nome, ...(tamanho ? { tamanho } : {}), estado: "ok" },
  }, r, cw ? cx.canal_id : null, reserva.ref);
}

async function acaoTemplate(db, ctx, corpo, deps) {
  const cliente = String(corpo.cliente);
  const cx = await contextoConversa(db, ctx, cliente, corpo.conversa);
  if (!UUID.test(String(corpo.template_id ?? ""))) throw new ErroApi("template_invalido", 400);
  const reserva = await reservarRef(db, cliente, cx.conversa.id, clientRefDe(corpo));
  if (reserva.resposta) return reserva.resposta;
  const { tpl, parametros, cred } = await antesDoCanal(db, cliente, reserva, async () => {
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
    return { tpl, parametros, cred };
  });
  const r = await enviarTemplateCanal(cred, destino(cx), { nome: tpl.nome, idioma: tpl.idioma, corpo: tpl.corpo, parametros }, { fetch: deps.rede });
  return gravarSaida(db, ctx, cliente, cx.conversa.id, {
    tipo: "template", corpo: aplicarParametros(tpl.corpo, parametros).slice(0, 4096),
    template: { id: tpl.id, nome: tpl.nome, idioma: tpl.idioma, categoria: tpl.categoria, parametros },
  }, r, null, reserva.ref);
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
  if (ehCodeWords(cred)) throw new ErroApi("use_testar_codewords", 400);
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

/** Compatibilidade da tela antiga: "testar" um canal CodeWords = conferir o aparelho (GET /connections). */
async function acaoTestarCodeWords(db, ctx, corpo, deps) {
  const cliente = String(corpo.cliente), canal = idCanal(corpo.canal);
  const cred = await credencial(db, canal, cliente, { exigirToken: false });
  if (!ehCodeWords(cred)) throw new ErroApi("canal_nao_encontrado", 404);
  if (!cred.codewords_api_key) throw new ErroApi("codewords_sem_credencial", 400);
  const r = await estadoCanalCodeWords(db, cred, { fetch: deps.fetch });
  const ok = !!(r.ok && r.inscrito_certo);
  return respostaPainel({ ...r, ok, status: r.canal?.status || (ok ? "ativo" : "erro"), ...(ok ? {} : { erro: r.motivo || "o aparelho não está pronto" }) });
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
async function enviarItem(db, item, creds, rede, prazo = {}) {
  const concluir = (status, erro, msgId) => db.rpc("nx_fila_concluir", {
    p_id: item.id, p_status: status, p_erro: erro ? limparErro(erro).slice(0, 500) : null, p_mensagem: msgId ?? null,
  });
  try {
    if (!item.conversa_id || !item.conversa) { await concluir("falhou", "item sem conversa"); return "falhou"; }
    if (item.contato?.bloqueado) { await concluir("pulado", "contato bloqueado"); return "pulado"; }
    const para = item.contato?.wa_id || item.contato?.telefone;
    if (!para) { await concluir("falhou", "contato sem telefone"); return "falhou"; }
    let corpoMsg, envio;
    const chave = `${item.cliente_id}:${item.canal_id}`;
    if (!creds.has(chave)) {
      let lida;
      try { lida = await db.rpc("nx_canal_credencial", { p_canal: item.canal_id, p_cliente: item.cliente_id }); }
      catch (e) { lida = { indisponivel: limparErro(e?.message || e) || "credencial indisponível" }; }
      creds.set(chave, lida ?? { indisponivel: "credencial indisponível" });
    }
    const cred = creds.get(chave);
    if (cred.indisponivel !== undefined) {
      // sem a credencial não dá para saber se o número é CodeWords (sem janela de 24 h) ou Meta: nunca "pula por janela"
      if (/canal_nao_encontrado/.test(cred.indisponivel) || Number(item.tentativas) >= 5) {
        await concluir("falhou", "não deu para ler a credencial do número deste envio (nada foi enviado)"); return "falhou";
      }
      await concluir("pendente", null); return "adiado";   // falha passageira do banco: volta para a fila SEM ter saído
    }
    const cw = ehCodeWords(cred);
    if (item.tipo === "texto") {
      // o aparelho do CodeWords não tem janela de 24 h
      if (!cw && !item.janela_aberta) { await concluir("pulado", "fora da janela de 24 h"); return "pulado"; }
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
    if (cw && item.tipo !== "texto") {
      await concluir("falhou", "este número (CodeWords) só envia texto: modelos da Meta não existem nele"); return "falhou";
    }
    if (cw ? (!cred?.codewords_api_key || !cred?.codewords_phone_id) : !cred?.token) {
      const motivo = cw ? "número CodeWords sem chave ou sem aparelho pareado" : "número sem token";
      // a falha também aparece na conversa (mensagem «falhou» com o motivo): antes só o item da fila mudava de status
      // e o atendente não via nada
      const msg = await db.rpc("nx_cv_saida", {
        p_conta: item.origem === "agendada" ? (item.criado_por ?? null) : null,
        p_cliente: item.cliente_id, p_conversa: item.conversa_id,
        p_msg: {
          tipo: item.tipo === "texto" ? "texto" : "template", corpo: corpoMsg, origem: item.origem, status: "falhou", erro: motivo,
          ...(envio ? { template: { id: item.modelo.id, nome: envio.nome, idioma: envio.idioma, categoria: item.modelo.categoria, parametros: envio.parametros } } : {}),
        },
      }).catch(() => null);
      await concluir("falhou", motivo, msg?.id); return "falhou";
    }
    // não começa um envio que não cabe no tempo da função: volta para a fila SEM ter saído
    if (prazo.fim && Date.now() + (cw ? RESERVA_ENVIO_MS.codewords : RESERVA_ENVIO_MS.meta) > prazo.fim) {
      await concluir("pendente", null); return "adiado";
    }
    const r = item.tipo === "texto"
      ? await enviarTextoPeloCanal(cred, para, corpoMsg, { fetch: rede, fetchCru: creds.fetchCru, db })
      : await enviarTemplateCanal(cred, para, envio, { fetch: rede });
    const erro = textoFalha(r);
    const duvida = !r.ok && r.ambigua;
    const msg = await db.rpc("nx_cv_saida", {
      p_conta: item.origem === "agendada" ? (item.criado_por ?? null) : null,
      p_cliente: item.cliente_id, p_conversa: item.conversa_id,
      p_msg: {
        tipo: item.tipo === "texto" ? "texto" : "template", corpo: corpoMsg, origem: item.origem,
        ...(envio ? { template: { id: item.modelo.id, nome: envio.nome, idioma: envio.idioma, categoria: item.modelo.categoria, parametros: envio.parametros } } : {}),
        wamid: r.wamid || (duvida && cw ? wamidProvisorio(item.canal_id) : null),
        status: r.ok ? "enviada" : duvida ? "pendente" : "falhou", erro,
      },
    }).catch(() => null);
    // envio em dúvida (timeout/5xx do CodeWords) NUNCA volta para a fila: pode ter saído
    await concluir(r.ok ? "enviado" : "falhou", duvida ? `${erro} (não reenviado automaticamente)` : erro, msg?.id);
    return r.ok ? "enviado" : "falhou";
  } catch (e) {
    try { await concluir("falhou", e?.message || e); } catch { /* o item volta pela faxina da fila (F7) */ }
    return "falhou";
  }
}

/** nx_fila_pegar com um lote no cabeçalho x-fila-lote (o PostgREST o entrega à função em request.headers).
    Se a chamada FALHAR (prazo no cliente, rede), o banco pode já ter marcado os itens como 'enviando' sem que este
    processo os tenha recebido: nenhum foi enviado, então o lote é DEVOLVIDO à fila (nx_fila_devolver_lote) — antes eles
    ficavam órfãos e, 10 min depois, viravam «STATUS INCERTO» sem nunca terem saído. Se o banco ainda estava
    gravando quando a devolução rodou, repete uma vez depois de uma pausa. Nunca lança por causa da devolução. */
export async function pegarLote(db, lista, ctx = {}) {
  const lote = globalThis.crypto.randomUUID();
  const params = lista ? { p_limite: lista.length, p_ids: lista } : { p_limite: 20 };
  try {
    return await db.rpc("nx_fila_pegar", params, { headers: { "x-fila-lote": lote } });
  } catch (e) {
    const devolver = () => db.rpc("nx_fila_devolver_lote", { p_lote: lote }).catch(() => null);
    try {
      const n = Number(await devolver()) || 0;
      if (!n) {
        const pausa = ctx.esperaDevolverMs ?? 4000;
        if (pausa > 0) await new Promise(r => setTimeout(r, pausa));
        await devolver();
      }
    } catch { /* a faxina da fila trata o que sobrar */ }
    throw e;
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
  const res = { total: 0, enviado: 0, pulado: 0, falhou: 0 };
  const creds = new Map();
  creds.fetchCru = fetchCru;   // o CodeWords usa o próprio prazo (60 s)
  const inicio = Date.now();
  const prazo = { fim: inicio + (ctx.limiteMs ?? FILA_LIMITE_MS) };
  const lista = Array.isArray(ids) ? ids.map(Number).filter(n => Number.isSafeInteger(n) && n > 0).slice(0, 100) : null;
  if (lista && !lista.length) return res;
  for (;;) {
    const lote = await pegarLote(db, lista, ctx);
    if (!Array.isArray(lote) || !lote.length) break;
    for (const item of lote) {
      const r = await enviarItem(db, item, creds, rede, prazo);
      if (r === "adiado") { res.adiado = (res.adiado || 0) + 1; continue; }
      res[r]++; res.total++;
    }
    if (res.adiado) break;
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
  // corpo antes do banco: teto de 64 KiB (resto drenado, 413 sem tocar no banco); ilegível → {}
  const corpo = await lerCorpo(req, undefined, deps.drenagem);
  const cfg = await autenticarCron(req, db);   // 401 sem o cron_token
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
 * @param {{fetch?: Function, agora?: Date|Function, prazoRede?: number, emSegundoPlano?: (p: Promise<unknown>) => void,
 *          drenagem?: {prazoMs?: number, teto?: number}}} [deps]
 */
export function tratar(req, env, deps = {}) {
  // 405 responde sem ler: o corpo é drenado antes da resposta (senão o runtime espera o envio)
  return soltandoCorpo(req, () => tratarEnviar(req, env, deps), deps.drenagem);
}

async function tratarEnviar(req, env, deps) {
  const f = deps.fetch || globalThis.fetch;
  if (req.method === "POST" && req.headers.get("x-nx-cron") != null) {
    try { return await modoCron(req, env, deps, f); }
    catch (e) {
      if (e instanceof ErroHttp) return json({ ok: false, erro: e.message }, e.status);
      return json({ ok: false, erro: limparErro(e?.message || e) }, 500);
    }
  }
  return tratarPainel(req, async () => {
    const corpo = await lerCorpoPainel(req, undefined, deps.drenagem);
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
  }, deps.drenagem);
}
