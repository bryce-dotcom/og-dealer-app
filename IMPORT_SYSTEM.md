# AI-Powered Data Import System

## Overview

The AI-Powered Data Import System enables dealers to import historical data (inventory, sales, customers) from CSV/Excel files with intelligent column mapping powered by Claude AI.

**Key Features:**
- ✅ AI-powered data type detection
- ✅ Intelligent column mapping with confidence scores
- ✅ Row-by-row data validation
- ✅ Progress tracking and error reporting
- ✅ Learning system (saves custom mappings for reuse)
- ✅ Batch import with duplicate handling
- ✅ Full audit trail

---

## User Experience Flow

### 1. Upload File
- Drag-and-drop or file picker
- Supports: CSV (XLSX coming soon)
- Max size: 10MB
- Shows file preview

### 2. AI Auto-Detection
- System analyzes file structure
- Detects data type: **Inventory** / **Deals** / **Customers**
- Shows confidence: "95% confident this is INVENTORY data"
- Displays sample data preview

### 3. Column Mapping Review
- Split-screen interface showing dealer columns → database fields
- AI-suggested mappings highlighted with confidence scores
- User can accept all, adjust individual mappings, or ignore columns
- Validation warnings for missing required fields

### 4. Data Validation Preview
- Table showing transformed data (first 10 rows)
- Validation summary:
  - ✓ Valid rows (green) - ready to import
  - ⚠ Warning rows (yellow) - importable but need attention
  - ✗ Error rows (red) - will be skipped
- Download error report as CSV

