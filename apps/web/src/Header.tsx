import { Link } from "react-router-dom";

// 공통 헤더/네비(스펙 0011 J1). 로고(홈) + 공개 아카이브 + 제보 링크.
// admin 모드에선 로그아웃 동작을 추가로 노출(과하지 않게).
type HeaderProps = {
  admin?: boolean;
  onLogout?: () => void;
};

export default function Header({ admin = false, onLogout }: HeaderProps) {
  return (
    <header
      style={{
        display: "flex",
        alignItems: "center",
        gap: "var(--space-4)",
        padding: "var(--space-3) var(--space-4)",
        borderBottom: "1px solid var(--color-border)",
        background: "var(--color-surface)",
      }}
    >
      <Link
        to="/"
        style={{
          fontWeight: "var(--weight-bold)",
          color: "var(--color-text)",
          textDecoration: "none",
        }}
      >
        Votatis
      </Link>
      <nav style={{ display: "flex", gap: "var(--space-4)", flex: 1 }}>
        <Link to="/archive" style={{ color: "var(--color-accent)" }}>
          공개 아카이브
        </Link>
        <Link to="/report" style={{ color: "var(--color-accent)" }}>
          제보하기
        </Link>
      </nav>
      {admin && onLogout && (
        <button type="button" onClick={onLogout}>
          로그아웃
        </button>
      )}
    </header>
  );
}
