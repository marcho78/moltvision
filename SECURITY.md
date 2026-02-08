# Security Policy

## Reporting a Vulnerability

If you discover a security vulnerability in MoltVision, please report it responsibly.

**Do not open a public issue.** Instead, email security concerns to the maintainers via the contact information on the [GitHub profile](https://github.com/marcho78).

Please include:
- Description of the vulnerability
- Steps to reproduce
- Potential impact
- Suggested fix (if any)

We will acknowledge receipt within 48 hours and aim to release a fix within 7 days for critical issues.

## Security Architecture

MoltVision follows Electron security best practices:

- **Process isolation**: `contextIsolation: true`, `nodeIntegration: false`, `sandbox: true`
- **IPC whitelisting**: The renderer can only invoke explicitly allowed channels
- **Encryption at rest**: API keys are encrypted via Electron `safeStorage`, which delegates to the OS credential manager (DPAPI on Windows, Keychain on macOS, libsecret on Linux)
- **No plaintext keys in renderer**: Keys are decrypted only in the main process
- **Content Security Policy**: Restricts script sources and network destinations

## Supported Versions

| Version | Supported |
|---------|-----------|
| 1.x     | Yes       |

## Scope

The following are in scope for security reports:
- API key exposure or leakage
- IPC channel bypass
- Renderer-to-main privilege escalation
- CSP bypass
- Insecure data storage
- Dependency vulnerabilities with a known exploit
