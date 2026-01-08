-- Rial Photo Verification Database Schema
-- PostgreSQL 14+

-- =====================================
-- CERTIFIED IMAGES TABLE
-- =====================================
CREATE TABLE IF NOT EXISTS certified_images (
    id SERIAL PRIMARY KEY,
    user_id VARCHAR(255),
    original_filename VARCHAR(500),
    image_hash VARCHAR(64) NOT NULL UNIQUE,
    merkle_root VARCHAR(64) NOT NULL,
    image_url TEXT,
    file_size_bytes INTEGER,
    dimensions_width INTEGER,
    dimensions_height INTEGER,

    -- Cryptographic data
    c2pa_claim JSONB,
    signature TEXT,
    public_key TEXT,
    signature_type VARCHAR(50) DEFAULT 'webcrypto',

    -- ZK Proofs
    zk_proofs JSONB,
    proving_system VARCHAR(50) DEFAULT 'snarkjs',
    proof_performance JSONB,

    -- Device & Location data
    camera_info JSONB,
    gps_location JSONB,
    motion_data JSONB,
    temporal_data JSONB,
    device_fingerprint JSONB,

    -- Verification scores
    authenticity_score DECIMAL(5,2),
    fraud_probability DECIMAL(5,4),
    ai_detection_score DECIMAL(5,2),
    ai_detection_result JSONB,
    liveness_score DECIMAL(5,2),
    liveness_result JSONB,

    -- Verification status
    is_verified BOOLEAN DEFAULT FALSE,
    verification_count INTEGER DEFAULT 0,
    last_verified_at TIMESTAMP WITH TIME ZONE,

    -- Share code for easy verification
    share_code VARCHAR(20) UNIQUE,

    -- Timestamps
    created_at TIMESTAMP WITH TIME ZONE DEFAULT CURRENT_TIMESTAMP,
    updated_at TIMESTAMP WITH TIME ZONE DEFAULT CURRENT_TIMESTAMP
);

-- Indexes for fast lookups
CREATE INDEX IF NOT EXISTS idx_certified_images_hash ON certified_images(image_hash);
CREATE INDEX IF NOT EXISTS idx_certified_images_merkle ON certified_images(merkle_root);
CREATE INDEX IF NOT EXISTS idx_certified_images_share_code ON certified_images(share_code);
CREATE INDEX IF NOT EXISTS idx_certified_images_created ON certified_images(created_at DESC);

-- =====================================
-- TIMESTAMP LOG TABLE (Transparency Log)
-- =====================================
CREATE TABLE IF NOT EXISTS timestamp_log (
    id SERIAL PRIMARY KEY,
    log_index INTEGER NOT NULL UNIQUE,

    -- Image data
    image_hash VARCHAR(64) NOT NULL,
    merkle_root VARCHAR(64),
    metadata_hash VARCHAR(64),

    -- Device info
    device_public_key TEXT,
    signature_type VARCHAR(50),

    -- Verification flags
    flag_webauthn BOOLEAN DEFAULT FALSE,
    flag_liveness BOOLEAN DEFAULT FALSE,
    flag_ai_verified BOOLEAN DEFAULT FALSE,

    -- Timestamp data
    timestamp_ms BIGINT NOT NULL,
    timestamp_iso TIMESTAMP WITH TIME ZONE NOT NULL,

    -- Server signature (ECDSA P-256)
    server_signature TEXT NOT NULL,

    -- Chain integrity
    previous_hash VARCHAR(64),
    entry_hash VARCHAR(64) NOT NULL,

    -- Metadata
    created_at TIMESTAMP WITH TIME ZONE DEFAULT CURRENT_TIMESTAMP
);

-- Indexes
CREATE INDEX IF NOT EXISTS idx_timestamp_log_image ON timestamp_log(image_hash);
CREATE INDEX IF NOT EXISTS idx_timestamp_log_index ON timestamp_log(log_index);
CREATE INDEX IF NOT EXISTS idx_timestamp_log_entry ON timestamp_log(entry_hash);

-- =====================================
-- VERIFICATION REQUESTS TABLE
-- =====================================
CREATE TABLE IF NOT EXISTS verification_requests (
    id SERIAL PRIMARY KEY,

    -- What was verified
    image_hash VARCHAR(64),
    share_code VARCHAR(20),

    -- Verification result
    is_verified BOOLEAN,
    verification_details JSONB,

    -- Request info
    requester_ip VARCHAR(45),
    requester_user_agent TEXT,

    -- Timestamps
    created_at TIMESTAMP WITH TIME ZONE DEFAULT CURRENT_TIMESTAMP
);

CREATE INDEX IF NOT EXISTS idx_verification_image ON verification_requests(image_hash);
CREATE INDEX IF NOT EXISTS idx_verification_code ON verification_requests(share_code);

