/* ============================================================
   ÓRBITA — vocab.js (PURO, sem imports) · frente F3 · ESPEC §7.6
   Vocabulário da interface por vertical do cliente.
   Uso: const v = vocab('odonto'); v.contato → "Paciente";
        v.nenhum('negocio') → "Nenhuma oportunidade"; v.min('contatos') → "pacientes".
   ============================================================ */

export const VERTICAIS = Object.freeze(["odonto", "oficina", "loja", "generico"]);

export const ROTULO_VERTICAL = Object.freeze({
  odonto: "Clínica odontológica", oficina: "Oficina mecânica", loja: "Loja", generico: "Outro negócio",
});

// g_* = gênero da palavra ("a" feminino, "o" masculino) para "Nenhum/Nenhuma", "novo/nova"
// plano 1000b · RB-039: compromisso/compromissos = o que a Agenda marca na vertical (consulta · visita · entrega), a MESMA palavra de
// rel-logica.palavraAgenda e crm-negocio.nomeCompromisso — um lugar só para a palavra e o gênero (sempre feminina)
const BASE = {
  odonto: {
    contato: "Paciente", contatos: "Pacientes", g_contato: "o",
    negocio: "Oportunidade", negocios: "Oportunidades", g_negocio: "a",
    servico: "Procedimento", servicos: "Procedimentos", g_servico: "o",
    ganhar: "Fechou", perder: "Não fechou",
    crm: "Pacientes",
    compromisso: "Consulta", compromissos: "Consultas", g_compromisso: "a",
    // plano 2000d · DR-058 (pendência da frente crm): o funil pela vertical (o quadro lê k.v.funil || "Funil"). Na clínica fica «Funil»:
    // «Atendimento» já é o nome das conversas no app («Atendimento agora», relatório de atendimento) e confundiria
    funil: "Funil", funis: "Funis", g_funil: "o",
    // plano 2000d · DR-172 (pendência da frente crm): a tela de empresas pela vertical — «empresa parceira» na clínica (convênio empresarial;
    // «Convênio» sozinho seria o plano odontológico), «frota» na oficina
    empresa: "Empresa parceira", empresas: "Empresas parceiras", g_empresa: "a",
  },
  oficina: {
    contato: "Cliente", contatos: "Clientes", g_contato: "o",
    negocio: "Orçamento", negocios: "Orçamentos", g_negocio: "o",
    servico: "Serviço", servicos: "Serviços", g_servico: "o",
    ganhar: "Aprovado", perder: "Recusado",
    crm: "Orçamentos",
    compromisso: "Visita", compromissos: "Visitas", g_compromisso: "a",
    funil: "Funil", funis: "Funis", g_funil: "o",
    empresa: "Frota", empresas: "Frotas", g_empresa: "a",
  },
  loja: {
    contato: "Cliente", contatos: "Clientes", g_contato: "o",
    negocio: "Venda", negocios: "Vendas", g_negocio: "a",
    servico: "Produto", servicos: "Produtos", g_servico: "o",
    ganhar: "Vendido", perder: "Não comprou",
    crm: "Vendas",
    compromisso: "Entrega", compromissos: "Entregas", g_compromisso: "a",
    funil: "Funil", funis: "Funis", g_funil: "o",
    empresa: "Empresa", empresas: "Empresas", g_empresa: "a",
  },
  generico: {
    contato: "Contato", contatos: "Contatos", g_contato: "o",
    negocio: "Negócio", negocios: "Negócios", g_negocio: "o",
    servico: "Serviço", servicos: "Serviços", g_servico: "o",
    ganhar: "Ganho", perder: "Perdido",
    crm: "CRM",
    compromisso: "Consulta", compromissos: "Consultas", g_compromisso: "a",
    funil: "Funil", funis: "Funis", g_funil: "o",
    empresa: "Empresa", empresas: "Empresas", g_empresa: "a",
  },
};

// plano 1500c · RC-251: a palavra da agenda (compromisso/compromissos) também é chave — um teste que percorre CHAVES pega a vertical sem ela
// plano 2000d · DR-058/DR-172: funil/funis e empresa/empresas também são chaves de toda vertical
export const CHAVES = Object.freeze(["contato", "contatos", "negocio", "negocios", "servico", "servicos", "ganhar", "perder", "crm", "compromisso", "compromissos",
  "funil", "funis", "empresa", "empresas"]);

