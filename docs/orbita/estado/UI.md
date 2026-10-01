# Interface do Órbita — registro de QA visual

Este arquivo guarda os resultados de QA de interface (`web/app/`). O estado geral de entrega fica em `ESTADO.md` e `F8.md`.

## QA mobile autenticado 30/09

Gate "mobile autenticado + console" da F8 (ESPEC §8.5, itens 15 e 16). Feito em 30/09/2026 por Claude, contra o backend REAL
(Supabase `dtjznipitihnwmcgpzqh`), sem `dev-falso`. Nada foi commitado, publicado ou implantado; `web/app/prontos.js` do repositório continua fechado.

### Como foi montado

- Cópia de `web/` fora do repositório, com `app/prontos.js` liberando todos os módulos e todas as seções de configuração (só na cópia).
- Servidor estático local (127.0.0.1) que imita os cabeçalhos do `netlify.toml` (CSP de `/app/*` e das entradas `/crm/`, `/ads/`, `/atendimento/`; `/` e `/index.html` → `/app/`). Assim uma violação de CSP apareceria no console.
- Sessão de 2 h criada para a "Conta E2E Órbita" (administradora do tenant `teste-e2e`, NÃO é gestor/super), injetada no `localStorage` do navegador (`nx-token`, `nx-app-cliente`).
  O token ficou só num arquivo do scratchpad; a sessão foi apagada no fim.
- Semente no tenant `teste-e2e`, pelas RPCs do próprio app, com prefixo `QA-3009`: um negócio (origem anúncio, plataforma Google, campanha e anúncio de teste), uma consulta agendada para 01/10 às 10:00,
  uma tarefa, e uma conversa (contato do negócio no canal Meta de teste, sem envio) com duas notas internas. Tudo apagado no fim (ver "Limpeza").
  O agente do E2E (prefixo `E2E-3009`) trabalhava no mesmo tenant; os dados dele não foram tocados e apareceram nas telas (conversas, campanhas e alertas de anúncio, notificações).
- Puppeteer-core + Chrome instalado, headless, emulação de celular (toque, DPR 2) em 375×812 e 390×844 e desktop 1440×900. Cada largura rodou 67 telas/estados numa sessão de navegador limpa.

### Critérios medidos em cada tela e largura

`documentElement.scrollWidth <= innerWidth` (e `body`); erros e avisos de console; exceções de página; respostas HTTP ≥ 400 e requisições que falharam;
texto solto "null/undefined/NaN"; alvos de toque com menor lado < 32 px; texto < 11 px; contraste do texto (4,5:1, 3:1 para texto grande) com o fundo efetivo;
texto cortado sem reticências; controle coberto por outro elemento. Capturas conferidas a olho em folhas de contato.

### O que foi visto, por tela (resultado final, depois das correções)

Em 375, 390 e 1440: 67/67 telas sem rolagem horizontal, 0 erros ou avisos de console, 0 exceções de página, 0 respostas 4xx/5xx e 0 requisições falhas.

