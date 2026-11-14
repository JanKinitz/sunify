"""Einmalige Auswertung: Wie groß ist die Höhenkorrektur, und stimmt sie mit anderen Quellen überein?

Nur lesend. Läuft per GitHub Actions (Branch analyse-hoehe), Ergebnis steht im Log.
  A) Verteilung der Korrektur über alle Orte (nach Quelle, Region, Score)
  B) Stichprobe von Orten mit großer Korrektur: Sunify roh / korrigiert vs. Open-Meteo-Punktprognose
     (auf Ortshöhe) und MET Norway (eigenes Modell, eigene Höhenanpassung) für heute und morgen
  C) Beobachtungen jetzt: Inversion? Temperatur gegen Stationshöhe (MeteoSchweiz, DWD)
"""
from __future__ import annotations

import csv
import io
import json
import statistics
import sys
import time
import urllib.parse
import urllib.request
from datetime import date, datetime, timedelta
from zoneinfo import ZoneInfo

from pipeline.db import connect

LAPSE = 0.0065
CAP = 8.0
UA = "sunify-analysis/1.0 github.com/JanKinitz/sunify"


def get(url: str, timeout: int = 40):
    req = urllib.request.Request(url, headers={"User-Agent": UA, "Accept": "application/json"})
    with urllib.request.urlopen(req, timeout=timeout) as r:
        return r.read()


def corr(grid_elev, dest_elev) -> float:
    g = grid_elev if grid_elev is not None else dest_elev
    d = dest_elev if dest_elev is not None else grid_elev
    if g is None or d is None:
        return 0.0
    return max(-CAP, min(CAP, (g - d) * LAPSE))


def section(title: str):
    print("\n" + "=" * 100 + f"\n{title}\n" + "=" * 100, flush=True)


def part_a(cur):
    section("A) Verteilung der Höhenkorrektur")
    cur.execute(
        """SELECT d.elevation, g.elevation, g.source, d.tourism_score, d.lat, d.lon, g.cell_size
           FROM destinations d JOIN weather_grid g USING (grid_id)"""
    )
    rows = cur.fetchall()
    print(f"Orte gesamt: {len(rows):,}  (ohne Ortshöhe: {sum(1 for r in rows if r[0] is None):,})")
    buckets = [(0, 0.5), (0.5, 1), (1, 2), (2, 4), (4, 7.999), (7.999, 99)]

    def dist(label, sel):
        n = len(sel)
        if not n:
            return
        cs = [abs(corr(r[1], r[0])) for r in sel]
        parts = []
        for lo, hi in buckets:
            k = sum(1 for c in cs if lo <= c < hi)
            name = "=8 (Kappung)" if lo >= 7.9 else f"{lo:g}-{hi:g}"
            parts.append(f"{name}: {100 * k / n:5.1f}%")
        pos = sum(1 for r in sel if corr(r[1], r[0]) > 0.5)
        neg = sum(1 for r in sel if corr(r[1], r[0]) < -0.5)
        print(f"{label:<42} n={n:>7,}  Median |K|={statistics.median(cs):.2f} °C  P90={sorted(cs)[int(0.9 * n)]:.2f}  "
              f"wärmer:{100 * pos / n:4.1f}% kälter:{100 * neg / n:4.1f}%\n    " + " | ".join(parts))

    dist("Alle Orte", rows)
    dist("Score >= 35 (sichtbar/bekannt)", [r for r in rows if r[3] >= 35])
    dist("Score >= 60", [r for r in rows if r[3] >= 60])
    dist("Quelle Open-Meteo", [r for r in rows if r[2] == "open-meteo"])
    dist("Quelle GFS", [r for r in rows if r[2] != "open-meteo"])
    dist("Alpenraum (45.5-48 N, 5.5-16.5 O)", [r for r in rows if 45.5 <= r[4] <= 48 and 5.5 <= r[5] <= 16.5])
    dist("Deutschland-Flachland (51-54.5 N, 6-14 O)", [r for r in rows if 51 <= r[4] <= 54.5 and 6 <= r[5] <= 14])
    for cs_ in (0.25, 0.5, 1.0):
        dist(f"Zellgröße {cs_}°", [r for r in rows if abs((r[6] or 0) - cs_) < 1e-6])


