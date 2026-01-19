export async function decodeVIN(vin) {
  if (!vin || vin.length !== 17) {
    return { error: 'VIN must be exactly 17 characters' };
  }

  try {
    const response = await fetch(
      `https://vpic.nhtsa.dot.gov/api/vehicles/decodevin/${vin}?format=json`
    );
    const data = await response.json();
    
    if (!data.Results) {
      return { error: 'Invalid response from NHTSA' };
    }

    const getValue = (name) => {
      const item = data.Results.find(r => r.Variable === name);
      if (!item || !item.Value || item.Value.trim() === '' || item.Value === 'Not Applicable') {
        return '';
      }
      return item.Value.trim();
    };

    const decoded = {
      vin: vin.toUpperCase(),
      year: getValue('Model Year'),
      make: getValue('Make'),
      model: getValue('Model'),
      trim: getValue('Trim') || getValue('Series'),
      body_class: getValue('Body Class'),
      doors: getValue('Doors'),
      drive_type: getValue('Drive Type'),
      engine_cylinders: getValue('Engine Number of Cylinders'),
      engine_displacement: getValue('Displacement (L)'),
      fuel_type: getValue('Fuel Type - Primary'),
      transmission: getValue('Transmission Style'),
      vehicle_type: getValue('Vehicle Type'),
    };

    if (!decoded.make) {
      return { error: 'Could not decode VIN. Make sure it is correct.' };
    }

    if (!decoded.model) {
      decoded.model = decoded.vehicle_type || 'Unknown';
    }

    if (!decoded.year) {
      decoded.year = '';
    }

    return { success: true, data: decoded };
    
  } catch (err) {
    return { error: 'Network error: ' + err.message };
  }
}