// SPDX-License-Identifier: MIT
pragma solidity ^0.8.19;

/**
 * @title PhotoAttestation
 * @notice Simple, gas-efficient photo attestation contract for Rial
 * @dev Stores only hashes on-chain, full data stored off-chain
 *
 * Deployed on Base (Coinbase L2) for low fees (~$0.001 per attestation)
 */
contract PhotoAttestation {
    // =====================================
    // STRUCTS
    // =====================================

    struct Attestation {
        bytes32 imageHash;      // SHA-256 hash of image
        bytes32 merkleRoot;     // Merkle root of image tiles
        bytes32 metadataHash;   // Hash of metadata (location, time, device)
        address attester;       // Who created the attestation
        uint64 timestamp;       // When attestation was created
        uint32 flags;           // Bit flags: 1=webauthn, 2=liveness, 4=ai_verified
    }

    // =====================================
    // STATE
    // =====================================

    // Attestation ID => Attestation data
    mapping(bytes32 => Attestation) public attestations;

    // Image hash => Attestation ID (for lookup by image)
    mapping(bytes32 => bytes32) public imageToAttestation;

    // Total attestation count
    uint256 public totalAttestations;

    // Contract owner (for emergency functions only)
    address public owner;

    // =====================================
    // EVENTS
    // =====================================

    event AttestationCreated(
        bytes32 indexed attestationId,
        bytes32 indexed imageHash,
        address indexed attester,
        uint64 timestamp
    );

    event BatchAttestationCreated(
        bytes32 indexed batchId,
        uint256 count,
        address indexed attester
    );

    // =====================================
    // CONSTRUCTOR
    // =====================================

    constructor() {
        owner = msg.sender;
    }

    // =====================================
    // MAIN FUNCTIONS
    // =====================================

    /**
     * @notice Create a single attestation
     * @param imageHash SHA-256 hash of the image
     * @param merkleRoot Merkle root of image tiles
     * @param metadataHash Hash of metadata JSON
     * @param flags Verification flags
     * @return attestationId Unique ID for this attestation
     */
    function attest(
        bytes32 imageHash,
        bytes32 merkleRoot,
        bytes32 metadataHash,
        uint32 flags
    ) external returns (bytes32 attestationId) {
        require(imageHash != bytes32(0), "Invalid image hash");
        require(imageToAttestation[imageHash] == bytes32(0), "Image already attested");

        // Generate attestation ID
        attestationId = keccak256(abi.encodePacked(
            imageHash,
            msg.sender,
            block.timestamp,
            block.chainid
        ));

        // Store attestation
        attestations[attestationId] = Attestation({
            imageHash: imageHash,
            merkleRoot: merkleRoot,
            metadataHash: metadataHash,
            attester: msg.sender,
            timestamp: uint64(block.timestamp),
            flags: flags
        });

        // Index by image hash
        imageToAttestation[imageHash] = attestationId;

        totalAttestations++;

        emit AttestationCreated(attestationId, imageHash, msg.sender, uint64(block.timestamp));

        return attestationId;
    }

    /**
     * @notice Create multiple attestations in one transaction (gas efficient)
     * @param imageHashes Array of image hashes
     * @param merkleRoots Array of merkle roots
     * @param metadataHashes Array of metadata hashes
     * @param flags Array of flags
     * @return batchId Batch identifier
     */
    function attestBatch(
        bytes32[] calldata imageHashes,
        bytes32[] calldata merkleRoots,
        bytes32[] calldata metadataHashes,
        uint32[] calldata flags
    ) external returns (bytes32 batchId) {
        uint256 count = imageHashes.length;
        require(count > 0 && count <= 100, "Invalid batch size");
        require(
            merkleRoots.length == count &&
            metadataHashes.length == count &&
            flags.length == count,
            "Array length mismatch"
        );

        // Generate batch ID
        batchId = keccak256(abi.encodePacked(
            msg.sender,
            block.timestamp,
            count,
            imageHashes[0]
        ));

        uint64 ts = uint64(block.timestamp);

        for (uint256 i = 0; i < count; i++) {
            if (imageHashes[i] == bytes32(0)) continue;
            if (imageToAttestation[imageHashes[i]] != bytes32(0)) continue;

            bytes32 attestationId = keccak256(abi.encodePacked(
                imageHashes[i],
                msg.sender,
                block.timestamp,
                block.chainid,
                i
            ));

            attestations[attestationId] = Attestation({
                imageHash: imageHashes[i],
                merkleRoot: merkleRoots[i],
                metadataHash: metadataHashes[i],
                attester: msg.sender,
                timestamp: ts,
                flags: flags[i]
            });

            imageToAttestation[imageHashes[i]] = attestationId;
            totalAttestations++;

            emit AttestationCreated(attestationId, imageHashes[i], msg.sender, ts);
        }

        emit BatchAttestationCreated(batchId, count, msg.sender);

        return batchId;
    }

    // =====================================
    // VIEW FUNCTIONS
    // =====================================

    /**
     * @notice Check if an image has been attested
     * @param imageHash SHA-256 hash of image
     * @return exists Whether attestation exists
     * @return attestationId The attestation ID if exists
     */
    function isAttested(bytes32 imageHash) external view returns (bool exists, bytes32 attestationId) {
        attestationId = imageToAttestation[imageHash];
        exists = attestationId != bytes32(0);
    }

    /**
     * @notice Get full attestation data
     * @param attestationId Attestation ID
     * @return attestation The attestation data
     */
    function getAttestation(bytes32 attestationId) external view returns (Attestation memory) {
        return attestations[attestationId];
    }

    /**
     * @notice Verify an attestation exists and matches provided data
     * @param imageHash Image hash to verify
     * @param merkleRoot Expected merkle root
     * @return valid Whether verification passed
     * @return attestation The attestation data if valid
     */
    function verify(
        bytes32 imageHash,
        bytes32 merkleRoot
    ) external view returns (bool valid, Attestation memory attestation) {
        bytes32 attestationId = imageToAttestation[imageHash];

        if (attestationId == bytes32(0)) {
            return (false, attestation);
        }

        attestation = attestations[attestationId];
        valid = attestation.merkleRoot == merkleRoot;

        return (valid, attestation);
    }

    /**
     * @notice Decode flags into human-readable format
     * @param flags The flags value
     * @return webauthn Whether signed with WebAuthn
     * @return liveness Whether liveness check passed
     * @return aiVerified Whether AI verification passed
     */
    function decodeFlags(uint32 flags) external pure returns (
        bool webauthn,
        bool liveness,
        bool aiVerified
    ) {
        webauthn = (flags & 1) != 0;
        liveness = (flags & 2) != 0;
        aiVerified = (flags & 4) != 0;
    }
}
