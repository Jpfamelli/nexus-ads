# Nexus Ads — guia de uso e configuração

Este guia é para você, João. Ele explica o que o Nexus Ads faz, como ligar cada
peça e o que fazer quando algo não funciona. Leia uma vez inteiro e depois use
como consulta. Onde aparece um nome entre parênteses, como `(meta_access_token)`,
é o nome técnico do campo; ele ajuda se você precisar pedir ajuda ao Claude.

**Endereço do painel:** https://jpfamelli.github.io/nexus-ads/
**Demonstração sem login:** https://jpfamelli.github.io/nexus-ads/?demo

---

## Sumário

1. O que é o Nexus Ads
2. Primeiro acesso: criar a sua conta de gestor
3. Cadastrar a clínica
4. Conectar o Meta Ads (Facebook e Instagram)
5. Conectar o Google Ads
6. WhatsApp da Nexus: para receber avisos e relatórios
7. WhatsApp da clínica: para capturar as conversas
8. A chave da IA (opcional)
9. O que a recepção faz no dia a dia
10. O que acontece sozinho, e quando
11. Quanto custa
12. Problemas comuns
13. O que o Claude já deixou pronto
14. O que só você pode fazer
15. Anexo: onde achar cada informação

---

## 1. O que é o Nexus Ads

O Nexus Ads é a central de tráfego pago da Nexus. Ele junta, num painel só, os
números do Meta Ads e do Google Ads de cada clínica que você atende, e cruza esses
números com o que aconteceu de verdade no consultório: quem conversou no
WhatsApp, quem agendou, quem veio e quem fechou tratamento.

Na prática, ele faz quatro coisas por você:

- **Busca os números sozinho.** De hora em hora ele puxa gasto, cliques e
  conversas das campanhas. Você não precisa exportar planilha.
- **Vigia as campanhas (o "radar").** Se uma campanha começa a pagar caro demais
  por conversa, gasta sem trazer ninguém, ou se um criativo cansa o público, você
  recebe um aviso no seu WhatsApp. Ele também avisa se a conexão com o Meta ou o
  Google de alguma clínica parar (token vencido, permissão retirada…), para os
  números nunca ficarem velhos sem você saber.
- **Manda relatórios.** Todo dia às 8h você recebe o resumo de ontem. No dia 1º
  de cada mês, a clínica recebe o resumo do mês anterior, escrito para quem não é
  do marketing ("cada R$ 1 em anúncio virou R$ X em tratamentos").
- **Mostra o caminho do paciente.** Cada conversa nova no WhatsApp da clínica vira
  um cartão na aba Pacientes. Quando a pessoa chegou por um anúncio de clique para
  o WhatsApp do Meta, o cartão já vem com o anúncio de origem (veja a seção 7.5 para
  as outras origens). A recepção só move o cartão conforme o paciente avança.

Existem dois tipos de conta:

- **Gestor** (você): vê todas as clínicas e tem a aba **Ajustes**, onde tudo é
  configurado.
- **Clínica** (a recepção ou o dono da clínica): vê só a própria clínica e não
  tem a aba Ajustes.

---

## 2. Primeiro acesso: criar a sua conta de gestor

A primeira conta criada no sistema vira a conta de gestor. Para isso ela precisa
de um **código de ativação**, que impede que um estranho chegue antes de você.

1. Abra https://jpfamelli.github.io/nexus-ads/ no computador.
2. Clique em **Primeiro acesso (tenho um código)**.
3. Preencha seu nome, seu e-mail e uma senha com pelo menos 8 caracteres.
4. No campo **Código de ativação**, digite o código que o Claude te passou.
   Se você não tiver o código, ele fica no Supabase: abra o projeto `nexus-ads` em
   https://supabase.com/dashboard, vá em **Table Editor → nx_config** e copie a
   coluna `codigo_gestor`.
5. Clique em **Criar conta**. A conta já nasce como gestor, aprovada; se o painel
   não entrar sozinho, entre com o mesmo e-mail e senha.

Depois disso, qualquer outra pessoa que criar conta (por exemplo, a recepção da
clínica) entra como **pendente** e só consegue ver algo depois que você aprovar:

1. Peça para a pessoa abrir o mesmo endereço e clicar em **Criar conta** (sem código).
2. No seu acesso, vá em **Ajustes → Contas de acesso**.
3. Aprove a conta, escolha o papel **Clínica** e marque qual clínica ela pode ver.

> A sessão fica salva no navegador por 30 dias. Em computador compartilhado,
> use o botão de sair ao terminar.

---

## 3. Cadastrar a clínica

Tudo o que é de uma clínica fica na aba **Ajustes**, na parte do cliente.

1. Em **Ajustes**, clique em **+ Novo cliente** (ou escolha um existente no seletor
   do menu).
2. Preencha:
   - **Nome** da clínica, como deve aparecer nos relatórios.
   - **Identificador** `(slug)`, se o campo aparecer: é o apelido interno da
     clínica, só com letras minúsculas, números e hífen, sem acento nem espaço.
     Ex.: `kamiguchi`.
   - **Nome curto** `(nomeCurto)`, se o campo aparecer: é opcional e vai no título
     das mensagens. Ex.: "Kamiguchi".
   - **Custo por conversa desejado** `(cpaAlvo)`: quanto você aceita pagar por
     cada conversa no WhatsApp. O radar avisa quando uma campanha passa 35% disso.
   - **Orçamento do mês** `(orcamento)`: quanto a clínica investe em anúncios por
     mês. O radar avisa se o ritmo de gasto for estourar.
   - **Fee** `(fee)`: o valor mensal da Nexus. Entra no "retorno total" do painel
     (anúncios + fee).
   - **Valor médio de cada tratamento** `(ticket)`: por exemplo, aparelho
     invisível R$ 5.500, implante R$ 3.500. É o valor sugerido quando a recepção
     marca que um paciente fechou, e o que entra na conta quando o valor não foi
     informado.
   - **WhatsApp do gestor** `(waGestor)`: o(s) número(s) que recebem os alertas e o
     relatório diário. Normalmente o seu. Com DDD, por exemplo 12999998888.
   - **WhatsApp da clínica para o resumo mensal** `(waCliente)`: o número do dono
     da clínica. Ele recebe só o resumo do mês (você recebe uma cópia).
   - **ID do número de WhatsApp da clínica** `(wa_phone_number_id)`: preencha
     depois, quando fizer a seção 7.
   - **Regras do radar**: deixe todas ligadas no começo. Dá para desligar uma
     regra que não faça sentido para aquela clínica.
