import json
import subprocess
import sys
from pathlib import Path

from app.services.gemini_client import GenerationError
from tools.evaluate_models import SYNTHETIC_RESUME, run_suite


class SyntheticProvider:
    def model_for(self, operation):
        return "synthetic-fake"

    def prompt_version(self, operation):
        return "test-v1"

    async def generate(self, operation, system, user, response_schema):
        if operation == "extraction":
            return response_schema(skills=["Python"])
        if operation == "search":
            return response_schema(skills=["JavaScript", "React"]) if "JS and React.js" in user else response_schema()
        if operation == "tailor":
            claim = "Built Python APIs that reduced latency by 20%."
            return response_schema(tailored_resume_md=f"# Experience\n{claim}", ats_keywords=["Python"],
                summary_rewrite="Python API developer.", source_excerpts=[{"claim": claim, "source_excerpt": claim}])
        if operation == "cover_letter":
            claim = "Built Python APIs that reduced latency by 20%."
            return response_schema(cover_letter=f"I am interested in this role. {claim}",
                source_excerpts=[{"claim": claim, "source_excerpt": claim}])
        if operation == "questions":
            categories = ["behavioral", "behavioral", "technical", "technical", "role-specific", "role-specific"]
            return response_schema(questions=[{"id": f"q{i}", "category": category,
                "question": f"Explain your approach to task {i}.", "what_we_look_for": "Specific evidence"}
                for i, category in enumerate(categories)])
        strong = "20%" in json.loads(user)["answer_source"]
        score = 8 if strong else 3
        return response_schema(score=score, strengths=["Relevant"], gaps=["Add evidence"],
            improved_answer_example="I improved an API. [Add your measured outcome].",
            rubric={"clarity": score, "specificity": score, "role_alignment": score, "technical_accuracy": None})


async def test_synthetic_evaluation_reports_checks_without_generated_or_candidate_content():
    result = await run_suite(SyntheticProvider())
    assert result["live"] is True
    assert result["passed"] is True and len(result["cases"]) == 9
    assert all(case["status"] == "passed" for case in result["cases"])
    text = json.dumps(result)
    assert SYNTHETIC_RESUME not in text and "candidate@example.invalid" not in text
    assert "Built Python APIs" not in text


async def test_model_failures_are_reported_as_sanitized_codes_and_do_not_stop_suite():
    class Failed(SyntheticProvider):
        async def generate(self, *args):
            raise GenerationError(429, "private details are never reported", "provider_quota", True)

    result = await run_suite(Failed())
    assert not result["passed"] and len(result["cases"]) == 9
    assert all(case["error_code"] == "provider_quota" for case in result["cases"])
    assert "private details" not in json.dumps(result)


def test_cli_requires_explicit_live_opt_in_before_loading_credentials_or_network():
    script = Path(__file__).resolve().parents[1] / "tools" / "evaluate_models.py"
    process = subprocess.run([sys.executable, str(script)], text=True, capture_output=True, timeout=10)
    assert process.returncode == 2
    assert "--live" in process.stderr
