import { useState, useRef, useEffect } from 'react';
import { supabase } from '../lib/supabase';
import { useStore } from '../lib/store';
import { CreditService } from '../lib/creditService';

const MicIcon = () => (
  <svg width="20" height="20" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2">
    <path d="M12 1a3 3 0 0 0-3 3v8a3 3 0 0 0 6 0V4a3 3 0 0 0-3-3z"/>
    <path d="M19 10v2a7 7 0 0 1-14 0v-2"/><line x1="12" y1="19" x2="12" y2="23"/>
    <line x1="8" y1="23" x2="16" y2="23"/>
  </svg>
);

const MicOffIcon = () => (
  <svg width="20" height="20" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2">
    <line x1="1" y1="1" x2="23" y2="23"/><path d="M9 9v3a3 3 0 0 0 5.12 2.12M15 9.34V4a3 3 0 0 0-5.94-.6"/>
    <path d="M17 16.95A7 7 0 0 1 5 12v-2m14 0v2a7 7 0 0 1-.11 1.23"/>
    <line x1="12" y1="19" x2="12" y2="23"/><line x1="8" y1="23" x2="16" y2="23"/>
  </svg>
);

const SendIcon = () => (
  <svg width="20" height="20" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2">
    <line x1="22" y1="2" x2="11" y2="13"/><polygon points="22 2 15 22 11 13 2 9 22 2"/>
  </svg>
);

const SpeakerIcon = () => (
  <svg width="16" height="16" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2">
    <polygon points="11 5 6 9 2 9 2 15 6 15 11 19 11 5"/>
    <path d="M19.07 4.93a10 10 0 0 1 0 14.14M15.54 8.46a5 5 0 0 1 0 7.07"/>
  </svg>
);

