ALTER TABLE audit_logs ADD COLUMN type TEXT DEFAULT 'info';
ALTER TABLE audit_logs ADD COLUMN level TEXT DEFAULT 'low';
CREATE INDEX idx_audit_logs_type ON audit_logs(type);
CREATE INDEX idx_audit_logs_level ON audit_logs(level);
