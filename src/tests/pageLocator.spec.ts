import { describe, it, expect } from 'vitest';
import { locatePageFile } from '../utils/pageLocator';

describe('locatePageFile', () => {
  it('is a function and returns a Promise', () => {
    expect(typeof locatePageFile).toBe('function');
    const p = locatePageFile('2025/08/16');
    expect(p && typeof (p as any).then).toBe('function');
  });
});
