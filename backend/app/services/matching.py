"""Deterministic catalog search and explainable skill coverage, with controlled aliases."""
import re
from typing import Any

ALIASES = {
    "nextjs": "next.js", "next js": "next.js",
    "reactjs": "react", "react.js": "react",
    "postgresql": "postgres", "postgre sql": "postgres",
    "pytorch": "pytorch", "torch": "pytorch",
    "large language model": "llms", "large language models": "llms", "llm": "llms",
    "retrieval augmented generation": "rag", "retrieval-augmented generation": "rag",
    "huggingface": "hugging face", "hf transformers": "hugging face",
    "amazon web services": "aws", "google cloud platform": "gcp",
    "fine tuning": "fine-tuning", "finetuning": "fine-tuning",
    "vector databases": "vector dbs", "vector database": "vector dbs",
    "rest api": "rest apis", "restful apis": "rest apis",
}
STOP_WORDS = set("a an the in at for with and or of to jobs job role roles looking want seeking focus i me my please".split())


def query_warnings(query: str, explicit: dict[str, Any]) -> list[str]:
    if re.search(r"\b(not|no|exclude|excluding|without|except)\b", query.casefold()):
        return ["These filters cannot represent exclusions. Rewrite the request positively and use the explicit filters."]
    modes = set(re.findall(r"\b(remote|hybrid|on-site|onsite)\b", query.casefold()))
    if len(modes) > 1 and not explicit.get("work_mode"):
        return ["These filters cannot represent multiple work modes. Choose one with the explicit work mode filter."]
    return []


def skill_key(value: str) -> str:
    key = " ".join(value.casefold().strip().split())
    return ALIASES.get(key, key)


def local_filters(query: str, jobs: list[dict[str, Any]]) -> dict[str, Any]:
    """Conservative fallback: constraints are extracted only when written in the query."""
    remaining = query.casefold()
    remaining = re.sub(r"\bml\b", "machine learning", remaining)
    filters: dict[str, Any] = {"role_keywords": [], "skills": [], "industries": [],
                               "location": "", "work_mode": "", "seniority": ""}
    for token, value in [("on-site", "On-site"), ("onsite", "On-site"), ("remote", "Remote"), ("hybrid", "Hybrid")]:
        if re.search(rf"\b{re.escape(token)}\b", remaining):
            filters["work_mode"] = value
            remaining = re.sub(rf"\b{re.escape(token)}\b", " ", remaining)
            break
    for token, value in [("mid-senior", "Mid-Senior"), ("internship", "Intern"), ("intern", "Intern"),
                         ("junior", "Junior"), ("senior", "Senior"), ("staff", "Staff"), ("mid", "Mid")]:
        if re.search(rf"\b{re.escape(token)}\b", remaining):
            filters["seniority"] = value
            remaining = re.sub(rf"\b{re.escape(token)}\b", " ", remaining)
            break
    locations = {"Singapore", "Jakarta", "Indonesia", "APAC"}
    locations.update(j["location"].split(",")[0] for j in jobs)
    for location in sorted(locations, key=len, reverse=True):
        if re.search(rf"\b{re.escape(location.casefold())}\b", remaining):
            filters["location"] = location
            remaining = re.sub(rf"\b{re.escape(location.casefold())}\b", " ", remaining)
            break
    # Unknown locations remain real constraints instead of broadening the catalog.
    unknown = re.search(r"\bin\s+([a-z][a-z ]+?)(?:[,;]|$)", remaining)
    if not filters["location"] and unknown:
        filters["location"] = unknown.group(1).strip().title()
        remaining = remaining[:unknown.start()] + remaining[unknown.end():]
    catalog_skills = {s for job in jobs for s in job["must_have_skills"] + job["nice_to_have_skills"]}
    candidates = {s.casefold(): s for s in catalog_skills}
    canonical = {skill_key(s): s for s in catalog_skills}
    candidates.update({alias: canonical[key] for alias, key in ALIASES.items() if key in canonical})
    for token, value in sorted(candidates.items(), key=lambda pair: len(pair[0]), reverse=True):
        if re.search(rf"(?<!\w){re.escape(token)}(?!\w)", remaining):
            filters["skills"].append(value)
            remaining = re.sub(rf"(?<!\w){re.escape(token)}(?!\w)", " ", remaining)
    tokens = [x for x in re.findall(r"[a-z][a-z0-9.+-]*", remaining) if x not in STOP_WORDS]
    if "machine" in tokens and "learning" in tokens:
        tokens = [x for x in tokens if x not in {"machine", "learning"}] + ["machine learning"]
    filters["role_keywords"] = list(dict.fromkeys(tokens))
    filters["skills"] = list(dict.fromkeys(filters["skills"]))
    return filters


def profile_fit(profile: dict[str, Any], job: dict[str, Any]) -> tuple[int | None, list[str], list[str], str]:
    skills = {skill_key(s) for s in profile.get("skills", []) if s.strip()}
    must = job.get("must_have_skills", [])
    nice = job.get("nice_to_have_skills", [])
    matched = [s for s in must if skill_key(s) in skills]
    missing = [s for s in must if skill_key(s) not in skills]
    matched_nice = [s for s in nice if skill_key(s) in skills]
    if not skills:
        return None, [], missing, "Add skills to calculate fit."
    available_weight = (70 if must else 0) + (20 if nice else 0)
    coverage = (70 * len(matched) / len(must) if must else 0) + (20 * len(matched_nice) / len(nice) if nice else 0)
    score = round(100 * coverage / available_weight) if available_weight else 0
    reason = f"Matches {len(matched)}/{len(must)} required skills"
    if missing:
        reason += f"; gaps: {', '.join(missing[:3])}"
    return score, matched + matched_nice, missing, reason + "."


def rank_jobs(jobs: list[dict[str, Any]], profile: dict[str, Any], filters: dict[str, Any]) -> list[dict[str, Any]]:
    ranked = []
    for job in jobs:
        if any(filters.get(key) and filters[key].casefold() not in job[key].casefold()
               for key in ("location", "work_mode", "seniority")):
            continue
        # Senior does not silently include Mid-Senior.
        if filters.get("seniority") and filters["seniority"].casefold() != job["seniority"].casefold():
            continue
        title = job["title"].casefold()
        haystack = " ".join([title, job["description"], *job["must_have_skills"], *job["nice_to_have_skills"]]).casefold()
        role = [x.casefold() for x in filters.get("role_keywords", []) if x.strip()]
        industries = [x.casefold() for x in filters.get("industries", []) if x.strip()]
        required_skills = {skill_key(x) for x in filters.get("skills", [])}
        job_skills = {skill_key(x) for x in job["must_have_skills"] + job["nice_to_have_skills"]}
        if not all(x in haystack for x in role + industries) or not required_skills.issubset(job_skills):
            continue
        relevance = sum(3 if x in title else 1 for x in role) + len(required_skills)
        score, matched, missing, reason = profile_fit(profile, job)
        ranked.append({"job": job, "score": score, "matched_skills": matched,
                       "missing_skills": missing, "reason": reason, "relevance": relevance})
    ranked.sort(key=lambda x: (-x["relevance"], -(x["score"] or 0), x["job"]["id"]))
    return ranked
