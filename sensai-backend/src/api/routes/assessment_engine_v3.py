from fastapi import APIRouter, HTTPException, UploadFile, File
from pydantic import BaseModel, Field
from typing import List, Optional, Literal, Dict
import logging
import io
from api.llm import run_llm_with_openai
from api.db.assessment_v3 import save_assessment_draft, get_assessment_draft
from api.utils.text_processing import semantic_chunk_text, extract_text_from_pdf, extract_text_from_docx
from fastapi.responses import FileResponse
from fpdf import FPDF
import tempfile
import os

logger = logging.getLogger(__name__)

router = APIRouter()

# --- PHASE 1: Parse Curriculum Models ---
class ParseCurriculumRequest(BaseModel):
    curriculum_text: str

class CurriculumModuleDef(BaseModel):
    name: str = Field(..., description="Name of the module")
    topics: List[str] = Field(..., description="Key topics covered")

class SuggestedModuleDef(BaseModel):
    name: str
    reason: str

class ExtractedSkillDef(BaseModel):
    name: str
    type: Literal["core", "suggested"]

class ParseCurriculumResponse(BaseModel):
    modules: List[CurriculumModuleDef]
    suggested_modules: List[SuggestedModuleDef]
    skills: List[ExtractedSkillDef]

@router.post("/parse-curriculum", response_model=ParseCurriculumResponse)
async def parse_curriculum(request: ParseCurriculumRequest):
    chunks = semantic_chunk_text(request.curriculum_text)
    all_modules = []
    all_suggested = []
    all_skills = []
    
    for chunk in chunks:
        prompt = f"""
        Extract core modules and skills from the following curriculum context.
        
        GUIDELINES:
        - DESCRIPTIVE NAMES: Do not use generic names like 'Module 1' or 'Overview'. Look deeper into the content and use a descriptive title (e.g., 'Asymptotic Analysis' instead of 'Module 1: Overview').
        - KEY TOPICS: For each module, identify the specific sub-topics covered.
        - SKILL MAPPING: Extract technical and behavioral skills mentioned.
        
        CURRICULUM CHUNK:
        {chunk}
        """
        messages = [
            {"role": "system", "content": "You are an expert curriculum architect. Your goal is to transform messy curriculum text into a structured list of modules with descriptive, topic-based titles."},
            {"role": "user", "content": prompt}
        ]
        try:
            chunk_data = await run_llm_with_openai(
                model="gpt-4o", # Upgrading to gpt-4o for complex parsing
                messages=messages,
                response_model=ParseCurriculumResponse,
                max_output_tokens=3000
            )
            all_modules.extend(chunk_data.modules)
            all_suggested.extend(chunk_data.suggested_modules)
            all_skills.extend(chunk_data.skills)
        except Exception as e:
            logger.error(f"Chunk parsing error: {e}")
            continue

    # Deduplicate
    def dedup(items):
        seen = set()
        unique = []
        for it in items:
            key = it.name.lower()
            if key not in seen:
                seen.add(key)
                unique.append(it)
        return unique

    return ParseCurriculumResponse(
        modules=dedup(all_modules),
        suggested_modules=dedup(all_suggested),
        skills=dedup(all_skills)
    )


# --- PHASE 2: Generate Questions Models ---
class GenerateQuestionsRequest(BaseModel):
    modules: List[str]
    skills: List[str]
    question_types: Dict[str, int]  # e.g. {"MCQ": 5, "Coding": 1}
    module_coverage: Dict[str, float] # e.g. {"Module 1": 50.0}
    skill_mapping: Dict[str, float] # e.g. {"Problem-solving": 50.0}

class GeneratedQuestion(BaseModel):
    id: str
    type: str # MCQ, Coding, CaseBased
    module: str
    skills_tested: List[str]
    cognitive_level: str # Problem-solving, Complexity, Conceptual
    difficulty: Literal["Easy", "Medium", "Hard"]
    question_text: str
    options: Optional[List[str]] = None
    answer: str
    explanation: str

class GenerateQuestionsResponse(BaseModel):
    questions: List[GeneratedQuestion]

