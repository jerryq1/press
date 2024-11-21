<script setup>
import {data} from '../utils/notes.data.ts'
import { useRouter} from "vitepress";

console.log(data, 'data');
const {tagMap} = data
const tagsList = Object.keys(tagMap)
const router = useRouter()
const routerTo = (name) => {
  router.go(`/tags?tag=${name}`) // 跳转到 /about 页面
}


</script>

<template>
  <div class="box">
    <div class="title">📌 标签</div>
    <div class="box_inner">
      <span v-for="(item) in tagsList" :key="item" @click.stop="routerTo(item)" :class="['item']">
      <span class="rainbow-text">{{ item }}</span>
    </span>
    </div>
  </div>
</template>

<style scoped lang="scss">


.box {
  padding: 10px;
  background: var(--vp-c-bg-sidebar);
  border-radius: 10px;
  box-shadow: 0 4px 12px #0000004d;
  transition: background-color .3s ease, box-shadow .3s ease;
  margin-bottom: 20px;

  .title {
    margin-bottom: 10px;
  }

  .box_inner {
    //display: flex;
    //justify-content: flex-start;
    //flex-direction: column;
    //align-items: center;
    //flex-wrap: wrap;
    text-align: center;

    .item {
      cursor: pointer;
      border: 1px solid transparent;
      display: inline-block;
      margin-right: 5px;
      margin-bottom: 5px;
      background-color: var(--vp-c-bg-soft);
      border-radius: 8px;
      padding: 0 16px;
      transition: color 0.5s, background-color 0.5s;
      /* 卡片鼠标悬停 */
      &:hover {
        background-color: var(--vp-c-yellow-soft);
      }

    }
  }

}
</style>


