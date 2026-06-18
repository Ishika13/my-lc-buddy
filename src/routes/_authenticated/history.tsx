import { createFileRoute, Link } from "@tanstack/react-router";
import { useEffect, useMemo, useState } from "react";
import { supabase } from "@/integrations/supabase/client";
import { Button } from "@/components/ui/button";
import { toast } from "sonner";
import { todayLocalISO } from "@/lib/leitner";

export const Route = createFileRoute("/_authenticated/history")({
  head: () => ({
    meta: [
      { title: "History — LeetCode Tracker" },
      { name: "description", content: "All problems you've logged, with filters." },
    ],
  }),
  component: History,
});

type ProblemRow = {
  id: string;
  title: string | null;
  lc_number: number | null;
  lc_difficulty: string | null;
  topic_tags: string[] | null;
  box_level: number;
  last_solved_at: string | null;
  next_due: string | null;
};

function History() {
  const { user } = Route.useRouteContext();
  const [problems, setProblems] = useState<ProblemRow[]>([]);
  const [loading, setLoading] = useState(true);
  const [topic, setTopic] = useState<string>("");
  const [dueOnly, setDueOnly] = useState(false);
  const today = todayLocalISO();

  useEffect(() => {
    let cancelled = false;
    setLoading(true);
    supabase
      .from("problems")
      .select("id, title, lc_number, lc_difficulty, topic_tags, box_level, last_solved_at, next_due")
      .eq("user_id", user.id)
      .order("last_solved_at", { ascending: false, nullsFirst: false })
      .then(({ data, error }) => {
        if (cancelled) return;
        if (error) toast.error(error.message);
        else setProblems((data as ProblemRow[]) ?? []);
        setLoading(false);
      });
    return () => {
      cancelled = true;
    };
  }, [user.id]);

  const allTopics = useMemo(() => {
    const s = new Set<string>();
    problems.forEach((p) => (p.topic_tags ?? []).forEach((t) => s.add(t)));
    return Array.from(s).sort();
  }, [problems]);

  const filtered = useMemo(() => {
    return problems.filter((p) => {
      if (topic && !(p.topic_tags ?? []).includes(topic)) return false;
      if (dueOnly && (!p.next_due || p.next_due > today)) return false;
      return true;
    });
  }, [problems, topic, dueOnly, today]);

  return (
    <main className="min-h-screen bg-background px-4 py-6">
      <div className="mx-auto w-full max-w-md">
        <div className="mb-4 flex items-center justify-between">
          <Link to="/" className="text-sm text-muted-foreground hover:text-foreground">
            ← Back
          </Link>
          <span className="text-xs text-muted-foreground">{filtered.length} of {problems.length}</span>
        </div>
        <h1 className="text-2xl font-semibold tracking-tight">History</h1>
        <p className="mt-1 text-sm text-muted-foreground">
          All your logged problems, most recently solved first.
        </p>

        <div className="mt-5 space-y-3">
          <div className="flex items-center gap-2">
            <select
              value={topic}
              onChange={(e) => setTopic(e.target.value)}
              className="flex h-10 flex-1 rounded-md border border-input bg-background px-3 py-2 text-sm"
            >
              <option value="">All topics</option>
              {allTopics.map((t) => (
                <option key={t} value={t}>
                  {t}
                </option>
              ))}
            </select>
            <button
              type="button"
              onClick={() => setDueOnly((v) => !v)}
              className={`h-10 shrink-0 rounded-md border px-3 text-sm font-medium transition-colors ${
                dueOnly
                  ? "border-primary bg-primary text-primary-foreground"
                  : "border-input bg-background hover:bg-accent"
              }`}
              aria-pressed={dueOnly}
            >
              Due only
            </button>
          </div>
        </div>

        <section className="mt-6">
          {loading ? (
            <p className="text-sm text-muted-foreground">Loading…</p>
          ) : filtered.length === 0 ? (
            <p className="text-sm text-muted-foreground">
              {problems.length === 0
                ? "No problems logged yet."
                : "No problems match these filters."}
            </p>
          ) : (
            <ul className="space-y-2">
              {filtered.map((p) => {
                const isDue = p.next_due && p.next_due <= today;
                return (
                  <li
                    key={p.id}
                    className="rounded-lg border bg-card p-4 text-card-foreground"
                  >
                    <div className="flex items-start justify-between gap-3">
                      <div className="min-w-0 flex-1">
                        <p className="truncate font-medium">
                          {p.lc_number != null && (
                            <span className="text-muted-foreground">{p.lc_number}. </span>
                          )}
                          {p.title ?? "Untitled"}
                        </p>
                        <div className="mt-1.5 flex flex-wrap gap-1.5">
                          {p.lc_difficulty && (
                            <span className="rounded-full bg-muted px-2 py-0.5 text-xs text-muted-foreground">
                              {p.lc_difficulty}
                            </span>
                          )}
                          <span className="rounded-full bg-muted px-2 py-0.5 text-xs text-muted-foreground">
                            Box {p.box_level}
                          </span>
                          {(p.topic_tags ?? []).map((t) => (
                            <span
                              key={t}
                              className="rounded-full bg-muted px-2 py-0.5 text-xs text-muted-foreground"
                            >
                              {t}
                            </span>
                          ))}
                        </div>
                        <div className="mt-2 grid grid-cols-2 gap-2 text-xs text-muted-foreground">
                          <div>
                            <p className="uppercase tracking-wide">Last solved</p>
                            <p className="text-foreground">{p.last_solved_at ?? "—"}</p>
                          </div>
                          <div>
                            <p className="uppercase tracking-wide">Next due</p>
                            <p className={isDue ? "text-foreground font-medium" : "text-foreground"}>
                              {p.next_due ?? "—"}
                              {isDue ? " · due" : ""}
                            </p>
                          </div>
                        </div>
                      </div>
                    </div>
                    <div className="mt-3 flex justify-end">
                      <Link to="/log" search={{ problem_id: p.id }}>
                        <Button size="sm" variant="secondary">
                          Log re-solve
                        </Button>
                      </Link>
                    </div>
                  </li>
                );
              })}
            </ul>
          )}
        </section>
      </div>
    </main>
  );
}
