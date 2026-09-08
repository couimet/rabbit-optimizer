import { type Config, config, describeRepoFilter, exitWithConfigErrors, parseConfig } from '../src/config.js';
import { RabbitMaximizerError, RabbitMaximizerErrorCodes } from '../src/errors/index.js';

import { getRandomString } from '@couimet/dynamic-testing';
import { beforeEach, describe, expect, it, jest } from '@jest/globals';

describe('parseConfig', () => {
  let githubPat: string;
  let webhookSecret: string;
  let tunnelUrl: string;
  let BASE: Record<string, string>;

  beforeEach(() => {
    githubPat = getRandomString({ charset: 'alphanumeric', length: 20 });
    webhookSecret = getRandomString({ charset: 'alphanumeric', length: 16 });
    tunnelUrl = `https://${getRandomString({ charset: 'alpha', length: 8 })}.com`;
    BASE = {
      DETECTION_MODE: 'poll',
      GITHUB_PAT: githubPat,
      POLL_INTERVAL_SEC: '90',
      DATABASE_URL: 'file:./data/rabbit-maximizer.db',
      REPO_FILTER: 'couimet/*',
    };
  });

  /** @testFixture */
  const env = (base: Record<string, string>, overrides: Record<string, string | undefined> = {}): Record<string, string | undefined> => ({
    ...base,
    ...overrides,
  });

  // -- Failure cases ---------------------------------------------------------

  it('fails when GITHUB_PAT is missing', () => {
    const result = parseConfig(env(BASE, { GITHUB_PAT: undefined }));

    expect(result).toHaveDetailedError('CONFIG_VALIDATION_FAILED', {
      message: 'Config validation failed',
      functionName: 'parseConfig',
      details: { issues: ['GITHUB_PAT: GITHUB_PAT is required'] },
    });
  });

  it('fails when DETECTION_MODE is invalid', () => {
    const result = parseConfig(env(BASE, { DETECTION_MODE: 'invalid' }));

    expect(result).toHaveDetailedError('CONFIG_VALIDATION_FAILED', {
      message: 'Config validation failed',
      functionName: 'parseConfig',
      details: { issues: ['DETECTION_MODE: Invalid option: expected one of "poll"|"webhook"'] },
    });
  });

  it('fails when DETECTION_MODE=webhook and WEBHOOK_SECRET is missing', () => {
    const result = parseConfig(env(BASE, { DETECTION_MODE: 'webhook' }));

    expect(result).toHaveDetailedError('CONFIG_VALIDATION_FAILED', {
      message: 'Config validation failed',
      functionName: 'parseConfig',
      details: {
        issues: ['WEBHOOK_SECRET: WEBHOOK_SECRET is required when DETECTION_MODE=webhook', 'TUNNEL_URL: TUNNEL_URL is required when DETECTION_MODE=webhook'],
      },
    });
  });

  it('fails when DETECTION_MODE=webhook and TUNNEL_URL is missing', () => {
    const result = parseConfig(env(BASE, { DETECTION_MODE: 'webhook', WEBHOOK_SECRET: webhookSecret }));

    expect(result).toHaveDetailedError('CONFIG_VALIDATION_FAILED', {
      message: 'Config validation failed',
      functionName: 'parseConfig',
      details: { issues: ['TUNNEL_URL: TUNNEL_URL is required when DETECTION_MODE=webhook'] },
    });
  });

  it('fails when GITHUB_PAT is empty string', () => {
    const result = parseConfig(env(BASE, { GITHUB_PAT: '' }));

    expect(result).toHaveDetailedError('CONFIG_VALIDATION_FAILED', {
      message: 'Config validation failed',
      functionName: 'parseConfig',
      details: { issues: ['GITHUB_PAT: GITHUB_PAT is required'] },
    });
  });

  it('fails when WEB_PORT is zero', () => {
    const result = parseConfig({ ...BASE, WEB_PORT: '0' });

    expect(result).toHaveDetailedError('CONFIG_VALIDATION_FAILED', {
      message: 'Config validation failed',
      functionName: 'parseConfig',
      details: { issues: ['WEB_PORT: WEB_PORT must be a positive integer'] },
    });
  });

  it('fails when WEB_PORT is negative', () => {
    const result = parseConfig({ ...BASE, WEB_PORT: '-5' });

    expect(result).toHaveDetailedError('CONFIG_VALIDATION_FAILED', {
      message: 'Config validation failed',
      functionName: 'parseConfig',
      details: { issues: ['WEB_PORT: WEB_PORT must be a positive integer'] },
    });
  });

  it('fails when WEB_PORT is non-numeric', () => {
    const result = parseConfig({ ...BASE, WEB_PORT: 'abc' });

    expect(result).toHaveDetailedError('CONFIG_VALIDATION_FAILED', {
      message: 'Config validation failed',
      functionName: 'parseConfig',
      details: { issues: ['WEB_PORT: Invalid input: expected number, received NaN'] },
    });
  });

  // -- Success cases ---------------------------------------------------------

  it('applies default POLL_INTERVAL_SEC when absent', () => {
    const { POLL_INTERVAL_SEC: _, ...rest } = BASE;
    const result = parseConfig(rest);

    expect(result.value.POLL_INTERVAL_SEC).toBe(90);
  });

  it('applies default SCHEDULER_TICK_INTERVAL_SEC of 10 when absent', () => {
    const result = parseConfig(BASE);

    expect(result.value.SCHEDULER_TICK_INTERVAL_SEC).toBe(10);
  });

  it('reads SCHEDULER_MAX_PR_STATE_FETCHES_PER_TICK from the environment', () => {
    const result = parseConfig(env(BASE, { SCHEDULER_MAX_PR_STATE_FETCHES_PER_TICK: '3' }));

    expect(result.value.SCHEDULER_MAX_PR_STATE_FETCHES_PER_TICK).toBe(3);
  });
  it('applies default DATABASE_URL when absent', () => {
    const { DATABASE_URL: _, ...rest } = BASE;
    const result = parseConfig(rest);

    expect(result.value.DATABASE_URL).toBe('file:./data/rabbit-maximizer.db');
  });

  it('applies default DETECTION_MODE when absent', () => {
    const { DETECTION_MODE: _, ...rest } = BASE;
    const result = parseConfig(rest);

    expect(result.value.DETECTION_MODE).toBe('poll');
  });

  it('applies default WEB_PORT of 3000 when absent', () => {
    const result = parseConfig(BASE);

    expect(result.value.WEB_PORT).toBe(3000);
  });

  it('applies default WEB_PORT of 3000 when empty string', () => {
    const result = parseConfig({ ...BASE, WEB_PORT: '' });

    expect(result.value.WEB_PORT).toBe(3000);
  });

  it('fails when REPO_FILTER is missing', () => {
    const result = parseConfig(env(BASE, { REPO_FILTER: undefined }));

    expect(result).toHaveDetailedError('CONFIG_VALIDATION_FAILED', {
      message: 'Config validation failed',
      functionName: 'parseConfig',
      details: { issues: ['REPO_FILTER: REPO_FILTER must have at least one entry'] },
    });
  });

  it('fails when REPO_FILTER is an empty array', () => {
    const result = parseConfig(env(BASE, { REPO_FILTER: '[]' }));

    expect(result).toHaveDetailedError('CONFIG_VALIDATION_FAILED', {
      message: 'Config validation failed',
      functionName: 'parseConfig',
      details: { issues: ['REPO_FILTER: REPO_FILTER must have at least one entry'] },
    });
  });

  it('fails when REPO_FILTER is a malformed JSON array rather than treating it as a bare pattern', () => {
    const result = parseConfig(env(BASE, { REPO_FILTER: '["couimet/*"' }));

    expect(result).toHaveDetailedError('CONFIG_VALIDATION_FAILED', {
      message: 'Config validation failed',
      functionName: 'parseConfig',
      details: { issues: ['REPO_FILTER: REPO_FILTER must have at least one entry'] },
    });
  });

  it('parses REPO_FILTER as JSON array with multiple entries', () => {
    const result = parseConfig(env(BASE, { REPO_FILTER: '["couimet/*","other-org/specific-repo"]' }));

    expect(result.value.REPO_FILTER).toStrictEqual([
      { pattern: 'couimet/*', scope: 'user' },
      { pattern: 'other-org/specific-repo', scope: 'repo' },
    ]);
  });

  it('succeeds with poll mode and no webhook vars', () => {
    const result = parseConfig(BASE);

    expect(result.value.DETECTION_MODE).toBe('poll');
    expect(result.value.GITHUB_PAT).toBe(githubPat);
    expect(result.value.REPO_FILTER).toStrictEqual([{ pattern: 'couimet/*', scope: 'user' }]);
  });

  it('falls back to empty array when REPO_FILTER JSON is not a string array', () => {
    const result = parseConfig(env(BASE, { REPO_FILTER: '[1,2,3]' }));

    expect(result).toHaveDetailedError('CONFIG_VALIDATION_FAILED', {
      message: 'Config validation failed',
      functionName: 'parseConfig',
      details: { issues: ['REPO_FILTER: REPO_FILTER must have at least one entry'] },
    });
  });

  it('succeeds with webhook mode and both webhook vars set', () => {
    const result = parseConfig(
      env(BASE, {
        DETECTION_MODE: 'webhook',
        WEBHOOK_SECRET: webhookSecret,
        TUNNEL_URL: tunnelUrl,
      }),
    );

    expect(result.value.DETECTION_MODE).toBe('webhook');
    expect(result.value.WEBHOOK_SECRET).toBe(webhookSecret);
    expect(result.value.TUNNEL_URL).toBe(tunnelUrl);
  });

  it('returns data that can produce a frozen config', () => {
    const result = parseConfig(BASE);
    const frozen: Readonly<Config> = Object.freeze(result.value);

    expect(Object.isFrozen(frozen)).toBe(true);
  });
});

