#!/usr/bin/env python3
# -*- coding: utf-8 -*-
"""
Prueft die Ablage hinter dem Geraeteabgleich - die echte, nicht eine Attrappe.

Warum gegen die echte Ablage? Weil genau hier die Fehler sitzen wuerden, die
eine Attrappe niemals zeigt: eine vergessene Berechtigung, ein Schema, das
doch veroeffentlicht wird, eine Sperre, die beim gleichzeitigen Schreiben
nicht greift. Eine nachgebaute Ablage haette all das per Definition richtig.

Der Gegenstueck-Test tests/test_abgleich.js prueft die Rechenseite im
Browser - das Zusammenfuehren zweier Staende. Zusammen decken beide den Weg
ab: hier die Leitung, dort die Logik.

Aufruf:  python3 tests/test_abgleich_ablage.py

Hinweis: der Test benutzt einen festen Testraum und ueberschreibt ihn bei
jedem Lauf. Er legt also nicht bei jedem Durchgang einen neuen an - sonst
liefe die Ablage mit der Zeit voll.
"""

import json
import sys
import urllib.error
import urllib.request

URL = "https://copydwpdqpnwjvknsakz.supabase.co"
# Darf oeffentlich sein - fuer sich genommen gibt er nichts frei.
# Die Begruendung steht im Kopf von sync.js.
OEFFENTLICH = "sb_publishable_d7pxVkeMCqwhFsLrupDovA_ag2SmffE"

# Feste Testraeume. Sie sind absichtlich als solche erkennbar und haben mit
# Friedrichs echtem Code nichts zu tun.
TESTRAUM = "TESTLAUF-DASHBOARD-ABGLEICH-A"
ZWEITER_RAUM = "TESTLAUF-DASHBOARD-ABGLEICH-B"

fehler = []
bereich = ""


def abschnitt(titel):
    global bereich
    bereich = titel
    print("\n" + titel)


def pruefe(was, bedingung):
    print(("  OK   " if bedingung else "  FEHL ") + was)
    if not bedingung:
        fehler.append(bereich + " / " + was)


def rufen(funktion, felder):
    """Ruft eine Datenbankfunktion auf. Gibt (erfolg, antwort) zurueck -
    ein Fehler ist hier oft das erwartete Ergebnis, deshalb kein Absturz."""
    anfrage = urllib.request.Request(
        URL + "/rest/v1/rpc/" + funktion,
        data=json.dumps(felder).encode("utf-8"),
        headers={
            "apikey": OEFFENTLICH,
            "Authorization": "Bearer " + OEFFENTLICH,
            "Content-Type": "application/json",
        },
        method="POST")
    try:
        with urllib.request.urlopen(anfrage, timeout=20) as antwort:
            roh = antwort.read().decode("utf-8")
            return True, (json.loads(roh) if roh else None)
    except urllib.error.HTTPError as ausnahme:
        return False, ausnahme.read().decode("utf-8")
    except Exception as ausnahme:                       # Netz weg, Zeitablauf
        return False, str(ausnahme)


def lesen(schluessel):
    return rufen("dashboard_lesen", {"schluessel": schluessel})


def schreiben(schluessel, inhalt, fassung):
    return rufen("dashboard_schreiben", {
        "schluessel": schluessel,
        "neuer_inhalt": inhalt,
        "erwartete_fassung": fassung,
    })


# ---------------------------------------------------------------------------
abschnitt("1. Ohne Geheimwort geht nichts")

for versuch, name in [("", "ein leeres"), ("kurz", "ein zu kurzes"),
                      ("NEUNZEHNZEICHENXYZ", "ein neunzehn Zeichen langes")]:
    geklappt, antwort = lesen(versuch)
    pruefe(name + " Geheimwort wird abgewiesen", not geklappt)

geklappt, antwort = lesen("ZWANZIGZEICHENLANGXY")
pruefe("zwanzig Zeichen werden angenommen", geklappt)


# ---------------------------------------------------------------------------
abschnitt("2. Ein unbekanntes Geheimwort liefert Leere, keinen Fehler")

