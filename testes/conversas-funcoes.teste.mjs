/* ============================================================
   ÓRBITA — testes das Edge Functions do SaaS (Node 24, sem dependências)
   Uso: node --test testes/conversas-funcoes.teste.mjs
   nx-whatsapp ampliada, nx-enviar, nx-midia, nx-ia (ESPEC §5.5, §6, §8.4 F2).
   O fetch é falso: PostgREST em memória (testes/apoio/postgrest-falso.mjs)
   com as internas de 20260928f_funcoes.sql reimplementadas EM JS aplicando as
   mesmas regras de isolamento (cliente + visibilidade), Graph API, Storage e
   Anthropic falsos. As regras reais do banco são testadas em
   supabase/testes/05_funcoes.sql; aqui se prova o que a FUNÇÃO faz: quais
   internas chama, com que parâmetros, e que nada sai para a rede antes de o
   id ser conferido.
   ============================================================ */
import { test } from "node:test";
import assert from "node:assert/strict";
import { createHmac } from "node:crypto";
import { execFileSync } from "node:child_process";
import { readFileSync, readdirSync, statSync, existsSync } from "node:fs";
import { dirname, join, resolve } from "node:path";
import { fileURLToPath, pathToFileURL } from "node:url";

import { criarBanco, erroPg, jsonResp, arvore } from "./apoio/postgrest-falso.mjs";
import { tratar as webhook } from "../supabase/functions/_compartilhado/webhook.js";
import { tratar as enviar, enviarFila } from "../supabase/functions/_compartilhado/enviar.js";
import { tratarAgente } from "../supabase/functions/_compartilhado/codewords.js";
import { tratar as midia, tipoAceito, pathDoCliente, soAparelho, tipoGraph, extensaoDe } from "../supabase/functions/_compartilhado/midia.js";
import { tratar as nxIa, montarPrompt } from "../supabase/functions/_compartilhado/ia_conversas.js";
import { normalizarMensagem, TEXTO_NAO_SUPORTADA } from "../supabase/functions/_compartilhado/conversas.js";
import { carregarModelo, filtroFunisAds, codigoBanco, CORS } from "../supabase/functions/_compartilhado/comum.js";
import { textoFalhaCanal, aplicarParametros, parametrosDoCorpo } from "../supabase/functions/_compartilhado/whatsapp.js";
import { criarDb } from "../supabase/functions/_compartilhado/db.js";
import { datasetDeLinhas, montar } from "../web/nucleo.js";
import { montarPayload, assinar as assinarSim, simular, lerArgs } from "../scripts/simular-webhook.mjs";

const RAIZ = resolve(dirname(fileURLToPath(import.meta.url)), "..");
const SUPA = "https://fake.supabase.co";
const ENV = { url: SUPA, chave: "eyJ.service-role.fake" };
const FN = `${SUPA}/functions/v1`;
const AGORA = new Date("2026-09-28T15:00:00Z");   // 12:00 em São Paulo
const HORA = 3600e3;

const CLI_A = "11111111-1111-4111-8111-111111111111";
const CLI_B = "22222222-2222-4222-8222-222222222222";
const K_A1 = "a1a1a1a1-0000-4000-8000-000000000001";   // 1º número do A (app secret próprio)
const K_A2 = "a2a2a2a2-0000-4000-8000-000000000002";   // 2º número do A (app da Nexus, sem app secret)
const K_B = "b0b0b0b0-0000-4000-8000-000000000003";    // número do B (token vencido)
const DEP_A = "d0d0d0d0-0000-4000-8000-00000000000a", DEP_A2 = "d0d0d0d0-0000-4000-8000-00000000000b";
const ADM_A = "c0c0c0c0-0000-4000-8000-0000000000a1", AT_A = "c0c0c0c0-0000-4000-8000-0000000000a2";
const LE_A = "c0c0c0c0-0000-4000-8000-0000000000a3", ADM_B = "c0c0c0c0-0000-4000-8000-0000000000b1";
const FUNIL_ADS = "f0f0f0f0-0000-4000-8000-000000000001", FUNIL_POS = "f0f0f0f0-0000-4000-8000-000000000002";
const NEXUS_PID = "900900";

/* ------------------------------------------------------------
   Esquema do banco falso (só o que as funções leem por REST)
   ------------------------------------------------------------ */
const COLUNAS = {
  nx_config: "id cron_token codigo_gestor funcoes_url painel_url wa_access_token wa_phone_number_id wa_template wa_verify_token meta_app_secret anthropic_api_key modelo_ia google_api_versao",
  nx_clientes: "id slug nome ativo cfg wa_phone_number_id criado_em modulos vertical",
  nx_contatos: "id cliente_id nome telefone wa_id bloqueado origem plataforma campanha_ext anuncio_ext ctwa_clid",
  nx_metricas_dia: "cliente_id plataforma nivel data campanha_ext anuncio_ext campanha_nome anuncio_nome impressoes alcance frequencia cliques gasto conversoes valor_conversao atualizado_em",
  nx_leads: "id cliente_id telefone nome origem plataforma campanha_ext anuncio_ext ctwa_clid servico etapa data_conversa data_agenda data_consulta valor obs criado_em atualizado_em funil_id contato_id",
  nx_funis: "id cliente_id nome ordem padrao conta_no_ads ativo criado_em",
  nx_mensagens: "id cliente_id conversa_id contato_id canal_id direcao tipo corpo midia wamid responde_a_wamid reacao status erro enviado_por origem template referral criado_em atualizado_em client_ref",
  nx_alertas: "id cliente_id chave regra severidade mensagem acao valor referencia criado_em enviado_em erro_envio wa_ids wa_ids_template entregue_em",
  nx_relatorios: "id cliente_id tipo referencia texto leitura_ia destinos enviado_em erro wa_ids wa_ids_template entregue_em",
  nx_travas: "nome ate dono",
};
for (const k in COLUNAS) COLUNAS[k] = new Set(COLUNAS[k].split(" "));
const ESQUEMA = {
  colunas: COLUNAS,
  unicas: { nx_travas: ["nome"] },
  padroes: { nx_alertas: { wa_ids: [], wa_ids_template: [] }, nx_relatorios: { wa_ids: [], wa_ids_template: [] } },
  checks: {}, naoNulos: {},
};

const RANK = { leitura: 0, atendente: 1, supervisor: 2, admin: 3, gestor: 4, super: 5 };
const soDig = v => String(v ?? "").replace(/\D/g, "");
/** mesma chave do nx_tel_chave (55 + DDD + 9 + 8 = 55 + DDD + 8). */
function chaveTel(t) {
  const d = soDig(t);
  if (d.length >= 12 && d.length <= 13 && d.startsWith("55")) {
    const s = d.slice(2);
    return s.length === 11 && s[2] === "9" ? s.slice(0, 2) + s.slice(3) : s;
  }
  return d;
}
const TIPOS_IN = new Set(["texto", "imagem", "audio", "video", "documento", "sticker", "localizacao", "contato", "interativo", "desconhecido"]);
const TIPOS_OUT = new Set(["texto", "imagem", "audio", "video", "documento", "sticker", "localizacao", "contato", "interativo", "template"]);

/**
 * Internas de 20260928f_funcoes.sql em JS (mesmos nomes de parâmetros: o PostgREST falso
 * responde 404 se a Edge Function mandar um nome diferente — o contrato é conferido).
 */
function rpcsSaaS(api) {
  const { tab, relogio, novoId } = api;
  const iso = () => relogio().toISOString();
  const cliente = id => tab("nx_clientes").find(c => c.id === id);
  const canal = id => tab("nx_canais").find(k => k.id === id);
  const conta = id => tab("nx_contas").find(k => k.id === id);
  const conversa = id => tab("nx_conversas").find(c => c.id === Number(id));
  const janela = cv => !!cv?.ultima_entrada_em && relogio().getTime() - Date.parse(cv.ultima_entrada_em) < 24 * HORA;
  const e = (codigo, o) => erroPg(codigo, o);

  function ctxDe(token, cli, min = "atendente") {
    const s = tab("nx_sessoes").find(x => x.token === token);
    if (!s) throw e("sessao_invalida", { errcode: "42501" });
    if (!cliente(cli)) throw e("cliente_nao_encontrado");
    const a = tab("nx_acessos").find(x => x.conta_id === s.conta_id && x.cliente_id === cli);
    if (!a) throw e("sem_acesso", { errcode: "42501" });
    if (RANK[a.papel] < RANK[min || "atendente"]) throw e("sem_permissao", { errcode: "42501" });
    return { conta_id: s.conta_id, org_id: "ORG-NEXUS", nome: conta(s.conta_id).nome, papel: a.papel, super: false,
             departamentos: a.departamentos || [], ver_todas: a.ver_todas ?? true };
  }
  // regra nx_cv_visivel (o ctx precisa ser DESTE cliente: papel/departamentos/ver_todas batem com o acesso)
  function visivel(ctx, cli, cvId) {
    const cv = conversa(cvId);
    if (!cv || cv.cliente_id !== cli || !ctx?.conta_id) return false;
    const a = tab("nx_acessos").find(x => x.conta_id === ctx.conta_id && x.cliente_id === cli);
    if (!a || a.papel !== ctx.papel || JSON.stringify(a.departamentos || []) !== JSON.stringify(ctx.departamentos || [])
        || (a.ver_todas ?? true) !== (ctx.ver_todas ?? true)) return false;
    const r = RANK[ctx.papel];
    if (cv.oculta && r < 2) return false;
    if (r >= 3) return true;
    if (cv.atribuida_a && cv.atribuida_a === ctx.conta_id) return true;
    const dep = !(ctx.departamentos || []).length || !cv.departamento_id || ctx.departamentos.includes(cv.departamento_id);
    if (!dep) return false;
    if (r === 2) return true;
    return !cv.atribuida_a || !!ctx.ver_todas;
  }
  const exigirModulo = (cli, mod) => {
    if (!cliente(cli)) throw e("cliente_nao_encontrado");
    if (!(cliente(cli).modulos || []).includes(mod)) throw e("modulo_desligado", { errcode: "42501", hint: mod });
  };
  const msgJson = m => ({
    id: m.id, conversa_id: m.conversa_id, direcao: m.direcao, tipo: m.tipo, corpo: m.corpo, midia: m.midia ?? null,
    status: m.status, erro: m.erro ?? null, enviado_por: m.enviado_por ? { id: m.enviado_por, nome: conta(m.enviado_por)?.nome } : null,
    origem: m.origem ?? null, responde_a: null, reacao: m.reacao ?? null, template: m.template ?? null, referral: m.referral ?? null,
    criado_em: m.criado_em, atualizado_em: m.atualizado_em,
  });
  const novaMsg = obj => {
    const m = { id: novoId(), criado_em: iso(), atualizado_em: iso(), midia: null, wamid: null, erro: null, reacao: null, origem: null,
                template: null, referral: null, enviado_por: null, responde_a_wamid: null, ...obj };
    tab("nx_mensagens").push(m);
    return m;
  };
  const novaConversa = obj => {
    const cv = { id: novoId(), protocolo: `2026-${String(novoId()).padStart(6, "0")}`, status: "aberta", aguardando: true, oculta: false,
                 nao_lidas: 0, atribuida_a: null, negocio_id: null, ultima_entrada_em: iso(), primeira_resposta_em: null, ...obj };
    tab("nx_conversas").push(cv);
    return cv;
  };

  return {
    nx_fn_ctx: { args: ["p_token", "p_cliente"], opcionais: ["p_min"], fn: ({ p_token, p_cliente, p_min }) => ctxDe(p_token, p_cliente, p_min) },
    nx_exigir_modulo: { args: ["p_cliente", "p_modulo"], fn: ({ p_cliente, p_modulo }) => { exigirModulo(p_cliente, p_modulo); return null; } },

    nx_wa_canal: { args: [], opcionais: ["p_phone_number_id", "p_chave"], fn({ p_phone_number_id, p_chave }) {
      const k = p_chave ? tab("nx_canais").find(x => x.chave_publica === p_chave)
        : p_phone_number_id ? tab("nx_canais").find(x => x.phone_number_id === p_phone_number_id) : null;
      if (!k) return null;
      return { canal_id: k.id, cliente_id: k.cliente_id, cliente_slug: cliente(k.cliente_id)?.slug, phone_number_id: k.phone_number_id,
               waba_id: k.waba_id, verify_token: k.verify_token, app_secret: k.app_secret ?? null, tem_token: !!k.token, status: k.status };
    } },
    nx_canal_credencial: { args: ["p_canal", "p_cliente"], fn({ p_canal, p_cliente }) {
      const k = canal(p_canal);
      if (!k || k.cliente_id !== p_cliente) throw e("canal_nao_encontrado");
      return { canal_id: k.id, cliente_id: k.cliente_id, nome: k.nome, phone_number_id: k.phone_number_id, waba_id: k.waba_id,
               provedor: k.provedor || "meta", codewords_service_id: k.codewords_service_id ?? null,
               codewords_phone_id: k.codewords_phone_id ?? null, codewords_numero: k.codewords_numero ?? null,
               codewords_numero_conferido: k.codewords_numero_conferido ?? null, codewords_conferido_em: k.codewords_conferido_em ?? null,
               codewords_api_key: k.codewords_api_key ?? null, token: k.token ?? null, app_secret: k.app_secret ?? null };
    } },
    nx_canal_verificado: { args: ["p_canal", "p_cliente", "p_ok", "p_numero", "p_qualidade", "p_inscrito", "p_erro"],
      fn({ p_canal, p_cliente, p_ok, p_numero, p_qualidade, p_inscrito, p_erro }) {
        const k = canal(p_canal);
        if (!k || k.cliente_id !== p_cliente) throw e("canal_nao_encontrado");
        Object.assign(k, {
          numero_exibicao: p_numero || k.numero_exibicao, qualidade: p_ok ? p_qualidade : k.qualidade,
          app_inscrito: p_ok ? p_inscrito : k.app_inscrito, verificado_em: iso(),
          ultimo_erro: p_ok && p_inscrito ? null : (p_erro || "falhou"),
          status: p_ok && p_inscrito ? "ativo" : p_ok ? "pendente" : "erro",
        });
        return { id: k.id, status: k.status, app_inscrito: k.app_inscrito, ultimo_erro: k.ultimo_erro };
      } },

    nx_wa_entrada: { args: ["p_canal", "p_msg"], fn({ p_canal, p_msg }) {
      const k = canal(p_canal);
      if (!k) throw e("canal_nao_encontrado");
      const cli = k.cliente_id, wa = soDig(p_msg.wa_id).slice(0, 20);
      if (wa.length < 8 || wa.length > 15) throw e("dados_invalidos", { hint: "wa_id" });
      const base = { nova_conversa: false, duplicada: false, bloqueado: false, optout: false, midia_pendente: false, fila_id: null };
      if (p_msg.wamid && !p_msg.reacao) {
        const ex = tab("nx_mensagens").find(m => m.wamid === p_msg.wamid);
        if (ex) return { ...base, duplicada: true, mensagem_id: ex.cliente_id === cli ? ex.id : null,
          conversa_id: ex.cliente_id === cli ? ex.conversa_id : null, contato_id: ex.cliente_id === cli ? ex.contato_id : null };
      }
      const ref = p_msg.referral && typeof p_msg.referral === "object" ? p_msg.referral : null;
      const ad = ref?.source_type === "ad";
      let ct = tab("nx_contatos").find(c => c.cliente_id === cli && c.wa_id === wa)
        || tab("nx_contatos").find(c => c.cliente_id === cli && chaveTel(c.telefone) === chaveTel(wa));
      if (!ct) {
        ct = { id: novoId(), cliente_id: cli, nome: p_msg.nome ? String(p_msg.nome).slice(0, 160) : null, telefone: wa, wa_id: wa,
               origem: ad ? "anuncio" : "whatsapp", plataforma: ad ? "meta" : null, anuncio_ext: ad ? String(ref.source_id ?? "").slice(0, 100) : null,
               bloqueado: false, optin_marketing: null };
        tab("nx_contatos").push(ct);
      } else { ct.wa_id = wa; ct.nome ??= p_msg.nome ? String(p_msg.nome).slice(0, 160) : null; }
      if (p_msg.reacao) {
        const alvo = tab("nx_mensagens").find(m => m.wamid === p_msg.reacao.wamid && m.cliente_id === cli && m.contato_id === ct.id);
        if (alvo) alvo.reacao = p_msg.reacao.emoji || null;
        return { ...base, mensagem_id: alvo?.id ?? null, conversa_id: alvo?.conversa_id ?? null, contato_id: ct.id, reacao: true };
      }
      const tipo = TIPOS_IN.has(p_msg.tipo) ? p_msg.tipo : "desconhecido";
      const corpo = p_msg.corpo == null ? null : String(p_msg.corpo).slice(0, 4096);
      let midiaJ = null, pend = false;
      if (["imagem", "audio", "video", "documento", "sticker"].includes(tipo) && p_msg.midia) {
        pend = !!p_msg.midia.media_id && !!k.token && !ct.bloqueado;
        midiaJ = { media_id: p_msg.midia.media_id, mime: p_msg.midia.mime, nome: p_msg.midia.nome ? String(p_msg.midia.nome).slice(0, 200) : undefined,
                   estado: pend ? "baixando" : "indisponivel" };
      }
      if (ct.bloqueado) {
        let cv = tab("nx_conversas").filter(c => c.cliente_id === cli && c.contato_id === ct.id && c.canal_id === p_canal).sort((a, b) => b.id - a.id)[0];
        cv ||= novaConversa({ cliente_id: cli, canal_id: p_canal, contato_id: ct.id, departamento_id: k.departamento_id, status: "resolvida", oculta: true, aguardando: false });
        const m = novaMsg({ cliente_id: cli, conversa_id: cv.id, contato_id: ct.id, canal_id: p_canal, direcao: "in", tipo, corpo, midia: midiaJ, wamid: p_msg.wamid, status: "recebida", referral: ref });
        return { ...base, bloqueado: true, mensagem_id: m.id, conversa_id: cv.id, contato_id: ct.id };
      }
      let cv = tab("nx_conversas").find(c => c.cliente_id === cli && c.canal_id === p_canal && c.contato_id === ct.id && c.status !== "resolvida");
      let nova = false;
      if (!cv) {
        cv = novaConversa({ cliente_id: cli, canal_id: p_canal, contato_id: ct.id, departamento_id: k.departamento_id ?? null });
        nova = true;
      }
      const m = novaMsg({ cliente_id: cli, conversa_id: cv.id, contato_id: ct.id, canal_id: p_canal, direcao: "in", tipo, corpo, midia: midiaJ,
                          wamid: p_msg.wamid, responde_a_wamid: p_msg.responde_a_wamid ?? null, status: "recebida", referral: ref });
      Object.assign(cv, { ultima_entrada_em: iso(), aguardando: true, nao_lidas: cv.nao_lidas + 1, status: cv.status === "pendente" ? "aberta" : cv.status });
      let optout = false, fila = null;
      const norm = String(corpo ?? "").normalize("NFD").replace(/[̀-ͯ]/g, "").toLowerCase().replace(/[^a-z]/g, "");
      if (tipo === "texto" && String(corpo ?? "").trim().length <= 20 && ["sair", "parar", "pare", "stop", "cancelar", "descadastrar"].includes(norm)) {
        optout = true;
        ct.optin_marketing = false;
      }
      if (nova && k.fora_horario) {
        fila = { id: novoId(), cliente_id: cli, conversa_id: cv.id, contato_id: ct.id, canal_id: p_canal, tipo: "texto", texto: k.fora_horario,
                 template: null, origem: "fora_horario", status: "pendente", enviar_em: iso(), tentativas: 0, criado_por: null };
        tab("nx_envios_fila").push(fila);
      }
      return { ...base, mensagem_id: m.id, conversa_id: cv.id, contato_id: ct.id, nova_conversa: nova, optout, midia_pendente: pend, fila_id: fila?.id ?? null };
    } },

    nx_wa_status: { args: ["p_canal", "p_statuses"], fn({ p_canal, p_statuses }) {
      const k = canal(p_canal);
      if (!k) throw e("canal_nao_encontrado");
      const r = { atualizados: 0, falhas: 0, ignorados: 0 };
      const rank = { pendente: 0, enviada: 1, falhou: 1, entregue: 2, lida: 3 };
      for (const s of p_statuses || []) {
        const novo = { sent: "enviada", delivered: "entregue", read: "lida", failed: "falhou" }[s.status];
        const m = novo && s.id ? tab("nx_mensagens").find(x => x.wamid === s.id && x.canal_id === p_canal && x.cliente_id === k.cliente_id && x.direcao === "out") : null;
        if (!m) { r.ignorados++; continue; }
        if (novo === "falhou") {
          if (["entregue", "lida", "falhou"].includes(m.status)) { r.ignorados++; continue; }
          Object.assign(m, { status: "falhou", erro: s.erro_texto || `WhatsApp não entregou (código ${s.errors?.[0]?.code ?? "?"})` });
          r.falhas++;
        } else if (rank[novo] > (rank[m.status] ?? 9)) { m.status = novo; if (novo !== "enviada") m.erro = null; r.atualizados++; }
        else r.ignorados++;
      }
      return r;
    } },
    nx_wa_midia_ok: { args: ["p_mensagem", "p_cliente", "p_path", "p_tamanho"], opcionais: ["p_erro"],
      fn({ p_mensagem, p_cliente, p_path, p_tamanho, p_erro = null }) {
        const ok = !String(p_erro ?? "").trim();
        if (ok && (!p_path || !String(p_path).startsWith(`${p_cliente}/`) || String(p_path).includes(".."))) throw e("dados_invalidos", { hint: "path" });
        const m = tab("nx_mensagens").find(x => x.id === p_mensagem && x.cliente_id === p_cliente);
        if (!m) throw e("mensagem_nao_encontrada");
        m.midia = { ...(m.midia || {}), ...(ok ? { estado: "ok", path: p_path, tamanho: p_tamanho } : { estado: "falhou", erro: p_erro }) };
        return { ok: true, estado: m.midia.estado };
      } },

    nx_cv_saida: { args: ["p_conta", "p_cliente", "p_conversa", "p_msg"], fn({ p_conta, p_cliente, p_conversa, p_msg }) {
      const cv = conversa(p_conversa);
      if (!cv || cv.cliente_id !== p_cliente) throw e("conversa_nao_encontrada");
      const tipo = p_msg.tipo || "texto", status = p_msg.status || "enviada";
      if (!TIPOS_OUT.has(tipo)) throw e("dados_invalidos", { hint: "tipo" });
      if (p_msg.wamid) {
        const ex = tab("nx_mensagens").find(x => x.wamid === p_msg.wamid);
        if (ex) { if (ex.cliente_id !== p_cliente) throw e("dados_invalidos", { hint: "wamid" }); return msgJson(ex); }
      }
      const m = novaMsg({ cliente_id: p_cliente, conversa_id: cv.id, contato_id: cv.contato_id, canal_id: cv.canal_id, direcao: "out", tipo,
                          corpo: p_msg.corpo == null ? null : String(p_msg.corpo).slice(0, 4096), midia: p_msg.midia ?? null, wamid: p_msg.wamid || null,
                          responde_a_wamid: p_msg.responde_a_wamid || null, status, erro: p_msg.erro ?? null, enviado_por: p_conta,
                          origem: p_msg.origem === "lista" ? "automacao" : (p_msg.origem || (p_conta ? "painel" : null)), template: p_msg.template ?? null });
      if (p_conta && status !== "falhou") { cv.aguardando = false; cv.primeira_resposta_em ??= iso(); }
      return msgJson(m);
    } },
    // M36 (20261002d): o mesmo client_ref devolve a saída já gravada; marcar só vale uma vez e só em saída ('out').
    // As regras de verdade (SQL) são provadas em supabase/testes/15_conversas_client_ref_onboarding.sql.
    nx_cv_ref_ver: { args: ["p_cliente", "p_conversa", "p_ref"], fn({ p_cliente, p_conversa, p_ref }) {
      if (!/^[A-Za-z0-9:_.-]{8,80}$/.test(String(p_ref ?? ""))) throw e("dados_invalidos", { hint: "client_ref" });
      const m = tab("nx_mensagens").find(x => x.cliente_id === p_cliente && x.client_ref === p_ref);
      if (!m) return null;
      if (m.conversa_id !== Number(p_conversa)) throw e("dados_invalidos", { hint: "client_ref" });
      return msgJson(m);
    } },
    nx_cv_ref_marcar: { args: ["p_cliente", "p_mensagem", "p_ref"], fn({ p_cliente, p_mensagem, p_ref }) {
      if (!/^[A-Za-z0-9:_.-]{8,80}$/.test(String(p_ref ?? ""))) throw e("dados_invalidos", { hint: "client_ref" });
      const m = tab("nx_mensagens").find(x => x.id === p_mensagem && x.cliente_id === p_cliente && x.direcao === "out");
      // a reserva passa a apontar a saída (mesma conversa), mesmo quando a mensagem não pôde levar o ref
      const res = tab("nx_envio_refs").find(x => x.cliente_id === p_cliente && x.client_ref === p_ref && x.mensagem_id == null);
      if (res && m && m.conversa_id === res.conversa_id) res.mensagem_id = m.id;
      if (!m || m.client_ref) return false;
      if (tab("nx_mensagens").some(x => x.cliente_id === p_cliente && x.client_ref === p_ref)) return false;   // índice único parcial
      m.client_ref = p_ref;
      return true;
    } },
    // reserva ANTES do envio (nx_envio_refs): novo | gravada (+ mensagem) | em_andamento (< 150 s) | antiga
    nx_cv_ref_reservar: { args: ["p_cliente", "p_conversa", "p_ref"], fn({ p_cliente, p_conversa, p_ref }) {
      if (!/^[A-Za-z0-9:_.-]{8,80}$/.test(String(p_ref ?? ""))) throw e("dados_invalidos", { hint: "client_ref" });
      const m = tab("nx_mensagens").find(x => x.cliente_id === p_cliente && x.client_ref === p_ref);
      if (m) {
        if (m.conversa_id !== Number(p_conversa)) throw e("dados_invalidos", { hint: "client_ref" });
        return { estado: "gravada", mensagem: msgJson(m) };
      }
      const res = tab("nx_envio_refs").find(x => x.cliente_id === p_cliente && x.client_ref === p_ref);
      if (!res) {
        tab("nx_envio_refs").push({ cliente_id: p_cliente, client_ref: p_ref, conversa_id: Number(p_conversa), mensagem_id: null, criado_em: iso() });
        return { estado: "novo" };
      }
      if (res.conversa_id !== Number(p_conversa)) throw e("dados_invalidos", { hint: "client_ref" });
      if (res.mensagem_id != null) {
        const g = tab("nx_mensagens").find(x => x.id === res.mensagem_id && x.cliente_id === p_cliente);
        return g ? { estado: "gravada", mensagem: msgJson(g) } : { estado: "antiga" };
      }
      return relogio().getTime() - Date.parse(res.criado_em) < 150e3 ? { estado: "em_andamento" } : { estado: "antiga" };
    } },
    nx_cv_ref_liberar: { args: ["p_cliente", "p_ref"], fn({ p_cliente, p_ref }) {
      if (!/^[A-Za-z0-9:_.-]{8,80}$/.test(String(p_ref ?? ""))) throw e("dados_invalidos", { hint: "client_ref" });
      const lista = tab("nx_envio_refs"), i = lista.findIndex(x => x.cliente_id === p_cliente && x.client_ref === p_ref && x.mensagem_id == null);
      if (i < 0) return false;
      lista.splice(i, 1);
      return true;
    } },
    nx_cv_ia_pausa_auto: { args: ["p_cliente", "p_conversa", "p_por", "p_conta"], fn({ p_cliente, p_conversa }) {
      const cv = conversa(p_conversa);
      if (!cv || cv.cliente_id !== p_cliente) throw e("conversa_nao_encontrada");
      cv.ia_pausada = true;
      return { ok: true };
    } },
    nx_codewords_canal: { args: ["p_chave"], fn: ({ p_chave }) => {
      const k = tab("nx_canais").find(x => x.provedor === "codewords" && x.segredo_teste === p_chave);
      return k ? { canal_id: k.id, cliente_id: k.cliente_id, numero: k.codewords_numero, rota: "fluxo", ia_ligada: true, excedido: false } : null;
    } },
    // recibo do aparelho: acha a saída pelo id do provedor (wamid cw:<canal>:<id>) e só avança (enviada → entregue → lida)
    nx_codewords_status: { args: ["p_canal", "p_id", "p_status", "p_erro"], fn({ p_canal, p_id, p_status }) {
      const m = tab("nx_mensagens").find(x => x.wamid === `cw:${p_canal}:${p_id}`);
      if (!m) return { ok: true, pendente: true };
      const ordem = ["pendente", "enviada", "entregue", "lida"], novo = { sent: "enviada", delivered: "entregue", read: "lida" }[p_status];
      if (novo && ordem.indexOf(novo) > ordem.indexOf(m.status)) m.status = novo;
      return { ok: true, pendente: false };
    } },
    nx_cv_contexto_envio: { args: ["p_ctx", "p_cliente", "p_conversa"], fn({ p_ctx, p_cliente, p_conversa }) {
      if (!visivel(p_ctx, p_cliente, p_conversa)) throw e("conversa_nao_encontrada");
      exigirModulo(p_cliente, "conversas");
      const cv = conversa(p_conversa), ct = tab("nx_contatos").find(c => c.id === cv.contato_id), k = canal(cv.canal_id);
      const ultimoIn = tab("nx_mensagens").filter(m => m.conversa_id === cv.id && m.direcao === "in" && m.wamid).sort((a, b) => b.id - a.id)[0];
      return {
        conversa: { id: cv.id, status: cv.status, canal_id: cv.canal_id, contato_id: cv.contato_id, protocolo: cv.protocolo, ultima_entrada_em: cv.ultima_entrada_em },
        contato: { id: ct.id, wa_id: ct.wa_id, telefone: ct.telefone, nome: ct.nome, optin_marketing: ct.optin_marketing, bloqueado: ct.bloqueado },
        canal_id: cv.canal_id, canal: k ? { id: k.id, nome: k.nome, status: k.status, tem_token: !!k.token, provedor: k.provedor || "meta" } : null,
        janela_aberta: janela(cv), ultimo_wamid_in: ultimoIn?.wamid ?? null,
        cfg_cv: { recibo_leitura: true, assinatura: false, ...(cliente(p_cliente).cfg?.cv || {}) },
        atendente_nome: conta(p_ctx.conta_id)?.nome, empresa: cliente(p_cliente).nome,
      };
    } },
    nx_cv_msg_reenvio: { args: ["p_ctx", "p_cliente", "p_mensagem"], fn({ p_ctx, p_cliente, p_mensagem }) {
      const m = tab("nx_mensagens").find(x => x.id === p_mensagem && x.cliente_id === p_cliente && x.direcao === "out" && x.tipo === "texto" && x.status === "falhou");
      if (!m || !visivel(p_ctx, p_cliente, m.conversa_id)) throw e("mensagem_nao_encontrada");
      return { conversa_id: m.conversa_id, corpo: m.corpo, responde_a_wamid: m.responde_a_wamid };
    } },

    nx_fila_pegar: { args: [], opcionais: ["p_limite", "p_ids"], fn({ p_limite = 20, p_ids = null }) {
      const lim = Math.max(1, Math.min(p_limite ?? 20, 100));
      const itens = tab("nx_envios_fila")
        .filter(f => f.status === "pendente" && (p_ids ? p_ids.includes(f.id) : Date.parse(f.enviar_em) <= relogio().getTime()))
        .sort((a, b) => a.id - b.id).slice(0, lim);
      return itens.map(f => {
        Object.assign(f, { status: "enviando", tentativas: f.tentativas + 1 });
        const cv = conversa(f.conversa_id);
        const ct = tab("nx_contatos").find(c => c.id === (f.contato_id ?? cv?.contato_id) && c.cliente_id === f.cliente_id);
        const canalId = f.canal_id ?? cv?.canal_id;
        const modelo = f.tipo === "template"
          ? tab("nx_templates").find(t => t.cliente_id === f.cliente_id && t.canal_id === canalId && t.nome === f.template?.nome) : null;
        return { ...f, canal_id: canalId, conversa: cv ? { id: cv.id, status: cv.status, ultima_entrada_em: cv.ultima_entrada_em } : null,
                 janela_aberta: janela(cv), contato: ct ? { id: ct.id, wa_id: ct.wa_id, telefone: ct.telefone, nome: ct.nome, optin_marketing: ct.optin_marketing, bloqueado: ct.bloqueado } : null,
                 modelo: modelo ? { id: modelo.id, nome: modelo.nome, idioma: modelo.idioma, categoria: modelo.categoria, status: modelo.status, corpo: modelo.corpo, num_parametros: modelo.num_parametros } : null };
      });
    } },
    nx_fila_concluir: { args: ["p_id", "p_status", "p_erro", "p_mensagem"], fn({ p_id, p_status, p_erro, p_mensagem }) {
      if (!["enviado", "falhou", "pulado", "cancelado", "pendente"].includes(p_status)) throw e("dados_invalidos", { hint: "status" });
      const f = tab("nx_envios_fila").find(x => x.id === p_id);
      if (f) Object.assign(f, { status: p_status, erro: p_erro, mensagem_id: p_mensagem ?? f.mensagem_id ?? null, processado_em: iso() });
      return { ok: !!f };
    } },

    nx_templates_gravar: { args: ["p_canal", "p_cliente", "p_lista"], fn({ p_canal, p_cliente, p_lista }) {
      const k = canal(p_canal);
      if (!k || k.cliente_id !== p_cliente) throw e("canal_nao_encontrado");
      for (const t of p_lista) {
        const corpo = (t.components || []).find(c => String(c.type).toUpperCase() === "BODY")?.text ?? null;
        const nums = [...String(corpo ?? "").matchAll(/\{\{\s*(\d+)\s*\}\}/g)].map(m => +m[1]);
        const ex = tab("nx_templates").find(x => x.canal_id === p_canal && x.nome === t.name && x.idioma === t.language);
        const obj = { cliente_id: p_cliente, canal_id: p_canal, nome: t.name, idioma: t.language, categoria: t.category, status: t.status, corpo,
                      num_parametros: nums.length ? Math.max(...nums) : 0 };
        if (ex) Object.assign(ex, obj); else tab("nx_templates").push({ id: `tpl-${novoId()}`, ...obj });
      }
      return { total: p_lista.length };
    } },
    nx_template_ver: { args: ["p_cliente", "p_template", "p_canal"], fn({ p_cliente, p_template, p_canal }) {
      const t = tab("nx_templates").find(x => x.id === p_template && x.cliente_id === p_cliente && x.canal_id === p_canal && x.status === "APPROVED");
      if (!t) throw e("template_invalido");
      return { id: t.id, nome: t.nome, idioma: t.idioma, categoria: t.categoria, corpo: t.corpo, num_parametros: t.num_parametros };
    } },

    nx_ia_contexto: { args: ["p_ctx", "p_cliente", "p_conversa"], opcionais: ["p_limite"], fn({ p_ctx, p_cliente, p_conversa }) {
      if (!visivel(p_ctx, p_cliente, p_conversa)) throw e("conversa_nao_encontrada");
      exigirModulo(p_cliente, "conversas");
      const cv = conversa(p_conversa), c = cliente(p_cliente);
      // conversa oculta só para supervisor+ (mesma regra do nx_cv_mensagens)
      const ocultas = new Set(RANK[p_ctx.papel] < 2
        ? tab("nx_conversas").filter(x => x.cliente_id === p_cliente && x.contato_id === cv.contato_id && x.oculta).map(x => x.id) : []);
      const msgs = tab("nx_mensagens").filter(m => m.contato_id === cv.contato_id && m.cliente_id === p_cliente && !["nota", "sistema"].includes(m.tipo)
                                                 && !ocultas.has(m.conversa_id))
        .sort((a, b) => a.id - b.id).slice(-30)
        .map(m => ({ dir: m.direcao, quem: m.direcao === "in" ? "cliente" : (conta(m.enviado_por)?.nome || "equipe"), texto: String(m.corpo ?? "").slice(0, 1500), em: m.criado_em }));
      return { empresa: c.nome, vertical: c.vertical, org_assinatura: "Equipe Nexus", ia: c.cfg?.ia || {},
               contato_nome: tab("nx_contatos").find(k => k.id === cv.contato_id)?.nome, atendente_nome: conta(p_ctx.conta_id)?.nome, mensagens: msgs };
    } },
    nx_ia_cota: { args: ["p_cliente"], opcionais: ["p_conta"], fn({ p_cliente, p_conta = null }) {
      const uso = tab("nx_ia_uso").filter(u => u.cliente_id === p_cliente);
      return { usadas: uso.length, limite: cliente(p_cliente)?.limite_ia ?? null,
               conta_minuto: p_conta ? uso.filter(u => u.conta_id === p_conta && relogio().getTime() - Date.parse(u.criado_em) < 60e3).length : 0 };
    } },
    nx_ia_registrar: { args: ["p_cliente", "p_conta", "p_acao", "p_modelo", "p_in", "p_out", "p_ok"], fn(p) {
      tab("nx_ia_uso").push({ cliente_id: p.p_cliente, conta_id: p.p_conta, acao: p.p_acao, modelo: p.p_modelo, tokens_in: p.p_in, tokens_out: p.p_out, ok: p.p_ok, criado_em: iso() });
      return null;
    } },

    nx_ia_reservar: { args: ["p_cliente", "p_conta", "p_acao"], fn(p) {
      const uso = tab("nx_ia_uso").filter(x => x.cliente_id === p.p_cliente);
      const ativos = tab("nx_ia_reservas").filter(x => x.cliente_id === p.p_cliente && Date.parse(x.expira_em) > relogio().getTime());
      const limite = cliente(p.p_cliente)?.limite_ia ?? null;
      if (limite != null && uso.length + ativos.length >= limite) return { ok: false, erro: "ia_cota" };
      const porMinuto = uso.filter(x => x.conta_id === p.p_conta && relogio().getTime() - Date.parse(x.criado_em) < 60e3).length
        + ativos.filter(x => x.conta_id === p.p_conta && relogio().getTime() - Date.parse(x.criado_em) < 60e3).length;
      if (porMinuto >= 20) return { ok: false, erro: "muitos_pedidos" };
      const id = `reserva-${tab("nx_ia_reservas").length + 1}`;
      tab("nx_ia_reservas").push({ id, cliente_id: p.p_cliente, conta_id: p.p_conta, acao: p.p_acao,
        criado_em: iso(), expira_em: new Date(relogio().getTime() + 5 * 60e3).toISOString() });
      return { ok: true, reserva_id: id };
    } },
    nx_ia_registrar_reserva: { args: ["p_reserva", "p_modelo", "p_in", "p_out", "p_ok"], fn(p) {
      const idx = tab("nx_ia_reservas").findIndex(x => x.id === p.p_reserva);
      if (idx < 0) return { ok: tab("nx_ia_uso").some(x => x.reserva_id === p.p_reserva) };
      const [r] = tab("nx_ia_reservas").splice(idx, 1);
      tab("nx_ia_uso").push({ reserva_id: r.id, cliente_id: r.cliente_id, conta_id: r.conta_id, acao: r.acao,
        modelo: p.p_modelo, tokens_in: p.p_in, tokens_out: p.p_out, ok: p.p_ok, criado_em: iso() });
      return { ok: true };
    } },

    nx_midia_lixo_pegar: { args: [], opcionais: ["p_limite"], fn: () => tab("nx_midia_lixo").filter(l => !l.apagado_em && !l.erro).map(l => ({ id: l.id, cliente_id: l.cliente_id, path: l.path })) },
    nx_midia_lixo_concluir: { args: ["p_ids"], opcionais: ["p_erro"], fn({ p_ids, p_erro = null }) {
      let n = 0;
      for (const l of tab("nx_midia_lixo")) if (p_ids.includes(l.id) && !l.apagado_em) { if (p_erro) l.erro = p_erro; else l.apagado_em = iso(); n++; }
      return n;
    } },
    nx_alerta_destinos: { args: ["p_cliente"], fn({ p_cliente }) {
      const c = cliente(p_cliente);
      if (!c) throw e("cliente_nao_encontrado");
      return { destinos: (c.cfg?.waGestor || []).map(soDig) };
    } },

    // arquivo 20260927 (lead): cliente = o do CANAL
    nx_lead_webhook: { args: ["p_cliente", "p_telefone", "p_variantes", "p_nome", "p_atr", "p_hoje"], opcionais: ["p_dias"],
      fn({ p_cliente, p_telefone, p_variantes, p_nome, p_atr, p_hoje }) {
        const vars = new Set([...(p_variantes || []), soDig(p_telefone)]);
        const lead = tab("nx_leads").find(l => l.cliente_id === p_cliente && vars.has(l.telefone));
        if (lead) {
          if (!p_atr?.anuncio_ext || lead.anuncio_ext) return "existente";
          Object.assign(lead, { anuncio_ext: p_atr.anuncio_ext, plataforma: p_atr.plataforma, origem: p_atr.origem });
          return "atribuido";
        }
        tab("nx_leads").push({ id: novoId(), cliente_id: p_cliente, telefone: soDig(p_telefone), nome: p_nome, origem: p_atr?.origem || "whatsapp",
                               plataforma: p_atr?.plataforma ?? null, anuncio_ext: p_atr?.anuncio_ext ?? null, campanha_ext: p_atr?.campanha_ext ?? null,
                               ctwa_clid: p_atr?.ctwa_clid ?? null, etapa: "nova", data_conversa: p_hoje });
        return "criado";
      } },
    // recibos do número da Nexus (20260927_melhorias.sql)
    nx_trava_pegar: { args: ["p_nome", "p_segundos", "p_dono"], fn({ p_nome, p_dono }) {
      if (tab("nx_travas").some(t => t.nome === p_nome)) return false;
      tab("nx_travas").push({ nome: p_nome, ate: iso(), dono: p_dono });
      return true;
    } },
    nx_wa_anotar: { args: ["p_tabela", "p_ids"], opcionais: ["p_entregue_em", "p_wa_id_template", "p_erro"],
      fn({ p_tabela, p_ids, p_entregue_em = null }) {
        const linhas = tab(p_tabela).filter(r => p_ids.includes(r.id));
        for (const r of linhas) r.entregue_em ??= p_entregue_em;
        return linhas.length;
      } },
  };
}

