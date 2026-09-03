import asyncio

from app.ai.chatbot import answer_question
from app.ai.embeddings import embed_text
from app.core.database import AsyncSessionLocal


async def main():
    questions = [
        # Should hit FAQ tier
        "how do i apply",
        # Should hit real RAG tier -- open-ended, avoids every FAQ keyword
        # (apply/match/score/percentage/resume/certificate/badge/github/
        # skill/missing/gap) but is squarely covered by a seeded snippet
        "i just signed up, why do the internships shown to me feel random",
        "should i pick a remote internship or an on site one",
    ]
    async with AsyncSessionLocal() as db:
        for q in questions:
            emb = embed_text(q)
            result = await answer_question(q, question_embedding=emb, db=db)
            print("=" * 60)
            print("Q:", q)
            print("SOURCE:", result["source"])
            print("ANSWER:", result["answer"])


asyncio.run(main())
