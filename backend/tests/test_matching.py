from app.data_utils import load_jobs_list
from app.services.matching import local_filters, rank_jobs, skill_key


def test_controlled_aliases_do_not_conflate_distinct_skills():
    assert skill_key("nextjs") == skill_key("Next.js")
    assert skill_key("pytorch") == skill_key("PyTorch")
    assert skill_key("large language models") == skill_key("LLMs")
    assert skill_key("Java") != skill_key("JavaScript")


def test_fit_is_nullable_without_skills_and_normalized_when_complete():
    job = load_jobs_list()[0]
    assert rank_jobs([job], {}, {})[0]["score"] is None
    skills = job["must_have_skills"] + job["nice_to_have_skills"]
    assert rank_jobs([job], {"skills": skills}, {})[0]["score"] == 100
    assert rank_jobs([job], {"skills": ["Unrelated"]}, {})[0]["score"] == 0


def test_explicit_filters_are_constraints_and_never_fall_back_to_every_job():
    jobs = load_jobs_list()
    assert rank_jobs(jobs, {}, {"location": "Antarctica"}) == []
    found = rank_jobs(jobs, {}, {"work_mode": "Remote", "seniority": "Senior"})
    assert found and all(x["job"]["work_mode"] == "Remote" for x in found)
    assert all(x["job"]["seniority"] == "Senior" for x in found)


def test_query_relevance_precedes_profile_fit_and_unknown_query_is_empty():
    jobs = load_jobs_list()
    filters = local_filters("NLP engineer in Singapore, hybrid", jobs)
    found = rank_jobs(jobs, {"skills": ["Python", "LLMs", "RAG", "PyTorch"]}, filters)
    assert found[0]["job"]["id"] == "job-002"
    assert rank_jobs(jobs, {}, local_filters("underwater basket weaver", jobs)) == []


def test_local_fallback_understands_aliases_and_explicit_location():
    jobs = load_jobs_list()
    filters = local_filters("Remote senior ML engineer in healthcare, APAC", jobs)
    assert filters["work_mode"] == "Remote"
    assert filters["seniority"] == "Senior"
    assert filters["location"] == "APAC"
    assert "machine learning" in filters["role_keywords"]
