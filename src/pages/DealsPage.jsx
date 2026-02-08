// DealsPage.jsx - Complete with Document Generation System
// Replace entire file at: C:\OGDealer\src\pages\DealsPage.jsx

import { useState, useEffect, useMemo, useRef } from 'react';
import { useLocation } from 'react-router-dom';
import { useStore } from '../lib/store';
import { supabase } from '../lib/supabase';
import { useTheme } from '../components/Layout';

// ============ CONSTANTS ============
const STAGES = [
  { id: 'Lead', label: 'Lead', color: '#71717a' },
  { id: 'Negotiation', label: 'Negotiation', color: '#f59e0b' },
  { id: 'Pending', label: 'Pending Docs', color: '#3b82f6' },
  { id: 'Sold', label: 'Sold', color: '#22c55e' },
  { id: 'Delivered', label: 'Delivered', color: '#a855f7' }
];

const DEFAULT_PACKAGES = {
  'Cash': ['Bill of Sale', 'Buyers Guide', 'Odometer Disclosure', 'TC-69 Report of Sale'],
  'BHPH': ['Bill of Sale', 'Buyers Guide', 'Odometer Disclosure', 'TC-69 Report of Sale', 'Promissory Note', 'Payment Schedule', 'Security Agreement', 'GPS Disclosure'],
  'Financing': ['Bill of Sale', 'Buyers Guide', 'Odometer Disclosure', 'TC-69 Report of Sale', 'Bank Authorization'],
  'Wholesale': ['Dealer Bill of Sale', 'Title Reassignment', 'Odometer Disclosure']
};

const TYPE_COLORS = {
  'Cash': '#22c55e',
  'BHPH': '#f97316',
  'Financing': '#3b82f6',
  'Wholesale': '#8b5cf6'
};

const MARKET_RATES = {
  'super_prime': { min: 781, max: 850, outside: 7.8, bhph: 15.0, label: 'Super Prime' },
  'prime': { min: 661, max: 780, outside: 9.7, bhph: 18.0, label: 'Prime' },
  'near_prime': { min: 601, max: 660, outside: 13.2, bhph: 21.0, label: 'Near Prime' },
  'subprime': { min: 501, max: 600, outside: 17.5, bhph: 24.0, label: 'Subprime' },
  'deep_subprime': { min: 300, max: 500, outside: 21.0, bhph: 29.0, label: 'Deep Subprime' }
};

const COMMON_TERMS = [
  { months: 24, label: '24 mo', description: 'Lowest total cost' },
  { months: 36, label: '36 mo', description: 'Balance of payment & cost' },
  { months: 48, label: '48 mo', description: 'Most common for used' },
  { months: 60, label: '60 mo', description: 'Lower payment, more interest' },
  { months: 72, label: '72 mo', description: 'Highest total cost' }
];

const getSuggestedRate = (creditScore, dealType) => {
  const score = parseInt(creditScore) || 0;
  let tier = MARKET_RATES.deep_subprime;
  
  if (score >= 781) tier = MARKET_RATES.super_prime;
  else if (score >= 661) tier = MARKET_RATES.prime;
  else if (score >= 601) tier = MARKET_RATES.near_prime;
  else if (score >= 501) tier = MARKET_RATES.subprime;
  
  return {
    rate: dealType === 'BHPH' ? tier.bhph : tier.outside,
    tier: tier.label,
    range: `${tier.min}-${tier.max}`
  };
};

const UPSELL_PRODUCTS = [
  { id: 'gap_insurance', name: 'GAP Insurance', price: 595, profit: 450 },
  { id: 'extended_warranty', name: 'Extended Warranty', price: 1495, profit: 800 },
  { id: 'protection_package', name: 'Protection Package', price: 895, profit: 650 }
];

const INITIAL_DEAL_FORM = {
  vehicle_id: '',
  customer_id: '',
  purchaser_name: '',
  // Buyer address fields
  address: '',
  city: '',
  state: '',
  zip: '',
  phone: '',
  email: '',
  // Legacy buyer fields
  customer_email: '',
  customer_phone: '',
  deal_type: 'Cash',
  stage: 'Lead',
  price: '',
  down_payment: '',
  trade_value: '',
  trade_payoff: '',
  trade_acv: '',
  trade_description: '',
  term_months: '48',
  interest_rate: '18',
  doc_fee: '299',
  salesman: '',
  credit_score: '',
  gap_insurance: false,
  extended_warranty: false,
  protection_package: false,
  accessory_1_desc: '',
  accessory_1_price: '',
  accessory_2_desc: '',
  accessory_2_price: '',
  accessory_3_desc: '',
  accessory_3_price: '',
  notes: '',
  date_of_sale: new Date().toISOString().split('T')[0]
};

