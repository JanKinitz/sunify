"""Reine Rechenfunktionen: Tageswerte aus GFS-Zeitschritten bilden und Quellen zusammenführen.
Ohne Netzwerk- oder Datenbankzugriff, damit sie sich lokal testen lassen."""

from __future__ import annotations

from dataclasses import dataclass, field
from datetime import date, datetime, timedelta

import numpy as np

MIN_COVERAGE_HOURS = 18.0  # ein Tag zählt nur, wenn mindestens 18 Stunden abgedeckt sind
DAYLIGHT_WM2 = 20.0        # ab dieser kurzwelligen Einstrahlung gilt ein Zeitschritt als hell


@dataclass
class Daily:
    """Tageswerte eines Rasterpunkts ab start_date (gleich lange Listen)."""

    start_date: date
    temp_max: list[float]
    temp_min: list[float]
    precip: list[float]
    wind_max: list[float]
    sunshine: list[float]
    weather_code: list[int]
    precip_prob: list[int | None] = field(default_factory=list)

    def __len__(self) -> int:
        return len(self.temp_max)

    @property
    def end_date(self) -> date:
        return self.start_date + timedelta(days=len(self) - 1)


def weather_code_for(precip: float, snow_share: float, cloud: float) -> int:
    """WMO-Code aus Tageswerten (vereinfachte Ableitung für GFS)."""
    if precip >= 0.2:
        if snow_share >= 0.5:
            return 73 if precip >= 3 else 71
        if precip > 8:
            return 63
        if precip > 3:
            return 61
        if precip >= 1:
            return 80
        return 51
    if cloud < 20:
        return 0
    if cloud < 45:
        return 1
    if cloud < 80:
        return 2
    return 3


def aggregate_gfs(
    init_time: datetime,
    lead_hours: np.ndarray,      # (L,) Stunden seit Initialisierung, aufsteigend, beginnt bei 0
    utc_offsets: np.ndarray,     # (P,) ganze Stunden
    tmax: np.ndarray,            # (L, P) °C, Maximum über den Schritt
    tmin: np.ndarray,            # (L, P) °C
    prate: np.ndarray,           # (L, P) mm/s, Mittel seit dem vorigen Schritt
    wind_u: np.ndarray,          # (L, P) m/s, 10 m
    wind_v: np.ndarray,          # (L, P) m/s
    cloud: np.ndarray,           # (L, P) % Gesamtbewölkung, Mittel über den Schritt
    shortwave: np.ndarray,       # (L, P) W/m², Mittel über den Schritt
    snow_flag: np.ndarray | None = None,  # (L, P) 0/1 Schneefall
    max_days: int = 16,
) -> list[Daily | None]:
    lead = np.asarray(lead_hours, dtype=np.float64)
    L, P = tmax.shape
    step_h = np.diff(lead)                         # (L-1,) Dauer des Intervalls (lead[i-1], lead[i]]
    mid = (lead[:-1] + lead[1:]) / 2.0             # Intervallmitte in Stunden nach init
    init_hour = init_time.hour + init_time.minute / 60.0
    # lokale Stunde der Intervallmitte, gezählt ab Mitternacht des lokalen Init-Tages
    local = init_hour + mid[:, None] + utc_offsets[None, :].astype(np.float64)   # (L-1, P)
    day_index = np.floor(local / 24.0).astype(np.int32)                         # kann -1 sein bei negativem Offset

    def sl(a):
        return np.asarray(a[1:], dtype=np.float32)   # Werte gehören zum Intervall, das bei lead[i] endet

    t_hi, t_lo, pr = sl(tmax), sl(tmin), sl(prate)
    wind = np.sqrt(sl(wind_u) ** 2 + sl(wind_v) ** 2) * 3.6
    cl = np.clip(sl(cloud), 0, 100)
    sw = sl(shortwave)
    snow = sl(snow_flag) if snow_flag is not None else np.zeros_like(pr)
    hours = np.broadcast_to(step_h[:, None], (L - 1, P)).astype(np.float32)
    valid = np.isfinite(t_hi) & np.isfinite(t_lo) & np.isfinite(pr)

    first_day = int(day_index.min())
    last_day = int(day_index.max())
    days = list(range(first_day, last_day + 1))
    D = len(days)
    out = {k: np.full((D, P), np.nan, dtype=np.float32) for k in ("tmax", "tmin", "precip", "wind", "sun", "cloud", "snow", "cover")}
    for di, d in enumerate(days):
        m = (day_index == d) & valid
        cover = np.where(m, hours, 0).sum(axis=0)
        out["cover"][di] = cover
        with np.errstate(all="ignore"):
            out["tmax"][di] = np.where(m, t_hi, -np.inf).max(axis=0)
            out["tmin"][di] = np.where(m, t_lo, np.inf).min(axis=0)
            out["precip"][di] = np.where(m, np.clip(pr, 0, None) * hours * 3600.0, 0).sum(axis=0)
            out["wind"][di] = np.where(m & np.isfinite(wind), wind, -np.inf).max(axis=0)
            bright = m & (sw > DAYLIGHT_WM2)
            out["sun"][di] = np.where(bright, hours * (1 - np.nan_to_num(cl, nan=100) / 100.0), 0).sum(axis=0)
            cl_h = np.nan_to_num(cl, nan=100) * hours
            bright_h = np.where(bright, hours, 0).sum(axis=0)
            cloud_bright = np.where(bright, cl_h, 0).sum(axis=0) / np.maximum(bright_h, 1e-6)
            cloud_all = np.where(m, cl_h, 0).sum(axis=0) / np.maximum(cover, 1e-6)
            out["cloud"][di] = np.where(bright_h > 0, cloud_bright, cloud_all)  # Bewölkung tagsüber zählt
            wet = m & (pr > 0)
            wet_n = np.where(wet, 1, 0).sum(axis=0)
            out["snow"][di] = np.where(wet, snow, 0).sum(axis=0) / np.maximum(wet_n, 1)

    # day_index zählt ab Mitternacht des UTC-Init-Tages (siehe "local" oben) – also auch das Datum von dort
    # aus berechnen. Früher wurde das lokale Init-Datum genommen: Wo lokal schon/noch ein anderer Tag war
    # (z. B. Neuseeland beim 12Z-/18Z-Lauf, Amerika beim 00Z-Lauf), waren alle Tage um einen Tag verschoben.
    init_date = init_time.date()
    results: list[Daily | None] = []
    for p in range(P):
        ok = out["cover"][:, p] >= MIN_COVERAGE_HOURS
        idx = np.flatnonzero(ok)
        if idx.size == 0:
            results.append(None)
            continue
        # längste zusammenhängende Folge ab dem ersten vollständigen Tag
        start = int(idx[0])
        end = start
        while end + 1 < D and ok[end + 1]:
            end += 1
        end = min(end, start + max_days - 1)
        rng = range(start, end + 1)
        base = init_date + timedelta(days=days[start])
        results.append(
            Daily(
                start_date=base,
                temp_max=[round(float(out["tmax"][d, p]), 1) for d in rng],
                temp_min=[round(float(out["tmin"][d, p]), 1) for d in rng],
                precip=[round(float(out["precip"][d, p]), 1) for d in rng],
                wind_max=[round(float(out["wind"][d, p]), 1) for d in rng],
                sunshine=[round(min(24.0, float(out["sun"][d, p])), 1) for d in rng],
                weather_code=[
                    weather_code_for(float(out["precip"][d, p]), float(out["snow"][d, p]), float(out["cloud"][d, p]))
                    for d in rng
                ],
                precip_prob=[None for _ in rng],
            )
        )
    return results


