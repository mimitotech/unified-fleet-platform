-- Align module integration sources with actual Wialon-first implementations
UPDATE module_definitions
SET sources = '{wialon,tracksolid}'
WHERE key = 'surveillance';

UPDATE module_definitions
SET sources = '{wialon,tracksolid}'
WHERE key = 'monitoring';
