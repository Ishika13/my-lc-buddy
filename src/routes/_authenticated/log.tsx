import { createFileRoute, Link, useNavigate, useRouter } from "@tanstack/react-router";
import { useEffect, useMemo, useState } from "react";
import { z } from "zod";
import { supabase } from "@/integrations/supabase/client";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";
import { toast } from "sonner";
import {
  computeNextDue,
  deriveSlug,
  nextBoxLevel,
  todayLocalISO,
} from "@/lib/leitner";

const searchSchema = z.object({
  problem_id: z.string().uuid().optional(),
});

export const Route = createFileRoute("/_authenticated/log")({
  head: () => ({
    meta: [
      { title: "Log a solve — LeetCode Tracker" },
      { name: "description", content: "Record a solved problem and update its review schedule." },
    ],
  }),
  validateSearch: (search) => searchSchema.parse(search),
  component: LogSolve,
});

type ExistingProblem = {
  id: string;
  title: string | null;
  lc_url: string | null;
  lc_slug: string | null;
  topic_tags: string[] | null;
  box_level: number;
};

function LogSolve() {
  const { user } = Route.useRouteContext();
  const { problem_id } = Route.useSearch();
  const navigate = useNavigate();
  const router = useRouter();

  const [loadingPrefill, setLoadingPrefill] = useState<boolean>(!!problem_id);
  const [existing, setExisting] = useState<ExistingProblem | null>(null);
  const [url, setUrl] = useState("");
  const [title, setTitle] = useState("");
  const [topics, setTopics] = useState("");
  const [rating, setRating] = useState<number | null>(null);
  const [submitting, setSubmitting] = useState(false);

  useEffect(() => {
    if (!problem_id) return;
    let cancelled = false;
    supabase
      .from("problems")
      .select("id, title, lc_url, lc_slug, topic_tags, box_level")
      .eq("id", problem_id)
      .maybeSingle()
      .then(({ data, error }) => {
        if (cancelled) return;
        setLoadingPrefill(false);
        if (error) {
          toast.error(error.message);
          return;
        }
        if (data) {
          setExisting(data);
          setUrl(data.lc_url ?? "");
          setTitle(data.title ?? "");
          setTopics((data.topic_tags ?? []).join(", "));
        }
      });
    return () => {
      cancelled = true;
    };
  }, [problem_id]);

  const parsedTopics = useMemo(
    () =>
      topics
        .split(",")
        .map((t) => t.trim())
        .filter(Boolean),
    [topics],
  );

  async function handleSubmit(e: React.FormEvent) {
    e.preventDefault();
    if (!rating) {
      toast.error("Pick a difficulty rating from 1 to 5.");
      return;
    }
    if (!title.trim() && !existing) {
      toast.error("Add a problem title.");
      return;
    }
    setSubmitting(true);
    try {
      const today = todayLocalISO();
      const slug = deriveSlug(url);

      // Find or create the problem row
      let problemRow: ExistingProblem | null = existing;

      if (!problemRow) {
        // Try match by lc_url first, then by lc_slug
        if (url.trim()) {
          const { data } = await supabase
            .from("problems")
            .select("id, title, lc_url, lc_slug, topic_tags, box_level")
            .eq("user_id", user.id)
            .eq("lc_url", url.trim())
            .maybeSingle();
          if (data) problemRow = data;
        }
        if (!problemRow && slug) {
          const { data } = await supabase
            .from("problems")
            .select("id, title, lc_url, lc_slug, topic_tags, box_level")
            .eq("user_id", user.id)
            .eq("lc_slug", slug)
            .maybeSingle();
          if (data) problemRow = data;
        }
      }

      if (!problemRow) {
        const { data, error } = await supabase
          .from("problems")
          .insert({
            user_id: user.id,
            lc_url: url.trim() || null,
            lc_slug: slug,
            title: title.trim() || null,
            topic_tags: parsedTopics.length ? parsedTopics : null,
            box_level: 1,
          })
          .select("id, title, lc_url, lc_slug, topic_tags, box_level")
          .single();
        if (error) throw error;
        problemRow = data;
      }

      const newBox = nextBoxLevel(problemRow.box_level, rating);
      const nextDue = computeNextDue(newBox, today);

      const { error: upErr } = await supabase
        .from("problems")
        .update({
          box_level: newBox,
          last_solved_at: today,
          next_due: nextDue,
          // Refresh title / topics if user edited them
          title: title.trim() || problemRow.title,
          topic_tags: parsedTopics.length ? parsedTopics : problemRow.topic_tags,
        })
        .eq("id", problemRow.id);
      if (upErr) throw upErr;

      const { error: solveErr } = await supabase.from("solves").insert({
        user_id: user.id,
        problem_id: problemRow.id,
        rating,
        solved_at: today,
      });
      if (solveErr) throw solveErr;

      toast.success(`Logged. Next review in ${nextDueLabel(newBox)}.`);
      await router.invalidate();
      navigate({ to: "/" });
    } catch (err) {
      toast.error(err instanceof Error ? err.message : "Could not log solve.");
    } finally {
      setSubmitting(false);
    }
  }

  if (loadingPrefill) {
    return (
      <main className="flex min-h-screen items-center justify-center px-4">
        <p className="text-sm text-muted-foreground">Loading…</p>
      </main>
    );
  }

  return (
    <main className="min-h-screen bg-background px-4 py-6">
      <div className="mx-auto w-full max-w-md">
        <div className="mb-4 flex items-center justify-between">
          <Link to="/" className="text-sm text-muted-foreground hover:text-foreground">
            ← Back
          </Link>
          {existing && (
            <span className="rounded-full bg-muted px-2 py-0.5 text-xs text-muted-foreground">
              Re-solve · Box {existing.box_level}
            </span>
          )}
        </div>
        <h1 className="text-2xl font-semibold tracking-tight">Log a solve</h1>
        <p className="mt-1 text-sm text-muted-foreground">
          Record a problem you just solved and we'll schedule the next review.
        </p>

        <form onSubmit={handleSubmit} className="mt-6 space-y-5">
          <div className="space-y-2">
            <Label htmlFor="url">LeetCode URL</Label>
            <Input
              id="url"
              type="url"
              placeholder="https://leetcode.com/problems/two-sum/"
              value={url}
              onChange={(e) => setUrl(e.target.value)}
              disabled={!!existing}
              inputMode="url"
            />
          </div>

          <div className="space-y-2">
            <Label htmlFor="title">Problem title</Label>
            <Input
              id="title"
              placeholder="Two Sum"
              value={title}
              onChange={(e) => setTitle(e.target.value)}
              required={!existing}
            />
          </div>

          <div className="space-y-2">
            <Label htmlFor="topics">Topics</Label>
            <Input
              id="topics"
              placeholder="array, hash-map"
              value={topics}
              onChange={(e) => setTopics(e.target.value)}
            />
            <p className="text-xs text-muted-foreground">Comma-separated.</p>
          </div>

          <div className="space-y-2">
            <Label>How did it go?</Label>
            <div className="grid grid-cols-5 gap-2">
              {[1, 2, 3, 4, 5].map((n) => (
                <button
                  key={n}
                  type="button"
                  onClick={() => setRating(n)}
                  className={`flex h-12 items-center justify-center rounded-md border text-base font-medium transition-colors ${
                    rating === n
                      ? "border-primary bg-primary text-primary-foreground"
                      : "border-input bg-background hover:bg-accent"
                  }`}
                  aria-pressed={rating === n}
                >
                  {n}
                </button>
              ))}
            </div>
            <p className="text-xs text-muted-foreground">
              1 = easy · 3 = okay · 5 = struggled
            </p>
          </div>

          <Button type="submit" className="w-full" disabled={submitting}>
            {submitting ? "Saving…" : "Log solve"}
          </Button>
        </form>
      </div>
    </main>
  );
}

function nextDueLabel(box: number): string {
  const days = { 1: 1, 2: 3, 3: 7, 4: 14, 5: 30, 6: 60 }[box] ?? 1;
  return days === 1 ? "1 day" : `${days} days`;
}
