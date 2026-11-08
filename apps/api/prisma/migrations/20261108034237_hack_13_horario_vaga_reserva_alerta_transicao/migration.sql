-- CreateEnum
CREATE TYPE "SlotOrigin" AS ENUM ('agenda', 'manual');

-- CreateEnum
CREATE TYPE "VacancyOrigin" AS ENUM ('cancelamento', 'no_show', 'vazio');

-- CreateEnum
CREATE TYPE "VacancyState" AS ENUM ('publicada', 'alertando', 'reservada', 'realizada', 'expirada', 'cancelada');

-- CreateEnum
CREATE TYPE "ReservationType" AS ENUM ('comum', 'encaixe', 'no_show');

-- CreateEnum
CREATE TYPE "ReservationState" AS ENUM ('aguardando_pagamento', 'confirmada', 'realizada', 'no_show', 'cancelada', 'expirada');

-- CreateEnum
CREATE TYPE "PaymentMethod" AS ENUM ('pix', 'cartao', 'no_local');

-- CreateEnum
CREATE TYPE "AlertChannel" AS ENUM ('push', 'email', 'whatsapp');

-- CreateEnum
CREATE TYPE "AlertResult" AS ENUM ('pendente', 'enviado', 'falhou', 'cancelado');

-- CreateEnum
CREATE TYPE "TransitionOrigin" AS ENUM ('agenda', 'clinica', 'paciente', 'motor');

-- DropIndex
DROP INDEX "PriceStep_examId_idx";

-- CreateTable
CREATE TABLE "Slot" (
    "id" UUID NOT NULL,
    "clinicId" UUID NOT NULL,
    "examId" UUID NOT NULL,
    "startsAt" TIMESTAMP(3) NOT NULL,
    "endsAt" TIMESTAMP(3) NOT NULL,
    "origin" "SlotOrigin" NOT NULL,
    "googleEventId" TEXT,
    "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "updatedAt" TIMESTAMP(3) NOT NULL,

    CONSTRAINT "Slot_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "Vacancy" (
    "id" UUID NOT NULL,
    "slotId" UUID NOT NULL,
    "origin" "VacancyOrigin" NOT NULL,
    "state" "VacancyState" NOT NULL DEFAULT 'publicada',
    "currentPriceCents" INTEGER NOT NULL,
    "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "updatedAt" TIMESTAMP(3) NOT NULL,

    CONSTRAINT "Vacancy_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "Reservation" (
    "id" UUID NOT NULL,
    "slotId" UUID NOT NULL,
    "vacancyId" UUID,
    "patientId" UUID NOT NULL,
    "type" "ReservationType" NOT NULL,
    "state" "ReservationState" NOT NULL DEFAULT 'aguardando_pagamento',
    "chargedPriceCents" INTEGER NOT NULL,
    "depositCents" INTEGER NOT NULL,
    "paymentMethod" "PaymentMethod" NOT NULL,
    "googleEventId" TEXT,
    "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "updatedAt" TIMESTAMP(3) NOT NULL,

    CONSTRAINT "Reservation_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "Alert" (
    "id" UUID NOT NULL,
    "vacancyId" UUID NOT NULL,
    "subscriptionId" UUID NOT NULL,
    "wave" INTEGER NOT NULL,
    "channel" "AlertChannel" NOT NULL,
    "sentAt" TIMESTAMP(3),
    "result" "AlertResult" NOT NULL DEFAULT 'pendente',
    "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,

    CONSTRAINT "Alert_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "Transition" (
    "id" UUID NOT NULL,
    "vacancyId" UUID,
    "reservationId" UUID,
    "fromState" TEXT,
    "toState" TEXT NOT NULL,
    "origin" "TransitionOrigin" NOT NULL,
    "reason" TEXT NOT NULL,
    "occurredAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,

    CONSTRAINT "Transition_pkey" PRIMARY KEY ("id")
);

-- CreateIndex
CREATE INDEX "Slot_clinicId_startsAt_idx" ON "Slot"("clinicId", "startsAt");

-- CreateIndex
CREATE INDEX "Slot_examId_idx" ON "Slot"("examId");

-- CreateIndex
CREATE UNIQUE INDEX "Vacancy_active_slot_key" ON "Vacancy"("slotId") WHERE (state = ANY (ARRAY['publicada'::"VacancyState", 'alertando'::"VacancyState", 'reservada'::"VacancyState"]));

-- CreateIndex
CREATE INDEX "Reservation_vacancyId_idx" ON "Reservation"("vacancyId");

-- CreateIndex
CREATE INDEX "Reservation_slotId_idx" ON "Reservation"("slotId");

-- CreateIndex
CREATE INDEX "Reservation_patientId_idx" ON "Reservation"("patientId");

-- CreateIndex
CREATE UNIQUE INDEX "Reservation_active_vacancy_key" ON "Reservation"("vacancyId") WHERE (state = ANY (ARRAY['confirmada'::"ReservationState", 'realizada'::"ReservationState"]));

-- CreateIndex
CREATE UNIQUE INDEX "Reservation_active_slot_key" ON "Reservation"("slotId") WHERE (state = ANY (ARRAY['confirmada'::"ReservationState", 'realizada'::"ReservationState"]));

-- CreateIndex
CREATE INDEX "Alert_subscriptionId_idx" ON "Alert"("subscriptionId");

-- CreateIndex
CREATE UNIQUE INDEX "Alert_vacancyId_subscriptionId_channel_key" ON "Alert"("vacancyId", "subscriptionId", "channel");