| Tela ou estado | O que foi conferido |
|---|---|
| Login (antes da sessão) e envio vazio | Layout e foco ok; "Informe o e-mail." aparece sem chamar o servidor. Entradas `/crm/`, `/ads/`, `/atendimento/` sem sessão vão para `/app/?produto=…#/login` com o título do produto. |
| Início | Cartões de atendimento, leads, vendas, tarefas e números de WhatsApp; sino com notificações; barra inferior no celular. |
| Conversas | Lista com abas, conversa QA, chat com notas internas, compositor com janela fechada (banner + botão Modelos), "Nova conversa", filtros, menu ⋮, ficha do contato, seletor de modelos (sem modelos no canal). |
| CRM | Kanban (coluna com o negócio QA, cartão com Google Ads, campanha e anúncio), "Nova oportunidade", filtros, gaveta do negócio (origem Google Ads, anúncio «QA-3009 Anuncio Limpeza», campanha «QA-3009 Campanha Busca»), lista de pacientes, ficha do paciente, "Novo paciente", empresas, tarefas. |
| Agenda | Dia (01/10 com a consulta QA) e semana; "Marcar consulta"; navegação por setas. |
| Anúncios | Visão geral, campanhas, radar e relatórios/prévias. Com métricas do agente E2E-3009 na maior parte do tempo; o estado vazio "Nenhum número de anúncio ainda" foi visto em uma captura de 1440 do primeiro passe. |
| Relatórios | Vendas e atendimento (funil, origem, ganhos R$ 1.000 do tenant, "sem base" nos comparativos). |
| Automações | Lista com a automação do E2E e modelos prontos (inclui os de texto livre CodeWords). |
| Configurações | Hub; Perfil; Usuários e convites; Plano e uso; Funis; Campos; Etiquetas; Motivos de perda; Números de WhatsApp (canal Meta, canal CodeWords e o cartão "Adicionar WhatsApp pelo CodeWords", só aberto e fechado); Respostas rápidas; Preferências do atendimento; Assistente de IA; Departamentos e horários; Agenda e horários; Formulário do site; Site e anúncios (script de rastreio em bloco de código que quebra linha). |
| Seções só de gestor/super | "Marca e tema", "Domínio próprio" e "Anúncios" (integrações Meta/Google) mostram "Esta seção não está disponível" para a conta admin de cliente. `#/admin/clientes` e `#/admin/dominios` mostram "Você não tem acesso a esta área" sem nenhuma requisição e sem erro de console. Rota inexistente mostra "Página não encontrada". |
| Tema | Abre claro; o menu do topo troca para escuro, o esquema persiste ao recarregar (`nx-app-esquema`) e volta para claro. Início, chat, CRM, agenda e IA conferidos nos dois temas. |

### Defeitos encontrados e corrigidos (todos em `web/app/`)

| Arquivo | Defeito visto no celular/desktop | Correção |
|---|---|---|
| `conversas.css` | Cabeçalho do chat (≤ 390 px): o botão "Resolver" perdia o rótulo (só ✓) e esticava pela linha inteira. | Rótulo volta a aparecer em ≤ 760 px. |
| `conversas.css`, `cv-chat.js` | Subtítulo do chat cortado seco ("via WhatsApp E2E (fals"), inclusive no desktop; separador "·" sobrando quando o protocolo some. | Só o nome do número encolhe, com reticências; separador do protocolo some junto com o protocolo (classe `cvc-proto-sep`). |
| `conversas.css` | Compositor com ~120 px de largura no celular (ferramentas ao lado do campo); o texto "Janela fechada…" quebrava em 5 linhas e o bloco passava de 260 px. | Em ≤ 760 px o campo ocupa a largura toda e as ferramentas + enviar ficam numa linha embaixo. |
| `conversas.css` | No desktop as abas "Todas abertas / Pendentes / Resolvidas / Ocultas" ficavam escondidas além da borda da coluna (faixa rolável sem barra; com mouse não há como rolar). | Em ≥ 761 px as abas quebram de linha; o celular mantém a faixa rolável. |
| `crm.css` | "Novo paciente" (lista), "Abrir conversa / Oportunidade / Tarefa" (ficha e gaveta do negócio) com o texto cortado: `flex: 1` (base 0) numa linha que deveria quebrar. | `flex: 1 1 auto`; primário em linha própria; ⋮ ao lado dos outros. |
| `crm.css` | Título do negócio na gaveta cortado seco na borda; toque de 31 px. | Reticências, fonte menor e altura mínima de 40 px no celular. |
| `crm.css` | Cartão do contato na gaveta: "Abrir conversa" espremido e cortado. | O bloco de botões desce para a linha de baixo quando não cabe. |
| `crm.css` | Painel "Filtros" do CRM (popover de 320 px com conteúdo de 343 px): "Qualquer pessoa", "Orgânico" e "Máximo" cortados na borda direita. | Largura do conteúdo e do popover alinhadas (cabe de 375 a 1440). |
| `app.css` | Chip da empresa na barra do topo em ≤ 480 px espremido a ~30 px ("Ó" / "A.."). | Só o avatar aparece; o nome continua para leitor de tela e nos rótulos das telas. Papel do chip de 10,5 para 11 px. |
| `app.css` | Botões do rodapé dos modais com `flex: 1` cortavam "Salvar configuração". | `flex: 1 1 auto`. |
| `app.css` | "Esqueci a senha" e outros botões de link com 21 px de altura. | Altura mínima de 32 px (44 px em toque). |
| `config.js`, `graficos.js`, `crm-listas.js`, `admin.js`, `anuncios.js`, `cv-composer.js`, `cv-config.js` | `Element.append(cond ? x : null)` escreve a palavra "null" na tela. Visto em Configurações → Plano e uso; o mesmo padrão existia em legendas de gráfico com uma série, ficha no painel lateral, aviso de domínios para não-super, prévia de relatório, atalho do canal sem token e formulário CodeWords sem departamento. | `.append(...[…].filter(Boolean))`; teste estático novo proíbe o padrão. |
| `agenda.js`, `agenda-config.js` | Botões `bt bt-icone`: o padding do `.bt` esmagava o ícone para 7 px (setas do período quase invisíveis; "×" das faixas de horário). | Só `bt-icone`. |
| `agenda.js`, `agenda.css` | "Qui., 01 De Out." (CSS `capitalize`). | Só a 1ª letra maiúscula, feita no JS. |
| `tema.js`, `app.css`, `conversas.css`, `agenda.css` | Contraste abaixo de 4,5:1 no tema claro: verde ok sobre fundo suave 4,12; pílulas primária/secundária 4,35–4,44; avatares 3,9; rótulo "Nota interna" 4,39; contadores das abas 3,5; "Este atendimento" 4,44; hora da agenda no escuro 4,48. | Verde `#1A6E44`; texto das pílulas e do rótulo misturado com a cor de texto; avatar com mais texto na mistura; contador sem `opacity`. Teste novo cobre as pílulas de status. |
| `index.html` | Cache: os arquivos mudaram. | `?v=20260930j` (era `20260930i`) em `antes.js`, `app.css` e `app.js`. |

