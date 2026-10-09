# O que acontece desde o clique no anúncio até a venda — Órbita, 08/10/2026

Escrito para o João, em linguagem de dono. A versão técnica (arquivo, função, linha) está em
`docs/orbita/FLUXO-ANUNCIO-AO-CRM.md`. Tudo aqui foi lido no código e conferido com testes; os números da
Kamiguchi são contagens reais de 08/10 (sem nome nem telefone de ninguém).

## Em dez linhas

1. A pessoa clica no anúncio. Ou cai no **site** da clínica (anúncio com link), ou cai **direto no WhatsApp**
   (anúncio «Enviar mensagem»).
2. No site, o script do Órbita guarda de onde ela veio (campanha, criativo, Google/Meta) por 30 dias e, na hora de
   clicar no botão do WhatsApp, pede ao Órbita um **código curto** (`[ref K7Q2P]`) e o coloca no fim da mensagem.
3. O WhatsApp abre com a mensagem pronta. A pessoa manda (ou edita, ou manda um áudio).
4. A mensagem chega ao celular pareado da recepção; o CodeWords avisa o Órbita.
5. O Órbita cria **contato + conversa + oportunidade** no funil (etapa «Nova»), lê o código e grava **origem,
   plataforma, campanha e criativo**. Fora do horário, agenda a mensagem automática. A equipe recebe aviso.
6. As **automações** que você ligou disparam (etiqueta, tarefa, aviso, mover etapa, IA pontuar o lead…).
7. O atendente responde pelo Órbita (ou pelo próprio celular — o Órbita percebe e pausa a IA).
8. Da conversa ele abre a oportunidade, etiqueta, move de etapa e **marca a consulta** na Agenda.
9. Ganhou ou perdeu → o funil, os relatórios e o painel de anúncios refletem na hora.
10. Todo dia às 8h você recebe o relatório no WhatsApp; de hora em hora o Órbita busca gasto e resultado no Meta e
    no Google e acende o Radar quando algo foge do combinado.

## O caminho, passo a passo

### 0. O anúncio
Há dois tipos. **Anúncio com link para o site**: a URL deve levar `utm_source`, `utm_medium`, `utm_campaign`,
`utm_content` (o Meta acrescenta `fbclid`; o Google, `gclid`). **Anúncio «Enviar mensagem» (clique-para-WhatsApp)**:
o WhatsApp abre direto e a própria Meta anexa à primeira mensagem o identificador do anúncio (`referral`).

Hoje o Órbita identifica a plataforma pelo `gclid` (Google) ou por `utm_source` + medium pago (Meta). **Anúncio Meta
sem UTM** chega só com `fbclid` e cai como «site», sem plataforma. Por isso a tela de Rastreio passa a mostrar
exemplos com as macros do Meta e do Google (`{{campaign.id}}`, `{campaignid}`…), e `fbclid` sozinho passa a contar
como Meta orgânico/social (nesta rodada).

### 1. No site (kamiguchi-odontologia.netlify.app)
- O script da clínica guarda «veio de anúncio, fonte, campanha, serviço» e troca «Vim pelo site» por «Vim pelo
  anúncio (Instagram)» no texto do botão. Todo botão do WhatsApp ganha também `[site · implantes]` (o assunto).
- O script do Órbita (`orbita-rastreio.js`, instalado com a chave da Kamiguchi) guarda os parâmetros da URL no
  navegador por 30 dias (sem cookies, sem terceiros). Quando a pessoa passa o mouse ou encosta no botão do WhatsApp,
  ele já pede o código ao Órbita (para não atrasar o clique). O clique sai com `… [site · agenda] [ref K7Q2P]`.
- Se o Órbita demorar mais de 1,5 s ou estiver fora, **o clique segue sem código** — o link nunca quebra.
- O código é gravado no Órbita com a origem (UTMs, página, clique). Cada empresa tem um limite por minuto e por hora.

### 2. No WhatsApp da pessoa
A mensagem já vem pronta. Ela pode mandar como está, apagar o código, escrever outra coisa ou mandar áudio.
**Se o código não vier na primeira mensagem de texto, a origem do site se perde** (o Órbita só sabe «WhatsApp»).
Nesta rodada, quando não há código, o Órbita passa a reconhecer os textos do próprio site («Vim pelo site…»,
«Vim pelo anúncio (Instagram)», «[site · implantes]») e grava pelo menos origem = site/anúncio + plataforma.

### 3. A mensagem chega ao Órbita
- **Kamiguchi hoje:** celular da recepção pareado no CodeWords, rota «direta» (sem IA de fluxo). O aparelho avisa o
  Órbita pela URL secreta do canal; a cada 2 minutos o Órbita também confere as conversas recentes para pegar o que
  o aviso perdeu.
