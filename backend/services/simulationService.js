/**
 * Simulation Service
 * Handles Monte Carlo simulations for employer scenarios.
 */

// 1. Define Constants ONCE at the top level to avoid SyntaxError
const NUM_SIMULATIONS = 50;
const SMOOTHING = 0.2;

class SimulationService {
  /**
   * Runs a Monte Carlo simulation for a group of employees based on an employer's action plan.
   * @param {Array} employeeBaselines - Array of baseline objects { stress, sleep, workload, coffee, risk }
   * @param {Object} plan - { name, actions: [], durationWeeks, avgHourlyRate }
   * @returns {Object} { timeline, estimatedCost }
   */
  static runMonteCarlo(employeeBaselines, plan) {
    const durationWeeks = plan.durationWeeks || 12;
    const durationDays = durationWeeks * 7;
    const actions = plan.actions || [];
    
    // Initialize aggregate timeline
    const aggregateTimeline = new Array(durationDays).fill(0);

    // If no employees, return empty timeline
    if (!employeeBaselines || employeeBaselines.length === 0) {
      return { 
        timeline: Array.from({length: durationDays}, (_, i) => ({ day: i+1, risk: 50 })), 
        estimatedCost: 0 
      };
    }

    // Iterate through each employee
    employeeBaselines.forEach(employee => {
      const empTimeline = new Array(durationDays).fill(0);

      // Monte Carlo Loop
      for (let i = 0; i < NUM_SIMULATIONS; i++) {
        // Initialize state for this simulation run
        let currentStress = employee.stress;
        let currentSleep = employee.sleep;
        let currentWorkload = employee.workload;
        let currentRisk = employee.risk;
        let fatigueBank = 0;

        for (let day = 0; day < durationDays; day++) {
          // 1. Noise
          const noise = (Math.random() - 0.5); // +/- 0.5
          
          // 2. Apply Actions (Simplified Physics)
          let actionImpactStress = 0;
          let actionImpactWorkload = 0;

          actions.forEach(action => {
             // Heuristic: Intensity 0-100
             // Type: 'workload', 'recovery', etc.
             const intensity = Number(action.intensity || 0);
             const adherence = Number(action.adherence || 100) / 100;
             
             if (Math.random() <= adherence) {
               if (action.type === 'workload') {
                 // Reduces workload
                 actionImpactWorkload -= (intensity / 100) * 2; // Max -2
               } else if (action.type === 'recovery') {
                 // Reduces stress
                 actionImpactStress -= (intensity / 100) * 1.5; // Max -1.5
               }
             }
          });

          // 3. Evolve State
          let dailyStress = currentStress + noise + actionImpactStress;
          let dailyWorkload = currentWorkload + noise + actionImpactWorkload;
          let dailySleep = currentSleep + noise; // Actions might improve sleep indirectly via stress

          // Weekend recovery
          const isWeekend = (day % 7 === 5 || day % 7 === 6);
          if (isWeekend) {
            dailyStress *= 0.9;
            dailyWorkload *= 0.2;
          }

          // Bounds
          dailyStress = Math.max(1, Math.min(10, dailyStress));
          dailyWorkload = Math.max(1, Math.min(10, dailyWorkload));
          dailySleep = Math.max(4, Math.min(12, dailySleep));

          // 4. Calculate Risk (Formula from employerSimulator.js)
          // risk = (stress * 0.4 + workload * 0.3 + (10-sleep) * 0.3) * 10
          let dailyRisk = (dailyStress * 0.4 + dailyWorkload * 0.3 + (10 - dailySleep) * 0.3) * 10;
          
          // Fatigue Accumulation
          const load = dailyStress + dailyWorkload;
          const recovery = dailySleep + (isWeekend ? 4 : 2);
          if (load > recovery) fatigueBank += (load - recovery) * 0.1;
          else fatigueBank = Math.max(0, fatigueBank - (recovery - load) * 0.1);

          dailyRisk += fatigueBank;
          dailyRisk = Math.max(0, Math.min(100, dailyRisk));

          // Smoothing
          currentRisk = currentRisk * (1 - SMOOTHING) + dailyRisk * SMOOTHING;
          
          // Accumulate
          empTimeline[day] += currentRisk;
          
          // Carry over state (with some regression to mean to prevent explosion)
          currentStress = (currentStress * 0.8) + (dailyStress * 0.2);
          currentWorkload = (currentWorkload * 0.8) + (dailyWorkload * 0.2);
          currentSleep = (currentSleep * 0.8) + (dailySleep * 0.2);
        }
      }

      // Add employee average to aggregate
      for (let d = 0; d < durationDays; d++) {
        aggregateTimeline[d] += (empTimeline[d] / NUM_SIMULATIONS);
      }
    });

    // Finalize Timeline
    const timeline = aggregateTimeline.map((totalRisk, index) => ({
      day: index + 1,
      risk: totalRisk / employeeBaselines.length
    }));

    // Calculate Cost
    // Heuristic: $100 per action per employee per week * intensity%
    let estimatedCost = 0;
    actions.forEach(a => {
      estimatedCost += (employeeBaselines.length * durationWeeks * 100 * (a.intensity/50));
    });

    return { timeline, estimatedCost };
  }
}

module.exports = SimulationService;