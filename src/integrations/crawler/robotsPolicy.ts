export const ROBOTS_FETCH_TIMEOUT_MS = 4_000;

export function isPathAllowedByRobotsTxt(robotsTxt: string, targetPath: string): boolean {
  const lines = robotsTxt.split(/\r?\n/);
  let inWildcardAgent = false;
  let matchedWildcardBlock = false;
  const disallows: string[] = [];
  const allows: string[] = [];

  for (const rawLine of lines) {
    const line = rawLine.split('#')[0].trim();
    if (!line) {
      if (inWildcardAgent) {
        inWildcardAgent = false;
      }
      continue;
    }
    const colonIdx = line.indexOf(':');
    if (colonIdx === -1) continue;
    const key = line.slice(0, colonIdx).trim().toLowerCase();
    const val = line.slice(colonIdx + 1).trim();

    if (key === 'user-agent') {
      const agent = val.toLowerCase();
      if (agent === '*') {
        inWildcardAgent = true;
        matchedWildcardBlock = true;
      } else {
        inWildcardAgent = false;
      }
    } else if (inWildcardAgent) {
      if (key === 'disallow' && val) {
        disallows.push(val);
      } else if (key === 'allow' && val) {
        allows.push(val);
      }
    }
  }

  if (!matchedWildcardBlock) return true;

  let bestAllowLen = -1;
  let bestDisallowLen = -1;
  for (const rule of allows) {
    if (targetPath.startsWith(rule) && rule.length > bestAllowLen) {
      bestAllowLen = rule.length;
    }
  }
  for (const rule of disallows) {
    if (rule === '/' || targetPath.startsWith(rule)) {
      if (rule.length > bestDisallowLen) {
        bestDisallowLen = rule.length;
      }
    }
  }

  if (bestDisallowLen === -1) return true;
  return bestAllowLen >= bestDisallowLen;
}

export async function checkRobotsTxt(
  parsedUrl: URL,
  fetchImpl: typeof fetch
): Promise<{ allowed: boolean; checked: boolean; note: string }> {
  const robotsUrl = `${parsedUrl.origin}/robots.txt`;
  const controller = new AbortController();
  const timer = setTimeout(() => controller.abort(), ROBOTS_FETCH_TIMEOUT_MS);
  try {
    const res = await fetchImpl(robotsUrl, {
      method: 'GET',
      credentials: 'omit',
      cache: 'no-store',
      signal: controller.signal,
    });
    if (!res.ok) {
      return {
        allowed: true,
        checked: true,
        note: `robots.txt returned HTTP ${res.status}; proceeding with single-page user-triggered fetch.`,
      };
    }
    const body = (await res.text()).slice(0, 64_000);
    const allowed = isPathAllowedByRobotsTxt(body, parsedUrl.pathname || '/');
    return {
      allowed,
      checked: true,
      note: allowed
        ? 'Allowed by target robots.txt.'
        : 'Blocked by target robots.txt Disallow rule for User-agent: *.',
    };
  } catch {
    return {
      allowed: true,
      checked: false,
      note: 'robots.txt unavailable or blocked by CORS; single user-triggered fetch only.',
    };
  } finally {
    clearTimeout(timer);
  }
}
