import { useEffect, useState } from "react";
import { Link, useNavigate } from "react-router-dom";
import { fetchReports, logout, type AdminReport } from "./api";

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
    <main style={{ maxWidth: 880, margin: "2rem auto", padding: "0 1rem" }}>
      <header
        style={{
          display: "flex",
          justifyContent: "space-between",
          alignItems: "baseline",
        }}
      >
        <h1>검토 큐</h1>
        <button onClick={onLogout}>로그아웃</button>
      </header>

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
                borderBottom: "1px solid #ddd",
                padding: "0.75rem 0",
              }}
            >
              <Link to={`/admin/reports/${r.id}`}>{r.title}</Link>
              <div style={{ fontSize: "0.85rem", color: "#555" }}>
                <span>{regionLabel(r)}</span>
                {r.collectedAt && (
                  <span> · 수집 {r.collectedAt}</span>
                )}
              </div>
            </li>
          ))}
        </ul>
      )}
    </main>
  );
}
