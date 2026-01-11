import React from 'react';
import { Line, Radar, Doughnut, Pie } from 'react-chartjs-2';
import { simulateEmployerAction } from '../../services/api';

const SIM_ACTION_TYPES = [
  { id: 'workload', label: 'Reduce Workload', desc: 'Decrease task volume & scope.', inputLabel: 'Intensity', max: 100, unit: '%' },
  { id: 'recovery', label: 'Recovery Protocol', desc: 'Mandatory breaks & sleep hygiene.', inputLabel: 'Intensity', max: 100, unit: '%' },
  { id: 'boundaries', label: 'Enforce Boundaries', desc: 'Hard stop on emails/messages.', inputLabel: 'Strictness', max: 100, unit: '%' },
  { id: 'behavioral', label: 'Resilience Training', desc: 'Workshops & coaching sessions.', inputLabel: 'Sessions/Month', max: 8, unit: '' }
];

export default function SimulatorTab({ 
  user, 
  simPlan, 
  setSimPlan, 
  simResults, 
  setSimResults, 
  simLoading, 
  setSimLoading, 
  simWeek, 
  setSimWeek, 
  handleSaveSimulation,
  toggleSimAction,
  updateSimAction,
  cleanChartOptions
}) {

  // --- Simulation Chart Generators ---
  const getSimRadarData = (dayIndex) => {
    if (!simResults || !simResults.timeline[dayIndex]) return null;
    const data = simResults.timeline[dayIndex];
    return {
      labels: ['Stress', 'Sleep', 'Workload', 'Coffee'],
      datasets: [
        {
          label: `Week ${Math.floor(dayIndex/7)} Projection`,
          data: [data.stress || 0, data.sleep || 0, data.workload || 0, data.coffee || 0],
          backgroundColor: 'rgba(37, 99, 235, 0.2)',
          borderColor: '#2563eb',
          pointBackgroundColor: '#2563eb',
        },
        {
          label: 'Ideal Baseline',
          data: [3, 8, 5, 1],
          backgroundColor: 'rgba(16, 185, 129, 0.1)',
          borderColor: '#10b981',
          pointBackgroundColor: '#10b981',
          borderDash: [5, 5]
        }
      ]
    };
  };

  const getSimRiskDistData = (dayIndex) => {
    if (!simResults || !simResults.timeline[dayIndex]) return null;
    const dist = simResults.timeline[dayIndex].distribution;
    if (!dist) return null;
    return {
      labels: ['Low', 'Moderate', 'High', 'Critical'],
      datasets: [{
        data: [dist.low, dist.moderate, dist.high, dist.critical],
        backgroundColor: ['#10b981', '#f59e0b', '#f97316', '#ef4444'],
        borderWidth: 0,
      }]
    };
  };

  const getSimDriverData = (dayIndex) => {
    if (!simResults || !simResults.timeline[dayIndex]) return null;
    const data = simResults.timeline[dayIndex];
    return {
      labels: ['Stress', 'Sleep Quality', 'Workload', 'Caffeine'],
      datasets: [{
        data: [data.stress || 0, 10 - (data.sleep || 0), data.workload || 0, data.coffee || 0],
        backgroundColor: ['#ef4444', '#3b82f6', '#8b5cf6', '#78350f'],
        borderColor: ['#ef4444', '#3b82f6', '#8b5cf6', '#78350f'],
        borderWidth: 1,
      }]
    };
  };

  return (
    <div className="fade-in">
      <div className="grid" style={{ gridTemplateColumns: '1fr 2fr', gap: '2rem', alignItems: 'start' }}>
        
        {/* Configuration Panel */}
        <div className="card">
          <h3>Configure Action Plan</h3>
          <p className="small">Define interventions to simulate their impact on your workforce.</p>
          
          <div style={{ marginBottom: '1rem' }}>
            <label style={{ display: 'block', marginBottom: '0.5rem', fontWeight: 'bold', fontSize: '0.9rem' }}>Plan Name</label>
            <input 
              type="text" 
              value={simPlan.name} 
              onChange={e => setSimPlan({...simPlan, name: e.target.value})}
              style={{ width: '100%', padding: '8px', border: '1px solid #cbd5e1', borderRadius: '4px' }}
            />
          </div>

          <h4 style={{marginTop: '1.5rem', marginBottom: '0.5rem'}}>Select Interventions</h4>
          <div style={{ display: 'grid', gridTemplateColumns: '1fr', gap: '1rem', marginBottom: '1.5rem' }}>
            {SIM_ACTION_TYPES.map(type => {
              const actionState = simPlan.actions.find(a => a.type === type.id);
              const isSelected = !!actionState;
              const displayValue = isSelected 
                ? (type.id === 'behavioral' ? Math.round((actionState.intensity / 100) * 4) : actionState.intensity)
                : 0;

              return (
                <div key={type.id} style={{ 
                  border: isSelected ? '1px solid #2563eb' : '1px solid #e2e8f0',
                  borderLeft: isSelected ? '5px solid #2563eb' : '1px solid #e2e8f0',
                  borderRadius: '6px',
                  padding: '1.2rem',
                  backgroundColor: isSelected ? '#f8fafc' : 'white',
                  boxShadow: isSelected ? '0 4px 6px -1px rgba(0, 0, 0, 0.1)' : 'none',
                  cursor: 'pointer',
                  transition: 'all 0.2s'
                }}
                onClick={(e) => {
                    if(e.target.tagName === 'INPUT' || e.target.tagName === 'LABEL') return;
                    toggleSimAction(type.id);
                }}
                >
                  <div style={{display: 'flex', justifyContent: 'space-between', alignItems: 'center', marginBottom: '0.5rem'}}>
                    <strong style={{ fontSize: '1rem', color: isSelected ? '#1e293b' : '#475569' }}>{type.label}</strong>
                    <div style={{ width: '20px', height: '20px', borderRadius: '50%', border: isSelected ? '5px solid #2563eb' : '2px solid #cbd5e1', backgroundColor: 'white', transition: 'all 0.2s' }} />
                  </div>
                  <p className="small" style={{marginBottom: isSelected ? '1rem' : 0, color: '#64748b', lineHeight: '1.4'}}>{type.desc}</p>
                  
                  {isSelected && (
                    <div onClick={e => e.stopPropagation()} className="fade-in" style={{ paddingTop: '1rem', borderTop: '1px solid #e2e8f0' }}>
                      <div style={{ marginBottom: '0.5rem' }}>
                        <label style={{ fontSize: '0.85rem', fontWeight: '600', display: 'block', marginBottom: '0.25rem', color: '#334155' }}>
                          {type.inputLabel}: {displayValue} {type.unit}
                        </label>
                        <input type="range" min="1" max={type.max} value={displayValue} onChange={(e) => { const val = Number(e.target.value); const intensity = type.id === 'behavioral' ? (val / 4) * 100 : val; updateSimAction(type.id, 'intensity', intensity); }} style={{ width: '100%' }} />
                      </div>
                      <div>
                        <label style={{ fontSize: '0.85rem', fontWeight: '600', display: 'block', marginBottom: '0.25rem', color: '#334155' }}>Adherence: {actionState.adherence}%</label>
                        <input type="range" min="0" max="100" value={actionState.adherence} onChange={(e) => updateSimAction(type.id, 'adherence', e.target.value)} style={{ width: '100%' }} />
                      </div>
                    </div>
                  )}
                </div>
              );
            })}
          </div>

          <div style={{ marginBottom: '1rem' }}>
            <label style={{ display: 'block', marginBottom: '0.5rem', fontWeight: 'bold', fontSize: '0.9rem' }}>Avg Hourly Cost ($)</label>
            <input type="number" min="0" value={simPlan.avgHourlyRate} onChange={e => setSimPlan({...simPlan, avgHourlyRate: parseInt(e.target.value)})} style={{ width: '100%', padding: '8px', border: '1px solid #cbd5e1', borderRadius: '4px' }} />
          </div>

          <div style={{ marginBottom: '1.5rem' }}>
            <label style={{ display: 'block', marginBottom: '0.5rem', fontWeight: 'bold', fontSize: '0.9rem' }}>Project Deadline</label>
            <input type="date" value={simPlan.projectDeadline} onChange={e => setSimPlan({...simPlan, projectDeadline: e.target.value})} style={{ width: '100%', padding: '8px', border: '1px solid #cbd5e1', borderRadius: '4px' }} />
            <div style={{ marginTop: '0.5rem', fontSize: '0.8rem', color: '#64748b', display: 'flex', alignItems: 'center', gap: '5px' }}><span style={{ opacity: 0.7 }}>🔗 Trello Integration</span><span style={{ background: '#e2e8f0', padding: '2px 6px', borderRadius: '4px', fontSize: '0.7rem' }}>Coming Soon</span></div>
          </div>

          <button className="quiz-button" onClick={async () => { setSimLoading(true); try { const data = await simulateEmployerAction({ companyCode: user.companyCode, plan: simPlan }); setSimResults(data); setSimWeek(0); } catch (e) { console.error(e); alert('Simulation failed. Please try again.'); } setSimLoading(false); }} disabled={simLoading}>
            {simLoading ? 'Running Simulation...' : 'Run Simulation'}
          </button>
        </div>

        {/* Results Panel */}
        <div>
          {!simResults ? (
            <div className="card" style={{ textAlign: 'center', padding: '3rem', color: '#94a3b8' }}>
              <div style={{ fontSize: '3rem', marginBottom: '1rem' }}>📈</div>
              <p>Configure and run a simulation to see projected impacts.</p>
            </div>
          ) : (
            <>
              <div className="grid" style={{ gridTemplateColumns: '1fr 1fr 1fr 1fr', gap: '1rem', marginBottom: '2rem' }}>
                <div className="card" style={{ textAlign: 'center', borderTop: '4px solid #10b981' }}><div style={{ fontSize: '0.9rem', color: '#64748b' }}>Risk Reduction</div><div style={{ fontSize: '2rem', fontWeight: 'bold', color: '#10b981' }}>{simResults.metrics.deltaPercent}%</div></div>
                <div className="card" style={{ textAlign: 'center', borderTop: '4px solid #3b82f6' }}><div style={{ fontSize: '0.9rem', color: '#64748b' }}>Time to Impact</div><div style={{ fontSize: '2rem', fontWeight: 'bold', color: '#3b82f6' }}>{simResults.metrics.timeToImpact || '> 12'} <span style={{fontSize: '1rem'}}>weeks</span></div></div>
                <div className="card" style={{ textAlign: 'center', borderTop: '4px solid #f59e0b' }}><div style={{ fontSize: '0.9rem', color: '#64748b' }}>Trend</div><div style={{ fontSize: '2rem', fontWeight: 'bold', color: '#f59e0b' }}>{simResults.metrics.trend}</div></div>
                <div className="card" style={{ textAlign: 'center', borderTop: '4px solid #8b5cf6' }}><div style={{ fontSize: '0.9rem', color: '#64748b' }}>Est. Cost</div><div style={{ fontSize: '1.5rem', fontWeight: 'bold', color: '#8b5cf6' }}>${simResults.metrics.estimatedCost.toLocaleString()}</div></div>
              </div>

              {/* Interactive Timeline Slider */}
              <div className="card" style={{ marginTop: '2rem', border: '1px solid #e2e8f0', boxShadow: '0 4px 6px -1px rgba(0, 0, 0, 0.1)' }}>
                <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'center', marginBottom: '1rem' }}>
                  <h3 style={{ margin: 0 }}>Timeline Analysis</h3>
                  <span style={{ fontSize: '1.2rem', fontWeight: 'bold', color: '#2563eb', background: '#eff6ff', padding: '4px 12px', borderRadius: '20px' }}>Week {simWeek}</span>
                </div>
                <p className="small" style={{ color: '#64748b' }}>Slide to see how team health metrics evolve during the action plan.</p>
                <input type="range" min="0" max={simPlan.durationWeeks} value={simWeek} onChange={(e) => setSimWeek(Number(e.target.value))} style={{ width: '100%', margin: '1.5rem 0', cursor: 'pointer', accentColor: '#2563eb' }} />

                <div className="grid" style={{ gridTemplateColumns: 'repeat(auto-fit, minmax(300px, 1fr))', gap: '2rem', marginTop: '1rem' }}>
                  <div className="card" style={{ border: 'none', boxShadow: 'none', background: '#f8fafc' }}>
                    <h4 style={{ textAlign: 'center', color: '#64748b' }}>Projected Health Radar</h4>
                    <div style={{ height: '250px', display: 'flex', justifyContent: 'center' }}>{getSimRadarData(simWeek * 7) ? <Radar data={getSimRadarData(simWeek * 7)} options={{ scales: { r: { suggestedMin: 0, suggestedMax: 10 } }, plugins: { legend: { position: 'bottom' } } }} /> : <p style={{alignSelf: 'center', color: '#94a3b8'}}>No data available</p>}</div>
                  </div>
                  <div className="card" style={{ border: 'none', boxShadow: 'none', background: '#f8fafc' }}>
                    <h4 style={{ textAlign: 'center', color: '#64748b' }}>Risk Distribution</h4>
                    <div style={{ height: '250px', display: 'flex', justifyContent: 'center' }}>{getSimRiskDistData(simWeek * 7) ? <Doughnut data={getSimRiskDistData(simWeek * 7)} options={{ plugins: { legend: { position: 'bottom' } }, cutout: '60%' }} /> : <p style={{alignSelf: 'center', color: '#94a3b8'}}>No distribution data</p>}</div>
                  </div>
                  <div className="card" style={{ border: 'none', boxShadow: 'none', background: '#f8fafc' }}>
                    <h4 style={{ textAlign: 'center', color: '#64748b' }}>Burnout Drivers</h4>
                    <div style={{ height: '250px', display: 'flex', justifyContent: 'center' }}>{getSimDriverData(simWeek * 7) ? <Pie data={getSimDriverData(simWeek * 7)} options={{ plugins: { legend: { position: 'bottom' } } }} /> : <p style={{alignSelf: 'center', color: '#94a3b8'}}>No driver data</p>}</div>
                  </div>
                </div>
              </div>

              <div className="card">
                <h3>Projected Impact (12 Weeks)</h3>
                <div style={{ height: '350px' }}>
                  <Line data={{
                      labels: simResults.timeline.filter((_, i) => i % 7 === 0).map(t => `Week ${t.day/7}`),
                      datasets: [
                        { label: 'Burnout Risk', data: simResults.timeline.filter((_, i) => i % 7 === 0).map(t => t.risk), borderColor: '#ef4444', backgroundColor: '#ef4444', tension: 0.4 },
                        { label: 'Stress', data: simResults.timeline.filter((_, i) => i % 7 === 0).map(t => t.stress * 10), borderColor: '#f97316', borderDash: [5,5], tension: 0.4 },
                        { label: 'Sleep Quality', data: simResults.timeline.filter((_, i) => i % 7 === 0).map(t => (10-t.sleep) * 10), borderColor: '#3b82f6', borderDash: [5,5], tension: 0.4 },
                        { label: 'Workload', data: simResults.timeline.filter((_, i) => i % 7 === 0).map(t => t.workload * 10), borderColor: '#8b5cf6', borderDash: [2,2], tension: 0.4 }
                      ]
                    }} options={cleanChartOptions} />
                </div>
              </div>

              <div style={{ marginTop: '1rem', textAlign: 'right' }}>
                <button onClick={handleSaveSimulation} className="quiz-button" style={{ width: 'auto', backgroundColor: '#64748b' }}>Save Plan</button>
              </div>
            </>
          )}
        </div>
      </div>
    </div>
  );
}