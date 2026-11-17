"""Kommandozeile der Datenjobs.

  python -m pipeline migrate          SQL-Migrationen ausführen
  python -m pipeline seed             Orte und Raster weltweit neu aufbauen (löscht auch Prognosen)
  python -m pipeline weather-om       Open-Meteo für Zentraleuropa (1× täglich)
  python -m pipeline weather-gfs      GFS weltweit (bis 4× täglich)
  python -m pipeline images           fehlende Ortsfotos nachtragen (nachts, in Etappen)
  python -m pipeline status           Datenbankstand ausgeben
"""

from __future__ import annotations

import os
import sys
import time
import traceback

from .db import RunLog, connect, run_migrations


def _load_env() -> None:
    for name in (".env.local", ".env"):
        if os.path.exists(name):
            for line in open(name, encoding="utf-8"):
                line = line.strip()
                if line and not line.startswith("#") and "=" in line:
                    key, value = line.split("=", 1)
                    os.environ.setdefault(key.strip(), value.strip())


def _job(name: str, fn) -> int:
    conn = connect()
    log = RunLog(conn, name)
    t0 = time.time()
    try:
        summary = fn(conn)
        summary["seconds"] = round(time.time() - t0)
        log.finish(True, summary)
        print(f"\n{name} abgeschlossen: {summary}", flush=True)
        return 0
    except BaseException as e:  # noqa: BLE001 – Fehler protokollieren und weiterreichen
        log.finish(False, {"error": f"{type(e).__name__}: {e}", "seconds": round(time.time() - t0)})
        traceback.print_exc()
        return 1
    finally:
        conn.close()


def main(argv: list[str]) -> int:
    _load_env()
    cmd = argv[1] if len(argv) > 1 else "status"
    if cmd == "migrate":
        conn = connect()
        print("Migrationen:", ", ".join(run_migrations(conn)))
        conn.close()
        return 0
    if cmd == "seed":
        from . import seed

        data = seed.collect()  # Download und Auswertung ohne Datenbankverbindung (kann lange dauern)
        return _job("seed", lambda conn: {**data["stats"], **seed.write(conn, data)})
    if cmd == "images":
        from . import images

        return _job("images", images.run)
    if cmd == "weather-gfs":
        from . import weather

        return _job("weather-gfs", lambda conn: weather.run_gfs(conn))
    if cmd == "weather-om":
        from . import weather

        return _job("weather-om", lambda conn: weather.run_open_meteo(conn))
    if cmd == "status":
        conn = connect()
        with conn.cursor() as cur:
            cur.execute(
                "SELECT (SELECT COUNT(*) FROM weather_grid), (SELECT COUNT(*) FROM destinations),"
                " (SELECT COUNT(*) FROM weather_forecasts), (SELECT MIN(start_date) FROM weather_forecasts),"
                " (SELECT MAX(start_date + array_length(temp_max, 1) - 1) FROM weather_forecasts)"
            )
            g, d, f, first, last = cur.fetchone()
            print(f"Rasterpunkte {g}, Orte {d}, Prognosen {f} ({first} bis {last})")
            cur.execute("SELECT job, started_at, ok, summary FROM pipeline_runs ORDER BY run_id DESC LIMIT 8")
            for row in cur.fetchall():
                print(" ", row)
        conn.close()
        return 0
    print(__doc__)
    return 2


if __name__ == "__main__":
    sys.exit(main(sys.argv))
