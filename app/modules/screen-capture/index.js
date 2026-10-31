import { requireNativeModule } from 'expo-modules-core';

// 对应 ScreenCaptureModule.kt 中的 Name("ScreenCapture")
// 可用方法：
//   startCapture(): Promise<boolean>   发起系统屏幕录制授权弹窗并开始捕获
//   stopCapture(): void                停止屏幕捕获
//   isCapturing(): boolean             是否正在捕获
//   captureFrame(): Promise<string|null> 取最新一帧 JPEG base64
//   hasUsageAccess(): boolean          是否已开启“使用情况访问权限”
//   openUsageAccessSettings(): void    跳转系统设置
//   getForegroundApp(): Promise<{appName, packageName}|null> 当前前台应用
export default requireNativeModule('ScreenCapture');
