# Plaid Integration Setup Guide

This guide explains how to set up Plaid integration for automatic bank and credit card transaction syncing in the Books page.

## Prerequisites

1. **Plaid Account**: Sign up at [https://dashboard.plaid.com/signup](https://dashboard.plaid.com/signup)
2. **Plaid API Keys**: Get your `client_id` and `secret` from the Plaid Dashboard

## Setup Steps

### 1. Get Plaid Credentials

1. Go to [Plaid Dashboard](https://dashboard.plaid.com/)
2. Navigate to **Team Settings** → **Keys**
3. Copy your:
   - `client_id`
   - `sandbox` secret (for testing)
   - `development` secret (for production testing)
   - `production` secret (for live use)

### 2. Add Environment Variables to Supabase

1. Go to your Supabase project dashboard
2. Navigate to **Project Settings** → **Edge Functions** → **Secrets**
3. Add the following environment variables:

```
PLAID_CLIENT_ID=your_client_id_here
PLAID_SECRET=your_secret_here
PLAID_ENV=sandbox
```

**Environments:**
- `sandbox` - For development/testing with fake data
- `development` - For testing with real bank credentials (limited)
- `production` - For live use with real users

### 3. Run Database Migration

Run the migration to create the necessary tables and columns:

```sql
-- In Supabase SQL Editor, run:
-- File: supabase/migrations/20260217_add_plaid_integration.sql
```

Or via Supabase CLI:
```bash
npx supabase@latest db push
```

### 4. Deploy Edge Functions

Deploy the Plaid edge functions:

```bash
npx supabase@latest functions deploy plaid-link-token --no-verify-jwt
npx supabase@latest functions deploy plaid-sync --no-verify-jwt
```

### 5. Install Frontend Dependencies

```bash
npm install
```

The `react-plaid-link` package is already added to package.json.

### 6. Test the Integration

1. Go to the **Books** page in your app
2. Click the **Accounts** tab
3. Click **"+ Connect Bank/Card"**
4. In sandbox mode, use Plaid's test credentials:
   - Username: `user_good`
   - Password: `pass_good`
   - Any institution (e.g., search for "Chase")

## How It Works

### 1. Connect Account Flow

```
User clicks "Connect Bank/Card"
  ↓
Frontend calls plaid-link-token edge function
  ↓
Edge function creates Plaid Link token
  ↓
Plaid Link modal opens for user to select bank
  ↓
User authenticates with their bank
  ↓
Plaid returns public_token
  ↓
Frontend calls plaid-sync edge function with public_token
  ↓
Edge function exchanges token for access_token
  ↓
Fetches account details and last 30 days of transactions
  ↓
Saves to bank_accounts and bank_transactions tables
  ↓
User sees connected account in Accounts tab
```

### 2. Sync Transactions Flow

```
User clicks "Sync Now" or "Sync All"
  ↓
Frontend calls plaid-sync edge function
  ↓
Edge function fetches new transactions from Plaid
  ↓
Inserts new transactions into bank_transactions table
  ↓
Updates last_synced_at timestamp
  ↓
User sees new transactions in Inbox tab
```

### 3. Categorize & Book Flow

```
User sees transaction in Inbox tab
  ↓
Picks a category (income/expense)
  ↓
Clicks "Book It"
  ↓
Transaction status changes from 'inbox' to 'booked'
  ↓
Appears in Booked tab for reporting
```

## Database Schema

### bank_accounts Table

| Column | Type | Description |
|--------|------|-------------|
| id | UUID | Primary key |
| dealer_id | UUID | Foreign key to dealer_settings |
| plaid_access_token | TEXT | Encrypted Plaid access token |
| plaid_item_id | TEXT | Plaid item ID |
| plaid_account_id | TEXT | Plaid account ID |
| account_name | TEXT | Account name (e.g., "Plaid Checking") |
| account_type | TEXT | checking, savings, credit_card |
| account_mask | TEXT | Last 4 digits |
| current_balance | DECIMAL | Current account balance |
| institution_name | TEXT | Bank name (e.g., "Chase") |
| institution_logo | TEXT | Bank logo URL |
| is_plaid_connected | BOOLEAN | Connection status |
| sync_status | TEXT | active, error, disconnected |
| last_synced_at | TIMESTAMPTZ | Last sync timestamp |

### bank_transactions Table

| Column | Type | Description |
|--------|------|-------------|
| id | UUID | Primary key |
| dealer_id | UUID | Foreign key to dealer_settings |
| bank_account_id | UUID | Foreign key to bank_accounts |
| plaid_transaction_id | TEXT | Plaid transaction ID (unique) |
| merchant_name | TEXT | Merchant name |
| amount | DECIMAL | Transaction amount (negative for expenses) |
| transaction_date | DATE | Transaction date |
| pending | BOOLEAN | Is pending |
| category_id | UUID | Foreign key to expense_categories |
| status | TEXT | inbox, booked, ignored |
| is_income | BOOLEAN | Income vs expense |

## Plaid Sandbox Testing

In sandbox mode, use these test credentials:

**Good Account** (successful connection):
- Username: `user_good`
- Password: `pass_good`

**Transactions**: Sandbox accounts come with sample transactions from the last 30 days.

## Production Checklist

Before going live:

1. ✅ Change `PLAID_ENV` to `production`
2. ✅ Update `PLAID_SECRET` to production secret
3. ✅ Set up Plaid webhooks for automatic transaction updates
4. ✅ Enable Plaid production access (requires business verification)
5. ✅ Test with real bank accounts in development mode first

## Troubleshooting

### "Failed to create link token"
- Check that `PLAID_CLIENT_ID` and `PLAID_SECRET` are set correctly in Supabase environment variables
- Verify the edge function `plaid-link-token` is deployed

### "Failed to connect account"
- Check Supabase edge function logs for `plaid-sync`
- Verify the migration was run successfully
- Check that RLS policies allow inserts to `bank_accounts` table

### Transactions not syncing
- Check the `last_synced_at` timestamp in `bank_accounts` table
- View Supabase edge function logs for errors
- Verify Plaid API is not rate-limited

### "Account disconnected"
- Plaid access tokens can expire or be revoked
- User needs to reconnect the account
- Check `sync_status` column for error messages

## Support

- **Plaid Docs**: https://plaid.com/docs/
- **Plaid Dashboard**: https://dashboard.plaid.com/
- **Supabase Edge Functions**: https://supabase.com/docs/guides/functions