def forecast_for(cur, dest_id):
    cur.execute(
        """SELECT d.name, d.country_code, d.lat, d.lon, d.elevation, g.elevation, g.source, g.tz,
                  f.start_date, f.temp_max, f.primary_until, g.lat, g.lon
           FROM destinations d JOIN weather_grid g USING (grid_id) JOIN weather_forecasts f USING (grid_id)
           WHERE d.destination_id = %s""",
        (dest_id,),
    )
    return cur.fetchone()


def om_point(lat, lon, elev, tz):
    q = urllib.parse.urlencode({
        "latitude": lat, "longitude": lon, "elevation": elev if elev is not None else "nan",
        "daily": "temperature_2m_max", "timezone": tz or "auto", "forecast_days": 3,
    })
    j = json.loads(get(f"https://api.open-meteo.com/v1/forecast?{q}"))
    return dict(zip(j["daily"]["time"], j["daily"]["temperature_2m_max"]))


def metno_point(lat, lon, elev, tz):
    q = urllib.parse.urlencode({"lat": round(lat, 4), "lon": round(lon, 4), **({"altitude": int(elev)} if elev is not None else {})})
    j = json.loads(get(f"https://api.met.no/weatherapi/locationforecast/2.0/compact?{q}"))
    zone = ZoneInfo(tz) if tz else ZoneInfo("UTC")
    out: dict[str, float] = {}
    for ts in j["properties"]["timeseries"]:
        t = datetime.fromisoformat(ts["time"].replace("Z", "+00:00")).astimezone(zone)
        v = ts["data"]["instant"]["details"].get("air_temperature")
        if v is None:
            continue
        k = t.date().isoformat()
        out[k] = max(out.get(k, -99), v)
    return out


def part_b(cur):
    section("B) Stichprobe: Sunify (roh/korrigiert) vs. Open-Meteo-Punkt (Ortshöhe) vs. MET Norway")
    # Orte mit großer Korrektur, bekannte zuerst; Europa (feine Vergleichsdaten) plus einige weltweit
    cur.execute(
        """WITH c AS (
             SELECT d.destination_id, d.tourism_score, d.lat, d.lon,
                    (g.elevation - d.elevation) * 0.0065 AS k, g.source
             FROM destinations d JOIN weather_grid g USING (grid_id)
             WHERE d.elevation IS NOT NULL AND g.elevation IS NOT NULL AND d.tourism_score >= 45)
           (SELECT destination_id FROM c WHERE lat BETWEEN 43 AND 56 AND lon BETWEEN 2 AND 20 AND k >= 2
              ORDER BY tourism_score DESC LIMIT 14)
           UNION ALL
           (SELECT destination_id FROM c WHERE lat BETWEEN 43 AND 56 AND lon BETWEEN 2 AND 20 AND k <= -2
              ORDER BY tourism_score DESC LIMIT 14)
           UNION ALL
           (SELECT destination_id FROM c WHERE NOT (lat BETWEEN 43 AND 56 AND lon BETWEEN 2 AND 20) AND abs(k) >= 2
              ORDER BY tourism_score DESC LIMIT 12)
           UNION ALL
           (SELECT destination_id FROM c WHERE lat BETWEEN 43 AND 56 AND lon BETWEEN 2 AND 20 AND abs(k) < 0.3
              ORDER BY tourism_score DESC LIMIT 6)"""
    )
    ids = [r[0] for r in cur.fetchall()]
    stats = {"roh_om": [], "korr_om": [], "roh_met": [], "korr_met": []}
    stats_by = {"warm": {"roh": [], "korr": []}, "kalt": {"roh": [], "korr": []}}
    print(f"{'Ort':<26}{'Land':<5}{'Höhe':>6}{'Raster':>7}{'K°C':>6} {'Quelle':<10}{'Tag':<11}"
          f"{'roh':>6}{'korr':>6}{'OM-Pkt':>7}{'MET':>6}")
    for did in ids:
        row = forecast_for(cur, did)
        if not row:
            continue
        name, cc, lat, lon, elev, gelev, src, tz, start, tmax, prim, glat, glon = row
        k = corr(gelev, elev)
        try:
            om = om_point(lat, lon, elev, tz)
        except Exception as e:  # noqa: BLE001
            om = {}
            print(f"  Open-Meteo-Fehler {name}: {e}")
        try:
            met = metno_point(lat, lon, elev, tz)
        except Exception as e:  # noqa: BLE001
            met = {}
            print(f"  MET-Fehler {name}: {e}")
        time.sleep(0.3)
        today = datetime.now(ZoneInfo(tz) if tz else ZoneInfo("UTC")).date()
        for day in (today, today + timedelta(days=1)):
            i = (day - start).days
            if i < 0 or i >= len(tmax) or tmax[i] is None:
                continue
            raw = float(tmax[i])
            cor = raw + k
            o = om.get(day.isoformat())
            m = met.get(day.isoformat()) if day != today else None  # MET: heutiger Rest-Tag unvollständig
            src_day = "OM" if (src == "open-meteo" and prim and day <= prim) else "GFS"
            print(f"{name[:25]:<26}{cc:<5}{elev:>6}{gelev:>7}{k:>6.1f} {src_day:<10}{day.isoformat():<11}"
                  f"{raw:>6.1f}{cor:>6.1f}{(o if o is not None else float('nan')):>7.1f}{(m if m is not None else float('nan')):>6.1f}")
            if o is not None:
                stats["roh_om"].append(abs(raw - o))
                stats["korr_om"].append(abs(cor - o))
                grp = "warm" if k > 0 else "kalt"
                if abs(k) >= 2:
                    stats_by[grp]["roh"].append(raw - o)
                    stats_by[grp]["korr"].append(cor - o)
            if m is not None:
                stats["roh_met"].append(abs(raw - m))
                stats["korr_met"].append(abs(cor - m))

    def mean(x):
        return statistics.mean(x) if x else float("nan")

    print("\nMittlere absolute Abweichung (°C):")
    print(f"  gegen Open-Meteo-Punkt:  roh {mean(stats['roh_om']):.2f}   korrigiert {mean(stats['korr_om']):.2f}   (n={len(stats['roh_om'])})")
    print(f"  gegen MET Norway:        roh {mean(stats['roh_met']):.2f}   korrigiert {mean(stats['korr_met']):.2f}   (n={len(stats['roh_met'])})")
    for grp, lab in (("warm", "Talorte (K > +2)"), ("kalt", "Höhenorte (K < -2)")):
        r, c = stats_by[grp]["roh"], stats_by[grp]["korr"]
        print(f"  {lab:<20} mittlerer Fehler gegen OM-Punkt: roh {mean(r):+.2f}  korrigiert {mean(c):+.2f}  (n={len(r)})")


