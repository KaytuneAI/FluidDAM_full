@echo off
REM FluidDAM 日志查看脚本 (Windows版本)

set LOG_DIR=logs
set TODAY=%date:~0,4%-%date:~5,2%-%date:~8,2%

if "%1"=="-h" goto help
if "%1"=="--help" goto help
if "%1"=="-t" goto today
if "%1"=="--today" goto today
if "%1"=="-e" goto errors
if "%1"=="--errors" goto errors
if "%1"=="-s" goto share
if "%1"=="--share" goto share
if "%1"=="-f" goto follow
if "%1"=="--follow" goto follow
if "%1"=="-a" goto all
if "%1"=="--all" goto all
if "%1"=="-c" goto count
if "%1"=="--count" goto count
if "%1"=="-g" goto grep
if "%1"=="--grep" goto grep
if "%1"=="" goto default

:help
echo FluidDAM 日志查看工具
echo.
echo 用法: %0 [选项]
echo.
echo 选项:
echo   -h, --help          显示帮助信息
echo   -t, --today         查看今天的日志
echo   -e, --errors         查看错误日志
echo   -s, --share         查看分享相关日志
echo   -f, --follow        实时跟踪日志
echo   -a, --all           查看所有日志
echo   -c, --count         统计日志数量
echo   -g, --grep PATTERN  搜索特定内容
echo.
echo 示例:
echo   %0 -t                # 查看今天的日志
echo   %0 -e                # 查看错误日志
echo   %0 -s                # 查看分享相关日志
echo   %0 -g "分享失败"      # 搜索包含'分享失败'的日志
goto end

:today
echo === 今天的应用日志 ===
if exist "%LOG_DIR%\server-%TODAY%.log" (
    type "%LOG_DIR%\server-%TODAY%.log"
) else (
    echo 今天的日志文件不存在
)
goto end

:errors
echo === 错误日志 ===
if exist "%LOG_DIR%\error-%TODAY%.log" (
    type "%LOG_DIR%\error-%TODAY%.log"
) else (
    echo 今天的错误日志文件不存在
)
goto end

:share
echo === 分享相关日志 ===
findstr /i "分享 share" "%LOG_DIR%\*.log" 2>nul || echo 没有找到分享相关日志
goto end

:follow
echo 实时跟踪日志 (按 Ctrl+C 退出)
echo 注意: Windows下实时跟踪功能有限，建议使用PowerShell
powershell -Command "Get-Content '%LOG_DIR%\server-%TODAY%.log' -Wait"
goto end

:all
echo === 所有日志 ===
for %%f in ("%LOG_DIR%\*.log") do (
    echo === %%f ===
    type "%%f"
    echo.
)
goto end

:count
echo === 日志统计 ===
if exist "%LOG_DIR%\server-%TODAY%.log" (
    for /f %%i in ('find /c /v "" ^< "%LOG_DIR%\server-%TODAY%.log"') do echo 今天的日志行数: %%i
)
if exist "%LOG_DIR%\error-%TODAY%.log" (
    for /f %%i in ('find /c /v "" ^< "%LOG_DIR%\error-%TODAY%.log"') do echo 今天的错误行数: %%i
)
for /f %%i in ('findstr /c:"画布分享成功" "%LOG_DIR%\*.log" 2^>nul ^| find /c /v ""') do echo 分享成功次数: %%i
for /f %%i in ('findstr /c:"分享画布时出错" "%LOG_DIR%\*.log" 2^>nul ^| find /c /v ""') do echo 分享失败次数: %%i
goto end

:grep
if "%2"=="" (
    echo 错误: 请提供搜索模式
    goto end
)
echo === 搜索结果: %2 ===
findstr /i "%2" "%LOG_DIR%\*.log" 2>nul || echo 没有找到匹配的日志
goto end

:default
echo FluidDAM 日志查看工具
echo 使用 %0 --help 查看帮助信息
echo.
echo 快速查看:
echo   %0 -t    # 今天的日志
echo   %0 -e    # 错误日志
echo   %0 -s    # 分享日志
echo   %0 -c    # 统计信息

:end
