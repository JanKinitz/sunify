"""Adaptives Wetter-Raster.

Grundidee: Es gibt nur dort Rasterpunkte, wo Orte liegen. Die Zellgröße richtet sich nach der Ortsdichte
und dem Höhenunterschied innerhalb eines 1°-Blocks:
  - 0,25° (~25 km): viele Orte (≥ 40) oder große Höhenunterschiede (≥ 800 m), z. B. Alpen, Ballungsräume
  - 0,5°  (~50 km): mittlere Dichte (≥ 8 Orte) oder Höhenunterschied ≥ 400 m
  - 1°    (~100 km): dünn besiedelte, flache Gebiete
Der Rasterpunkt einer Zelle liegt auf dem GFS-Knoten (0,25°) am nächsten zum gewichteten Mittelpunkt
ihrer Orte – also dort, wo die Orte sind, nicht auf einem zufälligen Gipfel. Seine Höhe ist die mittlere
Höhe dieser Orte und dient als Bezug für die Höhenkorrektur.
"""

from __future__ import annotations

import math
from collections import Counter
from dataclasses import dataclass

DENSE_COUNT, MEDIUM_COUNT = 40, 8
DENSE_RANGE, MEDIUM_RANGE = 800, 400


@dataclass
class GridPoint:
    lat: float
    lon: float
    cell_size: float
    elevation: int | None
    country: str
    utc_offset: int
    member_index: list[int]  # Indizes der zugeordneten Orte
    max_score: int = 0
    tz: str | None = None  # IANA-Zeitzone (häufigste der Orte), für Sommer-/Winterzeit


def _block_sizes(lats, lons, elevs) -> dict[tuple[int, int], float]:
    stats: dict[tuple[int, int], list] = {}
    for lat, lon, elev in zip(lats, lons, elevs):
        key = (math.floor(lat), math.floor(lon))
        s = stats.setdefault(key, [0, math.inf, -math.inf])
        s[0] += 1
        if elev is not None:
            s[1] = min(s[1], elev)
            s[2] = max(s[2], elev)
    sizes = {}
    for key, (count, lo, hi) in stats.items():
        rng = hi - lo if hi >= lo else 0
        if count >= DENSE_COUNT or rng >= DENSE_RANGE:
            sizes[key] = 0.25
        elif count >= MEDIUM_COUNT or rng >= MEDIUM_RANGE:
            sizes[key] = 0.5
        else:
            sizes[key] = 1.0
    return sizes


def _snap(value: float) -> float:
    return round(value * 4) / 4


def build_grid(lats, lons, elevs, pops, countries, offsets, scores, zones=None) -> tuple[list[GridPoint], list[int]]:
    """Liefert (Rasterpunkte, Rasterindex je Ort)."""
    n = len(lats)
    sizes = _block_sizes(lats, lons, elevs)
    cells: dict[tuple[float, int, int], list[int]] = {}
    for i in range(n):
        size = sizes[(math.floor(lats[i]), math.floor(lons[i]))]
        key = (size, math.floor(lats[i] / size), math.floor(lons[i] / size))
        cells.setdefault(key, []).append(i)

    points: list[GridPoint] = []
    by_node: dict[tuple[float, float], int] = {}
    assignment = [-1] * n
    for (size, _, _), members in cells.items():
        weights = [math.log10(pops[i] + 10) for i in members]
        wsum = sum(weights)
        clat = sum(lats[i] * w for i, w in zip(members, weights)) / wsum
        clon = sum(lons[i] * w for i, w in zip(members, weights)) / wsum
        node = (max(-90.0, min(90.0, _snap(clat))), _snap(clon))
        if node[1] >= 180:
            node = (node[0], node[1] - 360)
        if node in by_node:  # zwei Zellen auf demselben Knoten: zusammenlegen
            gp = points[by_node[node]]
            gp.member_index.extend(members)
            gp.cell_size = min(gp.cell_size, size)
        else:
            by_node[node] = len(points)
            points.append(GridPoint(node[0], node[1], size, None, "", 0, list(members)))

    for gi, gp in enumerate(points):
        ev = [(elevs[i], math.log10(pops[i] + 10)) for i in gp.member_index if elevs[i] is not None]
        gp.elevation = round(sum(e * w for e, w in ev) / sum(w for _, w in ev)) if ev else None
        gp.country = Counter(countries[i] for i in gp.member_index).most_common(1)[0][0]
        offs = sorted(offsets[i] for i in gp.member_index)
        gp.utc_offset = offs[len(offs) // 2]
        if zones is not None:
            gp.tz = Counter(zones[i] for i in gp.member_index).most_common(1)[0][0] or None
        gp.max_score = max(scores[i] for i in gp.member_index)
        for i in gp.member_index:
            assignment[i] = gi
    return points, assignment


# Zentraleuropa: hier liefert Open-Meteo (u. a. DWD ICON-D2/ICON-EU) feinere Prognosen
OPEN_METEO_BOX = {"lat_min": 43.0, "lat_max": 56.0, "lon_min": 2.0, "lon_max": 20.0}


def choose_open_meteo(points: list[GridPoint], max_points: int) -> set[int]:
    """Rasterpunkte in Zentraleuropa für Open-Meteo, bei Überschreitung des Tageskontingents die bekanntesten."""
    box = OPEN_METEO_BOX
    inside = [
        i
        for i, p in enumerate(points)
        if box["lat_min"] <= p.lat <= box["lat_max"] and box["lon_min"] <= p.lon <= box["lon_max"]
    ]
    inside.sort(key=lambda i: -points[i].max_score)
    return set(inside[:max_points])
