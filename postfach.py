#!/usr/bin/env python3
# -*- coding: utf-8 -*-
"""
Schaut ins HWR-Postfach und meldet neue Mails aufs Handy.

WAS DIESES SKRIPT NICHT TUT

  Es speichert keine Mails. Nirgends. Es merkt sich genau zwei Zahlen -
  welche Nachricht zuletzt gesehen wurde und zu welchem Postfachstand die
  Zaehlung gehoert. Sonst nichts.

  Es liest Mails auch nicht als gelesen. Der Abruf benutzt BODY.PEEK, das
  ist die Fassung, die den "gelesen"-Haken NICHT setzt. Ohne PEEK waeren
  nach dem ersten Lauf alle Mails im Postfach als gelesen markiert, und man
  wuesste nicht mehr, was man wirklich schon gesehen hat.

WO DAS PASSWORT LIEGT

  Im macOS-Schluesselbund, abgelegt von Friedrich selbst. Es steht nirgends
  in dieser Datei, in keiner Konfiguration und in keinem Protokoll. Das
  Skript fragt es beim Lauf ab und behaelt es nur im Arbeitsspeicher.

  Das ist keine Uebervorsicht: der HWR-Login ist derselbe fuer Moodle und
  die Pruefungsverwaltung. Ein Passwort in einer Datei waere ein Passwort
  fuer das ganze Hochschulkonto.

WARUM NUR AUF DEM MAC

  Genau deshalb. Fuer einen Lauf rund um die Uhr muesste das Passwort auf
  einem fremden Server liegen. Der Preis dafuer ist, dass nachts und
  unterwegs keine Meldung kommt - der Mac muss an und angemeldet sein.

WAS DENNOCH DAS HAUS VERLAESST

  Der Text der Benachrichtigung, also Absender und Betreff. Er geht an die
  Absenderfunktion bei Supabase und von dort an Apples Push-Dienst.
  Gespeichert wird er bei beiden nicht, aber er laeuft dort durch. Wer das
  nicht will, setzt NUR_ANZAHL_MELDEN unten auf True: dann steht in der
  Meldung nur "2 neue Mails" und sonst nichts.

Aufruf:  python3 postfach.py
Einrichten: bash postfach-einschalten.sh
"""

import email
import email.header
import email.utils
import imaplib
import json
import os
import ssl
import subprocess
import sys
import urllib.error
import urllib.request
from datetime import datetime

# ===========================================================================
# Einstellungen
# ===========================================================================

IMAP_SERVER = "imap.stud.hwr-berlin.de"
IMAP_PORT = 993
POSTFACH = "INBOX"

# Unter diesem Namen liegen Passwort und Melde-Geheimnis im Schluesselbund.
# Angelegt werden sie von postfach-einschalten.sh.
SCHLUESSELBUND_DIENST = "imap.stud.hwr-berlin.de"
SCHLUESSELBUND_GEHEIMNIS = "stundenplan-melde-geheimnis"

ABSENDER_URL = ("https://copydwpdqpnwjvknsakz.supabase.co"
                "/functions/v1/stundenplan-melden")

# Wie viele Mails namentlich in der Meldung stehen. Auf dem Sperrbildschirm
# ist ohnehin nach zwei, drei Zeilen Schluss.
HOECHSTENS_NENNEN = 3

# True: die Meldung nennt nur die Anzahl, keine Absender und Betreffs. Dann
# verlaesst kein Inhalt aus dem Postfach den Rechner.
NUR_ANZAHL_MELDEN = False

PROJEKTORDNER = os.path.dirname(os.path.abspath(__file__))
DATENORDNER = os.environ.get("STUNDENPLAN_DATEN") \
    or os.path.join(PROJEKTORDNER, "daten")
DATEI_STAND = os.path.join(DATENORDNER, "postfach-stand.json")


# ===========================================================================
# Schluesselbund
# ===========================================================================

def aus_schluesselbund(art, dienst):
    """
    Holt ein Geheimnis aus dem macOS-Schluesselbund.

    "security" gibt das Passwort auf der Standardausgabe zurueck, wenn man
    -w mitgibt. Es taucht damit nirgends in einer Befehlszeile auf, die in
    einer Prozessliste sichtbar waere.
    """
    befehl = ["security", art, "-s", dienst, "-w"]
    ergebnis = subprocess.run(befehl, capture_output=True, text=True)
    if ergebnis.returncode != 0:
        return None
    return ergebnis.stdout.strip() or None


