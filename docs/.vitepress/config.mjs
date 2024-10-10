import { defineConfig } from 'vitepress';

// 使用 async function 以支持异步导入
export default async () => {
  // 动态引入 sidebar.mjs
  const { sidebar } = await import('./sidebar.mjs');
  return defineConfig({
    base:"/",
    title: "埋堆堆",
    siteTitle: 'tvbcPress',
    description: "mdd",
    outDir:'../public',
    appearance:'dark',
    head: [
      ['link',{ rel: 'icon', href: '/headIcon.png'}],
    ],
    //markdown配置
    markdown: {
      image: {
        // 开启图片懒加载
        lazyLoading: true
      },
    },
    server: {

    },
    themeConfig: {
      // https://vitepress.dev/reference/default-theme-config
      logo: '/logo.svg',
      nav: [
        // { text: '主页', link: '/' },
        // { text: 'Examples', link: '/markdown-examples' }
      ],
      search: {
        provider: 'local'
      },
      // 使用动态引入的 sidebar
      sidebar,
      socialLinks: [
        // { icon: 'github', link: 'https://github.com/vuejs/vitepress' }
      ],

      lastUpdated: {
        text: '更新时间',
        formatOptions: {
          dateStyle: 'full',
          timeStyle: 'medium'
        }
      },
      docFooter: {
        prev: '上一页',
        next: '下一页',
      },
      //编辑本页
      editLink: {
        pattern: 'https://git.mddcloud.com.cn/xuzhanhong/tvbcpress/-/tree/main/docs/:path', // 改成自己的仓库
        text: '在GitLab编辑本页'
      },
    }
  });
};
