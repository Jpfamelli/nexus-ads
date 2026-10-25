/* ============================================================
   ÓRBITA — ads-config.js (frente F6) · T14, grupo "Anúncios"
   Seção #/config/anuncios (só gestor/super — mostra a margem da gestão):
   · Integrações Meta/Google: credenciais tipo senha, nunca devolvidas
     ("✓ preenchido"), campo em branco = mantém (nx_integracao_salvar);
   · Metas e avisos: custo por conversa, orçamento, gestão, valor por
     serviço, destinos de WhatsApp, assinatura e regras do radar
     (nx_cliente_salvar — o servidor MESCLA o cfg);
   · "Atualizar dados agora" e envio manual de relatório (nx_executar);
   · plano 100: fee de gestão padrão 0 (decisão 5) e «Testar conexão» por plataforma
     (nx-ciclo {cliente, dias:1} pelo painel: lê 1 dia, sem radar, e explica o erro).
   Mesmas regras do painel clássico (Ajustes), no visual do app.
   ============================================================ */

const CANAIS = {
  meta: {
    nome: "Meta (Instagram e Facebook)", curto: "Meta",
    campos: [["meta_access_token", "Token de acesso", true], ["meta_ad_account_id", "ID da conta de anúncios", false, "act_1234567890"],
      ["conta_nome", "Nome da conta (opcional)", false]],
  },
  google: {
    nome: "Google Ads", curto: "Google",
    campos: [["google_developer_token", "Developer token", true], ["google_customer_id", "ID do cliente (só números)", false, "1234567890"],
      ["google_login_customer_id", "ID da conta gerente — MCC (opcional)", false], ["google_client_id", "OAuth client ID", false],
      ["google_client_secret", "OAuth client secret", true], ["google_refresh_token", "Refresh token", true]],
  },
};
// plano 1000 (AD-235/AD-237): r5 e r6 são regras da conta inteira, desligáveis como as outras (o regrasOff salvo só guarda ids desta lista)
// plano 1000 (AD-008, lote ads-3): o informativo de ritmo também se desliga (o núcleo checa regrasOff «ritmo»)
export const REGRAS = [["r1", "Custo por conversa alto"], ["r2", "Campanha sem conversa"], ["r3", "Criativo com CTR baixo"], ["r4", "Fadiga de criativo"],
  ["r5", "Investimento parou de repente"], ["r6", "CRM parou de receber as conversas do Meta"], ["ritmo", "Ritmo do orçamento"]];
// plano 100 (decisão 5): nada de fee inventado — gestão 0 até a Nexus preencher (igual ao CFG_PADRAO do núcleo)
// plano 1000 (AD-001/AD-072): metas também não — sem valor salvo o campo fica VAZIO (com placeholder) e salvar não grava 15/1500 inventados
export const PADRAO = { cpaAlvo: null, orcamento: null, fee: 0, assinatura: "" };
/** Plano 2000d · DA-335: a cor da agência — só #RRGGBB (nada de CSS livre no relatório); vazio = a do Órbita. */
export function lerCorAgencia(bruto) {
  const s = String(bruto == null ? "" : bruto).trim();
  if (!s) return { ok: true, valor: "" };
  // plano 2000d · NX-041: a forma curta de 3 dígitos («1AF» = 11AAFF) também vale
  const curto = /^#?([0-9a-f])([0-9a-f])([0-9a-f])$/i.exec(s);
  if (curto) return { ok: true, valor: `#${curto[1]}${curto[1]}${curto[2]}${curto[2]}${curto[3]}${curto[3]}`.toUpperCase() };
  const m = /^#?([0-9a-f]{6})$/i.exec(s);
  return m ? { ok: true, valor: `#${m[1].toUpperCase()}` } : { ok: false, msg: "Use a cor em 6 dígitos, como 1F6FEB (ou deixe vazio)." };
}
/** Plano 2000d · DA-361: a meta de fechamentos do mês (inteiro positivo) — vazio = sem meta. */
export function lerMetaFechamentos(bruto) {
  const s = String(bruto == null ? "" : bruto).trim();
  if (!s) return { ok: true, valor: null };
  const n = Number(s.replace(/\./g, ""));
  return Number.isInteger(n) && n > 0 && n <= 100000 ? { ok: true, valor: n } : { ok: false, msg: "A meta de fechamentos precisa ser um número inteiro maior que zero (ou fique vazia)." };
}
/** Plano 2000d · DA-191: a meta de custo com um exemplo de conta (antes só a definição). */
export const EXEMPLO_META_CUSTO = "Ex.: meta de R$ 20 — se R$ 600 investidos trouxeram 25 conversas (R$ 24 cada), está 20% acima, ainda sem aviso; a R$ 28 (40% acima), o radar avisa.";
/** Plano 2000d · DA-025: o padrão da tolerância do aviso de custo (o mesmo TOLERANCIA_R1_PADRAO do núcleo). */
export const TOLERANCIA_R1_PADRAO = 35;
/** Plano 2000d · DA-025/NX-049: a tolerância em vigor (cfg.radar.toleranciaR1 de 10 a 100; fora disso, 35). */
export const toleranciaR1Cfg = cfg => { const n = Number(cfg && cfg.radar && cfg.radar.toleranciaR1); return Number.isFinite(n) && n >= 10 && n <= 100 ? n : TOLERANCIA_R1_PADRAO; };
/** Plano 2000d · NX-050: o exemplo da meta de custo com a tolerância DESTE cliente (antes o texto dizia 35% mesmo com outra tolerância). */
export function exemploMetaCusto(tol = TOLERANCIA_R1_PADRAO) {
  const t = Number.isFinite(+tol) && +tol >= 10 && +tol <= 100 ? Math.round(+tol) : TOLERANCIA_R1_PADRAO;
  if (t === TOLERANCIA_R1_PADRAO) return EXEMPLO_META_CUSTO;
  const limite = (20 * (1 + t / 100)).toFixed(2).replace(".", ",").replace(/,00$/, "");
  return `Ex.: meta de R$ 20 — com a tolerância de ${t}%, o radar avisa quando o custo por conversa passa de R$ ${limite}${t > 20 ? " (a R$ 24, 20% acima, ainda sem aviso)" : ""}.`;
}
/** Plano 1500c · AC-063 (feito na 2000d): os dias sem atendimento marcados (fd_0..fd_6, 0 = domingo) → [0..6] em ordem. */
export const DIAS_SEMANA_CFG = Object.freeze([[1, "Seg"], [2, "Ter"], [3, "Qua"], [4, "Qui"], [5, "Sex"], [6, "Sáb"], [0, "Dom"]]);
export function lerDiasFechados(v = {}) {
  return DIAS_SEMANA_CFG.map(([d]) => d).filter(d => !!(v && v[`fd_${d}`])).sort((a, b) => a - b);
}
/** Plano 1500c · AC-036 (feito na 2000d): a meta de custo PRÓPRIA de cada campanha (campos mc_<id>) → {metas} ou {erro: {campo, msg}}.
    Vazio = sem meta própria (vale a da plataforma). As salvas de campanhas que saíram da semana continuam. */
export function lerMetasCampanha(v = {}, campanhas = [], antes = {}) {
  const vis = new Set((campanhas || []).map(c => String(c.id)));
  const metas = {};
  for (const [k, val] of Object.entries(antes && typeof antes === "object" ? antes : {})) if (!vis.has(String(k)) && Number(val) > 0) metas[k] = Number(val);
  for (const c of campanhas || []) {
    const txt = String((v && v[`mc_${c.id}`]) ?? "").trim();
    if (!txt) continue;
    const n = lerReais(txt);
    if (n == null || !(n > 0)) return { erro: { campo: `mc_${c.id}`, msg: `A meta de «${c.nome}» precisa ser um valor em reais maior que zero (ou fique vazia).` } };
    metas[String(c.id)] = Math.round(n * 100) / 100;
  }
  return { metas };
}
/** Plano 1500c · AC-146: a assinatura que o resumo do mês usa quando o cliente nunca salvou uma (a mesma do núcleo, CFG_PADRAO). */
export const ASSINATURA_PADRAO = "Equipe Nexus · gestão de tráfego";
/** Plano 1500c · AC-146: o que o campo mostra ao abrir — a assinatura EFETIVA (a salva, ou a padrão quando não há nenhuma) e se o
    cliente escolheu ficar sem (vazio salvo de propósito, AB-021). Antes o campo abria vazio e «Salvar» gravava "" em silêncio. */
export function assinaturaInicial(cfg = {}) {
  const s = cfg && cfg.assinatura, padrao = assinaturaPadraoDe(cfg);   // plano 2000d · DA-184
  if (typeof s !== "string") return { valor: padrao, sem: false };
  return s.trim() ? { valor: s, sem: false } : { valor: padrao, sem: true };
}
/** Plano 2000d · DA-184: com a agência parceira configurada (cfg.agenciaNome), a assinatura padrão é a DELA — o cliente da agência
    Alfa não recebe «Equipe Nexus». Sem agência, continua a da Nexus (decisão do integrador, AB-022). */
export function assinaturaPadraoDe(cfg = {}, agencia = null) {
  const a = String((agencia != null ? agencia : cfg && cfg.agenciaNome) || "").trim().slice(0, 60);
  return a ? `Equipe ${a} · gestão de tráfego` : ASSINATURA_PADRAO;
}
/** Plano 1500c · AC-146: o valor a gravar. «Sem assinatura» marcado → "" (sem linha). Cliente sem assinatura salva e o campo ainda com a
    padrão → `undefined` (a chave nem vai: o servidor MESCLA o cfg e o núcleo segue usando a padrão). Campo apagado sem marcar «sem»
    → volta a valer a padrão (undefined, quando nunca houve uma salva; senão a padrão por escrito). */
export function assinaturaParaSalvar({ cfg = {}, valor = "", sem = false, agencia = null } = {}) {
  if (sem) return "";
  const v = String(valor ?? "").trim().slice(0, 120);
  const tinha = cfg && typeof cfg.assinatura === "string";
  // plano 2000d · DA-184: com agência, a assinatura dela vai POR ESCRITO (o padrão do núcleo continua sendo a da Nexus)
  const daAgencia = assinaturaPadraoDe(cfg, agencia);
  if (daAgencia !== ASSINATURA_PADRAO && (!v || v === ASSINATURA_PADRAO || v === daAgencia)) return daAgencia;
  if (!v || v === ASSINATURA_PADRAO) return tinha ? ASSINATURA_PADRAO : undefined;
  return v;
}
/** Plano 1500c · AC-149: conferência de sanidade das metas antes de salvar — {campo, msg} do 1º problema, ou null. Só compara o que foi
    preenchido (meta vazia = sem meta). */
export function validarAjustes({ cpa = null, cpaG = null, orc = null, orcPlat = null } = {}) {
  const n = v => (v == null || v === "" ? null : +v);
  const o = n(orc);
  if (o > 0 && n(cpa) > o) return { campo: "cpaAlvo", msg: "A meta de custo por conversa está maior que o orçamento do mês inteiro — confira os dois valores." };
  if (o > 0 && n(cpaG) > o) return { campo: "cpaAlvoGoogle", msg: "A meta de custo por conversão do Google está maior que o orçamento do mês inteiro — confira os dois valores." };
  const p = orcPlat && typeof orcPlat === "object" ? orcPlat : {};
  const soma = (n(p.meta) || 0) + (n(p.google) || 0);
  if (o > 0 && soma > o * 1.001) return { campo: "orcMeta", msg: "Os orçamentos do Meta e do Google somam mais que o orçamento do mês — ajuste um deles." };
  return null;
}
/** Plano 1500c · AC-120: orçamento do mês por plataforma — "" vira null; número ilegível ou negativo é erro no campo. */
// plano 2000d · DA-185: o mesmo leitor pt-BR do resto da tela (lerReais) — antes «15.5» virava 155 (todo ponto era milhar)
export function lerOrcPlat({ meta = "", google = "" } = {}, ler = s => (String(s).trim() === "" ? null : (n => (n == null ? NaN : n))(lerReais(s)))) {
  const out = {};
  for (const [k, campo, nome] of [["meta", "orcMeta", "do Meta"], ["google", "orcGoogle", "do Google"]]) {
    const v = ler(k === "meta" ? meta : google);
    if (v == null) { out[k] = null; continue; }
    if (!Number.isFinite(v) || v < 0) return { erro: { campo, msg: `O orçamento ${nome} precisa ser um valor em reais (ou vazio).` } };
    out[k] = v > 0 ? Math.round(v * 100) / 100 : null;
  }
  return { orcamentoPlat: out.meta == null && out.google == null ? null : out };
}
/** Plano 1500c · AC-128/AC-148: endereço https completo (logo da capa e link do painel) — "" vale (= sem); http ou lixo é erro. */
export function urlHttpsOuVazio(s) {
  const v = String(s ?? "").trim();
  if (!v) return { ok: true, valor: "" };
  try { const u = new URL(v); return u.protocol === "https:" && u.hostname.includes(".") ? { ok: true, valor: u.href } : { ok: false }; } catch { return { ok: false }; }
}
/** Plano 1500c · AC-148: as campanhas de remarketing marcadas (ids) — só as que existem na lista + as salvas que sumiram da janela. */
export const remarketingSalvo = (marcadas = [], antes = [], visiveis = []) => {
  const vis = new Set(visiveis.map(String));
  return [...new Set([...marcadas.map(String), ...[].concat(antes || []).map(String).filter(id => !vis.has(id))])].filter(Boolean).slice(0, 100);
};
/** Plano 1500c · AC-150: prévia dos limites do radar — quantos avisos de CTR baixo (r3), fadiga (r4) e campanha sem conversa (r2) os
    limites digitados dariam nos dias carregados. `montarCom(radar)` devolve o M do núcleo com esse cfg.radar. */
