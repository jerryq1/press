import { defineConfig } from 'vitepress';

// 使用 async function 以支持异步导入
export default async () => {
  // 动态引入 sidebar.mjs
  const { sidebar } = await import('./sidebar.mjs');
  return defineConfig({
    base:"/press/",
    title: "Mr.j blog",
    siteTitle: 'press',
    description: "Mr.j",
    appearance:'dark',
    // appearance: "force-dark", // 强制深色主题
    head: [
      ['link',{ rel: 'icon', href: '/press/catIcon.png'}],
    ],
    //markdown配置
    markdown: {
      image: {
        // 开启图片懒加载
        lazyLoading: true
      },
    },
    outline: {
      // level: 'deep', // 显示2-4级标题
      level: [2,4], // 显示2-4级标题

    },
    server: {

    },
    themeConfig: {
      // https://vitepress.dev/reference/default-theme-config
      logo: '/bc.svg',
      nav: [
        { text: 'Home', link: '/' },
        { text: '标签', link: '/tags' },
        { text: '归档', link: '/archives' },
        {
          text: '🍉帮助',
          items: [
            { text: '新特性', link: '/newFunction' },
            { text: '快速上手', link: '/api-examples' },
            { text: 'markDown语法说明', link: '/markdown-examples' },
            // { text: '导航', link: '/nav/index' }
          ]
        },
      ],
      search: {
        provider: 'local'
      },
      // 使用动态引入的 sidebar
      sidebar,
      socialLinks: [
        { icon: 'github', link: 'https://github.com/jerryq1/press' },
        { icon: {svg:'<svg role="img" viewBox="0 0 24 24" xmlns="http://www.w3.org/2000/svg"><title>Juejin</title><path d="m12 14.316 7.454-5.88-2.022-1.625L12 11.1l-.004.003-5.432-4.288-2.02 1.624 7.452 5.88Zm0-7.247 2.89-2.298L12 2.453l-.004-.005-2.884 2.318 2.884 2.3Zm0 11.266-.005.002-9.975-7.87L0 12.088l.194.156 11.803 9.308 7.463-5.885L24 12.085l-2.023-1.624Z"/></svg>'}, link: 'https://juejin.cn/user/2277843825854957/posts' }
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
        pattern: 'https://github.com/jerryq1/press/blob/main/docs/:path', // 改成自己的仓库
        text: '在GitHug编辑本页'
      },
    }
  });
};
