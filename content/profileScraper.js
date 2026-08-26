/**
 * Profile Scraper Content Script for 52WMB Data Scraper
 * Executes on company profile pages (https://en.52wmb.com/supplier/*, /buyer/*, etc.)
 * Extracts detailed fields and transmits back to background service worker.
 */

(function () {
  // Prevent duplicate execution
  if (window.__52wmbProfileScraperInjected) return;
  window.__52wmbProfileScraperInjected = true;

  console.log('52WMB Profile Scraper content script initialized.');

  /**
   * Helper function to clean text content
   * @param {string} text 
   * @returns {string}
   */
  function cleanText(text) {
    if (!text) return '';
    return text.replace(/[\r\n\t]+/g, ' ').replace(/\s+/g, ' ').trim();
  }

  /**
   * Search DOM for key-value pair based on matching label text
   * @param {Array<string>|string} labelQueries 
   * @returns {string}
   */
  function getValueByLabel(labelQueries) {
    const queries = Array.isArray(labelQueries) ? labelQueries : [labelQueries];

    // 1. Check table rows (tr containing label in th/td)
    const tableRows = document.querySelectorAll('tr');
    for (const tr of tableRows) {
      const rowText = tr.innerText || '';
      for (const q of queries) {
        if (rowText.toLowerCase().includes(q.toLowerCase())) {
          const cells = tr.querySelectorAll('td, th');
          if (cells.length >= 2) {
            return cleanText(cells[cells.length - 1].innerText);
          }
        }
      }
    }

    // 2. Check definition lists (dt / dd) or item pairs
    const itemPairs = document.querySelectorAll('.info-item, .detail-item, .profile-info-item, div[class*="info"], div[class*="item"]');
    for (const item of itemPairs) {
      const text = item.innerText || '';
      for (const q of queries) {
        if (text.toLowerCase().includes(q.toLowerCase())) {
          // Remove label from text
          const parts = text.split(new RegExp(q, 'i'));
          if (parts.length > 1) {
            return cleanText(parts.slice(1).join(' ').replace(/^[:\s-]+/, ''));
          }
        }
      }
    }

    return '';
  }

  /**
   * Extract complete profile data from current page DOM
   * @returns {Object}
   */
  function extractProfileData() {
    // 1. Company Name
    const nameEl = document.querySelector('.company-name, h1.title, h1, .supplier-name, .buyer-name, .profile-title');
    const companyName = nameEl ? cleanText(nameEl.innerText || nameEl.textContent) : '';

    // 2. Country / Area
    const country = getValueByLabel(['Country', 'Area', 'Location', 'Region', 'Nation']) ||
                    cleanText(document.querySelector('.country-name, .flag-icon + span, .nation-txt')?.innerText);

    // 3. Address
    const address = getValueByLabel(['Address', 'Full Address', 'Company Address', 'Street Address', 'Location Address']);

    // 4. Website
    let website = getValueByLabel(['Website', 'Official Site', 'Domain', 'Web']);
    if (!website) {
      const webLink = document.querySelector('a[href^="http"]:not([href*="52wmb.com"]):not([href*="google.com"])');
      if (webLink) website = webLink.href;
    }

    // 5. Contact Details (Email, Phone, Contact Person)
    const phone = getValueByLabel(['Phone', 'Tel', 'Telephone', 'Mobile']);
    const email = getValueByLabel(['Email', 'E-mail', 'Mail']) ||
                  cleanText(document.querySelector('a[href^="mailto:"]')?.getAttribute('href')?.replace('mailto:', ''));
    const contactPerson = getValueByLabel(['Contact Person', 'Contact', 'Manager', 'Representative']);

    const contactParts = [];
    if (contactPerson) contactParts.push(`Person: ${contactPerson}`);
    if (phone) contactParts.push(`Tel: ${phone}`);
    if (email) contactParts.push(`Email: ${email}`);

    const contactDetails = contactParts.join(' | ');

    // 6. Company Type
    const companyType = getValueByLabel(['Company Type', 'Business Type', 'Enterprise Type', 'Category']);

    // 7. Products
    const products = getValueByLabel(['Main Products', 'Products', 'Product Range', 'Main Goods', 'Commodities']);

    // 8. Import Details
    const importDetails = getValueByLabel(['Import Details', 'Main Imports', 'Import Products', 'Import Volume', 'Import Countries']);

    // 9. Export Details
    const exportDetails = getValueByLabel(['Export Details', 'Main Exports', 'Export Products', 'Export Volume', 'Export Countries']);

    // 10. Other Information / Description
    const otherInfo = getValueByLabel(['Description', 'Company Overview', 'Business Scope', 'Profile Description', 'Summary']);

    return {
      companyName,
      country,
      address,
      website,
      contactDetails,
      companyType,
      products,
      importDetails,
      exportDetails,
      otherInfo,
      profileUrl: window.location.href
    };
  }

  // Automatic trigger on load
  function initProfileExtraction() {
    // Only parse if on a 52wmb profile page or background scraping tab
    const url = window.location.href;
    if (url.includes('/supplier/') || url.includes('/buyer/') || url.includes('/company/') || url.includes('/detail/')) {
      console.log('52WMB Profile Scraper: Extracting profile data for', url);
      const profileData = extractProfileData();

      // Transmit parsed profile data back to service worker
      chrome.runtime.sendMessage({
        action: 'PROFILE_SCRAPED',
        payload: profileData
      }, (response) => {
        if (chrome.runtime.lastError) {
          console.warn('Profile scraper send error:', chrome.runtime.lastError.message);
        } else {
          console.log('Profile data sent successfully.');
        }
      });
    }
  }

  // Execute extraction when DOM is ready
  if (document.readyState === 'complete' || document.readyState === 'interactive') {
    setTimeout(initProfileExtraction, 1000);
  } else {
    document.addEventListener('DOMContentLoaded', () => setTimeout(initProfileExtraction, 1000));
  }

  // Listen to manual request from background
  chrome.runtime.onMessage.addListener((message, sender, sendResponse) => {
    if (message.action === 'SCRAPE_PROFILE') {
      const data = extractProfileData();
      sendResponse({ success: true, payload: data });
      return true;
    }
  });
})();