def regress(points):
    xs = [p[0] for p in points]
    ys = [p[1] for p in points]
    mx, my = statistics.mean(xs), statistics.mean(ys)
    sxx = sum((x - mx) ** 2 for x in xs)
    slope = sum((x - mx) * (y - my) for x, y in zip(xs, ys)) / sxx
    return slope * 100  # °C pro 100 m


def ours_near(cur, lat, lon, day):
    """Sunify-Wert (roh/korrigiert) für den nächsten Ort im Umkreis von 12 km um die Station."""
    cur.execute(
        """SELECT d.name, d.elevation, g.elevation, f.start_date, f.temp_max
           FROM destinations d JOIN weather_grid g USING (grid_id) JOIN weather_forecasts f USING (grid_id)
           WHERE ST_DWithin(d.geom, ST_MakePoint(%s, %s)::geography, 12000)
           ORDER BY d.geom <-> ST_MakePoint(%s, %s)::geography LIMIT 1""",
        (lon, lat, lon, lat),
    )
    r = cur.fetchone()
    if not r:
        return None
    name, elev, gelev, start, tmax = r
    i = (day - start).days
    if i < 0 or i >= len(tmax) or tmax[i] is None:
        return None
    k = corr(gelev, elev)
    return name, elev, float(tmax[i]), float(tmax[i]) + k