/** plano 2000d · DR-138 (pendência da frente crm): «1 tarefa» / «3 tarefas» com as duas formas dadas (sem vocabulário). */
export const plural = (n, um, varios) => `${n} ${Number(n) === 1 ? um : varios}`;

/**
 * plano 2000d · IY-001: o plural em português de uma palavra fora do BASE — «ligação» → «ligações», «mensagem» → «mensagens»,
 * «canal» → «canais» (só as regras regulares: -ão → -ões, -m → -ns, -al/-el/-ol/-ul → -is, -il → -is, -r/-z → -es; terminada em «s» fica; o resto ganha «s»).
 */
export function pluralPt(palavra) {
  const p = String(palavra ?? "");
  if (!p) return p;
  if (/ão$/.test(p)) return p.replace(/ão$/, "ões");
  if (/ÃO$/.test(p)) return p.replace(/ÃO$/, "ÕES");
  if (/[aeiou]m$/i.test(p)) return p.replace(/m$/i, m => (m === "M" ? "NS" : "ns"));
  if (/[aeou]l$/i.test(p)) return p.replace(/l$/i, l => (l === "L" ? "IS" : "is"));
  if (/il$/i.test(p)) return p.replace(/l$/i, l => (l === "L" ? "S" : "s"));     // funil → funis
  if (/[rz]$/i.test(p)) return `${p}${/[RZ]$/.test(p) ? "ES" : "es"}`;
  if (/s$/i.test(p)) return p;
  return `${p}s`;
}
/** plano 2000d · IY-003: «Odonto », «OFICINA» → «odonto», «oficina» (o cadastro pode vir com maiúscula ou espaço); o resto → null. */
export function normalizarVertical(vertical) {
  const v = String(vertical ?? "").trim().toLowerCase();
  return VERTICAIS.includes(v) ? v : null;
}

/**
 * plano 1500c · RC-248: gênero de palavras comuns da interface que não mudam por vertical (fora do BASE) — v.novo("tarefa") = «Nova tarefa»
 * (antes «Novo tarefa»). A vertical (g_* do BASE) sempre vence esta tabela.
 */
export const GENERO_COMUM = Object.freeze({
  tarefa: "a", nota: "a", etiqueta: "a", empresa: "a", conversa: "a", mensagem: "a", campanha: "a", meta: "a", automacao: "a", automação: "a",
  resposta: "a", lista: "a", visao: "a", visão: "a", regra: "a", pessoa: "a", equipe: "a", agenda: "a", origem: "a", etapa: "a", ligacao: "a", ligação: "a",
  funil: "o", lead: "o", departamento: "o", modelo: "o", numero: "o", número: "o", relatorio: "o", relatório: "o", usuario: "o", usuário: "o", lembrete: "o",
  // plano 2000d · IY-004: as palavras da agenda e do funil usadas soltas («Nova consulta», não «Novo consulta»)
  consulta: "a", visita: "a", entrega: "a", sessao: "a", sessão: "a", revisao: "a", revisão: "a", venda: "a", oportunidade: "a", avaliacao: "a", avaliação: "a",
  orcamento: "o", orçamento: "o", atendimento: "o", horario: "o", horário: "o", pedido: "o", convenio: "o", convênio: "o",
});

