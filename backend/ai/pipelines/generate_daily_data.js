const fs = require('fs');
const path = require('path');
const stringify = require('csv-stringify/lib/sync');

/**
 * Generates synthetic data for daily check-ins.
 */

// --- Configuration ---
const OUTPUT_CSV = path.join(__dirname, '../datasets/daily_checkin_data.csv');
const NUM_RECORDS = 2000;

const featureConfig = {
    stress:   { weight: 0.40, inverted: false }, // 0-10 scale
    sleep:    { weight: 0.30, inverted: true },  // 0-12 scale
    workload: { weight: 0.25, inverted: false }, // 0-10 scale
    coffee:   { weight: 0.05, inverted: false }, // 0-10 scale
};

function generateDailyData() {
    const records = [];
    for (let i = 0; i < NUM_RECORDS; i++) {
        const row = {};
        // Generate somewhat realistic base values
        row.stress = Math.floor(Math.random() * 11); // 0-10
        row.sleep = parseFloat((Math.random() * 8 + 4).toFixed(1)); // 4-12 hours
        row.workload = Math.floor(Math.random() * 11); // 0-10
        row.coffee = Math.floor(Math.random() * 6); // 0-5 cups

        let weightedSum = 0;
        let totalWeight = 0;

        // Calculate burnout score based on weights
        for (const key in featureConfig) {
            const { weight, inverted } = featureConfig[key];
            let value = row[key];

            // Normalize values to a 0-100 scale for consistent calculation
            if (key === 'stress' || key === 'workload' || key === 'coffee') value = value * 10;
            if (key === 'sleep') value = (value / 12) * 100;

            if (inverted) {
                value = 100 - value;
            }

            weightedSum += value * weight;
            totalWeight += weight;
        }

        const baseScore = weightedSum / totalWeight;
        const noise = (Math.random() - 0.5) * 10; // Add noise for realism
        let finalScore = Math.max(0, Math.min(100, baseScore + noise));

        row.burnout_score = finalScore;
        records.push(row);
    }

    const outputCSV = stringify(records, { header: true });
    fs.writeFileSync(OUTPUT_CSV, outputCSV);
    console.log(`Successfully generated ${NUM_RECORDS} records and saved to '${path.basename(OUTPUT_CSV)}'.`);
}

generateDailyData();