import { Link } from "react-router-dom";

// 공통 헤더(스펙 0012). 공개 모드는 로고만 — 주 내비는 하단 탭바.
// admin 모드에선 로고 + 로그아웃 동작을 노출.
type HeaderProps = {
  admin?: boolean;
  onLogout?: () => void;
};

export default function Header({ admin = false, onLogout }: HeaderProps) {
  return (
    <header className="app-header">
      <Link to="/" className="app-header__logo">
        Votatis
      </Link>
      {admin && onLogout && (
        <button type="button" onClick={onLogout} className="btn btn-secondary">
          로그아웃
        </button>
      )}
    </header>
  );
}
