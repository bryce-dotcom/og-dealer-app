import { useState, useEffect } from 'react';
import { supabase } from '../lib/supabase';
import { useStore } from '../lib/store';
import { useTheme } from '../components/Layout';

export default function VehicleInspectionsPage() {
  const { theme } = useTheme();
  const { dealer } = useStore();
  const dealerId = dealer?.id;

  const [inspections, setInspections] = useState([]);
  const [loading, setLoading] = useState(true);
  const [showModal, setShowModal] = useState(false);
  const [editingInspection, setEditingInspection] = useState(null);
  const [vehicles, setVehicles] = useState([]);
  const [employees, setEmployees] = useState([]);
  const [filter, setFilter] = useState('all');
  const [expandedId, setExpandedId] = useState(null);

  const inspectionTypes = { purchase: 'Purchase', trade_in: 'Trade-In', delivery: 'Delivery', safety: 'Safety', emissions: 'Emissions', recon: 'Recon', custom: 'Custom' };
  const conditions = ['excellent', 'good', 'fair', 'poor', 'salvage'];
  const conditionColors = { excellent: '#22c55e', good: '#3b82f6', fair: '#f59e0b', poor: '#ef4444', salvage: '#71717a' };

  const defaultSections = {
    exterior: [
      { item: 'Paint Condition', condition: '', notes: '' },
      { item: 'Body Panels', condition: '', notes: '' },
      { item: 'Glass/Windshield', condition: '', notes: '' },
      { item: 'Lights', condition: '', notes: '' },
      { item: 'Bumpers', condition: '', notes: '' },
      { item: 'Trim/Moldings', condition: '', notes: '' }
    ],
    interior: [
      { item: 'Seats', condition: '', notes: '' },
      { item: 'Dashboard', condition: '', notes: '' },
      { item: 'Carpet/Floor', condition: '', notes: '' },
      { item: 'Headliner', condition: '', notes: '' },
      { item: 'Controls/Switches', condition: '', notes: '' },
      { item: 'A/C & Heater', condition: '', notes: '' }
    ],
    mechanical: [
      { item: 'Engine', condition: '', notes: '' },
      { item: 'Transmission', condition: '', notes: '' },
      { item: 'Suspension', condition: '', notes: '' },
      { item: 'Steering', condition: '', notes: '' },
      { item: 'Exhaust', condition: '', notes: '' },
      { item: 'Drive Belts', condition: '', notes: '' }
    ],
    tires_brakes: [
      { item: 'Front Tires', condition: '', notes: '' },
      { item: 'Rear Tires', condition: '', notes: '' },
      { item: 'Front Brakes', condition: '', notes: '' },
      { item: 'Rear Brakes', condition: '', notes: '' },
      { item: 'Spare Tire', condition: '', notes: '' }
    ]
  };

  const [form, setForm] = useState({
    vehicle_id: '', inspection_type: 'purchase', inspector_id: '',
    overall_condition: '', pass: '', score: '', mileage: '',
    estimated_repair_cost: '0', notes: '',
    exterior: defaultSections.exterior,
    interior: defaultSections.interior,
    mechanical: defaultSections.mechanical,
    tires_brakes: defaultSections.tires_brakes
  });

  useEffect(() => { if (dealerId) { fetchInspections(); fetchRelated(); } }, [dealerId]);

  const fetchInspections = async () => {
    setLoading(true);
    const { data } = await supabase
      .from('vehicle_inspections')
      .select('*')
      .eq('dealer_id', dealerId)
      .order('inspected_at', { ascending: false });
    setInspections(data || []);
    setLoading(false);
  };

  const fetchRelated = async () => {
    const [v, e] = await Promise.all([
      supabase.from('inventory').select('id, year, make, model, stock_number').eq('dealer_id', dealerId),
      supabase.from('employees').select('id, name').eq('dealer_id', dealerId).eq('active', true)
    ]);
    setVehicles(v.data || []);
    setEmployees(e.data || []);
  };

  const handleSave = async () => {
    const emp = employees.find(e => e.id === parseInt(form.inspector_id));
    const issuesFound = [...form.exterior, ...form.interior, ...form.mechanical, ...form.tires_brakes]
      .filter(i => i.condition === 'poor' || i.condition === 'fair').length;
    const criticalIssues = [...form.exterior, ...form.interior, ...form.mechanical, ...form.tires_brakes]
      .filter(i => i.condition === 'poor').length;

    const payload = {
      dealer_id: dealerId,
      vehicle_id: form.vehicle_id,
      inspection_type: form.inspection_type,
      inspector_id: form.inspector_id ? parseInt(form.inspector_id) : null,
      inspector_name: emp?.name || null,
      overall_condition: form.overall_condition || null,
      pass: form.pass === 'true' ? true : form.pass === 'false' ? false : null,
      score: form.score ? parseFloat(form.score) : null,
      mileage: form.mileage ? parseInt(form.mileage) : null,
      exterior: form.exterior,
      interior: form.interior,
      mechanical: form.mechanical,
      tires_brakes: form.tires_brakes,
      issues_found: issuesFound,
      critical_issues: criticalIssues,
      estimated_repair_cost: parseFloat(form.estimated_repair_cost || 0),
      notes: form.notes || null
    };

    if (editingInspection) {
      await supabase.from('vehicle_inspections').update(payload).eq('id', editingInspection.id);
    } else {
      await supabase.from('vehicle_inspections').insert(payload);
    }
    setShowModal(false);
    setEditingInspection(null);
    resetForm();
    fetchInspections();
  };

  const resetForm = () => setForm({
    vehicle_id: '', inspection_type: 'purchase', inspector_id: '',
    overall_condition: '', pass: '', score: '', mileage: '',
    estimated_repair_cost: '0', notes: '',
    exterior: defaultSections.exterior.map(i => ({ ...i })),
    interior: defaultSections.interior.map(i => ({ ...i })),
    mechanical: defaultSections.mechanical.map(i => ({ ...i })),
    tires_brakes: defaultSections.tires_brakes.map(i => ({ ...i }))
  });

  const openEdit = (insp) => {
    setEditingInspection(insp);
    setForm({
      vehicle_id: insp.vehicle_id || '', inspection_type: insp.inspection_type || 'purchase',
      inspector_id: insp.inspector_id?.toString() || '',
      overall_condition: insp.overall_condition || '', pass: insp.pass?.toString() || '',
      score: insp.score?.toString() || '', mileage: insp.mileage?.toString() || '',
      estimated_repair_cost: insp.estimated_repair_cost?.toString() || '0',
      notes: insp.notes || '',
      exterior: insp.exterior || defaultSections.exterior,
      interior: insp.interior || defaultSections.interior,
      mechanical: insp.mechanical || defaultSections.mechanical,
      tires_brakes: insp.tires_brakes || defaultSections.tires_brakes
    });
    setShowModal(true);
  };

  const deleteInspection = async (id) => {
    if (!confirm('Delete this inspection?')) return;
    await supabase.from('vehicle_inspections').delete().eq('id', id);
    fetchInspections();
  };

  const updateSectionItem = (section, idx, field, value) => {
    const updated = [...form[section]];
    updated[idx] = { ...updated[idx], [field]: value };
    setForm({ ...form, [section]: updated });
  };

  const getVehicle = (id) => vehicles.find(v => v.id === id);
  const filtered = filter === 'all' ? inspections : inspections.filter(i => i.inspection_type === filter);

  const stats = {
    total: inspections.length,
    passed: inspections.filter(i => i.pass === true).length,
    failed: inspections.filter(i => i.pass === false).length,
    avgScore: inspections.filter(i => i.score).length > 0
      ? Math.round(inspections.filter(i => i.score).reduce((s, i) => s + parseFloat(i.score), 0) / inspections.filter(i => i.score).length)
      : 0
  };

  const inputStyle = { width: '100%', padding: '8px 12px', backgroundColor: theme.bg, border: `1px solid ${theme.border}`, borderRadius: '8px', color: theme.text, fontSize: '14px' };
  const labelStyle = { display: 'block', fontSize: '12px', color: theme.textSecondary, marginBottom: '4px' };

  return (
    <div style={{ padding: '24px', maxWidth: '1400px', margin: '0 auto' }}>
      <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'center', marginBottom: '24px', flexWrap: 'wrap', gap: '12px' }}>
        <div>
          <h1 style={{ fontSize: '24px', fontWeight: '700', color: theme.text, margin: 0 }}>Vehicle Inspections</h1>
          <p style={{ color: theme.textSecondary, fontSize: '14px', margin: '4px 0 0' }}>Inspection checklists and condition reports</p>
        </div>
        <button onClick={() => { resetForm(); setEditingInspection(null); setShowModal(true); }} style={{
          padding: '10px 20px', backgroundColor: theme.accent, color: '#fff',
          border: 'none', borderRadius: '8px', fontWeight: '600', cursor: 'pointer', fontSize: '14px'
        }}>+ New Inspection</button>
      </div>

      {/* Stats */}
      <div style={{ display: 'grid', gridTemplateColumns: 'repeat(auto-fit, minmax(150px, 1fr))', gap: '16px', marginBottom: '24px' }}>
        {[
          { label: 'Total', value: stats.total, color: theme.accent },
          { label: 'Passed', value: stats.passed, color: '#22c55e' },
          { label: 'Failed', value: stats.failed, color: '#ef4444' },
          { label: 'Avg Score', value: stats.avgScore || '-', color: '#3b82f6' }
        ].map((s, i) => (
          <div key={i} style={{ backgroundColor: theme.bgCard, border: `1px solid ${theme.border}`, borderRadius: '12px', padding: '16px' }}>
            <div style={{ fontSize: '12px', color: theme.textSecondary }}>{s.label}</div>
            <div style={{ fontSize: '24px', fontWeight: '700', color: s.color }}>{s.value}</div>
          </div>
        ))}
      </div>

      {/* Filters */}
      <div style={{ display: 'flex', gap: '4px', marginBottom: '20px', overflowX: 'auto' }}>
        <button onClick={() => setFilter('all')} style={{
          padding: '6px 14px', borderRadius: '20px', border: `1px solid ${filter === 'all' ? theme.accent : theme.border}`,
          backgroundColor: filter === 'all' ? theme.accentBg : 'transparent', color: filter === 'all' ? theme.accent : theme.textSecondary,
          cursor: 'pointer', fontSize: '13px', whiteSpace: 'nowrap'
        }}>All</button>
        {Object.entries(inspectionTypes).map(([k, v]) => (
          <button key={k} onClick={() => setFilter(k)} style={{
            padding: '6px 14px', borderRadius: '20px', border: `1px solid ${filter === k ? theme.accent : theme.border}`,
            backgroundColor: filter === k ? theme.accentBg : 'transparent', color: filter === k ? theme.accent : theme.textSecondary,
            cursor: 'pointer', fontSize: '13px', whiteSpace: 'nowrap'
          }}>{v}</button>
        ))}
      </div>

      {/* Inspections List */}
      {loading ? (
        <div style={{ textAlign: 'center', padding: '40px', color: theme.textSecondary }}>Loading...</div>
      ) : filtered.length === 0 ? (
        <div style={{ textAlign: 'center', padding: '60px', color: theme.textMuted, backgroundColor: theme.bgCard, borderRadius: '12px', border: `1px solid ${theme.border}` }}>No inspections found</div>
      ) : (
        <div style={{ display: 'flex', flexDirection: 'column', gap: '8px' }}>
          {filtered.map(insp => {
            const veh = getVehicle(insp.vehicle_id);
            const expanded = expandedId === insp.id;
            return (
              <div key={insp.id} style={{ backgroundColor: theme.bgCard, border: `1px solid ${theme.border}`, borderRadius: '12px', overflow: 'hidden' }}>
                <div onClick={() => setExpandedId(expanded ? null : insp.id)} style={{ display: 'flex', alignItems: 'center', gap: '12px', padding: '14px', cursor: 'pointer' }}>
                  <div style={{
                    width: '40px', height: '40px', borderRadius: '8px', display: 'flex', alignItems: 'center', justifyContent: 'center',
                    fontSize: '18px', fontWeight: '700',
                    backgroundColor: insp.pass === true ? '#22c55e22' : insp.pass === false ? '#ef444422' : theme.accentBg,
                    color: insp.pass === true ? '#22c55e' : insp.pass === false ? '#ef4444' : theme.accent
                  }}>{insp.pass === true ? 'P' : insp.pass === false ? 'F' : '?'}</div>
                  <div style={{ flex: 1 }}>
                    <div style={{ fontWeight: '600', color: theme.text, fontSize: '14px' }}>
                      {veh ? `${veh.year} ${veh.make} ${veh.model}` : insp.vehicle_id?.substring(0, 8)}
                    </div>
                    <div style={{ display: 'flex', gap: '8px', flexWrap: 'wrap', marginTop: '2px' }}>
                      <span style={{ fontSize: '12px', padding: '1px 6px', borderRadius: '4px', backgroundColor: theme.accentBg, color: theme.accent }}>{inspectionTypes[insp.inspection_type]}</span>
                      {insp.overall_condition && <span style={{ fontSize: '12px', color: conditionColors[insp.overall_condition] }}>{insp.overall_condition}</span>}
                      {insp.score && <span style={{ fontSize: '12px', color: theme.textMuted }}>Score: {insp.score}</span>}
                      <span style={{ fontSize: '12px', color: theme.textMuted }}>{new Date(insp.inspected_at).toLocaleDateString()}</span>
                    </div>
                  </div>
                  <div style={{ display: 'flex', gap: '8px', alignItems: 'center' }}>
                    {insp.issues_found > 0 && <span style={{ fontSize: '12px', padding: '2px 8px', borderRadius: '10px', backgroundColor: '#ef444422', color: '#ef4444', fontWeight: '600' }}>{insp.issues_found} issues</span>}
                    <button onClick={(e) => { e.stopPropagation(); openEdit(insp); }} style={{ background: 'none', border: 'none', color: '#3b82f6', cursor: 'pointer', fontSize: '13px' }}>Edit</button>
                    <button onClick={(e) => { e.stopPropagation(); deleteInspection(insp.id); }} style={{ background: 'none', border: 'none', color: '#ef4444', cursor: 'pointer', fontSize: '13px' }}>Del</button>
                  </div>
                </div>
                {expanded && (
                  <div style={{ padding: '0 14px 14px', borderTop: `1px solid ${theme.border}` }}>
                    {['exterior', 'interior', 'mechanical', 'tires_brakes'].map(section => {
                      const items = insp[section];
                      if (!items || items.length === 0) return null;
                      return (
                        <div key={section} style={{ marginTop: '12px' }}>
                          <div style={{ fontSize: '13px', fontWeight: '700', color: theme.text, textTransform: 'capitalize', marginBottom: '6px' }}>{section.replace('_', ' & ')}</div>
                          {items.map((item, idx) => (
                            <div key={idx} style={{ display: 'flex', gap: '8px', padding: '4px 0', fontSize: '13px' }}>
                              <span style={{ color: theme.textSecondary, width: '140px' }}>{item.item}</span>
                              <span style={{ color: conditionColors[item.condition] || theme.textMuted, fontWeight: '500' }}>{item.condition || '-'}</span>
                              {item.notes && <span style={{ color: theme.textMuted, fontStyle: 'italic' }}>- {item.notes}</span>}
                            </div>
                          ))}
                        </div>
                      );
                    })}
                    {insp.notes && <div style={{ marginTop: '12px', fontSize: '13px', color: theme.textSecondary }}><strong>Notes:</strong> {insp.notes}</div>}
                    {insp.estimated_repair_cost > 0 && <div style={{ marginTop: '8px', fontSize: '13px', color: '#ef4444', fontWeight: '600' }}>Est. Repair: ${parseFloat(insp.estimated_repair_cost).toLocaleString()}</div>}
                  </div>
                )}
              </div>
            );
          })}
        </div>
      )}

      {/* Inspection Modal */}
      {showModal && (
        <div style={{ position: 'fixed', inset: 0, backgroundColor: 'rgba(0,0,0,0.6)', display: 'flex', alignItems: 'center', justifyContent: 'center', zIndex: 100, padding: '20px' }}>
          <div style={{ backgroundColor: theme.bgCard, borderRadius: '16px', border: `1px solid ${theme.border}`, width: '100%', maxWidth: '800px', maxHeight: '85vh', overflow: 'auto', padding: '24px' }}>
            <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'center', marginBottom: '20px' }}>
              <h2 style={{ fontSize: '18px', fontWeight: '700', color: theme.text, margin: 0 }}>{editingInspection ? 'Edit Inspection' : 'New Inspection'}</h2>
              <button onClick={() => { setShowModal(false); setEditingInspection(null); }} style={{ background: 'none', border: 'none', color: theme.textSecondary, cursor: 'pointer', fontSize: '20px' }}>×</button>
            </div>
            <div style={{ display: 'grid', gridTemplateColumns: '1fr 1fr 1fr', gap: '16px' }}>
              <div><label style={labelStyle}>Vehicle *</label><select value={form.vehicle_id} onChange={e => setForm({ ...form, vehicle_id: e.target.value })} style={inputStyle}>
                <option value="">Select</option>{vehicles.map(v => <option key={v.id} value={v.id}>{v.stock_number} - {v.year} {v.make} {v.model}</option>)}
              </select></div>
              <div><label style={labelStyle}>Type</label><select value={form.inspection_type} onChange={e => setForm({ ...form, inspection_type: e.target.value })} style={inputStyle}>
                {Object.entries(inspectionTypes).map(([k, v]) => <option key={k} value={k}>{v}</option>)}
              </select></div>
              <div><label style={labelStyle}>Inspector</label><select value={form.inspector_id} onChange={e => setForm({ ...form, inspector_id: e.target.value })} style={inputStyle}>
                <option value="">Select</option>{employees.map(e => <option key={e.id} value={e.id}>{e.name}</option>)}
              </select></div>
              <div><label style={labelStyle}>Condition</label><select value={form.overall_condition} onChange={e => setForm({ ...form, overall_condition: e.target.value })} style={inputStyle}>
                <option value="">Select</option>{conditions.map(c => <option key={c} value={c}>{c}</option>)}
              </select></div>
              <div><label style={labelStyle}>Pass/Fail</label><select value={form.pass} onChange={e => setForm({ ...form, pass: e.target.value })} style={inputStyle}>
                <option value="">N/A</option><option value="true">Pass</option><option value="false">Fail</option>
              </select></div>
              <div><label style={labelStyle}>Score (0-100)</label><input type="number" min="0" max="100" value={form.score} onChange={e => setForm({ ...form, score: e.target.value })} style={inputStyle} /></div>
              <div><label style={labelStyle}>Mileage</label><input type="number" value={form.mileage} onChange={e => setForm({ ...form, mileage: e.target.value })} style={inputStyle} /></div>
              <div><label style={labelStyle}>Est. Repair Cost</label><input type="number" step="0.01" value={form.estimated_repair_cost} onChange={e => setForm({ ...form, estimated_repair_cost: e.target.value })} style={inputStyle} /></div>
            </div>

            {/* Section Checklists */}
            {['exterior', 'interior', 'mechanical', 'tires_brakes'].map(section => (
              <div key={section} style={{ marginTop: '20px', borderTop: `1px solid ${theme.border}`, paddingTop: '16px' }}>
                <h3 style={{ fontSize: '14px', fontWeight: '700', color: theme.text, textTransform: 'capitalize', marginBottom: '8px' }}>{section.replace('_', ' & ')}</h3>
                {form[section].map((item, idx) => (
                  <div key={idx} style={{ display: 'grid', gridTemplateColumns: '150px 120px 1fr', gap: '8px', marginBottom: '6px', alignItems: 'center' }}>
                    <span style={{ fontSize: '13px', color: theme.textSecondary }}>{item.item}</span>
                    <select value={item.condition} onChange={e => updateSectionItem(section, idx, 'condition', e.target.value)} style={{ ...inputStyle, padding: '6px 8px', fontSize: '12px' }}>
                      <option value="">-</option>{conditions.map(c => <option key={c} value={c}>{c}</option>)}
                    </select>
                    <input placeholder="Notes" value={item.notes} onChange={e => updateSectionItem(section, idx, 'notes', e.target.value)} style={{ ...inputStyle, padding: '6px 8px', fontSize: '12px' }} />
                  </div>
                ))}
              </div>
            ))}

            <div style={{ marginTop: '16px' }}><label style={labelStyle}>Notes</label><textarea value={form.notes} onChange={e => setForm({ ...form, notes: e.target.value })} style={{ ...inputStyle, minHeight: '50px', resize: 'vertical' }} /></div>

            <div style={{ display: 'flex', justifyContent: 'flex-end', gap: '12px', marginTop: '20px' }}>
              <button onClick={() => { setShowModal(false); setEditingInspection(null); }} style={{ padding: '10px 20px', backgroundColor: 'transparent', color: theme.textSecondary, border: `1px solid ${theme.border}`, borderRadius: '8px', cursor: 'pointer' }}>Cancel</button>
              <button onClick={handleSave} disabled={!form.vehicle_id} style={{ padding: '10px 20px', backgroundColor: theme.accent, color: '#fff', border: 'none', borderRadius: '8px', fontWeight: '600', cursor: 'pointer', opacity: !form.vehicle_id ? 0.5 : 1 }}>{editingInspection ? 'Update' : 'Save'} Inspection</button>
            </div>
          </div>
        </div>
      )}
    </div>
  );
}