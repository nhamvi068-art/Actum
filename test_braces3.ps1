$lines = Get-Content "G:\Actum\packages\drawnix\src\components\bottom-input-bar\bottom-input-bar.scss"
$balance = 0
for ($i = 0; $i -lt $lines.Count; $i++) {
    $line = $lines[$i]
    $lineNum = $i + 1
    
    # Remove SCSS comments
    $cleanLine = $line -replace '//.*$', ''
    
    # Count braces in cleaned line
    $open = ([regex]::Matches($cleanLine, '\{')).Count
    $close = ([regex]::Matches($cleanLine, '\}')).Count
    
    $oldBalance = $balance
    $balance += $open - $close
    
    if ($balance -eq 1 -and $oldBalance -eq 0) {
        Write-Host "Line $lineNum (balance=1, opened): $($lines[$i].Trim())"
    }
}

Write-Host "`nFinal balance: $balance"
