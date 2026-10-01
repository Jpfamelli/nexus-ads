/* ============================================================
   ÓRBITA — auto-catalogo.js (PURO, sem imports) · CATÁLOGO COMPARTILHADO das automações
   Fonte única dos gatilhos, condições e ações (nomes do PLANO-NOITE-20261001, "Contrato das Automações").
   O editor (auto-editor.js) desenha os campos a partir daqui; o auto-logica.js valida e descreve;
   o servidor (nx-ia automacao_montar / motor nx_auto_*) usa os MESMOS ids e nomes de campo.
   Regras: sem imports, sem DOM, sem cores — só dados e pequenas funções de rótulo.
   `rotulo`/`dica` recebem `vv` (vocabulário da vertical, montado pelo auto-logica.js):
   vv.v.negocio, vv.min(chave), vv.art(chave), vv.um(chave), vv.conc(chave, m, f), vv.vertical.
   ============================================================ */

/** Palavra do evento marcado da vertical: consulta (clínica), visita (oficina), entrega (loja). */
export function palavraConsulta(vertical) {
  return vertical === "oficina" ? "visita" : vertical === "loja" ? "entrega" : "consulta";
}

export const LIMITES = Object.freeze({
  nome: 80, condicoes: 10, acoes: 10, palavras: 20, palavra: 60,
  titulo_tarefa: 160, titulo_negocio: 120, mensagem: 4096, titulo_aviso: 120, texto_aviso: 500, alerta: 1000,
  sem_resposta: [5, 1440], tempo_no_estagio: [1, 2160], antes_da_data: [1, 72], apos_data: [1, 720], prazo_tarefa: [0, 2160],
  esperar: [1, 43200], esperas: 5, nota: 1000, instrucao_ia: 500, valor_campo: 200, descricao_ia: 1500,
  parametros: 10,
});

/** 0 = domingo … 6 = sábado (o mesmo dia da semana do Postgres, em São Paulo). [numero, curto, nome] */
export const DIAS_SEMANA = Object.freeze([
  [0, "Dom", "domingo"], [1, "Seg", "segunda"], [2, "Ter", "terça"], [3, "Qua", "quarta"],
  [4, "Qui", "quinta"], [5, "Sex", "sexta"], [6, "Sáb", "sábado"],
]);

/** Atalhos de dias no editor do gatilho «agendado». */
export const ATALHOS_DIAS = Object.freeze([
  ["Todos os dias", Object.freeze([0, 1, 2, 3, 4, 5, 6])],
  ["Dias úteis", Object.freeze([1, 2, 3, 4, 5])],
  ["Fim de semana", Object.freeze([0, 6])],
]);

/** Tempos prontos do passo «esperar» (em minutos). */
export const PRESETS_ESPERA = Object.freeze([
  [5, "5 min"], [15, "15 min"], [30, "30 min"], [60, "1 h"], [120, "2 h"], [240, "4 h"],
  [1440, "1 dia"], [2880, "2 dias"], [4320, "3 dias"], [10080, "7 dias"], [21600, "15 dias"], [43200, "30 dias"],
]);

export const TIPOS_TAREFA = Object.freeze([
  ["tarefa", "Tarefa"], ["ligacao", "Ligação"], ["whatsapp", "WhatsApp"], ["reuniao", "Reunião"], ["visita", "Visita"], ["email", "E-mail"],
]);

export const ORIGENS = Object.freeze([
  ["anuncio", "Anúncio"], ["whatsapp", "WhatsApp"], ["indicacao", "Indicação"], ["organico", "Orgânico"],
  ["manual", "Manual"], ["site", "Site"], ["importacao", "Importação"],
]);

/** Tarefas do passo «ia_decidir» (executadas pelo servidor, nx-ia → automacao_decidir). [id, nome, o que faz] */
export const TAREFAS_IA = Object.freeze([
  ["classificar_etapa", "Classificar a etapa", "Lê a conversa e move para a etapa que combina (só entre as etapas do funil)."],
  ["resumir_nota", "Resumir a conversa", "Escreve um resumo curto da conversa como nota no histórico."],
  ["pontuar_lead", "Pontuar o lead", "Dá uma nota de 0 a 100 para o interesse do cliente e guarda o motivo."],
]);

