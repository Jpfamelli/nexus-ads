/* ============================================================
   ÓRBITA — crm-logica.js (PURO, sem imports) · frente F4 · ESPEC §5.3, §7.7 T5–T10
   Regras do CRM que não dependem de DOM nem de rede — os testes Node
   (testes/crm.teste.mjs) importam este arquivo direto do disco.
   - telefone: normalizarTelefone / telChave (MESMA regra de
     nx_tel_normalizar / nx_tel_chave do banco)
   - CSV: lerCSV (; , tab, aspas, quebra de linha dentro de aspas, BOM, CRLF),
     sugerirMapeamento, montarLinhas, lotes
   - kanban: ordemEntre, previsao, filtrar (local), moverLocal
   - campos personalizados: validarCampo, valorCampoTexto
   - textos: tituloCard, textoErro, textoTempo, relativoDias
   ============================================================ */

/* ------------------------------------------------------------ texto */
/** minúscula e sem acento (mesma ideia do unaccent do banco). */
export function semAcento(s) {
  return String(s ?? "").normalize("NFD").replace(/[̀-ͯ]/g, "").toLowerCase();
}

/** plano 1000b · RB-207: id único para ligar um <label for> ao controle (gaveta e modal abertos juntos não disputam o mesmo id). */
let seqId = 0;
export function idUnico(prefixo = "crm") {
  seqId += 1;
  return `${prefixo}-${seqId.toString(36)}-${Math.random().toString(36).slice(2, 7)}`;
}

/** plano 1000b · RB-122: o começo de um texto numa linha (para rótulos de botão): espaços juntados, até `max` caracteres com «…». */
export function resumoTexto(s, max = 30) {
  const t = String(s ?? "").replace(/\s+/g, " ").trim();
  return t.length > max ? `${t.slice(0, max - 1).trimEnd()}…` : t;
}

/** plano 1000b · RB-117: tarefa atrasada = não concluída e (o servidor disse atrasada OU o prazo já passou agora). */
export function tarefaAtrasada(t, agora = Date.now()) {
  if (!t || t.concluida_em) return false;
  if (t.atrasada) return true;
  const v = Date.parse(t.vence_em);
  return Number.isFinite(v) && v < Number(agora);
}

/** "Ana Maria Souza" → "AS"; "" → "?" */
export function iniciais(nome) {
  const p = String(nome || "").trim().split(/\s+/).filter(Boolean);
  if (!p.length) return "?";
  return ((p[0][0] || "") + (p.length > 1 ? p[p.length - 1][0] : (p[0][1] || ""))).toUpperCase();
}

/* ------------------------------------------------------------ telefone */
/** DDDs em uso no Brasil (Anatel) — a mesma lista de public.nx_ddd_valido (migração 20261008a). */
export const RE_DDD = /^(1[1-9]|2[12478]|3[1-578]|4[1-9]|5[13-5]|6[1-9]|7[13-579]|8[1-9]|9[1-9])$/;   // plano 1000b · CB-005: sem o DDD 29 (não existe), igual a cv-logica.DDD_VALIDO
export function dddValido(ddd) { return RE_DDD.test(String(ddd ?? "")); }

/** Zero de tronco fora (DDD nunca começa com 0): 012997773031 → 12997773031. */
function semZeroDeTronco(d) {
  return d[0] === "0" && (d.length === 11 || d.length === 12) && d[1] !== "0" ? d.slice(1) : d;
}
/** 10–11 dígitos sem DDI que formam um número brasileiro: DDD válido e, com 11, o 3º dígito é o 9 do celular; com 10, o 3º vai de 2 a 9. */
function pareceBrasileiro(d) {
  return dddValido(d.slice(0, 2)) && ((d.length === 11 && d[2] === "9") || (d.length === 10 && d[2] >= "2" && d[2] <= "9"));
}

/**
 * Igual a public.nx_tel_normalizar (S-B5): só dígitos. comDdi (número do WhatsApp) OU texto começando com «+» (a pessoa informou o país):
 * 8–15 dígitos como está, nunca ganha 55. Digitado/importado: zero de tronco fora; 10–11 dígitos SÓ ganham 55 quando parecem brasileiros
 * (DDD válido e 3º dígito certo) — «1 212 555 1234» sem «+» → null (o servidor responde dados_invalidos|telefone); 12–15 como está.
 */
export function normalizarTelefone(p, comDdi = false) {
  const txt = String(p ?? "");
  let d = txt.replace(/\D/g, "");
  if (comDdi || txt.trim().startsWith("+")) return d.length >= 8 && d.length <= 15 ? d : null;
  d = semZeroDeTronco(d);
  if (d.length >= 10 && d.length <= 11) return pareceBrasileiro(d) ? "55" + d : null;
  if (d.length >= 12 && d.length <= 15) return d;
  return null;
}

/**
 * Telefone digitado/importado SEM «+» com 10–11 dígitos que não formam um número brasileiro (DDD inexistente ou 3º dígito errado):
 * quase sempre um número de outro país sem o código — antes ganhava 55 na frente e virava um número inexistente (C7).
 */
export function telefoneSemPais(p) {
  const txt = String(p ?? "");
  if (txt.trim().startsWith("+")) return false;
  const d = semZeroDeTronco(txt.replace(/\D/g, ""));
  return d.length >= 10 && d.length <= 11 && !pareceBrasileiro(d);
}

/**
 * C7: como o telefone de uma linha da planilha vai entrar → {tipo, texto}. «br» (ganha 55; texto no formato brasileiro), «exterior» (veio com «+»
 * de outro país: fica como está, texto «+1 2125551234»), «sem_pais» (10–11 dígitos sem DDD brasileiro: entraria como número inexistente — a linha
 * entra sem telefone), «invalido» e «vazio». O texto do «br» é montado por `fmtBR` (ui.telBR) quando dado.
 */
export function telefoneImportado(p, { fmtBR = null } = {}) {
  const txt = String(p ?? "").trim();
  if (!txt.replace(/\D/g, "")) return { tipo: "vazio", texto: "" };
  const n = normalizarTelefone(txt);
  if (!n) return { tipo: telefoneSemPais(txt) ? "sem_pais" : "invalido", texto: txt };
  if (n.startsWith("55") && (n.length === 12 || n.length === 13)) return { tipo: "br", texto: fmtBR ? fmtBR(n) : n };
  const ddi = /^(1|7|2[07]|3[0-469]|4[013-9]|5[1-8]|6[0-6]|8[1246]|9[0-58])/.exec(n);
  return { tipo: "exterior", texto: ddi ? `+${ddi[1]} ${n.slice(ddi[1].length)}` : `+${n}` };
}

/**
 * Igual a public.nx_tel_chave (S-B5): recebe o telefone JÁ normalizado. 12–13 dígitos começando com 55 → tira o 55 e, se sobrar 11 com
 * o 3º = 9 e o 4º de 6 a 9 (o 9 do celular), tira esse 9 — o fixo 551233334444 e o 5512933334444 ficam separados. Nunca acrescenta 55.
 */
export function telChave(p) {
  if (p === null || p === undefined) return null;
  const s0 = String(p);
  if (s0.length >= 12 && s0.length <= 13 && s0.startsWith("55")) {
    let s = s0.slice(2);
    if (s.length === 11 && s[2] === "9" && s[3] >= "6" && s[3] <= "9") s = s.slice(0, 2) + s.slice(3);
    return s;
  }
  return s0;
}

/** Mesma pessoa? (compara as chaves dos telefones digitados) */
export function mesmoTelefone(a, b) {
  const ka = telChave(normalizarTelefone(a)), kb = telChave(normalizarTelefone(b));
  return !!ka && ka === kb;
}

/* ------------------------------------------------------------ CSV */
const SEPARADORES = [";", ",", "\t"];

/** Conta separadores FORA de aspas numa linha (para detectar o separador). */
function contarFora(linha, sep) {
  let n = 0, dentro = false;
  for (let i = 0; i < linha.length; i++) {
    const c = linha[i];
    if (c === '"') { if (dentro && linha[i + 1] === '"') { i++; continue; } dentro = !dentro; }
    else if (!dentro && c === sep) n++;
  }
  return n;
}

/** Primeiras n linhas LÓGICAS (quebra de linha dentro de aspas não conta). */
function primeirasLinhas(s, n) {
  const out = [];
  let ini = 0, dentro = false;
  for (let i = 0; i < s.length && out.length < n; i++) {
    const c = s[i];
    if (c === '"') { if (dentro && s[i + 1] === '"') { i++; continue; } dentro = !dentro; }
    else if (!dentro && (c === "\n" || c === "\r")) {
      out.push(s.slice(ini, i));
      if (c === "\r" && s[i + 1] === "\n") i++;
      ini = i + 1;
    }
  }
  if (out.length < n && ini < s.length) out.push(s.slice(ini));
  return out;
}

/** Separador mais provável olhando as primeiras linhas (; ganha empate — padrão do Excel brasileiro). */
export function detectarSeparador(texto) {
  const linhas = primeirasLinhas(String(texto).replace(/^﻿/, ""), 12).filter(l => l.trim()).slice(0, 10);
  if (!linhas.length) return ";";
  let melhor = ";", pontos = -1;
  for (const sep of SEPARADORES) {
    const cont = linhas.map(l => contarFora(l, sep));
    const min = Math.min(...cont);
    if (min === 0) continue;
    const constante = cont.every(c => c === cont[0]);
    const p = min * 10 + (constante ? 5 : 0) + (sep === ";" ? 1 : 0);
    if (p > pontos) { pontos = p; melhor = sep; }
  }
  return melhor;
}

/**
 * lerCSV(texto, {separador?, limite?}) → {separador, cabecalho:[..], linhas:[[..]], numeros:[n], total, cortado}
 * numeros[i] = número da linha da planilha (cabeçalho = 1, contando as linhas vazias) — vai nos erros da importação.
 * RFC 4180 tolerante: aspas duplas escapadas (""), separador e quebra de linha dentro de aspas,
 * BOM, CRLF/CR/LF, linhas vazias ignoradas, colunas faltando viram "".
 */
export function lerCSV(texto, { separador, limite = 20000 } = {}) {
  let s = String(texto ?? "");
  if (s.charCodeAt(0) === 0xFEFF) s = s.slice(1);
  const sep = separador || detectarSeparador(s);
  const registros = [], nums = [];
  let campo = "", linha = [], dentro = false, i = 0, nReg = 0;
  const fimCampo = () => { linha.push(campo); campo = ""; };
  const fimLinha = () => { fimCampo(); nReg++; if (linha.some(c => c.trim() !== "")) { registros.push(linha); nums.push(nReg); } linha = []; };
  while (i < s.length) {
    const c = s[i];
    if (dentro) {
      if (c === '"') {
        if (s[i + 1] === '"') { campo += '"'; i += 2; continue; }
        dentro = false; i++; continue;
      }
      campo += c; i++; continue;
    }
    if (c === '"' && campo.trim() === "") { campo = ""; dentro = true; i++; continue; }
    if (c === sep) { fimCampo(); i++; continue; }
    if (c === "\r") { fimLinha(); i += s[i + 1] === "\n" ? 2 : 1; continue; }
    if (c === "\n") { fimLinha(); i++; continue; }
    campo += c; i++;
  }
  // plano 1000b · RB-070: aspas que nunca fecham engoliam o resto do arquivo em silêncio — agora a tela sabe em que linha começou
  const aspasAbertas = dentro;
  const linhaAspas = aspasAbertas ? nReg + 1 : null;
  if (campo !== "" || linha.length) fimLinha();
  const cabecalho = (registros.shift() || []).map(h => h.trim());
  nums.shift();
  const larg = cabecalho.length;
  const total = registros.length;
  const cortado = total > limite;
  const linhas = registros.slice(0, limite).map(r => {
    const out = r.map(v => v.trim());
    while (out.length < larg) out.push("");
    return out;
  });
  return { separador: sep, cabecalho, linhas, numeros: nums.slice(0, limite), total, cortado, aspasAbertas, linhaAspas };
}

/**
 * Célula que o Excel / Google Planilhas executaria como fórmula (começa com = + - @ tab ou CR) e não é
 * um número puro ("-5", "+5512…" continuam como estão). Nome de contato vem do perfil do WhatsApp — um
 * "=HYPERLINK(…)" ali não pode virar fórmula na planilha exportada (injeção de CSV, OWASP).
 */
