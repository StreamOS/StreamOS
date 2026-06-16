export type VercelEnvironmentIssue = {
  name: string;
  reason: string;
};

export type VercelEnvironmentValidationOptions = {
  contextLabel?: string;
  knownPresentNames?: Iterable<string>;
  requireRequired?: boolean;
  validatePublicUrls?: boolean;
};

export const ALLOWED_VERCEL_ENV_NAMES: ReadonlySet<string>;
export const ALLOWED_VERCEL_ENV_PREFIXES: readonly string[];
export const FORBIDDEN_OPENAI_PREFIX: string;
export const FORBIDDEN_VERCEL_ENV_NAMES: ReadonlySet<string>;
export const FORBIDDEN_VERCEL_ENV_PREFIXES: readonly string[];
export const PUBLIC_URL_VERCEL_ENV_NAMES: ReadonlySet<string>;
export const REQUIRED_VERCEL_ENV_NAMES: readonly string[];

export function assertNoForbiddenVercelEnv(
  env?: NodeJS.ProcessEnv,
  options?: Pick<
    VercelEnvironmentValidationOptions,
    "contextLabel" | "knownPresentNames"
  >,
): void;

export function assertVercelEnvironment(
  env?: NodeJS.ProcessEnv,
  options?: VercelEnvironmentValidationOptions,
): void;

export function collectUnexpectedVercelEnvNames(
  env?: NodeJS.ProcessEnv,
  knownPresentNames?: Iterable<string>,
): string[];

export function collectVercelEnvironmentIssues(
  env?: NodeJS.ProcessEnv,
  options?: Omit<VercelEnvironmentValidationOptions, "contextLabel">,
): VercelEnvironmentIssue[];

export function findForbiddenVercelEnvNames(
  env?: NodeJS.ProcessEnv,
  knownPresentNames?: Iterable<string>,
): string[];

export function findForbiddenOpenAIEnvNames(env?: NodeJS.ProcessEnv): string[];

export function formatForbiddenVercelEnvError(
  names: readonly string[],
  contextLabel?: string,
): string;

export function formatForbiddenOpenAIEnvError(
  names: readonly string[],
  contextLabel?: string,
): string;

export function formatUnexpectedVercelEnvWarning(
  names: readonly string[],
  contextLabel?: string,
): string;

export function formatVercelEnvironmentIssues(
  issues: readonly VercelEnvironmentIssue[],
  contextLabel?: string,
): string;

export function isAllowedVercelEnvName(name: string): boolean;

export function isForbiddenVercelEnvName(name: string): boolean;

export function matchesAnyPrefix(
  name: string,
  prefixes: readonly string[],
): boolean;

export function normalizeEnvValue(value: unknown): string;

export function validatePublicUrl(
  name: string,
  rawValue: string,
): VercelEnvironmentIssue | null;
