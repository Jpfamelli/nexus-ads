# Órbita — tema claro, atendimento e integrações

Data: 2026-09-30 · Branch `codex/orbita` · PR #1 (draft)

## Rodada 1 — tema claro no sistema

- O primeiro acesso agora usa fundo claro e superfícies em tons de papel em Início, CRM, Nexus Ads, Atendimento e configurações.
- O seletor global permite alternar entre Claro, Escuro e Marca. A preferência é aplicada antes da primeira pintura e persiste após recarregar; a marca white-label continua respeitada.
- Ícones, favicon e contraste acompanham o esquema. O tema mantém tokens, foco visível e movimento reduzido.

## Rodada 2 — áudio e arquivos no Atendimento

- O compositor apresenta ações de anexo e gravação de áudio, com estado de gravação, duração, cancelamento e prévia antes do envio.
- A captura verifica suporte a `MediaRecorder`, contexto seguro e formato disponível; limita cada gravação a 60 segundos e libera a mídia ao fechar a conversa.
- A UI informa a capacidade real de cada canal: a integração CodeWords atual envia texto; para arquivos e áudio, o cliente precisa selecionar WhatsApp Cloud API. Não há alegação de mídia em canal que não a suporta.

## Rodada 3 — conectividade, botões e acabamento mobile

- “Atualizar situação” consulta o estado Meta/Google e preserva campos de formulário ainda não salvos. A tela distingue integração ausente, pausada, atrasada, com erro e aguardando a próxima sincronização.
- A ação de conexão explica que a sincronização ocorre em segundo plano e não afirma sucesso antes da confirmação do servidor.
- Os balões do chat passam a se ajustar ao conteúdo, sem preencher toda a largura em mensagens curtas; o limite de largura e a quebra de texto mantêm mensagens longas dentro da tela.
- Em telas estreitas, o subtítulo do contato pode encolher com reticências; ações do chat continuam em uma faixa própria.

## Verificações

- `node testes/rodar-tudo.mjs`: **14/14 arquivos passaram** após o ajuste final de largura dos balões.
- `node testes/app.teste.mjs`: **50 verificações passaram**, incluindo preferência de tema antes da pintura e contraste das cores.
- `node testes/conversas.teste.mjs`: **33 verificações passaram** para conversa e regras de mídia; os testes usam mocks.
- QA do mock local em CRM, Ads e Atendimento, a 375×812, 390×844 e 1440×900: tema claro consistente e sem rolagem horizontal da página; o tema escuro também sobreviveu ao reload. Após o ajuste final de largura das bolhas, conferi o Atendimento em desktop e repeti a suíte; o QA mobile autenticado continua sendo um gate de F8. Não usei permissão de microfone para gravar mensagem real.
- Sem chamadas a APIs externas, uso de credenciais, mudanças no Supabase, publicação em Netlify/produção ou alteração de `web/app/prontos.js`. As mensagens e campanhas do preview são fictícias.

## Limites e próximo passo

- Os controles de mídia ficam habilitados apenas nos canais WhatsApp Cloud API com suporte. CodeWords continua limitado a texto neste adaptador.
- A tela de integração atualiza o diagnóstico; ativar contas Meta/Google ainda exige as credenciais correspondentes no painel, que permanecem no servidor.
- F8 continua pendente de E2E-A/B com canais e métricas isolados, validação mobile autenticada, isolamento/limpeza das fixtures e aceite antes de liberar módulos ou publicar produção.
