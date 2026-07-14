import fs from 'fs/promises';

const FIREWATCH_PATH = new URL('../data/firewatch.json', import.meta.url);
const ARCHIVED_PATH = new URL('../data/archived.json', import.meta.url);
const FIREWATCH_VERSION = 'v7-all-feed-paginated-100-code-filter';
const NOW = new Date();
const SIX_MONTHS_MS = 183 * 24 * 60 * 60 * 1000;

// Use the confirmed public incident report table and filter locally.
// This avoids the earlier problem where the separate fire-only service returned zero records.
const SOURCE_URL = 'https://data.charlottenc.gov/datasets/charlotte::cfd-public-incident-reports-all/explore';
const QUERY_BASE = 'https://gis.charlottenc.gov/arcgis/rest/services/CFD/PublicIncidentReports/MapServer/0/query';
const PAGE_SIZE = 4000;
const MAX_PAGES = 30;

function getField(attrs, names) {
  for (const name of names) {
    if (attrs[name] !== undefined && attrs[name] !== null && attrs[name] !== '') return attrs[name];
  }
  return '';
}

function normalizeDate(value) {
  if (!value) return null;
  if (typeof value === 'number') return new Date(value);
  const d = new Date(value);
  return Number.isNaN(d.getTime()) ? null : d;
}

function extractCode(text) {
  const match = String(text || '').trim().match(/^(\d{3})\b|\b(\d{3})\b/);
  if (!match) return null;
  return Number(match[1] || match[2]);
}

function is100FireCode(code) {
  return Number.isInteger(code) && code >= 100 && code <= 199;
}

function classifyProperty(text) {
  const t = String(text || '').toLowerCase();
  if (/apartment|apartments|multi-family|multifamily|multifamily dwelling/.test(t)) return 'Multifamily';
  if (/hotel|motel|extended stay|boarding|rooming/.test(t)) return 'Hospitality';
  if (/hospital|nursing|healthcare|assisted living|rehab|board and care/.test(t)) return 'Healthcare';
  if (/school|college|university|day care/.test(t)) return 'Education';
  if (/warehouse|industrial|shop|store|restaurant|retail|office|commercial|business|mall/.test(t)) return 'Commercial';
  if (/1 or 2 family|one family|two family|single family|residential/.test(t)) return 'Single-Family Strategic';
  if (/brush|woods|grass|vegetation|forest|natural cover/.test(t)) return 'Brush Fire Strategic';
  return 'Needs Property Verification';
}

function scoreItem({ propertyType, ageDays, propertyLoss, contentsLoss }) {
  let score = 20;
  if (['Multifamily','Hospitality','Healthcare','Education','Commercial'].includes(propertyType)) score += 30;
  if (ageDays <= 7) score += 25;
  else if (ageDays <= 30) score += 20;
  else if (ageDays <= 183) score += 10;
  if (Number(propertyLoss) > 0) score += 15;
  if (Number(contentsLoss) > 0) score += 5;
  return Math.min(100, score);
}

function makeOpportunity(feature) {
  const attrs = feature.attributes || {};
  const incidentType = String(getField(attrs, ['IncidentType','INCIDENTTYPE','incidenttype','Incident Type']));
  const code = extractCode(incidentType);
  if (!is100FireCode(code)) return null;

  const incidentDate = normalizeDate(getField(attrs, ['IncidentDate','INCIDENTDATE','incidentdate','AlarmDateTime','ALARMDATETIME']));
  if (!incidentDate) return null;
  const ageDays = Math.floor((NOW - incidentDate) / (24 * 60 * 60 * 1000));
  if (ageDays < 0 || ageDays > 183) return null;

  const address = String(getField(attrs, ['AddressBlock','ADDRESSBLOCK','Address','ADDRESS']) || 'Address not available');
  const propertyUse = String(getField(attrs, ['PropertyUse','PROPERTYUSE','propertyuse']));
  const action1 = String(getField(attrs, ['ActionTaken1','ACTIONTAKEN1','actiontaken1']));
  const action2 = String(getField(attrs, ['ActionTaken2','ACTIONTAKEN2','actiontaken2']));
  const action3 = String(getField(attrs, ['ActionTaken3','ACTIONTAKEN3','actiontaken3']));
  const propertyLoss = getField(attrs, ['PropertyLoss','PROPERTYLOSS','propertyloss']);
  const contentsLoss = getField(attrs, ['ContentsLoss','CONTENTSLOSS','contentsloss']);
  const incidentNumber = String(getField(attrs, ['IncidentNumber','INCIDENTNUMBER','incidentnumber']));
  const dateLoaded = normalizeDate(getField(attrs, ['dateLoaded','DATELOADED','DateLoaded']));
  const combined = [incidentType, propertyUse, action1, action2, action3].join(' | ');
  const propertyType = classifyProperty(combined);
  const opportunityScore = scoreItem({ propertyType, ageDays, propertyLoss, contentsLoss });

  return {
    propertyName: 'Property name not yet verified',
    address: address.includes('Charlotte') ? address : `${address}, Charlotte NC`,
    county: 'Mecklenburg',
    propertyType,
    fireDate: incidentDate.toISOString().slice(0,10),
    sourceTitle: 'Charlotte CFD Public Incident Reports',
    sourceUrl: SOURCE_URL,
    sourceType: 'Public incident data',
    opportunityScore,
    status: ageDays <= 7 ? 'New Fire' : 'Confirmed Fire',
    whyFlagged: `${incidentType}${propertyUse ? ' | ' + propertyUse : ''}${action1 ? ' | ' + action1 : ''}${action2 ? ' | ' + action2 : ''}`,
    whyThisMatters: 'A confirmed 100-series fire incident may create needs for fire restoration, smoke cleaning, water mitigation from suppression activity, reconstruction, roofing, exterior repair, and interior build-back. Exact property details should be verified before outreach.',
    recommendedServices: ['Fire Restoration','Smoke Cleaning','Water Mitigation','Reconstruction','Interior Build Back','Roofing / Exterior Repair Review'],
    incidentCode: code,
    incidentType,
    incidentNumber,
    propertyLoss: Number(propertyLoss || 0),
    contentsLoss: Number(contentsLoss || 0),
    ageDays,
    dateLoaded: dateLoaded ? dateLoaded.toISOString() : '',
    lastChecked: NOW.toISOString(),
    buildVersion: FIREWATCH_VERSION
  };
}

