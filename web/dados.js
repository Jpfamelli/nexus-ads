/* ============================================================
   NEXUS ADS — dados.js
   Cliente das RPCs do Supabase (contrato §2). Sem SDK: fetch puro.
   A chave pública vai só no header "apikey" — mandar ela também em
   "Authorization: Bearer" faz o PostgREST tratá-la como JWT e recusar.
   ============================================================ */

export const SUPA_URL = "https://dtjznipitihnwmcgpzqh.supabase.co";
export const CHAVE_PUBLICA = "sb_publishable_jy1CT7Lwi3gdPUAVSE791w_tOqYLVZr";
export const CHAVE_TOKEN = "nx-token";

// resolvido na hora da chamada: os testes trocam o fetch com usarFetch()
let _fetch = (...a) => globalThis.fetch(...a);
let _aoSessaoInvalida = null;

/** Troca a função de rede (testes). */
export function usarFetch(f) { _fetch = f || ((...a) => globalThis.fetch(...a)); }
/** Chamado sempre que o servidor responder "sessao_invalida" — o painel volta para o login. */
export function aoSessaoInvalida(fn) { _aoSessaoInvalida = fn; }

export const MENSAGENS = {
  sessao_invalida: "Sua sessão expirou. Entre de novo.",
  conta_pendente: "Sua conta ainda está aguardando a aprovação da Nexus.",
  credenciais_invalidas: "E-mail ou senha não conferem.",
  codigo_invalido: "Código de ativação inválido. Confira com a Nexus.",
  email_invalido: "Esse e-mail não parece válido.",
  email_em_uso: "Já existe uma conta com esse e-mail. Tente entrar.",
  senha_curta: "A senha precisa ter pelo menos 8 caracteres.",
  nome_invalido: "Informe o nome.",
  // plano 1000b · AB-167: textos neutros (oficina e loja também usam o clássico)
  sem_acesso: "Sua conta não tem acesso a esta empresa.",
  so_gestor: "Só a equipe da Nexus pode fazer essa alteração.",
  lead_nao_encontrado: "Contato não encontrado — ele pode ter sido removido.",
  cliente_nao_encontrado: "Cliente não encontrado.",
  nao_pode_rebaixar_a_si: "Você não pode tirar o seu próprio acesso de gestor.",
  papel_invalido: "Tipo de conta inválido.",
  sem_conexao: "Sem conexão com o servidor. Confira a internet e tente de novo.",
  // códigos do Órbita (ESPEC, Apêndice B) que as mesmas RPCs devolvem ao clássico
  sem_permissao: "Seu acesso não permite fazer isso. Fale com o administrador.",
  conta_suspensa: "O acesso desta empresa está suspenso. Fale com o suporte.",
  teste_expirado: "O período de teste terminou. Para continuar, fale com o suporte.",
  modulo_desligado: "Esta área não faz parte do seu plano.",
  so_plataforma: "Só a equipe da plataforma pode fazer essa alteração.",
  cliente_pausado: "Este cliente está pausado pela Nexus. Fale com o suporte para reativar.",
  slug_em_uso: "Esse identificador já está em uso. Escolha outro.",
  numero_em_uso: "Esse número de WhatsApp já está ligado a outro cliente.",
  dominio_em_uso: "Esse domínio já está em uso.",
  limite_atingido: "O plano chegou ao limite. Para aumentar, fale com o suporte.",
  limite_plano: "O plano chegou ao limite. Para aumentar, fale com o suporte.",
  funcao_invalida: "Essa tarefa não pode ser executada daqui.",
  dados_invalidos: "Confira os dados informados.",
  telefone_invalido: "Confira o telefone informado.",
  telefone_em_uso: "Já existe um cadastro com esse telefone.",
  valor_obrigatorio: "Informe o valor para marcar como fechado.",
  tempo_esgotado: "Operação grande demais; tente um período menor.",
  periodo_grande: "Escolha um período de até 1 ano.",
  muitas_tentativas: "Muitas tentativas de entrada. Aguarde alguns minutos e tente de novo.",
};