-- CreateIndex
CREATE INDEX "Transition_vacancyId_occurredAt_idx" ON "Transition"("vacancyId", "occurredAt");

-- CreateIndex
CREATE INDEX "Transition_reservationId_occurredAt_idx" ON "Transition"("reservationId", "occurredAt");

-- CreateIndex
CREATE UNIQUE INDEX "PriceStep_examId_leadMinutes_key" ON "PriceStep"("examId", "leadMinutes");

-- AddForeignKey
ALTER TABLE "Slot" ADD CONSTRAINT "Slot_clinicId_fkey" FOREIGN KEY ("clinicId") REFERENCES "Clinic"("id") ON DELETE RESTRICT ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "Slot" ADD CONSTRAINT "Slot_examId_fkey" FOREIGN KEY ("examId") REFERENCES "Exam"("id") ON DELETE RESTRICT ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "Vacancy" ADD CONSTRAINT "Vacancy_slotId_fkey" FOREIGN KEY ("slotId") REFERENCES "Slot"("id") ON DELETE RESTRICT ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "Reservation" ADD CONSTRAINT "Reservation_slotId_fkey" FOREIGN KEY ("slotId") REFERENCES "Slot"("id") ON DELETE RESTRICT ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "Reservation" ADD CONSTRAINT "Reservation_vacancyId_fkey" FOREIGN KEY ("vacancyId") REFERENCES "Vacancy"("id") ON DELETE RESTRICT ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "Reservation" ADD CONSTRAINT "Reservation_patientId_fkey" FOREIGN KEY ("patientId") REFERENCES "Patient"("id") ON DELETE RESTRICT ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "Alert" ADD CONSTRAINT "Alert_vacancyId_fkey" FOREIGN KEY ("vacancyId") REFERENCES "Vacancy"("id") ON DELETE RESTRICT ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "Alert" ADD CONSTRAINT "Alert_subscriptionId_fkey" FOREIGN KEY ("subscriptionId") REFERENCES "Subscription"("id") ON DELETE RESTRICT ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "Transition" ADD CONSTRAINT "Transition_vacancyId_fkey" FOREIGN KEY ("vacancyId") REFERENCES "Vacancy"("id") ON DELETE RESTRICT ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "Transition" ADD CONSTRAINT "Transition_reservationId_fkey" FOREIGN KEY ("reservationId") REFERENCES "Reservation"("id") ON DELETE RESTRICT ON UPDATE CASCADE;

-- Escrito à mão (portas 5 e 8 do plano da fatia 2): o Prisma não descreve CHECK no schema.
-- Forma da reserva (RN-39): comum sem vaga, encaixe e no-show com vaga; no_local só na comum.
ALTER TABLE "Reservation" ADD CONSTRAINT "Reservation_type_vacancy_check" CHECK (("type" = 'comum') = ("vacancyId" IS NULL));
ALTER TABLE "Reservation" ADD CONSTRAINT "Reservation_no_local_only_comum_check" CHECK ("paymentMethod" <> 'no_local' OR "type" = 'comum');
-- Transição com exatamente um alvo.
ALTER TABLE "Transition" ADD CONSTRAINT "Transition_single_target_check" CHECK (num_nonnulls("vacancyId", "reservationId") = 1);
-- Horário termina depois de começar.
ALTER TABLE "Slot" ADD CONSTRAINT "Slot_ends_after_start_check" CHECK ("endsAt" > "startsAt");

-- Faixas das colunas novas.
ALTER TABLE "Vacancy" ADD CONSTRAINT "Vacancy_current_price_nonnegative_check" CHECK ("currentPriceCents" >= 0);
ALTER TABLE "Reservation" ADD CONSTRAINT "Reservation_prices_nonnegative_check" CHECK ("chargedPriceCents" >= 0 AND "depositCents" >= 0);
ALTER TABLE "Alert" ADD CONSTRAINT "Alert_wave_positive_check" CHECK ("wave" > 0);

-- Faixas das tabelas da fatia 1 (settled pelo maestro, 08/11). Falha se houver linha fora da faixa.
ALTER TABLE "Clinic" ADD CONSTRAINT "Clinic_ranges_check" CHECK ("dailyDiscountCap" >= 0 AND "depositPercent" BETWEEN 0 AND 100 AND "waveSize" > 0 AND "waveWindowMinutes" > 0);
ALTER TABLE "ClinicOpeningHours" ADD CONSTRAINT "ClinicOpeningHours_ranges_check" CHECK ("weekday" BETWEEN 0 AND 6 AND 0 <= "startMinute" AND "startMinute" < "endMinute" AND "endMinute" <= 1440);
ALTER TABLE "Exam" ADD CONSTRAINT "Exam_ranges_check" CHECK ("fullPriceCents" >= 0 AND "floorPriceCents" >= 0 AND "minLeadMinutes" >= 0 AND "preparationHours" >= 0);
ALTER TABLE "PriceStep" ADD CONSTRAINT "PriceStep_ranges_check" CHECK ("leadMinutes" >= 0 AND "discountPercent" BETWEEN 0 AND 100);
ALTER TABLE "Subscription" ADD CONSTRAINT "Subscription_max_price_nonnegative_check" CHECK ("maxPriceCents" >= 0);
ALTER TABLE "SubscriptionWindow" ADD CONSTRAINT "SubscriptionWindow_ranges_check" CHECK ("weekday" BETWEEN 0 AND 6 AND 0 <= "startMinute" AND "startMinute" < "endMinute" AND "endMinute" <= 1440);
