"""Einmalige Auswertung: Wie viele Orte haben kein Foto, und welche zusätzlichen freien Quellen würden helfen?

Nur lesend. Läuft per GitHub Actions (Branch analyse-hoehe), Ergebnis im Log.
Geprüfte Quellen (alle frei, ohne Schlüssel, Lizenz pro Datei über Commons):
  1) weitere Wikidata-Bildeigenschaften: Wikivoyage-Banner (P948), Panorama (P4291), Luftbild (P8592),
     Nachtansicht (P3451), Collage (P2716)
  2) Titelbild des Wikipedia-Artikels (de/en, nur freie Bilder, ohne Wappen/Karten)
  3) Commons-Umkreissuche: Fotos mit Geokoordinate im Umkreis von 2 km um den Ort
"""
from __future__ import annotations

import json
import random
import re
import sys
import time
import urllib.parse
import urllib.request

from pipeline.db import connect

UA = "sunify-analysis/1.0 (github.com/JanKinitz/sunify)"
SPARQL = "https://query.wikidata.org/sparql"
COMMONS = "https://commons.wikimedia.org/w/api.php"
ALLOWED = re.compile(r"^(CC0|CC BY(-SA)?( \d\.\d)?|Public domain|PD.*)", re.I)
# Dateien, die kein Ortsfoto sind
NOT_A_PHOTO = re.compile(
    r"(wappen|coat[ _]of[ _]arms|blason|escudo|stemma|herb|flag|flagge|logo|map|karte|locator|lage|location|"
    r"plan|diagram|signature|unterschrift|grave|grab|portrait|porträt|svg$|\.png$|\.gif$|\.tif)",
    re.I,
)


def get(url: str, data: dict | None = None, timeout: int = 60):
    body = urllib.parse.urlencode(data).encode() if data else None
    req = urllib.request.Request(url, data=body, headers={"User-Agent": UA, "Accept": "application/json"})
    for attempt in range(3):
        try:
            with urllib.request.urlopen(req, timeout=timeout) as r:
                return json.loads(r.read())
        except Exception:  # noqa: BLE001
            if attempt == 2:
                raise
            time.sleep(3)


def section(t):
    print("\n" + "=" * 100 + f"\n{t}\n" + "=" * 100, flush=True)


def stats(cur):
    section("1) Fotos heute")
    cur.execute(
        """SELECT CASE WHEN tourism_score >= 60 THEN '60+' WHEN tourism_score >= 45 THEN '45-59'
                       WHEN tourism_score >= 40 THEN '40-44' WHEN tourism_score >= 35 THEN '35-39' ELSE '<35' END b,
                  count(*), count(image_file)
           FROM destinations GROUP BY 1 ORDER BY 1 DESC"""
    )
    for b, n, k in cur.fetchall():
        print(f"  Score {b:<6} Orte {n:>8,}  mit Foto {k:>7,}  ({100 * k / n:5.1f} %)")
    cur.execute(
        """SELECT CASE WHEN lat BETWEEN 35 AND 71 AND lon BETWEEN -11 AND 40 THEN 'Europa' ELSE 'Rest der Welt' END,
                  count(*), count(image_file) FROM destinations WHERE tourism_score >= 35 GROUP BY 1"""
    )
    for reg, n, k in cur.fetchall():
        print(f"  Score >= 35, {reg:<14} {n:>8,} Orte, mit Foto {100 * k / n:5.1f} %")


