#!/usr/bin/env node
import { query } from '../index.mjs';

const [operation, parameterText = '{}'] = process.argv.slice(2);
if (!operation || operation === '--help') {
  console.log(`Usage (from project root):
  node --env-file=.env <skill>/scripts/query.mjs <operation> '<JSON parameters>'

Operations:
  text     {"keywords":"故宫神武门","page_size":3}
  around   {"location":"<lng>,<lat>","radius":1000}
  walking  {"origin":"<lng>,<lat>","destination":"<lng>,<lat>"}
  convert  {"locations":"<lng>,<lat>","coordsys":"gps"}

Credentials: AMAP_KEY (AMAP_WEBSERVICE_KEY alias accepted).
Outputs JSON with operation, fetchedAt and raw Amap data. No automatic retry.`);
} else {
  let parameters;
  try {
    parameters = JSON.parse(parameterText);
  } catch {
    console.error('INVALID_PARAMETER_JSON');
    process.exit(1);
  }
  try {
    console.log(JSON.stringify(await query(operation, parameters), null, 2));
  } catch (error) {
    console.error(error.message);
    process.exitCode = 1;
  }
}