export function previaLimitesRadar(montarCom, radar = {}, dias = 7) {
  let M;
  try { M = montarCom(radar); } catch { return null; }
  if (!M || !(M.R >= 0)) return null;
  // plano 2000d · NX-049: com a tolerância do custo ajustável (DA-025), a prévia conta também o aviso de custo alto (r1)
  const ids = new Set(["r1", "r2", "r3", "r4"]);
  let n = 0;
  for (let i = Math.max(0, M.R - dias + 1); i <= M.R; i++) n += (M.avaliar(i) || []).filter(a => a && a.regra && ids.has(a.regra.id)).length;
  return { n, dias, texto: n ? `Com esses limites, o radar daria ${n} ${n === 1 ? "aviso" : "avisos"} de custo alto, CTR, frequência ou campanha sem conversa nos últimos ${dias} dias.` : `Com esses limites, nenhum aviso de custo alto, CTR, frequência ou campanha sem conversa nos últimos ${dias} dias.` };
}
/** Plano 1500c · AC-153: marca o campo com erro para leitor de tela (aria-invalid + aria-describedby apontando para a mensagem) ou limpa. */
export function marcarInvalido(input, idMsg, ligado = true) {
  if (!input) return;
  if (ligado) { input.setAttribute("aria-invalid", "true"); if (idMsg) input.setAttribute("aria-describedby", idMsg); }
  else { input.removeAttribute("aria-invalid"); input.removeAttribute("aria-describedby"); }
}
const soDigitos = s => String(s || "").replace(/\D/g, "");
/** Plano 1000 (AD-074): destino de WhatsApp com DDD (10–11 dígitos) ou com DDI (12–13). */
export const numeroWaValido = s => { const d = soDigitos(s); return d.length >= 10 && d.length <= 13; };
/** Plano 1000 (AD-074): o número salvo exibido legível — «5512999998888» → «+55 (12) 99999-8888»; «12999998888» → «(12) 99999-8888». */
export function formatarWa(s) {
  const d = soDigitos(s);
  const local = x => (x.length === 11 ? `(${x.slice(0, 2)}) ${x.slice(2, 7)}-${x.slice(7)}` : x.length === 10 ? `(${x.slice(0, 2)}) ${x.slice(2, 6)}-${x.slice(6)}` : x);
  // plano 2000d · NX-043: só o DDI 55 é desmontado em (DDD) — «351912345678» (Portugal) virava «+35 (19) 1234-5678»
  if ((d.length === 12 || d.length === 13) && d.startsWith("55")) return `+55 ${local(d.slice(2))}`;
  if (d.length >= 12) return `+${d}`;
  return d.length === 10 || d.length === 11 ? local(d) : String(s || "");
}
/** Plano 1000 (AD-068): formato das credenciais antes de salvar (o erro aparecia só na próxima leitura) → texto do erro ou "". */
export function erroCredencial(campo, valor) {
  const v = String(valor ?? "").trim();
  if (!v) return "";                                     // em branco = mantém o salvo
  if (campo === "meta_ad_account_id") return /^(act_)?\d{6,20}$/.test(v) ? "" : "Use o ID da conta de anúncios: act_ seguido só de números (ex.: act_1234567890).";
  if (campo === "meta_access_token") return /\s/.test(v) ? "O token não tem espaços: copie de novo, inteiro." : v.length < 40 ? "Token curto demais: copie o token de acesso inteiro (costuma começar com EAA)." : "";
  if (campo === "google_customer_id" || campo === "google_login_customer_id") return soDigitos(v).length === 10 && /^[\d\s-]+$/.test(v) ? "" : "O ID do Google Ads tem 10 números (ex.: 123-456-7890).";
  if (campo === "google_developer_token") return /\s/.test(v) || v.length < 15 ? "Developer token inválido: copie o token inteiro, sem espaços." : "";
  if (campo === "google_client_id") return /\.apps\.googleusercontent\.com$/.test(v) ? "" : "O client ID termina em .apps.googleusercontent.com.";
  if (campo === "google_client_secret" || campo === "google_refresh_token") return /\s/.test(v) || v.length < 10 ? "Valor inválido: copie de novo, inteiro e sem espaços." : "";
  return "";
}
/** Plano 1000b · AB-260: o número sem DDI 55 (para comparar «12999998888» com «5512999998888»). */
const chaveWa = s => { const d = soDigitos(s); return (d.length === 12 || d.length === 13) && d.startsWith("55") ? d.slice(2) : d; };
/** Plano 1000b · AB-260: destinos sem repetir o mesmo número (com ou sem DDI). Mantém o primeiro como foi escrito. */
export function destinosUnicos(lista = []) {
  const vistos = new Map();
  for (const n of [].concat(lista || [])) { const k = chaveWa(n); if (k && !vistos.has(k)) vistos.set(k, n); }
  return [...vistos.values()];
}
/** Plano 1000b · AB-260: números que estão nos dois campos (gestão e cliente) — recebem o resumo do mês uma vez só, mas o salvamento avisa. */
export function waDuplicados(gestor = [], cliente = []) {
  const g = new Set([].concat(gestor || []).map(chaveWa).filter(Boolean));
  return destinosUnicos([].concat(cliente || []).filter(n => g.has(chaveWa(n))));
}
/** Plano 1000 (AD-246/AD-245/AD-247): o que acontece ao pedir um envio manual. → {bloqueio: texto} ou {titulo, texto}.
    · metas e avisos editados e não salvos: bloqueia (a contagem e os números seriam os antigos);
    · mensal: «mesmo que o resumo deste mês já tenha sido enviado» (antes «hoje»);
    · diário sem investimento no dia: avisa que vai sair um relatório de R$ 0. */
export function confirmacaoEnvio({ tipo, cfg = {}, sujo = false, gastoDia = null, dataDia = "" } = {}) {
  if (sujo) return { bloqueio: "Você mudou Metas e avisos e ainda não salvou: salve antes de enviar (o envio usa os números de WhatsApp salvos)." };
  // plano 1000b · AB-260: o mesmo número na gestão e no cliente conta (e recebe) uma vez só; AB-191: a confirmação diz QUAIS números
  const nums = destinosUnicos(tipo === "mensal" ? [...(cfg.waCliente || []), ...(cfg.waGestor || [])] : (cfg.waGestor || []));
  const dest = nums.length;
  if (!dest) return { bloqueio: "Cadastre um WhatsApp de destino em Metas e avisos antes de enviar." };
  const lst = nums.map(formatarWa), quais = lst.length > 1 ? `${lst.slice(0, -1).join(", ")} e ${lst[lst.length - 1]}` : lst[0];
  const onde = `no WhatsApp de ${dest} ${dest === 1 ? "destino" : "destinos"} (${quais})`;
  if (tipo === "mensal") return { titulo: "Enviar o resumo do mês?", texto: `Ele sai agora ${onde}, mesmo que o resumo deste mês já tenha sido enviado.` };
  // plano 2000d · DA-198: o semanal reenviado pelo histórico tem a própria confirmação (antes caía no texto do diário)
  if (tipo === "semanal") return { titulo: "Enviar o resumo da semana?", texto: `Ele sai agora ${onde}, mesmo que o resumo desta semana já tenha sido enviado.` };
  const zerado = gastoDia != null && !(gastoDia > 0);
  return { titulo: "Enviar o relatório do dia?", texto: `Ele sai agora ${onde}, mesmo que já tenha sido enviado hoje.` +
    (zerado ? ` Atenção: ${dataDia ? `em ${dataDia} ` : "no dia "}não houve investimento em anúncios — o relatório vai sair zerado (R$ 0).` : "") };
}
/** Plano 1000 (AD-073): serviços já usados no CRM (dados.leads[].servico), sem repetir grafia — sugestões para o valor por serviço.
    Plano 1000b · AB-109: unidos aos serviços já salvos no valor por serviço (`salvos` = chaves de cfg.ticket) — o nx_dados desta tela lê
    só 7 dias, e o serviço vendido há 3 semanas sumia da sugestão. */
export function servicosUsados(leads = [], max = 40, salvos = []) {
  const vistos = new Map();
  for (const l of [...(leads || []), ...(salvos || []).map(s => ({ servico: s }))]) {
    const s = String((l && l.servico) || "").trim();
    const k = s.normalize("NFD").replace(/[̀-ͯ]/g, "").toLowerCase();
    if (s && !vistos.has(k)) vistos.set(k, s);
  }
  return [...vistos.values()].sort((a, b) => a.localeCompare(b, "pt-BR")).slice(0, max);
}
/** Plano 1000b · AB-006: lê e confere as metas do formulário (texto dos campos). Gestão vazia = 0 (antes lerReais("") = null e
    «null >= 0» é true em JS: o cfg saía com fee:null). → {erro: {campo, msg}} ou {cpa, cpaG, orc, fee}. */
export function lerMetas({ cpaAlvo = "", cpaAlvoGoogle = "", orcamento = "", fee = "" } = {}) {
  const cpa = lerReais(cpaAlvo), cpaG = lerReais(cpaAlvoGoogle), orc = lerReais(orcamento);
  const feeTxt = String(fee ?? "").trim(), feeN = feeTxt ? lerReais(feeTxt) : 0;
  if (cpa != null && !(cpa > 0)) return { erro: { campo: "cpaAlvo", msg: "A meta de custo por conversa precisa ser maior que zero (ou deixe vazio: sem meta)." } };
  if (cpaG != null && !(cpaG > 0)) return { erro: { campo: "cpaAlvoGoogle", msg: "A meta do Google precisa ser maior que zero (ou deixe vazio)." } };
  if (orc != null && !(orc >= 0)) return { erro: { campo: "orcamento", msg: "O orçamento não pode ser negativo (vazio = não definido)." } };
  if (feeN == null || !(feeN >= 0)) return { erro: { campo: "fee", msg: "Informe o valor da gestão (pode ser zero)." } };
  return { cpa, cpaG, orc, fee: feeN };
}
/** Plano 1000b · AB-103: as linhas do valor por serviço — linha com valor e sem nome, ou nome com valor ilegível/negativo, PARA o
    salvamento com o erro na linha (antes sumiam em silêncio). Linha toda vazia é ignorada. linhas = [{s, v}] (texto dos campos).
    → {ticket} ou {erro: {indice, campo: "s"|"v", msg}}. */
export function lerTickets(linhas = []) {
  const ticket = {};
  for (let i = 0; i < (linhas || []).length; i++) {
    const s = String((linhas[i] && linhas[i].s) || "").trim(), vt = String((linhas[i] && linhas[i].v) || "").trim();
    if (!s && !vt) continue;
    if (!s) return { erro: { indice: i, campo: "s", msg: "Dê um nome a este serviço (ou apague o valor)." } };
    const val = lerReais(vt);
    if (!vt || val == null || !(val >= 0)) return { erro: { indice: i, campo: "v", msg: `Valor inválido para «${s}»: use só números (ex.: 1.500 ou 1500,50).` } };
    ticket[s] = val;
  }
  return { ticket };
}
/** Plano 1000b · AB-102: os rótulos acessíveis de uma linha do valor por serviço (mudam com o nome digitado). */
export function rotulosTicket(nome, servicoRot = "Serviço") {
  const s = String(nome || "").trim() || String(servicoRot).toLowerCase();
  return { valor: `Valor de ${s} em reais`, remover: `Remover ${s}` };
}
/** Plano 1000b · AB-104: os limites do radar digitados (texto dos campos rd_*). Vazio = padrão; texto que não é número («abc») PARA o
    salvamento com o erro no campo (antes virava null e salvava como «padrão» sem avisar). → {radar} ou {erro: {campo, msg}}. */
export const FAIXAS_RADAR = Object.freeze([["ctrMin", 0.05, 10, "O CTR mínimo vai de 0,05% a 10%."], ["freqMax", 1.5, 20, "A frequência máxima vai de 1,5 a 20."], ["r2MinGasto", 1, 10000, "O gasto mínimo vai de R$ 1 a R$ 10.000."],
  ["toleranciaR1", 10, 100, "A tolerância do aviso de custo vai de 10% a 100%."]]);   // plano 2000d · DA-025
