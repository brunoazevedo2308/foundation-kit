-- TT-003.5 — Collaboration, notifications and audit tables
-- Adds: user_vessels, evidences, comments, attachments, notifications, audit_events
-- RLS is enabled on all tables; NO policies are created (deferred to TT-004).

-- =========================================================================
-- user_vessels — assignment of profiles to vessels
-- =========================================================================
CREATE TABLE public.user_vessels (
  organization_id uuid NOT NULL REFERENCES public.organizations(id) ON DELETE RESTRICT,
  profile_id      uuid NOT NULL REFERENCES public.profiles(id)      ON DELETE CASCADE,
  vessel_id       uuid NOT NULL REFERENCES public.vessels(id)       ON DELETE CASCADE,
  assigned_by     uuid NULL     REFERENCES public.profiles(id)      ON DELETE SET NULL,
  assigned_at     timestamptz NOT NULL DEFAULT now(),
  PRIMARY KEY (profile_id, vessel_id)
);

CREATE INDEX user_vessels_organization_id_idx ON public.user_vessels (organization_id);
CREATE INDEX user_vessels_vessel_id_idx       ON public.user_vessels (vessel_id);
CREATE INDEX user_vessels_profile_id_idx      ON public.user_vessels (profile_id);

GRANT SELECT, INSERT, UPDATE, DELETE ON public.user_vessels TO authenticated;
GRANT ALL ON public.user_vessels TO service_role;

ALTER TABLE public.user_vessels ENABLE ROW LEVEL SECURITY;

-- =========================================================================
-- evidences — files attached to deliverables (versioned)
-- =========================================================================
CREATE TABLE public.evidences (
  id              uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  organization_id uuid NOT NULL REFERENCES public.organizations(id) ON DELETE RESTRICT,
  deliverable_id  uuid NOT NULL REFERENCES public.deliverables(id)  ON DELETE RESTRICT,
  title           text NOT NULL,
  description     text NULL,
  storage_path    text NOT NULL,
  file_name       text NOT NULL,
  mime_type       text NULL,
  size_bytes      bigint NULL CHECK (size_bytes IS NULL OR size_bytes >= 0),
  version_number  integer NOT NULL DEFAULT 1 CHECK (version_number > 0),
  uploaded_by     uuid NOT NULL REFERENCES public.profiles(id) ON DELETE RESTRICT,
  created_at      timestamptz NOT NULL DEFAULT now(),
  updated_at      timestamptz NOT NULL DEFAULT now(),
  deleted_at      timestamptz NULL
);

CREATE INDEX evidences_organization_id_idx ON public.evidences (organization_id);
CREATE INDEX evidences_deliverable_id_idx  ON public.evidences (deliverable_id);
CREATE INDEX evidences_uploaded_by_idx     ON public.evidences (uploaded_by);
CREATE UNIQUE INDEX evidences_active_version_file_uniq
  ON public.evidences (deliverable_id, version_number, file_name)
  WHERE deleted_at IS NULL;

CREATE TRIGGER evidences_set_updated_at
  BEFORE UPDATE ON public.evidences
  FOR EACH ROW EXECUTE FUNCTION public.set_updated_at();

GRANT SELECT, INSERT, UPDATE, DELETE ON public.evidences TO authenticated;
GRANT ALL ON public.evidences TO service_role;

ALTER TABLE public.evidences ENABLE ROW LEVEL SECURITY;

-- =========================================================================
-- comments — comments on actions or deliverables (exactly one context)
-- =========================================================================
CREATE TABLE public.comments (
  id              uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  organization_id uuid NOT NULL REFERENCES public.organizations(id) ON DELETE RESTRICT,
  action_id       uuid NULL REFERENCES public.actions(id)       ON DELETE RESTRICT,
  deliverable_id  uuid NULL REFERENCES public.deliverables(id)  ON DELETE RESTRICT,
  author_user_id  uuid NOT NULL REFERENCES public.profiles(id)  ON DELETE RESTRICT,
  body            text NOT NULL CHECK (btrim(body) <> ''),
  created_at      timestamptz NOT NULL DEFAULT now(),
  updated_at      timestamptz NOT NULL DEFAULT now(),
  deleted_at      timestamptz NULL,
  CONSTRAINT comments_exactly_one_context CHECK (
    (action_id IS NOT NULL)::int + (deliverable_id IS NOT NULL)::int = 1
  )
);

CREATE INDEX comments_organization_id_idx ON public.comments (organization_id);
CREATE INDEX comments_action_id_idx       ON public.comments (action_id)      WHERE action_id IS NOT NULL;
CREATE INDEX comments_deliverable_id_idx  ON public.comments (deliverable_id) WHERE deliverable_id IS NOT NULL;
CREATE INDEX comments_author_user_id_idx  ON public.comments (author_user_id);

CREATE TRIGGER comments_set_updated_at
  BEFORE UPDATE ON public.comments
  FOR EACH ROW EXECUTE FUNCTION public.set_updated_at();

GRANT SELECT, INSERT, UPDATE, DELETE ON public.comments TO authenticated;
GRANT ALL ON public.comments TO service_role;

ALTER TABLE public.comments ENABLE ROW LEVEL SECURITY;

