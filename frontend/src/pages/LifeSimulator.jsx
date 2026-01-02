import React, { useState } from 'react';
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
  Filler
} from 'chart.js';
import { Line } from 'react-chartjs-2';
import Navbar from '../components/layout/Navbar';
import { useUser } from '../context/UserContext';
import { calculateActionImpact, saveActionPlan } from '../services/api';
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

export default function ActionImpact() {
  const { user } = useUser();
  const [loading, setLoading] = useState(false);
  const [error, setError] = useState('');
  const [result, setResult] = useState(null);

  // Available actions configuration
  const [actions, setActions] = useState({
    vacation_days: { selected: false, value: 7 },
    sleep_hours: { selected: false, value: 8 },
    workload_reduction: { selected: false, value: 20 },
    boundary_hour: { selected: false, value: 18 }, // 18:00 = 6pm
    movement_sessions: { selected: false, value: 3 },
    social_minutes: { selected: false, value: 30 }
  });

  const toggleAction = (key) => {
    setActions(prev => ({
      ...prev,
      [key]: { ...prev[key], selected: !prev[key].selected }
    }));
    analytics.capture('simulator_adjusted', { action: key, selected: !actions[key].selected });
  };

  const updateValue = (key, val) => {
    setActions(prev => ({
      ...prev,
      [key]: { ...prev[key], value: Number(val) }
    }));
  };

  const handleSubmit = async (e) => {
    e.preventDefault();
    setError('');
    setLoading(true);
    setResult(null);

    // Build payload from selected actions
    const selectedActions = Object.entries(actions)
      .filter(([_, data]) => data.selected)
      .map(([type, data]) => ({ type, value: data.value }));

    if (selectedActions.length === 0) {
      setError('Please select at least one action to calculate impact.');
      setLoading(false);
      return;
    }

    try {
      const data = await calculateActionImpact({ userId: user.id, actions: selectedActions });
      setResult(data);
    } catch (err) {
      setError(err.message || 'Calculation failed. Please try again.');
    } finally {
      setLoading(false);
    }
  };

  const handleSave = async () => {
    if (!result) return;
    try {
      await saveActionPlan({
        userId: user.id,
        actions: result.appliedActions,
        baselineScore: result.baselineScore,
        projectedScore: result.projectedScore,
        changePercent: result.changePercent,
        trend: result.trend
      });
      alert('Action plan saved to your profile!');
    } catch (err) {
      alert('Failed to save plan: ' + err.message);
    }
  };

  return (
    <>
      <Navbar />
      <div className="container" style={{ marginTop: '2rem', paddingBottom: '3rem' }}>
        <div className="card">
          <h1>🚀 Action Impact Explorer</h1>
          <p style={{ color: '#64748b' }}>Select actions you can control to see how they lower your burnout risk.</p>

          <form onSubmit={handleSubmit} style={{ marginTop: '2rem' }}>
            <div style={{ display: 'grid', gridTemplateColumns: 'repeat(auto-fit, minmax(280px, 1fr))', gap: '1.5rem' }}>
              {/* Card 1: Vacation */}
              <ActionCard 
                title="Take Vacation Days"
                desc="Time off helps reset stress levels."
                checked={actions.vacation_days.selected}
                onToggle={() => toggleAction('vacation_days')}
              >
                <label>Days off in next 2 weeks: <strong>{actions.vacation_days.value}</strong></label>
                <input type="range" min="1" max="14" value={actions.vacation_days.value} onChange={(e) => updateValue('vacation_days', e.target.value)} />
              </ActionCard>

              {/* Card 2: Sleep */}
              <ActionCard 
                title="Prioritize Sleep"
                desc="Consistent rest improves resilience."
                checked={actions.sleep_hours.selected}
                onToggle={() => toggleAction('sleep_hours')}
              >
                <label>Target hours/night: <strong>{actions.sleep_hours.value}</strong></label>
                <input type="range" min="5" max="10" step="0.5" value={actions.sleep_hours.value} onChange={(e) => updateValue('sleep_hours', e.target.value)} />
              </ActionCard>

              {/* Card 3: Workload */}
              <ActionCard 
                title="Reduce Workload"
                desc="Delegate tasks or say no to new ones."
                checked={actions.workload_reduction.selected}
                onToggle={() => toggleAction('workload_reduction')}
              >
                <label>Reduction: <strong>{actions.workload_reduction.value}%</strong></label>
                <input type="range" min="5" max="50" step="5" value={actions.workload_reduction.value} onChange={(e) => updateValue('workload_reduction', e.target.value)} />
              </ActionCard>

              {/* Card 4: Boundaries */}
              <ActionCard 
                title="Set Boundaries"
                desc="Stop working at a specific time."
                checked={actions.boundary_hour.selected}
                onToggle={() => toggleAction('boundary_hour')}
              >
                <label>Stop work at: <strong>{actions.boundary_hour.value}:00</strong></label>
                <input type="range" min="17" max="22" value={actions.boundary_hour.value} onChange={(e) => updateValue('boundary_hour', e.target.value)} />
              </ActionCard>

              {/* Card 5: Movement */}
              <ActionCard 
                title="Add Movement"
                desc="Exercise boosts mood and energy."
                checked={actions.movement_sessions.selected}
                onToggle={() => toggleAction('movement_sessions')}
              >
                <label>Sessions per week: <strong>{actions.movement_sessions.value}</strong></label>
                <input type="range" min="1" max="7" value={actions.movement_sessions.value} onChange={(e) => updateValue('movement_sessions', e.target.value)} />
              </ActionCard>

              {/* Card 6: Social Connection */}
              <ActionCard 
                title="Social Connection"
                desc="Time spent with friends/family buffers stress."
                checked={actions.social_minutes.selected}
                onToggle={() => toggleAction('social_minutes')}
              >
                <label>Minutes per day: <strong>{actions.social_minutes.value}</strong></label>
                <input type="range" min="15" max="120" step="15" value={actions.social_minutes.value} onChange={(e) => updateValue('social_minutes', e.target.value)} />
              </ActionCard>
            </div>

            <div style={{ marginTop: '2rem', textAlign: 'center' }}>
              <button type="submit" className="quiz-button" disabled={loading} style={{ padding: '1rem 3rem', fontSize: '1.1rem' }}>
                {loading ? 'Calculating...' : 'Calculate Impact'}
              </button>
              {error && <p style={{ color: 'red', marginTop: '1rem' }}>{error}</p>}
            </div>
          </form>
        </div>

        {/* Results Section */}
        {result && (
          <div className="card" style={{ marginTop: '2rem', borderTop: `5px solid ${result.changePercent < 0 ? '#10b981' : '#ef4444'}` }}>
            <h2>Impact Analysis</h2>
            
            <div style={{ display: 'flex', flexWrap: 'wrap', gap: '2rem', alignItems: 'center', justifyContent: 'center', marginBottom: '2rem' }}>
              <div style={{ textAlign: 'center' }}>
                <div style={{ fontSize: '1rem', color: '#64748b' }}>Current Risk</div>
                <div style={{ fontSize: '2.5rem', fontWeight: 'bold' }}>{result.baselineScore}</div>
              </div>
              <div style={{ fontSize: '2rem', color: '#cbd5e1' }}>&rarr;</div>
              <div style={{ textAlign: 'center' }}>
                <div style={{ fontSize: '1rem', color: '#64748b' }}>Projected Risk</div>
                <div style={{ fontSize: '2.5rem', fontWeight: 'bold', color: result.changePercent < 0 ? '#10b981' : '#ef4444' }}>
                  {result.projectedScore}
                </div>
              </div>
              <div style={{ background: result.changePercent < 0 ? '#ecfdf5' : '#fef2f2', padding: '1rem', borderRadius: '8px', border: `1px solid ${result.changePercent < 0 ? '#10b981' : '#ef4444'}` }}>
                <span style={{ fontWeight: 'bold', color: result.changePercent < 0 ? '#047857' : '#b91c1c' }}>
                  {result.changePercent}% Change
                </span>
              </div>
            </div>

            {/* Trend Chart */}
            {result.trend && (
              <div style={{ height: '300px', marginBottom: '2rem' }}>
                <Line 
                  data={{
                    labels: result.trend.map(t => `Day ${t.day}`),
                    datasets: [
                      {
                        label: 'Projected Burnout Risk',
                        data: result.trend.map(t => t.score),
                        borderColor: result.changePercent < 0 ? '#10b981' : '#ef4444',
                        backgroundColor: result.changePercent < 0 ? 'rgba(16, 185, 129, 0.1)' : 'rgba(239, 68, 68, 0.1)',
                        fill: true,
                        tension: 0.4,
                        pointRadius: 0,
                        pointHitRadius: 10
                      },
                      {
                        label: 'Baseline',
                        data: Array(result.trend.length).fill(result.baselineScore),
                        borderColor: '#94a3b8',
                        borderDash: [5, 5],
                        pointRadius: 0
                      }
                    ]
                  }}
                  options={{ responsive: true, maintainAspectRatio: false, scales: { y: { min: 0, max: 100 } } }}
                />
              </div>
            )}

            <p style={{ textAlign: 'center', fontSize: '1.2rem', color: '#334155' }}>{result.recommendation}</p>
            
            <div style={{ marginTop: '1.5rem', textAlign: 'center' }}>
              <button className="quiz-button" style={{ backgroundColor: '#64748b', marginRight: '1rem' }} onClick={handleSave}>
                Save to Profile
              </button>
              <Link to="/employee" style={{ color: '#2563eb', textDecoration: 'none' }}>&larr; Back to Dashboard</Link>
            </div>
          </div>
        )}
      </div>
    </>
  );
}

function ActionCard({ title, desc, checked, onToggle, children }) {
  return (
    <div style={{ 
      border: checked ? '2px solid #2563eb' : '1px solid #e2e8f0', 
      borderRadius: '8px', 
      padding: '1.5rem', 
      backgroundColor: checked ? '#eff6ff' : 'white',
      transition: 'all 0.2s'
    }}>
      <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'start', marginBottom: '1rem' }}>
        <div>
          <h3 style={{ margin: 0, fontSize: '1.1rem' }}>{title}</h3>
          <p style={{ margin: '0.2rem 0 0', fontSize: '0.9rem', color: '#64748b' }}>{desc}</p>
        </div>
        <input 
          type="checkbox" 
          checked={checked} 
          onChange={onToggle}
          style={{ width: '20px', height: '20px', cursor: 'pointer' }} 
        />
      </div>
      
      <div style={{ opacity: checked ? 1 : 0.5, pointerEvents: checked ? 'auto' : 'none' }}>
        {children}
      </div>
    </div>
  );
}