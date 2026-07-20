import { createFileRoute, Outlet, redirect } from "@tanstack/react-router";
import { supabase } from "@/lib/supabase";

/**
 * DP Suite — pathless authenticated layout (TT-005).
 *
 * Any route file under `src/routes/_authenticated/` is gated by this layout.
 * SSR is disabled because the Supabase session lives in the browser's
 * localStorage and cannot be read during server rendering.
 */
export const Route = createFileRoute("/_authenticated")({
  ssr: false,
  beforeLoad: async () => {
    if (!supabase) {
      throw redirect({ to: "/auth" });
    }
    const { data, error } = await supabase.auth.getUser();
    if (error || !data.user) {
      throw redirect({ to: "/auth" });
    }
    return { user: data.user };
  },
  component: () => <Outlet />,
});
