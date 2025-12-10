# 修复JSON文件中的mergeArea地址转义问题
$jsonFile = Get-ChildItem "*layout.json" | Select-Object -First 1
$content = Get-Content $jsonFile.FullName -Raw -Encoding UTF8

# 修复mergeArea地址中的$符号转义
$fixedContent = $content -replace '"mergeArea":"([^"]*)"', {
    param($match)
    $address = $match.Groups[1].Value
    $escapedAddress = $address -replace '\$', '\$'
    return '"mergeArea":"' + $escapedAddress + '"'
}

# 保存修复后的文件
$fixedContent | Set-Content ($jsonFile.FullName + ".fixed") -Encoding UTF8

Write-Host "JSON文件已修复，保存为: $($jsonFile.FullName).fixed"
