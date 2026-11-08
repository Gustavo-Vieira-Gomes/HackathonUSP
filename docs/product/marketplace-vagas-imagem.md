# Marketplace de vagas em exames de imagem — Spec BDD

Fonte de verdade das regras de negócio do produto. Toda regra tem um ID (`RN-xx`) e todo comportamento tem cenários no formato Dado / Quando / Então. Código, cards e testes devem citar o ID da regra que implementam. Histórico das decisões: `.specs/features/marketplace-vagas-imagem/brainstorm.md`.

Versão: 1.0 · 07/11/2026 · Hackathon Capim (tema: acesso à saúde)

## 1. Resultado e escopo

**Problema.** Quem não tem plano de saúde espera meses na fila do SUS por um exame de imagem ou paga o preço cheio no particular. Ao mesmo tempo, clínicas de imagem perdem receita com horários cancelados, não confirmados ou vazios: o equipamento e a equipe já estão pagos, e o horário que passa vazio está perdido.

**Solução.** Um marketplace de vagas: a clínica publica o horário que sobrou com desconto, o paciente que se inscreveu para aquele exame é avisado e reserva pagando um sinal. A plataforma também permite reserva comum, em data futura e preço cheio.

**Fluxo demonstrável (demo de 3 minutos).** Uma vaga de ressonância para amanhã é cancelada na Google Agenda da clínica → a plataforma publica a vaga de encaixe → o paciente inscrito recebe o alerta no celular → aceita, responde ao questionário de preparo e paga o sinal (simulado) → a vaga aparece como reservada para a clínica. Em paralelo, um controle de tempo mostra o preço de outra vaga caindo em degraus.

**Deu certo se:** na demo, uma vaga publicada vira reserva paga em menos de 3 minutos.

**Fora de escopo nesta versão.** Laudo, resultado e diagnóstico; exames com contraste, sedação ou procedimento invasivo; raio-X simples; opções gratuitas e fila do SUS; WhatsApp pela API oficial da Meta (piloto usa API não oficial); pagamento real (simulado); integração com sistemas de agenda além da Google Agenda; painel de receita da clínica (opcional, se sobrar tempo); app nativo.

## 2. Glossário

| Termo | Definição |
| --- | --- |
| Clínica | Unidade de diagnóstico por imagem cadastrada na plataforma. |
| Paciente | Pessoa cadastrada que reserva exames ou se inscreve na lista de encaixe. |
| Exame | Procedimento oferecido pela clínica, identificado por código TUSS, com preço cheio, piso, antecedência mínima e preparo. |
| Horário | Intervalo na agenda da clínica em que um exame pode ser feito. |
| Reserva comum | Reserva de um horário livre em data futura, a preço cheio. |
| Vaga de encaixe | Horário oferecido com desconto, originado de cancelamento, no-show ou agenda vazia. |
| Inscrição | Pedido do paciente para ser avisado de vagas de encaixe de um exame, com região, preço máximo e janelas de disponibilidade. |
| Janela de disponibilidade | Dias e horários em que o paciente declara poder comparecer. |
| Onda | Grupo de pacientes alertados ao mesmo tempo sobre uma vaga. |
| Sinal | Valor pago pelo paciente para travar uma vaga de encaixe. |
| Preparo | Condição exigida pelo exame (jejum, bexiga cheia) e quantas horas antes começa. |
| Contraindicação | Condição que impede o exame (marca-passo em RM, gravidez em TC). |
| X | Tolerância de atraso do paciente antes de o horário virar no-show (padrão 15 min). |
| Y | Tempo máximo de deslocamento para quem aceita uma vaga de no-show (padrão 45 min). |
| Z | Tempo que uma onda tem para alguém pagar o sinal antes da próxima (padrão 10 min). |

## 3. Regras de negócio

### Clínica e exames

- **RN-01** Uma clínica tem nome, endereço, geolocalização, CNES e um responsável técnico identificado. Todos aparecem na oferta ao paciente.
- **RN-02** Cada exame da clínica tem: código TUSS, nome, preço cheio, preço piso, antecedência mínima para encaixe, preparo (condição e horas antes), lista de contraindicações, X e Y. Piso ≤ preço cheio; X e Y em minutos, maiores que zero.
- **RN-03** Exames permitidos: ultrassonografia, ecocardiograma, mamografia, tomografia sem contraste e ressonância sem contraste. Outros códigos são recusados no cadastro.
- **RN-04** A clínica só vê e altera os próprios exames, horários, vagas e reservas.

