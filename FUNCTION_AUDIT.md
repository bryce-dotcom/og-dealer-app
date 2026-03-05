# Edge Functions Audit

## ✅ ACTIVE - Being Called in Frontend (28 functions)

### Research & Vehicles
- `find-vehicles` - ResearchPage: Search for vehicles
- `vehicle-research` - ResearchPage, InventoryPage: Get vehicle details
- `analyze-vehicle-opportunity` - ResearchPage: Analyze specific vehicle
- `generate-smart-recommendations` - ResearchPage: Show proven winners
- `generate-opportunity-recommendations` - ResearchPage: Show gap analysis
- `run-my-searches` - DealFinderPage: Execute saved searches
- `scan-vin` - InventoryPage: VIN scanning
- `generate-listing` - InventoryPage: Create listings

### Accounting & Banking
- `plaid-link-token` - BooksPage: Connect bank accounts
- `plaid-sync` - BooksPage: Sync transactions
- `categorize-transaction` - BooksPage: Auto-categorize
- `parse-receipt` - InventoryPage: Parse expense receipts

### Forms & Compliance
- `discover-state-forms` - DevConsolePage: Find state forms
- `discover-state-fees` - DealerOnboarding: Get state fees
- `generate-form-template` - FormTemplateGenerator: Generate forms
- `map-form-fields` - DevConsolePage: Map form fields
- `promote-form` - DevConsolePage: Promote forms
- `fill-deal-documents` - DealsPage: Fill deal documents

### Marketing & Communication
- `generate-email-content` - EmailMarketingPage: Generate emails
- `send-email-campaign` - EmailMarketingPage: Send campaigns
- `invite-employee` - EmployeesPage, TeamPage: Invite team members

### Payments
- `stripe-create-checkout` - BillingPage: Create checkout session
- `stripe-purchase-credits` - BillingPage: Purchase credits

### AI & Support
- `og-arnie-chat` - AIAssistant: Chat assistant

### Dev Tools
- `fetch-sentry-errors` - AdminDevConsole: Get errors
- `ai-code-fix` - AdminDevConsole: Fix code
- `deploy-code` - AdminDevConsole: Deploy updates
- `send-beta-invite` - DevConsolePage: Send invites

---

## ❌ DEPLOYED BUT UNUSED (19 functions)

### Likely Duplicates/Superseded
- `discover-state-forms-v2` ← Probably replaced discover-state-forms (but not used!)
- `parse-vin-image` ← Possibly replaced by scan-vin

### Form Functions (Possibly Unused)
- `analyze-form`
- `analyze-form-pdf`
- `extract-pdf-fields`
- `verify-form-mapping`
- `update-state-form`
- `get-state-progress`
- `check-form-updates`
- `discover-state-rules`
- `state-rules`
- `state-forms`
- `form-versions`

### Other Unused
- `generate-deal-docs` ← Replaced by fill-deal-documents?
- `create-compliance-tasks`
- `run-saved-searches` ← Replaced by run-my-searches?
- `calculate-dealer-preferences` ← Background job?
- `calculate-seasonal-patterns` ← Background job?
- `send-onboarding-sms`
- `vehicle-value` ← Replaced by vehicle-research?
- `stripe-webhook` ← Backend webhook (not called from frontend)

---

## 🤔 UNCERTAIN - May Be Background Jobs

These might be called by cron jobs or webhooks (not frontend):
- `run-saved-searches` - Might run on schedule
- `calculate-dealer-preferences` - Likely nightly job
- `calculate-seasonal-patterns` - Likely nightly job
- `stripe-webhook` - Called by Stripe, not frontend

---

## 📊 Summary

- **Total Deployed**: 47 functions
- **Actively Used**: 28 functions (60%)
- **Unused/Uncertain**: 19 functions (40%)

## 💡 Recommendation

1. **Keep all 28 active functions** ✅
2. **Verify background jobs** - Check if calculate-* and run-saved-searches are scheduled
3. **Delete unused form functions** - Many look like legacy/abandoned features
4. **Consolidate duplicates** - discover-state-forms-v2, etc.

Would you like me to:
- Delete the unused functions?
- Check for cron jobs/scheduled functions?
- Consolidate duplicates?
