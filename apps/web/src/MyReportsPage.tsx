import Header from "./Header";
import TabBar from "./TabBar";

// 준비 중 자리표시(스펙 0012). 하단 탭바 "내 제보" 대상.
export default function MyReportsPage() {
  return (
    <>
      <Header />
      <main className="container">
        <h1>내 제보</h1>
        <div className="placeholder-card">
          <p className="placeholder-card__title">곧 제공됩니다</p>
          <p className="placeholder-card__body">
            내가 제출한 제보의 접수·검증 상태를 확인하는 기능을 준비하고
            있습니다.
          </p>
        </div>
      </main>
      <TabBar />
    </>
  );
}
