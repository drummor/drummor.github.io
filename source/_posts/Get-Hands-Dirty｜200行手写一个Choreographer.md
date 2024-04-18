---
title: Get Hands Dirty｜<200行手写一个Choreographer
date: 2024-01-26 11:03:37
tags:
category: basic
---

如果你嫌弃啰嗦可以直接看代码：<https://github.com/drummor/GetHandsDirty>

## 1 基本原理

简单看下Choreographer的原理，具体的可以看之前写的一篇文章<https://juejin.cn/post/6844903818044375053>

![image.png](/images/gh_choreographer_1706238159839.png)

基本的原理其实简单的讲就是两点：

-   使用`DisplayEventReceiver` 初始化监听、请求垂直信号、接收垂直信号。
-   收到垂直同步信号之后，执行设置的`callback`

## 2 Choreographer是线程内单例的

```
private val sThreadInstance = object : ThreadLocal<MiniChoreographer>() {
  override fun initialValue(): MiniChoreographer {
     val looper = Looper.myLooper()?: throw IllegalStateException("需要有Looper!")
     return MiniChoreographer(looper)
  }
}
​
fun getInstance(): MiniChoreographer {
  return sThreadInstance.get()
}
```

-   使用`ThreadLoacal`实现线程内的单例使用
-   `Choreographer`创建所在的需要`Looper`对象

## 3 模拟一个VSync信号

-   `DisplayEventReceiver`用以接受底层的诸如VSync信号等绘制相关的Event。

-   FrameDisplayEventReceiver 继承自`DisplayEventReceiver`;`Choreographer`内申请和监听绘制垂直信号需要使用`FrameDisplayEventReceiver`，而该api未对外开放只能模拟一个垂直信号。

-   模拟的方式就是开启一个子线程，子线程内部创建一个`Choreographer`，利用Choreographer的postFrameCallbackApi模拟申请垂直脉冲，执行其`callback`的回调模拟收到垂直信号。

-   听上去像套娃了😂，这里只是模拟垂直信号，“别人一开源我就遥遥领先”，客官莫急，先往后看，并不只是包别人的api。

    ```
    abstract class DisplayEventReceiver {
    ​
        private val lock: Object = Object()
        private var choreographer: Choreographer? = null
    ​
        init {//1
            Executors.newSingleThreadExecutor().submit {
                synchronized(lock) {
                    Looper.prepare()
                    choreographer = Choreographer.getInstance()
                    lock.notifyAll()
                }
                Looper.loop()
            }
        }
        abstract fun onVsync(frameTimeNanos: Long, frame: Int)
        fun scheduleVsyncLocked() {//2
            choreographer?.postFrameCallback {
                onVsync(it, 0)
            } ?: kotlin.run {
                synchronized(lock) {
                    if (choreographer == null) {
                        lock.wait() //doNothing
                    }
                    scheduleVsyncLocked()
                }
            }
        }
    }
    ```

    -   需要注意的是，在开启的线程里准备Looper

## 4 组织FrameCallback

通常收到垂直脉冲后，要执行已经注册了的`callbck`，这里我们先处理三种类型的。

-   Input类型：CALLBACK_INPUT
-   动画类型：CALLBACK_INSETS_ANIMATION
-   和绘制类型：CALLBACK_TRAVERSAL

![](/images/gh_choreographer_1706238159985.png)

每种类型存放在一个`CallbackQueue`，`CallbackQueue`一个数组里。`CallbackQueue`维护了一个`CallbackRecord`类型的单向链表。链表里的元素根据时间大小以此存放。

```
inner class CallbackRecord {
    var next: CallbackRecord? = null
    var dueTime: Long = 0
    var action: FrameCallback? = null//存放要执行的动作
    fun run(time: Long) {
        action?.doFrame(time)
    }
}
```

### 4.1 CallbackQueue

存和取的关键是维护链表元素的时间序。

#### 4.1.1 存callback

