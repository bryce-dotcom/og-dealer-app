# Current API Usage Audit
## What APIs We're Using & Cost Analysis

---

## APIs Currently Integrated

### 1. **NHTSA API** (VIN Decoding)
**Status:** ✅ Active
**Cost:** FREE (Government API)
**Usage:** VIN decode in `vehicle-research` Edge Function
**Endpoint:** `https://vpic.nhtsa.dot.gov/api/vehicles/decodevin/{vin}`
**Rate Limits:** Generous (no known issues)
**Secret Name:** None (public API)

**What it does:**
- Decodes VIN to Year, Make, Model, Trim
- Returns body type, engine, drivetrain, fuel type
- Used in VIN search mode

**Keep or upgrade?** ✅ KEEP (free, works great)

---

### 2. **MarketCheck API**
**Status:** ✅ Active
**Secret Name:** `MARKETCHECK_API_KEY`
**Used in:**
- `vehicle-research` (price predictions)
- `find-vehicles` (dealer listings, market stats)

**What it does:**
- Price predictions (trade-in, retail, wholesale, MMR)
- Dealer inventory search (active listings)
- Market statistics (avg days on market, price trends)
- Historical pricing data (if on higher tier)

**Current Plan:** ❓ UNKNOWN - Need to check dashboard
**Likely:** Basic/Starter tier ($99-149/mo)
**Evidence of rate limiting:** Yes, code mentions rate limits in find-vehicles:443

```typescript
} else if (predRes.status === 429) {
  log(`Rate limited, stopping predictions`);
  break;
}
```

**Current behavior:**
- Limits predictions to 5 samples per search
- Caches predictions for 24 hours
- Falls back to median price if prediction unavailable

**Questions to answer:**
1. What MarketCheck plan are we on? (Basic/Standard/Premium/Enterprise)
2. What's the monthly API call limit?
3. What's the prediction call limit?
4. Do we have historical pricing data access?
5. Current monthly cost?

**Recommendation if upgrading:**
- **If on Basic ($99):** Upgrade to Standard ($149) or Premium ($299)
- **Why:** Current code rate-limits predictions (line 408: "just get a few samples")
- **With AI enhancement:** We'll need 10-50x more prediction calls
- **Enterprise tier ($299):**
  - Unlimited price predictions ✅
  - Historical pricing API ✅
  - Market trends API ✅
  - Dealer inventory feed ✅

---

### 3. **SerpAPI** (Google Search Scraping)
**Status:** ✅ Active
**Secret Name:** `SERP_API_KEY`
**Used in:** `find-vehicles` (private party listings)

**What it does:**
- Scrapes Craigslist listings via Google Search
- Scrapes Facebook Marketplace via Google Search
- Scrapes OfferUp via Google Search
- Scrapes CarGurus via Google Search

**Current Plan:** ❓ UNKNOWN - Need to check dashboard
**Likely:** Developer ($50/mo) or Scale ($100/mo)

**Searches per month estimate:**
- 100 dealers × 10 searches/month = 1,000 searches
- 4 sources per search (CL, FB, OfferUp, CarGurus) = 4,000 API calls/mo

**SerpAPI Pricing Tiers:**
| Plan | Cost | Credits/Month | Notes |
|------|------|---------------|-------|
| Free | $0 | 100 searches | Too low |
| Developer | $50 | 5,000 searches | ✅ Probably this |
| Scale | $100 | 15,000 searches | Better for growth |
| Business | $250 | 50,000 searches | Overkill |

**Questions to answer:**
1. What SerpAPI plan are we on?
2. How many searches/month are we using?
3. Are we hitting limits?

**Recommendation:**
- **Stay on current tier** (likely Developer $50 or Scale $100)
- Works well enough via Google Search scraping
- Apify handles FB Marketplace better anyway
- No urgent need to upgrade

---

### 4. **Apify** (Facebook Marketplace Scraper)
**Status:** ✅ Active
**Secret Name:** `APIFY_API_KEY`
**Used in:** `find-vehicles` (better FB Marketplace results)

**What it does:**
- Scrapes FB Marketplace with actual structured data
- Gets price, miles, location, photos, seller info
- Better than SerpAPI for FB (returns actual listing objects)

**Current Plan:** ❓ UNKNOWN - Need to check dashboard
**Likely:** Pay-per-use ($0.10-0.50 per run)

**Actor Used:** `datavoyantlab~facebook-marketplace-scraper`

**Cost estimate:**
- 1,000 searches/month × $0.25/search = $250/mo
- OR
- Could be on monthly plan ($49-249/mo)

**Apify Pricing:**
| Plan | Cost | Platform Credits | Compute Units |
|------|------|------------------|---------------|
| Free | $0 | $5 | Limited |
| Starter | $49 | $49 + $5 = $54 | 82 CU |
| Team | $149 | $149 + $15 = $164 | 410 CU |
| Business | $499 | $499 + $50 = $549 | 1,479 CU |

