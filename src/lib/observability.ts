/**
 * DP Suite — Observabilidade mínima (TT-008).
 *
 * Módulo central de emissão de eventos estruturados e sanitizados no
 * frontend. Nenhum segredo, token, senha, cookie, header de autorização,
 * signed URL completa ou payload bruto do Supabase deve chegar ao
 * transport. A sanitização é feita recursivamente antes de qualquer
 * despacho.
 *
 * O módulo é intencionalmente autocontido: não depende de serviços
 * externos, não usa service_role e não faz requests HTTP. Em
 * development emite console estruturado; em staging/production o
 * transport padrão é no-op e pode ser substituído por um transport
 * seguro no futuro (ex.: rota interna própria).
 */

import { env } from "./env";

// ---------------------------------------------------------------------------
// Tipos públicos
// ---------------------------------------------------------------------------

export type Severity = "debug" | "info" | "warning" | "error" | "critical";

/**
 * Taxonomia mínima de eventos. Manter estável — quaisquer novos nomes
 * devem ser adicionados aqui e documentados em docs/observability.md.
 */
export type EventName =
  // Auth / sessão
  | "auth.login.attempt"
  | "auth.login.success"
  | "auth.login.failure"
  | "auth.logout"
  | "auth.session.restored"
  | "auth.session.invalid"
  | "auth.profile.blocked"
  // Backend genérico
  | "backend.request.failure"
  // Storage / evidências
  | "storage.upload.success"
  | "storage.upload.failure"
  | "storage.upload.compensating_cleanup"
  | "storage.upload.version_conflict"
  | "storage.signed_url.failure"
  // Notificações (reservado para futura instrumentação)
  | "notifications.dispatch.failure"
  // Erros de renderização
  | "ui.error_boundary.caught"
  // Diagnóstico controlado (dev only)
  | "dev.controlled_error";

export interface ObservabilityEvent {
  event_name: EventName;
  severity: Severity;
  timestamp: string;
  environment: string;
  correlation_id: string;
  user_id?: string;
  organization_id?: string;
  context?: Record<string, unknown>;
}

export interface EventInput {
  event_name: EventName;
  severity?: Severity;
  user_id?: string;
  organization_id?: string;
  context?: Record<string, unknown>;
  /** Sobrescreve o correlation_id (útil para propagar de um handler). */
  correlation_id?: string;
}

export type Transport = (event: ObservabilityEvent) => void;

// ---------------------------------------------------------------------------
// Sanitização / redaction
// ---------------------------------------------------------------------------

const REDACTED = "[REDACTED]";

/** Chaves cujo valor NUNCA deve ser logado, comparação case-insensitive. */
const SENSITIVE_KEY_PATTERNS: readonly RegExp[] = [
  /pass(word)?/i,
  /\btoken\b/i,
  /access[_-]?token/i,
  /refresh[_-]?token/i,
  /id[_-]?token/i,
  /authorization/i,
  /\bauth\b/i,
  /cookie/i,
  /set[_-]?cookie/i,
  /api[_-]?key/i,
  /service[_-]?role/i,
  /secret/i,
  /signed[_-]?url/i,
  /credential/i,
  /session/i,
];

const MAX_STRING_LEN = 500;
const MAX_DEPTH = 5;
const MAX_KEYS = 50;
const MAX_ARRAY = 50;

function isSensitiveKey(key: string): boolean {
  return SENSITIVE_KEY_PATTERNS.some((re) => re.test(key));
}

function truncateString(s: string): string {
  if (s.length <= MAX_STRING_LEN) return s;
  return `${s.slice(0, MAX_STRING_LEN)}…[+${s.length - MAX_STRING_LEN} chars]`;
}

/**
 * E-mails são potencialmente PII. Só o domínio é preservado para
 * diagnóstico; o local-part é substituído por `***`. Retorna o valor
 * inalterado se não parecer um e-mail.
 */
