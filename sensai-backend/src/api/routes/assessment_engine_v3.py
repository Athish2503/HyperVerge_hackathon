from fastapi import APIRouter, HTTPException, UploadFile, File, Response
from pydantic import BaseModel, Field
from typing import List, Optional, Literal, Dict
import logging
import io
from api.llm import run_llm_with_openai
from api.db.assessment_v3 import save_assessment_draft, get_assessment_draft, delete_assessment_draft, get_user_assessments, publish_assessment
from api.db.course import get_all_courses_for_org, get_course
from api.utils.text_processing import semantic_chunk_text, extract_text_from_pdf, extract_text_from_docx
from fastapi.responses import FileResponse
from fpdf import FPDF
import tempfile
import os
import re
import traceback

def clean_text(text: str) -> str:
    """Sanitize text for FPDF Latin-1 encoding."""
    if not text: return ""
    replacements = {
        "\u2013": "-", "\u2014": "--", "\u2018": "'", "\u2019": "'",
        "\u201c": '"', "\u201d": '"', "\u2022": "*", "\u21d2": "=>",
        "\u2713": "[V]", "\u2714": "[V]", "\r": "", "\n": " "
    }
    for k, v in replacements.items():
        text = text.replace(k, v)
    # Aggressively remove non-latin1 characters
    return text.encode('latin-1', 'replace').decode('latin-1').replace('?', ' ')
from api.prompts.assessment_prompts import JD_PARSER_PROMPT, CURRICULUM_PARSER_PROMPT, JD_GENERATOR_PROMPT, COVERAGE_REPORT_PROMPT

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
    detected_seniority: Optional[str] = None

