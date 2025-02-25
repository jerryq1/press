---
title: 前端导航
layout: doc
layoutClass: m-nav-layout
sidebar: false
prev: false
next: false
---

<style src="../../docs/.vitepress/theme/style/nav.css"></style>

<script setup>
import { NAV_DATA } from "../../docs/.vitepress/theme/utils/data"
</script>

# 我的导航
<MNavLinks v-for="{title, items} in NAV_DATA" :title="title" :items="items"/>

