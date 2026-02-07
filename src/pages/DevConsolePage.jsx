import { useState, useEffect, useRef } from 'react';
import { supabase } from '../lib/supabase';
import { useStore } from '../lib/store';
import FormTemplateGenerator from '../components/FormTemplateGenerator';

export default function DevConsolePage() {
  const { dealerId, dealer, inventory, employees, bhphLoans, deals, customers, setDealer, fetchAllData: storeRefresh } = useStore();

  // ACCESS CONTROL: Developer only - must be OG DiX Motor Club
  const isDeveloper = dealer?.dealer_name === 'OG DiX Motor Club';

  const [activeSection, setActiveSection] = useState('dashboard');
  const [loading, setLoading] = useState(false);
  const [toast, setToast] = useState(null);
  const [showHelp, setShowHelp] = useState(false);
  
  // Data states
  const [allDealers, setAllDealers] = useState([]);
  const [allUsers, setAllUsers] = useState([]);
  const [feedbackList, setFeedbackList] = useState([]);
  const [auditLogs, setAuditLogs] = useState([]);
  const [promoCodes, setPromoCodes] = useState([]);
  const [messageTemplates, setMessageTemplates] = useState([]);
  
  // Form Library states - 3 tabs system
  const [formLibraryTab, setFormLibraryTab] = useState('rules');
  const [complianceRules, setComplianceRules] = useState([]);
  const [formStaging, setFormStaging] = useState([]);
  const [formLibrary, setFormLibrary] = useState([]);
  const [formFilter, setFormFilter] = useState('all');
  const [formModal, setFormModal] = useState(null);
  const [fieldMapperModal, setFieldMapperModal] = useState(null);
  const [aiResearching, setAiResearching] = useState(false);
  const [ruleModal, setRuleModal] = useState(null);
  const [stagingFilter, setStagingFilter] = useState('all');
  const [stagingStateFilter, setStagingStateFilter] = useState('all');
  const [uploadFormModal, setUploadFormModal] = useState(null);
  const [inlineUploadingId, setInlineUploadingId] = useState(null); // Track which row is uploading
  const [analyzingFormId, setAnalyzingFormId] = useState(null); // Track which form is being analyzed
  const stagingFileInputRef = useRef(null); // Ref for hidden file input
  const [libraryStateFilter, setLibraryStateFilter] = useState('all');
  const [confirmBulkDelete, setConfirmBulkDelete] = useState(null);
  const [discoverState, setDiscoverState] = useState('all');
  const [discoverProgress, setDiscoverProgress] = useState('');
  const [promoteModal, setPromoteModal] = useState(null); // { form, selectedLibrary }
  const [templateGeneratorModal, setTemplateGeneratorModal] = useState(null); // { form } for HTML template generation
  const [checkingUpdates, setCheckingUpdates] = useState(false);
  const [updateCheckModal, setUpdateCheckModal] = useState(null); // { new_forms, potential_updates, unchanged }
  const [postUpdateForm, setPostUpdateForm] = useState(null); // { title, summary, update_type, importance, source_url }
  
  // Table browser
  const [selectedTable, setSelectedTable] = useState('inventory');
  const [tableData, setTableData] = useState([]);
  const [tableColumns, setTableColumns] = useState([]);
  
  // SQL Runner
  const [sqlQuery, setSqlQuery] = useState('SELECT * FROM inventory LIMIT 10');
  const [sqlResult, setSqlResult] = useState(null);
  const [sqlError, setSqlError] = useState(null);
  
  // Bulk operations
  const [selectedIds, setSelectedIds] = useState([]);
  const [bulkStatus, setBulkStatus] = useState('');
  
  // Modals
  const [confirmDelete, setConfirmDelete] = useState(null);
  const [confirmDeleteUser, setConfirmDeleteUser] = useState(null);
  const [impersonateModal, setImpersonateModal] = useState(null);
  const [promoModal, setPromoModal] = useState(null);
  const [templateModal, setTemplateModal] = useState(null);
  const [smsModal, setSmsModal] = useState(null);

  // Help content for each section
  const helpContent = {
    dashboard: {
      title: 'Dashboard',
      description: 'System-wide overview of all data across your platform.',
      functions: [
        { name: 'Stats Cards', desc: 'Real-time counts of dealers, users, vehicles, loans, etc.' },
        { name: 'Late/New indicators', desc: 'Red numbers indicate items needing attention' },
      ],
      warnings: [],
      whenToUse: 'Check this first to get a quick health check of your system.'
    },
    feedback: {
      title: 'Feedback Manager',
      description: 'View and manage feedback submitted by beta testers and users.',
      functions: [
        { name: 'Status buttons', desc: 'Mark feedback as new, reviewed, planned, or done' },
        { name: 'Delete', desc: 'Permanently remove feedback' },
        { name: 'Type badges', desc: 'BUG = something broken, FEATURE = request, FEEDBACK = general' },
      ],
      warnings: ['Deleted feedback cannot be recovered'],
      whenToUse: 'Review daily during beta. Prioritize bugs over features.'
    },
    dealers: {
      title: 'Dealer Management',
      description: 'Manage all dealer accounts in the system.',
      functions: [
        { name: 'View As', desc: 'Impersonate a dealer to see their data and test their experience' },
        { name: 'Delete', desc: 'Permanently remove dealer and ALL their data' },
      ],
      warnings: [
        'Cannot delete the dealer you are currently viewing as',
        'DELETE REMOVES ALL DATA: inventory, deals, BHPH, customers, employees',
        'This action is PERMANENT and cannot be undone'
      ],
      whenToUse: 'Use View As to troubleshoot dealer issues. Delete only for test accounts or cancelled subscriptions.'
    },
    users: {
      title: 'User Management',
      description: 'Manage all employee/user accounts across all dealers.',
      functions: [
        { name: 'Enable/Disable', desc: 'Toggle user access without deleting their data' },
        { name: 'Delete', desc: 'Permanently remove user from system' },
      ],
      warnings: [
        'Disabling a user prevents login but keeps their data',
        'Deleting a user removes them permanently',
        'Deleting may affect commission history and audit trails'
      ],
      whenToUse: 'Disable users who leave the company. Delete only for test accounts.'
    },
    forms: {
      title: 'Form Library (3-Tab System)',
      description: 'Complete form management with compliance rules, AI discovery staging, and production library.',
      functions: [
        { name: 'Rules Tab', desc: 'State compliance rules with deadlines, penalties, and required forms' },
        { name: 'Staging Tab', desc: 'AI-discovered forms pending review. Analyze, Promote, or Reject.' },
        { name: 'Library Tab', desc: 'Production-ready forms with field mappings for auto-fill' },
        { name: 'Field Mapper', desc: 'Click forms <99% in Library to map PDF fields to deal context' },
        { name: 'AI Discover', desc: 'Use AI to find forms for your state (adds to Staging)' },
      ],
      warnings: [
        'AI Discover calls external APIs (uses credits)',
        'Forms must reach 99% mapping to be fully functional',
        'Compliance rules should be verified before relying on them'
      ],
      whenToUse: 'Set up rules when onboarding a new state. Review staging weekly. Map fields for auto-fill.'
    },
    data: {
      title: 'Data Browser',
      description: 'View raw data from any table in the database.',
      functions: [
        { name: 'Table selector', desc: 'Choose which table to view' },
        { name: 'Load', desc: 'Fetch up to 200 records from selected table' },
        { name: 'Export CSV', desc: 'Download current data as spreadsheet' },
      ],
      warnings: [
        'Shows ALL dealers data, not filtered',
        'Limited to 200 records per load'
      ],
      whenToUse: 'Debug data issues, verify records exist, export for reporting.'
    },
    bulk: {
      title: 'Bulk Operations',
      description: 'Update or delete multiple records at once.',
      functions: [
        { name: 'Checkboxes', desc: 'Select individual records or use header checkbox for all' },
        { name: 'Set status', desc: 'Change status field on all selected records' },
        { name: 'Delete Selected', desc: 'Permanently remove all selected records' },
      ],
      warnings: [
        'BULK DELETE IS PERMANENT - double check your selection',
        'Status changes are immediate - no undo',
        'Test on small batches first'
      ],
      whenToUse: 'Clean up test data, mark multiple vehicles sold, bulk status updates.'
    },
    sql: {
      title: 'SQL Runner',
      description: 'Execute raw SQL queries against the database.',
      functions: [
        { name: 'Query input', desc: 'Write any SELECT query' },
        { name: 'Run Query', desc: 'Execute and see results' },
      ],
      warnings: [
        'Requires run_sql RPC function in Supabase',
        'SELECT only - no INSERT/UPDATE/DELETE',
        'Can expose sensitive data - use carefully'
      ],
      whenToUse: 'Advanced debugging, custom reports, data analysis.'
    },
    bhph: {
      title: 'BHPH Command Center',
      description: 'Monitor and manage Buy Here Pay Here loans.',
      functions: [
        { name: 'Stats cards', desc: 'Total owed, active loans, late payments, repo queue' },
        { name: 'Loan list', desc: 'All loans with balance and status' },
        { name: 'Repo Queue', desc: 'Loans 30+ days late flagged for potential repo' },
      ],
      warnings: [
        'Late payment data depends on payment tracking being set up',
        'Repo queue is informational - does not trigger any actions'
      ],
      whenToUse: 'Daily review of loan health, identify problem accounts, collections prioritization.'
    },
    promos: {
      title: 'Promo Codes',
      description: 'Create and manage discount codes.',
      functions: [
        { name: 'New Promo', desc: 'Create percent or fixed-amount discount code' },
        { name: 'Enable/Disable', desc: 'Toggle code availability without deleting' },
        { name: 'Edit', desc: 'Modify existing promo details' },
        { name: 'Usage tracking', desc: 'See how many times each code was used' },
      ],
      warnings: [
        'Disabled promos can be re-enabled',
        'Codes must be unique'
      ],
      whenToUse: 'Marketing campaigns, customer retention, special offers.'
    },
    templates: {
      title: 'Message Templates',
      description: 'Create reusable SMS and email templates.',
      functions: [
        { name: 'New Template', desc: 'Create SMS or email template' },
        { name: 'Variables', desc: 'Use {customer_name}, {vehicle}, {balance}, {payment} placeholders' },
        { name: 'Send SMS', desc: 'Send one-off SMS using templates' },
      ],
      warnings: [
        'SMS requires Twilio integration (not yet configured)',
        'Email requires SendGrid integration (not yet configured)'
      ],
      whenToUse: 'Set up standard messages for payment reminders, welcome messages, etc.'
    },
    audit: {
      title: 'Audit Log',
      description: 'Track all changes made in the system.',
      functions: [
        { name: 'Action types', desc: 'INSERT (green), UPDATE (yellow), DELETE (red)' },
        { name: 'Record tracking', desc: 'See which table and record ID was affected' },
        { name: 'User tracking', desc: 'See who made the change' },
      ],
      warnings: [
        'Audit log only shows actions that were logged',
        'Direct database changes may not appear'
      ],
      whenToUse: 'Investigate issues, track user activity, compliance documentation.'
    },
    system: {
      title: 'System Settings',
      description: 'System information and administrative actions.',
      functions: [
        { name: 'Clear Storage', desc: 'Wipe local browser data and logout' },
        { name: 'Refresh Page', desc: 'Hard reload the current page' },
        { name: 'Reload All Data', desc: 'Re-fetch all data from database' },
        { name: 'Supabase link', desc: 'Open database admin panel' },
        { name: 'Sentry link', desc: 'Open error tracking dashboard' },
      ],
      warnings: [
        'Clear Storage will log you out',
        'Supabase gives full database access - be careful'
      ],
      whenToUse: 'Troubleshooting, clearing stuck states, accessing external tools.'
    },
  };

  const showToast = (message, type = 'success') => {
    setToast({ message, type });
    setTimeout(() => setToast(null), type === 'error' ? 10000 : 3000);
  };

  useEffect(() => { loadAllData(); }, []);

  const loadAllData = async () => {
    setLoading(true);
    try {
      const [dealers, users, feedback, audit, promos, templates, rules, staging, library] = await Promise.all([
        supabase.from('dealer_settings').select('*').order('id'),
        supabase.from('employees').select('*').order('name'),
        supabase.from('feedback').select('*').order('created_at', { ascending: false }),
        supabase.from('audit_log').select('*').order('created_at', { ascending: false }).limit(100),
        supabase.from('promo_codes').select('*').order('created_at', { ascending: false }),
        supabase.from('message_templates').select('*').order('name'),
        supabase.from('compliance_rules').select('*').order('state').order('category'),
        supabase.from('form_staging').select('*').order('created_at', { ascending: false }),
        supabase.from('form_library').select('*').order('created_at', { ascending: false }),
      ]);
      if (dealers.data) setAllDealers(dealers.data);
      if (users.data) setAllUsers(users.data);
      if (feedback.data) setFeedbackList(feedback.data);
      if (audit.data) setAuditLogs(audit.data);
      if (promos.data) setPromoCodes(promos.data);
      if (templates.data) setMessageTemplates(templates.data);
      if (rules.data) setComplianceRules(rules.data);
      if (staging.data) {
        console.log('[DevConsole] Loaded form_staging:', staging.data.length, 'forms');
        setFormStaging(staging.data);
      } else {
        console.log('[DevConsole] No staging data returned, error:', staging.error);
      }
      if (library.data) {
        console.log('[DevConsole] Loaded form_library:', library.data.length, 'forms');
        setFormLibrary(library.data);
      } else {
        console.log('[DevConsole] No library data returned, error:', library.error);
      }
    } catch (err) { console.error(err); }
    setLoading(false);
  };

  const tables = ['inventory', 'deals', 'bhph_loans', 'customers', 'employees', 'dealer_settings', 'feedback', 'audit_log', 'promo_codes', 'message_templates', 'compliance_rules', 'form_staging', 'form_library'];

  const loadTableData = async (tableName) => {
    setLoading(true);
    setSelectedIds([]);
    try {
      const { data, error } = await supabase.from(tableName).select('*').limit(200);
      if (error) throw error;
      setTableData(data || []);
      if (data?.length > 0) setTableColumns(Object.keys(data[0]));
      else setTableColumns([]);
    } catch (err) { showToast('Error: ' + err.message, 'error'); }
    setLoading(false);
  };

  const runSQL = async () => {
    setSqlError(null);
    setSqlResult(null);
    setLoading(true);
    try {
      const { data, error } = await supabase.rpc('run_sql', { query: sqlQuery });
      if (error) throw error;
      setSqlResult(data);
    } catch (err) {
      setSqlError(err.message);
    }
    setLoading(false);
  };

  const exportCSV = (data, name) => {
    if (!data?.length) return;
    const cols = Object.keys(data[0]);
    const csv = [cols.join(','), ...data.map(r => cols.map(c => JSON.stringify(r[c] ?? '')).join(','))].join('\n');
    const blob = new Blob([csv], { type: 'text/csv' });
    const a = document.createElement('a'); a.href = URL.createObjectURL(blob); a.download = `${name}_${Date.now()}.csv`; a.click();
    showToast('Exported ' + data.length + ' rows');
  };

  const logAudit = async (action, tableName, recordId, oldData = null, newData = null) => {
    await supabase.from('audit_log').insert({
      action, table_name: tableName, record_id: String(recordId),
      old_data: oldData, new_data: newData,
      dealer_id: dealerId, user_name: dealer?.dealer_name
    });
  };

  // Feedback
  const updateFeedbackStatus = async (id, status) => {
    await supabase.from('feedback').update({ status }).eq('id', id);
    setFeedbackList(feedbackList.map(f => f.id === id ? { ...f, status } : f));
    showToast('Status updated');
  };

  const deleteFeedback = async (id) => {
    await supabase.from('feedback').delete().eq('id', id);
    setFeedbackList(feedbackList.filter(f => f.id !== id));
    showToast('Deleted');
  };

  // Impersonate dealer
  const impersonateDealer = async (d) => {
    setDealer(d);
    localStorage.setItem('dealerId', d.id);
    setImpersonateModal(null);
    showToast('Switched to ' + d.dealer_name);
    if (storeRefresh) storeRefresh();
  };

  // Delete user
  const deleteUser = async (id) => {
    setLoading(true);
    try {
      const { error } = await supabase.from('employees').delete().eq('id', id);
      if (error) throw error;
      setAllUsers(allUsers.filter(u => u.id !== id));
      showToast('User deleted');
    } catch (err) {
      showToast('Error: ' + err.message, 'error');
    }
    setLoading(false);
    setConfirmDeleteUser(null);
  };

  // Delete dealer
  const deleteDealer = async (id) => {
    if (id === dealerId) { showToast('Cannot delete current dealer', 'error'); return; }
    setLoading(true);
    try {
      await supabase.from('inventory').delete().eq('dealer_id', id);
      await supabase.from('deals').delete().eq('dealer_id', id);
      await supabase.from('bhph_loans').delete().eq('dealer_id', id);
      await supabase.from('customers').delete().eq('dealer_id', id);
      await supabase.from('employees').delete().eq('dealer_id', id);
      await supabase.from('feedback').delete().eq('dealer_id', id);
      await supabase.from('audit_log').delete().eq('dealer_id', id);
      await supabase.from('promo_codes').delete().eq('dealer_id', id);
      await supabase.from('message_templates').delete().eq('dealer_id', id);
      const { error } = await supabase.from('dealer_settings').delete().eq('id', id);
      if (error) {
        showToast('Delete failed: ' + error.message, 'error');
      } else {
        setAllDealers(allDealers.filter(d => d.id !== id));
        showToast('Dealer deleted');
      }
    } catch (err) {
      showToast('Error: ' + err.message, 'error');
    }
    setLoading(false);
    setConfirmDelete(null);
  };

  // Bulk operations
  const bulkUpdateStatus = async () => {
    if (!selectedIds.length || !bulkStatus) return;
    setLoading(true);
    try {
      await supabase.from(selectedTable).update({ status: bulkStatus }).in('id', selectedIds);
      await logAudit('BULK_UPDATE', selectedTable, selectedIds.join(','), null, { status: bulkStatus });
      showToast(`Updated ${selectedIds.length} records`);
      loadTableData(selectedTable);
    } catch (err) { showToast('Error: ' + err.message, 'error'); }
    setLoading(false);
  };

  const bulkDelete = async () => {
    if (!selectedIds.length) return;
    if (!confirm(`Delete ${selectedIds.length} records? This cannot be undone.`)) return;
    setLoading(true);
    try {
      await supabase.from(selectedTable).delete().in('id', selectedIds);
      await logAudit('BULK_DELETE', selectedTable, selectedIds.join(','));
      showToast(`Deleted ${selectedIds.length} records`);
      loadTableData(selectedTable);
    } catch (err) { showToast('Error: ' + err.message, 'error'); }
    setLoading(false);
  };

  // Promo codes
  const savePromo = async () => {
    if (!promoModal) return;
    try {
      if (promoModal.id) {
        await supabase.from('promo_codes').update(promoModal).eq('id', promoModal.id);
        await logAudit('UPDATE', 'promo_codes', promoModal.id);
      } else {
        const { data } = await supabase.from('promo_codes').insert({ ...promoModal, dealer_id: dealerId }).select().single();
        await logAudit('INSERT', 'promo_codes', data.id);
      }
      showToast('Promo saved');
      setPromoModal(null);
      loadAllData();
    } catch (err) { showToast('Error: ' + err.message, 'error'); }
  };

  const togglePromo = async (id, active) => {
    await supabase.from('promo_codes').update({ active: !active }).eq('id', id);
    setPromoCodes(promoCodes.map(p => p.id === id ? { ...p, active: !active } : p));
    showToast(active ? 'Promo disabled' : 'Promo enabled');
  };

  // Message templates
  const saveTemplate = async () => {
    if (!templateModal) return;
    try {
      if (templateModal.id) {
        await supabase.from('message_templates').update(templateModal).eq('id', templateModal.id);
      } else {
        await supabase.from('message_templates').insert({ ...templateModal, dealer_id: dealerId });
      }
      showToast('Template saved');
      setTemplateModal(null);
      loadAllData();
    } catch (err) { showToast('Error: ' + err.message, 'error'); }
  };

  // SMS sender
  const sendSMS = async () => {
    if (!smsModal?.to || !smsModal?.message) return;
    showToast('SMS integration not configured yet', 'error');
  };

  // ========== FORM LIBRARY FUNCTIONS (3-Tab System) ==========

  const formCategories = ['deal', 'title', 'compliance', 'financing', 'tax'];
  const categoryColors = {
    deal: '#3b82f6',
    title: '#8b5cf6',
    compliance: '#ef4444',
    financing: '#22c55e',
    tax: '#f97316',
  };

  // === RULES TAB (compliance_rules) ===
  const saveRule = async () => {
    if (!ruleModal) return;
    setLoading(true);
    try {
      const ruleData = {
        rule_name: ruleModal.rule_name,
        state: ruleModal.state,
        category: ruleModal.category,
        deadline_days: parseInt(ruleModal.deadline_days) || 0,
        late_fee: parseFloat(ruleModal.late_fee) || 0,
        agency: ruleModal.agency,
        required_forms: ruleModal.required_forms,
        description: ruleModal.description,
        is_verified: ruleModal.is_verified || false,
      };
      if (ruleModal.id) {
        await supabase.from('compliance_rules').update(ruleData).eq('id', ruleModal.id);
        await logAudit('UPDATE', 'compliance_rules', ruleModal.id);
        showToast('Rule updated');
      } else {
        const { data } = await supabase.from('compliance_rules').insert(ruleData).select().single();
        await logAudit('INSERT', 'compliance_rules', data.id);
        showToast('Rule added');
      }
      setRuleModal(null);
      loadAllData();
    } catch (err) {
      showToast('Error: ' + err.message, 'error');
    }
    setLoading(false);
  };

  const deleteRule = async (id) => {
    if (!confirm('Delete this compliance rule?')) return;
    setLoading(true);
    try {
      await supabase.from('compliance_rules').delete().eq('id', id);
      await logAudit('DELETE', 'compliance_rules', id);
      showToast('Rule deleted');
      loadAllData();
    } catch (err) {
      showToast('Error: ' + err.message, 'error');
    }
    setLoading(false);
  };

  // === STAGING TAB (form_staging) ===
  const [stagingMapperModal, setStagingMapperModal] = useState(null);

  const analyzeForm = async (form) => {
    if (!form.storage_path) {
      showToast('Please upload a PDF first before analyzing', 'error');
      return;
    }
    setAnalyzingFormId(form.id);
    setLoading(true);

    try {
      // Build URL from storage_path
      let pdfUrl = form.storage_path
        ? `https://rlzudfinlxonpbwacxpt.supabase.co/storage/v1/object/public/${form.storage_bucket}/${form.storage_path}`
        : form.source_url;
      const isExternalUrl = !pdfUrl.includes('supabase.co/storage');

      // If it's an external URL, try to fetch and upload to our storage first
      if (isExternalUrl) {
        showToast(`Fetching PDF from external link...`);
        try {
          const response = await fetch(pdfUrl);
          if (!response.ok) {
            throw new Error(`Link returned ${response.status} - please upload manually`);
          }

          const contentType = response.headers.get('content-type') || '';
          if (!contentType.includes('pdf') && !contentType.includes('octet-stream')) {
            throw new Error(`Link is not a PDF (${contentType}) - please upload manually`);
          }

          const blob = await response.blob();
          const fileName = `${form.state}/${form.form_name.replace(/[^a-zA-Z0-9]/g, '_')}_${Date.now()}.pdf`;

          showToast(`Uploading to storage...`);
          const { error: uploadError } = await supabase.storage
            .from('form-pdfs')
            .upload(fileName, blob, { contentType: 'application/pdf' });

          if (uploadError) throw uploadError;

          const { data: { publicUrl } } = supabase.storage
            .from('form-pdfs')
            .getPublicUrl(fileName);

          // Update the form with our storage URL
          await supabase.from('form_staging').update({
            source_url: publicUrl,
            pdf_validated: true,
            url_validated: true,
            url_validated_at: new Date().toISOString()
          }).eq('id', form.id);

          pdfUrl = publicUrl;
          showToast(`PDF saved to storage. Analyzing...`);
        } catch (fetchErr) {
          // CORS or network error - try analyzing directly via edge function
          showToast(`Browser can't fetch link (CORS). Trying server-side...`);
          // The edge function will try to fetch it
        }
      } else {
        showToast(`Analyzing ${form.form_name}...`);
      }

      // Now analyze the PDF
      const { data, error } = await supabase.functions.invoke('map-form-fields', {
        body: { form_id: form.id, pdf_url: pdfUrl }
      });
      if (error) throw error;
      if (data?.error) throw new Error(data.error);

      const mapped = data?.mapped_count || 0;
      const total = data?.pdf_fields_found || 0;
      const pct = total > 0 ? Math.round((mapped / total) * 100) : 0;

      showToast(`Analysis complete - ${mapped}/${total} fields mapped (${pct}%)`);
      loadAllData();
    } catch (err) {
      showToast('Analysis failed: ' + err.message, 'error');
    }
    setAnalyzingFormId(null);
    setLoading(false);
  };

  const openStagingMapper = (form) => {
    // Convert field_mappings (array from map-form-fields) to the format the mapper expects
    // New format: field_mappings: [{ pdf_field, universal_fields: [], separator, confidence, status }]
    // Legacy format: field_mappings: [{ pdf_field, universal_field, confidence }]
    // UI format: field_mapping: { field_name: { fields: [], separator } | string }
    let detected_fields = form.detected_fields || [];
    let field_mapping = form.field_mapping || {};
    let dismissed_fields = form.dismissed_fields || {};

    console.log('[MAPPER DEBUG] Opening mapper for:', form.form_name);
    console.log('[MAPPER DEBUG] form.field_mappings count:', form.field_mappings?.length || 0);
    console.log('[MAPPER DEBUG] form.detected_fields count:', form.detected_fields?.length || 0);

    // If we have field_mappings array (from map-form-fields or save), convert it to UI format
    if (form.field_mappings && Array.isArray(form.field_mappings) && form.field_mappings.length > 0) {
      // Log all fields from field_mappings
      console.log('[MAPPER DEBUG] All field_mappings:', form.field_mappings.map(m => ({
        pdf_field: m.pdf_field || m.pdf_field_name,
        matched: m.matched,
        status: m.status,
        has_universal_field: !!m.universal_field,
        has_universal_fields: m.universal_fields?.length > 0
      })));

      // Count by status
      const statusCounts = {};
      form.field_mappings.forEach(m => {
        const status = m.status || (m.universal_field || m.universal_fields?.length > 0 ? 'mapped' : 'unmapped');
        statusCounts[status] = (statusCounts[status] || 0) + 1;
      });
      console.log('[MAPPER DEBUG] Status counts:', statusCounts);

      // Extract detected_fields, generating names for any fields missing them
      let unnamedCount = 0;
      detected_fields = form.field_mappings.map((m, idx) => {
        const name = m.pdf_field || m.pdf_field_name;
        if (!name || (typeof name === 'string' && name.trim() === '')) {
          unnamedCount++;
          return `Unnamed_Field_${idx + 1}`;
        }
        return name;
      });

      if (unnamedCount > 0) {
        console.log(`[MAPPER DEBUG] Warning: ${unnamedCount} fields had missing names and were auto-named`);
      }
      console.log('[MAPPER DEBUG] Extracted detected_fields count:', detected_fields.length);

      field_mapping = {};
      dismissed_fields = {};

      form.field_mappings.forEach((m, idx) => {
        // Use same naming logic as above
        let fieldName = m.pdf_field || m.pdf_field_name;
        if (!fieldName || (typeof fieldName === 'string' && fieldName.trim() === '')) {
          fieldName = `Unnamed_Field_${idx + 1}`;
        }

        // Track dismissed fields
        if (m.status === 'dismissed') {
          dismissed_fields[fieldName] = true;
          return;
        }

        // Handle new multi-field format (universal_fields array)
        if (m.universal_fields && Array.isArray(m.universal_fields) && m.universal_fields.length > 0) {
          field_mapping[fieldName] = {
            fields: m.universal_fields,
            separator: m.separator || ' '
          };
        }
        // Handle legacy single-field format (universal_field string)
        else if (m.universal_field) {
          field_mapping[fieldName] = {
            fields: [m.universal_field],
            separator: ' '
          };
        }
        // Unmapped fields - no entry in field_mapping, but they're still in detected_fields
      });

      console.log('[MAPPER DEBUG] Final field_mapping count:', Object.keys(field_mapping).length);
      console.log('[MAPPER DEBUG] Final dismissed_fields count:', Object.keys(dismissed_fields).length);
    }

    console.log('[MAPPER DEBUG] Setting modal with detected_fields:', detected_fields.length);

    setStagingMapperModal({
      ...form,
      detected_fields,
      field_mapping,
      dismissed_fields,
    });
  };

  const saveStagingMapping = async () => {
    if (!stagingMapperModal) return;
    setLoading(true);
    try {
      const dismissedFields = stagingMapperModal.dismissed_fields || {};
      const dismissedCount = Object.keys(dismissedFields).length;

      // Count mapped fields (fields with at least one mapping, excluding dismissed)
      const mappedCount = Object.entries(stagingMapperModal.field_mapping || {}).filter(([field, v]) => {
        if (dismissedFields[field]) return false; // Don't count dismissed
        if (!v) return false;
        if (typeof v === 'string') return !!v;
        return v.fields && v.fields.length > 0;
      }).length;

      // Total fields excluding dismissed
      const totalFields = (stagingMapperModal.detected_fields?.length || 1) - dismissedCount;
      const confidence = totalFields > 0 ? Math.round((mappedCount / totalFields) * 100) : 100;

      // Convert to field_mappings array format - now includes status
      const field_mappings = stagingMapperModal.detected_fields.map(field => {
        const isDismissed = dismissedFields[field];
        const mapping = stagingMapperModal.field_mapping?.[field];

        // Dismissed field
        if (isDismissed) {
          return {
            pdf_field: field,
            universal_fields: [],
            separator: ' ',
            confidence: 0,
            status: 'dismissed',
            matched: false
          };
        }

        // Handle both old string format and new multi-field format
        if (!mapping) {
          return {
            pdf_field: field,
            universal_fields: [],
            separator: ' ',
            confidence: 0,
            status: 'unmapped',
            matched: false
          };
        }
        if (typeof mapping === 'string') {
          return {
            pdf_field: field,
            universal_fields: [mapping],
            separator: ' ',
            confidence: 1.0,
            status: 'mapped',
            matched: true
          };
        }
        const hasMappings = mapping.fields?.length > 0;
        return {
          pdf_field: field,
          universal_fields: mapping.fields || [],
          separator: mapping.separator || ' ',
          confidence: hasMappings ? 1.0 : 0,
          status: hasMappings ? 'mapped' : 'unmapped',
          matched: hasMappings
        };
      });

      // DEBUG: Log what we're about to save
      const savePayload = {
        field_mappings: field_mappings,
        field_mapping: stagingMapperModal.field_mapping,
        dismissed_fields: dismissedFields,
        mapping_confidence: confidence,
        mapping_status: confidence >= 99 ? 'human_verified' : 'ai_suggested',
      };
      console.log('[SAVE DEBUG] Form ID:', stagingMapperModal.id);
      console.log('[SAVE DEBUG] Saving payload:', JSON.stringify(savePayload, null, 2));
      console.log('[SAVE DEBUG] field_mappings count:', field_mappings.length);
      console.log('[SAVE DEBUG] Mapped fields:', field_mappings.filter(f => f.matched).length);
      console.log('[SAVE DEBUG] Unmapped fields:', field_mappings.filter(f => !f.matched && f.status !== 'dismissed').length);

      const { data: saveResult, error: saveError } = await supabase
        .from('form_staging')
        .update(savePayload)
        .eq('id', stagingMapperModal.id)
        .select();

      console.log('[SAVE DEBUG] Save result:', saveResult);
      console.log('[SAVE DEBUG] Save error:', saveError);

      if (saveError) {
        throw new Error(`Database save failed: ${saveError.message}`);
      }

      // Verify the save by re-fetching the record
      const { data: verifyData, error: verifyError } = await supabase
        .from('form_staging')
        .select('id, form_name, field_mappings, field_mapping, mapping_confidence')
        .eq('id', stagingMapperModal.id)
        .single();

      console.log('[SAVE DEBUG] Verification fetch:', verifyData);
      if (verifyError) {
        console.error('[SAVE DEBUG] Verification error:', verifyError);
      } else {
        const verifyMapped = verifyData.field_mappings?.filter(f => f.matched)?.length || 0;
        console.log('[SAVE DEBUG] Verified mapped count:', verifyMapped);
        if (verifyMapped !== field_mappings.filter(f => f.matched).length) {
          console.error('[SAVE DEBUG] MISMATCH! Saved:', field_mappings.filter(f => f.matched).length, 'but DB has:', verifyMapped);
        }
      }

      showToast(`Mapping saved - ${confidence}% complete (${dismissedCount} dismissed)`);
      setStagingMapperModal(null);
      loadAllData();
    } catch (err) {
      showToast('Error: ' + err.message, 'error');
    }
    setLoading(false);
  };

  // Helper to normalize mapping value - supports both old string format and new multi-field format
  const getMappingFields = (mapping) => {
    if (!mapping) return [];
    if (typeof mapping === 'string') return mapping ? [mapping] : [];
    if (Array.isArray(mapping?.fields)) return mapping.fields;
    return [];
  };

  const getMappingSeparator = (mapping) => {
    if (!mapping || typeof mapping === 'string') return ' ';
    return mapping?.separator ?? ' ';
  };

  // Update single field mapping (replaces all fields with one)
  const updateStagingFieldMapping = (fieldName, contextPath) => {
    console.log('[MAPPING DEBUG] updateStagingFieldMapping called:', fieldName, '->', contextPath);
    setStagingMapperModal(prev => {
      const newMapping = {
        ...prev,
        field_mapping: {
          ...prev.field_mapping,
          [fieldName]: contextPath ? { fields: [contextPath], separator: ' ' } : null
        }
      };
      console.log('[MAPPING DEBUG] New field_mapping for', fieldName, ':', newMapping.field_mapping[fieldName]);
      return newMapping;
    });
  };

  // Add additional field to existing mapping
  const addStagingFieldMapping = (fieldName, contextPath) => {
    console.log('[MAPPING DEBUG] addStagingFieldMapping called:', fieldName, '+', contextPath);
    setStagingMapperModal(prev => {
      const existing = prev.field_mapping?.[fieldName];
      const currentFields = getMappingFields(existing);
      const separator = getMappingSeparator(existing);
      if (!contextPath || currentFields.includes(contextPath)) {
        console.log('[MAPPING DEBUG] Skipping - already exists or empty');
        return prev;
      }
      const newFields = [...currentFields, contextPath];
      console.log('[MAPPING DEBUG] New fields for', fieldName, ':', newFields);
      return {
        ...prev,
        field_mapping: {
          ...prev.field_mapping,
          [fieldName]: { fields: newFields, separator }
        }
      };
    });
  };

  // Remove a field from multi-field mapping
  const removeStagingFieldMapping = (fieldName, contextPath) => {
    setStagingMapperModal(prev => {
      const existing = prev.field_mapping?.[fieldName];
      const currentFields = getMappingFields(existing);
      const separator = getMappingSeparator(existing);
      const newFields = currentFields.filter(f => f !== contextPath);
      return {
        ...prev,
        field_mapping: {
          ...prev.field_mapping,
          [fieldName]: newFields.length > 0 ? { fields: newFields, separator } : null
        }
      };
    });
  };

  // Update separator for multi-field mapping
  const updateStagingSeparator = (fieldName, separator) => {
    setStagingMapperModal(prev => {
      const existing = prev.field_mapping?.[fieldName];
      const currentFields = getMappingFields(existing);
      return {
        ...prev,
        field_mapping: {
          ...prev.field_mapping,
          [fieldName]: { fields: currentFields, separator }
        }
      };
    });
  };

  // Dismiss an unmapped field (excludes from 100% calculation)
  const dismissField = (fieldName) => {
    setStagingMapperModal(prev => ({
      ...prev,
      dismissed_fields: {
        ...prev.dismissed_fields,
        [fieldName]: true
      },
      // Also clear any mapping for this field
      field_mapping: {
        ...prev.field_mapping,
        [fieldName]: null
      }
    }));
  };

  // Restore a dismissed field
  const restoreField = (fieldName) => {
    setStagingMapperModal(prev => {
      const { [fieldName]: _, ...restDismissed } = prev.dismissed_fields || {};
      return {
        ...prev,
        dismissed_fields: restDismissed
      };
    });
  };

  // Inline upload handler for staging forms
  const handleInlineUpload = async (form, file) => {
    if (!file) return;
    console.log('[INLINE UPLOAD] Starting upload for form:', form.id, form.form_name);
    console.log('[INLINE UPLOAD] File:', { name: file.name, type: file.type, size: file.size });

    setInlineUploadingId(form.id);
    try {
      const fileName = `${form.state}/${form.form_name.replace(/[^a-zA-Z0-9]/g, '_')}_${Date.now()}.pdf`;
      console.log('[INLINE UPLOAD] Uploading to form-pdfs/', fileName);

      const { data: uploadData, error: uploadError } = await supabase.storage
        .from('form-pdfs')
        .upload(fileName, file, { contentType: 'application/pdf', upsert: true });

      console.log('[INLINE UPLOAD] Storage result:', { uploadData, uploadError });
      if (uploadError) throw uploadError;

      const { data: urlData } = supabase.storage
        .from('form-pdfs')
        .getPublicUrl(fileName);

      const publicUrl = urlData.publicUrl;
      console.log('[INLINE UPLOAD] Public URL:', publicUrl);

      const { error: updateError } = await supabase.from('form_staging').update({
        source_url: publicUrl,
        pdf_validated: true,
        url_validated: true,
        url_validated_at: new Date().toISOString(),
        workflow_status: form.form_number_confirmed ? 'staging' : 'needs_form_number'
      }).eq('id', form.id);

      console.log('[INLINE UPLOAD] DB update error:', updateError);
      if (updateError) throw updateError;

      showToast(`PDF uploaded for ${form.form_name}`);
      loadAllData();
    } catch (err) {
      console.error('[INLINE UPLOAD] Error:', err);
      showToast(`Upload error: ${err.message}`, 'error');
    }
    setInlineUploadingId(null);
  };

  // Update form number and confirm it
  const updateFormNumber = async (form, newNumber) => {
    if (!newNumber.trim()) return;
    try {
      await supabase.from('form_staging').update({
        form_number: newNumber.trim().toUpperCase(),
        form_number_confirmed: true,
        workflow_status: form.source_url ? 'staging' : 'needs_upload'
      }).eq('id', form.id);
      showToast(`Form number updated to ${newNumber.toUpperCase()}`);
      loadAllData();
    } catch (err) {
      showToast(`Error: ${err.message}`, 'error');
    }
  };

  const promoteToLibrary = async (form, selectedLibrary) => {
    // Check if already promoted
    if (form.status === 'promoted') {
      showToast(`Form ${form.form_number || form.form_name} (${form.state}) is already promoted`, 'error');
      return;
    }

    setLoading(true);
    try {
      showToast('Promoting form to library...', 'info');

      // Build insert payload - log for debugging
      const insertPayload = {
        state: form.state,
        form_number: form.form_number ? String(form.form_number) : null,
        form_name: form.form_name,
        category: form.category || selectedLibrary || 'deal',
        source_agency: form.source_agency || 'State DMV',
        source_url: form.source_url || null,
        download_url: form.download_url || null,
        storage_bucket: form.storage_bucket || null,
        storage_path: form.storage_path || null,
        is_fillable: Boolean(form.is_fillable),
        detected_fields: Array.isArray(form.detected_fields) ? form.detected_fields : [],
        field_mappings: Array.isArray(form.field_mappings) ? form.field_mappings : [],
        mapping_confidence: Math.min(100, Math.max(0, parseInt(form.mapping_confidence) || 0)),
        mapping_status: form.mapping_status || 'pending',
        status: 'active',
        promoted_from: form.id
      };
      console.log('[PROMOTE DEBUG] Insert payload:', JSON.stringify(insertPayload, null, 2));

      // Insert into form_library
      const { data: insertedForm, error: insertError } = await supabase.from('form_library').insert(insertPayload).select().single();

      if (insertError) {
        console.error('[PROMOTE DEBUG] Insert error:', insertError);
        throw insertError;
      }

      // Update form_staging status to 'promoted'
      const { error: updateError } = await supabase.from('form_staging').update({
        status: 'promoted',
        promoted_at: new Date().toISOString()
      }).eq('id', form.id);

      if (updateError) throw updateError;

      const libraryLabels = { deal: 'Deal Docs', finance: 'Finance Docs', licensing: 'Licensing Docs', tax: 'Tax Docs', reporting: 'Reporting Docs', title: 'Title Docs', financing: 'Finance Docs', disclosure: 'Disclosures', registration: 'Registration', compliance: 'Compliance' };
      await logAudit('PROMOTE', 'form_library', insertedForm.id, null, { promoted_from: form.id, category: selectedLibrary });
      showToast(`Form promoted to ${libraryLabels[selectedLibrary] || selectedLibrary} library`);
      setPromoteModal(null);
      loadAllData();
    } catch (err) {
      showToast('Error: ' + err.message, 'error');
    }
    setLoading(false);
  };

  // Promote all pending staging forms to library
  const promoteAllForms = async () => {
    const pendingForms = formStaging.filter(f => f.status === 'pending');
    if (pendingForms.length === 0) {
      showToast('No pending forms to promote', 'info');
      return;
    }

    if (!confirm(`Promote all ${pendingForms.length} pending forms to library?`)) return;

    setLoading(true);
    let promoted = 0;
    let failed = 0;

    for (const form of pendingForms) {
      try {
        // Insert into form_library
        const { error: insertError } = await supabase.from('form_library').insert({
          state: form.state,
          form_number: form.form_number,
          form_name: form.form_name,
          category: form.category || 'deal',
          source_url: form.source_url,
          download_url: form.download_url,
          storage_bucket: form.storage_bucket,
          storage_path: form.storage_path,
          is_fillable: form.is_fillable || false,
          detected_fields: form.detected_fields || [],
          field_mappings: form.field_mappings || {},
          mapping_confidence: form.mapping_confidence || 0,
          mapping_status: form.mapping_status || 'unmapped',
          status: 'active',
          promoted_from: form.id
        });

        if (insertError) throw insertError;

        // Update form_staging status
        await supabase.from('form_staging').update({
          status: 'promoted',
          promoted_at: new Date().toISOString()
        }).eq('id', form.id);

        promoted++;
      } catch (err) {
        console.error(`Failed to promote ${form.form_name}:`, err);
        failed++;
      }
    }

    showToast(`Promoted ${promoted} forms${failed > 0 ? `, ${failed} failed` : ''}`);
    loadAllData();
    setLoading(false);
  };

  const [deleteStagedModal, setDeleteStagedModal] = useState(null);

  const deleteStagedForm = async (form) => {
    setLoading(true);
    try {
      // Delete from form_staging
      await supabase.from('form_staging').delete().eq('id', form.id);

      await logAudit('DELETE', 'form_staging', form.id, { form_number: form.form_number, form_name: form.form_name });
      showToast('Form deleted from staging');
      setDeleteStagedModal(null);
      loadAllData();
    } catch (err) {
      showToast('Error: ' + err.message, 'error');
    }
    setLoading(false);
  };

  // Manual form upload to staging
  const uploadFormToStaging = async () => {
    if (!uploadFormModal) return;
    if (!uploadFormModal.state || !uploadFormModal.form_number || !uploadFormModal.form_name) {
      showToast('State, form number, and form name are required', 'error');
      return;
    }
    setLoading(true);
    try {
      let sourceUrl = uploadFormModal.source_url || null;
      let pdfValidated = false;
      let urlValidated = false;

      // If a file was uploaded, upload it to Supabase storage
      if (uploadFormModal.file) {
        console.log('[UPLOAD] Starting file upload:', {
          name: uploadFormModal.file.name,
          type: uploadFormModal.file.type,
          size: uploadFormModal.file.size
        });

        const fileExt = uploadFormModal.file.name.split('.').pop()?.toLowerCase() || 'pdf';
        const state = uploadFormModal.state.toUpperCase();
        const safeFormNumber = uploadFormModal.form_number.replace(/[^a-zA-Z0-9-]/g, '_');
        // Store in state subfolder for organization
        const fileName = `${state}/${safeFormNumber}_${Date.now()}.${fileExt}`;

        console.log('[UPLOAD] Uploading to form-pdfs/', fileName);

        const { data: uploadData, error: uploadError } = await supabase.storage
          .from('form-pdfs')
          .upload(fileName, uploadFormModal.file, {
            contentType: 'application/pdf',
            upsert: true
          });

        console.log('[UPLOAD] Storage result:', { uploadData, uploadError });

        if (uploadError) {
          console.error('[UPLOAD] Upload error:', uploadError);
          showToast('PDF upload failed: ' + uploadError.message, 'error');
        } else {
          const { data: urlData } = supabase.storage.from('form-pdfs').getPublicUrl(fileName);
          sourceUrl = urlData.publicUrl;
          pdfValidated = true; // We uploaded it ourselves, so it's valid
          urlValidated = true;
          console.log('[UPLOAD] Public URL:', sourceUrl);
        }
      }

      console.log('[UPLOAD] Inserting form_staging record:', {
        form_number: uploadFormModal.form_number.toUpperCase().trim(),
        source_url: sourceUrl,
        pdf_validated: pdfValidated
      });

      const { data: newForm, error: insertError } = await supabase.from('form_staging').insert({
        form_number: uploadFormModal.form_number.toUpperCase().trim(),
        form_name: uploadFormModal.form_name.trim(),
        state: uploadFormModal.state.toUpperCase(),
        source_url: sourceUrl,
        pdf_validated: pdfValidated,
        url_validated: urlValidated,
        url_validated_at: pdfValidated ? new Date().toISOString() : null,
        status: 'pending',
        workflow_status: 'staging',
        ai_confidence: null, // Manual upload - no AI confidence
        ai_is_current_version: true, // Assume manual uploads are current
      }).select().single();

      console.log('[UPLOAD] DB insert result:', { newForm, insertError });

      if (insertError) throw insertError;

      await logAudit('INSERT', 'form_staging', newForm.id, null, { manual_upload: true });
      showToast('Form uploaded to staging');
      setUploadFormModal(null);
      loadAllData();
    } catch (err) {
      showToast('Error: ' + err.message, 'error');
    }
    setLoading(false);
  };

  // Key states for "All States" discovery
  const keyStates = ['UT', 'ID', 'NV', 'AZ', 'CO', 'WY', 'MT', 'NM', 'CA', 'TX', 'OR', 'WA', 'FL', 'GA', 'NC', 'OH', 'PA', 'NY', 'IL', 'MI'];
  const allStatesOptions = ['AL','AK','AZ','AR','CA','CO','CT','DE','FL','GA','HI','ID','IL','IN','IA','KS','KY','LA','ME','MD','MA','MI','MN','MS','MO','MT','NE','NV','NH','NJ','NM','NY','NC','ND','OH','OK','OR','PA','RI','SC','SD','TN','TX','UT','VT','VA','WA','WV','WI','WY','DC'];

  // Fix approved forms that are missing PDFs (storage_path is null)
  const [fixingPDFs, setFixingPDFs] = useState(false);
  const [fixProgress, setFixProgress] = useState('');

  const fixMissingPDFs = async () => {
    // Find approved forms missing storage_path
    const formsToFix = formLibrary.filter(f => !f.storage_path && f.source_url);

    if (formsToFix.length === 0) {
      showToast('All approved forms already have PDFs stored', 'info');
      return;
    }

    setFixingPDFs(true);
    let fixed = 0;
    let failed = 0;

    for (let i = 0; i < formsToFix.length; i++) {
      const form = formsToFix[i];
      setFixProgress(`Downloading ${form.form_number} (${i + 1}/${formsToFix.length})...`);

      try {
        const { data, error } = await supabase.functions.invoke('promote-form', {
          body: { form_id: form.id, doc_type: form.doc_type || 'deal' }
        });

        if (error || !data?.success) {
          console.error(`Failed to fix ${form.form_number}:`, error || data?.error);
          failed++;
        } else {
          fixed++;
        }
      } catch (err) {
        console.error(`Error fixing ${form.form_number}:`, err);
        failed++;
      }
    }

    setFixProgress('');
    setFixingPDFs(false);
    showToast(`Fixed ${fixed} forms${failed > 0 ? `, ${failed} failed` : ''}`);
    loadAllData();
  };

  const formsNeedingFix = formLibrary.filter(f => !f.storage_path && f.source_url).length;

  const runAIResearch = async () => {
    setAiResearching(true);
    setDiscoverProgress('');

    try {
      let totalFormsFound = 0;
      let totalFormsAdded = 0;
      let totalFormsSkipped = 0;
      let statesProcessed = 0;

      if (discoverState === 'all') {
        // Discover for all key states
        const statesToProcess = keyStates;
        for (let i = 0; i < statesToProcess.length; i++) {
          const state = statesToProcess[i];
          setDiscoverProgress(`Discovering ${state} forms... (${i + 1}/${statesToProcess.length})`);

          try {
            const response = await supabase.functions.invoke('discover-state-forms', {
              body: { state, dealer_id: dealerId }
            });

            if (response.data) {
              totalFormsFound += response.data.forms_found || 0;
              totalFormsAdded += response.data.forms_added || 0;
              totalFormsSkipped += response.data.forms_skipped || 0;
            }
            statesProcessed++;
          } catch (err) {
            console.error(`Failed to discover for ${state}:`, err);
          }
        }

        setDiscoverProgress('');
        const msg = `Found ${totalFormsFound} forms, ${totalFormsAdded} valid (${totalFormsSkipped} skipped due to broken links) across ${statesProcessed} states`;
        showToast(msg);
      } else {
        // Discover for single state
        setDiscoverProgress(`Discovering ${discoverState} forms...`);

        const response = await supabase.functions.invoke('discover-state-forms', {
          body: { state: discoverState, dealer_id: dealerId }
        });

        if (response.error) {
          throw new Error(response.error.message || 'Edge function failed');
        }

        if (response.data?.error) {
          throw new Error(response.data.error);
        }

        const { forms_found = 0, forms_added = 0, forms_skipped = 0, skipped_reasons } = response.data || {};
        setDiscoverProgress('');

        // Show detailed result
        let msg = `Found ${forms_found} forms for ${discoverState}. ${forms_added} valid, ${forms_skipped} skipped.`;
        if (skipped_reasons?.length > 0) {
          console.log('Skipped forms:', skipped_reasons);
        }
        showToast(msg);
      }

      loadAllData();
    } catch (err) {
      setDiscoverProgress('');
      showToast('AI Research failed: ' + err.message, 'error');
    }
    setAiResearching(false);
  };

  // Check for updates to existing forms
  const checkForUpdates = async () => {
    const stateToCheck = discoverState === 'all' ? (dealer?.state || 'UT') : discoverState;
    setCheckingUpdates(true);
    setDiscoverProgress(`Checking ${stateToCheck} for updates...`);

    try {
      // Get session for auth token
      const { data: { session } } = await supabase.auth.getSession();

      const response = await fetch(
        import.meta.env.VITE_SUPABASE_URL + '/functions/v1/check-form-updates',
        {
          method: 'POST',
          headers: {
            'Content-Type': 'application/json',
            'Authorization': 'Bearer ' + (session?.access_token || import.meta.env.VITE_SUPABASE_ANON_KEY)
          },
          body: JSON.stringify({ state: stateToCheck, dealer_id: dealerId })
        }
      );

      if (!response.ok) {
        const errorText = await response.text();
        throw new Error(`HTTP ${response.status}: ${errorText}`);
      }

      const data = await response.json();
      if (data.error) throw new Error(data.error);

      setDiscoverProgress('');
      setUpdateCheckModal({
        state: stateToCheck,
        ...data.scan_results,
        summary: data.summary
      });
    } catch (err) {
      setDiscoverProgress('');
      showToast('Check failed: ' + err.message, 'error');
    }
    setCheckingUpdates(false);
  };

  // Add new form from update check results
  const addFormFromCheck = async (form) => {
    try {
      const { error } = await supabase.from('form_staging').insert({
        form_name: form.form_name,
        form_number: form.form_number,
        state: updateCheckModal.state,
        source_url: form.source_url,
        category: form.category,
        description: form.description,
        workflow_status: 'staging',
        ai_discovered: true,
        url_validated: form.is_pdf,
        dealer_id: dealerId
      });
      if (error) throw error;

      // Create state_updates record for tracking
      const stateUpdateData = {
        state: updateCheckModal.state,
        title: 'New Form Added: ' + (form.form_name || form.form_number),
        summary: 'Form ' + (form.form_number || form.form_name) + ' was discovered and added to the library.',
        update_type: 'new_form',
        source_url: form.source_url,
        forms_affected: [form.form_number].filter(Boolean),
        importance: 'normal',
        is_read: false
      };
      console.log('Inserting to state_updates:', stateUpdateData);
      const { data: stateData, error: stateError } = await supabase.from('state_updates').insert(stateUpdateData).select();
      console.log('state_updates insert result:', { data: stateData, error: stateError });
      if (stateError) {
        console.error('state_updates insert failed:', stateError);
        alert('Failed to create state update: ' + stateError.message);
      }

      // Remove from modal list
      setUpdateCheckModal(prev => ({
        ...prev,
        new_forms: prev.new_forms.filter(f => f.source_url !== form.source_url)
      }));
      showToast(`Added ${form.form_name || form.form_number}`);
      loadAllData();
    } catch (err) {
      showToast('Failed to add: ' + err.message, 'error');
    }
  };

  // Update existing form URL from check results
  const updateFormFromCheck = async (update) => {
    try {
      const { error } = await supabase.from('form_staging').update({
        source_url: update.found.source_url,
        url_validated: update.found.is_pdf,
        url_validated_at: new Date().toISOString()
      }).eq('id', update.existing.id);
      if (error) throw error;

      // Create state_updates record for tracking
      const reason = update.reason || 'URL or content may have changed.';
      const stateUpdateData = {
        state: updateCheckModal.state,
        title: 'Form Updated: ' + (update.existing.form_name || update.existing.form_number),
        summary: 'Form ' + (update.existing.form_number || update.existing.form_name) + ' has a new version. ' + reason,
        update_type: 'form_update',
        source_url: update.found.source_url,
        forms_affected: [update.existing.form_number].filter(Boolean),
        importance: 'normal',
        is_read: false
      };
      console.log('Inserting to state_updates:', stateUpdateData);
      const { data: stateData, error: stateError } = await supabase.from('state_updates').insert(stateUpdateData).select();
      console.log('state_updates insert result:', { data: stateData, error: stateError });
      if (stateError) {
        console.error('state_updates insert failed:', stateError);
        alert('Failed to create state update: ' + stateError.message);
      }

      // Remove from modal list
      setUpdateCheckModal(prev => ({
        ...prev,
        potential_updates: prev.potential_updates.filter(u => u.existing.id !== update.existing.id)
      }));
      showToast(`Updated ${update.existing.form_name || update.existing.form_number}`);
      loadAllData();
    } catch (err) {
      showToast('Failed to update: ' + err.message, 'error');
    }
  };

  // Ignore update (just remove from UI)
  const ignoreUpdate = (update) => {
    setUpdateCheckModal(prev => ({
      ...prev,
      potential_updates: prev.potential_updates.filter(u => u.existing.id !== update.existing.id)
    }));
  };

  // Open post update form with pre-filled data
  const openPostUpdateForm = () => {
    const state = updateCheckModal?.state || 'Unknown';
    const newCount = updateCheckModal?.new_forms?.length || 0;
    const updateCount = updateCheckModal?.potential_updates?.length || 0;
    const date = new Date().toLocaleDateString();

    // Build summary from results
    let summary = `Scan completed for ${state}.\n`;
    if (newCount > 0) summary += `- ${newCount} new form${newCount > 1 ? 's' : ''} discovered\n`;
    if (updateCount > 0) summary += `- ${updateCount} form${updateCount > 1 ? 's' : ''} may have updates available\n`;
    if (newCount === 0 && updateCount === 0) summary += '- All forms are up to date';

    // Collect affected form numbers
    const formsAffected = [
      ...(updateCheckModal?.new_forms || []).map(f => f.form_number).filter(Boolean),
      ...(updateCheckModal?.potential_updates || []).map(u => u.existing.form_number).filter(Boolean)
    ];

    setPostUpdateForm({
      title: `Form Updates for ${state} - ${date}`,
      summary: summary.trim(),
      update_type: newCount > 0 ? 'new_form' : 'form_update',
      importance: (newCount + updateCount) > 5 ? 'high' : 'normal',
      source_url: '',
      forms_affected: formsAffected
    });
  };

  // Post to state_updates table
  const postStateUpdate = async () => {
    if (!postUpdateForm?.title) {
      showToast('Title is required', 'error');
      return;
    }
    setLoading(true);
    try {
      const { error } = await supabase.from('state_updates').insert({
        state: updateCheckModal?.state,
        title: postUpdateForm.title,
        summary: postUpdateForm.summary,
        update_type: postUpdateForm.update_type,
        importance: postUpdateForm.importance,
        source_url: postUpdateForm.source_url || null,
        forms_affected: postUpdateForm.forms_affected || [],
        is_read: false,
        dealer_id: dealerId
      });
      if (error) throw error;
      showToast('Update posted to State Updates');
      setPostUpdateForm(null);
    } catch (err) {
      showToast('Failed to post: ' + err.message, 'error');
    }
    setLoading(false);
  };

  // Save newsletter or regulatory update to state_updates
  const saveNewsItem = async (item, type) => {
    try {
      const stateUpdateData = {
        state: updateCheckModal?.state,
        title: item.title,
        summary: item.snippet || item.title,
        update_type: type, // 'newsletter' or 'regulation_change'
        source_url: item.url,
        importance: item.keywords_found?.length > 2 ? 'high' : 'normal',
        is_read: false
      };
      console.log('Saving news item to state_updates:', stateUpdateData);
      const { data, error } = await supabase.from('state_updates').insert(stateUpdateData).select();
      console.log('Save result:', { data, error });
      if (error) throw error;
      showToast(`Saved: ${item.title.substring(0, 40)}...`);

      // Remove from modal list
      if (type === 'newsletter') {
        setUpdateCheckModal(prev => ({
          ...prev,
          newsletters: prev.newsletters?.filter(n => n.url !== item.url)
        }));
      } else {
        setUpdateCheckModal(prev => ({
          ...prev,
          regulatory_updates: prev.regulatory_updates?.filter(r => r.url !== item.url)
        }));
      }
    } catch (err) {
      console.error('Failed to save news item:', err);
      alert('Failed to save: ' + err.message);
    }
  };

  const getFilteredStaging = () => {
    let filtered = formStaging;

    // Apply state filter first
    if (stagingStateFilter !== 'all') {
      filtered = filtered.filter(f => f.state === stagingStateFilter);
    }

    // Then apply status filter
    if (stagingFilter === 'all') return filtered;
    if (stagingFilter === 'needs_number') return filtered.filter(f => !f.form_number_confirmed);
    if (stagingFilter === 'needs_pdf') return filtered.filter(f => !f.storage_path || f.workflow_status === 'needs_upload');
    if (stagingFilter === 'needs_mapping') return filtered.filter(f => f.storage_path && !f.field_mappings?.length && (f.mapping_confidence || 0) < 99);
    if (stagingFilter === 'ready') return filtered.filter(f => ((f.field_mappings?.length > 0) || (f.mapping_confidence || 0) >= 99) && f.form_number_confirmed && f.storage_path && f.workflow_status !== 'production' && f.status !== 'approved');
    if (stagingFilter === 'production') return filtered.filter(f => f.workflow_status === 'production' || f.status === 'active');
    return filtered.filter(f => f.status === stagingFilter);
  };

  // Get unique states from staging for filter dropdown
  const stagingStates = [...new Set(formStaging.map(f => f.state))].sort();

  // Bulk delete all forms for a state
  const bulkDeleteStagingState = async (state) => {
    setLoading(true);
    try {
      const formsToDelete = formStaging.filter(f => f.state === state);

      // Delete all staging forms for this state
      await supabase.from('form_staging').delete().eq('state', state);

      await logAudit('BULK_DELETE', 'form_staging', `state:${state}`, { count: formsToDelete.length });
      showToast(`Deleted ${formsToDelete.length} forms for ${state}`);
      setConfirmBulkDelete(null);
      setStagingStateFilter('all');
      loadAllData();
    } catch (err) {
      showToast('Error: ' + err.message, 'error');
    }
    setLoading(false);
  };

  // === LIBRARY TAB (form_library) ===
  const saveLibraryForm = async () => {
    if (!formModal) return;
    setLoading(true);
    try {
      const formData = {
        form_number: formModal.form_number,
        form_name: formModal.form_name,
        state: formModal.state,
        county: formModal.county,
        category: formModal.category,
        source_url: formModal.source_url,
        description: formModal.description,
        is_active: formModal.is_active ?? true,
      };
      if (formModal.id) {
        await supabase.from('form_library').update(formData).eq('id', formModal.id);
        await logAudit('UPDATE', 'form_library', formModal.id);
        showToast('Form updated');
      } else {
        const { data } = await supabase.from('form_library').insert({
          ...formData,
          field_mapping: {},
          mapping_confidence: 0,
        }).select().single();
        await logAudit('INSERT', 'form_library', data.id);
        showToast('Form added');
      }
      setFormModal(null);
      loadAllData();
    } catch (err) {
      showToast('Error: ' + err.message, 'error');
    }
    setLoading(false);
  };

  const removeFromLibrary = async (id) => {
    if (!confirm('Remove this form from the library?')) return;
    setLoading(true);
    try {
      // Get the library form first to find its promoted_from id
      const { data: libForm } = await supabase.from('form_library').select('promoted_from').eq('id', id).single();

      // Delete from form_library
      await supabase.from('form_library').delete().eq('id', id);

      // If it was promoted from staging, update the staging record back to pending
      if (libForm?.promoted_from) {
        await supabase.from('form_staging').update({ status: 'pending', promoted_at: null }).eq('id', libForm.promoted_from);
      }

      await logAudit('DEMOTE', 'form_library', id, { status: 'active' }, { status: 'deleted' });
      showToast('Form removed from library');
      loadAllData();
    } catch (err) {
      showToast('Error: ' + err.message, 'error');
    }
    setLoading(false);
  };

  const getFilteredLibrary = () => {
    let filtered = formLibrary;

    // Apply state filter first
    if (libraryStateFilter !== 'all') {
      filtered = filtered.filter(f => f.state === libraryStateFilter);
    }

    // Then apply category/status filter
    if (formFilter === 'all') return filtered;
    if (formFilter === 'needs_mapping') return filtered.filter(f => (f.mapping_confidence || 0) < 99);
    if (formFilter === 'ready') return filtered.filter(f => (f.mapping_confidence || 0) >= 99);
    return filtered.filter(f => f.category === formFilter);
  };

  // Get unique states from library for filter dropdown
  const libraryStates = [...new Set(formLibrary.map(f => f.state))].sort();

  // === FIELD MAPPER - Maps to ACTUAL database columns ===
  // These field names match what buildFormContext() creates in fill-deal-documents
  const fieldContextOptions = [
    {
      group: 'Buyer (from deals table)',
      fields: [
        'buyer_name',        // deal.purchaser_name
        'buyer_first',       // parsed from purchaser_name
        'buyer_last',        // parsed from purchaser_name
        'buyer_address',     // deal.address
        'buyer_city',        // deal.city
        'buyer_state',       // deal.state
        'buyer_zip',         // deal.zip
        'buyer_phone',       // deal.phone
        'buyer_email',       // deal.email
        'buyer_dl_number',   // customer.dl_number
        'buyer_dl_state',    // customer.dl_state
        'purchaser_name',    // alias
        'customer_name',     // alias
      ]
    },
    {
      group: 'Vehicle (from inventory)',
      fields: [
        'vehicle_year',      // inventory.year
        'vehicle_make',      // inventory.make
        'vehicle_model',     // inventory.model
        'vehicle_vin',       // inventory.vin
        'vin',               // alias
        'vehicle_miles',     // inventory.miles
        'odometer',          // alias for miles
        'mileage',           // alias for miles
        'vehicle_color',     // inventory.color
        'color',             // alias
        'vehicle_stock',     // inventory.stock_number
        'stock_number',      // alias
        'year',              // alias
        'make',              // alias
        'model',             // alias
      ]
    },
    {
      group: 'Dealer (from dealer_settings)',
      fields: [
        'dealer_name',       // dealer_settings.dealer_name
        'dealer_address',    // dealer_settings.address
        'dealer_city',       // dealer_settings.city
        'dealer_state',      // dealer_settings.state
        'dealer_zip',        // dealer_settings.zip
        'dealer_phone',      // dealer_settings.phone
        'dealer_license',    // dealer_settings.dealer_license
        'seller_name',       // alias for dealer_name
        'seller_address',    // alias
      ]
    },
    {
      group: 'Pricing (from deals)',
      fields: [
        'sale_price',        // deal.sale_price or deal.price
        'price',             // deal.price
        'down_payment',      // deal.down_payment
        'doc_fee',           // deal.doc_fee
        'sales_tax',         // deal.sales_tax
        'total_price',       // deal.total_price
        'total_sale',        // deal.total_sale
        'balance_due',       // deal.balance_due
      ]
    },
    {
      group: 'Financing (from deals)',
      fields: [
        'amount_financed',   // deal.amount_financed
        'apr',               // deal.apr
        'interest_rate',     // deal.interest_rate
        'term_months',       // deal.term_months
        'monthly_payment',   // deal.monthly_payment
        'first_payment_date',// deal.first_payment_date
        'total_of_payments', // deal.total_of_payments
        'finance_charge',    // calculated
        'credit_score',      // deal.credit_score
      ]
    },
    {
      group: 'Trade-In (from deals)',
      fields: [
        'trade_description', // deal.trade_description
        'trade_value',       // deal.trade_value
        'trade_acv',         // deal.trade_acv
        'trade_allowance',   // deal.trade_allowance
        'trade_payoff',      // deal.trade_payoff
        'trade_vin',         // deal.trade_vin
        'negative_equity',   // deal.negative_equity
        'net_trade',         // calculated: trade_value - trade_payoff
      ]
    },
    {
      group: 'Add-Ons (from deals)',
      fields: [
        'gap_insurance',     // deal.gap_insurance
        'extended_warranty', // deal.extended_warranty
        'protection_package',// deal.protection_package
        'tire_wheel',        // deal.tire_wheel
        'accessory_1_desc',  // deal.accessory_1_desc
        'accessory_1_price', // deal.accessory_1_price
        'accessory_2_desc',  // deal.accessory_2_desc
        'accessory_2_price', // deal.accessory_2_price
        'accessory_3_desc',  // deal.accessory_3_desc
        'accessory_3_price', // deal.accessory_3_price
      ]
    },
    {
      group: 'Other',
      fields: [
        'date_of_sale',      // deal.date_of_sale
        'sale_date',         // alias
        'today',             // current date
        'salesman',          // deal.salesman
        'deal_type',         // deal.deal_type
        'deal_status',       // deal.deal_status
        'deal_number',       // deal.id
        'lienholder_name',   // dealer for BHPH
        'lienholder_address',// dealer address for BHPH
      ]
    },
  ];

  const saveFieldMapping = async () => {
    if (!fieldMapperModal) return;
    setLoading(true);
    try {
      // Calculate confidence based on mapped fields
      const mappedCount = Object.values(fieldMapperModal.field_mapping || {}).filter(v => v).length;
      const totalFields = fieldMapperModal.detected_fields?.length || 1;
      const confidence = Math.round((mappedCount / totalFields) * 100);

      await supabase.from('form_library').update({
        field_mapping: fieldMapperModal.field_mapping,
        mapping_confidence: confidence,
      }).eq('id', fieldMapperModal.id);

      await logAudit('UPDATE', 'form_library', fieldMapperModal.id, null, { mapping_confidence: confidence });
      showToast(`Mapping saved - ${confidence}% complete`);
      setFieldMapperModal(null);
      loadAllData();
    } catch (err) {
      showToast('Error: ' + err.message, 'error');
    }
    setLoading(false);
  };

  const updateFieldMapping = (fieldName, contextPath) => {
    setFieldMapperModal(prev => ({
      ...prev,
      field_mapping: {
        ...prev.field_mapping,
        [fieldName]: contextPath
      }
    }));
  };

  // ========== END FORM LIBRARY FUNCTIONS ==========

  // BHPH helpers
  const lateLoans = bhphLoans?.filter(l => l.status === 'Active' && l.days_late > 0) || [];
  const repoQueue = bhphLoans?.filter(l => l.status === 'Active' && l.days_late > 30) || [];

  const sections = [
    { id: 'dashboard', label: 'Dashboard' },
    { id: 'feedback', label: 'Feedback (' + feedbackList.filter(f => f.status === 'new').length + ')' },
    { id: 'dealers', label: 'Dealers' },
    { id: 'users', label: 'Users' },
    { id: 'forms', label: 'Form Library (' + formLibrary.length + ')' },
    { id: 'data', label: 'Data Browser' },
    { id: 'bulk', label: 'Bulk Ops' },
    { id: 'sql', label: 'SQL Runner' },
    { id: 'bhph', label: 'BHPH Command' },
    { id: 'promos', label: 'Promo Codes' },
    { id: 'templates', label: 'Templates' },
    { id: 'audit', label: 'Audit Log' },
    { id: 'system', label: 'System' },
  ];

  const inputStyle = { backgroundColor: '#3f3f46', color: '#fff', padding: '10px 12px', borderRadius: '6px', border: 'none', width: '100%' };
  const btnPrimary = { backgroundColor: '#3b82f6', border: 'none', padding: '10px 20px', borderRadius: '6px', color: '#fff', fontWeight: '600', cursor: 'pointer' };
  const btnSuccess = { backgroundColor: '#22c55e', border: 'none', padding: '10px 20px', borderRadius: '6px', color: '#fff', fontWeight: '600', cursor: 'pointer' };
  const btnDanger = { backgroundColor: '#ef4444', border: 'none', padding: '10px 20px', borderRadius: '6px', color: '#fff', fontWeight: '600', cursor: 'pointer' };
  const btnSecondary = { backgroundColor: '#3f3f46', border: 'none', padding: '10px 20px', borderRadius: '6px', color: '#fff', cursor: 'pointer' };
  const cardStyle = { backgroundColor: '#27272a', borderRadius: '12px', padding: '20px', marginBottom: '16px' };

  // Help Button Component
  const HelpButton = () => (
    <button 
      onClick={() => setShowHelp(true)} 
      style={{ 
        backgroundColor: '#3f3f46', 
        border: 'none', 
        padding: '8px 12px', 
        borderRadius: '6px', 
        color: '#a1a1aa', 
        cursor: 'pointer',
        fontSize: '13px',
        display: 'flex',
        alignItems: 'center',
        gap: '6px'
      }}
    >
      <span style={{ fontSize: '16px' }}>?</span> Help
    </button>
  );

  // Help Modal Component
  const HelpModal = () => {
    const help = helpContent[activeSection];
    if (!help || !showHelp) return null;
    return (
      <div style={{ position: 'fixed', inset: 0, backgroundColor: 'rgba(0,0,0,0.7)', display: 'flex', alignItems: 'center', justifyContent: 'center', zIndex: 100, padding: '20px' }}>
        <div style={{ backgroundColor: '#27272a', borderRadius: '12px', padding: '24px', maxWidth: '500px', width: '100%', maxHeight: '80vh', overflowY: 'auto' }}>
          <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'center', marginBottom: '16px' }}>
            <h3 style={{ fontSize: '20px', fontWeight: '700', margin: 0 }}>{help.title}</h3>
            <button onClick={() => setShowHelp(false)} style={{ background: 'none', border: 'none', color: '#71717a', fontSize: '24px', cursor: 'pointer' }}>×</button>
          </div>
          
          <p style={{ color: '#a1a1aa', marginBottom: '20px', lineHeight: '1.5' }}>{help.description}</p>
          
          <div style={{ marginBottom: '20px' }}>
            <h4 style={{ fontSize: '14px', fontWeight: '600', color: '#22c55e', marginBottom: '10px', textTransform: 'uppercase', letterSpacing: '0.5px' }}>Functions</h4>
            {help.functions.map((f, i) => (
              <div key={i} style={{ marginBottom: '10px', paddingLeft: '12px', borderLeft: '2px solid #3f3f46' }}>
                <div style={{ fontWeight: '600', marginBottom: '2px' }}>{f.name}</div>
                <div style={{ color: '#a1a1aa', fontSize: '13px' }}>{f.desc}</div>
              </div>
            ))}
          </div>
          
          <div style={{ marginBottom: '20px' }}>
            <h4 style={{ fontSize: '14px', fontWeight: '600', color: '#3b82f6', marginBottom: '10px', textTransform: 'uppercase', letterSpacing: '0.5px' }}>When to Use</h4>
            <p style={{ color: '#a1a1aa', fontSize: '14px', lineHeight: '1.5' }}>{help.whenToUse}</p>
          </div>
          
          {help.warnings.length > 0 && (
            <div style={{ backgroundColor: '#450a0a', border: '1px solid #ef4444', borderRadius: '8px', padding: '12px' }}>
              <h4 style={{ fontSize: '14px', fontWeight: '600', color: '#ef4444', marginBottom: '8px', textTransform: 'uppercase', letterSpacing: '0.5px' }}>Warnings</h4>
              <ul style={{ margin: 0, paddingLeft: '20px' }}>
                {help.warnings.map((w, i) => (
                  <li key={i} style={{ color: '#fca5a5', fontSize: '13px', marginBottom: '4px' }}>{w}</li>
                ))}
              </ul>
            </div>
          )}
          
          <button onClick={() => setShowHelp(false)} style={{ ...btnSecondary, width: '100%', marginTop: '20px' }}>Got it</button>
        </div>
      </div>
    );
  };

  // ACCESS CONTROL: Block non-developers
  if (!isDeveloper) {
    return (
      <div style={{ minHeight: '100vh', backgroundColor: '#18181b', display: 'flex', alignItems: 'center', justifyContent: 'center', color: '#fff' }}>
        <div style={{ textAlign: 'center', padding: '40px' }}>
          <div style={{ fontSize: '64px', marginBottom: '20px' }}>🔒</div>
          <h1 style={{ fontSize: '24px', fontWeight: '700', marginBottom: '12px', color: '#ef4444' }}>Access Denied</h1>
          <p style={{ color: '#a1a1aa', marginBottom: '8px' }}>Data Console is restricted to developers only.</p>
          <p style={{ color: '#71717a', fontSize: '14px' }}>Current account: {dealer?.dealer_name || 'Unknown'}</p>
          <button
            onClick={() => window.history.back()}
            style={{ marginTop: '20px', padding: '10px 24px', backgroundColor: '#3b82f6', border: 'none', borderRadius: '6px', color: '#fff', cursor: 'pointer', fontWeight: '600' }}
          >
            Go Back
          </button>
        </div>
      </div>
    );
  }

  return (
    <div style={{ minHeight: '100vh', backgroundColor: '#18181b', display: 'flex', color: '#fff' }}>
      {/* Sidebar */}
      <div style={{ width: '200px', backgroundColor: '#09090b', borderRight: '1px solid #27272a', display: 'flex', flexDirection: 'column', flexShrink: 0 }}>
        <div style={{ padding: '16px', borderBottom: '1px solid #27272a' }}>
          <h1 style={{ fontSize: '18px', fontWeight: '700', color: '#f97316', margin: 0 }}>Data Console</h1>
          <p style={{ fontSize: '12px', color: '#71717a', margin: '4px 0 0 0' }}>Developer Only</p>
        </div>
        <nav style={{ flex: 1, padding: '8px', overflowY: 'auto' }}>
          {sections.map(s => (
            <button
              key={s.id}
              onClick={() => setActiveSection(s.id)}
              style={{
                width: '100%', textAlign: 'left', padding: '10px 12px', marginBottom: '4px',
                borderRadius: '6px', border: 'none',
                backgroundColor: activeSection === s.id ? '#f97316' : 'transparent',
                color: activeSection === s.id ? '#000' : '#a1a1aa',
                fontSize: '13px', fontWeight: activeSection === s.id ? '600' : '400', cursor: 'pointer'
              }}
            >
              {s.label}
            </button>
          ))}
        </nav>
        <div style={{ padding: '12px', borderTop: '1px solid #27272a', fontSize: '11px', color: '#71717a' }}>
          <div>{dealer?.dealer_name}</div>
          <div>ID: {dealerId}</div>
        </div>
      </div>

      {/* Main Content */}
      <div style={{ flex: 1, padding: '24px', overflowY: 'auto' }}>
        {loading && <div style={{ position: 'fixed', top: '16px', right: '16px', backgroundColor: '#3b82f6', padding: '8px 16px', borderRadius: '8px', fontSize: '14px', zIndex: 100 }}>Loading...</div>}

        {/* DASHBOARD */}
        {activeSection === 'dashboard' && (
          <div>
            <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'center', marginBottom: '20px' }}>
              <h2 style={{ fontSize: '20px', fontWeight: '700', margin: 0 }}>System Overview</h2>
              <HelpButton />
            </div>
            <div style={{ display: 'grid', gridTemplateColumns: 'repeat(auto-fill, minmax(160px, 1fr))', gap: '12px' }}>
              {[
                { label: 'Dealers', value: allDealers.length },
                { label: 'Users', value: allUsers.length },
                { label: 'Vehicles', value: inventory?.length || 0 },
                { label: 'Deals', value: deals?.length || 0 },
                { label: 'BHPH Active', value: bhphLoans?.filter(l => l.status === 'Active').length || 0 },
                { label: 'BHPH Late', value: lateLoans.length, color: lateLoans.length > 0 ? '#ef4444' : null },
                { label: 'Customers', value: customers?.length || 0 },
                { label: 'New Feedback', value: feedbackList.filter(f => f.status === 'new').length, color: feedbackList.filter(f => f.status === 'new').length > 0 ? '#f97316' : null },
                { label: 'Forms Ready', value: formLibrary.filter(f => (f.mapping_confidence || 0) >= 99).length, color: formLibrary.filter(f => (f.mapping_confidence || 0) < 99).length > 0 ? '#eab308' : null },
                { label: 'Promos Active', value: promoCodes.filter(p => p.active).length },
                { label: 'Templates', value: messageTemplates.length },
              ].map((stat, i) => (
                <div key={i} style={{ backgroundColor: '#27272a', borderRadius: '12px', padding: '16px' }}>
                  <div style={{ color: '#a1a1aa', fontSize: '13px', marginBottom: '6px' }}>{stat.label}</div>
                  <div style={{ fontSize: '28px', fontWeight: '700', color: stat.color || '#fff' }}>{stat.value}</div>
                </div>
              ))}
            </div>
          </div>
        )}

        {/* FEEDBACK */}
        {activeSection === 'feedback' && (
          <div>
            <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'center', marginBottom: '20px' }}>
              <h2 style={{ fontSize: '20px', fontWeight: '700', margin: 0 }}>User Feedback ({feedbackList.length})</h2>
              <div style={{ display: 'flex', gap: '8px' }}>
                <button onClick={loadAllData} style={btnSecondary}>Refresh</button>
                <HelpButton />
              </div>
            </div>
            {feedbackList.length === 0 ? (
              <div style={{ ...cardStyle, padding: '60px', textAlign: 'center' }}>
                <div style={{ color: '#71717a', fontSize: '18px' }}>No feedback yet</div>
              </div>
            ) : (
              <div style={{ display: 'flex', flexDirection: 'column', gap: '12px' }}>
                {feedbackList.map(f => (
                  <div key={f.id} style={{ ...cardStyle, borderLeft: `4px solid ${f.type === 'bug' ? '#ef4444' : f.type === 'feature' ? '#3b82f6' : '#f97316'}`, marginBottom: 0 }}>
                    <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'flex-start', marginBottom: '12px' }}>
                      <div style={{ display: 'flex', alignItems: 'center', gap: '10px', flexWrap: 'wrap' }}>
                        <span style={{ padding: '4px 10px', borderRadius: '6px', fontSize: '11px', fontWeight: '600', backgroundColor: f.type === 'bug' ? '#ef4444' : f.type === 'feature' ? '#3b82f6' : '#f97316', color: '#fff', textTransform: 'uppercase' }}>{f.type}</span>
                        <span style={{ color: '#a1a1aa', fontSize: '14px' }}>{f.user_name || 'Anonymous'}</span>
                        <span style={{ color: '#52525b', fontSize: '12px' }}>{new Date(f.created_at).toLocaleString()}</span>
                      </div>
                      <button onClick={() => deleteFeedback(f.id)} style={{ background: 'none', border: 'none', color: '#71717a', fontSize: '18px', cursor: 'pointer' }}>×</button>
                    </div>
                    <p style={{ margin: '0 0 12px 0', lineHeight: '1.5' }}>{f.message}</p>
                    <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'center', flexWrap: 'wrap', gap: '8px' }}>
                      <span style={{ color: '#52525b', fontSize: '12px' }}>Page: {f.page || '/'}</span>
                      <div style={{ display: 'flex', gap: '4px' }}>
                        {['new', 'reviewed', 'planned', 'done'].map(status => (
                          <button key={status} onClick={() => updateFeedbackStatus(f.id, status)} style={{ padding: '4px 10px', borderRadius: '4px', border: 'none', fontSize: '11px', fontWeight: '500', cursor: 'pointer', textTransform: 'capitalize', backgroundColor: f.status === status ? (status === 'done' ? '#22c55e' : status === 'planned' ? '#3b82f6' : status === 'reviewed' ? '#eab308' : '#71717a') : '#3f3f46', color: f.status === status ? '#fff' : '#a1a1aa' }}>{status}</button>
                        ))}
                      </div>
                    </div>
                  </div>
                ))}
              </div>
            )}
          </div>
        )}

        {/* DEALERS */}
        {activeSection === 'dealers' && (
          <div>
            <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'center', marginBottom: '20px' }}>
              <h2 style={{ fontSize: '20px', fontWeight: '700', margin: 0 }}>Dealers ({allDealers.length})</h2>
              <HelpButton />
            </div>
            <div style={{ display: 'flex', flexDirection: 'column', gap: '12px' }}>
              {allDealers.map(d => (
                <div key={d.id} style={{ ...cardStyle, display: 'flex', justifyContent: 'space-between', alignItems: 'center', marginBottom: 0 }}>
                  <div>
                    <h3 style={{ fontSize: '16px', fontWeight: '600', margin: '0 0 4px 0' }}>
                      {d.dealer_name}
                      {d.id === dealerId && <span style={{ marginLeft: '8px', fontSize: '10px', backgroundColor: '#f97316', padding: '2px 6px', borderRadius: '4px' }}>CURRENT</span>}
                    </h3>
                    <p style={{ color: '#a1a1aa', fontSize: '13px', margin: 0 }}>{d.city}, {d.state} | {d.phone}</p>
                    <p style={{ color: '#52525b', fontSize: '12px', margin: '4px 0 0 0' }}>ID: {d.id} | Created: {new Date(d.created_at).toLocaleDateString()}</p>
                  </div>
                  <div style={{ display: 'flex', gap: '8px' }}>
                    <button onClick={() => setImpersonateModal(d)} style={btnPrimary}>View As</button>
                    <button onClick={() => setConfirmDelete(d)} disabled={d.id === dealerId} style={{ ...btnDanger, opacity: d.id === dealerId ? 0.5 : 1, cursor: d.id === dealerId ? 'not-allowed' : 'pointer' }}>Delete</button>
                  </div>
                </div>
              ))}
            </div>
          </div>
        )}

        {/* USERS */}
        {activeSection === 'users' && (
          <div>
            <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'center', marginBottom: '20px' }}>
              <h2 style={{ fontSize: '20px', fontWeight: '700', margin: 0 }}>Users ({allUsers.length})</h2>
              <HelpButton />
            </div>
            <div style={cardStyle}>
              <table style={{ width: '100%', borderCollapse: 'collapse', fontSize: '13px' }}>
                <thead>
                  <tr style={{ borderBottom: '1px solid #3f3f46' }}>
                    <th style={{ textAlign: 'left', padding: '12px 8px', color: '#a1a1aa' }}>Name</th>
                    <th style={{ textAlign: 'left', padding: '12px 8px', color: '#a1a1aa' }}>Roles</th>
                    <th style={{ textAlign: 'left', padding: '12px 8px', color: '#a1a1aa' }}>Dealer</th>
                    <th style={{ textAlign: 'left', padding: '12px 8px', color: '#a1a1aa' }}>Status</th>
                    <th style={{ padding: '12px 8px', color: '#a1a1aa', textAlign: 'center' }}>Actions</th>
                  </tr>
                </thead>
                <tbody>
                  {allUsers.map(u => (
                    <tr key={u.id} style={{ borderBottom: '1px solid #3f3f46' }}>
                      <td style={{ padding: '12px 8px' }}>{u.name}</td>
                      <td style={{ padding: '12px 8px', color: '#a1a1aa' }}>{(u.roles || []).join(', ')}</td>
                      <td style={{ padding: '12px 8px', color: '#a1a1aa' }}>{allDealers.find(d => d.id === u.dealer_id)?.dealer_name || '-'}</td>
                      <td style={{ padding: '12px 8px' }}>
                        <span style={{ padding: '2px 8px', borderRadius: '4px', fontSize: '11px', backgroundColor: u.active ? '#22c55e' : '#ef4444' }}>{u.active ? 'Active' : 'Inactive'}</span>
                      </td>
                      <td style={{ padding: '12px 8px', textAlign: 'center' }}>
                        <button onClick={async () => { await supabase.from('employees').update({ active: !u.active }).eq('id', u.id); loadAllData(); }} style={{ background: 'none', border: 'none', color: '#eab308', cursor: 'pointer', fontSize: '12px', marginRight: '12px' }}>{u.active ? 'Disable' : 'Enable'}</button>
                        <button onClick={() => setConfirmDeleteUser(u)} style={{ background: 'none', border: 'none', color: '#ef4444', cursor: 'pointer', fontSize: '12px' }}>Delete</button>
                      </td>
                    </tr>
                  ))}
                </tbody>
              </table>
              {allUsers.length === 0 && <p style={{ textAlign: 'center', color: '#71717a', padding: '20px' }}>No users</p>}
            </div>
          </div>
        )}

        {/* FORM LIBRARY - 3 Tab System */}
        {activeSection === 'forms' && (
          <div style={{ paddingBottom: '180px' }}>
            <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'center', marginBottom: '20px', flexWrap: 'wrap', gap: '12px' }}>
              <h2 style={{ fontSize: '20px', fontWeight: '700', margin: 0 }}>Form Library</h2>
              <div style={{ display: 'flex', gap: '8px', alignItems: 'center', flexWrap: 'wrap' }}>
                {/* AI Discovery Progress */}
                {discoverProgress && (
                  <span style={{ color: '#3b82f6', fontSize: '13px', fontWeight: '500' }}>{discoverProgress}</span>
                )}
                {/* State Dropdown */}
                <select
                  value={discoverState}
                  onChange={(e) => setDiscoverState(e.target.value)}
                  disabled={aiResearching}
                  style={{
                    backgroundColor: '#3f3f46',
                    color: '#fff',
                    padding: '10px 12px',
                    borderRadius: '6px',
                    border: 'none',
                    fontSize: '13px',
                    opacity: aiResearching ? 0.6 : 1
                  }}
                >
                  <option value="all">All Key States ({keyStates.length})</option>
                  <optgroup label="Key States">
                    {keyStates.map(s => (
                      <option key={s} value={s}>{s}</option>
                    ))}
                  </optgroup>
                  <optgroup label="All States">
                    {allStatesOptions.filter(s => !keyStates.includes(s)).map(s => (
                      <option key={s} value={s}>{s}</option>
                    ))}
                  </optgroup>
                </select>
                <button onClick={runAIResearch} disabled={aiResearching || checkingUpdates} style={{ ...btnPrimary, opacity: aiResearching ? 0.6 : 1 }}>
                  {aiResearching ? 'Discovering...' : 'AI Discover Forms'}
                </button>
                <button
                  onClick={checkForUpdates}
                  disabled={checkingUpdates || aiResearching}
                  style={{
                    ...btnSecondary,
                    opacity: checkingUpdates ? 0.6 : 1,
                    display: 'flex',
                    alignItems: 'center',
                    gap: '6px'
                  }}
                >
                  {checkingUpdates ? (
                    <>
                      <span style={{
                        display: 'inline-block', width: '12px', height: '12px',
                        border: '2px solid rgba(255,255,255,0.3)', borderTopColor: '#fff',
                        borderRadius: '50%', animation: 'spin 1s linear infinite'
                      }} />
                      Checking...
                    </>
                  ) : 'Check for Updates'}
                </button>
                <HelpButton />
              </div>
            </div>

            {/* Tab Navigation - Staging -> Library -> Rules */}
            {/* Rules = Library forms with deadlines/cadences (forms that need compliance tracking) */}
            <div style={{ display: 'flex', gap: '4px', marginBottom: '20px', borderBottom: '1px solid #3f3f46', paddingBottom: '4px' }}>
              {[
                { id: 'staging', label: 'Staging', count: formStaging.filter(f => f.status !== 'approved').length, color: '#eab308' },
                { id: 'library', label: 'Library', count: formLibrary.length, color: '#22c55e' },
                { id: 'rules', label: 'Rules', count: formLibrary.filter(f => f.has_deadline || f.cadence).length, color: '#ef4444', desc: 'Forms with deadlines' },
              ].map(tab => (
                <button
                  key={tab.id}
                  onClick={() => setFormLibraryTab(tab.id)}
                  style={{
                    padding: '10px 20px',
                    borderRadius: '8px 8px 0 0',
                    border: 'none',
                    fontSize: '14px',
                    fontWeight: '600',
                    cursor: 'pointer',
                    backgroundColor: formLibraryTab === tab.id ? '#27272a' : 'transparent',
                    color: formLibraryTab === tab.id ? '#fff' : '#71717a',
                    borderBottom: formLibraryTab === tab.id ? `2px solid ${tab.color}` : '2px solid transparent',
                  }}
                >
                  {tab.label}
                  <span style={{ marginLeft: '8px', padding: '2px 8px', borderRadius: '10px', fontSize: '11px', backgroundColor: tab.color, color: '#fff' }}>{tab.count}</span>
                </button>
              ))}
            </div>

            {/* === RULES TAB === */}
            {/* Rules = Library forms that have deadlines or cadences (compliance-tracked docs) */}
            {formLibraryTab === 'rules' && (() => {
              const rulesFromLibrary = formLibrary.filter(f => f.has_deadline || f.cadence);
              const docTypeColors = { deal: '#22c55e', finance: '#3b82f6', licensing: '#f97316', tax: '#ef4444', reporting: '#8b5cf6' };
              const cadenceLabels = { per_transaction: 'Per Sale', monthly: 'Monthly', quarterly: 'Quarterly', annually: 'Annual' };
              return (
              <div>
                <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'center', marginBottom: '16px' }}>
                  <p style={{ color: '#a1a1aa', margin: 0, fontSize: '14px' }}>Forms with compliance deadlines or filing cadences. These docs require tracking.</p>
                </div>

                {/* Rules Stats */}
                <div style={{ display: 'grid', gridTemplateColumns: 'repeat(auto-fill, minmax(140px, 1fr))', gap: '12px', marginBottom: '20px' }}>
                  <div style={cardStyle}><div style={{ color: '#a1a1aa', fontSize: '12px', marginBottom: '4px' }}>Total Rules</div><div style={{ fontSize: '24px', fontWeight: '700' }}>{rulesFromLibrary.length}</div></div>
                  <div style={cardStyle}><div style={{ color: '#a1a1aa', fontSize: '12px', marginBottom: '4px' }}>Per Sale</div><div style={{ fontSize: '24px', fontWeight: '700', color: '#22c55e' }}>{rulesFromLibrary.filter(r => r.cadence === 'per_transaction').length}</div></div>
                  <div style={cardStyle}><div style={{ color: '#a1a1aa', fontSize: '12px', marginBottom: '4px' }}>Periodic</div><div style={{ fontSize: '24px', fontWeight: '700', color: '#3b82f6' }}>{rulesFromLibrary.filter(r => r.cadence && r.cadence !== 'per_transaction').length}</div></div>
                  <div style={cardStyle}><div style={{ color: '#a1a1aa', fontSize: '12px', marginBottom: '4px' }}>States</div><div style={{ fontSize: '24px', fontWeight: '700', color: '#f97316' }}>{[...new Set(rulesFromLibrary.map(r => r.state))].length}</div></div>
                </div>

                {/* Rules by Doc Type */}
                <div style={{ display: 'grid', gridTemplateColumns: 'repeat(auto-fill, minmax(100px, 1fr))', gap: '8px', marginBottom: '20px' }}>
                  {['deal', 'finance', 'licensing', 'tax', 'reporting'].map(dt => (
                    <div key={dt} style={{ ...cardStyle, padding: '12px', textAlign: 'center' }}>
                      <div style={{ color: docTypeColors[dt], fontSize: '20px', fontWeight: '700' }}>{rulesFromLibrary.filter(r => r.doc_type === dt).length}</div>
                      <div style={{ color: '#a1a1aa', fontSize: '11px', textTransform: 'uppercase' }}>{dt}</div>
                    </div>
                  ))}
                </div>

                {/* Rules Table */}
                <div style={cardStyle}>
                  <table style={{ width: '100%', borderCollapse: 'collapse', fontSize: '13px' }}>
                    <thead>
                      <tr style={{ borderBottom: '1px solid #3f3f46' }}>
                        <th style={{ textAlign: 'left', padding: '10px 8px', color: '#a1a1aa' }}>Form</th>
                        <th style={{ textAlign: 'left', padding: '10px 8px', color: '#a1a1aa' }}>State</th>
                        <th style={{ textAlign: 'center', padding: '10px 8px', color: '#a1a1aa' }}>Doc Type</th>
                        <th style={{ textAlign: 'center', padding: '10px 8px', color: '#a1a1aa' }}>Cadence</th>
                        <th style={{ textAlign: 'center', padding: '10px 8px', color: '#a1a1aa' }}>Deadline</th>
                        <th style={{ textAlign: 'left', padding: '10px 8px', color: '#a1a1aa' }}>Description</th>
                      </tr>
                    </thead>
                    <tbody>
                      {rulesFromLibrary.map(r => (
                        <tr key={r.id} style={{ borderBottom: '1px solid #3f3f46' }}>
                          <td style={{ padding: '10px 8px' }}>
                            <div style={{ fontWeight: '600' }}>{r.form_number}</div>
                            <div style={{ fontSize: '11px', color: '#a1a1aa' }}>{r.form_name}</div>
                          </td>
                          <td style={{ padding: '10px 8px' }}><span style={{ padding: '2px 8px', borderRadius: '4px', fontSize: '11px', backgroundColor: '#3f3f46' }}>{r.state}</span></td>
                          <td style={{ padding: '10px 8px', textAlign: 'center' }}>
                            <span style={{ padding: '2px 8px', borderRadius: '4px', fontSize: '10px', backgroundColor: docTypeColors[r.doc_type] || '#71717a', textTransform: 'uppercase' }}>{r.doc_type || 'deal'}</span>
                          </td>
                          <td style={{ padding: '10px 8px', textAlign: 'center' }}>
                            <span style={{ padding: '2px 8px', borderRadius: '4px', fontSize: '10px', backgroundColor: r.cadence === 'per_transaction' ? '#22c55e' : '#3b82f6' }}>{cadenceLabels[r.cadence] || r.cadence || '-'}</span>
                          </td>
                          <td style={{ padding: '10px 8px', textAlign: 'center', fontFamily: 'monospace', color: r.deadline_days ? '#ef4444' : '#71717a' }}>
                            {r.deadline_days ? `${r.deadline_days}d` : '-'}
                          </td>
                          <td style={{ padding: '10px 8px', color: '#a1a1aa', fontSize: '12px', maxWidth: '200px', overflow: 'hidden', textOverflow: 'ellipsis' }}>
                            {r.deadline_description || '-'}
                          </td>
                        </tr>
                      ))}
                    </tbody>
                  </table>
                  {rulesFromLibrary.length === 0 && <p style={{ textAlign: 'center', color: '#71717a', padding: '40px' }}>No rules found. Promote forms with deadlines from Library, or run AI Discover to find forms with compliance requirements.</p>}
                </div>
              </div>
            );})()}

            {/* === STAGING TAB === */}
            {formLibraryTab === 'staging' && (
              <div>
                {/* Header with Upload and Promote All buttons */}
                <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'center', marginBottom: '16px', flexWrap: 'wrap', gap: '12px' }}>
                  <p style={{ color: '#a1a1aa', margin: 0, fontSize: '14px' }}>Developer tooling to maintain form freshness across all states.</p>
                  <div style={{ display: 'flex', gap: '8px' }}>
                    <button
                      onClick={promoteAllForms}
                      disabled={formStaging.filter(f => f.status === 'pending').length === 0}
                      style={{ padding: '8px 16px', borderRadius: '6px', border: 'none', fontSize: '13px', cursor: 'pointer', backgroundColor: '#3b82f6', color: '#fff', fontWeight: '600', opacity: formStaging.filter(f => f.status === 'pending').length === 0 ? 0.5 : 1 }}
                    >
                      Promote All ({formStaging.filter(f => f.status === 'pending').length})
                    </button>
                    <button
                      onClick={() => setUploadFormModal({ state: stagingStateFilter !== 'all' ? stagingStateFilter : '', form_number: '', form_name: '', source_url: '', file: null })}
                      style={{ padding: '8px 16px', borderRadius: '6px', border: 'none', fontSize: '13px', cursor: 'pointer', backgroundColor: '#22c55e', color: '#fff', fontWeight: '600' }}
                    >
                      + Upload Form
                    </button>
                  </div>
                </div>

                {/* State Filter & Status Filters */}
                <div style={{ display: 'flex', gap: '16px', marginBottom: '16px', alignItems: 'center', flexWrap: 'wrap' }}>
                  {/* State Dropdown */}
                  <div style={{ display: 'flex', alignItems: 'center', gap: '8px' }}>
                    <span style={{ color: '#a1a1aa', fontSize: '13px' }}>State:</span>
                    <select
                      value={stagingStateFilter}
                      onChange={(e) => setStagingStateFilter(e.target.value)}
                      style={{ backgroundColor: '#3f3f46', color: '#fff', padding: '8px 12px', borderRadius: '6px', border: 'none', fontSize: '13px', minWidth: '140px' }}
                    >
                      <option value="all">All States ({formStaging.length})</option>
                      {stagingStates.map(state => (
                        <option key={state} value={state}>{state} ({formStaging.filter(f => f.state === state).length})</option>
                      ))}
                    </select>
                    {stagingStateFilter !== 'all' && (
                      <button
                        onClick={() => setConfirmBulkDelete(stagingStateFilter)}
                        style={{ padding: '8px 12px', borderRadius: '6px', border: 'none', fontSize: '12px', cursor: 'pointer', backgroundColor: '#ef4444', color: '#fff', fontWeight: '600' }}
                      >
                        Delete All {stagingStateFilter}
                      </button>
                    )}
                  </div>

                  <div style={{ borderLeft: '1px solid #3f3f46', height: '24px' }} />

                  {/* Status Filters */}
                  <div style={{ display: 'flex', gap: '6px', flexWrap: 'wrap' }}>
                    {[
                      { id: 'all', label: 'All', color: '#f97316' },
                      { id: 'needs_number', label: 'Needs Form #', color: '#ef4444' },
                      { id: 'needs_pdf', label: 'Needs PDF', color: '#eab308' },
                      { id: 'needs_mapping', label: 'Needs Mapping', color: '#8b5cf6' },
                      { id: 'ready', label: 'Ready', color: '#3b82f6' },
                      { id: 'production', label: 'Production', color: '#22c55e' },
                    ].map(filter => (
                      <button
                        key={filter.id}
                        onClick={() => setStagingFilter(filter.id)}
                        style={{
                          padding: '5px 10px', borderRadius: '6px', border: 'none', fontSize: '11px', cursor: 'pointer',
                          backgroundColor: stagingFilter === filter.id ? filter.color : '#3f3f46',
                          color: '#fff'
                        }}
                      >
                        {filter.label}
                      </button>
                    ))}
                  </div>
                </div>

                {/* Staging Stats */}
                <div style={{ display: 'grid', gridTemplateColumns: 'repeat(auto-fill, minmax(110px, 1fr))', gap: '10px', marginBottom: '20px' }}>
                  <div style={cardStyle}><div style={{ color: '#a1a1aa', fontSize: '11px', marginBottom: '4px' }}>Total{stagingStateFilter !== 'all' ? ` (${stagingStateFilter})` : ''}</div><div style={{ fontSize: '22px', fontWeight: '700' }}>{stagingStateFilter !== 'all' ? formStaging.filter(f => f.state === stagingStateFilter).length : formStaging.length}</div></div>
                  <div style={cardStyle}><div style={{ color: '#a1a1aa', fontSize: '11px', marginBottom: '4px' }}>Form # OK</div><div style={{ fontSize: '22px', fontWeight: '700', color: '#22c55e' }}>{formStaging.filter(f => f.form_number_confirmed && (stagingStateFilter === 'all' || f.state === stagingStateFilter)).length}</div></div>
                  <div style={cardStyle}><div style={{ color: '#a1a1aa', fontSize: '11px', marginBottom: '4px' }}>Has PDF</div><div style={{ fontSize: '22px', fontWeight: '700', color: '#3b82f6' }}>{formStaging.filter(f => f.storage_path && (stagingStateFilter === 'all' || f.state === stagingStateFilter)).length}</div></div>
                  <div style={cardStyle}><div style={{ color: '#a1a1aa', fontSize: '11px', marginBottom: '4px' }}>Mapped</div><div style={{ fontSize: '22px', fontWeight: '700', color: '#8b5cf6' }}>{formStaging.filter(f => ((f.field_mappings?.length || 0) > 0 || (f.mapping_confidence || 0) > 0) && (stagingStateFilter === 'all' || f.state === stagingStateFilter)).length}</div></div>
                  <div style={cardStyle}><div style={{ color: '#a1a1aa', fontSize: '11px', marginBottom: '4px' }}>Production</div><div style={{ fontSize: '22px', fontWeight: '700', color: '#22c55e' }}>{formStaging.filter(f => (f.workflow_status === 'production' || f.status === 'active') && (stagingStateFilter === 'all' || f.state === stagingStateFilter)).length}</div></div>
                </div>

                {/* Hidden file input for inline uploads */}
                <input
                  type="file"
                  ref={stagingFileInputRef}
                  accept="application/pdf"
                  style={{ display: 'none' }}
                  onChange={(e) => {
                    if (inlineUploadingId && e.target.files[0]) {
                      const form = formStaging.find(f => f.id === inlineUploadingId);
                      if (form) handleInlineUpload(form, e.target.files[0]);
                    }
                    e.target.value = ''; // Reset for next upload
                  }}
                />

                {/* Staging Table */}
                <div style={cardStyle}>
                  <table style={{ width: '100%', borderCollapse: 'collapse', fontSize: '13px' }}>
                    <thead>
                      <tr style={{ borderBottom: '1px solid #3f3f46' }}>
                        <th style={{ textAlign: 'left', padding: '10px 8px', color: '#a1a1aa', width: '120px' }}>Form #</th>
                        <th style={{ textAlign: 'left', padding: '10px 8px', color: '#a1a1aa' }}>Form Name</th>
                        <th style={{ textAlign: 'left', padding: '10px 8px', color: '#a1a1aa', width: '60px' }}>State</th>
                        <th style={{ textAlign: 'center', padding: '10px 8px', color: '#a1a1aa', width: '120px' }}>Deal Types</th>
                        <th style={{ textAlign: 'center', padding: '10px 8px', color: '#a1a1aa', width: '80px' }}>PDF</th>
                        <th style={{ textAlign: 'center', padding: '10px 8px', color: '#a1a1aa', width: '90px' }}>Mapping</th>
                        <th style={{ textAlign: 'center', padding: '10px 8px', color: '#a1a1aa', width: '200px' }}>Actions</th>
                      </tr>
                    </thead>
                    <tbody>
                      {getFilteredStaging().map(f => {
                        // field_mappings is from map-form-fields, detected_fields is from old analyze-form
                        const mappingsCount = f.field_mappings?.length || 0;
                        const detectedCount = f.detected_fields?.length || 0;
                        const hasMapping = mappingsCount > 0 || detectedCount > 0;
                        // Calculate score - if we have field_mappings array, count high confidence ones
                        const highConfidenceCount = f.field_mappings?.filter(m => m.confidence >= 0.9).length || 0;
                        const mappingScore = f.mapping_confidence || (mappingsCount > 0 ? Math.round((highConfidenceCount / mappingsCount) * 100) : 0);
                        const isMapped = f.mapping_status === 'ai_suggested' || f.mapping_status === 'human_verified' || mappingScore >= 50;
                        const isReadyToPromote = f.status !== 'promoted' && f.status !== 'active' && f.workflow_status !== 'production';
                        const needsNumber = !f.form_number_confirmed;
                        const needsPdf = !f.storage_path;
                        const isProduction = f.workflow_status === 'production' || f.status === 'active' || f.status === 'promoted';
                        const dealTypeColors = { cash: '#22c55e', bhph: '#8b5cf6', traditional: '#3b82f6', wholesale: '#eab308' };
                        return (
                          <tr key={f.id} style={{
                            borderBottom: '1px solid #3f3f46',
                            backgroundColor: isProduction ? 'rgba(34, 197, 94, 0.05)' : needsNumber ? 'rgba(239, 68, 68, 0.05)' : needsPdf ? 'rgba(234, 179, 8, 0.03)' : 'transparent'
                          }}>
                            {/* Form # - Inline editable if not confirmed */}
                            <td style={{ padding: '10px 8px' }}>
                              {f.form_number_confirmed ? (
                                <div style={{ display: 'flex', alignItems: 'center', gap: '6px' }}>
                                  <span style={{ fontFamily: 'monospace', fontWeight: '600' }}>{f.form_number || '—'}</span>
                                  {f.form_number === 'FEDERAL' && (
                                    <span style={{ padding: '2px 6px', borderRadius: '4px', fontSize: '9px', backgroundColor: '#3b82f6', color: '#fff' }}>FED</span>
                                  )}
                                </div>
                              ) : (
                                <div style={{ display: 'flex', alignItems: 'center', gap: '4px' }}>
                                  <input
                                    type="text"
                                    placeholder="Form #"
                                    defaultValue={f.form_number || ''}
                                    onBlur={(e) => e.target.value !== (f.form_number || '') && updateFormNumber(f, e.target.value)}
                                    onKeyDown={(e) => e.key === 'Enter' && updateFormNumber(f, e.target.value)}
                                    style={{ width: '70px', padding: '4px 6px', backgroundColor: '#3f3f46', border: '1px solid #ef4444', borderRadius: '4px', color: '#fff', fontSize: '11px', fontFamily: 'monospace' }}
                                  />
                                  <span style={{ color: '#ef4444', fontSize: '14px' }} title="Form number not confirmed">⚠</span>
                                </div>
                              )}
                            </td>

                            {/* Form Name */}
                            <td style={{ padding: '10px 8px' }}>
                              <div style={{ fontWeight: '500' }}>{f.form_name}</div>
                              {f.description && <div style={{ color: '#71717a', fontSize: '11px', marginTop: '2px' }}>{f.description.length > 50 ? f.description.substring(0, 50) + '...' : f.description}</div>}
                            </td>

                            {/* State */}
                            <td style={{ padding: '10px 8px' }}>
                              <span style={{ padding: '2px 8px', borderRadius: '4px', fontSize: '11px', backgroundColor: '#3f3f46' }}>{f.state}</span>
                            </td>

                            {/* Deal Types */}
                            <td style={{ padding: '10px 8px', textAlign: 'center' }}>
                              <div style={{ display: 'flex', gap: '3px', justifyContent: 'center', flexWrap: 'wrap' }}>
                                {f.deal_types?.length > 0 ? f.deal_types.map(dt => (
                                  <span key={dt} style={{
                                    padding: '2px 5px',
                                    borderRadius: '3px',
                                    fontSize: '9px',
                                    backgroundColor: dealTypeColors[dt] || '#71717a',
                                    color: dt === 'cash' || dt === 'wholesale' ? '#000' : '#fff',
                                    textTransform: 'uppercase',
                                    fontWeight: '600'
                                  }}>
                                    {dt}
                                  </span>
                                )) : <span style={{ color: '#71717a', fontSize: '10px' }}>—</span>}
                              </div>
                            </td>

                            {/* PDF Status */}
                            <td style={{ padding: '10px 8px', textAlign: 'center' }}>
                              {f.storage_path ? (
                                <a
                                  href={`https://rlzudfinlxonpbwacxpt.supabase.co/storage/v1/object/public/${f.storage_bucket}/${f.storage_path}`}
                                  target="_blank"
                                  rel="noreferrer"
                                  style={{
                                    display: 'inline-block',
                                    padding: '4px 10px',
                                    borderRadius: '4px',
                                    backgroundColor: '#22c55e',
                                    color: '#fff',
                                    fontSize: '10px',
                                    textDecoration: 'none',
                                    fontWeight: '600'
                                  }}
                                >
                                  ✓ View PDF
                                </a>
                              ) : f.source_url ? (
                                <a
                                  href={f.source_url}
                                  target="_blank"
                                  rel="noreferrer"
                                  style={{
                                    display: 'inline-block',
                                    padding: '4px 10px',
                                    borderRadius: '4px',
                                    backgroundColor: '#eab308',
                                    color: '#000',
                                    fontSize: '10px',
                                    textDecoration: 'none',
                                    fontWeight: '600'
                                  }}
                                >
                                  🔗 Link Only
                                </a>
                              ) : (
                                <span style={{ padding: '4px 10px', borderRadius: '4px', backgroundColor: '#ef4444', color: '#fff', fontSize: '10px', fontWeight: '600' }}>No PDF</span>
                              )}
                            </td>

                            {/* Mapping */}
                            <td style={{ padding: '10px 8px', textAlign: 'center' }}>
                              {hasMapping ? (
                                <div style={{ display: 'flex', flexDirection: 'column', alignItems: 'center', gap: '2px' }}>
                                  <span style={{
                                    padding: '3px 8px',
                                    borderRadius: '10px',
                                    fontSize: '11px',
                                    fontWeight: '600',
                                    backgroundColor: f.mapping_status === 'human_verified' ? '#22c55e' : isMapped ? '#8b5cf6' : '#eab308',
                                    color: '#000'
                                  }}>
                                    {mappingsCount || detectedCount} fields
                                  </span>
                                  {f.mapping_status && (
                                    <span style={{ fontSize: '9px', color: f.mapping_status === 'human_verified' ? '#22c55e' : '#a1a1aa' }}>
                                      {f.mapping_status === 'ai_suggested' ? 'AI' : f.mapping_status === 'human_verified' ? '✓ Verified' : f.mapping_status}
                                    </span>
                                  )}
                                </div>
                              ) : (
                                <span style={{ color: '#71717a', fontSize: '11px' }}>—</span>
                              )}
                            </td>

                            {/* Actions */}
                            <td style={{ padding: '10px 8px', textAlign: 'center' }}>
                              <div style={{ display: 'flex', gap: '6px', justifyContent: 'center', flexWrap: 'wrap' }}>
                                {/* Upload Button */}
                                <button
                                  onClick={() => {
                                    setInlineUploadingId(f.id);
                                    stagingFileInputRef.current?.click();
                                  }}
                                  disabled={inlineUploadingId === f.id}
                                  style={{
                                    background: 'none',
                                    border: '1px solid #3b82f6',
                                    color: '#3b82f6',
                                    padding: '3px 8px',
                                    borderRadius: '4px',
                                    cursor: 'pointer',
                                    fontSize: '10px'
                                  }}
                                >
                                  {inlineUploadingId === f.id ? '...' : f.source_url ? '↑' : 'Upload'}
                                </button>

                                {/* Analyze Button - show if PDF exists in storage */}
                                {f.storage_path && !isProduction && (
                                  <button
                                    onClick={() => !analyzingFormId && analyzeForm(f)}
                                    disabled={analyzingFormId === f.id}
                                    style={{
                                      background: 'none',
                                      border: '1px solid #8b5cf6',
                                      color: '#8b5cf6',
                                      padding: '3px 8px',
                                      borderRadius: '4px',
                                      cursor: analyzingFormId === f.id ? 'wait' : 'pointer',
                                      fontSize: '10px',
                                      opacity: analyzingFormId && analyzingFormId !== f.id ? 0.5 : 1,
                                      minWidth: '52px',
                                      display: 'flex',
                                      alignItems: 'center',
                                      justifyContent: 'center',
                                      gap: '4px'
                                    }}
                                  >
                                    {analyzingFormId === f.id ? (
                                      <>
                                        <span style={{
                                          display: 'inline-block',
                                          width: '10px',
                                          height: '10px',
                                          border: '2px solid rgba(139,92,246,0.3)',
                                          borderTopColor: '#8b5cf6',
                                          borderRadius: '50%',
                                          animation: 'spin 1s linear infinite'
                                        }} />
                                        <span>...</span>
                                      </>
                                    ) : 'Analyze'}
                                  </button>
                                )}
                                {/* View/Map Button - show if has PDF in storage or has mapping */}
                                {(f.storage_path || hasMapping) && (
                                  <button
                                    onClick={() => openStagingMapper(f)}
                                    style={{
                                      background: 'none',
                                      border: hasMapping ? '1px solid #8b5cf6' : '1px solid #71717a',
                                      color: hasMapping ? '#8b5cf6' : '#a1a1aa',
                                      padding: '3px 8px',
                                      borderRadius: '4px',
                                      cursor: 'pointer',
                                      fontSize: '10px'
                                    }}
                                  >
                                    {hasMapping ? 'Map' : 'View'}
                                  </button>
                                )}

                                {/* Promote Button */}
                                {isReadyToPromote && (
                                  <button
                                    onClick={() => setPromoteModal({ form: f, selectedLibrary: f.doc_type || 'deal' })}
                                    style={{
                                      background: 'none',
                                      border: '1px solid #22c55e',
                                      color: '#22c55e',
                                      padding: '3px 8px',
                                      borderRadius: '4px',
                                      cursor: 'pointer',
                                      fontSize: '10px',
                                      fontWeight: '600'
                                    }}
                                  >
                                    Promote
                                  </button>
                                )}

                                {/* Production Badge */}
                                {isProduction && (
                                  <span style={{
                                    padding: '3px 8px',
                                    borderRadius: '4px',
                                    fontSize: '10px',
                                    backgroundColor: '#22c55e',
                                    color: '#000',
                                    fontWeight: '600'
                                  }}>
                                    ✓ Live
                                  </span>
                                )}

                                {/* Delete */}
                                <button
                                  onClick={() => setDeleteStagedModal(f)}
                                  style={{
                                    background: 'none',
                                    border: 'none',
                                    color: '#ef4444',
                                    cursor: 'pointer',
                                    fontSize: '10px',
                                    padding: '3px 4px'
                                  }}
                                >
                                  ✕
                                </button>
                              </div>
                            </td>
                          </tr>
                        );
                      })}
                    </tbody>
                  </table>
                  {getFilteredStaging().length === 0 && <p style={{ textAlign: 'center', color: '#71717a', padding: '40px' }}>No staged forms. Click "AI Discover Forms" to find forms for {dealer?.state || 'your state'}.</p>}
                </div>
              </div>
            )}

            {/* === LIBRARY TAB === */}
            {formLibraryTab === 'library' && (
              <div>
                <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'center', marginBottom: '16px', flexWrap: 'wrap', gap: '12px' }}>
                  <p style={{ color: '#a1a1aa', margin: 0, fontSize: '14px' }}>Master form library for ALL states. Click forms &lt;99% to open Field Mapper.</p>
                  <button onClick={() => setFormModal({ state: dealer?.state || 'UT', county: '', form_number: '', form_name: '', category: 'deal', source_url: '', description: '', is_active: true })} style={btnSuccess}>+ Add Form</button>
                </div>

                {/* Library Stats */}
                <div style={{ display: 'grid', gridTemplateColumns: 'repeat(auto-fill, minmax(140px, 1fr))', gap: '12px', marginBottom: '20px' }}>
                  <div style={cardStyle}><div style={{ color: '#a1a1aa', fontSize: '12px', marginBottom: '4px' }}>Total Forms</div><div style={{ fontSize: '24px', fontWeight: '700' }}>{formLibrary.length}</div></div>
                  <div style={cardStyle}><div style={{ color: '#a1a1aa', fontSize: '12px', marginBottom: '4px' }}>States</div><div style={{ fontSize: '24px', fontWeight: '700', color: '#8b5cf6' }}>{libraryStates.length}</div></div>
                  <div style={cardStyle}><div style={{ color: '#a1a1aa', fontSize: '12px', marginBottom: '4px' }}>Ready (99%+)</div><div style={{ fontSize: '24px', fontWeight: '700', color: '#22c55e' }}>{formLibrary.filter(f => (f.mapping_confidence || 0) >= 99).length}</div></div>
                  <div style={cardStyle}><div style={{ color: '#a1a1aa', fontSize: '12px', marginBottom: '4px' }}>Needs Mapping</div><div style={{ fontSize: '24px', fontWeight: '700', color: '#eab308' }}>{formLibrary.filter(f => (f.mapping_confidence || 0) < 99).length}</div></div>
                </div>

                {/* State Filter */}
                <div style={{ display: 'flex', gap: '12px', marginBottom: '16px', alignItems: 'center', flexWrap: 'wrap' }}>
                  <div style={{ display: 'flex', alignItems: 'center', gap: '8px' }}>
                    <span style={{ color: '#a1a1aa', fontSize: '13px' }}>State:</span>
                    <select
                      value={libraryStateFilter}
                      onChange={(e) => setLibraryStateFilter(e.target.value)}
                      style={{ backgroundColor: '#3f3f46', color: '#fff', padding: '8px 12px', borderRadius: '6px', border: 'none', fontSize: '13px', minWidth: '120px' }}
                    >
                      <option value="all">All States ({formLibrary.length})</option>
                      {libraryStates.map(state => (
                        <option key={state} value={state}>{state} ({formLibrary.filter(f => f.state === state).length})</option>
                      ))}
                    </select>
                  </div>
                  <div style={{ borderLeft: '1px solid #3f3f46', height: '24px' }} />
                  {/* Category Filters */}
                  <div style={{ display: 'flex', gap: '8px', flexWrap: 'wrap' }}>
                    {['all', 'needs_mapping', 'ready', ...formCategories].map(filter => (
                      <button
                        key={filter}
                        onClick={() => setFormFilter(filter)}
                        style={{
                          padding: '6px 12px', borderRadius: '6px', border: 'none', fontSize: '12px', cursor: 'pointer',
                          backgroundColor: formFilter === filter ? (categoryColors[filter] || '#f97316') : '#3f3f46',
                          color: '#fff', textTransform: 'capitalize'
                        }}
                      >
                        {filter === 'needs_mapping' ? 'Needs Mapping' : filter}
                      </button>
                    ))}
                  </div>
                </div>

                {/* Library Table - Workflow Status: staging -> html_generated -> mapped -> production */}
                <div style={cardStyle}>
                  <table style={{ width: '100%', borderCollapse: 'collapse', fontSize: '13px' }}>
                    <thead>
                      <tr style={{ borderBottom: '1px solid #3f3f46' }}>
                        <th style={{ textAlign: 'left', padding: '10px 8px', color: '#a1a1aa' }}>Form Name</th>
                        <th style={{ textAlign: 'left', padding: '10px 8px', color: '#a1a1aa' }}>State</th>
                        <th style={{ textAlign: 'left', padding: '10px 8px', color: '#a1a1aa' }}>Category</th>
                        <th style={{ textAlign: 'center', padding: '10px 8px', color: '#a1a1aa' }}>Status</th>
                        <th style={{ textAlign: 'center', padding: '10px 8px', color: '#a1a1aa' }}>PDF Link</th>
                        <th style={{ textAlign: 'center', padding: '10px 8px', color: '#a1a1aa' }}>Actions</th>
                      </tr>
                    </thead>
                    <tbody>
                      {getFilteredLibrary().map(f => {
                        const ws = f.workflow_status || 'staging';
                        const statusColors = {
                          staging: '#71717a',
                          html_generated: '#eab308',
                          mapped: '#3b82f6',
                          production: '#22c55e'
                        };
                        const statusLabels = {
                          staging: 'Staging',
                          html_generated: 'HTML Ready',
                          mapped: 'Mapped',
                          production: 'Production'
                        };
                        return (
                          <tr key={f.id} style={{ borderBottom: '1px solid #3f3f46' }}>
                            <td style={{ padding: '10px 8px' }}>
                              <div style={{ fontFamily: 'monospace', fontWeight: '600', marginBottom: '2px' }}>{f.form_number}</div>
                              <div>{f.form_name}</div>
                              {f.description && <div style={{ color: '#71717a', fontSize: '11px', marginTop: '2px' }}>{f.description.substring(0, 60)}...</div>}
                            </td>
                            <td style={{ padding: '10px 8px' }}><span style={{ padding: '2px 8px', borderRadius: '4px', fontSize: '11px', backgroundColor: '#3f3f46' }}>{f.state}</span></td>
                            <td style={{ padding: '10px 8px' }}><span style={{ padding: '2px 8px', borderRadius: '4px', fontSize: '10px', backgroundColor: categoryColors[f.category] || '#71717a', textTransform: 'uppercase' }}>{f.category || f.doc_type || 'deal'}</span></td>
                            <td style={{ padding: '10px 8px', textAlign: 'center' }}>
                              <span style={{
                                padding: '4px 10px',
                                borderRadius: '12px',
                                fontSize: '11px',
                                fontWeight: '600',
                                backgroundColor: statusColors[ws],
                                color: ws === 'production' ? '#000' : '#fff'
                              }}>
                                {ws === 'production' && '✓ '}{statusLabels[ws]}
                              </span>
                            </td>
                            <td style={{ padding: '10px 8px', textAlign: 'center' }}>
                              {f.source_url ? (
                                <a href={f.source_url} target="_blank" rel="noreferrer" style={{ color: f.url_validated ? '#22c55e' : '#3b82f6', fontSize: '11px' }}>
                                  {f.url_validated ? '✓ PDF' : 'View PDF'}
                                </a>
                              ) : (
                                <span style={{ color: '#ef4444', fontSize: '11px' }}>Missing</span>
                              )}
                            </td>
                            <td style={{ padding: '10px 8px', textAlign: 'center' }}>
                              <div style={{ display: 'flex', gap: '6px', justifyContent: 'center', flexWrap: 'wrap' }}>
                                {/* STAGING: Generate HTML */}
                                {ws === 'staging' && (
                                  <button
                                    onClick={() => setTemplateGeneratorModal(f)}
                                    style={{ background: 'none', border: 'none', color: '#a855f7', cursor: 'pointer', fontSize: '11px', fontWeight: '600' }}
                                  >
                                    Generate HTML
                                  </button>
                                )}
                                {/* HTML_GENERATED: Analyze Mapping + View HTML */}
                                {ws === 'html_generated' && (
                                  <>
                                    <button
                                      onClick={() => setTemplateGeneratorModal(f)}
                                      style={{ background: 'none', border: 'none', color: '#3b82f6', cursor: 'pointer', fontSize: '11px' }}
                                    >
                                      View HTML
                                    </button>
                                    <button
                                      onClick={() => setFieldMapperModal({ ...f, field_mapping: f.field_mapping || {}, detected_fields: f.detected_fields || [] })}
                                      style={{ background: 'none', border: 'none', color: '#eab308', cursor: 'pointer', fontSize: '11px', fontWeight: '600' }}
                                    >
                                      Analyze Mapping
                                    </button>
                                  </>
                                )}
                                {/* MAPPED: Edit Mapping + Promote */}
                                {ws === 'mapped' && (
                                  <>
                                    <button
                                      onClick={() => setFieldMapperModal({ ...f, field_mapping: f.field_mapping || {}, detected_fields: f.detected_fields || [] })}
                                      style={{ background: 'none', border: 'none', color: '#3b82f6', cursor: 'pointer', fontSize: '11px' }}
                                    >
                                      Edit Mapping
                                    </button>
                                    <button
                                      onClick={async () => {
                                        await supabase.from('form_library').update({ workflow_status: 'production', status: 'active' }).eq('id', f.id);
                                        showToast(`${f.form_name} promoted to production`);
                                        loadAllData();
                                      }}
                                      style={{ background: 'none', border: 'none', color: '#22c55e', cursor: 'pointer', fontSize: '11px', fontWeight: '600' }}
                                    >
                                      Promote
                                    </button>
                                  </>
                                )}
                                {/* PRODUCTION: View + Edit (demotes) */}
                                {ws === 'production' && (
                                  <>
                                    <button
                                      onClick={() => setTemplateGeneratorModal(f)}
                                      style={{ background: 'none', border: 'none', color: '#22c55e', cursor: 'pointer', fontSize: '11px' }}
                                    >
                                      View
                                    </button>
                                    <button
                                      onClick={async () => {
                                        await supabase.from('form_library').update({ workflow_status: 'mapped' }).eq('id', f.id);
                                        showToast(`${f.form_name} demoted to mapped for editing`);
                                        loadAllData();
                                      }}
                                      style={{ background: 'none', border: 'none', color: '#eab308', cursor: 'pointer', fontSize: '11px' }}
                                    >
                                      Edit
                                    </button>
                                  </>
                                )}
                                {/* Common actions */}
                                <button onClick={() => removeFromLibrary(f.id)} style={{ background: 'none', border: 'none', color: '#ef4444', cursor: 'pointer', fontSize: '11px' }}>Delete</button>
                              </div>
                            </td>
                          </tr>
                        );
                      })}
                    </tbody>
                  </table>
                  {getFilteredLibrary().length === 0 && <p style={{ textAlign: 'center', color: '#71717a', padding: '40px' }}>No forms in library. Click "AI Discover Forms" to find forms for your state.</p>}
                </div>
              </div>
            )}

          </div>
        )}

        {/* DATA BROWSER */}
        {activeSection === 'data' && (
          <div>
            <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'center', marginBottom: '20px' }}>
              <h2 style={{ fontSize: '20px', fontWeight: '700', margin: 0 }}>Data Browser</h2>
              <HelpButton />
            </div>
            <div style={cardStyle}>
              <div style={{ display: 'flex', gap: '8px', marginBottom: '16px', flexWrap: 'wrap' }}>
                <select value={selectedTable} onChange={(e) => setSelectedTable(e.target.value)} style={{ ...inputStyle, width: 'auto' }}>
                  {tables.map(t => <option key={t} value={t}>{t}</option>)}
                </select>
                <button onClick={() => loadTableData(selectedTable)} style={btnPrimary}>Load</button>
                <button onClick={() => exportCSV(tableData, selectedTable)} disabled={!tableData.length} style={{ ...btnSuccess, opacity: tableData.length ? 1 : 0.5 }}>Export CSV</button>
              </div>
              {tableData.length > 0 ? (
                <div style={{ overflowX: 'auto', maxHeight: '500px' }}>
                  <table style={{ width: '100%', borderCollapse: 'collapse', fontSize: '11px' }}>
                    <thead>
                      <tr style={{ backgroundColor: '#3f3f46', position: 'sticky', top: 0 }}>
                        {tableColumns.map(c => <th key={c} style={{ textAlign: 'left', padding: '8px 6px', color: '#a1a1aa', fontWeight: '600' }}>{c}</th>)}
                      </tr>
                    </thead>
                    <tbody>
                      {tableData.map((row, i) => (
                        <tr key={i} style={{ borderTop: '1px solid #3f3f46' }}>
                          {tableColumns.map(c => (
                            <td key={c} style={{ padding: '6px', color: '#d4d4d8', maxWidth: '200px', overflow: 'hidden', textOverflow: 'ellipsis', whiteSpace: 'nowrap' }}>
                              {typeof row[c] === 'object' ? JSON.stringify(row[c]) : String(row[c] ?? '')}
                            </td>
                          ))}
                        </tr>
                      ))}
                    </tbody>
                  </table>
                </div>
              ) : (
                <p style={{ textAlign: 'center', color: '#71717a', padding: '40px' }}>Select a table and click Load</p>
              )}
            </div>
          </div>
        )}

        {/* BULK OPS */}
        {activeSection === 'bulk' && (
          <div>
            <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'center', marginBottom: '20px' }}>
              <h2 style={{ fontSize: '20px', fontWeight: '700', margin: 0 }}>Bulk Operations</h2>
              <HelpButton />
            </div>
            <div style={cardStyle}>
              <div style={{ display: 'flex', gap: '8px', marginBottom: '16px', flexWrap: 'wrap', alignItems: 'center' }}>
                <select value={selectedTable} onChange={(e) => { setSelectedTable(e.target.value); setSelectedIds([]); }} style={{ ...inputStyle, width: 'auto' }}>
                  {tables.map(t => <option key={t} value={t}>{t}</option>)}
                </select>
                <button onClick={() => loadTableData(selectedTable)} style={btnPrimary}>Load</button>
                <span style={{ color: '#a1a1aa' }}>|</span>
                <span style={{ color: '#71717a', fontSize: '13px' }}>{selectedIds.length} selected</span>
                <select value={bulkStatus} onChange={(e) => setBulkStatus(e.target.value)} style={{ ...inputStyle, width: 'auto' }}>
                  <option value="">Set status to...</option>
                  <option value="In Stock">In Stock</option>
                  <option value="For Sale">For Sale</option>
                  <option value="Sold">Sold</option>
                  <option value="BHPH">BHPH</option>
                  <option value="Active">Active</option>
                  <option value="Inactive">Inactive</option>
                </select>
                <button onClick={bulkUpdateStatus} disabled={!selectedIds.length || !bulkStatus} style={{ ...btnSuccess, opacity: selectedIds.length && bulkStatus ? 1 : 0.5 }}>Apply</button>
                <button onClick={bulkDelete} disabled={!selectedIds.length} style={{ ...btnDanger, opacity: selectedIds.length ? 1 : 0.5 }}>Delete Selected</button>
              </div>
              {tableData.length > 0 ? (
                <div style={{ overflowX: 'auto', maxHeight: '500px' }}>
                  <table style={{ width: '100%', borderCollapse: 'collapse', fontSize: '11px' }}>
                    <thead>
                      <tr style={{ backgroundColor: '#3f3f46', position: 'sticky', top: 0 }}>
                        <th style={{ padding: '8px', width: '40px' }}>
                          <input type="checkbox" checked={selectedIds.length === tableData.length && tableData.length > 0} onChange={(e) => setSelectedIds(e.target.checked ? tableData.map(r => r.id) : [])} />
                        </th>
                        {tableColumns.slice(0, 6).map(c => <th key={c} style={{ textAlign: 'left', padding: '8px 6px', color: '#a1a1aa', fontWeight: '600' }}>{c}</th>)}
                      </tr>
                    </thead>
                    <tbody>
                      {tableData.map((row, i) => (
                        <tr key={i} style={{ borderTop: '1px solid #3f3f46', backgroundColor: selectedIds.includes(row.id) ? 'rgba(249,115,22,0.1)' : 'transparent' }}>
                          <td style={{ padding: '8px', textAlign: 'center' }}>
                            <input type="checkbox" checked={selectedIds.includes(row.id)} onChange={(e) => setSelectedIds(e.target.checked ? [...selectedIds, row.id] : selectedIds.filter(id => id !== row.id))} />
                          </td>
                          {tableColumns.slice(0, 6).map(c => (
                            <td key={c} style={{ padding: '6px', color: '#d4d4d8', maxWidth: '150px', overflow: 'hidden', textOverflow: 'ellipsis', whiteSpace: 'nowrap' }}>
                              {typeof row[c] === 'object' ? JSON.stringify(row[c]) : String(row[c] ?? '')}
                            </td>
                          ))}
                        </tr>
                      ))}
                    </tbody>
                  </table>
                </div>
              ) : (
                <p style={{ textAlign: 'center', color: '#71717a', padding: '40px' }}>Load a table to perform bulk operations</p>
              )}
            </div>
          </div>
        )}

        {/* SQL RUNNER */}
        {activeSection === 'sql' && (
          <div>
            <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'center', marginBottom: '20px' }}>
              <h2 style={{ fontSize: '20px', fontWeight: '700', margin: 0 }}>SQL Runner</h2>
              <HelpButton />
            </div>
            <div style={cardStyle}>
              <textarea value={sqlQuery} onChange={(e) => setSqlQuery(e.target.value)} placeholder="SELECT * FROM inventory LIMIT 10" rows={5} style={{ ...inputStyle, fontFamily: 'monospace', fontSize: '13px', marginBottom: '12px' }} />
              <div style={{ display: 'flex', gap: '8px', marginBottom: '16px' }}>
                <button onClick={runSQL} style={btnPrimary}>Run Query</button>
                <button onClick={() => setSqlQuery('')} style={btnSecondary}>Clear</button>
              </div>
              {sqlError && <div style={{ backgroundColor: '#450a0a', border: '1px solid #ef4444', borderRadius: '8px', padding: '12px', marginBottom: '16px', color: '#fca5a5', fontSize: '13px' }}>{sqlError}</div>}
              {sqlResult && (
                <div style={{ overflowX: 'auto', maxHeight: '400px' }}>
                  <pre style={{ backgroundColor: '#09090b', padding: '12px', borderRadius: '8px', fontSize: '11px', color: '#d4d4d8', overflow: 'auto' }}>{JSON.stringify(sqlResult, null, 2)}</pre>
                </div>
              )}
              <p style={{ color: '#71717a', fontSize: '12px', marginTop: '12px' }}>Note: SQL Runner requires a Supabase RPC function. If not working, use the Data Browser above.</p>
            </div>
          </div>
        )}

        {/* BHPH COMMAND */}
        {activeSection === 'bhph' && (
          <div>
            <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'center', marginBottom: '20px' }}>
              <h2 style={{ fontSize: '20px', fontWeight: '700', margin: 0 }}>BHPH Command Center</h2>
              <HelpButton />
            </div>
            <div style={{ display: 'grid', gridTemplateColumns: 'repeat(auto-fill, minmax(180px, 1fr))', gap: '12px', marginBottom: '20px' }}>
              <div style={cardStyle}><div style={{ color: '#a1a1aa', fontSize: '13px', marginBottom: '6px' }}>Active Loans</div><div style={{ fontSize: '28px', fontWeight: '700' }}>{bhphLoans?.filter(l => l.status === 'Active').length || 0}</div></div>
              <div style={cardStyle}><div style={{ color: '#a1a1aa', fontSize: '13px', marginBottom: '6px' }}>Total Owed</div><div style={{ fontSize: '28px', fontWeight: '700' }}>${bhphLoans?.reduce((s, l) => s + (parseFloat(l.current_balance) || 0), 0).toLocaleString()}</div></div>
              <div style={cardStyle}><div style={{ color: '#a1a1aa', fontSize: '13px', marginBottom: '6px' }}>Late Payments</div><div style={{ fontSize: '28px', fontWeight: '700', color: lateLoans.length > 0 ? '#ef4444' : '#fff' }}>{lateLoans.length}</div></div>
              <div style={cardStyle}><div style={{ color: '#a1a1aa', fontSize: '13px', marginBottom: '6px' }}>Repo Queue (30+ days)</div><div style={{ fontSize: '28px', fontWeight: '700', color: repoQueue.length > 0 ? '#ef4444' : '#fff' }}>{repoQueue.length}</div></div>
            </div>
            <div style={cardStyle}>
              <h3 style={{ fontSize: '16px', fontWeight: '600', marginBottom: '16px' }}>All BHPH Loans</h3>
              <table style={{ width: '100%', borderCollapse: 'collapse', fontSize: '13px' }}>
                <thead>
                  <tr style={{ borderBottom: '1px solid #3f3f46' }}>
                    <th style={{ textAlign: 'left', padding: '10px 8px', color: '#a1a1aa' }}>Customer</th>
                    <th style={{ textAlign: 'left', padding: '10px 8px', color: '#a1a1aa' }}>Balance</th>
                    <th style={{ textAlign: 'left', padding: '10px 8px', color: '#a1a1aa' }}>Payment</th>
                    <th style={{ textAlign: 'left', padding: '10px 8px', color: '#a1a1aa' }}>Status</th>
                  </tr>
                </thead>
                <tbody>
                  {bhphLoans?.map(l => (
                    <tr key={l.id} style={{ borderBottom: '1px solid #3f3f46' }}>
                      <td style={{ padding: '10px 8px' }}>{l.customer_name}</td>
                      <td style={{ padding: '10px 8px', color: '#22c55e' }}>${(parseFloat(l.current_balance) || 0).toLocaleString()}</td>
                      <td style={{ padding: '10px 8px', color: '#a1a1aa' }}>${(parseFloat(l.monthly_payment) || 0).toLocaleString()}/mo</td>
                      <td style={{ padding: '10px 8px' }}><span style={{ padding: '2px 8px', borderRadius: '4px', fontSize: '11px', backgroundColor: l.status === 'Active' ? '#22c55e' : l.status === 'Paid Off' ? '#3b82f6' : '#ef4444' }}>{l.status}</span></td>
                    </tr>
                  ))}
                </tbody>
              </table>
              {(!bhphLoans || bhphLoans.length === 0) && <p style={{ textAlign: 'center', color: '#71717a', padding: '20px' }}>No BHPH loans</p>}
            </div>
          </div>
        )}

        {/* PROMOS */}
        {activeSection === 'promos' && (
          <div>
            <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'center', marginBottom: '20px' }}>
              <h2 style={{ fontSize: '20px', fontWeight: '700', margin: 0 }}>Promo Codes ({promoCodes.length})</h2>
              <div style={{ display: 'flex', gap: '8px' }}>
                <button onClick={() => setPromoModal({ code: '', description: '', discount_type: 'percent', discount_value: '', active: true })} style={btnSuccess}>+ New Promo</button>
                <HelpButton />
              </div>
            </div>
            <div style={cardStyle}>
              <table style={{ width: '100%', borderCollapse: 'collapse', fontSize: '13px' }}>
                <thead>
                  <tr style={{ borderBottom: '1px solid #3f3f46' }}>
                    <th style={{ textAlign: 'left', padding: '10px 8px', color: '#a1a1aa' }}>Code</th>
                    <th style={{ textAlign: 'left', padding: '10px 8px', color: '#a1a1aa' }}>Discount</th>
                    <th style={{ textAlign: 'left', padding: '10px 8px', color: '#a1a1aa' }}>Used</th>
                    <th style={{ textAlign: 'left', padding: '10px 8px', color: '#a1a1aa' }}>Status</th>
                    <th style={{ padding: '10px 8px', color: '#a1a1aa' }}>Actions</th>
                  </tr>
                </thead>
                <tbody>
                  {promoCodes.map(p => (
                    <tr key={p.id} style={{ borderBottom: '1px solid #3f3f46' }}>
                      <td style={{ padding: '10px 8px', fontFamily: 'monospace', fontWeight: '600' }}>{p.code}</td>
                      <td style={{ padding: '10px 8px', color: '#22c55e' }}>{p.discount_type === 'percent' ? `${p.discount_value}%` : `$${p.discount_value}`}</td>
                      <td style={{ padding: '10px 8px', color: '#a1a1aa' }}>{p.times_used || 0}</td>
                      <td style={{ padding: '10px 8px' }}><span style={{ padding: '2px 8px', borderRadius: '4px', fontSize: '11px', backgroundColor: p.active ? '#22c55e' : '#ef4444' }}>{p.active ? 'Active' : 'Off'}</span></td>
                      <td style={{ padding: '10px 8px', textAlign: 'center' }}>
                        <button onClick={() => togglePromo(p.id, p.active)} style={{ background: 'none', border: 'none', color: '#eab308', cursor: 'pointer', fontSize: '12px', marginRight: '8px' }}>{p.active ? 'Disable' : 'Enable'}</button>
                        <button onClick={() => setPromoModal(p)} style={{ background: 'none', border: 'none', color: '#3b82f6', cursor: 'pointer', fontSize: '12px' }}>Edit</button>
                      </td>
                    </tr>
                  ))}
                </tbody>
              </table>
              {promoCodes.length === 0 && <p style={{ textAlign: 'center', color: '#71717a', padding: '20px' }}>No promo codes yet</p>}
            </div>
          </div>
        )}

        {/* TEMPLATES */}
        {activeSection === 'templates' && (
          <div>
            <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'center', marginBottom: '20px' }}>
              <h2 style={{ fontSize: '20px', fontWeight: '700', margin: 0 }}>Message Templates ({messageTemplates.length})</h2>
              <div style={{ display: 'flex', gap: '8px' }}>
                <button onClick={() => setSmsModal({ to: '', message: '' })} style={btnPrimary}>Send SMS</button>
                <button onClick={() => setTemplateModal({ name: '', type: 'sms', subject: '', body: '', active: true })} style={btnSuccess}>+ New Template</button>
                <HelpButton />
              </div>
            </div>
            <div style={{ display: 'grid', gap: '12px' }}>
              {messageTemplates.map(t => (
                <div key={t.id} style={{ ...cardStyle, marginBottom: 0 }}>
                  <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'center', marginBottom: '8px' }}>
                    <div style={{ display: 'flex', alignItems: 'center', gap: '10px' }}>
                      <span style={{ fontWeight: '600' }}>{t.name}</span>
                      <span style={{ padding: '2px 8px', borderRadius: '4px', fontSize: '10px', backgroundColor: t.type === 'sms' ? '#22c55e' : '#3b82f6', textTransform: 'uppercase' }}>{t.type}</span>
                    </div>
                    <button onClick={() => setTemplateModal(t)} style={{ background: 'none', border: 'none', color: '#3b82f6', cursor: 'pointer', fontSize: '12px' }}>Edit</button>
                  </div>
                  <p style={{ color: '#a1a1aa', fontSize: '13px', margin: 0 }}>{t.body?.substring(0, 100)}{t.body?.length > 100 ? '...' : ''}</p>
                </div>
              ))}
              {messageTemplates.length === 0 && <div style={{ ...cardStyle, textAlign: 'center', color: '#71717a' }}>No templates yet</div>}
            </div>
          </div>
        )}

        {/* AUDIT LOG */}
        {activeSection === 'audit' && (
          <div>
            <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'center', marginBottom: '20px' }}>
              <h2 style={{ fontSize: '20px', fontWeight: '700', margin: 0 }}>Audit Log ({auditLogs.length})</h2>
              <div style={{ display: 'flex', gap: '8px' }}>
                <button onClick={loadAllData} style={btnSecondary}>Refresh</button>
                <HelpButton />
              </div>
            </div>
            <div style={cardStyle}>
              <table style={{ width: '100%', borderCollapse: 'collapse', fontSize: '12px' }}>
                <thead>
                  <tr style={{ borderBottom: '1px solid #3f3f46' }}>
                    <th style={{ textAlign: 'left', padding: '10px 8px', color: '#a1a1aa' }}>Time</th>
                    <th style={{ textAlign: 'left', padding: '10px 8px', color: '#a1a1aa' }}>Action</th>
                    <th style={{ textAlign: 'left', padding: '10px 8px', color: '#a1a1aa' }}>Table</th>
                    <th style={{ textAlign: 'left', padding: '10px 8px', color: '#a1a1aa' }}>Record</th>
                    <th style={{ textAlign: 'left', padding: '10px 8px', color: '#a1a1aa' }}>User</th>
                  </tr>
                </thead>
                <tbody>
                  {auditLogs.map(l => (
                    <tr key={l.id} style={{ borderBottom: '1px solid #3f3f46' }}>
                      <td style={{ padding: '10px 8px', color: '#71717a' }}>{new Date(l.created_at).toLocaleString()}</td>
                      <td style={{ padding: '10px 8px' }}><span style={{ padding: '2px 8px', borderRadius: '4px', fontSize: '10px', backgroundColor: l.action?.includes('DELETE') ? '#ef4444' : l.action?.includes('UPDATE') ? '#eab308' : '#22c55e' }}>{l.action}</span></td>
                      <td style={{ padding: '10px 8px' }}>{l.table_name}</td>
                      <td style={{ padding: '10px 8px', color: '#a1a1aa', fontFamily: 'monospace', fontSize: '11px' }}>{l.record_id}</td>
                      <td style={{ padding: '10px 8px', color: '#a1a1aa' }}>{l.user_name || '-'}</td>
                    </tr>
                  ))}
                </tbody>
              </table>
              {auditLogs.length === 0 && <p style={{ textAlign: 'center', color: '#71717a', padding: '20px' }}>No audit logs yet</p>}
            </div>
          </div>
        )}

        {/* SYSTEM */}
        {activeSection === 'system' && (
          <div>
            <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'center', marginBottom: '20px' }}>
              <h2 style={{ fontSize: '20px', fontWeight: '700', margin: 0 }}>System</h2>
              <HelpButton />
            </div>
            <div style={cardStyle}>
              <h3 style={{ fontSize: '16px', fontWeight: '600', marginBottom: '12px' }}>Info</h3>
              <p style={{ color: '#a1a1aa', margin: '8px 0' }}>Supabase: <span style={{ color: '#fff' }}>rlzudfinlxonpbwacxpt</span></p>
              <p style={{ color: '#a1a1aa', margin: '8px 0' }}>Current Dealer: <span style={{ color: '#fff' }}>{dealer?.dealer_name}</span></p>
              <p style={{ color: '#a1a1aa', margin: '8px 0' }}>Dealer ID: <span style={{ color: '#fff' }}>{dealerId}</span></p>
              <p style={{ color: '#a1a1aa', margin: '8px 0' }}>State: <span style={{ color: '#fff' }}>{dealer?.state}</span></p>
            </div>
            <div style={cardStyle}>
              <h3 style={{ fontSize: '16px', fontWeight: '600', marginBottom: '12px' }}>Actions</h3>
              <div style={{ display: 'flex', gap: '8px', flexWrap: 'wrap' }}>
                <button onClick={() => { localStorage.clear(); window.location.href = '/login'; }} style={btnDanger}>Clear Storage & Logout</button>
                <button onClick={() => window.location.reload()} style={btnPrimary}>Refresh Page</button>
                <button onClick={loadAllData} style={btnSuccess}>Reload All Data</button>
                <a href="https://supabase.com/dashboard/project/rlzudfinlxonpbwacxpt" target="_blank" rel="noreferrer" style={{ ...btnSecondary, textDecoration: 'none', display: 'inline-block' }}>Open Supabase</a>
                <a href="https://og-dix-motor-club.sentry.io" target="_blank" rel="noreferrer" style={{ ...btnSecondary, textDecoration: 'none', display: 'inline-block' }}>Open Sentry</a>
              </div>
            </div>
          </div>
        )}
      </div>

      {/* TOAST */}
      {toast && <div style={{ position: 'fixed', bottom: '24px', right: '24px', backgroundColor: toast.type === 'error' ? '#ef4444' : '#22c55e', padding: '12px 20px', borderRadius: '8px', color: '#fff', fontWeight: '500', zIndex: 100 }}>{toast.message}</div>}

      {/* HELP MODAL */}
      <HelpModal />

      {/* DELETE DEALER MODAL */}
      {confirmDelete && (
        <div style={{ position: 'fixed', inset: 0, backgroundColor: 'rgba(0,0,0,0.7)', display: 'flex', alignItems: 'center', justifyContent: 'center', zIndex: 100 }}>
          <div style={{ backgroundColor: '#27272a', borderRadius: '12px', padding: '24px', maxWidth: '400px', width: '90%' }}>
            <h3 style={{ fontSize: '18px', fontWeight: '700', marginBottom: '12px', color: '#ef4444' }}>Delete Dealer?</h3>
            <p style={{ color: '#a1a1aa', marginBottom: '8px' }}>Delete <strong style={{ color: '#fff' }}>{confirmDelete.dealer_name}</strong> and ALL data:</p>
            <ul style={{ color: '#71717a', fontSize: '13px', marginBottom: '20px', paddingLeft: '20px' }}><li>Inventory</li><li>Deals</li><li>BHPH Loans</li><li>Customers</li><li>Employees</li></ul>
            <p style={{ color: '#ef4444', fontSize: '13px', fontWeight: '600', marginBottom: '20px' }}>This cannot be undone.</p>
            <div style={{ display: 'flex', gap: '12px', justifyContent: 'flex-end' }}>
              <button onClick={() => setConfirmDelete(null)} style={btnSecondary}>Cancel</button>
              <button onClick={() => deleteDealer(confirmDelete.id)} style={btnDanger}>Delete Forever</button>
            </div>
          </div>
        </div>
      )}

      {/* DELETE USER MODAL */}
      {confirmDeleteUser && (
        <div style={{ position: 'fixed', inset: 0, backgroundColor: 'rgba(0,0,0,0.7)', display: 'flex', alignItems: 'center', justifyContent: 'center', zIndex: 100 }}>
          <div style={{ backgroundColor: '#27272a', borderRadius: '12px', padding: '24px', maxWidth: '400px', width: '90%' }}>
            <h3 style={{ fontSize: '18px', fontWeight: '700', marginBottom: '12px', color: '#ef4444' }}>Delete User?</h3>
            <p style={{ color: '#a1a1aa', marginBottom: '16px' }}>Delete <strong style={{ color: '#fff' }}>{confirmDeleteUser.name}</strong>?</p>
            <p style={{ color: '#71717a', fontSize: '13px', marginBottom: '16px' }}>This will remove the user permanently. Commission history and other records referencing this user may be affected.</p>
            <p style={{ color: '#ef4444', fontSize: '13px', fontWeight: '600', marginBottom: '20px' }}>This cannot be undone.</p>
            <div style={{ display: 'flex', gap: '12px', justifyContent: 'flex-end' }}>
              <button onClick={() => setConfirmDeleteUser(null)} style={btnSecondary}>Cancel</button>
              <button onClick={() => deleteUser(confirmDeleteUser.id)} style={btnDanger}>Delete User</button>
            </div>
          </div>
        </div>
      )}

      {/* IMPERSONATE MODAL */}
      {impersonateModal && (
        <div style={{ position: 'fixed', inset: 0, backgroundColor: 'rgba(0,0,0,0.7)', display: 'flex', alignItems: 'center', justifyContent: 'center', zIndex: 100 }}>
          <div style={{ backgroundColor: '#27272a', borderRadius: '12px', padding: '24px', maxWidth: '400px', width: '90%' }}>
            <h3 style={{ fontSize: '18px', fontWeight: '700', marginBottom: '12px' }}>View As Dealer</h3>
            <p style={{ color: '#a1a1aa', marginBottom: '20px' }}>Switch to <strong style={{ color: '#fff' }}>{impersonateModal.dealer_name}</strong>?</p>
            <p style={{ color: '#71717a', fontSize: '13px', marginBottom: '20px' }}>You will see all their data as if you were logged in as them.</p>
            <div style={{ display: 'flex', gap: '12px', justifyContent: 'flex-end' }}>
              <button onClick={() => setImpersonateModal(null)} style={btnSecondary}>Cancel</button>
              <button onClick={() => impersonateDealer(impersonateModal)} style={btnPrimary}>Switch</button>
            </div>
          </div>
        </div>
      )}

      {/* PROMO MODAL */}
      {promoModal && (
        <div style={{ position: 'fixed', inset: 0, backgroundColor: 'rgba(0,0,0,0.7)', display: 'flex', alignItems: 'center', justifyContent: 'center', zIndex: 100 }}>
          <div style={{ backgroundColor: '#27272a', borderRadius: '12px', padding: '24px', maxWidth: '400px', width: '90%' }}>
            <h3 style={{ fontSize: '18px', fontWeight: '700', marginBottom: '16px' }}>{promoModal.id ? 'Edit' : 'New'} Promo Code</h3>
            <div style={{ display: 'flex', flexDirection: 'column', gap: '12px' }}>
              <input type="text" placeholder="CODE" value={promoModal.code || ''} onChange={(e) => setPromoModal({ ...promoModal, code: e.target.value.toUpperCase() })} style={{ ...inputStyle, fontFamily: 'monospace' }} />
              <input type="text" placeholder="Description" value={promoModal.description || ''} onChange={(e) => setPromoModal({ ...promoModal, description: e.target.value })} style={inputStyle} />
              <div style={{ display: 'flex', gap: '8px' }}>
                <select value={promoModal.discount_type || 'percent'} onChange={(e) => setPromoModal({ ...promoModal, discount_type: e.target.value })} style={{ ...inputStyle, flex: 1 }}>
                  <option value="percent">Percent Off</option>
                  <option value="fixed">Fixed Amount</option>
                </select>
                <input type="number" placeholder="Value" value={promoModal.discount_value || ''} onChange={(e) => setPromoModal({ ...promoModal, discount_value: e.target.value })} style={{ ...inputStyle, flex: 1 }} />
              </div>
            </div>
            <div style={{ display: 'flex', gap: '12px', justifyContent: 'flex-end', marginTop: '20px' }}>
              <button onClick={() => setPromoModal(null)} style={btnSecondary}>Cancel</button>
              <button onClick={savePromo} style={btnSuccess}>Save</button>
            </div>
          </div>
        </div>
      )}

      {/* TEMPLATE MODAL */}
      {templateModal && (
        <div style={{ position: 'fixed', inset: 0, backgroundColor: 'rgba(0,0,0,0.7)', display: 'flex', alignItems: 'center', justifyContent: 'center', zIndex: 100 }}>
          <div style={{ backgroundColor: '#27272a', borderRadius: '12px', padding: '24px', maxWidth: '500px', width: '90%' }}>
            <h3 style={{ fontSize: '18px', fontWeight: '700', marginBottom: '16px' }}>{templateModal.id ? 'Edit' : 'New'} Template</h3>
            <div style={{ display: 'flex', flexDirection: 'column', gap: '12px' }}>
              <input type="text" placeholder="Template Name" value={templateModal.name || ''} onChange={(e) => setTemplateModal({ ...templateModal, name: e.target.value })} style={inputStyle} />
              <select value={templateModal.type || 'sms'} onChange={(e) => setTemplateModal({ ...templateModal, type: e.target.value })} style={inputStyle}>
                <option value="sms">SMS</option>
                <option value="email">Email</option>
              </select>
              {templateModal.type === 'email' && <input type="text" placeholder="Subject" value={templateModal.subject || ''} onChange={(e) => setTemplateModal({ ...templateModal, subject: e.target.value })} style={inputStyle} />}
              <textarea placeholder="Message body..." value={templateModal.body || ''} onChange={(e) => setTemplateModal({ ...templateModal, body: e.target.value })} rows={5} style={inputStyle} />
              <p style={{ color: '#71717a', fontSize: '12px' }}>Variables: {'{customer_name}'}, {'{vehicle}'}, {'{balance}'}, {'{payment}'}</p>
            </div>
            <div style={{ display: 'flex', gap: '12px', justifyContent: 'flex-end', marginTop: '20px' }}>
              <button onClick={() => setTemplateModal(null)} style={btnSecondary}>Cancel</button>
              <button onClick={saveTemplate} style={btnSuccess}>Save</button>
            </div>
          </div>
        </div>
      )}

      {/* SMS MODAL */}
      {smsModal && (
        <div style={{ position: 'fixed', inset: 0, backgroundColor: 'rgba(0,0,0,0.7)', display: 'flex', alignItems: 'center', justifyContent: 'center', zIndex: 100 }}>
          <div style={{ backgroundColor: '#27272a', borderRadius: '12px', padding: '24px', maxWidth: '400px', width: '90%' }}>
            <h3 style={{ fontSize: '18px', fontWeight: '700', marginBottom: '16px' }}>Send SMS</h3>
            <div style={{ display: 'flex', flexDirection: 'column', gap: '12px' }}>
              <input type="tel" placeholder="Phone number" value={smsModal.to || ''} onChange={(e) => setSmsModal({ ...smsModal, to: e.target.value })} style={inputStyle} />
              <textarea placeholder="Message..." value={smsModal.message || ''} onChange={(e) => setSmsModal({ ...smsModal, message: e.target.value })} rows={4} style={inputStyle} />
              {messageTemplates.length > 0 && (
                <select onChange={(e) => { const t = messageTemplates.find(m => m.id === parseInt(e.target.value)); if (t) setSmsModal({ ...smsModal, message: t.body }); }} style={inputStyle}>
                  <option value="">Use template...</option>
                  {messageTemplates.filter(t => t.type === 'sms').map(t => <option key={t.id} value={t.id}>{t.name}</option>)}
                </select>
              )}
            </div>
            <div style={{ display: 'flex', gap: '12px', justifyContent: 'flex-end', marginTop: '20px' }}>
              <button onClick={() => setSmsModal(null)} style={btnSecondary}>Cancel</button>
              <button onClick={sendSMS} style={btnSuccess}>Send</button>
            </div>
          </div>
        </div>
      )}

      {/* FORM MODAL (Library) */}
      {formModal && (
        <div style={{ position: 'fixed', inset: 0, backgroundColor: 'rgba(0,0,0,0.7)', display: 'flex', alignItems: 'center', justifyContent: 'center', zIndex: 100, padding: '20px' }}>
          <div style={{ backgroundColor: '#27272a', borderRadius: '12px', padding: '24px', maxWidth: '500px', width: '100%', maxHeight: '90vh', overflowY: 'auto' }}>
            <h3 style={{ fontSize: '18px', fontWeight: '700', marginBottom: '16px' }}>{formModal.id ? 'Edit' : 'Add'} Form</h3>
            <div style={{ display: 'flex', flexDirection: 'column', gap: '12px' }}>
              <div style={{ display: 'flex', gap: '8px' }}>
                <input type="text" placeholder="State (e.g. UT)" value={formModal.state || ''} onChange={(e) => setFormModal({ ...formModal, state: e.target.value.toUpperCase() })} style={{ ...inputStyle, flex: 1 }} maxLength={2} />
                <input type="text" placeholder="County (optional)" value={formModal.county || ''} onChange={(e) => setFormModal({ ...formModal, county: e.target.value })} style={{ ...inputStyle, flex: 2 }} />
              </div>
              <input type="text" placeholder="Form Number (e.g. TC-69)" value={formModal.form_number || ''} onChange={(e) => setFormModal({ ...formModal, form_number: e.target.value.toUpperCase() })} style={inputStyle} />
              <input type="text" placeholder="Form Name" value={formModal.form_name || ''} onChange={(e) => setFormModal({ ...formModal, form_name: e.target.value })} style={inputStyle} />
              <select value={formModal.category || 'deal'} onChange={(e) => setFormModal({ ...formModal, category: e.target.value })} style={inputStyle}>
                {formCategories.map(c => <option key={c} value={c}>{c.charAt(0).toUpperCase() + c.slice(1)}</option>)}
              </select>
              <input type="url" placeholder="Source URL (link to PDF)" value={formModal.source_url || ''} onChange={(e) => setFormModal({ ...formModal, source_url: e.target.value })} style={inputStyle} />
              <textarea placeholder="Description..." value={formModal.description || ''} onChange={(e) => setFormModal({ ...formModal, description: e.target.value })} rows={3} style={inputStyle} />
              <label style={{ display: 'flex', alignItems: 'center', gap: '8px', color: '#a1a1aa', fontSize: '14px' }}>
                <input type="checkbox" checked={formModal.is_active ?? true} onChange={(e) => setFormModal({ ...formModal, is_active: e.target.checked })} />
                Active (available for use in deals)
              </label>
            </div>
            <div style={{ display: 'flex', gap: '12px', justifyContent: 'flex-end', marginTop: '20px' }}>
              <button onClick={() => setFormModal(null)} style={btnSecondary}>Cancel</button>
              <button onClick={saveLibraryForm} style={btnSuccess}>Save</button>
            </div>
          </div>
        </div>
      )}

      {/* RULE MODAL (Compliance Rules) */}
      {ruleModal && (
        <div style={{ position: 'fixed', inset: 0, backgroundColor: 'rgba(0,0,0,0.7)', display: 'flex', alignItems: 'center', justifyContent: 'center', zIndex: 100, padding: '20px' }}>
          <div style={{ backgroundColor: '#27272a', borderRadius: '12px', padding: '24px', maxWidth: '500px', width: '100%', maxHeight: '90vh', overflowY: 'auto' }}>
            <h3 style={{ fontSize: '18px', fontWeight: '700', marginBottom: '16px' }}>{ruleModal.id ? 'Edit' : 'Add'} Compliance Rule</h3>
            <div style={{ display: 'flex', flexDirection: 'column', gap: '12px' }}>
              <input type="text" placeholder="Rule Name (e.g. Title Transfer Deadline)" value={ruleModal.rule_name || ''} onChange={(e) => setRuleModal({ ...ruleModal, rule_name: e.target.value })} style={inputStyle} />
              <div style={{ display: 'flex', gap: '8px' }}>
                <input type="text" placeholder="State" value={ruleModal.state || ''} onChange={(e) => setRuleModal({ ...ruleModal, state: e.target.value.toUpperCase() })} style={{ ...inputStyle, flex: 1 }} maxLength={2} />
                <select value={ruleModal.category || 'title'} onChange={(e) => setRuleModal({ ...ruleModal, category: e.target.value })} style={{ ...inputStyle, flex: 2 }}>
                  {formCategories.map(c => <option key={c} value={c}>{c.charAt(0).toUpperCase() + c.slice(1)}</option>)}
                </select>
              </div>
              <div style={{ display: 'flex', gap: '8px' }}>
                <div style={{ flex: 1 }}>
                  <label style={{ display: 'block', color: '#a1a1aa', fontSize: '12px', marginBottom: '4px' }}>Deadline (days)</label>
                  <input type="number" placeholder="30" value={ruleModal.deadline_days || ''} onChange={(e) => setRuleModal({ ...ruleModal, deadline_days: e.target.value })} style={inputStyle} />
                </div>
                <div style={{ flex: 1 }}>
                  <label style={{ display: 'block', color: '#a1a1aa', fontSize: '12px', marginBottom: '4px' }}>Late Fee ($)</label>
                  <input type="number" placeholder="25" value={ruleModal.late_fee || ''} onChange={(e) => setRuleModal({ ...ruleModal, late_fee: e.target.value })} style={inputStyle} />
                </div>
              </div>
              <input type="text" placeholder="Agency (e.g. Utah DMV)" value={ruleModal.agency || ''} onChange={(e) => setRuleModal({ ...ruleModal, agency: e.target.value })} style={inputStyle} />
              <input type="text" placeholder="Required Forms (comma separated)" value={ruleModal.required_forms || ''} onChange={(e) => setRuleModal({ ...ruleModal, required_forms: e.target.value })} style={inputStyle} />
              <textarea placeholder="Description / Notes..." value={ruleModal.description || ''} onChange={(e) => setRuleModal({ ...ruleModal, description: e.target.value })} rows={3} style={inputStyle} />
              <label style={{ display: 'flex', alignItems: 'center', gap: '8px', color: '#a1a1aa', fontSize: '14px' }}>
                <input type="checkbox" checked={ruleModal.is_verified || false} onChange={(e) => setRuleModal({ ...ruleModal, is_verified: e.target.checked })} />
                Verified (human-reviewed for accuracy)
              </label>
            </div>
            <div style={{ display: 'flex', gap: '12px', justifyContent: 'flex-end', marginTop: '20px' }}>
              <button onClick={() => setRuleModal(null)} style={btnSecondary}>Cancel</button>
              <button onClick={saveRule} style={btnSuccess}>Save</button>
            </div>
          </div>
        </div>
      )}

      {/* FIELD MAPPER MODAL (Library) */}
      {fieldMapperModal && (
        <div style={{ position: 'fixed', inset: 0, backgroundColor: 'rgba(0,0,0,0.85)', display: 'flex', alignItems: 'center', justifyContent: 'center', zIndex: 100, padding: '20px' }}>
          <div style={{ backgroundColor: '#18181b', borderRadius: '12px', maxWidth: '1200px', width: '100%', maxHeight: '90vh', display: 'flex', flexDirection: 'column', border: '1px solid #27272a' }}>
            {/* Header */}
            <div style={{ padding: '20px 24px', borderBottom: '1px solid #27272a', display: 'flex', justifyContent: 'space-between', alignItems: 'center' }}>
              <div>
                <h3 style={{ fontSize: '18px', fontWeight: '700', margin: '0 0 4px 0' }}>Field Mapper: {fieldMapperModal.form_number}</h3>
                <p style={{ color: '#a1a1aa', fontSize: '13px', margin: 0 }}>{fieldMapperModal.form_name}</p>
              </div>
              <div style={{ display: 'flex', alignItems: 'center', gap: '16px' }}>
                <div style={{ textAlign: 'right' }}>
                  <div style={{ fontSize: '12px', color: '#a1a1aa' }}>Mapping Confidence</div>
                  <div style={{ fontSize: '24px', fontWeight: '700', color: Object.values(fieldMapperModal.field_mapping || {}).filter(v => v).length === (fieldMapperModal.detected_fields?.length || 0) ? '#22c55e' : '#eab308' }}>
                    {Math.round((Object.values(fieldMapperModal.field_mapping || {}).filter(v => v).length / (fieldMapperModal.detected_fields?.length || 1)) * 100)}%
                  </div>
                </div>
                <button onClick={() => setFieldMapperModal(null)} style={{ background: 'none', border: 'none', color: '#71717a', fontSize: '24px', cursor: 'pointer' }}>×</button>
              </div>
            </div>

            {/* Content */}
            <div style={{ flex: 1, display: 'flex', overflow: 'hidden' }}>
              {/* PDF Preview (left) */}
              <div style={{ flex: 1, borderRight: '1px solid #27272a', display: 'flex', flexDirection: 'column' }}>
                <div style={{ padding: '12px 16px', backgroundColor: '#27272a', fontSize: '13px', fontWeight: '600' }}>PDF Preview</div>
                <div style={{ flex: 1, display: 'flex', alignItems: 'center', justifyContent: 'center', backgroundColor: '#09090b', padding: '20px' }}>
                  {(fieldMapperModal.source_url || (fieldMapperModal.storage_bucket && fieldMapperModal.storage_path)) ? (
                    <iframe src={fieldMapperModal.source_url || `https://rlzudfinlxonpbwacxpt.supabase.co/storage/v1/object/public/${fieldMapperModal.storage_bucket}/${fieldMapperModal.storage_path}`} style={{ width: '100%', height: '100%', border: 'none', borderRadius: '8px' }} title="PDF Preview" />
                  ) : (
                    <div style={{ textAlign: 'center', color: '#71717a' }}>
                      <div style={{ fontSize: '48px', marginBottom: '12px' }}>📄</div>
                      <p>No PDF URL provided</p>
                      <p style={{ fontSize: '12px' }}>Add a source URL to the form to preview</p>
                    </div>
                  )}
                </div>
              </div>

              {/* Field Mapping (right) */}
              <div style={{ width: '450px', display: 'flex', flexDirection: 'column' }}>
                <div style={{ padding: '12px 16px', backgroundColor: '#27272a', fontSize: '13px', fontWeight: '600' }}>Detected Fields ({fieldMapperModal.detected_fields?.length || 0})</div>
                <div style={{ flex: 1, overflowY: 'auto', padding: '16px' }}>
                  <p style={{ color: '#a1a1aa', fontSize: '12px', marginBottom: '16px' }}>Map each PDF field to a deal context variable:</p>
                  {(fieldMapperModal.detected_fields || []).map((field, idx) => (
                    <div key={idx} style={{ marginBottom: '16px', padding: '12px', backgroundColor: '#27272a', borderRadius: '8px', border: fieldMapperModal.field_mapping?.[field] ? '1px solid #22c55e' : '1px solid #3f3f46' }}>
                      <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'center', marginBottom: '8px' }}>
                        <span style={{ fontFamily: 'monospace', fontSize: '13px', fontWeight: '600' }}>{field}</span>
                        {fieldMapperModal.field_mapping?.[field] && <span style={{ fontSize: '10px', color: '#22c55e' }}>MAPPED</span>}
                      </div>
                      <select
                        value={fieldMapperModal.field_mapping?.[field] || ''}
                        onChange={(e) => updateFieldMapping(field, e.target.value)}
                        style={{ ...inputStyle, fontSize: '12px' }}
                      >
                        <option value="">-- Select mapping --</option>
                        {fieldContextOptions.map(group => (
                          <optgroup key={group.group} label={group.group}>
                            {group.fields.map(f => (
                              <option key={f} value={f}>{f}</option>
                            ))}
                          </optgroup>
                        ))}
                      </select>
                    </div>
                  ))}
                  {(!fieldMapperModal.detected_fields || fieldMapperModal.detected_fields.length === 0) && (
                    <div style={{ textAlign: 'center', padding: '40px', color: '#71717a' }}>
                      <p>No fields detected yet.</p>
                      <p style={{ fontSize: '12px' }}>Use "Analyze" on the Staging tab to detect PDF fields.</p>
                    </div>
                  )}
                </div>
              </div>
            </div>

            {/* Footer */}
            <div style={{ padding: '16px 24px', borderTop: '1px solid #27272a', display: 'flex', justifyContent: 'space-between', alignItems: 'center' }}>
              <div style={{ color: '#71717a', fontSize: '12px' }}>
                {Object.values(fieldMapperModal.field_mapping || {}).filter(v => v).length} of {fieldMapperModal.detected_fields?.length || 0} fields mapped
              </div>
              <div style={{ display: 'flex', gap: '12px' }}>
                <button onClick={() => setFieldMapperModal(null)} style={btnSecondary}>Cancel</button>
                <button onClick={saveFieldMapping} style={btnSuccess}>Save Mapping</button>
              </div>
            </div>
          </div>
        </div>
      )}

      {/* BULK DELETE STATE MODAL */}
      {confirmBulkDelete && (
        <div style={{ position: 'fixed', inset: 0, backgroundColor: 'rgba(0,0,0,0.7)', display: 'flex', alignItems: 'center', justifyContent: 'center', zIndex: 100 }}>
          <div style={{ backgroundColor: '#27272a', borderRadius: '12px', padding: '24px', maxWidth: '450px', width: '90%' }}>
            <h3 style={{ fontSize: '18px', fontWeight: '700', marginBottom: '12px', color: '#ef4444' }}>Delete All {confirmBulkDelete} Forms?</h3>
            <p style={{ color: '#a1a1aa', marginBottom: '16px' }}>
              This will permanently delete <strong style={{ color: '#fff' }}>{formStaging.filter(f => f.state === confirmBulkDelete).length} forms</strong> for {confirmBulkDelete} from staging.
            </p>
            <p style={{ color: '#71717a', fontSize: '13px', marginBottom: '16px' }}>
              {formStaging.filter(f => f.state === confirmBulkDelete && f.status === 'active').length > 0 && (
                <span style={{ color: '#eab308' }}>
                  {formStaging.filter(f => f.state === confirmBulkDelete && f.status === 'active').length} promoted forms will also be removed from the library.
                </span>
              )}
              {formStaging.filter(f => f.state === confirmBulkDelete && f.status === 'active').length === 0 && (
                'This allows fresh AI discovery for this state.'
              )}
            </p>
            <p style={{ color: '#ef4444', fontSize: '13px', fontWeight: '600', marginBottom: '20px' }}>This cannot be undone.</p>
            <div style={{ display: 'flex', gap: '12px', justifyContent: 'flex-end' }}>
              <button onClick={() => setConfirmBulkDelete(null)} style={btnSecondary}>Cancel</button>
              <button onClick={() => bulkDeleteStagingState(confirmBulkDelete)} style={btnDanger}>Delete All {confirmBulkDelete}</button>
            </div>
          </div>
        </div>
      )}

      {/* PROMOTE FORM MODAL - Ask which library */}
      {promoteModal && (
        <div style={{ position: 'fixed', inset: 0, backgroundColor: 'rgba(0,0,0,0.7)', display: 'flex', alignItems: 'center', justifyContent: 'center', zIndex: 100 }}>
          <div style={{ backgroundColor: '#27272a', borderRadius: '12px', padding: '24px', maxWidth: '500px', width: '90%' }}>
            <h3 style={{ fontSize: '18px', fontWeight: '700', marginBottom: '12px', color: '#22c55e' }}>Promote to Library</h3>
            <p style={{ color: '#a1a1aa', marginBottom: '8px' }}>
              Promoting <strong style={{ color: '#fff' }}>{promoteModal.form?.form_name}</strong> ({promoteModal.form?.form_number})
            </p>

            {/* Show compliance info if available */}
            {(promoteModal.form?.has_deadline || promoteModal.form?.cadence) && (
              <div style={{ backgroundColor: '#3f3f46', borderRadius: '8px', padding: '12px', marginBottom: '16px' }}>
                <div style={{ fontSize: '12px', color: '#a1a1aa', marginBottom: '8px' }}>Compliance Info:</div>
                {promoteModal.form?.deadline_description && <div style={{ color: '#ef4444', fontSize: '13px' }}>⏰ {promoteModal.form.deadline_description}</div>}
                {promoteModal.form?.has_deadline && !promoteModal.form?.deadline_description && <div style={{ color: '#ef4444', fontSize: '13px' }}>⏰ Due within {promoteModal.form.deadline_days} days</div>}
                {promoteModal.form?.cadence && <div style={{ color: '#3b82f6', fontSize: '13px' }}>📅 {promoteModal.form.cadence === 'per_transaction' ? 'Required per sale' : promoteModal.form.cadence}</div>}
              </div>
            )}

            <div style={{ marginBottom: '20px' }}>
              <label style={{ display: 'block', color: '#a1a1aa', fontSize: '12px', marginBottom: '8px' }}>Select Library Category:</label>
              <div style={{ display: 'grid', gridTemplateColumns: '1fr 1fr', gap: '8px' }}>
                {[
                  { id: 'deal', label: 'Deal Docs', desc: 'Per-sale: title, registration, bill of sale', color: '#22c55e' },
                  { id: 'finance', label: 'Finance Docs', desc: 'BHPH, retail installment, disclosures', color: '#3b82f6' },
                  { id: 'licensing', label: 'Licensing Docs', desc: 'Dealer license, bonds, permits', color: '#f97316' },
                  { id: 'tax', label: 'Tax Docs', desc: 'Sales tax returns, use tax filings', color: '#ef4444' },
                  { id: 'reporting', label: 'Reporting Docs', desc: 'DMV reports, inventory reports', color: '#8b5cf6' },
                ].map(lib => (
                  <button
                    key={lib.id}
                    onClick={() => setPromoteModal({ ...promoteModal, selectedLibrary: lib.id })}
                    style={{
                      padding: '12px',
                      borderRadius: '8px',
                      border: promoteModal.selectedLibrary === lib.id ? `2px solid ${lib.color}` : '2px solid #3f3f46',
                      backgroundColor: promoteModal.selectedLibrary === lib.id ? `${lib.color}22` : '#18181b',
                      cursor: 'pointer',
                      textAlign: 'left'
                    }}
                  >
                    <div style={{ fontWeight: '600', color: lib.color, fontSize: '13px' }}>{lib.label}</div>
                    <div style={{ color: '#71717a', fontSize: '10px', marginTop: '4px' }}>{lib.desc}</div>
                  </button>
                ))}
              </div>
            </div>

            <div style={{ display: 'flex', gap: '12px', justifyContent: 'flex-end' }}>
              <button onClick={() => setPromoteModal(null)} style={btnSecondary}>Cancel</button>
              <button onClick={() => promoteToLibrary(promoteModal.form, promoteModal.selectedLibrary)} style={btnSuccess}>Promote to {promoteModal.selectedLibrary?.charAt(0).toUpperCase() + promoteModal.selectedLibrary?.slice(1)} Library</button>
            </div>
          </div>
        </div>
      )}

      {/* DELETE STAGED FORM MODAL */}
      {deleteStagedModal && (
        <div style={{ position: 'fixed', inset: 0, backgroundColor: 'rgba(0,0,0,0.7)', display: 'flex', alignItems: 'center', justifyContent: 'center', zIndex: 100 }}>
          <div style={{ backgroundColor: '#27272a', borderRadius: '12px', padding: '24px', maxWidth: '450px', width: '90%' }}>
            <h3 style={{ fontSize: '18px', fontWeight: '700', marginBottom: '12px', color: '#ef4444' }}>Delete Form?</h3>
            <p style={{ color: '#a1a1aa', marginBottom: '16px' }}>
              Delete <strong style={{ color: '#fff' }}>{deleteStagedModal.form_name}</strong> ({deleteStagedModal.form_number})?
            </p>
            <p style={{ color: '#71717a', fontSize: '13px', marginBottom: '16px' }}>
              This will permanently remove it from staging{deleteStagedModal.status === 'active' ? ' and the library' : ''}.
            </p>
            <p style={{ color: '#ef4444', fontSize: '13px', fontWeight: '600', marginBottom: '20px' }}>This cannot be undone.</p>
            <div style={{ display: 'flex', gap: '12px', justifyContent: 'flex-end' }}>
              <button onClick={() => setDeleteStagedModal(null)} style={btnSecondary}>Cancel</button>
              <button onClick={() => deleteStagedForm(deleteStagedModal)} style={btnDanger}>Delete Forever</button>
            </div>
          </div>
        </div>
      )}

      {/* UPLOAD FORM MODAL */}
      {uploadFormModal && (
        <div style={{ position: 'fixed', inset: 0, backgroundColor: 'rgba(0,0,0,0.7)', display: 'flex', alignItems: 'center', justifyContent: 'center', zIndex: 100, padding: '20px' }}>
          <div style={{ backgroundColor: '#27272a', borderRadius: '12px', padding: '24px', maxWidth: '500px', width: '100%', maxHeight: '90vh', overflowY: 'auto' }}>
            <h3 style={{ fontSize: '18px', fontWeight: '700', marginBottom: '16px' }}>Upload Form to Staging</h3>
            <p style={{ color: '#a1a1aa', fontSize: '13px', marginBottom: '20px' }}>
              Manually add a form that AI missed. Form will be added to staging for analysis and mapping.
            </p>
            <div style={{ display: 'flex', flexDirection: 'column', gap: '12px' }}>
              <div>
                <label style={{ display: 'block', color: '#a1a1aa', fontSize: '12px', marginBottom: '4px' }}>State *</label>
                <select
                  value={uploadFormModal.state || ''}
                  onChange={(e) => setUploadFormModal({ ...uploadFormModal, state: e.target.value })}
                  style={{ backgroundColor: '#3f3f46', color: '#fff', padding: '10px 12px', borderRadius: '6px', border: 'none', width: '100%' }}
                >
                  <option value="">Select State...</option>
                  {['AL','AK','AZ','AR','CA','CO','CT','DE','FL','GA','HI','ID','IL','IN','IA','KS','KY','LA','ME','MD','MA','MI','MN','MS','MO','MT','NE','NV','NH','NJ','NM','NY','NC','ND','OH','OK','OR','PA','RI','SC','SD','TN','TX','UT','VT','VA','WA','WV','WI','WY','DC'].map(s => (
                    <option key={s} value={s}>{s}</option>
                  ))}
                </select>
              </div>
              <div>
                <label style={{ display: 'block', color: '#a1a1aa', fontSize: '12px', marginBottom: '4px' }}>Form Number *</label>
                <input
                  type="text"
                  placeholder="e.g., TC-69, MVD-13"
                  value={uploadFormModal.form_number || ''}
                  onChange={(e) => setUploadFormModal({ ...uploadFormModal, form_number: e.target.value.toUpperCase() })}
                  style={{ backgroundColor: '#3f3f46', color: '#fff', padding: '10px 12px', borderRadius: '6px', border: 'none', width: '100%', fontFamily: 'monospace' }}
                />
              </div>
              <div>
                <label style={{ display: 'block', color: '#a1a1aa', fontSize: '12px', marginBottom: '4px' }}>Form Name *</label>
                <input
                  type="text"
                  placeholder="e.g., Motor Vehicle Contract of Sale"
                  value={uploadFormModal.form_name || ''}
                  onChange={(e) => setUploadFormModal({ ...uploadFormModal, form_name: e.target.value })}
                  style={{ backgroundColor: '#3f3f46', color: '#fff', padding: '10px 12px', borderRadius: '6px', border: 'none', width: '100%' }}
                />
              </div>
              <div>
                <label style={{ display: 'block', color: '#a1a1aa', fontSize: '12px', marginBottom: '4px' }}>PDF File (optional)</label>
                <input
                  type="file"
                  accept=".pdf"
                  onChange={(e) => setUploadFormModal({ ...uploadFormModal, file: e.target.files?.[0] || null })}
                  style={{ backgroundColor: '#3f3f46', color: '#fff', padding: '10px 12px', borderRadius: '6px', border: 'none', width: '100%' }}
                />
                {uploadFormModal.file && (
                  <p style={{ color: '#22c55e', fontSize: '12px', marginTop: '4px' }}>Selected: {uploadFormModal.file.name}</p>
                )}
              </div>
              <div>
                <label style={{ display: 'block', color: '#a1a1aa', fontSize: '12px', marginBottom: '4px' }}>Or Source URL (if no file upload)</label>
                <input
                  type="url"
                  placeholder="https://dmv.state.gov/forms/tc-69.pdf"
                  value={uploadFormModal.source_url || ''}
                  onChange={(e) => setUploadFormModal({ ...uploadFormModal, source_url: e.target.value })}
                  style={{ backgroundColor: '#3f3f46', color: '#fff', padding: '10px 12px', borderRadius: '6px', border: 'none', width: '100%' }}
                />
              </div>
            </div>
            <div style={{ display: 'flex', gap: '12px', justifyContent: 'flex-end', marginTop: '20px' }}>
              <button onClick={() => setUploadFormModal(null)} style={btnSecondary}>Cancel</button>
              <button
                onClick={uploadFormToStaging}
                disabled={!uploadFormModal.state || !uploadFormModal.form_number || !uploadFormModal.form_name}
                style={{
                  ...btnSuccess,
                  opacity: (!uploadFormModal.state || !uploadFormModal.form_number || !uploadFormModal.form_name) ? 0.5 : 1,
                  cursor: (!uploadFormModal.state || !uploadFormModal.form_number || !uploadFormModal.form_name) ? 'not-allowed' : 'pointer'
                }}
              >
                Upload to Staging
              </button>
            </div>
          </div>
        </div>
      )}

      {/* STAGING MAPPER MODAL */}
      {stagingMapperModal && (
        <div style={{ position: 'fixed', inset: 0, backgroundColor: 'rgba(0,0,0,0.85)', display: 'flex', alignItems: 'center', justifyContent: 'center', zIndex: 100, padding: '20px' }}>
          <div style={{ backgroundColor: '#18181b', borderRadius: '12px', maxWidth: '1200px', width: '100%', maxHeight: '90vh', display: 'flex', flexDirection: 'column', border: '1px solid #27272a' }}>
            {/* Header */}
            <div style={{ padding: '20px 24px', borderBottom: '1px solid #27272a', display: 'flex', justifyContent: 'space-between', alignItems: 'center' }}>
              <div>
                <h3 style={{ fontSize: '18px', fontWeight: '700', margin: '0 0 4px 0' }}>
                  <span style={{ padding: '4px 8px', borderRadius: '4px', fontSize: '10px', backgroundColor: '#eab308', color: '#000', marginRight: '10px' }}>STAGING</span>
                  {stagingMapperModal.form_number}
                </h3>
                <p style={{ color: '#a1a1aa', fontSize: '13px', margin: 0 }}>{stagingMapperModal.form_name}</p>
              </div>
              <div style={{ display: 'flex', alignItems: 'center', gap: '16px' }}>
                <div style={{ textAlign: 'right' }}>
                  <div style={{ fontSize: '12px', color: '#a1a1aa' }}>Mapping Score</div>
                  {(() => {
                    const dismissedFields = stagingMapperModal.dismissed_fields || {};
                    const dismissedCount = Object.keys(dismissedFields).length;
                    const mappedCount = Object.entries(stagingMapperModal.field_mapping || {}).filter(([field, v]) => {
                      if (dismissedFields[field]) return false;
                      return v && (typeof v === 'string' ? !!v : v.fields?.length > 0);
                    }).length;
                    const totalFields = (stagingMapperModal.detected_fields?.length || 1) - dismissedCount;
                    const score = totalFields > 0 ? Math.round((mappedCount / totalFields) * 100) : 100;
                    const isReady = score >= 99;
                    return (
                      <div style={{ fontSize: '24px', fontWeight: '700', color: isReady ? '#22c55e' : '#eab308' }}>
                        {score}%
                        {dismissedCount > 0 && <span style={{ fontSize: '11px', marginLeft: '6px', color: '#71717a' }}>({dismissedCount} dismissed)</span>}
                        {isReady && <span style={{ fontSize: '12px', marginLeft: '8px', color: '#22c55e' }}>Ready!</span>}
                      </div>
                    );
                  })()}
                </div>
                <button onClick={() => setStagingMapperModal(null)} style={{ background: 'none', border: 'none', color: '#71717a', fontSize: '24px', cursor: 'pointer' }}>×</button>
              </div>
            </div>

            {/* Content */}
            <div style={{ flex: 1, display: 'flex', overflow: 'hidden' }}>
              {/* PDF Preview (left) */}
              <div style={{ flex: 1, borderRight: '1px solid #27272a', display: 'flex', flexDirection: 'column' }}>
                <div style={{ padding: '12px 16px', backgroundColor: '#27272a', fontSize: '13px', fontWeight: '600' }}>PDF Preview</div>
                <div style={{ flex: 1, display: 'flex', alignItems: 'center', justifyContent: 'center', backgroundColor: '#09090b', padding: '20px' }}>
                  {(stagingMapperModal.source_url || (stagingMapperModal.storage_bucket && stagingMapperModal.storage_path)) ? (
                    <iframe src={stagingMapperModal.source_url || `https://rlzudfinlxonpbwacxpt.supabase.co/storage/v1/object/public/${stagingMapperModal.storage_bucket}/${stagingMapperModal.storage_path}`} style={{ width: '100%', height: '100%', border: 'none', borderRadius: '8px' }} title="PDF Preview" />
                  ) : (
                    <div style={{ textAlign: 'center', color: '#71717a' }}>
                      <div style={{ fontSize: '48px', marginBottom: '12px' }}>📄</div>
                      <p>No PDF URL provided</p>
                      <p style={{ fontSize: '12px' }}>Add a source URL to the form to preview</p>
                    </div>
                  )}
                </div>
              </div>

              {/* Field Mapping (right) */}
              <div style={{ width: '450px', display: 'flex', flexDirection: 'column' }}>
                {(() => {
                  // Sort fields: unmapped first, then mapped, dismissed at bottom
                  const allFields = stagingMapperModal.detected_fields || [];
                  const dismissedFields = stagingMapperModal.dismissed_fields || {};

                  const unmappedFields = allFields.filter(field => {
                    if (dismissedFields[field]) return false;
                    const mapping = stagingMapperModal.field_mapping?.[field];
                    const mappedFieldsArr = getMappingFields(mapping);
                    return mappedFieldsArr.length === 0;
                  });
                  const mappedFieldsList = allFields.filter(field => {
                    if (dismissedFields[field]) return false;
                    const mapping = stagingMapperModal.field_mapping?.[field];
                    const mappedFieldsArr = getMappingFields(mapping);
                    return mappedFieldsArr.length > 0;
                  });
                  const dismissedFieldsList = allFields.filter(field => dismissedFields[field]);

                  const renderFieldRow = (field, idx, isDismissed = false) => {
                    const mapping = stagingMapperModal.field_mapping?.[field];
                    const mappedFieldsArr = getMappingFields(mapping);
                    const separator = getMappingSeparator(mapping);
                    const isMapped = mappedFieldsArr.length > 0 && !isDismissed;
                    const isMulti = mappedFieldsArr.length > 1;
                    return (
                      <div key={idx} style={{
                        marginBottom: '12px',
                        padding: '12px',
                        backgroundColor: isDismissed ? 'rgba(113,113,122,0.1)' : (isMapped ? '#27272a' : 'rgba(239,68,68,0.1)'),
                        borderRadius: '8px',
                        borderLeft: isDismissed ? '4px solid #71717a' : (isMapped ? '4px solid #22c55e' : '4px solid #ef4444'),
                        opacity: isDismissed ? 0.6 : 1
                      }}>
                        <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'center', marginBottom: isDismissed ? '0' : '8px' }}>
                          <span style={{ fontFamily: 'monospace', fontSize: '13px', fontWeight: '600', textDecoration: isDismissed ? 'line-through' : 'none' }}>{field}</span>
                          <div style={{ display: 'flex', alignItems: 'center', gap: '6px' }}>
                            {isDismissed ? (
                              <>
                                <span style={{ fontSize: '10px', color: '#71717a', padding: '2px 6px', backgroundColor: 'rgba(113,113,122,0.2)', borderRadius: '4px' }}>Dismissed</span>
                                <button onClick={() => restoreField(field)} style={{ fontSize: '10px', color: '#3b82f6', background: 'none', border: 'none', cursor: 'pointer', textDecoration: 'underline' }}>Restore</button>
                              </>
                            ) : (
                              <>
                                {isMulti && <span style={{ fontSize: '10px', color: '#8b5cf6', padding: '2px 6px', backgroundColor: 'rgba(139,92,246,0.2)', borderRadius: '4px' }}>MULTI</span>}
                                {isMapped ? (
                                  <span style={{ fontSize: '10px', color: '#22c55e', padding: '2px 6px', backgroundColor: 'rgba(34,197,94,0.2)', borderRadius: '4px' }}>✓ Mapped</span>
                                ) : (
                                  <>
                                    <span style={{ fontSize: '10px', color: '#ef4444', padding: '2px 6px', backgroundColor: 'rgba(239,68,68,0.2)', borderRadius: '4px' }}>Not Mapped</span>
                                    <button onClick={() => dismissField(field)} style={{ fontSize: '10px', color: '#71717a', background: 'none', border: 'none', cursor: 'pointer' }} title="Mark as not needed">Dismiss</button>
                                  </>
                                )}
                              </>
                            )}
                          </div>
                        </div>

                        {/* Only show mapping UI for non-dismissed fields */}
                        {!isDismissed && (
                          <>
                            {/* Show currently mapped fields as removable chips */}
                            {mappedFieldsArr.length > 0 && (
                              <div style={{ display: 'flex', flexWrap: 'wrap', gap: '4px', marginBottom: '8px' }}>
                                {mappedFieldsArr.map((mf, mfIdx) => (
                                  <span key={mfIdx} style={{
                                    display: 'inline-flex', alignItems: 'center', gap: '4px',
                                    padding: '3px 8px', backgroundColor: '#3f3f46', borderRadius: '4px', fontSize: '11px'
                                  }}>
                                    {mf}
                                    <button onClick={() => removeStagingFieldMapping(field, mf)} style={{ background: 'none', border: 'none', color: '#ef4444', cursor: 'pointer', padding: '0', fontSize: '14px', lineHeight: 1 }}>×</button>
                                  </span>
                                ))}
                              </div>
                            )}

                        {/* Separator input when multiple fields */}
                        {isMulti && (
                          <div style={{ display: 'flex', alignItems: 'center', gap: '8px', marginBottom: '8px' }}>
                            <span style={{ fontSize: '11px', color: '#a1a1aa' }}>Join with:</span>
                            <select
                              value={separator}
                              onChange={(e) => updateStagingSeparator(field, e.target.value)}
                              style={{ ...inputStyle, fontSize: '11px', padding: '4px 8px', width: 'auto' }}
                            >
                              <option value=" ">Space</option>
                              <option value=", ">Comma + Space</option>
                              <option value=" - ">Dash</option>
                              <option value="">No separator</option>
                            </select>
                            <span style={{ fontSize: '10px', color: '#71717a' }}>Preview: {mappedFieldsArr.join(separator || '')}</span>
                          </div>
                        )}

                            {/* Add field dropdown */}
                            <div style={{ display: 'flex', gap: '8px' }}>
                              <select
                                value=""
                                onChange={(e) => {
                                  if (mappedFieldsArr.length === 0) {
                                    updateStagingFieldMapping(field, e.target.value);
                                  } else {
                                    addStagingFieldMapping(field, e.target.value);
                                  }
                                }}
                                style={{ ...inputStyle, fontSize: '12px', borderColor: isMapped ? '#22c55e' : '#ef4444', flex: 1 }}
                              >
                                <option value="">{mappedFieldsArr.length === 0 ? '-- Select field --' : '+ Add another field...'}</option>
                                {fieldContextOptions.map(group => (
                                  <optgroup key={group.group} label={group.group}>
                                    {group.fields.filter(f => !mappedFieldsArr.includes(f)).map(f => (
                                      <option key={f} value={f}>{f}</option>
                                    ))}
                                  </optgroup>
                                ))}
                              </select>
                            </div>
                          </>
                        )}
                      </div>
                    );
                  };

                  return (
                    <>
                      <div style={{ padding: '12px 16px', backgroundColor: '#27272a', fontSize: '13px', fontWeight: '600', display: 'flex', justifyContent: 'space-between' }}>
                        <span>PDF Fields ({allFields.length})</span>
                        <span style={{ color: '#a1a1aa' }}>
                          <span style={{ color: '#ef4444' }}>{unmappedFields.length} unmapped</span>
                          {' / '}
                          <span style={{ color: '#22c55e' }}>{mappedFieldsList.length} mapped</span>
                          {dismissedFieldsList.length > 0 && (
                            <span style={{ color: '#71717a' }}> / {dismissedFieldsList.length} dismissed</span>
                          )}
                        </span>
                      </div>
                      <div style={{ flex: 1, overflowY: 'auto', padding: '16px' }}>
                        {/* UNMAPPED SECTION */}
                        {unmappedFields.length > 0 && (
                          <>
                            <div style={{
                              padding: '8px 12px',
                              marginBottom: '12px',
                              backgroundColor: 'rgba(239,68,68,0.15)',
                              borderRadius: '6px',
                              borderLeft: '4px solid #ef4444',
                              display: 'flex',
                              alignItems: 'center',
                              gap: '8px'
                            }}>
                              <span style={{ fontSize: '16px' }}>⚠️</span>
                              <span style={{ fontSize: '13px', fontWeight: '600', color: '#ef4444' }}>
                                UNMAPPED ({unmappedFields.length})
                              </span>
                              <span style={{ fontSize: '11px', color: '#a1a1aa' }}>— needs attention</span>
                            </div>
                            {unmappedFields.map((field, idx) => renderFieldRow(field, `unmapped-${idx}`))}
                          </>
                        )}

                        {/* MAPPED SECTION */}
                        {mappedFieldsList.length > 0 && (
                          <>
                            <div style={{
                              padding: '8px 12px',
                              marginBottom: '12px',
                              marginTop: unmappedFields.length > 0 ? '20px' : '0',
                              backgroundColor: 'rgba(34,197,94,0.15)',
                              borderRadius: '6px',
                              borderLeft: '4px solid #22c55e',
                              display: 'flex',
                              alignItems: 'center',
                              gap: '8px'
                            }}>
                              <span style={{ fontSize: '16px' }}>✅</span>
                              <span style={{ fontSize: '13px', fontWeight: '600', color: '#22c55e' }}>
                                MAPPED ({mappedFieldsList.length})
                              </span>
                            </div>
                            {mappedFieldsList.map((field, idx) => renderFieldRow(field, `mapped-${idx}`))}
                          </>
                        )}

                        {/* DISMISSED SECTION */}
                        {dismissedFieldsList.length > 0 && (
                          <>
                            <div style={{
                              padding: '8px 12px',
                              marginBottom: '12px',
                              marginTop: '20px',
                              backgroundColor: 'rgba(113,113,122,0.15)',
                              borderRadius: '6px',
                              borderLeft: '4px solid #71717a',
                              display: 'flex',
                              alignItems: 'center',
                              gap: '8px'
                            }}>
                              <span style={{ fontSize: '16px' }}>🚫</span>
                              <span style={{ fontSize: '13px', fontWeight: '600', color: '#71717a' }}>
                                DISMISSED ({dismissedFieldsList.length})
                              </span>
                              <span style={{ fontSize: '11px', color: '#52525b' }}>— excluded from score</span>
                            </div>
                            {dismissedFieldsList.map((field, idx) => renderFieldRow(field, `dismissed-${idx}`, true))}
                          </>
                        )}

                        {allFields.length === 0 && (
                          <div style={{ textAlign: 'center', padding: '40px', color: '#71717a' }}>
                            <p>No fields detected.</p>
                            <p style={{ fontSize: '12px' }}>Click "Analyze" to detect PDF fields.</p>
                          </div>
                        )}
                      </div>
                    </>
                  );
                })()}
              </div>
            </div>

            {/* Footer */}
            <div style={{ padding: '16px 24px', borderTop: '1px solid #27272a', display: 'flex', justifyContent: 'space-between', alignItems: 'center' }}>
              <div style={{ color: '#71717a', fontSize: '12px' }}>
                {(() => {
                  const mappedCount = Object.values(stagingMapperModal.field_mapping || {}).filter(v => {
                    if (!v) return false;
                    if (typeof v === 'string') return !!v;
                    return v.fields && v.fields.length > 0;
                  }).length;
                  const totalFields = stagingMapperModal.detected_fields?.length || 0;
                  const unmapped = totalFields - mappedCount;
                  return unmapped > 0
                    ? `${unmapped} field${unmapped > 1 ? 's' : ''} need${unmapped === 1 ? 's' : ''} mapping to reach 100%`
                    : '✓ All fields mapped - ready to promote!';
                })()}
              </div>
              <div style={{ display: 'flex', gap: '12px' }}>
                <button onClick={() => setStagingMapperModal(null)} style={btnSecondary}>Cancel</button>
                <button onClick={saveStagingMapping} style={{ ...btnPrimary }}>Save Mapping</button>
                {(() => {
                  const mappedCount = Object.values(stagingMapperModal.field_mapping || {}).filter(v => v).length;
                  const totalFields = stagingMapperModal.detected_fields?.length || 0;
                  const isComplete = totalFields > 0 && mappedCount === totalFields;
                  return isComplete && stagingMapperModal.form_number_confirmed && stagingMapperModal.source_url ? (
                    <button
                      onClick={() => {
                        saveStagingMapping();
                        setPromoteModal({ form: stagingMapperModal, selectedLibrary: stagingMapperModal.category || 'deal' });
                      }}
                      style={{ ...btnSuccess, fontWeight: '700' }}
                    >
                      Promote to Production
                    </button>
                  ) : null;
                })()}
              </div>
            </div>
          </div>
        </div>
      )}

      {/* FORM TEMPLATE GENERATOR MODAL */}
      {templateGeneratorModal && (
        <FormTemplateGenerator
          formId={templateGeneratorModal.id}
          pdfUrl={templateGeneratorModal.source_url || templateGeneratorModal.storage_path}
          formName={templateGeneratorModal.form_name}
          state={templateGeneratorModal.state}
          onSave={(result) => {
            showToast(`HTML template saved for ${templateGeneratorModal.form_name}`);
            setTemplateGeneratorModal(null);
            loadAllData();
          }}
          onClose={() => setTemplateGeneratorModal(null)}
        />
      )}

      {/* UPDATE CHECK RESULTS MODAL */}
      {updateCheckModal && (
        <div style={{ position: 'fixed', inset: 0, backgroundColor: 'rgba(0,0,0,0.8)', display: 'flex', alignItems: 'center', justifyContent: 'center', zIndex: 100, padding: '20px' }}>
          <div style={{ backgroundColor: '#18181b', borderRadius: '12px', maxWidth: '900px', width: '100%', maxHeight: '85vh', display: 'flex', flexDirection: 'column', border: '1px solid #27272a' }}>
            {/* Header */}
            <div style={{ padding: '20px 24px', borderBottom: '1px solid #27272a', display: 'flex', justifyContent: 'space-between', alignItems: 'center' }}>
              <div>
                <h3 style={{ fontSize: '18px', fontWeight: '700', margin: 0 }}>Update Check Results - {updateCheckModal.state}</h3>
                <p style={{ color: '#a1a1aa', fontSize: '13px', margin: '4px 0 0 0' }}>
                  {updateCheckModal.summary?.new_forms_count || 0} new forms, {updateCheckModal.summary?.potential_updates_count || 0} updates, {updateCheckModal.summary?.unchanged_count || 0} up to date
                  {(updateCheckModal.summary?.newsletters_count > 0 || updateCheckModal.summary?.regulatory_updates_count > 0) && (
                    <span> | {updateCheckModal.summary?.newsletters_count || 0} news, {updateCheckModal.summary?.regulatory_updates_count || 0} regulatory</span>
                  )}
                </p>
              </div>
              <button onClick={() => setUpdateCheckModal(null)} style={{ background: 'none', border: 'none', color: '#71717a', cursor: 'pointer', fontSize: '24px' }}>×</button>
            </div>

            {/* Content */}
            <div style={{ flex: 1, overflowY: 'auto', padding: '20px 24px' }}>

              {/* NEW FORMS SECTION */}
              {updateCheckModal.new_forms?.length > 0 && (
                <div style={{ marginBottom: '24px' }}>
                  <h4 style={{ fontSize: '14px', fontWeight: '600', color: '#22c55e', marginBottom: '12px', display: 'flex', alignItems: 'center', gap: '8px' }}>
                    <span style={{ fontSize: '16px' }}>✨</span>
                    New Forms Found ({updateCheckModal.new_forms.length})
                  </h4>
                  <div style={{ backgroundColor: '#27272a', borderRadius: '8px', overflow: 'hidden' }}>
                    <table style={{ width: '100%', borderCollapse: 'collapse', fontSize: '12px' }}>
                      <thead>
                        <tr style={{ borderBottom: '1px solid #3f3f46' }}>
                          <th style={{ textAlign: 'left', padding: '10px 12px', color: '#a1a1aa' }}>Form Name</th>
                          <th style={{ textAlign: 'left', padding: '10px 12px', color: '#a1a1aa', width: '80px' }}>Form #</th>
                          <th style={{ textAlign: 'center', padding: '10px 12px', color: '#a1a1aa', width: '60px' }}>Source</th>
                          <th style={{ textAlign: 'center', padding: '10px 12px', color: '#a1a1aa', width: '80px' }}>Action</th>
                        </tr>
                      </thead>
                      <tbody>
                        {updateCheckModal.new_forms.map((form, idx) => (
                          <tr key={idx} style={{ borderBottom: '1px solid #3f3f46' }}>
                            <td style={{ padding: '10px 12px' }}>
                              <div style={{ fontWeight: '500', marginBottom: '2px' }}>{form.form_name?.substring(0, 60)}{form.form_name?.length > 60 ? '...' : ''}</div>
                              {form.description && <div style={{ color: '#71717a', fontSize: '11px' }}>{form.description?.substring(0, 80)}...</div>}
                            </td>
                            <td style={{ padding: '10px 12px', fontFamily: 'monospace', color: '#8b5cf6' }}>{form.form_number || '-'}</td>
                            <td style={{ padding: '10px 12px', textAlign: 'center' }}>
                              <div style={{ display: 'flex', gap: '4px', justifyContent: 'center' }}>
                                {form.is_gov && <span style={{ padding: '2px 6px', backgroundColor: '#166534', borderRadius: '4px', fontSize: '10px' }}>.gov</span>}
                                {form.is_pdf && <span style={{ padding: '2px 6px', backgroundColor: '#1e40af', borderRadius: '4px', fontSize: '10px' }}>PDF</span>}
                              </div>
                            </td>
                            <td style={{ padding: '10px 12px', textAlign: 'center' }}>
                              <button onClick={() => addFormFromCheck(form)} style={{ padding: '4px 12px', backgroundColor: '#22c55e', color: '#000', border: 'none', borderRadius: '4px', fontSize: '11px', fontWeight: '600', cursor: 'pointer' }}>Add</button>
                            </td>
                          </tr>
                        ))}
                      </tbody>
                    </table>
                  </div>
                </div>
              )}

              {/* POTENTIAL UPDATES SECTION */}
              {updateCheckModal.potential_updates?.length > 0 && (
                <div style={{ marginBottom: '24px' }}>
                  <h4 style={{ fontSize: '14px', fontWeight: '600', color: '#eab308', marginBottom: '12px', display: 'flex', alignItems: 'center', gap: '8px' }}>
                    <span style={{ fontSize: '16px' }}>🔄</span>
                    Potential Updates ({updateCheckModal.potential_updates.length})
                  </h4>
                  <div style={{ backgroundColor: '#27272a', borderRadius: '8px', overflow: 'hidden' }}>
                    <table style={{ width: '100%', borderCollapse: 'collapse', fontSize: '12px' }}>
                      <thead>
                        <tr style={{ borderBottom: '1px solid #3f3f46' }}>
                          <th style={{ textAlign: 'left', padding: '10px 12px', color: '#a1a1aa' }}>Form</th>
                          <th style={{ textAlign: 'left', padding: '10px 12px', color: '#a1a1aa' }}>Reason</th>
                          <th style={{ textAlign: 'center', padding: '10px 12px', color: '#a1a1aa', width: '140px' }}>Actions</th>
                        </tr>
                      </thead>
                      <tbody>
                        {updateCheckModal.potential_updates.map((update, idx) => (
                          <tr key={idx} style={{ borderBottom: '1px solid #3f3f46' }}>
                            <td style={{ padding: '10px 12px' }}>
                              <div style={{ fontWeight: '500', marginBottom: '2px' }}>{update.existing.form_name?.substring(0, 50)}</div>
                              <div style={{ fontFamily: 'monospace', color: '#8b5cf6', fontSize: '11px' }}>{update.existing.form_number}</div>
                            </td>
                            <td style={{ padding: '10px 12px' }}>
                              <div style={{ color: '#eab308', fontSize: '11px', marginBottom: '4px' }}>{update.reason}</div>
                              <div style={{ display: 'flex', flexDirection: 'column', gap: '2px', fontSize: '10px', color: '#71717a' }}>
                                <span>Current: {update.existing.source_url?.substring(0, 40)}...</span>
                                <span>New: {update.found.source_url?.substring(0, 40)}...</span>
                              </div>
                            </td>
                            <td style={{ padding: '10px 12px', textAlign: 'center' }}>
                              <div style={{ display: 'flex', gap: '6px', justifyContent: 'center' }}>
                                <button onClick={() => updateFormFromCheck(update)} style={{ padding: '4px 10px', backgroundColor: '#3b82f6', color: '#fff', border: 'none', borderRadius: '4px', fontSize: '11px', fontWeight: '500', cursor: 'pointer' }}>Update</button>
                                <button onClick={() => ignoreUpdate(update)} style={{ padding: '4px 10px', backgroundColor: '#3f3f46', color: '#a1a1aa', border: 'none', borderRadius: '4px', fontSize: '11px', cursor: 'pointer' }}>Ignore</button>
                              </div>
                            </td>
                          </tr>
                        ))}
                      </tbody>
                    </table>
                  </div>
                </div>
              )}

              {/* UP TO DATE SECTION */}
              {(updateCheckModal.unchanged > 0 || (!updateCheckModal.new_forms?.length && !updateCheckModal.potential_updates?.length)) && (
                <div style={{ marginBottom: '24px' }}>
                  <div style={{ backgroundColor: '#27272a', borderRadius: '8px', padding: '24px', textAlign: 'center' }}>
                    <div style={{ fontSize: '32px', marginBottom: '8px' }}>✅</div>
                    <div style={{ fontSize: '16px', fontWeight: '600', color: '#22c55e', marginBottom: '4px' }}>
                      {updateCheckModal.unchanged || 0} Forms Up to Date
                    </div>
                    <div style={{ color: '#71717a', fontSize: '13px' }}>
                      These forms have valid URLs and no updates were found.
                    </div>
                  </div>
                </div>
              )}

              {/* NEWSLETTERS SECTION */}
              {updateCheckModal.newsletters?.length > 0 && (
                <div style={{ marginBottom: '24px' }}>
                  <div style={{ display: 'flex', alignItems: 'center', gap: '8px', marginBottom: '12px' }}>
                    <span style={{ fontSize: '18px' }}>📰</span>
                    <span style={{ fontWeight: '600', fontSize: '14px' }}>Newsletters & News ({updateCheckModal.newsletters.length})</span>
                  </div>
                  <div style={{ backgroundColor: '#27272a', borderRadius: '8px', overflow: 'hidden' }}>
                    <table style={{ width: '100%', borderCollapse: 'collapse', fontSize: '13px' }}>
                      <thead>
                        <tr style={{ backgroundColor: '#18181b' }}>
                          <th style={{ padding: '10px 12px', textAlign: 'left', fontWeight: '500', color: '#a1a1aa' }}>Title</th>
                          <th style={{ padding: '10px 12px', textAlign: 'left', fontWeight: '500', color: '#a1a1aa', width: '120px' }}>Source</th>
                          <th style={{ padding: '10px 12px', textAlign: 'left', fontWeight: '500', color: '#a1a1aa', width: '90px' }}>Date</th>
                          <th style={{ padding: '10px 12px', textAlign: 'right', fontWeight: '500', color: '#a1a1aa', width: '140px' }}>Actions</th>
                        </tr>
                      </thead>
                      <tbody>
                        {updateCheckModal.newsletters.map((item, idx) => (
                          <tr key={idx} style={{ borderTop: '1px solid #3f3f46' }}>
                            <td style={{ padding: '10px 12px' }}>
                              <div style={{ display: 'flex', alignItems: 'center', gap: '6px' }}>
                                {item.is_gov && <span style={{ fontSize: '10px', backgroundColor: '#166534', padding: '2px 6px', borderRadius: '3px' }}>GOV</span>}
                                <span style={{ color: '#fff' }}>{item.title.substring(0, 60)}{item.title.length > 60 ? '...' : ''}</span>
                              </div>
                            </td>
                            <td style={{ padding: '10px 12px', color: '#a1a1aa' }}>{item.source?.substring(0, 15) || '-'}</td>
                            <td style={{ padding: '10px 12px', color: '#a1a1aa' }}>{item.date || '-'}</td>
                            <td style={{ padding: '10px 12px', textAlign: 'right' }}>
                              <button
                                onClick={() => window.open(item.url, '_blank')}
                                style={{ padding: '4px 8px', backgroundColor: '#3f3f46', color: '#fff', border: 'none', borderRadius: '4px', fontSize: '11px', cursor: 'pointer', marginRight: '4px' }}
                              >View</button>
                              <button
                                onClick={() => saveNewsItem(item, 'newsletter')}
                                style={{ padding: '4px 8px', backgroundColor: '#8b5cf6', color: '#fff', border: 'none', borderRadius: '4px', fontSize: '11px', cursor: 'pointer' }}
                              >Save</button>
                            </td>
                          </tr>
                        ))}
                      </tbody>
                    </table>
                  </div>
                </div>
              )}

              {/* REGULATORY UPDATES SECTION */}
              {updateCheckModal.regulatory_updates?.length > 0 && (
                <div style={{ marginBottom: '24px' }}>
                  <div style={{ display: 'flex', alignItems: 'center', gap: '8px', marginBottom: '12px' }}>
                    <span style={{ fontSize: '18px' }}>⚖️</span>
                    <span style={{ fontWeight: '600', fontSize: '14px' }}>Regulatory Changes ({updateCheckModal.regulatory_updates.length})</span>
                  </div>
                  <div style={{ backgroundColor: '#27272a', borderRadius: '8px', overflow: 'hidden' }}>
                    <table style={{ width: '100%', borderCollapse: 'collapse', fontSize: '13px' }}>
                      <thead>
                        <tr style={{ backgroundColor: '#18181b' }}>
                          <th style={{ padding: '10px 12px', textAlign: 'left', fontWeight: '500', color: '#a1a1aa' }}>Title</th>
                          <th style={{ padding: '10px 12px', textAlign: 'left', fontWeight: '500', color: '#a1a1aa', width: '120px' }}>Source</th>
                          <th style={{ padding: '10px 12px', textAlign: 'left', fontWeight: '500', color: '#a1a1aa', width: '90px' }}>Date</th>
                          <th style={{ padding: '10px 12px', textAlign: 'right', fontWeight: '500', color: '#a1a1aa', width: '140px' }}>Actions</th>
                        </tr>
                      </thead>
                      <tbody>
                        {updateCheckModal.regulatory_updates.map((item, idx) => (
                          <tr key={idx} style={{ borderTop: '1px solid #3f3f46' }}>
                            <td style={{ padding: '10px 12px' }}>
                              <div>
                                <div style={{ display: 'flex', alignItems: 'center', gap: '6px', marginBottom: '4px' }}>
                                  {item.is_gov && <span style={{ fontSize: '10px', backgroundColor: '#166534', padding: '2px 6px', borderRadius: '3px' }}>GOV</span>}
                                  <span style={{ color: '#fff' }}>{item.title.substring(0, 55)}{item.title.length > 55 ? '...' : ''}</span>
                                </div>
                                {item.keywords_found?.length > 0 && (
                                  <div style={{ display: 'flex', gap: '4px', flexWrap: 'wrap' }}>
                                    {item.keywords_found.slice(0, 3).map((kw, ki) => (
                                      <span key={ki} style={{ fontSize: '10px', backgroundColor: '#c2410c', padding: '1px 5px', borderRadius: '3px' }}>{kw}</span>
                                    ))}
                                  </div>
                                )}
                              </div>
                            </td>
                            <td style={{ padding: '10px 12px', color: '#a1a1aa' }}>{item.source?.substring(0, 15) || '-'}</td>
                            <td style={{ padding: '10px 12px', color: '#a1a1aa' }}>{item.date || '-'}</td>
                            <td style={{ padding: '10px 12px', textAlign: 'right' }}>
                              <button
                                onClick={() => window.open(item.url, '_blank')}
                                style={{ padding: '4px 8px', backgroundColor: '#3f3f46', color: '#fff', border: 'none', borderRadius: '4px', fontSize: '11px', cursor: 'pointer', marginRight: '4px' }}
                              >View</button>
                              <button
                                onClick={() => saveNewsItem(item, 'regulation_change')}
                                style={{ padding: '4px 8px', backgroundColor: '#c2410c', color: '#fff', border: 'none', borderRadius: '4px', fontSize: '11px', cursor: 'pointer' }}
                              >Save</button>
                            </td>
                          </tr>
                        ))}
                      </tbody>
                    </table>
                  </div>
                </div>
              )}

              {/* No results */}
              {!updateCheckModal.new_forms?.length && !updateCheckModal.potential_updates?.length && !updateCheckModal.unchanged && (
                <div style={{ textAlign: 'center', padding: '40px', color: '#71717a' }}>
                  <p>No forms found to check. Run "AI Discover Forms" first to populate your form library.</p>
                </div>
              )}

              {/* POST UPDATE FORM */}
              {postUpdateForm && (
                <div style={{ backgroundColor: '#27272a', borderRadius: '8px', padding: '16px', marginTop: '16px' }}>
                  <h4 style={{ fontSize: '14px', fontWeight: '600', color: '#8b5cf6', marginBottom: '12px' }}>Post to State Updates</h4>
                  <div style={{ display: 'flex', flexDirection: 'column', gap: '12px' }}>
                    <div>
                      <label style={{ display: 'block', fontSize: '12px', color: '#a1a1aa', marginBottom: '4px' }}>Title</label>
                      <input
                        value={postUpdateForm.title}
                        onChange={(e) => setPostUpdateForm(p => ({ ...p, title: e.target.value }))}
                        style={{ ...inputStyle, fontSize: '13px' }}
                      />
                    </div>
                    <div>
                      <label style={{ display: 'block', fontSize: '12px', color: '#a1a1aa', marginBottom: '4px' }}>Summary</label>
                      <textarea
                        value={postUpdateForm.summary}
                        onChange={(e) => setPostUpdateForm(p => ({ ...p, summary: e.target.value }))}
                        rows={3}
                        style={{ ...inputStyle, fontSize: '13px', resize: 'vertical' }}
                      />
                    </div>
                    <div style={{ display: 'flex', gap: '12px' }}>
                      <div style={{ flex: 1 }}>
                        <label style={{ display: 'block', fontSize: '12px', color: '#a1a1aa', marginBottom: '4px' }}>Update Type</label>
                        <select
                          value={postUpdateForm.update_type}
                          onChange={(e) => setPostUpdateForm(p => ({ ...p, update_type: e.target.value }))}
                          style={{ ...inputStyle, fontSize: '13px' }}
                        >
                          <option value="new_form">New Form</option>
                          <option value="form_update">Form Update</option>
                          <option value="regulation_change">Regulation Change</option>
                          <option value="deadline_change">Deadline Change</option>
                          <option value="info">Info</option>
                        </select>
                      </div>
                      <div style={{ flex: 1 }}>
                        <label style={{ display: 'block', fontSize: '12px', color: '#a1a1aa', marginBottom: '4px' }}>Importance</label>
                        <select
                          value={postUpdateForm.importance}
                          onChange={(e) => setPostUpdateForm(p => ({ ...p, importance: e.target.value }))}
                          style={{ ...inputStyle, fontSize: '13px' }}
                        >
                          <option value="low">Low</option>
                          <option value="normal">Normal</option>
                          <option value="high">High</option>
                          <option value="critical">Critical</option>
                        </select>
                      </div>
                    </div>
                    <div>
                      <label style={{ display: 'block', fontSize: '12px', color: '#a1a1aa', marginBottom: '4px' }}>Source URL (optional)</label>
                      <input
                        value={postUpdateForm.source_url}
                        onChange={(e) => setPostUpdateForm(p => ({ ...p, source_url: e.target.value }))}
                        placeholder="https://..."
                        style={{ ...inputStyle, fontSize: '13px' }}
                      />
                    </div>
                    <div style={{ display: 'flex', gap: '8px', justifyContent: 'flex-end' }}>
                      <button onClick={() => setPostUpdateForm(null)} style={btnSecondary}>Cancel</button>
                      <button onClick={postStateUpdate} style={btnPrimary}>Post Update</button>
                    </div>
                  </div>
                </div>
              )}
            </div>

            {/* Footer */}
            <div style={{ padding: '16px 24px', borderTop: '1px solid #27272a', display: 'flex', justifyContent: 'space-between', alignItems: 'center' }}>
              <div>
                {(updateCheckModal.new_forms?.length > 0 || updateCheckModal.potential_updates?.length > 0) && !postUpdateForm && (
                  <button onClick={openPostUpdateForm} style={{ ...btnSecondary, display: 'flex', alignItems: 'center', gap: '6px' }}>
                    <span style={{ fontSize: '14px' }}>📋</span> Post to State Updates
                  </button>
                )}
              </div>
              <button onClick={() => { setUpdateCheckModal(null); setPostUpdateForm(null); }} style={btnSecondary}>Close</button>
            </div>
          </div>
        </div>
      )}
    </div>
  );
}