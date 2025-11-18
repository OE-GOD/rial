/**
 * Database connection and configuration for ZK-IMG
 * Supports PostgreSQL and Redis for production deployment
 */

const { Pool } = require('pg');
const redis = require('redis');

// Database configuration
const dbConfig = {
  host: process.env.DB_HOST || 'localhost',
  port: process.env.DB_PORT || 5432,
  database: process.env.DB_NAME || 'zkimg',
  user: process.env.DB_USER || 'zkimg',
  password: process.env.DB_PASSWORD || 'zkimg_secure_password',
  max: 20, // Maximum number of clients in pool
  idleTimeoutMillis: 30000,
  connectionTimeoutMillis: 2000,
};

// Redis configuration
const redisConfig = {
  host: process.env.REDIS_HOST || 'localhost',
  port: process.env.REDIS_PORT || 6379,
  password: process.env.REDIS_PASSWORD,
  retry_strategy: (times) => {
    const delay = Math.min(times * 50, 2000);
    return delay;
  }
};

// Database connections
let pool = null;
let redisClient = null;

// Initialize database connections
async function initDatabase() {
  try {
    // PostgreSQL connection
    console.log('🔌 Connecting to PostgreSQL...');
    pool = new Pool(dbConfig);

    // Test connection
    const client = await pool.connect();
    console.log('✅ PostgreSQL connected successfully');

    // Create tables if they don't exist
    await createTables(client);
    client.release();

    // Redis connection
    console.log('🔌 Connecting to Redis...');
    redisClient = redis.createClient(redisConfig);

    redisClient.on('connect', () => {
      console.log('✅ Redis connected successfully');
    });

    redisClient.on('error', (err) => {
      console.error('❌ Redis connection error:', err.message);
    });

    await redisClient.connect();

    console.log('🎉 Database initialization complete');
    return { pool, redisClient };

  } catch (error) {
    console.error('❌ Database initialization failed:', error.message);
    throw error;
  }
}

// Create database tables
async function createTables(client) {
  try {
    // Check if tables exist
    const result = await client.query(`
      SELECT EXISTS (
        SELECT 1
        FROM information_schema.tables
        WHERE table_name = 'certified_images'
      );
    `);

    if (!result.rows[0].exists) {
      console.log('📋 Creating database tables...');

      // Read and execute schema
      const fs = require('fs').promises;
      const path = require('path');
      const schemaPath = path.join(__dirname, '..', '..', 'db', 'init.sql');

      try {
        const schema = await fs.readFile(schemaPath, 'utf8');
        await client.query(schema);
        console.log('✅ Database tables created');
      } catch (schemaError) {
        console.warn('⚠️  Could not load schema file, tables may already exist');
      }
    } else {
      console.log('✅ Database tables already exist');
    }
  } catch (error) {
    console.error('❌ Error creating tables:', error.message);
  }
}

// Certified Images Model
class CertifiedImagesModel {
  constructor() {
    this.pool = pool;
  }

  async create(imageData) {
    const query = `
      INSERT INTO certified_images (
        user_id, original_filename, image_hash, image_url, file_size_bytes,
        dimensions_width, dimensions_height, c2pa_claim, merkle_root, signature,
        zk_proofs, proving_system, proof_performance, camera_info, gps_location,
        motion_data, temporal_data, device_fingerprint, authenticity_score,
        fraud_probability, ai_detection_confidence
      ) VALUES (
        $1, $2, $3, $4, $5, $6, $7, $8, $9, $10, $11, $12, $13, $14, $15,
        $16, $17, $18, $19, $20, $21
      ) RETURNING id;
    `;

    const values = [
      imageData.userId,
      imageData.originalFilename,
      imageData.imageHash,
      imageData.imageUrl,
      imageData.fileSizeBytes,
      imageData.dimensions?.width,
      imageData.dimensions?.height,
      JSON.stringify(imageData.c2paClaim),
      imageData.merkleRoot,
      imageData.signature,
      JSON.stringify(imageData.zkProofs),
      imageData.provingSystem || 'snarkjs',
      JSON.stringify(imageData.proofPerformance),
      JSON.stringify(imageData.cameraInfo),
      JSON.stringify(imageData.gpsLocation),
      JSON.stringify(imageData.motionData),
      JSON.stringify(imageData.temporalData),
      JSON.stringify(imageData.deviceFingerprint),
      imageData.authenticityScore,
      imageData.fraudProbability,
      imageData.aiDetectionConfidence
    ];

    try {
      const result = await this.pool.query(query, values);
      return result.rows[0].id;
    } catch (error) {
      console.error('❌ Error creating certified image:', error);
      throw error;
    }
  }

  async findByHash(imageHash) {
    const query = 'SELECT * FROM certified_images WHERE image_hash = $1';
    const result = await this.pool.query(query, [imageHash]);
    return result.rows[0];
  }

  async getRecent(limit = 10) {
    const query = 'SELECT * FROM certified_images ORDER BY created_at DESC LIMIT $1';
    const result = await this.pool.query(query, [limit]);
    return result.rows;
  }

  async updateVerification(id, isVerified, verificationCount) {
    const query = `
      UPDATE certified_images
      SET is_verified = $1, verification_count = $2, last_verified_at = NOW()
      WHERE id = $3
    `;
    await this.pool.query(query, [isVerified, verificationCount, id]);
  }
}

// ZK Proof Cache Model
class ZKProofCacheModel {
  constructor() {
    this.pool = pool;
    this.redis = redisClient;
  }

