#!/usr/bin/env python3
"""
Prueft die Funktion "training" (echter Server).

WARUM ES DIESEN TEST GIBT

Die Funktion holt mit Friedrichs Gymbro-Schluessel dessen Trainings,
Gewicht und Bestleistungen ab. Antwortet sie dem falschen Code, sieht
jemand anderes diese Daten. Die beiden Studierenden haben eigene Codes
fuer dasselbe Dashboard - genau die duerfen hier nichts bekommen.

Geprueft wird von aussen, mit dem oeffentlichen Schluessel, also mit
genau den Rechten, die jede Besucherin der Seite auch hat. Friedrichs
eigener Code steht in keinem Test.

Aufruf:  python3 tests/test_training.py
"""

import json
import sys
import urllib.error
import urllib.request

URL = "https://copydwpdqpnwjvknsakz.supabase.co"
OEFFENTLICH = "sb_publishable_d7pxVkeMCqwhFsLrupDovA_ag2SmffE"

fehler = []


def pruefe(was, bedingung, zusatz=""):
    print(("  OK   " if bedingung else "  FEHL ") + was
          + (("  -> " + zusatz) if zusatz else ""))
    if not bedingung:
        fehler.append(was)


def anfrage(pfad, felder=None, methode="POST", mit_schluessel=False):
    kopf = {"Content-Type": "application/json"}
    if mit_schluessel:
        kopf.update({"apikey": OEFFENTLICH, "Authorization": "Bearer " + OEFFENTLICH})
    daten = json.dumps(felder).encode("utf-8") if felder is not None else None
    r = urllib.request.Request(URL + pfad, data=daten, headers=kopf, method=methode)
    try:
        with urllib.request.urlopen(r, timeout=30) as a:
            return a.status, a.read().decode("utf-8")
    except urllib.error.HTTPError as e:
        return e.code, e.read().decode("utf-8")


print("\n1. Fremde bekommen nichts")

for name, felder in [
    ("ein erfundener Code", {"code": "ERFUNDENERCODEXXXXXXXXXXX"}),
    ("kein Code", {}),
    ("ein zu kurzer Code", {"code": "ABC"}),
    ("ein Raum-Hash statt Code", {"code": "0" * 64}),
]:
    status, text = anfrage("/functions/v1/training", felder)
    pruefe(name + ": 403", status == 403, str(status))
    pruefe(name + ": keine Daten in der Antwort",
           "sessions" not in text and "weights" not in text, text[:80])

status, _ = anfrage("/functions/v1/training", methode="GET")
pruefe("GET wird abgewiesen", status == 405, str(status))

print("\n2. Die Freigabe ist von aussen nicht erreichbar")

status, text = anfrage("/rest/v1/rpc/training_erlaubt",
                       {"schluessel": "ERFUNDENERCODEXXXXXXXXXXX"}, mit_schluessel=True)
pruefe("training_erlaubt ist fuer die Seite gesperrt", status in (401, 403, 404),
       f"{status} {text[:80]}")

status, text = anfrage("/rest/v1/training_zugang?select=*", methode="GET", mit_schluessel=True)
pruefe("die Freigabeliste ist nicht lesbar", status in (401, 403, 404, 406),
       f"{status} {text[:80]}")

print()
if fehler:
    print(f"FEHLGESCHLAGEN ({len(fehler)}):")
    for f in fehler:
        print("  - " + f)
    sys.exit(1)
print("ALLE TESTS BESTANDEN")
