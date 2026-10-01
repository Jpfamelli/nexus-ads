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
  const x = Number(n);
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
  const corrido = d.length >= 3 && d.every((x, i) => i === 0 || x === d[i - 1] + 1);
  if (corrido) return `de ${nome(d[0])} a ${nome(d[d.length - 1])}`;
  if (d.length === 1) return `toda ${nome(d[0])}`.replace("toda sábado", "todo sábado").replace("toda domingo", "todo domingo");
  const fem = d.filter(x => x >= 1 && x <= 5).map(x => `${nome(x)}s`);
  const masc = d.filter(x => x === 0 || x === 6).map(x => `${nome(x)}s`);
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
export function indexarBase(base) {
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
      const p = (c.palavras || []).map(x => texto(x).trim()).filter(Boolean);
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
      if (intFaixa(c.horas, LIMITES.tempo_no_estagio) == null) return "o tempo na etapa vai de 1 a 2160 horas";
      return null;
    case "etiqueta_adicionada":
      if (vazio(c.etiqueta_id)) return "escolha a etiqueta em «Quando»";
      if (!idOk(ix, "etiquetas", c.etiqueta_id)) return "a etiqueta escolhida em «Quando» não existe mais";
      return null;
    case "sem_resposta":
      if (intFaixa(c.minutos, LIMITES.sem_resposta) == null) return "o tempo sem resposta vai de 5 a 1440 minutos";
      if (!opcionalOk("departamentos", c.departamento_id)) return "o departamento escolhido em «Quando» não existe mais";
      return null;
    case "tarefa_vencida":
      return null;
    case "antes_da_data":
      if (!["consulta", "previsao_fechamento"].includes(c.campo)) return "escolha a data em «Quando»";
      if (intFaixa(c.horas, LIMITES.antes_da_data) == null) return "a antecedência vai de 1 a 72 horas";
      if (!opcionalOk("funis", c.funil_id)) return "o funil escolhido em «Quando» não existe mais";
      return null;
    case "apos_data":
      if (!["consulta", "previsao_fechamento"].includes(c.campo)) return "escolha a data em «Quando»";
      if (intFaixa(c.horas, LIMITES.apos_data) == null) return "o tempo depois da data vai de 1 a 720 horas";
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
  if (op.semValor) return null;
  if (vazio(cd.valor)) return `condição ${n}: preencha o valor`;
  if (tipo === "numero" && !Number.isFinite(Number(String(cd.valor).replace(",", "."))))
    return `condição ${n}: o valor precisa ser um número`;
  const idTipo = { funil: "funis", estagio: "estagios", canal: "canais", departamento: "departamentos", etiqueta: "etiquetas", pessoa: "usuarios" }[tipo];
  if (idTipo && !idOk(ix, idTipo, cd.valor)) return `condição ${n}: o item escolhido não existe mais`;
  if (tipo === "origem" && !ORIGENS.some(([k]) => k === cd.valor)) return `condição ${n}: escolha a origem`;
  if (texto(cd.valor).length > 200) return `condição ${n}: o valor pode ter até 200 caracteres`;
  return null;
}

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
        return `${p}: o prazo vai de 0 a 2160 horas`;
      if (!(ac.dono === "responsavel" || ac.dono === "atendente" || idOk(ix, "usuarios", ac.dono)))
        return `${p}: escolha para quem é a tarefa`;
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
      if (dono === "conta" && !idOk(ix, "usuarios", ac.conta_id)) return `${p}: escolha a pessoa`;
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
      if (vazio(ac.etiqueta_id) && !(ac.tipo === "etiqueta_adicionar" && !vazio(ac.etiqueta_nome))) return `${p}: escolha a etiqueta`;
      if (!vazio(ac.etiqueta_id) && !idOk(ix, "etiquetas", ac.etiqueta_id)) return `${p}: a etiqueta escolhida não existe mais`;
      if (vazio(ac.etiqueta_id) && texto(ac.etiqueta_nome).trim().length > 40) return `${p}: o nome da etiqueta pode ter até 40 caracteres`;
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
      if (!(ac.para === "responsavel" || ac.para === "admins" || ac.para === "departamento" || idOk(ix, "usuarios", ac.para))) return `${p}: escolha quem recebe o aviso`;
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
      if (intFaixa(ac.minutos, LIMITES.esperar) == null) return `${p}: a espera vai de 1 minuto a 30 dias (43200 minutos)`;
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
export function linhaDoTempo(acoes) {
  let acum = 0, parou = false;
  const out = [];
  (acoes || []).forEach((a, i) => {
    const tipo = a && a.tipo;
    const m = tipo === "esperar" ? (inteiro(a.minutos) || 0) : 0;
    out.push({ i, tipo, antes: acum, depois: acum + m, quando: acum === 0 ? "Na hora" : `Depois de ${formatarDuracao(acum)}`, inalcancavel: parou });
    acum += m;
    if (tipo === "parar") parou = true;
  });
  return out;
}

