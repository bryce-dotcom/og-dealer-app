import { serve } from "https://deno.land/std@0.168.0/http/server.ts";

const corsHeaders = {
  "Access-Control-Allow-Origin": "*",
  "Access-Control-Allow-Headers": "authorization, x-client-info, apikey, content-type",
};

// Mileage adjustment (per 1000 miles from base of 60,000)
const getMileageAdjustment = (baseMiles: number, actualMiles: number, baseValue: number) => {
  const diff = actualMiles - baseMiles;
  const perThousand = baseValue * 0.005; // 0.5% per 1000 miles
  return Math.round((diff / 1000) * perThousand * -1);
};

// Condition adjustments
const CONDITION_ADJUSTMENTS: Record<string, number> = {
  'excellent': 0.08,
  'good': 0,
  'fair': -0.10,
  'poor': -0.25,
};

serve(async (req) => {
  if (req.method === "OPTIONS") {
    return new Response(null, { headers: corsHeaders });
  }

  try {
    const { vin, year, make, model, trim, miles, condition } = await req.json();

    const MARKETCHECK_API_KEY = Deno.env.get("MARKETCHECK_API_KEY");

    let vehicleInfo: any = { year, make, model, trim, miles: miles || 60000 };

    // Decode VIN using NHTSA if provided
    if (vin && vin.length === 17) {
      console.log(`Decoding VIN via NHTSA: ${vin}`);
      try {
        const vinRes = await fetch(
          `https://vpic.nhtsa.dot.gov/api/vehicles/decodevin/${vin}?format=json`
        );
        if (vinRes.ok) {
          const vinData = await vinRes.json();

          const getValue = (name: string) => {
            const item = vinData.Results?.find((r: any) => r.Variable === name);
            if (!item || !item.Value || item.Value.trim() === '' || item.Value === 'Not Applicable') {
              return '';
            }
            return item.Value.trim();
          };

          const decodedYear = getValue('Model Year');
          const decodedMake = getValue('Make');
          const decodedModel = getValue('Model');

          if (decodedMake && decodedModel) {
            vehicleInfo = {
              vin,
              year: parseInt(decodedYear) || year,
              make: decodedMake || make,
              model: decodedModel || model,
              trim: getValue('Trim') || getValue('Series') || trim,
              body_type: getValue('Body Class'),
              engine: `${getValue('Engine Number of Cylinders')} cyl ${getValue('Displacement (L)')}L`,
              transmission: getValue('Transmission Style'),
              drivetrain: getValue('Drive Type'),
              fuel_type: getValue('Fuel Type - Primary'),
              miles: miles || 60000
            };
          }
        }
      } catch (err) {
        console.error("NHTSA VIN decode error:", err);
      }
    }

    // Get market data from MarketCheck
    let marketData: any = null;
    const searchYear = vehicleInfo.year || year;
    const searchMake = vehicleInfo.make || make;
    const searchModel = vehicleInfo.model || model;

    if (MARKETCHECK_API_KEY && searchYear && searchMake && searchModel) {
      const yearMin = parseInt(searchYear) - 1;
      const yearMax = parseInt(searchYear) + 1;

      try {
        const params = new URLSearchParams({
          api_key: MARKETCHECK_API_KEY,
          year_gte: yearMin.toString(),
          year_lte: yearMax.toString(),
          make: searchMake,
          model: searchModel,
          car_type: 'used',
          rows: '1',
          stats: 'price,miles'
        });

        const searchRes = await fetch(
          `https://api.marketcheck.com/v2/search/car/active?${params}`
        );

        if (searchRes.ok) {
          const searchData = await searchRes.json();
          if (searchData.stats?.price) {
            marketData = {
              count: searchData.num_found,
              avgPrice: Math.round(searchData.stats.price.mean),
              medianPrice: Math.round(searchData.stats.price.median),
              minPrice: searchData.stats.price.min,
              maxPrice: searchData.stats.price.max,
              avgMiles: searchData.stats.miles?.mean ? Math.round(searchData.stats.miles.mean) : null
            };
          }
        }
      } catch (err) {
        console.error("MarketCheck error:", err);
      }
    }

    // Calculate values
    const baseMiles = 60000;
    const actualMiles = miles || 60000;
    const vehicleCondition = (condition || 'good').toLowerCase();

    let baseValue = 15000; // Default estimate

    if (marketData?.medianPrice) {
      // Use market median as base for wholesale calculation
      baseValue = Math.round(marketData.medianPrice * 0.82); // Wholesale is ~82% of retail median
    } else {
      // Fallback: estimate based on year
      const yearFactor = Math.max(0.3, 1 - (new Date().getFullYear() - (vehicleInfo.year || 2020)) * 0.08);
      baseValue = Math.round(25000 * yearFactor * 0.82);
    }

    // Apply adjustments
    const mileageAdj = getMileageAdjustment(baseMiles, actualMiles, baseValue);
    const conditionAdj = Math.round(baseValue * (CONDITION_ADJUSTMENTS[vehicleCondition] || 0));

    const wholesaleValue = baseValue + mileageAdj + conditionAdj;
    const retailValue = Math.round(wholesaleValue * 1.22);
    const tradeInValue = Math.round(wholesaleValue * 0.92);

    return new Response(
      JSON.stringify({
        success: true,
        vehicle: vehicleInfo,
        values: {
          wholesale: wholesaleValue,
          retail: retailValue,
          tradeIn: tradeInValue,
          adjustments: {
            mileage: mileageAdj,
            condition: conditionAdj
          }
        },
        market: marketData,
        confidence: marketData ? 'HIGH' : 'ESTIMATED'
      }),
      {
        headers: { ...corsHeaders, "Content-Type": "application/json" }
      }
    );
  } catch (error) {
    console.error("Error:", error.message);
    return new Response(
      JSON.stringify({ success: false, error: error.message }),
      {
        status: 500,
        headers: { ...corsHeaders, "Content-Type": "application/json" }
      }
    );
  }
});
