/* ============================================================
   ÓRBITA — auto-logica.js (PURO, sem imports estáticos) · frente F7
   ESPEC §2.6, §5.7, §5.8, T12 + PLANO-NOITE-20261001 (automações com IA).
   O catálogo de gatilhos/condições/ações mora em auto-catalogo.js (compartilhado com o servidor);
   este arquivo carrega o catálogo e entrega: validação (mesmas frases que o servidor devolve no hint
   de 'automacao_invalida'), frase que descreve a automação, linha do tempo da sequência, receitas
   prontas, conversões do formato da IA, leitura da simulação e do histórico.
   Os testes Node importam este arquivo direto do disco.
   ============================================================ */

/* O app proíbe import estático (o ?v= do cache precisa chegar em cada arquivo); o catálogo entra por
   import() com a MESMA versão deste arquivo. Nos testes (Node, sem ?v=) a versão é "dev". */
const _v = (() => { try { return new URL(import.meta.url).searchParams.get("v") || "dev"; } catch { return "dev"; } })();
const CAT = await import(`./auto-catalogo.js?v=${encodeURIComponent(_v)}`);

export const palavraConsulta = CAT.palavraConsulta;
export const LIMITES = CAT.LIMITES;
export const DIAS_SEMANA = CAT.DIAS_SEMANA;
export const ATALHOS_DIAS = CAT.ATALHOS_DIAS;
export const PRESETS_ESPERA = CAT.PRESETS_ESPERA;
export const TIPOS_TAREFA = CAT.TIPOS_TAREFA;
export const ORIGENS = CAT.ORIGENS;
export const TAREFAS_IA = CAT.TAREFAS_IA;
export const GATILHOS = CAT.GATILHOS;
export const GATILHO = CAT.GATILHO;
export const CAMPOS_CONDICAO = CAT.CAMPOS_CONDICAO;
export const OPERADORES = CAT.OPERADORES;
export const GRUPOS_ACAO = CAT.GRUPOS_ACAO;
export const ACOES = CAT.ACOES;
export const ACAO = CAT.ACAO;
export const VARIAVEIS = CAT.VARIAVEIS;
export const PLATAFORMAS = CAT.PLATAFORMAS;     // plano 1500c · UCA-001

const CAMPO_CONDICAO = Object.fromEntries(CAMPOS_CONDICAO.map(c => [c.id, c]));
const OPERADOR = Object.fromEntries(OPERADORES.map(o => [o.id, o]));

/* ------------------------------------------------------------------ vocabulário
   O ctx.vocab (vocab.js da F3) traz contato/negocio/ganhar/perder e art(chave).
   Aceitamos também um objeto simples (testes) ou nada (genérico). */
const VOCAB_PADRAO = { contato: "Contato", negocio: "Negócio", g_negocio: "o", g_contato: "o", ganhar: "Ganho", perder: "Perdido", vertical: "generico" };

function voc(vocab) {
  const v = Object.assign({}, VOCAB_PADRAO, vocab || {});
  const min = s => String(s || "").charAt(0).toLowerCase() + String(s || "").slice(1);
  const genero = chave => (v["g_" + chave] || (/a$/i.test(v[chave] || "") ? "a" : "o"));
  return {
    v,
    min: chave => min(v[chave]),
    art: chave => genero(chave),
    um: chave => (genero(chave) === "a" ? "uma" : "um"),
    /** concordância: "criado"/"criada" */
    conc: (chave, masc, fem) => (genero(chave) === "a" ? fem : masc),
    vertical: v.vertical || "generico",
  };
}

/* ------------------------------------------------------------------ utilidades */

const RE_UUID = /^[0-9a-f]{8}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{12}$/i;
export const ehUuid = s => typeof s === "string" && RE_UUID.test(s);
const RE_HORA = /^([01]\d|2[0-3]):[0-5]\d$/;
const vazio = x => x == null || (typeof x === "string" && x.trim() === "") || (Array.isArray(x) && x.length === 0);
const inteiro = x => {
  if (typeof x === "number" && Number.isInteger(x)) return x;
  if (typeof x === "string" && /^\s*-?\d+\s*$/.test(x)) return parseInt(x, 10);
  return null;
};
const texto = x => (x == null ? "" : String(x));
const aspas = s => `«${s}»`;
const copia = x => (x === undefined ? undefined : JSON.parse(JSON.stringify(x)));

/**
 * plano 1000b · UB-061: número digitado do jeito brasileiro (a mesma régua do ui.lerMoeda): «1.500,00» → 1500, «1500,5» → 1500.5,
 * «1500» → 1500, «1.5» → 1.5 (ponto só decimal quando não forma milhar). Número já em Number passa. Inválido/vazio → null.
 */
export function numeroBR(v) {
  if (typeof v === "number") return Number.isFinite(v) ? v : null;
  let t = texto(v).trim().replace(/^R\$\s*/i, "").replace(/\s/g, "");
  if (!t) return null;
  if (t.includes(",")) t = t.replace(/\./g, "").replace(",", ".");
  else if (/^-?\d{1,3}(\.\d{3})+$/.test(t)) t = t.replace(/\./g, "");
  if (!/^-?\d+(\.\d+)?$/.test(t)) return null;
  const n = Number(t);
  return Number.isFinite(n) ? n : null;
}

/** 15 → "15 min"; 120 → "2 h" */
export function formatarMinutos(m) {
  const n = Number(m) || 0;
  if (n >= 60 && n % 60 === 0) return `${n / 60} h`;
  return `${n} min`;
}
/** 24 → "24 h"; 168 → "7 dias"; 48 → "2 dias"; 1 → "1 h"; 0 → "na hora" */
export function formatarHoras(h) {
  const n = Number(h) || 0;
  if (n === 0) return "na hora";
  if (n >= 48 && n % 24 === 0) return `${n / 24} dias`;
  return `${n} h`;
}
/** Tempo de espera em linguagem de gente: 5 → "5 min"; 90 → "1 h 30 min"; 1440 → "1 dia"; 4320 → "3 dias". */
export function formatarDuracao(m) {
  const n = Math.max(0, Math.round(Number(m) || 0));
  if (n === 0) return "0 min";
  if (n % 1440 === 0) return n / 1440 === 1 ? "1 dia" : `${n / 1440} dias`;
  if (n < 60) return `${n} min`;
  if (n % 60 === 0) return `${n / 60} h`;
  return `${Math.floor(n / 60)} h ${n % 60} min`;
}
/** Divide minutos em {n, un} para o campo "Outro": 2880 → {n:2, un:"dias"}; 90 → {n:90, un:"min"}. */
export function decomporDuracao(m) {
  const n = Math.max(0, Math.round(Number(m) || 0));
  if (n > 0 && n % 1440 === 0) return { n: n / 1440, un: "dias" };
  if (n > 0 && n % 60 === 0) return { n: n / 60, un: "horas" };
  return { n, un: "min" };
}
/** {n, un} → minutos. un: "min" | "horas" | "dias". */
export function comporDuracao(n, un) {
  const x = numeroBR(n);     // plano 1500c · UCA-010: «1,5» dias vale aqui como em comporHoras
  if (x == null) return null;
  if (!Number.isFinite(x) || x <= 0) return null;
  return Math.round(x * (un === "dias" ? 1440 : un === "horas" ? 60 : 1));
}

function listaFrase(itens, conj = "e") {
  const l = itens.filter(Boolean);
  if (l.length <= 1) return l.join("");
  return `${l.slice(0, -1).join(", ")} ${conj} ${l[l.length - 1]}`;
}

function cortar(s, n) {
  const t = texto(s).replace(/\s+/g, " ").trim();
  return t.length > n ? t.slice(0, n - 1).trimEnd() + "…" : t;
}

/** Normaliza para comparar como o servidor: minúsculas e sem acento. */
export function normalizar(s) {
  return texto(s).normalize("NFD").replace(/[̀-ͯ]/g, "").toLowerCase().trim();
}

/** Dias da semana em ordem, sem repetição, só 0..6 (aceita "1" e 1). */
export function normalizarDias(v) {
  const l = (Array.isArray(v) ? v : []).map(inteiro).filter(n => n != null && n >= 0 && n <= 6);
  return [...new Set(l)].sort((a, b) => a - b);
}

/** "toda segunda" · "de segunda a sexta" · "todos os dias" · "às segundas e quartas" · "aos sábados e domingos". */
export function frasePeriodo(dias) {
  const d = normalizarDias(dias);
  if (!d.length) return "(escolha os dias)";
  if (d.length === 7) return "todos os dias";
  const nome = i => DIAS_SEMANA[i][2];
  // plano 1500c · UCA-024: a semana é circular — sexta, sábado e domingo é «de sexta a domingo»
  if (d.length >= 3) for (let k = 0; k < d.length; k++) {
    const r = d.slice(k).concat(d.slice(0, k));
    if (r.every((x, i) => i === 0 || x === (r[i - 1] + 1) % 7)) return `de ${nome(r[0])} a ${nome(r[r.length - 1])}`;
  }
  if (d.length === 1) return `toda ${nome(d[0])}`.replace("toda sábado", "todo sábado").replace("toda domingo", "todo domingo");
  const fem = d.filter(x => x >= 1 && x <= 5).map(x => `${nome(x)}s`);
  const masc = d.filter(x => x === 6).concat(d.filter(x => x === 0)).map(x => `${nome(x)}s`);   // plano 1500c · UCA-024: sábado antes de domingo
  const partes = [];
  if (fem.length) partes.push(`às ${listaFrase(fem)}`);
  if (masc.length) partes.push(`aos ${listaFrase(masc)}`);
  return partes.join(" e ");
}

/* ------------------------------------------------------------------ condições */

/** Operadores que fazem sentido para cada tipo de valor. */
export function operadoresDe(campo) {
  const t = tipoValorCondicao(campo);
  if (t === "numero") return ["igual", "diferente", "maior", "menor", "vazio", "preenchido"];
  if (t === "texto") return ["contem", "nao_contem", "igual", "diferente", "vazio", "preenchido"];
  if (t === "campo") return ["igual", "diferente", "contem", "nao_contem", "maior", "menor", "vazio", "preenchido"];
  if (t === "etiqueta") return ["igual", "diferente", "vazio", "preenchido"];
  // plano 1500c · UCA-001: as mesmas regras do nx_auto_normalizar (campanha: contém; plataforma: é)
  if (t === "campanha") return ["contem", "nao_contem", "vazio", "preenchido"];
  if (t === "plataforma") return ["igual", "diferente", "vazio", "preenchido"];
  return ["igual", "diferente", "vazio", "preenchido"];
}

export function tipoValorCondicao(campo) {
  if (typeof campo === "string" && campo.startsWith("contato.")) return "campo";
  return (CAMPO_CONDICAO[campo] || {}).valor || null;
}

/* ------------------------------------------------------------------ nomes (a partir do `base` do nx_automacoes_listar) */

/**
 * base = {funis:[{id,nome,padrao,estagios:[{id,nome,cor,tipo,marco}]}], etiquetas:[{id,nome,cor}],
 *         usuarios:[{id,nome,papel}], departamentos:[{id,nome}], canais:[{id,nome,numero_exibicao}],
 *         templates:[{id,canal_id,nome,idioma,categoria,status,corpo,num_parametros}], campos:[{chave,rotulo,tipo}]}
 */
// plano 1500c · UCA-085: o índice é guardado por objeto `base` e refeito só quando uma das listas troca de referência
// (o editor troca base.templates ao sincronizar): antes era reconstruído até 6 vezes a cada tecla
const _CHAVES_BASE = ["funis", "etiquetas", "usuarios", "departamentos", "canais", "templates", "campos", "campos_negocio"];
const _ixCache = new WeakMap();
export function indexarBase(base) {
  if (base && typeof base === "object") {
    const c = _ixCache.get(base);
    if (c && _CHAVES_BASE.every((k, i) => c.refs[i] === base[k])) return c.ix;
    const ix = indexarBaseNovo(base);
    _ixCache.set(base, { refs: _CHAVES_BASE.map(k => base[k]), ix });
    return ix;
  }
  return indexarBaseNovo(base);
}
function indexarBaseNovo(base) {
  const b = base || {};
  const m = lista => new Map((lista || []).map(x => [x.id, x]));
  const estagios = new Map();
  for (const f of b.funis || []) for (const e of f.estagios || []) estagios.set(e.id, Object.assign({ funil_id: f.id, funil_nome: f.nome }, e));
  return {
    funis: m(b.funis), estagios, etiquetas: m(b.etiquetas), usuarios: m(b.usuarios),
    departamentos: m(b.departamentos), canais: m(b.canais), templates: m(b.templates),
    campos: new Map((b.campos || []).map(c => [c.chave, c])),
    camposAtualizar: camposAtualizaveis(b),
    temBase: !!base,
  };
}

/** Campos que o passo «preencher um campo» pode escrever: do contato, da oportunidade e a pontuação (score, que a IA também preenche). */
export const CAMPO_SCORE = Object.freeze({ chave: "score", rotulo: "Pontuação do lead (0 a 100)", tipo: "numero" });
function camposAtualizaveis(b) {
  const m = new Map();
  for (const c of (b && b.campos) || []) m.set(c.chave, Object.assign({ grupo: "Cadastro" }, c));
  for (const c of (b && b.campos_negocio) || []) if (!m.has(c.chave)) m.set(c.chave, Object.assign({ grupo: "Oportunidade" }, c));
  m.set(CAMPO_SCORE.chave, Object.assign({ grupo: "Pontuação" }, CAMPO_SCORE));
  return m;
}

function nomeDe(ix, tipo, id, falta) {
  if (!id) return null;
  const mapa = ix && ix[tipo];
  const x = mapa && mapa.get && mapa.get(id);
  return x ? (x.nome || x.numero_exibicao || x.rotulo) : falta;
}

/* ------------------------------------------------------------------ validação
   `problemas` devolve TODOS os problemas, na ordem da tela (nome, Quando, Se, Então):
   [{motivo, onde:'nome'|'quando'|'se'|'entao', indice}]. `validar` devolve o primeiro:
   {ok:true} ou {ok:false, motivo, onde, indice}. `motivo` é a MESMA frase do hint do servidor
   (nx_auto_normalizar) nos itens que o servidor já conhecia.
   opcoes.ligar = true → exige também o que só é preciso para ligar (modelo escolhido).
   opcoes.base → confere se os ids ainda existem e o nº de parâmetros do modelo. */
export function problemas(auto, opcoes = {}) {
  const a = auto || {};
  const ix = opcoes.base ? indexarBase(opcoes.base) : null;
  const ligar = opcoes.ligar ?? !!a.ativo;
  const out = [];
  const falha = (motivo, onde, indice) => out.push({ motivo, onde, indice });

  const nome = texto(a.nome).trim();
  if (!nome) falha("dê um nome à automação", "nome");
  else if (nome.length > LIMITES.nome) falha(`o nome pode ter até ${LIMITES.nome} caracteres`, "nome");

  if (!GATILHO[a.gatilho]) falha("escolha o gatilho em «Quando»", "quando");
  else {
    const c = a.config && typeof a.config === "object" && !Array.isArray(a.config) ? a.config : {};
    const r = validarConfig(a.gatilho, c, ix);
    if (r) falha(r, "quando");
  }

  const conds = a.condicoes == null ? [] : a.condicoes;
  if (!Array.isArray(conds)) falha("as condições estão em formato inválido", "se");
  else {
    if (conds.length > LIMITES.condicoes) falha(`use até ${LIMITES.condicoes} condições`, "se");
    for (let i = 0; i < conds.length; i++) {
      const m = validarCondicao(conds[i], i + 1, ix);
      if (m) falha(m, "se", i);
    }
  }

  // plano 1000 · AS-040: o gatilho preso a uma etapa de funil desligado não liga (o seletor mostra a etapa com «(funil desligado)»)
  if (ligar && opcoes.base && !out.some(x => x.onde === "quando")) for (const x of etapasDeFunilDesligado(a, opcoes.base)) if (x.onde === "quando")
    falha(`a etapa «${x.etapa}» é do funil «${x.funil}», que está desligado`, "quando");

  const acoes = a.acoes == null ? [] : a.acoes;
  if (!Array.isArray(acoes) || acoes.length === 0) falha("acrescente pelo menos uma ação em «Então»", "entao");
  else {
    if (acoes.length > LIMITES.acoes) falha(`use até ${LIMITES.acoes} ações`, "entao");
    let esperas = 0;
    for (let i = 0; i < acoes.length; i++) {
      const m = validarAcao(acoes[i], i + 1, ix, ligar, acoes.length);
      if (m) falha(m, "entao", i);
      else if (acoes[i] && acoes[i].tipo === "esperar" && ++esperas > LIMITES.esperas) falha(`ação ${i + 1}: use até ${LIMITES.esperas} esperas`, "entao", i);
    }
    if (acoes.every(x => x && ACAO[x.tipo] && ACAO[x.tipo].sequencia))
      falha("acrescente pelo menos um passo que faça algo, além de esperar ou parar", "entao");
    // plano 1000 · AS-035: variável digitada errada ({primeironome}) chegaria crua ao cliente — salva desligada, mas não liga
    if (ligar && opcoes.base) for (const x of etapasDeFunilDesligado(a, opcoes.base)) if (x.onde === "entao" && !out.some(y => y.onde === "entao" && y.indice === x.indice))
      falha(`ação ${x.indice + 1}: a etapa «${x.etapa}» é do funil «${x.funil}», que está desligado`, "entao", x.indice);
    if (ligar) for (const v of variaveisDosPassos(a)) if (!out.some(x => x.onde === "entao" && x.indice === v.indice))
      falha(`ação ${v.indice + 1}: ${fraseVariaveis(v)}`, "entao", v.indice);
  }
  return out;
}

export function validar(auto, opcoes = {}) {
  const p = problemas(auto, opcoes)[0];
  return p ? { ok: false, motivo: p.motivo, onde: p.onde, indice: p.indice } : { ok: true };
}

function intFaixa(v, [min, max]) {
  const n = inteiro(v);
  return n != null && n >= min && n <= max ? n : null;
}

function idOk(ix, tipo, id) {
  if (!ehUuid(id)) return false;
  if (!ix || !ix.temBase) return true;
  return ix[tipo].has(id);
}

function validarConfig(gat, c, ix) {
  const opcionalOk = (tipo, id) => vazio(id) || idOk(ix, tipo, id);
  switch (gat) {
    case "conversa_nova":
      if (!opcionalOk("canais", c.canal_id)) return "o número escolhido em «Quando» não existe mais";
      if (!opcionalOk("departamentos", c.departamento_id)) return "o departamento escolhido em «Quando» não existe mais";
      return null;
    case "conversa_resolvida":
      if (!opcionalOk("canais", c.canal_id)) return "o número escolhido em «Quando» não existe mais";
      if (!opcionalOk("departamentos", c.departamento_id)) return "o departamento escolhido em «Quando» não existe mais";
      return null;
    case "mensagem_recebida": {
      if (c.palavras != null && !Array.isArray(c.palavras)) return "as palavras estão em formato inválido";
      const p = palavrasUnicas(c.palavras);     // plano 1500c · UCA-023: «preço, Preço, preco» conta uma vez
      if (p.length > LIMITES.palavras) return `use até ${LIMITES.palavras} palavras`;
      if (p.some(x => x.length > LIMITES.palavra)) return `cada palavra pode ter até ${LIMITES.palavra} caracteres`;
      if (!opcionalOk("canais", c.canal_id)) return "o número escolhido em «Quando» não existe mais";
      return null;
    }
    case "negocio_criado": case "negocio_ganho": case "negocio_perdido":
      if (!opcionalOk("funis", c.funil_id)) return "o funil escolhido em «Quando» não existe mais";
      return null;
    case "negocio_estagio":
      if (vazio(c.estagio_id)) return "escolha a etapa em «Quando»";
      if (!idOk(ix, "estagios", c.estagio_id)) return "a etapa escolhida em «Quando» não existe mais";
      return null;
    case "tempo_no_estagio":
      if (vazio(c.estagio_id)) return "escolha a etapa em «Quando»";
      if (!idOk(ix, "estagios", c.estagio_id)) return "a etapa escolhida em «Quando» não existe mais";
      // plano 1000b · UB-028: as faixas em palavras (os campos já são horas/dias); as frases do SERVIDOR continuam em ondeDoHint
      if (intFaixa(c.horas, LIMITES.tempo_no_estagio) == null) return "o tempo na etapa vai de 1 hora a 90 dias";
      return null;
    case "etiqueta_adicionada":
      if (vazio(c.etiqueta_id)) return "escolha a etiqueta em «Quando»";
      if (!idOk(ix, "etiquetas", c.etiqueta_id)) return "a etiqueta escolhida em «Quando» não existe mais";
      return null;
    case "sem_resposta":
      if (intFaixa(c.minutos, LIMITES.sem_resposta) == null) return "o tempo sem resposta vai de 5 minutos a 24 horas";   // plano 1000b · UB-028
      if (!opcionalOk("departamentos", c.departamento_id)) return "o departamento escolhido em «Quando» não existe mais";
      return null;
    case "tarefa_vencida":
      // plano 1500c · UCA-002: as mesmas frases do nx_auto_normalizar (20261015a, UB-219)
      if (!vazio(c.tipo_tarefa) && !TIPOS_TAREFA.some(([k]) => k === c.tipo_tarefa)) return "escolha o tipo de tarefa em «Quando»";
      if (!vazio(c.dono_id) && !idOk(ix, "usuarios", c.dono_id)) return "a pessoa escolhida em «Quando» não tem mais acesso";
      return null;
    case "antes_da_data":
      if (!["consulta", "previsao_fechamento"].includes(c.campo)) return "escolha a data em «Quando»";
      if (intFaixa(c.horas, LIMITES.antes_da_data) == null) return "a antecedência vai de 1 a 72 horas";
      if (!opcionalOk("funis", c.funil_id)) return "o funil escolhido em «Quando» não existe mais";
      return null;
    case "apos_data":
      if (!["consulta", "previsao_fechamento"].includes(c.campo)) return "escolha a data em «Quando»";
      if (intFaixa(c.horas, LIMITES.apos_data) == null) return "o tempo depois da data vai de 1 hora a 30 dias";   // plano 1000b · UB-028
      if (!opcionalOk("funis", c.funil_id)) return "o funil escolhido em «Quando» não existe mais";
      return null;
    case "agendado": {
      if (!RE_HORA.test(texto(c.horario).trim())) return "escolha o horário em «Quando» (de 00:00 a 23:59)";
      if (c.dias_semana != null && !Array.isArray(c.dias_semana)) return "os dias da semana estão em formato inválido";
      if ((c.dias_semana || []).some(x => { const d = inteiro(x); return d == null || d < 0 || d > 6; })) return "os dias da semana vão de 0 (domingo) a 6 (sábado)";
      if (!Array.isArray(c.dias_semana) || !c.dias_semana.length) return "escolha pelo menos um dia da semana";
      if (!opcionalOk("funis", c.funil_id)) return "o funil escolhido em «Quando» não existe mais";
      if (!opcionalOk("estagios", c.estagio_id)) return "a etapa escolhida em «Quando» não existe mais";
      if (ix && ix.temBase && !vazio(c.funil_id) && !vazio(c.estagio_id) && ix.estagios.get(c.estagio_id).funil_id !== c.funil_id)
        return "a etapa escolhida em «Quando» não é desse funil";
      return null;
    }
    default:
      return "escolha o gatilho em «Quando»";
  }
}

function validarCondicao(cd, n, ix) {
  if (!cd || typeof cd !== "object") return `condição ${n}: escolha o campo`;
  const campo = texto(cd.campo);
  const tipo = tipoValorCondicao(campo);
  if (!tipo || (tipo === "campo" && !/^contato\.[a-z][a-z0-9_]{0,39}$/.test(campo))) return `condição ${n}: escolha o campo`;
  const op = OPERADOR[cd.op];
  if (!op) return `condição ${n}: escolha a comparação`;
  if ((cd.op === "maior" || cd.op === "menor") && !["numero", "campo"].includes(tipo))
    return `condição ${n}: «maior» e «menor» valem só para valor e campos`;
  // plano 1500c · UCA-001: as frases do servidor (20261015a, UB-216)
  if (tipo === "campanha" && (cd.op === "igual" || cd.op === "diferente")) return `condição ${n}: para a campanha use «contém» ou «não contém»`;
  if (tipo === "plataforma" && (cd.op === "contem" || cd.op === "nao_contem")) return `condição ${n}: para a plataforma use «é» ou «não é»`;
  if (op.semValor) return null;
  if (vazio(cd.valor)) return `condição ${n}: preencha o valor`;
  if (tipo === "numero" && numeroBR(cd.valor) == null)      // plano 1000b · UB-061: «1.500,00» é número
    return `condição ${n}: o valor precisa ser um número`;
  // plano 1500c · UCA-021: campo personalizado com maior/menor compara número (com «abc» o servidor compararia texto)
  if (tipo === "campo" && (cd.op === "maior" || cd.op === "menor") && numeroBR(cd.valor) == null)
    return `condição ${n}: para maior/menor use um número`;
  if (tipo === "plataforma" && !PLATAFORMAS.some(([k]) => k === normalizar(cd.valor))) return `condição ${n}: escolha a plataforma (Meta ou Google)`;
  const idTipo = { funil: "funis", estagio: "estagios", canal: "canais", departamento: "departamentos", etiqueta: "etiquetas", pessoa: "usuarios" }[tipo];
  if (idTipo && !idOk(ix, idTipo, cd.valor)) return `condição ${n}: o item escolhido não existe mais`;
  if (tipo === "origem" && !ORIGENS.some(([k]) => k === cd.valor)) return `condição ${n}: escolha a origem`;
  if (texto(cd.valor).length > 200) return `condição ${n}: o valor pode ter até 200 caracteres`;
  return null;
}

/** plano 1500c · UCA-072: a pessoa escolhida saiu da empresa (o id ainda é um UUID, mas não está mais na base). */
const SEM_ACESSO = "a pessoa escolhida não tem mais acesso; escolha outra";

