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
- Com um modal aberto, o botão Voltar do navegador muda a rota por baixo e o modal continua aberto (comportamento anterior, não alterado).
- Nas tabelas que viram cartões no celular, os botões de ordenação do cabeçalho ficam ocultos mas continuam focáveis pelo teclado.

### Limpeza

Negócio, contato, conversa, mensagens (notas), tarefa e consulta `QA-3009` apagados pelas RPCs do próprio app; sessão de teste apagada; servidor e cópia de `web/` descartados. Conferido por consulta: nenhum registro `QA-3009` restante.
