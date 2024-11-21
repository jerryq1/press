---
title: Android合规检查工具-让违规隐私调用无处遁形
date: 2024-11-21
abstract: Android 隐私合规检查工具，让违规隐私调用无所遁形
tags:
- 客户端
- 2024
- 解决方案
---


##工具的目标
检查应用合规，让所有的隐私调用无所遁形

## 如何引入

### Step 1. 添加 `埋堆堆maven`
```
allprojects {
	repositories {
		...
	//埋堆堆maven仓库
        maven {
            allowInsecureProtocol =true
            url 'http://nexus.mddcloud.com.cn/repository/maven-releases' }
	}
}
```
### Step 2. 添加 `Gradle` 依赖
```
dependencies {
    ...
    implementation 'com.mdd.android.sdk:miit_checker:1.0.2'
    implementation("top.canyie.pine:core:0.2.6")
}
```

### Step 3 添加混淆或关闭APP的混淆
```
#添加合规检测相关的混淆代码
-keep class com.mdd.miit_checker.** { *; }
-keep class top.canyie.pine.** { *; }
-keepnames class top.canyie.pine.** { *; }
-keepclassmembers class top.canyie.pine.**{ *; }
```
## 如何使用
- `需求一` 检查APP内是否存在不合规的方法调用
  > 检查MIITRuleChecker内置的不合规的方法，具体可见下方方法列表
  ```kotlin
  //设置日志文件的路径 adb拉取日志： adb pull /sdcard/Android/data/com.tvbc.maiduidui/files/mdd/result/MIITRuleCheckerLog.txt /Users/zhangbing/Downloads/


  MIITRuleChecker.setLogPath(context.getExternalFilesDir(null).toString() + "/mdd/result");
  MIITRuleChecker.checkDefaults()
  ```
  > 如果内置的方法不满足当前需求，可自定义方法添加到list中进行检查；<br/>
  > 比如新增一个 MainActivity 的 onCreate 方法的调用检查；<br/>
  ```kotlin
  val list = MIITMethods.getDefaultMethods()
  list.add(MainActivity::class.java.getDeclaredMethod("onCreate" , Bundle::class.java))
  MIITRuleChecker.check(list)
  ```
  当然，如果你想检查多个内置方法外的方法，只需要创建一个新的集合，往集合里放你想检查的方法`member`,然后传入 `MIITRuleChecker.check()`内即可。

  `log`打印如下所示：

![Android 合规检查 1.png](..%2Fpublic%2Fbase%2FAndroid%20%E5%90%88%E8%A7%84%E6%A3%80%E6%9F%A5%201.png)

- `需求二` 检查指定方法调用并查看调用栈堆
    ```kotlin
    //查看 WifiInfo class 内 getMacAddress 的调用栈堆
   MIITRuleChecker.check(MIITMethods.WifiInfo.getMacAddress)
  ```

- `需求三` 检查一定时间内指定方法调用次数统计
  ```java
   //多个方法统计 （deadline 为从方法调用开始到多少毫秒后截至统计）
      ArrayList<Member> list = MIITMethods.getDefaultMethods();

        try {
            MIITRuleChecker.check(list);
            //单个方法统计（deadline 为从方法调用开始到多少毫秒后截至统计）
            MIITMethodCountChecker.startCount(11120L,list);
        } catch (Exception e) {

        }
  ```
  `log`打印如下所示：
![Android 合规检查 2.png](..%2Fpublic%2Fbase%2FAndroid%20%E5%90%88%E8%A7%84%E6%A3%80%E6%9F%A5%202.png)
## 切记
 检查完成并完成整改后务必移除方法 miit-rule-checker 库内的所有方法调用，将库一起移除最好

