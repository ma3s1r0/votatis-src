import { Link } from "react-router-dom";
import Header from "./Header";

// 홈 랜딩(스펙 0011 J2). 프로젝트 소개 + 신뢰 메시지 + CTA 2개.
export default function App() {
  return (
    <>
      <Header />
      <main
        style={{
          maxWidth: "var(--container-max)",
          margin: "var(--space-6) auto",
          padding: "0 var(--space-4)",
        }}
      >
        <h1>Votatis</h1>
        <p style={{ fontSize: "var(--text-lg)" }}>
          선거 무결성 관련 제보를 수집·검증해 출처와 검토 범위를 함께 공개하는
          데이터 아카이브입니다.
        </p>
        <p style={{ color: "var(--color-text-muted)" }}>
          단정이 아니라 확인된 범위와 한계를 그대로 보여줍니다. 모든 기록은
          원본 출처·수집 시점과 함께 보존되며, 사람 검토를 거친 항목만
          공개됩니다.
        </p>
        <nav
          aria-label="주요 행동"
          style={{ display: "flex", gap: "var(--space-3)", marginTop: "var(--space-5)" }}
        >
          <Link
            to="/archive"
            style={{
              padding: "var(--space-3) var(--space-4)",
              background: "var(--color-accent)",
              color: "var(--color-bg)",
              borderRadius: "var(--radius-sm)",
              textDecoration: "none",
            }}
          >
            아카이브 보기
          </Link>
          <Link
            to="/report"
            style={{
              padding: "var(--space-3) var(--space-4)",
              border: "1px solid var(--color-border)",
              color: "var(--color-text)",
              borderRadius: "var(--radius-sm)",
              textDecoration: "none",
            }}
          >
            제보하기
          </Link>
        </nav>
      </main>
    </>
  );
}
