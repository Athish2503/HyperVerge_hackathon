# SensAI Backend Deep Dive

Repository: `sensai-backend`

## 1. Stack And Runtime

- Language: Python `>=3.11`
- Web framework: FastAPI
- Validation: Pydantic v2
- DB layer: `aiosqlite` with hand-written SQL
- Server: Uvicorn
- Scheduling: APScheduler
- AI stack:
  - OpenAI SDK
  - LangChain Core
  - Instructor
  - Langfuse
- Storage and infra:
  - SQLite
  - optional S3 uploads
  - optional BigQuery sync helpers
  - optional Sentry

Key dependency file: `sensai-backend/pyproject.toml`

## 2. App Entry Point

Main file: `sensai-backend/src/api/main.py`

Startup behavior:

- logs application startup
- runs DB migrations
- starts APScheduler
- creates the local uploads directory

Shutdown behavior:

- logs shutdown
- stops APScheduler

Middleware and app-wide behavior:

- request logging middleware logs request method/path/client and response status/duration
- CORS is fully open with `allow_origins=["*"]`
- uploads folder is mounted as a static directory if it exists
- global exception handlers exist for:
  - unhandled exceptions
  - FastAPI validation errors
  - `HTTPException`

Health and debug endpoints:

- `GET|HEAD /health`
- `GET /sentry-debug`

## 3. Configuration Model

Settings file: `sensai-backend/src/api/settings.py`

Environment loading:

- loads `src/api/.env` if present
- loads `src/api/.env.aws` if present
- exposes values through a cached `Settings` object

Important settings:

- `google_client_id`
- `openai_api_key`
- `s3_bucket_name`
- `s3_folder_name`
- `local_upload_folder`
- `sentry_dsn`
- `bq_project_name`
- `bq_dataset_name`
- Slack webhook URLs

Config constants file: `sensai-backend/src/api/config.py`

Important constants:

- sqlite DB path
- log file paths
- all table names
- upload folder name
- milestone defaults like `[UNASSIGNED]`
- OpenAI model routing names

## 4. Routing Surface

Routers are registered in `main.py` under these prefixes:

- `/file`
- `/ai`
- `/auth`
- `/batches`
- `/tasks`
- `/chat`
- `/users`
- `/organizations`
- `/cohorts`
- `/courses`
- `/milestones`
- `/scorecards`
- `/code`
- `/hva`
- `/ws`
- `/integrations`
- `/assessments`
- `/assessments_v3`

### Core business routers

`/auth`
- `POST /login`
- verifies Google ID token, then inserts or returns a user

`/organizations`
- create org
- get org by id
- get org by slug
- update org
- add/remove members
- list members
- list all orgs

`/users`
- get/update user
- list user cohorts
- yearly activity
- active days
- streak
- presence in cohort
- user courses
- user org cohorts
- user orgs

`/cohorts`
- list/create/get/update/delete cohorts
- add/remove cohort members
- add/remove courses to cohort
- fetch cohort courses, optionally as full tree
- completion data
- leaderboard
- course metrics
- streaks
- task metrics
- task attempt data

`/batches`
- list/create/get/update/delete batches
- get batches for a user inside a cohort

`/courses`
- create/list/get/update/delete courses
- add/remove tasks
- reorder tasks
- add/reorder milestones
- add/remove course-cohort links
- get course cohorts
- get course tasks
- swap milestone order
- swap task order
- duplicate course into another org

`/tasks`
- create draft task
- get task
- delete single/multiple tasks
- publish/update learning material
- create/update quizzes
- create/update assignments
- duplicate task
- mark task complete
- fetch completed task ids for a user/cohort
- fetch learning-material-only tasks for a course

`/milestones`
- list milestones for org
- update/delete milestone
- milestone metrics
- milestones for course

`/scorecards`
- list/create/update scorecards

`/chat`
- store messages
- list org chat history
- fetch user-task chat history
- delete all chat history

`/code`
- save/get/delete per-user per-question code drafts

`/integrations`
- CRUD for integration records

`/file`
- create S3 presigned upload URL
- create S3 presigned download URL
- upload file locally
- download file locally

`/hva`
- helper endpoints around HVA org/cohort membership

### AI and assessment routers

`/ai`
- `POST /chat`
- `POST /assignment`

This is the main tutoring/evaluation surface. It contains helper functions for:

- rewriting user queries
- selecting model plans
- formatting text/audio/chat history into prompts
- building evaluation context
- building knowledge-base context
- converting scorecards to prompt text

`/assessments`
- older/general assessment generation APIs
- endpoints include:
  - `extract-skills`
  - `generate`
  - `validate-coverage`
  - `generate-end-to-end`
  - `generate-from-curriculum`

`/assessments_v3`
- newer assessment workflow
- endpoints include:
  - `parse-curriculum`
  - `parse-jd`
  - `generate-questions`
  - `validate-addition`
  - `regenerate-question`
  - `save-draft`
  - `get draft`
  - `clear draft`
  - `regenerate-segment`
  - `export-pdf`
  - `extract-text`
  - `my-assessments`
  - `available-courses`
  - `publish`

### WebSocket router

File: `sensai-backend/src/api/websockets.py`

