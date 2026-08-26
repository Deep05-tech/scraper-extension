# 52WMB Data Scraper - Chrome Extension (Manifest V3)

A Chrome Extension built for automated DOM extraction and full multi-page scraping of company listings from the [52WMB Trade Intelligence Platform](https://en.52wmb.com/).

---

## ⚡ Main Fixes & Refactor Highlights

1. **Strict DOM Container Isolation (`#company_list > li`)**:
   - Scrapes **ONLY** company cards contained inside `#company_list > li`.
   - Strictly ignores header links, footer links, navigation items, and non-company pages (eliminating bogus records like `"All"`, `"Dig Swele Christian"`, `"About us"`).
2. **Field Extraction**:
   - `Company Name`: `.company-link`
   - `Country`: Extracted from `.seach-list-p1` (e.g. `United States`)
   - `Transaction Count`: Extracted from `.seach-list-p1` (e.g. `24`)
   - `Active Value`: Extracted from card text (e.g. `Active Value 62`)
   - `Trading Information`: Extracted from `.seach-list-p3` after `"Trading:"`
   - `Updated Date`: Extracted from `.search-list-date` (e.g. `2016-06-22`)
   - `Profile URL`: `href` of `.company-link` (MUST contain `/buyer/` or `/supplier/`)
3. **Data Validation Filter**:
   - Automatically rejects any record where `Company Name` matches forbidden navigation terms (`"About us"`, `"Help"`, `"Login"`, `"All"`) or where `Profile URL` lacks `/buyer/` or `/supplier/`.
4. **DOM Content-Comparison Pagination**:
   - Records `oldHTML = companyList.innerHTML`, clicks the Next Page button, and uses a `MutationObserver` + polling to wait until `#company_list` innerHTML changes before extracting the next page.
5. **Debug Mode & Live Preview in Popup**:
   - Displays live debug stats: `Total pages scraped`, `Total companies found`, `Duplicates removed`.
   - Renders a preview panel showing the **first 5 sample records** directly in the extension popup.
6. **7-Column CSV Export**:
   - Exports UTF-8 encoded CSV (with BOM `\uFEFF`) containing:
     `Company Name`, `Country`, `Transaction Count`, `Active Value`, `Trading Information`, `Updated Date`, `Profile URL`.

---

## 📁 Extension Architecture

```
52wmb-data-scraper/
│
├── manifest.json            # Manifest V3 setup
│
├── popup/
│   ├── popup.html          # Debug metrics & first 5 records preview UI
│   ├── popup.js            # Live status polling & preview card rendering
│   └── popup.css           # Glassmorphic dark styling
│
├── background/
│   └── service-worker.js   # State manager, tab pagination loop & file downloader
│
├── content/
│   └── scraper.js          # Strict #company_list > li parser, validation & content-comparison pagination
│
├── utils/
│   ├── storage.js          # chrome.storage.local helper for validated companies & debug stats
│   └── exporter.js         # 7-column CSV, Excel XML, and JSON formatters
│
└── README.md               # Documentation & setup guide
```

---

## 🛠️ Chrome Extension Installation Guide

1. Open **Google Chrome** and navigate to `chrome://extensions/`.
2. Toggle **Developer mode** to **ON** in the top-right corner.
3. Click **Load unpacked**.
4. Select the directory:
   `/home/uday/Agents/scraping-agent/52wmb-data-scraper`
5. Pin **52WMB Data Scraper** to your Chrome extension toolbar.

---

## 🚀 How to Test & Use

1. Open [https://en.52wmb.com/](https://en.52wmb.com/) in Google Chrome and log into your account.
2. Search by **HS Code**, product keyword, or country to reach the company search result listings page (`#company_list`).
3. Click the **52WMB Data Scraper** icon in your Chrome toolbar.
4. Click **[Start Scraping]**.
5. **Testing Verification**:
   - Watch the scraper extract cards strictly inside `#company_list > li`.
   - Verify the extension automatically clicks **Next**, waits for the DOM innerHTML to update, and continues to page 2, 3, 4, 5... until the last page.
   - Inspect the popup Debug Preview panel: verify the first 5 records show real company names, countries, transaction counts, and profile URLs without any header/footer links.
6. Click **[Download CSV]**, **[Download Excel]**, or **[Download JSON]**.

---

## 📊 Exported CSV Fields (7 Columns)

1. `Company Name`
2. `Country`
3. `Transaction Count`
4. `Active Value`
5. `Trading Information`
6. `Updated Date`
7. `Profile URL`
