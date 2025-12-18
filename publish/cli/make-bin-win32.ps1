$BUN_VERSION = "1.3.3"
$BUN_TAG = "bun-v$BUN_VERSION"
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
$LOCAL_BUN_DIR = "./temp/$BUN_TAG"

$arch = [System.Runtime.InteropServices.RuntimeInformation]::ProcessArchitecture
if ($arch -eq "Arm64") {
    $BUN_PLATFORM = "bun-windows-x64-baseline"
} elseif ($arch -eq "X64") {
    $BUN_PLATFORM = "bun-windows-x64"
} else {
    Write-Host "Unsupported architecture: $arch"
    exit 1
}

$localBunAbsoluteDir = [System.IO.Path]::GetFullPath($LOCAL_BUN_DIR)
$bunExePath = Join-Path (Join-Path $localBunAbsoluteDir $BUN_PLATFORM) "bun.exe"

if (Test-Path $bunExePath) {
    $BUN_CMD = $bunExePath
} else {
    Write-Host "$BUN_TAG not present. Downloading..."
    New-Item -Path $LOCAL_BUN_DIR -ItemType Directory -Force | Out-Null
    $bunUrl = "https://github.com/oven-sh/bun/releases/download/$BUN_TAG/$BUN_PLATFORM.zip"
    $bunZip = Join-Path $localBunAbsoluteDir "bun.zip"
    Invoke-WebRequest -Uri $bunUrl -OutFile $bunZip
    Expand-Archive -Path $bunZip -DestinationPath $localBunAbsoluteDir -Force
    Remove-Item -Path $bunZip -Force -ErrorAction SilentlyContinue
    $BUN_CMD = $bunExePath
}

Write-Host "Using bun at $BUN_CMD"

# Ensure the built JS entry exists
if (-Not (Test-Path $ENTRY_JS)) {
    Write-Host "Error: expected ESM entry at $ENTRY_JS. Run 'npm run build' first."
    exit 1
}

# Build the Bun-compiled executable inside .bun so Bun's
# temporary .bun-build artifacts are kept there
Push-Location $DIST_DIR
& $BUN_CMD build "./index.js" --compile --outfile "./${EXE_NAME}"
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
