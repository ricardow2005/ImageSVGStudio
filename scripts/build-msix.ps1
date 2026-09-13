param(
    [Parameter(Mandatory = $true)]
    [string]$ExePath,

    [Parameter(Mandatory = $true)]
    [string]$Version,

    [Parameter(Mandatory = $true)]
    [string]$OutputPath,

    [string]$PackageName = "OrganizzaTech.ImageSVGStudio",
    [string]$Publisher = "CN=OrganizzaTech"
)

$ErrorActionPreference = "Stop"

function Convert-ToStoreVersion {
    param([string]$SemanticVersion)

    $clean = $SemanticVersion.Trim().TrimStart("v")
    $numeric = ($clean -split "[-+]")[0]
    $parts = $numeric.Split(".")

    if ($parts.Count -gt 4) {
        throw "Versao invalida para MSIX: $SemanticVersion"
    }

    $normalized = @()
    foreach ($part in $parts) {
        $value = 0
        if (-not [int]::TryParse($part, [ref]$value)) {
            throw "Versao invalida para MSIX: $SemanticVersion"
        }
        if ($value -lt 0 -or $value -gt 65535) {
            throw "Cada parte da versao MSIX deve estar entre 0 e 65535: $SemanticVersion"
        }
        $normalized += $value
    }

    while ($normalized.Count -lt 4) {
        $normalized += 0
    }

    return ($normalized -join ".")
}

$repoRoot = Split-Path -Parent $PSScriptRoot
$templatePath = Join-Path $repoRoot "packaging/msix/AppxManifest.xml.template"
$assetsPath = Join-Path $repoRoot "packaging/msix/Assets"

if (-not (Test-Path $ExePath)) {
    throw "Executavel nao encontrado: $ExePath"
}
if (-not (Test-Path $templatePath)) {
    throw "Template MSIX nao encontrado: $templatePath"
}
if (-not (Test-Path $assetsPath)) {
    throw "Assets MSIX nao encontrados: $assetsPath"
}

$sdkBinRoot = Join-Path ${env:ProgramFiles(x86)} "Windows Kits/10/bin"
$makeAppx = Get-ChildItem -Path $sdkBinRoot -Filter MakeAppx.exe -Recurse -ErrorAction SilentlyContinue |
    Where-Object { $_.FullName -match "\\x64\\MakeAppx\.exe$" } |
    Sort-Object FullName -Descending |
    Select-Object -First 1

if (-not $makeAppx) {
    throw "MakeAppx.exe nao encontrado. Instale o Windows 10/11 SDK."
}

$packageVersion = Convert-ToStoreVersion -SemanticVersion $Version
$staging = Join-Path $env:TEMP ("image-svg-studio-msix-" + [guid]::NewGuid().ToString("N"))

try {
    New-Item -ItemType Directory -Force -Path $staging | Out-Null
    New-Item -ItemType Directory -Force -Path (Join-Path $staging "Assets") | Out-Null

    Copy-Item $ExePath (Join-Path $staging "ImageSVGStudio.exe")
    Copy-Item (Join-Path $assetsPath "*") (Join-Path $staging "Assets") -Recurse

    $manifest = Get-Content $templatePath -Raw
    $manifest = $manifest.Replace("__PACKAGE_NAME__", $PackageName)
    $manifest = $manifest.Replace("__PUBLISHER__", $Publisher)
    $manifest = $manifest.Replace("__PACKAGE_VERSION__", $packageVersion)
    Set-Content -Path (Join-Path $staging "AppxManifest.xml") -Value $manifest -Encoding utf8

    $outputDir = Split-Path -Parent $OutputPath
    if ($outputDir) {
        New-Item -ItemType Directory -Force -Path $outputDir | Out-Null
    }
    if (Test-Path $OutputPath) {
        Remove-Item $OutputPath -Force
    }

    & $makeAppx.FullName pack /d $staging /p $OutputPath /o
    if ($LASTEXITCODE -ne 0) {
        throw "MakeAppx falhou com exit code $LASTEXITCODE"
    }

    Write-Host "MSIX criado: $OutputPath"
    Write-Host "Identity.Name: $PackageName"
    Write-Host "Identity.Publisher: $Publisher"
    Write-Host "Version: $packageVersion"
}
finally {
    if (Test-Path $staging) {
        Remove-Item $staging -Recurse -Force
    }
}
