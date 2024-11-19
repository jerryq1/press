/* .vitepress/theme/index.ts */
import DefaultTheme from 'vitepress/theme'
import './style/index.css'
import mediumZoom from 'medium-zoom';
import { h,onMounted, watch, nextTick } from 'vue';
import { useRoute,useData } from 'vitepress';
import Archive from "./components/Archive.vue";

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
    Layout: () => {
        const props: Record<string, any> = {};
        // 获取 frontmatter
        const { frontmatter } = useData();

        /* 添加自定义 class */
        if (frontmatter.value?.layoutClass) {
            props.class = frontmatter.value.layoutClass;
        }

        return h(DefaultTheme.Layout, props);
    },
    enhanceApp({ app, router, siteData }) {
        // 注册组件
        // app.component("MNavLinks", MNavLinks);
        // app.component("Navlink", Navlink);
        app.component("Archive", Archive); // 全局注册归档组件
    },
}
