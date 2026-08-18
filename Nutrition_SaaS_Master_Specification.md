# Nutrition SaaS — Master Product & Engineering Specification

**Document status:** Master V1 Specification  
**Purpose:** Single source of truth for product design, engineering, UX, business rules, security, and phased implementation.  
**Deployment target:** Hostinger VPS + Coolify + Docker  
**Primary platforms:** Web SaaS + Client PWA in Stage 1; native client mobile app in Stage 2.

---

# 1. Product Overview

## 1.1 Product

A multi-tenant SaaS platform for dietitians and nutrition professionals to manage their entire practice digitally.

The system has three primary surfaces:

1. **Platform Admin Panel** — for the SaaS owner/developers.
2. **Dietitian/Practice Platform** — the complete nutrition practice management system.
3. **Client Portal/PWA** — the client's account for plans, tracking, progress, messaging, and documents.

The core objective is to eliminate repetitive/manual work traditionally spread across:

- WhatsApp
- Gmail/email
- Excel
- Word
- paper forms
- PDFs
- separate calendars
- manual calorie calculations
- disconnected client records
- manual meal-plan creation
- manual progress tracking
- scattered documents
- manual reminders

The SaaS should centralize these workflows.

## 1.2 Product philosophy

The product follows five principles:

- **Client-centered:** the client is the center of the practice record.
- **Automation-first:** repetitive work should be automated where safe.
- **Human-controlled AI:** AI assists the professional and never independently prescribes care.
- **Simple UX:** complexity belongs in the system, not in the user's workflow.
- **Expandable architecture:** V1 stays practical while allowing future payments, mobile apps, integrations, advanced AI, and larger practices.

---

# 2. Product Scope

## 2.1 Stage 1

Stage 1 includes:

- Admin panel
- Dietitian/practice SaaS
- Client web portal
- Client PWA
- Authentication
- Multi-tenancy
- Client management
- Assessments
- Measurements
- Nutrition calculations
- Food database
- Dietitian-specific food overrides
- Recipes
- Meal plans
- Progress tracking
- Appointments/calendar
- Messaging
- Documents
- Invoices
- Notifications
- Tasks
- Automation foundation
- AI foundation and controlled AI features
- Subscription plans
- Feature entitlements
- Per-organization feature overrides
- Audit logs
- Security
- Backups
- Monitoring
- Coolify deployment

## 2.2 Stage 2

Native client mobile application:

- iOS
- Android

It should use the same backend/API and business logic.

## 2.3 Future features

Possible future capabilities:

- Online subscription payments
- Client payments
- Video consultations
- Google/Apple authentication
- 2FA/passkeys
- WhatsApp integration
- SMS
- Voice messages
- Advanced AI
- Public dietitian marketplace
- Insurance billing
- Advanced organization/staff management
- Advanced integrations
- Native advanced offline tracking

---

# 3. User Types and Roles

## 3.1 Platform roles

### SUPER_ADMIN

Highest platform-level role.

Capabilities include:

- manage administrators
- manage organizations
- manage subscriptions
- manage plans
- manage features
- manage AI limits
- manage platform settings
- system analytics
- audit logs
- suspend/reactivate accounts
- platform configuration
- security-sensitive operations

### ADMIN

Normal platform administration.

Can manage:

- organizations
- dietitians
- plans
- features
- subscriptions
- AI usage
- platform support operations

Sensitive Super Admin actions may be restricted.

## 3.2 Organization roles

### OWNER

Practice owner.

Can:

- manage practice
- manage clients
- manage staff
- manage appointments
- manage meal plans
- manage recipes
- manage documents
- manage invoices
- manage analytics
- manage settings
- access subscription information

### DIETITIAN

Can access clients according to organization permissions and assignments.

### STAFF

Future-capable role for non-clinical staff such as receptionists or assistants.

Permissions must be granular enough to restrict access to sensitive nutrition/clinical information.

## 3.3 Client

Client is an end user belonging to an organization/practice.

Client can access only their own information.

---

# 4. Multi-Tenancy

The application is multi-tenant.

Each practice is represented by an organization.

Example:

```text
Platform
├── Organization A
│   ├── Owner
│   ├── Dietitian
│   └── Clients
├── Organization B
│   ├── Owner
│   └── Clients
└── Organization C
    ├── Owner
    └── Clients
```

A shared PostgreSQL database is used in V1.

Organization-owned records contain an `organization_id`.

Every backend query involving tenant-owned data must enforce organization isolation.

Example conceptual rule:

```text
SELECT *
FROM clients
WHERE id = :clientId
AND organization_id = :organizationId;
```

Never rely only on frontend filtering for tenant isolation.

---

# 5. Authentication

## 5.1 V1

Support:

- email/password
- email verification
- login
- logout
- password reset
- session management
- revoke sessions

Use secure password hashing such as Argon2id.

## 5.2 Future-ready

Architecture should allow:

- Google login
- Apple login
- 2FA
- passkeys

without redesigning the identity system.

## 5.3 Session management

Sessions must be revocable.

Users/admins should be able to terminate active sessions where appropriate.

---

# 6. Account Activation

Two V1 workflows are supported.

## 6.1 Admin-created account

