import { defineConfig } from 'vitepress';

// 使用 async function 以支持异步导入
export default async () => {
  // 动态引入 sidebar.mjs
  const { sidebar } = await import('./sidebar.mjs');
  return defineConfig({
    base:"/tvbcPress/",
    title: "埋堆堆",
    description: "A VitePress Site",
    server: {

    },
    themeConfig: {
      // https://vitepress.dev/reference/default-theme-config
      nav: [
        { text: '主页', link: '/' },
        // { text: 'Examples', link: '/markdown-examples' }
      ],
      search: {
        provider: 'local'
      },
      // 使用动态引入的 sidebar
      sidebar,

      socialLinks: [
        { icon: 'github', link: 'https://github.com/vuejs/vitepress' }
      ]
    }
  });
};
