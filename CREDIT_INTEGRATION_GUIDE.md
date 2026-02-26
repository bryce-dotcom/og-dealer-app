# Credit System Integration Guide

This document provides step-by-step instructions for integrating the credit system into the remaining features.

## Status

✅ **Completed:**
1. Database migration created
2. Credit service layer created
3. Stripe edge functions created (3 functions)
4. Credit balance widget created
5. Layout updated with widget
6. Billing page created
7. Vehicle Research feature integrated

🔄 **Remaining Integrations:**
8. Deal Doctor (DealsPage.jsx)
9. Market Comp Report (ResearchPage.jsx)
10. AI Arnie Query (AIAssistant.jsx)
11. VIN Decode (ResearchPage.jsx)
12. Form Generation (DealsPage.jsx)
13. Plaid Sync (BooksPage.jsx)
14. Payroll Run (PayrollPage.jsx)

---

## Integration Pattern

For ALL features, follow this pattern:

```javascript
// 1. Add import at top of file
import { CreditService } from '../lib/creditService';

// 2. BEFORE the expensive operation
const creditCheck = await CreditService.checkCredits(dealer.id, 'FEATURE_TYPE');

if (!creditCheck.success) {
  if (creditCheck.rate_limited) {
    showError(`Rate limit reached. Try again at ${new Date(creditCheck.next_allowed_at).toLocaleTimeString()}`);
    return;
  }
  showError(creditCheck.message || 'Unable to perform operation');
  return;
}

// Show warning if low on credits
if (creditCheck.warning) {
  console.warn(creditCheck.warning);
}

// 3. PERFORM THE OPERATION
const result = await performOperation();

// 4. AFTER successful operation
await CreditService.consumeCredits(dealer.id, 'FEATURE_TYPE', contextId, metadata);
```

---

## Feature-Specific Integration Details

### 8. Deal Doctor (DealsPage.jsx)

**File:** `src/pages/DealsPage.jsx`
**Feature Type:** `'DEAL_DOCTOR'`
**Cost:** 15 credits
**Location:** Line ~541 in `dealAnalysis` useMemo

**Integration:**

```javascript
// Find the useMemo that calculates dealAnalysis
const dealAnalysis = useMemo(() => {
  if (!selectedDeal || !inventory) return null;

  // ADD CREDIT CHECK HERE (before calculation)
  const checkAndCalculate = async () => {
    const creditCheck = await CreditService.checkCredits(dealer.id, 'DEAL_DOCTOR');

    if (!creditCheck.success) {
      if (creditCheck.rate_limited) {
        return { error: `Rate limit reached. Try again at ${new Date(creditCheck.next_allowed_at).toLocaleTimeString()}` };
      }
      return { error: creditCheck.message || 'Unable to analyze deal' };
    }

    // Perform analysis calculation (existing code)
    const analysis = performAnalysisCalculation();

    // Consume credits after successful analysis
    await CreditService.consumeCredits(
      dealer.id,
      'DEAL_DOCTOR',
      selectedDeal.id.toString(),
      { deal_id: selectedDeal.id, vehicle_id: selectedDeal.vehicle_id }
    );

    return analysis;
  };

  return checkAndCalculate();
}, [selectedDeal, inventory, dealer.id]);
```

**Note:** Since this is in a useMemo, you may need to convert it to a useEffect with state, or create a separate function that's called when the deal analysis is requested.

---

### 9. Market Comp Report (ResearchPage.jsx)

**File:** `src/pages/ResearchPage.jsx`
**Feature Type:** `'MARKET_COMP_REPORT'`
**Cost:** 20 credits
**Location:** Line ~400 in `handleComparablesSearch()`

**Integration:**

