import React, { useEffect, useState } from 'react';
import {
  Chart as ChartJS,
  CategoryScale,
  LinearScale,
  PointElement,
  LineElement,
  Title,
  Tooltip,
  Legend,
} from 'chart.js';
import { Line } from 'react-chartjs-2';
import Navbar from '../components/layout/Navbar';
import { useUser } from '../context/UserContext';
import { fetchPersonalHistory } from '../services/api';

ChartJS.register(
  CategoryScale,
  LinearScale,
  PointElement,
  LineElement,
  Title,
  Tooltip,
  Legend
);

export default function HistoryPage() {
  const { user } = useUser();
  const [data, setData] = useState(null);
  const [loading, setLoading] = useState(true);

  useEffect(() => {
    if (user) {
      fetchPersonalHistory(user.id)
        .then(res => {
          setData(res);
          setLoading(false);
        })
        .catch(err => {
          console.error(err);
          setLoading(false);
        });
    }
  }, [user]);

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
  const getChartData = (label, metricKey, color) => {
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

    return {
      labels: [...labels, ...projLabels],
      datasets: [
        {
          label: label,
          data: paddedActual,
          borderColor: color,
          backgroundColor: color,
          tension: 0.3,
        },
        {
          label: `Estimated ${label}`,
          data: paddedProjection,
          borderColor: color,
          borderDash: [5, 5], // Dotted line
          backgroundColor: 'rgba(0,0,0,0)',
          pointStyle: 'rectRot',
          tension: 0.3,
        },
      ],
    };
  };

  const options = {
    responsive: true,
    plugins: {
      legend: { position: 'top' },
    },
    scales: {
      y: { beginAtZero: true }
    }
  };

  const lastRiskProj = data.projections.risk ? Math.round(data.projections.risk[data.projections.risk.length - 1]) : null;

  return (
    <>
      <Navbar />
      <div className="container" style={{ marginTop: '2rem', paddingBottom: '2rem' }}>
        <h1>Your Wellness History</h1>
        
        {/* Burnout Risk Chart */}
        <div className="card" style={{ marginBottom: '2rem' }}>
          <h3>Burnout Risk Indicators</h3>
          <Line options={options} data={getChartData('Risk Indicator', 'risk', 'rgb(239, 68, 68)')} />
          {lastRiskProj !== null && (
            <p style={{ marginTop: '1rem', fontStyle: 'italic', color: '#64748b' }}>
              ⚠️ Based on current data trends, the model projects a potential risk score of <strong>{lastRiskProj}</strong> by the end of this period. This is an estimate, not a diagnosis.
            </p>
          )}
        </div>

        <div className="grid" style={{ gridTemplateColumns: '1fr 1fr', gap: '2rem' }}>
          <div className="card">
            <h4>Stress Levels</h4>
            <Line options={options} data={getChartData('Stress', 'stress', 'rgb(249, 115, 22)')} />
          </div>
          <div className="card">
            <h4>Sleep Hours</h4>
            <Line options={options} data={getChartData('Sleep', 'sleep', 'rgb(59, 130, 246)')} />
          </div>
          <div className="card">
            <h4>Workload</h4>
            <Line options={options} data={getChartData('Workload', 'workload', 'rgb(168, 85, 247)')} />
          </div>
          <div className="card">
            <h4>Coffee Consumption</h4>
            <Line options={options} data={getChartData('Coffee', 'coffee', 'rgb(120, 53, 15)')} />
          </div>
        </div>

        {/* Recent Activity / Notes Log */}
        {data.recentActivity && data.recentActivity.length > 0 && (
          <div className="card" style={{ marginTop: '2rem' }}>
            <h3>Recent Activity Log</h3>
            <div style={{ display: 'flex', flexDirection: 'column', gap: '1rem', marginTop: '1rem' }}>
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
          </div>
        )}
      </div>
    </>
  );
}