/* ============================================================
   NEXUS ADS — paleta.js · Ctrl/⌘+K: achar paciente, campanha ou ação
   Carregado por import() dinâmico na primeira vez que alguém aperta
   o atalho. Padrão ARIA combobox (input + listbox + activedescendant).
   Nunca mostra telefone: paciente aparece com nome + inicial.
   ============================================================ */

const GRUPOS = [["ir", "Ir para"], ["pac", "Pacientes"], ["camp", "Campanhas"], ["acao", "Ações"]];
const LIMITE = { ir: 6, pac: 6, camp: 5, acao: 8, rec: 5 };
const CHAVE_REC = "nx-recentes";
const semAcentoPadrao = s => String(s ?? "").normalize("NFD").replace(/[̀-ͯ]/g, "").toLowerCase();

/** PURO: 3 = começa com · 2 = começo de palavra · 1 = contém · 0 = não casa (sem acento, sem caixa). */
export function pontuar(q, texto, semAcento = semAcentoPadrao) {
  const t = semAcento(texto), b = semAcento(q).trim();
  if (!b) return 1;
  if (t.startsWith(b)) return 3;
  const i = t.indexOf(b);
  if (i < 0) return 0;
  // começo de palavra: depois de espaço, ponto, hífen, barra, parêntese ou "·"
  let k = i;
  while (k > 0) { if (/[\s.·/(\-«"]/.test(t[k - 1])) return 2; k = t.indexOf(b, k + 1); if (k < 0) break; }
  return 1;
}
/** PURO: filtra e ordena (pontuação; empate mantém a ordem de entrada, que já vem por recência). */
export function rankear(q, itens, semAcento = semAcentoPadrao) {
  return itens.map((it, n) => ({ it, p: pontuar(q, it.nome, semAcento), n })).filter(x => x.p > 0)
    .sort((a, b) => (b.p - a.p) || (a.n - b.n)).map(x => x.it);
}

let el = null, ctx = null, volta = null, opcoes = [], ativo = 0;
const lerRec = () => { try { const v = JSON.parse(localStorage.getItem(CHAVE_REC) || "[]"); return Array.isArray(v) ? v : []; } catch { return []; } };
const gravarRec = chave => { try { localStorage.setItem(CHAVE_REC, JSON.stringify([chave, ...lerRec().filter(k => k !== chave)].slice(0, LIMITE.rec))); } catch { /* modo privado */ } };
const esc = s => String(s ?? "").replace(/[&<>"]/g, c => ({ "&": "&amp;", "<": "&lt;", ">": "&gt;", '"': "&quot;" }[c]));

function itens() {
  return [
    ...ctx.abas.map(a => ({ g: "ir", chave: `ir:${a.k}`, nome: a.nome, sub: "aba", fazer: () => ctx.irAba(a.k) })),
    ...ctx.leads.map(L => ({ g: "pac", chave: `pac:${L.id}`, nome: L.nome, sub: L.sub, fazer: () => ctx.abrirLead(L.id) })),
    ...ctx.campanhas.map(c => ({ g: "camp", chave: `camp:${c.id}`, nome: c.nome, sub: c.sub, fazer: () => ctx.abrirCampanha(c.id) })),
    ...ctx.acoes.map(a => ({ g: "acao", chave: `acao:${a.k}`, nome: a.nome, sub: a.sub, fazer: a.fn })),
  ];
}

function montar() {
  el = document.createElement("div");
  el.className = "paleta";
  el.hidden = true;
  el.setAttribute("role", "dialog");
  el.setAttribute("aria-modal", "true");
  el.setAttribute("aria-label", "Buscar no painel");
  el.innerHTML = `<div class="paleta-fundo"></div>
    <div class="paleta-caixa">
      <div class="paleta-busca">
        <svg viewBox="0 0 24 24" aria-hidden="true"><circle cx="11" cy="11" r="6.5"/><path d="M16 16l4.5 4.5"/></svg>
        <input type="text" class="paleta-in" role="combobox" aria-expanded="true" aria-controls="paleta-lista" aria-autocomplete="list"
          aria-label="Buscar paciente, campanha ou ação" placeholder="Buscar paciente, campanha ou ação…" autocomplete="off" spellcheck="false">
        <kbd>Esc</kbd>
      </div>
      <div class="paleta-lista" id="paleta-lista" role="listbox" aria-label="Resultados"></div>
      <p class="paleta-pe" aria-hidden="true"><span><kbd>↑</kbd><kbd>↓</kbd> escolhe</span><span><kbd>Enter</kbd> abre</span><span><kbd>Esc</kbd> fecha</span></p>
    </div>`;
  document.body.appendChild(el);
  const inp = el.querySelector(".paleta-in");
  inp.addEventListener("input", filtrar);
  inp.addEventListener("keydown", e => {
    if (e.key === "ArrowDown" || e.key === "ArrowUp") { e.preventDefault(); mover(e.key === "ArrowDown" ? 1 : -1); }
    else if (e.key === "Home" && e.ctrlKey) { e.preventDefault(); ativar(0); }
    else if (e.key === "End" && e.ctrlKey) { e.preventDefault(); ativar(opcoes.length - 1); }
    else if (e.key === "Enter") { e.preventDefault(); executar(ativo); }
    else if (e.key === "Escape") { e.preventDefault(); e.stopPropagation(); fechar(true); }
    else if (e.key === "Tab") e.preventDefault();   // o foco fica no campo (o resto é lista)
  });
  el.querySelector(".paleta-fundo").addEventListener("click", () => fechar(true));
  el.querySelector(".paleta-lista").addEventListener("click", e => { const o = e.target.closest("[role='option']"); if (o) executar(+o.dataset.n); });
  el.querySelector(".paleta-lista").addEventListener("pointermove", e => { const o = e.target.closest("[role='option']"); if (o && +o.dataset.n !== ativo) ativar(+o.dataset.n, false); });
}

function filtrar() {
  const q = el.querySelector(".paleta-in").value;
  const todos = itens(), lista = el.querySelector(".paleta-lista");
  const blocos = [];
  if (!q.trim()) {
    const porChave = new Map(todos.map(i => [i.chave, i]));
    const rec = lerRec().map(k => porChave.get(k)).filter(Boolean);
    if (rec.length) blocos.push(["rec", "Recentes", rec]);
    blocos.push(["ir", "Ir para", todos.filter(i => i.g === "ir")]);
    blocos.push(["acao", "Ações", todos.filter(i => i.g === "acao")]);
  } else {
    const achados = GRUPOS.map(([g, rot]) => [g, rot, rankear(q, todos.filter(i => i.g === g), ctx.semAcento).slice(0, LIMITE[g])])
      .filter(b => b[2].length);
    // o grupo com o melhor acerto vem primeiro (empate: a ordem de sempre)
    const melhor = b => Math.max(...b[2].map(i => pontuar(q, i.nome, ctx.semAcento)));
    achados.map((b, n) => ({ b, n, p: melhor(b) })).sort((a, b) => (b.p - a.p) || (a.n - b.n)).forEach(x => blocos.push(x.b));
  }
  opcoes = [];
  lista.innerHTML = blocos.map(([g, rot, arr]) => `<div class="pl-g" role="group" aria-labelledby="plg-${g}">
      <p class="pl-gt" id="plg-${g}" role="presentation">${rot}</p>
      ${arr.map(i => { const n = opcoes.push(i) - 1; return `<div class="pl-o pl-${i.g}" role="option" id="pl-${n}" data-n="${n}" aria-selected="false"><span class="pl-n">${esc(i.nome)}</span>${i.sub ? `<span class="pl-s">${esc(i.sub)}</span>` : ""}</div>`; }).join("")}
    </div>`).join("") || `<p class="pl-vazio">Nada encontrado para “${esc(q)}”.</p>`;
  ativar(0, false);
}
function ativar(n, rolar = true) {
  const inp = el.querySelector(".paleta-in");
  el.querySelectorAll("[role='option']").forEach(o => o.setAttribute("aria-selected", "false"));
  if (!opcoes.length) { ativo = -1; inp.removeAttribute("aria-activedescendant"); return; }
  ativo = Math.max(0, Math.min(opcoes.length - 1, n));
  const o = el.querySelector(`#pl-${ativo}`);
  o.setAttribute("aria-selected", "true");
  inp.setAttribute("aria-activedescendant", o.id);
  if (rolar) o.scrollIntoView({ block: "nearest" });
}
const mover = d => opcoes.length && ativar((ativo + d + opcoes.length) % opcoes.length);
function executar(n) {
  const it = opcoes[n];
  if (!it) return;
  gravarRec(it.chave);
  // o foco volta para quem abriu ANTES da ação: a que move o foco (gaveta) leva esse ponto como "volta"
  fechar(true);
  try { it.fazer(); } catch (e) { console.error(e); }
}

export function abrir(c) {
  ctx = c;
  if (!el) montar();
  if (!el.hidden) return;
  volta = document.activeElement;
  el.hidden = false;
  el.classList.toggle("anim", !!c.anim);
  const inp = el.querySelector(".paleta-in");
  inp.value = "";
  filtrar();
  inp.focus();
}
export function fechar(devolver) {
  if (!el || el.hidden) return;
  el.hidden = true;
  if (devolver && volta && volta !== document.body && document.contains(volta)) volta.focus({ preventScroll: true });
}
export const aberta = () => !!el && !el.hidden;