```javascript
const handleComparablesSearch = async () => {
  // Existing validation...

  // ADD CREDIT CHECK
  const creditCheck = await CreditService.checkCredits(dealer.id, 'MARKET_COMP_REPORT');

  if (!creditCheck.success) {
    if (creditCheck.rate_limited) {
      setError(`Rate limit reached. Try again at ${new Date(creditCheck.next_allowed_at).toLocaleTimeString()}`);
      return;
    }
    setError(creditCheck.message || 'Unable to search comparables');
    return;
  }

  if (creditCheck.warning) {
    console.warn(creditCheck.warning);
  }

  setLoadingComps(true);
  setError(null);

  try {
    // Existing fetch logic...
    const { data, error: fnError } = await supabase.functions.invoke('find-vehicles', { /* ... */ });

    if (fnError) throw fnError;

    // CONSUME CREDITS after success
    const vehicleId = `${results.year}-${results.make}-${results.model}`;
    await CreditService.consumeCredits(
      dealer.id,
      'MARKET_COMP_REPORT',
      vehicleId,
      { year: results.year, make: results.make, model: results.model }
    );

    setComparables(data.vehicles || []);
  } catch (err) {
    setError(err.message);
  } finally {
    setLoadingComps(false);
  }
};
```

---

### 10. AI Arnie Query (AIAssistant.jsx)

**File:** `src/components/AIAssistant.jsx`
**Feature Type:** `'AI_ARNIE_QUERY'`
**Cost:** 3 credits
**Location:** Line ~66 in message send handler

**Integration:**

```javascript
// In the message send function
const handleSendMessage = async () => {
  if (!input.trim()) return;

  // ADD CREDIT CHECK
  const creditCheck = await CreditService.checkCredits(dealer.id, 'AI_ARNIE_QUERY');

  if (!creditCheck.success) {
    if (creditCheck.rate_limited) {
      setMessages(prev => [...prev, {
        role: 'assistant',
        content: `⏱️ Rate limit reached. Try again at ${new Date(creditCheck.next_allowed_at).toLocaleTimeString()}`
      }]);
      return;
    }
    setMessages(prev => [...prev, {
      role: 'assistant',
      content: '⚠️ ' + (creditCheck.message || 'Unable to process query')
    }]);
    return;
  }

  if (creditCheck.warning) {
    console.warn(creditCheck.warning);
  }

  const userMessage = input.trim();
  setInput('');
  setMessages(prev => [...prev, { role: 'user', content: userMessage }]);
  setLoading(true);

  try {
    // Existing AI query logic...
    const { data, error: fnError } = await supabase.functions.invoke('og-arnie-chat', { /* ... */ });

    if (fnError) throw fnError;

    // CONSUME CREDITS after successful response
    await CreditService.consumeCredits(
      dealer.id,
      'AI_ARNIE_QUERY',
      null,
      { query: userMessage, response_length: data.response?.length }
    );

    setMessages(prev => [...prev, { role: 'assistant', content: data.response }]);
  } catch (err) {
    setMessages(prev => [...prev, { role: 'assistant', content: '❌ ' + err.message }]);
  } finally {
    setLoading(false);
  }
};
```

---

### 11. VIN Decode (ResearchPage.jsx)

**File:** `src/pages/ResearchPage.jsx`
**Feature Type:** `'VIN_DECODE'`
**Cost:** 1 credit
**Location:** Line ~829 in `startScanner()`

**Integration:**

```javascript
const startScanner = async () => {
  // ADD CREDIT CHECK
  const creditCheck = await CreditService.checkCredits(dealer.id, 'VIN_DECODE');

  if (!creditCheck.success) {
    if (creditCheck.rate_limited) {
      alert(`Rate limit reached. Try again at ${new Date(creditCheck.next_allowed_at).toLocaleTimeString()}`);
      return;
    }
    alert(creditCheck.message || 'Unable to decode VIN');
    return;
  }

  if (creditCheck.warning) {
    console.warn(creditCheck.warning);
  }

  // Existing scanner logic...
  const stream = await navigator.mediaDevices.getUserMedia({ video: { facingMode: 'environment' } });

  // After successful VIN decode
  const onDecode = async (decodedVin) => {
    // CONSUME CREDITS
    await CreditService.consumeCredits(
      dealer.id,
      'VIN_DECODE',
      decodedVin,
      { vin: decodedVin, method: 'camera_scan' }
    );

    setVin(decodedVin);
    stopScanner();
  };
};
```

