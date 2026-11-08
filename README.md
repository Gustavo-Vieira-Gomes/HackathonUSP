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

## Como os dados funcionam

- **Leitura:** o servidor do Next lê as tabelas e a view `vacancies_live` com a chave publicável (políticas de RLS só de leitura). A chave não vai para o navegador.
- **Gravação:** só pelas funções do banco (`reserve_vacancy`, `reserve_normal`, `publish_cancellation`, `create_calendar_event`, `upsert_clinic_exam`…). É nelas que ficam as regras: a escada de preço (cheio acima de 48 h; −10% até 24 h; −20% até 6 h; −30% depois; nunca abaixo do piso), a trava da vaga e o horário ocupado.
- **Exames substitutos:** no cadastro do exame, a clínica marca quais exames da mesma sala podem ocupar o horário quando ele for cancelado (`clinic_exam_substitutes`). A view `vacancy_offers` oferece cada vaga para o exame dela e para os substitutos, cada um pelo próprio preço, e a reserva grava o exame escolhido.
- **Catálogo de exames:** `src/lib/catalog.ts` é a fonte única da árvore tipo → região → lado, usada pela busca do paciente e pelo cadastro da clínica. Segue o «Catálogo de exames» de 08/11/2026: não acrescente regiões só porque outros serviços têm.
- **Lado × abrangência:** o paciente responde conforme o pedido (direito, esquerdo, ambos ou «não sei / conferir pedido»); a clínica oferta um lado (`unilateral`) ou os dois (`bilateral`, com preço e duração próprios). «Ambos» busca só ofertas bilaterais. A reserva guarda o lado pedido (`reservations.side`), e o resumo aparece na busca, no pagamento e na confirmação.
- **Relógio da demo:** `demo_settings.offset_hours` adianta o «agora» de todo o sistema. «Restaurar dados da demo» recria os dados em relação ao dia de hoje.

## Limites do protótipo

- Login simulado: `/paciente/entrar` e `/clinica/entrar` vêm preenchidos e qualquer e-mail e senha entram; o `src/proxy.ts` manda quem não entrou para a tela de login e volta depois. O paciente é o cadastrado no navegador (cookie) ou a Marina da demo; a clínica é a Imagem Vila Nova.
- As funções de gravação podem ser chamadas por qualquer um que tenha a chave publicável. Antes de qualquer uso real, troque por autenticação e políticas por usuário.
- Pagamento, notificações e integrações de agenda são simulados.