/**
 * Gatilhos. `campos` descreve o `config` (o editor desenha a partir daqui).
 * tipo: canal | departamento | funil | estagio | etiqueta | numero | palavras | sim_nao | campo_data | hora | dias_semana
 */
export const GATILHOS = Object.freeze([
  { id: "conversa_nova", grupo: "Conversas", icone: "chat",
    rotulo: () => "Chegou uma conversa nova",
    descricao: "Assim que um contato escreve pela primeira vez.",
    campos: [
      { nome: "canal_id", tipo: "canal", rotulo: "Só neste número", opcional: true },
      { nome: "departamento_id", tipo: "departamento", rotulo: "Só neste departamento", opcional: true },
    ] },
  { id: "mensagem_recebida", grupo: "Conversas", icone: "chat",
    rotulo: () => "Chegou uma mensagem",
    descricao: "Cada mensagem que o cliente manda, com ou sem palavras-chave.",
    dica: () => "Mensagens do cliente. Notas internas e avisos do sistema não contam.",
    campos: [
      { nome: "palavras", tipo: "palavras", rotulo: "Com alguma destas palavras", opcional: true,
        ajuda: "Separe por vírgula. Vale qualquer uma, sem diferença de acento ou maiúscula. Vazio = toda mensagem." },
      { nome: "canal_id", tipo: "canal", rotulo: "Só neste número", opcional: true },
    ] },
  { id: "conversa_resolvida", grupo: "Conversas", icone: "check",
    rotulo: () => "Uma conversa foi resolvida",
    descricao: "Quando a equipe marca o atendimento como resolvido.",
    dica: () => "Boa hora para resumir a conversa, pedir avaliação ou criar uma tarefa de acompanhamento.",
    campos: [
      { nome: "canal_id", tipo: "canal", rotulo: "Só neste número", opcional: true },
      { nome: "departamento_id", tipo: "departamento", rotulo: "Só neste departamento", opcional: true },
    ] },
  { id: "sem_resposta", grupo: "Conversas", icone: "relogio",
    rotulo: () => "Cliente sem resposta há um tempo",
    descricao: "O cliente escreveu e ninguém respondeu dentro do tempo.",
    dica: () => "Conta a partir da última mensagem do cliente. Avisa uma vez por espera; se o cliente escrever de novo, conta outra vez.",
    campos: [
      { nome: "minutos", tipo: "numero", rotulo: "Minutos sem resposta", min: 5, max: 1440, obrigatorio: true, padrao: 15, sufixo: "min" },
      { nome: "departamento_id", tipo: "departamento", rotulo: "Só neste departamento", opcional: true },
      { nome: "so_no_horario", tipo: "sim_nao", rotulo: "Só quando o departamento está aberto", padrao: true },
    ] },
  { id: "negocio_criado", grupo: "CRM", icone: "funil",
    rotulo: vv => `${vv.v.negocio} criad${vv.art("negocio")}`,
    descricao: "No momento em que entra um novo registro no funil.",
    campos: [{ nome: "funil_id", tipo: "funil", rotulo: "Só neste funil", opcional: true }] },
  { id: "negocio_estagio", grupo: "CRM", icone: "funil",
    rotulo: vv => `${vv.v.negocio} entrou numa etapa`,
    descricao: "Quando alguém chega numa etapa do funil.",
    dica: () => "Vale quando muda para a etapa e também quando já nasce nela.",
    campos: [{ nome: "estagio_id", tipo: "estagio", rotulo: "Etapa", obrigatorio: true }] },
  { id: "tempo_no_estagio", grupo: "CRM", icone: "relogio",
    rotulo: vv => `${vv.v.negocio} parad${vv.art("negocio")} numa etapa`,
    descricao: "Quando alguém fica tempo demais na mesma etapa.",
    dica: () => "Avisa uma vez cada vez que entra na etapa e passa do tempo.",
    campos: [
      { nome: "estagio_id", tipo: "estagio", rotulo: "Etapa", obrigatorio: true },
      { nome: "horas", tipo: "numero", rotulo: "Horas parado na etapa", min: 1, max: 2160, obrigatorio: true, padrao: 48, sufixo: "h" },
    ] },
  { id: "negocio_ganho", grupo: "CRM", icone: "check",
    rotulo: vv => `${vv.v.negocio} marcad${vv.art("negocio")} como «${vv.v.ganhar}»`,
    descricao: "Quando o fechamento é marcado como ganho.",
    campos: [{ nome: "funil_id", tipo: "funil", rotulo: "Só neste funil", opcional: true }] },
  { id: "negocio_perdido", grupo: "CRM", icone: "fechar",
    rotulo: vv => `${vv.v.negocio} marcad${vv.art("negocio")} como «${vv.v.perder}»`,
    descricao: "Quando o fechamento é marcado como perdido.",
    campos: [{ nome: "funil_id", tipo: "funil", rotulo: "Só neste funil", opcional: true }] },
  { id: "etiqueta_adicionada", grupo: "CRM", icone: "etiqueta",
    rotulo: () => "Etiqueta adicionada",
    descricao: "Quando alguém ganha uma etiqueta específica.",
    campos: [{ nome: "etiqueta_id", tipo: "etiqueta", rotulo: "Etiqueta", obrigatorio: true }] },
  { id: "tarefa_vencida", grupo: "CRM", icone: "tarefa",
    rotulo: () => "Tarefa venceu sem ser concluída",
    descricao: "Quando o prazo de uma tarefa passa e ela continua aberta.",
    dica: () => "Olha as tarefas não concluídas que venceram (até 7 dias atrás).",
    campos: [] },
  { id: "antes_da_data", grupo: "Agenda", icone: "relogio",
    rotulo: vv => `Antes da ${palavraConsulta(vv.vertical)} marcada`,
    descricao: "Algumas horas antes de uma data marcada (lembretes).",
    dica: vv => `Usa a data e a hora marcadas na ${vv.min("negocio")} (${palavraConsulta(vv.vertical)}). Remarcou? O lembrete sai de novo para a data nova — a mesma data nunca duas vezes.`,
    campos: [
      { nome: "campo", tipo: "campo_data", rotulo: "Data", obrigatorio: true, padrao: "consulta" },
      { nome: "horas", tipo: "numero", rotulo: "Quantas horas antes", min: 1, max: 72, obrigatorio: true, padrao: 24, sufixo: "h" },
      { nome: "funil_id", tipo: "funil", rotulo: "Só neste funil", opcional: true },
    ] },
  { id: "apos_data", grupo: "Agenda", icone: "relogio",
    rotulo: vv => `Depois da ${palavraConsulta(vv.vertical)} marcada`,
    descricao: "Algumas horas depois de uma data marcada (faltou, pós-atendimento).",
    dica: vv => `Conta a partir da data e hora da ${palavraConsulta(vv.vertical)}. Na data da ${palavraConsulta(vv.vertical)} vale qualquer negócio (aberto, ganho ou perdido): quem fechou na ${palavraConsulta(vv.vertical)} também recebe. Combine com uma condição de etapa para tratar quem faltou separado de quem veio.`,
    campos: [
      { nome: "campo", tipo: "campo_data", rotulo: "Data", obrigatorio: true, padrao: "consulta" },
      { nome: "horas", tipo: "numero", rotulo: "Quantas horas depois", min: 1, max: 720, obrigatorio: true, padrao: 2, sufixo: "h" },
      { nome: "funil_id", tipo: "funil", rotulo: "Só neste funil", opcional: true },
    ] },
  { id: "agendado", grupo: "Agenda", icone: "relogio",
    rotulo: () => "Todo dia, num horário",
    descricao: "Num horário fixo, nos dias da semana que você escolher.",
    dica: vv => `Roda uma vez por dia, para cada ${vv.min("negocio")} ${vv.conc("negocio", "aberto", "aberta")} que combina com o filtro. Use as condições para refinar.`,
    campos: [
      { nome: "horario", tipo: "hora", rotulo: "Horário", obrigatorio: true, padrao: "09:00" },
      { nome: "dias_semana", tipo: "dias_semana", rotulo: "Dias da semana", obrigatorio: true, padrao: [1, 2, 3, 4, 5] },
      { nome: "funil_id", tipo: "funil", rotulo: "Só neste funil", opcional: true },
      { nome: "estagio_id", tipo: "estagio", rotulo: "Só nesta etapa", opcional: true, filtraPor: "funil_id" },
    ] },
]);

