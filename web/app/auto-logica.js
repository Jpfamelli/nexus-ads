/* ============================================================
   ÓRBITA — auto-logica.js (PURO, sem imports) · frente F7
   ESPEC §2.6, §5.7, §5.8, T12.
   Catálogo de gatilhos, condições e ações; validação (mesmas frases
   que o servidor devolve no hint de 'automacao_invalida'); frase que
   descreve a automação; modelos prontos; prévia de variáveis.
   Os testes Node importam este arquivo direto do disco.
   ============================================================ */

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

/** Palavra do evento marcado da vertical: consulta (clínica), visita (oficina), entrega (loja). */
export function palavraConsulta(vertical) {
  return vertical === "oficina" ? "visita" : vertical === "loja" ? "entrega" : "consulta";
}

/* ------------------------------------------------------------------ catálogo */

export const LIMITES = Object.freeze({
  nome: 80, condicoes: 10, acoes: 10, palavras: 20, palavra: 60,
  titulo_tarefa: 160, titulo_negocio: 120, mensagem: 4096, titulo_aviso: 120, texto_aviso: 500, alerta: 1000,
  sem_resposta: [5, 1440], tempo_no_estagio: [1, 2160], antes_da_data: [1, 72], prazo_tarefa: [0, 2160],
  parametros: 10,
});

/**
 * Gatilhos. `campos` descreve o `config` (o editor desenha a partir daqui).
 * tipo: canal | departamento | funil | estagio | etiqueta | numero | palavras | sim_nao | campo_data
 */
export const GATILHOS = Object.freeze([
  { id: "conversa_nova", grupo: "Conversas", icone: "chat",
    rotulo: () => "Chegou uma conversa nova",
    campos: [
      { nome: "canal_id", tipo: "canal", rotulo: "Só neste número", opcional: true },
      { nome: "departamento_id", tipo: "departamento", rotulo: "Só neste departamento", opcional: true },
    ] },
  { id: "mensagem_recebida", grupo: "Conversas", icone: "chat",
    rotulo: () => "Chegou uma mensagem",
    campos: [
      { nome: "palavras", tipo: "palavras", rotulo: "Com alguma destas palavras", opcional: true,
        ajuda: "Separe por vírgula. Vale qualquer uma, sem diferença de acento ou maiúscula. Vazio = toda mensagem." },
      { nome: "canal_id", tipo: "canal", rotulo: "Só neste número", opcional: true },
    ] },
  { id: "sem_resposta", grupo: "Conversas", icone: "relogio",
    rotulo: () => "Cliente sem resposta há um tempo",
    campos: [
      { nome: "minutos", tipo: "numero", rotulo: "Minutos sem resposta", min: 5, max: 1440, obrigatorio: true, padrao: 15, sufixo: "min" },
      { nome: "departamento_id", tipo: "departamento", rotulo: "Só neste departamento", opcional: true },
      { nome: "so_no_horario", tipo: "sim_nao", rotulo: "Só quando o departamento está aberto", padrao: true },
    ] },
  { id: "negocio_criado", grupo: "CRM", icone: "funil",
    rotulo: vv => `${vv.v.negocio} criad${vv.art("negocio")}`,
    campos: [{ nome: "funil_id", tipo: "funil", rotulo: "Só neste funil", opcional: true }] },
  { id: "negocio_estagio", grupo: "CRM", icone: "funil",
    rotulo: vv => `${vv.v.negocio} entrou numa etapa`,
    campos: [{ nome: "estagio_id", tipo: "estagio", rotulo: "Etapa", obrigatorio: true }] },
  { id: "tempo_no_estagio", grupo: "CRM", icone: "relogio",
    rotulo: vv => `${vv.v.negocio} parad${vv.art("negocio")} numa etapa`,
    campos: [
      { nome: "estagio_id", tipo: "estagio", rotulo: "Etapa", obrigatorio: true },
      { nome: "horas", tipo: "numero", rotulo: "Horas parado na etapa", min: 1, max: 2160, obrigatorio: true, padrao: 48, sufixo: "h" },
    ] },
  { id: "negocio_ganho", grupo: "CRM", icone: "check",
    rotulo: vv => `${vv.v.negocio} marcad${vv.art("negocio")} como «${vv.v.ganhar}»`,
    campos: [{ nome: "funil_id", tipo: "funil", rotulo: "Só neste funil", opcional: true }] },
  { id: "negocio_perdido", grupo: "CRM", icone: "fechar",
    rotulo: vv => `${vv.v.negocio} marcad${vv.art("negocio")} como «${vv.v.perder}»`,
    campos: [{ nome: "funil_id", tipo: "funil", rotulo: "Só neste funil", opcional: true }] },
  { id: "etiqueta_adicionada", grupo: "CRM", icone: "etiqueta",
    rotulo: () => "Etiqueta adicionada",
    campos: [{ nome: "etiqueta_id", tipo: "etiqueta", rotulo: "Etiqueta", obrigatorio: true }] },
  { id: "tarefa_vencida", grupo: "CRM", icone: "tarefa",
    rotulo: () => "Tarefa venceu sem ser concluída", campos: [] },
  { id: "antes_da_data", grupo: "Agenda", icone: "relogio",
    rotulo: vv => `Antes da ${palavraConsulta(vv.vertical)} marcada`,
    campos: [
      { nome: "campo", tipo: "campo_data", rotulo: "Data", obrigatorio: true, padrao: "consulta" },
      { nome: "horas", tipo: "numero", rotulo: "Quantas horas antes", min: 1, max: 72, obrigatorio: true, padrao: 24, sufixo: "h" },
      { nome: "funil_id", tipo: "funil", rotulo: "Só neste funil", opcional: true },
    ] },
]);

