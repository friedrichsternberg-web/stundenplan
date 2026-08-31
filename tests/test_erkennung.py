#!/usr/bin/env python3
# -*- coding: utf-8 -*-
"""
Prueft, ob Aenderungen im Stundenplan noch zuverlaessig erkannt werden.

Das ist der urspruengliche Zweck des ganzen Projekts: nicht das Dashboard,
sondern die Meldung "der Raum hat sich geaendert" oder "die Vorlesung faellt
aus". Alles andere kann kaputtgehen und man merkt es beim Hinsehen. Wenn
DAS hier kaputtgeht, merkt man gar nichts - man verlaesst sich weiter auf
den Plan und steht vor dem falschen Raum.

Zwei Sorten Fehler drohen dabei, und die zweite ist die gefaehrlichere:

  1. Eine echte Aenderung wird nicht gemeldet.
  2. Aenderungen werden gemeldet, die es nicht gab.

Nummer 2 klingt harmlos, ist es aber nicht: der HWR-Server liefert immer nur
ein gleitendes Zeitfenster. Wuerde jedes Vorruecken dieses Fensters als
"neue Termine" und "entfallene Termine" gemeldet, kaemen bei jedem Lauf
dutzende Falschmeldungen - und die echte Aenderung ginge darin unter.

Aufruf:  python3 tests/test_erkennung.py
"""

import copy
import json
import os
import sys

sys.path.insert(0, os.path.dirname(os.path.dirname(os.path.abspath(__file__))))
import abgleich

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


def termin(kennung, start, raum="CL: 6A.206", titel="Testfach",
           dozent="Muster", anmerkung=""):
    return {
        "id": kennung, "start": start, "ende": start[:11] + "11:15",
        "art": "SU", "titel": titel, "dozent": dozent,
        "raum": raum, "anmerkung": anmerkung, "gruppe": "",
    }


# Ein Zeitfenster, in dem alles Folgende liegt.
VON = "2026-09-01T00:00"
BIS = "2026-12-31T23:59"


# ---------------------------------------------------------------------------
abschnitt("1. Ohne Aenderung wird nichts gemeldet")

plan = [termin("a", "2026-09-10T09:45"), termin("b", "2026-09-11T09:45")]
aenderungen = abgleich.plaene_vergleichen(plan, copy.deepcopy(plan), BIS, VON)
pruefe("ein unveraenderter Plan meldet nichts", aenderungen == [])


# ---------------------------------------------------------------------------
abschnitt("2. Ein neuer Termin wird gemeldet")

neuer_plan = plan + [termin("c", "2026-09-12T09:45")]
aenderungen = abgleich.plaene_vergleichen(plan, neuer_plan, BIS, VON)
pruefe("genau eine Meldung", len(aenderungen) == 1)
pruefe("und zwar 'neu'", aenderungen and aenderungen[0]["typ"] == "neu")
pruefe("mit dem richtigen Termin",
       aenderungen and aenderungen[0]["termin"]["id"] == "c")


# ---------------------------------------------------------------------------
abschnitt("3. Ein entfallener Termin wird gemeldet")

aenderungen = abgleich.plaene_vergleichen(neuer_plan, plan, BIS, VON)
pruefe("genau eine Meldung", len(aenderungen) == 1)
pruefe("und zwar 'entfallen'", aenderungen and aenderungen[0]["typ"] == "entfallen")
pruefe("mit dem richtigen Termin",
       aenderungen and aenderungen[0]["termin"]["id"] == "c")


# ---------------------------------------------------------------------------
abschnitt("4. Geaenderte Felder werden einzeln benannt")

geaendert = copy.deepcopy(plan)
geaendert[0]["raum"] = "CL: 6A.999"
aenderungen = abgleich.plaene_vergleichen(plan, geaendert, BIS, VON)
pruefe("eine Meldung", len(aenderungen) == 1)
pruefe("vom Typ 'geaendert'", aenderungen and aenderungen[0]["typ"] == "geaendert")
felder = aenderungen[0]["felder"] if aenderungen else []
pruefe("das Feld Raum ist benannt",
       any(f.get("feld") == "Raum" for f in felder))
pruefe("mit altem und neuem Wert",
       any(f.get("vorher") == "CL: 6A.206" and f.get("nachher") == "CL: 6A.999"
           for f in felder))

# Und eine Zeitverschiebung - der Fall, der am meisten kostet.
verschoben = copy.deepcopy(plan)
verschoben[0]["start"] = "2026-09-10T08:00"
aenderungen = abgleich.plaene_vergleichen(plan, verschoben, BIS, VON)
felder = aenderungen[0]["felder"] if aenderungen else []
pruefe("eine Zeitverschiebung wird erkannt",
       any(f.get("feld") == "Beginn" for f in felder))

# Mehrere Felder auf einmal.
doppelt = copy.deepcopy(plan)
doppelt[0]["raum"] = "woanders"
doppelt[0]["dozent"] = "jemand anders"
aenderungen = abgleich.plaene_vergleichen(plan, doppelt, BIS, VON)
felder = aenderungen[0]["felder"] if aenderungen else []
pruefe("zwei gleichzeitige Aenderungen werden beide benannt", len(felder) == 2)

# Eine neue Anmerkung ("ONLINE", "Klausur") ist eine Aenderung.
vermerkt = copy.deepcopy(plan)
vermerkt[0]["anmerkung"] = "ONLINE"
aenderungen = abgleich.plaene_vergleichen(plan, vermerkt, BIS, VON)
felder = aenderungen[0]["felder"] if aenderungen else []
pruefe("eine neue Anmerkung wird erkannt",
       any(f.get("feld") == "Anmerkung" for f in felder))


