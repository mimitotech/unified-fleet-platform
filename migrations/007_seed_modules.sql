-- 007: Seed module definitions
INSERT INTO module_definitions (key, label, description, icon, sort_order, default_enabled, sources) VALUES
    ('dashboard', 'Dashboard', 'Fleet operations overview', 'LayoutDashboard', 1, true, '{}'),
    ('monitoring', 'Monitoring', 'Live map and fleet status', 'Map', 2, true, '{wialon,tracksolid}'),
    ('surveillance', 'Surveillance', 'Video feeds and playback', 'Video', 3, true, '{loconav,tracksolid}'),
    ('drivers', 'Drivers', 'Driver management', 'Users', 4, true, '{}'),
    ('routes', 'Routes', 'Route planning and tracking', 'Route', 5, true, '{wialon}'),
    ('fuel', 'Fuel', 'Fuel management', 'Fuel', 6, true, '{wialon}'),
    ('emissions', 'Emissions', 'CO2 tracking', 'Leaf', 7, true, '{wialon}'),
    ('workshop', 'Workshop', 'Maintenance and inspections', 'Wrench', 8, true, '{}'),
    ('reports', 'Reports', 'Exportable reports', 'BarChart3', 9, true, '{}'),
    ('alerts', 'Alerts', 'Unified alert inbox', 'Bell', 10, true, '{}'),
    ('trailers', 'Trailers', 'Trailer tracking', 'Truck', 11, false, '{wialon,tracksolid}'),
    ('sensors', 'Sensors', 'Sensor dashboards', 'Gauge', 12, false, '{wialon}'),
    ('geofencing', 'Geofencing', 'Geofence management', 'MapPin', 13, false, '{wialon}'),
    ('commands', 'Commands', 'Remote commands', 'Terminal', 14, false, '{wialon,tracksolid}')
ON CONFLICT (key) DO NOTHING;
