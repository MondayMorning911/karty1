import base64, json, os, time, logging
from google import genai

log = logging.getLogger("checker")

def check_screenshot(screenshot_path: str, context: str, max_retries: int = 5) -> dict:
    """Analyze screenshot with Gemini, returns dict with status, reason, next_action."""
    client = genai.Client(api_key=os.environ.get("GEMINI_API_KEY",""))
    
    with open(screenshot_path, "rb") as f:
        img = f.read()
    
    prompt = f"""Это скриншот из автоматической публикации объявления недвижимости. Контекст: {context}

Проанализируй скриншот и ответь СТРОГО валидным JSON (без markdown):
{{"status": "success"|"error"|"warning"|"unknown",
  "reason": "что видно на экране — напиши по-русски кратко",
  "next_action": "continue"|"retry"|"click_button"|"skip"|"stop",
  "button_text": "текст кнопки которую нужно нажать (если next_action=click_button)"}}"""
    
    for attempt in range(max_retries):
        try:
            resp = client.models.generate_content(
                model="gemini-2.0-flash",
                contents=[prompt, {"inline_data": {"mime_type": "image/png", "data": img}}]
            )
            text = resp.text.strip()
            # Extract JSON from response
            if "```json" in text:
                text = text.split("```json")[1].split("```")[0]
            elif "```" in text:
                text = text.split("```")[1].split("```")[0]
            result = json.loads(text)
            log.info(f"Gemini: {result.get('status')} - {result.get('reason','')[:100]}")
            return result
        except Exception as e:
            err = str(e)
            if "429" in err or "RESOURCE_EXHAUSTED" in err or "quota" in err.lower():
                wait = min(5 * (2 ** attempt), 60)
                log.warning(f"Gemini quota, retry {attempt+1}/{max_retries} in {wait}s")
                time.sleep(wait)
                continue
            log.error(f"Gemini error: {err[:150]}")
            if attempt > 1:
                return {"status": "unknown", "reason": f"Gemini error: {err[:100]}", "next_action": "continue"}
            time.sleep(2)
    
    return {"status": "unknown", "reason": "Gemini quota exhausted", "next_action": "continue"}
