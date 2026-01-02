import React, { useEffect, useState } from 'react';
import { Link } from 'react-router-dom';
import {
  Chart as ChartJS,
  CategoryScale,
  LinearScale,
  PointElement,
  LineElement,
  Title,
  Tooltip,
  Legend,
  Filler,
} from 'chart.js';
import { Line } from 'react-chartjs-2';
import Navbar from '../components/layout/Navbar';
import { useUser } from '../context/UserContext';
import { fetchPersonalHistory, fetchActionPlans, fetchPlanTracking, fetchEmployees, fetchWeeklyReport } from '../services/api';
import { analytics } from '../services/analytics';

ChartJS.register(
  CategoryScale,
  LinearScale,
  PointElement,
  LineElement,
  Title,
  Tooltip,
  Legend,
  Filler
);

const chartOptions = {
  responsive: true,
  plugins: {
    legend: { position: 'top' },
  },
  scales: {
    y: { beginAtZero: true }
  }
};

export default function HistoryPage() {
  const { user } = useUser();
  const [data, setData] = useState(null);
  const [plans, setPlans] = useState([]);
  const [loading, setLoading] = useState(true);
  const [selectedPlanIds, setSelectedPlanIds] = useState([]);
  const [showRiskTrend, setShowRiskTrend] = useState(true);
  const [showRiskConfidence, setShowRiskConfidence] = useState(true);
  const [showVarTrend, setShowVarTrend] = useState(true);
  const [showVarConfidence, setShowVarConfidence] = useState(true);
  const [isMetricsExpanded, setIsMetricsExpanded] = useState(false);
  const [isActivityLogExpanded, setIsActivityLogExpanded] = useState(false);
  const [filterStart, setFilterStart] = useState('');
  const [filterEnd, setFilterEnd] = useState('');
  const [trackingLogs, setTrackingLogs] = useState([]);
  const [isTrackingLogExpanded, setIsTrackingLogExpanded] = useState(false);
  const [coworkerCount, setCoworkerCount] = useState(0);
  const [teamData, setTeamData] = useState(null);

  const loadData = () => {
    if (!user) return;
    setLoading(true);
    Promise.all([
      fetchPersonalHistory(user.id, filterStart, filterEnd),
      fetchActionPlans(user.id).catch(() => [])
    ])
      .then(([historyData, plansData]) => {
        setData(historyData);
        setPlans(plansData);
        setLoading(false);

        // Fetch Team Data if in a company
        if (user.companyCode) {
          fetchEmployees(user.companyCode)
            .then(emps => {
              setCoworkerCount(emps.length);
              if (emps.length >= 5) {
                return fetchWeeklyReport(user.companyCode);
              }
            })
            .then(report => {
              if (report && !report.privacyLocked) setTeamData(report);
            })
            .catch(err => console.error("Team data fetch error", err));
        }
      })
      .catch(err => {
        console.error(err);
        setLoading(false);
      });
  };

  useEffect(() => {
    if (user) {
      analytics.capture('history_viewed');
      loadData();
    }
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [user]);

  // Fetch tracking logs for the latest plan
  useEffect(() => {
    if (plans.length > 0) {
      const latest = plans[plans.length - 1];
      fetchPlanTracking(latest.id)
        .then(logs => setTrackingLogs(logs.reverse())) // Newest first
        .catch(err => console.error("Failed to load tracking logs", err));
    }
  }, [plans]);

  if (loading) return <div className="container"><Navbar /><p style={{marginTop: '2rem'}}>Loading history...</p></div>;
  if (!data || !data.datasets || data.totalCheckins === 0) {
    return (
      <>
        <Navbar />
        <div className="container" style={{marginTop: '2rem'}}>
          <div className="card">
            <h2>No History Yet</h2>
            <p>Submit your first daily check-in to see your trends!</p>
          </div>
        </div>
      </>
    );
  }

  // Helper to construct chart data with projections
  const getChartData = (label, metricKey, color, enableTrend, enableConfidence) => {
    const actualData = data.datasets[metricKey] || [];
    const projectedData = data.projections[metricKey] || [];
    const labels = data.labels || [];
    const projLabels = data.projectionLabels || [];

    // Connect the lines: The projection should start from the last actual point
    const lastActual = actualData[actualData.length - 1];
    
    // Pad actual data with nulls for the projection period
    const paddedActual = [...actualData, ...Array(projectedData.length).fill(null)];
    
    // Pad projection data: nulls for history, then last actual point, then projection
    // We use actualData.length - 1 because we want to overwrite the last point to connect them
    const paddedProjection = [...Array(actualData.length - 1).fill(null), lastActual, ...projectedData];

    const datasets = [
        {
          label: label,
          data: paddedActual,
          borderColor: color,
          backgroundColor: color,
          tension: 0.3,
          order: 1,
        },
      ];

    if (enableTrend) {
      datasets.push({
          label: `Estimated ${label}`,
          data: paddedProjection,
          borderColor: color,
          borderDash: [5, 5], // Dotted line
          backgroundColor: 'rgba(0,0,0,0)',
          pointStyle: 'rectRot',
          tension: 0.3,
          order: 1,
      });
    }

    // Add Confidence Interval if available and enabled
    const confidenceKey = metricKey + 'Confidence';
    if (enableConfidence && data.projections[confidenceKey]) {
      const { upper, lower, volatility } = data.projections[confidenceKey];
      
      // Pad bounds: nulls for history, then last actual point (to connect), then bounds
      const paddedUpper = [...Array(actualData.length - 1).fill(null), lastActual, ...upper];
      const paddedLower = [...Array(actualData.length - 1).fill(null), lastActual, ...lower];

      // Calculate opacity based on volatility
      // Stable (low vol) -> Darker (high opacity, e.g., 0.5)
      // Volatile (high vol) -> Lighter (low opacity, e.g., 0.1)
      const opacity = Math.max(0.1, Math.min(0.5, 3 / ((volatility || 5) + 1)));

      datasets.push({
        label: 'Confidence Upper',
        data: paddedUpper,
        borderColor: 'transparent',
        backgroundColor: 'transparent',
        pointRadius: 0,
        fill: false,
        tension: 0.3,
        order: 2, // Draw behind lines
      });

      datasets.push({
        label: 'Confidence Interval',
        data: paddedLower,
        borderColor: 'transparent',
        backgroundColor: color.replace('rgb', 'rgba').replace(')', `, ${opacity})`), // Dynamic opacity
        pointRadius: 0,
        fill: '-1', // Fill to previous dataset (Upper)
        tension: 0.3,
        order: 2,
      });
    }

    return {
      labels: [...labels, ...projLabels],
      datasets: datasets,
    };
  };

  const latestPlan = plans.length > 0 ? plans[plans.length - 1] : null;

  const lastRiskProj = data.projections.risk ? Math.round(data.projections.risk[data.projections.risk.length - 1]) : null;

  const handlePlanSelect = (planId) => {
    setSelectedPlanIds(prev => {
      if (prev.includes(planId)) {
        return prev.filter(id => id !== planId);
      }
      if (prev.length >= 2) {
        return [prev[1], planId]; // Shift: remove first, add new
      }
      return [...prev, planId];
    });
  };

  const handleExportCSV = () => {
    if (!data || !data.datasets) return;

    // Use full dates if available (from backend update), otherwise fallback to chart labels
    const timeLabels = data.dates || data.labels;
    
    const headers = ['Date', 'Risk Score', 'Stress Level', 'Sleep Hours', 'Workload', 'Coffee Consumption'];
    const rows = timeLabels.map((dateVal, index) => {
      const dateStr = data.dates ? new Date(dateVal).toLocaleDateString() : dateVal;
      return [
        `"${dateStr}"`,
        data.datasets.risk[index],
        data.datasets.stress[index],
        data.datasets.sleep[index],
        data.datasets.workload[index],
        data.datasets.coffee[index]
      ].join(',');
    });

    const csvContent = [headers.join(','), ...rows].join('\n');
    const blob = new Blob([csvContent], { type: 'text/csv;charset=utf-8;' });
    const url = URL.createObjectURL(blob);
    const link = document.createElement('a');
    link.setAttribute('href', url);
    link.setAttribute('download', `wellness_history_${new Date().toISOString().split('T')[0]}.csv`);
    document.body.appendChild(link);
    link.click();
    document.body.removeChild(link);
  };

  const comparePlans = plans.filter(p => selectedPlanIds.includes(p.id));

  const formatActionType = (type) => type.split('_').map(w => w.charAt(0).toUpperCase() + w.slice(1)).join(' ');

  // Mock data for locked state
  const lockedChartData = {
    labels: ['Mon', 'Tue', 'Wed', 'Thu', 'Fri', 'Sat', 'Sun'],
    datasets: [
      {
        label: 'Your Stress',
        data: [4, 5, 6, 5, 4, 3, 3],
        borderColor: '#94a3b8',
        backgroundColor: '#94a3b8',
        tension: 0.4
      },
      {
        label: 'Team Average',
        data: [5, 5, 5, 6, 5, 4, 4],
        borderColor: '#cbd5e1',
        backgroundColor: '#cbd5e1',
        borderDash: [5, 5],
        tension: 0.4
      }
    ]
  };

  const copyInvite = () => {
    navigator.clipboard.writeText(user.companyCode);
    alert(`Company Code ${user.companyCode} copied! Share it with a coworker.`);
  };

  return (
    <>
      <Navbar streak={data?.streak} />
      <div className="container" style={{ marginTop: '2rem', paddingBottom: '2rem' }}>
        <h1>Your Wellness History</h1>

        {/* Driving Factor Card */}
        {data && data.topBurnoutFactor && data.topBurnoutFactor.topFactor !== 'N/A' && (
           <div className="card" style={{ marginBottom: '2rem', borderLeft: '5px solid #f59e0b', backgroundColor: '#fffbeb' }}>
              <h3 style={{ color: '#d97706', marginTop: 0 }}>Primary Driver</h3>
              <div style={{ display: 'flex', alignItems: 'baseline', gap: '1rem' }}>
                <span style={{ fontSize: '2rem', fontWeight: 'bold', color: '#92400e' }}>
                  {data.topBurnoutFactor.topFactor}
                </span>
                <span style={{ color: '#92400e', fontSize: '1.1rem' }}>
                  ({data.topBurnoutFactor.contributionPercent}% contribution)
                </span>
              </div>
              <p style={{ marginBottom: 0, color: '#92400e' }}>
                This factor currently has the highest correlation with your burnout risk score.
              </p>
           </div>
        )}

        {/* Date Filter */}
        <div className="card" style={{ marginBottom: '1.5rem', padding: '1rem', display: 'flex', alignItems: 'center', gap: '1rem', flexWrap: 'wrap' }}>
          <div style={{ display: 'flex', alignItems: 'center', gap: '0.5rem' }}>
            <label style={{ fontWeight: '500', color: '#334155' }}>From:</label>
            <input type="date" value={filterStart} onChange={(e) => setFilterStart(e.target.value)} style={{ padding: '0.5rem', borderRadius: '4px', border: '1px solid #cbd5e1' }} />
          </div>
          <div style={{ display: 'flex', alignItems: 'center', gap: '0.5rem' }}>
            <label style={{ fontWeight: '500', color: '#334155' }}>To:</label>
            <input type="date" value={filterEnd} onChange={(e) => setFilterEnd(e.target.value)} style={{ padding: '0.5rem', borderRadius: '4px', border: '1px solid #cbd5e1' }} />
          </div>
          <button onClick={loadData} className="quiz-button" style={{ padding: '0.5rem 1.5rem', fontSize: '0.9rem', marginLeft: 'auto' }}>
            Filter
          </button>
          <button onClick={handleExportCSV} className="quiz-button" style={{ padding: '0.5rem 1.5rem', fontSize: '0.9rem', marginLeft: '0.5rem', backgroundColor: '#64748b' }}>
            Export CSV
          </button>
          {(filterStart || filterEnd) && <button onClick={() => { setFilterStart(''); setFilterEnd(''); setTimeout(loadData, 0); }} style={{ background: 'none', border: 'none', color: '#64748b', cursor: 'pointer', textDecoration: 'underline' }}>Clear</button>}
        </div>
        
        <div style={{ display: 'flex', gap: '1rem', marginBottom: '1rem', justifyContent: 'flex-end' }}>
          <button 
            onClick={() => setShowRiskTrend(!showRiskTrend)} 
            title="Shows the projected future direction based on your recent data."
            style={{ padding: '0.5rem 1rem', cursor: 'pointer', background: showRiskTrend ? '#e0f2fe' : '#f1f5f9', border: '1px solid #cbd5e1', borderRadius: '4px', color: '#334155', fontWeight: '500' }}
          >
            {showRiskTrend ? 'Hide Risk Trend' : 'Show Risk Trend'}
          </button>
          <button 
            onClick={() => setShowRiskConfidence(!showRiskConfidence)} 
            title="The shaded area represents the range of probable outcomes. A wider area means more uncertainty."
            style={{ padding: '0.5rem 1rem', cursor: 'pointer', background: showRiskConfidence ? '#e0f2fe' : '#f1f5f9', border: '1px solid #cbd5e1', borderRadius: '4px', color: '#334155', fontWeight: '500' }}
          >
            {showRiskConfidence ? 'Hide Risk Confidence' : 'Show Risk Confidence'}
          </button>
        </div>

        {/* Burnout Risk Chart */}
        <div className="card" style={{ marginBottom: '2rem' }}>
          <h3>Burnout Risk Indicators</h3>
          <Line options={chartOptions} data={getChartData('Risk Indicator', 'risk', 'rgb(239, 68, 68)', showRiskTrend, showRiskConfidence)} />
          {lastRiskProj !== null && (
            <p style={{ marginTop: '1rem', fontStyle: 'italic', color: '#64748b' }}>
              ⚠️ Based on current data trends, the model projects a potential risk score of <strong>{lastRiskProj}</strong> by the end of this period. This is an estimate, not a diagnosis.
            </p>
          )}
        </div>

        {/* Team Comparison (Locked/Unlocked) */}
        <div className="card" style={{ marginBottom: '2rem', position: 'relative', overflow: 'hidden' }}>
          <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'center' }}>
            <h3>Team Comparison</h3>
            {coworkerCount >= 5 && <span style={{ fontSize: '0.8rem', color: '#10b981', background: '#ecfdf5', padding: '2px 8px', borderRadius: '12px' }}>Unlocked</span>}
          </div>
          
          {coworkerCount < 5 ? (
            // LOCKED STATE
            <div style={{ position: 'relative' }}>
              <div style={{ filter: 'blur(4px) grayscale(100%)', opacity: 0.4, pointerEvents: 'none' }}>
                <Line options={{...chartOptions, plugins: { legend: { display: false } }}} data={lockedChartData} />
              </div>
              <div style={{ 
                position: 'absolute', top: 0, left: 0, right: 0, bottom: 0, 
                display: 'flex', flexDirection: 'column', alignItems: 'center', justifyContent: 'center',
                zIndex: 10
              }}>
                <div style={{ fontSize: '3rem', marginBottom: '0.5rem' }}>🔒</div>
                <h4 style={{ margin: '0 0 0.5rem 0', color: '#334155' }}>Unlock Team Insights</h4>
                <p style={{ color: '#64748b', marginBottom: '1.5rem', textAlign: 'center', maxWidth: '400px' }}>
                  You need a group of at least 5 coworkers to compare your stress trends anonymously.
                </p>
                <button className="quiz-button" onClick={copyInvite}>
                  Copy Invite Code: {user.companyCode || '...'}
                </button>
              </div>
            </div>
          ) : (
            // UNLOCKED STATE
            <div>
              <p className="small" style={{ marginBottom: '1rem' }}>Comparing your stress levels with the anonymous team average this week.</p>
              <Line options={chartOptions} data={{
                labels: teamData?.labels || ['Mon', 'Tue', 'Wed', 'Thu', 'Fri'],
                datasets: [
                  {
                    label: 'You',
                    data: data.datasets.stress.slice(-teamData?.labels?.length || -5), // Align roughly
                    borderColor: '#2563eb',
                    backgroundColor: '#2563eb',
                    tension: 0.3
                  },
                  {
                    label: 'Team Average',
                    data: teamData?.datasets?.stress || [],
                    borderColor: '#10b981',
                    backgroundColor: '#10b981',
                    borderDash: [5, 5],
                    tension: 0.3
                  }
                ]
              }} />
            </div>
          )}
        </div>

        {/* Action Plans History Chart */}
        {plans.length > 0 && (
          <div className="card" style={{ marginBottom: '2rem', borderLeft: '5px solid #10b981' }}>
            <h3>Latest Action Plan Projection</h3>
            <p className="small">
              Projected impact of your most recent action plan ({new Date(latestPlan.createdAt).toLocaleDateString()}).
            </p>
            <div style={{ height: '300px' }}>
              {latestPlan && latestPlan.trend ? (
                <Line 
                  data={{
                    labels: latestPlan.trend.map(t => `Day ${t.day}`),
                    datasets: [
                      {
                        label: 'Projected Burnout Risk',
                        data: latestPlan.trend.map(t => t.score),
                        borderColor: '#10b981',
                        backgroundColor: 'rgba(16, 185, 129, 0.1)',
                        fill: true,
                        tension: 0.4,
                        pointRadius: 0,
                        pointHitRadius: 10
                      },
                      {
                        label: 'Baseline',
                        data: Array(latestPlan.trend.length).fill(latestPlan.baselineScore),
                        borderColor: '#94a3b8',
                        borderDash: [5, 5],
                        pointRadius: 0
                      }
                    ]
                  }}
                  options={{ responsive: true, maintainAspectRatio: false, scales: { y: { min: 0, max: 100 } } }}
                />
              ) : (
                <p style={{ textAlign: 'center', padding: '2rem', color: '#64748b' }}>
                  No trend data available for this plan.
                </p>
              )}
            </div>

            {/* Comparison UI */}
            <div style={{ marginTop: '2rem', borderTop: '1px solid #e2e8f0', paddingTop: '1.5rem' }}>
              <h4>Compare Action Plans</h4>
              <p className="small" style={{ marginBottom: '1rem' }}>Select two plans below to compare them side-by-side.</p>
              
              <div style={{ display: 'flex', gap: '1rem', overflowX: 'auto', paddingBottom: '1rem' }}>
                {[...plans].reverse().map(plan => (
                  <div 
                    key={plan.id} 
                    onClick={() => handlePlanSelect(plan.id)}
                    style={{
                      minWidth: '220px',
                      padding: '1rem',
                      border: selectedPlanIds.includes(plan.id) ? '2px solid #2563eb' : '1px solid #e2e8f0',
                      borderRadius: '8px',
                      cursor: 'pointer',
                      backgroundColor: selectedPlanIds.includes(plan.id) ? '#eff6ff' : 'white',
                      transition: 'all 0.2s'
                    }}
                  >
                    <div style={{ fontWeight: 'bold', marginBottom: '0.5rem', color: '#334155' }}>
                      {new Date(plan.createdAt).toLocaleDateString()}
                    </div>
                    <div style={{ fontSize: '0.9rem', color: '#64748b' }}>
                      Risk: <span style={{ fontWeight: 'bold', color: plan.projectedScore < plan.baselineScore ? '#10b981' : '#ef4444' }}>{plan.projectedScore}</span> <span style={{fontSize: '0.8em'}}>(was {plan.baselineScore})</span>
                    </div>
                  </div>
                ))}
              </div>

              {comparePlans.length === 2 && (
                <div style={{ marginTop: '1.5rem', display: 'grid', gridTemplateColumns: '1fr 1fr', gap: '1.5rem' }}>
                  {comparePlans.map((plan, idx) => (
                    <div key={plan.id} style={{ border: '1px solid #cbd5e1', borderRadius: '8px', padding: '1.5rem', backgroundColor: '#f8fafc' }}>
                      <h5 style={{ marginTop: 0, color: '#334155', borderBottom: '1px solid #e2e8f0', paddingBottom: '0.5rem' }}>
                        Plan {idx + 1} ({new Date(plan.createdAt).toLocaleDateString()})
                      </h5>
                      
                      <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'center', marginBottom: '1.5rem' }}>
                        <div>
                          <div className="small" style={{color: '#64748b'}}>Impact</div>
                          <div style={{ fontSize: '1.8rem', fontWeight: 'bold', color: plan.changePercent < 0 ? '#10b981' : '#ef4444' }}>
                            {plan.changePercent > 0 ? '+' : ''}{plan.changePercent}%
                          </div>
                        </div>
                        <div style={{ textAlign: 'right' }}>
                           <div className="small" style={{color: '#64748b'}}>Projected Score</div>
                           <div style={{ fontSize: '1.5rem', fontWeight: 'bold' }}>{plan.projectedScore}</div>
                        </div>
                      </div>
                      
                      <h6 style={{ marginBottom: '0.5rem', color: '#475569' }}>Actions Taken:</h6>
                      <ul style={{ paddingLeft: '1.2rem', margin: 0, color: '#334155' }}>
                        {plan.actions && plan.actions.map((action, i) => (
                          <li key={i} style={{ marginBottom: '0.5rem' }}>
                            <strong>{formatActionType(action.type)}</strong>: {action.value}
                          </li>
                        ))}
                      </ul>
                    </div>
                  ))}
                </div>
              )}
            </div>
          </div>
        )}

        <div 
          onClick={() => setIsMetricsExpanded(!isMetricsExpanded)}
          style={{ display: 'flex', alignItems: 'center', gap: '0.5rem', marginTop: '2rem', marginBottom: '1rem', cursor: 'pointer', userSelect: 'none' }}
        >
          <h3 style={{ margin: 0 }}>Detailed Metrics</h3>
          <span style={{ fontSize: '1.2rem', color: '#64748b' }}>{isMetricsExpanded ? '▼' : '▶'}</span>
        </div>

        {isMetricsExpanded && (
          <>
            <div style={{ display: 'flex', justifyContent: 'flex-end', gap: '1rem', marginBottom: '1rem' }}>
              <button 
                onClick={() => setShowVarTrend(!showVarTrend)} 
                title="Shows projected trends for these metrics."
                style={{ padding: '0.5rem 1rem', cursor: 'pointer', background: showVarTrend ? '#e0f2fe' : '#f1f5f9', border: '1px solid #cbd5e1', borderRadius: '4px', color: '#334155', fontWeight: '500', fontSize: '0.9rem' }}
              >
                {showVarTrend ? 'Hide Trends' : 'Show Trends'}
              </button>
              <button 
                onClick={() => setShowVarConfidence(!showVarConfidence)} 
                title="The shaded area shows the expected range for this metric based on your past trends."
                style={{ padding: '0.5rem 1rem', cursor: 'pointer', background: showVarConfidence ? '#e0f2fe' : '#f1f5f9', border: '1px solid #cbd5e1', borderRadius: '4px', color: '#334155', fontWeight: '500', fontSize: '0.9rem' }}
              >
                {showVarConfidence ? 'Hide Confidence' : 'Show Confidence'}
              </button>
            </div>

            <div className="grid" style={{ gridTemplateColumns: '1fr 1fr', gap: '2rem' }}>
              <div className="card">
                <h4>Stress Levels</h4>
                <Line options={chartOptions} data={getChartData('Stress', 'stress', 'rgb(249, 115, 22)', showVarTrend, showVarConfidence)} />
              </div>
              <div className="card">
                <h4>Sleep Hours</h4>
                <Line options={chartOptions} data={getChartData('Sleep', 'sleep', 'rgb(59, 130, 246)', showVarTrend, showVarConfidence)} />
              </div>
              <div className="card">
                <h4>Workload</h4>
                <Line options={chartOptions} data={getChartData('Workload', 'workload', 'rgb(168, 85, 247)', showVarTrend, showVarConfidence)} />
              </div>
              <div className="card">
                <h4>Coffee Consumption</h4>
                <Line options={chartOptions} data={getChartData('Coffee', 'coffee', 'rgb(120, 53, 15)', showVarTrend, showVarConfidence)} />
              </div>
            </div>
          </>
        )}

        {/* Action Adherence Log */}
        {trackingLogs.length > 0 && (
          <div className="card" style={{ marginTop: '2rem' }}>
            <div 
              onClick={() => setIsTrackingLogExpanded(!isTrackingLogExpanded)}
              style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'center', cursor: 'pointer', userSelect: 'none' }}
            >
              <h3 style={{ margin: 0 }}>Action Adherence Log</h3>
              <span style={{ fontSize: '1.2rem', color: '#64748b' }}>{isTrackingLogExpanded ? '▼' : '▶'}</span>
            </div>
            
            {isTrackingLogExpanded && (
              <div style={{ marginTop: '1rem', borderTop: '1px solid #eee', paddingTop: '1rem' }}>
                <table style={{ width: '100%', borderCollapse: 'collapse', fontSize: '0.9rem' }}>
                  <thead>
                    <tr style={{ textAlign: 'left', color: '#64748b' }}>
                      <th style={{ paddingBottom: '0.5rem' }}>Date</th>
                      <th style={{ paddingBottom: '0.5rem' }}>Action</th>
                      <th style={{ paddingBottom: '0.5rem' }}>Status</th>
                      <th style={{ paddingBottom: '0.5rem' }}>Note</th>
                    </tr>
                  </thead>
                  <tbody>
                    {trackingLogs.map((log) => {
                      const data = typeof log.data === 'string' ? JSON.parse(log.data) : log.data;
                      return Object.entries(data).map(([action, details], idx) => (
                        <tr key={`${log.id}-${idx}`} style={{ borderBottom: '1px solid #f1f5f9' }}>
                          <td style={{ padding: '0.5rem 0' }}>{new Date(log.date).toLocaleDateString()}</td>
                          <td style={{ padding: '0.5rem 0', textTransform: 'capitalize' }}>{action.replace(/_/g, ' ')}</td>
                          <td style={{ padding: '0.5rem 0' }}>
                            {(details === true || details.completed) ? 
                              <span style={{ color: '#10b981', fontWeight: 'bold' }}>Completed</span> : 
                              <span style={{ color: '#ef4444', fontWeight: 'bold' }}>Missed</span>
                            }
                          </td>
                          <td style={{ padding: '0.5rem 0', color: '#64748b', fontStyle: 'italic' }}>
                            {details.reason || '-'}
                          </td>
                        </tr>
                      ));
                    })}
                  </tbody>
                </table>
              </div>
            )}
          </div>
        )}

        {/* Recent Activity / Notes Log */}
        {data.recentActivity && data.recentActivity.length > 0 && (
          <div className="card" style={{ marginTop: '2rem' }}>
            <div 
              onClick={() => setIsActivityLogExpanded(!isActivityLogExpanded)}
              style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'center', cursor: 'pointer', userSelect: 'none' }}
            >
              <h3 style={{ margin: 0 }}>Recent Activity Log</h3>
              <span style={{ fontSize: '1.2rem', color: '#64748b' }}>{isActivityLogExpanded ? '▼' : '▶'}</span>
            </div>
            
            {isActivityLogExpanded && (
            <div style={{ display: 'flex', flexDirection: 'column', gap: '1rem', marginTop: '1rem', borderTop: '1px solid #eee', paddingTop: '1rem' }}>
              {data.recentActivity.map((item) => (
                <div key={item.id} style={{ padding: '1rem', borderBottom: '1px solid #eee', display: 'flex', flexDirection: 'column', gap: '0.5rem' }}>
                  <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'center' }}>
                    <span style={{ fontWeight: 'bold', color: '#334155' }}>
                      {new Date(item.date).toLocaleDateString(undefined, { weekday: 'short', month: 'short', day: 'numeric' })}
                    </span>
                    <span style={{ fontSize: '0.9rem', padding: '4px 8px', borderRadius: '4px', backgroundColor: '#f1f5f9', color: '#64748b' }}>
                      Stress: {item.stress}/10
                    </span>
                  </div>
                  {item.note ? (
                    <p style={{ margin: 0, color: '#475569', fontStyle: 'italic' }}>"{item.note}"</p>
                  ) : (
                    <p style={{ margin: 0, color: '#94a3b8', fontSize: '0.9rem' }}>No note added.</p>
                  )}
                </div>
              ))}
            </div>
            )}
          </div>
        )}

        <div style={{ marginTop: '2rem', textAlign: 'center' }}>
          <Link to="/employee" style={{ color: '#64748b', textDecoration: 'none', fontSize: '0.9rem' }}>
            &larr; Back to Dashboard
          </Link>
        </div>
      </div>
    </>
  );
}