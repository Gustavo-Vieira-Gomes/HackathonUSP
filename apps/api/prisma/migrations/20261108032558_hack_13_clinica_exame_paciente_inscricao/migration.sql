-- CreateTable
CREATE TABLE "Clinic" (
    "id" UUID NOT NULL,
    "userId" TEXT NOT NULL,
    "name" TEXT NOT NULL,
    "address" TEXT NOT NULL,
    "latitude" DOUBLE PRECISION NOT NULL,
    "longitude" DOUBLE PRECISION NOT NULL,
    "cnes" TEXT NOT NULL,
    "technicalManager" TEXT NOT NULL,
    "dailyDiscountCap" INTEGER NOT NULL DEFAULT 5,
    "depositPercent" INTEGER NOT NULL DEFAULT 20,
    "waveSize" INTEGER NOT NULL DEFAULT 5,
    "waveWindowMinutes" INTEGER NOT NULL DEFAULT 10,
    "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "updatedAt" TIMESTAMP(3) NOT NULL,

    CONSTRAINT "Clinic_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "ClinicOpeningHours" (
    "id" UUID NOT NULL,
    "clinicId" UUID NOT NULL,
    "weekday" INTEGER NOT NULL,
    "startMinute" INTEGER NOT NULL,
    "endMinute" INTEGER NOT NULL,

    CONSTRAINT "ClinicOpeningHours_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "Exam" (
    "id" UUID NOT NULL,
    "clinicId" UUID NOT NULL,
    "tussCode" TEXT NOT NULL,
    "name" TEXT NOT NULL,
    "fullPriceCents" INTEGER NOT NULL,
    "floorPriceCents" INTEGER NOT NULL,
    "minLeadMinutes" INTEGER NOT NULL,
    "preparationCondition" TEXT NOT NULL,
    "preparationHours" INTEGER NOT NULL,
    "contraindications" TEXT[],
    "toleranceMinutes" INTEGER NOT NULL,
    "maxTravelMinutes" INTEGER NOT NULL,
    "questionnaireKey" TEXT NOT NULL,
    "questionnaireVersion" INTEGER NOT NULL,
    "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "updatedAt" TIMESTAMP(3) NOT NULL,

    CONSTRAINT "Exam_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "PriceStep" (
    "id" UUID NOT NULL,
    "examId" UUID NOT NULL,
    "leadMinutes" INTEGER NOT NULL,
    "discountPercent" INTEGER NOT NULL,

    CONSTRAINT "PriceStep_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "Patient" (
    "id" UUID NOT NULL,
    "userId" TEXT NOT NULL,
    "phone" TEXT NOT NULL,
    "healthDataConsentAt" TIMESTAMP(3) NOT NULL,
    "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "updatedAt" TIMESTAMP(3) NOT NULL,

    CONSTRAINT "Patient_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "Subscription" (
    "id" UUID NOT NULL,
    "patientId" UUID NOT NULL,
    "tussCode" TEXT NOT NULL,
    "maxPriceCents" INTEGER NOT NULL,
    "latitude" DOUBLE PRECISION NOT NULL,
    "longitude" DOUBLE PRECISION NOT NULL,
    "radiusMeters" INTEGER NOT NULL,
    "canGoToday" BOOLEAN NOT NULL DEFAULT false,
    "currentLatitude" DOUBLE PRECISION,
    "currentLongitude" DOUBLE PRECISION,
    "expiresAt" TIMESTAMP(3) NOT NULL,
    "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "updatedAt" TIMESTAMP(3) NOT NULL,

    CONSTRAINT "Subscription_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "SubscriptionWindow" (
    "id" UUID NOT NULL,
    "subscriptionId" UUID NOT NULL,
    "weekday" INTEGER NOT NULL,
    "startMinute" INTEGER NOT NULL,
    "endMinute" INTEGER NOT NULL,

    CONSTRAINT "SubscriptionWindow_pkey" PRIMARY KEY ("id")
);

-- CreateIndex
CREATE UNIQUE INDEX "Clinic_userId_key" ON "Clinic"("userId");

-- CreateIndex
CREATE UNIQUE INDEX "Clinic_cnes_key" ON "Clinic"("cnes");

-- CreateIndex
CREATE INDEX "ClinicOpeningHours_clinicId_idx" ON "ClinicOpeningHours"("clinicId");

-- CreateIndex
CREATE UNIQUE INDEX "Exam_clinicId_tussCode_key" ON "Exam"("clinicId", "tussCode");

-- CreateIndex
CREATE INDEX "PriceStep_examId_idx" ON "PriceStep"("examId");

-- CreateIndex
CREATE UNIQUE INDEX "Patient_userId_key" ON "Patient"("userId");

-- CreateIndex
CREATE UNIQUE INDEX "Subscription_patientId_tussCode_key" ON "Subscription"("patientId", "tussCode");

-- CreateIndex
CREATE INDEX "SubscriptionWindow_subscriptionId_idx" ON "SubscriptionWindow"("subscriptionId");

-- AddForeignKey
ALTER TABLE "Clinic" ADD CONSTRAINT "Clinic_userId_fkey" FOREIGN KEY ("userId") REFERENCES "User"("id") ON DELETE CASCADE ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "ClinicOpeningHours" ADD CONSTRAINT "ClinicOpeningHours_clinicId_fkey" FOREIGN KEY ("clinicId") REFERENCES "Clinic"("id") ON DELETE CASCADE ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "Exam" ADD CONSTRAINT "Exam_clinicId_fkey" FOREIGN KEY ("clinicId") REFERENCES "Clinic"("id") ON DELETE RESTRICT ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "PriceStep" ADD CONSTRAINT "PriceStep_examId_fkey" FOREIGN KEY ("examId") REFERENCES "Exam"("id") ON DELETE CASCADE ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "Patient" ADD CONSTRAINT "Patient_userId_fkey" FOREIGN KEY ("userId") REFERENCES "User"("id") ON DELETE CASCADE ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "Subscription" ADD CONSTRAINT "Subscription_patientId_fkey" FOREIGN KEY ("patientId") REFERENCES "Patient"("id") ON DELETE RESTRICT ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "SubscriptionWindow" ADD CONSTRAINT "SubscriptionWindow_subscriptionId_fkey" FOREIGN KEY ("subscriptionId") REFERENCES "Subscription"("id") ON DELETE CASCADE ON UPDATE CASCADE;

-- Escrito à mão (porta 5 do plano): o Prisma não descreve CHECK no schema.
-- RN-02: piso <= preço cheio; X e Y em minutos, maiores que zero.
ALTER TABLE "Exam" ADD CONSTRAINT "Exam_floor_le_full_price_check" CHECK ("floorPriceCents" <= "fullPriceCents");
ALTER TABLE "Exam" ADD CONSTRAINT "Exam_tolerance_travel_positive_check" CHECK ("toleranceMinutes" > 0 AND "maxTravelMinutes" > 0);
