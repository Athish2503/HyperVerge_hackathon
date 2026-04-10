import json
from datetime import datetime
from api.utils.db import get_new_db_connection, execute_db_operation
from api.config import assessment_v3_drafts_table_name

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
