# Inventory Marketplace Syndication

## Overview

Automatically push dealer inventory to popular listing platforms (Facebook Marketplace, KSL Classifieds, AutoTrader) to maximize vehicle exposure and sales.

---

## 🎯 Target Platforms

### 1. Facebook Marketplace (Meta Automotive Inventory)
**Best for:** Free listings, massive reach, local buyers

**Integration Method:** Meta Automotive Inventory API
- **API:** Facebook Marketing API
- **Format:** Vehicle catalog feed (XML/CSV)
- **Requirements:**
  - Facebook Business Page
  - Business Manager account
  - Automotive Inventory feature enabled
  - Access token with `catalog_management` permission

**Pricing:** Free (organic listings)

**Update Frequency:** Real-time or hourly sync

---

### 2. KSL Classifieds (Utah-focused)
**Best for:** Utah dealers, local market dominance

**Integration Method:** KSL Dealer API or Bulk Upload
- **API:** KSL Dealer Portal API (if available)
- **Format:** CSV bulk upload via FTP
- **Requirements:**
  - KSL Dealer account
  - Dealer credentials
  - May require manual approval

**Pricing:** ~$5-10 per listing/month

**Update Frequency:** Daily sync recommended

---

### 3. AutoTrader
**Best for:** National reach, serious buyers

**Integration Method:** AutoTrader Dealer Center
- **API:** AutoTrader Feed API
- **Format:** ADF (Auto-Lead Data Format) XML
- **Requirements:**
  - AutoTrader dealer subscription
  - FTP credentials
  - Dealer ID

**Pricing:** Subscription-based (~$300-600/month)

**Update Frequency:** Daily sync

---

## 🏗️ Architecture

### Database Schema

**New Table: `marketplace_listings`**
```sql
CREATE TABLE marketplace_listings (
  id uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  dealer_id integer NOT NULL REFERENCES dealer_settings(id),
  inventory_id text NOT NULL REFERENCES inventory(id),
  marketplace text NOT NULL, -- 'facebook', 'ksl', 'autotrader'
  listing_id text, -- External marketplace listing ID
  status text DEFAULT 'pending', -- 'pending', 'active', 'sold', 'removed', 'error'
  last_synced_at timestamptz,
  error_message text,
  created_at timestamptz DEFAULT now(),
  UNIQUE(dealer_id, inventory_id, marketplace)
);

CREATE INDEX idx_marketplace_listings_dealer ON marketplace_listings(dealer_id);
CREATE INDEX idx_marketplace_listings_inventory ON marketplace_listings(inventory_id);
CREATE INDEX idx_marketplace_listings_status ON marketplace_listings(status);
```

**New Table: `marketplace_settings`**
```sql
CREATE TABLE marketplace_settings (
  id uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  dealer_id integer NOT NULL REFERENCES dealer_settings(id),
  marketplace text NOT NULL, -- 'facebook', 'ksl', 'autotrader'
  enabled boolean DEFAULT false,
  credentials jsonb, -- Encrypted API keys, tokens
  sync_frequency text DEFAULT 'hourly', -- 'realtime', 'hourly', 'daily'
  auto_sync boolean DEFAULT true,
  last_sync_at timestamptz,
  created_at timestamptz DEFAULT now(),
  updated_at timestamptz DEFAULT now(),
  UNIQUE(dealer_id, marketplace)
);
```

---

## 🔧 Implementation

### Frontend Components

**1. Marketplace Settings Page**
```jsx
// C:\OGDealer\src\pages\MarketplaceSettingsPage.jsx

Features:
- Enable/disable each marketplace
- Configure API credentials
- Set sync frequency
- View sync status and errors
- Manual sync trigger
- Listing statistics (active, pending, errors)
```

**2. Inventory Page Integration**
```jsx
// Add to InventoryPage.jsx

Features:
- "Push to Marketplaces" bulk action
- Marketplace status badges on each vehicle
- Quick sync button
- Error indicators
```

**3. Marketplace Status Widget**
```jsx
// New component: MarketplaceStatusBadge.jsx

Shows listing status per marketplace:
- ✓ Active on Facebook
- ⏳ Pending on KSL
- ✗ Error on AutoTrader
```

