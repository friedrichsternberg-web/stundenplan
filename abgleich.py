#!/usr/bin/env python3
# -*- coding: utf-8 -*-
"""
Holt den Stundenplan der HWR Berlin, vergleicht ihn mit dem zuletzt
gespeicherten Stand und meldet jede Aenderung als macOS-Mitteilung.

Aufruf:  python3 abgleich.py

Das Skript braucht keine zusaetzlichen Bibliotheken. Alles, was es benutzt,
ist in Python selbst schon eingebaut.
"""

import json
import os
import subprocess
import sys
import urllib.error
import urllib.request
from datetime import datetime
from zoneinfo import ZoneInfo


# ===========================================================================
# 1. Einstellungen
# ===========================================================================

# Welcher Stundenplan soll geholt werden? Diese drei Werte ergeben zusammen
# die Adresse der Kalenderdatei. Das Namensschema stammt von der Moodle-Seite
# des Fachbereichs 2. Wenn du ins naechste Semester wechselst, aenderst du
# hier einfach "semester5" auf "semester6" - sonst nichts.
FACHRICHTUNG = "tourismus"
SEMESTER = "semester5"
KURS = "kurs"

STUNDENPLAN_URL = (
    "https://moodle.hwr-berlin.de/fb2-stundenplan/fb2-stundenplaene/"
    + FACHRICHTUNG + "/" + SEMESTER + "/" + KURS + ".ics"
)

# Die Faecher, die du NICHT belegst.
#
# Der Plan des Kurses enthaelt das gesamte WPF-Angebot des Semesters, und auch
# einzelne Pflichtmodule sind nicht fuer jeden dabei. Ohne diese Liste kaemen
# Mitteilungen auch fuer Faecher, die dich nichts angehen.
#
# Wichtig: Aenderungen an diesen Faechern werden trotzdem vollstaendig
# aufgezeichnet - im Protokoll und im Aenderungsverlauf des Dashboards.
# Es unterbleibt nur die Mitteilung. Es geht also nichts verloren.
#
# Diese Liste ist zugleich die Vorgabe fuer den Filter im Dashboard: sie wird
# nach daten/plan.js mitgeschrieben. Wer sie hier aendert, aendert beides.
# (Hakst du im Dashboard etwas anderes an, gilt das nur fuer die Anzeige in
# diesem einen Browser - die Mitteilungen richten sich immer nach dieser Liste.)
NICHT_BELEGTE_FAECHER = [
    "Personalmanagement- und -entwicklung",
    "WPF - Angewandte Wohlfahrtsstaatentheorie",
    "WPF - Cross Cultural Management",
    "WPF - Ethik in Wirtschaft und Gesellschaft",
    "WPF - IRFS Rechnungslegung",
    "WPF - Nachhaltiges Wirtschaften (Die)",
    "WPF - Praxisorientierte Methoden der empirischen W",
    "WPF - Recht der Künstlichen Intelligenz",
    "WPF - Supply Chain Management",
    "WPF - Wirtschaftsenglisch B2 (Do)",
    "WPF - Wirtschaftsenglisch C1 (Do)",
    "WPF - Wirtschaftspsychologie (Die)",
    "WPF - Wirtschaftspsychologie (Do) Kurs 1",
]

# Kursgruppen, die du NICHT besuchst.
#
# Manche Module werden parallel in mehreren Gruppen gelesen - beim Modul
# "4 - Management" sind das TM+HD und TM+SP. Beide heissen gleich, sie
# unterscheiden sich nur in der Dozentenangabe: "Bergmann, TM+SP" gegenueber
# "Knoll, TM+HD". Die Liste oben kann sie deshalb nicht trennen, sie kennt
# nur ganze Faecher.
#
# Hier steht also, welcher Text im Dozentenfeld bedeutet "nicht meine Gruppe".
# Verglichen wird, ob der Text irgendwo darin vorkommt.
NICHT_BELEGTE_GRUPPEN = [
    "TM+HD",
]

# Korrekturen an Zeiten, die im HWR-Plan falsch stehen.
#
# Beispiel: "Nachhaltiges Wirtschaften (Do)" faengt donnerstags erst um 8:45
# an. Die HWR traegt das selbst uneinheitlich ein - ab dem 17.09. steht dort
# 08:45, davor 08:00. Diese Liste zieht die Ausreisser gerade.
#
# WICHTIG: Die Korrektur greift NUR fuer die Anzeige (Dashboard und
# Kalenderdatei). Der gespeicherte Vergleichsstand bleibt der Originalplan -
# sonst wuerde jeder Abgleich eine Aenderung melden, die es nie gab, oder
# umgekehrt eine echte Aenderung verschlucken.
#
# "von" verhindert doppeltes Verschieben: korrigiert die HWR die Zeit
# irgendwann selbst auf 08:45, passt die Regel nicht mehr und tut nichts.
ZEITKORREKTUREN = [
    {
        "titel": "WPF - Nachhaltiges Wirtschaften (Do)",
        "wochentag": 3,          # 0 = Montag, also 3 = Donnerstag
        "von": "08:00",
        "nach": "08:45",
        "hinweis": "Beginn 8:45 (im Plan steht 8:00)",
    },
]

