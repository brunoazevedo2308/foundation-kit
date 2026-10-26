import type { ReactNode } from "react";

import { SidebarInset, SidebarProvider } from "@/components/ui/sidebar";
import type { AppRole } from "@/lib/auth";
import { AppSidebar } from "./app-sidebar";
import { AppHeader } from "./app-header";

/**
 * TT-006 — Atino DP Suite authenticated app shell.
 *
 * Wraps every route under `/_authenticated` with the persistent sidebar +
 * header. The shell is responsive: on mobile the sidebar collapses into an
 * offcanvas sheet via shadcn `SidebarProvider`.
 */
export function AppShell({
  displayName,
  organizationName,
  email,
  role,
  children,
}: {
  displayName: string;
  organizationName: string;
  email: string;
  role: AppRole;
  children: ReactNode;
}) {
  return (
    <SidebarProvider>
      <div className="flex min-h-dvh w-full bg-background text-foreground">
        <AppSidebar role={role} />
        <SidebarInset className="flex min-w-0 flex-1 flex-col">
          <AppHeader displayName={displayName} organizationName={organizationName} email={email} />
          <main className="app-main-safe min-w-0 flex-1">{children}</main>
        </SidebarInset>
      </div>
    </SidebarProvider>
  );
}