---

### Backend Edge Functions

**1. `sync-to-facebook`**
```typescript
// Syncs inventory to Facebook Marketplace

Input: { dealer_id, inventory_ids? }
Process:
1. Get dealer Facebook credentials
2. Transform inventory to Facebook catalog format
3. Upload via Meta Catalog API
4. Update marketplace_listings table
5. Return sync results

API: Meta Marketing API
Endpoint: POST /catalog/{catalog_id}/items
```

**2. `sync-to-ksl`**
```typescript
// Syncs inventory to KSL Classifieds

Input: { dealer_id, inventory_ids? }
Process:
1. Get dealer KSL credentials
2. Transform to KSL CSV format
3. Upload via FTP or API
4. Update marketplace_listings table
5. Return sync results

Method: CSV upload or API (TBD based on KSL)
```

**3. `sync-to-autotrader`**
```typescript
// Syncs inventory to AutoTrader

Input: { dealer_id, inventory_ids? }
Process:
1. Get dealer AutoTrader credentials
2. Generate ADF XML feed
3. Upload to AutoTrader FTP
4. Update marketplace_listings table
5. Return sync results

Format: ADF XML
Method: FTP upload
```

**4. `sync-all-marketplaces`**
```typescript
// Master sync function - syncs to all enabled marketplaces

Input: { dealer_id }
Process:
1. Get enabled marketplaces for dealer
2. Call individual sync functions
3. Aggregate results
4. Send notification if errors

Scheduled: Runs automatically based on sync_frequency
```

---

## 📋 Data Transformation

### Inventory → Facebook Catalog Format

```javascript
{
  "id": "stock_2024_001", // Stock number
  "title": "2023 Honda Accord EX",
  "description": "Clean Carfax, one owner...",
  "availability": "in stock", // or "out of stock"
  "condition": "used",
  "price": "22995 USD",
  "link": "https://ogdealer.com/inventory/2024-001",
  "image_link": "https://photos.url/main.jpg",
  "additional_image_link": ["url2", "url3"],
  "brand": "Honda",
  "year": 2023,
  "make": "Honda",
  "model": "Accord",
  "trim": "EX",
  "body_style": "Sedan",
  "vin": "1HGCV1F36NA123456",
  "mileage": { "value": 15000, "unit": "mi" },
  "exterior_color": "Blue",
  "interior_color": "Black",
  "transmission": "Automatic",
  "drivetrain": "FWD",
  "fuel_type": "Gasoline",
  "dealer_id": "dealer_123",
  "dealer_name": "Your Dealership",
  "dealer_phone": "801-555-1234",
  "dealer_address": {
    "street": "123 Main St",
    "city": "Provo",
    "state": "UT",
    "zip": "84601"
  }
}
```

### Inventory → KSL CSV Format

```csv
StockNumber,VIN,Year,Make,Model,Trim,Mileage,Price,Color,Description,PhotoURL1,PhotoURL2,PhotoURL3,DealerName,DealerPhone,DealerAddress
2024-001,1HGCV1F36NA123456,2023,Honda,Accord,EX,15000,22995,Blue,Clean Carfax...,https://photo1,https://photo2,https://photo3,Your Dealership,801-555-1234,"123 Main St, Provo UT 84601"
```

### Inventory → AutoTrader ADF XML

```xml
<?xml version="1.0" encoding="UTF-8"?>
<adf>
  <vehicle>
    <id sequence="1">stock_2024_001</id>
    <year>2023</year>
    <make>Honda</make>
    <model>Accord</model>
    <trim>EX</trim>
    <vin>1HGCV1F36NA123456</vin>
    <stock>2024-001</stock>
    <odometer units="miles">15000</odometer>
    <price type="asking">22995</price>
    <exteriorcolor>Blue</exteriorcolor>
    <interiorcolor>Black</interiorcolor>
    <transmission>Automatic</transmission>
    <images>
      <image sequence="1">https://photo1.jpg</image>
      <image sequence="2">https://photo2.jpg</image>
    </images>
    <comments>Clean Carfax, one owner...</comments>
    <dealer>
      <id>dealer_123</id>
      <name>Your Dealership</name>
      <phone>801-555-1234</phone>
    </dealer>
  </vehicle>
</adf>
```

