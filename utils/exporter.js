/**
 * Exporter Utility for 52WMB Data Scraper
 * Formats company data into 7-column CSV, Excel XML, and JSON with UTF-8 BOM.
 */

/**
 * Escape string field for CSV format
 * @param {string} str 
 * @returns {string}
 */
function escapeCSVField(str) {
  if (str === null || str === undefined) return '""';
  const stringified = String(str).replace(/"/g, '""');
  return `"${stringified}"`;
}

const CSV_COLUMNS = [
  'Company Name',
  'Country',
  'Transaction Count',
  'Active Value',
  'Trading Information',
  'Updated Date',
  'Profile URL'
];

/**
 * Convert companies array into CSV string with UTF-8 BOM
 * @param {Array<Object>} companiesData 
 * @returns {string}
 */
function generateCSV(companiesData) {
  const companiesList = Array.isArray(companiesData) ? companiesData : Object.values(companiesData || {});

  const rows = [CSV_COLUMNS.map(escapeCSVField).join(',')];

  for (const item of companiesList) {
    if (!item || !item.companyName) continue;
    const row = [
      escapeCSVField(item.companyName || ''),
      escapeCSVField(item.country || ''),
      escapeCSVField(item.transactions || ''),
      escapeCSVField(item.activeValue || ''),
      escapeCSVField(item.tradingInfo || ''),
      escapeCSVField(item.updatedDate || ''),
      escapeCSVField(item.profileUrl || '')
    ];
    rows.push(row.join(','));
  }

  // Prepend UTF-8 Byte Order Mark (\uFEFF)
  return '\uFEFF' + rows.join('\r\n');
}

/**
 * Generate Excel XML (SpreadsheetML) string
 * @param {Array<Object>} companiesData 
 * @returns {string}
 */
function generateExcelXML(companiesData) {
  const companiesList = Array.isArray(companiesData) ? companiesData : Object.values(companiesData || {});

  const escapeXML = (str) => {
    if (str === null || str === undefined) return '';
    return String(str)
      .replace(/&/g, '&amp;')
      .replace(/</g, '&lt;')
      .replace(/>/g, '&gt;')
      .replace(/"/g, '&quot;')
      .replace(/'/g, '&apos;');
  };

  let headerCells = CSV_COLUMNS.map(col => `<Cell><Data ss:Type="String">${escapeXML(col)}</Data></Cell>`).join('');
  let rowsXML = `<Row>${headerCells}</Row>`;

  for (const item of companiesList) {
    if (!item || !item.companyName) continue;
    rowsXML += `
    <Row>
      <Cell><Data ss:Type="String">${escapeXML(item.companyName || '')}</Data></Cell>
      <Cell><Data ss:Type="String">${escapeXML(item.country || '')}</Data></Cell>
      <Cell><Data ss:Type="String">${escapeXML(item.transactions || '')}</Data></Cell>
      <Cell><Data ss:Type="String">${escapeXML(item.activeValue || '')}</Data></Cell>
      <Cell><Data ss:Type="String">${escapeXML(item.tradingInfo || '')}</Data></Cell>
      <Cell><Data ss:Type="String">${escapeXML(item.updatedDate || '')}</Data></Cell>
      <Cell><Data ss:Type="String">${escapeXML(item.profileUrl || '')}</Data></Cell>
    </Row>`;
  }

  return `<?xml version="1.0" encoding="UTF-8"?>
<?mso-application progid="Excel.Sheet"?>
<Workbook xmlns="urn:schemas-microsoft-com:office:spreadsheet"
 xmlns:o="urn:schemas-microsoft-com:office:office"
 xmlns:x="urn:schemas-microsoft-com:office:excel"
 xmlns:ss="urn:schemas-microsoft-com:office:spreadsheet">
 <Worksheet ss:Name="52WMB Scraped Data">
  <Table>
   ${rowsXML}
  </Table>
 </Worksheet>
</Workbook>`;
}

/**
 * Trigger file download via chrome.downloads API
 */
async function downloadFile(content, mimeType, filename) {
  return new Promise((resolve, reject) => {
    try {
      const blob = new Blob([content], { type: mimeType });
      const reader = new FileReader();

      reader.onloadend = function () {
        const dataUrl = reader.result;
        chrome.downloads.download({
          url: dataUrl,
          filename: filename,
          saveAs: true
        }, (downloadId) => {
          if (chrome.runtime.lastError) {
            console.error('Download error:', chrome.runtime.lastError);
            reject(new Error(chrome.runtime.lastError.message));
          } else {
            console.log('Download started, ID:', downloadId);
            resolve(downloadId);
          }
        });
      };

      reader.readAsDataURL(blob);
    } catch (err) {
      console.error('Failed to create file download:', err);
      reject(err);
    }
  });
}

/**
 * Export companies to CSV
 */
async function exportToCSV(companiesData, filename = '52wmb-data.csv') {
  const content = generateCSV(companiesData);
  return downloadFile(content, 'text/csv;charset=utf-8;', filename);
}

/**
 * Export companies to Excel (.xlsx)
 */
async function exportToExcel(companiesData, filename = '52wmb-data.xlsx') {
  const content = generateExcelXML(companiesData);
  return downloadFile(content, 'application/vnd.ms-excel', filename);
}

/**
 * Export companies to JSON
 */
async function exportToJSON(companiesData, filename = '52wmb-data.json') {
  const companiesList = Array.isArray(companiesData) ? companiesData : Object.values(companiesData || {});
  const validList = companiesList.filter(item => item && item.companyName);
  const content = JSON.stringify(validList, null, 2);
  return downloadFile(content, 'application/json;charset=utf-8;', filename);
}

if (typeof module !== 'undefined' && module.exports) {
  module.exports = {
    exportToCSV,
    exportToExcel,
    exportToJSON
  };
}
