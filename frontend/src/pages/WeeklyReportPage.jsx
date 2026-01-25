import React, { useEffect, useState } from 'react';
import {
  Chart as ChartJS,
  CategoryScale,
  LinearScale,
  PointElement,
  LineElement,
  BarElement,
  Title,
  Tooltip,
  Legend,
} from 'chart.js';
import { Line, Bar } from 'react-chartjs-2';
import Navbar from '../components/layout/Navbar';
import { useUser } from '../context/UserContext';
import { fetchWeeklyReport } from '../services/api';

ChartJS.register(
  CategoryScale,
  LinearScale,
  PointElement,
  LineElement,
  BarElement,
  Title,
  Tooltip,
  Legend
);

export default function WeeklyReportPage() {
  const { user } = useUser();
  const [report, setReport] = useState(null);
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState('');

  useEffect(() => {
    if (user && user.companyCode) {
      fetchWeeklyReport(user.companyCode)
        .then(res => {
          setReport(res);
          setLoading(false);
        })
        .catch(err => {
          setError(err.message);
          setLoading(false);
        });
    }
  }, [user]);

  if (loading) return <div className="container"><Navbar /><p style={{marginTop: '2rem'}}>Loading report...</p></div>;
  if (error) return <div className="container"><Navbar /><div className="card" style={{marginTop: '2rem', color: 'red'}}>{error}</div></div>;

  if (report?.privacyLocked) {
    return (
      <div className="container">
        <Navbar />
        <div className="card" style={{ marginTop: '2rem', borderLeft: '5px solid #0ea5e9', backgroundColor: '#f0f9ff' }}>
          <h3 style={{color: '#0284c7', marginTop: 0}}>Report Unavailable</h3>
          <p>Detailed analytics require at least 5 active employees to ensure anonymity.</p>
          <p>Current employees: <strong>{report.employeeCount}</strong></p>
        </div>
      </div>
    );
  }

  if (!report?.datasets) {
    return (
      <div className="container">
        <Navbar />
        <div className="card" style={{ marginTop: '2rem', color: 'red' }}>
          Unable to load report data.
        </div>
      </div>
    );
  }

  // Helper to construct chart data with projections
  const getChartData = (label, metricKey, color) => {
    const actualData = report.datasets[metricKey] || [];
    const projectedData = report.projections?.[metricKey] || [];
    const labels = report.labels || [];
    const projLabels = report.projectionLabels || [];

    // Connect the lines
    const lastActual = actualData[actualData.length - 1];
    const paddedActual = [...actualData, ...new Array(projectedData.length).fill(null)];
    const paddedProjection = [...new Array(actualData.length - 1).fill(null), lastActual, ...projectedData];

    return {
      labels: [...labels, ...projLabels],
      datasets: [
        {
          label: `Avg ${label}`,
          data: paddedActual,
          borderColor: color,
          backgroundColor: color,
          tension: 0.3,
        },
        {
          label: `Estimated Trend`,
          data: paddedProjection,
          borderColor: color,
          borderDash: [5, 5],
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

  // Data for Risk Distribution Bar Chart
  const distributionData = report.riskDistribution ? {
    labels: ['Low Risk', 'Moderate', 'High Risk', 'Critical'],
    datasets: [{
      label: 'Number of Employees',
      data: [
        report.riskDistribution.low,
        report.riskDistribution.moderate,
        report.riskDistribution.high,
        report.riskDistribution.critical
      ],
      backgroundColor: ['#10b981', '#f59e0b', '#f97316', '#ef4444'],
      borderRadius: 4,
    }]
  } : null;

  return (
    <>
      <Navbar />
      <div className="container" style={{ marginTop: '2rem', paddingBottom: '2rem' }}>
        <h1>Weekly Team Report</h1>
        <p className="small">Aggregated data for {report.employeeCount} employees. Projections based on current week's trend.</p>

        {/* Risk Distribution Chart */}
        {distributionData && (
          <div className="card" style={{ marginTop: '2rem', marginBottom: '2rem' }}>
            <h3>Employee Risk Distribution</h3>
            <p className="small" style={{ marginBottom: '1rem' }}>
              This chart shows how many employees fall into each risk category. It helps identify if specific team members are struggling even if the team average looks fine.
            </p>
            <div style={{ height: '300px' }}>
              <Bar 
                data={distributionData} 
                options={{
                  responsive: true, 
                  maintainAspectRatio: false,
                  plugins: { legend: { display: false } },
                  scales: { y: { beginAtZero: true, ticks: { stepSize: 1 } } }
                }} 
              />
            </div>
          </div>
        )}

        <div className="grid" style={{ gridTemplateColumns: '1fr 1fr', gap: '2rem', marginTop: '2rem' }}>
          <div className="card">
            <h4>Team Stress</h4>
            <Line options={options} data={getChartData('Stress', 'stress', 'rgb(239, 68, 68)')} />
            <p className="small" style={{marginTop: '1rem', color: '#64748b'}}>
              Dotted line indicates estimated stress trends for the next 3 days based on current data.
            </p>
          </div>
          <div className="card">
            <h4>Team Sleep</h4>
            <Line options={options} data={getChartData('Sleep', 'sleep', 'rgb(59, 130, 246)')} />
          </div>
          <div className="card">
            <h4>Team Workload</h4>
            <Line options={options} data={getChartData('Workload', 'workload', 'rgb(168, 85, 247)')} />
          </div>
          <div className="card">
            <h4>Team Coffee Intake</h4>
            <Line options={options} data={getChartData('Coffee', 'coffee', 'rgb(120, 53, 15)')} />
          </div>
        </div>
      </div>
    </>
  );
}