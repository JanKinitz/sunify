-- Sunify 2.0 · Suche mit Toleranzstufen und Höhenkorrektur
--
-- Toleranz:
--   0 = strikt          jeder Tag erfüllt alle Kriterien exakt
--   1 = etwas flexibel  jeder Tag erfüllt alle Kriterien mit kleinem Spielraum
--   2 = flexibel        größerer Spielraum, und bei mehrtägigen Zeiträumen darf ein Teil der Tage abweichen
-- Nicht-Treffer: optional (p_others) zusätzlich bekannte Orte im Radius, deren Wetter NICHT passt, gleichmäßig
--   über den Radius verteilt (je Kartenzelle der bekannteste Ort) – für die grauen Punkte auf der Karte.
--   Sie kommen im selben Durchgang mit is_match = false; total_count zählt nur Treffer.
-- Entfernungen auf der Kugel (use_spheroid = false): schneller, Abweichung unter 0,5 %.
-- Höhenkorrektur: Tageswerte gelten für die mittlere Höhe der Orte im Rasterpunkt; für jeden Ort wird die
-- Temperatur mit 0,65 °C pro 100 m auf seine eigene Höhe umgerechnet (begrenzt auf ±8 °C).

DROP FUNCTION IF EXISTS search_destinations_v2(DOUBLE PRECISION, DOUBLE PRECISION, DOUBLE PRECISION, DATE, DATE, REAL, REAL, REAL, REAL, SMALLINT, TEXT[], INTEGER);
DROP FUNCTION IF EXISTS search_destinations_v2(DOUBLE PRECISION, DOUBLE PRECISION, DOUBLE PRECISION, DATE, DATE, REAL, REAL, REAL, REAL, SMALLINT, TEXT[], INTEGER, INTEGER, SMALLINT);

CREATE FUNCTION search_destinations_v2(
  p_lat             DOUBLE PRECISION,
  p_lon             DOUBLE PRECISION,
  p_radius_meters   DOUBLE PRECISION,
  p_start_date      DATE,
  p_end_date        DATE,
  p_min_temp        REAL,
  p_max_precip      REAL,       -- NULL = Niederschlag egal
  p_max_wind        REAL,
  p_min_sunshine    REAL,
  p_tolerance       SMALLINT DEFAULT 0,
  p_tags            TEXT[] DEFAULT NULL,  -- NULL = alle Orts-Typen
  p_limit           INTEGER DEFAULT 100,
  p_others          INTEGER DEFAULT 0,    -- Anzahl Nicht-Treffer für die Karte (0 = keine)
  p_others_min_score SMALLINT DEFAULT 35
)
RETURNS TABLE (
  destination_id  INTEGER,
  grid_id         INTEGER,
  distance_km     REAL,
  tourism_score   SMALLINT,
  population      INTEGER,
  temp_correction REAL,
  strict_match    BOOLEAN,
  match_pct       SMALLINT,
  avg_temp_max    REAL,
  total_precip    REAL,
  max_wind        REAL,
  avg_sunshine    REAL,
  total_count     INTEGER,
  is_match        BOOLEAN
)
LANGUAGE plpgsql STABLE
SET plan_cache_mode = force_custom_plan
AS $$
DECLARE
  v_days     INTEGER := (p_end_date - p_start_date) + 1;
  v_origin   GEOGRAPHY := ST_SetSRID(ST_MakePoint(p_lon, p_lat), 4326)::GEOGRAPHY;
  v_precip   REAL := COALESCE(p_max_precip, 1e6);
  -- Spielraum je Toleranzstufe
  v_dt       REAL := CASE p_tolerance WHEN 1 THEN 2   WHEN 2 THEN 3   ELSE 0 END;  -- °C kälter
  v_dp       REAL := CASE p_tolerance WHEN 1 THEN 1   WHEN 2 THEN 3   ELSE 0 END;  -- mm mehr Regen
  v_dw       REAL := CASE p_tolerance WHEN 1 THEN 10  WHEN 2 THEN 15  ELSE 0 END;  -- km/h mehr Wind
  v_ds       REAL := CASE p_tolerance WHEN 1 THEN 1.5 WHEN 2 THEN 2.5 ELSE 0 END;  -- Std. weniger Sonne
  v_fail     INTEGER := CASE WHEN p_tolerance = 2 AND v_days >= 2 THEN GREATEST(1, v_days / 4) ELSE 0 END;
  -- Kartenzelle für die Verteilung der Nicht-Treffer (in Grad): ca. Radius / 400 km
  v_cell     DOUBLE PRECISION := GREATEST(0.1, p_radius_meters / 1000.0 / 400.0);
