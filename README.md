# remark

Protótipo navegável do marketplace de vagas de encaixe em exames de imagem: o horário que ia ficar vazio vira exame mais barato para quem estava esperando.

- **App do paciente** (`/paciente`): busca por tipo, região e lado; encaixes com o motivo da vaga e preço em degraus; horário normal com agenda da clínica; aviso de vaga; avisos antes de reservar; sinal de 20% por Pix ou cartão (simulado).
- **Painel da clínica** (`/clinica`): resumo do dia, publicar cancelamento (o agendamento vira vaga de encaixe), relógio da demo, agenda por sala com cadastro manual, conexão simulada com a Google Agenda (as demais integrações mostram «Esta feature está a caminho»), cadastro, edição e lista de exames.

O design de referência está em `docs/design/*.dc.html` (pranchas do canvas do Claude Design).

## Stack

- Next.js 16 (App Router) em `src/`. CSS do sistema de design em `src/app/vc.css`; fontes Bricolage Grotesque e Instrument Sans via `next/font`.
- Supabase (Postgres) como banco e backend. Esquema, regras e dados de demonstração em `supabase/migrations/`.

## Rodar

```bash
cp .env.example .env.local   # preencha SUPABASE_URL e SUPABASE_PUBLISHABLE_KEY
npm install
npm run dev -- --port 3200   # a 3100 desta máquina está ocupada por outro projeto
```

### WhatsApp (Evolution API)

```bash
npm run whatsapp:up     # sobe Evolution API 2.3.1 + Postgres + Redis (lê EVOLUTION_* do .env.local)
npm run whatsapp:logs   # acompanha a Evolution
npm run whatsapp:down
```

Depois, em **Clínica › perfil › Editar informações › Confirmação pelo WhatsApp**, gere o QR code e leia no WhatsApp do número da clínica (Aparelhos conectados). O painel da Evolution fica em `http://localhost:8080/manager`. As respostas chegam em `POST /api/whatsapp/webhook?token=$EVOLUTION_WEBHOOK_TOKEN`, que a Evolution chama por `host.docker.internal:3200`. Sem a Evolution ou sem número pareado, tudo funciona igual no simulador `/paciente/whatsapp`.

## Como os dados funcionam

- **Leitura:** o servidor do Next lê as tabelas e a view `vacancies_live` com a chave publicável (políticas de RLS só de leitura). A chave não vai para o navegador.
- **Gravação:** só pelas funções do banco (`reserve_vacancy`, `reserve_normal`, `publish_cancellation`, `create_calendar_event`, `upsert_clinic_exam`…). É nelas que ficam as regras: a escada de preço (cheio acima de 48 h; −10% até 24 h; −20% até 6 h; −30% depois; nunca abaixo do piso), a trava da vaga e o horário ocupado.
- **Exames substitutos:** no cadastro do exame, a clínica marca quais exames da mesma sala podem ocupar o horário quando ele for cancelado (`clinic_exam_substitutes`). A view `vacancy_offers` oferece cada vaga para o exame dela e para os substitutos, cada um pelo próprio preço, e a reserva grava o exame escolhido.
- **Catálogo de exames:** `src/lib/catalog.ts` é a fonte única da árvore tipo → região → lado, usada pela busca do paciente e pelo cadastro da clínica. Segue o «Catálogo de exames» de 08/11/2026: não acrescente regiões só porque outros serviços têm.
- **Lado × abrangência:** o paciente responde conforme o pedido (direito, esquerdo, ambos ou «não sei / conferir pedido»); a clínica oferta um lado (`unilateral`) ou os dois (`bilateral`, com preço e duração próprios). «Ambos» busca só ofertas bilaterais. A reserva guarda o lado pedido (`reservations.side`), e o resumo aparece na busca, no pagamento e na confirmação.
- **Confirmação pelo WhatsApp:** a clínica define no perfil quando a mensagem sai (`clinics.confirm_send_hours`, padrão 48 h antes) e até quando o paciente responde (`confirm_deadline_hours`, padrão 24 h antes). O ciclo `runConfirmationTick` (`src/lib/whatsapp/flow.ts`) roda depois de cada reserva, a cada avanço do relógio e a cada minuto com o painel da clínica aberto (`POST /api/whatsapp/tick`): envia as que venceram (`claim_confirmations`) e cancela as sem resposta (`expire_confirmations`). Resposta 1 confirma; 2 cancela. Cancelou ou não respondeu: a reserva cai, o sinal é devolvido e o horário vira encaixe para a fila (`release_reservation`). Reservas feitas depois do prazo não recebem a confirmação. Todo o diálogo fica em `whatsapp_messages`.
- **Relógio da demo:** `demo_settings.offset_hours` adianta o «agora» de todo o sistema. «Restaurar dados da demo» recria os dados em relação ao dia de hoje.

## Limites do protótipo

- Login simulado: `/paciente/entrar` e `/clinica/entrar` vêm preenchidos e qualquer e-mail e senha entram; o `src/proxy.ts` manda quem não entrou para a tela de login e volta depois. O paciente é o cadastrado no navegador (cookie) ou a Marina da demo; a clínica é a Imagem Vila Nova.
- As funções de gravação podem ser chamadas por qualquer um que tenha a chave publicável. Antes de qualquer uso real, troque por autenticação e políticas por usuário.
- Pagamento e integrações de agenda são simulados. O WhatsApp é real quando há número pareado na Evolution API; o resto das notificações é simulado.
- O paciente do WhatsApp é achado pelos 8 últimos dígitos do celular cadastrado. Em produção, use o número completo e confirme o número no cadastro.
- A Evolution usa a API não oficial do WhatsApp Web (Baileys): serve para a demo, mas em produção o caminho é a WhatsApp Cloud API da Meta, com modelos de mensagem aprovados.