```
fun addCallbackLocked(dueTime: Long, action: FrameCallback) {
    val callback: CallbackRecord = obtainCallbackLocked(dueTime, action)
    var entry = mHead
    if (entry == null) {
        mHead = callback //如果当前为空直接将该recode设置为头
        return
    }
    if (dueTime < entry.dueTime) { //如果不为空且小于头部的时间，就将该record设置为头
        callback.next = entry
        mHead = callback
        return
    }
    while (entry?.next != null) {//依次往后找 直到找到不必起时间小的插入其中
        if (dueTime < entry.next!!.dueTime) {
            callback.next = entry.next
            break
        }
        entry = entry.next
    }
    entry?.next = callback
}
```

-   如果当head为空直接将该recode设置为头，返回。
-   如果不为空且小于头部的时间，就将该record设置为头返回。
-   否则依次往后找 直到找到不必起时间小的插入其中。

#### 4.1.2 取callback

```
//取出符合条件的callback
fun extractDueCallbacksLocked(now: Long): CallbackRecord? {
    val callbacks = mHead
    if ((callbacks?.dueTime ?: 0) > now) {//未找到比改时间小的直接返回
        return null
    }
    var last = callbacks
    var next = last?.next
    while (next != null) {
        if (next.dueTime > now) {
            last?.next = null
            break
        }
        last = next
        next = next.next
    }
    mHead = next
    return callbacks
}
```

## 5 处理回调

-   取出符合条的`callback`依次执行

    ```
    private fun doFrame(mTimestampNanos: Long, mFrame: Int) {
        if (mTimestampNanos < mLastFrameTimeNanos) {
            //垂直信号的时间小于已经处理过的最小时间了，申请监听一个脉冲
            scheduleFrameLocked()
            return
        }
        mLastFrameTimeNanos = mTimestampNanos
        //处理input事件
        doCallbacks(CALLBACK_INPUT, mTimestampNanos)
        //处理动画，我们平时使用choreographer postCallback就是这个类型的
        doCallbacks(CALLBACK_INSETS_ANIMATION, mTimestampNanos)
        //处理绘制，通常是ViewRootImpl设置的监听
        doCallbacks(CALLBACK_TRAVERSAL, mTimestampNanos)
    }
    ```

在每个类型的`Queue`里取出符合条件的callback，依次处理

-   处理input事件
-   处理动画，我们平时使用`choreographer` `postCallback()`就是这个类型的
-   处理绘制，通常是ViewRootImpl设置的监听

```
// 取出对应类型符合时间条件的callback处理
private fun doCallbacks(callbackType: Int, frameTimeNanos: Long) {
    var callbacks: CallbackRecord?
    val now = System.nanoTime()
    callbacks = mCallbackQueues[callbackType].extractDueCallbacksLocked(now / NANOS_PER_MS)
    if (callbacks == null) {
        return
    }
    var callback = callbacks
    while (callback != null) {
        callback.run(frameTimeNanos)
        callback = callback.next
    }
}
```

## 6 暴漏给外部垂直信号的同步

```
fun postCallback(
    callbackType: Int = CALLBACK_INPUT, delayMillis: Long = 0, action: FrameCallback,
) {
    synchronized(mLock) {
        //两件事件：
        //1.根据事件类型放到对应的队列里
        //2.申请垂直同步,如果时间未到通过handler发送一个延时消息处理
        val now = SystemClock.uptimeMillis()
        val dueTime = now + delayMillis
        mCallbackQueues[callbackType].addCallbackLocked(dueTime, action)
        if (dueTime <= now) {
            scheduleFrameLocked()
        } else {
            mHandler.obtainMessage(MSG_DO_SCHEDULE_CALLBACK, action).apply {
                this.arg1 = callbackType
                this.isAsynchronous = true
            }.let { mHandler.sendMessageAtTime(it, dueTime) }
        }
    }
}
```

两件事件：

-   1.根据事件类型放到对应的队列里
-   2.申请垂直同步,如果时间未到通过handler发送一个延时消息处理

## 7 结

-   CallbackRecord对象进行池化复用，这部分没有实现，对CallbackRecord对象池化复用还是很有必要的，Choreographer在实际运行中会大量创建销毁该对象。
-   没有实现移除callback的方法。
-   最终运行跑起来，代码地址<https://github.com/drummor/GetHandsDirty>
-   通过Choreographer简单的实现能够加深对Choreographer的理解，希望对你有所帮助。