function validarAcao(ac, n, ix, ligar, total) {
  const p = `ação ${n}`;
  if (!ac || typeof ac !== "object" || !ACAO[ac.tipo]) return `${p}: tipo de ação desconhecido`;
  const opcionalOk = (tipo, id) => vazio(id) || idOk(ix, tipo, id);
  const estagioDoFunil = (estagio, funil) => !(ix && ix.temBase && !vazio(funil) && !vazio(estagio) && ix.estagios.get(estagio).funil_id !== funil);
  switch (ac.tipo) {
    case "criar_negocio":
      if (!opcionalOk("funis", ac.funil_id)) return `${p}: o funil escolhido não existe mais`;
      if (!opcionalOk("estagios", ac.estagio_id)) return `${p}: a etapa escolhida não existe mais`;
      if (!estagioDoFunil(ac.estagio_id, ac.funil_id)) return `${p}: a etapa não é desse funil`;
      if (texto(ac.titulo).length > LIMITES.titulo_negocio) return `${p}: o título pode ter até ${LIMITES.titulo_negocio} caracteres`;
      return null;
    case "mover_estagio":
      if (vazio(ac.estagio_id)) return `${p}: escolha a etapa`;
      if (!idOk(ix, "estagios", ac.estagio_id)) return `${p}: a etapa escolhida não existe mais`;
      return null;
    case "mover_funil":
      if (vazio(ac.funil_id)) return `${p}: escolha o funil`;
      if (!idOk(ix, "funis", ac.funil_id)) return `${p}: o funil escolhido não existe mais`;
      if (ix && ix.temBase && ix.funis.get(ac.funil_id).ativo === false) return `${p}: o funil escolhido está desativado`;
      if (!opcionalOk("estagios", ac.estagio_id)) return `${p}: a etapa escolhida não existe mais`;
      if (!estagioDoFunil(ac.estagio_id, ac.funil_id)) return `${p}: a etapa não é desse funil`;
      return null;
    case "criar_tarefa": {
      const t = texto(ac.titulo).trim();
      if (!t) return `${p}: escreva o título da tarefa`;
      if (t.length > LIMITES.titulo_tarefa) return `${p}: o título pode ter até ${LIMITES.titulo_tarefa} caracteres`;
      if (ac.tipo_tarefa != null && !TIPOS_TAREFA.some(([k]) => k === ac.tipo_tarefa)) return `${p}: tipo de tarefa inválido`;
      if (ac.vence_em_horas != null && ac.vence_em_horas !== "" && intFaixa(ac.vence_em_horas, LIMITES.prazo_tarefa) == null)
        return `${p}: o prazo vai até 90 dias (0 = para já)`;   // plano 1000b · UB-028
      if (!(ac.dono === "responsavel" || ac.dono === "atendente" || idOk(ix, "usuarios", ac.dono)))
        return ehUuid(ac.dono) ? `${p}: ${SEM_ACESSO}` : `${p}: escolha para quem é a tarefa`;   // plano 1500c · UCA-072
      return null;
    }
    case "enviar_mensagem": {
      const t = texto(ac.texto).trim();
      if (!t) return `${p}: escreva a mensagem`;
      if (t.length > LIMITES.mensagem) return `${p}: a mensagem pode ter até ${LIMITES.mensagem} caracteres`;
      return null;
    }
    case "enviar_template": {
      if (ac.parametros != null && !Array.isArray(ac.parametros)) return `${p}: os parâmetros estão em formato inválido`;
      const pars = ac.parametros || [];
      if (pars.length > LIMITES.parametros) return `${p}: use até ${LIMITES.parametros} parâmetros`;
      if (pars.some(x => texto(x).length > 200)) return `${p}: cada parâmetro pode ter até 200 caracteres`;
      if (vazio(ac.template_id)) return ligar ? `${p}: escolha o modelo aprovado` : null;
      if (!idOk(ix, "templates", ac.template_id)) return `${p}: o modelo escolhido não existe mais`;
      if (ix && ix.temBase) {
        const t = ix.templates.get(ac.template_id);
        if (ligar && String(t.status || "").toUpperCase() !== "APPROVED") return `${p}: o modelo ainda não foi aprovado pela Meta`;
        const np = Number(t.num_parametros) || 0;
        if (pars.length !== np) return `${p}: o modelo pede ${np} parâmetro${np === 1 ? "" : "s"}`;
        if (pars.some(x => !texto(x).trim())) return `${p}: preencha todos os parâmetros`;
      } else if (pars.some(x => !texto(x).trim())) return `${p}: preencha todos os parâmetros`;
      return null;
    }
    case "atribuir": {
      const dono = ac.dono ?? ac.modo;
      if (!["rodizio", "conta", "departamento"].includes(dono) || (dono === "departamento" && ac.dono !== "departamento")) return `${p}: escolha como atribuir`;
      if (dono === "conta" && !idOk(ix, "usuarios", ac.conta_id)) return ehUuid(ac.conta_id) ? `${p}: ${SEM_ACESSO}` : `${p}: escolha a pessoa`;   // plano 1500c · UCA-072
      if (!opcionalOk("departamentos", ac.departamento_id)) return `${p}: o departamento escolhido não existe mais`;
      if (dono === "departamento" && vazio(ac.departamento_id)) return `${p}: escolha o departamento`;
      return null;
    }
    case "etiquetar":
      if (vazio(ac.etiqueta_id) && vazio(ac.etiqueta_nome)) return `${p}: escolha a etiqueta`;
      if (!vazio(ac.etiqueta_id) && !idOk(ix, "etiquetas", ac.etiqueta_id)) return `${p}: a etiqueta escolhida não existe mais`;
      if (vazio(ac.etiqueta_id) && texto(ac.etiqueta_nome).trim().length > 40) return `${p}: o nome da etiqueta pode ter até 40 caracteres`;
      if (!["contato", "conversa"].includes(ac.alvo)) return `${p}: escolha onde pôr a etiqueta`;
      return null;
    case "etiqueta_adicionar": case "etiqueta_remover":
      // etiqueta só pelo nome (criada ao salvar) é aceita pelo banco apenas no «etiquetar»: aqui o nx_auto_normalizar exige a etiqueta escolhida
      if (vazio(ac.etiqueta_id)) return `${p}: escolha a etiqueta`;
      if (!idOk(ix, "etiquetas", ac.etiqueta_id)) return `${p}: a etiqueta escolhida não existe mais`;
      return null;
    case "campo_atualizar": {
      if (!/^[a-z][a-z0-9_]{1,39}$/.test(texto(ac.campo))) return `${p}: escolha o campo`;
      if (ix && ix.temBase && !ix.camposAtualizar.has(ac.campo)) return `${p}: o campo escolhido não existe mais`;
      const v = texto(ac.valor).trim();
      if (!v) return `${p}: escreva o valor`;
      if (v.length > LIMITES.valor_campo) return `${p}: o valor pode ter até ${LIMITES.valor_campo} caracteres`;
      return null;
    }
    case "nota": {
      const t = texto(ac.texto).trim();
      if (!t) return `${p}: escreva a nota`;
      if (t.length > LIMITES.nota) return `${p}: a nota pode ter até ${LIMITES.nota} caracteres`;
      return null;
    }
    case "notificar": {
      if (!(ac.para === "responsavel" || ac.para === "admins" || ac.para === "departamento" || idOk(ix, "usuarios", ac.para)))
        return ehUuid(ac.para) ? `${p}: ${SEM_ACESSO}` : `${p}: escolha quem recebe o aviso`;   // plano 1500c · UCA-072
      if (ac.para === "departamento") {
        if (vazio(ac.departamento_id)) return `${p}: escolha o departamento`;
        if (!idOk(ix, "departamentos", ac.departamento_id)) return `${p}: o departamento escolhido não existe mais`;
      }
      const t = texto(ac.titulo).trim();
      if (!t && !texto(ac.texto).trim()) return `${p}: escreva o título do aviso`;
      if (t.length > LIMITES.titulo_aviso) return `${p}: o título do aviso pode ter até ${LIMITES.titulo_aviso} caracteres`;
      if (texto(ac.texto).length > LIMITES.texto_aviso) return `${p}: o detalhe do aviso pode ter até ${LIMITES.texto_aviso} caracteres`;
      return null;
    }
    case "resolver_conversa":
      return null;
    case "esperar":
      if (intFaixa(ac.minutos, LIMITES.esperar) == null) return `${p}: a espera vai de 1 minuto a 30 dias`;   // plano 1000b · UB-028
      if (total != null && n === total) return `${p}: depois de esperar, acrescente outra ação`;
      return null;
    case "parar":
      return null;
    case "ia_decidir":
      if (!TAREFAS_IA.some(([k]) => k === ac.tarefa)) return `${p}: escolha o que a IA faz`;
      if (texto(ac.instrucao).length > LIMITES.instrucao_ia) return `${p}: a instrução pode ter até ${LIMITES.instrucao_ia} caracteres`;
      return null;
    case "alerta_whatsapp": {
      const t = texto(ac.texto).trim();
      if (!t || t.length > LIMITES.alerta) return `${p}: escreva o alerta (até ${LIMITES.alerta} caracteres)`;
      return null;
    }
    default:
      return `${p}: tipo de ação desconhecido`;
  }
}

/** Tira o "ação 2: " do início (o editor mostra a mensagem dentro do cartão da própria ação). */
export const semPrefixo = motivo => texto(motivo).replace(/^(?:ação|condição) \d+: /, "");

/* ------------------------------------------------------------------ sequência (linha do tempo) */

/**
 * Para cada passo: quando ele roda (tempo acumulado das esperas anteriores) e se ainda dá para chegar nele.
 * [{i, tipo, antes, depois, quando, inalcancavel}] — `antes`/`depois` em minutos.
 */
export function linhaDoTempo(acoes, { inicio = null, horario } = {}) {
  let acum = 0, parou = false;
  const out = [];
  // plano 1000 · AS-224: com o horário de atendimento (respeitar horário), a mensagem que cairia fora dele sai na próxima abertura
  const t0 = inicio == null ? null : (inicio instanceof Date ? inicio.getTime() : Number(inicio));
  const comHorario = horario !== undefined && Number.isFinite(t0);
  (acoes || []).forEach((a, i) => {
    const tipo = a && a.tipo;
    const m = tipo === "esperar" ? (inteiro(a.minutos) || 0) : 0;
    const x = { i, tipo, antes: acum, depois: acum + m, quando: acum === 0 ? "Na hora" : `Depois de ${formatarDuracao(acum)}`, inalcancavel: parou };
    if (comHorario && tipo && (ACAO[tipo] || {}).mensagem) {
      const previsto = t0 + acum * 60000;
      const envio = proximaAbertura(horario, previsto);
      x.envio = envio;
      x.adiada = envio != null && envio > previsto;
      // plano 1000b · UB-024: o horário não abre em 8 dias (sem faixa nenhuma) → a mensagem nunca sairia: não é «Na hora»
      if (envio === null) x.semHorario = true;
    }
    out.push(x);
    acum += m;
    if (tipo === "parar") parou = true;
  });
  return out;
}

/** Tempo total de espera da sequência (minutos). */
// plano 1500c · UCA-009: as esperas depois de «Parar» nunca rodam e não contam no total
export const duracaoTotal = acoes => linhaDoTempo(acoes).reduce((s, x) => (x.inalcancavel ? s : Math.max(s, x.depois)), 0);

/** A automação tem esperas? (a lista vira «sequência»). */
export const temSequencia = auto => (auto && auto.acoes || []).some(a => a && (a.tipo === "esperar" || a.tipo === "parar"));

/** Avisos que não impedem de salvar (o editor mostra no resumo). Lista de frases (os detalhes, com o passo, em avisosEstruturaDetalhados). */
export function avisosEstrutura(auto, vocab = null) {
  return avisosEstruturaDetalhados(auto, vocab).map(x => x.texto);
}

/** plano 1500c · UCA-022: passos que só agem numa conversa aberta com o contato. */
export const PASSOS_DE_CONVERSA = Object.freeze(["atribuir", "resolver_conversa"]);
/** plano 1500c · UCA-022: gatilhos que não nascem de uma conversa (pode não haver conversa aberta com o contato). */
export const GATILHOS_SEM_CONVERSA = Object.freeze(["agendado", "tarefa_vencida", "negocio_criado", "negocio_estagio", "tempo_no_estagio",
  "negocio_ganho", "negocio_perdido", "etiqueta_adicionada", "antes_da_data", "apos_data"]);
const ehPassoDeConversa = a => !!a && (PASSOS_DE_CONVERSA.includes(a.tipo) || (a.tipo === "etiquetar" && a.alvo === "conversa"));
const ehMensagem = a => !!a && !!(ACAO[a.tipo] || {}).mensagem;

/**
 * Avisos de estrutura com o lugar: [{texto, indice:número|null, tipo}]. `indice` = o passo (0 = 1º) que o editor marca.
 * plano 1500c · UCA-017/018/022/111/112: toda mensagem, disparo diário em massa, passo de conversa sem conversa, esperas seguidas
 * (quais passos e quanto somam) e espera que não para quando o cliente responde antes de uma mensagem.
 */
export function avisosEstruturaDetalhados(auto, vocab = null) {
  const a = auto || {};
  const acoes = Array.isArray(a.acoes) ? a.acoes : [];
  const conds = Array.isArray(a.condicoes) ? a.condicoes : [];
  const c = a.config || {};
  const vv = voc(vocab);
  const avisos = [];
  const add = (texto, indice = null, tipo = "") => avisos.push({ texto, indice, tipo });
  const tl = linhaDoTempo(acoes);
  const iParar = acoes.findIndex(x => x && x.tipo === "parar");
  if (iParar >= 0 && iParar < acoes.length - 1) add("Os passos depois de «Parar por aqui» nunca rodam. Tire-os ou mova o «Parar» para o fim.", iParar + 1, "parar");
  // plano 1500c · UCA-111: cada sequência de esperas seguidas, com os passos e o tempo somado
  for (let i = 0; i < acoes.length; i++) {
    if (!(acoes[i] && acoes[i].tipo === "esperar") || (i > 0 && acoes[i - 1] && acoes[i - 1].tipo === "esperar")) continue;
    let j = i;
    while (j + 1 < acoes.length && acoes[j + 1] && acoes[j + 1].tipo === "esperar") j++;
    if (j === i) continue;
    const nums = [];
    let soma = 0;
    for (let k = i; k <= j; k++) { nums.push(String(k + 1)); soma += inteiro(acoes[k].minutos) || 0; }
    add(`Os passos ${listaFrase(nums)} são esperas seguidas (somam ${formatarDuracao(soma)}): o tempo delas se soma.`, i, "esperas");
    i = j;
  }
  const paraCliente = acoes.some(x => x && x.tipo === "esperar" && x.cancelar_se_cliente_responder);
  if (paraCliente && ["tarefa_vencida", "agendado"].includes(a.gatilho))
    add("«Parar se o cliente responder» só vale quando existe uma conversa com o cliente.", null, "parar_cliente");
  if (acoes.some(x => x && x.tipo === "ia_decidir")) add("Cada passo da IA usa uma sugestão da cota de IA do mês. Use condições para ela não rodar à toa.", null, "ia");
  const iMsg = acoes.findIndex(ehMensagem);
  // plano 1500c · UCA-017: «Chegou uma mensagem» sem palavras nem condição + mensagem = resposta automática a cada «ok», «obrigado»
  if (a.gatilho === "mensagem_recebida" && iMsg >= 0 && !palavrasUnicas(c.palavras).length && !conds.length)
    add("Ela responde a toda mensagem do cliente (até um «ok» ou «obrigado»). Use palavras-chave ou uma condição.", iMsg, "toda_mensagem");
  // plano 1500c · UCA-018: «Todo dia» sem etapa nem condição manda para cada negócio aberto, todo dia
  if (a.gatilho === "agendado" && iMsg >= 0 && vazio(c.estagio_id) && !conds.length)
    add(`Sem etapa nem condição, ela manda mensagem todo dia para cada ${vv.min("negocio")} ${vv.conc("negocio", "aberto", "aberta")}.`, iMsg, "massa_diaria");
  // plano 1500c · UCA-022: passo de conversa num gatilho que pode não ter conversa
  if (GATILHOS_SEM_CONVERSA.includes(a.gatilho)) acoes.forEach((x, i) => {
    if (ehPassoDeConversa(x) && !tl[i].inalcancavel) add(`O passo ${i + 1} só funciona quando existe conversa aberta com o contato; sem ela, é pulado.`, i, "sem_conversa");
  });
  // plano 1500c · UCA-112: espera que NÃO para quando o cliente responde, antes de uma mensagem
  if (!["tarefa_vencida", "agendado"].includes(a.gatilho)) acoes.forEach((x, i) => {
    if (!(x && x.tipo === "esperar" && x.cancelar_se_cliente_responder === false) || tl[i].inalcancavel) return;
    const k = acoes.findIndex((y, j) => j > i && ehMensagem(y) && !tl[j].inalcancavel);
    if (k >= 0) add(`A espera do passo ${i + 1} não para quando o cliente responde: quem responder ainda vai receber a mensagem do passo ${k + 1}.`, i, "nao_para");
  });
  // plano 1500c · UCA-020: o texto da mensagem só existe nos gatilhos de mensagem (a condição nunca casaria)
  conds.forEach((cd, i) => {
    if (cd && cd.campo === "texto" && a.gatilho && !GATILHOS_COM_TEXTO.includes(a.gatilho))
      add(`Condição ${i + 1}: o texto da mensagem só existe quando o gatilho é uma mensagem; com este gatilho ela nunca vale.`, null, "texto_sem_mensagem");
  });
  // plano 1500c · UCA-019: condições que nunca valem juntas
  for (const x of condicoesContraditorias(conds)) add(`As condições ${x.i + 1} e ${x.j + 1} nunca valem juntas (${x.motivo}): a automação não vai rodar.`, null, "contraditorias");
  return avisos;
}

/** plano 1500c · UCA-020: gatilhos em que existe o texto de uma mensagem do cliente. */
export const GATILHOS_COM_TEXTO = Object.freeze(["mensagem_recebida", "conversa_nova"]);

/**
 * plano 1500c · UCA-019: pares de condições que nunca podem valer juntas (tudo é «E»): [{i, j, motivo}].
 * Casos: «é X» e «é Y» no mesmo campo (exceto etiqueta, que pode ter várias); «é X» e «não é X»; «maior que A» e «menor que B» com A ≥ B;
 * «está vazio» com «está preenchido» (ou com qualquer valor) no mesmo campo.
 */
export function condicoesContraditorias(conds) {
  const l = Array.isArray(conds) ? conds : [];
  const out = [];
  const val = cd => (tipoValorCondicao(cd.campo) === "numero" ? numeroBR(cd.valor) : normalizar(cd.valor));
  for (let i = 0; i < l.length; i++) for (let j = i + 1; j < l.length; j++) {
    const a = l[i], b = l[j];
    if (!a || !b || !a.campo || a.campo !== b.campo) continue;
    const ops = [a.op, b.op];
    const tem = (x, y) => (a.op === x && b.op === y) || (a.op === y && b.op === x);
    let motivo = null;
    if (a.op === "igual" && b.op === "igual" && a.campo !== "etiqueta" && !vazio(a.valor) && !vazio(b.valor) && val(a) !== val(b))
      motivo = "pedem dois valores diferentes para o mesmo campo";
    else if (tem("igual", "diferente") && !vazio(a.valor) && val(a) === val(b)) motivo = "uma pede o valor e a outra não aceita o mesmo valor";
    else if (tem("vazio", "preenchido")) motivo = "uma pede o campo vazio e a outra, preenchido";
    else if (ops.includes("vazio") && ops.some(o => ["igual", "contem", "maior", "menor"].includes(o)) && a.campo !== "etiqueta") motivo = "uma pede o campo vazio e a outra, um valor";
    else if (tem("maior", "menor")) {
      const ma = a.op === "maior" ? a : b, me = a.op === "maior" ? b : a;
      const x = numeroBR(ma.valor), y = numeroBR(me.valor);
      if (x != null && y != null && x >= y) motivo = `nenhum número é maior que ${x} e menor que ${y} ao mesmo tempo`;
    }
    if (motivo) out.push({ i, j, motivo });
  }
  return out;
}

/** plano 1500c · UCA-023: palavras-chave sem repetir (sem diferença de acento/maiúscula), na ordem em que vieram. */
export function palavrasUnicas(v) {
  const vistas = new Set();
  const out = [];
  for (const x of (Array.isArray(v) ? v : texto(v).split(","))) {
    const t = texto(x).trim();
    const k = normalizar(t);
    if (!t || vistas.has(k)) continue;
    vistas.add(k); out.push(t);
  }
  return out;
}

/* ------------------------------------------------------------------ limpeza para o servidor */

/** «atribuir» gravado com o campo antigo «modo» (rodizio | conta) e sem o «dono» do contrato novo. */
export const ehAtribuirAntigo = ac => !!ac && ac.tipo === "atribuir" && ac.dono == null && ac.modo != null;

/** Valor de um campo da ação; no «atribuir» antigo, «dono» é lido de «modo» (o editor mostra o jeito antigo sem trocá-lo). */
export const valorCampo = (ac, nome) => (nome === "dono" && ehAtribuirAntigo(ac) ? ac.modo : ac[nome]);

/** Só as chaves conhecidas, sem vazios opcionais, números como número. */
export function limpar(auto) {
  const a = auto || {};
  const g = GATILHO[a.gatilho];
  const out = {
    nome: texto(a.nome).trim(),
    gatilho: a.gatilho,
    config: {},
    condicoes: [],
    acoes: [],
    // plano 1500c · UCA-110: sem passo de mensagem o interruptor fica desabilitado no editor — gravar true seria um valor escondido
    respeitar_horario: !!a.respeitar_horario && enviaMensagem(a),
    ativo: !!a.ativo,
  };
  if (a.id) out.id = a.id;
  const c = a.config || {};
  if (g) {
    for (const f of g.campos) {
      let v = c[f.nome];
      if (f.tipo === "numero") { const n = inteiro(v); if (n != null) out.config[f.nome] = n; continue; }
      if (f.tipo === "sim_nao") { out.config[f.nome] = v == null ? !!f.padrao : !!v; continue; }
      if (f.tipo === "palavras") {
        const l = palavrasUnicas(v);     // plano 1500c · UCA-023: a IA ou a receita com «preço, Preço, preco» grava uma só
        if (l.length) out.config[f.nome] = l;
        continue;
      }
      if (f.tipo === "hora") { const t = texto(v).trim(); if (RE_HORA.test(t)) out.config[f.nome] = t; continue; }
      if (f.tipo === "dias_semana") { const d = normalizarDias(v); if (d.length) out.config[f.nome] = d; continue; }
      if (!vazio(v)) out.config[f.nome] = v;
    }
  }
  for (const cd of a.condicoes || []) {
    const x = { campo: cd.campo, op: cd.op };
    // plano 1000b · UB-061: milhar brasileiro («1.500,00») vira 1500, nunca NaN
    if (!(OPERADOR[cd.op] || {}).semValor) x.valor = tipoValorCondicao(cd.campo) === "numero" ? (numeroBR(cd.valor) ?? cd.valor) : cd.valor;
    out.condicoes.push(x);
  }
  for (const ac of a.acoes || []) {
    const d = ACAO[ac.tipo];
    const x = { tipo: ac.tipo };
    if (d) {
      // «atribuir» antigo (com «modo», sem «dono») NÃO é igual ao novo: o servidor só mexe na conversa e usa a regra de
      // distribuição do departamento. Por isso o campo continua gravado como «modo» até a pessoa escolher outro jeito.
      const legado = ehAtribuirAntigo(ac);
      for (const f of d.campos) {
        const v = valorCampo(ac, f.nome);
        const nome = legado && f.nome === "dono" ? "modo" : f.nome;
        if (f.tipo === "numero" || f.tipo === "duracao") { const n = inteiro(v); if (n != null) x[nome] = n; continue; }
        if (f.tipo === "sim_nao") { if (f.gravaSempre) x[nome] = v == null ? !!f.padrao : !!v; else if (v) x[nome] = true; continue; }
        if (f.tipo === "parametros") { x[nome] = (v || []).map(y => texto(y)); continue; }
        if (f.quando && Object.entries(f.quando).some(([k, val]) => valorCampo(ac, k) !== val)) continue;
        if (!vazio(v)) x[nome] = typeof v === "string" ? v.trim() : v;
      }
      if (ac.tipo === "etiquetar" && vazio(ac.etiqueta_id) && !vazio(ac.etiqueta_nome)) x.etiqueta_nome = texto(ac.etiqueta_nome).trim();
      if (ac.tipo === "enviar_template" && vazio(ac.template_id) && !vazio(ac.template_nome)) x.template_nome = texto(ac.template_nome).trim();
    }
    out.acoes.push(x);
  }
  return out;
}

/* ------------------------------------------------------------------ frase */

/**
 * Frase que descreve a automação.
 * ex.: "Quando a oportunidade entrar em «Avaliou / orçamento», criar tarefa «Enviar orçamento» para o responsável em 24 h."
 *      "24 h antes da consulta, enviar o modelo «confirmacao_consulta»."
 *      "Quando ..., esperar 1 dia (parando se o cliente responder) e depois enviar a mensagem «...»."
 * @param auto   automação (formato §5.8)
 * @param base   `base` do nx_automacoes_listar (nomes) — opcional
 * @param vocab  ctx.vocab — opcional
 */
export function descrever(auto, base, vocab) {
  const a = auto || {};
  const ix = indexarBase(base);
  const vv = voc(vocab);
  const quando = fraseQuando(a, ix, vv);
  const conds = (a.condicoes || []).map(cd => fraseCondicao(cd, ix)).filter(Boolean);
  const passos = (a.acoes || []).map(ac => ({ tipo: ac && ac.tipo, frase: fraseAcao(ac, ix, vv) })).filter(x => x.frase);
  let f = quando;
  if (conds.length) f += `, se ${listaFrase(conds)}`;
  // plano 1000 · AS-029: sem passos, a frase diz o que falta (antes: «(nenhuma ação)» cru)
  f += `, ${passos.length ? juntarPassos(passos) : "ainda sem passos — acrescente o que fazer em «Então»"}`;
  if (a.respeitar_horario && (a.acoes || []).some(ac => (ACAO[ac.tipo] || {}).mensagem)) f += " (mensagens só no horário de atendimento)";
  f = f.charAt(0).toUpperCase() + f.slice(1);
  return f + ".";
}

/** "A, B e C" — e, havendo esperas: "A, esperar 1 dia e depois B e C". */
function juntarPassos(passos) {
  if (!passos.some(x => x.tipo === "esperar")) return listaFrase(passos.map(x => x.frase));
  const partes = [];
  let grupo = [];
  const fecha = () => { if (grupo.length) partes.push({ esp: false, txt: listaFrase(grupo) }); grupo = []; };
  for (const x of passos) {
    if (x.tipo === "esperar") { fecha(); partes.push({ esp: true, txt: x.frase }); } else grupo.push(x.frase);
  }
  fecha();
  let s = partes[0].txt;
  for (let i = 1; i < partes.length; i++) s += partes[i - 1].esp ? ` e depois ${partes[i].txt}` : `, ${partes[i].txt}`;
  return s;
}

/** plano 1500c · UCA-002: o tipo de tarefa dentro da frase do gatilho «Tarefa venceu». */
const TAREFA_NA_FRASE = Object.freeze({ tarefa: "uma tarefa", ligacao: "uma ligação", whatsapp: "uma tarefa de WhatsApp", reuniao: "uma reunião",
  visita: "uma visita", email: "uma tarefa de e-mail" });

function fraseQuando(a, ix, vv) {
  const c = a.config || {};
  const neg = `${vv.art("negocio")} ${vv.min("negocio")}`;
  const noCanal = c.canal_id ? ` no número ${aspas(nomeDe(ix, "canais", c.canal_id, "escolhido"))}` : "";
  const noDep = c.departamento_id ? ` em ${aspas(nomeDe(ix, "departamentos", c.departamento_id, "departamento escolhido"))}` : "";
  const noFunil = c.funil_id ? ` no funil ${aspas(nomeDe(ix, "funis", c.funil_id, "escolhido"))}` : "";
  const etapa = id => aspas(nomeDe(ix, "estagios", id, "etapa escolhida") || "etapa escolhida");
  switch (a.gatilho) {
    case "conversa_nova": return `quando chegar uma conversa nova${noCanal}${noDep}`;
    case "conversa_resolvida": return `quando uma conversa for resolvida${noCanal}${noDep}`;
    case "mensagem_recebida": {
      const p = (c.palavras || []).filter(Boolean);
      // plano 1000b · UB-281: «(e mais 3)» — diz quantas ficaram de fora
      return `quando chegar mensagem${p.length ? ` com ${listaFrase(p.slice(0, 4).map(aspas), "ou")}${p.length > 4 ? ` (e mais ${p.length - 4})` : ""}` : ""}${noCanal}`;
    }
    case "sem_resposta":
      // plano 1000b · UB-282: sem tempo válido não vira «há 0 min»
      // plano 1500c · UCA-025: «há 1 h 30 min» (não «há 90 min»), a mesma régua do resto do editor
      return `quando uma conversa${noDep} ficar sem resposta há ${Number(c.minutos) > 0 ? formatarDuracao(c.minutos) : "(escolha o tempo)"}${c.so_no_horario ? " (contando só no horário de atendimento)" : ""}`;
    case "negocio_criado": return `quando ${vv.um("negocio")} ${vv.min("negocio")} for criad${vv.art("negocio")}${noFunil}`;
    case "negocio_estagio": return `quando ${neg} entrar em ${etapa(c.estagio_id)}`;
    case "tempo_no_estagio": return `quando ${neg} ficar parad${vv.art("negocio")} em ${etapa(c.estagio_id)} por ${formatarHoras(c.horas)}`;
    case "negocio_ganho": return `quando ${neg} for marcad${vv.art("negocio")} como ${aspas(vv.v.ganhar)}${noFunil}`;
    case "negocio_perdido": return `quando ${neg} for marcad${vv.art("negocio")} como ${aspas(vv.v.perder)}${noFunil}`;
    case "etiqueta_adicionada": return `quando a etiqueta ${aspas(nomeDe(ix, "etiquetas", c.etiqueta_id, "escolhida") || "escolhida")} for adicionada`;
    case "tarefa_vencida": {
      // plano 1500c · UCA-002: «quando uma ligação de «Ana Lima» vencer…»
      const tipo = TAREFA_NA_FRASE[c.tipo_tarefa] || "uma tarefa";
      const dono = c.dono_id ? ` de ${aspas(nomeDe(ix, "usuarios", c.dono_id, "pessoa escolhida"))}` : "";
      return `quando ${tipo}${dono} vencer sem ser concluída`;
    }
    case "antes_da_data": {
      const alvo = c.campo === "previsao_fechamento" ? "da previsão de fechamento" : `da ${palavraConsulta(vv.vertical)}`;
      return `${formatarHoras(c.horas)} antes ${alvo}${noFunil}`;
    }
    case "apos_data": {
      const alvo = c.campo === "previsao_fechamento" ? "da previsão de fechamento" : `da ${palavraConsulta(vv.vertical)}`;
      return `${formatarHoras(c.horas)} depois ${alvo}${noFunil}`;
    }
    case "agendado": {
      // plano 1500c · UCA-121: com mais de um funil e sem o funil escolhido, a frase diz de qual funil é a etapa
      const est = c.estagio_id ? ix.estagios.get(c.estagio_id) : null;
      const doFunil = est && !c.funil_id && ix.funis.size > 1 && est.funil_nome ? ` (funil ${aspas(est.funil_nome)})` : "";
      const noEstagio = c.estagio_id ? ` na etapa ${etapa(c.estagio_id)}${doFunil}` : "";
      return `${frasePeriodo(c.dias_semana)}, às ${RE_HORA.test(texto(c.horario)) ? c.horario : "(horário)"}, para cada ${vv.min("negocio")} ${vv.conc("negocio", "aberto", "aberta")}${noFunil}${noEstagio}`;
    }
    default: return "quando (escolha o gatilho)";
  }
}

