import { Link } from "react-router-dom";
import TabBar from "./TabBar";

// 홈 랜딩(Figma 01 랜딩). 상단 고정 헤더 없이 히어로 안에 로고를 둔다.
// 주 행동은 "증거 제보하기" 하나 + "접수번호로 상태 조회" 텍스트 링크.
export default function App() {
  return (
    <>
      <main className="container home">
        <section className="hero">
          <Link to="/" className="hero__logo">
            Votatis
          </Link>
          <h1 className="hero__title">
            민주주의의 꽃 선거,
            <br />
            기술과 팩트로 지킵니다
          </h1>
          <p className="hero__sub">
            현장에서 발견한 선거·집회 현장 증거를 안전하게 기록하고 검증합니다.
          </p>
          <nav aria-label="주요 행동" className="hero__cta">
            <Link to="/report" className="btn btn-primary btn-block">
              증거 제보하기 →
            </Link>
            <Link to="/archive" className="btn btn-secondary btn-block">
              검증 아카이브 보기
            </Link>
            <Link to="/track" className="hero__track-link">
              접수번호로 상태 조회 →
            </Link>
          </nav>
        </section>

        <p className="section-label">지금 무엇이 문제인가</p>
        <div className="principles">
          <div className="principle principle--featured">
            <p className="principle__title">증거가 휘발된다</p>
            <p className="principle__body">
              커뮤니티에 흩어진 물증이 시간이 지나면 사라진다.
            </p>
          </div>
          <div className="principle">
            <p className="principle__title">진위가 불분명하다</p>
            <p className="principle__body">
              메타데이터 검증 없이는 신뢰를 얻기 어렵다.
            </p>
          </div>
          <div className="principle">
            <p className="principle__title">기록이 체계가 없다</p>
            <p className="principle__body">
              분산된 제보를 한곳에 정형화해 보존해야 한다.
            </p>
          </div>
        </div>
      </main>
      <TabBar />
    </>
  );
}
