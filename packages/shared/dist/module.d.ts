import type { SourceType } from './asset.js';
export interface ModuleDefinition {
    key: string;
    label: string;
    description?: string;
    icon?: string;
    sortOrder: number;
    defaultEnabled: boolean;
    sources: SourceType[];
}
export interface TenantModule {
    moduleKey: string;
    isEnabled: boolean;
    label: string;
    icon?: string;
    sources: SourceType[];
}
