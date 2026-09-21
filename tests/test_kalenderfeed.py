#!/usr/bin/env python3
# -*- coding: utf-8 -*-
"""
Prueft den Kalender-Feed, den die Apple Kalender App abonniert.

Gegen den echten Server, nicht gegen eine Attrappe. Eine Kalenderdatei ist
streng formatiert, und die Kalender App sagt nicht, was ihr nicht passt -
sie zeigt den Kalender einfach leer an oder laesst einzelne Termine weg.
Ein Formfehler faellt also nicht auf, er macht nur, dass etwas fehlt.

Die drei Stellen, an denen es typischerweise schiefgeht:

  1. Maskierung. Komma und Semikolon trennen in einer Kalenderdatei
     Felder. "Essen mit Mama, Papa" waere ohne Maskierung zwei Eintraege.

  2. Zeilenlaenge. Die Norm erlaubt 75 OKTETT, nicht 75 Zeichen. Wer nach
     Zeichen zaehlt, zerschneidet irgendwann einen Umlaut mittendrin - und
     im Kalender steht ein Fragezeichen oder die Datei ist unlesbar.

  3. Das Ende eines ganztaegigen Termins ist AUSSCHLIESSEND. Ein Termin am
     25. endet am 26. Wer denselben Tag einsetzt, bekommt einen Termin
     ohne Dauer, den manche Kalender gar nicht anzeigen.

Aufruf:  python3 tests/test_kalenderfeed.py
"""

import json
import sys
import urllib.error
import urllib.request

URL = "https://copydwpdqpnwjvknsakz.supabase.co"
OEFFENTLICH = "sb_publishable_d7pxVkeMCqwhFsLrupDovA_ag2SmffE"
TESTRAUM = "TESTLAUFKALENDERFEEDPRUEFUNG"

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


def schreiben(inhalt):
    anfrage = urllib.request.Request(
        URL + "/rest/v1/rpc/dashboard_schreiben",
        data=json.dumps({"schluessel": TESTRAUM, "neuer_inhalt": inhalt,
                         "erwartete_fassung": fassung_holen()}).encode("utf-8"),
        headers={"apikey": OEFFENTLICH, "Authorization": "Bearer " + OEFFENTLICH,
                 "Content-Type": "application/json"},
        method="POST")
    with urllib.request.urlopen(anfrage, timeout=25) as antwort:
        return json.loads(antwort.read().decode("utf-8"))


def fassung_holen():
    anfrage = urllib.request.Request(
        URL + "/rest/v1/rpc/dashboard_lesen",
        data=json.dumps({"schluessel": TESTRAUM}).encode("utf-8"),
        headers={"apikey": OEFFENTLICH, "Authorization": "Bearer " + OEFFENTLICH,
                 "Content-Type": "application/json"},
        method="POST")
    with urllib.request.urlopen(anfrage, timeout=25) as antwort:
        return json.loads(antwort.read().decode("utf-8")).get("fassung", 0)


def feed_holen(code=TESTRAUM):
    anfrage = urllib.request.Request(
        URL + "/functions/v1/kalender?code=" + code, method="GET")
    try:
        with urllib.request.urlopen(anfrage, timeout=30) as antwort:
            return antwort.status, antwort.read(), dict(antwort.headers)
    except urllib.error.HTTPError as ausnahme:
        return ausnahme.code, ausnahme.read(), dict(ausnahme.headers)


# ---------------------------------------------------------------------------
abschnitt("1. Ohne gueltigen Code kommt nichts heraus")

for code, name in [("", "ein leerer"), ("kurz", "ein zu kurzer")]:
    lage, roh, _ = feed_holen(code)
    pruefe(name + " Code wird abgewiesen", lage == 403)


# ---------------------------------------------------------------------------
abschnitt("2. Testdaten ablegen")

"""
Der Titel des Urlaubs ist mit Absicht so gebaut, dass die Faltung der
Zeile mitten in einen Umlaut geraten WUERDE, wenn nach Zeichen statt nach
Oktett gezaehlt wird. Jedes "ü" braucht zwei Byte; die Zeile ist so lang,
dass der Schnitt genau dort landet.
"""
LANGER_TITEL = ("Urlaub in Oesterreich mit Gruessen und Kuessen "
                + "üüüüüüüüüüüüüüüüüüüüüüüüüüüüüü an alle")

