import { useState, useEffect } from 'react';
import { useNavigate } from 'react-router-dom';
import { useStore } from '../lib/store';
import { supabase } from '../lib/supabase';

const PhoneIcon = () => <svg width="16" height="16" fill="none" stroke="currentColor" strokeWidth="2" viewBox="0 0 24 24"><path d="M22 16.92v3a2 2 0 0 1-2.18 2 19.79 19.79 0 0 1-8.63-3.07 19.5 19.5 0 0 1-6-6 19.79 19.79 0 0 1-3.07-8.67A2 2 0 0 1 4.11 2h3a2 2 0 0 1 2 1.72 12.84 12.84 0 0 0 .7 2.81 2 2 0 0 1-.45 2.11L8.09 9.91a16 16 0 0 0 6 6l1.27-1.27a2 2 0 0 1 2.11-.45 12.84 12.84 0 0 0 2.81.7A2 2 0 0 1 22 16.92z"/></svg>;
const EmailIcon = () => <svg width="16" height="16" fill="none" stroke="currentColor" strokeWidth="2" viewBox="0 0 24 24"><rect width="20" height="16" x="2" y="4" rx="2"/><path d="m22 7-8.97 5.7a1.94 1.94 0 0 1-2.06 0L2 7"/></svg>;
const MessageIcon = () => <svg width="16" height="16" fill="none" stroke="currentColor" strokeWidth="2" viewBox="0 0 24 24"><path d="M21 15a2 2 0 0 1-2 2H7l-4 4V5a2 2 0 0 1 2-2h14a2 2 0 0 1 2 2z"/></svg>;
const PinIcon = () => <svg width="14" height="14" fill="none" stroke="currentColor" strokeWidth="2" viewBox="0 0 24 24"><path d="M21 10c0 7-9 13-9 13s-9-6-9-13a9 9 0 0 1 18 0z"/><circle cx="12" cy="10" r="3"/></svg>;
const SearchIcon = () => <svg width="16" height="16" fill="none" stroke="currentColor" strokeWidth="2" viewBox="0 0 24 24"><circle cx="11" cy="11" r="8"/><path d="m21 21-4.35-4.35"/></svg>;
const CloseIcon = () => <svg width="20" height="20" fill="none" stroke="currentColor" strokeWidth="2" viewBox="0 0 24 24"><path d="M18 6 6 18M6 6l12 12"/></svg>;

