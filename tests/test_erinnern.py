#!/usr/bin/env python3
"""
Prueft den Erinnerungsdienst (echter Server).

WARUM ES DIESEN TEST GIBT

Beim Einrichten rief der Zeitplan in der Datenbank eine Funktion auf, die
es nicht gibt: extensions.http_post() statt net.http_post(). Der Auftrag
lief alle fuenf Minuten an und scheiterte jedes Mal - und meldete sich bei
niemandem. Es waere einfach nie eine Erinnerung gekommen.

Das ist die unangenehmste Sorte Fehler: einer, der wie Abwesenheit
aussieht. Man haette gedacht, man habe keine Erinnerung gestellt, und
haette nach dem Fehler nie gesucht.

Seitdem hinterlaesst jeder Lauf eine Spur, und dieser Test liest sie. Er
braucht dafuer keine Sonderrechte - das Lebenszeichen ist oeffentlich und
verraet nichts ausser der Zahl der Sekunden seit dem letzten Lauf.

Aufruf:  python3 tests/test_erinnern.py
"""

import json
import sys
import urllib.error
import urllib.request

URL = "https://copydwpdqpnwjvknsakz.supabase.co"
OEFFENTLICH = "sb_publishable_d7pxVkeMCqwhFsLrupDovA_ag2SmffE"

# Der Zeitplan laeuft alle fuenf Minuten. Bis zu einer Viertelstunde
# Rueckstand ist normal - zwei ausgelassene Laeufe koennen vorkommen,
# etwa wenn die Datenbank gerade neu gestartet ist.
GRENZE_SEKUNDEN = 900

fehler = []
bereich = ""


def abschnitt(titel):
    global bereich
    bereich = titel
    print("\n" + titel)


def pruefe(was, bedingung, zusatz=""):
    print(("  OK   " if bedingung else "  FEHL ") + was
          + (("  -> " + zusatz) if zusatz else ""))
    if not bedingung:
        fehler.append(bereich + " / " + was)


def rufen(pfad, felder=None):
    daten = json.dumps(felder if felder is not None else {}).encode("utf-8")
    anfrage = urllib.request.Request(
        URL + pfad, data=daten,
        headers={"apikey": OEFFENTLICH,
                 "Authorization": "Bearer " + OEFFENTLICH,
                 "Content-Type": "application/json"},
        method="POST")
    try:
        with urllib.request.urlopen(anfrage, timeout=25) as antwort:
            return antwort.status, antwort.read().decode("utf-8")
    except urllib.error.HTTPError as ausnahme:
        return ausnahme.code, ausnahme.read().decode("utf-8")


# ---------------------------------------------------------------------------
abschnitt("1. Der Erinnerungsdienst laeuft ueberhaupt")

lage, roh = rufen("/rest/v1/rpc/erinnerungen_laufen")
pruefe("das Lebenszeichen ist abrufbar", lage == 200, "HTTP %d" % lage)

sekunden = None
if lage == 200:
    stand = json.loads(roh)
    sekunden = stand.get("sekunden")
    pruefe("es enthaelt eine Zahl", isinstance(sekunden, int),
           "sekunden=%r" % (sekunden,))

if isinstance(sekunden, int):
    pruefe("der letzte Lauf ist hoechstens %d Minuten her" % (GRENZE_SEKUNDEN // 60),
           0 <= sekunden <= GRENZE_SEKUNDEN,
           "vor %d Sek. (%d Min.)" % (sekunden, round(sekunden / 60)))
    # Eine negative Zahl hiesse, die Datenbankuhr laeuft rueckwaerts.
    pruefe("und liegt nicht in der Zukunft", sekunden >= 0)


# ---------------------------------------------------------------------------
abschnitt("2. Die Erinnerungsfunktion laesst nur Berechtigte durch")

lage, roh = rufen("/functions/v1/erinnern", {})
pruefe("ohne Geheimnis: abgewiesen", lage == 403, "HTTP %d" % lage)

lage, roh = rufen("/functions/v1/erinnern", {"geheimnis": "falsch"})
pruefe("mit falschem Geheimnis: abgewiesen", lage == 403, "HTTP %d" % lage)

# Ein Geheimnis der richtigen LAENGE, aber falschem Inhalt - damit die
# Pruefung nicht nur an der Laenge haengt.
lage, roh = rufen("/functions/v1/erinnern", {"geheimnis": "X" * 43})
pruefe("auch bei richtiger Laenge", lage == 403, "HTTP %d" % lage)


# ---------------------------------------------------------------------------
abschnitt("3. An die Raeume kommt von aussen niemand heran")

"""
Die Erinnerungsfunktion liest ALLE Raeume - das muss sie, sonst koennte
sie nicht fuer jeden erinnern. Genau deshalb darf die Abfrage dahinter
nicht offenstehen: mit ihr saehe jeder Besucher der Seite jede Notiz
jedes Nutzers.
"""
for name in ("erinnerungen_raeume", "erinnerung_merken",
             "erinnerung_lauf_merken", "erinnerungen_aufraeumen",
             "push_geraete_lesen_hash"):
    lage, roh = rufen("/rest/v1/rpc/" + name, {})
    pruefe("%s ist fuer aussen gesperrt" % name, lage >= 400,
           "HTTP %d" % lage)


# ---------------------------------------------------------------------------
abschnitt("4. Das Lebenszeichen verraet nichts")

lage, roh = rufen("/rest/v1/rpc/erinnerungen_laufen")
if lage == 200:
    felder = sorted(json.loads(roh).keys())
    pruefe("es stehen nur zwei Felder drin", felder == ["sekunden", "zuletztGefunden"],
           str(felder))
    for verdaechtig in ("raum", "code", "endpunkt", "text", "titel", "inhalt"):
        pruefe("kein Feld '%s'" % verdaechtig, verdaechtig not in roh.lower())


# ---------------------------------------------------------------------------
print("")
if fehler:
    print("FEHLGESCHLAGEN (%d):" % len(fehler))
    for eintrag in fehler:
        print("  - " + eintrag)
    sys.exit(1)
print("ALLE TESTS BESTANDEN")