```text
Admin
→ Create dietitian
→ Select subscription plan
→ Activate
→ Send invitation
→ Dietitian sets password
→ Login
```

## 6.2 Self-registration

```text
Dietitian
→ Register
→ Account status = PENDING
→ Admin reviews
→ Admin selects plan
→ Admin activates
→ Invitation/activation email
```

No payment gateway is required for V1.

---

# 7. Subscription System

There is **one unified subscription system**.

Do not create separate AI subscriptions, feature subscriptions, etc.

Structure:

```text
ONE SUBSCRIPTION
├── STANDARD
├── PRO
└── PREMIUM
```

A subscription plan defines:

- enabled features
- feature limits
- usage limits
- optional quotas

## 7.1 V1 billing

No online payment system.

The SaaS owner/admin manually:

- creates account
- selects plan
- activates account
- changes plan
- suspends account

## 7.2 Future billing

Database must support:

- billing cycle
- payment provider
- external subscription ID
- start date
- end date
- renewal date
- payment status

Future architecture:

```text
Payment Provider
→ Webhook
→ Subscription Service
→ Subscription status
```

---

# 8. Feature Entitlement System

Features are data-driven.

Each feature has:

- identifier
- name
- description
- active/inactive platform status
- plan availability
- optional limits

Example:

```text
Feature: AI Assistant

Standard → Disabled
Pro → Enabled / 300 requests
Premium → Enabled / 1000 requests
```

## 8.1 Organization overrides

Admin can override a feature for an individual organization.

Example:

```text
Plan = STANDARD
AI default = disabled
Admin override = enabled

Effective result = enabled
```

Or:

```text
Plan = PREMIUM
AI default = enabled
Admin override = disabled

Effective result = disabled
```

The system must calculate effective entitlements centrally.

---

# 9. Permission System

Subscription entitlement and authorization are separate concepts.

### Role permission

Answers:

> Is this user allowed to perform this action?

### Subscription entitlement

Answers:

> Does this organization have access to this feature?

### Override

Answers:

> Has the platform administrator manually changed this organization's entitlement?

Example permission identifiers:

```text
CLIENT_VIEW
CLIENT_CREATE
CLIENT_EDIT
CLIENT_ARCHIVE

ASSESSMENT_VIEW
ASSESSMENT_EDIT

MEAL_PLAN_CREATE
MEAL_PLAN_EDIT
MEAL_PLAN_PUBLISH

RECIPE_CREATE
FOOD_OVERRIDE_CREATE

APPOINTMENT_CREATE
APPOINTMENT_EDIT

MESSAGE_SEND

DOCUMENT_UPLOAD
DOCUMENT_VIEW

INVOICE_CREATE
INVOICE_VIEW

AI_USE
```

The backend must evaluate both authorization and feature entitlement.

---

# 10. Admin Panel

Main navigation:

```text
Dashboard
Organizations
Dietitians
Clients
Plans
Features
AI
Food Database
Analytics
System
Audit Logs
Settings
```

## 10.1 Admin dashboard

Display:

- total organizations
- active organizations
- pending organizations
- suspended organizations
- total clients
- subscription distribution
- AI usage
- storage usage
- system health
- recent platform activity
- recent errors

## 10.2 Organization management

Admin actions:

- create
- edit
- activate
- suspend
- archive
- change plan
- override features
- manage users
- inspect usage
- audit activity
- impersonate where authorized
- terminate

## 10.3 Dietitian/user management

Admin can view:

- name
- organization
- role
- plan
- account status
- client count
- AI usage
- created date
- last activity

Actions:

- view
- edit
- activate
- suspend
- change plan
- manage features
- revoke sessions
- impersonate where authorized

## 10.4 Plan manager

Admin can create/edit plans.

Each plan has:

- name
- description
- active status
- feature entitlements
- limits
- quotas

## 10.5 Feature manager

Admin can:

- enable/disable platform feature
- assign feature to plans
- define limits
- override organization settings

## 10.6 AI management

Admin can:

- globally enable/disable AI
- enable/disable individual AI capabilities
- assign AI features to plans
- set usage limits
- override limits per organization
- view usage
- inspect failures/cost metadata

---

# 11. Admin Impersonation

Admin support may impersonate a dietitian account.

Requirements:

- explicit authorization
- clear visual banner
- full audit logging
- no anonymous impersonation
- easy exit

Example:

```text
⚠ ADMIN IMPERSONATION MODE
You are viewing this account as support.
[Exit]
```

---

# 12. Dietitian Dashboard

The dashboard must answer:

> What needs my attention today?

Display:

### Today's appointments

- time
- client
- appointment type
- status
- quick actions

### Needs attention

Examples:

- client has no recent tracking
- meal plan expiring
- overdue task
- unread message
- overdue invoice

### Quick statistics

- active clients
- adherence average
- appointments
- outstanding invoices

### AI briefing

If AI is enabled, provide a concise summary of important actions.

---

# 13. Client Management

Dietitian can:

- create client
- invite client
- edit client
- archive client
- restore client
- assign client
- tag client
- search client
- filter client
- open client workspace
- communicate
- manage appointments
- create meal plans
- manage progress
- manage documents
- create invoices

