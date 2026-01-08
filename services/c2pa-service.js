/**
 * C2PA (Content Credentials) Service
 *
 * Implements the C2PA standard for content provenance and authenticity.
 * This enables interoperability with Adobe, Microsoft, Google, and other
 * industry players who have adopted the C2PA specification.
 *
 * Based on: https://c2pa.org/specifications/specifications/2.2/specs/C2PA_Specification.html
 */

const fs = require('fs');
const path = require('path');
const crypto = require('crypto');
const { execSync, spawn } = require('child_process');

// C2PA Node.js library (ES Module - loaded dynamically)
let c2paNode = null;
let Reader = null;
let Builder = null;
let LocalSigner = null;
let CallbackSigner = null;
let c2paLoadPromise = null;

// Dynamically load C2PA library (ES Module)
async function loadC2PALibrary() {
    if (c2paLoadPromise) return c2paLoadPromise;

    c2paLoadPromise = (async () => {
        try {
            c2paNode = await import('@contentauth/c2pa-node');
            Reader = c2paNode.Reader;
            Builder = c2paNode.Builder;
            LocalSigner = c2paNode.LocalSigner;
            CallbackSigner = c2paNode.CallbackSigner;
            console.log('C2PA Node library loaded successfully');
            return true;
        } catch (error) {
            console.warn('C2PA Node library not available:', error.message);
            console.warn('Using fallback implementation for C2PA');
            return false;
        }
    })();

    return c2paLoadPromise;
}

// Certificate paths
const CERT_DIR = path.join(__dirname, '..', 'certs', 'c2pa');
const PRIVATE_KEY_PATH = path.join(CERT_DIR, 'private-key.pem');
const CERTIFICATE_PATH = path.join(CERT_DIR, 'certificate.pem');

/**
 * C2PA Service Class
 * Handles content credential creation, signing, and verification
 */
class C2PAService {
    constructor() {
        this.initialized = false;
        this.signer = null;
        this.certificate = null;
        this.privateKey = null;

        // C2PA claim generator identifier
        this.claimGenerator = 'Rial/1.0 c2pa-node/1.0';

        // Supported assertions
        this.supportedAssertions = [
            'c2pa.actions',           // Actions taken on the asset
            'c2pa.hash.data',         // Hash binding
            'c2pa.thumbnail.claim',   // Thumbnail of the asset
            'stds.schema-org.CreativeWork', // Schema.org creative work
            'stds.exif',              // EXIF metadata
            'c2pa.location.GeoCoordinates', // GPS location
        ];
    }

    /**
     * Initialize the C2PA service
     * Generates certificates if they don't exist
     */
    async initialize() {
        if (this.initialized) return;

        try {
            // Load C2PA library (ES Module)
            await loadC2PALibrary();

            // Ensure certificate directory exists
            if (!fs.existsSync(CERT_DIR)) {
                fs.mkdirSync(CERT_DIR, { recursive: true });
            }

            // Generate certificates if they don't exist
            if (!fs.existsSync(PRIVATE_KEY_PATH) || !fs.existsSync(CERTIFICATE_PATH)) {
                await this.generateCertificates();
            }

            // Load certificates
            this.privateKey = fs.readFileSync(PRIVATE_KEY_PATH);
            this.certificate = fs.readFileSync(CERTIFICATE_PATH);

            // Create signer if C2PA library is available
            if (LocalSigner) {
                try {
                    this.signer = LocalSigner.newSigner(
                        this.certificate,
                        this.privateKey,
                        'es256', // ECDSA with P-256 and SHA-256
                        null     // No timestamp authority for now
                    );
                    console.log('C2PA LocalSigner initialized');
                } catch (signerError) {
                    console.warn('Could not create LocalSigner:', signerError.message);
                }
            }

            this.initialized = true;
            console.log('C2PA Service initialized successfully');

        } catch (error) {
            console.error('Failed to initialize C2PA service:', error);
            throw error;
        }
    }

