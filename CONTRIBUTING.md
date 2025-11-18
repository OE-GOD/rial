# 🤝 Contributing to ZK-IMG

Thank you for your interest in contributing to ZK-IMG! This project represents cutting-edge research in zero-knowledge image authentication, and we welcome contributions from developers, researchers, and cryptography enthusiasts.

## 🚀 Quick Start

1. **Fork** the repository on GitHub
2. **Clone** your fork: `git clone https://github.com/yourusername/zk-img.git`
3. **Setup** development environment: `npm run setup:all`
4. **Create** a feature branch: `git checkout -b feature/your-feature-name`
5. **Make** your changes and add tests
6. **Commit** with clear messages: `git commit -m "Add: Brief description of changes"`
7. **Push** to your fork: `git push origin feature/your-feature-name`
8. **Open** a Pull Request with detailed description

## 🏗️ Development Setup

### Prerequisites
- **macOS 12.0+** (for iOS development)
- **Node.js 18.0+** and npm
- **Xcode 14.0+** with iOS 16.0+ SDK
- **Rust 1.70+** (for Halo2 development)
- **Circom 2.0+** compiler

### Installation
```bash
# Install global dependencies
npm install -g circom@latest
curl --proto '=https' --tlsv1.2 -sSf https://sh.rustup.rs | sh

# Setup project
git clone https://github.com/yourusername/zk-img.git
cd zk-img
npm run setup:all
npm run setup-zk
```

### Running Tests
```bash
# Run all tests
npm test

# Run authenticity tests
npm run test-authenticity

# Run specific backend tests
cd backend && npm test
```

## 📋 Contribution Guidelines

### 🔐 Security First
- **Never** commit private keys, secrets, or sensitive data
- **Always** use secure cryptographic practices
- **Test** thoroughly before submitting security-related changes
- **Report** security vulnerabilities privately to maintainers

### 🧪 Testing Requirements
- **Unit Tests**: Add tests for new functions and circuits
- **Integration Tests**: Test end-to-end workflows
- **Security Tests**: Verify fraud detection capabilities
- **Performance Tests**: Ensure ZK proof generation remains fast

### 📖 Documentation
- **README Updates**: Update docs for any API changes
- **Code Comments**: Document complex cryptographic operations
- **Examples**: Provide usage examples for new features
- **Changelogs**: Document breaking changes

### 🎯 Code Standards

#### Swift (iOS)
```swift
// ✅ Good: Clear naming, proper error handling
func generateZKProof(for image: UIImage) throws -> ZKProof {
    guard let imageData = image.pngData() else {
        throw ZKError.invalidImageData
    }
    // Implementation...
}

// ❌ Bad: Unclear naming, poor error handling
func doSomething(img: UIImage) -> Any {
    // Implementation...
}
```

#### JavaScript/Node.js
```javascript
// ✅ Good: Async/await, proper error handling
async function processImage(imageBuffer) {
    try {
        const processed = await sharp(imageBuffer).resize(512, 512);
        return processed;
    } catch (error) {
        throw new Error(`Image processing failed: ${error.message}`);
    }
}

// ❌ Bad: Callbacks, poor error handling
function processImg(buf, callback) {
    sharp(buf).resize(512, 512, callback);
}
```

#### Circom (ZK Circuits)
```circom
// ✅ Good: Clear parameter names, proper constraints
template Crop(hOrig, wOrig, hNew, wNew, hStart, wStart) {
    signal input orig[hOrig][wOrig][3];
    signal input new[hNew][wNew][3];

    // Verify crop is within bounds
    assert(hStart + hNew <= hOrig);
    assert(wStart + wNew <= wOrig);

    // Implementation...
}
```

## 🔍 Research Areas

### High Priority
- **ZK Circuit Optimization**: More efficient image processing circuits
- **Halo2 Integration**: Replace snarkjs with native Halo2 proofs
- **HD Image Support**: Optimize for 4K and higher resolutions
- **Proof Chaining**: Support unlimited sequential transformations

### Medium Priority
- **Advanced Transformations**: Rotation, color adjustments, filters
- **Multi-Image Proofs**: Batch processing and verification
- **Cross-Platform SDK**: WebAssembly and Android support
- **Performance Benchmarking**: Comparative analysis of proof systems

### Future Research
- **Recursive Proofs**: Aggregation of multiple ZK proofs
- **Multi-Party Computation**: Collaborative image verification
- **Blockchain Integration**: Decentralized attestation networks
- **AI-Resistant Circuits**: Novel approaches to deepfake detection

## 🐛 Issue Reporting

### Bug Reports
Please include:
- **Steps to reproduce** the issue
- **Expected behavior** vs actual behavior
- **Environment details** (OS, Node version, Xcode version)
- **Error logs** and stack traces
- **Screenshots** if UI-related

### Feature Requests
Please include:
- **Use case** and problem statement
- **Proposed solution** with technical details
- **Alternative approaches** considered
- **Impact assessment** on existing functionality

## 📝 Commit Message Guidelines

```
type(scope): Brief description of changes

Detailed explanation of what was changed and why.

Fixes #123
```

### Types:
- `feat`: New features
- `fix`: Bug fixes
- `docs`: Documentation changes
- `style`: Code style changes
- `refactor`: Code refactoring
- `test`: Test additions/modifications
- `chore`: Maintenance tasks

### Scopes:
- `ios`, `swift`: iOS app changes
- `backend`, `node`: Backend changes
- `zk`, `circom`: Zero-knowledge proof changes
- `test`: Testing infrastructure
- `docs`: Documentation

## 🎉 Recognition

Contributors will be:
- **Acknowledged** in release notes
- **Listed** as contributors in README
- **Invited** to join the core development team for significant contributions
- **Featured** in research publications and presentations

## 📞 Getting Help

- **GitHub Issues**: For bugs and feature requests
- **GitHub Discussions**: For questions and community discussion
- **Discord**: Join our community server (link in README)
- **Email**: For security issues and private communications

## 📄 License

By contributing to ZK-IMG, you agree that your contributions will be licensed under the same MIT License that covers the project.

---

**Thank you for helping build the future of trustworthy digital content!** 🚀

*ZK-IMG: Because truth should be provable, not just believable.*
