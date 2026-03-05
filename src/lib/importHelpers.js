// ============================================
// CSV/Excel Import Helpers
// ============================================
// Utilities for parsing, validating, and transforming import files

/**
 * Parse CSV file to JSON
 * @param {File} file - The CSV file
 * @returns {Promise<{columns: string[], rows: object[]}>}
 */
export async function parseCSV(file) {
  return new Promise((resolve, reject) => {
    const reader = new FileReader();

    reader.onload = (e) => {
      try {
        const text = e.target.result;
        const lines = text.trim().split('\n');

        if (lines.length < 2) {
          reject(new Error('CSV file must have at least a header row and one data row'));
          return;
        }

        // Parse header
        const header = parseCSVLine(lines[0]);

        // Parse rows
        const rows = [];
        for (let i = 1; i < lines.length; i++) {
          if (!lines[i].trim()) continue; // Skip empty lines

          const values = parseCSVLine(lines[i]);
          const rowObj = {};

          header.forEach((col, idx) => {
            rowObj[col] = values[idx] || '';
          });

          rows.push(rowObj);
        }

        resolve({ columns: header, rows });
      } catch (error) {
        reject(error);
      }
    };

    reader.onerror = () => reject(new Error('Failed to read file'));
    reader.readAsText(file);
  });
}

/**
 * Parse a single CSV line (handles quoted fields)
 * @param {string} line
 * @returns {string[]}
 */
function parseCSVLine(line) {
  const result = [];
  let current = '';
  let inQuotes = false;

  for (let i = 0; i < line.length; i++) {
    const char = line[i];

    if (char === '"') {
      inQuotes = !inQuotes;
    } else if (char === ',' && !inQuotes) {
      result.push(current.trim());
      current = '';
    } else {
      current += char;
    }
  }

  result.push(current.trim());
  return result;
}

/**
 * Convert file to base64
 * @param {File} file
 * @returns {Promise<string>}
 */
export async function fileToBase64(file) {
  return new Promise((resolve, reject) => {
    const reader = new FileReader();
    reader.onload = (e) => {
      const base64 = e.target.result.split(',')[1];
      resolve(base64);
    };
    reader.onerror = () => reject(new Error('Failed to read file'));
    reader.readAsDataURL(file);
  });
}

/**
 * Download data as CSV
 * @param {object[]} rows - Array of row objects
 * @param {string} filename - File name
 */
export function downloadCSV(rows, filename) {
  if (!rows || rows.length === 0) return;

  // Get headers from first row
  const headers = Object.keys(rows[0]);

  // Create CSV content
  const csvLines = [
    headers.join(','), // Header row
    ...rows.map(row =>
      headers.map(header => {
        const value = row[header] || '';
        // Quote fields that contain commas
        return String(value).includes(',') ? `"${value}"` : value;
      }).join(',')
    )
  ];

  const csvContent = csvLines.join('\n');

  // Create download
  const blob = new Blob([csvContent], { type: 'text/csv;charset=utf-8;' });
  const link = document.createElement('a');
  link.href = URL.createObjectURL(blob);
  link.download = filename;
  link.click();
  URL.revokeObjectURL(link.href);
}

/**
 * Format validation errors for display
 * @param {object[]} errorRows - Array of error row objects
 * @returns {string}
 */
export function formatValidationErrors(errorRows) {
  if (!errorRows || errorRows.length === 0) return '';

  return errorRows.map(err => {
    const errors = Array.isArray(err.errors) ? err.errors.join(', ') : err.errors;
    return `Row ${err.row}: ${errors}`;
  }).join('\n');
}

/**
 * Get data type display name
 * @param {string} dataType
 * @returns {string}
 */
export function getDataTypeLabel(dataType) {
  const labels = {
    inventory: 'Inventory',
    deals: 'Deals/Sales',
    customers: 'Customers'
  };
  return labels[dataType] || dataType;
}

/**
 * Get data type icon
 * @param {string} dataType
 * @returns {string}
 */
export function getDataTypeIcon(dataType) {
  const icons = {
    inventory: '🚗',
    deals: '💰',
    customers: '👤'
  };
  return icons[dataType] || '📄';
}

/**
 * Validate file size and type
 * @param {File} file
 * @param {number} maxSizeMB - Max file size in MB
 * @returns {{valid: boolean, error: string}}
 */
export function validateFile(file, maxSizeMB = 10) {
  if (!file) {
    return { valid: false, error: 'No file selected' };
  }

  const validExtensions = ['.csv', '.xlsx', '.xls'];
  const fileExt = file.name.toLowerCase().slice(file.name.lastIndexOf('.'));

  if (!validExtensions.includes(fileExt)) {
    return { valid: false, error: `Invalid file type. Please upload ${validExtensions.join(', ')}` };
  }

  const maxSizeBytes = maxSizeMB * 1024 * 1024;
  if (file.size > maxSizeBytes) {
    return { valid: false, error: `File too large. Maximum size is ${maxSizeMB}MB` };
  }

  return { valid: true };
}

/**
 * Get confidence badge color
 * @param {number} confidence - Confidence score (0-1)
 * @returns {string} - Tailwind color class
 */
export function getConfidenceBadgeColor(confidence) {
  if (confidence >= 0.9) return 'bg-green-100 text-green-800';
  if (confidence >= 0.7) return 'bg-yellow-100 text-yellow-800';
  return 'bg-red-100 text-red-800';
}

/**
 * Format confidence percentage
 * @param {number} confidence - Confidence score (0-1)
 * @returns {string}
 */
export function formatConfidence(confidence) {
  return `${Math.round(confidence * 100)}%`;
}
