# Firewatch Radar

Standalone fire-focused prospecting intelligence dashboard.

## What it does

- Pulls public Charlotte Fire incident data where available.
- Filters fire and fire-adjacent events.
- Scores restoration/reconstruction opportunity potential.
- Keeps fires from the last six months unless older items have an active opportunity signal.
- Publishes a static GitHub Pages dashboard.

## Setup

1. Create a new GitHub repo named `firewatch-radar`.
2. Upload all files from this ZIP into the repo.
3. Go to **Settings > Pages**.
4. Set source to **Deploy from a branch**.
5. Select `main` branch and root folder `/`.
6. Go to **Actions** and enable workflows if prompted.
7. Run **Update Firewatch Radar** manually once.

## Notes

The starter script uses the City of Charlotte public incident reports ArcGIS service as the first source layer. Add additional counties, social sources, and permit searches into `scripts/update-firewatch.js` as you expand the tracker.
