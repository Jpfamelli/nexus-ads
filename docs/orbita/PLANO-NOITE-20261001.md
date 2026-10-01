# Plano da noite — 01/10/2026 (Órbita + Kamiguchi)

Pedido do João (dormindo; quer tudo pronto ao acordar). Branch de trabalho: `claude/automacoes-ia`
(a partir da `main` f7f0d7c). Se o Claude parar (limite de uso), o **Codex assume** este plano do ponto
registrado na Ponte. Trava `nexus-ads` com quem estiver executando.

## Decisões de arquitetura

1. **Divisão de responsabilidades**
   - **Órbita + API oficial do Claude** = toda automação *de dentro do sistema*: mover negócio entre
     etapas/funis, atribuir, etiquetar, campos, tarefas, notas, notificações, decisões com IA
     (classificar etapa, resumir conversa, pontuar lead) e a *criação* de automações em linguagem natural.
   - **CodeWords** = tudo que é WhatsApp: conversa, envio de mensagens, follow-ups, lembretes. O fluxo do
     CodeWords fica **mais leve**: só conversa + agenda + passar para humano. As decisões de CRM
     (etapa/origem/nota/resumo) saem do prompt do CodeWords e passam a ser automações do Órbita.
     As mensagens das automações saem pelo canal CodeWords (proxy do aparelho) via `nx-enviar`/fila.
2. **Claude na API**: SDK oficial `npm:@anthropic-ai/sdk` (já em `_compartilhado/ia.js`), modelo padrão
   `claude-opus-5-5` (`nx_config.modelo_ia` pode trocar), `output_config: {effort}`, **structured outputs**
   (`output_config.format` com JSON Schema) para a automação montada e para as decisões; reserva de cota
   atômica (`nx_ia_reservar`, migração 30c); texto do cliente é DADO, nunca instrução; nunca
   `tool_choice` forçado (400 no Opus 5.5); nunca desligar thinking.
3. **Kamiguchi**: o atendimento com IA da Kamiguchi mora **no Órbita** (cliente `kamiguchi`, já existente),
   com marca própria (white-label), persona da IA, agenda odonto, automações de clínica e prompt do
   CodeWords personalizado. O painel `kamiguchi-ads` (GitHub Pages, demo) continua como peça de venda.
   Não duplicar o Órbita dentro do `kamiguchi-ads`.

## Contrato das Automações (nomes exatos; front e back devem bater)

Gatilhos (além dos existentes `conversa_nova`, `mensagem_recebida`, `sem_resposta`, `negocio_criado`,
`negocio_estagio`, `tempo_na_etapa`, `negocio_ganho`, `negocio_perdido`, `etiqueta_adicionada`,
`tarefa_vencida`, `antes_da_data`):
- `agendado` — `{horario:"HH:MM", dias_semana:[0..6], funil_id?, estagio_id?}`: todo dia/horário, um
  evento por negócio aberto que casa (uma vez por dia por alvo).
- `apos_data` — `{campo:"consulta"|"previsao_fechamento", horas:1..720, funil_id?}`: X horas DEPOIS da data.
- `conversa_resolvida` — `{canal_id?, departamento_id?}`.

Ações (além das existentes: tarefa, mover etapa, criar negócio, enviar texto, enviar modelo):
- `mover_funil` `{funil_id, estagio_id?}` · `atribuir` `{dono:"rodizio"|"conta"|"departamento", conta_id?, departamento_id?}`
- `etiqueta_adicionar` / `etiqueta_remover` `{etiqueta_id}` · `campo_atualizar` `{campo, valor}` (variáveis)
- `nota` `{texto}` · `notificar` `{para:"responsavel"|"admins"|"departamento", departamento_id?, texto}`
- `esperar` `{minutos:1..43200, cancelar_se_cliente_responder:true}` — passo de sequência: as ações
  seguintes só rodam depois; se o cliente responder antes e a opção estiver ligada, a sequência para.
- `parar` — encerra a sequência para este alvo.
- `ia_decidir` `{tarefa:"classificar_etapa"|"resumir_nota"|"pontuar_lead", instrucao?}` — executada por
  `nx-ia` ação `automacao_decidir`, saída estrita (etapa ∈ etapas do funil do negócio / nota ≤ 1.000 /
  pontuação 0–100 + motivo) e aplicada pelo motor (mover/nota/campo `score`). Cota `acao:"automacao"`.

Criação com IA: `nx-ia` ação `automacao_montar {descricao}` → `{automacao:{nome,gatilho:{tipo,campos},
condicoes:[],acoes:[{tipo,campos}]}, explicacao, avisos:[]}` validada no servidor contra o catálogo
(mesmo catálogo do front, compartilhado) → o front abre no editor para o cliente conferir e salvar.

Receitas prontas (vertical clínica): Lembrete 24 h · Confirmação ao agendar · Follow-up de orçamento
(24 h e 72 h sem resposta, para se responder) · Faltou → remarcar (apos_data consulta +2 h, etapa faltou) ·
Pós-consulta (apos_data +24 h: avaliação) · Reativação 30 dias parado · Lead de anúncio → notificar +
tarefa em 15 min · Classificar etapa com IA ao receber mensagem · Resumo da conversa ao resolver.

## Fases

- **A** Plano gravado (este arquivo + Ponte R111). ✔
- **B** Automações: backend (migração `20261001a_automacoes_ia.sql`, motor, `nx-ia` montar/decidir,
  catálogo compartilhado, smoke 12) ‖ front (aba Automações: Criar com IA, receitas, editor ampliado,
  sequências, simular, execuções) ‖ CodeWords mais leve (prompt/receita/doc). Depois revisão adversarial
  + correções. Commit por frente.
- **C** 10 agentes de teste em paralelo (segurança, isolamento, CRM, conversas+CodeWords, automações+IA,
  agenda, ads/relatórios, admin/white-label, mobile/a11y, API/edge/robustez) → correções → reteste.
- **D** Plano de ≥20 melhorias (3 propositores: visual/tipografia/cor · conectividade/robustez ·
  interatividade/UX; 1 juiz consolida) → implementação em frentes por pasta → QA mobile → revisão.
- **E** Kamiguchi no Órbita: marca (petróleo/âmbar, Syne/Instrument Serif/Hanken/DM Mono), persona da IA
  com dados do site, agenda odonto, receitas de clínica criadas, prompt do CodeWords personalizado,
  link de entrada; documento `docs/orbita/KAMIGUCHI.md` com o passo a passo do João.
- **F** Publicar: migrações (ensaio ROLLBACK pelo MCP), funções por tag `funcoes-*` (Actions), PR → `main`,
  Netlify (`netlify-cli deploy --prod --dir web --site 32718bf4-1a15-442e-9bd9-b5c067afd55e` de checkout LF
  da main), conferência final, Ponte + memória.

## Regras (inegociáveis)
Nunca segredos no chat/log/git. Migração só aditiva, ensaiada em ROLLBACK. Nada de apagar/alterar dados
reais (kamiguchi só recebe configuração nova, revisável). `node testes/rodar-tudo.mjs` verde + deno check
+ `git diff --check` antes de cada commit. CLI do Supabase é bloqueado no Windows: funções só por tag.
Commits terminam com a linha de co-autoria pedida pelo sistema.
