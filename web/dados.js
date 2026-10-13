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
  sem_acesso: "Sua conta não tem acesso a esta clínica.",
  so_gestor: "Só a equipe da Nexus pode fazer essa alteração.",
  lead_nao_encontrado: "Paciente não encontrado — ele pode ter sido removido.",
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

/** Texto amigável para um erro lançado por rpc(). */
export function mensagemErro(e) {
  const c = e && (e.codigo || e.message);
  const hint = e && e.detalhe && typeof e.detalhe === "object" && e.detalhe.hint ? String(e.detalhe.hint).trim() : "";
  if (hint && COM_HINT[c]) { const t = COM_HINT[c](hint); if (t) return t; }
  return MENSAGENS[c] || `Não deu certo agora${c ? ` (${String(c).slice(0, 80)})` : ""}. Tente de novo em instantes.`;
}

function erro(codigo, extra = {}) {
  const e = new Error(codigo);
  e.codigo = codigo;
  Object.assign(e, extra);
  return e;
}

/** POST /rest/v1/rpc/<nome>. Erro do PostgREST → Error com .codigo = message. */
export async function rpc(nome, params = {}) {
  let r;
  // AD-200: chamada com o token guardado conta como uso (renova a ociosidade da sessão em origem compartilhada)
  if (params && params.p_token && origemCompartilhada(hostAtual()) && params.p_token === lerToken(Date.now(), { renovar: false })) lerToken();
  try {
    r = await _fetch(`${SUPA_URL}/rest/v1/rpc/${nome}`, {
      method: "POST",
      headers: { apikey: CHAVE_PUBLICA, "Content-Type": "application/json", Accept: "application/json" },
      body: JSON.stringify(params),
    });
  } catch (causa) {
    throw erro("sem_conexao", { causa });
  }
  const txt = await r.text();
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
const armazem = () => (origemCompartilhada(hostAtual()) ? sessao_() : local());
/** Token velho no localStorage de uma origem compartilhada: some daqui e é encerrado no servidor (pode já ter sido lido). */
function expulsarLegado() {
  if (!origemCompartilhada(hostAtual())) return;
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
    if (!origemCompartilhada(hostAtual())) return bruto;
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
  if (!origemCompartilhada(hostAtual())) return false;
  if (agora - _ultimoToque < TOQUE_MIN_MS && agora >= _ultimoToque) return false;
  if (lerToken(agora, { renovar: false }) == null) return false;     // sem sessão (ou vencida): nada a renovar
  _ultimoToque = agora;
  return lerToken(agora) != null;
}
export function guardarToken(t, agora = Date.now()) {
  expulsarLegado();
  try {
    if (origemCompartilhada(hostAtual())) armazem()?.setItem(CHAVE_TOKEN, JSON.stringify({ t: String(t), em: agora, uso: agora }));
    else armazem()?.setItem(CHAVE_TOKEN, t);
  } catch { /* modo privado */ }
}
export function apagarToken() { try { armazem()?.removeItem(CHAVE_TOKEN); } catch { /* modo privado */ } }
