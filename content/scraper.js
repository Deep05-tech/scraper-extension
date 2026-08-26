/**
 * Content Script for 52WMB Data Scraper
 * Enforces strict DOM container scoping (#company_list > li), record validation, and content-comparison pagination.
 */

// ==========================================
// 1. Selector Configuration Section
// ==========================================
const SELECTORS = {
  // Primary container: strictly #company_list > li
  companyCard: [
    '#company_list > li',
    'ul.company_list > li',
    '.company_list > li',
    '#company_list li'
  ].join(', '),

  // Company Link / Name
  companyName: '.company-link',

  // Country & Transaction Count container
  countryAndTransactions: '.seach-list-p1, .search-list-p1',

  // Trading Information container
  tradingInfo: '.seach-list-p3, .search-list-p3',

  // Updated Date container
  updatedDate: '.search-list-date',

  // Active Value container / text
  activeValue: '.active-val, .active-value, span[class*="active"]',

  // Next Page pagination button
  nextPage: [
    '.pagination .next',
    '.page-next',
    '.el-pagination .btn-next',
    'a.next',
    'li.next a',
    '.btn-next',
    'a[rel="next"]'
  ].join(', '),

  companyListContainer: '#company_list, ul.company_list, .company_list'
};

let isScrapingActive = false;

// ==========================================
// 2. Helper & Validation Functions
// ==========================================

function cleanText(text) {
  if (!text) return '';
  return text.replace(/[\r\n\t]+/g, ' ').replace(/\s+/g, ' ').trim();
}

function getAbsoluteUrl(anchorEl) {
  if (!anchorEl) return '';
  const href = anchorEl.getAttribute('href') || anchorEl.href || '';
  if (!href || href.startsWith('javascript:')) return '';
  try {
    return new URL(href, window.location.origin).href;
  } catch (e) {
    return href;
  }
}

/**
 * Task 3: Record Validation Pipeline
 * Rejects header/footer links, non-company pages, and invalid records
 * @param {string} companyName 
 * @param {string} profileUrl 
 * @returns {boolean}
 */
function isValidCompanyRecord(companyName, profileUrl) {
  if (!companyName || !profileUrl) return false;

  const lowerName = companyName.toLowerCase().trim();
  const lowerUrl = profileUrl.toLowerCase().trim();

  // Rejected company names (header/footer/nav links)
  const forbiddenNames = [
    'about us',
    'help',
    'login',
    'all',
    'contact us',
    'terms of use',
    'privacy policy',
    'news',
    'dig swele christian',
    'home',
    'register',
    'sign in',
    'sign up'
  ];

  for (const forbidden of forbiddenNames) {
    if (lowerName === forbidden || lowerName.startsWith(forbidden + ' ')) {
      console.warn(`Validation rejected record with invalid name: "${companyName}"`);
      return false;
    }
  }

  // Profile URL MUST contain /buyer/ or /supplier/
  const isProfileUrl = lowerUrl.includes('/buyer/') || lowerUrl.includes('/supplier/') || lowerUrl.includes('/company/');
  if (!isProfileUrl) {
    console.warn(`Validation rejected URL lacking /buyer/ or /supplier/: "${profileUrl}"`);
    return false;
  }

  // Reject forbidden URL paths
  const forbiddenPaths = ['/help/', '/about/', '/login/', '/news/', '/terms/'];
  for (const path of forbiddenPaths) {
    if (lowerUrl.includes(path)) {
      return false;
    }
  }

  return true;
}

/**
 * Parse Country & Transaction Count from .seach-list-p1
 * @param {string} rawP1Text 
 * @returns {{country: string, transactions: string}}
 */
function parseCountryAndTransactions(rawP1Text) {
  if (!rawP1Text) return { country: 'N/A', transactions: 'N/A' };

  const cleaned = cleanText(rawP1Text);
  let country = 'N/A';
  let transactions = 'N/A';

  // Extract transaction count digits e.g. "24 Transactions" -> "24"
  const transMatch = cleaned.match(/(\d[\d,]*)\s*(?:Transactions|bills|shipments|trades)/i) ||
                     cleaned.match(/(?:Transactions|bills|shipments|trades):\s*(\d[\d,]*)/i) ||
                     cleaned.match(/(\d[\d,]*)/);

  if (transMatch) {
    transactions = transMatch[1] || transMatch[0];
  }

  // Country part is text before pipe | or transaction count
  const pipeSplit = cleaned.split('|');
  if (pipeSplit.length > 1) {
    country = cleanText(pipeSplit[0]);
  } else {
    let countryPart = cleaned.replace(transMatch ? transMatch[0] : '', '').replace(/[\/\|•\-:]+/g, ' ').trim();
    if (countryPart) country = countryPart;
  }

  return { country, transactions };
}

/**
 * Parse Active Value from card
 * @param {Element} card 
 * @returns {string}
 */