export default function CustomersPage() {
  const navigate = useNavigate();
  const { customers, dealerId, fetchAllData } = useStore();
  const [search, setSearch] = useState('');
  const [showAdd, setShowAdd] = useState(false);
  const [selectedCustomer, setSelectedCustomer] = useState(null);
  const [showDetail, setShowDetail] = useState(false);
  const [showAddRequest, setShowAddRequest] = useState(false);
  const [vehicleRequests, setVehicleRequests] = useState([]);
  const [allRequests, setAllRequests] = useState([]);
  const [newCustomer, setNewCustomer] = useState({ name: '', phone: '', email: '', address: '' });
  const [newRequest, setNewRequest] = useState({ year_min: '', year_max: '', make: '', model: '', max_price: '', max_miles: '', color: '', notes: '' });

  useEffect(() => {
    if (dealerId && (!customers || customers.length === 0)) fetchAllData();
    if (dealerId) loadAllRequests();
  }, [dealerId]);

  useEffect(() => {
    if (selectedCustomer) loadRequests(selectedCustomer.id);
  }, [selectedCustomer]);

  const loadAllRequests = async () => {
    const { data } = await supabase.from('customer_vehicle_requests').select('*, customers(name)').eq('dealer_id', dealerId).eq('status', 'Looking');
    setAllRequests(data || []);
  };

  const loadRequests = async (customerId) => {
    const { data } = await supabase.from('customer_vehicle_requests').select('*').eq('customer_id', customerId).order('created_at', { ascending: false });
    setVehicleRequests(data || []);
  };

  const filtered = (customers || []).filter(c => c.name?.toLowerCase().includes(search.toLowerCase()) || c.phone?.includes(search) || c.email?.toLowerCase().includes(search.toLowerCase()));
  const customersLooking = [...new Set(allRequests.map(r => r.customer_id))].length;

  const saveCustomer = async () => {
    if (!newCustomer.name) return;
    await supabase.from('customers').insert({ ...newCustomer, dealer_id: dealerId });
    setNewCustomer({ name: '', phone: '', email: '', address: '' });
    setShowAdd(false);
    fetchAllData();
  };

  const saveRequest = async () => {
    if (!selectedCustomer) return;
    await supabase.from('customer_vehicle_requests').insert({ ...newRequest, customer_id: selectedCustomer.id, dealer_id: dealerId, status: 'Looking' });
    setNewRequest({ year_min: '', year_max: '', make: '', model: '', max_price: '', max_miles: '', color: '', notes: '' });
    setShowAddRequest(false);
    await loadRequests(selectedCustomer.id);
    await loadAllRequests();
  };

  const updateRequestStatus = async (requestId, status) => {
    await supabase.from('customer_vehicle_requests').update({ status }).eq('id', requestId);
    await loadRequests(selectedCustomer.id);
    await loadAllRequests();
  };

  const deleteRequest = async (requestId) => {
    if (!confirm('Delete this vehicle request?')) return;
    await supabase.from('customer_vehicle_requests').delete().eq('id', requestId);
    await loadRequests(selectedCustomer.id);
    await loadAllRequests();
  };

  const openDetail = (customer) => { setSelectedCustomer(customer); setShowDetail(true); };
  const getStatusColor = (status) => {
    switch (status) {
      case 'Looking': return { bg: '#f9731620', color: '#f97316' };
      case 'Found': return { bg: '#3b82f620', color: '#3b82f6' };
      case 'Purchased': return { bg: '#22c55e20', color: '#22c55e' };
      default: return { bg: '#27272a', color: '#a1a1aa' };
    }
  };
  const getFirstName = (fullName) => fullName?.split(' ')[0] || 'Customer';
  const formatPhone = (phone) => phone ? phone.replace(/\D/g, '') : '';

  const goToResearch = (request) => {
    const p = new URLSearchParams();
    if (request.year_min) p.set('year_min', request.year_min);
    if (request.year_max) p.set('year_max', request.year_max);
    if (request.make) p.set('make', request.make);
    if (request.model) p.set('model', request.model);
    if (request.max_price) p.set('max_price', request.max_price);
    if (request.max_miles) p.set('max_miles', request.max_miles);

    // Build general search query from request details
    let queryParts = [];
    if (request.year_min && request.year_max) {
      queryParts.push(`${request.year_min}-${request.year_max}`);
    } else if (request.year_min) {
      queryParts.push(`${request.year_min} or newer`);
    } else if (request.year_max) {
      queryParts.push(`${request.year_max} or older`);
    }
    if (request.make) queryParts.push(request.make);
    if (request.model) queryParts.push(request.model);
    if (request.max_price) queryParts.push(`under $${Number(request.max_price).toLocaleString()}`);
    if (request.max_miles) queryParts.push(`under ${Number(request.max_miles).toLocaleString()} miles`);
    if (request.color) queryParts.push(request.color);
    if (request.notes) queryParts.push(request.notes);

    if (queryParts.length > 0) {
      p.set('query', queryParts.join(' '));
    }

    navigate(`/research?${p.toString()}`);
  };

  const inputStyle = { width: '100%', padding: '10px 12px', borderRadius: '8px', border: '1px solid #3f3f46', backgroundColor: '#09090b', color: '#fff', fontSize: '14px', outline: 'none' };
  const customersWithRequests = (customers || []).filter(c => allRequests.some(r => r.customer_id === c.id));

  return (
    <div style={{ padding: '24px', backgroundColor: '#09090b', minHeight: '100vh' }}>
      <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'center', marginBottom: '24px', flexWrap: 'wrap', gap: '16px' }}>
        <div>
          <h1 style={{ fontSize: '24px', fontWeight: '700', color: '#fff', margin: 0 }}>Customers</h1>
          <p style={{ color: '#71717a', margin: '4px 0 0', fontSize: '14px' }}>{filtered.length} customers</p>
        </div>
        <button onClick={() => setShowAdd(true)} style={{ padding: '10px 20px', backgroundColor: '#f97316', color: '#fff', border: 'none', borderRadius: '8px', fontWeight: '600', cursor: 'pointer' }}>+ Add Customer</button>
      </div>

      {customersLooking > 0 && (
        <div style={{ backgroundColor: '#f9731615', border: '1px solid #f97316', borderRadius: '12px', padding: '16px 20px', marginBottom: '20px' }}>
          <div style={{ display: 'flex', alignItems: 'center', gap: '12px', marginBottom: '12px' }}>
            <SearchIcon />
            <div>
              <div style={{ color: '#f97316', fontWeight: '600', fontSize: '15px' }}>{customersLooking} Customer{customersLooking > 1 ? 's' : ''} Looking for Vehicles</div>
              <div style={{ color: '#a1a1aa', fontSize: '13px' }}>Click to see what they need</div>
            </div>
          </div>
          <div style={{ display: 'flex', flexWrap: 'wrap', gap: '8px' }}>
            {customersWithRequests.map(c => (
              <button key={c.id} onClick={() => openDetail(c)} style={{ padding: '6px 14px', backgroundColor: '#f97316', color: '#fff', border: 'none', borderRadius: '20px', fontSize: '13px', fontWeight: '500', cursor: 'pointer' }}>
                {c.name} ({allRequests.filter(r => r.customer_id === c.id).length})
              </button>
            ))}
          </div>
        </div>
      )}

      <input type="text" placeholder="Search by name, phone, or email..." value={search} onChange={(e) => setSearch(e.target.value)} style={{ ...inputStyle, marginBottom: '20px', maxWidth: '400px' }} />

      {filtered.length === 0 ? (
        <div style={{ color: '#71717a', textAlign: 'center', padding: '60px 0' }}>No customers found</div>
      ) : (
        <div style={{ display: 'grid', gridTemplateColumns: 'repeat(auto-fill, minmax(300px, 1fr))', gap: '16px' }}>
          {filtered.map((customer) => {
            const reqs = allRequests.filter(r => r.customer_id === customer.id);
            return (
              <div key={customer.id} onClick={() => openDetail(customer)} style={{ backgroundColor: '#18181b', borderRadius: '12px', padding: '20px', cursor: 'pointer', border: reqs.length > 0 ? '1px solid #f97316' : '1px solid #27272a' }}>
                <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'flex-start', marginBottom: '12px' }}>
                  <div style={{ fontSize: '17px', fontWeight: '600', color: '#fff' }}>{customer.name}</div>
                  {reqs.length > 0 && <span style={{ padding: '4px 10px', backgroundColor: '#f9731620', color: '#f97316', borderRadius: '12px', fontSize: '12px', fontWeight: '500' }}>Looking ({reqs.length})</span>}
                </div>
                {customer.phone && <div style={{ color: '#a1a1aa', fontSize: '14px', marginBottom: '4px' }}>{customer.phone}</div>}
                {customer.email && <div style={{ color: '#a1a1aa', fontSize: '14px', marginBottom: '4px' }}>{customer.email}</div>}
                {customer.address && <div style={{ color: '#71717a', fontSize: '13px' }}>{customer.address}</div>}
                {reqs.length > 0 && reqs[0] && (
                  <div style={{ marginTop: '12px', paddingTop: '12px', borderTop: '1px solid #27272a' }}>
                    <div style={{ color: '#71717a', fontSize: '11px', textTransform: 'uppercase', marginBottom: '4px' }}>Looking For:</div>
                    <div style={{ color: '#f97316', fontSize: '13px' }}>{reqs[0].year_min || reqs[0].year_max ? `${reqs[0].year_min || '?'}-${reqs[0].year_max || 'newer'}` : ''} {reqs[0].make} {reqs[0].model}{reqs[0].max_price && ` under ${Number(reqs[0].max_price).toLocaleString()}`}</div>
                  </div>
                )}
              </div>
            );
          })}
        </div>
      )}

      {showAdd && (
        <div style={{ position: 'fixed', inset: 0, backgroundColor: 'rgba(0,0,0,0.8)', display: 'flex', alignItems: 'center', justifyContent: 'center', zIndex: 1000, padding: '16px' }} onClick={() => setShowAdd(false)}>
          <div style={{ backgroundColor: '#18181b', borderRadius: '16px', padding: '24px', width: '100%', maxWidth: '400px' }} onClick={e => e.stopPropagation()}>
            <h2 style={{ color: '#fff', margin: '0 0 20px', fontSize: '20px' }}>Add Customer</h2>
            <div style={{ display: 'flex', flexDirection: 'column', gap: '12px' }}>
              <input placeholder="Name *" value={newCustomer.name} onChange={(e) => setNewCustomer(p => ({ ...p, name: e.target.value }))} style={inputStyle} />
              <input placeholder="Phone" value={newCustomer.phone} onChange={(e) => setNewCustomer(p => ({ ...p, phone: e.target.value }))} style={inputStyle} />
              <input placeholder="Email" value={newCustomer.email} onChange={(e) => setNewCustomer(p => ({ ...p, email: e.target.value }))} style={inputStyle} />
              <input placeholder="Address" value={newCustomer.address} onChange={(e) => setNewCustomer(p => ({ ...p, address: e.target.value }))} style={inputStyle} />
            </div>
            <div style={{ display: 'flex', gap: '12px', marginTop: '20px' }}>
              <button onClick={() => setShowAdd(false)} style={{ flex: 1, padding: '12px', backgroundColor: '#27272a', color: '#fff', border: 'none', borderRadius: '8px', fontWeight: '600', cursor: 'pointer' }}>Cancel</button>
              <button onClick={saveCustomer} style={{ flex: 1, padding: '12px', backgroundColor: '#f97316', color: '#fff', border: 'none', borderRadius: '8px', fontWeight: '600', cursor: 'pointer' }}>Save</button>
            </div>
          </div>
        </div>
      )}

      {showDetail && selectedCustomer && (
        <div style={{ position: 'fixed', inset: 0, backgroundColor: 'rgba(0,0,0,0.8)', display: 'flex', alignItems: 'center', justifyContent: 'center', zIndex: 1000, padding: '16px' }} onClick={() => setShowDetail(false)}>
          <div style={{ backgroundColor: '#18181b', borderRadius: '16px', padding: '24px', width: '100%', maxWidth: '500px', maxHeight: '90vh', overflowY: 'auto' }} onClick={e => e.stopPropagation()}>
            <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'flex-start', marginBottom: '20px' }}>
              <h2 style={{ color: '#fff', margin: 0, fontSize: '22px' }}>{selectedCustomer.name}</h2>
              <button onClick={() => setShowDetail(false)} style={{ background: 'none', border: 'none', color: '#71717a', cursor: 'pointer', padding: '4px' }}><CloseIcon /></button>
            </div>

            <div style={{ marginBottom: '20px' }}>
              {selectedCustomer.phone && <div style={{ display: 'flex', alignItems: 'center', gap: '8px', color: '#a1a1aa', fontSize: '14px', marginBottom: '6px' }}><PhoneIcon /> {selectedCustomer.phone}</div>}
              {selectedCustomer.email && <div style={{ display: 'flex', alignItems: 'center', gap: '8px', color: '#a1a1aa', fontSize: '14px', marginBottom: '6px' }}><EmailIcon /> {selectedCustomer.email}</div>}
              {selectedCustomer.address && <div style={{ display: 'flex', alignItems: 'center', gap: '8px', color: '#71717a', fontSize: '13px' }}><PinIcon /> {selectedCustomer.address}</div>}
            </div>

            <div style={{ display: 'flex', gap: '10px', marginBottom: '24px', flexWrap: 'wrap' }}>
              {selectedCustomer.phone && (
                <>
                  <a href={`sms:${formatPhone(selectedCustomer.phone)}`} style={{ flex: 1, minWidth: '120px', padding: '12px', backgroundColor: '#22c55e', color: '#fff', borderRadius: '8px', fontWeight: '600', fontSize: '14px', textDecoration: 'none', textAlign: 'center', display: 'flex', alignItems: 'center', justifyContent: 'center', gap: '6px' }}><MessageIcon /> TXT {getFirstName(selectedCustomer.name)}</a>
                  <a href={`tel:${formatPhone(selectedCustomer.phone)}`} style={{ flex: 1, minWidth: '120px', padding: '12px', backgroundColor: '#3b82f6', color: '#fff', borderRadius: '8px', fontWeight: '600', fontSize: '14px', textDecoration: 'none', textAlign: 'center', display: 'flex', alignItems: 'center', justifyContent: 'center', gap: '6px' }}><PhoneIcon /> Call {getFirstName(selectedCustomer.name)}</a>
                </>
              )}
              {selectedCustomer.email && <a href={`mailto:${selectedCustomer.email}`} style={{ flex: 1, minWidth: '120px', padding: '12px', backgroundColor: '#8b5cf6', color: '#fff', borderRadius: '8px', fontWeight: '600', fontSize: '14px', textDecoration: 'none', textAlign: 'center', display: 'flex', alignItems: 'center', justifyContent: 'center', gap: '6px' }}><EmailIcon /> Email {getFirstName(selectedCustomer.name)}</a>}
            </div>

            <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'center', marginBottom: '12px' }}>
              <h3 style={{ color: '#a1a1aa', fontSize: '12px', fontWeight: '600', textTransform: 'uppercase', margin: 0 }}>Vehicle Requests</h3>
              <button onClick={() => setShowAddRequest(true)} style={{ padding: '6px 14px', backgroundColor: '#f97316', color: '#fff', border: 'none', borderRadius: '6px', fontSize: '13px', fontWeight: '600', cursor: 'pointer' }}>+ Add</button>
            </div>

            {vehicleRequests.length === 0 ? (
              <div style={{ padding: '30px', textAlign: 'center', color: '#71717a', backgroundColor: '#09090b', borderRadius: '8px', fontSize: '14px' }}>No vehicle requests yet</div>
            ) : (
              <div style={{ display: 'flex', flexDirection: 'column', gap: '12px' }}>
                {vehicleRequests.map((req) => {
                  const sc = getStatusColor(req.status);
                  return (
                    <div key={req.id} style={{ backgroundColor: '#09090b', padding: '16px', borderRadius: '8px', border: '1px solid #27272a' }}>
                      <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'flex-start', marginBottom: '8px' }}>
                        <div style={{ color: '#fff', fontSize: '15px', fontWeight: '600' }}>{req.year_min || req.year_max ? `${req.year_min || '?'}-${req.year_max || 'newer'}` : ''} {req.make} {req.model}</div>
                        <span style={{ padding: '4px 10px', backgroundColor: sc.bg, color: sc.color, borderRadius: '12px', fontSize: '11px', fontWeight: '500' }}>{req.status}</span>
                      </div>
                      <div style={{ color: '#a1a1aa', fontSize: '13px', marginBottom: '8px' }}>{req.max_price && <>Max: ${Number(req.max_price).toLocaleString()}</>}{req.max_miles && <>&nbsp;&nbsp;&nbsp;Under {Number(req.max_miles).toLocaleString()} mi</>}</div>
                      {req.color && <div style={{ color: '#71717a', fontSize: '13px', marginBottom: '8px' }}>{req.color}</div>}
                      {req.notes && <div style={{ color: '#71717a', fontSize: '12px', fontStyle: 'italic', marginBottom: '12px' }}>{req.notes}</div>}
                      <div style={{ display: 'flex', gap: '8px', flexWrap: 'wrap' }}>
                        {req.status === 'Looking' && <button onClick={() => updateRequestStatus(req.id, 'Found')} style={{ padding: '8px 14px', backgroundColor: '#22c55e', color: '#fff', border: 'none', borderRadius: '6px', fontSize: '12px', fontWeight: '600', cursor: 'pointer' }}>Mark Found</button>}
                        {req.status === 'Found' && <button onClick={() => updateRequestStatus(req.id, 'Purchased')} style={{ padding: '8px 14px', backgroundColor: '#22c55e', color: '#fff', border: 'none', borderRadius: '6px', fontSize: '12px', fontWeight: '600', cursor: 'pointer' }}>Mark Purchased</button>}
                        {req.status !== 'Looking' && <button onClick={() => updateRequestStatus(req.id, 'Looking')} style={{ padding: '8px 14px', backgroundColor: '#27272a', color: '#fff', border: 'none', borderRadius: '6px', fontSize: '12px', fontWeight: '600', cursor: 'pointer' }}>Reset</button>}
                        <button onClick={() => goToResearch(req)} style={{ padding: '8px 14px', backgroundColor: '#3b82f6', color: '#fff', border: 'none', borderRadius: '6px', fontSize: '12px', fontWeight: '600', cursor: 'pointer' }}>Research</button>
                        <button onClick={() => deleteRequest(req.id)} style={{ padding: '8px 14px', backgroundColor: '#dc2626', color: '#fff', border: 'none', borderRadius: '6px', fontSize: '12px', fontWeight: '600', cursor: 'pointer' }}>Delete</button>
                      </div>
                    </div>
                  );
                })}
              </div>
            )}
          </div>
        </div>
      )}

      {showAddRequest && (
        <div style={{ position: 'fixed', inset: 0, backgroundColor: 'rgba(0,0,0,0.8)', display: 'flex', alignItems: 'center', justifyContent: 'center', zIndex: 1100, padding: '16px' }} onClick={() => setShowAddRequest(false)}>
          <div style={{ backgroundColor: '#18181b', borderRadius: '16px', padding: '24px', width: '100%', maxWidth: '400px' }} onClick={e => e.stopPropagation()}>
            <h2 style={{ color: '#fff', margin: '0 0 20px', fontSize: '18px' }}>Add Vehicle Request</h2>
            <div style={{ display: 'grid', gridTemplateColumns: '1fr 1fr', gap: '12px' }}>
              <input placeholder="Year Min" type="number" value={newRequest.year_min} onChange={(e) => setNewRequest(p => ({ ...p, year_min: e.target.value }))} style={inputStyle} />
              <input placeholder="Year Max" type="number" value={newRequest.year_max} onChange={(e) => setNewRequest(p => ({ ...p, year_max: e.target.value }))} style={inputStyle} />
              <input placeholder="Make" value={newRequest.make} onChange={(e) => setNewRequest(p => ({ ...p, make: e.target.value }))} style={{ ...inputStyle, gridColumn: '1 / -1' }} />
              <input placeholder="Model" value={newRequest.model} onChange={(e) => setNewRequest(p => ({ ...p, model: e.target.value }))} style={{ ...inputStyle, gridColumn: '1 / -1' }} />
              <input placeholder="Max Price" type="number" value={newRequest.max_price} onChange={(e) => setNewRequest(p => ({ ...p, max_price: e.target.value }))} style={inputStyle} />
              <input placeholder="Max Miles" type="number" value={newRequest.max_miles} onChange={(e) => setNewRequest(p => ({ ...p, max_miles: e.target.value }))} style={inputStyle} />
              <input placeholder="Color (optional)" value={newRequest.color} onChange={(e) => setNewRequest(p => ({ ...p, color: e.target.value }))} style={{ ...inputStyle, gridColumn: '1 / -1' }} />
              <textarea placeholder="Notes (optional)" value={newRequest.notes} onChange={(e) => setNewRequest(p => ({ ...p, notes: e.target.value }))} style={{ ...inputStyle, gridColumn: '1 / -1', minHeight: '60px', resize: 'vertical' }} />
            </div>
            <div style={{ display: 'flex', gap: '12px', marginTop: '20px' }}>
              <button onClick={() => setShowAddRequest(false)} style={{ flex: 1, padding: '12px', backgroundColor: '#27272a', color: '#fff', border: 'none', borderRadius: '8px', fontWeight: '600', cursor: 'pointer' }}>Cancel</button>
              <button onClick={saveRequest} style={{ flex: 1, padding: '12px', backgroundColor: '#f97316', color: '#fff', border: 'none', borderRadius: '8px', fontWeight: '600', cursor: 'pointer' }}>Save</button>
            </div>
          </div>
        </div>
      )}
    </div>
  );
}
