# Firewatch Radar

Build: v10-tailored-why-this-matters

This version reads the Charlotte CFD Public Incident Reports table, scans recent records in pages, and only keeps 100-series NFIRS fire incident codes. It does not allow 300/500/600/700-series EMS, service, good-intent, or false-alarm records into the dashboard.


Why This Matters logic is now tailored by NFIRS incident code, property type, reported loss, and available action/property-use fields instead of using one generic explanation for every card.


## v11
Adds a temporary Viewed checkbox to each opportunity card. This is browser-session only: it resets when the page is reopened or when Refresh Data reloads the feed.


## v12
Adds a temporary opened-card highlight. Cards change background after they are opened during the current browser session. This is not saved and resets on page reload or data refresh.
