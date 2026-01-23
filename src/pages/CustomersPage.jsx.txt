import { useState, useEffect } from 'react';
import { useStore } from '../lib/store';
import { supabase } from '../lib/supabase';
import { useNavigate } from 'react-router-dom';

export default function CustomersPage() {
  const navigate = useNavigate();
  const { customers, dealerId, fetchAllData } = useStore();
  const [search, setSearch] = useState('');
  const [showAdd, setShowAdd] = useState(false);
  const [showDetail, setShowDetail] = useState(null);
  const [showAddRequest, setShowAddRequest] = useState(false);
  const [vehicleRequests, setVehicleRequests] = useState([]);
  const [newCustomer, setNewCustomer] = useState({ name: '', phone: '', email: '', address: '' });
  const [newRequest, setNewRequest] = useState({ year_min: '', year_max: '', make: '', model: '', max_price: '', max_miles: '', notes: '' });

  useEffect(() => {
    if (dealerId && (!customers || customers.length === 0)) {
      fetchAllData();
    }
    loadVehicleRequests();
  }, [dealerId]);

  const loadVehicleRequests = async () => {
    if (!dealerId) return;
    const { data } = await supabase
      .from('vehicle_requests')
      .select('*')
      .eq('dealer_id', dealerId)
      .order('created_at', { ascending: false });
    setVehicleRequests(data || []);
  };

  const filtered = customers.filter(c => 
    search === '' || 
    c.name?.toLowerCase().includes(search.toLowerCase()) ||
    c.phone?.includes(search) ||
    c.email?.toLowerCase().includes(search.toLowerCase())
  );

  const getCustomerRequests = (customerId) => {
    return vehicleRequests.filter(r => r.customer_id === customerId && r.status === 'Looking');
  };

  const customersLooking = customers.filter(c => getCustomerRequests(c.id).length > 0);

  const handleAdd = async () => {
    if (!newCustomer.name) { alert('Name required'); return; }
    const { error } = await supabase.from('customers').insert({ ...newCustomer, dealer_id: dealerId });
    if (error) { alert('Error: ' + error.message); return; }
    setNewCustomer({ name: '', phone: '', email: '', address: '' });
    setShowAdd(false);
    fetchAllData();
  };

  const handleAddRequest = async () => {
    if (!showDetail?.id) return;
    if (!newRequest.make && !newRequest.model) { alert('Enter at least make or model'); return; }
    
    const { error } = await supabase.from('vehicle_requests').insert({
      customer_id: showDetail.id,
      dealer_id: dealerId,
      year_min: newRequest.year_min ? parseInt(newRequest.year_min) : null,
      year_max: newRequest.year_max ? parseInt(newRequest.year_max) : null,
      make: newRequest.make || null,
      model: newRequest.model || null,
      max_price: newRequest.max_price ? parseFloat(newRequest.max_price) : null,
      max_miles: newRequest.max_miles ? parseInt(newRequest.max_miles) : null,
      notes: newRequest.notes || null,
      status: 'Looking'
    });
    
    if (error) { alert('Error: ' + error.message); return; }
    setNewRequest({ year_min: '', year_max: '', make: '', model: '', max_price: '', max_miles: '', notes: '' });
    setShowAddRequest(false);
    loadVehicleRequests();
  };

  const updateRequestStatus = async (requestId, status) => {
    await supabase.from('vehicle_requests').update({ status }).eq('id', requestId);
    loadVehicleRequests();
  };

  const deleteRequest = async (requestId) => {
    if (!confirm('Delete this vehicle request?')) return;
    await supabase.from('vehicle_requests').delete().eq('id', requestId);
    loadVehicleRequests();
  };

  const startDeal = (customer) => {
    // Navigate to deals page with customer pre-selected
    navigate('/deals', { state: { customerId: customer.id, customerName: customer.name } });
  };

  const inputStyle = { width: '100%', padding: '10px 12px', borderRadius: '8px', border: '1px solid #3f3f46', backgroundColor: '#09090b', color: '#fff', fontSize: '14px', outline: 'none' };

  return (
    <div style={{ padding: '24px', backgroundColor: '#09090b', minHeight: '100vh' }}>
      <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'center', marginBottom: '24px', flexWrap: 'wrap', gap: '16px' }}>
        <div>
          <h1 style={{ fontSize: '24px', fontWeight: '700', color: '#fff', margin: 0 }}>Customers</h1>
          <p style={{ color: '#71717a', margin: '4px 0 0', fontSize: '14px' }}>{filtered.length} customers</p>
        </div>
        <button onClick={() => setShowAdd(true)} style={{ padding: '10px 20px', backgroundColor: '#f97316', color: '#fff', border: 'none', borderRadius: '8px', fontWeight: '600', cursor: 'pointer' }}>+ Add Customer</button>
      </div>

      {/* Looking for Vehicles Alert */}
      {customersLooking.length > 0 && (
        <div style={{ backgroundColor: '#422006', border: '1px solid #f97316', borderRadius: '12px', padding: '16px', marginBottom: '20px' }}>
          <div style={{ display: 'flex', alignItems: 'center', gap: '12px', marginBottom: '12px' }}>
            <span style={{ fontSize: '24px' }}>🔍</span>
            <div>
              <div style={{ color: '#fed7aa', fontWeight: '600', fontSize: '16px' }}>{customersLooking.length} Customer{customersLooking.length > 1 ? 's' : ''} Looking for Vehicles</div>
              <div style={{ color: '#fdba74', fontSize: '13px' }}>Click to see what they need</div>
            </div>
          </div>
          <div style={{ display: 'flex', flexWrap: 'wrap', gap: '8px' }}>
            {customersLooking.map(c => (
              <button 
                key={c.id} 
                onClick={() => setShowDetail(c)}
                style={{ padding: '8px 14px', backgroundColor: '#f97316', color: '#fff', border: 'none', borderRadius: '6px', fontSize: '13px', fontWeight: '500', cursor: 'pointer' }}
              >
                {c.name} ({getCustomerRequests(c.id).length})
              </button>
            ))}
          </div>
        </div>
      )}

      <input
        type="text"
        placeholder="Search by name, phone, or email..."
        value={search}
        onChange={(e) => setSearch(e.target.value)}
        style={{ ...inputStyle, marginBottom: '20px', maxWidth: '400px' }}
      />

      {filtered.length === 0 ? (
        <div style={{ padding: '60px', textAlign: 'center', color: '#71717a', backgroundColor: '#18181b', borderRadius: '12px' }}>No customers found</div>
      ) : (
        <div style={{ display: 'grid', gridTemplateColumns: 'repeat(auto-fill, minmax(320px, 1fr))', gap: '16px' }}>
          {filtered.map((c, i) => {
            const requests = getCustomerRequests(c.id);
            return (
              <div 
                key={c.id || i} 
                onClick={() => setShowDetail(c)}
                style={{ backgroundColor: '#18181b', borderRadius: '12px', padding: '20px', border: requests.length > 0 ? '2px solid #f97316' : '1px solid #27272a', cursor: 'pointer', transition: 'transform 0.15s' }}
                onMouseEnter={e => e.currentTarget.style.transform = 'translateY(-2px)'}
                onMouseLeave={e => e.currentTarget.style.transform = 'translateY(0)'}
              >
                <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'start', marginBottom: '8px' }}>
                  <div style={{ color: '#fff', fontSize: '16px', fontWeight: '600' }}>{c.name}</div>
                  {requests.length > 0 && (
                    <span style={{ padding: '4px 8px', backgroundColor: '#f97316', color: '#fff', borderRadius: '4px', fontSize: '11px', fontWeight: '600' }}>
                      Looking ({requests.length})
                    </span>
                  )}
                </div>
                {c.phone && <div style={{ color: '#a1a1aa', fontSize: '14px', marginBottom: '4px' }}>{c.phone}</div>}
                {c.email && <div style={{ color: '#a1a1aa', fontSize: '14px', marginBottom: '4px' }}>{c.email}</div>}
                {c.address && <div style={{ color: '#71717a', fontSize: '13px' }}>{c.address}</div>}
                
                {requests.length > 0 && (
                  <div style={{ marginTop: '12px', paddingTop: '12px', borderTop: '1px solid #27272a' }}>
                    <div style={{ color: '#71717a', fontSize: '11px', marginBottom: '6px', textTransform: 'uppercase' }}>Looking for:</div>
                    {requests.slice(0, 2).map((r, j) => (
                      <div key={j} style={{ color: '#fbbf24', fontSize: '13px' }}>
                        {r.year_min || r.year_max ? `${r.year_min || '?'}-${r.year_max || '?'} ` : ''}{r.make} {r.model}
                        {r.max_price && ` under $${parseInt(r.max_price).toLocaleString()}`}
                      </div>
                    ))}
                    {requests.length > 2 && <div style={{ color: '#71717a', fontSize: '12px' }}>+{requests.length - 2} more</div>}
                  </div>
                )}
              </div>
            );
          })}
        </div>
      )}

      {/* Customer Detail Modal */}
      {showDetail && (
        <div style={{ position: 'fixed', inset: 0, backgroundColor: 'rgba(0,0,0,0.8)', display: 'flex', alignItems: 'center', justifyContent: 'center', zIndex: 9999, padding: '20px' }} onClick={() => setShowDetail(null)}>
          <div style={{ backgroundColor: '#18181b', borderRadius: '16px', padding: '24px', width: '100%', maxWidth: '500px', maxHeight: '90vh', overflowY: 'auto', border: '1px solid #27272a' }} onClick={e => e.stopPropagation()}>
            <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'center', marginBottom: '20px' }}>
              <h2 style={{ color: '#fff', margin: 0, fontSize: '20px' }}>{showDetail.name}</h2>
              <button onClick={() => setShowDetail(null)} style={{ background: 'none', border: 'none', color: '#71717a', fontSize: '24px', cursor: 'pointer' }}>×</button>
            </div>

            {/* Contact Info */}
            <div style={{ backgroundColor: '#09090b', borderRadius: '8px', padding: '16px', marginBottom: '16px' }}>
              {showDetail.phone && <div style={{ color: '#a1a1aa', fontSize: '14px', marginBottom: '6px' }}>📞 {showDetail.phone}</div>}
              {showDetail.email && <div style={{ color: '#a1a1aa', fontSize: '14px', marginBottom: '6px' }}>✉️ {showDetail.email}</div>}
              {showDetail.address && <div style={{ color: '#a1a1aa', fontSize: '14px' }}>📍 {showDetail.address}</div>}
            </div>

            {/* Start Deal Button */}
            <button 
              onClick={() => { setShowDetail(null); startDeal(showDetail); }}
              style={{ width: '100%', padding: '14px', backgroundColor: '#22c55e', color: '#fff', border: 'none', borderRadius: '8px', fontWeight: '600', fontSize: '15px', cursor: 'pointer', marginBottom: '20px' }}
            >
              Start Deal with {showDetail.name}
            </button>

            {/* Vehicle Requests */}
            <div style={{ marginBottom: '16px' }}>
              <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'center', marginBottom: '12px' }}>
                <div style={{ color: '#a1a1aa', fontSize: '13px', fontWeight: '600', textTransform: 'uppercase' }}>Vehicle Requests</div>
                <button 
                  onClick={() => setShowAddRequest(true)}
                  style={{ padding: '6px 12px', backgroundColor: '#f97316', color: '#fff', border: 'none', borderRadius: '6px', fontSize: '12px', fontWeight: '600', cursor: 'pointer' }}
                >
                  + Add
                </button>
              </div>

              {getCustomerRequests(showDetail.id).length === 0 && vehicleRequests.filter(r => r.customer_id === showDetail.id).length === 0 ? (
                <div style={{ padding: '20px', textAlign: 'center', color: '#71717a', backgroundColor: '#09090b', borderRadius: '8px', fontSize: '14px' }}>
                  No vehicle requests yet
                </div>
              ) : (
                <div style={{ display: 'flex', flexDirection: 'column', gap: '10px' }}>
                  {vehicleRequests.filter(r => r.customer_id === showDetail.id).map((r, i) => (
                    <div key={i} style={{ backgroundColor: '#09090b', borderRadius: '8px', padding: '14px', border: r.status === 'Looking' ? '1px solid #f97316' : '1px solid #27272a' }}>
                      <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'start', marginBottom: '8px' }}>
                        <div style={{ color: '#fff', fontWeight: '600', fontSize: '15px' }}>
                          {r.year_min || r.year_max ? `${r.year_min || '?'}-${r.year_max || '?'} ` : ''}{r.make} {r.model}
                        </div>
                        <span style={{ 
                          padding: '3px 8px', 
                          borderRadius: '4px', 
                          fontSize: '11px', 
                          fontWeight: '600',
                          backgroundColor: r.status === 'Looking' ? '#422006' : r.status === 'Found' ? '#14532d' : '#27272a',
                          color: r.status === 'Looking' ? '#fbbf24' : r.status === 'Found' ? '#4ade80' : '#71717a'
                        }}>
                          {r.status}
                        </span>
                      </div>
                      <div style={{ display: 'flex', gap: '16px', flexWrap: 'wrap', marginBottom: '8px' }}>
                        {r.max_price && <div style={{ color: '#a1a1aa', fontSize: '13px' }}>Max: ${parseInt(r.max_price).toLocaleString()}</div>}
                        {r.max_miles && <div style={{ color: '#a1a1aa', fontSize: '13px' }}>Under {parseInt(r.max_miles).toLocaleString()} mi</div>}
                      </div>
                      {r.notes && <div style={{ color: '#71717a', fontSize: '13px', marginBottom: '10px' }}>{r.notes}</div>}
                      
                      <div style={{ display: 'flex', gap: '8px', flexWrap: 'wrap' }}>
                        {r.status === 'Looking' && (
                          <button onClick={() => updateRequestStatus(r.id, 'Found')} style={{ padding: '6px 10px', backgroundColor: '#22c55e', color: '#fff', border: 'none', borderRadius: '4px', fontSize: '12px', cursor: 'pointer' }}>Mark Found</button>
                        )}
                        {r.status === 'Found' && (
                          <button onClick={() => updateRequestStatus(r.id, 'Purchased')} style={{ padding: '6px 10px', backgroundColor: '#3b82f6', color: '#fff', border: 'none', borderRadius: '4px', fontSize: '12px', cursor: 'pointer' }}>Mark Purchased</button>
                        )}
                        {r.status !== 'Cancelled' && r.status !== 'Purchased' && (
                          <button onClick={() => updateRequestStatus(r.id, 'Looking')} style={{ padding: '6px 10px', backgroundColor: '#27272a', color: '#a1a1aa', border: 'none', borderRadius: '4px', fontSize: '12px', cursor: 'pointer' }}>Reset</button>
                        )}
                        <button onClick={() => deleteRequest(r.id)} style={{ padding: '6px 10px', backgroundColor: '#7f1d1d', color: '#fca5a5', border: 'none', borderRadius: '4px', fontSize: '12px', cursor: 'pointer' }}>Delete</button>
                      </div>
                    </div>
                  ))}
                </div>
              )}
            </div>
          </div>
        </div>
      )}

      {/* Add Vehicle Request Modal */}
      {showAddRequest && showDetail && (
        <div style={{ position: 'fixed', inset: 0, backgroundColor: 'rgba(0,0,0,0.8)', display: 'flex', alignItems: 'center', justifyContent: 'center', zIndex: 10000, padding: '20px' }}>
          <div style={{ backgroundColor: '#18181b', borderRadius: '16px', padding: '24px', width: '100%', maxWidth: '400px', border: '1px solid #27272a' }}>
            <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'center', marginBottom: '20px' }}>
              <h2 style={{ color: '#fff', margin: 0, fontSize: '18px' }}>Add Vehicle Request</h2>
              <button onClick={() => setShowAddRequest(false)} style={{ background: 'none', border: 'none', color: '#71717a', fontSize: '24px', cursor: 'pointer' }}>×</button>
            </div>
            
            <div style={{ color: '#a1a1aa', fontSize: '13px', marginBottom: '16px' }}>What is {showDetail.name} looking for?</div>
            
            <div style={{ display: 'grid', gap: '12px' }}>
              <div style={{ display: 'grid', gridTemplateColumns: '1fr 1fr', gap: '12px' }}>
                <div>
                  <label style={{ display: 'block', fontSize: '12px', color: '#71717a', marginBottom: '4px' }}>Year Min</label>
                  <input type="number" placeholder="2018" value={newRequest.year_min} onChange={(e) => setNewRequest({ ...newRequest, year_min: e.target.value })} style={inputStyle} />
                </div>
                <div>
                  <label style={{ display: 'block', fontSize: '12px', color: '#71717a', marginBottom: '4px' }}>Year Max</label>
                  <input type="number" placeholder="2024" value={newRequest.year_max} onChange={(e) => setNewRequest({ ...newRequest, year_max: e.target.value })} style={inputStyle} />
                </div>
              </div>
              <div>
                <label style={{ display: 'block', fontSize: '12px', color: '#71717a', marginBottom: '4px' }}>Make</label>
                <input type="text" placeholder="Toyota, Honda, Ford..." value={newRequest.make} onChange={(e) => setNewRequest({ ...newRequest, make: e.target.value })} style={inputStyle} />
              </div>
              <div>
                <label style={{ display: 'block', fontSize: '12px', color: '#71717a', marginBottom: '4px' }}>Model</label>
                <input type="text" placeholder="Camry, Civic, F-150..." value={newRequest.model} onChange={(e) => setNewRequest({ ...newRequest, model: e.target.value })} style={inputStyle} />
              </div>
              <div style={{ display: 'grid', gridTemplateColumns: '1fr 1fr', gap: '12px' }}>
                <div>
                  <label style={{ display: 'block', fontSize: '12px', color: '#71717a', marginBottom: '4px' }}>Max Price</label>
                  <input type="number" placeholder="15000" value={newRequest.max_price} onChange={(e) => setNewRequest({ ...newRequest, max_price: e.target.value })} style={inputStyle} />
                </div>
                <div>
                  <label style={{ display: 'block', fontSize: '12px', color: '#71717a', marginBottom: '4px' }}>Max Miles</label>
                  <input type="number" placeholder="100000" value={newRequest.max_miles} onChange={(e) => setNewRequest({ ...newRequest, max_miles: e.target.value })} style={inputStyle} />
                </div>
              </div>
              <div>
                <label style={{ display: 'block', fontSize: '12px', color: '#71717a', marginBottom: '4px' }}>Notes</label>
                <input type="text" placeholder="Any color but red, needs AWD..." value={newRequest.notes} onChange={(e) => setNewRequest({ ...newRequest, notes: e.target.value })} style={inputStyle} />
              </div>
            </div>
            
            <div style={{ display: 'flex', gap: '12px', marginTop: '20px' }}>
              <button onClick={() => setShowAddRequest(false)} style={{ flex: 1, padding: '12px', backgroundColor: '#27272a', color: '#fff', border: 'none', borderRadius: '8px', cursor: 'pointer' }}>Cancel</button>
              <button onClick={handleAddRequest} style={{ flex: 1, padding: '12px', backgroundColor: '#f97316', color: '#fff', border: 'none', borderRadius: '8px', fontWeight: '600', cursor: 'pointer' }}>Add Request</button>
            </div>
          </div>
        </div>
      )}

      {/* Add Customer Modal */}
      {showAdd && (
        <div style={{ position: 'fixed', inset: 0, backgroundColor: 'rgba(0,0,0,0.7)', display: 'flex', alignItems: 'center', justifyContent: 'center', zIndex: 9999, padding: '20px' }}>
          <div style={{ backgroundColor: '#18181b', borderRadius: '16px', padding: '24px', width: '100%', maxWidth: '400px', border: '1px solid #27272a' }}>
            <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'center', marginBottom: '20px' }}>
              <h2 style={{ color: '#fff', margin: 0, fontSize: '18px' }}>Add Customer</h2>
              <button onClick={() => setShowAdd(false)} style={{ background: 'none', border: 'none', color: '#71717a', fontSize: '24px', cursor: 'pointer' }}>×</button>
            </div>
            <div style={{ display: 'flex', flexDirection: 'column', gap: '12px' }}>
              <input type="text" placeholder="Name *" value={newCustomer.name} onChange={(e) => setNewCustomer({ ...newCustomer, name: e.target.value })} style={inputStyle} />
              <input type="tel" placeholder="Phone" value={newCustomer.phone} onChange={(e) => setNewCustomer({ ...newCustomer, phone: e.target.value })} style={inputStyle} />
              <input type="email" placeholder="Email" value={newCustomer.email} onChange={(e) => setNewCustomer({ ...newCustomer, email: e.target.value })} style={inputStyle} />
              <input type="text" placeholder="Address" value={newCustomer.address} onChange={(e) => setNewCustomer({ ...newCustomer, address: e.target.value })} style={inputStyle} />
            </div>
            <div style={{ display: 'flex', gap: '12px', marginTop: '20px' }}>
              <button onClick={() => setShowAdd(false)} style={{ flex: 1, padding: '12px', backgroundColor: '#27272a', color: '#fff', border: 'none', borderRadius: '8px', cursor: 'pointer' }}>Cancel</button>
              <button onClick={handleAdd} style={{ flex: 1, padding: '12px', backgroundColor: '#f97316', color: '#fff', border: 'none', borderRadius: '8px', fontWeight: '600', cursor: 'pointer' }}>Add</button>
            </div>
          </div>
        </div>
      )}
    </div>
  );
}