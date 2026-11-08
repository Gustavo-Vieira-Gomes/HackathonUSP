-- AlterTable
ALTER TABLE "Patient" ADD COLUMN     "alertChannels" "AlertChannel"[] DEFAULT ARRAY['push', 'email']::"AlertChannel"[],
ADD COLUMN     "phoneVerifiedAt" TIMESTAMP(3);

-- CreateTable
CREATE TABLE "DemoClock" (
    "id" INTEGER NOT NULL DEFAULT 1,
    "offsetMinutes" INTEGER NOT NULL DEFAULT 0,
    "updatedAt" TIMESTAMP(3) NOT NULL,

    CONSTRAINT "DemoClock_pkey" PRIMARY KEY ("id")
);

-- Uma linha só e deslocamento só para frente (HACK-30). O Prisma não descreve CHECK no schema.
ALTER TABLE "DemoClock" ADD CONSTRAINT "DemoClock_single_row_check" CHECK ("id" = 1 AND "offsetMinutes" >= 0);
