-- 009: Demo domain seed (idempotent inserts for demo tenant)

INSERT INTO assets (tenant_id, name, registration_plate, make, model, year)
SELECT t.id, v.name, v.plate, v.make, v.model, v.year
FROM tenants t
CROSS JOIN (VALUES
  ('Truck Alpha', 'UAA 001A', 'Isuzu', 'FRR', 2022),
  ('Truck Beta', 'UAA 002B', 'Scania', 'R450', 2021),
  ('Van Gamma', 'UAA 003C', 'Toyota', 'HiAce', 2023),
  ('Pickup Delta', 'UAA 004D', 'Ford', 'Ranger', 2020)
) AS v(name, plate, make, model, year)
WHERE t.slug = 'demo'
  AND NOT EXISTS (
    SELECT 1 FROM assets a WHERE a.tenant_id = t.id AND a.registration_plate = v.plate
  );

INSERT INTO drivers (tenant_id, name, license_number, phone, email, status, assigned_asset_id)
SELECT t.id, d.name, d.license, d.phone, d.email, d.status, a.id
FROM tenants t
CROSS JOIN (VALUES
  ('John Okello', 'DL-UG-10001', '+256700100001', 'john@demo.ug', 'driving'),
  ('Mary Nakato', 'DL-UG-10002', '+256700100002', 'mary@demo.ug', 'available'),
  ('Peter Ssemwogerere', 'DL-UG-10003', '+256700100003', 'peter@demo.ug', 'off-duty'),
  ('Grace Achieng', 'DL-UG-10004', '+256700100004', 'grace@demo.ug', 'available')
) AS d(name, license, phone, email, status)
LEFT JOIN assets a ON a.tenant_id = t.id AND a.registration_plate = 'UAA 001A'
WHERE t.slug = 'demo'
ON CONFLICT (tenant_id, license_number) DO NOTHING;

INSERT INTO fleet_routes (tenant_id, name, status, asset_name, asset_plate, driver_name, start_time, distance, estimated_duration, eta, color)
SELECT t.id, r.name, r.status, r.asset, r.plate, r.driver, r.start_time::timestamptz, r.distance, r.duration, r.eta::timestamptz, r.color
FROM tenants t
CROSS JOIN (VALUES
  ('Kampala → Jinja', 'in-progress', 'Truck Alpha', 'UAA 001A', 'John Okello', NOW() - INTERVAL '2 hours', 82.5, 7200, NOW() + INTERVAL '1 hour', 'green'),
  ('Entebbe Airport Shuttle', 'scheduled', 'Van Gamma', 'UAA 003C', 'Mary Nakato', NOW() + INTERVAL '4 hours', 45.0, 3600, NOW() + INTERVAL '5 hours', 'blue'),
  ('Mbarara Delivery', 'completed', 'Truck Beta', 'UAA 002B', 'Peter Ssemwogerere', NOW() - INTERVAL '2 days', 290.0, 18000, NOW() - INTERVAL '1 day', 'orange')
) AS r(name, status, asset, plate, driver, start_time, distance, duration, eta, color)
WHERE t.slug = 'demo'
ON CONFLICT DO NOTHING;

INSERT INTO trip_summaries (tenant_id, trip_id, unit_id, unit_name, departure_time, arrival_time, mileage, duration, fuel_used, avg_speed, max_speed)
SELECT t.id, ts.trip_id, ts.unit_id, ts.unit_name, ts.dep::timestamptz, ts.arr::timestamptz, ts.mileage, ts.duration, ts.fuel, ts.avg_speed, ts.max_speed
FROM tenants t
CROSS JOIN (VALUES
  ('trip-001', 'unit-1', 'Truck Alpha', NOW() - INTERVAL '6 hours', NOW() - INTERVAL '4 hours', 82.5, 7200, 28.5, 55.0, 88.0),
  ('trip-002', 'unit-2', 'Truck Beta', NOW() - INTERVAL '2 days', NOW() - INTERVAL '2 days' + INTERVAL '5 hours', 290.0, 18000, 95.0, 58.0, 92.0),
  ('trip-003', 'unit-3', 'Van Gamma', NOW() - INTERVAL '1 day', NOW() - INTERVAL '1 day' + INTERVAL '2 hours', 45.0, 7200, 8.2, 35.0, 65.0)
) AS ts(trip_id, unit_id, unit_name, dep, arr, mileage, duration, fuel, avg_speed, max_speed)
WHERE t.slug = 'demo'
ON CONFLICT (tenant_id, unit_id, departure_time) DO NOTHING;

INSERT INTO fuel_transactions (id, tenant_id, unit_id, unit_name, section, tank, timestamp, time_str, filled, fuel_used, mileage, avg_consumption)
SELECT 'fuel-' || t.slug || '-' || f.idx, t.id, f.unit_id, f.unit_name, f.section, 'main', EXTRACT(EPOCH FROM f.ts)::bigint, to_char(f.ts, 'YYYY-MM-DD HH24:MI'), f.filled, f.used, f.mileage, f.avg
FROM tenants t
CROSS JOIN (VALUES
  (1, 'unit-1', 'Truck Alpha', 'filling', NOW() - INTERVAL '1 day', 120.0, 0, 0, 0),
  (2, 'unit-1', 'Truck Alpha', 'consumption', NOW() - INTERVAL '6 hours', 0, 28.5, 82.5, 34.5),
  (3, 'unit-2', 'Truck Beta', 'filling', NOW() - INTERVAL '3 days', 200.0, 0, 0, 0),
  (4, 'unit-2', 'Truck Beta', 'consumption', NOW() - INTERVAL '2 days', 0, 95.0, 290.0, 32.8)
) AS f(idx, unit_id, unit_name, section, ts, filled, used, mileage, avg)
WHERE t.slug = 'demo'
ON CONFLICT (id) DO NOTHING;