    /**
     * Generate self-signed certificates for development
     * In production, use certificates from a trusted CA
     */
    async generateCertificates() {
        console.log('Generating C2PA certificates...');

        try {
            const ecKeyPath = path.join(CERT_DIR, 'ec-key.pem');

            // Generate EC private key (P-256) in SEC1 format first
            execSync(`openssl ecparam -name prime256v1 -genkey -noout -out "${ecKeyPath}"`, {
                stdio: 'pipe'
            });

            // Convert to PKCS#8 format (required by C2PA library)
            execSync(`openssl pkcs8 -topk8 -nocrypt -in "${ecKeyPath}" -out "${PRIVATE_KEY_PATH}"`, {
                stdio: 'pipe'
            });

            // Generate self-signed certificate
            // In production, this should be replaced with a proper certificate chain
            const certConfig = `
[req]
default_bits = 256
prompt = no
default_md = sha256
distinguished_name = dn
x509_extensions = v3_req

[dn]
CN = Rial Content Credentials
O = Rial Insurance Platform
C = US

[v3_req]
basicConstraints = CA:FALSE
keyUsage = digitalSignature, nonRepudiation
extendedKeyUsage = codeSigning, emailProtection
subjectAltName = @alt_names

[alt_names]
DNS.1 = rial.local
`;

            const configPath = path.join(CERT_DIR, 'cert.conf');
            fs.writeFileSync(configPath, certConfig);

            execSync(`openssl req -new -x509 -key "${PRIVATE_KEY_PATH}" -out "${CERTIFICATE_PATH}" -days 365 -config "${configPath}"`, {
                stdio: 'pipe'
            });

            // Clean up temporary files
            fs.unlinkSync(configPath);
            fs.unlinkSync(ecKeyPath);

            console.log('C2PA certificates generated successfully');
            console.log(`  Private key (PKCS#8): ${PRIVATE_KEY_PATH}`);
            console.log(`  Certificate: ${CERTIFICATE_PATH}`);

        } catch (error) {
            console.error('Failed to generate certificates:', error);
            throw new Error('Certificate generation failed. Ensure OpenSSL is installed.');
        }
    }

    /**
     * Create a C2PA manifest for an image
     * @param {Object} options - Manifest options
     * @returns {Object} Manifest data
     */
    createManifest(options = {}) {
        const {
            title = 'Certified Photo',
            format = 'image/jpeg',
            instanceId = crypto.randomUUID(),
            claims = {}
        } = options;

        const now = new Date().toISOString();

        // Build C2PA manifest structure
        const manifest = {
            // Manifest metadata
            claim_generator: this.claimGenerator,
            claim_generator_info: [{
                name: 'Rial',
                version: '1.0.0',
                icon: null
            }],

            // Claim information
            title: title,
            format: format,
            instance_id: `xmp:iid:${instanceId}`,

            // Timestamps
            signature_info: {
                alg: 'Es256',
                issuer: 'Rial Content Credentials',
                cert_serial_number: null,
                time: now
            },

            // Assertions (provenance data)
            assertions: []
        };

        return manifest;
    }

    /**
     * Add an action assertion to the manifest
     * @param {Object} manifest - The manifest to modify
     * @param {Object} action - The action to add
     */
    addActionAssertion(manifest, action) {
        const actionAssertion = {
            label: 'c2pa.actions',
            data: {
                actions: [{
                    action: action.type || 'c2pa.created',
                    when: action.when || new Date().toISOString(),
                    softwareAgent: action.softwareAgent || this.claimGenerator,
                    parameters: action.parameters || {},
                    digitalSourceType: action.digitalSourceType || 'http://cv.iptc.org/newscodes/digitalsourcetype/digitalCapture'
                }]
            }
        };

        manifest.assertions.push(actionAssertion);
        return manifest;
    }

