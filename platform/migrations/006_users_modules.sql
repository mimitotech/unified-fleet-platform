-- 006: Module definitions and tenant/user module permissions
CREATE TABLE module_definitions (
    id UUID PRIMARY KEY DEFAULT uuid_generate_v4(),
    key TEXT NOT NULL UNIQUE,
    label TEXT NOT NULL,
    description TEXT,
    icon TEXT,
    sort_order INTEGER NOT NULL DEFAULT 0,
    default_enabled BOOLEAN NOT NULL DEFAULT false,
    sources TEXT[] DEFAULT '{}'
);

CREATE TABLE tenant_modules (
    id UUID PRIMARY KEY DEFAULT uuid_generate_v4(),
    tenant_id UUID NOT NULL REFERENCES tenants(id) ON DELETE CASCADE,
    module_key TEXT NOT NULL REFERENCES module_definitions(key) ON DELETE CASCADE,
    is_enabled BOOLEAN NOT NULL DEFAULT true,
    UNIQUE (tenant_id, module_key)
);

CREATE TABLE user_modules (
    id UUID PRIMARY KEY DEFAULT uuid_generate_v4(),
    user_id UUID NOT NULL REFERENCES users(id) ON DELETE CASCADE,
    module_key TEXT NOT NULL REFERENCES module_definitions(key) ON DELETE CASCADE,
    is_enabled BOOLEAN NOT NULL,
    UNIQUE (user_id, module_key)
);