# Laeuft das Skript auf deinem Mac oder bei GitHub?
#
# Beide tun dasselbe, aber mit unterschiedlichem Zweck:
#   Mac    - vergleicht und benachrichtigt dich per Mitteilung
#   GitHub - vergleicht und aktualisiert die Seite fuers Handy
#
# Der Server kann keine macOS-Mitteilung anzeigen; er wuerde bei jedem Lauf
# in einen Fehler laufen. Deshalb setzt die Automatik STUNDENPLAN_SERVER=1
# und das Skript laesst das Benachrichtigen dann weg.
LAEUFT_AUF_SERVER = os.environ.get("STUNDENPLAN_SERVER") == "1"

# Alle Dateien, die das Skript schreibt, liegen neben dem Skript im Ordner
# "daten". So funktioniert der Aufruf unabhaengig davon, aus welchem
# Verzeichnis heraus du das Skript startest.
#
# Die Automatik bei GitHub schreibt woandershin - naemlich in die
# ausgecheckte Kopie des gh-pages-Zweigs. Dafuer laesst sich der Ordner ueber
# STUNDENPLAN_DATEN umbiegen.
PROJEKTORDNER = os.path.dirname(os.path.abspath(__file__))
DATENORDNER = os.environ.get("STUNDENPLAN_DATEN") or os.path.join(PROJEKTORDNER, "daten")

# Der zuletzt gesehene Stand. Damit wird beim naechsten Lauf verglichen.
DATEI_STAND = os.path.join(DATENORDNER, "stand.json")

# Die Daten fuer das Dashboard. Bewusst eine .js-Datei und keine .json:
# so laesst sich index.html per Doppelklick oeffnen, ohne dass ein Webserver
# laufen muss. (Der Browser verbietet aus Sicherheitsgruenden, dass eine
# lokal geoeffnete Seite Dateien nachlaedt - ein <script>-Tag darf es aber.)
DATEI_DASHBOARD = os.path.join(DATENORDNER, "plan.js")

# Eine Kalenderdatei mit NUR deinen Faechern, zum Abonnieren auf dem iPhone.
# Der Originalplan der HWR enthaelt alle 23 Faecher des Semesters - den wollte
# man sich nicht in den Kalender legen.
DATEI_KALENDER = os.path.join(DATENORDNER, "meine-termine.ics")

# Wie viele vergangene Aenderungen im Verlauf aufgehoben werden.
MAXIMALE_ANZAHL_AENDERUNGEN = 300

# Wie alt der angezeigte Stand hoechstens werden darf, in Stunden.
#
# Die Anzeigedateien werden normalerweise nur geschrieben, wenn sich am Plan
# etwas geaendert hat - sonst gaebe es bei jedem Lauf einen Commit, allein
# weil der Zeitstempel weiterrueckt.
#
# Hier stand zuerst 24. Das war zu lang: aendert sich am Plan tagelang
# nichts, stand im Dashboard "zuletzt geprueft: vorgestern", obwohl die
# Pruefung laeuft. Das sieht nach einem Ausfall aus, ist aber keiner.
# Mit 4 Stunden frischt sich die Anzeige mehrmals taeglich auf, und es
# bleiben trotzdem nur eine Handvoll Commits pro Tag.
AUFFRISCHEN_NACH_STUNDEN = 4

# Alle Zeiten im Plan sind Berliner Ortszeit. Fuer die Kalenderdatei rechnen
# wir sie in Weltzeit (UTC) um - dann muss die Datei keine eigenen
# Zeitzonenregeln mitliefern, und Sommer-/Winterzeit stimmt automatisch.
ZEITZONE_BERLIN = ZoneInfo("Europe/Berlin")
ZEITZONE_UTC = ZoneInfo("UTC")


# ===========================================================================
# 2. Die Kalenderdatei holen
# ===========================================================================

def kalender_herunterladen(bekanntes_etag):
    """
    Laedt die iCal-Datei vom HWR-Server.

    Der Server schickt bei jeder Datei ein sogenanntes ETag mit - eine Art
    Fingerabdruck des Inhalts. Wenn wir ihm beim Anfragen unser zuletzt
    gesehenes ETag mitgeben und sich nichts geaendert hat, antwortet er nur
    kurz mit "304 Not Modified" und schickt die 150 KB gar nicht erst.
    Das spart Datenverkehr und macht haeufiges Nachschauen billig.

    Rueckgabe: (text, etag, unveraendert)
    Bei "unveraendert = True" ist "text" leer.
    """
    anfrage = urllib.request.Request(STUNDENPLAN_URL)
    anfrage.add_header("User-Agent", "stundenplan-dashboard/1.0")
    if bekanntes_etag:
        anfrage.add_header("If-None-Match", bekanntes_etag)

    try:
        with urllib.request.urlopen(anfrage, timeout=60) as antwort:
            rohdaten = antwort.read()
            etag = antwort.headers.get("ETag", "")
    except urllib.error.HTTPError as fehler:
        if fehler.code == 304:
            # Der Server sagt: unveraendert seit dem letzten Mal.
            return "", bekanntes_etag, True
        raise

    # Die Datei ist UTF-8 und beginnt mit einem unsichtbaren Steuerzeichen
    # (dem "Byte Order Mark"). "utf-8-sig" entfernt das automatisch.
    return rohdaten.decode("utf-8-sig", errors="replace"), etag, False


# ===========================================================================
# 3. Die Kalenderdatei auseinandernehmen
# ===========================================================================

