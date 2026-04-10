from fastapi import APIRouter, HTTPException, Depends
from pydantic import BaseModel, Field
from typing import List, Optional, Literal, Dict, Union
import json
import logging
from api.llm import run_llm_with_openai

logger = logging.getLogger(__name__)

router = APIRouter()

# --- INPUT MODELS ---
class CurriculumInput(BaseModel):
    course_name: str
    modules: List[str]
    skills: Optional[List[str]] = None

class JDInput(BaseModel):
    raw_text: str
    difficulty: Literal["easy", "medium", "hard"]

class ExtractSkillsRequest(BaseModel):
    input_type: Literal["curriculum", "jd"]
    curriculum: Optional[CurriculumInput] = None
    jd: Optional[JDInput] = None

# --- OUTPUT MODELS FOR LLM ---
class SkillExtractionResult(BaseModel):
    skills: List[str] = Field(description="List of normalized extracted skills")

class AssessmentMetadata(BaseModel):
    title: str
    type: str # e.g. "Hiring Assessment" or "Curriculum Validation"
    target_seniority: str
    total_estimated_time: str

class AssessmentItem(BaseModel):
    id: str
    type: Literal["MCQ", "SAQ", "Caselet", "Coding"]
    skill_tag: str
    sub_skill: str
    difficulty: Literal["Easy", "Medium", "Hard"]
    question_text: str
    options: Optional[List[str]] = None
    model_answer: str
    rationale: str

class AssessmentOutput(BaseModel):
    metadata: AssessmentMetadata
    items: List[AssessmentItem]

# --- REQUEST MODELS ---
class GenerateAssessmentRequest(BaseModel):
    skills: List[str]
    mode: Literal["learning", "hiring"]
    difficulty: Literal["easy", "medium", "hard"]
    input_context: str = "" # Provide the raw input for better archetyping

class Gamification(BaseModel):
    xp: int
    level: int
    badges: List[str]
    streak: int

class ValidationOutput(BaseModel):
    coverage: Dict[str, float]
    difficulty_distribution: Dict[str, float]
    alignment_justification: str
    gamification: Optional[Gamification] = None


@router.post("/extract-skills", response_model=SkillExtractionResult)
async def extract_skills(request: ExtractSkillsRequest):
    logger.info(f"Extracting skills for type: {request.input_type}")
    
    if request.input_type == "curriculum":
        if not request.curriculum:
            raise HTTPException(status_code=400, detail="Curriculum data is required")
        prompt = (
            f"Extract a normalized list of technical skills from the following curriculum. "
            f"Sparse Input Protocol: If too short, enter Inference Mode and suggest standard skills.\n"
            f"Course: {request.curriculum.course_name}\n"
            f"Modules: {', '.join(request.curriculum.modules)}\n"
            f"Provided Skills: {request.curriculum.skills or 'None'}"
        )
    elif request.input_type == "jd":
        if not request.jd:
            raise HTTPException(status_code=400, detail="JD data is required")
        prompt = (
            f"Extract a normalized list of key technical skills from this Job Description. "
            f"Expected difficulty level context: {request.jd.difficulty}\n"
            f"Sparse Input Protocol: If too short, guess industry standards.\n"
            f"JD Text: {request.jd.raw_text}"
        )
    else:
        raise HTTPException(status_code=400, detail="Invalid input type")

    try:
        messages = [
            {"role": "system", "content": "You are the Assessment Intelligence Engine (AIE). Combine Instructional Design and Strategic Talent Acquisition. Merge redundant skills into single domains."},
            {"role": "user", "content": prompt}
        ]
        
        result = await run_llm_with_openai(
            model="gpt-4o-mini",
            messages=messages,
            response_model=SkillExtractionResult,
            max_output_tokens=1000
        )
        return result
    except Exception as e:
        logger.error(f"LLM extraction failed: {str(e)}")
        raise HTTPException(status_code=500, detail=f"LLM Error: {str(e)}")