-- =========================================================================
-- attachments — files attached to actions, deliverables, or comments
-- =========================================================================
CREATE TABLE public.attachments (
  id              uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  organization_id uuid NOT NULL REFERENCES public.organizations(id) ON DELETE RESTRICT,
  action_id       uuid NULL REFERENCES public.actions(id)       ON DELETE RESTRICT,
  deliverable_id  uuid NULL REFERENCES public.deliverables(id)  ON DELETE RESTRICT,
  comment_id      uuid NULL REFERENCES public.comments(id)      ON DELETE RESTRICT,
  file_name       text NOT NULL,
  storage_path    text NOT NULL,
  mime_type       text NULL,
  size_bytes      bigint NULL CHECK (size_bytes IS NULL OR size_bytes >= 0),
  uploaded_by     uuid NOT NULL REFERENCES public.profiles(id) ON DELETE RESTRICT,
  created_at      timestamptz NOT NULL DEFAULT now(),
  updated_at      timestamptz NOT NULL DEFAULT now(),
  deleted_at      timestamptz NULL,
  CONSTRAINT attachments_exactly_one_context CHECK (
    (action_id IS NOT NULL)::int
    + (deliverable_id IS NOT NULL)::int
    + (comment_id IS NOT NULL)::int = 1
  )
);

CREATE INDEX attachments_organization_id_idx ON public.attachments (organization_id);
CREATE INDEX attachments_action_id_idx       ON public.attachments (action_id)      WHERE action_id IS NOT NULL;
CREATE INDEX attachments_deliverable_id_idx  ON public.attachments (deliverable_id) WHERE deliverable_id IS NOT NULL;
CREATE INDEX attachments_comment_id_idx      ON public.attachments (comment_id)     WHERE comment_id IS NOT NULL;
CREATE INDEX attachments_uploaded_by_idx     ON public.attachments (uploaded_by);

CREATE TRIGGER attachments_set_updated_at
  BEFORE UPDATE ON public.attachments
  FOR EACH ROW EXECUTE FUNCTION public.set_updated_at();

GRANT SELECT, INSERT, UPDATE, DELETE ON public.attachments TO authenticated;
GRANT ALL ON public.attachments TO service_role;

ALTER TABLE public.attachments ENABLE ROW LEVEL SECURITY;

-- =========================================================================
-- notifications — user-directed notifications (no soft delete)
-- =========================================================================
CREATE TABLE public.notifications (
  id                uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  organization_id   uuid NOT NULL REFERENCES public.organizations(id) ON DELETE RESTRICT,
  recipient_user_id uuid NOT NULL REFERENCES public.profiles(id) ON DELETE CASCADE,
  actor_user_id     uuid NULL     REFERENCES public.profiles(id) ON DELETE SET NULL,
  notification_type text NOT NULL,
  title             text NOT NULL,
  body              text NULL,
  entity_type       text NULL,
  entity_id         uuid NULL,
  read_at           timestamptz NULL,
  created_at        timestamptz NOT NULL DEFAULT now()
);

CREATE INDEX notifications_recipient_user_id_idx ON public.notifications (recipient_user_id);
CREATE INDEX notifications_organization_id_idx   ON public.notifications (organization_id);
CREATE INDEX notifications_unread_idx
  ON public.notifications (recipient_user_id, created_at DESC)
  WHERE read_at IS NULL;

GRANT SELECT, INSERT, UPDATE, DELETE ON public.notifications TO authenticated;
GRANT ALL ON public.notifications TO service_role;

ALTER TABLE public.notifications ENABLE ROW LEVEL SECURITY;

-- =========================================================================
-- audit_events — immutable audit log (no updated_at, no deleted_at)
-- =========================================================================
CREATE TABLE public.audit_events (
  id              uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  organization_id uuid NULL REFERENCES public.organizations(id) ON DELETE RESTRICT,
  actor_user_id   uuid NULL REFERENCES public.profiles(id) ON DELETE SET NULL,
  entity_type     text NOT NULL,
  entity_id       uuid NULL,
  event_type      text NOT NULL,
  event_data      jsonb NOT NULL DEFAULT '{}'::jsonb,
  created_at      timestamptz NOT NULL DEFAULT now()
);

CREATE INDEX audit_events_organization_id_idx    ON public.audit_events (organization_id);
CREATE INDEX audit_events_actor_user_id_idx      ON public.audit_events (actor_user_id);
CREATE INDEX audit_events_entity_idx             ON public.audit_events (entity_type, entity_id);
CREATE INDEX audit_events_created_at_desc_idx    ON public.audit_events (created_at DESC);

-- Immutable table: no updated_at trigger, no deleted_at column.
-- Enforce immutability at the database level: only INSERT and SELECT are allowed.
-- UPDATE and DELETE are blocked by triggers even for privileged roles that
-- may have inherited such rights, so the audit log cannot be tampered with.

CREATE OR REPLACE FUNCTION public.prevent_audit_event_mutation()
RETURNS trigger
LANGUAGE plpgsql
AS $$
BEGIN
  RAISE EXCEPTION 'audit_events is immutable: % is not allowed', TG_OP
    USING ERRCODE = 'insufficient_privilege';
END;
$$;

CREATE TRIGGER audit_events_prevent_update
  BEFORE UPDATE ON public.audit_events
  FOR EACH ROW EXECUTE FUNCTION public.prevent_audit_event_mutation();

CREATE TRIGGER audit_events_prevent_delete
  BEFORE DELETE ON public.audit_events
  FOR EACH ROW EXECUTE FUNCTION public.prevent_audit_event_mutation();

GRANT SELECT, INSERT ON public.audit_events TO authenticated;
GRANT SELECT, INSERT ON public.audit_events TO service_role;

ALTER TABLE public.audit_events ENABLE ROW LEVEL SECURITY;

