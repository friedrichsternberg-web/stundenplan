#!/usr/bin/env python3
"""
Prueft die Funktion "post" (echter Server).

WARUM ES DIESEN TEST GIBT

Die Funktion liefert Kopfdaten von Friedrichs Mails: Absender, Betreff,
Datum. Antwortet sie dem falschen Code, liest jemand anderes mit, wer ihm
schreibt. Und nimmt sie Mails von jedem an, koennte jeder ihm
Benachrichtigungen aufs Handy schicken.

Geprueft wird von aussen mit dem oeffentlichen Schluessel, also mit genau
den Rechten, die jede Besucherin der Seite hat. Weder Friedrichs Code noch
das Einliefer-Geheimnis stehen in diesem Test.

Aufruf:  python3 tests/test_post.py
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


print("\n1. Fremde lesen nichts")

for name, felder in [
    ("ein erfundener Code", {"aktion": "lesen", "code": "ERFUNDENERCODEXXXXXXXXXXX"}),
    ("kein Code", {"aktion": "lesen"}),
    ("ein zu kurzer Code", {"aktion": "lesen", "code": "ABC"}),
    ("ein Raum-Hash statt Code", {"aktion": "lesen", "code": "0" * 64}),
]:
    status, text = anfrage("/functions/v1/post", felder)
    pruefe(name + ": 403", status == 403, str(status))
    pruefe(name + ": keine Mails in der Antwort", "betreff" not in text and "absender" not in text, text[:80])

print("\n2. Fremde liefern nichts ein")

probe = [{"kennung": "test-post-py", "gruppe": "noten", "absender": "TEST", "betreff": "TEST",
          "eingegangen": "2026-10-14T10:00:00Z", "link": "https://mail.google.com/x", "melden": True}]
for name, felder in [
    ("ohne Geheimnis", {"aktion": "einliefern", "mails": probe}),
    ("mit falschem Geheimnis", {"aktion": "einliefern", "geheimnis": "x" * 40, "mails": probe}),
    ("mit leerem Geheimnis", {"aktion": "einliefern", "geheimnis": "", "mails": probe}),
]:
    status, text = anfrage("/functions/v1/post", felder)
    # 503 solange das Secret noch nicht gesetzt ist, danach 403
    pruefe(name + ": abgewiesen", status in (403, 503), f"{status} {text[:60]}")

status, _ = anfrage("/functions/v1/post", methode="GET")
pruefe("GET wird abgewiesen", status == 405, str(status))

print("\n3. An den Funktionen vorbei geht es auch nicht")

for funktion, felder in [
    ("post_lesen", {"schluessel": "ERFUNDENERCODEXXXXXXXXXXX"}),
    ("post_erlaubt", {"schluessel": "ERFUNDENERCODEXXXXXXXXXXX"}),
    ("post_einliefern", {"p_mails": probe}),
    ("post_aufraeumen", {}),
]:
    status, text = anfrage("/rest/v1/rpc/" + funktion, felder, mit_schluessel=True)
    pruefe(funktion + " ist fuer die Seite gesperrt", status in (401, 403, 404), f"{status} {text[:60]}")

for tabelle in ("post_eintraege", "post_zugang"):
    status, text = anfrage("/rest/v1/" + tabelle + "?select=*", methode="GET", mit_schluessel=True)
    pruefe(tabelle + " ist nicht lesbar", status in (401, 403, 404, 406), f"{status} {text[:60]}")

print()
if fehler:
    print(f"FEHLGESCHLAGEN ({len(fehler)}):")
    for f in fehler:
        print("  - " + f)
    sys.exit(1)
print("ALLE TESTS BESTANDEN")
