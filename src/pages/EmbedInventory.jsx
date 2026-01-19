import { useState, useEffect } from 'react';
import { useParams, useSearchParams } from 'react-router-dom';
import { supabase } from '../lib/supabase';

export default function EmbedInventory() {
  const { dealerId } = useParams();
  const [searchParams] = useSearchParams();
  
  // Customization from URL params
  const accentColor = searchParams.get('accent') || 'f97316';
  const bgColor = searchParams.get('bg') || '09090b';
  const cardColor = searchParams.get('card') || '18181b';
  const textColor = searchParams.get('text') || 'ffffff';
  const columns = parseInt(searchParams.get('cols')) || 3;
  const showPrice = searchParams.get('price') !== 'false';
  const showMiles = searchParams.get('miles') !== 'false';
  const maxItems = parseInt(searchParams.get('max')) || 50;
  
  const [inventory, setInventory] = useState([]);
  const [dealer, setDealer] = useState(null);
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState(null);
  
  // Detail modal state
  const [selectedVehicle, setSelectedVehicle] = useState(null);
  const [currentPhotoIndex, setCurrentPhotoIndex] = useState(0);

  useEffect(() => {
    loadData();
  }, [dealerId]);

  const loadData = async () => {
    try {
      // Get dealer info
      const { data: dealerData, error: dealerError } = await supabase
        .from('dealer_settings')
        .select('*')
        .eq('id', dealerId)
        .single();
      
      if (dealerError) throw new Error('Dealer not found');
      setDealer(dealerData);

      // Get for-sale inventory
      const { data: invData, error: invError } = await supabase
        .from('inventory')
        .select('*')
        .eq('dealer_id', dealerId)
        .eq('status', 'For Sale')
        .order('created_at', { ascending: false })
        .limit(maxItems);
      
      if (invError) throw invError;
      setInventory(invData || []);
    } catch (err) {
      setError(err.message);
    } finally {
      setLoading(false);
    }
  };

  const formatCurrency = (num) => {
    if (!num) return 'Call for Price';
    return new Intl.NumberFormat('en-US', { style: 'currency', currency: 'USD', maximumFractionDigits: 0 }).format(num);
  };

  const formatNumber = (num) => {
    if (!num) return '-';
    return new Intl.NumberFormat('en-US').format(num);
  };

  const theme = {
    bg: `#${bgColor}`,
    card: `#${cardColor}`,
    text: `#${textColor}`,
    accent: `#${accentColor}`,
    muted: '#a1a1aa',
    border: '#27272a'
  };

  // Responsive columns CSS
  const gridCols = {
    1: '1fr',
    2: 'repeat(2, 1fr)',
    3: 'repeat(auto-fill, minmax(280px, 1fr))',
    4: 'repeat(auto-fill, minmax(240px, 1fr))'
  };

  // Open detail modal
  const openDetail = (vehicle) => {
    setSelectedVehicle(vehicle);
    setCurrentPhotoIndex(0);
  };

  // Close detail modal
  const closeDetail = () => {
    setSelectedVehicle(null);
    setCurrentPhotoIndex(0);
  };

  // Photo navigation
  const nextPhoto = (e) => {
    e.stopPropagation();
    if (selectedVehicle?.photos?.length > 1) {
      setCurrentPhotoIndex((prev) => 
        prev === selectedVehicle.photos.length - 1 ? 0 : prev + 1
      );
    }
  };

  const prevPhoto = (e) => {
    e.stopPropagation();
    if (selectedVehicle?.photos?.length > 1) {
      setCurrentPhotoIndex((prev) => 
        prev === 0 ? selectedVehicle.photos.length - 1 : prev - 1
      );
    }
  };

  const goToPhoto = (index, e) => {
    e.stopPropagation();
    setCurrentPhotoIndex(index);
  };

  if (loading) {
    return (
      <div style={{ 
        backgroundColor: theme.bg, 
        color: theme.text, 
        padding: '40px', 
        textAlign: 'center',
        fontFamily: '-apple-system, BlinkMacSystemFont, "Segoe UI", Roboto, sans-serif',
        minHeight: '200px',
        display: 'flex',
        alignItems: 'center',
        justifyContent: 'center'
      }}>
        Loading inventory...
      </div>
    );
  }

  if (error) {
    return (
      <div style={{ 
        backgroundColor: theme.bg, 
        color: '#ef4444', 
        padding: '40px', 
        textAlign: 'center',
        fontFamily: '-apple-system, BlinkMacSystemFont, "Segoe UI", Roboto, sans-serif'
      }}>
        {error}
      </div>
    );
  }

  return (
    <div style={{ 
      backgroundColor: theme.bg, 
      padding: '20px',
      fontFamily: '-apple-system, BlinkMacSystemFont, "Segoe UI", Roboto, sans-serif',
      minHeight: '100%'
    }}>
      {/* Header */}
      <div style={{ marginBottom: '20px', textAlign: 'center' }}>
        <h2 style={{ 
          color: theme.text, 
          fontSize: '24px', 
          fontWeight: '700', 
          margin: '0 0 8px'
        }}>
          {dealer?.dealer_name || 'Our Inventory'}
        </h2>
        <p style={{ color: theme.muted, fontSize: '14px', margin: 0 }}>
          {inventory.length} vehicle{inventory.length !== 1 ? 's' : ''} available
        </p>
      </div>

      {/* Inventory Grid */}
      {inventory.length === 0 ? (
        <div style={{ 
          textAlign: 'center', 
          padding: '60px 20px',
          color: theme.muted 
        }}>
          No vehicles currently for sale. Check back soon!
        </div>
      ) : (
        <div style={{ 
          display: 'grid', 
          gridTemplateColumns: gridCols[columns] || gridCols[3],
          gap: '16px'
        }}>
          {inventory.map((v) => {
            const photo = v.photos && v.photos.length > 0 ? v.photos[0] : null;
            const photoCount = v.photos?.length || 0;
            return (
              <div 
                key={v.id} 
                onClick={() => openDetail(v)}
                style={{ 
                  backgroundColor: theme.card,
                  borderRadius: '12px',
                  overflow: 'hidden',
                  border: `1px solid ${theme.border}`,
                  cursor: 'pointer',
                  transition: 'transform 0.2s, box-shadow 0.2s'
                }}
                onMouseEnter={e => {
                  e.currentTarget.style.transform = 'translateY(-4px)';
                  e.currentTarget.style.boxShadow = '0 12px 40px rgba(0,0,0,0.3)';
                }}
                onMouseLeave={e => {
                  e.currentTarget.style.transform = 'translateY(0)';
                  e.currentTarget.style.boxShadow = 'none';
                }}
              >
                {/* Photo */}
                <div style={{ 
                  height: '180px', 
                  backgroundColor: '#27272a',
                  position: 'relative'
                }}>
                  {photo ? (
                    <img 
                      src={photo} 
                      alt={`${v.year} ${v.make} ${v.model}`}
                      style={{ 
                        width: '100%', 
                        height: '100%', 
                        objectFit: 'cover' 
                      }}
                    />
                  ) : (
                    <div style={{ 
                      width: '100%', 
                      height: '100%', 
                      display: 'flex', 
                      alignItems: 'center', 
                      justifyContent: 'center',
                      color: '#52525b',
                      fontSize: '14px'
                    }}>
                      No Photo
                    </div>
                  )}
                  
                  {/* Photo count badge */}
                  {photoCount > 1 && (
                    <div style={{
                      position: 'absolute',
                      top: '10px',
                      left: '10px',
                      backgroundColor: 'rgba(0,0,0,0.7)',
                      color: '#fff',
                      padding: '4px 8px',
                      borderRadius: '4px',
                      fontSize: '11px',
                      fontWeight: '600'
                    }}>
                      {photoCount} photos
                    </div>
                  )}
                  
                  {/* Price Badge */}
                  {showPrice && v.sale_price && (
                    <div style={{
                      position: 'absolute',
                      bottom: '10px',
                      right: '10px',
                      backgroundColor: theme.accent,
                      color: '#fff',
                      padding: '6px 12px',
                      borderRadius: '6px',
                      fontWeight: '700',
                      fontSize: '16px'
                    }}>
                      {formatCurrency(v.sale_price)}
                    </div>
                  )}
                </div>

                {/* Details */}
                <div style={{ padding: '16px' }}>
                  <h3 style={{ 
                    color: theme.text, 
                    fontSize: '17px', 
                    fontWeight: '600', 
                    margin: '0 0 4px'
                  }}>
                    {v.year} {v.make} {v.model}
                  </h3>
                  
                  {v.trim && (
                    <p style={{ 
                      color: theme.muted, 
                      fontSize: '13px', 
                      margin: '0 0 12px' 
                    }}>
                      {v.trim}
                    </p>
                  )}

                  <div style={{ 
                    display: 'flex', 
                    justifyContent: 'space-between',
                    alignItems: 'center',
                    borderTop: `1px solid ${theme.border}`,
                    paddingTop: '12px',
                    marginTop: '8px'
                  }}>
                    {showMiles && (
                      <div>
                        <div style={{ color: theme.muted, fontSize: '11px' }}>Mileage</div>
                        <div style={{ color: theme.text, fontSize: '14px', fontWeight: '500' }}>
                          {formatNumber(v.miles || v.mileage)} mi
                        </div>
                      </div>
                    )}
                    
                    {v.color && (
                      <div style={{ textAlign: 'right' }}>
                        <div style={{ color: theme.muted, fontSize: '11px' }}>Color</div>
                        <div style={{ color: theme.text, fontSize: '14px', fontWeight: '500' }}>
                          {v.color}
                        </div>
                      </div>
                    )}
                  </div>

                  {/* Click for details hint */}
                  <div style={{
                    marginTop: '12px',
                    textAlign: 'center',
                    fontSize: '12px',
                    color: theme.accent,
                    fontWeight: '500'
                  }}>
                    Click for details
                  </div>
                </div>
              </div>
            );
          })}
        </div>
      )}

      {/* Footer */}
      <div style={{ 
        marginTop: '24px', 
        textAlign: 'center',
        paddingTop: '16px',
        borderTop: `1px solid ${theme.border}`
      }}>
        {dealer?.address && (
          <p style={{ color: theme.muted, fontSize: '13px', margin: '0 0 4px' }}>
            {dealer.address}{dealer.city ? `, ${dealer.city}` : ''}{dealer.state ? `, ${dealer.state}` : ''} {dealer.zip || ''}
          </p>
        )}
        {dealer?.phone && (
          <p style={{ color: theme.accent, fontSize: '15px', fontWeight: '600', margin: '4px 0' }}>
            {dealer.phone}
          </p>
        )}
      </div>

      {/* Detail Modal */}
      {selectedVehicle && (
        <div 
          onClick={closeDetail}
          style={{
            position: 'fixed',
            inset: 0,
            backgroundColor: 'rgba(0,0,0,0.9)',
            zIndex: 1000,
            display: 'flex',
            alignItems: 'center',
            justifyContent: 'center',
            padding: '20px'
          }}
        >
          <div 
            onClick={e => e.stopPropagation()}
            style={{
              backgroundColor: theme.card,
              borderRadius: '16px',
              maxWidth: '600px',
              width: '100%',
              maxHeight: '90vh',
              overflow: 'hidden',
              display: 'flex',
              flexDirection: 'column'
            }}
          >
            {/* Photo Gallery */}
            <div style={{ 
              position: 'relative',
              height: '300px',
              backgroundColor: '#27272a',
              flexShrink: 0
            }}>
              {selectedVehicle.photos && selectedVehicle.photos.length > 0 ? (
                <>
                  <img 
                    src={selectedVehicle.photos[currentPhotoIndex]} 
                    alt={`${selectedVehicle.year} ${selectedVehicle.make} ${selectedVehicle.model}`}
                    style={{ 
                      width: '100%', 
                      height: '100%', 
                      objectFit: 'cover' 
                    }}
                  />
                  
                  {/* Navigation arrows */}
                  {selectedVehicle.photos.length > 1 && (
                    <>
                      <button
                        onClick={prevPhoto}
                        style={{
                          position: 'absolute',
                          left: '10px',
                          top: '50%',
                          transform: 'translateY(-50%)',
                          width: '44px',
                          height: '44px',
                          borderRadius: '50%',
                          backgroundColor: 'rgba(0,0,0,0.7)',
                          color: '#fff',
                          border: 'none',
                          cursor: 'pointer',
                          fontSize: '20px',
                          display: 'flex',
                          alignItems: 'center',
                          justifyContent: 'center'
                        }}
                      >
                        ‹
                      </button>
                      <button
                        onClick={nextPhoto}
                        style={{
                          position: 'absolute',
                          right: '10px',
                          top: '50%',
                          transform: 'translateY(-50%)',
                          width: '44px',
                          height: '44px',
                          borderRadius: '50%',
                          backgroundColor: 'rgba(0,0,0,0.7)',
                          color: '#fff',
                          border: 'none',
                          cursor: 'pointer',
                          fontSize: '20px',
                          display: 'flex',
                          alignItems: 'center',
                          justifyContent: 'center'
                        }}
                      >
                        ›
                      </button>
                    </>
                  )}
                  
                  {/* Photo counter */}
                  {selectedVehicle.photos.length > 1 && (
                    <div style={{
                      position: 'absolute',
                      bottom: '10px',
                      left: '50%',
                      transform: 'translateX(-50%)',
                      backgroundColor: 'rgba(0,0,0,0.7)',
                      color: '#fff',
                      padding: '6px 12px',
                      borderRadius: '20px',
                      fontSize: '13px',
                      fontWeight: '500'
                    }}>
                      {currentPhotoIndex + 1} / {selectedVehicle.photos.length}
                    </div>
                  )}

                  {/* Thumbnail dots */}
                  {selectedVehicle.photos.length > 1 && selectedVehicle.photos.length <= 10 && (
                    <div style={{
                      position: 'absolute',
                      bottom: '50px',
                      left: '50%',
                      transform: 'translateX(-50%)',
                      display: 'flex',
                      gap: '6px'
                    }}>
                      {selectedVehicle.photos.map((_, i) => (
                        <button
                          key={i}
                          onClick={(e) => goToPhoto(i, e)}
                          style={{
                            width: '10px',
                            height: '10px',
                            borderRadius: '50%',
                            border: 'none',
                            backgroundColor: i === currentPhotoIndex ? theme.accent : 'rgba(255,255,255,0.5)',
                            cursor: 'pointer',
                            padding: 0
                          }}
                        />
                      ))}
                    </div>
                  )}
                </>
              ) : (
                <div style={{ 
                  width: '100%', 
                  height: '100%', 
                  display: 'flex', 
                  alignItems: 'center', 
                  justifyContent: 'center',
                  color: '#52525b',
                  fontSize: '16px'
                }}>
                  No Photos Available
                </div>
              )}
              
              {/* Close button */}
              <button
                onClick={closeDetail}
                style={{
                  position: 'absolute',
                  top: '10px',
                  right: '10px',
                  width: '36px',
                  height: '36px',
                  borderRadius: '50%',
                  backgroundColor: 'rgba(0,0,0,0.7)',
                  color: '#fff',
                  border: 'none',
                  cursor: 'pointer',
                  fontSize: '20px',
                  display: 'flex',
                  alignItems: 'center',
                  justifyContent: 'center'
                }}
              >
                ×
              </button>
            </div>

            {/* Vehicle Details */}
            <div style={{ 
              padding: '20px',
              overflowY: 'auto',
              flex: 1
            }}>
              {/* Title & Price */}
              <div style={{ 
                display: 'flex', 
                justifyContent: 'space-between', 
                alignItems: 'flex-start',
                marginBottom: '16px',
                flexWrap: 'wrap',
                gap: '12px'
              }}>
                <div>
                  <h2 style={{ 
                    color: theme.text, 
                    fontSize: '22px', 
                    fontWeight: '700', 
                    margin: '0 0 4px' 
                  }}>
                    {selectedVehicle.year} {selectedVehicle.make} {selectedVehicle.model}
                  </h2>
                  {selectedVehicle.trim && (
                    <p style={{ color: theme.muted, fontSize: '15px', margin: 0 }}>
                      {selectedVehicle.trim}
                    </p>
                  )}
                </div>
                {showPrice && selectedVehicle.sale_price && (
                  <div style={{
                    backgroundColor: theme.accent,
                    color: '#fff',
                    padding: '8px 16px',
                    borderRadius: '8px',
                    fontWeight: '700',
                    fontSize: '20px'
                  }}>
                    {formatCurrency(selectedVehicle.sale_price)}
                  </div>
                )}
              </div>

              {/* Specs Grid */}
              <div style={{ 
                display: 'grid', 
                gridTemplateColumns: 'repeat(2, 1fr)', 
                gap: '12px',
                marginBottom: '20px'
              }}>
                {showMiles && (
                  <div style={{ 
                    backgroundColor: theme.bg, 
                    padding: '12px', 
                    borderRadius: '8px' 
                  }}>
                    <div style={{ color: theme.muted, fontSize: '11px', marginBottom: '4px', textTransform: 'uppercase' }}>Mileage</div>
                    <div style={{ color: theme.text, fontSize: '16px', fontWeight: '600' }}>
                      {formatNumber(selectedVehicle.miles || selectedVehicle.mileage)} mi
                    </div>
                  </div>
                )}
                {selectedVehicle.color && (
                  <div style={{ 
                    backgroundColor: theme.bg, 
                    padding: '12px', 
                    borderRadius: '8px' 
                  }}>
                    <div style={{ color: theme.muted, fontSize: '11px', marginBottom: '4px', textTransform: 'uppercase' }}>Color</div>
                    <div style={{ color: theme.text, fontSize: '16px', fontWeight: '600' }}>
                      {selectedVehicle.color}
                    </div>
                  </div>
                )}
                {selectedVehicle.stock_number && (
                  <div style={{ 
                    backgroundColor: theme.bg, 
                    padding: '12px', 
                    borderRadius: '8px' 
                  }}>
                    <div style={{ color: theme.muted, fontSize: '11px', marginBottom: '4px', textTransform: 'uppercase' }}>Stock #</div>
                    <div style={{ color: theme.text, fontSize: '16px', fontWeight: '600' }}>
                      {selectedVehicle.stock_number}
                    </div>
                  </div>
                )}
                {selectedVehicle.vin && (
                  <div style={{ 
                    backgroundColor: theme.bg, 
                    padding: '12px', 
                    borderRadius: '8px' 
                  }}>
                    <div style={{ color: theme.muted, fontSize: '11px', marginBottom: '4px', textTransform: 'uppercase' }}>VIN</div>
                    <div style={{ color: theme.text, fontSize: '13px', fontFamily: 'monospace' }}>
                      {selectedVehicle.vin}
                    </div>
                  </div>
                )}
              </div>

              {/* Description */}
              {selectedVehicle.description && (
                <div style={{ marginBottom: '20px' }}>
                  <div style={{ 
                    color: theme.muted, 
                    fontSize: '11px', 
                    marginBottom: '8px', 
                    textTransform: 'uppercase',
                    fontWeight: '600'
                  }}>
                    Description
                  </div>
                  <div style={{ 
                    color: theme.text, 
                    fontSize: '14px', 
                    lineHeight: '1.6',
                    whiteSpace: 'pre-wrap',
                    backgroundColor: theme.bg,
                    padding: '16px',
                    borderRadius: '8px'
                  }}>
                     {selectedVehicle.description || selectedVehicle.listing_description || `${selectedVehicle.year} ${selectedVehicle.make} ${selectedVehicle.model}${selectedVehicle.trim ? ' ' + selectedVehicle.trim : ''} with ${selectedVehicle.miles || selectedVehicle.mileage ? (selectedVehicle.miles || selectedVehicle.mileage).toLocaleString() + ' miles' : 'low miles'}. Contact us for more details!`}
                  </div>
                </div>
              )}

              {/* Call to Action */}
              <div style={{ 
                display: 'flex', 
                gap: '12px', 
                flexWrap: 'wrap' 
              }}>
                {dealer?.phone && (
                  <a 
                    href={`tel:${dealer.phone}`}
                    style={{
                      flex: 1,
                      minWidth: '140px',
                      padding: '14px',
                      backgroundColor: theme.accent,
                      color: '#fff',
                      textAlign: 'center',
                      borderRadius: '8px',
                      textDecoration: 'none',
                      fontWeight: '600',
                      fontSize: '15px',
                      display: 'flex',
                      alignItems: 'center',
                      justifyContent: 'center',
                      gap: '8px'
                    }}
                  >
                    <svg width="18" height="18" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2">
                      <path d="M22 16.92v3a2 2 0 0 1-2.18 2 19.79 19.79 0 0 1-8.63-3.07 19.5 19.5 0 0 1-6-6 19.79 19.79 0 0 1-3.07-8.67A2 2 0 0 1 4.11 2h3a2 2 0 0 1 2 1.72 12.84 12.84 0 0 0 .7 2.81 2 2 0 0 1-.45 2.11L8.09 9.91a16 16 0 0 0 6 6l1.27-1.27a2 2 0 0 1 2.11-.45 12.84 12.84 0 0 0 2.81.7A2 2 0 0 1 22 16.92z"/>
                    </svg>
                    Call Now
                  </a>
                )}
                {dealer?.email && (
                  <a 
                    href={`mailto:${dealer.email}?subject=Inquiry about ${selectedVehicle.year} ${selectedVehicle.make} ${selectedVehicle.model}`}
                    style={{
                      flex: 1,
                      minWidth: '140px',
                      padding: '14px',
                      backgroundColor: theme.bg,
                      color: theme.text,
                      textAlign: 'center',
                      borderRadius: '8px',
                      textDecoration: 'none',
                      fontWeight: '600',
                      fontSize: '15px',
                      border: `1px solid ${theme.border}`,
                      display: 'flex',
                      alignItems: 'center',
                      justifyContent: 'center',
                      gap: '8px'
                    }}
                  >
                    <svg width="18" height="18" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2">
                      <path d="M4 4h16c1.1 0 2 .9 2 2v12c0 1.1-.9 2-2 2H4c-1.1 0-2-.9-2-2V6c0-1.1.9-2 2-2z"/>
                      <polyline points="22,6 12,13 2,6"/>
                    </svg>
                    Email
                  </a>
                )}
              </div>

              {/* Dealer Info */}
              <div style={{
                marginTop: '20px',
                paddingTop: '16px',
                borderTop: `1px solid ${theme.border}`,
                textAlign: 'center'
              }}>
                <div style={{ color: theme.text, fontSize: '15px', fontWeight: '600', marginBottom: '4px' }}>
                  {dealer?.dealer_name}
                </div>
                {dealer?.address && (
                  <div style={{ color: theme.muted, fontSize: '13px' }}>
                    {dealer.address}{dealer.city ? `, ${dealer.city}` : ''}{dealer.state ? `, ${dealer.state}` : ''} {dealer.zip || ''}
                  </div>
                )}
              </div>
            </div>
          </div>
        </div>
      )}
    </div>
  );
}