/** plano 1500c · UCA-005: as condições em uma frase («a origem for «Anúncio» e o valor for maior que «R$ 1.000,00»»). */
export function fraseCondicoes(conds, base) {
  const ix = indexarBase(base);
  return listaFrase((Array.isArray(conds) ? conds : []).map(cd => fraseCondicao(cd, ix)).filter(Boolean));
}

function fraseCondicao(cd, ix) {
  if (!cd || !cd.campo) return null;
  const op = OPERADOR[cd.op];
  if (!op) return null;
  let rot;
  if (String(cd.campo).startsWith("contato.")) {
    const k = cd.campo.slice(8);
    const campo = ix.campos.get(k);
    rot = `o campo ${aspas(campo ? campo.rotulo : k)}`;
  } else {
    const c = CAMPO_CONDICAO[cd.campo];
    if (!c) return null;
    rot = { origem: "a origem", funil_id: "o funil", estagio_id: "a etapa", canal_id: "o número", departamento_id: "o departamento",
      etiqueta: "a etiqueta", texto: "o texto", valor: "o valor", dono_id: "o responsável",
      campanha: "a campanha", plataforma: "a plataforma" }[cd.campo];      // plano 1500c · UCA-001
  }
  if (op.semValor) {
    if (cd.campo === "etiqueta") return cd.op === "vazio" ? "não tiver etiqueta" : "tiver alguma etiqueta";
    return `${rot} ${op.frase}`;
  }
  if (cd.campo === "etiqueta") {
    const n = aspas(nomeDe(ix, "etiquetas", cd.valor, "escolhida") || "escolhida");
    return cd.op === "diferente" || cd.op === "nao_contem" ? `não tiver a etiqueta ${n}` : `tiver a etiqueta ${n}`;
  }
  // condição ainda sem valor (receita cuja etapa não existe neste funil): «(a escolher)», nunca «null» na frase
  const v = valorLegivel(cd.campo, cd.valor, ix);
  return `${rot} ${op.frase} ${aspas(v == null || v === "" ? "(a escolher)" : v)}`;
}

function valorLegivel(campo, valor, ix) {
  switch (campo) {
    case "origem": return (ORIGENS.find(([k]) => k === valor) || [null, valor])[1];
    case "funil_id": return nomeDe(ix, "funis", valor, "escolhido");
    case "estagio_id": return nomeDe(ix, "estagios", valor, "escolhida");
    case "canal_id": return nomeDe(ix, "canais", valor, "escolhido");
    case "departamento_id": return nomeDe(ix, "departamentos", valor, "escolhido");
    case "dono_id": return nomeDe(ix, "usuarios", valor, "pessoa escolhida");
    case "valor": return brl(valor);
    case "plataforma": { const p = PLATAFORMAS.find(([k]) => k === normalizar(valor)); return p ? (p[0] === "meta" ? "Meta" : "Google") : cortar(valor, 40); }   // plano 1500c · UCA-001
    default: return cortar(valor, 40);
  }
}

export function brl(v) {
  const n = numeroBR(v);      // plano 1500c · UCA-006: «1.500» é mil e quinhentos (antes virava R$ 1,50) e «1.500,00» não sai cru
  if (n == null) return texto(v);
  const [i, d] = Math.abs(n).toFixed(2).split(".");
  return `${n < 0 ? "-" : ""}R$ ${i.replace(/\B(?=(\d{3})+(?!\d))/g, ".")},${d}`;
}

function quemTarefa(dono, ix) {
  if (dono === "responsavel") return "o responsável";
  if (dono === "atendente") return "quem atende a conversa";
  return aspas(nomeDe(ix, "usuarios", dono, "pessoa escolhida") || "pessoa escolhida");
}

// plano 1000b · UB-066: «pontuar o interesse do paciente/cliente» no vocabulário da vertical (não «lead» em clínica e oficina)
const FRASE_IA = {
  classificar_etapa: () => "pedir à IA para escolher a etapa certa",
  resumir_nota: () => "pedir à IA para resumir a conversa numa nota",
  pontuar_lead: vv => `pedir à IA para pontuar o interesse d${vv.art("contato")} ${vv.min("contato")}`,
};

/** plano 1000b · UB-066: as tarefas do passo de IA com o nome no vocabulário da vertical ([id, nome, texto], como TAREFAS_IA). */
export function tarefasIA(vocab = null) {
  const vv = voc(vocab);
  const quem = `d${vv.art("contato")} ${vv.min("contato")}`;
  return TAREFAS_IA.map(([k, nome, txt]) => (k === "pontuar_lead"
    ? [k, "Pontuar o interesse", `Dá uma nota de 0 a 100 para o interesse ${quem} e guarda o motivo.`] : [k, nome, txt]));
}

function fraseAcao(ac, ix, vv) {
  if (!ac || !ACAO[ac.tipo]) return null;
  switch (ac.tipo) {
    case "criar_tarefa": {
      const prazo = Number(ac.vence_em_horas ?? 24);
      return `criar tarefa ${aspas(cortar(ac.titulo || "sem título", 60))} para ${quemTarefa(ac.dono || "responsavel", ix)}${prazo === 0 ? " para já" : ` com prazo de ${formatarHoras(prazo)}`}`;   // plano 1000b · UB-065: «em 24 h» soava como agendamento
    }
    case "mover_estagio": return `mover para ${aspas(nomeDe(ix, "estagios", ac.estagio_id, "etapa escolhida") || "etapa escolhida")}`;
    case "mover_funil": {
      const e = ac.estagio_id ? ` (etapa ${aspas(nomeDe(ix, "estagios", ac.estagio_id, "escolhida"))})` : "";
      return `mover para o funil ${aspas(nomeDe(ix, "funis", ac.funil_id, "escolhido") || "escolhido")}${e}`;
    }
    case "criar_negocio": {
      const f = ac.funil_id ? ` no funil ${aspas(nomeDe(ix, "funis", ac.funil_id, "escolhido"))}` : "";
      return `criar ${vv.um("negocio")} ${vv.min("negocio")}${f}`;
    }
    case "enviar_mensagem": return `enviar a mensagem ${aspas(cortar(ac.texto, 48))}`;
    case "enviar_template": {
      const t = ac.template_id ? ix.templates.get(ac.template_id) : null;
      const nome = t ? t.nome : (ac.template_nome || "escolhido");
      return `enviar o modelo ${aspas(nome)}`;
    }
    case "atribuir": {
      const dep = ac.departamento_id ? ` em ${aspas(nomeDe(ix, "departamentos", ac.departamento_id, "departamento escolhido"))}` : "";
      const dono = ac.dono ?? ac.modo;
      if (dono === "conta") return `atribuir a ${aspas(nomeDe(ix, "usuarios", ac.conta_id, "pessoa escolhida") || "pessoa escolhida")}${dep}`;
      if (dono === "departamento") return `atribuir ao departamento ${aspas(nomeDe(ix, "departamentos", ac.departamento_id, "escolhido") || "escolhido")}`;
      return `distribuir no rodízio${dep}`;
    }
    case "etiquetar": {
      const n = aspas(ac.etiqueta_id ? (nomeDe(ix, "etiquetas", ac.etiqueta_id, "escolhida") || "escolhida") : (ac.etiqueta_nome || "escolhida"));
      // "no paciente" / "no cliente" / "no contato" (vocabulário da vertical) ou "na conversa"
      const [art, onde] = ac.alvo === "conversa" ? ["a", "conversa"] : [vv.art("contato"), vv.min("contato") || "contato"];
      return ac.remover ? `tirar a etiqueta ${n} d${art} ${onde}` : `pôr a etiqueta ${n} n${art} ${onde}`;
    }
    case "etiqueta_adicionar": case "etiqueta_remover": {
      const n = aspas(ac.etiqueta_id ? (nomeDe(ix, "etiquetas", ac.etiqueta_id, "escolhida") || "escolhida") : (ac.etiqueta_nome || "escolhida"));
      return ac.tipo === "etiqueta_adicionar" ? `pôr a etiqueta ${n}` : `tirar a etiqueta ${n}`;
    }
    case "campo_atualizar": {
      const c = ac.campo ? ix.camposAtualizar.get(ac.campo) : null;
      return `preencher o campo ${aspas(c ? c.rotulo : (ac.campo || "escolhido"))} com ${aspas(cortar(ac.valor, 40) || "…")}`;
    }
    case "nota": return `anotar ${aspas(cortar(ac.texto, 48) || "…")}`;
    case "notificar": {
      if (ac.para === "responsavel") return "avisar o responsável";
      if (ac.para === "admins") return "avisar os administradores";
      if (ac.para === "departamento") return `avisar o departamento ${aspas(nomeDe(ix, "departamentos", ac.departamento_id, "escolhido") || "escolhido")}`;
      return `avisar ${aspas(nomeDe(ix, "usuarios", ac.para, "pessoa escolhida") || "pessoa escolhida")}`;
    }
    case "resolver_conversa": return "resolver a conversa";
    case "esperar": return `esperar ${formatarDuracao(ac.minutos)}${ac.cancelar_se_cliente_responder ? " (parando se o cliente responder)" : ""}`;
    case "parar": return "parar por aqui";
    case "ia_decidir": return FRASE_IA[ac.tarefa] ? FRASE_IA[ac.tarefa](vv) : "pedir à IA para decidir";
    case "alerta_whatsapp": return "avisar no WhatsApp do gestor";
    default: return null;
  }
}

/** Uma frase por passo, com o momento em que roda: [{i, tipo, quando, frase, inalcancavel}] — o "plano" da automação. */
export function passosEmFrases(auto, base, vocab) {
  const ix = indexarBase(base);
  const vv = voc(vocab);
  const tl = linhaDoTempo(auto && auto.acoes);
  return ((auto && auto.acoes) || []).map((ac, i) => ({
    i, tipo: ac && ac.tipo, quando: tl[i].quando, inalcancavel: tl[i].inalcancavel,
    frase: fraseAcao(ac, ix, vv) || "(passo incompleto)",
  }));
}

/* ------------------------------------------------------------------ variáveis */

/**
 * Aplica as variáveis de §5.8 com dados de exemplo (prévia do editor).
 * dados = {nome, empresa, protocolo, etapa, valor, atendente, consulta_em (ISO)}
 */
export function aplicarVariaveis(txt, dados = {}) {
  const d = dados || {};
  const nome = texto(d.nome).trim();
  let data = "", hora = "";
  if (d.consulta_em) {
    const dt = new Date(d.consulta_em);
    if (!isNaN(dt)) {
      const p = new Intl.DateTimeFormat("pt-BR", { timeZone: "America/Sao_Paulo", day: "2-digit", month: "2-digit", hour: "2-digit", minute: "2-digit", hour12: false })
        .formatToParts(dt).reduce((o, x) => (o[x.type] = x.value, o), {});
      data = `${p.day}/${p.month}`; hora = `${p.hour === "24" ? "00" : p.hour}:${p.minute}`;
    }
  }
  const mapa = {
    primeiro_nome: nome.split(/\s+/)[0] || "", nome, empresa: texto(d.empresa), protocolo: texto(d.protocolo),
    etapa: texto(d.etapa), valor: d.valor == null || d.valor === "" ? "" : brl(d.valor), atendente: texto(d.atendente),
    data_consulta: data, hora_consulta: hora,
  };
  return texto(txt).replace(/\{([a-z_]+)\}/g, (m, k) => (k in mapa ? mapa[k] : m));
}

/** Variáveis desconhecidas usadas no texto (o editor avisa). */
// plano 1500c · UCA-007: qualquer {…} curto conta ({Primeiro_Nome}, { nome }, {primeiro nome}) — o motor só troca {a_z} exato, o resto
// chegaria cru ao cliente. Os {{1}} dos modelos da Meta não entram (chave dupla).
export function variaveisDesconhecidas(txt) {
  const ok = new Set(VARIAVEIS.map(([k]) => k));
  return [...new Set([...texto(txt).matchAll(/(?<!\{)\{(?!\{)([^{}\n]{1,40})\}(?!\})/g)].map(m => m[1]).filter(k => !ok.has(k)))];
}

/* ------------------------------------------------------------------ receitas prontas (T12 + PLANO-NOITE) */

export const TEXTO_MODELO_LEMBRETE =
  "Olá, {{1}}! Confirmando sua consulta em {{2}} às {{3}}. Responda SIM para confirmar ou nos chame para remarcar.";
/** Texto sugerido do modelo de lembrete na palavra da vertical (consulta / visita / entrega). */
export const textoModeloLembrete = vertical => TEXTO_MODELO_LEMBRETE.replace("consulta", palavraConsulta(vertical));

/** Receita do «orçamento»: a etapa de marco `orcamento` tem outro nome (e outro sentido) em cada vertical —
 *  na clínica é "Avaliou / orçamento" (falta ENVIAR o orçamento); na oficina e na loja o orçamento/proposta
 *  JÁ foi enviado e a tarefa é cobrar a resposta. */
function orcamentoDaVertical(vertical) {
  if (vertical === "oficina") return { titulo: "Orçamento enviado → cobrar resposta em 24 h", etapa: "Orçamento enviado",
    texto: "o responsável ganha a tarefa de cobrar a resposta do cliente em 24 h.", nome: "Cobrar orçamento em 24 h",
    tarefa: "Cobrar resposta do orçamento: {primeiro_nome}", obj: "o orçamento", cap: "Orçamento" };
  if (vertical === "loja" || vertical === "generico") return { titulo: "Proposta enviada → cobrar resposta em 24 h",
    etapa: vertical === "loja" ? "Proposta enviada" : "Proposta", texto: "o responsável ganha a tarefa de cobrar a resposta do cliente em 24 h.",
    nome: "Cobrar proposta em 24 h", tarefa: "Cobrar resposta da proposta: {primeiro_nome}", obj: "a proposta", cap: "Proposta" };
  return { titulo: "Entrou em Avaliou → tarefa de orçamento em 24 h", etapa: "Avaliou / orçamento",
    texto: "o responsável ganha a tarefa de enviar o orçamento em 24 h.", nome: "Orçamento em 24 h",
    tarefa: "Enviar orçamento para {primeiro_nome}", obj: "o orçamento", cap: "Orçamento" };
}

const ETAPA_ORC = v => orcamentoDaVertical(v).etapa;

/**
 * Receitas. `categoria`: whatsapp | equipe | ia. `destaque`: verticais em que a receita vem primeiro.
 * `ocultar`: verticais em que não faz sentido. `auto.config.estagio_marco` e `condicoes[].valor_marco`
 * são trocados pelo id da etapa do funil padrão do cliente (aplicarModelo).
 * Nascem DESLIGADAS (aplicarModelo força ativo=false).
 */
export const MODELOS = Object.freeze([
  // ---- WhatsApp (sai pelo CodeWords: texto livre, sem modelo da Meta)
  { id: "lembrete_consulta_texto", categoria: "whatsapp", icone: "relogio", destaque: ["odonto", "oficina"], ocultar: [],
    titulo: vv => `Lembrete 24 h antes da ${palavraConsulta(vv.vertical)} → mensagem de texto`,
    texto: vv => `Manda uma mensagem de texto 24 h antes da ${palavraConsulta(vv.vertical)} marcada, pelo WhatsApp conectado por aparelho (CodeWords). Não precisa de modelo da Meta nem da janela de 24 h.`,
    aviso: "No WhatsApp oficial (Meta) esta mensagem só sai se o cliente escreveu nas últimas 24 h; nesse caso use o modelo de confirmação aprovado.",
    auto: { nome: "Lembrete 24 h antes da consulta (texto)", gatilho: "antes_da_data", config: { campo: "consulta", horas: 24 }, condicoes: [],
      acoes: [{ tipo: "enviar_mensagem", texto: "Olá, {primeiro_nome}! Passando para lembrar da sua consulta amanhã, {data_consulta}, às {hora_consulta}. Responda SIM para confirmar ou nos avise se precisar remarcar." }],
      respeitar_horario: false } },
  { id: "confirmacao_agendamento", categoria: "whatsapp", icone: "check", destaque: ["odonto", "oficina"], ocultar: [],
    titulo: vv => `${vv.v.negocio} agendad${vv.art("negocio")} → confirmação por mensagem de texto`,
    texto: vv => `Assim que ${vv.art("negocio")} ${vv.min("negocio")} entra em «Agendada» (pela IA ou pela equipe), o cliente recebe a confirmação do dia e da hora, pelo WhatsApp por aparelho (CodeWords).`,
    aviso: "No WhatsApp oficial (Meta) a mensagem só sai se o cliente escreveu nas últimas 24 h.",
    auto: { nome: "Confirmação ao agendar", gatilho: "negocio_estagio", config: { estagio_marco: "agendada" }, condicoes: [],
      acoes: [{ tipo: "enviar_mensagem", texto: "Olá, {primeiro_nome}! Sua consulta está confirmada para {data_consulta}, às {hora_consulta}. Se precisar remarcar, é só responder aqui." }],
      respeitar_horario: false } },
  { id: "followup_orcamento", categoria: "whatsapp", icone: "relogio", destaque: ["odonto", "oficina", "loja", "generico"], ocultar: [],   // plano 1500c · UCA-066
    titulo: vv => `${orcamentoDaVertical(vv.vertical).cap} sem resposta → 2 mensagens de acompanhamento (1 dia e 3 dias)`,
    texto: vv => `Quando ${vv.art("negocio")} ${vv.min("negocio")} chega em «${ETAPA_ORC(vv.vertical)}», espera 1 dia e manda uma mensagem; sem resposta, manda outra no 3º dia e deixa uma tarefa de ligação. Se o cliente responder, a sequência para sozinha.`,
    aviso: "As mensagens respeitam o horário de funcionamento. Revise o texto antes de ligar.",
    auto: { nome: "Acompanhar orçamento sem resposta", gatilho: "negocio_estagio", config: { estagio_marco: "orcamento" }, condicoes: [],
      acoes: [
        { tipo: "esperar", minutos: 1440, cancelar_se_cliente_responder: true },
        { tipo: "enviar_mensagem", texto: "Oi, {primeiro_nome}, tudo bem? Passando para saber se ficou alguma dúvida sobre o orçamento. Posso ajudar?" },
        { tipo: "esperar", minutos: 2880, cancelar_se_cliente_responder: true },
        { tipo: "enviar_mensagem", texto: "Oi, {primeiro_nome}! Não quero te incomodar, só avisar que o orçamento continua de pé. Se quiser, já deixo um horário reservado para você." },
        { tipo: "criar_tarefa", titulo: "Ligar para {primeiro_nome}: orçamento sem resposta", tipo_tarefa: "ligacao", vence_em_horas: 0, dono: "responsavel" },
      ],
      respeitar_horario: true } },
  { id: "faltou_remarcar", categoria: "whatsapp", icone: "calendario", destaque: ["odonto"], ocultar: ["loja"],
    titulo: vv => `Faltou à ${palavraConsulta(vv.vertical)} → convidar para remarcar`,
    texto: vv => `2 h depois do horário marcado, quem estiver na etapa «Faltou» recebe uma mensagem gentil para remarcar, e a equipe ganha a tarefa de remarcar a ${palavraConsulta(vv.vertical)}.`,
    aviso: "Para valer, a recepção precisa mover quem faltou para a etapa «Faltou» nas 2 horas seguintes ao horário marcado.",
    auto: { nome: "Faltou → remarcar", gatilho: "apos_data", config: { campo: "consulta", horas: 2 },
      condicoes: [{ campo: "estagio_id", op: "igual", valor_marco: "faltou" }],
      acoes: [
        { tipo: "enviar_mensagem", texto: "Oi, {primeiro_nome}! Sentimos sua falta na consulta de hoje. Aconteceu alguma coisa? Me diga o melhor dia e horário que a gente remarca para você." },
        { tipo: "criar_tarefa", titulo: "Remarcar consulta de {primeiro_nome}", tipo_tarefa: "whatsapp", vence_em_horas: 24, dono: "responsavel" },
      ],
      respeitar_horario: true } },
  { id: "pos_atendimento", categoria: "whatsapp", icone: "check", destaque: [], ocultar: [],
    titulo: vv => `Depois da ${palavraConsulta(vv.vertical)} → pedir uma avaliação`,
    texto: vv => `No dia seguinte à ${palavraConsulta(vv.vertical)}, o cliente recebe uma mensagem perguntando como foi e pedindo uma avaliação. Quem faltou não recebe.`,
    auto: { nome: "Pós-consulta: avaliação", gatilho: "apos_data", config: { campo: "consulta", horas: 24 },
      condicoes: [{ campo: "estagio_id", op: "diferente", valor_marco: "faltou", opcional: true }],
      acoes: [{ tipo: "enviar_mensagem", texto: "Oi, {primeiro_nome}! Como foi sua consulta? Se puder, conte para a gente em uma frase, sua opinião ajuda muito. Obrigado pela confiança!" }],
      respeitar_horario: true } },
  { id: "reativar_30_dias", categoria: "whatsapp", icone: "relogio", destaque: [], ocultar: [],
    titulo: () => "30 dias parado → mensagem para reativar",
    texto: vv => `Quem ficou 30 dias parado em «${ETAPA_ORC(vv.vertical)}» recebe uma mensagem para retomar a conversa, e o responsável ganha uma tarefa de contato.`,
    aviso: "Escolhida a etapa «orçamento» por padrão; troque pela etapa em que seus clientes costumam parar.",
    auto: { nome: "Reativar quem parou há 30 dias", gatilho: "tempo_no_estagio", config: { estagio_marco: "orcamento", horas: 720 }, condicoes: [],
      acoes: [
        { tipo: "enviar_mensagem", texto: "Oi, {primeiro_nome}, tudo bem? Faz um tempinho que conversamos por aqui. Ainda posso te ajudar com isso? É só responder esta mensagem." },
        { tipo: "criar_tarefa", titulo: "Reativar {primeiro_nome} (30 dias parado)", tipo_tarefa: "whatsapp", vence_em_horas: 48, dono: "responsavel" },
      ],
      respeitar_horario: true } },
  // ---- Equipe e CRM (rodam dentro do sistema)
  { id: "lead_anuncio", categoria: "equipe", icone: "sino", destaque: ["loja", "generico"], ocultar: [],   // plano 1500c · UCA-066
    titulo: () => "Lead de anúncio → avisar o responsável e criar tarefa em 15 min",
    texto: () => "Quando entra um contato vindo de anúncio, o responsável recebe um aviso na hora; 15 minutos depois, uma tarefa lembra de conferir se ele já foi atendido.",
    auto: { nome: "Lead de anúncio: responder rápido", gatilho: "negocio_criado", config: {},
      condicoes: [{ campo: "origem", op: "igual", valor: "anuncio" }],
      acoes: [
        { tipo: "notificar", para: "responsavel", titulo: "Novo lead de anúncio: {nome}", texto: "Responda rápido: lead de anúncio esfria nos primeiros minutos." },
        { tipo: "esperar", minutos: 15, cancelar_se_cliente_responder: false },
        { tipo: "criar_tarefa", titulo: "Conferir o atendimento de {primeiro_nome} (lead de anúncio)", tipo_tarefa: "whatsapp", vence_em_horas: 0, dono: "responsavel" },
      ],
      respeitar_horario: false } },
  { id: "sem_resposta", categoria: "equipe", icone: "sino", destaque: ["generico"], ocultar: [],   // plano 1500c · UCA-066
    titulo: () => "Sem resposta há 15 min → avisar o responsável",
    texto: () => "Ninguém respondeu o cliente em 15 minutos (contando só no horário de atendimento)? O responsável recebe um aviso no sino.",
    auto: { nome: "Sem resposta há 15 min", gatilho: "sem_resposta", config: { minutos: 15, so_no_horario: true }, condicoes: [],
      acoes: [{ tipo: "notificar", para: "responsavel", titulo: "{nome} está esperando resposta", texto: "Atendimento {protocolo} sem resposta há 15 min." }],
      respeitar_horario: false } },
  // plano 100 · G8: lead que veio do site (rastreio) esfria rápido; e a equipe confere a agenda do dia seguinte sem depender de modelo da Meta
  { id: "site_sem_resposta", categoria: "equipe", icone: "sino", destaque: [], ocultar: [],
    titulo: () => "Lead do site sem resposta em 10 min → avisar o responsável",
    texto: () => "Quem chegou pelo site e ficou 10 minutos sem resposta (contando só no horário de atendimento) gera um aviso no sino do responsável.",
    aviso: "Só reconhece quem veio do site com o rastreio instalado (Configurações → Rastreio do site). Não manda nada ao cliente.",
    auto: { nome: "Lead do site sem resposta há 10 min", gatilho: "sem_resposta", config: { minutos: 10, so_no_horario: true },
      condicoes: [{ campo: "origem", op: "igual", valor: "site" }],
      acoes: [{ tipo: "notificar", para: "responsavel", titulo: "{nome} veio do site e está esperando", texto: "Lead do site sem resposta há 10 min (atendimento {protocolo})." }],
      respeitar_horario: false } },
  { id: "lembrete_equipe_consulta", categoria: "equipe", icone: "calendario", destaque: [], ocultar: [],
    titulo: vv => `${palavraConsulta(vv.vertical).charAt(0).toUpperCase()}${palavraConsulta(vv.vertical).slice(1)} marcada → lembrar a equipe 24 h antes`,
    texto: vv => `24 h antes da ${palavraConsulta(vv.vertical)} marcada, o responsável ganha uma tarefa para confirmar com o cliente. Nada sai sozinho para o cliente.`,
    aviso: "Para o cliente receber o lembrete sozinho, use «Lembrete 24 h antes» (texto pelo CodeWords ou, no WhatsApp oficial, um modelo aprovado na Meta).",
    auto: { nome: "Lembrar a equipe 24 h antes da consulta", gatilho: "antes_da_data", config: { campo: "consulta", horas: 24 }, condicoes: [],
      acoes: [{ tipo: "criar_tarefa", titulo: "Confirmar a consulta de {primeiro_nome}: {data_consulta} às {hora_consulta}", tipo_tarefa: "whatsapp", vence_em_horas: 2, dono: "responsavel" }],
      respeitar_horario: false } },
  { id: "orcamento", categoria: "equipe", icone: "tarefa", destaque: [], ocultar: [],
    titulo: vv => orcamentoDaVertical(vv.vertical).titulo,
    texto: vv => `Quando ${vv.art("negocio")} ${vv.min("negocio")} chega em «${orcamentoDaVertical(vv.vertical).etapa}», ${orcamentoDaVertical(vv.vertical).texto}`,
    auto: { nome: "Orçamento em 24 h", gatilho: "negocio_estagio", config: { estagio_marco: "orcamento" }, condicoes: [],
      acoes: [{ tipo: "criar_tarefa", titulo: "Enviar orçamento para {primeiro_nome}", tipo_tarefa: "whatsapp", vence_em_horas: 24, dono: "responsavel" }],
      respeitar_horario: false } },
  { id: "pos_venda", categoria: "equipe", icone: "check", destaque: ["loja"], ocultar: [],
    // "Venda marcada como «Vendido»" (e não "Venda vendido"): concordância pelo gênero da palavra
    titulo: vv => `${vv.v.negocio} marcad${vv.art("negocio")} como «${vv.v.ganhar}» → tarefa de pós-venda em 7 dias`,
    texto: () => "Uma semana depois do fechamento, o responsável é lembrado de falar com o cliente: satisfação, avaliação e indicação.",
    auto: { nome: "Pós-venda em 7 dias", gatilho: "negocio_ganho", config: {}, condicoes: [],
      acoes: [{ tipo: "criar_tarefa", titulo: "Pós-venda: falar com {primeiro_nome}", tipo_tarefa: "whatsapp", vence_em_horas: 168, dono: "responsavel" }],
      respeitar_horario: false } },
  { id: "preco", categoria: "equipe", icone: "etiqueta", destaque: [], ocultar: [],
    titulo: () => "Mensagem com 'preço' → etiqueta Orçamento",
    texto: () => "Quem pergunta preço, valor ou quanto custa ganha a etiqueta Orçamento — fica fácil achar depois.",
    auto: { nome: "Perguntou preço", gatilho: "mensagem_recebida", config: { palavras: ["preço", "valor", "quanto custa"] }, condicoes: [],
      acoes: [{ tipo: "etiquetar", etiqueta_nome: "Orçamento", alvo: "contato" }],
      respeitar_horario: false } },
  // ---- Inteligência artificial (decide o servidor; usa a cota de IA do mês)
  { id: "ia_classificar_etapa", categoria: "ia", icone: "ia", destaque: [], ocultar: [], cotaIA: true,
    titulo: () => "Cliente escreveu → a IA escolhe a etapa do funil",
    texto: () => "A IA lê o que o cliente disse e move para a etapa que combina, sempre entre as etapas do seu funil. Só roda enquanto o contato está na primeira etapa, para poupar a cota de IA.",
    aviso: "Cada execução usa uma sugestão da cota de IA do mês.",
    auto: { nome: "IA classifica a etapa", gatilho: "mensagem_recebida", config: {},
      condicoes: [{ campo: "estagio_id", op: "igual", valor_marco: "nova" }],
      acoes: [{ tipo: "ia_decidir", tarefa: "classificar_etapa" }],
      respeitar_horario: false } },
  { id: "ia_resumo_conversa", categoria: "ia", icone: "ia", destaque: [], ocultar: [], cotaIA: true,
    titulo: () => "Conversa resolvida → a IA resume numa nota",
    texto: () => "Quando o atendimento é resolvido, a IA escreve um resumo curto da conversa na nota do histórico, para qualquer pessoa da equipe entender em segundos.",
    aviso: "Cada execução usa uma sugestão da cota de IA do mês.",
    auto: { nome: "Resumo da conversa ao resolver", gatilho: "conversa_resolvida", config: {}, condicoes: [],
      acoes: [{ tipo: "ia_decidir", tarefa: "resumir_nota" }],
      respeitar_horario: false } },
  // ---- plano 1500c · UCA-059..064: receitas novas (perdido, boas-vindas, valor alto, tarefa atrasada, desmarcar, indicação)
  { id: "reengajar_perdido", categoria: "whatsapp", icone: "relogio", destaque: [], ocultar: [],
    titulo: vv => `${vv.v.negocio} marcad${vv.art("negocio")} como «${vv.v.perder}» → tentar de novo em 30 dias`,
    texto: () => "30 dias depois de perder, o cliente recebe uma mensagem gentil para retomar a conversa e o responsável ganha uma tarefa de ligação. Se o cliente responder antes, a sequência para.",
    aviso: "As mensagens respeitam o horário de funcionamento. Revise o texto antes de ligar.",
    auto: { nome: "Reengajar quem não fechou (30 dias)", gatilho: "negocio_perdido", config: {}, condicoes: [],
      acoes: [
        { tipo: "esperar", minutos: 43200, cancelar_se_cliente_responder: true },
        { tipo: "enviar_mensagem", texto: "Oi, {primeiro_nome}, tudo bem? Faz um mês que conversamos e queria saber se ainda posso te ajudar. Se fizer sentido agora, é só responder aqui." },
        { tipo: "criar_tarefa", titulo: "Ligar para {primeiro_nome}: retomar o contato", tipo_tarefa: "ligacao", vence_em_horas: 48, dono: "responsavel" },
      ],
      respeitar_horario: true } },
  { id: "boas_vindas", categoria: "whatsapp", icone: "chat", destaque: [], ocultar: [],
    titulo: () => "Conversa nova → boas-vindas na hora e rodízio da equipe",
    texto: () => "Assim que alguém escreve pela primeira vez, recebe uma resposta rápida dizendo que já vai ser atendido, e a conversa vai para a próxima pessoa do rodízio.",
    aviso: "A mensagem sai também fora do horário de atendimento; se preferir, ligue «Respeitar horário» e ajuste o texto.",
    auto: { nome: "Boas-vindas e rodízio", gatilho: "conversa_nova", config: {}, condicoes: [],
      acoes: [
        { tipo: "enviar_mensagem", texto: "Oi, {primeiro_nome}! Recebemos sua mensagem e já vamos te atender." },
        { tipo: "atribuir", dono: "rodizio" },
      ],
      respeitar_horario: false } },
  { id: "valor_alto", categoria: "equipe", icone: "sino", destaque: ["loja", "oficina"], ocultar: [],
    titulo: vv => `${vv.v.negocio} de valor alto → avisar o gestor`,
    texto: vv => `Quando entra ${vv.um("negocio")} ${vv.min("negocio")} acima de R$ 5.000, os administradores recebem um aviso e o responsável ganha uma tarefa para dar atenção especial.`,
    aviso: "Troque o valor da condição pelo que é «alto» para a sua empresa.",
    auto: { nome: "Valor alto: avisar o gestor", gatilho: "negocio_criado", config: {},
      condicoes: [{ campo: "valor", op: "maior", valor: 5000 }],
      acoes: [
        { tipo: "notificar", para: "admins", titulo: "Valor alto: {nome} ({valor})", texto: "Entrou um registro de valor alto. Vale acompanhar de perto." },
        { tipo: "criar_tarefa", titulo: "Atenção especial: {primeiro_nome} ({valor})", tipo_tarefa: "whatsapp", vence_em_horas: 2, dono: "responsavel" },
      ],
      respeitar_horario: false } },
  { id: "tarefa_atrasada", categoria: "equipe", icone: "tarefa", destaque: [], ocultar: [],
    titulo: () => "Tarefa venceu → avisar o responsável e os administradores",
    texto: () => "Quando uma tarefa passa do prazo sem ser concluída, o responsável e os administradores recebem um aviso no sino.",
    auto: { nome: "Tarefa atrasada: avisar", gatilho: "tarefa_vencida", config: {}, condicoes: [],
      acoes: [
        { tipo: "notificar", para: "responsavel", titulo: "Tarefa atrasada: {nome}", texto: "Uma tarefa passou do prazo sem ser concluída." },
        { tipo: "notificar", para: "admins", titulo: "Tarefa atrasada na equipe: {nome}", texto: "Uma tarefa passou do prazo sem ser concluída." },
      ],
      respeitar_horario: false } },
  { id: "pediu_desmarcar", categoria: "equipe", icone: "calendario", destaque: [], ocultar: ["loja"],   // plano 1500c · UCA-063: sem destaque (no máximo 4 «Recomendado» por vertical)
    titulo: vv => `Pediu para desmarcar → etiqueta e tarefa de remarcar a ${palavraConsulta(vv.vertical)}`,
    texto: vv => `Quem escreve «desmarcar», «cancelar» ou «não vou poder» ganha a etiqueta Remarcar e a equipe recebe uma tarefa para oferecer outro horário de ${palavraConsulta(vv.vertical)}.`,
    auto: { nome: "Pediu para desmarcar", gatilho: "mensagem_recebida", config: { palavras: ["desmarcar", "cancelar", "não vou poder", "remarcar"] }, condicoes: [],
      acoes: [
        { tipo: "etiquetar", etiqueta_nome: "Remarcar", alvo: "contato" },
        { tipo: "criar_tarefa", titulo: "Remarcar a consulta de {primeiro_nome}", tipo_tarefa: "whatsapp", vence_em_horas: 0, dono: "responsavel" },
      ],
      respeitar_horario: false } },
  { id: "agradecer_indicar", categoria: "whatsapp", icone: "check", destaque: [], ocultar: [],
    titulo: vv => `${vv.v.negocio} marcad${vv.art("negocio")} como «${vv.v.ganhar}» → agradecer e pedir indicação`,
    texto: () => "No dia seguinte ao fechamento, o cliente recebe uma mensagem de agradecimento com um pedido de indicação.",
    aviso: "As mensagens respeitam o horário de funcionamento. Revise o texto antes de ligar.",
    auto: { nome: "Agradecer e pedir indicação", gatilho: "negocio_ganho", config: {}, condicoes: [],
      acoes: [
        { tipo: "esperar", minutos: 1440, cancelar_se_cliente_responder: true },
        { tipo: "enviar_mensagem", texto: "Oi, {primeiro_nome}! Obrigado pela confiança. Se conhecer alguém que também precise, pode indicar a gente? Ficaremos felizes em ajudar." },
      ],
      respeitar_horario: true } },
  // ---- WhatsApp oficial (modelo aprovado pela Meta)
  { id: "lembrete_consulta", categoria: "whatsapp", icone: "relogio", destaque: [], ocultar: [],
    titulo: vv => `Lembrete 24 h antes da ${palavraConsulta(vv.vertical)} → modelo oficial da Meta`,
    texto: vv => `Manda pelo WhatsApp oficial um modelo de confirmação 24 h antes da ${palavraConsulta(vv.vertical)} marcada. Precisa de um modelo aprovado na Meta.`,
    aviso: `Crie e aprove na Meta um modelo de categoria Utilidade, por exemplo: '${TEXTO_MODELO_LEMBRETE}'`,
    auto: { nome: "Lembrete 24 h antes da consulta", gatilho: "antes_da_data", config: { campo: "consulta", horas: 24 }, condicoes: [],
      acoes: [{ tipo: "enviar_template", template_nome: "confirmacao_consulta", parametros: ["{primeiro_nome}", "{data_consulta}", "{hora_consulta}"] }],
      respeitar_horario: false } },
]);

export const CATEGORIAS_MODELO = Object.freeze([["todas", "Todas"], ["whatsapp", "WhatsApp"], ["equipe", "Equipe e CRM"], ["ia", "Inteligência artificial"]]);

/** Modelos na ordem da vertical: os de destaque primeiro; os que não fazem sentido na vertical somem. */
export function modelosDaVertical(vertical) {
  const visiveis = MODELOS.filter(m => !(m.ocultar || []).includes(vertical));
  const d = visiveis.filter(m => m.destaque.includes(vertical));
  return d.concat(visiveis.filter(m => !m.destaque.includes(vertical)));
}

/** Por onde a mensagem da receita sai: "codewords" (texto livre), "meta" (modelo aprovado) ou null. */
export function canalDaReceita(m) {
  const ac = (m && m.auto && m.auto.acoes) || [];
  if (ac.some(a => a.tipo === "enviar_mensagem")) return "codewords";
  if (ac.some(a => a.tipo === "enviar_template")) return "meta";
  return null;
}
export const usaIA = m => !!m && ((m.auto && m.auto.acoes) || []).some(a => a.tipo === "ia_decidir");
export const ehSequencia = m => !!m && temSequencia(m.auto);

/** Troca "consulta" pela palavra da vertical nos textos livres (nunca em template_nome). */
function trocarPalavras(a, vertical) {
  const w = palavraConsulta(vertical);
  if (w === "consulta") return a;
  // só a palavra: as variáveis {data_consulta} e {hora_consulta} continuam com o nome do servidor
  const troca = s => texto(s).replace(/consulta(?!})/g, w).replace(/Consulta(?!})/g, w.charAt(0).toUpperCase() + w.slice(1));
  a.nome = troca(a.nome);
  for (const ac of a.acoes) for (const k of ["texto", "titulo", "instrucao"]) if (typeof ac[k] === "string") ac[k] = troca(ac[k]);
  return a;
}

