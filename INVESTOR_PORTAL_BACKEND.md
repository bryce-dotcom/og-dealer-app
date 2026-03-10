# Investor Portal Backend - Implementation Complete

## ✅ What's Been Built

### 🗄️ Database (8 Tables Created)

1. **`investors`** - Investor accounts, verification, financials
2. **`investment_pools`** - Shared capital pools with profit split terms
3. **`investor_pool_shares`** - Tracks investor ownership % in pools
4. **`investor_capital`** - Deposits/withdrawals transactions
5. **`investor_vehicles`** - Vehicles funded by pool capital
6. **`investor_distributions`** - Profit payouts to investors
7. **`investor_reports`** - Monthly/quarterly statements
8. **`pool_transactions`** - Complete audit log (Plaid integration ready)

### ⚙️ SQL Functions (6 Core Functions)

1. **`deploy_capital_to_vehicle()`** - Links vehicle to pool, deploys funds
2. **`process_investor_deposit()`** - Handles completed deposits
3. **`increment_investor_profit()`** - Updates investor totals
4. **`recalculate_pool_ownership()`** - Recalcs ownership % when capital changes
5. **`process_distribution_payout()`** - Marks distributions as paid
6. **`get_investor_dashboard_stats()`** - Returns key metrics for dashboard

### 🔧 Edge Functions (2 API Endpoints)

1. **`deploy-capital-to-vehicle`** - Deploy pool funds to purchase a vehicle
2. **`distribute-vehicle-profit`** - Calculate and distribute profit when vehicle sells

### 🔐 Security (RLS Policies)

- ✅ Investors can only see their own data
- ✅ Investors can only view pools they're invested in
- ✅ Investors can only see vehicles in their pools
- ✅ All queries filtered by authenticated user
- ✅ Admin policies ready for dealer management

---

## 🚀 How It Works

### Flow 1: Investor Deposits Capital

```sql
-- 1. Investor initiates deposit via UI
INSERT INTO investor_capital (investor_id, pool_id, amount, transaction_type)
VALUES (uuid, uuid, 50000, 'deposit');

-- 2. When ACH clears (Plaid webhook), call function
SELECT process_investor_deposit(capital_transaction_id);

-- This automatically:
-- - Updates investor.total_invested
-- - Updates pool.total_capital and available_capital
-- - Creates/updates investor_pool_shares
-- - Recalculates ownership percentages
-- - Logs transaction
```

### Flow 2: Dealer Buys Vehicle with Pool Funds

```javascript
// Call edge function
const { data } = await supabase.functions.invoke('deploy-capital-to-vehicle', {
  body: {
    pool_id: 'uuid',
    inventory_id: 'vehicle-123',
    dealer_id: 1,
    purchase_price: 18500
  }
});

// This automatically:
// - Checks available capital
// - Creates investor_vehicles record
// - Deploys capital from pool (available → deployed)
// - Links vehicle to pool
// - Logs transaction
```

### Flow 3: Vehicle Sells, Distribute Profit

```javascript
// Call edge function when vehicle marked as sold
const { data } = await supabase.functions.invoke('distribute-vehicle-profit', {
  body: {
    vehicle_id: 'investor-vehicle-uuid',
    sale_price: 24500,
    sale_date: '2026-03-06'
  }
});

// This automatically:
// - Calculates gross profit (sale - purchase - costs)
// - Splits profit (60% investors, 20% platform, 20% dealer)
// - Distributes to each investor based on pool ownership %
// - Creates distribution records (pending payout)
// - Returns capital to pool (available for next purchase)
// - Updates all totals and stats
// - Logs transaction
```

### Flow 4: Pay Out Distributions

```sql
-- When ACH payout completes (Plaid), call function
SELECT process_distribution_payout(
  p_distribution_id := uuid,
  p_plaid_transaction_id := 'plaid-tx-123'
);

-- This automatically:
-- - Marks distribution as paid
-- - Updates investor.available_balance
-- - Updates pool share distribution totals
```

---

## 📊 Example Investment Scenario

