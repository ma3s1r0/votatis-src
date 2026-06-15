import { NavLink } from "react-router-dom";
import type { ReactNode } from "react";

// 모바일 앱 하단 고정 탭바(스펙 0012). 공개 화면 공통. 현재 탭 navy 강조.
// 아이콘은 단색(currentColor) 인라인 SVG — active 시 navy, 비활성 muted.
const iconProps = {
  width: 22,
  height: 22,
  viewBox: "0 0 24 24",
  fill: "none",
  stroke: "currentColor",
  strokeWidth: 1.8,
  strokeLinecap: "round" as const,
  strokeLinejoin: "round" as const,
};

const HomeIcon = () => (
  <svg {...iconProps}>
    <path d="M3 10.5 12 3l9 7.5" />
    <path d="M5 9.5V20h14V9.5" />
    <path d="M9.5 20v-5h5v5" />
  </svg>
);

const ReportIcon = () => (
  <svg {...iconProps}>
    <path d="M6 3h7l5 5v9a2 2 0 0 1-2 2H6a2 2 0 0 1-2-2V5a2 2 0 0 1 2-2Z" />
    <path d="M13 3v5h5" />
    <path d="M9 13.5 12 16l4.5-4.5" />
  </svg>
);

const MapIcon = () => (
  <svg {...iconProps}>
    <path d="M12 21s6-5.2 6-10a6 6 0 1 0-12 0c0 4.8 6 10 6 10Z" />
    <circle cx="12" cy="11" r="2.2" />
  </svg>
);

const MyIcon = () => (
  <svg {...iconProps}>
    <circle cx="12" cy="8" r="3.2" />
    <path d="M5.5 20a6.5 6.5 0 0 1 13 0" />
  </svg>
);

const TABS: {
  to: string;
  label: string;
  icon: ReactNode;
  end: boolean;
}[] = [
  { to: "/", label: "홈", icon: <HomeIcon />, end: true },
  { to: "/report", label: "제보하기", icon: <ReportIcon />, end: false },
  { to: "/map", label: "지도", icon: <MapIcon />, end: false },
  { to: "/my", label: "내 제보", icon: <MyIcon />, end: false },
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
