# Deploy Connect Email Functions to Supabase

## Quick Deploy via Supabase Dashboard (2 minutes)

### Function 1: generate-email-content

1. Go to: https://supabase.com/dashboard → Your Project → **Edge Functions**
2. Click **"New Function"** or **"Deploy new function"**
3. Name: `generate-email-content`
4. Copy the entire code from: `supabase/functions/generate-email-content/index.ts`
5. Paste into the code editor
6. Click **Deploy**

### Function 2: send-email-campaign

1. Still in **Edge Functions** tab
2. Click **"New Function"** or **"Deploy new function"**
3. Name: `send-email-campaign`
4. Copy the entire code from: `supabase/functions/send-email-campaign/index.ts`
5. Paste into the code editor
6. Click **Deploy**

## Set Environment Variables

In Supabase Dashboard → **Edge Functions** → **Secrets**:

1. Add `ANTHROPIC_API_KEY` (if not already set)
   - This should already be set from OG Arnie

2. Add `RESEND_API_KEY`
   - Get from: https://resend.com/api-keys
   - Free tier: 3,000 emails/month
   - Click "Create API Key" → Copy → Paste into Supabase

## Test It

1. Go to your app → **Connect** (💬)
2. Click **✨ AI Generator**
3. Choose a campaign goal
4. Watch AI write your email!

---

**Need the full file contents?**

### generate-email-content/index.ts
Location: `C:\OGDealer\supabase\functions\generate-email-content\index.ts`

### send-email-campaign/index.ts
Location: `C:\OGDealer\supabase\functions\send-email-campaign\index.ts`

Just copy/paste these files into the Supabase dashboard as shown above!
