# 贡献指南 (Contributing Guide)

感谢您对交互式画布演示项目的关注！我们欢迎所有形式的贡献，包括但不限于：

- 🐛 报告Bug
- ✨ 提出新功能建议
- 📝 改进文档
- 🔧 提交代码修复
- 🎨 改进用户界面

## 开发环境设置

### 1. Fork 和 Clone 项目

```bash
# Fork 项目到您的 GitHub 账户
# 然后 clone 您的 fork
git clone https://github.com/YOUR_USERNAME/canvas_demo.git
cd canvas_demo

# 添加原始仓库作为上游
git remote add upstream https://github.com/ORIGINAL_OWNER/canvas_demo.git
```

### 2. 安装依赖

```bash
npm install
```

### 3. 启动开发环境

```bash
# 启动完整开发环境（前端 + 后端）
npm run dev:full
```

## 贡献流程

### 1. 创建分支

```bash
# 从 main 分支创建新分支
git checkout -b feature/your-feature-name
# 或
git checkout -b fix/your-bug-fix
```

### 2. 进行更改

- 编写代码
- 添加必要的测试
- 更新相关文档
- 确保代码通过 ESLint 检查

### 3. 提交更改

```bash
# 添加更改的文件
git add .

# 提交更改（使用清晰的提交信息）
git commit -m "feat: 添加新功能描述"
# 或
git commit -m "fix: 修复某个问题"
```

### 提交信息规范

我们使用 [Conventional Commits](https://www.conventionalcommits.org/) 规范：

- `feat:` 新功能
- `fix:` Bug修复
- `docs:` 文档更新
- `style:` 代码格式调整
- `refactor:` 代码重构
- `test:` 测试相关
- `chore:` 构建过程或辅助工具的变动

### 4. 推送和创建 Pull Request

```bash
# 推送分支到您的 fork
git push origin feature/your-feature-name
```

然后在 GitHub 上创建 Pull Request。

## 代码规范

### JavaScript/React 规范

- 使用 ES6+ 语法
- 组件使用函数式组件和 Hooks
- 使用 ESLint 进行代码检查
- 遵循 React 最佳实践

### 文件命名

- 组件文件使用 PascalCase: `MyComponent.jsx`
- 工具函数使用 camelCase: `utils.js`
- 常量文件使用 UPPER_SNAKE_CASE: `CONSTANTS.js`

### 代码风格

```javascript
// ✅ 好的示例
const MyComponent = ({ title, onSave }) => {
  const [isLoading, setIsLoading] = useState(false);
  
  const handleSave = useCallback(async () => {
    setIsLoading(true);
    try {
      await onSave();
    } finally {
      setIsLoading(false);
    }
  }, [onSave]);

  return (
    <div className="my-component">
      <h2>{title}</h2>
      <button onClick={handleSave} disabled={isLoading}>
        {isLoading ? '保存中...' : '保存'}
      </button>
    </div>
  );
};

// ❌ 避免的写法
const myComponent = (props) => {
  const [loading, setLoading] = useState(false);
  // ...
};
```

## 测试

### 运行测试

```bash
# 运行所有测试
npm test

# 运行代码检查
npm run lint
```

### 测试要求

- 新功能需要添加相应的测试
- 确保所有测试通过
- 保持测试覆盖率

## 文档

### 更新文档

- 新功能需要更新 README.md
- 复杂的 API 需要添加 JSDoc 注释
- 重要的配置变更需要更新相关文档

### 文档风格

- 使用清晰的中文描述
- 提供代码示例
- 保持格式一致

## Pull Request 指南

### PR 标题

使用清晰的标题描述您的更改：

```
feat: 添加图像批量处理功能
fix: 修复画布导出PDF时的内存泄漏问题
docs: 更新安装指南
```

### PR 描述

请包含以下信息：

1. **更改概述**: 简要描述您的更改
2. **相关 Issue**: 如果修复了某个 Issue，请引用它
3. **测试**: 描述您如何测试了这些更改
4. **截图**: 如果是 UI 更改，请提供截图
5. **检查清单**: 确认您已完成所有必要的步骤

### PR 检查清单

- [ ] 代码遵循项目规范
- [ ] 添加了必要的测试
- [ ] 更新了相关文档
- [ ] 所有测试通过
- [ ] 代码通过 ESLint 检查
- [ ] 提交信息清晰明确

## Issue 报告

### Bug 报告

当报告 Bug 时，请包含：

1. **环境信息**:
   - 操作系统
   - Node.js 版本
   - 浏览器版本

2. **重现步骤**:
   - 详细的操作步骤
   - 预期结果
   - 实际结果

3. **附加信息**:
   - 错误截图
   - 控制台错误信息
   - 相关代码片段

### 功能请求

当提出新功能时，请包含：

1. **功能描述**: 详细描述您想要的功能
2. **使用场景**: 说明为什么需要这个功能
3. **实现建议**: 如果有的话，提供实现思路

## 社区准则

### 行为准则

- 保持友善和尊重
- 欢迎不同背景的贡献者
- 专注于对项目最有利的事情
- 尊重不同的观点和经验

### 沟通

- 使用中文进行交流
- 保持专业和礼貌
- 提供建设性的反馈
- 及时响应讨论

## 发布流程

### 版本发布

1. 更新 `package.json` 中的版本号
2. 更新 `CHANGELOG.md`
3. 创建 Git tag
4. 发布到 npm（如果需要）

### 版本号规范

使用 [语义化版本](https://semver.org/lang/zh-CN/)：

- `MAJOR`: 不兼容的 API 修改
- `MINOR`: 向下兼容的功能性新增
- `PATCH`: 向下兼容的问题修正

## 获取帮助

如果您在贡献过程中遇到问题：

1. 查看现有的 Issues 和 Pull Requests
2. 在 GitHub Discussions 中提问
3. 联系维护者

## 许可证

通过贡献代码，您同意您的贡献将在 MIT 许可证下发布。

---

再次感谢您的贡献！🎉
