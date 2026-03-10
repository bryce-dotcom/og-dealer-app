# OG Dealer Investor Portal - Complete Plan

## 🎯 Vision

Build a premium investor portal that allows accredited investors to fund dealer inventory purchases, earn returns on capital, and monitor their investments in real-time through a sleek dashboard with full transparency.

---

## 💼 Business Model

### How It Works

**1. Investor Provides Capital** → **2. Dealer Buys Inventory** → **3. Vehicle Sells** → **4. Investor Gets Return**

### Investment Structure

**Capital Pool Model:**
- Investors deposit funds into a shared investment account
- Funds are used to purchase dealer inventory (wholesale/auction)
- When vehicles sell, investor receives:
  - **Principal** (original investment)
  - **Return** (% of profit)
  - **Management fee** deducted by platform

**Example Deal:**
```
Investor deposits: $50,000
Used to buy: 5 vehicles @ $10,000 each
Vehicles sell for: $15,000 each (total $75,000)
Gross profit: $25,000
Investor return (60%): $15,000
Platform fee (20%): $5,000
Dealer profit (20%): $5,000

Investor receives: $50,000 principal + $15,000 return = $65,000
ROI: 30% over 60 days = 180% annualized
```

---

## 🏗️ Technical Architecture

### Database Tables

**1. `investors` - Investor Accounts**
```sql
CREATE TABLE investors (
  id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  user_id UUID REFERENCES auth.users(id),
  email TEXT NOT NULL UNIQUE,
  full_name TEXT NOT NULL,
  accredited_investor BOOLEAN DEFAULT false,

  -- Verification (for compliance)
  identity_verified BOOLEAN DEFAULT false,
  accreditation_verified BOOLEAN DEFAULT false,
  accreditation_method TEXT, -- 'income', 'net_worth', 'entity', 'professional'
  verification_documents JSONB,

  -- Contact
  phone TEXT,
  address JSONB, -- { street, city, state, zip }

  -- Financial
  total_invested DECIMAL(12,2) DEFAULT 0,
  total_returned DECIMAL(12,2) DEFAULT 0,
  total_profit DECIMAL(12,2) DEFAULT 0,
  available_balance DECIMAL(12,2) DEFAULT 0,

  -- Account
  status TEXT DEFAULT 'pending', -- 'pending', 'active', 'suspended', 'closed'
  plaid_item_id TEXT,
  plaid_access_token TEXT,
  linked_bank_account JSONB,

  created_at TIMESTAMPTZ DEFAULT now(),
  updated_at TIMESTAMPTZ DEFAULT now()
);
```

**2. `investor_capital` - Capital Deposits/Withdrawals**
```sql
CREATE TABLE investor_capital (
  id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  investor_id UUID NOT NULL REFERENCES investors(id),

  transaction_type TEXT NOT NULL, -- 'deposit', 'withdrawal'
  amount DECIMAL(12,2) NOT NULL,
  status TEXT DEFAULT 'pending', -- 'pending', 'processing', 'completed', 'failed'

  -- Plaid transaction linkage
  plaid_transaction_id TEXT,

  -- Bank details
  bank_account_last4 TEXT,
  bank_name TEXT,

  -- Timing
  initiated_at TIMESTAMPTZ DEFAULT now(),
  completed_at TIMESTAMPTZ,

  notes TEXT,
  created_at TIMESTAMPTZ DEFAULT now()
);
```

**3. `investment_pools` - Shared Investment Pools**
```sql
CREATE TABLE investment_pools (
  id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  pool_name TEXT NOT NULL,
  description TEXT,

  -- Pool status
  status TEXT DEFAULT 'active', -- 'active', 'closed', 'liquidating'

  -- Capital
  total_capital DECIMAL(12,2) DEFAULT 0,
  deployed_capital DECIMAL(12,2) DEFAULT 0,
  available_capital DECIMAL(12,2) DEFAULT 0,

  -- Returns
  total_profit DECIMAL(12,2) DEFAULT 0,
  lifetime_roi DECIMAL(5,2) DEFAULT 0,

  -- Terms
  investor_profit_share DECIMAL(5,2) DEFAULT 60.00, -- % of profit to investors
  platform_fee DECIMAL(5,2) DEFAULT 20.00,
  dealer_profit_share DECIMAL(5,2) DEFAULT 20.00,

  -- Minimum investment
  min_investment DECIMAL(12,2) DEFAULT 10000.00,

  created_at TIMESTAMPTZ DEFAULT now(),
  updated_at TIMESTAMPTZ DEFAULT now()
);
```

