import { useEffect, useState, type ReactNode } from "react";
import { Navigate } from "react-router-dom";
import { fetchMe, type AdminMe } from "./api";

type State =
  | { status: "loading" }
  | { status: "authed"; me: AdminMe }
  | { status: "unauthed" };

export default function ProtectedRoute({ children }: { children: ReactNode }) {
  const [state, setState] = useState<State>({ status: "loading" });

  useEffect(() => {
    let alive = true;
    fetchMe().then((me) => {
      if (!alive) return;
      setState(me ? { status: "authed", me } : { status: "unauthed" });
    });
    return () => {
      alive = false;
    };
  }, []);

  if (state.status === "loading") {
    return <p style={{ margin: "4rem auto", textAlign: "center" }}>확인 중…</p>;
  }
  if (state.status === "unauthed") {
    return <Navigate to="/admin/login" replace />;
  }
  return <>{children}</>;
}