export function maskEmail(raw: unknown): string | undefined {
  if (typeof raw !== "string") return undefined;
  const at = raw.indexOf("@");
  if (at <= 0 || at === raw.length - 1) return undefined;
  return `***@${raw.slice(at + 1)}`;
}

/**
 * Máscara de URLs assinadas: mantém apenas origin + pathname; todos os
 * query params (que carregam o token de assinatura) são descartados.
 */
export function maskSignedUrl(raw: unknown): string | undefined {
  if (typeof raw !== "string") return undefined;
  try {
    const u = new URL(raw);
    return `${u.origin}${u.pathname}?[signature-redacted]`;
  } catch {
    return "[invalid-url]";
  }
}

/**
 * Sanitização recursiva. Percorre objetos/arrays limitando profundidade,
 * número de chaves e tamanho de strings, e redigindo qualquer valor cuja
 * chave case como sensível. Trata `Error` e `Response` de forma segura.
 */
export function sanitize(
  value: unknown,
  depth = 0,
  seen: WeakSet<object> = new WeakSet(),
): unknown {
  if (value === null || value === undefined) return value;
  const t = typeof value;
  if (t === "string") return truncateString(value as string);
  if (t === "number" || t === "boolean" || t === "bigint") return value;
  if (t === "function" || t === "symbol") return `[${t}]`;

  if (depth >= MAX_DEPTH) return "[MAX_DEPTH]";

  if (value instanceof Error) {
    return {
      name: value.name,
      message: truncateString(value.message ?? ""),
      // Stack pode conter caminhos internos, mas não segredos; ainda assim
      // truncamos para evitar poluição do transport.
      stack: value.stack ? truncateString(value.stack) : undefined,
    };
  }

  if (typeof Response !== "undefined" && value instanceof Response) {
    return { kind: "Response", status: value.status, statusText: value.statusText };
  }

  if (Array.isArray(value)) {
    if (seen.has(value)) return "[CIRCULAR]";
    seen.add(value);
    const out = value.slice(0, MAX_ARRAY).map((v) => sanitize(v, depth + 1, seen));
    if (value.length > MAX_ARRAY) out.push(`[+${value.length - MAX_ARRAY} items]`);
    return out;
  }

  if (t === "object") {
    const obj = value as Record<string, unknown>;
    if (seen.has(obj)) return "[CIRCULAR]";
    seen.add(obj);
    const out: Record<string, unknown> = {};
    let count = 0;
    for (const key of Object.keys(obj)) {
      if (count >= MAX_KEYS) {
        out["__truncated__"] = `+${Object.keys(obj).length - count} keys`;
        break;
      }
      count++;
      if (isSensitiveKey(key)) {
        out[key] = REDACTED;
        continue;
      }
      out[key] = sanitize(obj[key], depth + 1, seen);
    }
    return out;
  }

  return String(value);
}

// ---------------------------------------------------------------------------
// Correlation IDs
// ---------------------------------------------------------------------------

/** Gera um correlation ID (UUID v4 quando disponível; fallback determinístico). */
export function generateCorrelationId(): string {
  const c: Crypto | undefined =
    typeof globalThis !== "undefined" ? (globalThis as { crypto?: Crypto }).crypto : undefined;
  if (c && typeof c.randomUUID === "function") return c.randomUUID();
  const bytes = new Uint8Array(16);
  if (c && typeof c.getRandomValues === "function") {
    c.getRandomValues(bytes);
  } else {
    for (let i = 0; i < 16; i++) bytes[i] = Math.floor(Math.random() * 256);
  }
  bytes[6] = (bytes[6] & 0x0f) | 0x40;
  bytes[8] = (bytes[8] & 0x3f) | 0x80;
  const h = (n: number) => n.toString(16).padStart(2, "0");
  const b = Array.from(bytes, h).join("");
  return `${b.slice(0, 8)}-${b.slice(8, 12)}-${b.slice(12, 16)}-${b.slice(16, 20)}-${b.slice(20)}`;
}