/**
 * Monta a automação de uma receita com os ids do cliente (etapa pelo marco no funil padrão,
 * etiqueta e modelo da WABA pelo nome). O que não achar fica para a pessoa escolher.
 */
export function aplicarModelo(modelo, base, vocab) {
  const m = typeof modelo === "string" ? MODELOS.find(x => x.id === modelo) : modelo;
  if (!m) return null;
  const vv = voc(vocab);
  const a = copia(m.auto);
  a.ativo = false;
  a.modelo = m.id;
  if (m.id === "lembrete_consulta") a.nome = `Lembrete 24 h antes da ${palavraConsulta(vv.vertical)}`;
  if (m.id === "lembrete_consulta_texto" || m.id === "confirmacao_agendamento") {
    const w = palavraConsulta(vv.vertical);
    a.acoes[0].texto = a.acoes[0].texto.replace(/consulta(?!})/g, w);
    a.nome = m.id === "lembrete_consulta_texto" ? `Lembrete 24 h antes da ${w} (texto)` : `Confirmação ao agendar`;
  } else if (m.id !== "lembrete_consulta") trocarPalavras(a, vv.vertical);
  if (m.id === "orcamento") {
    const o = orcamentoDaVertical(vv.vertical);
    a.nome = o.nome;
    a.acoes[0].titulo = o.tarefa;
  }
  if (m.id === "followup_orcamento") {
    const o = orcamentoDaVertical(vv.vertical);
    a.nome = `Acompanhar ${o.obj.replace(/^o |^a /, "")} sem resposta`;
    for (const ac of a.acoes) if (ac.texto) ac.texto = ac.texto.replace(/o orçamento/g, o.obj);
    for (const ac of a.acoes) if (ac.titulo) ac.titulo = ac.titulo.replace(/orçamento/g, o.obj.replace(/^o |^a /, ""));
    if (vv.vertical === "loja" || vv.vertical === "generico")
      for (const ac of a.acoes) if (ac.texto) ac.texto = ac.texto.replace("já deixo um horário reservado para você", "posso fechar para você agora");
  }
  const b = base || {};
  const funis = b.funis || [];
  const padrao = funis.find(f => f.padrao) || funis[0];
  const etapaDoMarco = marco => padrao && (padrao.estagios || []).find(s => s.marco === marco);
  if (a.config && a.config.estagio_marco) {
    const e = etapaDoMarco(a.config.estagio_marco);
    delete a.config.estagio_marco;
    if (e) a.config.estagio_id = e.id;
  }
  a.condicoes = (a.condicoes || []).flatMap(cd => {
    if (!cd.valor_marco) return [cd];
    const e = etapaDoMarco(cd.valor_marco);
    const { valor_marco, opcional, ...resto } = cd;
    if (e) return [{ ...resto, valor: e.id }];
    return opcional ? [] : [{ ...resto, valor: "" }];
  });
  for (const ac of a.acoes) {
    if ((ac.tipo === "etiquetar" || ac.tipo === "etiqueta_adicionar") && ac.etiqueta_nome) {
      const t = (b.etiquetas || []).find(x => normalizar(x.nome) === normalizar(ac.etiqueta_nome));
      if (t) { ac.etiqueta_id = t.id; delete ac.etiqueta_nome; }
    }
    if (ac.tipo === "enviar_template") {
      const ts = (b.templates || []).filter(x => String(x.status || "").toUpperCase() === "APPROVED");
      const t = ts.find(x => normalizar(x.nome) === normalizar(ac.template_nome))
        || ts.find(x => String(x.categoria || "").toUpperCase() === "UTILITY" && Number(x.num_parametros) === (ac.parametros || []).length);
      if (t) {
        ac.template_id = t.id;
        const np = Number(t.num_parametros) || 0;
        ac.parametros = (ac.parametros || []).slice(0, np);
        while (ac.parametros.length < np) ac.parametros.push("");
      }
    }
  }
  return a;
}

/* ---------- rascunho do editor: o que ainda não foi salvo fica guardado na aba (sessionStorage) ---------- */
/** Chave do rascunho: por empresa + conta + automação («nova» = a que ainda não foi salva; «ia» = a montagem da IA). */
export function chaveRascunho(clienteId, contaId, id) {
  return `nx-au-rasc:${clienteId || "-"}:${contaId || "-"}:${id || "nova"}`;
}
/** O texto que vai para o sessionStorage: a automação como está na tela + a hora (+ a explicação e os avisos da IA, quando há). */
export function empacotarRascunho(auto, extra = null, agora = Date.now()) {
  const x = extra || {};
  return JSON.stringify({ v: 1, em: agora, auto, explicacao: typeof x.explicacao === "string" ? x.explicacao : "", avisos: Array.isArray(x.avisos) ? x.avisos.map(String) : [] });
}
/** Lê um rascunho guardado → {auto, em, explicacao, avisos} ou null quando o texto não serve (vazio, corrompido, de um gatilho que não existe mais). */
export function lerRascunho(textoGuardado) {
  if (typeof textoGuardado !== "string" || !textoGuardado) return null;
  let p = null;
  try { p = JSON.parse(textoGuardado); } catch { return null; }
  const a = p && p.auto;
  const objeto = v => !!v && typeof v === "object" && !Array.isArray(v);
  if (!objeto(p) || !objeto(a) || !GATILHO[a.gatilho]) return null;
  const lista = v => v === undefined || (Array.isArray(v) && v.every(objeto));
  if (!lista(a.condicoes) || !lista(a.acoes) || (a.config !== undefined && !objeto(a.config))) return null;
  if ((a.acoes || []).some(ac => typeof ac.tipo !== "string")) return null;
  return { auto: copia(a), em: Number(p.em) || 0, explicacao: typeof p.explicacao === "string" ? p.explicacao : "", avisos: Array.isArray(p.avisos) ? p.avisos.map(String) : [] };
}

/** Automação nova em branco para o gatilho. */
export function novaAutomacao(gatilho = "negocio_estagio") {
  const g = GATILHO[gatilho] || GATILHOS[0];
  const config = {};
  for (const f of g.campos) if (f.padrao !== undefined) config[f.nome] = copia(f.padrao);
  // plano 1000 · AS-024: nasce DESLIGADA — ligar é uma escolha (na lista e no editor ligar o que manda mensagem pede confirmação)
  return { nome: "", gatilho: g.id, config, condicoes: [], acoes: [], respeitar_horario: false, ativo: false };
}

/** Ação nova com os valores padrão do catálogo. */
export function novaAcao(tipo) {
  const d = ACAO[tipo];
  const x = { tipo };
  if (!d) return x;
  for (const f of d.campos) {
    if (f.padrao !== undefined) x[f.nome] = copia(f.padrao);
    if (f.tipo === "parametros") x[f.nome] = [];
  }
  return x;
}

/** Ao trocar o gatilho, mantém o que ainda vale do config e põe os padrões do novo. */
export function trocarGatilho(auto, gatilho, memoria = null) {
  const g = GATILHO[gatilho];
  if (!g) return auto;
  const antigo = auto.config || {};
  // plano 1000 · AS-219: `memoria` ({gatilho: config}) guarda o config de cada gatilho visitado — «Tempo na etapa» → «Etapa» → volta e as horas
  // continuam; o campo com o mesmo nome no gatilho de agora (a etapa) vence a memória (é a escolha mais recente)
  if (memoria && typeof memoria === "object" && auto.gatilho) memoria[auto.gatilho] = copia(antigo);
  const lembrado = memoria && memoria[gatilho] && typeof memoria[gatilho] === "object" ? memoria[gatilho] : {};
  const config = {};
  for (const f of g.campos) {
    if (antigo[f.nome] !== undefined) config[f.nome] = antigo[f.nome];
    else if (lembrado[f.nome] !== undefined) config[f.nome] = copia(lembrado[f.nome]);
    else if (f.padrao !== undefined) config[f.nome] = copia(f.padrao);
  }
  return Object.assign({}, auto, { gatilho, config });
}

/** Move um item de uma lista (reordenar ações). Devolve uma lista nova. */
export function mover(lista, de, para) {
  const l = (lista || []).slice();
  if (de < 0 || de >= l.length || para < 0 || para >= l.length || de === para) return l;
  const [x] = l.splice(de, 1);
  l.splice(para, 0, x);
  return l;
}

/** Resumo do histórico de execuções para o cartão: "12 execuções · 1 erro". */
export function resumoExecucoes(item) {
  const e = Number(item && item.execucoes) || 0, r = Number(item && item.erros) || 0;
  const pe = e === 1 ? "1 execução" : `${e} execuções`;
  return r ? `${pe} · ${r === 1 ? "1 erro" : `${r} erros`}` : pe;
}

/* ------------------------------------------------------------------ formato da IA (nx-ia → automacao_montar) */

/**
 * Quanto o navegador espera o nx-ia montar uma automação. Precisa ficar ENTRE o prazo que o servidor dá à Anthropic
 * (TIMEOUT_MONTAR_MS = 110 s em ia_automacoes.js) e o teto de ~150 s da Edge Function; se fosse menor que o do servidor, a
 * tela desistiria enquanto a IA ainda trabalha — a cota seria gasta e a resposta, perdida (o teste confere os dois números).
 */
export const PRAZO_MONTAR_IA_MS = 130_000;

/**
 * A IA/servidor devolve {nome, gatilho:{tipo, campos}, condicoes:[], acoes:[{tipo, campos}]}; o editor e as RPCs
 * usam {nome, gatilho:"id", config:{}, condicoes, acoes:[{tipo, ...campos}]}. Aceita também o formato do editor.
 * Devolve {auto, avisos:[…]} — `auto` sempre abre no editor (nasce DESLIGADA); `avisos` lista o que a pessoa precisa conferir.
 */
export function deFormatoIA(x, base) {
  const src = x && typeof x === "object" ? x : {};
  const avisos = [];
  const g = src.gatilho && typeof src.gatilho === "object" ? src.gatilho : null;
  const gatilhoId = g ? g.tipo : src.gatilho;
  const gatilhoOk = GATILHO[gatilhoId] ? gatilhoId : null;
  if (!gatilhoOk) avisos.push("A IA não achou um gatilho que combine. Escolha em «Quando».");
  const config = copia((g && (g.campos || g.config)) || src.config || {});
  const flat = ac => {
    if (!ac || typeof ac !== "object") return null;
    const campos = ac.campos && typeof ac.campos === "object" ? copia(ac.campos) : {};
    const { campos: _c, ...resto } = copia(ac);
    return Object.assign({}, resto, campos);
  };
  const acoes = [];
  for (const ac of Array.isArray(src.acoes) ? src.acoes : []) {
    const f = flat(ac);
    if (!f) continue;
    if (!ACAO[f.tipo]) { avisos.push(`A IA sugeriu um passo que não existe (${texto(f.tipo).slice(0, 40) || "sem nome"}); ele foi deixado de fora.`); continue; }
    acoes.push(f);
  }
  const condicoes = [];
  for (const cd of Array.isArray(src.condicoes) ? src.condicoes : []) {
    const f = flat(cd);
    if (f) condicoes.push(f);
  }
  const auto = {
    nome: texto(src.nome).trim().slice(0, LIMITES.nome),
    gatilho: gatilhoOk || novaAutomacao().gatilho,
    config: gatilhoOk ? config : {},
    condicoes, acoes,
    respeitar_horario: !!src.respeitar_horario,
    ativo: false,
  };
  if (!gatilhoOk) auto.config = novaAutomacao(auto.gatilho).config;
  // enviar_template sem modelo e etiqueta por nome: o mesmo acabamento das receitas
  const b = base || {};
  for (const ac of auto.acoes) {
    if (ac.tipo === "enviar_template" && ac.template_id && !(b.templates || []).some(t => t.id === ac.template_id)) delete ac.template_id;
  }
  return { auto, avisos };
}

/** Inverso: do editor para o formato {gatilho:{tipo,campos}, acoes:[{tipo,campos}]} (para testes e para reenviar à IA). */
export function paraFormatoIA(auto) {
  const l = limpar(auto);
  return {
    nome: l.nome,
    gatilho: { tipo: l.gatilho, campos: l.config },
    condicoes: l.condicoes,
    acoes: l.acoes.map(ac => { const { tipo, ...campos } = ac; return { tipo, campos }; }),
    respeitar_horario: l.respeitar_horario,
  };
}

/* ------------------------------------------------------------------ simulação (nx_auto_simular) */

const ESTADOS_PASSO = { faria: "faria", fez: "faria", ok: "faria", pularia: "pularia", pulado: "pularia", pula: "pularia", espera: "espera", aguarda: "espera", erro: "erro", falha: "erro" };

