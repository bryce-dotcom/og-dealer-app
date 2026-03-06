import { useState, useEffect } from 'react';
import { supabase } from '../lib/supabase';

export default function MarketplaceStatusBadge({ inventoryId, dealerId }) {
  const [listings, setListings] = useState([]);
  const [loading, setLoading] = useState(true);

  useEffect(() => {
    loadListings();
  }, [inventoryId]);

  async function loadListings() {
    try {
      const { data, error } = await supabase
        .from('marketplace_listings')
        .select('marketplace, status, error_message')
        .eq('dealer_id', dealerId)
        .eq('inventory_id', inventoryId);

      if (error) throw error;
      setListings(data || []);
    } catch (error) {
      console.error('Error loading marketplace listings:', error);
    } finally {
      setLoading(false);
    }
  }

  if (loading) {
    return (
      <div className="flex gap-2">
        <div className="w-20 h-5 bg-gray-200 animate-pulse rounded"></div>
      </div>
    );
  }

  if (listings.length === 0) {
    return null;
  }

  const getStatusIcon = (status) => {
    switch (status) {
      case 'active':
        return (
          <svg className="w-4 h-4 text-green-600" fill="currentColor" viewBox="0 0 20 20">
            <path fillRule="evenodd" d="M10 18a8 8 0 100-16 8 8 0 000 16zm3.707-9.293a1 1 0 00-1.414-1.414L9 10.586 7.707 9.293a1 1 0 00-1.414 1.414l2 2a1 1 0 001.414 0l4-4z" clipRule="evenodd" />
          </svg>
        );
      case 'pending':
        return (
          <svg className="w-4 h-4 text-yellow-600 animate-spin" fill="none" viewBox="0 0 24 24">
            <circle className="opacity-25" cx="12" cy="12" r="10" stroke="currentColor" strokeWidth="4"></circle>
            <path className="opacity-75" fill="currentColor" d="M4 12a8 8 0 018-8V0C5.373 0 0 5.373 0 12h4zm2 5.291A7.962 7.962 0 014 12H0c0 3.042 1.135 5.824 3 7.938l3-2.647z"></path>
          </svg>
        );
      case 'error':
        return (
          <svg className="w-4 h-4 text-red-600" fill="currentColor" viewBox="0 0 20 20">
            <path fillRule="evenodd" d="M10 18a8 8 0 100-16 8 8 0 000 16zM8.707 7.293a1 1 0 00-1.414 1.414L8.586 10l-1.293 1.293a1 1 0 101.414 1.414L10 11.414l1.293 1.293a1 1 0 001.414-1.414L11.414 10l1.293-1.293a1 1 0 00-1.414-1.414L10 8.586 8.707 7.293z" clipRule="evenodd" />
          </svg>
        );
      case 'sold':
        return (
          <svg className="w-4 h-4 text-gray-600" fill="currentColor" viewBox="0 0 20 20">
            <path fillRule="evenodd" d="M10 18a8 8 0 100-16 8 8 0 000 16zm1-11a1 1 0 10-2 0v2H7a1 1 0 100 2h2v2a1 1 0 102 0v-2h2a1 1 0 100-2h-2V7z" clipRule="evenodd" />
          </svg>
        );
      default:
        return null;
    }
  };

  const getMarketplaceName = (marketplace) => {
    switch (marketplace) {
      case 'facebook': return 'FB';
      case 'ksl': return 'KSL';
      case 'autotrader': return 'AT';
      default: return marketplace.toUpperCase();
    }
  };

  return (
    <div className="flex gap-2 items-center flex-wrap">
      {listings.map((listing) => (
        <div
          key={listing.marketplace}
          className={`flex items-center gap-1 px-2 py-1 rounded text-xs font-medium ${
            listing.status === 'active' ? 'bg-green-100 text-green-800' :
            listing.status === 'pending' ? 'bg-yellow-100 text-yellow-800' :
            listing.status === 'error' ? 'bg-red-100 text-red-800' :
            'bg-gray-100 text-gray-800'
          }`}
          title={listing.error_message || listing.status}
        >
          {getStatusIcon(listing.status)}
          <span>{getMarketplaceName(listing.marketplace)}</span>
        </div>
      ))}
    </div>
  );
}