/** Alguns códigos vêm com `hint` do servidor que completa a frase (minutos do bloqueio, chave do limite). */
const COM_HINT = {
  muitas_tentativas: h => (/^\d+$/.test(h) ? `Muitas tentativas de entrada. Tente de novo em ${h} min.` : `Muitas tentativas de entrada. ${h}`),
  limite_plano: h => { const m = /^(\w+):(\d+)$/.exec(h); return m ? `Seu plano permite até ${m[2]} ${m[1].replace(/^org_/, "")}. Para aumentar, fale com o suporte.` : null; },
  limite_atingido: h => { const m = /^(\w+):(\d+)$/.exec(h); return m ? `Seu plano permite até ${m[2]} ${m[1].replace(/^org_/, "")}. Para aumentar, fale com o suporte.` : null; },
};

/** Texto amigável para um erro lançado por rpc().
    Plano 1000b · AB-166: o código cru («(http_502)», «(PGRST301)») não vai mais para a tela — http 5xx vira «servidor fora agora» e os
    demais códigos desconhecidos ficam só no console (para quem for depurar). */
export function mensagemErro(e) {
  const c = e && (e.codigo || e.message);
  const hint = e && e.detalhe && typeof e.detalhe === "object" && e.detalhe.hint ? String(e.detalhe.hint).trim() : "";
  if (hint && COM_HINT[c]) { const t = COM_HINT[c](hint); if (t) return t; }
  if (MENSAGENS[c]) return MENSAGENS[c];
  if (/^http_5\d\d$/.test(String(c || ""))) return "O servidor está fora agora. Tente em instantes.";
  if (c) { try { console.warn("[nexus] erro sem tradução:", String(c).slice(0, 80)); } catch { /* sem console */ } }
  return "Não deu certo agora. Tente de novo em instantes.";
}

function erro(codigo, extra = {}) {
  const e = new Error(codigo);
  e.codigo = codigo;
  Object.assign(e, extra);
  return e;
}

/** Plano 1000b · AB-165: tempo-limite de cada chamada (rede presa deixava o clássico em «Carregando» para sempre). */
export const TEMPO_LIMITE_MS = 30e3;

/** POST /rest/v1/rpc/<nome>. Erro do PostgREST → Error com .codigo = message. */
export async function rpc(nome, params = {}) {
  let r, txt;
  // AD-200: chamada com o token guardado conta como uso (renova a ociosidade da sessão em origem compartilhada)
  if (params && params.p_token && modoSessao() && params.p_token === lerToken(Date.now(), { renovar: false })) lerToken();
  // AB-165: AbortController + corrida com o relógio — mesmo um fetch que ignora o sinal não prende a tela; estoura com «tempo_esgotado»
  const ctl = typeof AbortController === "function" ? new AbortController() : null;
  let tLimite = null;
  const limite = new Promise((_, rej) => { tLimite = setTimeout(() => { try { ctl && ctl.abort(); } catch { /* ok */ } rej(erro("tempo_esgotado")); }, TEMPO_LIMITE_MS); });
  limite.catch(() => { /* tratado na corrida */ });
  try {
    try {
      r = await Promise.race([_fetch(`${SUPA_URL}/rest/v1/rpc/${nome}`, {
        method: "POST",
        headers: { apikey: CHAVE_PUBLICA, "Content-Type": "application/json", Accept: "application/json" },
        body: JSON.stringify(params),
        ...(ctl ? { signal: ctl.signal } : {}),
      }), limite]);
    } catch (causa) {
      if (causa && causa.codigo === "tempo_esgotado") throw causa;
      throw erro("sem_conexao", { causa });
    }
    // AB-168: a conexão pode cair no meio da leitura do corpo — também é «sem conexão», nunca um TypeError cru
    try { txt = await Promise.race([r.text(), limite]); }
    catch (causa) {
      if (causa && causa.codigo === "tempo_esgotado") throw causa;
      throw erro("sem_conexao", { causa });
    }
  } finally { clearTimeout(tLimite); }
  let corpo = null;
  try { corpo = txt ? JSON.parse(txt) : null; } catch { corpo = txt; }
  if (!r.ok) {
    const codigo = (corpo && typeof corpo === "object" && corpo.message) || `http_${r.status}`;
    const e = erro(codigo, { status: r.status, detalhe: corpo });
    if (codigo === "sessao_invalida" && _aoSessaoInvalida) {
      try { _aoSessaoInvalida(e); } catch { /* o painel decide o que fazer */ }
    }
    throw e;
  }
  return corpo;
}

