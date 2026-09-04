# Writes the two files the file bridge is not allowed to touch, then shows you
# what git makes of them. Run it once, from anywhere:
#
#     powershell -ExecutionPolicy Bypass -File .\add-missing-files.ps1
#
# .npmrc is the one that matters: without it `npm install` tries to compile
# better-sqlite3 from source, which on Windows needs Visual Studio build tools
# and on the VPS needs build-essential — for a binary the package already ships.
# The Makefile change only adds `make logs`; `npm run logs` works either way.

$repo = 'D:\LoWWebsite'
if (-not (Test-Path $repo)) { throw "$repo not found" }

# ---------------------------------------------------------------- .npmrc
$npmrc = @'
# Every native dependency this project has — better-sqlite3, sharp and
# @node-rs/argon2 — ships prebuilt binaries for the platforms we run on, so
# nothing here needs a C++ toolchain. npm does not know that: a package with a
# binding.gyp and no install script of its own gets an implicit
# `node-gyp rebuild`, which is how a plain `npm ci` ends up compiling
# better-sqlite3 from source and demanding build-essential on a VPS that should
# not need one.
#
# Turning install scripts off makes every install identical on Windows, Linux
# and in Docker, and takes the compiler off the server entirely. It also means
# no dependency runs arbitrary code during a deploy, which is a small mercy.
#
# The cost, which is real: if a dependency is ever added that genuinely needs a
# postinstall step, it will silently not run. `npm ci --foreground-scripts` in a
# scratch copy is how to check what a package wanted to do.
ignore-scripts=true

# Never write a lockfile that differs from what the server will install.
save-exact=false
'@
Set-Content -Path (Join-Path $repo '.npmrc') -Value $npmrc -Encoding ascii
Write-Host "wrote .npmrc" -ForegroundColor Green

# -------------------------------------------------------------- Makefile
# Recipe lines must begin with a real tab, so it is spelled out here.
$make = Join-Path $repo 'Makefile'
$text = Get-Content $make -Raw
if ($text -match '(?m)^logs:') {
  Write-Host "Makefile already has a logs target — left alone" -ForegroundColor Yellow
} else {
  $text = $text -replace '(?m)^\.PHONY: dev build start bootstrap seed-demo reset backup restore test',
                         '.PHONY: dev build start bootstrap seed-demo reset backup restore logs test'
  $target = "logs: ## Everything the server wrote down; ``make logs ARGS=--errors`` for the bad news only`n`tnpm run logs -- `$(ARGS)`n`ntest:"
  $text = $text -replace '(?m)^test:', $target
  Set-Content -Path $make -Value $text -Encoding ascii -NoNewline
  Write-Host "added the logs target to the Makefile" -ForegroundColor Green
}

# ------------------------------------------------------------------ git
Push-Location $repo
Write-Host "`n--- git sees:" -ForegroundColor Cyan
git status --short
Write-Host "`nIf .npmrc is missing above, it is being ignored somewhere:" -ForegroundColor Cyan
git check-ignore -v .npmrc
Pop-Location