---

### 12. Form Generation (DealsPage.jsx)

**File:** `src/pages/DealsPage.jsx`
**Feature Type:** `'FORM_GENERATION'`
**Cost:** 5 credits
**Location:** Line ~1110 in generate documents button handler

**Integration:**

```javascript
const handleGenerateDocs = async () => {
  // ADD CREDIT CHECK
  const creditCheck = await CreditService.checkCredits(dealer.id, 'FORM_GENERATION');

  if (!creditCheck.success) {
    if (creditCheck.rate_limited) {
      setError(`Rate limit reached. Try again at ${new Date(creditCheck.next_allowed_at).toLocaleTimeString()}`);
      return;
    }
    setError(creditCheck.message || 'Unable to generate documents');
    return;
  }

  if (creditCheck.warning) {
    console.warn(creditCheck.warning);
  }

  setGenerating(true);
  setError(null);

  try {
    // Existing document generation logic...
    const { data, error: fnError } = await supabase.functions.invoke('fill-deal-documents', { /* ... */ });

    if (fnError) throw fnError;

    // CONSUME CREDITS after successful generation
    await CreditService.consumeCredits(
      dealer.id,
      'FORM_GENERATION',
      selectedDeal.id.toString(),
      { deal_id: selectedDeal.id, forms_count: data.documents?.length }
    );

    // Update deal with generated docs...
  } catch (err) {
    setError(err.message);
  } finally {
    setGenerating(false);
  }
};
```

---

### 13. Plaid Bank Sync (BooksPage.jsx)

**File:** `src/pages/BooksPage.jsx`
**Feature Type:** `'PLAID_SYNC'`
**Cost:** 5 credits
**Location:** Line ~256 in sync button handler

**Integration:**

```javascript
const handlePlaidSync = async () => {
  // ADD CREDIT CHECK
  const creditCheck = await CreditService.checkCredits(dealer.id, 'PLAID_SYNC');

  if (!creditCheck.success) {
    if (creditCheck.rate_limited) {
      setError(`Rate limit reached. Try again at ${new Date(creditCheck.next_allowed_at).toLocaleTimeString()}`);
      return;
    }
    setError(creditCheck.message || 'Unable to sync bank account');
    return;
  }

  if (creditCheck.warning) {
    console.warn(creditCheck.warning);
  }

  setSyncing(true);
  setError(null);

  try {
    // Existing Plaid sync logic...
    const { data, error: fnError } = await supabase.functions.invoke('plaid-sync', { /* ... */ });

    if (fnError) throw fnError;

    // CONSUME CREDITS after successful sync
    await CreditService.consumeCredits(
      dealer.id,
      'PLAID_SYNC',
      null,
      { transactions_synced: data.transactions?.length }
    );

    // Update UI with synced data...
  } catch (err) {
    setError(err.message);
  } finally {
    setSyncing(false);
  }
};
```

---

### 14. Payroll Run (PayrollPage.jsx)

**File:** `src/pages/PayrollPage.jsx`
**Feature Type:** `'PAYROLL_RUN'`
**Cost:** 10 credits
**Location:** Line ~205 in `runPayroll()`

**Integration:**

```javascript
const runPayroll = async () => {
  // Existing validation...

  // ADD CREDIT CHECK
  const creditCheck = await CreditService.checkCredits(dealer.id, 'PAYROLL_RUN');

  if (!creditCheck.success) {
    if (creditCheck.rate_limited) {
      alert(`Rate limit reached. Try again at ${new Date(creditCheck.next_allowed_at).toLocaleTimeString()}`);
      return;
    }
    alert(creditCheck.message || 'Unable to run payroll');
    return;
  }

  if (creditCheck.warning) {
    console.warn(creditCheck.warning);
  }

  setProcessing(true);

  try {
    // Existing payroll calculation logic...
    const payrollData = calculatePayroll();

    // Save to database...
    const { data, error: dbError } = await supabase
      .from('payroll_runs')
      .insert(payrollData);

    if (dbError) throw dbError;

    // CONSUME CREDITS after successful payroll run
    await CreditService.consumeCredits(
      dealer.id,
      'PAYROLL_RUN',
      data[0].id.toString(),
      {
        payroll_run_id: data[0].id,
        employee_count: payrollData.employee_count,
        total_gross: payrollData.total_gross
      }
    );

    // Refresh payroll list...
  } catch (err) {
    alert('Payroll error: ' + err.message);
  } finally {
    setProcessing(false);
  }
};
```