- `WS /ws/course/{course_id}/generation`
- maintains in-memory sets of websocket clients per `course_id`
- used for course generation progress fan-out

## 5. Data Model Layer

Central model file: `sensai-backend/src/api/models.py`

The file mixes:

- request bodies
- response bodies
- domain entities
- enums

Main model families:

- authentication and organizations
- cohorts and batches
- courses and milestones
- tasks
- blocks for learning material
- quiz questions
- assignments
- scorecards
- chat messages
- user/course/cohort projections
- AI chat requests
- code drafts
- integrations

Important enums:

- `TaskType`
- `TaskStatus`
- `TaskInputType`
- `TaskAIResponseType`
- `QuestionType`
- `ScorecardStatus`
- `UserCourseRole`
- `ChatRole`
- `ChatResponseType`

## 6. Database Architecture

The backend does not use an ORM. It uses:

- schema creation functions in `src/api/db/__init__.py`
- raw SQL helpers in `src/api/utils/db.py`
- domain-specific DB modules under `src/api/db`

### Core schema shape

Main tables created in `db/__init__.py` include:

- `organizations`
- `org_api_keys`
- `users`
- `user_organizations`
- `cohorts`
- `user_cohorts`
- `batches`
- `user_batches`
- `courses`
- `milestones`
- `course_milestones`
- `course_tasks`
- `course_cohorts`
- `tasks`
- `questions`
- `assignment`
- `scorecards`
- `question_scorecards`
- `chat_history`
- `task_completions`
- `course_generation_jobs`
- `task_generation_jobs`
- `code_drafts`
- `integrations`
- `bq_sync`
- `assessment_v3_drafts`
- `assessment_v3_published`

Common schema patterns:

- `created_at`
- `updated_at`
- `deleted_at`
- foreign keys with cascades
- uniqueness constraints for relationship tables

### DB helper modules

- `db/user.py`: user identity, org membership, streaks, active days
- `db/org.py`: org creation, API keys, membership management
- `db/cohort.py`: cohort membership, course links, metrics, leaderboard helpers
- `db/batch.py`: batch creation and membership
- `db/course.py`: course tree assembly, duplication, ordering, drip scheduling metadata
- `db/task.py`: task CRUD, quiz/assignment persistence, completion tracking, generation job tracking
- `db/chat.py`: store/fetch/delete chat history
- `db/code_draft.py`: save/load/delete code drafts
- `db/integration.py`: CRUD for integration rows
- `db/assessment_v3.py`: draft persistence, publication list, publish flow
- `db/analytics.py`: cohort completion and streak analytics
- `db/migration.py`: incremental schema/data cleanup

## 7. Background Jobs And Scheduled Behavior

Scheduler file: `sensai-backend/src/api/scheduler.py`

Configured jobs:

- every minute: publish scheduled tasks via `publish_scheduled_tasks()`
- daily at `23:55 IST`: memory check and alerting

Error handling:

- scheduled jobs are wrapped with Sentry-aware error reporting

## 8. File, Audio, And Text Processing

Utilities under `src/api/utils` cover:

- `audio.py`
  - prepares audio payloads for AI
- `file_analysis.py`
  - extracts zip submissions and submission metadata
- `text_processing.py`
  - semantic chunking
  - PDF extraction
  - DOCX extraction
  - image-based OCR/vision extraction
- `s3.py`
  - upload/download helpers and key generation
- `concurrency.py`
  - batched async gathering

## 9. BigQuery Support

Files under `src/api/bq` implement:

- SQLite-to-BigQuery extract/sync routines
- access helpers for orgs, courses, tasks, and chat

Notable detail:

- these helpers are present and tested, but the visible scheduler configuration does not currently schedule them directly

## 10. Assessment Engines

There are effectively two assessment systems in the repo.

### Assessment router (`/assessments`)

- broader experiment/orchestration layer
- supports skill extraction, question generation, coverage validation, and curriculum-driven generation

### Assessment v3 router (`/assessments_v3`)

- more productized end-user workflow
- supports draft save/resume
- question regeneration
- segment regeneration
- PDF export
- text extraction from uploads
- publication into course/milestone context

Important implementation detail:

- `assessment_engine_v3.py` uses a hardcoded `USER_ID = 123` for several management/publish flows instead of session-derived identity

## 11. Tests

The backend has substantial pytest coverage across:

- route handlers
- DB helpers
- utilities
- startup/config
- BigQuery helpers
- Slack and scheduler behavior

Test layout lives under `sensai-backend/tests`.

## 12. Notable Quirks And Risks

- CORS is fully open in `main.py`.
- The codebase relies on very large route and DB modules, especially `ai.py`, `task.py`, `course.py`, and `cohort.py`.
- Assessment v3 uses a hardcoded user id for several operations.
- There are signs of in-progress or partially retired features:
  - commented recovery tasks in startup
  - older and newer assessment systems coexisting
  - BigQuery sync support present but not visibly scheduled
- The frontend expects some AI generation endpoints such as `/ai/generate/course/...`; those flows are not exposed by decorator-based routes in `ai.py`, so they likely depend on code outside the route decorator inventory or represent stale integration expectations.

