#!/usr/bin/env python3
# -*- coding: utf-8 -*-
"""
Prueft die Benachrichtigungen - gegen die echte Ablage und den echten
Absender, nicht gegen eine Attrappe.

Der wichtigste Abschnitt ist Nummer 5. Eine Push-Adresse ist ein
Freifahrtschein: wer sie hat, kann Friedrichs Handy Mitteilungen schicken.
Sie darf deshalb NICHT mit dem oeffentlichen Schluessel abrufbar sein, der
im Quelltext der Seite steht. Nur die Absenderfunktion kommt daran, und die
laeuft mit dem service_role-Schluessel, den nur Supabase kennt.

Der zweite heikle Punkt ist Nummer 4: das Abmelden. Ohne Pruefung des
Raums koennte jemand mit einer fremden Adresse ein fremdes Geraet
abmelden - die Benachrichtigungen blieben aus, ohne dass es auffiele.

Aufruf:  python3 tests/test_melden.py

Hinweis: der Test meldet ein erfundenes Geraet an und wieder ab. Die
Adresse zeigt absichtlich ins Leere; echte Mitteilungen loest er nicht aus.
"""

import base64
import json
import os
import subprocess
import sys
import urllib.error
import urllib.request

URL = "https://copydwpdqpnwjvknsakz.supabase.co"
OEFFENTLICH = "sb_publishable_d7pxVkeMCqwhFsLrupDovA_ag2SmffE"

# Zwei erkennbare Testcodes. Mit Friedrichs echtem Code haben sie nichts zu tun.
CODE_A = "TESTLAUF-MELDEN-RAUM-AAAA"
CODE_B = "TESTLAUF-MELDEN-RAUM-BBBB"

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


def rufen(funktion, felder, schluessel=OEFFENTLICH):
    anfrage = urllib.request.Request(
        URL + "/rest/v1/rpc/" + funktion,
        data=json.dumps(felder).encode("utf-8"),
        headers={"apikey": schluessel, "Authorization": "Bearer " + schluessel,
                 "Content-Type": "application/json"},
        method="POST")
    try:
        with urllib.request.urlopen(anfrage, timeout=25) as antwort:
            roh = antwort.read().decode("utf-8")
            return True, (json.loads(roh) if roh else None)
    except urllib.error.HTTPError as ausnahme:
        return False, ausnahme.read().decode("utf-8")
    except Exception as ausnahme:
        return False, str(ausnahme)


def absender(felder):
    anfrage = urllib.request.Request(
        URL + "/functions/v1/stundenplan-melden",
        data=json.dumps(felder).encode("utf-8"),
        headers={"Content-Type": "application/json"},
        method="POST")
    try:
        with urllib.request.urlopen(anfrage, timeout=40) as antwort:
            return antwort.status, json.loads(antwort.read().decode("utf-8"))
    except urllib.error.HTTPError as ausnahme:
        roh = ausnahme.read().decode("utf-8")
        try:
            return ausnahme.code, json.loads(roh)
        except ValueError:
            return ausnahme.code, roh
    except Exception as ausnahme:
        return 0, str(ausnahme)


def echtes_schluesselpaar():
    """
    Ein gueltiger P-256-Punkt als p256dh.

    Erfundene Zeichen wuerden nicht genuegen: die Absenderfunktion
    verschluesselt die Nachricht damit, und an einem unbrauchbaren
    Schluessel scheiterte sie schon vor dem Verschicken. Dann pruefte
    Abschnitt 6 nicht den Versand, sondern nur die Fehlerbehandlung.
    """
    subprocess.run(["openssl", "ecparam", "-name", "prime256v1", "-genkey",
                    "-noout", "-out", "/tmp/melden-test.pem"],
                   check=True, capture_output=True)
    der = subprocess.run(["openssl", "ec", "-in", "/tmp/melden-test.pem",
                          "-outform", "DER"],
                         check=True, capture_output=True).stdout
    punkt = der[-65:]
    assert punkt[0] == 4, "Punkt nicht unkomprimiert"
    os.remove("/tmp/melden-test.pem")

    def b64u(roh):
        return base64.urlsafe_b64encode(roh).decode().rstrip("=")

    return b64u(punkt), b64u(os.urandom(16))


