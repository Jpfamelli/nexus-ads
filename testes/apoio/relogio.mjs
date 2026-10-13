/* ÓRBITA — testes/apoio/relogio.mjs (plano «1000+ melhorias», SV-157/158/159): relógio controlado para a suíte JS.

   Dois usos:
   1. Pré-carregador: ORBITA_AGORA=<instante> node --import ./testes/apoio/relogio.mjs …
      (o rodar-tudo.mjs põe o --import no NODE_OPTIONS sozinho quando ORBITA_AGORA existe, e os filhos do node --test herdam).
      Formatos aceitos em ORBITA_AGORA:
        2026-11-01T02:50:00Z   instante completo (ISO)
        02:50Z                 HOJE (data UTC real) nessa hora UTC — 02:50Z = 23:50 de São Paulo da véspera
        dia1T03:05Z            dia 1º do MÊS ATUAL (UTC) nessa hora — virada de mês em São Paulo
   2. Dentro de um arquivo de teste: fixarRelogio("2026-10-14T12:00:00-03:00") — o arquivo deixa de depender da hora em que roda.

   O relógio não PARA: Date.now() = instante fixado + o tempo real decorrido desde a fixação (timers, prazos e medições de duração
   continuam funcionando). `new Date(x)`, Date.parse e Date.UTC não mudam; `instanceof Date` continua valendo. */

const DataReal = globalThis.__orbitaDataReal || globalThis.Date;
globalThis.__orbitaDataReal = DataReal;
let delta = 0;

function DataControlada(...args) {
  if (!new.target) return new DataReal(DataReal.now() + delta).toString();
  return args.length ? new DataReal(...args) : new DataReal(DataReal.now() + delta);
}
DataControlada.prototype = DataReal.prototype;
Object.setPrototypeOf(DataControlada, DataReal);
DataControlada.now = () => DataReal.now() + delta;
DataControlada.parse = DataReal.parse;
DataControlada.UTC = DataReal.UTC;

/** Texto de ORBITA_AGORA → milissegundos (ou null se vazio). Lança com mensagem clara se o formato não for reconhecido. */
export function interpretarAgora(texto, agoraReal = DataReal.now()) {
  const t = String(texto ?? "").trim();
  if (!t) return null;
  const hoje = new DataReal(agoraReal).toISOString().slice(0, 10);
  let m = /^(\d{2}):(\d{2})(?::(\d{2}))?Z$/i.exec(t);
  if (m) return DataReal.parse(`${hoje}T${m[1]}:${m[2]}:${m[3] || "00"}Z`);
  m = /^dia1T(\d{2}):(\d{2})(?::(\d{2}))?Z$/i.exec(t);
  if (m) return DataReal.parse(`${hoje.slice(0, 8)}01T${m[1]}:${m[2]}:${m[3] || "00"}Z`);
  if (/^\d{4}-\d{2}-\d{2}T\d{2}:\d{2}/.test(t)) {
    const ms = DataReal.parse(t);
    if (Number.isFinite(ms)) return ms;
  }
  throw new Error(`ORBITA_AGORA inválido: «${t}» (use 2026-11-01T02:50:00Z, 02:50Z ou dia1T03:05Z)`);
}

/** Fixa o relógio global no instante dado (texto ISO, número ou Date). Devolve o instante em ms. */
export function fixarRelogio(instante) {
  const alvo = typeof instante === "number" ? instante
    : instante instanceof DataReal ? instante.getTime()
    : interpretarAgora(instante);
  if (!Number.isFinite(alvo)) throw new Error(`instante inválido para o relógio: ${instante}`);
  delta = alvo - DataReal.now();
  globalThis.Date = DataControlada;
  return alvo;
}

/** Devolve o relógio real. */
export function restaurarRelogio() {
  delta = 0;
  globalThis.Date = DataReal;
}

/** O relógio está fixado? */
export const relogioFixado = () => globalThis.Date === DataControlada && delta !== 0;

// pré-carregador: ORBITA_AGORA fixa o relógio antes de qualquer módulo de teste carregar
if (typeof process !== "undefined" && process.env && process.env.ORBITA_AGORA) fixarRelogio(process.env.ORBITA_AGORA);
