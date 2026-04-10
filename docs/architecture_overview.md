# SensAI High-Level Architecture Overview

SensAI is an AI-first Learning Management System (LMS) designed to deliver robust educational experiences. Below is a high-level overview of the system's architecture, including its sub-components, directory structures, and underlying technologies.

## High-Level System Architecture

The project follows a standard decoupled Client-Server architecture:
- **Client (Frontend):** Next.js App Router application handling UI, user state natively, authentication flows, and dynamic course/assessment rendering.
- **Server (Backend):** Python-based FastAPI application functioning as a RESTful API provider and orchestrating complex features, such as background AI jobs and Code Executions.
- **Data Persistence:** Local SQLite (`db.sqlite`) for development / RDBMS structure, alongside AWS S3 integrations for file uploads.
- **External Intgrations:** 
  - **OpenAI/Langchain/Instructor**: Core engines for the "AI Teacher" and task generation.
  - **Judge0/Code Execution**: Sandbox environment for scoring/attempting coding tasks.
  - **Sentry**: Distributed logging and tracking.

---

## 1. Frontend Repository (`sensai-frontend`)

**Tech Stack**: Next.js 15 (App Router), React 19, TypeScript, Tailwind CSS, Radix UI, Framer Motion, Next-Auth.

### Key Directories & Files
- `/src/app`: Follows the modern Next.js 13+ App router structure. It manages routes like `/login`, `/school`, and root layouts.
- `/src/components`: Contains modular React UI components using modern design trends (often powered by Radix UI and Tailwind).
- `/src/lib` & `/src/types`: Core system utilities, API interaction helpers, Next-Auth definitions, and shared frontend interfaces.
- `/src/providers`: Application-wide context providers like `SessionProvider` for Next-Auth.
- `package.json` & `next.config.ts`: Define frontend configurations, scripts (e.g. `next dev --turbopack`), and environment settings.

---

## 2. Backend Repository (`sensai-backend`)

**Tech Stack**: Python 3.11+, FastAPI, Pydantic, Uvicorn, LangChain, Boto3.

### Key Directories & Files
- `/src/api/main.py`: The main entry-point combining all the FastAPI routers, middleware configuration, and defining background schedulers or startup lifecycle events.
- `/src/api/models.py`: Centralized Pydantic models for managing DB validation schemas, REST API request/response structures, and various Enums describing types (Orgs, cohorts, quizzes, chats, scorecards).
- `/src/api/routes/`: Distinct routing files separating API surfaces:
  - `auth.py`, `user.py`, `org.py`: Core tenancy, authentication, and user role management.
  - `course.py`, `cohort.py`, `task.py`, `milestone.py`: Domain logic for the LMS platform defining curricula.
  - `ai.py`, `chat.py`: Specialized routes for generative pipelines using LLM workflows, scoring feedback, etc.
  - `code.py`: Integrating Judge0 logic for programming assignments.
- `/src/db/`: Directory meant for database configurations (contains `db.sqlite` default setup).
- `pyproject.toml`: The configuration defining application dependencies (managed likely with `hatch` or `uv`), Dev-dependencies, and runner scripts. 

---

## Summary of Execution Flow
1. **User Interaction**: Learners and Admins interact via the Next.js frontend, firing client-side routes.
2. **API Communication**: Next.js communicates with FastAPI endpoints passing JWT tokens or Next-Auth context logic.
3. **Task & AI Computations**: The backend queries necessary details from the persistent DB, and if the route is AI-based (like taking a quiz with immediate feedback), passes the context to an LLM chain via `src/api/routes/ai.py` communicating with OpenAI.
4. **Data return**: The response, along with generated scorecard context, is returned to update the User Streak/Progress metrics natively parsed on the frontend via React components.
