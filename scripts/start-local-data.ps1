param([Parameter(Mandatory=$true)][string]$Root,[int]$Port=8765,[string]$Python='python',[string[]]$AavRoot=@())
$ErrorActionPreference='Stop'
$atlasProject=Split-Path -Parent $PSScriptRoot
$atlasServer=Join-Path $atlasProject 'tools\merfish_server.py'
if(-not (Test-Path -LiteralPath $Root -PathType Container)){throw 'Root must be an existing local ABC Atlas data directory.'}
$atlasArgs=@($atlasServer,'--root',(Resolve-Path -LiteralPath $Root).Path,'--port',"$Port")
foreach($folder in $AavRoot){$atlasArgs+=@('--aav-root',$folder)}
& $Python @atlasArgs
exit $LASTEXITCODE
