import fs from 'fs';
import path from 'path';
import { fileURLToPath } from 'url';

// 将 URL 转换为文件路径格式
const __filename = fileURLToPath(import.meta.url);
const __dirname = path.dirname(__filename);

// 获取目录中的 Markdown 文件和文件夹，包括任意层级的子目录
function getSidebarItems(dir, basePath = '') {
  const files = fs.readdirSync(dir);
  const items = [];

  files.forEach((file) => {
    const fullPath = path.join(dir, file);
    const stat = fs.statSync(fullPath);

    if (stat.isDirectory()) {
      // 递归处理子目录，支持任意层级
      items.push({
        text: file, // 文件夹名称作为 text
        collapsed: true,
        items: getSidebarItems(fullPath, path.join(basePath, file)), // 子目录中的 items
      });
    } else if (file.endsWith('.md')) {
      // 将 Markdown 文件添加为链接
      const name = file.replace('.md', '');
      items.push({
        text: name, // 文件名作为 text
        link: path.join(basePath, name), // 路径作为 link
      });
    }
  });

  return items;
}

// 生成顶级目录中的所有父级文件夹的 sidebar 项目
function generateSidebarForTopLevelFolders(rootDir) {
  const sidebar = [];
  const folders = fs.readdirSync(rootDir);

  folders.forEach((folder) => {
    const fullPath = path.join(rootDir, folder);
    const stat = fs.statSync(fullPath);

    // 忽略 .vitepress 文件夹
    if (folder === '.vitepress') return;
    if (folder === 'public') return;

    if (stat.isDirectory()) {
      // 检查顶级目录中的每个文件夹，添加到 sidebar 配置
      sidebar.push({
        text: folder, // 父级文件夹名称
        items: getSidebarItems(fullPath, `/${folder}`), // 子目录和文件的 items
      });
    }
  });

  return sidebar;
}

// 动态生成 sidebar 配置，遍历顶级目录中的所有文件夹
export const sidebar = generateSidebarForTopLevelFolders(path.resolve(__dirname, '../'));