inhalt = {"v": 2, "eintraege": {
    "termin-a": {"art": "termin", "titel": "Zahnarzt",
                 "start": "2026-09-25T14:00", "ende": "2026-09-25T15:00",
                 "ganztags": False, "ort": "Praxis Dr. Meier",
                 "notiz": "Karte mitnehmen", "wichtig": False,
                 "geaendert": 1789900000000},
    "termin-b": {"art": "termin", "titel": "Essen mit Mama, Papa; und Oma",
                 "start": "2026-09-26T19:30", "ende": "2026-09-26T22:00",
                 "ganztags": False, "ort": "", "notiz": "Zeile eins\nZeile zwei",
                 "wichtig": True, "geaendert": 1789900000000},
    "termin-c": {"art": "termin", "titel": LANGER_TITEL,
                 "start": "2026-10-20T00:00", "ende": "2026-10-24T23:59",
                 "ganztags": True, "ort": "", "notiz": "",
                 "wichtig": False, "geaendert": 1789900000000},
    "eigen-offen": {"art": "aufgabe", "text": "Hausarbeit abgeben",
                    "datum": "2026-09-30", "erledigt": False, "wichtig": True,
                    "geaendert": 1789900000000},
    "eigen-fertig": {"art": "aufgabe", "text": "Schon erledigt",
                     "datum": "2026-09-29", "erledigt": True, "wichtig": False,
                     "geaendert": 1789900000000},
    "sked.notiz": {"art": "notiz", "text": "Notiz an einer Vorlesung",
                   "erledigt": False, "wichtig": False, "geaendert": 1789900000000},
    "termin-tot": {"geloescht": True, "geaendert": 1789900000000},
}}

antwort = schreiben(inhalt)
pruefe("die Testdaten liegen in der Ablage", antwort.get("erfolg") is True)

lage, roh, kopfzeilen = feed_holen()
pruefe("der Feed antwortet", lage == 200)
pruefe("und zwar als Kalenderdatei",
       "text/calendar" in kopfzeilen.get("Content-Type", ""))

text = roh.decode("utf-8")
zeilen = text.split("\r\n")


# ---------------------------------------------------------------------------
abschnitt("3. Der Aufbau stimmt")

pruefe("Zeilen enden mit CRLF, wie die Norm verlangt",
       "\r\n" in text and text.count("\n") == text.count("\r\n"))
pruefe("beginnt mit BEGIN:VCALENDAR", zeilen[0] == "BEGIN:VCALENDAR")
pruefe("endet mit END:VCALENDAR", zeilen[-2] == "END:VCALENDAR")
pruefe("BEGIN und END sind ausgeglichen",
       text.count("BEGIN:") == text.count("END:"))
pruefe("die Zeitzone ist dabei", "TZID:Europe/Berlin" in text)
pruefe("der Kalender hat einen Namen", "X-WR-CALNAME:" in text)


# ---------------------------------------------------------------------------
abschnitt("4. Zeilenlaenge in OKTETT, nicht in Zeichen")

zu_lang = [z for z in zeilen if len(z.encode("utf-8")) > 75]
pruefe("keine Zeile ist laenger als 75 Oktett", not zu_lang)
for z in zu_lang[:3]:
    print("         %d Oktett: %s" % (len(z.encode("utf-8")), z[:60]))

# Und der eigentliche Punkt: die Datei ist ueberhaupt lesbar.
try:
    roh.decode("utf-8")
    pruefe("die Datei ist gueltiges UTF-8 (kein Umlaut zerschnitten)", True)
except UnicodeDecodeError as ausnahme:
    pruefe("die Datei ist gueltiges UTF-8 (kein Umlaut zerschnitten): "
           + str(ausnahme), False)

# Gefaltete Zeilen wieder zusammensetzen, wie ein Kalender es taete.
entfaltet = text.replace("\r\n ", "")
pruefe("der lange Titel steht nach dem Entfalten vollstaendig da",
       LANGER_TITEL.replace(",", "\\,") in entfaltet)


