# Firewatch Radar

Repair v6 restores the correct HTML dashboard at `index.html` and moves the data update code back to `scripts/update-firewatch.js`.

Verification:
- The live site should show `Build: repair-v6-html-restored-strict-fire`.
- `index.html` must begin with `<!doctype html>`.
- `scripts/update-firewatch.js` may begin with `import fs from 'fs/promises';`.
- Active results are limited to 100-199 fire incident codes.
