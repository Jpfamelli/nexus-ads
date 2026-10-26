/* ============================================================
   ÓRBITA — ajuda.js · plano 1500c · frente sis (UCC-038, UCC-101, UC-013, UC-014, UC-015)
   #/ajuda (Central de ajuda) e #/ajuda/<artigo>. Artigos curtos, locais (sem servidor e sem dado de cliente),
   busca sem acento, agrupados por área, vocabulário da vertical. O shell também usa:
   - artigosDaPaleta() → os artigos na paleta Ctrl/⌘+K (grupo «Ajuda», 3+ letras);
   - artigoDaRota(modulo) → «Ajuda desta tela» no menu Ajuda;
   - painelArtigo(ui, artigo, …) → o artigo num painel lateral, sem sair da tela.
   ============================================================ */

/** O vocabulário da vertical entra nos textos: {contatos} vira «Pacientes» no odonto. */
const troca = (t, v = {}) => String(t || "").replace(/\{(\w+)\}/g, (_, k) => (v && v[k]) || ({ contatos: "Contatos", contato: "contato", crm: "CRM", negocios: "Oportunidades" })[k] || k);

/** área → título do grupo (na ordem em que aparecem). */
export const AREAS = Object.freeze([
  ["comeco", "Começando"], ["conversas", "Conversas e WhatsApp"], ["crm", "{crm}"], ["agenda", "Agenda"],
  ["automacoes", "Automações"], ["anuncios", "Anúncios"], ["conta", "Conta e aparelho"],
]);

/** Os artigos: {id, titulo, area, palavras, passos[], link?: {rotulo, hash}}. Texto curto, verbo no imperativo, sem jargão. */
export const ARTIGOS = Object.freeze([
  { id: "primeiros-passos", area: "comeco", titulo: "Por onde começar", palavras: "comecar inicio configurar checklist primeiros passos",
    passos: ["Conecte o número de WhatsApp da empresa (Configurações › Números de WhatsApp).", "Traga seus {contatos} de uma planilha.", "Convide a equipe com o papel certo para cada pessoa.", "Abra o Início: o «Primeiros passos» mostra o que ainda falta."],
    link: { rotulo: "Abrir os primeiros passos", hash: "#/inicio?passos=1" } },
  { id: "conectar-whatsapp", area: "conversas", titulo: "Como conectar o WhatsApp", palavras: "whatsapp numero conectar meta codewords parear qr",
    passos: ["Vá em Configurações › Números de WhatsApp e toque em «Novo número».", "Escolha a conexão oficial da Meta ou o CodeWords (pareamento pelo celular).", "Siga o assistente até o número aparecer como conectado.", "Faça um teste mandando uma mensagem para o próprio número."],
    link: { rotulo: "Abrir Números de WhatsApp", hash: "#/config/numeros?assistente=novo" } },
  { id: "mensagem-nao-saiu", area: "conversas", titulo: "Por que a mensagem não saiu?", palavras: "mensagem nao saiu erro envio falhou relogio 24 horas modelo",
    passos: ["Relógio ao lado da mensagem: ela está na fila e sai quando a internet voltar.", "Passou de 24 h desde a última mensagem do cliente? O WhatsApp só aceita um modelo aprovado.", "Número desconectado (ponto vermelho em Conversas): reconecte em Configurações › Números.", "Contato bloqueado não recebe nada até um administrador desbloquear."],
    link: { rotulo: "Abrir Conversas", hash: "#/conversas" } },
  { id: "respostas-rapidas", area: "conversas", titulo: "Respostas rápidas e atalhos", palavras: "resposta rapida atalho barra frase pronta",
    passos: ["No campo de mensagem, digite «/» para ver as respostas rápidas.", "Cadastre as frases em Configurações › Respostas rápidas.", "Use Ctrl/⌘+K para buscar conversas e fazer ações sem tirar a mão do teclado."],
    link: { rotulo: "Abrir Respostas rápidas", hash: "#/config/respostas" } },
  { id: "importar-contatos", area: "crm", titulo: "Como trazer meus {contatos}", palavras: "importar planilha excel csv contatos pacientes clientes",
    passos: ["Abra o {crm} e escolha «Importar».", "Envie a planilha (CSV ou Excel salvo como CSV) com nome e telefone.", "Confira a prévia: telefones repetidos não viram cadastro duplicado.", "Acompanhe a barra; dá para pausar e continuar."],
    link: { rotulo: "Importar agora", hash: "#/crm?importar=1" } },
  { id: "funil", area: "crm", titulo: "Como funciona o funil", palavras: "funil etapa kanban oportunidade negocio ganho perdido",
    passos: ["Cada cartão é uma oportunidade de venda; arraste entre as etapas.", "Ganho pede o valor; perdido pede o motivo.", "Ajuste as etapas em Configurações › Funis e etapas."],
    link: { rotulo: "Abrir o {crm}", hash: "#/crm" } },
  { id: "agenda", area: "agenda", titulo: "Como marcar e confirmar horários", palavras: "agenda consulta horario marcar confirmar lembrete",
    passos: ["Toque num horário livre da Agenda ou use «Marcar» na paleta.", "Escolha o {contato}, o serviço e a duração.", "O lembrete automático pede a confirmação pelo WhatsApp (se ligado em Automações)."],
    link: { rotulo: "Abrir a Agenda", hash: "#/agenda" } },
  { id: "criar-automacao", area: "automacoes", titulo: "Como criar uma automação", palavras: "automacao robo fluxo regra gatilho quando entao receita",
    passos: ["Em Automações, comece por uma receita pronta ou por «Nova automação».", "Escolha o «Quando» (ex.: mensagem nova) e os passos (ex.: responder, mover etapa).", "Use «Testar» para simular antes de ligar.", "Ligue a automação; o histórico mostra cada execução."],
    link: { rotulo: "Abrir Automações", hash: "#/automacoes" } },
  { id: "anuncios-leads", area: "anuncios", titulo: "De onde vêm os leads dos anúncios", palavras: "anuncio lead meta google campanha origem retorno roas",
    passos: ["Conecte as contas de anúncio em Configurações › Anúncios.", "Instale o script do site (Configurações › Site e anúncios) para saber a campanha de cada contato.", "Em Anúncios, compare gasto, conversas e vendas por campanha."],
    link: { rotulo: "Abrir Anúncios", hash: "#/anuncios" } },
  { id: "convidar-equipe", area: "conta", titulo: "Como convidar a equipe", palavras: "convidar equipe usuario pessoa papel atendente supervisor administrador",
    passos: ["Em Configurações › Usuários e convites, toque em «Convidar».", "Escolha o papel: atendente, supervisor, administrador ou somente leitura.", "Envie o link pelo WhatsApp; ele vale por alguns dias."],
    link: { rotulo: "Convidar agora", hash: "#/config/usuarios?convidar=1" } },
  { id: "senha", area: "conta", titulo: "Trocar ou recuperar a senha", palavras: "senha esqueci trocar recuperar acesso entrar",
    passos: ["Para trocar: Perfil e senha, no menu da sua conta.", "Esqueceu? Peça ao administrador da empresa um link de nova senha.", "Senha fácil (12345678, o seu nome) não é aceita."],
    link: { rotulo: "Abrir Perfil e senha", hash: "#/config/perfil" } },
  { id: "instalar-app", area: "conta", titulo: "Instalar o app e receber avisos", palavras: "instalar app celular aviso notificacao som tela inicial",
    passos: ["No celular, use «Instalar o app» no menu da conta (no iPhone: Compartilhar › Adicionar à Tela de Início).", "Em Conversas, ligue os avisos de mensagem nova.", "Com o app instalado, o número de não lidas aparece no ícone."] },
  { id: "situacao", area: "conta", titulo: "O sistema está lento ou fora do ar", palavras: "lento fora do ar sem internet servidor caiu erro situacao",
    passos: ["Uma faixa no topo diz se é a internet deste aparelho ou o servidor.", "Sem internet, a tela mostra o que estava salvo neste aparelho; nada que você digitou se perde.", "Menu Ajuda › Situação dos serviços mostra a conexão, os números e a versão."] },
]);

