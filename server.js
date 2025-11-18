const express = require('express');
const multer = require('multer');
const fs = require('fs');
const path = require('path');
const EC = require('elliptic').ec;

const app = express();
const port = 3000;

// Elliptic curve setup - secp256r1 is used by the Secure Enclave, known as 'p256' in this library
const ec = new EC('p256');

// Set up multer for file uploads
const storage = multer.memoryStorage();
const upload = multer({ storage: storage });

// Create a directory for uploads if it doesn't exist
const uploadsDir = path.join(__dirname, 'uploads');
if (!fs.existsSync(uploadsDir)) {
    fs.mkdirSync(uploadsDir);
}

// Log all incoming requests for debugging
app.use((req, res, next) => {
    console.log(`[${new Date().toISOString()}] ${req.method} ${req.url} from ${req.ip}`);
    next();
});

// Simple test endpoint
app.get('/test', (req, res) => {
    console.log('✅ Test endpoint hit!');
    res.json({ message: 'Backend is working!', timestamp: new Date().toISOString() });
});

app.post('/prove', upload.single('img_buffer'), (req, res) => {
    console.log('Received request to /prove');
    console.log('req.file:', req.file);
    console.log('req.body:', Object.keys(req.body));
    console.log('req.headers:', req.headers['content-type']);

    // --- 1. Extract Data ---
    if (!req.file) {
        console.log('❌ No file uploaded');
        return res.status(400).json({ error: 'No file uploaded', body: req.body });
    }
    const imageBuffer = req.file.buffer;
    const {
        signature,
        public_key,
        c2pa_claim,
        transformations
    } = req.body;

    console.log('Signature:', signature);
    console.log('Public Key:', public_key);
    console.log('C2PA Claim:', c2pa_claim);
    console.log('Transformations:', transformations);

    // --- 2. Verify Signature ---
    let isSignatureValid = false;
    try {
        // Parse the C2PA claim to get the original image hash
        const claim = JSON.parse(c2pa_claim);
        const imageRoot = claim.imageRoot;

        // Decode the public key and signature
        const publicKey = ec.keyFromPublic(Buffer.from(public_key, 'base64'), 'hex');
        const signatureDer = Buffer.from(signature, 'base64');
        
        // The signature from iOS is in DER format. We need r and s values.
        // This is a simplified way to extract them. A more robust solution
        // would parse the ASN.1 DER format properly.
        const r = signatureDer.slice(4, 36);
        const s = signatureDer.slice(38);

        // Verify the signature
        isSignatureValid = publicKey.verify(imageRoot, { r, s });

        console.log(`Step 2: Signature Verification Result: ${isSignatureValid}`);

    } catch (error) {
        console.error('Error during signature verification:', error);
    }


    // --- 3. TODO: Verify App Attestation ---
    // This would involve a call to Apple's servers.
    // For now, we'll assume it's valid.
    console.log('Step 3: App Attestation verification (TODO)');


    // --- 4. TODO: SP1 Prover Integration ---
    // This is where you would call the SP1 prover with the image data
    // and transformations to generate the ZK proof.
    console.log('Step 4: SP1 Prover integration (TODO)');


    // --- 5. Respond to Client ---
    // For now, we'll just save the image and return a success message.
    const imagePath = path.join(uploadsDir, `image-${Date.now()}.png`);
    fs.writeFileSync(imagePath, imageBuffer);
    console.log(`Image saved to ${imagePath}`);

    res.status(200).json({
        message: 'Image received and processed (simulation).',
        signatureValid: isSignatureValid,
        imageUrl: `/uploads/${path.basename(imagePath)}`
    });
});

app.listen(port, '0.0.0.0', () => {
    console.log(`Backend server listening at http://0.0.0.0:${port}`);
    console.log(`Access from iPhone at http://10.0.0.132:${port}`);
});
