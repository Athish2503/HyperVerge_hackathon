# Assessment Intelligence Engine — Curriculum & JD-Aligned Generation

## 1. Overview
The Assessment Intelligence Engine is a new subsystem within SensAI intended to streamline the creation of high-quality assessments. It serves two distinct personas:
1. **Trainers / Educators** (Curriculum-based learning validation).
2. **Recruiters / Hiring Managers** (Job Description-based screening and prediction).

This engine will dynamically map inputs (Syllabi or textual JDs) to underlying skills, and generate role-aligned or learning-aligned questions (MCQs, SAQs, Case Studies, Coding items) with calibrated difficulty.

---

## 2. Personas and Workflows

### Mode A: Trainer Flow (Curriculum → Skill-Based Assessments)
**Goal**: Verify a learner's mastery of specific subjects within a course.
- **Input**: Course parameters, module structures (e.g., Arrays, Linked Lists), target skills (e.g., algorithmic complexity).
- **Processing**: The LLM extracts the educational outcomes, distributes weightage proportionally across modules, and creates balanced assessments.
- **Output**: A structured assessment containing domain-specific questions, alongside a `coverage report`.

### Mode B: Recruiter Flow (JD → Role-Aligned Assessments)
**Goal**: Filter candidates based on actual relevance to a specific Job Description.
- **Input**: Raw text of a Job Description (e.g., Product Analyst) and a target difficulty level (Beginner/Intermediate/Advanced).
- **Processing**: The LLM decomposes the unstructured JD into core capabilities/tools (SQL, Product Sense), builds a screening taxonomy, and generates non-redundant, applied scenario questions.
- **Output**: A structured assessment focused strictly on hiring predictiveness, mapped explicitly to the JD's exact required capabilities.

---

## 3. Database Schema Updates (`src/api/models.py`)

Current SensAI architecture uses Pydantic forms and models stored either via raw SQLite or JSON mappings. To support the Assessment Intelligence Engine, the following models will be introduced:

```python
class AssessmentGenerationType(Enum):
    CURRICULUM = "curriculum"
    JOB_DESCRIPTION = "job_description"

class GenerateAssessmentRequest(BaseModel):
    generation_type: AssessmentGenerationType
    context_text: str  # The Curriculum description or the full JD text
    difficulty: str
    target_question_count: int

class AssessmentSkillMapping(BaseModel):
    skill_name: str
    weightage_percentage: float

class GeneratedQuestionDraft(BaseModel):
    type: QuestionType # Objective / Open-Ended / Code
    text: str
    options: Optional[List[str]] = None
    correct_answer: Optional[str] = None
    skill_tags: List[str]
    difficulty: str
    scorecard_criteria: Optional[List[ScorecardCriterion]] = None

class GeneratedAssessmentResponse(BaseModel):
    coverage_report: List[AssessmentSkillMapping]
    questions: List[GeneratedQuestionDraft]
```

---

## 4. API & Backend Implementation

We will add a new dedicated FastAPI router (`api/routes/assessment.py`) mapped in `main.py`.

### Endpoints
* **`POST /api/assessment/generate`**
  - **Payload**: `GenerateAssessmentRequest`
  - **Lifecycle**:
    1. Reads the `generation_type`.
    2. Invokes OpenAI (via `api/llm.py` and structured models).
    3. Triggers two internal LLM prompts defined in `api/prompts/assessment_generator.py`:
       - `CURRICULUM_PROMPT` or `JD_PROMPT` respectively.
    4. Streams or returns the unified `GeneratedAssessmentResponse` as JSON.

---

## 5. Frontend UI/UX Architecture

The frontend (Next.js App Router) will be augmented with a new dedicated generator capability.

### 1. `AssessmentGeneratorView.tsx`
- A dashboard wizard allowing users to select "Generate from Course" or "Generate from JD".
- Contains textarea elements for inputting unstructured context, and sliders for `Difficulty` (e.g. Beginner -> Advanced) and `Assessment Length`.

### 2. `CoverageLayer.tsx`
- Renders the `coverage_report` from the backend response using visualizations (like a doughnut chart or bar chart mapping SKILLS to PERCENTAGES). This ensures the user instantly validates the LLM's understanding of the source material.

### 3. `AssessmentReviewer.tsx`
- After the JSON draft is returned, the user encounters a review interface.
- It iterates through each `GeneratedQuestionDraft`.
- UI provides `Accept`, `Edit`, `Reject` capabilities per item.
- **Conversion**: Clicking "Finalize" converts the accepted items into standard SensAI objects: `QuizTask`, `PublishedQuestion`, and `Scorecard` within a designated `Milestone`.

---

## 6. Verification and Guardrails
- **Skill Validation Constraint**: LLMs often hallucinate generic questions. By strictly enforcing `scorecard_criteria` mapping and forcing LLMs to output `AssessmentSkillMapping` *first* (chain-of-thought), we drastically improve question predictability.
- **Deduplication**: The prompt configuration will mandate unique scenario environments for each generated question to reduce repetitive concepts (e.g., avoiding 5 different MCQs asking about SQL `SELECT` syntax).
