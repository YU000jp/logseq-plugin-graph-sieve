import { describe, it, expect } from 'vitest';
import { parseBlocksFromText } from '../utils/parseBlocks';

describe('parseBlocksFromText', () => {
  it('removes front matter, strips LOGBOOK, and builds hierarchy by indent', () => {
    const text = `---\nkey: value\n---\n- A\n  - B\n    - C\n- :LOGBOOK:\n  - should be skipped\n  :END:\n- D\n`;
    const blocks = parseBlocksFromText(text);
    expect(Array.isArray(blocks)).toBe(true);
  expect(blocks.length).toBe(2); // A, D (LOGBOOK section is fully stripped)
    expect(blocks[0].content).toBe('A');
    expect(blocks[0].children?.[0]?.content).toBe('B');
    expect(blocks[0].children?.[0]?.children?.[0]?.content).toBe('C');
  expect(blocks[1].content).toBe('D');
  });
});