function dedupe(items) {
  const seen = new Set();
  return items.filter(item => {
    const key = `${item.incidentNumber || ''}|${item.address}|${item.fireDate}|${item.incidentCode}`;
    if (seen.has(key)) return false;
    seen.add(key);
    return true;
  });
}

async function fetchJson(url) {
  const response = await fetch(url);
  if (!response.ok) throw new Error(`Charlotte CFD query failed: ${response.status}`);
  const data = await response.json();
  if (data.error) throw new Error(`Charlotte CFD query error: ${JSON.stringify(data.error)}`);
  return data;
}

function buildUrl(offset) {
  const params = new URLSearchParams({
    where: '1=1',
    outFields: '*',
    orderByFields: 'IncidentDate DESC',
    resultRecordCount: String(PAGE_SIZE),
    resultOffset: String(offset),
    f: 'json'
  });
  return `${QUERY_BASE}?${params.toString()}`;
}

async function fetchFireIncidents() {
  const kept = [];
  let scanned = 0;

  for (let page = 0; page < MAX_PAGES; page += 1) {
    const offset = page * PAGE_SIZE;
    const data = await fetchJson(buildUrl(offset));
    const features = data.features || [];
    if (!features.length) break;
    scanned += features.length;

    let oldestDate = null;
    for (const feature of features) {
      const attrs = feature.attributes || {};
      const incidentDate = normalizeDate(getField(attrs, ['IncidentDate','INCIDENTDATE','incidentdate']));
      if (incidentDate && (!oldestDate || incidentDate < oldestDate)) oldestDate = incidentDate;

      const incidentType = String(getField(attrs, ['IncidentType','INCIDENTTYPE','incidenttype']));
      const code = extractCode(incidentType);
      if (is100FireCode(code)) kept.push(feature);
    }

    const olderThanSixMonths = oldestDate && (NOW - oldestDate) > SIX_MONTHS_MS;
    if (olderThanSixMonths && kept.length > 0) break;
  }

  console.log(`${FIREWATCH_VERSION}: scanned ${scanned} public incident rows, kept ${kept.length} 100-series fire rows before final filters.`);
  return kept;
}

async function main() {
  const features = await fetchFireIncidents();
  const active = [];
  for (const feature of features) {
    const item = makeOpportunity(feature);
    if (item) active.push(item);
  }
  const clean = dedupe(active).sort((a, b) => new Date(b.fireDate) - new Date(a.fireDate));
  await fs.writeFile(FIREWATCH_PATH, JSON.stringify(clean, null, 2));
  await fs.writeFile(ARCHIVED_PATH, JSON.stringify([], null, 2));
  console.log(`${FIREWATCH_VERSION}: Firewatch updated. ${clean.length} active. Only accepted codes are 100-199.`);
}

main().catch(async error => {
  console.error(error);
  await fs.writeFile(FIREWATCH_PATH, JSON.stringify([], null, 2));
  await fs.writeFile(ARCHIVED_PATH, JSON.stringify([], null, 2));
  process.exit(1);
});