Testes: `testes/app.teste.mjs` ganhou 3 testes (contraste das pílulas; proibição de `append` com argumento nulo; CSS mobile que impede a volta dos cortes). `node testes/rodar-tudo.mjs`: 14/14 arquivos.

### Requisições

- Nenhuma resposta 4xx/5xx nem requisição falha em nenhuma das 201 telas/estados (3 larguras). O app nega as telas de gestor/super no próprio cliente, antes de chamar o banco.
- Chamadas diretas com a sessão da conta (fora da interface) a `nx_clientes_admin`, `nx_orgs_listar`, `nx_dominios_listar` e `nx_planos_listar` devolvem 401 com `so_gestor`, como esperado.

### Não testado ou não provado

- Estado "Conversas sem número": o tenant tem canais (Meta de teste e CodeWords do E2E); só o estado "sem conversa selecionada" foi visto no desktop.
- Estado "Anúncios sem métricas": visto uma vez (1440); nas demais passagens o agente E2E tinha métricas no tenant. A tela com métricas e alertas foi validada nas três larguras.
- Telas de gestor/super (Marca e tema, Domínio próprio, integrações Meta/Google, Admin, revendas) em si: a conta é admin de cliente. Só a negação foi testada. Papéis menores (atendente, leitura) não foram testados.
- Envio real de texto, modelo, áudio ou arquivo; microfone; importação de CSV; arrastar cartões com gesto de toque real; teclado virtual; iOS Safari e Firefox. Foi só Chrome headless com emulação de celular, não aparelho real.
- ~~Com um modal aberto, o botão Voltar do navegador muda a rota por baixo e o modal continua aberto.~~ **Corrigido em a1fc214** (30/09): `ui.camadas` empurra uma entrada de histórico por modal; Voltar fecha o modal e mantém a rota; fechar por botão/Esc desfaz a entrada; `navegar()` espera o `history.back()` e reaproveita a entrada do modal. Provado no Chrome (dev-falso, 375 px): Voltar fecha, Fechar + Voltar vai para a rota anterior em 1 toque, Ctrl+K → resultado termina na rota nova sem entrada sobrando. Gaveta (CRM é dirigida pela rota) não foi alterada.
- ~~Nas tabelas que viram cartões no celular, os botões de ordenação do cabeçalho ficam ocultos mas continuam focáveis pelo teclado.~~ **Corrigido em a1fc214**: `.tabela thead` ganhou `visibility: hidden` no layout de cartões (Usuários, 375 px: 0 foco no cabeçalho em 60 Tab; forçando `visible` eram 9).
- O "select de departamento coberto pelo botão primário" (Configurações › Números, cartão CodeWords, 375 px) **não é sobreposição real**: o select está abaixo da área visível do corpo do modal (que rola), e a checagem geométrica (`elementFromPoint`) cai no botão do rodapé. Conferido: rodapé fora do corpo que rola (sem `position: sticky/fixed`), todos os controles ficam livres depois de rolados até eles. Sem mudança de layout; teste de regressão garante a estrutura.