/** rota (módulo do shell) → artigo de «Ajuda desta tela». */
export const ARTIGO_DA_ROTA = Object.freeze({
  inicio: "primeiros-passos", conversas: "mensagem-nao-saiu", crm: "funil", contatos: "importar-contatos", agenda: "agenda",
  automacoes: "criar-automacao", anuncios: "anuncios-leads", relatorios: "anuncios-leads", config: "conectar-whatsapp",
});

const norm = s => String(s ?? "").normalize("NFD").replace(/[̀-ͯ]/g, "").toLowerCase().replace(/\s+/g, " ").trim();

/** Artigo por id (null se não existe). */
export function artigo(id) { return ARTIGOS.find(a => a.id === id) || null; }
/** Artigo de «Ajuda desta tela» (null quando a tela não tem). */
export function artigoDaRota(modulo) { return Object.hasOwn(ARTIGO_DA_ROTA, modulo || "") ? artigo(ARTIGO_DA_ROTA[modulo]) : null; }

/** Busca sem acento: todas as palavras do termo precisam aparecer (título, palavras ou passos); título conta mais. Sem termo, todos. */
export function buscarArtigos(termo, { vocab = {}, lista = ARTIGOS } = {}) {
  const t = norm(termo);
  if (!t) return lista.slice();
  const r = [];
  lista.forEach((a, i) => {
    const titulo = norm(troca(a.titulo, vocab)), resto = norm(`${a.palavras} ${a.passos.map(p => troca(p, vocab)).join(" ")}`);
    let pontos = 0;
    for (const tok of t.split(" ")) {
      if (titulo.includes(tok)) pontos += 3;
      else if (resto.includes(tok)) pontos += 1;
      else return;
    }
    r.push({ a, pontos, i });
  });
  return r.sort((x, y) => y.pontos - x.pontos || x.i - y.i).map(x => x.a);
}

