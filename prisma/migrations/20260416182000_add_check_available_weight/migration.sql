ALTER TABLE "HitEntry"
ADD CONSTRAINT check_available_weight
CHECK ("availableWeight" >= 0);
