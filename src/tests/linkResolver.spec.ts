import { describe, it, expect } from 'vitest';
import { buildNameCandidates } from '../utils/linkResolver';
import { journalVirtualKeyFromText, inferJournalPageNameFromText } from '../utils/journal';

describe('linkResolver candidates', () => {
  it('includes journal variants for YYYYMMDD', () => {
    const c = buildNameCandidates('20250101');
    expect(c).toEqual(expect.arrayContaining(['2025_01_01', 'journals/2025_01_01', '2025/01/01']));
  });
  it('extracts virtual key from date-like strings', () => {
    expect(journalVirtualKeyFromText('2025/01/01')).toBe('20250101');
    expect(journalVirtualKeyFromText('journals/2025_01_01.md')).toBe('20250101');
  });
  it('infers JP date and includes journal variants', () => {
    const jp = inferJournalPageNameFromText('2025年8月16日');
    expect(jp).toBe('2025_08_16');
    const c = buildNameCandidates('2025年8月16日');
    expect(c).toEqual(expect.arrayContaining(['journals/2025_08_16', '2025/08/16']));
  });
});