let sessionCorrelationId: string | null = null;

/**
 * Retorna o correlation ID de sessão do frontend. Sobrevive à navegação
 * enquanto a página não é recarregada, permitindo correlacionar múltiplos
 * eventos disparados pelo mesmo usuário.
 */
export function getSessionCorrelationId(): string {
  if (!sessionCorrelationId) sessionCorrelationId = generateCorrelationId();
  return sessionCorrelationId;
}

/** Apenas para testes — reinicia o correlation ID de sessão. */
export function __resetSessionCorrelationIdForTests(): void {
  sessionCorrelationId = null;
}

// ---------------------------------------------------------------------------
// Transport
// ---------------------------------------------------------------------------

function consoleTransport(event: ObservabilityEvent): void {
  const label = `[observability] ${event.severity} ${event.event_name}`;
  const fn =
    event.severity === "error" || event.severity === "critical"
      ? console.error
      : event.severity === "warning"
        ? console.warn
        : console.info;
  // Estruturado, sem interpolação — o dev tools mostra objeto expandível.
  fn(label, event);
}

function noopTransport(_event: ObservabilityEvent): void {
  // Placeholder seguro para staging/production até que um transport
  // interno próprio (rota own-hosted, sem service_role) seja aprovado.
}

let activeTransport: Transport = env.appEnv === "development" ? consoleTransport : noopTransport;

/** Substitui o transport ativo (útil para testes e para futuros sinks). */
export function setTransport(transport: Transport): void {
  activeTransport = transport;
}

/** Restaura o transport padrão do ambiente atual. */
export function resetTransport(): void {
  activeTransport = env.appEnv === "development" ? consoleTransport : noopTransport;
}

// ---------------------------------------------------------------------------
// API pública
// ---------------------------------------------------------------------------

function defaultSeverityFor(name: EventName): Severity {
  if (name === "ui.error_boundary.caught") return "critical";
  if (
    name === "auth.login.failure" ||
    name === "auth.session.invalid" ||
    name === "auth.profile.blocked" ||
    name === "backend.request.failure" ||
    name === "storage.upload.failure" ||
    name === "storage.signed_url.failure" ||
    name === "notifications.dispatch.failure"
  ) {
    return "error";
  }
  if (
    name === "storage.upload.compensating_cleanup" ||
    name === "storage.upload.version_conflict"
  ) {
    return "warning";
  }
  if (name === "dev.controlled_error") return "error";
  return "info";
}

/**
 * Emite um evento estruturado. Todo o campo `context` é sanitizado
 * recursivamente antes de qualquer transport ver os dados.
 */
export function emitEvent(input: EventInput): ObservabilityEvent {
  const event: ObservabilityEvent = {
    event_name: input.event_name,
    severity: input.severity ?? defaultSeverityFor(input.event_name),
    timestamp: new Date().toISOString(),
    environment: env.appEnv,
    correlation_id: input.correlation_id ?? getSessionCorrelationId(),
    user_id: input.user_id,
    organization_id: input.organization_id,
    context: input.context ? (sanitize(input.context) as Record<string, unknown>) : undefined,
  };
  try {
    activeTransport(event);
  } catch {
    // Um transport quebrado nunca pode derrubar o fluxo funcional.
  }
  return event;
}

/**
 * Helper para reportar exceções normalizando `Error`, `Response` e
 * strings. O evento associado é `ui.error_boundary.caught` por padrão,
 * mas o chamador pode escolher outro nome coerente.
 */
export function reportError(
  error: unknown,
  input: Omit<EventInput, "event_name"> & { event_name?: EventName } = {},
): ObservabilityEvent {
  const context = { ...(input.context ?? {}), error: sanitize(error) };
  return emitEvent({
    event_name: input.event_name ?? "ui.error_boundary.caught",
    severity: input.severity ?? "critical",
    correlation_id: input.correlation_id,
    user_id: input.user_id,
    organization_id: input.organization_id,
    context,
  });
}