function parseActiveValue(card) {
  const cardText = card.innerText || '';

  // Scan for "Active Value 62" or "Active Value: 62"
  const match = cardText.match(/Active\s*Value\s*:?\s*(\d+)/i) || cardText.match(/Active\s*:?\s*(\d+)/i);
  if (match) {
    return `Active Value ${match[1]}`;
  }

  const activeEl = card.querySelector(SELECTORS.activeValue);
  if (activeEl) {
    return cleanText(activeEl.innerText);
  }

  return 'N/A';
}

/**
 * Parse Trading Info after "Trading:" from .seach-list-p3
 * @param {Element} card 
 * @returns {string}
 */
function parseTradingInfo(card) {
  const p3El = card.querySelector(SELECTORS.tradingInfo);
  if (!p3El) return 'N/A';

  let txt = cleanText(p3El.innerText || p3El.textContent);

  // Strip "Trading:" prefix if present
  if (txt.toLowerCase().startsWith('trading:')) {
    txt = txt.substring(8).trim();
  }

  return txt || 'N/A';
}

/**
 * Parse Updated Date from .search-list-date
 * @param {Element} card 
 * @returns {string}
 */
function parseUpdatedDate(card) {
  const dateEl = card.querySelector(SELECTORS.updatedDate);
  if (!dateEl) return 'N/A';

  let txt = cleanText(dateEl.innerText || dateEl.textContent);
  
  // Extract date string e.g. "2016-06-22" from "Data updated to 2016-06-22"
  const match = txt.match(/\d{4}-\d{2}-\d{2}/);
  if (match) {
    return match[0];
  }

  return txt || 'N/A';
}

// ==========================================
// 3. Task 1 & 2: Strict DOM Extraction Logic
// ==========================================

/**
 * Scrape company listings strictly inside #company_list > li
 * @returns {Array<Object>}
 */
function extractCompanyCards() {
  const companies = [];
  const listContainer = document.querySelector(SELECTORS.companyListContainer);

  if (!listContainer) {
    console.error('52WMB Scraper: #company_list container not found on current DOM page!');
    return companies;
  }

  // Scrape ONLY elements inside #company_list > li
  const cardElements = Array.from(listContainer.querySelectorAll(':scope > li, li'));
  console.log(`52WMB Scraper: Found ${cardElements.length} cards inside #company_list.`);

  cardElements.forEach((card, index) => {
    try {
      // 1. Company Name & Profile URL from .company-link
      const linkEl = card.querySelector(SELECTORS.companyName) || card.querySelector('a[href*="/buyer/"], a[href*="/supplier/"]');
      const companyName = linkEl ? cleanText(linkEl.innerText || linkEl.textContent || linkEl.getAttribute('title')) : '';
      const profileUrl = getAbsoluteUrl(linkEl);

      // 2. Country & Transaction Count from .seach-list-p1
      const p1El = card.querySelector(SELECTORS.countryAndTransactions);
      const rawP1Text = p1El ? p1El.innerText : '';
      const { country, transactions } = parseCountryAndTransactions(rawP1Text);

      // 3. Active Value
      const activeValue = parseActiveValue(card);

      // 4. Trading Information from .seach-list-p3
      const tradingInfo = parseTradingInfo(card);

      // 5. Data Updated Date from .search-list-date
      const updatedDate = parseUpdatedDate(card);

      // Task 3: Data Validation Filter
      if (isValidCompanyRecord(companyName, profileUrl)) {
        companies.push({
          companyName,
          country,
          transactions,
          activeValue,
          tradingInfo,
          updatedDate,
          profileUrl
        });
      } else {
        console.log(`Skipped card ${index}: Failed validation criteria (Name: "${companyName}", URL: "${profileUrl}")`);
      }
    } catch (err) {
      console.error(`Error parsing card ${index}:`, err);
    }
  });

  return companies;
}

/**
 * Detect current page number from pagination DOM
 * @returns {number}
 */
function getCurrentPageNumber() {
  const activePageEl = document.querySelector('.pagination .active, .el-pagination .number.active, .page-item.active, li.active');
  if (activePageEl) {
    const num = parseInt(cleanText(activePageEl.innerText), 10);
    if (!isNaN(num)) return num;
  }
  const urlParams = new URLSearchParams(window.location.search);
  const p = urlParams.get('page') || urlParams.get('p') || urlParams.get('pageNo');
  if (p && !isNaN(parseInt(p, 10))) return parseInt(p, 10);

  return 1;
}

/**
 * Find Next Page button element
 * @returns {{hasNextPage: boolean, nextButton: Element|null}}
 */
function findNextPageButton() {
  let nextBtn = document.querySelector(SELECTORS.nextPage);

  if (!nextBtn) {
    const allLinks = Array.from(document.querySelectorAll('a, button, li'));
    nextBtn = allLinks.find(el => {
      const txt = cleanText(el.innerText || el.textContent);
      return (txt === 'Next' || txt === '>' || txt === '»' || txt.includes('Next >')) &&
             !el.classList.contains('disabled');
    });
  }

  if (!nextBtn) return { hasNextPage: false, nextButton: null };

  const isDisabled = nextBtn.disabled ||
                     nextBtn.classList.contains('disabled') ||
                     nextBtn.getAttribute('aria-disabled') === 'true' ||
                     nextBtn.getAttribute('disabled') !== null ||
                     nextBtn.parentElement?.classList.contains('disabled');

  return {
    hasNextPage: !isDisabled,
    nextButton: isDisabled ? null : nextBtn
  };
}

