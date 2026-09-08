import { getCtx } from "@/lib/current";
import { getRange } from "@/lib/range.server";
import { openAlertCount } from "@/lib/queries";
import { MobileNav, Sidebar } from "@/components/Sidebar";
import { TopBar } from "@/components/TopBar";
import { logout } from "../(auth)/actions";

export const dynamic = "force-dynamic";

export default async function DashboardLayout({ children }: { children: React.ReactNode }) {
  const ctx = await getCtx();
  const range = getRange();
  const openAlerts = await openAlertCount(ctx.project.id);
  return (
    <div className="flex min-h-screen">
      <Sidebar orgName={ctx.org.name} plan={ctx.org.plan} openAlerts={openAlerts} />
      <div className="flex min-w-0 flex-1 flex-col">
        <TopBar projects={ctx.projects.map((p) => ({ id: p.id, name: p.name, environment: p.environment }))} activeId={ctx.project.id} email={ctx.user.email} range={range.key} onLogout={logout} />
        <main className="mx-auto w-full max-w-7xl flex-1 px-4 py-6 pb-20 md:px-6 md:pb-8">{children}</main>
      </div>
      <MobileNav />
    </div>
  );
}