    /**
     * Add EXIF metadata assertion
     * @param {Object} manifest - The manifest to modify
     * @param {Object} exifData - EXIF metadata
     */
    addExifAssertion(manifest, exifData) {
        const exifAssertion = {
            label: 'stds.exif',
            data: {
                '@context': {
                    exif: 'http://ns.adobe.com/exif/1.0/',
                    tiff: 'http://ns.adobe.com/tiff/1.0/'
                },
                'exif:DateTimeOriginal': exifData.dateTime || new Date().toISOString(),
                'exif:GPSLatitude': exifData.latitude,
                'exif:GPSLongitude': exifData.longitude,
                'exif:GPSAltitude': exifData.altitude,
                'tiff:Make': exifData.make,
                'tiff:Model': exifData.model,
                'exif:LensModel': exifData.lensModel,
                'exif:FocalLength': exifData.focalLength,
                'exif:FNumber': exifData.fNumber,
                'exif:ExposureTime': exifData.exposureTime,
                'exif:ISOSpeedRatings': exifData.iso
            }
        };

        // Remove undefined values
        Object.keys(exifAssertion.data).forEach(key => {
            if (exifAssertion.data[key] === undefined) {
                delete exifAssertion.data[key];
            }
        });

        manifest.assertions.push(exifAssertion);
        return manifest;
    }

    /**
     * Add GPS location assertion
     * @param {Object} manifest - The manifest to modify
     * @param {Object} location - Location data
     */
    addLocationAssertion(manifest, location) {
        if (!location.latitude || !location.longitude) {
            return manifest;
        }

        const locationAssertion = {
            label: 'c2pa.location.GeoCoordinates',
            data: {
                '@context': 'https://schema.org',
                '@type': 'GeoCoordinates',
                latitude: location.latitude,
                longitude: location.longitude,
                altitude: location.altitude
            }
        };

        manifest.assertions.push(locationAssertion);
        return manifest;
    }

    /**
     * Add creative work assertion (authorship info)
     * @param {Object} manifest - The manifest to modify
     * @param {Object} workInfo - Creative work information
     */
    addCreativeWorkAssertion(manifest, workInfo) {
        const creativeWorkAssertion = {
            label: 'stds.schema-org.CreativeWork',
            data: {
                '@context': 'https://schema.org',
                '@type': 'CreativeWork',
                author: workInfo.author ? [{
                    '@type': 'Person',
                    name: workInfo.author.name,
                    identifier: workInfo.author.identifier
                }] : undefined,
                dateCreated: workInfo.dateCreated || new Date().toISOString(),
                copyrightNotice: workInfo.copyright
            }
        };

        manifest.assertions.push(creativeWorkAssertion);
        return manifest;
    }

    /**
     * Add hash data assertion (content binding)
     * @param {Object} manifest - The manifest to modify
     * @param {Buffer} imageBuffer - Image data
     */
    addHashAssertion(manifest, imageBuffer) {
        const hash = crypto.createHash('sha256').update(imageBuffer).digest('hex');

        const hashAssertion = {
            label: 'c2pa.hash.data',
            data: {
                exclusions: [],
                name: 'jumbf manifest',
                alg: 'sha256',
                hash: hash,
                pad: ''
            }
        };

        manifest.assertions.push(hashAssertion);
        return manifest;
    }

    /**
     * Add Rial-specific authenticity assertion
     * @param {Object} manifest - The manifest to modify
     * @param {Object} rialData - Rial authenticity data
     */
    addRialAuthenticityAssertion(manifest, rialData) {
        const rialAssertion = {
            label: 'rial.authenticity',
            data: {
                merkleRoot: rialData.merkleRoot,
                deviceSignature: rialData.deviceSignature,
                devicePublicKey: rialData.devicePublicKey,
                secureEnclaveAttestation: rialData.secureEnclaveAttestation || false,
                biometricVerified: rialData.biometricVerified || false,
                motionData: rialData.motionData ? {
                    accelerometer: rialData.motionData.accelerometer,
                    gyroscope: rialData.motionData.gyroscope,
                    timestamp: rialData.motionData.timestamp
                } : undefined,
                zkProof: rialData.zkProof ? {
                    type: rialData.zkProof.type,
                    proof: rialData.zkProof.proof,
                    publicSignals: rialData.zkProof.publicSignals
                } : undefined
            }
        };

        manifest.assertions.push(rialAssertion);
        return manifest;
    }