def sample(cur, n=240):
    cur.execute(
        """SELECT geoname_id, name, country_code, lat, lon, tourism_score FROM destinations
           WHERE image_file IS NULL AND tourism_score >= 35"""
    )
    rows = cur.fetchall()
    random.seed(7)
    eu = [r for r in rows if 35 <= r[3] <= 71 and -11 <= r[4] <= 40]
    rest = [r for r in rows if r not in eu]
    return random.sample(eu, min(n // 2, len(eu))) + random.sample(rest, min(n // 2, len(rest)))


def wikidata_extra(gids):
    q = """SELECT ?gn ?p18 ?banner ?pano ?aerial ?night ?collage ?de ?en WHERE {
      VALUES ?gn { %s } ?item wdt:P1566 ?gn .
      OPTIONAL { ?item wdt:P18 ?p18 } OPTIONAL { ?item wdt:P948 ?banner } OPTIONAL { ?item wdt:P4291 ?pano } OPTIONAL { ?item wdt:P8592 ?aerial }
      OPTIONAL { ?item wdt:P3451 ?night } OPTIONAL { ?item wdt:P2716 ?collage }
      OPTIONAL { ?de schema:about ?item ; schema:isPartOf <https://de.wikipedia.org/> }
      OPTIONAL { ?en schema:about ?item ; schema:isPartOf <https://en.wikipedia.org/> }
    }""" % " ".join(f'"{g}"' for g in gids)
    j = get(SPARQL, {"query": q, "format": "json"})
    out: dict[int, dict] = {}
    for b in j["results"]["bindings"]:
        g = int(b["gn"]["value"])
        d = out.setdefault(g, {})
        for k in ("p18", "banner", "pano", "aerial", "night", "collage"):
            if k in b and k not in d:
                d[k] = urllib.parse.unquote(b[k]["value"].rsplit("/", 1)[-1]).replace("_", " ")
        for k in ("de", "en"):
            if k in b and k not in d:
                d[k] = urllib.parse.unquote(b[k]["value"].rsplit("/", 1)[-1]).replace("_", " ")
    return out


def page_image(lang, title):
    j = get(f"https://{lang}.wikipedia.org/w/api.php", {
        "action": "query", "format": "json", "prop": "pageimages", "piprop": "name", "pilicense": "free", "titles": title,
    })
    for p in j.get("query", {}).get("pages", {}).values():
        name = p.get("pageimage")
        if name:
            return name.replace("_", " ")
    return None


def licenses(files):
    out = {}
    for i in range(0, len(files), 40):
        chunk = files[i:i + 40]
        j = get(COMMONS, {"action": "query", "format": "json", "prop": "imageinfo", "iiprop": "extmetadata|size",
                          "titles": "|".join("File:" + f for f in chunk)})
        for p in j.get("query", {}).get("pages", {}).values():
            ii = (p.get("imageinfo") or [{}])[0]
            lic = ((ii.get("extmetadata") or {}).get("LicenseShortName") or {}).get("value", "")
            out[p["title"][5:]] = (lic, ii.get("width", 0), ii.get("height", 0))
    return out


def geo_photo(lat, lon):
    j = get(COMMONS, {"action": "query", "format": "json", "generator": "geosearch", "ggscoord": f"{lat}|{lon}",
                      "ggsradius": 2000, "ggsnamespace": 6, "ggslimit": 40, "prop": "imageinfo",
                      "iiprop": "extmetadata|size"})
    cands = []
    for p in j.get("query", {}).get("pages", {}).values():
        name = p["title"][5:]
        ii = (p.get("imageinfo") or [{}])[0]
        lic = ((ii.get("extmetadata") or {}).get("LicenseShortName") or {}).get("value", "")
        w, h = ii.get("width", 0), ii.get("height", 0)
        if NOT_A_PHOTO.search(name) or not ALLOWED.match(lic) or w < 800 or h > w:
            continue
        cands.append((w * h, name, lic))
    cands.sort(reverse=True)
    return (cands[0][1], len(cands)) if cands else (None, 0)


def main():
    with connect() as conn, conn.cursor() as cur:
        stats(cur)
        smp = sample(cur)
    section(f"2) Stichprobe: {len(smp)} Orte ohne Foto (Score >= 35), halb Europa, halb Rest der Welt")
    extra = {}
    gids = [r[0] for r in smp]
    for i in range(0, len(gids), 80):
        extra.update(wikidata_extra(gids[i:i + 80]))
    hits = {"p18_schwelle": 0, "wikidata": 0, "wikipedia": 0, "commons_geo": 0, "gesamt": 0}
    by_region = {"Europa": [0, 0], "Rest": [0, 0]}
    examples = []
    for gid, name, cc, lat, lon, score in smp:
        region = "Europa" if 35 <= lat <= 71 and -11 <= lon <= 40 else "Rest"
        by_region[region][0] += 1
        e = extra.get(gid, {})
        found, how = None, None
        if "p18" in e:
            lic = licenses([e["p18"]]).get(e["p18"], ("",))
            if ALLOWED.match(lic[0]):
                found, how = e["p18"], "p18_schwelle"
        wd = [] if found else [e[k] for k in ("banner", "pano", "aerial", "night", "collage") if k in e]
        if wd and not found:
            lic = licenses(wd)
            ok = [f for f in wd if ALLOWED.match(lic.get(f, ("",))[0])]
            if ok:
                found, how = ok[0], "wikidata"
        if not found:
            for lang in ("de", "en"):
                if lang in e:
                    try:
                        f = page_image(lang, e[lang])
                    except Exception:  # noqa: BLE001
                        f = None
                    if f and not NOT_A_PHOTO.search(f):
                        lic = licenses([f]).get(f, ("", 0, 0))
                        if ALLOWED.match(lic[0]) and lic[1] >= 600:
                            found, how = f, "wikipedia"
                            break
        if not found:
            try:
                f, n = geo_photo(lat, lon)
            except Exception:  # noqa: BLE001
                f, n = None, 0
            if f:
                found, how = f, "commons_geo"
        if found:
            hits[how] += 1
            hits["gesamt"] += 1
            by_region[region][1] += 1
            if len(examples) < 60:
                examples.append((how, name, cc, score, found))
        time.sleep(0.2)
    n = len(smp)
    for k, v in hits.items():
        print(f"  {k:<12} {v:>4} von {n}  ({100 * v / n:4.1f} %)")
    for reg, (a, b) in by_region.items():
        print(f"  {reg:<8} {b} von {a} ({100 * b / max(a, 1):4.1f} %) bekämen ein Foto")
    section("3) Beispiele (Quelle, Ort, Land, Score, Datei)")
    for how, name, cc, score, f in examples:
        print(f"  {how:<12} {name[:28]:<29}{cc:<4}{score:>4}  https://commons.wikimedia.org/wiki/File:{urllib.parse.quote(f.replace(' ', '_'))}")


if __name__ == "__main__":
    sys.exit(main())