---

## 🔄 Sync Strategy

### Real-time Sync (Facebook)
- Trigger: On inventory create/update/delete
- Method: Webhook → Edge function → Facebook API
- Best for: High-volume dealers

### Hourly Sync (Default)
- Trigger: Cron job every hour
- Method: Check `updated_at` timestamp
- Syncs only changed vehicles
- Best for: Most dealers

### Daily Sync (KSL, AutoTrader)
- Trigger: Cron job at 2 AM
- Method: Full catalog sync
- Removes sold vehicles
- Best for: Cost-conscious dealers

---

## 🚀 User Flow

### Initial Setup

1. **Settings → Marketplaces**
2. Enable desired marketplaces
3. Connect accounts:
   - **Facebook:** OAuth flow → Grant permissions
   - **KSL:** Enter credentials → Test connection
   - **AutoTrader:** Enter FTP credentials → Validate
4. Configure sync settings
5. Click "Sync Now" for initial push

### Ongoing Use

**Automatic:**
- System syncs based on schedule
- Updates prices, availability
- Removes sold vehicles
- Notifications on errors

**Manual:**
- Bulk select vehicles → "Push to Marketplaces"
- Single vehicle → "Sync to [Platform]"
- Settings page → "Sync All Now"

---

## 💰 Cost Analysis

### Development Time
- Frontend pages: 16 hours
- Edge functions: 24 hours
- API integrations: 32 hours (8h per platform × 4)
- Testing: 16 hours
- **Total:** ~88 hours (~2 weeks)

### API Costs
- **Facebook:** Free
- **KSL:** ~$5-10 per listing/month
- **AutoTrader:** ~$300-600/month subscription
- **Our system:** Negligible (Supabase edge functions)

### ROI for Dealer
- **Time saved:** 2-4 hours/week (manual posting)
- **Increased exposure:** 3x more views
- **Faster sales:** Avg 15% reduction in days-on-lot
- **Break-even:** ~1 extra sale/month

---

## 🛡️ Error Handling

### Common Errors

**1. Authentication Failed**
- Check: Credentials expired or invalid
- Fix: Re-authenticate marketplace
- User action: "Reconnect [Platform]" button

**2. Invalid Vehicle Data**
- Check: Missing required fields (VIN, price)
- Fix: Show validation errors
- User action: Complete missing data

**3. Photo Upload Failed**
- Check: Photos too large or invalid format
- Fix: Resize/compress photos
- User action: Re-upload photos

**4. Duplicate Listing**
- Check: VIN already exists on marketplace
- Fix: Update existing listing instead
- User action: None (automatic)

**5. Rate Limit Exceeded**
- Check: Too many API calls
- Fix: Queue requests, retry with backoff
- User action: Wait and retry

### Error Notifications
- Dashboard widget showing errors
- Email alerts for critical failures
- In-app notifications
- Error log page with details

---

## 📊 Analytics & Reporting

### Marketplace Dashboard

**Metrics per marketplace:**
- Total listings
- Active listings
- Pending approvals
- Failed syncs
- Last sync time
- Views/clicks (if API provides)
- Leads generated

**Performance:**
- Avg time to list
- Success rate
- Most viewed vehicles
- Platform comparison

---

## 🔐 Security

### Credential Storage
- Encrypted in database (`marketplace_settings.credentials`)
- Use `pgcrypto` for encryption
- Never expose in frontend
- Access only via edge functions

### API Token Management
- Refresh tokens automatically
- Handle OAuth flows securely
- Log all API calls for audit

---

## 🎨 UI Mockup