**4. `investor_pool_shares` - Investor ownership in pools**
```sql
CREATE TABLE investor_pool_shares (
  id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  investor_id UUID NOT NULL REFERENCES investors(id),
  pool_id UUID NOT NULL REFERENCES investment_pools(id),

  -- Ownership
  capital_invested DECIMAL(12,2) NOT NULL,
  ownership_percentage DECIMAL(5,4), -- Auto-calculated based on pool total

  -- Returns
  total_profit_earned DECIMAL(12,2) DEFAULT 0,
  total_distributions DECIMAL(12,2) DEFAULT 0,

  -- Status
  active BOOLEAN DEFAULT true,

  joined_at TIMESTAMPTZ DEFAULT now(),
  updated_at TIMESTAMPTZ DEFAULT now(),

  UNIQUE(investor_id, pool_id)
);
```

**5. `investor_vehicles` - Track which vehicles are funded by investor pool**
```sql
CREATE TABLE investor_vehicles (
  id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  pool_id UUID NOT NULL REFERENCES investment_pools(id),
  inventory_id TEXT NOT NULL REFERENCES inventory(id),
  dealer_id INTEGER NOT NULL REFERENCES dealer_settings(id),

  -- Investment details
  capital_deployed DECIMAL(12,2) NOT NULL, -- Amount used from pool
  purchase_price DECIMAL(12,2) NOT NULL,
  purchase_date DATE,

  -- Sale details
  sale_price DECIMAL(12,2),
  sale_date DATE,
  gross_profit DECIMAL(12,2),

  -- Profit split
  investor_profit DECIMAL(12,2),
  platform_fee_amount DECIMAL(12,2),
  dealer_profit DECIMAL(12,2),

  -- Status
  status TEXT DEFAULT 'active', -- 'active', 'sold', 'returned'

  created_at TIMESTAMPTZ DEFAULT now(),
  updated_at TIMESTAMPTZ DEFAULT now()
);
```

**6. `investor_distributions` - Profit payouts to investors**
```sql
CREATE TABLE investor_distributions (
  id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  investor_id UUID NOT NULL REFERENCES investors(id),
  pool_id UUID REFERENCES investment_pools(id),
  vehicle_id UUID REFERENCES investor_vehicles(id),

  distribution_type TEXT NOT NULL, -- 'profit', 'principal_return', 'interest'
  amount DECIMAL(12,2) NOT NULL,

  -- Payout
  status TEXT DEFAULT 'pending', -- 'pending', 'processing', 'paid', 'failed'
  payment_method TEXT, -- 'ach', 'wire', 'check'
  paid_at TIMESTAMPTZ,

  -- Transaction
  plaid_transaction_id TEXT,

  notes TEXT,
  created_at TIMESTAMPTZ DEFAULT now()
);
```

**7. `investor_reports` - Monthly/Quarterly statements**
```sql
CREATE TABLE investor_reports (
  id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  investor_id UUID NOT NULL REFERENCES investors(id),

  report_type TEXT NOT NULL, -- 'monthly', 'quarterly', 'annual', 'tax'
  period_start DATE NOT NULL,
  period_end DATE NOT NULL,

  -- Summary data (JSON)
  summary JSONB, -- { vehicles_sold, profit_earned, roi, etc }

  -- PDF
  pdf_url TEXT,

  generated_at TIMESTAMPTZ DEFAULT now(),
  sent_at TIMESTAMPTZ
);
```

---

## 🎨 Frontend Pages

### 1. **Investor Dashboard** (`/investor/dashboard`)

**Hero Stats Cards:**
```
┌─────────────────────────────────────────────────────────┐
│  💰 Total Invested        🎯 Total Returns              │
│     $125,000                  $47,500                   │
│                                                         │
│  📈 Current ROI           ⚡ Available Balance          │
│     38.0%                     $15,000                   │
└─────────────────────────────────────────────────────────┘
```

