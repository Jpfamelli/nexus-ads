/* ============================================================
   ÓRBITA — rede.js · frente B · M14 (estado de conexão honesto e recuperação automática)
   Quatro estados: online · lento · offline · servidor_fora. Quem alimenta:
   - o navegador (eventos online/offline);
   - o resultado de CADA chamada do api.js (sucesso(), falha({codigo, status}), lento(±1) aos 4 s);
   - um ping barato à própria página quando navigator.onLine mente (sem_conexao com onLine verdadeiro): se a página responde, a
     internet existe e o que está fora é o servidor; se não responde, é a internet.
   Em offline/servidor_fora tenta de novo sozinho (2, 4, 8, 15 e 30 s) e também ao toque em «Tentar agora». Ao voltar:
   avisa quem assinou (aoVoltar), dispara «orbita:online» e «orbita:rede» na janela e guarda "Reconectado" por 2 s.
   Nada aqui importa outro arquivo nem toca o DOM: o shell desenha a faixa e o ponto de estado a partir do que assinar().
   ============================================================ */

export const ESTADOS = Object.freeze(["online", "lento", "offline", "servidor_fora"]);
export const ESPERAS_MS = Object.freeze([2000, 4000, 8000, 15000, 30000]);
export const LENTO_APOS_MS = 4000;
export const RECONECTADO_MS = 2000;

const RE_SERVIDOR = /^(tempo_rede|servico_indisponivel|http_50[234])$/;   // tempo_esgotado (57014) é consulta pesada, não servidor fora

/** Esta falha mostra que o SERVIDOR (ou o caminho até ele) não respondeu? Erro de regra de negócio, 4xx e 500 de função NÃO contam. */
export function falhaDeConexao(info) {
  const c = info && (info.codigo || info.message);
  return c === "sem_conexao" || RE_SERVIDOR.test(String(c || ""));
}

/**
 * @param {object} o
 *   nav, janela            — navigator/window (testes)
 *   agendar/cancelar/agora — relógio (testes)
 *   ping(): Promise<boolean>   — a página do próprio site responde? (o shell usa versao.json)
 *   sondar(): Promise          — uma chamada real ao servidor (o shell usa nx_pulso); o api.js reporta sucesso()/falha()
 */
