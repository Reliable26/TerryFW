# Firewatch Radar

Build: v15-strict-social-status-only

This build keeps the v13 source guard and opened-card highlight, then replaces the loose CharlotteFD social scrape with a strict status-only social check.

Primary data remains the Charlotte CFD public incident dataset. The social layer only creates a social lead when it can extract:

- a real CharlotteFD `/status/` post URL
- clean incident-style post text
- fire-related language
- no X login/signup/footer boilerplate

If X returns page-shell text, login language, or no clean status post, Firewatch rejects the social result and continues using the CFD dataset without wiping existing data.
