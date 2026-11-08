-- HACK-13 continuação: amarra o horário da reserva ao da vaga e o exame do horário
-- à clínica do horário, e dá updatedAt ao alerta. Só restrições novas: nenhuma
-- tabela ou coluna existente perde dado.

-- Alvos das FKs compostas. O id já é único sozinho; o par existe para a FK poder
-- referenciar (id, slotId) e (id, clinicId).
CREATE UNIQUE INDEX "Vacancy_id_slotId_key" ON "Vacancy"("id", "slotId");
CREATE UNIQUE INDEX "Exam_id_clinicId_key" ON "Exam"("id", "clinicId");

-- RN-41: o encaixe/no-show precisa estar no mesmo horário da vaga. Sem isto, um
-- encaixe da vaga V (horário S1) gravado com slotId=S2 escapava do índice de horário
-- e S1 ficava com duas reservas ativas. MATCH SIMPLE (padrão): a reserva comum, com
-- vacancyId nulo, não é checada por esta FK.
ALTER TABLE "Reservation" DROP CONSTRAINT "Reservation_vacancyId_fkey";
ALTER TABLE "Reservation" ADD CONSTRAINT "Reservation_vacancyId_slotId_fkey" FOREIGN KEY ("vacancyId", "slotId") REFERENCES "Vacancy"("id", "slotId") ON DELETE RESTRICT ON UPDATE CASCADE;

-- O horário só aponta exame da própria clínica.
ALTER TABLE "Slot" DROP CONSTRAINT "Slot_examId_fkey";
ALTER TABLE "Slot" ADD CONSTRAINT "Slot_examId_clinicId_fkey" FOREIGN KEY ("examId", "clinicId") REFERENCES "Exam"("id", "clinicId") ON DELETE RESTRICT ON UPDATE CASCADE;

-- updatedAt do alerta: o DEFAULT preenche linhas que já existam e sai em seguida,
-- porque @updatedAt é gravado pelo Prisma client (sem default no banco).
ALTER TABLE "Alert" ADD COLUMN "updatedAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP;
ALTER TABLE "Alert" ALTER COLUMN "updatedAt" DROP DEFAULT;
