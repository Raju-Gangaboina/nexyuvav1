import asyncio, json
from app.ai.resume_parser import extract_text, extract_skills_confirmed
from app.ai.ats_analyzer import analyze_resume_ats

async def main():
    text = extract_text("test_resume.pdf")
    confirmed = [s["name"] for s in extract_skills_confirmed(text)]
    print("CONFIRMED_SKILLS:", confirmed)
    result = await analyze_resume_ats(
        text=text,
        resume_path="test_resume.pdf",
        confirmed_skill_names=confirmed,
        required_skills=["python", "docker", "kubernetes", "aws", "graphql"],
    )
    print("AI_REVIEWED:", result["ai_reviewed"])
    print("OVERALL_SCORE:", result["overall_score"])
    print("CATEGORY_SCORES:", result["category_scores"])
    print("KEYWORD_GAP:", result["keyword_gap"])
    print("NUM_CHECKS:", len(result["checks"]))
    print("GENUINE_MISTAKES:")
    print(json.dumps(result["genuine_mistakes"], indent=2))

asyncio.run(main())
