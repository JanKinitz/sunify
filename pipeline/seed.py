"""Richtet Orte und Wetter-Raster weltweit ein (setzt Orte, Raster UND Prognosen neu auf)."""

from __future__ import annotations

import os
import time

from . import geonames, wikidata
from .grid import build_grid, choose_open_meteo
from .scoring import apply_curated, derive_tags, score_place

OPEN_METEO_MAX_POINTS = int(os.environ.get("OPEN_METEO_MAX_POINTS", "8000"))
IMAGE_MIN_SCORE = int(os.environ.get("IMAGE_MIN_SCORE", "40"))


def log(msg: str) -> None:
    print(msg, flush=True)


def collect() -> dict:
    t0 = time.time()
    log("1/6 Orte laden (GeoNames cities1000)")
    places = geonames.load_places()
    log(f"   {len(places)} Orte")

    log("2/6 Regionen und deutsche/englische Namen")
    admin1 = geonames.load_admin1()
    admin_ids = {gid for _, gid in admin1.values()}
    names = geonames.load_names({p.geoname_id for p in places} | admin_ids)
    for p in places:
        n = names.get(p.geoname_id, {})
        p.name_de, p.name_en = n.get("de"), n.get("en")
    admin_names: dict[str, tuple[str, str | None, str | None]] = {}
    for code, (name, gid) in admin1.items():
        n = names.get(gid, {})
        admin_names[code] = (name, n.get("de"), n.get("en"))
    log(f"   {sum(1 for p in places if p.name_de)} deutsche, {sum(1 for p in places if p.name_en)} englische Namen")

    log("3/6 Bekanntheit, Fotos und Merkmale (Wikidata)")
    countries = sorted({p.country for p in places})
    wiki: dict[int, tuple[int, str | None]] = {}
    kinds: dict[int, set[str]] = {}
    failed = []
    for i, cc in enumerate(countries, 1):
        info, k, err = wikidata.fetch_country(cc)
        wiki.update(info)
        for gid, ks in k.items():
            kinds.setdefault(gid, set()).update(ks)
        if err:
            failed.append(cc)
        if i % 25 == 0:
            log(f"   {i}/{len(countries)} Länder")
    if failed:
        log(f"   Unvollständig für {len(failed)} Länder: {', '.join(failed[:30])}")

    log("4/6 Tourismus-Score und Merkmale")
    scores: dict[int, int] = {}
    for p in places:
        p.tags |= kinds.get(p.geoname_id, set())
        derive_tags(p)
        links, image = wiki.get(p.geoname_id, (0, None))
        scores[p.geoname_id] = score_place(p, links, image is not None)
    curated = apply_curated(places, scores)
    log(f"   {curated} handbewertete Ziele aus Version 1.0 übernommen")

    log("5/6 Bildnachweise (Wikimedia Commons)")
    files = sorted(
        {wiki[p.geoname_id][1] for p in places if p.geoname_id in wiki and wiki[p.geoname_id][1] and scores[p.geoname_id] >= IMAGE_MIN_SCORE}
    )
    credits = wikidata.fetch_image_credits(files)
    log(f"   {len(credits)} von {len(files)} Fotos mit freier Lizenz")

    return {
        "places": places,
        "admin_names": admin_names,
        "wiki": wiki,
        "scores": scores,
        "credits": credits,
        "stats": {
            "places": len(places),
            "countries": len(countries),
            "wikidata_failed": failed,
            "curated": curated,
            "images": len(credits),
            "collect_seconds": round(time.time() - t0),
        },
    }


def write(conn, data: dict) -> dict:
    places = data["places"]
    scores = data["scores"]
    log("6/6 Raster bauen und in die Datenbank schreiben")
    offsets = [geonames.utc_offset_hours(p.timezone) for p in places]
    points, assignment = build_grid(
        [p.lat for p in places],
        [p.lon for p in places],
        [p.elevation for p in places],
        [p.population for p in places],
        [p.country for p in places],
        offsets,
        [scores[p.geoname_id] for p in places],
    )
    om = choose_open_meteo(points, OPEN_METEO_MAX_POINTS)
    sizes = {s: sum(1 for g in points if g.cell_size == s) for s in (0.25, 0.5, 1.0)}
    log(f"   {len(points)} Rasterpunkte (0,25°: {sizes[0.25]}, 0,5°: {sizes[0.5]}, 1°: {sizes[1.0]}), davon {len(om)} über Open-Meteo")

    with conn.cursor() as cur:
        cur.execute("TRUNCATE weather_forecasts, destinations, weather_grid RESTART IDENTITY CASCADE")
        with cur.copy(
            "COPY weather_grid (grid_id, lat, lon, geom, cell_size, elevation, country_code, source, utc_offset) FROM STDIN"
        ) as cp:
            for gi, g in enumerate(points, 1):
                cp.write_row(
                    (gi, g.lat, g.lon, f"SRID=4326;POINT({g.lon} {g.lat})", g.cell_size, g.elevation, g.country,
                     "open-meteo" if gi - 1 in om else "gfs", g.utc_offset)
                )
        admin = data["admin_names"]
        wiki, credits = data["wiki"], data["credits"]
        with cur.copy(
            "COPY destinations (geoname_id, name, name_de, name_en, country_code, admin_region, admin_region_de, admin_region_en,"
            " lat, lon, geom, elevation, population, tourism_score, tags, image_file, image_author, image_license, grid_id) FROM STDIN"
        ) as cp:
            for i, p in enumerate(places):
                a_name, a_de, a_en = admin.get(f"{p.country}.{p.admin1}", (None, None, None))
                image = wiki.get(p.geoname_id, (0, None))[1]
                author, license_name = credits.get(image, (None, None)) if image else (None, None)
                if license_name is None:
                    image = None
                cp.write_row(
                    (p.geoname_id, p.name, p.name_de, p.name_en, p.country, a_name, a_de, a_en,
                     p.lat, p.lon, f"SRID=4326;POINT({p.lon} {p.lat})", p.elevation, p.population,
                     scores[p.geoname_id], sorted(p.tags), image, author, license_name, assignment[i] + 1)
                )
        cur.execute("SELECT setval('weather_grid_grid_id_seq', (SELECT MAX(grid_id) FROM weather_grid))")
    conn.commit()
    with conn.cursor() as cur:
        cur.execute("ANALYZE weather_grid")
        cur.execute("ANALYZE destinations")
    conn.commit()
    return {"grid_points": len(points), "cells": sizes, "open_meteo_points": len(om)}