### Google Agenda

- **RN-05** A agenda da clínica é a Google Agenda conectada por OAuth. A plataforma lê a agenda pelo menos a cada minuto.
- **RN-06** Toda reserva feita pela plataforma cria um evento na agenda da clínica com título padronizado `[<TUSS>] <nome do paciente>` e a descrição com o identificador da reserva. A plataforma só reconhece eventos criados por ela.
- **RN-07** Horário livre na agenda, dentro do expediente configurado, é oferta da reserva comum.
- **RN-08** Evento da plataforma apagado ou movido na agenda gera uma vaga de encaixe no horário original e cancela a reserva ligada a ele (ver RN-30).
- **RN-09** Se a Google Agenda estiver indisponível ou o token expirado, a plataforma avisa a clínica, suspende a sincronização e não cria, cancela ou publica nada com base em dado desatualizado. Nenhuma operação é registrada como sucesso sem confirmação da agenda.
- **RN-10** Eventos criados à mão fora do padrão são ignorados pela sincronização.

### Paciente

- **RN-11** O paciente se cadastra com nome, e-mail, telefone e senha, e aceita um termo de consentimento LGPD específico para dado de saúde antes de qualquer reserva ou inscrição.
- **RN-12** O paciente só vê e altera as próprias reservas e inscrições.
- **RN-13** Dados de reservas e inscrições são apagados 30 dias após o exame ou a expiração.

### Reserva comum

- **RN-14** Reserva comum ocupa um horário livre da agenda a preço cheio, com pagamento por Pix, cartão ou no local.
- **RN-15** O paciente pode cancelar reserva comum sem custo até 24 h antes do horário. Depois disso, o cancelamento é registrado como falta para fins de métrica.
- **RN-16** Um paciente não pode ter, para o mesmo exame, uma reserva comum e uma reserva de encaixe ao mesmo tempo. Ao confirmar uma, a outra é cancelada e o paciente é avisado.

### Inscrição na lista de encaixe

- **RN-17** A inscrição tem: exame, região (raio a partir de um endereço ou da localização), preço máximo, janelas de disponibilidade (dias da semana e faixas de hora) e, opcionalmente, "posso ir hoje" com localização atual.
- **RN-18** A foto do pedido médico é atalho opcional: a IA sugere o exame a partir da foto e o paciente confirma. Sem foto, o paciente escolhe o exame numa lista. A IA não decide nada sozinha.
- **RN-19** Se já existir vaga de encaixe compatível no momento da inscrição, o paciente é levado direto ao aceite (RN-37), sem esperar alerta.
- **RN-20** A inscrição expira em 30 dias e pode ser renovada pelo paciente.
- **RN-21** O paciente nunca é notificado fora das suas janelas de disponibilidade, nem de vagas cujo horário caia fora delas.

### Vagas de encaixe

- **RN-22** Uma vaga de encaixe nasce de três origens: (a) cancelamento de evento da plataforma na agenda; (b) no-show declarado pela clínica; (c) horário vazio publicado pela clínica.
- **RN-23** Vaga de encaixe só é publicada se o tempo até o horário for maior que a antecedência mínima do exame e maior que o preparo exigido. Exceção: no-show segue RN-32.
- **RN-24** Uma vaga tem estados: `publicada` → `alertando` → `reservada` → `realizada` | `expirada` | `cancelada`. Transições fora dessa ordem são recusadas.
- **RN-25** Vaga sem reserva expira no horário do exame e volta a ser apenas um horário passado; nada é cobrado de ninguém.

### Preço

- **RN-26** O preço da vaga de encaixe começa no preço cheio com o primeiro degrau e cai em degraus conforme o horário se aproxima, até o piso. Padrão: −10% quando faltam 48 h, −20% quando faltam 24 h, −30% quando faltam 6 h. A clínica edita os degraus; nenhum degrau pode ficar abaixo do piso.
- **RN-27** O preço nunca sobe e é o mesmo para todos os pacientes no mesmo instante. O preço exibido no alerta é o preço do momento do alerta; o cobrado é o preço do momento do pagamento do sinal, nunca maior que o exibido.
- **RN-28** Vagas com desconto por clínica são limitadas a um teto diário configurável (padrão: 5 por dia), para reduzir canibalização do preço cheio.

