import { NavLink } from "react-router-dom";

// 모바일 앱 하단 고정 탭바(스펙 0012). 공개 화면 공통. 현재 탭 navy 강조.
const TABS = [
  { to: "/", label: "홈", icon: "🏠", end: true },
  { to: "/report", label: "제보하기", icon: "✏️", end: false },
  { to: "/map", label: "지도", icon: "🗺️", end: false },
  { to: "/my", label: "내 제보", icon: "📄", end: false },
];

export default function TabBar() {
  return (
    <nav className="tab-bar" aria-label="주 메뉴">
      {TABS.map((t) => (
        <NavLink
          key={t.to}
          to={t.to}
          end={t.end}
          className={({ isActive }) =>
            "tab-bar__item" + (isActive ? " tab-bar__item--active" : "")
          }
        >
          <span className="tab-bar__icon" aria-hidden="true">
            {t.icon}
          </span>
          <span className="tab-bar__label">{t.label}</span>
        </NavLink>
      ))}
    </nav>
  );
}
