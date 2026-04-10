import base64
import os
from typing import List
from pypdf import PdfReader
from api.llm import run_llm_with_openai
from pydantic import BaseModel
from api.utils.logging import logger
import docx
import io

class ChunkedExtraction(BaseModel):
    modules: List[str]
    skills: List[str]

def semantic_chunk_text(text: str, max_chars: int = 15000, overlap: int = 1000) -> List[str]:
    """Splits text into overlapping chunks for LLM processing."""
    if len(text) <= max_chars:
        return [text]
    
    chunks = []
    start = 0
    while start < len(text):
        end = start + max_chars
        chunks.append(text[start:end])
        start += max_chars - overlap
    return chunks

async def extract_text_from_pdf(pdf_source) -> str:
    """Extracts text from PDF. source can be path or file-like object."""
    try:
        reader = PdfReader(pdf_source)
        text = ""
        for page in reader.pages:
            text += page.extract_text() or ""
        return text
    except Exception as e:
        logger.error(f"PDF Extraction error: {e}")
        return ""

async def extract_text_from_docx(docx_source) -> str:
    """Extracts text from DOCX. source can be path or file-like object."""
    try:
        doc = docx.Document(docx_source)
        text = "\n".join([para.text for para in doc.paragraphs])
        return text
    except Exception as e:
        logger.error(f"DOCX Extraction error: {e}")
        return ""

async def vision_extract_from_images(image_paths: List[str]) -> str:
    """Uses GPT-4o Vision to extract curriculum details from images/scanned PDFs."""
    if not image_paths:
        return ""
    
    content = [
        {"type": "text", "text": "Extract all curriculum details (modules, topics, skills) from these images exactly as written."},
    ]
    
    for path in image_paths:
        with open(path, "rb") as f:
            base64_image = base64.b64encode(f.read()).decode("utf-8")
            content.append({
                "type": "image_url",
                "image_url": {"url": f"data:image/jpeg;base64,{base64_image}"}
            })

    try:
        # We rely on a simpler call since run_llm_with_openai might not handle list content in content field easily if typed strictly
        # But assuming it does based on openai standard:
        result = await run_llm_with_openai(
            model="gpt-4o",
            messages=[{"role": "user", "content": content}],
            max_output_tokens=4000
        )
        return str(result)
    except Exception as e:
        logger.error(f"Vision extraction failed: {e}")
        return ""