# Wichtig fuer den ersten Start: das Geraet hat einen frischen Code und darf
# daran nicht scheitern.
geklappt, antwort = lesen("NIEBENUTZTESGEHEIMWORTXYZ")
pruefe("der Aufruf geht durch", geklappt)
if geklappt:
    pruefe("die Fassung ist 0", antwort.get("fassung") == 0)
    pruefe("und der Inhalt leer", antwort.get("inhalt") == {})


# ---------------------------------------------------------------------------
abschnitt("3. Schreiben und Zuruecklesen")

geklappt, vorher = lesen(TESTRAUM)
if not geklappt:
    pruefe("der Testraum liess sich lesen", False)
    sys.exit(1)

fassung = vorher.get("fassung", 0)

# Umlaute und Emoji ausdruecklich mit: der Weg fuehrt durch JSON, HTTP und
# Postgres. Wenn irgendwo eine Kodierung nicht stimmt, faellt es hier auf.
inhalt = {"v": 1, "eintraege": {
    "sked.pruef": {"art": "notiz", "text": "Grüße, Öl & Maß – 100 % ✓",
                   "erledigt": False, "wichtig": True, "geaendert": 1787500000000},
    "eigen-pruef": {"art": "aufgabe", "text": "Hausarbeit ausdrucken",
                    "datum": "2026-09-01", "erledigt": False,
                    "wichtig": False, "geaendert": 1787500000001},
}}

geklappt, antwort = schreiben(TESTRAUM, inhalt, fassung)
pruefe("das Schreiben klappt", geklappt and antwort.get("erfolg") is True)
neue_fassung = antwort.get("fassung") if geklappt else None
pruefe("die Fassung zaehlt hoch", neue_fassung == fassung + 1)

geklappt, zurueck = lesen(TESTRAUM)
pruefe("das Zuruecklesen klappt", geklappt)
if geklappt:
    pruefe("der Inhalt kommt unveraendert zurueck",
           zurueck.get("inhalt") == inhalt)
    pruefe("Umlaute und Emoji haben den Weg heil ueberstanden",
           zurueck["inhalt"]["eintraege"]["sked.pruef"]["text"]
           == "Grüße, Öl & Maß – 100 % ✓")


# ---------------------------------------------------------------------------
abschnitt("4. Zwei Geraete gleichzeitig: nichts wird ueberbuegelt")

"""
Der Fall, gegen den die Fassungsnummer schuetzt.

Laptop und Handy lesen beide denselben Stand. Der Laptop schreibt zuerst.
Schriebe das Handy jetzt einfach hinterher, waere die Aenderung des Laptops
weg - lautlos. Stattdessen muss die Ablage das Handy abweisen UND ihm den
aktuellen Stand mitgeben, damit es zusammenfuehren und es erneut versuchen
kann.
"""
geklappt, beide_lesen = lesen(TESTRAUM)
gemeinsame_fassung = beide_lesen["fassung"]

laptop = {"v": 1, "eintraege": {"vom-laptop": {"art": "notiz", "text": "Laptop",
                                              "geaendert": 1787500000100}}}
handy = {"v": 1, "eintraege": {"vom-handy": {"art": "notiz", "text": "Handy",
                                            "geaendert": 1787500000200}}}

geklappt, antwort_laptop = schreiben(TESTRAUM, laptop, gemeinsame_fassung)
pruefe("der Laptop kommt durch",
       geklappt and antwort_laptop.get("erfolg") is True)

geklappt, antwort_handy = schreiben(TESTRAUM, handy, gemeinsame_fassung)
pruefe("das Handy wird abgewiesen",
       geklappt and antwort_handy.get("erfolg") is False)
pruefe("und bekommt den aktuellen Stand mitgeliefert",
       geklappt and antwort_handy.get("inhalt") == laptop)
pruefe("samt der aktuellen Fassungsnummer",
       geklappt and antwort_handy.get("fassung") == gemeinsame_fassung + 1)

# Genau das braucht sync.js fuer den zweiten Anlauf. Er muss klappen.
zusammengefuehrt = {"v": 1, "eintraege": dict(laptop["eintraege"])}
zusammengefuehrt["eintraege"].update(handy["eintraege"])
geklappt, zweiter = schreiben(TESTRAUM, zusammengefuehrt,
                              antwort_handy.get("fassung"))