---

## Next Steps

1. **Run the migration:**
   ```bash
   # Apply migration to create billing tables
   supabase db push
   ```

2. **Deploy edge functions:**
   ```bash
   supabase functions deploy stripe-create-checkout
   supabase functions deploy stripe-webhook
   supabase functions deploy stripe-purchase-credits
   ```

3. **Set environment variables in Supabase:**
   - Go to Project Settings > Edge Functions > Secrets
   - Add:
     - `STRIPE_SECRET_KEY`
     - `STRIPE_WEBHOOK_SECRET`
     - `STRIPE_PRICE_PRO`
     - `STRIPE_PRICE_DEALER`
     - `STRIPE_PRICE_UNLIMITED`

4. **Add to .env (frontend):**
   ```bash
   VITE_STRIPE_PUBLISHABLE_KEY=pk_test_...
   ```

5. **Configure Stripe:**
   - Create products in Stripe Dashboard:
     - Pro: $79/month (recurring)
     - Dealer: $149/month (recurring)
     - Unlimited: $299/month (recurring)
   - Copy price IDs to Supabase secrets
   - Create webhook endpoint pointing to your edge function URL
   - Copy webhook signing secret to Supabase secrets

6. **Add billing route:**
   Add to your router:
   ```javascript
   import BillingPage from './pages/BillingPage';

   // In routes:
   { path: '/billing', element: <BillingPage /> }
   ```

7. **Integrate remaining features:**
   - Follow the patterns above for each feature
   - Test each integration thoroughly
   - Verify credits are deducted correctly
   - Test rate limiting when out of credits

8. **Testing checklist:**
   - [ ] Migration applies successfully
   - [ ] Subscriptions table populated with existing dealers
   - [ ] Credit balance widget shows correct balance
   - [ ] Can upgrade from Free to Pro
   - [ ] Stripe webhook processes payments
   - [ ] Credits reset on monthly renewal
   - [ ] Vehicle Research deducts 10 credits
   - [ ] All 8 features integrated and tested
   - [ ] Rate limiting works when out of credits
   - [ ] Unlimited tier never deducts credits

---

## Credit Costs Reference

| Feature | Cost | Feature Type Constant |
|---------|------|-----------------------|
| Vehicle Research | 10 credits | `VEHICLE_RESEARCH` |
| Deal Doctor | 15 credits | `DEAL_DOCTOR` |
| Market Comp Report | 20 credits | `MARKET_COMP_REPORT` |
| AI Arnie Query | 3 credits | `AI_ARNIE_QUERY` |
| VIN Decode | 1 credit | `VIN_DECODE` |
| Form Generation | 5 credits | `FORM_GENERATION` |
| Plaid Sync | 5 credits/month | `PLAID_SYNC` |
| Payroll Run | 10 credits | `PAYROLL_RUN` |

---

## Rate Limits (when out of credits)

| Feature | Uses/Hour |
|---------|-----------|
| Vehicle Research | 2 |
| Deal Doctor | 2 |
| Market Comp Report | 1 |
| AI Arnie Query | 5 |
| VIN Decode | 10 |
| Form Generation | 5 |
| Plaid Sync | 1 |
| Payroll Run | 1 |

---

## Support

If you encounter issues:
1. Check browser console for errors
2. Check Supabase logs for edge function errors
3. Check Stripe dashboard for webhook delivery issues
4. Verify all environment variables are set correctly
5. Ensure migration ran successfully (`supabase db diff` to check)
