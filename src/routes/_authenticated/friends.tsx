import { createFileRoute, Link } from "@tanstack/react-router";
import { useCallback, useEffect, useState } from "react";
import { supabase } from "@/integrations/supabase/client";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { toast } from "sonner";

export const Route = createFileRoute("/_authenticated/friends")({
  head: () => ({
    meta: [{ title: "Friends — LeetCode Tracker" }],
  }),
  component: FriendsPage,
});

type IncomingRequest = {
  id: string;
  requester_id: string;
  username: string;
};

type Friend = {
  friendship_id: string;
  user_id: string;
  username: string;
  current_streak: number;
  total_solved: number;
};

function FriendsPage() {
  const { user } = Route.useRouteContext();
  const [usernameInput, setUsernameInput] = useState("");
  const [sending, setSending] = useState(false);
  const [incoming, setIncoming] = useState<IncomingRequest[]>([]);
  const [friends, setFriends] = useState<Friend[]>([]);
  const [loading, setLoading] = useState(true);

  const load = useCallback(async () => {
    setLoading(true);

    const { data: rows, error } = await supabase
      .from("friendships")
      .select("id, requester_id, addressee_id, status");

    if (error) {
      toast.error(error.message);
      setLoading(false);
      return;
    }

    const otherIds = Array.from(
      new Set(
        (rows ?? []).map((r) =>
          r.requester_id === user.id ? r.addressee_id : r.requester_id,
        ),
      ),
    );

    const profileMap = new Map<string, string>();
    if (otherIds.length) {
      const { data: profs } = await supabase
        .from("profiles")
        .select("id, username")
        .in("id", otherIds);
      (profs ?? []).forEach((p) => profileMap.set(p.id, p.username));
    }

    const incomingRows: IncomingRequest[] = (rows ?? [])
      .filter((r) => r.status === "pending" && r.addressee_id === user.id)
      .map((r) => ({
        id: r.id,
        requester_id: r.requester_id,
        username: profileMap.get(r.requester_id) ?? "(unknown)",
      }));

    const acceptedRows = (rows ?? []).filter((r) => r.status === "accepted");
    const friendUserIds = acceptedRows.map((r) =>
      r.requester_id === user.id ? r.addressee_id : r.requester_id,
    );

    let statsMap = new Map<string, { current_streak: number; total_solved: number }>();
    if (friendUserIds.length) {
      const { data: stats, error: statsErr } = await (supabase as any)
        .from("friend_stats")
        .select("user_id, current_streak, total_solved")
        .in("user_id", friendUserIds);
      if (statsErr) toast.error(statsErr.message);
      (stats ?? []).forEach((s: any) =>
        statsMap.set(s.user_id, {
          current_streak: s.current_streak,
          total_solved: s.total_solved,
        }),
      );
    }

    const friendList: Friend[] = acceptedRows.map((r) => {
      const otherId = r.requester_id === user.id ? r.addressee_id : r.requester_id;
      const s = statsMap.get(otherId);
      return {
        friendship_id: r.id,
        user_id: otherId,
        username: profileMap.get(otherId) ?? "(unknown)",
        current_streak: s?.current_streak ?? 0,
        total_solved: s?.total_solved ?? 0,
      };
    });

    setIncoming(incomingRows);
    setFriends(friendList);
    setLoading(false);
  }, [user.id]);

  useEffect(() => {
    load();
  }, [load]);

  async function sendRequest(e: React.FormEvent) {
    e.preventDefault();
    const target = usernameInput.trim();
    if (!target) return;
    setSending(true);

    const { data: prof, error: profErr } = await supabase
      .from("profiles")
      .select("id, username")
      .eq("username", target)
      .maybeSingle();

    if (profErr) {
      toast.error(profErr.message);
      setSending(false);
      return;
    }
    if (!prof) {
      toast.error("No user with that username");
      setSending(false);
      return;
    }
    if (prof.id === user.id) {
      toast.error("You can't friend yourself");
      setSending(false);
      return;
    }

    const { error: insErr } = await supabase.from("friendships").insert({
      requester_id: user.id,
      addressee_id: prof.id,
      status: "pending",
    });

    if (insErr) {
      if (insErr.code === "23505") toast.error("Friend request already exists");
      else toast.error(insErr.message);
    } else {
      toast.success(`Request sent to ${prof.username}`);
      setUsernameInput("");
      await load();
    }
    setSending(false);
  }

  async function accept(id: string) {
    const { error } = await supabase
      .from("friendships")
      .update({ status: "accepted" })
      .eq("id", id);
    if (error) toast.error(error.message);
    else await load();
  }

  async function decline(id: string) {
    const { error } = await supabase.from("friendships").delete().eq("id", id);
    if (error) toast.error(error.message);
    else await load();
  }

  return (
    <main className="min-h-screen bg-background px-4 py-6">
      <div className="mx-auto w-full max-w-md space-y-8">
        <header className="flex items-center justify-between">
          <h1 className="text-2xl font-semibold tracking-tight">Friends</h1>
          <Link to="/">
            <Button variant="ghost" size="sm">Home</Button>
          </Link>
        </header>

        <section>
          <h2 className="text-sm font-semibold mb-2">Send a request</h2>
          <form onSubmit={sendRequest} className="flex gap-2">
            <Input
              placeholder="username"
              value={usernameInput}
              onChange={(e) => setUsernameInput(e.target.value)}
              autoCapitalize="none"
              autoCorrect="off"
            />
            <Button type="submit" disabled={sending || !usernameInput.trim()}>
              {sending ? "…" : "Send"}
            </Button>
          </form>
        </section>

        <section>
          <h2 className="text-sm font-semibold mb-2">
            Incoming requests {incoming.length > 0 && `(${incoming.length})`}
          </h2>
          {loading ? (
            <p className="text-sm text-muted-foreground">Loading…</p>
          ) : incoming.length === 0 ? (
            <p className="text-sm text-muted-foreground">None.</p>
          ) : (
            <ul className="space-y-2">
              {incoming.map((r) => (
                <li
                  key={r.id}
                  className="flex items-center justify-between rounded-lg border bg-card p-3"
                >
                  <span className="font-medium">{r.username}</span>
                  <div className="flex gap-2">
                    <Button size="sm" onClick={() => accept(r.id)}>Accept</Button>
                    <Button size="sm" variant="secondary" onClick={() => decline(r.id)}>
                      Decline
                    </Button>
                  </div>
                </li>
              ))}
            </ul>
          )}
        </section>

        <section>
          <h2 className="text-sm font-semibold mb-2">
            Friends {friends.length > 0 && `(${friends.length})`}
          </h2>
          {loading ? (
            <p className="text-sm text-muted-foreground">Loading…</p>
          ) : friends.length === 0 ? (
            <p className="text-sm text-muted-foreground">No friends yet.</p>
          ) : (
            <ul className="space-y-2">
              {friends.map((f) => (
                <li
                  key={f.friendship_id}
                  className="rounded-lg border bg-card p-3"
                >
                  <div className="flex items-baseline justify-between">
                    <span className="font-medium">{f.username}</span>
                    <span className="text-xs text-muted-foreground">
                      🔥 {f.current_streak} · {f.total_solved} solved
                    </span>
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