### No-show

- **RN-29** A clínica declara no-show quando o paciente não chegou X minutos após o horário. A declaração retém o sinal (se houver) e registra a falta.
- **RN-30** Um no-show gera uma vaga imediata, oferecida só a pacientes com inscrição compatível, com "posso ir hoje" ativo, cujo horário atual esteja dentro da janela de disponibilidade e cujo tempo de chegada estimado seja ≤ Y.
- **RN-31** Alertas de no-show são ordenados por tempo de chegada estimado, não por ordem de inscrição.
- **RN-32** Vaga de no-show só é publicada se Y for menor ou igual ao intervalo livre até o próximo evento da agenda, e só para exames sem preparo ou para pacientes que declararem "já estou preparado" no aceite.
- **RN-33** Quem aceita um no-show tem Y minutos para chegar. Não chegando, o sinal é retido e a vaga volta para a próxima pessoa da ordem, se ainda couber no intervalo.

### Alertas

- **RN-34** Alertas saem em ondas de tamanho configurável (padrão: 5 pacientes), na ordem de inscrição (ou de chegada, no no-show). Se ninguém pagar o sinal em Z minutos, a próxima onda recebe. Esgotadas as inscrições compatíveis, a vaga continua `publicada` até expirar.
- **RN-35** Canais: push web, e-mail e WhatsApp (neste piloto via API não oficial, Evolution ou WAHA; a tela que imita a conversa é o fallback). Todos os canais recebem a mesma mensagem do mesmo núcleo de regras. O alerta carrega: clínica, exame, horário, preço atual, distância e preparo.
- **RN-36** Um paciente recebe no máximo um alerta por vaga. Vaga reservada por outro cancela os alertas pendentes dela.

### Aceite, contraindicação e sinal

- **RN-37** Ao aceitar, o paciente responde a um questionário de lista fechada por exame: contraindicações e confirmação do preparo. Qualquer contraindicação marcada bloqueia a reserva com a orientação de procurar a clínica. Não há interpretação de texto livre.
- **RN-38** O paciente declara ter pedido médico para o exame. A clínica confere o pedido na chegada; a plataforma não valida o pedido.
- **RN-39** Em vaga de encaixe e de no-show, o sinal é obrigatório, por Pix ou cartão. Pagamento no local só existe na reserva comum.
- **RN-40** O valor do sinal é um percentual do preço do momento, configurável por clínica (padrão: 20%), e vai para a conta da clínica. O restante é pago na clínica.
- **RN-41** A reserva da vaga ocorre numa única transação: a primeira confirmação de pagamento trava a vaga; qualquer outra tentativa recebe "vaga acabou de ser preenchida" e nada é cobrado.
- **RN-42** Pagamento do sinal não confirmado em Z minutos libera a vaga para a próxima onda.
- **RN-43** Regra do sinal, exibida antes do pagamento: devolvido integralmente se a clínica cancelar; retido se o paciente faltar ou cancelar.

### Confirmação, comparecimento e cobrança

- **RN-44** A confirmação da reserva traz: clínica, endereço, horário, exame, preparo, documentos a levar, valor pago e valor restante, regra do sinal.
- **RN-45** A clínica marca a reserva como `realizada` ou declara no-show. Apenas reservas `realizadas` geram cobrança.
- **RN-46** A plataforma cobra da clínica uma taxa fixa por reserva realizada (valor configurado por contrato; na demo, R$ 15). Não há percentual sobre o procedimento nem mensalidade do paciente. Quando o pagamento é pelo app, a taxa é descontada no repasse; quando é no local, a taxa é cobrada da clínica depois.
- **RN-47** Parcelamento via Capim é oferecido no pagamento pelo app quando o valor restante for maior que um limite configurável; a Capim assume o risco de crédito.

### Cancelamento

- **RN-48** Clínica cancela uma reserva: paciente é avisado, sinal devolvido integralmente, horário vira vaga de encaixe se ainda couber (RN-23).
- **RN-49** Paciente cancela reserva de encaixe: sinal retido, vaga volta a `publicada` se ainda couber, alertas recomeçam.

