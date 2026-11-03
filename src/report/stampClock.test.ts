import { describe, expect, it } from 'vitest';
import { stampClock } from './generateReport';

describe('stampClock', () => {
  it('starts the evening engagement at 18:40', () => {
    expect(stampClock(0)).toBe('18:40');
  });
  it('adds elapsed play time', () => {
    expect(stampClock(25 * 60000)).toBe('19:05');
  });
  it('wraps past midnight', () => {
    expect(stampClock(6 * 3600000)).toBe('00:40');
  });
});
