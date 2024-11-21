<script setup>
import {computed} from 'vue'
import {data} from '../utils/notes.data.ts'

console.log(data, 'data');
const {recentPosts} = data

</script>

<template>
  <h2 class="title">最近更新</h2>
  <div class="box">
    <div v-for="(item, index) in recentPosts" :key="item.url"
         class="item">
      <a v-text="item.title" :href="item.url" class="item_title">
      </a>
      <div class="item_abstract">
        {{ item.abstract }}
        <a :href="item.url" class="item_icon">阅读全文</a>
      </div>
      <div class="item_bottom">
        <div>
          📌
          <div class="linkCard" v-for="(tag,i) in item.tags" :key="i">
            <a  class="cursor-pointer hover:text-[var(--vp-c-brand)]"
                :href="`/tags?tag=${tag}`">
              <span>{{ tag }}</span>
            </a>
          </div>
        </div>

        <div  class="">
          🗓 {{item.date.string}}
        </div>
      </div>
    </div>
  </div>
</template>

<style scoped lang="scss">
.title {

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
    border-radius: 8px;

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
      border-radius: 3px;
      padding: 2px 5px;
      background-color: #ffc402;
      border-color: #ffc402;
      color: white;
      font-weight: 400;
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


