import Header from "./Header";
import TabBar from "./TabBar";

// 준비 중 자리표시(스펙 0012). 하단 탭바 "지도" 대상.
export default function MapPage() {
  return (
    <>
      <Header />
      <main className="container">
        <h1>지도</h1>
        <div className="placeholder-card">
          <p className="placeholder-card__title">곧 제공됩니다</p>
          <p className="placeholder-card__body">
            지역별 제보를 지도에서 살펴보는 기능을 준비하고 있습니다.
          </p>
        </div>
      </main>
      <TabBar />
    </>
  );
}