def merge(primary: Daily | None, fallback: Daily | None, max_days: int = 16) -> tuple[Daily | None, date | None]:
    """Primärquelle (Open-Meteo) vorn, danach lückenlos die Folgetage der Ersatzquelle (GFS).
    Liefert (zusammengeführte Werte, letztes Datum der Primärquelle)."""
    if primary is None or len(primary) == 0:
        return fallback, None
    if fallback is None or len(fallback) == 0:
        return primary, primary.end_date
    out = Daily(
        primary.start_date,
        list(primary.temp_max),
        list(primary.temp_min),
        list(primary.precip),
        list(primary.wind_max),
        list(primary.sunshine),
        list(primary.weather_code),
        list(primary.precip_prob) if primary.precip_prob else [None] * len(primary),
    )
    nxt = primary.end_date + timedelta(days=1)
    offset = (nxt - fallback.start_date).days
    if 0 <= offset < len(fallback):
        for i in range(offset, len(fallback)):
            if len(out) >= max_days:
                break
            out.temp_max.append(fallback.temp_max[i])
            out.temp_min.append(fallback.temp_min[i])
            out.precip.append(fallback.precip[i])
            out.wind_max.append(fallback.wind_max[i])
            out.sunshine.append(fallback.sunshine[i])
            out.weather_code.append(fallback.weather_code[i])
            out.precip_prob.append(fallback.precip_prob[i] if fallback.precip_prob else None)
    return out, primary.end_date


def trim_past(daily: Daily | None, today: date) -> Daily | None:
    """Entfernt Tage vor gestern (der Vortag bleibt für die Detailansicht)."""
    if daily is None:
        return None
    cut = (today - timedelta(days=1) - daily.start_date).days
    if cut <= 0:
        return daily
    if cut >= len(daily):
        return None
    return Daily(
        daily.start_date + timedelta(days=cut),
        daily.temp_max[cut:],
        daily.temp_min[cut:],
        daily.precip[cut:],
        daily.wind_max[cut:],
        daily.sunshine[cut:],
        daily.weather_code[cut:],
        (daily.precip_prob or [None] * len(daily))[cut:],
    )


def extend_back(older: Daily | None, newer: Daily | None) -> Daily | None:
    """Ein neuer GFS-Lauf beginnt erst mit dem ersten vollständigen lokalen Tag – je nach Zeitzone ist das
    oft schon morgen. Damit "heute" (und dieses Wochenende) nicht wegfällt, werden die Tage davor aus dem
    bisher gespeicherten Lauf übernommen, sofern sie lückenlos anschließen."""
    if newer is None or older is None or len(older) == 0:
        return newer
    n = (newer.start_date - older.start_date).days
    if n <= 0 or n > len(older):
        return newer
    return Daily(
        older.start_date,
        older.temp_max[:n] + list(newer.temp_max),
        older.temp_min[:n] + list(newer.temp_min),
        older.precip[:n] + list(newer.precip),
        older.wind_max[:n] + list(newer.wind_max),
        older.sunshine[:n] + list(newer.sunshine),
        older.weather_code[:n] + list(newer.weather_code),
        list((older.precip_prob or [None] * len(older))[:n]) + list(newer.precip_prob or [None] * len(newer)),
    )