# ---------------------------------------------------------------------------
abschnitt("5. Sonderzeichen sind maskiert")

pruefe("das Komma ist maskiert", "Mama\\, Papa" in entfaltet)
pruefe("das Semikolon ist maskiert", "Papa\\; und Oma" in entfaltet)
pruefe("der Zeilenumbruch ist maskiert", "Zeile eins\\nZeile zwei" in entfaltet)

# Gegenprobe: ein UNmaskiertes Komma im Titel waere ein Fehler.
for zeile in entfaltet.split("\r\n"):
    if zeile.startswith("SUMMARY:") and "Mama" in zeile:
        ohne_maskierung = zeile.replace("\\,", "").replace("\\;", "")
        pruefe("im Titel steht kein unmaskiertes Komma",
               "," not in ohne_maskierung)


# ---------------------------------------------------------------------------
abschnitt("6. Was hineingehoert und was nicht")

pruefe("der Zahnarzttermin ist dabei", "SUMMARY:Zahnarzt" in entfaltet)
pruefe("die offene Aufgabe ist dabei", "Hausarbeit abgeben" in entfaltet)
pruefe("die ERLEDIGTE Aufgabe ist NICHT dabei", "Schon erledigt" not in entfaltet)
pruefe("eine Notiz an einer Vorlesung gehoert nicht in den Kalender",
       "Notiz an einer Vorlesung" not in entfaltet)
pruefe("ein geloeschter Eintrag ebenso wenig", "termin-tot" not in entfaltet)
pruefe("Wichtiges bekommt einen Stern", "SUMMARY:★" in entfaltet)


# ---------------------------------------------------------------------------
abschnitt("7. Zeiten und ganztaegige Termine")

pruefe("ein Termin mit Uhrzeit haengt an der Zeitzone",
       "DTSTART;TZID=Europe/Berlin:20260925T140000" in entfaltet)
pruefe("mit passendem Ende",
       "DTEND;TZID=Europe/Berlin:20260925T150000" in entfaltet)

"""
Der Urlaub geht vom 20. bis zum 24. Oktober. In einer Kalenderdatei wird
das Ende AUSSCHLIESSEND angegeben - also der 25.
"""
pruefe("ein ganztaegiger Termin beginnt als reines Datum",
       "DTSTART;VALUE=DATE:20261020" in entfaltet)
pruefe("und endet einen Tag nach dem letzten (ausschliessend)",
       "DTEND;VALUE=DATE:20261025" in entfaltet)

pruefe("jeder Termin hat eine eindeutige Kennung",
       entfaltet.count("UID:") == entfaltet.count("BEGIN:VEVENT"))
pruefe("und einen Zeitstempel",
       entfaltet.count("DTSTAMP:") == entfaltet.count("BEGIN:VEVENT"))

anzahl = entfaltet.count("BEGIN:VEVENT")
pruefe("drei Termine und eine offene Aufgabe (%d)" % anzahl, anzahl == 4)


# ---------------------------------------------------------------------------
abschnitt("8. Der Code darf lesbar geschrieben werden")

# In die Kalender App tippt man den Code eher mit Bindestrichen.
lage, roh2, _ = feed_holen("TESTLAUF-KALENDER-FEED-PRUEFUNG")
pruefe("mit Bindestrichen kommt derselbe Kalender", lage == 200)
pruefe("und er ist nicht leer", b"BEGIN:VEVENT" in roh2)


# ---------------------------------------------------------------------------
abschnitt("9. Aufraeumen")

antwort = schreiben({"v": 2, "eintraege": {}})
pruefe("die Testdaten sind wieder weg", antwort.get("erfolg") is True)
lage, roh3, _ = feed_holen()
pruefe("der Feed ist jetzt leer", b"BEGIN:VEVENT" not in roh3)


# ---------------------------------------------------------------------------
print("")
if fehler:
    print("FEHLGESCHLAGEN (%d):" % len(fehler))
    for eintrag in fehler:
        print("  - " + eintrag)
    sys.exit(1)
print("ALLE TESTS BESTANDEN")
