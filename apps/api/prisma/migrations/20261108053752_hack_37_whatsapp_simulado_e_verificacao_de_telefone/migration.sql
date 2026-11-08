-- CreateEnum
CREATE TYPE "SimulatedWhatsappKind" AS ENUM ('alerta', 'codigo_verificacao');

-- CreateTable
CREATE TABLE "SimulatedWhatsappMessage" (
    "id" UUID NOT NULL,
    "patientId" UUID NOT NULL,
    "phone" TEXT NOT NULL,
    "kind" "SimulatedWhatsappKind" NOT NULL,
    "body" TEXT NOT NULL,
    "alertId" UUID,
    "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,

    CONSTRAINT "SimulatedWhatsappMessage_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "PhoneVerification" (
    "patientId" UUID NOT NULL,
    "phone" TEXT NOT NULL,
    "codeHash" TEXT NOT NULL,
    "attempts" INTEGER NOT NULL DEFAULT 0,
    "expiresAt" TIMESTAMP(3) NOT NULL,
    "sentAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,

    CONSTRAINT "PhoneVerification_pkey" PRIMARY KEY ("patientId")
);

-- CreateIndex
CREATE UNIQUE INDEX "SimulatedWhatsappMessage_alertId_key" ON "SimulatedWhatsappMessage"("alertId");

-- CreateIndex
CREATE INDEX "SimulatedWhatsappMessage_createdAt_idx" ON "SimulatedWhatsappMessage"("createdAt");

-- AddForeignKey
ALTER TABLE "SimulatedWhatsappMessage" ADD CONSTRAINT "SimulatedWhatsappMessage_patientId_fkey" FOREIGN KEY ("patientId") REFERENCES "Patient"("id") ON DELETE CASCADE ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "PhoneVerification" ADD CONSTRAINT "PhoneVerification_patientId_fkey" FOREIGN KEY ("patientId") REFERENCES "Patient"("id") ON DELETE CASCADE ON UPDATE CASCADE;

-- Tentativas não negativas (HACK-37). O Prisma não descreve CHECK no schema.
ALTER TABLE "PhoneVerification" ADD CONSTRAINT "PhoneVerification_attempts_check" CHECK ("attempts" >= 0);
