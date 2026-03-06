# Import/Export Integration

## Overview

Added in-page Import/Export buttons to all major database pages for quick, context-aware data import without leaving the current page.

---

## Component: ImportExportButton

**Location:** `src/components/ImportExportButton.jsx`

**Features:**
- ✅ Reusable component for any data type
- ✅ Modal-based workflow (doesn't leave page)
- ✅ Pre-configured for specific data type
- ✅ Simplified 4-step process (vs 6-step standalone import)
- ✅ Export current data to CSV
- ✅ Auto-refreshes page after import

**Props:**
- `dataType`: 'inventory' | 'deals' | 'customers' | 'employees'
- `onImportComplete`: Callback function (typically page refresh)

---

## Pages Integrated

### 1. Inventory Page
**Location:** `src/pages/InventoryPage.jsx`
**Button Position:** Top right, next to "Research" and "+ Add Vehicle"

```jsx
<ImportExportButton
  dataType="inventory"
  onImportComplete={() => window.location.reload()}
/>
```

### 2. Deals Page
**Location:** `src/pages/DealsPage.jsx`
**Button Position:** Top right, before "Show Archived" and "+ New Deal"

```jsx
<ImportExportButton
  dataType="deals"
  onImportComplete={() => window.location.reload()}
/>
```

### 3. Customers Page
**Location:** `src/pages/CustomersPage.jsx`
**Button Position:** Top right, next to "+ Add Customer"

```jsx
<ImportExportButton
  dataType="customers"
  onImportComplete={() => window.location.reload()}
/>
```

### 4. Team Page (Employees)
**Location:** `src/pages/TeamPage.jsx`
**Button Position:** Top right, before "Show Archived" and "+ Add" (admin only)

```jsx
<ImportExportButton
  dataType="employees"
  onImportComplete={() => window.location.reload()}
/>
```

---

## User Experience

### Import Workflow (Modal-based)

**Step 1: Upload**
- User clicks "Import" button
- Modal opens with file upload area
- Drag-and-drop or click to select CSV

**Step 2: Column Mapping**
- AI automatically maps columns (with saved mappings)
- User reviews and adjusts mappings
- Shows confidence scores
- Validates required fields

**Step 3: Validation Preview**
- Shows valid/warning/error row counts
- Displays first few errors
- User confirms import

**Step 4: Complete**
- Progress indicator during import
- Success message with count
- Page auto-refreshes to show new data

### Export Workflow (Instant)

- User clicks "Export" button
- Current data (filtered by dealer_id) downloads as CSV
- Filename format: `{dataType}-export-YYYY-MM-DD.csv`
- No modal required

---

## Technical Details

### Import Flow
1. File upload → Parse CSV locally
2. Call `map-import-columns` edge function
3. Show mapping UI (pre-filled with AI suggestions)
4. Call `validate-import-data` edge function
5. Show validation results
6. Create `import_session` record
7. Call `execute-import` edge function
8. Trigger `onImportComplete` callback

### Export Flow
1. Query current table filtered by `dealer_id`
2. Convert to CSV using `downloadCSV()` helper
3. Trigger browser download

### Data Types Supported

**Inventory:**
- Required: VIN, year, make, model
- Optional: trim, color, miles, stock_number, purchase_price, sale_price, status

**Deals:**
- Required: purchaser_name, date_of_sale, price
- Optional: vehicle_id (VIN), down_payment, trade_allowance, sales_tax, apr, term_months, salesman

**Customers:**
- Required: name (or first_name + last_name)
- Optional: phone, email, address, city, state, zip, drivers_license

**Employees:**
- Required: name
- Optional: email, phone, job_title, hourly_rate, salary, hire_date, active

---

## Benefits

### For Users
- ✅ No need to navigate to separate import page
- ✅ Context-aware (already knows what type of data)
- ✅ Faster workflow (4 steps vs 6 steps)
- ✅ Export current data for backup/sharing
- ✅ Page auto-refreshes after import

### For System
- ✅ Reuses existing import infrastructure
- ✅ Same validation and security as standalone import
- ✅ Same learning system (saved mappings)
- ✅ Full audit trail via `import_sessions`

---

## Example Use Cases

1. **Bulk Inventory Upload**
   - Dealer on Inventory page sees they need to add 50 vehicles
   - Clicks Import, uploads CSV from DMS export
   - Reviews mappings, imports
   - Page refreshes with new vehicles

2. **Historical Deals Import**
   - Dealer setting up system for first time
   - Goes to Deals page, clicks Import
   - Uploads last year's sales data
   - System validates, skips errors, imports valid deals

3. **Customer List Export**
   - Dealer needs customer email list for marketing
   - Goes to Customers page, clicks Export
   - Gets CSV with all customers instantly

4. **Employee Onboarding**
   - New dealer has 10 employees to add
   - Goes to Team page, clicks Import
   - Uploads employee roster
   - All employees imported at once

---

## Future Enhancements

- [ ] Scheduled imports (auto-import from FTP/SFTP)
- [ ] Import templates (save/reuse mapping configurations)
- [ ] Undo import (rollback within 30 minutes)
- [ ] Partial export (export filtered data only)
- [ ] Multi-format export (Excel, JSON)

---

## Related Files

**New:**
- `src/components/ImportExportButton.jsx` - Main component

**Modified:**
- `src/pages/InventoryPage.jsx` - Added import/export
- `src/pages/DealsPage.jsx` - Added import/export
- `src/pages/CustomersPage.jsx` - Added import/export
- `src/pages/TeamPage.jsx` - Added import/export

**Dependencies:**
- Existing edge functions (analyze, map, validate, execute)
- Existing tables (import_sessions, dealer_import_mappings)
- Import helpers (importHelpers.js)