BEGIN
  IF v_days < 1 OR v_days > 16 THEN
    RETURN;
  END IF;

  RETURN QUERY
  WITH grids AS (
    -- Rasterpunkte im Radius (+80 km für die größten Zellen), deren Prognose den Zeitraum abdeckt
    SELECT g.grid_id, g.elevation AS grid_elev, f.start_date, f.temp_max, f.precip, f.wind_max, f.sunshine
    FROM weather_grid g
    JOIN weather_forecasts f ON f.grid_id = g.grid_id
    WHERE ST_DWithin(g.geom, v_origin, p_radius_meters + 80000, false)
      AND f.start_date <= p_start_date
      AND f.start_date + array_length(f.temp_max, 1) - 1 >= p_end_date
  ),
  evaluated AS (
    -- Jeder Ort im Radius wird in einem Durchgang bewertet (Tageswerte per LATERAL, kein Selbst-Join)
    SELECT d.destination_id, d.grid_id, d.tourism_score, d.population, d.lat, d.lon,
           (ST_Distance(d.geom, v_origin, false) / 1000.0)::REAL AS distance_km,
           c.corr,
           (sc.strict_days = v_days) AS strict_match,
           ROUND(100.0 * sc.ok_checks / (4 * v_days))::SMALLINT AS match_pct,
           sc.avg_t, sc.sum_p, sc.max_w, sc.avg_s,
           (sc.loose_days >= v_days - v_fail) AS is_match
    FROM destinations d
    JOIN grids gr ON gr.grid_id = d.grid_id
    CROSS JOIN LATERAL (
      SELECT LEAST(8, GREATEST(-8, (COALESCE(gr.grid_elev, d.elevation, 0) - COALESCE(d.elevation, gr.grid_elev, 0)) * 0.0065))::REAL AS corr
    ) c
    CROSS JOIN LATERAL (
      SELECT COUNT(*) FILTER (WHERE dy.t >= p_min_temp AND dy.p <= v_precip AND dy.w <= p_max_wind AND dy.s >= p_min_sunshine) AS strict_days,
             COUNT(*) FILTER (WHERE dy.t >= p_min_temp - v_dt AND dy.p <= v_precip + v_dp AND dy.w <= p_max_wind + v_dw AND dy.s >= p_min_sunshine - v_ds) AS loose_days,
             SUM((dy.t >= p_min_temp)::INT + (dy.p <= v_precip)::INT + (dy.w <= p_max_wind)::INT + (dy.s >= p_min_sunshine)::INT) AS ok_checks,
             AVG(dy.t)::REAL AS avg_t, SUM(dy.p)::REAL AS sum_p, MAX(dy.w)::REAL AS max_w, AVG(dy.s)::REAL AS avg_s
      FROM (
        SELECT gr.temp_max[i] + c.corr AS t, gr.precip[i] AS p, gr.wind_max[i] AS w, COALESCE(gr.sunshine[i], 0) AS s
        FROM generate_series(p_start_date - gr.start_date + 1, p_end_date - gr.start_date + 1) AS i
      ) dy
    ) sc
    WHERE ST_DWithin(d.geom, v_origin, p_radius_meters, false)
      AND (p_tags IS NULL OR d.tags && p_tags)
  ),
  total AS (
    SELECT COUNT(*)::INTEGER AS n FROM evaluated e WHERE e.is_match
  ),
  hits AS (
    SELECT e.* FROM evaluated e
    WHERE e.is_match
    ORDER BY e.strict_match DESC, e.match_pct DESC, e.tourism_score DESC, e.avg_t DESC, e.population DESC
    LIMIT p_limit
  ),
  others AS (
    SELECT x.* FROM (
      SELECT e.*, ROW_NUMBER() OVER (
               PARTITION BY floor(e.lat / v_cell), floor(e.lon / v_cell)
               ORDER BY e.tourism_score DESC, e.population DESC) AS rn
      FROM evaluated e
      WHERE p_others > 0 AND NOT e.is_match AND e.tourism_score >= p_others_min_score
    ) x
    WHERE x.rn = 1
    ORDER BY x.tourism_score DESC, x.population DESC
    LIMIT GREATEST(p_others, 0)
  ),
  picked AS (
    SELECT h.destination_id, h.grid_id, h.distance_km, h.tourism_score, h.population, h.corr, h.strict_match,
           h.match_pct, h.avg_t, h.sum_p, h.max_w, h.avg_s, h.is_match FROM hits h
    UNION ALL
    SELECT o.destination_id, o.grid_id, o.distance_km, o.tourism_score, o.population, o.corr, o.strict_match,
           o.match_pct, o.avg_t, o.sum_p, o.max_w, o.avg_s, o.is_match FROM others o
  )
  SELECT p.destination_id, p.grid_id, ROUND(p.distance_km::NUMERIC, 1)::REAL, p.tourism_score, p.population,
         ROUND(p.corr::NUMERIC, 1)::REAL, p.strict_match, p.match_pct,
         ROUND(p.avg_t::NUMERIC, 1)::REAL, ROUND(p.sum_p::NUMERIC, 1)::REAL, ROUND(p.max_w::NUMERIC, 0)::REAL, ROUND(p.avg_s::NUMERIC, 1)::REAL,
         t.n, p.is_match
  FROM picked p CROSS JOIN total t
  ORDER BY p.is_match DESC, p.strict_match DESC, p.match_pct DESC, p.tourism_score DESC, p.avg_t DESC, p.population DESC;
END;
$$;