### Observabilidade e métricas

- **RN-50** Toda transição de vaga e de reserva é registrada com data, hora, origem (agenda, clínica, paciente, motor) e motivo.
- **RN-51** Métricas calculadas a partir do registro: taxa de preenchimento (vagas publicadas que viraram `realizada`), tempo até a reserva, comparecimento do encaixe, receita recuperada por clínica, vagas por origem, economia média do paciente.

## 4. Funcionalidades e cenários

### F1 — Cadastro e login do paciente (RN-11, RN-12)

```gherkin
Funcionalidade: Cadastro e login do paciente

  Cenário: Cadastro com consentimento
    Dado que não tenho conta
    Quando informo nome, e-mail, telefone e senha
    E aceito o termo de consentimento para dado de saúde
    Então minha conta é criada e entro na plataforma

  Cenário: Cadastro sem consentimento
    Quando informo os dados mas não aceito o termo
    Então a conta não é criada e vejo que o consentimento é obrigatório

  Cenário: Acesso a reserva de outro paciente
    Dado que estou logado como Maria
    Quando acesso a página da reserva de João pela URL
    Então recebo "não encontrado" e nada da reserva é exibido
```

### F2 — Cadastro da clínica e dos exames (RN-01 a RN-04)

```gherkin
Funcionalidade: Cadastro da clínica e dos exames

  Cenário: Cadastro de exame válido
    Dado que sou gestor da Clínica Imagem Leste
    Quando cadastro "RM de joelho" com TUSS, preço cheio R$ 720, piso R$ 500,
      antecedência mínima 6 h, preparo "nenhum", contraindicação "marca-passo",
      X = 15 min e Y = 45 min
    Então o exame fica disponível para reserva comum e encaixe

  Cenário: Piso maior que o preço cheio
    Quando cadastro um exame com piso R$ 800 e preço cheio R$ 720
    Então o cadastro é recusado com a mensagem "piso deve ser menor ou igual ao preço cheio"

  Cenário: Exame fora do escopo
    Quando cadastro um exame de raio-X simples ou tomografia com contraste
    Então o cadastro é recusado e vejo a lista de exames aceitos

  Cenário: Isolamento entre clínicas
    Dado que estou logado pela Clínica A
    Quando tento abrir uma vaga da Clínica B
    Então recebo "não encontrado"
```

### F3 — Conexão com a Google Agenda (RN-05 a RN-10)

```gherkin
Funcionalidade: Sincronização com a Google Agenda

  Cenário: Conectar a agenda
    Dado que sou gestor da clínica
    Quando autorizo a plataforma na minha conta Google
    Então a agenda escolhida passa a ser lida a cada minuto
    E os horários livres do expediente aparecem como oferta de reserva comum

  Cenário: Reserva cria evento
    Dado que Maria reservou RM de joelho para 12/11 às 14h
    Quando a reserva é confirmada
    Então existe na agenda um evento "[<TUSS>] Maria S." às 14h com o id da reserva

  Cenário: Evento apagado gera vaga de encaixe
    Dado que o evento da reserva de Maria para 12/11 às 14h existe na agenda
    E faltam mais de 6 h para o horário
    Quando a recepção apaga o evento na Google Agenda
    Então em até 1 minuto a reserva de Maria fica cancelada, Maria é avisada
    E uma vaga de encaixe é publicada para 12/11 às 14h

  Cenário: Evento apagado perto demais do horário
    Dado que faltam 2 h para o exame e a antecedência mínima é 6 h
    Quando o evento é apagado
    Então a reserva é cancelada, mas nenhuma vaga de encaixe é publicada

  Cenário: Evento manual fora do padrão
    Quando a recepção cria à mão um evento "Reunião" na agenda
    Então a plataforma ignora o evento e nenhuma vaga ou reserva muda

  Cenário: Token expirado
    Dado que a autorização Google expirou
    Quando o sincronizador roda
    Então a clínica vê o aviso "agenda desconectada, reautorize"
    E nenhuma vaga é publicada, cancelada ou reservada com base na agenda até a reautorização
```

### F4 — Reserva comum (RN-14 a RN-16)

