# SensAI Frontend Deep Dive

Repository: `sensai-frontend`

## 1. Stack And Runtime

- Framework: Next.js `15.x` App Router
- React: `19`
- Language: TypeScript
- Styling:
  - Tailwind
  - custom CSS files
  - Radix UI primitives
- Auth: NextAuth with Google provider
- Observability: Sentry
- Motion/UI libraries:
  - Framer Motion
  - Lucide icons
- Rich content:
  - BlockNote editor
  - Monaco editor
  - react-pdf
  - Notion renderer/client

Important build settings in `next.config.ts`:

- `output: 'standalone'`
- ESLint errors ignored during build
- TypeScript build errors ignored during build
- Sentry wrapper enabled
- `canvas` is aliased to `empty-module.ts` in Turbopack experimental config

## 2. App Shell And Global Providers

Main layout file: `sensai-frontend/src/app/layout.tsx`

Global behaviors:

- loads Geist and Geist Mono fonts
- wraps the app in:
  - `SessionProvider`
  - `IntegrationProvider`

Other global files:

- `src/app/globals.css`
- `src/app/global-error.tsx`
- `src/instrumentation.ts`
- `src/instrumentation-client.ts`
- `src/middleware.ts`

## 3. Authentication And Route Protection

### NextAuth

Files:

- `src/app/api/auth/[...nextauth]/route.ts`
- `src/app/api/auth/[...nextauth]/utils.ts`

Flow:

- Google OAuth is the only configured provider
- on first sign-in, the JWT callback calls the backend `POST /auth/login`
- backend verifies the Google ID token and returns/creates the SensAI user
- the returned backend user id is stored in the token and copied into `session.user.id`

### Middleware

File: `src/middleware.ts`

Behavior:

- allows `/api/auth/*`
- keeps `/login` public
- redirects authenticated users away from `/login`
- redirects unauthenticated users from most routes to `/login`
- preserves callback path and query params

Important detail:

- middleware uses `NEXT_PUBLIC_APP_URL` to build redirects

## 4. Main Route Map

### Root and shared pages

- `/`
  - dashboard/home
  - shows teaching, mentoring, and learning courses based on role
- `/login`
  - sign-in entry
- `/assessment`
  - assessment-v3 generation UI
- `/assessment/preview`
  - student preview for current assessment draft
- `/my-assessments`
  - assessment-v3 draft/published listing

### School admin routes

- `/school/admin/create`
  - create school/org
- `/school/admin/[id]`
  - school admin shell
  - tabs for courses, cohorts, members
- `/school/admin/[id]/cohorts/[cohortId]`
  - cohort admin page
- `/school/admin/[id]/courses/[courseId]`
  - course builder/editor
- `/school/admin/[id]/courses/[courseId]/preview`
  - preview a course as a learner

### School member routes

- `/school/[id]`
  - learner/mentor school view by org slug
- `/school/[id]/join`
  - join flow for a cohort
- `/school/[id]/cohort/[cohortId]/leaderboard`
  - leaderboard screen
- `/school/[id]/courses/[courseId]/learner-view/[learnerId]`
  - admin/mentor learner-view wrapper

### Internal API route handlers

- `/api/auth/[...nextauth]`
- `/api/code/submit`
- `/api/code/status`
- `/api/integrations/auth/callback`
- `/api/integrations/fetchPage`
- `/api/integrations/fetchPageBlocks`
- `/api/integrations/fetchPages`
- `/api/sentry-example-api`

## 5. Core UI Architecture

### Header and navigation

Main header: `src/components/layout/header.tsx`

Responsibilities:

- logo
- profile dropdown
- theme switching
- mobile FAB menu
- school navigation
- entry points for course creation
- assessment generator dropdown

Notable detail:

- the header determines "owned school" from `useSchools()` and uses that to route course creation/open-school actions

### Home page

File: `src/app/page.tsx`

Behavior:

- fetches user courses and orgs via hooks
- groups courses by role:
  - admin => teaching
  - mentor => mentoring
  - everything else => learning
- renders segmented tabs only when the user has more than one role category

### School admin view

File: `src/app/school/admin/[id]/ClientSchoolAdminView.tsx`

Responsibilities:

- fetch school/org
- fetch members
- fetch cohorts
- fetch courses
- manage tab state through URL hash
- invite/remove org members
- open cohort/course creation dialogs
- refresh lists after delete operations

### School member view

File: `src/app/school/[id]/ClientSchoolMemberView.tsx`

Responsibilities:

- resolve school by slug
- determine whether current user is admin/owner in that school
- fetch either:
  - all school cohorts for admins
  - only user cohorts for learners/mentors
- fetch cohort courses with `include_tree=true`
- fetch task/question completion state
- switch between learner and mentor experiences

Branching:

- mentor role => `MentorCohortView`
- learner role => `LearnerCohortView`

## 6. Course And Learning Experience Components

Large, high-responsibility components:

- `CourseModuleList.tsx`
  - milestone/task ordering, deletion, duplication, task editing entry points
- `QuizEditor.tsx`
  - quiz editing, scorecard linking, draft vs published quiz save flows
- `LearningMaterialEditor.tsx`
  - learning material task editor
- `AssignmentEditor.tsx`
  - assignment task editor
- `CohortDashboard.tsx`
  - cohort analytics/dashboard rendering
- `LearnerCourseView.tsx`
  - learner-side course navigation
- `LearnerQuizView.tsx`
  - quiz-taking, chat, audio/file upload, scorecard display, completion logic
- `LearnerAssignmentView.tsx`
  - assignment-taking, chat, audio/file upload, scorecard/report handling
- `LearningMaterialViewer.tsx`
  - learning content display plus AI doubt-solving chat
- `CodeEditorView.tsx`
  - coding execution UI and Judge0 proxy use
- `ChatView.tsx` and `ChatHistoryView.tsx`
  - reusable chat surfaces and rendering

Common frontend patterns:

- local orchestration state is kept inside page/component files
- backend data fetching is done with raw `fetch`
- there is no global client data layer like React Query
- several components handle both CRUD and screen-level orchestration

## 7. Hooks, Contexts, And Shared Utilities

### Hooks and helpers

- `src/lib/auth.ts`
  - wraps `useSession()` into `useAuth()`
- `src/lib/api.ts`
  - `useCourses()`
  - `useSchools()`
  - `getCompletionData()`
  - `getCourseModules()`
  - `addModule()`
- `src/lib/server-api.ts`
  - server-side course fetch helper
- `src/lib/course.ts`
  - transforms backend milestones into frontend module structures
- `src/lib/hooks/useThemePreference.ts`
  - theme persistence and document class management

### Contexts

- `SessionProvider`
  - wraps NextAuth provider
- `IntegrationContext`
  - manages Notion integration state, OAuth result handling, and page fetching
- `EditorContext`
  - editor-specific block editing helpers

## 8. Integration And Proxy Flows

### Backend communication

Two patterns are used:

- client-side fetches via `NEXT_PUBLIC_BACKEND_URL`
- server-side fetches via `BACKEND_URL`

### Judge0

Files:

- `src/app/api/code/submit/route.ts`
- `src/app/api/code/status/route.ts`

Behavior:

- frontend does not call Judge0 directly from the browser
- Next.js route handlers proxy the request
- status route decodes base64 response fields before returning them

### Notion

Frontend pieces:

- `IntegrationContext`
- `NotionIntegration.tsx`
- `ConnectNotionButton.tsx`
- internal route handlers under `src/app/api/integrations/*`

Behavior:

- popup-based OAuth flow
- callback route exchanges code for access token with Notion
- token is stored as a backend integration record
- frontend route handlers fetch pages and blocks from Notion APIs

## 9. Assessment V3 Frontend

Main files:

- `src/app/assessment/page.tsx`
- `src/app/assessment/preview/page.tsx`
- `src/app/my-assessments/page.tsx`

Flow in `assessment/page.tsx`:

- choose recruiter vs educator mode
- upload file or paste text
- parse curriculum or JD
- review modules and skills
- tune question type distribution, module coverage, and skill mapping
- generate questions
- regenerate whole questions or specific segments
- save draft
- export PDF
- publish to a course/milestone

Important implementation detail:

- this flow is currently hardcoded to call `http://localhost:8001/assessments_v3/...`
- it does not use `NEXT_PUBLIC_BACKEND_URL` or `BACKEND_URL`

## 10. Type Layer

Types live in:

- `src/types/index.ts`
- `src/types/course.ts`
- `src/types/quiz.ts`
- `src/types/next-auth.d.ts`

Notable detail:

- several frontend components still use broad `any` typing or inline interfaces
- the typed layer exists but is not consistently enforced across all large components

## 11. Testing

Testing stack:

- Jest
- React Testing Library

Coverage areas include:

- app routes
- complex components
- utilities
- context providers
- auth-adjacent flows

Test folders:

- `src/__tests__`
- `test/mocks`
- `test/config`

## 12. Notable Quirks And Risks

- Builds ignore ESLint and TypeScript errors in production config.
- Several page/components are very large and serve as orchestration hubs, increasing coupling.
- The assessment-v3 UI is environment-inconsistent because it hardcodes `http://localhost:8001`.
- State management is mostly local `useState`, which keeps flows simple but makes large editors harder to reason about.
- Backend communication is split across:
  - browser-to-backend direct calls
  - server component fetches
  - internal Next.js proxy routes
  - hardcoded localhost assessment calls
- The app relies on `NEXT_PUBLIC_APP_URL`, `NEXT_PUBLIC_BACKEND_URL`, `BACKEND_URL`, Judge0 env vars, Google OAuth vars, Notion vars, and NextAuth secret, so environment drift can break specific flows in different ways.

