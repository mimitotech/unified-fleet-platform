import { useEffect, useState } from 'react';
import { useParams, Link, Navigate } from 'react-router-dom';
import { useQuery, useMutation, useQueryClient } from '@tanstack/react-query';
import { AdminLayout } from '@/components/admin/AdminLayout';
import { adminApi } from '@/lib/api';
import { BRAND } from '@/lib/branding';
import { notify, withToast } from '@/lib/notify';
import { FileUpload } from '@/components/shared/FileUpload';
import { LoadingButton } from '@/components/shared/LoadingButton';
import { Button } from '@/components/ui/button';
import { Input } from '@/components/ui/input';
import { Textarea } from '@/components/ui/textarea';
import { Card, CardContent, CardHeader, CardTitle, CardDescription } from '@/components/ui/card';
import { Tabs, TabsContent, TabsList, TabsTrigger } from '@/components/ui/tabs';
import { Switch } from '@/components/ui/switch';
import { Label } from '@/components/ui/label';
import { Badge } from '@/components/ui/badge';
import { Checkbox } from '@/components/ui/checkbox';
import {
  Select, SelectContent, SelectItem, SelectTrigger, SelectValue,
} from '@/components/ui/select';
import {
  Table, TableBody, TableCell, TableHead, TableHeader, TableRow,
} from '@/components/ui/table';
import { ExternalLink, RefreshCw, FileSpreadsheet, Trash2, Upload } from 'lucide-react';
import { PasswordInput } from '@/components/shared/PasswordInput';
import { useAuth } from '@/providers/AuthProvider';
import { isSuperAdmin, ROLE_LABELS } from '@/lib/systemRoles';
import { INTEGRATION_GUIDE, type IntegrationSource } from '@/lib/integrations';
import { WialonTenantLinkPanel } from '@/components/admin/WialonTenantLinkPanel';
import { ClientUserEditDialog, type ClientUserRow } from '@/components/admin/ClientUserEditDialog';
import { UserAccessEditor } from '@/components/admin/UserAccessEditor';
import { PortalLinksCard } from '@/components/admin/PortalLinksCard';
import { WialonUserImportCard } from '@/components/admin/WialonUserImportCard';
import { defaultModulesForRole } from '@/lib/userAccess';
import { FUEL_TABLE_COLUMN_DEFS } from '@/lib/fuelModuleConfig';
import { format } from 'date-fns';

type Tenant = Record<string, unknown>;
type Usage = { vehicles_used?: number; users_used?: number };

const UUID_RE = /^[0-9a-f]{8}-[0-9a-f]{4}-[1-5][0-9a-f]{3}-[89ab][0-9a-f]{3}-[0-9a-f]{12}$/i;