```gherkin
Funcionalidade: Reserva comum

  Cenário: Reservar horário livre
    Dado que a Clínica Imagem Leste tem RM de joelho livre em 20/11 às 9h
    Quando escolho esse horário e pago por Pix
    Então a reserva fica confirmada a R$ 720
    E o evento é criado na agenda da clínica

  Cenário: Pagamento no local
    Quando escolho "pagar na clínica"
    Então a reserva fica confirmada sem cobrança, com o aviso de pagamento no local

  Cenário: Cancelar com mais de 24 h
    Dado que tenho reserva comum para 20/11 às 9h
    Quando cancelo em 18/11
    Então a reserva é cancelada sem custo e o horário volta a ficar livre na agenda

  Cenário: Cancelar com menos de 24 h
    Quando cancelo em 20/11 às 8h
    Então a reserva é cancelada e registrada como falta

  Cenário: Reserva comum e encaixe do mesmo exame
    Dado que tenho reserva comum de RM de joelho para 20/11
    Quando pago o sinal de uma vaga de encaixe de RM de joelho para 12/11
    Então a reserva comum de 20/11 é cancelada sem custo e sou avisado
```

### F5 — Inscrição na lista de encaixe (RN-17 a RN-21)

```gherkin
Funcionalidade: Inscrição na lista de encaixe

  Cenário: Inscrição completa
    Quando me inscrevo para "RM de joelho", raio 10 km do meu CEP, preço máximo R$ 550,
      disponível seg a sex das 18h às 21h e sáb das 8h às 13h
    Então fico na lista e vejo quantas clínicas oferecem o exame na região

  Cenário: Foto do pedido como atalho
    Quando envio a foto do pedido médico
    Então a IA sugere "RM de joelho" e eu confirmo ou corrijo antes de continuar

  Cenário: Foto ilegível
    Quando a IA não identifica o exame na foto
    Então escolho o exame na lista, sem bloqueio

  Cenário: Vaga já existe ao inscrever
    Dado que existe vaga de encaixe de RM de joelho a R$ 540, a 6 km, sáb 10h
    Quando concluo a inscrição acima
    Então sou levado direto ao aceite dessa vaga

  Cenário: Lista vazia
    Dado que não existe vaga compatível
    Então vejo "nenhuma vaga agora", quantas clínicas oferecem o exame
    E o botão para fazer uma reserva comum

  Cenário: Expiração e renovação
    Dado que minha inscrição foi feita há 30 dias
    Então ela expira e recebo um e-mail com o botão "renovar por mais 30 dias"
```

### F6 — Vagas de encaixe por cancelamento e agenda vazia (RN-22 a RN-25)

```gherkin
Funcionalidade: Publicação de vaga de encaixe

  Cenário: Publicar horário vazio
    Dado que sou da recepção
    Quando publico "RM de joelho, 12/11 às 21h, motivo: horário vazio"
    Então a vaga nasce "publicada" com o preço do degrau atual

  Cenário: Antecedência menor que o preparo
    Dado que USG de abdome exige jejum de 8 h
    Quando a recepção tenta publicar uma vaga para daqui a 3 h
    Então a publicação é recusada com "antecedência menor que o preparo"

  Cenário: Teto diário de vagas com desconto
    Dado que a clínica já publicou 5 vagas com desconto hoje
    Quando tenta publicar a sexta
    Então a publicação é recusada e o teto é informado

  Cenário: Vaga expira
    Dado que uma vaga publicada chegou ao seu horário sem reserva
    Então ela passa a "expirada" e ninguém é cobrado

  Cenário: Transição inválida
    Quando o sistema tenta marcar como "realizada" uma vaga "publicada"
    Então a transição é recusada
```

### F7 — No-show (RN-29 a RN-33)