export const GATILHO = Object.freeze(Object.fromEntries(GATILHOS.map(g => [g.id, g])));

export const TIPOS_TAREFA = Object.freeze([
  ["tarefa", "Tarefa"], ["ligacao", "Ligação"], ["whatsapp", "WhatsApp"], ["reuniao", "Reunião"], ["visita", "Visita"], ["email", "E-mail"],
]);

export const ORIGENS = Object.freeze([
  ["anuncio", "Anúncio"], ["whatsapp", "WhatsApp"], ["indicacao", "Indicação"], ["organico", "Orgânico"],
  ["manual", "Manual"], ["site", "Site"], ["importacao", "Importação"],
]);

/** Campos de condição. `valor`: tipo do campo de valor no editor. */
export const CAMPOS_CONDICAO = Object.freeze([
  { id: "origem", rotulo: "Origem", valor: "origem" },
  { id: "funil_id", rotulo: "Funil", valor: "funil" },
  { id: "estagio_id", rotulo: "Etapa", valor: "estagio" },
  { id: "canal_id", rotulo: "Número de WhatsApp", valor: "canal" },
  { id: "departamento_id", rotulo: "Departamento", valor: "departamento" },
  { id: "etiqueta", rotulo: "Etiqueta", valor: "etiqueta" },
  { id: "texto", rotulo: "Texto da mensagem", valor: "texto" },
  { id: "valor", rotulo: "Valor", valor: "numero" },
  { id: "dono_id", rotulo: "Responsável", valor: "pessoa" },
]);
const CAMPO_CONDICAO = Object.fromEntries(CAMPOS_CONDICAO.map(c => [c.id, c]));

export const OPERADORES = Object.freeze([
  { id: "igual", rotulo: "é", frase: "for" },
  { id: "diferente", rotulo: "não é", frase: "não for" },
  { id: "contem", rotulo: "contém", frase: "contiver" },
  { id: "nao_contem", rotulo: "não contém", frase: "não contiver" },
  { id: "maior", rotulo: "maior que", frase: "for maior que" },
  { id: "menor", rotulo: "menor que", frase: "for menor que" },
  { id: "vazio", rotulo: "está vazio", frase: "estiver vazio", semValor: true },
  { id: "preenchido", rotulo: "está preenchido", frase: "estiver preenchido", semValor: true },
]);
const OPERADOR = Object.fromEntries(OPERADORES.map(o => [o.id, o]));

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

