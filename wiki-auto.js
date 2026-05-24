#!/usr/bin/env node
/**
 * Wiki Index Builder - 自动扫描 Markdown 文件夹生成索引
 *
 * 用法: node wiki-auto.js [目录路径]
 * 输出: index.json
 */

const fs = require('fs');
const path = require('path');

function scanDirectory(dir, baseDir = dir) {
    const items = fs.readdirSync(dir, { withFileTypes: true });
    const result = [];
    const rootFiles = [];

    for (const item of items) {
        const fullPath = path.join(dir, item.name);

        if (item.isDirectory()) {
            // 忽略隐藏目录和 node_modules
            if (item.name.startsWith('.') || item.name === 'node_modules') continue;

            const subItems = scanDirectory(fullPath, baseDir);
            if (subItems.length > 0) {
                result.push({
                    type: 'folder',
                    name: item.name,
                    path: path.relative(baseDir, fullPath),
                    children: subItems
                });
            }
        } else if (item.name.endsWith('.md')) {
            // 读取文件获取标题
            const content = fs.readFileSync(fullPath, 'utf-8');
            const titleMatch = content.match(/^#\s+(.+)$/m);
            const title = titleMatch ? titleMatch[1] : item.name.replace('.md', '');

            rootFiles.push({
                type: 'file',
                name: item.name,
                title: title,
                path: path.relative(baseDir, fullPath)
            });
        }
    }

    // 文件夹在前，文件在后
    const folders = result.filter(r => r.type === 'folder');
    const files = result.filter(r => r.type === 'file');
    const rootMdFiles = rootFiles.filter(f => !result.some(r => r.type === 'folder'));

    return [...folders, ...files, ...rootMdFiles];
}

function flatten(items, parentPath = '', parentName = '') {
    const result = [];

    for (const item of items) {
        if (item.type === 'file') {
            result.push({
                num: item.path.split('/').pop().split('-')[0] || '',
                title: item.title,
                path: item.path,
                module: parentName || '根目录'
            });
        } else if (item.children) {
            const moduleName = item.name.replace(/^\d+-/, '').replace(/-/g, ' ');
            result.push(...flatten(item.children, item.path, moduleName));
        }
    }

    return result;
}

function buildIndex(targetDir) {
    const items = scanDirectory(targetDir);
    const articles = flatten(items);

    // 按文件路径排序
    articles.sort((a, b) => {
        const pathA = a.path.split('/').map(p => p.padStart(10, '0')).join('/');
        const pathB = b.path.split('/').map(p => p.padStart(10, '0')).join('/');
        return pathA.localeCompare(pathB);
    });

    // 按模块分组
    const modules = {};
    articles.forEach(article => {
        if (!modules[article.module]) {
            modules[article.module] = [];
        }
        modules[article.module].push({
            num: article.num,
            title: article.title,
            path: article.path
        });
    });

    const index = {
        title: path.basename(targetDir),
        path: targetDir,
        totalArticles: articles.length,
        modules: Object.entries(modules).map(([name, articles], idx) => ({
            id: `module-${idx}`,
            name: name,
            icon: getIconForModule(name),
            articles: articles
        }))
    };

    return index;
}

function getIconForModule(name) {
    const icons = {
        'agent': '🤖', '架构': '🏛️', 'rag': '🔍', '检索': '🔍',
        '工具': '🔧', 'function': '🔧', 'multi': '🤝', '多': '🤝',
        'memory': '🧠', '记忆': '🧠', 'planning': '🧩', '规划': '🧩',
        'reasoning': '🧩', '推理': '🧩', 'prompt': '✍️', '提示': '✍️',
        'evaluation': '📊', '评估': '📊', 'safety': '🛡️', '安全': '🛡️',
        'production': '🚀', '生产': '🚀', 'deploy': '🚀', '部署': '🚀',
        'framework': '🧰', '框架': '🧰'
    };

    const lower = name.toLowerCase();
    for (const [key, icon] of Object.entries(icons)) {
        if (lower.includes(key)) return icon;
    }
    return '📁';
}

// 主程序
const targetDir = process.argv[2] || process.cwd();
const index = buildIndex(targetDir);

// 输出到 index.json
fs.writeFileSync(
    path.join(targetDir, 'wiki-index.json'),
    JSON.stringify(index, null, 2),
    'utf-8'
);

console.log(`✅ 已生成 wiki-index.json`);
console.log(`📚 共 ${index.totalArticles} 篇文章`);
console.log(`📂 ${index.modules.length} 个模块`);
console.log(`\n运行: python3 -m http.server 8000`);
console.log(`然后访问: http://localhost:8000/wiki-auto.html`);