def zeilen_entfalten(text):
    """
    Im iCal-Format werden lange Zeilen umgebrochen. Eine Zeile, die mit einem
    Leerzeichen oder einem Tabulator beginnt, ist keine neue Angabe, sondern
    die Fortsetzung der vorherigen. Diese Funktion klebt sie wieder zusammen.
    """
    ergebnis = []
    for zeile in text.replace("\r\n", "\n").replace("\r", "\n").split("\n"):
        if zeile.startswith(" ") or zeile.startswith("\t"):
            if ergebnis:
                ergebnis[-1] += zeile[1:]
        else:
            ergebnis.append(zeile)
    return ergebnis


def text_entschluesseln(wert):
    """
    iCal maskiert Sonderzeichen mit einem Backslash: "\\n" steht fuer einen
    Zeilenumbruch, "\\;" fuer ein Semikolon. Diese Funktion macht das
    rueckgaengig.
    """
    ergebnis = []
    index = 0
    while index < len(wert):
        zeichen = wert[index]
        if zeichen == "\\" and index + 1 < len(wert):
            naechstes = wert[index + 1]
            if naechstes in ("n", "N"):
                ergebnis.append("\n")
            elif naechstes in (";", ",", "\\"):
                ergebnis.append(naechstes)
            else:
                ergebnis.append(naechstes)
            index += 2
        else:
            ergebnis.append(zeichen)
            index += 1
    return "".join(ergebnis)


def zeile_zerlegen(zeile):
    """
    Zerlegt eine iCal-Zeile in Name und Wert.

    Beispiel: "DTSTART;TZID=Europe/Berlin:20260810T080000"
    ergibt    ("DTSTART", "20260810T080000")

    Der Name kann Zusatzangaben nach einem Semikolon enthalten (hier die
    Zeitzone). Die brauchen wir nicht - alle Zeiten sind Berliner Zeit.
    """
    doppelpunkt = zeile.find(":")
    if doppelpunkt < 0:
        return "", ""
    name_mit_zusatz = zeile[:doppelpunkt]
    wert = zeile[doppelpunkt + 1:]
    name = name_mit_zusatz.split(";")[0].upper()
    return name, wert


def zeitpunkt_lesen(wert):
    """
    Wandelt "20260810T080000" in "2026-08-10T08:00" um - lesbar und
    gut sortierbar. Alle Zeiten im Plan sind Berliner Ortszeit, deshalb ist
    kein Umrechnen noetig.
    """
    if len(wert) < 15:
        return wert
    return (wert[0:4] + "-" + wert[4:6] + "-" + wert[6:8]
            + "T" + wert[9:11] + ":" + wert[11:13])


def beschreibung_zerlegen(beschreibung):
    """
    Das Feld DESCRIPTION enthaelt die Einzelangaben als Liste, eine pro
    Zeile, im Format "Schluessel: Wert":

        Art: SU
        Veranstaltung: Nationale und internationale Leistungsanbieter I
        Dozent: Nabi
        Raum: CL: 6A.206
        Anmerkung: -

    Achtung beim Raum: der Wert enthaelt selbst einen Doppelpunkt. Deshalb
    wird nur am *ersten* Doppelpunkt getrennt.
    """
    felder = {}
    for zeile in beschreibung.split("\n"):
        trennstelle = zeile.find(":")
        if trennstelle < 0:
            continue
        schluessel = zeile[:trennstelle].strip()
        wert = zeile[trennstelle + 1:].strip()
        # Ein einzelner Bindestrich heisst in diesem Plan "nichts angegeben".
        if wert == "-":
            wert = ""
        felder[schluessel] = wert
    return felder


def kalender_zerlegen(text):
    """
    Liest die komplette Kalenderdatei und gibt zwei Dinge zurueck:

    1. die Liste der Termine
    2. das Zeitfenster, das die Datei abdeckt

    Das Zeitfenster ist wichtig: der HWR-Server liefert immer nur die
    naechsten rund zwoelf Wochen. Termine ausserhalb dieses Fensters fehlen
    in der Datei - obwohl sie nicht abgesagt sind. Ohne diese Information
    wuerde der Vergleich staendig falschen Alarm schlagen.
    """
    termine = []
    fenster_von = ""
    fenster_bis = ""

    # "in_termin" merkt sich, ob wir gerade innerhalb eines VEVENT-Blocks
    # sind. Das ist noetig, weil die Datei auch einen VTIMEZONE-Block
    # enthaelt, der ebenfalls DTSTART-Zeilen hat (mit Datum 1996!) - die
    # sind aber Zeitzonen-Regeln und keine Vorlesungen.
    in_termin = False
    aktueller_termin = {}

    for zeile in zeilen_entfalten(text):
        name, wert = zeile_zerlegen(zeile)

        if name == "BEGIN" and wert == "VEVENT":
            in_termin = True
            aktueller_termin = {}
            continue

        if name == "END" and wert == "VEVENT":
            in_termin = False
            termin = termin_aufbereiten(aktueller_termin)
            if termin:
                termine.append(termin)
            continue

        if not in_termin:
            # Ausserhalb der Termine interessiert uns nur das Zeitfenster.
            if name == "X-SKED-SYNC-DTSTART":
                fenster_von = zeitpunkt_lesen(wert)
            elif name == "X-SKED-SYNC-DTEND":
                fenster_bis = zeitpunkt_lesen(wert)
            continue

        aktueller_termin[name] = wert

    # Falls der Server das Zeitfenster mal nicht mitliefert, leiten wir es
    # ersatzweise aus den Terminen selbst ab.
    if termine and not fenster_von:
        fenster_von = min(t["start"] for t in termine)
    if termine and not fenster_bis:
        fenster_bis = max(t["start"] for t in termine)

    termine.sort(key=lambda t: (t["start"], t["titel"]))
    return termine, fenster_von, fenster_bis


