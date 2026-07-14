<!doctype html>
<html lang="en">
<head>
  <meta charset="utf-8">
  <meta name="viewport" content="width=device-width, initial-scale=1">
  <title>Firewatch Radar</title>
  <link rel="stylesheet" href="styles.css">
</head>
<body>
  <header class="hero">
    <div>
      <p class="eyebrow">Standalone Fire Opportunity Tracker</p>
      <h1>Firewatch Radar</h1>
      <p class="subhead">Recent and still-actionable fire-related restoration opportunities from public information.</p>
      <p class="build">Build: <span id="buildVersion">strict-fire-v5-root-files</span></p>
    </div>
    <div class="heroActions">
      <button id="copyVisibleBtn">Copy Visible Addresses</button>
      <button id="refreshBtn">Refresh Data</button>
    </div>
  </header>

  <section class="stats" aria-label="Firewatch summary">
    <article><span id="lastUpdated">--</span><small>Last Updated</small></article>
    <article><span id="activeCount">0</span><small>Active Opportunities</small></article>
    <article><span id="highCount">0</span><small>High Priority</small></article>
    <article><span id="olderCount">0</span><small>Older But Actionable</small></article>
  </section>

  <nav class="filters" aria-label="Filters">
    <button class="filter active" data-filter="all">All</button>
    <button class="filter" data-filter="New Fire">New Fires</button>
    <button class="filter" data-filter="Multifamily">Multifamily</button>
    <button class="filter" data-filter="Commercial">Commercial</button>
    <button class="filter" data-filter="Hospitality">Hospitality</button>
    <button class="filter" data-filter="Healthcare">Healthcare</button>
    <button class="filter" data-filter="Education">Education</button>
    <button class="filter" data-filter="Single-Family Strategic">Single-Family Strategic</button>
    <button class="filter" data-filter="Brush Fire Strategic">Brush Fire Strategic</button>
    <button class="filter" data-filter="Older But Actionable">Older But Actionable</button>
    <button class="filter" data-filter="Archived">Archived</button>
  </nav>

  <main id="cards" class="cards"></main>

  <template id="cardTemplate">
    <article class="card">
      <button class="cardTop" type="button">
        <div>
          <h2 class="propertyName"></h2>
          <p class="address"></p>
          <p class="meta"></p>
        </div>
        <div class="scoreWrap"><span class="score"></span><small>Score</small></div>
      </button>
      <div class="quickActions">
        <button class="copyAddress" type="button">Copy Address</button>
        <button class="copySearch" type="button">Copy Search Line</button>
      </div>
      <div class="details" hidden>
        <div class="detailGrid">
          <section><h3>Why Flagged</h3><p class="whyFlagged"></p></section>
          <section><h3>Why This Matters</h3><p class="whyThisMatters"></p></section>
          <section><h3>Recommended Services</h3><ul class="services"></ul></section>
          <section><h3>Source</h3><p><a class="sourceLink" target="_blank" rel="noopener">Open source</a></p><p class="sourceNotes"></p></section>
        </div>
      </div>
    </article>
  </template>

  <script src="app.js" type="module"></script>
</body>
</html>