export default function AIAssistant({ isOpen, onClose }) {
  const [messages, setMessages] = useState([
    { role: 'assistant', content: "Ay, what's good? O.G. Arnie here. You need somethin', I got you. What's the word?" }
  ]);
  const [input, setInput] = useState('');
  const [loading, setLoading] = useState(false);
  const [isListening, setIsListening] = useState(false);
  const [voiceMode, setVoiceMode] = useState(false);
  const [isSpeaking, setIsSpeaking] = useState(false);
  const [voices, setVoices] = useState([]);
  const [selectedVoice, setSelectedVoice] = useState(null);
  const messagesEndRef = useRef(null);
  const inputRef = useRef(null);
  const recognitionRef = useRef(null);

  const { inventory, employees, bhphLoans, deals, dealer } = useStore();

  const speechSupported = typeof window !== 'undefined' && 
    ('SpeechRecognition' in window || 'webkitSpeechRecognition' in window);

  // Load available voices for text-to-speech
  useEffect(() => {
    const loadVoices = () => {
      const availableVoices = speechSynthesis.getVoices();
      setVoices(availableVoices);
      // Find a deep, gruff voice for gangster grandpa Arnie
      const preferredVoice = availableVoices.find(v => 
        v.name.includes('Google UK English Male') ||
        v.name.includes('Daniel') ||
        v.name.includes('Google US English Male')
      ) || availableVoices.find(v => 
        v.name.includes('Male') || 
        v.name.includes('David') || 
        v.name.includes('James') ||
        v.name.includes('Alex')
      ) || availableVoices.find(v => v.lang.startsWith('en')) || availableVoices[0];
      setSelectedVoice(preferredVoice);
    };
    
    loadVoices();
    if (typeof speechSynthesis !== 'undefined') {
      speechSynthesis.onvoiceschanged = loadVoices;
    }
    
    return () => { 
      if (typeof speechSynthesis !== 'undefined') {
        speechSynthesis.onvoiceschanged = null; 
      }
    };
  }, []);

  // Speech recognition setup
  useEffect(() => {
    if (speechSupported) {
      const SpeechRecognition = window.SpeechRecognition || window.webkitSpeechRecognition;
      recognitionRef.current = new SpeechRecognition();
      recognitionRef.current.continuous = false;
      recognitionRef.current.interimResults = false;
      recognitionRef.current.lang = 'en-US';

      recognitionRef.current.onresult = (event) => {
        const transcript = event.results[0][0].transcript;
        setInput(transcript);
        setIsListening(false);
        // Auto-send in voice mode
        if (voiceMode) {
          setTimeout(() => {
            handleSendWithText(transcript);
          }, 300);
        }
      };

      recognitionRef.current.onerror = () => setIsListening(false);
      recognitionRef.current.onend = () => setIsListening(false);
    }
  }, [voiceMode]);

  useEffect(() => {
    messagesEndRef.current?.scrollIntoView({ behavior: 'smooth' });
  }, [messages]);

  useEffect(() => {
    if (isOpen) inputRef.current?.focus();
  }, [isOpen]);

  // Stop speaking when modal closes
  useEffect(() => {
    if (!isOpen && isSpeaking) {
      stopSpeaking();
    }
  }, [isOpen]);

  const toggleListening = () => {
    if (isSpeaking) {
      stopSpeaking();
    }
    if (isListening) {
      recognitionRef.current?.stop();
      setIsListening(false);
    } else {
      recognitionRef.current?.start();
      setIsListening(true);
    }
  };

  const speakText = (text) => {
    if (!voiceMode || !selectedVoice) return;
    
    // Cancel any ongoing speech
    speechSynthesis.cancel();
    
    const utterance = new SpeechSynthesisUtterance(text);
    utterance.voice = selectedVoice;
    utterance.rate = 0.9; // Slightly slower, deliberate like a wise old gangster
    utterance.pitch = 0.75; // Deep, gruff gangster grandpa voice
    utterance.volume = 1.0;
    
    utterance.onstart = () => setIsSpeaking(true);
    utterance.onend = () => setIsSpeaking(false);
    utterance.onerror = () => setIsSpeaking(false);
    
    speechSynthesis.speak(utterance);
  };

  const stopSpeaking = () => {
    speechSynthesis.cancel();
    setIsSpeaking(false);
  };

  const buildContext = async () => {
    const dealerId = dealer?.id;
    if (!dealerId) return { dealer_name: 'Unknown' };

    try {
      // Fetch ALL major tables in parallel
      const [
        inventoryRes,
        employeesRes,
        bhphLoansRes,
        bhphPaymentsRes,
        dealsRes,
        customersRes,
        commissionsRes,
        invCommissionsRes,
        invExpensesRes,
        manualExpensesRes,
        assetsRes,
        liabilitiesRes,
        paystubsRes,
        timeClockRes,
        bankAccountsRes,
        bankTransactionsRes,
        documentPackagesRes,
        formLibraryRes,
        messageTemplatesRes
      ] = await Promise.all([
        supabase.from('inventory').select('*').eq('dealer_id', dealerId),
        supabase.from('employees').select('*').eq('dealer_id', dealerId),
        supabase.from('bhph_loans').select('*').eq('dealer_id', dealerId),
        supabase.from('bhph_payments').select('*').eq('dealer_id', dealerId),
        supabase.from('deals').select('*').eq('dealer_id', dealerId),
        supabase.from('customers').select('*').eq('dealer_id', dealerId),
        supabase.from('commissions').select('*').eq('dealer_id', dealerId),
        supabase.from('inventory_commissions').select('*').eq('dealer_id', dealerId),
        supabase.from('inventory_expenses').select('*').eq('dealer_id', dealerId),
        supabase.from('manual_expenses').select('*').eq('dealer_id', dealerId),
        supabase.from('assets').select('*').eq('dealer_id', dealerId),
        supabase.from('liabilities').select('*').eq('dealer_id', dealerId),
        supabase.from('paystubs').select('*').eq('dealer_id', dealerId),
        supabase.from('time_clock').select('*').eq('dealer_id', dealerId),
        supabase.from('bank_accounts').select('*').eq('dealer_id', dealerId),
        supabase.from('bank_transactions').select('*').eq('dealer_id', dealerId),
        supabase.from('document_packages').select('*').eq('dealer_id', dealerId),
        supabase.from('form_library').select('*').limit(100),
        supabase.from('message_templates').select('*').eq('dealer_id', dealerId)
      ]);

      const inventory = inventoryRes.data || [];
      const employees = employeesRes.data || [];
      const bhphLoans = bhphLoansRes.data || [];
      const bhphPayments = bhphPaymentsRes.data || [];
      const deals = dealsRes.data || [];
      const customers = customersRes.data || [];
      const commissions = commissionsRes.data || [];
      const invCommissions = invCommissionsRes.data || [];
      const invExpenses = invExpensesRes.data || [];
      const manualExpenses = manualExpensesRes.data || [];
      const assets = assetsRes.data || [];
      const liabilities = liabilitiesRes.data || [];
      const paystubs = paystubsRes.data || [];
      const timeClock = timeClockRes.data || [];
      const bankAccounts = bankAccountsRes.data || [];
      const bankTransactions = bankTransactionsRes.data || [];
      const documentPackages = documentPackagesRes.data || [];
      const formLibrary = formLibraryRes.data || [];
      const messageTemplates = messageTemplatesRes.data || [];

      return {
        dealer: {
          name: dealer?.dealer_name,
          state: dealer?.state,
          subscription_status: dealer?.subscription_status
        },
        inventory: {
          total: inventory.length,
          by_status: {
            for_sale: inventory.filter(v => v.status === 'For Sale').length,
            in_stock: inventory.filter(v => v.status === 'In Stock').length,
            sold: inventory.filter(v => v.status === 'Sold').length,
            bhph: inventory.filter(v => v.status === 'BHPH').length
          },
          total_value: inventory.reduce((sum, v) => sum + (parseFloat(v.purchase_price) || 0), 0),
          vehicles: inventory.map(v => ({
            id: v.id,
            year: v.year,
            make: v.make,
            model: v.model,
            vin: v.vin,
            price: v.sale_price,
            purchase_price: v.purchase_price,
            status: v.status,
            miles: v.miles || v.mileage,
            stock_number: v.stock_number
          }))
        },
        employees: {
          total: employees.length,
          active: employees.filter(e => e.active).length,
          list: employees.map(e => ({
            id: e.id,
            name: e.name,
            active: e.active,
            roles: e.roles,
            job_title: e.job_title,
            hourly_rate: e.hourly_rate,
            hire_date: e.hire_date
          }))
        },
        bhph: {
          active_loans: bhphLoans.filter(l => l.status === 'Active').length,
          total_owed: bhphLoans.reduce((sum, l) => sum + (parseFloat(l.balance) || 0), 0),
          monthly_income: bhphLoans.reduce((sum, l) => sum + (parseFloat(l.monthly_payment) || 0), 0),
          loans: bhphLoans.map(l => ({
            id: l.id,
            customer: l.client_name,
            balance: l.balance,
            monthly_payment: l.monthly_payment,
            status: l.status,
            payments_made: l.payments_made
          })),
          payments: bhphPayments.map(p => ({
            loan_id: p.loan_id,
            amount: p.amount,
            principal: p.principal,
            interest: p.interest,
            payment_date: p.payment_date
          }))
        },
        deals: {
          total: deals.length,
          by_status: {
            completed: deals.filter(d => d.deal_status === 'Completed').length,
            pending: deals.filter(d => d.deal_status === 'Pending').length
          },
          total_revenue: deals.filter(d => d.deal_status === 'Completed').reduce((sum, d) => sum + (parseFloat(d.price) || 0), 0),
          list: deals.map(d => ({
            id: d.id,
            customer: d.purchaser_name,
            vehicle_id: d.vehicle_id,
            price: d.price,
            status: d.deal_status,
            date: d.date_of_sale,
            salesman: d.salesman,
            deal_type: d.deal_type
          }))
        },
        customers: {
          total: customers.length,
          list: customers.map(c => ({
            id: c.id,
            name: c.name,
            phone: c.phone,
            email: c.email,
            city: c.city,
            state: c.state
          }))
        },
        commissions: {
          pending: commissions.filter(c => c.status === 'pending').length,
          paid: commissions.filter(c => c.status === 'paid').length,
          total_pending: commissions.filter(c => c.status === 'pending').reduce((sum, c) => sum + (parseFloat(c.amount) || 0), 0),
          total_paid: commissions.filter(c => c.status === 'paid').reduce((sum, c) => sum + (parseFloat(c.amount) || 0), 0),
          by_employee: commissions.reduce((acc, c) => {
            if (!acc[c.employee_name]) acc[c.employee_name] = { pending: 0, paid: 0 };
            if (c.status === 'pending') acc[c.employee_name].pending += parseFloat(c.amount) || 0;
            if (c.status === 'paid') acc[c.employee_name].paid += parseFloat(c.amount) || 0;
            return acc;
          }, {}),
          inventory_commissions: invCommissions.map(c => ({
            inventory_id: c.inventory_id,
            employee_name: c.employee_name,
            role: c.role,
            amount: c.amount
          }))
        },
        expenses: {
          inventory: invExpenses.reduce((sum, e) => sum + (parseFloat(e.amount) || 0), 0),
          manual: manualExpenses.reduce((sum, e) => sum + (parseFloat(e.amount) || 0), 0),
          total: invExpenses.reduce((sum, e) => sum + (parseFloat(e.amount) || 0), 0) +
                 manualExpenses.reduce((sum, e) => sum + (parseFloat(e.amount) || 0), 0),
          inventory_expenses: invExpenses.map(e => ({
            inventory_id: e.inventory_id,
            description: e.description,
            amount: e.amount,
            category: e.category,
            date: e.expense_date
          })),
          manual_expenses: manualExpenses.map(e => ({
            description: e.description,
            amount: e.amount,
            vendor: e.vendor,
            date: e.expense_date
          }))
        },
        financials: {
          assets: {
            total: assets.length,
            total_value: assets.reduce((sum, a) => sum + (parseFloat(a.current_value) || 0), 0),
            list: assets.map(a => ({
              name: a.name,
              type: a.asset_type,
              current_value: a.current_value,
              purchase_price: a.purchase_price
            }))
          },
          liabilities: {
            total: liabilities.length,
            total_owed: liabilities.reduce((sum, l) => sum + (parseFloat(l.current_balance) || 0), 0),
            monthly_payments: liabilities.reduce((sum, l) => sum + (parseFloat(l.monthly_payment) || 0), 0),
            list: liabilities.map(l => ({
              name: l.name,
              type: l.liability_type,
              balance: l.current_balance,
              monthly_payment: l.monthly_payment,
              lender: l.lender
            }))
          },
          bank_accounts: bankAccounts.map(b => ({
            name: b.account_name,
            type: b.account_type,
            balance: b.current_balance,
            institution: b.institution_name
          })),
          recent_transactions: bankTransactions.slice(0, 20).map(t => ({
            date: t.transaction_date,
            amount: t.amount,
            merchant: t.merchant_name,
            category: t.plaid_category
          }))
        },
        payroll: {
          recent_paystubs: paystubs.slice(0, 10).map(p => ({
            employee_id: p.employee_id,
            pay_date: p.pay_date,
            gross_pay: p.gross_pay,
            net_pay: p.net_pay
          })),
          total_payroll_ytd: paystubs.reduce((sum, p) => sum + (parseFloat(p.gross_pay) || 0), 0)
        },
        time_clock: {
          recent_entries: timeClock.slice(0, 20).map(t => ({
            employee_id: t.employee_id,
            clock_in: t.clock_in,
            clock_out: t.clock_out,
            total_hours: t.total_hours
          }))
        },
        documents: {
          packages: documentPackages.map(p => ({
            deal_type: p.deal_type,
            state: p.state,
            docs: p.docs
          })),
          forms_available: formLibrary.length
        },
        messaging: {
          templates: messageTemplates.map(t => ({
            name: t.name,
            type: t.type,
            subject: t.subject
          }))
        }
      };
    } catch (error) {
      console.error('Error building context:', error);
      return {
        dealer_name: dealer?.dealer_name || 'Unknown',
        error: 'Failed to load complete data'
      };
    }
  };

  // Local fallback - gangster grandpa Arnie responses (NOTE: Uses data from store, not comprehensive DB query)
  const generateLocalResponse = (query) => {
    const q = query.toLowerCase();
    const fmt = (n) => (n || 0).toLocaleString();

    // Inventory
    if (q.includes('inventory') || q.includes('car') || q.includes('vehicle') || q.includes('stock') || q.includes('lot')) {
      const inStock = (inventory || []).filter(v => v.status === 'In Stock' || v.status === 'For Sale');
      const totalValue = inStock.reduce((sum, v) => sum + (parseFloat(v.purchase_price) || 0), 0);

      if (q.includes('how many') || q.includes('count')) {
        return `Listen, we got ${inStock.length} rides on the lot. That's $${fmt(totalValue)} in iron sittin' there. Capisce?`;
      }
      if (q.includes('value') || q.includes('worth')) {
        return `The inventory's worth about $${fmt(totalValue)}. That's ${inStock.length} vehicles, family. Good metal.`;
      }
      if (q.includes('list') || q.includes('show') || q.includes('what')) {
        const list = inStock.slice(0, 5).map(v => `${v.year} ${v.make} ${v.model}`).join(', ');
        return `Here's what we're workin' with: ${list}${inStock.length > 5 ? `, plus ${inStock.length - 5} more` : ''}. Solid rides, every one.`;
      }
      if (q.includes('for sale')) {
        const forSale = (inventory || []).filter(v => v.status === 'For Sale');
        return `We got ${forSale.length} cars marked for sale right now. Ready to move.`;
      }
      return `${inStock.length} vehicles on the lot, about $${fmt(totalValue)} worth. What else you need, family?`;
    }

    // Team / Employees / Payroll
    if (q.includes('team') || q.includes('employee') || q.includes('staff') || q.includes('who') || q.includes('crew') || q.includes('payroll')) {
      const active = (employees || []).filter(e => e.active);
      if (active.length === 0) return "Ain't got nobody in the system yet. We gotta fix that.";
      const names = active.map(e => e.name).join(', ');
      return `The crew? ${active.length} soldiers: ${names}. Good people, all of 'em.`;
    }

    // BHPH / Loans / Financing
    if (q.includes('bhph') || q.includes('loan') || q.includes('owe') || q.includes('payment') || q.includes('financ')) {
      const activeLoans = (bhphLoans || []).filter(l => l.status === 'Active');
      const totalOwed = activeLoans.reduce((sum, l) => sum + (parseFloat(l.current_balance) || 0), 0);
      const monthly = activeLoans.reduce((sum, l) => sum + (parseFloat(l.monthly_payment) || 0), 0);

      if (activeLoans.length === 0) return "No BHPH deals active right now. Clean slate.";
      return `Got ${activeLoans.length} BHPH loans out there. People owe us $${fmt(totalOwed)}. That's $${fmt(monthly)} comin' in monthly. They better pay up.`;
    }

    // Deals / Sales
    if (q.includes('deal') || q.includes('sale') || q.includes('sold') || q.includes('sell')) {
      const allDeals = deals || [];
      const totalRevenue = allDeals.reduce((sum, d) => sum + (parseFloat(d.price) || 0), 0);
      if (allDeals.length === 0) return "No deals closed yet. We gotta move some metal.";
      return `${allDeals.length} deals done, $${fmt(totalRevenue)} in revenue. Keep that energy, family.`;
    }

    // Customers
    if (q.includes('customer') || q.includes('client') || q.includes('buyer')) {
      const count = (customers || []).length;
      return count > 0 ? `${count} customers in the book. That's ${count} relationships, family.` : "Customer list is empty. Gotta build that network.";
    }

    // Commissions
    if (q.includes('commission') || q.includes('owed to') || q.includes('pay out')) {
      return "Yo, I got limited commission data in local mode. Try asking when the AI is online for the full breakdown.";
    }

    // Expenses
    if (q.includes('expense') || q.includes('spending') || q.includes('cost')) {
      return "I can see you're askin' about expenses. I got that data when the AI's online. Hang tight.";
    }

    // Assets / Liabilities / Books
    if (q.includes('asset') || q.includes('liabilit') || q.includes('debt') || q.includes('owe') || q.includes('book')) {
      return "Books and financials? I got all that when the AI's running. Let me fetch the full data for you.";
    }

    // Greetings
    if (q.includes('hello') || q.includes('hey') || q.includes('hi') || q.includes('what\'s up') || q.includes('yo')) {
      return "Ay, what's good? O.G. Arnie here. What you need?";
    }

    // Help
    if (q.includes('help') || q.includes('what can you')) {
      return "I know EVERYTHING about your dealership - inventory, BHPH, deals, team, customers, commissions, expenses, assets, liabilities, payroll, time clock, bank accounts, documents, messaging. Just ask me straight up.";
    }

    // Summary
    if (q.includes('summary') || q.includes('overview') || q.includes('status') || q.includes('dashboard')) {
      const inStock = (inventory || []).filter(v => v.status === 'In Stock' || v.status === 'For Sale');
      const activeLoans = (bhphLoans || []).filter(l => l.status === 'Active');
      const totalOwed = activeLoans.reduce((sum, l) => sum + (parseFloat(l.current_balance) || 0), 0);
      return `Alright, here's the rundown: ${inStock.length} cars on the lot, ${activeLoans.length} BHPH loans worth $${fmt(totalOwed)}, ${(deals || []).length} deals closed, ${(employees || []).filter(e => e.active).length} on the team. We're movin'. (For deeper numbers, I need the AI online)`;
    }

    // Default
    return "I hear you, but I ain't sure what you're askin'. Try inventory, BHPH, deals, team, customers, commissions, expenses, or books. I got all the data - just need the AI online for the deep dive.";
  };

  const handleSendWithText = async (textToSend) => {
    if (!textToSend.trim() || loading) return;

    const userMessage = textToSend.trim();
    setInput('');
    setMessages(prev => [...prev, { role: 'user', content: userMessage }]);

    // Check credits BEFORE operation
    const creditCheck = await CreditService.checkCredits(dealer.id, 'AI_ARNIE_QUERY');

    if (!creditCheck.success) {
      if (creditCheck.rate_limited) {
        setMessages(prev => [...prev, {
          role: 'assistant',
          content: `⏱️ Yo, slow down! Rate limit hit. Try again at ${new Date(creditCheck.next_allowed_at).toLocaleTimeString()}`
        }]);
        return;
      }
      setMessages(prev => [...prev, {
        role: 'assistant',
        content: '⚠️ ' + (creditCheck.message || 'Unable to process query right now.')
      }]);
      return;
    }

    if (creditCheck.warning) {
      console.warn(creditCheck.warning);
    }

    setLoading(true);

    let reply;
    let isLocal = false;

    try {
      // Build comprehensive context
      const context = await buildContext();

      // Try the API first
      const { data, error } = await supabase.functions.invoke('og-arnie-chat', {
        body: { message: userMessage, context }
      });

      console.log('API Response:', data, 'Error:', error);

      if (error) throw error;
      reply = data?.reply;

      if (!reply) {
        console.log('No reply in data, falling back to local');
        throw new Error('No reply');
      }

      // Consume credits AFTER successful API response
      await CreditService.consumeCredits(
        dealer.id,
        'AI_ARNIE_QUERY',
        null,
        { query: userMessage, response_length: reply?.length, mode: 'api' }
      );
    } catch (err) {
      console.log('API unavailable:', err.message, '- using local fallback');
      isLocal = true;
    }

    // If no API reply, use local fallback
    if (!reply) {
      reply = generateLocalResponse(userMessage);
      isLocal = true;

      // Consume credits even for local fallback (still valuable)
      await CreditService.consumeCredits(
        dealer.id,
        'AI_ARNIE_QUERY',
        null,
        { query: userMessage, response_length: reply?.length, mode: 'local' }
      );
    }

    // Add indicator if using local mode (for debugging)
    if (isLocal) {
      reply = reply + "\n\n(Local mode - AI offline)";
    }

    setMessages(prev => [...prev, { role: 'assistant', content: reply }]);

    // Speak the response if voice mode is on (without the debug text)
    if (voiceMode) {
      const speakReply = reply.replace("\n\n(Local mode - AI offline)", "");
      setTimeout(() => speakText(speakReply), 100);
    }

    setLoading(false);
  };

  const handleSend = async () => {
    await handleSendWithText(input);
  };

  const handleKeyPress = (e) => {
    if (e.key === 'Enter' && !e.shiftKey) {
      e.preventDefault();
      handleSend();
    }
  };

  const quickQueries = [
    { label: '📊 Inventory Stats', query: 'Give me a quick inventory summary' },
    { label: '💰 BHPH Status', query: 'How are my BHPH loans doing?' },
    { label: '👥 Team', query: 'Who is on my team?' },
    { label: '🚗 For Sale', query: 'What cars do I have for sale?' }
  ];

  if (!isOpen) return null;

  return (
    <div style={{
      position: 'fixed',
      inset: 0,
      backgroundColor: 'rgba(0,0,0,0.7)',
      display: 'flex',
      alignItems: 'center',
      justifyContent: 'center',
      zIndex: 9999,
      padding: '20px'
    }}>
      <div style={{
        width: '100%',
        maxWidth: '500px',
        height: '650px',
        maxHeight: '85vh',
        backgroundColor: '#18181b',
        borderRadius: '20px',
        display: 'flex',
        flexDirection: 'column',
        overflow: 'hidden',
        border: '1px solid #27272a'
      }}>
        {/* Header */}
        <div style={{
          padding: '16px 20px',
          borderBottom: '1px solid #27272a',
          display: 'flex',
          alignItems: 'center',
          gap: '12px'
        }}>
          <img src="/og-arnie.png" alt="OG Arnie" style={{
            width: '48px',
            height: '48px',
            borderRadius: '50%',
            border: '2px solid #f97316',
            objectFit: 'cover'
          }} />
          <div style={{ flex: 1 }}>
            <div style={{ fontWeight: '600', color: '#fff', fontSize: '16px' }}>OG Arnie</div>
            <div style={{ fontSize: '12px', color: '#71717a' }}>AI Assistant • {dealer?.dealer_name}</div>
          </div>
          
          {/* Voice Mode Toggle */}
          <button 
            onClick={() => {
              if (voiceMode) stopSpeaking();
              setVoiceMode(!voiceMode);
            }}
            style={{
              padding: '8px 14px',
              borderRadius: '20px',
              border: voiceMode ? '2px solid #22c55e' : '1px solid #3f3f46',
              backgroundColor: voiceMode ? 'rgba(34, 197, 94, 0.15)' : 'transparent',
              color: voiceMode ? '#22c55e' : '#71717a',
              fontSize: '12px',
              fontWeight: '600',
              cursor: 'pointer',
              display: 'flex',
              alignItems: 'center',
              gap: '6px',
              transition: 'all 0.2s'
            }}
            title={voiceMode ? 'Voice mode ON - Arnie will speak' : 'Turn on voice mode'}
          >
            {voiceMode ? '🔊' : '🔇'} {voiceMode ? 'Voice ON' : 'Voice'}
          </button>
          
          <button onClick={onClose} style={{
            background: 'none',
            border: 'none',
            color: '#71717a',
            cursor: 'pointer',
            fontSize: '24px',
            lineHeight: 1
          }}>×</button>
        </div>

        {/* Voice Settings Bar (when voice mode is on) */}
        {voiceMode && (
          <div style={{
            padding: '10px 20px',
            backgroundColor: 'rgba(34, 197, 94, 0.08)',
            borderBottom: '1px solid #27272a',
            display: 'flex',
            alignItems: 'center',
            gap: '10px'
          }}>
            <span style={{ color: '#71717a', fontSize: '12px', whiteSpace: 'nowrap' }}>Voice:</span>
            <select
              value={selectedVoice?.name || ''}
              onChange={(e) => setSelectedVoice(voices.find(v => v.name === e.target.value))}
              style={{
                flex: 1,
                padding: '6px 10px',
                backgroundColor: '#09090b',
                border: '1px solid #3f3f46',
                borderRadius: '6px',
                color: '#fff',
                fontSize: '12px',
                outline: 'none'
              }}
            >
              {voices.filter(v => v.lang.startsWith('en')).map(v => (
                <option key={v.name} value={v.name}>{v.name}</option>
              ))}
            </select>
            {isSpeaking && (
              <button 
                onClick={stopSpeaking}
                style={{
                  padding: '6px 12px',
                  backgroundColor: '#ef4444',
                  border: 'none',
                  borderRadius: '6px',
                  color: '#fff',
                  fontSize: '12px',
                  fontWeight: '600',
                  cursor: 'pointer',
                  display: 'flex',
                  alignItems: 'center',
                  gap: '4px'
                }}
              >
                ⏹ Stop
              </button>
            )}
          </div>
        )}

        {/* Messages */}
        <div style={{
          flex: 1,
          overflowY: 'auto',
          padding: '16px 20px'
        }}>
          {messages.map((msg, i) => (
            <div key={i} style={{
              marginBottom: '16px',
              display: 'flex',
              justifyContent: msg.role === 'user' ? 'flex-end' : 'flex-start'
            }}>
              <div style={{
                maxWidth: '85%',
                padding: '12px 16px',
                borderRadius: msg.role === 'user' ? '16px 16px 4px 16px' : '16px 16px 16px 4px',
                backgroundColor: msg.role === 'user' ? '#f97316' : '#27272a',
                color: '#fff',
                fontSize: '14px',
                lineHeight: '1.5',
                whiteSpace: 'pre-wrap',
                position: 'relative'
              }}>
                {msg.content}
                {/* Replay button for assistant messages when voice mode is on */}
                {msg.role === 'assistant' && voiceMode && i > 0 && (
                  <button
                    onClick={() => speakText(msg.content)}
                    style={{
                      position: 'absolute',
                      bottom: '4px',
                      right: '4px',
                      padding: '4px 6px',
                      backgroundColor: 'rgba(255,255,255,0.1)',
                      border: 'none',
                      borderRadius: '4px',
                      color: '#a1a1aa',
                      fontSize: '10px',
                      cursor: 'pointer',
                      display: 'flex',
                      alignItems: 'center',
                      gap: '2px'
                    }}
                    title="Replay this message"
                  >
                    <SpeakerIcon />
                  </button>
                )}
              </div>
            </div>
          ))}
          {loading && (
            <div style={{ display: 'flex', gap: '4px', padding: '12px' }}>
              {[0,1,2].map(i => (
                <div key={i} style={{
                  width: '8px', height: '8px', borderRadius: '50%',
                  backgroundColor: '#f97316',
                  animation: `bounce 1s infinite ${i * 0.2}s`
                }} />
              ))}
            </div>
          )}
          {isSpeaking && (
            <div style={{
              display: 'flex',
              alignItems: 'center',
              gap: '8px',
              padding: '8px 12px',
              backgroundColor: 'rgba(34, 197, 94, 0.1)',
              borderRadius: '8px',
              marginBottom: '8px'
            }}>
              <span style={{ animation: 'pulse 1s infinite' }}>🔊</span>
              <span style={{ color: '#22c55e', fontSize: '13px' }}>Arnie is speaking...</span>
            </div>
          )}
          <div ref={messagesEndRef} />
        </div>

        {/* Quick Queries */}
        <div style={{
          padding: '0 20px 12px',
          display: 'flex',
          gap: '8px',
          flexWrap: 'wrap'
        }}>
          {quickQueries.map((q, i) => (
            <button key={i} onClick={() => { 
              if (voiceMode) {
                handleSendWithText(q.query);
              } else {
                setInput(q.query); 
                inputRef.current?.focus(); 
              }
            }} style={{
              padding: '8px 12px',
              borderRadius: '20px',
              border: '1px solid #3f3f46',
              backgroundColor: 'transparent',
              color: '#a1a1aa',
              fontSize: '12px',
              cursor: 'pointer',
              transition: 'all 0.2s'
            }}>
              {q.label}
            </button>
          ))}
        </div>

        {/* Input */}
        <div style={{
          padding: '12px 16px 20px',
          borderTop: '1px solid #27272a',
          backgroundColor: '#18181b'
        }}>
          {isListening && (
            <div style={{
              marginBottom: '12px',
              padding: '8px 12px',
              backgroundColor: 'rgba(239, 68, 68, 0.15)',
              borderRadius: '8px',
              display: 'flex',
              alignItems: 'center',
              gap: '8px',
              color: '#ef4444',
              fontSize: '13px'
            }}>
              <span style={{ 
                width: '8px', height: '8px', borderRadius: '50%', 
                backgroundColor: '#ef4444', animation: 'pulse 1s infinite'
              }} />
              Listening... speak now
            </div>
          )}
          
          <div style={{ display: 'flex', gap: '10px' }}>
            <input
              ref={inputRef}
              type="text"
              value={input}
              onChange={e => setInput(e.target.value)}
              onKeyPress={handleKeyPress}
              placeholder={voiceMode ? "Tap mic to talk or type..." : "Ask OG Arnie anything..."}
              style={{
                flex: 1,
                padding: '14px 16px',
                borderRadius: '14px',
                border: '1px solid #3f3f46',
                backgroundColor: '#09090b',
                color: '#fff',
                fontSize: '15px',
                outline: 'none'
              }}
            />
            
            {speechSupported && (
              <button onClick={toggleListening} disabled={isSpeaking} style={{
                width: '50px',
                height: '50px',
                borderRadius: '14px',
                border: 'none',
                backgroundColor: isListening ? '#ef4444' : (voiceMode ? '#22c55e' : '#27272a'),
                color: '#fff',
                cursor: isSpeaking ? 'not-allowed' : 'pointer',
                display: 'flex',
                alignItems: 'center',
                justifyContent: 'center',
                transition: 'all 0.2s',
                opacity: isSpeaking ? 0.5 : 1
              }}>
                {isListening ? <MicOffIcon /> : <MicIcon />}
              </button>
            )}
            
            <button onClick={handleSend} disabled={loading || !input.trim()} style={{
              width: '50px',
              height: '50px',
              borderRadius: '14px',
              border: 'none',
              backgroundColor: input.trim() ? '#f97316' : '#3f3f46',
              color: '#fff',
              cursor: input.trim() ? 'pointer' : 'not-allowed',
              display: 'flex',
              alignItems: 'center',
              justifyContent: 'center',
              transition: 'all 0.2s'
            }}>
              <SendIcon />
            </button>
          </div>
        </div>
      </div>
      
      <style>{`
        @keyframes pulse { 0%, 100% { opacity: 1; } 50% { opacity: 0.4; } }
        @keyframes bounce { 0%, 100% { transform: translateY(0); } 50% { transform: translateY(-6px); } }
      `}</style>
    </div>
  );
}