### Limpeza

Negócio, contato, conversa, mensagens (notas), tarefa e consulta `QA-3009` apagados pelas RPCs do próprio app; sessão de teste apagada; servidor e cópia de `web/` descartados. Conferido por consulta: nenhum registro `QA-3009` restante.

## QA final 30/09

Segunda passada do gate "mobile autenticado + console" (ESPEC §8.5, itens 15 e 16), agora sobre a versão FINAL (HEAD `afca7e4` + as correções desta seção) e com a `<meta>` de CSP nova (`97460df`) ativa junto do cabeçalho. Feita em 30/09/2026 por Claude contra o backend REAL
(Supabase `dtjznipitihnwmcgpzqh`), sem `dev-falso`. `web/app/prontos.js` do repositório continua fechado; nada foi publicado, enviado ou implantado.

### Como foi montado

- Cópia de `web/` fora do repositório; só na cópia, `app/prontos.js` libera todos os módulos e todas as telas de configuração (é o que a liberação vai fazer).
- Servidor estático em 127.0.0.1 que lê o `netlify.toml` REAL a cada subida (7 blocos de cabeçalhos e 2 redirects: CSP de `/app/*` e das entradas `/crm/`, `/ads/`, `/atendimento/`; `/` e `/index.html` → `/app/`). Resultado conferido por `curl`: o `/app/` sai com a CSP do cabeçalho e o HTML traz a mesma CSP na `<meta>`, então as duas valem ao mesmo tempo.
- Sessão de 2 h para a "Conta E2E Órbita" (admin do tenant `teste-e2e`, não é gestor/super): só o hash sha256 foi para o banco (por SQL); o token ficou num arquivo do scratchpad e foi injetado no `localStorage` do navegador. Apagada no fim, por hash exato.
- Dados `QA2-3009` no `teste-e2e`: um negócio de origem anúncio com plataforma Google, campanha «QA2-3009 Campanha Busca» e anúncio «QA2-3009 Anuncio Limpeza» (RPC do app + `UPDATE` do selo de anúncio, porque `nx_negocio_salvar` não grava plataforma/campanha); uma consulta para 01/10 10:00; uma tarefa; um contato; uma conversa no canal Meta de teste com duas notas internas (sem nenhum envio). Para ver Anúncios com números, 28 linhas de métrica fictícias `QA2-3009-*` (Google e Meta × campanha e anúncio × 7 dias), apagadas antes das 21:07 (hora do `nx-ciclo`) para o robô não tratar o radar.
- Puppeteer-core + Chrome instalado (headless, emulação de celular com toque e DPR 2): 375×812, 390×844 e 1440×900. Cada largura rodou 67 telas/estados numa sessão de navegador limpa.
- Detectores novos nesta passada (além dos da rodada anterior): evento `securitypolicyviolation` repassado ao Node (sobrevive a navegação), rolagens internas reais (`overflow-x` auto/scroll com `scrollWidth > clientWidth`) e vazamento de texto/conteúdo gerado para fora do recorte de um ancestral (o detector antigo só via o elemento que ele mesmo recorta; os dois primeiros defeitos abaixo foram vistos a olho nas capturas e só então o detector novo passou a pegá-los).

### Contagem de telas × larguras (versão final)

| Largura | Telas/estados | Sem rolagem horizontal | Erros/avisos de console | Exceções | Respostas ≥ 400 ou requisição falha | Violações de CSP | Texto «null/undefined/NaN» | Contraste < 4,5:1 |
|---|---|---|---|---|---|---|---|---|
| 375×812 | 67 | 67 | 0 | 0 | 0 | 0 | 0 | 0 |
| 390×844 | 67 | 67 | 0 | 0 | 0 | 0 | 0 | 0 |
| 1440×900 | 67 | 67 | 0 | 0 | 0 | 0 | 0 | 0 |
| **Total** | **201** | **201** | **0** | **0** | **0** | **0** | **0** | **0** |