3. Salve.

---

## 4. Conectar o Meta Ads (Facebook e Instagram)

O Nexus Ads lê os números da conta de anúncios da clínica usando um **token**, que
é como uma senha só de leitura. O caminho mais seguro é um token de **usuário do
sistema**, que não vence e não depende da sua senha pessoal do Facebook.

Você vai precisar do **Gerenciador de Negócios** da Nexus. Hoje a Meta chama isso
de **Portfólio empresarial**; o endereço é https://business.facebook.com/settings.

### 4.1. A Nexus precisa ter acesso à conta de anúncios da clínica (parceiro)

A conta de anúncios pertence à clínica. A Nexus entra como parceira:

1. Em https://business.facebook.com/settings, no portfólio da Nexus, abra
   **Contas → Contas de anúncios**.
2. Clique em **Adicionar → Solicitar acesso a uma conta de anúncios** e digite o
   ID da conta de anúncios da clínica (veja o item 4.4).
3. Quem administra o portfólio da clínica recebe o pedido e precisa aprovar.

Se preferir o caminho inverso: o administrador da clínica abre a conta de anúncios
no portfólio dela, clica em **Atribuir parceiro** e informa o **ID do portfólio da
Nexus** (fica em **Configurações do negócio → Informações do negócio**).

### 4.2. Criar o app no Meta for Developers

Um app só serve para todas as clínicas, e é o mesmo app que vai cuidar do WhatsApp.

1. Abra https://developers.facebook.com/apps e clique em **Criar app**.
2. Dê um nome (por exemplo, "Nexus Ads") e informe seu e-mail.
3. Quando perguntar o caso de uso ou o tipo de app, escolha a opção de **Empresa**
   (Business) e ligue o app ao portfólio empresarial da Nexus.
4. No painel do app, procure **Adicionar produto** e adicione a **API de
   Marketing** (Marketing API).
5. Anote que o app precisa da permissão **ads_read** (leitura de anúncios). Para ler
   contas que o próprio portfólio da Nexus gerencia, em geral não é preciso pedir
   revisão à Meta.

### 4.3. Criar o usuário do sistema e gerar o token que não vence

1. Em https://business.facebook.com/settings, abra **Usuários → Usuários do sistema**.
2. Clique em **Adicionar**, dê o nome "nexus-ads" e escolha a função
   **Administrador**.
3. Com o usuário criado, clique em **Atribuir ativos**:
   - em **Apps**, marque o app "Nexus Ads" com controle total;
   - em **Contas de anúncios**, marque a conta da clínica com permissão de ver
     desempenho (ou gerenciar).
4. Clique em **Gerar novo token**:
   - escolha o app "Nexus Ads";
   - em validade, escolha **Nunca**;
   - marque a permissão **ads_read**. Se quiser usar o mesmo token no WhatsApp da
     Nexus (seção 6), marque também **whatsapp_business_messaging** e
     **whatsapp_business_management**.
5. Copie o token e guarde num lugar seguro. **Ele só aparece uma vez.** Se perder,
   gere outro.

Cada clínica nova que você pegar só precisa do passo 3 de novo (atribuir a conta
de anúncios dela ao mesmo usuário do sistema). O token continua o mesmo.

### 4.4. Achar o ID da conta de anúncios

- No Gerenciador de Anúncios da clínica, olhe o endereço do navegador: o número
  depois de `act=` é o ID. Exemplo: `act=123456789012345` → ID `123456789012345`.
- Ou em **Configurações do negócio → Contas → Contas de anúncios**, clicando na
  conta: o ID aparece embaixo do nome.

### 4.5. Colar no Nexus Ads

1. Em **Ajustes**, com a clínica escolhida, abra a integração **Meta**.
2. Preencha:
   - **Token de acesso** `(meta_access_token)`: o token do item 4.3.
   - **ID da conta de anúncios** `(meta_ad_account_id)`: com ou sem o `act_` na frente.
   - **Nome da conta** `(conta_nome)`: opcional, só para você reconhecer.
3. Salve. Os campos de senha nunca voltam a aparecer preenchidos; a tela só mostra
   "preenchido". Isso é de propósito.
4. Clique em **Atualizar dados agora**. Em um ou dois minutos o status da
   integração deve mostrar "ok — N linhas". Se mostrar "erro — ...", veja a seção 12.

> O que conta como "conversa" no Meta: conversas iniciadas pelo WhatsApp ou Direct
> a partir do anúncio, mais cadastros de lead e compras, se a campanha usar
> formulário ou site. Cada conversa conta uma vez só, mesmo que o Meta a informe
> em mais de um tipo.

---

## 5. Conectar o Google Ads

O Google pede mais passos que o Meta, e um deles depende de aprovação do Google
(leva alguns dias). Vale começar cedo.

