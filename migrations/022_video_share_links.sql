-- 022: Time-limited public share links for surveillance clips
CREATE TABLE video_share_links (
    token TEXT PRIMARY KEY,
    tenant_id UUID NOT NULL REFERENCES tenants(id) ON DELETE CASCADE,
    clip_ref JSONB NOT NULL,
    label TEXT,
    expires_at TIMESTAMPTZ NOT NULL,
    created_by UUID REFERENCES users(id) ON DELETE SET NULL,
    created_at TIMESTAMPTZ NOT NULL DEFAULT NOW()
);

CREATE INDEX idx_video_share_links_tenant ON video_share_links(tenant_id, created_at DESC);
CREATE INDEX idx_video_share_links_expires ON video_share_links(expires_at);
