# Analytics Documentation

We use PostHog for product analytics. This document outlines the event schema and implementation details.

## Implementation Overview

- **Service**: `frontend/src/services/analytics.js` handles initialization and event capturing.
- **Internal Users**: Users with emails containing `burnout.ai`, `internal.com`, or `test.com` are automatically opted out of tracking.
- **Environment**: Events include an `env` property (`production` or `development`).

## Event Schema

### User Lifecycle
| Event Name | Trigger | Properties |
|------------|---------|------------|
| `user_signed_up` | User successfully registers | `role`, `company_id`, `signup_source` |

### Core Value Loop
| Event Name | Trigger | Properties |
|------------|---------|------------|
| `burnout_score_viewed` | Employee dashboard loads | `current_score`, `weekly_avg`, `risk_band` |
| `primary_signal_identified` | Top burnout factor displayed | `signal_name`, `contribution_percent` |
| `action_plan_progress_updated` | User checks/unchecks an action | `action_type`, `status` |

### Employer Features
| Event Name | Trigger | Properties |
|------------|---------|------------|
| `employer_dashboard_viewed` | Employer dashboard loads | `employee_count_bucket`, `privacy_locked` |
| `individual_data_attempt_blocked` | Privacy lock is active | `attempted_action` |

### Pilot Feedback
| Event Name | Trigger | Properties |
|------------|---------|------------|
| `pilot_survey_viewed` | Survey modal appears | `days_active` |
| `pilot_survey_submitted` | User submits survey | `days_active`, `behaviour_changed` |

## Adding New Events

1. Import the analytics service:
   ```javascript
   import { analytics } from '../services/analytics';
   ```

2. Call the capture method:
   ```javascript
   analytics.capture('event_name', {
     property_key: 'value'
   });
   ```

3. Ensure `is_internal` logic in `analytics.js` covers any new internal domains.

## Tools

- **Dashboard Generator**: Run `node backend/create_dashboard.js` to automatically provision a PostHog dashboard with charts for all the events listed above.
- **Cleanup Script**: Run `node backend/routes/cleanup_posthog.js` to delete events from internal test users.

3. Ensure `is_internal` logic in `analytics.js` covers any new internal domains.