# Beta Launch Checklist - OG DiX Motor Club

## 🚀 Production Deployment Checklist

### 1. Vercel Configuration
- [ ] **Environment Variables Set** (Vercel Dashboard → Project → Settings → Environment Variables)
  - `VITE_SUPABASE_URL` = `https://rlzudfinlxonpbwacxpt.supabase.co`
  - `VITE_SUPABASE_ANON_KEY` = `eyJhbGciOiJIUzI1NiIsInR5cCI6IkpXVCJ9...`
  - `VITE_GEMINI_API_KEY` = `AIzaSyATKJQGun8RAvgWVKm-msw2x_Od4DkXfoo`
- [ ] **Redeploy** after setting env vars (Vercel auto-rebuilds)
- [ ] **Custom Domain** (optional): Add your domain in Vercel → Domains

---

### 2. Supabase Configuration

#### A. Authentication Settings
Go to: [Supabase Dashboard](https://supabase.com/dashboard/project/rlzudfinlxonpbwacxpt) → Authentication → URL Configuration

- [ ] **Site URL**: `https://app.ogdix.com`
- [ ] **Redirect URLs**: Add these allowed redirect URLs:
  - `https://app.ogdix.com/**`
  - `https://app.ogdix.com/login`
  - `https://app.ogdix.com/dashboard`
  - `http://localhost:5173/*` (for local development)

#### B. Email Templates (Optional but Recommended)
Go to: Authentication → Email Templates

- [ ] **Confirm Signup**: Customize confirmation email with your branding
- [ ] **Reset Password**: Customize password reset email
- [ ] **Change Email**: Customize change email template

#### C. Email Settings
Go to: Authentication → Providers → Email

- [ ] **Enable Email Provider** (should already be enabled)
- [ ] **Confirm Email**: Decide if users must confirm email before login
  - For beta: Consider **disabling** email confirmation for faster onboarding
  - For production: **Enable** email confirmation for security

---

### 3. Supabase Edge Functions

- [ ] **Verify Functions are Deployed**
  - `generate-email-content` (for Connect AI email generator)
  - `send-email-campaign` (for sending campaigns)
  - All other edge functions

- [ ] **Set Function Secrets** (if not already set)
  - `ANTHROPIC_API_KEY` (for AI features)
  - `RESEND_API_KEY` (for email sending - [get from Resend](https://resend.com/api-keys))

Go to: Edge Functions → Secrets

---

### 4. Database & Security

- [ ] **Row Level Security (RLS) Policies Active**
  - Each dealer can only access their own data
  - Test with 2+ dealer accounts to verify isolation

- [ ] **Database Migrations Applied**
  - All tables created (dealer_settings, customers, deals, inventory, etc.)
  - Email marketing tables (email_campaigns, email_templates, etc.)
  - Compliance tables (compliance_rules, state_forms, etc.)

- [ ] **Sample Data** (optional)
  - Pre-populate with sample customers/vehicles for beta testers
  - Or let them start fresh

---

### 5. Beta Tester Onboarding

#### Option A: Self-Service Signup (Recommended)
1. Share Vercel URL with OG DiX Motor Club
2. They click "Sign up free" on login page
3. Enter their dealership name, email, password
4. Start using the app immediately (14-day trial)

**Landing page to share:**
```
🚀 Welcome to OG Dealer App Beta!

Your dealership management platform is ready.

👉 Sign up here: https://app.ogdix.com

What you get:
✅ Customer & inventory management
✅ AI-powered deal documents
✅ BHPH payment tracking
✅ Email marketing (Connect)
✅ OG Arnie AI assistant
✅ 14-day free trial

Questions? Contact: your-email@domain.com
```

#### Option B: Pre-Created Accounts
1. Manually create accounts in Supabase Auth
2. Send login credentials to beta testers
3. Force password reset on first login

#### Option C: Invitation Codes
1. Build invitation code system (requires dev work)
2. Generate unique codes for each beta tester
3. Only allow signup with valid code

**→ Recommended: Option A (Self-Service)** - fastest to launch

---

### 6. Production Testing

Test these critical flows on production URL:

- [ ] **Authentication**
  - Signup new account
  - Login with credentials
  - Password reset flow
  - Logout

- [ ] **Dashboard**
  - Dashboard loads without errors
  - All widgets display data
  - No console errors

- [ ] **Core Features**
  - Add customer
  - Create deal
  - Add inventory vehicle
  - Upload documents
  - Generate deal documents (test AI)

- [ ] **Connect (Email Marketing)**
  - Create campaign
  - Use AI generator
  - Create template
  - Create audience segment
  - Create automation

- [ ] **OG Arnie**
  - Open chat
  - Send message
  - Get AI response

- [ ] **Mobile Responsive**
  - Test on phone/tablet
  - All pages accessible
  - Navigation works

---

### 7. Monitoring & Support

- [ ] **Error Tracking**: Sentry is already configured
  - Monitor for errors at: [Your Sentry Dashboard]
  - Set up alerts for critical errors

- [ ] **Usage Analytics** (optional)
  - Add Google Analytics or Plausible
  - Track user engagement

- [ ] **Support Channel**
  - Create support email or Slack channel
  - Document common issues & solutions

- [ ] **Feedback Collection**
  - Add feedback form or link
  - Google Forms, Typeform, or in-app widget

---

### 8. Documentation for Beta Testers

Create simple getting started guide:

```markdown
# Getting Started with OG Dealer App

## 1. Create Your Account
- Go to [https://app.ogdix.com](https://app.ogdix.com)
- Click "Sign up free"
- Enter your dealership name, email, and password

## 2. Set Up Your Dealership
- Add your dealership info in Settings
- Upload your logo (optional)
- Configure your state/location

## 3. Add Your First Customer
- Go to Customers → + New Customer
- Fill in customer details
- Save customer

## 4. Try These Features
- **OG Arnie**: Chat with AI assistant (bottom right)
- **Connect**: Send AI-generated emails to customers
- **Deals**: Create and track vehicle deals
- **Documents**: Generate deal paperwork with AI

## Need Help?
- Email: support@your-domain.com
- Video tutorials: [link to tutorial videos]
```

---

## 🎯 Quick Launch Steps (15 minutes)

If you want to launch ASAP:

1. **Vercel**: Set 3 environment variables → Redeploy
2. **Supabase**: Add your Vercel URL to redirect URLs
3. **Test**: Visit production URL, create test account, verify it works
4. **Share**: Send production URL to OG DiX Motor Club
5. **Monitor**: Watch for signups and errors

---

## 📧 Beta Tester Email Template

```
Subject: You're Invited to Beta Test OG Dealer App! 🚀

Hi OG DiX Motor Club,

Your exclusive access to OG Dealer App is ready!

🎁 What's Included:
- Complete dealership management system
- AI-powered document generation
- Customer & inventory tracking
- Email marketing platform
- BHPH payment management
- 14-day free trial (no credit card required)

🔗 Get Started:
1. Go to: https://app.ogdix.com
2. Click "Sign up free"
3. Enter your dealership info
4. Start managing your dealership!

💬 Feedback & Support:
We want your honest feedback! Found a bug? Have ideas?
Email us: your-email@domain.com

Let's revolutionize dealership management together!

Best,
[Your Name]
```

---

## ✅ Ready to Launch Checklist

- [ ] All environment variables set in Vercel
- [ ] Supabase URLs configured
- [ ] Production URL tested end-to-end
- [ ] Email templates customized
- [ ] Beta tester invitation email ready
- [ ] Support channel set up
- [ ] Monitoring enabled

**🚀 Once all checked → Send invitations to OG DiX Motor Club!**
