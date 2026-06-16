export const DEFAULT_AUTOMATION_SERVICE_NAME: string;

export type PrivateAutomationUrlOptions = {
  consumerName?: string;
  expectedServiceName?: string;
  variableName?: string;
};

export function isPrivateIpAddress(hostname: string): boolean;

export function isPrivateAutomationHostname(
  hostname: string,
  options?: Pick<PrivateAutomationUrlOptions, "expectedServiceName">,
): boolean;

export function parseAutomationServiceUrl(
  value: string | URL,
  options?: PrivateAutomationUrlOptions,
): URL;

export function isPrivateAutomationUrl(
  value: string | URL,
  options?: PrivateAutomationUrlOptions,
): boolean;

export function assertPrivateAutomationServiceUrl(
  value: string,
  options?: PrivateAutomationUrlOptions,
): string;
