# Research System Integration Map
## All Current Uses & Backward Compatibility Plan

---

## Current Integration Points

### 1. **CustomersPage → Research** (Line 119)
**When:** Customer has a vehicle request, dealer clicks "Research" button

**Navigation:**
```javascript
navigate(`/research?query=2020-2024 F-150 under $30,000 black`);
```

**URL Params:**
- `query` - Natural language query built from customer request fields

**User Flow:**
1. Customer tells dealer "I want a 2020-2024 F-150 under $30k, black"
2. Dealer enters this in customer record as vehicle request
3. Dealer clicks "Research" button on customer card
4. Research page opens with General Search pre-populated
5. Dealer can immediately search for matching vehicles

**MUST PRESERVE:** Ability to pass `query` param and have it populate search

---

### 2. **InventoryPage → Research (Full)** (Line 681)
**When:** Dealer viewing vehicle details, clicks "View Full Research"

**Navigation:**
```javascript
window.location.href = `/research?vin=1FTFW1E85LFA12345&year=2020&make=Ford&model=F-150&miles=60000&autorun=true`;
```

**URL Params:**
- `vin` - Vehicle VIN
- `year`, `make`, `model`, `miles` - Vehicle details
- `autorun=true` - Auto-execute search on page load

**User Flow:**
1. Dealer viewing vehicle in inventory
2. Clicks "Get Market Value" → sees quick modal with values
3. Clicks "View Full Research" → goes to Research page
4. Research page auto-loads with VIN search pre-populated
5. Search executes automatically (autorun=true)
6. Shows full market data, comparables, etc.

**MUST PRESERVE:**
- Ability to pass `vin` param
- Ability to pass structured params (year/make/model/miles)
- Auto-run functionality via `autorun=true`

---

### 3. **InventoryPage → Direct API Call** (Line 648)
**When:** Dealer clicks "Get Market Value" on inventory vehicle

**Direct Call:**
```javascript
const { data } = await supabase.functions.invoke('vehicle-research', {
  body: {
    vin: vehicle.vin || null,
    year: vehicle.year,
    make: vehicle.make,
    model: vehicle.model,
    trim: vehicle.trim || null,
    miles: vehicle.miles || 60000,
    condition: 'Good',
    zip: dealer?.zip || '84065'
  }
});
```

**User Flow:**
1. Dealer viewing vehicle in inventory
2. Clicks "Get Market Value"
3. Modal shows loading spinner
4. `vehicle-research` Edge Function returns:
   - Trade-in value
   - Retail value
   - Wholesale value
   - Market stats