  async getCachedProof(inputHash, transformationHash) {
    try {
      // Check Redis first
      const cacheKey = `zk_proof:${inputHash}:${transformationHash}`;
      const cached = await this.redis.get(cacheKey);

      if (cached) {
        const proofData = JSON.parse(cached);
        // Update last used time
        await this.pool.query(
          'UPDATE zk_proof_cache SET last_used_at = NOW(), use_count = use_count + 1 WHERE id = $1',
          [proofData.id]
        );
        return proofData;
      }

      // Check PostgreSQL
      const query = 'SELECT * FROM zk_proof_cache WHERE input_hash = $1 AND transformation_hash = $2';
      const result = await this.pool.query(query, [inputHash, transformationHash]);

      if (result.rows.length > 0) {
        const proofData = result.rows[0];
        // Cache in Redis for faster access
        await this.redis.setEx(cacheKey, 3600, JSON.stringify(proofData)); // 1 hour TTL
        return proofData;
      }

      return null;
    } catch (error) {
      console.error('❌ Error getting cached proof:', error);
      return null;
    }
  }

  async cacheProof(proofData) {
    try {
      const query = `
        INSERT INTO zk_proof_cache (
          input_hash, transformation_hash, output_hash, proof_data,
          proving_system, proof_size_bytes, generation_time_ms, verification_time_ms
        ) VALUES ($1, $2, $3, $4, $5, $6, $7, $8)
        ON CONFLICT (input_hash, transformation_hash) DO UPDATE SET
          proof_data = EXCLUDED.proof_data,
          last_used_at = NOW(),
          use_count = zk_proof_cache.use_count + 1
        RETURNING id;
      `;

      const values = [
        proofData.inputHash,
        proofData.transformationHash,
        proofData.outputHash,
        JSON.stringify(proofData.proof),
        proofData.provingSystem,
        proofData.proofSizeBytes,
        proofData.generationTimeMs,
        proofData.verificationTimeMs
      ];

      const result = await this.pool.query(query, values);
      const proofId = result.rows[0].id;

      // Cache in Redis
      const cacheKey = `zk_proof:${proofData.inputHash}:${proofData.transformationHash}`;
      await this.redis.setEx(cacheKey, 3600, JSON.stringify({ ...proofData, id: proofId }));

      return proofId;
    } catch (error) {
      console.error('❌ Error caching proof:', error);
      throw error;
    }
  }
}

// API Usage Analytics Model
class APIUsageModel {
  constructor() {
    this.pool = pool;
  }

  async logRequest(req, res, responseTime) {
    try {
      const query = `
        INSERT INTO api_usage (
          endpoint, method, user_id, ip_address, user_agent,
          request_size_bytes, response_size_bytes, response_time_ms, status_code
        ) VALUES ($1, $2, $3, $4, $5, $6, $7, $8, $9)
      `;

      const values = [
        req.path,
        req.method,
        req.user?.id,
        req.ip,
        req.get('User-Agent'),
        req.socket?.bytesRead || 0,
        res.get('Content-Length') || 0,
        responseTime,
        res.statusCode
      ];

      await this.pool.query(query, values);
    } catch (error) {
      console.error('❌ Error logging API usage:', error);
    }
  }

  async getUsageStats(hours = 24) {
    const query = `
      SELECT
        endpoint,
        method,
        COUNT(*) as request_count,
        AVG(response_time_ms) as avg_response_time,
        COUNT(CASE WHEN status_code >= 400 THEN 1 END) as error_count
      FROM api_usage
      WHERE created_at > NOW() - INTERVAL '${hours} hours'
      GROUP BY endpoint, method
      ORDER BY request_count DESC
    `;

    const result = await this.pool.query(query);
    return result.rows;
  }
}

// System Metrics Model
class SystemMetricsModel {
  constructor() {
    this.pool = pool;
  }

  async recordMetric(name, value, unit = null, tags = {}) {
    try {
      const query = `
        INSERT INTO system_metrics (metric_name, metric_value, metric_unit, tags)
        VALUES ($1, $2, $3, $4)
      `;

      await this.pool.query(query, [name, value, unit, JSON.stringify(tags)]);
    } catch (error) {
      console.error('❌ Error recording metric:', error);
    }
  }

  async getMetrics(name, hours = 24) {
    const query = `
      SELECT * FROM system_metrics
      WHERE metric_name = $1 AND collected_at > NOW() - INTERVAL '${hours} hours'
      ORDER BY collected_at DESC
    `;

    const result = await this.pool.query(query, [name]);
    return result.rows;
  }
}

// Fraud Events Model
class FraudEventsModel {
  constructor() {
    this.pool = pool;
  }

  async reportFraud(certifiedImageId, fraudType, confidence, method, metadata = {}) {
    try {
      const query = `
        INSERT INTO fraud_events (
          certified_image_id, fraud_type, confidence_score, detection_method, metadata
        ) VALUES ($1, $2, $3, $4, $5)
      `;

      await this.pool.query(query, [
        certifiedImageId,
        fraudType,
        confidence,
        method,
        JSON.stringify(metadata)
      ]);
    } catch (error) {
      console.error('❌ Error reporting fraud:', error);
      throw error;
    }
  }

  async getFraudStats(hours = 24) {
    const query = `
      SELECT
        fraud_type,
        COUNT(*) as event_count,
        AVG(confidence_score) as avg_confidence,
        MAX(flagged_at) as last_event
      FROM fraud_events
      WHERE flagged_at > NOW() - INTERVAL '${hours} hours'
      GROUP BY fraud_type
      ORDER BY event_count DESC
    `;

    const result = await this.pool.query(query);
    return result.rows;
  }
}

// Export models and initialization
module.exports = {
  initDatabase,
  models: {
    CertifiedImages: CertifiedImagesModel,
    ZKProofCache: ZKProofCacheModel,
    APIUsage: APIUsageModel,
    SystemMetrics: SystemMetricsModel,
    FraudEvents: FraudEventsModel
  }
};
