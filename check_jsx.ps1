$lines = [System.IO.File]::ReadAllLines("G:\Actum\packages\drawnix\src\drawnix.tsx")

$jsxStack = @()
$currentFunc = ""

for ($i = 0; $i -lt $lines.Count; $i++) {
    $line = $lines[$i]

    if ($line -match "const PlaceholderOverlayInner") {
        $currentFunc = "PlaceholderOverlayInner"
    }
    elseif ($line -match "^// forwardRef wrapper") {
        $currentFunc = "Drawnix"
    }

    if ($currentFunc -eq "PlaceholderOverlayInner") {
        $iplus1 = $i + 1
        if ($line -match "<(\w+)[\s>]|</(\w+)>") {
            $tagName = if ($Matches[1]) { $Matches[1] } else { $Matches[2] }
            if ($line -match "^[^<]*</") {
                # closing tag
                if ($jsxStack.Count -gt 0 -and $jsxStack[-1] -eq $tagName) {
                    $jsxStack.RemoveAt($jsxStack.Count - 1)
                }
                else {
                    Write-Host "Line $iplus1 : MISMATCH closing tag </$tagName>. Stack: $jsxStack"
                }
            }
            else {
                # opening tag (self-closing or not)
                if ($line -notmatch "/>$") {
                    $jsxStack.Add($tagName) | Out-Null
                }
            }
        }
    }
}

Write-Host "Final stack for PlaceholderOverlayInner: $jsxStack"
Write-Host "Total lines: $($lines.Count)"
