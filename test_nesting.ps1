$lines = Get-Content "G:\Actum\packages\drawnix\src\components\bottom-input-bar\bottom-input-bar.scss"

$balance = 0

for ($i = 174; $i -lt 275; $i++) {
    $line = $lines[$i]
    $lineNum = $i + 1
    
    # Remove SCSS comments (// ...)
    $cleanLine = $line -split '//' | Select-Object -First 1
    
    # Count braces in cleaned line
    $open = ([regex]::Matches($cleanLine, '\{')).Count
    $close = ([regex]::Matches($cleanLine, '\}')).Count
    
    $oldBalance = $balance
    $balance += $open - $close
    
    $marker = ""
    if ($open -gt 0) { $marker = "  <-- opens $open" }
    if ($close -gt 0) { $marker = "  <-- closes $close" }
    if ($balance -eq 1 -and $oldBalance -eq 0) { $marker = "  <-- TOP LEVEL ENTER" }
    if ($balance -eq 0 -and $oldBalance -eq 1) { $marker = "  <-- TOP LEVEL EXIT" }
    
    Write-Host "Line $lineNum`: balance=$balance$marker : $($line.Trim())"
}