**Questions to answer:**
1. Are we on monthly plan or pay-per-use?
2. How much are we spending per month?
3. How many FB searches are we running?

**Recommendation:**
- **If on pay-per-use:** Switch to Starter ($49/mo) for predictable costs
- **If usage is high:** Team plan ($149/mo)
- Very valuable for FB Marketplace (best private party source)

---

### 5. **Anthropic API** (Claude AI)
**Status:** ✅ Active (BARELY USED!)
**Secret Name:** `ANTHROPIC_API_KEY`
**Current Usage:** Only fallback in `find-vehicles` when NO results found

**Used in:**
- `find-vehicles` (lines 860-919) - fallback market guidance
- `og-arnie-chat` - AI assistant
- `scan-vin` - VIN scanning
- `analyze-form` - Form field detection
- `categorize-transaction` - Transaction categorization
- `map-form-fields` - Field mapping
- And ~10 more functions

**Current Models Used:**
- Haiku (`claude-3-haiku-20240307`) - Most functions
- Sonnet 4 (`claude-sonnet-4-20250514`) - Forms, mapping
- Opus 4.6 - Not used yet

**Current Plan:** ❓ UNKNOWN
**Likely:** Pay-as-you-go

**Current Usage Estimate:**
- Arnie queries: ~100/day × 10k tokens = 1M tokens/day
- Research fallback: Rare (only when no results)
- Form analysis: ~10/day × 50k tokens = 500k tokens/day
- **Total: ~1.5M tokens/day = 45M tokens/month**

**Current Cost Estimate:**
| Model | Usage | Input Cost | Output Cost | Monthly Cost |
|-------|-------|------------|-------------|--------------|
| Haiku 3 | 30M tokens | $0.25/M | $1.25/M | ~$10 |
| Sonnet 4 | 15M tokens | $3/M | $15/M | ~$50 |
| **Total** | 45M tokens | - | - | **~$60/mo** |

**With AI Enhancement (Proposed):**
| Usage | Tokens/Search | Searches/Day | Monthly Tokens | Monthly Cost |
|-------|---------------|--------------|----------------|--------------|
| Intent parsing | 5k | 1,000 | 150M | $38 (Haiku) |
| Deal analysis | 15k | 1,000 | 450M | $900 (Opus 4.6) |
| Market insights | 10k | 100 | 30M | $190 (Opus 4.6) |
| **Total** | - | - | 630M | **~$1,100/mo** |

**Optimization Strategy:**
- Use Haiku for intent parsing: $38/mo ✅
- Use Opus 4.6 only for deal analysis: $900/mo
- Cache aggressively (same vehicle = reuse)
- **Optimized cost: ~$400-600/mo**

**Questions to answer:**
1. Current Anthropic spending per month?
2. Are we hitting any rate limits?
3. Do we have organization tier or pay-as-you-go?

**Recommendation:**
- **Stay on pay-as-you-go** (no commitment)
- Monitor usage closely
- Set budget alerts at $500/mo, $1000/mo
- Use Haiku + caching to keep costs down
- Opus 4.6 only for Pro/Premium tier dealers

---

## Total Current API Costs (ESTIMATED)

| API | Current (Estimated) | Notes |
|-----|---------------------|-------|
| NHTSA | $0 | Free |
| MarketCheck | $99-149 | Need to verify plan |
| SerpAPI | $50-100 | Need to verify plan |
| Apify | $50-250 | Need to verify plan |
| Anthropic | $60-100 | Current light usage |
| **TOTAL** | **$259-599/mo** | Wide range due to unknowns |

---

## Total Costs WITH AI Enhancement (PROPOSED)

| API | Current | Proposed | Increase | Justification |
|-----|---------|----------|----------|---------------|
| NHTSA | $0 | $0 | $0 | Free |
| MarketCheck | $99 | $299 | +$200 | Need unlimited predictions |
| SerpAPI | $100 | $100 | $0 | Works fine as-is |
| Apify | $50 | $149 | +$99 | More FB Marketplace usage |
| Anthropic | $60 | $400-600 | +$340-540 | Heavy AI usage |
| **TOTAL** | **$309** | **$948-1,148** | **+$639-839/mo** |

**Monthly increase: ~$640-840**

---

## ROI Analysis

### Cost Increase: ~$700/mo

### Revenue Needed to Break Even:
**If feature converts 5 dealers at $297/mo:**
- New revenue: $1,485/mo
- Cost: $700/mo
- **Profit: +$785/mo** ✅

**If feature prevents 2 churns/month:**
- Saved revenue: $594/mo
- Cost: $700/mo
- **Shortfall: -$106/mo** (still worth it for retention)

**If feature enables price increase ($297 → $347):**
- 20 active dealers × $50 = $1,000/mo additional
- Cost: $700/mo
- **Profit: +$300/mo** ✅

