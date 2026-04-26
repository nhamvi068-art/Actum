$lines = Get-Content "G:\Actum\packages\drawnix\src\components\bottom-input-bar\bottom-input-bar.scss"

$balance = 0
$stack = @()

for ($i = 0; $i -lt $lines.Count; $i++) {
    $line = $lines[$i]
    $lineNum = $i + 1
    
    # Remove SCSS comments (// ...)
    $cleanLine = $line -split '//' | Select-Object -First 1
    
    # Count braces in cleaned line
    $open = ([regex]::Matches($cleanLine, '\{')).Count
    $close = ([regex]::Matches($cleanLine, '\}')).Count
    
    # Push opened blocks onto stack
    if ($open -gt 0) {
        for ($j = 0; $j -lt $open; $j++) {
            $stack += "block_at_line_$lineNum"
        }
    }
    
    $oldBalance = $balance
    $balance += $open - $close
    
    # Pop closed blocks from stack
    if ($close -gt 0) {
        $poppedCount = [Math]::Min($close, $stack.Count)
        if ($poppedCount -gt 0) {
            $stack = $stack | Select-Object -First ($stack.Count - $poppedCount)
        }
        
        if ($poppedCount -lt $close) {
            Write-Host "Line $lineNum`: Trying to close $close blocks but stack has $balance blocks. Stack depth: $($stack.Count)"
        }
    }
    
    # Show lines 710-792
    if ($i -ge 709 -and $i -le 792) {
        $marker = ""
        if ($open -gt 0) { $marker = " <-- OPEN ($open)" }
        if ($close -gt 0) { $marker = " <-- CLOSE ($close)" }
        Write-Host "Line $lineNum`: balance=$balance, stack=$($stack.Count): $($line.Trim())$marker"
    }
}

Write-Host "`nFinal balance: $balance"
Write-Host "Final stack depth: $($stack.Count)"
