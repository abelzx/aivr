# Docker Quick Reference

## Cross-Platform Compatibility

This Docker setup is tested and works on:
- ✅ **macOS** (Intel x86_64 and Apple Silicon ARM64)
- ✅ **Linux** (AMD64/x86_64 and ARM64)
- ✅ **Windows** (with WSL 2, using AMD64)

## Quick Start

### Using Docker Compose (Recommended)
```bash
docker-compose up --build
```

### Using Docker Directly
```bash
docker build -t aivr-app .
docker run -p 3000:3000 --env-file .env aivr-app
```

## Platform-Specific Build Commands

### macOS
- **Apple Silicon (M1/M2/M3)**: Automatically builds for ARM64
  ```bash
  docker build -t aivr-app .
  ```
- **Intel Mac**: Automatically builds for AMD64
  ```bash
  docker build -t aivr-app .
  ```

### Linux
- **AMD64/x86_64** (most common):
  ```bash
  docker build -t aivr-app .
  ```
- **ARM64** (Raspberry Pi 4+, AWS Graviton):
  ```bash
  docker build --platform linux/arm64 -t aivr-app .
  ```

### Windows
- Requires WSL 2 and Docker Desktop
- Uses AMD64 architecture by default
  ```powershell
  docker build -t aivr-app .
  ```

## Troubleshooting

### Build Issues

**Issue**: Build fails with "platform" error
**Solution**: Enable BuildKit:
```bash
export DOCKER_BUILDKIT=1
# Or for Windows PowerShell:
$env:DOCKER_BUILDKIT=1
```

**Issue**: Native module compilation fails
**Solution**: The Dockerfile includes build dependencies (python3, make, g++). If issues persist, ensure you're using the latest Node.js base image.

### Runtime Issues

**Issue**: Container exits immediately
**Solution**: Check logs:
```bash
docker-compose logs
# or
docker logs <container-id>
```

**Issue**: Port already in use
**Solution**: Change the port mapping in docker-compose.yml:
```yaml
ports:
  - "3001:3000"  # Use 3001 instead of 3000
```

### Windows-Specific Issues

**Issue**: Line ending errors
**Solution**: Ensure `.env` file uses LF line endings (not CRLF). In VS Code, set `"files.eol": "\n"` or convert with:
```powershell
(Get-Content .env -Raw) -replace "`r`n", "`n" | Set-Content .env -NoNewline
```

**Issue**: Docker commands not working in Git Bash
**Solution**: Use PowerShell or Command Prompt, or prefix with `winpty`:
```bash
winpty docker-compose up
```

## Architecture Details

The Dockerfile uses a multi-stage build:
1. **deps**: Installs dependencies
2. **builder**: Builds the Next.js application
3. **runner**: Minimal production image with only runtime files

This results in a smaller final image (~200MB vs ~1GB+ for a single-stage build).

## Environment Variables

All environment variables are loaded from `.env` file. See README.md for the complete list of required variables.

## Health Check

The container includes a healthcheck that verifies the application is responding on port 3000. Check health status:
```bash
docker ps  # Look at STATUS column
```

