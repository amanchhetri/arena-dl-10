# Challenge Arena — App Privacy Questionnaire Answers

Paste each section verbatim into App Store Connect's App Privacy section.

## Data Collected and Linked to Identity

### Contact Info

- **Email Address** — used for: App Functionality (sign-in via magic link), Account Management.

### User Content

- **Photos or Videos** — used for: App Functionality (challenge proof submission). Stored in private bucket; visible only to the user (group-mates added in Slice 2).
- **Other User Content** — display name, bio, avatar URL.

### Identifiers

- **User ID** — Supabase-issued UUID. Used for: App Functionality, Analytics.

### Usage Data

- **Product Interaction** — challenges viewed/accepted/completed, level-ups, streak milestones. Used for: Analytics, Product Personalization.

### Diagnostics

- **Crash Data** — via Sentry. Used for: App Functionality.
- **Performance Data** — via Sentry. Used for: App Functionality.

## Data NOT Collected

- Location, health/fitness data, financial info, contacts, browsing history,
  search history, advertising data, sensor data, other diagnostic data.

## Tracking

- We do NOT track users across other companies' apps and websites.

## Data Use Disclosures

- Email is used solely for sign-in delivery (transactional). No marketing emails.
- Analytics events are not joined with any external advertising graph.
