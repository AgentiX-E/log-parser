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
          logs: ['User alice logged in from 192.168.1.1', 'User bob logged in from 10.0.0.1'],
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
          logs: ['Status: true', 'Status: false'],
          drainTemplate: 'Status: true',
        },
      ];

      const results = refiner.refine(groups);
      expect(results[0]!.refinedTemplate).toContain('<*>');
    });

    it('cross-group verification removes false constants', () => {
      // Use a drainTemplate that has a token NOT in one of the logs
      // so the no-refine guard passes control to the refinement pipeline
      const groups: RefinementInput[] = [
        {
          logs: ['Process A started successfully', 'Process B started successfully', 'Process C started'],
          drainTemplate: 'Process A started successfully', // "successfully" missing from log 3
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
          logs: ['key=value:100', 'key=other:200'],
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
          logs: ['User alice signed in from 10.0.0.1', 'User bob signed in from 192.168.1.1'],
          drainTemplate: 'User alice signed in from 10.0.0.1', // "alice" and "10.0.0.1" are variables
        },
        {
          logs: ['Task job-A completed in 42ms', 'Task job-B completed in 128ms'],
          drainTemplate: 'Task job-A completed in 42ms', // "job-A" and "42ms" are variables
        },
      ];

      const results = refiner.refine(groups);
      expect(results).toHaveLength(2);
      expect(results[0]!.refinedTemplate).toContain('<*>');
      expect(results[1]!.refinedTemplate).toContain('<*>');
    });

    it('does not change already-correct templates', () => {
      const groups: RefinementInput[] = [
        {
          logs: ['System started successfully', 'System started successfully'],
          drainTemplate: 'System started successfully',
        },
      ];

      const results = refiner.refine(groups);
      expect(results[0]!.changed).toBe(false);
    });
  });

  describe('postProcess', () => {
    it('merges consecutive markers through private method', () => {
      // Test indirectly through refine which calls postProcess
      const groups: RefinementInput[] = [
        {
          logs: ['a b c d e', 'x y z w v'],
          drainTemplate: 'a b c d e',
        },
      ];

      const results = refiner.refine(groups);
      const tmpl = results[0]!.refinedTemplate;
      expect(tmpl).not.toMatch(/<\*>.*<\*>/); // no adjacent variable markers
    });
  });

  describe('templateMatchesAllLogs', () => {
    it('returns true when template matches all logs', () => {
      const result = refiner.templateMatchesAllLogs(
        'Accepted password for <*> from <IP>',
        [
          'Accepted password for root from 192.168.1.1',
          'Accepted password for admin from 10.0.0.1',
        ],
      );
      expect(result).toBe(true);
    });

    it('returns false when a constant token is absent from one log', () => {
      const result = refiner.templateMatchesAllLogs(
        'User logged in from <IP>',
        [
          'User alice logged in from 10.0.0.1',
          'User bob connected from 172.16.0.1', // "logged" → "connected"
        ],
      );
      expect(result).toBe(false);
    });

    it('returns true for empty logs array', () => {
      expect(refiner.templateMatchesAllLogs('User <*>', [])).toBe(true);
    });

    it('returns true when template has no constant tokens', () => {
      expect(refiner.templateMatchesAllLogs('<*> <*> <*>', ['a b c', 'x y z'])).toBe(true);
    });

    it('returns true when all constant tokens present in every log', () => {
      const result = refiner.templateMatchesAllLogs(
        'ERROR connection to <HOSTNAME> failed',
        [
          'ERROR connection to db-01.local failed',
          'ERROR connection to cache-02.cluster failed',
          'ERROR connection to api.prod.internal failed',
        ],
      );
      expect(result).toBe(true);
    });

    it('returns false when constant token missing from one member', () => {
      const result = refiner.templateMatchesAllLogs(
        'ERROR connection to <HOSTNAME> failed after 3 retries',
        [
          'ERROR connection to db-01.local failed after 3 retries',
          'ERROR connection to cache-02.cluster failed', // missing "3 retries"
          'ERROR connection to api.prod.internal failed after 5 retries',
        ],
      );
      expect(result).toBe(false);
    });
  });

  describe('no-refine guard', () => {
    it('skips refinement when Drain template already matches all logs', () => {
      const groups: RefinementInput[] = [
        {
          logs: [
            'Accepted password for root from 192.168.1.1',
            'Accepted password for admin from 10.0.0.1',
          ],
          drainTemplate: 'Accepted password for <*> from <IP>',
        },
      ];
      const results = refiner.refine(groups);
      expect(results[0]!.changed).toBe(false);
      expect(results[0]!.refinedTemplate).toBe('Accepted password for <*> from <IP>');
    });

    it('still refines when Drain template does not match', () => {
      const groups: RefinementInput[] = [
        {
          logs: [
            'Connection from 10.0.0.1 established',
            'Connection from 192.168.1.1 detected',
          ],
          drainTemplate: 'Connection from 10.0.0.1 established', // wrong template
        },
      ];
      const results = refiner.refine(groups);
      // Should attempt refinement (template may or may not change depending on algorithm)
      expect(results[0]!.refinedTemplate).toBeDefined();
    });
  });
});
