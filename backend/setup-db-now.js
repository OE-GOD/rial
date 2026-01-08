const { Client } = require('pg');

const client = new Client({
    connectionString: 'postgresql://rial_db_user:WIcgX87YSyHomDGGryfvGl8Cm44dHBQt@dpg-d4cls2idbo4c73dbbis0-a.oregon-postgres.render.com/rial_db',
    ssl: { rejectUnauthorized: false }
});

async function setupDatabase() {
    try {
        console.log('🔗 Connecting to Render database...');
        await client.connect();
        console.log('✅ Connected successfully!');
        
        // Create claims table
        console.log('📋 Creating claims table...');
        await client.query(`
            CREATE TABLE IF NOT EXISTS claims (
                id VARCHAR(255) PRIMARY KEY,
                claim_type VARCHAR(50) NOT NULL,
                policy_number VARCHAR(100) NOT NULL,
                description TEXT NOT NULL,
                estimated_amount DECIMAL(10, 2),
                status VARCHAR(50) DEFAULT 'pending_review',
                submitted_at TIMESTAMP DEFAULT CURRENT_TIMESTAMP,
                all_photos_verified BOOLEAN DEFAULT FALSE,
                adjuster_review JSONB,
                fraud_score DECIMAL(3, 2),
                created_at TIMESTAMP DEFAULT CURRENT_TIMESTAMP,
                updated_at TIMESTAMP DEFAULT CURRENT_TIMESTAMP
            );
        `);
        console.log('✅ claims table ready');
        
        // Create claim_photos table
        console.log('📋 Creating claim_photos table...');
        await client.query(`
            CREATE TABLE IF NOT EXISTS claim_photos (
                id VARCHAR(255) PRIMARY KEY,
                claim_id VARCHAR(255) REFERENCES claims(id) ON DELETE CASCADE,
                image_data BYTEA,
                c2pa_claim JSONB NOT NULL,
                metadata JSONB NOT NULL,
                zk_proof JSONB,
                capture_date TIMESTAMP NOT NULL,
                verification_status VARCHAR(50) DEFAULT 'verified',
                verification_result JSONB,
                frozen_size INTEGER,
                created_at TIMESTAMP DEFAULT CURRENT_TIMESTAMP
            );
        `);
        console.log('✅ claim_photos table ready');
        
        // Create indexes
        console.log('📋 Creating indexes...');
        await client.query(`
            CREATE INDEX IF NOT EXISTS idx_claims_status ON claims(status);
            CREATE INDEX IF NOT EXISTS idx_claims_policy ON claims(policy_number);
            CREATE INDEX IF NOT EXISTS idx_claims_date ON claims(submitted_at DESC);
            CREATE INDEX IF NOT EXISTS idx_photos_claim ON claim_photos(claim_id);
            CREATE INDEX IF NOT EXISTS idx_photos_status ON claim_photos(verification_status);
        `);
        console.log('✅ Indexes created');
        
        // Check tables
        const tables = await client.query(`
            SELECT table_name FROM information_schema.tables 
            WHERE table_schema = 'public' 
            ORDER BY table_name;
        `);
        
        console.log('');
        console.log('✅ Tables in database:');
        tables.rows.forEach(row => console.log(`   • ${row.table_name}`));
        
        const claimCount = await client.query('SELECT COUNT(*) FROM claims');
        const photoCount = await client.query('SELECT COUNT(*) FROM claim_photos');
        
        console.log('');
        console.log('📊 Current data:');
        console.log(`   • Claims: ${claimCount.rows[0].count}`);
        console.log(`   • Photos: ${photoCount.rows[0].count}`);
        console.log('');
        console.log('🎉 PRODUCTION DATABASE READY!');
        console.log('');
        console.log('✅ Your app can now store data permanently!');
        console.log('✅ Data persists across server restarts!');
        console.log('✅ Ready for production use!');
        
    } catch (error) {
        console.error('❌ Setup failed:', error.message);
        console.error(error);
    } finally {
        await client.end();
    }
}

setupDatabase();
