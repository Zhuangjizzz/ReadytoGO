import fs from 'node:fs/promises';
import { Workbook } from '@oai/artifact-tool';

const root = '/Users/bytedance/Desktop/ReadytoGo';
const output = `${root}/.scratch/prd-v1-alignment/work`;
const input = `${root}/data/BJ-ToiletInfo.csv`;
const bytes = await fs.readFile(input);
const decoder = new TextDecoder('gb18030');
const text = decoder.decode(bytes);
const firstLine = text.split(/\r?\n/, 1)[0];
const workbook = await Workbook.fromCSV(firstLine, { sheetName: 'Sheet0' });
const sheet = workbook.worksheets.getItem('Sheet0');
const cell = sheet.getRange('L1');
const before = cell.values[0][0];

if (process.argv[2] === 'inspect') {
  const preview = await workbook.render({ sheetName: 'Sheet0', range: 'K1:S2', scale: 2, format: 'png' });
  await fs.writeFile(`${output}/header-before.png`, new Uint8Array(await preview.arrayBuffer()));
  console.log(JSON.stringify({ cell: 'L1', value: before, preview: `${output}/header-before.png` }));
} else if (process.argv[2] === 'edit') {
  if (before !== '2022年环卫设施（厕所）台账') throw new Error('Unexpected header');
  cell.values = [['环卫设施（厕所）台账']];
  workbook.recalculate();
  const after = cell.values[0][0];
  const check = await workbook.inspect({ kind: 'table', range: 'Sheet0!L1:L1', include: 'values', tableMaxRows: 1, tableMaxCols: 1, maxChars: 1000 });
  console.log(check.ndjson);
  const preview = await workbook.render({ sheetName: 'Sheet0', range: 'K1:S2', scale: 2, format: 'png' });
  await fs.writeFile(`${output}/header-after.png`, new Uint8Array(await preview.arrayBuffer()));

  // Apply the authored cell as a byte-preserving CSV delta: no data-row reserialization.
  let start = 0;
  for (let i = 0; i < 11; i++) start = bytes.indexOf(44, start) + 1;
  const end = bytes.indexOf(44, start);
  if (decoder.decode(bytes.subarray(start, end)) !== before) throw new Error('CSV cell mismatch');
  if (decoder.decode(bytes.subarray(start, start + 6)) !== '2022年') throw new Error('Prefix encoding mismatch');
  if (decoder.decode(bytes.subarray(start + 6, end)) !== after) throw new Error('Authored value mismatch');
  const updated = Buffer.concat([bytes.subarray(0, start), bytes.subarray(start + 6)]);
  await fs.writeFile(input, updated);
  console.log(JSON.stringify({ editedCell: 'L1', value: after, preservedBody: true, removedBytes: 6 }));
} else {
  throw new Error('Use inspect or edit');
}