São **6 campos** no final: developer token, ID da conta da clínica, Client ID,
Client secret, refresh token e ID da conta de gerente. O último só é necessário
quando o acesso à clínica passa pela conta de gerente, que é o caminho deste guia.

### 5.1. Conta de gerente (MCC) da Nexus

A conta de gerente é uma conta do Google Ads que "enxerga" as contas das clínicas.

1. Crie em https://ads.google.com/home/tools/manager-accounts/ (use o e-mail da Nexus).
2. Dentro da conta de gerente, vá em **Contas → + → Vincular conta existente** e
   digite o ID da conta do Google Ads da clínica (10 dígitos, no formato 123-456-7890).
3. A clínica recebe o convite e precisa aceitar em **Administrador → Acesso e
   segurança → Gerentes** na conta dela.

Anote os dois números:
- **ID da conta da clínica** `(google_customer_id)`: aparece no topo do Google Ads
  quando você abre a conta da clínica.
- **ID da conta de gerente** `(google_login_customer_id)`: aparece no topo quando
  você está na conta de gerente.

### 5.2. Pedir o developer token (a parte que demora)

1. Na **conta de gerente**, abra **Administrador → Central de API** (API Center).
2. Preencha o formulário (nome da empresa, site da Nexus, e-mail de contato) e
   aceite os termos. O **developer token** aparece nessa página.
3. No começo o token vem com acesso limitado, que só funciona com contas de teste.
   Na mesma página, peça o **Acesso básico** (Basic access). O Google analisa o
   pedido e a **aprovação costuma levar alguns dias**. Você recebe um e-mail.
4. Enquanto não for aprovado, o status da integração do Google mostra um erro em
   inglês parecido com "The developer token is only approved for use with test
   accounts". É esperado; o Meta continua funcionando.

### 5.3. Criar o cliente OAuth no Google Cloud

O "cliente OAuth" é o que permite ao Nexus Ads pedir sua autorização uma única vez.

1. Abra https://console.cloud.google.com/ com a mesma conta Google da conta de
   gerente e crie um projeto chamado "nexus-ads".
2. Em **APIs e serviços → Biblioteca**, procure **Google Ads API** e clique em
   **Ativar**.
3. Abra a **Tela de consentimento OAuth** (o Google às vezes chama de
   "Google Auth Platform"):
   - tipo de usuário **Externo**;
   - nome do app "Nexus Ads" e seu e-mail;
   - em **Público**, clique em **Publicar app** para ele ficar **Em produção**.
     Isso é importante: com o app em modo "Teste", o refresh token **para de
     funcionar depois de 7 dias**. Não precisa pedir verificação ao Google para uso
     próprio.
4. Vá em **Credenciais** (ou **Clientes**) → **Criar credenciais → ID do cliente
   OAuth**.
5. Em tipo de aplicativo, escolha **App para computador** (Desktop app). Tem que
   ser esse tipo; o tipo "Aplicativo da Web" não funciona com o script.
6. Clique em **Criar** e copie o **Client ID** (termina em
   `.apps.googleusercontent.com`) e o **Client secret** (começa com `GOCSPX-`).

### 5.4. Gerar o refresh token com o script

O refresh token é a autorização permanente para ler os anúncios. O Claude deixou um
script que faz isso. Ele só precisa do **Node.js** (versão 18 ou mais nova) no
computador: se `node --version` no terminal mostrar um número, está tudo certo; se
não, instale a versão LTS em https://nodejs.org/.

1. Abra o terminal (PowerShell) na pasta do Nexus Ads
   (`C:\Users\USER\.claude\backups\nexus-ads`).
2. Rode:
   ```
   node scripts/google-refresh-token.mjs
   ```
3. Cole o **Client ID** e aperte Enter. Depois cole o **Client secret** e aperte Enter.
   Cole quando o script pedir, e não junto com o comando: o que vai na linha do
   comando fica gravado no histórico do terminal.
4. O navegador abre sozinho na tela do Google. Se não abrir, copie o link que
   apareceu no terminal e cole no navegador. Você tem 5 minutos para concluir.
5. Entre com a conta Google que tem acesso à conta de gerente e clique em
   **Permitir**. Se aparecer "O Google não verificou este app", clique em
   **Avançado → Acessar Nexus Ads**. É o seu próprio app, então está tudo certo.
6. A página vai dizer "Pronto!" e o terminal mostra o **refresh token** (começa
   com `1//`). Copie a linha inteira.

O script não salva nada no computador. Se fechar o terminal sem copiar, é só
rodar de novo.

Se a própria página do Google mostrar um erro (em vez de voltar para o script):
- **"Erro 400: redirect_uri_mismatch"**: o cliente OAuth não é do tipo **App para
  computador**. Crie outro com esse tipo (5.3, passo 5) e rode de novo com o Client
  ID novo.
- **"Acesso bloqueado"** ou **"Erro 403: access_denied"**: o app ainda está em modo
  Teste e o seu e-mail não está em **Usuários de teste**. Publique o app (5.3,
  passo 3) e rode de novo.

Nesses casos o terminal fica esperando até dar "Tempo esgotado"; pode fechar com
Ctrl+C.

### 5.5. Preencher os 6 campos no Nexus Ads

Em **Ajustes**, com a clínica escolhida, abra a integração **Google** e preencha:

| Campo | O que colar |
|---|---|
| Developer token `(google_developer_token)` | o token da Central de API (5.2) |
| ID da conta da clínica `(google_customer_id)` | 10 dígitos, com ou sem traços (5.1) |
| Client ID `(google_client_id)` | do Google Cloud (5.3) |
| Client secret `(google_client_secret)` | do Google Cloud (5.3) |
| Refresh token `(google_refresh_token)` | o que o script mostrou (5.4) |
| ID da conta de gerente `(google_login_customer_id)` | 10 dígitos da MCC (5.1) |

