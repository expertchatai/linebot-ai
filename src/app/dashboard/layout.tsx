import Link from "next/link";

export const dynamic = "force-dynamic";

const NAV = [
  ["/dashboard", "ภาพรวม"],
  ["/dashboard/knowledge", "ฐานความรู้"],
  ["/dashboard/handoffs", "ส่งต่อเจ้าหน้าที่"],
  ["/dashboard/events", "เหตุการณ์ระบบ"],
  ["/dashboard/playground", "ทดลองถาม AI"],
] as const;

export default function DashboardLayout({ children }: { children: React.ReactNode }) {
  return (
    <div className="shell">
      <nav className="nav">
        <div className="brand">
          Expert Watch
          <small>AI Customer Service</small>
        </div>
        {NAV.map(([href, label]) => (
          <Link key={href} href={href}>
            {label}
          </Link>
        ))}
        <form method="post" action="/api/auth/logout">
          <button className="btn ghost" type="submit">
            ออกจากระบบ
          </button>
        </form>
      </nav>
      <main className="main">{children}</main>
    </div>
  );
}
