import React, { useEffect, useMemo, useState } from 'react';
import {
  Chart as ChartJS,
  CategoryScale,
  LinearScale,
  BarElement,
  Title,
  Tooltip,
  Legend,
  PointElement,
  LineElement
} from 'chart.js';
import { Bar, Line } from 'react-chartjs-2';
import Navbar from '../components/layout/Navbar';
import { useUser } from '../context/UserContext';
import { fetchComprehensiveTeamReport } from '../services/api';
import './EmployerComprehensive.css';

ChartJS.register(
  CategoryScale,
  LinearScale,
  BarElement,
  Title,
  Tooltip,
  Legend,
  PointElement,
  LineElement
);

const safeNumber = (val, fallback = 0) => (Number.isFinite(val) ? val : fallback);

const avg = (arr) => {
  if (!Array.isArray(arr) || arr.length === 0) return 0;
  return arr.reduce((a, b) => a + b, 0) / arr.length;
};

const formatNum = (val, digits = 1) => safeNumber(val).toFixed(digits);

const chartDefaults = {
  responsive: true,
  maintainAspectRatio: false,
  plugins: {
    legend: { position: 'bottom', labels: { usePointStyle: true, boxWidth: 8 } },
    title: { display: false }
  },
  scales: {
    x: { grid: { display: false, drawBorder: false } },
    y: { grid: { color: 'rgba(148, 163, 184, 0.2)' }, beginAtZero: true }
  }
};

function MetricCard({ label, value, subtext, trend }) {
  return (
    <div className="employer-card metric-card">
      <div className="metric-label">{label}</div>
      <div className="metric-value">{value}</div>
      {subtext && <div className="metric-subtext">{subtext}</div>}
      {trend && <div className={`metric-trend ${trend.tone}`}>{trend.text}</div>}
    </div>
  );
}

