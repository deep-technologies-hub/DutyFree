# ═══════════════════════════════════════════════════════════════════
#  Démarre toute la plateforme en local (Docker Desktop requis).
#  Usage :  powershell -ExecutionPolicy Bypass -File .\demarrer-local.ps1
#  Options : -Reset  supprime la base locale et repart de zéro
# ═══════════════════════════════════════════════════════════════════
param([switch]$Reset)
$ErrorActionPreference = 'Stop'
Set-Location $PSScriptRoot

if (-not (Test-Path .env)) {
    Copy-Item .env.example .env
    Write-Host "Fichier .env créé à partir de .env.example" -ForegroundColor Yellow
}

if ($Reset) {
    Write-Host "Suppression des conteneurs et des données locales..." -ForegroundColor Yellow
    docker compose down -v
}

Write-Host "Construction et démarrage (le premier lancement prend quelques minutes)..." -ForegroundColor Cyan
docker compose up -d --build
if ($LASTEXITCODE -ne 0) { throw "docker compose up a échoué" }

# Ports hôte (lus depuis .env, défaut 80/81/82)
function Get-EnvPort($name, $default) {
    $line = Get-Content .env -ErrorAction SilentlyContinue | Where-Object { $_ -match "^$name=" } | Select-Object -First 1
    if ($line) { ($line -split '=', 2)[1].Trim() } else { $default }
}
$pBack = Get-EnvPort 'HTTP_BACKOFFICE' '80'
$pCaisse = Get-EnvPort 'HTTP_CAISSE' '81'
$pStock = Get-EnvPort 'HTTP_STOCK' '82'

Write-Host "Attente du backend..." -ForegroundColor Cyan
$pret = $false
for ($i = 0; $i -lt 60; $i++) {
    try {
        $r = Invoke-WebRequest -UseBasicParsing -TimeoutSec 3 "http://localhost:$pBack/api/health/"
        if ($r.StatusCode -eq 200) { $pret = $true; break }
    } catch { }
    Start-Sleep -Seconds 3
}
if (-not $pret) { throw "Le backend ne répond pas. Consultez : docker compose logs backend" }

# Données de démonstration et compte opérateur (ignorés s'ils existent déjà)
$ErrorActionPreference = 'Continue'
docker compose exec -T backend python manage.py seed_database 2>$null | Out-Host
docker compose exec -T -e DJANGO_SUPERUSER_PASSWORD=Plateforme-Local-2025 backend `
    python manage.py createsuperuser --noinput --username plateforme --email ops@localhost.test 2>$null | Out-Host

Write-Host ""
Write-Host "══════════════ Plateforme prête ══════════════" -ForegroundColor Green
Write-Host " Backoffice   http://localhost:$pBack        (code entreprise : demo / admin / dutyfree2025)"
Write-Host " Inscription  http://localhost:$pBack/inscription"
Write-Host " Caisse       http://localhost:$pCaisse     (demo / Aminata Sawadogo / PIN 1234)"
Write-Host " Stock        http://localhost:$pStock     (demo / stock / dutyfree2025)"
Write-Host " Emails       http://localhost:8025   (Mailpit)"
Write-Host " Admin SaaS   http://localhost:$pBack/admin/ (plateforme / Plateforme-Local-2025)"
Write-Host ""
Write-Host " Activer une boutique SANS payer : /admin/ -> Organisations -> action 'Activer / offrir N mois'"
Write-Host " Tableau de bord operateur : bouton en haut de la liste Organisations dans /admin/"
Write-Host ""
Write-Host " Simuler le passage d'un jour (factures de renouvellement, expirations) :"
Write-Host "   docker compose exec backend python manage.py taches_quotidiennes"
Write-Host " Arrêter : docker compose down     Tout effacer : .\demarrer-local.ps1 -Reset"