# ---------------------------------------------------------------------------
abschnitt("5. Kein Fehlalarm am vorderen Fensterrand")

"""
Der Server liefert ein gleitendes Fenster. Rueckt es nach vorn, kommen
Termine hinzu, die es vorher schon gab - sie lagen nur ausserhalb dessen,
was der Server geschickt hat. Die duerfen NICHT als "neu" gemeldet werden.
"""
altes_fenster_bis = "2026-10-01T00:00"
weit_hinten = plan + [termin("z", "2026-11-15T09:45")]

aenderungen = abgleich.plaene_vergleichen(plan, weit_hinten, altes_fenster_bis, VON)
pruefe("ein Termin hinter dem alten Fensterrand schweigt", aenderungen == [])

# Aber innerhalb des alten Fensters muss er gemeldet werden.
knapp_davor = plan + [termin("y", "2026-09-30T09:45")]
aenderungen = abgleich.plaene_vergleichen(plan, knapp_davor, altes_fenster_bis, VON)
pruefe("ein Termin VOR dem alten Fensterrand wird gemeldet",
       len(aenderungen) == 1 and aenderungen[0]["typ"] == "neu")


# ---------------------------------------------------------------------------
abschnitt("6. Kein Fehlalarm am hinteren Fensterrand")

"""
Umgekehrt: rueckt das Fenster vor, fallen alte Termine hinten heraus. Die
sind nicht entfallen, sie sind vorbei.
"""
neues_fenster_von = "2026-09-11T00:00"
aenderungen = abgleich.plaene_vergleichen(plan, plan[1:], BIS, neues_fenster_von)
pruefe("ein Termin vor dem neuen Fensteranfang schweigt", aenderungen == [])

# Ein Termin INNERHALB des Fensters, der verschwindet, ist ein echter Ausfall.
aenderungen = abgleich.plaene_vergleichen(plan, plan[:1], BIS, neues_fenster_von)
pruefe("ein Ausfall innerhalb des Fensters wird gemeldet",
       len(aenderungen) == 1 and aenderungen[0]["typ"] == "entfallen")


# ---------------------------------------------------------------------------
abschnitt("7. Am echten Stand gemessen")

if not os.path.exists(abgleich.DATEI_STAND):
    print("  (uebersprungen - noch kein Stand vorhanden)")
else:
    stand = json.load(open(abgleich.DATEI_STAND, encoding="utf-8"))
    echte = stand["termine"]
    f_von = stand.get("fensterVon", "")
    f_bis = stand.get("fensterBis", "")

    print("       %d Termine im Stand, Fenster %s bis %s"
          % (len(echte), f_von[:10] or "?", f_bis[:10] or "?"))

    pruefe("der gespeicherte Stand ist nicht leer", len(echte) > 0)
    pruefe("er hat ein Zeitfenster", bool(f_von and f_bis))

    # Derselbe Plan mit sich selbst verglichen: Stille.
    aenderungen = abgleich.plaene_vergleichen(echte, copy.deepcopy(echte),
                                              f_bis, f_von)
    pruefe("der echte Plan gegen sich selbst meldet nichts", aenderungen == [])

    # Einen Termin aus der MITTE herausnehmen - ein echter Ausfall.
    mitte = len(echte) // 2
    ohne_einen = echte[:mitte] + echte[mitte + 1:]
    aenderungen = abgleich.plaene_vergleichen(echte, ohne_einen, f_bis, f_von)
    ausfaelle = [a for a in aenderungen if a["typ"] == "entfallen"]
    pruefe("ein herausgenommener Termin wird als Ausfall gemeldet",
           len(ausfaelle) == 1)
    if ausfaelle:
        t = ausfaelle[0]["termin"]
        print("       gemeldet: %s am %s" % (t["titel"][:40], t["start"][:16]))

    # Einen Raum aendern.
    mit_raumwechsel = copy.deepcopy(echte)
    mit_raumwechsel[mitte]["raum"] = "CL: 9Z.999"
    aenderungen = abgleich.plaene_vergleichen(echte, mit_raumwechsel, f_bis, f_von)
    pruefe("ein Raumwechsel im echten Plan wird gemeldet",
           len(aenderungen) == 1 and aenderungen[0]["typ"] == "geaendert")


# ---------------------------------------------------------------------------
abschnitt("8. Stumme Faecher werden trotzdem aufgezeichnet")

"""
Nicht belegte Wahlpflichtfaecher loesen keine Mitteilung aus - sie sollen
aber im Verlauf stehen. Sonst faellt es niemandem auf, wenn die Filterliste
eines Tages falsch ist.
"""
stumm = abgleich.NICHT_BELEGTE_FAECHER[0] if abgleich.NICHT_BELEGTE_FAECHER else None
if not stumm:
    print("  (uebersprungen - keine stummen Faecher eingetragen)")
else:
    print("       stummes Fach: " + stumm)
    mit_stummem = plan + [termin("s", "2026-09-13T09:45", titel=stumm)]
    aenderungen = abgleich.plaene_vergleichen(plan, mit_stummem, BIS, VON)
    pruefe("die Aenderung steht im Verlauf", len(aenderungen) == 1)
    pruefe("ist_belegt() erkennt das Fach als nicht belegt",
           not abgleich.ist_belegt(aenderungen[0]["termin"]))
    pruefe("ein belegtes Fach dagegen schon",
           abgleich.ist_belegt(termin("x", "2026-09-14T09:45")))


# ---------------------------------------------------------------------------
print("")
if fehler:
    print("FEHLGESCHLAGEN (%d):" % len(fehler))
    for eintrag in fehler:
        print("  - " + eintrag)
    sys.exit(1)
print("ALLE TESTS BESTANDEN")
