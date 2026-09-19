import { createClient } from "npm:@supabase/supabase-js@2";

const SUPABASE_URL = Deno.env.get("SUPABASE_URL") ?? "";
const SUPABASE_ANON_KEY = Deno.env.get("SUPABASE_ANON_KEY") ?? "";
const SUPABASE_SERVICE_ROLE_KEY = Deno.env.get("SUPABASE_SERVICE_ROLE_KEY") ?? "";
const APP_URL = (Deno.env.get("APP_URL") ?? "https://dp-suite-staging-git-codex-mvp-hardening-nobru2.vercel.app").replace(/\/$/, "");
const ENVIRONMENT = Deno.env.get("APP_ENV") ?? "development";

const allowedRoles = new Set(["system_admin", "organization_admin", "member"]);
const adminAssignableRoles = new Set(["organization_admin", "member"]);

function correlationId(): string {
  return crypto.randomUUID();
}

function isAllowedOrigin(origin?: string | null): origin is string {
  if (!origin) return false;
  if (origin === APP_URL || origin === "http://localhost:8080") return true;
  try {
    const url = new URL(origin);
    return (
      url.protocol === "https:" &&
      /^dp-suite-staging-[a-z0-9-]+-nobru2\.vercel\.app$/.test(url.hostname)
    );
  } catch {
    return false;
  }
}

function json(status: number, body: Record<string, unknown>, origin?: string | null): Response {
  const allowOrigin = isAllowedOrigin(origin) ? origin : APP_URL;
  return new Response(JSON.stringify(body), {
    status,
    headers: {
      "content-type": "application/json; charset=utf-8",
      "access-control-allow-origin": allowOrigin,
      "access-control-allow-headers": "authorization, x-client-info, apikey, content-type",
      "access-control-allow-methods": "POST, OPTIONS",
      "vary": "Origin",
    },
  });
}

function logEvent(input: {
  event_name: string;
  severity: "info" | "warning" | "error";
  correlation_id: string;
  actor_user_id?: string;
  organization_id?: string;
  context?: Record<string, unknown>;
}) {
  console.log(JSON.stringify({
    event_name: input.event_name,
    severity: input.severity,
    timestamp: new Date().toISOString(),
    environment: ENVIRONMENT,
    correlation_id: input.correlation_id,
    actor_user_id: input.actor_user_id,
    organization_id: input.organization_id,
    context: input.context,
  }));
}

function normalizeEmail(value: unknown): string | null {
  if (typeof value !== "string") return null;
  const email = value.trim().toLowerCase();
  if (email.length > 254 || !/^[^\s@]+@[^\s@]+\.[^\s@]+$/.test(email)) return null;
  return email;
}

function normalizeName(value: unknown): string | null {
  if (typeof value !== "string") return null;
  const name = value.trim().replace(/\s+/g, " ");
  return name.length >= 2 && name.length <= 120 ? name : null;
}

