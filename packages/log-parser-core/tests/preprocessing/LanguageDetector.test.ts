import { describe, it, expect } from 'vitest';
import { detectLanguage } from '../../src/preprocessing/LanguageDetector.js';

describe('LanguageDetector', () => {
  it('detects English text', () => {
    expect(detectLanguage('User logged in successfully')).toBe('en');
  });

  it('detects Chinese text', () => {
    expect(detectLanguage('用户登录成功从终端')).toBe('zh');
  });

  it('detects Japanese text', () => {
    expect(detectLanguage('ユーザーがログインしました')).toBe('ja');
  });

  it('returns other for very short input', () => {
    expect(detectLanguage('ab')).toBe('other');
  });

  it('returns other for empty string', () => {
    expect(detectLanguage('')).toBe('other');
  });

  it('returns other for numeric-only input', () => {
    expect(detectLanguage('12345')).toBe('other');
  });

  it('handles mixed English-Chinese text', () => {
    const result = detectLanguage('Error: 用户 not found');
    expect(['en', 'zh', 'other']).toContain(result);
  });

  it('detects long English sentence', () => {
    expect(detectLanguage('User alice logged in successfully from 192.168.1.1 at 10:30:00')).toBe(
      'en',
    );
  });
});
