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
  const cps = Array.from(t);      // plano 1500c · RX-011: conta por caractere (emoji não vira «�» cortado ao meio)
  return cps.length > max ? `${cps.slice(0, max - 1).join("").trimEnd()}…` : t;
}

/** plano 1500c · RC-082: o que o «Duplicar» leva para o negócio novo (o que se repete num orçamento parecido; nada do histórico). */
export function dadosDuplicar(n, contato = null) {
  const x = n || {};
  const titulo = String(x.titulo || "").trim();
  return {
    ...(contato && contato.id != null ? { contato_id: contato.id } : x.contato_id != null ? { contato_id: x.contato_id } : {}),
    funil_id: x.funil_id ?? null, estagio_id: null,
    titulo: titulo ? `${titulo} (cópia)`.slice(0, 120) : "", servico: x.servico || "", valor_previsto: x.valor_previsto ?? null,
    etiquetas: Array.isArray(x.etiquetas) ? x.etiquetas.slice() : [], campos: x.campos && typeof x.campos === "object" ? Object.fromEntries(Object.entries(x.campos).filter(([kk]) => kk !== "presenca" && !/^score/.test(kk))) : null,
  };
}

/** plano 1500c · RC-098: a mensagem do telefone recusado — número de outro país provável sugere o «+código». */
export function textoTelefoneInvalido(v) {
  if (telefoneSemPais(v)) return "Número de outro país? Comece com + e o código do país (ex.: +1 212 555 1234).";
  // plano 2000d · PX-067: com «+» e poucos dígitos, o problema é o número curto — não «use DDD» (que é só do Brasil)
  const dig = String(v ?? "").replace(/\D/g, "");
  if (/^\s*\+/.test(String(v ?? "")) && !dig.startsWith("55") && dig.length < 8) return "Número de outro país incompleto. Confira o código do país e o número inteiro.";
  // plano 2000d · PX-068: poucos dígitos (sem DDD) dizem o que falta
  if (!/^\s*\+/.test(String(v ?? "")) && (dig.length === 8 || dig.length === 9)) return "Falta o DDD. Escreva com o DDD, por exemplo (12) 99830-3030.";
  // plano 2000d · DR-140/190: celular sem o 9 ganha a sugestão; o resto, o exemplo do formato
  const s = sugestaoNonoDigito(v);
  return s ? `Telefone inválido. Faltou o 9? Ex.: ${s}.` : "Telefone inválido. Use DDD + número, por exemplo (12) 99830-3030.";
}

/** plano 1500c · RC-097: atalhos da previsão de fechamento a partir do dia de SP → [{id, rotulo, valor AAAA-MM-DD}] (15 dias, fim do mês, fim do próximo mês). */
export function atalhosPrevisao(hojeIso) {
  const [a, m, d] = String(hojeIso || "").slice(0, 10).split("-").map(Number);
  if (!a || !m || !d) return [];
  const iso = x => x.toISOString().slice(0, 10);
  const fimMes = iso(new Date(Date.UTC(a, m, 0)));
  return [
    { id: "15d", rotulo: "Em 15 dias", valor: iso(new Date(Date.UTC(a, m - 1, d + 15))) },
    // plano 1500c · RX-020: no último dia do mês «Fim do mês» seria hoje (a previsão já nasceria vencendo) — sai
    ...(fimMes > String(hojeIso).slice(0, 10) ? [{ id: "fim_mes", rotulo: "Fim do mês", valor: fimMes }] : []),
    { id: "fim_prox", rotulo: "Fim do próximo mês", valor: iso(new Date(Date.UTC(a, m + 1, 0))) },
  ];
}

/** plano 1500c · RC-100: o instante da mensagem mais recente entre os atendimentos (ultima_msg_em / ultima_mensagem_em) → ISO | null. */
export function ultimaMensagemEm(conversas) {
  let melhor = null, ms = -Infinity;
  for (const c of conversas || []) {
    const v = c && (c.ultima_msg_em || c.ultima_mensagem_em);
    const t = Date.parse(v);
    if (Number.isFinite(t) && t > ms) { ms = t; melhor = v; }
  }
  return melhor;
}

/** plano 1500c · RC-078: taxa de ganho do quadro (as colunas de ganho e perda trazem só os fechados do período). → {ganhos, perdidos, taxa|null} */
export function taxaGanho(colunas, estagios) {
  const tipo = new Map((estagios || []).map(e => [e.id, e.tipo]));
  let ganhos = 0, perdidos = 0;
  for (const c of colunas || []) {
    const n = Number(c && c.total) || 0;
    if (tipo.get(c.estagio_id) === "ganho") ganhos += n; else if (tipo.get(c.estagio_id) === "perdido") perdidos += n;
  }
  return { ganhos, perdidos, taxa: ganhos + perdidos ? ganhos / (ganhos + perdidos) : null };
}

/** plano 1500c · RC-068: a cor da paleta menos usada (empate: a primeira da paleta). Paleta vazia → null. */
export function corMenosUsada(paleta, usadas) {
  const p = (paleta || []).filter(Boolean);
  if (!p.length) return null;
  const conta = new Map(p.map(c => [String(c).toLowerCase(), 0]));
  for (const c of usadas || []) { const x = String(c || "").toLowerCase(); if (conta.has(x)) conta.set(x, conta.get(x) + 1); }
  let melhor = p[0];
  for (const c of p) if (conta.get(String(c).toLowerCase()) < conta.get(String(melhor).toLowerCase())) melhor = c;
  return melhor;
}

/** plano 1500c · RC-093: «Etiqueta «A» adicionada», «3 etiquetas adicionadas: A, B e C», «1 adicionada, 1 removida». */
export function textoEtiquetasMudaram(mais = [], menos = []) {
  const m = (mais || []).filter(Boolean), r = (menos || []).filter(Boolean);
  const lista = l => juntarE(l.map(x => `«${x}»`));
  if (m.length && r.length) return `${m.length} ${m.length === 1 ? "adicionada" : "adicionadas"} (${lista(m)}), ${r.length} ${r.length === 1 ? "removida" : "removidas"} (${lista(r)})`;
  if (m.length === 1) return `Etiqueta «${m[0]}» adicionada`;
  if (m.length > 1) return `${m.length} etiquetas adicionadas: ${lista(m)}`;
  if (r.length === 1) return `Etiqueta «${r[0]}» removida`;
  if (r.length > 1) return `${r.length} etiquetas removidas: ${lista(r)}`;
  return "";
}

/** plano 1500c · RC-088: corta em `max` caracteres no fim de uma palavra («Implante dentário…», não «Implante dent…»). */
export function cortarNaPalavra(s, max = 48) {
  const t = String(s ?? "").replace(/\s+/g, " ").trim();
  const cps = Array.from(t);      // plano 1500c · RX-012: emoji (2 unidades UTF-16) não é cortado ao meio
  if (cps.length <= max) return t;
  const corte = cps.slice(0, max - 1).join("");
  const esp = corte.lastIndexOf(" ");
  return `${(esp >= max * 0.6 ? corte.slice(0, esp) : corte).replace(/[\s,.;:–—-]+$/, "")}…`;
}

/**
 * plano 1500c · RC-280: quanto falta para o prazo da etapa (sla em horas): «faltam 5 h para o prazo», «falta 1 dia para o prazo»,
 * «prazo vencido há 2 dias». Sem prazo ou sem data → "".
 */
