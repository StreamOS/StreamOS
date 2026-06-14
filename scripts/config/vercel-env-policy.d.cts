export type VercelEnvironmentIssue = {
  name: string;
  reason: string;
};

export type VercelEnvironmentValidationOptions = {
  contextLabel?: string;
  requireRequired?: boolean;
  validatePublicUrls?: boolean;
};

export const FORBIDDEN_OPENAI_PREFIX: string;
export const FORBIDDEN_VERCEL_ENV_NAMES: ReadonlySet<string>;
export const FORBIDDEN_VERCEL_ENV_PREFIXES: readonly string[];
export const PUBLIC_URL_VERCEL_ENV_NAMES: ReadonlySet<string>;
export const REQUIRED_VERCEL_ENV_NAMES: readonly string[];

export function assertVercelEnvironment(
  env?: NodeJS.ProcessEnv,
  options?: VercelEnvironmentValidationOptions,
): void;

export function collectVercelEnvironmentIssues(
  env?: NodeJS.ProcessEnv,
  options?: Omit<
    VercelEnvironmentValidationOptions,
    "contextLabel"
  >,
): VercelEnvironmentIssue[];

export function findForbiddenOpenAIEnvNames(
  env?: NodeJS.ProcessEnv,
): string[];

export function formatForbiddenOpenAIEnvError(
  names: readonly string[],
  contextLabel?: string,
): string;

export function formatVercelEnvironmentIssues(
  issues: readonly VercelEnvironmentIssue[],
  contextLabel?: string,
): string;

export function normalizeEnvValue(value: unknown): string;

export function validatePublicUrl(
  name: string,
  rawValue: string,
): VercelEnvironmentIssue | null;
