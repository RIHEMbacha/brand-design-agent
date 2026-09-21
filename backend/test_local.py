"""
Minimal manual smoke test.

Run:
    python test_local.py
"""

from app.llm import get_llm

llm = get_llm()
response = llm.invoke(
    "Return only one sentence explaining what a design token is."
)
print(response.content)
