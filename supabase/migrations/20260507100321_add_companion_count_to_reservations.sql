ALTER TABLE reservations ADD COLUMN IF NOT EXISTS companion_count smallint DEFAULT 0 NOT NULL;
