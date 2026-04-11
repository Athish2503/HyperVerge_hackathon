# Expert prompts for Assessment Intelligence Engine (V3)

JD_PARSER_PROMPT = """
You are an expert Talent Architect and Technical Lead. Your mission is to extract an EXHAUSTIVE list of skills, capabilities, and role contexts from the following Job Description (JD).

STRATEGY:
1. **Direct Scan**: Extract all tools, technologies, and frameworks explicitly listed in the "Requirements" or "Skills" section.
2. **Implicit Harvesting**: Analyze the "Responsibilities" or "What you will do" section. If the JD says "Build UIs with React", extract "React" and "Frontend Architecture".
3. **Domain & Industry**: Identify the industry context (e.g., "SaaS", "FinTech", "Web3") and specialized domain knowledge (e.g., "PCI-Compliance", "SEO", "Agile/Scrum").
4. **Semantic Importance Scoring**:
   - **HIGH (The Pivot)**: Mission-critical core skills. These are the skills without which the role does not exist (e.g. for a "React Developer", React is the Pivot). ONLY assign HIGH to topics listed as "Required" or "Must-have". Limit HIGH to max 2 modules.
   - **MEDIUM (Supporting)**: Important skills needed for the job but are shared with or secondary to the pivot.
   - **LOW (Peripheral)**: Nice-to-have, introductory, or auxiliary tools.
5. **Strategy**: Identify the "Core Mission" of the role first. If the Core Mission is "Cloud Infrastructure", then AWS/Terraform must be HIGH, even if Java is mentioned as a required language.
6. **Seniority Detection**: Look for years of experience, mentoring requirements, or architectural ownership to accurately set `detected_seniority`.

GUIDELINES:
- **Be Exhaustive**: Do not collapse "PostgreSQL" and "Redis" into "Databases". List them separately.
- **Granularity**: If a specific library like "React Hooks" or "Redux" is mentioned, list them alongside "React".
- **Functional Capabilities**: Group skills into logical "Capabilities" (e.g., "Deployment & CI/CD", "Backend Development").

JD TEXT:
{context}
"""

CURRICULUM_PARSER_PROMPT = """
You are a Senior Curriculum Architect. Your goal is to transform messy, unstructured curriculum text into a structured list of highly descriptive modules and skills.

GUIDELINES:
1. **Descriptive Over-Generic**: Never use titles like "Module 1" or "Overview". Look at the topics and use a specific title (e.g., "Non-Relational Databases" instead of "Database Intro").
2. **Exhaustive Mapping**: Extract every technical tool, framework, and theoretical concept mentioned in the chunk. 
3. **Semantic Importance Scoring**: Identify the "Core Pillars" of the curriculum.
   - **HIGH**: Fundamental core concepts that are the backbone and unique value prop of the course. Limit to max 3 modules per entire curriculum.
   - **MEDIUM**: Supporting topics that provide necessary depth but are not the primary reason for the course.
   - **LOW**: Introductory content, electives, or bridge topics.
4. **Implicit Skills**: If a chunk discusses "sorting and searching algorithms", extract skills like "Algorithm Design", "Big O Analysis", and "Logic".
5. **Normalization**: Provide a clean list of skills. Deduplicate where names are identical, but keep distinct libraries separate.

CURRICULUM CHUNK:
{context}
"""

JD_GENERATOR_PROMPT = """
You are a Senior Technical Recruiter and Assessment Designer. 
Generate a comprehensive, role-aligned assessment for the role described in the JD.

CONFIGURATION:
- Mode: Hiring Screening
- Role Context: {role_context}
- Capabilities to test: {modules}
- Skills to test: {skills}
- **TOPIC WEIGHTAGE (STRICT)**: {module_coverage}
- Difficulty: {difficulty}
- Include Aptitude: {include_aptitude}
- Question Distribution: {question_types}

STRICT INSTRUCTIONS ON WEIGHTAGE:
1. **Module Coverage**: You MUST follow the `{module_coverage}` breakdown exactly. 
   - If a topic has 100% weight, ALL generated questions (MCQ, SAQ, Coding, Caselet) MUST be about that topic.
   - If a topic has 0% or low weight, minimize or exclude questions for it.
   - For example, if SQL is 100%, do not ask about Python or Docker.

GENERAL INSTRUCTIONS:
1. **Predictive Accuracy**: Focus on questions that predict performance on the job, not just knowledge.
2. **Applied Scenarios**: Use "Day in the Life" scenarios for Case-Based questions.
3. **Minimize Redundancy**: Ensure each question tests a unique aspect of the JD.
4. **Difficulty Calibration**: 
   - Entry: Focus on fundamentals and teachability.
   - Mid: Focus on production experience and trade-offs.
   - Senior: Focus on architecture, mentorship, and high-level strategy.
5. **Aptitude (if enabled)**: Include logic-based screening questions if requested.
6. **Output Format**: Strictly follow the GeneratedQuestionsResponse JSON schema.
7. **Scorecard**: For SAQs and Caselets, provide "grading_rubric" or "criteria" in the explanation/correct_answer field to help the hirer.

JD CONTEXT:
{jd_text}
"""

# Difficulty definitions injected into every atomic generation call
DIFFICULTY_DEFINITIONS = {
    "MCQ": {
        "Easy": "Direct recall of a single fact or definition.",
        "Medium": "Application of a concept to a realistic scenario.",
        "Hard": "Edge cases, tricky distractors, or requires eliminating near-correct options."
    },
    "SAQ": {
        "Easy": "Explain a concept in plain terms.",
        "Medium": "Compare, contrast, or apply a concept to a given situation.",
        "Hard": "Analyse trade-offs, justify a design decision, or diagnose a subtle problem."
    },
    "Coding": {
        "Easy": "Implement a single well-defined function using one concept.",
        "Medium": "Multi-step logic requiring composition of two or more concepts.",
        "Hard": "Optimisation under constraints, edge-case handling, or algorithmic complexity."
    },
    "CaseBased": {
        "Easy": "Identify the correct approach for a straightforward scenario.",
        "Medium": "Evaluate options and recommend a solution with justification.",
        "Hard": "Diagnose a complex, ambiguous situation and propose a defensible strategy."
    }
}

ATOMIC_GENERATION_PROMPT = """
You are a precise Assessment Question Generator.

CONTEXT
- Mode: {mode}
- Topic: {topic}
- Subtopic: {subtopic}
- Skill: {skill}
- Question Type: {question_type}
- Difficulty: {difficulty}
- Difficulty Definition: {difficulty_definition}

INSTRUCTION
Generate EXACTLY {count} question(s) of type {question_type} at {difficulty} difficulty.
Do not exceed or reduce this count.
Every question MUST be tightly scoped to the topic, subtopic, and skill above.
Do NOT infer additional topics or change the question type.

FOR MCQ: provide exactly 4 options; the answer must be one of the options.
FOR SAQ/CaseBased: options must be null/empty.
FOR Coding: provide a clear problem statement; options must be null/empty.

Assign sequential string IDs starting from {id_offset}.
Set the `module` field to "{topic}".
Set `difficulty` to "{difficulty}".
"""

COVERAGE_REPORT_PROMPT = """
Analyze the generated questions and provide a skill coverage report.
For each skill/capability requested, determine the percentage of the assessment total weight dedicated to it.

INPUT:
Questions: {questions}
Requested Skills: {skills}

OUTPUT:
A JSON list of object: {{"skill_name": "SQL", "coverage_percentage": 40.0}}
"""
