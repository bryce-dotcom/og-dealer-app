// Major markets for vehicle searches
// Each market searches 100 mile radius (MarketCheck limit)

export const MARKETS = {
  // Utah
  'Salt Lake City, UT': '84101',
  'Provo, UT': '84601',
  'Ogden, UT': '84401',
  'St. George, UT': '84770',

  // Nearby Major Cities (within driving distance)
  'Las Vegas, NV': '89101',
  'Denver, CO': '80201',
  'Phoenix, AZ': '85001',
  'Boise, ID': '83701',
  'Albuquerque, NM': '87101',

  // Major Truck Markets
  'Dallas, TX': '75201',
  'Houston, TX': '77001',
  'Oklahoma City, OK': '73101',
  'Kansas City, MO': '64101',
  'Cheyenne, WY': '82001',
};

export const MARKET_GROUPS = {
  'Utah': ['Salt Lake City, UT', 'Provo, UT', 'Ogden, UT', 'St. George, UT'],
  'Mountain West': ['Salt Lake City, UT', 'Denver, CO', 'Boise, ID', 'Las Vegas, NV'],
  'Southwest': ['Phoenix, AZ', 'Las Vegas, NV', 'Albuquerque, NM', 'St. George, UT'],
  'Major Truck Markets': ['Dallas, TX', 'Houston, TX', 'Oklahoma City, OK', 'Denver, CO'],
};