def termin_aufbereiten(rohfelder):
    """
    Macht aus den rohen iCal-Feldern einen aufgeraeumten Termin.
    Gibt None zurueck, wenn der Eintrag unbrauchbar ist.
    """
    if "DTSTART" not in rohfelder or "UID" not in rohfelder:
        return None

    beschreibung = text_entschluesseln(rohfelder.get("DESCRIPTION", ""))
    felder = beschreibung_zerlegen(beschreibung)

    return {
        "id": rohfelder["UID"],
        "start": zeitpunkt_lesen(rohfelder["DTSTART"]),
        "ende": zeitpunkt_lesen(rohfelder.get("DTEND", rohfelder["DTSTART"])),
        "art": felder.get("Art", ""),
        "titel": felder.get("Veranstaltung", ""),
        "dozent": felder.get("Dozent", ""),
        "raum": text_entschluesseln(rohfelder.get("LOCATION", "")),
        "anmerkung": felder.get("Anmerkung", ""),
        "gruppe": felder.get("Veranstaltungsuntergruppe", ""),
    }


# ===========================================================================
# 4. Alten und neuen Stand vergleichen
# ===========================================================================

# Diese Felder werden auf Aenderungen geprueft. Der Name links ist der
# technische, der Text rechts der, den du in der Meldung liest.
VERGLICHENE_FELDER = [
    ("start", "Beginn"),
    ("ende", "Ende"),
    ("titel", "Veranstaltung"),
    ("dozent", "Dozent"),
    ("raum", "Raum"),
    ("art", "Art"),
    ("anmerkung", "Anmerkung"),
]


def plaene_vergleichen(alte_termine, neue_termine,
                       altes_fenster_bis, neues_fenster_von):
    """
    Vergleicht zwei Staende und gibt eine Liste der Aenderungen zurueck.

    Jeder Termin hat eine feste Kennung (UID), die sich nicht aendert.
    Dadurch koennen wir sauber unterscheiden:

    - neu:       Kennung ist dazugekommen
    - entfallen: Kennung ist verschwunden
    - geaendert: Kennung gibt es noch, aber ein Feld ist anders

    Die beiden Zeitfenster-Angaben verhindern Fehlalarm an den Raendern:
    Termine, die nur deshalb neu sind, weil das Fenster nach vorn gerueckt
    ist, und Termine, die nur deshalb fehlen, weil sie hinten herausgefallen
    sind, werden nicht gemeldet.
    """
    alte_nach_id = {}
    for termin in alte_termine:
        alte_nach_id[termin["id"]] = termin

    neue_nach_id = {}
    for termin in neue_termine:
        neue_nach_id[termin["id"]] = termin

    aenderungen = []

    # --- Neu hinzugekommen ---------------------------------------------
    for kennung, termin in neue_nach_id.items():
        if kennung in alte_nach_id:
            continue
        # Lag der Termin schon im alten Zeitfenster? Wenn nicht, ist er
        # nicht wirklich neu - wir haben ihn vorher nur nicht gesehen.
        if altes_fenster_bis and termin["start"] > altes_fenster_bis:
            continue
        aenderungen.append({
            "typ": "neu",
            "termin": termin,
            "felder": [],
        })

    # --- Entfallen ------------------------------------------------------
    for kennung, termin in alte_nach_id.items():
        if kennung in neue_nach_id:
            continue
        # Faellt der Termin nur hinten aus dem Zeitfenster? Dann schweigen.
        if neues_fenster_von and termin["start"] < neues_fenster_von:
            continue
        aenderungen.append({
            "typ": "entfallen",
            "termin": termin,
            "felder": [],
        })

    # --- Geaendert ------------------------------------------------------
    for kennung, neuer_termin in neue_nach_id.items():
        alter_termin = alte_nach_id.get(kennung)
        if not alter_termin:
            continue
        unterschiede = []
        for feldname, anzeigename in VERGLICHENE_FELDER:
            vorher = alter_termin.get(feldname, "")
            nachher = neuer_termin.get(feldname, "")
            if vorher != nachher:
                unterschiede.append({
                    "feld": anzeigename,
                    "vorher": vorher,
                    "nachher": nachher,
                })
        if unterschiede:
            aenderungen.append({
                "typ": "geaendert",
                "termin": neuer_termin,
                "felder": unterschiede,
            })

    aenderungen.sort(key=lambda a: a["termin"]["start"])
    return aenderungen


# ===========================================================================
# 5. Benachrichtigen
# ===========================================================================

def applescript_text(wert):
    """
    Verpackt einen Text so, dass AppleScript ihn als Zeichenkette versteht.
    Anfuehrungszeichen und Backslashes muessen maskiert werden, sonst bricht
    ein Termintitel mit Anfuehrungszeichen das Skript.
    """
    sicher = wert.replace("\\", "\\\\").replace('"', '\\"')
    return '"' + sicher + '"'


