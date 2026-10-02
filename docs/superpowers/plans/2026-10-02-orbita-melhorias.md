# Plano — três rodadas de melhorias do Órbita

## Objetivo

Entregar pelo menos 30 melhorias verificáveis nas três entradas do Órbita (CRM, Nexus Ads e Atendimento), preservando contratos e dados existentes. QA usa somente `dev-falso`; nenhuma credencial ou integração de produção é necessária.

## Restrições

- HTML/CSS/ESM sem build; tema claro e tokens white-label existentes.
- Não alterar banco/produção, `nx_config`, contas ou fixtures reais. Toda mudança de banco que se mostrar necessária fica em migração aditiva local e sem aplicação remota.
- Manter atribuição consistente entre anúncio, conversa e CRM; mensagens e mídia nunca devem aparentar persistidas quando não foram.
- Sem regressão em 390 px, teclado, leitor de tela, `prefers-reduced-motion` ou sessão multiempresa.

## Rodadas

1. **Leitura e operação visual:** hierarquia da Home; ações de toque em Atendimento, CRM e Agenda; campos móveis; estados de espera/erro e alternativas acessíveis.
2. **Conectividade e recuperação:** pulso adaptativo, deduplicação de leitura entre abas quando suportada, reconexão, fila, cache, Service Worker e mídia recusada; conservar estados explícitos quando uma operação não pode ser repetida com segurança.
3. **Origem e jornada do cliente:** classificação de referrals Meta/Google, deduplicação sem perder eventos de atribuição, proteção de consentimento, segurança de tomada humana pela IA e coerência de datas/valores entre Ads e CRM.

## Método e aceite

- Capturar regressões primeiro com testes Node e, quando disponível, com navegador headless sobre `dev-falso`.
- Para cada correção: cenário antes, correção, cenário depois. Contar apenas melhorias independentes descritas no relatório de entrega.
- Rodar `node testes/rodar-tudo.mjs`, montagem das funções se houver alteração nelas, `deno check` dos sete entrypoints se houver alteração backend e `git diff --check`.
- Atualizar `docs/orbita/estado/ESTADO.md`, `docs/orbita/estado/F8.md` se a frente de entrega for afetada e um relatório datado com IDs R1-xx/R2-xx/R3-xx, testes, limites e integração real pendente.
- Submeter por PR na branch `codex/orbita-melhorias-20261002`; não mesclar nem publicar produção sem os gates definidos em `AGENTS.md`.
