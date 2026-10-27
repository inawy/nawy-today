import { describe, expect, it } from 'vitest';
import { BUILD_INFO, RELEASE } from '@/lib/buildInfo';

describe('build info', () => {
  it('calls the release 1.0', () => {
    expect(RELEASE).toBe('1.0');
  });

  it('names the commit (or dev) and the day of the build', () => {
    expect(BUILD_INFO.sha).toMatch(/^([0-9a-f]{7}|dev)$/);
    expect(BUILD_INFO.date).toMatch(/^\d{4}-\d{2}-\d{2}$/);
  });
});
