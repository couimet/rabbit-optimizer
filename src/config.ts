import { RabbitMaximizerError, RabbitMaximizerErrorCodes } from './errors/index.js';
import { type Config, ConfigSchema } from './schemas/index.js';
import { type RepoFilter } from './types/index.js';
import { RabbitResult } from './domain.js';

import dotenv from 'dotenv';

export type { Config };

dotenv.config();

/**
 * Convert empty-string env vars to undefined so Zod `.default()` and
 * `required_error` behave as expected.
 */
const emptyToUndefined = (val: string | undefined): string | undefined => (val === '' ? undefined : val);

const USER_PATTERN_PART_COUNT = 2;

/**
 * Parse REPO_FILTER from a JSON array string or a bare single pattern.
 * Infers the scope from pattern syntax:
 *   owner/*       → scope: "user"
 *   owner/repo    → scope: "repo"
 *
 *   ["couimet/*", "other-org/repo"]  →  [{pattern:"couimet/*", scope:"user"}, {pattern:"other-org/repo", scope:"repo"}]
 *   couimet/*                        →  [{pattern:"couimet/*", scope:"user"}]
 */
const parseRepoFilter = (val: string | undefined): RepoFilter[] => {
  if (!val || val.trim() === '') return [];
  const raw = val.trim();
  let patterns: string[];
  try {
    const parsed = JSON.parse(raw);
    if (Array.isArray(parsed) && parsed.every((s: unknown) => typeof s === 'string')) {
      patterns = parsed;
    } else {
      patterns = [];
    }
  } catch {
    // A leading "[" means JSON was intended; a parse failure here is malformed
    // input that should fail config validation, not silently become a pattern.
    if (raw.startsWith('[')) return [];
    patterns = [raw];
  }

  return patterns.map((p) => {
    const parts = p.split('/');
    if (parts.length === USER_PATTERN_PART_COUNT && parts[1] === '*') {
      return { pattern: p, scope: 'user' as const };
    }
    return { pattern: p, scope: 'repo' as const };
  });
};

/**
 * Parse and validate config from a raw env-like record.
 * Exported so tests can call it without triggering `process.exit`.
 */
export const parseConfig = (raw: Record<string, string | undefined>): RabbitResult<Config> => {
  // Keep alphabetically sorted by key.
  const prepped = {
    CODERABBIT_ACCOUNT_COOLDOWN_SEC: emptyToUndefined(raw.CODERABBIT_ACCOUNT_COOLDOWN_SEC),
    DATABASE_URL: emptyToUndefined(raw.DATABASE_URL),
    DETECTION_MODE: emptyToUndefined(raw.DETECTION_MODE),
    GITHUB_API_TIMEOUT_SEC: emptyToUndefined(raw.GITHUB_API_TIMEOUT_SEC),
    GITHUB_PAT: emptyToUndefined(raw.GITHUB_PAT),
    MAX_RETRIGGER_ATTEMPTS: emptyToUndefined(raw.MAX_RETRIGGER_ATTEMPTS),
    PAUSE_NOTIFICATION_INITIAL_DELAY_SEC: emptyToUndefined(raw.PAUSE_NOTIFICATION_INITIAL_DELAY_SEC),
    PAUSE_NOTIFICATION_REPEAT_INTERVAL_SEC: emptyToUndefined(raw.PAUSE_NOTIFICATION_REPEAT_INTERVAL_SEC),
    POLL_INTERVAL_SEC: emptyToUndefined(raw.POLL_INTERVAL_SEC),
    PR_SCANNER_INTERVAL_SEC: emptyToUndefined(raw.PR_SCANNER_INTERVAL_SEC),
    REPO_FILTER: parseRepoFilter(raw.REPO_FILTER),
    REVIEW_DETECTION_LOOKBACK_SEC: emptyToUndefined(raw.REVIEW_DETECTION_LOOKBACK_SEC),
    REVIEW_LIMIT_BUFFER_SEC: emptyToUndefined(raw.REVIEW_LIMIT_BUFFER_SEC),
    REVIEW_LIMIT_FALLBACK_WAIT_SEC: emptyToUndefined(raw.REVIEW_LIMIT_FALLBACK_WAIT_SEC),
    SCHEDULER_MAX_PR_STATE_FETCHES_PER_TICK: emptyToUndefined(raw.SCHEDULER_MAX_PR_STATE_FETCHES_PER_TICK),
    SCHEDULER_MAX_RETRIGGER_AGE_SEC: emptyToUndefined(raw.SCHEDULER_MAX_RETRIGGER_AGE_SEC),
    SCHEDULER_RETRIGGER_SPACING_SEC: emptyToUndefined(raw.SCHEDULER_RETRIGGER_SPACING_SEC),
    SCHEDULER_RETRY_BACKOFF_BASE_SEC: emptyToUndefined(raw.SCHEDULER_RETRY_BACKOFF_BASE_SEC),
    SCHEDULER_RETRY_BACKOFF_MAX_SEC: emptyToUndefined(raw.SCHEDULER_RETRY_BACKOFF_MAX_SEC),
    SCHEDULER_STALE_TICK_MULTIPLIER: emptyToUndefined(raw.SCHEDULER_STALE_TICK_MULTIPLIER),
    SCHEDULER_TICK_INTERVAL_SEC: emptyToUndefined(raw.SCHEDULER_TICK_INTERVAL_SEC),
    TUNNEL_URL: emptyToUndefined(raw.TUNNEL_URL),
    WEB_PORT: emptyToUndefined(raw.WEB_PORT),
    WEBHOOK_SECRET: emptyToUndefined(raw.WEBHOOK_SECRET),
  };

  const result = ConfigSchema.safeParse(prepped);

  if (!result.success) {
    return RabbitResult.err(
      new RabbitMaximizerError({
        code: RabbitMaximizerErrorCodes.CONFIG_VALIDATION_FAILED,
        message: 'Config validation failed',
        functionName: 'parseConfig',
        details: { issues: result.error.issues.map((i) => `${i.path.join('.')}: ${i.message}`) },
      }),
    );
  }

  return RabbitResult.ok(result.data);
};

