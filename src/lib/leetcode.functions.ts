import { createServerFn } from "@tanstack/react-start";
import { z } from "zod";

const inputSchema = z.object({
  slug: z
    .string()
    .min(1)
    .max(200)
    .regex(/^[a-z0-9-]+$/i, "Invalid slug"),
});

export type LeetCodeQuestion = {
  number: number | null;
  title: string | null;
  difficulty: string | null;
  topicTags: string[];
};

const GQL = `query questionData($titleSlug: String!) {
  question(titleSlug: $titleSlug) {
    questionFrontendId
    title
    difficulty
    topicTags { name }
  }
}`;

export const fetchLeetCodeQuestion = createServerFn({ method: "POST" })
  .inputValidator((data: unknown) => inputSchema.parse(data))
  .handler(async ({ data }): Promise<LeetCodeQuestion> => {
    const res = await fetch("https://leetcode.com/graphql", {
      method: "POST",
      headers: {
        "Content-Type": "application/json",
        Referer: "https://leetcode.com",
        "User-Agent":
          "Mozilla/5.0 (compatible; LeetCodeTracker/1.0; +https://lovable.dev)",
      },
      body: JSON.stringify({
        query: GQL,
        variables: { titleSlug: data.slug },
        operationName: "questionData",
      }),
    });
    if (!res.ok) {
      throw new Error(`LeetCode responded ${res.status}`);
    }
    const json = (await res.json()) as {
      data?: {
        question?: {
          questionFrontendId?: string | null;
          title?: string | null;
          difficulty?: string | null;
          topicTags?: Array<{ name: string }> | null;
        } | null;
      };
      errors?: Array<{ message: string }>;
    };
    if (json.errors?.length) {
      throw new Error(json.errors[0].message || "LeetCode error");
    }
    const q = json.data?.question;
    if (!q) throw new Error("Problem not found");
    const num = q.questionFrontendId ? Number(q.questionFrontendId) : null;
    return {
      number: Number.isFinite(num) ? (num as number) : null,
      title: q.title ?? null,
      difficulty: q.difficulty ?? null,
      topicTags: (q.topicTags ?? []).map((t) => t.name).filter(Boolean),
    };
  });
