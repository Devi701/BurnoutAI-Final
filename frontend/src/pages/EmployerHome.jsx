import React, { useState, useEffect, useMemo } from 'react';
import { Link } from 'react-router-dom';
import {
  Chart as ChartJS,
  CategoryScale,
  LinearScale,
  BarElement,
  Title,
  Tooltip,
  Legend,
  PointElement,
  LineElement,
  ArcElement,
  RadialLinearScale
} from 'chart.js';
import { Bar, Line, Pie, Doughnut, Radar } from 'react-chartjs-2';
import Navbar from '../components/layout/Navbar';
import { useUser } from '../context/UserContext';
import { fetchWeeklyReport, fetchEmployees, fetchTeams, createTeam, assignEmployeeToTeam, deleteTeam, fetchTeamMetrics, simulateEmployerAction } from '../services/api';
import { analytics } from '../services/analytics';
import SimulatorTab from './SimulatorTab';


ChartJS.register(
  CategoryScale,
  LinearScale,
  BarElement,
  Title,
  Tooltip,
  Legend,
  PointElement,
  LineElement,
  ArcElement,
  RadialLinearScale
);

const generateLandscapeData = (report) => {
  const gridResolution = 20; // 20x20 grid for high fidelity
  const grid = Array(gridResolution).fill().map(() => Array(gridResolution).fill(0));
  
  if (!report || !report.riskDistribution) return grid;

  const { low, moderate, high, critical } = report.riskDistribution;
  
  // Helper to add random points in a zone with Gaussian-like distribution
  const addPoints = (count, xMin, xMax, yMin, yMax) => {
    for (let i = 0; i < count; i++) {
      // Simple random distribution within bounds
      const x = Math.floor(xMin + Math.random() * (xMax - xMin));
      const y = Math.floor(yMin + Math.random() * (yMax - yMin));
      
      if (grid[y] && grid[y][x] !== undefined) {
        grid[y][x]++;
      }
    }
  };

  // Mapping Logic:
  // X-axis: Stress (0 = Low, 19 = High)
  // Y-axis: Recovery (0 = Low, 19 = High)
  
  // Low Risk (Green): Low Stress (0-8), High Recovery (12-19)
  addPoints(low, 0, 9, 12, 20);
  
  // Moderate Risk (Yellow): Mid Stress (5-14), Mid Recovery (6-14)
  addPoints(moderate, 5, 15, 6, 15);
  
  // High Risk (Orange): High Stress (12-19), Low/Mid Recovery (3-10)
  addPoints(high, 12, 20, 3, 11);
  
  // Critical Risk (Red): Very High Stress (15-19), Very Low Recovery (0-5)
  addPoints(critical, 15, 20, 0, 6);

  return grid;
};

const DensityLandscape = ({ report }) => {
  const gridData = useMemo(() => generateLandscapeData(report), [report]);
  const maxDensity = Math.max(...gridData.flat(), 1);
  const gridSize = gridData.length;
  const [hoveredCell, setHoveredCell] = useState(null);

  if (!report) return <div className="card" style={{ padding: '2rem', textAlign: 'center', color: '#94a3b8' }}>Loading landscape data...</div>;

  return (
    <div className="card" style={{ marginBottom: '2rem', overflow: 'hidden', position: 'relative', background: '#0f172a', color: 'white', minHeight: '600px', display: 'flex', flexDirection: 'column' }}>
      <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'end', marginBottom: '1.5rem' }}>
        <div>
          <h3 style={{ margin: 0, color: 'white', fontSize: '1.5rem' }}>Workforce Density Landscape</h3>
          <p style={{ margin: '0.5rem 0 0', color: '#94a3b8' }}>
            3D Terrain view. Height = Employee Density.<br/>
            <span style={{color: '#f87171'}}>Red</span> = High Burnout Risk. <span style={{color: '#4ade80'}}>Green</span> = High Recovery.
          </p>
        </div>
        <div style={{ textAlign: 'right', fontSize: '0.9rem', color: '#cbd5e1' }}>
          <div>Total Employees: <strong>{report.employeeCount !== undefined ? report.employeeCount : 0}</strong></div>
        </div>
      </div>

      <div style={{ 
        flex: 1, 
        position: 'relative', 
        perspective: '1200px', 
        display: 'flex', 
        justifyContent: 'center', 
        alignItems: 'center',
        padding: '2rem'
      }}>
        {/* 3D Plane */}
        <div style={{ 
          width: '500px', 
          height: '500px', 
          position: 'relative', 
          transform: 'rotateX(55deg) rotateZ(45deg)', 
          transformStyle: 'preserve-3d',
          backgroundColor: 'rgba(255,255,255,0.03)',
          borderRadius: '12px',
          boxShadow: '0 20px 50px rgba(0,0,0,0.5)'
        }}>
          {/* Grid Cells / Towers */}
          {gridData.map((row, y) => (
            row.map((count, x) => {
              if (count === 0) return null;

              // X = Stress (0-19), Y = Recovery (0-19)
              const stressPct = (x / (gridSize - 1));
              const recoveryPct = (y / (gridSize - 1));
              
              // Risk Calculation: High Stress + Low Recovery = High Risk
              // Risk = (Stress + (1-Recovery)) / 2
              const riskFactor = (stressPct + (1 - recoveryPct)) / 2;
              
              // Hue: 0 (Red/High Risk) to 120 (Green/Low Risk)
              const hue = (1 - riskFactor) * 120;
              
              // 3D Dimensions
              const barHeight = (count / maxDensity) * 180; 
              const widthPct = 100 / gridSize;
              const left = x * widthPct;
              const top = y * widthPct;

              // Colors for faces
              const colorTop = `hsla(${hue}, 85%, 55%, 0.95)`;
              const colorFront = `hsla(${hue}, 85%, 35%, 0.9)`;
              const colorSide = `hsla(${hue}, 85%, 20%, 0.9)`;
              
              const isHovered = hoveredCell && hoveredCell.x === x && hoveredCell.y === y;

              return (
                <div key={`${x}-${y}`} 
                  onMouseEnter={() => setHoveredCell({ x, y, count, risk: Math.round(riskFactor * 100), stress: Math.round(stressPct * 100), recovery: Math.round(recoveryPct * 100) })}
                  onMouseLeave={() => setHoveredCell(null)}
                  style={{
                    position: 'absolute',
                    left: `${left}%`,
                    top: `${top}%`,
                    width: `${widthPct}%`,
                    height: `${widthPct}%`,
                    transformStyle: 'preserve-3d',
                    zIndex: x + y, // Isometric depth sorting
                    cursor: 'pointer'
                  }}
                >
                  {/* Top Face */}
                  <div style={{
                    position: 'absolute',
                    width: '100%',
                    height: '100%',
                    background: isHovered ? '#fff' : colorTop,
                    transform: `translateZ(${barHeight}px)`,
                    boxShadow: `0 0 ${count * 5}px ${colorTop}`,
                    border: '1px solid rgba(255,255,255,0.1)'
                  }} />
                  
                  {/* Front Face (South) */}
                  <div style={{
                    position: 'absolute',
                    bottom: 0,
                    left: 0,
                    width: '100%',
                    height: `${barHeight}px`,
                    background: colorFront,
                    transformOrigin: 'bottom',
                    transform: 'rotateX(-90deg)',
                    border: '1px solid rgba(0,0,0,0.1)'
                  }} />
                  
                  {/* Side Face (East) */}
                  <div style={{
                    position: 'absolute',
                    top: 0,
                    right: 0,
                    width: `${barHeight}px`,
                    height: '100%',
                    background: colorSide,
                    transformOrigin: 'right',
                    transform: 'rotateY(90deg)',
                    border: '1px solid rgba(0,0,0,0.1)'
                  }} />
                </div>
              );
            })
          ))}
          
          {/* Empty State Message */}
          {gridData.flat().every(c => c === 0) && (
            <div style={{ 
              position: 'absolute', 
              top: '50%', 
              left: '50%', 
              transform: 'translate(-50%, -50%) rotateX(-55deg) rotateZ(-45deg)', // Counter-rotate to face user
              textAlign: 'center', 
              color: 'rgba(255,255,255,0.5)',
              pointerEvents: 'none'
            }}>
              <div style={{ fontSize: '3rem', marginBottom: '1rem' }}>🏔️</div>
              <div>{report.employeeCount > 0 ? 'No employee data mapped yet.' : 'No employees found.'}</div>
              <div style={{ fontSize: '0.8rem' }}>{report.employeeCount > 0 ? 'Waiting for check-ins...' : 'Add employees in Team Management.'}</div>
            </div>
          )}
        </div>

        {/* Axis Labels (Overlay) */}
        <div style={{ position: 'absolute', bottom: '20px', right: '20px', textAlign: 'right', pointerEvents: 'none' }}>
          <div style={{ color: '#94a3b8', fontSize: '0.9rem', fontWeight: 'bold' }}>STRESS &rarr;</div>
        </div>
        <div style={{ position: 'absolute', top: '20px', left: '20px', pointerEvents: 'none' }}>
          <div style={{ color: '#94a3b8', fontSize: '0.9rem', fontWeight: 'bold' }}>&uarr; RECOVERY</div>
        </div>
        
        {/* Custom Tooltip Overlay */}
        {hoveredCell && (
          <div style={{
            position: 'absolute',
            top: '20px',
            right: '20px',
            background: 'rgba(15, 23, 42, 0.9)',
            border: '1px solid #334155',
            padding: '1rem',
            borderRadius: '8px',
            zIndex: 1000,
            pointerEvents: 'none',
            boxShadow: '0 10px 25px rgba(0,0,0,0.5)',
            minWidth: '150px'
          }}>
            <div style={{ color: '#94a3b8', fontSize: '0.8rem', textTransform: 'uppercase', letterSpacing: '1px', marginBottom: '0.5rem' }}>Cluster Details</div>
            <div style={{ fontSize: '1.5rem', fontWeight: 'bold', color: 'white', marginBottom: '0.5rem' }}>{hoveredCell.count} <span style={{fontSize: '0.9rem', fontWeight: 'normal'}}>Employees</span></div>
            
            <div style={{ display: 'flex', justifyContent: 'space-between', fontSize: '0.9rem', marginBottom: '4px' }}>
              <span style={{ color: '#cbd5e1' }}>Burnout Risk:</span>
              <span style={{ fontWeight: 'bold', color: hoveredCell.risk > 50 ? '#f87171' : '#4ade80' }}>{hoveredCell.risk}%</span>
            </div>
            <div style={{ width: '100%', height: '4px', background: '#334155', borderRadius: '2px', marginBottom: '0.5rem' }}>
              <div style={{ width: `${hoveredCell.risk}%`, height: '100%', background: hoveredCell.risk > 50 ? '#f87171' : '#4ade80', borderRadius: '2px' }}></div>
            </div>

            <div style={{ display: 'flex', justifyContent: 'space-between', fontSize: '0.8rem', color: '#94a3b8' }}>
              <span>Stress: {hoveredCell.stress}%</span>
              <span>Recovery: {hoveredCell.recovery}%</span>
            </div>
          </div>
        )}
      </div>
    </div>
  );
};