/* ------------------------------------------------------------
   Graph API, Storage e Anthropic falsos
   ------------------------------------------------------------ */
const TOKENS_BONS = new Set(["tok-a1", "tok-a2", "wa-token-nexus"]);
const PIDS = { "111": { numero: "+55 12 3999-1111", nome: "Clínica A" }, "112": { numero: "+55 12 3999-1112", nome: "Clínica A 2" }, "222": { numero: "+55 12 3999-2222", nome: "Clínica B" } };

async function fakeGraph(req, u, estado) {
  const partes = u.pathname.split("/").filter(Boolean);   // ["v23.0", X, Y?]
  const token = (req.headers.get("authorization") || "").replace(/^Bearer\s+/, "");
  const erro190 = () => jsonResp({ error: { message: "Error validating access token: Session has expired on Saturday", type: "OAuthException", code: 190 } }, 401);
  estado.graph.push(`${req.method} ${u.pathname}`);
  if (partes[0] !== "v23.0") return jsonResp({ error: { message: "versão", code: 1 } }, 400);
  const [, x, y] = partes;
  if (y === "messages") {
    const corpo = JSON.parse(await req.text());
    const msg = { pid: x, token, ...corpo };
    estado.enviadas.push(msg);
    await new Promise(r => setImmediate(r));
    if (!TOKENS_BONS.has(token)) return erro190();
    if (corpo.status === "read") return jsonResp({ success: true });
    if (corpo.type !== "template" && estado.janelaFechada.has(corpo.to)) {
      return jsonResp({ error: { message: "(#131047) Re-engagement message", code: 131047 } }, 400);
    }
    msg.id = `wamid.OUT-${++estado.nWa}`;
    return jsonResp({ messaging_product: "whatsapp", contacts: [{ input: corpo.to, wa_id: corpo.to }], messages: [{ id: msg.id }] });
  }
  if (!TOKENS_BONS.has(token)) return erro190();
  if (y === "subscribed_apps") {
    if (req.method === "POST") { estado.inscritos.add(x); return jsonResp({ success: true }); }
    return jsonResp({ data: estado.inscritos.has(x) ? [{ whatsapp_business_api_data: { id: "APP", name: "Nexus" } }] : [] });
  }
  if (y === "message_templates") {
    return jsonResp({ data: [
      { name: "confirmacao_consulta", language: "pt_BR", category: "UTILITY", status: "APPROVED", components: [{ type: "BODY", text: "Olá {{1}}, sua consulta é {{2}}." }] },
      { name: "promo", language: "pt_BR", category: "MARKETING", status: "APPROVED", components: [{ type: "BODY", text: "Promoção!" }] },
    ] });
  }
  if (PIDS[x]) return jsonResp({ display_phone_number: PIDS[x].numero, verified_name: PIDS[x].nome, quality_rating: "GREEN" });
  if (x.startsWith("MID")) {
    return jsonResp({ url: `https://lookaside.fbsbx.com/whatsapp_business/attachments/?mid=${x}`, mime_type: "image/jpeg", file_size: x === "MID-GRANDE" ? 20 * 1024 * 1024 : 5 });
  }
  return jsonResp({ error: { message: `rota falsa ${u.pathname}`, code: 100 } }, 400);
}

