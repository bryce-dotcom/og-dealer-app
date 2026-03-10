import { useState, useEffect } from 'react';
import { useNavigate } from 'react-router-dom';
import { supabase } from '../lib/supabase';

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
    // Set default period to last month
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
      <div className="flex items-center justify-center min-h-screen bg-gradient-to-br from-slate-900 via-blue-900 to-slate-900">
        <div className="animate-spin rounded-full h-16 w-16 border-b-4 border-blue-500"></div>
      </div>
    );
  }

  // Split reports by type
  const statements = reports.filter(r => ['monthly', 'quarterly', 'annual', 'custom'].includes(r.report_type));
  const taxDocs = reports.filter(r => r.report_type === 'tax');

  return (
    <div className="min-h-screen bg-gradient-to-br from-slate-900 via-blue-900 to-slate-900 p-6">
      <div className="max-w-5xl mx-auto">

        {/* Header */}
        <div className="flex justify-between items-center mb-8">
          <div>
            <h1 className="text-4xl font-bold text-white mb-2">Reports & Tax Documents</h1>
            <p className="text-blue-200">View statements, generate reports, and download tax forms</p>
          </div>
          <button
            onClick={() => navigate('/investor/dashboard')}
            className="px-6 py-3 bg-slate-700 hover:bg-slate-600 text-white rounded-lg font-semibold transition"
          >
            ← Dashboard
          </button>
        </div>

        {/* Generate Report */}
        <div className="bg-white/10 backdrop-blur-lg rounded-2xl p-6 border border-white/20 mb-8">
          <h2 className="text-xl font-bold text-white mb-4">Generate New Report</h2>
          <div className="grid grid-cols-1 md:grid-cols-4 gap-4 items-end">
            <div>
              <label className="block text-blue-200 text-sm font-medium mb-2">Report Type</label>
              <select
                value={reportType}
                onChange={(e) => {
                  setReportType(e.target.value);
                  // Auto-set date range
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
                className="w-full px-4 py-3 bg-slate-800 border border-slate-700 rounded-lg text-white focus:border-blue-500 outline-none"
              >
                <option value="monthly">Monthly Statement</option>
                <option value="quarterly">Quarterly Report</option>
                <option value="annual">Annual Summary</option>
                <option value="tax">Tax Document</option>
                <option value="custom">Custom Range</option>
              </select>
            </div>
            <div>
              <label className="block text-blue-200 text-sm font-medium mb-2">Start Date</label>
              <input
                type="date"
                value={periodStart}
                onChange={(e) => setPeriodStart(e.target.value)}
                className="w-full px-4 py-3 bg-slate-800 border border-slate-700 rounded-lg text-white focus:border-blue-500 outline-none"
              />
            </div>
            <div>
              <label className="block text-blue-200 text-sm font-medium mb-2">End Date</label>
              <input
                type="date"
                value={periodEnd}
                onChange={(e) => setPeriodEnd(e.target.value)}
                className="w-full px-4 py-3 bg-slate-800 border border-slate-700 rounded-lg text-white focus:border-blue-500 outline-none"
              />
            </div>
            <button
              onClick={handleGenerateReport}
              disabled={generating}
              className="px-6 py-3 bg-blue-600 hover:bg-blue-700 disabled:bg-slate-700 text-white rounded-lg font-semibold transition"
            >
              {generating ? 'Generating...' : 'Generate'}
            </button>
          </div>
        </div>

        {/* Tabs */}
        <div className="flex gap-2 mb-6 border-b border-white/20">
          <button
            onClick={() => setActiveTab('statements')}
            className={`px-6 py-3 font-semibold transition border-b-2 ${
              activeTab === 'statements' ? 'border-blue-500 text-blue-400' : 'border-transparent text-slate-400 hover:text-white'
            }`}
          >
            Statements ({statements.length})
          </button>
          <button
            onClick={() => setActiveTab('tax')}
            className={`px-6 py-3 font-semibold transition border-b-2 ${
              activeTab === 'tax' ? 'border-blue-500 text-blue-400' : 'border-transparent text-slate-400 hover:text-white'
            }`}
          >
            Tax Documents ({taxDocs.length})
          </button>
        </div>

        {/* Reports List */}
        <div className="space-y-4">
          {(activeTab === 'statements' ? statements : taxDocs).map(report => (
            <div key={report.id} className="bg-white/10 backdrop-blur-lg rounded-xl p-6 border border-white/20 hover:border-blue-500/50 transition">
              <div className="flex items-center justify-between">
                <div className="flex items-center gap-4">
                  <div className="w-12 h-12 bg-blue-500/20 rounded-lg flex items-center justify-center">
                    <svg className="w-6 h-6 text-blue-400" fill="currentColor" viewBox="0 0 20 20">
                      <path fillRule="evenodd" d={getReportTypeIcon(report.report_type)} clipRule="evenodd" />
                    </svg>
                  </div>
                  <div>
                    <div className="text-white font-semibold text-lg">{getReportTypeLabel(report.report_type)}</div>
                    <div className="text-blue-200 text-sm">
                      {new Date(report.period_start).toLocaleDateString('en-US', { month: 'long', day: 'numeric', year: 'numeric' })}
                      {' - '}
                      {new Date(report.period_end).toLocaleDateString('en-US', { month: 'long', day: 'numeric', year: 'numeric' })}
                    </div>
                    <div className="text-slate-400 text-xs mt-1">
                      Generated {report.generated_at ? new Date(report.generated_at).toLocaleDateString() : 'N/A'}
                    </div>
                  </div>
                </div>

                <div className="flex items-center gap-4">
                  {/* Summary Stats */}
                  {report.summary && (
                    <div className="hidden md:flex gap-6 text-sm">
                      <div className="text-center">
                        <div className="text-slate-400">Vehicles Sold</div>
                        <div className="text-white font-bold">{report.summary.vehicles_sold || 0}</div>
                      </div>
                      <div className="text-center">
                        <div className="text-slate-400">Profit</div>
                        <div className="text-green-400 font-bold">{formatCurrency(report.summary.profit_earned)}</div>
                      </div>
                      <div className="text-center">
                        <div className="text-slate-400">Deposits</div>
                        <div className="text-blue-400 font-bold">{formatCurrency(report.summary.deposits)}</div>
                      </div>
                    </div>
                  )}

                  {/* Download buttons */}
                  <div className="flex gap-2">
                    {report.pdf_url && (
                      <a href={report.pdf_url} target="_blank" rel="noopener noreferrer"
                        className="px-4 py-2 bg-red-600/20 hover:bg-red-600/40 text-red-400 rounded-lg text-sm font-semibold transition">
                        PDF
                      </a>
                    )}
                    {report.csv_url && (
                      <a href={report.csv_url} target="_blank" rel="noopener noreferrer"
                        className="px-4 py-2 bg-green-600/20 hover:bg-green-600/40 text-green-400 rounded-lg text-sm font-semibold transition">
                        CSV
                      </a>
                    )}
                  </div>
                </div>
              </div>

              {/* Expandable Summary */}
              {report.summary && (
                <div className="mt-4 pt-4 border-t border-white/10">
                  <div className="grid grid-cols-2 md:grid-cols-4 gap-4 text-sm">
                    <div>
                      <div className="text-slate-400">Active Vehicles</div>
                      <div className="text-white font-semibold">{report.summary.vehicles_active || 0}</div>
                    </div>
                    <div>
                      <div className="text-slate-400">Capital Deployed</div>
                      <div className="text-white font-semibold">{formatCurrency(report.summary.capital_deployed)}</div>
                    </div>
                    <div>
                      <div className="text-slate-400">Distributions Paid</div>
                      <div className="text-green-400 font-semibold">{formatCurrency(report.summary.distributions_paid)}</div>
                    </div>
                    <div>
                      <div className="text-slate-400">Net Capital Flow</div>
                      <div className={`font-semibold ${(report.summary.net_capital_flow || 0) >= 0 ? 'text-green-400' : 'text-red-400'}`}>
                        {formatCurrency(report.summary.net_capital_flow)}
                      </div>
                    </div>
                  </div>
                </div>
              )}
            </div>
          ))}

          {(activeTab === 'statements' ? statements : taxDocs).length === 0 && (
            <div className="text-center py-16 text-slate-400">
              <svg className="w-16 h-16 mx-auto mb-4 opacity-50" fill="none" stroke="currentColor" viewBox="0 0 24 24">
                <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M9 12h6m-6 4h6m2 5H7a2 2 0 01-2-2V5a2 2 0 012-2h5.586a1 1 0 01.707.293l5.414 5.414a1 1 0 01.293.707V19a2 2 0 01-2 2z" />
              </svg>
              <p className="text-lg">No {activeTab === 'statements' ? 'statements' : 'tax documents'} yet</p>
              <p className="text-sm mt-2">Generate your first report using the form above</p>
            </div>
          )}
        </div>

      </div>
    </div>
  );
}