INSERT INTO eco_driving_violations (tenant_id, unit_id, unit_name, violation_type, severity, occurred_at, value, threshold, driver_name)
SELECT t.id, v.unit_id, v.unit_name, v.vtype, v.severity, v.occurred::timestamptz, v.val, v.thresh, v.driver
FROM tenants t
CROSS JOIN (VALUES
  ('unit-1', 'Truck Alpha', 'harsh_braking', 'medium', NOW() - INTERVAL '3 hours', 8.5, 5.0, 'John Okello'),
  ('unit-1', 'Truck Alpha', 'speeding', 'high', NOW() - INTERVAL '5 hours', 92.0, 80.0, 'John Okello'),
  ('unit-2', 'Truck Beta', 'harsh_acceleration', 'low', NOW() - INTERVAL '2 days', 4.2, 4.0, 'Peter Ssemwogerere')
) AS v(unit_id, unit_name, vtype, severity, occurred, val, thresh, driver)
WHERE t.slug = 'demo';

INSERT INTO mechanics (tenant_id, name, phone, specialization, hourly_rate, is_external)
SELECT t.id, m.name, m.phone, m.spec, m.rate, m.ext
FROM tenants t
CROSS JOIN (VALUES
  ('James Mechanic', '+256700200001', 'Engine', 25000, false),
  ('External Garage Ltd', '+256700200002', 'General', 35000, true)
) AS m(name, phone, spec, rate, ext)
WHERE t.slug = 'demo'
ON CONFLICT DO NOTHING;

INSERT INTO vehicle_inspections (tenant_id, vehicle_id, vehicle_name, vehicle_plate, driver_name, inspection_type, inspection_date, odometer_reading, overall_status, inspector_name)
SELECT t.id, 'asset-1', 'Truck Alpha', 'UAA 001A', 'John Okello', 'pre-trip', NOW() - INTERVAL '1 day', 125000, 'pass', 'Fleet Inspector'
FROM tenants t WHERE t.slug = 'demo'
ON CONFLICT DO NOTHING;

INSERT INTO maintenance_logs (tenant_id, vehicle_id, vehicle_name, vehicle_plate, maintenance_type, priority, description, mechanic_name, start_date, status, labor_cost, parts_cost, total_cost)
SELECT t.id, 'asset-1', 'Truck Alpha', 'UAA 001A', 'scheduled', 'medium', 'Oil change and filter replacement', 'James Mechanic', NOW() - INTERVAL '7 days', 'completed', 50000, 120000, 170000
FROM tenants t WHERE t.slug = 'demo'
ON CONFLICT DO NOTHING;

INSERT INTO breakdown_reports (tenant_id, vehicle_id, vehicle_name, vehicle_plate, driver_name, description, severity, breakdown_time, total_cost)
SELECT t.id, 'asset-2', 'Truck Beta', 'UAA 002B', 'Peter Ssemwogerere', 'Alternator failure on highway', 'major', NOW() - INTERVAL '14 days', 450000
FROM tenants t WHERE t.slug = 'demo'
ON CONFLICT DO NOTHING;

INSERT INTO geofences (tenant_id, name, type, center, radius, color, is_active)
SELECT t.id, g.name, 'circle', g.center::jsonb, g.radius, g.color, true
FROM tenants t
CROSS JOIN (VALUES
  ('Kampala Depot', '{"lat":0.3476,"lng":32.5825}', 500, '#004225'),
  ('Jinja Warehouse', '{"lat":0.4244,"lng":33.2042}', 300, '#3B82F6')
) AS g(name, center, radius, color)
WHERE t.slug = 'demo'
ON CONFLICT DO NOTHING;

INSERT INTO driver_performance_snapshots (tenant_id, driver_id, snapshot_date, safety_score, fuel_efficiency, on_time_rate, violations_count, trips_count, total_distance)
SELECT t.id, d.id, CURRENT_DATE, 85.5, 32.4, 92.0, 2, 12, 1450.0
FROM tenants t
JOIN drivers d ON d.tenant_id = t.id AND d.license_number = 'DL-UG-10001'
WHERE t.slug = 'demo'
ON CONFLICT (tenant_id, driver_id, snapshot_date) DO NOTHING;

INSERT INTO alerts (tenant_id, source_type, type, severity, title, description, occurred_at, acknowledged)
SELECT t.id, 'wialon', 'maintenance', 'warning', 'Service due: Truck Alpha', 'Oil change due in 500 km', NOW() - INTERVAL '2 days', false
FROM tenants t WHERE t.slug = 'demo'
  AND NOT EXISTS (
    SELECT 1 FROM alerts a WHERE a.tenant_id = t.id AND a.title = 'Service due: Truck Alpha'
  );