/** @internal Exported for testing — logs every config issue and exits with code 1. */
export const exitWithConfigErrors = (error: RabbitMaximizerError): never => {
  const issues: string[] = (error.details?.issues as string[]) ?? [];
  const formatted = issues.map((i) => `  - ${i}`).join('\n');
  console.error(`[ERROR] Invalid config:\n${formatted}`);
  process.exit(1);
};

// Keep alphabetically sorted by key.
const parsed = parseConfig({
  CODERABBIT_ACCOUNT_COOLDOWN_SEC: process.env.CODERABBIT_ACCOUNT_COOLDOWN_SEC,
  DATABASE_URL: process.env.DATABASE_URL,
  DETECTION_MODE: process.env.DETECTION_MODE,
  GITHUB_API_TIMEOUT_SEC: process.env.GITHUB_API_TIMEOUT_SEC,
  GITHUB_PAT: process.env.GITHUB_PAT,
  MAX_RETRIGGER_ATTEMPTS: process.env.MAX_RETRIGGER_ATTEMPTS,
  PAUSE_NOTIFICATION_INITIAL_DELAY_SEC: process.env.PAUSE_NOTIFICATION_INITIAL_DELAY_SEC,
  PAUSE_NOTIFICATION_REPEAT_INTERVAL_SEC: process.env.PAUSE_NOTIFICATION_REPEAT_INTERVAL_SEC,
  POLL_INTERVAL_SEC: process.env.POLL_INTERVAL_SEC,
  PR_SCANNER_INTERVAL_SEC: process.env.PR_SCANNER_INTERVAL_SEC,
  REPO_FILTER: process.env.REPO_FILTER,
  REVIEW_DETECTION_LOOKBACK_SEC: process.env.REVIEW_DETECTION_LOOKBACK_SEC,
  REVIEW_LIMIT_BUFFER_SEC: process.env.REVIEW_LIMIT_BUFFER_SEC,
  REVIEW_LIMIT_FALLBACK_WAIT_SEC: process.env.REVIEW_LIMIT_FALLBACK_WAIT_SEC,
  SCHEDULER_MAX_PR_STATE_FETCHES_PER_TICK: process.env.SCHEDULER_MAX_PR_STATE_FETCHES_PER_TICK,
  SCHEDULER_MAX_RETRIGGER_AGE_SEC: process.env.SCHEDULER_MAX_RETRIGGER_AGE_SEC,
  SCHEDULER_RETRIGGER_SPACING_SEC: process.env.SCHEDULER_RETRIGGER_SPACING_SEC,
  SCHEDULER_RETRY_BACKOFF_BASE_SEC: process.env.SCHEDULER_RETRY_BACKOFF_BASE_SEC,
  SCHEDULER_RETRY_BACKOFF_MAX_SEC: process.env.SCHEDULER_RETRY_BACKOFF_MAX_SEC,
  SCHEDULER_STALE_TICK_MULTIPLIER: process.env.SCHEDULER_STALE_TICK_MULTIPLIER,
  SCHEDULER_TICK_INTERVAL_SEC: process.env.SCHEDULER_TICK_INTERVAL_SEC,
  TUNNEL_URL: process.env.TUNNEL_URL,
  WEB_PORT: process.env.WEB_PORT,
  WEBHOOK_SECRET: process.env.WEBHOOK_SECRET,
});

/* c8 ignore start */
if (!parsed.success) {
  exitWithConfigErrors(parsed.error);
}
/* c8 ignore stop */

export const config: Readonly<Config> = Object.freeze(parsed.value);

/** Format the configured repo filter as a human-readable summary for logging. */
export const describeRepoFilter = (filter: RepoFilter[]): string => filter.map((f) => `${f.pattern} (${f.scope})`).join(', ');