/** Tempo total de espera da sequência (minutos). */
export const duracaoTotal = acoes => linhaDoTempo(acoes).reduce((s, x) => Math.max(s, x.depois), 0);

/** A automação tem esperas? (a lista vira «sequência»). */
export const temSequencia = auto => (auto && auto.acoes || []).some(a => a && (a.tipo === "esperar" || a.tipo === "parar"));

/** Avisos que não impedem de salvar (o editor mostra no resumo). */
export function avisosEstrutura(auto) {
  const acoes = (auto && auto.acoes) || [];
  const avisos = [];
  const tl = linhaDoTempo(acoes);
  const iParar = acoes.findIndex(a => a && a.tipo === "parar");
  if (iParar >= 0 && iParar < acoes.length - 1) avisos.push("Os passos depois de «Parar por aqui» nunca rodam. Tire-os ou mova o «Parar» para o fim.");
  if (tl.some((x, i) => x.tipo === "esperar" && i > 0 && acoes[i - 1] && acoes[i - 1].tipo === "esperar"))
    avisos.push("Há duas esperas seguidas: o tempo delas se soma.");
  const paraCliente = acoes.some(a => a && a.tipo === "esperar" && a.cancelar_se_cliente_responder);
  if (paraCliente && auto && ["tarefa_vencida", "agendado"].includes(auto.gatilho))
    avisos.push("«Parar se o cliente responder» só vale quando existe uma conversa com o cliente.");
  if (acoes.some(a => a && a.tipo === "ia_decidir")) avisos.push("Cada passo da IA usa uma sugestão da cota de IA do mês. Use condições para ela não rodar à toa.");
  return avisos;
}