@router.post("/generate-questions", response_model=GenerateQuestionsResponse)
async def generate_questions(request: GenerateQuestionsRequest):
    prompt = f"""
    Generate assessment questions based on the following exact configuration:

    Modules selected: {', '.join(request.modules)}
    Module Coverages required: {request.module_coverage}
    Skills selected: {', '.join(request.skills)}
    Cognitive Mapping required: {request.skill_mapping}
    Question Distribution: {request.question_types}

    Instructions:
    - Strictly output the requested number of questions for each type.
    - Questions must distribute according to the module coverage % and cognitive mapping % roughly.
    - Each MCQ must have exactly 4 options. Options field is REQUIRED for MCQ type.
    - Coding questions should have a specific prompt. Options field MUST be empty for Coding.
    - CaseBased questions should have a specific scenario. Options field MUST be empty for CaseBased.
    - Make sure the IDs are sequential integers as strings (e.g. '1', '2').
    """
    messages = [
        {"role": "system", "content": "You are a precise Assessment Generator."},
        {"role": "user", "content": prompt}
    ]
    try:
        data = await run_llm_with_openai(
            model="gpt-4o",
            messages=messages,
            response_model=GenerateQuestionsResponse,
            max_output_tokens=6000
        )
        
        # Hallucination Validator
        validated_questions = []
        for q in data.questions:
            if q.type == "MCQ":
                # Ensure options exist and answer is in options
                if not q.options or len(q.options) < 2:
                    continue # skip or fix
                if q.answer not in q.options:
                    # Quick fix: replace last option with answer if answer isn't there
                    q.options[min(3, len(q.options)-1)] = q.answer
                # Ensure options are unique
                q.options = list(dict.fromkeys(q.options))
                # Fill back to 4 if needed
                while len(q.options) < 4:
                    q.options.append(f"None of the above {len(q.options)}")
            validated_questions.append(q)
            
        return GenerateQuestionsResponse(questions=validated_questions)
    except Exception as e:
        logger.error(f"Generate questions Error: {str(e)}")
        raise HTTPException(status_code=500, detail=str(e))

# --- PHASE 2.5: Validation and Addition ---
class ValidateInputRequest(BaseModel):
    curriculum_text: str
    item: str
    item_type: Literal["module", "skill"]

class ValidateInputResponse(BaseModel):
    valid: bool
    corrected: str
    reason: str

@router.post("/validate-addition", response_model=ValidateInputResponse)
async def validate_addition(request: ValidateInputRequest):
    prompt = f"""
    The user wants to add a new {request.item_type} named "{request.item}" to their curriculum assessment.
    However, we need to ensure it is somewhat related to the original curriculum and not a completely irrelevant topic or a major misspelling.
    Curriculum Text: {request.curriculum_text}
    
    If it's misspelled, provide the `corrected` version.
    If it's completely out of bounds (e.g. adding 'Cooking' to a 'Programming' course), set valid to false and explain why.
    Otherwise, set valid to true.
    """
    try:
        return await run_llm_with_openai(
            model="gpt-4o-mini",
            messages=[{"role": "user", "content": prompt}],
            response_model=ValidateInputResponse,
            max_output_tokens=300
        )
    except Exception as e:
        logger.error(f"Validation error: {e}")
        return ValidateInputResponse(valid=True, corrected=request.item, reason="Error validating, passing through.")

# --- PHASE 4.5: Regenerate Question ---
class RegenerateQuestionRequest(BaseModel):
    question: GeneratedQuestion
    feedback: str

class RegenerateQuestionResponse(BaseModel):
    question: GeneratedQuestion

