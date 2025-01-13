---
title: Android流畅性三板斧之帧率监控
date: 2024-01-25 22:01:04
tags: APM
category: APM
---

## 前言

Android 流畅性监控的三板斧，这里所指是【帧率的监控】，【卡顿监控】和【ANR 的监控】。之所以讲这三者放在一起是他们的联系比较密切。帧率的下降往往伴随着有卡顿，【过分卡顿】往往就会产生 ANR。

严谨的讲，帧率下降不一定会有卡顿（这里对卡顿是从技术角度定义在主线程执行了耗时任务），卡顿产生的原因还有其他因素导致，比如系统负载、CPU 繁忙等。关于卡顿的详细内容放在流畅性三板斧的第二篇。

【过分的卡顿】也不一定产生 ANR，卡顿但未触发 ANR 产生的条件就不会产生 ANR。关于 ANR 的详细内容我们放在三板斧系列文章的第三篇。

[**Android 流畅性三板斧之帧率监控**](https://drummor.github.io/2024/01/25/Android%E6%B5%81%E7%95%85%E6%80%A7%E4%B8%89%E6%9D%BF%E6%96%A7%E4%B9%8B%E5%B8%A7%E7%8E%87%E7%9B%91%E6%8E%A7/)

[**Android 流畅性三板斧之卡顿监控**](https://drummor.github.io/2024/01/25/Android%E6%B5%81%E7%95%85%E6%80%A7%E4%B8%89%E6%9D%BF%E6%96%A7%E4%B9%8B%E5%8D%A1%E9%A1%BF%E7%9B%91%E6%8E%A7/)

[**Android 流畅性三板斧之 ANR 监控与解决**](https://drummor.github.io/2024/01/25/Android%E6%B5%81%E7%95%85%E6%80%A7%E4%B8%89%E6%9D%BF%E6%96%A7%E4%B9%8BANR%E7%9B%91%E6%8E%A7%E4%B8%8E%E8%A7%A3%E5%86%B3/)

该篇我们从应用开发者的角度，探索在应用层监控帧率的四种方式。

温馨提示，本文涉及的实现的代码以上传至 github <https://github.com/drummor/GetHandsDirty>，结合代码食用更佳

## 1 什么是帧率

> 帧率（Frame rate）是以帧称为单位的[位图](https://baike.baidu.com/item/%E4%BD%8D%E5%9B%BE/1017781?fromModule=lemma_inlink)图像连续出现在显示器上的频率（速率)。

## 2 Android 中帧率的监控

线下开发我们可以使用开发者选项的帧率监控或者 `adb shell dumpsys gfxinfo packagename`进行监控针对性优化。这些方案不能带到线上。

惯常我们在 Android 里线下对帧率的监控主要依托 Choreographer,关于 Choreographer 不再赘述在其他的文章有比较全面的介绍可以看这两篇文章

- <https://juejin.cn/post/6844903818044375053>
- <https://juejin.cn/post/7209861267715637285>

## 3 简单监控帧率方案

利用 Choreographer 的 postcallback 方法接口轮询方式，能够对帧率进行统计。

![image.png](/images/apm_frame_rate_1706191161099.png)

`choreographer.postCallback()`内部是挂载了一个`CALLBACK_ANIMATION`类型的 callback。轮训方式往`choreographer`内添加 callback，相邻两个 callback 执行时间间隔即能粗略统计单帧的耗时。严谨的讲这不是单帧的耗时而是两个【半帧】拼凑的耗时。

代码示例如下。

```
class PoorFrameTracker {
    private var mLastFrameTime = -1L
    private var mFrameCount: Int = 0
    val calRate = 200 //ms
    fun startTrack() {
        mLastFrameTime = 0L
        mFrameCount = 0
        Choreographer.getInstance().postFrameCallback(object : FrameCallback {
            override fun doFrame(frameTimeNanos: Long) {
                if (mLastFrameTime == -1L) {
                    mLastFrameTime = frameTimeNanos
                }
                val diff = (frameTimeNanos - mLastFrameTime) / 1_000_000.0f
                if (diff > calRate) {
                    var fps = mFrameCount / diff * 1000
                    if (fps > 60) {fps = 60.0f}
                    //todo :统计
                    mFrameCount = 0
                    mLastFrameTime = -1
                } else {
                      mFrameCount++
                }
                Choreographer.getInstance().postFrameCallback(this);
            }
        })
    }
}
```

### 优点

- 简单快捷，无黑科技

### 缺点

- 无活动时，也会监控，无效信息会把帧率较低时给平均掉。
- 对应用带来不必要的负担。

## 4 帧率监控进化之一 hook Choreographer

针对章节三的方案，首先我们有两个主要的优化方向希望在主线程不活动的时候不进行帧率的检测

我们调用公开 api `Choreographer.postCallback()`时会触发垂直同步（这部分可以参考另一篇文章）。

```
 # choreographer
 private final class FrameDisplayEventReceiver extends DisplayEventReceiver
             implements Runnable {
        private long mTimestampNanos;
         @Override
         public void onVsync(long timestampNanos, long physicalDisplayId, int frame,
                 VsyncEventData vsyncEventData) {
                ...
                 mTimestampNanos = timestampNanos;
                 Message msg = Message.obtain(mHandler, this);
                 msg.setAsynchronous(true);
                 mHandler.sendMessageAtTime(msg, timestampNanos / TimeUtils.NANOS_PER_MS);
                  ...
         }
         @Override
         public void run() {
             mHavePendingVsync = false;
             doFrame(mTimestampNanos, mFrame, mLastVsyncEventData);
         }
     }
```

- 【采集每帧的开始】利用 Looper 中 Printer 采集 Message 的开始和结束。上段代码是`Choreographer`中的一段代码。当收到底层垂直同步信号的时,利用 Handler 机制 post 的一个 Runable，执行该帧的动作`doFrame()`。依次我们可以采集到每帧的开始和结束。

```
# Choreographer
private final CallbackQueue[] mCallbackQueues;
```

![image.png](/images/apm_frame_rate_1706191161453.png)

- 【过滤出每帧的执行动作】我们知道主线程中不单单执行每帧的动作，还会执行其他动作。如何过滤出执行的是每帧的动作。反射往 Choreographer 往里添加 callback 不触发垂直同步，同时在同步信号回调时，会调用我们传入的 callback，如果执行了传入的 callbacl 就可以标识该次执行动作是帧的执行动作。
- 【采集真实的垂直同步到达时间】反射拿到`mTimestampNanos`
- 结合以上，我们能够采集到每帧执行耗时，依次可以计算出准确的帧率。且比我们第一种方案要优雅很多。

```
  void doFrame(long frameTimeNanos, int frame, DisplayEventReceiver.VsyncEventData vsyncEventData) {
        ...
        final long frameIntervalNanos = vsyncEventData.frameInterval;
        doCallbacks(Choreographer.CALLBACK_INPUT, frameData, frameIntervalNanos);
        doCallbacks(Choreographer.CALLBACK_ANIMATION, frameData, frameIntervalNanos);
        doCallbacks(Choreographer.CALLBACK_INSETS_ANIMATION, frameData, frameIntervalNanos);
        doCallbacks(Choreographer.CALLBACK_TRAVERSAL, frameData, frameIntervalNanos);
        doCallbacks(Choreographer.CALLBACK_COMMIT, frameData, frameIntervalNanos);
        ...
    }
```

- 同时我们还可以通过反射的方式给 Chorographer 里 mCallbackQueues 添加不同的类型动作，采集不同类型动作的耗时。

**补充**

![image.png](/images/apm_frame_rate_1706191161989.png)

- 严格意义上，该方案统计的也不是真实的帧率，而是一帧所有耗时中在 UI Thread 执行部分的耗时，上图`doFrame`部分。其他线程和进程还会执行其他动作最终才能完成一帧的绘制。但对于我们应用层来说更关注监控`doFrame`，我们在应用开发层面大部分能够干预的也在`doFrame`这部分。

（方案思路 Matrix）

关于这个方案可查看： <https://github.com/drummor/GetHandsDirty>

## 5 帧率监控进化之二 滑动帧率

```
#View
    protected void onScrollChanged(int l, int t, int oldl, int oldt) {
        ...
        final AttachInfo ai = mAttachInfo;
        if (ai != null) {
            ai.mViewScrollChanged = true;
        }
      ...
    }
```

- View 里如果有滑动行为产生最终都会调用到`onScrollChanged()`,当该方法调用的时候，会将 mAttachInfo 的 mViewScrollChanged 值设为 true

```
#ViewRootImpl
    private boolean draw(boolean fullRedrawNeeded, boolean forceDraw) {
        ...
        if (mAttachInfo.mViewScrollChanged) {
            mAttachInfo.mViewScrollChanged = false;
            mAttachInfo.mTreeObserver.dispatchOnScrollChanged();
        }
    }
​
```

- 如上代码 ViewRootImpl 的 draw 方法会如果 check 到`mAttachInfo.mViewScrollChanged`值为 true 就会就会调用`ViewTreeObserver`的`dispatchOnScrollChanged()`方法，只要我们在`viewTreeObserver`设置监听，就能获取到界面是否正在滑动这一重要事件。

![image.png](/images/apm_frame_rate_1706191162204.png)

- 整个过程的如上图所示，我们收到滑动回调这一事件的时候，其实是 choreographer 的 doFrame()调用而来。

- 结合上面我们就可以在收到【滑动事件】的时候使用 Choreographer 的 postCallback 开始统计帧率。

- 什么时候结束呢？在没有【滑动信息】生成出来的时候看下面代码

  ```
     private var isScroll = false
      init {
          window.decorView.viewTreeObserver.addOnScrollChangedListener {
              //标识正在滑动
              isScroll = true
              //开始统计帧率        
              Choreographer.getInstance().postFrameCallback(FrameCallback())
          }
      }
  ​
     private inner class FrameCallback : Choreographer.FrameCallback {
          override fun doFrame(frameTimeNanos: Long) {
              if (isScroll) {
                  isScroll = false //重置滑动状态
                  if (lastFrameTime != 0L) {
                      val dropFrame =
                          (((frameTimeNanos - lastFrameTime) / 1000000f / 16.6667f) + 1f).toInt()
                      notifyListener(dropFrame)
                  }
                  lastFrameTime = frameTimeNanos
              } else {
                  lastFrameTime = 0
              }
          }
      }
  ```

  这样我们就实现了一个监控滑动帧率的方案，代码实现放在了 <https://github.com/drummor/GetHandsDirty>

（方案来自淘宝技术团队）

## 6 帧率监控进化 之三 官方方案

官方出手，官方在 Android N 以上新增了`Window.OnFrameMetricsAvailableListener`可以监听每帧的执行状态。包含总耗时，绘制耗时，布局耗时，动画耗时，测量耗时。依次我们可以计算出帧率。

```
  private val metricsAvailableListener =
        Window.OnFrameMetricsAvailableListener { window, frameMetrics, dropCountSinceLastInvocation ->
            val intent = frameMetrics?.getMetric(FrameMetrics.INTENDED_VSYNC_TIMESTAMP) ?: 0
            val vsync = frameMetrics?.getMetric(FrameMetrics.VSYNC_TIMESTAMP) ?: 0
            val animation = frameMetrics?.getMetric(FrameMetrics.ANIMATION_DURATION) ?: 0
            val vsyncTotal = frameMetrics?.getMetric(FrameMetrics.TOTAL_DURATION) ?: 0
            val measureCost = frameMetrics?.getMetric(FrameMetrics.LAYOUT_MEASURE_DURATION) ?: 0    
            //计算帧率
        }
​
 this.window.addOnFrameMetricsAvailableListener(//向window注册监听
                    metricsAvailableListener,
                    Handler(handlerThread.looper)
```

同时配合 Jetpack 的`FrameMetricsAggregator`的可以统计出帧耗时情况。

```
 private val frameMetricsAggregator = FrameMetricsAggregator()
 frameMetricsAggregator.add(this@FrameActivity)
 frameMetricsAggregator.metrics?.let {
                it[FrameMetricsAggregator.TOTAL_INDEX] //总耗时概况
                it[FrameMetricsAggregator.INPUT_INDEX] //输入事件耗时
                it[FrameMetricsAggregator.DRAW_INDEX]  //绘制事件耗时概况
            }
```

`FrameMetricsAggregator`内部存储比较有意思，是有一个 SparseIntArray 数组`SparseIntArray[] mMetrics = new SparseIntArray[LAST_INDEX + 1]`，存储各个阶段的耗时 SparseIntArray 的 key 为耗时，value 为该耗时的个数。

```
mMetrics[TOTAL_INDEX]:
{3=8, 4=13, 5=2, 6=44, 7=4, 15=1, 196=1, 198=1, 204=1, 209=1, 210=1, 233=1, 265=1}
```

如上这是每帧总耗时的分布，耗时 3ms 的有 8 个，耗时 4ms 的有 8 个

我们可以制定自己的标准，诸如单帧耗时<30ms 为优秀，单帧耗时>30ms 且<60ms 为正常，单帧耗时>60ms 且<200ms 为过高，单帧>200 为严重。

## 7 数据统计

首先有一个大的原则，帧耗时统计是在有渲染动作发生时统计，空闲状态不统计。

帧率的统计就是，渲染帧的数量除以有帧渲染发生动作时间得到。

另，每帧的耗时不尽相同，希望抓住主线，针对性的统计慢帧冻帧的数量以及占比。或者切割的更为精细，如 Matrix 里默认的把帧的耗时表现分为四个等级。

- 正常帧，<3\*16ms
- 中间帧，<9\*16ms
- 慢帧，<24\*16ms
- 冻帧，<42\*16ms

再有就是，如通过 adb shell dumpsys gfxinfo packagename 命令或者`FrameMetricsAggregator`里的统计方式，把相同耗时的帧进行合并。

帧的统计往往以 page（Activity）为维度，作为一个数据大盘数据。

## 8 其他

- 帧率真实一个笼统的指标，会存在单帧耗时很高，还是帧率平均下来很优秀，从数据上看问题不大，但是用户的感知会比较强烈。我们更需要做的找到那个隐藏着的【耗时高】的单帧；我们需要全面的对主线程里的执行任务进行全面的监控，也就是卡顿监控的范畴。
- 帧率只是统计【页面绘制】的概况，不能够全面反映主线程的耗时情况。主线程如果存在耗时动作，比如一个主线程的 Handler 的执行了一个>100ms 的任务，如果此时并没有绘制任务需要执行,此时的不一定帧率就会降低。
- 【warning!!】最后，已经困扰好几天，实际测试中发现，使用`Window.OnFrameMetricsAvailableListener`与 hook choreograoher 方案对比，`Window.OnFrameMetricsAvailableListener`有漏报的情况产生。这需要看 framework 源码进一步追查，有对这方面有研究的同学欢迎留言讨论。
- 本文涉及的实现的代码以上传至 github <https://github.com/drummor/GetHandsDirty>