Client list should support:

- search
- status filters
- goal filters
- assignment filters
- adherence filters
- last-visit filters
- saved filters

Useful saved filters:

```text
At-Risk Clients
No Appointment
Meal Plan Expiring
New Clients
```

---

# 14. Client Workspace

Client is the central entity.

Tabs:

```text
Overview
Timeline
Assessment
Care Plan
Meal Plan
Tracking
Progress
Appointments
Messages
Documents
Invoices
```

## 14.1 Client snapshot

Always show a compact summary:

- current weight
- target
- adherence
- last visit
- active plan
- next appointment

---

# 15. Client Profile

Potential information:

- name
- date of birth
- gender where relevant
- email
- phone
- profile photo
- goals
- preferences
- allergies
- dietary restrictions
- relevant health/nutrition information
- notes
- emergency/contact information if appropriate

Only collect information with a legitimate purpose.

---

# 16. Client Timeline

Automatically record important events:

```text
CLIENT_CREATED
ASSESSMENT_COMPLETED
APPOINTMENT_CREATED
APPOINTMENT_COMPLETED
MEAL_PLAN_CREATED
MEAL_PLAN_PUBLISHED
MESSAGE_SENT
DOCUMENT_UPLOADED
MEASUREMENT_ADDED
INVOICE_CREATED
```

Dietitian can also create manual timeline entries.

---

# 17. Assessments

Support configurable assessment templates.

Possible sections:

```text
Personal Information
Health History
Nutrition History
Dietary Preferences
Allergies
Lifestyle
Activity
Sleep
Hydration
Goals
Measurements
Notes
```

Assessment templates should be configurable at practice/platform level where appropriate.

---

# 18. Measurements and Calculations

Measurements can include:

- weight
- height
- BMI
- waist
- hips
- body fat
- muscle mass
- custom metrics

Nutrition engine may calculate:

- BMI
- BMR
- estimated energy requirements
- calorie targets
- macronutrient targets

Dietitian has final authority to override calculated values where appropriate.

---

# 19. Food Database

The platform contains an imported nutrition dataset.

Ingestion pipeline:

```text
Dataset
→ Import
→ Normalize
→ Validate
→ Deduplicate
→ Map nutrients
→ Database
```

Store:

- food name
- serving/unit data
- calories
- protein
- carbohydrates
- fat
- fiber
- sugar
- sodium
- other available nutrients
- source
- source identifier
- dataset version
- import timestamp

The dataset source and licensing must be reviewed before production use.

---

# 20. Food Search

Search must be fast.

Example result:

```text
Chicken Breast
165 kcal / 100g
Protein 31g
Carbs 0g
Fat 3.6g

[Add]
```

Food actions:

- add to meal
- favorite
- view details
- create personal override

---

# 21. Dietitian Food Overrides

Critical rule:

> A food override affects only the dietitian/practice that created it.

Example:

```text
Global food:
Chicken Breast = 165 kcal / 100g

Dietitian A override:
Chicken Breast = 180 kcal / 100g
```

Dietitian B still sees:

```text
165 kcal
```

The global source record must never be modified by a normal dietitian.

---

# 22. Recipes

Dietitians can create custom recipes.

Recipe contains:

- name
- description
- ingredients
- ingredient quantities
- servings
- preparation notes
- nutrition totals
- nutrition per serving

Example:

```text
Chicken Rice Bowl

Chicken 300g
Rice 200g
Vegetables 150g
Olive oil 10g

Total nutrition
Per-serving nutrition
```

Recipes can be reused in meal plans.

---

# 23. Nutrition Engine

Nutrition calculation must happen server-side.

Conceptual flow:

```text
Food
+
Quantity
+
Effective nutrition value
→
Nutrition Engine
→
Meal
→
Day
→
Meal Plan
```

The frontend is not the authoritative nutrition calculator.

The engine must respect dietitian-specific food overrides.

---

# 24. Meal Plan Builder

Dietitian can:

- create plan
- define duration
- create meals
- add foods
- add recipes
- set quantities
- define alternatives
- add instructions
- duplicate meals
- duplicate days
- calculate nutrition
- save draft
- publish
- archive

UI should support efficient drag/drop or similarly fast meal composition.

---

# 25. Meal Plan Versioning

Published plans should maintain history.

Example:

```text
Version 1
Version 2
Version 3
```

Track:

- created by
- created at
- modified at
- published at
- archived at

Do not destroy published history accidentally.

---

# 26. Meal Plan Publishing

Workflow:

```text
Draft
→ Review
→ Publish
→ Client receives
```

AI-generated content is always a draft until reviewed by the dietitian.

---

# 27. Client PWA

Client navigation should remain simple:

```text
Home
Plan
Track
Progress
Messages
```

Client home should answer:

> What do I need to do today?

Display:

- today's meals
- completion status
- water
- weight
- habits
- next appointment
- unread messages

---

# 28. Client Meal Tracking

Client can:

- mark meal complete
- log food
- record substitutions
- add notes

A global quick action:

```text
+ Log
```

opens:

```text
Food
Water
Weight
Exercise
Sleep
Habit
```

---

# 29. Client Progress

Client can see appropriate progress information.

Dietitian sees more detailed analytics.