```gherkin
Funcionalidade: Vaga imediata por no-show

  Contexto:
    Dado que RM de joelho na Clínica Imagem Leste tem X = 15 min e Y = 45 min
    E o próximo evento na agenda está a 60 min do horário

  Cenário: Declarar no-show
    Dado que a reserva de João era às 14h e são 14h16
    Quando a recepção declara no-show
    Então o sinal de João é retido, a falta é registrada
    E uma vaga imediata é publicada

  Cenário: Quem recebe o alerta
    Dado que Ana tem inscrição compatível, "posso ir hoje" ativo, está a 20 min
      e sua janela de hoje cobre 14h
    E Beto tem inscrição compatível mas está a 70 min
    E Carla está a 10 min, mas sua janela de hoje termina às 12h
    Quando a vaga imediata é publicada
    Então só Ana recebe o alerta

  Cenário: Y maior que o intervalo livre
    Dado que o próximo evento na agenda está a 30 min do horário
    Quando a recepção declara no-show
    Então a falta é registrada, mas nenhuma vaga imediata é publicada

  Cenário: Exame com preparo
    Dado que a vaga imediata é de USG de abdome (jejum)
    Quando Ana aceita
    Então precisa declarar "já estou em jejum" para concluir

  Cenário: Aceitou e não chegou
    Dado que Ana aceitou às 14h20 e Y = 45 min
    Quando são 15h06 e a clínica não marcou chegada
    Então o sinal de Ana é retido e a vaga volta para a próxima pessoa da ordem,
      se ainda couber no intervalo
```

### F8 — Motor de preço (RN-26 a RN-28)

```gherkin
Funcionalidade: Preço decrescente

  Contexto:
    Dado que RM de joelho custa R$ 720 com piso R$ 500
    E os degraus são −10% a 48 h, −20% a 24 h, −30% a 6 h

  Cenário: Preço por degrau
    Quando faltam 30 h para a vaga
    Então o preço é R$ 576
    Quando faltam 5 h
    Então o preço é R$ 504

  Cenário: Piso
    Dado que o piso é R$ 600
    Quando faltam 5 h
    Então o preço é R$ 600, não R$ 504

  Cenário: Preço nunca sobe
    Dado que a vaga mostrou R$ 576 no alerta
    Quando o paciente paga 10 min depois e o degrau mudou para R$ 504
    Então cobra-se R$ 504
    E em nenhuma hipótese um valor maior que R$ 576

  Cenário: Degrau abaixo do piso no cadastro
    Quando a clínica configura −40% com piso R$ 500 e preço R$ 720
    Então a configuração é aceita, mas o preço efetivo nunca fica abaixo de R$ 500
```

### F9 — Alertas em ondas (RN-34 a RN-36)

```gherkin
Funcionalidade: Alertas em ondas

  Cenário: Primeira onda
    Dado que 12 pacientes têm inscrição compatível com a vaga
    E a onda tem 5 pacientes e Z = 10 min
    Quando a vaga é publicada
    Então os 5 primeiros por ordem de inscrição recebem push e e-mail

  Cenário: Próxima onda
    Dado que ninguém pagou o sinal em 10 min
    Então os 5 seguintes recebem o alerta

  Cenário: Inscrições esgotadas
    Dado que todas as ondas passaram sem reserva
    Então a vaga continua "publicada" até expirar e aparece na busca

  Cenário: Fora da janela
    Dado que a vaga é sáb às 10h e minha janela de sábado é 14h–18h
    Então não recebo alerta dessa vaga

  Cenário: Vaga preenchida cancela alertas
    Dado que recebi o alerta e outro paciente pagou antes
    Quando abro o alerta
    Então vejo "vaga preenchida" e a opção de continuar na lista
```

### F10 — Aceite, contraindicação e sinal (RN-37 a RN-43)

```gherkin
Funcionalidade: Aceite e sinal

  Cenário: Aceite sem contraindicação
    Dado que abri o alerta de RM de joelho a R$ 540
    Quando respondo "não" para marca-passo e "sim" para tenho pedido médico
    E pago o sinal de R$ 108 por Pix
    Então a vaga fica "reservada" em meu nome
    E recebo a confirmação com endereço, documentos e regra do sinal

  Cenário: Contraindicação marcada
    Quando respondo "sim" para marca-passo
    Então a reserva é bloqueada e vejo "procure a clínica antes de agendar"

  Cenário: Dois pacientes pagam ao mesmo tempo
    Dado que Ana e Beto confirmam o pagamento no mesmo segundo
    Então só um fica com a vaga
    E o outro vê "vaga acabou de ser preenchida" e não é cobrado

  Cenário: Sinal não confirmado
    Dado que iniciei o pagamento e não concluí em Z minutos
    Então minha tentativa expira e a vaga segue para a próxima onda

  Cenário: Pagamento no local em encaixe
    Quando tento escolher "pagar na clínica" numa vaga de encaixe
    Então a opção não existe; só Pix ou cartão
```

