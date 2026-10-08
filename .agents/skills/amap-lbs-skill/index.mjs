// ReadytoGo adaptation of the official amap-lbs-skill (see UPSTREAM.md).
const operations = {
  text: {
    path: '/v5/place/text',
    defaults: { region: '110000', city_limit: 'true', page_size: 10, page_num: 1, show_fields: 'business,indoor' },
    allowed: ['keywords', 'types', 'region', 'city_limit', 'page_size', 'page_num', 'show_fields'],
    required: ['keywords'],
  },
  around: {
    path: '/v5/place/around',
    defaults: { types: '200300|200303', radius: 1000, sortrule: 'distance', page_size: 10, page_num: 1, show_fields: 'business,indoor' },
    allowed: ['location', 'keywords', 'types', 'radius', 'sortrule', 'page_size', 'page_num', 'show_fields'],
    required: ['location'],
  },
  walking: {
    path: '/v5/direction/walking',
    defaults: { show_fields: 'cost' },
    allowed: ['origin', 'destination'],
    required: ['origin', 'destination'],
  },
  convert: {
    path: '/v3/assistant/coordinate/convert',
    defaults: {},
    allowed: ['locations', 'coordsys'],
    required: ['locations', 'coordsys'],
  },
};

function validateCoordinate(value) {
  const parts = String(value).split(',');
  if (parts.length !== 2 || parts.some(part => !part.trim())) throw new Error('INVALID_COORDINATE');
  const [lng, lat] = parts.map(Number);
  if (!Number.isFinite(lng) || !Number.isFinite(lat) || Math.abs(lng) > 180 || Math.abs(lat) > 90) {
    throw new Error('INVALID_COORDINATE');
  }
}

export async function query(operation, input = {}) {
  if (!Object.hasOwn(operations, operation)) throw new Error('UNKNOWN_OPERATION');
  const spec = operations[operation];
  if (!input || typeof input !== 'object' || Array.isArray(input)) throw new Error('PARAMETERS_MUST_BE_OBJECT');
  for (const [name, value] of Object.entries(input)) {
    if (!spec.allowed.includes(name)) throw new Error('UNSUPPORTED_PARAMETER');
    if (!['string', 'number', 'boolean'].includes(typeof value)) throw new Error('INVALID_PARAMETER_VALUE');
  }
  for (const name of spec.required) {
    if (!Object.hasOwn(input, name) || !String(input[name]).trim()) throw new Error(`MISSING_${name.toUpperCase()}`);
  }
  for (const name of ['location', 'origin', 'destination']) {
    if (Object.hasOwn(input, name)) validateCoordinate(input[name]);
  }
  if (operation === 'convert') {
    if (!['gps', 'baidu', 'mapbar'].includes(input.coordsys)) throw new Error('UNSUPPORTED_SOURCE_COORDSYS');
    const pairs = String(input.locations).split('|');
    if (pairs.length > 40) throw new Error('TOO_MANY_COORDINATES');
    pairs.forEach(validateCoordinate);
  }
  if (Object.hasOwn(input, 'page_size') && (!Number.isInteger(Number(input.page_size)) || Number(input.page_size) < 1 || Number(input.page_size) > 25)) {
    throw new Error('PAGE_SIZE_MUST_BE_1_TO_25');
  }
  if (Object.hasOwn(input, 'page_num') && (!Number.isInteger(Number(input.page_num)) || Number(input.page_num) < 1)) {
    throw new Error('PAGE_NUM_MUST_BE_POSITIVE_INTEGER');
  }
  const key = process.env.AMAP_KEY?.trim() || process.env.AMAP_WEBSERVICE_KEY?.trim();
  if (!key) throw new Error('AMAP_KEY_NOT_CONFIGURED');
  const url = new URL(spec.path, 'https://restapi.amap.com');
  for (const [name, value] of Object.entries({ ...spec.defaults, ...input })) url.searchParams.set(name, String(value));
  url.searchParams.set('key', key);
  let response;
  try {
    response = await fetch(url, { signal: AbortSignal.timeout(10000), redirect: 'error' });
  } catch (error) {
    throw new Error(error.name === 'TimeoutError' ? 'AMAP_TIMEOUT' : 'AMAP_NETWORK_ERROR');
  }
  if (!response.ok) throw new Error(`AMAP_HTTP_${response.status}`);
  let data;
  try {
    data = await response.json();
  } catch {
    throw new Error('AMAP_INVALID_JSON');
  }
  if (!data || String(data.status) !== '1') {
    const code = /^\d{5}$/.test(String(data?.infocode)) ? data.infocode : 'UNKNOWN';
    throw new Error(`AMAP_API_${code}`);
  }
  return { operation, fetchedAt: new Date().toISOString(), data };
}
