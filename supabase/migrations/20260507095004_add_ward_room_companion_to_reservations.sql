
ALTER TABLE reservations
  ADD COLUMN IF NOT EXISTS ward        text    DEFAULT NULL,
  ADD COLUMN IF NOT EXISTS room_number text    DEFAULT NULL,
  ADD COLUMN IF NOT EXISTS has_companion boolean DEFAULT false NOT NULL;