def mitteilung_senden(titel, untertitel, text):
    """
    Zeigt eine macOS-Mitteilung an. "osascript" ist bei macOS dabei, es wird
    also nichts zusaetzlich installiert.

    Auf dem GitHub-Server gibt es weder Bildschirm noch osascript - dort wird
    die Meldung nur ins Protokoll geschrieben.
    """
    if LAEUFT_AUF_SERVER or sys.platform != "darwin":
        print("   (keine Mitteilung moeglich - Lauf ohne Bildschirm)")
        return

    befehl = (
        "display notification " + applescript_text(text)
        + " with title " + applescript_text(titel)
        + " subtitle " + applescript_text(untertitel)
        + ' sound name "Glass"'
    )
    try:
        subprocess.run(["osascript", "-e", befehl], check=False, timeout=20)
    except Exception as fehler:
        print("Mitteilung konnte nicht gesendet werden: " + str(fehler))


def datum_lesbar(zeitpunkt):
    """Macht aus "2026-08-10T08:00" die Anzeige "Mo 10.08. 08:00"."""
    try:
        moment = datetime.strptime(zeitpunkt, "%Y-%m-%dT%H:%M")
    except ValueError:
        return zeitpunkt
    wochentage = ["Mo", "Di", "Mi", "Do", "Fr", "Sa", "So"]
    return (wochentage[moment.weekday()] + " "
            + moment.strftime("%d.%m. %H:%M"))


def aenderung_als_satz(aenderung):
    """Formuliert eine einzelne Aenderung als kurzen, lesbaren Satz."""
    termin = aenderung["termin"]
    titel = termin["titel"] or "Termin"
    # Mit Endzeit, damit man aus der Mitteilung heraus weiss, wie lange der
    # Termin dauert - ohne erst das Dashboard aufmachen zu muessen.
    wann = datum_lesbar(termin["start"]) + "-" + termin["ende"][11:16]

    if aenderung["typ"] == "neu":
        return "NEU: " + titel + " am " + wann

    if aenderung["typ"] == "entfallen":
        return "ENTFAELLT: " + titel + " am " + wann

    teile = []
    for unterschied in aenderung["felder"]:
        vorher = unterschied["vorher"] or "(leer)"
        nachher = unterschied["nachher"] or "(leer)"
        if unterschied["feld"] in ("Beginn", "Ende"):
            vorher = datum_lesbar(vorher)
            nachher = datum_lesbar(nachher)
        teile.append(unterschied["feld"] + ": " + vorher + " -> " + nachher)
    return titel + " (" + wann + ") - " + "; ".join(teile)


def ist_belegt(termin):
    """
    Sagt, ob ein Termin zu deinem Stundenplan gehoert.

    Zwei Bedingungen, beide muessen erfuellt sein:
      1. das Fach steht nicht in NICHT_BELEGTE_FAECHER
      2. die Dozentenangabe enthaelt keine fremde Kursgruppe

    Diese eine Funktion entscheidet ueberall - beim Benachrichtigen, in der
    Kalenderdatei und (ueber daten/plan.js) im Dashboard. So kann keine der
    Stellen versehentlich anders filtern als die anderen.
    """
    if termin["titel"] in NICHT_BELEGTE_FAECHER:
        return False
    dozent = termin.get("dozent", "")
    for gruppe in NICHT_BELEGTE_GRUPPEN:
        if gruppe in dozent:
            return False
    return True


def betrifft_dich(aenderung):
    """
    Sagt, ob eine Aenderung einen Termin betrifft, den du besuchst. Nur solche
    fuehren zu einer Mitteilung.
    """
    return ist_belegt(aenderung["termin"])


def ueber_aenderungen_benachrichtigen(aenderungen):
    """
    Fasst die Aenderungen zu einer Mitteilung zusammen. Mitteilungen sind
    kurz, deshalb kommen nur die ersten paar in den Text - der Rest steht
    im Dashboard.
    """
    anzahl = len(aenderungen)
    if anzahl == 1:
        untertitel = "1 Aenderung"
    else:
        untertitel = str(anzahl) + " Aenderungen"

    saetze = [aenderung_als_satz(a) for a in aenderungen[:3]]
    if anzahl > 3:
        saetze.append("... und " + str(anzahl - 3) + " weitere")

    mitteilung_senden("Stundenplan geaendert", untertitel, "\n".join(saetze))


# ===========================================================================
# 6. Ergebnisse speichern
# ===========================================================================

def jetzt_berlin():
    """
    Die aktuelle Zeit in Berlin - egal, wo das Skript laeuft.

    Das ist kein Schoenheitsfehler: dein Mac steht auf Berliner Zeit, die
    GitHub-Server laufen in Weltzeit (UTC). Ohne diese Umrechnung stuende im
    Dashboard nach einem Lauf bei GitHub "zuletzt geprueft: 08:52", obwohl es
    in Berlin 10:52 war.

    Zurueck kommt eine Zeit ohne angeheftete Zeitzone, damit sie sich wie
    bisher vergleichen und formatieren laesst.
    """
    return datetime.now(ZEITZONE_BERLIN).replace(tzinfo=None)


def stunden_seit(zeitangabe):
    """
    Wie viele Stunden ist ein Zeitpunkt her? Bei unbekanntem oder unlesbarem
    Wert kommt eine sehr grosse Zahl zurueck - dann gilt es als "lange her".
    """
    if not zeitangabe:
        return 1e9
    try:
        moment = datetime.strptime(zeitangabe, "%Y-%m-%dT%H:%M")
    except ValueError:
        return 1e9
    return (jetzt_berlin() - moment).total_seconds() / 3600


