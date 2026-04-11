import sqlite3
import json
import uuid
import os

# Path to DB
# Based on config.py: D:\Sensai\sensai-backend\src\db\db.sqlite
db_path = "D:/Sensai/sensai-backend/src/db/db.sqlite"

def seed():
    conn = sqlite3.connect(db_path)
    cursor = conn.cursor()

    user_id = 123
    
    # Check if table exists
    cursor.execute("SELECT name FROM sqlite_master WHERE type='table' AND name='assessment_v3_published'")
    if not cursor.fetchone():
        print("Table assessment_v3_published does not exist. Run migration first.")
        return

    # Sample Data
    mock_assessments = [
        {
            "title": "Fullstack Engineering Lead Assessment",
            "config": {"mode": "recruiter", "skills": ["React", "Node.js", "System Design"], "seniority": "Senior"},
            "questions": [
                {"question_text": "How do you handle scaling a WebSocket server for 100k concurrent users?", "type": "SAQ", "skills_tested": ["System Design"], "answer": "Use a Pub/Sub layer like Redis...", "explanation": "Scalability requires decoupling..."},
                {"question_text": "What is the difference between useMemo and useCallback?", "type": "MCQ", "options": ["A", "B", "C", "D"], "answer": "A", "explanation": "useMemo memoizes values, useCallback memoizes functions."},
            ],
            "course_id": 1,
            "milestone_id": 1,
            "task_id": 501
        },
        {
            "title": "Advanced Python for Data Science",
            "config": {"mode": "educator", "skills": ["Python", "Pandas", "LLMs"], "seniority": "Intermediate"},
            "questions": [
                {"question_text": "Explain the Global Interpreter Lock (GIL) in Python.", "type": "SAQ", "skills_tested": ["Python"], "answer": "The GIL is a mutex...", "explanation": "It prevents multiple threads from executing Python bytecodes at once."},
            ],
            "course_id": None,
            "milestone_id": None,
            "task_id": None
        }
    ]

    for m in mock_assessments:
        # Check if already exists to avoid duplicates on multiple runs
        cursor.execute("SELECT id FROM assessment_v3_published WHERE title = ?", (m["title"],))
        if cursor.fetchone():
            continue

        cursor.execute("""
            INSERT INTO assessment_v3_published 
            (user_id, title, config, questions, course_id, milestone_id, task_id, share_token)
            VALUES (?, ?, ?, ?, ?, ?, ?, ?)
        """, (
            user_id,
            m["title"],
            json.dumps(m["config"]),
            json.dumps(m["questions"]),
            m["course_id"],
            m["milestone_id"],
            m.get("task_id"),
            str(uuid.uuid4())
        ))

    conn.commit()
    conn.close()
    print("Seed completed successfully.")

if __name__ == "__main__":
    seed()