**Real-Time Capital Flow Chart:**
- Line graph showing capital in/out over time
- Bar chart of monthly returns
- Vehicle inventory status (active vs sold)

**Recent Transactions Table:**
| Date | Type | Vehicle | Amount | Status |
|------|------|---------|--------|--------|
| 05/15 | Sale Return | 2019 Honda Accord | +$4,200 | Paid |
| 05/12 | Capital Deploy | 2020 Toyota RAV4 | -$18,000 | Active |
| 05/08 | Deposit | ACH Transfer | +$25,000 | Cleared |

**Active Investments:**
- Cards showing each funded vehicle
- Shows: Vehicle, Purchase Price, Days Held, Projected Return
- Status: "On Lot", "In Deal", "Sold - Pending Payout"

---

### 2. **Portfolio** (`/investor/portfolio`)

**Investment Pool Overview:**
```
Main Pool - 67.5% ownership
┌────────────────────────────────────────────┐
│ Your Capital:        $125,000              │
│ Pool Total:          $185,000              │
│ Deployed:            $165,000 (89%)        │
│ Available:           $20,000               │
│                                            │
│ Active Vehicles:     18                    │
│ Vehicles Sold (30d): 12                    │
│ Avg Days on Lot:     22                    │
│                                            │
│ Your Lifetime Profit: $47,500              │
│ Pool Lifetime ROI:    38.0%                │
└────────────────────────────────────────────┘
```

**Vehicle Portfolio Grid:**
- All vehicles funded by investor
- Filter: Active | Sold | All
- Sort: Newest | Oldest | Highest Return
- Each card shows:
  - Photo
  - Year/Make/Model
  - Your Capital: $X
  - Status: "Day 15 on lot" or "Sold - Profit: $X"
  - Projected/Actual ROI

---

### 3. **Capital Management** (`/investor/capital`)

**Bank Account Connection:**
```
┌─────────────────────────────────────────┐
│  🏦 Connected: Chase Checking ****4521  │
│      Balance: $45,230                   │
│      [Disconnect] [Change Account]      │
└─────────────────────────────────────────┘
```

**Deposit Funds:**
- Amount input
- Source account dropdown
- Transfer speed: ACH (3-5 days) vs Wire (same day, $25 fee)
- Minimum: $10,000
- [Initiate Transfer] button

**Withdraw Funds:**
- Available balance shown
- Destination account
- Amount input
- Processing time: 2-3 business days
- [Request Withdrawal] button

**Transaction History:**
- Filterable table (All | Deposits | Withdrawals | Returns)
- Export to CSV
- Date range picker

---

### 4. **Returns & Reporting** (`/investor/returns`)

**Performance Overview:**
```
Year-to-Date Returns
┌───────────────────────────────────────────┐
│  Total Profit Earned:      $47,500        │
│  Average ROI per Vehicle:  12.3%          │
│  Best Performing:          2021 F-150     │
│    → Profit: $8,200 (41% ROI, 28 days)    │
│                                           │
│  Annualized Return:        156.8%         │
└───────────────────────────────────────────┘
```

**Monthly Returns Chart:**
- Bar chart showing monthly profit
- Hover: Shows # vehicles sold, avg ROI, total profit

**Download Reports:**
- Monthly statements (PDF)
- Quarterly performance reports
- Tax documents (1099 forms)
- CSV exports for accounting

**Profit Breakdown:**
- Pie chart: Principal Returned | Profit Earned | Still Deployed

---

### 5. **Shared Bank Account View** (`/investor/bank-account`)

**Live Account Balance:**
```
┌─────────────────────────────────────────────┐
│  OG Dealer Investment Pool - Shared Account │
│  Account: ****7890                          │
│                                             │
│  Current Balance: $52,340.18                │
│  Pending Deposits: $25,000                  │
│  Reserved for Purchases: $40,000            │
│  Available to Deploy: $37,340               │
└─────────────────────────────────────────────┘
```

