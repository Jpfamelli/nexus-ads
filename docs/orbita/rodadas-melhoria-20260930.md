# Órbita — três rodadas de melhoria

Data: 2026-09-30 · Branch `codex/orbita` · PR #1 (draft)

## Rodada 1 — três entradas de produto

- Criadas entradas independentes `/crm/`, `/ads/` e `/atendimento/`, cada uma com nome, rota inicial, manifesto PWA e ícone do Órbita. Elas usam o mesmo login, tenant, permissões e banco.
- O CRM concentra oportunidades, contatos, empresas, tarefas e agenda. Nexus Ads concentra aquisição, campanhas e relatórios. Atendimento concentra conversas, equipe e agenda.
- Incluídos seletor de produtos no topo, menu filtrado por área e títulos de página próprios. As verificações de papel, plano e `prontos.js` continuam no shell compartilhado.
- Aplicado o sistema tipográfico local (Clash Display, Satoshi e IBM Plex Mono), tokens de marca, hierarquia de títulos, cartões arredondados, estados de foco e layout responsivo que já fazem parte do shell. O movimento respeita `prefers-reduced-motion`.

## Rodada 2 — jornada integrada de aquisição, atendimento e venda

- A jornada usa um único contato/oportunidade do CRM como registro de conversão. Referrals e UTMs permitidos carregam origem, plataforma, campanha e anúncio para conversa, ficha e oportunidade.
- A configuração do CodeWords recebe instruções por vertical: empresas de serviço conduzem para agendamento; varejo encaminha para vendedor. Horário, regras da empresa, opt-out e revisão humana continuam valendo.
- Criada memória operacional aprovada pelo gestor. É contexto editável para respostas futuras; não retreina o modelo nem aprende autonomamente. O prompt deixa explícito que só instruções revisadas entram nessa memória.
- Fechar a venda continua sendo ação manual do gestor, que registra o valor. CRM guarda ganho/receita e o módulo Ads relaciona esses resultados aos totais de campanha disponíveis.
- O primeiro cadastro continua protegido por código de ativação e trava transacional; esse fluxo escolhe o gestor inicial e não foi aberto nesta rodada.

## Rodada 3 — navegação, acabamento e validação

- Corrigidos deep links entre os produtos. Um link de Atendimento/agenda abre a oportunidade no CRM; “Abrir conversa” leva ao Atendimento; o atalho de entrada preserva a rota interna e os parâmetros da demo.
- Corrigido erro no seletor de produto (`rotas` vem do módulo carregado no contexto) e título que perdia o nome do produto ao navegar entre rotas internas.
- O servidor `scripts/dev-falso.mjs` atende em loopback e mostra aviso permanente de dados fictícios. A demonstração exibe o cenário de Mariana Costa: oportunidade 801, campanha Google Ads “Aparelho invisível · pesquisa”, conversa 901 e volta entre CRM e Atendimento.
- A suíte inclui fluxo sintético de entrada atribuída → conversa CodeWords simulada → oportunidade/agendamento → venda registrada manualmente → leitura agregada do Ads. O cenário de teste usa gasto de campanha R$ 250 e venda de R$ 1.400 (retorno de 5,6x **apenas no cenário fictício**).

## Verificações concluídas

- `node testes/rodar-tudo.mjs`: **14/14 arquivos de teste passaram**.
- `node testes/app.teste.mjs`: **49 verificações passaram**, incluindo rotas dos produtos, gates e preservação do deep link.
- `node scripts/montar-funcoes.mjs`: gerou as sete pastas planas de deploy; `npx --yes deno check` passou em 7/7 entrypoints.
- `git diff --check`: passou; Git exibiu somente avisos de normalização LF/CRLF do Windows.
- Navegador local, com dados fictícios: `/atendimento/` → `#/crm/negocio/801` abriu a oportunidade e mostrou origem/campanha; o botão “Abrir conversa” voltou à conversa 901. A ficha do contato relaciona a oportunidade e a conversa.
- Rodadas de responsividade registradas anteriormente: 375×812, 390×844 e 1440×900; sem overflow horizontal ou erros de console no mock após a correção do seletor.

## Limites e próximos testes

- Nenhuma chamada real ao CodeWords, Meta, Google ou modelo de IA foi feita nesta validação. Nenhuma chave foi lida. As respostas e gravações do cenário são mocks locais; isso valida o contrato do fluxo, não a entrega externa.
- A migration `20260930a_ia_memoria_aprovada.sql` está no branch, mas não foi aplicada ao Supabase. Nenhuma alteração em `nx_config` ou dado de produção foi feita.
- Para o aceite F8 faltam: canal/número CodeWords de teste com ida, volta e recibos reais; contas de teste Meta/Google com métricas isoladas; E2E autenticado nos três módulos; QA mobile autenticado; verificar isolamento e remover as fixtures após o aceite.
- O custo por paciente não é fornecido diretamente por todas as plataformas. Ads mostra gasto/custo agregado da campanha e o CRM associa a venda registrada à origem; não inventar custo marginal individual quando a plataforma não o fornece.
- `web/app/prontos.js` continua fechado para módulos em produção; F8 e PR #1 continuam pendentes. Não foi iniciado deploy do Netlify: a configuração atual iria iniciar o deploy de `main` antes desses aceites. O preview local está em `http://127.0.0.1:4174/app/?dev-falso=1&dev=1#/inicio` enquanto o servidor fictício permanecer ligado.
