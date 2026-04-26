# Read all bytes
$bytes = [System.IO.File]::ReadAllBytes("G:\Actum\packages\drawnix\src\drawnix.tsx")

# Find line 914 start (0-indexed line 913)
# Count bytes to find line boundaries
$lineStart = 0
$lineNum = 0
for ($i = 0; $i -lt $bytes.Length -and $lineNum -lt 913; $i++) {
    if ($bytes[$i] -eq 10) {  # newline
        $lineNum++
        $lineStart = $i + 1
    }
}
$lineEnd = $lineStart
while ($lineEnd -lt $bytes.Length -and $bytes[$lineEnd] -ne 10) {
    $lineEnd++
}

# Show line 914 with hex
Write-Host "Line 914 bytes (line $lineNum to $($lineNum+1), 0-indexed):"
for ($i = $lineStart; $i -lt $lineEnd; $i++) {
    Write-Host ("{0:X2} " -f $bytes[$i]) -NoNewline
}
Write-Host ""

# Decode as ASCII/UTF8
$lineBytes = New-Object byte[] ($lineEnd - $lineStart)
[Array]::Copy($bytes, $lineStart, $lineBytes, 0, $lineEnd - $lineStart)
Write-Host "Line 914 text: '$( [System.Text.Encoding]::UTF8.GetString($lineBytes) )'"

# Also show 10 lines around line 914
Write-Host "`nLines 909-919:"
$lineNum = 0
$pos = 0
$lineStarts = @()
for ($i = 0; $i -lt $bytes.Length; $i++) {
    if ($i -eq 0 -or $bytes[$i-1] -eq 10) {
        $lineStarts += $i
        if ($lineNum -ge 908 -and $lineNum -le 918) {
            $start = $i
            $end = $start
            while ($end -lt $bytes.Length -and $bytes[$end] -ne 10) { $end++ }
            $len = $end - $start
            $lineBytes = New-Object byte[] $len
            [Array]::Copy($bytes, $start, $lineBytes, 0, $len)
            Write-Host ("Line {0}: " -f ($lineNum + 1)) + [System.Text.Encoding]::UTF8.GetString($lineBytes)
        }
        $lineNum++
    }
}
