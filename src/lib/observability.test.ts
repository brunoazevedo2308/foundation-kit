import { describe, expect, it, vi, beforeEach, afterEach } from "vitest";

import {
  emitEvent,
  generateCorrelationId,
  getSessionCorrelationId,
  maskEmail,
  maskSignedUrl,
  reportError,
  resetTransport,
  sanitize,
  setTransport,
  __resetSessionCorrelationIdForTests,
  type ObservabilityEvent,
} from "./observability";

describe("sanitize", () => {
  it("redacts sensitive keys case-insensitively", () => {
    const out = sanitize({
      password: "hunter2",
      Password: "hunter2",
      access_token: "abc",
      refresh_token: "xyz",
      Authorization: "Bearer 123",
      cookie: "sid=1",
      apiKey: "k",
      service_role: "sr",
      signedUrl: "https://example.com/x?token=1",
      Session: { user: "u" },
      safe: "ok",
    }) as Record<string, unknown>;
    for (const key of [
      "password",
      "Password",
      "access_token",
      "refresh_token",
      "Authorization",
      "cookie",
      "apiKey",
      "service_role",
      "signedUrl",
      "Session",
    ]) {
      expect(out[key]).toBe("[REDACTED]");
    }
    expect(out.safe).toBe("ok");
  });

  it("truncates strings and objects deeply", () => {
    const long = "a".repeat(1000);
    const out = sanitize({ v: long }) as { v: string };
    expect(out.v.length).toBeLessThanOrEqual(520);
    expect(out.v.endsWith("chars]")).toBe(true);
  });

  it("caps depth", () => {
    const deep: Record<string, unknown> = {};
    let cur: Record<string, unknown> = deep;
    for (let i = 0; i < 20; i++) {
      cur.next = {};
      cur = cur.next as Record<string, unknown>;
    }
    cur.leaf = "x";
    const out = sanitize(deep) as Record<string, unknown>;
    // Walk until we hit the sentinel.
    let cursor: unknown = out;
    let found = false;
    for (let i = 0; i < 10; i++) {
      if (cursor === "[MAX_DEPTH]") {
        found = true;
        break;
      }
      cursor = (cursor as Record<string, unknown>).next;
    }
    expect(found).toBe(true);
  });

  it("handles circular references", () => {
    const a: Record<string, unknown> = { name: "a" };
    a.self = a;
    const out = sanitize(a) as Record<string, unknown>;
    expect(out.self).toBe("[CIRCULAR]");
  });

  it("normalizes Error and Response objects", () => {
    const err = new Error("boom");
    const out = sanitize(err) as { name: string; message: string };
    expect(out.name).toBe("Error");
    expect(out.message).toBe("boom");
    const resp = new Response("no", { status: 401, statusText: "Nope" });
    const outR = sanitize(resp) as { kind: string; status: number };
    expect(outR.kind).toBe("Response");
    expect(outR.status).toBe(401);
  });

  it("truncates large arrays", () => {
    const arr = Array.from({ length: 200 }, (_, i) => i);
    const out = sanitize(arr) as unknown[];
    expect(out.length).toBeLessThanOrEqual(51);
    expect(String(out[out.length - 1])).toMatch(/\+/);
  });
});

describe("maskEmail / maskSignedUrl", () => {
  it("masks the local-part of an email", () => {
    expect(maskEmail("john.doe@example.com")).toBe("***@example.com");
    expect(maskEmail("not-an-email")).toBeUndefined();
  });
  it("drops query params of signed URLs", () => {
    expect(maskSignedUrl("https://x.supabase.co/storage/v1/object/sign/foo?token=SECRET")).toBe(
      "https://x.supabase.co/storage/v1/object/sign/foo?[signature-redacted]",
    );
    expect(maskSignedUrl("not a url")).toBe("[invalid-url]");
  });
});

describe("correlation id", () => {
  beforeEach(() => __resetSessionCorrelationIdForTests());
  it("returns a stable session id", () => {
    const a = getSessionCorrelationId();
    const b = getSessionCorrelationId();
    expect(a).toBe(b);
    expect(a).toMatch(/^[0-9a-f-]{36}$/i);
  });
  it("generates distinct one-off ids", () => {
    const a = generateCorrelationId();
    const b = generateCorrelationId();
    expect(a).not.toBe(b);
  });
});

