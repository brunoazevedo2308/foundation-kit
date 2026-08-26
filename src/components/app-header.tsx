import { Link, useRouter, useRouterState } from "@tanstack/react-router";
import { Bell, LogOut, Search } from "lucide-react";
import { useMemo, useState } from "react";

import {
  Breadcrumb,
  BreadcrumbItem,
  BreadcrumbLink,
  BreadcrumbList,
  BreadcrumbPage,
  BreadcrumbSeparator,
} from "@/components/ui/breadcrumb";
import { Button } from "@/components/ui/button";
import {
  DropdownMenu,
  DropdownMenuContent,
  DropdownMenuItem,
  DropdownMenuLabel,
  DropdownMenuSeparator,
  DropdownMenuTrigger,
} from "@/components/ui/dropdown-menu";
import { Input } from "@/components/ui/input";
import { Separator } from "@/components/ui/separator";
import { SidebarTrigger } from "@/components/ui/sidebar";
import { Tooltip, TooltipContent, TooltipProvider, TooltipTrigger } from "@/components/ui/tooltip";
import { NotificationBadge } from "@/components/notification-badge";
import { useUnreadNotifications } from "@/hooks/use-unread-notifications";
import { signOut } from "@/lib/auth";

const LABELS: Record<string, string> = {
  dashboard: "Dashboard",
  actions: "Ações",
  clients: "Clientes",
  vessels: "Embarcações",
  users: "Usuários",
  notifications: "Notificações",
  settings: "Configurações",
  search: "Busca",
  app: "Aplicação",
  organizations: "Organizations",
  new: "Novo",
  edit: "Editar",
};

function labelFor(segment: string) {
  return LABELS[segment] ?? segment.charAt(0).toUpperCase() + segment.slice(1);
}

type HeaderProps = {
  displayName: string;
  organizationName: string;
  email: string;
};

export function AppHeader({ displayName, organizationName, email }: HeaderProps) {
  const router = useRouter();
  const pathname = useRouterState({ select: (r) => r.location.pathname });
  const [busy, setBusy] = useState(false);
  const [query, setQuery] = useState("");
  const unread = useUnreadNotifications();

  const crumbs = useMemo(() => {
    const parts = pathname.split("/").filter(Boolean);
    return parts.map((segment, i) => ({
      segment,
      label: labelFor(segment),
      href: "/" + parts.slice(0, i + 1).join("/"),
      isLast: i === parts.length - 1,
    }));
  }, [pathname]);

  const initials = displayName
    .split(" ")
    .map((n) => n[0])
    .filter(Boolean)
    .slice(0, 2)
    .join("")
    .toUpperCase();

  function handleSearchSubmit(event: React.FormEvent<HTMLFormElement>) {
    event.preventDefault();
    void router.navigate({ to: "/search", search: { q: query.trim() } });
  }

  async function handleSignOut() {
    setBusy(true);
    try {
      await signOut();
      await router.navigate({ to: "/login", replace: true });
    } finally {
      setBusy(false);
    }
  }

  return (
    <TooltipProvider>
      <header className="sticky top-0 z-30 flex h-14 shrink-0 items-center gap-2 border-b border-border bg-background/95 px-4 backdrop-blur">
        <SidebarTrigger />
        <Separator orientation="vertical" className="mx-1 h-5" />
        <Breadcrumb className="min-w-0 flex-1">
          <BreadcrumbList>
            {crumbs.length === 0 ? (
              <BreadcrumbItem>
                <BreadcrumbPage>Início</BreadcrumbPage>
              </BreadcrumbItem>
            ) : (
              crumbs.map((c) => (
                <div key={c.href} className="flex items-center gap-1.5">
                  <BreadcrumbSeparator className="first:hidden" />
                  <BreadcrumbItem>
                    {c.isLast ? (
                      <BreadcrumbPage className="truncate">{c.label}</BreadcrumbPage>
                    ) : (
                      <BreadcrumbLink asChild>
                        <Link to={c.href}>{c.label}</Link>
                      </BreadcrumbLink>
                    )}
                  </BreadcrumbItem>
                </div>
              ))
            )}
          </BreadcrumbList>
        </Breadcrumb>
        <nav aria-label="Ações rápidas" className="flex items-center gap-1">
          <form role="search" onSubmit={handleSearchSubmit} className="hidden sm:block">
            <label htmlFor="global-search" className="sr-only">
              Buscar no DP Suite
            </label>
            <div className="relative">
              <Search className="pointer-events-none absolute left-2 top-1/2 h-4 w-4 -translate-y-1/2 text-muted-foreground" />
              <Input
                id="global-search"
                value={query}
                onChange={(e) => setQuery(e.target.value)}
                placeholder="Buscar..."
                className="h-9 w-40 pl-8 md:w-64"
              />
            </div>
          </form>
          <Tooltip>
            <TooltipTrigger asChild>
              <Button variant="ghost" size="icon" asChild aria-label="Buscar">
                <Link to="/search" search={{ q: "" }} className="sm:hidden">
                  <Search className="h-5 w-5" />
                </Link>
              </Button>
            </TooltipTrigger>
            <TooltipContent side="bottom">Buscar</TooltipContent>
          </Tooltip>
          <Tooltip>
            <TooltipTrigger asChild>
              <Button
                variant="ghost"
                size="icon"
                asChild
                aria-label={
                  unread && unread > 0 ? `Notificações (${unread} não lidas)` : "Notificações"
                }
              >
                <Link to="/notifications" className="relative">
                  <Bell className="h-5 w-5" />
                  <NotificationBadge
                    decorative
                    className="absolute -right-0.5 -top-0.5 h-4 min-w-4 text-[9px]"
                  />
                </Link>
              </Button>
            </TooltipTrigger>
            <TooltipContent side="bottom">Notificações</TooltipContent>
          </Tooltip>
        </nav>
        <DropdownMenu>
          <DropdownMenuTrigger asChild>
            <Button variant="ghost" size="sm" className="gap-2">
              <span className="grid h-7 w-7 place-items-center rounded-full bg-primary text-xs font-semibold text-primary-foreground">
                {initials || "?"}
              </span>
              <span className="hidden text-sm font-medium sm:inline">{displayName}</span>
            </Button>
          </DropdownMenuTrigger>
          <DropdownMenuContent align="end" className="w-64">
            <DropdownMenuLabel>
              <div className="flex flex-col">
                <span className="truncate text-sm font-medium">{displayName}</span>
                <span className="truncate text-xs text-muted-foreground">{email}</span>
                <span className="mt-1 truncate text-[10px] uppercase tracking-widest text-muted-foreground">
                  {organizationName}
                </span>
              </div>
            </DropdownMenuLabel>
            <DropdownMenuSeparator />
            <DropdownMenuItem asChild>
              <Link to="/settings">Configurações</Link>
            </DropdownMenuItem>
            <DropdownMenuSeparator />
            <DropdownMenuItem disabled={busy} onSelect={handleSignOut}>
              <LogOut className="mr-2 h-4 w-4" />
              {busy ? "Saindo..." : "Sair"}
            </DropdownMenuItem>
          </DropdownMenuContent>
        </DropdownMenu>
      </header>
    </TooltipProvider>
  );
}
