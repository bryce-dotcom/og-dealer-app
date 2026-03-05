import { useState, useRef } from 'react';
import { supabase } from '../lib/supabase';
import { parseCSV, fileToBase64, downloadCSV, formatValidationErrors, getDataTypeLabel, getDataTypeIcon, validateFile, getConfidenceBadgeColor, formatConfidence } from '../lib/importHelpers';

export default function DataImportPage() {
  const [step, setStep] = useState(1); // 1: Upload, 2: Detect, 3: Map, 4: Validate, 5: Import, 6: Complete
  const [file, setFile] = useState(null);
  const [loading, setLoading] = useState(false);
  const [error, setError] = useState(null);

  // File analysis results
  const [fileData, setFileData] = useState(null);
  const [detectedType, setDetectedType] = useState(null);
  const [confidence, setConfidence] = useState(0);
  const [columns, setColumns] = useState([]);
  const [sampleRows, setSampleRows] = useState([]);
  const [totalRows, setTotalRows] = useState(0);

  // Column mappings
  const [mappings, setMappings] = useState([]);
  const [requiredFieldsPresent, setRequiredFieldsPresent] = useState(false);
  const [missingRequired, setMissingRequired] = useState([]);

  // Validation results
  const [validRows, setValidRows] = useState([]);
  const [warningRows, setWarningRows] = useState([]);
  const [errorRows, setErrorRows] = useState([]);

  // Import results
  const [importSessionId, setImportSessionId] = useState(null);
  const [successCount, setSuccessCount] = useState(0);
  const [importProgress, setImportProgress] = useState(0);

  const fileInputRef = useRef(null);
  const dealerId = parseInt(localStorage.getItem('dealer_id'));

  // ============================================
  // STEP 1: File Upload
  // ============================================
  const handleFileSelect = async (e) => {
    const selectedFile = e.target.files?.[0];
    if (!selectedFile) return;

    const validation = validateFile(selectedFile);
    if (!validation.valid) {
      setError(validation.error);
      return;
    }

    setFile(selectedFile);
    setError(null);
    await analyzeFile(selectedFile);
  };

  // ============================================
  // STEP 2: AI File Analysis & Type Detection
  // ============================================
  const analyzeFile = async (file) => {
    setLoading(true);
    setError(null);

    try {
      // Parse CSV locally first
      const parsed = await parseCSV(file);
      console.log('[IMPORT] Parsed CSV:', parsed.columns.length, 'columns,', parsed.rows.length, 'rows');

      // Convert to base64 for edge function
      const base64Data = await fileToBase64(file);

      // Call analyze-import-file edge function
      const { data, error: analyzeError } = await supabase.functions.invoke('analyze-import-file', {
        body: {
          file_data: base64Data,
          file_name: file.name,
          dealer_id: dealerId
        }
      });

      if (analyzeError) throw analyzeError;

      if (!data.success) {
        throw new Error(data.error || 'File analysis failed');
      }

      setFileData(parsed);
      setDetectedType(data.data_type);
      setConfidence(data.confidence);
      setColumns(data.detected_columns);
      setSampleRows(data.sample_rows);
      setTotalRows(data.row_count);
      setStep(2);

    } catch (err) {
      console.error('[IMPORT] Analysis error:', err);
      setError(err.message || 'Failed to analyze file');
    } finally {
      setLoading(false);
    }
  };

  // ============================================
  // STEP 3: Column Mapping
  // ============================================
  const proceedToMapping = async () => {
    setLoading(true);
    setError(null);

    try {
      // Call map-import-columns edge function
      const { data, error: mapError } = await supabase.functions.invoke('map-import-columns', {
        body: {
          detected_columns: columns,
          data_type: detectedType,
          sample_data: sampleRows,
          dealer_id: dealerId
        }
      });

      if (mapError) throw mapError;

      if (!data.success) {
        throw new Error(data.error || 'Column mapping failed');
      }

      setMappings(data.mappings);
      setRequiredFieldsPresent(data.required_fields_present);
      setMissingRequired(data.missing_required || []);
      setStep(3);

    } catch (err) {
      console.error('[IMPORT] Mapping error:', err);
      setError(err.message || 'Failed to map columns');
    } finally {
      setLoading(false);
    }
  };

  // Update mapping
  const updateMapping = (dealerColumn, newDbField) => {
    setMappings(prev => prev.map(m =>
      m.dealer_column === dealerColumn
        ? { ...m, db_field: newDbField, confidence: 0.99, source: 'manual' }
        : m
    ));

    // Recheck required fields
    const mappedFields = mappings
      .filter(m => m.dealer_column !== dealerColumn)
      .map(m => m.db_field)
      .concat([newDbField])
      .filter(f => f);

    const schemas = {
      inventory: ['vin', 'year', 'make', 'model'],
      deals: ['vehicle_id', 'purchaser_name', 'date_of_sale', 'price'],
      customers: ['name']
    };

    const required = schemas[detectedType] || [];
    const missing = required.filter(f => !mappedFields.includes(f));

    setMissingRequired(missing);
    setRequiredFieldsPresent(missing.length === 0);
  };

  // ============================================
  // STEP 4: Validation
  // ============================================
  const proceedToValidation = async () => {
    if (!requiredFieldsPresent) {
      setError(`Missing required fields: ${missingRequired.join(', ')}`);
      return;
    }

    setLoading(true);
    setError(null);

    try {
      // Call validate-import-data edge function
      const { data, error: validateError } = await supabase.functions.invoke('validate-import-data', {
        body: {
          rows: fileData.rows,
          mappings: mappings,
          data_type: detectedType,
          dealer_id: dealerId
        }
      });

      if (validateError) throw validateError;

      if (!data.success) {
        throw new Error(data.error || 'Validation failed');
      }

      setValidRows(data.valid_rows);
      setWarningRows(data.warning_rows);
      setErrorRows(data.error_rows);
      setStep(4);

    } catch (err) {
      console.error('[IMPORT] Validation error:', err);
      setError(err.message || 'Failed to validate data');
    } finally {
      setLoading(false);
    }
  };

  // ============================================
  // STEP 5: Execute Import
  // ============================================
  const executeImport = async () => {
    setLoading(true);
    setError(null);

    try {
      // Create import session
      const { data: session, error: sessionError } = await supabase
        .from('import_sessions')
        .insert({
          dealer_id: dealerId,
          data_type: detectedType,
          file_name: file.name,
          total_rows: validRows.length + warningRows.length,
          column_mappings: mappings,
          validation_summary: {
            total: totalRows,
            valid: validRows.length,
            warnings: warningRows.length,
            errors: errorRows.length
          },
          created_by: localStorage.getItem('user_email') || 'User'
        })
        .select()
        .single();

      if (sessionError) throw sessionError;

      setImportSessionId(session.id);

      // Combine valid and warning rows for import
      const rowsToImport = [...validRows, ...warningRows.map(w => w.data)];

      // Call execute-import edge function
      const { data, error: importError } = await supabase.functions.invoke('execute-import', {
        body: {
          valid_rows: rowsToImport,
          data_type: detectedType,
          dealer_id: dealerId,
          import_session_id: session.id,
          column_mappings: mappings
        }
      });

      if (importError) throw importError;

      if (!data.success) {
        throw new Error(data.error || 'Import failed');
      }

      setSuccessCount(data.success_count);
      setStep(6);

    } catch (err) {
      console.error('[IMPORT] Import error:', err);
      setError(err.message || 'Failed to import data');
    } finally {
      setLoading(false);
    }
  };

  // ============================================
  // RESET & RESTART
  // ============================================
  const resetImport = () => {
    setStep(1);
    setFile(null);
    setError(null);
    setFileData(null);
    setDetectedType(null);
    setMappings([]);
    setValidRows([]);
    setWarningRows([]);
    setErrorRows([]);
    if (fileInputRef.current) fileInputRef.current.value = '';
  };

  // ============================================
  // RENDER
  // ============================================
  return (
    <div className="p-6 max-w-6xl mx-auto">
      <div className="mb-6">
        <h1 className="text-3xl font-bold text-gray-900">Import Data</h1>
        <p className="text-gray-600 mt-1">
          Import historical inventory, sales, or customer data from CSV files with AI-powered column mapping
        </p>
      </div>

      {/* Progress Steps */}
      <div className="mb-8">
        <div className="flex items-center justify-between">
          {[
            { num: 1, label: 'Upload File' },
            { num: 2, label: 'Detect Type' },
            { num: 3, label: 'Map Columns' },
            { num: 4, label: 'Validate Data' },
            { num: 5, label: 'Import' },
            { num: 6, label: 'Complete' }
          ].map(({ num, label }) => (
            <div key={num} className="flex flex-col items-center flex-1">
              <div className={`w-10 h-10 rounded-full flex items-center justify-center font-bold ${
                step >= num ? 'bg-indigo-600 text-white' : 'bg-gray-200 text-gray-500'
              }`}>
                {num}
              </div>
              <span className={`text-xs mt-2 ${step >= num ? 'text-indigo-600 font-medium' : 'text-gray-500'}`}>
                {label}
              </span>
            </div>
          ))}
        </div>
        <div className="relative mt-2">
          <div className="h-1 bg-gray-200 rounded">
            <div
              className="h-1 bg-indigo-600 rounded transition-all duration-300"
              style={{ width: `${((step - 1) / 5) * 100}%` }}
            />
          </div>
        </div>
      </div>

      {/* Error Display */}
      {error && (
        <div className="mb-6 p-4 bg-red-50 border border-red-200 rounded-lg">
          <p className="text-red-800 font-medium">⚠️ {error}</p>
        </div>
      )}

      {/* STEP 1: Upload File */}
      {step === 1 && (
        <div className="bg-white rounded-lg shadow p-6">
          <h2 className="text-xl font-bold mb-4">Step 1: Upload Your File</h2>
          <div className="border-2 border-dashed border-gray-300 rounded-lg p-12 text-center">
            <input
              ref={fileInputRef}
              type="file"
              accept=".csv,.xlsx,.xls"
              onChange={handleFileSelect}
              className="hidden"
              id="file-upload"
            />
            <label
              htmlFor="file-upload"
              className="cursor-pointer flex flex-col items-center"
            >
              <svg className="w-16 h-16 text-gray-400 mb-4" fill="none" stroke="currentColor" viewBox="0 0 24 24">
                <path strokeLinecap="round" strokeLinejoin="width" d="M7 16a4 4 0 01-.88-7.903A5 5 0 1115.9 6L16 6a5 5 0 011 9.9M15 13l-3-3m0 0l-3 3m3-3v12" />
              </svg>
              <span className="text-lg font-medium text-gray-700">
                {file ? file.name : 'Click to upload or drag and drop'}
              </span>
              <span className="text-sm text-gray-500 mt-1">
                CSV, XLSX, or XLS (up to 10MB)
              </span>
            </label>
          </div>
          {loading && (
            <div className="mt-4 text-center text-gray-600">
              <div className="animate-spin rounded-full h-8 w-8 border-b-2 border-indigo-600 mx-auto mb-2"></div>
              Analyzing file...
            </div>
          )}
        </div>
      )}

      {/* STEP 2: Type Detection */}
      {step === 2 && (
        <div className="bg-white rounded-lg shadow p-6">
          <h2 className="text-xl font-bold mb-4">Step 2: Data Type Detected</h2>
          <div className="bg-indigo-50 border border-indigo-200 rounded-lg p-6 mb-4">
            <div className="flex items-center justify-between">
              <div>
                <p className="text-sm text-gray-600">Detected as:</p>
                <p className="text-2xl font-bold text-indigo-900">
                  {getDataTypeIcon(detectedType)} {getDataTypeLabel(detectedType)}
                </p>
                <p className="text-sm text-gray-600 mt-1">
                  Confidence: <span className={`font-medium ${getConfidenceBadgeColor(confidence)}`}>
                    {formatConfidence(confidence)}
                  </span>
                </p>
              </div>
              <div className="text-right">
                <p className="text-sm text-gray-600">File Info:</p>
                <p className="font-medium">{columns.length} columns</p>
                <p className="font-medium">{totalRows} rows</p>
              </div>
            </div>
          </div>

          {/* Preview Table */}
          <div className="mb-4">
            <h3 className="font-semibold mb-2">Sample Data Preview (first 5 rows):</h3>
            <div className="overflow-x-auto">
              <table className="min-w-full divide-y divide-gray-200 border">
                <thead className="bg-gray-50">
                  <tr>
                    {columns.map((col, idx) => (
                      <th key={idx} className="px-4 py-2 text-left text-xs font-medium text-gray-700">
                        {col}
                      </th>
                    ))}
                  </tr>
                </thead>
                <tbody className="bg-white divide-y divide-gray-200">
                  {sampleRows.map((row, idx) => (
                    <tr key={idx}>
                      {columns.map((col, colIdx) => (
                        <td key={colIdx} className="px-4 py-2 text-sm text-gray-900 whitespace-nowrap">
                          {row[col]}
                        </td>
                      ))}
                    </tr>
                  ))}
                </tbody>
              </table>
            </div>
          </div>

          <div className="flex gap-4">
            <button
              onClick={resetImport}
              className="px-4 py-2 border border-gray-300 rounded-lg hover:bg-gray-50"
            >
              Cancel
            </button>
            <button
              onClick={proceedToMapping}
              disabled={loading || confidence < 0.5}
              className="px-6 py-2 bg-indigo-600 text-white rounded-lg hover:bg-indigo-700 disabled:opacity-50"
            >
              {loading ? 'Mapping Columns...' : 'Continue to Column Mapping'}
            </button>
          </div>
        </div>
      )}

      {/* STEP 3: Column Mapping */}
      {step === 3 && (
        <div className="bg-white rounded-lg shadow p-6">
          <h2 className="text-xl font-bold mb-4">Step 3: Review Column Mappings</h2>

          {!requiredFieldsPresent && (
            <div className="mb-4 p-4 bg-yellow-50 border border-yellow-200 rounded-lg">
              <p className="text-yellow-800 font-medium">
                ⚠️ Missing required fields: {missingRequired.join(', ')}
              </p>
              <p className="text-sm text-yellow-700 mt-1">
                Please map these columns before continuing.
              </p>
            </div>
          )}

          <div className="space-y-2 mb-6">
            {mappings.map((mapping, idx) => (
              <div key={idx} className="flex items-center gap-4 p-3 bg-gray-50 rounded-lg">
                <div className="flex-1">
                  <p className="font-medium text-gray-900">{mapping.dealer_column}</p>
                  <p className="text-xs text-gray-500">Sample: {sampleRows[0]?.[mapping.dealer_column] || 'N/A'}</p>
                </div>
                <div className="text-2xl text-gray-400">→</div>
                <div className="flex-1">
                  <select
                    value={mapping.db_field || ''}
                    onChange={(e) => updateMapping(mapping.dealer_column, e.target.value || null)}
                    className="w-full border-gray-300 rounded-md shadow-sm text-sm"
                  >
                    <option value="">-- Ignore this column --</option>
                    {/* Dynamically populate based on data type */}
                    {detectedType === 'inventory' && (
                      <>
                        <optgroup label="Required">
                          <option value="vin">VIN</option>
                          <option value="year">Year</option>
                          <option value="make">Make</option>
                          <option value="model">Model</option>
                        </optgroup>
                        <optgroup label="Optional">
                          <option value="trim">Trim</option>
                          <option value="color">Color</option>
                          <option value="miles">Miles</option>
                          <option value="stock_number">Stock Number</option>
                          <option value="purchase_price">Purchase Price</option>
                          <option value="sale_price">Sale Price</option>
                          <option value="status">Status</option>
                          <option value="purchased_from">Purchased From</option>
                        </optgroup>
                      </>
                    )}
                    {detectedType === 'deals' && (
                      <>
                        <optgroup label="Required">
                          <option value="purchaser_name">Purchaser Name</option>
                          <option value="date_of_sale">Date of Sale</option>
                          <option value="price">Price</option>
                          <option value="vehicle_id">VIN</option>
                        </optgroup>
                        <optgroup label="Optional">
                          <option value="down_payment">Down Payment</option>
                          <option value="trade_allowance">Trade Allowance</option>
                          <option value="sales_tax">Sales Tax</option>
                          <option value="apr">APR</option>
                          <option value="term_months">Term (Months)</option>
                          <option value="monthly_payment">Monthly Payment</option>
                          <option value="salesman">Salesman</option>
                          <option value="phone">Phone</option>
                          <option value="email">Email</option>
                        </optgroup>
                      </>
                    )}
                    {detectedType === 'customers' && (
                      <>
                        <optgroup label="Required">
                          <option value="name">Full Name</option>
                          <option value="first_name">First Name</option>
                          <option value="last_name">Last Name</option>
                        </optgroup>
                        <optgroup label="Optional">
                          <option value="phone">Phone</option>
                          <option value="email">Email</option>
                          <option value="address">Address</option>
                          <option value="city">City</option>
                          <option value="state">State</option>
                          <option value="zip">ZIP Code</option>
                          <option value="drivers_license">Drivers License</option>
                        </optgroup>
                      </>
                    )}
                  </select>
                  <span className={`text-xs ${getConfidenceBadgeColor(mapping.confidence)} px-2 py-1 rounded mt-1 inline-block`}>
                    {formatConfidence(mapping.confidence)} {mapping.source}
                  </span>
                </div>
              </div>
            ))}
          </div>

          <div className="flex gap-4">
            <button
              onClick={() => setStep(2)}
              className="px-4 py-2 border border-gray-300 rounded-lg hover:bg-gray-50"
            >
              Back
            </button>
            <button
              onClick={proceedToValidation}
              disabled={loading || !requiredFieldsPresent}
              className="px-6 py-2 bg-indigo-600 text-white rounded-lg hover:bg-indigo-700 disabled:opacity-50"
            >
              {loading ? 'Validating...' : 'Continue to Validation'}
            </button>
          </div>
        </div>
      )}

      {/* STEP 4: Validation Results */}
      {step === 4 && (
        <div className="bg-white rounded-lg shadow p-6">
          <h2 className="text-xl font-bold mb-4">Step 4: Validation Results</h2>

          <div className="grid grid-cols-3 gap-4 mb-6">
            <div className="p-4 bg-green-50 border border-green-200 rounded-lg">
              <p className="text-2xl font-bold text-green-900">{validRows.length}</p>
              <p className="text-sm text-green-700">✓ Valid Rows</p>
            </div>
            <div className="p-4 bg-yellow-50 border border-yellow-200 rounded-lg">
              <p className="text-2xl font-bold text-yellow-900">{warningRows.length}</p>
              <p className="text-sm text-yellow-700">⚠ Warning Rows</p>
            </div>
            <div className="p-4 bg-red-50 border border-red-200 rounded-lg">
              <p className="text-2xl font-bold text-red-900">{errorRows.length}</p>
              <p className="text-sm text-red-700">✗ Error Rows</p>
            </div>
          </div>

          {errorRows.length > 0 && (
            <div className="mb-4">
              <h3 className="font-semibold mb-2 text-red-700">Rows with Errors (will be skipped):</h3>
              <div className="bg-red-50 border border-red-200 rounded-lg p-4 max-h-48 overflow-y-auto">
                <pre className="text-xs text-red-900 whitespace-pre-wrap">
                  {formatValidationErrors(errorRows)}
                </pre>
              </div>
              <button
                onClick={() => downloadCSV(errorRows.map(e => ({ row: e.row, errors: e.errors.join('; '), ...e.data })), 'import-errors.csv')}
                className="mt-2 text-sm text-indigo-600 hover:underline"
              >
                Download Error Report
              </button>
            </div>
          )}

          <div className="flex gap-4">
            <button
              onClick={() => setStep(3)}
              className="px-4 py-2 border border-gray-300 rounded-lg hover:bg-gray-50"
            >
              Back to Mapping
            </button>
            <button
              onClick={executeImport}
              disabled={loading || (validRows.length === 0 && warningRows.length === 0)}
              className="px-6 py-2 bg-indigo-600 text-white rounded-lg hover:bg-indigo-700 disabled:opacity-50"
            >
              {loading ? 'Importing...' : `Import ${validRows.length + warningRows.length} Rows`}
            </button>
          </div>
        </div>
      )}

      {/* STEP 6: Complete */}
      {step === 6 && (
        <div className="bg-white rounded-lg shadow p-6 text-center">
          <div className="mb-4">
            <div className="w-16 h-16 bg-green-100 rounded-full flex items-center justify-center mx-auto mb-4">
              <svg className="w-10 h-10 text-green-600" fill="none" stroke="currentColor" viewBox="0 0 24 24">
                <path strokeLinecap="round" strokeLinejoin="round" strokeWidth="2" d="M5 13l4 4L19 7"></path>
              </svg>
            </div>
            <h2 className="text-2xl font-bold text-gray-900 mb-2">Import Complete!</h2>
            <p className="text-lg text-gray-600">
              Successfully imported <span className="font-bold text-green-600">{successCount}</span> {detectedType} records
            </p>
          </div>

          <div className="flex gap-4 justify-center">
            <button
              onClick={resetImport}
              className="px-6 py-2 bg-indigo-600 text-white rounded-lg hover:bg-indigo-700"
            >
              Import Another File
            </button>
            <button
              onClick={() => window.location.href = `/${detectedType === 'deals' ? 'deals' : detectedType}`}
              className="px-6 py-2 border border-gray-300 rounded-lg hover:bg-gray-50"
            >
              View Imported {getDataTypeLabel(detectedType)}
            </button>
          </div>
        </div>
      )}
    </div>
  );
}
