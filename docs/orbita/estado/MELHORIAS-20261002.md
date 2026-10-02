# Três rodadas de melhorias do Órbita — 2026-10-02

Escopo: evolução local do shell, Atendimento, CRM, Agenda e funções de conectividade. Foram concluídas **37 melhorias verificáveis** em três rodadas. A implementação está na branch `codex/orbita-melhorias-20261002`; não foi mesclada nem publicada.

## Rodada 1 — leitura, toque e operação visual (10)

1. Início apresenta a fila de trabalho antes da lista de configuração inicial.
2. A resposta citada continua disponível no chat em telas estreitas.
3. Responder citado, ações da fila e cancelar upload têm alvos de toque de pelo menos 44 px.
4. Voltar da conversa e ações do cabeçalho têm alvos de toque de pelo menos 44 px.
5. A ação de reconexão tem alvo de toque de pelo menos 44 px.
6. Etapas do Kanban têm alvos de toque de pelo menos 44 px.
7. A régua horizontal de etapas do CRM exibe uma indicação visível de rolagem.
8. Renomear o título do funil tem alvo de toque de 44 × 44 px.
9. Seletores de dia e horário da Agenda têm alvos de toque de pelo menos 44 px.
10. Campos do app usam 16 px no celular, evitando o zoom automático do Safari iOS.

Evidência: `web/app/inicio.js`, `conversas.css`, `shell.css`, `crm.css`, `agenda.css` e `app.css`; testes da nova suíte de melhorias e inspeção headless de Atendimento em 390 × 844.

## Rodada 2 — conectividade e recuperação (17)

11. Web Locks elege uma aba líder de leitura por empresa quando o navegador oferece suporte.
12. BroadcastChannel distribui as leituras da líder às abas seguidoras.
13. A contagem de conversas não lidas também é atualizada nas abas seguidoras.
14. Canal e trava usam origem e empresa, mantendo empresas distintas isoladas.
15. Navegadores sem Web Locks/BroadcastChannel continuam funcionando com leitura própria.
16. Jitter de ±15% espalha as leituras simultâneas entre abas/usuários.
17. A leitura mantém o intervalo rápido enquanto Conversas está aberta.
18. A frequência diminui após três minutos sem interação.
19. A frequência diminui mais após quinze minutos sem interação.
20. Interação após inatividade antecipa a próxima leitura.
21. Falhas de rede usam backoff exponencial limitado a 60 segundos.
22. Abrir IndexedDB tem prazo máximo; o app não fica preso esperando o cache.
23. Transações IndexedDB também têm prazo e são abortadas quando travam.
24. Abertura tardia fecha a conexão, e uma abertura que falhou pode ser tentada novamente.
25. O resultado de gravação no cache informa se persistiu, em vez de declarar sucesso sempre.
26. Navegação do Service Worker tem prazo e entrega o shell guardado ou uma tela 503 legível.
27. Precache e busca de arquivos têm prazo; arquivos antigos permanecem disponíveis no cache atual e nas duas versões anteriores.

Evidência: `web/app/pulso.js`, `cache.js` e `sw.js`; testes de `testes/app.teste.mjs` e `testes/shell.teste.mjs`.

## Rodada 3 — origem, consentimento e estados honestos (10)

28. Reentrega de webhook CodeWords refaz o upsert do lead se a conversa foi salva e o CRM falhou na tentativa anterior.
29. Depois de reparar o lead, evento duplicado encerra sem executar a IA nem enviar resposta duplicada.
30. Envio unitário de modelo de marketing exige `optin_marketing === true`.
31. Envio em lote aplica a mesma exigência explícita de consentimento.
32. Opt-out explícito e consentimento desconhecido geram motivos diferentes; ambos são bloqueados.
33. Falha de rede ou timeout ao buscar mídia do Storage aparece como indisponibilidade temporária 503.
34. HTTP 408, 425, 429 e 5xx do Storage também são tratados como transitórios.
35. Arquivo realmente ausente ou erro permanente continua com resposta 404.
36. Atendimento explica que o arquivo não foi enviado e orienta tentar novamente.
37. Mensagem offline só aparece como guardada depois de persistir; se o armazenamento falha, a bolha otimista sai da conversa e o texto fica no campo para nova tentativa.

Evidência: `supabase/functions/_compartilhado/codewords.js`, `enviar.js`, `web/app/api.js` e `conversas.js`; testes de `testes/codewords.teste.mjs`, `conversas-funcoes.teste.mjs` e `conversas.teste.mjs`.

## Verificações realizadas

- `node testes/rodar-tudo.mjs`: **20/20 arquivos passaram**.
- A nova suíte `testes/melhorias-20261002.teste.mjs`: **11/11 passaram**.
- Casos de integração simulada cobrem anúncio → conversa → agenda → resposta CodeWords → venda lançada no CRM → receita atribuída no Ads; sem chamadas aos provedores reais.
- `node scripts/montar-funcoes.mjs`: gerou as sete funções Edge em pastas planas.
- `npx --yes deno check` nos sete entrypoints gerados: terminou com código 0.
- Chrome headless com `dev-falso` em 390 × 844: Atendimento, CRM, Ads e Início; `documentElement.scrollWidth` e `body.scrollWidth` permaneceram 390 px. A régua do Kanban rola dentro da área própria; efeitos decorativos fora do viewport não aumentam a largura da página.
- O cabeçalho do Atendimento foi inspecionado por captura: botão “Assumir” e menu de ações permanecem visíveis no celular.
- A tentativa de `scripts/auditar-a11y.mjs` não iniciou porque `puppeteer-core` não está instalado. Os testes estáticos de teclado, foco, áreas de toque e movimento reduzido seguem incluídos na suíte do app.

## Limites e publicação

- Nenhuma chamada real a Meta, Google Ads, CodeWords, WhatsApp Cloud API ou Anthropic foi feita.
- Nenhuma migração foi criada/aplicada; `nx_config`, contas, fixtures reais e dados remotos não foram alterados.
- `web/app/prontos.js`, `main` e produção não foram alterados. F8 continua no estado aceito registrado em `F8.md`; este follow-up não reabre seus gates.
- Revisão do diff concluída; `git diff --check` passou após a documentação. Git apenas avisou que normalizará finais CRLF para LF nos arquivos já editados. A branch segue para revisão do Claude por meio da Ponte.
