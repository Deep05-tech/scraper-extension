/**
 * Background Service Worker for 52WMB Data Scraper
 * Orchestrates multi-page scraping loop, state management, and file exports.
 */

importScripts('../utils/storage.js', '../utils/exporter.js');

let activeTabId = null;

// Extension installation
chrome.runtime.onInstalled.addListener(() => {
  console.log('52WMB Data Scraper service worker initialized.');
  resetScrapingState();
});

/**
 * Handle incoming messages from popup and content scripts
 */
chrome.runtime.onMessage.addListener((message, sender, sendResponse) => {
  const { action, payload } = message;

  switch (action) {
    case 'START_SCRAPING':
      if (payload && payload.mode === 'resume') {
        handleResumeScraping(sendResponse);
      } else {
        handleStartScraping(sendResponse);
      }
      return true;

    case 'RESUME_SCRAPING':
      handleResumeScraping(sendResponse);
      return true;

    case 'STOP_SCRAPING':
      handleStopScraping(sendResponse);
      return true;

    case 'RESET_SCRAPING':
      resetScrapingState().then(() => sendResponse({ success: true }));
      return true;

    case 'GET_STATUS':
      getScrapingState().then((state) => sendResponse({ success: true, state }));
      return true;

    case 'PAGE_SCRAPED':
      handlePageScraped(payload, sender.tab ? sender.tab.id : null);
      sendResponse({ success: true });
      return true;

    case 'EXPORT_DATA':
      handleExportData(payload ? payload.format : 'csv', sendResponse);
      return true;

    case 'SCRAPER_ERROR':
      handleScraperError(payload ? payload.error : 'Unknown error');
      sendResponse({ success: true });
      return true;

    default:
      sendResponse({ success: false, error: 'Unknown action' });
      return false;
  }
});

/**
 * Start fresh multi-page scraping workflow
 */
async function handleStartScraping(sendResponse) {
  try {
    const tabs = await chrome.tabs.query({ active: true, currentWindow: true });
    if (!tabs || tabs.length === 0) {
      sendResponse({ success: false, error: 'No active tab found.' });
      return;
    }

    const currentTab = tabs[0];
    if (!currentTab.url || !currentTab.url.includes('en.52wmb.com')) {
      sendResponse({
        success: false,
        error: 'Please navigate to a 52wmb search result page (https://en.52wmb.com/*) first.'
      });
      return;
    }

    activeTabId = currentTab.id;

    // Reset storage & initialize running state
    await resetScrapingState();
    await saveScrapingState({ status: 'running', currentPage: 1, lastError: null });

    triggerTabScrape(currentTab.id);
    sendResponse({ success: true, message: 'Scraping started.' });
  } catch (err) {
    console.error('Error starting scraper:', err);
    await saveScrapingState({ status: 'error', lastError: err.message });
    sendResponse({ success: false, error: err.message });
  }
}

/**
 * Resume scraping workflow from where left off without clearing existing data
 */
async function handleResumeScraping(sendResponse) {
  try {
    const tabs = await chrome.tabs.query({ active: true, currentWindow: true });
    if (!tabs || tabs.length === 0) {
      sendResponse({ success: false, error: 'No active tab found.' });
      return;
    }

    const currentTab = tabs[0];
    if (!currentTab.url || !currentTab.url.includes('en.52wmb.com')) {
      sendResponse({
        success: false,
        error: 'Please navigate to a 52wmb search result page (https://en.52wmb.com/*) first.'
      });
      return;
    }

    activeTabId = currentTab.id;

    // Keep existing companies & stats, resume running state
    await saveScrapingState({ status: 'running', lastError: null });

    triggerTabScrape(currentTab.id);
    sendResponse({ success: true, message: 'Scraping resumed.' });
  } catch (err) {
    console.error('Error resuming scraper:', err);
    await saveScrapingState({ status: 'error', lastError: err.message });
    sendResponse({ success: false, error: err.message });
  }
}

/**
 * Send command to content script to execute page scrape
 */