P256DH, AUTH = echtes_schluesselpaar()
# Eine Adresse, die es garantiert nicht gibt. Google beantwortet sie mit
# 410 - genau das, was ein geloeschtes Geraet ausloest.
ENDPUNKT_A = "https://fcm.googleapis.com/fcm/send/TESTLAUF-MELDEN-GIBT-ES-NICHT-A"
ENDPUNKT_B = "https://fcm.googleapis.com/fcm/send/TESTLAUF-MELDEN-GIBT-ES-NICHT-B"


# ---------------------------------------------------------------------------
abschnitt("1. Ohne gueltigen Code geht keine Anmeldung durch")

for code, name in [("", "ein leerer"), ("kurz", "ein zu kurzer"),
                   ("NEUNZEHNZEICHENXYZ", "ein neunzehn Zeichen langer")]:
    geklappt, _ = rufen("push_anmelden", {
        "schluessel": code, "endpunkt": ENDPUNKT_A,
        "p256dh": P256DH, "auth": AUTH})
    pruefe(name + " Code wird abgewiesen", not geklappt)


# ---------------------------------------------------------------------------
abschnitt("2. Unplausible Adressen werden abgewiesen")

geklappt, _ = rufen("push_anmelden", {
    "schluessel": CODE_A, "endpunkt": "zukurz",
    "p256dh": P256DH, "auth": AUTH})
pruefe("eine zu kurze Adresse", not geklappt)

geklappt, _ = rufen("push_anmelden", {
    "schluessel": CODE_A, "endpunkt": "https://x.example/" + "a" * 3000,
    "p256dh": P256DH, "auth": AUTH})
pruefe("eine masslos lange Adresse", not geklappt)


# ---------------------------------------------------------------------------
abschnitt("3. Anmelden und nicht verdoppeln")

geklappt, antwort = rufen("push_anmelden", {
    "schluessel": CODE_A, "endpunkt": ENDPUNKT_A,
    "p256dh": P256DH, "auth": AUTH, "bezeichnung": "Testgeraet"})
pruefe("die Anmeldung geht durch", geklappt and antwort.get("erfolg") is True)

# Dasselbe Geraet noch einmal - der Browser meldet sich bei jedem Start neu.
rufen("push_anmelden", {
    "schluessel": CODE_A, "endpunkt": ENDPUNKT_A,
    "p256dh": P256DH, "auth": AUTH, "bezeichnung": "Testgeraet"})
geklappt, stand = rufen("push_stand", {"schluessel": CODE_A})
pruefe("zweimal anmelden ergibt trotzdem ein Geraet",
       geklappt and stand.get("geraete") == 1)


# ---------------------------------------------------------------------------
abschnitt("4. Fremde Codes kommen nicht aneinander")

rufen("push_anmelden", {"schluessel": CODE_B, "endpunkt": ENDPUNKT_B,
                        "p256dh": P256DH, "auth": AUTH})

geklappt, stand_a = rufen("push_stand", {"schluessel": CODE_A})
geklappt2, stand_b = rufen("push_stand", {"schluessel": CODE_B})
pruefe("Raum A zaehlt nur sein eigenes Geraet",
       geklappt and stand_a.get("geraete") == 1)
pruefe("Raum B ebenso", geklappt2 and stand_b.get("geraete") == 1)

# Der heikle Fall: mit Code B versuchen, das Geraet aus Raum A abzumelden.
rufen("push_abmelden", {"schluessel": CODE_B, "endpunkt": ENDPUNKT_A})
geklappt, stand_a = rufen("push_stand", {"schluessel": CODE_A})
pruefe("ein fremder Code kann nicht abmelden",
       geklappt and stand_a.get("geraete") == 1)

# Mit dem richtigen Code dagegen schon.
rufen("push_abmelden", {"schluessel": CODE_B, "endpunkt": ENDPUNKT_B})
geklappt, stand_b = rufen("push_stand", {"schluessel": CODE_B})
pruefe("der eigene Code kann abmelden",
       geklappt and stand_b.get("geraete") == 0)


# ---------------------------------------------------------------------------
abschnitt("5. An die Push-Adressen kommt von aussen niemand heran")

"""
Der Kern der Absicherung. Der oeffentliche Schluessel steht im Quelltext
der Seite - wer ihn nimmt, darf sich anmelden und abmelden, aber niemals
die Adressen anderer lesen oder Zustellergebnisse faelschen.
"""
geklappt, antwort = rufen("push_geraete_lesen", {})
pruefe("push_geraete_lesen ist fuer aussen gesperrt", not geklappt)
if not geklappt:
    print("       Antwort: " + str(antwort)[:100])

geklappt, antwort = rufen("push_geraete_lesen_raum", {"schluessel": CODE_A})
pruefe("push_geraete_lesen_raum ebenso", not geklappt)

