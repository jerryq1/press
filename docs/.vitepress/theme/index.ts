/* .vitepress/theme/index.ts */
import DefaultTheme from 'vitepress/theme'
import './style/index.css'
import './style/tailwind.css'
import './style/rainbowText.css'
import mediumZoom from 'medium-zoom';
import { h,onMounted, watch, nextTick } from 'vue';
import { useRoute,useData } from 'vitepress';
import Archive from "./components/Archive.vue";
import Tag from "./components/Tag.vue";
import NewList from "./components/NewList.vue";
import AsideOutlineAfter from "./components/AsideBottom.vue";

export default {
    extends: DefaultTheme,
    setup() {
        const { frontmatter } = useData();
        const route = useRoute();
        const initZoom = () => {
            // mediumZoom('[data-zoomable]', { background: 'var(--vp-c-bg)' }); // 默认
            mediumZoom('.main img', { background: 'var(--vp-c-bg)' }); // 不显式添加{data-zoomable}的情况下为所有图像启用此功能
        };
        onMounted(() => {
            initZoom();
        });
        watch(
            () => route.path,
            () => nextTick(() => initZoom())
        );

    },
    Layout() {
        return h(DefaultTheme.Layout, null, {
            'aside-bottom': () => h(AsideOutlineAfter)
        })
    },
    enhanceApp({ app, router, siteData }) {
        // 注册组件
        app.component("NewList", NewList);
        app.component("Tag", Tag);
        app.component("Archive", Archive); // 全局注册归档组件
    },
}