function triggerTabScrape(tabId) {
  if (!tabId) return;
  chrome.tabs.sendMessage(tabId, { action: 'SCRAPE_PAGE' }, (response) => {
    if (chrome.runtime.lastError) {
      console.warn('Injecting scraper script into tab:', chrome.runtime.lastError.message);
      chrome.scripting.executeScript({
        target: { tabId: tabId },
        files: ['utils/storage.js', 'content/scraper.js']
      }).then(() => {
        setTimeout(() => {
          chrome.tabs.sendMessage(tabId, { action: 'SCRAPE_PAGE' });
        }, 500);
      }).catch(err => console.error('Script injection failed:', err));
    }
  });
}

/**
 * Handle page results returned from content script
 */
async function handlePageScraped(payload, senderTabId) {
  const state = await getScrapingState();

  if (state.status !== 'running') {
    console.log('Received page scraped payload but status is:', state.status);
    return;
  }

  const { companies = [], pageNum = 1, hasNextPage = false } = payload;

  const { addedCount, totalCount, duplicatesCount } = await appendValidatedCompanies(companies, pageNum);
  console.log(`Page ${pageNum} scraped. Added ${addedCount} valid companies. Total: ${totalCount}, Duplicates: ${duplicatesCount}`);

  const targetTabId = senderTabId || activeTabId;

  if (hasNextPage && state.status === 'running') {
    console.log('Requesting content script to navigate to next page...');
    
    // Command content script to click Next Page and wait for DOM change
    chrome.tabs.sendMessage(targetTabId, { action: 'GO_NEXT_PAGE' }, (response) => {
      if (chrome.runtime.lastError) {
        console.warn('GO_NEXT_PAGE message failed:', chrome.runtime.lastError.message);
        saveScrapingState({ status: 'stopped', lastError: 'Navigation interrupted: ' + chrome.runtime.lastError.message });
      } else if (response && response.success) {
        console.log('Next page navigation confirmed. Triggering scrape on new page...');
        setTimeout(() => {
          triggerTabScrape(targetTabId);
        }, 600);
      } else if (response && response.timedOut) {
        console.warn('Next page load timed out. Setting state to stopped so user can resume once page loads.');
        saveScrapingState({
          status: 'stopped',
          lastError: 'Page load timed out. You can click Resume once the page finishes loading.'
        });
      } else {
        console.log('No further next pages available or navigation finished. Completing scraper.');
        saveScrapingState({ status: 'completed' });
      }
    });
  } else {
    console.log('Scraping finished. Total companies scraped:', totalCount);
    await saveScrapingState({ status: 'completed' });
  }
}

/**
 * Stop scraping workflow
 */
async function handleStopScraping(sendResponse) {
  await saveScrapingState({ status: 'stopped' });
  if (activeTabId) {
    chrome.tabs.sendMessage(activeTabId, { action: 'STOP_SCRAPING' }, () => {
      if (chrome.runtime.lastError) { /* ignore */ }
    });
  }
  sendResponse({ success: true, message: 'Scraping stopped by user.' });
}

/**
 * Scraper Error handler
 */
async function handleScraperError(errorMessage) {
  console.error('Service worker received scraper error:', errorMessage);
  await saveScrapingState({ status: 'error', lastError: errorMessage });
}

/**
 * Handle export requests
 */
async function handleExportData(format, sendResponse) {
  try {
    const state = await getScrapingState();
    const companies = state.companies || [];

    if (companies.length === 0) {
      sendResponse({ success: false, error: 'No scraped company data available to export.' });
      return;
    }

    const timestamp = new Date().toISOString().slice(0, 10);

    if (format === 'csv') {
      await exportToCSV(companies, `52wmb-data-${timestamp}.csv`);
    } else if (format === 'excel') {
      await exportToExcel(companies, `52wmb-data-${timestamp}.xlsx`);
    } else if (format === 'json') {
      await exportToJSON(companies, `52wmb-data-${timestamp}.json`);
    } else {
      throw new Error(`Unsupported export format: ${format}`);
    }

    sendResponse({ success: true, count: companies.length });
  } catch (err) {
    console.error('Export error:', err);
    sendResponse({ success: false, error: err.message });
  }
}
