import test from "node:test";
import assert from "node:assert/strict";
import { readFileSync } from "node:fs";

const ler = p => readFileSync(new URL(`../${p}`, import.meta.url), "utf8");
const app = ler("web/app/app.css");
const shell = ler("web/app/shell.css");

function ultimoBloco(css, seletor) {
  const encontrados = [...css.matchAll(seletor)];
  return encontrados.at(-1)?.[1] ?? "";
}

function ultimaMedia(css, consulta) {
  const inicio = css.lastIndexOf(`@media (${consulta})`);
  if (inicio < 0) return "";
  const abre = css.indexOf("{", inicio);
  let nivel = 0;
  for (let i = abre; i < css.length; i++) {
    if (css[i] === "{") nivel++;
    if (css[i] === "}" && --nivel === 0) return css.slice(abre + 1, i);
  }
  return "";
}

test("tokens compartilhados definem ritmo, foco e alvo de toque sem impor cores à marca", () => {
  const inicio = app.lastIndexOf("/* ÓRBITA · consistência transversal 2026-10-03 */");
  assert.ok(inicio >= 0, "marcador de tokens transversais presente");
  const tokens = app.slice(inicio).match(/:root\s*\{([^}]*)\}/)?.[1] ?? "";
  assert.match(tokens, /--esp-1:\s*\.25rem;/);
  assert.match(tokens, /--esp-8:\s*2rem;/);
  assert.match(tokens, /--foco-largura:\s*2px;/);
  assert.match(tokens, /--alvo-toque:\s*44px;/);
  assert.match(ultimoBloco(app, /\.cartao\s*\{([^}]*)\}/g), /padding:\s*clamp\(var\(--esp-4\)/);
});

test("títulos comuns equilibram linhas e destinos internos respeitam o topo fixo", () => {
  assert.match(app, /\.titulo-pag,\s*\.titulo-sec\s*\{[^}]*text-wrap:\s*balance/s);
  assert.match(app, /h1\[id\],\s*h2\[id\]\s*\{[^}]*scroll-margin-block-start:\s*calc\(var\(--topo\)\s*\+\s*var\(--esp-4\)\)/s);
});

test("opções dos menus popover mantêm um anel de foco real no teclado", () => {
  const focos = [...app.matchAll(/\.menu-item:focus-visible,\s*\.empresa-op:focus-visible\s*\{([^}]*)\}/g)].map(m => m[1]);
  assert.ok(focos.some(foco => /outline:\s*var\(--foco-largura\)\s*solid\s*var\(--c-foco\)/.test(foco)
    && /background:\s*var\(--c-hover\)/.test(foco)), "foco padrão combina contorno e superfície tokenizados");
});

test("foco no campo destaca o rótulo e erro ganha ritmo legível", () => {
  assert.match(app, /\.campo:focus-within\s*>\s*label\s*\{[^}]*color:\s*var\(--c-prim-luz\)/s);
  assert.match(ultimoBloco(app, /\.campo-erro\s*\{([^}]*)\}/g), /line-height:\s*1\.4;[^}]*margin-block-start:\s*var\(--esp-1\)/s);
});

test("estado inválido tem borda reforçada sem depender apenas da cor", () => {
  const invalido = ultimoBloco(app, /\.campo\s+\[aria-invalid="true"\],\s*\.cor-hex\[aria-invalid="true"\]\s*\{([^}]*)\}/g);
  assert.match(invalido, /border-width:\s*2px;/);
  assert.match(invalido, /border-style:\s*solid;/);
});

test("chips de formulário usam transições específicas, sem transition all", () => {
  assert.match(app, /\.chip-check\s+span\s*\{[^}]*transition:\s*background-color[\s\S]*?border-color[\s\S]*?color/s);
  assert.doesNotMatch(app, /transition:\s*all\b/i);
});

test("tabelas alinham números e dão retorno de pressionamento às linhas acionáveis", () => {
  assert.match(ultimoBloco(app, /\.tabela\s+\.dir\s*\{([^}]*)\}/g), /font-variant-numeric:\s*tabular-nums/);
  assert.match(ultimoBloco(app, /\.tabela-clicavel\s+tbody\s+tr:active\s*\{([^}]*)\}/g), /background:\s*var\(--c-sup-2\)/);
});

test("foco por teclado em linhas de tabela também muda a superfície", () => {
  assert.match(ultimoBloco(app, /\.tabela-clicavel\s+tbody\s+tr:focus-visible\s*\{([^}]*)\}/g), /background:\s*var\(--c-hover\)/);
});

test("diálogos cabem entre as safe areas em alturas dinâmicas", () => {
  const modal = ultimoBloco(app, /\.modal\s*\{([^}]*)\}/g);
  assert.match(modal, /max-height:\s*min\(calc\(100dvh\s*-\s*env\(safe-area-inset-top\)[^;]*\),\s*var\(--modal-max-h\)\)/);
  assert.match(modal, /width:\s*min\(var\(--modal-max-w\),\s*calc\(100vw\s*-\s*env\(safe-area-inset-left\)[^;]*\)\)/);
});