export const GATILHO = Object.freeze(Object.fromEntries(GATILHOS.map(g => [g.id, g])));

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

/** Grupos da paleta «Adicionar passo» do editor (ordem de exibição). */
export const GRUPOS_ACAO = Object.freeze(["Mensagens", "CRM", "Equipe", "Sequência", "Inteligência artificial"]);

/**
 * Ações (passos). `campos`: tipo texto | texto_longo | numero | opcoes | estagio | funil | etiqueta | pessoa |
 * dono | para | template | parametros | departamento | sim_nao | alvo_etiqueta | modo_atribuir |
 * duracao | tarefa_ia | campo_contato
 * `mensagem: true` = sai pelo WhatsApp (respeitar horário vale para elas).
 * `sequencia: true` = passo de controle (esperar / parar): não "faz" nada sozinho.
 * `ia: true` = decisão da IA (servidor, cota de IA).
 * `disponivel: false` = aceito pelo servidor, mas escondido no editor (depende de P1 da F2).
 * `menu: false` = continua válida e editável, mas não aparece na paleta (há um passo mais simples).
 */
export const ACOES = Object.freeze([
  { id: "criar_tarefa", grupo: "Equipe", icone: "tarefa", rotulo: () => "Criar tarefa",
    descricao: "Deixa uma tarefa para alguém da equipe, com prazo.",
    campos: [
      { nome: "titulo", tipo: "texto", rotulo: "Título da tarefa", obrigatorio: true, max: 160, variaveis: true },
      { nome: "tipo_tarefa", tipo: "opcoes", rotulo: "Tipo", opcoes: TIPOS_TAREFA, padrao: "tarefa" },
      { nome: "vence_em_horas", tipo: "numero", rotulo: "Prazo (horas depois)", min: 0, max: 2160, padrao: 24, sufixo: "h" },
      { nome: "dono", tipo: "dono", rotulo: "Para quem", obrigatorio: true, padrao: "responsavel" },
    ] },
  { id: "mover_estagio", grupo: "CRM", icone: "seta-dir", rotulo: () => "Mover de etapa",
    descricao: "Passa para outra etapa do mesmo funil.",
    campos: [{ nome: "estagio_id", tipo: "estagio", rotulo: "Para a etapa", obrigatorio: true }] },
  { id: "mover_funil", grupo: "CRM", icone: "funil", rotulo: vv => `Mover ${vv.art("negocio")} ${vv.min("negocio")} de funil`,
    descricao: "Leva para outro funil, já numa etapa que você escolher.",
    campos: [
      { nome: "funil_id", tipo: "funil", rotulo: "Para o funil", obrigatorio: true, semPadrao: true },
      { nome: "estagio_id", tipo: "estagio", rotulo: "Etapa de chegada", opcional: true, filtraPor: "funil_id", ajuda: "Vazio = primeira etapa do funil." },
    ] },
  { id: "criar_negocio", grupo: "CRM", icone: "funil", rotulo: vv => `Criar ${vv.min("negocio")}`,
    descricao: "Abre um novo registro no funil para o contato.",
    campos: [
      { nome: "funil_id", tipo: "funil", rotulo: "Funil", opcional: true, ajuda: "Vazio = funil padrão." },
      { nome: "estagio_id", tipo: "estagio", rotulo: "Etapa", opcional: true, filtraPor: "funil_id", ajuda: "Vazio = primeira etapa do funil." },
      { nome: "titulo", tipo: "texto", rotulo: "Título", opcional: true, max: 120, variaveis: true },
    ] },
  { id: "enviar_mensagem", grupo: "Mensagens", icone: "enviar", mensagem: true, rotulo: () => "Enviar mensagem",
    descricao: "Manda um texto pelo WhatsApp (sai pelo CodeWords).",
    campos: [{ nome: "texto", tipo: "texto_longo", rotulo: "Mensagem", obrigatorio: true, max: 4096, variaveis: true,
      ajuda: "No WhatsApp oficial (Meta), só sai dentro da janela de 24 h desde a última mensagem do cliente; fora dela, use um modelo aprovado. No WhatsApp por aparelho (CodeWords), o texto livre sai a qualquer hora." }] },
  { id: "enviar_template", grupo: "Mensagens", icone: "whatsapp", mensagem: true, rotulo: () => "Enviar modelo aprovado",
    descricao: "Manda um modelo aprovado pela Meta (WhatsApp oficial).",
    campos: [
      { nome: "template_id", tipo: "template", rotulo: "Modelo (aprovado na Meta)", obrigatorio: true },
      { nome: "parametros", tipo: "parametros", rotulo: "Parâmetros do modelo" },
    ] },
  { id: "atribuir", grupo: "Equipe", icone: "usuario", rotulo: () => "Atribuir a conversa",
    descricao: "Passa a conversa para uma pessoa, para o rodízio ou para um departamento.",
    campos: [
      // «dono» é o campo do contrato (rodizio | conta | departamento); automações antigas gravaram «modo» (rodizio | conta)
      { nome: "dono", tipo: "modo_atribuir", rotulo: "Como", obrigatorio: true, padrao: "rodizio", legado: "modo" },
      { nome: "conta_id", tipo: "pessoa", rotulo: "Pessoa", quando: { dono: "conta" } },
      { nome: "departamento_id", tipo: "departamento", rotulo: "Mover para o departamento", opcional: true },
    ] },
  { id: "etiquetar", grupo: "CRM", icone: "etiqueta", menu: false, rotulo: () => "Pôr ou tirar etiqueta",
    descricao: "Põe ou tira uma etiqueta do contato ou da conversa.",
    campos: [
      { nome: "etiqueta_id", tipo: "etiqueta", rotulo: "Etiqueta", obrigatorio: true },
      { nome: "alvo", tipo: "alvo_etiqueta", rotulo: "Em", obrigatorio: true, padrao: "contato" },
      { nome: "remover", tipo: "sim_nao", rotulo: "Tirar a etiqueta (em vez de pôr)", padrao: false },
    ] },
  { id: "etiqueta_adicionar", grupo: "CRM", icone: "etiqueta", rotulo: () => "Pôr etiqueta",
    descricao: "Marca com uma etiqueta para achar fácil depois.",
    campos: [{ nome: "etiqueta_id", tipo: "etiqueta", rotulo: "Etiqueta", obrigatorio: true }] },
  { id: "etiqueta_remover", grupo: "CRM", icone: "etiqueta", rotulo: () => "Tirar etiqueta",
    descricao: "Remove uma etiqueta que não vale mais.",
    campos: [{ nome: "etiqueta_id", tipo: "etiqueta", rotulo: "Etiqueta", obrigatorio: true }] },
  { id: "campo_atualizar", grupo: "CRM", icone: "editar", rotulo: vv => `Preencher um campo d${vv.art("contato")} ${vv.min("contato")}`,
    descricao: "Escreve um valor num campo personalizado do cadastro.",
    campos: [
      // campos do contato e da oportunidade criados em Configurações → Campos, e a pontuação («score») que a IA também preenche
      { nome: "campo", tipo: "campo_contato", rotulo: "Campo", obrigatorio: true },
      { nome: "valor", tipo: "texto", rotulo: "Valor", obrigatorio: true, max: 200, variaveis: true },
    ] },
  { id: "nota", grupo: "CRM", icone: "nota", rotulo: () => "Anotar no histórico",
    descricao: "Deixa uma nota interna (o cliente não vê).",
    campos: [{ nome: "texto", tipo: "texto_longo", rotulo: "Nota", obrigatorio: true, max: 1000, variaveis: true }] },
  { id: "notificar", grupo: "Equipe", icone: "sino", rotulo: () => "Avisar a equipe",
    descricao: "Manda um aviso no sino para uma pessoa, um departamento ou os administradores.",
    campos: [
      { nome: "para", tipo: "para", rotulo: "Quem recebe", obrigatorio: true, padrao: "responsavel" },
      { nome: "departamento_id", tipo: "departamento", rotulo: "Departamento", obrigatorio: true, vazioRotulo: "Escolha o departamento…", quando: { para: "departamento" } },
      { nome: "titulo", tipo: "texto", rotulo: "Título do aviso", max: 120, variaveis: true, ajuda: "Se deixar vazio, o detalhe vira o título." },
      { nome: "texto", tipo: "texto_longo", rotulo: "Detalhe", opcional: true, max: 500, variaveis: true },
    ] },
  { id: "resolver_conversa", grupo: "Equipe", icone: "check", rotulo: () => "Resolver a conversa", campos: [],
    descricao: "Marca o atendimento como resolvido." },
  { id: "esperar", grupo: "Sequência", icone: "relogio", sequencia: true, rotulo: () => "Esperar um tempo",
    descricao: "Os passos seguintes só rodam depois desse tempo.",
    campos: [
      { nome: "minutos", tipo: "duracao", rotulo: "Esperar", obrigatorio: true, min: 1, max: 43200, padrao: 1440 },
      { nome: "cancelar_se_cliente_responder", tipo: "sim_nao", rotulo: "Parar se o cliente responder", padrao: true, gravaSempre: true },
    ] },
  { id: "parar", grupo: "Sequência", icone: "parar", sequencia: true, rotulo: () => "Parar por aqui", campos: [],
    descricao: "Encerra a sequência: o que vem depois não roda." },
  { id: "ia_decidir", grupo: "Inteligência artificial", icone: "ia", ia: true, rotulo: () => "Deixar a IA decidir",
    descricao: "A IA lê a conversa e escolhe entre opções que você definiu. Usa a cota de IA do mês.",
    campos: [
      { nome: "tarefa", tipo: "tarefa_ia", rotulo: "O que a IA faz", obrigatorio: true, padrao: "classificar_etapa" },
      { nome: "instrucao", tipo: "texto_longo", rotulo: "Instrução extra (opcional)", opcional: true, max: 500,
        ajuda: "Ex.: «Considere \"quero marcar\" como interesse alto». A IA só escolhe entre as etapas e opções que o sistema já tem." },
    ] },
  { id: "alerta_whatsapp", grupo: "Equipe", icone: "alerta", mensagem: true, disponivel: false, rotulo: () => "Avisar no WhatsApp do gestor",
    descricao: "Manda um alerta para o WhatsApp do gestor.",
    campos: [{ nome: "texto", tipo: "texto_longo", rotulo: "Texto do alerta", obrigatorio: true, max: 1000, variaveis: true }] },
]);

export const ACAO = Object.freeze(Object.fromEntries(ACOES.map(a => [a.id, a])));

/** Variáveis aceitas nos textos (e como parâmetros de modelo). */
export const VARIAVEIS = Object.freeze([
  ["primeiro_nome", "Primeiro nome"], ["nome", "Nome completo"], ["empresa", "Nome da empresa"],
  ["protocolo", "Protocolo do atendimento"], ["etapa", "Etapa"], ["valor", "Valor"], ["atendente", "Atendente"],
  ["data_consulta", "Data marcada (29/09)"], ["hora_consulta", "Hora marcada (14:30)"],
]);
