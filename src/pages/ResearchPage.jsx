import { useState, useRef, useEffect } from 'react';
import { useSearchParams } from 'react-router-dom';
import { useStore } from '../lib/store';
import { supabase } from '../lib/supabase';
import { useTheme } from '../components/Layout';
import { CreditService } from '../lib/creditService';

// Vehicle makes and models
const VEHICLE_DATA = {
  'Ford': ['F-150', 'F-250', 'F-350', 'F-450', 'Mustang', 'Explorer', 'Escape', 'Edge', 'Bronco', 'Ranger', 'Expedition', 'Transit', 'Maverick'],
  'Chevrolet': ['Silverado 1500', 'Silverado 2500', 'Silverado 3500', 'Camaro', 'Corvette', 'Equinox', 'Traverse', 'Tahoe', 'Suburban', 'Colorado', 'Malibu', 'Blazer'],
  'Toyota': ['Camry', 'Corolla', 'RAV4', 'Tacoma', 'Tundra', 'Highlander', '4Runner', 'Prius', 'Sienna', 'Sequoia'],
  'Honda': ['Civic', 'Accord', 'CR-V', 'Pilot', 'HR-V', 'Odyssey', 'Ridgeline', 'Passport'],
  'Ram': ['1500', '2500', '3500', 'ProMaster'],
  'GMC': ['Sierra 1500', 'Sierra 2500', 'Sierra 3500', 'Yukon', 'Acadia', 'Terrain', 'Canyon'],
  'Jeep': ['Wrangler', 'Grand Cherokee', 'Cherokee', 'Compass', 'Gladiator', 'Renegade', 'Wagoneer'],
  'Dodge': ['Charger', 'Challenger', 'Durango'],
  'Nissan': ['Altima', 'Sentra', 'Rogue', 'Pathfinder', 'Frontier', 'Titan', 'Murano', 'Armada'],
  'Hyundai': ['Elantra', 'Sonata', 'Tucson', 'Santa Fe', 'Palisade', 'Kona'],
  'Kia': ['Forte', 'K5', 'Sportage', 'Sorento', 'Telluride', 'Soul', 'Seltos'],
  'Subaru': ['Outback', 'Forester', 'Crosstrek', 'Impreza', 'WRX', 'Legacy', 'Ascent'],
  'Other': []
};

const MAKES = Object.keys(VEHICLE_DATA).sort();
const RADIUS_OPTIONS = [
  { value: '50', label: '50 miles' },
  { value: '100', label: '100 miles' },
  { value: '250', label: '250 miles' },
  { value: '500', label: '500 miles' },
  { value: '0', label: 'Nationwide' }
];
const CONDITION_OPTIONS = ['Excellent', 'Good', 'Fair', 'Poor'];

// Data source indicator component - shows green for real data, yellow for estimated
function DataIndicator({ isReal, small = false }) {
  return (
    <span style={{
      display: 'inline-block',
      width: small ? '6px' : '8px',
      height: small ? '6px' : '8px',
      borderRadius: '50%',
      backgroundColor: isReal ? '#22c55e' : '#eab308',
      marginLeft: '6px'
    }} />
  );
}

// Source indicator component
function SourceIndicator({ source, label }) {
  const isReal = source === 'marketcheck' || source === 'nhtsa' || source === 'serpapi';
  const isEstimated = source === 'estimated';

  return (
    <div style={{ display: 'inline-flex', alignItems: 'center', gap: '4px', marginLeft: '8px' }}>
      <span style={{
        width: '8px',
        height: '8px',
        borderRadius: '50%',
        backgroundColor: isReal ? '#22c55e' : isEstimated ? '#eab308' : '#6b7280'
      }} />
      {label && <span style={{ fontSize: '10px', color: isReal ? '#22c55e' : '#eab308' }}>{label}</span>}
    </div>
  );
}

// Trim tier badge component
function TrimTierBadge({ tier }) {
  if (!tier || tier === 'unknown') return null;

  const colors = {
    premium: { bg: 'rgba(139,92,246,0.15)', text: '#8b5cf6' },
    mid: { bg: 'rgba(234,179,8,0.15)', text: '#eab308' },
    base: { bg: 'rgba(107,114,128,0.15)', text: '#6b7280' }
  };
  const style = colors[tier] || colors.base;

  return (
    <span style={{
      fontSize: '11px',
      fontWeight: '600',
      padding: '3px 8px',
      borderRadius: '4px',
      backgroundColor: style.bg,
      color: style.text,
      textTransform: 'uppercase'
    }}>
      {tier}
    </span>
  );
}

// Source badge component for private party listings
function SourceBadge({ source }) {
  const sourceColors = {
    craigslist: { bg: 'rgba(139,92,246,0.15)', text: '#8b5cf6' },
    ksl: { bg: 'rgba(59,130,246,0.15)', text: '#3b82f6' },
    offerup: { bg: 'rgba(34,197,94,0.15)', text: '#22c55e' },
    cargurus: { bg: 'rgba(249,115,22,0.15)', text: '#f97316' },
    facebook: { bg: 'rgba(59,130,246,0.15)', text: '#3b82f6' },
    default: { bg: 'rgba(107,114,128,0.15)', text: '#6b7280' }
  };

  const sourceLower = (source || '').toLowerCase();
  const style = sourceColors[sourceLower] || sourceColors.default;

  return (
    <span style={{
      fontSize: '10px',
      fontWeight: '600',
      padding: '2px 6px',
      borderRadius: '4px',
      backgroundColor: style.bg,
      color: style.text,
      textTransform: 'uppercase'
    }}>
      {source || 'Private'}
    </span>
  );
}

