# QA — V1 feature inventory & checklists

Source of truth: repository code (Prisma, Nest modules, Next routes), not marketing docs.

## Feature inventory

| Feature | API | Frontend | Models | Existing tests | Demo | Acceptance |
|---------|-----|----------|--------|----------------|------|------------|
| Auth/sessions | AuthModule | `/auth/*` | User, Session | auth.e2e | All demo users verified | v1-acceptance/auth |
| Admin | AdminModule | `/admin/*` | platformRole, Plan, Subscription | admin.e2e | SUPER_ADMIN + ADMIN | admin |
| Practice | Dietitian* | `/practice/[id]/*` | DietitianAccount | dietitian-account | Alice/Bob/Charlie | isolation |
| Subscriptions | Entitlements | practice shell | Plan, Subscription, FeatureOverride | phase4 | Standard/Pro/Premium + override | admin |
| Clients | Clients* | clients | Client, Profile, Goals, Tags | phase6/7 | Rich portfolios | lifecycle |
| Multi-link portal | ClientAccounts | `/client` switcher | ClientAccount, activeClientId | phase3 | patient.shared | multi-dietitian |
| Foods | Foods, Overrides | `/foods` | Food, FoodOverride | foods, phase8 | Catalog + customs | food-recipe-meal |
| Recipes | Recipes | `/recipes` | Recipe | meal-plans | Starter + practice | food-recipe-meal |
| Meal plans | MealPlans | meal-plans + portal | MealPlan* | phase9 | 7–28 day plans | snapshots |
| Tracking | Tracking, Habits | portal tracking | *Log, Habit* | phase10/11 | Multi-week Emma | tracking-evolution |
| Evolution | Measurements | progress | ClientMeasurement | phase7 | Weight series | tracking-evolution |
| Assessments | Assessments | assessments | Template, Assessment | phase6/7 | Harbor intake | (seeded) |
| Appointments | Appointments | calendar | Appointment | phase6 | Past/today/future/reschedule | appointments-messaging |
| Messaging | Messaging | messages | Conversation, Message | phase5-chat | Emma/Noah threads | appointments-messaging |
| Notifications | Notifications | notifications | Notification | phase4/5 | Seeded events | appointments-messaging |
| Documents | Documents | documents | Document + FS | messaging-documents | Real .txt files | invoices-tasks-analytics |
| Invoices | Invoices | invoices | Invoice* | invoices-tasks | All statuses | invoices-tasks-analytics |
| Tasks | Tasks | tasks | Task | same | Priorities + overdue | invoices-tasks-analytics |
| Analytics | Analytics | analytics | aggregates | same | Seed volume | invoices-tasks-analytics |
| Automation | Automation | automations | Rule/Run | automation.e2e | Bob/Charlie rules | automation |
| AI | AiModule | `/ai` | AiRequest, AiUsage | ai.e2e | Optional if enabled | ai-mock (mock only) |
| Marketing gate | Public settings | RequireGuest | PlatformSettings | platform-settings | Seeded | Manual UI |

## Isolation matrix (release-blocking)

- [ ] Practice A cannot read/modify Practice B clients, foods, recipes, plans, appointments, messages, docs, invoices, tasks, automations, assessments, measurements, tracking  
- [ ] Patient A cannot access Patient B  
- [ ] Shared patient: active Alice connection shows only Alice data; switch to Bob shows only Bob data  
- [ ] Forged `clientId` / `dietitianAccountId` / resource IDs return 403/404  

Automated coverage: `test/v1-acceptance/isolation.e2e.spec.ts`, `multi-dietitian.e2e.spec.ts`, `test/security-isolation.spec.ts`.

## Manual UI walkthrough

### Admin

1. Login `admin@demo.local` → `/admin`  
2. Plans, dietitians, subscriptions visible  

### Dietitian Alice

1. Login → Harbor practice dashboard  
2. Clients show Harbor tags/notes only  
3. Foods include Harbor custom smoothie; no Cedar oat blend  
4. Meal plans for Emma published  
5. Calendar has past/today/future  
6. Messages with Emma  
7. Invoices HN-\* statuses  
8. AI actions fail (Standard)  

### Dietitian Bob

1. Pro AI works when `AI_ENABLED` + mock/openai configured  
2. Automations list shows overdue/upcoming rules  
3. Custom oat blend visible  

### Shared patient

1. Login `patient.shared@demo.local`  
2. Switch Active practice Harbor ↔ Cedar  
3. Meal plan title and practice-scoped data change  

### Revoke / rejoin (soft revoke)

1. Dietitian deactivates a portal connection → patient **stays signed in** (no forced logout)  
2. If another ACTIVE connection remains → portal stays on that practice (`activeClientId` switches)  
3. If it was the last ACTIVE connection → `/client/join` with reconnect copy (`needs_join`); session still valid  
4. New **per-client or practice** code → resolve preview works → join reactivates the **same** `ClientAccount` (same practice) or creates/activates the other practice connection  
5. Historical data (meal plans, messages, documents, appointments, assessments, tracking, profile) remains under that connection’s authorization  
6. Already ACTIVE for a practice → resolve/join returns `already_connected` (no duplicate `ClientAccount`)  

### Patient leave request

1. Portal **Profile → Account → Request to leave** (optional note)  
2. Patient stays connected (`ACTIVE`); dietitian gets `DISCONNECT_REQUESTED` notification  
3. Dietitian **Portal** tab: approve via **Deactivate**, or **Dismiss request** to keep them connected  
4. Patient may cancel their own pending request  

Automated coverage: `apps/api/test/revoke-rejoin.e2e.spec.ts`, `apps/api/test/disconnect-request.e2e.spec.ts`.

## Snapshot checks

1. Open Emma published plan version  
2. Rename Harbor recipe / change food energy  
3. Published snapshot unchanged  
4. Planned meal food-log `nutritionSnapshot` unchanged  

## Out of scope this QA pass

- Playwright browser automation (not in repo)  
- Production OpenAI keys  
- Stripe billing  
