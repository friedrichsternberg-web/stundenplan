#!/usr/bin/env python3
# -*- coding: utf-8 -*-
"""
Prueft die Mail-Benachrichtigung - ohne Postfach und ohne Passwort.

Geprueft wird das, woran es haengt: welche Nachrichten gelten als neu. Ein
Fehler dort faellt nicht durch eine Fehlermeldung auf, sondern dadurch, dass
das Handy entweder schweigt oder alle fuenf Minuten dieselbe Mail meldet.
Beides merkt man erst nach Tagen.

Die drei Fallen, um die es geht:

  1. "UID n:*" liefert in IMAP IMMER mindestens eine Nachricht - auch wenn
     keine mit einer Nummer ab n existiert. Ein Bereich darf nach der Norm
     nicht leer sein, also gibt der Server die hoechste vorhandene zurueck.

  2. Beim ersten Lauf darf nichts gemeldet werden. Sonst kaemen so viele
     Mitteilungen, wie ungelesene Mails im Postfach liegen - und iOS
     drosselt eine App, die im Schwall meldet.

  3. Aendert sich UIDVALIDITY, bedeuten die alten Nummern etwas anderes.

Aufruf:  python3 tests/test_postfach.py
"""

import importlib.util
import json
import os
import sys
import tempfile

WURZEL = os.path.dirname(os.path.dirname(os.path.abspath(__file__)))

# Als Datei laden statt zu importieren: postfach.py fragt beim Import nichts
# ab, aber so ist sicher, dass wirklich die Datei aus diesem Projekt geprueft
# wird und nicht irgendein gleichnamiges Modul aus dem Suchpfad.
spec = importlib.util.spec_from_file_location(
    "postfach", os.path.join(WURZEL, "postfach.py"))
postfach = importlib.util.module_from_spec(spec)
spec.loader.exec_module(postfach)

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


# ---------------------------------------------------------------------------
abschnitt("1. Die IMAP-Falle: 'n:*' liefert immer etwas")

"""
Der Server hat Nachrichten bis Nummer 100. Wir haben 100 zuletzt gesehen
und fragen nach "101:*". Der Server antwortet mit 100 - nicht weil es etwas
Neues gaebe, sondern weil er einen leeren Bereich nicht zurueckgeben darf.
"""
pruefe("die hoechste alte Nummer gilt nicht als neu",
       postfach.neue_nummern([100], 100) == [])

pruefe("eine wirklich neue Nummer schon",
       postfach.neue_nummern([101], 100) == [101])

pruefe("gemischt: nur die hoeheren zaehlen",
       postfach.neue_nummern([100, 101, 102], 100) == [101, 102])

pruefe("unsortierte Antwort kommt sortiert zurueck",
       postfach.neue_nummern([105, 101, 103], 100) == [101, 103, 105])

pruefe("leere Antwort bleibt leer",
       postfach.neue_nummern([], 100) == [])

pruefe("beim allerersten Lauf (0) zaehlt alles",
       postfach.neue_nummern([1, 2, 3], 0) == [1, 2, 3])


# ---------------------------------------------------------------------------
abschnitt("2. Gelesenes wird nicht gemeldet, aber mitgezaehlt")

neue = [101, 102, 103]
ungelesen = {102}
pruefe("nur die ungelesene wird gemeldet",
       postfach.zu_meldende(neue, ungelesen) == [102])

pruefe("sind alle gelesen, wird nichts gemeldet",
       postfach.zu_meldende(neue, set()) == [])

pruefe("sind alle ungelesen, werden alle gemeldet",
       postfach.zu_meldende(neue, {101, 102, 103}) == [101, 102, 103])

# Der Zaehler muss trotzdem ueber ALLE neuen laufen, nicht nur ueber die
# gemeldeten - sonst kaeme die gelesene Mail beim naechsten Lauf zurueck.
pruefe("der Zaehler richtet sich nach allen neuen, nicht nach den gemeldeten",
       max(neue) == 103)


# ---------------------------------------------------------------------------
abschnitt("3. Wann von vorn angefangen wird")