/** plano 1500c · UC-014: os artigos para a paleta (grupo «Ajuda») — só com 3+ letras digitadas, peso menor que as ações. */
export function artigosDaPaleta(termo, { vocab = {}, max = 4 } = {}) {
  if (norm(termo).length < 3) return [];
  return buscarArtigos(termo, { vocab }).slice(0, max).map(a => ({ id: `ajuda.${a.id}`, rotulo: troca(a.titulo, vocab), hash: `#/ajuda/${a.id}`, icone: "ajuda", grupo: "Ajuda" }));
}

/** O artigo como elemento (título h2/h3, passos numerados e o link para a tela). */
export function painelArtigo(ui, a, { vocab = {}, nivel = 2, navegar = null } = {}) {
  const h = ui.h;
  const link = a.link ? h("a", { class: "bt bt-sec bt-p", href: a.link.hash }, ui.icone("seta-dir"), troca(a.link.rotulo, vocab)) : null;
  if (link && typeof navegar === "function") link.addEventListener("click", ev => { ev.preventDefault(); navegar(a.link.hash); });
  return h("article", { class: "ajuda-artigo pilha-p", "aria-labelledby": `aj-${a.id}` },
    h(nivel === 3 ? "h3" : "h2", { id: `aj-${a.id}` }, troca(a.titulo, vocab)),
    h("ol", { class: "ajuda-passos" }, a.passos.map(p => h("li", null, troca(p, vocab)))),
    link);
}

let _limpar = [];
export function desmontar() { for (const f of _limpar) try { f(); } catch { /* ok */ } _limpar = []; }

/** #/ajuda e #/ajuda/<id> */
export async function montar(ctx) {
  desmontar();
  const { ui } = ctx;
  const h = ui.h;
  const v = ctx.vocab || {};
  const marca = ctx.shell && typeof ctx.shell.marcaEfetiva === "function" ? ctx.shell.marcaEfetiva() || {} : {};
  const id = ctx.rota && ctx.rota.partes ? ctx.rota.partes[0] : null;
  const rodape = marca.suporte_wa
    ? h("p", { class: "ajuda-rodape" }, "Ainda com dúvida? ", h("a", { href: ui.linkWhatsApp("Olá! Tenho uma dúvida sobre o sistema.", marca.suporte_wa), target: "_blank", rel: "noopener noreferrer" }, "Falar com o suporte"))
    : h("p", { class: "ajuda-rodape fraco" }, "Ainda com dúvida? Fale com o administrador da sua empresa.");
  ui.limpar(ctx.alvo);
  const a = id ? artigo(id) : null;
  if (a) {
    ctx.titulo(troca(a.titulo, v));
    ctx.alvo.appendChild(h("div", { class: "ajuda pilha" },
      ui.cabecalho({ rotulo: "Central de ajuda", titulo: troca(a.titulo, v), acoes: h("a", { class: "bt bt-sec bt-p", href: "#/ajuda" }, ui.icone("seta-esq"), "Todos os artigos") }),
      painelArtigo(ui, { ...a, titulo: "Passo a passo" }, { vocab: v, navegar: ctx.navegar }), rodape));
    return;
  }
  ctx.titulo("Central de ajuda");
  const busca = h("input", { type: "search", class: "ajuda-busca", placeholder: "Buscar na ajuda (ex.: conectar whatsapp)", "aria-label": "Buscar na ajuda" });
  const lista = h("div", { class: "ajuda-lista pilha" });
  const resumo = h("p", { class: "sr-only", role: "status" });
  const desenhar = () => {
    ui.limpar(lista);
    const achados = buscarArtigos(busca.value, { vocab: v });
    if (!achados.length) { lista.appendChild(h("p", { class: "fraco" }, "Nenhum artigo com essas palavras. Tente outras ou fale com o suporte.")); resumo.textContent = "Nenhum artigo encontrado"; return; }
    resumo.textContent = `${achados.length} artigo${achados.length === 1 ? "" : "s"}`;
    for (const [area, tituloArea] of AREAS) {
      const daArea = achados.filter(x => x.area === area);
      if (!daArea.length) continue;
      lista.appendChild(h("section", { class: "ajuda-area", "aria-label": troca(tituloArea, v) },
        h("h2", { class: "rotulo" }, troca(tituloArea, v)),
        h("ul", { class: "ajuda-itens" }, daArea.map(x => h("li", null, h("a", { href: `#/ajuda/${x.id}` }, troca(x.titulo, v)))))));
    }
  };
  let t = null;
  const aoDigitar = () => { clearTimeout(t); t = setTimeout(desenhar, 120); };
  busca.addEventListener("input", aoDigitar);
  _limpar.push(() => clearTimeout(t));
  const inicial = ctx.rota && ctx.rota.query ? ctx.rota.query.q : "";
  if (inicial) busca.value = String(inicial).slice(0, 80);
  ctx.alvo.appendChild(h("div", { class: "ajuda pilha" },
    ui.cabecalho({ rotulo: "Ajuda", titulo: "Central de ajuda", sub: "Respostas curtas para as dúvidas mais comuns." }),
    busca, resumo, lista, rodape));
  desenhar();
}
