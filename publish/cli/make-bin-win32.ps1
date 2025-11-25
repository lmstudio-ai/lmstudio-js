$BUN_VERSION = "1.3.3"
$DIST_DIR = "./dist"
$EXE_NAME = "lms.exe"
$ENTRY_JS = "./dist/index.js"

# Function to load .env files from current directory up to the root
function Load-EnvFromAncestors {
    $currentDir = Get-Location

    while ($currentDir -ne [System.IO.Path]::GetPathRoot($currentDir)) {
        $envPath = Join-Path $currentDir ".env"
        if (Test-Path $envPath) {
            Write-Host "Loading .env from $currentDir"
            Get-Content $envPath | ForEach-Object {
                # ignore lines that don't have the expected X=Y format
                if ($_ -and $_.Contains('=')) {
                    $key, $value = $_.Split('=', 2)
                    # Remove single quotes from the value if present
                    $value = $value.Trim("'")
                    # Set environment variable for the current process
                    [System.Environment]::SetEnvironmentVariable($key, $value, [System.EnvironmentVariableTarget]::Process)
                    # Output the environment variable and its value
                    Write-Output "Setting environment variable: '$key'"
                }
            }
        }
        $currentDir = Split-Path $currentDir -Parent
    }
}

# Call the function to load .env files
Load-EnvFromAncestors

New-Item -Path $DIST_DIR -ItemType Directory -Force | Out-Null

# Ensure bun is available
if (-not (Get-Command "bun" -ErrorAction SilentlyContinue)) {
    Write-Host "bun not found. Installing bun..."
    iex "& {$(irm https://bun.sh/install.ps1)} -Version $BUN_VERSION"

    # Refresh PATH for current session
    $env:Path = [System.Environment]::GetEnvironmentVariable("Path","Machine") + ";" + [System.Environment]::GetEnvironmentVariable("Path","User")

    if (-not (Get-Command "bun" -ErrorAction SilentlyContinue)) {
        Write-Host "Error: Failed to install bun"
        exit 1
    }
    Write-Host "bun installed successfully"
}

# Ensure the built JS entry exists
if (-Not (Test-Path $ENTRY_JS)) {
    Write-Host "Error: expected ESM entry at $ENTRY_JS. Run 'npm run build' first."
    exit 1
}

# Build the Bun-compiled executable inside .bun so Bun's
# temporary .bun-build artifacts are kept there
Push-Location $DIST_DIR
& bun build "./index.js" --compile --outfile "./${EXE_NAME}"
Pop-Location

if (-Not $env:LMS_NO_SIGN) {
    # Signing
    if (-Not (Get-Command "smctl" -ErrorAction SilentlyContinue)) {
        Write-Host 'Warning: smctl could not be found - To skip signing, $env:LMS_NO_SIGN = "true"'
        exit 1
    }

    # Check if WINDOWS_DIGICERT_KEYPAIR_ALIAS environment variable is set
    if ([string]::IsNullOrEmpty($env:WINDOWS_DIGICERT_KEYPAIR_ALIAS)) {
        Write-Host 'Warning: WINDOWS_DIGICERT_KEYPAIR_ALIAS is not set - To skip signing, $env:LMS_NO_SIGN = "true"'
        exit 1
    }

    # Try to sign the binary
    if ($DIST_DIR -and $EXE_NAME) {
        & smctl sign --keypair-alias $env:WINDOWS_DIGICERT_KEYPAIR_ALIAS --input "${DIST_DIR}/${EXE_NAME}"
    } else {
        Write-Host 'Warning: DIST_DIR or EXE_NAME is not set - To skip signing, set $env:LMS_NO_SIGN = "true"'
        exit 1
    }
} else {
    Write-Host "LMS_NO_SIGN is set, signing skipped."
}
