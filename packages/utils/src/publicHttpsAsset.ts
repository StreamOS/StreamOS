import { lookup } from "node:dns/promises";
import { isIP } from "node:net";

const BLOCKED_HOSTNAME_SUFFIXES = [
  ".internal",
  ".local",
  ".localhost",
  ".railway.internal",
];
const BLOCKED_HOSTNAMES = new Set([
  "internal",
  "local",
  "localhost",
  "railway.internal",
]);
const DEFAULT_ASSET_FETCH_TIMEOUT_MS = 30_000;
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

export type PublicHttpsAssetFetchResult = {
  cleanup(): void;
  didTimeout(): boolean;
  response: Response;
  signal?: AbortSignal;
};

export async function fetchPublicHttpsAsset({
  fetchTimeoutMs = DEFAULT_ASSET_FETCH_TIMEOUT_MS,
  fetchFn,
  resolver = resolveHostname,
  signal,
  url,
}: {
  fetchTimeoutMs?: number;
  fetchFn: typeof fetch;
  resolver?: PublicHttpsAssetResolver;
  signal?: AbortSignal;
  url: string;
}): Promise<PublicHttpsAssetFetchResult> {
  let currentUrl = await validatePublicHttpsAssetUrl(url, resolver);
  const fetchSignal = createAssetFetchSignal({
    parentSignal: signal,
    timeoutMs: fetchTimeoutMs,
  });

  try {
    for (
      let redirectCount = 0;
      redirectCount <= MAX_ASSET_REDIRECTS;
      redirectCount += 1
    ) {
      let response: Response;
      try {
        response = await fetchFn(currentUrl, {
          redirect: "manual",
          signal: fetchSignal.signal,
        });
      } catch (error) {
        if (fetchSignal.didTimeout()) {
          throw new UnsafePublicHttpsAssetUrlError("Asset fetch timed out.");
        }

        throw error;
      }

      if (!REDIRECT_STATUSES.has(response.status)) {
        return {
          cleanup: fetchSignal.cleanup,
          didTimeout: fetchSignal.didTimeout,
          response,
          signal: fetchSignal.signal,
        };
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
  } catch (error) {
    fetchSignal.cleanup();
    throw error;
  }
}

export async function validatePublicHttpsAssetUrl(
  rawUrl: string,
  resolver: PublicHttpsAssetResolver = resolveHostname,
): Promise<URL> {
  let url: URL;
  try {
    url = new URL(rawUrl);
  } catch (_error) {
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
  } catch (_error) {
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
    BLOCKED_HOSTNAMES.has(hostname) ||
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

function createAssetFetchSignal({
  parentSignal,
  timeoutMs,
}: {
  parentSignal?: AbortSignal;
  timeoutMs: number;
}): {
  cleanup(): void;
  didTimeout(): boolean;
  signal?: AbortSignal;
} {
  if (!parentSignal && (!Number.isFinite(timeoutMs) || timeoutMs <= 0)) {
    return {
      cleanup() {},
      didTimeout: () => false,
      signal: undefined,
    };
  }

  const controller = new AbortController();
  let timeoutId: ReturnType<typeof setTimeout> | undefined;
  let timedOut = false;
  const abortFromParent = () => {
    controller.abort(parentSignal?.reason);
  };

  if (parentSignal) {
    if (parentSignal.aborted) {
      abortFromParent();
    } else {
      parentSignal.addEventListener("abort", abortFromParent, { once: true });
    }
  }

  if (Number.isFinite(timeoutMs) && timeoutMs > 0) {
    timeoutId = setTimeout(() => {
      timedOut = true;
      controller.abort(new Error("Asset fetch timed out."));
    }, timeoutMs);
  }

  return {
    cleanup() {
      if (timeoutId) {
        clearTimeout(timeoutId);
      }

      parentSignal?.removeEventListener("abort", abortFromParent);
    },
    didTimeout: () => timedOut,
    signal: controller.signal,
  };
}

function isPublicIpv4(address: string): boolean {
  const value = ipv4ToNumber(address);
  if (value === null) {
    return false;
  }

  const nonGlobalRanges: Array<[number, number]> = [
    [0x00000000, 0x00ffffff],
    [0x0a000000, 0x0affffff],
    [0x64400000, 0x647fffff],
    [0x7f000000, 0x7fffffff],
    [0xa9fe0000, 0xa9feffff],
    [0xac100000, 0xac1fffff],
    [0xc0000000, 0xc00000ff],
    [0xc0000200, 0xc00002ff],
    [0xc0586300, 0xc05863ff],
    [0xc0a80000, 0xc0a8ffff],
    [0xc6120000, 0xc613ffff],
    [0xc6336400, 0xc63364ff],
    [0xcb007100, 0xcb0071ff],
    [0xe0000000, 0xffffffff],
  ];

  return !nonGlobalRanges.some(
    ([start, end]) => value >= start && value <= end,
  );
}

function ipv4ToNumber(address: string): number | null {
  const octets = address.split(".").map((part) => Number(part));
  if (
    octets.length !== 4 ||
    octets.some((octet) => !Number.isInteger(octet) || octet < 0 || octet > 255)
  ) {
    return null;
  }

  const first = octets[0];
  const second = octets[1];
  const third = octets[2];
  const fourth = octets[3];

  if (
    first === undefined ||
    second === undefined ||
    third === undefined ||
    fourth === undefined
  ) {
    return null;
  }

  return (
    ((first << 24) >>> 0) +
    ((second << 16) >>> 0) +
    ((third << 8) >>> 0) +
    fourth
  );
}

function isPublicIpv6(address: string): boolean {
  const normalized = address.toLowerCase();
  const mappedIpv4 = normalized.match(/(?:::ffff:)(\d+\.\d+\.\d+\.\d+)$/);
  if (mappedIpv4?.[1]) {
    return isPublicIpv4(mappedIpv4[1]);
  }

  const value = ipv6ToBigInt(normalized);
  if (value === null) {
    return false;
  }

  const globalUnicastStart = 0x2000_0000_0000_0000_0000_0000_0000_0000n;
  const globalUnicastEnd = 0x3fff_ffff_ffff_ffff_ffff_ffff_ffff_ffffn;
  if (value < globalUnicastStart || value > globalUnicastEnd) {
    return false;
  }

  const nonGlobalRanges: Array<[bigint, bigint]> = [
    ipv6Range("2001::", 23),
    ipv6Range("2001:db8::", 32),
    ipv6Range("2002::", 16),
    ipv6Range("3fff::", 20),
  ];

  return !nonGlobalRanges.some(
    ([start, end]) => value >= start && value <= end,
  );
}

function ipv6Range(cidrBase: string, prefixLength: number): [bigint, bigint] {
  const base = ipv6ToBigInt(cidrBase);
  if (base === null) {
    throw new Error(`Invalid IPv6 range base ${cidrBase}`);
  }

  const hostBits = 128n - BigInt(prefixLength);
  const size = 1n << hostBits;
  return [base, base + size - 1n];
}

function ipv6ToBigInt(address: string): bigint | null {
  const [head = "", tail = ""] = address.split("::");
  if (address.split("::").length > 2) {
    return null;
  }

  const headParts = head ? head.split(":") : [];
  const tailParts = tail ? tail.split(":") : [];
  const missingParts = address.includes("::")
    ? 8 - headParts.length - tailParts.length
    : 0;
  const parts = [
    ...headParts,
    ...Array.from({ length: missingParts }, () => "0"),
    ...tailParts,
  ];

  if (parts.length !== 8) {
    return null;
  }

  let value = 0n;
  for (const part of parts) {
    if (!/^[\da-f]{1,4}$/u.test(part)) {
      return null;
    }

    value = (value << 16n) + BigInt(Number.parseInt(part, 16));
  }

  return value;
}
