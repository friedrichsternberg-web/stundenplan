#!/usr/bin/env python3
# -*- coding: utf-8 -*-
"""
Prueft die Zeitkorrekturen in abgleich.py.

Der Kern der Sache: die Korrektur darf NUR die Anzeige betreffen. Der
gespeicherte Vergleichsstand muss der Originalplan bleiben - sonst meldet
jeder Abgleich eine Aenderung, die es nie gab.

Aufruf:  python3 tests/test_korrektur.py
"""

import copy
import os
import sys

sys.path.insert(0, os.path.dirname(os.path.dirname(os.path.abspath(__file__))))
import abgleich

fehler = []


def pruefe(bezeichnung, bedingung):
    print(("  OK   " if bedingung else "  FEHL ") + bezeichnung)
    if not bedingung:
        fehler.append(bezeichnung)


def termin(datum, start, titel="WPF - Nachhaltiges Wirtschaften (Do)"):
    return {
        "id": "test-" + datum + start,
        "start": datum + "T" + start,
        "ende": datum + "T13:15",
        "art": "SI", "titel": titel, "dozent": "Gläser",
        "raum": "CL: 6A.207", "anmerkung": "", "gruppe": "",
    }


print("1. Die falsche Zeit wird geradegezogen")
# 2026-08-13 ist ein Donnerstag.
eingabe = [termin("2026-08-13", "08:00")]
original = copy.deepcopy(eingabe)
ergebnis = abgleich.korrekturen_anwenden(eingabe)

pruefe("Anzeige beginnt um 8:45", ergebnis[0]["start"].endswith("T08:45"))
pruefe("Ende bleibt unangetastet", ergebnis[0]["ende"].endswith("T13:15"))
pruefe("Grund wird mitgegeben", bool(ergebnis[0].get("korrektur")))
print("       -> " + ergebnis[0].get("korrektur", ""))

print("\n2. Die Eingabeliste bleibt unberuehrt")
pruefe("Original steht weiterhin auf 8:00", eingabe == original)
pruefe("und ist ein anderes Objekt als das Ergebnis", eingabe[0] is not ergebnis[0])

print("\n3. Kein doppeltes Verschieben")
schon_richtig = [termin("2026-09-17", "08:45")]
ergebnis = abgleich.korrekturen_anwenden(schon_richtig)
pruefe("8:45 bleibt 8:45", ergebnis[0]["start"].endswith("T08:45"))
pruefe("und wird nicht als korrigiert markiert", "korrektur" not in ergebnis[0])

print("\n4. Andere Faecher sind nicht betroffen")
fremd = [termin("2026-08-13", "08:00", titel="WPF - Social Innovation")]
ergebnis = abgleich.korrekturen_anwenden(fremd)
pruefe("Social Innovation bleibt bei 8:00", ergebnis[0]["start"].endswith("T08:00"))
pruefe("ohne Korrekturvermerk", "korrektur" not in ergebnis[0])

print("\n5. Nur donnerstags")
# 2026-08-11 ist ein Dienstag - dieselbe Uhrzeit, aber falscher Wochentag.
dienstag = [termin("2026-08-11", "08:00")]
ergebnis = abgleich.korrekturen_anwenden(dienstag)
pruefe("ein Dienstag wird nicht angefasst", ergebnis[0]["start"].endswith("T08:00"))

print("\n6. Andere Uhrzeit desselben Fachs bleibt stehen")
andere = [termin("2026-08-13", "10:00")]
ergebnis = abgleich.korrekturen_anwenden(andere)
pruefe("10:00 bleibt 10:00", ergebnis[0]["start"].endswith("T10:00"))

print("\n7. Am echten Plan gemessen")
if os.path.exists(abgleich.DATEI_STAND):
    import json
    stand = json.load(open(abgleich.DATEI_STAND, encoding="utf-8"))
    fach = [t for t in stand["termine"]
            if t["titel"] == "WPF - Nachhaltiges Wirtschaften (Do)"]
    korrigiert = abgleich.korrekturen_anwenden(fach)
    anfaenge = sorted(set(t["start"][11:16] for t in korrigiert))
    print("       Anfangszeiten nach Korrektur: " + ", ".join(anfaenge))
    pruefe("alle " + str(len(fach)) + " Termine beginnen um 8:45",
           anfaenge == ["08:45"])
    roh = sorted(set(t["start"][11:16] for t in fach))
    pruefe("der Originalplan bleibt uneinheitlich (" + ", ".join(roh) + ")",
           len(roh) == 2)
else:
    print("  (uebersprungen - noch kein Stand vorhanden)")

print("\n8. Eine geaenderte Einstellung erzwingt ein Neuschreiben")
# Das ist die Falle, in die dieses Projekt zweimal getappt ist: die
# Anzeigedateien werden nur bei Bedarf geschrieben - und "Bedarf" hiess
# lange nur "der Plan hat sich geaendert". Aendert man dagegen eine
# Einstellung, blieb die alte Anzeige stehen.
einstellungen = abgleich.anzeige_einstellungen()
pruefe("Faecherliste steckt drin", "nichtBelegteFaecher" in einstellungen)
pruefe("Gruppenliste steckt drin", "nichtBelegteGruppen" in einstellungen)
pruefe("Zeitkorrekturen stecken drin", "zeitkorrekturen" in einstellungen)

# Ein alter Stand mit anderen Einstellungen muss als "veraendert" gelten.
alter = copy.deepcopy(einstellungen)
alter["zeitkorrekturen"] = []
pruefe("fehlende Korrekturen werden als Unterschied erkannt",
       alter != abgleich.anzeige_einstellungen())

alter2 = copy.deepcopy(einstellungen)
alter2["nichtBelegteFaecher"] = alter2["nichtBelegteFaecher"][:-1]
pruefe("geaenderte Faecherliste ebenso",
       alter2 != abgleich.anzeige_einstellungen())

pruefe("unveraendert bleibt unveraendert",
       copy.deepcopy(einstellungen) == abgleich.anzeige_einstellungen())

print("\n" + ("ALLE TESTS BESTANDEN" if not fehler
              else "FEHLGESCHLAGEN: " + ", ".join(fehler)))
sys.exit(1 if fehler else 0)