describe('auto-validated config export', () => {
  it('exports a frozen config object', () => {
    expect(Object.isFrozen(config)).toBe(true);
    expect(typeof config.GITHUB_PAT).toBe('string');
    expect(typeof config.DETECTION_MODE).toBe('string');
  });
});

describe('exitWithConfigErrors', () => {
  it('calls console.error and process.exit with code 1', () => {
    jest.spyOn(process, 'exit').mockImplementation(() => {
      throw new Error('process.exit(1)');
    });
    const mockConsoleError = jest.spyOn(console, 'error').mockImplementation(() => {});

    const validationError = new RabbitMaximizerError({
      code: RabbitMaximizerErrorCodes.CONFIG_VALIDATION_FAILED,
      message: 'Config validation failed',
      functionName: 'parseConfig',
      details: { issues: ['GITHUB_PAT: required'] },
    });
    expect(() => exitWithConfigErrors(validationError)).toThrow('process.exit(1)');
    expect(mockConsoleError).toHaveBeenCalledWith('[ERROR] Invalid config:\n  - GITHUB_PAT: required');
  });

  it('handles missing details gracefully', () => {
    jest.spyOn(process, 'exit').mockImplementation(() => {
      throw new Error('process.exit(1)');
    });
    const mockConsoleError = jest.spyOn(console, 'error').mockImplementation(() => {});

    const errorWithoutDetails = new RabbitMaximizerError({
      code: RabbitMaximizerErrorCodes.CONFIG_VALIDATION_FAILED,
      message: 'Config validation failed',
      functionName: 'parseConfig',
    });
    expect(() => exitWithConfigErrors(errorWithoutDetails)).toThrow('process.exit(1)');
    expect(mockConsoleError).toHaveBeenCalledWith('[ERROR] Invalid config:\n');
  });
});

describe('describeRepoFilter', () => {
  it('formats a single user-scope filter', () => {
    expect(describeRepoFilter([{ pattern: 'couimet/*', scope: 'user' }])).toBe('couimet/* (user)');
  });

  it('formats a single repo-scope filter', () => {
    expect(describeRepoFilter([{ pattern: 'other-org/repo', scope: 'repo' }])).toBe('other-org/repo (repo)');
  });

  it('joins multiple filters with commas', () => {
    expect(
      describeRepoFilter([
        { pattern: 'couimet/*', scope: 'user' },
        { pattern: 'other-org/repo', scope: 'repo' },
      ]),
    ).toBe('couimet/* (user), other-org/repo (repo)');
  });

  it('returns empty string for an empty filter list', () => {
    expect(describeRepoFilter([])).toBe('');
  });
});