function pareceFormula(s) {
  return /^[=+\-@\t\r]/.test(s) && !/^[+-]?\d+([.,]\d+)*$/.test(s);
}
/** Escapa um valor para CSV com ";" (o que o Excel brasileiro abre direto); fórmula ganha um ' na frente. */
export function csvCampo(v) {
  let s = v === null || v === undefined ? "" : String(v);
  if (pareceFormula(s)) s = `'${s}`;
  return /[";\r\n]/.test(s) || /^\s|\s$/.test(s) ? `"${s.replace(/"/g, '""')}"` : s;
}
/** Linhas → texto CSV com BOM (acentos certos no Excel). */
export function gerarCSV(cabecalho, linhas) {
  return "﻿" + [cabecalho, ...linhas].map(l => l.map(csvCampo).join(";")).join("\r\n");
}

/**
 * plano 1000 (CR-239): planilha-modelo da importação — os cabeçalhos que sugerirMapeamento reconhece sozinho (reimportar o modelo não pede mapa)
 * + os campos personalizados de contato (pelo rótulo) e 2 linhas de exemplo. → {cabecalho, linhas}
 */
export function modeloImportacao(campos = []) {
  const extra = (campos || []).filter(c => c && c.entidade === "contato" && c.ativo !== false && c.rotulo);
  // plano 1000b · RB-073: também Empresa, CPF/CNPJ e as colunas do negócio (Título, Valor, Etapa) — todas com nome que o mapa reconhece sozinho
  const cabecalho = ["Nome", "Telefone", "E-mail", "Empresa", "CPF/CNPJ", "Cidade", "UF", "Nascimento", "Origem", "Etiquetas", "Observação", "Título", "Valor", "Etapa", ...extra.map(c => c.rotulo)];
  const vazio = extra.map(() => "");
  return { cabecalho, linhas: [
    ["Ana Souza", "(12) 99830-3030", "ana@exemplo.com.br", "", "", "Taubaté", "SP", "02/03/1990", "Indicação", "VIP; Retorno", "Prefere horário de manhã", "", "", "", ...vazio],
    ["Carlos Lima", "(12) 3456-7890", "", "", "", "São José dos Campos", "SP", "", "WhatsApp", "", "", "", "", "", ...vazio],
  ] };
}

/* ------------------------------------------------------------ mapeamento da importação */
/** Destinos fixos da importação (chaves da linha de nx_contatos_importar). */
export const DESTINOS_IMPORTACAO = Object.freeze([
  { chave: "nome", rotulo: "Nome" },
  { chave: "telefone", rotulo: "Telefone / WhatsApp" },
  { chave: "email", rotulo: "E-mail" },
  { chave: "empresa", rotulo: "Empresa" },
  { chave: "cidade", rotulo: "Cidade" },
  { chave: "uf", rotulo: "UF" },
  { chave: "nascimento", rotulo: "Nascimento" },
  { chave: "documento", rotulo: "CPF / CNPJ" },
  { chave: "obs", rotulo: "Observação" },
  { chave: "origem", rotulo: "Origem" },
  { chave: "etiquetas", rotulo: "Etiquetas (separadas por ;)" },
  { chave: "negocio_titulo", rotulo: "Título do negócio" },
  { chave: "negocio_valor", rotulo: "Valor do negócio" },
  { chave: "estagio", rotulo: "Etapa (nome)" },
]);

const SINONIMOS = [
  ["nome", ["nome", "nome completo", "cliente", "paciente", "contato", "name", "full name", "razao social"]],
  ["telefone", ["telefone", "celular", "whatsapp", "whats", "fone", "tel", "telefone 1", "celular 1", "phone", "mobile", "numero", "zap"]],
  ["email", ["email", "e-mail", "e mail", "mail", "correio eletronico"]],
  ["empresa", ["empresa", "companhia", "organizacao", "company", "convenio"]],
  ["cidade", ["cidade", "municipio", "city"]],
  ["uf", ["uf", "estado", "state"]],
  ["nascimento", ["nascimento", "data de nascimento", "data nascimento", "aniversario", "dt nascimento", "birthday", "nasc"]],
  // plano 1000b · RB-072: «RG» não é CPF/CNPJ (entrava como documento e disparava o aviso de dígito) — a coluna fica «Ignorar»
  ["documento", ["cpf", "cnpj", "cpf/cnpj", "cpf cnpj", "documento"]],
  ["obs", ["observacao", "observacoes", "obs", "nota", "notas", "anotacao", "comentario", "comentarios"]],
  ["origem", ["origem", "fonte", "canal", "source"]],
  ["etiquetas", ["etiquetas", "etiqueta", "tags", "tag", "marcadores", "grupo"]],
  ["negocio_titulo", ["titulo", "negocio", "oportunidade", "orcamento", "procedimento", "servico", "tratamento"]],
  ["negocio_valor", ["valor", "preco", "valor do negocio", "valor previsto", "ticket", "total"]],
  ["estagio", ["etapa", "estagio", "fase", "status", "situacao"]],
];

function chaveTexto(s) { return semAcento(s).replace(/[_\-./]+/g, " ").replace(/\s+/g, " ").trim(); }

/**
 * sugerirMapeamento(cabecalho, campos?) → lista (uma por coluna) de destino: chave fixa,
 * 'campo:<chave>' (campo personalizado de contato) ou null (Ignorar). Cada destino no máximo uma vez.
 */
export function sugerirMapeamento(cabecalho, campos = []) {
  const usados = new Set();
  const personal = (campos || []).filter(c => c && c.entidade === "contato");
  return (cabecalho || []).map(col => {
    const k = chaveTexto(col);
    if (!k) return null;
    let achou = null;
    for (const [dest, lista] of SINONIMOS) {
      if (usados.has(dest)) continue;
      if (lista.includes(k)) { achou = dest; break; }
    }
    if (!achou) {
      for (const c of personal) {
        const d = `campo:${c.chave}`;
        if (usados.has(d)) continue;
        if (chaveTexto(c.rotulo) === k || chaveTexto(c.chave) === k) { achou = d; break; }
      }
    }
    if (!achou) {
      for (const [dest, lista] of SINONIMOS) {
        if (usados.has(dest)) continue;
        if (lista.some(s => s.length >= 4 && (k.startsWith(s + " ") || k.endsWith(" " + s)))) { achou = dest; break; }
      }
    }
    if (achou) usados.add(achou);
    return achou;
  });
}

/**
 * plano 1000b · RB-068: a opção oficial que casa com o texto ignorando maiúsculas, acentos e espaços nas pontas («unimed» → «Unimed»).
 * null quando nenhuma casa.
 */
export function opcaoOficial(opcoes, valor) {
  const lista = Array.isArray(opcoes) ? opcoes : [];
  const t = String(valor ?? "").trim();
  if (lista.includes(t)) return t;
  const n = semAcento(t);
  const achou = lista.find(o => semAcento(String(o).trim()) === n);
  return achou === undefined ? null : achou;
}

/**
 * plano 1000b · RB-071: rótulos das colunas para o passo 2 — cabeçalho vazio vira «Coluna N» e o repetido ganha «(2ª)», «(3ª)»
 * (comparando sem maiúsculas/acentos). → {rotulos, repetidas}
 */
export function rotulosColunas(cabecalho) {
  const vistos = new Map();
  let repetidas = false;
  const rotulos = (cabecalho || []).map((c, i) => {
    const t = String(c ?? "").trim();
    if (!t) return `Coluna ${i + 1}`;
    const n = semAcento(t);
    const q = (vistos.get(n) || 0) + 1;
    vistos.set(n, q);
    if (q > 1) { repetidas = true; return `${t} (${q}ª)`; }
    return t;
  });
  return { rotulos, repetidas };
}

/**
 * plano 1000b · RB-139: opções do campo sem repetidas (ignorando maiúsculas/acentos; fica a 1ª grafia). → {opcoes, unidas}
 */
export function opcoesUnicas(lista) {
  const vistos = new Set(), opcoes = [];
  for (const x of lista || []) {
    const t = String(x ?? "").trim();
    if (!t) continue;
    const n = semAcento(t);
    if (vistos.has(n)) continue;
    vistos.add(n); opcoes.push(t);
  }
  const total = (lista || []).filter(x => String(x ?? "").trim()).length;
  return { opcoes, unidas: total - opcoes.length };
}

/** Aplica o mapeamento: linhas do CSV → linhas no formato de nx_contatos_importar. `campos` (opcional): opção/multi viram a opção oficial (RB-068). */
export function montarLinhas(linhas, mapa, campos = null) {
  return (linhas || []).map(l => {
    const o = {};
    (mapa || []).forEach((dest, i) => {
      if (!dest) return;
      // o ' que o csvCampo põe na frente de "fórmula" sai na volta (exportar → importar sem perda)
      const v = (l[i] ?? "").trim().replace(/^'(?=[=+\-@])/, "");
      if (v === "") return;
      if (dest.startsWith("campo:")) {
        const chave = dest.slice(6);
        // plano 1000b · RB-068: «unimed» na planilha grava «Unimed» (a opção como foi cadastrada)
        const def = Array.isArray(campos) ? campos.find(c => c && c.chave === chave) : null;
        let val = v;
        if (def && def.tipo === "opcao") val = opcaoOficial(def.opcoes, v) ?? v;
        else if (def && def.tipo === "multi") val = v.split(";").map(x => x.trim()).filter(Boolean).map(x => opcaoOficial(def.opcoes, x) ?? x).join(";");
        (o.campos || (o.campos = {}))[chave] = val;
        return;
      }
      if (o[dest] !== undefined && dest === "obs") { o.obs += " · " + v; return; }
      // plano 1000 (CR-129): «São Paulo» vira SP e «Indicação»/«Whats» viram a origem certa (antes viravam aviso e a linha perdia o dado)
      // plano 1000b · RB-249: nascimento legível vai em AAAA-MM-DD já com o século certo («05/03/28» → 1928-03-05); ilegível fica como veio (a prévia avisa)
      if (o[dest] === undefined) o[dest] = dest === "uf" ? ufDaPlanilha(v) : dest === "origem" ? origemDaPlanilha(v) : dest === "nascimento" ? (lerData(v, { passado: true }) || v) : v;
    });
    return o;
  });
}

const UF_POR_NOME = Object.freeze({ acre: "AC", alagoas: "AL", amapa: "AP", amazonas: "AM", bahia: "BA", ceara: "CE", "distrito federal": "DF", "espirito santo": "ES",
  goias: "GO", maranhao: "MA", "mato grosso": "MT", "mato grosso do sul": "MS", "minas gerais": "MG", para: "PA", paraiba: "PB", parana: "PR", pernambuco: "PE",
  piaui: "PI", "rio de janeiro": "RJ", "rio grande do norte": "RN", "rio grande do sul": "RS", rondonia: "RO", roraima: "RR", "santa catarina": "SC",
  "sao paulo": "SP", sergipe: "SE", tocantins: "TO" });
/** plano 1000 (CR-129): UF da planilha — «sp», «São Paulo», «Estado de São Paulo» → «SP»; o resto volta como veio (a checagem avisa). */
/** plano 1000b · RB-055: «SP», «rj» → UF que existe? (o formulário da empresa confere antes de ir ao servidor). */
export function ufValida(v) {
  const t = String(v ?? "").trim().toUpperCase();
  return /^[A-Z]{2}$/.test(t) && Object.values(UF_POR_NOME).includes(t);
}
export function ufDaPlanilha(v) {
  const t = String(v ?? "").trim();
  if (/^[A-Za-z]{2}$/.test(t)) return t.toUpperCase();
  const n = semAcento(t).replace(/^estado d[eoa]s?\s+/, "").replace(/[^a-z ]/g, " ").replace(/\s+/g, " ").trim();
  return UF_POR_NOME[n] || t;
}
const ORIGEM_POR_TEXTO = Object.freeze({ anuncio: "anuncio", "anuncio pago": "anuncio", trafego: "anuncio", "trafego pago": "anuncio", whatsapp: "whatsapp", whats: "whatsapp",
  zap: "whatsapp", wpp: "whatsapp", indicacao: "indicacao", indicado: "indicacao", "indicado por": "indicacao", "boca a boca": "indicacao", organico: "organico",
  manual: "manual", "cadastro manual": "manual", balcao: "manual", recepcao: "manual", site: "site", website: "site", "formulario do site": "site", importacao: "importacao" });
/**
 * plano 1000 (CR-129): origem da planilha — o rótulo da tela («Indicação», «Cadastro manual») ou um sinônimo comum («Whats», «boca a boca») vira a chave.
 * Instagram/Facebook/Google ficam como vieram (o servidor avisa): sem a plataforma e a campanha não dá para saber se foi anúncio ou orgânico, e marcar
 * «Anúncio» sem plataforma polui os números dos anúncios (CR-094).
 */
export function origemDaPlanilha(v) {
  const t = String(v ?? "").trim();
  const n = semAcento(t).replace(/[^a-z ]/g, " ").replace(/\s+/g, " ").trim();
  return ORIGEM_POR_TEXTO[n] || t;
}

/** plano 1000b · RB-087: a frase da linha vazia é uma constante (a prévia conta por ela, não por /ignorada/ no texto). */
export const LINHA_VAZIA = "Linha sem nome, telefone e e-mail — será ignorada";
export const linhaVazia = problemas => Array.isArray(problemas) && problemas.length === 1 && problemas[0] === LINHA_VAZIA;
/** Problemas de uma linha montada (antes de mandar): [] = ok. Linha sem nome, telefone e e-mail → [LINHA_VAZIA]. */
export function checarLinha(o, { campos = [] } = {}) {
  const erros = [];
  // plano 1000 (CR-232): campo personalizado com valor que o tipo não aceita («x» fora das opções, data inválida) avisa na prévia, linha a linha
  for (const [chave, v] of Object.entries((o && o.campos) || {})) {
    const def = (campos || []).find(c => c && c.chave === chave);
    const er = def ? validarCampo({ ...def, obrigatorio: false }, v) : null;
    if (er) erros.push(`${def.rotulo || chave}: ${er.replace(/\.$/, "")}`);
  }
  if (!o.nome && !o.telefone && !o.email) return [LINHA_VAZIA];
  // C7: número de outro país digitado sem o «+» não vira número brasileiro — a linha entra sem telefone e a pessoa sabe como corrigir
  if (o.telefone && !normalizarTelefone(o.telefone)) erros.push(telefoneSemPais(o.telefone) ? "Telefone sem DDD brasileiro: se for de fora do Brasil, escreva com +código do país" : "Telefone inválido");
  if (o.email && !/^[^@\s]+@[^@\s]+\.[^@\s]+$/.test(o.email)) erros.push("E-mail inválido");
  // plano 1000b · RB-074: «XX» tem 2 letras mas não é estado — confere contra as 27 UFs
  if (o.uf && !ufValida(o.uf)) erros.push(/^[A-Za-z]{2}$/.test(String(o.uf).trim()) ? "UF não existe: use a sigla do estado (SP, RJ…)" : "UF deve ter 2 letras");
  if (o.nascimento) {
    // plano 1000b · RB-249: nascimento no futuro é recusado na prévia (e «05/03/28» é 1928, não 2028)
    const nasc = lerData(o.nascimento, { passado: true });
    if (!nasc) erros.push("Nascimento: use DD/MM/AAAA");
    else if (nasc > new Date().toISOString().slice(0, 10)) erros.push("Nascimento no futuro: confira a data");
  }
  if (o.negocio_valor && lerNumero(o.negocio_valor) === null) erros.push("Valor inválido");
  else if (o.negocio_valor && lerNumero(o.negocio_valor) < 0) erros.push("Valor não pode ser negativo");      // plano 1000b · RB-075
  return erros;
}

/** Divide em lotes de n (padrão 100). */
export function lotes(lista, n = 100) {
  const out = [];
  for (let i = 0; i < (lista || []).length; i += n) out.push(lista.slice(i, i + n));
  return out;
}

/** Tamanho do próximo lote depois de um tempo_esgotado: metade, mínimo 10. */
export function metadeLote(n) { return Math.max(10, Math.floor(n / 2)); }

/* ------------------------------------------------------------ números e datas */
/** "1.234,56" | "1234.56" | "R$ 3.500" → número; inválido → null */
export function lerNumero(s) {
  if (s === null || s === undefined || s === "") return null;
  if (typeof s === "number") return Number.isFinite(s) ? s : null;
  let t = String(s).replace(/[R$\s ]/g, "");
  if (!t) return null;
  // plano 1000 (CR-114): com vírgula E ponto, o separador decimal é o ÚLTIMO dos dois — «1.234,56» (Brasil) e «1,234.56» (planilha em inglês) = 1234,56
  const ultVirgula = t.lastIndexOf(","), ultPonto = t.lastIndexOf(".");
  if (ultVirgula >= 0 && ultPonto >= 0) t = ultVirgula > ultPonto ? t.replace(/\./g, "").replace(",", ".") : t.replace(/,/g, "");
  else if (ultVirgula >= 0) t = /^-?\d{1,3}(,\d{3}){2,}$/.test(t) ? t.replace(/,/g, "") : t.replace(",", ".");
  else if (/^-?\d{1,3}(\.\d{3})+$/.test(t)) t = t.replace(/\./g, "");
  const n = Number(t);
  return Number.isFinite(n) ? n : null;
}

/** O texto de um campo de dinheiro tem algo escrito que NÃO vira número («abc»)? Vazio não é inválido: é «sem valor». */
export function dinheiroInvalido(s) {
  const t = String(s ?? "").trim();
  return t !== "" && lerNumero(t) === null;
}

/**
 * "31/12/1990" | "1990-12-31" → "1990-12-31"; inválido → null.
 * plano 1000 (CR-119): também DD-MM-AAAA, DD.MM.AAAA, ano com 2 dígitos (≥ 30 → 19xx, senão 20xx) e o número de série do Excel (20000–80000).
 */
export function lerData(s, { passado = false, agora = new Date() } = {}) {
  const t = String(s ?? "").trim();
  let a, m, d;
  let r = /^(\d{4})-(\d{2})-(\d{2})/.exec(t);
  if (r) { a = +r[1]; m = +r[2]; d = +r[3]; }
  else if ((r = /^(\d{1,2})[/.-](\d{1,2})[/.-](\d{4}|\d{2})$/.exec(t))) {
    d = +r[1]; m = +r[2]; a = +r[3];
    // plano 1000b · RB-249: data que só pode estar no passado (nascimento): ano de 2 dígitos acima do ano atual é do século passado («05/03/28» → 1928)
    if (r[3].length === 2) a += passado ? (a > new Date(agora).getUTCFullYear() % 100 ? 1900 : 2000) : (a >= 30 ? 1900 : 2000);
  } else if (/^\d{5}$/.test(t) && +t > 20000 && +t < 80000) {
    const dt = new Date(Date.UTC(1899, 11, 30) + Number(t) * 86400000);     // série do Excel: dias desde 30/12/1899
    return dt.toISOString().slice(0, 10);
  } else return null;
  const dt = new Date(Date.UTC(a, m - 1, d));
  if (dt.getUTCFullYear() !== a || dt.getUTCMonth() !== m - 1 || dt.getUTCDate() !== d) return null;
  return `${a}-${String(m).padStart(2, "0")}-${String(d).padStart(2, "0")}`;
}

/**
 * Dias entre dois instantes (b − a).
 * plano 1000b · RB-065: dias do CALENDÁRIO de São Paulo (a mesma régua do «relativo»), não blocos de 24 h — quem entrou ontem às 23h está
 * «há 1 dia na etapa» às 08h de hoje (antes: «hoje na etapa»).
 */
const fmtDiaSP = new Intl.DateTimeFormat("en-CA", { timeZone: "America/Sao_Paulo", year: "numeric", month: "2-digit", day: "2-digit" });
export function diasEntre(a, b = new Date()) {
  const x = new Date(a).getTime(), y = new Date(b).getTime();
  if (!Number.isFinite(x) || !Number.isFinite(y)) return null;
  const dia = t => Date.parse(`${fmtDiaSP.format(new Date(t))}T00:00:00Z`);
  return Math.round((dia(y) - dia(x)) / 86400000);
}

/** "hoje" | "há 1 dia" | "há 12 dias" na etapa */
export function textoDiasEtapa(estagioEm, agora = new Date()) {
  const d = diasEntre(estagioEm, agora);
  if (d === null) return "";
  if (d <= 0) return "hoje na etapa";
  return d === 1 ? "há 1 dia na etapa" : `há ${d} dias na etapa`;
}

/** SLA da etapa (horas) estourado? */
export function slaEstourado(estagioEm, slaHoras, agora = new Date()) {
  if (!slaHoras || !estagioEm) return false;
  const t = new Date(estagioEm).getTime();
  return Number.isFinite(t) && (new Date(agora).getTime() - t) > slaHoras * 3600000;
}

/**
 * Valor para <input type="datetime-local"> a partir de um instante, no fuso de SP.
 * (o banco recebe o texto sem fuso e interpreta como São Paulo — nx_crm_ts)
 */
export function paraDataHoraLocal(iso) {
  if (!iso) return "";
  const d = new Date(iso);
  if (Number.isNaN(d.getTime())) return "";
  const p = new Intl.DateTimeFormat("en-CA", { timeZone: "America/Sao_Paulo", year: "numeric", month: "2-digit", day: "2-digit",
    hour: "2-digit", minute: "2-digit", hourCycle: "h23" }).formatToParts(d);
  const g = t => (p.find(x => x.type === t) || {}).value;
  return `${g("year")}-${g("month")}-${g("day")}T${g("hour")}:${g("minute")}`;
}

/* ------------------------------------------------------------ kanban */
/**
 * Posição (campo `ordem`, crescente = de cima para baixo) entre dois vizinhos.
 * antes = ordem do cartão de CIMA (ou null no topo), depois = do cartão de BAIXO (ou null no fim).
 */
export function ordemEntre(antes, depois, agora = Date.now()) {
  const a = antes === null || antes === undefined || !Number.isFinite(Number(antes)) ? null : Number(antes);
  const b = depois === null || depois === undefined || !Number.isFinite(Number(depois)) ? null : Number(depois);
  if (a === null && b === null) return -agora / 1000;
  if (a === null) return b - 1;
  if (b === null) return a + 1;
  if (a === b) return a;           // vizinhos empatados: o servidor desempata por id
  return a + (b - a) / 2;
}

/**
 * Ordem do cartão solto na posição `pos` entre `itens` (a coluna de destino SEM ele). Soltar no fim de uma coluna que ainda tem cartões
 * não carregados («Ver mais») não pode pular por cima deles: `proxima` = ordem do 1º cartão não carregado (null = esse cartão não tem ordem,
 * que o servidor põe no fim; undefined = não há mais cartões ou não deu para saber → comportamento de fim de lista).
 */
export function ordemDoSoltar(itens, pos, proxima, agora = Date.now()) {
  const antes = itens[pos - 1] ? itens[pos - 1].ordem : null;
  const depois = itens[pos] ? itens[pos].ordem : (proxima === undefined ? null : proxima);
  return ordemEntre(antes, depois, agora);
}

/* ------------------------------------------------------------ gesto de toque no Kanban (M23)
 * O DOM só repassa pontos e tempo; quem decide o que o dedo está fazendo é esta máquina de estados (pura, testável).
 *   espera ──(350 ms parado)──▶ levantado ──(mexeu ≥ 6 px)──▶ arrastando
 *   espera ──(mexeu > 10 px antes dos 350 ms)──▶ rolando  (a rolagem é do navegador: nunca vira arrasto)
 * Ao soltar: «toque» (antes dos 350 ms: o clique normal abre o cartão) · «mover_para» (levantou e soltou sem mexer: folha «Mover para…»)
 * · «soltar» (arrastou: soltar no destino) · «nada» (rolou ou o sistema cancelou). */
export const TOQUE = Object.freeze({ MS_LONGO: 350, LIMIAR_ROLAGEM: 10, LIMIAR_ARRASTO: 6 });

const dist2 = (x0, y0, x1, y1) => Math.hypot(x1 - x0, y1 - y0);

/** Dedo encostou no cartão em (x, y) no instante t (ms). */
export function novoGesto(x, y, t = 0) {
  return { estado: "espera", x0: x, y0: y, t0: t, xl: null, yl: null, acao: null };
}

/** O tempo andou até t: depois de MS_LONGO sem mexer o cartão é «levantado» (acao = "levantar"). */
export function gestoTempo(g, t) {
  if (g.estado === "espera" && t - g.t0 >= TOQUE.MS_LONGO) return { ...g, estado: "levantado", xl: g.xl ?? g.x0, yl: g.yl ?? g.y0, acao: "levantar" };
  return { ...g, acao: null };
}

/** O dedo foi para (x, y) no instante t. acao: "levantar" | "rolar" | "arrastar" | "mover" | null. */
export function gestoMover(g, x, y, t = g.t0) {
  let s = gestoTempo(g, t);
  const levantou = s.acao === "levantar";
  if (s.estado === "espera") {
    if (dist2(s.x0, s.y0, x, y) > TOQUE.LIMIAR_ROLAGEM) return { ...s, estado: "rolando", acao: "rolar" };
    return s;
  }
  if (s.estado === "levantado") {
    if (dist2(s.xl, s.yl, x, y) >= TOQUE.LIMIAR_ARRASTO) return { ...s, estado: "arrastando", acao: "arrastar", levantou };
    return levantou ? s : { ...s, acao: null };
  }
  if (s.estado === "arrastando") return { ...s, acao: "mover" };
  return { ...s, acao: null };
}

/** O dedo saiu da tela no instante t. acao: "toque" | "mover_para" | "soltar" | "nada". */
export function gestoSoltar(g, t = g.t0) {
  const s = gestoTempo(g, t);
  const acao = s.estado === "espera" ? "toque" : s.estado === "levantado" ? "mover_para" : s.estado === "arrastando" ? "soltar" : "nada";
  return { ...s, estado: "encerrado", acao };
}

/** O sistema tomou o gesto (pointercancel: rolagem, chamada, etc.). Nunca solta nem move nada. */
export function gestoCancelar(g) { return { ...g, estado: "encerrado", acao: "nada" }; }

/** Posição (0 = topo) em que um cartão arrastado entra numa coluna: antes do primeiro cartão cujo meio está abaixo de y. cartoes = [{top, bottom}] sem o arrastado. */
export function indiceDoPonto(cartoes, y) {
  const lista = cartoes || [];
  for (let i = 0; i < lista.length; i++) { if (y < lista[i].top + (lista[i].bottom - lista[i].top) / 2) return i; }
  return lista.length;
}

/** Em qual coluna/etapa o ponto cai. alvos = [{id, left, right, top, bottom}] → id | null. */
export function alvoDoPonto(alvos, x, y) {
  const a = (alvos || []).find(r => x >= r.left && x <= r.right && y >= r.top && y <= r.bottom);
  return a ? a.id : null;
}

/* ------------------------------------------------------------ cartão (M24) */
/** De onde veio o contato, em uma linha (tooltip do glifo do cartão): «Google Ads · Campanha X · Anúncio Y» ou o rótulo da origem («WhatsApp»). */
export function descricaoOrigem(c) {
  if (!c || typeof c !== "object") return "";
  const rastreio = c.rastreio && typeof c.rastreio === "object" ? c.rastreio : {};
  const plataforma = c.plataforma === "google" ? "Google Ads" : c.plataforma === "meta" ? "Meta Ads" : c.plataforma ? "Anúncio" : null;
  const campanha = c.campanha_nome || c.campanha || c.campanha_ext || rastreio.utm_campaign;
  const anuncio = c.anuncio_nome || c.anuncio_ext || rastreio.utm_content;
  const origem = !plataforma && c.origem ? (ROTULO_ORIGEM[c.origem] || c.origem) : null;
  return [plataforma || origem, campanha ? `Campanha ${campanha}` : null, anuncio ? `Anúncio ${anuncio}` : null].filter(Boolean).join(" · ");
}

/**
 * M24: o cadastro que a pessoa está prestes a duplicar. `itens` = resposta de nx_contatos_listar; `digitado` = o telefone na caixa (com máscara ou DDI).
 * Só vale com 10–13 dígitos; casa pela MESMA chave do banco (com/sem 55 e 9º dígito). → o contato ou null.
 */
export function acharDuplicado(itens, digitado, { ignorarId = null } = {}) {
  const dig = digitosDuplicado(digitado);
  if (!dig) return null;
  const comMais = String(digitado ?? "").trim().startsWith("+");
  return (itens || []).find(c => c && c.telefone && c.id !== ignorarId && mesmoTelefone(c.telefone, comMais ? `+${dig}` : dig)) || null;
}
/**
 * plano 1000b · RB-086: os dígitos do telefone digitado que valem a busca de cadastro repetido, ou null. 10–13 dígitos; começando com «+»
 * (a pessoa informou o país) até 15 — +351 9xx…, números de 14–15 dígitos.
 */
export function digitosDuplicado(digitado) {
  const txt = String(digitado ?? "");
  const dig = txt.replace(/\D/g, "");
  const max = txt.trim().startsWith("+") ? 15 : 13;
  return dig.length >= 10 && dig.length <= max ? dig : null;
}

/* ------------------------------------------------------------ escrita segura (M25) */
/** Chave de idempotência (uuid v4) de UMA intenção: o mesmo p_req repetido nunca grava duas vezes no servidor (24 h). */
export function novaReq(c = globalThis.crypto) {
  if (c && typeof c.randomUUID === "function") return c.randomUUID();
  const b = c && typeof c.getRandomValues === "function" ? c.getRandomValues(new Uint8Array(16)) : Uint8Array.from({ length: 16 }, () => Math.floor(Math.random() * 256));
  b[6] = (b[6] & 0x0f) | 0x40; b[8] = (b[8] & 0x3f) | 0x80;
  const h = [...b].map(x => x.toString(16).padStart(2, "0")).join("");
  return `${h.slice(0, 8)}-${h.slice(8, 12)}-${h.slice(12, 16)}-${h.slice(16, 20)}-${h.slice(20)}`;
}

/**
 * O erro deixa dúvida se o servidor JÁ aplicou? Prazo estourado, conexão que caiu no meio, resposta ilegível e 502/503/504 (o pedido pode ter chegado
 * e sido gravado). Recusa do servidor (código do CRM, 4xx, 500 do banco) NÃO é ambígua: nada foi gravado.
 */
/** A função ainda não existe no servidor (PostgREST 404 · PGRST202 — a migração nova não foi aplicada): a tela esconde a novidade em vez de insistir. */
export function rpcAusente(e) {
  if (!e) return false;
  const c = String(e.codigo || e.message || "");
  // plano 1000b · RB-085: «function unaccent(text) does not exist» (42883) vem de DENTRO de uma RPC que existe — não é RPC ausente;
  // só 404 ou PGRST202 («Could not find the function … in the schema cache») escondem o recurso
  return Number(e.status) === 404 || /PGRST202|Could not find the function/i.test(c);
}

export function erroAmbiguo(e) {
  const c = String((e && (e.codigo || e.message)) || "");
  if (/^(tempo_rede|tempo_esgotado|sem_conexao|resposta_invalida|servico_indisponivel)$/.test(c)) return true;   // tempo_esgotado também vem de 504 do gateway (pode ter aplicado)
  if (/^http_50[234]$/.test(c)) return true;
  const st = Number(e && e.status);
  return Number.isFinite(st) && st >= 502 && st <= 504;
}

/** Espera `ms` ou até a internet voltar (o que vier primeiro). */
export function esperarOuOnline(ms) {
  return new Promise(resolve => {
    let t = null;
    const fim = () => { clearTimeout(t); if (typeof removeEventListener === "function") removeEventListener("online", fim); resolve(); };
    t = setTimeout(fim, ms);
    if (typeof addEventListener === "function") addEventListener("online", fim);
  });
}

/**
 * O servidor não conhece a função COM estes parâmetros (PostgREST: HTTP 404, código PGRST202, «Could not find the function…»)? É o que acontece
 * quando o site novo chega antes da migração que cria as versões com `p_req`. Nada foi gravado.
 */
export function funcaoInexistente(e) {
  if (!e) return false;
  const r = e.resposta && typeof e.resposta === "object" ? e.resposta : null;
  return Number(e.status) === 404 || /could not find the function/i.test(String(e.codigo || e.message || ""))
    || String(e.codigo || "").toUpperCase() === "PGRST202" || String((r && r.code) || "").toUpperCase() === "PGRST202";
}

/**
 * escreverComReq(api, nome, params, {req, aoStatus, esperas, dormir}) → {resultado, req, repetiu, semReq?}.
 * Chama a RPC com `p_req`. Em erro AMBÍGUO repete com a MESMA chave (depois de 1,5 s e de 4 s): se o servidor já tinha aplicado, devolve o resultado
 * guardado; se não, aplica agora — nunca duplica. Sem sucesso depois das tentativas lança o erro com `.ambigua = true` e `.req` (para «Salvar de novo»).
 * Servidor sem a versão com `p_req` (função inexistente): repete UMA vez sem a chave, para ninguém ficar sem conseguir cadastrar (`semReq = true`);
 * essa chamada não tem proteção contra duplicar, então um erro nela sobe como veio, sem `.ambigua`.
 * Qualquer outro erro sobe na hora, com `.req`.
 */
export async function escreverComReq(api, nome, params, { req, aoStatus, esperas = [1500, 4000], dormir = esperarOuOnline } = {}) {
  const chave = req || novaReq();
  let ultimo = null;
  for (let i = 0; i <= esperas.length; i++) {
    try {
      const resultado = await api.rpcC(nome, { ...params, p_req: chave });
      return { resultado, req: chave, repetiu: i > 0 };
    } catch (e) {
      ultimo = e;
      if (funcaoInexistente(e)) return { resultado: await api.rpcC(nome, params), req: chave, repetiu: i > 0, semReq: true };
      if (!erroAmbiguo(e)) { try { e.req = chave; } catch { /* erro congelado */ } throw e; }
      if (i < esperas.length) { if (aoStatus) aoStatus("Conferindo se foi salvo…"); await dormir(esperas[i]); }
    }
  }
  try { ultimo.ambigua = true; ultimo.req = chave; } catch { /* erro congelado */ }
  throw ultimo;
}

/**
 * «Desfazer» de uma troca de etiquetas: sobre o conjunto ATUAL, tira as que aquela ação pôs (`mais`) e devolve as que ela tirou (`menos`).
 * O que foi marcado ou desmarcado DEPOIS fica como está (voltar ao conjunto inteiro de antes apagaria a etiqueta posta em seguida).
 */
export function desfazerEtiquetas(atual, mais = [], menos = []) {
  const fica = (atual || []).filter(id => !(mais || []).includes(id));
  for (const id of menos || []) if (!fica.includes(id)) fica.push(id);
  return fica;
}

/** Mover entre etapas de TIPO diferente (aberto ↔ ganho/perdido) dispara automações (mensagens, tarefas): essas só se efetivam depois dos 7 s do «Desfazer». */
export function movimentoAdiado(tipoOrigem, tipoDestino) {
  return !!tipoOrigem && !!tipoDestino && tipoOrigem !== tipoDestino;
}

/* plano 100 · C1: o movimento adiado é o MESMO no Kanban e na gaveta — texto do aviso, o que a tela mostra antes do servidor e o que devolve */
/** Texto do aviso «Desfazer» de um movimento que muda a natureza do negócio: «Fechou! «Ana» · R$ 900», «registrada como «Perdido»», «reaberta em «Nova»». */
export function textoMovimento({ titulo, destino, valor, ganhar = "Ganhou", artigo = "o", brl = v => `R$ ${v}` } = {}) {
  const d = destino || {};
  const a = artigo === "a" ? "a" : "o";
  const valorTxt = valor !== null && valor !== undefined && valor !== "" ? ` · ${brl(valor)}` : "";
  if (d.tipo === "ganho") return `${ganhar}! «${titulo}»${valorTxt}`;
  if (d.tipo === "perdido") return `«${titulo}» registrad${a} como «${d.nome}»`;
  return `«${titulo}» reabert${a} em «${d.nome}»`;
}

/** plano 1000b · RB-059: o «Desfazer» voltou a etapa, mas a 2ª gravação (a data da consulta) falhou. */
export function avisoDataNaoVoltou(vertical) {
  return `Voltou de etapa, mas a data da ${nomeCompromisso(vertical)} continua a nova. Ajuste a data na gaveta.`;
}
/** plano 1000b · RB-046: «Motivo: X — texto», «Motivo: texto» (sem motivo cadastrado) ou «Motivo: X» — nunca «Motivo: — — texto». */
export function textoMotivoPerda(nome, texto) {
  const n = String(nome || "").trim(), t = String(texto || "").trim();
  if (n && t) return `Motivo: ${n} — ${t}`;
  return `Motivo: ${n || t || "—"}`;
}
/** O compromisso da vertical: consulta (clínica), visita (oficina), entrega (loja). */
export function nomeCompromisso(vertical) {
  return { odonto: "consulta", oficina: "visita", loja: "entrega" }[vertical] || "consulta";
}

/** O que a tela aplica ao cartão/negócio ANTES de o servidor gravar: status do destino, valor final (ganho) e a data da consulta (agendada). */
export function patchMovimento(destino, extra = {}) {
  const e = extra && typeof extra === "object" ? extra : {};
  return { status: (destino || {}).tipo, ...(e.valor !== null && e.valor !== undefined ? { valor: e.valor } : {}), ...(e.consulta_em ? { consulta_em: e.consulta_em } : {}) };
}

/** O que mandar a nx_negocio_mover para DEVOLVER o negócio à etapa de antes: ganho exige o valor; perdido leva o motivo de volta. */
export function extraDeVolta(antes) {
  const a = antes || {};
  const tipo = a.estagio && typeof a.estagio === "object" ? a.estagio.tipo : a.tipo;
  if (tipo === "ganho") return { valor: a.valor ?? a.valor_previsto ?? 0 };
  if (tipo === "perdido") return { ...(a.motivo_perda_id ? { motivo_perda_id: a.motivo_perda_id } : {}), ...(a.motivo_perda_txt ? { motivo_perda_txt: a.motivo_perda_txt } : {}) };
  return {};
}

/* plano 100 · C6: presença na consulta (nx_agenda_presenca grava nx_leads.campos.presenca) */
export const PRESENCAS = Object.freeze({
  compareceu: Object.freeze({ rotulo: "Compareceu", tok: "ok", icone: "check" }),
  faltou: Object.freeze({ rotulo: "Faltou", tok: "ruim", icone: "fechar" }),
});
/** Estado gravado: `presenca` solto (nx_agenda_dia) ou dentro de `campos` (nx_negocio_ver). → "compareceu" | "faltou" | null. */
export function presencaDe(n) {
  const v = n && (n.presenca ?? (n.campos && typeof n.campos === "object" ? n.campos.presenca : null));
  return v === "compareceu" || v === "faltou" ? v : null;
}
/** A consulta já aconteceu? (hora marcada no passado — só então faz sentido perguntar se a pessoa veio). */
export function consultaPassou(n, agora = Date.now()) {
  const t = n && n.consulta_em ? Date.parse(n.consulta_em) : NaN;
  const a = agora instanceof Date ? agora.getTime() : Number(agora);
  return Number.isFinite(t) && Number.isFinite(a) && t <= a;
}
/** Tocar de novo no estado já marcado limpa; senão marca o pedido. */
export function proximaPresenca(atual, pedido) { return atual === pedido ? "limpar" : pedido; }
/** O que o «Desfazer» manda: o estado de antes ou «limpar» se não havia marca. */
export function voltaPresenca(anterior) { return anterior === "compareceu" || anterior === "faltou" ? anterior : "limpar"; }

/* plano 100 · C3/C4: origem e rastreio na tela */
/** Chave para ui.pilula({variante: "origem"}): anúncio quando há plataforma (ou o selo de anúncio), senão a origem do cadastro. `manual: false` esconde o cadastro manual. */
export function origemPilula(c, { manual = true } = {}) {
  if (!c || typeof c !== "object") return null;
  const plataforma = c.plataforma === "google" || c.plataforma === "meta" || c.plataforma === "instagram" || c.plataforma === "facebook" ? c.plataforma : null;
  const chave = plataforma || c.anuncio === true ? "anuncio" : (c.origem && ROTULO_ORIGEM[c.origem] ? c.origem : null);
  if (!chave || (chave === "manual" && !manual)) return null;
  return { chave, plataforma };
}

const capitalizar = s => { const t = String(s || "").trim(); return t ? t[0].toUpperCase() + t.slice(1) : ""; };
/** plano 1000b · RB-083: utm_source abreviado vira o nome da rede («ig» → Instagram, «fb» → Facebook, «yt» → YouTube). */
const NOME_FONTE = Object.freeze({ ig: "Instagram", insta: "Instagram", instagram: "Instagram", fb: "Facebook", facebook: "Facebook", google: "Google", yt: "YouTube",
  youtube: "YouTube", tiktok: "TikTok", tt: "TikTok", linkedin: "LinkedIn", kwai: "Kwai", whatsapp: "WhatsApp", wa: "WhatsApp", bing: "Bing" });
export function nomeFonte(s) { const t = String(s || "").trim(); return NOME_FONTE[t.toLowerCase()] || capitalizar(t); }
/**
 * De onde veio o negócio, numa frase para a gaveta (C3): «Veio do anúncio «X» · campanha «Y»», «Veio do site · campanha X · página Y · clique em
 * 06/10 10:12», «Veio do Instagram (orgânico)», «Chamou no WhatsApp»… Campos de nx_negocio_ver: origem, plataforma, campanha_nome/campanha_ext,
 * anuncio_nome/anuncio_ext e rastreio {codigo, utm_*, pagina, clique_em}; `anuncio` = o bloco d.anuncio da RPC. `fmtData(iso)` formata o clique.
 * → {chave (para a pílula), plataforma, frase, detalhes: [texto]} | null (sem origem e sem rastreio).
 */
export function resumoRastreio(n, { anuncio = {}, fmtData = iso => String(iso || "") } = {}) {
  if (!n || typeof n !== "object") return null;
  const r = n.rastreio && typeof n.rastreio === "object" ? n.rastreio : {};
  const an = anuncio && typeof anuncio === "object" ? anuncio : {};
  // plano 1000b · RB-066: instagram/facebook (a pílula já aceitava) contam como Meta na frase
  const plataforma = n.plataforma === "google" ? "google" : n.plataforma === "meta" || n.plataforma === "instagram" || n.plataforma === "facebook" ? "meta" : null;
  const campanha = an.campanha_nome || n.campanha_nome || n.campanha_ext || r.utm_campaign || null;
  const nomeAnuncio = an.anuncio_nome || n.anuncio_nome || n.anuncio_ext || null;
  const pagina = r.pagina || null;
  const utm = [r.utm_source, r.utm_medium].filter(Boolean).join(" / ") || null;
  const origem = n.origem && ROTULO_ORIGEM[n.origem] ? n.origem : null;
  const partes = [];
  let chave, cabeca;
  if (plataforma || origem === "anuncio" || nomeAnuncio) {
    chave = "anuncio";
    cabeca = nomeAnuncio ? `Veio do anúncio «${nomeAnuncio}»` : `Veio do anúncio${plataforma ? ` (${plataforma === "google" ? "Google" : "Meta"})` : ""}`;
    if (campanha) partes.push(`campanha «${campanha}»`);
  } else if (origem === "site" || r.codigo || pagina) {
    chave = "site";
    cabeca = "Veio do site";
    if (campanha) partes.push(`campanha «${campanha}»`);
    if (pagina) partes.push(`página ${pagina}`);
  } else if (origem === "organico") {
    chave = "organico";
    cabeca = `Veio ${r.utm_source ? `do ${nomeFonte(r.utm_source)}` : "de busca ou rede social"} (orgânico)`;
    if (campanha) partes.push(`campanha «${campanha}»`);
  } else if (origem === "whatsapp") { chave = origem; cabeca = "Chamou no WhatsApp"; }
  else if (origem === "indicacao") { chave = origem; cabeca = "Veio por indicação"; }
  else if (origem === "importacao") { chave = origem; cabeca = "Veio da importação de planilha"; }
  else if (origem === "manual") { chave = origem; cabeca = "Cadastro manual"; }
  else if (campanha || pagina || utm) { chave = null; cabeca = "Origem do contato"; if (campanha) partes.push(`campanha «${campanha}»`); }
  else return null;
  if (r.clique_em) { const q = fmtData(r.clique_em); if (q) partes.push(`clique em ${q}`); }
  const detalhes = [];
  if (utm) detalhes.push(`Parâmetros do site: ${utm}`);   // o código do rastreio não aparece (como em nx_rastreio_listar): só diz que houve clique
  return { chave, plataforma, frase: [cabeca, ...partes].join(" · "), detalhes };
}

/* plano 100 · C10: quantos cartões da coluna vieram de anúncio (só os carregados: com «Ver mais» pendente o número ganha «+») */
export function contarDeAnuncio(col) {
  const itens = col && Array.isArray(col.itens) ? col.itens : [];
  const n = itens.filter(c => c && (c.plataforma || c.origem === "anuncio" || c.anuncio === true)).length;
  const parcial = (Number(col && col.total) || 0) > itens.length;
  return { n, parcial, texto: n ? `${n}${parcial ? "+" : ""} de anúncio` : "" };
}

/* plano 100 · C9: clique no cabeçalho da lista de contatos ↔ p_ordem do servidor (nome A–Z; último contato do mais recente).
   plano 1000b · RB-214: clicar de novo na ordem que já está ativa NÃO troca para «Cadastrados por último» (com o padrão «último contato», o 1º clique
   no cabeçalho mudava a ordem sem a pessoa pedir) — fica como está. */
export const ORDEM_COLUNA = Object.freeze({ nome: "nome", ultimo_contato_em: "ultimo_contato" });
export function ordemAoClicar(chave, atual) {
  const alvo = ORDEM_COLUNA[chave];
  if (!alvo) return atual;
  return alvo;
}
export function ariaSortDe(chave, ordem) {
  const alvo = ORDEM_COLUNA[chave];
  if (!alvo || ordem !== alvo) return "none";
  return alvo === "nome" ? "ascending" : "descending";
}

/** Texto curto dos totais no celular: «3 abertas · R$ 12.950 · previsão R$ 4.735». artigo = "a" | "o". */
export function resumoDoFunil({ abertos = 0, soma = "", previsao: prev = "" } = {}, artigo = "o") {
  const n = Number(abertos) || 0;
  const rot = `abert${artigo === "a" ? "a" : "o"}${n === 1 ? "" : "s"}`;
  return [`${n} ${rot}`, soma, prev ? `previsão ${prev}` : ""].filter(Boolean).join(" · ");
}

/**
 * Pontuação do lead (0 a 100) gravada pelo passo «preencher um campo» ou pela IA: campos.score, com score_motivo e score_em.
 * Aceita o negócio completo (`campos` dentro) ou o cartão com `score` solto. null quando não há nota válida.
 */
export function pontuacao(x) {
  if (!x || typeof x !== "object") return null;
  const campos = x.campos && typeof x.campos === "object" ? x.campos : {};
  const bruto = x.score !== undefined && x.score !== null ? x.score : campos.score;
  const n = typeof bruto === "number" ? bruto : (typeof bruto === "string" && bruto.trim() !== "" ? Number(bruto) : NaN);
  if (!Number.isFinite(n) || n < 0 || n > 100) return null;
  const score = Math.round(n);
  const txt = v => (typeof v === "string" ? v.trim() : "");
  return { score, faixa: score >= 70 ? "alta" : score >= 40 ? "media" : "baixa",
    motivo: txt(x.score_motivo) || txt(campos.score_motivo), em: txt(x.score_em) || txt(campos.score_em) };
}

/** Quando a pontuação foi atribuída, para a tela: «2026-10-01T14:03» (hora de São Paulo, como o servidor grava) → «01/10/2026 às 14:03». Outro formato volta como veio. */
export function quandoPontuacao(em) {
  const t = String(em ?? "").trim();
  const r = /^(\d{4})-(\d{2})-(\d{2})(?:[T ](\d{2}):(\d{2}))?/.exec(t);
  if (!r) return t;
  return `${r[3]}/${r[2]}/${r[1]}${r[4] ? ` às ${r[4]}:${r[5]}` : ""}`;
}

/** Valor que o cartão "vale" na coluna: final se ganho, senão o previsto. */
export function valorCard(c) {
  if (!c) return 0;
  const v = c.status === "ganho" ? (c.valor ?? c.valor_previsto) : c.valor_previsto;
  const n = Number(v);
  return Number.isFinite(n) ? n : 0;
}

/**
 * Totais do topo do funil a partir das colunas {estagio_id, total, soma_previsto, soma_valor, itens}
 * e das etapas {id, tipo, probabilidade}. Usa as somas do servidor (valem para a coluna INTEIRA,
 * inclusive os cartões ainda não carregados) — mesma conta de nx_negocios_kanban.totais.
 */
export function previsao(colunas, estagios) {
  const porId = new Map((estagios || []).map(e => [e.id, e]));
  let abertos = 0, somaAberto = 0, ponderada = 0;
  for (const c of colunas || []) {
    const e = porId.get(c.estagio_id);
    if (!e || e.tipo !== "aberto") continue;
    abertos += Number(c.total) || 0;
    const s = Number(c.soma_previsto) || 0;
    somaAberto += s;
    ponderada += s * (Number(e.probabilidade) || 0) / 100;
  }
  return { abertos, soma_aberto: round2(somaAberto), previsao_ponderada: round2(ponderada) };
}
/** plano 1000 (CR-032): o que foi ganho no período do quadro (30 dias, ou todos com «Ver mais antigos») — a soma do servidor das colunas de ganho. */
export function ganhosDoQuadro(colunas, estagios) {
  const ganho = new Set((estagios || []).filter(e => e.tipo === "ganho").map(e => e.id));
  let valor = 0, n = 0;
  for (const c of colunas || []) if (ganho.has(c.estagio_id)) { valor += Number(c.soma_valor) || 0; n += Number(c.total) || 0; }
  return { valor: round2(valor), n };
}
function round2(n) { return Math.round(n * 100) / 100; }

/**
 * Move um cartão entre colunas em memória (otimista), ajustando total e somas das duas colunas.
 * colunas: [{estagio_id, total, soma_previsto, soma_valor, itens:[Card]}]. Devolve NOVAS colunas.
 */
export function moverLocal(colunas, id, estagioDestino, indice, novaOrdem, patch = {}) {
  let card = null, origem = null;
  const cols = (colunas || []).map(c => ({ ...c, itens: c.itens.slice() }));
  for (const c of cols) {
    const i = c.itens.findIndex(x => x.id === id);
    if (i >= 0) { card = c.itens[i]; origem = c; c.itens.splice(i, 1); break; }
  }
  if (!card) return cols;
  const dest = cols.find(c => c.estagio_id === estagioDestino);
  if (!dest) return colunas;
  const novo = { ...card, ...patch, estagio_id: estagioDestino, ordem: novaOrdem ?? card.ordem };
  if (origem !== dest) {
    origem.total = Math.max(0, (Number(origem.total) || 0) - 1);
    origem.soma_previsto = round2((Number(origem.soma_previsto) || 0) - (Number(card.valor_previsto) || 0));
    origem.soma_valor = round2((Number(origem.soma_valor) || 0) - (Number(card.valor) || 0));
    dest.total = (Number(dest.total) || 0) + 1;
    dest.soma_previsto = round2((Number(dest.soma_previsto) || 0) + (Number(novo.valor_previsto) || 0));
    dest.soma_valor = round2((Number(dest.soma_valor) || 0) + (Number(novo.valor) || 0));
  } else {
    dest.soma_valor = round2((Number(dest.soma_valor) || 0) - (Number(card.valor) || 0) + (Number(novo.valor) || 0));
    dest.soma_previsto = round2((Number(dest.soma_previsto) || 0) - (Number(card.valor_previsto) || 0) + (Number(novo.valor_previsto) || 0));
  }
  const pos = Math.max(0, Math.min(indice ?? 0, dest.itens.length));
  dest.itens.splice(pos, 0, novo);
  return cols;
}

/** O filtro está vazio? (fechados_dias não conta) */
export function filtroVazio(f) {
  if (!f) return true;
  return !Object.entries(f).some(([k, v]) => {
    if (k === "fechados_dias") return false;
    if (v === null || v === undefined || v === "") return false;
    if (Array.isArray(v)) return v.length > 0;
    if (typeof v === "object") return Array.isArray(v.ids) ? v.ids.length > 0 : Object.keys(v).length > 0;
    return true;
  });
}

/* ------------------------------------------------------------ visões locais (quadro/lista)
   As visões ficam neste navegador e são isoladas por empresa, usuário e tela. Não são
   sincronizadas para outras pessoas e nunca substituem os filtros enviados ao servidor. */
const LIMITE_VISOES_CRM = 12;
const ORIGENS_VISAO = new Set(["anuncio", "whatsapp", "indicacao", "organico", "manual", "site", "importacao"]);
const ORDEM_VISAO_CONTATOS = new Set(["recentes", "nome", "ultimo_contato"]);
const idVisaoSeguro = v => (typeof v === "number" && Number.isSafeInteger(v) && v > 0)   // nx_empresas.id é bigint
  || (typeof v === "string" && /^[a-zA-Z0-9:_-]{1,100}$/.test(v));
const dataISOVisao = v => typeof v === "string" && /^\d{4}-\d{2}-\d{2}$/.test(v) && !Number.isNaN(Date.parse(`${v}T00:00:00Z`)) && new Date(`${v}T00:00:00Z`).toISOString().slice(0, 10) === v;

/** Chave sem dados pessoais em texto: qualquer usuário/empresa/tela ganha seu próprio espaço local. */
export function chaveVisoesCRM(clienteId, contaId, tela) {
  if (!clienteId || !["kanban", "contatos"].includes(tela)) return null;
  const parte = v => encodeURIComponent(String(v || "local").slice(0, 120));
  return `nx-app-visoes-v1:${parte(clienteId)}:${parte(contaId)}:${tela}`;
}

function filtroDaVisao(f, tela) {
  if (!f || typeof f !== "object" || Array.isArray(f)) return {};
  const o = {};
  // plano 1000b · RB-234: a busca digitada (nome/telefone do paciente) NUNCA vai para a visão guardada no aparelho (regra do CR-024)
  if (f.dono === "eu" || f.dono === "sem" || idVisaoSeguro(f.dono)) o.dono = f.dono;
  if (f.etiquetas && typeof f.etiquetas === "object") {
    const ids = Array.isArray(f.etiquetas.ids) ? [...new Set(f.etiquetas.ids.filter(idVisaoSeguro))].slice(0, 30) : [];
    if (ids.length) o.etiquetas = { op: ["alguma", "todas", "nenhuma"].includes(f.etiquetas.op) ? f.etiquetas.op : "alguma", ids };
  }
  if (Array.isArray(f.origem)) {
    const origem = [...new Set(f.origem.filter(x => ORIGENS_VISAO.has(x)))];
    if (origem.length) o.origem = origem;
  }
  if (tela === "kanban") {
    for (const k of ["valor_min", "valor_max"]) if (f[k] !== "" && f[k] != null && Number.isFinite(Number(f[k])) && Number(f[k]) >= 0) o[k] = Number(f[k]);
    if (o.valor_min != null && o.valor_max != null && o.valor_min > o.valor_max) { delete o.valor_min; delete o.valor_max; }
    if ([3, 7, 15, 30].includes(Number(f.parado_dias))) o.parado_dias = Number(f.parado_dias);
    if (dataISOVisao(f.criado_de)) o.criado_de = f.criado_de;
    if (dataISOVisao(f.criado_ate)) o.criado_ate = f.criado_ate;
  } else {
    if (dataISOVisao(f.criado_de)) o.criado_de = f.criado_de;
    if (dataISOVisao(f.criado_ate)) o.criado_ate = f.criado_ate;
    if (typeof f.tem_negocio_aberto === "boolean") o.tem_negocio_aberto = f.tem_negocio_aberto;
    if (idVisaoSeguro(f.empresa_id)) { o.empresa_id = f.empresa_id; if (typeof f.empresa_nome === "string") o.empresa_nome = f.empresa_nome.slice(0, 120); }
    if (f.optin_marketing === false) o.optin_marketing = false;
  }
  if (o.criado_de && o.criado_ate && o.criado_de > o.criado_ate) { delete o.criado_de; delete o.criado_ate; }
  const campo = filtroCampoLimpo(f.campo);          // plano 1000 (CR-013): o filtro por campo personalizado também vai na visão
  if (campo) o.campo = campo;
  return o;
}

function dadosDaVisao(dados, tela) {
  if (!dados || typeof dados !== "object" || Array.isArray(dados)) return null;
  const filtro = filtroDaVisao(dados.filtro, tela);
  if (tela === "kanban") {
    if (!idVisaoSeguro(String(dados.funil || ""))) return null;
    // plano 1000b · RB-004: o período dos fechados (30, 90 ou todos = 0) vai junto; visão antiga sem ele vale todos (0) ou 30
    const fechadosDias = [30, 90, 0].includes(dados.fechadosDias) ? dados.fechadosDias : (dados.todosFechados === true ? 0 : 30);
    return { funil: String(dados.funil), filtro, todosFechados: fechadosDias === 0, fechadosDias };
  }
  return { filtro, ordem: ORDEM_VISAO_CONTATOS.has(dados.ordem) ? dados.ordem : "recentes" };
}

/** Descarta estrutura inesperada, valores inválidos e excessos ao ler o armazenamento local. */
export function normalizarVisoesCRM(valor, tela) {
  if (!["kanban", "contatos"].includes(tela) || !Array.isArray(valor)) return [];
  const saida = [], ids = new Set(), nomes = new Set();
  for (const item of valor.slice(0, 100)) {
    if (!item || !idVisaoSeguro(item.id) || ids.has(item.id)) continue;
    const nome = typeof item.nome === "string" ? item.nome.trim().slice(0, 32) : "";
    const chaveNome = semAcento(nome);
    const dados = dadosDaVisao(item.dados, tela);
    if (!nome || !chaveNome || nomes.has(chaveNome) || !dados) continue;
    ids.add(item.id); nomes.add(chaveNome);
    saida.push({ id: item.id, nome, dados, atualizado_em: Number.isFinite(Number(item.atualizado_em)) ? Number(item.atualizado_em) : 0 });
    if (saida.length >= LIMITE_VISOES_CRM) break;
  }
  return saida;
}

/** Valida título antes de gravar; duplicidade ignora acentos e maiúsculas. */
export function validarNomeVisaoCRM(nome, visoes = [], ignorarId = null) {
  const limpo = String(nome ?? "").trim().replace(/\s+/g, " ");
  if (limpo.length < 2 || limpo.length > 32) return { ok: false, codigo: "nome_invalido" };
  const chave = semAcento(limpo);
  if (visoes.some(v => v.id !== ignorarId && semAcento(v.nome) === chave)) return { ok: false, codigo: "nome_duplicado" };
  return { ok: true, nome: limpo };
}

/** Cria/atualiza uma visão local. `idNovo` é injetável para manter os testes determinísticos. */
export function salvarVisaoCRM(visoes, tela, { id = null, nome, dados } = {}, { agora = Date.now(), idNovo = `v${Number(agora).toString(36)}-${Math.random().toString(36).slice(2, 8)}` } = {}) {
  const atuais = normalizarVisoesCRM(visoes, tela);
  const existente = id ? atuais.find(v => v.id === id) : null;
  const validacao = validarNomeVisaoCRM(nome, atuais, existente && existente.id);
  if (!validacao.ok) return { ...validacao, visoes: atuais };
  if (!existente && atuais.length >= LIMITE_VISOES_CRM) return { ok: false, codigo: "limite", visoes: atuais };
  const limpos = dadosDaVisao(dados, tela);
  if (!limpos) return { ok: false, codigo: "dados_invalidos", visoes: atuais };
  const visao = { id: existente ? existente.id : idNovo, nome: validacao.nome, dados: limpos, atualizado_em: Number(agora) || Date.now() };
  if (!idVisaoSeguro(visao.id)) return { ok: false, codigo: "id_invalido", visoes: atuais };
  const novas = existente ? atuais.map(v => v.id === existente.id ? visao : v) : [...atuais, visao];
  return { ok: true, codigo: existente ? "atualizada" : "criada", visoes: novas, visao };
}

/** Devolve uma cópia segura para aplicar; uma visão removida/inválida não altera a tela. */
export function aplicarVisaoCRM(visoes, tela, id) {
  const visao = normalizarVisoesCRM(visoes, tela).find(v => v.id === id);
  if (!visao) return null;
  return { id: visao.id, nome: visao.nome, dados: JSON.parse(JSON.stringify(visao.dados)) };
}

export function excluirVisaoCRM(visoes, tela, id) {
  return normalizarVisoesCRM(visoes, tela).filter(v => v.id !== id);
}

/** Retorna o id da visão que corresponde ao estado atual ou vazio se os filtros foram alterados. */
export function visaoCorrespondenteCRM(visoes, tela, dados) {
  const atual = dadosDaVisao(dados, tela);
  if (!atual) return "";
  // plano 1000b · RB-234: a visão nunca guarda a busca — com algo digitado o estado já é outro (o indicador some)
  if (dados.filtro && typeof dados.filtro.busca === "string" && dados.filtro.busca.trim()) return "";
  const serial = JSON.stringify(atual);
  return normalizarVisoesCRM(visoes, tela).find(v => JSON.stringify(v.dados) === serial)?.id || "";
}

/**
 * plano 1000b · RB-199: o estado da tela não tem nada para virar um filtro salvo? (filtro vazio — a busca não conta, ela não vai para a visão —,
 * fechados em 30 dias e o funil padrão no quadro; ordem «recentes» em Contatos). Dados inválidos também contam como «nada».
 */
export function visaoSemFiltroCRM(dados, tela, { funilPadrao = null } = {}) {
  const d = dadosDaVisao(dados, tela);
  if (!d) return true;
  if (!filtroVazio(d.filtro)) return false;
  if (tela === "kanban") return d.fechadosDias === 30 && (funilPadrao == null || String(funilPadrao) === d.funil);
  return d.ordem === "recentes";
}

/**
 * filtrar(cards, filtro, {eu}) — mesma semântica do servidor (§5.1) para o que dá para
 * conferir no cartão: busca (sem acento; só dígitos ≥ 4 → telefone), dono (eu|sem|id),
 * etiquetas {op, ids}, origem [..], status, valor_min/valor_max.
 */
export function filtrar(cards, filtro = {}, { eu } = {}) {
  const f = filtro || {};
  const q = String(f.busca || "").trim();
  const dig = q.replace(/\D/g, "");
  const porTel = q && /^[0-9\s().+-]+$/.test(q) && dig.length >= 4;
  const qn = semAcento(q);
  const ids = f.etiquetas && Array.isArray(f.etiquetas.ids) ? f.etiquetas.ids : [];
  const op = (f.etiquetas && f.etiquetas.op) || "alguma";
  return (cards || []).filter(c => {
    if (q) {
      if (porTel) {
        const tel = String(c.telefone || (c.contato && c.contato.telefone) || "");
        const k = telChave(normalizarTelefone(dig)) || dig;
        if (!tel.includes(dig) && !tel.includes(k)) return false;
      } else {
        const alvo = semAcento([c.titulo, c.nome, c.servico, c.contato && c.contato.nome].filter(Boolean).join(" "));
        if (!alvo.includes(qn)) return false;
      }
    }
    if (f.dono === "eu") { if (c.dono_id !== eu) return false; }
    else if (f.dono === "sem") { if (c.dono_id) return false; }
    else if (f.dono) { if (c.dono_id !== f.dono) return false; }
    if (ids.length) {
      const tem = new Set(c.etiquetas || []);
      const n = ids.filter(i => tem.has(i)).length;
      if (op === "alguma" && n === 0) return false;
      if (op === "todas" && n !== ids.length) return false;
      if (op === "nenhuma" && n > 0) return false;
    }
    // plano 1000b · RB-082: a mesma regra do servidor — veio de anúncio quem tem plataforma (Meta/Google), mesmo com origem «whatsapp»
    if (Array.isArray(f.origem) && f.origem.length && !f.origem.includes(c.origem) && !(c.plataforma && f.origem.includes("anuncio"))) return false;
    if (f.status && f.status !== "todos" && c.status !== f.status) return false;
    const v = Number(c.valor ?? c.valor_previsto ?? 0);
    if (f.valor_min !== undefined && f.valor_min !== null && f.valor_min !== "" && v < Number(f.valor_min)) return false;
    if (f.valor_max !== undefined && f.valor_max !== null && f.valor_max !== "" && v > Number(f.valor_max)) return false;
    return true;
  });
}

/** O que precisa ser perguntado ao mover para a etapa e: 'ganho' | 'perdido' | 'agendada' | null */
export function pedidoAoMover(estagio, estagioAtual) {
  if (!estagio) return null;
  const muda = !estagioAtual || estagio.id !== estagioAtual.id;
  if (!muda) return null;
  if (estagio.tipo === "ganho") return "ganho";
  if (estagio.tipo === "perdido") return "perdido";
  if (estagio.marco === "agendada") return "agendada";
  return null;
}

/**
 * Funis para onde um negócio pode ir (TRAVA DO ADS, mesma regra do gatilho nx_tg_negocio_antes):
 * funil do Ads + negócio fechado → só o próprio funil; funil do Ads + aberto → só funis do Ads; senão qualquer funil.
 */
export function funisPermitidos(funis, funilAtual, status) {
  const atual = (funis || []).find(f => f.id === funilAtual);
  const ativos = (funis || []).filter(f => f.ativo !== false);
  if (!atual || !atual.conta_no_ads) return ativos;
  if (status !== "aberto") return ativos.filter(f => f.id === atual.id);
  return ativos.filter(f => f.conta_no_ads);
}

/* ------------------------------------------------------------ campos personalizados */
export const TIPOS_CAMPO = Object.freeze({
  texto: "Texto", texto_longo: "Texto longo", numero: "Número", moeda: "Moeda", data: "Data", opcao: "Opção",
  multi: "Múltipla escolha", sim_nao: "Sim/Não", telefone: "Telefone", email: "E-mail", url: "Link",
});

function vazioCampo(v) {
  return v === null || v === undefined || (typeof v === "string" && v.trim() === "") || (Array.isArray(v) && v.length === 0);
}

/**
 * validarCampo({tipo, obrigatorio, opcoes, rotulo}, valor) → null (ok) ou texto do erro.
 * Normaliza nada: só diz se o valor é aceitável para o tipo.
 */
export function validarCampo(campo, valor) {
  const c = campo || {};
  if (vazioCampo(valor)) return c.obrigatorio ? `Preencha ${c.rotulo ? `«${c.rotulo}»` : "este campo"}.` : null;
  const s = typeof valor === "string" ? valor.trim() : valor;
  switch (c.tipo) {
    case "numero": return lerNumero(s) === null ? "Use só números." : null;
    case "moeda": return lerNumero(s) === null || lerNumero(s) < 0 ? "Valor inválido." : null;
    case "data": return lerData(s) ? null : "Data inválida (DD/MM/AAAA).";
    case "email": return /^[^@\s]+@[^@\s]+\.[^@\s]+$/.test(String(s)) ? null : "E-mail inválido.";
    // plano 1000b · RB-076: «www.site.com.br» é aceito (grava com https:// pelo normalizarSite, como o site da empresa)
    case "url": return /^https?:\/\/[^\s.]+\.[^\s]{2,}/i.test(String(normalizarSite(s) || "")) ? null : "Link inválido (ex.: www.site.com.br).";
    case "telefone": return normalizarTelefone(s) ? null : "Telefone inválido.";
    // plano 1000b · RB-068: maiúscula/acento diferentes casam com a opção oficial (normalizarCampo grava a oficial)
    case "opcao": return opcaoOficial(c.opcoes, s) !== null ? null : "Escolha uma das opções.";
    case "multi": {
      const lista = Array.isArray(s) ? s : String(s).split(";").map(x => x.trim()).filter(Boolean);
      return lista.every(x => opcaoOficial(c.opcoes, x) !== null) ? null : "Escolha entre as opções.";
    }
    case "sim_nao": return lerSimNao(s) !== null ? null : "Escolha sim ou não.";      // plano 1000b · RB-067: «Sim», «NÃO», «s», «N», 1/0
    case "texto": return String(s).length > 500 ? "Máximo de 500 caracteres." : null;
    case "texto_longo": return String(s).length > 5000 ? "Máximo de 5.000 caracteres." : null;
    default: return null;
  }
}

/**
 * plano 1000b · RB-067: o «Sim/Não» da planilha e do formulário — maiúscula, acento e abreviação («Sim», «NÃO», «s», «N», 1/0,
 * true/false) → true | false; qualquer outra coisa → null.
 */
export function lerSimNao(v) {
  if (v === true || v === false) return v;
  if (v === 1 || v === 0) return v === 1;
  const t = semAcento(v).trim();
  if (["sim", "s", "true", "1", "verdadeiro"].includes(t)) return true;
  if (["nao", "n", "false", "0", "falso"].includes(t)) return false;
  return null;
}

/** Valor normalizado para gravar no JSON `campos` (número como número, data ISO, multi como lista). */
export function normalizarCampo(campo, valor) {
  if (vazioCampo(valor)) return null;
  switch ((campo || {}).tipo) {
    case "numero": case "moeda": return lerNumero(valor);
    case "data": return lerData(valor);
    case "sim_nao": return lerSimNao(valor) === true;      // plano 1000b · RB-067
    // plano 1000b · RB-068: grava a opção como foi cadastrada
    case "opcao": return opcaoOficial(campo.opcoes, valor) ?? (typeof valor === "string" ? valor.trim() : valor);
    case "multi": return (Array.isArray(valor) ? valor : String(valor).split(";").map(x => x.trim()).filter(Boolean)).map(x => opcaoOficial(campo.opcoes, x) ?? x);
    case "telefone": return normalizarTelefone(valor) || String(valor).trim();
    case "url": return normalizarSite(valor) || String(valor).trim();      // plano 1000b · RB-076
    default: return typeof valor === "string" ? valor.trim() : valor;
  }
}

/** Campos personalizados que valem para a entidade (e o funil, no caso de negócio), na ordem. */
export function camposDe(campos, entidade, funilId) {
  return (campos || []).filter(c => c.entidade === entidade && c.ativo !== false
    && (entidade !== "negocio" || !c.funil_id || c.funil_id === funilId))
    .sort((a, b) => (a.ordem || 0) - (b.ordem || 0));
}

/* plano 1000 (CR-013): filtro por campo personalizado — o servidor já aplica `filtro.campo = {chave, op, valor}` (nx_crm_filtro_campo) */
export const OPS_FILTRO_CAMPO = Object.freeze({ igual: "é igual a", contem: "contém", maior: "maior que", menor: "menor que", vazio: "está vazio", preenchido: "está preenchido" });
/** plano 1000b · RB-197: o rótulo do operador para o tipo — no campo de múltipla escolha, «igual» quer dizer «inclui a opção». */
export function rotuloOpCampo(op, tipo) {
  return op === "igual" && tipo === "multi" ? "inclui" : OPS_FILTRO_CAMPO[op];
}
/** Operadores que fazem sentido para o tipo do campo (o 1º é o padrão). */
export function opsDoCampo(tipo) {
  if (["numero", "moeda", "data"].includes(tipo)) return ["igual", "maior", "menor", "vazio", "preenchido"];
  if (["opcao", "sim_nao", "multi"].includes(tipo)) return ["igual", "vazio", "preenchido"];
  return ["igual", "contem", "vazio", "preenchido"];
}
/** O filtro de campo pronto para o servidor → {chave, op, valor?} | null (campo inexistente, operador que não serve ou valor que o servidor recusaria). */
export function filtroCampoLimpo(c, campos = null) {
  if (!c || typeof c !== "object" || !/^[a-z][a-z0-9_]{1,39}$/.test(String(c.chave || ""))) return null;
  const def = Array.isArray(campos) ? campos.find(x => x.chave === c.chave) : null;
  if (Array.isArray(campos) && !def) return null;
  const op = Object.prototype.hasOwnProperty.call(OPS_FILTRO_CAMPO, c.op) ? c.op : "igual";
  if (def && !opsDoCampo(def.tipo).includes(op)) return null;
  if (op === "vazio" || op === "preenchido") return { chave: c.chave, op };
  let valor = String(c.valor ?? "").trim().slice(0, 120);
  if (!valor) return null;
  const tipo = def ? def.tipo : null;
  if (op === "maior" || op === "menor" || tipo === "numero" || tipo === "moeda" || tipo === "data") {
    if (tipo === "data" || /^\d{4}-\d{2}-\d{2}$/.test(valor)) { valor = lerData(valor); if (!valor) return null; }
    else { const n = lerNumero(valor); if (n === null) return null; valor = String(n); }
  }
  if (tipo === "sim_nao") valor = lerSimNao(valor) === true ? "true" : "false";      // plano 1000b · RB-067
  return { chave: c.chave, op, valor };
}
/** O texto do chip: «Convênio: Unimed», «Dentista: vazio», «Idade maior que 40». */
export function textoFiltroCampo(c, campos = []) {
  if (!c) return "";
  const def = (campos || []).find(x => x.chave === c.chave);
  const rot = def ? def.rotulo : c.chave;
  if (c.op === "vazio") return `${rot}: vazio`;
  if (c.op === "preenchido") return `${rot}: preenchido`;
  const v = def && def.tipo === "sim_nao" ? (c.valor === "true" ? "sim" : "não") : c.valor;
  if (c.op === "igual" && def && def.tipo === "multi") return `${rot} inclui ${v}`;      // plano 1000b · RB-197
  if (c.op === "igual") return `${rot}: ${v}`;
  return `${rot} ${OPS_FILTRO_CAMPO[c.op]} ${v}`;
}

/** Obrigatórios vazios (bloqueiam GANHAR): [{chave, rotulo}] */
export function obrigatoriosVazios(campos, entidade, funilId, valores) {
  return camposDe(campos, entidade, funilId).filter(c => c.obrigatorio && vazioCampo((valores || {})[c.chave]));
}

/* ------------------------------------------------------------ textos */
/** Título do cartão: título → nome do contato → nome → telefone → "Sem nome". */
export function tituloCard(c) {
  if (!c) return "Sem nome";
  const t = (c.titulo || "").trim();
  if (t) return t;
  const n = (c.contato && c.contato.nome) || c.nome;
  if (n && String(n).trim()) return String(n).trim();
  const tel = (c.contato && c.contato.telefone) || c.telefone;
  return tel ? formatarTel(tel) : "Sem nome";
}

/** Como chamar o contato na tela: nome → telefone → e-mail → "Sem nome" (quem entrou só com e-mail, pelo site ou por planilha, continua identificável). */
export function nomeContato(c) {
  if (!c) return "Sem nome";
  const n = String(c.nome || "").trim();
  if (n) return n;
  return (c.telefone && formatarTel(c.telefone)) || String(c.email || "").trim() || "Sem nome";
}

/* plano 1000 (CR-225/226): idade e aniversário pela data de nascimento (AAAA-MM-DD) e o dia de hoje em São Paulo (AAAA-MM-DD) */
const partesIso = v => { const m = /^(\d{4})-(\d{2})-(\d{2})/.exec(String(v || "")); return m ? [Number(m[1]), Number(m[2]), Number(m[3])] : null; };
/** Idade completa em anos; null sem data válida ou com nascimento no futuro. idadeEm("1990-03-02", "2026-10-13") → 36 */
export function idadeEm(nascimento, hojeIso) {
  const n = partesIso(nascimento), h = partesIso(hojeIso);
  if (!n || !h) return null;
  let anos = h[0] - n[0];
  if (h[1] < n[1] || (h[1] === n[1] && h[2] < n[2])) anos--;
  return anos >= 0 && anos < 150 ? anos : null;
}
/**
 * O próximo aniversário a até `janela` dias → {dias, idade (a que fará), texto} | null. 29/02 em ano sem 29 vale 28/02.
 * aniversario("1990-10-14", "2026-10-13") → {dias: 1, idade: 36, texto: "Aniversário amanhã (36 anos)"}
 */
export function aniversario(nascimento, hojeIso, janela = 7) {
  const n = partesIso(nascimento), h = partesIso(hojeIso);
  if (!n || !h) return null;
  const hoje = Date.UTC(h[0], h[1] - 1, h[2]);
  const naData = ano => { const ult = new Date(Date.UTC(ano, n[1], 0)).getUTCDate(); return Date.UTC(ano, n[1] - 1, Math.min(n[2], ult)); };
  let ano = h[0], quando = naData(ano);
  if (quando < hoje) { ano++; quando = naData(ano); }
  const dias = Math.round((quando - hoje) / 86400000);
  const idade = ano - n[0];
  if (dias > janela || idade <= 0) return null;
  const texto = dias === 0 ? `Faz ${idade} ${idade === 1 ? "ano" : "anos"} hoje` : dias === 1 ? `Aniversário amanhã (${idade} anos)` : `Aniversário em ${dias} dias (${idade} anos)`;
  return { dias, idade, texto };
}

/** "5512998303030" → "(12) 99830-3030" (igual ao ui.telBR) */
export function formatarTel(digitos) {
  let d = String(digitos ?? "").replace(/\D/g, "");
  if (!d) return "";
  const br = d.length >= 12 && d.length <= 13 && d.startsWith("55");
  if (br) d = d.slice(2);
  // plano 1000 (CR-264): 10–11 dígitos SEM o 55 que não formam um número brasileiro são de outro país — «+1 2125551234», como na importação
  if ((d.length === 10 || d.length === 11) && (br || pareceBrasileiro(d))) {
    return d.length === 11 ? `(${d.slice(0, 2)}) ${d.slice(2, 7)}-${d.slice(7)}` : `(${d.slice(0, 2)}) ${d.slice(2, 6)}-${d.slice(6)}`;
  }
  const ddi = /^(1|7|2[07]|3[0-469]|4[013-9]|5[1-8]|6[0-6]|8[1246]|9[0-58])/.exec(d);
  return ddi && d.length > ddi[1].length + 6 ? `+${ddi[1]} ${d.slice(ddi[1].length)}` : `+${d}`;
}

export const ROTULO_ORIGEM = Object.freeze({
  anuncio: "Anúncio", whatsapp: "WhatsApp", indicacao: "Indicação", organico: "Orgânico",
  manual: "Cadastro manual", site: "Site", importacao: "Importação",
});

export const ROTULO_TAREFA = Object.freeze({
  tarefa: "Tarefa", ligacao: "Ligação", reuniao: "Reunião", visita: "Visita", whatsapp: "WhatsApp", email: "E-mail",
});
export const ICONE_TAREFA = Object.freeze({
  tarefa: "tarefa", ligacao: "telefone", reuniao: "usuario", visita: "empresa", whatsapp: "whatsapp", email: "enviar",
});

/** Textos de erro do CRM (Apêndice B + códigos do CRM que o api.js não conhece). */
const ERROS_CRM = {
  tarefa_nao_encontrada: "Não encontramos essa tarefa — ela pode ter sido removida.",
  nota_nao_encontrada: "Não encontramos essa nota — ela pode ter sido removida.",
  etiqueta_nao_encontrada: "Não encontramos essa etiqueta — ela pode ter sido removida.",
  negocio_nao_encontrado: "Não encontramos esse registro — ele pode ter sido removido.",
  contato_nao_encontrado: "Não encontramos esse registro — ele pode ter sido removido.",
  valor_obrigatorio: "Informe o valor para marcar como ganho.",
  telefone_invalido: "Telefone inválido. Use DDD + número, por exemplo (12) 99830-3030.",
  telefone_em_uso: "Já existe um cadastro com esse telefone.",
  empresa_nao_encontrada: "Não encontramos essa empresa — ela pode ter sido removida.",
  campo_nao_encontrado: "Não encontramos esse campo — ele pode ter sido removido.",
  motivo_nao_encontrado: "Não encontramos esse motivo — ele pode ter sido removido.",
};
/** hints de funil_invalido / estagio_invalido (editor de funis, excluir funil, importar) */
const DICAS_FUNIL = {
  tipos: "O funil precisa de pelo menos uma etapa aberta, uma de ganho e uma de perda.",
  marcos: "Um funil que conta nos anúncios precisa das etapas com os marcos «Nova conversa» e «Fechou».",
  marco_obrigatorio: "No funil que conta nos anúncios, toda etapa precisa de um marco.",
  marco_tipo: "O marco escolhido não combina com o tipo da etapa.",
  marco: "Marco inválido.",
  nome: "Dê um nome ao funil.",
  nome_em_uso: "Já existe um funil com esse nome.",
  etapa_nome: "Dê um nome a cada etapa.",
  etapa_repetida: "Há duas etapas com o mesmo nome.",
  etapas: "O funil precisa ter de 1 a 25 etapas.",
  cor: "Cor inválida.", probabilidade: "Probabilidade entre 0 e 100%.", sla: "O prazo vai de 1 hora a 90 dias (2.160 horas).",
  padrao_sem_ads: "O funil padrão recebe as conversas do WhatsApp e precisa contar nos anúncios.",
  padrao_inativo: "O funil padrão não pode ficar desativado.",
  precisa_padrao: "Escolha outro funil como padrão antes de tirar este.",
  padrao: "O funil padrão não pode ser excluído. Escolha outro como padrão antes.",
  destino: "Escolha uma etapa de destino válida.",
  destino_sem_fechadas: "O funil de destino precisa ter etapas de ganho e de perda.",
  nao_encontrado: "Esse funil não existe mais. Recarregue a página.",
  funil_sem_etapa: "Esse funil não tem etapa aberta.",
  formato: "Confira os dados do funil.",
};
/** plano 1000 (CR-207): as dicas que falam do registro usam o termo da vertical (t = termosNegocio(vocab)). */
const DICAS_FUNIL_TERMO = {
  entra_no_ads: t => `Só um funil sem ${t.ns} pode passar a contar nos anúncios (ou ${t.os} ${t.ns} dele irem para um que conta).`,
  etapa_com_negocios: t => `Não dá para mudar o tipo ou o marco de uma etapa que tem ${t.ns}. Mova ${t.os} ${t.ns} antes.`,
  tem_fechados: t => `Este funil tem ${t.ns} fechad${t.a}s que contam nos anúncios. Desative-o em vez de excluir.`,
  destino_tipo: t => `${t.Os} ${t.ns} só podem ir para uma etapa do mesmo tipo (aberta, ganho ou perda).`,
  mover: t => `Confira para onde vão ${t.os} ${t.ns}.`,
};
/** O termo do registro na vertical: {n, ns, N, a ('o'|'a'), fem, os, Os}. Sem vocab: «negócio». */
export function termosNegocio(vocab) {
  const n = vocab && typeof vocab.min === "function" ? vocab.min("negocio") : "negócio";
  const ns = vocab && typeof vocab.min === "function" ? vocab.min("negocios") : "negócios";
  const fem = !!(vocab && typeof vocab.art === "function" && vocab.art("negocio") === "a");
  return { n, ns, N: n ? n[0].toUpperCase() + n.slice(1) : n, a: fem ? "a" : "o", fem, os: fem ? "as" : "os", Os: fem ? "As" : "Os" };
}
const DICAS_DADOS = {
  email: "Confira o e-mail.", uf: "UF deve ter 2 letras (ex.: SP).", dono_id: "Esse responsável não tem acesso a esta empresa.",
  valor_previsto: "Confira o valor.", valor: "Confira o valor.", titulo: "Informe o título.", texto: "Escreva o texto.",
  optin_origem: "Diga de onde veio a autorização (ex.: ficha assinada na recepção).", contato: "Informe o nome ou o telefone.",
  confirmacao: "Digite «excluir» para confirmar.", nome: "Informe o nome.", cor: "Cor inválida.",
  nome_em_uso: "Esse nome já está em uso.", motivo_perda_id: "Escolha um motivo da lista.",
  empresa_id: "Empresa não encontrada.", consulta_em: "Data e hora inválidas.", data_consulta: "Data inválida.",
  previsao_fechamento: "Data inválida.", nascimento: "Data de nascimento inválida.", campo: "Filtro de campo inválido.",
  rotulo: "Dê um nome ao campo.", rotulo_em_uso: "Já existe um campo com esse nome.", chave: "A chave não pode mudar depois de criada.",
  chave_em_uso: "Essa chave já está em uso.", max_campos: "Máximo de 50 campos por tipo de cadastro.",
  opcoes: "Informe de 1 a 50 opções (uma por linha).", tipo: "Tipo inválido.", entidade: "Escolha para qual cadastro é o campo.",
  site: "Site inválido (ex.: www.suaempresa.com.br).", linhas: "Envie de 1 a 100 linhas por vez.",
  importacao_id: "A importação não foi encontrada. Comece de novo.", atualizar: "Opção inválida.", opcoes_importacao: "Opções inválidas.",
};

/**
 * textoErro(e, {campos, vocab, padrao}) → texto para o usuário.
 * campo_obrigatorio usa o RÓTULO do campo (o hint é a chave); dados_invalidos usa a dica da chave.
 */
export function textoErro(e, { campos = [], padrao, vocab } = {}) {
  const c = e && (e.codigo || e.message);
  const hint = e && e.hint != null ? String(e.hint) : "";
  // plano 1000 (CR-207): as frases de funil falam o termo da vertical («oportunidade», «orçamento»), com a concordância certa
  const t = termosNegocio(vocab);
  if (c === "campo_obrigatorio") {
    const cp = (campos || []).find(x => x.chave === hint);
    return `Preencha o campo "${cp ? cp.rotulo : hint || "obrigatório"}" antes de continuar.`;
  }
  if (c === "dados_invalidos" && DICAS_DADOS[hint]) return DICAS_DADOS[hint];
  if (c === "motivo_obrigatorio") return `Escolha o motivo da perda${hint === "texto" ? " e escreva a justificativa" : ""}.`;
  if ((c === "funil_invalido" || c === "estagio_invalido") && hint === "fechado_no_ads")
    return `${t.N} fechad${t.a} no funil de anúncios não muda de funil. Use Iniciar pós-venda.`;
  if ((c === "funil_invalido" || c === "estagio_invalido") && hint === "sai_do_ads")
    return `${t.fem ? "Essa" : "Esse"} ${t.n} veio do funil de anúncios e só pode ir para outro funil de anúncios.`;
  if (c === "estagio_invalido" && hint === "fechado") return `${t.fem ? "Uma" : "Um"} ${t.n} nov${t.a} começa numa etapa aberta.`;
  const dicaComTermo = DICAS_FUNIL_TERMO[hint];
  if ((c === "funil_invalido" || c === "estagio_invalido") && dicaComTermo) return dicaComTermo(t);
  if ((c === "funil_invalido" || c === "estagio_invalido") && DICAS_FUNIL[hint]) return DICAS_FUNIL[hint];
  if (c === "estagio_com_negocios") {
    const n = Number(hint);
    const eles = um => (t.fem ? (um ? "ela vai" : "elas vão") : (um ? "ele vai" : "eles vão"));
    return Number.isFinite(n) && n > 0 ? `Essa etapa tem ${n} ${n === 1 ? t.n : t.ns}. Escolha para onde ${eles(n === 1)}.`
      : `Essa etapa tem ${t.ns}. Escolha para onde ${eles(false)}.`;
  }
  if (ERROS_CRM[c]) return ERROS_CRM[c];
  // plano 1000 (CR-208): o código técnico («http_500») não entra na frase da pessoa — vai para codigoSuporte(e) (pequeno na tela / no console)
  if (typeof padrao === "function") return semCodigoTecnico(padrao(e));
  return "Não deu certo agora. Tente de novo em instantes.";
}
/** plano 1000 (CR-208): «Não deu certo agora (http_500). Tente…» → «Não deu certo agora. Tente…» (o resto da frase fica como veio). */
export function semCodigoTecnico(t) {
  return String(t ?? "").replace(/^(Não deu certo agora) \([^)]{1,80}\)/, "$1");
}
/** plano 1000 (CR-208/266): o código para o suporte («http_500», «sessao_invalida»), sem frase; null quando não há. */
export function codigoSuporte(e) {
  // plano 1000b · RB-191: a mensagem crua («Failed to fetch») não é código — vai só para o console de quem chama
  const c = e && (e.codigo || (e.status ? `http_${e.status}` : null));
  return c ? String(c).slice(0, 60) : null;
}

/**
 * Frase de um item da linha do tempo (ItemTempo). nomes: id da conta → nome; etapas: id → nome.
 */
export function textoTempo(it, { nomes = {}, vocab, brl = v => `R$ ${v}`, motivos = {} } = {}) {
  const d = (it && it.dados) || {};
  const neg = vocab ? vocab.min("negocio") : "negócio";
  const nomeDe = id => (id && nomes[id]) || (id ? "outra pessoa" : "ninguém");
  if (it.fonte === "nota") return `Nota: ${d.texto || ""}`;
  // plano 1000b · RB-084: sem título, «Criou uma tarefa» (antes: «Criou a tarefa «»»)
  if (it.fonte === "tarefa") {
    const tit = String(d.titulo || "").trim();
    const fez = it.tipo === "tarefa_concluida" ? "Concluiu" : "Criou";
    return tit ? `${fez} a tarefa «${tit}»` : `${fez} uma tarefa`;
  }
  switch (it.tipo) {
    case "negocio_criado": return `Criou ${vocab ? (vocab.art("negocio") === "a" ? "a " : "o ") : "o "}${neg}${d.titulo ? ` «${d.titulo}»` : ""}`;
    case "estagio": return `Moveu de «${d.de_nome || "—"}» para «${d.para_nome || "—"}»`;
    // plano 1000b · RB-044: o termo da vertical é o NOME da etapa («Fechou»/«Não fechou»), não adjetivo — vai entre aspas como está
    case "ganho": return `Marcou como «${vocab ? vocab.ganhar : "Ganho"}»${d.valor != null ? ` · ${brl(d.valor)}` : ""}`;
    case "perdido": return `Marcou como «${vocab ? vocab.perder : "Perdido"}»${d.motivo && motivos[d.motivo] ? ` · ${motivos[d.motivo]}` : ""}${d.texto ? ` — ${d.texto}` : ""}`;
    case "reaberto": return `Reabriu ${vocab ? (vocab.art("negocio") === "a" ? "a " : "o ") : "o "}${neg}`;
    case "dono": return d.para ? `Responsável: ${nomeDe(d.para)}` : "Ficou sem responsável";
    case "conversa_aberta": return `Atendimento ${d.protocolo || ""} aberto`.replace(/\s+/g, " ").trim();
    case "conversa_resolvida": return `Atendimento ${d.protocolo || ""} resolvido`.replace(/\s+/g, " ").trim();
    case "atribuida": return d.para ? `Conversa atribuída a ${nomeDe(d.para)}` : "Conversa ficou sem responsável";
    case "etiqueta": return "Etiquetas alteradas";
    case "importado": return "Veio da importação de planilha";
    case "automacao": return `Automação${d.nome ? ` «${d.nome}»` : ""} executada`;
    case "contato_mesclado": return "Cadastros duplicados foram unidos";
    // plano 100 · C6: nx_agenda_presenca grava {presenca, consulta_em, estagio_id}
    case "presenca": return d.presenca === "faltou" ? "Faltou à consulta" : d.presenca === "compareceu" ? "Compareceu à consulta" : "Presença da consulta limpa";
    default: return String(it.tipo || "Registro").replace(/_/g, " ");
  }
}

/** Ícone do sprite para um item da linha do tempo. */
export function iconeTempo(it) {
  if (it.fonte === "nota") return "nota";
  if (it.fonte === "tarefa") return it.tipo === "tarefa_concluida" ? "check" : "tarefa";
  if (it.tipo === "presenca") return it.dados && it.dados.presenca === "faltou" ? "fechar" : "check";
  return ({ negocio_criado: "mais", estagio: "seta-dir", ganho: "check", perdido: "fechar", reaberto: "relogio", dono: "usuario",
    conversa_aberta: "chat", conversa_resolvida: "checks", atribuida: "usuario", importado: "camadas", automacao: "raio",
    etiqueta: "etiqueta", contato_mesclado: "camadas" })[it.tipo] || "info";
}

/* ------------------------------------------------------------ editor de funis (T14 · CRM) */
/** Marcos do Ads (liga a etapa ao ROI do painel). Rótulos da interface. */
export const MARCOS = Object.freeze([
  { id: "nova", rotulo: "Nova conversa", tipo: "aberto" },
  { id: "agendada", rotulo: "Agendou", tipo: "aberto" },
  { id: "orcamento", rotulo: "Orçamento", tipo: "aberto" },
  { id: "faltou", rotulo: "Faltou", tipo: "aberto" },
  { id: "fechou", rotulo: "Fechou", tipo: "ganho" },
  { id: "nao_fechou", rotulo: "Não fechou", tipo: "perdido" },
  { id: "perdida", rotulo: "Perdida", tipo: "perdido" },
]);
export const TIPOS_ETAPA = Object.freeze({ aberto: "Aberta", ganho: "Ganho", perdido: "Perda" });

/**
 * plano 1000b · RB-019: o texto do chip do filtro por etiquetas sem a chave técnica («(alguma)»). op: alguma | todas | nenhuma.
 */
/** plano 1000b · RB-018: os nomes para o chip — id que não existe mais vira «etiqueta removida» (uma vez só), em vez de sumir e deixar o chip vazio. */
export function nomesEtiquetasChip(ids, etiquetaDe) {
  const nomes = [];
  let removida = false;
  for (const id of ids || []) {
    const e = typeof etiquetaDe === "function" ? etiquetaDe(id) : null;
    if (e && e.nome) nomes.push(e.nome); else removida = true;
  }
  if (removida) nomes.push("etiqueta removida");
  return nomes;
}
export function textoChipEtiquetas(op, nomes) {
  const lista = (nomes || []).filter(Boolean).join(", ");
  if (op === "todas") return `Tem todas: ${lista}`;
  if (op === "nenhuma") return `Sem nenhuma de: ${lista}`;
  return `Tem alguma de: ${lista}`;
}

/**
 * plano 1000b · RB-042/136: exemplos por vertical — o título do negócio novo, o vazio dos campos de negócio, o placeholder do rótulo do campo e o
 * vazio das etiquetas (a oficina não vê «Implante superior» nem «dentista responsável»). Vertical desconhecida → genérico.
 */
const EXEMPLOS_VERTICAL = Object.freeze({
  odonto: { titulo: "Implante superior", campos: "dentista responsável, dentes", campo: "Dentista responsável", etiquetas: "Implante, Urgência" },
  oficina: { titulo: "Troca de embreagem", campos: "placa, quilometragem", campo: "Placa do veículo", etiquetas: "Revisão, Urgente" },
  loja: { titulo: "Kit presente", campos: "tamanho, forma de entrega", campo: "Tamanho", etiquetas: "Presente, Atacado" },
  generico: { titulo: "Proposta mensal", campos: "prazo de entrega, plano escolhido", campo: "Plano escolhido", etiquetas: "Prioridade, Retorno" },
});
export function exemplosVertical(vertical) { return EXEMPLOS_VERTICAL[vertical] || EXEMPLOS_VERTICAL.generico; }
export function exemploTituloNegocio(vertical) { return exemplosVertical(vertical).titulo; }

/** plano 1000b · RB-120: quem «escreveu» o que veio sem autor (automação, servidor) — o MESMO nome nas notas e na linha do tempo. */
export const AUTOR_AUTOMATICO = "Automático";

/** plano 1000b · RB-029: texto do chip do filtro por responsável — pessoa desligada da empresa vira «pessoa removida» (antes: «—»). */
export function textoChipDono(dono, usuario) {
  if (dono === "eu") return "Responsável: eu";
  if (dono === "sem") return "Responsável: sem responsável";
  return `Responsável: ${(usuario && usuario.nome) || "pessoa removida"}`;
}

/** plano 1000b · RB-213: o vazio da lista diz o que foi procurado quando só há busca («Nada encontrado para «ana».»). */
export function textoSemResultado(filtro) {
  const f = { ...(filtro || {}) };
  const q = typeof f.busca === "string" ? f.busca.trim() : "";
  delete f.busca;
  return q && filtroVazio(f) ? `Nada encontrado para «${q}».` : "Nada encontrado com esses filtros.";
}

/**
 * plano 1000b · RB-227 (RB-091): o rótulo do número de ganhos no resumo da empresa, concordando com o registro da vertical
 * (odonto: «1 fechada · 2 fechadas»; oficina: «aprovado(s)»; loja: «vendida(s)»; genérico: «ganho(s)»). Antes: «fechous».
 */
const PARTICIPIO_GANHO = Object.freeze({ odonto: "fechad", oficina: "aprovad", loja: "vendid", generico: "ganh" });
export function textoGanhosEmpresa(n, vocab) {
  const v = vocab || {};
  const raiz = PARTICIPIO_GANHO[v.vertical] || String(v.ganhar || "ganho").toLowerCase().replace(/[oa]$/, "");
  const fem = typeof v.art === "function" && v.art("negocio") === "a";
  return `${raiz}${fem ? "a" : "o"}${Number(n) === 1 ? "" : "s"}`;
}

/**
 * plano 1000b · RB-210: rótulos do resumo de ganhos da ficha pela vertical — «compras» só na loja; clínica fala de tratamentos fechados, oficina
 * de serviços aprovados, o genérico de negócios ganhos. → {secao, vazio, total, n, ultima}
 */
const ROTULOS_COMPRAS = Object.freeze({
  odonto: { secao: "Resumo de tratamentos", vazio: "Ainda sem tratamentos fechados.", total: "Total em tratamentos", n: "Tratamentos fechados", ultima: "Último fechamento" },
  oficina: { secao: "Resumo de serviços", vazio: "Ainda sem serviços aprovados.", total: "Total em serviços", n: "Serviços aprovados", ultima: "Última aprovação" },
  loja: { secao: "Resumo de compras", vazio: "Ainda sem compras.", total: "Total gasto", n: "Compras", ultima: "Última compra" },
  generico: { secao: "Resumo de negócios ganhos", vazio: "Ainda sem negócios ganhos.", total: "Total ganho", n: "Negócios ganhos", ultima: "Último ganho" },
});
export function rotulosCompras(vocab) {
  const v = (vocab && vocab.vertical) || "generico";
  return ROTULOS_COMPRAS[v] || ROTULOS_COMPRAS.generico;
}

/** Marcos que combinam com o tipo da etapa (mesma regra do check nx_estagios_marco_tipo). */
export function marcosDoTipo(tipo) { return MARCOS.filter(m => m.tipo === tipo); }

/**
 * plano 1000 (CR-132): o prazo da etapa em horas OU dias (o dono pensa em dias). unidadeSla(horas) → "d" quando é um número
 * inteiro de dias (24, 72…), senão "h"; valorSla(horas, un) → o número que o campo mostra; horasSla(valor, un) → sla_horas
 * (null quando vazio; o que não é número volta NaN para a validação recusar).
 */
/** plano 1000b · RB-080: o prazo da etapa como o dono configurou — 72 → «3 dias», 24 → «1 dia», 5 → «5 h». */
export function textoPrazoSla(horas) {
  const n = Number(horas);
  if (!Number.isFinite(n) || n <= 0) return "";
  if (unidadeSla(n) === "d") { const d = n / 24; return `${d} ${d === 1 ? "dia" : "dias"}`; }
  return `${n} h`;
}
export function unidadeSla(horas) { const n = Number(horas); return horas !== null && horas !== "" && Number.isInteger(n) && n > 0 && n % 24 === 0 ? "d" : "h"; }
export function valorSla(horas, un) { if (horas === null || horas === undefined || horas === "") return ""; return un === "d" ? Number(horas) / 24 : Number(horas); }
export function horasSla(valor, un) {
  if (valor === null || valor === undefined || String(valor).trim() === "") return null;
  const n = Number(String(valor).replace(",", "."));
  if (!Number.isFinite(n)) return NaN;
  // plano 1000b · RB-081: «1,5» hora vira 2 h (antes: erro «de 1 hora a 90 dias», que não dizia que o problema era a fração)
  return un === "d" ? Math.round(n * 24) : Math.round(n);
}

/** Probabilidade padrão por tipo (a mesma do servidor). */
export function probPadrao(tipo) { return tipo === "ganho" ? 100 : tipo === "perdido" ? 0 : 10; }

/**
 * plano 1000b · RB-242: chance sugerida para uma etapa aberta nova na posição `pos` de `etapas`: a média entre a aberta de antes e a de depois;
 * sem aberta depois (a nova fica logo antes das fechadas), a média entre a anterior e 100 (o fechamento). Sem aberta antes: 10.
 */
export function probNovaEtapa(etapas, pos) {
  const lista = etapas || [];
  const num = e => (e && e.tipo === "aberto" && e.probabilidade !== null && e.probabilidade !== "" && Number.isFinite(Number(e.probabilidade)) ? Number(e.probabilidade) : null);
  let antes = null, depois = null;
  for (let j = Math.min(pos, lista.length) - 1; j >= 0 && antes === null; j--) antes = num(lista[j]);
  for (let j = pos; j < lista.length && depois === null; j++) depois = num(lista[j]);
  if (antes === null) return 10;
  const r = Math.round((antes + (depois === null ? 100 : depois)) / 2);
  return Math.max(0, Math.min(99, r));
}

/**
 * validarFunil({nome, conta_no_ads, estagios:[{nome,tipo,marco,probabilidade,sla_horas,cor}]}) →
 * [] (ok) ou [{indice|null, campo, hint, texto}] — mesmas regras de nx_funil_salvar, para avisar antes de salvar.
 */
export function validarFunil(f, { outros = [] } = {}) {
  const erros = [];
  const add = (indice, campo, hint) => erros.push({ indice, campo, hint, texto: DICAS_FUNIL[hint] || "Confira os dados." });
  const nomeFunil = String(f && f.nome || "").trim();
  if (!nomeFunil) add(null, "nome", "nome");
  // plano 1000b · RB-146: nome de OUTRO funil (sem acento/maiúscula) é recusado aqui, antes de ir ao servidor
  else if ((outros || []).some(o => o && o.id !== (f && f.id) && semAcento(String(o.nome || "").trim()) === semAcento(nomeFunil))) add(null, "nome", "nome_em_uso");
  const est = (f && f.estagios) || [];
  if (est.length < 1 || est.length > 25) add(null, "estagios", "etapas");
  const nomes = new Set();
  const cont = { aberto: 0, ganho: 0, perdido: 0 };
  const marcos = new Set();
  est.forEach((e, i) => {
    const nome = String(e.nome || "").trim();
    if (!nome) add(i, "nome", "etapa_nome");
    else if (nomes.has(semAcento(nome))) add(i, "nome", "etapa_repetida");
    nomes.add(semAcento(nome));
    const tipo = e.tipo || "aberto";
    if (cont[tipo] === undefined) add(i, "tipo", "tipos"); else cont[tipo]++;
    if (f.conta_no_ads) {
      if (!e.marco) add(i, "marco", "marco_obrigatorio");
      else if (!MARCOS.some(m => m.id === e.marco && m.tipo === tipo)) add(i, "marco", "marco_tipo");
      else marcos.add(e.marco);
    }
    if (e.probabilidade !== null && e.probabilidade !== undefined && e.probabilidade !== "") {
      const p = Number(e.probabilidade);
      if (!Number.isInteger(p) || p < 0 || p > 100) add(i, "probabilidade", "probabilidade");
    }
    if (e.sla_horas !== null && e.sla_horas !== undefined && e.sla_horas !== "") {
      const s = Number(e.sla_horas);
      if (!Number.isInteger(s) || s < 1 || s > 2160) add(i, "sla_horas", "sla");
    }
  });
  if (est.length && (!cont.aberto || !cont.ganho || !cont.perdido)) add(null, "estagios", "tipos");
  if (f && f.conta_no_ads && est.length && !erros.some(x => x.hint === "marco_obrigatorio" || x.hint === "marco_tipo")
      && (!marcos.has("nova") || !marcos.has("fechou"))) add(null, "estagios", "marcos");
  return erros;
}

/**
 * plano 100 · C8: marcos que o Órbita usa para mover o negócio sozinho e que o funil (dos anúncios) não tem em etapa nenhuma — aviso do editor.
 * Sem «fechou»/«nao_fechou|perdida» a automação «marcar como ganho/perdido» não acha a etapa; sem «faltou» a presença «Faltou» não move;
 * sem «agendada» marcar a consulta não muda a etapa. Funil fora dos anúncios não usa marcos: nada a avisar.
 * → [{marco, rotulo, efeito}]
 */
export function marcosFaltando(f, etapas) {
  if (!f || !f.conta_no_ads) return [];
  const tem = new Set((etapas || []).map(e => e && e.marco).filter(Boolean));
  const faltam = [];
  if (!tem.has("fechou")) faltam.push({ marco: "fechou", rotulo: "Ganho", efeito: "a automação não vai conseguir mover para «ganho»" });
  if (!tem.has("nao_fechou") && !tem.has("perdida")) faltam.push({ marco: "nao_fechou", rotulo: "Perdido", efeito: "a automação não vai conseguir mover para «perdido»" });
  if (!tem.has("faltou")) faltam.push({ marco: "faltou", rotulo: "Faltou", efeito: "a presença «Faltou» da consulta não vai mover o negócio" });
  if (!tem.has("agendada")) faltam.push({ marco: "agendada", rotulo: "Agendou", efeito: "marcar a consulta não vai mudar a etapa" });
  return faltam;
}
/** Frase do aviso inline: «Ganho/Perdido/Faltou sem etapa: a automação não vai conseguir mover …». "" quando não falta nada. */
export function textoMarcosFaltando(lista) {
  const l = Array.isArray(lista) ? lista : [];
  if (!l.length) return "";
  return `${l.map(x => x.rotulo).join("/")} sem etapa: ${l.map(x => x.efeito).join("; ")}. Dê o marco a uma etapa para a automação, a agenda e a presença saberem para onde mover.`;
}

/** Etapas que existiam (com id) e saíram da lista editada. */
export function etapasRemovidas(originais, editadas) {
  const ficam = new Set((editadas || []).map(e => e.id).filter(Boolean));
  return (originais || []).filter(e => e.id && !ficam.has(e.id));
}

/** Destinos possíveis para os negócios de uma etapa removida: etapas mantidas (com id) do MESMO tipo. */
export function destinosPara(removida, editadas) {
  return (editadas || []).filter(e => e.id && e.id !== removida.id && (e.tipo || "aberto") === (removida.tipo || "aberto"));
}

/**
 * Remover uma etapa que já é DESTINO de outra removida: quem ia para ela passa a ir para `destino`
 * (senão o servidor recusa com estagio_invalido/destino e a tela mostraria «?»).
 * mover = {etapa_removida: etapa_destino}. Devolve um NOVO objeto; com `comNegocios`, a própria etapa entra também.
 */
export function repontarMover(mover, removidaId, destino, comNegocios = false) {
  const m = {};
  for (const [k, v] of Object.entries(mover || {})) m[k] = v === removidaId ? destino : v;
  if (comNegocios && removidaId && destino) m[removidaId] = destino;
  return m;
}
/** Etapas removidas cujos negócios iriam para a etapa `id`. */
export function quemVaiPara(mover, id) {
  return Object.keys(mover || {}).filter(k => mover[k] === id);
}

/** Corpo de nx_funil_salvar a partir do editor (etapas na ordem da tela; marco só no funil do Ads). */
export function payloadFunil(f, etapas, mover = {}) {
  const p = { nome: String(f.nome || "").trim(), conta_no_ads: !!f.conta_no_ads, ativo: f.ativo !== false };
  if (f.id) p.id = f.id;
  if (f.padrao !== undefined) p.padrao = !!f.padrao;
  p.estagios = (etapas || []).map(e => {
    const o = { nome: String(e.nome || "").trim(), tipo: e.tipo || "aberto", cor: e.cor || null,
      marco: f.conta_no_ads ? (e.marco || null) : null,
      probabilidade: e.probabilidade === "" || e.probabilidade === null || e.probabilidade === undefined ? null : Number(e.probabilidade),
      sla_horas: e.sla_horas === "" || e.sla_horas === null || e.sla_horas === undefined ? null : Number(e.sla_horas) };
    if (e.id) o.id = e.id;
    return o;
  });
  const m = {};
  for (const [k, v] of Object.entries(mover || {})) if (k && v) m[k] = v;
  if (Object.keys(m).length) p.mover = m;
  return p;
}

/** Move um item da lista de i para j (reordenar etapas/campos/motivos pelo teclado ou arrastando). */
export function moverItem(lista, i, j) {
  const a = (lista || []).slice();
  if (i < 0 || i >= a.length || j < 0 || j >= a.length || i === j) return a;
  const [x] = a.splice(i, 1);
  a.splice(j, 0, x);
  return a;
}

/* ------------------------------------------------------------ importação (T10) */
/** Destinos disponíveis no passo 2: fixos + campos personalizados de contato. */
export function destinosImportacao(campos = []) {
  return [...DESTINOS_IMPORTACAO.map(d => ({ valor: d.chave, rotulo: d.rotulo })),
    ...(campos || []).filter(c => c && c.entidade === "contato" && c.ativo !== false).map(c => ({ valor: `campo:${c.chave}`, rotulo: `Campo: ${c.rotulo}` }))];
}

/** O mapeamento tem o mínimo para achar/criar alguém (nome, telefone ou e-mail)? */
export function mapaValido(mapa) {
  return (mapa || []).some(d => d === "nome" || d === "telefone" || d === "email");
}

/** O mapeamento traz dados de negócio (título, valor, etapa)? */
export function mapaTemNegocio(mapa) {
  return (mapa || []).some(d => d === "negocio_titulo" || d === "negocio_valor" || d === "estagio");
}
/** plano 1000b · RB-133: os nomes curtos das colunas de negócio mapeadas, na ordem fixa → ["Título", "Valor", "Etapa"] (só as que estão no mapa). */
export function colunasNegocioMapeadas(mapa) {
  const m = new Set(mapa || []);
  return [["negocio_titulo", "Título"], ["negocio_valor", "Valor"], ["estagio", "Etapa"]].filter(([d]) => m.has(d)).map(([, r]) => r);
}
/** «A», «A e B», «A, B e C». */
export function juntarE(lista) {
  const l = (lista || []).filter(Boolean).map(String);
  return l.length <= 1 ? (l[0] || "") : `${l.slice(0, -1).join(", ")} e ${l[l.length - 1]}`;
}

/** Soma o resultado de um lote no acumulado do resumo. */
export function somarImportacao(acc, r) {
  const a = acc || { criados: 0, atualizados: 0, ignorados: 0, erros: [], avisos: [] };
  return {
    criados: a.criados + (Number(r && r.criados) || 0),
    atualizados: a.atualizados + (Number(r && r.atualizados) || 0),
    ignorados: a.ignorados + (Number(r && r.ignorados) || 0),
    erros: [...a.erros, ...((r && r.erros) || [])],
    avisos: [...a.avisos, ...((r && r.avisos) || [])],
  };
}

/** Texto curto do resumo final ("120 criados · 30 atualizados · 5 ignorados · 2 erros"). */
export function textoResumoImportacao(s) {
  const p = (n, um, varios) => `${n} ${n === 1 ? um : varios}`;
  return [p(s.criados, "criado", "criados"), p(s.atualizados, "atualizado", "atualizados"), p(s.ignorados, "ignorado", "ignorados"),
    p(s.erros.length, "erro", "erros")].join(" · ");
}

/** Decodifica o arquivo: UTF-8; se aparecer o caractere de substituição (planilha salva em ANSI), tenta Windows-1252. */
export function decodificarArquivo(bytes, Decodificador = globalThis.TextDecoder) {
  const utf = new Decodificador("utf-8").decode(bytes);
  if (!utf.includes("�")) return { texto: utf, codificacao: "utf-8" };
  // plano 1000b · RB-248: um «�» solto num arquivo UTF-8 de verdade (cheio de acentos que decodificaram bem) não troca tudo para 1252.
  // Arquivo ANSI quase nunca forma UTF-8 válido: os acentos viram «�» e sobram poucos caracteres não-ASCII bons.
  let ruins = 0, bons = 0;
  for (const ch of utf) { if (ch === "�") ruins++; else if (ch.charCodeAt(0) > 127) bons++; }
  if (bons > 0 && ruins / (ruins + bons) <= 0.1) return { texto: utf, codificacao: "utf-8", substituidos: ruins };
  try { return { texto: new Decodificador("windows-1252").decode(bytes), codificacao: "windows-1252" }; }
  catch { return { texto: utf, codificacao: "utf-8" }; }
}

/* ------------------------------------------------------------ exportar contatos (P1) */
/** "1990-12-31" → "31/12/1990"; ISO com hora → data no fuso de SP; vazio → "" */
export function dataCurtaCSV(v) {
  if (!v) return "";
  const s = String(v);
  if (/^\d{4}-\d{2}-\d{2}$/.test(s)) return `${s.slice(8, 10)}/${s.slice(5, 7)}/${s.slice(0, 4)}`;
  const d = new Date(s);
  if (Number.isNaN(d.getTime())) return "";
  return new Intl.DateTimeFormat("pt-BR", { timeZone: "America/Sao_Paulo", day: "2-digit", month: "2-digit", year: "numeric" }).format(d);
}

/**
 * Itens de nx_contatos_exportar → {cabecalho, linhas} para o gerarCSV (; com BOM).
 * Colunas com os mesmos nomes que a importação reconhece (dá para reimportar o arquivo).
 */
export function linhasExportacao(itens, campos = []) {
  const extras = (campos || []).filter(c => c && c.entidade === "contato" && c.ativo !== false)
    .sort((a, b) => (a.ordem || 0) - (b.ordem || 0));
  const cabecalho = ["Nome", "Telefone", "E-mail", "Empresa", "Cidade", "UF", "Nascimento", "CPF/CNPJ", "Origem", "Etiquetas",
    "Responsável", "Aceita marketing", "Cadastrado em", "Observação", ...extras.map(c => c.rotulo)];
  const valorCampo = (c, v) => {
    if (v === null || v === undefined || v === "") return "";
    if (Array.isArray(v)) return v.join("; ");
    if (typeof v === "boolean") return v ? "Sim" : "Não";
    if (c.tipo === "data") return dataCurtaCSV(v);
    if (c.tipo === "telefone") return formatarTel(v);
    if (c.tipo === "moeda" || c.tipo === "numero") return String(v).replace(".", ",");
    return String(v);
  };
  const linhas = (itens || []).map(k => [
    k.nome || "", k.telefone ? formatarTel(k.telefone) : "", k.email || "", k.empresa_nome || "", k.cidade || "", k.uf || "",
    dataCurtaCSV(k.nascimento), k.documento || "", ROTULO_ORIGEM[k.origem] || k.origem || "",
    (k.etiquetas_nomes || []).join("; "), k.dono_nome || "",
    k.optin_marketing === true ? "Sim" : k.optin_marketing === false ? "Não" : "", dataCurtaCSV(k.criado_em), k.obs || "",
    ...extras.map(c => valorCampo(c, (k.campos || {})[c.chave])),
  ]);
  return { cabecalho, linhas };
}

/* ------------------------------------------------------------ listas do celular (M28) */
/** `tel:+55…` a partir do telefone do cadastro (só dígitos): 10–11 dígitos = DDD + número, ganham o 55; 12–13 já trazem o país; fora disso não dá para ligar → null. */
export function hrefTel(telefone) {
  let d = String(telefone == null ? "" : telefone).replace(/\D/g, "");
  // plano 1000b · RB-069: 10–11 dígitos só ganham 55 quando parecem brasileiros (+1 212 555 1234 é guardado 12125551234 e não vira +5512125551234);
  // número de fora guardado com o DDI vai até 15 dígitos (E.164)
  if (d.length < 10 || d.length > 15) return null;
  if (d.length <= 11 && pareceBrasileiro(d)) d = `55${d}`;
  return `tel:+${d}`;
}

/**
 * Ações de uma linha de contato no celular. Uma lista só: `menu` (o ⋮), `botoes` (sempre visíveis) e os dois lados do deslizar, que apontam para
 * ações que JÁ existem em `menu`/`botoes` — assim o gesto e o botão chamam a mesma função e produzem o mesmo resultado.
 * Deslizar para a direita = nova tarefa; para a esquerda = nova oportunidade (só quem pode escrever).
 */
export function acoesDoContato({ pode = false, conversas = false, telefone = false } = {}) {
  const botoes = [telefone && "ligar", conversas && "conversa"].filter(Boolean);
  const menu = ["abrir", ...(pode ? ["tarefa", "negocio"] : [])];
  return { botoes, menu, direita: pode ? "tarefa" : null, esquerda: pode ? "negocio" : null };
}

/**
 * Ações de uma linha de tarefa no celular. `botoes` = o que está sempre à mostra (o círculo de concluir); `menu` = o ⋮.
 * Direita = concluir (ou reabrir, se já está concluída); esquerda = adiar para amanhã. Excluir fica só no ⋮ (com Desfazer).
 */
export function acoesDaTarefa({ pode = false, concluida = false } = {}) {
  if (!pode) return { botoes: [], menu: [], direita: null, esquerda: null };
  return { botoes: ["concluir"], menu: concluida ? ["editar", "excluir"] : ["editar", "adiar", "excluir"], direita: "concluir", esquerda: concluida ? null : "adiar" };
}

/**
 * Novo vencimento de «Adiar para amanhã»: amanhã (dia de São Paulo, UTC−3 sem horário de verão) na MESMA hora de antes — às 09:00 se a tarefa não tinha data.
 * Se ela já vencia depois desse instante (amanhã mais tarde, ou dias à frente), só empurra um dia. → ISO UTC.
 */
export function adiarParaAmanha(venceEm, agora = new Date()) {
  const DIA = 86400000, SP = 3 * 3600000;
  const ymd = ms => new Date(ms - SP).toISOString().slice(0, 10);
  const atual = venceEm ? Date.parse(venceEm) : NaN;
  const hhmm = Number.isFinite(atual) ? new Date(atual - SP).toISOString().slice(11, 16) : "09:00";
  let alvo = Date.parse(`${ymd(new Date(agora).getTime() + DIA)}T${hhmm}:00-03:00`);
  if (Number.isFinite(atual) && atual + DIA > alvo) alvo = atual + DIA;
  return new Date(alvo).toISOString();
}

/* ------------------------------------------------------------ plano 50 (04/10/2026) — Kanban, gaveta, tarefas, importação, empresas */
/** Padrão quando a etapa não tem prazo (sla_horas) na base: âmbar a partir de 3 dias, vermelho a partir de 7. */
export const PRAZO_ETAPA_PADRAO_H = Object.freeze({ aten: 72, ruim: 168 });

/**
 * Barra de «tempo na etapa» do cartão: quanto do prazo já passou e a cor.
 * Com `slaHoras` (prazo da etapa na base do CRM): verde até metade, âmbar até o prazo, vermelho depois. Sem prazo: 3/7 dias (PRAZO_ETAPA_PADRAO_H).
 * → {horas, pct (0–1 do limite vermelho), nivel: "ok"|"aten"|"ruim", limiteHoras, padrao, texto} ou null sem data.
 */
export function faixaTempoEtapa(estagioEm, slaHoras, agora = new Date()) {
  const t = estagioEm ? new Date(estagioEm).getTime() : NaN;
  const a = new Date(agora).getTime();
  if (!Number.isFinite(t) || !Number.isFinite(a)) return null;
  const horas = Math.max(0, (a - t) / 3600000);
  const sla = Number(slaHoras);
  const comSla = Number.isFinite(sla) && sla > 0;
  const limiteAten = comSla ? sla / 2 : PRAZO_ETAPA_PADRAO_H.aten;
  const limiteRuim = comSla ? sla : PRAZO_ETAPA_PADRAO_H.ruim;
  const nivel = horas >= limiteRuim ? "ruim" : horas >= limiteAten ? "aten" : "ok";
  const pct = Math.max(0.04, Math.min(1, horas / limiteRuim));   // um fio sempre aparece (cartão de hoje)
  const dias = Math.floor(horas / 24);
  const prazo = comSla ? textoPrazoSla(sla) : "7 dias";      // plano 1000b · RB-080: «3 dias», não «72 h»
  const texto = nivel === "ruim" ? `Passou do prazo da etapa (${prazo})`
    : nivel === "aten" ? `Perto do prazo da etapa (${prazo})`
      : dias <= 0 ? "Entrou hoje na etapa" : `Dentro do prazo da etapa (${prazo})`;
  return { horas: Math.round(horas * 10) / 10, pct: Math.round(pct * 1000) / 1000, nivel, limiteHoras: limiteRuim, padrao: !comSla, texto };
}

/**
 * Participação de cada etapa nos cartões do funil (mini-barra do cabeçalho da coluna): fração 0–1 do total de cartões ABERTOS; ganho/perdido
 * entram com a fração sobre todos os cartões do quadro. → Map estagio_id → {n, fracao, pct (inteiro)}.
 */
export function participacaoEtapas(colunas, estagios) {
  const porId = new Map((estagios || []).map(e => [e.id, e]));
  const nDe = c => Number(c.total) || 0;
  const abertos = (colunas || []).filter(c => (porId.get(c.estagio_id) || {}).tipo === "aberto").reduce((s, c) => s + nDe(c), 0);
  const todos = (colunas || []).reduce((s, c) => s + nDe(c), 0);
  const out = new Map();
  for (const c of colunas || []) {
    const e = porId.get(c.estagio_id);
    if (!e) continue;
    const base = e.tipo === "aberto" ? abertos : todos;
    const fracao = base > 0 ? nDe(c) / base : 0;
    out.set(c.estagio_id, { n: nDe(c), fracao: Math.round(fracao * 1000) / 1000, pct: Math.round(fracao * 100) });
  }
  return out;
}

/**
 * Resumo do funil acima do quadro, só com o que o quadro já carregou (contagens e somas por etapa, nada de RPC nova).
 * Para cada etapa ABERTA, em ordem, e a de ganho: `chegaram` = cartões que estão nela OU numa etapa mais à frente (ganho conta; perdido não,
 * porque não dá para saber de que etapa saiu). `conversao` = chegaram da próxima ÷ chegaram desta (fração) — é a estimativa «de quem passou
 * por aqui, quantos seguiram». `pctTopo` = chegaram ÷ chegaram da 1ª etapa (largura da barra).
 * Etapa com marco «faltou» NÃO é degrau (é um desvio que sai de «Agendada»): fica fora da sequência — ninguém «chega» a ela por estar à frente,
 * e quem está nela não conta como tendo chegado às seguintes. Vem à parte em `linhas.fora` só com a contagem: [{id, nome, cor, n}].
 * → [{id, nome, cor, tipo, n, valor, chegaram, pctTopo, conversao}] (vazio sem etapas abertas).
 */
export function resumoFunil(colunas, estagios) {
  const cols = new Map((colunas || []).map(c => [c.estagio_id, c]));
  const ordenados = (estagios || []).slice().sort((a, b) => (Number(a.ordem) || 0) - (Number(b.ordem) || 0));
  const lateral = e => e.marco === "faltou";
  const abertas = ordenados.filter(e => e.tipo === "aberto" && !lateral(e));
  if (!abertas.length) return [];
  const ganho = ordenados.find(e => e.tipo === "ganho") || null;
  const seq = ganho ? [...abertas, ganho] : abertas;
  const nDe = e => Number((cols.get(e.id) || {}).total) || 0;
  const valorDe = e => Number((cols.get(e.id) || {})[e.tipo === "ganho" ? "soma_valor" : "soma_previsto"]) || 0;
  const linhas = seq.map(e => ({ id: e.id, nome: e.nome, cor: e.cor || null, tipo: e.tipo, n: nDe(e), valor: valorDe(e), chegaram: 0, pctTopo: 0, conversao: null }));
  let acumulado = 0;
  for (let i = linhas.length - 1; i >= 0; i--) { acumulado += linhas[i].n; linhas[i].chegaram = acumulado; }
  const topo = linhas[0].chegaram;
  for (let i = 0; i < linhas.length; i++) {
    linhas[i].pctTopo = topo > 0 ? Math.round(linhas[i].chegaram / topo * 1000) / 1000 : 0;
    const prox = linhas[i + 1];
    linhas[i].conversao = prox && linhas[i].chegaram > 0 ? Math.round(prox.chegaram / linhas[i].chegaram * 1000) / 1000 : null;
  }
  linhas.fora = ordenados.filter(e => e.tipo === "aberto" && lateral(e)).map(e => ({ id: e.id, nome: e.nome, cor: e.cor || null, n: nDe(e) }));
  return linhas;
}

/** plano 1000b · RB-125: «qua», «sáb» para um dia civil (AAAA-MM-DD); inválido → "". */
export function diaSemanaCurto(dia) {
  const [y, m, d] = String(dia || "").split("-").map(Number);
  if (!y || !m || !d) return "";
  return ["dom", "seg", "ter", "qua", "qui", "sex", "sáb"][new Date(Date.UTC(y, m - 1, d, 12)).getUTCDay()];
}
/** plano 1000b · RB-121: o atalho de salvar dito na tela — «⌘+Enter» no Mac/iPhone/iPad, «Ctrl+Enter» nos outros. */
export function atalhoSalvar(plataforma) {
  return `${teclaModificadora(plataforma)}+Enter`;
}
/** plano 1000b · RB-014: a tecla do «com clique abre numa nova aba» — «⌘» no Mac/iPhone/iPad, «Ctrl» nos outros. */
export function teclaModificadora(plataforma) {
  return /mac|iphone|ipad|ipod|ios/i.test(String(plataforma || "")) ? "⌘" : "Ctrl";
}
/** plano 1000b · RB-014: a plataforma do aparelho (navigator.userAgentData.platform ou navigator.platform); "" fora do navegador. */
export function plataformaAparelho() {
  try { return (typeof navigator !== "undefined" && navigator && ((navigator.userAgentData && navigator.userAgentData.platform) || navigator.platform)) || ""; } catch { return ""; }
}

/** «Hoje» / «Ontem» / «Amanhã» / «Seg, 06/10» para um dia civil (AAAA-MM-DD) comparado com `hoje`. */
export function rotuloDia(dia, hoje) {
  if (!dia) return "Sem data";
  if (dia === hoje) return "Hoje";
  const d = Date.parse(`${dia}T12:00:00Z`), h = Date.parse(`${hoje}T12:00:00Z`);
  if (Number.isFinite(d) && Number.isFinite(h)) {
    const delta = Math.round((d - h) / 86400000);
    if (delta === -1) return "Ontem";
    if (delta === 1) return "Amanhã";
  }
  const [y, m, dd] = String(dia).split("-").map(Number);
  if (!y || !m || !dd) return String(dia);
  const sem = ["Dom", "Seg", "Ter", "Qua", "Qui", "Sex", "Sáb"][new Date(Date.UTC(y, m - 1, dd, 12)).getUTCDay()];
  return `${sem}, ${String(dd).padStart(2, "0")}/${String(m).padStart(2, "0")}${y !== Number(String(hoje).slice(0, 4)) ? `/${y}` : ""}`;
}

/**
 * Agrupa itens por dia civil (tarefas por vencimento, linha do tempo por data). `instanteDe(item)` → ISO; `diaDe(iso)` → "AAAA-MM-DD"
 * (a tela passa ui.hojeSP para o dia de São Paulo). Itens sem data vão para o fim como «Sem data». `ordem` "asc" (tarefas) ou "desc" (histórico).
 * → [{dia, rotulo, itens}]
 */
/**
 * plano 1000 (CR-244): a visão «Semana» das tarefas — 7 colunas a partir de hoje (as mesmas regras do agruparPorDia), mais quantas ficam
 * depois da semana e quantas não têm prazo. → {colunas: [{dia, rotulo, itens}], depois, semPrazo, antes}
 */
export function colunasDaSemana(itens, { instanteDe, diaDe = iso => String(iso || "").slice(0, 10), hoje, dias = 7 } = {}) {
  // plano 1000b · RB-078: «hoje» vazio/inválido derrubava a visão Semana (Date.UTC(NaN).toISOString() lança RangeError)
  if (!/^\d{4}-\d{2}-\d{2}$/.test(String(hoje || "")) || Number.isNaN(Date.parse(`${hoje}T00:00:00Z`))) return { colunas: [], depois: 0, antes: 0, semPrazo: 0 };
  const [y, m, d] = String(hoje || "").split("-").map(Number);
  const lista = Array.from({ length: dias }, (_, i) => new Date(Date.UTC(y, m - 1, d + i)).toISOString().slice(0, 10));
  const grupos = new Map(agruparPorDia(itens, { instanteDe, diaDe, hoje }).map(g => [g.dia, g.itens]));
  const fim = lista[lista.length - 1];
  let depois = 0, antes = 0;
  for (const [dia, its] of grupos) { if (dia && dia > fim) depois += its.length; else if (dia && dia < lista[0]) antes += its.length; }
  return { colunas: lista.map(dia => ({ dia, rotulo: rotuloDia(dia, hoje), itens: grupos.get(dia) || [] })), depois, antes, semPrazo: (grupos.get("") || []).length };
}
export function agruparPorDia(itens, { instanteDe, diaDe = iso => String(iso || "").slice(0, 10), hoje, ordem = "asc", semData = "Sem data" } = {}) {
  const grupos = new Map();
  for (const it of itens || []) {
    const iso = instanteDe ? instanteDe(it) : null;
    const dia = iso ? diaDe(iso) : "";
    if (!grupos.has(dia)) grupos.set(dia, []);
    grupos.get(dia).push(it);
  }
  const dias = [...grupos.keys()].filter(Boolean).sort();
  if (ordem === "desc") dias.reverse();
  const out = dias.map(dia => ({ dia, rotulo: rotuloDia(dia, hoje), itens: grupos.get(dia) }));
  if (grupos.has("")) out.push({ dia: "", rotulo: semData, itens: grupos.get("") });     // plano 1000 (CR-138): as tarefas dizem «Sem prazo»
  return out;
}

/** Densidade da lista de contatos guardada no aparelho: só «compacta» ou «confortavel» (qualquer outra coisa vira o padrão confortável). */
export function densidadeLista(valor) { return valor === "compacta" ? "compacta" : "confortavel"; }

/**
 * Cabeçalho da prévia da importação (passo das colunas): para cada coluna da planilha, o destino escolhido e o rótulo dele.
 * → [{i, coluna, destino (valor ou null), rotulo (do destino ou «Ignorada»)}]
 */
export function cabecalhoPrevia(cabecalho, mapa, destinos = []) {
  const rot = new Map((destinos || []).map(d => [d.valor, String(d.rotulo || "").replace(/^Campo: /, "")]));
  return (cabecalho || []).map((coluna, i) => {
    const destino = (mapa || [])[i] || null;
    return { i, coluna: coluna || `Coluna ${i + 1}`, destino, rotulo: destino ? (rot.get(destino) || destino) : "Ignorada" };
  });
}

/** Contadores da página da empresa a partir do que nx_empresa_ver devolve: contatos, negócios abertos, valor em aberto e ganhos. */
export function resumoEmpresa(d) {
  const negs = (d && d.negocios) || [];
  const abertos = negs.filter(n => !n.status || n.status === "aberto");
  const ganhos = negs.filter(n => n.status === "ganho");
  const soma = (lista, chave) => Math.round(lista.reduce((s, n) => s + (Number(n[chave]) || 0), 0) * 100) / 100;
  return { contatos: ((d && d.contatos) || []).length, abertos: abertos.length, valorAberto: soma(abertos, "valor_previsto"), ganhos: ganhos.length, valorGanho: soma(ganhos, "valor") };
}

/** Porcentagem inteira legível («62%») de uma fração; null/NaN → «—». */
export function pctInteiro(fracao) {
  if (fracao === null || fracao === undefined || fracao === "") return "—";
  const n = Number(fracao);
  return Number.isFinite(n) ? `${Math.round(n * 100)}%` : "—";
}

/* ------------------------------------------------------------ plano 1000 · importação */
/**
 * CR-118: linhas da própria planilha que são a MESMA pessoa (telefone com/sem 55 e 9, ou e-mail) — a 2ª vira atualização da 1ª sem aviso.
 * linhas = montarLinhas(...); numeros[i] = número da linha na planilha (padrão i + 2). → [{tipo: 'telefone'|'email', valor, linhas: [n, …]}]
 */
export function duplicadosPlanilha(linhas, numeros = null) {
  const grupos = new Map();
  (linhas || []).forEach((l, i) => {
    const n = (numeros && numeros[i]) || i + 2;
    const tel = l && l.telefone ? normalizarTelefone(l.telefone) : null;
    const chaves = [];
    if (tel) chaves.push(["telefone", telChave(tel), l.telefone]);
    if (l && l.email && /@/.test(l.email)) chaves.push(["email", String(l.email).trim().toLowerCase(), String(l.email).trim()]);
    for (const [tipo, k, valor] of chaves) {
      const id = `${tipo}:${k}`;
      if (!grupos.has(id)) grupos.set(id, { tipo, valor, linhas: [] });
      grupos.get(id).linhas.push(n);
    }
  });
  return [...grupos.values()].filter(g => g.linhas.length > 1);
}

/** CR-123: etapas da planilha que não batem com uma etapa ABERTA do funil (o servidor usaria a 1ª) e etiquetas que ainda não existem (serão criadas).
 *  plano 1000b · RB-250: `etiquetasComVirgula` = células com vírgula e sem «;»/«|» («VIP, Retorno» viraria UMA etiqueta) — a prévia avisa. */
export function conferirPlanilha(linhas, { estagios = [], etiquetas = [] } = {}) {
  const norm = s => semAcento(String(s || "")).trim().replace(/\s+/g, " ");
  const abertas = new Set((estagios || []).filter(e => e.tipo === "aberto").map(e => norm(e.nome)));
  const existentes = new Set((etiquetas || []).map(e => norm(e.nome)));
  const etapas = new Map(), novas = new Map(), comVirgula = [];
  for (const l of linhas || []) {
    if (l && l.etiquetas && /,/.test(String(l.etiquetas)) && !/[;|]/.test(String(l.etiquetas)) && comVirgula.length < 5) comVirgula.push(String(l.etiquetas).trim().slice(0, 60));
    if (l && l.estagio && !abertas.has(norm(l.estagio))) etapas.set(norm(l.estagio), String(l.estagio).trim().slice(0, 40));
    if (l && l.etiquetas) for (const t of String(l.etiquetas).split(/\s*[;|]\s*/)) {
      const nome = t.trim().slice(0, 40);
      if (nome && !existentes.has(norm(nome))) novas.set(norm(nome), nome);
    }
  }
  return { etapasDesconhecidas: [...etapas.values()], etiquetasNovas: [...novas.values()], etiquetasComVirgula: comVirgula };
}

/** plano 1000 (CR-052): a data (AAAA-MM-DD, dia inteiro) ou data e hora (datetime-local) já passou? Vazio/inválido → false. Só avisa, não bloqueia. */
export function dataPassou(v, agora = Date.now()) {
  const s = String(v ?? "").trim();
  if (!s) return false;
  if (/^\d{4}-\d{2}-\d{2}$/.test(s)) {
    // plano 1000b · RB-079: «hoje» no calendário de São Paulo (o resto do CRM), não no fuso do aparelho
    const d = new Date(agora);
    if (Number.isNaN(d.getTime())) return false;
    return s < fmtDiaSP.format(d);
  }
  const t = Date.parse(s);
  return Number.isFinite(t) && t < agora;
}
export const TEXTO_DATA_PASSOU = "Essa data já passou.";

/**
 * plano 1000 (CR-103): dados do titular (direito de acesso da LGPD) a partir do que nx_contato_ver devolve — só desta pessoa.
 * → {titular, gerado_em, cadastro, consentimento, empresa, negocios, tarefas, notas, atendimentos, historico} | null
 */
export function dadosTitular(d, { geradoEm = null, vocab = null, brl = v => `R$ ${v}`, motivos = {} } = {}) {
  const c = d && d.contato;
  if (!c || c.id == null) return null;
  const so = (o, chaves) => Object.fromEntries(chaves.filter(k => o && o[k] !== undefined && o[k] !== null && o[k] !== "").map(k => [k, o[k]]));
  const lista = x => (Array.isArray(x) ? x : []);
  return {
    titular: c.nome || c.telefone || c.email || `Cadastro ${c.id}`,
    gerado_em: geradoEm,
    cadastro: so(c, ["id", "nome", "telefone", "email", "documento", "nascimento", "cidade", "uf", "origem", "plataforma", "etiquetas", "campos", "obs", "criado_em", "ultimo_contato_em"]),
    consentimento: { optin_marketing: c.optin_marketing ?? null, optin_em: c.optin_em ?? null, optin_origem: c.optin_origem ?? null },
    empresa: d.empresa ? so(d.empresa, ["id", "nome", "cidade", "uf"]) : (c.empresa ? so(c.empresa, ["id", "nome"]) : null),
    negocios: lista(d.negocios).map(n => so(n, ["id", "titulo", "status", "valor", "valor_previsto", "servico", "consulta_em", "criado_em", "fechado_em"])),
    tarefas: lista(d.tarefas).map(t => so(t, ["id", "titulo", "tipo", "vence_em", "concluida_em"])),
    notas: lista(d.notas).map(n => so(n, ["id", "texto", "criado_em"])),
    atendimentos: lista(d.conversas).map(x => so(x, ["id", "protocolo", "status", "aberta_em"])),
    // plano 1000b · RB-111: o histórico vai como frase — os `dados` crus levavam ids de contas da equipe (para, de) e outros dados internos
    historico: lista(d.tempo).map(t => so({ tipo: t.tipo, quando: t.em, texto: textoTempo(t, { vocab, brl, motivos }) }, ["tipo", "quando", "texto"])),
  };
}

/**
 * plano 1000b · RB-263: a versão LEGÍVEL dos dados do titular (vai num .txt junto do JSON) — seções com título, um item por linha, sem chaves técnicas.
 * `dados` = dadosTitular(...); `fmt` = {data(iso) → texto, brl(v) → texto} (o ui da tela). → texto (linhas com \n).
 */
export function textoTitular(dados, { data = v => String(v ?? ""), brl = v => `R$ ${v}`, vocab = null } = {}) {
  if (!dados || !dados.cadastro) return "";
  const c = dados.cadastro, sai = [];
  const sec = (titulo, linhas) => { sai.push("", titulo.toUpperCase(), "-".repeat(Math.min(40, titulo.length))); if (!linhas.length) sai.push("(nada registrado)"); else sai.push(...linhas); };
  const par = (rot, v) => (v === undefined || v === null || v === "" ? null : `${rot}: ${v}`);
  sai.push(`Dados de ${dados.titular}`, dados.gerado_em ? `Gerado em ${data(dados.gerado_em)}` : null);
  sec("Cadastro", [par("Nome", c.nome), par("Telefone", c.telefone), par("E-mail", c.email), par("Documento", c.documento), par("Nascimento", c.nascimento),
    par("Cidade", [c.cidade, c.uf].filter(Boolean).join("/")), par("Origem", ROTULO_ORIGEM[c.origem] || c.origem), par("Observação", c.obs),
    par("Cadastrado em", c.criado_em ? data(c.criado_em) : null), par("Último contato", c.ultimo_contato_em ? data(c.ultimo_contato_em) : null),
    ...Object.entries(c.campos || {}).map(([k, v]) => par(k, Array.isArray(v) ? v.join(", ") : v))].filter(Boolean));
  const cs = dados.consentimento || {};
  sec("Consentimento de marketing", [cs.optin_marketing === false ? "Não quer receber marketing" : cs.optin_marketing === true ? "Aceitou receber marketing" : "Sem registro",
    par("Registrado em", cs.optin_em ? data(cs.optin_em) : null), par("Como", cs.optin_origem)].filter(Boolean));
  if (dados.empresa) sec("Empresa", [par("Nome", dados.empresa.nome), par("Cidade", [dados.empresa.cidade, dados.empresa.uf].filter(Boolean).join("/"))].filter(Boolean));
  sec(vocab && vocab.negocios ? vocab.negocios : "Negócios", (dados.negocios || []).map(n => `- ${n.titulo || n.servico || `#${n.id}`}${n.status ? ` (${n.status})` : ""}${(n.valor ?? n.valor_previsto) != null ? ` · ${brl(n.valor ?? n.valor_previsto)}` : ""}${n.criado_em ? ` · ${data(n.criado_em)}` : ""}`));
  sec("Tarefas", (dados.tarefas || []).map(t => `- ${t.titulo || "Tarefa"}${t.vence_em ? ` · prazo ${data(t.vence_em)}` : ""}${t.concluida_em ? " · concluída" : ""}`));
  sec("Notas", (dados.notas || []).map(n => `- ${n.criado_em ? `${data(n.criado_em)}: ` : ""}${n.texto || ""}`));
  sec("Atendimentos", (dados.atendimentos || []).map(a => `- ${a.protocolo ? `Protocolo ${a.protocolo}` : `#${a.id}`}${a.status ? ` (${a.status})` : ""}${a.aberta_em ? ` · ${data(a.aberta_em)}` : ""}`));
  sec("Histórico", (dados.historico || []).filter(x => x.texto).map(x => `- ${x.quando ? `${data(x.quando)}: ` : ""}${x.texto}`));      // plano 1000b · RB-111
  return sai.filter(x => x !== null).join("\n") + "\n";
}

/**
 * plano 1000 (CR-144): atalhos de prazo da tarefa a partir do dia de HOJE em São Paulo (AAAA-MM-DD) → [{rotulo, valor (datetime-local)}].
 * «Hoje 18h · Amanhã 9h · Em 3 dias (9h) · Próx. segunda (9h)».
 */
export function atalhosPrazo(hojeIso) {
  const [a, m, d] = String(hojeIso || "").slice(0, 10).split("-").map(Number);
  if (!a || !m || !d) return [];
  const dia = n => { const x = new Date(Date.UTC(a, m - 1, d + n)); return x.toISOString().slice(0, 10); };
  const dow = new Date(Date.UTC(a, m - 1, d)).getUTCDay();            // 0 = domingo
  const ateSegunda = ((8 - dow) % 7) || 7;
  return [
    { rotulo: "Hoje 18h", valor: `${dia(0)}T18:00` },
    { rotulo: "Amanhã 9h", valor: `${dia(1)}T09:00` },
    { rotulo: "Em 3 dias", valor: `${dia(3)}T09:00` },
    { rotulo: "Próx. segunda", valor: `${dia(ateSegunda)}T09:00` },
  ];
}

/* ------------------------------------------------------------ plano 1000 (13/10/2026) — lote crm-2 */
/** CR-111: só os dígitos de um CPF/CNPJ. */
const soDigitos = v => String(v ?? "").replace(/\D/g, "");
/** CR-111: dígitos verificadores de CPF (11) e CNPJ (14). → "cpf" | "cnpj" | null (tamanho errado, sequência repetida ou dígito que não confere). */
/**
 * plano 1000b · RB-093: CNPJ alfanumérico (Receita, a partir de jul/2026) — 12 posições [0-9A-Z] + 2 dígitos verificadores. Devolve os 14 caracteres em
 * maiúsculas quando o texto (sem . / - e espaços) tem esse formato COM alguma letra; senão null (o CNPJ só de números segue pelo caminho antigo).
 */
function cnpjAlfa(v) {
  const a = String(v ?? "").toUpperCase().replace(/[./\-\s]/g, "");
  return /^[0-9A-Z]{12}\d{2}$/.test(a) && /[A-Z]/.test(a) ? a : null;
}
/** DV do CNPJ (números ou alfanumérico): cada caractere vale o código ASCII − 48 («A» = 17), pesos de 2 a 9 da direita para a esquerda. */
function dvCnpj(d, n) {
  const pesos = n === 12 ? [5, 4, 3, 2, 9, 8, 7, 6, 5, 4, 3, 2] : [6, 5, 4, 3, 2, 9, 8, 7, 6, 5, 4, 3, 2];
  let s = 0;
  for (let i = 0; i < n; i++) s += (d.charCodeAt(i) - 48) * pesos[i];
  const r = s % 11;
  return r < 2 ? 0 : 11 - r;
}
export function docValido(v) {
  const alfa = cnpjAlfa(v);
  if (alfa) return dvCnpj(alfa, 12) === Number(alfa[12]) && dvCnpj(alfa, 13) === Number(alfa[13]) ? "cnpj" : null;
  const d = soDigitos(v);
  if (d.length === 11) {
    if (/^(\d)\1{10}$/.test(d)) return null;
    const dv = n => { let s = 0; for (let i = 0; i < n; i++) s += Number(d[i]) * (n + 1 - i); const r = (s * 10) % 11; return r === 10 ? 0 : r; };
    return dv(9) === Number(d[9]) && dv(10) === Number(d[10]) ? "cpf" : null;
  }
  if (d.length === 14) {
    if (/^(\d)\1{13}$/.test(d)) return null;
    return dvCnpj(d, 12) === Number(d[12]) && dvCnpj(d, 13) === Number(d[13]) ? "cnpj" : null;
  }
  return null;
}
/** CR-111: máscara de CPF (000.000.000-00) ou CNPJ (00.000.000/0000-00); outro tamanho (RG, documento de fora) volta como foi digitado. */
export function formatarDoc(v) {
  const t = String(v ?? "").trim(), d = soDigitos(t);
  const alfa = cnpjAlfa(t);       // plano 1000b · RB-093: o alfanumérico ganha a mesma máscara, com as letras
  if (alfa) return `${alfa.slice(0, 2)}.${alfa.slice(2, 5)}.${alfa.slice(5, 8)}/${alfa.slice(8, 12)}-${alfa.slice(12)}`;
  if (d.length === 11 && /^[\d.\-\s]+$/.test(t)) return `${d.slice(0, 3)}.${d.slice(3, 6)}.${d.slice(6, 9)}-${d.slice(9)}`;
  if (d.length === 14 && /^[\d./\-\s]+$/.test(t)) return `${d.slice(0, 2)}.${d.slice(2, 5)}.${d.slice(5, 8)}/${d.slice(8, 12)}-${d.slice(12)}`;
  return t;
}
/** CR-111: aviso (não bloqueia) para o documento digitado: dígito que não confere em CPF/CNPJ. null = ok ou não é CPF/CNPJ. */
export function avisoDoc(v) {
  if (cnpjAlfa(v)) return docValido(v) ? null : "CNPJ com dígito verificador que não confere. Confira o número.";   // plano 1000b · RB-093
  const d = soDigitos(v);
  if (d.length !== 11 && d.length !== 14) return null;
  return docValido(d) ? null : `${d.length === 11 ? "CPF" : "CNPJ"} com dígito verificador que não confere. Confira o número.`;
}
/** CR-112: site digitado sem protocolo («www.empresa.com») vira link de verdade (https://). Vazio → null; só http(s). */
export function normalizarSite(v) {
  const t = String(v ?? "").trim();
  if (!t) return null;
  if (/^https?:\/\//i.test(t)) return t;
  // javascript:, mailto: … não viram link. plano 1000b · RB-077: «site.com.br:8080» (ponto ANTES dos dois-pontos) é host com porta, não esquema
  if (/^[a-z][a-z0-9+-]*:/i.test(t)) return null;
  return `https://${t.replace(/^\/+/, "")}`;
}
/** plano 1000b · RB-105: o endereço só vira link quando parece um site de verdade (host com ponto, sem espaço) — «não tenho» fica texto. */
export function linkDeSite(v) {
  const u = normalizarSite(v);
  return u && /^https?:\/\/[^\s/?#]+\.[^\s/?#]{2,}([/?#]\S*)?$/i.test(u) ? u : null;
}
/**
 * CR-150: adiar a tarefa — «hora» (+1 h a partir de agora, ou do vencimento se ainda vai vencer), «amanha» (adiarParaAmanha) ou «semana»
 * (próxima segunda às 9h de São Paulo). → ISO UTC.
 */
export function adiarTarefa(venceEm, modo, agora = new Date()) {
  const ag = new Date(agora).getTime();
  if (modo === "hora") { const v = venceEm ? Date.parse(venceEm) : NaN; return new Date((Number.isFinite(v) && v > ag ? v : ag) + 3600000).toISOString(); }
  if (modo === "semana") {
    const hojeSP = new Date(ag - 3 * 3600000).toISOString().slice(0, 10);
    const seg = atalhosPrazo(hojeSP)[3];
    return new Date(Date.parse(`${seg.valor}:00-03:00`)).toISOString();
  }
  return adiarParaAmanha(venceEm, agora);
}
/**
 * plano 1000 (CR-298): prazo da tarefa «retomar o contato» depois de uma perda — daqui a `dias` dias, às 9h de São Paulo (ISO UTC).
 * retomarEm(60, new Date("2026-10-13T15:00:00Z")) → "2026-12-12T12:00:00.000Z"; dias fora de 1–365 → null.
 */
export function retomarEm(dias, agora = new Date()) {
  const n = Math.round(Number(dias));
  if (!(n >= 1 && n <= 365)) return null;
  const hojeSP = new Date(new Date(agora).getTime() - 3 * 3600000).toISOString().slice(0, 10);
  const [a, m, d] = hojeSP.split("-").map(Number);
  const alvo = new Date(Date.UTC(a, m - 1, d + n)).toISOString().slice(0, 10);
  return new Date(Date.parse(`${alvo}T09:00:00-03:00`)).toISOString();
}
/** CR-019: legenda da distribuição — as etapas com cartões e, à parte, as vazias (que viram «+3 vazias»). */
export function partesDistribuicao(colunas, estagios) {
  const n = id => { const c = (colunas || []).find(x => x.estagio_id === id); return c ? Number(c.total) || 0 : 0; };
  const todas = (estagios || []).map(e => ({ e, n: n(e.id) }));
  return { cheias: todas.filter(x => x.n > 0), vazias: todas.filter(x => !x.n) };
}
/** CR-122: assinatura do cabeçalho da planilha (as colunas, sem acento e na ordem) — a mesma planilha da semana passada reaproveita o mapa. */
export function assinaturaCabecalho(cab) {
  return (cab || []).map(c => semAcento(c).replace(/\s+/g, " ").trim()).join("|");
}
/** CR-122: o mapa guardado só vale se tiver o mesmo número de colunas e destinos que ainda existem. → mapa | null. */
export function mapaGuardado(guardado, cabecalho, destinos) {
  if (!Array.isArray(guardado) || guardado.length !== (cabecalho || []).length) return null;
  const ok = new Set((destinos || []).map(d => d.valor));
  const m = guardado.map(x => (x && ok.has(x) ? x : null));
  return mapaValido(m) ? m : null;
}
/** CR-062: linha do atendimento («Aberto · 06/10/2026 · Ana») — sem aberta_em usa a última mensagem (ou a criação) e nunca mostra «—». */
export function linhaAtendimento(c, fmtData = x => String(x || "").slice(0, 10), { comResponsavel = false } = {}) {
  if (!c) return "";
  const st = c.status === "resolvida" ? "Resolvido" : c.status === "pendente" ? "Pendente" : "Aberto";
  const quando = c.aberta_em || c.ultima_msg_em || c.ultima_mensagem_em || c.criado_em || null;
  return [st, quando ? fmtData(quando) : null, comResponsavel ? c.atribuida_nome : null].filter(Boolean).join(" · ");
}
/**
 * CR-094: origens que dá para escolher À MÃO → [[chave, rótulo]]. «Anúncio» sem plataforma polui os números dos anúncios e «Importação» só a planilha
 * marca — as duas só aparecem quando já são a origem gravada (para não sumir da tela).
 */
export function origensManuais(atual = null) {
  return Object.entries(ROTULO_ORIGEM).filter(([v]) => (v !== "anuncio" && v !== "importacao") || v === atual);
}
/** CR-074: valores de campos de negócio que NÃO valem no funil atual (o negócio mudou de funil) → [{chave, rotulo, texto}] (só os que têm valor). */
export function camposDeOutrosFunis(campos, funilId, valores = {}) {
  const aqui = new Set(camposDe(campos, "negocio", funilId).map(c => c.chave));
  const out = [];
  for (const c of campos || []) {
    if (c.entidade !== "negocio" || aqui.has(c.chave) || out.some(x => x.chave === c.chave)) continue;
    const v = (valores || {})[c.chave];
    if (v === undefined || v === null || v === "" || (Array.isArray(v) && !v.length)) continue;
    out.push({ chave: c.chave, rotulo: c.rotulo || c.chave, texto: Array.isArray(v) ? v.join(", ") : v === true ? "Sim" : v === false ? "Não" : String(v) });
  }
  return out;
}
