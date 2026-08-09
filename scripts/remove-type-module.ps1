$files = Get-ChildItem -Path "packages" -Recurse -Filter "package.json" | Where-Object { $_.FullName -notmatch "node_modules" }
foreach ($file in $files) {
    $content = Get-Content -Path $file.FullName -Raw
    if ($content -match '"type": "module"') {
        $content = $content -replace ",`r?`n\s*`"type`": `"module`"", ""
        $content = $content -replace "`"type`": `"module`",`r?`n\s*", ""
        $content = $content -replace "`r?`n\s*`"type`": `"module`"", ""
        [System.IO.File]::WriteAllText($file.FullName, $content)
        Write-Host "Updated: $($file.FullName)"
    }
}
Write-Host "Done."
