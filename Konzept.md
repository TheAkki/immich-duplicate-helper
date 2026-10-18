# Konzept Immich-Duplicate Suche
## Motivation
In der heutigen Zeit werden Bilder oft über Instant-Messenger wie Threema, Whats-App und so weiter verteilt und man mehrere Versionen ein und desselben Bildes.
Immich unterstützt externe Bibliotheken und die Duplikatssuche.
In meinen Konzept werden die wichtige, originalen Bilder in einer externen (schreibgeschützten) Bibliothek gespeichert.
Um Speicher zu sparen sollen die doppelten Bilder gelöscht werden können. Dafür sollen unterschiedliche Regeln auswählbar sein.
Außerdem sollen auch Stacks als solche markiert werden können.

# Software-Aufbau
Die "Software" soll eine lokale HTML Datei mit Javascript sein. Diese hat Eingabefelder für
- Immich-Server
- Access Token
- Checkboxen und Radioboxen für die Regeln

Darunter wird eine Vorschau der Entscheidungen gemacht welche Versionen des Bildes bei welchen "Original" gelöscht werden sollen.
Es gibt die Option "Alle Vorschläge löschen" und für jedes Original "Vorschläge löschen".
Für die Vorschlage werden die Begründung angegeben, warum dies der Vorschlag ist.
Unterhalb jedes Bildes sollen relevante Eigenschaften aufgelistet sein.
- Dateiname und Pfad
- Schreibschutz
- Auflösung
- Exifdaten vorhanden? (Wenn ja: welche)
- Dateigröße
- In Alben vorhanden? (Wenn ja: Welche)

Die Sprache soll umschaltbar Deutsch und Englisch sein. (Offen für weitere.)

# Regeln
Folgende Regeln sollen Bilder bevorzugen.
- Liegt in einer (externen) Bibliothek
- Schreibschutz
- Hat die höhere Auflösung
- Hat bessere Exif-Daten
- Größere Datei
- Ist in einen bestimmten Album enthalten
- Hat bestimmte Tags

Um wirkliche Dupletten und nicht nur eine Serie zu erkennen zu können sollen auch harte Regeln als solche anwählbar sein. Die folgenden Regeln haben eine UND-Verknüpfung.
- Dateinamen matcht
- Zeitstempel.

Es gibt außerdem Regeln um die Bewertung ob eine Datei eine Duplette ist zu beeinflussen. Diese Regeln führen dazu, dass eine Datei bevorzugt eine Duplette ist.
- In einer Liste von Alben vorhanden
- Dateinamenschema
- Hat bestimmte Tags

# Filter
Es sollen Anzeigefilter verfügbar sein.
Z.B.
- nur schreibgeschützte Bilder ausblenden
- Duplikate ausblenden, wenn alle Kopien bereits mit dem Duplikate-Tag getaggt sind