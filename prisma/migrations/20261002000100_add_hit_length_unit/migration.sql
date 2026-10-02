ALTER TABLE "HitEntry" ADD COLUMN "lengthUnit" TEXT;
ALTER TABLE "HitEntry" ADD CONSTRAINT "HitEntry_lengthUnit_check" CHECK ("lengthUnit" IN ('meter', 'feet'));
