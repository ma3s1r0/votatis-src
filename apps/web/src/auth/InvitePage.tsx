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
      <main style={pageStyle}>
        <h1>비밀번호 설정 완료</h1>
        <p>이제 로그인할 수 있습니다.</p>
        <Link to="/admin/login">로그인하러 가기</Link>
      </main>
    );
  }

  if (status === "gone") {
    return (
      <main style={pageStyle}>
        <h1>사용할 수 없는 초대</h1>
        <p>이 초대 링크는 만료되었거나 이미 사용되었습니다.</p>
        <p>관리자에게 재발급을 요청해 주세요.</p>
      </main>
    );
  }

  return (
    <main style={pageStyle}>
      <h1>비밀번호 설정</h1>
      <form onSubmit={onSubmit} style={{ display: "grid", gap: "0.75rem" }}>
        <label style={labelStyle}>
          비밀번호
          <input
            type="password"
            value={password}
            onChange={(e) => setPassword(e.target.value)}
            required
            style={inputStyle}
          />
        </label>
        {status === "error" && (
          <p role="alert" style={{ color: "#b00020", margin: 0 }}>
            비밀번호를 설정할 수 없습니다. 입력을 확인해 주세요
          </p>
        )}
        <button type="submit" disabled={submitting} style={buttonStyle}>
          비밀번호 설정
        </button>
      </form>
    </main>
  );
}

const pageStyle: React.CSSProperties = {
  maxWidth: 360,
  margin: "4rem auto",
  padding: "0 1rem",
};
const labelStyle: React.CSSProperties = {
  display: "grid",
  gap: "0.25rem",
  fontSize: "0.9rem",
};
const inputStyle: React.CSSProperties = {
  padding: "0.5rem",
  fontSize: "1rem",
};
const buttonStyle: React.CSSProperties = {
  padding: "0.6rem",
  fontSize: "1rem",
  cursor: "pointer",
};
