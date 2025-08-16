import { describe, it, expect } from 'vitest';
import { hasRenderableContent } from '../components/BlockList';
import type { BlockNode } from '../utils/blockText';

const B = (text: string, children: BlockNode[] = []): BlockNode => ({ content: text, children });

describe('hasRenderableContent', () => {
  it('ignores properties and empty lines', () => {
    const blocks = [
      B('key:: value'),
      B(''),
      B('  '),
    ];
    expect(hasRenderableContent(blocks, true, false, [])).toBe(false);
  });
  it('detects normal lines', () => {
    const blocks = [ B('hello world') ];
    expect(hasRenderableContent(blocks, true, false, [])).toBe(true);
  });
  it('ignores pure block refs and embeds when hideReferences=true', () => {
    const blocks = [
      B('((123e4567-e89b-12d3-a456-426614174000))'),
      B('{{embed ((123e4567-e89b-12d3-a456-426614174000))}}'),
    ];
    expect(hasRenderableContent(blocks, false, true, [])).toBe(false);
  });
});
