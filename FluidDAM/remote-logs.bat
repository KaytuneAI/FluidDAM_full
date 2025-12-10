@echo off
REM FluidDAM 远程日志查看脚本 (Windows版本)

set SERVER_IP=your-server-ip
set SERVER_USER=username
set LOG_PATH=/path/to/fluiddam/logs
set API_URL=http://%SERVER_IP%:3001

if "%1"=="-h" goto help
if "%1"=="--help" goto help
if "%1"=="-w" goto web
if "%1"=="--web" goto web
if "%1"=="-s" goto ssh
if "%1"=="--ssh" goto ssh
if "%1"=="-a" goto api
if "%1"=="--api" goto api
if "%1"=="-d" goto download
if "%1"=="--download" goto download
if "%1"=="" goto default

:help
echo FluidDAM 远程日志查看工具
echo.
echo 用法: %0 [选项]
echo.
echo 选项:
echo   -h, --help          显示帮助信息
echo   -w, --web           打开Web日志查看器
echo   -s, --ssh           通过SSH查看日志
echo   -a, --api           通过API查看日志
echo   -d, --download     下载日志到本地
echo.
echo 示例:
echo   %0 -w               # 打开Web界面
echo   %0 -s               # SSH查看日志
echo   %0 -a               # API查看日志
echo   %0 -d               # 下载日志
goto end

:web
echo 打开Web日志查看器...
echo 请确保服务器正在运行，然后访问: %API_URL%/log-viewer.html
start %API_URL%/log-viewer.html
goto end

:ssh
echo 通过SSH连接查看日志...
echo 服务器: %SERVER_USER%@%SERVER_IP%
echo 日志路径: %LOG_PATH%
echo.
echo 常用命令:
echo   ssh %SERVER_USER%@%SERVER_IP% "tail -f %LOG_PATH%/server-*.log"
echo   ssh %SERVER_USER%@%SERVER_IP% "grep -i '分享' %LOG_PATH%/*.log"
echo.
echo 请手动执行SSH命令或使用SSH客户端连接
goto end

:api
echo 通过API查看日志...
echo.
echo 可用的API端点:
echo   %API_URL%/api/logs
echo   %API_URL%/api/logs/stats
echo   %API_URL%/api/logs/files
echo.
echo 示例请求:
echo   curl "%API_URL%/api/logs?type=server&lines=100"
echo   curl "%API_URL%/api/logs/stats"
echo.
echo 正在测试API连接...
curl -s "%API_URL%/api/logs/stats" 2>nul
if %errorlevel%==0 (
    echo API连接成功！
) else (
    echo API连接失败，请检查服务器状态
)
goto end

:download
echo 下载日志到本地...
echo 正在从服务器下载日志文件...
if not exist "remote-logs" mkdir remote-logs
scp -r %SERVER_USER%@%SERVER_IP%:%LOG_PATH%/ remote-logs/ 2>nul
if %errorlevel%==0 (
    echo 日志下载成功！保存在 remote-logs/ 目录
    dir remote-logs
) else (
    echo 下载失败，请检查SSH连接和路径
)
goto end

:default
echo FluidDAM 远程日志查看工具
echo.
echo 请先配置服务器信息:
echo   SERVER_IP=%SERVER_IP%
echo   SERVER_USER=%SERVER_USER%
echo   LOG_PATH=%LOG_PATH%
echo.
echo 使用方法:
echo   %0 -w    # 打开Web界面 (推荐)
echo   %0 -s    # SSH查看日志
echo   %0 -a    # API查看日志
echo   %0 -d    # 下载日志
echo.
echo 配置说明:
echo   1. 编辑此脚本，修改 SERVER_IP、SERVER_USER、LOG_PATH
echo   2. 确保服务器正在运行
echo   3. 确保网络连接正常

:end