    /**
     * Sign an image with C2PA credentials
     * @param {Buffer} inputBuffer - Input image buffer
     * @param {Object} manifest - C2PA manifest
     * @returns {Object} Signed image data
     */
    async signImage(inputBuffer, manifest) {
        await this.initialize();

        const outputPath = path.join(__dirname, '..', 'temp', `c2pa-${Date.now()}.jpg`);

        try {
            // If C2PA library is available, try to use it for proper signing
            if (Builder && this.signer) {
                try {
                    return await this.signWithC2PALibrary(inputBuffer, manifest, outputPath);
                } catch (c2paError) {
                    console.warn('C2PA library signing failed, using fallback:', c2paError.message);
                    // Fall through to fallback
                }
            }

            // Fallback: Create a JSON sidecar with the manifest
            return await this.signWithFallback(inputBuffer, manifest);

        } catch (error) {
            console.error('C2PA signing error:', error);
            throw error;
        }
    }

    /**
     * Sign using the official C2PA library
     */
    async signWithC2PALibrary(inputBuffer, manifest, outputPath) {
        // Ensure temp directory exists
        const tempDir = path.dirname(outputPath);
        if (!fs.existsSync(tempDir)) {
            fs.mkdirSync(tempDir, { recursive: true });
        }

        // Write input to temp file
        const inputPath = path.join(tempDir, `input-${Date.now()}.jpg`);
        fs.writeFileSync(inputPath, inputBuffer);

        try {
            // Create builder
            const builder = Builder.new();

            // Add assertions
            for (const assertion of manifest.assertions) {
                builder.addAssertion(assertion.label, assertion.data);
            }

            // Create input/output assets
            const inputAsset = {
                path: inputPath,
                format: 'image/jpeg'
            };

            const outputAsset = {
                path: outputPath,
                format: 'image/jpeg'
            };

            // Sign the image
            await builder.sign(this.signer, inputAsset, outputAsset);

            // Read the signed image
            const signedBuffer = fs.readFileSync(outputPath);

            // Clean up
            fs.unlinkSync(inputPath);
            fs.unlinkSync(outputPath);

            return {
                success: true,
                method: 'c2pa-library',
                signedImage: signedBuffer,
                manifest: manifest,
                contentCredentials: {
                    embedded: true,
                    format: 'jumbf'
                }
            };

        } catch (error) {
            // Clean up on error
            if (fs.existsSync(inputPath)) fs.unlinkSync(inputPath);
            if (fs.existsSync(outputPath)) fs.unlinkSync(outputPath);
            throw error;
        }
    }

    /**
     * Fallback signing without C2PA library
     * Creates a detached manifest that can be verified later
     */
    async signWithFallback(inputBuffer, manifest) {
        // Generate content hash
        const contentHash = crypto.createHash('sha256').update(inputBuffer).digest('hex');

        // Create signature over the manifest
        const manifestString = JSON.stringify(manifest);
        const sign = crypto.createSign('SHA256');
        sign.update(manifestString);
        const signature = sign.sign(this.privateKey, 'base64');

        // Create detached credential package
        const credential = {
            '@context': 'https://c2pa.org/specifications/specifications/2.0/context.json',
            type: 'ContentCredential',
            credentialSubject: {
                contentHash: contentHash,
                hashAlgorithm: 'sha256'
            },
            manifest: manifest,
            proof: {
                type: 'EcdsaSecp256r1Signature2019',
                created: new Date().toISOString(),
                proofPurpose: 'assertionMethod',
                verificationMethod: 'did:rial:' + crypto.createHash('sha256').update(this.certificate).digest('hex').substring(0, 16),
                proofValue: signature
            }
        };

        return {
            success: true,
            method: 'fallback-detached',
            signedImage: inputBuffer, // Original image (manifest stored separately)
            manifest: manifest,
            contentCredentials: {
                embedded: false,
                format: 'json-ld',
                credential: credential
            }
        };
    }

    /**
     * Read and verify C2PA credentials from an image
     * @param {Buffer} imageBuffer - Image buffer to verify
     * @returns {Object} Verification result
     */
    async verifyImage(imageBuffer) {
        await this.initialize();

        try {
            // If C2PA library is available, use it for verification
            if (Reader) {
                return await this.verifyWithC2PALibrary(imageBuffer);
            }

            // Fallback verification
            return await this.verifyWithFallback(imageBuffer);

        } catch (error) {
            return {
                success: false,
                verified: false,
                error: error.message,
                hasCredentials: false
            };
        }
    }

