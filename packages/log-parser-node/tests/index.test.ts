import { describe, it, expect } from 'vitest';

describe('stub', () => {
  it('package exists and exports correctly', async () => {
    const pkg = await import('../src/index.js');
    expect(pkg).toBeDefined();
  });
});
