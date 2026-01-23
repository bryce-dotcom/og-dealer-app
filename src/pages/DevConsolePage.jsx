import { useState, useEffect } from 'react';
import { supabase } from '../lib/supabase';
import { useStore } from '../lib/store';

export default function DevConsolePage() {
  const { dealerId, dealer, inventory, employees, bhphLoans, deals, customers, setDealer, fetchAllData: storeRefresh } = useStore();
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
  const [stagingFilter, setStagingFilter] = useState('pending');
  
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
    setTimeout(() => setToast(null), 3000);
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
        supabase.from('compliance_rules').select('*').order('state, category'),
        supabase.from('form_staging').select('*').order('created_at', { ascending: false }),
        supabase.from('form_library').select('*').order('state, form_number'),
      ]);
      if (dealers.data) setAllDealers(dealers.data);
      if (users.data) setAllUsers(users.data);
      if (feedback.data) setFeedbackList(feedback.data);
      if (audit.data) setAuditLogs(audit.data);
      if (promos.data) setPromoCodes(promos.data);
      if (templates.data) setMessageTemplates(templates.data);
      if (rules.data) setComplianceRules(rules.data);
      if (staging.data) setFormStaging(staging.data);
      if (library.data) setFormLibrary(library.data);
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
      await supabase.from('dealer_forms').delete().eq('dealer_id', id);
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
    setLoading(true);
    try {
      const { data, error } = await supabase.functions.invoke('analyze-form', {
        body: { form_id: form.id, source_url: form.source_url }
      });
      if (error) throw error;
      if (data?.error) throw new Error(data.error);
      showToast(`Analysis complete - ${data?.mapped_fields || 0}/${data?.total_fields || 0} fields mapped (${data?.mapping_confidence || 0}%)`);
      loadAllData();
    } catch (err) {
      showToast('Analysis failed: ' + err.message, 'error');
    }
    setLoading(false);
  };

  const openStagingMapper = (form) => {
    setStagingMapperModal({
      ...form,
      detected_fields: form.detected_fields || [],
      field_mapping: form.field_mapping || {},
    });
  };

  const saveStagingMapping = async () => {
    if (!stagingMapperModal) return;
    setLoading(true);
    try {
      const mappedCount = Object.values(stagingMapperModal.field_mapping || {}).filter(v => v).length;
      const totalFields = stagingMapperModal.detected_fields?.length || 1;
      const confidence = Math.round((mappedCount / totalFields) * 100);

      await supabase.from('form_staging').update({
        field_mapping: stagingMapperModal.field_mapping,
        mapping_confidence: confidence,
      }).eq('id', stagingMapperModal.id);

      showToast(`Mapping saved - ${confidence}% complete`);
      setStagingMapperModal(null);
      loadAllData();
    } catch (err) {
      showToast('Error: ' + err.message, 'error');
    }
    setLoading(false);
  };

  const updateStagingFieldMapping = (fieldName, contextPath) => {
    setStagingMapperModal(prev => ({
      ...prev,
      field_mapping: {
        ...prev.field_mapping,
        [fieldName]: contextPath
      }
    }));
  };

  const promoteToLibrary = async (form) => {
    // Only allow promotion if mapping_confidence >= 99
    const confidence = form.mapping_confidence || 0;
    if (confidence < 99) {
      showToast(`Cannot promote - mapping confidence is ${confidence}%, needs 99%+`, 'error');
      return;
    }

    setLoading(true);
    try {
      // Create form_library entry with field mappings from staging
      const { data: newForm, error: insertErr } = await supabase.from('form_library').insert({
        form_number: form.form_number,
        form_name: form.form_name,
        state: form.state,
        county: form.county,
        category: form.form_type || form.category || 'deal',
        source_url: form.source_url,
        description: form.description,
        detected_fields: form.detected_fields || [],
        field_mapping: form.field_mapping || {},
        mapping_confidence: confidence,
        mapping_status: 'reviewed',
        is_active: true,
      }).select().single();
      if (insertErr) throw insertErr;

      // Update staging status
      await supabase.from('form_staging').update({ status: 'approved' }).eq('id', form.id);
      await logAudit('INSERT', 'form_library', newForm.id);
      showToast('Form promoted to library with field mappings');
      loadAllData();
    } catch (err) {
      showToast('Error: ' + err.message, 'error');
    }
    setLoading(false);
  };

  const rejectStagedForm = async (id) => {
    try {
      await supabase.from('form_staging').update({ status: 'rejected' }).eq('id', id);
      showToast('Form rejected');
      loadAllData();
    } catch (err) {
      showToast('Error: ' + err.message, 'error');
    }
  };

  const runAIResearch = async () => {
    if (!dealer?.state) {
      showToast('Dealer state not set', 'error');
      return;
    }
    setAiResearching(true);
    try {
      const response = await supabase.functions.invoke('discover-state-forms', {
        body: { state: dealer.state, county: dealer.county, dealer_id: dealerId }
      });

      if (response.error) {
        throw new Error(response.error.message || 'Edge function failed');
      }

      if (response.data?.error) {
        throw new Error(response.data.error);
      }

      showToast(`AI discovered ${response.data?.forms_added || 0} new forms in staging`);
      loadAllData();
    } catch (err) {
      showToast('AI Research failed: ' + err.message, 'error');
    }
    setAiResearching(false);
  };

  const getFilteredStaging = () => {
    if (stagingFilter === 'all') return formStaging;
    return formStaging.filter(f => f.status === stagingFilter);
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

  const deleteLibraryForm = async (id) => {
    if (!confirm('Delete this form from the library?')) return;
    setLoading(true);
    try {
      await supabase.from('form_library').delete().eq('id', id);
      await logAudit('DELETE', 'form_library', id);
      showToast('Form deleted');
      loadAllData();
    } catch (err) {
      showToast('Error: ' + err.message, 'error');
    }
    setLoading(false);
  };

  const getFilteredLibrary = () => {
    if (formFilter === 'all') return formLibrary;
    if (formFilter === 'needs_mapping') return formLibrary.filter(f => (f.mapping_confidence || 0) < 99);
    if (formFilter === 'ready') return formLibrary.filter(f => (f.mapping_confidence || 0) >= 99);
    return formLibrary.filter(f => f.category === formFilter);
  };

  // === FIELD MAPPER ===
  const fieldContextOptions = [
    { group: 'Dealer', fields: ['dealer.dealer_name', 'dealer.address', 'dealer.city', 'dealer.state', 'dealer.zip', 'dealer.phone', 'dealer.license_number', 'dealer.ein', 'dealer.email'] },
    { group: 'Vehicle', fields: ['vehicle.vin', 'vehicle.year', 'vehicle.make', 'vehicle.model', 'vehicle.trim', 'vehicle.color', 'vehicle.mileage', 'vehicle.stock_number', 'vehicle.body_type', 'vehicle.engine', 'vehicle.transmission', 'vehicle.fuel_type'] },
    { group: 'Deal', fields: ['deal.purchaser_name', 'deal.purchaser_address', 'deal.purchaser_city', 'deal.purchaser_state', 'deal.purchaser_zip', 'deal.purchaser_phone', 'deal.purchaser_email', 'deal.purchaser_dl', 'deal.co_buyer_name', 'deal.co_buyer_address', 'deal.date_of_sale', 'deal.sale_price', 'deal.trade_value', 'deal.trade_payoff', 'deal.down_payment', 'deal.sales_tax', 'deal.doc_fee', 'deal.registration_fee', 'deal.title_fee', 'deal.total_price', 'deal.salesperson'] },
    { group: 'Financing', fields: ['financing.amount_financed', 'financing.apr', 'financing.interest_rate', 'financing.term_months', 'financing.monthly_payment', 'financing.first_payment_date', 'financing.final_payment_date', 'financing.total_of_payments', 'financing.finance_charge'] },
    { group: 'Lien', fields: ['lien.holder_name', 'lien.holder_address', 'lien.holder_city', 'lien.holder_state', 'lien.holder_zip', 'lien.amount', 'lien.release_date'] },
    { group: 'Trade-in', fields: ['trade.vin', 'trade.year', 'trade.make', 'trade.model', 'trade.mileage'] },
    { group: 'Signatures', fields: ['signature.buyer', 'signature.co_buyer', 'signature.dealer', 'signature.date'] },
    { group: 'Odometer', fields: ['odometer.reading', 'odometer.status', 'odometer.date'] },
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

  return (
    <div style={{ minHeight: '100vh', backgroundColor: '#18181b', display: 'flex', color: '#fff' }}>
      {/* Sidebar */}
      <div style={{ width: '200px', backgroundColor: '#09090b', borderRight: '1px solid #27272a', display: 'flex', flexDirection: 'column', flexShrink: 0 }}>
        <div style={{ padding: '16px', borderBottom: '1px solid #27272a' }}>
          <h1 style={{ fontSize: '18px', fontWeight: '700', color: '#f97316', margin: 0 }}>Data Console</h1>
          <p style={{ fontSize: '12px', color: '#71717a', margin: '4px 0 0 0' }}>Master Control</p>
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
          <div>
            <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'center', marginBottom: '20px' }}>
              <h2 style={{ fontSize: '20px', fontWeight: '700', margin: 0 }}>Form Library</h2>
              <div style={{ display: 'flex', gap: '8px' }}>
                <button onClick={runAIResearch} disabled={aiResearching} style={{ ...btnPrimary, opacity: aiResearching ? 0.6 : 1 }}>
                  {aiResearching ? 'Discovering...' : 'AI Discover Forms'}
                </button>
                <HelpButton />
              </div>
            </div>

            {/* Tab Navigation */}
            <div style={{ display: 'flex', gap: '4px', marginBottom: '20px', borderBottom: '1px solid #3f3f46', paddingBottom: '4px' }}>
              {[
                { id: 'rules', label: 'Rules', count: complianceRules.length, color: '#ef4444' },
                { id: 'staging', label: 'Staging', count: formStaging.filter(f => f.status === 'pending').length, color: '#eab308' },
                { id: 'library', label: 'Library', count: formLibrary.length, color: '#22c55e' },
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
            {formLibraryTab === 'rules' && (
              <div>
                <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'center', marginBottom: '16px' }}>
                  <p style={{ color: '#a1a1aa', margin: 0, fontSize: '14px' }}>State compliance rules with deadlines, penalties, and required forms</p>
                  <button onClick={() => setRuleModal({ state: dealer?.state || 'UT', rule_name: '', category: 'title', deadline_days: 30, late_fee: 0, agency: '', required_forms: '', description: '', is_verified: false })} style={btnSuccess}>+ Add Rule</button>
                </div>

                {/* Rules Stats */}
                <div style={{ display: 'grid', gridTemplateColumns: 'repeat(auto-fill, minmax(140px, 1fr))', gap: '12px', marginBottom: '20px' }}>
                  <div style={cardStyle}><div style={{ color: '#a1a1aa', fontSize: '12px', marginBottom: '4px' }}>Total Rules</div><div style={{ fontSize: '24px', fontWeight: '700' }}>{complianceRules.length}</div></div>
                  <div style={cardStyle}><div style={{ color: '#a1a1aa', fontSize: '12px', marginBottom: '4px' }}>Verified</div><div style={{ fontSize: '24px', fontWeight: '700', color: '#22c55e' }}>{complianceRules.filter(r => r.is_verified).length}</div></div>
                  <div style={cardStyle}><div style={{ color: '#a1a1aa', fontSize: '12px', marginBottom: '4px' }}>States</div><div style={{ fontSize: '24px', fontWeight: '700', color: '#3b82f6' }}>{[...new Set(complianceRules.map(r => r.state))].length}</div></div>
                  <div style={cardStyle}><div style={{ color: '#a1a1aa', fontSize: '12px', marginBottom: '4px' }}>Avg Deadline</div><div style={{ fontSize: '24px', fontWeight: '700', color: '#f97316' }}>{Math.round(complianceRules.reduce((s, r) => s + (r.deadline_days || 0), 0) / (complianceRules.length || 1))}d</div></div>
                </div>

                {/* Rules Table */}
                <div style={cardStyle}>
                  <table style={{ width: '100%', borderCollapse: 'collapse', fontSize: '13px' }}>
                    <thead>
                      <tr style={{ borderBottom: '1px solid #3f3f46' }}>
                        <th style={{ textAlign: 'left', padding: '10px 8px', color: '#a1a1aa' }}>Rule Name</th>
                        <th style={{ textAlign: 'left', padding: '10px 8px', color: '#a1a1aa' }}>State</th>
                        <th style={{ textAlign: 'left', padding: '10px 8px', color: '#a1a1aa' }}>Category</th>
                        <th style={{ textAlign: 'center', padding: '10px 8px', color: '#a1a1aa' }}>Deadline</th>
                        <th style={{ textAlign: 'center', padding: '10px 8px', color: '#a1a1aa' }}>Late Fee</th>
                        <th style={{ textAlign: 'left', padding: '10px 8px', color: '#a1a1aa' }}>Agency</th>
                        <th style={{ textAlign: 'center', padding: '10px 8px', color: '#a1a1aa' }}>Status</th>
                        <th style={{ textAlign: 'center', padding: '10px 8px', color: '#a1a1aa' }}>Actions</th>
                      </tr>
                    </thead>
                    <tbody>
                      {complianceRules.map(r => (
                        <tr key={r.id} style={{ borderBottom: '1px solid #3f3f46' }}>
                          <td style={{ padding: '10px 8px', fontWeight: '500' }}>{r.rule_name}</td>
                          <td style={{ padding: '10px 8px' }}><span style={{ padding: '2px 8px', borderRadius: '4px', fontSize: '11px', backgroundColor: '#3f3f46' }}>{r.state}</span></td>
                          <td style={{ padding: '10px 8px' }}><span style={{ padding: '2px 8px', borderRadius: '4px', fontSize: '10px', backgroundColor: categoryColors[r.category] || '#71717a', textTransform: 'uppercase' }}>{r.category}</span></td>
                          <td style={{ padding: '10px 8px', textAlign: 'center', fontFamily: 'monospace' }}>{r.deadline_days}d</td>
                          <td style={{ padding: '10px 8px', textAlign: 'center', color: r.late_fee > 0 ? '#ef4444' : '#71717a' }}>${r.late_fee || 0}</td>
                          <td style={{ padding: '10px 8px', color: '#a1a1aa', fontSize: '12px' }}>{r.agency || '-'}</td>
                          <td style={{ padding: '10px 8px', textAlign: 'center' }}>{r.is_verified ? <span style={{ padding: '2px 6px', borderRadius: '4px', fontSize: '9px', backgroundColor: '#22c55e' }}>VERIFIED</span> : <span style={{ padding: '2px 6px', borderRadius: '4px', fontSize: '9px', backgroundColor: '#eab308' }}>UNVERIFIED</span>}</td>
                          <td style={{ padding: '10px 8px', textAlign: 'center' }}>
                            <button onClick={() => setRuleModal(r)} style={{ background: 'none', border: 'none', color: '#3b82f6', cursor: 'pointer', fontSize: '11px', marginRight: '8px' }}>Edit</button>
                            <button onClick={() => deleteRule(r.id)} style={{ background: 'none', border: 'none', color: '#ef4444', cursor: 'pointer', fontSize: '11px' }}>Del</button>
                          </td>
                        </tr>
                      ))}
                    </tbody>
                  </table>
                  {complianceRules.length === 0 && <p style={{ textAlign: 'center', color: '#71717a', padding: '40px' }}>No compliance rules yet. Add rules manually or use AI Discover.</p>}
                </div>
              </div>
            )}

            {/* === STAGING TAB === */}
            {formLibraryTab === 'staging' && (
              <div>
                <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'center', marginBottom: '16px' }}>
                  <p style={{ color: '#a1a1aa', margin: 0, fontSize: '14px' }}>AI-discovered forms waiting for review. Analyze to detect fields, then map to 99%+ to promote.</p>
                  <div style={{ display: 'flex', gap: '8px' }}>
                    {['all', 'pending', 'analyzed', 'approved', 'rejected'].map(filter => (
                      <button key={filter} onClick={() => setStagingFilter(filter)} style={{ padding: '6px 12px', borderRadius: '6px', border: 'none', fontSize: '12px', cursor: 'pointer', backgroundColor: stagingFilter === filter ? '#f97316' : '#3f3f46', color: '#fff', textTransform: 'capitalize' }}>{filter}</button>
                    ))}
                  </div>
                </div>

                {/* Staging Stats */}
                <div style={{ display: 'grid', gridTemplateColumns: 'repeat(auto-fill, minmax(140px, 1fr))', gap: '12px', marginBottom: '20px' }}>
                  <div style={cardStyle}><div style={{ color: '#a1a1aa', fontSize: '12px', marginBottom: '4px' }}>Total Staged</div><div style={{ fontSize: '24px', fontWeight: '700' }}>{formStaging.length}</div></div>
                  <div style={cardStyle}><div style={{ color: '#a1a1aa', fontSize: '12px', marginBottom: '4px' }}>Pending</div><div style={{ fontSize: '24px', fontWeight: '700', color: '#eab308' }}>{formStaging.filter(f => f.status === 'pending').length}</div></div>
                  <div style={cardStyle}><div style={{ color: '#a1a1aa', fontSize: '12px', marginBottom: '4px' }}>Analyzed</div><div style={{ fontSize: '24px', fontWeight: '700', color: '#3b82f6' }}>{formStaging.filter(f => f.status === 'analyzed').length}</div></div>
                  <div style={cardStyle}><div style={{ color: '#a1a1aa', fontSize: '12px', marginBottom: '4px' }}>Ready (99%+)</div><div style={{ fontSize: '24px', fontWeight: '700', color: '#22c55e' }}>{formStaging.filter(f => (f.mapping_confidence || 0) >= 99).length}</div></div>
                  <div style={cardStyle}><div style={{ color: '#a1a1aa', fontSize: '12px', marginBottom: '4px' }}>Promoted</div><div style={{ fontSize: '24px', fontWeight: '700', color: '#8b5cf6' }}>{formStaging.filter(f => f.status === 'approved').length}</div></div>
                </div>

                {/* Staging Table */}
                <div style={cardStyle}>
                  <table style={{ width: '100%', borderCollapse: 'collapse', fontSize: '13px' }}>
                    <thead>
                      <tr style={{ borderBottom: '1px solid #3f3f46' }}>
                        <th style={{ textAlign: 'left', padding: '10px 8px', color: '#a1a1aa' }}>Form #</th>
                        <th style={{ textAlign: 'left', padding: '10px 8px', color: '#a1a1aa' }}>Form Name</th>
                        <th style={{ textAlign: 'left', padding: '10px 8px', color: '#a1a1aa' }}>State</th>
                        <th style={{ textAlign: 'center', padding: '10px 8px', color: '#a1a1aa' }}>Mapping Score</th>
                        <th style={{ textAlign: 'center', padding: '10px 8px', color: '#a1a1aa' }}>Status</th>
                        <th style={{ textAlign: 'center', padding: '10px 8px', color: '#a1a1aa' }}>Actions</th>
                      </tr>
                    </thead>
                    <tbody>
                      {getFilteredStaging().map(f => {
                        const mappingScore = f.mapping_confidence || 0;
                        const hasMapping = (f.detected_fields?.length || 0) > 0;
                        const isReadyToPromote = mappingScore >= 99;
                        const isCurrentVersion = f.ai_is_current_version === true;
                        return (
                          <tr key={f.id} style={{
                            borderBottom: '1px solid #3f3f46',
                            opacity: f.status === 'rejected' ? 0.5 : 1,
                            borderLeft: isCurrentVersion ? '3px solid #22c55e' : (f.ai_is_current_version === false ? '3px solid #eab308' : 'none'),
                            backgroundColor: isCurrentVersion ? 'rgba(34, 197, 94, 0.05)' : 'transparent'
                          }}>
                            <td style={{ padding: '10px 8px', fontFamily: 'monospace', fontWeight: '600' }}>
                              <div style={{ display: 'flex', alignItems: 'center', gap: '8px' }}>
                                {f.form_number}
                                {isCurrentVersion ? (
                                  <span style={{ padding: '2px 6px', borderRadius: '4px', fontSize: '9px', backgroundColor: '#22c55e', color: '#000', fontWeight: '600' }}>LATEST</span>
                                ) : f.ai_is_current_version === false ? (
                                  <span style={{ padding: '2px 6px', borderRadius: '4px', fontSize: '9px', backgroundColor: '#eab308', color: '#000', fontWeight: '600' }}>OUTDATED</span>
                                ) : null}
                              </div>
                            </td>
                            <td style={{ padding: '10px 8px' }}>
                              <div>{f.form_name}</div>
                              {f.source_url && <a href={f.source_url} target="_blank" rel="noreferrer" style={{ color: '#71717a', fontSize: '11px' }}>View Source</a>}
                              {f.form_type && <span style={{ marginLeft: '8px', padding: '2px 6px', borderRadius: '4px', fontSize: '9px', backgroundColor: '#3f3f46', textTransform: 'uppercase' }}>{f.form_type}</span>}
                            </td>
                            <td style={{ padding: '10px 8px' }}><span style={{ padding: '2px 8px', borderRadius: '4px', fontSize: '11px', backgroundColor: '#3f3f46' }}>{f.state}</span></td>
                            <td style={{ padding: '10px 8px', textAlign: 'center' }}>
                              {hasMapping ? (
                                <div style={{ display: 'flex', alignItems: 'center', justifyContent: 'center', gap: '8px' }}>
                                  <span style={{
                                    padding: '4px 10px',
                                    borderRadius: '12px',
                                    fontSize: '12px',
                                    fontWeight: '600',
                                    backgroundColor: isReadyToPromote ? '#22c55e' : mappingScore >= 50 ? '#eab308' : '#ef4444',
                                    color: '#000'
                                  }}>
                                    {mappingScore}% mapped
                                  </span>
                                </div>
                              ) : (
                                <span style={{ color: '#71717a', fontSize: '12px' }}>Not analyzed</span>
                              )}
                            </td>
                            <td style={{ padding: '10px 8px', textAlign: 'center' }}>
                              <span style={{ padding: '2px 8px', borderRadius: '4px', fontSize: '10px', backgroundColor: f.status === 'approved' ? '#22c55e' : f.status === 'rejected' ? '#ef4444' : f.status === 'analyzed' ? '#3b82f6' : '#eab308', textTransform: 'uppercase' }}>{f.status}</span>
                            </td>
                            <td style={{ padding: '10px 8px', textAlign: 'center' }}>
                              {(f.status === 'pending' || f.status === 'analyzed') && (
                                <div style={{ display: 'flex', gap: '4px', justifyContent: 'center', flexWrap: 'wrap' }}>
                                  <button onClick={() => analyzeForm(f)} style={{ background: 'none', border: 'none', color: '#8b5cf6', cursor: 'pointer', fontSize: '11px' }}>Analyze</button>
                                  {hasMapping && (
                                    <button onClick={() => openStagingMapper(f)} style={{ background: 'none', border: 'none', color: '#3b82f6', cursor: 'pointer', fontSize: '11px' }}>View Mapping</button>
                                  )}
                                  {isReadyToPromote ? (
                                    <button onClick={() => promoteToLibrary(f)} style={{ background: 'none', border: 'none', color: '#22c55e', cursor: 'pointer', fontSize: '11px', fontWeight: '600' }}>Promote</button>
                                  ) : (
                                    <span style={{ color: '#71717a', fontSize: '10px', padding: '0 4px' }} title="Need 99% mapping to promote">Need 99%</span>
                                  )}
                                  <button onClick={() => rejectStagedForm(f.id)} style={{ background: 'none', border: 'none', color: '#ef4444', cursor: 'pointer', fontSize: '11px' }}>Reject</button>
                                </div>
                              )}
                              {f.status === 'approved' && <span style={{ color: '#71717a', fontSize: '11px' }}>In Library</span>}
                              {f.status === 'rejected' && <span style={{ color: '#71717a', fontSize: '11px' }}>-</span>}
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
                <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'center', marginBottom: '16px' }}>
                  <p style={{ color: '#a1a1aa', margin: 0, fontSize: '14px' }}>Production-ready forms with field mappings. Click forms &lt;99% to open Field Mapper.</p>
                  <button onClick={() => setFormModal({ state: dealer?.state || 'UT', county: '', form_number: '', form_name: '', category: 'deal', source_url: '', description: '', is_active: true })} style={btnSuccess}>+ Add Form</button>
                </div>

                {/* Library Stats */}
                <div style={{ display: 'grid', gridTemplateColumns: 'repeat(auto-fill, minmax(140px, 1fr))', gap: '12px', marginBottom: '20px' }}>
                  <div style={cardStyle}><div style={{ color: '#a1a1aa', fontSize: '12px', marginBottom: '4px' }}>Total Forms</div><div style={{ fontSize: '24px', fontWeight: '700' }}>{formLibrary.length}</div></div>
                  <div style={cardStyle}><div style={{ color: '#a1a1aa', fontSize: '12px', marginBottom: '4px' }}>Ready (99%+)</div><div style={{ fontSize: '24px', fontWeight: '700', color: '#22c55e' }}>{formLibrary.filter(f => (f.mapping_confidence || 0) >= 99).length}</div></div>
                  <div style={cardStyle}><div style={{ color: '#a1a1aa', fontSize: '12px', marginBottom: '4px' }}>Needs Mapping</div><div style={{ fontSize: '24px', fontWeight: '700', color: '#eab308' }}>{formLibrary.filter(f => (f.mapping_confidence || 0) < 99).length}</div></div>
                  <div style={cardStyle}><div style={{ color: '#a1a1aa', fontSize: '12px', marginBottom: '4px' }}>Avg Mapping</div><div style={{ fontSize: '24px', fontWeight: '700', color: '#3b82f6' }}>{Math.round(formLibrary.reduce((s, f) => s + (f.mapping_confidence || 0), 0) / (formLibrary.length || 1))}%</div></div>
                </div>

                {/* Filters */}
                <div style={{ display: 'flex', gap: '8px', marginBottom: '16px', flexWrap: 'wrap' }}>
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

                {/* Library Table */}
                <div style={cardStyle}>
                  <table style={{ width: '100%', borderCollapse: 'collapse', fontSize: '13px' }}>
                    <thead>
                      <tr style={{ borderBottom: '1px solid #3f3f46' }}>
                        <th style={{ textAlign: 'left', padding: '10px 8px', color: '#a1a1aa' }}>Form #</th>
                        <th style={{ textAlign: 'left', padding: '10px 8px', color: '#a1a1aa' }}>Form Name</th>
                        <th style={{ textAlign: 'left', padding: '10px 8px', color: '#a1a1aa' }}>State</th>
                        <th style={{ textAlign: 'left', padding: '10px 8px', color: '#a1a1aa' }}>Category</th>
                        <th style={{ textAlign: 'center', padding: '10px 8px', color: '#a1a1aa' }}>Mapping Score</th>
                        <th style={{ textAlign: 'center', padding: '10px 8px', color: '#a1a1aa' }}>Actions</th>
                      </tr>
                    </thead>
                    <tbody>
                      {getFilteredLibrary().map(f => (
                        <tr
                          key={f.id}
                          style={{ borderBottom: '1px solid #3f3f46', cursor: (f.mapping_confidence || 0) < 99 ? 'pointer' : 'default', backgroundColor: (f.mapping_confidence || 0) < 99 ? 'rgba(234, 179, 8, 0.05)' : 'transparent' }}
                          onClick={() => { if ((f.mapping_confidence || 0) < 99) setFieldMapperModal({ ...f, field_mapping: f.field_mapping || {}, detected_fields: f.detected_fields || ['field1', 'field2', 'field3', 'field4', 'field5'] }); }}
                        >
                          <td style={{ padding: '10px 8px', fontFamily: 'monospace', fontWeight: '600' }}>{f.form_number}</td>
                          <td style={{ padding: '10px 8px' }}>
                            <div>{f.form_name}</div>
                            {f.description && <div style={{ color: '#71717a', fontSize: '11px', marginTop: '2px' }}>{f.description.substring(0, 50)}...</div>}
                          </td>
                          <td style={{ padding: '10px 8px' }}><span style={{ padding: '2px 8px', borderRadius: '4px', fontSize: '11px', backgroundColor: '#3f3f46' }}>{f.state}</span></td>
                          <td style={{ padding: '10px 8px' }}><span style={{ padding: '2px 8px', borderRadius: '4px', fontSize: '10px', backgroundColor: categoryColors[f.category] || '#71717a', textTransform: 'uppercase' }}>{f.category}</span></td>
                          <td style={{ padding: '10px 8px', textAlign: 'center' }}>
                            <div style={{ display: 'flex', alignItems: 'center', justifyContent: 'center', gap: '8px' }}>
                              <div style={{ width: '80px', height: '8px', backgroundColor: '#3f3f46', borderRadius: '4px', overflow: 'hidden' }}>
                                <div style={{ width: `${f.mapping_confidence || 0}%`, height: '100%', backgroundColor: (f.mapping_confidence || 0) >= 99 ? '#22c55e' : (f.mapping_confidence || 0) >= 50 ? '#eab308' : '#ef4444' }} />
                              </div>
                              <span style={{ fontSize: '12px', fontWeight: '600', color: (f.mapping_confidence || 0) >= 99 ? '#22c55e' : '#eab308' }}>{f.mapping_confidence || 0}%</span>
                            </div>
                          </td>
                          <td style={{ padding: '10px 8px', textAlign: 'center' }} onClick={e => e.stopPropagation()}>
                            {(f.mapping_confidence || 0) < 99 && <button onClick={() => setFieldMapperModal({ ...f, field_mapping: f.field_mapping || {}, detected_fields: f.detected_fields || ['field1', 'field2', 'field3', 'field4', 'field5'] })} style={{ background: 'none', border: 'none', color: '#eab308', cursor: 'pointer', fontSize: '11px', marginRight: '8px' }}>Map Fields</button>}
                            <button onClick={() => setFormModal(f)} style={{ background: 'none', border: 'none', color: '#3b82f6', cursor: 'pointer', fontSize: '11px', marginRight: '8px' }}>Edit</button>
                            {f.source_url && <a href={f.source_url} target="_blank" rel="noreferrer" style={{ color: '#a1a1aa', fontSize: '11px', marginRight: '8px' }}>PDF</a>}
                            <button onClick={() => deleteLibraryForm(f.id)} style={{ background: 'none', border: 'none', color: '#ef4444', cursor: 'pointer', fontSize: '11px' }}>Del</button>
                          </td>
                        </tr>
                      ))}
                    </tbody>
                  </table>
                  {getFilteredLibrary().length === 0 && <p style={{ textAlign: 'center', color: '#71717a', padding: '40px' }}>No forms in library. Promote forms from Staging or add manually.</p>}
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
                  {fieldMapperModal.source_url ? (
                    <iframe src={fieldMapperModal.source_url} style={{ width: '100%', height: '100%', border: 'none', borderRadius: '8px' }} title="PDF Preview" />
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
                    const mappedCount = Object.values(stagingMapperModal.field_mapping || {}).filter(v => v).length;
                    const totalFields = stagingMapperModal.detected_fields?.length || 1;
                    const score = Math.round((mappedCount / totalFields) * 100);
                    const isReady = score >= 99;
                    return (
                      <div style={{ fontSize: '24px', fontWeight: '700', color: isReady ? '#22c55e' : '#eab308' }}>
                        {score}%
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
                  {stagingMapperModal.source_url ? (
                    <iframe src={stagingMapperModal.source_url} style={{ width: '100%', height: '100%', border: 'none', borderRadius: '8px' }} title="PDF Preview" />
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
                <div style={{ padding: '12px 16px', backgroundColor: '#27272a', fontSize: '13px', fontWeight: '600', display: 'flex', justifyContent: 'space-between' }}>
                  <span>PDF Fields ({stagingMapperModal.detected_fields?.length || 0})</span>
                  <span style={{ color: '#a1a1aa' }}>
                    {Object.values(stagingMapperModal.field_mapping || {}).filter(v => v).length} mapped
                  </span>
                </div>
                <div style={{ flex: 1, overflowY: 'auto', padding: '16px' }}>
                  {(stagingMapperModal.detected_fields || []).map((field, idx) => {
                    const isMapped = !!stagingMapperModal.field_mapping?.[field];
                    return (
                      <div key={idx} style={{ marginBottom: '12px', padding: '12px', backgroundColor: '#27272a', borderRadius: '8px', border: isMapped ? '1px solid #22c55e' : '1px solid #ef4444' }}>
                        <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'center', marginBottom: '8px' }}>
                          <span style={{ fontFamily: 'monospace', fontSize: '13px', fontWeight: '600' }}>{field}</span>
                          {isMapped ? (
                            <span style={{ fontSize: '14px', color: '#22c55e' }}>✓</span>
                          ) : (
                            <span style={{ fontSize: '14px', color: '#ef4444' }}>⚠</span>
                          )}
                        </div>
                        <select
                          value={stagingMapperModal.field_mapping?.[field] || ''}
                          onChange={(e) => updateStagingFieldMapping(field, e.target.value)}
                          style={{ ...inputStyle, fontSize: '12px', borderColor: isMapped ? '#22c55e' : '#ef4444' }}
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
                    );
                  })}
                  {(!stagingMapperModal.detected_fields || stagingMapperModal.detected_fields.length === 0) && (
                    <div style={{ textAlign: 'center', padding: '40px', color: '#71717a' }}>
                      <p>No fields detected.</p>
                      <p style={{ fontSize: '12px' }}>Click "Analyze" to detect PDF fields.</p>
                    </div>
                  )}
                </div>
              </div>
            </div>

            {/* Footer */}
            <div style={{ padding: '16px 24px', borderTop: '1px solid #27272a', display: 'flex', justifyContent: 'space-between', alignItems: 'center' }}>
              <div style={{ color: '#71717a', fontSize: '12px' }}>
                {(() => {
                  const mappedCount = Object.values(stagingMapperModal.field_mapping || {}).filter(v => v).length;
                  const totalFields = stagingMapperModal.detected_fields?.length || 0;
                  const unmapped = totalFields - mappedCount;
                  return unmapped > 0
                    ? `${unmapped} field${unmapped > 1 ? 's' : ''} need${unmapped === 1 ? 's' : ''} mapping to reach 99%`
                    : 'All fields mapped - ready to promote!';
                })()}
              </div>
              <div style={{ display: 'flex', gap: '12px' }}>
                <button onClick={() => setStagingMapperModal(null)} style={btnSecondary}>Cancel</button>
                <button onClick={saveStagingMapping} style={btnSuccess}>Save Mapping</button>
              </div>
            </div>
          </div>
        </div>
      )}
    </div>
  );
}