// ==========================================
// 4. Task 4: Content-Comparison Pagination
// ==========================================

/**
 * Click Next Page button and wait until #company_list innerHTML changes from oldContent
 * @returns {Promise<boolean>}
 */
function navigateNextPageWithContentCheck() {
  return new Promise((resolve) => {
    const { hasNextPage, nextButton } = findNextPageButton();

    if (!hasNextPage || !nextButton) {
      console.log('52WMB Scraper: Next button is unavailable or disabled.');
      resolve(false);
      return;
    }

    const companyListContainer = document.querySelector(SELECTORS.companyListContainer);
    if (!companyListContainer) {
      console.error('52WMB Scraper: Cannot navigate next - #company_list container not found.');
      resolve(false);
      return;
    }

    // Capture old innerHTML content before clicking
    const oldContent = companyListContainer.innerHTML;
    console.log('52WMB Scraper: Captured old #company_list innerHTML length:', oldContent.length);

    let observer = null;
    let pollInterval = null;
    let timeoutTimer = null;

    const cleanup = () => {
      if (observer) observer.disconnect();
      if (pollInterval) clearInterval(pollInterval);
      if (timeoutTimer) clearTimeout(timeoutTimer);
    };

    const onContentChanged = () => {
      cleanup();
      console.log('52WMB Scraper: Confirmed #company_list content changed! New page loaded.');
      // Brief pause to allow rendering to complete
      setTimeout(() => resolve(true), 800);
    };

    // Timeout safety net (10 seconds)
    timeoutTimer = setTimeout(() => {
      cleanup();
      const newContent = companyListContainer.innerHTML;
      if (newContent !== oldContent) {
        console.log('52WMB Scraper: DOM content changed after timeout.');
        resolve(true);
      } else {
        console.warn('52WMB Scraper: Pagination timed out waiting for DOM change.');
        resolve(false);
      }
    }, 10000);

    // 1. Setup MutationObserver on #company_list
    observer = new MutationObserver(() => {
      const currentContent = companyListContainer.innerHTML;
      if (currentContent !== oldContent) {
        onContentChanged();
      }
    });
    observer.observe(companyListContainer, { childList: true, subtree: true, characterData: true });

    // 2. Setup interval poll check every 500ms
    pollInterval = setInterval(() => {
      const currentContent = companyListContainer.innerHTML;
      if (currentContent !== oldContent) {
        onContentChanged();
      }
    }, 500);

    // 3. Scroll into view & click Next button
    nextButton.scrollIntoView({ behavior: 'smooth', block: 'center' });
    setTimeout(() => {
      if (typeof nextButton.click === 'function') {
        nextButton.click();
      } else {
        const clickEvent = new MouseEvent('click', { bubbles: true, cancelable: true, view: window });
        nextButton.dispatchEvent(clickEvent);
      }
    }, 300);
  });
}

// ==========================================
// 5. Message Orchestration
// ==========================================

chrome.runtime.onMessage.addListener((message, sender, sendResponse) => {
  const { action } = message;

  if (action === 'SCRAPE_PAGE') {
    isScrapingActive = true;
    console.log('52WMB Scraper: Executing SCRAPE_PAGE command.');

    try {
      const companies = extractCompanyCards();
      const currentPageNum = getCurrentPageNumber();
      const { hasNextPage } = findNextPageButton();

      console.log(`Scraped page ${currentPageNum}: extracted ${companies.length} valid companies. Has next: ${hasNextPage}`);

      // Transmit page results to background service worker
      chrome.runtime.sendMessage({
        action: 'PAGE_SCRAPED',
        payload: {
          companies,
          pageNum: currentPageNum,
          hasNextPage
        }
      });

      sendResponse({ success: true, count: companies.length, page: currentPageNum, hasNextPage });
    } catch (err) {
      console.error('Error during card extraction:', err);
      chrome.runtime.sendMessage({
        action: 'SCRAPER_ERROR',
        payload: { error: err.message }
      });
      sendResponse({ success: false, error: err.message });
    }
    return true;
  }

  if (action === 'GO_NEXT_PAGE') {
    if (!isScrapingActive) {
      sendResponse({ success: false, reason: 'Scraping is stopped.' });
      return false;
    }

    navigateNextPageWithContentCheck().then((navigated) => {
      sendResponse({ success: navigated });
    });
    return true;
  }

  if (action === 'STOP_SCRAPING') {
    isScrapingActive = false;
    console.log('52WMB Scraper: Scraping stopped.');
    sendResponse({ success: true });
    return false;
  }
});
