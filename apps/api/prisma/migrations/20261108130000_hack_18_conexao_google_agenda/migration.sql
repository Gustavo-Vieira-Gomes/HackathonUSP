-- CreateEnum
CREATE TYPE "CalendarConnectionStatus" AS ENUM ('DISCONNECTED', 'AWAITING_CALENDAR', 'CONNECTED', 'EXPIRED');

-- CreateTable
CREATE TABLE "CalendarConnection" (
    "id" UUID NOT NULL,
    "clinicId" UUID NOT NULL,
    "status" "CalendarConnectionStatus" NOT NULL DEFAULT 'DISCONNECTED',
    "refreshToken" TEXT,
    "accessToken" TEXT,
    "accessTokenExpiresAt" TIMESTAMP(3),
    "calendarId" TEXT,
    "calendarName" TEXT,
    "connectedAt" TIMESTAMP(3),
    "oauthStateHash" TEXT,
    "oauthStateSessionId" TEXT,
    "oauthStateExpiresAt" TIMESTAMP(3),
    "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "updatedAt" TIMESTAMP(3) NOT NULL,

    CONSTRAINT "CalendarConnection_pkey" PRIMARY KEY ("id")
);

-- CreateIndex
CREATE UNIQUE INDEX "CalendarConnection_clinicId_key" ON "CalendarConnection"("clinicId");

-- AddForeignKey
ALTER TABLE "CalendarConnection" ADD CONSTRAINT "CalendarConnection_clinicId_fkey" FOREIGN KEY ("clinicId") REFERENCES "Clinic"("id") ON DELETE CASCADE ON UPDATE CASCADE;