export function criarRede(o = {}) {
  const nav = o.nav !== undefined ? o.nav : globalThis.navigator;
  const jan = o.janela !== undefined ? o.janela : globalThis.window;
  const agendar = o.agendar || ((fn, ms) => setTimeout(fn, ms));
  const cancelar = o.cancelar || (t => clearTimeout(t));
  const agora = o.agora || (() => Date.now());
  const assinantes = new Set(), aoVoltarFns = new Set();
  let estado = nav && nav.onLine === false ? "offline" : "online";
  let ultimoOk = null, lentas = 0, falhasSeguidas = 0, tentativa = 0, timer = null, proxima = null, reconectadoAte = 0, timerRec = null, sondando = false, tentando = false;

  const ruim = e => e === "offline" || e === "servidor_fora";   // estados em que a conexão está falhando
  const falhando = () => ruim(estado);
  const foto = antes => ({ estado, antes, mudouEstado: antes !== estado, ultimoOk, proxima, reconectado: agora() < reconectadoAte, lentas });
  const emitir = antes => {
    const f = foto(antes);
    for (const fn of [...assinantes]) { try { fn(f); } catch (e) { console.error("rede: assinante falhou", e); } }
  };
  const evento = (nome, detalhe) => {
    try { if (jan && typeof jan.dispatchEvent === "function" && typeof globalThis.CustomEvent === "function") jan.dispatchEvent(new CustomEvent(nome, { detail: detalhe })); } catch { /* sem DOM */ }
  };

  function mudar(novo) {
    if (novo === estado) return false;
    const antes = estado;
    estado = novo;
    if (falhando()) { if (!timer) agendarTentativa(); }
    else if (timer) { cancelar(timer); timer = null; proxima = null; tentativa = 0; }
    if (ruim(antes) && !ruim(novo)) {
      reconectadoAte = agora() + RECONECTADO_MS;
      if (timerRec) cancelar(timerRec);
      timerRec = agendar(() => { timerRec = null; emitir(estado); }, RECONECTADO_MS);
    }
    emitir(antes);
    evento("orbita:rede", { estado: novo, antes });
    if (ruim(antes) && !ruim(novo)) {
      evento("orbita:online", { antes });
      for (const fn of [...aoVoltarFns]) { try { fn(); } catch (e) { console.error("rede: aoVoltar falhou", e); } }
    }
    return true;
  }

  function agendarTentativa() {
    if (timer || !falhando()) return;
    const espera = ESPERAS_MS[Math.min(tentativa, ESPERAS_MS.length - 1)];
    proxima = agora() + espera;
    timer = agendar(async () => {
      timer = null; proxima = null; tentativa += 1;
      await tentar();
      if (falhando()) agendarTentativa(); else tentativa = 0;
    }, espera);
    emitir(estado);
  }

  /** A internet voltou? O servidor responde? A sonda é uma chamada real do app: ela mesma reporta sucesso()/falha(). */
  async function tentar() {
    if (tentando) return;
    tentando = true;
    try {
      let internet = !(nav && nav.onLine === false);
      if (internet && o.ping) { try { internet = !!(await o.ping()); } catch { internet = false; } }
      if (!internet) { mudar("offline"); return; }
      if (estado === "offline") mudar("servidor_fora");      // a internet voltou; falta o servidor responder
      if (o.sondar) { try { await o.sondar(); } catch { /* o api.js já reportou a falha */ } }
    } finally { tentando = false; }
  }

  async function classificarSemConexao() {
    if (sondando) return;
    sondando = true;
    let paginaResponde = false;
    try { paginaResponde = o.ping ? !!(await o.ping()) : false; } catch { paginaResponde = false; }
    sondando = false;
    mudar(paginaResponde ? "servidor_fora" : "offline");
  }

  const aoOffline = () => { mudar("offline"); };
  const aoOnline = () => { if (falhando()) tentarAgora(); };
  if (jan && typeof jan.addEventListener === "function") { jan.addEventListener("offline", aoOffline); jan.addEventListener("online", aoOnline); }

  if (falhando()) agendarTentativa();   // abriu sem internet: já começa a tentar

  function tentarAgora() {
    if (timer) { cancelar(timer); timer = null; proxima = null; }
    tentativa = 0;
    return tentar().then(() => { if (falhando()) agendarTentativa(); });
  }

  return {
    get estado() { return estado; },
    get ultimoOk() { return ultimoOk; },
    get proximaTentativaEm() { return proxima; },
    get reconectado() { return agora() < reconectadoAte; },
    /** fn({estado, antes, mudouEstado, ultimoOk, proxima, reconectado, lentas}) a cada mudança (de estado, da próxima tentativa ou do "Reconectado"); devolve cancelar(). */
    assinar(fn) { assinantes.add(fn); return () => assinantes.delete(fn); },
    /** fn() quando a conexão VOLTA (offline/servidor_fora → online). Devolve cancelar(). */
    aoVoltar(fn) { aoVoltarFns.add(fn); return () => aoVoltarFns.delete(fn); },
    /** Qualquer resposta do servidor que não seja falha de conexão (inclusive 4xx de regra de negócio). */
    sucesso() {
      falhasSeguidas = 0;
      ultimoOk = agora();
      if (falhando()) mudar(lentas > 0 ? "lento" : "online");
      else if (estado === "lento" && lentas === 0) mudar("online");
    },
    /** {codigo, status} de uma chamada que não chegou ou não foi atendida. Outros erros são sucesso() para a conexão. */
    falha(info) {
      const c = String((info && (info.codigo || info.message)) || "");
      if (c === "sem_conexao") {
        if (nav && nav.onLine === false) return mudar("offline");
        return classificarSemConexao();
      }
      if (RE_SERVIDOR.test(c)) {
        falhasSeguidas += 1;
        // 502/503/504 já dizem "fora do ar"; timeout só depois de dois seguidos (um timeout isolado pode ser uma consulta pesada)
        if (/^http_50[234]$/.test(c) || c === "servico_indisponivel" || falhasSeguidas >= 2) mudar("servidor_fora");
      }
      return false;
    },
    /** +1 quando uma chamada passa de 4 s em voo, -1 quando ela termina. */
    lento(delta) {
      lentas = Math.max(0, lentas + (Number(delta) || 0));
      if (estado === "online" && lentas > 0) mudar("lento");
      else if (estado === "lento" && lentas === 0) mudar("online");
    },
    tentarAgora,
    /** O que a faixa e o ponto de estado precisam saber, já pronto. */
    foto: () => foto(estado),
    destruir() {
      if (timer) cancelar(timer);
      if (timerRec) cancelar(timerRec);
      timer = timerRec = null; assinantes.clear(); aoVoltarFns.clear();
      if (jan && typeof jan.removeEventListener === "function") { jan.removeEventListener("offline", aoOffline); jan.removeEventListener("online", aoOnline); }
    },
  };
}

/* ============================================================
   Abertura que não desiste (M15). Não depende de criarRede: serve ao boot, que roda antes da faixa de conexão existir.
   ============================================================ */
export const ESPERAS_ABERTURA = Object.freeze([2000, 4000, 8000, 16000]);
// cliente_pausado (empresa pausada pela Nexus): repetir não adianta — sem ele o app tentava 12 vezes (~2,5 min) e não oferecia «Sair»
const CODIGOS_DE_CONTA = new Set(["sessao_invalida", "conta_pendente", "conta_suspensa", "credenciais_invalidas", "sem_acesso", "teste_expirado", "cliente_pausado"]);

/** Erro da CONTA ou da sessão (repetir não adianta; só aqui «Sair» faz sentido). Rede e servidor NÃO são erro de conta. */
export function erroDeConta(e) { return CODIGOS_DE_CONTA.has(String((e && (e.codigo || e.message)) || "")); }

/**
 * Repete só a etapa que falhou: fn(tentativa) até dar certo. Erro de conta/sessão sobe na hora; depois de `maximo` tentativas o erro também sobe.
 *   esperar(segundos)            — espera visível (o shell mostra «Tentando de novo em N s…» e a interrompe com «Tentar agora» ou a volta da internet)
 *   aoFalha(erro, tentativa, s)  — antes de cada espera
 */
export async function repetirAbertura(fn, { esperas = ESPERAS_ABERTURA, esperar, aoFalha, eConta = erroDeConta, maximo = 8 } = {}) {
  for (let i = 0; ; i++) {
    try { return await fn(i); }
    catch (e) {
      if (eConta(e) || i + 1 >= maximo) throw e;
      const s = esperas[Math.min(i, esperas.length - 1)] / 1000;
      if (aoFalha) aoFalha(e, i, s);
      await esperar(s);
    }
  }
}
