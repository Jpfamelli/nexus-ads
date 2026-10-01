# Rodada de segurança, estabilidade e conectividade — 2026-09-30

## Revisão independente

Três revisores examinaram segurança, estabilidade/conectividade e UX/acessibilidade. Os principais riscos encontrados e tratados nesta branch:

- Webhook: o corpo de entrada agora é limitado a 2 MiB durante a leitura; falhas transitórias do PostgREST pedem reentrega, enquanto erros permanentes 4xx não criam ciclos de retry.
- Banco: REST tem timeout limitado; 408/425/429/5xx e falhas de transporte são classificados como transitórios, e 4xx permanentes não são repetidos como indisponibilidade.
- Mensageria: resposta Graph malformada em envio, timeout e erro 5xx são marcados como ambíguos. O app pede conferência antes de repetir. Itens que ficaram `enviando` após interrupção viram `falhou` com aviso de status incerto; não são reenviados automaticamente.
- IA: reservas atômicas protegem cota mensal e o limite por atendente; tentativas faturáveis que falham também contam. As RPCs da reserva permanecem restritas a `service_role`.
- Interface: contraste de rótulos é calculado sobre as superfícies finais do tema; a busca da inbox usa semântica de grupo em vez de abas; CRM oferece instrução de movimentação por toque; timeout, erro de rede e resposta malformada orientam a verificar o estado antes de repetir.
- Cache: os três assets principais do app foram versionados como `20260930i` para expor os módulos atualizados sem cache antigo.

## Verificação local

- `node testes/rodar-tudo.mjs`: **14/14 arquivos passaram**. Inclui isolamento, limites de webhook, assinatura, tratamento de falha permanente/transitória, envios ambíguos, cota concorrente da IA, prompt CodeWords e jornada fictícia anúncio → conversa → CRM/venda → Ads.
- O teste de concorrência da cota usava uma espera fixa curta; troquei por sinalização por estado das oito requisições e confirmei isoladamente e na suíte serial completa.
- `node scripts/montar-funcoes.mjs`: passou; sete pacotes planos gerados, com `nucleo.js` idêntico (SHA-256 iniciado por `80fd63731bc2`).
- `npx --yes deno check` nos sete entrypoints: passou.
- `git diff --check`: passou após as edições; avisos LF/CRLF são normalização do Windows.
- Links locais responderam HTTP 200: Órbita, CRM, Nexus Ads e Atendimento. O preview Netlify responde 200, mas ainda serve assets `20260928a`, portanto está desatualizado em relação ao código local `20260930i`.

## Limites e próximo passo

- Esta foi validação com banco, Meta, Google, WhatsApp, Anthropic e CodeWords falsos. Não houve uso de credenciais, chamadas reais, deploy, push, alteração de `nx_config`, gravação em Supabase ou mudança na `main`.
- As migrations aditivas `20260930c_ia_reservas_atomicas.sql` e `20260930d_fila_status_incerto.sql` estão somente na branch; precisam de smoke SQL transacional com `ROLLBACK` antes de qualquer aplicação.
- A mídia recebida ainda usa `EdgeRuntime.waitUntil`: se o worker morrer após o webhook responder 200, não existe fila durável de recuperação. Para fechar esse risco, criar persistência/reprocessamento da mídia e exercitar o fluxo com canal de teste.
- Timeout de RPC no navegador pode ocorrer depois de o servidor confirmar uma gravação. A mensagem agora instrui a conferir antes de repetir, mas operações de criação genéricas ainda não têm chave de idempotência nem reconciliação automática.
- F8 continua `em_andamento`. Faltam E2E autenticados A/B com integrações de teste, validação mobile autenticada, verificação de isolamento/limpeza final e aceites antes de liberar módulos ou publicar produção.

## Links locais desta rodada

- Órbita: `http://127.0.0.1:4174/app/?dev=1&dev-falso=1#/inicio`
- CRM: `http://127.0.0.1:4174/crm/?dev=1&dev-falso=1`
- Nexus Ads: `http://127.0.0.1:4174/ads/?dev=1&dev-falso=1`
- Atendimento: `http://127.0.0.1:4174/atendimento/?dev=1&dev-falso=1`

Os endereços locais exigem que o servidor de desenvolvimento continue rodando na máquina.