def benutzername_aus_schluesselbund(dienst):
    """
    Der Benutzername steht als Attribut am selben Eintrag.

    Er wird nicht in dieser Datei festgeschrieben, weil er von Friedrichs
    Matrikel abhaengt - und weil eine Stelle weniger zu pflegen ist, wenn
    Passwort und Name zusammen im Schluesselbund liegen.
    """
    ergebnis = subprocess.run(["security", "find-internet-password", "-s", dienst],
                              capture_output=True, text=True)
    if ergebnis.returncode != 0:
        return None
    for zeile in ergebnis.stdout.splitlines():
        if '"acct"' in zeile and "=" in zeile:
            # Zeilenform:  "acct"<blob>="benutzername"
            wert = zeile.split("=", 1)[1].strip()
            return wert.strip('"') or None
    return None


# ===========================================================================
# Stand merken
# ===========================================================================

def stand_lesen():
    try:
        with open(DATEI_STAND, encoding="utf-8") as datei:
            return json.load(datei)
    except (OSError, ValueError):
        return {}


def stand_schreiben(uidvalidity, letzte_uid):
    os.makedirs(DATENORDNER, exist_ok=True)
    with open(DATEI_STAND, "w", encoding="utf-8") as datei:
        json.dump({
            "uidvalidity": uidvalidity,
            "letzteUid": letzte_uid,
            "geprueftAm": datetime.now().strftime("%Y-%m-%dT%H:%M"),
        }, datei, ensure_ascii=False, indent=1)


# ===========================================================================
# Kopfzeilen lesbar machen
# ===========================================================================

def kopf_entziffern(roh):
    """
    Macht aus "=?UTF-8?B?TmV1ZSBOb3Rl?=" wieder "Neue Note".

    Betreffs mit Umlauten werden in Mails verschluesselt uebertragen - nicht
    aus Geheimhaltung, sondern weil das Mailformat von 1982 nur ASCII kennt.
    Ohne diese Umwandlung stuende auf dem Sperrbildschirm Kauderwelsch.
    """
    if not roh:
        return ""
    teile = []
    for text, kodierung in email.header.decode_header(roh):
        if isinstance(text, bytes):
            try:
                teile.append(text.decode(kodierung or "utf-8", "replace"))
            except (LookupError, UnicodeDecodeError):
                teile.append(text.decode("utf-8", "replace"))
        else:
            teile.append(text)
    return " ".join("".join(teile).split())


def absender_kurz(roh):
    """Nur der Name, oder die Adresse, wenn kein Name dasteht."""
    name, adresse = email.utils.parseaddr(kopf_entziffern(roh))
    return name or adresse or "Unbekannt"


# ===========================================================================
# Welche Nachrichten sind wirklich neu
#
# Diese drei Funktionen stehen fuer sich, weil an ihnen alles haengt und
# weil sie sich ohne Postfach pruefen lassen - siehe tests/test_postfach.py.
# ===========================================================================

def neue_nummern(gefundene, letzte_uid):
    """
    Filtert die Antwort auf eine Suche nach "UID n:*".

    Das ist die beruehmteste Falle in IMAP: "n:*" liefert IMMER mindestens
    eine Nachricht. Liegt keine mit einer Nummer ab n vor, gibt der Server
    trotzdem die hoechste vorhandene zurueck - die Regel lautet, dass ein
    Bereich nie leer sein darf.

    Ohne diese Nachpruefung wuerde bei jedem Lauf dieselbe alte Mail erneut
    gemeldet. Alle fuenf Minuten, bis eine neue kommt.
    """
    return sorted(nummer for nummer in gefundene if nummer > letzte_uid)


def zu_meldende(neue, ungelesen):
    """
    Von den neuen nur die, die noch niemand gelesen hat.

    Wer die Mail in der Zwischenzeit am Handy geoeffnet hat, braucht keine
    Mitteilung mehr darueber. Weitergezaehlt wird trotzdem ueber alle neuen,
    sonst taucht die gelesene beim naechsten Lauf wieder auf.
    """
    return [nummer for nummer in neue if nummer in ungelesen]


