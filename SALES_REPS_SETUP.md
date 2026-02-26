# Sales Reps Commission System - Setup Instructions

## ✅ COMPLETED (Already pushed to GitHub)

1. **Migration Created**: `supabase/migrations/20260226_sales_rep_commissions.sql`
2. **Tab Added**: "Sales Reps" appears in DevConsole sections
3. **State Management**: All necessary useState hooks added
4. **Data Fetching**: loadAllData() now fetches sales reps data

## 🔧 MANUAL STEPS REQUIRED

### STEP 1: Run Migration in Supabase

Go to **Supabase Dashboard → SQL Editor** and run:
```sql
-- Copy entire contents of supabase/migrations/20260226_sales_rep_commissions.sql
```

This creates:
- `sales_reps` table
- `rep_signups` table
- `commission_payouts` table
- RLS policies
- Helper views

### STEP 2: Insert Handler Functions

Open `C:\OGDealer\src\pages\DevConsolePage.jsx`

Find line ~480 (after `handleSendInvite` function)

**INSERT** the entire contents of `SALES_REPS_HANDLERS.js`

### STEP 3: Insert UI Section

In `DevConsolePage.jsx`, find the **Users section** (search for `{/* USERS */}` around line 2290)

**AFTER** the closing of that section (after its final `</div>` and `)}`), **INSERT** the UI code from `SALES_REPS_TAB_CODE.md` Step 5.

### STEP 4: Insert Modals

In `DevConsolePage.jsx`, find where other modals are (search for `{addDealerModal &&` around line 4820)

**BEFORE** the final `</div>` that closes the main return statement, **INSERT** the modal code from `SALES_REPS_TAB_CODE.md` Step 6.

## 📊 FEATURES INCLUDED

### Dashboard Stats
- Total active reps
- Total active dealer signups
- Total MRR from rep-signed dealers
- Total commissions owed (unpaid)

### Rep Roster
- Table showing: name, territory, status, start date, active signups, MRR, months active
- Add Rep button with full form (upfront commission, residual rate, bonus rules, clawback period)
- Status badges (active=green, inactive=yellow, terminated=red)
- Click rep for detailed vesting info

### Signups Tracker
- Add Signup modal with **REAL dealer dropdown** (queries dealer_settings)
- Shows: dealer name, plan, monthly rate, signup date, status, rep
- Cancel button checks clawback period automatically
- Clawback indicator emoji 🔄 for clawed-back signups

### Monthly Payout Calculator
- Select rep and period (YYYY-MM)
- Auto-calculates:
  - **Upfront**: New signups × rep's upfront_commission
  - **Residual**: Sum of (monthly_rate × residual_rate) for ALL active accounts
  - **Bonus**: If signups >= bonus_threshold, add bonus_amount
  - **Clawback**: Subtract upfront for cancellations within clawback_days
  - **Net Payout**: upfront + residual + bonus - clawback
- Save Payout & Mark as Paid buttons
- Payout history table with running totals

### Vesting Calculator
- Shows months active for each rep
- Calculates vesting based on tenure:
  - 0-6 months: No residual after departure
  - 6-12 months: 6 months residual
  - 12-24 months: 12 months residual
  - 24+ months: 24 months residual
- If rep inactive, shows countdown of remaining residual payments
- Projected residual runway in dollars

## 🎯 COMMISSION STRUCTURE (Default)

- **Upfront**: $300 per new signup
- **Residual**: 15% of monthly revenue from ALL active accounts
- **Bonus**: $750 for 15+ signups in a month
- **Clawback**: 90-day window to reclaim upfront if dealer cancels

All values customizable per rep!

## 🔍 TESTING CHECKLIST

After setup:
1. [ ] Tab appears in DevConsole
2. [ ] Can add a sales rep
3. [ ] Can add a signup (dealer dropdown works)
4. [ ] Can cancel signup (clawback calculates correctly)
5. [ ] Payout calculator shows correct math
6. [ ] Can save & mark payouts as paid
7. [ ] Vesting calculator shows correct months/amounts
8. [ ] Dashboard stats update correctly

## 💰 MONETIZATION INTEGRATION

This system is ready to integrate with your pricing strategy:

**Current Plans (from beta email):**
- Starter: $99/mo
- Pro: $199/mo
- Dealer/Unlimited: $399/mo

**How Reps Earn:**
1. Rep signs dealer → $300 upfront commission
2. Dealer pays $199/mo → Rep gets $29.85/mo residual (15%)
3. Rep gets 15 signups in a month → $750 bonus
4. Dealer cancels within 90 days → $300 clawback

**Example Scenario:**
- Rep with 20 active dealers at $199/mo average
- Monthly MRR: $3,980
- Rep residual: $597/month
- Plus upfront for new signups
- Plus bonuses if hits threshold

## 🚀 NEXT STEPS

After completing manual steps:
1. Test locally
2. Deploy to production
3. Add first sales rep
4. Track performance!

---

**Files to Reference:**
- Migration: `supabase/migrations/20260226_sales_rep_commissions.sql`
- Handlers: `SALES_REPS_HANDLERS.js`
- UI Code: `SALES_REPS_TAB_CODE.md`
- This Guide: `SALES_REPS_SETUP.md`
