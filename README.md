# Firewatch Radar

Build: v14-charlottefd-social-scrape

This build keeps the v13 source guard and opened-card highlight, then adds an opportunistic no-key CharlotteFD social scrape layer.

Primary data remains the Charlotte CFD public incident dataset. The social layer tries to read public CharlotteFD/X posts and add recent fire-related leads when a fire signal is found. If X blocks access or changes its markup, the tracker logs the issue and continues using the CFD dataset without wiping existing data.
