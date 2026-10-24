export default async function LoginPage({ searchParams }: { searchParams: Promise<{ error?: string }> }) {
  const { error } = await searchParams;
  return (
    <main className="login">
      <form method="post" action="/api/auth/login">
        <div className="brand">
          Expert Watch
          <small>AI Customer Service</small>
        </div>
        <input type="password" name="password" placeholder="รหัสผ่าน Dashboard" autoComplete="current-password" required />
        {error && <div className="notice">รหัสผ่านไม่ถูกต้อง</div>}
        <button className="btn" type="submit">
          เข้าสู่ระบบ
        </button>
      </form>
    </main>
  );
}
