// Read-only, bounded comparison of Amap's documented POI language option.
import { writeFile } from 'node:fs/promises';
const report = { date: '2026-10-09', endpoint: '/v5/place/text', results: [] };
for (const langCode of ['zh', 'en']) {
  const url = new URL(report.endpoint, 'https://restapi.amap.com');
  url.search = new URLSearchParams({ key: process.env.AMAP_KEY || process.env.AMAP_WEBSERVICE_KEY || '', keywords: '故宫博物院', region: '北京市', city_limit: 'true', page_size: '3', langCode }).toString();
  try {
    const response = await fetch(url, { signal: AbortSignal.timeout(10000) });
    const body = await response.json();
    report.results.push({ langCode, httpStatus: response.status, status: body.status, infocode: /^\d{5}$/.test(body.infocode) ? body.infocode : 'unknown', info: /^[A-Z_a-z \d-]{1,100}$/.test(body.info) ? body.info : 'unknown', pois: (body.pois || []).map(p => ({ id: p.id, name: p.name, address: p.address, cityname: p.cityname, adname: p.adname, adcode: p.adcode })) });
  } catch { report.results.push({ langCode, error: 'network_or_payload_error' }); }
}
await writeFile(new URL('./upstream-language.json', import.meta.url), JSON.stringify(report, null, 2) + '\n');
console.log(JSON.stringify(report, null, 2));