5. Modal displays values inline
6. Option to "View Full Research" (goes to #2 above)

**MUST PRESERVE:**
- `vehicle-research` Edge Function unchanged
- Still returns same data structure
- InventoryPage modal still works

---

### 4. **Direct Navigation** (Sidebar, Header Button)
**When:** Dealer clicks "Research" in sidebar/menu

**Navigation:**
```javascript
navigate('/research');
```

**User Flow:**
1. Dealer clicks "Research" in sidebar
2. Research page loads blank
3. Dealer can search for anything

**MUST PRESERVE:**
- Clean slate when no params

---

## Current ResearchPage URL Parameter Support

### Supported URL Params:
```javascript
const urlQuery = searchParams.get('query');          // General search query
const urlVin = searchParams.get('vin');              // VIN for VIN search
const urlYear = searchParams.get('year');            // Year
const urlMake = searchParams.get('make');            // Make
const urlModel = searchParams.get('model');          // Model
const urlMiles = searchParams.get('miles');          // Mileage
const urlYearMin = searchParams.get('year_min');     // Min year (comparables)
const urlYearMax = searchParams.get('year_max');     // Max year (comparables)
const urlMaxPrice = searchParams.get('max_price');   // Max price filter
const urlMaxMiles = searchParams.get('max_miles');   // Max miles filter
const urlAutorun = searchParams.get('autorun');      // Auto-execute search
```

### Current Behavior:
- If `query` exists → populate General Search tab
- If `vin` exists → populate VIN Search tab, auto-select VIN mode
- If `year`/`make`/`model` exist → populate YMM Search tab
- If `year_min`/`year_max`/`make`/`model` exist → populate Comparables tab
- If `autorun=true` → automatically run search on mount

---

## Edge Functions

### 1. `vehicle-research`
**Purpose:** Get values and comparables for a specific vehicle (VIN or YMM)

**Input:**
```typescript
{
  vin?: string;           // Optional VIN
  year: number;           // Required
  make: string;           // Required
  model: string;          // Required
  trim?: string;          // Optional
  miles: number;          // Required
  condition?: string;     // Optional (defaults to 'Good')
  zip?: string;           // Optional (defaults to dealer zip)
}
```

**Output:**
```typescript
{
  vehicle: {
    year, make, model, trim, vin, body_type, engine, etc.
  },
  values: {
    trade_in, retail, wholesale, mmr, confidence
  },
  market_stats: {
    avg_days_on_market, price_trend, supply_level
  },
  comparables: {
    dealer_listings: [...],
    private_listings: [...]
  }
}
```

**Used By:**
- ResearchPage (VIN/YMM search)
- InventoryPage (Get Market Value modal)

**MUST NOT BREAK:** This is called directly from multiple places

---

### 2. `find-vehicles`
**Purpose:** Search for vehicles matching criteria (dealer + private party)

**Input:**
```typescript
{
  year_min?: number;
  year_max?: number;
  make: string;           // Required
  model?: string;
  trim?: string;
  max_price?: number;
  max_miles?: number;
  color?: string;
  zip_code?: string;      // Defaults to '84065'
  radius_miles?: number;  // Defaults to 250
}
```

**Output:**
```typescript
{
  search_params: { ... },
  market_summary: {
    avg_price, median_price, price_range, total_available, avg_days_on_market
  },
  dealer_listings: [
    { id, vin, year, make, model, trim, price, miles, location, dealer_name, url, days_listed, deal_score, savings }
  ],
  private_listings: [
    { title, year, make, model, price, miles, location, url, source, estimated_deal_score }
  ],
  total_found: number
}
```

**Used By:**
- ResearchPage (General Query, Comparables)
- `vehicle-research` Edge Function (calls this for comparables)

**MUST NOT BREAK:** This is the core search engine

---

## Backward Compatibility Requirements

### Critical Rules:
1. ✅ **All URL params must continue to work**
   - `query` → populate search bar
   - `vin` → populate search bar, trigger VIN search
   - `year`/`make`/`model` → populate search bar as "2020 Ford F-150"
   - `autorun=true` → auto-execute search

2. ✅ **Edge Functions unchanged**
   - `vehicle-research` keeps same input/output
   - `find-vehicles` keeps same input/output
   - Add NEW Edge Function for AI features (don't modify existing)

3. ✅ **InventoryPage modal still works**
   - Direct API call to `vehicle-research` unchanged
   - Modal displays same value data
   - "View Full Research" link still navigates with params

4. ✅ **CustomersPage "Research" button works**
   - Natural language query param still supported
   - Populates new unified search bar

---

## Enhanced Architecture (Backward Compatible)

### Old Flow (PRESERVED):
```
CustomersPage → /research?query=...
  ↓
ResearchPage loads
  ↓
Detects 'query' param
  ↓
Populates General Search tab
  ↓
User clicks Search
  ↓
Calls find-vehicles Edge Function
  ↓
Shows results
```

### New Flow (ENHANCED):
```
CustomersPage → /research?query=...
  ↓
ResearchPage loads with UNIFIED SEARCH BAR
  ↓
Detects 'query' param → Populates unified search bar
  ↓
AI parses query → Understands intent
  ↓
Calls find-vehicles Edge Function (same as before)
  ↓
AI analyzes results → Adds profit predictions, deal scores
  ↓
Shows enhanced results (with AI insights)
```

**Key Difference:**
- Same data sources (find-vehicles, vehicle-research)
- Same URL params supported
- NEW: AI layer for parsing intent + analyzing results
- NEW: Unified search UI (no tabs)
- NEW: Profit predictions, recommendations

---

## Implementation Strategy

### Phase 1: Add AI Layer (Non-Breaking)
**Create NEW Edge Function:** `intelligent-vehicle-search`

**Purpose:** Wrapper around existing functions with AI enhancements

**Flow:**
```
ResearchPage → intelligent-vehicle-search
  ↓
AI parses search intent (Opus 4.6)
  ↓
Determines search type: VIN / YMM / General
  ↓
Calls appropriate existing function:
  - VIN/YMM → vehicle-research
  - General → find-vehicles
  ↓
Gets results from existing functions
  ↓
AI analyzes results (profit prediction, deal scoring)
  ↓
Returns enhanced results
```

**Advantages:**
- ✅ Doesn't modify existing Edge Functions
- ✅ Existing direct API calls still work
- ✅ Can toggle AI on/off per dealer (Pro vs Starter)
- ✅ Fallback to old functions if AI fails

### Phase 2: Unified UI (Backward Compatible)
**New ResearchPage Design:**

```jsx
function ResearchPage() {
  const [searchParams] = useSearchParams();
  const [searchQuery, setSearchQuery] = useState('');

  // ✅ BACKWARD COMPATIBLE: Parse URL params
  useEffect(() => {
    const query = searchParams.get('query');
    const vin = searchParams.get('vin');
    const year = searchParams.get('year');
    const make = searchParams.get('make');
    const model = searchParams.get('model');
    const autorun = searchParams.get('autorun');

    // Populate unified search bar from URL params
    if (query) {
      setSearchQuery(query);
    } else if (vin) {
      setSearchQuery(vin);
    } else if (year && make && model) {
      setSearchQuery(`${year} ${make} ${model}`);
    }

    // Auto-run if specified
    if (autorun === 'true' && searchQuery) {
      handleSearch();
    }
  }, [searchParams]);

  const handleSearch = async () => {
    // Call intelligent-vehicle-search (or fallback to old functions)
    const { data } = await supabase.functions.invoke('intelligent-vehicle-search', {
      body: {
        query: searchQuery,
        dealer_id: dealer.id,
        // AI will parse this and route to correct function
      }
    });

    // Display enhanced results
    setResults(data);
  };

  return (
    <div>
      <input
        value={searchQuery}
        onChange={(e) => setSearchQuery(e.target.value)}
        placeholder="Search: VIN, 2020 F-150, or 'good BHPH trucks'"
      />
      <button onClick={handleSearch}>Search</button>

      {/* Enhanced results display */}
      <ResultsDisplay results={results} />
    </div>
  );
}
```

**Key Points:**
- ✅ Single search bar (simpler UI)
- ✅ Still reads all URL params
- ✅ Still supports autorun
- ✅ Backward compatible with all navigation

### Phase 3: Enhanced Results Display
**Show same data + AI insights:**

```jsx
function ResultsDisplay({ results }) {
  return (
    <div>
      {/* Original data still available */}
      <div>Market Summary: {results.market_summary}</div>
      <div>Dealer Listings: {results.dealer_listings.length}</div>
      <div>Private Listings: {results.private_listings.length}</div>

      {/* NEW: AI Insights */}
      {results.ai_insights && (
        <div>
          <h3>Deal Intelligence</h3>
          {results.dealer_listings.map(vehicle => (
            <VehicleCard
              vehicle={vehicle}
              aiScore={vehicle.ai_recommendation}  // NEW
              profitPrediction={vehicle.profit}    // NEW
            />
          ))}
        </div>
      )}
    </div>
  );
}
```

---

## Gradual Rollout Plan

### Week 1-2: Build AI Layer
- Create `intelligent-vehicle-search` Edge Function
- Test with sample queries
- Ensure it calls existing functions correctly
- Add profit prediction logic

### Week 3: A/B Test UI
- Deploy new unified search UI
- Keep old tabbed UI as fallback (toggle via feature flag)
- 50% of users see new UI, 50% see old
- Measure: confusion, search success rate, satisfaction

### Week 4: Feature Gating
- Starter Plan: Old UI, no AI (or basic AI)
- Pro Plan: New UI, AI insights
- Premium Plan: New UI, AI insights + deal alerts

### Week 5: Full Rollout
- If A/B test successful, deploy new UI to 100%
- Remove old tabbed UI code
- Monitor for issues

### Week 6+: Advanced Features
- Deal alerts
- Market intelligence dashboard
- Predictive deal finder

---

## Testing Checklist

### ✅ URL Parameter Compatibility
- [ ] `/research?query=2020 F-150` → Populates search bar
- [ ] `/research?vin=1FTFW1E85LFA12345&autorun=true` → Searches VIN automatically
- [ ] `/research?year=2020&make=Ford&model=F-150` → Populates as "2020 Ford F-150"
- [ ] `/research?year_min=2018&year_max=2022&make=Ford&model=F-150&max_price=30000` → Searches with filters

### ✅ Integration Points
- [ ] CustomersPage "Research" button → Loads with query param
- [ ] InventoryPage "View Full Research" → Loads with VIN + autorun
- [ ] InventoryPage "Get Market Value" → Modal still works (direct API call)
- [ ] Sidebar "Research" → Loads blank search

### ✅ Edge Functions
- [ ] `vehicle-research` still works for direct API calls
- [ ] `find-vehicles` still works for comparables search
- [ ] NEW `intelligent-vehicle-search` adds AI layer without breaking old functions

### ✅ Data Integrity
- [ ] Same market data displayed (MarketCheck, SerpAPI, Apify)
- [ ] Same deal scoring for non-AI users
- [ ] NEW AI insights additive, not replacing existing data

---

## Rollback Plan

### If AI Enhancement Causes Issues:

**Option 1: Feature Flag Disable**
```javascript
const USE_AI_SEARCH = dealer.subscription_tier === 'Premium' || dealer.subscription_tier === 'Pro';

if (USE_AI_SEARCH) {
  // Call intelligent-vehicle-search
} else {
  // Fall back to old functions (vehicle-research, find-vehicles)
}
```

**Option 2: Full Rollback**
- Keep old ResearchPage.jsx as `ResearchPageClassic.jsx`
- Route to old version if issues detected
- No data loss, just UI change

**Option 3: Progressive Enhancement**
- Show old results immediately
- AI insights load asynchronously in background
- If AI fails, user still sees original data

---

## Summary: Preservation Guarantee

### What Will NOT Change:
1. ✅ `vehicle-research` Edge Function (InventoryPage depends on it)
2. ✅ `find-vehicles` Edge Function (core search engine)
3. ✅ URL parameter support (other pages navigate with params)
4. ✅ Data sources (MarketCheck, SerpAPI, Apify, NHTSA)
5. ✅ InventoryPage "Get Market Value" modal
6. ✅ CustomersPage "Research" button navigation

### What WILL Be Enhanced:
1. ✨ Unified search UI (simpler, but reads same URL params)
2. ✨ AI intent parsing (understands "good BHPH trucks")
3. ✨ Profit predictions (new data, doesn't replace existing)
4. ✨ Deal recommendations (additive insights)
5. ✨ Market intelligence (new feature, doesn't break old)

### Migration Path:
```
Old: ResearchPage (4 tabs) → vehicle-research / find-vehicles → Results
New: ResearchPage (1 search) → intelligent-vehicle-search → vehicle-research / find-vehicles → AI Analysis → Enhanced Results
```

**Key:** New system WRAPS old system, doesn't replace it.

If AI fails → Falls back to old results
If user is Starter tier → Uses old flow
If URL params provided → Still works exactly as before

**Zero Breaking Changes. Only Additions.**
