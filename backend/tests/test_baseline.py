import ast
from pathlib import Path

from app.data_utils import load_jobs_dict, load_jobs_list


def test_catalog_has_unique_ids_and_consistent_contract():
    jobs = load_jobs_list()
    assert len(jobs) == 10
    assert len(load_jobs_dict()) == len(jobs)
    required = {"id", "title", "company", "must_have_skills", "description"}
    assert all(required <= job.keys() for job in jobs)


def test_backend_source_is_valid_python():
    for source in Path("app").rglob("*.py"):
        ast.parse(source.read_text(encoding="utf-8"), filename=str(source))
