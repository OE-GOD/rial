-- ZK-IMG Database Schema
-- PostgreSQL initialization script

-- Create database if it doesn't exist
-- (This is handled by docker-compose environment variables)

-- Create extensions
CREATE EXTENSION IF NOT EXISTS "uuid-ossp";
CREATE EXTENSION IF NOT EXISTS "pgcrypto";

-- Users table (for future authentication)
CREATE TABLE IF NOT EXISTS users (
    id UUID PRIMARY KEY DEFAULT uuid_generate_v4(),
    email VARCHAR(255) UNIQUE NOT NULL,
    username VARCHAR(100) UNIQUE,
    created_at TIMESTAMP WITH TIME ZONE DEFAULT NOW(),
    updated_at TIMESTAMP WITH TIME ZONE DEFAULT NOW(),
    is_active BOOLEAN DEFAULT true
);

-- Certified images table
CREATE TABLE IF NOT EXISTS certified_images (
    id UUID PRIMARY KEY DEFAULT uuid_generate_v4(),
    user_id UUID REFERENCES users(id) ON DELETE CASCADE,
    original_filename VARCHAR(255),
    image_hash VARCHAR(128) NOT NULL,
    image_url VARCHAR(500),
    file_size_bytes INTEGER,
    dimensions_width INTEGER,
    dimensions_height INTEGER,

    -- C2PA Claim data
    c2pa_claim JSONB,
    merkle_root VARCHAR(128),
    signature VARCHAR(500),

    -- ZK Proof data
    zk_proofs JSONB,
    proving_system VARCHAR(50) DEFAULT 'snarkjs',
    proof_performance JSONB,

    -- Anti-AI metadata
    camera_info JSONB,
    gps_location JSONB,
    motion_data JSONB,
    temporal_data JSONB,
    device_fingerprint JSONB,

    -- Fraud detection scores
    authenticity_score DECIMAL(5,4), -- 0.0000 to 1.0000
    fraud_probability DECIMAL(5,4), -- 0.0000 to 1.0000
    ai_detection_confidence DECIMAL(5,4),

    -- Metadata
    created_at TIMESTAMP WITH TIME ZONE DEFAULT NOW(),
    certified_at TIMESTAMP WITH TIME ZONE DEFAULT NOW(),
    expires_at TIMESTAMP WITH TIME ZONE,
    is_verified BOOLEAN DEFAULT false,
    verification_count INTEGER DEFAULT 0,
    last_verified_at TIMESTAMP WITH TIME ZONE,

    -- Blockchain data (future)
    blockchain_tx_hash VARCHAR(128),
    ipfs_cid VARCHAR(100)
);

-- Image transformations table
CREATE TABLE IF NOT EXISTS image_transformations (
    id UUID PRIMARY KEY DEFAULT uuid_generate_v4(),
    certified_image_id UUID REFERENCES certified_images(id) ON DELETE CASCADE,
    transformation_type VARCHAR(50) NOT NULL,
    parameters JSONB,
    order_index INTEGER NOT NULL,
    applied_at TIMESTAMP WITH TIME ZONE DEFAULT NOW()
);

-- ZK proof cache table
CREATE TABLE IF NOT EXISTS zk_proof_cache (
    id UUID PRIMARY KEY DEFAULT uuid_generate_v4(),
    input_hash VARCHAR(128) UNIQUE NOT NULL,
    transformation_hash VARCHAR(128) NOT NULL,
    output_hash VARCHAR(128) NOT NULL,
    proof_data JSONB NOT NULL,
    proving_system VARCHAR(50) DEFAULT 'snarkjs',
    proof_size_bytes INTEGER,
    generation_time_ms INTEGER,
    verification_time_ms INTEGER,
    created_at TIMESTAMP WITH TIME ZONE DEFAULT NOW(),
    last_used_at TIMESTAMP WITH TIME ZONE DEFAULT NOW(),
    use_count INTEGER DEFAULT 1
);

-- API usage analytics
CREATE TABLE IF NOT EXISTS api_usage (
    id UUID PRIMARY KEY DEFAULT uuid_generate_v4(),
    endpoint VARCHAR(100) NOT NULL,
    method VARCHAR(10) NOT NULL,
    user_id UUID REFERENCES users(id),
    ip_address INET,
    user_agent TEXT,
    request_size_bytes INTEGER,
    response_size_bytes INTEGER,
    response_time_ms INTEGER,
    status_code INTEGER,
    error_message TEXT,
    created_at TIMESTAMP WITH TIME ZONE DEFAULT NOW()
);

-- System metrics
CREATE TABLE IF NOT EXISTS system_metrics (
    id UUID PRIMARY KEY DEFAULT uuid_generate_v4(),
    metric_name VARCHAR(100) NOT NULL,
    metric_value DECIMAL(10,4),
    metric_unit VARCHAR(20),
    tags JSONB,
    collected_at TIMESTAMP WITH TIME ZONE DEFAULT NOW()
);

-- Fraud detection events
CREATE TABLE IF NOT EXISTS fraud_events (
    id UUID PRIMARY KEY DEFAULT uuid_generate_v4(),
    certified_image_id UUID REFERENCES certified_images(id),
    fraud_type VARCHAR(50) NOT NULL,
    confidence_score DECIMAL(5,4),
    detection_method VARCHAR(100),
    metadata JSONB,
    flagged_at TIMESTAMP WITH TIME ZONE DEFAULT NOW(),
    reviewed_by UUID REFERENCES users(id),
    review_status VARCHAR(20) DEFAULT 'pending', -- pending, confirmed, false_positive
    reviewed_at TIMESTAMP WITH TIME ZONE,
    notes TEXT
);

