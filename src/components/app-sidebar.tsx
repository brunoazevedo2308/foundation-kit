import { Link, useRouterState } from "@tanstack/react-router";
import {
  LayoutDashboard,
  ListChecks,
  Building2,
  Ship,
  Users,
  Bell,
  Settings,
  Search,
  Anchor,
  Landmark,
} from "lucide-react";

import type { AppRole } from "@/lib/auth";

import {
  Sidebar,
  SidebarContent,
  SidebarGroup,
  SidebarGroupContent,
  SidebarGroupLabel,
  SidebarHeader,
  SidebarMenu,
  SidebarMenuButton,
  SidebarMenuItem,
  useSidebar,
} from "@/components/ui/sidebar";

/**
 * TT-006 — DP Suite navigation sidebar.
 *
 * Renders the authenticated shell's primary navigation. Items are grouped by
 * domain (Operações / Cadastros / Conta) and the active route is highlighted
 * via TanStack Router's current pathname.
 */

type NavItem = { title: string; url: string; icon: typeof LayoutDashboard };

const operational: NavItem[] = [
  { title: "Dashboard", url: "/dashboard", icon: LayoutDashboard },
  { title: "Ações", url: "/actions", icon: ListChecks },
  { title: "Notificações", url: "/notifications", icon: Bell },
  { title: "Busca", url: "/search", icon: Search },
];

const registry: NavItem[] = [
  { title: "Clientes", url: "/clients", icon: Building2 },
  { title: "Embarcações", url: "/vessels", icon: Ship },
  { title: "Usuários", url: "/users", icon: Users },
];

const account: NavItem[] = [{ title: "Configurações", url: "/settings", icon: Settings }];

const administration: NavItem[] = [
  { title: "Organizations", url: "/organizations", icon: Landmark },
];

export function AppSidebar({ role }: { role: AppRole }) {
  const { state } = useSidebar();
  const collapsed = state === "collapsed";
  const pathname = useRouterState({ select: (r) => r.location.pathname });
  const isActive = (url: string) => pathname === url || pathname.startsWith(`${url}/`);

  const renderGroup = (label: string, items: NavItem[]) => (
    <SidebarGroup>
      {!collapsed && <SidebarGroupLabel>{label}</SidebarGroupLabel>}
      <SidebarGroupContent>
        <SidebarMenu>
          {items.map((item) => (
            <SidebarMenuItem key={item.url}>
              <SidebarMenuButton asChild isActive={isActive(item.url)} tooltip={item.title}>
                <Link to={item.url} className="flex items-center gap-2">
                  <item.icon className="h-4 w-4 shrink-0" />
                  {!collapsed && <span className="truncate">{item.title}</span>}
                </Link>
              </SidebarMenuButton>
            </SidebarMenuItem>
          ))}
        </SidebarMenu>
      </SidebarGroupContent>
    </SidebarGroup>
  );

  return (
    <Sidebar collapsible="icon">
      <SidebarHeader>
        <div className="flex items-center gap-2 px-2 py-1.5">
          <div className="grid h-8 w-8 shrink-0 place-items-center rounded-md bg-primary text-primary-foreground">
            <Anchor className="h-4 w-4" />
          </div>
          {!collapsed && (
            <div className="min-w-0">
              <p className="truncate text-sm font-semibold leading-tight">DP Suite</p>
              <p className="truncate text-[10px] uppercase tracking-widest text-muted-foreground">
                Governança DP
              </p>
            </div>
          )}
        </div>
      </SidebarHeader>
      <SidebarContent>
        {renderGroup("Operações", operational)}
        {renderGroup("Cadastros", registry)}
        {role === "system_admin" && renderGroup("Administração", administration)}
        {renderGroup("Conta", account)}
      </SidebarContent>
    </Sidebar>
  );
}
