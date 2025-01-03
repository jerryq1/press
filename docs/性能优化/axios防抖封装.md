---
title: axios防抖封装
date: 2025-01-03
abstract: 对axios进行全局的防抖封装,防止项目局部短时间触发多次请求
tags:
- axios
- 防抖
---

# axios防抖封装

## 改造动机:
此前当需要对某个业务异步接口做防抖处理都需要单独处理,较为麻烦,而现在在封装层处理则可以把所有的接口都做防抖处理

## 具体目标:
 1.当在短时间内高频触发同一个请求时会仅请求一个

 2.待此请求成功返回信息时(无论结果如何)才会触发第二次

## 具体代码
```javascript
//debouce_http.js
import axios from 'axios'
import {
  Toast
} from 'vant'
import {
  PRIVATEKEY
} from '@/common/config'
import {
  getObjKeySort
} from '@/common/tool'

var md5 = require('js-md5')

let BASE_URL = process.env.VUE_APP_ACTIVITY_BASEURL

var service = axios.create({
  baseURL: BASE_URL, // api的base_url
  timeout: 15000, // 超时时间
  retry: 3, //请求次数
  retryDelay: 1000, //请求间隙
  withCredentials: false,
  headers: {
    'Content-Type': 'application/json;charset=UTF-8',
  },
})


// 发布订阅
class EventEmitter {
  constructor() {
    this.event = {}
  }

  on(type, cbres, cbrej) {
    if (!this.event[type]) {
      this.event[type] = [[cbres, cbrej]]
    } else {
      this.event[type].push([cbres, cbrej])
    }
  }

  emit(type, res, ansType) {
    if (!this.event[type]) return
    else {
      this.event[type].forEach(cbArr => {
        if (ansType === 'resolve') {
          cbArr[0](res)
        } else {
          cbArr[1](res)
        }
      });
    }
  }
}


// 根据请求生成对应的key
function generateReqKey(config, hash) {
  const {method, url, params, data} = config;
  return [method, url, hash].join("&");
}

// 存储已发送但未响应的请求
const pendingRequest = new Set();
// 发布订阅容器
const ev = new EventEmitter()

//配置请求头
// service.defaults.headers.put['Content-Type'] = 'application/json;charset=UTF-8'

// 添加请求拦截器
service.interceptors.request.use(
  async (config) => {
    // 签名封装
    var timestamp = new Date().getTime()
    var datastr = getObjKeySort(config.data).sortObjStr
    var webToken = window.localStorage.getItem('webToken');
    var signStr = ''
    if (webToken) {
      signStr = `webToken:${webToken}|time:${timestamp}|privateKey:${PRIVATEKEY}|data:${datastr}`
    } else {
      signStr = `time:${timestamp}|privateKey:${PRIVATEKEY}|data:${datastr}`
    }
    var sign = md5(signStr)

    var params = {
      time: timestamp,
      sign: sign,
      data: config.data,
    }
    if (webToken) {
      params.webToken = webToken
    }

    let hash = location.hash
    if (config.method === 'get') {
      config.params = params;
    } else {
      config.data = params;
    }    // 生成请求Key
    let reqKey = generateReqKey(config, hash)
    console.log(reqKey, 'reqKey');
    if (pendingRequest.has(reqKey)) {
      console.log('挂起了');
      // 如果是相同请求,在这里将请求挂起，通过发布订阅来为该请求返回结果
      // 这里需注意，拿到结果后，无论成功与否，都需要return Promise.reject()来中断这次请求，否则请求会正常发送至服务器
      let res = null
      try {
        // 接口成功响应
        res = await new Promise((resolve, reject) => {
          ev.on(reqKey, resolve, reject)
        })
        return Promise.reject({
          type: 'limiteResSuccess',
          val: res
        })
      } catch (limitFunErr) {
        // 接口报错
        return Promise.reject({
          type: 'limiteResError',
          val: limitFunErr
        })
      }
    } else {
      // 将请求的key保存在config
      config.pendKey = reqKey
      pendingRequest.add(reqKey)
      console.log('请求添加到 pendingRequest:',pendingRequest, reqKey);
    }
    return config
  },
  function (error) {
    Toast({
      message: '网络异常，请稍后重试!',
      duration: 1500,
      forbidClick: true,
    })
    return Promise.reject(error)
  }
)

// 添加响应拦截器
service.interceptors.response.use(
  function (response) {
    // 如果http状态码正常，则直接返回数据
    // console.log(response)
    // 如果不需要除了data之外的数据，可以直接 return response.data
    handleSuccessResponse_limit(response)
    return response && response.data? response.data : response;
  },
  function (error) {
    handleErrorResponse_limit(error)
    // 确保无论如何都删除 pending 请求
    const reqKey = error.config && error.config.pendKey;
    if (reqKey && pendingRequest.has(reqKey)) {
      pendingRequest.delete(reqKey);
    }
    return Promise.reject(error);
  }
)

// 接口响应成功
function handleSuccessResponse_limit(response) {
  const reqKey = response.config.pendKey
  if (pendingRequest.has(reqKey)) {
    let x = null
    try {
      x = JSON.parse(JSON.stringify(response))
    } catch (e) {
      x = response
    }
    pendingRequest.delete(reqKey)
    ev.emit(reqKey, x, 'resolve')
    delete ev.reqKey
  }
}

// 接口走失败响应
function handleErrorResponse_limit(error) {

  const status = error.response && error.response.status
  if (error.message === 'Network Error') {
    Toast({
      message: '网络连接超时',
      duration: 1500,
      forbidClick: true,
    })
    return Promise.reject(error)
  }
  if (status == 504) {
    Toast({
      message: '服务器被吃了⊙﹏⊙∥!',
      duration: 1500,
      forbidClick: true,
    })
  } else if (status == 404) {
    Toast({
      message: '请求不存在⊙﹏⊙∥!',
      duration: 1500,
      forbidClick: true,
    })
  } else if (status == 403) {
    Toast({
      message: '拒绝访问!',
      duration: 1500,
      forbidClick: true,
    })
  } else if (error.type && error.type === 'limiteResSuccess') {
    console.log('limiteResSuccess',error.val);
    return Promise.resolve(error.val)
  } else if (error.type && error.type === 'limiteResError') {
    console.log('limiteResError');
    return Promise.reject(error.val);
  } else {
    const reqKey = error.config.pendKey
    if (pendingRequest.has(reqKey)) {
      let x = null
      try {
        x = JSON.parse(JSON.stringify(error))
      } catch (e) {
        x = error
      }
      pendingRequest.delete(reqKey)
      ev.emit(reqKey, x, 'reject')
      delete ev.reqKey
    }
  }
  return Promise.reject(error);
}

// 封装axios的get请求
export function get(url, params) {
  return new Promise((resolve, reject) => {
    service
   .get(url, params)
   .then((response) => {
      // resolve(response.data);
      resolve(response)
    })
   .catch((error) => {
      reject(error)
    })
  })
}

// 封装axios的post请求
export function post(url, params) {
  return new Promise((resolve, reject) => {
    service
   .post(url, params)
   .then((response) => {
      // resolve(response.data);
      console.log(response,'response');
      resolve(response)
    })
   .catch((error) => {
      reject(error)
    })
  })
}

// 封装axios的put请求
export function put(url, params) {
  return new Promise((resolve, reject) => {
    service
   .put(url, params)
   .then((response) => {
      // resolve(response.data);
      resolve(response)
    })
   .catch((error) => {
      reject(error)
    })
  })
}

```
## 参考文章
[前端接口防止重复请求实现方案](https://mp.weixin.qq.com/s/_VlNReaXtqnJKN0rNFWFlQ)