Os 67 estados por largura: login e envio vazio (2); Início (1); Conversas lista, chat e compositor (3); CRM kanban, gaveta, pacientes e ficha (4); Empresas (1); Tarefas (1); Agenda dia e semana (2); Anúncios visão geral, campanhas, radar e relatórios (4); Relatórios vendas e atendimento (2); Automações (1);
Configurações: hub, 18 seções e o cartão "Adicionar WhatsApp pelo CodeWords" aberto (20); `#/admin/clientes` e `#/admin/dominios` negados e rota inexistente (3); 12 sobreposições (ficha do contato, menu ⋮, modelos, nova conversa, filtros de Conversas, nova oportunidade, filtros do CRM, marcar consulta, novo paciente, busca, nova tarefa, gaveta com "Abrir conversa"); sino, menu de tema e "Mais" (3);
tema escuro em Início, chat, CRM, agenda e IA (5); entradas `/crm/`, `/ads/` e `/atendimento/` com sessão (3).
Fora dessa grade, por largura: entradas SEM sessão (3 → `/app/?produto=…#/login`, título do produto, 0 log e 0 4xx), tema pelo menu (Escuro → recarrega e persiste → Claro, `nx-app-esquema`) e, com logo largo, 9 cenários (ver abaixo). Soma geral: 201 + 9 + 3 + 9 = 222 verificações (a rolagem horizontal da página foi medida nas telas, nas entradas sem sessão e nos cenários do logo).

Primeira passada (antes das correções): os mesmos 201 estados já tinham 0 console, 0 exceções, 0 4xx/5xx, 0 CSP e 0 rolagem da página; os defeitos abaixo foram achados a olho nas capturas (folhas de contato, 6 telas por folha, 1440×900 no máximo) e pelos detectores novos.
Anúncios foi visto sem números (1ª passada) e com números (demais), nas três larguras.

### Defeitos encontrados e corrigidos (todos em `web/app/`)

| Arquivo | Defeito visto | Correção |
|---|---|---|
| `conversas.css` | Configurações › Respostas rápidas, 1440: a Prévia era `<span>` (inline: `overflow` e `text-overflow` não valem) e a tabela ficava com 1.242 px dentro de um cartão de 887 px; Departamento, Usos e Situação ficavam além da borda, só alcançáveis por rolagem sem barra. | A Prévia é bloco com reticências; de 761 px em diante a coluna Prévia é a flexível (`td:has(> .cfg-resp-corpo) { width: 100%; max-width: 0 }`) e a tabela passa a caber no cartão de 887 px do 1440 (a rolagem interna some). |
| `relatorios.css` | Anúncios › Campanhas em 375 e 390 (só aparece com números): o rótulo "CUSTO POR CONVERSA" do cartão de campanha (`white-space: nowrap` herdado de `.num`) passava da coluna de ~95 px e o cartão rolava para o lado ("CUSTO POR CONV"). Os botões de ordenação do cabeçalho oculto continuavam focáveis. | Rótulo quebra de linha, valores alinhados pela base (`align-items: end`), cabeçalho oculto com `visibility: hidden`. |
| `relatorios.css` | Configurações › Formulário do site: o texto das instruções do CodeWords (parágrafos longos) estava em `<pre>` com `white-space: pre` e só se lia rolando na horizontal, em todas as larguras. | `white-space: pre-wrap; overflow-wrap: anywhere` (como o bloco do script de rastreio). |
| `crm.css` | Ficha do contato na gaveta de 820 px (Conversas › nome do contato) em 1440: a grade da ficha tinha duas colunas e "Dados" ficava com ~320 px; nome, telefone, responsável e origem apareciam cortados ("QA2-3009 Pac", "(11) 90009-30"). | `.gaveta .fx-grade` com uma coluna só. |
| `app.css` | Placeholder longo cortado seco no celular ("Buscar pacientes, oportunida", "Como o agente se apresenta no WhatsAp"). | `text-overflow: ellipsis` nos campos e na busca global. |
| `relatorios.css`, `app.css` | "Relatórios" (Anúncios) e "Concluídas" (Tarefas) cortados pela borda em 375 px. | Em ≤ 400 px as abas ficam um pouco mais justas e as faixas de 4 abas cabem inteiras. |
| `index.html` | Cache. | `?v=20260930m` (era `20260930l`). |