Possible metrics:

- weight
- measurements
- adherence
- water
- activity
- habits

Date ranges:

```text
7 days
30 days
3 months
6 months
1 year
Custom
```

---

# 30. Appointments

Support:

- create
- reschedule
- cancel
- complete
- no-show
- notes
- reminders

Views:

```text
Day
Week
Month
```

Clicking an appointment should open a quick action panel.

---

# 31. Messaging

Built-in messaging replaces a major portion of external client communication.

Features:

- conversations
- unread status
- text messages
- attachments
- timestamps
- notifications
- history

Future:

- voice messages
- video
- reactions
- richer attachments

---

# 32. Documents

Documents can be attached to client records.

Examples:

- lab results
- medical documents
- consent forms
- progress photos
- PDFs
- generated meal plans
- other practice documents

Document metadata:

- name
- type
- size
- owner
- visibility
- upload date
- storage key

---

# 33. File Storage

V1 uses:

```text
Hostinger VPS
+
Coolify
+
Persistent storage volume
```

Suggested architecture:

```text
Hostinger VPS
└── Coolify
    ├── Web
    ├── API
    ├── Worker
    ├── PostgreSQL
    ├── Redis
    └── Persistent volume
        ├── documents
        ├── images
        ├── generated-pdfs
        └── temporary-files
```

Use an internal abstraction:

```text
StorageService
```

The application should not hardcode storage paths throughout the codebase.

---

# 34. File Security

Files are private by default.

Never expose sensitive documents through predictable public URLs.

Flow:

```text
Authenticated request
→ Authorization check
→ Secure file access
```

Upload validation must verify:

- MIME type
- file signature/magic bytes
- extension
- file size

Allowed types should be configurable.

Example initial types:

```text
PDF
JPG
JPEG
PNG
WEBP
DOCX
```

Example limits:

```text
Profile photo: 5 MB
Progress photo: 10 MB
Document: 20 MB
```

---

# 35. Image Processing

Progress/profile images should be processed:

```text
Original
→ Validate
→ Resize
→ Compress
→ Thumbnail
→ Store
```

Avoid repeatedly serving huge original camera files.

---

# 36. Malware Scanning

Production architecture should allow:

```text
Upload
→ Temporary storage
→ Security scan
→ Clean?
    YES → permanent storage
    NO → reject/quarantine
```

---

# 37. Invoices

Dietitian can create:

- invoice
- invoice items
- amount
- due date
- notes
- status
- PDF

Statuses:

```text
DRAFT
ISSUED
SENT
PAID
OVERDUE
CANCELLED
```

V1:

> No online payment functionality.

The dietitian and client handle payment externally.

---

# 38. Notifications

Channels:

```text
In-app
Email
```

Examples:

- new message
- appointment reminder
- meal plan published
- invoice issued
- task reminder
- account activation
- password reset

Future:

- push
- SMS
- WhatsApp

---

# 39. Email System

Dietitians should not need to configure SMTP.

Platform handles transactional email.

Create an abstraction:

```text
EmailService
```

Examples:

```text
sendInvitation()
sendPasswordReset()
sendAppointmentReminder()
sendMessageNotification()
sendInvoice()
```

Provider can be changed without rewriting business logic.

---

# 40. Automation Engine

Use event-driven automation.

Events include:

```text
CLIENT_CREATED
CLIENT_ACTIVATED
ASSESSMENT_COMPLETED

APPOINTMENT_CREATED
APPOINTMENT_COMPLETED
APPOINTMENT_CANCELLED

MEAL_PLAN_PUBLISHED
MEAL_PLAN_EXPIRED

MESSAGE_RECEIVED
DOCUMENT_UPLOADED

INVOICE_CREATED
INVOICE_OVERDUE

AI_REQUEST_COMPLETED
```

Automations may:

- create task
- send email
- create notification
- schedule reminder
- flag client
- update timeline

---

# 41. Background Jobs

Use Redis-backed queues.

Background jobs include:

- emails
- notifications
- appointment reminders
- PDF generation
- AI requests where appropriate
- image processing
- automation execution
- data exports

Do not block normal HTTP requests with slow background work.

---

# 42. AI Architecture

AI must be isolated behind an internal AI service.

Conceptual flow:

```text
Application
→ AI Service
→ Context Builder
→ AI Provider
→ Structured Response
→ Validation
→ Dietitian Review
```

AI should return structured data where possible.

Never allow arbitrary AI output to directly write database records.

---

# 43. AI Features

Potential V1 features:

### Meal ideas

Generate meal/food suggestions based on the dietitian's request.

### Ingredient replacement

Suggest alternatives.

### Meal plan assistance

Create a draft based on selected constraints.

### Client summary

Summarize relevant client data.

### Consultation notes

Assist with summarization.

### Client communication

Draft messages.

### Progress summary

Summarize trends.

All AI output must be reviewable.

---

# 44. AI Safety

Never:

```text
AI
→
Client
```

for clinical recommendations.

Required flow:

```text
AI
→ Draft
→ Dietitian review
→ Edit/approve
→ Client
```

AI should not independently diagnose or prescribe.

The exact clinical/legal wording and disclaimers must be professionally reviewed before launch.