/** Vocabulário completo da vertical (vertical desconhecida → generico). */
export function vocab(vertical) {
  // plano 2000d · IY-003: «Odonto» (cadastro com maiúscula) não cai mais no genérico
  const vert = normalizarVertical(vertical) || "generico";
  const b = BASE[vert];
  const v = { vertical: vert, ...b };
  // plano 1000b · RB-188: chave sem palavra não lança (s.charAt de undefined) — cai na própria chave, como v.min sempre fez
  // plano 2000d · DR-146: sigla fica como está — v.min("crm") no genérico é «CRM» (antes «cRM»); só a 1ª letra de palavra comum desce
  const minusc = s => { const t = String(s ?? ""); return /^[A-ZÀ-Ý]{2,}\b/.test(t) ? t : t.charAt(0).toLowerCase() + t.slice(1); };
  const palavra = chave => v[chave] ?? chave;
  // plano 1500c · RC-248: o gênero da vertical (g_*) e, fora dela, o da tabela GENERO_COMUM (minúsculas; «tarefas» → «tarefa»)
  const genero = chave => {
    const k = String(chave ?? "");
    if (v["g_" + k]) return v["g_" + k];
    const b = k.toLowerCase();
    return GENERO_COMUM[b] || (b.endsWith("s") ? GENERO_COMUM[b.slice(0, -1)] : null) || "o";
  };
  /** a palavra em minúscula ("pacientes"). */
  v.min = chave => minusc(palavra(chave));
  // plano 2000d · IY-005: a chave no plural irregular volta ao singular («funis» → «funil»), não só tirando o «s»
  const singularDe = k => {
    if (!k.endsWith("s")) return k;
    if (v[k.slice(0, -1)] || GENERO_COMUM[k.slice(0, -1).toLowerCase()]) return k.slice(0, -1);
    return Object.keys(b).find(x => !x.startsWith("g_") && x !== k && pluralPt(x) === k) || k;
  };
  /** "Nenhuma oportunidade" / "Nenhum paciente". */
  v.nenhum = chave => {
    const k = String(chave ?? "");
    const sing = singularDe(k);
    return (genero(sing) === "a" ? "Nenhuma " : "Nenhum ") + minusc(palavra(sing));
  };
  /** "Nova oportunidade" / "Novo orçamento". */
  v.novo = chave => (genero(chave) === "a" ? "Nova " : "Novo ") + minusc(palavra(chave));
  /** artigo: "a"/"o". */
  v.art = chave => genero(chave) === "a" ? "a" : "o";
  /**
   * plano 2000d · DR-147: «1 paciente» / «3 pacientes» / «0 pacientes» pelas formas do vocabulário (chave no singular ou no plural);
   * chave sem plural no BASE ganha «s». v.plural(1, "contato") → «1 paciente».
   */
  v.plural = (n, chave) => {
    const k = String(chave ?? "");
    const sing = singularDe(k);     // plano 2000d · IY-005
    // plano 2000d · IY-001: fora do BASE o plural segue as regras do português («2 ligações», não «2 ligaçãos»)
    const pl = v[sing + "s"] ?? pluralPt(palavra(sing));
    // plano 2000d · IY-002: sem número (null, vazio) é «— pacientes», não «0 pacientes» (zero de mentira esconde o dado que faltou)
    const vazio = n === null || n === undefined || (typeof n === "string" && !n.trim());
    const q = vazio ? NaN : Number(n);
    const num = Number.isFinite(q) ? q.toLocaleString("pt-BR") : vazio ? "—" : String(n);
    return `${num} ${minusc(Math.abs(q) === 1 ? palavra(sing) : pl)}`;
  };
  /**
   * plano 2000d · DR-318: o adjetivo concorda com a palavra da vertical — v.adj("ganho", "negocio") na loja = «ganha» («Venda ganha», não
   * «Venda ganho»); `n` ≠ 1 vai para o plural («ganhas»). Só adjetivo terminado em «o».
   */
  v.adj = (masc, chave, n = 1) => {
    const base = String(masc ?? "");
    const k = String(chave ?? "");
    const sing = singularDe(k);     // plano 2000d · IY-005
    const f = genero(sing) === "a" && /o$/.test(base) ? base.replace(/o$/, "a") : base;
    return Number(n) === 1 ? f : `${f}s`;
  };
  /** ícone do CRM no menu (dente, chave, sacola ou funil) */
  v.icone_crm = ICONE_CRM[v.vertical] || "funil";
  return Object.freeze(v);
}

/** Ícone do sprite (index.html) da entrada do CRM no menu, por vertical: dente, chave, sacola ou funil (genérico). */
export const ICONE_CRM = Object.freeze({ odonto: "dente", oficina: "chave", loja: "sacola", generico: "funil" });

export const ROTULO_PAPEL = Object.freeze({
  super: "Plataforma", gestor: "Gestor", admin: "Administrador", supervisor: "Supervisor",
  atendente: "Atendente", leitura: "Somente leitura",
  marketing: "Marketing",     // plano 2000d · DU-110 (pendência da frente sis): o papel novo (rotas.ROTULOS_PAPEL já tem)
});

export const ROTULO_STATUS = Object.freeze({
  ativo: "Ativo", teste: "Em teste", suspenso: "Suspenso", cancelado: "Cancelado",
});

export const ROTULO_MODULO = Object.freeze({
  crm: "CRM", conversas: "Conversas", relatorios: "Relatórios", ads: "Anúncios",
  automacoes: "Automações", marca: "Marca própria",
});