def muss_neu_anfangen(alte_gueltigkeit, neue_gueltigkeit):
    """
    Zaehlt der Server noch so wie beim letzten Mal?

    UIDVALIDITY ist die Nummer des Postfachstands. Aendert sie sich, hat der
    Server die Nummerierung neu begonnen - etwa nach einem Umzug des
    Postfachs. Die gemerkte letzte Nummer bedeutet dann etwas voellig
    anderes. Wer das uebersieht, meldet entweder gar nichts mehr oder auf
    einen Schlag das halbe Postfach.
    """
    if alte_gueltigkeit is None:
        return True                      # erster Lauf
    if not neue_gueltigkeit:
        return False                     # Server sagt nichts dazu - dabei bleiben
    return str(alte_gueltigkeit) != str(neue_gueltigkeit)


# ===========================================================================
# Melden
# ===========================================================================

def melden(titel, text, geheimnis):
    """Schickt die Benachrichtigung ueber dieselbe Kette wie der Stundenplan."""
    nutzlast = json.dumps({
        "geheimnis": geheimnis,
        "titel": titel,
        "text": text,
        # Eigene Marke: eine Mail-Meldung soll eine Stundenplan-Meldung nicht
        # verdraengen und umgekehrt.
        "marke": "postfach",
    }).encode("utf-8")

    anfrage = urllib.request.Request(
        ABSENDER_URL, data=nutzlast,
        headers={"Content-Type": "application/json"}, method="POST")
    try:
        with urllib.request.urlopen(anfrage, timeout=30) as antwort:
            return json.loads(antwort.read().decode("utf-8"))
    except urllib.error.HTTPError as ausnahme:
        return {"fehler": "%d %s" % (ausnahme.code,
                                     ausnahme.read().decode("utf-8")[:200])}
    except Exception as ausnahme:
        return {"fehler": str(ausnahme)}


# ===========================================================================
# Hauptlauf
# ===========================================================================