### Settings Page
```
┌─────────────────────────────────────────────┐
│ Marketplace Integrations                    │
├─────────────────────────────────────────────┤
│                                             │
│ ┌─ Facebook Marketplace ─────────────────┐ │
│ │ Status: ✓ Connected                    │ │
│ │ Active Listings: 48                    │ │
│ │ Last Sync: 10 minutes ago              │ │
│ │                                         │ │
│ │ [Sync Now] [Disconnect] [Settings]     │ │
│ └─────────────────────────────────────────┘ │
│                                             │
│ ┌─ KSL Classifieds ────────────────────────┐│
│ │ Status: ⚠ Not Connected                 ││
│ │                                          ││
│ │ [Connect KSL Account]                   ││
│ └──────────────────────────────────────────┘│
│                                             │
│ ┌─ AutoTrader ─────────────────────────────┐│
│ │ Status: ✓ Connected                     ││
│ │ Active Listings: 45                     ││
│ │ Last Sync: 2 hours ago                  ││
│ │                                          ││
│ │ [Sync Now] [Disconnect] [Settings]      ││
│ └──────────────────────────────────────────┘│
│                                             │
└─────────────────────────────────────────────┘
```

### Inventory Page Status
```
┌─────────────────────────────────────────────┐
│ 2023 Honda Accord EX                        │
│ Stock: 2024-001 | VIN: 1HGCV... | $22,995  │
│                                             │
│ Marketplace Status:                         │
│ ✓ Facebook  ⏳ KSL  ✗ AutoTrader           │
│                                             │
│ [Push to Marketplaces ▼]                   │
└─────────────────────────────────────────────┘
```

---

## 🚦 Implementation Phases

### Phase 1: Facebook Marketplace (Week 1-2)
- [ ] Database tables
- [ ] Settings page
- [ ] Facebook OAuth
- [ ] sync-to-facebook edge function
- [ ] Status badges
- [ ] Manual sync

### Phase 2: KSL Classifieds (Week 3)
- [ ] KSL integration research
- [ ] sync-to-ksl edge function
- [ ] CSV/FTP upload
- [ ] Settings page updates

### Phase 3: AutoTrader (Week 4)
- [ ] ADF XML generator
- [ ] sync-to-autotrader edge function
- [ ] FTP upload
- [ ] Settings page updates

### Phase 4: Automation & Polish (Week 5)
- [ ] Scheduled sync (cron jobs)
- [ ] Error notifications
- [ ] Analytics dashboard
- [ ] User documentation

---

## 📚 API Documentation

### Facebook Marketing API
- **Docs:** https://developers.facebook.com/docs/marketing-api/catalog
- **Auth:** OAuth 2.0
- **Endpoint:** `graph.facebook.com/v18.0/{catalog_id}/items`
- **Rate Limits:** 200 calls/hour per user

### KSL Classifieds
- **Contact:** KSL dealer support for API access
- **Fallback:** CSV bulk upload via email/FTP
- **Format:** Custom CSV format

### AutoTrader
- **Docs:** Contact AutoTrader dealer support
- **Format:** ADF XML
- **Method:** FTP upload
- **Frequency:** Daily recommended

---

## 🎯 Success Metrics

**Launch Goals (30 days):**
- 80% of active dealers enable at least 1 marketplace
- 95% sync success rate
- < 5 minutes from inventory add to marketplace listing
- 50% increase in vehicle views
- 20% reduction in average days-on-lot

**Long-term Goals (90 days):**
- Support 5+ marketplaces
- Real-time sync for all platforms
- Lead tracking from marketplace to CRM
- ROI analytics per marketplace

---

## ⚠️ Important Notes

1. **Facebook Business Verification:** Dealers need verified Facebook Business accounts
2. **KSL API Access:** May require dealer subscription upgrade
3. **AutoTrader Contract:** Requires existing AutoTrader subscription
4. **Photo Quality:** High-quality photos significantly improve listing performance
5. **Compliance:** Ensure all listings comply with platform policies and local regulations

---

## 🔗 Next Steps

1. **User Research:** Survey dealers on which marketplaces they want most
2. **API Access:** Request developer accounts from each platform
3. **Pilot Program:** Test with 5 dealers on Facebook first
4. **Documentation:** Create dealer guide for connecting accounts
5. **Support Plan:** Train support team on marketplace troubleshooting
