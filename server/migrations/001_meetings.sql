-- SAFE PRODUCTION MIGRATION
-- Adds only the tables required by the Meetings & Discussions feature.
-- Does not drop, truncate, overwrite, or modify existing LifeBoost business data.

CREATE TABLE IF NOT EXISTS meetings (
  id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  organizer_user_id UUID NOT NULL REFERENCES users(id) ON DELETE CASCADE,
  title TEXT NOT NULL,
  agenda TEXT NOT NULL DEFAULT '',
  start_at TIMESTAMPTZ NOT NULL,
  duration_minutes INTEGER NOT NULL DEFAULT 60,
  status TEXT NOT NULL DEFAULT 'Scheduled' CHECK (status IN ('Scheduled','In progress','Completed','Cancelled')),
  meeting_url TEXT NOT NULL DEFAULT '',
  notes TEXT NOT NULL DEFAULT '',
  decisions TEXT NOT NULL DEFAULT '',
  action_items JSONB NOT NULL DEFAULT '[]'::jsonb,
  participant_user_ids JSONB NOT NULL DEFAULT '[]'::jsonb,
  created_at TIMESTAMPTZ NOT NULL DEFAULT NOW(),
  updated_at TIMESTAMPTZ NOT NULL DEFAULT NOW()
);

CREATE TABLE IF NOT EXISTS meeting_messages (
  id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  meeting_id UUID NOT NULL REFERENCES meetings(id) ON DELETE CASCADE,
  user_id UUID NOT NULL REFERENCES users(id) ON DELETE CASCADE,
  body TEXT NOT NULL,
  created_at TIMESTAMPTZ NOT NULL DEFAULT NOW()
);

CREATE INDEX IF NOT EXISTS meetings_organizer_idx ON meetings(organizer_user_id);
CREATE INDEX IF NOT EXISTS meeting_messages_meeting_idx ON meeting_messages(meeting_id, created_at);