test("corpo do diálogo contém a rolagem e mantém espaço para o foco", () => {
  const corpo = ultimoBloco(app, /\.modal-corpo\s*\{([^}]*)\}/g);
  assert.match(corpo, /overscroll-behavior:\s*contain;/);
  assert.match(corpo, /scroll-padding-block:\s*var\(--esp-4\)/);
});

test("ações de diálogo viram uma coluna utilizável em celulares estreitos", () => {
  const estreito = ultimaMedia(app, "max-width: 420px");
  assert.match(estreito, /\.modal-rod\s*\{[^}]*display:\s*grid;[^}]*grid-template-columns:\s*minmax\(0,\s*1fr\)/s);
  assert.match(estreito, /\.modal-rod\s+\.bt\s*\{[^}]*width:\s*100%/s);
});

test("toast respeita safe areas em desktop e fica acima da navegação móvel", () => {
  const toasts = [...app.matchAll(/\.toasts\s*\{([^}]*)\}/g)].map(m => m[1]);
  assert.ok(toasts.some(css => /right:\s*max\(var\(--esp-4\),\s*env\(safe-area-inset-right\)\)/.test(css)));
  assert.ok(toasts.some(css => /bottom:\s*max\(var\(--esp-4\),\s*env\(safe-area-inset-bottom\)\)/.test(css)));
  assert.match(ultimaMedia(app, "max-width: 760px"), /\.toasts\s*\{[^}]*bottom:\s*calc\(var\(--barra\)\s*\+[^}]*safe-area-inset-bottom/s);
});

test("ações de fechar e desfazer no toast chegam a 44 px em telas de toque", () => {
  const toque = ultimaMedia(app, "pointer: coarse");
  assert.match(toque, /\.toast-x,\s*\.toast-acao\s*\{[^}]*min-width:\s*var\(--alvo-toque\);[^}]*min-height:\s*var\(--alvo-toque\)/s);
});

test("mensagens da faixa de conexão quebram linhas longas e formatam tempos", () => {
  assert.match(ultimoBloco(shell, /\.faixa-rede\s+\.rede-msg\s*\{([^}]*)\}/g), /overflow-wrap:\s*anywhere/);
  assert.match(ultimoBloco(shell, /\.rede-espera\s*\{([^}]*)\}/g), /white-space:\s*normal;[^}]*font-variant-numeric:\s*tabular-nums/s);
});

test("banners e menus elevam alvos interativos para 44 px em ponteiro de toque", () => {
  const toque = ultimaMedia(shell, "pointer: coarse");
  assert.match(toque, /\.faixa\s+\.bt,[\s\S]*?\.menu-item,[\s\S]*?\.flut-op,[\s\S]*?\{[^}]*min-height:\s*var\(--alvo-toque\)/s);
});

test("controles comuns usam toque imediato e cor de destaque white-label", () => {
  assert.match(app, /button,\s*a,\s*\[role="button"\],\s*\[role="tab"\],\s*\[role="option"\],\s*\[role="menuitem"\],\s*input,\s*select,\s*textarea,\s*summary\s*\{[^}]*touch-action:\s*manipulation;[^}]*-webkit-tap-highlight-color:\s*var\(--c-sel\)/s);
});

test("barra móvel e menus preservam foco visível em alto contraste e áreas seguras", () => {
  const altoContraste = ultimaMedia(app, "forced-colors: active");
  assert.match(altoContraste, /\.menu-item:focus-visible,[\s\S]*?\.empresa-op:focus-visible\s*\{[^}]*outline-color:\s*Highlight/s);
  assert.match(ultimaMedia(app, "max-width: 760px"), /\.barra\s*\{[^}]*left:\s*0;[^}]*right:\s*0;[^}]*padding-inline:\s*max\(8px,\s*env\(safe-area-inset-left\)\)/s, "barra de borda a borda; o notch só empurra os botões");
  assert.match(ultimaMedia(app, "max-width: 760px"), /html\.cv-chat-aberto \.toasts\s*\{[^}]*bottom:\s*auto/s, "com a conversa aberta o aviso não cobre o campo de mensagem");
});

test("contrato transversal preserva hidden e mantém a camada nova em cores tokenizadas", () => {
  assert.match(app, /\[hidden\]\s*\{\s*display:\s*none\s*!important;\s*\}/);
  const appInicio = app.lastIndexOf("/* ÓRBITA · consistência transversal 2026-10-03 */");
  const shellInicio = shell.lastIndexOf("/* ÓRBITA · shell transversal 2026-10-03 */");
  assert.ok(appInicio >= 0 && shellInicio >= 0, "as duas camadas de melhorias devem estar documentadas");
  const novaCamada = app.slice(appInicio);
  const novaShell = shell.slice(shellInicio);
  assert.doesNotMatch(`${novaCamada}\n${novaShell}`, /#[0-9a-f]{3,8}\b/i);
  const grades = [...`${novaCamada}\n${novaShell}`.matchAll(/grid-template-columns\s*:\s*([^;]+)/g)].map(m => m[1]);
  assert.ok(grades.every(g => !/\b1fr\b/.test(g) || /minmax\(0,\s*1fr\)/.test(g)), "grades flexíveis devem usar minmax(0, 1fr)");
});