```
SCENARIO: 3 Investors, 1 Pool, 1 Vehicle

Step 1: Create Pool
  - pool_name: "OG Dealer Main Pool"
  - Terms: 60% investor, 20% platform, 20% dealer

Step 2: Investors Deposit
  - Alice: $50,000 (50% ownership)
  - Bob: $30,000 (30% ownership)
  - Carol: $20,000 (20% ownership)
  - Pool Total: $100,000 available

Step 3: Deploy Capital
  - Dealer buys 2020 Toyota RAV4 for $18,500
  - Call deploy_capital_to_vehicle()
  - Pool: $81,500 available, $18,500 deployed

Step 4: Vehicle Sells
  - Sells for $24,500 after 45 days
  - Gross Profit: $6,000
  - Split:
    - Investors: $3,600 (60%)
    - Platform: $1,200 (20%)
    - Dealer: $1,200 (20%)

Step 5: Distribute to Investors
  - Alice: $1,800 (50% of $3,600)
  - Bob: $1,080 (30% of $3,600)
  - Carol: $720 (20% of $3,600)
  - Create 3 distribution records

Step 6: Capital Returns
  - Pool: $100,000 available ($81,500 + $18,500 returned)
  - Investor balances updated
  - Ready to deploy again!

Step 7: Pay Distributions (via Plaid ACH)
  - Transfer $1,800 to Alice's bank
  - Transfer $1,080 to Bob's bank
  - Transfer $720 to Carol's bank
```

---

## 🔌 Next Steps for Plaid Integration

### 1. Link Investor Bank Accounts

```javascript
// Use Plaid Link to connect investor accounts
const { open } = usePlaidLink({
  token: linkToken,
  onSuccess: async (public_token) => {
    // Exchange for access token
    const { access_token } = await exchangeToken(public_token);

    // Save to investor record
    await supabase
      .from('investors')
      .update({
        plaid_item_id: item_id,
        plaid_access_token: access_token // encrypted
      })
      .eq('id', investorId);
  }
});
```

### 2. Monitor Pool Bank Account

```javascript
// Fetch daily transactions
const transactions = await plaidClient.transactionsGet({
  access_token: pool.plaid_access_token,
  start_date: '2026-01-01',
  end_date: today
});

// Store in pool_transactions table
transactions.forEach(async (tx) => {
  await supabase.from('pool_transactions').insert({
    pool_id: pool.id,
    transaction_type: categorize(tx),
    amount: tx.amount,
    plaid_transaction_id: tx.transaction_id,
    description: tx.name,
    transaction_date: tx.date
  });
});
```

### 3. Initiate ACH Transfers

```javascript
// When investor deposits
const transfer = await plaidClient.transferCreate({
  access_token: investor.plaid_access_token,
  amount: depositAmount,
  type: 'debit', // pull from investor
  network: 'ach'
});

// When distributing profit
const transfer = await plaidClient.transferCreate({
  access_token: investor.plaid_access_token,
  amount: profitAmount,
  type: 'credit', // send to investor
  network: 'ach'
});
```

---

## 📋 Migration Checklist

- [x] Create all database tables
- [x] Add RLS policies
- [x] Create helper SQL functions
- [x] Create edge functions
- [ ] **Deploy migrations:** `supabase db push`
- [ ] **Deploy edge functions:** `supabase functions deploy deploy-capital-to-vehicle distribute-vehicle-profit`
- [ ] Build frontend dashboard
- [ ] Integrate Plaid
- [ ] Add admin panel

---

## 🎯 Key Metrics Tracked

**Per Investor:**
- Total Invested
- Total Returned (principal + profit)
- Total Profit
- Available Balance
- Lifetime ROI %

**Per Pool:**
- Total Capital
- Deployed Capital (in active vehicles)
- Available Capital (ready to deploy)
- Total Profit Generated
- Total Vehicles Funded/Sold
- Lifetime ROI %

**Per Vehicle:**
- Capital Deployed
- Purchase Price
- Sale Price
- Days Held
- Gross Profit
- Profit Split (investor/platform/dealer)

---

## 🔥 What Makes This Cool

1. **Automated Profit Distribution** - No manual calculations, instant splits
2. **Real-Time Ownership** - Percentages recalc automatically
3. **Complete Transparency** - Every transaction logged
4. **Plaid-Ready** - Built for bank integration
5. **Scalable** - Multiple pools, unlimited investors
6. **Secure** - RLS policies, encrypted tokens
7. **Audit Trail** - Full transaction history

---

## 🚀 Ready for Frontend!

All backend logic is complete. Next phase: Build the investor dashboard UI!
