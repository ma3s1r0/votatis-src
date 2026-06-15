import { useState } from "react";
import { Link, useParams } from "react-router-dom";
import { acceptInvite } from "./api";

type Status = "form" | "done" | "gone" | "error";

export default function InvitePage() {
  const { token } = useParams<{ token: string }>();
  const [password, setPassword] = useState("");
  const [status, setStatus] = useState<Status>("form");
  const [submitting, setSubmitting] = useState(false);

  async function onSubmit(e: React.FormEvent) {
    e.preventDefault();
    if (!token) return;
    setSubmitting(true);
    const result = await acceptInvite(token, password);
    setSubmitting(false);
    if (result.ok) {
      setStatus("done");
    } else if (result.error === "expired") {
      setStatus("gone");
    } else {
      setStatus("error");
    }
  }

  if (status === "done") {
    return (
      <main className="container container--form">
        <div className="card">
          <h1>비밀번호 설정 완료</h1>
          <p>이제 로그인할 수 있습니다.</p>
          <Link to="/admin/login" className="btn btn-secondary">
            로그인하러 가기
          </Link>
        </div>
      </main>
    );
  }

  if (status === "gone") {
    return (
      <main className="container container--form">
        <div className="card">
          <h1>사용할 수 없는 초대</h1>
          <p>이 초대 링크는 만료되었거나 이미 사용되었습니다.</p>
          <p>관리자에게 재발급을 요청해 주세요.</p>
        </div>
      </main>
    );
  }

  return (
    <main className="container container--form">
      <div className="card">
        <h1>비밀번호 설정</h1>
        <form onSubmit={onSubmit} className="form-grid">
          <label className="field">
            비밀번호
            <input
              type="password"
              className="input"
              value={password}
              onChange={(e) => setPassword(e.target.value)}
              required
            />
          </label>
          {status === "error" && (
            <p role="alert" className="text-danger" style={{ margin: 0 }}>
              비밀번호를 설정할 수 없습니다. 입력을 확인해 주세요
            </p>
          )}
          <button type="submit" disabled={submitting} className="btn btn-primary">
            비밀번호 설정
          </button>
        </form>
      </div>
    </main>
  );
}
