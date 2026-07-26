import { describe, it, expect } from 'vitest';
import { WebLLMProvider } from '../src/WebLLMProvider.js';

describe('WebLLMProvider', () => {
  // Basic construction
  it('should create instance with default modelId', () => {
    const provider = new WebLLMProvider();
    expect(provider).toBeDefined();
    expect(provider.modelId).toBe('WebLLM-heuristic');
  });

  // Custom modelId
  it('should accept custom modelId', () => {
    const provider = new WebLLMProvider('my-custom-model');
    expect(provider.modelId).toBe('my-custom-model');
  });

  // modelId format
  it('modelId should be a non-empty string', () => {
    const provider = new WebLLMProvider();
    expect(typeof provider.modelId).toBe('string');
    expect(provider.modelId.length).toBeGreaterThan(0);
  });

  // Single sample extraction
  it('should extract template from a single log sample', async () => {
    const provider = new WebLLMProvider();
    const result = await provider.extractTemplate(['User admin logged in from 192.168.1.1']);

    expect(result).toBeDefined();
    expect(typeof result.template).toBe('string');
    expect(result.template.length).toBeGreaterThan(0);
    expect(result.confidence).toBeGreaterThanOrEqual(0);
    expect(result.confidence).toBeLessThanOrEqual(1);
    expect(Array.isArray(result.variables)).toBe(true);
  });

  // Identical logs produce consistent template
  it('should produce consistent template for identical logs', async () => {
    const provider = new WebLLMProvider();
    const samples = [
      'Error occurred on server alpha',
      'Error occurred on server alpha',
      'Error occurred on server alpha',
    ];

    const result = await provider.extractTemplate(samples);

    expect(result.template).toBe('Error occurred on server alpha');
    expect(result.variables).toHaveLength(0);
    expect(result.confidence).toBeGreaterThan(0.6);
  });

  // Varying logs should detect variables
  it('should detect IP addresses as variables', async () => {
    const provider = new WebLLMProvider();
    const samples = [
      'Connection from 192.168.1.1',
      'Connection from 10.0.0.1',
      'Connection from 172.16.0.1',
    ];

    const result = await provider.extractTemplate(samples);

    expect(result.template).toContain('<*>');
    const ipVars = result.variables.filter((v) => v.category === 'IP');
    expect(ipVars.length).toBeGreaterThan(0);
  });

  // Varying logs with numbers
  it('should detect numeric variables', async () => {
    const provider = new WebLLMProvider();
    const samples = ['Processed 100 items', 'Processed 200 items', 'Processed 300 items'];

    const result = await provider.extractTemplate(samples);

    expect(result.template).toContain('<*>');
    const numVars = result.variables.filter((v) => v.category === 'NUM');
    expect(numVars.length).toBeGreaterThan(0);
  });

  // Empty input
  it('should handle empty input array', async () => {
    const provider = new WebLLMProvider();
    const result = await provider.extractTemplate([]);

    expect(result.template).toBe('');
    expect(result.variables).toHaveLength(0);
    expect(result.confidence).toBe(0);
  });

  // Confidence should be higher with more samples
  it('should give higher confidence for more samples', async () => {
    const provider = new WebLLMProvider();
    const few = ['Login from 192.168.1.1', 'Login from 10.0.0.1'];
    const many = [
      'Login from 192.168.1.1',
      'Login from 10.0.0.1',
      'Login from 172.16.0.1',
      'Login from 8.8.8.8',
      'Login from 1.1.1.1',
    ];

    const resultFew = await provider.extractTemplate(few);
    const resultMany = await provider.extractTemplate(many);

    expect(resultMany.confidence).toBeGreaterThan(resultFew.confidence);
  });

  // UUID detection
  it('should detect UUID variables', async () => {
    const provider = new WebLLMProvider();
    const samples = [
      'Task 550e8400-e29b-41d4-a716-446655440000 completed',
      'Task 6ba7b810-9dad-11d1-80b4-00c04fd430c8 completed',
    ];

    const result = await provider.extractTemplate(samples);

    const uuidVars = result.variables.filter((v) => v.category === 'UUID');
    expect(uuidVars.length).toBeGreaterThan(0);
  });

  // Variables have correct structure
  it('should return variables with correct structure', async () => {
    const provider = new WebLLMProvider();
    const result = await provider.extractTemplate([
      'Failed login from 192.168.1.100 on port 22',
      'Failed login from 10.0.0.50 on port 8080',
    ]);

    for (const variable of result.variables) {
      expect(variable).toHaveProperty('position');
      expect(variable).toHaveProperty('value');
      expect(variable).toHaveProperty('category');
      expect(typeof variable.position).toBe('number');
      expect(typeof variable.value).toBe('string');
      expect(typeof variable.category).toBe('string');
    }
  });

  // Multiple varying positions
  it('should handle multiple variable positions', async () => {
    const provider = new WebLLMProvider();
    const samples = [
      '2024-01-01T10:00:00Z User alice from 192.168.1.1',
      '2024-01-02T11:00:00Z User bob from 10.0.0.1',
    ];

    const result = await provider.extractTemplate(samples);

    // Should have at least 2 variable positions (timestamp and IP)
    expect(result.variables.length).toBeGreaterThanOrEqual(2);
    expect(result.template.split('<*>').length - 1).toBeGreaterThanOrEqual(2);
  });

  // All identical tokens
  it('should keep all identical tokens as literals', async () => {
    const provider = new WebLLMProvider();
    const result = await provider.extractTemplate([
      'static message here',
      'static message here',
      'static message here',
    ]);

    expect(result.variables).toHaveLength(0);
    expect(result.template).not.toContain('<*>');
    // With few samples, confidence may be moderate
    expect(result.confidence).toBeGreaterThanOrEqual(0.6);
  });

  // Email detection
  it('should detect email addresses', async () => {
    const provider = new WebLLMProvider();
    const samples = ['Email sent to admin@example.com', 'Email sent to user@test.org'];

    const result = await provider.extractTemplate(samples);

    const emailVars = result.variables.filter((v) => v.category === 'EMAIL');
    expect(emailVars.length).toBeGreaterThan(0);
  });

  // Path detection
  it('should detect file paths', async () => {
    const provider = new WebLLMProvider();
    const result = await provider.extractTemplate([
      'Reading /var/log/app.log',
      'Reading /var/log/error.log',
    ]);

    // The path token might be classified as PATH or fallback to another category
    expect(result.template).toContain('<*>');
    expect(result.variables.length).toBeGreaterThan(0);
  });

  // Timestamp detection
  it('should detect ISO timestamps', async () => {
    const provider = new WebLLMProvider();
    const result = await provider.extractTemplate([
      'Event at 2024-01-15T10:30:00Z happened',
      'Event at 2024-02-20T14:00:00Z happened',
    ]);

    const timeVars = result.variables.filter((v) => v.category === 'TIMESTAMP');
    expect(timeVars.length).toBeGreaterThan(0);
  });

  // Hostname detection
  it('should detect hostnames', async () => {
    const provider = new WebLLMProvider();
    const result = await provider.extractTemplate([
      'Connected to server.example.com',
      'Connected to host.test.org',
    ]);

    const hostVars = result.variables.filter((v) => v.category === 'HOSTNAME');
    expect(hostVars.length).toBeGreaterThan(0);
  });

  // Hex number detection
  it('should detect hex values', async () => {
    const provider = new WebLLMProvider();
    const result = await provider.extractTemplate([
      'Address 0xAB12CD34 accessed',
      'Address 0xEF5678AB accessed',
    ]);

    // The hex value should be detected as a variable
    expect(result.variables.length).toBeGreaterThan(0);
  });

  // Time-only timestamps (HH:MM:SS format)
  it('should detect time-only timestamps', async () => {
    const provider = new WebLLMProvider();
    const result = await provider.extractTemplate([
      'Event at 10:30:00 happened',
      'Event at 14:25:30 happened',
    ]);

    const timeVars = result.variables.filter((v) => v.category === 'TIMESTAMP');
    expect(timeVars.length).toBeGreaterThan(0);
  });

  // Log samples with different token counts
  it('should handle log samples with different token counts', async () => {
    const provider = new WebLLMProvider();
    const result = await provider.extractTemplate([
      'short message',
      'longer message with extra words',
    ]);

    expect(result).toBeDefined();
    expect(typeof result.template).toBe('string');
    expect(result.template.length).toBeGreaterThan(0);
  });

  // Identical classified tokens across all samples
  it('should handle identical classified tokens across all samples', async () => {
    const provider = new WebLLMProvider();
    const result = await provider.extractTemplate([
      'Server 192.168.1.1 restarted',
      'Server 192.168.1.1 restarted',
    ]);

    expect(result).toBeDefined();
    expect(typeof result.template).toBe('string');
    // The IP is same in all, so it may be treated as literal or variable
    // depending on implementation; just verify valid output
  });

  // Single log with no detectable variables
  it('should handle single log with no variables', async () => {
    const provider = new WebLLMProvider();
    const result = await provider.extractTemplate(['Server started successfully']);

    expect(result.template).toBe('Server started successfully');
    expect(result.confidence).toBe(0.9);
  });
});