pruefe("der zweite Anlauf des Handys klappt",
       geklappt and zweiter.get("erfolg") is True)

geklappt, endstand = lesen(TESTRAUM)
pruefe("am Ende steht beides in der Ablage",
       geklappt
       and "vom-laptop" in endstand["inhalt"]["eintraege"]
       and "vom-handy" in endstand["inhalt"]["eintraege"])


# ---------------------------------------------------------------------------
abschnitt("5. Fremde Raeume sehen einander nicht")

geklappt, anderer = lesen(ZWEITER_RAUM)
fassung_b = anderer.get("fassung", 0)
schreiben(ZWEITER_RAUM, {"v": 1, "eintraege": {
    "geheim": {"art": "notiz", "text": "nur in Raum B", "geaendert": 1}}}, fassung_b)

geklappt, raum_a = lesen(TESTRAUM)
pruefe("Raum A weiss nichts von Raum B",
       geklappt and "geheim" not in raum_a["inhalt"].get("eintraege", {}))

geklappt, raum_b = lesen(ZWEITER_RAUM)
pruefe("und Raum B nichts von Raum A",
       geklappt and "vom-laptop" not in raum_b["inhalt"].get("eintraege", {}))


# ---------------------------------------------------------------------------
abschnitt("6. Die Ablage laesst sich nicht vollmuellen")

geklappt, antwort = rufen("dashboard_schreiben", {
    "schluessel": TESTRAUM,
    "neuer_inhalt": {"v": 1, "eintraege": {"gross": {"text": "x" * 500000}}},
    "erwartete_fassung": 0})
pruefe("ein halbes Megabyte wird abgelehnt", not geklappt)

geklappt, antwort = rufen("dashboard_schreiben", {
    "schluessel": TESTRAUM, "neuer_inhalt": "kein Objekt",
    "erwartete_fassung": 0})
pruefe("etwas anderes als ein Objekt ebenso", not geklappt)


# ---------------------------------------------------------------------------
abschnitt("7. An der Tabelle selbst kommt niemand vorbei")

"""
Der Kern der Absicherung. Der Schluessel oben steht oeffentlich im
Quelltext der Seite - er darf deshalb nicht ausreichen, um die Ablage
direkt auszulesen. Die Tabelle liegt in einem Schema, das die
Web-Schnittstelle gar nicht veroeffentlicht.
"""


def direkt(pfad, kopfzeilen=None):
    anfrage = urllib.request.Request(URL + "/rest/v1/" + pfad, method="GET")
    anfrage.add_header("apikey", OEFFENTLICH)
    for name, wert in (kopfzeilen or {}).items():
        anfrage.add_header(name, wert)
    try:
        with urllib.request.urlopen(anfrage, timeout=20) as antwort:
            return antwort.status, antwort.read().decode("utf-8")
    except urllib.error.HTTPError as ausnahme:
        return ausnahme.code, ausnahme.read().decode("utf-8")


lage, text = direkt("dashboard_stand?select=*")
pruefe("die Tabelle ist ueber die Web-Schnittstelle unsichtbar",
       lage >= 400 or "PGRST205" in text)

lage, text = direkt("dashboard_stand?select=*", {"Accept-Profile": "sync"})
pruefe("und auch nicht ueber das Schema anzusprechen",
       lage >= 400 or "PGRST106" in text)


# ---------------------------------------------------------------------------
abschnitt("8. Das Lebenszeichen antwortet")

# Es haelt das kostenlose Supabase-Projekt wach, siehe Workflow.
geklappt, antwort = rufen("dashboard_wach", {})
pruefe("dashboard_wach ist erreichbar", geklappt)


# ---------------------------------------------------------------------------
print("")
if fehler:
    print("FEHLGESCHLAGEN (" + str(len(fehler)) + "):")
    for eintrag in fehler:
        print("  - " + eintrag)
    sys.exit(1)
print("ALLE TESTS BESTANDEN")
