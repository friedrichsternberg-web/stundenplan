#!/usr/bin/env python3
# -*- coding: utf-8 -*-
"""
Prueft den Abruf des Stundenplans bei der HWR: Wiederholen bei Aussetzern.

Der Anlass: am 21.10.2026 hing der HWR-Server einmal genau die 60 Sekunden,
die der Abruf damals warten durfte. Der GitHub-Lauf war rot, eine halbe
Stunde spaeter lief alles wieder. Seitdem versucht es abgleich.py dreimal,
und eine HWR-Stoerung zaehlt auf dem Server als Warnung statt als Fehler.

Ohne Netz: der Server wird hier nur gespielt.

Aufruf:  python3 tests/test_abruf.py
"""

import io
import os
import socket
import sys
import urllib.error

sys.path.insert(0, os.path.dirname(os.path.dirname(os.path.abspath(__file__))))
import abgleich

fehler = []


def pruefe(bezeichnung, bedingung, zusatz=""):
    print(("  OK   " if bedingung else "  FEHL ") + bezeichnung
          + (("  -> " + str(zusatz)) if zusatz != "" and not bedingung else ""))
    if not bedingung:
        fehler.append(bezeichnung)


class Antwort(io.BytesIO):
    """Wie die Antwort von urlopen: lesbar, mit Kopfzeilen, als with-Block."""
    def __init__(self, inhalt, etag="abc"):
        super().__init__(inhalt)
        self.headers = {"ETag": etag}


def server(*ablauf):
    """Ein gespielter Server: jeder Aufruf nimmt das naechste Ergebnis."""
    aufrufe = []

    def oeffnen(anfrage, timeout=None):
        aufrufe.append(timeout)
        ergebnis = ablauf[len(aufrufe) - 1]
        if isinstance(ergebnis, Exception):
            raise ergebnis
        return ergebnis
    return oeffnen, aufrufe


def http_fehler(code):
    return urllib.error.HTTPError(abgleich.STUNDENPLAN_URL, code, "x", {}, None)


pausen = []
schlafen = pausen.append


print("1. Klappt es sofort, wird nicht gewartet")
oeffnen, aufrufe = server(Antwort("﻿BEGIN:VCALENDAR".encode("utf-8")))
text, etag, unveraendert = abgleich.kalender_herunterladen("", schlafen, oeffnen)
pruefe("ein Aufruf, keine Pause", len(aufrufe) == 1 and pausen == [])
pruefe("Text ohne unsichtbares Steuerzeichen am Anfang", text == "BEGIN:VCALENDAR", repr(text))
pruefe("ETag kommt mit", etag == "abc" and unveraendert is False)
pruefe("jeder Versuch wartet hoechstens ABRUF_WARTEN_SEKUNDEN",
       aufrufe == [abgleich.ABRUF_WARTEN_SEKUNDEN])

print("\n2. Aussetzer werden wiederholt")
pausen.clear()
oeffnen, aufrufe = server(socket.timeout("timed out"),
                          urllib.error.URLError("Name or service not known"),
                          Antwort(b"BEGIN:VCALENDAR"))
text, etag, unveraendert = abgleich.kalender_herunterladen("", schlafen, oeffnen)
pruefe("nach zwei Aussetzern beim dritten Mal geklappt", len(aufrufe) == 3 and text == "BEGIN:VCALENDAR")
pruefe("mit wachsender Pause dazwischen", pausen == list(abgleich.ABRUF_PAUSEN_SEKUNDEN), pausen)

pausen.clear()
oeffnen, aufrufe = server(http_fehler(503), Antwort(b"BEGIN:VCALENDAR"))
abgleich.kalender_herunterladen("", schlafen, oeffnen)
pruefe("Serverfehler 503 wird wiederholt", len(aufrufe) == 2)

print("\n3. Was Warten nicht heilt, bricht sofort ab")
pausen.clear()
oeffnen, aufrufe = server(http_fehler(404), Antwort(b"nie"))
try:
    abgleich.kalender_herunterladen("", schlafen, oeffnen)
    pruefe("404 fuehrt zu einem Fehler", False)
except urllib.error.HTTPError as e:
    pruefe("404 fuehrt sofort zu einem Fehler, ohne zweiten Versuch", e.code == 404 and len(aufrufe) == 1 and pausen == [])

print("\n4. 304 heisst unveraendert, kein Fehler")
oeffnen, aufrufe = server(http_fehler(304))
text, etag, unveraendert = abgleich.kalender_herunterladen("alt", schlafen, oeffnen)
pruefe("304: unveraendert, altes ETag, ein Aufruf", unveraendert and etag == "alt" and text == "" and len(aufrufe) == 1)

print("\n5. Dreimal nichts: Fehler, aber hoechstens drei Versuche")
pausen.clear()
oeffnen, aufrufe = server(socket.timeout("1"), socket.timeout("2"), socket.timeout("3"), Antwort(b"nie"))
try:
    abgleich.kalender_herunterladen("", schlafen, oeffnen)
    pruefe("nach drei Aussetzern ein Fehler", False)
except Exception:
    pruefe("nach drei Aussetzern ein Fehler", len(aufrufe) == abgleich.ABRUF_VERSUCHE == 3)

print("\n6. main(): HWR weg ist auf dem Server eine Warnung, sonst ein Fehler")
echt_herunterladen = abgleich.kalender_herunterladen
echt_server = abgleich.LAEUFT_AUF_SERVER
try:
    def weg(etag):
        raise urllib.error.URLError("timed out")

    def kaputt(etag):
        raise ValueError("unerwartet")

    abgleich.kalender_herunterladen = weg
    abgleich.LAEUFT_AUF_SERVER = True
    pruefe("Server, HWR weg: Lauf gruen (0)", abgleich.main() == 0)
    abgleich.LAEUFT_AUF_SERVER = False
    pruefe("Mac, HWR weg: 1 wie bisher", abgleich.main() == 1)
    abgleich.LAEUFT_AUF_SERVER = True
    abgleich.kalender_herunterladen = kaputt
    pruefe("Server, anderer Fehler: bleibt rot (1)", abgleich.main() == 1)
finally:
    abgleich.kalender_herunterladen = echt_herunterladen
    abgleich.LAEUFT_AUF_SERVER = echt_server


print()
if fehler:
    print("FEHLGESCHLAGEN: " + ", ".join(fehler))
    sys.exit(1)
print("ALLE TESTS BESTANDEN")
