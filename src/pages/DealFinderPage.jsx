import { useState, useEffect } from 'react';
import { supabase } from '../lib/supabase';
import { useStore } from '../lib/store';

export default function DealFinderPage() {
  const { dealer } = useStore();
  const [searches, setSearches] = useState([]);
  const [dealAlerts, setDealAlerts] = useState([]);
  const [loading, setLoading] = useState(true);
  const [showAddSearch, setShowAddSearch] = useState(false);
  const [filter, setFilter] = useState('new'); // new, all, interested, passed
  const [selectedSearch, setSelectedSearch] = useState(null);
  const [runningSearch, setRunningSearch] = useState(false);
  const [saveError, setSaveError] = useState(null);
  const [saving, setSaving] = useState(false);

  // Form state
  const [formData, setFormData] = useState({
    name: '',
    year_min: '',
    year_max: '',
    make: '',
    model: '',
    trim: '',
    engine_type: '',
    drivetrain: '',
    transmission: '',
    body_type: '',
    cab_type: '',
    bed_length: '',
    max_price: '',
    max_miles: '',
    zip_code: dealer?.zip || '84065',
    radius_miles: 250,
    bhph_preferred: false,
    active: true,
  });

  useEffect(() => {
    if (dealer?.id) {
      loadData();
    }
  }, [dealer?.id]);

  const loadData = async () => {
    setLoading(true);
    await Promise.all([loadSearches(), loadDealAlerts()]);
    setLoading(false);
  };

  const loadSearches = async () => {
    const { data, error } = await supabase
      .from('saved_vehicle_searches')
      .select('*')
      .eq('dealer_id', dealer.id)
      .order('created_at', { ascending: false });

    if (!error && data) {
      setSearches(data);
    }
  };

  const loadDealAlerts = async () => {
    let query = supabase
      .from('deal_alerts')
      .select('*')
      .eq('dealer_id', dealer.id);

    if (filter === 'new') {
      query = query.eq('status', 'new');
    } else if (filter === 'interested') {
      query = query.eq('status', 'interested');
    } else if (filter === 'passed') {
      query = query.eq('status', 'passed');
    }

    query = query.order('created_at', { ascending: false }).limit(50);

    const { data, error } = await query;

    if (!error && data) {
      setDealAlerts(data);
    }
  };

  useEffect(() => {
    if (dealer?.id) {
      loadDealAlerts();
    }
  }, [filter]);

  const handleSaveSearch = async (e) => {
    e.preventDefault();
    setSaveError(null);
    setSaving(true);

    try {
      // Validate required fields
      if (!formData.name || !formData.name.trim()) {
        setSaveError('Search name is required');
        setSaving(false);
        return;
      }

      if (!formData.make || !formData.make.trim()) {
        setSaveError('Make is required');
        setSaving(false);
        return;
      }

      const payload = {
        ...formData,
        dealer_id: dealer.id,
        year_min: formData.year_min ? parseInt(formData.year_min) : null,
        year_max: formData.year_max ? parseInt(formData.year_max) : null,
        max_price: formData.max_price ? parseInt(formData.max_price) : null,
        max_miles: formData.max_miles ? parseInt(formData.max_miles) : null,
      };

      if (selectedSearch) {
        // Update
        const { error } = await supabase
          .from('saved_vehicle_searches')
          .update(payload)
          .eq('id', selectedSearch.id);

        if (error) {
          console.error('Update error:', error);
          setSaveError(error.message || 'Failed to update search');
          setSaving(false);
          return;
        }

        loadSearches();
        setShowAddSearch(false);
        setSelectedSearch(null);
        resetForm();
        setSaveError(null);
      } else {
        // Insert
        const { error } = await supabase
          .from('saved_vehicle_searches')
          .insert(payload);

        if (error) {
          console.error('Insert error:', error);
          setSaveError(error.message || 'Failed to create search');
          setSaving(false);
          return;
        }

        loadSearches();
        setShowAddSearch(false);
        resetForm();
        setSaveError(null);
      }
    } catch (err) {
      console.error('Save search error:', err);
      setSaveError(err.message || 'An unexpected error occurred');
    } finally {
      setSaving(false);
    }
  };

  const resetForm = () => {
    setFormData({
      name: '',
      year_min: '',
      year_max: '',
      make: '',
      model: '',
      trim: '',
      engine_type: '',
      drivetrain: '',
      transmission: '',
      body_type: '',
      cab_type: '',
      bed_length: '',
      max_price: '',
      max_miles: '',
      zip_code: dealer?.zip || '84065',
      radius_miles: 250,
      bhph_preferred: false,
      active: true,
    });
  };

  const handleEditSearch = (search) => {
    setSelectedSearch(search);
    setFormData({
      name: search.name,
      year_min: search.year_min || '',
      year_max: search.year_max || '',
      make: search.make,
      model: search.model || '',
      trim: search.trim || '',
      engine_type: search.engine_type || '',
      drivetrain: search.drivetrain || '',
      transmission: search.transmission || '',
      body_type: search.body_type || '',
      cab_type: search.cab_type || '',
      bed_length: search.bed_length || '',
      max_price: search.max_price || '',
      max_miles: search.max_miles || '',
      zip_code: search.zip_code,
      radius_miles: search.radius_miles,
      bhph_preferred: search.bhph_preferred,
      active: search.active,
    });
    setShowAddSearch(true);
    setSaveError(null);
  };

  const handleDeleteSearch = async (id) => {
    if (!confirm('Delete this saved search?')) return;

    const { error } = await supabase
      .from('saved_vehicle_searches')
      .delete()
      .eq('id', id);

    if (!error) {
      loadSearches();
    }
  };

  const handleToggleActive = async (search) => {
    const { error } = await supabase
      .from('saved_vehicle_searches')
      .update({ active: !search.active })
      .eq('id', search.id);

    if (!error) {
      loadSearches();
    }
  };

  const handleRunAllSearches = async () => {
    if (!confirm('This will run all active searches and find deals. This may take a few minutes. Continue?')) {
      return;
    }

    setRunningSearch(true);
    try {
      const { data, error } = await supabase.functions.invoke('run-my-searches', {
        body: { dealer_id: dealer.id }
      });

      console.log('Edge Function response:', { data, error });

      if (error) {
        console.error('Edge Function error details:', JSON.stringify(error, null, 2));
        throw error;
      }

      if (!data) {
        throw new Error('No data returned from Edge Function');
      }

      if (!data.success) {
        throw new Error(data.error || 'Edge Function returned success=false');
      }

      if (data.deals_found === 0) {
        alert(data.message || `Search complete! No new deals found. Try adjusting your search criteria.`);
      } else {
        alert(`Search complete! Found ${data.deals_found} new deals!`);
      }

      await loadDealAlerts();
    } catch (error) {
      console.error('Error running searches:', error);
      console.error('Error details:', JSON.stringify(error, null, 2));
      alert('Error running searches: ' + (error.message || JSON.stringify(error)));
    } finally {
      setRunningSearch(false);
    }
  };

  const updateDealStatus = async (dealId, status) => {
    const { error } = await supabase
      .from('deal_alerts')
      .update({
        status,
        actioned_at: new Date().toISOString(),
        viewed_at: status === 'viewed' ? new Date().toISOString() : undefined,
      })
      .eq('id', dealId);

    if (!error) {
      loadDealAlerts();
    }
  };

  const markAsViewed = async (dealId) => {
    const { error } = await supabase
      .from('deal_alerts')
      .update({ viewed_at: new Date().toISOString() })
      .eq('id', dealId)
      .is('viewed_at', null);

    if (!error) {
      loadDealAlerts();
    }
  };

  const inputStyle = {
    width: '100%',
    padding: '10px 12px',
    backgroundColor: '#18181b',
    border: '1px solid #3f3f46',
    borderRadius: '8px',
    color: '#fff',
    fontSize: '14px',
    outline: 'none',
  };

  const buttonStyle = (primary = false) => ({
    padding: '10px 20px',
    backgroundColor: primary ? '#f97316' : '#27272a',
    color: '#fff',
    border: 'none',
    borderRadius: '8px',
    fontWeight: '600',
    cursor: 'pointer',
    fontSize: '14px',
  });

  const cardStyle = {
    backgroundColor: '#18181b',
    border: '1px solid #27272a',
    borderRadius: '12px',
    padding: '20px',
    marginBottom: '16px',
  };

  if (loading) {
    return (
      <div style={{ padding: '24px', color: '#fff' }}>
        <div>Loading Deal Finder...</div>
      </div>
    );
  }

  const newDealsCount = dealAlerts.filter(d => d.status === 'new').length;

  return (
    <div style={{ padding: '24px', backgroundColor: '#09090b', minHeight: '100vh' }}>
      <div style={{ maxWidth: '1400px', margin: '0 auto' }}>
        {/* Header */}
        <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'center', marginBottom: '32px' }}>
          <div>
            <h1 style={{ fontSize: '28px', fontWeight: '700', color: '#fff', margin: 0 }}>
              Deal Finder
            </h1>
            <p style={{ color: '#71717a', margin: '4px 0 0', fontSize: '14px' }}>
              AI finds good deals for you automatically (runs daily at 3am)
            </p>
          </div>
          <div style={{ display: 'flex', gap: '12px' }}>
            <button
              onClick={handleRunAllSearches}
              disabled={runningSearch || searches.filter(s => s.active).length === 0}
              style={{
                ...buttonStyle(false),
                opacity: runningSearch || searches.filter(s => s.active).length === 0 ? 0.5 : 1,
                cursor: runningSearch || searches.filter(s => s.active).length === 0 ? 'not-allowed' : 'pointer'
              }}
            >
              {runningSearch ? '🔄 Searching...' : '⚡ Run All Searches Now'}
            </button>
            <button onClick={() => { setShowAddSearch(true); setSelectedSearch(null); resetForm(); setSaveError(null); }} style={buttonStyle(true)}>
              + New Search
            </button>
          </div>
        </div>

        <div style={{ display: 'grid', gridTemplateColumns: '350px 1fr', gap: '24px' }}>
          {/* Left: Saved Searches */}
          <div>
            <h2 style={{ fontSize: '18px', fontWeight: '600', color: '#fff', marginBottom: '16px' }}>
              Saved Searches ({searches.length})
            </h2>

            {searches.map(search => (
              <div key={search.id} style={cardStyle}>
                <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'start', marginBottom: '12px' }}>
                  <div style={{ flex: 1 }}>
                    <div style={{ fontSize: '16px', fontWeight: '600', color: '#fff', marginBottom: '4px' }}>
                      {search.name}
                    </div>
                    <div style={{ fontSize: '13px', color: '#71717a' }}>
                      {search.year_min && search.year_max ? `${search.year_min}-${search.year_max}` : search.year_min || search.year_max || 'Any year'} {search.make} {search.model || ''}
                    </div>
                    {(search.engine_type || search.drivetrain || search.transmission) && (
                      <div style={{ fontSize: '12px', color: '#a1a1aa', marginTop: '2px' }}>
                        {[
                          search.engine_type && search.engine_type.charAt(0).toUpperCase() + search.engine_type.slice(1),
                          search.drivetrain,
                          search.transmission && search.transmission.charAt(0).toUpperCase() + search.transmission.slice(1)
                        ].filter(Boolean).join(' • ')}
                      </div>
                    )}
                    {search.max_price && (
                      <div style={{ fontSize: '13px', color: '#71717a' }}>
                        Under ${search.max_price.toLocaleString()}
                      </div>
                    )}
                  </div>
                  <div style={{
                    padding: '4px 8px',
                    backgroundColor: search.active ? '#22c55e20' : '#71717a20',
                    color: search.active ? '#22c55e' : '#71717a',
                    borderRadius: '6px',
                    fontSize: '12px',
                    fontWeight: '600',
                  }}>
                    {search.active ? 'Active' : 'Paused'}
                  </div>
                </div>

                {search.last_run_at && (
                  <div style={{ fontSize: '12px', color: '#52525b', marginBottom: '12px' }}>
                    Last run: {new Date(search.last_run_at).toLocaleDateString()}
                  </div>
                )}

                <div style={{ display: 'flex', gap: '8px', marginTop: '12px' }}>
                  <button
                    onClick={() => handleToggleActive(search)}
                    style={{ ...buttonStyle(false), flex: 1, fontSize: '12px', padding: '6px 12px' }}
                  >
                    {search.active ? 'Pause' : 'Activate'}
                  </button>
                  <button
                    onClick={() => handleEditSearch(search)}
                    style={{ ...buttonStyle(false), fontSize: '12px', padding: '6px 12px' }}
                  >
                    Edit
                  </button>
                  <button
                    onClick={() => handleDeleteSearch(search.id)}
                    style={{ ...buttonStyle(false), fontSize: '12px', padding: '6px 12px', backgroundColor: '#ef444420', color: '#ef4444' }}
                  >
                    Delete
                  </button>
                </div>
              </div>
            ))}

            {searches.length === 0 && (
              <div style={{ ...cardStyle, textAlign: 'center', color: '#71717a' }}>
                No saved searches yet. Create one to start finding deals!
              </div>
            )}
          </div>

          {/* Right: Deal Alerts */}
          <div>
            <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'center', marginBottom: '16px' }}>
              <h2 style={{ fontSize: '18px', fontWeight: '600', color: '#fff', margin: 0 }}>
                Deal Alerts {newDealsCount > 0 && (
                  <span style={{
                    marginLeft: '8px',
                    padding: '4px 10px',
                    backgroundColor: '#f9731620',
                    color: '#f97316',
                    borderRadius: '12px',
                    fontSize: '14px',
                    fontWeight: '700',
                  }}>
                    {newDealsCount} new
                  </span>
                )}
              </h2>

              <div style={{ display: 'flex', gap: '8px' }}>
                {['new', 'all', 'interested', 'passed'].map(f => (
                  <button
                    key={f}
                    onClick={() => setFilter(f)}
                    style={{
                      ...buttonStyle(false),
                      padding: '6px 12px',
                      fontSize: '13px',
                      backgroundColor: filter === f ? '#f97316' : '#27272a',
                    }}
                  >
                    {f === 'new' ? 'New' : f === 'all' ? 'All' : f.charAt(0).toUpperCase() + f.slice(1)}
                  </button>
                ))}
              </div>
            </div>

            {dealAlerts.map(deal => {
              const recommendationColor =
                deal.recommendation === 'STRONG BUY' ? '#22c55e' :
                deal.recommendation === 'BUY' ? '#3b82f6' :
                deal.recommendation === 'MAYBE' ? '#eab308' : '#71717a';

              return (
                <div
                  key={deal.id}
                  style={cardStyle}
                  onClick={() => markAsViewed(deal.id)}
                >
                  {/* Header */}
                  <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'start', marginBottom: '12px' }}>
                    <div style={{ flex: 1 }}>
                      <div style={{ fontSize: '18px', fontWeight: '600', color: '#fff', marginBottom: '4px' }}>
                        {deal.year} {deal.make} {deal.model} {deal.trim || ''}
                      </div>
                      <div style={{ fontSize: '13px', color: '#71717a' }}>
                        {deal.source} • {deal.seller_type} • {deal.location}
                      </div>
                    </div>
                    {deal.recommendation && (
                      <div style={{
                        padding: '6px 12px',
                        backgroundColor: recommendationColor + '20',
                        color: recommendationColor,
                        borderRadius: '8px',
                        fontSize: '12px',
                        fontWeight: '700',
                        whiteSpace: 'nowrap',
                      }}>
                        {deal.recommendation}
                      </div>
                    )}
                  </div>

                  {/* Price & Savings */}
                  <div style={{ display: 'grid', gridTemplateColumns: 'repeat(4, 1fr)', gap: '16px', marginBottom: '16px' }}>
                    <div>
                      <div style={{ fontSize: '11px', color: '#71717a', marginBottom: '4px' }}>Price</div>
                      <div style={{ fontSize: '20px', fontWeight: '700', color: '#fff' }}>
                        ${deal.price?.toLocaleString()}
                      </div>
                    </div>
                    <div>
                      <div style={{ fontSize: '11px', color: '#71717a', marginBottom: '4px' }}>MMR Value</div>
                      <div style={{ fontSize: '16px', fontWeight: '600', color: '#a1a1aa' }}>
                        ${deal.mmr?.toLocaleString()}
                      </div>
                    </div>
                    <div>
                      <div style={{ fontSize: '11px', color: '#71717a', marginBottom: '4px' }}>Savings</div>
                      <div style={{ fontSize: '16px', fontWeight: '700', color: '#22c55e' }}>
                        ${deal.savings?.toLocaleString()} ({deal.savings_percentage}%)
                      </div>
                    </div>
                    <div>
                      <div style={{ fontSize: '11px', color: '#71717a', marginBottom: '4px' }}>Est. Profit</div>
                      <div style={{ fontSize: '16px', fontWeight: '700', color: '#f97316' }}>
                        {deal.estimated_profit ? `$${deal.estimated_profit.toLocaleString()}` : 'N/A'}
                      </div>
                    </div>
                  </div>

                  {/* Details */}
                  <div style={{ display: 'grid', gridTemplateColumns: 'repeat(3, 1fr)', gap: '12px', marginBottom: '16px', fontSize: '13px' }}>
                    <div>
                      <span style={{ color: '#71717a' }}>Miles:</span> <span style={{ color: '#fff', fontWeight: '600' }}>{deal.miles?.toLocaleString() || 'Unknown'}</span>
                    </div>
                    {deal.bhph_score && (
                      <div>
                        <span style={{ color: '#71717a' }}>BHPH Score:</span> <span style={{ color: '#fff', fontWeight: '600' }}>{deal.bhph_score}/10</span>
                      </div>
                    )}
                    {deal.deal_score && (
                      <div>
                        <span style={{ color: '#71717a' }}>Deal:</span> <span style={{ color: '#22c55e', fontWeight: '600' }}>{deal.deal_score}</span>
                      </div>
                    )}
                  </div>

                  {/* AI Reasoning */}
                  {deal.ai_reasoning && (
                    <div style={{ marginBottom: '16px' }}>
                      {deal.ai_reasoning.key_reasons && deal.ai_reasoning.key_reasons.length > 0 && (
                        <div style={{ marginBottom: '8px' }}>
                          <div style={{ fontSize: '12px', color: '#71717a', marginBottom: '4px', fontWeight: '600' }}>Why buy:</div>
                          {deal.ai_reasoning.key_reasons.map((reason, i) => (
                            <div key={i} style={{ fontSize: '13px', color: '#a1a1aa', marginLeft: '8px' }}>
                              ✓ {reason}
                            </div>
                          ))}
                        </div>
                      )}
                      {deal.ai_reasoning.risks && deal.ai_reasoning.risks.length > 0 && (
                        <div>
                          <div style={{ fontSize: '12px', color: '#71717a', marginBottom: '4px', fontWeight: '600' }}>Risks:</div>
                          {deal.ai_reasoning.risks.map((risk, i) => (
                            <div key={i} style={{ fontSize: '13px', color: '#a1a1aa', marginLeft: '8px' }}>
                              ⚠ {risk}
                            </div>
                          ))}
                        </div>
                      )}
                    </div>
                  )}

                  {/* Actions */}
                  <div style={{ display: 'flex', gap: '8px' }}>
                    {deal.url && (
                      <a href={deal.url} target="_blank" rel="noopener noreferrer" style={{ flex: 1 }}>
                        <button style={{ ...buttonStyle(true), width: '100%' }}>
                          View Listing
                        </button>
                      </a>
                    )}
                    {deal.status === 'new' && (
                      <>
                        <button
                          onClick={() => updateDealStatus(deal.id, 'interested')}
                          style={{ ...buttonStyle(false), flex: 1, backgroundColor: '#3b82f620', color: '#3b82f6' }}
                        >
                          Interested
                        </button>
                        <button
                          onClick={() => updateDealStatus(deal.id, 'passed')}
                          style={{ ...buttonStyle(false), backgroundColor: '#71717a20', color: '#71717a' }}
                        >
                          Pass
                        </button>
                      </>
                    )}
                  </div>

                  {/* Timestamp */}
                  <div style={{ marginTop: '12px', fontSize: '11px', color: '#52525b', textAlign: 'right' }}>
                    Found {new Date(deal.created_at).toLocaleDateString()} at {new Date(deal.created_at).toLocaleTimeString()}
                  </div>
                </div>
              );
            })}

            {dealAlerts.length === 0 && (
              <div style={{ ...cardStyle, textAlign: 'center', color: '#71717a', padding: '40px' }}>
                <div style={{ fontSize: '16px', marginBottom: '8px' }}>No deals yet</div>
                <div style={{ fontSize: '14px' }}>
                  {filter === 'new' ? 'Create a saved search and AI will find deals for you automatically!' : 'No deals in this filter'}
                </div>
              </div>
            )}
          </div>
        </div>
      </div>

      {/* Add/Edit Search Modal */}
      {showAddSearch && (
        <div style={{
          position: 'fixed',
          top: 0,
          left: 0,
          right: 0,
          bottom: 0,
          backgroundColor: 'rgba(0,0,0,0.7)',
          display: 'flex',
          alignItems: 'center',
          justifyContent: 'center',
          zIndex: 1000,
        }}>
          <div style={{
            backgroundColor: '#18181b',
            borderRadius: '16px',
            padding: '32px',
            maxWidth: '600px',
            width: '90%',
            maxHeight: '90vh',
            overflow: 'auto',
          }}>
            <h2 style={{ fontSize: '24px', fontWeight: '700', color: '#fff', marginBottom: '24px' }}>
              {selectedSearch ? 'Edit Search' : 'New Saved Search'}
            </h2>

            <form onSubmit={handleSaveSearch}>
              <div style={{ marginBottom: '16px' }}>
                <label style={{ display: 'block', color: '#a1a1aa', fontSize: '13px', marginBottom: '6px' }}>
                  Search Name *
                </label>
                <input
                  type="text"
                  value={formData.name}
                  onChange={(e) => setFormData({ ...formData, name: e.target.value })}
                  placeholder="e.g., F-150s for BHPH"
                  style={inputStyle}
                  required
                />
              </div>

              <div style={{ display: 'grid', gridTemplateColumns: '1fr 1fr', gap: '16px', marginBottom: '16px' }}>
                <div>
                  <label style={{ display: 'block', color: '#a1a1aa', fontSize: '13px', marginBottom: '6px' }}>
                    Year Min
                  </label>
                  <input
                    type="number"
                    value={formData.year_min}
                    onChange={(e) => setFormData({ ...formData, year_min: e.target.value })}
                    placeholder="2020"
                    style={inputStyle}
                  />
                </div>
                <div>
                  <label style={{ display: 'block', color: '#a1a1aa', fontSize: '13px', marginBottom: '6px' }}>
                    Year Max
                  </label>
                  <input
                    type="number"
                    value={formData.year_max}
                    onChange={(e) => setFormData({ ...formData, year_max: e.target.value })}
                    placeholder="2024"
                    style={inputStyle}
                  />
                </div>
              </div>

              <div style={{ marginBottom: '16px' }}>
                <label style={{ display: 'block', color: '#a1a1aa', fontSize: '13px', marginBottom: '6px' }}>
                  Make *
                </label>
                <input
                  type="text"
                  value={formData.make}
                  onChange={(e) => setFormData({ ...formData, make: e.target.value })}
                  placeholder="Ford"
                  style={inputStyle}
                  required
                />
              </div>

              <div style={{ display: 'grid', gridTemplateColumns: '1fr 1fr', gap: '16px', marginBottom: '16px' }}>
                <div>
                  <label style={{ display: 'block', color: '#a1a1aa', fontSize: '13px', marginBottom: '6px' }}>
                    Model
                  </label>
                  <input
                    type="text"
                    value={formData.model}
                    onChange={(e) => setFormData({ ...formData, model: e.target.value })}
                    placeholder="F-150"
                    style={inputStyle}
                  />
                  <div style={{ fontSize: '11px', color: '#71717a', marginTop: '4px' }}>
                    💡 Tip: Use commas for multiple (e.g., "2500, 3500")
                  </div>
                </div>
                <div>
                  <label style={{ display: 'block', color: '#a1a1aa', fontSize: '13px', marginBottom: '6px' }}>
                    Trim
                  </label>
                  <input
                    type="text"
                    value={formData.trim}
                    onChange={(e) => setFormData({ ...formData, trim: e.target.value })}
                    placeholder="Lariat"
                    style={inputStyle}
                  />
                </div>
              </div>

              {/* Specific filters */}
              <div style={{ display: 'grid', gridTemplateColumns: '1fr 1fr', gap: '16px', marginBottom: '16px' }}>
                <div>
                  <label style={{ display: 'block', color: '#a1a1aa', fontSize: '13px', marginBottom: '6px' }}>
                    Engine Type
                  </label>
                  <select
                    value={formData.engine_type}
                    onChange={(e) => setFormData({ ...formData, engine_type: e.target.value })}
                    style={inputStyle}
                  >
                    <option value="">Any</option>
                    <option value="gas">Gas</option>
                    <option value="diesel">Diesel</option>
                    <option value="electric">Electric</option>
                    <option value="hybrid">Hybrid</option>
                    <option value="flex-fuel">Flex Fuel</option>
                  </select>
                </div>
                <div>
                  <label style={{ display: 'block', color: '#a1a1aa', fontSize: '13px', marginBottom: '6px' }}>
                    Drivetrain
                  </label>
                  <select
                    value={formData.drivetrain}
                    onChange={(e) => setFormData({ ...formData, drivetrain: e.target.value })}
                    style={inputStyle}
                  >
                    <option value="">Any</option>
                    <option value="2WD">2WD</option>
                    <option value="4WD">4WD</option>
                    <option value="AWD">AWD</option>
                  </select>
                </div>
              </div>

              <div style={{ display: 'grid', gridTemplateColumns: '1fr 1fr', gap: '16px', marginBottom: '16px' }}>
                <div>
                  <label style={{ display: 'block', color: '#a1a1aa', fontSize: '13px', marginBottom: '6px' }}>
                    Transmission
                  </label>
                  <select
                    value={formData.transmission}
                    onChange={(e) => setFormData({ ...formData, transmission: e.target.value })}
                    style={inputStyle}
                  >
                    <option value="">Any</option>
                    <option value="automatic">Automatic</option>
                    <option value="manual">Manual</option>
                    <option value="CVT">CVT</option>
                  </select>
                </div>
                <div>
                  <label style={{ display: 'block', color: '#a1a1aa', fontSize: '13px', marginBottom: '6px' }}>
                    Body Type
                  </label>
                  <select
                    value={formData.body_type}
                    onChange={(e) => setFormData({ ...formData, body_type: e.target.value })}
                    style={inputStyle}
                  >
                    <option value="">Any</option>
                    <option value="sedan">Sedan</option>
                    <option value="coupe">Coupe</option>
                    <option value="SUV">SUV</option>
                    <option value="truck">Truck</option>
                    <option value="van">Van</option>
                    <option value="wagon">Wagon</option>
                    <option value="hatchback">Hatchback</option>
                  </select>
                </div>
              </div>

              {/* Truck-specific filters */}
              <div style={{ display: 'grid', gridTemplateColumns: '1fr 1fr', gap: '16px', marginBottom: '16px' }}>
                <div>
                  <label style={{ display: 'block', color: '#a1a1aa', fontSize: '13px', marginBottom: '6px' }}>
                    Cab Type (trucks)
                  </label>
                  <select
                    value={formData.cab_type}
                    onChange={(e) => setFormData({ ...formData, cab_type: e.target.value })}
                    style={inputStyle}
                  >
                    <option value="">Any</option>
                    <option value="crew cab">Crew Cab</option>
                    <option value="extended cab">Extended Cab</option>
                    <option value="regular cab">Regular Cab</option>
                    <option value="mega cab">Mega Cab</option>
                  </select>
                </div>
                <div>
                  <label style={{ display: 'block', color: '#a1a1aa', fontSize: '13px', marginBottom: '6px' }}>
                    Bed Length (trucks)
                  </label>
                  <select
                    value={formData.bed_length}
                    onChange={(e) => setFormData({ ...formData, bed_length: e.target.value })}
                    style={inputStyle}
                  >
                    <option value="">Any</option>
                    <option value="short">Short Bed (5-6ft)</option>
                    <option value="standard">Standard Bed (6-7ft)</option>
                    <option value="long">Long Bed (8ft+)</option>
                  </select>
                </div>
              </div>

              <div style={{ display: 'grid', gridTemplateColumns: '1fr 1fr', gap: '16px', marginBottom: '16px' }}>
                <div>
                  <label style={{ display: 'block', color: '#a1a1aa', fontSize: '13px', marginBottom: '6px' }}>
                    Max Price
                  </label>
                  <input
                    type="number"
                    value={formData.max_price}
                    onChange={(e) => setFormData({ ...formData, max_price: e.target.value })}
                    placeholder="30000"
                    style={inputStyle}
                  />
                </div>
                <div>
                  <label style={{ display: 'block', color: '#a1a1aa', fontSize: '13px', marginBottom: '6px' }}>
                    Max Miles
                  </label>
                  <input
                    type="number"
                    value={formData.max_miles}
                    onChange={(e) => setFormData({ ...formData, max_miles: e.target.value })}
                    placeholder="80000"
                    style={inputStyle}
                  />
                </div>
              </div>

              <div style={{ marginBottom: '16px' }}>
                <label style={{ display: 'flex', alignItems: 'center', color: '#fff', cursor: 'pointer' }}>
                  <input
                    type="checkbox"
                    checked={formData.bhph_preferred}
                    onChange={(e) => setFormData({ ...formData, bhph_preferred: e.target.checked })}
                    style={{ marginRight: '8px' }}
                  />
                  BHPH Preferred (prioritize good financing candidates)
                </label>
              </div>

              {saveError && (
                <div style={{
                  padding: '12px',
                  backgroundColor: 'rgba(239,68,68,0.1)',
                  border: '1px solid #ef4444',
                  borderRadius: '8px',
                  color: '#ef4444',
                  fontSize: '14px',
                  marginBottom: '16px'
                }}>
                  {saveError}
                </div>
              )}

              <div style={{ display: 'flex', gap: '12px', marginTop: '24px' }}>
                <button
                  type="submit"
                  disabled={saving}
                  style={{ ...buttonStyle(true), flex: 1, opacity: saving ? 0.6 : 1 }}
                >
                  {saving ? 'Saving...' : (selectedSearch ? 'Update Search' : 'Create Search')}
                </button>
                <button
                  type="button"
                  onClick={() => {
                    setShowAddSearch(false);
                    setSelectedSearch(null);
                    resetForm();
                    setSaveError(null);
                  }}
                  style={{ ...buttonStyle(false) }}
                  disabled={saving}
                >
                  Cancel
                </button>
              </div>
            </form>
          </div>
        </div>
      )}
    </div>
  );
}