export default function DealsPage() {
  const location = useLocation();
  const { deals, inventory, customers, employees, dealer, dealerId, fetchAllData, refreshDeals } = useStore();
  const themeContext = useTheme();
  const theme = themeContext?.theme || {
    bg: '#09090b', bgCard: '#18181b', border: '#27272a',
    text: '#ffffff', textSecondary: '#a1a1aa', textMuted: '#71717a',
    accent: '#f97316', accentBg: 'rgba(249,115,22,0.15)'
  };

  // ============ STATE ============
  const [viewMode, setViewMode] = useState('pipeline');
  const [showArchived, setShowArchived] = useState(false);
  const [showDealForm, setShowDealForm] = useState(false);
  const [editingDeal, setEditingDeal] = useState(null);
  const [dealForm, setDealForm] = useState(INITIAL_DEAL_FORM);
  const [generating, setGenerating] = useState(false);
  const [saving, setSaving] = useState(false);
  const [confirmDelete, setConfirmDelete] = useState(null);
  const [confirmLock, setConfirmLock] = useState(null);
  const [toast, setToast] = useState(null);
  const [customerSearch, setCustomerSearch] = useState('');
  const [showCustomerDropdown, setShowCustomerDropdown] = useState(false);
  const [showNewCustomer, setShowNewCustomer] = useState(false);
  const [newCustomer, setNewCustomer] = useState({ name: '', phone: '', email: '', address: '' });
  const [showAccessories, setShowAccessories] = useState(false);
  const [showTradeIn, setShowTradeIn] = useState(false);
  
  // Document system state
  const [docPackages, setDocPackages] = useState({});
  const [generatedDocs, setGeneratedDocs] = useState({});

  // Drag and drop
  const [dragOverStage, setDragOverStage] = useState(null);
  const draggedDealRef = useRef(null);

  // ============ LOAD DOC PACKAGES FROM DATABASE ============
  // State for library forms (approved forms from staging)
  const [libraryForms, setLibraryForms] = useState([]);

  useEffect(() => {
    const loadDocPackages = async () => {
      if (!dealerId) return;
      try {
        // Load document packages (has form_ids array + docs text array)
        const { data: pkgData, error: pkgError } = await supabase
          .from('document_packages')
          .select('deal_type, form_ids, docs')
          .eq('dealer_id', dealerId);

        if (pkgError) throw pkgError;

        // Load forms from form_library (promoted/approved forms)
        const state = dealer?.state || 'UT';
        const { data: formsData, error: formsError } = await supabase
          .from('form_library')
          .select('id, form_number, form_name')
          .eq('state', state);

        if (formsError) throw formsError;

        setLibraryForms(formsData || []);

        // Map form_ids to form names for each package
        const packages = {};
        pkgData?.forEach(pkg => {
          if (!pkg.deal_type) return;

          // Try resolving form_ids to names from form_library
          let formNames = [];
          if (pkg.form_ids && Array.isArray(pkg.form_ids)) {
            formNames = pkg.form_ids.map(formId => {
              const form = formsData?.find(f => f.id === formId);
              return form ? form.form_name : null;
            }).filter(Boolean);
          }

          // Fallback: use docs text array if form_ids didn't resolve
          if (formNames.length === 0 && pkg.docs && Array.isArray(pkg.docs)) {
            formNames = pkg.docs;
          }

          if (formNames.length > 0) {
            packages[pkg.deal_type] = formNames;
          }
        });

        console.log('Loaded doc packages from DB:', packages);
        console.log('Library forms loaded:', formsData?.length || 0);
        setDocPackages(packages);
      } catch (err) {
        console.error('Failed to load doc packages:', err);
      }
    };
    loadDocPackages();
  }, [dealerId, dealer?.state]);

  // ============ EFFECTS ============
  useEffect(() => {
    if (dealerId && deals.length === 0) {
      fetchAllData();
    }
  }, [dealerId]);

  useEffect(() => {
    if (toast) {
      const timer = setTimeout(() => setToast(null), 3000);
      return () => clearTimeout(timer);
    }
  }, [toast]);

  // ============ LOAD GENERATED DOCUMENTS ============
  const loadGeneratedDocs = async (dealId) => {
    if (!dealId) return [];
    try {
      const { data, error } = await supabase
        .from('generated_documents')
        .select('*')
        .eq('deal_id', dealId)
        .order('generated_at', { ascending: false });

      if (error) throw error;
      
      if (data) {
        setGeneratedDocs(prev => ({ ...prev, [dealId]: data }));
        return data;
      }
    } catch (err) {
      console.error('Failed to load generated docs:', err);
    }
    return [];
  };

  // ============ GET DOCS FOR DEAL TYPE ============
  const getDocsForDealType = (dealType) => {
    return docPackages[dealType] || DEFAULT_PACKAGES[dealType] || DEFAULT_PACKAGES['Cash'];
  };

  // ============ COMPUTED ============
  const availableVehicles = useMemo(() => {
    return inventory.filter(v => v.status === 'In Stock' || v.status === 'For Sale');
  }, [inventory]);

  const selectedVehicle = useMemo(() => {
    return inventory.find(v => v.id == dealForm.vehicle_id);
  }, [dealForm.vehicle_id, inventory]);

  const filteredCustomers = useMemo(() => {
    if (!customerSearch) return customers.slice(0, 10);
    const search = customerSearch.toLowerCase();
    return customers.filter(c => 
      c.name?.toLowerCase().includes(search) ||
      c.phone?.includes(search) ||
      c.email?.toLowerCase().includes(search)
    ).slice(0, 10);
  }, [customers, customerSearch]);

  const dealsByStage = useMemo(() => {
    const grouped = {};
    STAGES.forEach(s => grouped[s.id] = []);
    
    const filtered = showArchived 
      ? deals.filter(d => d.archived)
      : deals.filter(d => !d.archived);
    
    filtered.forEach(deal => {
      const stage = deal.stage || 'Lead';
      if (grouped[stage]) {
        grouped[stage].push(deal);
      } else {
        grouped['Lead'].push(deal);
      }
    });
    return grouped;
  }, [deals, showArchived]);

  const salespeople = useMemo(() => {
    return employees.filter(e => e.active && e.roles?.some(r => 
      r.toLowerCase().includes('sales') || r.toLowerCase().includes('manager')
    ));
  }, [employees]);

  const accessoryTotal = useMemo(() => {
    const a1 = parseFloat(dealForm.accessory_1_price) || 0;
    const a2 = parseFloat(dealForm.accessory_2_price) || 0;
    const a3 = parseFloat(dealForm.accessory_3_price) || 0;
    return a1 + a2 + a3;
  }, [dealForm.accessory_1_price, dealForm.accessory_2_price, dealForm.accessory_3_price]);

  // Current deal's generated documents
  const currentDealDocs = useMemo(() => {
    return generatedDocs[editingDeal?.id] || [];
  }, [generatedDocs, editingDeal?.id]);

  // ============ DEAL ANALYSIS ============
  const dealAnalysis = useMemo(() => {
    const analysis = {
      score: 75,
      monthly: 0,
      profit: 0,
      frontEnd: 0,
      backEnd: 0,
      tradeProfit: 0,
      ltv: 0,
      negativeEquity: 0,
      warnings: [],
      suggestions: [],
      // Calculated values for database
      totalSale: 0,
      amountFinanced: 0,
      monthlyPayment: 0,
      totalOfPayments: 0,
      salesTax: 0,
      financeCharge: 0,
    };

    const price = parseFloat(dealForm.price) || 0;
    const downPayment = parseFloat(dealForm.down_payment) || 0;
    const tradeValue = parseFloat(dealForm.trade_value) || 0;
    const tradePayoff = parseFloat(dealForm.trade_payoff) || 0;
    const tradeACV = parseFloat(dealForm.trade_acv) || 0;
    const termMonths = parseInt(dealForm.term_months) || 48;
    const interestRate = parseFloat(dealForm.interest_rate) || 18;
    const docFee = parseFloat(dealForm.doc_fee) || 299;
    const creditScore = parseInt(dealForm.credit_score) || 0;
    const gap = dealForm.gap_insurance ? 595 : 0;
    const warranty = dealForm.extended_warranty ? 1495 : 0;
    const protection = dealForm.protection_package ? 895 : 0;

    // Sales tax calculation (on price minus trade, typical rate 6.85%)
    const taxableAmount = Math.max(0, price - tradeValue);
    const salesTaxRate = 0.0685;
    const salesTax = taxableAmount * salesTaxRate;

    const negativeEquity = Math.max(0, tradePayoff - tradeValue);
    const backEndProducts = gap + warranty + protection + docFee + accessoryTotal;
    const totalSale = price + backEndProducts + salesTax - tradeValue + negativeEquity;
    const amountFinanced = totalSale - downPayment;
    const monthlyRate = interestRate / 100 / 12;
    const monthlyPayment = amountFinanced > 0 && monthlyRate > 0 && termMonths > 0
      ? (amountFinanced * monthlyRate * Math.pow(1 + monthlyRate, termMonths)) / (Math.pow(1 + monthlyRate, termMonths) - 1)
      : 0;
    const totalOfPayments = monthlyPayment * termMonths;
    const financeCharge = totalOfPayments - amountFinanced;

    // Store calculated values for database
    analysis.totalSale = totalSale;
    analysis.amountFinanced = amountFinanced;
    analysis.monthlyPayment = monthlyPayment;
    analysis.totalOfPayments = totalOfPayments;
    analysis.salesTax = salesTax;
    analysis.financeCharge = financeCharge;

    analysis.monthly = monthlyPayment;
    analysis.negativeEquity = negativeEquity;
    analysis.ltv = price > 0 ? (amountFinanced / price) * 100 : 0;
    analysis.backEnd = backEndProducts;

    if (selectedVehicle) {
      const purchasePrice = parseFloat(selectedVehicle.purchase_price) || 0;
      analysis.frontEnd = price - purchasePrice;
      analysis.tradeProfit = tradeACV > 0 ? tradeACV - tradeValue : 0;
      analysis.profit = analysis.frontEnd + analysis.backEnd + analysis.tradeProfit;

      if (analysis.ltv > 130) {
        analysis.warnings.push({ title: 'LTV Too High', message: `${analysis.ltv.toFixed(0)}% exceeds lender max (130%)`, severity: 'high' });
        analysis.score -= 20;
      } else if (analysis.ltv > 120) {
        analysis.warnings.push({ title: 'High LTV', message: `${analysis.ltv.toFixed(0)}% loan-to-value`, severity: 'medium' });
        analysis.score -= 10;
      }

      if (analysis.frontEnd < 500 && price > 5000) {
        analysis.warnings.push({ title: 'Low Front-End', message: `Only $${analysis.frontEnd.toLocaleString()} markup`, severity: 'medium' });
        analysis.score -= 10;
      }

      if (analysis.profit < 1000 && price > 8000) {
        analysis.warnings.push({ title: 'Mini Deal', message: `Total gross under $1,000`, severity: 'low' });
        analysis.score -= 5;
      }
    }

    if (negativeEquity > 0) {
      analysis.warnings.push({ title: 'Negative Equity', message: `$${negativeEquity.toLocaleString()} rolled into loan`, severity: 'high' });
      analysis.score -= 10;
    }

    if (monthlyPayment > 700) {
      analysis.warnings.push({ title: 'High Payment', message: `$${monthlyPayment.toFixed(0)}/mo may strain budget`, severity: 'medium' });
      analysis.score -= 10;
    }

    if (creditScore > 0) {
      if (creditScore < 500) {
        analysis.warnings.push({ title: 'Deep Subprime', message: `${creditScore} score - very high risk`, severity: 'high' });
        analysis.score -= 25;
      } else if (creditScore < 550) {
        analysis.warnings.push({ title: 'High Risk', message: `${creditScore} score - needs larger down`, severity: 'high' });
        analysis.score -= 15;
      } else if (creditScore < 620) {
        analysis.warnings.push({ title: 'Subprime', message: `${creditScore} score - moderate risk`, severity: 'medium' });
        analysis.score -= 8;
      }
    }

    if (!dealForm.gap_insurance && dealForm.deal_type !== 'Cash' && analysis.ltv > 80) {
      analysis.suggestions.push({ title: 'GAP Insurance', message: 'LTV over 80% - protect against total loss', profit: 450, product: 'gap_insurance', price: 595 });
    }
    if (!dealForm.extended_warranty && selectedVehicle && ((selectedVehicle.miles || selectedVehicle.mileage || 0) > 50000 || (new Date().getFullYear() - selectedVehicle.year) > 5)) {
      analysis.suggestions.push({ title: 'Extended Warranty', message: 'Higher miles/age vehicle', profit: 800, product: 'extended_warranty', price: 1495 });
    }
    if (!dealForm.protection_package) {
      analysis.suggestions.push({ title: 'Protection Package', message: 'Paint, interior, tire/wheel', profit: 650, product: 'protection_package', price: 895 });
    }
    if (accessoryTotal === 0) {
      analysis.suggestions.push({ title: 'Add Accessories', message: 'Window tint, bed liner, floor mats', profit: 200, product: 'accessory' });
    }

    if (downPayment >= price * 0.2) analysis.score += 10;
    analysis.score = Math.max(0, Math.min(100, analysis.score));
    return analysis;
  }, [dealForm, selectedVehicle, accessoryTotal]);

  // ============ HELPERS ============
  const showToast = (message, type = 'success') => setToast({ message, type });
  
  const getVehicleDisplay = (deal) => {
    const vehicle = inventory.find(v => v.id == deal.vehicle_id);
    if (vehicle) return `${vehicle.year} ${vehicle.make} ${vehicle.model}`;
    return 'No Vehicle';
  };

  const getComplianceDeadline = (deal) => {
    if (!deal.date_of_sale) return null;
    const deadline = new Date(deal.date_of_sale);
    deadline.setDate(deadline.getDate() + 45);
    const daysLeft = Math.ceil((deadline - new Date()) / (1000 * 60 * 60 * 24));
    return { deadline, daysLeft, overdue: daysLeft < 0 };
  };

  const getScoreColor = (score) => {
    if (score >= 80) return '#22c55e';
    if (score >= 60) return '#f59e0b';
    if (score >= 40) return '#f97316';
    return '#ef4444';
  };

  // ============ DRAG AND DROP ============
  const handleDragStart = (e, deal) => {
    if (deal.locked || deal.archived) {
      e.preventDefault();
      return;
    }
    draggedDealRef.current = deal;
    e.dataTransfer.effectAllowed = 'move';
    e.dataTransfer.setData('text/plain', deal.id);
    e.target.style.opacity = '0.5';
  };

  const handleDragEnd = (e) => {
    e.target.style.opacity = '1';
    draggedDealRef.current = null;
    setDragOverStage(null);
  };

  const handleDragOver = (e, stageId) => {
    e.preventDefault();
    e.dataTransfer.dropEffect = 'move';
    if (dragOverStage !== stageId) setDragOverStage(stageId);
  };

  const handleDragLeave = (e) => {
    if (!e.currentTarget.contains(e.relatedTarget)) setDragOverStage(null);
  };

  const handleDrop = async (e, newStage) => {
    e.preventDefault();
    setDragOverStage(null);
    const deal = draggedDealRef.current;
    if (!deal || deal.stage === newStage) return;
    try {
      const { error } = await supabase.from('deals').update({ stage: newStage }).eq('id', deal.id);
      if (error) throw error;
      await refreshDeals();
      showToast(`Moved to ${newStage}`);
    } catch (err) {
      showToast('Failed to move deal', 'error');
    }
  };

  // ============ CRUD OPERATIONS ============
  const openNewDeal = () => {
    setEditingDeal(null);
    setDealForm(INITIAL_DEAL_FORM);
    setCustomerSearch('');
    setShowAccessories(false);
    setShowTradeIn(false);
    setShowDealForm(true);
  };

  const openEditDeal = async (deal) => {
    setEditingDeal(deal);
    setDealForm({
      vehicle_id: deal.vehicle_id || '',
      customer_id: deal.customer_id || '',
      purchaser_name: deal.purchaser_name || '',
      // Buyer address fields
      address: deal.address || '',
      city: deal.city || '',
      state: deal.state || '',
      zip: deal.zip || '',
      phone: deal.phone || deal.customer_phone || '',
      email: deal.email || deal.customer_email || '',
      // Legacy fields
      customer_email: deal.customer_email || deal.email || '',
      customer_phone: deal.customer_phone || deal.phone || '',
      deal_type: deal.deal_type || 'Cash',
      stage: deal.stage || 'Lead',
      price: deal.price || deal.sale_price || '',
      down_payment: deal.down_payment || '',
      trade_value: deal.trade_value || '',
      trade_payoff: deal.trade_payoff || '',
      trade_acv: deal.trade_acv || '',
      trade_description: deal.trade_description || '',
      term_months: deal.term_months || '48',
      interest_rate: deal.interest_rate || deal.apr || '18',
      doc_fee: deal.doc_fee || '299',
      salesman: deal.salesman || '',
      credit_score: deal.credit_score || '',
      gap_insurance: deal.gap_insurance > 0,
      extended_warranty: deal.extended_warranty > 0,
      protection_package: deal.protection_package > 0,
      accessory_1_desc: deal.accessory_1_desc || '',
      accessory_1_price: deal.accessory_1_price || '',
      accessory_2_desc: deal.accessory_2_desc || '',
      accessory_2_price: deal.accessory_2_price || '',
      accessory_3_desc: deal.accessory_3_desc || '',
      accessory_3_price: deal.accessory_3_price || '',
      notes: deal.notes || '',
      date_of_sale: deal.date_of_sale || new Date().toISOString().split('T')[0]
    });
    setCustomerSearch(deal.purchaser_name || '');
    setShowAccessories(!!(deal.accessory_1_desc || deal.accessory_2_desc || deal.accessory_3_desc));
    setShowTradeIn(!!(deal.trade_value || deal.trade_description));
    
    // Load generated documents for this deal
    await loadGeneratedDocs(deal.id);
    
    setShowDealForm(true);
  };

  const saveDeal = async () => {
    if (!dealForm.vehicle_id) { showToast('Select a vehicle', 'error'); return; }
    if (!dealForm.purchaser_name) { showToast('Enter customer name', 'error'); return; }

    setSaving(true);
    try {
      const dealData = {
        dealer_id: dealerId,
        vehicle_id: dealForm.vehicle_id,
        customer_id: dealForm.customer_id || null,
        purchaser_name: dealForm.purchaser_name,
        // Buyer address fields (from form if available)
        address: dealForm.address || null,
        city: dealForm.city || null,
        state: dealForm.state || null,
        zip: dealForm.zip || null,
        phone: dealForm.phone || dealForm.customer_phone || null,
        email: dealForm.email || dealForm.customer_email || null,
        // Legacy fields for backwards compatibility
        customer_email: dealForm.customer_email || dealForm.email || null,
        customer_phone: dealForm.customer_phone || dealForm.phone || null,
        deal_type: dealForm.deal_type,
        stage: dealForm.stage,
        // Input prices
        price: parseFloat(dealForm.price) || 0,
        sale_price: parseFloat(dealForm.price) || 0,
        down_payment: parseFloat(dealForm.down_payment) || 0,
        doc_fee: parseFloat(dealForm.doc_fee) || 299,
        // CALCULATED VALUES from dealAnalysis
        sales_tax: Math.round(dealAnalysis.salesTax * 100) / 100,
        total_sale: Math.round(dealAnalysis.totalSale * 100) / 100,
        total_price: Math.round(dealAnalysis.totalSale * 100) / 100,
        amount_financed: Math.round(dealAnalysis.amountFinanced * 100) / 100,
        monthly_payment: Math.round(dealAnalysis.monthlyPayment * 100) / 100,
        total_of_payments: Math.round(dealAnalysis.totalOfPayments * 100) / 100,
        balance_due: Math.round(dealAnalysis.amountFinanced * 100) / 100,
        negative_equity: Math.round(dealAnalysis.negativeEquity * 100) / 100,
        // Other deal info
        salesman: dealForm.salesman || null,
        date_of_sale: dealForm.date_of_sale,
        notes: dealForm.notes || null,
        // Trade-in
        trade_value: parseFloat(dealForm.trade_value) || 0,
        trade_payoff: parseFloat(dealForm.trade_payoff) || 0,
        trade_acv: parseFloat(dealForm.trade_acv) || 0,
        trade_allowance: parseFloat(dealForm.trade_value) || 0,
        trade_description: dealForm.trade_description || null,
        // Financing terms
        term_months: parseInt(dealForm.term_months) || 48,
        interest_rate: parseFloat(dealForm.interest_rate) || 18,
        apr: parseFloat(dealForm.interest_rate) || 18,
        credit_score: dealForm.credit_score ? parseInt(dealForm.credit_score) : null,
        // Products/Add-ons
        gap_insurance: dealForm.gap_insurance ? 595 : 0,
        extended_warranty: dealForm.extended_warranty ? 1495 : 0,
        protection_package: dealForm.protection_package ? 895 : 0,
        accessory_1_desc: dealForm.accessory_1_desc || null,
        accessory_1_price: parseFloat(dealForm.accessory_1_price) || 0,
        accessory_2_desc: dealForm.accessory_2_desc || null,
        accessory_2_price: parseFloat(dealForm.accessory_2_price) || 0,
        accessory_3_desc: dealForm.accessory_3_desc || null,
        accessory_3_price: parseFloat(dealForm.accessory_3_price) || 0
      };

      let result;
      if (editingDeal) {
        result = await supabase.from('deals').update(dealData).eq('id', editingDeal.id).select().single();
        if (result.error) throw result.error;
        setEditingDeal(result.data);
        showToast('Deal updated');
      } else {
        result = await supabase.from('deals').insert([dealData]).select().single();
        if (result.error) throw result.error;
        setEditingDeal(result.data);
        showToast('Deal created');
      }

      await refreshDeals();
    } catch (err) {
      showToast(`Failed to save: ${err.message}`, 'error');
    } finally {
      setSaving(false);
    }
  };

  const deleteDeal = async (deal) => {
    try {
      const { error } = await supabase.from('deals').delete().eq('id', deal.id);
      if (error) throw error;
      await refreshDeals();
      showToast('Deal deleted');
      setConfirmDelete(null);
      setShowDealForm(false);
    } catch (err) {
      showToast('Failed to delete', 'error');
    }
  };

  const lockDeal = async (deal) => {
    try {
      const { error } = await supabase.from('deals').update({ locked: true, locked_at: new Date().toISOString() }).eq('id', deal.id);
      if (error) throw error;
      await refreshDeals();
      showToast('Deal locked');
      setConfirmLock(null);
    } catch (err) {
      showToast('Failed to lock', 'error');
    }
  };

  const archiveDeal = async (deal) => {
    try {
      const { error } = await supabase.from('deals').update({ archived: true, archived_at: new Date().toISOString() }).eq('id', deal.id);
      if (error) throw error;
      await refreshDeals();
      showToast('Deal archived');
    } catch (err) {
      showToast('Failed to archive', 'error');
    }
  };

  // ============ CUSTOMER FUNCTIONS ============
  const selectCustomer = (customer) => {
    setDealForm(prev => ({ 
      ...prev, 
      customer_id: customer.id, 
      purchaser_name: customer.name,
      customer_email: customer.email || prev.customer_email,
      customer_phone: customer.phone || prev.customer_phone
    }));
    setCustomerSearch(customer.name);
    setShowCustomerDropdown(false);
  };

  const saveNewCustomer = async () => {
    if (!newCustomer.name) { showToast('Enter customer name', 'error'); return; }
    try {
      const { data, error } = await supabase.from('customers').insert([{ ...newCustomer, dealer_id: dealerId }]).select().single();
      if (error) throw error;
      selectCustomer(data);
      setShowNewCustomer(false);
      setNewCustomer({ name: '', phone: '', email: '', address: '' });
      showToast('Customer added');
    } catch (err) {
      showToast('Failed to add customer', 'error');
    }
  };

  const addUpsell = (productId) => {
    if (productId === 'accessory') {
      setShowAccessories(true);
    } else {
      setDealForm(prev => ({ ...prev, [productId]: true }));
    }
  };

  // ============ DOCUMENT GENERATION ============
  const executeDeal = async () => {
    if (!editingDeal?.id) {
      showToast('Save the deal first', 'error');
      return;
    }

    setGenerating(true);
    try {
      // Call edge function to fill and generate documents
      const { data, error } = await supabase.functions.invoke('fill-deal-documents', {
        body: { deal_id: editingDeal.id }
      });

      if (error) throw error;

      if (data?.success) {
        // Reload generated documents
        await loadGeneratedDocs(editingDeal.id);
        
        // Update deal with generated docs info
        await supabase.from('deals').update({
          docs_generated: data.documents?.map(doc => doc.form_number) || [],
          docs_generated_at: new Date().toISOString()
        }).eq('id', editingDeal.id);
        
        await refreshDeals();
        showToast(`${data.count || data.documents?.length || 0} documents generated`);
      } else {
        throw new Error(data?.error || 'Document generation failed');
      }
    } catch (err) {
      console.error('Document generation error:', err);
      showToast(`Failed to generate: ${err.message}`, 'error');
    } finally {
      setGenerating(false);
    }
  };

  const sendForSignature = async () => {
    if (!dealForm.customer_email) {
      showToast('Customer email required for e-signature', 'error');
      return;
    }

    // TODO: Integrate with DocuSeal or similar e-signature service
    showToast('E-Signature integration coming soon');
  };

  // Delete a generated document
  const deleteGeneratedDoc = async (doc) => {
    if (!confirm(`Delete ${doc.form_name || doc.form_number}?`)) return;

    try {
      // Delete from storage if path exists
      if (doc.storage_path) {
        await supabase.storage
          .from('deal-documents')
          .remove([doc.storage_path]);
      }

      // Delete from database
      await supabase.from('generated_documents').delete().eq('id', doc.id);

      // Reload docs
      await loadGeneratedDocs(editingDeal.id);
      showToast('Document deleted');
    } catch (err) {
      showToast('Failed to delete: ' + err.message, 'error');
    }
  };

  // Delete all generated documents for current deal
  const deleteAllGeneratedDocs = async () => {
    if (!confirm(`Delete all ${currentDealDocs.length} generated documents?`)) return;

    try {
      // Delete from storage
      const paths = currentDealDocs.filter(d => d.storage_path).map(d => d.storage_path);
      if (paths.length > 0) {
        await supabase.storage.from('deal-documents').remove(paths);
      }

      // Delete from database
      await supabase.from('generated_documents').delete().eq('deal_id', editingDeal.id);

      // Reload docs
      await loadGeneratedDocs(editingDeal.id);
      showToast('All documents deleted');
    } catch (err) {
      showToast('Failed to delete: ' + err.message, 'error');
    }
  };

  // Check if a document has been generated
  const getGeneratedDoc = (docName) => {
    return currentDealDocs.find(d => 
      d.form_name === docName || 
      d.form_number === docName.toUpperCase().replace(/\s+/g, '-') ||
      d.form_name?.toLowerCase().includes(docName.toLowerCase())
    );
  };

  // ============ STYLES ============
  const cardStyle = { backgroundColor: theme.bgCard, border: `1px solid ${theme.border}`, borderRadius: '12px', padding: '16px' };
  const inputStyle = { width: '100%', padding: '10px 12px', backgroundColor: theme.bg, border: `1px solid ${theme.border}`, borderRadius: '8px', color: theme.text, fontSize: '14px', outline: 'none' };
  const buttonStyle = { padding: '10px 20px', backgroundColor: theme.accent, color: '#fff', border: 'none', borderRadius: '8px', fontWeight: '600', cursor: 'pointer', fontSize: '14px' };
  const labelStyle = { display: 'block', color: theme.textSecondary, fontSize: '12px', fontWeight: '500', marginBottom: '6px' };

  // ============ RENDER ============
  return (
    <>
      {/* Spinner animation for document generation */}
      <style>{`
        @keyframes spin {
          to { transform: rotate(360deg); }
        }
      `}</style>
      <div style={{ padding: '24px', maxWidth: '1800px', margin: '0 auto' }}>
      {/* HEADER */}
      <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'center', marginBottom: '24px', flexWrap: 'wrap', gap: '12px' }}>
        <div>
          <h1 style={{ color: theme.text, margin: 0, fontSize: '28px', fontWeight: '700' }}>Deals</h1>
          <p style={{ color: theme.textMuted, margin: '4px 0 0', fontSize: '14px' }}>{deals.filter(d => !d.archived).length} active deals</p>
        </div>
        <div style={{ display: 'flex', gap: '12px', alignItems: 'center' }}>
          <button onClick={() => setShowArchived(!showArchived)} style={{ padding: '8px 16px', backgroundColor: showArchived ? theme.accent : 'transparent', color: showArchived ? '#fff' : theme.textSecondary, border: `1px solid ${theme.border}`, borderRadius: '8px', cursor: 'pointer', fontSize: '13px' }}>
            {showArchived ? 'Show Active' : 'Show Archived'}
          </button>
          <div style={{ display: 'flex', backgroundColor: theme.bgCard, borderRadius: '8px', overflow: 'hidden', border: `1px solid ${theme.border}` }}>
            <button onClick={() => setViewMode('pipeline')} style={{ padding: '8px 16px', backgroundColor: viewMode === 'pipeline' ? theme.accent : 'transparent', color: viewMode === 'pipeline' ? '#fff' : theme.textSecondary, border: 'none', cursor: 'pointer', fontSize: '13px' }}>Pipeline</button>
            <button onClick={() => setViewMode('table')} style={{ padding: '8px 16px', backgroundColor: viewMode === 'table' ? theme.accent : 'transparent', color: viewMode === 'table' ? '#fff' : theme.textSecondary, border: 'none', cursor: 'pointer', fontSize: '13px' }}>Table</button>
          </div>
          <button onClick={openNewDeal} style={buttonStyle}>+ New Deal</button>
        </div>
      </div>

      {/* PIPELINE VIEW */}
      {viewMode === 'pipeline' && (
        <div style={{ display: 'flex', gap: '16px', overflowX: 'auto', paddingBottom: '16px' }}>
          {STAGES.map(stage => (
            <div key={stage.id} onDragOver={(e) => handleDragOver(e, stage.id)} onDragLeave={handleDragLeave} onDrop={(e) => handleDrop(e, stage.id)}
              style={{ flex: '0 0 300px', minHeight: '500px', backgroundColor: dragOverStage === stage.id ? `${stage.color}22` : theme.bgCard, borderRadius: '12px', border: `2px solid ${dragOverStage === stage.id ? stage.color : theme.border}`, padding: '16px', transition: 'all 0.2s' }}>
              <div style={{ display: 'flex', alignItems: 'center', gap: '8px', marginBottom: '16px' }}>
                <span style={{ color: theme.text, fontWeight: '600', fontSize: '15px' }}>{stage.label}</span>
                <span style={{ marginLeft: 'auto', backgroundColor: stage.color, color: '#fff', padding: '2px 10px', borderRadius: '12px', fontSize: '12px', fontWeight: '600' }}>{dealsByStage[stage.id]?.length || 0}</span>
              </div>
              <div style={{ display: 'flex', flexDirection: 'column', gap: '12px' }}>
                {dealsByStage[stage.id]?.map(deal => {
                  const typeColor = TYPE_COLORS[deal.deal_type] || '#71717a';
                  const compliance = getComplianceDeadline(deal);
                  const hasGeneratedDocs = deal.docs_generated?.length > 0;
                  return (
                    <div key={deal.id} draggable={!deal.locked && !deal.archived} onDragStart={(e) => handleDragStart(e, deal)} onDragEnd={handleDragEnd} onClick={() => openEditDeal(deal)}
                      style={{ backgroundColor: theme.bg, border: `1px solid ${theme.border}`, borderRadius: '10px', padding: '14px', cursor: deal.locked ? 'default' : 'grab', opacity: deal.archived ? 0.6 : 1, borderLeft: `4px solid ${typeColor}` }}>
                      <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'flex-start', marginBottom: '8px' }}>
                        <div>
                          <div style={{ color: theme.text, fontWeight: '600', fontSize: '14px' }}>{deal.purchaser_name || 'Unknown'}</div>
                          <div style={{ color: theme.textMuted, fontSize: '12px', marginTop: '2px' }}>{getVehicleDisplay(deal)}</div>
                        </div>
                        <div style={{ display: 'flex', gap: '4px', alignItems: 'center' }}>
                          {deal.locked && <span style={{ fontSize: '12px', color: theme.textMuted }}>Locked</span>}
                          <span style={{ backgroundColor: typeColor + '22', color: typeColor, padding: '2px 8px', borderRadius: '6px', fontSize: '10px', fontWeight: '600' }}>{deal.deal_type}</span>
                        </div>
                      </div>
                      <div style={{ color: theme.accent, fontWeight: '700', fontSize: '18px', margin: '8px 0' }}>${parseFloat(deal.price || 0).toLocaleString()}</div>
                      {compliance && (
                        <div style={{ fontSize: '11px', color: compliance.overdue ? '#ef4444' : compliance.daysLeft <= 10 ? '#f59e0b' : theme.textMuted, marginBottom: '4px' }}>
                          TC-69: {compliance.overdue ? `${Math.abs(compliance.daysLeft)} days overdue` : `${compliance.daysLeft} days left`}
                        </div>
                      )}
                      {hasGeneratedDocs && (
                        <div style={{ fontSize: '10px', color: '#22c55e' }}>
                          {deal.docs_generated.length} docs generated
                        </div>
                      )}
                    </div>
                  );
                })}
                {dealsByStage[stage.id]?.length === 0 && (
                  <div style={{ textAlign: 'center', padding: '30px 20px', color: theme.textMuted, fontSize: '13px', border: `2px dashed ${theme.border}`, borderRadius: '12px' }}>Drop deals here</div>
                )}
              </div>
            </div>
          ))}
        </div>
      )}

      {/* TABLE VIEW */}
      {viewMode === 'table' && (
        <div style={{ ...cardStyle, overflowX: 'auto' }}>
          <table style={{ width: '100%', borderCollapse: 'collapse' }}>
            <thead>
              <tr>
                {['Customer', 'Vehicle', 'Type', 'Stage', 'Price', 'Docs', 'Date'].map(h => (
                  <th key={h} style={{ textAlign: 'left', padding: '12px', color: theme.textMuted, fontSize: '12px', fontWeight: '600', borderBottom: `1px solid ${theme.border}` }}>{h}</th>
                ))}
              </tr>
            </thead>
            <tbody>
              {(showArchived ? deals.filter(d => d.archived) : deals.filter(d => !d.archived)).map(deal => (
                <tr key={deal.id} onClick={() => openEditDeal(deal)} style={{ cursor: 'pointer' }}>
                  <td style={{ padding: '12px', color: theme.text, fontSize: '14px', borderBottom: `1px solid ${theme.border}` }}>{deal.purchaser_name}</td>
                  <td style={{ padding: '12px', color: theme.textSecondary, fontSize: '14px', borderBottom: `1px solid ${theme.border}` }}>{getVehicleDisplay(deal)}</td>
                  <td style={{ padding: '12px', borderBottom: `1px solid ${theme.border}` }}>
                    <span style={{ backgroundColor: (TYPE_COLORS[deal.deal_type] || '#71717a') + '22', color: TYPE_COLORS[deal.deal_type] || '#71717a', padding: '4px 10px', borderRadius: '6px', fontSize: '12px', fontWeight: '600' }}>{deal.deal_type}</span>
                  </td>
                  <td style={{ padding: '12px', color: theme.textSecondary, fontSize: '14px', borderBottom: `1px solid ${theme.border}` }}>{deal.stage}</td>
                  <td style={{ padding: '12px', color: theme.accent, fontSize: '14px', fontWeight: '600', borderBottom: `1px solid ${theme.border}` }}>${parseFloat(deal.price || 0).toLocaleString()}</td>
                  <td style={{ padding: '12px', borderBottom: `1px solid ${theme.border}` }}>
                    {deal.docs_generated?.length > 0 ? (
                      <span style={{ color: '#22c55e', fontSize: '12px' }}>{deal.docs_generated.length} docs</span>
                    ) : (
                      <span style={{ color: theme.textMuted, fontSize: '12px' }}>None</span>
                    )}
                  </td>
                  <td style={{ padding: '12px', color: theme.textMuted, fontSize: '14px', borderBottom: `1px solid ${theme.border}` }}>{deal.date_of_sale}</td>
                </tr>
              ))}
            </tbody>
          </table>
        </div>
      )}

      {/* DEAL DETAIL MODAL */}
      {showDealForm && (
        <div style={{ position: 'fixed', inset: 0, backgroundColor: 'rgba(0,0,0,0.85)', display: 'flex', justifyContent: 'center', alignItems: 'flex-start', padding: '30px 20px', zIndex: 1000, overflowY: 'auto' }}>
          <div style={{ display: 'flex', gap: '20px', maxWidth: '1400px', width: '100%' }}>
            
            {/* LEFT: DEAL FORM */}
            <div style={{ ...cardStyle, flex: '1', maxWidth: '550px' }}>
              <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'center', marginBottom: '20px' }}>
                <h2 style={{ color: theme.text, margin: 0, fontSize: '20px' }}>{editingDeal ? 'Deal Detail' : 'New Deal'}</h2>
                <button onClick={() => setShowDealForm(false)} style={{ background: 'none', border: 'none', color: theme.textMuted, fontSize: '24px', cursor: 'pointer' }}>x</button>
              </div>

              <div style={{ display: 'grid', gap: '14px' }}>
                {/* Vehicle Selection */}
                <div>
                  <label style={labelStyle}>Vehicle</label>
                  <select value={dealForm.vehicle_id} onChange={(e) => { const v = inventory.find(x => x.id == e.target.value); setDealForm(prev => ({ ...prev, vehicle_id: e.target.value, price: v?.sale_price || prev.price })); }} style={inputStyle}>
                    <option value="">Select Vehicle</option>
                    {availableVehicles.map(v => <option key={v.id} value={v.id}>{v.year} {v.make} {v.model} - ${(v.sale_price || 0).toLocaleString()}</option>)}
                  </select>
                </div>

                {/* Vehicle Info */}
                {selectedVehicle && (
                  <div style={{ backgroundColor: theme.bg, border: `1px solid ${theme.border}`, borderRadius: '8px', padding: '12px', borderLeft: `4px solid ${theme.accent}` }}>
                    <div style={{ color: theme.text, fontWeight: '600', fontSize: '15px', marginBottom: '6px' }}>{selectedVehicle.year} {selectedVehicle.make} {selectedVehicle.model}</div>
                    <div style={{ display: 'grid', gridTemplateColumns: '1fr 1fr', gap: '4px', fontSize: '12px' }}>
                      <div><span style={{ color: theme.textMuted }}>VIN:</span> <span style={{ color: theme.textSecondary, fontFamily: 'monospace' }}>{selectedVehicle.vin || 'N/A'}</span></div>
                      <div><span style={{ color: theme.textMuted }}>Miles:</span> <span style={{ color: theme.textSecondary }}>{(selectedVehicle.miles || selectedVehicle.mileage || 0).toLocaleString()}</span></div>
                      <div><span style={{ color: theme.textMuted }}>Color:</span> <span style={{ color: theme.textSecondary }}>{selectedVehicle.color || 'N/A'}</span></div>
                      <div><span style={{ color: theme.textMuted }}>Stock:</span> <span style={{ color: theme.textSecondary }}>{selectedVehicle.stock_number || 'N/A'}</span></div>
                    </div>
                  </div>
                )}

                {/* Customer */}
                <div style={{ position: 'relative' }}>
                  <label style={labelStyle}>Customer</label>
                  <div style={{ display: 'flex', gap: '8px' }}>
                    <input type="text" value={customerSearch} onChange={(e) => { setCustomerSearch(e.target.value); setDealForm(prev => ({ ...prev, purchaser_name: e.target.value })); setShowCustomerDropdown(true); }} onFocus={() => setShowCustomerDropdown(true)} placeholder="Search or type name..." style={{ ...inputStyle, flex: 1 }} />
                    <button onClick={() => { setShowNewCustomer(true); setNewCustomer({ name: customerSearch, phone: '', email: '', address: '' }); }} style={{ ...buttonStyle, padding: '10px 14px' }}>+</button>
                  </div>
                  {showCustomerDropdown && filteredCustomers.length > 0 && (
                    <div style={{ position: 'absolute', top: '100%', left: 0, right: 0, backgroundColor: theme.bgCard, border: `1px solid ${theme.border}`, borderRadius: '8px', maxHeight: '150px', overflowY: 'auto', zIndex: 10, marginTop: '4px' }}>
                      {filteredCustomers.map(c => (
                        <div key={c.id} onClick={() => selectCustomer(c)} style={{ padding: '10px 12px', cursor: 'pointer', borderBottom: `1px solid ${theme.border}` }}>
                          <div style={{ color: theme.text, fontSize: '14px' }}>{c.name}</div>
                          <div style={{ color: theme.textMuted, fontSize: '11px' }}>{c.phone} {c.email && `| ${c.email}`}</div>
                        </div>
                      ))}
                    </div>
                  )}
                </div>

                {/* Customer Contact (for e-signature) */}
                <div style={{ display: 'grid', gridTemplateColumns: '1fr 1fr', gap: '10px' }}>
                  <div>
                    <label style={labelStyle}>Customer Email</label>
                    <input type="email" value={dealForm.customer_email || ''} onChange={(e) => setDealForm(prev => ({ ...prev, customer_email: e.target.value }))} placeholder="For e-signature" style={inputStyle} />
                  </div>
                  <div>
                    <label style={labelStyle}>Customer Phone</label>
                    <input type="tel" value={dealForm.customer_phone || ''} onChange={(e) => setDealForm(prev => ({ ...prev, customer_phone: e.target.value }))} style={inputStyle} />
                  </div>
                </div>

                {/* Deal Type & Stage */}
                <div style={{ display: 'grid', gridTemplateColumns: '1fr 1fr', gap: '10px' }}>
                  <div>
                    <label style={labelStyle}>Deal Type</label>
                    <select value={dealForm.deal_type} onChange={(e) => setDealForm(prev => ({ ...prev, deal_type: e.target.value }))} style={inputStyle}>
                      <option value="Cash">Cash</option>
                      <option value="BHPH">BHPH</option>
                      <option value="Financing">Outside Financing</option>
                      <option value="Wholesale">Wholesale</option>
                    </select>
                  </div>
                  <div>
                    <label style={labelStyle}>Stage</label>
                    <select value={dealForm.stage} onChange={(e) => setDealForm(prev => ({ ...prev, stage: e.target.value }))} style={inputStyle}>
                      {STAGES.map(s => <option key={s.id} value={s.id}>{s.label}</option>)}
                    </select>
                  </div>
                </div>

                {/* Price & Down */}
                <div style={{ display: 'grid', gridTemplateColumns: '1fr 1fr', gap: '10px' }}>
                  <div><label style={labelStyle}>Sale Price</label><input type="number" value={dealForm.price} onChange={(e) => setDealForm(prev => ({ ...prev, price: e.target.value }))} style={inputStyle} /></div>
                  <div><label style={labelStyle}>Down Payment</label><input type="number" value={dealForm.down_payment} onChange={(e) => setDealForm(prev => ({ ...prev, down_payment: e.target.value }))} style={inputStyle} /></div>
                </div>

                {/* Trade-In */}
                {showTradeIn ? (
                  <div style={{ backgroundColor: theme.bg, padding: '12px', borderRadius: '8px' }}>
                    <div style={{ color: theme.textSecondary, fontSize: '11px', fontWeight: '600', marginBottom: '10px' }}>TRADE-IN</div>
                    <input type="text" value={dealForm.trade_description} onChange={(e) => setDealForm(prev => ({ ...prev, trade_description: e.target.value }))} placeholder="2018 Honda Civic" style={{ ...inputStyle, marginBottom: '8px' }} />
                    <div style={{ display: 'grid', gridTemplateColumns: '1fr 1fr 1fr', gap: '8px' }}>
                      <div><label style={labelStyle}>Allowance</label><input type="number" value={dealForm.trade_value} onChange={(e) => setDealForm(prev => ({ ...prev, trade_value: e.target.value }))} style={inputStyle} /></div>
                      <div><label style={labelStyle}>Payoff</label><input type="number" value={dealForm.trade_payoff} onChange={(e) => setDealForm(prev => ({ ...prev, trade_payoff: e.target.value }))} style={inputStyle} /></div>
                      <div><label style={labelStyle}>ACV</label><input type="number" value={dealForm.trade_acv} onChange={(e) => setDealForm(prev => ({ ...prev, trade_acv: e.target.value }))} style={inputStyle} /></div>
                    </div>
                  </div>
                ) : (
                  <button onClick={() => setShowTradeIn(true)} style={{ padding: '10px', backgroundColor: 'transparent', border: `1px dashed ${theme.border}`, borderRadius: '8px', color: theme.textMuted, cursor: 'pointer', fontSize: '13px' }}>+ Add Trade-In</button>
                )}

                {/* BHPH Financing */}
                {(dealForm.deal_type === 'BHPH' || dealForm.deal_type === 'Financing') && (
                  <div style={{ backgroundColor: theme.bg, padding: '12px', borderRadius: '8px' }}>
                    <div style={{ color: theme.textSecondary, fontSize: '11px', fontWeight: '600', marginBottom: '10px' }}>FINANCING</div>
                    <div style={{ display: 'grid', gridTemplateColumns: '1fr 1fr 1fr', gap: '8px' }}>
                      <div><label style={labelStyle}>Term</label><select value={dealForm.term_months} onChange={(e) => setDealForm(prev => ({ ...prev, term_months: e.target.value }))} style={inputStyle}>{[24,36,48,60,72].map(m => <option key={m} value={m}>{m} mo</option>)}</select></div>
                      <div><label style={labelStyle}>Rate %</label><input type="number" value={dealForm.interest_rate} onChange={(e) => setDealForm(prev => ({ ...prev, interest_rate: e.target.value }))} style={inputStyle} /></div>
                      <div><label style={labelStyle}>Credit</label><input type="number" value={dealForm.credit_score} onChange={(e) => setDealForm(prev => ({ ...prev, credit_score: e.target.value }))} placeholder="Optional" style={inputStyle} /></div>
                    </div>
                  </div>
                )}

                {/* Salesman & Date */}
                <div style={{ display: 'grid', gridTemplateColumns: '1fr 1fr', gap: '10px' }}>
                  <div><label style={labelStyle}>Salesman</label><select value={dealForm.salesman} onChange={(e) => setDealForm(prev => ({ ...prev, salesman: e.target.value }))} style={inputStyle}><option value="">Select...</option>{salespeople.map(e => <option key={e.id} value={e.name}>{e.name}</option>)}</select></div>
                  <div><label style={labelStyle}>Date of Sale</label><input type="date" value={dealForm.date_of_sale} onChange={(e) => setDealForm(prev => ({ ...prev, date_of_sale: e.target.value }))} style={inputStyle} /></div>
                </div>

                {/* Products */}
                <div>
                  <label style={labelStyle}>Products</label>
                  <div style={{ display: 'flex', gap: '6px', flexWrap: 'wrap' }}>
                    {UPSELL_PRODUCTS.map(p => (
                      <label key={p.id} style={{ display: 'flex', alignItems: 'center', gap: '6px', padding: '6px 10px', backgroundColor: dealForm[p.id] ? theme.accentBg : theme.bg, border: `1px solid ${dealForm[p.id] ? theme.accent : theme.border}`, borderRadius: '6px', cursor: 'pointer', fontSize: '12px', color: theme.text }}>
                        <input type="checkbox" checked={dealForm[p.id]} onChange={(e) => setDealForm(prev => ({ ...prev, [p.id]: e.target.checked }))} style={{ display: 'none' }} />
                        {p.name} (${p.price})
                      </label>
                    ))}
                  </div>
                </div>

                {/* Accessories */}
                {showAccessories ? (
                  <div style={{ backgroundColor: theme.bg, padding: '12px', borderRadius: '8px' }}>
                    <div style={{ display: 'flex', justifyContent: 'space-between', marginBottom: '10px' }}>
                      <span style={{ color: theme.textSecondary, fontSize: '11px', fontWeight: '600' }}>ACCESSORIES</span>
                      {accessoryTotal > 0 && <span style={{ color: '#22c55e', fontSize: '11px' }}>${accessoryTotal.toLocaleString()}</span>}
                    </div>
                    {[1,2,3].map(n => (
                      <div key={n} style={{ display: 'grid', gridTemplateColumns: '2fr 1fr', gap: '6px', marginBottom: '6px' }}>
                        <input type="text" value={dealForm[`accessory_${n}_desc`]} onChange={(e) => setDealForm(prev => ({ ...prev, [`accessory_${n}_desc`]: e.target.value }))} placeholder={['Window Tint','Bed Liner','Floor Mats'][n-1]} style={inputStyle} />
                        <input type="number" value={dealForm[`accessory_${n}_price`]} onChange={(e) => setDealForm(prev => ({ ...prev, [`accessory_${n}_price`]: e.target.value }))} placeholder="$0" style={inputStyle} />
                      </div>
                    ))}
                  </div>
                ) : (
                  <button onClick={() => setShowAccessories(true)} style={{ padding: '10px', backgroundColor: 'transparent', border: `1px dashed ${theme.border}`, borderRadius: '8px', color: theme.textMuted, cursor: 'pointer', fontSize: '13px' }}>+ Add Accessories</button>
                )}

                {/* Notes */}
                <div><label style={labelStyle}>Notes</label><textarea value={dealForm.notes} onChange={(e) => setDealForm(prev => ({ ...prev, notes: e.target.value }))} rows={2} style={{ ...inputStyle, resize: 'vertical' }} /></div>

                {/* Save Button */}
                <button onClick={saveDeal} disabled={saving} style={{ ...buttonStyle, opacity: saving ? 0.7 : 1 }}>{saving ? 'Saving...' : (editingDeal ? 'Save Changes' : 'Create Deal')}</button>

                {/* Delete / Lock / Archive */}
                {editingDeal && (
                  <div style={{ display: 'flex', gap: '8px' }}>
                    {!editingDeal.locked && <button onClick={() => setConfirmDelete(editingDeal)} style={{ flex: 1, padding: '10px', backgroundColor: '#ef444422', border: '1px solid #ef4444', borderRadius: '8px', color: '#ef4444', cursor: 'pointer', fontSize: '13px' }}>Delete</button>}
                    {!editingDeal.locked && <button onClick={() => setConfirmLock(editingDeal)} style={{ flex: 1, padding: '10px', backgroundColor: '#22c55e22', border: '1px solid #22c55e', borderRadius: '8px', color: '#22c55e', cursor: 'pointer', fontSize: '13px' }}>Lock Deal</button>}
                    {editingDeal.locked && !editingDeal.archived && <button onClick={() => archiveDeal(editingDeal)} style={{ flex: 1, padding: '10px', backgroundColor: '#a855f722', border: '1px solid #a855f7', borderRadius: '8px', color: '#a855f7', cursor: 'pointer', fontSize: '13px' }}>Archive</button>}
                  </div>
                )}
              </div>
            </div>

            {/* MIDDLE: DOCUMENTS */}
            <div style={{ display: 'flex', flexDirection: 'column', gap: '16px', width: '320px' }}>
              {/* Required Documents Package */}
              <div style={{ ...cardStyle, alignSelf: 'flex-start', width: '100%' }}>
                <h3 style={{ color: theme.text, margin: '0 0 16px', fontSize: '15px' }}>Required Documents</h3>

                {/* Package info */}
                <div style={{
                  padding: '10px',
                  backgroundColor: docPackages[dealForm.deal_type] ? '#22c55e15' : '#f59e0b15',
                  border: `1px solid ${docPackages[dealForm.deal_type] ? '#22c55e40' : '#f59e0b40'}`,
                  borderRadius: '8px',
                  marginBottom: '12px'
                }}>
                  <div style={{ color: theme.text, fontSize: '13px', fontWeight: '600', marginBottom: '2px' }}>
                    {dealForm.deal_type} Package
                  </div>
                  <div style={{ color: docPackages[dealForm.deal_type] ? '#22c55e' : '#f59e0b', fontSize: '11px' }}>
                    {docPackages[dealForm.deal_type]
                      ? `${getDocsForDealType(dealForm.deal_type).length} docs from Document Rules`
                      : `${getDocsForDealType(dealForm.deal_type).length} docs (using defaults)`}
                  </div>
                  {!docPackages[dealForm.deal_type] && (
                    <div style={{ color: theme.textMuted, fontSize: '10px', marginTop: '4px' }}>
                      Configure packages in Document Rules
                    </div>
                  )}
                </div>

                {/* Document list - what will be generated */}
                <div style={{ display: 'flex', flexDirection: 'column', gap: '6px', marginBottom: '16px', maxHeight: '200px', overflowY: 'auto' }}>
                  {getDocsForDealType(dealForm.deal_type).map((doc, i) => {
                    const generatedDoc = getGeneratedDoc(doc);
                    const isGenerated = !!generatedDoc;

                    return (
                      <div key={i} style={{ display: 'flex', alignItems: 'center', gap: '8px', padding: '8px 10px', backgroundColor: theme.bg, borderRadius: '6px', border: `1px solid ${isGenerated ? '#22c55e' : theme.border}` }}>
                        <div style={{ width: '16px', height: '16px', borderRadius: '50%', backgroundColor: isGenerated ? '#22c55e' : theme.border, display: 'flex', alignItems: 'center', justifyContent: 'center' }}>
                          {isGenerated && <span style={{ color: '#fff', fontSize: '10px' }}>✓</span>}
                        </div>
                        <div style={{ flex: 1 }}>
                          <div style={{ color: theme.text, fontSize: '12px' }}>{doc}</div>
                        </div>
                      </div>
                    );
                  })}
                </div>

                {/* Create Documents Button */}
                {editingDeal ? (
                  <button onClick={executeDeal} disabled={generating}
                    style={{
                      ...buttonStyle,
                      width: '100%',
                      backgroundColor: generating ? '#1e7a3d' : '#22c55e',
                      opacity: generating ? 0.9 : 1,
                      cursor: generating ? 'wait' : 'pointer',
                      display: 'flex',
                      alignItems: 'center',
                      justifyContent: 'center',
                      gap: '8px'
                    }}>
                    {generating ? (
                      <>
                        <span style={{
                          display: 'inline-block',
                          width: '16px',
                          height: '16px',
                          border: '2px solid rgba(255,255,255,0.3)',
                          borderTopColor: '#fff',
                          borderRadius: '50%',
                          animation: 'spin 1s linear infinite'
                        }} />
                        Generating Documents...
                      </>
                    ) : '📄 Create Deal Documents'}
                  </button>
                ) : (
                  <div style={{ color: theme.textMuted, fontSize: '11px', textAlign: 'center', padding: '10px' }}>
                    Save deal first to generate documents
                  </div>
                )}
              </div>

              {/* Generated Documents Section - Only show if docs exist */}
              {currentDealDocs.length > 0 && (
                <div style={{ ...cardStyle, width: '100%' }}>
                  <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'center', marginBottom: '12px' }}>
                    <h3 style={{ color: theme.text, margin: 0, fontSize: '15px' }}>Generated Documents</h3>
                    <span style={{ fontSize: '10px', padding: '3px 8px', backgroundColor: '#22c55e20', color: '#22c55e', borderRadius: '4px' }}>
                      {currentDealDocs.length} ready
                    </span>
                  </div>

                  {/* Last generated timestamp */}
                  <div style={{ color: theme.textMuted, fontSize: '10px', marginBottom: '12px' }}>
                    Generated: {new Date(currentDealDocs[0]?.generated_at).toLocaleString()}
                  </div>

                  {/* Document list with download/view/delete */}
                  <div style={{ display: 'flex', flexDirection: 'column', gap: '6px', marginBottom: '16px', maxHeight: '200px', overflowY: 'auto' }}>
                    {currentDealDocs.map((doc, i) => (
                      <div key={i} style={{ display: 'flex', alignItems: 'center', gap: '8px', padding: '8px 10px', backgroundColor: theme.bg, borderRadius: '6px', border: `1px solid #22c55e40` }}>
                        <div style={{ flex: 1, minWidth: 0 }}>
                          <div style={{ color: theme.text, fontSize: '12px', whiteSpace: 'nowrap', overflow: 'hidden', textOverflow: 'ellipsis' }}>{doc.form_name || doc.form_number}</div>
                          <div style={{ color: theme.textMuted, fontSize: '9px' }}>{doc.form_number}</div>
                        </div>
                        <div style={{ display: 'flex', gap: '4px' }}>
                          {doc.public_url && (
                            <>
                              <a href={doc.public_url} target="_blank" rel="noopener noreferrer"
                                style={{ padding: '4px 8px', backgroundColor: '#3b82f6', color: '#fff', borderRadius: '4px', fontSize: '10px', textDecoration: 'none' }}>
                                View
                              </a>
                              <a href={doc.public_url} download={doc.file_name}
                                style={{ padding: '4px 8px', backgroundColor: theme.bgCard, color: theme.text, border: `1px solid ${theme.border}`, borderRadius: '4px', fontSize: '10px', textDecoration: 'none' }}>
                                ↓
                              </a>
                            </>
                          )}
                          <button onClick={() => deleteGeneratedDoc(doc)}
                            style={{ padding: '4px 8px', backgroundColor: '#ef444420', color: '#ef4444', border: '1px solid #ef444440', borderRadius: '4px', fontSize: '10px', cursor: 'pointer' }}>
                            ✕
                          </button>
                        </div>
                      </div>
                    ))}
                  </div>

                  {/* Delete All button */}
                  {currentDealDocs.length > 1 && (
                    <button onClick={deleteAllGeneratedDocs}
                      style={{ width: '100%', padding: '8px', backgroundColor: '#ef444420', color: '#ef4444', border: '1px solid #ef444440', borderRadius: '6px', fontSize: '11px', cursor: 'pointer', marginBottom: '12px' }}>
                      Delete All Documents
                    </button>
                  )}

                  {/* Signing & Delivery Options */}
                  <div style={{ borderTop: `1px solid ${theme.border}`, paddingTop: '12px' }}>
                    <div style={{ color: theme.textSecondary, fontSize: '11px', fontWeight: '600', marginBottom: '10px' }}>
                      Send for Signature
                    </div>
                    <div style={{ display: 'flex', flexDirection: 'column', gap: '8px' }}>
                      {/* Email Option */}
                      <button onClick={sendForSignature}
                        style={{ ...buttonStyle, width: '100%', backgroundColor: '#8b5cf6', display: 'flex', alignItems: 'center', justifyContent: 'center', gap: '8px' }}>
                        <span>📧</span> Email for E-Signature
                      </button>

                      {/* Print Option */}
                      <button onClick={() => {
                        currentDealDocs.forEach(doc => {
                          if (doc.public_url) window.open(doc.public_url, '_blank');
                        });
                      }}
                        style={{ ...buttonStyle, width: '100%', backgroundColor: theme.bgCard, border: `1px solid ${theme.border}`, color: theme.text, display: 'flex', alignItems: 'center', justifyContent: 'center', gap: '8px' }}>
                        <span>🖨️</span> Open All for Print
                      </button>

                      {/* Download All */}
                      <button onClick={() => {
                        currentDealDocs.forEach(doc => {
                          if (doc.public_url) {
                            const link = document.createElement('a');
                            link.href = doc.public_url;
                            link.download = doc.file_name || `${doc.form_number}.pdf`;
                            link.click();
                          }
                        });
                      }}
                        style={{ ...buttonStyle, width: '100%', backgroundColor: theme.bgCard, border: `1px solid ${theme.border}`, color: theme.text, display: 'flex', alignItems: 'center', justifyContent: 'center', gap: '8px' }}>
                        <span>📥</span> Download All PDFs
                      </button>

                      {/* Customer email status */}
                      {!dealForm.customer_email && (
                        <div style={{ color: '#f59e0b', fontSize: '10px', textAlign: 'center', padding: '6px', backgroundColor: '#f59e0b15', borderRadius: '4px' }}>
                          Add customer email to enable e-signature
                        </div>
                      )}
                    </div>
                  </div>
                </div>
              )}
            </div>

            {/* RIGHT: AI ASSISTANT */}
            <div style={{ ...cardStyle, width: '280px', alignSelf: 'flex-start' }}>
              <h3 style={{ color: theme.text, margin: '0 0 16px', fontSize: '15px' }}>Deal Assistant</h3>

              {/* Deal Score */}
              <div style={{ textAlign: 'center', marginBottom: '16px' }}>
                <div style={{ width: '80px', height: '80px', borderRadius: '50%', border: `5px solid ${getScoreColor(dealAnalysis.score)}`, display: 'flex', alignItems: 'center', justifyContent: 'center', margin: '0 auto', backgroundColor: theme.bg }}>
                  <div>
                    <div style={{ color: getScoreColor(dealAnalysis.score), fontSize: '26px', fontWeight: '700' }}>{dealAnalysis.score}</div>
                    <div style={{ color: theme.textMuted, fontSize: '9px' }}>SCORE</div>
                  </div>
                </div>
              </div>

              {/* Quick Stats */}
              <div style={{ display: 'grid', gridTemplateColumns: '1fr 1fr', gap: '8px', marginBottom: '16px' }}>
                <div style={{ backgroundColor: theme.bg, padding: '10px', borderRadius: '6px', textAlign: 'center' }}>
                  <div style={{ color: theme.textMuted, fontSize: '9px' }}>PAYMENT</div>
                  <div style={{ color: theme.text, fontSize: '16px', fontWeight: '600' }}>${dealAnalysis.monthly.toFixed(0)}</div>
                </div>
                <div style={{ backgroundColor: theme.bg, padding: '10px', borderRadius: '6px', textAlign: 'center' }}>
                  <div style={{ color: theme.textMuted, fontSize: '9px' }}>PROFIT</div>
                  <div style={{ color: '#22c55e', fontSize: '16px', fontWeight: '600' }}>${dealAnalysis.profit.toLocaleString()}</div>
                </div>
              </div>

              {/* Profit Breakdown */}
              <div style={{ marginBottom: '16px', fontSize: '11px' }}>
                <div style={{ display: 'flex', justifyContent: 'space-between', color: theme.textSecondary, marginBottom: '4px' }}>
                  <span>Front-End</span><span style={{ color: dealAnalysis.frontEnd >= 0 ? '#22c55e' : '#ef4444' }}>${dealAnalysis.frontEnd.toLocaleString()}</span>
                </div>
                <div style={{ display: 'flex', justifyContent: 'space-between', color: theme.textSecondary, marginBottom: '4px' }}>
                  <span>Back-End</span><span style={{ color: '#22c55e' }}>${dealAnalysis.backEnd.toLocaleString()}</span>
                </div>
                {dealAnalysis.tradeProfit !== 0 && (
                  <div style={{ display: 'flex', justifyContent: 'space-between', color: theme.textSecondary }}>
                    <span>Trade</span><span style={{ color: dealAnalysis.tradeProfit >= 0 ? '#22c55e' : '#ef4444' }}>${dealAnalysis.tradeProfit.toLocaleString()}</span>
                  </div>
                )}
              </div>

              {/* Warnings */}
              {dealAnalysis.warnings.length > 0 && (
                <div style={{ marginBottom: '16px' }}>
                  <div style={{ color: theme.textSecondary, fontSize: '10px', fontWeight: '600', marginBottom: '6px' }}>WARNINGS</div>
                  {dealAnalysis.warnings.map((w, i) => (
                    <div key={i} style={{ backgroundColor: w.severity === 'high' ? '#ef444422' : '#f59e0b22', border: `1px solid ${w.severity === 'high' ? '#ef4444' : '#f59e0b'}`, borderRadius: '4px', padding: '6px 8px', marginBottom: '4px' }}>
                      <div style={{ color: theme.text, fontSize: '11px', fontWeight: '600' }}>{w.title}</div>
                      <div style={{ color: theme.textMuted, fontSize: '10px' }}>{w.message}</div>
                    </div>
                  ))}
                </div>
              )}

              {/* Suggestions */}
              {dealAnalysis.suggestions.length > 0 && (
                <div>
                  <div style={{ color: theme.textSecondary, fontSize: '10px', fontWeight: '600', marginBottom: '6px' }}>SUGGESTIONS</div>
                  {dealAnalysis.suggestions.map((s, i) => (
                    <div key={i} style={{ backgroundColor: '#22c55e11', border: '1px solid #22c55e44', borderRadius: '4px', padding: '8px', marginBottom: '4px' }}>
                      <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'center' }}>
                        <div>
                          <div style={{ color: theme.text, fontSize: '11px', fontWeight: '600' }}>{s.title}</div>
                          <div style={{ color: theme.textMuted, fontSize: '10px' }}>{s.message}</div>
                          {s.profit && <div style={{ color: '#22c55e', fontSize: '10px' }}>+${s.profit} profit</div>}
                        </div>
                        <button onClick={() => addUpsell(s.product)} style={{ padding: '4px 10px', backgroundColor: '#22c55e', color: '#fff', border: 'none', borderRadius: '4px', fontSize: '10px', fontWeight: '600', cursor: 'pointer' }}>Add</button>
                      </div>
                    </div>
                  ))}
                </div>
              )}

              {/* Market Financing Terms */}
              {(dealForm.deal_type === 'BHPH' || dealForm.deal_type === 'Financing') && (
                <div style={{ marginTop: '16px', paddingTop: '16px', borderTop: `1px solid ${theme.border}` }}>
                  <div style={{ color: theme.textSecondary, fontSize: '10px', fontWeight: '600', marginBottom: '10px' }}>MARKET TERMS (Jan 2026)</div>
                  
                  {(() => {
                    const suggested = getSuggestedRate(dealForm.credit_score, dealForm.deal_type);
                    const currentRate = parseFloat(dealForm.interest_rate) || 0;
                    const rateDiff = currentRate - suggested.rate;
                    
                    return (
                      <div style={{ backgroundColor: theme.bg, borderRadius: '6px', padding: '10px', marginBottom: '10px' }}>
                        <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'center', marginBottom: '6px' }}>
                          <span style={{ color: theme.textMuted, fontSize: '10px' }}>Your Rate</span>
                          <span style={{ color: theme.text, fontSize: '14px', fontWeight: '600' }}>{currentRate}%</span>
                        </div>
                        <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'center', marginBottom: '6px' }}>
                          <span style={{ color: theme.textMuted, fontSize: '10px' }}>Market Avg ({suggested.tier})</span>
                          <span style={{ color: '#3b82f6', fontSize: '14px', fontWeight: '600' }}>{suggested.rate}%</span>
                        </div>
                        {dealForm.credit_score && (
                          <div style={{ fontSize: '9px', color: theme.textMuted, marginBottom: '8px' }}>
                            Based on {dealForm.credit_score} score ({suggested.range} range)
                          </div>
                        )}
                        {!dealForm.credit_score && (
                          <div style={{ fontSize: '9px', color: '#f59e0b', marginBottom: '8px' }}>
                            Enter credit score for accurate rate
                          </div>
                        )}
                        {rateDiff > 1 && (
                          <div style={{ fontSize: '10px', color: '#22c55e', marginBottom: '8px' }}>
                            You're {rateDiff.toFixed(1)}% above market - good margin
                          </div>
                        )}
                        {rateDiff < -1 && (
                          <div style={{ fontSize: '10px', color: '#ef4444', marginBottom: '8px' }}>
                            You're {Math.abs(rateDiff).toFixed(1)}% below market
                          </div>
                        )}
                        <button 
                          onClick={() => setDealForm(prev => ({ ...prev, interest_rate: suggested.rate.toString() }))}
                          style={{ width: '100%', padding: '6px', backgroundColor: '#3b82f622', border: '1px solid #3b82f6', borderRadius: '4px', color: '#3b82f6', fontSize: '10px', cursor: 'pointer' }}
                        >
                          Apply Market Rate ({suggested.rate}%)
                        </button>
                      </div>
                    );
                  })()}

                  <div style={{ color: theme.textMuted, fontSize: '9px', marginBottom: '6px' }}>COMMON TERMS</div>
                  <div style={{ display: 'flex', flexWrap: 'wrap', gap: '4px' }}>
                    {COMMON_TERMS.map(t => {
                      const isSelected = parseInt(dealForm.term_months) === t.months;
                      return (
                        <button
                          key={t.months}
                          onClick={() => setDealForm(prev => ({ ...prev, term_months: t.months.toString() }))}
                          style={{
                            padding: '4px 8px',
                            backgroundColor: isSelected ? theme.accent : theme.bg,
                            border: `1px solid ${isSelected ? theme.accent : theme.border}`,
                            borderRadius: '4px',
                            color: isSelected ? '#fff' : theme.textSecondary,
                            fontSize: '10px',
                            cursor: 'pointer'
                          }}
                          title={t.description}
                        >
                          {t.label}
                        </button>
                      );
                    })}
                  </div>

                  <div style={{ marginTop: '10px', fontSize: '9px', color: theme.textMuted }}>
                    <div style={{ marginBottom: '4px', fontWeight: '600' }}>Utah Market Rates:</div>
                    <div style={{ display: 'grid', gridTemplateColumns: '1fr 1fr', gap: '2px' }}>
                      <span>781+ Super Prime:</span><span>{dealForm.deal_type === 'BHPH' ? '15%' : '7.8%'}</span>
                      <span>661-780 Prime:</span><span>{dealForm.deal_type === 'BHPH' ? '18%' : '9.7%'}</span>
                      <span>601-660 Near Prime:</span><span>{dealForm.deal_type === 'BHPH' ? '21%' : '13.2%'}</span>
                      <span>501-600 Subprime:</span><span>{dealForm.deal_type === 'BHPH' ? '24%' : '17.5%'}</span>
                      <span>Below 500:</span><span>{dealForm.deal_type === 'BHPH' ? '29%' : '21%'}</span>
                    </div>
                  </div>
                </div>
              )}
            </div>
          </div>
        </div>
      )}

      {/* NEW CUSTOMER MODAL */}
      {showNewCustomer && (
        <div style={{ position: 'fixed', inset: 0, backgroundColor: 'rgba(0,0,0,0.8)', display: 'flex', justifyContent: 'center', alignItems: 'center', zIndex: 1100 }}>
          <div style={{ ...cardStyle, width: '350px' }}>
            <h3 style={{ color: theme.text, margin: '0 0 16px', fontSize: '16px' }}>New Customer</h3>
            <div style={{ display: 'grid', gap: '10px' }}>
              <div><label style={labelStyle}>Name</label><input type="text" value={newCustomer.name} onChange={(e) => setNewCustomer(prev => ({ ...prev, name: e.target.value }))} style={inputStyle} /></div>
              <div><label style={labelStyle}>Phone</label><input type="text" value={newCustomer.phone} onChange={(e) => setNewCustomer(prev => ({ ...prev, phone: e.target.value }))} style={inputStyle} /></div>
              <div><label style={labelStyle}>Email</label><input type="email" value={newCustomer.email} onChange={(e) => setNewCustomer(prev => ({ ...prev, email: e.target.value }))} style={inputStyle} /></div>
              <div style={{ display: 'flex', gap: '10px' }}>
                <button onClick={() => setShowNewCustomer(false)} style={{ ...buttonStyle, flex: 1, backgroundColor: 'transparent', border: `1px solid ${theme.border}`, color: theme.text }}>Cancel</button>
                <button onClick={saveNewCustomer} style={{ ...buttonStyle, flex: 1 }}>Save</button>
              </div>
            </div>
          </div>
        </div>
      )}

      {/* DELETE CONFIRMATION */}
      {confirmDelete && (
        <div style={{ position: 'fixed', inset: 0, backgroundColor: 'rgba(0,0,0,0.8)', display: 'flex', justifyContent: 'center', alignItems: 'center', zIndex: 1100 }}>
          <div style={{ ...cardStyle, width: '320px', textAlign: 'center' }}>
            <h3 style={{ color: theme.text, margin: '0 0 8px', fontSize: '16px' }}>Delete Deal?</h3>
            <p style={{ color: theme.textMuted, fontSize: '13px', marginBottom: '20px' }}>This will permanently delete the deal for {confirmDelete.purchaser_name}.</p>
            <div style={{ display: 'flex', gap: '10px' }}>
              <button onClick={() => setConfirmDelete(null)} style={{ ...buttonStyle, flex: 1, backgroundColor: 'transparent', border: `1px solid ${theme.border}`, color: theme.text }}>Cancel</button>
              <button onClick={() => deleteDeal(confirmDelete)} style={{ ...buttonStyle, flex: 1, backgroundColor: '#ef4444' }}>Delete</button>
            </div>
          </div>
        </div>
      )}

      {/* LOCK CONFIRMATION */}
      {confirmLock && (
        <div style={{ position: 'fixed', inset: 0, backgroundColor: 'rgba(0,0,0,0.8)', display: 'flex', justifyContent: 'center', alignItems: 'center', zIndex: 1100 }}>
          <div style={{ ...cardStyle, width: '320px', textAlign: 'center' }}>
            <h3 style={{ color: theme.text, margin: '0 0 8px', fontSize: '16px' }}>Lock Deal?</h3>
            <p style={{ color: theme.textMuted, fontSize: '13px', marginBottom: '20px' }}>Locking prevents further edits.</p>
            <div style={{ display: 'flex', gap: '10px' }}>
              <button onClick={() => setConfirmLock(null)} style={{ ...buttonStyle, flex: 1, backgroundColor: 'transparent', border: `1px solid ${theme.border}`, color: theme.text }}>Cancel</button>
              <button onClick={() => lockDeal(confirmLock)} style={{ ...buttonStyle, flex: 1, backgroundColor: '#22c55e' }}>Lock</button>
            </div>
          </div>
        </div>
      )}

      {/* TOAST */}
      {toast && (
        <div style={{ position: 'fixed', bottom: '24px', right: '24px', backgroundColor: toast.type === 'error' ? '#ef4444' : '#22c55e', color: '#fff', padding: '12px 20px', borderRadius: '8px', zIndex: 2000, fontSize: '14px', fontWeight: '500' }}>{toast.message}</div>
      )}
    </div>
    </>
  );
}