### Conclusion:
If this feature helps you:
1. Convert 5+ new dealers/month, OR
2. Prevent 3+ churns/month, OR
3. Justify a $50/mo price increase

Then the **$700/mo API cost is profitable.**

---

## Questions I Need Answered

### MarketCheck:
1. ❓ What plan are we on? (Basic/Standard/Premium/Enterprise)
2. ❓ How many API calls/month are we currently making?
3. ❓ Have we hit rate limits?
4. ❓ Do we have historical pricing data access?
5. ❓ Current monthly invoice amount?

**How to check:**
- Log into MarketCheck dashboard
- Check billing/subscription page
- Look at usage statistics

### SerpAPI:
1. ❓ What plan are we on? (Free/Developer/Scale/Business)
2. ❓ How many searches/month are we using?
3. ❓ Have we hit limits?
4. ❓ Current monthly invoice amount?

**How to check:**
- Log into SerpAPI dashboard
- Check account usage/billing

### Apify:
1. ❓ Monthly plan or pay-per-use?
2. ❓ How much did we spend last month?
3. ❓ How many actor runs per month?

**How to check:**
- Log into Apify dashboard
- Check billing/usage

### Anthropic:
1. ❓ Current monthly spending?
2. ❓ Pay-as-you-go or organization plan?
3. ❓ Any rate limits hit?
4. ❓ Which models are we using most?

**How to check:**
- Log into Anthropic Console
- Check usage/billing page
- Look at last 30 days

---

## Recommendations

### Immediate Actions:
1. ✅ **Audit current API plans** - Log into each dashboard, get exact plans/costs
2. ✅ **Check usage stats** - How close are we to limits?
3. ✅ **Get invoices** - Last 3 months to see trends

### Before Building AI Enhancement:
1. ✅ **Set budget alerts** - Know when costs spike
2. ✅ **Implement caching** - Reduce redundant API calls
3. ✅ **Test with sample data** - Predict actual costs before rollout
4. ✅ **Feature gate by tier** - Only Pro/Premium get AI features

### Cost Optimization Strategies:
1. **Cache aggressively:**
   - Cache MarketCheck predictions for 7 days (same vehicle/miles)
   - Cache find-vehicles results for 24 hours (same search)
   - Cache AI analysis for 48 hours (same vehicle)

2. **Tier-based usage limits:**
   - Starter: No AI (uses old system)
   - Pro: 50 AI searches/month (credit-based)
   - Premium: Unlimited AI searches
   - This controls Anthropic costs

3. **Smart API usage:**
   - Only call MarketCheck prediction for top 10 results (not all 50)
   - Only use Opus 4.6 for "final analysis", use Haiku for parsing
   - Batch similar searches (same make/model)

4. **Monitor and adjust:**
   - Weekly cost review for first month
   - Adjust cache TTL based on hit rates
   - Disable expensive features if ROI isn't there

---

## Next Steps

### Step 1: Get Current State
**User action needed:**
- [ ] Check MarketCheck dashboard - what plan? What's the bill?
- [ ] Check SerpAPI dashboard - what plan? What's the bill?
- [ ] Check Apify dashboard - what plan? What's the bill?
- [ ] Check Anthropic dashboard - what's the monthly spend?

### Step 2: Calculate True Costs
Once we know current spending, we can accurately calculate:
- Actual current monthly API costs
- Projected costs with AI enhancement
- True ROI and break-even point

### Step 3: Decide on Enhancement
With real numbers, we can decide:
- Is $700/mo increase worth it?
- Should we tier-gate features more aggressively?
- Can we optimize costs further?
- What's the minimum viable AI enhancement?

---

## Alternative: Minimal AI Enhancement

If full enhancement is too expensive, consider:

### "AI Lite" Version:
**Only add AI to:**
1. Intent parsing (Haiku: ~$40/mo)
2. Deal scoring for top 5 results (not all)
3. Market insights (weekly batch job, not real-time)

**Skip for now:**
- Individual profit predictions (expensive)
- Proactive deal alerts (expensive)
- Unlimited AI usage (gate heavily)

**Cost:** ~$150/mo increase (vs $700/mo full version)
**Still valuable:** Better search, some AI insights, room to grow

---

## Summary

**What we know:**
- ✅ Using 5 APIs (NHTSA, MarketCheck, SerpAPI, Apify, Anthropic)
- ✅ Current estimated cost: $260-600/mo
- ✅ Anthropic barely used (only fallback)

**What we need:**
- ❓ Exact current plans and spending
- ❓ Usage statistics for each API
- ❓ Rate limit information

**Proposed enhancement:**
- 💰 Cost increase: ~$700/mo
- 📈 Break even: 5 new dealers/month OR prevent 3 churns
- ⚡ Feature gates: Starter (no AI), Pro (limited), Premium (unlimited)

**Decision point:**
Get current API spending data → Calculate true ROI → Decide if full or lite version makes sense.