@router.post("/parse-curriculum", response_model=ParseCurriculumResponse)
async def parse_curriculum(request: ParseCurriculumRequest):
    chunks = semantic_chunk_text(request.curriculum_text)
    all_modules = []
    all_suggested = []
    all_skills = []
    
    for chunk in chunks:
        prompt = CURRICULUM_PARSER_PROMPT.format(context=chunk)
        try:
            chunk_data = await run_llm_with_openai(
                model="gpt-4o",
                messages=[
                    {"role": "system", "content": "You are an expert curriculum architect. Your goal is to transform messy curriculum text into a structured list of modules with descriptive, topic-based titles."},
                    {"role": "user", "content": prompt}
                ],
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

class ParseJDRequest(BaseModel):
    jd_text: str

@router.post("/parse-jd", response_model=ParseCurriculumResponse)
async def parse_jd(request: ParseJDRequest):
    """Refined parsing for Job Descriptions with high-fidelity extraction."""
    try:
        data = await run_llm_with_openai(
            model="gpt-4o",
            messages=[
                {"role": "system", "content": "You are a Senior Technical Recruiter. Extract an exhaustive list of capabilities and skills."},
                {"role": "user", "content": JD_PARSER_PROMPT.format(context=request.jd_text)}
            ],
            response_model=ParseCurriculumResponse,
            max_output_tokens=3000
        )
        return data
    except Exception as e:
        logger.error(f"JD parsing error: {e}")
        raise HTTPException(status_code=500, detail="Failed to parse JD")


# --- PHASE 2: Generate Questions Models ---
class GenerateQuestionsRequest(BaseModel):
    modules: List[str]
    skills: List[str]
    question_types: Dict[str, int]
    module_coverage: Dict[str, float]
    skill_mapping: Dict[str, float]
    generation_mode: Literal["curriculum", "jd"] = "curriculum"
    difficulty: Literal["Easy", "Medium", "Hard"] = "Medium"
    include_aptitude: bool = False
    context_text: Optional[str] = None # Original JD or Curriculum text

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

class AssessmentSkillCoverage(BaseModel):
    skill_name: str
    coverage_percentage: float

class GenerateQuestionsResponse(BaseModel):
    questions: List[GeneratedQuestion]
    coverage_report: List[AssessmentSkillCoverage] = []

@router.post("/generate-questions", response_model=GenerateQuestionsResponse)
async def generate_questions(request: GenerateQuestionsRequest):
    if request.generation_mode == "jd":
        prompt = JD_GENERATOR_PROMPT.format(
            role_context="Hiring Assessment",
            modules=', '.join(request.modules),
            skills=', '.join(request.skills),
            module_coverage=request.module_coverage,
            difficulty=request.difficulty,
            include_aptitude=request.include_aptitude,
            question_types=request.question_types,
            jd_text=request.context_text or "No context provided"
        )
        system_content = "You are a precise Recruitment Assessment Specialist."
    else:
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
        system_content = "You are a precise Assessment Generator."

    messages = [
        {"role": "system", "content": system_content},
        {"role": "user", "content": prompt}
    ]
    try:
        data = await run_llm_with_openai(
            model="gpt-4o",
            messages=messages,
            response_model=GenerateQuestionsResponse,
            max_output_tokens=6000
        )
        
        # Calculate coverage report if LLM didn't (or to be precise)
        if not data.coverage_report:
            skill_counts = {}
            total_tags = 0
            for q in data.questions:
                for skill in q.skills_tested:
                    skill_counts[skill] = skill_counts.get(skill, 0) + 1
                    total_tags += 1
            
            if total_tags > 0:
                data.coverage_report = [
                    AssessmentSkillCoverage(skill_name=name, coverage_percentage=round((count / total_tags) * 100, 1))
                    for name, count in skill_counts.items()
                ]
        
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
            else:
                # For SAQ, Coding, CaseBased - ensure options are null/empty
                q.options = None
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
    prompt = """
    The user wants to add a new {item_type} named "{item}" to their curriculum assessment.
    However, we need to ensure it is somewhat related to the original curriculum and not a completely irrelevant topic or a major misspelling.
    Curriculum Text: {curriculum_text}
    
    If it's misspelled, provide the corrected version.
    If it's completely out of bounds (e.g. adding 'Cooking' to a 'Programming' course), set valid to false and explain why.
    Otherwise, set valid to true.
    """.format(item_type=request.item_type, item=request.item, curriculum_text=request.curriculum_text)
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

@router.delete("/draft/{user_id}")
async def clear_draft(user_id: int):
    try:
        await delete_assessment_draft(user_id)
        return {"status": "success"}
    except Exception as e:
        logger.error(f"Clear draft error: {e}")
        raise HTTPException(status_code=500, detail="Failed to clear draft")

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
    try:
        pdf = FPDF(orientation='P', unit='mm', format='A4')
        # A4 width = 210mm; with 15mm margins each side, usable width = 180mm
        pdf.set_auto_page_break(auto=True, margin=20)
        pdf.add_page()
        pdf.set_left_margin(15)
        pdf.set_right_margin(15)
        pdf.set_top_margin(15)
        
        # Effective width
        eff_w = pdf.w - pdf.l_margin - pdf.r_margin  # ~180mm

        # Title
        pdf.set_font("Helvetica", "B", 18)
        title_text = clean_text(request.title or "Assessment")
        pdf.cell(eff_w, 12, title_text, ln=True, align="C")
        pdf.ln(6)
        
        pdf.set_font("Helvetica", "", 9)
        pdf.set_text_color(120, 120, 120)
        pdf.cell(eff_w, 6, f"{len(request.questions)} Questions | Generated by Sensai AIE", ln=True, align="C")
        pdf.set_text_color(0, 0, 0)
        pdf.ln(10)

        # Separator line
        pdf.set_draw_color(200, 200, 200)
        pdf.line(pdf.l_margin, pdf.get_y(), pdf.l_margin + eff_w, pdf.get_y())
        pdf.ln(8)
        
        for i, q in enumerate(request.questions):
            # Question number badge
            pdf.set_font("Helvetica", "B", 9)
            pdf.set_fill_color(30, 30, 30)
            pdf.set_text_color(255, 255, 255)
            pdf.cell(12, 6, f"Q{i+1}", fill=True, ln=False)
            pdf.set_text_color(0, 0, 0)
            pdf.set_fill_color(255, 255, 255)

            # Type + Difficulty tags
            tag_x = pdf.get_x() + 3
            pdf.set_font("Helvetica", "", 8)
            pdf.set_text_color(80, 80, 80)
            q_type = clean_text(q.type)
            q_diff = clean_text(q.difficulty)
            pdf.cell(eff_w - 15, 6, f"  {q_type}  |  {q_diff}", ln=True)
            pdf.set_text_color(0, 0, 0)
            pdf.ln(2)

            # Question text
            pdf.set_font("Helvetica", "B", 11)
            q_text = clean_text(q.question_text)
            if q_text:
                pdf.multi_cell(eff_w, 7, q_text)
            pdf.ln(3)
            
            # Options (MCQ)
            if q.options:
                pdf.set_font("Helvetica", "", 10)
                for j, opt in enumerate(q.options):
                    opt_text = clean_text(f"{chr(65+j)})  {opt}")
                    is_correct = clean_text(opt) == clean_text(q.answer)
                    if is_correct:
                        pdf.set_text_color(0, 120, 60)
                        pdf.set_font("Helvetica", "B", 10)
                    else:
                        pdf.set_text_color(60, 60, 60)
                        pdf.set_font("Helvetica", "", 10)
                    if opt_text.strip():
                        pdf.multi_cell(eff_w, 6, f"   {opt_text}")
                pdf.set_text_color(0, 0, 0)
                pdf.ln(2)

            # Answer section (for non-MCQ)
            if not q.options or len(q.options) == 0:
                pdf.set_font("Helvetica", "B", 9)
                pdf.set_text_color(0, 100, 60)
                pdf.cell(eff_w, 6, "Answer / Rubric:", ln=True)
                pdf.set_font("Helvetica", "", 9)
                pdf.set_text_color(40, 40, 40)
                ans_text = clean_text(q.answer)
                if ans_text.strip():
                    pdf.multi_cell(eff_w, 5, ans_text)
                pdf.set_text_color(0, 0, 0)
                pdf.ln(2)

            # Explanation
            if q.explanation:
                pdf.set_font("Helvetica", "I", 9)
                pdf.set_text_color(100, 100, 100)
                exp_text = clean_text(f"Explanation: {q.explanation}")
                if exp_text.strip():
                    pdf.multi_cell(eff_w, 5, exp_text)
                pdf.set_text_color(0, 0, 0)

            pdf.ln(5)
            # Divider between questions
            pdf.set_draw_color(230, 230, 230)
            pdf.line(pdf.l_margin, pdf.get_y(), pdf.l_margin + eff_w, pdf.get_y())
            pdf.ln(6)
            
        pdf_content = pdf.output()
        
        return Response(
            content=bytes(pdf_content), 
            media_type="application/pdf",
            headers={
                "Content-Disposition": f'attachment; filename="assessment.pdf"',
                "Access-Control-Expose-Headers": "Content-Disposition"
            }
        )
    except Exception as e:
        error_trace = traceback.format_exc()
        logger.error(f"PDF Export Error: {str(e)}\n{error_trace}")
        raise HTTPException(status_code=500, detail=str(e))

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

# --- PHASE 8: Management & Publishing ---

USER_ID = 123 # Pattern match with existing temp users but use integer for V3

class PublishRequest(BaseModel):
    model_config = {"protected_namespaces": ()}
    title: str
    config: dict
    questions: list  # Accept raw list to avoid model_answer field conflicts
    course_id: Optional[int] = None
    milestone_id: Optional[int] = None
    publish_type: str = "standalone"  # 'standalone' or 'course'

@router.get("/my-assessments")
async def list_my_assessments():
    try:
        data = await get_user_assessments(USER_ID)
        return data
    except Exception as e:
        logger.error(f"List assessments error: {e}")
        raise HTTPException(status_code=500, detail="Failed to fetch assessments")

@router.get("/my-assessments/{assessment_id}")
async def get_my_assessment(assessment_id: int, assessment_type: str = "published"):
    """Get a specific assessment for editing."""
    import json
    from api.utils.db import execute_db_operation
    from api.config import assessment_v3_published_table_name
    try:
        if assessment_type == "draft":
            from api.db.assessment_v3 import get_assessment_draft
            data = await get_assessment_draft(USER_ID)
            return data or {}
        else:
            query = f"SELECT id, title, config, questions, course_id, milestone_id, task_id, share_token, status, version, created_at, updated_at FROM {assessment_v3_published_table_name} WHERE id = ? AND user_id = ?"
            row = await execute_db_operation(query, (assessment_id, USER_ID), fetch_one=True)
            if not row:
                raise HTTPException(status_code=404, detail="Assessment not found")
            return {
                "id": row[0], "title": row[1],
                "config": json.loads(row[2]) if row[2] else {},
                "questions": json.loads(row[3]) if row[3] else [],
                "course_id": row[4], "milestone_id": row[5],
                "task_id": row[6], "share_token": row[7],
                "status": row[8], "version": row[9],
                "created_at": row[10], "updated_at": row[11]
            }
    except HTTPException:
        raise
    except Exception as e:
        logger.error(f"Get assessment error: {e}")
        raise HTTPException(status_code=500, detail="Failed to fetch assessment")

class UpdateAssessmentRequest(BaseModel):
    model_config = {"protected_namespaces": ()}
    title: Optional[str] = None
    questions: Optional[list] = None

@router.put("/my-assessments/{assessment_id}")
async def update_my_assessment(assessment_id: int, request: UpdateAssessmentRequest):
    """Update a published assessment's title and/or questions."""
    import json
    from api.utils.db import get_new_db_connection
    from api.config import assessment_v3_published_table_name
    try:
        async with get_new_db_connection() as conn:
            cursor = await conn.cursor()
            updates = []
            params = []
            if request.title is not None:
                updates.append("title = ?")
                params.append(request.title)
            if request.questions is not None:
                updates.append("questions = ?")
                params.append(json.dumps(request.questions))
            if not updates:
                raise HTTPException(status_code=400, detail="No updates provided")
            updates.append("updated_at = CURRENT_TIMESTAMP")
            query = f"UPDATE {assessment_v3_published_table_name} SET {', '.join(updates)} WHERE id = ? AND user_id = ?"
            params.extend([assessment_id, USER_ID])
            await cursor.execute(query, params)
            await conn.commit()
        return {"success": True}
    except HTTPException:
        raise
    except Exception as e:
        logger.error(f"Update assessment error: {e}")
        raise HTTPException(status_code=500, detail="Failed to update assessment")

@router.delete("/my-assessments/{assessment_id}")
async def delete_my_assessment(assessment_id: int):
    """Soft-delete a published assessment."""
    from api.utils.db import get_new_db_connection
    from api.config import assessment_v3_published_table_name
    try:
        async with get_new_db_connection() as conn:
            cursor = await conn.cursor()
            await cursor.execute(
                f"UPDATE {assessment_v3_published_table_name} SET deleted_at = CURRENT_TIMESTAMP WHERE id = ? AND user_id = ?",
                (assessment_id, USER_ID)
            )
            await conn.commit()
        return {"success": True}
    except Exception as e:
        logger.error(f"Delete assessment error: {e}")
        raise HTTPException(status_code=500, detail="Failed to delete assessment")

@router.get("/available-courses")
async def list_available_courses():
    try:
        courses = await get_all_courses_for_org(1)
        enriched_courses = []
        for c in courses:
            details = await get_course(c["id"], only_published=False)
            if details:
                enriched_courses.append({
                    "id": c["id"],
                    "name": c["name"],
                    "milestones": [{"id": m["id"], "name": m["name"]} for m in details.get("milestones", [])]
                })
        return enriched_courses
    except Exception as e:
        logger.error(f"List courses error: {e}")
        raise HTTPException(status_code=500, detail="Failed to fetch courses")

@router.post("/publish")
async def publish_flow(request: PublishRequest):
    try:
        # For 'course' publish type, course_id and milestone_id are required
        if request.publish_type == "course" and (not request.course_id or not request.milestone_id):
            raise HTTPException(status_code=400, detail="course_id and milestone_id are required for course publishing")

        result = await publish_assessment(
            user_id=USER_ID,
            data={
                "title": request.title,
                "config": request.config,
                "questions": request.questions  # already raw list
            },
            course_id=request.course_id if request.publish_type == "course" else None,
            milestone_id=request.milestone_id if request.publish_type == "course" else None
        )
        if not result:
            raise HTTPException(status_code=500, detail="Failed to publish assessment")
            
        # Clear draft after successful publish
        try:
            await delete_assessment_draft(USER_ID)
        except Exception:
            pass  # Non-critical
        
        return result
    except HTTPException:
        raise
    except Exception as e:
        logger.error(f"Publish flow error: {e}\n{traceback.format_exc()}")
        raise HTTPException(status_code=500, detail=str(e))

@router.post("/publish-to-course/{assessment_id}")
async def publish_published_to_course(assessment_id: int, request: PublishRequest):
    """Link an already-saved assessment to a course."""
    import json
    from api.utils.db import get_new_db_connection, execute_db_operation
    from api.config import assessment_v3_published_table_name
    try:
        # Fetch assessment
        query = f"SELECT title, config, questions FROM {assessment_v3_published_table_name} WHERE id = ? AND user_id = ?"
        row = await execute_db_operation(query, (assessment_id, USER_ID), fetch_one=True)
        if not row:
            raise HTTPException(status_code=404, detail="Assessment not found")
        
        questions = json.loads(row[2]) if row[2] else []
        config = json.loads(row[1]) if row[1] else {}
        title = request.title or row[0]

        if not request.course_id or not request.milestone_id:
            raise HTTPException(status_code=400, detail="course_id and milestone_id are required")

        from api.db.assessment_v3 import publish_assessment as _publish
        result = await _publish(
            user_id=USER_ID,
            data={"title": title, "config": config, "questions": questions},
            course_id=request.course_id,
            milestone_id=request.milestone_id
        )
        if not result:
            raise HTTPException(status_code=500, detail="Failed to link assessment to course")

        # Update the existing record with task_id and course linkage
        async with get_new_db_connection() as conn:
            cursor = await conn.cursor()
            await cursor.execute(
                f"UPDATE {assessment_v3_published_table_name} SET course_id = ?, milestone_id = ?, task_id = ?, updated_at = CURRENT_TIMESTAMP WHERE id = ? AND user_id = ?",
                (request.course_id, request.milestone_id, result.get("task_id"), assessment_id, USER_ID)
            )
            await conn.commit()
        return result
    except HTTPException:
        raise
    except Exception as e:
        logger.error(f"Publish to course error: {e}\n{traceback.format_exc()}")
        raise HTTPException(status_code=500, detail=str(e))

@router.post("/my-assessments/{assessment_id}/toggle-publish")
async def toggle_publish_status(assessment_id: int):
    """Toggle the published/unpublished status of a standalone assessment."""
    from api.utils.db import get_new_db_connection, execute_db_operation
    from api.config import assessment_v3_published_table_name
    try:
        # Get current status
        row = await execute_db_operation(
            f"SELECT status FROM {assessment_v3_published_table_name} WHERE id = ? AND user_id = ?",
            (assessment_id, USER_ID),
            fetch_one=True
        )
        if not row:
            raise HTTPException(status_code=404, detail="Assessment not found")
        
        current_status = row[0]
        new_status = "unpublished" if current_status == "published" else "published"
        
        async with get_new_db_connection() as conn:
            cursor = await conn.cursor()
            await cursor.execute(
                f"UPDATE {assessment_v3_published_table_name} SET status = ?, updated_at = CURRENT_TIMESTAMP WHERE id = ? AND user_id = ?",
                (new_status, assessment_id, USER_ID)
            )
            await conn.commit()
        
        return {"id": assessment_id, "status": new_status}
    except HTTPException:
        raise
    except Exception as e:
        logger.error(f"Toggle publish error: {e}")
        raise HTTPException(status_code=500, detail=str(e))

@router.get("/my-assessments/{assessment_id}/preview")
async def get_assessment_preview(assessment_id: int):
    """Get full assessment data for preview page."""
    import json
    from api.utils.db import execute_db_operation
    from api.config import assessment_v3_published_table_name
    try:
        query = f"""
            SELECT id, title, config, questions, course_id, milestone_id, task_id, 
                   share_token, status, version, created_at, updated_at
            FROM {assessment_v3_published_table_name}
            WHERE id = ? AND user_id = ? AND deleted_at IS NULL
        """
        row = await execute_db_operation(query, (assessment_id, USER_ID), fetch_one=True)
        if not row:
            raise HTTPException(status_code=404, detail="Assessment not found")
        
        config = json.loads(row[2]) if row[2] else {}
        questions = json.loads(row[3]) if row[3] else []
        
        # If linked to a course, also get the org_id for navigation
        org_id = None
        if row[4]:  # course_id
            from api.db.utils import get_org_id_for_course
            org_id = await get_org_id_for_course(row[4])
        
        return {
            "id": row[0],
            "title": row[1],
            "config": config,
            "questions": questions,
            "course_id": row[4],
            "milestone_id": row[5],
            "task_id": row[6],
            "share_token": row[7],
            "status": row[8],
            "version": row[9],
            "created_at": row[10],
            "updated_at": row[11],
            "org_id": org_id
        }
    except HTTPException:
        raise
    except Exception as e:
        logger.error(f"Preview error: {e}")
        raise HTTPException(status_code=500, detail=str(e))

