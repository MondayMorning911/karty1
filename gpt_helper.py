#!/usr/bin/env python3
"""
GPT Helper — вызывается MiMo когда застрял.
Использование:
  echo "вопрос" | python3 gpt_helper.py
  python3 gpt_helper.py "вопрос"
  python3 gpt_helper.py --file code.py "что не так?"
"""

import sys
import json
import urllib.request
import urllib.error
import os

GITHUB_TOKEN = os.getenv("GITHUB_TOKEN", "")
ENDPOINT = "https://models.inference.ai.azure.com/chat/completions"
MODEL = "gpt-4o"

SYSTEM_PROMPT = """Ты опытный Python разработчик.
Помогаешь с проектом автоматической публикации объявлений недвижимости на грузинских сайтах.
Стек: Python, Playwright, Camoufox, Browser Use.
Сайты: ss.ge, myhome.ge, korter.ge, realting.com
Отвечай конкретно и кратко. Давай готовый код."""


def ask_gpt(question: str, code: str = None) -> str:
    content = question
    if code:
        content += f"\n\nКод:\n```python\n{code}\n```"

    data = json.dumps({
        "model": MODEL,
        "messages": [
            {"role": "system", "content": SYSTEM_PROMPT},
            {"role": "user", "content": content}
        ],
        "max_tokens": 2000,
        "temperature": 0.3
    }).encode("utf-8")

    req = urllib.request.Request(
        ENDPOINT,
        data=data,
        headers={
            "Content-Type": "application/json",
            "Authorization": f"Bearer {GITHUB_TOKEN}"
        }
    )

    try:
        with urllib.request.urlopen(req, timeout=30) as r:
            result = json.loads(r.read())
            return result["choices"][0]["message"]["content"]
    except urllib.error.HTTPError as e:
        body = e.read().decode()
        return f"❌ HTTP Error {e.code}: {body}"
    except Exception as e:
        return f"❌ Error: {e}"


def main():
    code = None
    question = None

    args = sys.argv[1:]

    # --file path.py "вопрос"
    if args and args[0] == "--file" and len(args) >= 2:
        file_path = args[1]
        question = args[2] if len(args) > 2 else "Что не так с этим кодом?"
        try:
            with open(file_path, "r") as f:
                code = f.read()
        except FileNotFoundError:
            print(f"❌ Файл не найден: {file_path}")
            sys.exit(1)

    # python3 gpt_helper.py "вопрос"
    elif args:
        question = " ".join(args)

    # echo "вопрос" | python3 gpt_helper.py
    elif not sys.stdin.isatty():
        question = sys.stdin.read().strip()

    else:
        print("Использование:")
        print('  echo "вопрос" | python3 gpt_helper.py')
        print('  python3 gpt_helper.py "вопрос"')
        print('  python3 gpt_helper.py --file code.py "что не так?"')
        sys.exit(0)

    if not question:
        print("❌ Пустой вопрос")
        sys.exit(1)

    print(ask_gpt(question, code))


if __name__ == "__main__":
    main()