def stand_laden():
    """Liest den zuletzt gespeicherten Stand. Beim ersten Lauf gibt es keinen."""
    if not os.path.exists(DATEI_STAND):
        return None
    try:
        with open(DATEI_STAND, "r", encoding="utf-8") as datei:
            return json.load(datei)
    except (ValueError, OSError) as fehler:
        print("Alter Stand nicht lesbar (" + str(fehler)
              + ") - wird als Erstlauf behandelt.")
        return None


def stand_speichern(daten):
    with open(DATEI_STAND, "w", encoding="utf-8") as datei:
        json.dump(daten, datei, ensure_ascii=False, indent=1)


def ical_text(wert):
    """
    Maskiert Sonderzeichen fuer ein iCal-Textfeld. Komma, Semikolon und
    Backslash haben im Format eine eigene Bedeutung und muessen deshalb mit
    einem Backslash entwertet werden.
    """
    return (wert.replace("\\", "\\\\")
                .replace(";", "\\;")
                .replace(",", "\\,")
                .replace("\n", "\\n"))


def ical_zeile_falten(zeile):
    """
    Bricht eine zu lange Zeile nach den Regeln des iCal-Formats um.

    Erlaubt sind 75 Zeichen pro Zeile - genauer: 75 Bytes, und Umlaute
    brauchen zwei davon. Fortsetzungszeilen beginnen mit einem Leerzeichen.
    Genau dieses Umbrechen haben wir beim Einlesen in zeilen_entfalten()
    rueckgaengig gemacht; hier ist die Gegenrichtung.
    """
    if len(zeile.encode("utf-8")) <= 73:
        return zeile

    teile = []
    aktuell = b""
    for zeichen in zeile:
        zeichen_bytes = zeichen.encode("utf-8")
        # Die erste Zeile darf etwas laenger sein: bei den Folgezeilen geht
        # ein Byte fuer das fuehrende Leerzeichen drauf.
        grenze = 73 if not teile else 72
        if len(aktuell) + len(zeichen_bytes) > grenze:
            teile.append(aktuell)
            aktuell = b""
        aktuell += zeichen_bytes
    teile.append(aktuell)

    return "\r\n ".join(teil.decode("utf-8") for teil in teile)


def als_utc(zeitangabe):
    """
    Rechnet "2026-08-10T08:00" (Berliner Zeit) in die iCal-Schreibweise in
    Weltzeit um: "20260810T060000Z". Das Z am Ende heisst "UTC".
    Sommer- und Winterzeit werden dabei automatisch beruecksichtigt.
    """
    moment = datetime.strptime(zeitangabe, "%Y-%m-%dT%H:%M")
    moment = moment.replace(tzinfo=ZEITZONE_BERLIN)
    return moment.astimezone(ZEITZONE_UTC).strftime("%Y%m%dT%H%M%SZ")


def kalender_schreiben(termine):
    """
    Schreibt eine Kalenderdatei mit nur den Faechern, die du belegst - zum
    Abonnieren in der iPhone-Kalender-App.

    Die Kennung (UID) jedes Termins wird aus dem Originalplan uebernommen.
    Dadurch erkennt der Kalender bei einer Aktualisierung, dass es sich um
    denselben Termin handelt, und verschiebt ihn, statt einen zweiten
    daneben anzulegen.
    """
    meine_termine = [t for t in termine if ist_belegt(t)]
    erzeugt_am = datetime.now(ZEITZONE_UTC).strftime("%Y%m%dT%H%M%SZ")

    zeilen = [
        "BEGIN:VCALENDAR",
        "VERSION:2.0",
        "PRODID:-//stundenplan-dashboard//HWR Berlin//DE",
        "CALSCALE:GREGORIAN",
        "METHOD:PUBLISH",
        "X-WR-CALNAME:" + ical_text(
            FACHRICHTUNG.capitalize() + " " + SEMESTER.replace("semester", "Sem. ")),
        "X-WR-TIMEZONE:Europe/Berlin",
        # Beide Angaben sagen dasselbe: bitte stuendlich neu laden. Die eine
        # versteht Apple, die andere ist die offizielle Schreibweise.
        "REFRESH-INTERVAL;VALUE=DURATION:PT1H",
        "X-PUBLISHED-TTL:PT1H",
    ]

    for termin in meine_termine:
        # Eine Anmerkung wie "ONLINE" oder "Klausur" gehoert in den Titel -
        # im Kalender sieht man oft nur den.
        titel = termin["titel"]
        if termin["anmerkung"]:
            titel += " · " + termin["anmerkung"]

        beschreibung = []
        if termin["dozent"]:
            beschreibung.append("Dozent: " + termin["dozent"])
        if termin["art"]:
            beschreibung.append("Art: " + termin["art"])
        if termin["anmerkung"]:
            beschreibung.append("Anmerkung: " + termin["anmerkung"])
        if termin.get("korrektur"):
            beschreibung.append("Korrigiert: " + termin["korrektur"])

        zeilen.extend([
            "BEGIN:VEVENT",
            "UID:" + termin["id"],
            "DTSTAMP:" + erzeugt_am,
            "DTSTART:" + als_utc(termin["start"]),
            "DTEND:" + als_utc(termin["ende"]),
            "SUMMARY:" + ical_text(titel),
            "LOCATION:" + ical_text(termin["raum"]),
            "DESCRIPTION:" + ical_text("\n".join(beschreibung)),
            "END:VEVENT",
        ])

    zeilen.append("END:VCALENDAR")

    # Das iCal-Format schreibt Windows-Zeilenenden vor (CRLF).
    inhalt = "\r\n".join(ical_zeile_falten(z) for z in zeilen) + "\r\n"
    with open(DATEI_KALENDER, "w", encoding="utf-8", newline="") as datei:
        datei.write(inhalt)

    return len(meine_termine)