-- =====================================
-- ZK PROOF CACHE TABLE
-- =====================================
CREATE TABLE IF NOT EXISTS zk_proof_cache (
    id SERIAL PRIMARY KEY,
    input_hash VARCHAR(64) NOT NULL,
    transformation_hash VARCHAR(64) NOT NULL,
    output_hash VARCHAR(64),
    proof_data JSONB NOT NULL,
    proving_system VARCHAR(50) DEFAULT 'snarkjs',
    proof_size_bytes INTEGER,
    generation_time_ms INTEGER,
    verification_time_ms INTEGER,
    use_count INTEGER DEFAULT 1,
    last_used_at TIMESTAMP WITH TIME ZONE DEFAULT CURRENT_TIMESTAMP,
    created_at TIMESTAMP WITH TIME ZONE DEFAULT CURRENT_TIMESTAMP,

    UNIQUE(input_hash, transformation_hash)
);

CREATE INDEX IF NOT EXISTS idx_zk_cache_input ON zk_proof_cache(input_hash);

-- =====================================
-- API USAGE ANALYTICS TABLE
-- =====================================
CREATE TABLE IF NOT EXISTS api_usage (
    id SERIAL PRIMARY KEY,
    endpoint VARCHAR(255) NOT NULL,
    method VARCHAR(10) NOT NULL,
    user_id VARCHAR(255),
    ip_address VARCHAR(45),
    user_agent TEXT,
    request_size_bytes INTEGER,
    response_size_bytes INTEGER,
    response_time_ms INTEGER,
    status_code INTEGER,
    created_at TIMESTAMP WITH TIME ZONE DEFAULT CURRENT_TIMESTAMP
);

CREATE INDEX IF NOT EXISTS idx_api_usage_endpoint ON api_usage(endpoint);
CREATE INDEX IF NOT EXISTS idx_api_usage_created ON api_usage(created_at DESC);

-- =====================================
-- SYSTEM METRICS TABLE
-- =====================================
CREATE TABLE IF NOT EXISTS system_metrics (
    id SERIAL PRIMARY KEY,
    metric_name VARCHAR(100) NOT NULL,
    metric_value DECIMAL(20,6) NOT NULL,
    metric_unit VARCHAR(50),
    tags JSONB,
    collected_at TIMESTAMP WITH TIME ZONE DEFAULT CURRENT_TIMESTAMP
);

CREATE INDEX IF NOT EXISTS idx_metrics_name ON system_metrics(metric_name);
CREATE INDEX IF NOT EXISTS idx_metrics_collected ON system_metrics(collected_at DESC);

-- =====================================
-- FRAUD EVENTS TABLE
-- =====================================
CREATE TABLE IF NOT EXISTS fraud_events (
    id SERIAL PRIMARY KEY,
    certified_image_id INTEGER REFERENCES certified_images(id),
    fraud_type VARCHAR(100) NOT NULL,
    confidence_score DECIMAL(5,4),
    detection_method VARCHAR(100),
    metadata JSONB,
    is_confirmed BOOLEAN DEFAULT FALSE,
    reviewed_at TIMESTAMP WITH TIME ZONE,
    flagged_at TIMESTAMP WITH TIME ZONE DEFAULT CURRENT_TIMESTAMP
);

CREATE INDEX IF NOT EXISTS idx_fraud_image ON fraud_events(certified_image_id);
CREATE INDEX IF NOT EXISTS idx_fraud_type ON fraud_events(fraud_type);

-- =====================================
-- SERVER KEYS TABLE (for timestamp signing)
-- =====================================
CREATE TABLE IF NOT EXISTS server_keys (
    id SERIAL PRIMARY KEY,
    key_type VARCHAR(50) NOT NULL,
    public_key TEXT NOT NULL,
    private_key_encrypted TEXT, -- Only store encrypted, or use HSM
    algorithm VARCHAR(50) DEFAULT 'ECDSA-P256',
    is_active BOOLEAN DEFAULT TRUE,
    created_at TIMESTAMP WITH TIME ZONE DEFAULT CURRENT_TIMESTAMP,
    expires_at TIMESTAMP WITH TIME ZONE
);

-- =====================================
-- HELPER FUNCTIONS
-- =====================================

-- Update timestamp function
CREATE OR REPLACE FUNCTION update_updated_at()
RETURNS TRIGGER AS $$
BEGIN
    NEW.updated_at = CURRENT_TIMESTAMP;
    RETURN NEW;
END;
$$ LANGUAGE plpgsql;

-- Apply to certified_images
DROP TRIGGER IF EXISTS update_certified_images_updated_at ON certified_images;
CREATE TRIGGER update_certified_images_updated_at
    BEFORE UPDATE ON certified_images
    FOR EACH ROW
    EXECUTE FUNCTION update_updated_at();

-- =====================================
-- INITIAL DATA
-- =====================================

-- Insert a test record to verify schema works
-- DELETE FROM certified_images WHERE image_hash = 'test_hash_delete_me';

COMMENT ON TABLE certified_images IS 'Stores certified photo attestations with cryptographic proofs';
COMMENT ON TABLE timestamp_log IS 'Append-only transparency log for timestamp proofs';
COMMENT ON TABLE verification_requests IS 'Log of all verification attempts';