- Alternativa: número oficial na API da Meta (webhook assinado). A Kamiguchi não usa.
- O Órbita descarta grupo, status, mensagem do próprio número; reconhece texto, foto, áudio, vídeo, documento,
  figurinha, localização, contato, reação e o `referral` do anúncio.

### 4. Contato, conversa e oportunidade (tudo automático)
Numa única transação, travada por empresa + telefone (duas mensagens ao mesmo tempo não criam dois contatos):
- **Contato**: acha pelo número (com ou sem o 9, com ou sem 55); se não existe, cria com origem `anuncio`
  (quando veio referral de anúncio) ou `whatsapp`.
- **Conversa**: nova, com protocolo, departamento (Recepção) e distribuição (manual ou rodízio); «aguardando resposta»
  ligado; contador de não lidas.
- **Mensagem** gravada (com o código visível para o atendente — a IA é instruída a ignorá-lo).
- **Oportunidade** no funil padrão, etapa «Nova», ligada ao contato e à conversa. Regra desta rodada: se o contato já
  tem oportunidade **aberta**, usa a mesma (qualquer idade); se a última está **fechada**, nasce uma nova.
- **Código do site** → `nx_rastreio_atribuir`: grava origem (anúncio/site/orgânico), plataforma (Meta/Google),
  campanha e criativo (casando com as métricas do Meta/Google pelo id ou pelo nome), página e hora do clique. Nunca
  sobrescreve um anúncio que já veio pela Meta.
- Fora do horário do departamento → mensagem automática entra na fila (sai no próximo minuto). «SAIR/PARAR» →
  contato marcado como «não receber marketing».
- **Aviso à equipe**: o painel aberto sente em 3 s (10 s em outras telas, até 60 s com a aba escondida — nesta
  rodada cai para 15 s), badge no menu, título da aba «(1) Órbita», som e notificação com a aba escondida; admins
  recebem notificação «lead de anúncio».

### 5. Automações e IA
- Cada acontecimento (lead novo, mudou de etapa, ganhou, etiqueta, sem resposta há X min, tempo na etapa, tarefa
  vencida, X h antes da consulta) vira um **evento**; a cada 15 s o motor roda as automações **ligadas** (só gera
  evento se existe automação ativa daquele gatilho). Ações: etiquetar, tarefa, nota, mover etapa, atribuir, avisar,
  mensagem/modelo, esperar, parar, **IA decidir** (classificar etapa, resumir, pontuar o lead).
- Provado em produção (04/10, empresa de teste): 5 automações, 11 tipos de ação, inclusive espera de 1 minuto e a IA
  pontuando o lead com motivo. Um defeito real foi corrigido então (etiqueta na oportunidade não disparava).
- **Duas IAs diferentes:** (a) a do **fluxo do CodeWords** responde ao cliente sozinha, marca/remarca/cancela
  consulta pela agenda do Órbita e chama humano — roda no CodeWords, com o prompt que o Órbita gera; **na Kamiguchi
  está desligada** (rota direta, sem Service ID); (b) a do **Órbita** (chave Anthropic sua) só sugere resposta,
  resume e decide em automações — nunca manda mensagem ao cliente sozinha.

### 6. O atendente
- Abre a conversa: lista à esquerda, chat, painel do contato (oportunidade, consultas, tarefas, etiquetas, origem).
- **Assumir** (ou «Atender o próximo»), **transferir**, **nota interna**, **respostas rápidas** com `/`, anexos,
  áudio gravado, citação, etiquetas, **IA sugerir/resumir**.
- Ao enviar, o texto é guardado no navegador antes de ir ao servidor (não se perde com queda de rede), tem um
  identificador único (nunca sai em dobro, mesmo apertando «tentar de novo»), e os recibos ✓ ✓✓ voltam do aparelho.
- Da conversa: «+ Oportunidade», mover etapa, **Marcar consulta** (horários livres da agenda, confirmação,
  Desfazer), Ganhou/Perdeu (com valor/motivo). Resolver com Desfazer de 7 s.

### 7. Relatórios e o painel de anúncios
- **Início**: quem espera resposta, consultas de hoje, valor em aberto, leads da semana (e quantos de anúncio),
  metas do mês, atividade por hora; nesta rodada: funil do mês, séries de 14 dias do servidor, «respondidas no prazo»,
  lista de quem espera com «Assumir» e **estado do número** (conectado/desconectado).
