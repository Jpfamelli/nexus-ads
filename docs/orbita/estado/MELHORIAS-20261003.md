# Follow-up Órbita — 58 melhorias verificadas — 2026-10-03

Rodada local adicional na branch `codex/orbita-40-melhorias-20261003`. As 58 entregas abaixo correspondem aos cenários novos de CRM/Agenda (15), Atendimento (11), visual/acessibilidade (18) e Ads/Relatórios (14). Parte dos cenários valida mais de um detalhe relacionado.

## CRM e Agenda — 15

1. Visões salvas isoladas por empresa, usuário e tela.
2. Nomes de visão normalizados, limitados e deduplicados sem distinção de acentos ou caixa.
3. Leitura das visões aceita somente estrutura prevista e descarta intervalos inválidos.
4. Ordenação de contatos limitada às opções reconhecidas.
5. Criação com id estável; edição conserva o id existente.
6. Gravação recusa duplicatas, conteúdo inválido, ids inseguros e mais de 12 visões.
7. Aplicação devolve cópia independente; exclusão não altera outras visões.
8. Indicador de visão salva some corretamente quando os filtros deixam de corresponder.
9. Preferências da Agenda isoladas por empresa/conta e valores locais inválidos corrigidos.
10. Atalhos explícitos da Agenda não capturam Ctrl, Meta ou Shift.
11. Abas de dias navegam por setas, Home e End com foco circular.
12. Visões integradas às telas de negócios e contatos; filtro rápido anuncia seu estado.
13. Intervalos contraditórios são recusados e filtros ativos podem ser limpos em lote.
14. `/` foca a busca de contatos; Escape limpa e os listeners são removidos ao sair.
15. Atualização manual da Agenda comunica sucesso/falha e mantém o quadro anterior em falha.

Evidência: [`melhorias-20261003-crm.teste.mjs`](../../../testes/melhorias-20261003-crm.teste.mjs), 15/15.

## Atendimento — 11

1. Busca de um caractere limpa o resultado antigo e explica o mínimo de dois caracteres.
2. Enter aplica a busca pendente sem esperar debounce; IME só envia o texto final após composição.
3. Botão de filtros expõe `aria-pressed` e a quantidade ativa.
4. Falha na busca de mensagens é anunciada e permite tentar de novo; estado vazio também é anunciado.
5. Lista de conversas e bloco de busca expõem estado de carregamento com `aria-busy`.
6. Contador de caracteres aparece perto do limite sem anunciar cada tecla.
7. Erro do gravador descarta o fragmento de áudio e libera as faixas do microfone.
8. Anexo é revalidado depois da confirmação, caso a conversa/atendimento tenha mudado.
9. URL temporária de prévia é revogada mesmo quando o modal falha.
10. Modelo é validado novamente no clique final com canal, estado e consentimento atuais.
11. Colagem de várias imagens informa que somente a primeira será anexada.

Evidência: novos cenários em [`conversas.teste.mjs`](../../../testes/conversas.teste.mjs); arquivo passou em 103/103.

## Visual e acessibilidade — 18

1. Tokens comuns de espaçamento, foco e alvo de toque respeitam o white-label.
2. Títulos equilibram linhas e destinos internos compensam a barra fixa.
3. Menus mantêm anel de foco de teclado visível.
4. Campo em foco destaca o rótulo; erros ganham espaçamento e entrelinha legíveis.
5. Estado inválido tem borda reforçada além da cor.
6. Chips usam transições específicas, sem `transition: all`.
7. Tabelas alinham números e linhas acionáveis respondem ao pressionamento.
8. Linhas de tabela focadas por teclado também recebem superfície de foco.
9. Diálogos cabem entre safe areas em alturas dinâmicas.
10. Rolagem do diálogo fica no corpo e preserva espaço ao redor do foco.
11. Ações de diálogos viram coluna em celulares estreitos.
12. Toasts respeitam safe areas e a barra móvel.
13. Fechar/Desfazer no toast têm alvos de 44 px em toque.
14. Mensagens de conexão aceitam linhas longas e tempos legíveis.
15. Banners e menus têm alvos de 44 px em ponteiro de toque.
16. Controles usam resposta de toque imediata e tokens de destaque da marca.
17. Navegação e menus preservam foco em alto contraste e safe areas.
18. Contrato global de `[hidden]` é preservado e os novos estilos usam tokens.

Evidência: [`melhorias-20261003-visual.teste.mjs`](../../../testes/melhorias-20261003-visual.teste.mjs), 18/18.

## Ads, Início e Relatórios — 14

1. Série diária reconcilia gasto e conversões com os KPIs do mesmo período/plataforma, tolerando ruído de ponto flutuante.
2. Meta + Google fecham o total; conversão do Ads não é apresentada como conversa do CRM.
3. Orçamento mensal até ontem/projeção fica separado da janela móvel de 7/30/60 dias.
4. Período inclusivo e plataforma ficam claros em rótulos acessíveis.
5. Campanhas têm busca sem acento e filtro por atividade no CRM.
6. Componente real de campanha aplica/limpa filtros, compara e exporta somente linhas filtradas.
7. Comparação permite até três campanhas e remover uma seleção.
8. Seleções inválidas de outra empresa são removidas na montagem.
9. Taxas do funil indicam denominadores distintos e mostram vazio com base zero.
10. CSV separa métricas Ads/CRM, inclui período, escapa fórmulas e mantém cabeçalho próprio.
11. Início comunica falha de atualização com último horário confirmado e respeita atalhos autorizados.
12. Relatórios calcula a janela anterior exata e limpa apenas os filtros da empresa ativa.
13. Odômetro mantém animação quando visível, respeita movimento reduzido e conclui valor final ao ocultar a aba; moeda segue o mesmo ciclo.
14. Filtros de campanha se reorganizam em tablet/celular e mantêm alvos táteis de 44 px.

Evidência: [`melhorias-20261003-ads.teste.mjs`](../../../testes/melhorias-20261003-ads.teste.mjs), 14/14.

## Verificações e limites

- `node testes/rodar-tudo.mjs`: 23/23 arquivos passaram.
- Testes focados: CRM 15/15, visual 18/18, Atendimento 103/103 e Ads/Início/Relatórios 14/14.
- Smoke no Chrome com `dev-falso`: Anúncios e Campanhas abriram em tema claro; busca por “urgência” filtrou 1/7 campanhas, filtro de atividade CRM e comparação de duas campanhas renderizaram corretamente; CRM e Atendimento abriram com seus dados fictícios; console sem erros.
- `node scripts/montar-funcoes.mjs`: sucesso; `npx --yes deno check` dos sete entrypoints: código 0.
- `node --check`: 73 arquivos JavaScript/ESM; `git diff --check`: limpo.
- Não foram chamadas APIs reais nem lidas credenciais. Nenhum banco, `nx_config`, `web/app/prontos.js`, função publicada, `main` ou produção foi alterado. Os cenários usam fixtures/DOM falso; não são aceite de Meta, Google, WhatsApp/CodeWords ou usuário autenticado.
- F8 permanece aceita conforme o estado existente; este follow-up não reabre nem modifica seus gates.
