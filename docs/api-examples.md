---
title: 快速上手
sidebar: false
---

# 快速上手

## 项目下载
通过git clone到git lab下载项目
```js
git clone http://git.mddcloud.com.cn/xuzhanhong/tvbcpress.git
```
## 查看目录结构
![图片](/base/pic11.png)
我们写文章直接在docs文件夹下进行添加对应的文件夹以及markdown文件即可(.md)

`ps:可以建立最多6层的子目录`:父目录->一层子目录->二层子目录->三层子目录->四层子目录...


## 推送到gitLab远程分支
添加完文章之后推送到远程分支即可(本地分支跟远程分支都为main分支,不需要另外新建分支)
```js
git add .
git commit -m "xxx"  
git push 
```

## 本地启动项目(非必要)
当想要在本地启动项目查看对应文章在页面的效果需要进行以下操作
* [Node.js](https://nodejs.org/zh-cn)安装18及以上版本
* 执行命令行启动项目
```js
npm install
npm run docs:dev
```

## 提示
* 添加图片,如果在文章内部需要添加图片
```js
//本地存放
//把图片存放到docs/public下面,可以新建文件夹
![示例图片](/base/xxx.png)

//远程图片
![示例图片](https://example.com/image.png)

```


* 一般出现markdown格式问题导致项目无法正常构建可以交给chatGPT去修正然后再提交


* 为了更好的写markdown文章,可以在ide上面添加markdown预览插件,这样就可以实时查看文章的效果

![img_3.png](/base/pic3.png)

![img_4.png](/base/pic4.png)

* 同时为了照顾不习惯用markdown写文章的同学,可以使用[notion](https://www.notion.so/)工具利用上面的富文本工具去写文章,然后导出.md文件丢进来项目对应的位置即可

![img_2.png](/base/pic2.png)

* 若是简单的文章编辑,可以点击文章下方在GitLab编辑此页,即可跳转到gitLab该内容页面执行修改后再GitLab提交即可

![img_6.png](/base/pic6.png)