@router.post("/generate", response_model=AssessmentOutput)
async def generate_assessment(request: GenerateAssessmentRequest):
    logger.info(f"Generating assessment for {len(request.skills)} skills, mode: {request.mode}")
    
    flow = "Flow A: Curriculum -> Skill Validation (The Trainer Path) Focus: Concept mastery and incremental difficulty (Bloom's Taxonomy)." if request.mode == "learning" else "Flow B: JD -> Role-Aligned Hiring (The Recruiter Path) Focus: Applied Knowledge over rote theory, screening efficiency."

    prompt = f"""
    Analyze the provided input and apply the active flow.
    **Flow Mode Active:** {flow}
    **Target Seniority/Difficulty:** {request.difficulty}
    **Target Skills:** {', '.join(request.skills)}
    **Raw Input Context:** {request.input_context}

    **The Accuracy & Filtering Engine Rules:**
    1. Cognitive Depth: No 'What is X?' Use 'Given scenario Y, how would you optimize Z?'
    2. Distractor Logic: Create 'Near-miss' MCQ options representing common mistakes.
    3. Role Archetyping: Adjust flavor. (e.g., SQL for Data Engineer focus on efficiency, for Product Analyst focus on metrics).
    4. Redundancy Scrubber: Ensure no two items test the same sub-skill.
    5. Hybrid Role Logic: For niche roles, generate 'Interdisciplinary Caselets'.
    
    Generate the `assessment.json` structure maintaining absolute schema parity.
    """

    messages = [
        {"role": "system", "content": "You are the Assessment Intelligence Engine (AIE). Generate high-precision structured assessments."},
        {"role": "user", "content": prompt}
    ]

    try:
        assessment_raw = await run_llm_with_openai(
            model="gpt-4o",
            messages=messages,
            response_model=AssessmentOutput,
            max_output_tokens=3000
        )
        return assessment_raw

    except Exception as e:
        logger.error(f"Assessment generation failed: {str(e)}")
        raise HTTPException(status_code=500, detail=f"Assessment Generation Error: {str(e)}")


class AlignmentJustificationResult(BaseModel):
    alignment_justification: str

