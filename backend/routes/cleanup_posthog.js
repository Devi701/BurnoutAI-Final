/**
 * CLEANUP SCRIPT FOR POSTHOG
 * Usage: node scripts/cleanup_posthog.js
 * Requires: axios
 */

const axios = require('axios');

// CONFIGURATION
const PROJECT_ID = '109705'; // Found in PostHog Project Settings
//    Select Scope: "Project" -> Your Project -> Check "Read" AND "Write"
//    (If you can only select one, try adding the Project scope twice: once for Read, once for Write)
const PERSONAL_API_KEY = 'phx_3bKZPhGsOY64EXCZQ17SjWLJnHyjTRyWfG9PApfuydR6DKT'; // Create in Account Settings
const INTERNAL_EMAILS = [
  'test1@gmail.com',
  'test2@gmail.com',
  'test3@gmail.com',
  'test4@gmail.com',
  'test5@gmail.com',
  'maheshwariv919@gmail.com'
];

async function deleteInternalEvents() {
  console.log('Starting PostHog Cleanup...');

  try {
    // 1. Fetch Persons to find internal IDs
    console.log('Fetching persons...');
    const personsResponse = await axios.get(
      `https://eu.posthog.com/api/projects/${PROJECT_ID}/persons/`,
      { headers: { Authorization: `Bearer ${PERSONAL_API_KEY}` } }
    );

    const internalPersons = personsResponse.data.results.filter(p => {
      const email = p.properties.email;
      return INTERNAL_EMAILS.includes(email);
    });

    console.log(`Found ${internalPersons.length} internal persons.`);

    // 2. Delete Persons (This deletes associated events in PostHog)
    for (const person of internalPersons) {
      console.log(`Deleting person: ${person.properties.email} (ID: ${person.id})`);
      await axios.delete(
        `https://eu.posthog.com/api/projects/${PROJECT_ID}/persons/${person.id}/`,
        { headers: { Authorization: `Bearer ${PERSONAL_API_KEY}` } }
      );
    }

    console.log('Cleanup complete. Historical data is now clean.');

  } catch (error) {
    console.error('Error during cleanup:', error.response ? error.response.data : error.message);
  }
}

// Uncomment to run
// deleteInternalEvents();