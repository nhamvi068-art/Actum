$lines = Get-Content "G:\Actum\packages\drawnix\src\components\bottom-input-bar\bottom-input-bar.scss"

$balance = 0
$issues = @()

for ($i = 0; $i -lt $lines.Count; $i++) {
    $line = $lines[$i]
    $lineNum = $i + 1
    
    # Remove SCSS comments (// ...)
    $cleanLine = $line -split '//' | Select-Object -First 1
    
    # Count braces in cleaned line
    $open = ([regex]::Matches($cleanLine, '\{')).Count
    $close = ([regex]::Matches($cleanLine, '\}')).Count
    
    $balance += $open - $close
    
    # Track where balance becomes positive (entering a new block)
    if ($balance -eq 1 -and $open -gt 0) {
        $issues += "Line $lineNum`: ENTER block: $($line.Trim())"
    }
    
    # Track where balance returns to 0 (exiting a block)
    if ($balance -eq 0 -and $close -gt 0) {
        $issues += "Line $lineNum`: EXIT block:  $($line.Trim())"
    }
}

Write-Host "Final balance: $balance"
Write-Host "`nBlock entries/exits:"
$issues | ForEach-Object { Write-Host $_ }
