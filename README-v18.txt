SichtungsApp v18 – Gast-/Schreibrechte

1) GitHub
- index.html ersetzen
- access.js neu in die Repository-Wurzel hochladen
- app.js bleibt auf dem aktuellen v17-Stand
- admin.js bleibt unverändert

2) Firebase
Firestore Database -> Regeln
Den kompletten Inhalt durch firestore.rules ersetzen und veröffentlichen.

Verhalten:
- Gast/anonym: Karte, Spots, Sichtungen, Arten, Wetter, Planer und Potenzialflächen ansehen
- Gast/anonym: kein Spot, keine Sichtung, kein Import
- Angemeldet: Spots/Sichtungen erstellen und aktualisieren
- Gesperrter Nutzer: serverseitig keine Schreibrechte
- Admin: zusätzlich Löschen, Nutzerverwaltung, Aktivitätsprotokoll

Wichtig:
Die Firestore-Regeln sind die eigentliche Sicherheitsgrenze.
access.js ist nur die Benutzeroberfläche und verhindert zusätzlich versehentliche Schreibversuche.