pruefe("ohne gemerkten Stand: erster Lauf",
       postfach.muss_neu_anfangen(None, "12345") is True)

pruefe("gleiche Gueltigkeit: weiterzaehlen",
       postfach.muss_neu_anfangen("12345", "12345") is False)

pruefe("andere Gueltigkeit: von vorn",
       postfach.muss_neu_anfangen("12345", "99999") is True)

# Zahlen und Text duerfen nicht auseinanderlaufen - json macht aus einer
# Zahl beim Lesen wieder eine Zahl, der Server liefert Text.
pruefe("Zahl gegen Text gilt als gleich",
       postfach.muss_neu_anfangen(12345, "12345") is False)

# Sagt der Server nichts, ist das kein Grund, alles neu zu melden.
pruefe("fehlende Angabe fuehrt nicht zum Neuanfang",
       postfach.muss_neu_anfangen("12345", "") is False)


# ---------------------------------------------------------------------------
abschnitt("4. Kopfzeilen werden lesbar")

faelle = [
    ("=?UTF-8?B?TmV1ZSBOb3RlIHZlcmbDvGdiYXI=?=", "Neue Note verfügbar"),
    ("=?iso-8859-1?Q?Pr=FCfungsanmeldung?=", "Prüfungsanmeldung"),
    ("Ganz normaler Betreff", "Ganz normaler Betreff"),
    ("", ""),
]
for roh, erwartet in faelle:
    pruefe(repr(roh)[:40] + " wird lesbar",
           postfach.kopf_entziffern(roh) == erwartet)

# Ein kaputter Zeichensatz darf nicht zum Absturz fuehren - lieber
# Kauderwelsch als gar keine Meldung.
try:
    postfach.kopf_entziffern("=?gibtesnicht?B?TmV1ZQ==?=")
    pruefe("ein unbekannter Zeichensatz stuerzt nicht ab", True)
except Exception as ausnahme:
    pruefe("ein unbekannter Zeichensatz stuerzt nicht ab (%s)" % ausnahme, False)

pruefe("Absender mit Namen wird gekuerzt",
       postfach.absender_kurz('"Pruefungsamt" <amt@hwr-berlin.de>') == "Pruefungsamt")
pruefe("Absender ohne Namen bleibt die Adresse",
       postfach.absender_kurz("amt@hwr-berlin.de") == "amt@hwr-berlin.de")
pruefe("leerer Absender ergibt 'Unbekannt'",
       postfach.absender_kurz("") == "Unbekannt")


# ---------------------------------------------------------------------------
abschnitt("5. Der gemerkte Stand ueberlebt einen Neustart")

with tempfile.TemporaryDirectory() as ordner:
    postfach.DATENORDNER = ordner
    postfach.DATEI_STAND = os.path.join(ordner, "postfach-stand.json")

    pruefe("ohne Datei ist der Stand leer", postfach.stand_lesen() == {})

    postfach.stand_schreiben("12345", 987)
    gelesen = postfach.stand_lesen()
    pruefe("die Gueltigkeit kommt zurueck", gelesen.get("uidvalidity") == "12345")
    pruefe("die letzte Nummer kommt zurueck", gelesen.get("letzteUid") == 987)

    # Eine kaputte Datei darf nicht zum Absturz fuehren: dann faengt das
    # Skript lieber von vorn an, als gar nicht mehr zu laufen.
    with open(postfach.DATEI_STAND, "w", encoding="utf-8") as datei:
        datei.write("{kaputt")
    pruefe("eine kaputte Standdatei ergibt einen leeren Stand",
           postfach.stand_lesen() == {})


# ---------------------------------------------------------------------------
abschnitt("6. Es steht kein Geheimnis im Quelltext")

"""
Das Wichtigste an dieser Datei ist, was NICHT drinsteht. Der HWR-Login
oeffnet auch Moodle und die Pruefungsverwaltung.
"""
quelltext = open(os.path.join(WURZEL, "postfach.py"), encoding="utf-8").read()
einrichten = open(os.path.join(WURZEL, "postfach-einschalten.sh"), encoding="utf-8").read()

pruefe("postfach.py holt das Passwort aus dem Schluesselbund",
       "security" in quelltext and "find-internet-password" in quelltext)

