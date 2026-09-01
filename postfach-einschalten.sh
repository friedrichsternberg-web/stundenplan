#!/bin/bash
#
# Richtet die Mail-Benachrichtigung ein.
#
# Zwei Dinge passieren hier:
#
#   1. Dein HWR-Zugang wandert in den macOS-Schluesselbund. Du tippst ihn
#      selbst, er geht direkt an "security" und landet nie in einer Datei,
#      einem Protokoll oder einer Befehlszeile, die andere Programme sehen
#      koennten.
#
#   2. Ein Hintergrund-Job wird angelegt, der alle paar Minuten nachschaut.
#
# Aufruf:  bash postfach-einschalten.sh

set -e

# Wie oft nachgeschaut wird, in Sekunden. 300 = alle fuenf Minuten.
#
# Haeufiger lohnt nicht: der Server wird bei jedem Lauf einmal befragt, und
# fuenf Minuten sind bei einer Mail kein Unterschied. Seltener waere schade -
# dann kaeme die Meldung zu spaet, um noch etwas zu aendern.
INTERVALL=300

ORDNER="$(cd "$(dirname "${BASH_SOURCE[0]}")" && pwd)"
KENNUNG="de.hwr.stundenplan.postfach"
PLIST="$HOME/Library/LaunchAgents/$KENNUNG.plist"

DIENST="imap.stud.hwr-berlin.de"
GEHEIMNIS_NAME="stundenplan-melde-geheimnis"

echo "=============================================================="
echo " Mail-Benachrichtigung einrichten"
echo "=============================================================="
echo
echo "Dein HWR-Passwort wird im Schluesselbund abgelegt und verlaesst"
echo "diesen Mac nicht. Es steht in keiner Datei des Projekts."
echo

# --- 1. HWR-Zugang -----------------------------------------------------
if security find-internet-password -s "$DIENST" >/dev/null 2>&1; then
  echo "Ein Zugang fuer $DIENST liegt schon im Schluesselbund."
  read -r -p "Neu eintragen? [j/N] " antwort
  if [[ "$antwort" =~ ^[jJ] ]]; then
    security delete-internet-password -s "$DIENST" >/dev/null 2>&1 || true
    NEU_EINTRAGEN=ja
  fi
else
  NEU_EINTRAGEN=ja
fi

if [ "$NEU_EINTRAGEN" = "ja" ]; then
  read -r -p "HWR-Benutzername: " BENUTZER
  # -s versteckt die Eingabe. Das Passwort steht danach nur in dieser
  # Variablen und wird gleich an security weitergereicht.
  read -r -s -p "HWR-Passwort: " PASSWORT
  echo

  if [ -z "$BENUTZER" ] || [ -z "$PASSWORT" ]; then
    echo "Abgebrochen - Benutzername oder Passwort war leer."
    exit 1
  fi

  security add-internet-password \
    -s "$DIENST" -a "$BENUTZER" -w "$PASSWORT" \
    -r "imap" -P 993 \
    -j "HWR-Postfach, benutzt von postfach.py" \
    -U
  unset PASSWORT
  echo "Zugang im Schluesselbund abgelegt."
  echo
fi

# --- 2. Melde-Geheimnis ------------------------------------------------
#
# Damit darf dieser Mac Benachrichtigungen ausloesen. Es ist dasselbe, das
# auch in den GitHub Actions Secrets steht. Kein persoenliches Passwort,
# sondern ein Schluessel dieses Projekts.
if security find-generic-password -s "$GEHEIMNIS_NAME" >/dev/null 2>&1; then
  echo "Melde-Geheimnis liegt schon im Schluesselbund."
else
  echo "Jetzt das Melde-Geheimnis (dasselbe wie in den GitHub Secrets)."
  read -r -s -p "Melde-Geheimnis: " GEHEIMNIS
  echo
  if [ -z "$GEHEIMNIS" ]; then
    echo "Abgebrochen - kein Geheimnis eingegeben."
    exit 1
  fi
  security add-generic-password \
    -s "$GEHEIMNIS_NAME" -a "stundenplan" -w "$GEHEIMNIS" \
    -j "Loest Push-Benachrichtigungen aus" -U
  unset GEHEIMNIS
  echo "Abgelegt."
  echo
fi

# --- 3. Ein erster Lauf ------------------------------------------------
#
# Absichtlich VOR dem Einrichten des Jobs: er merkt sich den jetzigen Stand
# des Postfachs, ohne etwas zu melden. Ohne diesen Lauf kaemen beim ersten
# Job-Durchgang so viele Mitteilungen, wie ungelesene Mails im Postfach
# liegen - und iOS drosselt eine App, die im Schwall meldet.
echo "Erster Lauf (merkt sich den jetzigen Stand, meldet nichts):"
mkdir -p "$ORDNER/daten"
/usr/bin/python3 "$ORDNER/postfach.py" || {
  echo
  echo "Der erste Lauf hat nicht geklappt. Der Hintergrund-Job wird NICHT"
  echo "eingerichtet - sonst liefe er alle paar Minuten ins Leere."
  exit 1
}
echo

# --- 4. Hintergrund-Job ------------------------------------------------
mkdir -p "$HOME/Library/LaunchAgents"
launchctl bootout "gui/$UID/$KENNUNG" 2>/dev/null || true

cat > "$PLIST" <<PLISTENDE
<?xml version="1.0" encoding="UTF-8"?>
<!DOCTYPE plist PUBLIC "-//Apple//DTD PLIST 1.0//EN"
  "http://www.apple.com/DTDs/PropertyList-1.0.dtd">
<plist version="1.0">
<dict>
    <key>Label</key>
    <string>$KENNUNG</string>

    <key>ProgramArguments</key>
    <array>
        <string>/usr/bin/python3</string>
        <string>$ORDNER/postfach.py</string>
    </array>

    <key>StartInterval</key>
    <integer>$INTERVALL</integer>

    <key>RunAtLoad</key>
    <true/>

    <key>WorkingDirectory</key>
    <string>$ORDNER</string>

    <key>StandardOutPath</key>
    <string>$ORDNER/daten/postfach.log</string>
    <key>StandardErrorPath</key>
    <string>$ORDNER/daten/postfach.log</string>
</dict>
</plist>
PLISTENDE

launchctl bootstrap "gui/$UID" "$PLIST"

echo "=============================================================="
echo " Eingerichtet. Das Postfach wird alle $((INTERVALL / 60)) Minuten geprueft."
echo "=============================================================="
echo
echo "Wichtig: das laeuft nur, solange dieser Mac an und angemeldet ist."
echo "Nachts und unterwegs kommt keine Meldung."
echo
echo "Laeuft er?          launchctl list | grep postfach"
echo "Protokoll ansehen:  tail -f \"$ORDNER/daten/postfach.log\""
echo "Von Hand pruefen:   python3 \"$ORDNER/postfach.py\""
echo "Wieder abschalten:  bash \"$ORDNER/postfach-ausschalten.sh\""