Deno.serve(async (req: Request) => {
  const cid = correlationId();
  const origin = req.headers.get("origin");

  if (req.method === "OPTIONS") return json(200, { ok: true }, origin);
  if (req.method !== "POST") return json(405, { ok: false, code: "validation_error", correlation_id: cid }, origin);

  if (!SUPABASE_URL || !SUPABASE_ANON_KEY || !SUPABASE_SERVICE_ROLE_KEY) {
    logEvent({ event_name: "users.invite.failure", severity: "error", correlation_id: cid, context: { stage: "configuration" } });
    return json(500, { ok: false, code: "temporary_error", correlation_id: cid }, origin);
  }

  const authHeader = req.headers.get("authorization");
  if (!authHeader?.startsWith("Bearer ")) {
    return json(401, { ok: false, code: "forbidden", correlation_id: cid }, origin);
  }

  const token = authHeader.slice("Bearer ".length);
  const callerClient = createClient(SUPABASE_URL, SUPABASE_ANON_KEY, {
    global: { headers: { Authorization: authHeader } },
    auth: { persistSession: false, autoRefreshToken: false },
  });
  const adminClient = createClient(SUPABASE_URL, SUPABASE_SERVICE_ROLE_KEY, {
    auth: { persistSession: false, autoRefreshToken: false },
  });

  const { data: userData, error: userError } = await callerClient.auth.getUser(token);
  if (userError || !userData.user) {
    return json(401, { ok: false, code: "forbidden", correlation_id: cid }, origin);
  }
  const actorId = userData.user.id;

  let payload: Record<string, unknown>;
  try {
    payload = await req.json();
  } catch {
    return json(400, { ok: false, code: "validation_error", correlation_id: cid }, origin);
  }

  const fullName = normalizeName(payload.full_name);
  const email = normalizeEmail(payload.email);
  const organizationId = typeof payload.organization_id === "string" ? payload.organization_id : "";
  const role = typeof payload.role === "string" ? payload.role : "";
  if (!fullName || !email || !organizationId || !allowedRoles.has(role)) {
    return json(400, { ok: false, code: "validation_error", correlation_id: cid }, origin);
  }

  const { data: actorProfile, error: actorError } = await adminClient
    .from("profiles")
    .select("id, organization_id, role, status, deleted_at")
    .eq("id", actorId)
    .maybeSingle();

  if (actorError || !actorProfile || actorProfile.deleted_at || actorProfile.status !== "active" || !["system_admin", "organization_admin"].includes(actorProfile.role)) {
    logEvent({ event_name: "users.invite.failure", severity: "warning", correlation_id: cid, actor_user_id: actorId, context: { stage: "authorization" } });
    return json(403, { ok: false, code: "forbidden", correlation_id: cid }, origin);
  }

  if (actorProfile.role === "organization_admin" && (actorProfile.organization_id !== organizationId || !adminAssignableRoles.has(role))) {
    return json(403, { ok: false, code: "forbidden", correlation_id: cid }, origin);
  }

  const { data: organization, error: organizationError } = await adminClient
    .from("organizations")
    .select("id, name, status, deleted_at")
    .eq("id", organizationId)
    .maybeSingle();

  if (organizationError || !organization || organization.deleted_at || organization.status !== "active") {
    return json(400, { ok: false, code: "validation_error", correlation_id: cid }, origin);
  }

  logEvent({ event_name: "users.invite.attempt", severity: "info", correlation_id: cid, actor_user_id: actorId, organization_id: organizationId, context: { role } });

  const { data: invited, error: inviteError } = await adminClient.auth.admin.inviteUserByEmail(email, {
    redirectTo: `${APP_URL}/reset-password`,
    data: { full_name: fullName },
  });

  if (inviteError || !invited.user) {
    const conflict = inviteError?.status === 422 || /already|registered|exists/i.test(inviteError?.message ?? "");
    logEvent({ event_name: "users.invite.failure", severity: "warning", correlation_id: cid, actor_user_id: actorId, organization_id: organizationId, context: { stage: "auth_invite", code: conflict ? "email_conflict" : "temporary_error" } });
    return json(conflict ? 409 : 503, { ok: false, code: conflict ? "email_conflict" : "temporary_error", correlation_id: cid }, origin);
  }

  const invitedUserId = invited.user.id;
  const { error: profileError } = await adminClient.from("profiles").insert({
    id: invitedUserId,
    organization_id: organizationId,
    full_name: fullName,
    role,
    status: "active",
  });

  if (profileError) {
    await adminClient.auth.admin.deleteUser(invitedUserId);
    logEvent({ event_name: "users.invite.failure", severity: "error", correlation_id: cid, actor_user_id: actorId, organization_id: organizationId, context: { stage: "profile_insert", compensated: true } });
    return json(503, { ok: false, code: "temporary_error", correlation_id: cid }, origin);
  }

  const { error: auditError } = await adminClient.from("audit_events").insert({
    organization_id: organizationId,
    actor_user_id: actorId,
    entity_type: "user",
    entity_id: invitedUserId,
    event_type: "user.invited",
    event_data: { role, invitation_method: "email" },
  });

  if (auditError) {
    await adminClient.from("profiles").delete().eq("id", invitedUserId);
    await adminClient.auth.admin.deleteUser(invitedUserId);
    logEvent({ event_name: "users.invite.failure", severity: "error", correlation_id: cid, actor_user_id: actorId, organization_id: organizationId, context: { stage: "audit_insert", compensated: true } });
    return json(503, { ok: false, code: "temporary_error", correlation_id: cid }, origin);
  }

  logEvent({ event_name: "users.invite.success", severity: "info", correlation_id: cid, actor_user_id: actorId, organization_id: organizationId, context: { invited_user_id: invitedUserId, role } });
  return json(201, {
    ok: true,
    correlation_id: cid,
    user: {
      id: invitedUserId,
      full_name: fullName,
      email_domain: email.split("@")[1],
      organization_id: organizationId,
      organization_name: organization.name,
      role,
    },
  }, origin);
});