def main():
    jetzt = datetime.now().strftime("%Y-%m-%dT%H:%M")

    benutzer = benutzername_aus_schluesselbund(SCHLUESSELBUND_DIENST)
    passwort = aus_schluesselbund("find-internet-password", SCHLUESSELBUND_DIENST)
    geheimnis = aus_schluesselbund("find-generic-password", SCHLUESSELBUND_GEHEIMNIS)

    if not benutzer or not passwort:
        print(jetzt + "  Kein Zugang im Schluesselbund. "
                      "Einmal 'bash postfach-einschalten.sh' ausfuehren.")
        return 1
    if not geheimnis:
        print(jetzt + "  Melde-Geheimnis fehlt im Schluesselbund. "
                      "Siehe postfach-einschalten.sh.")
        return 1

    try:
        verbindung = imaplib.IMAP4_SSL(IMAP_SERVER, IMAP_PORT,
                                       ssl_context=ssl.create_default_context())
    except Exception as ausnahme:
        print(jetzt + "  Keine Verbindung zum Mailserver: " + str(ausnahme))
        return 1

    try:
        verbindung.login(benutzer, passwort)
    except Exception as ausnahme:
        # Absichtlich ohne Einzelheiten: eine Fehlermeldung mit Benutzernamen
        # landete sonst im Protokoll.
        print(jetzt + "  Anmeldung abgelehnt. Passwort im Schluesselbund pruefen.")
        verbindung.logout()
        return 1

    try:
        lage, antwort = verbindung.select(POSTFACH, readonly=True)
        if lage != "OK":
            print(jetzt + "  Postfach " + POSTFACH + " nicht gefunden.")
            return 1

        lage, roh = verbindung.status(POSTFACH, "(UIDVALIDITY)")
        uidvalidity = ""
        if lage == "OK" and roh and roh[0]:
            text = roh[0].decode("utf-8", "replace")
            if "UIDVALIDITY" in text:
                uidvalidity = text.split("UIDVALIDITY")[1].strip(" ()").split()[0]

        stand = stand_lesen()
        letzte_uid = int(stand.get("letzteUid") or 0)
        alte_gueltigkeit = stand.get("uidvalidity")

        neu_anfangen = muss_neu_anfangen(alte_gueltigkeit, uidvalidity)

        # Alle Nachrichten mit hoeherer Nummer als die zuletzt gesehene.
        lage, roh = verbindung.uid("SEARCH", None, "UID", "%d:*" % (letzte_uid + 1))
        gefunden = []
        if lage == "OK" and roh and roh[0]:
            gefunden = [int(n) for n in roh[0].split()]

        neue = neue_nummern(gefunden, letzte_uid)
        hoechste = max(neue) if neue else letzte_uid

        if neu_anfangen:
            """
            Erster Lauf: nur den Stand festhalten, nichts melden.

            Sonst kaemen beim Einschalten so viele Mitteilungen, wie Mails
            im Postfach liegen. Das ist nicht bloss laestig - iOS drosselt
            eine App, die im Schwall meldet, und dann kommt spaeter auch
            das Wichtige nicht mehr durch.
            """
            hoechste = max(neue) if neue else letzte_uid
            if not neue:
                # Auch ohne Treffer die derzeit hoechste Nummer merken.
                lage, roh = verbindung.uid("SEARCH", None, "ALL")
                if lage == "OK" and roh and roh[0]:
                    alle = [int(n) for n in roh[0].split()]
                    if alle:
                        hoechste = max(alle)
            stand_schreiben(uidvalidity, hoechste)
            print(jetzt + "  Erster Lauf - Stand gemerkt (bis Nr. %d), "
                          "nichts gemeldet." % hoechste)
            return 0

        if not neue:
            print(jetzt + "  Keine neue Mail.")
            return 0

        """
        Nur melden, was noch ungelesen ist.

        Hat Friedrich die Mail in der Zwischenzeit am Handy gelesen, braucht
        er keine Mitteilung mehr darueber. Die Nummer wird trotzdem
        weitergezaehlt, damit sie nicht beim naechsten Lauf wieder auftaucht.
        """
        lage, roh = verbindung.uid("SEARCH", None, "UNSEEN")
        ungelesen = set()
        if lage == "OK" and roh and roh[0]:
            ungelesen = {int(n) for n in roh[0].split()}
        zu_melden = zu_meldende(neue, ungelesen)

        if not zu_melden:
            stand_schreiben(uidvalidity, hoechste)
            print(jetzt + "  %d neue Mail(s), alle schon gelesen - nichts gemeldet."
                  % len(neue))
            return 0

        # Kopfzeilen holen. PEEK ist entscheidend: ohne das waeren die Mails
        # danach als gelesen markiert.
        eintraege = []
        for uid in zu_melden[-HOECHSTENS_NENNEN:]:
            lage, roh = verbindung.uid(
                "FETCH", str(uid),
                "(BODY.PEEK[HEADER.FIELDS (FROM SUBJECT)])")
            if lage != "OK" or not roh or not roh[0]:
                continue
            kopf = email.message_from_bytes(roh[0][1])
            eintraege.append((absender_kurz(kopf.get("From", "")),
                              kopf_entziffern(kopf.get("Subject", "")) or "(kein Betreff)"))

        anzahl = len(zu_melden)
        titel = "1 neue Mail" if anzahl == 1 else "%d neue Mails" % anzahl

        if NUR_ANZAHL_MELDEN:
            text = "Im HWR-Postfach."
        else:
            zeilen = [absender + ": " + betreff for absender, betreff in eintraege]
            if anzahl > len(eintraege):
                zeilen.append("... und %d weitere" % (anzahl - len(eintraege)))
            text = "\n".join(zeilen)

        antwort = melden(titel, text, geheimnis)

        """
        Der Stand wird erst NACH dem Melden fortgeschrieben, und nur wenn
        es geklappt hat. Andersherum waere eine Mail verloren, sobald der
        Versand einmal scheitert - sie gaelte als erledigt, ohne dass je
        eine Mitteilung ankam.
        """
        if antwort.get("fehler"):
            print(jetzt + "  Melden fehlgeschlagen: " + str(antwort["fehler"]))
            print(jetzt + "  Stand NICHT fortgeschrieben - "
                          "beim naechsten Lauf wird es erneut versucht.")
            return 1

        stand_schreiben(uidvalidity, hoechste)
        print(jetzt + "  %s gemeldet, an %d Geraet(e) zugestellt."
              % (titel, antwort.get("zugestellt", 0)))
        for absender, betreff in eintraege:
            print("   - " + absender + ": " + betreff[:70])

    finally:
        try:
            verbindung.close()
        except Exception:
            pass
        verbindung.logout()

    return 0


if __name__ == "__main__":
    sys.exit(main())
