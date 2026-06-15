import { useEffect, useState } from "react";
import { Link, useNavigate } from "react-router-dom";
import { fetchReports, logout, type AdminReport } from "./api";
import { formatDateTime } from "../format";
import Header from "../Header";

type State =
  | { status: "loading" }
  | { status: "error" }
  | { status: "ready"; items: AdminReport[] };

function regionLabel(r: AdminReport): string {
  return [r.sido, r.sigungu, r.eupMyeonDong].filter(Boolean).join(" ") || "지역 미상";
}

export default function QueuePage() {
  const [state, setState] = useState<State>({ status: "loading" });
  const navigate = useNavigate();

  useEffect(() => {
    let alive = true;
    fetchReports()
      .then((res) => {
        if (alive) setState({ status: "ready", items: res.items });
      })
      .catch(() => {
        if (alive) setState({ status: "error" });
      });
    return () => {
      alive = false;
    };
  }, []);

  async function onLogout() {
    await logout();
    navigate("/admin/login");
  }

  return (
    <>
    <Header admin onLogout={onLogout} />
    <main style={{ maxWidth: 880, margin: "2rem auto", padding: "0 1rem" }}>
      <h1>검토 큐</h1>

      {state.status === "loading" && <p>불러오는 중…</p>}
      {state.status === "error" && <p role="alert">목록을 불러오지 못했습니다.</p>}
      {state.status === "ready" && state.items.length === 0 && (
        <p>검토할 제보가 없습니다.</p>
      )}
      {state.status === "ready" && state.items.length > 0 && (
        <ul style={{ listStyle: "none", padding: 0 }}>
          {state.items.map((r) => (
            <li
              key={r.id}
              style={{
                borderBottom: "1px solid var(--color-border)",
                padding: "var(--space-3) 0",
              }}
            >
              <Link to={`/admin/reports/${r.id}`}>{r.title}</Link>
              <div style={{ fontSize: "var(--text-sm)", color: "var(--color-text-muted)" }}>
                <span>{regionLabel(r)}</span>
                {r.collectedAt && (
                  <span> · 수집 {formatDateTime(r.collectedAt)}</span>
                )}
              </div>
            </li>
          ))}
        </ul>
      )}
    </main>
    </>
  );
}
