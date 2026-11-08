CREATE TABLE "PushSubscription" (
  "id" UUID NOT NULL,
  "patientId" UUID NOT NULL,
  "endpoint" TEXT NOT NULL,
  "p256dh" TEXT NOT NULL,
  "auth" TEXT NOT NULL,
  "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
  "updatedAt" TIMESTAMP(3) NOT NULL,
  CONSTRAINT "PushSubscription_pkey" PRIMARY KEY ("id")
);
CREATE UNIQUE INDEX "PushSubscription_endpoint_key" ON "PushSubscription"("endpoint");
CREATE INDEX "PushSubscription_patientId_idx" ON "PushSubscription"("patientId");
ALTER TABLE "PushSubscription" ADD CONSTRAINT "PushSubscription_patientId_fkey" FOREIGN KEY ("patientId") REFERENCES "Patient"("id") ON DELETE CASCADE ON UPDATE CASCADE;
