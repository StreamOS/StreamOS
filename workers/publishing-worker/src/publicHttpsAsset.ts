import { lookup } from "node:dns/promises";
import { isIP } from "node:net";

const BLOCKED_HOSTNAME_SUFFIXES = [".internal", ".local", ".localhost"];
const MAX_ASSET_REDIRECTS = 4;
const REDIRECT_STATUSES = new Set([301, 302, 303, 307, 308]);

export type PublicHttpsAssetResolver = (
  hostname: string,
) => Promise<readonly string[]> | readonly string[];

export class UnsafePublicHttpsAssetUrlError extends Error {
  constructor(message: string) {
    super(message);
    this.name = "UnsafePublicHttpsAssetUrlError";
  }
}

export async function fetchPublicHttpsAsset({
  fetchFn,
  resolver = resolveHostname,
  signal,
  url,
}: {
  fetchFn: typeof fetch;
  resolver?: PublicHttpsAssetResolver;
  signal?: AbortSignal;
  url: string;
}): Promise<Response> {
  let currentUrl = await validatePublicHttpsAssetUrl(url, resolver);

  for (
    let redirectCount = 0;
    redirectCount <= MAX_ASSET_REDIRECTS;
    redirectCount += 1
  ) {
    const response = await fetchFn(currentUrl, {
      redirect: "manual",
      signal,
    });

    if (!REDIRECT_STATUSES.has(response.status)) {
      return response;
    }

    const location = response.headers.get("location");
    if (!location) {
      throw new UnsafePublicHttpsAssetUrlError(
        "Asset URL redirect did not include a Location header.",
      );
    }

    currentUrl = await validatePublicHttpsAssetUrl(
      new URL(location, currentUrl).toString(),
      resolver,
    );
  }

  throw new UnsafePublicHttpsAssetUrlError(
    "Asset URL followed too many redirects.",
  );
}

export async function validatePublicHttpsAssetUrl(
  rawUrl: string,
  resolver: PublicHttpsAssetResolver = resolveHostname,
): Promise<URL> {
  let url: URL;
  try {
    url = new URL(rawUrl);
  } catch (error) {
    throw new UnsafePublicHttpsAssetUrlError("Asset URL is invalid.");
  }

  if (url.protocol !== "https:") {
    throw new UnsafePublicHttpsAssetUrlError("Asset URL must use https.");
  }

  if (url.username || url.password) {
    throw new UnsafePublicHttpsAssetUrlError(
      "Asset URL must not include credentials.",
    );
  }

  if (url.port && url.port !== "443") {
    throw new UnsafePublicHttpsAssetUrlError(
      "Asset URL must use the default https port.",
    );
  }

  const hostname = normalizeHostname(url.hostname);
  if (!hostname) {
    throw new UnsafePublicHttpsAssetUrlError("Asset URL must include a host.");
  }

  if (isBlockedHostname(hostname)) {
    throw new UnsafePublicHttpsAssetUrlError(
      "Asset URL hostname is not allowed.",
    );
  }

  const addresses = await resolveUrlAddresses(hostname, resolver);
  if (addresses.length === 0) {
    throw new UnsafePublicHttpsAssetUrlError(
      "Asset URL hostname did not resolve to an IP address.",
    );
  }

  for (const address of addresses) {
    if (!isPublicIpAddress(address)) {
      throw new UnsafePublicHttpsAssetUrlError(
        "Asset URL resolves to a non-public IP address.",
      );
    }
  }

  return url;
}

async function resolveHostname(hostname: string): Promise<string[]> {
  try {
    const records = await lookup(hostname, {
      all: true,
      verbatim: true,
    });
    return [...new Set(records.map((record) => record.address))];
  } catch (error) {
    throw new UnsafePublicHttpsAssetUrlError(
      "Asset URL hostname could not be resolved.",
    );
  }
}

async function resolveUrlAddresses(
  hostname: string,
  resolver: PublicHttpsAssetResolver,
): Promise<string[]> {
  const literal = stripIpv6Brackets(hostname);
  if (isIP(literal) !== 0) {
    return [literal];
  }

  const addresses = await resolver(hostname);
  return [...new Set(addresses.map((address) => stripIpv6Brackets(address)))];
}

function normalizeHostname(hostname: string): string {
  return stripIpv6Brackets(hostname).replace(/\.+$/, "").toLowerCase();
}

function stripIpv6Brackets(value: string): string {
  return value.startsWith("[") && value.endsWith("]")
    ? value.slice(1, -1)
    : value;
}

function isBlockedHostname(hostname: string): boolean {
  return (
    hostname === "localhost" ||
    hostname === "local" ||
    hostname === "internal" ||
    BLOCKED_HOSTNAME_SUFFIXES.some((suffix) => hostname.endsWith(suffix))
  );
}

function isPublicIpAddress(address: string): boolean {
  const normalized = stripIpv6Brackets(address).toLowerCase();
  const version = isIP(normalized);

  if (version === 4) {
    return isPublicIpv4(normalized);
  }

  if (version === 6) {
    return isPublicIpv6(normalized);
  }

  return false;
}

function isPublicIpv4(address: string): boolean {
  const octets = address.split(".").map((part) => Number(part));
  if (
    octets.length !== 4 ||
    octets.some((octet) => !Number.isInteger(octet) || octet < 0 || octet > 255)
  ) {
    return false;
  }

  const first = octets[0];
  const second = octets[1];
  const third = octets[2];

  if (first === undefined || second === undefined || third === undefined) {
    return false;
  }

  if (first === 0 || first === 10 || first === 127 || first >= 224) {
    return false;
  }

  if (first === 100 && second >= 64 && second <= 127) {
    return false;
  }

  if (first === 169 && second === 254) {
    return false;
  }

  if (first === 172 && second >= 16 && second <= 31) {
    return false;
  }

  if (first === 192 && second === 168) {
    return false;
  }

  if (first === 192 && second === 0) {
    return false;
  }

  if (first === 192 && second === 88 && third === 99) {
    return false;
  }

  if (first === 198 && (second === 18 || second === 19)) {
    return false;
  }

  if (first === 198 && second === 51 && third === 100) {
    return false;
  }

  if (first === 203 && second === 0 && third === 113) {
    return false;
  }

  return true;
}

function isPublicIpv6(address: string): boolean {
  if (address === "::" || address === "::1") {
    return false;
  }

  const normalized = address.toLowerCase();
  const mappedIpv4 = normalized.match(/(?:::ffff:)(\d+\.\d+\.\d+\.\d+)$/);
  if (mappedIpv4?.[1]) {
    return isPublicIpv4(mappedIpv4[1]);
  }

  const firstSegment = Number.parseInt(normalized.split(":")[0] ?? "", 16);
  if (!Number.isFinite(firstSegment)) {
    return false;
  }

  if ((firstSegment & 0xfe00) === 0xfc00) {
    return false;
  }

  if ((firstSegment & 0xffc0) === 0xfe80) {
    return false;
  }

  if ((firstSegment & 0xff00) === 0xff00) {
    return false;
  }

  if (normalized.startsWith("2001:db8:") || normalized === "2001:db8::") {
    return false;
  }

  if (normalized.startsWith("100:")) {
    return false;
  }

  return true;
}