def dashboard_schreiben(termine, aenderungsverlauf, geprueft_am, fenster):
    """
    Schreibt die Datei, die das Dashboard einliest. Es ist gueltiges
    JavaScript: eine einzige Zuweisung an eine Variable.
    """
    inhalt = {
        "fachrichtung": FACHRICHTUNG,
        "semester": SEMESTER,
        "kurs": KURS,
        "quelle": STUNDENPLAN_URL,
        # Wird vom Dashboard als Vorgabe fuer den Faecherfilter benutzt, damit
        # die Liste nur an einer Stelle gepflegt werden muss.
        "nichtBelegteFaecher": NICHT_BELEGTE_FAECHER,
        "nichtBelegteGruppen": NICHT_BELEGTE_GRUPPEN,
        "geprueftAm": geprueft_am,
        "fensterVon": fenster[0],
        "fensterBis": fenster[1],
        "termine": termine,
        "aenderungen": aenderungsverlauf,
    }
    with open(DATEI_DASHBOARD, "w", encoding="utf-8") as datei:
        datei.write("// Diese Datei wird von abgleich.py erzeugt.\n")
        datei.write("// Nicht von Hand aendern - beim naechsten Lauf wird sie ueberschrieben.\n")
        datei.write("const STUNDENPLAN = ")
        json.dump(inhalt, datei, ensure_ascii=False, indent=1)
        datei.write(";\n")


def anzeige_einstellungen():
    """
    Alles, was die Anzeige beeinflusst, ohne aus dem HWR-Plan zu stammen.

    Aendert sich hier etwas, muessen die Anzeigedateien neu geschrieben
    werden - auch wenn der Plan selbst gleich geblieben ist.

    Warum als EINE Sammlung und nicht als einzelne Vergleiche: genau daran
    ist es schon zweimal gescheitert. Erst kannte die Pruefung die
    Faecherliste nicht, dann die Zeitkorrekturen. Wer kuenftig eine weitere
    Einstellung ergaenzt, muss sie nur hier eintragen - und nicht daran
    denken, an zwei weiteren Stellen einen Vergleich nachzuziehen.
    """
    return {
        "nichtBelegteFaecher": list(NICHT_BELEGTE_FAECHER),
        "nichtBelegteGruppen": list(NICHT_BELEGTE_GRUPPEN),
        "zeitkorrekturen": ZEITKORREKTUREN,
    }


def korrekturen_anwenden(termine):
    """
    Wendet ZEITKORREKTUREN an und gibt eine NEUE Liste zurueck.

    Die uebergebene Liste bleibt unangetastet - das ist der Kern der Sache:
    gespeichert und verglichen wird der Originalplan, angezeigt die
    korrigierte Fassung. Wer das vertauscht, bekommt bei jedem Lauf eine
    erfundene Aenderungsmeldung.

    Korrigierte Termine bekommen ein Feld "korrektur" mit dem Grund, damit
    im Dashboard sichtbar ist, dass hier etwas von Hand geradegezogen wurde.
    """
    ergebnis = []
    getroffen = 0

    for termin in termine:
        neuer = dict(termin)

        for regel in ZEITKORREKTUREN:
            if neuer["titel"] != regel["titel"]:
                continue
            if neuer["start"][11:16] != regel["von"]:
                continue

            wochentag = datetime.strptime(neuer["start"][:10], "%Y-%m-%d").weekday()
            if regel.get("wochentag") is not None and wochentag != regel["wochentag"]:
                continue

            neuer["start"] = neuer["start"][:11] + regel["nach"]
            neuer["korrektur"] = regel["hinweis"]
            getroffen += 1

        ergebnis.append(neuer)

    if getroffen:
        print("   " + str(getroffen) + " Termin(e) zeitlich korrigiert")

    return ergebnis


def anzeige_schreiben(termine, verlauf, geprueft_am, fenster):
    """
    Schreibt beide Dateien, die angezeigt werden: die fuers Dashboard und die
    fuer den Kalender. Steht als eigene Funktion da, damit an den zwei
    Stellen, die sie aufrufen, nicht eine der beiden vergessen werden kann.

    Hier - und nur hier - werden die Zeitkorrekturen angewandt. Beide
    Anzeigen bekommen dadurch dieselbe korrigierte Fassung, waehrend der
    gespeicherte Vergleichsstand der Originalplan bleibt.
    """
    if not os.path.isdir(DATENORDNER):
        os.makedirs(DATENORDNER)
    korrigierte = korrekturen_anwenden(termine)
    dashboard_schreiben(korrigierte, verlauf, geprueft_am, fenster)
    kalender_schreiben(korrigierte)


# ===========================================================================
# 7. Ablauf
# ===========================================================================

