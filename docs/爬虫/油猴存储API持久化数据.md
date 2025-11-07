---
title: 油猴存储API持久化数据
date: 2025-11-07
abstract: 利用chrome插件进行的爬虫作业,利用JS截获接口数据
tags:
- 油猴脚本
- 爬虫
---

# 存储API-持久化数据

用于在用户浏览器中保存和读取数据，实现配置持久化、记忆用户操作等。
最近我就遇到这么一个项目场景,我需要收集多个网址的爬虫数据,这里面的网页同一个域名或者域名都会重定向,这就导致一个问题,脚本会初始化,这使得我们无法把数据很好的保存下来(我希望的效果是收集完所有的数据再去统一处理)

## 场景
* 单次脚本涉及多个网页的数据存储

## 痛点
* 跳转页面不是同一域名会导致脚本初始化,数据无法持久化保存

## 解决方法
* GM_setValue(key, value): 存储一个值。value 可以是字符串、数字、布尔值或这些类型组成的对象/数组。

* GM_getValue(key, defaultValue): 读取一个值。如果 key 不存在，则返回 defaultValue。

* GM_deleteValue(key): 删除一个键值对。

* GM_listValues(): 列出所有已存储的键名。



## 实战代码展示
```js
// 获取已存储的数据
let collectedData = GM_getValue('collectedData', []); //收集的网页数据数组
let trimUrlsgm = GM_getValue('trimUrls');   //需要收集的目标网页地址



// 根据当前页面收集数据
let pageData = null;

// 在A页面收集数据
pageData = {
  page: collectedData.length,
  url: currentUrl,
  timestamp: new Date().toISOString(),
  // 添加你实际要收集的数据
  excelTitle,
  title,
  content,
  likeCount,
  collectCount,
  chatCount
  // 其他数据...
};

// 保存数据 
collectedData.push(pageData);
GM_setValue('collectedData', collectedData);
$("#tips1").text(collectedData.length)

if(collectedData.length >= trimUrlsgm.length){
  console.log(collectedData,'结果')
  console.log('收集完毕')
  $("#control_container_content").text('数据已收集完毕,请检查');
  return
}
// 跳转到B页面
window.location.href = trimUrlsgm[collectedData.length];
```
