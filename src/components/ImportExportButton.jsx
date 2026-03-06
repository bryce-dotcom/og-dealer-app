import { useState, useRef } from 'react';
import { supabase } from '../lib/supabase';
import { parseCSV, fileToBase64, downloadCSV, validateFile, formatConfidence, getConfidenceBadgeColor } from '../lib/importHelpers';

/**
 * Reusable Import/Export component for any data type
 * @param {string} dataType - 'inventory', 'deals', 'customers', 'employees'
 * @param {function} onImportComplete - Callback after successful import
 */
export default function ImportExportButton({ dataType, onImportComplete }) {
  const [showModal, setShowModal] = useState(false);
  const [step, setStep] = useState('upload'); // upload, map, validate, importing, complete
  const [loading, setLoading] = useState(false);
  const [error, setError] = useState(null);

  const [file, setFile] = useState(null);
  const [fileData, setFileData] = useState(null);
  const [columns, setColumns] = useState([]);
  const [sampleRows, setSampleRows] = useState([]);

  const [mappings, setMappings] = useState([]);
  const [requiredFieldsPresent, setRequiredFieldsPresent] = useState(false);
  const [missingRequired, setMissingRequired] = useState([]);

  const [validRows, setValidRows] = useState([]);
  const [warningRows, setWarningRows] = useState([]);
  const [errorRows, setErrorRows] = useState([]);

  const [successCount, setSuccessCount] = useState(0);

  const fileInputRef = useRef(null);
  const dealerId = parseInt(localStorage.getItem('dealer_id'));

  const dataTypeLabels = {
    inventory: 'Inventory',
    deals: 'Deals',
    customers: 'Customers',
    employees: 'Employees'
  };

  // Export current data to CSV
  const handleExport = async () => {
    setLoading(true);
    try {
      const { data, error } = await supabase
        .from(dataType)
        .select('*')
        .eq('dealer_id', dealerId);

      if (error) throw error;

      if (!data || data.length === 0) {
        alert('No data to export');
        return;
      }

      downloadCSV(data, `${dataType}-export-${new Date().toISOString().split('T')[0]}.csv`);
    } catch (err) {
      console.error('[EXPORT] Error:', err);
      alert('Export failed: ' + err.message);
    } finally {
      setLoading(false);
    }
  };

  // Handle file selection
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

  // Analyze file
  const analyzeFile = async (file) => {
    setLoading(true);
    try {
      const parsed = await parseCSV(file);
      setFileData(parsed);
      setColumns(parsed.columns);
      setSampleRows(parsed.rows.slice(0, 5));

      // Auto-map columns
      await mapColumns(parsed.columns, parsed.rows);
    } catch (err) {
      setError(err.message || 'Failed to parse file');
    } finally {
      setLoading(false);
    }
  };

  // Map columns
  const mapColumns = async (cols, rows) => {
    setLoading(true);
    try {
      const { data, error: mapError } = await supabase.functions.invoke('map-import-columns', {
        body: {
          detected_columns: cols,
          data_type: dataType,
          sample_data: rows.slice(0, 5),
          dealer_id: dealerId
        }
      });

      if (mapError) throw mapError;
      if (!data.success) throw new Error(data.error || 'Mapping failed');

      setMappings(data.mappings);
      setRequiredFieldsPresent(data.required_fields_present);
      setMissingRequired(data.missing_required || []);
      setStep('map');
    } catch (err) {
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

    const schemas = {
      inventory: ['vin', 'year', 'make', 'model'],
      deals: ['purchaser_name', 'date_of_sale', 'price'],
      customers: ['name'],
      employees: ['name']
    };

    const required = schemas[dataType] || [];
    const mappedFields = mappings
      .filter(m => m.dealer_column !== dealerColumn)
      .map(m => m.db_field)
      .concat([newDbField])
      .filter(f => f);

    const missing = required.filter(f => !mappedFields.includes(f));
    setMissingRequired(missing);
    setRequiredFieldsPresent(missing.length === 0);
  };

  // Validate data
  const validateData = async () => {
    if (!requiredFieldsPresent) {
      setError(`Missing required fields: ${missingRequired.join(', ')}`);
      return;
    }

    setLoading(true);
    setError(null);

    try {
      const { data, error: validateError } = await supabase.functions.invoke('validate-import-data', {
        body: {
          rows: fileData.rows,
          mappings: mappings,
          data_type: dataType,
          dealer_id: dealerId
        }
      });

      if (validateError) throw validateError;
      if (!data.success) throw new Error(data.error || 'Validation failed');

      setValidRows(data.valid_rows);
      setWarningRows(data.warning_rows);
      setErrorRows(data.error_rows);
      setStep('validate');
    } catch (err) {
      setError(err.message || 'Validation failed');
    } finally {
      setLoading(false);
    }
  };

  // Execute import
  const executeImport = async () => {
    setLoading(true);
    setStep('importing');
    setError(null);

    try {
      // Create import session
      const { data: session, error: sessionError } = await supabase
        .from('import_sessions')
        .insert({
          dealer_id: dealerId,
          data_type: dataType,
          file_name: file.name,
          total_rows: validRows.length + warningRows.length,
          column_mappings: mappings,
          created_by: localStorage.getItem('user_email') || 'User'
        })
        .select()
        .single();

      if (sessionError) throw sessionError;

      const rowsToImport = [...validRows, ...warningRows.map(w => w.data)];

      const { data, error: importError } = await supabase.functions.invoke('execute-import', {
        body: {
          valid_rows: rowsToImport,
          data_type: dataType,
          dealer_id: dealerId,
          import_session_id: session.id,
          column_mappings: mappings
        }
      });

      if (importError) throw importError;
      if (!data.success) throw new Error(data.error || 'Import failed');

      setSuccessCount(data.success_count);
      setStep('complete');

      // Call callback after short delay
      setTimeout(() => {
        if (onImportComplete) onImportComplete();
      }, 1500);
    } catch (err) {
      setError(err.message || 'Import failed');
      setStep('validate');
    } finally {
      setLoading(false);
    }
  };

  // Reset and close
  const closeModal = () => {
    setShowModal(false);
    setStep('upload');
    setFile(null);
    setError(null);
    setFileData(null);
    setMappings([]);
    setValidRows([]);
    setWarningRows([]);
    setErrorRows([]);
    if (fileInputRef.current) fileInputRef.current.value = '';
  };

  // Get schema fields for dropdown
  const getSchemaFields = () => {
    const schemas = {
      inventory: {
        required: ['vin', 'year', 'make', 'model'],
        optional: ['trim', 'color', 'miles', 'stock_number', 'purchase_price', 'sale_price', 'status', 'purchased_from']
      },
      deals: {
        required: ['purchaser_name', 'date_of_sale', 'price'],
        optional: ['vehicle_id', 'down_payment', 'trade_allowance', 'sales_tax', 'apr', 'term_months', 'salesman', 'phone', 'email']
      },
      customers: {
        required: ['name'],
        optional: ['first_name', 'last_name', 'phone', 'email', 'address', 'city', 'state', 'zip', 'drivers_license']
      },
      employees: {
        required: ['name'],
        optional: ['email', 'phone', 'job_title', 'hourly_rate', 'salary', 'hire_date', 'active']
      }
    };
    return schemas[dataType] || { required: [], optional: [] };
  };

  return (
    <>
      {/* Import/Export Buttons */}
      <div className="flex gap-2">
        <button
          onClick={() => setShowModal(true)}
          className="px-4 py-2 bg-indigo-600 text-white rounded-lg hover:bg-indigo-700 flex items-center gap-2"
        >
          <svg className="w-4 h-4" fill="none" stroke="currentColor" viewBox="0 0 24 24">
            <path strokeLinecap="round" strokeLinejoin="round" strokeWidth="2" d="M7 16a4 4 0 01-.88-7.903A5 5 0 1115.9 6L16 6a5 5 0 011 9.9M15 13l-3-3m0 0l-3 3m3-3v12" />
          </svg>
          Import
        </button>
        <button
          onClick={handleExport}
          disabled={loading}
          className="px-4 py-2 border border-gray-300 rounded-lg hover:bg-gray-50 flex items-center gap-2"
        >
          <svg className="w-4 h-4" fill="none" stroke="currentColor" viewBox="0 0 24 24">
            <path strokeLinecap="round" strokeLinejoin="round" strokeWidth="2" d="M7 16a4 4 0 01-.88-7.903A5 5 0 1115.9 6L16 6a5 5 0 011 9.9M9 19l3 3m0 0l3-3m-3 3V10" />
          </svg>
          Export
        </button>
      </div>

      {/* Import Modal */}
      {showModal && (
        <div className="fixed inset-0 bg-black bg-opacity-50 flex items-center justify-center z-50 p-4">
          <div className="bg-white rounded-lg shadow-xl max-w-4xl w-full max-h-[90vh] overflow-y-auto">
            <div className="p-6">
              <div className="flex items-center justify-between mb-4">
                <h2 className="text-2xl font-bold">Import {dataTypeLabels[dataType]}</h2>
                <button onClick={closeModal} className="text-gray-400 hover:text-gray-600">
                  <svg className="w-6 h-6" fill="none" stroke="currentColor" viewBox="0 0 24 24">
                    <path strokeLinecap="round" strokeLinejoin="round" strokeWidth="2" d="M6 18L18 6M6 6l12 12" />
                  </svg>
                </button>
              </div>

              {error && (
                <div className="mb-4 p-4 bg-red-50 border border-red-200 rounded-lg">
                  <p className="text-red-800 font-medium">⚠️ {error}</p>
                </div>
              )}

              {/* Step: Upload */}
              {step === 'upload' && (
                <div>
                  <div className="border-2 border-dashed border-gray-300 rounded-lg p-8 text-center">
                    <input
                      ref={fileInputRef}
                      type="file"
                      accept=".csv"
                      onChange={handleFileSelect}
                      className="hidden"
                      id="import-file-upload"
                    />
                    <label htmlFor="import-file-upload" className="cursor-pointer flex flex-col items-center">
                      <svg className="w-12 h-12 text-gray-400 mb-3" fill="none" stroke="currentColor" viewBox="0 0 24 24">
                        <path strokeLinecap="round" strokeLinejoin="round" strokeWidth="2" d="M7 16a4 4 0 01-.88-7.903A5 5 0 1115.9 6L16 6a5 5 0 011 9.9M15 13l-3-3m0 0l-3 3m3-3v12" />
                      </svg>
                      <span className="text-lg font-medium text-gray-700">
                        {file ? file.name : 'Click to upload CSV file'}
                      </span>
                      <span className="text-sm text-gray-500 mt-1">CSV files up to 10MB</span>
                    </label>
                  </div>
                  {loading && (
                    <div className="mt-4 text-center">
                      <div className="animate-spin rounded-full h-8 w-8 border-b-2 border-indigo-600 mx-auto mb-2"></div>
                      <p className="text-gray-600">Analyzing file...</p>
                    </div>
                  )}
                </div>
              )}

              {/* Step: Map Columns */}
              {step === 'map' && (
                <div>
                  {!requiredFieldsPresent && (
                    <div className="mb-4 p-3 bg-yellow-50 border border-yellow-200 rounded-lg">
                      <p className="text-yellow-800 text-sm">
                        ⚠️ Missing required: {missingRequired.join(', ')}
                      </p>
                    </div>
                  )}

                  <div className="space-y-2 mb-6 max-h-96 overflow-y-auto">
                    {mappings.map((mapping, idx) => (
                      <div key={idx} className="flex items-center gap-3 p-2 bg-gray-50 rounded">
                        <div className="flex-1 min-w-0">
                          <p className="font-medium text-sm truncate">{mapping.dealer_column}</p>
                          <p className="text-xs text-gray-500 truncate">{sampleRows[0]?.[mapping.dealer_column] || 'N/A'}</p>
                        </div>
                        <span className="text-gray-400">→</span>
                        <div className="flex-1">
                          <select
                            value={mapping.db_field || ''}
                            onChange={(e) => updateMapping(mapping.dealer_column, e.target.value || null)}
                            className="w-full text-sm border-gray-300 rounded"
                          >
                            <option value="">-- Ignore --</option>
                            <optgroup label="Required">
                              {getSchemaFields().required.map(f => (
                                <option key={f} value={f}>{f.replace(/_/g, ' ')}</option>
                              ))}
                            </optgroup>
                            <optgroup label="Optional">
                              {getSchemaFields().optional.map(f => (
                                <option key={f} value={f}>{f.replace(/_/g, ' ')}</option>
                              ))}
                            </optgroup>
                          </select>
                          <span className={`text-xs ${getConfidenceBadgeColor(mapping.confidence)} px-2 py-0.5 rounded mt-1 inline-block`}>
                            {formatConfidence(mapping.confidence)}
                          </span>
                        </div>
                      </div>
                    ))}
                  </div>

                  <div className="flex gap-3">
                    <button onClick={closeModal} className="px-4 py-2 border border-gray-300 rounded-lg hover:bg-gray-50">
                      Cancel
                    </button>
                    <button
                      onClick={validateData}
                      disabled={loading || !requiredFieldsPresent}
                      className="px-6 py-2 bg-indigo-600 text-white rounded-lg hover:bg-indigo-700 disabled:opacity-50"
                    >
                      {loading ? 'Validating...' : 'Continue'}
                    </button>
                  </div>
                </div>
              )}

              {/* Step: Validate */}
              {step === 'validate' && (
                <div>
                  <div className="grid grid-cols-3 gap-3 mb-6">
                    <div className="p-3 bg-green-50 border border-green-200 rounded-lg text-center">
                      <p className="text-2xl font-bold text-green-900">{validRows.length}</p>
                      <p className="text-xs text-green-700">✓ Valid</p>
                    </div>
                    <div className="p-3 bg-yellow-50 border border-yellow-200 rounded-lg text-center">
                      <p className="text-2xl font-bold text-yellow-900">{warningRows.length}</p>
                      <p className="text-xs text-yellow-700">⚠ Warnings</p>
                    </div>
                    <div className="p-3 bg-red-50 border border-red-200 rounded-lg text-center">
                      <p className="text-2xl font-bold text-red-900">{errorRows.length}</p>
                      <p className="text-xs text-red-700">✗ Errors</p>
                    </div>
                  </div>

                  {errorRows.length > 0 && (
                    <div className="mb-4 p-3 bg-red-50 border border-red-200 rounded-lg max-h-32 overflow-y-auto">
                      <p className="text-xs text-red-800 font-medium mb-1">Errors (will be skipped):</p>
                      {errorRows.slice(0, 5).map((err, idx) => (
                        <p key={idx} className="text-xs text-red-700">Row {err.row}: {err.errors.join(', ')}</p>
                      ))}
                      {errorRows.length > 5 && <p className="text-xs text-red-600 mt-1">...and {errorRows.length - 5} more</p>}
                    </div>
                  )}

                  <div className="flex gap-3">
                    <button onClick={() => setStep('map')} className="px-4 py-2 border border-gray-300 rounded-lg hover:bg-gray-50">
                      Back
                    </button>
                    <button
                      onClick={executeImport}
                      disabled={loading || (validRows.length === 0 && warningRows.length === 0)}
                      className="px-6 py-2 bg-indigo-600 text-white rounded-lg hover:bg-indigo-700 disabled:opacity-50"
                    >
                      Import {validRows.length + warningRows.length} Rows
                    </button>
                  </div>
                </div>
              )}

              {/* Step: Importing */}
              {step === 'importing' && (
                <div className="text-center py-8">
                  <div className="animate-spin rounded-full h-12 w-12 border-b-2 border-indigo-600 mx-auto mb-4"></div>
                  <p className="text-lg font-medium text-gray-900">Importing...</p>
                  <p className="text-sm text-gray-600">Please wait while we import your data</p>
                </div>
              )}

              {/* Step: Complete */}
              {step === 'complete' && (
                <div className="text-center py-8">
                  <div className="w-16 h-16 bg-green-100 rounded-full flex items-center justify-center mx-auto mb-4">
                    <svg className="w-10 h-10 text-green-600" fill="none" stroke="currentColor" viewBox="0 0 24 24">
                      <path strokeLinecap="round" strokeLinejoin="round" strokeWidth="2" d="M5 13l4 4L19 7"></path>
                    </svg>
                  </div>
                  <h3 className="text-xl font-bold text-gray-900 mb-2">Import Complete!</h3>
                  <p className="text-gray-600 mb-6">
                    Successfully imported <span className="font-bold text-green-600">{successCount}</span> {dataTypeLabels[dataType].toLowerCase()} records
                  </p>
                  <button
                    onClick={closeModal}
                    className="px-6 py-2 bg-indigo-600 text-white rounded-lg hover:bg-indigo-700"
                  >
                    Done
                  </button>
                </div>
              )}
            </div>
          </div>
        </div>
      )}
    </>
  );
}
