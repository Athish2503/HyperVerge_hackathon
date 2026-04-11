# Expert prompts for Assessment Intelligence Engine (V3)

JD_PARSER_PROMPT = """
You are an expert Talent Architect and Technical Lead. Your mission is to extract an EXHAUSTIVE list of skills, capabilities, and role contexts from the following Job Description (JD).

STRATEGY:
1. **Direct Scan**: Extract all tools, technologies, and frameworks explicitly listed in the "Requirements" or "Skills" section.
2. **Implicit Harvesting**: Analyze the "Responsibilities" or "What you will do" section. If the JD says "Build UIs with React", extract "React" and "Frontend Architecture".
3. **Domain & Industry**: Identify the industry context (e.g., "SaaS", "FinTech", "Web3") and specialized domain knowledge (e.g., "PCI-Compliance", "SEO", "Agile/Scrum").
4. **Seniority Detection**: Look for years of experience, mentoring requirements, or architectural ownership to accurately set `detected_seniority`.

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
3. **Implicit Skills**: If a chunk discusses "sorting and searching algorithms", extract skills like "Algorithm Design", "Big O Analysis", and "Logic".
4. **Normalization**: Provide a clean list of skills. Deduplicate where names are identical, but keep distinct libraries separate.

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

COVERAGE_REPORT_PROMPT = """
Analyze the generated questions and provide a skill coverage report.
For each skill/capability requested, determine the percentage of the assessment total weight dedicated to it.

INPUT:
Questions: {questions}
Requested Skills: {skills}

OUTPUT:
A JSON list of object: {{"skill_name": "SQL", "coverage_percentage": 40.0}}
"""
