import ipaddress
import socket
from collections.abc import Callable, Iterable

import httpx


HostnameResolver = Callable[
    [str],
    Iterable[ipaddress.IPv4Address | ipaddress.IPv6Address],
]


class UnsafeAssetUrlError(ValueError):
    pass


BLOCKED_HOSTNAME_SUFFIXES = (
    ".internal",
    ".local",
    ".localhost",
)


def resolve_hostname(
    hostname: str,
) -> list[ipaddress.IPv4Address | ipaddress.IPv6Address]:
    try:
        records = socket.getaddrinfo(hostname, None, type=socket.SOCK_STREAM)
    except socket.gaierror as error:
        raise UnsafeAssetUrlError(
            "Asset URL hostname could not be resolved."
        ) from error

    addresses: list[ipaddress.IPv4Address | ipaddress.IPv6Address] = []
    for record in records:
        raw_address = record[4][0]
        address = ipaddress.ip_address(raw_address)
        if address not in addresses:
            addresses.append(address)

    if not addresses:
        raise UnsafeAssetUrlError(
            "Asset URL hostname did not resolve to an IP address."
        )

    return addresses


def validate_public_https_url(
    raw_url: str,
    resolver: HostnameResolver = resolve_hostname,
) -> httpx.URL:
    try:
        url = httpx.URL(raw_url)
    except httpx.InvalidURL as error:
        raise UnsafeAssetUrlError("Asset URL is invalid.") from error

    if url.is_relative_url or not url.host:
        raise UnsafeAssetUrlError("Asset URL must be absolute.")

    if url.scheme != "https":
        raise UnsafeAssetUrlError("Asset URL must use https.")

    if url.port is not None and url.port != 443:
        raise UnsafeAssetUrlError("Asset URL must use the default https port.")

    if url.userinfo:
        raise UnsafeAssetUrlError("Asset URL must not include credentials.")

    hostname = url.host.rstrip(".").lower()
    if hostname == "localhost" or hostname.endswith(BLOCKED_HOSTNAME_SUFFIXES):
        raise UnsafeAssetUrlError("Asset URL hostname is not allowed.")

    try:
        addresses = [ipaddress.ip_address(hostname)]
    except ValueError:
        addresses = list(resolver(hostname))

    for address in addresses:
        if not address.is_global:
            raise UnsafeAssetUrlError("Asset URL resolves to a non-public IP address.")

    return url
