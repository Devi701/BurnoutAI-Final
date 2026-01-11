const NUM_SIMULATIONS = 50;

class SimulationService {
  /**
   * Runs a Monte Carlo simulation for the given employee baselines and action plan.
   * @param {Array} employeeBaselines - Array of { stress, sleep, workload, coffee, risk }
   * @param {Object} plan - { durationWeeks, actions: [], avgHourlyRate }
   * @returns {Object} { timeline, metrics }
   */
  static runMonteCarlo(employeeBaselines, plan) {
    const SIM_DAYS = (plan.durationWeeks || 12) * 7;
    const actions = plan.actions || [];
    const hourlyRate = Number(plan.avgHourlyRate) || 50;
    const simEmployeeCount = Math.max(employeeBaselines.length, 1);

    // 1. Cost Estimation
    let estimatedCost = 0;
    actions.forEach(action => {
      const intensity = (action.intensity || 50) / 100;
      const weeks = plan.durationWeeks || 12;
      
      let hoursLostPerWeek = 0;
      switch (action.type) {
        case 'workload': hoursLostPerWeek = 40 * 0.1 * intensity; break;
        case 'recovery': hoursLostPerWeek = 2 * intensity; break;
        case 'behavioral': hoursLostPerWeek = 1 * intensity; break;
        case 'boundaries': hoursLostPerWeek = 0.5 * intensity; break;
      }
      
      estimatedCost += (hoursLostPerWeek * weeks * hourlyRate * simEmployeeCount);
    });

    // 2. Calculate Aggregate Baseline
    const avgBaseline = employeeBaselines.reduce((acc, b) => ({
      stress: acc.stress + b.stress,
      sleep: acc.sleep + b.sleep,
      workload: acc.workload + b.workload,
      coffee: acc.coffee + b.coffee
    }), { stress: 0, sleep: 0, workload: 0, coffee: 0 });

    if (employeeBaselines.length > 0) {
      avgBaseline.stress /= employeeBaselines.length;
      avgBaseline.sleep /= employeeBaselines.length;
      avgBaseline.workload /= employeeBaselines.length;
      avgBaseline.coffee /= employeeBaselines.length;
    }

    // Helper for random noise
    const noise = (magnitude = 0.2) => (Math.random() * magnitude * 2) - magnitude;

    // Action Physics
    const applyActions = (state, day) => {
      let { stress, sleep, workload } = state;
      
      // Natural drift
      stress += noise(0.3);
      sleep += noise(0.3);
      workload += noise(0.3);

      actions.forEach(action => {
        const adherence = (action.adherence || 100) / 100;
        const intensity = (action.intensity || 50) / 100;
        const ramp = Math.min(1, day / 21); 
        const effect = intensity * adherence * ramp * 0.7;

        switch (action.type) {
          case 'workload': 
            workload -= (2.0 * effect); 
            stress -= (1.0 * effect);
            sleep += (0.3 * effect);
            break;
          case 'recovery': 
            sleep += (1.5 * effect); 
            stress -= (1.2 * effect);
            workload -= (0.2 * effect);
            break;
          case 'boundaries': 
            stress -= (1.5 * effect);
            workload += (0.4 * effect);
            sleep += (1.0 * effect);
            break;
          case 'behavioral': 
            stress -= (1.0 * effect);
            break;
        }
      });

      // System Dynamics
      if (sleep < 6) stress += 0.5;
      if (stress > 8) sleep -= 0.5;
      if (workload > 8.5) stress += 0.5;

      return {
        stress: Math.max(1, Math.min(10, stress)),
        sleep: Math.max(4, Math.min(10, sleep)),
        workload: Math.max(1, Math.min(10, workload))
      };
    };

    // 3. Run Simulation Loop
    const dailyAggregates = new Array(SIM_DAYS + 1).fill(0).map(() => ({
      risk: 0, stress: 0, sleep: 0, workload: 0, coffee: 0
    }));
    const dailyBuckets = new Array(SIM_DAYS + 1).fill(null).map(() => ({ low: 0, moderate: 0, high: 0, critical: 0 }));
    
    for (let sim = 0; sim < NUM_SIMULATIONS; sim++) {
      let currentState = { ...avgBaseline };
      
      for (let day = 0; day <= SIM_DAYS; day++) {
        // Optimization: Pass object directly instead of spreading { ...currentState }
        // Destructuring in applyActions protects the original state from mutation
        const projected = applyActions(currentState, day);
        
        currentState.stress = (currentState.stress * 0.8) + (projected.stress * 0.2);
        currentState.sleep = (currentState.sleep * 0.8) + (projected.sleep * 0.2);
        currentState.workload = (currentState.workload * 0.8) + (projected.workload * 0.2);

        const risk = (currentState.stress * 4) + (currentState.workload * 3) + ((10 - currentState.sleep) * 3);
        
        dailyAggregates[day].risk += risk;
        dailyAggregates[day].stress += currentState.stress;
        dailyAggregates[day].sleep += currentState.sleep;
        dailyAggregates[day].workload += currentState.workload;
        dailyAggregates[day].coffee += currentState.coffee || 0;

        if (risk < 30) dailyBuckets[day].low++;
        else if (risk < 60) dailyBuckets[day].moderate++;
        else if (risk < 80) dailyBuckets[day].high++;
        else dailyBuckets[day].critical++;
      }
    }

    const timeline = dailyAggregates.map((dayData, index) => ({
      day: index,
      risk: dayData.risk / NUM_SIMULATIONS,
      stress: dayData.stress / NUM_SIMULATIONS,
      sleep: dayData.sleep / NUM_SIMULATIONS,
      workload: dayData.workload / NUM_SIMULATIONS,
      coffee: dayData.coffee / NUM_SIMULATIONS,
      distribution: dailyBuckets[index]
    }));

    return {
      timeline,
      estimatedCost,
      simEmployeeCount
    };
  }
}

module.exports = SimulationService;