export function lerLimitesRadar(v = {}) {
  const radar = {};
  for (const [k, min, max, rot] of FAIXAS_RADAR) {
    const txt = String((v && v[`rd_${k}`]) ?? "").trim();
    if (!txt) continue;
    const n = lerReais(txt.replace(/%|vezes?/gi, ""));
    if (n == null) return { erro: { campo: `rd_${k}`, msg: "Use só números (ex.: 0,9) — ou deixe vazio para o padrão." } };
    if (!(n >= min && n <= max)) return { erro: { campo: `rd_${k}`, msg: rot } };
    radar[k] = n;
  }
  return { radar };
}
/** Plano 1000b · AB-100: «Sincronizar agora» confere sozinho o resultado depois deste tempo (o clássico confere em 30 s; a leitura
    completa com o radar costuma levar mais). */
export const CONFERIR_SYNC_MS = 90 * 1000;
/** Plano 2000d · NX-068: depois de pedir uma leitura, «Sincronizar agora» descansa 1 minuto (tocar de novo enfileirava leituras iguais e
    gastava o limite de leituras da Meta/Google). */
export const ESPERA_NOVO_SYNC_MS = 60 * 1000;
/** Plano 1000b · AB-100: o que a conferência diz, por plataforma ligada: leu depois do pedido, falhou ou ainda não leu. */
export function resumoAposSync(integ = [], desde = 0, quando = iso => iso) {
  const nomes = { meta: "Meta", google: "Google" };
  const partes = (Array.isArray(integ) ? integ : []).filter(i => i && i.ativo && nomes[i.canal]).map(i => {
    const t = Date.parse(i.ultimo_sync || "");
    if (/^erro/i.test(i.status || "")) return `${nomes[i.canal]}: a leitura falhou (${String(i.status).replace(/^erro\s*[—:-]?\s*/i, "") || "veja a situação acima"})`;
    if (Number.isFinite(t) && t >= desde) return `${nomes[i.canal]}: lido ${quando(i.ultimo_sync)}`;
    return `${nomes[i.canal]}: ainda lendo`;
  });
  return partes.length ? `Resultado da sincronização — ${partes.join(" · ")}.` : "Nenhuma plataforma ligada para sincronizar.";
}
/** Plano 1000b · AB-216: o que mudou entre duas consultas da situação (antes sempre «Situação consultada às HH:MM», mudando ou não).
    → «Meta leu às 14:02 (leitura nova) · Google: sem leitura nova.» */
export function mudancaSituacao(antes = [], depois = [], quando = iso => iso) {
  const nomes = { meta: "Meta", google: "Google" };
  const de = l => new Map((Array.isArray(l) ? l : []).filter(i => i && nomes[i.canal]).map(i => [i.canal, i]));
  const A = de(antes), D = de(depois);
  const partes = [...D.values()].filter(i => i.ativo).map(i => {
    const a = A.get(i.canal) || {}, n = nomes[i.canal];
    const novo = i.ultimo_sync && Date.parse(i.ultimo_sync) > (Date.parse(a.ultimo_sync || "") || 0);
    if (/^erro/i.test(i.status || "") && (novo || i.status !== a.status)) return `${n}: a leitura falhou${i.ultimo_sync ? ` ${quando(i.ultimo_sync)}` : ""}`;
    if (novo) return `${n} leu ${quando(i.ultimo_sync)} (leitura nova)`;
    if ((i.status || "") !== (a.status || "")) return `${n}: a situação mudou`;
    return `${n}: sem leitura nova`;
  });
  return partes.length ? `${partes.join(" · ")}.` : "Nenhuma plataforma ligada.";
}
/** Plano 1000b · AB-217: os limites do radar em vigor quando o campo fica vazio (os mesmos do núcleo). */
export const LIMITES_RADAR_PADRAO = Object.freeze({ ctrMin: "0,9%", freqMax: "3 vezes", r2MinGasto: "R$ 22" });
/** Plano 1000b · AB-249: a prévia do título dos relatórios no WhatsApp (o mesmo cabeçalho do nucleo.relDiario). */
export function previaTituloRelatorio(nomeCurto, nomeEmpresa = "", nomeCurtoEmpresa = null) {
  const nome = String(nomeCurto || "").trim() || (typeof nomeCurtoEmpresa === "function" ? nomeCurtoEmpresa(nomeEmpresa || "Cliente", 22) : String(nomeEmpresa || "Cliente").trim());
  return `📊 ${nome} · Tráfego pago — dia e data do relatório`;
}
/** Valor em reais digitado do jeito brasileiro: "1.500" → 1500 · "1.500,50" → 1500.5 · "15,5" → 15.5 ·
    "15.5" → 15.5 · "" → null. (O ui.lerMoeda leria "1.500" como 1,5 — orçamento de R$ 2.000 viraria R$ 2.) */
export function lerReais(s) {
  const t = String(s ?? "").replace(/[R$\s ]/g, "");
  if (!t) return null;
  // plano 2000d · NX-044: colado no formato americano («1,500.50»: vírgula de milhar e ponto decimal) — antes virava 1,5005
  if (/^-?\d{1,3}(,\d{3})+\.\d+$/.test(t)) return Number(t.replace(/,/g, ""));
  const n = t.includes(",") ? Number(t.replace(/\./g, "").replace(",", "."))
    : /^\d{1,3}(\.\d{3})+$/.test(t) ? Number(t.replace(/\./g, "")) : Number(t);
  return Number.isFinite(n) ? n : null;
}

/**
 * F6: texto do resultado de «Testar conexão» para UMA plataforma, a partir de L.resultadoTesteConexao(resposta).
 * → {tom: "ok"|"aten"|"ruim", texto}. Sem a plataforma na resposta = integração não salva ou desligada.
 */
export function textoTesteConexao(lista, canal, nome = canal) {
  const x = (Array.isArray(lista) ? lista : []).find(i => i && i.canal === canal);
  if (!x && lista && lista.motivo === "ocupado") return { tom: "aten", texto: `Já há uma leitura dos anúncios em andamento para esta empresa. Tente testar o ${nome} de novo em 1 ou 2 minutos.` };
  if (!x && lista && lista.motivo === "erro") return { tom: "ruim", texto: `Não foi possível testar o ${nome} agora (o Órbita não concluiu a leitura). Tente de novo em instantes.` };
  if (!x) return { tom: "aten", texto: `O ${nome} não foi testado: salve as credenciais e deixe a integração ligada antes de testar.` };
  if (x.ok && x.parcial) return { tom: "aten", texto: `O ${nome} respondeu, mas a leitura veio parcial: ${x.status.replace(/^parcial\s*—\s*/i, "")}.` };
  if (x.ok) return { tom: "ok", texto: `Conexão com o ${nome} funcionando${x.linhas != null ? ` — ${Number(x.linhas).toLocaleString("pt-BR") /* plano 2000d · NX-059: milhar */} ${x.linhas === 1 ? "linha lida" : "linhas lidas"} do último dia` : ""}.` };
  const curto = x.curto ? x.curto.charAt(0).toUpperCase() + x.curto.slice(1) : `O ${nome} recusou a leitura`;
  return { tom: x.passageiro ? "aten" : "ruim", texto: `${curto}. ${x.acao || "Confira os dados da conexão e salve de novo."}${x.passageiro ? " (Costuma ser passageiro.)" : ""}` };
}

/** Plano 1000b · AB-106: o status técnico da integração («erro — invalid_grant (Token has been expired or revoked.)») vira uma frase em
    português com o que fazer; o texto cru fica para os «detalhes». → {texto, tecnico} (tecnico = "" quando não há nada a esconder). */
export function explicarStatusIntegracao(status) {
  const s = String(status || "").trim();
  if (!/^erro/i.test(s)) return { texto: s, tecnico: "" };
  const cru = s.replace(/^erro\s*[—:-]?\s*/i, "");
  const regras = [
    [/invalid_grant|expired|revoked|expirad|revogad|OAuthException|\b190\b|session has/i, "o acesso expirou ou foi revogado — gere um token novo na plataforma e salve aqui"],
    [/permission|permiss|PERMISSION_DENIED|\b403\b|not authorized|unauthori[sz]ed|\b401\b/i, "a conta não deu permissão para ler os anúncios — confira o acesso do usuário à conta de anúncios"],
    [/not.?found|\b404\b|CUSTOMER_NOT|does not exist|inexistente|n[ãa]o encontrad/i, "a conta de anúncios não foi encontrada — confira o ID da conta e salve de novo"],
    [/rate|quota|\b429\b|too many|limite/i, "a plataforma pediu para esperar (limite de leituras) — costuma passar sozinho na próxima hora"],
    [/timeout|timed out|ETIMEDOUT|ECONN|\b50[234]\b|unavailable|indispon/i, "a plataforma não respondeu a tempo — costuma passar sozinho na próxima hora"],
    [/developer.?token/i, "o developer token do Google não foi aceito — confira se ele está aprovado e salve de novo"],
  ];
  const achou = regras.find(([re]) => re.test(cru));
  return { texto: `a leitura falhou: ${achou ? achou[1] : "confira os dados da conexão e use «Testar conexão»"}`, tecnico: cru };
}
/** Plano 1000b · AB-106: a linha da situação de uma plataforma (a mesma no desenho do formulário e no «Atualizar situação»). */
export function situacaoIntegracao(st = {}, quando = iso => iso) {
  if (!st || !st.canal) return { texto: "Ainda não configurada.", tecnico: "" };
  const ex = explicarStatusIntegracao(st.status);
  if (st.ultimo_sync) return { texto: `Última leitura ${quando(st.ultimo_sync)}${ex.texto ? ` · ${ex.texto}` : ""}`, tecnico: ex.tecnico };
  return { texto: ex.texto ? ex.texto.charAt(0).toUpperCase() + ex.texto.slice(1) : "Ainda não leu os anúncios.", tecnico: ex.tecnico };
}

/** nx_integracoes_status devolve a lista; aceita também {integracoes:[…]} (o servidor falso responde assim) — senão o painel some com as integrações. */
export const listaIntegracoes = (r, padrao = []) => (Array.isArray(r) ? r : r && Array.isArray(r.integracoes) ? r.integracoes : padrao);

export const secoesConfig = [
  // plano 1000 (AD-070): `semAcesso` é o texto para quem chega aqui sem o papel (admin vindo de um link ou aviso) — no lugar do genérico
  { id: "anuncios", titulo: "Anúncios", desc: "Contas da Meta e do Google ligadas aqui", grupo: "Anúncios", papelMin: "gestor", modulo: "ads", icone: "anuncio", montar: secaoAnuncios,
    semAcesso: "As metas e as conexões de anúncios (Meta e Google) são cuidadas pela equipe de gestão que acompanha os seus anúncios. Para mudar uma meta, o orçamento ou os números que recebem os avisos, fale com essa equipe — os resultados continuam em Anúncios." },
  { id: "formulario", titulo: "Formulário do site", desc: "O formulário do site cai direto no funil", grupo: "Anúncios", papelMin: "admin", modulo: "crm", icone: "contato", montar: secaoFormulario },
];

/* ============================================================
   Formulário do site (P1) — #/config/formulario
   O site do cliente manda o formulário direto para nx_lead_entrada (anon,
   com a chave do cliente): vira contato + negócio no funil padrão
   (origem "site"), a mensagem vira nota e os admins são avisados.
   ============================================================ */
/** Código de exemplo para colar no site (texto puro — a tela mostra por textContent). */
/** Plano 1000 (AD-173): a origem vem do rastreio do site quando ele está instalado (window.OrbitaRastreio.dados(): utm_*, gclid,
    fbclid… guardados na 1ª página — quem foi para /contato não perde a campanha); sem ele, da URL atual.
    AD-176: aceite obrigatório da política de privacidade (LGPD). AD-177: telefone com teclado numérico e formato mínimo. */
/** Plano 1000b · AB-116: os parâmetros de origem copiados para o formulário — inclui gbraid/wbraid (cliques do Google no iPhone). */
export const PARAMS_ORIGEM_FORM = Object.freeze(["utm_source", "utm_medium", "utm_campaign", "utm_content", "utm_term", "gclid", "gbraid", "wbraid", "fbclid"]);
/** Plano 1000b · AB-115: o envio do formulário de exemplo desiste em 15 s (rede lenta deixava o botão travado para sempre). */
export const TEMPO_FORM_MS = 15000;
/** Plano 1000b · AB-212: armadilha para robôs no formulário de exemplo — campo escondido «site» (pessoa não vê nem preenche) e tempo
    mínimo entre abrir a página e enviar; robô cai num «Recebemos!» falso e nada chega ao funil. AB-114: o aviso é role=status com foco. */
export const CAMPO_ARMADILHA = "site";
export const TEMPO_MIN_FORM_MS = 3000;
/** Plano 1500c · AC-147: as <option> do «Serviço de interesse» saem dos serviços do cliente (os nomes do valor por serviço) — sem
    nenhum, «Avaliação» e «Outro» como antes. Nomes escapados (o código é colado no site do cliente). */
