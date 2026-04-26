$content = Get-Content "G:\Actum\packages\drawnix\src\components\bottom-input-bar\bottom-input-bar.scss" -Raw
$openBraces = ($content | Select-String -Pattern '{' -AllMatches).Matches.Count
$closeBraces = ($content | Select-String -Pattern '}' -AllMatches).Matches.Count
Write-Host "Open braces: $openBraces"
Write-Host "Close braces: $openBraces"

# More detailed analysis
$lines = Get-Content "G:\Actum\packages\drawnix\src\components\bottom-input-bar\bottom-input-bar.scss"
$balance = 0
$maxBalance = 0
$issues = @()
for ($i = 0; $i -lt $lines.Count; $i++) {
    $line = $lines[$i]
    # Skip comments and strings that might contain braces
    if ($line -match '^\s*//') { continue }
    
    $open = ([regex]::Matches($line, '(?<!//.*)\{')).Count
    $close = ([regex]::Matches($line, '(?<!//.*)\}')).Count
    
    $balance += $open - $close
    if ($balance -gt $maxBalance) { $maxBalance = $balance }
    
    if ($balance -lt 0) {
        $issues += "Line $($i+1): Balance went negative: $balance"
        $balance = 0
    }
}

Write-Host "Max nesting depth: $maxBalance"
if ($issues.Count -gt 0) {
    Write-Host "Issues found:"
    $issues | ForEach-Object { Write-Host $_ }
} else {
    Write-Host "No negative balance found. Final balance: $balance"
}
