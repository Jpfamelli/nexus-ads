import test from "node:test";
import assert from "node:assert/strict";
import { readFileSync } from "node:fs";

const ler = p => readFileSync(new URL(`../${p}`, import.meta.url), "utf8");
const inicio = ler("web/app/inicio.js");
const conv = ler("web/app/conversas.css");
const shell = ler("web/app/shell.css");
const crm = ler("web/app/crm.css");
const agenda = ler("web/app/agenda.css");
const app = ler("web/app/app.css");
const conversas = ler("web/app/conversas.js");
const api = ler("web/app/api.js");

test("R1: a fila de atendimento vem antes do checklist de configuração", () => {
  const fila = inicio.indexOf('if (abertos.length) corpo.append');
  const checklist = inicio.indexOf('if (onbRes) corpo.append(cartaoChecklist(onbRes))', inicio.indexOf('const { abertos, recolhidos }'));
  assert.ok(fila >= 0 && checklist > fila, "pendências operacionais devem aparecer antes do onboarding");
});

test("R1: responder citando permanece acessível em telas móveis", () => {
  // plano 50 · 31: o «Responder» mora em .cv-msg-acoes (com «Copiar»), ao lado da bolha; no celular os botões têm 44 px e a caixa fica meio visível sem hover
  assert.match(conv, /@media \(max-width: 760px\)[\s\S]*?\.cv-msg-acoes\s*\{[^}]*opacity:\s*\.7/s);
  assert.match(conv, /@media \(max-width: 760px\)[\s\S]*?\.cv-msg-acoes \.bt-icone\s*\{[^}]*min-width:\s*44px[^}]*min-height:\s*44px/s);
  assert.match(conv, /\.cv-msg:hover \.cv-msg-acoes, \.cv-msg-acoes:focus-within \{ opacity: 1; \}/, "aparece no hover e no foco de teclado");
  assert.match(conv, /@media \(hover: none\) \{ \.cv-msg-acoes \{ opacity: \.7; \}/, "no toque nunca fica invisível");
  assert.match(ler("web/app/cv-chat.js"), /class: "bt-icone cv-responder", "aria-label": "Responder a esta mensagem"/);
});

test("R1: citação, responder, fila e cancelamento de upload têm alvo confortável", () => {
  assert.match(conv, /\.cv-cita\s*\{[^}]*min-height:\s*44px/s);
  assert.match(conv, /\.cv-fila \.bt\s*\{[^}]*min-height:\s*44px/s);
  assert.match(conv, /\.cv-prog-cancel\s*\{[^}]*min-height:\s*44px/s);
});

test("R1: cabeçalho móvel da conversa tem botões de pelo menos 44 px", () => {
  assert.match(conv, /\.cvc-voltar\s*\{[^}]*width:\s*44px[^}]*height:\s*44px/s);
  assert.match(conv, /\.cvc-acoes > \.bt:not\(\.bt-icone\)\s*\{[^}]*min-height:\s*44px/s);
  assert.match(conv, /\.cvc-acoes \.bt-icone\s*\{[^}]*width:\s*44px[^}]*height:\s*44px/s);
});

test("R1: ação de reconexão cabe em um toque no celular", () => {
  assert.match(shell, /\.faixa-rede \.bt\s*\{[^}]*min-height:\s*44px/s);
});

test("R1: etapas do CRM têm alvo de 44 px e deixam visível que há mais etapas", () => {
  assert.match(crm, /\.kb-fita\s*\{[^}]*scrollbar-width:\s*thin/s);
  assert.match(crm, /\.kb-fita-b\s*\{[^}]*min-height:\s*44px/s);
  assert.match(crm, /\.kb-fita::-webkit-scrollbar\s*\{[^}]*height:\s*4px/s);
});

test("R1: editar o título de um negócio tem alvo de toque de 44 px", () => {
  assert.match(crm, /\.ng-lapis\s*\{[^}]*width:\s*44px[^}]*height:\s*44px/s);
});

test("R1: seleção de dias e horários da Agenda respeita alvos de 44 px", () => {
  assert.match(agenda, /\.ag-dia-chip\s*\{[^}]*min-height:\s*44px/s);
  assert.match(agenda, /\.ag-hora-pill\s*\{[^}]*min-height:\s*44px/s);
  assert.match(agenda, /\.ag-dia-mais\s*\{[^}]*width:\s*44px[^}]*height:\s*44px/s);
});

test("R1: campos móveis usam 16 px para evitar zoom automático no iPhone", () => {
  assert.match(app, /@media[^{}]*\(max-width:\s*760px\)[\s\S]*?\.campo input:not\(\[type=checkbox\]\):not\(\[type=radio\]\)[\s\S]*?font-size:\s*var\(--fs-16\)/s);
});

test("R3: sem IndexedDB e sem rede a mensagem não finge estar na fila; preserva o texto no campo", () => {
  assert.match(conversas, /if \(offline\) \{[\s\S]*?persistido = \(await filaSalvar\(it\)\) \|\| persistido;[\s\S]*?if \(!persistido\) \{[\s\S]*?A\.msgs = A\.msgs\.filter\(m => m\.ref !== it\.id\);[\s\S]*?O texto continua no campo/s);
});

test("R3: falha transitória do Storage tem mensagem recuperável, distinta de arquivo removido", () => {
  assert.match(api, /midia_indisponivel:\s*\"[^\"]*temporariamente indisponível[^\"]*Tente novamente[^\"]*\"/);
});
