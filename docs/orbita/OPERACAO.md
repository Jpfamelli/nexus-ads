# Operação do Órbita — manual de incidentes (plano 1000, SV-179)

O que fazer quando algo da operação para. Para cada caso: **sintoma** (o que alguém vê), **confirmar** (consultas SÓ de leitura —
pelo MCP do Supabase no projeto `dtjznipitihnwmcgpzqh` ou pelo SQL Editor; nunca `update`/`delete` aqui), **ação** e **quem faz**.
Regras de sempre: nada de segredo em chat/arquivo/log; mudança no banco só por migração (ver `AGENTS.md`); trava da Ponte antes de
mexer em banco, cron ou função; registrar o incidente e o que foi feito em `docs/orbita/estado/ESTADO.md`.

## Primeiro olhar: `nx_saude`

A migração `20261013c_operacao_indices` (frente srv; ainda NÃO aplicada em 13/10) cria a RPC **`public.nx_saude(p_token)`** — só
conta de plataforma (super), pela chave anon — e a `nx_saude_dados()` (service_role, a mesma leitura sem sessão). Resposta num JSON só:

```
{ em,
  tarefas: [{tarefa, ultima_ok, ultima_falha, prazo_h, atrasada}],   -- nx-ciclo (prazo 3 h), nx-relatorio (26 h)
  cron_falhas_24h, http_falhas_24h,                                 -- cron.job_run_details e net._http_response ≠ 200
  fila_atrasada, midia_presa, ia_adiada, envios_pausados, clientes_pausados,
  problemas: [texto] }
```

Com o painel aberto como plataforma: `select public.nx_saude('<token da sessão>');`. `problemas` vazio = tudo andando. O nx-ciclo (de hora em
hora) lê `nx_saude_dados()` e manda só problema NOVO (6 h por tipo) aos números de `nx_config.wa_equipe` (coluna nova, vazia até o
João gravar). Antes da `20261013c` aplicada, use as consultas de cada caso abaixo.

## Número caiu (WhatsApp desconectado)

- **Sintoma:** clínica diz que «não chega mensagem»; conversas sem entrada nova há horas; aviso «aparelho desconectado» no painel
  (CodeWords) ou canal Meta com erro.
- **Confirmar:**
  `select id, cliente_id, nome, status, ultimo_erro, verificado_em, qualidade from public.nx_canais where status <> 'ativo' or ultimo_erro is not null;`
  `select cliente_id, max(criado_em) from public.nx_mensagens where direcao = 'in' and criado_em > now() - interval '2 days' group by 1;`
  CodeWords: o vigia grava o estado em `nx_canais` (`codewords_aviso_em`, contadores) a cada 2 min (`nx-codewords-sync`).
- **Ação:** aparelho (CodeWords) → a clínica abre o WhatsApp no celular e pareia de novo pelo painel (Ajustes → WhatsApp →
  Conectar), o vigia confirma sozinho. Meta Cloud → ver `ultimo_erro` (número banido, qualidade baixa, pagamento) no Business
  Manager. Mensagens que chegaram no aparelho durante a queda voltam pela sincronização.
- **Quem:** a clínica (pareamento) com o suporte Nexus; Meta Business → o João.

## Token da Meta venceu

- **Sintoma:** Ads sem números novos; alerta «Abra Ajustes» ou «conexão com a Meta» no radar; envio pela Cloud API falhando com
  190 (`Invalid OAuth access token`).
- **Confirmar:**
  `select cliente_id, canal, ativo, ultimo_sync, status from public.nx_integracoes where canal = 'meta' order by ultimo_sync nulls first;`
  `select cliente_id, regra, severidade, mensagem, criado_em from public.nx_alertas where criado_em > now() - interval '2 days' order by criado_em desc limit 20;`
  `select inicio, ok, resumo -> 'clientes' from public.nx_execucoes where tarefa = 'nx-ciclo' order by inicio desc limit 5;`
- **Ação:** gerar token novo (usuário do sistema no Business Manager, sem expiração) e colar em Ajustes → Anúncios → Meta
  (o painel grava no cofre; nunca em chat). «Testar conexão» no mesmo lugar roda o nx-ciclo só para aquele cliente.
- **Quem:** o João (ou o admin do cliente, se a conta de anúncios é dele).

## Cota de IA acabou

- **Sintoma:** «Sugerir resposta»/«Resumir» devolvem «limite de IA do mês»; automações com IA ficam paradas; aviso «IA adiada»
  para os admins.
