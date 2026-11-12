-- Sunify · Phase 3 · Stabile Antwortzeiten der Suchfunktion
-- PL/pgSQL wechselt nach einigen Aufrufen pro Verbindung auf einen generischen Ausführungsplan.
-- Für search_weather_destinations war dieser Plan bei großen Treffermengen um ein Vielfaches
-- langsamer. Die Einstellung erzwingt für diese Funktion immer einen zu den Parametern passenden Plan.

ALTER FUNCTION search_weather_destinations(
  DOUBLE PRECISION, DOUBLE PRECISION, DOUBLE PRECISION, DATE, DATE, REAL, REAL, REAL, REAL, INTEGER
) SET plan_cache_mode = force_custom_plan;