Salve e clique em **Atualizar dados agora**. O status deve mostrar "ok — N linhas".

Para a próxima clínica, você só vincula a conta dela à MCC (5.1) e preenche os
campos de novo: developer token, Client ID, Client secret, refresh token e MCC são
os mesmos; muda apenas o ID da conta da clínica.

> **Versão da API do Google.** O Google desliga versões antigas da API com
> frequência. O Nexus Ads tenta sozinho as versões v23, v22, v21 e v20 e usa a
> primeira que responder. Se um dia todas pararem, preencha a versão nova em
> **Ajustes → Configuração da Nexus → Versão da API do Google** `(google_api_versao)`,
> por exemplo `v24`. Se esse campo não aparecer no painel, peça ao Claude para
> gravar a versão.
> A lista de versões ativas fica em
> https://developers.google.com/google-ads/api/docs/sunset-dates

---

## 6. WhatsApp da Nexus: para receber avisos e relatórios

Os alertas e relatórios saem de um número de WhatsApp **da Nexus**, pela API
oficial da Meta (WhatsApp Cloud API). Para começar, dá para usar o **número de
teste gratuito** que a Meta oferece.

### 6.1. Ativar o WhatsApp no app

1. No app "Nexus Ads" em https://developers.facebook.com/apps, clique em
   **Adicionar produto → WhatsApp → Configurar**.
2. Abra **WhatsApp → Configuração da API** (API Setup). A Meta já cria um **número
   de teste**.
3. No campo **Para** (destinatários), adicione o seu número e os outros que vão
   receber avisos. Cada número recebe um código no WhatsApp para confirmar.
   **O número de teste só manda mensagem para até 5 números confirmados.**
4. Copie o **ID do número de telefone** (Phone number ID) que aparece nessa página.

Quando quiser, você pode trocar o número de teste por um número próprio da Nexus
na mesma tela (**Adicionar número de telefone**). Aí o limite de 5 números acaba.

### 6.2. Token para enviar mensagens

O token temporário que aparece em "Configuração da API" **vence em 24 horas**. Não
use esse. Use o usuário do sistema da seção 4.3:

1. Em https://business.facebook.com/settings, abra **Contas → Contas do WhatsApp**
   e atribua a conta do WhatsApp ao usuário do sistema "nexus-ads" (controle total).
2. Gere um token (validade **Nunca**) com as permissões
   **whatsapp_business_messaging** e **whatsapp_business_management**. Se você já
   gerou um token com essas permissões na seção 4.3, pode usar o mesmo.

### 6.3. O modelo de mensagem "nexus_relatorio" (e por que ele existe)

O WhatsApp tem uma regra chamada **janela de 24 horas**: uma empresa só pode mandar
texto livre para alguém que falou com ela nas últimas 24 horas. Fora dessa janela,
só é permitido mandar um **modelo aprovado** (template).

O Nexus Ads sempre tenta mandar o texto completo. Se a janela estiver fechada, ele
manda o modelo `nexus_relatorio`, com um título curto e o link do painel. Crie esse
modelo assim:

