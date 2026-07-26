import { describe, it, expect } from 'vitest';
import { PostProcessor } from '../../src/control/PostProcessor.js';

describe('PostProcessor', () => {
  describe('typeIps', () => {
    it('should replace IP with <IP>', () => {
      expect(PostProcessor.typeIps('from 192.168.1.1 to')).toBe('from <IP> to');
    });

    it('should replace another IP', () => {
      expect(PostProcessor.typeIps('host 10.0.0.1 ready')).toBe('host <IP> ready');
    });

    it('should not replace partial IP', () => {
      expect(PostProcessor.typeIps('version 1.2.3')).toBe('version 1.2.3');
    });
  });

  describe('typePaths', () => {
    it('should replace paths with <PATH>', () => {
      expect(PostProcessor.typePaths('open /var/log/syslog file')).toBe('open <PATH> file');
    });

    it('should handle Windows paths', () => {
      const result = PostProcessor.typePaths('file C:\\Windows\\System32 not found');
      expect(result).toContain('<PATH>');
    });

    it('should not replace single slash', () => {
      expect(PostProcessor.typePaths('a / b')).toBe('a / b');
    });
  });

  describe('typeUuids', () => {
    it('should replace UUID with <UUID>', () => {
      expect(PostProcessor.typeUuids('id 550e8400-e29b-41d4-a716-446655440000 here')).toBe(
        'id <UUID> here',
      );
    });

    it('should handle uppercase', () => {
      expect(PostProcessor.typeUuids('id 550E8400-E29B-41D4-A716-446655440000')).toBe('id <UUID>');
    });

    it('should not replace invalid UUID', () => {
      expect(PostProcessor.typeUuids('not 12345-uuid')).toBe('not 12345-uuid');
    });
  });

  describe('typeEmails', () => {
    it('should replace email with <EMAIL>', () => {
      expect(PostProcessor.typeEmails('contact user@example.com now')).toBe('contact <EMAIL> now');
    });

    it('should handle complex emails', () => {
      expect(PostProcessor.typeEmails('from user.name@sub.example.com')).toBe('from <EMAIL>');
    });

    it('should not replace non-email', () => {
      expect(PostProcessor.typeEmails('User alice')).toBe('User alice');
    });
  });

  describe('typeHostnames', () => {
    it('should replace hostname with <HOSTNAME>', () => {
      expect(PostProcessor.typeHostnames('connect to db.primary.local')).toBe(
        'connect to <HOSTNAME>',
      );
    });

    it('should handle multi-segment hostnames', () => {
      expect(PostProcessor.typeHostnames('host api.prod.example.com')).toBe('host <HOSTNAME>');
    });

    it('should not replace IP-prefixed tokens', () => {
      expect(PostProcessor.typeHostnames('at 192.168.1.1.com')).toBe('at 192.168.1.1.com');
    });
  });

  describe('verifyConsistency', () => {
    it('should verify all logs match', () => {
      expect(
        PostProcessor.verifyConsistency('User <*> logged in', [
          'User alice logged in',
          'User bob logged in',
        ]),
      ).toBe(true);
    });

    it('should detect mismatch', () => {
      expect(
        PostProcessor.verifyConsistency('User <*> logged in', [
          'User alice logged in',
          'ERROR connection failed',
        ]),
      ).toBe(false);
    });

    it('should handle typed variables', () => {
      expect(
        PostProcessor.verifyConsistency('from <IP> at <NUM>', [
          'from 192.168.1.1 at 42',
          'from 10.0.0.1 at 8080',
        ]),
      ).toBe(true);
    });

    it('should handle empty log list', () => {
      expect(PostProcessor.verifyConsistency('any template', [])).toBe(true);
    });
  });

  describe('correct (9-rule engine)', () => {
    it('should replace IP addresses with <IP>', () => {
      const result = PostProcessor.correct('User <*> from 192.168.1.1 port <*>', [
        'User alice from 192.168.1.1 port 22',
      ]);
      expect(result.template).toContain('<IP>');
      expect(result.rulesApplied).toContain('type-ips');
    });

    it('should replace UUIDs with <UUID>', () => {
      const result = PostProcessor.correct('User <*> id 550e8400-e29b-41d4-a716-446655440000', [
        'User alice id 550e8400-e29b-41d4-a716-446655440000',
      ]);
      expect(result.template).toContain('<UUID>');
      expect(result.rulesApplied).toContain('type-uuids');
    });

    it('should replace emails with <EMAIL>', () => {
      const result = PostProcessor.correct('User <*> email user@example.com', [
        'User alice email user@example.com',
      ]);
      expect(result.template).toContain('<EMAIL>');
      expect(result.rulesApplied).toContain('type-emails');
    });

    it('should replace hostnames with <HOSTNAME>', () => {
      const result = PostProcessor.correct('connect to db.primary.local', [
        'connect to db.primary.local',
      ]);
      expect(result.template).toContain('<HOSTNAME>');
    });

    it('should replace paths with <PATH>', () => {
      const result = PostProcessor.correct('open /var/log/syslog file', [
        'open /var/log/syslog file',
      ]);
      expect(result.template).toContain('<PATH>');
    });

    it('should replace booleans (BL rule)', () => {
      const result = PostProcessor.correct('flag true enabled', ['flag true enabled']);
      expect(result.template).toContain('<*>');
      expect(result.rulesApplied).toContain('BL/US');
    });

    it('should replace null/root (US rule)', () => {
      const result = PostProcessor.correct('user root action', ['user root action']);
      expect(result.template).toContain('<*>');
      expect(result.rulesApplied).toContain('BL/US');
    });

    it('should consolidate consecutive variables (CV rule)', () => {
      const result = PostProcessor.correct('A <*> <*> B', ['A 1 2 B']);
      expect(result.template).toBe('A <*> B');
      expect(result.rulesApplied).toContain('CV');
    });

    it('should report no rules when template is already clean', () => {
      const result = PostProcessor.correct('User <*> logged in from <IP>', [
        'User alice logged in from 192.168.1.1',
      ]);
      // May apply CS-warning if consistency check triggers, but no other rules
      const nonCsRules = result.rulesApplied.filter((r) => r !== 'CS-warning');
      expect(nonCsRules.length).toBe(0);
    });

    it('should detect consistency failure (CS rule)', () => {
      const result = PostProcessor.correct('User <*> logged in', [
        'User alice logged in',
        'ERROR something broke',
      ]);
      expect(result.rulesApplied).toContain('CS-warning');
    });

    it('should handle mixed typed and heuristic corrections', () => {
      const result = PostProcessor.correct('from 192.168.1.1 port 8080 user true path /var/log', [
        'from 192.168.1.1 port 8080 user true path /var/log',
      ]);
      expect(result.template).toContain('<IP>');
      expect(result.template).toContain('<PATH>');
      expect(result.template).toContain('<*>');
      expect(result.rulesApplied.length).toBeGreaterThan(1);
    });
  });
});
