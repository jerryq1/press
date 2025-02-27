<script setup>
import {computed} from 'vue'
import {data} from '../utils/notes.data.ts'

console.log(data, 'data');
const {recentPosts} = data
import { useRouter } from 'vitepress'

const router = useRouter()
const navigate = (path) => {
  router.go(path) // 使用 VitePress 内置路由跳转
}

</script>

<template>
  <h2 class="title">最近更新</h2>
  <div class="box">
    <div v-for="(item, index) in recentPosts" :key="item.url"
         class="item" @click="() => navigate(`/press${item.url}`)">

      <span v-text="item.title" class="rainbow-rootText"
            style="color: transparent;font-weight: bolder;font-size: 20px;">
      </span>
        <div class="item_abstract">
          {{ item.abstract }}
          <span class="item_icon">阅读全文</span>
        </div>
        <div class="item_bottom">
          <div>
            📌
            <div class="linkCard" v-for="(tag,i) in item.tags" :key="i">
              <a class="cursor-pointer hover:text-[var(--vp-c-brand)]"
                    @click.stop="() => navigate(`/press/tags?tag=${tag}`)">
                <span>{{ tag }}</span>
              </a>
            </div>
          </div>

          <div class="">
            🗓 {{ item.date.string }}
          </div>
        </div>
    </div>
  </div>
</template>

<style scoped lang="scss">
.title {
  border-top: none !important;
}

.box {
  display: flex;
  flex-wrap: wrap; /* 允许换行 */
  gap: 20px; /* 行列之间的间隔 */

  .item {
    flex: 1 1 calc(50% - 10px); /* 每列占 50% 宽度，减去间隔 */
    max-width: calc(50% - 10px);
    box-sizing: border-box;
    padding: 20px;
    //background-color: lightblue;
    text-align: left;
    //box-shadow: 0 4px 16px rgba(0, 0, 0, 0.12);
    border-radius: 8px; /* 圆角增强柔和感 */
    transition: all 0.3s ease-in-out;
    cursor: pointer;

    &:hover {
      transform: scale(1.05);
      box-shadow: 0 8px 24px rgba(0, 0, 0, 0.16);
      .dark & {
        box-shadow: var(--item-shadow-dark);
      }
    }

    .item_title {
      font-size: 24px;
      text-align: left;
      margin-bottom: 5px;
    }

    .item_abstract {
      margin-top: 20px;
      font-size: 15px;

    }

    .item_icon {
      font-size: 12px;
      line-height: 1.5;
      border-radius: 5px;
      padding: 3px 8px;
      position: relative;
      top: -1px;
      //background-color: #FFA630;
      margin-left: 10px;
      border: 1px solid #35BBFF;
      color: #35BBFF;
      font-weight: bolder;
      text-align: center;
      vertical-align: middle;
    }

    .item_bottom {
      display: flex;
      justify-content: space-between;
      align-items: center;
      margin-top: 10px;

      .linkCard {
        display: inline-block;
        margin-right: 5px;
        background-color: var(--vp-c-bg-soft);
        border-radius: 8px;
        padding: 0px 16px;
        transition: color 0.5s, background-color 0.5s;
        /* 卡片鼠标悬停 */
        &:hover {
          background-color: var(--vp-c-yellow-soft);
        }

        /* 链接样式 */
        a {
          color: #35BBFF;
          display: flex;
          align-items: center;
        }
      }


    }
  }
}
</style>