1. Abra o **Gerenciador do WhatsApp** (https://business.facebook.com/wa/manage/message-templates/)
   e clique em **Criar modelo**.
2. Categoria: **Utilidade**. Nome: `nexus_relatorio` (exatamente assim, minúsculo e
   com sublinhado). Idioma: **Português (BR)**.
3. No corpo, use exatamente duas variáveis, `{{1}}` (título) e `{{2}}` (link do painel).
   Sugestão de texto:
   ```
   Nexus Ads: {{1}}. Veja os detalhes no painel: {{2}} . Responda esta mensagem para voltar a receber o texto completo por aqui.
   ```
4. A Meta pede exemplos para as variáveis. Use, por exemplo, "Relatório do dia" e
   `https://jpfamelli.github.io/nexus-ads/`.
5. Envie para aprovação. Costuma sair em minutos ou poucas horas.

Dica: responda qualquer coisa (um "ok") às mensagens da Nexus de vez em quando. Isso
reabre a janela de 24 horas e os relatórios chegam completos, e não só o aviso com
o link.

### 6.4. Colar no Nexus Ads

Em **Ajustes → Configuração da Nexus**:

- **Token do WhatsApp** `(wa_access_token)`: o token do item 6.2.
- **ID do número da Nexus** `(wa_phone_number_id)`: o Phone number ID do item 6.1.
- **Modelo** `(wa_template)`: `nexus_relatorio`, depois que ele for aprovado.
- **Link do painel** `(painel_url)`: `https://jpfamelli.github.io/nexus-ads/`.

Para testar:

1. Confira se o seu número está em **WhatsApp do gestor** `(waGestor)` na clínica
   (seção 3). Sem destino, o relatório é gerado, mas não vai para ninguém.
2. Do seu celular, mande um "oi" para o número da Nexus. Isso abre a janela de 24
   horas; sem ela, o primeiro envio só funciona depois que o modelo `nexus_relatorio`
   for aprovado.
3. Em **Ajustes**, clique em **Gerar relatório agora**. O relatório deve chegar no
   seu WhatsApp em até um minuto.

### 6.5. Saber se o aviso chegou mesmo (confirmação de entrega)

Quando o Nexus Ads manda um alerta ou um relatório, a Meta responde "recebi" na
hora. Isso **não** quer dizer que a mensagem chegou no celular. Com a janela de 24
horas fechada, por exemplo, a Meta aceita a mensagem e só alguns segundos depois
avisa que não conseguiu entregar. Sem ouvir esse segundo aviso, o sistema acharia
que deu tudo certo.

Para o Nexus Ads ouvir esses avisos, o **mesmo webhook** da seção 7.3 precisa valer
também para o **número da Nexus** (o que manda os alertas), e não só para o da
clínica:

1. Faça a seção **7.3** (URL de retorno, token de verificação e o campo
   **messages**) e a **7.4** (App secret). Faça isso mesmo que o número da clínica
   ainda não esteja conectado: é o mesmo webhook para os dois números.
2. O webhook do app vale para os números das contas do WhatsApp ligadas ao app. O
   número de teste e os números adicionados pela tela **Configuração da API** do app
   já ficam ligados. Se o número da Nexus estiver numa conta do WhatsApp diferente
   (por exemplo, trazida de outro Gerenciador de Negócios) e nada for confirmado,
   peça ao Claude para conferir se o app está inscrito nessa conta.
3. Teste: em **Ajustes**, clique em **Gerar relatório agora**. Em até um minuto o
   relatório chega no seu WhatsApp e, na aba **Relatórios**, aparece como
   **entregue**.

O que o sistema faz com cada aviso da Meta:

- **Entregue ou lido**: marca o alerta ou o relatório como entregue, com a hora.
- **Janela de 24 horas fechada**: manda sozinho, **uma única vez**, o modelo
  `nexus_relatorio` (título e link do painel) para aquele número, e anota "fora da
  janela de 24h — reenviado como template". Se nem o modelo for entregue, ele não
  tenta de novo, para não ficar repetindo mensagem, e só anota o motivo. Isso
  depende do modelo estar configurado (6.3 e 6.4).
- **Outro problema** (número sem WhatsApp, pessoa que bloqueou a Nexus, pagamento
  pendente na conta do WhatsApp…): anota o motivo em português, por exemplo
  "WhatsApp não entregou (código 131026): … o número não pôde receber".

Sem esta parte ligada, tudo continua funcionando como antes: os avisos saem, só não
há confirmação de entrega nem o reenvio automático pelo modelo.

---

## 7. WhatsApp da clínica: para capturar as conversas

Esta parte faz cada conversa nova no WhatsApp da clínica virar um cartão na aba
Pacientes, com o anúncio de onde a pessoa veio. Ela usa o **número da clínica** na
API oficial (Cloud API), no mesmo app "Nexus Ads".

### 7.1. Antes de tudo: o número da clínica e o aplicativo do celular

Hoje a recepção provavelmente atende pelo aplicativo **WhatsApp Business** no
celular. Tradicionalmente, quando um número entra na Cloud API, ele **deixa de
funcionar no aplicativo**. A Meta tem um recurso chamado **coexistência**, que
permite usar o aplicativo e a API ao mesmo tempo no mesmo número.

**Confirme durante a configuração se a opção de coexistência aparece para o número
da clínica antes de conectar.** Se ela não aparecer, não conecte o número principal
da clínica: a recepção ficaria sem o WhatsApp no celular. Nesse caso, fale com o
Claude antes para escolher outro caminho (por exemplo, um segundo número só para
os anúncios).

### 7.2. Conectar o número da clínica

1. No app, abra **WhatsApp → Configuração da API → Adicionar número de telefone**.
2. Siga os passos: nome de exibição, categoria (Saúde) e confirmação do número
   por SMS ou ligação.
3. Copie o **ID do número de telefone** (Phone number ID) do número da clínica.
4. No Nexus Ads, em **Ajustes**, na parte da clínica, cole esse número no campo
   **ID do número de WhatsApp da clínica** `(wa_phone_number_id)` e salve. É ele que
   diz ao sistema de qual clínica é cada conversa.

### 7.3. Assinar o webhook (o "aviso" que a Meta manda a cada mensagem)

1. No Nexus Ads, abra **Ajustes → Configuração da Nexus**. No quadro **Webhook do
   WhatsApp** estão a **URL de retorno** e o **Token de verificação**, cada um com
   um botão **Copiar**.
2. No app da Meta, abra **WhatsApp → Configuração** e, em **Webhook**, clique em
   **Editar**.
3. Cole a URL de retorno no campo **URL de callback** e o token no campo **Token de
   verificação**. Clique em **Verificar e salvar**.
4. Em **Campos do webhook**, clique em **Gerenciar** e assine o campo **messages**.

Esse mesmo webhook faz duas coisas: traz as conversas do número da clínica (que
viram pacientes) e os avisos de entrega do número da Nexus (seção 6.5). O sistema
separa sozinho um do outro pelo ID de cada número. Se a mesma pessoa mandar várias
mensagens de uma vez, ela vira um cartão só.

### 7.4. App secret (a prova de que a mensagem veio mesmo da Meta)

1. No app da Meta, abra **Configurações do app → Básico**.
2. Em **Chave secreta do app**, clique em **Mostrar** (a Meta pede sua senha) e copie.
3. No Nexus Ads, em **Ajustes → Configuração da Nexus**, cole no campo **App secret**
   `(meta_app_secret)` e salve.

Sem o app secret, o Nexus Ads recusa todas as mensagens que chegam. Isso é de
propósito: impede que alguém invente pacientes mandando dados falsos para a URL.

### 7.5. Deixar o app "Ao vivo" e testar

1. No topo do painel do app da Meta, mude o modo de **Desenvolvimento** para
   **Ao vivo**. A Meta pede o link de uma política de privacidade; pode ser uma
   página no site da Nexus.
2. De outro celular, mande uma mensagem para o número da clínica.
3. Em alguns segundos, um cartão novo aparece na aba **Pacientes**, na coluna
   **Nova** (se o painel já estava aberto, atualize a página).

Como a origem é identificada:
- Conversa que começou num **anúncio de clique para o WhatsApp** do Meta chega
  marcada com a campanha e o anúncio.
- Conversa que começou de outro jeito (Google, site, indicação) chega como
  "WhatsApp direto". A recepção pode corrigir a origem no cartão.
- Só as conversas marcadas com um anúncio entram na conta de retorno dos anúncios
  (agendadas, fechados e "cada R$ 1 virou R$ X"). As outras aparecem em Pacientes,
  mas ficam fora dessa conta. Por isso o retorno do Google tende a sair menor do que
  o real: quem clica num anúncio do Google e chama no WhatsApp chega como "WhatsApp
  direto".
- Só entram conversas novas a partir do momento em que o webhook foi ligado. A
  mesma pessoa escrevendo de novo em até 30 dias não vira um cartão novo.

---

## 8. A chave da IA (opcional)

Com a chave, os relatórios ganham uma "leitura do dia" escrita pela IA a partir dos
números. Sem a chave, o relatório sai igual, com uma leitura feita por regras.

1. Crie uma chave em https://console.anthropic.com/ (menu **API Keys**).
2. Em **Ajustes → Configuração da Nexus**, cole em **Chave da IA** `(anthropic_api_key)`.
3. O modelo já vem preenchido (`claude-opus-5`). Não precisa mexer.

Se a IA falhar em algum dia, o relatório sai do mesmo jeito, com a leitura por
regras, e o erro fica registrado. A IA nunca impede o relatório.

---

## 9. O que a recepção faz no dia a dia

A recepção só precisa manter os cartões da aba **Pacientes** em dia. Leva um ou dois
minutos por dia e é isso que permite mostrar à clínica quanto os anúncios trouxeram
em dinheiro.

1. Entrar no painel com a conta da clínica.
2. Abrir **Pacientes**. Cada conversa nova aparece em **Nova**.
3. Clicar no cartão e mudar a etapa conforme o paciente avança:
   - **Agendada**: marcou avaliação. O sistema pede a data da consulta.
   - **Orçamento**: veio, foi avaliado e o orçamento está em aberto.
   - **Fechou**: fechou tratamento. O sistema sugere o valor pelo tratamento; a
     recepção confirma ou corrige.
   - **Não fechou**: veio, mas não fechou.
   - **Faltou**: não compareceu.
   - **Perdida**: parou de responder ou não tinha interesse.
4. No mesmo cartão dá para ajustar o **serviço** (implante, clareamento...), a
   **origem** e uma **observação**.
5. Paciente que chegou por indicação ou apareceu na recepção: usar o botão
   **+ Paciente**.

---

## 10. O que acontece sozinho, e quando

Tudo no horário de Brasília. "Ontem" é sempre o último dia completo.

| Quando | O que acontece | Quem recebe |
|---|---|---|
| **De hora em hora** | Busca os últimos 7 dias do Meta e do Google (o Meta corrige dias passados) e roda o radar. | Alertas novos vão para o **WhatsApp do gestor**. O mesmo alerta não se repete em menos de 24h. |
| **Todo dia às 8h** | Relatório de ontem: investido, conversas, custo por conversa, melhor e pior campanha, ritmo do mês, o que aconteceu no consultório e a leitura do dia. | **WhatsApp do gestor**. |
| **Dia 1º de cada mês às 9h** | Resumo do mês anterior, em linguagem simples para o dono da clínica. | **WhatsApp da clínica**, com cópia para o gestor. |
| **Quando uma conexão para** | Se a busca no Meta ou no Google de uma clínica falhar (token vencido, permissão retirada, developer token ainda não aprovado…), o radar manda o aviso **"A conexão com o Meta da clínica X parou"**, com o que fazer. Falha passageira (instabilidade da Meta ou do Google) só vira aviso se durar mais de 3 horas. | **WhatsApp do gestor**, no máximo uma vez a cada 24h por conexão. Quando volta a funcionar, não chega mensagem nenhuma. |
| **A qualquer hora** | Você pode forçar com **Atualizar dados agora**, **Gerar relatório agora** e **Gerar resumo do mês**, em Ajustes. O relatório gerado pelo botão é enviado de novo aos destinos. | — |

Uma clínica de cada vez: se você clicar num desses botões bem na hora em que a tarefa
automática está cuidando daquela mesma clínica, o clique é ignorado para ela (a tarefa
que já está rodando traz os números). É isso que impede alerta e relatório de chegarem
duplicados. As outras clínicas não são afetadas: o seu clique nunca faz a tarefa
automática pular ninguém. Se precisar, espere um ou dois minutos e clique de novo.

O relatório automático só sai quando houve investimento em anúncios no período
(nos últimos 7 dias, para o diário; no mês, para o resumo). Clínica sem anúncio
rodando não recebe relatório zerado. Os botões de Ajustes geram mesmo assim.

O painel sempre mostra os dados mais recentes que já foram buscados.

---

## 11. Quanto custa

| Item | Custo |
|---|---|
| Supabase (banco e funções) | Gratuito. O plano grátis sobra para várias clínicas. |
| GitHub Pages (o painel) | Gratuito, desde que o repositório seja **público** (em repositório privado, o GitHub Pages exige plano pago). Pode ser público sem medo: nenhuma senha fica no código, todas ficam no banco. |
| API do Meta Ads e do Google Ads | Gratuito. |
| IA (opcional) | Centavos por dia por clínica (uma leitura por relatório). Dá para colocar um limite de gasto no console da Anthropic. |
| WhatsApp: número de teste | Gratuito (até 5 destinatários). |
| WhatsApp: texto dentro da janela de 24h | Gratuito. |
| WhatsApp: modelo `nexus_relatorio` fora da janela | A Meta cobra por mensagem de modelo entregue; um modelo de utilidade custa alguns centavos. É cobrado no cartão cadastrado na conta do WhatsApp. Responder às mensagens da Nexus mantém a janela aberta e evita essa cobrança. |

---

## 12. Problemas comuns

O status de cada integração aparece em **Ajustes**, como "ok — N linhas" ou
"erro — mensagem". A mensagem de erro costuma dizer o que houve.

**Chegou no WhatsApp "A conexão com o Meta (ou o Google) da clínica X parou".**
O Nexus Ads tentou buscar os números dessa clínica e não conseguiu. A própria
mensagem diz o motivo em palavras simples e o que fazer; os casos mais comuns estão
logo abaixo. Enquanto isso, o painel mostra os números até a última busca que deu
certo, e o aviso se repete no máximo uma vez por dia. Depois de corrigir em
**Ajustes → Integrações**, clique em **Atualizar dados agora** para conferir. Quando
volta a funcionar, não chega mensagem nenhuma: o status volta para "ok".

**Meta: "Error validating access token", "token expirado" ou código 190.**
O token venceu ou foi invalidado. Isso acontece com token de usuário comum (vence em
cerca de 60 dias) ou quando o usuário do sistema foi removido. Gere um novo token de
usuário do sistema com validade **Nunca** (seção 4.3) e cole em Ajustes.

**Meta: erro de permissão (código 200 ou 10) ou "conta não encontrada".**
O usuário do sistema não tem acesso à conta de anúncios, ou a clínica ainda não
aprovou a Nexus como parceira. Refaça os itens 4.1 e 4.3 (atribuir ativos).

**Google: "The developer token is only approved for use with test accounts" ou "DEVELOPER_TOKEN_NOT_APPROVED".**
O Acesso básico do developer token ainda não foi aprovado (seção 5.2). É só esperar
o e-mail do Google. O Meta continua funcionando enquanto isso.

**Google: "USER_PERMISSION_DENIED" ou "não tem permissão para acessar o cliente".**
Falta o **ID da conta de gerente** `(google_login_customer_id)`, ou a conta da clínica
ainda não aceitou o vínculo com a MCC (seção 5.1).

**Google: "invalid_grant" ou "Token has been expired or revoked".**
O refresh token deixou de valer. A causa mais comum é o app estar em modo "Teste" na
tela de consentimento (o token morre em 7 dias). Publique o app (seção 5.3, passo 3)
e rode o script de novo (5.4).

**Google: erro 404, "UNIMPLEMENTED" ou "versão descontinuada".**
O Google desligou a versão da API. O sistema já tenta v23, v22, v21 e v20. Se todas
falharem, preencha a versão atual em **Ajustes → Configuração da Nexus → Versão da API
do Google** (seção 5.5).

**WhatsApp: a mensagem não chega e aparece "re-engagement" ou código 131047.**
A janela de 24 horas está fechada e o modelo `nexus_relatorio` não está configurado ou
ainda não foi aprovado (seção 6.3). Enquanto isso, mande um "oi" para o número da
Nexus: a janela abre por 24 horas. Com o modelo aprovado e a confirmação de entrega
ligada (6.5), o sistema reenvia sozinho pelo modelo e anota "reenviado como template".

**O alerta ou o relatório aparece como enviado, mas nunca como entregue.**
O sistema não está ouvindo os avisos de entrega da Meta. Confira a seção 6.5: o campo
**messages** assinado no webhook e o **App secret** preenchido. Se aparecer "WhatsApp
não entregou (código …)", o motivo vem escrito logo depois.

**WhatsApp: "Recipient phone number not in allowed list" ou código 131030.**
Você está usando o número de teste e o destino não está entre os 5 números
confirmados. Adicione o número em **Configuração da API → Para** (seção 6.1).

**WhatsApp: "whatsapp não configurado".**
Falta o token ou o ID do número da Nexus em **Ajustes → Configuração da Nexus** (seção 6.4).

**As conversas da clínica não aparecem em Pacientes.**
Confira, nesta ordem: o **App secret** está preenchido (7.4); o campo **messages** está
assinado no webhook (7.3); o app está **Ao vivo** (7.5); o **ID do número de WhatsApp da
clínica** em Ajustes é o Phone number ID do número dela, e não o da Nexus (7.2).

**O webhook não "verifica" na Meta.**
A URL de retorno ou o token de verificação foram colados com diferença. Copie de
novo pelos botões **Copiar** em **Ajustes → Configuração da Nexus**.

**O relatório chegou sem a "leitura do dia" da IA.**
A chave da IA não está preenchida ou a IA falhou naquele dia. O relatório sai assim
mesmo, com a leitura por regras, e o erro fica registrado na aba Relatórios.

**O projeto do Supabase foi pausado por inatividade?**
Não deve acontecer. O Supabase pausa projetos gratuitos que ficam uma semana sem uso,
e o Nexus Ads trabalha de hora em hora. Se mesmo assim o projeto pausar (por exemplo,
se o agendamento for desligado), o painel para de carregar: entre em
https://supabase.com/dashboard, abra o projeto `nexus-ads` e clique em **Restore**.

---

## 13. O que o Claude já deixou pronto

- **Banco de dados** no Supabase (projeto `nexus-ads`), com todas as tabelas, o login
  próprio (gestor e clínica, com aprovação) e as regras de segurança: nenhum dado sai
  sem uma sessão válida.
- **Agendamento automático**: busca e radar de hora em hora, relatório diário às 8h e
  resumo mensal no dia 1º às 9h.
- **Funções no servidor**: a que busca os números e roda o radar (e avisa quando uma
  conexão com o Meta ou o Google para), a que monta e envia os relatórios (com a
  leitura da IA quando houver chave) e a que recebe as mensagens do WhatsApp da
  clínica e os avisos de entrega do número da Nexus. Cada tarefa roda uma vez por
  vez, e a mesma pessoa escrevendo várias vezes ao mesmo tempo vira um cartão só.
- **O painel** em https://jpfamelli.github.io/nexus-ads/, com as abas Visão geral,
  Campanhas, Pacientes, Radar, Relatórios e Ajustes, e o modo demonstração (`?demo`).
- **Um único cálculo** para painel, radar e relatórios: os números do painel e os do
  WhatsApp sempre batem.
- **O script do refresh token do Google** (`scripts/google-refresh-token.mjs`).
- **Dados de demonstração** (`supabase/seed-demo.sql`): um cliente fictício chamado
  "Clínica Demonstração" (`demo-clinica`), com 4 meses de campanhas e pacientes, para
  mostrar o painel funcionando antes de conectar uma clínica real. Os números são
  inventados e batem com o modo `?demo`. Veja abaixo como ele se comporta.
- **Este guia.**

### Sobre o cliente de demonstração

- **Como colocar ou renovar.** No Supabase, abra o projeto `nexus-ads` →
  **SQL Editor** → **New query**, cole o conteúdo inteiro de `supabase/seed-demo.sql`
  e clique em **Run**. No fim aparecem as contagens (1035, 685 e 358). Pode rodar de
  novo quando quiser: ele apaga e recria só os números, pacientes, alertas e
  relatórios desse cliente. As contas com acesso a ele continuam.
- **As datas acompanham o dia em que você roda.** O último dia com números é sempre
  "ontem" daquele dia. Depois disso os dados ficam parados: a cada dia o painel tem um
  dia a mais sem números no fim. Para mostrar a alguém, rode o arquivo de novo antes.
- **Ele entra ativo, como uma clínica de verdade.** Por isso o servidor também roda o
  radar e o relatório diário dele. Como ele não tem **WhatsApp do gestor**, nada é
  enviado; na lista de execuções em Ajustes o relatório dele aparece com
  "nenhum número de destino cadastrado" (e, se houver chave da IA, gasta uma leitura
  por dia). Isso para sozinho uma semana depois da última vez que você rodou o
  arquivo, quando os números dele ficam sem investimento recente.
- **Para tirar de circulação**, desative o cliente (`ativo`). Se o painel não tiver
  essa opção, peça ao Claude. Apagar de vez também é pelo Claude, porque os dados
  ligados a ele precisam sair junto.

## 14. O que só você pode fazer

Estas etapas exigem o seu login, a sua senha, códigos que chegam no seu celular ou a
aprovação de outra pessoa. Por isso ninguém pode fazer por você:

1. Criar a conta de gestor com o código de ativação (seção 2).
2. Cadastrar a clínica e as metas dela (seção 3).
3. Pedir acesso de parceiro à conta de anúncios da clínica, e conseguir que a clínica
   aprove (4.1).
4. Criar o app no Meta for Developers, o usuário do sistema e o token (4.2 e 4.3).
5. Criar a conta de gerente do Google, vincular a clínica e pedir o developer token.
   Depois, esperar a aprovação do Google (5.1 e 5.2).
6. Criar o projeto e o cliente OAuth no Google Cloud, publicar o app e rodar o script
   do refresh token no seu computador (5.3 e 5.4).
7. Ativar o WhatsApp no app, confirmar os números de destino e criar o modelo
   `nexus_relatorio` (seção 6).
8. Decidir, junto com a clínica, se o número dela entra na API, e confirmar a
   coexistência com o aplicativo antes (seção 7).
9. Copiar o app secret, a URL de retorno e o token de verificação para o webhook e deixar o app "Ao vivo"
   (7.3 a 7.5). O webhook vale também para o número da Nexus: é ele que confirma que
   os avisos chegaram (6.5).
10. Criar a chave da IA e colocar um cartão na Anthropic, se quiser a leitura por IA
    (seção 8).
11. Colocar um cartão na conta do WhatsApp, se for usar número próprio e modelos fora
    da janela (seção 11).
12. Aprovar as contas da recepção e ensinar a mover os cartões (seções 2 e 9).

---

## 15. Anexo: onde achar cada informação

| Campo no Nexus Ads | Onde achar |
|---|---|
| Token de acesso do Meta | Configurações do negócio → Usuários do sistema → Gerar novo token (4.3) |
| ID da conta de anúncios | Gerenciador de Anúncios, número depois de `act=` (4.4) |
| Developer token do Google | Google Ads, conta de gerente → Administrador → Central de API (5.2) |
| ID da conta da clínica (Google) | Topo do Google Ads, dentro da conta da clínica (5.1) |
| ID da conta de gerente (MCC) | Topo do Google Ads, dentro da conta de gerente (5.1) |
| Client ID e Client secret | Google Cloud → APIs e serviços → Credenciais (5.3) |
| Refresh token | Saída do script `scripts/google-refresh-token.mjs` (5.4) |
| Token do WhatsApp da Nexus | Usuário do sistema com permissões do WhatsApp (6.2) |
| ID do número da Nexus | App da Meta → WhatsApp → Configuração da API (6.1) |
| Modelo | `nexus_relatorio`, criado no Gerenciador do WhatsApp (6.3) |
| ID do número de WhatsApp da clínica | App da Meta → WhatsApp → Configuração da API, número da clínica (7.2) |
| URL de retorno e token de verificação do webhook | Mostrados no próprio Nexus Ads, em Ajustes → Configuração da Nexus → Webhook do WhatsApp (7.3) |
| App secret | App da Meta → Configurações do app → Básico → Chave secreta do app (7.4) |
| Chave da IA | console.anthropic.com → API Keys (seção 8) |
