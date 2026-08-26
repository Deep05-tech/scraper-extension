/**
 * Storage Utility for 52WMB Data Scraper
 * Manages validated company listings, pagination progress, deduplication counts, and debug statistics.
 */

const STORAGE_KEYS = {
  STATUS: 'scrapingStatus',
  CURRENT_PAGE: 'currentPage',
  TOTAL_PAGES_SCRAPED: 'totalPagesScraped',
  COMPANIES: 'companies',
  DUPLICATES_REMOVED_COUNT: 'duplicatesRemovedCount',
  LAST_ERROR: 'lastError'
};

const DEFAULT_STATE = {
  status: 'idle', // 'idle' | 'running' | 'paused' | 'stopped' | 'completed' | 'error'
  currentPage: 1,
  totalPagesScraped: 0,
  companies: [],
  duplicatesRemovedCount: 0,
  lastError: null
};

/**
 * Retrieve current state from chrome.storage.local
 * @returns {Promise<Object>}
 */
async function getScrapingState() {
  return new Promise((resolve) => {
    chrome.storage.local.get([
      STORAGE_KEYS.STATUS,
      STORAGE_KEYS.CURRENT_PAGE,
      STORAGE_KEYS.TOTAL_PAGES_SCRAPED,
      STORAGE_KEYS.COMPANIES,
      STORAGE_KEYS.DUPLICATES_REMOVED_COUNT,
      STORAGE_KEYS.LAST_ERROR
    ], (result) => {
      resolve({
        status: result[STORAGE_KEYS.STATUS] || DEFAULT_STATE.status,
        currentPage: result[STORAGE_KEYS.CURRENT_PAGE] || DEFAULT_STATE.currentPage,
        totalPagesScraped: result[STORAGE_KEYS.TOTAL_PAGES_SCRAPED] || DEFAULT_STATE.totalPagesScraped,
        companies: result[STORAGE_KEYS.COMPANIES] || DEFAULT_STATE.companies,
        duplicatesRemovedCount: result[STORAGE_KEYS.DUPLICATES_REMOVED_COUNT] || DEFAULT_STATE.duplicatesRemovedCount,
        lastError: result[STORAGE_KEYS.LAST_ERROR] || DEFAULT_STATE.lastError
      });
    });
  });
}

/**
 * Save partial state object to chrome.storage.local
 * @param {Object} state 
 * @returns {Promise<void>}
 */
async function saveScrapingState(state) {
  return new Promise((resolve) => {
    const update = {};
    if (state.status !== undefined) update[STORAGE_KEYS.STATUS] = state.status;
    if (state.currentPage !== undefined) update[STORAGE_KEYS.CURRENT_PAGE] = state.currentPage;
    if (state.totalPagesScraped !== undefined) update[STORAGE_KEYS.TOTAL_PAGES_SCRAPED] = state.totalPagesScraped;
    if (state.companies !== undefined) update[STORAGE_KEYS.COMPANIES] = state.companies;
    if (state.duplicatesRemovedCount !== undefined) update[STORAGE_KEYS.DUPLICATES_REMOVED_COUNT] = state.duplicatesRemovedCount;
    if (state.lastError !== undefined) update[STORAGE_KEYS.LAST_ERROR] = state.lastError;

    chrome.storage.local.set(update, () => resolve());
  });
}

/**
 * Append a batch of validated companies while tracking deduplication count
 * @param {Array<Object>} newCompanies 
 * @param {number} pageNum 
 * @returns {Promise<{addedCount: number, totalCount: number, duplicatesCount: number}>}
 */
async function appendValidatedCompanies(newCompanies, pageNum) {
  const state = await getScrapingState();
  const existingCompanies = [...state.companies];
  const existingKeys = new Set(
    existingCompanies.map(c => (c.profileUrl || c.companyName || '').toLowerCase().trim())
  );

  let addedCount = 0;
  let duplicatesCount = state.duplicatesRemovedCount || 0;

  for (const item of newCompanies) {
    if (!item || !item.companyName) continue;

    const key = (item.profileUrl || item.companyName).toLowerCase().trim();
    if (key && existingKeys.has(key)) {
      duplicatesCount++;
    } else if (key) {
      existingKeys.add(key);
      existingCompanies.push(item);
      addedCount++;
    }
  }

  const totalPagesScraped = Math.max(state.totalPagesScraped || 0, pageNum || 1);

  await saveScrapingState({
    companies: existingCompanies,
    currentPage: pageNum || state.currentPage,
    totalPagesScraped,
    duplicatesRemovedCount: duplicatesCount
  });

  return {
    addedCount,
    totalCount: existingCompanies.length,
    duplicatesCount
  };
}

/**
 * Reset all scraping state
 * @returns {Promise<void>}
 */
async function resetScrapingState() {
  return new Promise((resolve) => {
    chrome.storage.local.set({
      [STORAGE_KEYS.STATUS]: 'idle',
      [STORAGE_KEYS.CURRENT_PAGE]: 1,
      [STORAGE_KEYS.TOTAL_PAGES_SCRAPED]: 0,
      [STORAGE_KEYS.COMPANIES]: [],
      [STORAGE_KEYS.DUPLICATES_REMOVED_COUNT]: 0,
      [STORAGE_KEYS.LAST_ERROR]: null
    }, () => resolve());
  });
}

if (typeof module !== 'undefined' && module.exports) {
  module.exports = {
    STORAGE_KEYS,
    DEFAULT_STATE,
    getScrapingState,
    saveScrapingState,
    appendValidatedCompanies,
    resetScrapingState
  };
}
