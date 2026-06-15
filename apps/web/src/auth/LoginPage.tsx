import { useState } from "react";
import { useNavigate } from "react-router-dom";
import { login } from "./api";

export default function LoginPage() {
  const navigate = useNavigate();
  const [email, setEmail] = useState("");
  const [password, setPassword] = useState("");
  const [error, setError] = useState<string | null>(null);
  const [submitting, setSubmitting] = useState(false);

  async function onSubmit(e: React.FormEvent) {
    e.preventDefault();
    setError(null);
    setSubmitting(true);
    const result = await login(email, password);
    setSubmitting(false);
    if (result.ok) {
      navigate("/admin");
      return;
    }
    if (result.error === "rate_limited") {
      setError("로그인 시도가 많습니다. 잠시 후 다시 시도해 주세요");
    } else {
      // 401(invalid_credentials)·기타 모두 동일 메시지 — 계정 존재 누설 금지
      setError("이메일 또는 비밀번호가 올바르지 않습니다");
    }
  }

  return (
    <main style={pageStyle}>
      <h1>관리자 로그인</h1>
      <form onSubmit={onSubmit} style={{ display: "grid", gap: "0.75rem" }}>
        <label style={labelStyle}>
          이메일
          <input
            type="email"
            value={email}
            onChange={(e) => setEmail(e.target.value)}
            required
            style={inputStyle}
          />
        </label>
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
        {error && (
          <p role="alert" style={{ color: "#b00020", margin: 0 }}>
            {error}
          </p>
        )}
        <button type="submit" disabled={submitting} style={buttonStyle}>
          로그인
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