**Live Transaction Feed (via Plaid):**
| Date/Time | Description | Amount | Balance |
|-----------|-------------|--------|---------|
| 05/15 3:42pm | Vehicle Sale Deposit | +$22,500 | $52,340 |
| 05/15 10:15am | Auction Purchase - 2020 RAV4 | -$18,500 | $29,840 |
| 05/14 2:30pm | Investor Deposit - John D. | +$50,000 | $48,340 |
| 05/13 11:22am | Platform Fee | -$1,200 | -$1,860 |

**Money In vs Out Chart:**
- Real-time visualization
- Today | This Week | This Month | All Time
- Green bars: Inflows (investor deposits, vehicle sales)
- Red bars: Outflows (vehicle purchases, distributions, fees)

**Transparency Features:**
- Every transaction tagged: "Investor Deposit", "Vehicle Purchase", "Sale Proceeds", "Distribution", "Fee"
- Downloadable transaction log
- Reconciliation report (monthly)

---

### 6. **Settings & Profile** (`/investor/settings`)

**Profile Information:**
- Name, Email, Phone
- Address
- Tax ID / SSN (encrypted)
- [Edit Profile]

**Accreditation Status:**
```
✓ Accredited Investor Verified
   Method: Net Worth ($1M+ excluding primary residence)
   Verified: 03/15/2025
   Documents: W2, Bank Statements
```

**Bank Accounts:**
- Linked accounts (via Plaid)
- Add new account
- Set default for distributions

**Notifications:**
- [ ] Email on vehicle sale
- [ ] Email on profit distribution
- [ ] Weekly performance summary
- [ ] Monthly statements

**Security:**
- Two-factor authentication
- Login history
- Change password

**Legal:**
- View investment agreement
- Download K-1 / 1099 tax forms
- Privacy policy / Terms of service

---

## 🔧 Backend Features

### Admin Dashboard (`/admin/investors`)

**Investor Management:**
- List all investors
- Approve/reject applications
- View investor details
- Manage accreditation verification

**Capital Pool Management:**
- Create/edit investment pools
- Set profit split percentages
- View pool performance
- Allocate capital to vehicles

**Vehicle Funding:**
- When dealer buys a vehicle, assign to pool
- Track capital deployment
- Mark as sold → trigger profit calculation
- Auto-distribute returns to investors

**Rate Configuration:**
```javascript
{
  "profit_split": {
    "investor_share": 60.0,    // % of profit to investors
    "platform_fee": 20.0,      // % to OG Dealer platform
    "dealer_share": 20.0       // % to dealer selling vehicle
  },
  "fees": {
    "deposit_fee": 0,          // $ or %
    "withdrawal_fee": 0,
    "management_fee_annual": 2.0  // % of AUM
  },
  "minimums": {
    "initial_investment": 10000,
    "additional_deposit": 5000
  }
}
```

**Profit Distribution Engine:**
```javascript
// When vehicle sells
function distributeProfit(vehicleId) {
  const vehicle = getVehicle(vehicleId);
  const grossProfit = vehicle.sale_price - vehicle.purchase_price;

  // Split profit
  const investorProfit = grossProfit * 0.60;
  const platformFee = grossProfit * 0.20;
  const dealerProfit = grossProfit * 0.20;

  // Get pool investors
  const pool = getPool(vehicle.pool_id);
  const investors = getPoolInvestors(pool.id);

  // Distribute to each investor based on ownership %
  investors.forEach(inv => {
    const distribution = investorProfit * inv.ownership_percentage;

    // Create distribution record
    createDistribution({
      investor_id: inv.id,
      amount: distribution,
      type: 'profit',
      vehicle_id: vehicleId
    });

    // Update balances
    updateInvestorBalance(inv.id, distribution);
  });

  // Return principal to pool
  returnCapitalToPool(pool.id, vehicle.purchase_price);
}
```

**Reporting System:**
- Generate monthly investor statements
- Export tax documents (1099-DIV)
- Pool performance reports
- Audit logs

---

## 🔌 Plaid Integration

### Features Needed:

**1. Link Investor Bank Accounts**
```javascript
// Frontend: Plaid Link UI
const { open } = usePlaidLink({
  token: linkToken,
  onSuccess: (public_token, metadata) => {
    // Exchange public token for access token
    exchangePlaidToken(public_token);
  }
});
```