export function opcoesServicoForm(servicos = []) {
  const esc = s => String(s).replace(/&/g, "&amp;").replace(/</g, "&lt;").replace(/>/g, "&gt;").replace(/"/g, "&quot;");
  const nomes = [...new Set([].concat(servicos || []).map(s => String(s ?? "").trim().slice(0, 60)).filter(Boolean))].slice(0, 30);
  return (nomes.length ? [...nomes, "Outro"] : ["Avaliação", "Outro"]).map(n => `      <option>${esc(n)}</option>`).join("\n");
}
export function codigoExemplo({ url, apikey, chave, politica = "/politica-de-privacidade", servicos = [] }) {
  // plano 1000b · AB-119: cada campo com <label> visível (antes só placeholder); AB-112: o campo «servico» existe (antes o código
  // mandava f.get("servico") sempre null) — opcional, ajuste as opções aos serviços do cliente
  return `<form id="form-contato">
  <label>Nome <input name="nome" placeholder="Seu nome" autocomplete="name" required></label>
  <label>WhatsApp <input name="telefone" type="tel" inputmode="tel" autocomplete="tel" placeholder="WhatsApp com DDD" pattern="[0-9()+ .-]{10,20}" title="WhatsApp com DDD, só números (ex.: 12 99999-8888)" required></label>
  <label>E-mail <input name="email" type="email" placeholder="E-mail (opcional)"></label>
  <label>Serviço de interesse (opcional)
    <select name="servico">
      <option value="">Escolha um serviço</option>
${opcoesServicoForm(servicos)}
    </select>
  </label>
  <label>Mensagem <textarea name="mensagem" placeholder="Como podemos ajudar?"></textarea></label>
  <!-- armadilha para robôs: pessoas não veem nem preenchem este campo (não apague) -->
  <div aria-hidden="true" style="position:absolute;left:-9999px;width:1px;height:1px;overflow:hidden"><label>Site <input name="${CAMPO_ARMADILHA}" tabindex="-1" autocomplete="off"></label></div>
  <!-- troque ${politica} pelo endereço da política de privacidade do SEU site (senão o link dá «página não encontrada») -->
  <label><input name="aceite" type="checkbox" required> Li e aceito a <a href="${politica}" target="_blank" rel="noopener">política de privacidade</a>.</label>
  <button type="submit">Enviar</button>
</form>
<script>
const abertoEm = Date.now();
document.getElementById("form-contato").addEventListener("submit", async (e) => {
  e.preventDefault();
  const form = e.target, f = new FormData(form), u = new URLSearchParams(location.search);
  const avisar = (texto) => {
    const aviso = document.createElement("p");
    aviso.setAttribute("role", "status"); aviso.tabIndex = -1;
    aviso.textContent = texto;
    return aviso;
  };
  // robô: preencheu o campo escondido ou enviou em menos de ${TEMPO_MIN_FORM_MS / 1000} s — nada é enviado
  if (f.get("${CAMPO_ARMADILHA}") || Date.now() - abertoEm < ${TEMPO_MIN_FORM_MS}) { form.replaceWith(avisar("Recebemos! Vamos falar com você em breve.")); return; }
  const rastreio = (window.OrbitaRastreio && typeof window.OrbitaRastreio.dados === "function" && window.OrbitaRastreio.dados()) || {};
  const origem = {};
  for (const k of ${JSON.stringify(PARAMS_ORIGEM_FORM).replace(/,/g, ", ")}) origem[k] = rastreio[k] || u.get(k) || null;
  form.querySelector("button").disabled = true;
  let ok = false;
  // desiste em ${TEMPO_FORM_MS / 1000} s: sem isso, rede lenta deixava o botão travado
  const ctl = typeof AbortController === "function" ? new AbortController() : null;
  const limite = ctl ? setTimeout(() => ctl.abort(), ${TEMPO_FORM_MS}) : 0;
  try {
    const r = await fetch("${url}", {
      method: "POST", signal: ctl ? ctl.signal : undefined,
      headers: { "Content-Type": "application/json", apikey: "${apikey}" },
      body: JSON.stringify({ p_chave: "${chave}", p_dados: {
        nome: f.get("nome"), telefone: f.get("telefone"), email: f.get("email"),
        mensagem: f.get("mensagem"), servico: f.get("servico") || null, aceite_privacidade: f.get("aceite") === "on", ...origem } })
    });
    ok = r.ok;
  } catch (erro) { ok = false; }
  if (ctl) clearTimeout(limite);
  // o aviso é anunciado (role=status) e recebe o foco: quem usa leitor de tela ouve o resultado
  const aviso = avisar(ok ? "Recebemos! Vamos falar com você em breve." : "Não foi possível enviar agora. Tente de novo ou chame no WhatsApp.");
  if (ok) form.replaceWith(aviso); else { form.append(aviso); form.querySelector("button").disabled = false; }
  if (aviso.focus) aviso.focus();
});
</script>`;
}

/** Instruções para ligar um fluxo CodeWords ao endpoint público de entrada de leads do Órbita.
    A chave identifica um cliente; o endpoint não sincroniza o histórico da caixa de conversas. */
export function instrucoesCodeWords({ url, apikey, chave }) {
  const j = v => JSON.stringify(String(v ?? ""));
  return [
    "Crie no CodeWords um fluxo chamado ‘Novo lead qualificado → Órbita’.",
    "Use um gatilho de lead qualificado ou de cadastro concluído. Não envie em cada mensagem do WhatsApp: cada POST cria uma nova oportunidade no CRM.",
    "Antes de ativar, inspecione um evento de exemplo e mapeie os campos reais do gatilho para nome, telefone, e-mail, mensagem e serviço. Se não houver telefone nem e-mail, não envie.",
    "Quando o lead estiver qualificado, faça uma chamada HTTP POST com este destino e formato:",
    `URL: ${url}`,
    "Headers:",
    `  apikey: ${apikey}`,
    "  Content-Type: application/json",
    "Body JSON (troque os textos entre < > pelos campos do evento; não deixe placeholders no fluxo ativo):",
    "{",
    `  \"p_chave\": ${j(chave)},`,
    "  \"p_dados\": {",
    "    \"nome\": \"<nome do contato>\",",
    "    \"telefone\": \"<telefone com DDI e DDD>\",",
    "    \"email\": \"<e-mail, se disponível>\",",
    "    \"mensagem\": \"<resumo ou primeira mensagem, até 2000 caracteres>\",",
    "    \"servico\": \"<serviço de interesse, se disponível>\",",
    "    \"utm_source\": \"codewords-whatsapp\",",
    "    \"utm_campaign\": \"<nome do fluxo ou campanha>\"",
    "  }",
    "}",
    "Faça um teste com um contato fictício e confirme no CRM antes de ativar o fluxo.",
    "Limite conhecido: o lead entra no funil como origem ‘Site’, com codewords-whatsapp registrado na observação; esta integração não importa nem sincroniza mensagens na caixa Conversas do Órbita.",
  ].join("\n");
}

/** Plano 1000b · AB-203: o aviso da troca de chave no Formulário (o AVISO_TROCA do rastreio-config em uma frase só). */
export const TROCA_CHAVE_FORM = "A chave atual para de funcionar na hora, em dois lugares: o formulário do site (os contatos param de entrar no CRM) e o script de rastreio instalado no site (os links do WhatsApp deixam de ganhar o código da campanha). Os dois só voltam quando o código do site for atualizado com a chave nova.";
/** Plano 1000b · AB-118: o nome do contato de teste e o link do CRM filtrado por ele (?busca, a mesma do CR-185). */
export const NOME_TESTE_FORM = "Teste do formulário (pode excluir)";
export const linkCrmTeste = () => `#/crm?busca=${encodeURIComponent(NOME_TESTE_FORM)}`;
export function textoTrocaChave(av) {
  if (!av || !Array.isArray(av.lugares) || !av.intro) return TROCA_CHAVE_FORM;
  return `${av.intro} ${av.lugares.map((l, i) => `${i + 1}) ${l}`).join(" ")} ${av.fim || ""}`.trim();
}

async function secaoFormulario(ctx, alvo) {
  const { ui, api } = ctx;
  const h = ui.h;
  ui.carregarCss("relatorios.css");
  ui.limpar(alvo);
  alvo.append(ui.esqueleto("cartoes", 2));
  let chave = null, D, servicos = [];
  try {
    // plano 1500c · AC-147: os serviços do cliente (nomes do valor por serviço) viram as opções do código de exemplo — leitura extra, opcional
    const [mod, r, dd] = await Promise.all([import(`../dados.js?v=${ctx.versao}`), api.rpcC("nx_entrada_chave", { p_gerar: false }),
      Promise.resolve().then(() => api.rpcC("nx_dados", { p_dias: 1 })).catch(() => null)]);
    D = mod; chave = (r && r.chave) || null;
    const tk = dd && dd.cliente && dd.cliente.cfg && dd.cliente.cfg.ticket;
    servicos = tk && typeof tk === "object" ? Object.keys(tk) : [];
  } catch (e) {
    ui.limpar(alvo);
    alvo.append(ui.erroCartao(e, () => secaoFormulario(ctx, alvo)));
    return;
  }
  const url = `${D.SUPA_URL}/rest/v1/rpc/nx_lead_entrada`;
  const V = ctx.vocab || {};
  const negocio = (typeof V.min === "function" ? V.min("negocio") : "negócio");
  const podeTestar = ctx.pode("admin");

  function pintar() {
    ui.limpar(alvo);
    alvo.append(h("header", { class: "pilha" }, h("h2", { class: "titulo-sec" }, "Formulário do site"),
      h("p", { class: "sub" }, `Quem preencher o formulário do seu site entra sozinho no CRM: vira contato e ${negocio} no funil padrão (origem “Site”), a mensagem vira nota e os administradores recebem um aviso.`)));

    // chave
    const cartaoChave = h("section", { class: "cartao pilha", "aria-labelledby": "cfgf-c" }, h("h3", { id: "cfgf-c", class: "titulo-sec" }, "Chave do formulário"));
    if (!chave) {
      const gerar = h("button", { type: "button", class: "bt bt-prim" }, "Gerar chave");
      gerar.addEventListener("click", async () => {
        try { chave = (await ui.carregando(gerar, api.rpcC("nx_entrada_chave", { p_gerar: true }))).chave; pintar(); ui.toast("Chave criada. Agora é só colar o código no site.", { tipo: "ok" }); }
        catch (e) { ui.toast(api.mensagemErro(e), { tipo: "erro" }); }
      });
      cartaoChave.append(h("p", { class: "sub" }, "Ainda não existe uma chave. Gere uma para ligar o formulário do site a esta empresa."), h("div", { class: "linha" }, gerar));
      alvo.append(cartaoChave);
      return;
    }
    const idK = "cfgf-chave";
    const inpK = h("input", { id: idK, type: "text", class: "mono cfgf-mono", readonly: true, value: chave, spellcheck: false });
    inpK.addEventListener("focus", () => inpK.select());
    const copiarK = h("button", { type: "button", class: "bt bt-sec" }, ui.icone("copiar"), " Copiar chave");
    copiarK.addEventListener("click", () => ui.copiar(chave, { aviso: "Chave copiada." }));
    const trocar = h("button", { type: "button", class: "bt bt-fant" }, "Gerar nova chave");
    trocar.addEventListener("click", async () => {
      // plano 1000b · AB-203: a mesma chave liga o script de rastreio — o aviso cita os DOIS lugares (o AVISO_TROCA do rastreio-config)
      let texto = TROCA_CHAVE_FORM;
      try { const RC = await import(`./rastreio-config.js?v=${ctx.versao}`); texto = textoTrocaChave(RC.AVISO_TROCA); } catch { /* sem o módulo: o texto de reserva já cita os dois */ }
      const ok = await ui.confirmar({ titulo: "Gerar uma chave nova?", perigo: true, rotulo: "Gerar nova chave", texto });
      if (!ok) return;
      try { chave = (await ui.carregando(trocar, api.rpcC("nx_entrada_chave", { p_gerar: true }))).chave; pintar(); ui.toast("Chave nova gerada. Atualize o código no site.", { tipo: "ok" }); }
      catch (e) { ui.toast(api.mensagemErro(e), { tipo: "erro" }); }
    });
    cartaoChave.append(
      h("p", { class: "sub" }, "Ela identifica esta empresa. Quem tiver a chave consegue mandar contatos para o seu CRM (até 30 por hora) — se ela vazar, gere outra."),
      h("div", { class: "campo" }, h("label", { for: idK }, "Chave"), inpK),
      h("div", { class: "linha cfga-exec" }, copiarK, trocar));
    alvo.append(cartaoChave);

    // CodeWords → CRM: usa a mesma entrada protegida do formulário, sem armazenar uma chave do CodeWords.
    const promptCodeWords = instrucoesCodeWords({ url, apikey: D.CHAVE_PUBLICA, chave });
    const preCodeWords = h("pre", { class: "cfgf-codigo", tabindex: "0", "aria-label": "Instruções para configurar o CodeWords" },
      h("code", {}, promptCodeWords));
    const copiarCodeWords = h("button", { type: "button", class: "bt bt-sec" }, ui.icone("copiar"), " Copiar instruções para o CodeWords");
    copiarCodeWords.addEventListener("click", () => ui.copiar(promptCodeWords, { aviso: "Instruções copiadas. Cole no CodeWords e revise o mapeamento antes de ativar." }));
    alvo.append(h("section", { class: "cartao pilha", "aria-labelledby": "cfgf-cw" },
      h("h3", { id: "cfgf-cw", class: "titulo-sec" }, "Conectar com CodeWords"),
      h("p", { class: "sub" }, "Quando uma automação do CodeWords qualificar um novo contato, ela pode cadastrar esse lead no CRM do Órbita. Para este fluxo de entrada, você não precisa criar uma API key do CodeWords."),
      h("ol", { class: "cfgf-passos" },
        h("li", {}, "Copie as instruções abaixo e cole na conversa do Cody dentro do CodeWords."),
        h("li", {}, "Peça para ele conferir os campos do gatilho com um evento de teste e só então ativar."),
        h("li", {}, "O contato, a oportunidade e a mensagem/resumo aparecem no CRM; confira o resultado com um lead fictício.")),
      preCodeWords,
      h("div", { class: "linha" }, copiarCodeWords),
      h("p", { class: "campo-ajuda" }, "A chave de entrada é secreta e por cliente. Não publique estas instruções em um site ou repositório. Se vazar, gere outra chave nesta tela. O envio cria uma oportunidade por chamada; não configure o gatilho para disparar em cada mensagem.")));

    // instalação
    const codigo = codigoExemplo({ url, apikey: D.CHAVE_PUBLICA, chave, servicos });   // plano 1500c · AC-147
    const pre = h("pre", { class: "cfgf-codigo", tabindex: "0", "aria-label": "Código de exemplo do formulário" }, h("code", {}, codigo));
    const copiarC = h("button", { type: "button", class: "bt bt-prim" }, ui.icone("copiar"), " Copiar o código");
    copiarC.addEventListener("click", () => ui.copiar(codigo, { aviso: "Código copiado." }));
    const idU = "cfgf-url";
    const inpU = h("input", { id: idU, type: "text", class: "mono cfgf-mono", readonly: true, value: url, spellcheck: false });
    inpU.addEventListener("focus", () => inpU.select());
    const campos = [["nome", "obrigatório"], ["telefone", "WhatsApp com DDD — obrigatório"]   /* plano 1000b · AB-113: o campo é required no código */, ["email", "opcional"], ["mensagem", "vira uma nota"],
      [`servico`, `${(V.servico || "Serviço").toLowerCase()} de interesse, opcional`], ["utm_source, utm_campaign", "vão para a observação (de onde veio a visita)"]];
    alvo.append(h("section", { class: "cartao pilha", "aria-labelledby": "cfgf-i" },
      h("h3", { id: "cfgf-i", class: "titulo-sec" }, "Como instalar no site"),
      h("ol", { class: "cfgf-passos" },
        h("li", {}, "Copie o código abaixo e cole na página do site onde o formulário deve aparecer (quem cuida do site faz isso em 2 minutos)."),
        // plano 1000b · AB-117: o link da política do exemplo é /politica-de-privacidade — muitos sites usam outro endereço (e dá 404)
        h("li", {}, "Ajuste o visual do formulário como quiser — só mantenha os nomes dos campos. Troque o endereço «/politica-de-privacidade» pelo da política de privacidade do seu site."),
        h("li", {}, "Faça um envio de teste e confira o contato novo no CRM.")),
      pre, h("div", { class: "linha" }, copiarC),
      h("div", { class: "campo" }, h("label", { for: idU }, "Endereço que recebe o formulário (POST, JSON)"), inpU),
      h("dl", { class: "cfgf-campos" }, campos.map(([k, t]) => [h("dt", { class: "mono" }, k), h("dd", {}, t)]))));

    // teste
    if (podeTestar) {
      const st = h("p", { class: "sub", role: "status" });
      const bt = h("button", { type: "button", class: "bt bt-sec" }, ui.icone("enviar"), " Enviar um contato de teste");
      bt.addEventListener("click", async () => {
        st.textContent = "";
        try {
          await ui.carregando(bt, api.publica("nx_lead_entrada", { p_chave: chave, p_dados: {
            nome: NOME_TESTE_FORM, email: "teste-formulario@exemplo.com", mensagem: "Envio de teste feito em Configurações → Formulário do site.", utm_source: "teste" } }));
          st.textContent = `Enviado. O ${negocio} “Teste do formulário (pode excluir)” entra no funil padrão e os administradores recebem o aviso.`;
          // plano 1000b · AB-118: atalho para conferir (e apagar) o contato de teste — o CRM já filtrado pelo nome
          if (ctx.temModulo("crm") && ctx.pronto("crm")) st.append(" ", h("a", { class: "rel-link", href: linkCrmTeste() }, "Ver no CRM"));
        } catch (e) { st.textContent = api.mensagemErro(e); }
      });
      alvo.append(h("section", { class: "cartao pilha", "aria-labelledby": "cfgf-t" },
        h("h3", { id: "cfgf-t", class: "titulo-sec" }, "Testar"),
        h("p", { class: "sub" }, "Manda um contato de mentira pelo mesmo caminho do site, para conferir que está tudo ligado."),
        h("div", { class: "linha cfga-exec" }, bt, ctx.temModulo("crm") && ctx.pronto("crm") ? h("a", { class: "rel-link", href: "#/crm" }, "Abrir o CRM") : null), st));
    }
  }
  pintar();
}