export default function EmployerComprehensive() {
  const { user } = useUser();
  const [report, setReport] = useState(null);
  const [loading, setLoading] = useState(false);
  const [error, setError] = useState('');

  useEffect(() => {
    if (!user?.companyCode) return;
    let mounted = true;
    setLoading(true);
    setError('');
    fetchComprehensiveTeamReport(user.companyCode)
      .then((data) => {
        if (!mounted) return;
        setReport(data);
      })
      .catch((err) => {
        if (!mounted) return;
        setError(err.message || 'Failed to load report');
      })
      .finally(() => {
        if (!mounted) return;
        setLoading(false);
      });
    return () => { mounted = false; };
  }, [user]);

  const daily = report?.daily_data || [];
  const stats = report?.stats || {};

  const trends = useMemo(() => {
    if (!daily.length) return null;
    const last7 = daily.slice(-7);
    const prev7 = daily.slice(-14, -7);
    const last7Risk = avg(last7.map(d => d.burnout_risk));
    const prev7Risk = prev7.length ? avg(prev7.map(d => d.burnout_risk)) : last7Risk;
    const delta = last7Risk - prev7Risk;
    const tone = delta > 2 ? 'up' : delta < -2 ? 'down' : 'flat';
    const text = prev7.length ? `${delta > 0 ? '+' : ''}${delta.toFixed(1)} vs prior week` : 'Baseline established';
    return { last7Risk, tone, text };
  }, [daily]);

  const focusSplit = useMemo(() => {
    if (!daily.length) return null;
    return {
      meeting: avg(daily.map(d => d.meeting_hours)),
      deep: avg(daily.map(d => d.focus_hours)),
      fragmented: avg(daily.map(d => d.fragmented_hours)),
      medium: avg(daily.map(d => d.medium_hours))
    };
  }, [daily]);

  const dataSources = report?.data_sources || {};
  const recommendations = report?.recommendations || [];

  const burnoutTrendData = report?.graphs?.burnout_risk_trend || null;
  const stressTrendData = report?.graphs?.stress_trend || null;
  const chaosData = report?.graphs?.calendar_chaos || null;
  const contextData = report?.graphs?.context_switching || null;
  const focusBreakdownData = report?.graphs?.focus_time_breakdown || null;
  const stressMeetingsData = report?.graphs?.stress_vs_meetings || null;
  const wipData = report?.graphs?.wip_growth || null;
  const afterHoursData = report?.graphs?.after_hours_activity || null;
  const workloadAssignee = report?.graphs?.workload_by_assignee || null;
  const meetingDensity = report?.graphs?.meeting_density || null;
  const energyByHour = report?.graphs?.energy_by_hour || null;

  const energyHighlights = useMemo(() => {
    if (!energyByHour?.datasets?.[0]?.data) return [];
    const rows = energyByHour.datasets[0].data
      .map((h, idx) => ({ hour: idx, median: h.median || 0, q1: h.q1 || 0, q3: h.q3 || 0, count: h.count || 0 }))
      .filter(h => h.count > 0)
      .sort((a, b) => b.median - a.median)
      .slice(0, 3);
    return rows;
  }, [energyByHour]);

  const correlation = report?.correlations || { labels: [], matrix: [] };

  const showPrivacyLocked = report?.privacyLocked;

  return (
    <>
      <Navbar />
      <div className="employer-report">
        <header className="hero">
          <div>
            <div className="hero-kicker">Employer Intelligence</div>
            <h1>Comprehensive Workforce Report</h1>
            <p>Unified view of burnout risk, focus quality, workload signals, and after-hours strain based on aggregated, anonymous data.</p>
          </div>
          {user?.companyCode && (
            <div className="hero-code">
              <div className="hero-code-label">Company Code</div>
              <div className="hero-code-value">{user.companyCode}</div>
            </div>
          )}
        </header>

        {loading && <div className="employer-card">Loading report...</div>}
        {error && <div className="employer-card error">{error}</div>}

        {!loading && report && (
          <>
            {showPrivacyLocked ? (
              <div className="employer-card notice">
                <h3>Insights Locked for Privacy</h3>
                <p>Aggregated insights unlock after 5 or more employees have joined. Current count: <strong>{report.employeeCount || 0}</strong>.</p>
              </div>
            ) : (
              <>
                <section className="metric-grid">
                  <MetricCard
                    label="Employees Included"
                    value={report.employeeCount || 0}
                    subtext={`${report.totalCheckins || 0} check-ins`}
                  />
                  <MetricCard
                    label="Avg Stress"
                    value={formatNum(stats.avg_stress, 1)}
                    subtext="0-100 scale"
                  />
                  <MetricCard
                    label="Avg Energy"
                    value={formatNum(stats.avg_energy, 1)}
                    subtext="0-100 scale"
                  />
                  <MetricCard
                    label="Avg Focus Hours"
                    value={formatNum(stats.avg_focus_hours || 0, 1)}
                    subtext="Per day"
                  />
                  <MetricCard
                    label="Burnout Risk"
                    value={formatNum(trends?.last7Risk || avg(daily.map(d => d.burnout_risk)), 1)}
                    subtext="Last 7 days"
                    trend={trends ? { tone: trends.tone, text: trends.text } : null}
                  />
                  <MetricCard
                    label="Context Switching"
                    value={formatNum(avg(daily.map(d => d.context_switching_score)), 1)}
                    subtext="Higher = more switching"
                  />
                </section>

                <section className="insight-grid">
                  <div className="employer-card">
                    <h3>Focus vs Fragmentation</h3>
                    {focusSplit && (
                      <div className="split-grid">
                        <div>
                          <div className="split-label">Deep Focus</div>
                          <div className="split-value">{formatNum(focusSplit.deep, 1)}h</div>
                        </div>
                        <div>
                          <div className="split-label">Meetings</div>
                          <div className="split-value">{formatNum(focusSplit.meeting, 1)}h</div>
                        </div>
                        <div>
                          <div className="split-label">Medium Blocks</div>
                          <div className="split-value">{formatNum(focusSplit.medium, 1)}h</div>
                        </div>
                        <div>
                          <div className="split-label">Fragmented</div>
                          <div className="split-value">{formatNum(focusSplit.fragmented, 1)}h</div>
                        </div>
                      </div>
                    )}
                    {focusBreakdownData && (
                      <div className="chart-panel">
                        <Bar data={focusBreakdownData} options={{ ...chartDefaults, scales: { x: { stacked: true }, y: { stacked: true, beginAtZero: true } } }} />
                      </div>
                    )}
                  </div>

                  <div className="employer-card">
                    <h3>Calendar Chaos</h3>
                    {chaosData ? (
                      <div className="chart-panel">
                        <Line data={chaosData} options={chartDefaults} />
                      </div>
                    ) : (
                      <p>No calendar data connected.</p>
                    )}
                    <div className="helper-text">High chaos often correlates with reduced recovery and rising stress.</div>
                  </div>

                  <div className="employer-card">
                    <h3>Stress vs Meetings</h3>
                    {stressMeetingsData ? (
                      <div className="chart-panel">
                        <Bar data={stressMeetingsData} options={{ ...chartDefaults, scales: { y: { beginAtZero: true }, y1: { beginAtZero: true, position: 'right', grid: { drawOnChartArea: false } } } }} />
                      </div>
                    ) : (
                      <p>No calendar data connected.</p>
                    )}
                  </div>

                  <div className="employer-card">
                    <h3>Burnout Risk Trend</h3>
                    {burnoutTrendData && (
                      <div className="chart-panel">
                        <Line data={burnoutTrendData} options={chartDefaults} />
                      </div>
                    )}
                  </div>

                  <div className="employer-card">
                    <h3>Stress Trend</h3>
                    {stressTrendData && (
                      <div className="chart-panel">
                        <Line data={stressTrendData} options={chartDefaults} />
                      </div>
                    )}
                  </div>

                  <div className="employer-card">
                    <h3>Context Switching</h3>
                    {contextData ? (
                      <div className="chart-panel">
                        <Line data={contextData} options={chartDefaults} />
                      </div>
                    ) : (
                      <p>Connect calendar to see switching analysis.</p>
                    )}
                  </div>
                </section>

                <section className="insight-grid">
                  <div className="employer-card">
                    <h3>Meeting Density Heatmap</h3>
                    {meetingDensity ? (
                      <div className="heatmap">
                        <div className="heatmap-header">
                          {meetingDensity.labels?.map((d) => (
                            <div key={d}>{d}</div>
                          ))}
                        </div>
                        <div className="heatmap-grid">
                          {Array.from({ length: 24 }).flatMap((_, hour) => (
                            meetingDensity.data.map((dayRow) => dayRow?.[hour] || 0)
                          )).map((value, idx) => {
                            const intensity = Math.min(1, value / 5);
                            return (
                              <div
                                key={idx}
                                className="heatmap-cell"
                                style={{ background: `rgba(14, 116, 144, ${0.1 + intensity * 0.8})` }}
                                title={`Meetings: ${value}`}
                              />
                            );
                          })}
                        </div>
                        <div className="heatmap-legend">Hours (rows) by day (columns)</div>
                      </div>
                    ) : (
                      <p>Connect calendar to see meeting density.</p>
                    )}
                  </div>

                  <div className="employer-card">
                    <h3>Energy Peaks</h3>
                    {energyHighlights.length > 0 ? (
                      <div className="energy-list">
                        {energyHighlights.map((h) => (
                          <div key={h.hour} className="energy-row">
                            <div className="energy-hour">{h.hour}:00</div>
                            <div className="energy-bar">
                              <div className="energy-bar-fill" style={{ width: `${Math.min(100, h.median)}%` }} />
                            </div>
                            <div className="energy-median">Median {formatNum(h.median, 0)}</div>
                          </div>
                        ))}
                      </div>
                    ) : (
                      <p>No energy distribution data yet.</p>
                    )}
                    <div className="helper-text">Use peak hours to schedule deep work and sensitive meetings.</div>
                  </div>

                  <div className="employer-card">
                    <h3>After Hours Load</h3>
                    {afterHoursData ? (
                      <div className="chart-panel">
                        <Bar data={afterHoursData} options={chartDefaults} />
                      </div>
                    ) : (
                      <p>Connect Slack to see after-hours patterns.</p>
                    )}
                  </div>
                </section>

                <section className="insight-grid">
                  <div className="employer-card">
                    <h3>Work In Progress</h3>
                    {wipData ? (
                      <div className="chart-panel">
                        <Line data={wipData} options={chartDefaults} />
                      </div>
                    ) : (
                      <p>Connect Jira to see workload trends.</p>
                    )}
                  </div>

                  <div className="employer-card">
                    <h3>Workload by Assignee</h3>
                    {workloadAssignee ? (
                      <div className="chart-panel">
                        <Bar data={workloadAssignee} options={chartDefaults} />
                      </div>
                    ) : (
                      <p>Connect Jira to see workload distribution.</p>
                    )}
                  </div>

                  <div className="employer-card">
                    <h3>Deadline Risk</h3>
                    {stats.deadline_risk ? (
                      <div className="deadline-grid">
                        <div>
                          <div className="split-label">Velocity</div>
                          <div className="split-value">{formatNum(stats.deadline_risk.velocity, 1)} pts/week</div>
                        </div>
                        <div>
                          <div className="split-label">Backlog</div>
                          <div className="split-value">{formatNum(stats.deadline_risk.backlogPoints, 0)} pts</div>
                        </div>
                        <div>
                          <div className="split-label">Weeks to Complete</div>
                          <div className="split-value">{formatNum(stats.deadline_risk.weeksToComplete, 1)}</div>
                        </div>
                        <div>
                          <div className="split-label">Projected Finish</div>
                          <div className="split-value">{stats.deadline_risk.projectedDate}</div>
                        </div>
                      </div>
                    ) : (
                      <p>Connect Jira to see delivery risk.</p>
                    )}
                  </div>
                </section>

                <section className="employer-card">
                  <h3>Signal Correlations</h3>
                  {correlation.labels.length ? (
                    <div className="correlation-table">
                      <div className="correlation-row header">
                        <div />
                        {correlation.labels.map((label) => (
                          <div key={label} className="correlation-label">{label}</div>
                        ))}
                      </div>
                      {correlation.matrix.map((row) => (
                        <div key={row.metric} className="correlation-row">
                          <div className="correlation-label">{row.metric}</div>
                          {row.values.map((val, idx) => (
                            <div
                              key={`${row.metric}-${idx}`}
                              className="correlation-cell"
                              style={{ background: `rgba(239, 68, 68, ${Math.min(Math.abs(val), 1) * 0.6})` }}
                            >
                              {val}
                            </div>
                          ))}
                        </div>
                      ))}
                    </div>
                  ) : (
                    <p>Not enough data to calculate correlations.</p>
                  )}
                </section>

                <section className="insight-grid">
                  <div className="employer-card">
                    <h3>Data Sources</h3>
                    <div className="badge-grid">
                      <span className={`badge ${dataSources.checkins ? 'on' : 'off'}`}>Check-ins</span>
                      <span className={`badge ${dataSources.calendar ? 'on' : 'off'}`}>Calendar</span>
                      <span className={`badge ${dataSources.jira ? 'on' : 'off'}`}>Jira</span>
                      <span className={`badge ${dataSources.slack ? 'on' : 'off'}`}>Slack</span>
                    </div>
                    <div className="helper-text">Connect more tools to unlock deeper insights.</div>
                  </div>

                  <div className="employer-card">
                    <h3>Recommendations</h3>
                    {recommendations.length ? (
                      <ul className="recommendations">
                        {recommendations.map((r, idx) => (
                          <li key={idx}>{r}</li>
                        ))}
                      </ul>
                    ) : (
                      <p>No immediate recommendations. Keep monitoring trends.</p>
                    )}
                  </div>

                  <div className="employer-card">
                    <h3>Correlations (Top)</h3>
                    <div className="correlation-summary">
                      {Number.isFinite(stats.meeting_stress_correlation) && (
                        <div>
                          <span>Meetings vs Stress</span>
                          <strong>{formatNum(stats.meeting_stress_correlation, 2)}</strong>
                        </div>
                      )}
                      {Number.isFinite(stats.context_stress_correlation) && (
                        <div>
                          <span>Context Switching vs Stress</span>
                          <strong>{formatNum(stats.context_stress_correlation, 2)}</strong>
                        </div>
                      )}
                      {Number.isFinite(stats.workload_stress_correlation) && (
                        <div>
                          <span>Workload vs Stress</span>
                          <strong>{formatNum(stats.workload_stress_correlation, 2)}</strong>
                        </div>
                      )}
                    </div>
                  </div>
                </section>
              </>
            )}
          </>
        )}
      </div>
    </>
  );
}