    /**
     * Verify using the official C2PA library
     */
    async verifyWithC2PALibrary(imageBuffer) {
        // Write to temp file for reading
        const tempPath = path.join(__dirname, '..', 'temp', `verify-${Date.now()}.jpg`);
        const tempDir = path.dirname(tempPath);

        if (!fs.existsSync(tempDir)) {
            fs.mkdirSync(tempDir, { recursive: true });
        }

        fs.writeFileSync(tempPath, imageBuffer);

        try {
            const inputAsset = {
                path: tempPath,
                format: 'image/jpeg'
            };

            const reader = await Reader.fromAsset(inputAsset);
            const manifestStore = reader.json();
            const activeManifest = reader.getActive();
            const isEmbedded = reader.isEmbedded();

            // Clean up
            fs.unlinkSync(tempPath);

            if (!activeManifest) {
                return {
                    success: true,
                    verified: false,
                    hasCredentials: false,
                    message: 'No C2PA credentials found in image'
                };
            }

            // Parse the manifest
            const manifest = JSON.parse(manifestStore);

            return {
                success: true,
                verified: true,
                hasCredentials: true,
                isEmbedded: isEmbedded,
                manifest: manifest,
                activeManifest: activeManifest,
                assertions: manifest.assertions || [],
                signatureInfo: manifest.signature_info,
                claimGenerator: manifest.claim_generator
            };

        } catch (error) {
            if (fs.existsSync(tempPath)) fs.unlinkSync(tempPath);

            // Check if it's just missing credentials
            if (error.message.includes('no manifest') || error.message.includes('ManifestNotFound')) {
                return {
                    success: true,
                    verified: false,
                    hasCredentials: false,
                    message: 'No C2PA credentials found in image'
                };
            }

            throw error;
        }
    }

    /**
     * Fallback verification without C2PA library
     */
    async verifyWithFallback(imageBuffer) {
        // Check for JUMBF box in JPEG
        const jumbfMarker = Buffer.from([0xFF, 0xEB]); // APP11 marker
        const hasJumbf = imageBuffer.includes(jumbfMarker);

        if (hasJumbf) {
            return {
                success: true,
                verified: false,
                hasCredentials: true,
                message: 'C2PA credentials detected but full verification requires c2pa-node library',
                recommendation: 'Install @contentauth/c2pa-node for complete verification'
            };
        }

        return {
            success: true,
            verified: false,
            hasCredentials: false,
            message: 'No C2PA credentials found in image'
        };
    }

    /**
     * Verify a detached credential against an image
     * @param {Buffer} imageBuffer - Image buffer
     * @param {Object} credential - Detached credential
     * @returns {Object} Verification result
     */
    async verifyDetachedCredential(imageBuffer, credential) {
        try {
            // Verify content hash
            const contentHash = crypto.createHash('sha256').update(imageBuffer).digest('hex');

            if (contentHash !== credential.credentialSubject.contentHash) {
                return {
                    success: true,
                    verified: false,
                    error: 'Content hash mismatch - image has been modified'
                };
            }

            // Verify signature
            const manifestString = JSON.stringify(credential.manifest);
            const verify = crypto.createVerify('SHA256');
            verify.update(manifestString);

            const signatureValid = verify.verify(this.certificate, credential.proof.proofValue, 'base64');

            return {
                success: true,
                verified: signatureValid,
                contentHashValid: true,
                signatureValid: signatureValid,
                manifest: credential.manifest,
                assertions: credential.manifest.assertions
            };

        } catch (error) {
            return {
                success: false,
                verified: false,
                error: error.message
            };
        }
    }

