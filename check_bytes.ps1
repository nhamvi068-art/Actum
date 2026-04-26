$bytes = [System.IO.File]::ReadAllBytes("G:\Actum\packages\drawnix\src\drawnix.tsx")
$start = 913 * 80
$end = 914 * 80 + 30
for ($i = $start; $i -lt $end; $i++) {
    Write-Host ("{0:X2}" -f $bytes[$i]) -NoNewline
    if (($i + 1) % 16 -eq 0) { Write-Host "" }
}
