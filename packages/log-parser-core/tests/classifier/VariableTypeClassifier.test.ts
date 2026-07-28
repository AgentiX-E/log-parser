import { describe, it, expect } from 'vitest';
import { VariableTypeClassifier } from '../../src/classifier/VariableTypeClassifier.js';

describe('VariableTypeClassifier', () => {
  const classifier = new VariableTypeClassifier();

  describe('IP addresses', () => {
    it.each(['192.168.1.1', '10.0.0.1', '172.16.0.1', '0.0.0.0', '255.255.255.255'])(
      'classifies %s as IP',
      (token) => {
        expect(classifier.classify(token).type).toBe('IP');
      },
    );
  });

  describe('Numbers', () => {
    it.each(['42', '-123', '3.14', '0', '-0.5', '1000000'])('classifies %s as NUM', (token) => {
      expect(classifier.classify(token).type).toBe('NUM');
    });
  });

  describe('Hex values', () => {
    it.each(['0xdeadbeef', '0x123abc', '0x1a2b3c4d', 'deadbeef', 'a1b2c3d4e5f6'])('classifies %s as HEX', (token) => {
      expect(classifier.classify(token).type).toBe('HEX');
    });
    it('classifies short bare hex as GENERIC', () => {
      expect(classifier.classify('FF').type).toBe('GENERIC');
    });
  });

  describe('UUIDs', () => {
    it('classifies standard UUID', () => {
      expect(classifier.classify('550e8400-e29b-41d4-a716-446655440000').type).toBe('UUID');
    });
    it('classifies uppercase UUID', () => {
      expect(classifier.classify('550E8400-E29B-41D4-A716-446655440000').type).toBe('UUID');
    });
  });

  describe('Emails', () => {
    it.each(['user@example.com', 'a.b@c.co', 'test+tag@domain.org'])(
      'classifies %s as EMAIL',
      (token) => {
        expect(classifier.classify(token).type).toBe('EMAIL');
      },
    );
  });

  describe('Timestamps', () => {
    it('ISO 8601 with T', () => {
      expect(classifier.classify('2024-01-15T10:30:00Z').type).toBe('TIMESTAMP');
    });
    it('ISO 8601 with space', () => {
      expect(classifier.classify('2024-01-15 10:30:00').type).toBe('TIMESTAMP');
    });
    it('Apache format', () => {
      expect(classifier.classify('15/Jan/2024:10:30:00').type).toBe('TIMESTAMP');
    });
    it('Unix epoch seconds', () => {
      expect(classifier.classify('1705314000').type).toBe('TIMESTAMP');
    });
    it('Unix epoch milliseconds', () => {
      expect(classifier.classify('1705314000000').type).toBe('TIMESTAMP');
    });
  });

  describe('Paths', () => {
    it('Unix absolute path', () => {
      expect(classifier.classify('/var/log/syslog').type).toBe('PATH');
    });
    it('Relative path', () => {
      expect(classifier.classify('./config/settings.json').type).toBe('PATH');
    });
    it('Windows path', () => {
      expect(classifier.classify('C:\\Windows\\System32').type).toBe('PATH');
    });
  });

  describe('URLs', () => {
    it.each(['https://example.com/api', 'http://localhost:8080'])(
      'classifies %s as URL',
      (token) => {
        expect(classifier.classify(token).type).toBe('URL');
      },
    );
  });

  describe('Hostnames', () => {
    it.each(['api.example.com', 'db.internal.corp', 'my-host.local'])(
      'classifies %s as HOSTNAME',
      (token) => {
        expect(classifier.classify(token).type).toBe('HOSTNAME');
      },
    );

    it('does not classify string with dot and space as hostname', () => {
      expect(classifier.classify('api.example.com extra').type).toBe('GENERIC');
    });
  });

  describe('GENERIC fallback', () => {
    it('empty string', () => {
      expect(classifier.classify('').type).toBe('GENERIC');
    });
    it('whitespace only', () => {
      expect(classifier.classify('   ').type).toBe('GENERIC');
    });
    it('plain text', () => {
      expect(classifier.classify('alice').type).toBe('GENERIC');
    });
    it('single dot (no hostname)', () => {
      expect(classifier.classify('.').type).toBe('GENERIC');
    });
    it('IPv6 address', () => {
      expect(classifier.classify('::1').type).toBe('GENERIC');
    });
    it('short string with dot', () => {
      expect(classifier.classify('a.b').type).toBe('GENERIC');
    });
  });
});