export default function TenantDetail() {
  const { id } = useParams<{ id: string }>();
  const qc = useQueryClient();
  const { user: authUser } = useAuth();
  const isValidId = !!id && UUID_RE.test(id);

  const { data: tenantData } = useQuery({
    queryKey: ['tenant', id],
    queryFn: () => adminApi.getTenant(id!),
    enabled: isValidId,
  });

  const { data: integrations } = useQuery({
    queryKey: ['integrations', id],
    queryFn: () => adminApi.getIntegrations(id!),
    enabled: isValidId,
  });

  const { data: modules } = useQuery({
    queryKey: ['adminModules', id],
    queryFn: () => adminApi.getModules(id!),
    enabled: isValidId,
  });

  const { data: reportCatalog } = useQuery({
    queryKey: ['tenantWialonReportCatalog', id],
    queryFn: () => adminApi.getTenantWialonReportCatalog(id!),
    enabled: isValidId,
  });

  const { data: fuelModuleConfig } = useQuery({
    queryKey: ['tenantFuelModuleConfig', id],
    queryFn: () => adminApi.getFuelModuleConfig(id!),
    enabled: isValidId,
  });

  const { data: stationSheets } = useQuery({
    queryKey: ['tenantFuelStationSheets', id],
    queryFn: () => adminApi.listFuelStationSheets(id!),
    enabled: isValidId,
  });

  const { data: users } = useQuery({
    queryKey: ['tenantUsers', id],
    queryFn: () => adminApi.listTenantUsers(id!),
    enabled: isValidId,
  });

  const { data: backupsData } = useQuery({
    queryKey: ['tenantBackups', id],
    queryFn: () => adminApi.getBackups(id!),
    enabled: isValidId,
  });

  const { data: auditLogs } = useQuery({
    queryKey: ['tenantAudit', id],
    queryFn: () => adminApi.getTenantAudit(id!),
    enabled: isValidId,
  });

  const { data: apiKeys } = useQuery({
    queryKey: ['tenantApiKeys', id],
    queryFn: () => adminApi.getApiKeys(id!),
    enabled: isValidId,
  });

  const { data: systemUsers } = useQuery({
    queryKey: ['systemUsers'],
    queryFn: () => adminApi.listSystemUsers(),
    enabled: isValidId && isSuperAdmin(authUser?.role),
  });

  const t = tenantData as Tenant | undefined;
  const usage = (t?.usage as Usage) || {};

  // General form state
  const [general, setGeneral] = useState({
    name: '', slug: '', contactEmail: '', phone: '', address: '', country: '',
    timezone: 'UTC', language: 'en', status: 'active',
    maxVehicles: 1000, maxUsers: 50, maxStorageGb: 100,
    assignedManagerId: '' as string | null,
  });

  // Branding
  const [branding, setBranding] = useState({
    primaryColor: BRAND.primary, secondaryColor: BRAND.secondary, accentColor: BRAND.accent,
    logoUrl: '', faviconUrl: '', customCss: '',
  });

  // Integrations
  const [wialonToken, setWialonToken] = useState('');
  const [wialonBaseUrl, setWialonBaseUrl] = useState('');
  const [wialonAccountId, setWialonAccountId] = useState('');
  const [wialonAccountName, setWialonAccountName] = useState('');
  const [wialonMotherAccountId, setWialonMotherAccountId] = useState('');
  const [wialonOperateAs, setWialonOperateAs] = useState('');
  const [loconavToken, setLoconavToken] = useState('');
  const [tracksolidAppKey, setTracksolidAppKey] = useState('');
  const [tracksolidAppSecret, setTracksolidAppSecret] = useState('');
  const [tracksolidAccount, setTracksolidAccount] = useState('');
  const [tracksolidPassword, setTracksolidPassword] = useState('');
  const [wialonUserIds, setWialonUserIds] = useState<number[]>([]);
  const [wialonTestResult, setWialonTestResult] = useState<{ unitCount: number; userCount: number } | null>(null);
  const [wialonTesting, setWialonTesting] = useState(false);

  const { data: wialonCenterStatus } = useQuery({
    queryKey: ['wialon-center-status'],
    queryFn: () => adminApi.getWialonCenterStatus(),
    staleTime: 60_000,
    refetchInterval: 60_000,
  });
  const wialonFromCenter = Boolean(wialonCenterStatus?.configured);

  // Users
  const [newUser, setNewUser] = useState({ email: '', password: '', fullName: '', role: 'viewer' });
  const [newUserModules, setNewUserModules] = useState<string[]>([]);
  const [editingTenantUser, setEditingTenantUser] = useState<ClientUserRow | null>(null);

  // API keys
  const [newKeyName, setNewKeyName] = useState('');
  const [selectedFuelReports, setSelectedFuelReports] = useState<
    Array<{ resourceId: number; templateId: number; templateName: string; module?: string; isGroupReport?: boolean }>
  >([]);
  const [visibleFuelColumns, setVisibleFuelColumns] = useState<string[]>([]);
  const [columnsByCategory, setColumnsByCategory] = useState<
    Record<'vehicle' | 'generator' | 'machinery', string[]>
  >({
    vehicle: [],
    generator: [],
    machinery: [],
  });
  const [fuelColumnCategory, setFuelColumnCategory] = useState<'vehicle' | 'generator' | 'machinery'>('vehicle');

  useEffect(() => {
    if (t) {
      setGeneral({
        name: String(t.name || ''),
        slug: String(t.slug || ''),
        contactEmail: String(t.contactEmail || ''),
        phone: String(t.phone || ''),
        address: String(t.address || ''),
        country: String(t.country || ''),
        timezone: String(t.timezone || 'UTC'),
        language: String(t.language || 'en'),
        status: String(t.status || 'active'),
        maxVehicles: Number(t.maxVehicles || 1000),
        maxUsers: Number(t.maxUsers || 50),
        maxStorageGb: Number(t.maxStorageGb || 100),
        assignedManagerId: String(t.assignedManagerId || '') || null,
      });
      setBranding({
        primaryColor: String(t.primaryColor || BRAND.primary),
        secondaryColor: String(t.secondaryColor || '#0f172a'),
        accentColor: String(t.accentColor || '#3b82f6'),
        logoUrl: String(t.logoUrl || ''),
        faviconUrl: String(t.faviconUrl || ''),
        customCss: String(t.customCss || ''),
      });
    }
  }, [t]);

  useEffect(() => {
    const wialon = (integrations as Array<Record<string, unknown>> | undefined)?.find(
      (i) => i.source_type === 'wialon'
    );
    if (!wialon) return;
    if (wialon.wialon_mother_account_id) {
      setWialonMotherAccountId(String(wialon.wialon_mother_account_id));
    }
    if (wialon.wialon_resource_id) {
      setWialonAccountId(String(wialon.wialon_resource_id));
    }
    if (wialon.wialon_account_name) {
      setWialonAccountName(String(wialon.wialon_account_name));
    }
    if (wialon.wialon_operate_as) {
      setWialonOperateAs(String(wialon.wialon_operate_as));
    }
    const meta = wialon.wialon_session_meta as Record<string, unknown> | undefined;
    const baseFromMeta = meta?.baseUrl as string | undefined;
    if (baseFromMeta) setWialonBaseUrl(baseFromMeta);
  }, [integrations]);

  useEffect(() => {
    if (!fuelModuleConfig) return;
    const cfg = fuelModuleConfig as {
      selectedReports?: Array<{ resourceId: number; templateId: number; templateName: string; module?: string; isGroupReport?: boolean }>;
      visibleColumns?: string[];
      columnsByCategory?: Partial<Record<'vehicle' | 'generator' | 'machinery', string[]>>;
    };
    const defaults = FUEL_TABLE_COLUMN_DEFS.map((c) => c.key);
    const visible = cfg.visibleColumns?.length ? cfg.visibleColumns : defaults;
    setSelectedFuelReports(cfg.selectedReports ?? []);
    setVisibleFuelColumns(visible);
    setColumnsByCategory({
      vehicle: cfg.columnsByCategory?.vehicle?.length ? cfg.columnsByCategory.vehicle : visible,
      generator: cfg.columnsByCategory?.generator?.length ? cfg.columnsByCategory.generator : visible,
      machinery: cfg.columnsByCategory?.machinery?.length ? cfg.columnsByCategory.machinery : visible,
    });
  }, [fuelModuleConfig]);

  const saveGeneral = useMutation({
    mutationFn: () => withToast(adminApi.updateTenant(id!, general), {
      loading: 'Saving settings...',
      success: 'General settings saved',
    }),
    onSuccess: () => {
      qc.invalidateQueries({ queryKey: ['tenant', id] });
      qc.invalidateQueries({ queryKey: ['tenant'] });
    },
  });

  const saveBranding = useMutation({
    mutationFn: () => withToast(adminApi.updateTenant(id!, branding), {
      loading: 'Saving branding...',
      success: 'Branding saved successfully',
    }),
    onSuccess: () => {
      qc.invalidateQueries({ queryKey: ['tenant', id] });
      qc.invalidateQueries({ queryKey: ['tenant'] });
    },
  });

  const buildWialonPayload = () => {
    const payload: Record<string, string> = { token: wialonToken.trim() };
    if (wialonBaseUrl.trim()) payload.baseUrl = wialonBaseUrl.trim();
    if (wialonAccountId.trim()) payload.accountId = wialonAccountId.trim();
    if (wialonOperateAs.trim()) payload.operateAs = wialonOperateAs.trim();
    return payload;
  };

  const saveWialon = useMutation({
    mutationFn: () => withToast(adminApi.saveIntegration(id!, 'wialon', buildWialonPayload()), {
      loading: 'Connecting Wialon...',
      success: 'Wialon connected',
    }),
    onSuccess: (data) => {
      const d = data as {
        assetCount?: number;
        sampleAssets?: Array<{ name: string; id: string }>;
        wialon?: { accountName?: string; meta?: Record<string, unknown> };
      };
      if (d.assetCount != null) setPreviewResults((prev) => ({ ...prev, wialon: d }));
      if (d.wialon?.accountName) {
        notify.success('Wialon hierarchy linked', d.wialon.accountName);
      }
      qc.invalidateQueries({ queryKey: ['integrations', id] });
      qc.invalidateQueries({ queryKey: ['wialon-hierarchy', id] });
    },
  });

  const linkWialonAccount = useMutation({
    mutationFn: ({
      accountId,
      accountName,
      userIds,
      motherAccountId,
    }: {
      accountId: string;
      accountName: string;
      userIds?: number[];
      motherAccountId?: string;
    }) =>
      withToast(
        adminApi.linkWialonAccount(id!, accountId, accountName, userIds, motherAccountId),
        {
          loading: 'Linking Wialon account…',
          success: 'Account linked and synced',
        }
      ),
    onSuccess: (data, vars) => {
      setWialonAccountId(vars.accountId);
      setWialonAccountName(vars.accountName);
      setWialonOperateAs('');
      const vehicles = data?.sync?.vehicles ?? data?.unitCount ?? 0;
      const created = data?.sync?.usersCreated ?? data?.provision?.created ?? 0;
      const updated = data?.sync?.usersUpdated ?? data?.provision?.updated ?? 0;
      const usersTotal = data?.sync?.usersTotal ?? data?.userCount ?? 0;
      notify.success(
        'Wialon account linked',
        `${data?.accountName || vars.accountName}: ${vehicles} vehicles, ${usersTotal} Wialon users (${created} new, ${updated} updated)`
      );
      qc.invalidateQueries({ queryKey: ['integrations', id] });
      qc.invalidateQueries({ queryKey: ['wialon-hierarchy', id] });
      qc.invalidateQueries({ queryKey: ['wialon-center-hierarchy'] });
      qc.invalidateQueries({ queryKey: ['tenant-users', id] });
    },
  });

  const saveLoconav = useMutation({
    mutationFn: () => withToast(adminApi.saveIntegration(id!, 'loconav', { userAuthentication: loconavToken.trim() }), {
      loading: 'Connecting LocoNav...',
      success: 'LocoNav connected',
    }),
    onSuccess: (data) => {
      const d = data as { assetCount?: number; sampleAssets?: Array<{ name: string; id: string }> };
      if (d.assetCount != null) setPreviewResults((prev) => ({ ...prev, loconav: d }));
      qc.invalidateQueries({ queryKey: ['integrations', id] });
    },
  });

  const saveTrackSolid = useMutation({
    mutationFn: () => withToast(adminApi.saveIntegration(id!, 'tracksolid', {
      appKey: tracksolidAppKey,
      appSecret: tracksolidAppSecret,
      account: tracksolidAccount,
      password: tracksolidPassword,
    }), {
      loading: 'Connecting TrackSolid Pro...',
      success: 'TrackSolid connected',
    }),
    onSuccess: (data) => {
      const d = data as { assetCount?: number; sampleAssets?: Array<{ name: string; id: string }> };
      if (d.assetCount != null) setPreviewResults((prev) => ({ ...prev, tracksolid: d }));
      qc.invalidateQueries({ queryKey: ['integrations', id] });
    },
  });

  const syncIntegration = useMutation({
    mutationFn: (source: string) => withToast(adminApi.syncIntegration(id!, source), {
      loading: 'Syncing data...',
      success: 'Sync completed',
    }),
    onSuccess: () => qc.invalidateQueries({ queryKey: ['integrations', id] }),
  });

  const [previewResults, setPreviewResults] = useState<Record<string, { assetCount?: number; sampleAssets?: Array<{ name: string; id: string }> }>>({});

  const getIntegration = (type: string) =>
    (integrations as Array<Record<string, unknown>>)?.find((i) => i.source_type === type);

  const testIntegration = useMutation({
    mutationFn: ({ source, credentials }: { source: string; credentials?: Record<string, unknown> }) =>
      adminApi.testIntegration(id!, source, credentials),
    onSuccess: (data, { source }) => {
      const d = data as { assetCount?: number; sampleAssets?: Array<{ name: string; id: string }> };
      setPreviewResults((prev) => ({ ...prev, [source]: d }));
      notify.success('Connection verified', `${d.assetCount ?? 0} assets found`);
      qc.invalidateQueries({ queryKey: ['integrations', id] });
    },
    onError: (err) => notify.error('Connection failed', (err as Error).message),
  });

  const buildCredentials = (source: IntegrationSource): Record<string, string> | null => {
    if (source === 'wialon') {
      const token = wialonToken.trim();
      if (!token) return null;
      const creds: Record<string, string> = { token };
      if (wialonBaseUrl.trim()) creds.baseUrl = wialonBaseUrl.trim();
      if (wialonAccountId.trim()) creds.accountId = wialonAccountId.trim();
      if (wialonOperateAs.trim()) creds.operateAs = wialonOperateAs.trim();
      return creds;
    }
    if (source === 'loconav') {
      const userAuthentication = loconavToken.trim();
      return userAuthentication ? { userAuthentication } : null;
    }
    const creds: Record<string, string> = {};
    if (tracksolidAppKey.trim()) creds.appKey = tracksolidAppKey.trim();
    if (tracksolidAppSecret.trim()) creds.appSecret = tracksolidAppSecret.trim();
    if (tracksolidAccount.trim()) creds.account = tracksolidAccount.trim();
    if (tracksolidPassword.trim()) creds.password = tracksolidPassword.trim();
    return Object.keys(creds).length ? creds : null;
  };

  const validateSave = (source: IntegrationSource): boolean => {
    const integ = getIntegration(source);
    if (source === 'wialon' && wialonFromCenter) {
      if (!wialonAccountId.trim()) {
        notify.error('Wialon account required', 'Select a client admin account from the Wialon Center tree');
        return false;
      }
      return true;
    }
    if (source === 'wialon' && !wialonToken.trim()) {
      notify.error('Wialon token required', INTEGRATION_GUIDE.wialon.fields[0].hint);
      return false;
    }
    if (source === 'loconav' && !loconavToken.trim()) {
      notify.error('LocoNav token required', INTEGRATION_GUIDE.loconav.fields[0].hint);
      return false;
    }
    if (source === 'tracksolid') {
      if (!tracksolidAppKey.trim() || !tracksolidAppSecret.trim() || !tracksolidAccount.trim()) {
        notify.error('TrackSolid fields incomplete', 'App Key, App Secret, and Account ID are required');
        return false;
      }
      if (!tracksolidPassword.trim() && !integ?.connection_verified_at) {
        notify.error('TrackSolid password required', 'Account password is required on first save');
        return false;
      }
    }
    return true;
  };

  const handleTestIntegration = (source: IntegrationSource) => {
    const creds = buildCredentials(source);
    const integ = getIntegration(source);
    if (!creds && !integ?.connection_verified_at) {
      notify.error('Enter credentials', `Fill in ${INTEGRATION_GUIDE[source].label} fields, then Test or Save`);
      return;
    }
    testIntegration.mutate({ source, credentials: creds ?? undefined });
  };

  const handleSaveIntegration = (source: IntegrationSource) => {
    if (!validateSave(source)) return;
    if (source === 'wialon' && wialonFromCenter) {
      linkWialonAccount.mutate({
        accountId: wialonAccountId,
        accountName: wialonAccountName,
        userIds: wialonUserIds.length ? wialonUserIds : undefined,
        motherAccountId: wialonMotherAccountId || undefined,
      });
      return;
    }
    if (source === 'wialon') saveWialon.mutate();
    else if (source === 'loconav') saveLoconav.mutate();
    else saveTrackSolid.mutate();
  };

  const activateTenant = useMutation({
    mutationFn: () => adminApi.activateTenant(id!),
    onMutate: () => ({ toastId: notify.loading('Activating tenant...') }),
    onSuccess: (data, _vars, context) => {
      if (context?.toastId) notify.dismiss(context.toastId);
      if (data.warnings?.length) {
        notify.success('Client activated', data.warnings[0]);
      } else {
        notify.success(
          'Client activated',
          `${data.verifiedIntegrations} integration(s) verified — users can sign in with MAMS credentials.`
        );
      }
      qc.invalidateQueries({ queryKey: ['tenant', id] });
    },
    onError: (err, _vars, context) => {
      if (context?.toastId) notify.dismiss(context.toastId);
      notify.error('Activation failed', (err as Error).message);
    },
  });

  const verifiedIntegrationCount = (
    (integrations as Array<Record<string, unknown>> | undefined) ?? []
  ).filter((i) => i.connection_verified_at).length;

  const applyRecommendedModules = useMutation({
    mutationFn: async () => {
      const rec = await adminApi.getRecommendedModules(id!);
      const modules = rec.map((m) => ({
        key: m.moduleKey,
        isEnabled: m.recommended,
        isVisible: true,
      }));
      return adminApi.updateModules(id!, modules);
    },
    onSuccess: () => {
      notify.success('Modules updated', 'Enabled modules matching connected systems');
      qc.invalidateQueries({ queryKey: ['adminModules', id] });
    },
  });

  const toggleModule = (key: string, isEnabled: boolean, isVisible?: boolean) => {
    const updated = (modules as Array<Record<string, unknown>> || []).map((m) => ({
      key: String(m.key),
      isEnabled: String(m.key) === key ? isEnabled : Boolean(m.is_enabled ?? m.isEnabled),
      isVisible: String(m.key) === key ? (isVisible ?? Boolean(m.is_visible ?? true)) : Boolean(m.is_visible ?? true),
    }));
    adminApi.updateModules(id!, updated).then(() => qc.invalidateQueries({ queryKey: ['adminModules', id] }));
  };

  const createUser = useMutation({
    mutationFn: () =>
      adminApi.createTenantUser(id!, {
        ...newUser,
        modules: newUserModules.length ? newUserModules : undefined,
      }),
    onSuccess: () => {
      qc.invalidateQueries({ queryKey: ['tenantUsers', id] });
      setNewUser({ email: '', password: '', fullName: '', role: 'viewer' });
      setNewUserModules([]);
      notify.success('User created');
    },
    onError: (e: Error) => notify.error('Create failed', e.message),
  });

  const deactivateUser = useMutation({
    mutationFn: (userId: string) => adminApi.deactivateTenantUser(id!, userId),
    onSuccess: () => {
      qc.invalidateQueries({ queryKey: ['tenantUsers', id] });
      notify.success('User deactivated');
    },
    onError: (e: Error) => notify.error('Deactivate failed', e.message),
  });

  const exportData = useMutation({
    mutationFn: () => adminApi.exportTenant(id!),
    onSuccess: (data) => {
      const blob = new Blob([JSON.stringify(data, null, 2)], { type: 'application/json' });
      const url = URL.createObjectURL(blob);
      const a = document.createElement('a');
      a.href = url;
      a.download = `tenant-${t?.slug}-export.json`;
      a.click();
    },
  });

  const createBackup = useMutation({
    mutationFn: () => adminApi.createBackup(id!),
    onSuccess: () => qc.invalidateQueries({ queryKey: ['tenantBackups', id] }),
  });

  const generateApiKey = useMutation({
    mutationFn: () => adminApi.createApiKey(id!, { name: newKeyName, permissions: ['read'] }),
    onSuccess: (data) => {
      const d = data as { key: string };
      notify.info('API key created', `Copy now — it won't be shown again: ${d.key}`);
      setNewKeyName('');
      qc.invalidateQueries({ queryKey: ['tenantApiKeys', id] });
    },
  });

  const saveFuelModuleConfig = useMutation({
    mutationFn: () =>
      withToast(
        adminApi.saveFuelModuleConfig(id!, {
          selectedReports: selectedFuelReports,
          visibleColumns: visibleFuelColumns,
          columnsByCategory,
        }),
        {
          loading: 'Saving Fuel module config...',
          success: 'Fuel module config saved',
        },
      ),
    onSuccess: () => {
      qc.invalidateQueries({ queryKey: ['tenantFuelModuleConfig', id] });
    },
  });

  const backups = (backupsData as { backups: Array<Record<string, unknown>>; settings: Record<string, unknown> }) || { backups: [], settings: {} };
  const fuelTemplates = ((reportCatalog as { templates?: Array<Record<string, unknown>> } | undefined)?.templates || [])
    .filter((t) => String(t.module || '').toLowerCase() === 'fuel');

  const toggleFuelReport = (report: { resourceId: number; templateId: number; templateName: string; module?: string; isGroupReport?: boolean }) => {
    const key = `${report.resourceId}:${report.templateId}`;
    setSelectedFuelReports((prev) => {
      const exists = prev.some((p) => `${p.resourceId}:${p.templateId}` === key);
      if (exists) return prev.filter((p) => `${p.resourceId}:${p.templateId}` !== key);
      return [...prev, report];
    });
  };

  const toggleFuelColumn = (key: string) => {
    setColumnsByCategory((prev) => {
      const current = prev[fuelColumnCategory] ?? [];
      let next = current.includes(key) ? current.filter((k) => k !== key) : [...current, key];
      // Enabling variance also enables station column (needed for comparison).
      if (key === 'variance' && next.includes('variance') && !next.includes('filledStation')) {
        next = [...next, 'filledStation'];
      }
      const updated = { ...prev, [fuelColumnCategory]: next };
      // Keep legacy flat list = vehicle set for older clients.
      if (fuelColumnCategory === 'vehicle') setVisibleFuelColumns(next);
      return updated;
    });
  };

  const uploadStationSheet = useMutation({
    mutationFn: (file: File) =>
      withToast(adminApi.uploadFuelStationSheet(id!, file), {
        loading: 'Importing petrol-station sheet…',
        success: 'Station sheet imported',
      }),
    onSuccess: (result) => {
      notify.success(
        'Station fills imported',
        `${result.importedCount} rows · ${result.periodFrom || '?'} → ${result.periodTo || '?'}`,
      );
      qc.invalidateQueries({ queryKey: ['tenantFuelStationSheets', id] });
    },
  });

  const deleteStationSheet = useMutation({
    mutationFn: (uploadId: string) =>
      withToast(adminApi.deleteFuelStationSheet(id!, uploadId), {
        loading: 'Removing sheet…',
        success: 'Sheet removed',
      }),
    onSuccess: () => qc.invalidateQueries({ queryKey: ['tenantFuelStationSheets', id] }),
  });

  const varianceEnabledForTenant = Object.values(columnsByCategory).some((cols) => cols?.includes('variance'));

  if (id === 'new') {
    return <Navigate to="/admin/tenants/new" replace />;
  }
  if (id && !isValidId) {
    return <Navigate to="/admin/tenants" replace />;
  }

  return (
    <AdminLayout
      title={String(t?.name || 'Client')}
      subtitle={`Slug: ${String(t?.slug || '')}`}
      actions={
        <div className="flex gap-2">
          {String(t?.status) === 'draft' && (
            <LoadingButton size="sm" loading={activateTenant.isPending} onClick={() => activateTenant.mutate()}>
              Activate Client
            </LoadingButton>
          )}
          {String(t?.status) === 'active' && verifiedIntegrationCount === 0 && (
            <Badge variant="outline" className="text-xs hidden sm:inline-flex">
              Active · no integrations yet
            </Badge>
          )}
          <Link
            to="/app/dashboard"
            target="_blank"
            onClick={() => {
              const slug = String(t?.slug || '');
              localStorage.setItem('ufp_tenant_slug', slug);
            }}
          >
            <Button size="sm" variant="outline"><ExternalLink className="w-4 h-4 mr-1" />View Client</Button>
          </Link>
        </div>
      }
    >
      <Link to="/admin/tenants" className="text-sm text-primary mb-4 inline-block">← Back to Clients</Link>

      <Tabs defaultValue="general">
        <TabsList className="flex flex-wrap h-auto gap-1">
          <TabsTrigger value="general">General</TabsTrigger>
          <TabsTrigger value="integrations">Integrations</TabsTrigger>
          <TabsTrigger value="branding">Branding</TabsTrigger>
          <TabsTrigger value="modules">Modules</TabsTrigger>
          <TabsTrigger value="fuel-module">Fuel Module</TabsTrigger>
          <TabsTrigger value="users">Users</TabsTrigger>
          <TabsTrigger value="migration">Migration</TabsTrigger>
          <TabsTrigger value="backup">Backup</TabsTrigger>
          <TabsTrigger value="audit">Audit</TabsTrigger>
          <TabsTrigger value="api-keys">API Keys</TabsTrigger>
        </TabsList>

        {/* GENERAL */}
        <TabsContent value="general" className="mt-4 space-y-4">
          <Card>
            <CardHeader>
              <CardTitle>Portal links</CardTitle>
              <CardDescription>Share the login URL with client users, or open the branded client app.</CardDescription>
            </CardHeader>
            <CardContent>
              <PortalLinksCard slug={String(t?.slug || general.slug || '')} />
            </CardContent>
          </Card>
          <Card>
            <CardHeader><CardTitle>General Settings</CardTitle></CardHeader>
            <CardContent className="grid grid-cols-1 md:grid-cols-2 gap-4">
              <div><Label>Client Name</Label><Input value={general.name} onChange={(e) => setGeneral({ ...general, name: e.target.value })} /></div>
              <div><Label>Subdomain / Slug</Label><Input value={general.slug} onChange={(e) => setGeneral({ ...general, slug: e.target.value })} /></div>
              <div><Label>Contact Email</Label><Input value={general.contactEmail} onChange={(e) => setGeneral({ ...general, contactEmail: e.target.value })} /></div>
              <div><Label>Phone</Label><Input value={general.phone} onChange={(e) => setGeneral({ ...general, phone: e.target.value })} /></div>
              <div className="md:col-span-2"><Label>Address</Label><Input value={general.address} onChange={(e) => setGeneral({ ...general, address: e.target.value })} /></div>
              <div><Label>Country</Label><Input value={general.country} onChange={(e) => setGeneral({ ...general, country: e.target.value })} /></div>
              <div><Label>Timezone</Label><Input value={general.timezone} onChange={(e) => setGeneral({ ...general, timezone: e.target.value })} /></div>
              <div><Label>Language</Label><Input value={general.language} onChange={(e) => setGeneral({ ...general, language: e.target.value })} /></div>
              <div>
                <Label>Status</Label>
                <Select value={general.status} onValueChange={(v) => setGeneral({ ...general, status: v })}>
                  <SelectTrigger><SelectValue /></SelectTrigger>
                  <SelectContent>
                    <SelectItem value="draft">Draft (setup in progress)</SelectItem>
                    <SelectItem value="active">Active</SelectItem>
                    <SelectItem value="inactive">Inactive</SelectItem>
                    <SelectItem value="suspended">Suspended</SelectItem>
                    <SelectItem value="warning">Warning</SelectItem>
                  </SelectContent>
                </Select>
              </div>
              {isSuperAdmin(authUser?.role) && (
                <div>
                  <Label>Assigned Mimito manager</Label>
                  <Select
                    value={general.assignedManagerId || 'none'}
                    onValueChange={(v) =>
                      setGeneral({ ...general, assignedManagerId: v === 'none' ? null : v })
                    }
                  >
                    <SelectTrigger><SelectValue placeholder="Unassigned" /></SelectTrigger>
                    <SelectContent>
                      <SelectItem value="none">Unassigned</SelectItem>
                      {(systemUsers as Array<Record<string, unknown>>)?.map((u) => (
                        <SelectItem key={String(u.id)} value={String(u.id)}>
                          {String(u.full_name)} ({ROLE_LABELS[String(u.role)] || String(u.role)})
                        </SelectItem>
                      ))}
                    </SelectContent>
                  </Select>
                  {t?.assignedManagerName && (
                    <p className="text-xs text-muted-foreground mt-1">
                      Current: {String(t.assignedManagerName)}
                    </p>
                  )}
                </div>
              )}
            </CardContent>
          </Card>
          <Card>
            <CardHeader><CardTitle>Limits & Usage</CardTitle></CardHeader>
            <CardContent className="grid grid-cols-3 gap-4">
              <div>
                <Label>Max Vehicles</Label>
                <Input type="number" value={general.maxVehicles} onChange={(e) => setGeneral({ ...general, maxVehicles: parseInt(e.target.value, 10) })} />
                <p className="text-xs text-muted-foreground mt-1">Used: {usage.vehicles_used ?? 0}</p>
              </div>
              <div>
                <Label>Max Users</Label>
                <Input type="number" value={general.maxUsers} onChange={(e) => setGeneral({ ...general, maxUsers: parseInt(e.target.value, 10) })} />
                <p className="text-xs text-muted-foreground mt-1">Used: {usage.users_used ?? 0}</p>
              </div>
              <div>
                <Label>Max Storage (GB)</Label>
                <Input type="number" value={general.maxStorageGb} onChange={(e) => setGeneral({ ...general, maxStorageGb: parseFloat(e.target.value) })} />
              </div>
            </CardContent>
          </Card>
          <LoadingButton loading={saveGeneral.isPending} onClick={() => saveGeneral.mutate()}>Save Changes</LoadingButton>
        </TabsContent>

        {/* FUEL MODULE */}
        <TabsContent value="fuel-module" className="mt-4 space-y-4">
          <Card>
            <CardHeader>
              <CardTitle>Fuel reports visibility</CardTitle>
              <CardDescription>
                Select which Wialon fuel reports this client sees in Fuel module.
              </CardDescription>
            </CardHeader>
            <CardContent className="space-y-2">
              {!fuelTemplates.length && (
                <p className="text-sm text-muted-foreground">
                  No fuel reports found in this tenant Wialon catalog yet.
                </p>
              )}
              {fuelTemplates.map((t) => {
                const resourceId = Number(t.resourceId);
                const templateId = Number(t.templateId);
                const checked = selectedFuelReports.some(
                  (r) => r.resourceId === resourceId && r.templateId === templateId,
                );
                return (
                  <label
                    key={`${resourceId}:${templateId}`}
                    className="flex items-start gap-3 rounded-md border border-border/60 p-2.5 cursor-pointer"
                  >
                    <Checkbox
                      checked={checked}
                      onCheckedChange={() =>
                        toggleFuelReport({
                          resourceId,
                          templateId,
                          templateName: String(t.templateName || ''),
                          module: String(t.module || 'fuel'),
                          isGroupReport: Boolean(t.isGroupReport),
                        })
                      }
                    />
                    <div className="min-w-0">
                      <p className="text-sm font-medium truncate">{String(t.templateName || '')}</p>
                      <p className="text-xs text-muted-foreground">
                        Resource: {String(t.resourceName || t.resourceId)} · {Boolean(t.isGroupReport) ? 'Group' : 'Unit'}
                      </p>
                    </div>
                  </label>
                );
              })}
            </CardContent>
          </Card>

          <Card>
            <CardHeader>
              <CardTitle>Fuel usage table columns</CardTitle>
              <CardDescription>
                Customise columns separately for vehicles, generators, and machinery for this client.
              </CardDescription>
            </CardHeader>
            <CardContent className="space-y-3">
              <div className="flex flex-wrap gap-2">
                {([
                  ['vehicle', 'Vehicles'],
                  ['generator', 'Generators'],
                  ['machinery', 'Machinery'],
                ] as const).map(([key, label]) => (
                  <Button
                    key={key}
                    type="button"
                    size="sm"
                    variant={fuelColumnCategory === key ? 'default' : 'outline'}
                    onClick={() => setFuelColumnCategory(key)}
                  >
                    {label}
                  </Button>
                ))}
              </div>
              <div className="grid grid-cols-1 md:grid-cols-2 xl:grid-cols-3 gap-2">
                {FUEL_TABLE_COLUMN_DEFS.map((c) => (
                  <label
                    key={c.key}
                    className="flex items-center gap-2 rounded-md border border-border/60 px-2.5 py-2 cursor-pointer"
                  >
                    <Checkbox
                      checked={(columnsByCategory[fuelColumnCategory] ?? []).includes(c.key)}
                      onCheckedChange={() => toggleFuelColumn(c.key)}
                    />
                    <span className="text-sm">{c.label}</span>
                  </label>
                ))}
              </div>
            </CardContent>
          </Card>

          <Card>
            <CardHeader>
              <CardTitle className="flex items-center gap-2">
                <FileSpreadsheet className="h-4 w-4" />
                Petrol-station sheets (variance)
              </CardTitle>
              <CardDescription>
                Upload the station transaction export (Registration num., Date, Hour, Quantity, Product, Amount…).
                Enable the <strong>Variance</strong> column above so this client sees Filled(Station), Variance, and the Fuel → Variance tab.
                Station liters are the reference; variance = FLS filled − station filled.
              </CardDescription>
            </CardHeader>
            <CardContent className="space-y-3">
              {!varianceEnabledForTenant && (
                <p className="text-xs text-amber-700 bg-amber-50 border border-amber-200 rounded-md px-3 py-2">
                  Variance column is not enabled for any asset category yet. Enable it in the columns list so the client can see the Variance tab.
                </p>
              )}
              <div className="flex flex-wrap items-center gap-2">
                <Label
                  htmlFor="station-sheet-upload"
                  className="inline-flex items-center gap-2 h-9 px-3 rounded-md border border-input bg-background text-sm cursor-pointer hover:bg-muted/50"
                >
                  <Upload className="h-3.5 w-3.5" />
                  {uploadStationSheet.isPending ? 'Uploading…' : 'Upload .xlsx / .xls'}
                </Label>
                <input
                  id="station-sheet-upload"
                  type="file"
                  accept=".xlsx,.xls,application/vnd.openxmlformats-officedocument.spreadsheetml.sheet,application/vnd.ms-excel"
                  className="hidden"
                  disabled={uploadStationSheet.isPending}
                  onChange={(e) => {
                    const file = e.target.files?.[0];
                    e.target.value = '';
                    if (file) uploadStationSheet.mutate(file);
                  }}
                />
                <span className="text-xs text-muted-foreground">
                  Expected columns: Registration num., Date, Hour, Quantity, Product, Unit price, Amount, Card num.
                </span>
              </div>
              <div className="rounded-md border border-border/60 overflow-hidden">
                <Table>
                  <TableHeader>
                    <TableRow>
                      <TableHead>File</TableHead>
                      <TableHead>Period</TableHead>
                      <TableHead className="text-right">Rows</TableHead>
                      <TableHead>Uploaded</TableHead>
                      <TableHead className="w-12" />
                    </TableRow>
                  </TableHeader>
                  <TableBody>
                    {(stationSheets?.uploads ?? []).length === 0 ? (
                      <TableRow>
                        <TableCell colSpan={5} className="text-sm text-muted-foreground text-center py-6">
                          No station sheets uploaded for this client yet.
                        </TableCell>
                      </TableRow>
                    ) : (
                      (stationSheets?.uploads ?? []).map((u) => (
                        <TableRow key={u.id}>
                          <TableCell className="text-sm font-medium">{u.fileName}</TableCell>
                          <TableCell className="text-xs text-muted-foreground">
                            {u.periodFrom || '—'} → {u.periodTo || '—'}
                          </TableCell>
                          <TableCell className="text-right tabular-nums text-sm">{u.importedCount}</TableCell>
                          <TableCell className="text-xs text-muted-foreground">
                            {u.createdAt ? format(new Date(u.createdAt), 'dd MMM yyyy HH:mm') : '—'}
                            {u.notes ? <span className="block text-[10px]">{u.notes}</span> : null}
                          </TableCell>
                          <TableCell>
                            <Button
                              type="button"
                              variant="ghost"
                              size="icon"
                              className="h-8 w-8 text-destructive"
                              disabled={deleteStationSheet.isPending}
                              onClick={() => deleteStationSheet.mutate(u.id)}
                            >
                              <Trash2 className="h-4 w-4" />
                            </Button>
                          </TableCell>
                        </TableRow>
                      ))
                    )}
                  </TableBody>
                </Table>
              </div>
            </CardContent>
          </Card>

          <LoadingButton loading={saveFuelModuleConfig.isPending} onClick={() => saveFuelModuleConfig.mutate()}>
            Save Fuel Module Configuration
          </LoadingButton>
        </TabsContent>

        {/* INTEGRATIONS */}
        <TabsContent value="integrations" className="mt-4 space-y-4">
          <Card className="border-primary/20 bg-primary/5">
            <CardHeader>
              <CardTitle className="text-base flex items-center justify-between gap-2">
                Onboarding checklist
                <Badge variant={verifiedIntegrationCount > 0 ? 'default' : 'secondary'}>
                  {verifiedIntegrationCount}/3 integrations verified
                </Badge>
              </CardTitle>
              <CardDescription>
                Configure the telematics systems this tenant uses (1, 2, or all 3). You can activate the tenant
                at any time — integrations can be added before or after activation. Fleet map and GPS modules
                appear once a system is saved, tested, and synced. Clients only need MAMS credentials.
              </CardDescription>
            </CardHeader>
          </Card>
          {(['wialon', 'loconav', 'tracksolid'] as const).map((source) => {
            const integ = getIntegration(source);
            const guide = INTEGRATION_GUIDE[source];
            return (
              <Card key={source}>
                <CardHeader>
                  <CardTitle className="flex justify-between">
                    {guide.label}
                    <Badge variant={integ?.connection_verified_at ? 'default' : integ?.is_active ? 'secondary' : 'outline'}>
                      {integ?.connection_verified_at ? 'Verified' : integ?.is_active ? 'Saved' : 'Not configured'}
                    </Badge>
                  </CardTitle>
                  <CardDescription>{guide.summary}</CardDescription>
                </CardHeader>
                <CardContent className="space-y-3">
                  <ol className="text-xs text-muted-foreground list-decimal list-inside space-y-0.5">
                    {guide.steps.map((step) => (
                      <li key={step}>{step}</li>
                    ))}
                  </ol>
                  {integ?.last_sync_at && (
                    <p className="text-xs text-muted-foreground">Last sync: {new Date(String(integ.last_sync_at)).toLocaleString()}</p>
                  )}
                  {integ?.last_error && !integ?.connection_verified_at && (
                    <p className="text-xs text-destructive">{String(integ.last_error)}</p>
                  )}
                  {source === 'wialon' &&
                    integ?.connection_verified_at &&
                    (integ?.wialon_session_meta as { syncWarning?: string } | undefined)?.syncWarning && (
                      <p className="text-xs text-amber-700 dark:text-amber-400">
                        {(integ.wialon_session_meta as { syncWarning: string }).syncWarning}
                      </p>
                    )}
                  {integ?.webhookUrl && (
                    <div className="text-xs space-y-1 rounded-lg border bg-muted/40 p-2">
                      <p className="font-mono break-all">Webhook URL: {String(integ.webhookUrl)}</p>
                      {guide.webhook && (
                        <p className="text-muted-foreground">
                          Set server env <code className="text-[10px]">{guide.webhook.envSecret}</code> to match your{' '}
                          {guide.label} portal signing secret. Header: <code className="text-[10px]">{guide.webhook.header}</code>
                        </p>
                      )}
                    </div>
                  )}
                  {source === 'wialon' && (
                    <>
                      {wialonFromCenter ? (
                        <>
                          <p className="text-xs rounded-lg border bg-muted/30 p-2 text-muted-foreground">
                            Mother token is managed in{' '}
                            <Link to="/admin/wialon" className="text-primary hover:underline">Wialon Center</Link>.
                            Pick the client admin account and Wialon users for this tenant below.
                          </p>
                          {(integ?.wialon_account_name || integ?.wialon_resource_id) && (
                            <p className="text-xs text-primary rounded border border-primary/20 bg-primary/5 p-2">
                              Linked: <strong>{String(integ.wialon_account_name || integ.wialon_resource_id)}</strong>
                              {integ.wialon_mother_account_name ? (
                                <> · mother: <strong>{String(integ.wialon_mother_account_name)}</strong></>
                              ) : integ.inherits_platform_credentials ? (
                                ' · via Wialon Center'
                              ) : (
                                ''
                              )}
                            </p>
                          )}
                          <WialonTenantLinkPanel
                            selectedMotherAccountId={wialonMotherAccountId || (integ?.wialon_mother_account_id ? String(integ.wialon_mother_account_id) : '')}
                            onMotherAccountChange={setWialonMotherAccountId}
                            selectedAccountId={wialonAccountId || (integ?.wialon_resource_id ? String(integ.wialon_resource_id) : '')}
                            selectedAccountName={wialonAccountName || String(integ?.wialon_account_name || '')}
                            selectedUserIds={wialonUserIds}
                            exceptTenantId={id}
                            onSelectAccount={(aid, name) => {
                              setWialonAccountId(aid);
                              setWialonAccountName(name);
                              setWialonUserIds([]);
                              setWialonTestResult(null);
                            }}
                            onToggleUser={(uid) =>
                              setWialonUserIds((prev) =>
                                prev.includes(uid) ? prev.filter((x) => x !== uid) : [...prev, uid]
                              )
                            }
                            onSelectAllUsers={setWialonUserIds}
                            onTestAccount={async () => {
                              if (!wialonAccountId) return;
                              setWialonTesting(true);
                              try {
                                const r = await adminApi.testWialonCenterAccount(
                                  wialonAccountId,
                                  id,
                                  wialonMotherAccountId || undefined
                                );
                                setWialonTestResult({ unitCount: r.unitCount, userCount: r.userCount });
                                notify.success('Account OK', `${r.unitCount} units`);
                              } catch (e) {
                                notify.error('Test failed', (e as Error).message);
                              } finally {
                                setWialonTesting(false);
                              }
                            }}
                            testing={wialonTesting}
                            testResult={wialonTestResult}
                          />
                          <LoadingButton
                            loading={linkWialonAccount.isPending}
                            disabled={!wialonAccountId}
                            onClick={() =>
                              linkWialonAccount.mutate({
                                accountId: wialonAccountId,
                                accountName: wialonAccountName,
                                userIds: wialonUserIds.length ? wialonUserIds : undefined,
                                motherAccountId: wialonMotherAccountId || undefined,
                              })
                            }
                          >
                            {integ?.wialon_resource_id ? 'Re-link & sync account' : 'Link account & sync'}
                          </LoadingButton>
                        </>
                      ) : (
                        <>
                          <p className="text-xs text-amber-700 dark:text-amber-400 rounded border border-amber-200 bg-amber-50 dark:bg-amber-950/30 p-2">
                            Set up the mother account in{' '}
                            <Link to="/admin/wialon" className="underline">Wialon Center</Link>{' '}
                            first (recommended). Or paste a token below for legacy per-tenant setup.
                          </p>
                          {guide.fields.map((field) => (
                            <div key={field.key} className="space-y-1">
                              <Label className="text-xs">{field.label}</Label>
                              {field.key === 'token' ? (
                                <PasswordInput
                                  placeholder="Wialon API token"
                                  value={wialonToken}
                                  onChange={(e) => setWialonToken(e.target.value)}
                                />
                              ) : (
                                <Input
                                  placeholder={field.label}
                                  value={
                                    field.key === 'baseUrl'
                                      ? wialonBaseUrl
                                      : field.key === 'accountId'
                                        ? wialonAccountId
                                        : wialonOperateAs
                                  }
                                  onChange={(e) => {
                                    if (field.key === 'baseUrl') setWialonBaseUrl(e.target.value);
                                    else if (field.key === 'accountId') setWialonAccountId(e.target.value);
                                    else setWialonOperateAs(e.target.value);
                                  }}
                                />
                              )}
                              <p className="text-[11px] text-muted-foreground">{field.hint}</p>
                            </div>
                          ))}
                        </>
                      )}
                    </>
                  )}
                  {source === 'loconav' && (
                    <div className="space-y-1">
                      <Label className="text-xs">{guide.fields[0].label}</Label>
                      <PasswordInput placeholder="User-Authentication token" value={loconavToken} onChange={(e) => setLoconavToken(e.target.value)} />
                      <p className="text-[11px] text-muted-foreground">{guide.fields[0].hint}</p>
                    </div>
                  )}
                  {source === 'tracksolid' && (
                    <>
                      <input type="text" className="hidden" autoComplete="username" />
                      {guide.fields.map((field) => (
                        <div key={field.key} className="space-y-1">
                          <Label className="text-xs">{field.label}</Label>
                          {field.key === 'password' || field.key === 'appSecret' ? (
                            <PasswordInput
                              placeholder={field.label}
                              value={field.key === 'appSecret' ? tracksolidAppSecret : tracksolidPassword}
                              onChange={(e) =>
                                field.key === 'appSecret'
                                  ? setTracksolidAppSecret(e.target.value)
                                  : setTracksolidPassword(e.target.value)
                              }
                              autoComplete="new-password"
                            />
                          ) : (
                            <Input
                              placeholder={field.label}
                              value={field.key === 'appKey' ? tracksolidAppKey : tracksolidAccount}
                              onChange={(e) =>
                                field.key === 'appKey'
                                  ? setTracksolidAppKey(e.target.value)
                                  : setTracksolidAccount(e.target.value)
                              }
                            />
                          )}
                          <p className="text-[11px] text-muted-foreground">{field.hint}</p>
                        </div>
                      ))}
                    </>
                  )}
                  {(previewResults[source]?.assetCount != null || integ?.preview_asset_count != null) && (
                    <div className="rounded-lg border bg-muted/50 p-3 text-sm">
                      <p className="font-medium">
                        Preview: {previewResults[source]?.assetCount ?? integ?.preview_asset_count} assets
                      </p>
                      <ul className="mt-2 space-y-1 text-xs text-muted-foreground">
                        {(previewResults[source]?.sampleAssets || (integ?.preview_sample as Array<{ name: string }>) || [])
                          .slice(0, 5)
                          .map((a) => (
                            <li key={a.name}>• {a.name}</li>
                          ))}
                      </ul>
                    </div>
                  )}
                  <div className="flex gap-2 flex-wrap">
                    <Button size="sm" onClick={() => handleSaveIntegration(source)}>Save</Button>
                    <Button size="sm" variant="outline" onClick={() => handleTestIntegration(source)}>Test</Button>
                    <Button size="sm" variant="outline" disabled={!integ?.connection_verified_at} onClick={() => syncIntegration.mutate(source)}>
                      <RefreshCw className="w-3 h-3 mr-1" />Sync Now
                    </Button>
                  </div>
                </CardContent>
              </Card>
            );
          })}
        </TabsContent>

        {/* BRANDING */}
        <TabsContent value="branding" className="mt-4 space-y-4">
          <Card>
            <CardHeader><CardTitle>Logo & Colors</CardTitle></CardHeader>
            <CardContent className="grid grid-cols-1 md:grid-cols-2 gap-4">
              <FileUpload
                label="Company Logo"
                previewUrl={branding.logoUrl}
                onUpload={async (file, preview) => {
                  const result = await adminApi.uploadTenantFile(id!, file, 'logo');
                  const url = result.publicUrl || result.url;
                  setBranding({ ...branding, logoUrl: url.startsWith('http') ? url : `${import.meta.env.VITE_API_URL || 'http://localhost:3000'}${url}` });
                  notify.success('Logo uploaded');
                }}
              />
              <FileUpload
                label="Favicon"
                accept="image/png,image/x-icon,image/vnd.microsoft.icon"
                previewUrl={branding.faviconUrl}
                onUpload={async (file) => {
                  const result = await adminApi.uploadTenantFile(id!, file, 'favicon');
                  const url = result.publicUrl || result.url;
                  setBranding({ ...branding, faviconUrl: url.startsWith('http') ? url : `${import.meta.env.VITE_API_URL || 'http://localhost:3000'}${url}` });
                  notify.success('Favicon uploaded');
                }}
              />
              <div><Label>Primary</Label><Input type="color" value={branding.primaryColor} onChange={(e) => setBranding({ ...branding, primaryColor: e.target.value })} className="h-10" /></div>
              <div><Label>Secondary</Label><Input type="color" value={branding.secondaryColor} onChange={(e) => setBranding({ ...branding, secondaryColor: e.target.value })} className="h-10" /></div>
              <div><Label>Accent</Label><Input type="color" value={branding.accentColor} onChange={(e) => setBranding({ ...branding, accentColor: e.target.value })} className="h-10" /></div>
              <div><Label>Or paste Logo URL</Label><Input value={branding.logoUrl} onChange={(e) => setBranding({ ...branding, logoUrl: e.target.value })} placeholder="https://..." /></div>
            </CardContent>
          </Card>
          <Card>
            <CardHeader><CardTitle>Custom CSS</CardTitle></CardHeader>
            <CardContent>
              <Textarea rows={6} value={branding.customCss} onChange={(e) => setBranding({ ...branding, customCss: e.target.value })} placeholder=".custom-header { background: var(--primary); }" />
            </CardContent>
          </Card>
          <div className="fleet-card p-4">
            <p className="text-sm font-medium mb-2">Preview</p>
            <div className="flex items-center gap-3 p-3 rounded border" style={{ backgroundColor: branding.primaryColor, color: '#fff' }}>
              {branding.logoUrl && <img src={branding.logoUrl} alt="" className="h-8" />}
              <span className="font-bold">{general.name || 'Client Preview'}</span>
            </div>
          </div>
          <LoadingButton loading={saveBranding.isPending} onClick={() => saveBranding.mutate()}>Save Branding</LoadingButton>
        </TabsContent>

        {/* MODULES */}
        <TabsContent value="modules" className="mt-4 space-y-4">
          <div className="flex justify-between items-center">
            <p className="text-sm text-muted-foreground max-w-2xl">
              <strong>Enabled</strong> modules appear in the client navigation.{' '}
              <strong>Visible</strong> controls whether users can see module data — enabled but hidden modules stay in the menu with an eye-off icon, and users see a clear message instead of data.
            </p>
            <LoadingButton size="sm" variant="outline" loading={applyRecommendedModules.isPending} onClick={() => applyRecommendedModules.mutate()}>
              Apply recommended modules
            </LoadingButton>
          </div>
          <Table>
            <TableHeader>
              <TableRow>
                <TableHead>Module</TableHead>
                <TableHead>Sources</TableHead>
                <TableHead>Enabled</TableHead>
                <TableHead>Visible</TableHead>
              </TableRow>
            </TableHeader>
            <TableBody>
              {(modules as Array<Record<string, unknown>>)?.map((m) => {
                const key = String(m.key);
                const enabled = Boolean(m.is_enabled ?? m.isEnabled);
                const visible = Boolean(m.is_visible ?? true);
                return (
                  <TableRow key={key}>
                    <TableCell>{String(m.label)}</TableCell>
                    <TableCell className="text-xs">{Array.isArray(m.sources) ? (m.sources as string[]).join(', ') || 'Core' : 'Core'}</TableCell>
                    <TableCell><Switch checked={enabled} onCheckedChange={(v) => toggleModule(key, v, visible)} /></TableCell>
                    <TableCell><Switch checked={visible} onCheckedChange={(v) => toggleModule(key, enabled, v)} /></TableCell>
                  </TableRow>
                );
              })}
            </TableBody>
          </Table>
        </TabsContent>

        {/* USERS */}
        <TabsContent value="users" className="mt-4 space-y-4">
          <WialonUserImportCard
            tenantId={id!}
            wialonConnected={Boolean(
              (integrations as Array<Record<string, unknown>> | undefined)?.some(
                (i) => i.source_type === 'wialon' && i.connection_verified_at
              )
            )}
            tenantModules={(modules as import('@/lib/api').TenantModule[]) || []}
          />
          <Table>
            <TableHeader>
              <TableRow>
                <TableHead>Name</TableHead>
                <TableHead>Email</TableHead>
                <TableHead>Role</TableHead>
                <TableHead>Modules</TableHead>
                <TableHead>Status</TableHead>
                <TableHead>Last Login</TableHead>
                <TableHead className="w-32" />
              </TableRow>
            </TableHeader>
            <TableBody>
              {(users as Array<Record<string, unknown>>)?.map((u) => (
                <TableRow key={String(u.id)}>
                  <TableCell className="font-medium">{String(u.full_name)}</TableCell>
                  <TableCell className="text-sm">{String(u.email)}</TableCell>
                  <TableCell>
                    <Badge variant="outline">{ROLE_LABELS[String(u.role)] || String(u.role)}</Badge>
                  </TableCell>
                  <TableCell className="text-xs text-muted-foreground">
                    {Array.isArray(u.modules) && (u.modules as string[]).length
                      ? `${(u.modules as string[]).length} override(s)`
                      : 'Role default'}
                  </TableCell>
                  <TableCell>
                    <Badge variant={u.is_active ? 'default' : 'destructive'}>
                      {u.is_active ? 'Active' : 'Inactive'}
                    </Badge>
                  </TableCell>
                  <TableCell className="text-xs text-muted-foreground">
                    {u.last_login_at ? new Date(String(u.last_login_at)).toLocaleString() : 'Never'}
                  </TableCell>
                  <TableCell className="space-x-1">
                    <Button
                      size="sm"
                      variant="ghost"
                      onClick={() =>
                        setEditingTenantUser({
                          id: String(u.id),
                          email: String(u.email),
                          full_name: String(u.full_name),
                          role: String(u.role),
                          is_active: Boolean(u.is_active),
                          modules: Array.isArray(u.modules) ? (u.modules as string[]) : [],
                        })
                      }
                    >
                      Edit
                    </Button>
                    {u.is_active && (
                      <Button
                        size="sm"
                        variant="ghost"
                        className="text-destructive"
                        onClick={() => {
                          if (confirm(`Deactivate ${u.full_name}?`)) {
                            deactivateUser.mutate(String(u.id));
                          }
                        }}
                      >
                        Deactivate
                      </Button>
                    )}
                  </TableCell>
                </TableRow>
              ))}
            </TableBody>
          </Table>
          <Card>
            <CardHeader><CardTitle>Add User</CardTitle></CardHeader>
            <CardContent className="space-y-4">
              <div className="grid grid-cols-1 md:grid-cols-2 gap-3">
                <div>
                  <Label>Full name</Label>
                  <Input placeholder="Full name" value={newUser.fullName} onChange={(e) => setNewUser({ ...newUser, fullName: e.target.value })} />
                </div>
                <div>
                  <Label>Email</Label>
                  <Input placeholder="Email" value={newUser.email} onChange={(e) => setNewUser({ ...newUser, email: e.target.value })} />
                </div>
                <div>
                  <Label>Password</Label>
                  <PasswordInput placeholder="Password" value={newUser.password} onChange={(e) => setNewUser({ ...newUser, password: e.target.value })} />
                </div>
              </div>
              <UserAccessEditor
                role={newUser.role}
                onRoleChange={(r) => {
                  setNewUser({ ...newUser, role: r });
                  setNewUserModules(defaultModulesForRole(r));
                }}
                isActive
                onActiveChange={() => {}}
                modules={newUserModules}
                onModulesChange={setNewUserModules}
                tenantModules={(modules as import('@/lib/api').TenantModule[]) || []}
                showActive={false}
              />
              <Button
                onClick={() => createUser.mutate()}
                disabled={!newUser.email || !newUser.password || createUser.isPending}
              >
                Create User
              </Button>
            </CardContent>
          </Card>

          <ClientUserEditDialog
            user={editingTenantUser}
            open={Boolean(editingTenantUser)}
            onOpenChange={(open) => !open && setEditingTenantUser(null)}
            tenantId={id}
          />
        </TabsContent>

        {/* MIGRATION */}
        <TabsContent value="migration" className="mt-4 space-y-4">
          <Card>
            <CardHeader><CardTitle>Export Data</CardTitle></CardHeader>
            <CardContent className="space-y-3">
              <p className="text-sm text-muted-foreground">Export tenant data as JSON (vehicles, users, alerts, drivers)</p>
              <Button onClick={() => exportData.mutate()}>Export Now</Button>
            </CardContent>
          </Card>
          <Card>
            <CardHeader><CardTitle>Import Data</CardTitle></CardHeader>
            <CardContent>
              <Input type="file" accept=".json" onChange={(e) => {
                const file = e.target.files?.[0];
                if (!file) return;
                const reader = new FileReader();
                reader.onload = () => {
                  try {
                    const data = JSON.parse(reader.result as string);
                    adminApi.importTenant(id!, data, true).then(() => notify.success('Import complete'));
                  } catch { notify.error('Invalid JSON file'); }
                };
                reader.readAsText(file);
              }} />
            </CardContent>
          </Card>
        </TabsContent>

        {/* BACKUP */}
        <TabsContent value="backup" className="mt-4 space-y-4">
          <div className="flex gap-2">
            <Button onClick={() => createBackup.mutate()}>Backup Now</Button>
          </div>
          <Table>
            <TableHeader>
              <TableRow>
                <TableHead>Date</TableHead>
                <TableHead>Type</TableHead>
                <TableHead>Size</TableHead>
                <TableHead>Status</TableHead>
              </TableRow>
            </TableHeader>
            <TableBody>
              {backups.backups.map((b) => (
                <TableRow key={String(b.id)}>
                  <TableCell>{new Date(String(b.created_at)).toLocaleString()}</TableCell>
                  <TableCell>{String(b.backup_type)}</TableCell>
                  <TableCell>{Math.round(Number(b.size_bytes || 0) / 1024)} KB</TableCell>
                  <TableCell><Badge>{String(b.status)}</Badge></TableCell>
                </TableRow>
              ))}
            </TableBody>
          </Table>
        </TabsContent>

        {/* AUDIT */}
        <TabsContent value="audit" className="mt-4">
          <Table>
            <TableHeader>
              <TableRow>
                <TableHead>Time</TableHead>
                <TableHead>User</TableHead>
                <TableHead>Action</TableHead>
                <TableHead>Details</TableHead>
              </TableRow>
            </TableHeader>
            <TableBody>
              {(auditLogs as Array<Record<string, unknown>>)?.map((log) => (
                <TableRow key={String(log.id)}>
                  <TableCell className="text-xs">{new Date(String(log.created_at)).toLocaleString()}</TableCell>
                  <TableCell>{String(log.user_email || 'System')}</TableCell>
                  <TableCell><Badge variant="outline">{String(log.action)}</Badge></TableCell>
                  <TableCell className="text-xs">{String(log.resource_type || '')} {String(log.resource_id || '')}</TableCell>
                </TableRow>
              ))}
            </TableBody>
          </Table>
        </TabsContent>

        {/* API KEYS */}
        <TabsContent value="api-keys" className="mt-4 space-y-4">
          <Table>
            <TableHeader>
              <TableRow>
                <TableHead>Name</TableHead>
                <TableHead>Key</TableHead>
                <TableHead>Permissions</TableHead>
                <TableHead>Created</TableHead>
              </TableRow>
            </TableHeader>
            <TableBody>
              {(apiKeys as Array<Record<string, unknown>>)?.map((k) => (
                <TableRow key={String(k.id)}>
                  <TableCell>{String(k.name)}</TableCell>
                  <TableCell className="font-mono text-xs">{String(k.key_prefix)}••••</TableCell>
                  <TableCell>{Array.isArray(k.permissions) ? (k.permissions as string[]).join(', ') : ''}</TableCell>
                  <TableCell className="text-xs">{new Date(String(k.created_at)).toLocaleDateString()}</TableCell>
                </TableRow>
              ))}
            </TableBody>
          </Table>
          <div className="flex gap-2">
            <Input placeholder="Key name" value={newKeyName} onChange={(e) => setNewKeyName(e.target.value)} className="max-w-xs" />
            <Button onClick={() => generateApiKey.mutate()} disabled={!newKeyName}>Generate Key</Button>
          </div>
        </TabsContent>
      </Tabs>
    </AdminLayout>
  );
}
