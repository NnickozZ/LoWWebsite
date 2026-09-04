<#
  Writes the two files the file bridge is not allowed to touch, then commits.

      cd D:\LoWWebsite
      powershell -ExecutionPolicy Bypass -File .\commit.ps1          # commit only
      powershell -ExecutionPolicy Bypass -File .\commit.ps1 -Push    # commit and push

  It removes itself before staging, so the script never lands in the commit.
  Nothing is pushed unless you ask for it with -Push.
#>
param([switch]$Push)

$ErrorActionPreference = 'Stop'
$repo = 'D:\LoWWebsite'
if (-not (Test-Path (Join-Path $repo '.git'))) { throw "$repo is not a git repository" }

# ---------------------------------------------------------------- .npmrc
$npmrc = @'
# Every native dependency this project has - better-sqlite3, sharp and
# @node-rs/argon2 - ships prebuilt binaries for the platforms we run on, so
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
# Recipe lines must start with a real tab, so it is spelled out rather than typed.
$make = Join-Path $repo 'Makefile'
$text = Get-Content $make -Raw
if ($text -match '(?m)^logs:') {
  Write-Host "Makefile already has a logs target - left alone" -ForegroundColor Yellow
} else {
  $text = $text -replace '(?m)^(\.PHONY: dev build start bootstrap seed-demo reset backup restore) test',
                         '$1 logs test'
  $target = "logs: ## Everything the server wrote down; ``make logs ARGS=--errors`` for the bad news only`n`tnpm run logs -- `$(ARGS)`n`ntest:"
  $text = $text -replace '(?m)^test:', $target
  Set-Content -Path $make -Value $text -Encoding ascii -NoNewline
  Write-Host "added the logs target to the Makefile" -ForegroundColor Green
}

Push-Location $repo
try {
  # Out of the way before staging, so it is never part of the commit.
  if (Test-Path $PSCommandPath) { Remove-Item $PSCommandPath -Force -ErrorAction SilentlyContinue }
  if (Test-Path (Join-Path $repo 'add-missing-files.ps1')) {
    Remove-Item (Join-Path $repo 'add-missing-files.ps1') -Force -ErrorAction SilentlyContinue
  }

  git add -A

  Write-Host "`n--- staged for this commit:" -ForegroundColor Cyan
  git status --short
  Write-Host ""
  git diff --cached --stat | Select-Object -Last 1

  $staged = git diff --cached --name-only
  if (-not $staged) { Write-Host "`nNothing to commit." -ForegroundColor Yellow; return }
  if ($staged -notcontains '.npmrc') {
    Write-Host "`n.npmrc did not get staged - something is ignoring it:" -ForegroundColor Red
    git check-ignore -v .npmrc
  }

  $msg = @'
Fix the VPS aborts, and leave something behind next time

better-sqlite3 11 derives every class from the legacy node::ObjectWrap, which
Node 24.19 gave cleanup hooks. Tearing down an environment with prepared
statements alive then aborts the process - not an exception, the whole server,
which is why "new board does nothing", NetworkError, and the site falling over
once a second person joined were all the same bug. v13 is Node-API and links no
node:: symbol at all.

Alongside it: next/react/playwright pinned exactly (a server was found running
Next 16 while package.json said 15), a production start script that runs this
project's Next by path instead of through npx, .npmrc so npm stops compiling a
binary better-sqlite3 already ships, and the React key fixed at its source.

And a logbook, because three outages left nothing to read: server errors,
server actions, browser exceptions, and the signal the server was killed with
all land in data/logs. npm run logs -- --errors.
'@
  $tmp = [System.IO.Path]::GetTempFileName()
  Set-Content -Path $tmp -Value $msg -Encoding utf8
  git commit -F $tmp
  Remove-Item $tmp -Force

  Write-Host "`n--- committed:" -ForegroundColor Cyan
  git --no-pager log --oneline -1

  if ($Push) {
    Write-Host "`n--- pushing" -ForegroundColor Cyan
    git push
  } else {
    Write-Host "`nNot pushed. When you are happy with it:  git push" -ForegroundColor Yellow
  }
} finally {
  Pop-Location
}