function linkSeguro(l) { return typeof l === "string" && /^#\/[A-Za-z0-9_\-./?=&%]*$/.test(l) ? l : null; }

/**
 * Lê a resposta de nx_auto_simular e devolve
 *   {total, ehAmostra, alvos:[{id, titulo, detalhe, link, ignorado, motivoIgnorado, erro, parou, passos:[{rotulo, estado, motivo, quando}]}],
 *    avisos:[], motivo, porEvento, plano}.
 * Formato do servidor: {ok, automacao, amostra:[{rotulo, negocio_id, contato_id, conversa_id, link, casa_gatilho, passa_condicoes,
 *   passos:[{n, tipo, texto, pulado, depois_min}], erro, parou}], tamanho_amostra, aviso}.
 * Aceita também a forma antiga {total, alvos:[{titulo, acoes:[{descricao, resultado, motivo}]}], avisos:[]} — a tela nunca quebra se o formato evoluir.
 */
// plano 1500c · UCA-123: `opcoes.horario` (o horário de atendimento, com «Respeitar horário») e `opcoes.agora`: a mensagem que cairia
// fora do horário diz quando sai de verdade («sai sex, 17/10 às 08:00»)
export function normalizarSimulacao(r, auto, base, vocab, { horario, agora = Date.now() } = {}) {
  const src = r && typeof r === "object" ? r : {};
  const comHorario = horario !== undefined && !!(auto && auto.respeitar_horario);
  const ehAmostra = Array.isArray(src.amostra);
  const lista = [src.amostra, src.alvos, src.itens, src.exemplos].find(Array.isArray) || [];
  const rotuloPasso = (p, i) => {
    if (typeof p === "string") return { rotulo: cortar(p, 200), estado: "faria", motivo: "", quando: "" };
    const q = p && typeof p === "object" ? p : {};
    const tipo = q.tipo && ACAO[q.tipo] ? q.tipo : null;
    let est = ESTADOS_PASSO[normalizar(q.resultado || q.status || q.estado || (q.pulado === true ? "pulado" : "faria"))] || "faria";
    if (tipo === "esperar" && est === "faria") est = "espera";
    const nome = q.texto || q.descricao || q.rotulo || (tipo ? rotuloAcaoSimples(tipo) : `Passo ${i + 1}`);
    const depois = Number(q.depois_min);
    const tipoF = tipo || (auto && Array.isArray(auto.acoes) && auto.acoes[i] && ACAO[auto.acoes[i].tipo] ? auto.acoes[i].tipo : null);
    let quando = Number.isFinite(depois) && depois > 0 ? `depois de ${formatarDuracao(depois)}` : "";
    if (comHorario && tipoF && (ACAO[tipoF] || {}).mensagem && est === "faria") {
      const t0 = (agora instanceof Date ? agora.getTime() : Number(agora)) + (Number.isFinite(depois) && depois > 0 ? depois : 0) * 60000;
      const envio = proximaAbertura(horario, t0);
      if (envio === null) quando = "não sai: o horário de atendimento não abre nos próximos dias";
      else if (envio > t0) quando = `sai ${dataHoraCurtaSP(envio)} (no horário de atendimento)`;
    }
    return {
      rotulo: cortar(nome, 200), estado: est, motivo: cortar(q.motivo || (q.detalhe && q.detalhe !== nome ? q.detalhe : "") || "", 200),
      quando, tipo: tipoF,
    };
  };
  const alvos = lista.slice(0, 25).map((a, i) => {
    const q = a && typeof a === "object" ? a : { titulo: texto(a) };
    const passos = [q.passos, q.acoes].find(Array.isArray) || [];
    const naoCasa = q.casa_gatilho === false, naoPassa = q.passa_condicoes === false;
    return {
      id: q.id ?? q.negocio_id ?? q.conversa_id ?? i,
      titulo: cortar(q.rotulo || q.titulo || q.nome || q.contato || q.descricao || `Exemplo ${i + 1}`, 120),
      detalhe: cortar(q.detalhe || q.etapa || q.subtitulo || "", 160),
      link: linkSeguro(q.link),
      ignorado: naoCasa || naoPassa,
      motivoIgnorado: naoCasa ? "Este registro ainda não bate com o gatilho; só rodaria quando bater." : naoPassa ? "Este registro não passa nas condições, então nada seria feito." : "",
      erro: cortar(q.erro || "", 300),
      parou: q.parou === true,
      passos: passos.slice(0, 12).map(rotuloPasso),
      // plano 1000b · UB-074: quantos passos ficaram de fora do corte de 12 (a tela diz «e mais N passos»)
      passosOcultos: Math.max(0, passos.length - 12),
    };
  });
  const totalN = Number(src.total ?? src.quantidade);
  const total = Number.isFinite(totalN) && totalN >= 0 ? totalN : alvos.length;
  const avisos = [].concat(Array.isArray(src.avisos) ? src.avisos : [], src.aviso ? [src.aviso] : [])
    .map(x => cortar(typeof x === "string" ? x : (x && (x.texto || x.mensagem)) || "", 240)).filter(Boolean);
  return {
    total, alvos, avisos, ehAmostra,
    motivo: cortar(src.motivo || src.mensagem || "", 300),
    porEvento: src.por_evento === true || src.tipo === "evento",
    plano: passosEmFrases(auto, base, vocab),
  };
}

function rotuloAcaoSimples(tipo) { const d = ACAO[tipo]; return d ? d.rotulo(voc({})) : "Passo"; }

/* ------------------------------------------------------------------ onde mora o problema (hint do servidor) */

/**
 * O servidor devolve 'automacao_invalida' com um hint em português; isto diz em qual bloco da tela ele cai:
 * {onde:'nome'|'quando'|'se'|'entao'|null, indice:número|null} (indice = 0 é a 1ª condição/ação).
 */
export function ondeDoHint(hint) {
  const h = texto(hint);
  const m = /^(ação|condição) (\d+)/.exec(h);
  if (m) return { onde: m[1] === "ação" ? "entao" : "se", indice: Number(m[2]) - 1 };
  if (/«Quando»|dias? da semana|horário|antecedência|tempo (na etapa|sem resposta|depois)|palavra/i.test(h)) return { onde: "quando", indice: null };
  if (/condiç/i.test(h)) return { onde: "se", indice: null };
  // plano 1500c · UCA-108: «acrescente pelo menos um passo que faça algo…» também é do bloco «Então»
  if (/«Então»|\bações\b|esperas|\bpasso\b/i.test(h)) return { onde: "entao", indice: null };
  if (/nome/i.test(h)) return { onde: "nome", indice: null };
  return { onde: null, indice: null };
}

/* ------------------------------------------------------------------ execuções (nx_automacao_execucoes) */

export const SITUACOES_EXECUCAO = Object.freeze([["todas", "Todas"], ["ok", "Deram certo"], ["espera", "Em espera"], ["pulado", "Puladas ou paradas"], ["erro", "Com erro"]]);

/**
 * "ok" | "erro" | "espera" | "pulado". O servidor manda 'estado' (concluida | esperando | aguardando_ia | cancelada | parada | erro);
 * nas linhas antigas (estado nulo) vale x.ok e as palavras do detalhe.
 */
export function situacaoExecucao(x) {
  const e = normalizar(x && x.estado);
  if (e === "erro") return "erro";
  if (e === "esperando" || e === "aguardando_ia") return "espera";
  // plano 1500c · UCA-003: «filtrada» (Condições não atendidas — nada feito, 20261015a) não é «deu certo»
  if (e === "cancelada" || e === "parada" || e === "filtrada") return "pulado";
  const s = normalizar(x && (x.status || x.situacao));
  if (s === "ok" || s === "erro" || s === "pulado" || s === "espera") return s;
  if (s === "pulada") return "pulado";
  if (!x || !x.ok) return "erro";
  return /\b(pulad[oa]|nao (foi )?enviad[oa]|contato pediu|fora da janela|ignorad[oa])\b/.test(normalizar(x.detalhe)) ? "pulado" : "ok";
}

/**
 * Por que a execução foi cancelada: o servidor acrescenta ao detalhe « · cancelada: <motivo>» (o cliente respondeu, a automação foi
 * desligada, o negócio mudou de etapa…) ou « · cancelada pela equipe». Sem o motivo (detalhe cortado em 1.000 letras), a frase é neutra.
 */
function textoCancelada(x) {
  const det = texto(x && x.detalhe);
  let motivo = "";
  for (const m of det.matchAll(/·\s*cancelada(?:\s+(pela equipe)|:\s*([^·]+))/gi)) motivo = (m[1] || m[2] || "").trim();
  if (!motivo) return "Cancelada";
  if (/^pela equipe$/i.test(motivo)) return "Cancelada pela equipe";
  if (/^o cliente respondeu$/i.test(motivo)) return "Cancelada: o cliente respondeu antes do fim da espera";
  return `Cancelada: ${motivo.replace(/[.\s]+$/, "")}`;
}

/** Frase do estado da sequência ("Esperando para continuar", "Cancelada: o cliente respondeu") ou "" quando é uma execução comum. */
export function estadoExecucaoTexto(x) {
  switch (normalizar(x && x.estado)) {
    case "esperando": return "Esperando para continuar";
    case "aguardando_ia": return "Aguardando a IA decidir";
    case "cancelada": return textoCancelada(x);
    case "parada": return "Encerrada no passo «Parar por aqui»";
    case "filtrada": return "Não passou nas condições: nada foi feito";   // plano 1500c · UCA-003/UCA-005
    default: return "";
  }
}

/** Progresso do passo de uma execução: "2 de 5 passos feitos" (servidor: passo = próximo passo, total_passos) ou "Passo 2 · Enviar mensagem". */
export function passoDaExecucao(x) {
  const tipo = x && (x.acao || x.acao_tipo || x.tipo_acao);
  const n = inteiro(x && (x.passo ?? x.acao_indice));
  const tot = inteiro(x && x.total_passos);
  const nome = tipo && ACAO[tipo] ? rotuloAcaoSimples(tipo) : "";
  if (n != null && tot != null && tot > 1 && !nome) return `${Math.min(n, tot)} de ${tot} passos feitos`;
  if (n != null && nome) return `Passo ${n} · ${nome}`;
  if (n != null && tot == null) return `Passo ${n}`;
  return nome;
}

/**
 * Troca códigos técnicos soltos no detalhe (fora_da_janela, codewords_sem_aparelho…) por texto em português.
 * `traduzir(codigo)` devolve o texto ou null/"" quando não conhece.
 */
export function detalheLegivel(detalhe, traduzir) {
  const d = texto(detalhe).trim();
  if (!d) return "";
  if (typeof traduzir !== "function") return d;
  return d.replace(/\b[a-z]+(?:_[a-z0-9]+)+\b/g, tok => {
    let t = "";
    try { t = traduzir(tok); } catch { t = ""; }
    return t && !/^Não deu certo agora/.test(t) ? t.replace(/[.]$/, "") : tok;
  });
}

/* ------------------------------------------------------------------ erros da IA (nx-ia) */

/** A automação tem um passo de IA (gasta cota)? */
export const temIA = auto => (auto && auto.acoes || []).some(ac => ac && ac.tipo === "ia_decidir");

/**
 * Erro do nx-ia (api.js: .codigo, .detalhe_texto, .hint, .resposta) → {tipo, titulo, texto} para a caixa «Criar com IA».
 * tipo: "cota" | "chave" | "desligada" | "indisponivel" | "pedidos" | "rede" | "invalida" | "outro".
 * O nx-ia responde {ok:false, erro, mensagem, detalhe}: `erro` é o código estável, `mensagem` já vem em português
 * (usada quando não temos um texto melhor) e `detalhe` explica (sem_chave, sem_sdk, recusa, o motivo da conferência…).
 */
// plano 1000b · UB-067: quem dá suporte (marca de revenda) entra no texto; sem o nome, «a equipe de suporte» — nunca «Nexus» fixo
export function erroDaIA(e, mensagemPadrao, suporte = null) {
  const quem = texto(suporte).trim() ? `a equipe de suporte de ${texto(suporte).trim()}` : "a equipe de suporte";
  const cod = texto(e && (e.codigo || e.message));
  const det = normalizar(e && (e.detalhe_texto || (typeof e.detalhe === "string" ? e.detalhe : "") || e.hint));
  const doServidor = texto(e && e.resposta && e.resposta.mensagem).trim();
  if (cod === "ia_cota") return { tipo: "cota", titulo: "A cota de IA deste mês acabou",
    texto: `Você ainda pode criar a automação pelas receitas prontas ou do zero. A cota volta no começo do próximo mês; para usar mais agora, fale com ${quem}.` };
  if (cod === "sem_chave" || det === "sem_chave") return { tipo: "chave", titulo: "A IA ainda não foi ligada",
    texto: `Falta cadastrar a chave da Anthropic nesta plataforma. Avise ${quem} para ativar. Enquanto isso, use uma receita pronta abaixo ou crie do zero.` };
  if (cod === "ia_desligada") return { tipo: "desligada", titulo: "A IA está desligada",
    texto: `A IA está desligada nesta plataforma. Avise ${quem} para ativar; enquanto isso use as receitas prontas ou crie a automação do zero.` };
  if (cod === "muitos_pedidos" || cod === "limite_taxa") return { tipo: "pedidos", titulo: "Muitos pedidos seguidos",
    texto: "Espere cerca de um minuto e tente de novo." };
  if (cod === "tempo_rede" || cod === "tempo_esgotado") return { tipo: "rede", titulo: "A IA demorou mais do que o esperado",
    texto: "Nada foi salvo. Espere alguns segundos e tente de novo; se o pedido for grande, divida em duas automações menores." };
  if (cod === "sem_conexao") return { tipo: "rede", titulo: "A conexão falhou",
    texto: "Não deu para falar com o servidor. Confira a internet e tente de novo; nada foi salvo." };
  if (cod === "ia_indisponivel" || cod === "ia_resposta_invalida" || cod === "ia_invalida") return { tipo: "indisponivel", titulo: "A IA não conseguiu montar agora",
    texto: doServidor || (cod === "ia_indisponivel" ? "Ela não respondeu desta vez. Tente de novo em instantes, ou escreva o pedido com outras palavras."
      : "A resposta veio fora do formato esperado. Tente descrever com outras palavras ou use uma receita pronta.") };
  if (cod === "automacao_invalida") {
    const motivo = texto(e && (e.hint || e.detalhe_texto)).trim();
    return { tipo: "invalida", titulo: "A IA montou algo que não passa na conferência",
      texto: doServidor || ((motivo ? `Problema: ${motivo}. ` : "") + "Tente descrever com outras palavras ou use uma receita pronta.") };
  }
  if (cod === "dados_invalidos" && det === "descricao") return { tipo: "invalida", titulo: "Descreva com mais detalhes",
    texto: `Escreva o que deve acontecer, com pelo menos algumas palavras (de 12 a ${LIMITES.descricao_ia} caracteres).` };
  return { tipo: "outro", titulo: "Não foi possível montar", texto: doServidor || mensagemPadrao || "Tente de novo em instantes." };
}

/**
 * A IA está desligada nesta plataforma (sem a chave da Anthropic)? Lê `ia` de nx_automacoes_listar ({disponivel, usadas, limite})
 * ou da base de Conversas ({ligada, cota}); sem a informação, assume que está disponível (nenhum aviso falso).
 */
export function iaDesligada(dados) {
  const ia = dados && (dados.ia || (dados.base && dados.base.ia)) || null;
  return !!ia && (ia.disponivel === false || ia.ligada === false);
}

/** Aviso nos passos de IA quando a plataforma ainda não tem a chave: a automação roda, mas o passo é pulado. */
// plano 1000b · UB-067: sem a marca fixa (o cliente de revenda veria «Nexus»)
export const AVISO_IA_DESLIGADA = "A IA ainda não está ligada nesta plataforma: este passo é pulado (nada é decidido) até o suporte da plataforma cadastrar a chave. O resto da automação continua.";

/**
 * Erro de uma chamada das Automações → texto para a pessoa. O tempo esgotado do banco (57014) não tem «período» nem «itens» aqui
 * (a mensagem geral da API fala disso), então ganha uma frase própria; o resto segue a mensagem padrão da API.
 */
// plano 1500c · UCA-071: os erros comuns das RPCs das automações com frase própria (usuarios = base.usuarios, para dizer a quem pedir)
export function erroAutomacao(e, mensagemPadrao, usuarios = null) {
  const c = e && (e.codigo || e.message);
  if (c === "tempo_esgotado") return "O servidor demorou a responder. Tente de novo em instantes.";
  if (c === "automacao_nao_encontrada") return "Essa automação foi excluída por outra pessoa. Volte para a lista.";
  if (c === "limite_plano" || c === "limite_atingido") return "Seu plano chegou ao limite de automações. Desligar não libera vaga: exclua uma que não usa mais ou fale com o suporte para aumentar.";
  if (c === "sem_permissao") return `Seu acesso não permite mudar automações. ${frasePedirAdmin(usuarios)}`;
  return mensagemPadrao;
}

/* ------------------------------------------------------------------ rótulos para a tela */

/** Rótulo do gatilho no vocabulário da vertical ("Oportunidade entrou numa etapa"). */
export function rotuloGatilho(id, vocab) {
  const g = GATILHO[id];
  return g ? g.rotulo(voc(vocab)) : "Gatilho";
}
/** Rótulo da ação ("Criar oportunidade"). */
export function rotuloAcao(id, vocab) {
  const a = ACAO[id];
  return a ? a.rotulo(voc(vocab)) : "Ação";
}
/** Dica do gatilho no vocabulário da vertical (ou null). */
export function dicaGatilho(id, vocab) {
  const g = GATILHO[id];
  return g && g.dica ? g.dica(voc(vocab)) : null;
}
/** Título e texto do modelo pronto no vocabulário da vertical. */
export function tituloModelo(m, vocab) { return m.titulo(voc(vocab)); }
export function textoModelo(m, vocab) { return m.texto(voc(vocab)); }
/** "Recomendado para clínicas" etc. (vazio quando o modelo não é destaque da vertical). */
export function seloModelo(m, vertical) {
  if (!m.destaque.includes(vertical)) return "";
  return { odonto: "Recomendado para clínicas", oficina: "Recomendado para oficinas", loja: "Recomendado para lojas", generico: "Recomendado para começar" }[vertical] || "Recomendado";   // plano 1500c · UCA-066
}
/** Opções de campo de condição: os fixos + os campos personalizados do contato. */
// plano 1500c · UCA-020: com o gatilho, «Texto da mensagem» só aparece nos gatilhos de mensagem (`atual` = o campo já escolhido, que nunca some)
export function camposCondicao(base, vocab = null, gatilho = null, atual = null) {
  const fixos = CAMPOS_CONDICAO.filter(c => c.id !== "texto" || !gatilho || GATILHOS_COM_TEXTO.includes(gatilho) || atual === "texto")
    .map(c => ({ valor: c.id, rotulo: c.id === "valor" ? rotuloValorNegocio(vocab) : c.rotulo }));
  const extras = ((base && base.campos) || []).map(c => ({ valor: `contato.${c.chave}`, rotulo: `Campo: ${c.rotulo}` }));
  return fixos.concat(extras);
}
export const rotuloOperador = op => (OPERADOR[op] || {}).rotulo || op;
export const operadorSemValor = op => !!(OPERADOR[op] || {}).semValor;
/** Rótulo da data do gatilho antes_da_data / apos_data. */
export function rotuloCampoData(c, vertical) {
  return c === "previsao_fechamento" ? "Previsão de fechamento (às 9h)" : `Data e hora da ${palavraConsulta(vertical)}`;
}

/** Dados de exemplo para a prévia das mensagens (consulta amanhã às 14:30 em São Paulo). */
export function exemploVariaveis({ empresa = "Sua empresa", atendente = "Ana", agora = new Date(), base = null } = {}) {
  const amanha = new Date(agora.getTime() + 24 * 3600 * 1000);
  const dia = new Intl.DateTimeFormat("en-CA", { timeZone: "America/Sao_Paulo", year: "numeric", month: "2-digit", day: "2-digit" }).format(amanha);
  // plano 1000b · UB-073: a etapa do exemplo é a 1ª do funil padrão DESTA empresa (oficina e loja não têm «Avaliou / orçamento»)
  const funis = base && Array.isArray(base.funis) ? base.funis.filter(f => f && f.ativo !== false) : [];
  const funil = funis.find(f => f.padrao) || funis[0] || null;
  const etapaBase = funil && Array.isArray(funil.estagios) && funil.estagios[0] && funil.estagios[0].nome ? String(funil.estagios[0].nome) : "";
  return { nome: "Maria Souza", empresa, protocolo: "2026-000123", etapa: etapaBase || "Avaliou / orçamento", valor: 1500,
    atendente: String(atendente || "").split(/\s+/)[0] || "Ana", consulta_em: `${dia}T14:30:00-03:00` };
}

/**
 * plano 1000b · UB-189: mensagem ao cliente (texto livre ou parâmetro de modelo) com {hora_consulta} ou {data_consulta} pode sair com buraco:
 * sem hora marcada (só a data) a hora fica em branco; fora dos gatilhos de data, o registro pode nem ter data. → frase do aviso | null.
 * (O caso «Antes da data» + modelo com {hora_consulta} já tem o aviso próprio no editor.)
 */
export function avisoDataHoraConsulta(a, vertical) {
  const acoes = Array.isArray(a && a.acoes) ? a.acoes : [];
  const textos = acoes.flatMap(x => (x && x.tipo === "enviar_mensagem" ? [texto(x.texto)] : x && x.tipo === "enviar_template" ? (x.parametros || []).map(texto) : []));
  const hora = textos.some(t => /\{hora_consulta\}/.test(t));
  const data = textos.some(t => /\{data_consulta\}/.test(t));
  if (!hora && !data) return null;
  const pc = palavraConsulta(vertical);
  const porData = a.gatilho === "antes_da_data" || a.gatilho === "apos_data";
  if (!porData) return `A mensagem usa ${hora && data ? "{data_consulta} e {hora_consulta}" : hora ? "{hora_consulta}" : "{data_consulta}"}: quem não tiver ${pc} marcada (ou só a data, sem a hora) recebe o texto com esse trecho em branco. Prefira o gatilho «Antes» ou «Depois» da ${pc} marcada.`;
  return hora ? `A mensagem usa {hora_consulta}: quem tiver só a data (sem a hora) da ${pc} recebe esse trecho em branco. Confira se a frase faz sentido assim.` : null;
}

/**
 * plano 1000b · UB-059: o pedaço do corpo do modelo em volta de {{n}}, com o espaço como «___» e os outros {{k}} também («Olá, ___!»).
 * Até ~24 letras de cada lado, cortado em palavra inteira. Sem {{n}} no corpo → "".
 */
export function trechoParametro(corpo, n) {
  const c = texto(corpo).replace(/\s+/g, " ");
  const marca = `{{${n}}}`;
  const i = c.indexOf(marca);
  if (i < 0) return "";
  let antes = c.slice(Math.max(0, i - 24), i), depois = c.slice(i + marca.length, i + marca.length + 24);
  if (i - 24 > 0) antes = `…${antes.replace(/^\S*\s/, "")}`;
  if (i + marca.length + 24 < c.length) depois = `${depois.replace(/\s\S*$/, "")}…`;
  return `${antes}___${depois}`.replace(/\{\{\d+\}\}/g, "___").trim();
}

/** Texto do modelo da WABA com os parâmetros aplicados ({{1}} → valor). */
export function previaModelo(corpo, parametros, dados) {
  return texto(corpo).replace(/\{\{(\d+)\}\}/g, (m, n) => {
    const p = (parametros || [])[Number(n) - 1];
    const v = p == null ? "" : aplicarVariaveis(p, dados);
    return v.trim() ? v : `{{${n}}}`;
  });
}

/** A automação envia mensagens? (o editor mostra o aviso de horário/janela). */
export const enviaMensagem = auto => (auto && auto.acoes || []).some(ac => (ACAO[ac.tipo] || {}).mensagem);

/** Precisa de um modelo aprovado para poder ligar? */
export const faltaModelo = auto => (auto && auto.acoes || []).some(ac => ac.tipo === "enviar_template" && vazio(ac.template_id));

/* ================================================================== plano 50 (frente G): cartões, execuções por dia, diagrama, busca */

const nat = x => Math.max(0, Math.floor(Number(x) || 0));

/** Taxa de sucesso do histórico de UMA automação: {total, ok, erros, pct}. pct = null sem execuções (a barra não finge 100 %). */
// plano 1500c · UCA-027: {periodo:"30d"} usa ok_30d/erro_30d quando vierem (quebra recente não fica verde por 300 acertos antigos)
export function taxaSucesso(item, { periodo = "total" } = {}) {
  if (periodo === "30d" && item && item.ok_30d != null && item.erro_30d != null) {
    const ok30 = nat(item.ok_30d), er30 = nat(item.erro_30d), t30 = ok30 + er30;
    return { total: t30, ok: ok30, erros: er30, pct: t30 ? Math.round((ok30 / t30) * 100) : null };
  }
  const total = nat(item && item.execucoes);
  const erros = Math.min(total, nat(item && item.erros));
  const ok = total - erros;
  return { total, ok, erros, pct: total ? Math.round((ok / total) * 100) : null };
}

/** plano 1500c · UCA-026: a automação tem erro na régua do resumo do topo (30 dias quando o servidor manda; senão, desde a criação). */
export function temErro(item, periodo = "total") {
  if (periodo === "30d" && item && item.ok_30d != null && item.erro_30d != null) return nat(item.erro_30d) > 0;
  return nat(item && item.erros) > 0;
}

/** Nível da taxa para a cor da barra: "vazia" (sem execuções) · "ok" (≥ 90 %) · "aten" (≥ 60 %) · "ruim". */
export function nivelTaxa(pct) {
  if (pct == null) return "vazia";
  return pct >= 90 ? "ok" : pct >= 60 ? "aten" : "ruim";
}

/** Resumo das automações da empresa (topo da lista): ligadas, execuções, erros, em espera e a taxa geral. */
export function resumoAutomacoes(itens) {
  const l = Array.isArray(itens) ? itens : [];
  const r = { total: l.length, ligadas: 0, execucoes: 0, erros: 0, em_espera: 0, com_erro: 0, pct: null };
  const de30 = periodoDoResumo(l) === "30d";     // plano 1000 · AS-014
  for (const it of l) {
    if (it && it.ativo) r.ligadas++;
    const t = de30 ? { total: nat(it.ok_30d) + nat(it.erro_30d), erros: nat(it.erro_30d) } : taxaSucesso(it);
    r.execucoes += t.total; r.erros += t.erros;
    if (t.erros) r.com_erro++;
    r.em_espera += nat(it && it.em_espera);
  }
  r.pct = r.execucoes ? Math.round(((r.execucoes - r.erros) / r.execucoes) * 100) : null;
  return r;
}

/** Dia (AAAA-MM-DD) em São Paulo de um instante; null quando a data não serve. */
function diaSP(x) {
  if (x === null || x === undefined || x === "") return null;     // new Date(null) seria 1970: sem data é sem data
  const d = x instanceof Date ? x : new Date(x);
  if (isNaN(d)) return null;
  return new Intl.DateTimeFormat("en-CA", { timeZone: "America/Sao_Paulo", year: "numeric", month: "2-digit", day: "2-digit" }).format(d);
}
function somarDia(dia, delta) {
  const [a, m, d] = dia.split("-").map(Number);
  const x = new Date(Date.UTC(a, m - 1, d + delta, 12));
  return `${x.getUTCFullYear()}-${String(x.getUTCMonth() + 1).padStart(2, "0")}-${String(x.getUTCDate()).padStart(2, "0")}`;
}
const DIAS_CURTOS = ["dom", "seg", "ter", "qua", "qui", "sex", "sáb"];
function diaSemanaDe(dia) { const [a, m, d] = dia.split("-").map(Number); return new Date(Date.UTC(a, m - 1, d, 12)).getUTCDay(); }
const ddmm = dia => `${dia.slice(8, 10)}/${dia.slice(5, 7)}`;

const diaUTC = dia => { const [a, m, d] = dia.split("-").map(Number); return Date.UTC(a, m - 1, d, 12); };

/**
 * Execuções por dia, calculadas no navegador a partir de nx_automacao_execucoes (o servidor não devolve séries):
 * os últimos `dias` dias terminando hoje (São Paulo), [{dia, rotulo:"dd/mm", semana:"seg", ok, erro, espera, pulado, total}].
 * Linhas sem data válida ou fora da janela ficam de fora; `n` diz quantas entraram.
 * `recortar` (a lista é só as N mais recentes, não tudo): a janela começa no dia da execução mais antiga carregada, para
 * não desenhar dias vazios que na verdade não foram carregados; `recortado` diz se isso aconteceu (a tela avisa).
 */
export function execucoesPorDia(lista, { dias = 14, agora = new Date(), recortar = false } = {}) {
  const hoje = diaSP(agora) || diaSP(new Date());
  let n = Math.max(1, Math.min(60, nat(dias) || 14));
  let recortado = false;
  if (recortar) {
    let antiga = null;
    for (const x of Array.isArray(lista) ? lista : []) { const d = x ? diaSP(x.criado_em) : null; if (d && d <= hoje && (!antiga || d < antiga)) antiga = d; }
    // a mais antiga carregada já está antes da janela: tudo o que caiu na janela veio, nada a recortar.
    // Dentro dela (até no 1º dia), o dia dela pode estar pela metade: a janela começa ali e a tela avisa.
    if (antiga && antiga >= somarDia(hoje, -(n - 1))) { n = Math.round((diaUTC(hoje) - diaUTC(antiga)) / 86400000) + 1; recortado = true; }
  }
  const mapa = new Map();
  const serie = [];
  for (let i = n - 1; i >= 0; i--) {
    const dia = somarDia(hoje, -i);
    const p = { dia, rotulo: ddmm(dia), semana: DIAS_CURTOS[diaSemanaDe(dia)], ok: 0, erro: 0, espera: 0, pulado: 0, total: 0 };
    mapa.set(dia, p); serie.push(p);
  }
  let contadas = 0;
  for (const x of Array.isArray(lista) ? lista : []) {
    const dia = x ? diaSP(x.criado_em) : null;
    const p = dia && mapa.get(dia);
    if (!p) continue;
    p[situacaoExecucao(x)]++; p.total++; contadas++;
  }
  return { serie, n: contadas, dias: n, maximo: Math.max(0, ...serie.map(p => p.total)), recortado };
}

/** Rótulo de um dia para a linha do tempo: "Hoje" · "Ontem" · "seg, 02/10". */
export function rotuloDia(dia, agora = new Date()) {
  const hoje = diaSP(agora);
  if (dia === hoje) return "Hoje";
  if (dia === somarDia(hoje, -1)) return "Ontem";
  return `${DIAS_CURTOS[diaSemanaDe(dia)]}, ${ddmm(dia)}`;
}

/** Agrupa execuções por dia, mais recente primeiro: [{dia, rotulo, itens}]. Linhas sem data vão para um grupo «Sem data» no fim. */
export function agruparExecucoesPorDia(lista, agora = new Date()) {
  const grupos = new Map();
  const semData = [];
  for (const x of Array.isArray(lista) ? lista : []) {
    const dia = x ? diaSP(x.criado_em) : null;
    if (!dia) { semData.push(x); continue; }
    if (!grupos.has(dia)) grupos.set(dia, []);
    grupos.get(dia).push(x);
  }
  const out = [...grupos.keys()].sort((a, b) => (a < b ? 1 : a > b ? -1 : 0)).map(dia => ({ dia, rotulo: rotuloDia(dia, agora), itens: grupos.get(dia) }));
  if (semData.length) out.push({ dia: null, rotulo: "Sem data", itens: semData });
  return out;
}

/** Classe visual de um passo no diagrama e nos cartões: "msg" · "espera" · "parar" · "ia" · "crm" · "equipe". */
export function tomDaAcao(tipo) {
  const d = ACAO[tipo];
  if (!d) return "crm";
  if (tipo === "esperar") return "espera";
  if (tipo === "parar") return "parar";
  if (d.ia) return "ia";
  if (d.mensagem) return "msg";
  if (tipo === "notificar" || tipo === "alerta_whatsapp" || tipo === "atribuir" || tipo === "criar_tarefa") return "equipe";
  return "crm";
}

/**
 * Nós do diagrama ao vivo do editor (gatilho → condições → passos), na ordem em que são desenhados.
 * [{id, tipo:"gatilho"|"condicao"|"passo"|"mais", onde:"quando"|"se"|"entao", indice, rotulo, sub, icone, tom, inalcancavel, n}]
 * O nó «mais» só entra quando `podeEditar` e ainda cabe passo: é o atalho para «Adicionar passo».
 */
export function nosDoDiagrama(auto, base, vocab, { podeEditar = false } = {}) {
  const a = auto || {};
  const ix = indexarBase(base);
  const vv = voc(vocab);
  const nos = [];
  const g = GATILHO[a.gatilho];
  nos.push({ id: "gatilho", tipo: "gatilho", onde: "quando", indice: null, icone: g ? g.icone : "raio", tom: "gatilho",
    rotulo: g ? rotuloGatilho(a.gatilho, vocab) : "Escolha o gatilho", sub: cortar(fraseQuando(a, ix, vv), 64), inalcancavel: false });
  const conds = Array.isArray(a.condicoes) ? a.condicoes : [];
  conds.forEach((cd, i) => nos.push({ id: `cond-${i}`, tipo: "condicao", onde: "se", indice: i, icone: "filtro", tom: "condicao", n: i + 1,
    rotulo: `Só se ${cortar(fraseCondicao(cd, ix) || "(condição incompleta)", 52)}`, sub: "", inalcancavel: false }));
  const acoes = Array.isArray(a.acoes) ? a.acoes : [];
  const tl = linhaDoTempo(acoes);
  acoes.forEach((ac, i) => {
    const d = ac && ACAO[ac.tipo];
    const esp = ac && ac.tipo === "esperar";
    nos.push({ id: `passo-${i}`, tipo: "passo", onde: "entao", indice: i, icone: d ? d.icone : "raio", tom: tomDaAcao(ac && ac.tipo), n: i + 1,
      rotulo: esp ? `Esperar ${nat(ac.minutos) > 0 ? formatarDuracao(ac.minutos) : "(tempo)"}` : rotuloAcao(ac && ac.tipo, vocab),
      sub: tl[i].inalcancavel ? "nunca roda (depois de «Parar»)" : esp ? (ac.cancelar_se_cliente_responder ? "para se o cliente responder" : "") : cortar(fraseAcao(ac, ix, vv) || "", 56),
      inalcancavel: !!tl[i].inalcancavel });
  });
  if (!acoes.length) nos.push({ id: "vazio", tipo: "passo", onde: "entao", indice: null, icone: "mais", tom: "vazio", rotulo: "Nenhum passo ainda", sub: "acrescente pelo menos um", inalcancavel: false });
  else if (podeEditar && acoes.length < LIMITES.acoes) nos.push({ id: "mais", tipo: "mais", onde: "entao", indice: null, icone: "mais", tom: "mais", rotulo: "Adicionar passo", sub: "", inalcancavel: false });
  return nos;
}

/** Texto alternativo do diagrama (leitor de tela e title): "Fluxo: quando …; só se …; então 1. …, 2. …". */
export function textoDiagrama(nos) {
  const l = Array.isArray(nos) ? nos : [];
  const g = l.find(x => x.tipo === "gatilho");
  const conds = l.filter(x => x.tipo === "condicao").map(x => x.rotulo.replace(/^Só se /, ""));
  const passos = l.filter(x => x.tipo === "passo" && x.indice != null).map(x => `${x.n}. ${x.rotulo}${x.inalcancavel ? " (nunca roda)" : ""}`);
  const partes = [`Fluxo: ${g ? g.sub || g.rotulo : "sem gatilho"}`];
  if (conds.length) partes.push(`só se ${listaFrase(conds)}`);
  partes.push(passos.length ? `então ${passos.join(", ")}` : "então nenhum passo ainda");
  return partes.join("; ") + ".";
}

/** Busca nas receitas sem acento: cada palavra do termo precisa aparecer no título, no texto, na categoria ou nos tipos de passo. */
export function filtrarModelos(modelos, termo, vocab) {
  const toks = normalizar(termo).split(/\s+/).filter(Boolean);
  const lista = Array.isArray(modelos) ? modelos : [];
  if (!toks.length) return lista.slice();
  return lista.filter(m => {
    const txt = normalizar([tituloModelo(m, vocab), textoModelo(m, vocab), m.categoria, m.auto && m.auto.nome,
      ...((m.auto && m.auto.acoes) || []).map(ac => `${ac.tipo} ${rotuloAcao(ac.tipo, vocab)}`), rotuloGatilho(m.auto && m.auto.gatilho, vocab)].join(" "));
    return toks.every(k => txt.includes(k));
  });
}

/** Exemplos clicáveis da caixa «Criar com IA» (frases do dia a dia, no vocabulário da vertical quando faz diferença). */
export function exemplosIA(vocab) {
  const vv = voc(vocab);
  const c = palavraConsulta(vv.vertical);
  return [
    "Quando um orçamento ficar 2 dias sem resposta, manda uma mensagem e avisa o responsável",
    "Todo dia às 9h, cria uma tarefa para ligar para quem está parado há 3 dias na etapa de orçamento",
    `Quando o cliente faltar à ${c}, pede para remarcar e avisa a recepção`,
    "Quando chegar mensagem com a palavra preço, põe a etiqueta Orçamento e avisa a equipe",
    `No dia seguinte à ${c}, manda uma mensagem pedindo uma avaliação`,
  ];
}

/* ================================================================== plano 100 (frente G): séries do servidor, decisão da IA, perguntas */

const RE_DIA = /^\d{4}-\d{2}-\d{2}$/;

/**
 * Série por dia vinda do servidor (nx_automacao_execucoes_dia → [{dia:"AAAA-MM-DD", ok, erro}], mais antigo primeiro, dias sem
 * execução com zeros). Devolve o mesmo formato de execucoesPorDia ({serie, n, dias, maximo, recortado:false}) com `servidor: true`,
 * ou null quando a resposta não é a série (RPC antiga, objeto de erro, dia inválido): aí a tela calcula no navegador.
 * O servidor só separa «sem erro» de «com erro» (esperas, puladas e paradas contam como sem erro); espera/pulado ficam em zero.
 */
export function serieExecucoesServidor(lista) {
  if (!Array.isArray(lista) || !lista.length) return null;
  const serie = [];
  for (const x of lista) {
    if (!x || typeof x !== "object" || !RE_DIA.test(texto(x.dia))) return null;
    const ok = nat(x.ok), erro = nat(x.erro);
    serie.push({ dia: x.dia, rotulo: ddmm(x.dia), semana: DIAS_CURTOS[diaSemanaDe(x.dia)], ok, erro, espera: 0, pulado: 0, total: ok + erro });
  }
  serie.sort((a, b) => (a.dia < b.dia ? -1 : a.dia > b.dia ? 1 : 0));
  const n = serie.reduce((s, p) => s + p.total, 0);
  return { serie, n, dias: serie.length, maximo: Math.max(0, ...serie.map(p => p.total)), recortado: false, servidor: true };
}

/**
 * O que a IA decidiu numa execução, lido do detalhe que o servidor grava (nx_auto_ia_resolver / nx_auto_rodar):
 *   «… · IA: movido para «X» (motivo)» · «IA: já estava em «X» (motivo)» · «IA: lead com nota 72 (motivo)» ·
 *   «IA: resumo da conversa gravado como nota» · «IA: pulado (motivo)» · «IA pedida: …» (aguardando) · «IA: <erro>».
 * → null (execução sem passo de IA) ou {tipo: "etapa"|"nota"|"resumo"|"pedida"|"pulado"|"erro", etapa?, funil?, score?, motivo, jaEstava?, frase}.
 * Nada é inventado: o que não casar com as frases conhecidas vira {tipo:"erro"} com o texto do servidor.
 */
export function decisaoIA(detalhe) {
  const d = texto(detalhe).trim();
  if (!d) return null;
  const partes = d.split(" · ");
  let i = -1;
  for (let k = partes.length - 1; k >= 0; k--) if (/^IA( pedida)?:/.test(partes[k].trim())) { i = k; break; }
  if (i < 0) return null;
  const seg = partes.slice(i).join(" · ").trim();
  // revisão: o servidor continua escrevendo depois da IA («… (motivo) · tarefa criada») e corta o detalhe em 280 caracteres — o motivo é o
  // parêntese que ABRE logo depois da etapa/nota, até o «)» que o fecha (com parênteses dentro); cortado no fim, vale o que veio
  const motivoDe = s => {
    const x = texto(s).trim();
    if (x[0] !== "(") return "";
    let n = 0;
    for (let k = 0; k < x.length; k++) {
      if (x[k] === "(") n++;
      else if (x[k] === ")" && --n === 0) return x.slice(1, k).trim();
    }
    return x.slice(1).trim();
  };
  if (/^IA pedida:/.test(seg)) {
    const o = seg.replace(/^IA pedida:\s*/, "");
    return { tipo: "pedida", motivo: o, frase: `Aguardando a decisão da IA${o ? ` (${o})` : ""}.` };
  }
  const r = seg.replace(/^IA:\s*/, "");
  let m = /^(movido para|já estava em) «([^»]+)»(?: no funil «([^»]+)»)?\s*([\s\S]*)$/.exec(r);
  if (m) {
    const jaEstava = m[1] !== "movido para";
    const motivo = motivoDe(m[4]);
    return { tipo: "etapa", etapa: m[2], funil: m[3] || null, jaEstava, motivo,
      frase: jaEstava ? `A IA manteve em «${m[2]}»${m[3] ? ` (funil «${m[3]}»)` : ""}.` : `A IA moveu para «${m[2]}»${m[3] ? ` no funil «${m[3]}»` : ""}.` };
  }
  m = /^lead com nota (\d{1,3})\s*([\s\S]*)$/.exec(r);
  if (m) {
    const score = Math.max(0, Math.min(100, Number(m[1])));
    return { tipo: "nota", score, motivo: motivoDe(m[2]), frase: `A IA deu nota ${score} de 100 ao interesse do cliente.` };
  }
  if (/^resumo da conversa gravado como nota/.test(r)) return { tipo: "resumo", motivo: "", frase: "A IA resumiu a conversa numa nota do histórico." };
  m = /^pulado\s*([\s\S]*)$/.exec(r);
  if (m) { const motivo = motivoDe(m[1]) || m[1].split(" · ")[0].trim(); return { tipo: "pulado", motivo, frase: `A IA não rodou${motivo ? `: ${motivo}` : ""}.` }; }
  return { tipo: "erro", motivo: r, frase: `A IA não conseguiu decidir${r ? `: ${r}` : ""}.` };
}

/** Rótulo do link de uma execução: «Abrir a conversa» · «Abrir o negócio» (vocabulário) · «Abrir o contato» · «Ver tarefas» · «Abrir». */
export function rotuloLinkExecucao(link, vocab) {
  const l = texto(link);
  const vv = voc(vocab);
  if (/^#\/conversas\//.test(l)) return "Abrir a conversa";
  if (/^#\/crm\/negocio\//.test(l)) return `Abrir ${vv.art("negocio")} ${vv.min("negocio")}`;
  if (/^#\/contatos\//.test(l)) return `Abrir ${vv.art("contato")} ${vv.min("contato")}`;
  if (/^#\/tarefas/.test(l)) return "Ver tarefas";
  return "Abrir";
}

/**
 * Avisos do «Criar com IA» como perguntas respondíveis (chips + resposta livre): cada aviso vira {id, pergunta, opcoes:[texto]}.
 * As opções saem do que existe no sistema e combina com o assunto do aviso (etapas, etiquetas, pessoas, números, departamentos);
 * sem assunto reconhecido, «Sim» / «Não». No máximo 8 perguntas e 6 opções cada (a tela continua curta no celular).
 */
export function perguntasDosAvisos(avisos, base) {
  const b = base || {};
  const nomes = lista => [...new Set((lista || []).map(x => texto(x && x.nome).trim()).filter(Boolean))];
  const etapas = [...new Set((b.funis || []).flatMap(f => nomes(f && f.estagios)))];
  const regras = [
    [/\b(etapa|etapas|estagio|estagios|funil)\b/, etapas],
    [/\betiquetas?\b/, nomes(b.etiquetas)],
    [/\b(pessoa|responsavel|atendente|usuario|equipe)\b/, nomes(b.usuarios)],
    [/\b(numero|canal|whatsapp)\b/, nomes(b.canais)],
    [/\bdepartamentos?\b/, nomes(b.departamentos)],
  ];
  const out = [];
  for (const a of Array.isArray(avisos) ? avisos : []) {
    const p = texto(a).trim();
    if (!p || out.length >= 8) continue;
    const n = normalizar(p);
    const r = regras.find(([re, ops]) => re.test(n) && ops.length);
    out.push({ id: `p${out.length}`, pergunta: p.slice(0, 240), opcoes: (r ? r[1] : ["Sim", "Não"]).slice(0, 6) });
  }
  return out;
}

/**
 * Novo pedido para a IA = o pedido original + as respostas («Respostas às dúvidas da IA: …»), dentro do limite de caracteres.
 * respostas: {id: texto} (só as preenchidas entram). Devolve {texto, usadas, cortado}: o que não cabe fica de fora (e a tela avisa).
 * Um bloco de respostas anterior no pedido é trocado (responder duas vezes não empilha).
 */
export function descricaoComRespostas(descricao, perguntas, respostas, max = LIMITES.descricao_ia) {
  const bruto = texto(descricao);
  const base = bruto.replace(/\s*Respostas às dúvidas da IA:[\s\S]*$/, "").trim();
  const novas = [];
  for (const p of Array.isArray(perguntas) ? perguntas : []) {
    const r = texto(respostas && respostas[p.id]).trim();
    if (r) novas.push(`- ${cortar(p.pergunta, 140)} → ${r.slice(0, 200)}`);
  }
  // revisão: as respostas das rodadas ANTERIORES continuam (a IA não pergunta de novo o que já foi respondido); a mesma pergunta respondida
  // de novo vale a resposta nova; no limite, as novas entram primeiro
  const blocoAntigo = /Respostas às dúvidas da IA:([\s\S]*)$/.exec(bruto);
  const pergDe = l => l.split(" → ")[0];
  const antigas = blocoAntigo ? blocoAntigo[1].split("\n").map(s => s.trim()).filter(s => s.startsWith("- ") && !novas.some(n => pergDe(n) === pergDe(s))) : [];
  const linhas = [...novas, ...antigas];
  if (!linhas.length) return { texto: base.slice(0, max), usadas: 0, cortado: false };
  let t = `${base}\n\nRespostas às dúvidas da IA:`;
  let usadas = 0, cortado = false;
  for (const l of linhas) { if ((`${t}\n${l}`).length > max) { cortado = true; break; } t += `\n${l}`; usadas++; }
  if (!usadas) return { texto: base.slice(0, max), usadas: 0, cortado: true };
  return { texto: t, usadas, cortado };
}

/**
 * A IA montou, mas a conferência do servidor reprovou (nx-ia → {ok:false, erro:"automacao_invalida", automacao, detalhe, onde, indice,
 * explicacao, avisos}): a cota já foi gasta, então a montagem ainda serve — abre no editor com o motivo. null quando o erro é outro
 * ou o servidor (versão antiga) não devolveu a automação.
 */
export function montagemReprovada(e, base) {
  const cod = texto(e && (e.codigo || e.message));
  const r = e && e.resposta;
  if (cod !== "automacao_invalida" || !r || typeof r.automacao !== "object" || !r.automacao) return null;
  const conv = deFormatoIA(r.automacao, base);
  const motivo = texto(r.detalhe || (e && e.detalhe_texto) || (e && e.hint)).trim().slice(0, 300);
  const avisos = [...(Array.isArray(r.avisos) ? r.avisos : []).map(String), ...conv.avisos].filter(Boolean).slice(0, 12);
  return { auto: conv.auto, explicacao: typeof r.explicacao === "string" ? r.explicacao.trim().slice(0, 1500) : "", avisos,
    reprovada: { motivo: motivo || "a automação não passou na conferência", onde: texto(r.onde) || null, indice: Number.isInteger(r.indice) ? r.indice : null } };
}

/* ================================================================== plano 1000 (13/10/2026) · frente auto */

/** Distância de edição (Levenshtein) curta — para sugerir a variável certa quando a pessoa digita errado. */
function distancia(a, b) {
  const m = a.length, n = b.length;
  let ant = Array.from({ length: n + 1 }, (_, j) => j);
  for (let i = 1; i <= m; i++) {
    const cur = [i];
    for (let j = 1; j <= n; j++) cur[j] = Math.min(ant[j] + 1, cur[j - 1] + 1, ant[j - 1] + (a[i - 1] === b[j - 1] ? 0 : 1));
    ant = cur;
  }
  return ant[n];
}

/** AS-035: a variável conhecida mais parecida com a digitada ({primeironome} → primeiro_nome); null se nenhuma chega perto. */
export function sugestaoVariavel(nome) {
  // plano 1500c · UCA-007: «Primeiro_Nome», « nome », «primeiro nome» → a grafia certa direto
  const direto = normalizar(nome).replace(/\s+/g, "_");
  if (VARIAVEIS.some(([k]) => k === direto)) return direto;
  const alvo = texto(nome).toLowerCase();
  const semTraco = alvo.replace(/_/g, "");
  let melhor = null, dist = Infinity;
  for (const [k] of VARIAVEIS) {
    const d = Math.min(distancia(alvo, k), distancia(semTraco, k.replace(/_/g, "")));
    if (d < dist) { dist = d; melhor = k; }
  }
  return melhor && dist <= Math.max(2, Math.floor(melhor.length / 3)) ? melhor : null;
}

/** AS-035: por passo, as variáveis que não existem nos textos com variáveis (mensagem, título, nota, parâmetros do modelo). */
export function variaveisDosPassos(auto) {
  const out = [];
  ((auto && auto.acoes) || []).forEach((ac, indice) => {
    const d = ac && ACAO[ac.tipo];
    if (!d) return;
    const textos = d.campos.filter(f => f.variaveis).map(f => ac[f.nome]);
    if (ac.tipo === "enviar_template") textos.push(...(Array.isArray(ac.parametros) ? ac.parametros : []));
    const desconhecidas = variaveisDesconhecidas(textos.filter(x => typeof x === "string").join("\n"));
    if (desconhecidas.length) out.push({ indice, desconhecidas, sugestoes: desconhecidas.map(sugestaoVariavel) });
  });
  return out;
}

/** «variável desconhecida {primeironome} (use {primeiro_nome})» — o mesmo texto no aviso do passo e no bloqueio ao ligar. */
export function fraseVariaveis(v) {
  const partes = v.desconhecidas.map((k, i) => (v.sugestoes[i] ? `{${k}} (use {${v.sugestoes[i]}})` : `{${k}}`));
  return `${partes.length === 1 ? "variável desconhecida" : "variáveis desconhecidas"} ${listaFrase(partes)}`;
}

/** AS-267: chave do rascunho por ORIGEM — rascunho em branco não aparece ao abrir uma receita (e vice-versa). */
export function idRascunho({ item = null, origem = "branco", modelo = null } = {}) {
  if (item && item.id) return String(item.id);
  if (origem === "modelo" && modelo) return `nova:modelo:${modelo}`;
  if (origem === "ia") return "nova:ia";
  return "nova";
}

/**
 * AS-278: cadeias com OUTRAS automações ligadas — um passo desta automação (mover de etapa, pôr etiqueta) dispara o gatilho de outra.
 * Devolve [{indice, outra: {id, nome}, por, laco}]; `laco` = a outra também dispara esta de volta (ping-pong que enche as execuções de erro).
 */
/**
 * plano 1500c · UCA-012..016: efeitos completos — etiqueta pelo nome (UCA-012), «Mover de funil»/«Criar negócio» sem etapa caem na 1ª
 * etapa e «Criar negócio» dispara «criado» (UCA-013), etapa de ganho/perdido dispara «Ganho/Perdido» (UCA-014), laço de 3 ou mais
 * automações com o caminho (UCA-015) e a automação que dispara a si mesma (UCA-016, `autoLaco`).
 * Cada item: {indice, outra:{id,nome}, por, laco, caminho?:[nomes], autoLaco?}.
 */
export function cadeiasDeAutomacao(auto, itens, base) {
  const ix = indexarBase(base);
  const b = base || {};
  const funis = b.funis || [];
  const primeiraEtapa = fid => { const f = funis.find(x => x.id === fid); return f && (f.estagios || [])[0] ? f.estagios[0].id : null; };
  const funilPadrao = () => (funis.find(f => f.padrao && f.ativo !== false) || funis.find(f => f.ativo !== false) || funis[0] || {}).id || null;
  const idEtiquetaPorNome = nome => { const t = (b.etiquetas || []).find(x => normalizar(x.nome) === normalizar(nome)); return t ? t.id : null; };
  const efeitos = a => {
    const ef = [];
    ((a && a.acoes) || []).forEach((ac, i) => {
      if (!ac) return;
      if (ac.tipo === "mover_estagio" && ac.estagio_id) ef.push({ i, tipo: "estagio", id: ac.estagio_id });
      if (ac.tipo === "mover_funil") { const id = ac.estagio_id || primeiraEtapa(ac.funil_id); if (id) ef.push({ i, tipo: "estagio", id }); }
      if (ac.tipo === "criar_negocio") {
        const fid = ac.funil_id || (ac.estagio_id && ix.estagios.get(ac.estagio_id) ? ix.estagios.get(ac.estagio_id).funil_id : funilPadrao());
        const id = ac.estagio_id || primeiraEtapa(fid);
        if (id) ef.push({ i, tipo: "estagio", id });
        ef.push({ i, tipo: "criado", funil: fid });
      }
      if (ac.tipo === "etiqueta_adicionar" || (ac.tipo === "etiquetar" && !ac.remover)) {
        const id = ac.etiqueta_id || (ac.etiqueta_nome ? idEtiquetaPorNome(ac.etiqueta_nome) : null);
        if (id) ef.push({ i, tipo: "etiqueta", id });
        else if (ac.etiqueta_nome) ef.push({ i, tipo: "etiqueta", id: null, nome: texto(ac.etiqueta_nome).trim() });
      }
      // o que DESFAZ o estado (para o laço consigo mesma): tirar a etiqueta, sair da etapa
      if (ac.tipo === "etiqueta_remover" || (ac.tipo === "etiquetar" && ac.remover)) ef.push({ i, tipo: "tira_etiqueta", id: ac.etiqueta_id || idEtiquetaPorNome(ac.etiqueta_nome) });
    });
    return ef;
  };
  const dispara = (ef, a) => {
    const c = (a && a.config) || {};
    if (ef.tipo === "estagio") {
      if (a.gatilho === "negocio_estagio" && c.estagio_id === ef.id) return true;
      const e = ix.estagios.get(ef.id);
      const doFunil = !c.funil_id || (e && c.funil_id === e.funil_id);
      return !!e && doFunil && ((e.tipo === "ganho" && a.gatilho === "negocio_ganho") || (e.tipo === "perdido" && a.gatilho === "negocio_perdido"));
    }
    if (ef.tipo === "etiqueta") {
      if (a.gatilho !== "etiqueta_adicionada") return false;
      if (ef.id) return c.etiqueta_id === ef.id;
      const t = ix.etiquetas.get(c.etiqueta_id);
      return !!t && normalizar(t.nome) === normalizar(ef.nome);
    }
    if (ef.tipo === "criado") return a.gatilho === "negocio_criado" && (!c.funil_id || c.funil_id === ef.funil);
    return false;
  };
  const porDe = ef => {
    if (ef.tipo === "estagio") {
      const e = ix.estagios.get(ef.id);
      return `a etapa «${e ? e.nome : "etapa removida"}»`;
    }
    if (ef.tipo === "etiqueta") return `a etiqueta «${ef.id ? nomeDe(ix, "etiquetas", ef.id, "etiqueta removida") : ef.nome}»`;
    if (ef.tipo === "criado") return "um novo registro no funil";
    return "";
  };
  const nomeDeAuto = a => texto(a && a.nome) || "Automação sem nome";
  const atual = auto || {};
  const ligadas = (Array.isArray(itens) ? itens : []).filter(o => o && o.ativo && !(atual.id && o.id === atual.id));
  const efs = new Map();
  const efeitosDe = a => { if (!efs.has(a)) efs.set(a, efeitos(a).filter(e => e.tipo !== "tira_etiqueta")); return efs.get(a); };
  const alcanca = (u, v) => efeitosDe(u).some(ef => dispara(ef, v));
  // caminho de `de` de volta para a atual, passando só pelas ligadas (até 10 automações)
  const caminhoDeVolta = de => {
    const pilha = [[de, [de]]];
    const vistos = new Set([de]);
    while (pilha.length) {
      const [u, cam] = pilha.shift();
      if (alcanca(u, atual)) return cam;
      if (cam.length >= 10) continue;
      for (const w of ligadas) if (!vistos.has(w) && alcanca(u, w)) { vistos.add(w); pilha.push([w, cam.concat([w])]); }
    }
    return null;
  };
  const meus = efeitosDe(atual);
  const out = [];
  for (const outra of ligadas) {
    for (const ef of meus) {
      if (!dispara(ef, outra)) continue;
      const cam = caminhoDeVolta(outra);
      const item = { indice: ef.i, outra: { id: outra.id, nome: nomeDeAuto(outra) }, por: porDe(ef), laco: !!cam };
      if (cam) item.caminho = [nomeDeAuto(atual), ...cam.map(nomeDeAuto)];
      out.push(item);
    }
  }
  // UCA-016: um efeito desta automação refaz o próprio gatilho depois de outro passo desfazer o estado
  const todos = efeitos(atual);
  const c0 = atual.config || {};
  for (const ef of meus) {
    if (!dispara(ef, atual)) continue;
    const desfez = todos.some(x => x.i < ef.i && (
      (ef.tipo === "etiqueta" && x.tipo === "tira_etiqueta" && x.id && x.id === (ef.id || c0.etiqueta_id)) ||
      (ef.tipo === "estagio" && x.tipo === "estagio" && x.id !== ef.id)));
    if (!desfez) continue;
    out.push({ indice: ef.i, outra: { id: atual.id ?? null, nome: nomeDeAuto(atual) }, por: porDe(ef), laco: true, autoLaco: true, caminho: [nomeDeAuto(atual)] });
  }
  return out;
}

/** plano 1500c · UCA-015/016: a frase do aviso de laço («A → B → C → volta para esta» / «esta automação dispara a si mesma»). */
export function fraseLaco(cadeia) {
  if (!cadeia || !cadeia.laco) return "";
  if (cadeia.autoLaco) return `Esta automação dispara a si mesma (por ${cadeia.por}): ela pode rodar sem parar.`;
  const cam = Array.isArray(cadeia.caminho) && cadeia.caminho.length > 1 ? cadeia.caminho : null;
  if (!cam) return `«${cadeia.outra.nome}» dispara esta de volta: as duas podem rodar sem parar.`;
  return `Laço: ${cam.map(n => `«${n}»`).join(" → ")} → volta para esta. Elas podem rodar sem parar.`;
}

/** AS-277: texto da confirmação ao desligar com gente no meio da sequência; null quando ninguém está esperando. */
export function avisoDesligarEspera(item) {
  const n = nat(item && item.em_espera);
  if (!n) return null;
  return n === 1 ? "1 pessoa está no meio da sequência e não vai receber os próximos passos."
    : `${n} pessoas estão no meio da sequência e não vão receber os próximos passos.`;
}

/** AS-016: as automações LIGADAS que mandam mensagem ao cliente (o botão de emergência desliga só essas). */
export const ligadasQueEnviam = itens => (Array.isArray(itens) ? itens : []).filter(x => x && x.ativo && enviaMensagem(x));

/** AS-070: a cota de IA do mês em uma linha + o tom (aten a partir de 80 %); null sem cota conhecida. */
export function linhaCotaIA(cota) {
  if (!cota || cota.limite == null || !Number.isFinite(Number(cota.limite)) || Number(cota.limite) <= 0) return null;
  const usadas = nat(cota.usadas), limite = nat(cota.limite);
  const pct = usadas / limite;
  // plano 1000b · UB-062: a cota soma sugestões, resumos e passos de IA — não só as montagens
  return { texto: `${usadas} de ${limite} usos de IA este mês (sugestões, resumos e montagens)`, tom: pct >= 1 ? "ruim" : pct >= 0.8 ? "aten" : "neutra", esgotada: usadas >= limite };
}

/** AS-037: contador do texto do passo — «1.234 / 4.096», amarelo a partir de 90 % e vermelho acima do teto. */
export function contadorTexto(valor, max) {
  const n = texto(valor).length, m = nat(max);
  const fmt = x => x.toLocaleString("pt-BR");
  return { n, texto: `${fmt(n)} / ${fmt(m)}`, tom: m && n > m ? "ruim" : m && n >= m * 0.9 ? "aten" : "neutra" };
}

/** AS-038: horas ↔ {n, un: "horas"|"dias"} (dias quando é múltiplo de 24). */
export function decomporHoras(horas) {
  const hh = nat(horas);
  if (hh >= 24 && hh % 24 === 0) return { n: hh / 24, un: "dias" };
  return { n: hh || "", un: "horas" };
}
export function comporHoras(n, un) {
  const x = Number(String(n).replace(",", "."));
  if (!Number.isFinite(x) || x <= 0) return null;
  const hh = un === "dias" ? x * 24 : x;
  return Number.isInteger(hh) ? hh : Math.round(hh);
}

/** AS-040: etapas presas a um funil DESLIGADO (o seletor esconde o funil; ligar a automação assim não faz sentido). */
export function etapasDeFunilDesligado(auto, base) {
  const ix = indexarBase(base);
  const out = [];
  const conferir = (id, onde, indice) => {
    if (vazio(id)) return;
    const e = ix.estagios.get(id);
    const f = e && ix.funis.get(e.funil_id);
    if (f && f.ativo === false) out.push({ onde, indice, etapa: e.nome, funil: f.nome });
  };
  conferir(auto && auto.config && auto.config.estagio_id, "quando", null);
  ((auto && auto.acoes) || []).forEach((ac, i) => conferir(ac && ac.estagio_id, "entao", i));
  return out;
}

/* ------------------------------------------------------------------ plano 1000 · lote auto-2 */

/** AS-018: por onde as automações mandam WhatsApp, pelos provedores dos números (base.canais[].provedor). */
export function viaWhatsApp(canais) {
  const l = Array.isArray(canais) ? canais : [];
  if (!l.length) return "manda mensagem pelo WhatsApp (assim que houver um número conectado)";
  const p = new Set(l.map(c => c && c.provedor).filter(Boolean));
  if (p.has("codewords") && p.has("meta")) return "manda mensagem pelo WhatsApp (pelo CodeWords ou pela API oficial da Meta, com modelo aprovado)";
  if (p.has("codewords")) return "manda mensagem pelo WhatsApp (pelo CodeWords)";
  if (p.has("meta")) return "manda mensagem pelo WhatsApp (pela API oficial da Meta, com modelo aprovado)";
  return "manda mensagem pelo WhatsApp";
}

/** AS-071: telefone, CPF ou e-mail colados no pedido à IA (o texto vai para a Anthropic) → [{tipo, trecho}] (no máx. 3). */
export function dadosPessoaisNoPedido(txt) {
  const t = texto(txt);
  const anoLimite = new Date().getFullYear() - 10;
  const regras = [
    // plano 1500c · UCA-100: CNPJ (com máscara ou 14 dígitos) e data de nascimento completa (ano há mais de 10 anos)
    ["CNPJ", /\b\d{2}\.\d{3}\.\d{3}\/\d{4}-\d{2}\b|\b\d{14}\b/g],
    ["data de nascimento", /\b(0?[1-9]|[12]\d|3[01])\/(0?[1-9]|1[0-2])\/(19\d{2}|20\d{2})\b/g],
    ["CPF", /\b\d{3}\.\d{3}\.\d{3}-\d{2}\b|\b\d{11}\b/g],
    ["e-mail", /[^\s@<>()«»]+@[^\s@<>()«»]+\.[a-z]{2,}/gi],
    ["telefone", /(?:\+?55\s?)?\(?\b[1-9]{2}\)?\s?9?\d{4}[-\s]?\d{4}\b/g],
    // plano 1000b · UB-027: celular sem DDD («98765-4321», «9 8765 4321») também é telefone (isolado: não pega pedaço de outro número)
    ["telefone", /(?<![\d(.-])\b9\s?\d{4}[-\s]?\d{4}\b(?![\d.-]\d)/g],
  ];
  const out = [], vistos = [];
  for (const [tipo, re] of regras) for (const m of t.matchAll(re)) {
    // plano 1000b · UB-026: 11 dígitos colados com DDD válido e 9 na 3ª posição é celular, não CPF (a regra do telefone pega logo depois)
    if (tipo === "CPF" && /^[1-9]{2}9\d{8}$/.test(m[0])) continue;
    if (tipo === "data de nascimento" && Number(m[3]) >= anoLimite) continue;   // plano 1500c · UCA-100: data recente é agenda, não nascimento
    if (vistos.some(v => v.includes(m[0]) || m[0].includes(v))) continue;
    vistos.push(m[0]); out.push({ tipo, trecho: m[0] });
  }
  return out.slice(0, 3);
}

/** AS-072: os últimos pedidos à IA (o mais novo primeiro, sem repetir, no máx. `max`). */
export function juntarPedidoRecente(lista, pedido, max = 5) {
  const p = texto(pedido).trim().slice(0, LIMITES.descricao_ia);
  const l = (Array.isArray(lista) ? lista : []).map(x => texto(x).trim()).filter(Boolean);
  if (!p) return l.slice(0, max);
  return [p, ...l.filter(x => normalizar(x) !== normalizar(p))].slice(0, max);
}

/** plano 1500c · UCA-101: pedidos recentes valem 30 dias no aparelho. */
export const PRAZO_RECENTES_MS = 30 * 86400000;
/**
 * plano 1500c · UCA-101: os pedidos guardados como [{texto, em}] — os com mais de 30 dias somem; texto solto (formato antigo) vale como
 * de agora. `pedido` (opcional) entra primeiro, sem repetir. Devolve no máx. `max`.
 */
export function pedidosRecentes(lista, pedido = "", { max = 5, agora = Date.now() } = {}) {
  const l = (Array.isArray(lista) ? lista : []).map(x => (typeof x === "string" ? { texto: x, em: agora } : x && typeof x === "object" ? { texto: texto(x.texto), em: Number(x.em) || 0 } : null))
    .filter(x => x && x.texto.trim() && agora - x.em <= PRAZO_RECENTES_MS && x.em <= agora + 60000)
    .map(x => ({ texto: x.texto.trim(), em: x.em }));
  const p = texto(pedido).trim().slice(0, LIMITES.descricao_ia);
  const todos = p ? [{ texto: p, em: agora }, ...l.filter(x => normalizar(x.texto) !== normalizar(p))] : l;
  return todos.slice(0, max);
}

/** Gatilhos conferidos pelo relógio (rodada a cada 15 s), não por um evento. */
export const GATILHOS_TEMPO = Object.freeze(["sem_resposta", "tempo_no_estagio", "tarefa_vencida", "antes_da_data", "apos_data"]);

/** AS-030: o que «Pronta» promete ao salvar ligada, pelo tipo de gatilho. */
export function textoProntaLigada(gatilho) {
  if (gatilho === "agendado") return "Pronta. Ao salvar, roda no próximo dia e horário escolhidos.";
  if (GATILHOS_TEMPO.includes(gatilho)) return "Pronta. Ao salvar, o relógio confere a cada 15 segundos e ela age quando o tempo escolhido passar.";
  return "Pronta. Ao salvar, cada novo gatilho é atendido em até 15 segundos.";
}

/** AS-052: nome sugerido a partir do gatilho e do 1º passo («Etapa Avaliação → criar tarefa»); "" sem o que sugerir. */
export function sugestaoNome(auto, base, vocab) {
  const a = auto || {};
  if (!GATILHO[a.gatilho]) return "";
  const ix = indexarBase(base);
  const c = a.config || {};
  const etapa = c.estagio_id && ix.estagios.get(c.estagio_id) ? ix.estagios.get(c.estagio_id).nome : null;
  let ini = a.gatilho === "negocio_estagio" && etapa ? `Etapa ${etapa}`
    : a.gatilho === "tempo_no_estagio" && etapa ? `Parado em ${etapa}`
      : rotuloGatilho(a.gatilho, vocab);
  const ac = (a.acoes || []).find(x => x && x.tipo && x.tipo !== "esperar" && x.tipo !== "parar");
  if (!ac && !etapa) return "";
  if (ac) { const r = rotuloAcao(ac.tipo, vocab); ini += ` → ${r.charAt(0).toLowerCase()}${r.slice(1)}`; }
  return ini.length > 80 ? ini.slice(0, 79).trimEnd() + "…" : ini;
}

/** AS-023: outra automação (não esta) com o mesmo nome, sem diferença de acento/maiúscula; null quando não há. */
export function nomeRepetido(nome, itens, idProprio = null) {
  const n = normalizar(nome);
  if (!n) return null;
  return (Array.isArray(itens) ? itens : []).find(x => x && x.id !== idProprio && normalizar(x.nome) === n) || null;
}

/** AS-015: busca por nome (sem acento) e ordem da lista. ordem: "criacao" | "nome" | "recente" | "erros". */
export const ORDENS_AUTOMACAO = Object.freeze([["criacao", "Ordem de criação"], ["recente", "Rodou por último"], ["erros", "Com erro primeiro"], ["nome", "Nome (A–Z)"],
  ["gatilho", "Por gatilho"]]);     // plano 1500c · UCA-070
/**
 * plano 1000b · UB-044: a lista do servidor tem automação que a tela não tem (criada por outra pessoa) ou falta uma que a tela mostra
 * (excluída por outra pessoa). `ignorar` = ids no meio do «Desfazer» desta tela (o servidor ainda as tem). Sem a lista nova → false.
 */
export function listaMudou(naTela, doServidor, ignorar = null) {
  if (!Array.isArray(doServidor)) return false;
  const ign = id => !!(ignorar && typeof ignorar.has === "function" && ignorar.has(id));
  const tela = new Set((Array.isArray(naTela) ? naTela : []).map(x => x && x.id).filter(x => x != null));
  const serv = new Set(doServidor.map(x => x && x.id).filter(x => x != null));
  for (const id of serv) if (!tela.has(id) && !ign(id)) return true;
  for (const id of tela) if (!serv.has(id)) return true;
  return false;
}

// plano 1000b · UB-049: `frase(x)` (opcional, a frase descrever() pré-calculada) também entra na busca — «lembrete» acha «Confirmar consulta de amanhã»
export function listaAutomacoes(itens, { termo = "", ordem = "criacao", frase = null } = {}) {
  const t = normalizar(termo);
  // plano 1500c · UCA-093: a observação interna (quando o servidor mandar `descricao`) também entra na busca
  const casa = x => normalizar(x && x.nome).includes(t) || normalizar(x && x.descricao).includes(t) || (typeof frase === "function" && normalizar(frase(x)).includes(t));
  const l = (Array.isArray(itens) ? itens : []).filter(x => !t || casa(x));
  const quando = x => { const d = x && x.ultima_execucao_em ? Date.parse(x.ultima_execucao_em) : NaN; return Number.isFinite(d) ? d : -Infinity; };
  if (ordem === "nome") return [...l].sort((a, b) => texto(a.nome).localeCompare(texto(b.nome), "pt-BR", { sensitivity: "base" }));
  if (ordem === "recente") return [...l].sort((a, b) => quando(b) - quando(a));
  // plano 1500c · UCA-026: «Com erro primeiro» na régua do resumo (30 dias quando o servidor manda) — 5 erros de 6 meses atrás não passam na frente
  if (ordem === "erros") { const per = periodoDoResumo(itens); const er = x => (per === "30d" ? taxaSucesso(x, { periodo: per }).erros : nat(x && x.erros)); return [...l].sort((a, b) => er(b) - er(a) || quando(b) - quando(a)); }
  // plano 1500c · UCA-070: por gatilho, na ordem do catálogo (Conversas, CRM, Agenda); dentro do grupo, a ordem de criação
  if (ordem === "gatilho") { const pos = x => { const k = GATILHOS.findIndex(g => g.id === (x && x.gatilho)); return k < 0 ? 999 : k; }; return [...l].sort((a, b) => pos(a) - pos(b)); }
  return l;
}

/**
 * plano 1500c · UCA-070: a lista em grupos pelo grupo do gatilho do catálogo (Conversas, CRM, Agenda), na ordem do catálogo:
 * [{grupo, itens}]. Gatilho desconhecido vai para «Outros» no fim.
 */
export function agruparPorGatilho(itens) {
  const ordem = [...new Set(GATILHOS.map(g => g.grupo))];
  const mapa = new Map(ordem.map(g => [g, []]));
  const outros = [];
  for (const x of Array.isArray(itens) ? itens : []) {
    const g = GATILHO[x && x.gatilho];
    if (g) mapa.get(g.grupo).push(x); else outros.push(x);
  }
  const out = ordem.filter(g => mapa.get(g).length).map(g => ({ grupo: g, itens: mapa.get(g) }));
  if (outros.length) out.push({ grupo: "Outros", itens: outros });
  return out;
}

/** AS-042: passos da paleta que casam com a busca (rótulo e descrição, sem acento). */
export function acoesDaBusca(termo, vocab) {
  const t = normalizar(termo);
  return ACOES.filter(a => a.disponivel !== false && a.menu !== false)
    .filter(a => !t || normalizar(`${rotuloAcao(a.id, vocab)} ${a.descricao || ""} ${a.id.replace(/_/g, " ")}`).includes(t))
    .map(a => a.id);
}

/** AS-014: de que período são os números do topo — "30d" quando o servidor manda ok_30d/erro_30d em todas; senão "total" (desde a criação). */
export function periodoDoResumo(itens) {
  const l = Array.isArray(itens) ? itens : [];
  return l.length > 0 && l.every(it => it && it.ok_30d != null && it.erro_30d != null) ? "30d" : "total";
}

/** AS-017: onde se ajusta uma regra fixa «Do sistema» (pelo nome que o servidor manda); null quando não há o que ajustar. */
export function ajusteDaRegraSistema(nome) {
  const n = normalizar(nome);
  if (/fora do horario/.test(n)) return { href: "#/config/departamentos", rotulo: "Configurar horários" };
  if (/rodizio/.test(n)) return { href: "#/config/usuarios", rotulo: "Configurar quem recebe" };
  return null;
}

/* ================================================================== plano 1000 · lote auto-3 */

/** AS-222: o campo «valor» da condição é o valor do negócio, no vocabulário da vertical («Valor da oportunidade (R$)»). */
export function rotuloValorNegocio(vocab = null) {
  const vv = voc(vocab);
  return `Valor d${vv.art("negocio")} ${vv.min("negocio")} (R$)`;
}

const _fmtSP = new Intl.DateTimeFormat("en-GB", { timeZone: "America/Sao_Paulo", weekday: "short", hour: "2-digit", minute: "2-digit", hourCycle: "h23" });
const _DOW_SP = { Sun: 0, Mon: 1, Tue: 2, Wed: 3, Thu: 4, Fri: 5, Sat: 6 };
/** Mesma leitura do nx_horario_aberto (fuso de SP; faixa com fim antes do início passa da meia-noite; null = 24 h). */
export function abertoNoHorario(horario, t) {
  if (horario === null || horario === undefined) return true;
  const p = Object.fromEntries(_fmtSP.formatToParts(new Date(t)).map(x => [x.type, x.value]));
  return abertoLocal(horario, _DOW_SP[p.weekday], `${p.hour}:${p.minute}`);
}
/** A mesma regra do abertoNoHorario, já com o dia da semana e a hora («HH:MM») de SP calculados. */
function abertoLocal(horario, dow, hm) {
  const dia = d => { const fx = horario[d] ?? horario[String(d)]; return Array.isArray(fx) ? fx : []; };
  if (dia(dow).some(f => Array.isArray(f) && (f[1] > f[0] ? hm >= f[0] && hm < f[1] : hm >= f[0]))) return true;
  return dia((dow + 6) % 7).some(f => Array.isArray(f) && f[1] <= f[0] && hm < f[1]);
}
const _fmtOffSP = new Intl.DateTimeFormat("en-US", { timeZone: "America/Sao_Paulo", year: "numeric", month: "2-digit", day: "2-digit", hour: "2-digit", minute: "2-digit", hourCycle: "h23" });
/** Diferença (ms) entre a hora de SP e a UTC no instante t (−3 h hoje; lida do Intl, sem supor fuso fixo). */
function deslocSP(t) {
  const p = Object.fromEntries(_fmtOffSP.formatToParts(new Date(t)).map(x => [x.type, x.value]));
  const local = Date.UTC(Number(p.year), Number(p.month) - 1, Number(p.day), Number(p.hour) % 24, Number(p.minute));
  return local - Math.floor(t / 60000) * 60000;
}
/**
 * AS-224: o primeiro instante (de 5 em 5 min, até 8 dias) em que o horário está aberto, a partir de `t` (ms). null = nunca abre.
 * plano 1000b · UB-025: o deslocamento de SP é lido UMA vez e o laço faz só contas (antes eram até 2.304 Intl.formatToParts por passo);
 * o instante achado é conferido pelo caminho completo — se o fuso mudou no meio (horário de verão), cai no laço antigo a partir dali.
 */
export function proximaAbertura(horario, t) {
  if (horario === null || horario === undefined) return t;
  if (abertoNoHorario(horario, t)) return t;
  const ini = Math.ceil(t / 300000) * 300000, fim = ini + 8 * 288 * 300000;
  const desl = deslocSP(ini);
  const pad = n => String(n).padStart(2, "0");
  for (let x = ini; x < fim; x += 300000) {
    const d = new Date(x + desl);
    if (!abertoLocal(horario, d.getUTCDay(), `${pad(d.getUTCHours())}:${pad(d.getUTCMinutes())}`)) continue;
    if (abertoNoHorario(horario, x)) return x;
    for (let y = x; y < fim; y += 300000) if (abertoNoHorario(horario, y)) return y;     // o fuso mudou: caminho completo
    return null;
  }
  // nenhuma faixa pelas contas: confirma só nas viradas de fuso possíveis (raro); sem faixa nenhuma no horário, nem isso
  const temFaixa = Object.values(horario || {}).some(fx => Array.isArray(fx) && fx.some(f => Array.isArray(f)));
  if (temFaixa && deslocSP(fim) !== desl) for (let y = ini; y < fim; y += 300000) if (abertoNoHorario(horario, y)) return y;
  return null;
}

const _fmtCurto = new Intl.DateTimeFormat("pt-BR", { timeZone: "America/Sao_Paulo", weekday: "short", day: "2-digit", month: "2-digit", hour: "2-digit", minute: "2-digit", hourCycle: "h23" });
/** «qui., 16/10 às 10:00» (fuso de SP). */
export function dataHoraCurtaSP(t) {
  const p = Object.fromEntries(_fmtCurto.formatToParts(new Date(t)).map(x => [x.type, x.value]));
  return `${String(p.weekday || "").replace(/\.$/, "")}, ${p.day}/${p.month} às ${p.hour}:${p.minute}`;
}
/** AS-223: «Exemplo: se começar agora, continua qui, 16/10 às 10:00.» para o passo «Esperar». */
export function exemploContinuacao(minutos, agora = Date.now()) {
  const m = inteiro(minutos);
  if (!m || m <= 0) return "";
  const t = (agora instanceof Date ? agora.getTime() : Number(agora)) + m * 60000;
  return `Exemplo: se começar agora, continua ${dataHoraCurtaSP(t)}.`;
}

/** AS-284: com qual palavra-chave a frase casa (a mesma regra do servidor: minúsculas, sem acento, trecho contido). null = nenhuma. */
// plano 1500c · UCA-047: {inteira: true} exige a palavra inteira («sim» não casa em «assim»); {inteira: "curtas"} só nas de até 4 letras.
// O padrão continua o do servidor de hoje (trecho contido) — a opção entra na tela quando o motor aceitar (pendência do servidor).
export function casaPalavras(frase, palavras, { inteira = false } = {}) {
  const f = normalizar(frase);
  if (!f) return null;
  const esc = s => s.replace(/[.*+?^${}()|[\]\\]/g, "\\$&");
  for (const w of Array.isArray(palavras) ? palavras : []) {
    const n = normalizar(w);
    if (!n) continue;
    const exigir = inteira === true || (inteira === "curtas" && n.replace(/[^a-z0-9]/g, "").length <= 4);
    if (exigir ? new RegExp(`(^|[^a-z0-9])${esc(n)}($|[^a-z0-9])`).test(f) : f.includes(n)) return String(w).trim();
  }
  return null;
}

/** AS-270: o que sairia AGORA na simulação (passos «Faria»), por tipo → {mensagens, tarefas, outros, texto}. */
export function resumoSaidasSimulacao(sim) {
  const r = { mensagens: 0, tarefas: 0, outros: 0 };
  for (const a of (sim && Array.isArray(sim.alvos) ? sim.alvos : [])) {
    if (a.ignorado) continue;
    for (const p of a.passos || []) {
      if (p.estado !== "faria") continue;
      if (p.tipo && (ACAO[p.tipo] || {}).mensagem) r.mensagens++;
      else if (p.tipo === "criar_tarefa") r.tarefas++;
      else r.outros++;
    }
  }
  const partes = [];
  if (r.mensagens) partes.push(`${r.mensagens} ${r.mensagens === 1 ? "mensagem de WhatsApp" : "mensagens de WhatsApp"}`);
  if (r.tarefas) partes.push(`${r.tarefas} ${r.tarefas === 1 ? "tarefa" : "tarefas"}`);
  if (r.outros) partes.push(`${r.outros} ${r.outros === 1 ? "outro passo" : "outros passos"}`);
  const mostrados = sim && sim.alvos ? sim.alvos.length : 0;
  const parcial = sim && !sim.ehAmostra && sim.total > mostrados ? ` (nos ${mostrados} mostrados)` : "";
  r.texto = partes.length ? `Agora sairiam: ${partes.join(", ").replace(/, ([^,]*)$/, " e $1")}${parcial}.` : "";
  return r;
}

/** AS-298: erro comum de execução/simulação → o que fazer (e para onde ir). null quando não reconhece. */
export function dicaDoErro(texto) {
  const t = normalizar(texto);
  if (!t) return null;
  const regras = [
    [/hora d[ao] (consulta|avaliacao|servico|visita)|sem a hora|so a data/, "Abra o registro e preencha a data e a hora; depois ele entra sozinho na próxima rodada.", null, null],
    [/modelo|template/, "Escolha um modelo aprovado pela Meta no passo «Enviar modelo» (ou sincronize os modelos do número).", "#/config/numeros", "Ver os números"],
    [/sem (numero|canal)|numero (desconectado|caiu)|canal (desconectado|inativo)|nenhum numero|aparelho/, "Confira o número de WhatsApp: ele precisa estar conectado para a mensagem sair.", "#/config/numeros", "Ver os números"],
    [/telefone|sem whatsapp|numero invalido/, "O contato está sem telefone válido: corrija o cadastro e a próxima execução sai.", null, null],
    [/cota|limite.*ia|ia.*limite/, "A cota de IA do mês acabou: veja o uso em Plano e uso.", "#/config/plano", "Plano e uso"],
    [/fora do horario/, "A mensagem esperou o horário de atendimento. Ajuste os horários se precisar.", "#/config/departamentos", "Horários"],
    [/janela|24 ?h/, "Fora da janela de 24 h da Meta só sai modelo aprovado: troque o passo por «Enviar modelo».", null, null],
    [/etapa .*nao existe|etiqueta .*nao existe|nao existe mais/, "Algo escolhido no passo foi apagado: abra a automação e escolha de novo.", null, null],
  ];
  for (const [re, dica, href, rotulo] of regras) if (re.test(t)) return { dica, href, rotulo };
  return null;
}

/** AS-228: «Peça a Bruno Reis ou Ana Lima (administradores).» a partir de base.usuarios. */
export function frasePedirAdmin(usuarios) {
  const admins = (Array.isArray(usuarios) ? usuarios : []).filter(u => u && u.papel === "admin" && u.nome).map(u => String(u.nome).trim()).slice(0, 3);
  if (!admins.length) return "Peça a um administrador da sua empresa.";
  const lista = admins.length === 1 ? admins[0] : `${admins.slice(0, -1).join(", ")} ou ${admins[admins.length - 1]}`;
  return `Peça a ${lista} (${admins.length === 1 ? "administrador" : "administradores"} da empresa).`;
}

/** AS-232: há número da Meta? true/false quando os canais dizem o provedor; sem essa informação, os modelos (só da Meta) contam; senão null. */
export function temCanalMeta(base) {
  const cs = (base && Array.isArray(base.canais)) ? base.canais : [];
  if (cs.some(c => c && c.provedor)) return cs.some(c => c && c.provedor && c.provedor !== "codewords");
  if (base && Array.isArray(base.templates) && base.templates.length) return true;
  return null;
}

/** AS-230: o resumo do fluxo (recolhido no celular): «Etapa X → 3 passos (1 espera)». */
export function resumoFluxo(auto, base, vocab) {
  const a = auto || {};
  const nos = nosDoDiagrama(a, base, vocab);
  const g = nos.find(x => x.tipo === "gatilho");
  const acoes = Array.isArray(a.acoes) ? a.acoes : [];
  const esperas = acoes.filter(x => x && x.tipo === "esperar").length;
  const nc = (a.condicoes || []).length;
  const passos = acoes.length ? `${acoes.length} ${acoes.length === 1 ? "passo" : "passos"}${esperas ? ` (${esperas} ${esperas === 1 ? "espera" : "esperas"})` : ""}` : "nenhum passo ainda";
  const quando = g && g.sub ? g.sub : g ? g.rotulo : "";
  return `${quando ? `${cortar(quando, 48)} → ` : ""}${nc ? `${nc} ${nc === 1 ? "condição" : "condições"} → ` : ""}${passos}`;
}
/** AS-227: o dia (AAAA-MM-DD, fuso de SP) de uma execução — o mesmo dia das barras do gráfico. */
export const diaDaExecucao = x => (x ? diaSP(x.criado_em) : null);

/** AS-229: os comandos da paleta por automação (até 40): «Ligar/Desligar «X»» (quem edita) e «Abrir automação «X»». */
export function comandosDasAutomacoes(itens, { podeEditar = false, max = 40 } = {}) {
  const out = [];
  // plano 1000b · UB-063: acima de `max`, entram as que rodaram por último (não as primeiras da ordem de criação)
  const quando = x => { const d = x && x.ultima_execucao_em ? Date.parse(x.ultima_execucao_em) : NaN; return Number.isFinite(d) ? d : -Infinity; };
  const todas = Array.isArray(itens) ? itens : [];
  const escolhidas = todas.length > max ? [...todas].sort((a, b) => quando(b) - quando(a)).slice(0, max) : todas;
  for (const it of escolhidas) {
    if (!it || it.id == null || !it.nome) continue;
    const nome = cortar(it.nome, 60);
    // `ligar` guarda o estado PEDIDO (o rótulo pode ficar velho se a lista mudar depois): quem executa só alterna se ainda não estiver assim
    if (podeEditar) out.push({ id: `automacoes.alternar.${it.id}`, automacao: it.id, acao: "alternar", icone: "raio", ligar: !it.ativo, nome,
      rotulo: `${it.ativo ? "Desligar" : "Ligar"} a automação «${nome}»`, palavras: `ligar desligar automacao ${normalizar(it.nome)}` });
    out.push({ id: `automacoes.abrir.${it.id}`, automacao: it.id, acao: "abrir", icone: "editar",
      rotulo: `Abrir a automação «${nome}»`, palavras: `abrir editar automacao ${normalizar(it.nome)}` });
  }
  return out;
}

/* ================================================================== plano 1000b · lote auto-2 */

/**
 * plano 1000b · UB-043: nome da cópia sem «(cópia) (cópia)» — «X» → «X (cópia)»; «X (cópia)» → «X (cópia 2)»; «X (cópia 2)» → «X (cópia 3)»,
 * pulando os nomes que já existem (`existentes`: lista de nomes). Até 80 letras (o corte é na base, o sufixo fica inteiro).
 */
export function nomeDaCopia(nome, existentes = []) {
  const usados = new Set((Array.isArray(existentes) ? existentes : []).map(n => normalizar(n)));
  const m = /^(.*?)\s*\(cópia(?:\s+(\d+))?\)$/i.exec(texto(nome).trim());
  const base = (m ? m[1] : texto(nome).trim()) || "Automação";
  let n = m ? (Number(m[2]) || 1) + 1 : 1;
  const montar = k => { const suf = k === 1 ? " (cópia)" : ` (cópia ${k})`; return `${base.slice(0, 80 - suf.length).trimEnd()}${suf}`; };
  while (usados.has(normalizar(montar(n))) && n < 999) n++;
  return montar(n);
}

/**
 * plano 1000b · UB-249: o que um rascunho guardado tem de diferente do que está salvo — «o nome, 2 passos e 1 condição mudaram».
 * "" quando nada que a pessoa reconheça mudou.
 */
export function resumoDiferencas(guardado, atual) {
  const a = guardado || {}, b = atual || {};
  const j = x => JSON.stringify(x === undefined ? null : x);
  const partes = [];
  if (texto(a.nome).trim() !== texto(b.nome).trim()) partes.push("o nome");
  if (a.gatilho !== b.gatilho || j(a.config || {}) !== j(b.config || {})) partes.push("o gatilho");
  const contaDif = (x, y) => { const l1 = Array.isArray(x) ? x : [], l2 = Array.isArray(y) ? y : []; let n = 0; for (let i = 0; i < Math.max(l1.length, l2.length); i++) if (j(l1[i]) !== j(l2[i])) n++; return n; };
  const np = contaDif(a.acoes, b.acoes), nc = contaDif(a.condicoes, b.condicoes);
  if (np) partes.push(`${np} ${np === 1 ? "passo" : "passos"}`);
  if (nc) partes.push(`${nc} ${nc === 1 ? "condição" : "condições"}`);
  if (!!a.ativo !== !!b.ativo) partes.push("ligada/desligada");
  if (!!a.respeitar_horario !== !!b.respeitar_horario) partes.push("o horário de funcionamento");
  if (!partes.length) return "";
  const umSo = partes.length === 1 && !/^([2-9]|\d{2,})/.test(partes[0]);
  return `${listaFrase(partes)} ${umSo ? "mudou" : "mudaram"}`;
}

/**
 * plano 1000b · UB-031: por onde sai o «Enviar mensagem» (texto livre), pelos provedores dos números — complemento do tile da paleta.
 * "" quando não se sabe (sem números ou sem o provedor).
 */
export function viaTextoLivre(canais) {
  const l = Array.isArray(canais) ? canais : [];
  const p = new Set(l.map(c => c && c.provedor).filter(Boolean));
  if (!l.length || !p.size) return "";
  if (p.has("codewords") && p.has("meta")) return "Sai pelo número conectado por aparelho (CodeWords); no número oficial (Meta), só até 24 h da última mensagem do cliente.";
  if (p.has("codewords")) return "Sai pelo número conectado por aparelho (CodeWords), a qualquer hora.";
  if (p.has("meta")) return "No número oficial (Meta), só sai até 24 h da última mensagem do cliente; fora disso, use um modelo aprovado.";
  return "";
}

/**
 * plano 1000b · UB-029: o rótulo dos campos de tempo em horas que o editor deixa escrever em horas OU dias («Tempo parado na etapa»
 * com «2 dias» — não «Horas parado na etapa»). O catálogo fica igual (o servidor usa o rótulo dele nas mensagens com o número em horas).
 */
export function rotuloCampoTempo(rotulo) {
  return { "Horas parado na etapa": "Tempo parado na etapa", "Quantas horas antes": "Quanto tempo antes", "Quantas horas depois": "Quanto tempo depois" }[rotulo] || rotulo;
}

/** plano 1000b · UB-064: palavras-chave curtas demais (menos de 3 letras sem acento): «oi» casa com quase toda mensagem. */
export function palavrasCurtas(palavras) {
  return (Array.isArray(palavras) ? palavras : []).map(w => texto(w).trim()).filter(w => w && normalizar(w).replace(/[^a-z0-9]/g, "").length < 3);
}

/* ================================================================== plano 1500c · frente auto */

const FATOR_UNIDADE = { min: 1, horas: 60, dias: 1440 };
/**
 * plano 1500c · UCA-038: trocar a unidade mantém o TEMPO (48 horas → 2 dias) quando dá número inteiro; senão null (o campo mantém o
 * número e avisa). n vem do campo (aceita «1,5»).
 */
export function converterUnidade(n, de, para) {
  const x = numeroBR(n);
  if (x == null || x <= 0 || !FATOR_UNIDADE[de] || !FATOR_UNIDADE[para]) return null;
  const y = (x * FATOR_UNIDADE[de]) / FATOR_UNIDADE[para];
  return Number.isInteger(Math.round(y * 1e6) / 1e6) ? Math.round(y) : null;
}

/** plano 1500c · UCA-039: «= 4 h» · «= 7 dias (168 h)» · «= 1 h 30 min» — o resumo dos campos de tempo, legível. */
export function resumoTempo(minutos) {
  const m = Math.round(Number(minutos) || 0);
  if (m <= 0) return "";
  if (m >= 2880 && m % 1440 === 0) return `= ${formatarDuracao(m)} (${m / 60} h)`;
  return `= ${formatarDuracao(m)}`;
}

/** plano 1500c · UCA-041: duplica o passo i logo abaixo (cópia profunda). No limite de passos (ou de esperas), devolve a lista igual. */
export function duplicarPasso(acoes, i) {
  const l = Array.isArray(acoes) ? acoes.slice() : [];
  if (!Number.isInteger(i) || i < 0 || i >= l.length || l.length >= LIMITES.acoes) return l;
  if (l[i] && l[i].tipo === "esperar" && l.filter(x => x && x.tipo === "esperar").length >= LIMITES.esperas) return l;
  l.splice(i + 1, 0, copia(l[i]));
  return l;
}

/** plano 1500c · UCA-054: filtra as execuções por situação, dia (AAAA-MM-DD de SP) e passo (número do passo em que pararam). */
export function filtrarExecucoes(lista, { situacao = null, dia = null, passo = null } = {}) {
  const p = passo == null || passo === "" ? null : inteiro(passo);
  return (Array.isArray(lista) ? lista : []).filter(x => {
    if (!x) return false;
    if (situacao && situacao !== "todas" && situacaoExecucao(x) !== situacao) return false;
    if (dia && diaDaExecucao(x) !== dia) return false;
    if (p != null && inteiro(x.passo ?? x.acao_indice) !== p) return false;
    return true;
  });
}

/** plano 1500c · UCA-054: os passos que aparecem nas execuções carregadas, para o seletor «Passo»: [{valor, rotulo}] em ordem. */
export function passosDasExecucoes(lista, auto = null, vocab = null) {
  const ns = [...new Set((Array.isArray(lista) ? lista : []).map(x => x && inteiro(x.passo ?? x.acao_indice)).filter(n => n != null && n > 0))].sort((a, b) => a - b);
  const acoes = (auto && Array.isArray(auto.acoes)) ? auto.acoes : [];
  return ns.map(n => ({ valor: String(n), rotulo: acoes[n - 1] && ACAO[acoes[n - 1].tipo] ? `Passo ${n} · ${rotuloAcao(acoes[n - 1].tipo, vocab)}` : `Passo ${n}` }));
}

const _fmtCsvSP = new Intl.DateTimeFormat("pt-BR", { timeZone: "America/Sao_Paulo", day: "2-digit", month: "2-digit", year: "numeric", hour: "2-digit", minute: "2-digit", hourCycle: "h23" });
const _NL = String.fromCharCode(13, 10);
const _ACENTOS = new RegExp(`[${String.fromCharCode(0x300)}-${String.fromCharCode(0x36f)}]`, "g");
/** plano 1500c · UCA-035: nome de arquivo seguro a partir do nome da automação («Lembrete de Consulta!» → «lembrete-de-consulta»). */
export function nomeArquivo(nome) {
  return String(nome || "automacao").normalize("NFD").replace(_ACENTOS, "").replace(/[^A-Za-z0-9]+/g, "-").replace(/^-|-$/g, "").toLowerCase().slice(0, 40) || "automacao";
}
/**
 * plano 1500c · UCA-034: as execuções em CSV para o Excel brasileiro: separador «;», BOM, aspas escapadas, datas em São Paulo e
 * célula que começa com = + - @ protegida (não vira fórmula). Colunas: Data;Hora;Situação;Passo;Contato;<Negócio>;O que aconteceu.
 */
export function execucoesParaCSV(lista, { vocab = null } = {}) {
  const vv = voc(vocab);
  const cel = v => {
    let s = texto(v).replace(/\r?\n/g, " ").trim();
    if (/^[=+\-@]/.test(s)) s = `'${s}`;
    return /[;"]/.test(s) ? `"${s.replace(/"/g, '""')}"` : s;
  };
  const rot = Object.fromEntries(SITUACOES_EXECUCAO);
  const linhas = [["Data", "Hora", "Situação", "Passo", vv.v.contato, vv.v.negocio, "O que aconteceu"].map(cel).join(";")];
  for (const x of Array.isArray(lista) ? lista : []) {
    if (!x) continue;
    const d = x.criado_em ? new Date(x.criado_em) : null;
    let data = "", hora = "";
    if (d && !isNaN(d)) {
      const p = Object.fromEntries(_fmtCsvSP.formatToParts(d).map(y => [y.type, y.value]));
      data = `${p.day}/${p.month}/${p.year}`; hora = `${p.hour}:${p.minute}`;
    }
    const sit = situacaoExecucao(x);
    const oque = [estadoExecucaoTexto(x), texto(x.detalhe).trim()].filter(Boolean).join(" · ");
    linhas.push([data, hora, rot[sit] || sit, passoDaExecucao(x), x.contato_nome || "", x.negocio_titulo || "", oque].map(cel).join(";"));
  }
  return String.fromCharCode(0xFEFF) + linhas.join(_NL) + _NL;
}

/**
 * plano 1500c · UCA-057: simulação de DEMONSTRAÇÃO (empresa sem registros): dois alvos fictícios com o mesmo formato de normalizarSimulacao,
 * as mensagens já com as variáveis trocadas e `ehExemplo: true` (a tela mostra o selo «Exemplo fictício»).
 */
export function simulacaoDemonstracao(auto, base, vocab, { agora = new Date() } = {}) {
  const a = auto || {};
  const ix = indexarBase(base);
  const vv = voc(vocab);
  const acoes = Array.isArray(a.acoes) ? a.acoes : [];
  const tl = linhaDoTempo(acoes);
  const pessoas = ["Maria Souza", "João Lima"];
  const alvos = pessoas.map((nome, k) => {
    const dados = Object.assign(exemploVariaveis({ agora, base }), { nome });
    let parou = false;
    const passos = acoes.slice(0, 12).map((ac, i) => {
      const tipo = ac && ACAO[ac.tipo] ? ac.tipo : null;
      let rotulo = fraseAcao(ac, ix, vv) || "(passo incompleto)";
      if (tipo === "enviar_mensagem") rotulo = `Enviar: «${cortar(aplicarVariaveis(ac.texto, dados), 180)}»`;
      if (tipo === "enviar_template") { const t = ix.templates.get(ac.template_id); if (t && t.corpo) rotulo = `Enviar o modelo: «${cortar(previaModelo(t.corpo, ac.parametros, dados), 180)}»`; }
      if (["criar_tarefa", "nota", "notificar"].includes(tipo)) rotulo = aplicarVariaveis(rotulo, dados);
      const estado = parou || tl[i].inalcancavel ? "pularia" : tipo === "esperar" ? "espera" : "faria";
      if (tipo === "parar") parou = true;
      return { rotulo: cortar(rotulo, 200), estado, motivo: "", quando: tl[i].antes > 0 ? `depois de ${formatarDuracao(tl[i].antes)}` : "", tipo };
    });
    return { id: `exemplo-${k + 1}`, titulo: nome, detalhe: `${vv.v.negocio} de exemplo`, link: null, ignorado: false, motivoIgnorado: "", erro: "", parou: false,
      passos, passosOcultos: Math.max(0, acoes.length - 12) };
  });
  return { total: alvos.length, alvos, avisos: [], ehAmostra: true, motivo: "", porEvento: false, plano: passosEmFrases(a, base, vocab), ehExemplo: true };
}

/**
 * plano 1500c · UCA-058: a receita certa para a primeira automação a partir de 3 escolhas.
 * respostas = {objetivo: "lead"|"lembrar"|"pos_venda", canal: "texto"|"meta", quem: "cliente"|"equipe"}. Devolve o id da receita.
 */
export function receitaSugerida(respostas, vertical = "generico") {
  const r = respostas || {};
  const visiveis = new Set(modelosDaVertical(vertical).map(m => m.id));
  const ok = id => (visiveis.has(id) ? id : null);
  let id = null;
  if (r.objetivo === "lembrar") id = r.quem === "equipe" ? ok("lembrete_equipe_consulta") : r.canal === "meta" ? ok("lembrete_consulta") : ok("lembrete_consulta_texto");
  else if (r.objetivo === "pos_venda") id = r.quem === "equipe" ? ok("pos_venda") : (vertical === "odonto" || vertical === "oficina") ? ok("pos_atendimento") : ok("agradecer_indicar");
  else if (r.objetivo === "lead") id = r.quem === "cliente" ? ok("boas_vindas") : ok("lead_anuncio");
  return id || (modelosDaVertical(vertical)[0] || {}).id || null;
}

/** plano 1500c · UCA-058: as perguntas do assistente da primeira automação (texto curto, celular primeiro). */
export const PERGUNTAS_PRIMEIRA = Object.freeze([
  { id: "objetivo", pergunta: "O que você quer resolver primeiro?", opcoes: [["lead", "Não perder cliente novo"], ["lembrar", "Lembrar do horário marcado"], ["pos_venda", "Cuidar do pós-venda"]] },
  { id: "quem", pergunta: "Quem recebe?", opcoes: [["cliente", "O cliente, no WhatsApp"], ["equipe", "A minha equipe, no sistema"]] },
  { id: "canal", pergunta: "Seu WhatsApp é…", opcoes: [["texto", "Conectado por aparelho"], ["meta", "O oficial da Meta"]] },
]);

/** plano 1500c · UCA-087: o funil que o gatilho define (pelo funil escolhido ou pela etapa) — null quando o gatilho vale para todos. */
export function funilDoGatilho(auto, base) {
  const c = (auto && auto.config) || {};
  if (!vazio(c.funil_id)) return c.funil_id;
  const e = c.estagio_id ? indexarBase(base).estagios.get(c.estagio_id) : null;
  return e ? e.funil_id : null;
}

/** plano 1500c · UCA-087: «essa etapa é do funil X; use Mover de funil» quando o «Mover de etapa» aponta para outro funil. null quando está certo. */
export function avisoEtapaOutroFunil(auto, ac, base) {
  if (!ac || ac.tipo !== "mover_estagio" || !ac.estagio_id) return null;
  const f = funilDoGatilho(auto, base);
  const e = indexarBase(base).estagios.get(ac.estagio_id);
  if (!f || !e || e.funil_id === f) return null;
  return `Essa etapa é do funil «${e.funil_nome}»; para trocar de funil, use «Mover de funil».`;
}

/**
 * plano 1500c · UCA-088: outras automações LIGADAS com o mesmo gatilho (e filtros que se cruzam) que também mandam mensagem — o cliente
 * receberia duas mensagens seguidas. [{id, nome}]
 */
export function automacoesConcorrentes(auto, itens) {
  const a = auto || {};
  if (!a.gatilho || !enviaMensagem(a)) return [];
  const c = a.config || {};
  const UNICOS = ["estagio_id", "funil_id", "canal_id", "departamento_id", "etiqueta_id", "campo", "horas", "horario", "minutos", "tipo_tarefa", "dono_id"];
  const cruza = o => {
    const d = o.config || {};
    for (const k of UNICOS) if (!vazio(c[k]) && !vazio(d[k]) && String(c[k]) !== String(d[k])) return false;
    const p1 = palavrasUnicas(c.palavras).map(normalizar), p2 = palavrasUnicas(d.palavras).map(normalizar);
    if (p1.length && p2.length && !p1.some(w => p2.includes(w))) return false;
    if (Array.isArray(c.dias_semana) && Array.isArray(d.dias_semana) && !normalizarDias(c.dias_semana).some(x => normalizarDias(d.dias_semana).includes(x))) return false;
    return true;
  };
  return (Array.isArray(itens) ? itens : [])
    .filter(o => o && o.ativo && !(a.id && o.id === a.id) && o.gatilho === a.gatilho && enviaMensagem(o) && cruza(o))
    .map(o => ({ id: o.id, nome: texto(o.nome) || "Automação sem nome" }));
}

/**
 * plano 1500c · UCA-092: pilha de desfazer/refazer do editor. empilhar(estado) guarda uma cópia (igual ao topo não entra; o refazer
 * some); desfazer() volta ao estado anterior; refazer() avança. Até `limite` estados.
 */
export function historicoEdicao(limite = 30) {
  const passado = [], futuro = [];
  const j = x => JSON.stringify(x);
  return {
    empilhar(estado) {
      if (passado.length && j(passado[passado.length - 1]) === j(estado)) return false;
      passado.push(copia(estado));
      while (passado.length > limite) passado.shift();
      futuro.length = 0;
      return true;
    },
    desfazer() { if (passado.length < 2) return null; futuro.push(passado.pop()); return copia(passado[passado.length - 1]); },
    refazer() { if (!futuro.length) return null; const x = futuro.pop(); passado.push(x); return copia(x); },
    podeDesfazer: () => passado.length > 1,
    podeRefazer: () => futuro.length > 0,
    get tamanho() { return passado.length; },
  };
}

/**
 * plano 1500c · UCA-099: o texto com a formatação do WhatsApp em pedaços, sem HTML: [{t, estilo}] — estilo null | "negrito" (*x*) |
 * "italico" (_x_) | "riscado" (~x~) | "mono" (```x```). Marca solta («5 * 3») ou colada em palavra não vira estilo.
 */
export function partesWhatsApp(txt) {
  const s = texto(txt);
  const out = [];
  const push = (t, estilo) => { if (!t) return; const u = out[out.length - 1]; if (u && u.estilo === estilo) u.t += t; else out.push({ t, estilo }); };
  const re = /```([^`]+?)```|([*_~])([^\s*_~](?:[^\n]*?[^\s])?)\2/gu;
  const EST = { "*": "negrito", _: "italico", "~": "riscado" };
  const letra = ch => !!ch && /[\p{L}\p{N}]/u.test(ch);
  let i = 0, m;
  while ((m = re.exec(s))) {
    const ini = m.index, fim = ini + m[0].length;
    if (letra(s[ini - 1]) || letra(s[fim])) { re.lastIndex = ini + 1; continue; }
    push(s.slice(i, ini), null);
    push(m[1] != null ? m[1] : m[3], m[1] != null ? "mono" : EST[m[2]]);
    i = fim;
  }
  push(s.slice(i), null);
  return out;
}

/* plano 1500c · UCA-103: exportar/importar uma automação entre empresas, pelos NOMES (os ids mudam de uma empresa para outra) */
const CAMPOS_ID = { estagio_id: "estagios", funil_id: "funis", etiqueta_id: "etiquetas", canal_id: "canais", departamento_id: "departamentos",
  dono_id: "usuarios", conta_id: "usuarios", template_id: "templates" };
const CAMPOS_ID_COND = { estagio_id: "estagios", funil_id: "funis", etiqueta: "etiquetas", canal_id: "canais", departamento_id: "departamentos", dono_id: "usuarios" };
const ROTULO_TIPO_ID = { estagios: "a etapa", funis: "o funil", etiquetas: "a etiqueta", canais: "o número", departamentos: "o departamento", usuarios: "a pessoa", templates: "o modelo" };

export function exportarAutomacao(auto, base) {
  const ix = indexarBase(base);
  const l = limpar(Object.assign({}, auto || {}, { ativo: false }));
  delete l.id;
  const ref = (tipo, id) => {
    const x = ix[tipo] && ix[tipo].get(id);
    if (!x) return null;
    const r = { $tipo: tipo, $nome: tipo === "templates" ? x.nome : (x.nome || x.numero_exibicao || x.rotulo) };
    if (tipo === "estagios" && x.funil_nome) r.$funil = x.funil_nome;
    return r;
  };
  const trocar = (obj, mapa) => { for (const [k, tipo] of Object.entries(mapa)) if (ehUuid(obj[k])) { const r = ref(tipo, obj[k]); obj[k] = r || null; } };
  trocar(l.config, CAMPOS_ID);
  for (const cd of l.condicoes) if (CAMPOS_ID_COND[cd.campo] && ehUuid(cd.valor)) cd.valor = ref(CAMPOS_ID_COND[cd.campo], cd.valor);
  for (const ac of l.acoes) {
    trocar(ac, CAMPOS_ID);
    if (ehUuid(ac.dono)) ac.dono = ref("usuarios", ac.dono);
    if (ehUuid(ac.para)) ac.para = ref("usuarios", ac.para);
  }
  return { formato: "orbita-automacao", versao: 1, auto: l };
}

/** Importa o que exportarAutomacao gerou (objeto ou texto JSON): {auto, pendencias:[frases]} — nasce desligada; o que não existe aqui fica para escolher. */
export function importarAutomacao(json, base) {
  let src = json;
  if (typeof src === "string") { try { src = JSON.parse(src); } catch { return { auto: null, pendencias: ["o texto colado não é uma automação exportada"] }; } }
  if (!src || src.formato !== "orbita-automacao" || !src.auto || typeof src.auto !== "object") return { auto: null, pendencias: ["o texto colado não é uma automação exportada"] };
  const b = base || {};
  const listas = { funis: b.funis || [], etiquetas: b.etiquetas || [], usuarios: b.usuarios || [], departamentos: b.departamentos || [], canais: b.canais || [], templates: b.templates || [] };
  const pendencias = [];
  const resolver = r => {
    if (!r || typeof r !== "object" || !r.$tipo) return r;
    const n = normalizar(r.$nome);
    let x = null;
    if (r.$tipo === "estagios") {
      for (const f of listas.funis) for (const e of f.estagios || []) if (!x && normalizar(e.nome) === n && (!r.$funil || normalizar(f.nome) === normalizar(r.$funil))) x = e;
      if (!x) for (const f of listas.funis) for (const e of f.estagios || []) if (!x && normalizar(e.nome) === n) x = e;
    } else x = (listas[r.$tipo] || []).find(y => normalizar(y.nome || y.numero_exibicao) === n);
    if (!x) { pendencias.push(`${ROTULO_TIPO_ID[r.$tipo] || "o item"} «${texto(r.$nome)}»${r.$funil ? ` (funil «${r.$funil}»)` : ""} não existe aqui: escolha no editor`); return undefined; }
    return x.id;
  };
  const a = copia(src.auto);
  const aplicar = (obj, chaves) => { for (const k of chaves) if (obj[k] && typeof obj[k] === "object") { const v = resolver(obj[k]); if (v === undefined) delete obj[k]; else obj[k] = v; } else if (obj[k] === null) delete obj[k]; };
  a.config = a.config && typeof a.config === "object" ? a.config : {};
  aplicar(a.config, Object.keys(CAMPOS_ID));
  a.condicoes = (Array.isArray(a.condicoes) ? a.condicoes : []).map(cd => {
    if (cd && cd.valor && typeof cd.valor === "object") { const v = resolver(cd.valor); return { ...cd, valor: v === undefined ? "" : v }; }
    return cd;
  });
  a.acoes = (Array.isArray(a.acoes) ? a.acoes : []).map(ac => {
    const x = Object.assign({}, ac);
    aplicar(x, [...Object.keys(CAMPOS_ID), "dono", "para"]);
    return x;
  });
  delete a.id;
  a.ativo = false;
  return { auto: a, pendencias };
}

/**
 * plano 1500c · UCA-105: tempo poupado em 30 dias pelas mensagens (e tarefas, quando o servidor mandar) que a equipe não precisou fazer.
 * {minutos, texto: «6 h»} ou null quando o servidor não manda mensagens_30d (o KPI some).
 */
export function tempoEconomizado(itens, { minutosPorMensagem = 2, minutosPorTarefa = 1 } = {}) {
  const l = Array.isArray(itens) ? itens : [];
  if (!l.some(x => x && x.mensagens_30d != null)) return null;
  const min = l.reduce((s, x) => s + nat(x && x.mensagens_30d) * minutosPorMensagem + nat(x && x.tarefas_30d) * minutosPorTarefa, 0);
  if (!min) return null;
  return { minutos: min, texto: min < 60 ? `${min} min` : `${Math.round(min / 60)} h` };
}

/** plano 1500c · UCA-106: a frase + o passo a passo em texto simples, para mandar ao cliente aprovar. */
export function textoParaCompartilhar(auto, base, vocab) {
  const passos = passosEmFrases(auto, base, vocab).filter(p => !p.inalcancavel);
  const nl = String.fromCharCode(10);
  const linhas = [`${texto(auto && auto.nome).trim() || "Automação"}`, descrever(auto, base, vocab)];
  if (passos.length) linhas.push("", "Passo a passo:", ...passos.map((p, k) => `${k + 1}. ${p.quando}: ${p.frase}`));
  return linhas.join(nl);
}

/** plano 1500c · UCA-113: média e pico por dia de uma série (números ou pontos {total}): {media, pico, texto} ou null sem dados. */
export function estimativaDiaria(serie, { unidade = "mensagens" } = {}) {
  const l = (Array.isArray(serie) ? serie : []).map(p => (typeof p === "number" ? p : nat(p && p.total))).filter(n => Number.isFinite(n));
  if (!l.length) return null;
  const media = Math.round(l.reduce((s, n) => s + n, 0) / l.length);
  const pico = Math.max(...l);
  if (!pico) return { media: 0, pico: 0, texto: "" };
  return { media, pico, texto: `cerca de ${media} ${unidade} por dia (pico de ${pico})` };
}