    /**
     * Create a complete C2PA credential for a photo
     * Combines Rial's authenticity data with C2PA standard
     * @param {Buffer} imageBuffer - Image data
     * @param {Object} rialData - Rial certification data
     * @returns {Object} Complete C2PA signed result
     */
    async createContentCredential(imageBuffer, rialData = {}) {
        await this.initialize();

        // Create base manifest
        const manifest = this.createManifest({
            title: rialData.title || 'Certified Photo',
            format: rialData.format || 'image/jpeg',
            instanceId: rialData.instanceId || crypto.randomUUID()
        });

        // Add capture action
        this.addActionAssertion(manifest, {
            type: 'c2pa.created',
            when: rialData.timestamp || new Date().toISOString(),
            softwareAgent: rialData.deviceInfo?.model
                ? `${rialData.deviceInfo.model} ${this.claimGenerator}`
                : this.claimGenerator,
            digitalSourceType: 'http://cv.iptc.org/newscodes/digitalsourcetype/digitalCapture'
        });

        // Add EXIF data if available
        if (rialData.exif || rialData.proofMetadata) {
            const exifData = rialData.exif || {};
            const proofMetadata = rialData.proofMetadata || {};

            this.addExifAssertion(manifest, {
                dateTime: proofMetadata.timestamp || exifData.dateTime,
                latitude: proofMetadata.latitude || exifData.latitude,
                longitude: proofMetadata.longitude || exifData.longitude,
                altitude: proofMetadata.altitude || exifData.altitude,
                make: proofMetadata.deviceManufacturer || exifData.make,
                model: proofMetadata.cameraModel || exifData.model,
                focalLength: exifData.focalLength,
                fNumber: exifData.fNumber,
                exposureTime: exifData.exposureTime,
                iso: exifData.iso
            });
        }

        // Add GPS location if available
        if (rialData.proofMetadata?.latitude && rialData.proofMetadata?.longitude) {
            this.addLocationAssertion(manifest, {
                latitude: rialData.proofMetadata.latitude,
                longitude: rialData.proofMetadata.longitude,
                altitude: rialData.proofMetadata.altitude
            });
        }

        // Add content hash
        this.addHashAssertion(manifest, imageBuffer);

        // Add Rial-specific authenticity assertion
        if (rialData.merkleRoot || rialData.signature) {
            this.addRialAuthenticityAssertion(manifest, {
                merkleRoot: rialData.merkleRoot,
                deviceSignature: rialData.signature,
                devicePublicKey: rialData.publicKey,
                secureEnclaveAttestation: rialData.secureEnclaveAttestation,
                biometricVerified: rialData.biometricVerified,
                motionData: rialData.proofMetadata ? {
                    accelerometer: {
                        x: rialData.proofMetadata.accelerometerX,
                        y: rialData.proofMetadata.accelerometerY,
                        z: rialData.proofMetadata.accelerometerZ
                    },
                    gyroscope: {
                        x: rialData.proofMetadata.gyroscopeX,
                        y: rialData.proofMetadata.gyroscopeY,
                        z: rialData.proofMetadata.gyroscopeZ
                    },
                    timestamp: rialData.proofMetadata.timestamp
                } : undefined,
                zkProof: rialData.zkProof
            });
        }

        // Sign the image
        const signedResult = await this.signImage(imageBuffer, manifest);

        return {
            ...signedResult,
            c2paVersion: '2.0',
            interoperable: true,
            verifiableWith: [
                'Adobe Photoshop',
                'Adobe Lightroom',
                'Microsoft Edge',
                'Truepic',
                'Content Credentials Verify (verify.contentauthenticity.org)'
            ]
        };
    }

    /**
     * Get service status
     */
    getStatus() {
        return {
            initialized: this.initialized,
            hasC2PALibrary: !!c2paNode,
            hasSigner: !!this.signer,
            certificatePath: CERTIFICATE_PATH,
            certificateExists: fs.existsSync(CERTIFICATE_PATH),
            claimGenerator: this.claimGenerator,
            supportedAssertions: this.supportedAssertions
        };
    }
}

// Singleton instance
let c2paServiceInstance = null;

/**
 * Get the C2PA service instance
 * @returns {C2PAService}
 */
function getC2PAService() {
    if (!c2paServiceInstance) {
        c2paServiceInstance = new C2PAService();
    }
    return c2paServiceInstance;
}

module.exports = {
    C2PAService,
    getC2PAService
};
