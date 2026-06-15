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
          <h1 className="hero__title">Votatis</h1>
          <p className="hero__lead">
            선거 무결성 관련 제보를 수집·검증해 출처와 검토 범위를 함께 공개하는
            데이터 아카이브입니다.
          </p>
          <p className="hero__sub">
            단정이 아니라 확인된 범위와 한계를 그대로 보여줍니다. 모든 기록은
            원본 출처·수집 시점과 함께 보존되며, 사람 검토를 거친 항목만
            공개됩니다.
          </p>
          <nav aria-label="주요 행동" className="hero__cta">
            <Link to="/report" className="btn btn-primary">
              제보하기
            </Link>
            <Link to="/archive" className="btn btn-secondary">
              아카이브 보기
            </Link>
          </nav>
        </section>

        <div className="principles">
          <div className="principle">
            <p className="principle__title">데이터 우선</p>
            <p className="principle__body">
              주장보다 사실. 모든 기록은 원본 출처와 수집 시점을 함께 보존합니다.
            </p>
          </div>
          <div className="principle">
            <p className="principle__title">검증</p>
            <p className="principle__body">
              사람 검토를 거친 항목만 공개하며, 확인된 범위와 한계를 함께
              제공합니다.
            </p>
          </div>
          <div className="principle">
            <p className="principle__title">투명성</p>
            <p className="principle__body">
              검토 방법과 근거를 공개해, 무엇을 어떻게 확인했는지 추적할 수
              있게 합니다.
            </p>
          </div>
        </div>
      </main>
      <TabBar />
    </>
  );
}