def main():
    if not os.path.isdir(DATENORDNER):
        os.makedirs(DATENORDNER)

    jetzt = jetzt_berlin().strftime("%Y-%m-%dT%H:%M")
    alter_stand = stand_laden()
    erstlauf = alter_stand is None

    bekanntes_etag = ""
    if alter_stand:
        bekanntes_etag = alter_stand.get("etag", "")

    try:
        text, etag, unveraendert = kalender_herunterladen(bekanntes_etag)
    except Exception as fehler:
        # Kein Netz, Server weg, Uni-Wartung: kein Grund zur Panik. Wir
        # brechen still ab, damit der naechste Lauf es erneut versucht.
        print("Abruf fehlgeschlagen: " + str(fehler))
        return 1

    if unveraendert and alter_stand:
        # Der Server sagt, die Datei ist unveraendert seit dem letzten Mal.
        alter_stand["geprueftAm"] = jetzt
        print(jetzt + "  unveraendert (Server meldet 304)")

        # Die Anzeigedateien werden hier bewusst NICHT jedes Mal neu
        # geschrieben. Sie enthalten den Zeitstempel der letzten Pruefung,
        # aendern sich dadurch bei jedem Lauf - und die GitHub-Automatik
        # wuerde daraus alle 30 Minuten einen Commit machen. Einmal am Tag
        # genuegt, damit auf dem Handy nicht "Stand: letzte Woche" steht.
        #
        # Eine Ausnahme: wurde NICHT_BELEGTE_FAECHER von Hand geaendert, muss
        # das sofort sichtbar werden und nicht erst morgen.
        faecher_geaendert = (
            alter_stand.get("einstellungen") != anzeige_einstellungen())
        if faecher_geaendert:
            print("   Faecherliste wurde geaendert")
        if (faecher_geaendert
                or stunden_seit(alter_stand.get("geschriebenAm", ""))
                    >= AUFFRISCHEN_NACH_STUNDEN):
            anzeige_schreiben(
                alter_stand.get("termine", []),
                alter_stand.get("aenderungen", []),
                jetzt,
                (alter_stand.get("fensterVon", ""), alter_stand.get("fensterBis", "")),
            )
            alter_stand["geschriebenAm"] = jetzt
            alter_stand["einstellungen"] = anzeige_einstellungen()
            print("   Anzeigedateien aufgefrischt")

        stand_speichern(alter_stand)
        return 0

    neue_termine, fenster_von, fenster_bis = kalender_zerlegen(text)
    if not neue_termine:
        print("Die Datei enthielt keine Termine - alter Stand bleibt erhalten.")
        return 1

    verlauf = []
    aenderungen = []

    if erstlauf:
        print("Erster Lauf: " + str(len(neue_termine))
              + " Termine gespeichert. Ab jetzt wird verglichen.")
    else:
        aenderungen = plaene_vergleichen(
            alter_stand.get("termine", []),
            neue_termine,
            alter_stand.get("fensterBis", ""),
            fenster_von,
        )
        verlauf = alter_stand.get("aenderungen", [])

        if aenderungen:
            # Neueste Aenderungen kommen nach vorn.
            eintrag = {
                "erkanntAm": jetzt,
                "anzahl": len(aenderungen),
                "eintraege": aenderungen,
            }
            verlauf = [eintrag] + verlauf
            verlauf = verlauf[:MAXIMALE_ANZAHL_AENDERUNGEN]

            # Aufgezeichnet wird alles (siehe oben, "verlauf"). Gemeldet wird
            # nur, was ein belegtes Fach betrifft. Im Protokoll steht trotzdem
            # jede Zeile - die stummen sind mit "(stumm)" gekennzeichnet, damit
            # man spaeter nachvollziehen kann, was passiert ist.
            zu_melden = [a for a in aenderungen if betrifft_dich(a)]

            print(jetzt + "  " + str(len(aenderungen)) + " Aenderung(en), davon "
                  + str(len(zu_melden)) + " in belegten Faechern:")
            for aenderung in aenderungen:
                vorsatz = "   - " if betrifft_dich(aenderung) else "   - (stumm) "
                print(vorsatz + aenderung_als_satz(aenderung))

            if zu_melden:
                ueber_aenderungen_benachrichtigen(zu_melden)
        else:
            # Die Datei war neu, aber inhaltlich gleich - das passiert, wenn
            # der Plan neu erzeugt wurde, ohne dass sich etwas geaendert hat.
            print(jetzt + "  neue Datei, aber keine inhaltliche Aenderung")

    # Neu schreiben lohnt nur, wenn sich am Inhalt wirklich etwas getan hat.
    #
    # Verglichen wird die Terminliste selbst und nicht bloss, ob es etwas zu
    # melden gab: an den Raendern des Zeitfensters kommen und gehen Termine,
    # ohne dass das eine Meldung wert waere - auf dem Handy sollen sie aber
    # trotzdem stimmen.
    alte_termine = [] if erstlauf else alter_stand.get("termine", [])
    geschrieben_am = "" if erstlauf else alter_stand.get("geschriebenAm", "")
    alte_einstellungen = None if erstlauf else alter_stand.get("einstellungen")

    if (erstlauf or aenderungen or neue_termine != alte_termine
            or alte_einstellungen != anzeige_einstellungen()
            or stunden_seit(geschrieben_am) >= AUFFRISCHEN_NACH_STUNDEN):
        anzeige_schreiben(neue_termine, verlauf, jetzt, (fenster_von, fenster_bis))
        geschrieben_am = jetzt

    stand_speichern({
        "etag": etag,
        "geprueftAm": jetzt,
        "geschriebenAm": geschrieben_am,
        "einstellungen": anzeige_einstellungen(),
        "fensterVon": fenster_von,
        "fensterBis": fenster_bis,
        "termine": neue_termine,
        "aenderungen": verlauf,
    })
    return 0


if __name__ == "__main__":
    sys.exit(main())
