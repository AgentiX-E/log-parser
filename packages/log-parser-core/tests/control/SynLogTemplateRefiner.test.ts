import { describe, it, expect } from 'vitest';
import {
  SynLogTemplateRefiner,
  type RefinementInput,
} from '../../src/control/SynLogTemplateRefiner.js';

describe('SynLogTemplateRefiner', () => {
  const refiner = new SynLogTemplateRefiner();

  describe('anonymizeWithRegex', () => {
    it('anonymizes IP addresses', () => {
      const result = refiner.anonymizeWithRegex('Connection from 192.168.1.1 port 8080');
      expect(result).toContain('<*>');
      expect(result).not.toContain('192.168.1.1');
    });

    it('anonymizes MAC addresses', () => {
      const result = refiner.anonymizeWithRegex('Device aa:bb:cc:dd:ee:ff connected');
      expect(result).toContain('<*>');
      expect(result).not.toContain('aa:bb:cc:dd:ee:ff');
    });

    it('anonymizes email addresses', () => {
      const result = refiner.anonymizeWithRegex('Sent to user@example.com');
      expect(result).toContain('<*>');
      expect(result).not.toContain('user@example.com');
    });

    it('anonymizes hostnames', () => {
      const result = refiner.anonymizeWithRegex('Connecting to db-primary.local');
      expect(result).toContain('<*>');
      expect(result).not.toContain('db-primary.local');
    });

    it('anonymizes memory sizes', () => {
      const result = refiner.anonymizeWithRegex('Allocated 128MB of memory');
      expect(result).toContain('<*>');
    });

    it('anonymizes hex strings', () => {
      const result = refiner.anonymizeWithRegex('Error code 0xdeadbeef detected');
      expect(result).toContain('<*>');
    });

    it('anonymizes UUIDs', () => {
      const result = refiner.anonymizeWithRegex(
        'ID 550e8400-e29b-41d4-a716-446655440000 not found',
      );
      expect(result).toContain('<*>');
    });

    it('anonymizes file paths', () => {
      const result = refiner.anonymizeWithRegex('Reading from /var/log/syslog');
      expect(result).toContain('<*>');
    });

    it('preserves static text around variables', () => {
      const result = refiner.anonymizeWithRegex('User login from 192.168.1.1 at 2024-01-15');
      expect(result).toContain('User login from');
      expect(result).toContain('at');
    });
  });

  describe('isNumber', () => {
    it('detects pure integers', () => {
      expect(refiner.isNumber('42')).toBe(true);
      expect(refiner.isNumber('0')).toBe(true);
      expect(refiner.isNumber('-1')).toBe(true);
    });

    it('detects floats', () => {
      expect(refiner.isNumber('3.14')).toBe(true);
      expect(refiner.isNumber('1.0')).toBe(true);
    });

    it('detects hex strings', () => {
      expect(refiner.isNumber('deadbeef')).toBe(true);
      expect(refiner.isNumber('DEADBEEF12')).toBe(true);
    });

    it('detects digit-rich tokens', () => {
      expect(refiner.isNumber('abc1234')).toBe(true);
      expect(refiner.isNumber('12345abc')).toBe(true);
    });

    it('rejects pure alphabetic tokens', () => {
      expect(refiner.isNumber('abc')).toBe(false);
      expect(refiner.isNumber('User')).toBe(false);
    });

    it('rejects empty strings', () => {
      expect(refiner.isNumber('')).toBe(false);
    });
  });

  describe('anonymizeNumbers', () => {
    it('replaces numbers in log text', () => {
      const result = refiner.anonymizeNumbers('Retry attempt 3 of 5');
      expect(result).toContain('<*>');
    });

    it('preserves non-numeric text', () => {
      const result = refiner.anonymizeNumbers('Connection OK status');
      expect(result).toContain('Connection');
      expect(result).toContain('OK');
      expect(result).not.toContain('<*>');
    });
  });

  describe('tokenize', () => {
    it('splits on spaces and delimiters', () => {
      const result = refiner.tokenize('User login from IP');
      expect(result).toEqual(['User', ' ', 'login', ' ', 'from', ' ', 'IP']);
    });

    it('preserves delimiters as separate tokens', () => {
      const result = refiner.tokenize('key=value,status:ok');
      expect(result).toContain('=');
      expect(result).toContain(',');
      expect(result).toContain(':');
    });
  });

  describe('refine', () => {
    it('extracts template with user and IP variables', () => {
      const groups: RefinementInput[] = [
        {
          logs: [
            'User alice logged in from 192.168.1.1',
            'User bob logged in from 10.0.0.1',
            'User carol logged in from 172.16.0.1',
            'User dave logged in from 8.8.8.8',
          ],
          drainTemplate: 'User alice logged in from 192.168.1.1',
        },
      ];

      const results = refiner.refine(groups);
      expect(results[0]!.changed).toBe(true);
      expect(results[0]!.refinedTemplate).toContain('<*>');
    });

    it('identifies common variable literals', () => {
      const groups: RefinementInput[] = [
        {
          logs: ['Status: true', 'Status: false', 'Status: true', 'Status: false'],
          drainTemplate: 'Status: true',
        },
      ];

      const results = refiner.refine(groups);
      expect(results[0]!.refinedTemplate).toContain('<*>');
    });

    it('cross-group verification removes false constants', () => {
      const groups: RefinementInput[] = [
        {
          logs: [
            'Process A started',
            'Process B started',
            'Process C started',
            'Process D started',
          ],
          drainTemplate: 'Process A started',
        },
      ];

      const results = refiner.refine(groups);
      expect(results[0]!.refinedTemplate).toContain('<*>');
    });

    it('handles single-sample group gracefully', () => {
      const groups: RefinementInput[] = [
        {
          logs: ['Only one log message'],
          drainTemplate: 'Only one log message',
        },
      ];

      const results = refiner.refine(groups);
      expect(results[0]!.refinedTemplate).toBeDefined();
    });

    it('merges consecutive <*> markers', () => {
      const groups: RefinementInput[] = [
        {
          logs: [
            'ERROR db01 disconnected after 5 retries',
            'ERROR db02 disconnected after 3 retries',
            'ERROR db03 disconnected after 7 retries',
            'ERROR db04 disconnected after 2 retries',
          ],
          drainTemplate: 'ERROR db01 disconnected after 5 retries',
        },
      ];

      const results = refiner.refine(groups);
      const tmpl = results[0]!.refinedTemplate;
      // Should not have consecutive <*><*>
      expect(tmpl).not.toContain('<*><*>');
    });

    it('preserves static delimiters', () => {
      const groups: RefinementInput[] = [
        {
          logs: ['key=value:100', 'key=other:200', 'key=third:300', 'key=fourth:400'],
          drainTemplate: 'key=value:100',
        },
      ];

      const results = refiner.refine(groups);
      expect(results[0]!.refinedTemplate).toContain('=');
      expect(results[0]!.refinedTemplate).toContain(':');
    });

    it('handles empty logs', () => {
      const groups: RefinementInput[] = [
        {
          logs: [],
          drainTemplate: 'empty',
        },
      ];

      const results = refiner.refine(groups);
      expect(results[0]!.changed).toBe(false);
      expect(results[0]!.refinedTemplate).toBe('empty');
    });

    it('processes multiple groups', () => {
      const groups: RefinementInput[] = [
        {
          logs: ['User a', 'User b', 'User c', 'User d'],
          drainTemplate: 'User a',
        },
        {
          logs: ['Error 1', 'Error 2', 'Error 3', 'Error 4'],
          drainTemplate: 'Error 1',
        },
      ];

      const results = refiner.refine(groups);
      expect(results).toHaveLength(2);
      expect(results[0]!.changed).toBe(true);
      expect(results[1]!.changed).toBe(true);
    });

    it('does not change already-correct templates', () => {
      const groups: RefinementInput[] = [
        {
          logs: [
            'System started successfully',
            'System started successfully',
            'System started successfully',
            'System started successfully',
          ],
          drainTemplate: 'System started successfully',
        },
      ];

      const results = refiner.refine(groups);
      expect(results[0]!.changed).toBe(false);
    });

    it('skips short constant tokens in cross-group verification', () => {
      // Template with constants ≤ 2 chars — verifier should skip them
      const groups: RefinementInput[] = [
        {
          logs: ['A B C D message', 'A B E F message', 'A B G H message', 'A B I J message'],
          drainTemplate: 'A B C D message',
        },
      ];

      const results = refiner.refine(groups);
      // Short tokens "A", "B" should be skipped; only "message" is long enough
      expect(results[0]!.refinedTemplate).toContain('message');
    });
  });

  describe('postProcess', () => {
    it('merges consecutive markers through private method', () => {
      // Test indirectly through refine which calls postProcess
      const groups: RefinementInput[] = [
        {
          logs: ['a b c d e', 'x y z w v', 'q r s t u', 'm n o p q'],
          drainTemplate: 'a b c d e',
        },
      ];

      const results = refiner.refine(groups);
      const tmpl = results[0]!.refinedTemplate;
      expect(tmpl).not.toMatch(/<\*>.*<\*>/); // no adjacent variable markers
    });
  });

  describe('hashTemplate', () => {
    it('produces deterministic hash for same template', () => {
      const h1 = SynLogTemplateRefiner.hashTemplate('User <*> logged in from <IP>');
      const h2 = SynLogTemplateRefiner.hashTemplate('User <*> logged in from <IP>');
      expect(h1).toBe(h2);
      expect(h1).toHaveLength(16);
    });

    it('produces different hashes for different templates', () => {
      const h1 = SynLogTemplateRefiner.hashTemplate('User <*> logged in');
      const h2 = SynLogTemplateRefiner.hashTemplate('ERROR <*> connection failed');
      expect(h1).not.toBe(h2);
    });

    it('handles empty template', () => {
      const hash = SynLogTemplateRefiner.hashTemplate('');
      expect(hash).toHaveLength(16);
    });
  });

  it('isNumber returns true for hex-prefixed tokens', () => {
    expect(refiner.isNumber('0x1a2b3c')).toBe(true);
  });

  it('isNumber returns true for long hex strings', () => {
    expect(refiner.isNumber('deadbeef123')).toBe(true);
  });

  it('isNumber returns false for non-hex alpha', () => {
    expect(refiner.isNumber('ab12g')).toBe(false);
  });

  it('hashTemplate produces deterministic 16-char hex', () => {
    const h = SynLogTemplateRefiner.hashTemplate('User <*> logged');
    expect(h).toHaveLength(16);
    expect(SynLogTemplateRefiner.hashTemplate('User <*> logged')).toBe(h);
  });

  it('hashTemplate differs for different templates', () => {
    expect(SynLogTemplateRefiner.hashTemplate('a')).not.toBe(
      SynLogTemplateRefiner.hashTemplate('b'),
    );
  });

  it('anonymizeNumbers converts digit-dominant tokens', () => {
    const result = refiner.anonymizeNumbers('token 123abc 456');
    expect(result).toContain('<*>');
  });
});
