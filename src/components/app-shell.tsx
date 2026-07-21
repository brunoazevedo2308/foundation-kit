import type { ReactNode } from "react";

import { SidebarInset, SidebarProvider } from "@/components/ui/sidebar";
import { AppSidebar } from "./app-sidebar";
import { AppHeader } from "./app-header";

/**
 * TT-006 — DP Suite authenticated app shell.
 *
 * Wraps every route under `/_authenticated` with the persistent sidebar +
 * header. The shell is responsive: on mobile the sidebar collapses into an
 * offcanvas sheet via shadcn `SidebarProvider`.
 */
export function AppShell({
  displayName,
  organizationName,
  email,
  children,
}: {
  displayName: string;
  organizationName: string;
  email: string;
  children: ReactNode;
}) {
  return (
    <SidebarProvider>
      <div className="flex min-h-screen w-full bg-background text-foreground">
        <AppSidebar />
        <SidebarInset className="flex min-w-0 flex-1 flex-col">
          <AppHeader displayName={displayName} organizationName={organizationName} email={email} />
          <main className="min-w-0 flex-1 p-4 sm:p-6 lg:p-8">{children}</main>
        </SidebarInset>
      </div>
    </SidebarProvider>
  );
}