@router.post("/regenerate-question", response_model=RegenerateQuestionResponse)
async def regenerate_question(request: RegenerateQuestionRequest):
    prompt = f"""
    Regenerate the following question based on user feedback.
    
    Original Question:
    {request.question.model_dump_json(indent=2)}
    
    Feedback: {request.feedback}
    
    Please provide an updated question preserving the structure.
    """
    try:
        updated_q = await run_llm_with_openai(
            model="gpt-4o",
            messages=[{"role": "user", "content": prompt}],
            response_model=GeneratedQuestion,
            max_output_tokens=1000
        )
        # Preserve original ID
        updated_q.id = request.question.id
        return RegenerateQuestionResponse(question=updated_q)
    except Exception as e:
        logger.error(f"Regeneration error: {e}")
        raise HTTPException(status_code=500, detail="Failed to regenerate question")

# --- PHASE 5: Persistence & Segments ---
class SaveDraftRequest(BaseModel):
    user_id: int
    data: dict

@router.post("/save-draft")
async def save_draft(request: SaveDraftRequest):
    try:
        await save_assessment_draft(request.user_id, request.data)
        return {"status": "success"}
    except Exception as e:
        logger.error(f"Save draft error: {e}")
        raise HTTPException(status_code=500, detail="Failed to save draft")

@router.get("/draft/{user_id}")
async def get_draft(user_id: int):
    draft = await get_assessment_draft(user_id)
    if not draft:
        raise HTTPException(status_code=404, detail="Draft not found")
    return draft

class RegenerateSegmentRequest(BaseModel):
    original_text: str
    feedback: str
    context: str

class RegenerateSegmentResponse(BaseModel):
    updated_text: str

@router.post("/regenerate-segment", response_model=RegenerateSegmentResponse)
async def regenerate_segment(request: RegenerateSegmentRequest):
    prompt = f"""
    The user wants to improve a specific segment of a question.
    Context (Full Question): {request.context}
    Segment to change: {request.original_text}
    Feedback: {request.feedback}
    
    Return ONLY the improved segment text.
    """
    try:
        result = await run_llm_with_openai(
            model="gpt-4o",
            messages=[{"role": "user", "content": prompt}],
            response_model=RegenerateSegmentResponse,
            max_output_tokens=500
        )
        return result
    except Exception as e:
        raise HTTPException(status_code=500, detail="Failed to regenerate segment")

# --- PHASE 6: Export ---
class ExportPDFRequest(BaseModel):
    title: str
    questions: List[GeneratedQuestion]

@router.post("/export-pdf")
async def export_pdf(request: ExportPDFRequest):
    pdf = FPDF()
    pdf.add_page()
    pdf.set_font("Arial", "B", 16)
    pdf.cell(40, 10, request.title)
    pdf.ln(20)
    
    pdf.set_font("Arial", "", 12)
    for i, q in enumerate(request.questions):
        pdf.set_font("Arial", "B", 12)
        pdf.multi_cell(0, 10, f"Q{i+1}: {q.question_text}")
        pdf.ln(2)
        
        pdf.set_font("Arial", "", 11)
        if q.options:
            for j, opt in enumerate(q.options):
                pdf.cell(0, 8, f"   {chr(65+j)}) {opt}", ln=True)
            pdf.ln(5)
            
        pdf.set_font("Arial", "I", 10)
        pdf.multi_cell(0, 8, f"Correct Answer: {q.answer}")
        pdf.multi_cell(0, 8, f"Explanation: {q.explanation}")
        pdf.ln(10)
        
    with tempfile.NamedTemporaryFile(delete=False, suffix=".pdf") as tmp:
        pdf.output(tmp.name)
        return FileResponse(tmp.name, media_type="application/pdf", filename="assessment.pdf")

# --- PHASE 7: Direct File Extraction ---
@router.post("/extract-text")
async def extract_text_endpoint(file: UploadFile = File(...)):
    filename = file.filename.lower()
    content = await file.read()
    
    # Use io.BytesIO for docx and pypdf
    stream = io.BytesIO(content)
    
    text = ""
    if filename.endswith(".pdf"):
        text = await extract_text_from_pdf(stream)
    elif filename.endswith((".docx", ".doc")):
        text = await extract_text_from_docx(stream)
    elif filename.endswith((".txt", ".md")):
        text = content.decode("utf-8", errors="ignore")
    else:
        raise HTTPException(status_code=400, detail="Unsupported file format")
    
    return {"text": text}
