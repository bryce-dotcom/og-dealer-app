import { useState, useEffect } from 'react';
import { useNavigate } from 'react-router-dom';
import { supabase } from '../lib/supabase';
import InvestorLayout from '../components/InvestorLayout';

const cardStyle = { backgroundColor: '#fff', borderRadius: 12, border: '1px solid #e5e7eb', boxShadow: '0 1px 2px rgba(0,0,0,0.05)', marginBottom: 24, overflow: 'hidden' };
const inputStyle = { width: '100%', padding: '10px 16px', backgroundColor: '#fff', border: '1px solid #d1d5db', borderRadius: 8, color: '#111827', fontSize: 14, outline: 'none', boxSizing: 'border-box' };

export default function InvestorReports() {
  const navigate = useNavigate();
  const [loading, setLoading] = useState(true);
  const [investor, setInvestor] = useState(null);
  const [reports, setReports] = useState([]);
  const [activeTab, setActiveTab] = useState('statements');
  const [generating, setGenerating] = useState(false);

  // Report generation form
  const [reportType, setReportType] = useState('monthly');
  const [periodStart, setPeriodStart] = useState('');
  const [periodEnd, setPeriodEnd] = useState('');

  useEffect(() => {
    loadReports();
    const now = new Date();
    const lastMonth = new Date(now.getFullYear(), now.getMonth() - 1, 1);
    const lastMonthEnd = new Date(now.getFullYear(), now.getMonth(), 0);
    setPeriodStart(lastMonth.toISOString().split('T')[0]);
    setPeriodEnd(lastMonthEnd.toISOString().split('T')[0]);
  }, []);

  async function loadReports() {
    try {
      setLoading(true);
      const { data: { user } } = await supabase.auth.getUser();
      if (!user) { navigate('/investor/login'); return; }

      const { data: investorData } = await supabase
        .from('investors')
        .select('*')
        .eq('user_id', user.id)
        .single();

      setInvestor(investorData);

      const { data: reportsData } = await supabase
        .from('investor_reports')
        .select('*')
        .eq('investor_id', investorData.id)
        .order('period_end', { ascending: false });

      setReports(reportsData || []);
    } catch (error) {
      console.error('Error loading reports:', error);
    } finally {
      setLoading(false);
    }
  }

  async function handleGenerateReport() {
    if (!periodStart || !periodEnd) {
      alert('Please select a date range');
      return;
    }

    try {
      setGenerating(true);

      const { data, error } = await supabase.rpc('generate_investor_report', {
        p_investor_id: investor.id,
        p_report_type: reportType,
        p_period_start: periodStart,
        p_period_end: periodEnd,
      });

      if (error) throw error;

      alert('Report generated successfully!');
      loadReports();
    } catch (error) {
      console.error('Error generating report:', error);
      alert('Failed to generate report: ' + error.message);
    } finally {
      setGenerating(false);
    }
  }

  function formatCurrency(amount) {
    return new Intl.NumberFormat('en-US', { style: 'currency', currency: 'USD', minimumFractionDigits: 0 }).format(amount || 0);
  }

  function getReportTypeLabel(type) {
    const labels = { monthly: 'Monthly Statement', quarterly: 'Quarterly Report', annual: 'Annual Summary', tax: 'Tax Document', custom: 'Custom Report' };
    return labels[type] || type;
  }

  function getReportTypeIcon(type) {
    switch (type) {
      case 'monthly': return 'M6 2a1 1 0 00-1 1v1H4a2 2 0 00-2 2v10a2 2 0 002 2h12a2 2 0 002-2V6a2 2 0 00-2-2h-1V3a1 1 0 10-2 0v1H7V3a1 1 0 00-1-1zm0 5a1 1 0 000 2h8a1 1 0 100-2H6z';
      case 'quarterly': return 'M9 2a1 1 0 000 2h2a1 1 0 100-2H9z M4 5a2 2 0 012-2h8a2 2 0 012 2v6a2 2 0 01-2 2H6a2 2 0 01-2-2V5z';
      case 'annual': return 'M4 4a2 2 0 012-2h4.586A2 2 0 0112 2.586L15.414 6A2 2 0 0116 7.414V16a2 2 0 01-2 2H6a2 2 0 01-2-2V4z';
      case 'tax': return 'M9 2a1 1 0 000 2h2a1 1 0 100-2H9zM4 5a2 2 0 012-2 3 3 0 003 3h2a3 3 0 003-3 2 2 0 012 2v11a2 2 0 01-2 2H6a2 2 0 01-2-2V5zm3 4a1 1 0 000 2h.01a1 1 0 100-2H7zm3 0a1 1 0 000 2h3a1 1 0 100-2h-3zm-3 4a1 1 0 100 2h.01a1 1 0 100-2H7zm3 0a1 1 0 100 2h3a1 1 0 100-2h-3z';
      default: return 'M9 12h6m-6 4h6m2 5H7a2 2 0 01-2-2V5a2 2 0 012-2h5.586a1 1 0 01.707.293l5.414 5.414a1 1 0 01.293.707V19a2 2 0 01-2 2z';
    }
  }

  if (loading) {
    return (
      <InvestorLayout title="Reports & Tax Documents">
        <div style={{ display: 'flex', alignItems: 'center', justifyContent: 'center', padding: '4rem 0' }}>
          <div className="animate-spin rounded-full h-16 w-16 border-b-4 border-blue-500"></div>
        </div>
      </InvestorLayout>
    );
  }

  const statements = reports.filter(r => ['monthly', 'quarterly', 'annual', 'custom'].includes(r.report_type));
  const taxDocs = reports.filter(r => r.report_type === 'tax');

  return (
    <InvestorLayout title="Reports & Tax Documents" subtitle="View statements, generate reports, and download tax forms">

      {/* Generate Report */}
      <div style={{ ...cardStyle, padding: 24 }}>
        <h2 style={{ fontSize: 18, fontWeight: 700, color: '#111827', margin: '0 0 16px' }}>Generate New Report</h2>
        <div style={{ display: 'grid', gridTemplateColumns: '1fr 1fr 1fr auto', gap: 16, alignItems: 'end' }}>
          <div>
            <label style={{ display: 'block', color: '#6b7280', fontSize: 14, fontWeight: 500, marginBottom: 8 }}>Report Type</label>
            <select
              value={reportType}
              onChange={(e) => {
                setReportType(e.target.value);
                const now = new Date();
                if (e.target.value === 'monthly') {
                  const start = new Date(now.getFullYear(), now.getMonth() - 1, 1);
                  const end = new Date(now.getFullYear(), now.getMonth(), 0);
                  setPeriodStart(start.toISOString().split('T')[0]);
                  setPeriodEnd(end.toISOString().split('T')[0]);
                } else if (e.target.value === 'quarterly') {
                  const qStart = new Date(now.getFullYear(), Math.floor((now.getMonth() - 3) / 3) * 3, 1);
                  const qEnd = new Date(qStart.getFullYear(), qStart.getMonth() + 3, 0);
                  setPeriodStart(qStart.toISOString().split('T')[0]);
                  setPeriodEnd(qEnd.toISOString().split('T')[0]);
                } else if (e.target.value === 'annual' || e.target.value === 'tax') {
                  setPeriodStart(`${now.getFullYear() - 1}-01-01`);
                  setPeriodEnd(`${now.getFullYear() - 1}-12-31`);
                }
              }}
              style={inputStyle}
            >
              <option value="monthly">Monthly Statement</option>
              <option value="quarterly">Quarterly Report</option>
              <option value="annual">Annual Summary</option>
              <option value="tax">Tax Document</option>
              <option value="custom">Custom Range</option>
            </select>
          </div>
          <div>
            <label style={{ display: 'block', color: '#6b7280', fontSize: 14, fontWeight: 500, marginBottom: 8 }}>Start Date</label>
            <input type="date" value={periodStart} onChange={(e) => setPeriodStart(e.target.value)} style={inputStyle} />
          </div>
          <div>
            <label style={{ display: 'block', color: '#6b7280', fontSize: 14, fontWeight: 500, marginBottom: 8 }}>End Date</label>
            <input type="date" value={periodEnd} onChange={(e) => setPeriodEnd(e.target.value)} style={inputStyle} />
          </div>
          <button
            onClick={handleGenerateReport}
            disabled={generating}
            style={{
              padding: '10px 24px', backgroundColor: generating ? '#e5e7eb' : '#111827', color: generating ? '#9ca3af' : '#fff',
              borderRadius: 8, fontWeight: 600, border: 'none', cursor: generating ? 'not-allowed' : 'pointer', fontSize: 14, height: 42,
            }}
          >
            {generating ? 'Generating...' : 'Generate'}
          </button>
        </div>
      </div>

      {/* Tabs */}
      <div style={{ display: 'flex', gap: 4, borderBottom: '1px solid #e5e7eb', marginBottom: 24 }}>
        <button
          onClick={() => setActiveTab('statements')}
          style={{
            padding: '12px 24px', fontWeight: 600, fontSize: 14, border: 'none', background: 'none', cursor: 'pointer',
            borderBottom: activeTab === 'statements' ? '2px solid #111827' : '2px solid transparent',
            color: activeTab === 'statements' ? '#111827' : '#9ca3af',
          }}
        >
          Statements ({statements.length})
        </button>
        <button
          onClick={() => setActiveTab('tax')}
          style={{
            padding: '12px 24px', fontWeight: 600, fontSize: 14, border: 'none', background: 'none', cursor: 'pointer',
            borderBottom: activeTab === 'tax' ? '2px solid #111827' : '2px solid transparent',
            color: activeTab === 'tax' ? '#111827' : '#9ca3af',
          }}
        >
          Tax Documents ({taxDocs.length})
        </button>
      </div>

      {/* Reports List */}
      <div style={{ display: 'flex', flexDirection: 'column', gap: 16 }}>
        {(activeTab === 'statements' ? statements : taxDocs).map(report => (
          <div key={report.id} style={{ ...cardStyle, marginBottom: 0, padding: 24 }}>
            <div style={{ display: 'flex', alignItems: 'center', justifyContent: 'space-between' }}>
              <div style={{ display: 'flex', alignItems: 'center', gap: 16 }}>
                <div style={{ width: 48, height: 48, backgroundColor: '#eff6ff', borderRadius: 8, display: 'flex', alignItems: 'center', justifyContent: 'center' }}>
                  <svg style={{ width: 24, height: 24, color: '#3b82f6' }} fill="currentColor" viewBox="0 0 20 20">
                    <path fillRule="evenodd" d={getReportTypeIcon(report.report_type)} clipRule="evenodd" />
                  </svg>
                </div>
                <div>
                  <div style={{ color: '#111827', fontWeight: 600, fontSize: 16 }}>{getReportTypeLabel(report.report_type)}</div>
                  <div style={{ color: '#6b7280', fontSize: 14 }}>
                    {new Date(report.period_start).toLocaleDateString('en-US', { month: 'long', day: 'numeric', year: 'numeric' })}
                    {' - '}
                    {new Date(report.period_end).toLocaleDateString('en-US', { month: 'long', day: 'numeric', year: 'numeric' })}
                  </div>
                  <div style={{ color: '#9ca3af', fontSize: 12, marginTop: 4 }}>
                    Generated {report.generated_at ? new Date(report.generated_at).toLocaleDateString() : 'N/A'}
                  </div>
                </div>
              </div>

              <div style={{ display: 'flex', alignItems: 'center', gap: 16 }}>
                {report.summary && (
                  <div style={{ display: 'flex', gap: 24, fontSize: 14 }}>
                    <div style={{ textAlign: 'center' }}>
                      <div style={{ color: '#6b7280' }}>Vehicles Sold</div>
                      <div style={{ color: '#111827', fontWeight: 700 }}>{report.summary.vehicles_sold || 0}</div>
                    </div>
                    <div style={{ textAlign: 'center' }}>
                      <div style={{ color: '#6b7280' }}>Profit</div>
                      <div style={{ color: '#059669', fontWeight: 700 }}>{formatCurrency(report.summary.profit_earned)}</div>
                    </div>
                    <div style={{ textAlign: 'center' }}>
                      <div style={{ color: '#6b7280' }}>Deposits</div>
                      <div style={{ color: '#3b82f6', fontWeight: 700 }}>{formatCurrency(report.summary.deposits)}</div>
                    </div>
                  </div>
                )}

                <div style={{ display: 'flex', gap: 8 }}>
                  {report.pdf_url && (
                    <a href={report.pdf_url} target="_blank" rel="noopener noreferrer"
                      style={{ padding: '8px 16px', backgroundColor: '#fef2f2', color: '#dc2626', borderRadius: 8, fontSize: 14, fontWeight: 600, textDecoration: 'none' }}>
                      PDF
                    </a>
                  )}
                  {report.csv_url && (
                    <a href={report.csv_url} target="_blank" rel="noopener noreferrer"
                      style={{ padding: '8px 16px', backgroundColor: '#ecfdf5', color: '#059669', borderRadius: 8, fontSize: 14, fontWeight: 600, textDecoration: 'none' }}>
                      CSV
                    </a>
                  )}
                </div>
              </div>
            </div>

            {report.summary && (
              <div style={{ marginTop: 16, paddingTop: 16, borderTop: '1px solid #f3f4f6' }}>
                <div style={{ display: 'grid', gridTemplateColumns: 'repeat(4, 1fr)', gap: 16, fontSize: 14 }}>
                  <div>
                    <div style={{ color: '#6b7280' }}>Active Vehicles</div>
                    <div style={{ color: '#111827', fontWeight: 600 }}>{report.summary.vehicles_active || 0}</div>
                  </div>
                  <div>
                    <div style={{ color: '#6b7280' }}>Capital Deployed</div>
                    <div style={{ color: '#111827', fontWeight: 600 }}>{formatCurrency(report.summary.capital_deployed)}</div>
                  </div>
                  <div>
                    <div style={{ color: '#6b7280' }}>Distributions Paid</div>
                    <div style={{ color: '#059669', fontWeight: 600 }}>{formatCurrency(report.summary.distributions_paid)}</div>
                  </div>
                  <div>
                    <div style={{ color: '#6b7280' }}>Net Capital Flow</div>
                    <div style={{ fontWeight: 600, color: (report.summary.net_capital_flow || 0) >= 0 ? '#059669' : '#dc2626' }}>
                      {formatCurrency(report.summary.net_capital_flow)}
                    </div>
                  </div>
                </div>
              </div>
            )}
          </div>
        ))}

        {(activeTab === 'statements' ? statements : taxDocs).length === 0 && (
          <div style={{ textAlign: 'center', padding: 64, color: '#6b7280' }}>
            <svg style={{ width: 64, height: 64, margin: '0 auto 16px', opacity: 0.5 }} fill="none" stroke="currentColor" viewBox="0 0 24 24">
              <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M9 12h6m-6 4h6m2 5H7a2 2 0 01-2-2V5a2 2 0 012-2h5.586a1 1 0 01.707.293l5.414 5.414a1 1 0 01.293.707V19a2 2 0 01-2 2z" />
            </svg>
            <p style={{ fontSize: 18 }}>No {activeTab === 'statements' ? 'statements' : 'tax documents'} yet</p>
            <p style={{ fontSize: 14, marginTop: 8 }}>Generate your first report using the form above</p>
          </div>
        )}
      </div>

    </InvestorLayout>
  );
}
