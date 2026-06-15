import { Link } from "react-router-dom";
import Header from "./Header";
import TabBar from "./TabBar";

// 홈 랜딩(스펙 0011 J2). 프로젝트 소개 + 신뢰 메시지 + CTA 2개.
export default function App() {
  return (
    <>
      <Header />
      <main className="container">
        <section className="hero">
          <h1 className="hero__title">
            민주주의의 꽃 선거,
            <br />
            기술과 팩트로 지킵니다
          </h1>
          <p className="hero__sub">
            현장에서 발견한 선거·집회 현장 증거를 안전하게 기록하고 검증합니다.
          </p>
          <nav aria-label="주요 행동" className="hero__cta">
            <Link to="/report" className="btn btn-primary">
              증거 제보하기 →
            </Link>
            <Link to="/archive" className="btn btn-secondary">
              아카이브 보기
            </Link>
          </nav>
        </section>

        <div className="principles">
          <div className="principle">
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
