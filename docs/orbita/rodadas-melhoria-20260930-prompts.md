# Ajustes guiados pelos prompts — 2026-09-30

## Escopo

Revisei os achados reproduzíveis dos dois textos enviados pelo João e corrigi pontos na interface e no modo fictício. A arquitetura, a identidade visual escura/dourada e os recursos existentes foram preservados.

## Alterações

### Admin e domínios

- `web/app/config.js`: valida o contrato da lista de domínios (array de hosts com estados reconhecidos) e identifica resposta malformada.
- `web/app/admin.js`: lida com resposta inválida e falhas ao abrir o cliente, com erro e recuperação.
- `web/app/api.js`: traduz `resposta_invalida` para uma instrução clara de atualizar e tentar novamente.
- `testes/app.teste.mjs`: lista vazia/válida e respostas malformadas.

### Anúncios, receita e relatórios

- `web/app/anuncios.js`: distingue “Relatórios e prévias” de relatórios enviados e nomeia retorno de mídia e valor registrado em negócios ganhos do CRM.
- `web/app/rel-logica.js`: trata linhas de relatório sem formato/data utilizável e estabiliza a ordenação das referências mensal/diária.
- `scripts/dev-falso.mjs`: a série fictícia fecha com os cards: 36 criados, 9 ganhos, 4 perdidos e R$ 28.400. A conversão da coorte resolvida é 9/(9+4)=69,2%; a divisão por origem preserva os mesmos totais.
- `testes/relatorios.teste.mjs` e `testes/dev-falso.teste.mjs`: paridade dos totais, campos ausentes, textos de métrica e linhas inválidas.

### Atendimento e responsividade

- `scripts/dev-falso.mjs`: a inbox fictícia aplica os critérios das abas, busca por nome/protocolo/telefone, canal, departamento, atendente, etiquetas e não lidas. Contagens de fila usam os critérios-base documentados, sem filtros secundários.
- `web/app/app.js` e `web/app/app.css`: o aviso local de dados fictícios usa a faixa de estado do app; removida a tarja fixa que cobria a interface.
- `web/app/cv-lista.js` e `web/app/conversas.css`: filtros aplicados ficam visíveis em chips, podem ser removidos individualmente ou limpos em lote; alvos de toque têm 44 px.
- `web/app/conversas.js` e `web/app/conversas.css`: a altura do chat segue o espaço disponível e a mudança de breakpoint atualiza o estado de conversa em tela cheia.
- `web/app/cv-config.js`: “Prévia das instruções” não sugere que a configuração foi sincronizada com o CodeWords.
- `web/app/index.html`: versões de cache dos arquivos atualizadas.
- `testes/conversas.teste.mjs` e `testes/dev-falso.teste.mjs`: regressões de chips, limpeza, fila, resize e janela baixa.

## Verificação

- `node testes/rodar-tudo.mjs`: **14/14 arquivos passaram**.
- Resultados destacados: `app.teste.mjs` 53 checks; `conversas.teste.mjs` 35; `relatorios.teste.mjs` 40; `dev-falso.teste.mjs` 1.
- QA do DOM no mock local: 360×780, 390×844, 768×900, 879×513, 1024×768 e 1440×900. O botão Enviar ficou dentro da viewport e a faixa de demonstração acima do compositor. Em Aguardando, os dois itens da lista corresponderam ao contador; Pendentes foi conferida separadamente.
- `git diff --check` também passou; Git exibe avisos de LF/CRLF da configuração local do Windows.

## Limites

- A checagem foi feita no mock local, sem sessão autenticada; não substitui o QA autenticado exigido pela F8. As medições são de layout e não aceitam todos os fluxos reais em dispositivos.
- Nenhuma chamada ao Meta, Google, WhatsApp, CodeWords ou serviço de IA foi feita. Nenhuma mensagem real foi enviada e não houve escrita no Supabase nem alteração de `nx_config`. O commit atualiza somente a branch do PR; não fiz deploy manual nem publiquei `main`/produção. Se Netlify estiver conectado ao repo, um Deploy Preview pode ser disparado automaticamente pela atualização do PR.
- `web/app/prontos.js` permanece sem liberação. F8 continua aguardando E2E-A/B em tenant de teste, QA autenticado, verificação de isolamento e limpeza de fixtures.
- As capturas “antes” não foram preservadas como arquivos nesta rodada; a verificação posterior foi feita no DOM/browser local e os testes guardam as regressões de layout.