def part_c(cur):
    section("C) Beobachtungen jetzt: Temperatur gegen Stationshöhe (Inversion?)")
    # MeteoSchweiz: aktuelle 10-Minuten-Werte aller Stationen inkl. Höhe
    try:
        raw = get("https://data.geo.admin.ch/ch.meteoschweiz.messwerte-lufttemperatur-10min/ch.meteoschweiz.messwerte-lufttemperatur-10min_de.csv").decode("latin-1")
        rdr = csv.reader(io.StringIO(raw), delimiter=";")
        header = next(rdr)
        print("MeteoSchweiz-Spalten:", header[:10])
        hi = {h.strip().lower(): i for i, h in enumerate(header)}
        def col(*names):
            for n in names:
                for h, i in hi.items():
                    if n in h:
                        return i
            return None
        i_name, i_t, i_alt, i_time = col("station"), col("lufttemperatur", "°c", "wert"), col("höhe", "hoehe", "altitude", "stationshöhe"), col("zeit", "messdatum", "datum")
        pts = []
        sample = []
        for r in rdr:
            try:
                t = float(r[i_t]); alt = float(r[i_alt].replace("m", "").strip())
            except Exception:  # noqa: BLE001
                continue
            pts.append((alt, t)); sample.append((alt, t, r[i_name] if i_name is not None else "?", r[i_time] if i_time is not None else ""))
        if pts:
            low = [p for p in pts if p[0] < 800]
            mid = [p for p in pts if 800 <= p[0] < 1600]
            high = [p for p in pts if p[0] >= 1600]
            print(f"Stationen: {len(pts)}  Zeitpunkt: {sample[0][3]}")
            print(f"  Gradient gesamt:         {regress(pts):+.2f} °C/100 m  (Standard-Annahme: -0.65)")
            if len(low) > 3 and len(mid) > 3:
                print(f"  Gradient < 1600 m:       {regress(low + mid):+.2f} °C/100 m")
            for lab, grp in (("< 800 m", low), ("800-1600 m", mid), (">= 1600 m", high)):
                if grp:
                    print(f"  Mittel {lab:<11} {statistics.mean(p[1] for p in grp):6.1f} °C  (mittl. Höhe {statistics.mean(p[0] for p in grp):5.0f} m, n={len(grp)})")
            for alt, t, n, _ in sorted(sample)[:: max(1, len(sample) // 25)]:
                print(f"    {n[:28]:<29}{alt:>6.0f} m {t:6.1f} °C")
    except Exception as e:  # noqa: BLE001
        print("MeteoSchweiz nicht verfügbar:", e)

    # DWD über Bright Sky: Paare Tal/Berg, heute bis jetzt und gestern ganzer Tag
    pairs = [
        ("Garmisch-Partenkirchen", 47.483, 11.062, "Zugspitze", 47.421, 10.985),
        ("Oberstdorf", 47.398, 10.276, "Hohenpeißenberg", 47.801, 11.010),
        ("Freiburg", 48.023, 7.834, "Feldberg/Schwarzwald", 47.875, 8.004),
        ("Chemnitz", 50.791, 12.872, "Fichtelberg", 50.428, 12.954),
        ("Wernigerode", 51.845, 10.769, "Brocken", 51.799, 10.618),
        ("Regensburg", 49.042, 12.102, "Großer Arber", 49.113, 13.134),
    ]
    today = datetime.now(ZoneInfo("Europe/Berlin")).date()
    print("\nDWD-Stationen (Bright Sky): Tageshöchstwert gestern / heute bis jetzt")
    for a in pairs:
        for name, lat, lon in ((a[0], a[1], a[2]), (a[3], a[4], a[5])):
            try:
                q = urllib.parse.urlencode({"lat": lat, "lon": lon, "date": (today - timedelta(days=1)).isoformat(),
                                            "last_date": (today + timedelta(days=1)).isoformat(), "tz": "Europe/Berlin",
                                            "max_dist": 15000})
                j = json.loads(get(f"https://api.brightsky.dev/weather?{q}"))
                src = {s["id"]: s for s in j.get("sources", [])}
                by: dict[str, float] = {}
                st = ""
                for w in j.get("weather", []):
                    s = src.get(w.get("source_id"), {})
                    if s.get("observation_type") not in ("historical", "current", "synop"):
                        continue
                    st = f"{s.get('station_name', '?')} {s.get('height', '?')} m"
                    if w.get("temperature") is None:
                        continue
                    k = w["timestamp"][:10]
                    by[k] = max(by.get(k, -99), w["temperature"])
                y, t = by.get((today - timedelta(days=1)).isoformat()), by.get(today.isoformat())
                ours = ours_near(cur, lat, lon, today)
                o = f"  | Sunify heute ({ours[0][:16]}, {ours[1]} m): roh {ours[2]:5.1f} korr {ours[3]:5.1f}" if ours else ""
                print(f"  {name:<24} {st:<38} gestern max {y if y is not None else float('nan'):5.1f}  heute max {t if t is not None else float('nan'):5.1f}{o}")
            except Exception as e:  # noqa: BLE001
                print(f"  {name}: Fehler {e}")
            time.sleep(0.3)


def main():
    print("Auswertung Höhenkorrektur –", datetime.now(ZoneInfo("Europe/Berlin")).isoformat(timespec="minutes"))
    with connect() as conn, conn.cursor() as cur:
        part_a(cur)
        part_b(cur)
        part_c(cur)


if __name__ == "__main__":
    sys.exit(main())
