export interface SafeUrlValidationResult {
  valid: boolean;
  normalizedUrl?: string;
  parsed?: URL;
  reason?: string;
}

const MAX_URL_LENGTH = 1000;

function isPrivateOrReservedIpv4(host: string): boolean {
  // Handle single-integer or hex IPv4 notation (e.g. 2130706433 or 0x7f000001)
  if (/^(0x[0-9a-f]+|\d+)$/i.test(host)) {
    return true;
  }

  const ipv4Match = host.match(/^(\d{1,3})\.(\d{1,3})\.(\d{1,3})\.(\d{1,3})$/);
  if (!ipv4Match) return false;

  const octets = ipv4Match.slice(1).map((n) => Number(n));
  if (octets.some((n) => !Number.isInteger(n) || n < 0 || n > 255)) {
    return true;
  }

  const [a, b] = octets;
  if (a === 0) return true; // 0.0.0.0/8 "this network"
  if (a === 10) return true; // 10.0.0.0/8 private
  if (a === 100 && b >= 64 && b <= 127) return true; // 100.64.0.0/10 CGNAT
  if (a === 127) return true; // 127.0.0.0/8 loopback
  if (a === 169 && b === 254) return true; // 169.254.0.0/16 link-local & cloud metadata
  if (a === 172 && b >= 16 && b <= 31) return true; // 172.16.0.0/12 private
  if (a === 192 && b === 168) return true; // 192.168.0.0/16 private
  if (a === 192 && b === 0 && octets[2] === 0) return true; // 192.0.0.0/24
  if (a >= 224) return true; // multicast / reserved

  return false;
}

function isPrivateOrReservedIpv6(host: string): boolean {
  const bare = host.replace(/^\[|\]$/g, '').toLowerCase();
  if (!bare.includes(':')) return false;

  if (bare === '::' || bare === '::1' || bare === '0:0:0:0:0:0:0:1') return true;
  if (bare.startsWith('fe80:') || bare.startsWith('fe9') || bare.startsWith('fea') || bare.startsWith('feb')) {
    return true; // link-local fe80::/10
  }
  if (bare.startsWith('fc') || bare.startsWith('fd')) {
    return true; // unique local fc00::/7
  }
  const mappedPrefixes = ['::ffff:', '0:0:0:0:0:ffff:'];
  for (const prefix of mappedPrefixes) {
    if (bare.startsWith(prefix)) {
      const mapped = bare.slice(prefix.length);
      if (isPrivateOrReservedIpv4(mapped)) return true;
      const hexPair = mapped.match(/^([0-9a-f]{1,4}):([0-9a-f]{1,4})$/);
      if (hexPair) {
        const hi = parseInt(hexPair[1], 16);
        const lo = parseInt(hexPair[2], 16);
        const dotted = `${(hi >> 8) & 0xff}.${hi & 0xff}.${(lo >> 8) & 0xff}.${lo & 0xff}`;
        return isPrivateOrReservedIpv4(dotted);
      }
      return true;
    }
  }
  return false;
}

export function validatePublicHttpUrl(rawUrl: string): SafeUrlValidationResult {
  const trimmed = rawUrl.trim();
  if (!trimmed) {
    return { valid: false, reason: 'URL cannot be empty.' };
  }
  if (trimmed.length > MAX_URL_LENGTH) {
    return { valid: false, reason: `URL exceeds maximum length of ${MAX_URL_LENGTH} characters.` };
  }

  let parsed: URL;
  try {
    parsed = new URL(trimmed);
  } catch {
    return { valid: false, reason: 'URL format is invalid. Include https:// or http://.' };
  }

  if (parsed.protocol !== 'https:' && parsed.protocol !== 'http:') {
    return {
      valid: false,
      reason: `Unsupported URL scheme "${parsed.protocol}". Only public HTTP/HTTPS URLs are permitted.`,
    };
  }

  if (parsed.username || parsed.password) {
    return { valid: false, reason: 'URLs containing embedded credentials are not permitted.' };
  }

  const host = parsed.hostname.toLowerCase();
  if (!host) {
    return { valid: false, reason: 'URL must specify a public hostname.' };
  }

  if (
    host === 'localhost' ||
    host.endsWith('.localhost') ||
    host.endsWith('.local') ||
    host.endsWith('.internal') ||
    host.endsWith('.home.arpa')
  ) {
    return { valid: false, reason: `Destination "${host}" is a local or internal hostname.` };
  }

  if (isPrivateOrReservedIpv4(host) || isPrivateOrReservedIpv6(host)) {
    return {
      valid: false,
      reason: `Destination "${host}" resolves to a loopback, private, link-local, or reserved IP range.`,
    };
  }

  if (!host.includes('.') && !host.includes(':')) {
    return { valid: false, reason: 'Single-label internal hostnames are blocked.' };
  }

  return {
    valid: true,
    normalizedUrl: parsed.toString(),
    parsed,
  };
}

export function validateResolvedIpAddress(rawIp: string): {
  valid: boolean;
  normalizedIp?: string;
  reason?: string;
} {
  const withoutZone = String(rawIp ?? '')
    .trim()
    .replace(/^\[|\]$/g, '')
    .split('%')[0]
    .trim();

  if (!withoutZone) {
    return { valid: false, reason: 'Resolved IP address is empty.' };
  }

  if (isPrivateOrReservedIpv4(withoutZone) || isPrivateOrReservedIpv6(withoutZone)) {
    return {
      valid: false,
      reason: `Resolved IP "${withoutZone}" falls within a loopback, private, link-local, metadata, or reserved IP range.`,
    };
  }

  return { valid: true, normalizedIp: withoutZone };
}