export function textoFaltaPrazo(estagioEm, slaHoras, agora = Date.now()) {
  const t = Date.parse(estagioEm), sla = Number(slaHoras);
  if (!Number.isFinite(t) || !Number.isFinite(sla) || sla <= 0) return "";
  const resta = (t + sla * 3600000 - Number(agora)) / 3600000;
  // plano 1500c · RX-010: 23,6 h arredonda para 24 → «1 dia» (não «24 h»)
  const fmt = h => (Math.round(Math.abs(h)) >= 24 ? (d => `${d} ${d === 1 ? "dia" : "dias"}`)(Math.round(Math.abs(h) / 24)) : `${Math.max(1, Math.round(Math.abs(h)))} h`);
  if (resta > 0) { const f = fmt(resta); return `falta${/^1 /.test(f) ? "" : "m"} ${f} para o prazo`; }
  return `prazo vencido há ${fmt(resta)}`;
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
  // plano 1500c · RX-056: «Dr. João Silva» → «JS» (pronome de tratamento não vira inicial) e emoji/acento composto não é partido ao meio
  const todas = String(nome || "").trim().split(/\s+/).filter(Boolean);
  const semTitulo = todas.filter(x => !/^(dr|dra|sr|sra|srta|prof|profa|dom|dona)\.?$/i.test(x));
  const p = semTitulo.length ? semTitulo : todas;
  if (!p.length) return "?";
  const c = s => Array.from(s);
  return ((c(p[0])[0] || "") + (p.length > 1 ? c(p[p.length - 1])[0] : (c(p[0])[1] || ""))).toUpperCase();
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
const SEPARADORES = [";", ",", "\t", "|"];      // plano 1500c · RX-014: barra vertical (exportação de sistema antigo/ERP)

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
  // plano 1500c · RC-021: telefone de fora («+1 415 555 0100») só tem dígitos, espaço, parênteses e hífen — não executa nada (sem o apóstrofo visível)
  if (/^\+[\d\s()-]+$/.test(s) && !/^\+[\d\s()-]*[+]/.test(s) && /\d{6}/.test(s.replace(/\D/g, ""))) return false;
  if (/^[-+]+$/.test(s)) return false;      // plano 2000d · PX-011: «-» (o «sem valor» de muita planilha) e «---» não são fórmula — sem o «'» na frente
  return /^[=+\-@\t\r]/.test(s) && !/^[+-]?\d+([.,]\d+)*$/.test(s);
}
/** Escapa um valor para CSV com ";" (o que o Excel brasileiro abre direto); fórmula ganha um ' na frente. */
export function csvCampo(v) {
  let s = v === null || v === undefined ? "" : String(v);
  if (pareceFormula(s)) s = `'${s}`;
  return /[";\r\n]/.test(s) || /^\s|\s$/.test(s) ? `"${s.replace(/"/g, '""')}"` : s;
}
/**
 * plano 1500c · RC-307: tarefas da tela → {cabecalho, linhas} para gerarCSV (título, tipo, prazo, responsável, contato, negócio, situação).
 * prazo(iso) formata o vencimento (a tela passa o fuso de SP); agora (ms) decide «Atrasada».
 */
export function csvTarefas(itens, { nomeDono = () => "", prazo = iso => String(iso || ""), agora = Date.now(), rotNegocio = "Negócio" } = {}) {
  const TIPOS = ROTULO_TAREFA;
  const cabecalho = ["Título", "Tipo", "Prazo", "Responsável", "Contato", rotNegocio, "Situação"];
  const linhas = (itens || []).filter(Boolean).map(t => {
    const vence = t.vence_em ? Date.parse(t.vence_em) : NaN;
    const situacao = t.concluida || t.concluida_em ? "Concluída" : Number.isFinite(vence) && vence < agora ? "Atrasada" : "Aberta";
    return [t.titulo || "", TIPOS[t.tipo] || t.tipo || "", t.vence_em ? prazo(t.vence_em) : "Sem prazo", t.dono_id != null ? nomeDono(t.dono_id) || "" : "",
      (t.contato && t.contato.nome) || "", (t.negocio && t.negocio.titulo) || "", situacao];
  });
  return { cabecalho, linhas };
}
/** Linhas → texto CSV com BOM (acentos certos no Excel). */
/**
 * plano 2000d · DR-340: o dia (AAAA-MM-DD) de São Paulo — o fallback ÚNICO do CRM quando ui.hojeSP falta (antes 9 telas caíam no UTC,
 * que depois das 21h já é amanhã).
 */
export function hojeSP(d = new Date()) {
  const t = new Date(d);
  return fmtDiaSP.format(Number.isFinite(t.getTime()) ? t : new Date());
}
/**
 * plano 2000d · DR-339: baixa um arquivo e só revoga o link depois de 60 s (ou ao sair da página) — com 2 s o Safari do iPhone e a rede lenta
 * baixavam o arquivo vazio. Um helper para todos os downloads do CRM. → a URL do blob.
 */
export const ESPERA_REVOGAR_DOWNLOAD = 60000;
export function baixarArquivo(conteudo, nome, { tipo = "text/csv;charset=utf-8", h = null, doc = globalThis.document, URLx = globalThis.URL,
  agendar = globalThis.setTimeout, janela = globalThis.window } = {}) {
  const blob = typeof Blob !== "undefined" && conteudo instanceof Blob ? conteudo : new Blob([conteudo], { type: tipo });
  const url = URLx.createObjectURL(blob);
  const a = h ? h("a", { href: url, download: nome, hidden: true }) : Object.assign(doc.createElement("a"), { href: url, download: nome, hidden: true });
  doc.body.appendChild(a); a.click(); a.remove();
  let feito = false;
  const revogar = () => {
    if (feito) return; feito = true;
    try { URLx.revokeObjectURL(url); } catch { /* já revogado */ }
    try { if (janela && janela.removeEventListener) janela.removeEventListener("pagehide", revogar); } catch { /* ok */ }
  };
  if (typeof agendar === "function") agendar(revogar, ESPERA_REVOGAR_DOWNLOAD);
  try { if (janela && janela.addEventListener) janela.addEventListener("pagehide", revogar); } catch { /* ok */ }
  return url;
}
/** plano 2000d · DR-343: id do servidor dentro de um seletor [data-x="…"] — CSS.escape quando existe; senão escapa aspas e barra. */
export function escaparCss(v) {
  const s = String(v ?? "");
  if (typeof CSS !== "undefined" && CSS && typeof CSS.escape === "function") return CSS.escape(s);
  return s.replace(/["\\\n\r]/g, c => (c === "\n" ? "\\a " : c === "\r" ? "\\d " : "\\" + c));
}
/**
 * plano 2000d · DR-341: nome da cópia do funil — corta a BASE (não o sufixo) para caber em max; se «X (cópia)» já existe, numera
 * («X (cópia 2)»…) comparando sem acento/maiúscula.
 */
export function nomeCopiaFunil(nome, existentes = [], max = 60) {
  const base0 = String(nome ?? "").replace(/\s*\(c[oó]pia(?: \d+)?\)\s*$/i, "").trim() || "Funil";
  const usados = new Set((existentes || []).map(x => semAcento(String(x ?? "").trim())));
  for (let n = 1; n < 1000; n++) {
    const suf = n === 1 ? " (cópia)" : ` (cópia ${n})`;
    const nomeN = base0.slice(0, Math.max(1, max - suf.length)).trimEnd() + suf;
    if (!usados.has(semAcento(nomeN))) return nomeN;
  }
  return base0.slice(0, max - 8) + " (cópia)";
}
/** plano 2000d · DR-235: o lembrete da LGPD ao baixar uma planilha com dados pessoais. */
export const TEXTO_LGPD_EXPORTAR = "Esse arquivo tem dados pessoais (nomes, telefones, e-mails). Guarde com cuidado, não envie por grupos e apague quando não precisar mais.";
export function gerarCSV(cabecalho, linhas) {
  return "﻿" + [cabecalho, ...linhas].map(l => l.map(csvCampo).join(";")).join("\r\n");
}

/**
 * plano 1000 (CR-239): planilha-modelo da importação — os cabeçalhos que sugerirMapeamento reconhece sozinho (reimportar o modelo não pede mapa)
 * + os campos personalizados de contato (pelo rótulo) e 2 linhas de exemplo. → {cabecalho, linhas}
 */
export function modeloImportacao(campos = [], { vertical = null } = {}) {
  const extra = (campos || []).filter(c => c && c.entidade === "contato" && c.ativo !== false && c.rotulo);
  // plano 1000b · RB-073: também Empresa, CPF/CNPJ e as colunas do negócio (Título, Valor, Etapa) — todas com nome que o mapa reconhece sozinho
  const cabecalho = ["Nome", "Telefone", "E-mail", "Empresa", "CPF/CNPJ", "Cidade", "UF", "Nascimento", "Origem", "Etiquetas", "Observação", "Título", "Valor", "Etapa", ...extra.map(c => c.rotulo)];
  const vazio = extra.map(() => "");
  // plano 2000d · DR-232: com a vertical, a 1ª linha de exemplo é do ramo (título «Implante superior», etiquetas «Implante; Urgência»)
  if (vertical) {
    const ex = exemplosVertical(vertical);
    const etq = String(ex.etiquetas || "").split(",").map(x => x.trim()).filter(Boolean).join("; ");
    return { cabecalho, linhas: [
      ["Ana Souza", "(12) 99830-3030", "ana@exemplo.com.br", "", "", "Taubaté", "SP", "02/03/1990", "Indicação", etq, "Prefere horário de manhã", ex.titulo, "1.500,00", "", ...vazio],
      ["Carlos Lima", "(12) 3456-7890", "", "", "", "São José dos Campos", "SP", "", "WhatsApp", "", "", "", "", "", ...vazio],
    ] };
  }
  return { cabecalho, linhas: [
    ["Ana Souza", "(12) 99830-3030", "ana@exemplo.com.br", "", "", "Taubaté", "SP", "02/03/1990", "Indicação", "VIP; Retorno", "Prefere horário de manhã", "", "", "", ...vazio],
    ["Carlos Lima", "(12) 3456-7890", "", "", "", "São José dos Campos", "SP", "", "WhatsApp", "", "", "", "", "", ...vazio],
  ] };
}

/* ------------------------------------------------------------ mapeamento da importação */
/** Destinos fixos da importação (chaves da linha de nx_contatos_importar). */
export const DESTINOS_IMPORTACAO = Object.freeze([
  { chave: "nome", rotulo: "Nome" },
  { chave: "sobrenome", rotulo: "Sobrenome (junta ao nome)" },      // plano 1500c · RC-007
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
  // plano 2000d · DR-195/196: consentimento de marketing (sim/não) e a data do cadastro original (o servidor grava quando aceitar as chaves)
  { chave: "optin_marketing", rotulo: "Aceita marketing (sim/não)" },
  { chave: "criado_em", rotulo: "Cadastrado em (data)" },
  // plano 2000d · DR-342: a carteira de cada vendedor (quem migra do Pipedrive/RD) — nome ou e-mail de alguém da equipe
  { chave: "responsavel", rotulo: "Responsável (nome ou e-mail)" },
]);

const SINONIMOS = [
  // plano 1500c · RC-007/041: primeiro nome e os cabeçalhos de exportação do RD Station, Kommo, Pipedrive, Google e Outlook
  ["nome", ["nome", "nome completo", "cliente", "paciente", "contato", "name", "full name", "razao social", "first name", "primeiro nome", "given name",
    "nome do lead", "lead name", "person name", "contact name", "contato principal"]],
  ["sobrenome", ["sobrenome", "last name", "family name", "surname", "ultimo nome"]],
  // plano 2000d · DR-195/196
  ["optin_marketing", ["aceita marketing", "aceita receber", "aceita receber mensagens", "opt-in", "optin", "consentimento", "autoriza contato", "marketing"]],
  ["criado_em", ["data de cadastro", "cadastrado em", "criado em", "created at", "date created", "data de criacao", "cadastro"]],
  // plano 2000d · DR-342
  // plano 2000d · PX-060: «Atendente», «Corretor(a)», «Assigned to» (exportações de CRM imobiliário e helpdesk) também são o responsável
  ["responsavel", ["responsavel", "vendedor", "vendedora", "dono", "owner", "owner name", "proprietario", "consultor", "consultora", "usuario responsavel", "responsible",
    "atendente", "corretor", "corretora", "assigned to"]],
  ["telefone", ["telefone", "celular", "whatsapp", "whats", "fone", "tel", "telefone 1", "celular 1", "phone", "mobile", "numero", "zap",
    "celular do lead", "telefone do lead", "person phone", "mobile phone", "work phone", "telefone celular", "telefone comercial",
    "cel", "telefone fixo", "contato telefonico"]],      // plano 2000d · PX-059: «Cel» (abreviado) também é o telefone
  ["email", ["email", "e-mail", "e mail", "mail", "correio eletronico", "email do lead", "e mail do lead", "person email", "work email", "email comercial"]],
  ["empresa", ["empresa", "companhia", "organizacao", "company", "convenio"]],
  ["cidade", ["cidade", "municipio", "city"]],
  ["uf", ["uf", "estado", "state"]],
  ["nascimento", ["nascimento", "data de nascimento", "data nascimento", "aniversario", "dt nascimento", "birthday", "nasc"]],
  // plano 1000b · RB-072: «RG» não é CPF/CNPJ (entrava como documento e disparava o aviso de dígito) — a coluna fica «Ignorar»
  ["documento", ["cpf", "cnpj", "cpf/cnpj", "cpf cnpj", "documento"]],
  // plano 2000d · PX-058: «Anotações», «Notes» (Google/Outlook) e «Descrição» também vão para a observação
  ["obs", ["observacao", "observacoes", "obs", "nota", "notas", "anotacao", "comentario", "comentarios", "anotacoes", "notes", "note", "descricao"]],
  ["origem", ["origem", "fonte", "canal", "source"]],
  ["etiquetas", ["etiquetas", "etiqueta", "tags", "tag", "marcadores", "grupo"]],
  ["negocio_titulo", ["titulo", "negocio", "oportunidade", "orcamento", "procedimento", "servico", "tratamento", "deal title", "titulo do negocio",
    "nome da oportunidade", "nome do negocio"]],
  ["negocio_valor", ["valor", "preco", "valor do negocio", "valor previsto", "ticket", "total", "deal value", "valor da oportunidade", "valor do lead"]],
  ["estagio", ["etapa", "estagio", "fase", "status", "situacao", "deal stage", "stage", "etapa do funil", "pipeline stage"]],
];

// plano 1500c · RC-042: BOM grudado e caracteres invisíveis de formatação (zero-width) não atrapalham o cabeçalho
function chaveTexto(s) { return semAcento(String(s ?? "").replace(/\p{Cf}/gu, "")).replace(/[_\-./]+/g, " ").replace(/\s+/g, " ").trim(); }
/** plano 1500c · RC-006: «Phone 1 - Type» / «E-mail 1 - Label» (Google/Outlook) trazem «Mobile», «Home» — não são o número nem o e-mail. */
const colunaDeTipo = col => /\s-\s*(type|label|tipo|rotulo)\s*$/.test(semAcento(String(col ?? "").replace(/\p{Cf}/gu, "")).trim());

/**
 * sugerirMapeamento(cabecalho, campos?) → lista (uma por coluna) de destino: chave fixa,
 * 'campo:<chave>' (campo personalizado de contato) ou null (Ignorar). Cada destino no máximo uma vez.
 */
export function sugerirMapeamento(cabecalho, campos = []) {
  const usados = new Set();
  const personal = (campos || []).filter(c => c && c.entidade === "contato");
  return (cabecalho || []).map(col => {
    const k = chaveTexto(col);
    if (!k || colunaDeTipo(col)) return null;
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
    // plano 2000d · PX-056/057: o COMEÇO do cabeçalho decide antes do fim — «E-mail do cliente» é e-mail (não nome) e «Valor do orçamento» é valor (não título)
    if (!achou) {
      for (const [dest, lista] of SINONIMOS) {
        if (usados.has(dest)) continue;
        if (lista.some(s => s.length >= 4 && k.startsWith(s + " "))) { achou = dest; break; }
      }
    }
    if (!achou) {
      for (const [dest, lista] of SINONIMOS) {
        if (usados.has(dest)) continue;
        if (lista.some(s => s.length >= 4 && k.endsWith(" " + s))) { achou = dest; break; }
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
    const t = String(x ?? "").trim().replace(/\s+/g, " ");      // plano 1500c · RC-045: «Unimed  Plus» = «Unimed Plus»
    if (!t) continue;
    const n = semAcento(t);
    if (vistos.has(n)) continue;
    vistos.add(n); opcoes.push(t);
  }
  const total = (lista || []).filter(x => String(x ?? "").trim()).length;
  return { opcoes, unidas: total - opcoes.length };
}

/** Aplica o mapeamento: linhas do CSV → linhas no formato de nx_contatos_importar. `campos` (opcional): opção/multi viram a opção oficial (RB-068). */
/**
 * plano 2000d · DR-200: o formato das datas de UMA coluna — "mdy" quando algum valor só pode ser mês/dia («12/31/1990») e nenhum só pode
 * ser dia/mês («31/12/1990»); senão "dmy" (o padrão brasileiro). Planilha exportada em inglês deixava de perder todas as datas.
 */
export function formatoDatasColuna(valores) {
  let mdy = 0, dmy = 0;
  for (const v of valores || []) {
    const r = /^\s*(\d{1,2})[/.-](\d{1,2})[/.-](\d{4}|\d{2})\b/.exec(String(v ?? ""));
    if (!r) continue;
    const a = +r[1], b = +r[2];
    if (a >= 1 && a <= 12 && b > 12 && b <= 31) mdy++;
    else if (a > 12 && a <= 31 && b >= 1 && b <= 12) dmy++;
  }
  return mdy > 0 && dmy === 0 ? "mdy" : "dmy";
}
export function montarLinhas(linhas, mapa, campos = null) {
  // plano 2000d · DR-200: colunas de data no formato americano (nascimento, data do cadastro e campos do tipo data)
  const ehData = dest => dest === "nascimento" || dest === "criado_em"
    || (typeof dest === "string" && dest.startsWith("campo:") && Array.isArray(campos) && campos.some(c => c && c.chave === dest.slice(6) && c.tipo === "data"));
  const colMdy = new Set();
  (mapa || []).forEach((dest, i) => { if (dest && ehData(dest) && formatoDatasColuna((linhas || []).map(l => l && l[i])) === "mdy") colMdy.add(i); });
  return (linhas || []).map(l => {
    const o = {};
    let datasEUA = false;
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
        if (colMdy.has(i)) { const dt = lerData(v, { mdy: true }); if (dt) { val = dt; datasEUA = true; } }      // plano 2000d · DR-200
        else if (def && def.tipo === "opcao") val = opcaoOficial(def.opcoes, v) ?? v;
        else if (def && def.tipo === "multi") val = v.split(";").map(x => x.trim()).filter(Boolean).map(x => opcaoOficial(def.opcoes, x) ?? x).join(";");
        (o.campos || (o.campos = {}))[chave] = val;
        return;
      }
      if (o[dest] !== undefined && dest === "obs") { o.obs += " · " + v; return; }
      // plano 2000d · DR-195/196: «Sim/Não» vira true/false; a data do cadastro em AAAA-MM-DD — ilegível não vai (não inventa data)
      if (dest === "optin_marketing") { const b = lerSimNao(v); if (b !== null && o.optin_marketing === undefined) o.optin_marketing = b; return; }
      if (dest === "criado_em") { const dt = lerData(v, { passado: true, mdy: colMdy.has(i) }); if (dt && o.criado_em === undefined) { o.criado_em = dt; if (colMdy.has(i)) datasEUA = true; } return; }
      if (dest === "nascimento" && colMdy.has(i) && o.nascimento === undefined) { const dt = lerData(v, { passado: true, mdy: true }); o.nascimento = dt || v; if (dt) datasEUA = true; return; }      // plano 2000d · DR-200
      // plano 1000 (CR-129): «São Paulo» vira SP e «Indicação»/«Whats» viram a origem certa (antes viravam aviso e a linha perdia o dado)
      // plano 1000b · RB-249: nascimento legível vai em AAAA-MM-DD já com o século certo («05/03/28» → 1928-03-05); ilegível fica como veio (a prévia avisa)
      if (o[dest] === undefined) o[dest] = dest === "uf" ? ufDaPlanilha(v) : dest === "origem" ? origemDaPlanilha(v) : dest === "nascimento" ? (lerData(v, { passado: true }) || v) : v;
    });
    if (datasEUA) Object.defineProperty(o, "_datasEUA", { value: true, enumerable: false, configurable: true });      // plano 2000d · DR-200
    return arrumarLinhaPlanilha(o);
  });
}

/** plano 1500c · RC-046: limite da observação que vai ao servidor (a linha não falha inteira por um texto longo). */
export const LIMITE_OBS_IMPORTACAO = 2000;
/**
 * plano 2000d · PX-071: nome todo em MAIÚSCULAS ou todo em minúsculas (exportação de sistema antigo, digitado no celular) vira «Maria da Silva»;
 * da/de/do/das/dos/e ficam minúsculas no meio. Nome já com maiúsculas e minúsculas misturadas («McDonald», «iPhone») fica como veio.
 */
export function nomeBonito(s) {
  const t = String(s ?? "");
  // só nome de gente (letras, espaço, ponto, hífen, apóstrofo) — «=HYPERLINK(1)», «ACME 2000» e siglas com número ficam como vieram
  if (!/^\p{L}[\p{L}\s.'-]*$/u.test(t) || (t !== t.toUpperCase() && t !== t.toLowerCase())) return t;
  const miudas = new Set(["da", "de", "do", "das", "dos", "e", "di", "du", "del", "della", "van", "von"]);
  return t.toLowerCase().split(/(\s+|-|')/).map((w, i) => (!w || /^(\s+|-|')$/.test(w) || (i > 0 && miudas.has(w)) ? w : w[0].toUpperCase() + w.slice(1))).join("");
}
export const LIMITE_NOME_IMPORTACAO = 160;      // plano 1500c · RX-026: o mesmo maxlength do nome na ficha
const RE_EMAIL = /^[^@\s]+@[^@\s]+\.[^@\s]+$/;
/**
 * plano 1500c · RC-037/039/040: o telefone da célula sem o ramal e, com vários números na mesma célula («12 99999-0000 / 12 98888-1111»),
 * o primeiro que vale; os outros vão para a observação. → {telefone, extras, ramal}
 */
export function telefoneDaCelula(v) {
  // plano 2000d · PX-008: o prefixo internacional «00» («0055 12 99830-3030», «001 415…») vira «+» — antes ficava um número de 15 dígitos inválido
  // plano 2000d · PX-019: o código da operadora do DDD antigo («015 12 99830-3030», «0 21 12 3632-1234») sai — fica DDD + número
  const semOperadora = s => { const d = s.replace(/\D/g, ""); return !/^\+/.test(s) && /^0\d{2}\d{10,11}$/.test(d) && dddValido(d.slice(3, 5)) && normalizarTelefone(d.slice(3)) ? d.slice(3) : s; };
  const semRamal = s => semOperadora(String(s).replace(/\s*(?:ramal|ext\.?|r\.)\s*:?\s*\d+.*$/i, "").trim().replace(/^00\s*(?=[1-9])/, "+"));
  const txt = String(v ?? "").trim();
  const ramal = /(?:ramal|ext\.?|r\.)\s*:?\s*\d/i.test(txt);
  // plano 1500c · RX-013: «12 99830-3030 e 12 98888-1111» também são dois números
  // plano 2000d · DR-411: «:::» do Google Contatos também separa — e o .map/.filter, que estava engolido pelo comentário da linha, voltou a valer
  const partes = txt.split(/\s*(?::::|\/|;|\||,|\bou\b|\se\s)\s*/i).map(semRamal).filter(p => p.replace(/\D/g, "").length >= 8);
  if (partes.length < 2) return { telefone: semRamal(txt), extras: [], ramal };
  const i = Math.max(0, partes.findIndex(p => normalizarTelefone(p)));
  return { telefone: partes[i], extras: partes.filter((_, j) => j !== i), ramal };
}
/** plano 1500c · RC-038/039: e-mail sem espaço e em minúsculas; vários na célula → o primeiro válido e os outros para a observação. */
export function emailDaCelula(v) {
  // plano 1500c · RX-007: «Ana <ana@x.com>» (copiado do e-mail), «mailto:ana@x.com» e o ponto final da frase («ana@x.com.») viram só o endereço
  const limpar = p => p.replace(/^mailto:/, "").replace(/^[<("'[]+|[>)"'\]]+$/g, "").replace(/[.,;:!?]+$/, "");
  // plano 2000d · PX-009: espaço em volta do @ («ana @ x.com», digitado no celular) some — antes o e-mail virava inválido
  const bruto = String(v ?? "").trim().toLowerCase().replace(/\s*@\s*/g, "@").replace(/@{2,}/g, "@");      // plano 2000d · PX-081: «ana@@x.com» (tecla repetida) vale
  const partes = bruto.replace(/[^;,<>]*<([^<>\s]+@[^<>\s]+)>/g, " $1 ").split(/[;,\s]+/).map(limpar).filter(Boolean);
  if (!partes.length) return { email: "", extras: [] };
  const i = partes.findIndex(p => RE_EMAIL.test(p));
  if (i < 0) return { email: partes.join(" "), extras: [] };
  return { email: partes[i], extras: partes.filter((p, j) => j !== i && RE_EMAIL.test(p)) };
}
function arrumarLinhaPlanilha(o) {
  const avisos = [];
  // plano 2000d · DR-200: a prévia diz que as datas foram lidas como mês/dia
  if (o._datasEUA) { delete o._datasEUA; avisos.push("Data no formato americano (mês/dia): lida como mês/dia"); }
  // plano 2000d · DR-234: valor que não é número («a combinar») não vai ao servidor (lá virava 0) — a linha entra sem valor e a prévia avisa
  if (o.negocio_valor !== undefined && lerNumero(o.negocio_valor) === null) {
    avisos.push(`Valor «${String(o.negocio_valor).slice(0, 30)}» não é número: entra sem valor`);
    delete o.negocio_valor;
  }
  const obsExtra = [];
  // plano 1500c · RC-007: «Nome» + «Sobrenome» em colunas separadas viram o nome inteiro
  if (o.sobrenome !== undefined) { o.nome = [o.nome, o.sobrenome].filter(Boolean).join(" "); delete o.sobrenome; }
  // plano 1500c · RX-026: nome com espaços repetidos/quebra de linha vira uma linha só; mais de 160 caracteres (o limite da ficha) é cortado com aviso
  if (typeof o.nome === "string") {
    o.nome = nomeBonito(o.nome.replace(/\s+/g, " ").trim());      // plano 2000d · PX-071: «MARIA DA SILVA»/«joão de souza» → «Maria da Silva»/«João de Souza»
    if ([...o.nome].length > LIMITE_NOME_IMPORTACAO) { o.nome = [...o.nome].slice(0, LIMITE_NOME_IMPORTACAO).join("").trimEnd(); avisos.push(`Nome cortado em ${LIMITE_NOME_IMPORTACAO} caracteres`); }
  }
  if (o.telefone) {
    const t = telefoneDaCelula(o.telefone);
    o.telefone = t.telefone;
    if (t.ramal) avisos.push("Ramal ignorado no telefone");
    if (t.extras.length) { obsExtra.push(`Outros telefones: ${t.extras.join(", ")}`); avisos.push("Mais de um telefone: o 1º entra, os outros vão para a observação"); }
  }
  if (o.email) {
    const e = emailDaCelula(o.email);
    o.email = e.email;
    if (e.extras.length) { obsExtra.push(`Outros e-mails: ${e.extras.join(", ")}`); avisos.push("Mais de um e-mail: o 1º entra, os outros vão para a observação"); }
  }
  if (obsExtra.length) o.obs = [o.obs, ...obsExtra].filter(Boolean).join(" · ");
  // plano 2000d · PX-029: cidade em CAIXA ALTA/minúsculas também ganha as maiúsculas certas («SÃO JOSÉ DOS CAMPOS» → «São José dos Campos»)
  if (typeof o.cidade === "string" && o.cidade.trim()) o.cidade = nomeBonito(o.cidade.trim().replace(/\s+/g, " "));
  if (o.obs && [...o.obs].length > LIMITE_OBS_IMPORTACAO) {
    o.obs = [...o.obs].slice(0, LIMITE_OBS_IMPORTACAO).join("");
    avisos.push(`Observação cortada em ${LIMITE_OBS_IMPORTACAO.toLocaleString("pt-BR")} caracteres`);
  }
  if (avisos.length) Object.defineProperty(o, "_avisos", { value: avisos, enumerable: false });      // não vai ao servidor (não enumerável)
  return o;
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
  // plano 1500c · RC-009: «S.P.», «sp.», «R J» — tirando pontos e espaços sobra a sigla
  if (/^[A-Za-z.\s]+$/.test(t) && t.replace(/[^A-Za-z]/g, "").length === 2) return t.replace(/[^A-Za-z]/g, "").toUpperCase();
  const n = semAcento(t).replace(/^estado d[eoa]s?\s+/, "").replace(/[^a-z ]/g, " ").replace(/\s+/g, " ").trim();
  // plano 1500c · RX-018: «Estado de SP», «SP - São Paulo», «São Paulo (SP)» → a sigla que aparece no texto, se for UF
  if (!UF_POR_NOME[n]) { const sig = /(?:^|[^A-Za-z])([A-Za-z]{2})(?:$|[^A-Za-z])/.exec(t.replace(/^estado\s+d[eoa]s?\s+/i, "")); if (sig && ufValida(sig[1]) && (n.length === 2 || /[()\-–]/.test(t) || /^estado/i.test(t))) return sig[1].toUpperCase(); }
  return UF_POR_NOME[n] || UF_APELIDOS[n] || t;
}
// plano 2000d · PX-072: apelidos comuns na planilha (fora do UF_POR_NOME, que também gera a lista de UFs)
const UF_APELIDOS = Object.freeze({ minas: "MG", brasilia: "DF" });
const ORIGEM_POR_TEXTO = Object.freeze({ anuncio: "anuncio", "anuncio pago": "anuncio", trafego: "anuncio", "trafego pago": "anuncio", whatsapp: "whatsapp", whats: "whatsapp",
  zap: "whatsapp", wpp: "whatsapp", indicacao: "indicacao", indicado: "indicacao", "indicado por": "indicacao", "boca a boca": "indicacao", organico: "organico",
  // plano 2000d · PX-018: «Orgânica», «Google (orgânico)», «Busca orgânica» — o tipo vem no texto, então é orgânico
  organica: "organico", "busca organica": "organico", "google organico": "organico", "instagram organico": "organico", "facebook organico": "organico",
  manual: "manual", "cadastro manual": "manual", balcao: "manual", recepcao: "manual", site: "site", website: "site", "formulario do site": "site", importacao: "importacao" });
/**
 * plano 1000 (CR-129): origem da planilha — o rótulo da tela («Indicação», «Cadastro manual») ou um sinônimo comum («Whats», «boca a boca») vira a chave.
 * Instagram/Facebook/Google ficam como vieram (o servidor avisa): sem a plataforma e a campanha não dá para saber se foi anúncio ou orgânico, e marcar
 * «Anúncio» sem plataforma polui os números dos anúncios (CR-094).
 */
export function origemDaPlanilha(v) {
  const t = String(v ?? "").trim();
  const n = semAcento(t).replace(/[^a-z ]/g, " ").replace(/\s+/g, " ").trim();
  if (ORIGEM_POR_TEXTO[n]) return ORIGEM_POR_TEXTO[n];
  // plano 1500c · RX-019: «Indicação da Maria», «Indicação - Dr. João», «WhatsApp (loja)» — o começo já diz a origem
  const ini = Object.keys(ORIGEM_POR_TEXTO).filter(x => n.startsWith(`${x} `)).sort((a, b) => b.length - a.length)[0];
  return ini && ORIGEM_POR_TEXTO[ini] !== "importacao" ? ORIGEM_POR_TEXTO[ini] : t;
}

/** plano 1000b · RB-087: a frase da linha vazia é uma constante (a prévia conta por ela, não por /ignorada/ no texto). */
export const LINHA_VAZIA = "Linha sem nome, telefone e e-mail — será ignorada";
export const linhaVazia = problemas => Array.isArray(problemas) && problemas.length === 1 && problemas[0] === LINHA_VAZIA;
/** Problemas de uma linha montada (antes de mandar): [] = ok. Linha sem nome, telefone e e-mail → [LINHA_VAZIA]. */
export function checarLinha(o, { campos = [], agora = Date.now() } = {}) {
  const erros = [...((o && o._avisos) || [])];      // plano 1500c · RC-037/039/040/046: o que a montagem ajustou (ramal, telefones/e-mails a mais, observação cortada)
  // plano 1000 (CR-232): campo personalizado com valor que o tipo não aceita («x» fora das opções, data inválida) avisa na prévia, linha a linha
  for (const [chave, v] of Object.entries((o && o.campos) || {})) {
    const def = (campos || []).find(c => c && c.chave === chave);
    const er = def ? validarCampo({ ...def, obrigatorio: false }, v) : null;
    if (er) erros.push(`${def.rotulo || chave}: ${er.replace(/\.$/, "")}`);
  }
  if (!o.nome && !o.telefone && !o.email) return [LINHA_VAZIA];
  // C7: número de outro país digitado sem o «+» não vira número brasileiro — a linha entra sem telefone e a pessoa sabe como corrigir
  if (o.telefone && !normalizarTelefone(o.telefone)) erros.push(telefoneSemPais(o.telefone) ? "Telefone sem DDD brasileiro: se for de fora do Brasil, escreva com +código do país" : "Telefone inválido");
  if (o.email && !RE_EMAIL.test(String(o.email).trim().toLowerCase())) erros.push("E-mail inválido");      // plano 1500c · RC-038: « Ana@X.com » vale
  // plano 1000b · RB-074: «XX» tem 2 letras mas não é estado — confere contra as 27 UFs
  if (o.uf && !ufValida(o.uf)) erros.push(/^[A-Za-z]{2}$/.test(String(o.uf).trim()) ? "UF não existe: use a sigla do estado (SP, RJ…)" : "UF deve ter 2 letras");
  if (o.nascimento) {
    // plano 1000b · RB-249: nascimento no futuro é recusado na prévia (e «05/03/28» é 1928, não 2028)
    const nasc = lerData(o.nascimento, { passado: true, agora: new Date(agora) });
    if (!nasc) erros.push("Nascimento: use DD/MM/AAAA");
    else if (nasc > fmtDiaSP.format(new Date(agora))) erros.push("Nascimento no futuro: confira a data");      // plano 1500c · RC-005: o dia de São Paulo, não o UTC
  }
  if (o.negocio_valor && lerNumero(o.negocio_valor) === null) erros.push("Valor inválido");
  else if (o.negocio_valor && lerNumero(o.negocio_valor) < 0) erros.push("Valor não pode ser negativo");      // plano 1000b · RB-075
  return erros;
}

/**
 * plano 2000d · DR-342: quem da equipe é o «Responsável» da planilha — e-mail igual, nome igual (sem acento/maiúscula) ou o primeiro nome
 * quando só uma pessoa tem esse primeiro nome. Pessoa desativada não recebe. → id | null
 */
export function responsavelDaPlanilha(texto, usuarios = []) {
  const t = semAcento(String(texto ?? "").trim()).replace(/\s+/g, " ");
  if (!t) return null;
  const ativos = (usuarios || []).filter(u => u && u.id != null && u.ativo !== false);
  const porEmail = ativos.find(u => u.email && semAcento(String(u.email).trim()) === t);
  if (porEmail) return porEmail.id;
  const porNome = ativos.filter(u => u.nome && semAcento(String(u.nome).trim()).replace(/\s+/g, " ") === t);
  if (porNome.length === 1) return porNome[0].id;
  if (porNome.length > 1) return null;
  const prim = ativos.filter(u => u.nome && semAcento(String(u.nome).trim()).split(" ")[0] === t);
  return prim.length === 1 ? prim[0].id : null;
}
/**
 * plano 2000d · DR-342: troca a coluna «Responsável» de cada linha pelo dono_id; quem não casa fica com o responsável do lote e a prévia avisa.
 * Muda as próprias linhas (as de montarLinhas) e as devolve.
 */
export function aplicarResponsaveis(linhas, usuarios = []) {
  for (const o of linhas || []) {
    if (!o || o.responsavel === undefined) continue;
    const txt = String(o.responsavel).trim();
    delete o.responsavel;
    if (!txt) continue;
    const id = responsavelDaPlanilha(txt, usuarios);
    if (id != null) { o.dono_id = id; continue; }
    const aviso = `Responsável «${txt.slice(0, 40)}» não está na equipe: fica com o responsável escolhido para a importação`;
    if (Array.isArray(o._avisos)) o._avisos.push(aviso);
    else Object.defineProperty(o, "_avisos", { value: [aviso], enumerable: false });
  }
  return linhas;
}

/**
 * plano 2000d · DR-345: os cartões CARREGADOS em etapas abertas sem responsável (lead do anúncio que chegou sem dono) → [id].
 * O servidor ainda não distribui sozinho; o quadro mostra a conta e o supervisor reparte em rodízio com um toque.
 */
export function cartoesSemDono(colunas, estagios) {
  const tipo = new Map((estagios || []).map(e => [String(e.id), e.tipo]));
  const ids = [];
  for (const col of colunas || []) {
    if ((tipo.get(String(col && col.estagio_id)) || "aberto") !== "aberto") continue;
    for (const c of (col && col.itens) || []) if (c && (c.dono_id === null || c.dono_id === undefined || c.dono_id === "")) ids.push(c.id);
  }
  return ids;
}

/**
 * plano 2000d · DR-409: CSV de várias abas juntadas — linhas iguais ao cabeçalho no meio do arquivo (sem acento/maiúscula/espaços) saem.
 * → {linhas, repetidos}
 */
export function semCabecalhoRepetido(cabecalho, linhas) {
  const n = x => (x || []).map(c => semAcento(String(c ?? "").trim())).join("\u0001");
  const alvo = n(cabecalho);
  let repetidos = 0;
  const fora = (linhas || []).filter(l => { if ((cabecalho || []).length > 1 && n(l) === alvo) { repetidos++; return false; } return true; });
  return { linhas: fora, repetidos };
}
/** plano 2000d · DR-424: o tamanho máximo do serviço — o mesmo na gaveta, no novo negócio e no pós-venda. */
export const LIMITE_SERVICO = 120;
/**
 * plano 2000d · DR-423: o serviço digitado que já existe com outra grafia («implante » → «Implante») volta para a grafia existente — sem isso
 * o relatório por serviço quebrava em variações. → o nome existente | null
 */
export function servicoExistente(lista, valor) {
  const alvo = semAcento(String(valor ?? "").replace(/\s+/g, " ").trim());
  if (!alvo) return null;
  return (lista || []).find(x => semAcento(String(x ?? "").replace(/\s+/g, " ").trim()) === alvo) || null;
}
/**
 * plano 2000d · DR-421/422: no ganho, o previsto × o fechado — «desconto de 8%» (fechou abaixo) ou «acima do previsto». Sem os dois → null.
 * → {tipo: 'desconto'|'acima'|'igual', pct, diferenca}
 */
export function comparaPrevistoFechado(previsto, fechado) {
  const p = Number(previsto), f = Number(fechado);
  if (previsto === null || previsto === undefined || fechado === null || fechado === undefined || !Number.isFinite(p) || !Number.isFinite(f) || p <= 0) return null;
  const dif = f - p;
  const pct = Math.round(Math.abs(dif) / p * 100);
  return { tipo: Math.abs(dif) < 0.005 ? "igual" : dif < 0 ? "desconto" : "acima", pct, diferenca: Math.round(dif * 100) / 100 };
}
/** plano 2000d · DR-393: quantos dos cartões são de quem não quer marketing (optin_marketing false no cartão ou no contato dele). */
export function contarSemMarketing(cards) {
  return (cards || []).filter(c => c && (c.optin_marketing === false || (c.contato && c.contato.optin_marketing === false))).length;
}
/** plano 2000d · DR-381: «25/10» no ano corrente e «25/10/2024» quando é de outro ano (o dia de São Paulo). */
export function dataCurtaComAno(iso, hoje = null) {
  const t = Date.parse(iso);
  if (!Number.isFinite(t)) return "";
  const dia = hojeSP(new Date(t));
  const [y, m, d] = dia.split("-");
  const anoHoje = String(hoje || hojeSP()).slice(0, 4);
  return `${d}/${m}${y !== anoHoje ? `/${y}` : ""}`;
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
  // plano 2000d · PX-002: a moeda por extenso («1.500 reais», «BRL 300», «1 real») sai antes — o «R» de «BRL» não pode virar «BL»
  let t = String(s).replace(/(?:reais|real|brl)\.?/gi, " ").replace(/[R$\s ]/g, "").replace(/^[−–]/, "-");      // plano 1500c · RX-015: o sinal de menos tipográfico («−150», do Word/Excel) é negativo
  if (!t) return null;
  t = t.replace(/^\+(?=[\d.,(])/, "");      // plano 2000d · PX-001: o «+» da frente («+1.500», planilha de entradas) não muda o número — antes virava 1,5
  if (/^-?[.,]\d+$/.test(t)) t = t.replace(/^(-?)[.,]/, (_, sinal) => `${sinal}0.`);      // plano 2000d · PX-003: «,50» (sem o zero) é meio real — antes não era número
  // plano 1500c · RC-003: negativo contábil «(1.500,00)» (planilha de sistema financeiro) = −1500
  let negativo = false;
  const par = /^\((.*)\)$/.exec(t);
  if (par) { negativo = true; t = par[1]; }
  // plano 1500c · RX-081: o menos no FIM («1.500,00-», exportação de ERP/contábil) também é negativo
  else if (/^\d[\d.,]*-$/.test(t)) { negativo = true; t = t.slice(0, -1); }
  // plano 1000 (CR-114): com vírgula E ponto, o separador decimal é o ÚLTIMO dos dois — «1.234,56» (Brasil) e «1,234.56» (planilha em inglês) = 1234,56
  const ultVirgula = t.lastIndexOf(","), ultPonto = t.lastIndexOf(".");
  if (ultVirgula >= 0 && ultPonto >= 0) t = ultVirgula > ultPonto ? t.replace(/\./g, "").replace(",", ".") : t.replace(/,/g, "");
  // plano 1500c · RC-001: grupo de milhar nunca começa com «0» sozinho — «0.500» é meio real, não 500
  else if (ultVirgula >= 0) t = /^-?[1-9]\d{0,2}(,\d{3}){2,}$/.test(t) ? t.replace(/,/g, "") : t.replace(",", ".");
  else if (/^-?[1-9]\d{0,2}(\.\d{3})+$/.test(t)) t = t.replace(/\./g, "");
  // plano 1500c · RC-002: só dígitos com um separador decimal — «1e5», «0x10», «Infinity» e «12,5%» não são dinheiro
  if (!/^[-+]?\d+(\.\d+)?$/.test(t)) return null;
  const n = Number(t);
  if (!Number.isFinite(n)) return null;
  return negativo ? -Math.abs(n) : n;
}

/**
 * plano 1500c · RX-082: erro de digitação comum no domínio do e-mail («gmail.con», «hotmal.com», «gmial.com») → o e-mail sugerido | null.
 * Só sugere (aviso que não bloqueia): domínio próprio parecido continua valendo.
 */
// plano 2000d · PX-010: mais erros comuns — letra dobrada («gmail.comm», «gmaill.com»), letras trocadas («gmali.com», «hotamil.com») e «.cpm»
const DOMINIOS_COMUNS = Object.freeze({ "gmail.com": ["gmail.con", "gmail.co", "gmail.cm", "gmial.com", "gmai.com", "gamil.com", "gnail.com", "gmail.com.br", "gmal.com", "gmeil.com",
    "gmail.comm", "gmali.com", "gmaill.com", "gmail.cpm", "gmail.om", "gmsil.com", "gmail.vom", "gmail.xom"],
  "hotmail.com": ["hotmail.con", "hotmal.com", "hotmial.com", "hotmai.com", "homail.com", "hotmail.co", "hotmeil.com", "hotmail.comm", "hotamil.com", "hotmaill.com", "hotmail.cpm", "hotmsil.com", "hotmail.om"],
  "outlook.com": ["outlook.con", "outlok.com", "outloo.com", "outlook.co", "outlook.comm", "outllok.com", "outlook.cpm"], "yahoo.com.br": ["yahoo.com.bt", "yaho.com.br", "yahoo.combr"],
  "icloud.com": ["icloud.con", "iclod.com", "icoud.com"], "uol.com.br": ["uol.com.bt", "uol.combr"], "bol.com.br": ["bol.com.bt", "bol.combr"] });
export function sugestaoEmail(email) {
  const m = /^([^@\s]+)@([^@\s]+)$/.exec(String(email ?? "").trim().toLowerCase());
  if (!m) return null;
  for (const [certo, erros] of Object.entries(DOMINIOS_COMUNS)) if (erros.includes(m[2])) return `${m[1]}@${certo}`;
  // plano 2000d · PX-082: o domínio sem o final («ana@gmail», «ana@hotmail») ganha a sugestão com o «.com»
  const semFinal = Object.keys(DOMINIOS_COMUNS).find(d => d.split(".")[0] === m[2]);
  if (semFinal) return `${m[1]}@${semFinal}`;
  return null;
}
/** plano 1500c · RX-071: a frase do campo de dinheiro da gaveta — texto que não vira número OU valor negativo; vazio = «sem valor» (ok). */
export function erroDinheiro(s) {
  if (dinheiroInvalido(s)) return "Valor inválido. Use só números, por exemplo 1.500,00.";
  const n = lerNumero(String(s ?? "").trim());
  return n !== null && n < 0 ? "O valor não pode ser negativo." : null;
}
/**
 * plano 1500c · RX-073: o ticket médio do serviço sem olhar maiúscula/acento/espaços («implante » acha «Implante») → número | null.
 */
export function ticketDoServico(ticket, servico) {
  if (!ticket || typeof ticket !== "object" || !servico) return null;
  const alvo = semAcento(String(servico).replace(/\s+/g, " ").trim());
  for (const [nome, v] of Object.entries(ticket)) {
    if (semAcento(String(nome).replace(/\s+/g, " ").trim()) === alvo) { const n = Number(v); return Number.isFinite(n) ? n : null; }
  }
  return null;
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
// plano 2000d · PX-007: o mês por nome (completo ou abreviado, sem acento) → número
const MES_POR_NOME = Object.freeze({ jan: 1, janeiro: 1, fev: 2, fevereiro: 2, mar: 3, marco: 3, abr: 4, abril: 4, mai: 5, maio: 5, jun: 6, junho: 6,
  jul: 7, julho: 7, ago: 8, agosto: 8, set: 9, setembro: 9, out: 10, outubro: 10, nov: 11, novembro: 11, dez: 12, dezembro: 12 });
// plano 2000d · DR-200: mdy = a coluna está no formato americano (MM/DD/AAAA) — ver formatoDatasColuna
export function lerData(s, { passado = false, agora = new Date(), mdy = false } = {}) {
  const t = String(s ?? "").trim();
  let a, m, d;
  // plano 1500c · RX-008: também «2026/10/21» (planilha exportada de sistema) e «21/10/2026 14:30» (data com hora) — a hora é ignorada
  // plano 2000d · PX-005: também «2020.02.01» (AAAA.MM.DD, exportação de banco/ERP)
  let r = /^(\d{4})([-/.])(\d{1,2})\2(\d{1,2})(?:[T\s].*)?$/.exec(t);       // plano 1500c · RC-004: depois da data só hora — «1990-12-31abc» não é data
  const mw = /^(\d{1,2})(?:\s+de\s+|\s+|[/.-])([a-zç]+)\.?(?:\s+de\s+|\s+|[/.-])(\d{4}|\d{2})$/.exec(semAcento(t));
  if (r) { a = +r[1]; m = +r[3]; d = +r[4]; }
  // plano 2000d · PX-006: «20200201» (AAAAMMDD, sem separador) — só ano entre 1900 e 2100, para não confundir com outro número
  else if ((r = /^((?:19|20)\d{2}|2100)(\d{2})(\d{2})$/.exec(t))) { a = +r[1]; m = +r[2]; d = +r[3]; }
  // plano 2000d · PX-007: o mês por extenso ou abreviado («31 de dezembro de 1990», «31 dez 1990», «31/dez/90»)
  else if (mw && MES_POR_NOME[mw[2]]) {
    d = +mw[1]; m = MES_POR_NOME[mw[2]]; a = +mw[3];
    if (mw[3].length === 2) a += passado ? (a > new Date(agora).getUTCFullYear() % 100 ? 1900 : 2000) : (a >= 30 ? 1900 : 2000);
  }
  // plano 2000d · PX-004: a hora também como «às 14:30», «14h30», «14h» ou «- 14:30» — a data continua valendo
  else if ((r = /^(\d{1,2})[/.-](\d{1,2})[/.-](\d{4}|\d{2})(?:,?\s+(?:(?:às|as|-)\s*)?\d{1,2}(?:[:h]\d{2}(?::\d{2})?h?|h))?$/i.exec(t))) {
    d = +r[1]; m = +r[2]; a = +r[3];
    if (mdy) [d, m] = [m, d];      // plano 2000d · DR-200
    // plano 1000b · RB-249: data que só pode estar no passado (nascimento): ano de 2 dígitos acima do ano atual é do século passado («05/03/28» → 1928)
    if (r[3].length === 2) a += passado ? (a > new Date(agora).getUTCFullYear() % 100 ? 1900 : 2000) : (a >= 30 ? 1900 : 2000);
  } else if (/^\d{5}$/.test(t) && (passado ? +t >= 10000 : (+t > 20000 && +t < 80000))) {
    const dt = new Date(Date.UTC(1899, 11, 30) + Number(t) * 86400000);     // série do Excel: dias desde 30/12/1899
    const iso = dt.toISOString().slice(0, 10);
    // plano 1500c · RC-012: data que só pode estar no passado (nascimento) aceita a série de 1900 até hoje — fora disso não é data
    if (passado && (iso < "1900-01-01" || iso > fmtDiaSP.format(new Date(agora)))) return null;
    return iso;
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
  // plano 2000d · PX-069: parado há muito tempo fala em meses/anos («há 3 meses na etapa», não «há 97 dias»)
  if (d >= 60) return `${tempoLongo(d)} na etapa`;
  return d === 1 ? "há 1 dia na etapa" : `há ${d} dias na etapa`;
}
/** plano 2000d · PX-069/070: 60+ dias → «há N meses»; 365+ → «há N ano(s)». */
function tempoLongo(d) {
  if (d >= 365) { const a = Math.floor(d / 365); return `há ${a} ${a === 1 ? "ano" : "anos"}`; }
  return `há ${Math.floor(d / 30)} meses`;
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
    // plano 2000d · DR-036: rolagem vertical lenta (dedo descendo devagar, < 10 px no total antes dos 350 ms) também é rolagem — 8 px na vertical já bastam
    if (dist2(s.x0, s.y0, x, y) > TOQUE.LIMIAR_ROLAGEM || Math.abs(y - s.y0) > 8) return { ...s, estado: "rolando", acao: "rolar" };
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
  // plano 1500c · RC-033: «Anúncio · Instagram» / «Anúncio · Facebook» em vez de «Anúncio» genérico
  const NOME_PLAT = { instagram: "Instagram", facebook: "Facebook", tiktok: "TikTok", youtube: "YouTube", linkedin: "LinkedIn" };
  const plataforma = c.plataforma === "google" ? "Google Ads" : c.plataforma === "meta" ? "Meta Ads"
    : c.plataforma ? `Anúncio · ${NOME_PLAT[String(c.plataforma).toLowerCase()] || String(c.plataforma)}` : null;
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
/** plano 1500c · RC-014/017/051: o compromisso em minúsculas a partir do vocab (ou «consulta» sem vocab). */
export function palavraCompromisso(vocab) {
  if (!vocab) return "consulta";
  if (vocab.compromisso) return String(vocab.compromisso).toLowerCase();
  return nomeCompromisso(vocab.vertical);
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
  youtube: "YouTube", tiktok: "TikTok", tt: "TikTok", linkedin: "LinkedIn", kwai: "Kwai", whatsapp: "WhatsApp", wa: "WhatsApp", bing: "Bing",
  // plano 2000d · PX-061: as fontes de anúncio comuns no utm_source («google_ads», «meta_ads», «fb_ads», «adwords»)
  google_ads: "Google Ads", googleads: "Google Ads", adwords: "Google Ads", meta: "Meta", meta_ads: "Meta Ads", fb_ads: "Facebook Ads", facebook_ads: "Facebook Ads",
  ig_ads: "Instagram Ads", instagram_ads: "Instagram Ads", tiktok_ads: "TikTok Ads", email: "E-mail", newsletter: "Newsletter" });
// plano 2000d · PX-061: fonte desconhecida com «_»/«-» vira palavras («minha_loja» → «Minha loja»), não «Minha_loja»
export function nomeFonte(s) { const t = String(s || "").trim(); return NOME_FONTE[t.toLowerCase()] || NOME_FONTE[t.toLowerCase().replace(/[-\s]+/g, "_")] || capitalizar(t.replace(/[_]+/g, " ").replace(/\s+/g, " ")); }
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
export const ORDEM_COLUNA = Object.freeze({ nome: "nome", ultimo_contato_em: "ultimo_contato", criado_em: "recentes" /* plano 2000d · DR-166 */ });
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
  // plano 1500c · RC-034: ISO com Z/deslocamento é um instante — mostra na hora de São Paulo (antes: a hora UTC, «00h» do dia seguinte)
  if (/[T ]\d{2}:\d{2}(:\d{2}(\.\d+)?)?(Z|[+-]\d{2}:?\d{2})$/.test(t) && Number.isFinite(Date.parse(t))) {
    const p = Object.fromEntries(new Intl.DateTimeFormat("en-GB", { timeZone: "America/Sao_Paulo", year: "numeric", month: "2-digit", day: "2-digit", hour: "2-digit", minute: "2-digit", hour12: false })
      .formatToParts(new Date(t)).map(x => [x.type, x.value]));
    return `${p.day}/${p.month}/${p.year} às ${String(p.hour).replace(/^24$/, "00")}:${p.minute}`;
  }
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
 * plano 1500c · RC-333: depois da recarga, os movimentos ainda não confirmados voltam ao destino (a tela não «pula»).
 * Pendente cujo cartão não veio na recarga (outra pessoa excluiu/moveu de funil) é deixado de fora — nunca recria o cartão.
 * → {colunas, sumidos:[ids]}
 */
export function reaplicarPendentes(colunas, pendentes) {
  let cols = colunas;
  const sumidos = [];
  for (const mov of pendentes || []) {
    if (!mov || !(cols || []).some(c => (c.itens || []).some(x => x.id === mov.id))) { if (mov) sumidos.push(mov.id); continue; }
    cols = moverLocal(cols, mov.id, mov.estagioId, mov.pos, mov.ordem, mov.patch);
  }
  return { colunas: cols, sumidos };
}
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
export { LIMITE_VISOES_CRM };      // plano 1500c · RC-145: o modal de salvar diz «N de 12 usados»
/** plano 1500c · RC-139: renomeia um filtro salvo sem mexer nos dados dele → o mesmo formato de salvarVisaoCRM. */
export function renomearVisaoCRM(visoes, tela, id, nome, o = {}) {
  const item = normalizarVisoesCRM(visoes, tela).find(v => v.id === id);
  if (!item) return { ok: false, codigo: "nao_encontrada", visoes: normalizarVisoesCRM(visoes, tela) };
  return salvarVisaoCRM(visoes, tela, { id, nome, dados: item.dados }, o);
}
/** plano 1500c · RC-138: devolve um filtro salvo excluído à MESMA posição (o «Desfazer»). */
export function reporVisaoCRM(visoes, tela, item, posicao) {
  const atuais = normalizarVisoesCRM(visoes, tela).filter(v => v.id !== (item && item.id));
  if (!item) return atuais;
  const i = Math.max(0, Math.min(Number.isInteger(posicao) ? posicao : atuais.length, atuais.length));
  return normalizarVisoesCRM([...atuais.slice(0, i), item, ...atuais.slice(i)], tela);
}
/** plano 1500c · RC-143: o exemplo do valor do filtro de campo pelo tipo. */
export function exemploValorFiltro(tipo) {
  return { moeda: "Ex.: 1.500,00", numero: "Ex.: 10", telefone: "Ex.: 12 99999-0000", email: "Ex.: ana@", url: "Ex.: site.com" }[tipo] || "Valor";
}
/** plano 1500c · RC-142: valor de filtro de campo data — aceita o formato antigo «31/12/2026» e devolve AAAA-MM-DD (ou "" se não for data). */
export function dataParaFiltro(v) {
  const s = String(v ?? "").trim();
  if (!s) return "";
  if (/^\d{4}-\d{2}-\d{2}$/.test(s)) return s;
  return lerData(s) || "";
}
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
    // plano 1500c · RC-030: ids em ordem fixa — marcar Retorno e depois Urgência casa com a visão Urgência+Retorno
    const ids = Array.isArray(f.etiquetas.ids) ? [...new Set(f.etiquetas.ids.filter(idVisaoSeguro))].slice(0, 30).sort((x, y) => String(x).localeCompare(String(y), "en", { numeric: true })) : [];
    if (ids.length) o.etiquetas = { op: ["alguma", "todas", "nenhuma"].includes(f.etiquetas.op) ? f.etiquetas.op : "alguma", ids };
  }
  if (Array.isArray(f.origem)) {
    const origem = [...new Set(f.origem.filter(x => ORIGENS_VISAO.has(x)))].sort();      // plano 1500c · RC-030
    if (origem.length) o.origem = origem;
  }
  if (tela === "kanban") {
    for (const k of ["valor_min", "valor_max"]) if (f[k] !== "" && f[k] != null && Number.isFinite(Number(f[k])) && Number(f[k]) >= 0) o[k] = Number(f[k]);
    if (o.valor_min != null && o.valor_max != null && o.valor_min > o.valor_max) { delete o.valor_min; delete o.valor_max; }
    if (o.valor_min === 0) delete o.valor_min;      // plano 1500c · RC-059/273: mínimo zero não filtra nada
    // plano 1500c · RC-324: ciclos longos (60/90 dias)
    if ([3, 7, 15, 30, 60, 90].includes(Number(f.parado_dias))) o.parado_dias = Number(f.parado_dias);
    if (dataISOVisao(f.criado_de)) o.criado_de = f.criado_de;
    if (dataISOVisao(f.criado_ate)) o.criado_ate = f.criado_ate;
    // plano 2000d · DR-024/025/027: os filtros novos vão e voltam com a visão salva e com o link
    if (f.nao_lidas === true) o.nao_lidas = true;
    if (typeof f.servico === "string" && f.servico.trim()) o.servico = f.servico.trim().slice(0, 120);
    if (["quente", "morno", "frio"].includes(f.temperatura)) o.temperatura = f.temperatura;
    if (typeof f.campanha === "string" && f.campanha.trim()) o.campanha = f.campanha.trim().slice(0, 160);      // plano 2000d · DR-026
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
    const nome = typeof item.nome === "string" ? item.nome.trim().replace(/\s+/g, " ").slice(0, 32) : "";      // plano 1500c · RC-047
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
/**
 * plano 1500c · RC-327: «Copiar link com estes filtros» — o filtro do quadro (já limpo por filtroDaVisao: sem a busca digitada, só ids e datas)
 * vira um texto base64url para o ?f= da rota. → "" quando não há filtro.
 */
export function filtroParaLink(filtro) {
  const f = filtroDaVisao(filtro, "kanban");
  if (!Object.keys(f).length) return "";
  const bytes = new TextEncoder().encode(JSON.stringify(f));
  let bin = "";
  for (const b of bytes) bin += String.fromCharCode(b);
  return btoa(bin).replace(/\+/g, "-").replace(/\//g, "_").replace(/=+$/, "");
}
/** plano 1500c · RC-327: o ?f= do link → filtro do quadro (passado de novo por filtroDaVisao); texto estranho → null. */
export function filtroDoLink(texto) {
  if (typeof texto !== "string" || !texto || texto.length > 4000 || !/^[A-Za-z0-9_-]+$/.test(texto)) return null;
  try {
    const b64 = texto.replace(/-/g, "+").replace(/_/g, "/") + "===".slice((texto.length + 3) % 4);
    const bin = atob(b64);
    const bytes = Uint8Array.from(bin, c => c.charCodeAt(0));
    const f = filtroDaVisao(JSON.parse(new TextDecoder().decode(bytes)), "kanban");
    return Object.keys(f).length ? f : null;
  } catch { return null; }
}
export function validarNomeVisaoCRM(nome, visoes = [], ignorarId = null) {
  const limpo = String(nome ?? "").trim().replace(/\s+/g, " ");
  if (limpo.length < 2 || limpo.length > 32) return { ok: false, codigo: "nome_invalido" };
  const chave = semAcento(limpo);
  // plano 1500c · RC-047: o nome guardado também com espaços juntados («Retorno  semana» = «Retorno semana»)
  if (visoes.some(v => v.id !== ignorarId && semAcento(String(v.nome || "").trim().replace(/\s+/g, " ")) === chave)) return { ok: false, codigo: "nome_duplicado" };
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
        // plano 1500c · RC-079: também o e-mail do contato e o nome da empresa (o servidor precisa da mesma regra em nx_negocios_kanban)
        const alvo = semAcento([c.titulo, c.nome, c.servico, c.contato && c.contato.nome, c.email, c.contato && c.contato.email, c.empresa_nome, c.contato && c.contato.empresa_nome].filter(Boolean).join(" "));
        if (!alvo.includes(qn)) return false;
      }
    }
    if (f.dono === "eu") { if (c.dono_id !== eu) return false; }
    else if (f.dono === "sem") { if (c.dono_id) return false; }
    // plano 1500c · RX-024: o id do responsável e das etiquetas vem do link/visão salva como texto («7») e do servidor como número (7) — compara como texto
    else if (f.dono) { if (String(c.dono_id ?? "") !== String(f.dono)) return false; }
    if (ids.length) {
      const tem = new Set((c.etiquetas || []).map(String));
      const n = ids.filter(i => tem.has(String(i))).length;
      if (op === "alguma" && n === 0) return false;
      if (op === "todas" && n !== ids.length) return false;
      if (op === "nenhuma" && n > 0) return false;
    }
    // plano 1000b · RB-082: a mesma regra do servidor — veio de anúncio quem tem plataforma (Meta/Google), mesmo com origem «whatsapp»
    if (Array.isArray(f.origem) && f.origem.length && !f.origem.includes(c.origem) && !(c.plataforma && f.origem.includes("anuncio"))) return false;
    if (f.status && f.status !== "todos" && c.status !== f.status) return false;
    const v = valorCard(c);      // plano 1500c · RX-025: a mesma régua do valor mostrado no cartão (aberto = previsto; ganho = final ?? previsto)
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
  // plano 2000d · DR-238: nomes de quem usa, não de quem programa («Texto grande», «Sim ou não», «Lista: uma opção / várias opções»)
  texto: "Texto curto", texto_longo: "Texto grande (vários parágrafos)", numero: "Número", moeda: "Dinheiro (R$)", data: "Data", opcao: "Lista: uma opção",
  multi: "Lista: várias opções", sim_nao: "Sim ou não", telefone: "Telefone", email: "E-mail", url: "Link",
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
    // plano 2000d · PX-053: « Ana @ x.com » vale (o normalizarCampo grava «ana@x.com») — antes o espaço em volta do @ reprovava
    case "email": return /^[^@\s]+@[^@\s]+\.[^@\s]+$/.test(String(s).trim().replace(/\s*@\s*/, "@")) ? null : "E-mail inválido.";
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
    // plano 1500c · RC-031: conta caracteres (code points) como o servidor — emoji conta 1
    case "texto": return [...String(s)].length > 500 ? "Máximo de 500 caracteres." : null;
    case "texto_longo": return [...String(s)].length > 5000 ? "Máximo de 5.000 caracteres." : null;
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
  // plano 1500c · RX-017: planilha em inglês («Yes», «Y», «No») e o «x» de marcar coluna
  // plano 2000d · PX-052: as marcas de planilha «✓», «✔», «☑» (sim) e «✗», «✘», «☐» (não)
  if (["sim", "s", "true", "1", "verdadeiro", "yes", "y", "x", "ok", "✓", "✔", "☑"].includes(t)) return true;
  if (["nao", "n", "false", "0", "falso", "no", "✗", "✘", "☐"].includes(t)) return false;
  // plano 2000d · PX-080: a frase da coluna de consentimento — «Sim, aceito», «Não aceita», «Aceito», «Recusou», «Não quer»
  if (/^nao\b/.test(t) || /^(recus|nega|nao quer)/.test(t)) return false;
  if (/^sim\b/.test(t) || /^(aceit|autoriz|concord)/.test(t)) return true;
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
    case "email": return String(valor).trim().replace(/\s*@\s*/, "@").toLowerCase();      // plano 2000d · PX-053: e-mail do campo personalizado sem espaço e em minúsculas
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
  // plano 1500c · RX-023: data no chip em DD/MM/AAAA e moeda em reais («Retorno maior que 05/11/2026», «Orçamento menor que R$ 1.500,00»)
  const dataBR = x => { const m = /^(\d{4})-(\d{2})-(\d{2})$/.exec(String(x || "")); return m ? `${m[3]}/${m[2]}/${m[1]}` : x; };
  const v = def && def.tipo === "sim_nao" ? (c.valor === "true" ? "sim" : "não")
    : def && def.tipo === "data" ? dataBR(c.valor)
    : def && def.tipo === "moeda" && Number.isFinite(Number(c.valor)) && c.valor !== "" ? fmtBRL.format(Number(c.valor)).replace(/ /g, " ") : c.valor;
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
  const texto = dias === 0 ? `Faz ${idade} ${idade === 1 ? "ano" : "anos"} hoje` : dias === 1 ? `Aniversário amanhã (${idade} ${idade === 1 ? "ano" : "anos"})` : `Aniversário em ${dias} dias (${idade} ${idade === 1 ? "ano" : "anos"})`;      // plano 1500c · RX-004: «(1 ano)»
  return { dias, idade, texto };
}

/** "5512998303030" → "(12) 99830-3030" (igual ao ui.telBR) */
export function formatarTel(digitos) {
  let d = String(digitos ?? "").replace(/\D/g, "");
  if (!d) return "";
  // plano 1500c · RC-013: 8–9 dígitos = número sem DDD — «9 9830-3030», não «+998303030» (parecia de outro país)
  if (d.length === 8) return `${d.slice(0, 4)}-${d.slice(4)}`;
  if (d.length === 9) return `${d.slice(0, 1)} ${d.slice(1, 5)}-${d.slice(5)}`;
  // plano 2000d · PX-020: 0800/0300/0500/0900 — «0800 123 4567», não «+08001234567» (parecia de outro país)
  if (/^0[3589]00\d{6,7}$/.test(d)) return `${d.slice(0, 4)} ${d.slice(4, 7)} ${d.slice(7)}`;
  const br = d.length >= 12 && d.length <= 13 && d.startsWith("55");
  if (br) d = d.slice(2);
  // plano 1000 (CR-264): 10–11 dígitos SEM o 55 que não formam um número brasileiro são de outro país — «+1 2125551234», como na importação
  if ((d.length === 10 || d.length === 11) && (br || pareceBrasileiro(d))) {
    return d.length === 11 ? `(${d.slice(0, 2)}) ${d.slice(2, 7)}-${d.slice(7)}` : `(${d.slice(0, 2)}) ${d.slice(2, 6)}-${d.slice(6)}`;
  }
  // plano 2000d · PX-021: EUA/Canadá (+1 e 10 dígitos) em grupos — «+1 415 555 0100» (depois do teste do número brasileiro: «12 99830-3030» é DDD 12)
  if (/^1[2-9]\d{2}[2-9]\d{6}$/.test(d)) return `+1 ${d.slice(1, 4)} ${d.slice(4, 7)} ${d.slice(7)}`;
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
  // plano 1500c · RC-018/019/044
  cor_etapa: "Cor da etapa inválida: escolha outra cor.", sla_zero: "Prazo: use 1 ou mais (ou deixe vazio para não ter prazo).",
  chance_decrescente: "A chance desta etapa é menor que a da etapa aberta anterior — a previsão do funil fica incoerente.",
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
    return `Preencha o campo «${cp ? cp.rotulo : hint || "obrigatório"}» antes de continuar.`;      // plano 1500c · RC-016: aspas do app
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
  if (it.fonte === "nota") return String(d.texto || "").trim() ? `Nota: ${d.texto}` : "Nota sem texto";      // plano 2000d · PX-017: antes «Nota: » solto
  // plano 1000b · RB-084: sem título, «Criou uma tarefa» (antes: «Criou a tarefa «»»)
  if (it.fonte === "tarefa") {
    const tit = String(d.titulo || "").trim();
    const fez = it.tipo === "tarefa_concluida" ? "Concluiu" : "Criou";
    return tit ? `${fez} a tarefa «${tit}»` : `${fez} uma tarefa`;
  }
  switch (it.tipo) {
    case "negocio_criado": return `Criou ${vocab ? (vocab.art("negocio") === "a" ? "a " : "o ") : "o "}${neg}${d.titulo ? ` «${d.titulo}»` : ""}`;
    // plano 2000d · PX-102: sem a etapa de origem (registro antigo), «Moveu para «X»» — antes «Moveu de «—» para «X»»
    case "estagio": return d.de_nome ? `Moveu de «${d.de_nome}» para «${d.para_nome || "—"}»` : `Moveu para «${d.para_nome || "—"}»`;
    // plano 1000b · RB-044: o termo da vertical é o NOME da etapa («Fechou»/«Não fechou»), não adjetivo — vai entre aspas como está
    case "ganho": return `Marcou como «${vocab ? vocab.ganhar : "Ganho"}»${d.valor != null ? ` · ${brl(d.valor)}` : ""}`;
    case "perdido": return `Marcou como «${vocab ? vocab.perder : "Perdido"}»${d.motivo && motivos[d.motivo] ? ` · ${motivos[d.motivo]}` : ""}${d.texto ? ` — ${d.texto}` : ""}`;
    case "reaberto": return `Reabriu ${vocab ? (vocab.art("negocio") === "a" ? "a " : "o ") : "o "}${neg}`;
    // plano 2000d · PX-101: quando o registro traz quem era antes, a linha diz («Responsável: Ana (antes: Bruno)»)
    case "dono": return d.para ? `Responsável: ${nomeDe(d.para)}${d.de && d.de !== d.para ? ` (antes: ${nomeDe(d.de)})` : ""}` : d.de ? `Ficou sem responsável (antes: ${nomeDe(d.de)})` : "Ficou sem responsável";
    case "conversa_aberta": return `Atendimento ${d.protocolo || ""} aberto`.replace(/\s+/g, " ").trim();
    case "conversa_resolvida": return `Atendimento ${d.protocolo || ""} resolvido`.replace(/\s+/g, " ").trim();
    case "atribuida": return d.para ? `Conversa atribuída a ${nomeDe(d.para)}` : "Conversa ficou sem responsável";
    case "etiqueta": {
      // plano 1500c · RC-015: diz quais etiquetas entraram e saíram quando o servidor manda
      const lst = x => (Array.isArray(x) ? x.map(e => (e && typeof e === "object" ? e.nome : e)).filter(Boolean) : []);
      const mais = lst(d.adicionadas), menos = lst(d.removidas);
      const partes = [...mais.map(n => `+ ${n}`), ...menos.map(n => `− ${n}`)];
      return partes.length ? `Etiquetas: ${partes.join(", ")}` : "Etiquetas alteradas";
    }
    // plano 2000d · PX-103: com o nome do arquivo no registro, ele aparece («Veio da importação da planilha «clientes.csv»»)
    case "importado": return d.arquivo ? `Veio da importação da planilha «${String(d.arquivo).slice(0, 80)}»` : "Veio da importação de planilha";
    case "automacao": return `Automação${d.nome ? ` «${d.nome}»` : ""} executada`;
    case "contato_mesclado": return "Cadastros duplicados foram unidos";
    // plano 100 · C6: nx_agenda_presenca grava {presenca, consulta_em, estagio_id}
    // plano 1500c · RC-014: a palavra do compromisso da vertical (consulta · visita · entrega)
    case "presenca": { const cp = palavraCompromisso(vocab); return d.presenca === "faltou" ? `Faltou à ${cp}` : d.presenca === "compareceu" ? `Compareceu à ${cp}` : `Presença da ${cp} limpa`; }
    // plano 1500c · RC-015: tipo que a tela não conhece não aparece cru («stage x»)
    default: return "Atualização";
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
  // plano 1500c · RX-022: com muitas etiquetas o chip não estoura a linha — «A, B, C e mais 4»
  const todos = (nomes || []).filter(Boolean);
  const lista = todos.length > 3 ? `${todos.slice(0, 3).join(", ")} e mais ${todos.length - 3}` : todos.join(", ");
  if (op === "todas") return `Tem todas: ${lista}`;
  if (op === "nenhuma") return `Sem nenhuma de: ${lista}`;
  return `Tem alguma de: ${lista}`;
}

/**
 * plano 1000b · RB-042/136: exemplos por vertical — o título do negócio novo, o vazio dos campos de negócio, o placeholder do rótulo do campo e o
 * vazio das etiquetas (a oficina não vê «Implante superior» nem «dentista responsável»). Vertical desconhecida → genérico.
 */
const EXEMPLOS_VERTICAL = Object.freeze({
  // plano 1500c · RC-160: camposContato/campoContato — os exemplos dos campos de CONTATO também são da vertical (antes «convênio» para todos)
  odonto: { titulo: "Implante superior", campos: "dentista responsável, dentes", campo: "Dentista responsável", etiquetas: "Implante, Urgência", camposContato: "convênio, como conheceu, preferência de horário", campoContato: "Convênio" },
  oficina: { titulo: "Gol 2015 — troca de embreagem" /* plano 2000d · DR-148: veículo no título */, campos: "placa, quilometragem", campo: "Placa do veículo", etiquetas: "Revisão, Urgente", camposContato: "placa, modelo do carro, ano", campoContato: "Modelo do carro" },
  loja: { titulo: "Kit presente", campos: "tamanho, forma de entrega", campo: "Tamanho", etiquetas: "Presente, Atacado", camposContato: "tamanho, preferência de contato, aniversário do cliente", campoContato: "Tamanho" },
  generico: { titulo: "Proposta mensal", campos: "prazo de entrega, plano escolhido", campo: "Plano escolhido", etiquetas: "Prioridade, Retorno", camposContato: "como conheceu, cargo, preferência de horário", campoContato: "Como conheceu" },
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
  // plano 1500c · RX-067: com busca E filtros, diz as duas coisas («para «ana» com esses filtros») — a pessoa sabe o que tirar
  return q && filtroVazio(f) ? `Nada encontrado para «${q}».` : q ? `Nada encontrado para «${q}» com esses filtros.` : "Nada encontrado com esses filtros.";
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
  let ultimaChance = null;
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
      if (Number.isFinite(s) && s <= 0) add(i, "sla_horas", "sla_zero");       // plano 1500c · RC-044: «0» não é «sem prazo»
      else if (!Number.isInteger(s) || s < 1 || s > 2160) add(i, "sla_horas", "sla");
    }
    // plano 1500c · RC-018: cor fora de #rrggbb (cópia antiga, valor do banco) deixava a etapa sem cor no quadro
    if (e.cor !== null && e.cor !== undefined && e.cor !== "" && !/^#[0-9a-f]{6}$/i.test(String(e.cor))) add(i, "cor", "cor_etapa");
    // plano 1500c · RC-019: chance de uma etapa aberta menor que a da aberta anterior — só aviso (nivel «aviso» não bloqueia salvar)
    if (tipo === "aberto" && e.marco !== "faltou" && e.probabilidade !== null && e.probabilidade !== undefined && e.probabilidade !== "") {
      const p = Number(e.probabilidade);
      if (Number.isFinite(p) && ultimaChance !== null && p < ultimaChance) erros.push({ indice: i, campo: "probabilidade", hint: "chance_decrescente", nivel: "aviso", texto: DICAS_FUNIL.chance_decrescente });
      if (Number.isFinite(p)) ultimaChance = p;
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
export function textoMarcosFaltando(lista, { vocab = null } = {}) {
  let l = Array.isArray(lista) ? lista : [];
  if (!l.length) return "";
  // plano 1500c · RC-017: na oficina é «Aprovado/Recusado» e «visita»; na loja «Vendido/Não comprou» e «entrega»
  if (vocab) {
    const g = vocab.ganhar || "Ganho", p = vocab.perder || "Perdido", cp = palavraCompromisso(vocab);
    const neg = typeof vocab.min === "function" ? vocab.min("negocio") : "negócio";
    const novo = { fechou: { rotulo: g, efeito: `a automação não vai conseguir mover para «${g}»` },
      nao_fechou: { rotulo: p, efeito: `a automação não vai conseguir mover para «${p}»` },
      faltou: { rotulo: "Faltou", efeito: `a presença «Faltou» da ${cp} não vai mover ${vocab.art && vocab.art("negocio") === "a" ? "a" : "o"} ${neg}` },
      agendada: { rotulo: "Agendou", efeito: `marcar a ${cp} não vai mudar a etapa` } };
    l = l.map(x => ({ ...x, ...(novo[x.marco] || {}) }));
  }
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
  // plano 1500c · RX-068: número com ponto de milhar («12.345 criados»), como o resto da tela
  const p = (n, um, varios) => `${Number(n || 0).toLocaleString("pt-BR")} ${n === 1 ? um : varios}`;
  return [p(s.criados, "criado", "criados"), p(s.atualizados, "atualizado", "atualizados"), p(s.ignorados, "ignorado", "ignorados"),
    p(s.erros.length, "erro", "erros")].join(" · ");
}

/** Decodifica o arquivo: UTF-8; se aparecer o caractere de substituição (planilha salva em ANSI), tenta Windows-1252. */
export function decodificarArquivo(bytes, Decodificador = globalThis.TextDecoder) {
  // plano 1500c · RC-010: «Texto Unicode» do Excel = UTF-16 com BOM (FF FE / FE FF) ou sem BOM com zeros alternados
  const b = bytes instanceof Uint8Array ? bytes : new Uint8Array(bytes && bytes.buffer ? bytes.buffer : bytes || []);
  let utf16 = b.length >= 2 && b[0] === 0xff && b[1] === 0xfe ? "utf-16le" : b.length >= 2 && b[0] === 0xfe && b[1] === 0xff ? "utf-16be" : null;
  if (!utf16 && b.length >= 8) {
    let par = 0, impar = 0;
    const n = Math.min(b.length, 400);
    for (let i = 0; i < n; i++) if (b[i] === 0) { if (i % 2) impar++; else par++; }
    if (impar > n * 0.3 && par === 0) utf16 = "utf-16le"; else if (par > n * 0.3 && impar === 0) utf16 = "utf-16be";
  }
  if (utf16) {
    try { return { texto: new Decodificador(utf16).decode(b).replace(/^﻿/, ""), codificacao: utf16 }; } catch { /* segue para UTF-8 */ }
  }
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
  // plano 1500c · RC-020: «Último contato» e «Total ganho» entram quando nx_contatos_exportar devolver os campos (servidor antigo: colunas fora)
  const temUltimo = (itens || []).some(k => k && k.ultimo_contato_em !== undefined);
  const temTotal = (itens || []).some(k => k && k.total_ganho !== undefined);
  const cabecalho = ["Nome", "Telefone", "E-mail", "Empresa", "Cidade", "UF", "Nascimento", "CPF/CNPJ", "Origem", "Etiquetas",
    "Responsável", "Aceita marketing", "Cadastrado em", "Observação", ...(temUltimo ? ["Último contato"] : []), ...(temTotal ? ["Total ganho"] : []), ...extras.map(c => c.rotulo)];
  // plano 1500c · RC-048: moeda com 2 casas e vírgula decimal, sem milhar (o Excel soma); número com até 2 casas
  const numeroCSV = (v, moeda) => {
    const n = typeof v === "number" ? v : lerNumero(v);
    if (n === null || !Number.isFinite(n)) return String(v);
    return (moeda ? n.toFixed(2) : String(Math.round(n * 100) / 100)).replace(".", ",");
  };
  const valorCampo = (c, v) => {
    if (v === null || v === undefined || v === "") return "";
    if (Array.isArray(v)) return v.join("; ");
    if (typeof v === "boolean") return v ? "Sim" : "Não";
    if (c.tipo === "data") return dataCurtaCSV(v);
    if (c.tipo === "telefone") return formatarTel(v);
    if (c.tipo === "moeda" || c.tipo === "numero") return numeroCSV(v, c.tipo === "moeda");
    return String(v);
  };
  const linhas = (itens || []).map(k => [
    k.nome || "", k.telefone ? formatarTel(k.telefone) : "", k.email || "", k.empresa_nome || "", k.cidade || "", k.uf || "",
    // plano 2000d · PX-012: CPF/CNPJ com a máscara — só dígitos o Excel lê como número e some o zero da frente («01234567890» → 1234567890)
    dataCurtaCSV(k.nascimento), k.documento ? formatarDoc(k.documento) : "", ROTULO_ORIGEM[k.origem] || k.origem || "",
    (k.etiquetas_nomes || []).join("; "), k.dono_nome || "",
    k.optin_marketing === true ? "Sim" : k.optin_marketing === false ? "Não" : "", dataCurtaCSV(k.criado_em), k.obs || "",
    ...(temUltimo ? [dataCurtaCSV(k.ultimo_contato_em)] : []), ...(temTotal ? [k.total_ganho == null ? "" : numeroCSV(k.total_ganho, true)] : []),
    ...extras.map(c => valorCampo(c, (k.campos || {})[c.chave])),
  ]);
  return { cabecalho, linhas };
}

/* ------------------------------------------------------------ listas do celular (M28) */
/** plano 1500c · RC-127/237: exemplo do título da tarefa pela vertical e pelo tipo. */
export function exemploTarefa(vertical, tipo = "tarefa") {
  const cp = nomeCompromisso(vertical);
  const coisa = { odonto: "a avaliação", oficina: "o orçamento", loja: "o pedido" }[vertical] || "a proposta";
  switch (tipo) {
    case "whatsapp": return `Mandar mensagem sobre ${coisa}`;
    case "email": return `Enviar ${coisa} por e-mail`;
    case "reuniao": return `Reunião para apresentar ${coisa}`;
    case "visita": return vertical === "loja" ? "Visitar o cliente para mostrar as novidades" : `Confirmar a ${cp} da semana`;
    default: return `Ligar para confirmar ${coisa}`;
  }
}
/**
 * plano 1500c · RC-286: a etapa aberta para «Reabrir» — a de onde o negócio saiu na última vez que foi para uma etapa fechada
 * (evento «estagio» da linha do tempo: dados.de / de_id / de_nome). Sem histórico útil → null (quem chama usa a 1ª etapa).
 */
export function etapaParaReabrir(tempo, estagios) {
  const ests = (estagios || []).filter(Boolean);
  const achar = (id, nome) => ests.find(e => (id != null && String(e.id) === String(id))) || (nome ? ests.find(e => e.nome === nome) : null) || null;
  const eventos = (tempo || []).filter(it => it && it.tipo === "estagio" && it.dados)
    .sort((a, b) => (Date.parse(b.em || b.criado_em || "") || 0) - (Date.parse(a.em || a.criado_em || "") || 0));
  for (const it of eventos) {
    const d = it.dados;
    const para = achar(d.para ?? d.para_id, d.para_nome);
    const de = achar(d.de ?? d.de_id, d.de_nome);
    if (para && para.tipo !== "aberto" && de && de.tipo === "aberto") return de;
    if (para && para.tipo === "aberto") return para;
  }
  return null;
}
/** plano 1500c · RC-315: « por Ana em 10/10» quando o servidor manda bloqueado_por/bloqueado_em; sem os dados, "". */
export function textoBloqueio(c, { usuario = null, data = x => String(x).slice(0, 10) } = {}) {
  if (!c) return "";
  const quem = c.bloqueado_por_nome || (c.bloqueado_por != null && typeof usuario === "function" ? (usuario(c.bloqueado_por) || {}).nome : null);
  const quando = c.bloqueado_em && Number.isFinite(Date.parse(c.bloqueado_em)) ? data(c.bloqueado_em) : null;
  return `${quem ? ` por ${quem}` : ""}${quando ? ` em ${quando}` : ""}`;
}
/**
 * plano 1500c · RC-334: repete `chamar()` até `terminou(r)`, no máximo `max` voltas, parando quando `continuar()` for falso
 * (a tela saiu). `aoProgresso(r)` a cada volta que não terminou. → a última resposta.
 */
export async function repetirAteTerminar(chamar, { terminou, continuar = () => true, max = 400, aoProgresso = null } = {}) {
  let r, voltas = 0;
  do {
    r = await chamar();
    if (terminou(r)) break;
    if (aoProgresso) aoProgresso(r);
  } while (++voltas < max && continuar());
  return r;
}
/** plano 1500c · RC-318: onde o «Desfazer» devolve a etapa removida — logo depois da vizinha que estava acima (pelo _k); sem ela, o índice antigo. */
export function posicaoDesfazer(etapas, antesK, indiceAntigo) {
  const lista = etapas || [];
  if (antesK == null) return 0;
  const i = lista.findIndex(e => e && e._k === antesK);
  return i >= 0 ? i + 1 : Math.min(Number(indiceAntigo) || 0, lista.length);
}
/** plano 1500c · RC-283: a previsão de fechamento (AAAA-MM-DD) já passou do dia de hoje (SP)? */
export function previsaoVencida(previsao, hojeIso = null) {
  const p = String(previsao || "").slice(0, 10);
  if (!/^\d{4}-\d{2}-\d{2}$/.test(p)) return false;
  const hoje = /^\d{4}-\d{2}-\d{2}/.test(String(hojeIso || "")) ? String(hojeIso).slice(0, 10) : fmtDiaSP.format(new Date());      // plano 1500c · RX-003: fmtDiaSP é um Intl.DateTimeFormat (chamado direto, lançava)
  return p < hoje;
}
/** plano 1500c · RC-287: centavos só quando o valor tem centavos (R$ 1.500 · R$ 1.500,50) — a mesma régua no cartão e na gaveta. */
export function temCentavos(v) {
  const n = Number(v);
  return Number.isFinite(n) && Math.round(n * 100) % 100 !== 0;
}
/**
 * plano 1500c · RC-257: abertos por responsável nos cartões carregados → {linhas:[{dono_id, n, valor, ponderado}], parcial}
 * (ponderado = valor × chance da etapa; ordem: maior valor primeiro; «sem responsável» por último). parcial = alguma coluna aberta tem mais que o carregado.
 */
export function resumoPorPessoa(colunas, estagios) {
  const est = new Map((estagios || []).map(e => [e.id, e]));
  const m = new Map();
  let parcial = false;
  for (const c of colunas || []) {
    const e = est.get(c && c.estagio_id);
    if (!e || e.tipo !== "aberto") continue;
    const itens = Array.isArray(c.itens) ? c.itens : [];
    if ((Number(c.total) || 0) > itens.length) parcial = true;
    const chance = Number.isFinite(Number(e.probabilidade)) ? Number(e.probabilidade) / 100 : 0;
    for (const x of itens) {
      const id = x && x.dono_id != null && x.dono_id !== "" ? x.dono_id : null;
      const r = m.get(id) || { dono_id: id, n: 0, valor: 0, ponderado: 0 };
      const v = valorCard(x);
      r.n++; r.valor += v; r.ponderado += v * chance;
      m.set(id, r);
    }
  }
  const linhas = [...m.values()].map(r => ({ ...r, valor: Math.round(r.valor * 100) / 100, ponderado: Math.round(r.ponderado * 100) / 100 }))
    .sort((a, b) => ((a.dono_id == null) - (b.dono_id == null)) || (b.valor - a.valor) || (b.n - a.n));
  return { linhas, parcial };
}
/**
 * plano 1500c · RC-294: previsão de receita por mês (o «forecast») — abertos carregados agrupados pelo mês de previsao_fechamento
 * → {meses:[{mes:"AAAA-MM", n, valor, ponderado}] (ordem do calendário), semData, parcial}. Sem o campo nos cartões: meses vazio (a tela some).
 */
export function previsaoPorMes(colunas, estagios) {
  const est = new Map((estagios || []).map(e => [e.id, e]));
  const m = new Map();
  let parcial = false, semData = 0;
  for (const c of colunas || []) {
    const e = est.get(c && c.estagio_id);
    if (!e || e.tipo !== "aberto") continue;
    const itens = Array.isArray(c.itens) ? c.itens : [];
    if ((Number(c.total) || 0) > itens.length) parcial = true;
    const chance = Number.isFinite(Number(e.probabilidade)) && e.probabilidade !== null && e.probabilidade !== "" ? Number(e.probabilidade) / 100 : probPadrao(e.tipo) / 100;
    for (const x of itens) {
      const mes = /^(\d{4}-\d{2})-\d{2}/.exec(String((x && x.previsao_fechamento) || ""));
      if (!mes) { semData++; continue; }
      const r = m.get(mes[1]) || { mes: mes[1], n: 0, valor: 0, ponderado: 0 };
      const v = valorCard(x);
      r.n++; r.valor += v; r.ponderado += v * chance;
      m.set(mes[1], r);
    }
  }
  const meses = [...m.values()].sort((a, b) => a.mes.localeCompare(b.mes))
    .map(r => ({ ...r, valor: Math.round(r.valor * 100) / 100, ponderado: Math.round(r.ponderado * 100) / 100 }));
  return { meses, semData, parcial };
}
/** plano 1500c · RC-294: «2026-11» → «nov/2026». */
export function rotuloMes(mes) {
  const r = /^(\d{4})-(\d{2})$/.exec(String(mes || ""));
  if (!r) return String(mes || "");
  const nome = ["jan", "fev", "mar", "abr", "mai", "jun", "jul", "ago", "set", "out", "nov", "dez"][Number(r[2]) - 1];
  return nome ? `${nome}/${r[1]}` : String(mes);      // plano 2000d · PX-075: mês fora de 01–12 («2026-13») volta como veio, não «13/2026» como se fosse válido
}
/** plano 1500c · RC-167: as colunas da prévia da importação — cada destino mapeado uma vez, com o rótulo curto → [{dest, rotulo, campo?}]. */
export function colunasPrevia(mapeados, destinos = []) {
  const CURTO = { telefone: "Telefone", etiquetas: "Etiquetas", documento: "CPF/CNPJ", negocio_valor: "Valor", negocio_titulo: "Título", estagio: "Etapa", obs: "Observação" };
  const rot = new Map((destinos || []).map(d => [d.valor ?? d.chave, String(d.rotulo || "").replace(/^Campo: /, "")]));
  const vistos = new Set();
  const out = [];
  for (const d of mapeados || []) {
    if (!d || d === "sobrenome" || vistos.has(d)) continue;      // o sobrenome já entra junto do nome
    vistos.add(d);
    out.push({ dest: d, rotulo: CURTO[d] || rot.get(d) || d, ...(String(d).startsWith("campo:") ? { campo: String(d).slice(6) } : {}) });
  }
  return out;
}
/** plano 1500c · RC-169: «cerca de 3 min» pela média de ms por linha já feita; < 1 min → «menos de 1 min»; sem base → "". */
export function estimativaRestante(msGastos, feitas, faltam) {
  const ms = Number(msGastos), f = Number(feitas), r = Number(faltam);
  if (!(ms > 0) || !(f > 0) || !(r > 0)) return "";
  const min = (ms / f) * r / 60000;
  if (min < 1) return "menos de 1 min";
  const tot = Math.round(min);      // plano 1500c · RX-009: arredonda ANTES de escolher a unidade — 59,6 min é «cerca de 1 h», não «cerca de 60 min» (nem «1 h 60 min»)
  if (tot < 60) return `cerca de ${tot} min`;
  const hh = Math.floor(tot / 60), mm = tot % 60;
  return `cerca de ${hh} h${mm ? ` ${mm} min` : ""}`;
}
/** plano 1500c · RC-168: anunciar o progresso só ao cruzar cada 10% (não a cada lote de 100 linhas). */
export function marcoProgresso(antes, depois, total) {
  const t = Number(total);
  if (!(t > 0)) return null;
  const a = Math.floor((Number(antes) / t) * 10), d = Math.floor((Number(depois) / t) * 10);
  return d > a && d < 10 ? d * 10 : null;
}
/** plano 1500c · RC-175: «12 linhas · 4 colunas» do texto colado (cabeçalho fora da conta); vazio → "". */
export function contagemColado(texto) {
  const linhas = String(texto || "").split(/\r?\n/).filter(l => l.trim());
  if (!linhas.length) return "";
  // plano 1500c · RX-049: o mesmo separador da leitura (barra vertical, vírgula com «;» dentro de aspas…) e colunas contadas fora das aspas
  const sep = linhas[0].includes("\t") ? "\t" : detectarSeparador(texto);
  const cols = contarFora(linhas[0], sep) + 1;
  const n = Math.max(0, linhas.length - 1);
  return `${n} ${n === 1 ? "linha" : "linhas"} · ${cols} ${cols === 1 ? "coluna" : "colunas"}`;
}
/** plano 1500c · RC-165: funis na configuração — ativos primeiro (ordem, nome); desativados no fim. Não muda a entrada. */
export function ordenarFunisConfig(funis) {
  return (funis || []).slice().sort((a, b) => ((a.ativo === false) - (b.ativo === false)) || ((a.ordem ?? 0) - (b.ordem ?? 0)) || String(a.nome || "").localeCompare(String(b.nome || ""), "pt-BR"));
}
const NOMES_PALETA = Object.freeze(["azul", "azul-claro", "amarelo", "areia", "verde", "salmão", "cinza", "caramelo", "dourado", "lilás", "verde-água", "rosa"]);
/** plano 1500c · RC-149: o nome falado da cor — pela posição na paleta do app (12 cores); fora dela «cor personalizada»; sem cor «sem cor». */
export function nomeCorPaleta(cor, paleta = []) {
  if (!cor) return "sem cor";
  const i = (paleta || []).findIndex(p => String(p).toLowerCase() === String(cor).toLowerCase());
  return i >= 0 && NOMES_PALETA[i] ? NOMES_PALETA[i] : "cor personalizada";
}
/** plano 1500c · RC-148: quanto rolar por quadro ao arrastar perto da borda (40 px): negativo sobe, positivo desce, 0 parado. */
export function velocidadeRolagem(y, altura, borda = 40, max = 14) {
  const Y = Number(y), A = Number(altura);
  if (!Number.isFinite(Y) || !Number.isFinite(A) || A <= 0) return 0;
  if (Y < borda) return -Math.ceil(max * (borda - Math.max(0, Y)) / borda);
  if (Y > A - borda) return Math.ceil(max * (Math.min(A, Y) - (A - borda)) / borda);
  return 0;
}
/** plano 1500c · RC-154: modelos de funil por vertical → [{id, nome, etapas:[{nome, tipo, probabilidade, marco}]}]. */
export function modelosFunil(vertical) {
  const e = (nome, tipo, probabilidade, marco = null) => ({ nome, tipo, probabilidade, marco });
  const fim = (g, p) => [e(g, "ganho", 100, "fechou"), e(p, "perdido", 0, "nao_fechou")];
  const M = {
    odonto: [{ id: "odonto-tratamento", nome: "Tratamento", etapas: [e("Avaliação", "aberto", 20, "agendada"), e("Plano apresentado", "aberto", 45, "orcamento"), e("Em tratamento", "aberto", 80), ...fim("Fechou", "Não fechou")] }],
    oficina: [{ id: "oficina-servico", nome: "Serviço", etapas: [e("Orçamento", "aberto", 25, "orcamento"), e("Aprovação", "aberto", 50), e("Execução", "aberto", 85), e("Entrega", "aberto", 95), ...fim("Aprovado", "Recusado")] }],
    loja: [{ id: "loja-pedido", nome: "Pedido", etapas: [e("Interesse", "aberto", 15), e("Proposta enviada", "aberto", 40, "orcamento"), e("Pagamento", "aberto", 80), e("Entrega", "aberto", 95), ...fim("Vendido", "Desistiu")] }],
  };
  const pos = { id: "pos-venda", nome: "Pós-venda", etapas: [e("Contato de satisfação", "aberto", 30), e("Avaliação pedida", "aberto", 60), ...fim("Voltou", "Não voltou")] };
  return [...(M[vertical] || [{ id: "vendas", nome: "Vendas", etapas: [e("Primeiro contato", "aberto", 15), e("Proposta", "aberto", 40, "orcamento"), e("Negociação", "aberto", 70), ...fim("Ganho", "Perdido")] }]), pos];
}
/** plano 1500c · RC-162: os motivos de perda sugeridos (o «Outro» pede justificativa). */
export function motivosSugeridos(vertical) {
  const meio = { odonto: "Sem urgência agora", oficina: "Vai fazer depois", loja: "Sem urgência agora" }[vertical] || "Sem urgência";
  return [{ nome: "Achou caro" }, { nome: "Fechou com outro" }, { nome: "Sem retorno" }, { nome: meio }, { nome: "Outro", exige_texto: true }];
}
/** plano 1500c · RC-240: o responsável da tarefa nova — o dono do negócio/contato quando está na equipe; senão «eu». */
export function donoSugeridoTarefa(donoId, usuarios, eu) {
  if (donoId != null && donoId !== "" && (usuarios || []).some(u => u && String(u.id) === String(donoId))) return donoId;
  return eu ?? null;
}
/**
 * plano 1500c · RC-131: o texto da nota em pedaços — links http(s) e telefones viram {tipo:"url"|"tel", texto, href}; o resto {tipo:"texto"}.
 * Sem innerHTML: quem desenha cria os <a> com textContent. Telefone = 10 a 13 dígitos com ( ) - espaço ou +.
 */
export function partesNota(texto) {
  const s = String(texto ?? "");
  // plano 1500c · RX-006: o «(» do DDD faz parte do número («(12) 99830-3030» inteiro no link, não «12) 99830-3030»)
  // plano 2000d · PX-013: «www.site.com.br» (sem http) também vira link — com https://
  // plano 2000d · PX-014: e-mail escrito na nota vira {tipo:"email", href:"mailto:…"}
  const re = /(https?:\/\/[^\s<>"«»]+)|((?<![\w.@/-])www\.[^\s<>"«»]+\.[a-z]{2,}[^\s<>"«»]*)|((?<![\w.+-])[a-z0-9._%+-]+@[a-z0-9.-]+\.[a-z]{2,})|(\+?\(?\d[\d\s().-]{8,18}\d)/gi;
  const out = [];
  let ult = 0, m;
  while ((m = re.exec(s))) {
    let txt = m[0], href = null, tipo = null;
    if (m[1]) { txt = txt.replace(/[.,;:!?)\]]+$/, ""); href = txt; tipo = "url"; }
    else if (m[2]) { txt = txt.replace(/[.,;:!?)\]]+$/, ""); href = `https://${txt}`; tipo = "url"; }
    else if (m[3]) { txt = txt.replace(/\.+$/, ""); href = `mailto:${txt}`; tipo = "email"; }
    else {
      const d = txt.replace(/\D/g, "");
      if (d.length < 10 || d.length > 13) continue;
      // plano 1500c · RX-005: CPF («123.456.789-09»), CNPJ e data com hora («2026-10-21 14:30») não são telefone — sem «+», só número brasileiro de verdade
      if (/\d{3}\.\d{3}\.\d{3}-\d{2}|\d{2}\.\d{3}\.\d{3}\/?\d{0,4}|\d{4}-\d{2}-\d{2}|\d{1,2}\/\d{1,2}\/\d{2,4}/.test(txt)) continue;
      if (!txt.trim().startsWith("+") && !normalizarTelefone(txt)) continue;
      href = hrefTel(txt.trim().startsWith("+") ? txt : d); tipo = "tel";
      if (!href) continue;
      // plano 2000d · PX-093: «12 3632-1234 ramal 22» — o ramal entra no link (pausa «,22») e no texto do link
      const rm = /^\s*(?:ramal|ext\.?|r\.)\s*:?\s*(\d{1,6})/i.exec(s.slice(m.index + txt.length));
      if (rm) { txt += rm[0]; href = `${href},${rm[1]}`; }
    }
    if (m.index > ult) out.push({ tipo: "texto", texto: s.slice(ult, m.index) });
    out.push({ tipo, texto: txt, href });
    ult = m.index + txt.length;
    re.lastIndex = ult;
  }
  if (ult < s.length) out.push({ tipo: "texto", texto: s.slice(ult) });
  return out;
}
/** plano 1500c · RC-136: troca só a hora de um valor datetime-local («2026-10-21T09:00» + «14:00»); sem data, usa `diaPadrao`. */
export function trocarHora(valor, hora, diaPadrao = "") {
  const dia = /^\d{4}-\d{2}-\d{2}/.test(String(valor || "")) ? String(valor).slice(0, 10) : String(diaPadrao || "").slice(0, 10);
  return dia && /^\d{2}:\d{2}$/.test(hora) ? `${dia}T${hora}` : String(valor || "");
}
/** plano 1500c · RC-129: concluídas da mais recente para a mais antiga (concluida_em desc); sem data vai ao fim. Não muda a entrada. */
export function ordenarConcluidas(lista) {
  const t = x => { const v = Date.parse(x && x.concluida_em); return Number.isFinite(v) ? v : -Infinity; };
  return (Array.isArray(lista) ? lista.slice() : []).sort((a, b) => t(b) - t(a));
}
/** plano 1500c · RC-130: a nota é longa (merece «Ver mais») — mais de 6 linhas ou ~420 caracteres. */
export function notaLonga(texto) {
  const s = String(texto || "");
  return s.split("\n").length > 6 || s.length > 420;
}
/** plano 1500c · RC-124: quantas páginas (total ÷ tamanho, para cima); sem tamanho conhecido → 0. */
export function paginasDe(total, porPagina) {
  const t = Number(total), p = Number(porPagina);
  return Number.isFinite(t) && Number.isFinite(p) && p > 0 && t > 0 ? Math.ceil(t / p) : 0;
}
/** plano 1500c · RC-121: negócios da empresa — abertos primeiro, depois ganhos e perdidos; dentro do grupo, os mais recentes primeiro. */
export function ordenarNegociosEmpresa(negocios) {
  const peso = n => (!n.status || n.status === "aberto" ? 0 : n.status === "ganho" ? 1 : 2);
  const quando = n => Date.parse(n.atualizado_em || n.fechado_em || n.criado_em || "") || 0;
  return (negocios || []).slice().sort((a, b) => peso(a) - peso(b) || quando(b) - quando(a));
}
/** plano 1500c · RC-117: soma dos negócios ganhos (régua do quadro) → {n, valor}. */
export function totalGanho(negocios) {
  const g = (negocios || []).filter(n => n && n.status === "ganho");
  return { n: g.length, valor: Math.round(g.reduce((s, n) => s + valorCard(n), 0) * 100) / 100 };
}
/** plano 1500c · RC-108: as opções do responsável — quem saiu da equipe (dono_id fora da lista) aparece como «(desativado)», não «Sem responsável». */
export function opcoesResponsavel(usuarios, donoId, nomeDono = null) {
  const lista = (usuarios || []).map(u => ({ valor: u.id, rotulo: u.nome }));
  if (donoId != null && donoId !== "" && !lista.some(o => String(o.valor) === String(donoId))) lista.push({ valor: donoId, rotulo: `${nomeDono || "Pessoa"} (desativado)` });
  return lista;
}
/** plano 1500c · RC-109: as 27 UFs em ordem (para o select da ficha e da empresa). */
export const UFS = Object.freeze(Object.values(UF_POR_NOME).slice().sort());

/** plano 1500c · RC-106/111: o número no formato internacional (+5512998303030) e o link do wa.me — mesma régua do hrefTel. null sem número válido. */
export function telInternacional(telefone) {
  const h = hrefTel(telefone);
  return h ? h.slice(4).replace(/,.*$/, "") : null;      // plano 2000d · PX-092: o ramal (pausa «,22» do tel:) não entra no número do WhatsApp
}
export function hrefWhatsApp(telefone) {
  const t = telInternacional(telefone);
  return t ? `https://wa.me/${t.slice(1)}` : null;
}
/** `tel:+55…` a partir do telefone do cadastro (só dígitos): 10–11 dígitos = DDD + número, ganham o 55; 12–13 já trazem o país; fora disso não dá para ligar → null. */
export function hrefTel(telefone) {
  // plano 2000d · PX-092: «(12) 3632-1234 ramal 22» liga para o número e disca o ramal depois da pausa («tel:+551236321234,22») — antes os
  // dígitos do ramal grudavam no número (tel:+123632123422, um número que não existe)
  const bruto = String(telefone == null ? "" : telefone);
  const rm = /\s*(?:ramal|ext\.?|r\.)\s*:?\s*(\d{1,6})\s*$/i.exec(bruto);
  if (rm) { const base = hrefTel(bruto.slice(0, rm.index)); return base ? `${base},${rm[1]}` : null; }
  let d = bruto.replace(/\D/g, "");
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
  // plano 1500c · RC-022: o ganho vale pela régua do quadro (valorCard: final ?? previsto)
  const somaGanho = Math.round(ganhos.reduce((s, n) => s + valorCard({ ...n, status: "ganho" }), 0) * 100) / 100;
  return { contatos: ((d && d.contatos) || []).length, abertos: abertos.length, valorAberto: soma(abertos, "valor_previsto"), ganhos: ganhos.length, valorGanho: somaGanho };
}

/** Porcentagem inteira legível («62%») de uma fração; null/NaN → «—». */
export function pctInteiro(fracao) {
  if (fracao === null || fracao === undefined || fracao === "") return "—";
  const n = Number(fracao);
  if (Number.isFinite(n) && n > 0 && n < 0.01) return "< 1%";      // plano 1500c · RC-023: 0,4% não é «0%»
  if (Number.isFinite(n) && n > 0.99 && n < 1) return "99%";      // plano 1500c · RX-016: 99,6% não é «100%» (sobrou alguém)
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
  // plano 1500c · RC-011: «Ganho»/«Perdido» na planilha existem, mas fechadas não entram pela importação — aviso próprio (código etapa_fechada)
  const fechadas = new Set((estagios || []).filter(e => e.tipo === "ganho" || e.tipo === "perdido").map(e => norm(e.nome)));
  const etapas = new Map(), novas = new Map(), comVirgula = [], etapasFechadas = new Map();
  for (const l of linhas || []) {
    if (l && l.etiquetas && /,/.test(String(l.etiquetas)) && !/[;|]/.test(String(l.etiquetas)) && comVirgula.length < 5) comVirgula.push(String(l.etiquetas).trim().slice(0, 60));
    if (l && l.estagio && fechadas.has(norm(l.estagio)) && !abertas.has(norm(l.estagio))) etapasFechadas.set(norm(l.estagio), String(l.estagio).trim().slice(0, 40));
    else if (l && l.estagio && !abertas.has(norm(l.estagio))) etapas.set(norm(l.estagio), String(l.estagio).trim().slice(0, 40));
    if (l && l.etiquetas) for (const t of String(l.etiquetas).split(/\s*[;|]\s*/)) {
      const nome = t.trim().slice(0, 40);
      if (nome && !existentes.has(norm(nome))) novas.set(norm(nome), nome);
    }
  }
  // plano 2000d · DR-412: diz QUANTAS linhas e o que acontece com elas
  const nFechadas = etapasFechadas.size ? (linhas || []).filter(l => l && l.estagio && fechadas.has(norm(l.estagio)) && !abertas.has(norm(l.estagio))).length : 0;
  const avisos = etapasFechadas.size ? [{ codigo: "etapa_fechada", etapas: [...etapasFechadas.values()], linhas: nFechadas,
    texto: `${nFechadas === 1 ? "1 linha" : `${nFechadas} linhas`} com etapa de fechamento (${[...etapasFechadas.values()].map(x => `«${x}»`).join(", ")}): etapas de fechamento não entram pela planilha — ${nFechadas === 1 ? "essa linha entra" : "essas linhas entram"} na 1ª etapa aberta, e o ganho ou a perda se marca depois no quadro.` }] : [];
  return { etapasDesconhecidas: [...etapas.values()], etiquetasNovas: [...novas.values()], etiquetasComVirgula: comVirgula, etapasFechadas: [...etapasFechadas.values()], avisos };
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
    // plano 2000d · DR-175: as mensagens trocadas (quando nx_contato_exportar_titular as manda)
    ...(Array.isArray(d.mensagens) ? { mensagens: d.mensagens.map(m => so(m, ["em", "de", "tipo", "texto", "protocolo"])) } : {}),
  };
}

/** plano 1500c · RC-320: «dados-titular-ana-souza-2026-10-21.json» — o nome da pessoa (sem acento) ajuda a achar o arquivo; sem nome, o id. */
/**
 * plano 1500c · RX-069: nome do CSV baixado na importação — leva a planilha de origem e o dia («erros-clientes-maio-2026-10-25.csv»), então
 * baixar de duas importações não vira «erros-da-importacao (1).csv» sem saber de qual era.
 */
export function nomeArquivoImportacao(prefixo, nomeArquivo, dia) {
  const base = semAcento(String(nomeArquivo || "").replace(/\.[a-z0-9]{1,5}$/i, "")).replace(/[^a-z0-9]+/g, "-").replace(/^-+|-+$/g, "").slice(0, 40);
  const d = /^\d{4}-\d{2}-\d{2}$/.test(String(dia || "")) ? String(dia) : "";
  return `${[prefixo, base, d].filter(Boolean).join("-")}.csv`;
}
export function nomeArquivoTitular(cadastro, dia) {
  const c = cadastro || {};
  const slug = semAcento(c.nome || "").replace(/[^a-z0-9]+/g, "-").replace(/^-+|-+$/g, "").slice(0, 40);
  return `dados-titular-${slug || String(c.id ?? "cadastro")}-${dia}.json`;
}

/**
 * plano 1000b · RB-263: a versão LEGÍVEL dos dados do titular (vai num .txt junto do JSON) — seções com título, um item por linha, sem chaves técnicas.
 * `dados` = dadosTitular(...); `fmt` = {data(iso) → texto, brl(v) → texto} (o ui da tela). → texto (linhas com \n).
 */
export function textoTitular(dados, { data = v => String(v ?? ""), brl = v => `R$ ${v}`, vocab = null, campos = [], empresaConta = null } = {}) {
  if (!dados || !dados.cadastro) return "";
  const c = dados.cadastro, sai = [];
  const sec = (titulo, linhas) => { sai.push("", titulo.toUpperCase(), "-".repeat(Math.min(40, titulo.length))); if (!linhas.length) sai.push("(nada registrado)"); else sai.push(...linhas); };
  const par = (rot, v) => (v === undefined || v === null || v === "" ? null : `${rot}: ${v}`);
  // plano 1500c · RC-024: documento entregue ao titular sem termos internos — rótulo do campo, Sim/Não, dd/mm/aaaa, telefone formatado, status da vertical
  const defCampo = chave => (campos || []).find(x => x && x.chave === chave) || null;
  const valorLegivel = (def, v) => {
    if (typeof v === "boolean") return v ? "Sim" : "Não";
    if (Array.isArray(v)) return v.join(", ");
    if (def && def.tipo === "data") return dataCurtaCSV(v);
    if (def && def.tipo === "moeda" && lerNumero(v) !== null) return brl(lerNumero(v));
    if (def && def.tipo === "telefone") return formatarTel(v);
    if (def && def.tipo === "sim_nao") return lerSimNao(v) === true ? "Sim" : lerSimNao(v) === false ? "Não" : String(v);
    return v;
  };
  const statusTxt = s => (s === "ganho" ? (vocab && vocab.ganhar) || "Ganho" : s === "perdido" ? (vocab && vocab.perder) || "Perdido" : s === "aberto" ? "Em andamento" : s);
  sai.push(`Dados de ${dados.titular}`, dados.gerado_em ? `Gerado em ${data(dados.gerado_em)}` : null,
    empresaConta ? `Responsável pelos dados: ${empresaConta}` : null);      // plano 1500c · RC-319: quem gerou e quando, no cabeçalho
  sec("Cadastro", [par("Nome", c.nome), par("Telefone", c.telefone ? formatarTel(c.telefone) : null), par("E-mail", c.email), par("Documento", c.documento ? formatarDoc(c.documento) : null),
    par("Nascimento", c.nascimento ? dataCurtaCSV(c.nascimento) || c.nascimento : null),
    par("Cidade", [c.cidade, c.uf].filter(Boolean).join("/")), par("Origem", ROTULO_ORIGEM[c.origem] || c.origem), par("Observação", c.obs),
    par("Cadastrado em", c.criado_em ? data(c.criado_em) : null), par("Último contato", c.ultimo_contato_em ? data(c.ultimo_contato_em) : null),
    ...Object.entries(c.campos || {}).map(([k, v]) => { const def = defCampo(k); return par(def && def.rotulo ? def.rotulo : k.replace(/_/g, " "), valorLegivel(def, v)); })].filter(Boolean));
  const cs = dados.consentimento || {};
  sec("Consentimento de marketing", [cs.optin_marketing === false ? "Não quer receber marketing" : cs.optin_marketing === true ? "Aceitou receber marketing" : "Sem registro",
    par("Registrado em", cs.optin_em ? data(cs.optin_em) : null), par("Como", cs.optin_origem)].filter(Boolean));
  if (dados.empresa) sec("Empresa", [par("Nome", dados.empresa.nome), par("Cidade", [dados.empresa.cidade, dados.empresa.uf].filter(Boolean).join("/"))].filter(Boolean));
  sec(vocab && vocab.negocios ? vocab.negocios : "Negócios", (dados.negocios || []).map(n => `- ${n.titulo || n.servico || `#${n.id}`}${n.status ? ` (${statusTxt(n.status)})` : ""}${(n.valor ?? n.valor_previsto) != null ? ` · ${brl(n.valor ?? n.valor_previsto)}` : ""}${n.criado_em ? ` · ${data(n.criado_em)}` : ""}`));
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
export function atalhosPrazo(hojeIso, { agora = null, pularFimDeSemana = true } = {}) {
  const [a, m, d] = String(hojeIso || "").slice(0, 10).split("-").map(Number);
  if (!a || !m || !d) return [];
  const dia = n => { const x = new Date(Date.UTC(a, m - 1, d + n)); return x.toISOString().slice(0, 10); };
  const dowDe = n => new Date(Date.UTC(a, m - 1, d + n)).getUTCDay();      // 0 = domingo
  const dow = dowDe(0);
  const ateSegunda = ((8 - dow) % 7) || 7;
  const SEMANA = ["Dom", "Seg", "Ter", "Qua", "Qui", "Sex", "Sáb"];
  // plano 1500c · RC-026: sábado/domingo pulam para a segunda (rótulo mostra o dia: «Seg 9h»)
  const util = n => { let x = n; if (pularFimDeSemana) while (dowDe(x) === 0 || dowDe(x) === 6) x++; return x; };
  const lista = [];
  // plano 1500c · RC-025: depois das 17h de SP o «Hoje 18h» já nasceria quase vencido — vira «Hoje 20h»; depois das 19h some
  const horaSP = agora == null ? null : Number(new Intl.DateTimeFormat("en-GB", { timeZone: "America/Sao_Paulo", hour: "2-digit", hour12: false }).format(new Date(agora))) % 24;
  if (horaSP === null || horaSP < 17) lista.push({ id: "hoje", rotulo: "Hoje 18h", valor: `${dia(0)}T18:00` });
  else if (horaSP < 19) lista.push({ id: "hoje", rotulo: "Hoje 20h", valor: `${dia(0)}T20:00` });
  const am = util(1);
  lista.push({ id: "amanha", rotulo: am === 1 ? "Amanhã 9h" : `${SEMANA[dowDe(am)]} 9h`, valor: `${dia(am)}T09:00` });
  const tres = util(3);
  lista.push({ id: "tres", rotulo: tres === 3 ? "Em 3 dias" : `Em 3 dias (${SEMANA[dowDe(tres)].toLowerCase()})`, valor: `${dia(tres)}T09:00` });
  lista.push({ id: "segunda", rotulo: "Próx. segunda", valor: `${dia(ateSegunda)}T09:00` });
  return lista;
}
/**
 * plano 1500c · RX-021: os atalhos para MOSTRAR — no fim de semana «Seg 9h» e «Próx. segunda» (e na quarta/quinta «Em 3 dias (seg)») caem no mesmo
 * instante: fica só o primeiro (o atalho por id continua igual para o «Adiar»).
 */
export function atalhosPrazoUnicos(hojeIso, o = {}) {
  const vistos = new Set();
  return atalhosPrazo(hojeIso, o).filter(x => !vistos.has(x.valor) && vistos.add(x.valor));
}
/** plano 1500c · RC-027: o atalho pelo id (a posição muda quando «Hoje» some à noite). */
export function atalhoPrazo(hojeIso, id, o = {}) { return atalhosPrazo(hojeIso, o).find(x => x.id === id) || null; }

/** plano 1500c · RC-028: dia de São Paulo (AAAA-MM-DD) e o instante UTC de uma hora local de SP, com o deslocamento REAL do dia (Intl, não −3 fixo). */
const fmtOffSP = new Intl.DateTimeFormat("en-US", { timeZone: "America/Sao_Paulo", timeZoneName: "longOffset" });
function deslocamentoSP(ms) {
  const p = fmtOffSP.formatToParts(new Date(ms)).find(x => x.type === "timeZoneName");
  const r = /GMT([+-]\d{1,2})(?::?(\d{2}))?/.exec((p && p.value) || "");
  if (!r) return "-03:00";
  const hh = r[1].replace(/^([+-])(\d)$/, "$10$2");
  return `${hh}:${r[2] || "00"}`;
}
export function diaSP(agora = new Date()) { return fmtDiaSP.format(new Date(agora)); }
export function instanteSP(dia, hhmm = "09:00") {
  const chute = Date.parse(`${dia}T${hhmm}:00-03:00`);
  return new Date(Date.parse(`${dia}T${hhmm}:00${deslocamentoSP(chute)}`)).toISOString();
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
  // plano 1500c · RX-079: esquema e domínio em minúsculas («HTTPS://WWW.Exemplo.com.br/Promo» → «https://www.exemplo.com.br/Promo»; o caminho fica como veio)
  const minus = u => u.replace(/^(https?:\/\/)([^/?#]*)/i, (_, e, host) => `${e.toLowerCase()}${host.toLowerCase()}`);
  if (/^https?:\/\//i.test(t)) return minus(t);
  // javascript:, mailto: … não viram link. plano 1000b · RB-077: «site.com.br:8080» (ponto ANTES dos dois-pontos) é host com porta, não esquema
  if (/^[a-z][a-z0-9+-]*:/i.test(t)) return null;
  // plano 2000d · PX-022: «@loja» (perfil) e «ana@x.com» (e-mail) não são site — antes viravam «https://@loja» e «https://ana@x.com»
  if (/^[^/?#]*@/.test(t)) return null;
  return minus(`https://${t.replace(/^\/+/, "")}`);
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
    // plano 1500c · RC-027/028: o atalho pelo id («segunda»), não pela posição; dia e hora de SP pelo Intl
    const seg = atalhoPrazo(diaSP(ag), "segunda");
    return instanteSP(seg.valor.slice(0, 10), seg.valor.slice(11, 16));
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
  const [a, m, d] = diaSP(agora).split("-").map(Number);      // plano 1500c · RC-028: o mesmo fuso (Intl) do resto do CRM
  const alvo = new Date(Date.UTC(a, m - 1, d + n)).toISOString().slice(0, 10);
  return instanteSP(alvo, "09:00");
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
const fmtBRL = new Intl.NumberFormat("pt-BR", { style: "currency", currency: "BRL" });
/** plano 1500c · RC-029: o valor de um campo personalizado como a pessoa lê — moeda «R$ 1.500,50», data dd/mm/aaaa, Sim/Não, lista com vírgula. */
export function textoValorCampo(c, v) {
  if (v === null || v === undefined || v === "") return "";
  if (Array.isArray(v)) return v.join(", ");
  if (v === true || v === false) return v ? "Sim" : "Não";
  const tipo = (c || {}).tipo;
  if (tipo === "moeda" && lerNumero(v) !== null) return fmtBRL.format(lerNumero(v)).replace(/\s/g, " ");
  if (tipo === "numero" && lerNumero(v) !== null) return lerNumero(v).toLocaleString("pt-BR", { maximumFractionDigits: 2 });
  if (tipo === "data" && lerData(v)) return dataCurtaCSV(lerData(v));
  if (tipo === "sim_nao" && lerSimNao(v) !== null) return lerSimNao(v) ? "Sim" : "Não";
  if (tipo === "telefone") return formatarTel(v) || String(v);
  return String(v);
}
/** CR-074: valores de campos de negócio que NÃO valem no funil atual (o negócio mudou de funil) → [{chave, rotulo, texto}] (só os que têm valor). */
export function camposDeOutrosFunis(campos, funilId, valores = {}) {
  const aqui = new Set(camposDe(campos, "negocio", funilId).map(c => c.chave));
  const out = [];
  for (const c of campos || []) {
    if (c.entidade !== "negocio" || aqui.has(c.chave) || out.some(x => x.chave === c.chave)) continue;
    const v = (valores || {})[c.chave];
    if (v === undefined || v === null || v === "" || (Array.isArray(v) && !v.length)) continue;
    out.push({ chave: c.chave, rotulo: c.rotulo || c.chave, texto: textoValorCampo(c, v) });      // plano 1500c · RC-029: pelo tipo do campo
  }
  return out;
}

/* ============================================================ plano 2000d · frente crm */
/** plano 2000d · DR-024/025/027: filtros que o servidor ainda não aplica — «só com não lida», serviço e temperatura (pontuação) — conferidos nos cartões carregados. */
export const CHAVES_FILTRO_LOCAL = Object.freeze(["nao_lidas", "servico", "temperatura", "campanha"]);
/** plano 2000d · DR-026: a campanha do cartão (quando nx_negocios_kanban manda: campanha_nome/campanha/utm_campaign). */
export function campanhaDoCard(c) {
  const r = (c && c.rastreio) || {};
  return String((c && (c.campanha_nome || c.campanha || c.campanha_ext)) || r.utm_campaign || "").trim();
}
export function temFiltroLocal(f) { return !!f && CHAVES_FILTRO_LOCAL.some(c => f[c] !== undefined && f[c] !== null && f[c] !== "" && f[c] !== false); }
export function filtroLocal(itens, f = {}) {
  const serv = f.servico ? semAcento(String(f.servico).trim()) : "";
  const camp = f.campanha ? semAcento(String(f.campanha).trim()) : "";
  return (itens || []).filter(c => {
    if (f.nao_lidas && !(Number(c && c.nao_lidas) > 0)) return false;
    if (serv && semAcento(String((c && c.servico) || "").trim()) !== serv) return false;
    if (camp && semAcento(campanhaDoCard(c)) !== camp) return false;
    if (f.temperatura) { const p = pontuacao(c); const faixa = p ? { alta: "quente", media: "morno", baixa: "frio" }[p.faixa] : null; if (faixa !== f.temperatura) return false; }
    return true;
  });
}
/** plano 2000d · DR-024/025/027: aplica os filtros locais às colunas do quadro → {colunas, parcial} (parcial = havia cartões não carregados). */
export function aplicarFiltroLocal(colunas, f = {}) {
  if (!temFiltroLocal(f)) return { colunas, parcial: false };
  let parcial = false;
  const out = (colunas || []).map(c => {
    const itens = filtroLocal(c.itens, f);
    if ((Number(c.total) || 0) > (c.itens || []).length) parcial = true;
    const soma = (k, l) => l.reduce((s, x) => s + (Number(x[k]) || 0), 0);
    return { ...c, itens, total: itens.length, soma_previsto: soma("valor_previsto", itens), soma_valor: itens.reduce((s, x) => s + (Number(x.valor ?? x.valor_previsto) || 0), 0) };
  });
  return { colunas: out, parcial };
}
/** plano 2000d · DR-025: os serviços distintos dos cartões carregados (para o seletor do filtro), em ordem alfabética. */
export function servicosDoQuadro(colunas, de = x => x && x.servico) {
  const m = new Map();
  for (const c of colunas || []) for (const x of c.itens || []) { const s = String(de(x) || "").trim(); if (s && !m.has(semAcento(s))) m.set(semAcento(s), s); }
  return [...m.values()].sort((a, b) => a.localeCompare(b, "pt-BR"));
}
/** plano 2000d · DR-023: «Este mês» / «Mês passado» → {de, ate} em AAAA-MM-DD a partir do dia de hoje (SP) «AAAA-MM-DD». */
export function periodoAtalho(tipo, hoje) {
  const m = /^(\d{4})-(\d{2})-\d{2}$/.exec(String(hoje || ""));
  if (!m) return null;
  let a = Number(m[1]), mes = Number(m[2]);
  if (tipo === "mes_passado") { mes--; if (!mes) { mes = 12; a--; } } else if (tipo !== "mes") return null;
  const ult = new Date(Date.UTC(a, mes, 0)).getUTCDate();
  const p = n => String(n).padStart(2, "0");
  return { de: `${a}-${p(mes)}-01`, ate: `${a}-${p(mes)}-${p(ult)}` };
}
/** plano 2000d · DR-011: ganhos, valor ganho, perdidos e taxa por responsável — das colunas fechadas carregadas. */
export function fechadosPorPessoa(colunas, estagios) {
  const tipo = new Map((estagios || []).map(e => [e.id, e.tipo]));
  const m = new Map();
  for (const c of colunas || []) {
    const t = tipo.get(c && c.estagio_id);
    if (t !== "ganho" && t !== "perdido") continue;
    for (const x of c.itens || []) {
      const id = x && x.dono_id != null && x.dono_id !== "" ? x.dono_id : null;
      const r = m.get(String(id)) || { dono_id: id, ganhos: 0, perdidos: 0, valorGanho: 0 };
      if (t === "ganho") { r.ganhos++; r.valorGanho += Number(x.valor ?? x.valor_previsto) || 0; } else r.perdidos++;
      m.set(String(id), r);
    }
  }
  for (const r of m.values()) r.taxa = r.ganhos + r.perdidos ? r.ganhos / (r.ganhos + r.perdidos) : null;
  return m;
}
/** plano 2000d · DR-040: rodízio — cada cartão recebe o próximo responsável da lista (a ordem da seleção). → [{id, dono_id}] */
export function rodizio(ids, donos) {
  const d = (donos || []).filter(x => x !== null && x !== undefined && x !== "");
  if (!d.length) return [];
  return (ids || []).map((id, i) => ({ id, dono_id: d[i % d.length] }));
}
/** plano 2000d · DR-034: idade curta do selo «atualizado» — «há 5 min», «há 2 h», «há 3 dias». */
export function idadeCurta(min) {
  const m = Math.max(0, Math.floor(Number(min) || 0));
  if (m < 1) return "agora";      // plano 2000d · DR-382: nada de «há 0 min»
  if (m < 60) return `há ${m} min`;
  const hrs = Math.floor(m / 60);
  if (hrs < 24) return `há ${hrs} h`;
  const d = Math.floor(hrs / 24);
  if (d >= 60) return tempoLongo(d);      // plano 2000d · PX-070: «há 2 meses», não «há 64 dias»
  return `há ${d} ${d === 1 ? "dia" : "dias"}`;
}
/** plano 2000d · DR-016: «aplicada a 9 cartões (3 já tinham)». */
export function textoLoteEtiqueta(nome, alterados, jaTinham, verbo = "posta em") {
  const n = Number(alterados) || 0, j = Number(jaTinham) || 0;
  const base = n ? `Etiqueta «${nome}» ${verbo} ${n} ${n === 1 ? "cartão" : "cartões"}` : `Nenhum cartão mudou: ${j === 1 ? "o selecionado já tinha" : "todos já tinham"} a etiqueta «${nome}»`;
  return `${base}${n && j ? ` (${j} já ${j === 1 ? "tinha" : "tinham"})` : ""}.`;
}
/** plano 2000d · DR-066: quantos cartões da coluna passaram do prazo da etapa (sla_horas). */
export function contarSla(itens, slaHoras, agora = new Date()) {
  if (!slaHoras) return 0;
  return (itens || []).filter(c => c && slaEstourado(c.estagio_em, slaHoras, agora)).length;
}
/** plano 2000d · DR-072: lead que chegou nas últimas `horas` (padrão 24 h) e ainda não saiu da 1ª etapa em que entrou. */
export function leadNovo(c, agora = Date.now(), horas = 24) {
  if (!c || !c.criado_em) return false;
  const t = Date.parse(c.criado_em);
  if (!Number.isFinite(t) || Number(agora) - t > horas * 3600000 || Number(agora) < t) return false;
  const e = c.estagio_em ? Date.parse(c.estagio_em) : NaN;
  return !Number.isFinite(e) || Math.abs(e - t) < 60000;
}
/**
 * plano 2000d · DR-075: o filtro de um link (?f=) conferido com a base desta empresa — responsável, etiquetas e campo que não existem aqui
 * (link copiado em outra empresa, ou apagados depois) saem, e a tela avisa. → {filtro, ignorados: ["responsável"|"etiquetas"|"campo"]}
 */
export function filtroDoLinkNaBase(f, { temDono = () => true, temEtiqueta = () => true, campos = null } = {}) {
  const o = { ...(f || {}) };
  const ignorados = [];
  if (o.dono != null && o.dono !== "eu" && o.dono !== "sem" && !temDono(o.dono)) { delete o.dono; ignorados.push("responsável"); }
  if (o.etiquetas && Array.isArray(o.etiquetas.ids)) {
    const ids = o.etiquetas.ids.filter(id => temEtiqueta(id));
    if (ids.length !== o.etiquetas.ids.length) ignorados.push("etiquetas");
    if (ids.length) o.etiquetas = { ...o.etiquetas, ids }; else delete o.etiquetas;
  }
  if (o.campo) { const fc = filtroCampoLimpo(o.campo, campos); if (fc) o.campo = fc; else { delete o.campo; ignorados.push("campo"); } }
  return { filtro: o, ignorados };
}
/** plano 2000d · DR-110: a chance da etapa (a salva ou a padrão do tipo) → número 0–100. */
export function chanceDaEtapa(e) {
  if (!e) return null;
  return Number.isFinite(Number(e.probabilidade)) && e.probabilidade !== null && e.probabilidade !== "" ? Number(e.probabilidade) : probPadrao(e.tipo);
}
/** plano 2000d · DR-092: o ganho é de um mês anterior ao de hoje (SP)? Mudar o valor final muda a receita daquele mês. */
export function ganhoDeMesPassado(fechadoEm, hojeISO) {
  const f = String(fechadoEm || "").slice(0, 7), h = String(hojeISO || "").slice(0, 7);
  return /^\d{4}-\d{2}$/.test(f) && /^\d{4}-\d{2}$/.test(h) && f < h;
}
/** plano 2000d · DR-082: o aviso de «sem contato» só fala do anúncio quando o negócio veio de anúncio. */
export function textoSemContato(n, vocab) {
  const v = vocab || {};
  const min = typeof v.min === "function" ? v.min : x => x;
  const art = typeof v.art === "function" ? v.art("negocio") : "o";
  const doAnuncio = !!(n && (n.plataforma || n.origem === "anuncio" || n.anuncio === true));
  return `Sem ${min("contato")} ligado${doAnuncio ? ` (o cadastro foi removido). Os números d${art} ${min("negocio")} continuam no retorno do anúncio.` : "."}`;
}
/**
 * plano 2000d · DR-090: mensagens prontas a partir do negócio (retomar, confirmar o compromisso, pedir indicação) — com o primeiro nome e o serviço.
 * → [{id, rotulo, texto}]
 */
export function mensagensProntas(n, contato, { compromisso = "consulta", quando = "", linkAvaliacao = null } = {}) {
  // plano 2000d · PX-015: o tratamento fica junto do nome («Dr. João Silva» → «Oi, Dr. João!», antes «Oi, Dr.!»)
  const pal = String((contato && contato.nome) || "").trim().split(/\s+/).filter(Boolean);
  const titulo = pal.length > 1 && /^(?:dra?|sra?|srta|prof|profa|eng|pe|me)\.?$/i.test(pal[0]);
  // plano 2000d · PX-030: nome guardado todo minúsculo/maiúsculo («ana souza», «ANA») sai «Ana» na mensagem
  const nome = nomeBonito(titulo ? `${pal[0]} ${pal[1]}` : (pal[0] || ""));
  const oi = nome ? `Oi, ${nome}! ` : "Oi! ";
  const srv = n && n.servico ? String(n.servico).trim() : "";
  // plano 2000d · PX-016: minúscula só nas palavras comuns — sigla e marca continuam («ABS», «iPhone», «Botox»→«botox» mas «ABS» fica)
  const srvMin = srv.split(/(\s+)/).map(w => (/^[A-ZÀ-Ý0-9]{2,}$/.test(w) || /[a-zà-ÿ][A-ZÀ-Ý]/.test(w) ? w : w.toLowerCase())).join("");
  const lista = [
    { id: "retomar", rotulo: "Retomar a conversa", texto: `${oi}Tudo bem? Passando para saber se ficou alguma dúvida${srv ? ` sobre ${srvMin}` : ""}. Posso ajudar?` },
  ];
  if (n && n.consulta_em) lista.push({ id: "confirmar", rotulo: `Confirmar a ${compromisso}`, texto: `${oi}Confirmando a sua ${compromisso}${quando ? ` ${quando}` : ""}. Podemos contar com você?` });
  if (n && n.status === "ganho") lista.push({ id: "indicacao", rotulo: "Pedir indicação", texto: `${oi}Que bom ter você com a gente! Se conhecer alguém que também precise${srv ? ` de ${srvMin}` : ""}, pode indicar? Vamos cuidar com o mesmo carinho.` });
  // plano 2000d · DR-137: pedir a avaliação (com o link da empresa no Google, quando configurado)
  if (n && n.status === "ganho") lista.push({ id: "avaliacao", rotulo: "Pedir avaliação", texto: `${oi}Obrigado pela confiança! Se puder, conte como foi a sua experiência${linkAvaliacao ? `: ${linkAvaliacao}` : " na nossa página do Google"}. Ajuda muito!` });
  return lista;
}
/** plano 2000d · DR-118: resultados da ligação concluída. */
export const RESULTADOS_LIGACAO = Object.freeze([["atendeu", "Atendeu"], ["nao_atendeu", "Não atendeu"], ["caixa_postal", "Caixa postal"], ["retorno", "Pediu retorno"]]);
/** plano 2000d · DR-118: o texto da nota — «Ligação: não atendeu.» / «Ligação: pediu retorno — ligar depois das 18h». */
export function textoResultadoLigacao(resultado, detalhe = "") {
  const r = (RESULTADOS_LIGACAO.find(([v]) => v === resultado) || [null, "feita"])[1].toLowerCase();
  const d = String(detalhe || "").trim().replace(/\s+/g, " ").slice(0, 500);
  return `Ligação: ${r}${d ? ` — ${d}` : "."}`;
}
/** plano 2000d · DR-121: a cadência pronta de follow-up (amanhã, em 3 e em 7 dias). */
export function passosCadencia(nome = "") {
  const q = String(nome || "").trim().slice(0, 100);
  const sufixo = q ? ` — ${q}` : "";
  return [
    { dias: 1, tipo: "whatsapp", titulo: `Follow-up 1: mandar mensagem${sufixo}` },
    { dias: 3, tipo: "ligacao", titulo: `Follow-up 2: ligar${sufixo}` },
    { dias: 7, tipo: "whatsapp", titulo: `Follow-up 3: última tentativa${sufixo}` },
  ];
}
/** plano 2000d · DR-126: quantas tarefas por responsável (mais primeiro; sem responsável no fim). → [{dono_id, n}] */
export function contarPorDono(itens) {
  const m = new Map();
  for (const t of itens || []) {
    const id = t && t.dono_id != null && t.dono_id !== "" ? t.dono_id : (t && t.dono && t.dono.id != null ? t.dono.id : null);
    const c = String(id);
    const r = m.get(c) || { dono_id: id, n: 0 };
    r.n++; m.set(c, r);
  }
  return [...m.values()].sort((a, b) => (a.dono_id == null) - (b.dono_id == null) || b.n - a.n);
}
/** plano 2000d · DR-101: e-mail para conferir duplicado (minúsculo, válido) → texto | null. */
export function emailDuplicado(v) {
  const t = String(v ?? "").trim().toLowerCase();
  return /^[^@\s]+@[^@\s]+\.[^@\s]{2,}$/.test(t) ? t : null;
}
/** plano 2000d · DR-101: o cadastro com o MESMO e-mail (sem diferença de maiúsculas), fora o próprio. */
export function acharDuplicadoEmail(itens, email, { ignorarId = null } = {}) {
  const m = emailDuplicado(email);
  if (!m) return null;
  return (itens || []).find(c => c && String(c.id) !== String(ignorarId) && String(c.email || "").trim().toLowerCase() === m) || null;
}
/**
 * plano 2000d · DR-091: quanto tempo o negócio ficou em cada etapa — para cada mudança de etapa da linha do tempo, o tempo desde a mudança anterior
 * do mesmo negócio. → Map(evento → «ficou 3 dias em «Nova»» | «ficou 2 dias na etapa anterior» | «no mesmo dia»)
 */
const TIPOS_MUDA_ETAPA = new Set(["negocio_criado", "estagio", "ganho", "perdido", "reaberto"]);
export function permanenciaEtapas(itens) {
  const r = new Map();
  const porNeg = new Map();
  for (const it of itens || []) {
    if (!it || it.fonte === "nota" || it.fonte === "tarefa" || !TIPOS_MUDA_ETAPA.has(it.tipo) || !Number.isFinite(Date.parse(it.em))) continue;
    const ch = String(it.negocio_id ?? (it.dados && it.dados.negocio_id) ?? "_");
    if (!porNeg.has(ch)) porNeg.set(ch, []);
    porNeg.get(ch).push(it);
  }
  for (const lista of porNeg.values()) {
    lista.sort((a, b) => Date.parse(a.em) - Date.parse(b.em));
    for (let i = 1; i < lista.length; i++) {
      const it = lista[i];
      if (it.tipo === "negocio_criado") continue;
      const d = diasEntre(lista[i - 1].em, it.em);
      if (d === null) continue;
      const de = it.dados && it.dados.de_nome;
      r.set(it, d <= 0 ? "no mesmo dia" : `ficou ${d} ${d === 1 ? "dia" : "dias"} ${de ? `em «${de}»` : "na etapa anterior"}`);
    }
  }
  return r;
}
/** plano 2000d · DR-168: negócios da ficha — abertos primeiro; dentro de cada grupo, o mais recente (atualizado, fechado ou criado) primeiro. */
export function ordenarNegociosFicha(negocios) {
  const t = n => Date.parse(n.atualizado_em || n.fechado_em || n.criado_em || "") || 0;
  return (Array.isArray(negocios) ? negocios.slice() : []).sort((a, b) => ((b.status || "aberto") === "aberto") - ((a.status || "aberto") === "aberto") || t(b) - t(a));
}
/** plano 2000d · DR-174 (LGPD): por que o cadastro foi excluído — «titular» fica registrado no servidor como pedido do titular. */
export const MOTIVOS_EXCLUSAO = Object.freeze([["titular", "Pedido da própria pessoa (LGPD)"], ["duplicado", "Cadastro repetido ou errado"], ["outro", "Outro motivo"]]);
/** plano 2000d · DR-176 (LGPD): o aviso do campo de observação — saúde na clínica; dado sensível em geral nas outras verticais. */
export function avisoDadoSensivel(vertical) {
  return vertical === "odonto"
    ? "Toda a equipe vê este campo: não anote diagnóstico, tratamento ou outros dados de saúde aqui."
    : "Toda a equipe vê este campo: evite dados sensíveis (saúde, religião, documentos).";
}
/** plano 2000d · DR-140: telefone de celular sem o 9 («(12) 9830-3030», 10 dígitos com 6–9 depois do DDD) → a sugestão com o 9; senão null. */
export function sugestaoNonoDigito(v) {
  let d = String(v ?? "").replace(/\D/g, "");
  if (d.length === 12 && d.startsWith("55")) d = d.slice(2);
  if (d.length !== 10 || !/^[1-9][1-9][6-9]/.test(d)) return null;
  const n = `${d.slice(0, 2)}9${d.slice(2)}`;
  return `(${n.slice(0, 2)}) ${n.slice(2, 7)}-${n.slice(7)}`;
}
/**
 * plano 2000d · DR-197: o CSV de erros da importação com as colunas ORIGINAIS da planilha + a observação — dá para corrigir e importar de novo.
 * problemas = [{linha, tipo, motivo}]; dados = {cabecalho, linhas, numeros} (o que a leitura da planilha devolveu). Uma linha por linha da planilha.
 */
export function csvErrosImportacao(problemas, dados) {
  const cab = (dados && Array.isArray(dados.cabecalho)) ? dados.cabecalho.map(String) : [];
  const porLinha = new Map();
  (dados && Array.isArray(dados.linhas) ? dados.linhas : []).forEach((l, i) => porLinha.set(Number((dados.numeros && dados.numeros[i]) || i + 2), l));
  const juntos = new Map();
  for (const p of problemas || []) {
    const n = Number(p.linha) || 0;
    const j = juntos.get(n) || { linha: n, tipos: new Set(), motivos: [] };
    j.tipos.add(p.tipo || "Erro"); j.motivos.push(p.motivo || "");
    juntos.set(n, j);
  }
  const linhas = [...juntos.values()].sort((a, b) => a.linha - b.linha).map(j => {
    const orig = porLinha.get(j.linha) || [];
    return [j.linha, ...cab.map((_, i) => (orig[i] ?? "")), [...j.tipos].join(" e "), j.motivos.filter(Boolean).join(" · ")];
  });
  return { cabecalho: ["linha", ...cab, "situação", "o que corrigir"], linhas };
}
/** plano 2000d · DR-198: depois de encolher por tempo esgotado, o lote volta a dobrar a cada 3 lotes certos, até o tamanho original. */
export function loteDepoisDeOk(lote, okSeguidos, max = 100) {
  const n = Math.max(1, Number(lote) || max);
  if (n >= max || okSeguidos < 3) return { lote: Math.min(n, max), okSeguidos };
  return { lote: Math.min(max, n * 2), okSeguidos: 0 };
}
/** plano 2000d · DR-135: o prazo de retorno do serviço (dias) do mapa da base ({«Limpeza»: 180}) — sem acento/maiúscula; fora de 1–730 → null. */
export function recompraDoServico(mapa, servico) {
  if (!mapa || typeof mapa !== "object" || !servico) return null;
  const alvo = semAcento(String(servico).trim());
  const ch = Object.keys(mapa).find(x => semAcento(String(x).trim()) === alvo);
  const n = ch ? Math.round(Number(mapa[ch])) : NaN;
  return n >= 1 && n <= 730 ? n : null;
}
/** plano 2000d · DR-139: a justificativa da perda com «Perdeu para: X» no fim (até 500 caracteres no total). */
export function juntarPerdeuPara(texto, perdeuPara) {
  const t = String(texto || "").trim(), p = String(perdeuPara || "").trim().replace(/\s+/g, " ").slice(0, 80);
  return [t, p ? `Perdeu para: ${p}` : ""].filter(Boolean).join(" · ").slice(0, 500);
}
/**
 * plano 2000d · DR-164: a jornada do negócio em marcos com data — chegou (criado_em, com a origem), agendou (1ª mudança para uma etapa
 * «agendada» na linha do tempo, ou a data da consulta), fechou/perdeu (fechado_em). → [{chave, rotulo, em}] em ordem.
 */
export function jornadaNegocio(n, tempo = [], { origem = null } = {}) {
  if (!n) return [];
  const ms = [];
  if (n.criado_em) ms.push({ chave: "chegou", rotulo: origem ? `Chegou · ${origem}` : "Chegou", em: n.criado_em });
  const ag = (tempo || []).filter(t => t && t.tipo === "estagio" && t.dados && (t.dados.para_marco === "agendada" || /agend/i.test(String(t.dados.para_nome || ""))))
    .sort((a, b) => Date.parse(a.em) - Date.parse(b.em))[0];
  if (ag) ms.push({ chave: "agendou", rotulo: "Agendou", em: ag.em });
  if (n.fechado_em && (n.status === "ganho" || n.status === "perdido")) ms.push({ chave: n.status, rotulo: n.status === "ganho" ? "Fechou" : "Não fechou", em: n.fechado_em });
  return ms.filter(m => Number.isFinite(Date.parse(m.em))).sort((a, b) => Date.parse(a.em) - Date.parse(b.em));
}

/* ------------------------------------------------------------ plano 2000d · complemento PX */
/**
 * plano 2000d · PX-027 (DA-358): a etapa do funil do Anúncios no link da lista (#/contatos?origem=anuncio&etapa=agendou) → o marco | null.
 * Sinônimos aceitos: agendou/agendada, compareceu/veio, fechou/ganho.
 */
const MARCO_DO_LINK = Object.freeze({ agendou: "agendou", agendada: "agendou", agendado: "agendou", compareceu: "compareceu", veio: "compareceu",
  fechou: "fechou", ganho: "fechou", ganhou: "fechou" });
export function marcoDoLink(v) {
  const t = semAcento(String(v ?? "")).trim();
  return MARCO_DO_LINK[t] || null;
}
/** plano 2000d · PX-027: o rótulo do chip do marco. */
export function rotuloMarcoLink(marco, vocab = null) {
  const cp = palavraCompromisso(vocab);
  return marco === "agendou" ? `Agendaram a ${cp}`
    : marco === "compareceu" ? `Compareceram à ${cp}` : marco === "fechou" ? "Fecharam" : "";
}
/**
 * plano 2000d · PX-074: o tipo da tarefa pelo começo do título — «Ligar para a Ana» → ligacao, «Mandar WhatsApp…»/«Zap…» → whatsapp,
 * «Enviar e-mail…» → email, «Reunião…» → reuniao, «Visita…»/«Visitar…» → visita. Nada claro → null (a tela não mexe).
 */
export function tipoDoTitulo(titulo) {
  const t = semAcento(String(titulo ?? "")).trim();
  if (!t) return null;
  if (/\b(whats\s?app|whats|zap|wpp)\b/.test(t)) return "whatsapp";
  if (/\b(e-?mail|email)\b/.test(t)) return "email";
  if (/^(ligar|ligacao|telefonar|retornar ligacao|retornar a ligacao)\b/.test(t)) return "ligacao";
  if (/^(reuniao|reunir|call|videochamada)\b/.test(t)) return "reuniao";
  if (/^(visita|visitar)\b/.test(t)) return "visita";
  return null;
}
/**
 * plano 2000d · PX-097: o e-mail digitado como ele vai para o servidor — sem espaço nas pontas nem em volta do @, @ repetido vira um, minúsculas.
 * Vazio → "". (Os formulários conferem e gravam este valor: « Ana @ X.com » vale e é gravado «ana@x.com».)
 */
export function emailLimpo(v) {
  return String(v ?? "").trim().replace(/\s*@+\s*/g, "@").toLowerCase();
}
