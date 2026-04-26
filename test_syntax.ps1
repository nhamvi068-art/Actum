$content = Get-Content "G:\Actum\packages\drawnix\src\components\bottom-input-bar\bottom-input-bar.scss" -Raw

# Simple brace count
$openBraces = ($content.ToCharArray() | Where-Object { $_ -eq '{' }).Count
$closeBraces = ($content.ToCharArray() | Where-Object { $_ -eq '}' }).Count

Write-Host "Open braces: $openBraces"
Write-Host "Close braces: $closeBraces"

# Look for common SCSS syntax issues
Write-Host "`n=== Checking for common issues ==="

# Check for missing semicolons before closing braces
$lines = Get-Content "G:\Actum\packages\drawnix\src\components\bottom-input-bar\bottom-input-bar.scss"
for ($i = 0; $i -lt $lines.Count; $i++) {
    $line = $lines[$i]
    $lineNum = $i + 1
    
    # Skip comments
    if ($line -match '^\s*//') { continue }
    
    # Check for property: value without semicolon followed by a closing brace on same line
    if ($line -match ':\s*[^;{}]+\s*$' -and $line -notmatch ';$' -and $line -notmatch '^\s*//') {
        Write-Host "Line $lineNum`: Possible missing semicolon: $($line.Trim())"
    }
}