geklappt, antwort = rufen("push_ergebnis_melden",
                          {"endpunkt": ENDPUNKT_A, "geklappt": False,
                           "endgueltig": True})
pruefe("push_ergebnis_melden ebenso", not geklappt)

# Und die Tabelle selbst erst recht nicht.
anfrage = urllib.request.Request(URL + "/rest/v1/push_geraete?select=*", method="GET")
anfrage.add_header("apikey", OEFFENTLICH)
try:
    with urllib.request.urlopen(anfrage, timeout=20) as antwort:
        lage, text = antwort.status, antwort.read().decode("utf-8")
except urllib.error.HTTPError as ausnahme:
    lage, text = ausnahme.code, ausnahme.read().decode("utf-8")
pruefe("die Tabelle ist ueber die Web-Schnittstelle unsichtbar",
       lage >= 400 or "PGRST205" in text)


# ---------------------------------------------------------------------------
abschnitt("6. Der Absender laesst nur Berechtigte durch")

lage, antwort = absender({"titel": "Test"})
pruefe("ohne Ausweis: abgewiesen", lage == 403)

lage, antwort = absender({"geheimnis": "falsch" * 8, "titel": "Test"})
pruefe("mit falschem Geheimnis: abgewiesen", lage == 403)

lage, antwort = absender({"code": "kurz", "titel": "Test"})
pruefe("mit zu kurzem Code: abgewiesen", lage == 403)

# Mit gueltigem Code darf man senden - aber nur in den eigenen Raum.
lage, antwort = absender({"code": CODE_B, "titel": "Probe", "text": "leer"})
pruefe("mit gueltigem Code: angenommen", lage == 200)
pruefe("Raum B ist leer, also niemand angeschrieben",
       isinstance(antwort, dict) and antwort.get("angeschrieben") == 0)


# ---------------------------------------------------------------------------
abschnitt("7. Tote Adressen raeumt der Absender selbst weg")

"""
Ein geloeschtes Geraet meldet sich nicht ab - es verschwindet einfach. Der
Push-Dienst antwortet dann mit 410. Bliebe die Adresse stehen, wuerde sie
bei jeder Meldung erneut angeschrieben, bis zum Sankt-Nimmerleins-Tag.

Das ist zugleich der beste verfuegbare Beweis, dass die Verschluesselung
stimmt: eine 410 bekommt man nur, wenn der Push-Dienst die Anfrage
angenommen und ausgewertet hat. Waere die Signatur falsch, kaeme 401 oder
403; waere die Nutzlast unbrauchbar, kaeme 400.
"""
geklappt, stand = rufen("push_stand", {"schluessel": CODE_A})
pruefe("vorher steht das Testgeraet noch da", stand.get("geraete") == 1)

lage, antwort = absender({"code": CODE_A, "titel": "Probe",
                          "text": "geht ins Leere"})
pruefe("der Versand laeuft durch", lage == 200)
if isinstance(antwort, dict):
    print("       Antwort: " + json.dumps(antwort, ensure_ascii=False)[:160])
    pruefe("ein Geraet wurde angeschrieben", antwort.get("angeschrieben") == 1)
    pruefe("der Push-Dienst hat die Anfrage ausgewertet (410, nicht 401/403)",
           any("410" in str(f) for f in antwort.get("fehler", [])))
    pruefe("und die tote Adresse wurde entfernt", antwort.get("entfernt") == 1)

geklappt, stand = rufen("push_stand", {"schluessel": CODE_A})
pruefe("danach ist der Raum leer", geklappt and stand.get("geraete") == 0)


# ---------------------------------------------------------------------------
abschnitt("8. Aufraeumen")

for code, endpunkt in [(CODE_A, ENDPUNKT_A), (CODE_B, ENDPUNKT_B)]:
    rufen("push_abmelden", {"schluessel": code, "endpunkt": endpunkt})
geklappt, a = rufen("push_stand", {"schluessel": CODE_A})
geklappt2, b = rufen("push_stand", {"schluessel": CODE_B})
pruefe("keine Testgeraete mehr uebrig",
       a.get("geraete") == 0 and b.get("geraete") == 0)


# ---------------------------------------------------------------------------
print("")
if fehler:
    print("FEHLGESCHLAGEN (%d):" % len(fehler))
    for eintrag in fehler:
        print("  - " + eintrag)
    sys.exit(1)
print("ALLE TESTS BESTANDEN")