@router.post("/validate-coverage", response_model=ValidationOutput)
async def validate_coverage(assessment: AssessmentOutput):
    items = assessment.items
    total_items = len(items)
    
    if total_items == 0:
        return ValidationOutput(
            coverage={},
            difficulty_distribution={},
            alignment_justification="No items to validate.",
            gamification=Gamification(xp=0, level=1, badges=[], streak=0)
        )

    # Calculate coverage
    coverage_counts = {}
    difficulty_counts = {"easy": 0, "medium": 0, "hard": 0}
    
    for item in items:
        coverage_counts[item.skill_tag] = coverage_counts.get(item.skill_tag, 0) + 1
        dif = item.difficulty.lower()
        if dif in difficulty_counts:
            difficulty_counts[dif] += 1
            
    coverage_percentages = {k: (v / total_items) * 100 for k, v in coverage_counts.items()}
    difficulty_percentages = {k: (v / total_items) * 100 for k, v in difficulty_counts.items()}
    
    # Generate gamification
    xp_base = {"easy": 10, "medium": 20, "hard": 30}
    total_xp = sum([xp_base.get(item.difficulty.lower(), 10) for item in items])
    
    level = max(1, total_xp // 100)
    badges = []
    
    if "Hiring" not in assessment.metadata.type and total_xp > 50:
        badges.append("Fast Learner")
    if "Hiring" in assessment.metadata.type and difficulty_counts["hard"] > 0:
        badges.append("Pro Coder")
        
    for skill, count in coverage_counts.items():
        if count >= 2:
            badges.append(f"{skill} Master")

    # Fast LLM call to get alignment justification based on the items
    prompt = f"Given an assessment with {total_items} items targeting {', '.join(coverage_counts.keys())}, write a brief paragraph (Alignment Justification) explaining how this assessment filters the 'right' candidate or validates the curriculum."
    
    try:
        just_result = await run_llm_with_openai(
            model="gpt-4o-mini",
            messages=[{"role": "user", "content": prompt}],
            response_model=AlignmentJustificationResult,
            max_output_tokens=300
        )
        justification_text = just_result.alignment_justification
    except:
        justification_text = "This assessment broadly verifies competency via standard multiple choice and case evaluations."

    return ValidationOutput(
        coverage=coverage_percentages,
        difficulty_distribution=difficulty_percentages,
        alignment_justification=justification_text,
        gamification=Gamification(
            xp=total_xp,
            level=level,
            badges=badges[:3],
            streak=1
        )
    )

# --- ASSESSMENT INTELLIGENCE ENGINE (END-TO-END) ---
class AssessmentEngineInput(BaseModel):
    role: str
    raw_input: str
    difficulty: Literal["easy", "medium", "hard"]
    optional_skills: Optional[List[str]] = []

class SkillsSchema(BaseModel):
    extracted: List[str]
    normalized: List[str]
    final: List[str]

class DistributionSchema(BaseModel):
    MCQ: int
    SAQ: int
    CASE: int

class QuestionSchema(BaseModel):
    id: str
    type: Literal["MCQ", "SAQ", "CASE"]
    skill: str
    sub_skill: Optional[str]
    difficulty: Literal["easy", "medium", "hard"]
    question: str
    options: Optional[List[str]]
    answer: str
    explanation: str

class CoverageItem(BaseModel):
    skill: str
    percentage: float

class LLMAssessmentSchema(BaseModel):
    distribution: DistributionSchema
    coverage: List[CoverageItem]
    questions: List[QuestionSchema]

class AssessmentSchema(BaseModel):
    distribution: DistributionSchema
    coverage: Dict[str, float]
    questions: List[QuestionSchema]

class ValidationSchema(BaseModel):
    coverage_ok: bool
    redundancy_score: Literal["low", "medium", "high"]
    difficulty_match: bool
    notes: str

class LLMAssessmentEngineOutput(BaseModel):
    role: str
    difficulty: str
    skills: SkillsSchema
    assessment: LLMAssessmentSchema
    validation: ValidationSchema

class AssessmentEngineOutput(BaseModel):
    role: str
    difficulty: str
    skills: SkillsSchema
    assessment: AssessmentSchema
    validation: ValidationSchema

@router.post("/generate-end-to-end", response_model=AssessmentEngineOutput)
async def generate_assessment_end_to_end(request: AssessmentEngineInput):
    logger.info(f"Generating end-to-end assessment for role: {request.role}")
    
    prompt = f"""
### OBJECTIVE
Generate a structured assessment in strictly valid JSON format for the following input.

### INPUT
- role: {request.role}
- raw_input: {request.raw_input}
- difficulty: {request.difficulty}
- optional_skills: {request.optional_skills}

### STEP 1: SKILL EXTRACTION
Extract all relevant skills from raw_input.
Rules:
- Ignore generic phrases (e.g., "team player", "good communication")
- Focus only on technical and role-relevant skills
- If raw_input is weak or vague, infer missing skills from role

### STEP 2: SKILL NORMALIZATION
Map extracted skills into standardized categories.
Example:
- "data-driven decisions" -> Metrics
- "writing SQL queries" -> SQL
- "product sense" -> Product Thinking
Merge duplicates and remove noise.

### STEP 3: FINAL SKILL SET
Final skills = (extracted skills + role-relevant skills) + inferred critical skills
Limit to top 3-5 core skills.

### STEP 4: ASSESSMENT BLUEPRINT
Generate:
- Total questions: 15 MCQs, 5 SAQs, 1 Case Study
- Skill coverage distribution (must sum to 100%)
- Difficulty distribution based on input difficulty:
  easy -> 60% easy, 30% medium, 10% hard  
  medium -> 30% easy, 50% medium, 20% hard  
  hard -> 10% easy, 40% medium, 50% hard  

### STEP 5: QUESTION GENERATION
Generate questions testing the Final Skills. 
Each question must include: id, type (MCQ | SAQ | CASE), skill, sub_skill, difficulty, question, options (only for MCQ), answer, explanation.
Rules:
- Avoid generic or textbook questions
- Use real-world scenarios wherever possible
- Ensure questions test applied understanding
- Avoid repetition across questions
- Ensure each skill has diverse subtopics

### STEP 6: COVERAGE VALIDATION
Ensure:
- Skill distribution matches blueprint
- No skill is over- or under-represented
- Questions are non-redundant
- Difficulty distribution is respected

### HARD CONSTRAINTS
- No duplicate questions
- No vague or generic questions
- Maintain role relevance at all times
- Keep questions concise but realistic

Execute now.
"""

    messages = [
        {"role": "system", "content": "You are an Assessment Intelligence Engine."},
        {"role": "user", "content": prompt}
    ]

    try:
        raw_result = await run_llm_with_openai(
            model="gpt-4o",
            messages=messages,
            response_model=LLMAssessmentEngineOutput,
            max_output_tokens=8000,
            api_mode="chat_completions"
        )

        coverage_dict = {item.skill: item.percentage for item in raw_result.assessment.coverage}
        
        final_assessment = AssessmentSchema(
            distribution=raw_result.assessment.distribution,
            coverage=coverage_dict,
            questions=raw_result.assessment.questions
        )

        return AssessmentEngineOutput(
            role=raw_result.role,
            difficulty=raw_result.difficulty,
            skills=raw_result.skills,
            assessment=final_assessment,
            validation=raw_result.validation
        )

    except Exception as e:
        logger.error(f"End-to-End Assessment generation failed: {str(e)}")
        raise HTTPException(status_code=500, detail=f"Assessment Generation Error: {str(e)}")