export default function ResearchPage() {
  const { dealer } = useStore();
  const [searchParams] = useSearchParams();
  const themeContext = useTheme();
  const theme = themeContext?.theme || {
    bg: '#09090b', bgCard: '#18181b', bgCardHover: '#27272a', border: '#27272a',
    text: '#ffffff', textSecondary: '#a1a1aa', textMuted: '#71717a',
    accent: '#f97316', accentBg: 'rgba(249,115,22,0.15)'
  };
  const isDark = themeContext?.darkMode !== false;

  // Form state
  const [searchMode, setSearchMode] = useState('vin');
  const [vin, setVin] = useState('');
  const [year, setYear] = useState('');
  const [make, setMake] = useState('');
  const [model, setModel] = useState('');
  const [trim, setTrim] = useState('');
  const [miles, setMiles] = useState('60000');
  const [condition, setCondition] = useState('Good');
  const [radius, setRadius] = useState('100');
  const [fuelType, setFuelType] = useState('');

  // General Search state
  const [generalQuery, setGeneralQuery] = useState('');
  const [generalLoading, setGeneralLoading] = useState(false);
  const [generalResults, setGeneralResults] = useState(null);
  const [generalError, setGeneralError] = useState(null);
  const [generalRadius, setGeneralRadius] = useState('100');

  // Find Comparables state
  const [compYearMin, setCompYearMin] = useState('');
  const [compYearMax, setCompYearMax] = useState('');
  const [compMake, setCompMake] = useState('');
  const [compModel, setCompModel] = useState('');
  const [compMaxPrice, setCompMaxPrice] = useState('');
  const [compMaxMiles, setCompMaxMiles] = useState('');
  const [compRadius, setCompRadius] = useState('100');
  const [compLoading, setCompLoading] = useState(false);
  const [compResults, setCompResults] = useState(null);
  const [compError, setCompError] = useState(null);

  // UI state
  const [loading, setLoading] = useState(false);
  const [error, setError] = useState(null);
  const [results, setResults] = useState(null);
  const [activeTab, setActiveTab] = useState('values');
  const [showScanner, setShowScanner] = useState(false);
  const [scannerError, setScannerError] = useState(null);
  const scannerRef = useRef(null);
  const html5QrCodeRef = useRef(null);
  const ymmSectionRef = useRef(null);

  // AI Analysis state
  const [aiAnalysis, setAiAnalysis] = useState(null);
  const [aiLoading, setAiLoading] = useState(false);
  const [aiError, setAiError] = useState(null);

  // Profit Calculator state
  const [buyPrice, setBuyPrice] = useState('');
  const [reconCost, setReconCost] = useState('');
  const [targetSalePrice, setTargetSalePrice] = useState('');

  // What to Buy Recommendations state
  const [recommendations, setRecommendations] = useState(null);
  const [recsLoading, setRecsLoading] = useState(false);
  const [recsError, setRecsError] = useState(null);
  const [showRecommendations, setShowRecommendations] = useState(false);

  // Seasonal patterns state
  const [seasonalPattern, setSeasonalPattern] = useState(null);

  // Generate years
  const currentYear = new Date().getFullYear();
  const years = Array.from({ length: currentYear - 1999 + 1 }, (_, i) => currentYear + 1 - i);
  const models = make ? (VEHICLE_DATA[make] || []) : [];
  const compModels = compMake ? (VEHICLE_DATA[compMake] || []) : [];

  useEffect(() => {
    if (make && !VEHICLE_DATA[make]?.includes(model)) {
      setModel('');
    }
  }, [make]);

  useEffect(() => {
    if (compMake && !VEHICLE_DATA[compMake]?.includes(compModel)) {
      setCompModel('');
    }
  }, [compMake]);

  // URL params on load - handle both VIN and Year/Make/Model params from CustomersPage
  useEffect(() => {
    const urlVin = searchParams.get('vin');
    const urlYear = searchParams.get('year');
    const urlYearMin = searchParams.get('year_min');
    const urlYearMax = searchParams.get('year_max');
    const urlMake = searchParams.get('make');
    const urlModel = searchParams.get('model');
    const urlMiles = searchParams.get('miles');
    const urlMaxPrice = searchParams.get('max_price');
    const urlMaxMiles = searchParams.get('max_miles');
    const urlQuery = searchParams.get('query');

    // Populate General Search from query param (from CustomersPage "Research" button)
    if (urlQuery) {
      setGeneralQuery(urlQuery);
    }

    if (urlVin && urlVin.length === 17) {
      setVin(urlVin);
      setSearchMode('vin');
      if (urlMiles) setMiles(urlMiles);
    } else if (urlYearMin || urlYearMax || urlMake || urlModel || urlMaxPrice || urlMaxMiles) {
      // From CustomersPage - populate YMM fields
      if (urlYearMin || urlYearMax) {
        setYear(urlYearMax || urlYearMin || '');
      }
      if (urlMake) setMake(urlMake);
      if (urlModel) setModel(urlModel);
      if (urlMaxMiles) setMiles(urlMaxMiles);
      setSearchMode('ymm');

      // Also populate Find Comparables section
      if (urlYearMin) setCompYearMin(urlYearMin);
      if (urlYearMax) setCompYearMax(urlYearMax);
      if (urlMake) setCompMake(urlMake);
      if (urlModel) setCompModel(urlModel);
      if (urlMaxPrice) setCompMaxPrice(urlMaxPrice);
      if (urlMaxMiles) setCompMaxMiles(urlMaxMiles);

      // Scroll to top to show General Search with the query
      setTimeout(() => {
        window.scrollTo({ top: 0, behavior: 'smooth' });
      }, 100);
    } else if (urlYear && urlMake && urlModel) {
      setYear(urlYear);
      setMake(urlMake);
      setModel(urlModel);
      if (urlMiles) setMiles(urlMiles);
      setSearchMode('ymm');
    }
  }, [searchParams]);

  // Scanner functions
  const startScanner = async () => {
    // Check credits BEFORE starting scanner
    const creditCheck = await CreditService.checkCredits(dealer.id, 'VIN_DECODE');

    if (!creditCheck.success) {
      if (creditCheck.rate_limited) {
        alert(`Rate limit reached. Try again at ${new Date(creditCheck.next_allowed_at).toLocaleTimeString()}`);
        return;
      }
      alert(creditCheck.message || 'Unable to decode VIN');
      return;
    }

    if (creditCheck.warning) {
      console.warn(creditCheck.warning);
    }

    setShowScanner(true);
    setScannerError(null);
    try {
      const { Html5Qrcode } = await import('html5-qrcode');
      setTimeout(async () => {
        if (!scannerRef.current) return;
        html5QrCodeRef.current = new Html5Qrcode('vin-scanner');
        try {
          await html5QrCodeRef.current.start(
            { facingMode: 'environment' },
            { fps: 10, qrbox: { width: 300, height: 100 }, aspectRatio: 3.0 },
            async (decodedText) => {
              const cleanVin = decodedText.replace(/[^A-HJ-NPR-Z0-9]/gi, '').toUpperCase();
              if (cleanVin.length === 17) {
                // Consume credits AFTER successful decode
                await CreditService.consumeCredits(
                  dealer.id,
                  'VIN_DECODE',
                  cleanVin,
                  { vin: cleanVin, method: 'camera_scan' }
                );

                setVin(cleanVin);
                stopScanner();
              }
            },
            () => {}
          );
        } catch (err) {
          setScannerError(err.message || 'Failed to start camera');
        }
      }, 100);
    } catch (err) {
      setScannerError('Scanner library not available');
    }
  };

  const stopScanner = async () => {
    if (html5QrCodeRef.current) {
      try {
        await html5QrCodeRef.current.stop();
        html5QrCodeRef.current = null;
      } catch (err) {}
    }
    setShowScanner(false);
  };

  // Parse general query into structured search params
  const parseGeneralQuery = (query) => {
    const q = query.toLowerCase();
    const params = {};

    // Extract year range (2018-2024, 2020 or newer, etc)
    const yearRangeMatch = q.match(/(\d{4})\s*[-–to]+\s*(\d{4})/);
    const yearNewerMatch = q.match(/(\d{4})\s*(or\s*newer|\+)/);
    const yearOlderMatch = q.match(/(\d{4})\s*or\s*older/);
    const singleYearMatch = q.match(/\b(19\d{2}|20\d{2})\b/);

    if (yearRangeMatch) {
      params.year_min = parseInt(yearRangeMatch[1]);
      params.year_max = parseInt(yearRangeMatch[2]);
    } else if (yearNewerMatch) {
      params.year_min = parseInt(yearNewerMatch[1]);
    } else if (yearOlderMatch) {
      params.year_max = parseInt(yearOlderMatch[1]);
    } else if (singleYearMatch) {
      params.year_min = parseInt(singleYearMatch[1]);
      params.year_max = parseInt(singleYearMatch[1]);
    }

    // Extract price (under 30k, under $30,000, max 25000)
    const priceMatch = q.match(/(?:under|max|below|less than)\s*\$?(\d+[,.]?\d*)\s*k?/i);
    if (priceMatch) {
      let price = parseFloat(priceMatch[1].replace(/,/g, ''));
      if (price < 1000) price *= 1000; // Convert 30k to 30000
      params.max_price = Math.round(price);
    }

    // Extract miles (under 100k miles, max 50000 miles)
    const milesMatch = q.match(/(?:under|max|below|less than)\s*(\d+[,.]?\d*)\s*k?\s*(?:miles|mi)/i);
    if (milesMatch) {
      let miles = parseFloat(milesMatch[1].replace(/,/g, ''));
      if (miles < 1000) miles *= 1000;
      params.max_miles = Math.round(miles);
    }

    // Extract make
    const makes = Object.keys(VEHICLE_DATA);
    for (const make of makes) {
      if (make !== 'Other' && q.includes(make.toLowerCase())) {
        params.make = make;
        // Look for model
        const models = VEHICLE_DATA[make] || [];
        for (const model of models) {
          // Handle model variations (F-150, F150, F 150)
          const modelVariations = [
            model.toLowerCase(),
            model.toLowerCase().replace(/-/g, ''),
            model.toLowerCase().replace(/-/g, ' ')
          ];
          for (const variant of modelVariations) {
            if (q.includes(variant)) {
              params.model = model;
              break;
            }
          }
          if (params.model) break;
        }
        break;
      }
    }

    return params;
  };

  // General Search function - uses find-vehicles
  const handleGeneralSearch = async () => {
    if (!generalQuery.trim()) {
      setGeneralError('Enter a search query');
      return;
    }

    setGeneralLoading(true);
    setGeneralError(null);
    setGeneralResults(null);

    try {
      // Parse the query into structured params
      const params = parseGeneralQuery(generalQuery);

      if (!params.make) {
        setGeneralError('Could not detect make from query. Try: "2020-2024 Ford F-150 under 30k"');
        setGeneralLoading(false);
        return;
      }

      const { data, error: fnError } = await supabase.functions.invoke('find-vehicles', {
        body: {
          year_min: params.year_min || null,
          year_max: params.year_max || null,
          make: params.make,
          model: params.model || null,
          max_price: params.max_price || null,
          max_miles: params.max_miles || null,
          radius_miles: parseInt(generalRadius) || 100,
          zip_code: dealer?.zip || '84065'
        }
      });

      if (fnError) throw fnError;
      if (data?.error) throw new Error(data.error);

      setGeneralResults(data);
    } catch (err) {
      setGeneralError(err.message || 'Search failed');
    } finally {
      setGeneralLoading(false);
    }
  };

  // Find Comparables function - uses find-vehicles Edge Function
  const handleComparablesSearch = async () => {
    if (!compMake) {
      setCompError('Make is required');
      return;
    }

    // Check credits BEFORE operation
    const creditCheck = await CreditService.checkCredits(dealer.id, 'MARKET_COMP_REPORT');

    if (!creditCheck.success) {
      if (creditCheck.rate_limited) {
        setCompError(`Rate limit reached. Try again at ${new Date(creditCheck.next_allowed_at).toLocaleTimeString()}`);
        return;
      }
      setCompError(creditCheck.message || 'Unable to search comparables');
      return;
    }

    if (creditCheck.warning) {
      console.warn(creditCheck.warning);
    }

    setCompLoading(true);
    setCompError(null);
    setCompResults(null);

    try {
      const { data, error: fnError } = await supabase.functions.invoke('find-vehicles', {
        body: {
          year_min: compYearMin ? parseInt(compYearMin) : null,
          year_max: compYearMax ? parseInt(compYearMax) : null,
          make: compMake,
          model: compModel || null,
          max_price: compMaxPrice ? parseInt(compMaxPrice) : null,
          max_miles: compMaxMiles ? parseInt(compMaxMiles) : null,
          radius_miles: parseInt(compRadius) || 100,
          zip_code: dealer?.zip || '84065'
        }
      });

      if (fnError) throw fnError;
      if (data?.error) throw new Error(data.error);

      // Consume credits AFTER successful operation
      const vehicleId = `${compYearMin || 'any'}-${compYearMax || 'any'}-${compMake}-${compModel || 'any'}`;
      await CreditService.consumeCredits(
        dealer.id,
        'MARKET_COMP_REPORT',
        vehicleId,
        {
          year_min: compYearMin,
          year_max: compYearMax,
          make: compMake,
          model: compModel,
          results_count: data.vehicles?.length || 0
        }
      );

      setCompResults(data);
    } catch (err) {
      setCompError(err.message || 'Search failed');
    } finally {
      setCompLoading(false);
    }
  };

  // AI Analysis function
  const runAiAnalysis = async () => {
    if (!results || !results.vehicle) {
      setAiError('No vehicle data to analyze');
      return;
    }

    // Check credits BEFORE operation
    const creditCheck = await CreditService.checkCredits(dealer.id, 'AI_VEHICLE_ANALYSIS');

    if (!creditCheck.success) {
      if (creditCheck.rate_limited) {
        setAiError(`Rate limit reached. Try again at ${new Date(creditCheck.next_allowed_at).toLocaleTimeString()}`);
        return;
      }
      setAiError(creditCheck.message || 'Unable to run AI analysis');
      return;
    }

    if (creditCheck.warning) {
      console.warn(creditCheck.warning);
    }

    setAiLoading(true);
    setAiError(null);

    try {
      const vehicle = {
        vin: results.vehicle?.vin || null,
        year: results.vehicle?.year,
        make: results.vehicle?.make,
        model: results.vehicle?.model,
        trim: results.vehicle?.trim || null,
        price: null, // Will be filled from user input or estimated
        miles: results.vehicle?.miles || parseInt(miles) || 60000,
        mmr: results.values?.mmr || null,
        savings_percentage: null, // Calculated if price is available
        exterior_color: results.vehicle?.exterior_color || null,
        location: null
      };

      const { data, error: fnError } = await supabase.functions.invoke('analyze-vehicle-opportunity', {
        body: {
          dealer_id: dealer.id,
          vehicle
        }
      });

      if (fnError) throw fnError;
      if (data?.error) throw new Error(data.error);

      // Consume credits AFTER successful operation
      await CreditService.consumeCredits(
        dealer.id,
        'AI_VEHICLE_ANALYSIS',
        vehicle.vin || `${vehicle.year}-${vehicle.make}-${vehicle.model}`,
        {
          year: vehicle.year,
          make: vehicle.make,
          model: vehicle.model,
          recommendation: data.recommendation
        }
      );

      setAiAnalysis(data);

      // Pre-populate profit calculator with AI estimates
      if (data.target_purchase_price) setBuyPrice(data.target_purchase_price.toString());
      if (data.estimated_recon_cost) setReconCost(data.estimated_recon_cost.toString());
      if (data.target_sale_price) setTargetSalePrice(data.target_sale_price.toString());

    } catch (err) {
      setAiError(err.message || 'AI analysis failed');
    } finally {
      setAiLoading(false);
    }
  };

  // Calculate profit from calculator inputs
  const calculateProfit = () => {
    const buy = parseFloat(buyPrice) || 0;
    const recon = parseFloat(reconCost) || 0;
    const sale = parseFloat(targetSalePrice) || 0;

    const grossProfit = sale - buy - recon;
    const roi = buy > 0 ? ((grossProfit / buy) * 100) : 0;
    const margin = sale > 0 ? ((grossProfit / sale) * 100) : 0;

    return { grossProfit, roi, margin };
  };

  // Load buying recommendations
  const loadBuyingRecommendations = async () => {
    // Check credits BEFORE operation
    const creditCheck = await CreditService.checkCredits(dealer.id, 'BUYING_RECOMMENDATIONS');

    if (!creditCheck.success) {
      if (creditCheck.rate_limited) {
        setRecsError(`Rate limit reached. Try again at ${new Date(creditCheck.next_allowed_at).toLocaleTimeString()}`);
        return;
      }
      setRecsError(creditCheck.message || 'Unable to generate recommendations');
      return;
    }

    if (creditCheck.warning) {
      console.warn(creditCheck.warning);
    }

    setRecsLoading(true);
    setRecsError(null);

    try {
      const { data, error: fnError } = await supabase.functions.invoke('generate-buying-recommendations', {
        body: {
          dealer_id: dealer.id,
          budget_max: null,
          quantity: 5
        }
      });

      if (fnError) throw fnError;
      if (data?.error) throw new Error(data.error);

      // Consume credits AFTER successful operation
      await CreditService.consumeCredits(
        dealer.id,
        'BUYING_RECOMMENDATIONS',
        `recommendations-${new Date().toISOString()}`,
        {
          recommendations_count: data.recommendations?.length || 0
        }
      );

      setRecommendations(data);
      setShowRecommendations(true);

    } catch (err) {
      setRecsError(err.message || 'Failed to generate recommendations');
    } finally {
      setRecsLoading(false);
    }
  };

  // Auto-populate search from recommendation
  const searchFromRecommendation = (rec) => {
    // Parse year range (e.g., "2018-2022")
    const yearMatch = rec.year_range?.match(/(\d{4})-(\d{4})/);

    setCompYearMin(yearMatch ? yearMatch[1] : '');
    setCompYearMax(yearMatch ? yearMatch[2] : '');
    setCompMake(rec.make);
    setCompModel(rec.model);
    setCompMaxPrice(rec.target_price_max?.toString() || '');
    setCompRadius('250');

    // Scroll to Find Comparables section
    setTimeout(() => {
      const element = document.querySelector('[data-section="comparables"]');
      if (element) {
        element.scrollIntoView({ behavior: 'smooth', block: 'start' });
      }
    }, 100);
  };

  // Fetch seasonal pattern for current vehicle
  const fetchSeasonalPattern = async (make, model) => {
    try {
      const { data, error } = await supabase
        .from('seasonal_vehicle_patterns')
        .select('*')
        .eq('dealer_id', dealer.id)
        .eq('make', make)
        .eq('model', model || null)
        .single();

      if (!error && data) {
        setSeasonalPattern(data);
      } else {
        setSeasonalPattern(null);
      }
    } catch (err) {
      console.error('Error fetching seasonal pattern:', err);
      setSeasonalPattern(null);
    }
  };

  // Helper: Get month names from numbers
  const getMonthNames = (monthNumbers) => {
    const monthNames = ['Jan', 'Feb', 'Mar', 'Apr', 'May', 'Jun', 'Jul', 'Aug', 'Sep', 'Oct', 'Nov', 'Dec'];
    return monthNumbers?.map(m => monthNames[m - 1]).join(', ') || 'N/A';
  };

  // Helper: Get current month demand score
  const getCurrentDemandScore = (pattern) => {
    if (!pattern?.demand_score_by_month) return null;
    const currentMonth = new Date().getMonth() + 1; // 1-12
    return pattern.demand_score_by_month[currentMonth] || null;
  };

  // Helper: Calculate composite deal score
  const calculateCompositeScore = (vehicle, dealerPrefs, seasonalData) => {
    let score = 0;

    // 1. Price vs market (30%)
    const savingsPercentage = vehicle.savings_percentage || 0;
    const priceScore = Math.min(30, (savingsPercentage / 20) * 30);
    score += priceScore;

    // 2. Dealer's historical profit (25%)
    if (dealerPrefs?.avg_profit) {
      const profitScore = Math.min(25, (dealerPrefs.avg_profit / 5000) * 25);
      score += profitScore;
    }

    // 3. Expected turn time (20%)
    const estimatedDays = vehicle.estimated_days_to_sell || dealerPrefs?.avg_days_on_lot || 30;
    const turnScore = Math.min(20, (30 / estimatedDays) * 20);
    score += turnScore;

    // 4. Seasonal demand (15%)
    const demandScore = getCurrentDemandScore(seasonalData) || 5;
    const seasonScore = (demandScore / 10) * 15;
    score += seasonScore;

    // 5. BHPH suitability (10%)
    const bhphScore = vehicle.bhph_score || 5;
    const bhphPoints = (bhphScore / 10) * 10;
    score += bhphPoints;

    return Math.min(100, Math.round(score));
  };

  // Get deal score color
  const getDealScoreStyle = (score) => {
    const styles = {
      'GREAT DEAL': { bg: 'rgba(34,197,94,0.2)', color: '#22c55e', border: '#22c55e' },
      'GOOD DEAL': { bg: 'rgba(34,197,94,0.1)', color: '#4ade80', border: '#4ade80' },
      'FAIR PRICE': { bg: 'rgba(234,179,8,0.15)', color: '#eab308', border: '#eab308' },
      'OVERPRICED': { bg: 'rgba(249,115,22,0.15)', color: '#f97316', border: '#f97316' },
      'BAD DEAL': { bg: 'rgba(239,68,68,0.15)', color: '#ef4444', border: '#ef4444' },
    };
    return styles[score] || { bg: 'rgba(107,114,128,0.15)', color: '#6b7280', border: '#6b7280' };
  };

  // Search function
  const handleSearch = async () => {
    if (searchMode === 'vin' && (!vin || vin.length !== 17)) {
      setError('Enter valid 17-character VIN');
      return;
    }
    if (searchMode === 'ymm' && (!year || !make || !model)) {
      setError('Year, Make, and Model required');
      return;
    }

    // Check credits BEFORE operation
    const creditCheck = await CreditService.checkCredits(dealer.id, 'VEHICLE_RESEARCH');

    if (!creditCheck.success) {
      if (creditCheck.rate_limited) {
        setError(`Rate limit reached. Try again at ${new Date(creditCheck.next_allowed_at).toLocaleTimeString()}`);
        return;
      }
      setError(creditCheck.message || 'Unable to perform research');
      return;
    }

    // Show warning if low on credits
    if (creditCheck.warning) {
      console.warn(creditCheck.warning);
    }

    setLoading(true);
    setError(null);
    setResults(null);

    try {
      const { data, error: fnError } = await supabase.functions.invoke('vehicle-research', {
        body: {
          vin: searchMode === 'vin' ? vin.toUpperCase() : null,
          year: searchMode === 'ymm' ? parseInt(year) : null,
          make: searchMode === 'ymm' ? make : null,
          model: searchMode === 'ymm' ? model : null,
          trim: trim || null,
          miles: parseInt(miles) || 60000,
          condition,
          zip_code: dealer?.zip || '84065',
          radius_miles: parseInt(radius) || 100,
          fuel_type: fuelType || null
        }
      });

      if (fnError) throw fnError;
      if (data?.error) throw new Error(data.error);

      // Consume credits AFTER successful operation
      const vehicleId = searchMode === 'vin' ? vin : `${year}-${make}-${model}`;
      await CreditService.consumeCredits(
        dealer.id,
        'VEHICLE_RESEARCH',
        vehicleId,
        { searchMode, year, make, model, vin }
      );

      setResults(data);
      setActiveTab('values');

      // Fetch seasonal pattern for this vehicle
      if (data?.vehicle?.make && data?.vehicle?.model) {
        fetchSeasonalPattern(data.vehicle.make, data.vehicle.model);
      }
    } catch (err) {
      setError(err.message || 'Research failed');
    } finally {
      setLoading(false);
    }
  };

  // Formatters - handle null/undefined properly (0 is valid)
  const formatCurrency = (num) => {
    if (num === null || num === undefined) return 'N/A';
    if (typeof num !== 'number' || isNaN(num)) return 'N/A';
    return new Intl.NumberFormat('en-US', { style: 'currency', currency: 'USD', maximumFractionDigits: 0 }).format(num);
  };

  // Format currency with +/- sign for adjustments
  const formatAdjustment = (num) => {
    if (num === null || num === undefined) return 'N/A';
    if (typeof num !== 'number' || isNaN(num)) return 'N/A';
    const prefix = num >= 0 ? '+' : '';
    return prefix + new Intl.NumberFormat('en-US', { style: 'currency', currency: 'USD', maximumFractionDigits: 0 }).format(num);
  };

  const formatNumber = (num) => {
    if (num === null || num === undefined) return '0';
    if (typeof num !== 'number' || isNaN(num)) return '0';
    return new Intl.NumberFormat('en-US').format(num);
  };

  // Check if valuations are from real data
  const hasRealData = (results) => results?.values?.confidence === 'HIGH';

  // Check if engine is diesel
  const isDiesel = (engine) => {
    if (!engine) return false;
    return engine.toLowerCase().includes('diesel');
  };

  // Styles
  const inputStyle = {
    padding: '12px 14px', borderRadius: '8px', border: `1px solid ${theme.border}`,
    backgroundColor: isDark ? theme.bgCard : '#ffffff', color: theme.text, fontSize: '15px', outline: 'none', width: '100%'
  };

  const selectStyle = {
    ...inputStyle,
    cursor: 'pointer',
    appearance: 'none',
    backgroundImage: `url("data:image/svg+xml,%3Csvg xmlns='http://www.w3.org/2000/svg' width='12' height='12' viewBox='0 0 12 12'%3E%3Cpath fill='%23${isDark ? 'a1a1aa' : '71717a'}' d='M6 8L1 3h10z'/%3E%3C/svg%3E")`,
    backgroundRepeat: 'no-repeat',
    backgroundPosition: 'right 12px center',
    paddingRight: '36px'
  };

  const cardStyle = {
    backgroundColor: isDark ? theme.bgCard : '#ffffff', borderRadius: '12px', border: `1px solid ${theme.border}`, padding: '20px'
  };

  const btnStyle = (active = false) => ({
    padding: '10px 20px', borderRadius: '8px', border: 'none',
    backgroundColor: active ? theme.accent : (isDark ? theme.border : '#e4e4e7'),
    color: active ? '#fff' : theme.textSecondary,
    fontWeight: '600', cursor: 'pointer'
  });

  const tabs = [
    { id: 'values', label: 'Valuations' },
    { id: 'market', label: 'Market Analysis' },
    { id: 'comparables', label: 'Comparables' },
    { id: 'specs', label: 'Specs' },
    { id: 'ai-analysis', label: '🤖 AI Analysis' }
  ];

  return (
    <div style={{ padding: '24px', backgroundColor: theme.bg, minHeight: '100vh', color: theme.text }}>
      <div style={{ maxWidth: '1200px', margin: '0 auto' }}>

        {/* Header */}
        <div style={{ marginBottom: '24px' }}>
          <h1 style={{ fontSize: '28px', fontWeight: '700', margin: 0, color: theme.text }}>Vehicle Research</h1>
          <p style={{ color: theme.textMuted, margin: '8px 0 0', fontSize: '14px' }}>Get instant valuations and market analysis</p>
        </div>

        {/* WHAT TO BUY SECTION - AI RECOMMENDATIONS */}
        <div style={{ ...cardStyle, marginBottom: '24px', border: '2px solid #22c55e', background: isDark ? 'linear-gradient(135deg, rgba(34,197,94,0.05) 0%, rgba(34,197,94,0.02) 100%)' : 'linear-gradient(135deg, rgba(34,197,94,0.08) 0%, rgba(34,197,94,0.02) 100%)' }}>
          <div style={{ display: 'flex', alignItems: 'center', justifyContent: 'space-between', marginBottom: '16px' }}>
            <div style={{ display: 'flex', alignItems: 'center', gap: '8px' }}>
              <svg width="24" height="24" viewBox="0 0 24 24" fill="none" stroke="#22c55e" strokeWidth="2">
                <path d="M12 2L2 7l10 5 10-5-10-5z"/><path d="M2 17l10 5 10-5"/><path d="M2 12l10 5 10-5"/>
              </svg>
              <h3 style={{ margin: 0, color: '#22c55e', fontSize: '18px', fontWeight: '700' }}>💡 What to Buy</h3>
            </div>
            <button
              onClick={() => setShowRecommendations(!showRecommendations)}
              style={{
                background: 'none',
                border: 'none',
                color: '#22c55e',
                fontSize: '24px',
                cursor: 'pointer',
                padding: '4px',
                lineHeight: 1
              }}
            >
              {showRecommendations ? '−' : '+'}
            </button>
          </div>

          {showRecommendations && (
            <>
              <p style={{ color: theme.textMuted, margin: '0 0 16px', fontSize: '14px' }}>
                AI-powered vehicle recommendations based on your sales history and market trends
              </p>

              {!recommendations && !recsLoading && (
                <button
                  onClick={loadBuyingRecommendations}
                  disabled={recsLoading}
                  style={{
                    ...btnStyle(true),
                    backgroundColor: '#22c55e',
                    padding: '14px 32px',
                    fontSize: '15px',
                    opacity: recsLoading ? 0.6 : 1,
                    width: '100%'
                  }}
                >
                  {recsLoading ? 'Generating Recommendations...' : '✨ Get Smart Recommendations (15 credits)'}
                </button>
              )}

              {recsError && (
                <div style={{ padding: '12px', backgroundColor: 'rgba(239,68,68,0.1)', border: '1px solid #ef4444', borderRadius: '8px', color: '#ef4444', fontSize: '14px' }}>
                  {recsError}
                </div>
              )}

              {recommendations && (
                <div>
                  {/* Market Insights */}
                  {recommendations.market_insights && (
                    <div style={{ padding: '16px', backgroundColor: isDark ? theme.bg : '#f8fafc', borderRadius: '10px', marginBottom: '20px', border: `1px solid ${theme.border}` }}>
                      <div style={{ fontSize: '12px', fontWeight: '600', color: theme.textMuted, marginBottom: '8px' }}>📊 MARKET INSIGHTS</div>
                      <div style={{ color: theme.text, fontSize: '14px', lineHeight: '1.6' }}>
                        {recommendations.market_insights}
                      </div>
                    </div>
                  )}

                  {/* Recommendations Grid */}
                  <div style={{ display: 'flex', flexDirection: 'column', gap: '12px' }}>
                    {recommendations.recommendations?.map((rec, i) => (
                      <div
                        key={i}
                        style={{
                          padding: '16px',
                          backgroundColor: isDark ? theme.bg : '#ffffff',
                          borderRadius: '10px',
                          border: `2px solid ${i === 0 ? '#22c55e' : theme.border}`,
                          position: 'relative'
                        }}
                      >
                        {/* Rank Badge */}
                        <div style={{
                          position: 'absolute',
                          top: '-10px',
                          left: '12px',
                          backgroundColor: i === 0 ? '#22c55e' : '#6b7280',
                          color: '#ffffff',
                          padding: '4px 12px',
                          borderRadius: '12px',
                          fontSize: '11px',
                          fontWeight: '700'
                        }}>
                          #{rec.rank} {i === 0 ? 'TOP PICK' : 'RECOMMENDED'}
                        </div>

                        {/* Vehicle Info */}
                        <div style={{ marginTop: '8px' }}>
                          <h4 style={{ margin: '0 0 8px', fontSize: '18px', fontWeight: '700', color: theme.text }}>
                            {rec.year_range} {rec.make} {rec.model}
                          </h4>

                          {/* Metrics */}
                          <div style={{ display: 'grid', gridTemplateColumns: 'repeat(auto-fit, minmax(110px, 1fr))', gap: '8px', marginBottom: '12px' }}>
                            <div style={{ padding: '8px', backgroundColor: isDark ? 'rgba(255,255,255,0.03)' : 'rgba(0,0,0,0.02)', borderRadius: '6px', textAlign: 'center' }}>
                              <div style={{ fontSize: '10px', color: theme.textMuted, marginBottom: '4px' }}>TARGET PRICE</div>
                              <div style={{ fontSize: '16px', fontWeight: '700', color: theme.text }}>
                                {formatCurrency(rec.target_price_max)}
                              </div>
                            </div>
                            <div style={{ padding: '8px', backgroundColor: 'rgba(34,197,94,0.1)', borderRadius: '6px', textAlign: 'center' }}>
                              <div style={{ fontSize: '10px', color: theme.textMuted, marginBottom: '4px' }}>PROFIT</div>
                              <div style={{ fontSize: '16px', fontWeight: '700', color: '#22c55e' }}>
                                {formatCurrency(rec.expected_profit)}
                              </div>
                            </div>
                            <div style={{ padding: '8px', backgroundColor: isDark ? 'rgba(255,255,255,0.03)' : 'rgba(0,0,0,0.02)', borderRadius: '6px', textAlign: 'center' }}>
                              <div style={{ fontSize: '10px', color: theme.textMuted, marginBottom: '4px' }}>DAYS TO SELL</div>
                              <div style={{ fontSize: '16px', fontWeight: '700', color: theme.text }}>
                                {rec.expected_days_to_sell}
                              </div>
                            </div>
                          </div>

                          {/* Reasoning */}
                          <div style={{ marginBottom: '12px' }}>
                            <div style={{ fontSize: '11px', fontWeight: '600', color: theme.textMuted, marginBottom: '4px' }}>WHY THIS VEHICLE:</div>
                            <div style={{ color: theme.text, fontSize: '13px', lineHeight: '1.5' }}>
                              {rec.reasoning}
                            </div>
                            {rec.seasonal_note && (
                              <div style={{ marginTop: '6px', padding: '6px 10px', backgroundColor: 'rgba(234,179,8,0.1)', borderRadius: '6px', fontSize: '12px', color: '#eab308' }}>
                                🌤️ {rec.seasonal_note}
                              </div>
                            )}
                          </div>

                          {/* Where to Find */}
                          {rec.where_to_find && rec.where_to_find.length > 0 && (
                            <div style={{ marginBottom: '12px' }}>
                              <div style={{ fontSize: '11px', fontWeight: '600', color: theme.textMuted, marginBottom: '4px' }}>WHERE TO FIND:</div>
                              <div style={{ display: 'flex', gap: '6px', flexWrap: 'wrap' }}>
                                {rec.where_to_find.map((source, idx) => (
                                  <span
                                    key={idx}
                                    style={{
                                      padding: '4px 10px',
                                      backgroundColor: isDark ? 'rgba(255,255,255,0.05)' : 'rgba(0,0,0,0.05)',
                                      borderRadius: '6px',
                                      fontSize: '11px',
                                      color: theme.textSecondary
                                    }}
                                  >
                                    {source}
                                  </span>
                                ))}
                              </div>
                            </div>
                          )}

                          {/* Search Button */}
                          <button
                            onClick={() => searchFromRecommendation(rec)}
                            style={{
                              ...btnStyle(true),
                              backgroundColor: '#22c55e',
                              padding: '10px 20px',
                              fontSize: '13px',
                              width: '100%'
                            }}
                          >
                            🔍 Search for {rec.make} {rec.model}
                          </button>
                        </div>
                      </div>
                    ))}
                  </div>

                  {/* Refresh Button */}
                  <button
                    onClick={loadBuyingRecommendations}
                    disabled={recsLoading}
                    style={{
                      ...btnStyle(false),
                      marginTop: '16px',
                      padding: '10px 20px',
                      fontSize: '13px',
                      opacity: recsLoading ? 0.6 : 1
                    }}
                  >
                    🔄 Refresh Recommendations (15 credits)
                  </button>
                </div>
              )}
            </>
          )}
        </div>

        {/* GENERAL SEARCH SECTION - NEW */}
        <div style={{ ...cardStyle, marginBottom: '24px', border: '2px solid #3b82f6' }}>
          <div style={{ display: 'flex', alignItems: 'center', gap: '8px', marginBottom: '16px' }}>
            <svg width="20" height="20" viewBox="0 0 24 24" fill="none" stroke="#3b82f6" strokeWidth="2">
              <circle cx="11" cy="11" r="8"/><path d="m21 21-4.35-4.35"/>
            </svg>
            <h3 style={{ margin: 0, color: '#3b82f6', fontSize: '16px', fontWeight: '600' }}>General Search</h3>
          </div>

          <div style={{ display: 'flex', gap: '12px', alignItems: 'end', flexWrap: 'wrap' }}>
            <div style={{ flex: 1, minWidth: '250px' }}>
              <label style={{ fontSize: '11px', color: theme.textMuted, display: 'block', marginBottom: '4px' }}>Search Query</label>
              <input
                value={generalQuery}
                onChange={(e) => setGeneralQuery(e.target.value)}
                onKeyDown={(e) => e.key === 'Enter' && handleGeneralSearch()}
                placeholder="2020-2024 Ford F-150 under 30k"
                style={inputStyle}
              />
            </div>
            <div style={{ minWidth: '120px' }}>
              <label style={{ fontSize: '11px', color: theme.textMuted, display: 'block', marginBottom: '4px' }}>Radius</label>
              <select value={generalRadius} onChange={(e) => setGeneralRadius(e.target.value)} style={selectStyle}>
                {RADIUS_OPTIONS.map(r => <option key={r.value} value={r.value}>{r.label}</option>)}
              </select>
            </div>
            <button
              onClick={handleGeneralSearch}
              disabled={generalLoading}
              style={{ ...btnStyle(true), backgroundColor: '#3b82f6', padding: '12px 24px', opacity: generalLoading ? 0.6 : 1 }}
            >
              {generalLoading ? 'Searching...' : 'Search'}
            </button>
          </div>
          <div style={{ fontSize: '11px', color: theme.textMuted, marginTop: '8px' }}>
            Example: "2020-2024 Ford F-150 under 30k" or "Toyota Tacoma under 100k miles"
          </div>

          {generalError && (
            <div style={{ marginTop: '12px', padding: '12px', backgroundColor: 'rgba(239,68,68,0.1)', border: '1px solid #ef4444', borderRadius: '8px', color: '#ef4444', fontSize: '14px' }}>
              {generalError}
            </div>
          )}

          {generalResults && (
            <div style={{ marginTop: '16px' }}>
              {/* Market Summary */}
              {generalResults.market_summary && (generalResults.market_summary.avg_price || generalResults.market_summary.total_available > 0) && (
                <div style={{
                  display: 'grid',
                  gridTemplateColumns: 'repeat(auto-fit, minmax(100px, 1fr))',
                  gap: '12px',
                  marginBottom: '20px',
                  padding: '16px',
                  backgroundColor: isDark ? theme.bg : '#f8fafc',
                  borderRadius: '10px',
                  border: `1px solid ${theme.border}`
                }}>
                  <div style={{ textAlign: 'center' }}>
                    <div style={{ fontSize: '10px', color: theme.textMuted, textTransform: 'uppercase', marginBottom: '4px' }}>Avg Price</div>
                    <div style={{ fontSize: '18px', fontWeight: '700', color: theme.text }}>{formatCurrency(generalResults.market_summary.avg_price)}</div>
                  </div>
                  <div style={{ textAlign: 'center' }}>
                    <div style={{ fontSize: '10px', color: theme.textMuted, textTransform: 'uppercase', marginBottom: '4px' }}>Median</div>
                    <div style={{ fontSize: '18px', fontWeight: '700', color: theme.text }}>{formatCurrency(generalResults.market_summary.median_price)}</div>
                  </div>
                  <div style={{ textAlign: 'center' }}>
                    <div style={{ fontSize: '10px', color: theme.textMuted, textTransform: 'uppercase', marginBottom: '4px' }}>Range</div>
                    <div style={{ fontSize: '14px', fontWeight: '600', color: theme.text }}>
                      {generalResults.market_summary.price_range ? `${formatCurrency(generalResults.market_summary.price_range.low)} - ${formatCurrency(generalResults.market_summary.price_range.high)}` : 'N/A'}
                    </div>
                  </div>
                  <div style={{ textAlign: 'center' }}>
                    <div style={{ fontSize: '10px', color: theme.textMuted, textTransform: 'uppercase', marginBottom: '4px' }}>Available</div>
                    <div style={{ fontSize: '18px', fontWeight: '700', color: '#3b82f6' }}>{generalResults.market_summary.total_available || 0}</div>
                  </div>
                  {generalResults.market_summary.avg_days_on_market && (
                    <div style={{ textAlign: 'center' }}>
                      <div style={{ fontSize: '10px', color: theme.textMuted, textTransform: 'uppercase', marginBottom: '4px' }}>Avg DOM</div>
                      <div style={{ fontSize: '18px', fontWeight: '700', color: theme.text }}>{generalResults.market_summary.avg_days_on_market}</div>
                    </div>
                  )}
                </div>
              )}

              {/* AI Guidance if no listings */}
              {generalResults.ai_guidance && (
                <div style={{
                  padding: '16px',
                  backgroundColor: 'rgba(59,130,246,0.1)',
                  border: '1px solid #3b82f6',
                  borderRadius: '10px',
                  marginBottom: '20px'
                }}>
                  <div style={{ fontSize: '12px', color: '#3b82f6', fontWeight: '600', marginBottom: '8px' }}>AI Market Insights</div>
                  <div style={{ fontSize: '13px', color: theme.text, lineHeight: '1.6', whiteSpace: 'pre-wrap' }}>{generalResults.ai_guidance}</div>
                </div>
              )}

              {/* Results Count */}
              <div style={{ fontSize: '13px', color: theme.textMuted, marginBottom: '12px' }}>
                {generalResults.total_found || 0} vehicles found
                {generalResults.dealer_listings?.length > 0 && ` (${generalResults.dealer_listings.length} dealer`}
                {generalResults.private_listings?.length > 0 && `, ${generalResults.private_listings.length} private)`}
                {generalResults.dealer_listings?.length > 0 && !generalResults.private_listings?.length && ')'}
              </div>

              {/* Dealer Listings */}
              {generalResults.dealer_listings?.length > 0 && (
                <div style={{ marginBottom: '24px' }}>
                  <div style={{ fontSize: '14px', fontWeight: '600', color: theme.text, marginBottom: '12px', display: 'flex', alignItems: 'center', gap: '8px' }}>
                    <span style={{ padding: '3px 8px', backgroundColor: 'rgba(59,130,246,0.15)', color: '#3b82f6', borderRadius: '4px', fontSize: '11px' }}>DEALER</span>
                    {generalResults.dealer_listings.length} listings
                  </div>
                  <div style={{ display: 'grid', gap: '10px' }}>
                    {generalResults.dealer_listings.slice(0, 20).map((c, i) => {
                      const dealStyle = getDealScoreStyle(c.deal_score);
                      return (
                        <div key={i} style={{
                          backgroundColor: isDark ? theme.bg : '#f8fafc',
                          padding: '14px',
                          borderRadius: '10px',
                          border: c.deal_score === 'GREAT DEAL' ? `2px solid ${dealStyle.border}` : `1px solid ${theme.border}`,
                          display: 'flex',
                          justifyContent: 'space-between',
                          alignItems: 'center',
                          flexWrap: 'wrap',
                          gap: '12px'
                        }}>
                          <div style={{ flex: 1, minWidth: '200px' }}>
                            <div style={{ display: 'flex', alignItems: 'center', gap: '8px', flexWrap: 'wrap', marginBottom: '4px' }}>
                              <span style={{ color: theme.text, fontWeight: '600', fontSize: '14px' }}>
                                {c.year} {c.make} {c.model} {c.trim || ''}
                              </span>
                              {c.deal_score && c.deal_score !== 'UNKNOWN' && (
                                <span style={{
                                  fontSize: '10px',
                                  fontWeight: '700',
                                  padding: '2px 6px',
                                  borderRadius: '4px',
                                  backgroundColor: dealStyle.bg,
                                  color: dealStyle.color
                                }}>
                                  {c.deal_score}
                                </span>
                              )}
                            </div>
                            <div style={{ color: theme.textMuted, fontSize: '12px' }}>
                              {c.miles && <span>{formatNumber(c.miles)} mi</span>}
                              {c.miles && c.location && <span> • </span>}
                              {c.location && <span>{c.location}</span>}
                              {c.days_listed > 0 && <span> • {c.days_listed} days listed</span>}
                            </div>
                            {c.dealer_name && <div style={{ color: theme.textMuted, fontSize: '11px', marginTop: '2px' }}>{c.dealer_name}</div>}
                            {c.savings !== 0 && c.savings !== undefined && (
                              <div style={{ fontSize: '11px', marginTop: '4px', color: c.savings > 0 ? '#22c55e' : '#ef4444' }}>
                                {c.savings > 0 ? `$${formatNumber(c.savings)} under market` : `$${formatNumber(Math.abs(c.savings))} over market`}
                              </div>
                            )}
                          </div>
                          <div style={{ display: 'flex', alignItems: 'center', gap: '12px' }}>
                            <div style={{ textAlign: 'right' }}>
                              <div style={{ color: dealStyle.color, fontWeight: '700', fontSize: '20px' }}>{formatCurrency(c.price)}</div>
                              {c.market_value && (
                                <div style={{ fontSize: '11px', color: theme.textMuted }}>Market: {formatCurrency(c.market_value)}</div>
                              )}
                            </div>
                            {c.url && (
                              <a href={c.url} target="_blank" rel="noopener noreferrer" style={{ padding: '8px 12px', backgroundColor: '#3b82f6', color: '#fff', borderRadius: '6px', textDecoration: 'none', fontSize: '12px', fontWeight: '600' }}>
                                View
                              </a>
                            )}
                          </div>
                        </div>
                      );
                    })}
                  </div>
                </div>
              )}

              {/* Private Listings */}
              {generalResults.private_listings?.length > 0 && (
                <div>
                  <div style={{ fontSize: '14px', fontWeight: '600', color: theme.text, marginBottom: '12px', display: 'flex', alignItems: 'center', gap: '8px' }}>
                    <span style={{ padding: '3px 8px', backgroundColor: 'rgba(34,197,94,0.15)', color: '#22c55e', borderRadius: '4px', fontSize: '11px' }}>PRIVATE</span>
                    {generalResults.private_listings.length} listings
                  </div>
                  <div style={{ display: 'grid', gap: '10px' }}>
                    {generalResults.private_listings.slice(0, 10).map((c, i) => {
                      const dealStyle = getDealScoreStyle(c.estimated_deal_score);
                      return (
                        <div key={i} style={{
                          backgroundColor: isDark ? theme.bg : '#f8fafc',
                          padding: '14px',
                          borderRadius: '10px',
                          border: `1px solid ${theme.border}`,
                          display: 'flex',
                          justifyContent: 'space-between',
                          alignItems: 'center',
                          flexWrap: 'wrap',
                          gap: '12px'
                        }}>
                          <div style={{ flex: 1, minWidth: '200px' }}>
                            <div style={{ display: 'flex', alignItems: 'center', gap: '8px', flexWrap: 'wrap', marginBottom: '4px' }}>
                              <span style={{ color: theme.text, fontWeight: '600', fontSize: '14px' }}>
                                {c.title || `${c.year || ''} ${c.make} ${c.model}`}
                              </span>
                              <span style={{
                                fontSize: '9px',
                                fontWeight: '600',
                                padding: '2px 6px',
                                borderRadius: '4px',
                                backgroundColor: c.source === 'FB Marketplace' ? 'rgba(59,130,246,0.15)' : c.source === 'Craigslist' ? 'rgba(139,92,246,0.15)' : 'rgba(249,115,22,0.15)',
                                color: c.source === 'FB Marketplace' ? '#3b82f6' : c.source === 'Craigslist' ? '#8b5cf6' : '#f97316'
                              }}>
                                {c.source}
                              </span>
                            </div>
                            <div style={{ color: theme.textMuted, fontSize: '12px' }}>
                              {c.miles && <span>{formatNumber(c.miles)} mi</span>}
                              {c.miles && c.location && <span> • </span>}
                              {c.location && <span>{c.location}</span>}
                            </div>
                          </div>
                          <div style={{ display: 'flex', alignItems: 'center', gap: '12px' }}>
                            <div style={{ color: '#22c55e', fontWeight: '700', fontSize: '20px' }}>{c.price ? formatCurrency(c.price) : 'Contact'}</div>
                            {c.url && (
                              <a href={c.url} target="_blank" rel="noopener noreferrer" style={{ padding: '8px 12px', backgroundColor: '#22c55e', color: '#fff', borderRadius: '6px', textDecoration: 'none', fontSize: '12px', fontWeight: '600' }}>
                                View
                              </a>
                            )}
                          </div>
                        </div>
                      );
                    })}
                  </div>
                </div>
              )}

              {/* No results */}
              {generalResults.total_found === 0 && !generalResults.ai_guidance && (
                <div style={{ color: theme.textMuted, padding: '24px', textAlign: 'center', backgroundColor: isDark ? theme.bg : '#f8fafc', borderRadius: '10px' }}>
                  No vehicles found matching your criteria
                </div>
              )}
            </div>
          )}
        </div>

        {/* Search Form */}
        <div ref={ymmSectionRef} style={{ ...cardStyle, marginBottom: '24px' }}>
          {/* Mode Toggle */}
          <div style={{ display: 'flex', gap: '8px', marginBottom: '20px' }}>
            <button onClick={() => setSearchMode('vin')} style={btnStyle(searchMode === 'vin')}>Search by VIN</button>
            <button onClick={() => setSearchMode('ymm')} style={btnStyle(searchMode === 'ymm')}>Search by Year/Make/Model</button>
          </div>

          {searchMode === 'vin' ? (
            <div>
              {/* VIN Row */}
              <div style={{ display: 'grid', gridTemplateColumns: '1fr auto auto', gap: '12px', alignItems: 'end', marginBottom: '16px' }}>
                <div>
                  <label style={{ fontSize: '12px', color: theme.textMuted, display: 'block', marginBottom: '6px' }}>VIN</label>
                  <input value={vin} onChange={(e) => setVin(e.target.value.toUpperCase())} placeholder="17-character VIN" style={inputStyle} maxLength={17} />
                </div>
                <button onClick={startScanner} style={{ ...btnStyle(), padding: '12px 16px' }} title="Scan VIN">
                  <svg width="20" height="20" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2">
                    <path d="M23 19a2 2 0 0 1-2 2H3a2 2 0 0 1-2-2V8a2 2 0 0 1 2-2h4l2-3h6l2 3h4a2 2 0 0 1 2 2z"/>
                    <circle cx="12" cy="13" r="4"/>
                  </svg>
                </button>
                <button onClick={handleSearch} disabled={loading} style={{ ...btnStyle(true), padding: '12px 32px', opacity: loading ? 0.6 : 1 }}>
                  {loading ? 'Searching...' : 'Research'}
                </button>
              </div>

              {/* Additional VIN fields */}
              <div style={{ display: 'grid', gridTemplateColumns: 'repeat(auto-fit, minmax(140px, 1fr))', gap: '12px' }}>
                <div>
                  <label style={{ fontSize: '12px', color: theme.textMuted, display: 'block', marginBottom: '6px' }}>Miles *</label>
                  <input type="number" value={miles} onChange={(e) => setMiles(e.target.value)} placeholder="60000" style={inputStyle} />
                </div>
                <div>
                  <label style={{ fontSize: '12px', color: theme.textMuted, display: 'block', marginBottom: '6px' }}>Condition</label>
                  <select value={condition} onChange={(e) => setCondition(e.target.value)} style={selectStyle}>
                    {CONDITION_OPTIONS.map(c => <option key={c} value={c}>{c}</option>)}
                  </select>
                </div>
                <div>
                  <label style={{ fontSize: '12px', color: theme.textMuted, display: 'block', marginBottom: '6px' }}>Search Radius</label>
                  <select value={radius} onChange={(e) => setRadius(e.target.value)} style={selectStyle}>
                    {RADIUS_OPTIONS.map(r => <option key={r.value} value={r.value}>{r.label}</option>)}
                  </select>
                </div>
                <div>
                  <label style={{ fontSize: '12px', color: theme.textMuted, display: 'block', marginBottom: '6px' }}>Fuel Type</label>
                  <select value={fuelType} onChange={(e) => setFuelType(e.target.value)} style={selectStyle}>
                    <option value="">Auto-detect</option>
                    <option value="Diesel">Diesel</option>
                    <option value="Gasoline">Gasoline</option>
                    <option value="Electric">Electric</option>
                    <option value="Hybrid">Hybrid</option>
                  </select>
                </div>
              </div>
            </div>
          ) : (
            <div style={{ display: 'grid', gridTemplateColumns: 'repeat(auto-fit, minmax(140px, 1fr))', gap: '12px' }}>
              <div>
                <label style={{ fontSize: '12px', color: theme.textMuted, display: 'block', marginBottom: '6px' }}>Year *</label>
                <select value={year} onChange={(e) => setYear(e.target.value)} style={selectStyle}>
                  <option value="">Select Year</option>
                  {years.map(y => <option key={y} value={y}>{y}</option>)}
                </select>
              </div>
              <div>
                <label style={{ fontSize: '12px', color: theme.textMuted, display: 'block', marginBottom: '6px' }}>Make *</label>
                <select value={make} onChange={(e) => setMake(e.target.value)} style={selectStyle}>
                  <option value="">Select Make</option>
                  {MAKES.map(m => <option key={m} value={m}>{m}</option>)}
                </select>
              </div>
              <div>
                <label style={{ fontSize: '12px', color: theme.textMuted, display: 'block', marginBottom: '6px' }}>Model *</label>
                <select value={model} onChange={(e) => setModel(e.target.value)} style={selectStyle} disabled={!make}>
                  <option value="">Select Model</option>
                  {models.map(m => <option key={m} value={m}>{m}</option>)}
                </select>
              </div>
              <div>
                <label style={{ fontSize: '12px', color: theme.textMuted, display: 'block', marginBottom: '6px' }}>Trim</label>
                <input value={trim} onChange={(e) => setTrim(e.target.value)} placeholder="Platinum, XLT, etc." style={inputStyle} />
              </div>
              <div>
                <label style={{ fontSize: '12px', color: theme.textMuted, display: 'block', marginBottom: '6px' }}>Miles *</label>
                <input type="number" value={miles} onChange={(e) => setMiles(e.target.value)} placeholder="60000" style={inputStyle} />
              </div>
              <div>
                <label style={{ fontSize: '12px', color: theme.textMuted, display: 'block', marginBottom: '6px' }}>Condition</label>
                <select value={condition} onChange={(e) => setCondition(e.target.value)} style={selectStyle}>
                  {CONDITION_OPTIONS.map(c => <option key={c} value={c}>{c}</option>)}
                </select>
              </div>
              <div>
                <label style={{ fontSize: '12px', color: theme.textMuted, display: 'block', marginBottom: '6px' }}>Search Radius</label>
                <select value={radius} onChange={(e) => setRadius(e.target.value)} style={selectStyle}>
                  {RADIUS_OPTIONS.map(r => <option key={r.value} value={r.value}>{r.label}</option>)}
                </select>
              </div>
              <div>
                <label style={{ fontSize: '12px', color: theme.textMuted, display: 'block', marginBottom: '6px' }}>Fuel Type</label>
                <select value={fuelType} onChange={(e) => setFuelType(e.target.value)} style={selectStyle}>
                  <option value="">Any</option>
                  <option value="Diesel">Diesel</option>
                  <option value="Gasoline">Gasoline</option>
                  <option value="Electric">Electric</option>
                  <option value="Hybrid">Hybrid</option>
                </select>
              </div>
              <div style={{ display: 'flex', alignItems: 'end' }}>
                <button onClick={handleSearch} disabled={loading} style={{ ...btnStyle(true), width: '100%', opacity: loading ? 0.6 : 1 }}>
                  {loading ? 'Searching...' : 'Research'}
                </button>
              </div>
            </div>
          )}

          {error && <div style={{ marginTop: '16px', padding: '12px', backgroundColor: 'rgba(239,68,68,0.1)', border: '1px solid #ef4444', borderRadius: '8px', color: '#ef4444', fontSize: '14px' }}>{error}</div>}
        </div>

        {/* Scanner Modal */}
        {showScanner && (
          <div style={{ position: 'fixed', top: 0, left: 0, right: 0, bottom: 0, backgroundColor: 'rgba(0,0,0,0.85)', zIndex: 9999, display: 'flex', alignItems: 'center', justifyContent: 'center', padding: '20px' }}>
            <div style={{ backgroundColor: theme.bgCard, borderRadius: '16px', padding: '24px', maxWidth: '500px', width: '100%' }}>
              <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'center', marginBottom: '16px' }}>
                <h3 style={{ margin: 0, color: theme.text }}>Scan VIN Barcode</h3>
                <button onClick={stopScanner} style={{ background: 'none', border: 'none', color: theme.textMuted, fontSize: '24px', cursor: 'pointer' }}>&times;</button>
              </div>
              <div id="vin-scanner" ref={scannerRef} style={{ width: '100%', minHeight: '250px', backgroundColor: '#000', borderRadius: '8px', overflow: 'hidden' }} />
              {scannerError && <div style={{ marginTop: '12px', padding: '12px', backgroundColor: 'rgba(239,68,68,0.1)', borderRadius: '8px', color: '#ef4444', fontSize: '14px' }}>{scannerError}</div>}
              <p style={{ color: theme.textMuted, fontSize: '13px', marginTop: '12px', textAlign: 'center' }}>Point camera at VIN barcode</p>
            </div>
          </div>
        )}

        {/* Results */}
        {results && (
          <>
            {/* Vehicle Header */}
            <div style={{ ...cardStyle, marginBottom: '20px', padding: '16px' }}>
              <div style={{ display: 'flex', alignItems: 'center', gap: '12px', flexWrap: 'wrap' }}>
                <h2 style={{ margin: 0, fontSize: '20px', color: theme.text }}>
                  {results.vehicle?.year} {results.vehicle?.make} {results.vehicle?.model} {results.vehicle?.trim}
                </h2>
                <span style={{ fontSize: '14px', color: theme.textMuted }}>{formatNumber(results.vehicle?.miles)} miles</span>
                {results.vehicle?.fuel_type && (
                  <span style={{
                    fontSize: '12px',
                    padding: '4px 10px',
                    borderRadius: '20px',
                    backgroundColor: isDiesel(results.vehicle.fuel_type) ? 'rgba(234,179,8,0.15)' : 'rgba(59,130,246,0.15)',
                    color: isDiesel(results.vehicle.fuel_type) ? '#eab308' : '#3b82f6',
                    fontWeight: isDiesel(results.vehicle.fuel_type) ? '600' : '400'
                  }}>
                    {results.vehicle.fuel_type}
                  </span>
                )}
                <TrimTierBadge tier={results.trim_tier} />
                <span style={{
                  fontSize: '12px', padding: '4px 10px', borderRadius: '20px',
                  backgroundColor: results.confidence === 'HIGH' ? 'rgba(34,197,94,0.15)' : results.confidence === 'ESTIMATED' ? 'rgba(239,68,68,0.15)' : 'rgba(234,179,8,0.15)',
                  color: results.confidence === 'HIGH' ? '#22c55e' : results.confidence === 'ESTIMATED' ? '#ef4444' : '#eab308'
                }}>
                  {results.confidence} Confidence
                </span>
              </div>

              {/* Data Sources */}
              {results.data_sources && (
                <div style={{ display: 'flex', gap: '16px', marginTop: '12px', flexWrap: 'wrap', fontSize: '11px' }}>
                  {Object.entries(results.data_sources).filter(([_, v]) => v).map(([key, value]) => (
                    <div key={key} style={{ display: 'flex', alignItems: 'center', gap: '4px' }}>
                      <span style={{
                        width: '8px', height: '8px', borderRadius: '50%',
                        backgroundColor: value === 'marketcheck' || value === 'nhtsa' || value === 'serpapi' ? '#22c55e' : '#eab308'
                      }} />
                      <span style={{ color: theme.textMuted }}>{key.replace(/_/g, ' ')}:</span>
                      <span style={{ color: theme.text, fontWeight: '500' }}>{value}</span>
                    </div>
                  ))}
                </div>
              )}

              {/* Seasonal Indicator */}
              {seasonalPattern && (
                <div style={{ marginTop: '12px', padding: '12px', backgroundColor: isDark ? theme.bg : '#f8fafc', borderRadius: '8px', border: `1px solid ${theme.border}` }}>
                  <div style={{ display: 'grid', gridTemplateColumns: 'repeat(auto-fit, minmax(200px, 1fr))', gap: '12px' }}>
                    <div>
                      <div style={{ fontSize: '10px', color: theme.textMuted, marginBottom: '4px', textTransform: 'uppercase' }}>📅 Best Time to Buy</div>
                      <div style={{ color: '#22c55e', fontSize: '14px', fontWeight: '600' }}>
                        {getMonthNames(seasonalPattern.best_buy_months)}
                      </div>
                    </div>
                    <div>
                      <div style={{ fontSize: '10px', color: theme.textMuted, marginBottom: '4px', textTransform: 'uppercase' }}>💰 Best Time to Sell</div>
                      <div style={{ color: '#3b82f6', fontSize: '14px', fontWeight: '600' }}>
                        {getMonthNames(seasonalPattern.best_sell_months)}
                      </div>
                    </div>
                    <div>
                      <div style={{ fontSize: '10px', color: theme.textMuted, marginBottom: '4px', textTransform: 'uppercase' }}>🔥 Current Demand</div>
                      <div style={{ fontSize: '20px', fontWeight: '700', color: getCurrentDemandScore(seasonalPattern) >= 7 ? '#22c55e' : getCurrentDemandScore(seasonalPattern) >= 5 ? '#eab308' : '#ef4444' }}>
                        {getCurrentDemandScore(seasonalPattern) || 'N/A'}/10
                      </div>
                    </div>
                  </div>
                </div>
              )}
            </div>

            {/* Tabs */}
            <div style={{ display: 'flex', gap: '8px', marginBottom: '20px', flexWrap: 'wrap' }}>
              {tabs.map(tab => (
                <button key={tab.id} onClick={() => setActiveTab(tab.id)} style={btnStyle(activeTab === tab.id)}>{tab.label}</button>
              ))}
            </div>

            {/* Tab Content */}
            <div style={cardStyle}>

              {/* Values Tab */}
              {activeTab === 'values' && (() => {
                // Calculate mileage adjustment
                const avgMiles = 60000;
                const inputMiles = results.vehicle?.miles || parseInt(miles) || 60000;
                const milesDiff = inputMiles - avgMiles;
                // Over avg: -$0.15/mile, Under avg: +$0.10/mile
                const mileageAdjustment = milesDiff > 0
                  ? Math.round(milesDiff * -0.15)
                  : Math.round(milesDiff * -0.10);
                const adjustedMMR = (results.values?.mmr || 0) + mileageAdjustment;

                return (
                <div>
                  <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'center', marginBottom: '16px', flexWrap: 'wrap', gap: '12px' }}>
                    <h3 style={{ color: theme.text, margin: 0, fontSize: '18px' }}>Valuations</h3>
                    {results.values?.confidence !== 'HIGH' ? (
                      <div style={{ display: 'flex', alignItems: 'center', gap: '8px', padding: '6px 10px', backgroundColor: 'rgba(234,179,8,0.15)', borderRadius: '6px' }}>
                        <span style={{ width: '8px', height: '8px', borderRadius: '50%', backgroundColor: '#eab308' }} />
                        <span style={{ color: '#eab308', fontSize: '11px', fontWeight: '600' }}>Values are {results.values?.confidence || 'ESTIMATED'}</span>
                      </div>
                    ) : (
                      <div style={{ display: 'flex', alignItems: 'center', gap: '8px', padding: '6px 10px', backgroundColor: 'rgba(34,197,94,0.15)', borderRadius: '6px' }}>
                        <span style={{ width: '8px', height: '8px', borderRadius: '50%', backgroundColor: '#22c55e' }} />
                        <span style={{ color: '#22c55e', fontSize: '11px', fontWeight: '600' }}>HIGH Confidence Data</span>
                      </div>
                    )}
                  </div>

                  {/* Main Valuations Section */}
                  <div style={{
                    marginBottom: '20px',
                    padding: '16px',
                    backgroundColor: isDark ? theme.bg : '#f8fafc',
                    borderRadius: '10px',
                    border: `1px solid ${theme.border}`
                  }}>
                    {/* Retail */}
                    <div style={{
                      display: 'flex',
                      justifyContent: 'space-between',
                      alignItems: 'center',
                      padding: '10px 12px',
                      backgroundColor: isDark ? 'rgba(255,255,255,0.03)' : 'rgba(0,0,0,0.02)',
                      borderRadius: '6px',
                      marginBottom: '8px'
                    }}>
                      <div style={{ display: 'flex', alignItems: 'center', gap: '8px' }}>
                        <span style={{ color: theme.text, fontSize: '13px', fontWeight: '600' }}>Retail</span>
                        <DataIndicator isReal={hasRealData(results)} small />
                      </div>
                      <span style={{ color: theme.text, fontWeight: '700', fontSize: '16px' }}>
                        {formatCurrency(results.values?.retail)}
                      </span>
                    </div>

                    {/* Wholesale */}
                    <div style={{
                      display: 'flex',
                      justifyContent: 'space-between',
                      alignItems: 'center',
                      padding: '10px 12px',
                      marginBottom: '8px'
                    }}>
                      <div style={{ display: 'flex', alignItems: 'center', gap: '8px' }}>
                        <span style={{ color: theme.textMuted, fontSize: '13px' }}>Wholesale</span>
                      </div>
                      <span style={{ color: theme.text, fontWeight: '600', fontSize: '14px' }}>
                        {formatCurrency(results.values?.wholesale)}
                      </span>
                    </div>

                    {/* MMR */}
                    <div style={{
                      display: 'flex',
                      justifyContent: 'space-between',
                      alignItems: 'center',
                      padding: '10px 12px',
                      marginBottom: '8px'
                    }}>
                      <div style={{ display: 'flex', alignItems: 'center', gap: '8px' }}>
                        <span style={{ color: theme.textMuted, fontSize: '13px' }}>MMR (Auction)</span>
                      </div>
                      <span style={{ color: theme.text, fontWeight: '600', fontSize: '14px' }}>
                        {formatCurrency(results.values?.mmr)}
                      </span>
                    </div>

                    {/* Trade-In */}
                    <div style={{
                      display: 'flex',
                      justifyContent: 'space-between',
                      alignItems: 'center',
                      padding: '10px 12px',
                      marginBottom: '8px'
                    }}>
                      <div style={{ display: 'flex', alignItems: 'center', gap: '8px' }}>
                        <span style={{ color: theme.textMuted, fontSize: '13px' }}>Trade-In</span>
                      </div>
                      <span style={{ color: theme.text, fontWeight: '600', fontSize: '14px' }}>
                        {formatCurrency(results.values?.trade_in)}
                      </span>
                    </div>

                    {/* Mileage Adjustment */}
                    <div style={{
                      display: 'flex',
                      justifyContent: 'space-between',
                      alignItems: 'center',
                      padding: '10px 12px',
                      backgroundColor: isDark ? 'rgba(255,255,255,0.02)' : 'rgba(0,0,0,0.01)',
                      borderRadius: '6px',
                      marginBottom: '8px'
                    }}>
                      <div style={{ display: 'flex', alignItems: 'center', gap: '8px' }}>
                        <span style={{ color: theme.textMuted, fontSize: '13px' }}>Mileage Adjustment</span>
                        <span style={{
                          fontSize: '10px',
                          padding: '2px 6px',
                          borderRadius: '4px',
                          backgroundColor: 'rgba(107,114,128,0.15)',
                          color: theme.textSecondary
                        }}>
                          {formatNumber(inputMiles)} mi ({formatNumber(Math.abs(milesDiff))} {milesDiff > 0 ? 'over' : 'under'} avg)
                        </span>
                      </div>
                      <span style={{
                        color: mileageAdjustment >= 0 ? '#22c55e' : '#ef4444',
                        fontWeight: '600',
                        fontSize: '14px'
                      }}>
                        {formatAdjustment(mileageAdjustment)}
                      </span>
                    </div>

                    {/* Mileage Adjusted MMR - THE ACQUISITION NUMBER */}
                    <div style={{
                      display: 'flex',
                      justifyContent: 'space-between',
                      alignItems: 'center',
                      padding: '12px 14px',
                      backgroundColor: 'rgba(34,197,94,0.1)',
                      borderRadius: '8px',
                      border: '2px solid #22c55e'
                    }}>
                      <div style={{ display: 'flex', alignItems: 'center', gap: '10px' }}>
                        <span style={{
                          fontSize: '9px',
                          fontWeight: '700',
                          padding: '3px 6px',
                          borderRadius: '4px',
                          backgroundColor: '#22c55e',
                          color: '#ffffff',
                          textTransform: 'uppercase'
                        }}>
                          BUY AT
                        </span>
                        <span style={{ color: theme.text, fontSize: '14px', fontWeight: '700' }}>Mileage Adjusted MMR</span>
                      </div>
                      <span style={{ color: '#22c55e', fontWeight: '800', fontSize: '20px' }}>
                        {formatCurrency(adjustedMMR)}
                      </span>
                    </div>
                  </div>
                </div>
                );
              })()}

              {/* Market Tab */}
              {activeTab === 'market' && (() => {
                // Derive demand from supply (low supply = high demand)
                const supplyLevel = results.market_stats?.supply_level || 'medium';
                const demandLevel = supplyLevel === 'low' ? 'Hot' : supplyLevel === 'high' ? 'Cold' : 'Normal';

                return (
                <div>
                  <h3 style={{ color: theme.text, margin: '0 0 20px', fontSize: '18px' }}>
                    Market Analysis
                  </h3>

                  {results.market_stats ? (
                    <div>
                      <div style={{ display: 'grid', gridTemplateColumns: 'repeat(auto-fit, minmax(140px, 1fr))', gap: '12px', marginBottom: '24px' }}>
                        <div style={{ padding: '20px', backgroundColor: isDark ? theme.bg : '#f8fafc', borderRadius: '10px', textAlign: 'center' }}>
                          <div style={{ fontSize: '11px', color: theme.textMuted, marginBottom: '8px' }}>DAYS TO SELL</div>
                          <div style={{ fontSize: '32px', fontWeight: '700', color: demandLevel === 'Hot' ? '#ef4444' : demandLevel === 'Cold' ? '#3b82f6' : '#eab308' }}>
                            {results.market_stats.avg_days_on_market ?? 'N/A'}
                          </div>
                          <div style={{ fontSize: '12px', color: theme.textMuted }}>avg days</div>
                        </div>
                        <div style={{ padding: '20px', backgroundColor: isDark ? theme.bg : '#f8fafc', borderRadius: '10px', textAlign: 'center' }}>
                          <div style={{ fontSize: '11px', color: theme.textMuted, marginBottom: '8px' }}>DEMAND</div>
                          <div style={{ fontSize: '24px', marginBottom: '4px' }}>
                            {demandLevel === 'Hot' ? '🔥' : demandLevel === 'Cold' ? '❄️' : '⚡'}
                          </div>
                          <div style={{ fontSize: '18px', fontWeight: '700', color: demandLevel === 'Hot' ? '#ef4444' : demandLevel === 'Cold' ? '#3b82f6' : '#eab308' }}>
                            {demandLevel}
                          </div>
                        </div>
                        <div style={{ padding: '20px', backgroundColor: isDark ? theme.bg : '#f8fafc', borderRadius: '10px', textAlign: 'center' }}>
                          <div style={{ fontSize: '11px', color: theme.textMuted, marginBottom: '8px' }}>PRICE TREND</div>
                          <div style={{ fontSize: '32px', fontWeight: '700', color: results.market_stats.price_trend === 'up' ? '#22c55e' : results.market_stats.price_trend === 'down' ? '#ef4444' : '#eab308' }}>
                            {results.market_stats.price_trend === 'up' ? '↑' : results.market_stats.price_trend === 'down' ? '↓' : '→'}
                          </div>
                          <div style={{ fontSize: '14px', fontWeight: '600', color: theme.text }}>{results.market_stats.price_trend || 'stable'}</div>
                        </div>
                        <div style={{ padding: '20px', backgroundColor: isDark ? theme.bg : '#f8fafc', borderRadius: '10px', textAlign: 'center' }}>
                          <div style={{ fontSize: '11px', color: theme.textMuted, marginBottom: '8px' }}>SUPPLY</div>
                          <div style={{ fontSize: '32px', fontWeight: '700', color: theme.text }}>{results.market_stats.active_listings ?? 0}</div>
                          <div style={{ fontSize: '14px', fontWeight: '600', color: supplyLevel === 'high' ? '#22c55e' : supplyLevel === 'low' ? '#ef4444' : '#eab308' }}>
                            {supplyLevel}
                          </div>
                        </div>
                      </div>

                      {results.market_stats.price_range && (
                        <div style={{ padding: '16px', backgroundColor: isDark ? theme.bg : '#f8fafc', borderRadius: '10px' }}>
                          <div style={{ fontSize: '12px', color: theme.textMuted, fontWeight: '600', marginBottom: '12px' }}>PRICE RANGE</div>
                          <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'center' }}>
                            <div>
                              <div style={{ fontSize: '11px', color: theme.textMuted }}>MIN</div>
                              <div style={{ fontSize: '20px', fontWeight: '600', color: '#22c55e' }}>{formatCurrency(results.market_stats.price_range.low)}</div>
                            </div>
                            <div style={{ flex: 1, height: '4px', backgroundColor: theme.border, margin: '0 16px', borderRadius: '2px' }}>
                              <div style={{ width: '50%', height: '100%', backgroundColor: theme.accent, borderRadius: '2px' }} />
                            </div>
                            <div>
                              <div style={{ fontSize: '11px', color: theme.textMuted }}>MAX</div>
                              <div style={{ fontSize: '20px', fontWeight: '600', color: '#ef4444' }}>{formatCurrency(results.market_stats.price_range.high)}</div>
                            </div>
                          </div>
                        </div>
                      )}
                    </div>
                  ) : (
                    <div style={{ color: theme.textMuted, textAlign: 'center', padding: '40px' }}>No market data available</div>
                  )}
                </div>
              );
              })()}

              {/* Comparables Tab */}
              {activeTab === 'comparables' && (
                <div>
                  {/* Dealer Listings Section */}
                  <div style={{ marginBottom: '32px' }}>
                    <div style={{ display: 'flex', alignItems: 'center', gap: '12px', marginBottom: '16px' }}>
                      <h3 style={{ color: theme.text, margin: 0, fontSize: '18px' }}>Dealer Listings</h3>
                      <span style={{ fontSize: '12px', padding: '4px 10px', borderRadius: '6px', backgroundColor: 'rgba(59,130,246,0.15)', color: '#3b82f6' }}>
                        {results.comparables?.dealer_listings?.length || 0} found
                      </span>
                      <TrimTierBadge tier={results.trim_tier} />
                      <SourceIndicator source="marketcheck" label="MarketCheck" />
                    </div>

                    {results.comparables?.dealer_listings?.length > 0 ? (
                      <div style={{ display: 'grid', gap: '10px' }}>
                        {results.comparables.dealer_listings.map((c, i) => (
                          <div key={i} style={{ backgroundColor: isDark ? theme.bg : '#f8fafc', padding: '14px', borderRadius: '10px', display: 'flex', justifyContent: 'space-between', alignItems: 'center', flexWrap: 'wrap', gap: '12px' }}>
                            <div style={{ flex: 1, minWidth: '200px' }}>
                              <div style={{ display: 'flex', alignItems: 'center', gap: '8px', flexWrap: 'wrap' }}>
                                <span style={{ color: theme.text, fontWeight: '600', fontSize: '14px' }}>{c.title}</span>
                                <span style={{ fontSize: '10px', fontWeight: '600', padding: '2px 6px', borderRadius: '4px', backgroundColor: 'rgba(59,130,246,0.15)', color: '#3b82f6' }}>DEALER</span>
                                <TrimTierBadge tier={c.trim_tier} />
                              </div>
                              <div style={{ color: theme.textMuted, fontSize: '12px', marginTop: '4px' }}>
                                {formatNumber(c.miles)} mi • {c.location}
                                {c.fuel_type && (
                                  <span style={{ color: isDiesel(c.fuel_type) ? '#eab308' : '#3b82f6', fontWeight: isDiesel(c.fuel_type) ? '600' : '400' }}> • {c.fuel_type}</span>
                                )}
                              </div>
                              {/* Body type and drivetrain row */}
                              <div style={{ display: 'flex', gap: '8px', marginTop: '4px', flexWrap: 'wrap' }}>
                                {c.body_type && (
                                  <span style={{ fontSize: '10px', padding: '2px 6px', borderRadius: '4px', backgroundColor: 'rgba(107,114,128,0.15)', color: theme.textSecondary }}>
                                    {c.body_type}
                                  </span>
                                )}
                                {c.drivetrain && (
                                  <span style={{ fontSize: '10px', padding: '2px 6px', borderRadius: '4px', backgroundColor: 'rgba(139,92,246,0.15)', color: '#8b5cf6' }}>
                                    {c.drivetrain}
                                  </span>
                                )}
                              </div>
                              {c.dealer && <div style={{ color: theme.textMuted, fontSize: '11px', marginTop: '2px' }}>{c.dealer}</div>}
                              {c.dom > 0 && <div style={{ color: theme.textMuted, fontSize: '11px' }}>{c.dom} days on market</div>}
                            </div>
                            <div style={{ display: 'flex', alignItems: 'center', gap: '12px' }}>
                              <div style={{ color: theme.accent, fontWeight: '700', fontSize: '20px' }}>{formatCurrency(c.price)}</div>
                              {c.url && (
                                <a href={c.url} target="_blank" rel="noopener noreferrer" style={{ padding: '8px 12px', backgroundColor: theme.accent, color: '#fff', borderRadius: '6px', textDecoration: 'none', fontSize: '12px', fontWeight: '600' }}>
                                  View
                                </a>
                              )}
                            </div>
                          </div>
                        ))}
                      </div>
                    ) : (
                      <div style={{ color: theme.textMuted, padding: '24px', textAlign: 'center', backgroundColor: isDark ? theme.bg : '#f8fafc', borderRadius: '10px' }}>
                        No dealer listings found matching trim tier
                      </div>
                    )}
                  </div>

                  {/* Private Party Section */}
                  <div>
                    <div style={{ display: 'flex', alignItems: 'center', gap: '12px', marginBottom: '16px' }}>
                      <h3 style={{ color: theme.text, margin: 0, fontSize: '18px' }}>Private Party Listings</h3>
                      <span style={{ fontSize: '12px', padding: '4px 10px', borderRadius: '6px', backgroundColor: 'rgba(34,197,94,0.15)', color: '#22c55e' }}>
                        {results.comparables?.private_listings?.length || 0} found
                      </span>
                      <SourceIndicator source={results.data_sources?.private_comparables} label="SerpAPI" />
                    </div>

                    {results.comparables?.private_listings?.length > 0 ? (
                      <div style={{ display: 'grid', gap: '10px' }}>
                        {results.comparables.private_listings.map((c, i) => (
                          <div key={i} style={{ backgroundColor: isDark ? theme.bg : '#f8fafc', padding: '14px', borderRadius: '10px', display: 'flex', justifyContent: 'space-between', alignItems: 'center', flexWrap: 'wrap', gap: '12px' }}>
                            <div style={{ flex: 1, minWidth: '200px' }}>
                              <div style={{ display: 'flex', alignItems: 'center', gap: '8px', flexWrap: 'wrap' }}>
                                <span style={{ color: theme.text, fontWeight: '600', fontSize: '14px' }}>{c.title}</span>
                                <SourceBadge source={c.source} />
                                <TrimTierBadge tier={c.trim_tier} />
                              </div>
                              <div style={{ color: theme.textMuted, fontSize: '12px', marginTop: '4px' }}>
                                {c.miles && <span>{formatNumber(c.miles)} mi</span>}
                                {c.miles && c.location && <span> • </span>}
                                {c.location && <span>{c.location}</span>}
                              </div>
                              {/* Body type and drivetrain row for private party */}
                              <div style={{ display: 'flex', gap: '8px', marginTop: '4px', flexWrap: 'wrap' }}>
                                {c.body_type && (
                                  <span style={{ fontSize: '10px', padding: '2px 6px', borderRadius: '4px', backgroundColor: 'rgba(107,114,128,0.15)', color: theme.textSecondary }}>
                                    {c.body_type}
                                  </span>
                                )}
                                {c.drivetrain && (
                                  <span style={{ fontSize: '10px', padding: '2px 6px', borderRadius: '4px', backgroundColor: 'rgba(139,92,246,0.15)', color: '#8b5cf6' }}>
                                    {c.drivetrain}
                                  </span>
                                )}
                              </div>
                              {c.snippet && <div style={{ color: theme.textMuted, fontSize: '11px', marginTop: '4px' }}>{c.snippet}</div>}
                            </div>
                            <div style={{ display: 'flex', alignItems: 'center', gap: '12px' }}>
                              <div style={{ color: '#22c55e', fontWeight: '700', fontSize: '20px' }}>{formatCurrency(c.price)}</div>
                              {c.url && (
                                <a href={c.url} target="_blank" rel="noopener noreferrer" style={{ padding: '8px 12px', backgroundColor: '#22c55e', color: '#fff', borderRadius: '6px', textDecoration: 'none', fontSize: '12px', fontWeight: '600' }}>
                                  View
                                </a>
                              )}
                            </div>
                          </div>
                        ))}
                      </div>
                    ) : (
                      <div style={{ color: theme.textMuted, padding: '24px', textAlign: 'center', backgroundColor: isDark ? theme.bg : '#f8fafc', borderRadius: '10px' }}>
                        {results.debug?.serp_api_configured ? 'No private party listings found' : 'SerpAPI not configured - private party search disabled'}
                      </div>
                    )}
                  </div>
                </div>
              )}

              {/* Specs Tab */}
              {activeTab === 'specs' && (
                <div>
                  <h3 style={{ color: theme.text, margin: '0 0 20px', fontSize: '18px' }}>
                    Vehicle Specs
                    <SourceIndicator source={results.data_sources?.vin_decode} />
                  </h3>

                  <div style={{ display: 'grid', gridTemplateColumns: 'repeat(auto-fit, minmax(180px, 1fr))', gap: '10px' }}>
                    {Object.entries(results.vehicle || {}).filter(([k, v]) => v && k !== 'vin' && k !== 'miles' && k !== 'trim_tier').map(([k, v]) => (
                      <div key={k} style={{ backgroundColor: isDark ? theme.bg : '#f8fafc', padding: '12px', borderRadius: '8px' }}>
                        <div style={{ color: theme.textMuted, fontSize: '10px', marginBottom: '4px', textTransform: 'uppercase' }}>{k.replace(/_/g, ' ')}</div>
                        <div style={{ color: theme.text, fontSize: '14px', fontWeight: '500' }}>{String(v)}</div>
                      </div>
                    ))}
                  </div>

                  {results.vehicle?.vin && (
                    <div style={{ marginTop: '16px', padding: '12px', backgroundColor: isDark ? theme.bg : '#f8fafc', borderRadius: '8px' }}>
                      <div style={{ color: theme.textMuted, fontSize: '10px', marginBottom: '4px' }}>VIN</div>
                      <div style={{ color: theme.text, fontSize: '14px', fontFamily: 'monospace', letterSpacing: '1px' }}>{results.vehicle.vin}</div>
                    </div>
                  )}

                  {/* Debug Info */}
                  {results.debug && (
                    <div style={{ marginTop: '24px', padding: '16px', backgroundColor: isDark ? theme.bg : '#f8fafc', borderRadius: '8px' }}>
                      <div style={{ color: theme.textMuted, fontSize: '10px', marginBottom: '8px', textTransform: 'uppercase' }}>Debug Info</div>
                      <div style={{ fontSize: '12px', color: theme.textMuted }}>
                        <div>MarketCheck listings: {results.debug.total_mc_listings ?? 0}</div>
                        <div>Filtered dealer comps: {results.debug.filtered_dealer_count ?? 0}</div>
                        <div>Private party comps: {results.debug.private_count ?? 0}</div>
                        <div>SerpAPI configured: {results.debug.serp_api_configured ? 'Yes' : 'No'}</div>
                      </div>
                    </div>
                  )}
                </div>
              )}

              {/* AI Analysis Tab */}
              {activeTab === 'ai-analysis' && (
                <div>
                  <h3 style={{ color: theme.text, margin: '0 0 20px', fontSize: '18px' }}>
                    🤖 AI-Powered Vehicle Analysis
                  </h3>

                  {!aiAnalysis && !aiLoading && (
                    <div style={{ textAlign: 'center', padding: '40px 20px' }}>
                      <div style={{ fontSize: '48px', marginBottom: '16px' }}>🤖</div>
                      <p style={{ color: theme.textMuted, marginBottom: '24px' }}>
                        Get AI-powered insights including profit predictions, turn time estimates, risk assessment, and pricing recommendations
                      </p>
                      <button
                        onClick={runAiAnalysis}
                        disabled={aiLoading}
                        style={{
                          ...btnStyle(true),
                          backgroundColor: theme.accent,
                          padding: '12px 32px',
                          fontSize: '14px',
                          opacity: aiLoading ? 0.6 : 1
                        }}
                      >
                        {aiLoading ? 'Analyzing...' : 'Run AI Analysis (5 credits)'}
                      </button>
                    </div>
                  )}

                  {aiError && (
                    <div style={{ padding: '12px', backgroundColor: 'rgba(239,68,68,0.1)', border: '1px solid #ef4444', borderRadius: '8px', color: '#ef4444', fontSize: '14px', marginBottom: '20px' }}>
                      {aiError}
                    </div>
                  )}

                  {aiAnalysis && (
                    <div>
                      {/* Recommendation Badge */}
                      <div style={{ marginBottom: '24px', textAlign: 'center' }}>
                        <div style={{
                          display: 'inline-block',
                          padding: '16px 32px',
                          borderRadius: '12px',
                          fontSize: '24px',
                          fontWeight: '700',
                          backgroundColor:
                            aiAnalysis.recommendation === 'STRONG_BUY' ? 'rgba(34,197,94,0.2)' :
                            aiAnalysis.recommendation === 'BUY' ? 'rgba(34,197,94,0.15)' :
                            aiAnalysis.recommendation === 'MAYBE' ? 'rgba(234,179,8,0.15)' : 'rgba(239,68,68,0.15)',
                          color:
                            aiAnalysis.recommendation === 'STRONG_BUY' ? '#22c55e' :
                            aiAnalysis.recommendation === 'BUY' ? '#4ade80' :
                            aiAnalysis.recommendation === 'MAYBE' ? '#eab308' : '#ef4444',
                          border: `2px solid ${
                            aiAnalysis.recommendation === 'STRONG_BUY' ? '#22c55e' :
                            aiAnalysis.recommendation === 'BUY' ? '#4ade80' :
                            aiAnalysis.recommendation === 'MAYBE' ? '#eab308' : '#ef4444'
                          }`
                        }}>
                          {aiAnalysis.recommendation.replace(/_/g, ' ')}
                        </div>
                        <div style={{ marginTop: '12px', fontSize: '14px', color: theme.textMuted }}>
                          Confidence: {aiAnalysis.confidence_score}%
                        </div>
                      </div>

                      {/* Key Metrics */}
                      <div style={{ display: 'grid', gridTemplateColumns: 'repeat(auto-fit, minmax(160px, 1fr))', gap: '12px', marginBottom: '24px' }}>
                        <div style={{ padding: '20px', backgroundColor: isDark ? theme.bg : '#f8fafc', borderRadius: '10px', textAlign: 'center', border: '2px solid #22c55e' }}>
                          <div style={{ fontSize: '11px', color: theme.textMuted, marginBottom: '8px' }}>ESTIMATED PROFIT</div>
                          <div style={{ fontSize: '28px', fontWeight: '700', color: '#22c55e' }}>
                            ${aiAnalysis.estimated_profit?.toLocaleString() || 'N/A'}
                          </div>
                        </div>
                        <div style={{ padding: '20px', backgroundColor: isDark ? theme.bg : '#f8fafc', borderRadius: '10px', textAlign: 'center' }}>
                          <div style={{ fontSize: '11px', color: theme.textMuted, marginBottom: '8px' }}>RECON COST</div>
                          <div style={{ fontSize: '28px', fontWeight: '700', color: theme.text }}>
                            ${aiAnalysis.estimated_recon_cost?.toLocaleString() || 'N/A'}
                          </div>
                        </div>
                        <div style={{ padding: '20px', backgroundColor: isDark ? theme.bg : '#f8fafc', borderRadius: '10px', textAlign: 'center' }}>
                          <div style={{ fontSize: '11px', color: theme.textMuted, marginBottom: '8px' }}>DAYS TO SELL</div>
                          <div style={{ fontSize: '28px', fontWeight: '700', color: theme.text }}>
                            {aiAnalysis.estimated_days_to_sell || 'N/A'}
                          </div>
                        </div>
                        <div style={{ padding: '20px', backgroundColor: isDark ? theme.bg : '#f8fafc', borderRadius: '10px', textAlign: 'center' }}>
                          <div style={{ fontSize: '11px', color: theme.textMuted, marginBottom: '8px' }}>BHPH SCORE</div>
                          <div style={{ fontSize: '28px', fontWeight: '700', color: aiAnalysis.bhph_score >= 7 ? '#22c55e' : aiAnalysis.bhph_score >= 5 ? '#eab308' : '#ef4444' }}>
                            {aiAnalysis.bhph_score || 'N/A'}/10
                          </div>
                        </div>
                      </div>

                      {/* Target Prices */}
                      <div style={{ display: 'grid', gridTemplateColumns: '1fr 1fr', gap: '12px', marginBottom: '24px' }}>
                        <div style={{ padding: '16px', backgroundColor: isDark ? theme.bg : '#f8fafc', borderRadius: '10px', border: '1px solid #22c55e' }}>
                          <div style={{ fontSize: '11px', color: theme.textMuted, marginBottom: '8px' }}>TARGET PURCHASE PRICE</div>
                          <div style={{ fontSize: '24px', fontWeight: '700', color: '#22c55e' }}>
                            ${aiAnalysis.target_purchase_price?.toLocaleString() || 'N/A'}
                          </div>
                        </div>
                        <div style={{ padding: '16px', backgroundColor: isDark ? theme.bg : '#f8fafc', borderRadius: '10px', border: '1px solid #3b82f6' }}>
                          <div style={{ fontSize: '11px', color: theme.textMuted, marginBottom: '8px' }}>TARGET SALE PRICE</div>
                          <div style={{ fontSize: '24px', fontWeight: '700', color: '#3b82f6' }}>
                            ${aiAnalysis.target_sale_price?.toLocaleString() || 'N/A'}
                          </div>
                        </div>
                      </div>

                      {/* Key Reasons */}
                      {aiAnalysis.key_reasons && aiAnalysis.key_reasons.length > 0 && (
                        <div style={{ marginBottom: '20px' }}>
                          <h4 style={{ color: theme.text, marginBottom: '12px', fontSize: '14px', fontWeight: '600' }}>✅ Key Reasons to Buy</h4>
                          <div style={{ display: 'flex', flexDirection: 'column', gap: '8px' }}>
                            {aiAnalysis.key_reasons.map((reason, i) => (
                              <div key={i} style={{ padding: '12px', backgroundColor: 'rgba(34,197,94,0.1)', borderRadius: '8px', color: '#22c55e', fontSize: '13px', display: 'flex', gap: '8px' }}>
                                <span>•</span>
                                <span>{reason}</span>
                              </div>
                            ))}
                          </div>
                        </div>
                      )}

                      {/* Risks */}
                      {aiAnalysis.risks && aiAnalysis.risks.length > 0 && (
                        <div style={{ marginBottom: '20px' }}>
                          <h4 style={{ color: theme.text, marginBottom: '12px', fontSize: '14px', fontWeight: '600' }}>⚠️ Potential Risks</h4>
                          <div style={{ display: 'flex', flexDirection: 'column', gap: '8px' }}>
                            {aiAnalysis.risks.map((risk, i) => (
                              <div key={i} style={{ padding: '12px', backgroundColor: 'rgba(234,179,8,0.1)', borderRadius: '8px', color: '#eab308', fontSize: '13px', display: 'flex', gap: '8px' }}>
                                <span>•</span>
                                <span>{risk}</span>
                              </div>
                            ))}
                          </div>
                        </div>
                      )}

                      {/* Profit Calculator */}
                      <div style={{ marginTop: '32px', padding: '20px', backgroundColor: isDark ? theme.bg : '#f8fafc', borderRadius: '12px', border: '2px solid #3b82f6' }}>
                        <h4 style={{ color: theme.text, marginBottom: '16px', fontSize: '16px', fontWeight: '600' }}>
                          💰 Profit Calculator
                        </h4>
                        <div style={{ display: 'grid', gridTemplateColumns: 'repeat(auto-fit, minmax(120px, 1fr))', gap: '12px', marginBottom: '16px' }}>
                          <div>
                            <label style={{ fontSize: '11px', color: theme.textMuted, display: 'block', marginBottom: '4px' }}>Buy Price</label>
                            <input
                              type="number"
                              value={buyPrice}
                              onChange={(e) => setBuyPrice(e.target.value)}
                              placeholder="0"
                              style={{
                                width: '100%',
                                padding: '10px',
                                borderRadius: '6px',
                                border: `1px solid ${theme.border}`,
                                backgroundColor: theme.bgCard,
                                color: theme.text,
                                fontSize: '14px'
                              }}
                            />
                          </div>
                          <div>
                            <label style={{ fontSize: '11px', color: theme.textMuted, display: 'block', marginBottom: '4px' }}>Recon Cost</label>
                            <input
                              type="number"
                              value={reconCost}
                              onChange={(e) => setReconCost(e.target.value)}
                              placeholder="0"
                              style={{
                                width: '100%',
                                padding: '10px',
                                borderRadius: '6px',
                                border: `1px solid ${theme.border}`,
                                backgroundColor: theme.bgCard,
                                color: theme.text,
                                fontSize: '14px'
                              }}
                            />
                          </div>
                          <div>
                            <label style={{ fontSize: '11px', color: theme.textMuted, display: 'block', marginBottom: '4px' }}>Target Sale Price</label>
                            <input
                              type="number"
                              value={targetSalePrice}
                              onChange={(e) => setTargetSalePrice(e.target.value)}
                              placeholder="0"
                              style={{
                                width: '100%',
                                padding: '10px',
                                borderRadius: '6px',
                                border: `1px solid ${theme.border}`,
                                backgroundColor: theme.bgCard,
                                color: theme.text,
                                fontSize: '14px'
                              }}
                            />
                          </div>
                        </div>

                        {/* Calculated Results */}
                        {(buyPrice || reconCost || targetSalePrice) && (() => {
                          const { grossProfit, roi, margin } = calculateProfit();
                          return (
                            <div style={{ display: 'grid', gridTemplateColumns: 'repeat(3, 1fr)', gap: '12px', marginTop: '16px' }}>
                              <div style={{ padding: '16px', backgroundColor: grossProfit >= 0 ? 'rgba(34,197,94,0.1)' : 'rgba(239,68,68,0.1)', borderRadius: '8px', textAlign: 'center' }}>
                                <div style={{ fontSize: '11px', color: theme.textMuted, marginBottom: '4px' }}>GROSS PROFIT</div>
                                <div style={{ fontSize: '24px', fontWeight: '700', color: grossProfit >= 0 ? '#22c55e' : '#ef4444' }}>
                                  ${grossProfit.toLocaleString()}
                                </div>
                              </div>
                              <div style={{ padding: '16px', backgroundColor: isDark ? 'rgba(255,255,255,0.03)' : 'rgba(0,0,0,0.03)', borderRadius: '8px', textAlign: 'center' }}>
                                <div style={{ fontSize: '11px', color: theme.textMuted, marginBottom: '4px' }}>ROI</div>
                                <div style={{ fontSize: '24px', fontWeight: '700', color: theme.text }}>
                                  {roi.toFixed(1)}%
                                </div>
                              </div>
                              <div style={{ padding: '16px', backgroundColor: isDark ? 'rgba(255,255,255,0.03)' : 'rgba(0,0,0,0.03)', borderRadius: '8px', textAlign: 'center' }}>
                                <div style={{ fontSize: '11px', color: theme.textMuted, marginBottom: '4px' }}>MARGIN</div>
                                <div style={{ fontSize: '24px', fontWeight: '700', color: theme.text }}>
                                  {margin.toFixed(1)}%
                                </div>
                              </div>
                            </div>
                          );
                        })()}
                      </div>

                      {/* Re-run Button */}
                      <div style={{ marginTop: '24px', textAlign: 'center' }}>
                        <button
                          onClick={runAiAnalysis}
                          disabled={aiLoading}
                          style={{
                            ...btnStyle(false),
                            padding: '8px 20px',
                            fontSize: '12px',
                            opacity: aiLoading ? 0.6 : 1
                          }}
                        >
                          Re-run Analysis (5 credits)
                        </button>
                      </div>
                    </div>
                  )}
                </div>
              )}
            </div>
          </>
        )}

        {/* FIND COMPARABLES SECTION - NEW */}
        <div data-section="comparables" style={{ ...cardStyle, marginTop: '24px', border: '2px solid #22c55e' }}>
          <div style={{ display: 'flex', alignItems: 'center', gap: '8px', marginBottom: '16px' }}>
            <svg width="20" height="20" viewBox="0 0 24 24" fill="none" stroke="#22c55e" strokeWidth="2">
              <rect x="3" y="3" width="7" height="7"/><rect x="14" y="3" width="7" height="7"/>
              <rect x="14" y="14" width="7" height="7"/><rect x="3" y="14" width="7" height="7"/>
            </svg>
            <h3 style={{ margin: 0, color: '#22c55e', fontSize: '16px', fontWeight: '600' }}>Find Comparables</h3>
          </div>

          <div style={{ display: 'grid', gridTemplateColumns: 'repeat(auto-fit, minmax(120px, 1fr))', gap: '12px', marginBottom: '16px' }}>
            <div>
              <label style={{ fontSize: '11px', color: theme.textMuted, display: 'block', marginBottom: '4px' }}>Year Min</label>
              <input type="number" value={compYearMin} onChange={(e) => setCompYearMin(e.target.value)} placeholder="2018" style={inputStyle} />
            </div>
            <div>
              <label style={{ fontSize: '11px', color: theme.textMuted, display: 'block', marginBottom: '4px' }}>Year Max</label>
              <input type="number" value={compYearMax} onChange={(e) => setCompYearMax(e.target.value)} placeholder="2024" style={inputStyle} />
            </div>
            <div>
              <label style={{ fontSize: '11px', color: theme.textMuted, display: 'block', marginBottom: '4px' }}>Make</label>
              <select value={compMake} onChange={(e) => setCompMake(e.target.value)} style={selectStyle}>
                <option value="">Any Make</option>
                {MAKES.map(m => <option key={m} value={m}>{m}</option>)}
              </select>
            </div>
            <div>
              <label style={{ fontSize: '11px', color: theme.textMuted, display: 'block', marginBottom: '4px' }}>Model</label>
              <select value={compModel} onChange={(e) => setCompModel(e.target.value)} style={selectStyle} disabled={!compMake}>
                <option value="">Any Model</option>
                {compModels.map(m => <option key={m} value={m}>{m}</option>)}
              </select>
            </div>
            <div>
              <label style={{ fontSize: '11px', color: theme.textMuted, display: 'block', marginBottom: '4px' }}>Max Price</label>
              <input type="number" value={compMaxPrice} onChange={(e) => setCompMaxPrice(e.target.value)} placeholder="30000" style={inputStyle} />
            </div>
            <div>
              <label style={{ fontSize: '11px', color: theme.textMuted, display: 'block', marginBottom: '4px' }}>Max Miles</label>
              <input type="number" value={compMaxMiles} onChange={(e) => setCompMaxMiles(e.target.value)} placeholder="100000" style={inputStyle} />
            </div>
            <div>
              <label style={{ fontSize: '11px', color: theme.textMuted, display: 'block', marginBottom: '4px' }}>Radius</label>
              <select value={compRadius} onChange={(e) => setCompRadius(e.target.value)} style={selectStyle}>
                {RADIUS_OPTIONS.map(r => <option key={r.value} value={r.value}>{r.label}</option>)}
              </select>
            </div>
          </div>

          <button
            onClick={handleComparablesSearch}
            disabled={compLoading}
            style={{ ...btnStyle(true), backgroundColor: '#22c55e', padding: '12px 32px', opacity: compLoading ? 0.6 : 1 }}
          >
            {compLoading ? 'Searching...' : 'Search Comparables'}
          </button>

          {compError && (
            <div style={{ marginTop: '12px', padding: '12px', backgroundColor: 'rgba(239,68,68,0.1)', border: '1px solid #ef4444', borderRadius: '8px', color: '#ef4444', fontSize: '14px' }}>
              {compError}
            </div>
          )}

          {compResults && (
            <div style={{ marginTop: '16px' }}>
              {/* Market Summary */}
              {compResults.market_summary && (compResults.market_summary.avg_price || compResults.market_summary.total_available > 0) && (
                <div style={{
                  display: 'grid',
                  gridTemplateColumns: 'repeat(auto-fit, minmax(100px, 1fr))',
                  gap: '12px',
                  marginBottom: '20px',
                  padding: '16px',
                  backgroundColor: isDark ? theme.bg : '#f8fafc',
                  borderRadius: '10px',
                  border: `1px solid ${theme.border}`
                }}>
                  <div style={{ textAlign: 'center' }}>
                    <div style={{ fontSize: '10px', color: theme.textMuted, textTransform: 'uppercase', marginBottom: '4px' }}>Avg Price</div>
                    <div style={{ fontSize: '18px', fontWeight: '700', color: theme.text }}>{formatCurrency(compResults.market_summary.avg_price)}</div>
                  </div>
                  <div style={{ textAlign: 'center' }}>
                    <div style={{ fontSize: '10px', color: theme.textMuted, textTransform: 'uppercase', marginBottom: '4px' }}>Median</div>
                    <div style={{ fontSize: '18px', fontWeight: '700', color: theme.text }}>{formatCurrency(compResults.market_summary.median_price)}</div>
                  </div>
                  <div style={{ textAlign: 'center' }}>
                    <div style={{ fontSize: '10px', color: theme.textMuted, textTransform: 'uppercase', marginBottom: '4px' }}>Range</div>
                    <div style={{ fontSize: '14px', fontWeight: '600', color: theme.text }}>
                      {compResults.market_summary.price_range ? `${formatCurrency(compResults.market_summary.price_range.low)} - ${formatCurrency(compResults.market_summary.price_range.high)}` : 'N/A'}
                    </div>
                  </div>
                  <div style={{ textAlign: 'center' }}>
                    <div style={{ fontSize: '10px', color: theme.textMuted, textTransform: 'uppercase', marginBottom: '4px' }}>Available</div>
                    <div style={{ fontSize: '18px', fontWeight: '700', color: '#22c55e' }}>{compResults.market_summary.total_available || 0}</div>
                  </div>
                  {compResults.market_summary.avg_days_on_market && (
                    <div style={{ textAlign: 'center' }}>
                      <div style={{ fontSize: '10px', color: theme.textMuted, textTransform: 'uppercase', marginBottom: '4px' }}>Avg DOM</div>
                      <div style={{ fontSize: '18px', fontWeight: '700', color: theme.text }}>{compResults.market_summary.avg_days_on_market}</div>
                    </div>
                  )}
                </div>
              )}

              {/* AI Guidance if no listings */}
              {compResults.ai_guidance && (
                <div style={{
                  padding: '16px',
                  backgroundColor: 'rgba(59,130,246,0.1)',
                  border: '1px solid #3b82f6',
                  borderRadius: '10px',
                  marginBottom: '20px'
                }}>
                  <div style={{ fontSize: '12px', color: '#3b82f6', fontWeight: '600', marginBottom: '8px' }}>AI Market Insights</div>
                  <div style={{ fontSize: '13px', color: theme.text, lineHeight: '1.6', whiteSpace: 'pre-wrap' }}>{compResults.ai_guidance}</div>
                </div>
              )}

              {/* Results Count */}
              <div style={{ fontSize: '13px', color: theme.textMuted, marginBottom: '12px' }}>
                {compResults.total_found || 0} vehicles found
                {compResults.dealer_listings?.length > 0 && ` (${compResults.dealer_listings.length} dealer`}
                {compResults.private_listings?.length > 0 && `, ${compResults.private_listings.length} private)`}
                {compResults.dealer_listings?.length > 0 && !compResults.private_listings?.length && ')'}
              </div>

              {/* Dealer Listings */}
              {compResults.dealer_listings?.length > 0 && (
                <div style={{ marginBottom: '24px' }}>
                  <div style={{ fontSize: '14px', fontWeight: '600', color: theme.text, marginBottom: '12px', display: 'flex', alignItems: 'center', gap: '8px' }}>
                    <span style={{ padding: '3px 8px', backgroundColor: 'rgba(59,130,246,0.15)', color: '#3b82f6', borderRadius: '4px', fontSize: '11px' }}>DEALER</span>
                    {compResults.dealer_listings.length} listings
                  </div>
                  <div style={{ display: 'grid', gap: '10px' }}>
                    {compResults.dealer_listings.map((c, i) => {
                      const dealStyle = getDealScoreStyle(c.deal_score);
                      return (
                        <div key={i} style={{
                          backgroundColor: isDark ? theme.bg : '#f8fafc',
                          padding: '14px',
                          borderRadius: '10px',
                          border: c.deal_score === 'GREAT DEAL' ? `2px solid ${dealStyle.border}` : `1px solid ${theme.border}`,
                          display: 'flex',
                          justifyContent: 'space-between',
                          alignItems: 'center',
                          flexWrap: 'wrap',
                          gap: '12px'
                        }}>
                          <div style={{ flex: 1, minWidth: '200px' }}>
                            <div style={{ display: 'flex', alignItems: 'center', gap: '8px', flexWrap: 'wrap', marginBottom: '4px' }}>
                              <span style={{ color: theme.text, fontWeight: '600', fontSize: '14px' }}>
                                {c.year} {c.make} {c.model} {c.trim || ''}
                              </span>
                              {c.deal_score && c.deal_score !== 'UNKNOWN' && (
                                <span style={{
                                  fontSize: '10px',
                                  fontWeight: '700',
                                  padding: '2px 6px',
                                  borderRadius: '4px',
                                  backgroundColor: dealStyle.bg,
                                  color: dealStyle.color
                                }}>
                                  {c.deal_score}
                                </span>
                              )}
                            </div>
                            <div style={{ color: theme.textMuted, fontSize: '12px' }}>
                              {c.miles && <span>{formatNumber(c.miles)} mi</span>}
                              {c.miles && c.location && <span> • </span>}
                              {c.location && <span>{c.location}</span>}
                              {c.days_listed > 0 && <span> • {c.days_listed} days listed</span>}
                            </div>
                            {c.dealer_name && <div style={{ color: theme.textMuted, fontSize: '11px', marginTop: '2px' }}>{c.dealer_name}</div>}
                            {c.savings !== 0 && c.savings !== undefined && (
                              <div style={{ fontSize: '11px', marginTop: '4px', color: c.savings > 0 ? '#22c55e' : '#ef4444' }}>
                                {c.savings > 0 ? `$${formatNumber(c.savings)} under market` : `$${formatNumber(Math.abs(c.savings))} over market`}
                              </div>
                            )}
                          </div>
                          <div style={{ display: 'flex', alignItems: 'center', gap: '12px' }}>
                            <div style={{ textAlign: 'right' }}>
                              <div style={{ color: dealStyle.color, fontWeight: '700', fontSize: '20px' }}>{formatCurrency(c.price)}</div>
                              {c.market_value && (
                                <div style={{ fontSize: '11px', color: theme.textMuted }}>Market: {formatCurrency(c.market_value)}</div>
                              )}
                            </div>
                            {c.url && (
                              <a href={c.url} target="_blank" rel="noopener noreferrer" style={{ padding: '8px 12px', backgroundColor: '#3b82f6', color: '#fff', borderRadius: '6px', textDecoration: 'none', fontSize: '12px', fontWeight: '600' }}>
                                View
                              </a>
                            )}
                          </div>
                        </div>
                      );
                    })}
                  </div>
                </div>
              )}

              {/* Private Listings */}
              {compResults.private_listings?.length > 0 && (
                <div>
                  <div style={{ fontSize: '14px', fontWeight: '600', color: theme.text, marginBottom: '12px', display: 'flex', alignItems: 'center', gap: '8px' }}>
                    <span style={{ padding: '3px 8px', backgroundColor: 'rgba(34,197,94,0.15)', color: '#22c55e', borderRadius: '4px', fontSize: '11px' }}>PRIVATE</span>
                    {compResults.private_listings.length} listings
                  </div>
                  <div style={{ display: 'grid', gap: '10px' }}>
                    {compResults.private_listings.map((c, i) => {
                      const dealStyle = getDealScoreStyle(c.estimated_deal_score);
                      return (
                        <div key={i} style={{
                          backgroundColor: isDark ? theme.bg : '#f8fafc',
                          padding: '14px',
                          borderRadius: '10px',
                          border: `1px solid ${theme.border}`,
                          display: 'flex',
                          justifyContent: 'space-between',
                          alignItems: 'center',
                          flexWrap: 'wrap',
                          gap: '12px'
                        }}>
                          <div style={{ flex: 1, minWidth: '200px' }}>
                            <div style={{ display: 'flex', alignItems: 'center', gap: '8px', flexWrap: 'wrap', marginBottom: '4px' }}>
                              <span style={{ color: theme.text, fontWeight: '600', fontSize: '14px' }}>
                                {c.title || `${c.year || ''} ${c.make} ${c.model}`}
                              </span>
                              <span style={{
                                fontSize: '9px',
                                fontWeight: '600',
                                padding: '2px 6px',
                                borderRadius: '4px',
                                backgroundColor: c.source === 'FB Marketplace' ? 'rgba(59,130,246,0.15)' : c.source === 'Craigslist' ? 'rgba(139,92,246,0.15)' : 'rgba(249,115,22,0.15)',
                                color: c.source === 'FB Marketplace' ? '#3b82f6' : c.source === 'Craigslist' ? '#8b5cf6' : '#f97316'
                              }}>
                                {c.source}
                              </span>
                              {c.estimated_deal_score && (
                                <span style={{
                                  fontSize: '10px',
                                  fontWeight: '700',
                                  padding: '2px 6px',
                                  borderRadius: '4px',
                                  backgroundColor: dealStyle.bg,
                                  color: dealStyle.color
                                }}>
                                  {c.estimated_deal_score}
                                </span>
                              )}
                            </div>
                            <div style={{ color: theme.textMuted, fontSize: '12px' }}>
                              {c.miles && <span>{formatNumber(c.miles)} mi</span>}
                              {c.miles && c.location && <span> • </span>}
                              {c.location && <span>{c.location}</span>}
                            </div>
                          </div>
                          <div style={{ display: 'flex', alignItems: 'center', gap: '12px' }}>
                            {c.thumbnail && (
                              <img src={c.thumbnail} alt="" style={{ width: '60px', height: '45px', objectFit: 'cover', borderRadius: '4px' }} />
                            )}
                            <div style={{ color: '#22c55e', fontWeight: '700', fontSize: '20px' }}>{c.price ? formatCurrency(c.price) : 'Contact'}</div>
                            {c.url && (
                              <a href={c.url} target="_blank" rel="noopener noreferrer" style={{ padding: '8px 12px', backgroundColor: '#22c55e', color: '#fff', borderRadius: '6px', textDecoration: 'none', fontSize: '12px', fontWeight: '600' }}>
                                View
                              </a>
                            )}
                          </div>
                        </div>
                      );
                    })}
                  </div>
                </div>
              )}

              {/* No results */}
              {compResults.total_found === 0 && !compResults.ai_guidance && (
                <div style={{ color: theme.textMuted, padding: '24px', textAlign: 'center', backgroundColor: isDark ? theme.bg : '#f8fafc', borderRadius: '10px' }}>
                  No vehicles found matching your criteria
                </div>
              )}
            </div>
          )}
        </div>

      </div>
    </div>
  );
}
