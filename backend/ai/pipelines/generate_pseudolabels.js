const fs = require('fs');
const path = require('path');
const parse = require('csv-parse/lib/sync');
const stringify = require('csv-stringify/lib/sync');

/**
 * This script generates pseudo-labels for a burnout score based on a weighted average of specific features.
 * It reads a source CSV, calculates the 'burnout_score', adds noise, and saves a new CSV containing
 * only the burnout score and the features used to calculate it.
 */

// --- Configuration ---
const INPUT_CSV = path.join(__dirname, '../datasets/Stress data numbers.csv');
const OUTPUT_CSV = path.join(__dirname, '../datasets/stress_data_pseudolabeled.csv');

// Define columns and their weights for pseudo-labeling
const PSEUDO_LABEL_CONFIG = {
    ee_cols: { columns: ['emo1'], weight: 0.35, inverted: false },      // "I feel emotionally drained from my work."
    s_cols: { columns: ['cogn1'], weight: 0.25, inverted: false },       // "I have trouble concentrating at work."
    sfq_cols: { columns: ['ERI1'], weight: 0.15, inverted: true },      // "I receive the respect I deserve for my work."
    wp_cols: { columns: ['wp1'], weight: 0.20, inverted: false },        // "I have too much work to do."
    auton_cols: { columns: ['auton1'], weight: 0.05, inverted: true }   // "I have a lot of say in what happens on my job."
};

// --- Main Processing Function ---
function generatePseudoLabels() {
    try {
        // 1. Load the dataset
        const rawCSV = fs.readFileSync(INPUT_CSV, 'utf8');
        const records = parse(rawCSV, { columns: true, skip_empty_lines: true, cast: true });
        console.log(`Successfully loaded '${path.basename(INPUT_CSV)}'.`);

        // Get a flat list of all columns to be used for labeling
        const allFeatureCols = Object.values(PSEUDO_LABEL_CONFIG).flatMap(config => config.columns);

        // Check if all required columns exist
        const missingCols = allFeatureCols.filter(col => !(col in records[0]));
        if (missingCols.length > 0) {
            console.error(`Error: The following required columns are missing from the CSV file: ${missingCols.join(', ')}`);
            return;
        }

        // 2. Calculate 'burnout_score' for each record
        const processedRecords = records.map(row => {
            let weightedSum = 0;
            let totalWeight = 0;

            // Calculate the weighted average from the config
            for (const key in PSEUDO_LABEL_CONFIG) {
                const { columns, weight, inverted } = PSEUDO_LABEL_CONFIG[key];
                const values = columns.map(col => row[col] || 0);
                let mean = values.reduce((a, b) => a + b, 0) / values.length;

                // --- INVERT SCORE FOR POSITIVE QUESTIONS ---
                // If a question is positive (like 'autonomy'), a high score should reduce burnout.
                if (inverted) {
                    mean = 100 - mean;
                }

                // --- NON-LINEAR TRANSFORMATION ---
                // Apply a non-linear effect for emotional and cognitive strain.
                // We'll use a power function to make higher scores contribute disproportionately more.
                // A value of 1.5 is a good starting point. Higher values = more extreme effect.
                if (key === 'ee_cols' || key === 's_cols') {
                    // Scale to 0-1, apply power, then scale back to 0-100
                    mean = Math.pow(mean / 100, 1.5) * 100;
                }

                weightedSum += mean * weight;
                totalWeight += weight;
            }

            // The weighted sum is already on a 0-100 scale, so we just need to normalize by the total weight.
            const baseScore = weightedSum / totalWeight;

            // Add some randomness (noise from a normal-like distribution)
            // Math.random() - 0.5 creates a value between -0.5 and 0.5
            const noise = (Math.random() - 0.5) * 30; // Increased noise range of -15 to +15
            let finalScore = baseScore + noise;

            // Clip the score to be within a 0-100 range
            finalScore = Math.max(0, Math.min(100, finalScore));

            // 3. Create a new row, keeping only the feature columns and the new score
            const newRow = {
                burnout_score: finalScore
            };
            allFeatureCols.forEach(col => {
                newRow[col] = row[col];
            });

            return newRow;
        });

        console.log("'burnout_score' column created. New dataset contains only source columns and the new score.");

        // 4. Save the new dataframe to a CSV file
        if (processedRecords.length > 0) {
            const outputCSV = stringify(processedRecords, { header: true });
            fs.writeFileSync(OUTPUT_CSV, outputCSV);
            console.log(`Processed data saved to '${path.basename(OUTPUT_CSV)}'.`);
        } else {
            console.warn("No records were processed. Output file not created.");
        }

    } catch (error) {
        console.error("An error occurred during processing:", error.message);
        if (error.code === 'ENOENT') {
            console.error(`Please ensure the input file exists at: ${INPUT_CSV}`);
        }
    }
}

// Run the script
generatePseudoLabels();