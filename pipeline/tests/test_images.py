"""Auswahl nachgetragener Ortsfotos: Beispiele aus der Auswertung vom 17.11.2026 (echte Commons-Dateinamen)."""

import unittest

from pipeline.images import NOT_A_PHOTO, looks_like_view, name_in, pick, usable


def cand(file, license="CC BY-SA 4.0", width=2000, height=1300):
    return {"file": file, "license": license, "author": "x", "width": width, "height": height}


class FilterTest(unittest.TestCase):
    def test_keine_karten_wappen_grafiken(self):
        for f in ("Skidby UK parish locator map.svg", "Wappen Denklingen.png", "Coat of arms of Nava.svg", "Lage Bonaduz.gif"):
            self.assertTrue(NOT_A_PHOTO.search(f), f)
        self.assertFalse(NOT_A_PHOTO.search("Eglise Eastrington.jpg"))

    def test_unpassende_motive_fallen_weg(self):
        bad = [
            "ISS065-E-109310 - View of Earth.jpg",
            "Flor de calabacín en tempura y pisto manchego del restaurante granero.jpg",
            "Vitraux de l'église Saint-Germain (Savièse).jpg",
            "Bronzepferd St Märgen jm14971.jpg",
            "BMW 1802 Rallye Oldtimertreffen Röthenbach 2016.jpg",
            "Caldereta de Quintanar de la Orden - panoramio.jpg",
            "Hotel Central, Friedrichshafen (OW1A0325).jpg",
            "StMartinSontheimKreuzweg48.JPG",
            "Graffiti feito no beco LOVE-SINO-CADE Formosa GO - panoramio.jpg",
        ]
        for f in bad:
            self.assertFalse(usable(f, "CC BY-SA 4.0", 2000, 1300), f)

    def test_lizenz_und_format(self):
        self.assertFalse(usable("Ort.jpg", "All rights reserved", 2000, 1300))
        self.assertFalse(usable("Ort.jpg", "CC BY 4.0", 600, 400))  # zu klein
        self.assertFalse(usable("Ort.jpg", "CC BY 4.0", 1000, 1500))  # Hochformat
        self.assertTrue(usable("Ort.jpg", "CC0", 1000, 700))


class RelevanzTest(unittest.TestCase):
    def test_ortsname_im_dateinamen(self):
        self.assertTrue(name_in("View on Bernkastel - panoramio.jpg", "Bernkastel-Kues"))
        self.assertTrue(name_in("Fontiveros iglesia SCipriano 06.jpg", "Fontiveros"))
        self.assertTrue(name_in("Ansichten in Bad Berka (22).jpg", "Bad Berka"))
        self.assertFalse(name_in("Kindergarten Bommern.JPG", "Ebmatingen"))

    def test_sieht_nach_ortsansicht_aus(self):
        self.assertTrue(looks_like_view("Torre Cajetani vista da Trivigliano - panoramio.jpg", "Trivigliano"))
        self.assertTrue(looks_like_view("Römerswil 006 web.jpg", "Römerswil"))
        self.assertTrue(looks_like_view("Villanueva de Duero 2021.jpg", "Villanueva de Duero"))
        self.assertTrue(looks_like_view("Canencia iglesia frente.JPG", "Canencia"))
        self.assertFalse(looks_like_view("Killdeer Waterworks (53533752359).jpg", "Killdeer"))

    def test_pick_bevorzugt_ansicht_mit_ortsname(self):
        cands = [
            cand("ISS062-E-123100 - View of Earth.jpg", width=4000),
            cand("Ayuntamiento de Hontanares de Eresma.jpg", width=1200),
            cand("Hontanares de Eresma - panoramio.jpg", width=1600),
        ]
        self.assertEqual(pick(cands, "Hontanares de Eresma", require_name=True)["file"], "Hontanares de Eresma - panoramio.jpg")

    def test_umkreis_ohne_ortsname_kein_treffer(self):
        cands = [cand("Agnosine vista - panoramio.jpg")]
        self.assertIsNone(pick(cands, "Bione", require_name=True))
        self.assertIsNotNone(pick(cands, "Bione", require_name=False))  # Kategorie des Orts: Name nicht nötig


if __name__ == "__main__":
    unittest.main()