- **Relatórios**: Vendas (criados, ganhos, receita, conversão, ciclo, funil por etapa, por origem, por responsável,
  perdas) e Atendimento (novas, resolvidas, 1ª resposta, por atendente, calor dia × hora — nesta rodada com hora
  de verdade).
- **Anúncios**: investimento, conversas registradas no CRM com origem anúncio, agendamentos, fechamentos, receita,
  «cada R$ 1 investido virou R$ X», campanhas com colunas do CRM, criativos, **Radar** (CPA alto, gasto sem conversa,
  CTR baixo, frequência, ritmo do orçamento, conexão parada), relatórios enviados.
- **Ciclo** de hora em hora (minuto 07): busca Meta e Google dos últimos 7 dias, grava por dia, avalia o Radar e
  manda alertas ao WhatsApp do gestor. **Relatório diário** 8h (gestor) e **mensal** dia 1º (cliente + gestor), com a
  «Leitura do dia» pela IA quando há chave.

## O que se perde em cada variante (e o que esta rodada muda)

| Situação | Hoje | Nesta rodada |
|---|---|---|
| Pessoa apaga o código ou manda áudio primeiro | Origem vira «WhatsApp» | Reconhece «Vim pelo site/anúncio» e «[site · …]» como origem site/anúncio + plataforma; sem texto nenhum continua «WhatsApp» (não há como saber) |
| Anúncio «Enviar mensagem» (clique-para-WhatsApp) | Origem anúncio/Meta com id do criativo; campanha só quando o ciclo já sincronizou aquele anúncio | Campanha completada depois pelo ciclo (reconciliação diária); referral de post/página não é mais tratado como anúncio |
| Link da bio, contato salvo, indicação | «WhatsApp» (a IA do fluxo pode perguntar e registrar) | Igual; a origem contada à IA preserva a plataforma (Instagram ≠ Google) |
| Aviso do aparelho falhou e a mensagem veio pela conferência de 2 min | Mensagem e lead entram, **mas o código do site é ignorado** e ninguém sabe que ficou sem resposta | Código aplicado também nesse caminho; notificação «mensagem recuperada sem resposta» |
| Número na API da Meta (outro cliente) | Código do site **nunca** é lido | Lido também no canal Meta |
| Anúncio Meta sem UTM (só `fbclid`) | «site», sem plataforma | Meta orgânico/social; exemplos de UTM com macros na tela |
| Cliente volta a escrever com oportunidade aberta há > 30 dias | Nascia uma 2ª oportunidade (duplicada) | Mesma oportunidade |
| Cliente volta depois de ganho/perdido | Caía na oportunidade fechada (anúncio novo escrito nela) | Nova oportunidade |
| Nome do contato já cadastrado no CRM | Oportunidade nascia com o apelido do WhatsApp | Nome do CRM |
| Celular da recepção deslogou do WhatsApp | **Ninguém é avisado** (só ao abrir Configurações › Números) | Vigia a cada ciclo: notificação no app, aviso no WhatsApp do gestor após 10 min, faixa no Início e nas Conversas |
| Mensagem de modelo (template) com timeout | «Tentar de novo» podia cobrar em dobro | Mesmo identificador único do texto |
| Relatório diário sem gestor cadastrado | Falhava todo dia | Pulado com aviso único |
| Receita e «retorno» sem valor na oportunidade | Inventava R$ 420 por fechamento e um fee de R$ 997/mês | Só valor real; estimativa só se configurada e marcada como estimativa |

## O que depende de você (continua igual)
- Chave da Anthropic (já está) e, se quiser a IA respondendo sozinha no WhatsApp da Kamiguchi, o **Service ID** do
  fluxo no CodeWords.
- UTMs nos anúncios que levam ao site (a tela de Rastreio mostra o que colar).
- Forma de pagamento da WABA e número na API da Meta só se algum cliente for usar o canal oficial.
- Política de privacidade do site da clínica citando o rastreio (texto modelo na tela de Rastreio).
- Decisões que tomei como padrão e você pode mudar: as sete da seção «Decisões» em
  `docs/orbita/PLANO-100-20261008.md`.

## Estado real da Kamiguchi em 08/10 (contagens)
2 contatos (1 pelo WhatsApp, 1 manual), 2 conversas abertas, 10 mensagens nos últimos 7 dias (2 recebidas, 8
enviadas), 1 oportunidade aberta; aparelho «conectado» desde 01/10 17:14, sem nenhuma reconferência desde então
(por isso o vigia); 0 códigos do site casados até hoje (os 6 cliques de rastreio existentes eram de teste local, de
04/10, e foram apagados). Crons sem falha nas últimas 24 h. Nenhum erro nas funções.