/* ---------- conta e sessão ---------- */
export const criarConta = ({ email, senha, nome, codigo }) =>
  rpc("nx_criar_conta", { p_email: email, p_senha: senha, p_nome: nome, ...(codigo ? { p_codigo: codigo } : {}) });
export const entrar = (email, senha) => rpc("nx_entrar", { p_email: email, p_senha: senha });
export const sair = token => rpc("nx_sair", { p_token: token });
export const sessao = token => rpc("nx_sessao", { p_token: token });

/* ---------- dados do cliente ---------- */
export const dados = (token, cliente, dias = 130) => rpc("nx_dados", { p_token: token, p_cliente: cliente, p_dias: dias });
export const leadSalvar = (token, cliente, lead) => rpc("nx_lead_salvar", { p_token: token, p_cliente: cliente, p_lead: lead });

/* ---------- gestor ---------- */
export const clienteSalvar = (token, cliente) => rpc("nx_cliente_salvar", { p_token: token, p_cliente: cliente });
export const integracaoSalvar = (token, cliente, canal, cred, ativo) =>
  rpc("nx_integracao_salvar", { p_token: token, p_cliente: cliente, p_canal: canal, p_cred: cred || {}, p_ativo: !!ativo });
export const integracoesStatus = (token, cliente) => rpc("nx_integracoes_status", { p_token: token, p_cliente: cliente });
export const contasListar = token => rpc("nx_contas_listar", { p_token: token });
export const contaDefinir = (token, conta, aprovado, papel, clientes) =>
  rpc("nx_conta_definir", { p_token: token, p_conta: conta, p_aprovado: !!aprovado, p_papel: papel, p_clientes: clientes || [] });
export const configVer = token => rpc("nx_config_ver", { p_token: token });
export const configSalvar = (token, cfg) => rpc("nx_config_salvar", { p_token: token, p_cfg: cfg });
export const executar = (token, tarefa, corpo = {}) => rpc("nx_executar", { p_token: token, p_tarefa: tarefa, p_corpo: corpo });

/* ---------- token no navegador ----------
   Plano 1000 (AD-200): o clássico mora em jpfamelli.github.io — a MESMA origem de todos os outros sites do GitHub Pages
   da conta (lojas, sites de clientes). O localStorage de uma origem é lido por qualquer script dela: o token do gestor
   (acesso a todos os clientes) ficava à mão de qualquer um desses sites, para sempre. Em origem compartilhada
   (*.github.io) o token vai para o sessionStorage (só a aba que entrou; some ao fechar) com validade curta e renovada
   no uso (TOKEN_OCIOSO_MS sem uso → sai) e teto absoluto (TOKEN_TETO_MS desde a entrada); o token antigo do
   localStorage é apagado e encerrado no servidor. Em origem própria (Órbita no Netlify, localhost) nada muda. */
export const TOKEN_OCIOSO_MS = 2 * 3600e3;     // 2 h sem uso
export const TOKEN_TETO_MS = 12 * 3600e3;      // 12 h desde a entrada, mesmo em uso
/** Origem dividida com sites de terceiros (GitHub Pages de usuário/organização). */
export const origemCompartilhada = host => /(^|\.)github\.io$/i.test(String(host || ""));
const hostAtual = () => { try { return globalThis.location ? globalThis.location.hostname : ""; } catch { return ""; } };
const local = () => { try { return globalThis.localStorage || null; } catch { return null; } };
const sessao_ = () => { try { return globalThis.sessionStorage || null; } catch { return null; } };
/** Plano 1000b · UB-167: «Lembrar neste aparelho» desmarcado no login do Órbita grava nx-app-compartilhado = "1" (app.js, AS-185) ANTES
    de guardar o token — aparelho compartilhado (recepção) passa a guardar o token como na origem compartilhada: sessionStorage (some ao
    fechar o navegador), com a mesma ociosidade e o mesmo teto. Antes só o cache em disco desligava e o token seguia no localStorage. */
