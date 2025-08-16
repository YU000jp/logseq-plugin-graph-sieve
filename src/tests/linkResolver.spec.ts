// Minimal ad-hoc tests (can be run with ts-node/tsx manually) to validate date->journals candidates
import { buildNameCandidates } from '../utils/linkResolver';
import { journalVirtualKeyFromText, inferJournalPageNameFromText } from '../utils/journal';

const assert = (cond: boolean, msg: string) => { if (!cond) throw new Error(msg); };

function testCandidates(name: string, expectIncludes: string[]) {
  const c = buildNameCandidates(name);
  for (const e of expectIncludes) assert(c.includes(e), `candidates should include ${e} for ${name}`);
}

function main() {
  // YYYYMMDD
  testCandidates('20250101', ['2025_01_01', 'journals/2025_01_01', '2025/01/01']);
  if (journalVirtualKeyFromText('2025/01/01') !== '20250101') throw new Error('vkey 2025/01/01');
  if (journalVirtualKeyFromText('journals/2025_01_01.md') !== '20250101') throw new Error('vkey journals underscore');
  // Japanese date separators
  const jp = inferJournalPageNameFromText('2025年8月16日');
  if (jp !== '2025_08_16') throw new Error('infer JP date');
  testCandidates('2025年8月16日', ['journals/2025_08_16', '2025/08/16']);
  console.log('OK');
}

main();