### 5. Import Execution
- Progress tracking with real-time updates
- Batch processing (50-100 rows per batch)
- Error handling per row (skip and log, don't fail entire import)

### 6. Results
- Success summary: "487 rows imported, 13 skipped"
- Links to view imported data
- Option to import another file

---

## Architecture

### Frontend

**Pages:**
- `DataImportPage.jsx` - Main import workflow (6 steps)

**Utilities:**
- `importHelpers.js` - CSV parsing, validation, transformations

**Route:**
- `/import` - Accessible from navigation under Admin → Import Data

### Backend Edge Functions

**1. `analyze-import-file`** - File parsing & AI detection
```
Input: { file_data: base64, file_name: string, dealer_id: number }
Output: {
  data_type: 'inventory' | 'deals' | 'customers',
  confidence: number,
  detected_columns: string[],
  sample_rows: any[],
  row_count: number
}
```

**2. `map-import-columns`** - Intelligent column mapping
```
Input: { detected_columns: string[], data_type: string, sample_data: any[], dealer_id: number }
Output: {
  mappings: ColumnMapping[],
  avg_confidence: number,
  required_fields_present: boolean,
  missing_required: string[]
}
```
- Hybrid approach: Pattern matching first, then AI enhancement
- Checks saved mappings (learning system)
- Returns confidence scores per mapping

**3. `validate-import-data`** - Row-by-row validation
```
Input: { rows: any[], mappings: ColumnMapping[], data_type: string, dealer_id: number }
Output: {
  valid_rows: any[],
  warning_rows: { row, warnings }[],
  error_rows: { row, errors }[],
  validation_summary: { total, valid, warnings, errors }
}
```
- Validates data types, required fields, duplicates
- Handles foreign keys (VIN lookups for deals)
- Normalizes data (phone numbers, dates, currencies)

**4. `execute-import`** - Batch import with progress tracking
```
Input: { valid_rows: any[], data_type: string, dealer_id: number, import_session_id: uuid }
Output: {
  success_count: number,
  error_count: number,
  errors: ImportError[]
}
```
- Batch inserts (50-100 rows per batch)
- UPSERT strategy for duplicates (inventory)
- Skip duplicates (customers by phone/email)
- Progress tracking via `import_sessions` table
- Saves mappings to learning system

---

## Database Schema

### `import_sessions`
Tracks each import attempt with progress and audit trail.

| Column | Type | Description |
|--------|------|-------------|
| `id` | uuid | Primary key |
| `dealer_id` | integer | Foreign key to dealer_settings |
| `data_type` | text | 'inventory', 'deals', or 'customers' |
| `file_name` | text | Original filename |
| `total_rows` | integer | Total rows in file |
| `processed_rows` | integer | Rows processed so far |
| `success_count` | integer | Successfully imported rows |
| `error_count` | integer | Failed rows |
| `status` | text | 'pending', 'processing', 'completed', 'failed' |
| `column_mappings` | jsonb | Mapping configuration used |
| `validation_summary` | jsonb | Validation results summary |
| `errors` | jsonb | Array of error objects |
| `started_at` | timestamptz | Import start time |
| `completed_at` | timestamptz | Import completion time |
| `created_at` | timestamptz | Session creation time |

### `dealer_import_mappings`
Learning system: saves dealer's custom column mappings for reuse.

| Column | Type | Description |
|--------|------|-------------|
| `id` | uuid | Primary key |
| `dealer_id` | integer | Foreign key to dealer_settings |
| `data_type` | text | 'inventory', 'deals', or 'customers' |
| `dealer_column_name` | text | Original column name from dealer's file |
| `db_field_name` | text | Mapped database field |
| `usage_count` | integer | Number of times used (incremented) |
| `last_used_at` | timestamptz | Last usage timestamp |

**Unique constraint:** `(dealer_id, data_type, dealer_column_name)`

### Optional: Import Tracking
Added `import_session_id` to `inventory`, `deals`, `customers` tables for audit trail and "undo import" functionality.

---

## Data Validation Rules

### Inventory
**Required:** VIN (17 chars), year, make, model
**Validated:** Miles (0-999,999), prices (>=0)
**Duplicate handling:** UPSERT by VIN

### Deals
**Required:** purchaser_name, date_of_sale, price
**Validated:** VIN lookup (must exist in inventory), email format
**Foreign keys:** `vehicle_id` (VIN → inventory.id)
**Duplicate handling:** Skip duplicates

### Customers
**Required:** name (or first_name + last_name)
**Validated:** Phone (10+ digits), email format
**Duplicate handling:** Skip by phone or email

---

## Data Transformations

| Transformation | Description | Example |
|----------------|-------------|---------|
| `parse_currency` | Remove $, commas; parse to number | "$1,234.56" → 1234.56 |
| `parse_date` | Parse multiple date formats | "01/15/2024" → "2024-01-15" |
| `normalize_phone` | Extract digits, normalize | "(801) 555-1234" → "8015551234" |
| `validate_email` | Regex validation, lowercase | "JOHN@EXAMPLE.COM" → "john@example.com" |
| `parse_number` | Remove commas, parse to number | "1,234" → 1234 |

---

## AI Strategy

### Data Type Detection

**Phase 1: Pattern Analysis** (Fast, Free)
```javascript
inventoryScore = countMatches(['vin', 'year', 'make', 'model', 'stock', 'miles']);
dealScore = countMatches(['buyer', 'purchaser', 'sale_date', 'down_payment', 'trade']);
customerScore = countMatches(['customer', 'phone', 'email', 'address']);
// Pick highest score
```

**Phase 2: AI Verification** (High Confidence)
- Only runs if pattern confidence < 80% or type is unknown
- Uses Claude Sonnet 4 for classification
- Analyzes columns + sample rows
- Returns type, confidence, and reasoning

### Column Mapping

**Phase 1: Saved Mappings** (Learning System)
- Check `dealer_import_mappings` table
- If dealer previously mapped this column, reuse (0.98 confidence)

**Phase 2: Pattern Matching**
- Normalize column names (lowercase, remove special chars)
- Direct match against 100+ known patterns
- Handle variations: "Vehicle VIN" → `inventory.vin`

**Phase 3: AI Enhancement**
- Only runs if <80% of columns are mapped
- Uses Claude Sonnet 4 for intelligent mapping
- Handles concatenation (first + last → name)
- Suggests transformations (parse_currency, parse_date)

**Confidence Scores:**
- 0.95-1.0: Green (exact match)
- 0.7-0.9: Yellow (good match)
- <0.7: Red (uncertain, user should verify)

---

## Error Handling

### Common Errors

**"File format not supported"**
- Resolution: Convert to CSV or wait for Excel support

**"Could not determine data type"**
- Resolution: Manual selection dropdown (coming soon)

**"Missing required fields"**
- Resolution: Map missing columns or add to file

**"Vehicle not found for deal"**
- Resolution: Import vehicles first, then deals

**"Duplicate VINs found"**
- Resolution: Choose "Update" or "Skip"

### Partial Import Strategy
- Don't fail entire import if some rows have errors
- Skip bad rows, log errors, continue importing
- Final report: "450/500 imported, 50 skipped"
- Download error report CSV

---

## Performance

### File Size Limits
- Small (<100 rows): Process in one batch, instant
- Medium (100-1000 rows): Batch 50, 10-30 seconds
- Large (1000-5000 rows): Batch 100, 1-3 minutes
- Very large (5000+): Batch 200, show warning

### AI Cost
- Data type detection: 1 call/file (~$0.01)
- Column mapping: 1 call/file (~$0.02)
- **Total cost per import: ~$0.03** (negligible)
- Optimization: Caching in `dealer_import_mappings`

### Database Performance
- Batch inserts (50-200 rows)
- UPSERT with `onConflict` for duplicates
- Indexes on VIN, phone, email for lookups

---

## Testing

### Test Files

**inventory.csv:**
```csv
VIN,Year,Make,Model,StockNo,Mileage,Color,PurchPrice,SalePrice
1HGCM82633A123456,2023,Honda,Accord,2024-001,15000,Blue,18500,22995
```

**deals.csv:**
```csv
BuyerName,VIN,SaleDate,SalePrice,DownPayment,Salesman
John Smith,1HGCM82633A123456,2024-01-15,22995,5000,Mike
```

**customers.csv:**
```csv
FirstName,LastName,Phone,Email,Address,City,State,ZIP
John,Smith,8015551234,john@example.com,123 Main St,Provo,UT,84601
```

### Edge Cases
- Empty file
- Only headers (no data rows)
- Misspelled columns
- Special characters
- Very large file (10,000+ rows)
- Duplicate rows in file
- Missing required fields
- Invalid VINs
- Future dates
- Negative prices

---

## Migration

To apply the database migration:

```bash
# The migration file is already created at:
# supabase/migrations/20260305000001_create_import_system.sql

# It will be automatically applied on next Supabase deployment
# Or manually apply via Supabase Dashboard → SQL Editor
```

---

## Future Enhancements

### Phase 2 Features
- ✅ Excel support (.xlsx, .xls)
- ✅ Manual data type override
- ✅ Import templates ("Save as Template" button)
- ✅ Undo import (within 30 minutes)
- ✅ Scheduled imports (FTP/SFTP)
- ✅ Custom transformations (formulas)
- ✅ Preview mode (no actual import)

### Advanced Features
- ✅ Multi-dealer imports (for franchises)
- ✅ API import endpoints
- ✅ Real-time validation during upload
- ✅ Smart duplicate merging
- ✅ Import history dashboard
- ✅ Export templates (pre-mapped CSV templates)

---

## Support

For issues or questions:
1. Check error message in import results
2. Download error report CSV for details
3. Contact support with import session ID

**Import Session ID:** Found in URL or results page
**Error Logs:** Download from validation step
**Sample Data:** First 5 rows shown in preview
