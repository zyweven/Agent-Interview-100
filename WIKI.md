# 📚 Wiki 使用说明

本项目提供了一个基于 Web 的知识库阅读界面。

## 🌐 在线访问

直接打开 GitHub Pages（如果已启用）：
> https://zyweven.github.io/Agent-Interview-100/wiki.html

或直接浏览原始 Markdown：
> https://github.com/zyweven/Agent-Interview-100/tree/main/01-agent-architecture/

## 🖥️ 本地使用

### 方式一：直接打开 HTML 文件

```bash
# 在浏览器中打开
open wiki.html
```

即可浏览 100 篇面试问题，按模块分类，支持搜索。

### 方式二：本地静态服务器

```bash
# Python 3
python -m http.server 8080

# 或 Node.js
npx serve .
```

然后访问 http://localhost:8080/wiki.html

## 🔧 重新生成索引（可选）

如果修改了 Markdown 文件，需要重新生成 `wiki-index.json`：

```bash
# 确保有 Node.js 环境
node wiki-auto.js [目录路径]

# 例如
node wiki-auto.js .
```

这会自动扫描所有 `.md` 文件，读取标题，生成新的索引数据。

## 📁 Wiki 文件说明

| 文件 | 作用 |
|------|------|
| `wiki.html` | 主页面，从 `wiki-index.json` 读取数据并渲染 |
| `wiki-auto.html` | 自动生成版，通过 JS 动态扫描目录 |
| `wiki-auto.js` | Node.js 脚本，用于重新生成索引 |
| `wiki-index.json` | 文章索引数据（100 篇文章的标题、路径、模块） |

## ⚙️ 自定义部署

修改 `wiki-index.json` 中的 `path` 字段，指向你自己的仓库路径：

```json
{
  "repo": "your-username/your-repo",
  "path": "/path/to/markdown/files"
}
```

然后将修改后的 `wiki-index.json`、`wiki.html` 等文件部署到 GitHub Pages。