---

# 45. AI Context Privacy

AI receives only data required for the operation.

Do not unnecessarily send:

- email
- phone
- address
- unrelated personal information

when a request only needs nutrition information.

AI provider data handling and retention must be reviewed contractually and configured appropriately.

---

# 46. AI Usage Tracking

Each request records metadata such as:

- organization
- user
- client where applicable
- AI feature
- model
- token/usage information
- status
- timestamp

Admin can monitor usage and enforce limits.

Avoid retaining sensitive prompt content longer than necessary.

---

# 47. Calendar

Calendar should support:

- appointments
- client
- type
- date/time
- duration
- status
- notes
- reminders

Future integrations can include external calendars.

---

# 48. Tasks

Tasks can be created manually or automatically.

Examples:

```text
Follow up with John
Review meal plan
Call client
Prepare consultation
Send invoice
Review progress
```

Tasks can have:

- title
- description
- due date
- priority
- assignee
- status
- client association

---

# 49. Analytics

Dietitian analytics may include:

- active clients
- client retention
- adherence
- appointment volume
- no-shows
- meal plan activity
- progress trends
- outstanding invoices

Admin analytics may include:

- organizations
- active users
- clients
- subscription distribution
- AI usage
- storage
- errors
- system health

---

# 50. UI/UX Principles

Visual direction:

**Professional + modern + calm + nutrition/health oriented.**

Avoid:

- overly clinical hospital styling
- excessive gradients
- clutter
- unnecessary animations

Target feel:

```text
Linear
+
Notion
+
Modern professional medical software
```

---

# 51. Desktop Dietitian Layout

```text
┌───────────────────────────────────────────────┐
│ Sidebar │ Top Bar                             │
│         ├─────────────────────────────────────│
│         │                                     │
│         │           Page Content              │
│         │                                     │
│         │                                     │
└───────────────────────────────────────────────┘
```

Sidebar:

```text
Dashboard
Clients
Calendar
Meal Plans
Foods
Recipes
Messages
Documents
Invoices
Tasks
Analytics
AI
Settings
```

---

# 52. Client Mobile UX

Client is mobile-first.

Primary navigation:

```text
Home
Plan
Track
Progress
Messages
```

The client should be able to reach today's main actions in seconds.

---

# 53. Global Search / Command

Future-ready command palette:

```text
Ctrl/Cmd + K
```

Actions:

```text
Search client
Create client
Create meal plan
Open calendar
Create invoice
Open settings
```

Can be implemented after core V1.

---

# 54. Empty States

Every empty state must provide an action.

Bad:

```text
No clients.
```

Good:

```text
You don't have any clients yet.

Add your first client to start managing
your nutrition practice.

[+ Add Client]
```

Apply this principle throughout the application.

---

# 55. Error Handling

Never expose raw technical errors.

Bad:

```text
500 Internal Server Error
```

Good:

```text
Something went wrong while saving the meal plan.

[Try Again]
```

Technical details go to logs/error tracking.

---

# 56. Loading States

Use skeleton loaders where possible.

Avoid unnecessary full-page spinners.

---

# 57. Technical Stack

## Frontend

```text
Next.js
React
TypeScript
PWA
```

## Backend

```text
Node.js
NestJS
TypeScript
REST API
```

## Database

```text
PostgreSQL
Prisma
```

## Infrastructure

```text
Hostinger VPS
Coolify
Docker
Redis
Persistent storage volumes
```

## Supporting

```text
Background workers
Transactional email provider
AI provider
Monitoring/error tracking
Automated backups
```

---

# 58. API Architecture

Use REST for V1.

Base path:

```text
/api/v1
```

Main groups:

```text
/api/v1/auth
/api/v1/users
/api/v1/organizations
/api/v1/clients
/api/v1/appointments
/api/v1/assessments
/api/v1/meal-plans
/api/v1/foods
/api/v1/recipes
/api/v1/progress
/api/v1/messages
/api/v1/documents
/api/v1/invoices
/api/v1/notifications
/api/v1/automation
/api/v1/ai
/api/v1/subscriptions
/api/v1/admin
```

Use OpenAPI/Swagger documentation.

---

# 59. Backend Architecture

Recommended NestJS modules:

```text
src/
├── auth/
├── users/
├── organizations/
├── clients/
├── appointments/
├── assessments/
├── meal-plans/
├── foods/
├── recipes/
├── nutrition/
├── progress/
├── messaging/
├── documents/
├── invoices/
├── notifications/
├── tasks/
├── automation/
├── ai/
├── subscriptions/
├── features/
├── admin/
├── audit/
└── common/
```

Each module owns its domain logic.

---

# 60. Frontend Architecture

Suggested:

```text
apps/web/

app/
├── admin/
├── dietitian/
├── client/
├── auth/
└── public/
```

Shared packages:

```text
packages/
├── ui/
├── types/
├── validation/
├── nutrition/
├── config/
└── utilities/
```

---

# 61. Monorepo

Recommended structure:

```text
/apps
  /web
  /api

/packages
  /ui
  /types
  /validation
  /nutrition
  /config
```

Share:

- types
- validation
- UI
- utilities
- nutrition logic where appropriate