/* ------------------------------------------------------------------ limpeza para o servidor */

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
    respeitar_horario: !!a.respeitar_horario,
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
        const l = (Array.isArray(v) ? v : texto(v).split(",")).map(x => texto(x).trim()).filter(Boolean);
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
    if (!(OPERADOR[cd.op] || {}).semValor) x.valor = tipoValorCondicao(cd.campo) === "numero" ? Number(String(cd.valor).replace(",", ".")) : cd.valor;
    out.condicoes.push(x);
  }
  for (const ac0 of a.acoes || []) {
    const ac = ac0 && ac0.tipo === "atribuir" && ac0.dono == null && ac0.modo != null ? Object.assign({}, ac0, { dono: ac0.modo }) : ac0;
    const d = ACAO[ac.tipo];
    const x = { tipo: ac.tipo };
    if (d) {
      for (const f of d.campos) {
        const v = ac[f.nome];
        if (f.tipo === "numero" || f.tipo === "duracao") { const n = inteiro(v); if (n != null) x[f.nome] = n; continue; }
        if (f.tipo === "sim_nao") { if (f.gravaSempre) x[f.nome] = v == null ? !!f.padrao : !!v; else if (v) x[f.nome] = true; continue; }
        if (f.tipo === "parametros") { x[f.nome] = (v || []).map(y => texto(y)); continue; }
        if (f.quando && Object.entries(f.quando).some(([k, val]) => ac[k] !== val)) continue;
        if (!vazio(v)) x[f.nome] = typeof v === "string" ? v.trim() : v;
      }
      if ((ac.tipo === "etiquetar" || ac.tipo === "etiqueta_adicionar") && vazio(ac.etiqueta_id) && !vazio(ac.etiqueta_nome)) x.etiqueta_nome = texto(ac.etiqueta_nome).trim();
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
  f += `, ${passos.length ? juntarPassos(passos) : "(nenhuma ação)"}`;
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
      return `quando chegar mensagem${p.length ? ` com ${listaFrase(p.slice(0, 4).map(aspas), "ou")}${p.length > 4 ? " (e mais)" : ""}` : ""}${noCanal}`;
    }
    case "sem_resposta":
      return `quando uma conversa${noDep} ficar sem resposta há ${formatarMinutos(c.minutos)}${c.so_no_horario ? " (contando só no horário de atendimento)" : ""}`;
    case "negocio_criado": return `quando ${vv.um("negocio")} ${vv.min("negocio")} for criad${vv.art("negocio")}${noFunil}`;
    case "negocio_estagio": return `quando ${neg} entrar em ${etapa(c.estagio_id)}`;
    case "tempo_no_estagio": return `quando ${neg} ficar parad${vv.art("negocio")} em ${etapa(c.estagio_id)} por ${formatarHoras(c.horas)}`;
    case "negocio_ganho": return `quando ${neg} for marcad${vv.art("negocio")} como ${aspas(vv.v.ganhar)}${noFunil}`;
    case "negocio_perdido": return `quando ${neg} for marcad${vv.art("negocio")} como ${aspas(vv.v.perder)}${noFunil}`;
    case "etiqueta_adicionada": return `quando a etiqueta ${aspas(nomeDe(ix, "etiquetas", c.etiqueta_id, "escolhida") || "escolhida")} for adicionada`;
    case "tarefa_vencida": return "quando uma tarefa vencer sem ser concluída";
    case "antes_da_data": {
      const alvo = c.campo === "previsao_fechamento" ? "da previsão de fechamento" : `da ${palavraConsulta(vv.vertical)}`;
      return `${formatarHoras(c.horas)} antes ${alvo}${noFunil}`;
    }
    case "apos_data": {
      const alvo = c.campo === "previsao_fechamento" ? "da previsão de fechamento" : `da ${palavraConsulta(vv.vertical)}`;
      return `${formatarHoras(c.horas)} depois ${alvo}${noFunil}`;
    }
    case "agendado": {
      const noEstagio = c.estagio_id ? ` na etapa ${etapa(c.estagio_id)}` : "";
      return `${frasePeriodo(c.dias_semana)}, às ${RE_HORA.test(texto(c.horario)) ? c.horario : "(horário)"}, para cada ${vv.min("negocio")} ${vv.conc("negocio", "aberto", "aberta")}${noFunil}${noEstagio}`;
    }
    default: return "quando (escolha o gatilho)";
  }
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
      etiqueta: "a etiqueta", texto: "o texto", valor: "o valor", dono_id: "o responsável" }[cd.campo];
  }
  if (op.semValor) {
    if (cd.campo === "etiqueta") return cd.op === "vazio" ? "não tiver etiqueta" : "tiver alguma etiqueta";
    return `${rot} ${op.frase}`;
  }
  if (cd.campo === "etiqueta") {
    const n = aspas(nomeDe(ix, "etiquetas", cd.valor, "escolhida") || "escolhida");
    return cd.op === "diferente" || cd.op === "nao_contem" ? `não tiver a etiqueta ${n}` : `tiver a etiqueta ${n}`;
  }
  return `${rot} ${op.frase} ${aspas(valorLegivel(cd.campo, cd.valor, ix))}`;
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
    default: return cortar(valor, 40);
  }
}

export function brl(v) {
  const n = Number(String(v).replace(",", "."));
  if (!Number.isFinite(n)) return texto(v);
  const [i, d] = Math.abs(n).toFixed(2).split(".");
  return `${n < 0 ? "-" : ""}R$ ${i.replace(/\B(?=(\d{3})+(?!\d))/g, ".")},${d}`;
}

function quemTarefa(dono, ix) {
  if (dono === "responsavel") return "o responsável";
  if (dono === "atendente") return "quem atende a conversa";
  return aspas(nomeDe(ix, "usuarios", dono, "pessoa escolhida") || "pessoa escolhida");
}