/**
 * Ações. `campos`: tipo texto | texto_longo | numero | opcoes | estagio | funil | etiqueta | pessoa |
 * dono | para | template | parametros | departamento | sim_nao | alvo_etiqueta | modo_atribuir
 * `mensagem: true` = sai pelo WhatsApp (respeitar horário vale para elas).
 * `disponivel: false` = aceito pelo servidor, mas escondido no editor (depende de P1 da F2).
 */
export const ACOES = Object.freeze([
  { id: "criar_tarefa", icone: "tarefa", rotulo: () => "Criar tarefa",
    campos: [
      { nome: "titulo", tipo: "texto", rotulo: "Título da tarefa", obrigatorio: true, max: 160, variaveis: true },
      { nome: "tipo_tarefa", tipo: "opcoes", rotulo: "Tipo", opcoes: TIPOS_TAREFA, padrao: "tarefa" },
      { nome: "vence_em_horas", tipo: "numero", rotulo: "Prazo (horas depois)", min: 0, max: 2160, padrao: 24, sufixo: "h" },
      { nome: "dono", tipo: "dono", rotulo: "Para quem", obrigatorio: true, padrao: "responsavel" },
    ] },
  { id: "mover_estagio", icone: "seta-dir", rotulo: () => "Mover de etapa",
    campos: [{ nome: "estagio_id", tipo: "estagio", rotulo: "Para a etapa", obrigatorio: true }] },
  { id: "criar_negocio", icone: "funil", rotulo: vv => `Criar ${vv.min("negocio")}`,
    campos: [
      { nome: "funil_id", tipo: "funil", rotulo: "Funil", opcional: true, ajuda: "Vazio = funil padrão." },
      { nome: "estagio_id", tipo: "estagio", rotulo: "Etapa", opcional: true, ajuda: "Vazio = primeira etapa do funil." },
      { nome: "titulo", tipo: "texto", rotulo: "Título", opcional: true, max: 120, variaveis: true },
    ] },
  { id: "enviar_mensagem", icone: "enviar", mensagem: true, rotulo: () => "Enviar mensagem",
    campos: [{ nome: "texto", tipo: "texto_longo", rotulo: "Mensagem", obrigatorio: true, max: 4096, variaveis: true,
      ajuda: "Só sai dentro da janela de 24 h desde a última mensagem do cliente. Fora dela, use um modelo aprovado." }] },
  { id: "enviar_template", icone: "whatsapp", mensagem: true, rotulo: () => "Enviar modelo aprovado",
    campos: [
      { nome: "template_id", tipo: "template", rotulo: "Modelo (aprovado na Meta)", obrigatorio: true },
      { nome: "parametros", tipo: "parametros", rotulo: "Parâmetros do modelo" },
    ] },
  { id: "atribuir", icone: "usuario", rotulo: () => "Atribuir a conversa",
    campos: [
      { nome: "modo", tipo: "modo_atribuir", rotulo: "Como", obrigatorio: true, padrao: "rodizio" },
      { nome: "conta_id", tipo: "pessoa", rotulo: "Pessoa", quando: { modo: "conta" } },
      { nome: "departamento_id", tipo: "departamento", rotulo: "Mover para o departamento", opcional: true },
    ] },
  { id: "etiquetar", icone: "etiqueta", rotulo: () => "Pôr ou tirar etiqueta",
    campos: [
      { nome: "etiqueta_id", tipo: "etiqueta", rotulo: "Etiqueta", obrigatorio: true },
      { nome: "alvo", tipo: "alvo_etiqueta", rotulo: "Em", obrigatorio: true, padrao: "contato" },
      { nome: "remover", tipo: "sim_nao", rotulo: "Tirar a etiqueta (em vez de pôr)", padrao: false },
    ] },
  { id: "notificar", icone: "sino", rotulo: () => "Avisar a equipe",
    campos: [
      { nome: "para", tipo: "para", rotulo: "Quem recebe", obrigatorio: true, padrao: "responsavel" },
      { nome: "titulo", tipo: "texto", rotulo: "Título do aviso", obrigatorio: true, max: 120, variaveis: true },
      { nome: "texto", tipo: "texto_longo", rotulo: "Detalhe", opcional: true, max: 500, variaveis: true },
    ] },
  { id: "resolver_conversa", icone: "check", rotulo: () => "Resolver a conversa", campos: [] },
  { id: "alerta_whatsapp", icone: "alerta", mensagem: true, disponivel: false, rotulo: () => "Avisar no WhatsApp do gestor",
    campos: [{ nome: "texto", tipo: "texto_longo", rotulo: "Texto do alerta", obrigatorio: true, max: 1000, variaveis: true }] },
]);

