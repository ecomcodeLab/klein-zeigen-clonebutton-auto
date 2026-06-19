# Kleinanzeigen Auto Clone Bot

Ein UserScript für Tampermonkey, das automatisches Neu-Einstellen, Duplizieren und Smart-Rotation der ältesten Anzeigen auf kleinanzeigen.de ermöglicht — inklusive konfigurierbarem Autostart.

## Features

- **Copy First, Delete After:** Die Anzeige wird zuerst kopiert. Erst auf der Erfolgsseite wird die alte Anzeige gelöscht. So droht absolut kein Datenverlust.
- **Automatischer Popup-Blocker:** "Ohne Hochschieben weiter"-Popups werden vollautomatisch im Hintergrund geschlossen.
- **Non-Blocking UI:** Ein kleiner Spinner links unten zeigt den Arbeitsstatus an, blockiert aber nicht die Interaktion mit der Webseite.
- **Duplizieren:** Erstellt eine Kopie der Anzeige, Original bleibt erhalten.
- **Smart neu einstellen:** Löscht das Original und erstellt eine neue Anzeige.
- **Auto-Run:** Automatisches Neu-Einstellen mehrerer Anzeigen nach Zeitplan (Warte-Tage konfigurierbar).
- **Interaktiver Start-Countdown:** Sowohl beim Auto-Start als auch beim manuellen Start erscheint ein 10-Sekunden-Countdown-Banner mit **Abbrechen**-Option.
- **Batch-Pause:** Nach konfigurierbarer Anzahl Anzeigen automatische Pause (Anti-Ban).
- **Alle erneuern:** Checkbox um alle Anzeigen auf einmal neu einzustellen.
- **Minimier-Button:** Das Control Panel lässt sich minimieren — zeigt im minimierten Zustand den nächsten Run-Termin an.

## Installation

### Voraussetzungen
- Browser: Chrome, Brave, Firefox, Edge
- [Tampermonkey](https://www.tampermonkey.net/) Browser-Extension

### Script installieren
Klicke auf den Button, um das UserScript direkt in Tampermonkey zu installieren:

[![Install Script](https://img.shields.io/badge/Install%20Script-Tampermonkey-blue?style=for-the-badge&logo=tampermonkey)](https://github.com/ecomcodeLab/klein-zeigen-clonebutton-auto/raw/main/kleinanzeigen-backup.user.js)

> **Hinweis:** Automatische Updates funktionieren, sobald das Skript auf GitHub gehostet und die `@updateURL` / `@downloadURL` Header im Skript korrekt gesetzt sind.

## Verwendung

### Auto-Run (Zeitgesteuert)
1. Im Panel **„Warte (Tage)“** einstellen — z. B. `7` für wöchentlichen Lauf
2. **„Auto-Start“** Checkbox aktivieren
3. **„Anzahl Anzeigen“** eintragen oder **„Alle“** aktivieren
4. Auf **„Einstellungen speichern“** klicken
5. Beim nächsten Öffnen von kleinanzeigen.de (nach Erreichen des Zieldatums) startet der Countdown automatisch.

### Manueller Start
1. kleinanzeigen.de → Meine Anzeigen öffnen
2. Im Panel auf **„▶ Starten“** klicken
3. Ein 10-Sekunden-Countdown erscheint, den Sie bei Bedarf abbrechen können.

## Changelog

**6.9.0**
- Architektur-Umbau auf "Copy First, Delete After" (Kein Datenverlust mehr).
- Aggressiver automatischer Popup-Blocker (Schließt "Ohne Hochschieben weiter" Popups automatisch).
- Non-Blocking-UI: Der Spinner stört nicht mehr den Lesefluss der Website.
- Verbesserter Wartemechanismus auf der Bestätigungsseite für saubere Queue-Fortsetzung.

Siehe `CHANGELOG.md` für ältere Versionen.

## Credits

- **Original-Script:** J05HI — [Original Gist](https://gist.github.com/J05HI/9f3fc7a496e8baeff5a56e0c1a710bb5)
- **Helper-Idee:** panzli — [GitHub](https://github.com/panzli)
- **Erweiterte Version:** OldRon1977 — [GitHub](https://github.com/OldRon1977)
- **Developer:** ecomcodeLab — [GitHub](https://github.com/ecomcodeLab)

## Lizenz
MIT License — Siehe LICENSE