### F11 — Comparecimento e cobrança (RN-44 a RN-47)

```gherkin
Funcionalidade: Comparecimento e cobrança da clínica

  Cenário: Exame realizado
    Dado que Ana compareceu e apresentou o pedido
    Quando a clínica marca a reserva como "realizada"
    Então a plataforma registra uma taxa fixa de R$ 15 contra a clínica

  Cenário: Pagamento pelo app
    Dado que Ana pagou o restante pelo app
    Então a taxa é descontada do repasse à clínica

  Cenário: Pagamento no local
    Dado que Ana pagou o restante na clínica
    Então a taxa entra na fatura posterior da clínica

  Cenário: Sem comparecimento, sem taxa
    Dado que a reserva virou no-show ou foi cancelada
    Então nenhuma taxa é cobrada
```

### F12 — Cancelamentos (RN-48, RN-49)

```gherkin
Funcionalidade: Cancelamento de reserva de encaixe

  Cenário: Clínica cancela
    Dado que Ana tem reserva de encaixe com sinal pago
    Quando a clínica cancela
    Então Ana é avisada, o sinal é devolvido integralmente
    E o horário vira vaga de encaixe se ainda couber

  Cenário: Paciente cancela
    Quando Ana cancela a reserva de encaixe
    Então o sinal é retido, a vaga volta a "publicada" e os alertas recomeçam
```

### F13 — Notificações (RN-35)

```gherkin
Funcionalidade: Canais de notificação

  Cenário: Push e e-mail
    Dado que autorizei notificações no navegador
    Quando uma vaga compatível é publicada
    Então recebo push e e-mail com clínica, exame, horário, preço, distância e preparo

  Cenário: Sem permissão de push
    Dado que não autorizei notificações
    Então recebo só o e-mail, e a tela da lista mostra a vaga em tempo real se estiver aberta

  Cenário: WhatsApp
    Quando uma vaga compatível é publicada
    Então recebo a mesma mensagem no WhatsApp pelo número da plataforma

  Cenário: WhatsApp indisponível
    Dado que a API do WhatsApp está fora ou o número foi desconectado
    Então push e e-mail seguem normalmente e a falha fica registrada;
    no palco, a tela que imita a conversa mostra a mensagem
```

### F14 — Observabilidade e métricas (RN-50, RN-51)

```gherkin
Funcionalidade: Registro e métricas

  Cenário: Linha do tempo da vaga
    Dado que uma vaga foi publicada, alertada em 2 ondas, reservada e realizada
    Então o registro mostra cada transição com hora, origem e motivo

  Cenário: Taxa de preenchimento
    Dado que a clínica publicou 10 vagas no mês e 6 viraram "realizada"
    Então o painel (ou relatório) mostra 60%
```

## 5. Dependências externas

| Dependência | Uso | Falha | Na demo |
| --- | --- | --- | --- |
| Google Calendar API | Agenda da clínica | RN-09: avisa e suspende | Real, 2 clínicas |
| Provedor de IA (leitura da foto) | RN-18 | Cai para a lista de exames | Real |
| Web Push | Alertas | Cai para e-mail e tempo real na tela | Real |
| E-mail | Alertas, confirmações | Log e retentativa limitada | Real |
| Pix / cartão | Sinal e pagamento | Tentativa expira (RN-42) | Simulado |
| WhatsApp (Evolution/WAHA) | Alertas | Cai para push e e-mail; tela simulada no palco | Real, número do time |
| Capim (parcelamento) | RN-47 | Opção não aparece | Simulado |

## 6. Premissas e riscos aceitos

- Taxa fixa por reserva realizada (RN-46) foi mantida pelo time mesmo com o art. 58 do Código de Ética Médica apontado como risco; validar com mentores antes de qualquer cobrança real.
- Questionários de contraindicação e preparo por exame (RN-37) precisam de conferência por mentor médico antes do go-live; não bloqueiam a demo.
- Demo: 2 clínicas com Google Agenda real e 8 pré-carregadas; pagamentos simulados; sem dado real de paciente.
- Padrões X = 15, Y = 45, Z = 10 min e degraus de preço são valores iniciais editáveis pela clínica.
- Núcleo de regras independente do canal: web hoje, WhatsApp e app nativo depois sem reescrever regras.
