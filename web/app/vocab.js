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
const BASE = {
  odonto: {
    contato: "Paciente", contatos: "Pacientes", g_contato: "o",
    negocio: "Oportunidade", negocios: "Oportunidades", g_negocio: "a",
    servico: "Procedimento", servicos: "Procedimentos", g_servico: "o",
    ganhar: "Fechou", perder: "Não fechou",
    crm: "Pacientes",
  },
  oficina: {
    contato: "Cliente", contatos: "Clientes", g_contato: "o",
    negocio: "Orçamento", negocios: "Orçamentos", g_negocio: "o",
    servico: "Serviço", servicos: "Serviços", g_servico: "o",
    ganhar: "Aprovado", perder: "Recusado",
    crm: "Orçamentos",
  },
  loja: {
    contato: "Cliente", contatos: "Clientes", g_contato: "o",
    negocio: "Venda", negocios: "Vendas", g_negocio: "a",
    servico: "Produto", servicos: "Produtos", g_servico: "o",
    ganhar: "Vendido", perder: "Não comprou",
    crm: "Vendas",
  },
  generico: {
    contato: "Contato", contatos: "Contatos", g_contato: "o",
    negocio: "Negócio", negocios: "Negócios", g_negocio: "o",
    servico: "Serviço", servicos: "Serviços", g_servico: "o",
    ganhar: "Ganho", perder: "Perdido",
    crm: "CRM",
  },
};

export const CHAVES = Object.freeze(["contato", "contatos", "negocio", "negocios", "servico", "servicos", "ganhar", "perder", "crm"]);

/** Vocabulário completo da vertical (vertical desconhecida → generico). */
export function vocab(vertical) {
  const b = BASE[VERTICAIS.includes(vertical) ? vertical : "generico"];
  const v = { vertical: VERTICAIS.includes(vertical) ? vertical : "generico", ...b };
  const minusc = s => s.charAt(0).toLowerCase() + s.slice(1);
  /** a palavra em minúscula ("pacientes"). */
  v.min = chave => minusc(String(v[chave] ?? chave));
  /** "Nenhuma oportunidade" / "Nenhum paciente". */
  v.nenhum = chave => {
    const sing = chave.endsWith("s") && v[chave.slice(0, -1)] ? chave.slice(0, -1) : chave;
    return (v["g_" + sing] === "a" ? "Nenhuma " : "Nenhum ") + minusc(v[sing]);
  };
  /** "Nova oportunidade" / "Novo orçamento". */
  v.novo = chave => (v["g_" + chave] === "a" ? "Nova " : "Novo ") + minusc(v[chave]);
  /** artigo: "a"/"o". */
  v.art = chave => v["g_" + chave] === "a" ? "a" : "o";
  /** ícone do CRM no menu (dente, chave, sacola ou funil) */
  v.icone_crm = ICONE_CRM[v.vertical] || "funil";
  return Object.freeze(v);
}

/** Ícone do sprite (index.html) da entrada do CRM no menu, por vertical: dente, chave, sacola ou funil (genérico). */
export const ICONE_CRM = Object.freeze({ odonto: "dente", oficina: "chave", loja: "sacola", generico: "funil" });

export const ROTULO_PAPEL = Object.freeze({
  super: "Plataforma", gestor: "Gestor", admin: "Administrador", supervisor: "Supervisor",
  atendente: "Atendente", leitura: "Somente leitura",
});

export const ROTULO_STATUS = Object.freeze({
  ativo: "Ativo", teste: "Em teste", suspenso: "Suspenso", cancelado: "Cancelado",
});

export const ROTULO_MODULO = Object.freeze({
  crm: "CRM", conversas: "Conversas", relatorios: "Relatórios", ads: "Anúncios",
  automacoes: "Automações", marca: "Marca própria",
});
