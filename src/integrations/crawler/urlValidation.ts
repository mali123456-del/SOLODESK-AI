import { validatePublicHttpUrl } from '../../security/urlPolicy';

export { validatePublicHttpUrl };

let activeFetchCount = 0;
const MAX_CONCURRENT_IMPORTS = 1;

export function acquireCrawlerSlot(): () => void {
  if (activeFetchCount >= MAX_CONCURRENT_IMPORTS) {
    throw new Error('Another URL import is already in progress. Wait for it to finish before starting a new request.');
  }
  activeFetchCount += 1;
  let released = false;
  return () => {
    if (!released) {
      released = true;
      activeFetchCount = Math.max(0, activeFetchCount - 1);
    }
  };
}