Testes: `testes/app.teste.mjs` ganhou 1 teste com 11 asserções (as 6 correções de CSS acima). `node testes/rodar-tudo.mjs`: 15/15 arquivos; `node testes/app.teste.mjs`: 71 ok · 0 falha.

### Logo largo no menu lateral (correção `e11770b`)

A org do teste não tem marca própria (sem logo configurado). O logo largo foi injetado só na resposta de `nx_marca_publica` que o navegador recebe (nada foi gravado no banco). Medido o menu lateral e o topo:

| Cenário | Resultado |
|---|---|
| 375 e 390, claro; 375, escuro | Menu lateral não aparece (barra inferior); logo no topo com 34×34, sem sobreposição. |
| 1024 e 1100 | Menu só de ícones: logo encolhido para 36 px, nome do produto fora da vista (`sr-only`), sem cobrir o resto. |
| 1101 e 1440, claro e escuro | Logo de 150×32 px no lugar do símbolo; o nome vira `sr-only` (não há texto por baixo do logo) e não cobre o botão de recolher. |
| 1440 com o menu recolhido | Logo de 36 px dentro do trilho. |
Em todos: 0 erros de console, 0 violações de CSP (`img-src` inclui `data:`), sem rolagem da página.

### Observações (não são defeitos)

- Faixas e tabelas que rolam na horizontal DENTRO do cartão, de propósito: abas e etiquetas de Conversas, faixa de selos do cabeçalho do chat ("Janela fechada", dono, departamento) no celular, Kanban, abas e fita de etapas da gaveta do negócio, e as tabelas "Por responsável" (Vendas) e "Por atendente" (Atendimento) em ≤ 390 px, onde as duas últimas colunas só aparecem rolando (não há indicador de rolagem).
- Alvos de 30 px de altura com mouse em 1440 (botões "Novo/Tarefa/Resumir", "+" das colunas do Kanban, ícones das notas, filtros) e iniciais dos avatares com 9,5–10 px: aceitos na rodada anterior e mantidos.
- O menu lateral em 1440 tem `scrollWidth` 240 contra `clientWidth` 231: é o brilho decorativo (`.lateral::after`, 24 rem) recortado por `overflow: hidden`; nenhum conteúdo sai da caixa.
- O sino abre sobre a página e cobre botões do Início (esperado: é um popover).
- A correção das Respostas rápidas usa `:has()` (Chrome 105+, Safari 15.4+, Firefox 121+); sem ele a coluna volta ao comportamento antigo (rolagem dentro do cartão), sem quebrar nada.

### Não testado ou não provado

- O que a rodada anterior já listava: Conversas sem número, telas de gestor/super em si (só a negação), papéis menores, envio real de texto/modelo/áudio/arquivo, microfone, importação de CSV, arrastar cartões com toque real, teclado virtual, iOS Safari e Firefox (só Chrome headless com emulação de celular).
- Larguras de tablet (768 e 1024) só no teste do logo; as telas completas rodaram em 375, 390 e 1440.
- Radar com alertas e relatórios de Anúncios só vistos com os dados fictícios deste teste (2 alertas de custo por conversa); nada foi enviado ao WhatsApp.

### Limpeza

Negócio, contato, conversa e notas, tarefa e consulta `QA2-3009` apagados pelas RPCs do próprio app (`nx_negocio_excluir`, `nx_contato_excluir`); 28 métricas `QA2-3009-*` apagadas por `DELETE` limitado ao `teste-e2e` e ao prefixo; sessão de teste apagada por hash; servidor derrubado; cópia de `web/` e arquivo do token descartados. Conferido por consulta em todas as tabelas de `public` (contagem de linhas que contêm `QA2-3009`): 0 em todas; e 0 linhas novas nas últimas 2 h do `teste-e2e` em notificações, auditoria, histórico, conversas, contatos, negócios, tarefas e alertas.
