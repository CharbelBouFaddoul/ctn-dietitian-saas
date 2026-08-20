# P3 UX audit

Frontend-only inventory written before restyling. Backend auth, authorization, and join-code APIs are out of scope.

**Current shape:** 55+ `page.tsx` routes. `@nutrition-saas/ui` only exported `PhasePlaceholder` + `tokens.css`. Admin, practice, and auth shells each copied inline `buttonStyle` / `inputStyle` / `tableStyle`. No frontend tests. No mobile nav. No shared loading/empty/error primitives.

## Route, problem, severity, recommended UX, reusable component

| Route | Problem | Severity | Recommended UX | Component |
|---|---|---|---|---|
| `/` | Role chooser including Platform admin | P0 | Marketing homepage; Sign In → `/auth/login`, Get Started → `/auth/register`. Never mention Admin. | Marketing layout, Button |
| `/auth` | Duplicate role chooser including Admin | P0 | Redirect to `/auth/login`. No role-selection page. | — |
| `/auth/dietitian/login` | Separate public login choice | P1 | Redirect to `/auth/login` (alias only). | SignInForm |
| `/auth/dietitian/register` | Dietitian register not at public CTA; “API console” copy | P0 | Public register lives at `/auth/register`. Human verify-email copy. | AuthShell, Field, PasswordInput |
| `/auth/client/login` | Valid onboarding URL; must not be a homepage CTA | P1 | Keep unlisted. Same unified sign-in form. | AuthShell |
| `/auth/client/register` | Valid join-code onboarding; not a public choice | P1 | Keep unlisted. | AuthShell |
| `/auth/login` | Missing | P0 | Single public sign-in. `resolveSessionHome()` with no audience. | SignInForm |
| `/admin/login` | Reachable from public choosers | P0 | Unlisted technical route. Direct URL only. | AuthShell (admin audience) |
| `/admin` | Three links + “database-driven / no payment processor” | P1 | Control-center dashboard from existing admin list APIs + `/health`. | PageHeader, StatCard |
| `/admin/organizations` | Raw status enums; empty table; no mobile | P1 | Human status badges, empty state, stacked table | Table, Badge, EmptyState |
| `/admin/organizations/[id]` | Feature keys, `window.prompt`, no confirm | P1 | Human labels, ConfirmDialog | ConfirmDialog, Table |
| `/admin/users` | Raw `SUPER_ADMIN`; no empty state | P1 | Human roles, search, empty | Table, Badge |
| `/admin/users/[id]` | No confirm on status changes | P2 | ConfirmDialog | ConfirmDialog |
| `/admin/plans` | Slug-first, `_count` | P1 | Name-first table | Table, Field |
| `/admin/plans/[id]` | `{key} (BOOLEAN\|LIMIT)` | P1 | Human feature names | Table |
| `/admin/features` | “EntitlementService” copy | P1 | Operator copy without internals | Alert, Table |
| `/admin/subscriptions` | “No payment UI in V1” | P2 | Human status table | Table, EmptyState |
| `/admin/food-sources` | Technical import report | P2 | Keep as operator report, human status | Table |
| `/admin/audit` | Raw action names, ISO timestamps | P1 | Human action labels, locale dates | Table |
| `/admin/health` | Missing | P1 | Compose `/health` + existing lists. No new API. | StatCard, Badge |
| `/orgs` | Auth card; `YYYY_MM_DD`; client-member note | P1 | Practice picker + create form | Card, Field |
| `/orgs/:id` | Counter dump, timeline enums, Quick client form | P0 | “What should I do now?” cards. Remove Quick client. | StatCard, Card, EmptyState |
| `/orgs/:id/clients` | Full UUID column; 4-col filter overflow; raw status | P1 | Invite panel polish; email + short id; human status | Card, Table, Badge |
| `/orgs/:id/clients/new` | Secondary manual chart; technical copy | P2 | PageHeader; explain this is not the invite path | Field, Alert |
| `/orgs/:id/clients/:clientId` | 1075-line 14-tab workspace; UUID in header | P0 | Split tabs. Visible: Overview, Assessments, Meal Plan, Tracking, Messages, Documents, Invoices, Appointments, AI, Portal. Profile/goals/measurements in Overview. Eyebrow: “Client workspace”. | Tabs, PageHeader, ConfirmDialog |
| `/orgs/:id/calendar` | Missing nav target | P1 | Upcoming appointments from dashboard API only; note that a full calendar needs a list endpoint | EmptyState, Table |
| `/orgs/:id/meal-plans` | Raw DRAFT/ACTIVE; no empty | P1 | Human status; empty CTA | Table, EmptyState |
| `/orgs/:id/meal-plans/:planId` | Units enums, technical snapshot copy | P2 | Human units; PageHeader | Field, Table |
| `/orgs/:id/recipes` | No empty/pagination | P2 | EmptyState | Table |
| `/orgs/:id/recipes/new` | Bare form | P2 | Field + PageHeader | Field |
| `/orgs/:id/recipes/:recipeId` | `unknown` kcal; units enum | P2 | “—” for missing; human units | Table |
| `/orgs/:id/foods` | CUSTOM/GLOBAL; 4-col overflow | P1 | Source badges; stacked filters | Badge, Field |
| `/orgs/:id/foods/:foodId` | Source food ID; imported-dataset copy | P2 | Human detail | Field |
| `/orgs/:id/messages` | Unstyled native controls | P1 | Card thread + composer | Card, Textarea |
| `/orgs/:id/documents` | Missing | P1 | Client picker / empty — documents are per-client only | EmptyState |
| `/orgs/:id/invoices` | Shared clientId state bug; UUID fallback | P1 | Separate filter vs create; invoice number or “Draft” | Table, Field |
| `/orgs/:id/invoices/:invoiceId` | `String(err)`; status enums | P1 | humanize-error; badges | Badge, ConfirmDialog |
| `/orgs/:id/tasks` | `due_today` chips; no empty | P2 | Human view labels | Badge, Table |
| `/orgs/:id/analytics` | `<pre>JSON.stringify(financial)` | P0 | StatCards + financial table; never `<pre>` | StatCard, Table |
| `/orgs/:id/ai` | Missing org-level page | P1 | Usage from existing `/ai/usage`; deep-link to client AI | StatCard, Alert |
| `/orgs/:id/automations` | Timing key in label; status enums | P0 | WHEN / AND / THEN copy; human status | Card, Table |
| `/orgs/:id/automations/:id` | `triggerType` / `triggerKey` | P0 | Human trigger/action labels | Table, Badge |
| `/orgs/:id/automation-runs` | triggerKey, errorCode | P1 | Human trigger labels | Table |
| `/orgs/:id/settings` | `logoStorageKey`; “invoicing not implemented” | P1 | Hide storage key; honest settings form | Field |
| `/client` (portal) | Two links; unused status | P1 | Today cards from portal me/plan/tracking/messages/invoices | StatCard, Card |
| `/client/plan` | “unknown” kcal | P2 | “—” for missing nutrition | Card |
| `/client/tracking` | Unstyled; habit keys; `fl_oz` | P1 | Form primitives; human units | Field, Card |
| `/client/messages` | Unstyled; crimson errors | P1 | Thread + Alert | Alert, Textarea |
| `/client/documents` | Unstyled upload | P2 | Field + EmptyState | EmptyState |
| `/client/invoices` | UUID if no number; ISSUED raw | P1 | “Invoice” fallback; badges | Badge, Table |
| `/client/profile` | Name only, no edit | P1 | Name + practice context if present | Card |
| `/client/progress` | Missing | P1 | Compose tracking summaries; no new API | StatCard |
| `/client/join` | Correctly outside portal layout | P1 | Large code field; “Join your dietitian” | AuthShell, Field |
| Duplicate `/client/plan` etc. outside `(portal)` | Next.js route conflict | P0 | Delete ungrouped duplicates; keep `(portal)` + `/client/join` | — |
| `components/ai-panel.tsx` | Dumps model JSON in `<pre>` | P0 | Map known schema keys to sections | Card, Alert |
| Shells (`admin-shell`, `practice-shell`, portal layout) | Fixed 220px sidebar; no drawer | P0 | Shared AppShell: desktop sidebar, tablet collapse, mobile drawer | AppShell, Sidebar |
| Auth footer | “Choose a different sign-in” | P0 | Remove role switching. Admin not linked from public auth. | AuthShell |
| `loginPathFor` | Dietitian/client → role-specific logins | P0 | Both recover via `/auth/login`. Admin stays `/admin/login`. | session-home |

## Cross-cutting

| Problem | Severity | Recommended UX | Component |
|---|---|---|---|
| No design tokens for type scale, spacing, focus, breakpoints | P0 | Expand `tokens.css` | tokens |
| Inline style kits in three shells | P0 | UI primitives; delete style objects | Button, Input, Table |
| No toast / confirm / password reveal | P1 | Shared patterns | Toast, ConfirmDialog, PasswordInput |
| Incomplete `humanize-error.ts` | P1 | Map known API messages; unknown 500 → retry copy | humanize-error |
| Dietitian identity line appends full UUID | P2 | Email + short id on lists; never in client portal | client-identity |
| Web `tsconfig` omits `components/` | P2 | Include `components/**/*.tsx` | — |
| Zero frontend tests | P2 | Lightweight UI + error-mapping tests | packages/ui tests |

## Frozen (do not change in P3)

- `SessionGuard`, `TenantGuard`, `ClientAccessService`, entitlements, platform-admin authorization
- Join-code architecture: client self-registers → practice join code → appears on roster
- Prisma schema / migrations
- Public site must never expose Admin (nav, CTAs, footer, login, register, docs, marketing copy)
- No role-selection page. `/auth/login` is the only normal public authentication entry.
