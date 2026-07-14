import fs from 'fs/promises';

const FIREWATCH_PATH = new URL('../data/firewatch.json', import.meta.url);
const ARCHIVED_PATH = new URL('../data/archived.json', import.meta.url);
const STRICT_FIREWATCH_VERSION = 'repair-v6-html-restored-strict-fire';
const NOW = new Date();
const SIX_MONTHS_MS = 183 * 24 * 60 * 60 * 1000;

const SOURCE_URL = 'https://data.charlottenc.gov/datasets/charlotte::cfd-public-incident-reports-fires-only/explore';
const QUERY_BASE = 'https://gis.charlottenc.gov/arcgis/rest/services/CFD/PublicIncidentReportsFiresOnly/MapServer/0/query';

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
  const match = String(text || '').match(/\b(\d{3})\b/);
  return match ? Number(match[1]) : null;
}

function is100FireCode(code) {
  return Number.isInteger(code) && code >= 100 && code <= 199;
}

function classifyProperty(text) {
  const t = String(text || '').toLowerCase();
  if (/apartment|apartments|multi-family|multifamily/.test(t)) return 'Multifamily';
  if (/hotel|motel|extended stay|boarding|rooming/.test(t)) return 'Hospitality';
  if (/hospital|nursing|healthcare|assisted living|rehab/.test(t)) return 'Healthcare';
  if (/school|college|university/.test(t)) return 'Education';
  if (/warehouse|industrial|shop|store|restaurant|retail|office|commercial|business/.test(t)) return 'Commercial';
  if (/single family|one family|1 family|residential/.test(t)) return 'Single-Family Strategic';
  if (/brush|woods|grass|vegetation|forest/.test(t)) return 'Brush Fire Strategic';
  return 'Needs Property Verification';
}

function scoreItem({ propertyType, ageDays, propertyLoss, contentsLoss }) {
  let score = 20;
  if (['Multifamily','Hospitality','Healthcare','Education','Commercial'].includes(propertyType)) score += 30;
  if (ageDays <= 30) score += 20;
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
  if (ageDays > 183) return null;

  const address = String(getField(attrs, ['AddressBlock','ADDRESSBLOCK','Address','ADDRESS']) || 'Address not available');
  const city = String(getField(attrs, ['City','CITY']) || 'Charlotte');
  const propertyUse = String(getField(attrs, ['PropertyUse','PROPERTYUSE','propertyuse']));
  const action1 = String(getField(attrs, ['ActionTaken1','ACTIONTAKEN1','actiontaken1']));
  const action2 = String(getField(attrs, ['ActionTaken2','ACTIONTAKEN2','actiontaken2']));
  const propertyLoss = getField(attrs, ['PropertyLoss','PROPERTYLOSS','propertyloss']);
  const contentsLoss = getField(attrs, ['ContentsLoss','CONTENTSLOSS','contentsloss']);
  const incidentNumber = String(getField(attrs, ['IncidentNumber','INCIDENTNUMBER','incidentnumber']));
  const combined = [incidentType, propertyUse, action1, action2].join(' | ');
  const propertyType = classifyProperty(combined);
  const opportunityScore = scoreItem({ propertyType, ageDays, propertyLoss, contentsLoss });

  return {
    propertyName: 'Property name not yet verified',
    address: address.includes(city) ? address : `${address}, ${city} NC`,
    county: 'Mecklenburg',
    propertyType,
    fireDate: incidentDate.toISOString().slice(0,10),
    sourceTitle: 'Charlotte CFD Public Incident Reports - Fires Only',
    sourceUrl: SOURCE_URL,
    sourceType: 'Public incident data',
    opportunityScore,
    status: ageDays <= 7 ? 'New Fire' : 'Confirmed Fire',
    whyFlagged: `${incidentType}${propertyUse ? ' | ' + propertyUse : ''}${action1 ? ' | ' + action1 : ''}`,
    whyThisMatters: 'A confirmed 100-series fire incident may create needs for fire restoration, smoke cleaning, water mitigation from suppression activity, reconstruction, roofing, exterior repair, and interior build-back. Exact property details should be verified before outreach.',
    recommendedServices: ['Fire Restoration','Smoke Cleaning','Water Mitigation','Reconstruction','Interior Build Back','Roofing / Exterior Repair Review'],
    incidentCode: code,
    incidentNumber,
    ageDays,
    lastChecked: NOW.toISOString()
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
  return response.json();
}

async function fetchFireIncidents() {
  const params = new URLSearchParams({
    where: "IncidentType LIKE '1%'",
    outFields: '*',
    orderByFields: 'IncidentDate DESC',
    resultRecordCount: '1000',
    f: 'json'
  });
  const data = await fetchJson(`${QUERY_BASE}?${params.toString()}`);
  return data.features || [];
}

async function main() {
  const features = await fetchFireIncidents();
  const active = [];
  for (const feature of features) {
    const item = makeOpportunity(feature);
    if (item) active.push(item);
  }
  await fs.writeFile(FIREWATCH_PATH, JSON.stringify(dedupe(active), null, 2));
  await fs.writeFile(ARCHIVED_PATH, JSON.stringify([], null, 2));
  console.log(`${STRICT_FIREWATCH_VERSION}: Firewatch updated. ${active.length} active. Only accepted codes are 100-199.`);
}

main().catch(async error => {
  console.error(error);
  await fs.writeFile(FIREWATCH_PATH, JSON.stringify([], null, 2));
  await fs.writeFile(ARCHIVED_PATH, JSON.stringify([], null, 2));
  process.exit(1);
});
