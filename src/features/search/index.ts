export { buildSearchIndex, searchEvents } from './search';
export type { SearchIndex, SearchResult } from './search';
export {
  MAX_RECENT_SEARCHES,
  RECENT_SEARCHES_KEY,
  loadRecent,
  parseRecent,
  rememberQuery,
  saveRecent,
} from './recent';
export { useRecentSearches } from './useRecentSearches';
export type { RecentSearches } from './useRecentSearches';
