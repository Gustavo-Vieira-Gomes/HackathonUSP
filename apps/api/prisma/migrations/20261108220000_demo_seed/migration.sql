ALTER TABLE "Clinic" ADD COLUMN "demoCalendarTarget" BOOLEAN NOT NULL DEFAULT false;
ALTER TABLE "Exam" ADD COLUMN "questionnaire" JSONB;