export default function EmployerHome() {
  const { user } = useUser();
  const [activeTab, setActiveTab] = useState('overview'); // 'overview', 'teams', 'insights', 'simulator'
  const [report, setReport] = useState(null);
  const [employees, setEmployees] = useState([]);
  const [teams, setTeams] = useState([]);
  const [simPopulation, setSimPopulation] = useState([]);
  const [teamMetrics, setTeamMetrics] = useState([]);
  const [employeesError, setEmployeesError] = useState('');
  const [loading, setLoading] = useState(false);
  const [newTeamName, setNewTeamName] = useState('');
  const [chartType, setChartType] = useState('bar');
  const [selectedTeam, setSelectedTeam] = useState(null);
  const [teamReport, setTeamReport] = useState(null);
  const [teamLoading, setTeamLoading] = useState(false);
  
  const [insightMode, setInsightMode] = useState('overview'); // 'overview', 'team', 'compare'
  const [insightTeamId, setInsightTeamId] = useState('');
  const [insightTeamReport, setInsightTeamReport] = useState(null);
  const [compareTeamIds, setCompareTeamIds] = useState([]);
  const [comparisonReports, setComparisonReports] = useState({});
  const [comparingLoading, setComparingLoading] = useState(false);
  const [insightLoading, setInsightLoading] = useState(false);

  // Simulator State
  const [simPlan, setSimPlan] = useState({
    name: 'New Action Plan',
    actions: [{ type: 'workload', intensity: 50, adherence: 80 }],
    durationWeeks: 12,
    avgHourlyRate: 50,
    projectDeadline: ''
  });
  const [simResults, setSimResults] = useState(null);
  const [simLoading, setSimLoading] = useState(false);
  const [simWeek, setSimWeek] = useState(0);

  const [savedSimulations, setSavedSimulations] = useState([]);

  useEffect(() => {
    const saved = localStorage.getItem('employer_saved_simulations');
    if (saved) {
      try {
        setSavedSimulations(JSON.parse(saved));
      } catch (e) { console.error("Failed to load saved simulations", e); }
    }
  }, []);

  const handleSaveSimulation = () => {
    if (!simResults) return;
    const newSave = { id: Date.now(), date: new Date().toISOString(), plan: simPlan, results: simResults };
    const updated = [newSave, ...savedSimulations];
    setSavedSimulations(updated);
    localStorage.setItem('employer_saved_simulations', JSON.stringify(updated));
    alert('Simulation saved to Action Impact insights!');
  };

  const toggleSimAction = (typeId) => {
    setSimPlan(prev => {
      const exists = prev.actions.find(a => a.type === typeId);
      if (exists) {
        return { ...prev, actions: prev.actions.filter(a => a.type !== typeId) };
      } else {
        return { ...prev, actions: [...prev.actions, { type: typeId, intensity: 50, adherence: 80 }] };
      }
    });
  };

  const updateSimAction = (typeId, field, value) => {
    setSimPlan(prev => ({
      ...prev,
      actions: prev.actions.map(a => a.type === typeId ? { ...a, [field]: Number(value) } : a)
    }));
  };

  useEffect(() => {
    if (user) {
      analytics.identify(user);
    }

    let isMounted = true;
    
    if (user && user.companyCode) {
      setLoading(true);
      
      // Fetch Report and Employees in parallel
      Promise.allSettled([
        fetchWeeklyReport(user.companyCode),
        fetchEmployees(user.companyCode),
        fetchTeams(user.companyCode),
        fetchTeamMetrics(user.companyCode).catch(() => []) // Fail gracefully if endpoint not ready
      ]).then(([reportResult, employeesResult, teamsResult, metricsResult]) => {
        if (!isMounted) return;

        // Handle Report
        if (reportResult.status === 'fulfilled') {
          setReport(reportResult.value);
          
          // Track Dashboard View
          analytics.capture('employer_dashboard_viewed', {
            employee_count_bucket: reportResult.value.employeeCount < 5 ? '0-4' : '5+',
            privacy_locked: reportResult.value.privacyLocked
          });

          if (reportResult.value.privacyLocked) {
            analytics.capture('individual_data_attempt_blocked', { attempted_action: 'view_aggregated_report' });
          }
        }

        // Handle Employees
        if (employeesResult.status === 'fulfilled' && Array.isArray(employeesResult.value)) {
          setEmployees(employeesResult.value);
        } else if (employeesResult.status === 'rejected') {
          setEmployeesError(employeesResult.reason.message);
        }

        // Handle Teams
        if (teamsResult.status === 'fulfilled') {
          setTeams(teamsResult.value || []);
        }

        // Handle Metrics
        if (metricsResult.status === 'fulfilled') {
          setTeamMetrics(metricsResult.value || []);
        }

        setLoading(false);
      });
    } else if (user) {
        setLoading(false);
    }
    
    return () => { isMounted = false; };
  }, [user]);

  // Manual Refresh Function
  const handleRefresh = () => {
    if (!user?.companyCode) return;
    setLoading(true);
    Promise.allSettled([
      fetchWeeklyReport(user.companyCode),
      fetchEmployees(user.companyCode),
      fetchTeams(user.companyCode),
      fetchTeamMetrics(user.companyCode).catch(() => [])
    ]).then(([reportResult, employeesResult, teamsResult, metricsResult]) => {
      if (reportResult.status === 'fulfilled') setReport(reportResult.value);
      if (employeesResult.status === 'fulfilled') setEmployees(employeesResult.value);
      if (teamsResult.status === 'fulfilled') setTeams(teamsResult.value || []);
      if (metricsResult.status === 'fulfilled') setTeamMetrics(metricsResult.value || []);
      setLoading(false);
    });
  };

  // Fetch detailed reports for teams being compared
  useEffect(() => {
    if (insightMode === 'compare' && compareTeamIds.length > 0) {
      const fetchMissing = async () => {
        const missingIds = compareTeamIds.filter(id => !comparisonReports[id]);
        if (missingIds.length === 0) return;

        setComparingLoading(true);
        const fetchedData = {};
        
        await Promise.all(missingIds.map(async (id) => {
          try {
            const data = await fetchWeeklyReport(`${user.companyCode}?teamId=${id}`);
            fetchedData[id] = data;
          } catch (e) {
            console.error(`Failed to fetch report for team ${id}`, e);
          }
        }));
        
        setComparisonReports(prev => ({ ...prev, ...fetchedData }));
        setComparingLoading(false);
      };
      fetchMissing();
    }
  }, [insightMode, compareTeamIds, user.companyCode]);

  const refreshMetrics = () => {
    if (user?.companyCode) {
      fetchTeamMetrics(user.companyCode)
        .then(data => setTeamMetrics(data || []))
        .catch(console.error);
    }
  };

  // --- Team Management Logic ---
  const handleCreateTeam = async (e) => {
    e.preventDefault();
    if (!newTeamName.trim()) return;
    try {
      const team = await createTeam({ name: newTeamName, companyCode: user.companyCode });
      setTeams([...teams, team]);
      setNewTeamName('');
      refreshMetrics();
    } catch (err) { alert(err.message); }
  };

  const handleDeleteTeam = async (teamId) => {
    if (!window.confirm('Delete this team? Employees will become unassigned.')) return;
    try {
      await deleteTeam(teamId);
      setTeams(teams.filter(t => t.id !== teamId));
      setTeamMetrics(prev => prev.filter(t => t.teamId !== teamId));
      // Reset local employee state to unassigned for this team
      setEmployees(prev => prev.map(e => e.teamId === teamId ? { ...e, teamId: null } : e));
      // Verify persistence with backend
      fetchEmployees(user.companyCode).then(setEmployees);
    } catch (err) { alert(err.message); }
  };

  const onDragStart = (e, employeeId) => {
    e.dataTransfer.setData('employeeId', employeeId);
    e.dataTransfer.effectAllowed = 'move';
  };

  const onDrop = async (e, teamId) => {
    e.preventDefault();
    if (teamId === undefined) return;
    const employeeId = parseInt(e.dataTransfer.getData('employeeId'), 10);
    if (!employeeId) return;

    // Optimistic Update
    setEmployees(prev => prev.map(emp => 
      emp.id === employeeId ? { ...emp, teamId: teamId } : emp
    ));

    try {
      await assignEmployeeToTeam({ userId: employeeId, teamId: teamId });
      refreshMetrics();
      // Verify persistence by re-fetching from server immediately
      const updatedEmployees = await fetchEmployees(user.companyCode);
      setEmployees(updatedEmployees);
    } catch (err) {
      console.error("Failed to assign team", err);
      // Revert on failure
      fetchEmployees(user.companyCode).then(setEmployees);
    }
  };

  const onDragOver = (e) => {
    e.preventDefault();
    e.dataTransfer.dropEffect = 'move';
  };

  const copyCode = () => {
    navigator.clipboard.writeText(user.companyCode);
    alert('Company code copied to clipboard!');
  };

  const handleInsightTeamChange = async (e) => {
    const tId = e.target.value;
    setInsightTeamId(tId);
    if (tId) {
      setInsightLoading(true); // Start loading
      try {
        const data = await fetchWeeklyReport(`${user.companyCode}?teamId=${tId}`);
        setInsightTeamReport(data);
      } catch(err) { console.error(err); }
      setInsightLoading(false); // End loading
    } else {
      setInsightTeamReport(null);
    }
  };

  // --- Chart Data Preparation ---
  const getComparisonChartData = () => {
    // Filter out teams with < 5 members for privacy
    const validTeams = Array.isArray(teamMetrics) ? teamMetrics.filter(t => t.memberCount >= 5) : [];
    
    return {
      labels: validTeams.map(t => t.name),
      datasets: [
        { 
          label: 'Avg Stress', 
          data: validTeams.map(t => t.avgStress), 
          backgroundColor: '#ef4444', 
          borderColor: '#ef4444',
          borderWidth: 2,
          borderRadius: 4,
          tension: 0.4
        },
        { 
          label: 'Avg Workload', 
          data: validTeams.map(t => t.avgWorkload), 
          backgroundColor: '#8b5cf6', 
          borderColor: '#8b5cf6',
          borderWidth: 2,
          borderRadius: 4,
          tension: 0.4
        }
      ]
    };
  };

  const getDriverChartData = (source = report) => {
    if (!source || !source.drivers || !source.drivers.distribution) return null;
    const dist = source.drivers.distribution;
    return {
      labels: ['Stress', 'Sleep Quality', 'Workload', 'Caffeine'],
      datasets: [
        {
          data: [dist.stress, dist.sleep, dist.workload, dist.coffee],
          backgroundColor: [
            'rgba(239, 68, 68, 0.8)',  // Red for Stress
            'rgba(59, 130, 246, 0.8)', // Blue for Sleep
            'rgba(168, 85, 247, 0.8)', // Purple for Workload
            'rgba(120, 53, 15, 0.8)',  // Brown for Coffee
          ],
          borderColor: [
            'rgba(239, 68, 68, 1)',
            'rgba(59, 130, 246, 1)',
            'rgba(168, 85, 247, 1)',
            'rgba(120, 53, 15, 1)',
          ],
          borderWidth: 1,
        },
      ],
    };
  };

  const getRiskDistChartData = (source = report) => {
    if (!source || !source.riskDistribution) return null;
    const dist = source.riskDistribution;
    return {
      labels: ['Low', 'Moderate', 'High', 'Critical'],
      datasets: [
        {
          data: [dist.low, dist.moderate, dist.high, dist.critical],
          backgroundColor: ['#10b981', '#f59e0b', '#f97316', '#ef4444'],
          borderWidth: 0,
        },
      ],
    };
  };

  const getRadarChartData = (source = report, comparison = null) => {
    if (!source || !source.datasets) return null;

    const calcAvg = (arr) => {
      const valid = arr.filter(v => v !== null);
      if (valid.length === 0) return 0;
      return (valid.reduce((a, b) => a + b, 0) / valid.length).toFixed(1);
    };

    const datasets = [
      {
        label: comparison ? 'This Team' : 'Company Average',
        data: [
          calcAvg(source.datasets.stress),
          calcAvg(source.datasets.sleep),
          calcAvg(source.datasets.workload),
          calcAvg(source.datasets.coffee)
        ],
        backgroundColor: 'rgba(37, 99, 235, 0.2)',
        borderColor: '#2563eb',
        pointBackgroundColor: '#2563eb',
      },
      {
        label: 'Ideal Baseline',
        data: [3, 8, 5, 1],
        backgroundColor: 'rgba(16, 185, 129, 0.2)',
        borderColor: '#10b981',
        pointBackgroundColor: '#10b981',
      }
    ];

    if (comparison) {
      datasets.push({
        label: 'Company Average',
        data: [
          calcAvg(comparison.datasets.stress),
          calcAvg(comparison.datasets.sleep),
          calcAvg(comparison.datasets.workload),
          calcAvg(comparison.datasets.coffee)
        ],
        backgroundColor: 'rgba(100, 116, 139, 0.1)',
        borderColor: '#94a3b8',
        pointBackgroundColor: '#94a3b8',
        borderDash: [5, 5]
      });
    }

    return {
      labels: ['Stress', 'Sleep', 'Workload', 'Coffee'],
      datasets: datasets
    };
  };

  const getTeamTrendChartData = (data) => {
    if (!data || !data.datasets) return null;
    return {
      labels: data.labels,
      datasets: [
        {
          label: 'Stress',
          data: data.datasets.stress,
          borderColor: '#ef4444',
          backgroundColor: 'rgba(239, 68, 68, 0.1)',
          tension: 0.4,
          fill: true
        },
        {
          label: 'Workload',
          data: data.datasets.workload,
          borderColor: '#8b5cf6',
          backgroundColor: 'transparent',
          tension: 0.4,
          borderDash: [5, 5]
        }
      ]
    };
  };

  const getMultiTeamComparisonData = () => {
    const selectedMetrics = teamMetrics.filter(t => compareTeamIds.includes(String(t.teamId)));
    if (selectedMetrics.length === 0) return null;

    return {
      labels: selectedMetrics.map(t => t.name),
      datasets: [
        {
          label: 'Avg Stress',
          data: selectedMetrics.map(t => t.avgStress),
          backgroundColor: '#ef4444',
          borderRadius: 4
        },
        {
          label: 'Avg Workload',
          data: selectedMetrics.map(t => t.avgWorkload),
          backgroundColor: '#8b5cf6',
          borderRadius: 4
        }
      ]
    };
  };

  const getComparisonRiskData = () => {
    if (!compareTeamIds || compareTeamIds.length === 0) return { labels: [], datasets: [] };
    
    const labels = [];
    const low = [], moderate = [], high = [], critical = [];

    compareTeamIds.forEach(id => {
      const team = teams.find(t => String(t.id) === String(id));
      const report = comparisonReports[id];
      if (team) {
        labels.push(team.name);
        let l = 0, m = 0, h = 0, c = 0;
        if (report && report.riskDistribution && !report.privacyLocked && report.employeeCount > 0) {
           const total = Number(report.employeeCount) || 1;
           const dist = report.riskDistribution;
           l = ((Number(dist.low) || 0) / total) * 100;
           m = ((Number(dist.moderate) || 0) / total) * 100;
           h = ((Number(dist.high) || 0) / total) * 100;
           c = ((Number(dist.critical) || 0) / total) * 100;
        }
        low.push(l); moderate.push(m); high.push(h); critical.push(c);
      }
    });

    return {
      labels,
      datasets: [
        { label: 'Low Risk', data: low, backgroundColor: '#10b981' },
        { label: 'Moderate', data: moderate, backgroundColor: '#f59e0b' },
        { label: 'High Risk', data: high, backgroundColor: '#f97316' },
        { label: 'Critical', data: critical, backgroundColor: '#ef4444' }
      ]
    };
  };

  const getComparisonDriverData = () => {
    if (!compareTeamIds || compareTeamIds.length === 0) return { labels: [], datasets: [] };
    const labels = [];
    const stress = [], sleep = [], workload = [], coffee = [];

    compareTeamIds.forEach(id => {
      const team = teams.find(t => String(t.id) === String(id));
      const report = comparisonReports[id];
      
      if (team) {
        labels.push(team.name);
        let s = 0, sl = 0, w = 0, c = 0;
        if (report && report.drivers && report.drivers.distribution && !report.privacyLocked && report.employeeCount > 0) {
          const dist = report.drivers.distribution;
          s = Number(dist.stress) || 0;
          sl = Number(dist.sleep) || 0;
          w = Number(dist.workload) || 0;
          c = Number(dist.coffee) || 0;
        }
        stress.push(s); sleep.push(sl); workload.push(w); coffee.push(c);
      }
    });

    return {
      labels,
      datasets: [
        { label: 'Stress', data: stress, backgroundColor: '#ef4444' },
        { label: 'Sleep', data: sleep, backgroundColor: '#3b82f6' },
        { label: 'Workload', data: workload, backgroundColor: '#8b5cf6' },
        { label: 'Caffeine', data: coffee, backgroundColor: '#78350f' }
      ]
    };
  };

  const cleanChartOptions = {
    responsive: true,
    maintainAspectRatio: false,
    plugins: {
      legend: { position: 'bottom', labels: { usePointStyle: true, boxWidth: 8 } },
      title: { display: false }
    },
    scales: {
      x: {
        grid: { display: false, drawBorder: false },
        ticks: { font: { size: 11 } }
      },
      y: {
        beginAtZero: true,
        grid: { display: false, drawBorder: false },
        ticks: { display: false } // Hide y-axis labels for cleaner look
      }
    }
  };

  const handleTeamClick = async (team) => {
    if (team.memberCount < 5) return;
    setSelectedTeam(team);
    setTeamLoading(true);
    try {
      // Pass teamId as query param to existing report endpoint
      const data = await fetchWeeklyReport(`${user.companyCode}?teamId=${team.teamId}`);
      setTeamReport(data);
    } catch (e) {
      console.error(e);
    } finally {
      setTeamLoading(false);
    }
  };

  const renderMetricTrend = (data, metricKey, color, label) => {
    if (!data || !data.datasets || !data.datasets[metricKey]) return null;
    const chartData = {
      labels: data.labels,
      datasets: [{
        label: label,
        data: data.datasets[metricKey],
        borderColor: color,
        backgroundColor: color + '20',
        borderWidth: 2,
        pointRadius: 0,
        tension: 0.4,
        fill: true
      }]
    };
    return <Line data={chartData} options={{...cleanChartOptions, plugins: { legend: { display: false } }, scales: { x: { display: false }, y: { display: false } }}} />;
  };

  return (
    <>
      <Navbar />
      <div className="container">
        <div style={{display: 'flex', justifyContent: 'space-between', alignItems: 'center'}}>
          <h1>Employer Dashboard</h1>
          <button 
            onClick={handleRefresh} 
            className="quiz-button" 
            style={{width: 'auto', padding: '8px 16px', fontSize: '0.9rem', backgroundColor: '#fff', color: '#2563eb', border: '1px solid #2563eb'}}>
            🔄 Refresh Data
          </button>
        </div>
        
        {user && (
          <div className="card" style={{marginBottom: '2rem', borderLeft: '5px solid #2563eb'}}>
            <h3>Your Company Code</h3>
            <div style={{fontSize: '3rem', fontWeight: '800', color: '#2563eb', margin: '1rem 0', display: 'flex', alignItems: 'center', gap: '1rem'}}>
              {user.companyCode}
              <button onClick={copyCode} style={{fontSize: '1rem', padding: '5px 10px', cursor: 'pointer', background: '#e0e7ff', border: 'none', borderRadius: '4px', color: '#3730a3'}}>Copy</button>
            </div>
            <p className="small">Share this code with your employees. They will need it to join your organization.</p>
          </div>
        )}

        {/* Navigation Tabs */}
        <div style={{ display: 'flex', gap: '1rem', marginBottom: '2rem', borderBottom: '1px solid #e2e8f0' }}>
          {['overview', 'teams', 'insights', 'simulator'].map(tab => (
            <button
              key={tab}
              onClick={() => setActiveTab(tab)}
              style={{
                padding: '1rem',
                background: 'none',
                border: 'none',
                borderBottom: activeTab === tab ? '3px solid #2563eb' : '3px solid transparent',
                fontWeight: activeTab === tab ? 'bold' : 'normal',
                color: activeTab === tab ? '#2563eb' : '#64748b',
                cursor: 'pointer',
                textTransform: 'capitalize'
              }}
            >
              {tab === 'teams' ? 'Team Management' : tab === 'insights' ? 'Team Insights' : tab === 'simulator' ? 'Action Simulator' : 'Overview'}
            </button>
          ))}
        </div>
        
        {loading && <div className="card"><p>Loading insights...</p></div>}
        
        {/* TAB 1: OVERVIEW (Existing Dashboard) */}
        {!loading && activeTab === 'overview' && report && (
          <div className="fade-in">
            {report.privacyLocked ? (
              <div className="card" style={{marginBottom: '2rem', borderLeft: '5px solid #0ea5e9', backgroundColor: '#f0f9ff'}}>
                <h4 style={{color: '#0284c7', marginTop: 0}}>Insights Locked for Privacy</h4>
                <p>Aggregated team insights are only generated when <strong>5 or more employees</strong> have joined your organization. This ensures individual data remains anonymous.</p>
                <p className="small" style={{marginBottom: 0}}>Current active employees: <strong>{report.employeeCount}</strong> / 5 required</p>
              </div>
            ) : (
              <>
                <div className="grid" style={{gridTemplateColumns: '1fr 1fr', marginBottom: '1rem'}}>
                  <div className="card">
                    <h4 style={{color: '#64748b'}}>Active Employees</h4>
                    <div className="result-score" style={{fontSize: '2.5rem'}}>{report.employeeCount || 0}</div>
                  </div>
                  <div className="card">
                    <h4 style={{color: '#64748b'}}>Total Check-ins</h4>
                    <div className="result-score" style={{fontSize: '2.5rem'}}>{report.totalCheckins || 0}</div>
                  </div>
                  <div className="card">
                    <h4 style={{color: '#64748b'}}>Plan Adherence</h4>
                    <div className="result-score" style={{fontSize: '2.5rem', color: '#8b5cf6'}}>{report.teamAdherence || 0}%</div>
                  </div>
                </div>

                {report.teamStatus && (
                  <div className="card" style={{ marginBottom: '1rem', borderLeft: `5px solid ${report.teamStatus.color}`, backgroundColor: report.teamStatus.color + '10' }}>
                      <h4 style={{color: report.teamStatus.color, marginTop: 0}}>Team Trend</h4>
                      <p style={{marginBottom: 0, fontWeight: 'bold', color: report.teamStatus.color}}>
                        {report.teamStatus.label}
                      </p>
                  </div>
                )}

                {report.insight && (
                  <div className="card" style={{ borderLeft: '5px solid #16a34a' }}>
                      <h4 style={{color: '#16a34a'}}>💡 Actionable Insight</h4>
                      <h5 style={{marginTop: '0.5rem', fontSize: '1.1rem'}}>{report.insight.title}</h5>
                      <p>{report.insight.suggestion}</p>
                  </div>
                )}

                {report.drivers && report.drivers.teamTopFactor && (
                  <div className="card" style={{ borderLeft: '5px solid #f59e0b', marginTop: '1rem', backgroundColor: '#fffbeb' }}>
                      <h4 style={{color: '#d97706', marginTop: 0}}>🔥 Primary Team Signal</h4>
                      <div style={{fontSize: '2rem', fontWeight: 'bold', margin: '0.5rem 0', color: '#92400e'}}>
                        {report.drivers.teamTopFactor.factor}
                      </div>
                      <p style={{marginBottom: 0, color: '#92400e'}}>
                        Based on aggregated check-ins, this factor appears to be the most significant contributor to team stress levels currently.
                      </p>
                  </div>
                )}
              </>
            )}

            <div style={{ marginTop: '1rem', textAlign: 'center' }}>
              <Link to="/settings" style={{ color: '#94a3b8', fontSize: '0.9rem', textDecoration: 'none', display: 'inline-flex', alignItems: 'center', gap: '6px' }}>
                <svg xmlns="http://www.w3.org/2000/svg" width="16" height="16" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round">
                  <path d="M12.22 2h-.44a2 2 0 0 0-2 2v.18a2 2 0 0 1-1 1.73l-.43.25a2 2 0 0 1-2-.35l-.18-.18a2 2 0 0 0-2.83 0l-.44.44a2 2 0 0 0 0 2.83l.18.18a2 2 0 0 1 .35 2l-.25.43a2 2 0 0 1-1.73 1H2a2 2 0 0 0-2 2v.44a2 2 0 0 0 2 2h.18a2 2 0 0 1 1.73 1l.25.43a2 2 0 0 1-.35 2l-.18.18a2 2 0 0 0 0 2.83l.44.44a2 2 0 0 0 2.83 0l.18-.18a2 2 0 0 1 2 .35l.43.25a2 2 0 0 1 1 1.73V22a2 2 0 0 0 2 2h.44a2 2 0 0 0 2-2v-.18a2 2 0 0 1 1-1.73l.43-.25a2 2 0 0 1 2 .35l.18.18a2 2 0 0 0 2.83 0l.44-.44a2 2 0 0 0 0-2.83l-.18-.18a2 2 0 0 1-.35-2l.25-.43a2 2 0 0 1 1.73-1H22a2 2 0 0 0 2-2v-.44a2 2 0 0 0-2-2h-.18a2 2 0 0 1-1.73-1l-.25-.43a2 2 0 0 1 .35-2l.18-.18a2 2 0 0 0 0-2.83l-.44-.44a2 2 0 0 0-2.83 0l-.18.18a2 2 0 0 1-2-.35l-.43-.25a2 2 0 0 1-1-1.73V4a2 2 0 0 0-2-2z"></path>
                  <circle cx="12" cy="12" r="3"></circle>
                </svg>
                Settings
              </Link>
            </div>
          </div>
        )}

        {/* TAB 2: TEAM MANAGEMENT (Drag & Drop) */}
        {!loading && activeTab === 'teams' && (
          <div className="fade-in">
            <div className="card" style={{ marginBottom: '2rem' }}>
              <h3>Create New Team</h3>
              <form onSubmit={handleCreateTeam} style={{ display: 'flex', gap: '1rem' }}>
                <input 
                  name="newTeamName"
                  value={newTeamName} 
                  onChange={e => setNewTeamName(e.target.value)} 
                  placeholder="e.g. Engineering, Sales" 
                  style={{ padding: '8px', flex: 1, border: '1px solid #cbd5e1', borderRadius: '4px' }}
                />
                <button type="submit" className="quiz-button" style={{ width: 'auto', padding: '0 1.5rem' }}>Create</button>
              </form>
              <div style={{ marginTop: '1rem', display: 'flex', gap: '0.5rem', flexWrap: 'wrap', alignItems: 'center' }}>
                <span style={{ fontSize: '0.9rem', color: '#64748b' }}>Suggestions:</span>
                {['Sales', 'Design', 'Customer Support', 'Developers', 'Finance'].map(name => (
                  <button 
                    key={name}
                    type="button"
                    onClick={() => setNewTeamName(name)}
                    style={{
                      background: '#f1f5f9',
                      border: '1px solid #cbd5e1',
                      borderRadius: '16px',
                      padding: '4px 12px',
                      fontSize: '0.85rem',
                      color: '#334155',
                      cursor: 'pointer'
                    }}
                  >
                    {name}
                  </button>
                ))}
              </div>
            </div>

            <div style={{ display: 'grid', gridTemplateColumns: '1fr 2fr', gap: '2rem' }}>
              {/* Unassigned Column */}
              <div 
                className="card" 
                onDragOver={onDragOver} 
                onDrop={(e) => onDrop(e, null)}
                style={{ backgroundColor: '#f8fafc', minHeight: '400px' }}
              >
                <h4 style={{ color: '#64748b' }}>Unassigned Employees</h4>
                <div style={{ display: 'flex', flexDirection: 'column', gap: '0.5rem' }}>
                  {employees.filter(e => !e.teamId).map(emp => (
                    <div 
                      key={emp.id} 
                      draggable 
                      onDragStart={(e) => onDragStart(e, emp.id)}
                      style={{ padding: '10px', background: 'white', border: '1px solid #e2e8f0', borderRadius: '4px', cursor: 'grab' }}
                    >
                      {emp.name} <span style={{ color: '#94a3b8', fontSize: '0.8rem' }}>({emp.email})</span>
                    </div>
                  ))}
                  {employees.filter(e => !e.teamId).length === 0 && <p className="small">No unassigned employees.</p>}
                </div>
              </div>

              {/* Teams Grid */}
              <div style={{ display: 'grid', gridTemplateColumns: 'repeat(auto-fill, minmax(250px, 1fr))', gap: '1rem' }}>
                {teams.map(team => {
                  const teamMembers = employees.filter(e => e.teamId === team.id);
                  return (
                    <div 
                      key={team.id} 
                      className="card"
                      onDragOver={onDragOver} 
                      onDrop={(e) => onDrop(e, team.id)}
                      style={{ minHeight: '200px', borderTop: '4px solid #2563eb' }}
                    >
                      <div style={{ display: 'flex', justifyContent: 'space-between' }}>
                        <h4 style={{ margin: 0 }}>{team.name}</h4>
                        <button onClick={() => handleDeleteTeam(team.id)} style={{ color: '#ef4444', background: 'none', border: 'none', cursor: 'pointer' }}>&times;</button>
                      </div>
                      <p className="small" style={{ color: teamMembers.length < 5 ? '#ef4444' : '#10b981' }}>
                        {teamMembers.length} Members {teamMembers.length < 5 && '(Min 5 for insights)'}
                      </p>
                      
                      <div style={{ marginTop: '1rem', display: 'flex', flexDirection: 'column', gap: '0.5rem' }}>
                        {teamMembers.map(emp => (
                          <div 
                            key={emp.id} 
                            draggable 
                            onDragStart={(e) => onDragStart(e, emp.id)}
                            style={{ padding: '8px', background: '#eff6ff', borderRadius: '4px', fontSize: '0.9rem', cursor: 'grab' }}
                          >
                            {emp.name}
                          </div>
                        ))}
                      </div>
                    </div>
                  );
                })}
              </div>
            </div>
          </div>
        )}

        {/* TAB 3: INSIGHTS (Comparison) */}
        {!loading && activeTab === 'insights' && (
          <div className="fade-in">
            {/* Insight Mode Selector */}
            <div style={{ display: 'flex', justifyContent: 'center', marginBottom: '2rem' }}>
              <div style={{ background: '#f1f5f9', padding: '4px', borderRadius: '8px', display: 'inline-flex' }}>
                {['overview', 'team', 'compare', 'saved'].map(mode => (
                  <button
                    key={mode}
                    onClick={() => { setInsightMode(mode); if(mode==='overview') setInsightTeamId(''); }}
                    style={{
                      padding: '8px 24px',
                      borderRadius: '6px',
                      border: 'none',
                      background: insightMode === mode ? 'white' : 'transparent',
                      color: insightMode === mode ? '#2563eb' : '#64748b',
                      fontWeight: insightMode === mode ? 'bold' : 'normal',
                      boxShadow: insightMode === mode ? '0 1px 3px rgba(0,0,0,0.1)' : 'none',
                      cursor: 'pointer',
                      textTransform: 'capitalize'
                    }}
                  >
                    {mode === 'overview' ? 'Company Overview' : mode === 'team' ? 'Individual Team' : mode === 'compare' ? 'Compare Teams' : 'Action Impact'}
                  </button>
                ))}
              </div>
            </div>

            {/* VIEW: OVERVIEW or TEAM (Shared Layout) */}
            {(insightMode === 'overview' || insightMode === 'team') && (
              <>
                {insightMode === 'team' && (
                  <div style={{ marginBottom: '2rem', textAlign: 'center' }}>
                    <select 
                      value={insightTeamId} 
                      onChange={handleInsightTeamChange}
                      style={{ padding: '10px 20px', fontSize: '1rem', borderRadius: '8px', border: '1px solid #cbd5e1', minWidth: '300px' }}
                    >
                      <option value="">-- Select a Team --</option>
                      {teams.map(t => <option key={t.id} value={t.id}>{t.name}</option>)}
                    </select>
                  </div>
                )}

                {insightLoading ? (
                  <div style={{ padding: '3rem', textAlign: 'center', color: '#64748b' }}>Loading team data...</div>
                ) : ((insightMode === 'overview' && report) || (insightMode === 'team' && insightTeamReport)) ? (
                  <>
                    {/* 1. Landscape (Huge) */}
                    <DensityLandscape report={insightMode === 'team' ? insightTeamReport : report} />

                    {/* 2. Metric Trends (4 Small Cards) */}
                    <div className="grid" style={{ gridTemplateColumns: 'repeat(auto-fit, minmax(200px, 1fr))', gap: '1.5rem', marginBottom: '2rem' }}>
                      {[
                        { key: 'stress', label: 'Stress Level', color: '#ef4444' },
                        { key: 'sleep', label: 'Sleep Quality', color: '#3b82f6' },
                        { key: 'workload', label: 'Workload', color: '#8b5cf6' },
                        { key: 'coffee', label: 'Caffeine', color: '#78350f' }
                      ].map(m => {
                        const data = insightMode === 'team' ? insightTeamReport : report;
                        const lastVal = data?.datasets?.[m.key]?.slice(-1)[0] || 0;
                        return (
                          <div key={m.key} className="card">
                            <div style={{ color: '#64748b', fontSize: '0.85rem', textTransform: 'uppercase', fontWeight: 'bold' }}>{m.label}</div>
                            <div style={{ fontSize: '2rem', fontWeight: 'bold', color: m.color, margin: '0.5rem 0' }}>{lastVal}</div>
                            <div style={{ height: '60px' }}>
                              {renderMetricTrend(data, m.key, m.color, m.label)}
                            </div>
                          </div>
                        );
                      })}
                    </div>

                    {/* 3. Detailed Graphs Row */}
                    <div className="grid" style={{ gridTemplateColumns: 'repeat(auto-fit, minmax(300px, 1fr))', gap: '2rem' }}>
                      <div className="card">
                        <h3>Burnout Drivers</h3>
                        <div style={{ height: '250px', display: 'flex', justifyContent: 'center' }}>
                          {getDriverChartData(insightMode === 'team' ? insightTeamReport : report) ? (
                            <Pie data={getDriverChartData(insightMode === 'team' ? insightTeamReport : report)} options={{ plugins: { legend: { position: 'right' } } }} />
                          ) : (
                            <p style={{ color: '#94a3b8', alignSelf: 'center' }}>No driver data available</p>
                          )}
                        </div>
                      </div>
                      <div className="card">
                        <h3>Risk Distribution</h3>
                        <div style={{ height: '250px', display: 'flex', justifyContent: 'center' }}>
                          {getRiskDistChartData(insightMode === 'team' ? insightTeamReport : report) ? (
                            <Doughnut data={getRiskDistChartData(insightMode === 'team' ? insightTeamReport : report)} options={{ plugins: { legend: { position: 'right' } }, cutout: '60%' }} />
                          ) : (
                            <p style={{ color: '#94a3b8', alignSelf: 'center' }}>No risk data available</p>
                          )}
                        </div>
                      </div>
                      <div className="card">
                        <h3>Health Radar</h3>
                        <div style={{ height: '250px', display: 'flex', justifyContent: 'center' }}>
                          {getRadarChartData(insightMode === 'team' ? insightTeamReport : report) ? (
                            <Radar 
                              data={getRadarChartData(insightMode === 'team' ? insightTeamReport : report)} 
                              options={{ scales: { r: { suggestedMin: 0, suggestedMax: 10 } }, plugins: { legend: { position: 'bottom' } } }} 
                            />
                          ) : (
                            <p style={{ color: '#94a3b8', alignSelf: 'center' }}>No radar data available</p>
                          )}
                        </div>
                      </div>
                    </div>
                  </>
                ) : (
                  insightMode === 'team' && <div style={{ padding: '3rem', textAlign: 'center', color: '#94a3b8' }}>Please select a team to view insights.</div>
                )}
              </>
            )}

            {/* VIEW: COMPARE */}
            {insightMode === 'compare' && (
              <div className="fade-in">
                <div className="card" style={{ marginBottom: '2rem' }}>
                  <h3>Select Teams to Compare</h3>
                  <div style={{ display: 'flex', flexWrap: 'wrap', gap: '1rem', marginTop: '1rem' }}>
                    {teams.map(t => (
                      <button
                        key={t.id}
                        onClick={() => setCompareTeamIds(prev => prev.includes(String(t.id)) ? prev.filter(id => id !== String(t.id)) : [...prev, String(t.id)])}
                        style={{
                          padding: '8px 16px',
                          borderRadius: '20px',
                          border: compareTeamIds.includes(String(t.id)) ? '2px solid #2563eb' : '1px solid #cbd5e1',
                          background: compareTeamIds.includes(String(t.id)) ? '#eff6ff' : 'white',
                          color: compareTeamIds.includes(String(t.id)) ? '#2563eb' : '#64748b',
                          cursor: 'pointer',
                          fontWeight: compareTeamIds.includes(String(t.id)) ? 'bold' : 'normal'
                        }}
                      >
                        {t.name}
                      </button>
                    ))}
                  </div>
                  {compareTeamIds.length < 2 && <p className="small" style={{ marginTop: '1rem', color: '#f59e0b' }}>Select at least 2 teams to compare.</p>}
                </div>

                {compareTeamIds.length >= 2 && (
                  <div className="card">
                    <h3>Metric Comparison</h3>
                    <div style={{ height: '300px' }}>
                      {getMultiTeamComparisonData() ? (
                        <Bar 
                          data={getMultiTeamComparisonData()} 
                          options={cleanChartOptions} 
                        />
                      ) : (
                        <p style={{ textAlign: 'center', paddingTop: '2rem', color: '#94a3b8' }}>Insufficient data for comparison</p>
                      )}
                    </div>
                  </div>
                )}

                {compareTeamIds.length >= 2 && !comparingLoading && (
                  <div className="grid" style={{ gridTemplateColumns: '1fr 1fr', gap: '2rem', marginTop: '2rem' }}>
                    <div className="card">
                      <h3>Risk Distribution</h3>
                      <div style={{ height: '300px' }}>
                        <Bar 
                          key={`risk-${compareTeamIds.join('-')}`}
                          data={getComparisonRiskData()} 
                          options={{...cleanChartOptions, scales: { x: { stacked: true }, y: { stacked: true, ticks: { display: true } } }}} 
                        />
                      </div>
                    </div>
                    <div className="card">
                      <h3>Driver Impact</h3>
                      <div style={{ height: '300px' }}>
                        <Bar 
                          key={`driver-${compareTeamIds.join('-')}`}
                          data={getComparisonDriverData()} 
                          options={{...cleanChartOptions, scales: { y: { beginAtZero: true, ticks: { display: true } } }}} 
                        />
                      </div>
                    </div>
                  </div>
                )}

                {comparingLoading && (
                  <div style={{ padding: '2rem', textAlign: 'center', color: '#64748b' }}>
                    Loading detailed team data...
                  </div>
                )}
              </div>
            )}

            {/* VIEW: ACTION IMPACT (Saved Simulations) */}
            {insightMode === 'saved' && (
              <div className="fade-in">
                {savedSimulations.length === 0 ? (
                  <div className="card" style={{ textAlign: 'center', padding: '3rem', color: '#94a3b8' }}>
                    <p>No saved simulations yet. Run a simulation to save it here.</p>
                    <button onClick={() => setActiveTab('simulator')} className="quiz-button" style={{ width: 'auto', marginTop: '1rem' }}>
                      Go to Simulator
                    </button>
                  </div>
                ) : (
                  <div className="grid" style={{ gridTemplateColumns: 'repeat(auto-fill, minmax(350px, 1fr))', gap: '1.5rem' }}>
                    {savedSimulations.map(sim => (
                      <div key={sim.id} className="card" style={{ position: 'relative', borderTop: '4px solid #8b5cf6' }}>
                        <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'start', marginBottom: '1rem' }}>
                          <div>
                            <h4 style={{ margin: 0 }}>{sim.plan.name}</h4>
                            <div style={{ fontSize: '0.8rem', color: '#64748b' }}>{new Date(sim.date).toLocaleDateString()}</div>
                          </div>
                          <div style={{ textAlign: 'right' }}>
                            <div style={{ fontSize: '1.5rem', fontWeight: 'bold', color: '#10b981' }}>{sim.results.metrics.deltaPercent}%</div>
                            <div style={{ fontSize: '0.8rem', color: '#64748b' }}>Risk Reduction</div>
                          </div>
                        </div>
                        
                        <div style={{ marginBottom: '1rem', fontSize: '0.9rem' }}>
                          <strong>Interventions:</strong>
                          <ul style={{ paddingLeft: '1.2rem', margin: '0.5rem 0', color: '#334155' }}>
                            {sim.plan.actions.map((a, i) => (
                              <li key={i}>{SIM_ACTION_TYPES.find(t => t.id === a.type)?.label || a.type} ({a.intensity}%)</li>
                            ))}
                          </ul>
                        </div>

                        <div style={{ display: 'flex', justifyContent: 'space-between', fontSize: '0.9rem', borderTop: '1px solid #f1f5f9', paddingTop: '0.5rem' }}>
                           <span>Est. Cost: <strong>${sim.results.metrics.estimatedCost.toLocaleString()}</strong></span>
                           <span>Time: <strong>{sim.results.metrics.timeToImpact || '12+'} wks</strong></span>
                        </div>
                        
                        <button onClick={() => { const updated = savedSimulations.filter(s => s.id !== sim.id); setSavedSimulations(updated); localStorage.setItem('employer_saved_simulations', JSON.stringify(updated)); }} style={{ position: 'absolute', top: '1rem', right: '1rem', background: 'none', border: 'none', color: '#94a3b8', cursor: 'pointer', fontSize: '1.2rem' }}>&times;</button>
                      </div>
                    ))}
                  </div>
                )}
              </div>
            )}
          </div>
        )}

        {/* TAB 4: ACTION SIMULATOR */}
        {!loading && activeTab === 'simulator' && (
          <SimulatorTab 
            user={user}
            simPlan={simPlan}
            setSimPlan={setSimPlan}
            simResults={simResults}
            setSimResults={setSimResults}
            simLoading={simLoading}
            setSimLoading={setSimLoading}
            simWeek={simWeek}
            setSimWeek={setSimWeek}
            handleSaveSimulation={handleSaveSimulation}
            toggleSimAction={toggleSimAction}
            updateSimAction={updateSimAction}
            cleanChartOptions={cleanChartOptions}
          />
        )}

        {/* Privacy Assurance Footer (Always Visible) */}
        <div className="card" style={{backgroundColor: '#f8fafc', border: '1px solid #e2e8f0', marginTop: '2rem'}}>
          <h4 style={{marginTop: 0, color: '#64748b', display: 'flex', alignItems: 'center', gap: '0.5rem'}}>
            <span>🔒</span> Privacy Assurance
          </h4>
          <p className="small" style={{marginBottom: 0, color: '#475569'}}>
            This dashboard displays aggregated data only. Individual employee check-ins and burnout scores are never revealed to you to protect their privacy and psychological safety.
          </p>
        </div>
      </div>

      {/* Team Details Modal */}
      {selectedTeam && (
        <div style={{ position: 'fixed', top: 0, left: 0, right: 0, bottom: 0, backgroundColor: 'rgba(0,0,0,0.5)', zIndex: 1000, display: 'flex', justifyContent: 'center', alignItems: 'center', backdropFilter: 'blur(4px)' }}>
          <div className="card fade-in" style={{ width: '90%', maxWidth: '1000px', maxHeight: '90vh', overflowY: 'auto', position: 'relative', boxShadow: '0 20px 25px -5px rgba(0, 0, 0, 0.1)' }}>
             <button onClick={() => setSelectedTeam(null)} style={{ position: 'absolute', top: '1.5rem', right: '1.5rem', background: 'none', border: 'none', fontSize: '1.5rem', cursor: 'pointer', color: '#64748b' }}>&times;</button>
             
             <h2 style={{ marginBottom: '0.5rem' }}>{selectedTeam.name} Insights</h2>
             <p className="small" style={{ marginBottom: '2rem' }}>Detailed analytics for {selectedTeam.memberCount} active members.</p>
             
             {teamLoading ? (
               <div style={{ padding: '4rem', textAlign: 'center', color: '#64748b' }}>Loading team data...</div>
             ) : (
               teamReport ? (
                 <div className="grid" style={{ gridTemplateColumns: '1fr 1fr', gap: '2rem' }}>
                    {/* 1. Trend Line */}
                    <div className="card" style={{ gridColumn: '1 / -1' }}>
                      <h3>Weekly Trends</h3>
                      <div style={{ height: '300px' }}>
                        <Line data={getTeamTrendChartData(teamReport)} options={cleanChartOptions} />
                      </div>
                    </div>

                    {/* 2. Radar Comparison */}
                    <div className="card">
                      <h3>Team vs Company</h3>
                      <p className="small">Comparing {selectedTeam.name} against company average.</p>
                      <div style={{ height: '300px', display: 'flex', justifyContent: 'center' }}>
                        <Radar 
                          data={getRadarChartData(teamReport, report)} 
                          options={{
                            scales: { r: { suggestedMin: 0, suggestedMax: 10 } },
                            plugins: { legend: { position: 'bottom' } }
                          }} 
                        />
                      </div>
                    </div>

                    {/* 3. Drivers */}
                    <div className="card">
                      <h3>Primary Drivers</h3>
                      <p className="small">Factors contributing most to this team's stress.</p>
                      <div style={{ height: '250px', display: 'flex', justifyContent: 'center' }}>
                        <Pie data={getDriverChartData(teamReport)} options={{ plugins: { legend: { position: 'right' } } }} />
                      </div>
                    </div>
                 </div>
               ) : (
                 <p>No data available for this team.</p>
               )
             )}
          </div>
        </div>
      )}
    </>
  );
}
