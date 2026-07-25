import { describe, it, expect } from 'vitest';
import { LanguageDetector } from '../../src/preprocessing/LanguageDetector.js';

describe('LanguageDetector', () => {
  const detector = new LanguageDetector();

  it('returns en as default fallback (franc-min integration deferred to I2)', () => {
    expect(detector.detect('User logged in successfully')).toBe('en');
  });

  it('returns en for any input in I1 stub', () => {
    expect(detector.detect('用户登录成功')).toBe('en');
    expect(detector.detect('ユーザーがログインしました')).toBe('en');
  });

  it('returns en for empty string', () => {
    expect(detector.detect('')).toBe('en');
  });

  it('returns en for special characters', () => {
    expect(detector.detect('???!')).toBe('en');
  });

  it('returns en for numeric input', () => {
    expect(detector.detect('12345')).toBe('en');
  });

  it('returns en for mixed content', () => {
    expect(detector.detect('Error: 用户 not found')).toBe('en');
  });

  it('returns en for long English sentence', () => {
    expect(detector.detect('User alice logged in successfully from 192.168.1.1 at 10:30:00')).toBe(
      'en',
    );
  });
});