## 内置方法表
 内置常量 | 对应的系统方法 | 备注
 ------------ | ------------- | -------------
 `MIITMethods.WifiInfo.getMacAddress` | `android.net.wifi.WifiInfo.getMacAddress()` | 获取MAC地址
 `MIITMethods.WifiInfo.getIpAddress` | `android.net.wifi.WifiInfo.getIpAddress()` | 获取IP地址
 `MIITMethods.LocationManager.getLastKnownLocation` | `android.location.LocationManager.getLastKnownLocation(String)` | 获取上次定位的地址
 `MIITMethods.LocationManager.requestLocationUpdates` | `android.location.LocationManager.requestLocationUpdates(String,Long,Float,LocationListener)` |
 `MIITMethods.NetworkInterface.getHardwareAddress` | `java.net.NetworkInterface.getHardwareAddress()` | 获取主机地址
 `MIITMethods.ApplicationPackageManager.getInstalledPackages` | `android.app.ApplicationPackageManager.getInstalledPackages(Int)` | 获取已安装的应用
 `MIITMethods.ApplicationPackageManager.getInstalledApplications` | `android.app.ApplicationPackageManager.getInstalledApplications(Int)` | 获取已安装的应用
 `MIITMethods.ApplicationPackageManager.getInstallerPackageName` | `android.app.ApplicationPackageManager.getInstallerPackageName(String)` | 获取应用安装来源
 `MIITMethods.ApplicationPackageManager.getPackageInfo` | `android.app.ApplicationPackageManager.getPackageInfo(String，Int)` | 获取应用信息
 `MIITMethods.PackageManager.getInstalledPackages` | `android.content.pm.PackageManager.getInstalledPackages(Int)` | 获取已安装的应用
 `MIITMethods.PackageManager.getInstalledApplications` | `android.content.pm.PackageManager.getInstalledApplications(Int)` | 获取已安装的应用
 `MIITMethods.PackageManager.getInstallerPackageName` | `android.content.pm.PackageManager.getInstallerPackageName(String)` | 获取应用安装来源
 `MIITMethods.PackageManager.getPackageInfo` | `android.content.pm.PackageManager.getPackageInfo(String，Int)` | 获取应用信息
 `MIITMethods.PackageManager.getPackageInfo1` | `android.content.pm.PackageManager.getPackageInfo(String，PackageInfoFlags)` | 获取应用信息（版本号大于33）
 `MIITMethods.PackageManager.getPackageInfo2` | `android.content.pm.PackageManager.getPackageInfo(VersionedPackage，Int)` | 获取应用信息（版本号大于26）
 `MIITMethods.PackageManager.getPackageInfo3` | `android.content.pm.PackageManager.getPackageInfo(VersionedPackage，PackageInfoFlags)` | 获取应用信息（版本号大于33）
 `MIITMethods.Secure.getString` | `android.provider.Settings.Secure.getString(ContentResolver，String)` | 获取androidId
 `MIITMethods.TelephonyManager.getDeviceId` | `android.telephony.TelephonyManager.getDeviceId()` | 获取 DeviceId
 `MIITMethods.TelephonyManager.getDeviceIdWithInt` | `android.telephony.TelephonyManager.getDeviceId(Int)` | 获取 DeviceId
 `MIITMethods.TelephonyManager.getImei` | `android.telephony.TelephonyManager.getImei()` | 获取 Imei
 `MIITMethods.TelephonyManager.getImeiWithInt` | `android.telephony.TelephonyManager.getImei(Int)` | 获取 Imei
 `MIITMethods.TelephonyManager.getSubscriberId` | `android.telephony.TelephonyManager.getSubscriberId()` | 获取 SubscriberId

# 相关文章
- [工业和信息化部关于开展纵深推进APP侵害用户权益专项整治行动的通知](https://www.gov.cn/zhengce/zhengceku/2020-08/02/content_5531975.htm)
- [工业和信息化部关于进一步提升移动互联网应用服务能力的通知](https://www.gov.cn/zhengce/zhengceku/2023-03/02/content_5744106.htm)
- [APP合规政策解读爽文](https://juejin.cn/post/7250507911201226812)

## 鸣谢
- [Pine](https://github.com/canyie/pine/blob/master/README_cn.md)



