**2. Monitor Shared Investment Account**
```javascript
// Backend: Fetch transactions daily
async function syncPoolAccountTransactions() {
  const plaidClient = new PlaidApi(plaidConfig);

  const response = await plaidClient.transactionsGet({
    access_token: POOL_ACCOUNT_ACCESS_TOKEN,
    start_date: '2025-01-01',
    end_date: today()
  });

  const transactions = response.data.transactions;

  // Categorize and store
  transactions.forEach(tx => {
    storeTransaction({
      plaid_transaction_id: tx.transaction_id,
      amount: tx.amount,
      date: tx.date,
      description: tx.name,
      category: categorizeTransaction(tx),
      pending: tx.pending
    });
  });
}
```

**3. Initiate ACH Transfers**
```javascript
// Investor deposits funds
async function initiateInvestorDeposit(investorId, amount) {
  const investor = getInvestor(investorId);

  const transfer = await plaidClient.transferCreate({
    access_token: investor.plaid_access_token,
    account_id: investor.plaid_account_id,
    amount: amount,
    description: 'Investment capital deposit',
    type: 'debit', // Pull from investor account
    network: 'ach'
  });

  // Create pending record
  createCapitalTransaction({
    investor_id: investorId,
    amount: amount,
    type: 'deposit',
    status: 'pending',
    plaid_transfer_id: transfer.transfer_id
  });
}
```

**4. Real-Time Balance Updates**
- WebSocket or polling every 30 seconds
- Show live account balance
- Alert investors when distributions hit their account

---

## 📊 Cool Dashboard Features

### 1. **Real-Time Money Flow Visualization**
- Animated graph showing money flowing in/out
- Green arrows: Capital coming in (deposits, sales)
- Red arrows: Capital going out (purchases, distributions)
- Particle effects for transactions

### 2. **Vehicle Performance Heatmap**
- Color-coded grid of all funded vehicles
- Green: High ROI
- Yellow: Average ROI
- Red: Below target or aged inventory
- Click to see details

### 3. **Profit Calculator**
- "What if" scenarios
- Input: Investment amount
- Shows: Projected monthly return based on historical avg
- Chart: Growth over time

### 4. **Portfolio Diversification Chart**
- Pie chart showing capital allocation
- By vehicle type (SUV, Sedan, Truck)
- By price range ($10-20k, $20-30k, etc)
- By dealer (if multi-dealer pool)

### 5. **ROI Leaderboard**
- Top 10 best performing vehicles
- Shows: Vehicle, Days to Sell, ROI%, Your Profit
- Gamification: Badges for milestones

### 6. **Activity Feed**
```
🚗 New vehicle funded: 2021 Toyota Tacoma ($28,500)
💰 Profit distribution: $2,450 from 2020 Honda CRV
📈 Your portfolio ROI increased to 38.2% (+0.4%)
🏦 ACH deposit cleared: $50,000 available
```

---

## 🔐 Security & Compliance

### Investor Accreditation Verification
**SEC Requirements:**
- Income test: $200k/yr individual or $300k/yr joint
- Net worth test: $1M+ (excluding primary residence)
- Entity test: Trust, LLC with $5M+ assets
- Professional test: Series 7/65/82 license

**Verification Process:**
1. Investor uploads documents (W2, bank statements, CPA letter)
2. Admin reviews and approves
3. Flag account as "accredited_investor = true"
4. Required for regulation compliance

### Data Security
- All financial data encrypted at rest (AES-256)
- Plaid tokens stored securely (never expose access tokens to frontend)
- Two-factor authentication required
- Audit logs for all admin actions
- Annual security audit

### Legal Documents
- Investment Agreement (signed via DocuSign)
- Operating Agreement (for LLC structure)
- Private Placement Memorandum (PPM)
- Subscription Agreement
- K-1 tax forms generated annually

---

## 🚀 Implementation Phases

### Phase 1: Foundation (Week 1-2)
- [ ] Database schema (7 new tables)
- [ ] Investor authentication system
- [ ] Basic dashboard UI
- [ ] Admin panel for investor management