export const ACAO = Object.freeze(Object.fromEntries(ACOES.map(a => [a.id, a])));

/** Variáveis aceitas nos textos (e como parâmetros de modelo). */
export const VARIAVEIS = Object.freeze([
  ["primeiro_nome", "Primeiro nome"], ["nome", "Nome completo"], ["empresa", "Nome da empresa"],
  ["protocolo", "Protocolo do atendimento"], ["etapa", "Etapa"], ["valor", "Valor"], ["atendente", "Atendente"],
  ["data_consulta", "Data marcada (29/09)"], ["hora_consulta", "Hora marcada (14:30)"],
]);

/* ------------------------------------------------------------------ utilidades */

const RE_UUID = /^[0-9a-f]{8}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{12}$/i;
export const ehUuid = s => typeof s === "string" && RE_UUID.test(s);
const vazio = x => x == null || (typeof x === "string" && x.trim() === "") || (Array.isArray(x) && x.length === 0);
const inteiro = x => {
  if (typeof x === "number" && Number.isInteger(x)) return x;
  if (typeof x === "string" && /^\s*-?\d+\s*$/.test(x)) return parseInt(x, 10);
  return null;
};
const texto = x => (x == null ? "" : String(x));
const aspas = s => `«${s}»`;

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
    temBase: !!base,
  };
}

function nomeDe(ix, tipo, id, falta) {
  if (!id) return null;
  const mapa = ix && ix[tipo];
  const x = mapa && mapa.get && mapa.get(id);
  return x ? (x.nome || x.numero_exibicao || x.rotulo) : falta;
}

/* ------------------------------------------------------------------ validação
   Devolve {ok:true} ou {ok:false, motivo, onde:'nome'|'quando'|'se'|'entao', indice}.
   `motivo` é a MESMA frase do hint do servidor (nx_auto_normalizar).
   opcoes.ligar = true → exige também o que só é preciso para ligar (modelo escolhido).
   opcoes.base → confere se os ids ainda existem e o nº de parâmetros do modelo. */
