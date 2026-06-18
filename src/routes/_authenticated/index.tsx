import { createFileRoute, Link, useNavigate, useRouter } from "@tanstack/react-router";
import { useCallback, useEffect, useState } from "react";
import { supabase } from "@/integrations/supabase/client";
import { Button } from "@/components/ui/button";
import { toast } from "sonner";
import { computeStreak, todayLocalISO } from "@/lib/leitner";

export const Route = createFileRoute("/_authenticated/")({
  head: () => ({
    meta: [
      { title: "Today — LeetCode Tracker" },
      { name: "description", content: "Your streak and problems due for review today." },
    ],
  }),
  component: Today,
});

type DueProblem = {
  id: string;
  title: string | null;
  topic_tags: string[] | null;
  box_level: number;
  next_due: string | null;
};

function Today() {
  const { user } = Route.useRouteContext();
  const router = useRouter();
  const navigate = useNavigate();

  const [username, setUsername] = useState<string | null>(null);
  const [streak, setStreak] = useState<number>(0);
  const [due, setDue] = useState<DueProblem[]>([]);
  const [loading, setLoading] = useState(true);
  const [signingOut, setSigningOut] = useState(false);

  const load = useCallback(async () => {
    setLoading(true);
    const today = todayLocalISO();

    const [profileRes, solvesRes, dueRes] = await Promise.all([
      supabase.from("profiles").select("username").eq("id", user.id).maybeSingle(),
      supabase.from("solves").select("solved_at").eq("user_id", user.id),
      supabase
        .from("problems")
        .select("id, title, topic_tags, box_level, next_due")
        .eq("user_id", user.id)
        .not("next_due", "is", null)
        .lte("next_due", today)
        .order("next_due", { ascending: true }),
    ]);

    if (profileRes.error) toast.error(profileRes.error.message);
    else setUsername(profileRes.data?.username ?? null);

    if (solvesRes.error) toast.error(solvesRes.error.message);
    else {
      const dates = Array.from(
        new Set((solvesRes.data ?? []).map((r) => r.solved_at as string)),
      );
      setStreak(computeStreak(dates, today));
    }

    if (dueRes.error) toast.error(dueRes.error.message);
    else setDue((dueRes.data as DueProblem[]) ?? []);

    setLoading(false);
  }, [user.id]);

  useEffect(() => {
    load();
  }, [load]);

  async function handleSignOut() {
    setSigningOut(true);
    await supabase.auth.signOut();
    await router.invalidate();
    navigate({ to: "/auth", replace: true });
  }

  return (
    <main className="min-h-screen bg-background px-4 py-6">
      <div className="mx-auto w-full max-w-md">
        <header className="flex items-center justify-between">
          <div>
            <p className="text-xs uppercase tracking-wide text-muted-foreground">Today</p>
            <h1 className="text-2xl font-semibold tracking-tight">
              {username ?? "…"}
            </h1>
          </div>
          <Button variant="ghost" size="sm" onClick={handleSignOut} disabled={signingOut}>
            {signingOut ? "…" : "Sign out"}
          </Button>
        </header>

        <section className="mt-6 rounded-xl border bg-card p-5 text-card-foreground">
          <p className="text-xs uppercase tracking-wide text-muted-foreground">
            Current streak
          </p>
          <div className="mt-1 flex items-baseline gap-2">
            <span className="text-4xl font-semibold">{streak}</span>
            <span className="text-sm text-muted-foreground">
              {streak === 1 ? "day" : "days"}
            </span>
          </div>
        </section>

        <div className="mt-6 grid grid-cols-2 gap-2">
          <Link to="/log">
            <Button className="w-full">Log a solve</Button>
          </Link>
          <Link to="/history">
            <Button className="w-full" variant="secondary">History</Button>
          </Link>
        </div>

        <section className="mt-8">
          <div className="flex items-baseline justify-between">
            <h2 className="text-lg font-semibold">Due for review</h2>
            <span className="text-xs text-muted-foreground">{due.length}</span>
          </div>

          {loading ? (
            <p className="mt-4 text-sm text-muted-foreground">Loading…</p>
          ) : due.length === 0 ? (
            <p className="mt-4 text-sm text-muted-foreground">
              Nothing due today. Log a new solve to get started.
            </p>
          ) : (
            <ul className="mt-3 space-y-2">
              {due.map((p) => (
                <li
                  key={p.id}
                  className="rounded-lg border bg-card p-4 text-card-foreground"
                >
                  <div className="flex items-start justify-between gap-3">
                    <div className="min-w-0">
                      <p className="truncate font-medium">{p.title ?? "Untitled"}</p>
                      <div className="mt-1 flex flex-wrap gap-1.5">
                        {(p.topic_tags ?? []).map((t) => (
                          <span
                            key={t}
                            className="rounded-full bg-muted px-2 py-0.5 text-xs text-muted-foreground"
                          >
                            {t}
                          </span>
                        ))}
                        <span className="rounded-full bg-muted px-2 py-0.5 text-xs text-muted-foreground">
                          Box {p.box_level}
                        </span>
                      </div>
                    </div>
                    <Link
                      to="/log"
                      search={{ problem_id: p.id }}
                      className="shrink-0"
                    >
                      <Button size="sm" variant="secondary">
                        Re-solve
                      </Button>
                    </Link>
                  </div>
                </li>
              ))}
            </ul>
          )}
        </section>
      </div>
    </main>
  );
}