- **Confirmar:**
  `select cliente_id, criado_em::date dia, count(*) chamadas, sum(tokens_in) tin, sum(tokens_out) tout, count(*) filter (where not ok) falhas from public.nx_ia_uso where criado_em > now() - interval '7 days' group by 1, 2 order by 2 desc;`
  `select cliente_id, status, count(*) from public.nx_auto_ia_pedidos where status in ('pendente', 'adiado', 'erro') group by 1, 2;`
  (o estado `adiado` existe desde a `20261008c`: chave/cota da plataforma pausou os pedidos por 30 min).
- **Ação:** cota do cliente (plano) → subir o plano/limite pelo painel de plataforma (auditado). Cota/chave da Anthropic da
  plataforma (401/403/429 do provedor) → o João confere a chave e o saldo no console da Anthropic e troca a chave no painel de
  plataforma (vai para o cofre). Os pedidos adiados voltam sozinhos.
- **Quem:** o João.

## Fila travada (mensagens automáticas não saem)

- **Sintoma:** «fora do horário», lembretes e automações não chegam; itens «pendente» velhos.
- **Confirmar:**
  `select status, count(*), min(enviar_em) from public.nx_envios_fila where status in ('pendente', 'enviando') group by 1;`
  `select id, cliente_id, status, tentativas, erro, enviar_em from public.nx_envios_fila where status = 'pendente' and enviar_em < now() - interval '15 minutes' order by enviar_em limit 20;`
  `select inicio, ok, resumo from public.nx_execucoes where tarefa = 'nx-enviar' order by inicio desc limit 5;`
- **Ação:** item com `erro` explicando (janela de 24 h fechada, contato bloqueado, modelo reprovado) → não é trava, é regra.
  Tudo parado → ver «Cron parado» (`nx-fila`) e as respostas do pg_net. Automação errada disparando → a `20261013c` traz
  `nx_envios_pausar(p_token, p_cliente, p_pausar, p_motivo)` (só plataforma, auditado): `p_cliente` = um cliente
  (`nx_clientes.envios_pausados`), `null` = a plataforma inteira (`nx_operacao`). `nx_fila_pegar` e `nx_auto_ia_pegar` respeitam a
  pausa: os itens esperam, nada é cancelado.
- **Quem:** suporte Nexus confere; pausar/despausar → o João.

## Cron parado

- **Sintoma:** nada «sozinho» acontece (sem ciclo de Ads, sem relatório das 8h, fila parada, CodeWords sem sincronizar).
- **Confirmar:**
  `select jobname, schedule, active from cron.job order by jobname;`
  `select j.jobname, d.status, d.return_message, d.end_time from cron.job_run_details d join cron.job j using (jobid) where d.end_time > now() - interval '6 hours' order by d.end_time desc limit 30;`
  `select status_code, count(*) from net._http_response where created > now() - interval '24 hours' group by 1;`
  (a tabela de jobs, agendas e funções está em `docs/orbita/DEPLOY-FUNCOES.md`, «Crons»).
- **Ação:** job com `active = false` sem registro de incidente → reativar (`cron.alter_job(…, active := true)`, com a trava da
  Ponte e registro no ESTADO.md). Job falhando com 401 no pg_net → `cron_token` divergente entre `nx_config` e a função
  (republicar as funções/ver o cofre — nunca imprimir o token). 5xx → logs da Edge Function no Dashboard.
- **Quem:** Claude/Codex com a trava (diagnóstico); mudança em cron → o João autoriza.

## Mídia presa

- **Sintoma:** bolha «baixando…» que não vira foto/áudio; «arquivo indisponível» em mídia recebida.
- **Confirmar:**
  `select id, cliente_id, tipo, criado_em, midia ->> 'estado' estado from public.nx_mensagens where midia ->> 'estado' = 'baixando' and criado_em < now() - interval '10 minutes' order by criado_em desc limit 20;`
  (desde a `20261013a` a varredura `nx_midia_presas` tenta de novo em cada rodada da fila e marca `falhou` depois do prazo).
- **Ação:** a Meta guarda a mídia por ~30 dias: o nx-enviar refaz o download sozinho. Muitas presas do mesmo canal → token do
  canal (ver «Token da Meta venceu») ou o Storage (`nx-midia` com prazo de 20 s; ver logs). CodeWords: mídia de entrada do
  aparelho não tem download — fica «arquivo indisponível» por desenho, a pessoa vê no celular.
- **Quem:** suporte Nexus; token/Storage → o João.

## Depois do incidente

Registrar em `docs/orbita/estado/ESTADO.md`: quando começou, como foi visto, as consultas, a ação, quem fez e se a `nx_saude`
mostrou (ou deveria ter mostrado). Se a ação exigiu mudança no banco, ela vira migração nova (aditiva) com smoke.