export function validar(auto, opcoes = {}) {
  const a = auto || {};
  const ix = opcoes.base ? indexarBase(opcoes.base) : null;
  const ligar = opcoes.ligar ?? !!a.ativo;
  const falha = (motivo, onde, indice) => ({ ok: false, motivo, onde, indice });

  const nome = texto(a.nome).trim();
  if (!nome) return falha("dê um nome à automação", "nome");
  if (nome.length > LIMITES.nome) return falha(`o nome pode ter até ${LIMITES.nome} caracteres`, "nome");

  const g = GATILHO[a.gatilho];
  if (!g) return falha("escolha o gatilho em «Quando»", "quando");
  const c = a.config && typeof a.config === "object" && !Array.isArray(a.config) ? a.config : {};
  const r = validarConfig(a.gatilho, c, ix);
  if (r) return falha(r, "quando");

  const conds = a.condicoes == null ? [] : a.condicoes;
  if (!Array.isArray(conds)) return falha("as condições estão em formato inválido", "se");
  if (conds.length > LIMITES.condicoes) return falha(`use até ${LIMITES.condicoes} condições`, "se");
  for (let i = 0; i < conds.length; i++) {
    const m = validarCondicao(conds[i], i + 1, ix);
    if (m) return falha(m, "se", i);
  }

  const acoes = a.acoes == null ? [] : a.acoes;
  if (!Array.isArray(acoes) || acoes.length === 0) return falha("acrescente pelo menos uma ação em «Então»", "entao");
  if (acoes.length > LIMITES.acoes) return falha(`use até ${LIMITES.acoes} ações`, "entao");
  for (let i = 0; i < acoes.length; i++) {
    const m = validarAcao(acoes[i], i + 1, ix, ligar);
    if (m) return falha(m, "entao", i);
  }
  return { ok: true };
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

function validarAcao(ac, n, ix, ligar) {
  const p = `ação ${n}`;
  if (!ac || typeof ac !== "object" || !ACAO[ac.tipo]) return `${p}: tipo de ação desconhecido`;
  const opcionalOk = (tipo, id) => vazio(id) || idOk(ix, tipo, id);
  switch (ac.tipo) {
    case "criar_negocio":
      if (!opcionalOk("funis", ac.funil_id)) return `${p}: o funil escolhido não existe mais`;
      if (!opcionalOk("estagios", ac.estagio_id)) return `${p}: a etapa escolhida não existe mais`;
      if (ix && ix.temBase && !vazio(ac.funil_id) && !vazio(ac.estagio_id) && ix.estagios.get(ac.estagio_id).funil_id !== ac.funil_id)
        return `${p}: a etapa não é desse funil`;
      if (texto(ac.titulo).length > LIMITES.titulo_negocio) return `${p}: o título pode ter até ${LIMITES.titulo_negocio} caracteres`;
      return null;
    case "mover_estagio":
      if (vazio(ac.estagio_id)) return `${p}: escolha a etapa`;
      if (!idOk(ix, "estagios", ac.estagio_id)) return `${p}: a etapa escolhida não existe mais`;
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
    case "atribuir":
      if (!["rodizio", "conta"].includes(ac.modo)) return `${p}: escolha como atribuir`;
      if (ac.modo === "conta" && !idOk(ix, "usuarios", ac.conta_id)) return `${p}: escolha a pessoa`;
      if (!opcionalOk("departamentos", ac.departamento_id)) return `${p}: o departamento escolhido não existe mais`;
      return null;
    case "etiquetar":
      if (vazio(ac.etiqueta_id) && vazio(ac.etiqueta_nome)) return `${p}: escolha a etiqueta`;
      if (!vazio(ac.etiqueta_id) && !idOk(ix, "etiquetas", ac.etiqueta_id)) return `${p}: a etiqueta escolhida não existe mais`;
      if (vazio(ac.etiqueta_id) && texto(ac.etiqueta_nome).trim().length > 40) return `${p}: o nome da etiqueta pode ter até 40 caracteres`;
      if (!["contato", "conversa"].includes(ac.alvo)) return `${p}: escolha onde pôr a etiqueta`;
      return null;
    case "notificar": {
      if (!(ac.para === "responsavel" || ac.para === "admins" || idOk(ix, "usuarios", ac.para))) return `${p}: escolha quem recebe o aviso`;
      const t = texto(ac.titulo).trim();
      if (!t) return `${p}: escreva o título do aviso`;
      if (t.length > LIMITES.titulo_aviso) return `${p}: o título do aviso pode ter até ${LIMITES.titulo_aviso} caracteres`;
      if (texto(ac.texto).length > LIMITES.texto_aviso) return `${p}: o detalhe do aviso pode ter até ${LIMITES.texto_aviso} caracteres`;
      return null;
    }
    case "resolver_conversa":
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
      if (!vazio(v)) out.config[f.nome] = v;
    }
  }
  for (const cd of a.condicoes || []) {
    const x = { campo: cd.campo, op: cd.op };
    if (!(OPERADOR[cd.op] || {}).semValor) x.valor = tipoValorCondicao(cd.campo) === "numero" ? Number(String(cd.valor).replace(",", ".")) : cd.valor;
    out.condicoes.push(x);
  }
  for (const ac of a.acoes || []) {
    const d = ACAO[ac.tipo];
    const x = { tipo: ac.tipo };
    if (d) {
      for (const f of d.campos) {
        const v = ac[f.nome];
        if (f.tipo === "numero") { const n = inteiro(v); if (n != null) x[f.nome] = n; continue; }
        if (f.tipo === "sim_nao") { if (v) x[f.nome] = true; continue; }
        if (f.tipo === "parametros") { x[f.nome] = (v || []).map(y => texto(y)); continue; }
        if (f.quando && Object.entries(f.quando).some(([k, val]) => ac[k] !== val)) continue;
        if (!vazio(v)) x[f.nome] = typeof v === "string" ? v.trim() : v;
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
  const acoes = (a.acoes || []).map(ac => fraseAcao(ac, ix, vv)).filter(Boolean);
  let f = quando;
  if (conds.length) f += `, se ${listaFrase(conds)}`;
  f += `, ${acoes.length ? listaFrase(acoes) : "(nenhuma ação)"}`;
  if (a.respeitar_horario && (a.acoes || []).some(ac => (ACAO[ac.tipo] || {}).mensagem)) f += " (mensagens só no horário de atendimento)";
  f = f.charAt(0).toUpperCase() + f.slice(1);
  return f + ".";
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

function fraseAcao(ac, ix, vv) {
  if (!ac || !ACAO[ac.tipo]) return null;
  switch (ac.tipo) {
    case "criar_tarefa": {
      const prazo = Number(ac.vence_em_horas ?? 24);
      return `criar tarefa ${aspas(cortar(ac.titulo || "sem título", 60))} para ${quemTarefa(ac.dono || "responsavel", ix)}${prazo === 0 ? " para já" : ` em ${formatarHoras(prazo)}`}`;
    }
    case "mover_estagio": return `mover para ${aspas(nomeDe(ix, "estagios", ac.estagio_id, "etapa escolhida") || "etapa escolhida")}`;
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
      if (ac.modo === "conta") return `atribuir a ${aspas(nomeDe(ix, "usuarios", ac.conta_id, "pessoa escolhida") || "pessoa escolhida")}${dep}`;
      return `distribuir no rodízio${dep}`;
    }
    case "etiquetar": {
      const n = aspas(ac.etiqueta_id ? (nomeDe(ix, "etiquetas", ac.etiqueta_id, "escolhida") || "escolhida") : (ac.etiqueta_nome || "escolhida"));
      // "no paciente" / "no cliente" / "no contato" (vocabulário da vertical) ou "na conversa"
      const [art, onde] = ac.alvo === "conversa" ? ["a", "conversa"] : [vv.art("contato"), vv.min("contato") || "contato"];
      return ac.remover ? `tirar a etiqueta ${n} d${art} ${onde}` : `pôr a etiqueta ${n} n${art} ${onde}`;
    }
    case "notificar": {
      if (ac.para === "responsavel") return "avisar o responsável";
      if (ac.para === "admins") return "avisar os administradores";
      return `avisar ${aspas(nomeDe(ix, "usuarios", ac.para, "pessoa escolhida") || "pessoa escolhida")}`;
    }
    case "resolver_conversa": return "resolver a conversa";
    case "alerta_whatsapp": return "avisar no WhatsApp do gestor";
    default: return null;
  }
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

/* ------------------------------------------------------------------ modelos prontos (T12) */

export const TEXTO_MODELO_LEMBRETE =
  "Olá, {{1}}! Confirmando sua consulta em {{2}} às {{3}}. Responda SIM para confirmar ou nos chame para remarcar.";
/** Texto sugerido do modelo de lembrete na palavra da vertical (consulta / visita / entrega). */
export const textoModeloLembrete = vertical => TEXTO_MODELO_LEMBRETE.replace("consulta", palavraConsulta(vertical));

export const MODELOS = Object.freeze([
  { id: "lembrete_consulta", icone: "relogio", destaque: ["odonto", "oficina"],
    titulo: vv => `Lembrete 24 h antes da ${palavraConsulta(vv.vertical)} → enviar modelo de confirmação`,
    texto: vv => `Manda pelo WhatsApp oficial um modelo de confirmação 24 h antes da ${palavraConsulta(vv.vertical)} marcada. Precisa de um modelo aprovado na Meta.`,
    aviso: `Crie e aprove na Meta um modelo de categoria Utilidade, por exemplo: '${TEXTO_MODELO_LEMBRETE}'`,
    auto: { nome: "Lembrete 24 h antes da consulta", gatilho: "antes_da_data", config: { campo: "consulta", horas: 24 }, condicoes: [],
      acoes: [{ tipo: "enviar_template", template_nome: "confirmacao_consulta", parametros: ["{primeiro_nome}", "{data_consulta}", "{hora_consulta}"] }],
      respeitar_horario: false } },
  { id: "sem_resposta", icone: "sino", destaque: [],
    titulo: () => "Sem resposta há 15 min → avisar o responsável",
    texto: () => "Ninguém respondeu o cliente em 15 minutos (contando só no horário de atendimento)? O responsável recebe um aviso no sino.",
    auto: { nome: "Sem resposta há 15 min", gatilho: "sem_resposta", config: { minutos: 15, so_no_horario: true }, condicoes: [],
      acoes: [{ tipo: "notificar", para: "responsavel", titulo: "{nome} está esperando resposta", texto: "Atendimento {protocolo} sem resposta há 15 min." }],
      respeitar_horario: false } },
  { id: "orcamento", icone: "tarefa", destaque: [],
    titulo: vv => orcamentoDaVertical(vv.vertical).titulo,
    texto: vv => `Quando ${vv.art("negocio")} ${vv.min("negocio")} chega em «${orcamentoDaVertical(vv.vertical).etapa}», ${orcamentoDaVertical(vv.vertical).texto}`,
    auto: { nome: "Orçamento em 24 h", gatilho: "negocio_estagio", config: { estagio_marco: "orcamento" }, condicoes: [],
      acoes: [{ tipo: "criar_tarefa", titulo: "Enviar orçamento para {primeiro_nome}", tipo_tarefa: "whatsapp", vence_em_horas: 24, dono: "responsavel" }],
      respeitar_horario: false } },
  { id: "pos_venda", icone: "check", destaque: ["loja"],
    // "Venda marcada como «Vendido»" (e não "Venda vendido"): concordância pelo gênero da palavra
    titulo: vv => `${vv.v.negocio} marcad${vv.art("negocio")} como «${vv.v.ganhar}» → tarefa de pós-venda em 7 dias`,
    texto: () => "Uma semana depois do fechamento, o responsável é lembrado de falar com o cliente: satisfação, avaliação e indicação.",
    auto: { nome: "Pós-venda em 7 dias", gatilho: "negocio_ganho", config: {}, condicoes: [],
      acoes: [{ tipo: "criar_tarefa", titulo: "Pós-venda: falar com {primeiro_nome}", tipo_tarefa: "whatsapp", vence_em_horas: 168, dono: "responsavel" }],
      respeitar_horario: false } },
  { id: "preco", icone: "etiqueta", destaque: [],
    titulo: () => "Mensagem com 'preço' → etiqueta Orçamento",
    texto: () => "Quem pergunta preço, valor ou quanto custa ganha a etiqueta Orçamento — fica fácil achar depois.",
    auto: { nome: "Perguntou preço", gatilho: "mensagem_recebida", config: { palavras: ["preço", "valor", "quanto custa"] }, condicoes: [],
      acoes: [{ tipo: "etiquetar", etiqueta_nome: "Orçamento", alvo: "contato" }],
      respeitar_horario: false } },
]);

/** Modelo "orçamento": a etapa de marco `orcamento` tem outro nome (e outro sentido) em cada vertical —
 *  na clínica é "Avaliou / orçamento" (falta ENVIAR o orçamento); na oficina e na loja o orçamento/proposta
 *  JÁ foi enviado e a tarefa é cobrar a resposta. */
function orcamentoDaVertical(vertical) {
  if (vertical === "oficina") return { titulo: "Orçamento enviado → cobrar resposta em 24 h", etapa: "Orçamento enviado",
    texto: "o responsável ganha a tarefa de cobrar a resposta do cliente em 24 h.", nome: "Cobrar orçamento em 24 h",
    tarefa: "Cobrar resposta do orçamento: {primeiro_nome}" };
  if (vertical === "loja" || vertical === "generico") return { titulo: "Proposta enviada → cobrar resposta em 24 h",
    etapa: vertical === "loja" ? "Proposta enviada" : "Proposta", texto: "o responsável ganha a tarefa de cobrar a resposta do cliente em 24 h.",
    nome: "Cobrar proposta em 24 h", tarefa: "Cobrar resposta da proposta: {primeiro_nome}" };
  return { titulo: "Entrou em Avaliou → tarefa de orçamento em 24 h", etapa: "Avaliou / orçamento",
    texto: "o responsável ganha a tarefa de enviar o orçamento em 24 h.", nome: "Orçamento em 24 h",
    tarefa: "Enviar orçamento para {primeiro_nome}" };
}

/** Modelos na ordem da vertical: os de destaque primeiro. */
export function modelosDaVertical(vertical) {
  const d = MODELOS.filter(m => m.destaque.includes(vertical));
  return d.concat(MODELOS.filter(m => !m.destaque.includes(vertical)));
}

/**
 * Monta a automação de um modelo com os ids do cliente (etapa pelo marco no funil padrão,
 * etiqueta e modelo da WABA pelo nome). O que não achar fica para a pessoa escolher.
 */
export function aplicarModelo(modelo, base, vocab) {
  const m = typeof modelo === "string" ? MODELOS.find(x => x.id === modelo) : modelo;
  if (!m) return null;
  const vv = voc(vocab);
  const a = JSON.parse(JSON.stringify(m.auto));
  a.ativo = false;
  a.modelo = m.id;
  if (m.id === "lembrete_consulta") a.nome = `Lembrete 24 h antes da ${palavraConsulta(vv.vertical)}`;
  if (m.id === "orcamento") {
    const o = orcamentoDaVertical(vv.vertical);
    a.nome = o.nome;
    a.acoes[0].titulo = o.tarefa;
  }
  const b = base || {};
  const funis = b.funis || [];
  const padrao = funis.find(f => f.padrao) || funis[0];
  if (a.config && a.config.estagio_marco) {
    const e = padrao && (padrao.estagios || []).find(s => s.marco === a.config.estagio_marco);
    delete a.config.estagio_marco;
    if (e) a.config.estagio_id = e.id;
  }
  for (const ac of a.acoes) {
    if (ac.tipo === "etiquetar" && ac.etiqueta_nome) {
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
  for (const f of g.campos) if (f.padrao !== undefined) config[f.nome] = f.padrao;
  return { nome: "", gatilho: g.id, config, condicoes: [], acoes: [], respeitar_horario: false, ativo: true };
}

/** Ação nova com os valores padrão do catálogo. */
export function novaAcao(tipo) {
  const d = ACAO[tipo];
  const x = { tipo };
  if (!d) return x;
  for (const f of d.campos) {
    if (f.padrao !== undefined) x[f.nome] = f.padrao;
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
    else if (f.padrao !== undefined) config[f.nome] = f.padrao;
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
/** Rótulo da data do gatilho antes_da_data. */
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
