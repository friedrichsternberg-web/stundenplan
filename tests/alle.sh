#!/bin/bash
# Alle Testsammlungen nacheinander. Bricht beim ersten Fehlschlag ab.
#
# Aufruf:  bash tests/alle.sh
#
# Der letzte Test spricht mit der echten Ablage bei Supabase und braucht
# deshalb Netz. Er benutzt zwei feste Testraeume und ueberschreibt sie bei
# jedem Lauf - mit deinen eigenen Eintraegen hat er nichts zu tun.

cd "$(dirname "$0")/.." || exit 1
set -e

echo "== Zeitkorrekturen im Plan =="
python3 tests/test_korrektur.py

echo
echo "== Geraeteabgleich: Zusammenfuehren, Grabsteine, Code =="
osascript -l JavaScript tests/test_abgleich.js

echo
echo "== Anzeige: Zeitgruppen und die Karte 'Als Naechstes' =="
osascript -l JavaScript tests/test_ansicht.js

echo
echo "== Ablage (echter Server) =="
python3 tests/test_abgleich_ablage.py

echo
echo "ALLE SAMMLUNGEN BESTANDEN"