const FRASE_IA = {
  classificar_etapa: "pedir à IA para escolher a etapa certa",
  resumir_nota: "pedir à IA para resumir a conversa numa nota",
  pontuar_lead: "pedir à IA para pontuar o lead",
};

function fraseAcao(ac, ix, vv) {
  if (!ac || !ACAO[ac.tipo]) return null;
  switch (ac.tipo) {
    case "criar_tarefa": {
      const prazo = Number(ac.vence_em_horas ?? 24);
      return `criar tarefa ${aspas(cortar(ac.titulo || "sem título", 60))} para ${quemTarefa(ac.dono || "responsavel", ix)}${prazo === 0 ? " para já" : ` em ${formatarHoras(prazo)}`}`;
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
    case "ia_decidir": return FRASE_IA[ac.tarefa] || "pedir à IA para decidir";
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
export function variaveisDesconhecidas(txt) {
  const ok = new Set(VARIAVEIS.map(([k]) => k));
  return [...new Set([...texto(txt).matchAll(/\{([a-z_]+)\}/g)].map(m => m[1]).filter(k => !ok.has(k)))];
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
  { id: "followup_orcamento", categoria: "whatsapp", icone: "relogio", destaque: ["odonto", "oficina", "loja"], ocultar: [],
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
  { id: "lead_anuncio", categoria: "equipe", icone: "sino", destaque: ["loja"], ocultar: [],
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
  { id: "sem_resposta", categoria: "equipe", icone: "sino", destaque: [], ocultar: [],
    titulo: () => "Sem resposta há 15 min → avisar o responsável",
    texto: () => "Ninguém respondeu o cliente em 15 minutos (contando só no horário de atendimento)? O responsável recebe um aviso no sino.",
    auto: { nome: "Sem resposta há 15 min", gatilho: "sem_resposta", config: { minutos: 15, so_no_horario: true }, condicoes: [],
      acoes: [{ tipo: "notificar", para: "responsavel", titulo: "{nome} está esperando resposta", texto: "Atendimento {protocolo} sem resposta há 15 min." }],
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

/** Automação nova em branco para o gatilho. */
export function novaAutomacao(gatilho = "negocio_estagio") {
  const g = GATILHO[gatilho] || GATILHOS[0];
  const config = {};
  for (const f of g.campos) if (f.padrao !== undefined) config[f.nome] = copia(f.padrao);
  return { nome: "", gatilho: g.id, config, condicoes: [], acoes: [], respeitar_horario: false, ativo: true };
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
export function trocarGatilho(auto, gatilho) {
  const g = GATILHO[gatilho];
  if (!g) return auto;
  const antigo = auto.config || {};
  const config = {};
  for (const f of g.campos) {
    if (antigo[f.nome] !== undefined) config[f.nome] = antigo[f.nome];
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
export function normalizarSimulacao(r, auto, base, vocab) {
  const src = r && typeof r === "object" ? r : {};
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
    return {
      rotulo: cortar(nome, 200), estado: est, motivo: cortar(q.motivo || (q.detalhe && q.detalhe !== nome ? q.detalhe : "") || "", 200),
      quando: Number.isFinite(depois) && depois > 0 ? `depois de ${formatarDuracao(depois)}` : "",
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
  if (/«Então»|\bações\b|esperas/i.test(h)) return { onde: "entao", indice: null };
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
  if (e === "cancelada" || e === "parada") return "pulado";
  const s = normalizar(x && (x.status || x.situacao));
  if (s === "ok" || s === "erro" || s === "pulado" || s === "espera") return s;
  if (s === "pulada") return "pulado";
  if (!x || !x.ok) return "erro";
  return /\b(pulad[oa]|nao (foi )?enviad[oa]|contato pediu|fora da janela|ignorad[oa])\b/.test(normalizar(x.detalhe)) ? "pulado" : "ok";
}

/** Frase do estado da sequência ("Esperando para continuar", "Cancelada: o cliente respondeu") ou "" quando é uma execução comum. */
export function estadoExecucaoTexto(x) {
  switch (normalizar(x && x.estado)) {
    case "esperando": return "Esperando para continuar";
    case "aguardando_ia": return "Aguardando a IA decidir";
    case "cancelada": return "Cancelada: o cliente respondeu antes do fim da espera";
    case "parada": return "Encerrada no passo «Parar por aqui»";
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
 * Erro do nx-ia (api.js: .codigo, .detalhe_texto, .hint) → {tipo, titulo, texto} para a caixa «Criar com IA».
 * tipo: "cota" | "chave" | "desligada" | "indisponivel" | "pedidos" | "rede" | "invalida" | "outro".
 * O nx-ia responde {ok:false, erro:"ia_indisponivel", detalhe:"sem_chave"} quando falta a chave da Anthropic.
 */
export function erroDaIA(e, mensagemPadrao) {
  const cod = texto(e && (e.codigo || e.message));
  const det = normalizar(e && (e.detalhe_texto || (typeof e.detalhe === "string" ? e.detalhe : "") || e.hint));
  if (cod === "ia_cota") return { tipo: "cota", titulo: "A cota de IA deste mês acabou",
    texto: "Você ainda pode criar a automação pelas receitas prontas ou do zero. A cota volta no começo do próximo mês; para usar mais agora, fale com o suporte." };
  if (cod === "sem_chave" || det === "sem_chave") return { tipo: "chave", titulo: "A IA ainda não foi ligada",
    texto: "Falta cadastrar a chave da Anthropic nesta plataforma. Peça ao administrador da plataforma para configurar em Configurações → Assistente de IA. Enquanto isso, use uma receita pronta abaixo." };
  if (cod === "ia_desligada") return { tipo: "desligada", titulo: "A IA está desligada",
    texto: "O administrador desligou a IA para esta empresa. Use as receitas prontas ou crie a automação do zero." };
  if (cod === "muitos_pedidos" || cod === "limite_taxa") return { tipo: "pedidos", titulo: "Muitos pedidos seguidos",
    texto: "Espere cerca de um minuto e tente de novo." };
  if (cod === "sem_conexao" || cod === "tempo_rede" || cod === "tempo_esgotado") return { tipo: "rede", titulo: "A conexão falhou",
    texto: "Não deu para falar com o servidor. Confira a internet e tente de novo; nada foi salvo." };
  if (cod === "ia_indisponivel" || cod === "ia_resposta_invalida" || cod === "ia_invalida") return { tipo: "indisponivel", titulo: "A IA não conseguiu montar agora",
    texto: cod === "ia_indisponivel" ? "Ela não respondeu desta vez. Tente de novo em instantes, ou escreva o pedido com outras palavras." : "A resposta veio fora do formato esperado. Tente descrever com outras palavras ou use uma receita pronta." };
  if (cod === "automacao_invalida") return { tipo: "invalida", titulo: "A IA montou algo que não passa na conferência",
    texto: (e && e.hint ? `Problema: ${e.hint}. ` : "") + "Tente descrever com outras palavras ou use uma receita pronta." };
  return { tipo: "outro", titulo: "Não foi possível montar", texto: mensagemPadrao || "Tente de novo em instantes." };
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
  return { odonto: "Recomendado para clínicas", oficina: "Recomendado para oficinas", loja: "Recomendado para lojas" }[vertical] || "Recomendado";
}
/** Opções de campo de condição: os fixos + os campos personalizados do contato. */
export function camposCondicao(base) {
  const fixos = CAMPOS_CONDICAO.map(c => ({ valor: c.id, rotulo: c.rotulo }));
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
export function exemploVariaveis({ empresa = "Sua empresa", atendente = "Ana", agora = new Date() } = {}) {
  const amanha = new Date(agora.getTime() + 24 * 3600 * 1000);
  const dia = new Intl.DateTimeFormat("en-CA", { timeZone: "America/Sao_Paulo", year: "numeric", month: "2-digit", day: "2-digit" }).format(amanha);
  return { nome: "Maria Souza", empresa, protocolo: "2026-000123", etapa: "Avaliou / orçamento", valor: 1500,
    atendente: String(atendente || "").split(/\s+/)[0] || "Ana", consulta_em: `${dia}T14:30:00-03:00` };
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
