"""Wetter-Jobs: GFS weltweit (mehrmals täglich) und Open-Meteo für Zentraleuropa (einmal täglich).

Zusammenspiel: Für Open-Meteo-Rasterpunkte stammen die ersten 14 Tage aus Open-Meteo, die Tage danach
aus GFS. Ist der letzte Open-Meteo-Abruf älter als 36 Stunden, übernimmt GFS den Punkt vollständig.
"""

from __future__ import annotations

from datetime import date, datetime, timedelta, timezone

import numpy as np

from . import gfs, openmeteo
from .daily import Daily, merge, trim_past

STALE_AFTER = timedelta(hours=36)


def _load_grid(conn):
    with conn.cursor() as cur:
        cur.execute("SELECT grid_id, lat, lon, elevation, source, utc_offset FROM weather_grid ORDER BY grid_id")
        return cur.fetchall()


def _load_existing(conn, grid_ids: list[int]) -> dict[int, tuple[Daily, date | None, datetime | None]]:
    out = {}
    with conn.cursor() as cur:
        cur.execute(
            "SELECT grid_id, start_date, temp_max, temp_min, precip, wind_max, sunshine, weather_code, precip_prob,"
            " primary_until, om_updated_at FROM weather_forecasts WHERE grid_id = ANY(%s)",
            (grid_ids,),
        )
        for row in cur.fetchall():
            gid, start, tmax, tmin, pr, wind, sun, code, prob, until, om_at = row
            out[gid] = (Daily(start, list(tmax), list(tmin), list(pr), list(wind), list(sun), list(code), list(prob or [None] * len(tmax))), until, om_at)
    return out


def _cut_primary(daily: Daily, until: date | None) -> Daily | None:
    """Nur den Open-Meteo-Teil (bis einschließlich primary_until) behalten."""
    if until is None:
        return None
    n = (until - daily.start_date).days + 1
    if n <= 0:
        return None
    n = min(n, len(daily))
    return Daily(daily.start_date, daily.temp_max[:n], daily.temp_min[:n], daily.precip[:n], daily.wind_max[:n],
                 daily.sunshine[:n], daily.weather_code[:n], (daily.precip_prob or [None] * len(daily))[:n])


def _write(conn, rows: list[tuple[int, Daily, date | None, datetime | None]]) -> int:
    with conn.cursor() as cur:
        cur.execute(
            "CREATE TEMP TABLE tmp_fc (LIKE weather_forecasts INCLUDING DEFAULTS) ON COMMIT DROP"
        )
        with cur.copy(
            "COPY tmp_fc (grid_id, start_date, temp_max, temp_min, precip, precip_prob, wind_max, sunshine, weather_code,"
            " primary_until, om_updated_at, updated_at) FROM STDIN"
        ) as cp:
            now = datetime.now(timezone.utc)
            for gid, d, until, om_at in rows:
                cp.write_row((gid, d.start_date, d.temp_max, d.temp_min, d.precip, d.precip_prob or [None] * len(d),
                              d.wind_max, d.sunshine, d.weather_code, until, om_at, now))
        cur.execute(
            """INSERT INTO weather_forecasts SELECT * FROM tmp_fc
               ON CONFLICT (grid_id) DO UPDATE SET
                 start_date = EXCLUDED.start_date, temp_max = EXCLUDED.temp_max, temp_min = EXCLUDED.temp_min,
                 precip = EXCLUDED.precip, precip_prob = EXCLUDED.precip_prob, wind_max = EXCLUDED.wind_max,
                 sunshine = EXCLUDED.sunshine, weather_code = EXCLUDED.weather_code,
                 primary_until = EXCLUDED.primary_until, om_updated_at = EXCLUDED.om_updated_at,
                 updated_at = EXCLUDED.updated_at"""
        )
    conn.commit()
    return len(rows)


def run_gfs(conn, log=print) -> dict:
    grid = _load_grid(conn)
    if not grid:
        raise SystemExit("Keine Rasterpunkte – bitte zuerst den Seed ausführen.")
    ids = [g[0] for g in grid]
    lats = np.array([g[1] for g in grid], dtype=np.float64)
    lons = np.array([g[2] for g in grid], dtype=np.float64)
    offs = np.array([g[5] for g in grid], dtype=np.int32)
    init, daily = gfs.daily_for_points(lats, lons, offs, log)

    om_ids = [g[0] for g in grid if g[4] == "open-meteo"]
    existing = _load_existing(conn, om_ids) if om_ids else {}
    today = datetime.now(timezone.utc).date()
    now = datetime.now(timezone.utc)
    rows, missing, kept_om = [], 0, 0
    for gid, d in zip(ids, daily):
        if d is None:
            missing += 1
            continue
        until, om_at = None, None
        if gid in existing:
            ex, ex_until, ex_om_at = existing[gid]
            fresh = ex_om_at is not None and now - ex_om_at <= STALE_AFTER
            primary = _cut_primary(ex, ex_until) if fresh else None
            if primary is not None:
                d, until = merge(trim_past(primary, today), d)
                om_at = ex_om_at
                kept_om += 1
        d = trim_past(d, today)
        if d is not None and len(d) > 0:
            rows.append((gid, d, until, om_at))
    written = _write(conn, rows)
    return {"init": init.isoformat(), "points": len(ids), "written": written, "missing": missing, "open_meteo_kept": kept_om}


def run_open_meteo(conn, log=print) -> dict:
    grid = [g for g in _load_grid(conn) if g[4] == "open-meteo"]
    if not grid:
        return {"points": 0}
    ids = [g[0] for g in grid]
    fetched = openmeteo.fetch([(g[1], g[2], g[3]) for g in grid], log)
    existing = _load_existing(conn, ids)
    today = datetime.now(timezone.utc).date()
    now = datetime.now(timezone.utc)
    rows, failed = [], 0
    for gid, om in zip(ids, fetched):
        if om is None:
            failed += 1
            continue
        tail = None
        if gid in existing:
            ex, ex_until, _ = existing[gid]
            # GFS-Anteil der bisherigen Zeile (nach dem alten Open-Meteo-Teil) als Ergänzung verwenden
            tail = ex
        merged, until = merge(trim_past(om, today), tail)
        if merged is not None:
            rows.append((gid, merged, until, now))
    written = _write(conn, rows)
    return {"points": len(ids), "written": written, "failed": failed}