-- Indexes for performance
CREATE INDEX IF NOT EXISTS idx_certified_images_user_id ON certified_images(user_id);
CREATE INDEX IF NOT EXISTS idx_certified_images_created_at ON certified_images(created_at DESC);
CREATE INDEX IF NOT EXISTS idx_certified_images_hash ON certified_images(image_hash);
CREATE INDEX IF NOT EXISTS idx_certified_images_merkle_root ON certified_images(merkle_root);
CREATE INDEX IF NOT EXISTS idx_certified_images_verified ON certified_images(is_verified);

CREATE INDEX IF NOT EXISTS idx_transformations_image_id ON image_transformations(certified_image_id);
CREATE INDEX IF NOT EXISTS idx_transformations_order ON image_transformations(certified_image_id, order_index);

CREATE INDEX IF NOT EXISTS idx_proof_cache_input_hash ON zk_proof_cache(input_hash);
CREATE INDEX IF NOT EXISTS idx_proof_cache_transformation_hash ON zk_proof_cache(transformation_hash);
CREATE INDEX IF NOT EXISTS idx_proof_cache_output_hash ON zk_proof_cache(output_hash);

CREATE INDEX IF NOT EXISTS idx_api_usage_created_at ON api_usage(created_at DESC);
CREATE INDEX IF NOT EXISTS idx_api_usage_endpoint ON api_usage(endpoint, created_at DESC);

CREATE INDEX IF NOT EXISTS idx_system_metrics_name_time ON system_metrics(metric_name, collected_at DESC);

CREATE INDEX IF NOT EXISTS idx_fraud_events_image_id ON fraud_events(certified_image_id);
CREATE INDEX IF NOT EXISTS idx_fraud_events_type ON fraud_events(fraud_type, flagged_at DESC);
CREATE INDEX IF NOT EXISTS idx_fraud_events_status ON fraud_events(review_status, flagged_at DESC);

-- Views for analytics
CREATE OR REPLACE VIEW daily_usage_stats AS
SELECT
    DATE(created_at) as date,
    COUNT(*) as total_requests,
    COUNT(DISTINCT ip_address) as unique_ips,
    AVG(response_time_ms) as avg_response_time,
    SUM(CASE WHEN status_code >= 400 THEN 1 ELSE 0 END) as error_count
FROM api_usage
GROUP BY DATE(created_at)
ORDER BY date DESC;

CREATE OR REPLACE VIEW image_authenticity_stats AS
SELECT
    DATE(certified_at) as date,
    COUNT(*) as total_images,
    AVG(authenticity_score) as avg_authenticity,
    AVG(fraud_probability) as avg_fraud_probability,
    COUNT(CASE WHEN authenticity_score >= 0.95 THEN 1 END) as high_confidence_count,
    COUNT(CASE WHEN fraud_probability >= 0.8 THEN 1 END) as suspicious_count
FROM certified_images
WHERE certified_at IS NOT NULL
GROUP BY DATE(certified_at)
ORDER BY date DESC;

CREATE OR REPLACE VIEW proof_performance_stats AS
SELECT
    proving_system,
    COUNT(*) as proof_count,
    AVG(proof_size_bytes) as avg_proof_size,
    AVG(generation_time_ms) as avg_generation_time,
    AVG(verification_time_ms) as avg_verification_time,
    MIN(generation_time_ms) as min_generation_time,
    MAX(generation_time_ms) as max_generation_time
FROM zk_proof_cache
GROUP BY proving_system;

-- Functions for maintenance
CREATE OR REPLACE FUNCTION update_updated_at_column()
RETURNS TRIGGER AS $$
BEGIN
    NEW.updated_at = NOW();
    RETURN NEW;
END;
$$ language 'plpgsql';

-- Triggers
CREATE TRIGGER update_users_updated_at BEFORE UPDATE ON users
    FOR EACH ROW EXECUTE FUNCTION update_updated_at_column();

-- Initial data
INSERT INTO system_metrics (metric_name, metric_value, metric_unit, tags)
VALUES
    ('system_startup', 1, 'count', '{"event": "database_initialization"}'),
    ('database_version', 15, 'version', '{"component": "postgresql"}')
ON CONFLICT DO NOTHING;

-- Comments for documentation
COMMENT ON TABLE certified_images IS 'Stores all certified images with cryptographic proofs and metadata';
COMMENT ON TABLE zk_proof_cache IS 'Caches ZK proofs to avoid recomputation for identical inputs';
COMMENT ON TABLE fraud_events IS 'Tracks potential fraud detection events for review';
COMMENT ON TABLE api_usage IS 'Logs all API requests for analytics and monitoring';
COMMENT ON TABLE system_metrics IS 'System performance and health metrics';

-- Grant permissions (adjust as needed for your setup)
-- GRANT SELECT, INSERT, UPDATE ON ALL TABLES IN SCHEMA public TO zkimg_app;
-- GRANT USAGE ON ALL SEQUENCES IN SCHEMA public TO zkimg_app;
