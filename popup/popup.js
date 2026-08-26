/**
 * Popup Script for 52WMB Data Scraper
 * Handles UI state updates, Debug Mode statistics, preview rendering of first 5 records, and export triggers.
 */

document.addEventListener('DOMContentLoaded', () => {
  // DOM Elements
  const connectionStatusEl = document.getElementById('connection-status');
  const warningNoticeEl = document.getElementById('warning-notice');
  const mainPanelEl = document.getElementById('main-panel');
  const scrapingBadgeEl = document.getElementById('scraping-badge');

  // Task 6 Debug Metrics
  const totalPagesValEl = document.getElementById('total-pages-val');
  const companiesCountValEl = document.getElementById('companies-count-val');
  const duplicatesCountValEl = document.getElementById('duplicates-count-val');
  const progressBarContainerEl = document.getElementById('progress-bar-container');
  const exportCountTagEl = document.getElementById('export-count-tag');

  // Task 6 Debug Preview Elements
  const previewSectionEl = document.getElementById('preview-section');
  const previewCountTagEl = document.getElementById('preview-count-tag');
  const previewCardsContainerEl = document.getElementById('preview-cards-container');

  // Control Buttons
  const btnStart = document.getElementById('btn-start');
  const btnStop = document.getElementById('btn-stop');
  const btnReset = document.getElementById('btn-reset');

  // Export Buttons
  const btnExportCSV = document.getElementById('btn-export-csv');
  const btnExportExcel = document.getElementById('btn-export-excel');
  const btnExportJSON = document.getElementById('btn-export-json');

  let statusPollInterval = null;

  // 1. Initial Site Check
  checkWebsiteConnection();

  // 2. Refresh UI State
  refreshUIState();

  // 3. Interval Polling (800ms)
  statusPollInterval = setInterval(refreshUIState, 800);

  window.addEventListener('unload', () => {
    if (statusPollInterval) clearInterval(statusPollInterval);
  });

  // ==========================================
  // Event Handlers
  // ==========================================

  btnStart.addEventListener('click', () => {
    btnStart.disabled = true;
    chrome.runtime.sendMessage({ action: 'START_SCRAPING' }, (response) => {
      if (chrome.runtime.lastError) {
        alert('Could not start scraper: ' + chrome.runtime.lastError.message);
        btnStart.disabled = false;
        return;
      }
      if (response && !response.success) {
        alert(response.error || 'Failed to start scraper.');
        btnStart.disabled = false;
      } else {
        refreshUIState();
      }
    });
  });

  btnStop.addEventListener('click', () => {
    btnStop.disabled = true;
    chrome.runtime.sendMessage({ action: 'STOP_SCRAPING' }, () => refreshUIState());
  });

  btnReset.addEventListener('click', () => {
    if (confirm('Are you sure you want to clear all scraped company records?')) {
      chrome.runtime.sendMessage({ action: 'RESET_SCRAPING' }, () => refreshUIState());
    }
  });

  btnExportCSV.addEventListener('click', () => triggerExport('csv'));
  btnExportExcel.addEventListener('click', () => triggerExport('excel'));
  btnExportJSON.addEventListener('click', () => triggerExport('json'));

  // ==========================================
  // Helper Functions
  // ==========================================

  function checkWebsiteConnection() {
    chrome.tabs.query({ active: true, currentWindow: true }, (tabs) => {
      if (tabs && tabs.length > 0 && tabs[0].url) {
        const is52wmb = tabs[0].url.includes('en.52wmb.com');
        if (is52wmb) {
          connectionStatusEl.className = 'status-badge connected';
          connectionStatusEl.innerHTML = '<span class="status-dot"></span><span class="status-text">Connected</span>';
          warningNoticeEl.classList.add('hidden');
        } else {
          connectionStatusEl.className = 'status-badge disconnected';
          connectionStatusEl.innerHTML = '<span class="status-dot"></span><span class="status-text">Not Connected</span>';
          warningNoticeEl.classList.remove('hidden');
        }
      }
    });
  }

  function refreshUIState() {
    getScrapingState().then((state) => {
      const {
        status = 'idle',
        totalPagesScraped = 0,
        companies = [],
        duplicatesRemovedCount = 0
      } = state;

      const count = companies.length;

      // Debug Statistics
      totalPagesValEl.textContent = totalPagesScraped;
      companiesCountValEl.textContent = count;
      duplicatesCountValEl.textContent = duplicatesRemovedCount;
      exportCountTagEl.textContent = `${count} record${count === 1 ? '' : 's'}`;

      // Badge status
      scrapingBadgeEl.className = `badge badge-${status}`;
      scrapingBadgeEl.textContent = status === 'running' ? 'Scraping...' : status;

      // Toggle Action Buttons & Progress Bar
      if (status === 'running') {
        btnStart.classList.add('hidden');
        btnStop.classList.remove('hidden');
        btnStop.disabled = false;
        progressBarContainerEl.classList.remove('hidden');
      } else {
        btnStart.classList.remove('hidden');
        btnStart.disabled = false;
        btnStop.classList.add('hidden');
        btnStop.disabled = true;
        progressBarContainerEl.classList.add('hidden');
      }

      // Render Task 6 Debug Preview (First 5 records)
      renderDebugPreview(companies);

      // Enable Export Buttons if companies data exists
      const hasData = count > 0;
      btnExportCSV.disabled = !hasData;
      btnExportExcel.disabled = !hasData;
      btnExportJSON.disabled = !hasData;
    });
  }

  /**
   * Render preview cards for the first 5 records (Task 6 Debug Mode)
   * @param {Array<Object>} companies 
   */
  function renderDebugPreview(companies) {
    if (!companies || companies.length === 0) {
      previewSectionEl.classList.add('hidden');
      previewCardsContainerEl.innerHTML = '';
      return;
    }

    previewSectionEl.classList.remove('hidden');
    const first5 = companies.slice(0, 5);
    previewCountTagEl.textContent = `${first5.length} / ${companies.length}`;

    let html = '';
    first5.forEach((item, index) => {
      html += `
        <div class="preview-card-item">
          <div class="preview-company-name">${index + 1}. Company: ${escapeHTML(item.companyName || 'N/A')}</div>
          <div class="preview-details-row">
            <span>Country: ${escapeHTML(item.country || 'N/A')}</span>
            <span>Transactions: ${escapeHTML(item.transactions || 'N/A')}</span>
          </div>
          <div class="preview-url-link">URL: ${escapeHTML(item.profileUrl || 'N/A')}</div>
        </div>`;
    });

    previewCardsContainerEl.innerHTML = html;
  }

  function escapeHTML(str) {
    if (!str) return '';
    return String(str)
      .replace(/&/g, '&amp;')
      .replace(/</g, '&lt;')
      .replace(/>/g, '&gt;')
      .replace(/"/g, '&quot;');
  }

  function triggerExport(format) {
    chrome.runtime.sendMessage({
      action: 'EXPORT_DATA',
      payload: { format }
    }, (response) => {
      if (chrome.runtime.lastError) {
        alert('Export failed: ' + chrome.runtime.lastError.message);
      } else if (response && !response.success) {
        alert('Export failed: ' + (response.error || 'Unknown error'));
      }
    });
  }
});
