#!/bin/bash
# FluidDAM 日志查看脚本

LOG_DIR="logs"
TODAY=$(date +%Y-%m-%d)

# 颜色定义
RED='\033[0;31m'
GREEN='\033[0;32m'
YELLOW='\033[1;33m'
BLUE='\033[0;34m'
NC='\033[0m' # No Color

# 显示帮助信息
show_help() {
    echo "FluidDAM 日志查看工具"
    echo ""
    echo "用法: $0 [选项]"
    echo ""
    echo "选项:"
    echo "  -h, --help          显示帮助信息"
    echo "  -t, --today         查看今天的日志"
    echo "  -e, --errors         查看错误日志"
    echo "  -s, --share         查看分享相关日志"
    echo "  -f, --follow        实时跟踪日志"
    echo "  -a, --all           查看所有日志"
    echo "  -c, --count         统计日志数量"
    echo "  -g, --grep PATTERN  搜索特定内容"
    echo ""
    echo "示例:"
    echo "  $0 -t                # 查看今天的日志"
    echo "  $0 -e -f              # 实时跟踪错误日志"
    echo "  $0 -s                # 查看分享相关日志"
    echo "  $0 -g '分享失败'      # 搜索包含'分享失败'的日志"
}

# 检查日志目录
check_log_dir() {
    if [ ! -d "$LOG_DIR" ]; then
        echo -e "${RED}错误: 日志目录 $LOG_DIR 不存在${NC}"
        exit 1
    fi
}

# 查看今天的日志
view_today() {
    echo -e "${BLUE}=== 今天的应用日志 ===${NC}"
    if [ -f "$LOG_DIR/server-$TODAY.log" ]; then
        cat "$LOG_DIR/server-$TODAY.log"
    else
        echo -e "${YELLOW}今天的日志文件不存在${NC}"
    fi
}

# 查看错误日志
view_errors() {
    echo -e "${RED}=== 错误日志 ===${NC}"
    if [ -f "$LOG_DIR/error-$TODAY.log" ]; then
        cat "$LOG_DIR/error-$TODAY.log"
    else
        echo -e "${YELLOW}今天的错误日志文件不存在${NC}"
    fi
}

# 查看分享相关日志
view_share() {
    echo -e "${GREEN}=== 分享相关日志 ===${NC}"
    grep -i "分享\|share" "$LOG_DIR"/*.log 2>/dev/null || echo -e "${YELLOW}没有找到分享相关日志${NC}"
}

# 实时跟踪日志
follow_logs() {
    echo -e "${BLUE}实时跟踪日志 (按 Ctrl+C 退出)${NC}"
    tail -f "$LOG_DIR"/*.log
}

# 查看所有日志
view_all() {
    echo -e "${BLUE}=== 所有日志 ===${NC}"
    cat "$LOG_DIR"/*.log 2>/dev/null | sort
}

# 统计日志数量
count_logs() {
    echo -e "${BLUE}=== 日志统计 ===${NC}"
    
    # 统计今天的日志
    if [ -f "$LOG_DIR/server-$TODAY.log" ]; then
        TOTAL_TODAY=$(wc -l < "$LOG_DIR/server-$TODAY.log")
        echo -e "今天的日志行数: ${GREEN}$TOTAL_TODAY${NC}"
    fi
    
    # 统计错误日志
    if [ -f "$LOG_DIR/error-$TODAY.log" ]; then
        ERROR_TODAY=$(wc -l < "$LOG_DIR/error-$TODAY.log")
        echo -e "今天的错误行数: ${RED}$ERROR_TODAY${NC}"
    fi
    
    # 统计分享成功
    SHARE_SUCCESS=$(grep -c "画布分享成功" "$LOG_DIR"/*.log 2>/dev/null || echo "0")
    echo -e "分享成功次数: ${GREEN}$SHARE_SUCCESS${NC}"
    
    # 统计分享失败
    SHARE_FAILED=$(grep -c "分享画布时出错" "$LOG_DIR"/*.log 2>/dev/null || echo "0")
    echo -e "分享失败次数: ${RED}$SHARE_FAILED${NC}"
    
    # 计算成功率
    if [ $((SHARE_SUCCESS + SHARE_FAILED)) -gt 0 ]; then
        SUCCESS_RATE=$(( (SHARE_SUCCESS * 100) / (SHARE_SUCCESS + SHARE_FAILED) ))
        echo -e "分享成功率: ${GREEN}$SUCCESS_RATE%${NC}"
    fi
}

# 搜索日志
search_logs() {
    if [ -z "$1" ]; then
        echo -e "${RED}错误: 请提供搜索模式${NC}"
        exit 1
    fi
    
    echo -e "${BLUE}=== 搜索结果: $1 ===${NC}"
    grep -i "$1" "$LOG_DIR"/*.log 2>/dev/null || echo -e "${YELLOW}没有找到匹配的日志${NC}"
}

# 主程序
check_log_dir

case "$1" in
    -h|--help)
        show_help
        ;;
    -t|--today)
        view_today
        ;;
    -e|--errors)
        view_errors
        ;;
    -s|--share)
        view_share
        ;;
    -f|--follow)
        follow_logs
        ;;
    -a|--all)
        view_all
        ;;
    -c|--count)
        count_logs
        ;;
    -g|--grep)
        search_logs "$2"
        ;;
    "")
        echo -e "${BLUE}FluidDAM 日志查看工具${NC}"
        echo "使用 $0 --help 查看帮助信息"
        echo ""
        echo "快速查看:"
        echo "  $0 -t    # 今天的日志"
        echo "  $0 -e    # 错误日志"
        echo "  $0 -s    # 分享日志"
        echo "  $0 -c    # 统计信息"
        ;;
    *)
        echo -e "${RED}未知选项: $1${NC}"
        show_help
        exit 1
        ;;
esac