---

# 62. Database Core Entities

At minimum:

```text
users
organizations
organization_members

clients
client_profiles
client_goals
client_measurements

assessments
assessment_templates

appointments

meal_plans
meal_plan_versions
meal_plan_days
meals
meal_items

foods
food_sources
food_overrides

recipes
recipe_ingredients

food_logs
water_logs
exercise_logs
habit_logs

conversations
messages

documents

invoices
invoice_items

notifications
tasks

plans
subscriptions
features
plan_features
feature_overrides

ai_requests
ai_usage

automation_rules
automation_runs

audit_logs
```

Exact schema should be refined during implementation, but all relationships must enforce ownership and tenant isolation.

---

# 63. Data Ownership Rules

Examples:

```text
Organization owns:
Clients
Appointments
Meal plans
Recipes
Documents
Invoices
Messages
```

Dietitian-specific food overrides belong to the organization/dietitian context.

Global food records are platform-managed.

Clients can access only their own authorized records.

---

# 64. Security Architecture

Every protected request should conceptually pass:

```text
Authenticated?
→ Organization valid?
→ Role allowed?
→ Permission allowed?
→ Feature enabled?
→ Usage limit valid?
→ Resource belongs to organization?
→ Execute
```

Never trust role/organization information supplied only by the client.

---

# 65. Password Security

Use Argon2id or equivalent strong password hashing.

Password reset:

```text
Forgot password
→ secure expiring token
→ email
→ reset
→ invalidate token
```

Never store passwords or reset tokens in plaintext.

---

# 66. Admin Security

Admin accounts should have:

- stronger session controls
- audit logs
- optional/required 2FA
- session revocation
- suspicious login monitoring

Super Admin should have the strongest controls.

---

# 67. Audit Logs

Important actions must be logged.

Examples:

```text
CLIENT_CREATED
CLIENT_UPDATED
CLIENT_ARCHIVED
DOCUMENT_DOWNLOADED
DOCUMENT_DELETED

MEAL_PLAN_CREATED
MEAL_PLAN_PUBLISHED

INVOICE_CREATED

USER_ROLE_CHANGED
SUBSCRIPTION_CHANGED
FEATURE_OVERRIDE_CHANGED

ADMIN_LOGIN
ADMIN_IMPERSONATION
```

Audit entries should include:

- actor
- organization
- action
- target
- timestamp
- request ID
- result
- relevant metadata

Do not log unnecessary sensitive client data.

---

# 68. Privacy

Treat nutrition and potentially health-related client data as sensitive personal information.

Build support for:

- consent
- data minimization
- data export
- deletion workflows
- retention
- auditability
- access control

Legal classification and obligations vary by jurisdiction and should be reviewed by qualified legal counsel before launch.

---

# 69. Consent

Consent records should include:

- user
- consent type
- document/policy version
- timestamp
- IP where legally appropriate
- acceptance status

Policy changes should create new versions.

---

# 70. Data Export

Organization export:

```text
Clients
Assessments
Meal Plans
Recipes
Appointments
Invoices
Documents
```

Client export should eventually include their own data.

Exports should be generated asynchronously.

---

# 71. Deletion

Distinguish:

### Deactivate

User cannot log in.

### Archive

Record remains available but is no longer active.

### Delete

Permanent removal according to applicable retention policies.

Use soft deletion where appropriate.

---

# 72. Backups

Back up:

- PostgreSQL
- uploaded files
- generated documents
- critical configuration

Suggested initial retention:

```text
7 daily
4 weekly
```

Backup restoration must be tested.

A backup that has never been restored/tested is not a reliable recovery strategy.

---

# 73. Disaster Recovery

Define:

- RPO
- RTO

Initial practical target can be established according to budget and business requirements.

Recovery process:

```text
Provision VPS
→ Restore database
→ Restore files
→ Deploy
→ Restore configuration
→ Verify
→ DNS/traffic
```

---

# 74. Monitoring

Monitor infrastructure:

```text
CPU
RAM
Disk
Database
Redis
Storage
```

Application:

```text
API latency
Error rate
Failed jobs
Email failures
AI failures
Login failures
```

---

# 75. Health Endpoint

Provide:

```text
GET /health
```

Check:

- API
- database
- Redis
- storage

Used by deployment/monitoring systems.

---

# 76. Structured Logging

Logs should include:

- timestamp
- level
- service
- request ID
- user ID where appropriate
- organization ID where appropriate
- message
- error information

Never log:

- passwords
- access tokens
- API secrets
- unnecessary clinical information
- full sensitive documents

---

# 77. Rate Limiting

Protect:

- login
- password reset
- messaging
- AI
- file upload
- public endpoints

AI is especially important because abuse can create direct provider costs.

---

# 78. API Security

Use:

- HTTPS
- secure cookies where applicable
- appropriate CORS
- security headers
- HSTS
- CSP where appropriate
- input validation
- authorization on every protected route

---

# 79. Database Security

PostgreSQL should:

- not be publicly exposed where possible
- use strong credentials
- use least-privilege accounts
- be backed up
- be protected by network configuration
- use secure connections where appropriate

---

# 80. Deployment with Coolify

Recommended services:

```text
Coolify
├── Web container
├── API container
├── Worker container
├── PostgreSQL
├── Redis
└── Persistent storage
```

Use Docker.

---

# 81. Persistent Storage

Use environment configuration:

```text
FILE_STORAGE_PATH=/data/storage
```

Coolify mounts persistent volume to:

```text
/data/storage
```

Subdirectories:

```text
documents/
images/
generated-pdfs/
temporary/
```

Do not hardcode VPS-specific paths throughout application code.

---

# 82. Environments

Maintain:

```text
Development
Staging
Production
```

Separate:

- databases
- credentials
- AI keys
- email configuration
- storage
- Redis

---

# 83. Deployment Pipeline

```text
Developer
→ Git
→ Pull Request
→ Tests
→ Merge
→ Build
→ Deploy to staging
→ Verify
→ Production
```

Destructive database changes require special handling and backups.

---

# 84. Testing Strategy

## Unit tests

Test:

- nutrition calculations
- permissions
- subscriptions
- feature entitlements
- AI limits
- automation rules

## Integration tests

Test:

- API
- database
- authentication
- tenant isolation

## E2E tests

Test complete workflows.

---

# 85. Critical Security Tests

Must verify:

```text
Organization A cannot see Organization B.

Client A cannot see Client B.

Dietitian cannot access unauthorized client.

Standard plan cannot access restricted Pro feature.

AI usage limit cannot be bypassed.

Dietitian food override cannot alter global food.

Archived clients don't receive active reminders incorrectly.

Unauthorized users cannot access private documents.
```

---

# 86. V1 Development Milestones

## Milestone 1 — Foundation

- repository
- monorepo
- Docker
- Next.js
- NestJS
- PostgreSQL
- Prisma
- Redis
- environment configuration
- authentication foundation
- CI/CD

## Milestone 2 — Multi-Tenancy

- organizations
- members
- roles
- permissions
- tenant isolation

## Milestone 3 — Admin

- dashboard
- organizations
- users
- plans
- features
- overrides
- audit logs

## Milestone 4 — Dietitian

- dashboard
- clients
- client workspace
- appointments

## Milestone 5 — Nutrition

- food dataset
- food search
- food overrides
- nutrition engine
- recipes
- meal plans

## Milestone 6 — Client PWA

- client authentication
- PWA
- home
- meal plan
- tracking
- progress

## Milestone 7 — Communication

- messaging
- notifications
- email
- documents

## Milestone 8 — Business

- invoices
- tasks
- analytics

## Milestone 9 — AI

- AI service
- usage limits
- meal assistance
- alternatives
- summaries
- drafting

## Milestone 10 — Automation

- events
- queues
- automation rules
- reminders

## Milestone 11 — Production

- security hardening
- backups
- monitoring
- error tracking
- performance
- restoration testing
- production deployment

---

# 87. End-to-End Acceptance Workflow

The following must work completely before V1 is considered functional:

```text
Admin
→ Creates dietitian
→ Selects PRO
→ Activates account
→ Dietitian receives invitation

Dietitian
→ Logs in
→ Creates client
→ Invites client

Client
→ Activates account
→ Logs in

Dietitian
→ Completes assessment
→ Adds measurements
→ Creates meal plan
→ Uses food database
→ Uses personal food override
→ Optionally uses AI
→ Reviews AI output
→ Publishes plan

Client
→ Sees meal plan
→ Tracks meals
→ Tracks water
→ Tracks weight

Dietitian
→ Sees progress
→ Messages client
→ Schedules appointment
→ Creates invoice

All events
→ Remain connected to client record
→ Are secured
→ Are auditable where required
```

---

# 88. Definition of Done

A feature is not considered complete simply because its page exists.

A feature is complete when:

- UI exists
- API exists
- database model exists
- validation exists
- authorization exists
- tenant isolation is enforced
- error handling exists
- loading states exist
- empty states exist
- tests exist
- audit requirements are implemented where applicable
- subscription/feature entitlement is respected where applicable
- mobile/responsive behavior is handled where applicable

---

# 89. Development Agent Rules

Any AI coding agent working on this project must follow these rules.

## Rule 1

Do not invent business requirements.

If the specification is unclear, identify the ambiguity before making a major architectural decision.

## Rule 2

Do not bypass backend authorization.

Frontend hiding is not security.

## Rule 3

Never bypass tenant isolation.

## Rule 4

Do not allow AI to directly create/publish clinical recommendations without dietitian review.

## Rule 5

Do not modify global food nutrition values from a dietitian workflow.

Use organization/dietitian overrides.

## Rule 6

Do not introduce unnecessary infrastructure.

V1 should remain compatible with:

```text
Hostinger VPS
Coolify
Docker
PostgreSQL
Redis
Persistent storage
```

## Rule 7

Keep business logic in backend/domain services.

Do not duplicate authoritative calculations in the frontend.

## Rule 8

Use database migrations.

Never manually alter production schema.

## Rule 9

Keep future payment integration in mind but do not implement payment processing in V1.

## Rule 10

Keep the client portal API-driven so Stage 2 mobile apps can reuse it.

---

# 90. Recommended Repository

