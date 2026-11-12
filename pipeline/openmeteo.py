"""14-Tage-Prognosen von Open-Meteo (best_match: wählt je Ort das feinste verfügbare Modell, in
Mitteleuropa u. a. DWD ICON-D2/ICON-EU). Daten: CC BY 4.0, open-meteo.com.
Hinweis: Die kostenlose Schnittstelle ist nur für nicht-kommerzielle Nutzung freigegeben
(< 10.000 Aufrufe/Tag, < 600/Minute). Mit einem bezahlten Tarif OPEN_METEO_API_KEY setzen."""

from __future__ import annotations

import os
import time
from datetime import date

from .daily import Daily
from .download import get_json

FREE_URL = "https://api.open-meteo.com/v1/forecast"
CUSTOMER_URL = "https://customer-api.open-meteo.com/v1/forecast"
DAILY_VARS = [
    "weather_code",
    "temperature_2m_max",
    "temperature_2m_min",
    "precipitation_sum",
    "precipitation_probability_max",
    "wind_speed_10m_max",
    "sunshine_duration",
]
BATCH = 100
PAUSE_S = 11  # 100 Orte alle 11 s bleibt unter 600 Aufrufen pro Minute
FORECAST_DAYS = 14


def fetch(points: list[tuple[float, float, int | None]], log=print) -> list[Daily | None]:
    api_key = os.environ.get("OPEN_METEO_API_KEY", "").strip()
    url = CUSTOMER_URL if api_key else FREE_URL
    results: list[Daily | None] = []
    for b in range(0, len(points), BATCH):
        chunk = points[b : b + BATCH]
        if b:
            time.sleep(0 if api_key else PAUSE_S)
        params = {
            "latitude": ",".join(f"{p[0]:.4f}" for p in chunk),
            "longitude": ",".join(f"{p[1]:.4f}" for p in chunk),
            "elevation": ",".join("nan" if p[2] is None else str(p[2]) for p in chunk),
            "daily": ",".join(DAILY_VARS),
            "timezone": "auto",
            "forecast_days": FORECAST_DAYS,
        }
        if api_key:
            params["apikey"] = api_key
        try:
            data = get_json(url, params=params, retries=4, timeout=120)
        except Exception as e:
            log(f"   Open-Meteo-Block {b // BATCH + 1} fehlgeschlagen: {e}")
            results.extend([None] * len(chunk))
            continue
        items = data if isinstance(data, list) else [data]
        if len(items) != len(chunk):
            results.extend([None] * len(chunk))
            continue
        for item in items:
            results.append(_to_daily(item.get("daily") or {}))
        if (b // BATCH) % 10 == 0:
            log(f"   Open-Meteo {min(b + BATCH, len(points))}/{len(points)}")
    return results


def _to_daily(d: dict) -> Daily | None:
    times = d.get("time") or []
    rows = []
    for i, t in enumerate(times):
        vals = [d.get(k, [None] * len(times))[i] for k in ("temperature_2m_max", "temperature_2m_min", "precipitation_sum", "wind_speed_10m_max", "weather_code")]
        if any(v is None for v in vals):
            break  # nur lückenlose Folge ab dem ersten Tag
        sun = (d.get("sunshine_duration") or [None] * len(times))[i]
        prob = (d.get("precipitation_probability_max") or [None] * len(times))[i]
        rows.append((t, vals, 0.0 if sun is None else round(sun / 3600.0, 1), None if prob is None else int(round(prob))))
    if not rows:
        return None
    return Daily(
        start_date=date.fromisoformat(rows[0][0]),
        temp_max=[round(r[1][0], 1) for r in rows],
        temp_min=[round(r[1][1], 1) for r in rows],
        precip=[round(r[1][2], 1) for r in rows],
        wind_max=[round(r[1][3], 1) for r in rows],
        weather_code=[int(r[1][4]) for r in rows],
        sunshine=[r[2] for r in rows],
        precip_prob=[r[3] for r in rows],
    )