describe("transport + emitEvent", () => {
  const events: ObservabilityEvent[] = [];
  beforeEach(() => {
    events.length = 0;
    setTransport((e) => events.push(e));
    __resetSessionCorrelationIdForTests();
  });
  afterEach(() => resetTransport());

  it("emits a fully-formed event with defaults", () => {
    emitEvent({ event_name: "auth.login.attempt", context: { hint: "ok" } });
    expect(events).toHaveLength(1);
    const e = events[0];
    expect(e.event_name).toBe("auth.login.attempt");
    expect(e.severity).toBe("info");
    expect(e.correlation_id).toMatch(/^[0-9a-f-]{36}$/i);
    expect(e.timestamp).toMatch(/\d{4}-\d{2}-\d{2}T/);
    expect(e.environment).toBeTruthy();
    expect((e.context as { hint: string }).hint).toBe("ok");
  });

  it("sanitizes context before dispatch", () => {
    emitEvent({
      event_name: "storage.upload.failure",
      context: { password: "leak", ok: "yes" },
    });
    const ctx = events[0].context as Record<string, unknown>;
    expect(ctx.password).toBe("[REDACTED]");
    expect(ctx.ok).toBe("yes");
  });

  it("assigns critical severity for boundary events", () => {
    reportError(new Error("bad"));
    expect(events[0].severity).toBe("critical");
    expect(events[0].event_name).toBe("ui.error_boundary.caught");
    const ctx = events[0].context as { error: { message: string } };
    expect(ctx.error.message).toBe("bad");
  });

  it("does not throw when transport throws", () => {
    setTransport(() => {
      throw new Error("transport dead");
    });
    expect(() => emitEvent({ event_name: "auth.login.attempt" })).not.toThrow();
  });

  it("supports custom severity and correlation id", () => {
    emitEvent({
      event_name: "auth.login.failure",
      severity: "warning",
      correlation_id: "cid-123",
      user_id: "u-1",
      organization_id: "o-1",
    });
    expect(events[0].severity).toBe("warning");
    expect(events[0].correlation_id).toBe("cid-123");
    expect(events[0].user_id).toBe("u-1");
    expect(events[0].organization_id).toBe("o-1");
  });
});

describe("integration signals for storage/auth", () => {
  const events: ObservabilityEvent[] = [];
  beforeEach(() => {
    events.length = 0;
    setTransport((e) => events.push(e));
  });
  afterEach(() => resetTransport());

  it("captures storage.upload.compensating_cleanup with warning severity", () => {
    emitEvent({ event_name: "storage.upload.compensating_cleanup" });
    expect(events[0].severity).toBe("warning");
  });

  it("captures auth.profile.blocked with error severity", () => {
    emitEvent({
      event_name: "auth.profile.blocked",
      context: { status: "inactive", email: "who@ex.com" },
    });
    expect(events[0].severity).toBe("error");
    const ctx = events[0].context as Record<string, unknown>;
    expect(ctx.status).toBe("inactive");
  });

  it("does not leak Authorization header when passed in context", () => {
    emitEvent({
      event_name: "backend.request.failure",
      context: { headers: { Authorization: "Bearer xyz" } },
    });
    const headers = (events[0].context as { headers: Record<string, unknown> }).headers;
    expect(headers.Authorization).toBe("[REDACTED]");
  });
});

describe("reportError with unknown input", () => {
  const events: ObservabilityEvent[] = [];
  beforeEach(() => {
    events.length = 0;
    setTransport(vi.fn((e) => events.push(e)));
  });
  afterEach(() => resetTransport());

  it("accepts strings and non-Error values", () => {
    reportError("string boom", { event_name: "dev.controlled_error" });
    expect(events[0].event_name).toBe("dev.controlled_error");
    expect((events[0].context as { error: unknown }).error).toBe("string boom");
  });
});