```text
nutrition-saas/
│
├── apps/
│   ├── web/
│   └── api/
│
├── packages/
│   ├── ui/
│   ├── types/
│   ├── validation/
│   ├── nutrition/
│   ├── config/
│   └── utilities/
│
├── docs/
│   ├── MASTER_SPECIFICATION.md
│   ├── API.md
│   ├── DATABASE.md
│   ├── SECURITY.md
│   └── DEPLOYMENT.md
│
├── scripts/
│   ├── food-import/
│   ├── seed/
│   └── maintenance/
│
├── docker/
│
├── .env.example
├── docker-compose.yml
├── package.json
└── README.md
```

---

# 91. Seed Data

Development/staging should contain seed data for:

- Super Admin
- Admin
- Organization
- Owner
- Dietitian
- Staff
- Clients
- Foods
- Recipes
- Meal plans
- Appointments
- Messages
- Documents
- Plans
- Features
- AI configuration

Production must not use insecure development credentials.

---

# 92. Documentation Requirements

Maintain documentation for:

```text
Architecture
Database
API
Authentication
Permissions
Subscriptions
Feature flags
AI
Food data
Deployment
Backups
Security
```

The master specification remains the product source of truth.

---

# 93. Future Payment System

When payment is eventually introduced:

```text
Plan
→ Checkout
→ Payment Provider
→ Webhook
→ Subscription Service
→ Database
→ Feature Entitlement
```

The UI should not directly decide subscription access.

Backend remains authoritative.

---

# 94. Future Native Client App

Stage 2:

```text
iOS
Android
```

Both consume:

```text
/api/v1
```

Existing business logic remains in the backend.

Do not duplicate:

- nutrition calculations
- permissions
- subscription checks
- AI authorization
- client access rules

inside the mobile application.

---

# 95. Long-Term Architecture

As the SaaS grows, it can evolve toward:

```text
Web
Mobile
Admin
     ↓
API
     ↓
Domain Services
     ↓
PostgreSQL
Redis
Storage
Workers
External Providers
```

Only introduce microservices if actual scale or organizational requirements justify them.

---

# 96. Non-Goals for V1

Do not spend V1 development time on:

- Kubernetes
- microservices
- GraphQL
- Elasticsearch
- separate database per organization
- native mobile apps
- payment gateway
- WhatsApp integration
- video calls
- marketplace
- autonomous AI
- enterprise SSO
- complex insurance systems

The architecture should remain future-compatible without implementing these prematurely.

---

# 97. Product Success Criteria

The SaaS succeeds if a dietitian can perform their normal workflow without repeatedly switching between unrelated tools.

Target workflow:

```text
Client
→ Assessment
→ Consultation
→ Plan
→ Communication
→ Tracking
→ Progress
→ Follow-up
→ Invoice
```

all inside one system.

The system should reduce:

- administrative time
- duplicate data entry
- manual calculations
- scattered communication
- document searching
- repeated meal-plan work
- missed follow-ups
- client tracking friction

---

# 98. Final Product Vision

The platform should eventually feel like:

> **The operating system for a dietitian's practice.**

A dietitian opens the SaaS and sees:

```text
What happened?
What needs attention?
What do I need to do next?
```

They can then manage the client from one place.

The client opens the PWA and sees:

```text
What do I eat?
What do I track?
How am I progressing?
How do I contact my dietitian?
```

The platform administrator sees:

```text
Who is using the platform?
What plan are they on?
Which features are enabled?
How much AI are they using?
Is the platform healthy?
```

That is the core product.

---

# 99. Final Architecture Summary

```text
                         NUTRITION SaaS
                               │
          ┌────────────────────┼────────────────────┐
          │                    │                    │
          ▼                    ▼                    ▼
       ADMIN              DIETITIAN              CLIENT
       PANEL               PLATFORM               PWA
          │                    │                    │
          └────────────────────┼────────────────────┘
                               │
                               ▼
                         NEXT.JS WEB
                               │
                               ▼
                         NESTJS API
                               │
              ┌────────────────┼────────────────┐
              │                │                │
              ▼                ▼                ▼
         PostgreSQL          Redis         Storage
              │                │          Persistent VPS
              │                │
              │                ▼
              │             Workers
              │                │
              └────────────────┼────────────────┐
                               │                │
                               ▼                ▼
                             Email              AI
```

Deployment:

```text
Hostinger VPS
    ↓
Coolify
    ↓
Docker
    ↓
Web + API + Worker + PostgreSQL + Redis
    ↓
Persistent storage
```

---

# 100. Final Instruction

Build the product as a **production-quality multi-tenant nutrition practice management SaaS**, not as a demo.

Prioritize:

1. Correct business logic
2. Security
3. Tenant isolation
4. Excellent dietitian UX
5. Client simplicity
6. Reliable nutrition calculations
7. Controlled AI
8. Automation
9. Maintainability
10. Future extensibility

Do not sacrifice security or data integrity for speed.

Do not over-engineer V1.

Build the smallest complete system that delivers the full core workflow, while keeping the architecture ready for future payment processing, native mobile applications, richer AI, integrations, and larger organizations.

**The final V1 goal is not to build every possible feature. The goal is to build a reliable system that makes a dietitian's daily practice substantially easier.**