async function fakeStorage(req, u, estado) {
  const caminho = u.pathname.replace(/^\/storage\/v1\//, "");
  estado.storage.push(`${req.method} ${caminho}`);
  let m;
  // download pela URL assinada (o token vai na URL: sem apikey) — é o que o nx-enviar baixa para mandar pelo aparelho
  if (req.method === "GET" && (m = caminho.match(/^object\/sign\/nx-midia\/(.+)$/))) {
    const arq = estado.arquivos.get(decodeURIComponent(m[1]));
    if (!arq || !/^ler-\d+$/.test(u.searchParams.get("token") || "")) return jsonResp({ message: "Object not found" }, 400);
    if (estado.downloadHandler) return estado.downloadHandler(arq, req);
    return new Response(arq.bytes, { status: 200, headers: { "content-type": arq.mime || "application/octet-stream", "content-length": String(arq.bytes.length) } });
  }
  if (!req.headers.get("apikey")) return jsonResp({ message: "sem apikey" }, 401);
  if (req.method === "POST" && (m = caminho.match(/^object\/upload\/sign\/nx-midia\/(.+)$/))) {
    return jsonResp({ url: `/object/upload/sign/nx-midia/${m[1]}?token=up-${m[1].length}` });
  }
  if (req.method === "POST" && caminho === "object/sign/nx-midia") {
    const { paths, expiresIn } = JSON.parse(await req.text());
    return jsonResp(paths.map(p => (estado.arquivos.has(p)
      ? { path: p, signedURL: `/object/sign/nx-midia/${p}?token=ler-${expiresIn}`, error: null }
      : { path: p, signedURL: null, error: "Object not found" })));
  }
  if (req.method === "POST" && caminho === "object/list/nx-midia") {
    const { prefix } = JSON.parse(await req.text());
    const nomes = new Map();
    for (const p of estado.arquivos.keys()) {
      if (!p.startsWith(`${prefix}/`)) continue;
      const resto = p.slice(prefix.length + 1), i = resto.indexOf("/");
      nomes.set(i < 0 ? resto : resto.slice(0, i), i < 0 ? "arq" : null);
    }
    return jsonResp([...nomes].map(([name, id]) => ({ name, id })));
  }
  if (req.method === "POST" && (m = caminho.match(/^object\/nx-midia\/(.+)$/))) {
    const bytes = new Uint8Array(await req.arrayBuffer());
    estado.arquivos.set(decodeURIComponent(m[1]), { bytes, mime: req.headers.get("content-type") });
    return jsonResp({ Key: `nx-midia/${m[1]}` });
  }
  if (req.method === "DELETE" && caminho === "object/nx-midia") {
    const { prefixes } = JSON.parse(await req.text());
    for (const p of prefixes) estado.arquivos.delete(p);
    return jsonResp(prefixes.map(name => ({ name })));
  }
  return jsonResp({ message: `rota falsa ${caminho}` }, 404);
}

function cenario({ config = {}, extra = {} } = {}) {
  const estado = { agora: new Date(AGORA), log: [], graph: [], enviadas: [], codewords: [], codewordsHandler: null, downloadHandler: null, storage: [], arquivos: new Map(), nWa: 0,
                   janelaFechada: new Set(), inscritos: new Set(["WABA-A"]), segundoPlano: [], ia: [] };
  const recente = new Date(AGORA.getTime() - HORA).toISOString(), velho = new Date(AGORA.getTime() - 30 * HORA).toISOString();
  const banco = criarBanco({
    nx_config: [{ id: 1, cron_token: "cron-secreto", codigo_gestor: "x", funcoes_url: FN, painel_url: null, wa_access_token: "wa-token-nexus",
                  wa_phone_number_id: NEXUS_PID, wa_template: "nexus_aviso", wa_verify_token: "verifica-global", meta_app_secret: "segredo-global",
                  anthropic_api_key: null, modelo_ia: "claude-opus-5", google_api_versao: null, ...config }],
    nx_clientes: [
      { id: CLI_A, slug: "clinica-a", nome: "Clínica Alfa", ativo: true, cfg: { waGestor: ["12911112222"] }, wa_phone_number_id: "111", vertical: "odonto",
        modulos: ["crm", "conversas", "relatorios", "ads"] },
      { id: CLI_B, slug: "clinica-b", nome: "Clínica Beta", ativo: true, cfg: {}, wa_phone_number_id: "222", vertical: "odonto", modulos: ["crm", "conversas"] },
    ],
    nx_canais: [
      { id: K_A1, cliente_id: CLI_A, nome: "Recepção", phone_number_id: "111", waba_id: "WABA-A", token: "tok-a1", app_secret: "segredo-a1",
        verify_token: "verifica-a1", chave_publica: "aaaa1111aaaa1111", departamento_id: DEP_A, status: "pendente" },
      { id: K_A2, cliente_id: CLI_A, nome: "Comercial", phone_number_id: "112", waba_id: "WABA-A2", token: "tok-a2", app_secret: null,
        verify_token: "verifica-a2", chave_publica: "aaaa2222aaaa2222", departamento_id: DEP_A2, status: "pendente" },
      { id: K_B, cliente_id: CLI_B, nome: "Único", phone_number_id: "222", waba_id: "WABA-B", token: "tok-vencido", app_secret: "segredo-b",
        verify_token: "verifica-b", chave_publica: "bbbb2222bbbb2222", departamento_id: null, status: "ativo" },
    ],
    nx_contas: [{ id: ADM_A, nome: "Ana Admin" }, { id: AT_A, nome: "Beto Atendente" }, { id: LE_A, nome: "Lia Leitura" }, { id: ADM_B, nome: "Caio Admin B" }],
    nx_acessos: [
      { conta_id: ADM_A, cliente_id: CLI_A, papel: "admin", departamentos: [], ver_todas: true },
      { conta_id: AT_A, cliente_id: CLI_A, papel: "atendente", departamentos: [DEP_A], ver_todas: false },
      { conta_id: LE_A, cliente_id: CLI_A, papel: "leitura", departamentos: [], ver_todas: true },
      { conta_id: ADM_B, cliente_id: CLI_B, papel: "admin", departamentos: [], ver_todas: true },
    ],
    nx_sessoes: [{ token: "tok-adm-a", conta_id: ADM_A }, { token: "tok-at-a", conta_id: AT_A }, { token: "tok-le-a", conta_id: LE_A }, { token: "tok-adm-b", conta_id: ADM_B }],
    nx_contatos: [
      { id: 501, cliente_id: CLI_A, nome: "Maria Souza", telefone: "5512988887777", wa_id: "5512988887777", bloqueado: false, optin_marketing: null },
      { id: 502, cliente_id: CLI_A, nome: "João Antigo", telefone: "5512977776666", wa_id: "5512977776666", bloqueado: false, optin_marketing: false },
      { id: 503, cliente_id: CLI_B, nome: "Pedro B", telefone: "5512966665555", wa_id: "5512966665555", bloqueado: false, optin_marketing: null },
      { id: 504, cliente_id: CLI_A, nome: "Bloqueado", telefone: "5512955554444", wa_id: "5512955554444", bloqueado: true, optin_marketing: null },
    ],
    nx_conversas: [
      // 601: Maria, aberta, janela aberta, atribuída à Ana (admin) → invisível ao atendente
      { id: 601, cliente_id: CLI_A, canal_id: K_A1, contato_id: 501, departamento_id: DEP_A, atribuida_a: ADM_A, protocolo: "2026-000601", status: "aberta",
        aguardando: true, oculta: false, nao_lidas: 1, ultima_entrada_em: recente },
      // 602: João, janela FECHADA
      { id: 602, cliente_id: CLI_A, canal_id: K_A1, contato_id: 502, departamento_id: DEP_A, atribuida_a: null, protocolo: "2026-000602", status: "aberta",
        aguardando: false, oculta: false, nao_lidas: 0, ultima_entrada_em: velho },
      // 603: conversa do cliente B
      { id: 603, cliente_id: CLI_B, canal_id: K_B, contato_id: 503, departamento_id: null, atribuida_a: null, protocolo: "2026-000603", status: "aberta",
        aguardando: true, oculta: false, nao_lidas: 1, ultima_entrada_em: recente },
      // 604: Maria, resolvida
      { id: 604, cliente_id: CLI_A, canal_id: K_A2, contato_id: 501, departamento_id: DEP_A2, atribuida_a: null, protocolo: "2026-000604", status: "resolvida",
        aguardando: false, oculta: false, nao_lidas: 0, ultima_entrada_em: recente },
      // 605: bloqueado, oculta e resolvida
      { id: 605, cliente_id: CLI_A, canal_id: K_A1, contato_id: 504, departamento_id: DEP_A, atribuida_a: null, protocolo: "2026-000605", status: "resolvida",
        aguardando: false, oculta: true, nao_lidas: 0, ultima_entrada_em: velho },
    ],
    nx_mensagens: [
      { id: 701, cliente_id: CLI_A, conversa_id: 601, contato_id: 501, canal_id: K_A1, direcao: "in", tipo: "texto", corpo: "Oi, quanto custa o clareamento?",
        wamid: "wamid.IN-701", status: "recebida", criado_em: recente, atualizado_em: recente },
      { id: 702, cliente_id: CLI_A, conversa_id: 601, contato_id: 501, canal_id: K_A1, direcao: "out", tipo: "nota", corpo: "NOTA INTERNA: cliente difícil",
        wamid: null, status: "enviada", enviado_por: ADM_A, criado_em: recente, atualizado_em: recente },
      { id: 703, cliente_id: CLI_B, conversa_id: 603, contato_id: 503, canal_id: K_B, direcao: "in", tipo: "texto", corpo: "oi B", wamid: "wamid.IN-703",
        status: "recebida", criado_em: recente, atualizado_em: recente },
      { id: 704, cliente_id: CLI_B, conversa_id: 603, contato_id: 503, canal_id: K_B, direcao: "out", tipo: "texto", corpo: "falhou B", wamid: "wamid.OUT-B",
        status: "falhou", criado_em: recente, atualizado_em: recente },
      { id: 705, cliente_id: CLI_A, conversa_id: 601, contato_id: 501, canal_id: K_A1, direcao: "out", tipo: "texto", corpo: "saída A", wamid: "wamid.OUT-A1",
        status: "enviada", criado_em: recente, atualizado_em: recente },
    ],
    nx_templates: [
      { id: "tpl-conf", cliente_id: CLI_A, canal_id: K_A1, nome: "confirmacao_consulta", idioma: "pt_BR", categoria: "UTILITY", status: "APPROVED",
        corpo: "Olá {{1}}, sua consulta é {{2}}.", num_parametros: 2 },
      { id: "tpl-promo", cliente_id: CLI_A, canal_id: K_A1, nome: "promo", idioma: "pt_BR", categoria: "MARKETING", status: "APPROVED", corpo: "Promoção!", num_parametros: 0 },
      { id: "tpl-pend", cliente_id: CLI_A, canal_id: K_A1, nome: "pendente", idioma: "pt_BR", categoria: "UTILITY", status: "PENDING", corpo: "x", num_parametros: 0 },
      { id: "tpl-b", cliente_id: CLI_B, canal_id: K_B, nome: "b", idioma: "pt_BR", categoria: "UTILITY", status: "APPROVED", corpo: "b", num_parametros: 0 },
    ],
    nx_envios_fila: [], nx_ia_uso: [], nx_ia_reservas: [], nx_midia_lixo: [], nx_leads: [], nx_metricas_dia: [], nx_funis: [],
    nx_alertas: [], nx_relatorios: [], nx_travas: [],
    ...extra,
  }, () => estado.agora, { esquema: ESQUEMA, rpcs: rpcsSaaS, chave: ENV.chave, seq: 5000 });

  const fetch = async (entrada, init) => {
    const req = new Request(entrada, init);
    const u = new URL(req.url);
    estado.log.push(`${req.method} ${u.host}${u.pathname}`);
    if (u.origin === SUPA && u.pathname.startsWith("/rest/v1/")) return banco.responder(req);
    if (u.origin === SUPA && u.pathname.startsWith("/storage/v1/")) return fakeStorage(req, u, estado);
    if (u.host === "graph.facebook.com") return fakeGraph(req, u, estado);
    if (u.host === "runtime.codewords.ai") {
      // device manager (aparelho): GET /connections, POST /proxy/send/message (form-urlencoded, chave crua) e
      // POST /proxy/send/{image|audio|file} (multipart: campos de texto + o arquivo)
      const tipo = req.headers.get("content-type");
      let texto = "", multipart = null;
      if (tipo?.startsWith("multipart/form-data")) {
        multipart = { campos: {}, arquivo: null };
        for (const [k, v] of await req.formData()) {
          if (typeof v === "string") multipart.campos[k] = v;
          else multipart.arquivo = { campo: k, nome: v.name, mime: v.type, bytes: new Uint8Array(await v.arrayBuffer()) };
        }
      } else texto = await req.text();
      const chamada = { metodo: req.method, caminho: u.pathname.replace("/run/whatsapp_device_manager", ""), phone_id: u.searchParams.get("phone_id"),
                        auth: req.headers.get("authorization"), tipo, form: tipo?.includes("x-www-form-urlencoded") ? Object.fromEntries(new URLSearchParams(texto)) : null,
                        multipart };
      estado.codewords.push(chamada);
      if (chamada.caminho === "/connections") {
        return jsonResp([{ phone_id: "dev-a1", phone_number: "+5512900001111", status: "logged_in", service_path: "svc_ia/webhook" }]);
      }
      if (estado.codewordsHandler) return estado.codewordsHandler(chamada, req);
      return jsonResp({ code: "SUCCESS", message: "Message sent", results: { message_id: "3EB0DEFAULT", status: "sent" } });
    }
    if (u.host === "lookaside.fbsbx.com") {
      if (!TOKENS_BONS.has((req.headers.get("authorization") || "").replace(/^Bearer\s+/, ""))) return new Response("proibido", { status: 401 });
      return new Response(new Uint8Array([1, 2, 3, 4, 5]), { status: 200, headers: { "content-type": "image/jpeg" } });
    }
    throw new TypeError(`fetch falso: host inesperado ${u.host}`);
  };
  const deps = extra2 => ({ fetch, agora: () => estado.agora, emSegundoPlano: p => estado.segundoPlano.push(p), ...extra2 });
  const rpcs = nome => banco.api.chamadas.filter(c => c.nome === nome);
  return { banco, estado, fetch, deps, rpcs, tab: banco.tab };
}

/* ------------------------------------------------------------
   Requisições
   ------------------------------------------------------------ */
const assinar = (corpo, segredo) => `sha256=${createHmac("sha256", segredo).update(corpo).digest("hex")}`;
const postWebhook = (payload, { c, segredo = "segredo-global", assinatura } = {}) => {
  const corpo = typeof payload === "string" ? payload : JSON.stringify(payload);
  return new Request(`${FN}/nx-whatsapp${c ? `?c=${c}` : ""}`, {
    method: "POST", headers: { "content-type": "application/json", "x-hub-signature-256": assinatura ?? assinar(corpo, segredo) }, body: corpo,
  });
};
const valor = (pid, { messages, statuses, contacts } = {}) => ({
  object: "whatsapp_business_account",
  entry: [{ id: "WABA", changes: [{ field: "messages", value: {
    messaging_product: "whatsapp", metadata: { display_phone_number: "551239990000", phone_number_id: pid },
    ...(contacts ? { contacts } : {}), ...(messages ? { messages } : {}), ...(statuses ? { statuses } : {}),
  } }] }],
});
let nWamid = 0;
const texto = (from, body, extra = {}) => ({ from, id: `wamid.IN-${++nWamid}`, timestamp: String(Math.floor(AGORA.getTime() / 1000)), type: "text", text: { body }, ...extra });
const REFERRAL = { source_url: "https://fb.me/x", source_id: "AD-1", source_type: "ad", headline: "Clareamento", ctwa_clid: "CLID-1" };
const contato = (wa, nome = "Paciente Teste") => [{ profile: { name: nome }, wa_id: wa }];

const painel = (fn, corpo, token = "tok-adm-a", cliente = CLI_A) => new Request(`${FN}/${fn}`, {
  method: "POST", headers: { "content-type": "application/json", apikey: "sb_publishable_x" }, body: JSON.stringify({ token, cliente, ...corpo }),
});
const cron = (corpo, token = "cron-secreto") => new Request(`${FN}/nx-enviar`, {
  method: "POST", headers: { "content-type": "application/json", "x-nx-cron": token }, body: JSON.stringify(corpo),
});
const ler = async r => ({ status: r.status, corpo: await r.json(), cab: r.headers });
const esperarFundo = async s => { while (s.estado.segundoPlano.length) await Promise.allSettled(s.estado.segundoPlano.splice(0)); };
const graphMsgs = s => s.estado.enviadas.filter(m => m.status !== "read");

/* ============================================================
   nx-whatsapp (ESPEC §6.2)
   ============================================================ */
test("webhook GET ?c=: verify token do CANAL; chave desconhecida 403; sem c continua o global", async () => {
  const s = cenario();
  const get = q => webhook(new Request(`${FN}/nx-whatsapp?${q}`), ENV, s.deps());
  let r = await get("c=aaaa1111aaaa1111&hub.mode=subscribe&hub.verify_token=verifica-a1&hub.challenge=777");
  assert.equal(r.status, 200);
  assert.equal(await r.text(), "777");
  assert.equal((await get("c=aaaa1111aaaa1111&hub.mode=subscribe&hub.verify_token=verifica-global&hub.challenge=1")).status, 403, "token global não vale na URL do canal");
  assert.equal((await get("c=aaaa1111aaaa1111&hub.mode=subscribe&hub.verify_token=verifica-a2&hub.challenge=1")).status, 403, "token de outro canal não vale");
  assert.equal((await get("c=ffffffffffff0000&hub.mode=subscribe&hub.verify_token=verifica-a1&hub.challenge=1")).status, 403);
  assert.equal((await get("c=<script>&hub.mode=subscribe&hub.verify_token=verifica-a1&hub.challenge=1")).status, 403);
  r = await get("hub.mode=subscribe&hub.verify_token=verifica-global&hub.challenge=9");
  assert.equal(r.status, 200);
  assert.equal(await r.text(), "9");
});

test("webhook POST: assinado com o app secret do canal (?c=) e com o global (sem c) → processa; segredo errado 401", async () => {
  const s = cenario();
  const p = valor("111", { contacts: contato("5512911110000"), messages: [texto("5512911110000", "Oi")] });
  let r = await ler(await webhook(postWebhook(p, { c: "aaaa1111aaaa1111", segredo: "segredo-a1" }), ENV, s.deps()));
  assert.equal(r.status, 200);
  assert.equal(r.corpo.mensagens, 1);
  assert.equal(r.corpo.criado, 1, "lead criado no cliente do canal");
  // canal COM app secret próprio: o global não vale na URL dele
  assert.equal((await webhook(postWebhook(p, { c: "aaaa1111aaaa1111", segredo: "segredo-global" }), ENV, s.deps())).status, 401);
  // canal SEM app secret (app da Nexus): na URL dele vale o global
  const p2 = valor("112", { contacts: contato("5512911110001"), messages: [texto("5512911110001", "Oi")] });
  r = await ler(await webhook(postWebhook(p2, { c: "aaaa2222aaaa2222", segredo: "segredo-global" }), ENV, s.deps()));
  assert.equal(r.corpo.mensagens, 1);
  // chave desconhecida → 401 (nem confere assinatura)
  assert.equal((await webhook(postWebhook(p, { c: "ffffffffffff0000", segredo: "segredo-a1" }), ENV, s.deps())).status, 401);
  // sem c, assinado com o global: resolve o canal pelo pid
  const p3 = valor("111", { contacts: contato("5512911110002"), messages: [texto("5512911110002", "Oi")] });
  r = await ler(await webhook(postWebhook(p3), ENV, s.deps()));
  assert.equal(r.corpo.mensagens, 1);
  // sem c, assinado com o segredo do CANAL: o global é o único que vale → 401
  assert.equal((await webhook(postWebhook(p3, { segredo: "segredo-a1" }), ENV, s.deps())).status, 401);
});

test("webhook (1) A1: URL ?c= de A com pid de B → 200, canal_divergente: 1 e NENHUMA gravação para B", async () => {
  const s = cenario();
  const p = valor("222", { contacts: contato("5512966665555"), messages: [texto("5512966665555", "forjado", { referral: REFERRAL })],
                           statuses: [{ id: "wamid.OUT-B", status: "delivered", timestamp: "1" }] });
  const r = await ler(await webhook(postWebhook(p, { c: "aaaa1111aaaa1111", segredo: "segredo-a1" }), ENV, s.deps()));
  assert.equal(r.status, 200);
  assert.equal(r.corpo.canal_divergente, 1);
  assert.equal(r.corpo.mensagens, 0);
  for (const n of ["nx_wa_entrada", "nx_lead_webhook", "nx_wa_status", "nx_wa_anotar"]) assert.equal(s.rpcs(n).length, 0, `${n} não pode ser chamada`);
  assert.equal(s.tab("nx_mensagens").find(m => m.wamid === "wamid.OUT-B").status, "falhou", "recibo forjado não mexe na mensagem de B");
  assert.equal(s.estado.graph.length, 0);
});

test("webhook (2) A1: URL ?c= com o pid da NEXUS e recibos → ignorado, nenhum reenvio por modelo", async () => {
  const s = cenario({ extra: { nx_alertas: [{ id: 1, cliente_id: CLI_A, chave: "k", wa_ids: ["wamid.NEXUS-1"], wa_ids_template: [], entregue_em: null }] } });
  // mesmo que um canal tivesse o pid da Nexus, a URL ?c= nunca processa o número da Nexus
  s.tab("nx_canais").find(k => k.id === K_A1).phone_number_id = NEXUS_PID;
  const p = valor(NEXUS_PID, { statuses: [{ id: "wamid.NEXUS-1", status: "failed", timestamp: "1", recipient_id: "5512911112222",
                                            errors: [{ code: 131047, title: "Re-engagement message" }] }] });
  const r = await ler(await webhook(postWebhook(p, { c: "aaaa1111aaaa1111", segredo: "segredo-a1" }), ENV, s.deps()));
  assert.equal(r.status, 200);
  assert.equal(r.corpo.canal_divergente, 1);
  assert.equal(r.corpo.recibos, undefined);
  assert.equal(s.estado.graph.length, 0, "nenhum reenvio por modelo");
  assert.equal(s.rpcs("nx_trava_pegar").length + s.rpcs("nx_wa_anotar").length + s.rpcs("nx_wa_status").length, 0);
});

test("webhook (3): sem ?c=, segredo global → recibos da Nexus processados como hoje", async () => {
  const s = cenario({ extra: { nx_alertas: [{ id: 1, cliente_id: CLI_A, chave: "k", wa_ids: ["wamid.NEXUS-1"], wa_ids_template: [], entregue_em: null }] } });
  const t = new Date(AGORA.getTime() + 5e3);
  const p = valor(NEXUS_PID, { statuses: [{ id: "wamid.NEXUS-1", status: "delivered", timestamp: String(Math.floor(t.getTime() / 1000)), recipient_id: "5512911112222" }] });
  const r = await ler(await webhook(postWebhook(p), ENV, s.deps()));
  assert.deepEqual(r.corpo.recibos, { entregue: 1 });
  assert.equal(s.tab("nx_alertas")[0].entregue_em, t.toISOString());
  assert.equal(s.rpcs("nx_wa_canal").length, 0, "número da Nexus nem consulta nx_canais");
});

test("webhook (4) M3: anúncio no 2º número do cliente → nx_lead_webhook com o cliente DO CANAL e lead criado", async () => {
  const s = cenario();
  const p = valor("112", { contacts: contato("5512944443333", "Ana Lead"), messages: [texto("5512944443333", "vi o anúncio", { referral: REFERRAL })] });
  const r = await ler(await webhook(postWebhook(p), ENV, s.deps()));
  assert.equal(r.corpo.criado, 1);
  const [chamada] = s.rpcs("nx_lead_webhook");
  assert.equal(chamada.params.p_cliente, CLI_A, "cliente = o do canal (pid 112 ≠ nx_clientes.wa_phone_number_id)");
  assert.equal(chamada.params.p_atr.plataforma, "meta");
  assert.equal(chamada.params.p_atr.anuncio_ext, "AD-1");
  assert.equal(chamada.params.p_atr.ctwa_clid, "CLID-1");
  const lead = s.tab("nx_leads").find(l => l.telefone === "5512944443333");
  assert.equal(lead.cliente_id, CLI_A);
  assert.equal(lead.origem, "anuncio");
  // ordem: nx_wa_entrada ANTES do lead (o gatilho acha o contato pelo wa_id e liga a conversa)
  const ordem = s.banco.api.chamadas.map(c => c.nome).filter(n => ["nx_wa_entrada", "nx_lead_webhook"].includes(n));
  assert.deepEqual(ordem, ["nx_wa_entrada", "nx_lead_webhook"]);
  const [ent] = s.rpcs("nx_wa_entrada");
  assert.equal(ent.params.p_canal, K_A2);
  assert.equal(ent.params.p_msg.referral.source_id, "AD-1");
});

test("webhook (5): recibo com wamid de OUTRO canal → ignorados; do próprio canal → nx_wa_status atualiza", async () => {
  const s = cenario();
  // wamid.OUT-A1 é do canal A1; o recibo vem pelo número A2 (mesmo cliente)
  let r = await ler(await webhook(postWebhook(valor("112", { statuses: [{ id: "wamid.OUT-A1", status: "read", timestamp: "1" }] })), ENV, s.deps()));
  assert.equal(r.corpo.recibos_canal, 0);
  assert.equal(r.corpo.recibos_ignorados, 1);
  assert.equal(s.tab("nx_mensagens").find(m => m.id === 705).status, "enviada");
  r = await ler(await webhook(postWebhook(valor("111", { statuses: [
    { id: "wamid.OUT-A1", status: "delivered", timestamp: "1" }, { id: "wamid.OUT-A1", status: "read", timestamp: "2" },
  ] })), ENV, s.deps()));
  assert.equal(r.corpo.recibos_canal, 2);
  assert.equal(s.tab("nx_mensagens").find(m => m.id === 705).status, "lida");
  // failed chega com o texto da dica calculado na função
  s.tab("nx_mensagens").find(m => m.id === 705).status = "enviada";
  await webhook(postWebhook(valor("111", { statuses: [{ id: "wamid.OUT-A1", status: "failed", timestamp: "3", errors: [{ code: 131026, title: "Message undeliverable" }] }] })), ENV, s.deps());
  const [st] = s.rpcs("nx_wa_status").slice(-1);
  assert.match(st.params.p_statuses[0].erro_texto, /código 131026.*não pode receber/);
  assert.match(s.tab("nx_mensagens").find(m => m.id === 705).erro, /131026/);
});

test("webhook (6): texto de 5.000 caracteres e nome de 300 → gravados cortados, sem erro", async () => {
  const s = cenario();
  const p = valor("111", { contacts: contato("5512933332222", "N".repeat(300)), messages: [texto("5512933332222", "x".repeat(5000))] });
  const r = await ler(await webhook(postWebhook(p), ENV, s.deps()));
  assert.equal(r.corpo.erros, undefined);
  const [ent] = s.rpcs("nx_wa_entrada");
  assert.equal(ent.params.p_msg.corpo.length, 4096);
  assert.equal(ent.params.p_msg.nome.length, 160);
  const ct = s.tab("nx_contatos").find(c => c.wa_id === "5512933332222");
  assert.equal(ct.nome.length, 160);
  assert.equal(s.tab("nx_mensagens").find(m => m.contato_id === ct.id).corpo.length, 4096);
  assert.ok(s.rpcs("nx_lead_webhook")[0].params.p_nome.length <= 160);
});

test("webhook (7): from estrangeiro 14155551234 → contato com telefone = wa_id = 14155551234 (sem 55)", async () => {
  const s = cenario();
  await webhook(postWebhook(valor("111", { contacts: contato("14155551234", "John"), messages: [texto("14155551234", "hello")] })), ENV, s.deps());
  const ct = s.tab("nx_contatos").find(c => c.nome === "John");
  assert.equal(ct.telefone, "14155551234");
  assert.equal(ct.wa_id, "14155551234");
  assert.equal(s.rpcs("nx_wa_entrada")[0].params.p_msg.wa_id, "14155551234");
});

test("webhook (8): contato bloqueado → mensagem na conversa oculta, sem conversa nova e SEM nx_lead_webhook", async () => {
  const s = cenario();
  const antes = s.tab("nx_conversas").length;
  const r = await ler(await webhook(postWebhook(valor("111", { contacts: contato("5512955554444"), messages: [texto("5512955554444", "oi de novo")] })), ENV, s.deps()));
  assert.equal(r.corpo.bloqueados, 1);
  assert.equal(s.tab("nx_conversas").length, antes);
  assert.equal(s.tab("nx_mensagens").slice(-1)[0].conversa_id, 605);
  assert.equal(s.rpcs("nx_lead_webhook").length, 0);
  assert.equal(r.corpo.criado + r.corpo.existente + r.corpo.atribuido, 0);
});

test("webhook (9): \"SAIR\" → optout; normalizarMensagem cobre imagem, reação, unsupported, localização, contato, botão e system", async () => {
  const s = cenario();
  const r = await ler(await webhook(postWebhook(valor("111", { contacts: contato("5512988887777"), messages: [texto("5512988887777", "SAIR")] })), ENV, s.deps()));
  assert.equal(r.corpo.optout, 1);
  assert.equal(s.tab("nx_contatos").find(c => c.id === 501).optin_marketing, false);

  const ts = "1790506800";
  const img = normalizarMensagem({ from: "5512988887777", id: "w1", timestamp: ts, type: "image", image: { id: "MID-1", mime_type: "image/jpeg", sha256: "abc", caption: "foto" } }, contato("5512988887777", "Maria"));
  assert.deepEqual(img, { wamid: "w1", wa_id: "5512988887777", nome: "Maria", em: "2026-09-27T11:00:00Z", tipo: "imagem", corpo: "foto",
                          midia: { media_id: "MID-1", mime: "image/jpeg", sha256: "abc", nome: null, legenda: "foto" } });
  const doc = normalizarMensagem({ from: "5512988887777", id: "w2", type: "document", document: { id: "MID-2", mime_type: "application/pdf", filename: "a".repeat(300) } }, []);
  assert.equal(doc.midia.nome.length, 200);
  assert.equal(doc.tipo, "documento");
  const reac = normalizarMensagem({ from: "5512988887777", id: "w3", type: "reaction", reaction: { message_id: "wamid.X", emoji: "👍" } }, []);
  assert.deepEqual(reac.reacao, { wamid: "wamid.X", emoji: "👍" });
  assert.equal(reac.tipo, undefined, "reação não vira mensagem");
  const uns = normalizarMensagem({ from: "5512988887777", id: "w4", type: "unsupported", errors: [{ code: 131051 }] }, []);
  assert.deepEqual([uns.tipo, uns.corpo], ["desconhecido", TEXTO_NAO_SUPORTADA]);
  const loc = normalizarMensagem({ from: "5512988887777", id: "w5", type: "location", location: { latitude: -23.02, longitude: -45.55, name: "Clínica", address: "Rua X" } }, []);
  assert.equal(loc.corpo, "Localização: Clínica — Rua X (-23.02, -45.55)");
  const ctt = normalizarMensagem({ from: "5512988887777", id: "w6", type: "contacts", contacts: [{ name: { formatted_name: "Zé" }, phones: [{ phone: "+55 12 9999-0000" }] }] }, []);
  assert.equal(ctt.corpo, "Contato: Zé +55 12 9999-0000");
  const bt = normalizarMensagem({ from: "5512988887777", id: "w7", type: "interactive", interactive: { type: "button_reply", button_reply: { id: "b1", title: "Confirmar" } }, context: { id: "wamid.T" } }, []);
  assert.deepEqual([bt.tipo, bt.corpo, bt.responde_a_wamid], ["interativo", "Confirmar", "wamid.T"]);
  assert.equal(normalizarMensagem({ from: "5512988887777", id: "w8", type: "system", system: {} }, []), null);
  // as chamadas certas: imagem → nx_wa_entrada com a mídia; reação → nx_wa_entrada com reacao
  const s2 = cenario();
  await webhook(postWebhook(valor("111", { contacts: contato("5512988887777"), messages: [
    { from: "5512988887777", id: "wamid.IMG-1", timestamp: ts, type: "image", image: { id: "MID-1", mime_type: "image/jpeg" } },
    { from: "5512988887777", id: "wamid.R-1", timestamp: ts, type: "reaction", reaction: { message_id: "wamid.IN-701", emoji: "❤" } },
    { from: "5512988887777", id: "wamid.U-1", timestamp: ts, type: "unsupported" },
  ] })), ENV, s2.deps());
  const tipos = s2.rpcs("nx_wa_entrada").map(c => c.params.p_msg.tipo ?? "reacao");
  assert.deepEqual(tipos, ["imagem", "reacao", "desconhecido"]);
  assert.equal(s2.tab("nx_mensagens").find(m => m.id === 701).reacao, "❤");
});

test("webhook: mídia baixada em SEGUNDO PLANO → Storage privado <cliente>/in/<mês>/…; token falso → 'falhou' (honesto)", async () => {
  const s = cenario();
  const msg = { from: "5512988887777", id: "wamid.IMG-9", timestamp: "1790506800", type: "image", image: { id: "MID-9", mime_type: "image/jpeg" } };
  const r = await ler(await webhook(postWebhook(valor("111", { contacts: contato("5512988887777"), messages: [msg] })), ENV, s.deps()));
  assert.equal(r.status, 200);
  assert.equal(s.estado.segundoPlano.length, 1, "a resposta sai antes do download");
  assert.equal(s.estado.storage.length, 0);
  await esperarFundo(s);
  const m = s.tab("nx_mensagens").find(x => x.wamid === "wamid.IMG-9");
  assert.equal(m.midia.estado, "ok");
  assert.match(m.midia.path, new RegExp(`^${CLI_A}/in/2026-09/[0-9a-f-]{36}\\.jpg$`));
  assert.equal(m.midia.tamanho, 5);
  assert.ok(s.estado.arquivos.has(m.midia.path), "arquivo gravado no bucket");
  assert.equal(s.estado.arquivos.get(m.midia.path).mime, "image/jpeg");
  const [ok] = s.rpcs("nx_wa_midia_ok");
  assert.equal(ok.params.p_cliente, CLI_A, "cliente e canal vêm do canal resolvido, nunca do corpo");
  // canal com token vencido: GET /{media_id} dá 190 → estado falhou com a dica
  const s2 = cenario();
  s2.tab("nx_canais").find(k => k.id === K_A1).token = "tok-vencido";
  await webhook(postWebhook(valor("111", { contacts: contato("5512988887777"), messages: [{ ...msg, id: "wamid.IMG-10" }] })), ENV, s2.deps());
  await esperarFundo(s2);
  const m2 = s2.tab("nx_mensagens").find(x => x.wamid === "wamid.IMG-10");
  assert.equal(m2.midia.estado, "falhou");
  assert.match(m2.midia.erro, /código 190/);
  // > 16 MB → falhou sem baixar
  const s3 = cenario();
  await webhook(postWebhook(valor("111", { contacts: contato("5512988887777"), messages: [{ ...msg, id: "wamid.IMG-11", image: { id: "MID-GRANDE", mime_type: "image/jpeg" } }] })), ENV, s3.deps());
  await esperarFundo(s3);
  assert.equal(s3.tab("nx_mensagens").find(x => x.wamid === "wamid.IMG-11").midia.erro, "arquivo maior que 16 MB");
  assert.equal(s3.estado.log.filter(l => l.includes("lookaside")).length, 0);
  // sem emSegundoPlano (deps antigos): roda antes da resposta, nada se perde
  const s4 = cenario();
  await webhook(postWebhook(valor("111", { contacts: contato("5512988887777"), messages: [{ ...msg, id: "wamid.IMG-12" }] })), ENV, { fetch: s4.fetch, agora: () => s4.estado.agora });
  assert.equal(s4.tab("nx_mensagens").find(x => x.wamid === "wamid.IMG-12").midia.estado, "ok");
});

test("webhook (10): webhook e cron pegando o MESMO item da fila ao mesmo tempo → UMA chamada à Graph", async () => {
  const s = cenario();
  s.tab("nx_canais").find(k => k.id === K_A1).fora_horario = "Estamos fechados; respondemos às 8h.";
  const p = valor("111", { contacts: contato("5512922221111", "Noturno"), messages: [texto("5512922221111", "tem alguém?")] });
  const r = await ler(await webhook(postWebhook(p), ENV, s.deps()));
  assert.equal(r.status, 200);
  const item = s.tab("nx_envios_fila")[0];
  assert.equal(item.origem, "fora_horario");
  // o webhook deixou o envio em segundo plano; o cron do minuto roda AO MESMO TEMPO
  const [cronR] = await Promise.all([enviar(cron({ fila: true }), ENV, s.deps()), esperarFundo(s)]);
  assert.equal(cronR.status, 200);
  const envios = graphMsgs(s).filter(m => m.to === "5512922221111");
  assert.equal(envios.length, 1, "uma única chamada à Graph");
  assert.equal(envios[0].text.body, "Estamos fechados; respondemos às 8h.");
  assert.equal(item.status, "enviado");
  assert.equal(item.tentativas, 1);
  const saida = s.tab("nx_mensagens").find(m => m.id === item.mensagem_id);
  assert.equal(saida.origem, "fora_horario");
  assert.equal(saida.enviado_por, null, "mensagem automática (sistema)");
  assert.deepEqual(s.rpcs("nx_fila_pegar")[0].params, { p_limite: 1, p_ids: [item.id] }, "o webhook pede SÓ o id que criou");
});

test("webhook: reserva antiga — número SEM nx_canais cai no caminho por nx_clientes.wa_phone_number_id (só lead)", async () => {
  const s = cenario();
  s.tab("nx_canais").splice(0);   // nenhum canal cadastrado ainda
  const r = await ler(await webhook(postWebhook(valor("111", { contacts: contato("5512911119999"), messages: [texto("5512911119999", "oi", { referral: REFERRAL })] })), ENV, s.deps()));
  assert.equal(r.corpo.criado, 1);
  assert.equal(r.corpo.mensagens, 0);
  assert.equal(s.rpcs("nx_wa_entrada").length, 0);
  assert.equal(s.rpcs("nx_lead_webhook")[0].params.p_cliente, CLI_A);
});

/* ============================================================
   nx-enviar — painel (ESPEC §6.3)
   ============================================================ */
test("nx-enviar: CORS/OPTIONS 204 com os cabeçalhos; toda resposta leva Allow-Origin *; GET 405", async () => {
  const s = cenario();
  const r = await enviar(new Request(`${FN}/nx-enviar`, { method: "OPTIONS" }), ENV, s.deps());
  assert.equal(r.status, 204);
  for (const [k, v] of Object.entries(CORS)) assert.equal(r.headers.get(k), v);
  assert.equal(r.headers.get("access-control-allow-headers"), "content-type, apikey, x-client-info");
  const ruim = await enviar(painel("nx-enviar", { acao: "texto", conversa: 601, texto: "x" }, "tok-errado"), ENV, s.deps());
  assert.equal(ruim.status, 401);
  assert.equal(ruim.headers.get("access-control-allow-origin"), "*");
  assert.deepEqual(await ruim.json(), { ok: false, erro: "sessao_invalida" });
  assert.equal((await enviar(new Request(`${FN}/nx-enviar`), ENV, s.deps())).status, 405);
  for (const fn of [midia, nxIa]) assert.equal((await fn(new Request(`${FN}/x`, { method: "OPTIONS" }), ENV, s.deps())).status, 204);
});

test("nx-enviar texto: envia pelo canal DA conversa para o wa_id, grava a saída e devolve a Mensagem", async () => {
  const s = cenario();
  const r = await ler(await enviar(painel("nx-enviar", { acao: "texto", conversa: 601, texto: "  Custa R$ 500.  ", responde_a: "wamid.IN-701" }), ENV, s.deps()));
  assert.equal(r.status, 200);
  assert.equal(r.corpo.ok, true);
  const [g] = graphMsgs(s);
  assert.equal(g.pid, "111");
  assert.equal(g.token, "tok-a1");
  assert.equal(g.to, "5512988887777");
  assert.deepEqual(g.text, { body: "Custa R$ 500.", preview_url: true });
  assert.deepEqual(g.context, { message_id: "wamid.IN-701" });
  assert.equal(g.recipient_type, "individual");
  assert.equal(r.corpo.mensagem.status, "enviada");
  assert.equal(r.corpo.mensagem.enviado_por.nome, "Ana Admin");
  const [saida] = s.rpcs("nx_cv_saida");
  assert.equal(saida.params.p_conta, ADM_A);
  assert.equal(saida.params.p_msg.wamid, g.id);
  assert.equal(saida.params.p_msg.responde_a_wamid, "wamid.IN-701");
  // citação de mensagem de OUTRO cliente é ignorada (não vai para a Graph)
  await enviar(painel("nx-enviar", { acao: "texto", conversa: 601, texto: "oi", responde_a: "wamid.IN-703" }), ENV, s.deps());
  assert.equal(graphMsgs(s)[1].context, undefined);
  // assinatura do atendente (cfg.cv.assinatura)
  s.tab("nx_clientes").find(c => c.id === CLI_A).cfg.cv = { assinatura: true };
  await enviar(painel("nx-enviar", { acao: "texto", conversa: 601, texto: "Olá" }), ENV, s.deps());
  assert.equal(graphMsgs(s)[2].text.body, "*Ana:*\nOlá");
  // texto vazio / grande demais → dados_invalidos sem Graph
  const n = s.estado.graph.length;
  assert.equal((await ler(await enviar(painel("nx-enviar", { acao: "texto", conversa: 601, texto: "   " }), ENV, s.deps()))).corpo.erro, "dados_invalidos");
  assert.equal((await ler(await enviar(painel("nx-enviar", { acao: "texto", conversa: 601, texto: "x".repeat(4097) }), ENV, s.deps()))).corpo.erro, "dados_invalidos");
  assert.equal(s.estado.graph.length, n);
});

/** Canal K_A1 vira um aparelho CodeWords pareado (modo padrão de envio: proxy do device manager). */
const SEG_CW = "c".repeat(64);
function canalAparelho(s) {
  const k = s.tab("nx_canais").find(x => x.id === K_A1);
  Object.assign(k, { provedor: "codewords", codewords_api_key: "cwk-falsa-1234", codewords_phone_id: "dev-a1", codewords_numero: "+5512900001111",
                     codewords_numero_conferido: true, codewords_conferido_em: s.estado.agora.toISOString(), segredo_teste: SEG_CW });
  return k;
}
const envioProxy = s => s.estado.codewords.filter(x => x.caminho === "/proxy/send/message");

test("nx-enviar CodeWords (aparelho): sucesso pelo proxy — form-urlencoded, chave crua, phone_id, sem janela de 24 h; a IA pausa", async () => {
  const s = cenario();
  canalAparelho(s);
  const r = await ler(await enviar(painel("nx-enviar", { acao: "texto", conversa: 602, texto: "Olá pelo aparelho" }), ENV, s.deps()));   // 602: SEM janela da Meta
  assert.equal(r.status, 200);
  assert.equal(r.corpo.ok, true);
  assert.equal(envioProxy(s).length, 1);
  const [x] = envioProxy(s);
  assert.equal(x.auth, "cwk-falsa-1234", "chave crua, sem Bearer");
  assert.equal(x.tipo, "application/x-www-form-urlencoded");
  assert.equal(x.phone_id, "dev-a1");
  assert.equal(x.form.message, "Olá pelo aparelho");
  assert.match(x.form.phone, /^55\d{10,11}$/);
  assert.equal(s.estado.graph.length, 0, "nada vai para a Graph");
  assert.equal(r.corpo.mensagem.status, "enviada");
  assert.equal(s.rpcs("nx_cv_saida")[0].params.p_msg.wamid, `cw:${K_A1}:3EB0DEFAULT`);
  assert.equal(s.tab("nx_mensagens").filter(m => m.wamid === `cw:${K_A1}:3EB0DEFAULT`).length, 1);
  assert.equal(s.rpcs("nx_cv_ia_pausa_auto").length, 1, "resposta de atendente pausa a IA");
});

test("nx-enviar CodeWords (aparelho): HTTP 200 com skip/error/failed é FALHA gravada com o motivo, não sucesso", async () => {
  const s = cenario();
  canalAparelho(s);
  s.estado.codewordsHandler = () => jsonResp({ status: "skip", message: "Own message or empty" });
  const r = await ler(await enviar(painel("nx-enviar", { acao: "texto", conversa: 601, texto: "Olá" }), ENV, s.deps()));
  assert.equal(r.corpo.ok, false);
  assert.equal(r.corpo.erro, "envio_falhou");
  assert.equal(r.corpo.mensagem.status, "falhou");
  assert.match(r.corpo.mensagem.erro, /own message or empty/i);
  assert.equal(envioProxy(s).length, 1);
  assert.equal(s.rpcs("nx_cv_ia_pausa_auto").length, 0, "falha certa não pausa a IA");
});

test("nx-enviar CodeWords (aparelho): timeout/5xx é AMBÍGUO — nunca reenvia sozinho, nunca grava 'falhou'; fica pendente com id provisório", async () => {
  for (const resposta of [() => jsonResp({ error: "resposta perdida" }, 503), () => { throw new Error("timeout"); }]) {
    const s = cenario();
    canalAparelho(s);
    s.estado.codewordsHandler = resposta;
    const r = await ler(await enviar(painel("nx-enviar", { acao: "texto", conversa: 601, texto: "Olá" }), ENV, s.deps()));
    assert.equal(r.corpo.ambigua, true);
    assert.match(r.corpo.aviso, /pode ter saído/);
    assert.equal(envioProxy(s).length, 1, "uma tentativa só: sem reenvio automático");
    const saidas = s.rpcs("nx_cv_saida");
    assert.equal(saidas.length, 1);
    assert.equal(saidas[0].params.p_msg.status, "pendente", "em dúvida: pendente, NUNCA falhou");
    assert.match(saidas[0].params.p_msg.wamid, new RegExp(`^cw:${K_A1}:orbita-p-[0-9a-f]{32}$`), "id provisório: a sincronização adota a gêmea");
    assert.equal(s.tab("nx_mensagens").filter(m => m.direcao === "out" && m.corpo === "Olá" && m.status === "falhou").length, 0);
    assert.equal(s.rpcs("nx_cv_ia_pausa_auto").length, 1, "pode ter saído: a IA não responde por cima");
  }
});

test("nx-enviar CodeWords (aparelho): número do aparelho diferente do canal → nada sai (falha certa, sem pendente)", async () => {
  const s = cenario();
  const k = canalAparelho(s);
  Object.assign(k, { codewords_numero: "+5512999990000", codewords_numero_conferido: null, codewords_conferido_em: null });
  const r = await ler(await enviar(painel("nx-enviar", { acao: "texto", conversa: 601, texto: "Olá" }), ENV, s.deps()));
  assert.equal(r.corpo.ok, false);
  assert.equal(r.corpo.mensagem.status, "falhou");
  assert.match(r.corpo.mensagem.erro, /não é o número deste canal/);
  assert.equal(envioProxy(s).length, 0);
});

test("nx-enviar CodeWords (aparelho): sem chave ou sem aparelho pareado → 400 antes de qualquer chamada", async () => {
  const s = cenario();
  const k = canalAparelho(s);
  k.codewords_phone_id = null;
  let r = await ler(await enviar(painel("nx-enviar", { acao: "texto", conversa: 601, texto: "Olá" }), ENV, s.deps()));
  assert.equal(r.status, 400); assert.equal(r.corpo.erro, "codewords_sem_aparelho");
  k.codewords_phone_id = "dev-a1"; k.codewords_api_key = null;
  r = await ler(await enviar(painel("nx-enviar", { acao: "texto", conversa: 601, texto: "Olá" }), ENV, s.deps()));
  assert.equal(r.status, 400); assert.equal(r.corpo.erro, "codewords_sem_credencial");
  assert.equal(s.estado.codewords.length, 0);
});

test("nx-enviar CodeWords (aparelho): entregue/lida chegam por recibo do aparelho (nx-codewords status) e casam com a saída pelo id; a resposta do envio não finge entrega", async () => {
  const s = cenario();
  canalAparelho(s);
  const ids = ["3EB0RECIBO1", "3EB0RECIBO2"];
  // mesmo que o proxy diga "delivered" no corpo do 200, a saída nasce 'enviada': entrega e leitura só por recibo do aparelho
  s.estado.codewordsHandler = () => jsonResp({ code: "SUCCESS", results: { message_id: ids.shift(), status: "delivered" } });
  const a = await ler(await enviar(painel("nx-enviar", { acao: "texto", conversa: 601, texto: "Recebida" }), ENV, s.deps()));
  const b = await ler(await enviar(painel("nx-enviar", { acao: "texto", conversa: 601, texto: "Lida" }), ENV, s.deps()));
  assert.deepEqual([a.status, b.status], [200, 200]);
  assert.deepEqual(s.rpcs("nx_cv_saida").map(x => x.params.p_msg.status), ["enviada", "enviada"]);
  const recibo = (message_id, status) => tratarAgente(new Request(`${FN}/nx-codewords?ch=${SEG_CW}`, {
    method: "POST", headers: { "content-type": "application/json" }, body: JSON.stringify({ acao: "status", message_id, status }) }), ENV, s.deps());
  assert.equal((await ler(await recibo("3EB0RECIBO1", "delivered"))).corpo.ok, true);
  assert.equal((await ler(await recibo("3EB0RECIBO2", "read"))).corpo.ok, true);
  assert.equal((await ler(await recibo("3EB0RECIBO1", "sent"))).corpo.ok, true);   // atrasado: não regride
  const saidas = s.tab("nx_mensagens").filter(m => m.direcao === "out" && m.conversa_id === 601).slice(-2);
  assert.deepEqual(saidas.map(m => m.status), ["entregue", "lida"]);
});

test("nx-enviar CodeWords (aparelho, fila): envio ambíguo NUNCA volta para a fila; grava pendente e conclui o item sem reenviar", async () => {
  const s = cenario();
  canalAparelho(s);
  s.estado.codewordsHandler = () => jsonResp({ error: "x" }, 502);
  const item = {
    id: 9001, cliente_id: CLI_A, canal_id: K_A1, conversa_id: 601, tipo: "texto", texto: "Lembrete", origem: "automacao", janela_aberta: false,
    conversa: { id: 601 }, contato: { wa_id: "5512988887777", telefone: "5512988887777", bloqueado: false },
  };
  const concluidos = [];
  const db = criarDb(ENV, s.fetch);
  const rpc = db.rpc.bind(db);
  let pegou = false;
  db.rpc = async (nome, p) => {
    if (nome === "nx_fila_pegar") { if (pegou) return []; pegou = true; return [item]; }
    if (nome === "nx_fila_concluir") { concluidos.push(p); return null; }
    return rpc(nome, p);
  };
  const res = await enviarFila(db, { ids: [9001] }, { fetch: s.fetch });
  assert.equal(envioProxy(s).length, 1, "não tenta de novo");
  assert.equal(res.falhou, 1);
  assert.equal(concluidos.length, 1);
  assert.notEqual(concluidos[0].p_status, "pendente", "o item não volta para a fila (reenviaria)");
  assert.match(concluidos[0].p_erro, /não reenviado automaticamente/);
  assert.equal(s.rpcs("nx_cv_saida")[0].params.p_msg.status, "pendente");
});

test("nx-enviar CodeWords (aparelho): o aparelho aceitou e o BANCO falhou ao gravar → 502 ambíguo (não 500), sem reenvio, IA pausada", async () => {
  const s = cenario();
  canalAparelho(s);
  const falhaNoBanco = (entrada, init) => {
    const req = new Request(entrada, init);
    if (new URL(req.url).pathname.endsWith("/rpc/nx_cv_saida")) return Promise.resolve(jsonResp({ code: "XX000", message: "banco indisponível" }, 500));
    return s.fetch(entrada, init);
  };
  const r = await ler(await enviar(painel("nx-enviar", { acao: "texto", conversa: 601, texto: "Olá" }), ENV, s.deps({ fetch: falhaNoBanco })));
  assert.equal(r.status, 502);
  assert.equal(r.corpo.ok, false);
  assert.equal(r.corpo.erro, "envio_falhou");
  assert.equal(r.corpo.ambigua, true, "o painel avisa que pode ter saído (não oferece 'erro interno' para clicar de novo)");
  assert.match(r.corpo.detalhe, /pode ter saído/);
  assert.equal(envioProxy(s).length, 1);
  assert.equal(s.rpcs("nx_cv_ia_pausa_auto").length, 1, "atendente respondeu: a IA não responde por cima");
});

test("nx-enviar CodeWords (aparelho): HTTP 408/425 do gateway é AMBÍGUO como o 5xx (pendente, nunca 'falhou')", async () => {
  for (const status of [408, 425]) {
    const s = cenario();
    canalAparelho(s);
    s.estado.codewordsHandler = () => jsonResp({ error: "gateway" }, status);
    const r = await ler(await enviar(painel("nx-enviar", { acao: "texto", conversa: 601, texto: "Olá" }), ENV, s.deps()));
    assert.equal(r.corpo.ambigua, true, `HTTP ${status}`);
    assert.equal(s.rpcs("nx_cv_saida")[0].params.p_msg.status, "pendente");
    assert.equal(envioProxy(s).length, 1);
  }
});

/* ------------------------------------------------------------ mídia pelo aparelho (foto, áudio, vídeo, documento) */
const envioMidiaProxy = s => s.estado.codewords.filter(x => /^\/proxy\/send\/(image|audio|file)$/.test(x.caminho));
const PDF = new Uint8Array([37, 80, 68, 70, 45, 49, 46, 55]);   // "%PDF-1.7"
/** Põe o arquivo no bucket falso (pasta out/ do cliente A) e devolve o path. */
function arquivoOut(s, ext, mime, bytes = PDF) {
  const path = `${CLI_A}/out/2026-09/${crypto.randomUUID()}.${ext}`;
  s.estado.arquivos.set(path, { bytes, mime });
  return path;
}
const midiaCW = (s, corpo, deps) => enviar(painel("nx-enviar", { acao: "midia", ...corpo }), ENV, s.deps(deps)).then(ler);

test("nx-enviar mídia CodeWords: baixa do Storage e manda os BYTES pelo proxy certo (send/image, send/audio, send/file); grava a saída enviada com a mídia; a IA pausa", async () => {
  const casos = [
    ["jpg", "image/jpeg", "foto.jpg", "Olha a foto", "/proxy/send/image", "image", "imagem", "Olha a foto"],
    ["wav", "audio/wav", "audio-orbita-1790000000000.wav", "legenda ignorada", "/proxy/send/audio", "audio", "audio", null],
    ["ogg", "audio/ogg; codecs=opus", "voz.ogg", undefined, "/proxy/send/audio", "audio", "audio", null],
    ["mp4", "video/mp4", "video.mp4", "Segue o vídeo", "/proxy/send/file", "file", "video", "Segue o vídeo"],
    ["pdf", "application/pdf", "orcamento.pdf", "Seu orçamento", "/proxy/send/file", "file", "documento", "Seu orçamento"],
  ];
  for (const [ext, mime, nome, legenda, caminho, campo, tipoMsg, corpoMsg] of casos) {
    const s = cenario();
    canalAparelho(s);
    const path = arquivoOut(s, ext, mime.split(";")[0]);
    const nGraph = s.estado.graph.length;
    const r = await midiaCW(s, { conversa: 601, path, mime, nome, legenda, tamanho: PDF.length });
    assert.equal(r.status, 200, ext); assert.equal(r.corpo.ok, true, ext);
    // baixou pela URL assinada (sem apikey) antes de falar com o aparelho
    const iBaixar = s.estado.log.indexOf(`GET fake.supabase.co/storage/v1/object/sign/nx-midia/${path}`);
    const iProxy = s.estado.log.findIndex(l => l.includes("/proxy/send/"));
    assert.ok(iBaixar >= 0 && iBaixar < iProxy, "baixa do Storage antes do proxy");
    assert.equal(envioMidiaProxy(s).length, 1, "uma chamada ao proxy");
    const [x] = envioMidiaProxy(s);
    assert.equal(x.caminho, caminho, ext); assert.equal(x.metodo, "POST"); assert.equal(x.phone_id, "dev-a1");
    assert.equal(x.auth, "cwk-falsa-1234", "chave crua, sem Bearer");
    assert.match(x.tipo, /^multipart\/form-data; boundary=/);
    assert.deepEqual(x.multipart.campos, corpoMsg ? { phone: "5512988887777", caption: corpoMsg } : { phone: "5512988887777" }, `${ext}: áudio sem legenda`);
    assert.equal(x.multipart.arquivo.campo, campo, ext);
    assert.equal(x.multipart.arquivo.nome, nome); assert.equal(x.multipart.arquivo.mime, mime.split(";")[0]);
    assert.deepEqual([...x.multipart.arquivo.bytes], [...PDF], "os bytes do Storage chegam inteiros ao aparelho");
    assert.equal(s.estado.graph.length, nGraph, "nada vai para a Graph");
    // saída gravada
    const [saida] = s.rpcs("nx_cv_saida");
    assert.equal(saida.params.p_msg.status, "enviada"); assert.equal(saida.params.p_msg.wamid, `cw:${K_A1}:3EB0DEFAULT`);
    assert.equal(saida.params.p_msg.tipo, tipoMsg); assert.equal(saida.params.p_msg.corpo, corpoMsg);
    assert.equal(saida.params.p_msg.responde_a_wamid, null);
    assert.deepEqual(saida.params.p_msg.midia, { path, mime: mime.split(";")[0], nome, tamanho: PDF.length, estado: "ok" });
    assert.equal(r.corpo.mensagem.status, "enviada"); assert.equal(r.corpo.mensagem.tipo, tipoMsg);
    assert.equal(r.corpo.mensagem.midia.path, path);
    assert.equal(s.rpcs("nx_cv_ia_pausa_auto").length, 1, "resposta de atendente pausa a IA");
  }
});

test("nx-enviar mídia CodeWords: SEM janela de 24 h e sem citação (responde_a é ignorado); conversa resolvida continua barrada", async () => {
  const s = cenario();
  canalAparelho(s);
  const path = arquivoOut(s, "pdf", "application/pdf");
  // 602: a última mensagem do cliente tem mais de 24 h (num canal Meta daria fora_da_janela)
  const r = await midiaCW(s, { conversa: 602, path, mime: "application/pdf", nome: "orcamento.pdf", responde_a: "wamid.IN-701" });
  assert.equal(r.status, 200); assert.equal(r.corpo.ok, true);
  assert.equal(envioMidiaProxy(s).length, 1);
  assert.deepEqual(Object.keys(envioMidiaProxy(s)[0].multipart.campos), ["phone"], "nada de citação no multipart");
  assert.equal(s.rpcs("nx_cv_saida")[0].params.p_msg.responde_a_wamid, null);
  assert.equal(s.estado.log.some(l => l.endsWith("/rest/v1/nx_mensagens")), false, "nem consulta a mensagem citada");
  // resolvida: barrada antes do Storage e do aparelho
  s.tab("nx_conversas").find(c => c.id === 602).status = "resolvida";
  const st = s.estado.storage.length;
  const res = await midiaCW(s, { conversa: 602, path, mime: "application/pdf" });
  assert.equal(res.status, 400); assert.equal(res.corpo.erro, "conversa_resolvida");
  assert.equal(s.estado.storage.length, st); assert.equal(envioMidiaProxy(s).length, 1);
});

test("nx-enviar mídia CodeWords: recusa do aparelho (HTTP 200 com erro, 401, 404) → envio_falhou com o motivo em português e a saída gravada 'falhou' (com a mídia)", async () => {
  const casos = [
    [() => jsonResp({ status: "skip", message: "Own message or empty" }), /own message or empty/i],
    [() => jsonResp({ code: "error", message: "file too big" }), /não entregou: file too big/],
    [() => jsonResp({ message: "Unauthorized" }, 401), /recusou a chave/],
    [() => jsonResp({ message: "No connection found" }, 404), /não achou o aparelho/],
  ];
  for (const [resposta, re] of casos) {
    const s = cenario();
    canalAparelho(s);
    s.estado.codewordsHandler = resposta;
    const path = arquivoOut(s, "jpg", "image/jpeg");
    const r = await midiaCW(s, { conversa: 601, path, mime: "image/jpeg", nome: "foto.jpg", legenda: "Olha" });
    assert.equal(r.status, 200);
    assert.equal(r.corpo.ok, false); assert.equal(r.corpo.erro, "envio_falhou");
    assert.match(r.corpo.detalhe, re);
    assert.equal(r.corpo.mensagem.status, "falhou"); assert.match(r.corpo.mensagem.erro, re);
    assert.equal(r.corpo.mensagem.tipo, "imagem"); assert.equal(r.corpo.mensagem.midia.path, path);
    assert.equal(s.rpcs("nx_cv_saida")[0].params.p_msg.wamid, null, "falha certa não ganha id");
    assert.equal(envioMidiaProxy(s).length, 1, "uma tentativa só");
    assert.equal(s.rpcs("nx_cv_ia_pausa_auto").length, 0, "falha certa não pausa a IA");
    assert.ok(!JSON.stringify(r.corpo).includes("cwk-falsa"), "a chave nunca volta");
  }
});

test("nx-enviar mídia CodeWords: timeout/5xx/408 é AMBÍGUO — ok:true + ambigua + aviso, saída 'pendente' com id provisório, NUNCA reenvia sozinho", async () => {
  for (const resposta of [() => jsonResp({ error: "resposta perdida" }, 503), () => jsonResp({ error: "gateway" }, 408), () => { throw new Error("timeout"); },
    () => new Response("<html>ok</html>", { status: 200 })]) {
    const s = cenario();
    canalAparelho(s);
    s.estado.codewordsHandler = resposta;
    const path = arquivoOut(s, "wav", "audio/wav");
    const r = await midiaCW(s, { conversa: 601, path, mime: "audio/wav", nome: "audio-orbita-1.wav" });
    assert.equal(r.status, 200); assert.equal(r.corpo.ok, true); assert.equal(r.corpo.ambigua, true);
    assert.match(r.corpo.aviso, /pode ter saído/);
    assert.equal(envioMidiaProxy(s).length, 1, "uma tentativa só: sem reenvio automático");
    const saidas = s.rpcs("nx_cv_saida");
    assert.equal(saidas.length, 1);
    assert.equal(saidas[0].params.p_msg.status, "pendente", "em dúvida: pendente, NUNCA falhou");
    assert.match(saidas[0].params.p_msg.wamid, new RegExp(`^cw:${K_A1}:orbita-p-[0-9a-f]{32}$`), "id provisório, como no texto");
    assert.equal(saidas[0].params.p_msg.tipo, "audio"); assert.equal(saidas[0].params.p_msg.midia.path, path);
    assert.equal(r.corpo.mensagem.status, "pendente");
    assert.equal(s.rpcs("nx_cv_ia_pausa_auto").length, 1, "pode ter saído: a IA não responde por cima");
  }
});

test("nx-enviar mídia CodeWords: número do aparelho diferente do canal → nada sai (falha certa gravada); sem aparelho/chave → 400 antes do Storage", async () => {
  let s = cenario();
  let k = canalAparelho(s);
  Object.assign(k, { codewords_numero: "+5512999990000", codewords_numero_conferido: null, codewords_conferido_em: null });
  const path = arquivoOut(s, "pdf", "application/pdf");
  let r = await midiaCW(s, { conversa: 601, path, mime: "application/pdf", nome: "a.pdf" });
  assert.equal(r.corpo.ok, false); assert.equal(r.corpo.erro, "envio_falhou");
  assert.equal(r.corpo.mensagem.status, "falhou"); assert.match(r.corpo.mensagem.erro, /não é o número deste canal/);
  assert.equal(envioMidiaProxy(s).length, 0);
  s = cenario();
  k = canalAparelho(s);
  k.codewords_phone_id = null;
  const p2 = arquivoOut(s, "pdf", "application/pdf");
  r = await midiaCW(s, { conversa: 601, path: p2, mime: "application/pdf" });
  assert.equal(r.status, 400); assert.equal(r.corpo.erro, "codewords_sem_aparelho");
  k.codewords_phone_id = "dev-a1"; k.codewords_api_key = null;
  r = await midiaCW(s, { conversa: 601, path: p2, mime: "application/pdf" });
  assert.equal(r.status, 400); assert.equal(r.corpo.erro, "codewords_sem_credencial");
  assert.equal(s.estado.codewords.length, 0); assert.equal(s.estado.storage.length, 0, "nada assinado nem baixado");
});

test("nx-enviar mídia CodeWords: arquivo que não baixa, vazio ou acima de 16 MB para ANTES do aparelho e solta a reserva do client_ref — o mesmo ref envia depois", async () => {
  const s = cenario();
  canalAparelho(s);
  const path = `${CLI_A}/out/2026-09/11111111-2222-4333-8444-555555555557.pdf`;
  const pedir = () => midiaCW(s, { conversa: 601, path, mime: "application/pdf", nome: "orcamento.pdf", client_ref: REF1 });
  const semReserva = () => assert.equal(s.tab("nx_envio_refs").length, 0, "nada saiu: reserva solta");
  // 1. ainda não está no Storage (não assina)
  let r = await pedir();
  assert.equal(r.status, 404); assert.equal(r.corpo.erro, "midia_nao_encontrada"); semReserva();
  // 2. assinou, mas o download falha (Storage fora do ar / rede)
  s.estado.arquivos.set(path, { bytes: PDF, mime: "application/pdf" });
  for (const falha of [() => jsonResp({ message: "indisponível" }, 503), () => { throw new Error("socket hang up"); }]) {
    s.estado.downloadHandler = falha;
    r = await pedir();
    assert.equal(r.status, 404); assert.equal(r.corpo.erro, "midia_nao_encontrada"); semReserva();
  }
  // 3. arquivo vazio (o upload não terminou)
  s.estado.downloadHandler = () => new Response(new Uint8Array(0), { status: 200 });
  r = await pedir();
  assert.equal(r.status, 404); assert.equal(r.corpo.erro, "midia_nao_encontrada"); semReserva();
  // 4. acima de 16 MB: pelo Content-Length declarado e pelo tamanho real (resposta sem Content-Length)
  s.estado.downloadHandler = () => new Response(new Uint8Array(8), { status: 200, headers: { "content-length": String(16 * 1024 * 1024 + 1) } });
  r = await pedir();
  assert.equal(r.status, 400); assert.equal(r.corpo.erro, "midia_grande"); semReserva();
  let partesLidas = 0, cancelado = false;
  s.estado.downloadHandler = () => new Response(new ReadableStream({
    pull(c) {
      partesLidas++;
      if (partesLidas === 1) c.enqueue(new Uint8Array(10 * 1024 * 1024));
      else if (partesLidas === 2) c.enqueue(new Uint8Array(7 * 1024 * 1024));
      else { c.enqueue(new Uint8Array(1)); c.close(); }
    },
    cancel() { cancelado = true; },
  }, { highWaterMark: 0 }), { status: 200 });
  r = await pedir();
  assert.equal(r.status, 400); assert.equal(r.corpo.erro, "midia_grande"); semReserva();
  assert.equal(partesLidas, 2, "o leitor para assim que cruza o teto, sem baixar o resto");
  assert.equal(cancelado, true, "a resposta excedente é cancelada");
  assert.equal(s.estado.codewords.filter(x => x.caminho.startsWith("/proxy/")).length, 0, "o aparelho nunca foi chamado");
  assert.equal(s.rpcs("nx_cv_saida").length, 0, "nenhuma saída gravada");
  assert.equal(s.rpcs("nx_cv_ref_liberar").length, 6, "cada recusa soltou a reserva");
  // 5. resolvido o problema, o MESMO client_ref envia (uma vez só)
  s.estado.downloadHandler = null;
  r = await pedir();
  assert.equal(r.status, 200); assert.equal(r.corpo.ok, true); assert.equal(r.corpo.repetida, undefined);
  assert.equal(envioMidiaProxy(s).length, 1);
  const de_novo = await pedir();
  assert.equal(de_novo.corpo.repetida, true); assert.equal(de_novo.corpo.mensagem.id, r.corpo.mensagem.id);
  assert.equal(envioMidiaProxy(s).length, 1, "a repetição não manda o arquivo outra vez");
});

test("nx-enviar mídia CodeWords: dois pedidos simultâneos com o mesmo client_ref → um arquivo só; saída em dúvida repete como ambígua, sem 2ª ordem ao aparelho", async () => {
  const s = cenario();
  canalAparelho(s);
  const path = arquivoOut(s, "jpg", "image/jpeg");
  const pedir = ref => midiaCW(s, { conversa: 601, path, mime: "image/jpeg", nome: "foto.jpg", client_ref: ref });
  const [a, b] = await Promise.all([pedir(REF1), pedir(REF1)]);
  assert.deepEqual([a.status, b.status].sort(), [200, 409], "simultâneos: um envia, o outro espera");
  assert.equal(envioMidiaProxy(s).length, 1, "o cliente recebe UMA foto");
  s.estado.codewordsHandler = () => jsonResp({ error: "gateway" }, 504);
  const c = await pedir(REF2);
  assert.equal(c.corpo.ambigua, true);
  const d = await pedir(REF2);
  assert.equal(d.corpo.ok, true); assert.equal(d.corpo.ambigua, true); assert.equal(d.corpo.repetida, true);
  assert.equal(d.corpo.mensagem.id, c.corpo.mensagem.id);
  assert.equal(envioMidiaProxy(s).length, 2, "o aparelho não recebeu uma 2ª ordem para o mesmo ref");
});

test("nx-enviar mídia: áudio WAV só existe no canal CodeWords — em canal Meta é midia_tipo ANTES de reservar, assinar ou enviar; o resto do canal Meta segue igual", async () => {
  const s = cenario();
  const wav = arquivoOut(s, "wav", "audio/wav");
  for (const mime of ["audio/wav", "audio/x-wav", "AUDIO/WAV; codecs=1"]) {
    const r = await midiaCW(s, { conversa: 601, path: wav, mime, nome: "audio-orbita-1.wav", client_ref: REF1 });
    assert.equal(r.status, 400, mime); assert.equal(r.corpo.erro, "midia_tipo", mime);
  }
  assert.equal(s.rpcs("nx_cv_ref_reservar").length, 0, "recusado antes da reserva");
  assert.equal(s.estado.storage.length, 0, "nada assinado nem baixado");
  assert.equal(s.estado.graph.length, 0, "o WAV nunca chega à Graph");
  assert.equal(s.rpcs("nx_cv_saida").length, 0);
  // o nx-midia aceita subir WAV (o canal só é conhecido na hora de enviar); apelido audio/x-wav → .wav
  for (const mime of ["audio/wav", "audio/x-wav"]) {
    const up = await ler(await midia(painel("nx-midia", { acao: "subir", nome: "audio-orbita-1.wav", mime, tamanho: 32000 }), ENV, s.deps()));
    assert.equal(up.corpo.ok, true, mime);
    assert.match(up.corpo.path, new RegExp(`^${CLI_A}/out/2026-09/[0-9a-f-]{36}\\.wav$`), mime);
  }
  assert.equal((await ler(await midia(painel("nx-midia", { acao: "subir", mime: "audio/wav", tamanho: 17 * 1024 * 1024 }), ENV, s.deps()))).corpo.erro, "midia_grande", "WAV até 16 MB");
  assert.deepEqual(tipoAceito("audio/wav"), { ext: "wav", max: 16 * 1024 * 1024, grupo: "audio" });
  assert.deepEqual(tipoAceito("audio/x-wav"), tipoAceito("audio/wav"));
  assert.equal(soAparelho("audio/x-wav; rate=16000"), true); assert.equal(soAparelho("audio/ogg"), false);
  assert.equal(tipoGraph("audio/wav"), null, "a Graph não tem tipo para WAV");
  assert.equal(tipoGraph("audio/ogg"), "audio"); assert.equal(tipoGraph("application/pdf"), "document");
  assert.equal(extensaoDe("audio/x-wav"), "wav");
  // canal Meta com os tipos de sempre: link assinado para a Graph, janela de 24 h exigida, nada baixado, nada no aparelho
  const pdf = arquivoOut(s, "pdf", "application/pdf");
  const ok = await midiaCW(s, { conversa: 601, path: pdf, mime: "application/pdf", nome: "orcamento.pdf", legenda: "Seu orçamento" });
  assert.equal(ok.corpo.ok, true);
  assert.equal(graphMsgs(s)[0].document.link, `${SUPA}/storage/v1/object/sign/nx-midia/${pdf}?token=ler-3600`);
  assert.equal(s.estado.storage.some(l => l.startsWith("GET ")), false, "canal Meta não baixa o arquivo: manda o link");
  assert.equal(s.estado.codewords.length, 0);
  assert.equal(s.rpcs("nx_cv_saida")[0].params.p_msg.wamid, "wamid.OUT-1");
  const fora = await midiaCW(s, { conversa: 602, path: pdf, mime: "application/pdf" });
  assert.equal(fora.status, 400); assert.equal(fora.corpo.erro, "fora_da_janela", "a janela de 24 h continua valendo no canal Meta");
});

test("nx-enviar CodeWords: modelo da Meta continua recusado no aparelho (codewords_tipo_nao_suportado) e a fila automática continua só texto", async () => {
  const s = cenario();
  canalAparelho(s);
  const TPL = "7e7e7e7e-0000-4000-8000-000000000001";
  s.tab("nx_templates").find(t => t.id === "tpl-conf").id = TPL;
  const r = await ler(await enviar(painel("nx-enviar", { acao: "template", conversa: 601, template_id: TPL, parametros: ["João", "amanhã às 14h"], client_ref: REF1 }), ENV, s.deps()));
  assert.equal(r.status, 400); assert.equal(r.corpo.erro, "codewords_tipo_nao_suportado");
  assert.equal(s.tab("nx_envio_refs").length, 0, "recusado antes do canal: reserva solta");
  assert.equal(s.estado.codewords.filter(x => x.caminho.startsWith("/proxy/")).length, 0);
  const fonte = readFileSync(join(RAIZ, "supabase/functions/_compartilhado/enviar.js"), "utf8");
  const fila = fonte.slice(fonte.indexOf("async function enviarItem"), fonte.indexOf("export async function pegarLote"));
  assert.ok(!/enviarMidiaCodeWords|enviarMidiaCanal/.test(fila), "a fila (automações) não envia mídia");
  assert.match(fila, /só envia texto/);
});

test("nx-enviar: o modo workflow/Runtime API (service_id, /run/) foi removido do envio — só o aparelho; client_ref é a IDEMPOTÊNCIA do painel (M36), não um workflow", () => {
  const sem = f => readFileSync(join(RAIZ, "supabase/functions/_compartilhado", f), "utf8").replace(/\/\*[\s\S]*?\*\//g, "").replace(/^\s*\/\/.*$/gm, "");
  for (const f of ["enviar.js", "codewords.js"]) assert.ok(!/\/run\/\$\{/.test(sem(f)), `${f} sem envio por workflow`);
  assert.ok(!/clientRef/.test(sem("codewords.js")) && !/client_ref/.test(sem("codewords.js")), "o aparelho do CodeWords não sabe de client_ref");
  assert.ok(!/codewords_service_id/.test(sem("enviar.js")), "nx-enviar não escolhe caminho por service_id");
  assert.match(sem("enviar.js"), /nx_cv_ref_reservar/, "o envio RESERVA o client_ref ANTES de falar com a Meta/CodeWords");
  assert.match(sem("enviar.js"), /nx_cv_ref_ver/, "sem a reserva no banco, sobra a conferência antiga");
});

/* ============================================================ M36 — envio idempotente por client_ref */
const REF1 = "orbita:5c1b0d3e-0000-4000-8000-000000000001", REF2 = "orbita:5c1b0d3e-0000-4000-8000-000000000002";

test("M36 nx-enviar: o MESMO client_ref duas vezes = 1 mensagem e 1 chamada externa (a 2ª devolve a gravada, repetida:true)", async () => {
  const s = cenario();
  const a = await ler(await enviar(painel("nx-enviar", { acao: "texto", conversa: 601, texto: "Custa R$ 500.", client_ref: REF1 }), ENV, s.deps()));
  const b = await ler(await enviar(painel("nx-enviar", { acao: "texto", conversa: 601, texto: "Custa R$ 500.", client_ref: REF1 }), ENV, s.deps()));
  assert.equal(a.corpo.ok, true); assert.equal(b.corpo.ok, true);
  assert.equal(graphMsgs(s).length, 1, "uma só chamada à Graph");
  assert.equal(s.rpcs("nx_cv_saida").length, 1, "uma só saída gravada");
  assert.equal(b.corpo.repetida, true);
  assert.equal(b.corpo.mensagem.id, a.corpo.mensagem.id, "devolve a MESMA mensagem");
  assert.equal(s.tab("nx_mensagens").filter(m => m.client_ref === REF1).length, 1);
  assert.equal(a.corpo.repetida, undefined, "a 1ª não é repetição");
});

test("M36 nx-enviar: outro client_ref é outra intenção; sem client_ref tudo segue como antes", async () => {
  const s = cenario();
  await enviar(painel("nx-enviar", { acao: "texto", conversa: 601, texto: "um", client_ref: REF1 }), ENV, s.deps());
  await enviar(painel("nx-enviar", { acao: "texto", conversa: 601, texto: "dois", client_ref: REF2 }), ENV, s.deps());
  await enviar(painel("nx-enviar", { acao: "texto", conversa: 601, texto: "tres" }), ENV, s.deps());
  await enviar(painel("nx-enviar", { acao: "texto", conversa: 601, texto: "quatro" }), ENV, s.deps());
  assert.equal(graphMsgs(s).length, 4);
  assert.equal(s.rpcs("nx_cv_saida").length, 4);
  assert.equal(s.rpcs("nx_cv_ref_reservar").length, 2, "só reserva quando há client_ref");
  assert.equal(s.rpcs("nx_cv_ref_ver").length, 0, "com a reserva no banco, a conferência antiga não é usada");
  assert.equal(s.rpcs("nx_cv_ref_marcar").length, 2);
  assert.equal(s.rpcs("nx_cv_ref_liberar").length, 0, "envio que foi ao canal não solta a reserva");
  assert.deepEqual(s.tab("nx_envio_refs").map(x => x.mensagem_id != null), [true, true], "cada reserva aponta a sua saída");
});

test("M36 nx-enviar: client_ref malformado → 400 dados_invalidos (client_ref) sem falar com a Graph; ref de OUTRA conversa também", async () => {
  const s = cenario();
  for (const ruim of ["curto", "com espaço e ; ponto", "x".repeat(81), 42, { a: 1 }]) {
    const r = await ler(await enviar(painel("nx-enviar", { acao: "texto", conversa: 601, texto: "oi", client_ref: ruim }), ENV, s.deps()));
    assert.equal(r.status, 400, JSON.stringify(ruim));
    assert.equal(r.corpo.erro, "dados_invalidos");
  }
  assert.equal(graphMsgs(s).length, 0);
  // o ref já usado na conversa 601 não vale para outra conversa do mesmo cliente
  await enviar(painel("nx-enviar", { acao: "texto", conversa: 601, texto: "oi", client_ref: REF1 }), ENV, s.deps());
  const r = await ler(await enviar(painel("nx-enviar", { acao: "texto", conversa: 602, texto: "oi", client_ref: REF1 }), ENV, s.deps()));
  assert.equal(r.corpo.erro === "dados_invalidos" || r.corpo.erro === "fora_da_janela", true);
  assert.equal(graphMsgs(s).length, 1, "a outra conversa não enviou nada");
});

test("M36 nx-enviar: saída que FALHOU repete como falha (sem 2ª chamada); a nova tentativa é outra intenção (outro client_ref)", async () => {
  const s = cenario();
  const a = await ler(await enviar(painel("nx-enviar", { acao: "texto", conversa: 603, texto: "oi", client_ref: REF1 }, "tok-adm-b", CLI_B), ENV, s.deps()));
  assert.equal(a.corpo.erro, "envio_falhou");
  const nGraph = s.estado.graph.length;
  const b = await ler(await enviar(painel("nx-enviar", { acao: "texto", conversa: 603, texto: "oi", client_ref: REF1 }, "tok-adm-b", CLI_B), ENV, s.deps()));
  assert.equal(b.corpo.ok, false); assert.equal(b.corpo.erro, "envio_falhou"); assert.equal(b.corpo.repetida, true);
  assert.equal(b.corpo.mensagem.id, a.corpo.mensagem.id);
  assert.equal(s.estado.graph.length, nGraph, "nenhuma chamada nova à Graph");
  assert.equal(s.rpcs("nx_cv_saida").length, 1);
  await enviar(painel("nx-enviar", { acao: "texto", conversa: 603, texto: "oi", client_ref: REF2 }, "tok-adm-b", CLI_B), ENV, s.deps());
  assert.equal(s.rpcs("nx_cv_saida").length, 2, "client_ref novo tenta de novo");
});

test("M36 nx-enviar CodeWords: saída em dúvida (timeout) repete como AMBÍGUA — nunca reenvia ao aparelho sozinha", async () => {
  const s = cenario();
  canalAparelho(s);
  s.estado.codewordsHandler = () => jsonResp({ error: "gateway" }, 504);
  const a = await ler(await enviar(painel("nx-enviar", { acao: "texto", conversa: 601, texto: "Olá", client_ref: REF1 }), ENV, s.deps()));
  assert.equal(a.corpo.ambigua, true);
  assert.equal(envioProxy(s).length, 1);
  const b = await ler(await enviar(painel("nx-enviar", { acao: "texto", conversa: 601, texto: "Olá", client_ref: REF1 }), ENV, s.deps()));
  assert.equal(b.corpo.ok, true); assert.equal(b.corpo.ambigua, true); assert.equal(b.corpo.repetida, true);
  assert.equal(b.corpo.mensagem.id, a.corpo.mensagem.id);
  assert.equal(envioProxy(s).length, 1, "o aparelho não recebeu uma 2ª ordem de envio");
});

test("M36 nx-enviar: repetir depois de a conversa ser RESOLVIDA devolve a saída que já existe (não erro de conversa resolvida)", async () => {
  const s = cenario();
  const a = await ler(await enviar(painel("nx-enviar", { acao: "texto", conversa: 601, texto: "oi", client_ref: REF1 }), ENV, s.deps()));
  s.tab("nx_conversas").find(c => c.id === 601).status = "resolvida";
  const b = await ler(await enviar(painel("nx-enviar", { acao: "texto", conversa: 601, texto: "oi", client_ref: REF1 }), ENV, s.deps()));
  assert.equal(b.corpo.ok, true); assert.equal(b.corpo.repetida, true); assert.equal(b.corpo.mensagem.id, a.corpo.mensagem.id);
});

/** fetch que responde 404 (função inexistente no PostgREST) para as internas cujo nome casa com `re`; anota em `tentadas` o que foi pedido. */
const semFuncoes = (s, re, tentadas = []) => (entrada, init) => {
  const req = new Request(entrada, init);
  const nome = new URL(req.url).pathname.split("/rpc/")[1];
  if (nome && re.test(nome)) {
    tentadas.push(nome);
    return Promise.resolve(jsonResp({ code: "PGRST202", message: `Could not find the function public.${nome}(p_cliente, p_ref) in the schema cache` }, 404));
  }
  return s.fetch(entrada, init);
};

test("M36 nx-enviar: sem a migração 20261002d (nenhuma nx_cv_ref_* existe → 404) o envio segue como sempre, sem travar o chat", async () => {
  const s = cenario();
  const r = await ler(await enviar(painel("nx-enviar", { acao: "texto", conversa: 601, texto: "oi", client_ref: REF1 }), ENV, s.deps({ fetch: semFuncoes(s, /^nx_cv_ref_/) })));
  assert.equal(r.corpo.ok, true);
  assert.equal(graphMsgs(s).length, 1);
  assert.equal(s.rpcs("nx_cv_saida").length, 1);
});

test("M36 nx-enviar: banco com nx_cv_ref_ver mas SEM nx_cv_ref_reservar → vale a conferência antiga (a repetição devolve a gravada) e nada é liberado", async () => {
  const s = cenario(), tentadas = [];
  const deps = s.deps({ fetch: semFuncoes(s, /^nx_cv_ref_(reservar|liberar)$/, tentadas) });
  const a = await ler(await enviar(painel("nx-enviar", { acao: "texto", conversa: 601, texto: "oi", client_ref: REF1 }), ENV, deps));
  const b = await ler(await enviar(painel("nx-enviar", { acao: "texto", conversa: 601, texto: "oi", client_ref: REF1 }), ENV, deps));
  assert.equal(a.corpo.ok, true); assert.equal(b.corpo.repetida, true); assert.equal(b.corpo.mensagem.id, a.corpo.mensagem.id);
  assert.equal(graphMsgs(s).length, 1);
  assert.equal(s.rpcs("nx_cv_ref_ver").length, 2);
  // erro antes do canal sem ser dono de reserva: não tenta liberar
  const c = await ler(await enviar(painel("nx-enviar", { acao: "texto", conversa: 602, texto: "oi", client_ref: REF2 }), ENV, deps));
  assert.equal(c.corpo.erro, "fora_da_janela");
  assert.deepEqual(tentadas, ["nx_cv_ref_reservar", "nx_cv_ref_reservar", "nx_cv_ref_reservar"], "tenta a reserva a cada pedido e nunca chama o liberar");
});

test("M36 reserva: o ref é reservado DEPOIS de conferir o pedido e ANTES de falar com o canal; a saída gravada fecha a reserva", async () => {
  const s = cenario();
  const r = await ler(await enviar(painel("nx-enviar", { acao: "texto", conversa: 601, texto: "Custa R$ 500.", client_ref: REF1 }), ENV, s.deps()));
  assert.equal(r.corpo.ok, true);
  const pos = trecho => s.estado.log.findIndex(l => l.includes(trecho));
  assert.ok(pos("/rpc/nx_cv_contexto_envio") >= 0 && pos("/rpc/nx_cv_contexto_envio") < pos("/rpc/nx_cv_ref_reservar"), "primeiro confere a conversa");
  assert.ok(pos("/rpc/nx_cv_ref_reservar") < pos("graph.facebook.com"), "reserva antes da Graph");
  assert.ok(pos("graph.facebook.com") < pos("/rpc/nx_cv_ref_marcar"), "marca depois de gravar a saída");
  assert.deepEqual(s.rpcs("nx_cv_ref_reservar")[0].params, { p_cliente: CLI_A, p_conversa: 601, p_ref: REF1 });
  assert.deepEqual(s.tab("nx_envio_refs").map(x => [x.client_ref, x.conversa_id, x.mensagem_id]), [[REF1, 601, r.corpo.mensagem.id]]);
  // texto inválido ou ref malformado param ANTES da reserva
  await enviar(painel("nx-enviar", { acao: "texto", conversa: 601, texto: "   ", client_ref: REF2 }), ENV, s.deps());
  await enviar(painel("nx-enviar", { acao: "texto", conversa: 601, texto: "oi", client_ref: "curto" }), ENV, s.deps());
  assert.equal(s.rpcs("nx_cv_ref_reservar").length, 1);
});

test("M36 reserva: dois pedidos SIMULTÂNEOS com o mesmo client_ref → um envia, o outro recebe 409 envio_em_andamento; o cliente recebe UMA mensagem", async () => {
  for (const aparelho of [false, true]) {
    const s = cenario();
    if (aparelho) canalAparelho(s);
    const pedido = () => enviar(painel("nx-enviar", { acao: "texto", conversa: 601, texto: "Pode vir às 15h", client_ref: REF1 }), ENV, s.deps());
    const [a, b] = await Promise.all([pedido(), pedido()].map(async x => ler(await x)));
    const enviou = [a, b].filter(x => x.status === 200), esperando = [a, b].filter(x => x.status === 409);
    assert.equal(enviou.length, 1, "só um pedido envia");
    assert.equal(esperando.length, 1, "o outro espera");
    assert.deepEqual(esperando[0].corpo, { ok: false, erro: "envio_em_andamento" });
    assert.equal(aparelho ? envioProxy(s).length : graphMsgs(s).length, 1, "uma só mensagem para o cliente");
    assert.equal(s.rpcs("nx_cv_saida").length, 1, "uma só saída gravada");
    assert.equal(s.rpcs("nx_cv_ref_liberar").length, 0);
    // depois que o primeiro terminou, a nova tentativa do painel recebe a mensagem gravada
    const c = await ler(await pedido());
    assert.equal(c.corpo.ok, true); assert.equal(c.corpo.repetida, true); assert.equal(c.corpo.mensagem.id, enviou[0].corpo.mensagem.id);
    assert.equal(aparelho ? envioProxy(s).length : graphMsgs(s).length, 1);
  }
});

test("M36 reserva: saiu pelo canal mas o banco não gravou → a reserva FICA; repetir dá 409 (em andamento) e, passados 150 s, 502 ambígua — nunca reenvia", async () => {
  const s = cenario();
  canalAparelho(s);
  const falhaNoBanco = (entrada, init) => {
    const req = new Request(entrada, init);
    if (new URL(req.url).pathname.endsWith("/rpc/nx_cv_saida")) return Promise.resolve(jsonResp({ code: "XX000", message: "banco indisponível" }, 500));
    return s.fetch(entrada, init);
  };
  const pedido = deps => enviar(painel("nx-enviar", { acao: "texto", conversa: 601, texto: "Olá", client_ref: REF1 }), ENV, deps);
  const a = await ler(await pedido(s.deps({ fetch: falhaNoBanco })));
  assert.equal(a.status, 502); assert.equal(a.corpo.ambigua, true);
  assert.equal(s.rpcs("nx_cv_ref_liberar").length, 0, "pode ter saído: a reserva não é solta");
  assert.deepEqual(s.tab("nx_envio_refs").map(x => x.mensagem_id), [null]);
  const b = await ler(await pedido(s.deps()));
  assert.equal(b.status, 409); assert.equal(b.corpo.erro, "envio_em_andamento");
  s.estado.agora = new Date(s.estado.agora.getTime() + 149e3);
  assert.equal((await pedido(s.deps())).status, 409, "149 s: ainda dentro do tempo de vida da função");
  s.estado.agora = new Date(s.estado.agora.getTime() + 2e3);
  const c = await ler(await pedido(s.deps()));
  assert.equal(c.status, 502);
  assert.equal(c.corpo.ok, false); assert.equal(c.corpo.erro, "envio_falhou"); assert.equal(c.corpo.ambigua, true);
  assert.match(c.corpo.detalhe, /pode ter saído/);
  assert.equal(c.corpo.mensagem, undefined, "não há saída gravada para devolver");
  const d = await ler(await pedido(s.deps()));
  assert.equal(d.status, 502, "continua ambígua: nunca vira envio novo");
  assert.equal(envioProxy(s).length, 1, "o aparelho recebeu UMA ordem de envio");
  assert.equal(s.tab("nx_mensagens").filter(m => m.corpo === "Olá").length, 0);
});

test("M36 reserva: erro ANTES de falar com o canal solta a reserva — o mesmo client_ref envia depois que o problema é resolvido", async () => {
  // janela fechada (Meta)
  let s = cenario();
  let r = await ler(await enviar(painel("nx-enviar", { acao: "texto", conversa: 602, texto: "oi", client_ref: REF1 }), ENV, s.deps()));
  assert.equal(r.status, 400); assert.equal(r.corpo.erro, "fora_da_janela");
  assert.deepEqual(s.rpcs("nx_cv_ref_liberar").map(x => x.params), [{ p_cliente: CLI_A, p_ref: REF1 }]);
  assert.equal(s.tab("nx_envio_refs").length, 0, "nada saiu: a reserva foi solta");
  assert.equal(s.estado.graph.length, 0);
  s.tab("nx_conversas").find(c => c.id === 602).ultima_entrada_em = s.estado.agora.toISOString();   // o cliente escreveu: a janela abriu
  r = await ler(await enviar(painel("nx-enviar", { acao: "texto", conversa: 602, texto: "oi", client_ref: REF1 }), ENV, s.deps()));
  assert.equal(r.corpo.ok, true); assert.equal(r.corpo.repetida, undefined, "é o primeiro envio de verdade");
  assert.equal(graphMsgs(s).length, 1);

  // conversa resolvida
  s = cenario();
  r = await ler(await enviar(painel("nx-enviar", { acao: "texto", conversa: 604, texto: "oi", client_ref: REF1 }), ENV, s.deps()));
  assert.equal(r.corpo.erro, "conversa_resolvida");
  assert.equal(s.rpcs("nx_cv_ref_liberar").length, 1);
  assert.equal(s.tab("nx_envio_refs").length, 0);

  // número CodeWords sem aparelho pareado (credencial ausente)
  s = cenario();
  const k = canalAparelho(s);
  k.codewords_phone_id = null;
  r = await ler(await enviar(painel("nx-enviar", { acao: "texto", conversa: 601, texto: "Olá", client_ref: REF1 }), ENV, s.deps()));
  assert.equal(r.status, 400); assert.equal(r.corpo.erro, "codewords_sem_aparelho");
  assert.equal(s.tab("nx_envio_refs").length, 0);
  assert.equal(s.estado.codewords.length, 0);
  k.codewords_phone_id = "dev-a1";
  r = await ler(await enviar(painel("nx-enviar", { acao: "texto", conversa: 601, texto: "Olá", client_ref: REF1 }), ENV, s.deps()));
  assert.equal(r.corpo.ok, true);
  assert.equal(envioProxy(s).length, 1);
});

test("M36 reserva: falha ao soltar a reserva não esconde o erro original; estado desconhecido do banco NÃO envia", async () => {
  const s = cenario();
  const liberarFalha = (entrada, init) => {
    const req = new Request(entrada, init);
    if (new URL(req.url).pathname.endsWith("/rpc/nx_cv_ref_liberar")) return Promise.resolve(jsonResp({ code: "XX000", message: "banco indisponível" }, 500));
    return s.fetch(entrada, init);
  };
  let r = await ler(await enviar(painel("nx-enviar", { acao: "texto", conversa: 602, texto: "oi", client_ref: REF1 }), ENV, s.deps({ fetch: liberarFalha })));
  assert.equal(r.status, 400); assert.equal(r.corpo.erro, "fora_da_janela");
  const estadoEstranho = (entrada, init) => {
    const req = new Request(entrada, init);
    if (new URL(req.url).pathname.endsWith("/rpc/nx_cv_ref_reservar")) return Promise.resolve(jsonResp({ estado: "outro" }));
    return s.fetch(entrada, init);
  };
  r = await ler(await enviar(painel("nx-enviar", { acao: "texto", conversa: 601, texto: "oi", client_ref: REF2 }), ENV, s.deps({ fetch: estadoEstranho })));
  assert.equal(r.status, 500);
  assert.equal(s.estado.graph.length, 0, "sem saber o estado da reserva, nada sai");
});

test("M36 reserva em MODELO e MÍDIA: o mesmo client_ref não sai duas vezes; pedido recusado antes do canal solta a reserva", async () => {
  const s = cenario();
  const TPL = "7e7e7e7e-0000-4000-8000-000000000001";
  s.tab("nx_templates").find(t => t.id === "tpl-conf").id = TPL;
  const modelo = parametros => enviar(painel("nx-enviar", { acao: "template", conversa: 602, template_id: TPL, parametros, client_ref: REF1 }), ENV, s.deps());
  const ruim = await ler(await modelo(["só um"]));
  assert.equal(ruim.corpo.erro, "template_invalido");
  assert.equal(s.tab("nx_envio_refs").length, 0, "recusado antes da Graph: reserva solta");
  const a = await ler(await modelo(["João", "amanhã às 14h"]));
  const b = await ler(await modelo(["João", "amanhã às 14h"]));
  assert.equal(a.corpo.ok, true); assert.equal(b.corpo.repetida, true); assert.equal(b.corpo.mensagem.id, a.corpo.mensagem.id);
  assert.equal(graphMsgs(s).length, 1, "um modelo só (modelo é pago)");

  const path = `${CLI_A}/out/2026-09/11111111-2222-4333-8444-555555555555.pdf`;
  const midiaReq = () => enviar(painel("nx-enviar", { acao: "midia", conversa: 601, path, mime: "application/pdf", nome: "orcamento.pdf", client_ref: REF2 }), ENV, s.deps());
  const semArquivo = await ler(await midiaReq());   // o arquivo ainda não está no Storage
  assert.equal(semArquivo.corpo.erro, "midia_nao_encontrada");
  assert.equal(s.tab("nx_envio_refs").filter(x => x.client_ref === REF2).length, 0, "nada saiu: reserva solta");
  s.estado.arquivos.set(path, { bytes: new Uint8Array([1]), mime: "application/pdf" });
  const [m1, m2] = await Promise.all([midiaReq(), midiaReq()].map(async x => ler(await x)));
  assert.deepEqual([m1.status, m2.status].sort(), [200, 409], "simultâneos: um envia, o outro espera");
  assert.equal(graphMsgs(s).filter(g => g.type === "document").length, 1, "um arquivo só");
  const m3 = await ler(await midiaReq());
  assert.equal(m3.corpo.repetida, true);
  assert.equal(graphMsgs(s).filter(g => g.type === "document").length, 1);
});

test("nx-enviar texto fora da janela → fora_da_janela SEM chamar a Graph; resolvida → conversa_resolvida", async () => {
  const s = cenario();
  let r = await ler(await enviar(painel("nx-enviar", { acao: "texto", conversa: 602, texto: "oi" }), ENV, s.deps()));
  assert.equal(r.status, 400);
  assert.equal(r.corpo.erro, "fora_da_janela");
  r = await ler(await enviar(painel("nx-enviar", { acao: "texto", conversa: 604, texto: "oi" }), ENV, s.deps()));
  assert.equal(r.corpo.erro, "conversa_resolvida");
  assert.equal(s.estado.graph.length, 0);
  assert.equal(s.rpcs("nx_cv_saida").length, 0);
});

test("nx-enviar: erro 190 da Graph → mensagem 'falhou' com a dica; resposta envio_falhou com a mensagem", async () => {
  const s = cenario();
  const r = await ler(await enviar(painel("nx-enviar", { acao: "texto", conversa: 603, texto: "oi" }, "tok-adm-b", CLI_B), ENV, s.deps()));
  assert.equal(r.corpo.ok, false);
  assert.equal(r.corpo.erro, "envio_falhou");
  assert.match(r.corpo.detalhe, /código 190.*token vencido ou revogado — refaça em Números de WhatsApp/);
  assert.equal(r.corpo.mensagem.status, "falhou");
  assert.match(r.corpo.mensagem.erro, /token vencido/);
  assert.ok(!JSON.stringify(r.corpo).includes("tok-vencido"), "o token nunca volta");
  assert.equal(textoFalhaCanal({ code: 131047, title: "Re-engagement message" }),
    "WhatsApp não aceitou (código 131047): Re-engagement message — mais de 24 h desde a última mensagem do cliente — use um modelo aprovado");
});

test("nx-enviar Meta: timeout ou 5xx após POST mantém status incerto e bloqueia o reenvio perigoso", async () => {
  for (const falha of [
    () => { throw new Error("socket timeout"); },
    () => jsonResp({ error: "gateway" }, 503),
    () => new Response("<html>gateway</html>", { status: 502 }),
  ]) {
    const s = cenario();
    const fetch = (entrada, init) => new URL(entrada).host === "graph.facebook.com" ? falha(entrada, init) : s.fetch(entrada, init);
    const r = await ler(await enviar(painel("nx-enviar", { acao: "texto", conversa: 601, texto: "Olá" }), ENV,
      s.deps({ fetch })));
    assert.equal(r.status, 200);
    assert.equal(r.corpo.ok, true);
    assert.equal(r.corpo.ambigua, true);
    assert.equal(r.corpo.mensagem.status, "pendente");
    assert.match(r.corpo.mensagem.erro, /status incerto/i);
    assert.equal(r.corpo.mensagem.wamid ?? null, null, "não inventa um id de recibo da Meta");
    assert.equal(s.tab("nx_mensagens").filter(m => m.corpo === "Olá" && m.status === "falhou").length, 0);
  }
});

test("nx-enviar template: parâmetros no corpo da Graph; corpo gravado com os parâmetros; contagem errada → template_invalido", async () => {
  const s = cenario();
  // conversa 602 está SEM janela: modelo vale mesmo assim ("Nova conversa")
  const r = await ler(await enviar(painel("nx-enviar", { acao: "template", conversa: 602, template_id: "tpl-conf".padEnd(8), parametros: ["João", "amanhã às 14h"] }), ENV, s.deps()));
  assert.equal(r.corpo.erro, "template_invalido", "template_id precisa ser uuid");
  const TPL = "7e7e7e7e-0000-4000-8000-000000000001";
  s.tab("nx_templates").find(t => t.id === "tpl-conf").id = TPL;
  const ok = await ler(await enviar(painel("nx-enviar", { acao: "template", conversa: 602, template_id: TPL, parametros: ["João", "amanhã às 14h"] }), ENV, s.deps()));
  assert.equal(ok.corpo.ok, true);
  const [g] = graphMsgs(s);
  assert.equal(g.type, "template");
  assert.deepEqual(g.template, { name: "confirmacao_consulta", language: { code: "pt_BR" },
    components: [{ type: "body", parameters: [{ type: "text", text: "João" }, { type: "text", text: "amanhã às 14h" }] }] });
  assert.equal(ok.corpo.mensagem.corpo, "Olá João, sua consulta é amanhã às 14h.");
  assert.equal(ok.corpo.mensagem.tipo, "template");
  assert.deepEqual(ok.corpo.mensagem.template.parametros, ["João", "amanhã às 14h"]);
  const n = s.estado.graph.length;
  const falta = await ler(await enviar(painel("nx-enviar", { acao: "template", conversa: 602, template_id: TPL, parametros: ["só um"] }), ENV, s.deps()));
  assert.equal(falta.corpo.erro, "template_invalido");
  // modelo de outro cliente / não aprovado → template_invalido, sem Graph
  const B = "7e7e7e7e-0000-4000-8000-000000000002";
  s.tab("nx_templates").find(t => t.id === "tpl-b").id = B;
  assert.equal((await ler(await enviar(painel("nx-enviar", { acao: "template", conversa: 602, template_id: B, parametros: [] }), ENV, s.deps()))).corpo.erro, "template_invalido");
  assert.equal(s.estado.graph.length, n);
  // marketing para quem pediu SAIR (João tem optin_marketing = false) → recusado
  const P = "7e7e7e7e-0000-4000-8000-000000000003";
  s.tab("nx_templates").find(t => t.id === "tpl-promo").id = P;
  const mk = await ler(await enviar(painel("nx-enviar", { acao: "template", conversa: 602, template_id: P, parametros: [] }), ENV, s.deps()));
  assert.equal(mk.corpo.erro, "template_invalido");
  assert.match(mk.corpo.detalhe, /não receber mensagens de marketing/);
  assert.equal(s.estado.graph.length, n);
  assert.equal(aplicarParametros("Oi {{nome}}, {{nome}} dia {{data}}", ["Ana", "3"]), "Oi Ana, Ana dia 3");
  assert.deepEqual(parametrosDoCorpo("{{2}} e {{1}}"), ["1", "2"]);
});

test("nx-enviar midia: link assinado do Storage para a Graph; path de outro cliente → 404 midia_nao_encontrada", async () => {
  const s = cenario();
  const path = `${CLI_A}/out/2026-09/11111111-2222-4333-8444-555555555555.pdf`;
  s.estado.arquivos.set(path, { bytes: new Uint8Array([1]), mime: "application/pdf" });
  const r = await ler(await enviar(painel("nx-enviar", { acao: "midia", conversa: 601, path, mime: "application/pdf", nome: "orcamento.pdf", legenda: "Seu orçamento", tamanho: 1234 }), ENV, s.deps()));
  assert.equal(r.corpo.ok, true);
  const [g] = graphMsgs(s);
  assert.equal(g.type, "document");
  assert.equal(g.document.link, `${SUPA}/storage/v1/object/sign/nx-midia/${path}?token=ler-3600`);
  assert.equal(g.document.filename, "orcamento.pdf");
  assert.equal(g.document.caption, "Seu orçamento");
  assert.equal(r.corpo.mensagem.tipo, "documento");
  assert.equal(r.corpo.mensagem.midia.path, path);
  // áudio não leva legenda
  const pa = `${CLI_A}/out/2026-09/11111111-2222-4333-8444-555555555556.ogg`;
  s.estado.arquivos.set(pa, { bytes: new Uint8Array([1]) });
  await enviar(painel("nx-enviar", { acao: "midia", conversa: 601, path: pa, mime: "audio/ogg", legenda: "ignorada" }), ENV, s.deps());
  assert.deepEqual(graphMsgs(s)[1].audio, { link: `${SUPA}/storage/v1/object/sign/nx-midia/${pa}?token=ler-3600` });
  const n = s.estado.graph.length, st = s.estado.storage.length;
  for (const ruim of [`${CLI_B}/out/2026-09/x.pdf`, `${CLI_A}/in/2026-09/x.pdf`, `${CLI_A}/out/../${CLI_B}/x.pdf`, "/etc/passwd"]) {
    const x = await ler(await enviar(painel("nx-enviar", { acao: "midia", conversa: 601, path: ruim, mime: "application/pdf" }), ENV, s.deps()));
    assert.equal(x.status, 404, ruim);
    assert.equal(x.corpo.erro, "midia_nao_encontrada");
  }
  assert.equal((await ler(await enviar(painel("nx-enviar", { acao: "midia", conversa: 601, path, mime: "image/svg+xml" }), ENV, s.deps()))).corpo.erro, "midia_tipo");
  assert.equal(s.estado.graph.length, n);
  assert.equal(s.estado.storage.length, st, "nada assinado");
});

test("nx-enviar lido: recibo de leitura com o último wamid de entrada; nunca falha para o usuário", async () => {
  const s = cenario();
  let r = await ler(await enviar(painel("nx-enviar", { acao: "lido", conversa: 601 }), ENV, s.deps()));
  assert.deepEqual(r.corpo, { ok: true, enviado: true });
  const lido = s.estado.enviadas.find(m => m.status === "read");
  assert.equal(lido.message_id, "wamid.IN-701");
  // sem janela / leitura / recibo desligado / token vencido → ok, sem enviar
  r = await ler(await enviar(painel("nx-enviar", { acao: "lido", conversa: 602 }), ENV, s.deps()));
  assert.deepEqual(r.corpo, { ok: true, enviado: false });
  r = await ler(await enviar(painel("nx-enviar", { acao: "lido", conversa: 603 }, "tok-adm-b", CLI_B), ENV, s.deps()));
  assert.equal(r.corpo.ok, true);
  r = await ler(await enviar(painel("nx-enviar", { acao: "lido", conversa: 601 }, "tok-le-a"), ENV, s.deps()));
  assert.deepEqual(r.corpo, { ok: true, enviado: false });
  s.tab("nx_clientes").find(c => c.id === CLI_A).cfg.cv = { recibo_leitura: false };
  r = await ler(await enviar(painel("nx-enviar", { acao: "lido", conversa: 601 }), ENV, s.deps()));
  assert.deepEqual(r.corpo, { ok: true, enviado: false });
  assert.equal(s.estado.enviadas.filter(m => m.status === "read" && m.pid === "111").length, 1, "só o 1º pedido de A saiu");
  assert.equal(s.estado.enviadas.filter(m => m.status === "read" && m.pid === "222").length, 1, "B tentou (token vencido) e respondeu ok sem enviar");
});

test("nx-enviar testar_canal: subscribed_apps vazio → app_inscrito:false e canal pendente; inscrever_app faz o POST e repete o teste → ativo", async () => {
  const s = cenario();
  // K_A2 (WABA-A2) ainda não tem o app inscrito
  let r = await ler(await enviar(painel("nx-enviar", { acao: "testar_canal", canal: K_A2 }), ENV, s.deps()));
  assert.equal(r.corpo.ok, true);
  assert.equal(r.corpo.app_inscrito, false);
  assert.equal(r.corpo.numero, "+55 12 3999-1112");
  assert.equal(r.corpo.qualidade, "GREEN");
  assert.equal(r.corpo.status, "pendente");
  assert.match(r.corpo.aviso, /Inscrever o app/);
  const k = s.tab("nx_canais").find(x => x.id === K_A2);
  assert.equal(k.status, "pendente");
  assert.equal(k.app_inscrito, false);
  assert.ok(s.estado.graph.includes("GET /v23.0/112") && s.estado.graph.includes("GET /v23.0/WABA-A2/subscribed_apps"));
  r = await ler(await enviar(painel("nx-enviar", { acao: "inscrever_app", canal: K_A2 }), ENV, s.deps()));
  assert.equal(r.corpo.ok, true);
  assert.equal(r.corpo.app_inscrito, true);
  assert.ok(s.estado.graph.includes("POST /v23.0/WABA-A2/subscribed_apps"));
  assert.equal(k.status, "ativo");
  assert.equal(k.ultimo_erro, null);
  // token vencido: teste falha, canal 'erro' com a dica
  const rb = await ler(await enviar(painel("nx-enviar", { acao: "testar_canal", canal: K_B }, "tok-adm-b", CLI_B), ENV, s.deps()));
  assert.equal(rb.corpo.ok, false);
  assert.match(rb.corpo.detalhe, /190/);
  assert.equal(s.tab("nx_canais").find(x => x.id === K_B).status, "erro");
  // atendente não configura número
  assert.equal((await ler(await enviar(painel("nx-enviar", { acao: "testar_canal", canal: K_A1 }, "tok-at-a"), ENV, s.deps()))).corpo.erro, "sem_permissao");
});

test("nx-enviar sincronizar_templates: lista da WABA → nx_templates_gravar do canal", async () => {
  const s = cenario();
  const r = await ler(await enviar(painel("nx-enviar", { acao: "sincronizar_templates", canal: K_A1 }), ENV, s.deps()));
  assert.deepEqual(r.corpo, { ok: true, total: 2, completo: true });
  const [g] = s.rpcs("nx_templates_gravar");
  assert.equal(g.params.p_canal, K_A1);
  assert.equal(g.params.p_cliente, CLI_A);
  assert.equal(g.params.p_lista.length, 2);
  assert.ok(s.estado.graph.some(l => l.startsWith("GET /v23.0/WABA-A/message_templates")));
});

test("§5.5 isolamento: conversa/canal/mensagem de OUTRO cliente ou invisível → 404 e ZERO chamadas à Graph/Storage/Anthropic", async () => {
  const s = cenario({ config: { anthropic_api_key: "sk-ant-teste" } });
  const casos = [
    ["nx-enviar", enviar, { acao: "texto", conversa: 603, texto: "oi" }, "tok-adm-a", "conversa_nao_encontrada"],          // conversa de B
    ["nx-enviar", enviar, { acao: "texto", conversa: 601, texto: "oi" }, "tok-at-a", "conversa_nao_encontrada"],           // invisível ao atendente
    ["nx-enviar", enviar, { acao: "template", conversa: 603, template_id: "7e7e7e7e-0000-4000-8000-000000000009", parametros: [] }, "tok-adm-a", "conversa_nao_encontrada"],
    ["nx-enviar", enviar, { acao: "midia", conversa: 603, path: `${CLI_A}/out/2026-09/a.pdf`, mime: "application/pdf" }, "tok-adm-a", "conversa_nao_encontrada"],
    ["nx-enviar", enviar, { acao: "lido", conversa: 603 }, "tok-adm-a", "conversa_nao_encontrada"],
    ["nx-enviar", enviar, { acao: "testar_canal", canal: K_B }, "tok-adm-a", "canal_nao_encontrado"],
    ["nx-enviar", enviar, { acao: "sincronizar_templates", canal: K_B }, "tok-adm-a", "canal_nao_encontrado"],
    ["nx-enviar", enviar, { acao: "inscrever_app", canal: K_B }, "tok-adm-a", "canal_nao_encontrado"],
    ["nx-enviar", enviar, { acao: "testar_canal", canal: "nao-e-uuid" }, "tok-adm-a", "canal_nao_encontrado"],
    ["nx-enviar", enviar, { acao: "reenviar", mensagem: 704 }, "tok-adm-a", "mensagem_nao_encontrada"],                    // mensagem de B
    ["nx-enviar", enviar, { acao: "texto", conversa: "601 or 1=1", texto: "oi" }, "tok-adm-a", "conversa_nao_encontrada"],
    ["nx-ia", nxIa, { acao: "sugerir", conversa: 603 }, "tok-adm-a", "conversa_nao_encontrada"],
    ["nx-ia", nxIa, { acao: "sugerir", conversa: 601 }, "tok-at-a", "conversa_nao_encontrada"],
    ["nx-midia", midia, { acao: "ver", paths: [`${CLI_B}/in/2026-09/x.jpg`] }, "tok-adm-a", "midia_nao_encontrada"],
    ["nx-midia", midia, { acao: "ver", paths: [`${CLI_A}/in/2026-09/ok.jpg`, `${CLI_B}/in/2026-09/x.jpg`] }, "tok-adm-a", "midia_nao_encontrada"],
    ["nx-midia", midia, { acao: "apagar", paths: [`${CLI_B}/out/2026-09/x.jpg`] }, "tok-adm-a", "midia_nao_encontrada"],
  ];
  const iaChamadas = [];
  for (const [fn, h, corpo, tok, codigo] of casos) {
    const r = await ler(await h(painel(fn, corpo, tok), ENV, s.deps({ ia: async () => ({ perguntarClaude: async p => { iaChamadas.push(p); return { texto: "x" }; } }) })));
    assert.equal(r.status, 404, `${fn} ${JSON.stringify(corpo)} (${tok})`);
    assert.deepEqual(r.corpo, { ok: false, erro: codigo }, `${fn} ${corpo.acao}`);
  }
  assert.equal(s.estado.graph.length, 0, "nenhuma chamada à Graph");
  assert.equal(s.estado.storage.length, 0, "nada assinado nem apagado");
  assert.equal(iaChamadas.length, 0, "nenhuma chamada à Anthropic");
  assert.equal(s.tab("nx_ia_uso").length, 0, "nem conta cota");
  // token de A com p_cliente B → sem_acesso (403)
  const x = await ler(await enviar(painel("nx-enviar", { acao: "texto", conversa: 603, texto: "oi" }, "tok-adm-a", CLI_B), ENV, s.deps()));
  assert.equal(x.status, 403);
  assert.equal(x.corpo.erro, "sem_acesso");
  // cliente mal formado → 404 sem nem chamar o banco
  const antes = s.banco.api.chamadas.length;
  assert.equal((await ler(await enviar(painel("nx-enviar", { acao: "texto", conversa: 601, texto: "oi" }, "tok-adm-a", "x' or '1"), ENV, s.deps()))).status, 404);
  assert.equal(s.banco.api.chamadas.length, antes);
});

test("nx-enviar reenviar (P1): só a própria mensagem de texto que falhou, pelas mesmas regras do texto", async () => {
  const s = cenario();
  s.tab("nx_mensagens").push({ id: 790, cliente_id: CLI_A, conversa_id: 601, contato_id: 501, canal_id: K_A1, direcao: "out", tipo: "texto",
                               corpo: "tentar de novo", wamid: null, status: "falhou", criado_em: AGORA.toISOString(), atualizado_em: AGORA.toISOString() });
  const r = await ler(await enviar(painel("nx-enviar", { acao: "reenviar", mensagem: 790 }), ENV, s.deps()));
  assert.equal(r.corpo.ok, true);
  assert.equal(graphMsgs(s)[0].text.body, "tentar de novo");
});

/* ============================================================
   nx-enviar — modo cron (fila, alerta, lixo de mídia)
   ============================================================ */
test("nx-enviar cron: 401 sem o token; chave desconhecida no corpo → 400; o painel não alcança o modo cron", async () => {
  const s = cenario();
  assert.equal((await enviar(cron({ fila: true }, "errado"), ENV, s.deps())).status, 401);
  assert.equal((await enviar(cron({ fila: true }, ""), ENV, s.deps())).status, 401);
  let r = await ler(await enviar(cron({ fila: true, cliente: CLI_A }), ENV, s.deps()));
  assert.equal(r.status, 400);
  r = await ler(await enviar(cron({ tipo: "diario" }), ENV, s.deps()));
  assert.equal(r.status, 400);
  r = await ler(await enviar(cron({}), ENV, s.deps()));
  assert.equal(r.status, 400);
  // corpo do painel com acao de fila → não existe no painel
  r = await ler(await enviar(painel("nx-enviar", { acao: "fila" }), ENV, s.deps()));
  assert.equal(r.corpo.erro, "dados_invalidos");
});

test("nx-enviar cron fila: pula texto fora da janela, envia modelo, pula marketing de quem pediu SAIR, bloqueado e sem token", async () => {
  const s = cenario();
  const item = (o) => ({ id: 0, cliente_id: CLI_A, conversa_id: 602, contato_id: 502, canal_id: K_A1, tipo: "texto", texto: "lembrete", template: null,
                         origem: "automacao", status: "pendente", enviar_em: new Date(AGORA.getTime() - 60e3).toISOString(), tentativas: 0, criado_por: null, ...o });
  s.tab("nx_envios_fila").push(
    item({ id: 1 }),                                                                                       // 602 sem janela → pulado
    item({ id: 2, tipo: "template", texto: null, template: { nome: "confirmacao_consulta", idioma: "pt_BR", parametros: ["João", "amanhã"] } }),
    item({ id: 3, tipo: "template", texto: null, template: { nome: "promo", idioma: "pt_BR", parametros: [] } }),   // João optou por sair → pulado
    item({ id: 4, conversa_id: 601, contato_id: 501, texto: "dentro da janela" }),                          // enviado
    item({ id: 5, conversa_id: 603, contato_id: 503, cliente_id: CLI_B, canal_id: K_B, texto: "token vencido" }),   // falhou com dica
    item({ id: 6, conversa_id: 601, contato_id: 501, texto: "futuro", enviar_em: new Date(AGORA.getTime() + HORA).toISOString() }),
    item({ id: 7, tipo: "template", texto: null, template: { nome: "confirmacao_consulta", idioma: "pt_BR", parametros: ["só um"] } }),
  );
  s.tab("nx_envios_fila").push(item({ id: 8, conversa_id: 605, contato_id: 504 }));   // bloqueado
  const r = await ler(await enviar(cron({ fila: true }), ENV, s.deps()));
  assert.equal(r.status, 200);
  assert.deepEqual(r.corpo.fila, { total: 7, enviado: 2, pulado: 3, falhou: 2 });
  const f = id => s.tab("nx_envios_fila").find(x => x.id === id);
  assert.equal(f(1).status, "pulado");
  assert.match(f(1).erro, /fora da janela/);
  assert.equal(f(2).status, "enviado");
  assert.equal(f(3).status, "pulado");
  assert.match(f(3).erro, /marketing/);
  assert.equal(f(4).status, "enviado");
  assert.equal(f(5).status, "falhou");
  assert.match(f(5).erro, /190/);
  assert.equal(f(6).status, "pendente", "futuro fica");
  assert.equal(f(7).status, "falhou");
  assert.equal(f(8).status, "pulado");
  const tpl = graphMsgs(s).find(m => m.type === "template");
  assert.equal(tpl.to, "5512977776666");
  assert.deepEqual(tpl.template.components[0].parameters.map(p => p.text), ["João", "amanhã"]);
  const saida = s.tab("nx_mensagens").find(m => m.id === f(2).mensagem_id);
  assert.equal(saida.corpo, "Olá João, sua consulta é amanhã.");
  assert.equal(saida.origem, "automacao");
  // a falha também vira mensagem 'falhou' na conversa (o atendente vê o "!")
  assert.equal(s.tab("nx_mensagens").find(m => m.id === f(5).mensagem_id).status, "falhou");
});

test("nx-enviar cron alerta (P1): cliente inexistente → nada enviado; texto de 1.500 → sai com 1.000", async () => {
  const s = cenario();
  let r = await ler(await enviar(cron({ alerta: { cliente: "99999999-9999-4999-8999-999999999999", texto: "x" } }), ENV, s.deps()));
  assert.equal(r.corpo.alerta.enviados, 0);
  assert.equal(r.corpo.alerta.erro, "cliente_nao_encontrado");
  r = await ler(await enviar(cron({ alerta: { cliente: "não-uuid", texto: "x" } }), ENV, s.deps()));
  assert.equal(r.corpo.alerta.enviados, 0);
  assert.equal(s.estado.enviadas.length, 0);
  r = await ler(await enviar(cron({ alerta: { cliente: CLI_A, texto: "y".repeat(1500) } }), ENV, s.deps()));
  assert.equal(r.corpo.alerta.enviados, 1);
  const [m] = s.estado.enviadas;
  assert.equal(m.pid, NEXUS_PID, "sai pelo número da Nexus");
  assert.equal(m.to, "5512911112222", "para o waGestor DESTE cliente");
  assert.equal(m.text.body.length, 1000);
});

test("nx-enviar cron: lixo de mídia apaga arquivos e a pasta do cliente excluído; path fora do cliente vira erro", async () => {
  const s = cenario();
  const a = `${CLI_A}/in/2026-09/a.jpg`, b = `${CLI_B}/in/2026-09/b.jpg`, c1 = `${CLI_B}/out/2026-08/c.pdf`;
  for (const p of [a, b, c1]) s.estado.arquivos.set(p, { bytes: new Uint8Array([1]) });
  s.tab("nx_midia_lixo").push(
    { id: 1, cliente_id: CLI_A, path: a, apagado_em: null, erro: null },
    { id: 2, cliente_id: CLI_B, path: `${CLI_B}/`, apagado_em: null, erro: null },
    { id: 3, cliente_id: CLI_A, path: `${CLI_B}/in/2026-09/b.jpg`, apagado_em: null, erro: null },
  );
  const r = await ler(await enviar(cron({ fila: true }), ENV, s.deps()));
  assert.equal(r.corpo.midia.apagados, 3);
  assert.equal(r.corpo.midia.pastas, 1);
  assert.equal(s.estado.arquivos.size, 0);
  assert.ok(s.tab("nx_midia_lixo").find(l => l.id === 1).apagado_em);
  assert.ok(s.tab("nx_midia_lixo").find(l => l.id === 2).apagado_em);
  assert.match(s.tab("nx_midia_lixo").find(l => l.id === 3).erro, /fora da pasta/);
});

test("enviarFila com ids: só esses e só uma vez (2º pedido não acha nada pendente)", async () => {
  const s = cenario();
  s.tab("nx_envios_fila").push({ id: 50, cliente_id: CLI_A, conversa_id: 601, contato_id: 501, canal_id: K_A1, tipo: "texto", texto: "oi",
                                 template: null, origem: "automacao", status: "pendente", enviar_em: AGORA.toISOString(), tentativas: 0 });
  const db = criarDb(ENV, s.fetch);
  const [r1, r2] = await Promise.all([enviarFila(db, { ids: [50] }, { fetch: s.fetch }), enviarFila(db, { ids: [50] }, { fetch: s.fetch })]);
  assert.equal(r1.enviado + r2.enviado, 1);
  assert.equal(graphMsgs(s).length, 1);
});

/* ============================================================
   nx-midia (ESPEC §6.4)
   ============================================================ */
test("nx-midia subir: tipos e tamanhos do WhatsApp; path <cliente>/out/<mês>/<uuid>.<ext>; upload_url assinada", async () => {
  const s = cenario();
  const r = await ler(await midia(painel("nx-midia", { acao: "subir", nome: "foto.jpg", mime: "image/jpeg", tamanho: 1000 }), ENV, s.deps()));
  assert.equal(r.corpo.ok, true);
  assert.match(r.corpo.path, new RegExp(`^${CLI_A}/out/2026-09/[0-9a-f-]{36}\\.jpg$`));
  assert.equal(r.corpo.upload_url, `${SUPA}/storage/v1/object/upload/sign/nx-midia/${r.corpo.path}?token=up-${r.corpo.path.length}`);
  const erro = async c => (await ler(await midia(painel("nx-midia", { acao: "subir", ...c }), ENV, s.deps()))).corpo.erro;
  assert.equal(await erro({ mime: "image/svg+xml", tamanho: 10 }), "midia_tipo");
  assert.equal(await erro({ mime: "application/x-msdownload", tamanho: 10 }), "midia_tipo");
  assert.equal(await erro({ mime: "image/png", tamanho: 6 * 1024 * 1024 }), "midia_grande", "foto até 5 MB");
  assert.equal(await erro({ mime: "video/mp4", tamanho: 17 * 1024 * 1024 }), "midia_grande");
  assert.equal(await erro({ mime: "application/pdf", tamanho: 0 }), "dados_invalidos");
  const docx = await ler(await midia(painel("nx-midia", { acao: "subir", mime: "application/vnd.openxmlformats-officedocument.wordprocessingml.document", tamanho: 10 }), ENV, s.deps()));
  assert.match(docx.corpo.path, /\.docx$/);
  // leitura não sobe arquivo
  assert.equal((await ler(await midia(painel("nx-midia", { acao: "subir", mime: "image/jpeg", tamanho: 10 }, "tok-le-a"), ENV, s.deps()))).corpo.erro, "sem_permissao");
  assert.deepEqual(tipoAceito("audio/ogg; codecs=opus"), { ext: "ogg", max: 16 * 1024 * 1024, grupo: "audio" });
  assert.equal(pathDoCliente(`${CLI_A}/out/x.pdf`, CLI_A, "out"), true);
  assert.equal(pathDoCliente(`${CLI_A}/out/../x.pdf`, CLI_A), false);
});

test("nx-midia ver: URLs assinadas de 1 h só da pasta do cliente; subir_direto (base64 ≤ 5 MB) grava com a service role", async () => {
  const s = cenario();
  const p1 = `${CLI_A}/in/2026-09/a.jpg`, p2 = `${CLI_A}/out/2026-09/b.pdf`;
  s.estado.arquivos.set(p1, { bytes: new Uint8Array([1]) });
  s.estado.arquivos.set(p2, { bytes: new Uint8Array([1]) });
  const r = await ler(await midia(painel("nx-midia", { acao: "ver", paths: [p1, p2] }, "tok-le-a"), ENV, s.deps()));
  assert.deepEqual(r.corpo.urls, {
    [p1]: `${SUPA}/storage/v1/object/sign/nx-midia/${p1}?token=ler-3600`,
    [p2]: `${SUPA}/storage/v1/object/sign/nx-midia/${p2}?token=ler-3600`,
  });
  assert.equal((await ler(await midia(painel("nx-midia", { acao: "ver", paths: Array(51).fill(p1) }), ENV, s.deps()))).corpo.erro, "dados_invalidos");
  const d = await ler(await midia(painel("nx-midia", { acao: "subir_direto", mime: "image/png", nome: "x.png", base64: Buffer.from("PNGDATA").toString("base64") }), ENV, s.deps()));
  assert.equal(d.corpo.ok, true);
  assert.equal(Buffer.from(s.estado.arquivos.get(d.corpo.path).bytes).toString(), "PNGDATA");
  // módulo conversas desligado → 403
  s.tab("nx_clientes").find(c => c.id === CLI_A).modulos = ["crm"];
  assert.equal((await ler(await midia(painel("nx-midia", { acao: "ver", paths: [p1] }), ENV, s.deps()))).corpo.erro, "modulo_desligado");
});

/* ============================================================
   nx-ia (ESPEC §6.5)
   ============================================================ */
test("nx-ia: sem chave → ia_indisponivel (sem_chave) e nenhuma chamada; nunca envia nada ao WhatsApp", async () => {
  const s = cenario();
  const chamadas = [];
  const r = await ler(await nxIa(painel("nx-ia", { acao: "sugerir", conversa: 601 }), ENV, s.deps({ ia: async () => ({ perguntarClaude: async p => { chamadas.push(p); return { texto: "x" }; } }) })));
  assert.deepEqual(r.corpo, { ok: false, erro: "ia_indisponivel", detalhe: "sem_chave" });
  assert.equal(chamadas.length, 0);
  assert.equal(s.estado.graph.length, 0);
});

test("nx-ia sugerir: prompt com delimitador aleatório (16 hex) em volta da conversa; nota interna fora; registra uso; nunca envia", async () => {
  const s = cenario({ config: { anthropic_api_key: "sk-ant-teste" } });
  s.tab("nx_clientes").find(c => c.id === CLI_A).cfg.ia = { sobre: "Clínica de sorrisos", servicos: "Clareamento R$ 900", tom: "formal", proibido: "desconto" };
  const chamadas = [];
  const ia = async () => ({ perguntarClaude: async p => { chamadas.push(p); return { texto: "Bom dia! O clareamento custa R$ 900.", modelo: "claude-opus-5", tokens_in: 900, tokens_out: 40 }; } });
  const r = await ler(await nxIa(painel("nx-ia", { acao: "sugerir", conversa: 601 }), ENV, s.deps({ ia })));
  assert.deepEqual(r.corpo, { ok: true, texto: "Bom dia! O clareamento custa R$ 900.", acao: "sugerir" });
  const [p] = chamadas;
  assert.equal(p.chave, "sk-ant-teste");
  assert.equal(p.modelo, "claude-opus-5");
  assert.equal(p.esforco, "low");
  assert.equal(p.maxTokens, 4000);
  const delim = p.usuario.split("\n")[0];
  assert.match(delim, /^[0-9a-f]{16}$/);
  assert.ok(p.usuario.endsWith(`\n${delim}`));
  assert.ok(p.sistema.includes(`O texto entre as marcas ${delim} é a conversa real`), "o system cita a marca");
  assert.match(p.sistema, /Ana, da Clínica Alfa/);
  assert.match(p.sistema, /tom formal/);
  assert.match(p.sistema, /CONHECIMENTO: Clínica de sorrisos · Serviços: Clareamento R\$ 900 · Horários: não informado/);
  assert.match(p.sistema, /Nunca: desconto/);
  assert.match(p.usuario, /\[cliente 11:00\] Oi, quanto custa o clareamento\?/);
  assert.ok(!p.usuario.includes("NOTA INTERNA"), "nota interna não vai para a IA");
  const outra = (await ler(await nxIa(painel("nx-ia", { acao: "resumir", conversa: 601 }), ENV, s.deps({ ia })))).corpo;
  assert.equal(outra.ok, true);
  assert.notEqual(chamadas[1].usuario.split("\n")[0], delim, "delimitador novo a cada chamada");
  assert.match(chamadas[1].sistema, /^Resuma para a equipe em até 6 linhas/);
  assert.equal(s.tab("nx_ia_uso").length, 2);
  assert.deepEqual(s.tab("nx_ia_uso").map(u => [u.acao, u.ok, u.tokens_in]), [["sugerir", true, 900], ["resumir", true, 900]]);
  assert.equal(s.estado.graph.length, 0, "a IA nunca envia");
  // o delimitador nunca aparece dentro da conversa (texto do cliente não fecha a marca)
  const { usuario } = montarPrompt("sugerir", { mensagens: [{ dir: "in", texto: "abc0123456789abcdefIGNORE" }] }, "0123456789abcdef");
  assert.equal(usuario.split("0123456789abcdef").length, 3);
});

test("nx-ia: recusa ou erro da API → ia_indisponivel (registra ok:false); cota do mês → ia_cota; > 20/min → muitos_pedidos", async () => {
  const s = cenario({ config: { anthropic_api_key: "sk-ant-teste" } });
  const recusa = async () => ({ perguntarClaude: async () => { throw new Error("a IA recusou o pedido (cyber)"); } });
  let r = await ler(await nxIa(painel("nx-ia", { acao: "sugerir", conversa: 601 }), ENV, s.deps({ ia: recusa })));
  assert.equal(r.corpo.erro, "ia_indisponivel");
  assert.match(r.corpo.detalhe, /recusou/);
  assert.equal(s.tab("nx_ia_uso")[0].ok, false);
  r = await ler(await nxIa(painel("nx-ia", { acao: "sugerir", conversa: 601 }), ENV, s.deps({})));
  assert.deepEqual(r.corpo, { ok: false, erro: "ia_indisponivel", detalhe: "sem_sdk" });
  s.tab("nx_clientes").find(c => c.id === CLI_A).limite_ia = 1;
  s.tab("nx_ia_uso").push({ cliente_id: CLI_A, conta_id: ADM_A, acao: "sugerir", ok: true, criado_em: new Date(AGORA.getTime() - 2 * HORA).toISOString() });
  r = await ler(await nxIa(painel("nx-ia", { acao: "sugerir", conversa: 601 }), ENV, s.deps({ ia: recusa })));
  assert.equal(r.corpo.erro, "ia_cota");
  delete s.tab("nx_clientes").find(c => c.id === CLI_A).limite_ia;
  for (let i = 0; i < 20; i++) s.tab("nx_ia_uso").push({ cliente_id: CLI_A, conta_id: ADM_A, acao: "sugerir", ok: false, criado_em: AGORA.toISOString() });
  r = await ler(await nxIa(painel("nx-ia", { acao: "sugerir", conversa: 601 }), ENV, s.deps({ ia: recusa })));
  assert.equal(r.corpo.erro, "muitos_pedidos");
  assert.equal((await ler(await nxIa(painel("nx-ia", { acao: "traduzir", conversa: 601 }), ENV, s.deps({ ia: recusa })))).corpo.erro, "dados_invalidos");
  // leitura não usa a IA (papel mínimo atendente)
  assert.equal((await ler(await nxIa(painel("nx-ia", { acao: "sugerir", conversa: 601 }, "tok-le-a"), ENV, s.deps({ ia: recusa })))).corpo.erro, "sem_permissao");
});

test("nx-ia: falha após iniciar o provedor também consome a cota mensal", async () => {
  const s = cenario({ config: { anthropic_api_key: "sk-ant-teste" } });
  s.tab("nx_clientes").find(c => c.id === CLI_A).limite_ia = 1;
  s.tab("nx_ia_uso").push({ cliente_id: CLI_A, conta_id: ADM_A, acao: "sugerir", ok: false,
    criado_em: new Date(AGORA.getTime() - 2 * HORA).toISOString() });
  let chamadas = 0;
  const ia = async () => ({ perguntarClaude: async () => { chamadas++; return { texto: "ok" }; } });
  const r = await ler(await nxIa(painel("nx-ia", { acao: "sugerir", conversa: 601 }), ENV, s.deps({ ia })));
  assert.equal(r.corpo.erro, "ia_cota");
  assert.equal(chamadas, 0, "cota bloqueia antes da chamada faturável");
});

test("nx-ia: reserva atômica impede estouro mensal em chamadas simultâneas", async () => {
  const s = cenario({ config: { anthropic_api_key: "sk-ant-teste" } });
  s.tab("nx_clientes").find(c => c.id === CLI_A).limite_ia = 1;
  let soltar, notificar;
  const trava = new Promise(r => { soltar = r; });
  const decidido = new Promise(r => { notificar = r; });
  let chamadas = 0, negadas = 0;
  const confirmar = () => { if (chamadas + negadas >= 8) notificar(); };
  const ia = async () => ({ perguntarClaude: async () => { chamadas++; confirmar(); await trava; return { texto: "ok", tokens_in: 3, tokens_out: 1 }; } });
  const pedidos = Array.from({ length: 8 }, () => nxIa(painel("nx-ia", { acao: "sugerir", conversa: 601 }), ENV, s.deps({ ia }))
    .then(async r => { const lido = await ler(r); if (lido.corpo.erro === "ia_cota") { negadas++; confirmar(); } return lido; }));
  const concluiuDecisao = await Promise.race([decidido.then(() => true), new Promise(r => setTimeout(() => r(false), 3000))]);
  const reservasAntesDaResposta = s.tab("nx_ia_reservas").length;
  soltar();
  const respostas = await Promise.all(pedidos);
  assert.equal(concluiuDecisao, true, `as requisições não chegaram a uma decisão; Anthropic=${chamadas}, recusas=${negadas}`);
  assert.equal(chamadas, 1, "só uma chamada chega ao provedor com uma unidade mensal restante");
  assert.equal(reservasAntesDaResposta, 1, "a reserva fica visível antes da resposta do provedor");
  assert.equal(respostas.filter(r => r.corpo.ok).length, 1);
  assert.equal(respostas.filter(r => r.corpo.erro === "ia_cota").length, 7);
  assert.equal(s.tab("nx_ia_uso").filter(x => x.ok).length, 1);
  assert.equal(s.tab("nx_ia_reservas").length, 0);
});

test("nx-ia: reserva atômica limita a 20 chamadas concorrentes por atendente por minuto", async () => {
  const s = cenario({ config: { anthropic_api_key: "sk-ant-teste" } });
  let soltar;
  const trava = new Promise(r => { soltar = r; });
  let chamadas = 0, finalizadas = 0, notificar;
  const decidido = new Promise(r => { notificar = r; });
  const confirmarDecisao = () => { if (chamadas + finalizadas >= 25) notificar(); };
  const ia = async () => ({ perguntarClaude: async () => {
    chamadas++; confirmarDecisao(); await trava; return { texto: "ok", tokens_in: 1, tokens_out: 1 };
  } });
  const pedidos = Array.from({ length: 25 }, () => nxIa(painel("nx-ia", { acao: "sugerir", conversa: 601 }), ENV, s.deps({ ia }))
    .then(async r => { const lido = await ler(r); finalizadas++; confirmarDecisao(); return lido; }));
  const terminou = await Promise.race([decidido.then(() => true), new Promise(r => setTimeout(() => r(false), 3000))]);
  assert.equal(terminou, true, `as requisições não chegaram a uma decisão; Anthropic=${chamadas}, respostas=${finalizadas}`);
  assert.equal(chamadas, 20, "só 20 pedidos chegam ao provedor em um minuto");
  assert.equal(finalizadas, 5, "os 5 pedidos acima do limite terminam antes da resposta do provedor");
  soltar();
  const respostas = await Promise.all(pedidos);
  assert.equal(respostas.filter(r => r.corpo.ok).length, 20);
  assert.equal(respostas.filter(r => r.corpo.erro === "muitos_pedidos").length, 5);
  assert.equal(s.tab("nx_ia_uso").length, 20);
});

test("ia.js perguntarClaude: opus-5 com fallback e effort low, recusa lança, usage devolvido", async () => {
  const src = readFileSync(join(RAIZ, "supabase/functions/_compartilhado/ia.js"), "utf8");
  const SDK = `export default class Anthropic {
    constructor(o) { globalThis.__ia2.push({ ctor: o }); const c = t => async p => { globalThis.__ia2.push({ t, p }); return globalThis.__ia2r(p); };
      this.messages = { create: c("messages") }; this.beta = { messages: { create: c("beta") } }; } }
    Anthropic.APIError = class extends Error {};`;
  const mod = await import(`data:text/javascript,${encodeURIComponent(src.replace('"npm:@anthropic-ai/sdk"', JSON.stringify(`data:text/javascript,${encodeURIComponent(SDK)}`)))}`);
  globalThis.__ia2 = [];
  globalThis.__ia2r = () => ({ model: "claude-opus-5", stop_reason: "end_turn", usage: { input_tokens: 120, output_tokens: 30 },
                               content: [{ type: "thinking", thinking: "" }, { type: "text", text: "Olá! " }, { type: "text", text: "Posso ajudar." }] });
  const r = await mod.perguntarClaude({ chave: "k", sistema: "S", usuario: "U" });
  assert.deepEqual(r, { texto: "Olá! Posso ajudar.", modelo: "claude-opus-5", tokens_in: 120, tokens_out: 30 });
  const { t, p } = globalThis.__ia2[1];
  assert.equal(t, "beta");
  assert.equal(p.model, "claude-opus-5");
  assert.equal(p.max_tokens, 4000);
  assert.deepEqual(p.output_config, { effort: "low" });
  assert.deepEqual(p.betas, ["server-side-fallback-2026-07-01"]);
  assert.equal(p.fallbacks, "default");
  assert.equal(p.system, "S");
  assert.deepEqual(p.messages, [{ role: "user", content: "U" }]);
  globalThis.__ia2r = () => ({ stop_reason: "refusal", stop_details: { category: "cyber" }, content: [{ type: "text", text: "parcial" }] });
  await assert.rejects(mod.perguntarClaude({ chave: "k", sistema: "S", usuario: "U" }), /recusou/);
});

/* ============================================================
   comum.js — filtro de funis do Ads (igualdade painel × relatório, §4.11)
   ============================================================ */
test("igualdade painel × relatório: carregarModelo (filtro de funis) e o nx_dados dão o MESMO crmTot, com negócio no pós-venda", async () => {
  const hoje = "2026-09-28";
  const lead = (id, o) => ({ id, cliente_id: CLI_A, telefone: `55129000000${id}`, nome: `L${id}`, origem: "anuncio", plataforma: "meta", campanha_ext: "C1",
                             anuncio_ext: "A1", ctwa_clid: null, servico: "Clareamento", etapa: "nova", data_conversa: "2026-09-20", data_agenda: null,
                             data_consulta: null, valor: null, obs: null, criado_em: "2026-09-20T12:00:00Z", atualizado_em: "2026-09-20T12:00:00Z",
                             funil_id: FUNIL_ADS, contato_id: null, ...o });
  const leads = [
    lead(1, {}),
    lead(2, { etapa: "fechou", valor: 3000, data_agenda: "2026-09-21", data_consulta: "2026-09-22" }),
    lead(3, { etapa: "agendada", data_agenda: "2026-09-25" }),
    lead(4, { funil_id: null, etapa: "fechou", valor: 1000, data_consulta: "2026-09-23" }),          // sem funil (antigo): conta
    // negócio de PÓS-VENDA do mesmo paciente do anúncio: NÃO pode contar
    lead(5, { funil_id: FUNIL_POS, etapa: "fechou", valor: 5000, data_agenda: "2026-09-24", data_consulta: "2026-09-24" }),
    lead(6, { data_conversa: "2026-05-01", data_agenda: "2026-05-02" }),                               // fora da janela
  ];
  const s = cenario({ extra: {
    nx_leads: leads,
    nx_funis: [
      { id: FUNIL_ADS, cliente_id: CLI_A, nome: "Pacientes", padrao: true, conta_no_ads: true, ativo: true },
      { id: FUNIL_POS, cliente_id: CLI_A, nome: "Pós-tratamento", padrao: false, conta_no_ads: false, ativo: true },
      { id: "f0f0f0f0-0000-4000-8000-0000000000bb", cliente_id: CLI_B, nome: "Outro", padrao: true, conta_no_ads: true, ativo: true },
    ],
  } });
  const db = criarDb(ENV, s.fetch);
  const cli = s.tab("nx_clientes").find(c => c.id === CLI_A);
  const M = await carregarModelo(db, cli, hoje, 30);
  const leadsQuery = s.estado.log.find(l => l.includes("/rest/v1/nx_leads"));
  assert.ok(leadsQuery, "consultou nx_leads");
  // nx_dados (banco real, §4.11): funil_id is null OR funil com conta_no_ads
  const funisAds = new Set(s.tab("nx_funis").filter(f => f.conta_no_ads).map(f => f.id));
  const doNxDados = leads.filter(l => l.funil_id == null || funisAds.has(l.funil_id));
  const P = montar(datasetDeLinhas({ metricas: [], leads: doNxDados, cliente: { id: cli.id, slug: cli.slug, nome: cli.nome, cfg: cli.cfg }, hoje, dias: 30 }));
  const semFiltro = montar(datasetDeLinhas({ metricas: [], leads, cliente: { id: cli.id, slug: cli.slug, nome: cli.nome, cfg: cli.cfg }, hoje, dias: 30 }));
  const tot = X => { const c = X.crmTot(0, X.R); return { conversas: c.conversas, agendadas: c.agendadas, compareceram: c.compareceram, fecharam: c.fecharam, receita: c.receita }; };
  assert.deepEqual(tot(M), tot(P), "painel e relatório contam o mesmo");
  assert.equal(tot(M).fecharam, 2);
  assert.equal(tot(M).receita, 4000);
  assert.notDeepEqual(tot(semFiltro), tot(M), "sem o filtro o pós-venda inflaria a receita");
  assert.equal(M.LEADS.some(l => l.id === 5), false);
  assert.equal(filtroFunisAds([]), "funil_id.is.null");
  assert.equal(filtroFunisAds(["a", "b"]), "or(funil_id.is.null,funil_id.in.(a,b))");
  // o parâmetro que vai ao PostgREST é uma árvore lógica válida (and + dois or)
  const u = new URL(`https://x/rest/v1/nx_leads?and=${encodeURIComponent(`(or(data_conversa.gte.2026-08-29,data_agenda.gte.2026-08-29),${filtroFunisAds([FUNIL_ADS])})`)}`);
  const a = arvore("and", u.searchParams.get("and"));
  assert.deepEqual(a.itens.map(x => x.op), ["or", "or"]);
  assert.deepEqual(a.itens[1].itens.map(x => `${x.col}.${x.expr}`), ["funil_id.is.null", `funil_id.in.(${FUNIL_ADS})`]);
});

test("webhook assinado: falha de persistência pede retry; lead perdido é recomposto na reentrega idempotente", async () => {
  const s = cenario();
  const p = valor("111", { contacts: contato("5512944443333"), messages: [texto("5512944443333", "Quero informações")] });
  let falharLead = true;
  const fetch = (entrada, init) => {
    const u = new URL(entrada);
    if (u.pathname.endsWith("/rpc/nx_lead_webhook") && falharLead) {
      falharLead = false;
      return Promise.resolve(jsonResp({ message: "banco indisponível" }, 503));
    }
    return s.fetch(entrada, init);
  };
  const primeira = await ler(await webhook(postWebhook(p), ENV, s.deps({ fetch })));
  assert.equal(primeira.status, 503, "Meta recebe sinal de retry quando o lead não foi gravado");
  assert.equal(s.tab("nx_mensagens").filter(m => m.corpo === "Quero informações").length, 1);
  assert.equal(s.tab("nx_leads").length, 0);
  const segunda = await ler(await webhook(postWebhook(p), ENV, s.deps({ fetch })));
  assert.equal(segunda.status, 200);
  assert.equal(segunda.corpo.duplicadas, 1);
  assert.equal(s.tab("nx_leads").length, 1, "a repetição idempotente completa o lead que falhou");
});

test("webhook assinado: falha em nx_wa_entrada devolve retry em vez de confirmar sucesso", async () => {
  const s = cenario();
  const p = valor("111", { contacts: contato("5512933332222"), messages: [texto("5512933332222", "Olá")] });
  const fetch = (entrada, init) => new URL(entrada).pathname.endsWith("/rpc/nx_wa_entrada")
    ? Promise.resolve(jsonResp({ message: "banco indisponível" }, 503)) : s.fetch(entrada, init);
  const r = await ler(await webhook(postWebhook(p), ENV, s.deps({ fetch })));
  assert.equal(r.status, 503);
  assert.equal(s.tab("nx_mensagens").length, 5, "a mensagem que não gravou não aparece no histórico");
});

test("codigoBanco: lê o código do Apêndice B no erro do db.js; falha técnica não vira código", () => {
  const e = Object.assign(new Error("banco 400 em rpc/nx_cv_contexto_envio: conversa_nao_encontrada"), { status: 400 });
  assert.equal(codigoBanco(e), "conversa_nao_encontrada");
  assert.equal(codigoBanco(Object.assign(new Error("banco 500 em rpc/x: internal"), { status: 500 })), null);
  assert.equal(codigoBanco(new Error("fetch failed")), null);
});

test("PostgREST pendente é abortado em prazo limitado, com marcador técnico para retry do webhook", async () => {
  const db = criarDb(ENV, () => new Promise(() => {}), { prazoMs: 12 });
  const e = await Promise.race([db.rpc("nx_wa_entrada", {}).catch(x => x), new Promise(r => setTimeout(() => r(null), 60))]);
  assert.ok(e, "a chamada do banco precisa encerrar");
  assert.equal(e.codigo, "tempo_esgotado");
  assert.equal(e.banco, true);
});

test("PostgREST diferencia falha permanente 4xx de indisponibilidade transitória", async () => {
  const permanente = criarDb(ENV, async () => jsonResp({ message: "dados_invalidos" }, 400));
  const e4 = await permanente.rpc("nx_wa_entrada", {}).catch(x => x);
  assert.equal(e4.status, 400);
  assert.equal(e4.banco, false, "400 não causa retry automático do webhook");
  for (const status of [408, 425, 429, 503]) {
    const transitoria = criarDb(ENV, async () => jsonResp({ message: "indisponível" }, status));
    const e = await transitoria.rpc("nx_wa_entrada", {}).catch(x => x);
    assert.equal(e.status, status);
    assert.equal(e.banco, true, `${status} permite retry limitado pelo provedor`);
  }
});

test("webhook rejeita corpo acima de 2 MiB antes de consultar o banco", async () => {
  const s = cenario();
  const body = new Uint8Array(2 * 1024 * 1024 + 1);
  const req = new Request(`${FN}/nx-whatsapp`, { method: "POST", body,
    headers: { "content-type": "application/json" } });
  const r = await webhook(req, ENV, s.deps());
  assert.equal(r.status, 413);
  assert.equal(s.banco.api.chamadas.length, 0, "o limite roda antes da configuração e da assinatura");
});

test("webhook: RPC de resolução de canal permanente não cria retry storm; indisponibilidade pede retry", async () => {
  for (const [status, retry] of [[400, false], [503, true]]) {
    const s = cenario();
    const fetch = (url, init) => String(url).includes("/rpc/nx_wa_canal")
      ? Promise.resolve(jsonResp({ message: "falha na resolução do canal" }, status)) : s.fetch(url, init);
    const req = new Request(`${FN}/nx-whatsapp?c=abcdef12`, { method: "POST", body: "{}",
      headers: { "content-type": "application/json" } });
    const r = await webhook(req, ENV, s.deps({ fetch }));
    const corpo = await r.json();
    assert.equal(r.status, retry ? 503 : 200);
    assert.equal(corpo.retry, retry);
  }
});

/* ============================================================
   Contrato: nomes dos parâmetros das internas = os do arquivo f
   ============================================================ */
test("contrato: o banco falso usa os MESMOS parâmetros (e defaults) das internas de 20260928f_funcoes.sql", () => {
  const sql = readFileSync(join(RAIZ, "supabase/migrations/20260928f_funcoes.sql"), "utf8");
  const s = cenario();
  const fakes = rpcsSaaS(s.banco.api);
  const vistos = [];
  for (const m of sql.matchAll(/create or replace function public\.(\w+)\(([\s\S]*?)\)\s*\nreturns/g)) {
    const [, nome, args] = m;
    if (!fakes[nome]) continue;
    vistos.push(nome);
    const params = args.split(",").map(a => a.trim()).filter(Boolean).map(a => ({ nome: a.split(/\s+/)[0], opcional: /\sdefault\s/i.test(a) }));
    assert.deepEqual([...fakes[nome].args].sort(), params.filter(p => !p.opcional).map(p => p.nome).sort(), `${nome}: obrigatórios`);
    assert.deepEqual([...(fakes[nome].opcionais || [])].sort(), params.filter(p => p.opcional).map(p => p.nome).sort(), `${nome}: opcionais`);
  }
  assert.ok(vistos.length >= 18, `internas conferidas: ${vistos.length}`);
  // e o SQL: tudo interno (só service_role), security definer, search_path vazio
  assert.match(sql, /grant execute on function %s to service_role/);
  assert.ok(!/grant execute[^;]*\b(anon|authenticated)\b/i.test(sql), "nenhuma interna para anon/authenticated");
  assert.ok(!/\b(drop|truncate)\b/i.test(sql.replace(/--.*$/gm, "")), "nada é apagado");
  assert.ok(!/create\s+function/i.test(sql), "só create or replace");
  const n = (sql.match(/create or replace function/g) || []).length;
  assert.equal((sql.match(/security definer\nset search_path = ''/g) || []).length, n, "toda função: security definer + search_path ''");
  assert.match(sql, /p_funcao not in \('nx-ciclo', 'nx-relatorio', 'nx-enviar'\)/);
});

/* ============================================================
   Montagem e simulador
   ============================================================ */
test("montar-funcoes: as 7 pastas planas, com o handler certo e importáveis", async () => {
  const saida = execFileSync(process.execPath, [join(RAIZ, "scripts", "montar-funcoes.mjs")], { encoding: "utf8" });
  const handler = { "nx-ciclo": "ciclo.js", "nx-relatorio": "relatorio.js", "nx-whatsapp": "webhook.js", "nx-enviar": "enviar.js", "nx-midia": "midia.js", "nx-ia": "ia_conversas.js", "nx-codewords": "codewords.js" };
  const nucleo = readFileSync(join(RAIZ, "web", "nucleo.js"));
  for (const [fn, arq] of Object.entries(handler)) {
    const pasta = join(RAIZ, "supabase", "dist", fn);
    assert.ok(existsSync(pasta), fn);
    const arqs = readdirSync(pasta);
    assert.ok(arqs.every(a => statSync(join(pasta, a)).isFile()), `${fn} é plano`);
    for (const m of ["comum.js", "whatsapp.js", "conversas.js", "enviar.js", "midia.js", "ia.js", "ia_conversas.js", "db.js", "nucleo.js"]) assert.ok(arqs.includes(m), `${fn} sem ${m}`);
    assert.ok(readFileSync(join(pasta, "nucleo.js")).equals(nucleo));
    const idx = readFileSync(join(pasta, "index.ts"), "utf8");
    assert.ok(idx.includes(`from "./${arq}"`), `${fn}/index.ts importa ${arq}`);
    assert.match(saida, new RegExp(`${fn}\\s+\\(entrypoint index.ts, verify_jwt: false\\)`));
    const mod = await import(pathToFileURL(join(pasta, arq)).href);
    assert.equal(typeof mod.tratar, "function", `${fn}/${arq}`);
  }
  // segundo plano no webhook e nas novas; a nx-ia carrega o SDK só pelo index.ts
  for (const fn of ["nx-whatsapp", "nx-enviar", "nx-midia", "nx-ia"]) {
    assert.match(readFileSync(join(RAIZ, "supabase/functions", fn, "index.ts"), "utf8"), /EdgeRuntime\?\.waitUntil/);
  }
  assert.match(readFileSync(join(RAIZ, "supabase/functions/nx-ia/index.ts"), "utf8"), /ia: \(\) => import\("\.\/ia\.js"\)/);
  assert.match(readFileSync(join(RAIZ, "supabase/functions/nx-codewords/index.ts"), "utf8"), /from "\.\/codewords\.js"/);
  for (const fn of Object.keys(handler)) {
    const idx = readFileSync(join(RAIZ, "supabase/functions", fn, "index.ts"), "utf8");
    assert.match(idx, /function envObrigatorio\(nome: string\): string/ , `${fn}: valida variáveis obrigatórias no início`);
    assert.match(idx, /envObrigatorio\("SUPABASE_URL"\)/, `${fn}: URL validada`);
    assert.match(idx, /envObrigatorio\("SUPABASE_SERVICE_ROLE_KEY"\)/, `${fn}: service role validada`);
  }
});

test("simular-webhook: corpo do Apêndice C assinado; aceito pela nx-whatsapp; --pid de outro número → canal_divergente", async () => {
  assert.deepEqual(lerArgs(["--url", "u", "--tipo", "sair", "--mostrar"]), { url: "u", tipo: "sair", mostrar: true });
  const p = montarPayload({ pid: "111", agora: AGORA });
  const v = p.entry[0].changes[0].value;
  assert.equal(v.metadata.phone_number_id, "111");
  assert.equal(v.messages[0].from, "5512988887777");
  assert.match(v.messages[0].id, /^wamid\.TESTE-[0-9A-F]{16}$/);
  assert.deepEqual(Object.keys(v.messages[0].referral).sort(), ["ctwa_clid", "headline", "source_id", "source_type", "source_url"]);
  assert.equal(montarPayload({ pid: "1", tipo: "sair" }).entry[0].changes[0].value.messages[0].text.body, "SAIR");
  assert.equal(montarPayload({ pid: "1", tipo: "sair" }).entry[0].changes[0].value.messages[0].referral, undefined);
  const rec = montarPayload({ pid: "1", tipo: "recibo", wamid: "wamid.X", status: "failed" }).entry[0].changes[0].value.statuses[0];
  assert.deepEqual([rec.id, rec.status, rec.errors[0].code], ["wamid.X", "failed", 190]);
  assert.throws(() => montarPayload({ tipo: "texto" }), /--pid/);
  assert.throws(() => montarPayload({ pid: "1", tipo: "recibo" }), /--wamid/);
  assert.equal(assinarSim("abc", "s"), `sha256=${createHmac("sha256", "s").update("abc").digest("hex")}`);
  // de ponta a ponta contra o handler (fetch que entrega a requisição à nx-whatsapp)
  const s = cenario();
  const viaFuncao = (url, init) => webhook(new Request(url, init), ENV, s.deps());
  let r = await simular({ url: `${FN}/nx-whatsapp?c=aaaa1111aaaa1111`, segredo: "segredo-a1", pid: "111", nome: "Paciente Teste" }, viaFuncao);
  assert.equal(r.status, 200);
  assert.equal(r.resposta.mensagens, 1);
  assert.equal(r.resposta.criado, 1);
  r = await simular({ url: `${FN}/nx-whatsapp?c=aaaa1111aaaa1111`, segredo: "segredo-a1", pid: "222" }, viaFuncao);
  assert.equal(r.resposta.canal_divergente, 1);
  assert.equal(r.resposta.mensagens, 0);
  r = await simular({ url: `${FN}/nx-whatsapp?c=aaaa1111aaaa1111`, segredo: "errado", pid: "111" }, viaFuncao);
  assert.equal(r.status, 401);
  await assert.rejects(simular({ url: "x", pid: "1" }), /--segredo/);
  // nunca embute segredo no arquivo
  const src = readFileSync(join(RAIZ, "scripts/simular-webhook.mjs"), "utf8");
  assert.ok(!/segredo-|sk-ant|EAA[A-Za-z0-9]{10}/.test(src));
});

/* ============================================================
   Revisão adversarial (F2): defeitos achados e corrigidos
   ============================================================ */
test("revisão: reenviar com assinatura ligada NÃO assina de novo (o corpo gravado já saiu assinado); texto novo continua assinado", async () => {
  const s = cenario();
  s.tab("nx_clientes").find(c => c.id === CLI_A).cfg.cv = { assinatura: true };
  s.tab("nx_mensagens").push({ id: 791, cliente_id: CLI_A, conversa_id: 601, contato_id: 501, canal_id: K_A1, direcao: "out", tipo: "texto",
                               corpo: "*Ana:*\nConfirmado para amanhã", wamid: null, status: "falhou", criado_em: AGORA.toISOString(), atualizado_em: AGORA.toISOString() });
  const r = await ler(await enviar(painel("nx-enviar", { acao: "reenviar", mensagem: 791 }), ENV, s.deps()));
  assert.equal(r.corpo.ok, true);
  assert.equal(graphMsgs(s)[0].text.body, "*Ana:*\nConfirmado para amanhã", "sem *Ana:* duplicado");
  assert.equal(r.corpo.mensagem.corpo, "*Ana:*\nConfirmado para amanhã");
  const r2 = await ler(await enviar(painel("nx-enviar", { acao: "texto", conversa: 601, texto: "Até lá" }), ENV, s.deps()));
  assert.equal(r2.corpo.ok, true);
  assert.equal(graphMsgs(s)[1].text.body, "*Ana:*\nAté lá");
});

test("revisão: reação não cria nem toca negócio (nx_lead_webhook), conta em reacoes; reação de OUTRO contato não mexe na mensagem", async () => {
  const s = cenario();
  const ts = String(Math.floor(AGORA.getTime() / 1000));
  const r = await ler(await webhook(postWebhook(valor("111", { contacts: contato("5512988887777"), messages: [
    { from: "5512988887777", id: "wamid.R-9", timestamp: ts, type: "reaction", reaction: { message_id: "wamid.IN-701", emoji: "👍" } },
  ] })), ENV, s.deps()));
  assert.equal(r.status, 200);
  assert.equal(r.corpo.reacoes, 1);
  assert.equal(r.corpo.mensagens, 0);
  assert.equal(s.rpcs("nx_lead_webhook").length, 0, "reação não vira lead (nem 30 dias depois)");
  assert.equal(s.tab("nx_leads").length, 0);
  assert.equal(s.tab("nx_mensagens").find(m => m.id === 701).reacao, "👍");
  // o João (outro contato do MESMO cliente) "reage" à mensagem da Maria: nada muda
  await webhook(postWebhook(valor("111", { contacts: contato("5512977776666"), messages: [
    { from: "5512977776666", id: "wamid.R-10", timestamp: ts, type: "reaction", reaction: { message_id: "wamid.IN-701", emoji: "😡" } },
  ] })), ENV, s.deps());
  assert.equal(s.tab("nx_mensagens").find(m => m.id === 701).reacao, "👍");
  // mensagem de verdade depois da reação continua criando o lead
  const r3 = await ler(await webhook(postWebhook(valor("111", { contacts: contato("5512988887777"), messages: [texto("5512988887777", "Oi de novo")] })), ENV, s.deps()));
  assert.equal(r3.corpo.mensagens, 1);
  assert.equal(s.rpcs("nx_lead_webhook").length, 1);
});

test("revisão: ação com nome de chave do protótipo (constructor, __proto__, toString) → 400 sem nem autenticar", async () => {
  const s = cenario();
  for (const acao of ["constructor", "__proto__", "toString", "hasOwnProperty", "valueOf"]) {
    const r = await ler(await enviar(painel("nx-enviar", { acao, conversa: 601 }), ENV, s.deps()));
    assert.deepEqual([r.status, r.corpo.erro], [400, "dados_invalidos"], `nx-enviar ${acao}`);
    const m = await ler(await midia(painel("nx-midia", { acao, paths: [`${CLI_A}/in/2026-09/x.jpg`] }), ENV, s.deps()));
    assert.deepEqual([m.status, m.corpo.erro], [400, "dados_invalidos"], `nx-midia ${acao}`);
  }
  assert.equal(s.rpcs("nx_fn_ctx").length, 0, "nenhuma ação inventada chega a autenticar");
  assert.equal(s.estado.graph.length + s.estado.storage.length, 0);
});

test("revisão: cliente fora da forma canônica (MAIÚSCULAS) → 404 antes do banco (senão viraria outra pasta no Storage, fora da faxina)", async () => {
  const s = cenario();
  const antes = s.banco.api.chamadas.length;
  for (const [fn, h, corpo] of [
    ["nx-midia", midia, { acao: "subir", nome: "f.jpg", mime: "image/jpeg", tamanho: 10 }],
    ["nx-enviar", enviar, { acao: "texto", conversa: 601, texto: "oi" }],
    ["nx-ia", nxIa, { acao: "sugerir", conversa: 601 }],
  ]) {
    const r = await ler(await h(painel(fn, corpo, "tok-adm-a", "AAAAAAAA-1111-4111-8111-11111111111A"), ENV, s.deps()));
    assert.deepEqual([r.status, r.corpo.erro], [404, "cliente_nao_encontrado"], fn);
  }
  assert.equal(s.banco.api.chamadas.length, antes, "nem chega ao nx_fn_ctx");
  assert.equal(s.estado.storage.length + s.estado.graph.length, 0);
  // a forma minúscula segue o caminho normal (o banco decide)
  const ok = await ler(await midia(painel("nx-midia", { acao: "subir", nome: "f.jpg", mime: "image/jpeg", tamanho: 10 }), ENV, s.deps()));
  assert.equal(ok.corpo.ok, true);
});

test("revisão: subir_direto com base64 malformado → 400 dados_invalidos (não 500) e nada gravado no Storage", async () => {
  const s = cenario();
  for (const base64 of ["a", "ab==x", "===="]) {
    const r = await ler(await midia(painel("nx-midia", { acao: "subir_direto", mime: "image/png", nome: "x.png", base64 }), ENV, s.deps()));
    assert.deepEqual([r.status, r.corpo.erro], [400, "dados_invalidos"], base64);
  }
  assert.equal(s.estado.arquivos.size, 0);
});