async function secaoAnuncios(ctx, alvo) {
  const { ui, api } = ctx;
  const h = ui.h;
  ui.carregarCss("relatorios.css");
  ui.limpar(alvo);
  alvo.append(ui.esqueleto("cartoes", 3));
  let integ, dados, L, N;
  try {
    [integ, dados, L, N] = await Promise.all([api.rpcC("nx_integracoes_status", {}), api.rpcC("nx_dados", { p_dias: 7 }), import(`./rel-logica.js?v=${ctx.versao}`),
      import(`../nucleo.js?v=${ctx.versao}`)]);
  } catch (e) {
    ui.limpar(alvo);
    alvo.append(ui.erroCartao(e, () => secaoAnuncios(ctx, alvo)));
    return;
  }
  ui.limpar(alvo);
  const cliente = (dados && dados.cliente) || { id: ctx.cliente.id, slug: ctx.cliente.slug, nome: ctx.cliente.nome, cfg: {} };
  let cfg = cliente.cfg || {};
  integ = listaIntegracoes(integ);
  // plano 1000b · AB-108: do nx_dados esta tela só precisa das sugestões de serviço e do gasto de ontem — tira os dois logo após a carga e
  // solta o resto (leads com telefone e observação não ficam presos na memória enquanto a seção está aberta)
  const servicosSug = servicosUsados((dados && dados.leads) || [], 40, Object.keys((cfg.ticket && typeof cfg.ticket === "object") ? cfg.ticket : {}));
  // AD-247: quanto foi investido ontem (o «relatório do dia» é de ontem) — envio manual de um dia sem anúncio avisa que sai zerado
  let gastoOntem = null, dataOntem = "", campanhas7 = [];
  // plano 1500c · AC-150: as métricas da semana ficam para a prévia dos limites do radar (sem os leads: telefone/observação saem da memória)
  const metricas7 = (dados && dados.metricas) || [];
  try {
    const M7 = N.montar(N.datasetDeLinhas({ metricas: (dados && dados.metricas) || [], leads: [], cliente: { nome: cliente.nome, cfg: {} }, hoje: (dados && dados.hoje) || N.hojeSP(), dias: 7 }));
    gastoOntem = M7.consolidar(M7.linhasDe(M7.R, M7.R)).gasto; dataOntem = M7.dataBR(M7.R);
    // plano 1500c · AC-148: as campanhas da semana viram as caixas de «remarketing»
    campanhas7 = Object.values(M7.CAMP || {}).filter(c => c && c.id).map(c => ({ id: String(c.id), nome: String(c.nome || c.id), plat: c.plat || "" })).slice(0, 60);
  } catch { gastoOntem = null; }
  dados = null;
  const refsStatus = new Map();

  alvo.append(
    h("header", { class: "pilha" }, h("h2", { class: "titulo-sec" }, "Anúncios"),
      h("p", { class: "sub" }, "Conexão com o Meta e o Google, metas do cliente e avisos no WhatsApp. Só a equipe de gestão vê esta seção.")));

  /* ---------- integrações ---------- */
  const caixaInteg = h("div", { class: "cfga-integ" });
  const statusLeitura = h("p", { class: "sub cfga-leitura-status", role: "status", "aria-live": "polite" });
  const btStatus = h("button", { type: "button", class: "bt bt-fant bt-p" }, ui.icone("relogio"), " Atualizar situação");
  alvo.append(h("section", { class: "cartao pilha", "aria-labelledby": "cfga-i" },
    h("h3", { id: "cfga-i", class: "titulo-sec" }, "Integrações"),
    h("p", { class: "sub" }, "Cole as credenciais de cada plataforma. O que você digitar nunca volta para a tela: campo em branco mantém o valor salvo."),
    h("div", { class: "linha cfga-status-acoes" }, btStatus, statusLeitura), caixaInteg));
  function pintarStatusIntegracoes() {
    for (const canal of Object.keys(CANAIS)) {
      const ref = refsStatus.get(canal);
      if (!ref) continue;
      const st = integ.find(i => i.canal === canal) || {};
      const erro = /^erro/i.test(st.status || ""), ok = /^ok/i.test(st.status || "");
      // plano 1000b · AB-106: frase em português; o status cru fica nos «detalhes técnicos»
      const sit = situacaoIntegracao(st, iso => L.quandoSP(iso));
      ref.status.textContent = sit.texto;
      if (ref.tecnico) { ref.tecnico.hidden = !sit.tecnico; ref.tecnicoTxt.textContent = sit.tecnico; }
      ref.status.classList.toggle("cfga-st-ruim", erro);
      ref.status.classList.toggle("cfga-st-ok", ok);
      ref.dica.textContent = !st.canal ? "Salve as credenciais para ligar esta plataforma."
        : !st.ativo ? "Integração pausada. Ligue a chave e salve para retomar as leituras."
        : erro ? "A última leitura falhou. Revise permissões, validade do acesso e IDs da conta; depois teste novamente."
        : ok ? "A última leitura foi concluída sem erro."
        : "Salve os dados e use “Testar conexão” para fazer a primeira leitura.";
    }
  }
  const pintarInteg = () => {
    refsStatus.clear(); ui.limpar(caixaInteg);
    for (const canal of Object.keys(CANAIS)) caixaInteg.append(formCanal(canal));
    pintarStatusIntegracoes();
  };
  btStatus.addEventListener("click", async () => {
    try {
      const nova = await ui.carregando(btStatus, api.rpcC("nx_integracoes_status", {}));
      const antes = integ;
      integ = listaIntegracoes(nova);
      pintarStatusIntegracoes();
      const hh = new Intl.DateTimeFormat("pt-BR", { timeZone: "America/Sao_Paulo", hour: "2-digit", minute: "2-digit" }).format(new Date());
      // plano 1000b · AB-216: diz o que mudou (leitura nova, falha ou nada) além da hora da consulta
      statusLeitura.textContent = `Situação consultada às ${hh}: ${mudancaSituacao(antes, integ, iso => L.quandoSP(iso))} Os campos ainda não salvos foram preservados.`;
    } catch (e) { statusLeitura.textContent = api.mensagemErro(e); }
  });

  function formCanal(canal) {
    const d = CANAIS[canal], st = integ.find(i => i.canal === canal) || {}, pre = new Set(st.preenchidos || []);
    const erro = /^erro/i.test(st.status || ""), ok = /^ok/i.test(st.status || "");
    const sit = situacaoIntegracao(st, iso => L.quandoSP(iso)), statusTxt = sit.texto;   // plano 1000b · AB-106
    const tecnicoTxt = h("code", { class: "mono" }, sit.tecnico);
    const tecnico = h("details", { class: "cfga-st-tecnico", hidden: !sit.tecnico }, h("summary", {}, "Detalhes técnicos"), tecnicoTxt);
    // plano 1000b · AB-110: a situação é um parágrafo comum (era role=status e, ao salvar um canal, os dois formulários recriados eram
    // anunciados); só o resultado do teste é vivo
    const statusEl = h("p", { class: ["cfga-st", erro && "cfga-st-ruim", ok && "cfga-st-ok"] }, statusTxt);
    const dicaEl = h("small", { id: `cfga-dica-${canal}`, class: "campo-ajuda cfga-st-dica" });
    // plano 1000b · AB-190: desabilitado, o motivo chega ao leitor de tela pela dica do canal («Salve as credenciais…»), não só pelo title
    const testar = h("button", { type: "button", class: "bt bt-sec cfga-testar", disabled: !st.canal, "aria-describedby": `cfga-dica-${canal}`, title: st.canal ? "Lê o último dia com os dados salvos e explica o erro, se houver" : "Salve as credenciais primeiro" }, ui.icone("raio"), " Testar conexão");
    const resultado = h("p", { class: "cfga-teste", role: "status", "aria-live": "polite", hidden: true });
    refsStatus.set(canal, { status: statusEl, dica: dicaEl, tecnico, tecnicoTxt });
    const form = h("form", { class: "cfga-canal pilha", novalidate: true, dataset: { canal } },
      h("div", { class: "linha cfga-canal-cab" }, h("h4", { class: "cfga-canal-t" }, d.nome),
        ui.campo({ tipo: "interruptor", nome: "_ativo", rotulo: "Ligada", valor: !!st.ativo })),
      statusEl, tecnico, dicaEl,
      h("div", { class: "form-grade" }, d.campos.map(([k, rot, secreto, ph]) => ui.campo({
        nome: k, rotulo: pre.has(k) ? `${rot} · ✓ preenchido` : rot, tipo: secreto ? "senha" : "texto",
        placeholder: pre.has(k) ? "em branco = mantém o atual" : (ph || ""), autocomplete: secreto ? "new-password" : "off",
        validar: v => erroCredencial(k, v),            // plano 1000 (AD-068): formato conferido ao sair do campo e ao salvar
      }))),
      h("div", { class: "linha linha-fim cfga-canal-acoes" }, testar, h("button", { type: "submit", class: "bt bt-prim" }, `Salvar ${d.curto}`)),
      resultado);
    for (const i of form.querySelectorAll("input:not([type=checkbox])")) { i.spellcheck = false; i.setAttribute("autocapitalize", "off"); }
    // F6: «Testar conexão» lê 1 dia com os dados SALVOS (nx-ciclo pelo painel, sem radar) e explica o erro na hora — sem esperar a próxima hora
    testar.addEventListener("click", async () => {
      resultado.hidden = false; resultado.className = "cfga-teste";
      const v = ui.lerForm(form);
      if (d.campos.some(([k]) => v[k])) { resultado.classList.add("cfga-teste-aten"); resultado.textContent = `Há campos digitados e não salvos: salve o ${d.curto} antes de testar (o teste usa os dados salvos).`; return; }
      // plano 1000b · AB-107: o interruptor «Ligada» mudado e não salvo também — o teste usaria a situação salva sem avisar
      if (!!v._ativo !== !!st.ativo) { resultado.classList.add("cfga-teste-aten"); resultado.textContent = `Você ${v._ativo ? "ligou" : "desligou"} o ${d.curto} e ainda não salvou: salve antes de testar (o teste usa a situação salva).`; return; }
      resultado.textContent = `Lendo o último dia do ${d.curto}…`;
      try {
        const r = await ui.carregando(testar, api.fn("nx-ciclo", { dias: 1 }));
        const t = textoTesteConexao(L.resultadoTesteConexao(r), canal, d.curto);
        resultado.classList.add(`cfga-teste-${t.tom}`);
        resultado.textContent = t.texto;
        try { const nova = await api.rpcC("nx_integracoes_status", {}); integ = listaIntegracoes(nova, integ); pintarStatusIntegracoes(); } catch { /* a situação antiga continua */ }
      } catch (e) { resultado.classList.add("cfga-teste-ruim"); resultado.textContent = api.mensagemErro(e); }
    });
    form.addEventListener("submit", async ev => {
      ev.preventDefault();
      // AD-068: credencial com formato errado para aqui, no campo (antes o erro só aparecia na próxima leitura)
      if (typeof ui.validarForm === "function" && !ui.validarForm(form)) return;
      const v = ui.lerForm(form), cred = {};
      for (const [k] of d.campos) { const msg = erroCredencial(k, v[k]); if (msg) return ui.marcarErro(form, k, msg); }
      // AD-085: desligar para as leituras e o radar desta plataforma — pergunta antes
      if (st.ativo && !v._ativo) {
        const ok = await ui.confirmar({ titulo: `Desligar a integração do ${d.curto}?`, perigo: true, rotulo: "Desligar",
          texto: `As leituras de hora em hora e o radar do ${d.curto} param até você ligar de novo. Os números já lidos continuam no Anúncios.` });
        if (!ok) return;
      }
      for (const [k] of d.campos) if (v[k]) cred[k] = v[k];
      if (canal === "google" && cred.google_customer_id) cred.google_customer_id = soDigitos(cred.google_customer_id);
      if (canal === "google" && cred.google_login_customer_id) cred.google_login_customer_id = soDigitos(cred.google_login_customer_id);
      try {
        const r = await ui.carregando(form.querySelector("[type=submit]"),
          api.rpcC("nx_integracao_salvar", { p_canal: canal, p_cred: cred, p_ativo: !!v._ativo }));
        if (Array.isArray(r)) integ = r;
        else if (r && r.canal) integ = [...integ.filter(i => i.canal !== r.canal), r];
        // plano 1000b · AB-003: troca SÓ o formulário salvo (a credencial digitada nele não fica na tela); o da outra plataforma, com o
        // que já foi digitado e ainda não salvo, continua como está (antes pintarInteg() recriava os dois e apagava o Google ao salvar o Meta)
        const novoForm = formCanal(canal);
        form.replaceWith(novoForm);
        pintarStatusIntegracoes();
        // plano 1000b · AB-111: o toast oferece testar agora (dispara o «Testar conexão» do formulário novo)
        const btTestar = novoForm.querySelector(".cfga-testar");
        ui.toast(`${d.curto} salvo. A próxima leitura já usa estes dados.`, { tipo: "ok",
          acao: btTestar && !!v._ativo ? { rotulo: "Testar agora", fn: () => { btTestar.focus(); btTestar.click(); } } : null });
      } catch (e) { ui.toast(api.mensagemErro(e), { tipo: "erro" }); }
    });
    return form;
  }
  pintarInteg();

  /* ---------- metas e avisos ---------- */
  const V = ctx.vocab || {};
  const servicoRot = (V.servico || "Serviço");
  // plano 1000 (AD-073): os serviços já usados no CRM viram sugestões (datalist) — «implante» × «Implante» deixa de ser um tropeço
  const idSug = "cfga-tk-sug";
  const sugestoes = h("datalist", { id: idSug }, servicosSug.map(s => h("option", { value: s })));
  const tickets = h("div", { class: "cfga-tickets pilha" });
  // plano 1500c · AC-153: o erro da linha de serviço fica escrito perto dela e ligado ao campo (aria-describedby), não só no toast
  const erroTk = h("p", { id: "cfga-tk-erro", class: "campo-erro", role: "alert" });
  erroTk.hidden = true;
  const linhaTicket = (s = "", val = "") => {
    const nome = h("input", { type: "text", class: "cfga-tk-s", value: s, placeholder: servicoRot, "aria-label": servicoRot, maxlength: 60, list: idSug });
    const valor = h("input", { type: "text", class: "cfga-tk-v", value: val === "" ? "" : String(val).replace(".", ","), inputmode: "decimal", placeholder: "R$", "aria-label": `Valor de ${s || servicoRot.toLowerCase()} em reais` });
    const x = h("button", { type: "button", class: "bt-icone", "aria-label": `Remover ${s || servicoRot.toLowerCase()}` }, ui.icone("fechar"));
    // plano 1000b · AB-102: os rótulos do valor e do «Remover» acompanham o nome digitado («Valor de Implante em reais»)
    nome.addEventListener("input", () => { const r = rotulosTicket(nome.value, servicoRot); valor.setAttribute("aria-label", r.valor); x.setAttribute("aria-label", r.remover); });
    const linha = h("div", { class: "cfga-tk" }, nome, valor, x);
    x.addEventListener("click", () => { linha.remove(); sujo = true; (tickets.querySelector("input") || addTk).focus(); });
    return linha;
  };
  const addTk = h("button", { type: "button", class: "bt bt-fant bt-p" }, ui.icone("mais"), ` ${servicoRot}`);
  addTk.addEventListener("click", () => { const l = linhaTicket(); tickets.append(l); l.querySelector("input").focus(); });

  const off = new Set(cfg.regrasOff || []);
  // AD-074: os destinos salvos aparecem formatados («+55 (12) 99999-8888»); ao salvar, só os dígitos
  const lista = v => [].concat(v || []).map(formatarWa).join("\n");
  const reaisOuVazio = v => (Number(v) > 0 ? Number(v) : null);      // AD-001/AD-072: sem valor salvo = campo vazio, nunca 15/1500
  const rad = (cfg.radar && typeof cfg.radar === "object") ? cfg.radar : {};
  const assin0 = assinaturaInicial(cfg);
  const tol0 = toleranciaR1Cfg(cfg);   // plano 2000d · DA-025/NX-050
  const fech0 = new Set((Array.isArray(cfg.diasFechados) ? cfg.diasFechados : []).map(Number));   // plano 1500c · AC-063
  const metasC0 = cfg.metasCampanha && typeof cfg.metasCampanha === "object" ? cfg.metasCampanha : {};   // plano 1500c · AC-036
  // plano 1500c · AC-150: prévia viva — quantos avisos os limites digitados dariam na semana carregada
  const previaRadar = h("p", { class: "sub cfga-previa-radar", "aria-live": "polite" });
  // plano 1500c · AC-152: «Descartar alterações» volta o formulário ao que está salvo (só aparece com mudança pendente)
  const btDescartar = h("button", { type: "button", class: "bt bt-fant cfga-descartar" }, "Descartar alterações");
  btDescartar.hidden = true;
  const oPlat = cfg.orcamentoPlat && typeof cfg.orcamentoPlat === "object" ? cfg.orcamentoPlat : {};
  const rmk0 = new Set([].concat(cfg.remarketing || []).map(String));
  const form = h("form", { class: "pilha", novalidate: true },
    h("div", { class: "form-grade" },
      // AD-248: o nome curto vai no título de cada relatório — 22 letras, com contador perto do limite
      ui.campo({ nome: "nomeCurto", rotulo: "Nome curto (relatórios)", valor: cfg.nomeCurto || "", placeholder: `ex.: ${String(cliente.nome || "").split(" ")[0]}`, max: 22,
        ajuda: "Aparece no título de cada relatório do WhatsApp. Até 22 letras." }),
      // plano 1500c · AC-146: o campo abre com a assinatura EFETIVA (antes vazio — e «Salvar» sem mexer apagava a padrão); vazio de
      // propósito agora é a caixa «Sem assinatura»
      ui.campo({ nome: "assinatura", rotulo: "Assinatura do resumo do mês", valor: assin0.valor, max: 120, ajuda: "Última linha do resumo do mês no WhatsApp." }),
      ui.campo({ tipo: "interruptor", nome: "semAssinatura", rotulo: "Sem assinatura no resumo do mês", valor: assin0.sem }),
      ui.campo({ nome: "cpaAlvo", rotulo: "Meta de custo por conversa (R$)", tipo: "moeda", valor: reaisOuVazio(cfg.cpaAlvo), placeholder: "sem meta",
        ajuda: `Conversa no WhatsApp (Meta). O radar avisa quando passa de ${tol0}% acima. ${exemploMetaCusto(tol0)} Vazio: sem meta e sem esse aviso.` }),   // plano 2000d · DA-191 · NX-050: a tolerância deste cliente
      // AD-010: a conversão do Google costuma custar 2–3× a conversa — meta própria, opcional
      ui.campo({ nome: "cpaAlvoGoogle", rotulo: "Meta de custo por conversão no Google (R$)", tipo: "moeda", valor: reaisOuVazio(cfg.cpaAlvoGoogle), placeholder: "opcional",
        ajuda: "Opcional. Vazio: as campanhas do Google ficam fora do aviso de custo alto." }),
      // plano 2000d · DA-361: o dono pensa em vendas — a meta de fechamentos do mês vira barra de progresso no topo do Anúncios
      ui.campo({ nome: "metaFechamentos", rotulo: "Meta de fechamentos no mês", tipo: "numero", valor: cfg.metaFechamentos || "", placeholder: "opcional", ajuda: "Quantas vendas por anúncio no mês. O Anúncios mostra quanto já foi." }),
      ui.campo({ nome: "orcamento", rotulo: "Orçamento de anúncios do mês (R$)", tipo: "moeda", valor: reaisOuVazio(cfg.orcamento), placeholder: "não definido",
        ajuda: "Vazio ou zero: sem projeção contra o orçamento e sem aviso de ritmo." }),
      ui.campo({ nome: "fee", rotulo: "Gestão mensal (R$)", tipo: "moeda", valor: +(cfg.fee ?? PADRAO.fee), ajuda: "Deixe 0 se o cliente não paga gestão: o retorno conta só os anúncios. Com valor, vira “Retorno total” (anúncios + gestão) e o painel mostra quanto é gestão." }),
      // plano 1500c · AC-120: orçamento separado por plataforma (o Anúncios mostra o ritmo de cada uma); vazio = só o total
      ui.campo({ nome: "orcMeta", rotulo: "Orçamento do mês no Meta (R$)", tipo: "moeda", valor: reaisOuVazio(oPlat.meta), placeholder: "opcional", ajuda: "Opcional. Com valor, o Anúncios mostra o ritmo do Meta separado." }),
      ui.campo({ nome: "orcGoogle", rotulo: "Orçamento do mês no Google (R$)", tipo: "moeda", valor: reaisOuVazio(oPlat.google), placeholder: "opcional" })),
    // plano 1500c · AC-128/AC-129/AC-148: a marca no relatório impresso e o link do painel no fim dos textos do WhatsApp
    h("details", { class: "cfga-avancado" }, h("summary", {}, "Marca e links (opcional)"),
      h("div", { class: "form-grade" },
        ui.campo({ nome: "logoUrl", tipo: "url", rotulo: "Logo do cliente (endereço https)", valor: cfg.logoUrl || "", placeholder: "https://…/logo.png", ajuda: "Sai no topo do relatório impresso ou em PDF." }),
        ui.campo({ nome: "agenciaNome", rotulo: "Nome da agência (rodapé do relatório)", valor: cfg.agenciaNome || "", max: 60, placeholder: "ex.: Nexus" }),
        // plano 2000d · DA-333/DA-335: o logo e a cor da agência no papel, no PDF e na apresentação (white-label)
        ui.campo({ nome: "agenciaLogoUrl", tipo: "url", rotulo: "Logo da agência (endereço https)", valor: cfg.agenciaLogoUrl || "", placeholder: "https://…/logo.png", ajuda: "PNG, JPG ou WebP. Sai no relatório impresso e na capa da apresentação." }),
        ui.campo({ nome: "agenciaCor", rotulo: "Cor da agência", valor: cfg.agenciaCor || "", max: 7, placeholder: "ex.: 1F6FEB", ajuda: "Código de 6 dígitos (com ou sem o símbolo da cerquilha). Pinta os detalhes do relatório impresso e da apresentação; vazio = a cor do Órbita." }),
        ui.campo({ nome: "painelUrl", tipo: "url", rotulo: "Link do painel (fim dos textos do WhatsApp)", valor: cfg.painelUrl || cfg.painel_url || "", placeholder: "https://…", ajuda: "Só endereço https completo." }))),
    h("div", { class: "pilha" }, h("p", { class: "rotulo" }, `Valor de cada ${servicoRot.toLowerCase()}`),
      h("p", { class: "sub" }, "Opcional. Sem valor aqui, a receita conta só o valor informado em cada negócio — nada é estimado. Com valor, o fechamento sem valor entra como estimativa (marcada como estimada). O nome casa sem diferenciar maiúsculas e acentos."),
      tickets, erroTk, sugestoes, h("div", {}, addTk)),
    h("div", { class: "form-grade" },
      ui.campo({ nome: "waGestor", rotulo: "WhatsApp da gestão (avisos e diário)", tipo: "textarea", linhas: 2, valor: lista(cfg.waGestor), placeholder: "+55 (12) 99999-8888", ajuda: "Um número por linha, com DDD (e DDI, se for de fora)." }),
      ui.campo({ nome: "waCliente", rotulo: "WhatsApp do cliente (resumo do mês)", tipo: "textarea", linhas: 2, valor: lista(cfg.waCliente), placeholder: "+55 (11) 90000-0000", ajuda: "Um número por linha, com DDD (e DDI, se for de fora)." })),
    h("fieldset", { class: "pilha cfga-regras" }, h("legend", { class: "rotulo" }, "Regras do radar"),
      REGRAS.map(([id, n]) => ui.campo({ tipo: "interruptor", nome: `rg_${id}`, rotulo: n, valor: !off.has(id) }))),
    // plano 1500c · AC-063 + plano 2000d · DA-009: os dias sem atendimento (o radar não acusa «parou» nem conta conversa perdida neles) e, se
    // os anúncios ficam pausados nesses dias, a projeção do mês usa só os dias abertos
    h("fieldset", { class: "pilha cfga-fechados" }, h("legend", { class: "rotulo" }, "Dias sem atendimento"),
      h("p", { class: "sub" }, "Marque os dias em que a empresa não atende: o radar não acusa «investimento parou» nem «CRM parou» nesses dias e o diário explica o zero."),
      h("div", { class: "cfga-dias" }, DIAS_SEMANA_CFG.map(([d, rot]) => ui.campo({ tipo: "checkbox", nome: `fd_${d}`, rotulo: rot, valor: fech0.has(d) }))),
      ui.campo({ tipo: "interruptor", nome: "pausaDiasFechados", rotulo: "Os anúncios ficam pausados nesses dias (a projeção do orçamento conta só os dias abertos)", valor: cfg.pausaDiasFechados === true })),
    // AD-054: os limites fixos (CTR 0,9%, frequência 3, gasto mínimo R$ 22) ajustáveis por cliente; vazio = o padrão
    h("details", { class: "cfga-avancado" }, h("summary", {}, "Limites do radar (avançado)"),
      h("p", { class: "sub" }, "Vazio = o padrão. Ajuste quando a vertical tem outra régua (ex.: remarketing com frequência alta)."),
      h("div", { class: "form-grade" },
        // plano 1000b · AB-217: o padrão em vigor escrito em cada campo, e «Voltar ao padrão» limpa os três
        ui.campo({ nome: "rd_ctrMin", rotulo: "CTR mínimo do criativo (%)", valor: rad.ctrMin != null ? String(rad.ctrMin).replace(".", ",") : "", placeholder: "0,9", inputmode: "decimal", ajuda: `Padrão: ${LIMITES_RADAR_PADRAO.ctrMin}.` }),
        ui.campo({ nome: "rd_freqMax", rotulo: "Frequência máxima (vezes)", valor: rad.freqMax != null ? String(rad.freqMax).replace(".", ",") : "", placeholder: "3", inputmode: "decimal", ajuda: `Padrão: ${LIMITES_RADAR_PADRAO.freqMax}.` }),
        ui.campo({ nome: "rd_r2MinGasto", rotulo: "Gasto mínimo para «sem conversa» (R$)", valor: rad.r2MinGasto != null ? String(rad.r2MinGasto).replace(".", ",") : "", placeholder: "22", inputmode: "decimal", ajuda: `Padrão: ${LIMITES_RADAR_PADRAO.r2MinGasto}.` }),
        // plano 2000d · DA-025: quanto acima da meta o custo pode ir antes do aviso (r1) — vazio = 35%
        ui.campo({ nome: "rd_toleranciaR1", rotulo: "Tolerância do aviso de custo (%)", valor: rad.toleranciaR1 != null ? String(rad.toleranciaR1).replace(".", ",") : "", placeholder: String(TOLERANCIA_R1_PADRAO), inputmode: "decimal", ajuda: `Padrão: ${TOLERANCIA_R1_PADRAO}% acima da meta. Ex.: 20 avisa mais cedo; 60, só quando o custo dispara.` })),
      previaRadar,
      // plano 1500c · AC-148: campanhas de remarketing (frequência alta por desenho: a fadiga não acusa) — antes só pelo nome
      // plano 1500c · AC-036: meta de custo própria por campanha (vazio = a meta da plataforma) — o núcleo já usa (M.metaDaCampanha)
      campanhas7.length ? h("fieldset", { class: "pilha cfga-metas-camp" }, h("legend", { class: "rotulo" }, "Meta de custo por campanha (opcional)"),
        h("p", { class: "sub" }, "Para a campanha que tem outra régua (ex.: um serviço caro): vazio = vale a meta da plataforma."),
        h("div", { class: "form-grade" }, campanhas7.map(c => ui.campo({ nome: `mc_${c.id}`, rotulo: `${c.nome}${c.plat ? ` · ${c.plat === "google" ? "Google" : "Meta"}` : ""} (R$)`, tipo: "moeda", valor: Number(metasC0[c.id]) > 0 ? Number(metasC0[c.id]) : null, placeholder: "a da plataforma" })))) : null,
      campanhas7.length ? h("fieldset", { class: "pilha cfga-rmk" }, h("legend", { class: "rotulo" }, "Campanhas de remarketing"),
        h("p", { class: "sub" }, "Marque as que são remarketing: o radar não acusa fadiga nelas. Campanhas com «remarketing» no nome já contam."),
        campanhas7.map(c => ui.campo({ tipo: "checkbox", nome: `rmk_${c.id}`, rotulo: `${c.nome}${c.plat ? ` · ${c.plat === "google" ? "Google" : "Meta"}` : ""}`, valor: rmk0.has(c.id) }))) : null,
      h("div", { class: "linha" }, h("button", { type: "button", class: "bt bt-fant bt-p cfga-padrao", on: { click: () => {
        for (const n of ["rd_ctrMin", "rd_freqMax", "rd_r2MinGasto", "rd_toleranciaR1"]) { const i = form.querySelector(`[name="${n}"]`); if (i) i.value = ""; }   // plano 2000d · DA-025
        sujo = true; ui.toast("Limites de volta ao padrão. Salve para valer.", { tipo: "nota" });
      } } }, "Voltar ao padrão"))),
    h("div", { class: "linha linha-fim" }, btDescartar, h("button", { type: "submit", class: "bt bt-prim" }, "Salvar metas e avisos")));
  // plano 1000b · AB-249: prévia ao vivo do título dos relatórios no WhatsApp, logo abaixo do «Nome curto»
  const inNome = form.querySelector('[name="nomeCurto"]');
  if (inNome) {
    const previa = h("p", { class: "campo-ajuda cfga-previa-titulo", "aria-live": "polite" });
    const pintarPrevia = () => { previa.textContent = `Título: ${previaTituloRelatorio(inNome.value, cliente.nome, N.nomeCurtoEmpresa)}`; };
    inNome.addEventListener("input", pintarPrevia);
    pintarPrevia();
    const caixaNome = inNome.closest ? inNome.closest(".campo") : null;
    if (caixaNome && typeof caixaNome.after === "function") caixaNome.after(previa); else inNome.parentNode && inNome.parentNode.append(previa);
  }
  const tk = cfg.ticket && typeof cfg.ticket === "object" ? cfg.ticket : {};
  for (const [s, v] of Object.entries(tk)) tickets.append(linhaTicket(s, v));
  if (!Object.keys(tk).length) tickets.append(linhaTicket());
  alvo.append(h("section", { class: "cartao pilha", "aria-labelledby": "cfga-m" }, h("h3", { id: "cfga-m", class: "titulo-sec" }, "Metas e avisos"), form));
  // AD-246: editou e não salvou? o envio manual espera (a contagem e os números seriam os antigos)
  let sujo = false;
  form.addEventListener("input", () => { sujo = true; btDescartar.hidden = false; });
  form.addEventListener("change", () => { sujo = true; btDescartar.hidden = false; });
  // plano 1500c · AC-150: a prévia recalcula ao digitar um limite (o mesmo leitor do salvamento; limite ilegível = sem prévia)
  const pintarPreviaRadar = () => {
    const lim = lerLimitesRadar(ui.lerForm(form));
    const p = lim.erro || !metricas7.length ? null : previaLimitesRadar(radar => N.montar(N.datasetDeLinhas({ metricas: metricas7, leads: [], cliente: { nome: cliente.nome, cfg: { ...cfg, radar: radar || {}, regrasOff: [] } }, hoje: N.hojeSP(), dias: 7 })), lim.radar, 7);
    previaRadar.textContent = p ? p.texto : "";
  };
  for (const n of ["rd_ctrMin", "rd_freqMax", "rd_r2MinGasto", "rd_toleranciaR1"]) { const i = form.querySelector(`[name="${n}"]`); if (i) i.addEventListener("input", pintarPreviaRadar); }   // plano 2000d · DA-025
  pintarPreviaRadar();
  // plano 1500c · AC-152: descartar = desenhar a seção de novo com o cfg salvo (pergunta antes; a guarda de saída é solta)
  btDescartar.addEventListener("click", async () => {
    const ok = await ui.confirmar({ titulo: "Descartar alterações?", texto: "Metas e avisos voltam ao que está salvo.", rotulo: "Descartar", perigo: true });
    if (!ok) return;
    sujo = false; btDescartar.hidden = true;
    if (typeof removeEventListener === "function") removeEventListener("beforeunload", antesDeSair);
    clearTimeout(tConferir);
    secaoAnuncios(ctx, alvo);
  });

  form.addEventListener("submit", async ev => {
    ev.preventDefault();
    ui.marcarErro(form, null);
    const v = ui.lerForm(form);
    const reais = n => (form.querySelector(`[name="${n}"]`) || {}).value ?? "";
    // AD-072: valida só o que foi preenchido — metas vazias ficam null (sem meta), não 15/1500
    // plano 1000b · AB-006: lerMetas — gestão vazia vira 0 (antes null passava no «!(fee >= 0)» e o cfg saía com fee:null)
    const metas = lerMetas({ cpaAlvo: reais("cpaAlvo"), cpaAlvoGoogle: reais("cpaAlvoGoogle"), orcamento: reais("orcamento"), fee: reais("fee") });
    if (metas.erro) return ui.marcarErro(form, metas.erro.campo, metas.erro.msg);
    const { cpa, cpaG, orc, fee } = metas;
    // plano 1500c · AC-120: orçamento por plataforma; AC-149: metas que não fecham com o orçamento param o salvamento com o erro no campo
    const op = lerOrcPlat({ meta: reais("orcMeta"), google: reais("orcGoogle") }, x => (String(x ?? "").trim() === "" ? null : (lerReais(x) ?? NaN)));
    if (op.erro) return ui.marcarErro(form, op.erro.campo, op.erro.msg);
    const san = validarAjustes({ cpa, cpaG, orc, orcPlat: op.orcamentoPlat });
    if (san) return ui.marcarErro(form, san.campo, san.msg);
    // plano 1500c · AC-128/AC-148: só endereço https
    const urls = {};
    for (const [campo, rot] of [["logoUrl", "O endereço do logo"], ["painelUrl", "O link do painel"], ["agenciaLogoUrl", "O endereço do logo da agência"]]) {   // plano 2000d · DA-333
      const u = urlHttpsOuVazio(reais(campo));
      if (!u.ok) { const el = form.querySelector(`[name="${campo}"]`); const d = el && el.closest ? el.closest("details") : null; if (d) d.open = true; return ui.marcarErro(form, campo, `${rot} precisa começar com https:// (ou ficar vazio).`); }
      urls[campo] = u.valor;
    }
    // plano 2000d · DA-335/DA-361: a cor só em #RRGGBB; a meta de fechamentos, inteiro de 1 a 100000 (ou vazio)
    const corAg = lerCorAgencia(v.agenciaCor);
    if (!corAg.ok) { const el = form.querySelector('[name="agenciaCor"]'); const d = el && el.closest ? el.closest("details") : null; if (d) d.open = true; return ui.marcarErro(form, "agenciaCor", corAg.msg); }
    const metaF = lerMetaFechamentos(v.metaFechamentos);
    if (!metaF.ok) return ui.marcarErro(form, "metaFechamentos", metaF.msg);
    // plano 2000d · NX-042: «12 99999-8888» e «+55 12 99999-8888» são o MESMO destino — grava um só (antes os dois)
    const numeros = s => destinosUnicos(String(s || "").split(/[\n,;]+/).map(soDigitos).filter(n => n.length >= 10 && n.length <= 13));
    for (const campo of ["waGestor", "waCliente"]) {
      const brutos = String(v[campo] || "").split(/[\n,;]+/).map(x => x.trim()).filter(Boolean);
      const ruim = brutos.find(b => !numeroWaValido(b));
      if (ruim) return ui.marcarErro(form, campo, `«${ruim}» não parece um WhatsApp: use DDD + número (10 ou 11 dígitos), com DDI na frente se for preciso (até 13).`);
    }
    // plano 1000b · AB-103: linha com valor e sem nome (ou valor ilegível) para o salvamento com o erro NA linha (antes sumia em silêncio)
    const linhasTk = [...tickets.querySelectorAll(".cfga-tk")];
    for (const l of linhasTk) for (const i of l.querySelectorAll("input")) marcarInvalido(i, null, false);   // plano 1500c · AC-153
    erroTk.hidden = true; erroTk.textContent = "";
    const lt = lerTickets(linhasTk.map(l => ({ s: l.querySelector(".cfga-tk-s").value, v: l.querySelector(".cfga-tk-v").value })));
    if (lt.erro) {
      const alvoErr = linhasTk[lt.erro.indice] && linhasTk[lt.erro.indice].querySelector(lt.erro.campo === "s" ? ".cfga-tk-s" : ".cfga-tk-v");
      erroTk.textContent = lt.erro.msg; erroTk.hidden = false;
      if (alvoErr) { marcarInvalido(alvoErr, "cfga-tk-erro"); alvoErr.focus(); }   // plano 1500c · AC-153
      ui.toast(lt.erro.msg, { tipo: "erro" });
      return;
    }
    const ticket = lt.ticket;
    // plano 1000b · AB-104: «abc» num limite para o salvamento com o erro no campo (antes salvava como «padrão» calado)
    const lim = lerLimitesRadar(v);
    if (lim.erro) { const det = form.querySelector(".cfga-avancado"); if (det) det.open = true; return ui.marcarErro(form, lim.erro.campo, lim.erro.msg); }
    const radar = lim.radar;
    const regrasOff = REGRAS.map(([id]) => id).filter(id => !v[`rg_${id}`]);
    // plano 1500c · AC-036: metas por campanha (erro no campo; as salvas de campanhas fora da semana continuam)
    const mc = lerMetasCampanha(Object.fromEntries(campanhas7.map(c => [`mc_${c.id}`, reais(`mc_${c.id}`)])), campanhas7, cfg.metasCampanha);
    if (mc.erro) { const el = form.querySelector(`[name="${mc.erro.campo}"]`); const det = el && el.closest ? el.closest("details") : null; if (det) det.open = true; return ui.marcarErro(form, mc.erro.campo, mc.erro.msg); }
    // plano 1500c · AC-063 + plano 2000d · DA-009: dias sem atendimento e a pausa nesses dias (sem dia marcado, a pausa não vale)
    const diasFechados = lerDiasFechados(v);
    const novo = { nomeCurto: v.nomeCurto || "", cpaAlvo: cpa, cpaAlvoGoogle: cpaG, orcamento: orc, fee,
                   ticket, waGestor: numeros(v.waGestor), waCliente: numeros(v.waCliente), regrasOff, radar,
                   orcamentoPlat: op.orcamentoPlat, logoUrl: urls.logoUrl, painelUrl: urls.painelUrl, agenciaNome: String(v.agenciaNome || "").trim().slice(0, 60),
                   agenciaLogoUrl: urls.agenciaLogoUrl, agenciaCor: corAg.valor, metaFechamentos: metaF.valor,   // plano 2000d · DA-333/DA-335/DA-361
                   diasFechados, pausaDiasFechados: !!v.pausaDiasFechados && diasFechados.length > 0, metasCampanha: mc.metas };   // AC-063 · DA-009 · AC-036
    // plano 1500c · AC-146: assinatura não tocada (cliente sem assinatura salva) nem vai no pacote — a padrão continua valendo
    const assin = assinaturaParaSalvar({ cfg, valor: v.assinatura, sem: !!v.semAssinatura, agencia: v.agenciaNome });   // plano 2000d · DA-184
    if (assin !== undefined) novo.assinatura = assin;
    // plano 1500c · AC-148: as campanhas marcadas como remarketing (as salvas que saíram da semana continuam)
    if (campanhas7.length) novo.remarketing = remarketingSalvo(campanhas7.filter(c => v[`rmk_${c.id}`]).map(c => c.id), cfg.remarketing, campanhas7.map(c => c.id));
    try {
      const r = await ui.carregando(form.querySelector("[type=submit]"),
        api.rpc("nx_cliente_salvar", { p_cliente: { id: cliente.id, slug: cliente.slug || ctx.cliente.slug, nome: cliente.nome || ctx.cliente.nome, cfg: novo } }));
      cfg = (r && r.cfg) || { ...cfg, ...novo };
      sujo = false; btDescartar.hidden = true;
      // AD-133: o Anúncios joga fora o cache deste cliente — a próxima abertura já usa as metas novas (antes até 5 min com as antigas)
      try { globalThis.dispatchEvent(new CustomEvent("orbita:ads-cfg-salva", { detail: { clienteId: ctx.cliente.id } })); } catch { /* sem eventos */ }
      // plano 1000b · AB-260: o mesmo número na gestão e no cliente — avisa no mesmo toast (o resumo do mês poderia chegar duas vezes nele)
      const dups = waDuplicados(novo.waGestor, novo.waCliente);
      if (dups.length) ui.toast(`Metas e avisos salvos. Atenção: ${dups.map(formatarWa).join(", ")} ${dups.length === 1 ? "está" : "estão"} na gestão e no cliente ao mesmo tempo — deixe em um campo só para não receber o resumo do mês duas vezes.`, { tipo: "aten" });
      else ui.toast("Metas e avisos salvos. O Anúncios já usa as metas novas.", { tipo: "ok" });
    } catch (e) { ui.toast(api.mensagemErro(e), { tipo: "erro" }); }
  });

  /* ---------- atualizar agora ---------- */
  const st = h("p", { id: "cfga-x-st", class: "sub", role: "status" });
  const bCiclo = h("button", { type: "button", class: "bt bt-sec" }, ui.icone("raio"), " Sincronizar agora");
  const bDia = h("button", { type: "button", class: "bt bt-fant" }, "Enviar o relatório do dia");
  const bMes = h("button", { type: "button", class: "bt bt-fant" }, "Enviar o resumo do mês");
  // plano 1000b · AB-100: depois de «Sincronizar agora», uma conferência sozinha em 90 s (cancelada se a tela sair ou houver outro pedido)
  let tConferir = 0, tDescanso = 0;   // plano 2000d · NX-068
  const conferirSync = desde => {
    clearTimeout(tConferir);
    tConferir = setTimeout(async () => {
      if (!alvo.isConnected) return;
      try {
        const nova = await api.rpcC("nx_integracoes_status", {});
        if (!alvo.isConnected) return;
        integ = listaIntegracoes(nova, integ); pintarStatusIntegracoes();
        st.textContent = resumoAposSync(integ, desde, iso => L.quandoSP(iso));
      } catch { /* a conferência é um extra: «Atualizar situação» continua lá */ }
    }, CONFERIR_SYNC_MS);
  };
  const executar = async (tipo, btn) => {
    if (tipo !== "ciclo") {
      const c = confirmacaoEnvio({ tipo, cfg, sujo, gastoDia: tipo === "diario" ? gastoOntem : null, dataDia: dataOntem });
      if (c.bloqueio) { st.textContent = c.bloqueio; return; }
      const ok = await ui.confirmar({ titulo: c.titulo, texto: c.texto, rotulo: "Enviar" });
      if (!ok) return;
    }
    const [tarefa, corpo] = tipo === "ciclo" ? ["nx-ciclo", { cliente: cliente.id }] : ["nx-relatorio", { tipo, cliente: cliente.id, forcar: true }];
    try {
      await ui.carregando(btn, api.rpc("nx_executar", { p_tarefa: tarefa, p_corpo: corpo }));
      const hh = new Intl.DateTimeFormat("pt-BR", { timeZone: "America/Sao_Paulo", hour: "2-digit", minute: "2-digit" }).format(new Date());
      st.textContent = tipo === "ciclo"
        ? `Leitura solicitada às ${hh}. Meta e Google serão consultados em segundo plano; o resultado aparece aqui em cerca de 1 minuto e meio.`
        : `Pedido enviado às ${hh}. O ${tipo === "mensal" ? "resumo do mês" : "relatório do dia"} chega no WhatsApp em instantes.`;
      if (tipo === "ciclo") {
        conferirSync(Date.now() - 5000);   // AB-100
        // plano 2000d · NX-068: um pedido por minuto — o botão diz por que está parado
        clearTimeout(tDescanso); bCiclo.disabled = true; bCiclo.setAttribute("aria-describedby", "cfga-x-st"); bCiclo.title = "Leitura já pedida: dá para pedir outra em 1 minuto.";
        tDescanso = setTimeout(() => { bCiclo.disabled = false; bCiclo.removeAttribute("title"); }, ESPERA_NOVO_SYNC_MS);
      }
    } catch (e) { st.textContent = api.mensagemErro(e); }
  };
  bCiclo.addEventListener("click", () => executar("ciclo", bCiclo));
  bDia.addEventListener("click", () => executar("diario", bDia));
  bMes.addEventListener("click", () => executar("mensal", bMes));
  alvo.append(h("section", { class: "cartao pilha", "aria-labelledby": "cfga-x" },
    h("h3", { id: "cfga-x", class: "titulo-sec" }, "Atualizar agora"),
    h("p", { class: "sub" }, "O sistema lê os anúncios de hora em hora e manda o relatório do dia às 8h. Para conferir a conexão, use “Testar conexão” em cada plataforma; estes botões antecipam a leitura completa (com o radar) e os relatórios."),
    h("div", { class: "linha cfga-exec" }, bCiclo, bDia, bMes), st,
    h("a", { class: "rel-link", href: "#/anuncios" }, "Abrir o Anúncios")));

  // plano 1000b · AB-101: Metas e avisos mudados e não salvos — fechar a aba pergunta (beforeunload) e trocar de seção/tela também
  // (podeSair: a Configuração e a guarda de rota do shell perguntam antes); a limpeza solta o ouvinte e a conferência do «Sincronizar»
  const antesDeSair = ev => { if (!sujo) return; ev.preventDefault(); ev.returnValue = ""; };
  if (typeof addEventListener === "function") addEventListener("beforeunload", antesDeSair);
  return {
    limpar: () => { if (typeof removeEventListener === "function") removeEventListener("beforeunload", antesDeSair); clearTimeout(tConferir); clearTimeout(tDescanso); },   // NX-068
    pendente: () => sujo,
    podeSair: () => (!sujo ? true : ui.confirmar({ titulo: "Sair sem salvar?", texto: "As mudanças em Metas e avisos ainda não foram salvas e serão perdidas.", rotulo: "Sair sem salvar", perigo: true })),
  };
}

// plano 1000b · AB-105: o quandoSP próprio saiu — a data da última leitura usa L.quandoSP (rel-logica), que diz «ontem às…» como o resto do app
