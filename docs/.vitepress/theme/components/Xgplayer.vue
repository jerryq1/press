<template>
  <div :id="props.id" style="flex: auto"></div>
</template>

<script setup lang="ts">
import Player from 'xgplayer';
import "xgplayer/dist/index.min.css";
import {computed, onMounted} from 'vue'

interface propsType {
  url: string
  poster: string
  id: string
}

const props = withDefaults(defineProps<propsType>(), {
  url: '',
  poster: '',
  id: 'mse'
})


// 计算属性，根据环境动态改变 poster 路径
const computedUrl = computed(() => {
  if (import.meta.env.MODE === 'development') {
    return `../public${props.url}`;
  } else {
    return `/press${props.url}`;
  }
})


const computedPoster = computed(() => {
  if (import.meta.env.MODE === 'development') {
    return props.poster? `../public${props.poster}`:'';
  } else {
    return props.poster? `/press${props.poster}`:'';
  }
})


onMounted(() => {
  new Player({
    id: props.id, //占位id
    volume: 0, // 默认静音
    lang: "zh", //设置中文

    autoplay: false, //关闭自动播放
    // autoplayMuted: true,// 是否开启自动静音
    fluid: true,  // 流式布局，自动宽高比
    controls: true, //开启控制栏，设为false即隐藏
    leavePlayerTime: 0, //鼠标离开控制栏隐藏延时时间，默认3000ms
    download: true, //开启下载
    keyShortcut: true, //开启热键

    url: computedUrl.value, //传入的url
    poster: computedPoster.value, //传入的视频封面

    start: {
      isShowPause: true //暂停显示播放按钮
    }

  })

})

</script>

<style scoped>

</style>
