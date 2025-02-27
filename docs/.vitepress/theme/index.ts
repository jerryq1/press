/* .vitepress/theme/index.ts */
import DefaultTheme from 'vitepress/theme'
import giscusTalk from 'vitepress-plugin-comment-with-giscus';
import './style/index.css'
import './style/tailwind.css'
import './style/rainbowText.css'
import mediumZoom from 'medium-zoom';
import {h, onMounted, watch, nextTick} from 'vue';
import {useRoute, useData} from 'vitepress';
import Archive from "./components/Archive.vue";
import Tag from "./components/Tag.vue";
import NewList from "./components/NewList.vue";
import AsideOutlineAfter from "./components/AsideBottom.vue";
import MNavLinks from './components/MNavLinks.vue'

// @ts-ignore
import Xgplayer from "./components/Xgplayer.vue";

export default {
    extends: DefaultTheme,
    setup() {
        const route = useRoute();
        const initZoom = () => {
            // mediumZoom('[data-zoomable]', { background: 'var(--vp-c-bg)' }); // 默认
            mediumZoom('.main img', {background: 'var(--vp-c-bg)'}); // 不显式添加{data-zoomable}的情况下为所有图像启用此功能
        };
        const {frontmatter} = useData();
        // giscus配置
        giscusTalk({
                repo: 'jerryq1/press', //仓库
                repoId: 'R_kgDOM7pKVw', //仓库ID
                category: 'Announcements', // 讨论分类
                categoryId: 'DIC_kwDOM7pKV84CnYpu', //讨论分类ID
                mapping: 'pathname',
                inputPosition: 'bottom',
                lang: 'zh-CN',
            },
            {
                frontmatter, route
            },
            //默认值为true，表示已启用，此参数可以忽略；
            //如果为false，则表示未启用
            //您可以使用“comment:true”序言在页面上单独启用它
            true
        );

        onMounted(() => {
            initZoom();
        });
        watch(
            () => route.path,
            () => nextTick(() => initZoom())
        );

    },
    Layout() {
        const props: Record<string, any> = {}

        const {frontmatter} = useData();

        /* 添加自定义 class */
        if (frontmatter.value?.layoutClass) {
            props.class = frontmatter.value.layoutClass
        }
        return h(DefaultTheme.Layout, props, {
            'aside-bottom': () => h(AsideOutlineAfter)
        })
    },
    enhanceApp({app, router, siteData}) {
        // 注册组件
        app.component("NewList", NewList);
        app.component("Tag", Tag);
        app.component("Archive", Archive); // 全局注册归档组件
        app.component("Xgplayer", Xgplayer); // 全局注册归档组件
        app.component('MNavLinks', MNavLinks)
    },
}
