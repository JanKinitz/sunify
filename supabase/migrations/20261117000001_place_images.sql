-- Nachgetragene Ortsfotos (pipeline/images.py). Schlüssel ist die GeoNames-ID, damit die Funde
-- einen Neuaufbau der Orte (seed, TRUNCATE destinations) überstehen.
-- image_file NULL = geprüft, nichts Passendes gefunden (wird nach 60 Tagen erneut versucht).
CREATE TABLE IF NOT EXISTS place_images (
  geoname_id    INTEGER PRIMARY KEY,
  image_file    VARCHAR(300),
  image_author  VARCHAR(200),
  image_license VARCHAR(80),
  source        VARCHAR(20),               -- p18 | kategorie | umkreis
  checked_at    TIMESTAMPTZ NOT NULL DEFAULT now()
);
ALTER TABLE place_images ENABLE ROW LEVEL SECURITY;
DROP POLICY IF EXISTS "Oeffentlich lesbar" ON place_images;
CREATE POLICY "Oeffentlich lesbar" ON place_images FOR SELECT USING (true);