### Phase 2: Plaid Integration (Week 3)
- [ ] Link investor bank accounts
- [ ] Connect shared pool account
- [ ] Real-time transaction sync
- [ ] ACH deposit/withdrawal flows

### Phase 3: Capital Management (Week 4)
- [ ] Investment pool logic
- [ ] Capital deployment to vehicles
- [ ] Profit calculation engine
- [ ] Distribution system

### Phase 4: Dashboard & Reporting (Week 5)
- [ ] Real-time money flow charts
- [ ] Vehicle portfolio view
- [ ] Monthly statement generator
- [ ] Performance analytics

### Phase 5: Advanced Features (Week 6)
- [ ] Tax document generation (1099)
- [ ] Automated distributions
- [ ] Email notifications
- [ ] Mobile-responsive design

### Phase 6: Compliance & Launch (Week 7)
- [ ] Accreditation verification system
- [ ] Legal document signing (DocuSign)
- [ ] Security audit
- [ ] Beta launch with 5 test investors

---

## 💰 Revenue Model

**Platform Fees:**
- 20% of gross profit on vehicle sales
- OR 2% annual management fee on AUM
- Whichever is higher

**Example:**
- Pool size: $500,000
- Management fee (2%): $10,000/year
- Average gross profit: $5,000/vehicle
- Platform fee (20%): $1,000/vehicle
- If 50 vehicles sell/year: $50,000 in fees
- Choose $50,000 (higher than $10k management fee)

---

## 📈 Investor Value Proposition

**Why Invest in OG Dealer Pool:**
- ✅ **High Returns:** Target 150-200% annualized ROI
- ✅ **Short Duration:** 30-60 day vehicle turnover
- ✅ **Secured by Assets:** Investment backed by physical vehicles
- ✅ **Full Transparency:** Real-time visibility into capital
- ✅ **Passive Income:** No work required, just collect returns
- ✅ **Diversification:** Spread risk across multiple vehicles
- ✅ **Experienced Operator:** Dealer track record visible

**Risks:**
- ⚠️ Vehicles may take longer to sell
- ⚠️ Market conditions may reduce profit margins
- ⚠️ Vehicle damage/depreciation risk
- ⚠️ Not FDIC insured
- ⚠️ Illiquid investment (30-90 day lockup)

---

## 🎯 Success Metrics

**Investor Satisfaction:**
- Average ROI > 150% annualized
- < 5% of vehicles held > 90 days
- 95%+ on-time distributions
- NPS score > 70

**Platform Growth:**
- Raise $1M in capital (Year 1)
- 10+ active investors
- $5M+ in vehicle sales
- $200k+ in platform fees

---

## 🛠️ Tech Stack

**Frontend:**
- React (existing)
- Recharts for visualizations
- Plaid Link for bank connections
- Framer Motion for animations

**Backend:**
- Supabase (existing)
- Edge Functions for profit calculations
- Scheduled jobs (cron) for daily transaction sync

**Integrations:**
- Plaid (bank connections & ACH)
- DocuSign (legal agreements)
- Stripe (backup payment method)
- SendGrid (email notifications)

**Reporting:**
- PDF generation (jsPDF)
- 1099 tax form templates
- Excel export (SheetJS)

---

## 🎨 Design Inspiration

**Style:**
- Modern fintech aesthetic (Robinhood, Wealthfront)
- Dark mode support
- Glass morphism cards
- Smooth animations
- Mobile-first responsive

**Colors:**
- Primary: Electric Blue (#0066FF)
- Success: Green (#00D96F)
- Warning: Amber (#FFBF00)
- Danger: Red (#FF3B3B)
- Background: Dark Navy (#0A1628)

**Fonts:**
- Headers: Inter Bold
- Body: Inter Regular
- Numbers: Roboto Mono (tabular figures)

---

## 🚀 Ready to Build?

This is a **premium, investor-grade portal** that will attract serious capital and scale your dealer business 10x.

Want me to start building? I can begin with:
1. Database migrations
2. Investor authentication
3. Plaid integration
4. Dashboard UI

Let me know and I'll get started! 💪