export const CHAVE_COMPARTILHADO = "nx-app-compartilhado";
export const aparelhoCompartilhado = () => { try { return local()?.getItem(CHAVE_COMPARTILHADO) === "1"; } catch { return false; } };
const modoSessao = () => origemCompartilhada(hostAtual()) || aparelhoCompartilhado();
const armazem = () => (modoSessao() ? sessao_() : local());
/** Token velho no localStorage de uma origem compartilhada (ou de um aparelho que passou a ser compartilhado): some daqui e é encerrado
    no servidor (pode já ter sido lido). */
function expulsarLegado() {
  if (!modoSessao()) return;
  let velho = null;
  try { velho = local()?.getItem(CHAVE_TOKEN) || null; local()?.removeItem(CHAVE_TOKEN); } catch { /* bloqueado */ }
  if (velho) Promise.resolve().then(() => rpc("nx_sair", { p_token: velho })).catch(() => { /* fora do ar: o servidor vence a sessão sozinho */ });
}
/** lerToken(agora, {renovar}) — renovar:false só confere (o relógio de ociosidade da aba não conta como uso). */
export function lerToken(agora = Date.now(), { renovar = true } = {}) {
  expulsarLegado();
  try {
    const bruto = armazem()?.getItem(CHAVE_TOKEN) || null;
    if (!bruto) return null;
    if (!modoSessao()) return bruto;
    let o = null;
    try { o = JSON.parse(bruto); } catch { o = null; }
    if (!o || typeof o.t !== "string" || !(o.em > 0) || !(o.uso > 0)) { apagarToken(); return null; }
    if (agora - o.uso > TOKEN_OCIOSO_MS || agora - o.em > TOKEN_TETO_MS) {
      apagarToken();
      Promise.resolve().then(() => rpc("nx_sair", { p_token: o.t })).catch(() => { /* ok */ });
      return null;
    }
    if (renovar) armazem()?.setItem(CHAVE_TOKEN, JSON.stringify({ ...o, uso: agora }));
    return o.t;
  } catch { return null; }
}
/** Revisão 13/10: em origem compartilhada a ociosidade só renovava em RPC — trocar aba, período ou plataforma (tudo local)
    não contava e a pessoa caía no login no meio do uso. O painel chama isto em clique/tecla; grava no máximo 1×/min.
    Devolve true quando renovou. Fora de origem compartilhada não faz nada. */
export const TOQUE_MIN_MS = 60e3;
let _ultimoToque = 0;
export function renovarUso(agora = Date.now()) {
  if (!modoSessao()) return false;
  if (agora - _ultimoToque < TOQUE_MIN_MS && agora >= _ultimoToque) return false;
  if (lerToken(agora, { renovar: false }) == null) return false;     // sem sessão (ou vencida): nada a renovar
  _ultimoToque = agora;
  return lerToken(agora) != null;
}
export function guardarToken(t, agora = Date.now()) {
  expulsarLegado();
  try {
    if (modoSessao()) armazem()?.setItem(CHAVE_TOKEN, JSON.stringify({ t: String(t), em: agora, uso: agora }));
    else { armazem()?.setItem(CHAVE_TOKEN, t); try { sessao_()?.removeItem(CHAVE_TOKEN); } catch { /* ok */ } }   // UB-167: voltou a «lembrar»
  } catch { /* modo privado */ }
}
export function apagarToken() { try { armazem()?.removeItem(CHAVE_TOKEN); } catch { /* modo privado */ } }
