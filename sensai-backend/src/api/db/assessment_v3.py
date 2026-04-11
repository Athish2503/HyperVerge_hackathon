import json
from datetime import datetime
from api.utils.db import get_new_db_connection, execute_db_operation
from api.config import assessment_v3_drafts_table_name, assessment_v3_published_table_name, tasks_table_name
from api.db.task import create_draft_task_for_course, update_draft_quiz
from api.models import TaskType, TaskStatus
import uuid

async def save_assessment_draft(user_id: int, data: dict):
    """Save or update an assessment draft."""
    async with get_new_db_connection() as conn:
        cursor = await conn.cursor()
        
        # Check if draft exists for user
        await cursor.execute(
            f"SELECT id FROM {assessment_v3_drafts_table_name} WHERE user_id = ? AND deleted_at IS NULL",
            (user_id,)
        )
        existing = await cursor.fetchone()
        
        if existing:
            query = f"""
                UPDATE {assessment_v3_drafts_table_name}
                SET curriculum_text = ?, modules = ?, skills = ?, config = ?, questions = ?, current_step = ?, updated_at = CURRENT_TIMESTAMP
                WHERE user_id = ? AND id = ?
            """
            await cursor.execute(query, (
                data.get("curriculum_text"),
                json.dumps(data.get("modules")),
                json.dumps(data.get("skills")),
                json.dumps(data.get("config")),
                json.dumps(data.get("questions")),
                data.get("current_step", 1),
                user_id,
                existing[0]
            ))
        else:
            query = f"""
                INSERT INTO {assessment_v3_drafts_table_name} 
                (user_id, curriculum_text, modules, skills, config, questions, current_step)
                VALUES (?, ?, ?, ?, ?, ?, ?)
            """
            await cursor.execute(query, (
                user_id,
                data.get("curriculum_text"),
                json.dumps(data.get("modules")),
                json.dumps(data.get("skills")),
                json.dumps(data.get("config")),
                json.dumps(data.get("questions")),
                data.get("current_step", 1)
            ))
            
        await conn.commit()
        return True

async def get_assessment_draft(user_id: int):
    """Retrieve an assessment draft."""
    query = f"""
        SELECT curriculum_text, modules, skills, config, questions, current_step
        FROM {assessment_v3_drafts_table_name}
        WHERE user_id = ? AND deleted_at IS NULL
        ORDER BY updated_at DESC LIMIT 1
    """
    row = await execute_db_operation(query, (user_id,), fetch_one=True)
    if not row:
        return None
    
    return {
        "curriculum_text": row[0],
        "modules": json.loads(row[1]) if row[1] else [],
        "skills": json.loads(row[2]) if row[2] else [],
        "config": json.loads(row[3]) if row[3] else {},
        "questions": json.loads(row[4]) if row[4] else [],
        "current_step": row[5]
    }

async def delete_assessment_draft(user_id: int):
    """Soft delete the assessment draft."""
    query = f"UPDATE {assessment_v3_drafts_table_name} SET deleted_at = CURRENT_TIMESTAMP WHERE user_id = ? AND deleted_at IS NULL"
    await execute_db_operation(query, (user_id,))
    return True

async def get_user_assessments(user_id: int):
    """Fetch all assessments (drafts and published) for a user."""
    # Get Drafts
    drafts_query = f"""
        SELECT id, 'draft' as status, config, questions, created_at, updated_at
        FROM {assessment_v3_drafts_table_name}
        WHERE user_id = ? AND deleted_at IS NULL
    """
    drafts = await execute_db_operation(drafts_query, (user_id,), fetch_all=True)
    
    # Get Published
    published_query = f"""
        SELECT id, status, config, questions, created_at, updated_at, title, version, course_id, milestone_id, task_id, share_token
        FROM {assessment_v3_published_table_name}
        WHERE user_id = ? AND deleted_at IS NULL
        ORDER BY created_at DESC
    """
    published = await execute_db_operation(published_query, (user_id,), fetch_all=True)
    
    results = []
    
    for d in drafts:
        results.append({
            "id": d[0],
            "type": "draft",
            "status": d[1],
            "title": json.loads(d[2]).get("course_name", "Untitled Assessment") if d[2] else "Untitled Draft",
            "questions_count": len(json.loads(d[3])) if d[3] else 0,
            "created_at": d[4],
            "updated_at": d[5]
        })
        
    for p in published:
        org_id = None
        if p[8]: # course_id
            from api.db.utils import get_org_id_for_course
            org_id = await get_org_id_for_course(p[8])
            
        results.append({
            "id": p[0],
            "type": "published",
            "status": p[1],
            "title": p[6],
            "version": p[7],
            "course_id": p[8],
            "milestone_id": p[9],
            "task_id": p[10],
            "share_token": p[11],
            "questions_count": len(json.loads(p[3])) if p[3] else 0,
            "created_at": p[4],
            "updated_at": p[5],
            "org_id": org_id
        })
        
    return results

async def publish_assessment(user_id: int, data: dict, course_id: int = None, milestone_id: int = None):
    """Publish an assessment. Optionally link to a course/milestone."""
    try:
        title = data.get("title", "Assessment")
        config = data.get("config", {})
        questions = data.get("questions", [])
        
        task_id = None
        if course_id and milestone_id:
            # INTEGRATION: Create a legacy Quiz Task
            task_id, _ = await create_draft_task_for_course(
                title=title,
                type=TaskType.QUIZ,
                course_id=course_id,
                milestone_id=milestone_id
            )
            
            # Map V3 questions to Legacy format
            # Legacy expects: question_text, options, answer, explanation
            # We map: question_text -> blocks (Text Block), options -> options, etc.
            legacy_questions = []
            for q in questions:
                # Basic mapping
                legacy_q = {
                    "title": q.get("question_text", "Question"),
                    "type": "MCQ" if q.get("type") == "MCQ" else "SAQ",
                    "blocks": [{"id": str(uuid.uuid4()), "type": "text", "content": q.get("question_text")}],
                    "options": q.get("options", []),
                    "answer": [q.get("answer")] if q.get("answer") else [],
                    "explanation": q.get("explanation", ""),
                    "input_type": "radio" if q.get("type") == "MCQ" else "text",
                    "response_type": "text",
                    "max_attempts": 3,
                    "is_feedback_shown": True
                }
                legacy_questions.append(legacy_q)
                
            # Update the draft quiz and set to published
            await update_draft_quiz(
                task_id=task_id,
                title=title,
                questions=legacy_questions,
                scheduled_publish_at=None,
                status=TaskStatus.PUBLISHED
            )
        
        # Save to published_assessments_v3
        share_token = str(uuid.uuid4())
        query = f"""
            INSERT INTO {assessment_v3_published_table_name}
            (user_id, title, config, questions, course_id, milestone_id, task_id, share_token)
            VALUES (?, ?, ?, ?, ?, ?, ?, ?)
        """
        async with get_new_db_connection() as conn:
            cursor = await conn.cursor()
            await cursor.execute(query, (
                user_id,
                title,
                json.dumps(config),
                json.dumps(questions),
                course_id,
                milestone_id,
                task_id,
                share_token
            ))
            new_id = cursor.lastrowid
            await conn.commit()
            
        return {"id": new_id, "task_id": task_id, "share_token": share_token}
    except Exception as e:
        import traceback
        print(f"Publish Error: {e}\n{traceback.format_exc()}")
        return None