"""
Die entscheidende Pruefung, und zwar am Syntaxbaum statt an Zeichenketten.

Ein erster Versuch suchte einfach nach dem Wort "passwort" in Zeilen mit
print() - und schlug sofort an, weil in einer Fehlermeldung "Passwort im
Schluesselbund pruefen" steht. Das Wort ist harmlos, die VARIABLE nicht.

Der Syntaxbaum kennt den Unterschied: hier wird gesucht, ob die Variable
passwort oder geheimnis jemals als Wert in einen Aufruf wandert, der etwas
ausgibt oder schreibt.
"""
import ast

baum = ast.parse(quelltext)


def wandert_in(aufrufnamen, variablen):
    """Findet Aufrufe aus aufrufnamen, die eine dieser Variablen weiterreichen."""
    treffer = []
    for knoten in ast.walk(baum):
        if not isinstance(knoten, ast.Call):
            continue
        name = ""
        if isinstance(knoten.func, ast.Name):
            name = knoten.func.id
        elif isinstance(knoten.func, ast.Attribute):
            name = knoten.func.attr
        if name not in aufrufnamen:
            continue
        for teil in ast.walk(knoten):
            if isinstance(teil, ast.Name) and teil.id in variablen:
                treffer.append("Zeile %d: %s(... %s ...)"
                               % (knoten.lineno, name, teil.id))
    return treffer


"""
Zwei verschiedene Regeln, und der Unterschied ist wichtig.

Das HWR-Passwort darf NIRGENDS hin: nicht in eine Ausgabe, nicht in eine
Datei, nicht ueber das Netz. Es geht ausschliesslich an verbindung.login().

Das Melde-Geheimnis dagegen MUSS verschickt werden - damit weist sich der
Mac beim Absender aus. Es darf nur nicht im Protokoll landen, das
tagelang auf der Platte liegt.

Der erste Anlauf dieser Pruefung kannte den Unterschied nicht und schlug
beim json.dumps in melden() an. Das war ein echter Treffer, nur eben einer,
der so sein muss.
"""
AUSGEBENDE = {"print", "dump", "dumps", "write", "writelines"}

verraeter = wandert_in(AUSGEBENDE, {"passwort"})
pruefe("das HWR-Passwort landet in keiner Ausgabe und keiner Datei", not verraeter)
for eintrag in verraeter:
    print("         " + eintrag)

im_protokoll = wandert_in({"print"}, {"geheimnis"})
pruefe("das Melde-Geheimnis landet nicht im Protokoll", not im_protokoll)
for eintrag in im_protokoll:
    print("         " + eintrag)

# Und es geht wirklich nur an eine Stelle: den Absender.
verschickt = wandert_in({"dumps"}, {"geheimnis"})
pruefe("es wird genau einmal verschickt, naemlich an den Absender",
       len(verschickt) == 1)

# Und die Gegenprobe: der Test wuerde es auch merken.
probe = ast.parse("passwort = 'x'\nprint(passwort)")
gefunden = any(
    isinstance(k, ast.Call) and isinstance(k.func, ast.Name) and k.func.id == "print"
    and any(isinstance(t, ast.Name) and t.id == "passwort" for t in ast.walk(k))
    for k in ast.walk(probe))
pruefe("die Pruefung wuerde ein print(passwort) erkennen", gefunden)

pruefe("das Einrichtungsskript liest das Passwort versteckt ein (read -s)",
       "read -r -s -p" in einrichten)
pruefe("und gibt es direkt an security weiter",
       "security add-internet-password" in einrichten)
pruefe("der Abruf benutzt PEEK, markiert also nichts als gelesen",
       "BODY.PEEK" in quelltext and "BODY[" not in quelltext)
pruefe("das Postfach wird nur lesend geoeffnet",
       "readonly=True" in quelltext)


# ---------------------------------------------------------------------------
print("")
if fehler:
    print("FEHLGESCHLAGEN (%d):" % len(fehler))
    for eintrag in fehler:
        print("  - " + eintrag)
    sys.exit(1)
print("ALLE TESTS BESTANDEN")
