import { describe, expect, it } from '@rstest/core';

import { generateQrSvg } from '../qr';

const PAYLOAD = 'A'.repeat(300);

describe('qr', () => {
  it('encodes a 300 character payload into an inline svg', () => {
    const result = generateQrSvg(PAYLOAD);

    expect(result.modules).toBeGreaterThan(0);
    expect(result.svg).toContain('<svg');
    expect(result.svg).toContain('<path');
    expect(result.svg).toContain('viewBox=');
  });

  it('is stable for the same input', () => {
    expect(generateQrSvg(PAYLOAD).svg).toBe(generateQrSvg(PAYLOAD).svg);
  });
});
