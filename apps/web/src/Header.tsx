import { Link } from "react-router-dom";

// 공통 헤더/네비(스펙 0011 J1). 로고(홈) + 공개 아카이브 + 제보 링크.
// admin 모드에선 로그아웃 동작을 추가로 노출(과하지 않게).
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
      <nav className="app-header__nav">
        <Link to="/archive" className="app-header__link">
          공개 아카이브
        </Link>
        <Link to="/report" className="app-header__link">
          제보하기
        </Link>
      </nav>
      {admin && onLogout && (
        <button type="button" onClick={onLogout} className="btn btn-secondary">
          로그아웃
        </button>
      )}
    </header>
  );
}
