---
title: Android流畅性三板斧之卡顿监控
date: 2024-01-25 21:50:44
tags: APM
category: APM
---




##  Android 流畅性三板斧之卡顿监控


Android 流畅性监控的三板斧，帧率的监控、卡顿监控、ANR的监控。之所以讲这三者放在一起是他们的联系比较密切。帧率的下降往往伴随着有卡顿，【过分卡顿】往往就会产生ANR。

严谨的讲，帧率下降不一定会有卡顿（这里对卡顿是从技术角度定义在主线程执行了耗时任务），卡顿产生的原因还有其他因素导致，比如系统负载、CPU繁忙等。

【过分的卡顿】也不一定产生ANR，卡顿但未触发ANR产生的条件就不会产生ANR。关于ANR的详细内容我们放在三板斧系列文章的第三篇。

[**Android 流畅性三板斧之帧率监控**](https://juejin.cn/post/7217801491188809789)（<https://juejin.cn/post/7217801491188809789>）

[**Android 流畅性三板斧之卡顿监控**](https://juejin.cn/post/7218772329034301477)（<https://juejin.cn/post/7218772329034301477>）

[**Android 流畅性三板斧之ANR监控**](https://juejin.cn/post/7220043684292558907) (https://juejin.cn/post/7220043684292558907)


**温馨提示**，本文涉及的实现的代码以上传至github <https://github.com/drummor/GetHandsDirty>，结合代码食用更佳

## 1 WatchDog 方案

### 1.1 基本原理

**思路:**

开启一个子线程不断往主线程Looper 发消息。这个消息内就是修改我们重置一个值。子线程任务间隔一段时间check 消息是否被处理，如果没有被处理，则认为主线程出现了卡顿情况。

**代码:**

```java
final Runnable _ticker = new Runnable() {
        @Override public void run() {
            _tick = 0;
            _reported = false;
        }
    };

  @Override
    public void run() {
        setName("|ANR-WatchDog|");
        long interval = _timeoutInterval;
        while (!isInterrupted()) {
            boolean needPost = _tick == 0;
            _tick += interval;
            if (needPost) {
                _uiHandler.post(_ticker);
            }
            try {
                Thread.sleep(interval);
            } catch (InterruptedException e) {
                _interruptionListener.onInterrupted(e);
                return ;
            }
            if (_tick != 0 && !_reported) {
                //认为发生了卡顿
            }
        }
```

### 1.2 方案存在的问题

#### 1.2.1 问题1

不断的往message 轮训，对性能和功耗有损伤，不够优雅；同时设置的IdelHandler 任务永远得不到执行。

#### 1.2.2 问题2

上面这个问题还好，更严重的问题是**漏报**。如下图所示。

![image.png](/images/apm_block_1706190538776.png)

-   500ms检测一次有一个耗时600ms的任务，执行执行的开始是在检测第一个检测周期的第150ms处结束。在第一个周期的0-50m和第二个周期的150-500ms都有一段不卡顿的时间，这段时间检测消息能够被处理掉。那么该耗时任务能被检测到的概率会只有有20%。

    只有当卡顿时间大于两倍的轮训间隔，卡顿才能完整的被检测到。

-   甚至我们可以计算出一个漏报概率公式。 `x/a -1` (代表卡顿时间，a代表轮训时间)。也就是说如果我们要检测一个500ms的卡顿，轮训间隔时间要小于等于250ms。

-   利用这种方式用来检测ANR也有很多弊端和不科学之处，这点我们在三板斧的第三篇文章里讲。

## 2 AndroidPerformanceMonitor 方案

### 2.1 基本原理

能查到到的最早的方案来源于开源：AndroidPerformanceMonitor（BlockCanary）其核心的原理在

``` java
  #Looper
private static boolean loopOnce(final Looper me,..) {
        Message msg = me.mQueue.next(); // might block
        final Printer logging = me.mLogging;
        if (logging != null) {
            logging.println(">>>>> Dispatching to " + msg.target + " "
                    + msg.callback + ": " + msg.what);
        }
        ...
        msg.target.dispatchMessage(msg);
        ...
        if (logging != null) {
            logging.println("<<<<< Finished to " + msg.target + " " + msg.callback);
        }
        ...
        msg.recycleUnchecked();
        return true;
   }
```

Looper 在分发执行每个Message 前后都会打印调用`logging`打印日志，且可喜的是我们设置该`logging`。依次可以计算出主线程的任务执行的耗时，超出【阈值】就认为出现了卡顿，进而收集信息。

我们在三板斧的第一篇里hook `Choreographer` 方案监控帧率方案里也使用了这一手段。

另外，Android api10 以上Looper 里添加了`Observer`,通过这一api我们也可以监控`Message` 的调度耗时。只不过该api是@hide的我们需要通过元反射的方式处理，对此这里不再展开。

### 2.2 方案监控盲区

该方案我们能监控到大部分的主线程耗时方法，还有少数的执行任务监控不到。

-   idleHandler的耗时监控不到
-   native层面发起的主线程任务监控不到。在java层面上我们拿到的堆栈是从 MessageQueue.java 的`nativePollOnce(ptr, nextPollTimeoutMillis)` 处发起，对应的native层面会执行然后回到java层，如inputEvent事件。
-   SyncBarrier泄漏问题导致的耗时。Looper中post的一个SyncBarrier，此后MessageQueue 里会跳过同步消息，只执行异步消息。当本该remove掉的SyncBarrier没被remvoe 掉的时候，同步消息永远得不到执行造成同步消息等待耗时。

下面我们展开针对这三个问题的解决方案。

## 3 进化完善方案

针对AndroidPerformanceMonitor 监控的三个主要盲区，一一补充完善方案。

### 3.1 idleHandler 耗时监控

```java
#Looper
    public static void loop() {
        for (;;) {
            Message msg = queue.next(); //内部可能处理了IdleHandler
            ...
            final Printer logging = me.mLogging;
            if (logging != null) {
                logging.println(">>>>> Dispatching to " + msg.target + " " +
                    msg.callback + ": " + msg.what);
            }
            ...
            msg.target.dispatchMessage(msg);
            ...
            if (logging != null) {
                logging.println("<<<<< Finished to " + msg.target + " " + msg.callback);
            }
    }
  
# MessageQueue
  Message next() {
        int pendingIdleHandlerCount = -1; // -1 only during first iteration
        int nextPollTimeoutMillis = 0;
        for (; ; ) {
            nativePollOnce(ptr, nextPollTimeoutMillis);
            ...//取出message
            for (int i = 0; i < pendingIdleHandlerCount; i++) {
                //处理idleHandler
                final IdleHandler idler = mPendingIdleHandlers[i];
                mPendingIdleHandlers[i] = null;
                boolean keep = false;
                keep = idler.queueIdle();
                    synchronized (this) {
                        mIdleHandlers.remove(idler);
                    }
                }
            }
        }
    }
```

如上代码，IdleHandler处理是在MessageQueue 里的next方法里。我们使用Looper 的printer 方案是监控不到的。

针对这个问题的解决方案，反射设置MessagQuueue 的`private final ArrayList<IdleHandler> mIdleHandlers = new ArrayList<IdleHandler>();`成员变量，实现一个我们自身ArrayList，当往里添加`IdleHandler`时，讲起包装在我们实现的代理`IdleHandlerWrapper`里，`IdleHandlerWrapper`主要的工作就是在`queueIdle();`方法前后加入监控代码，监控`queueIdle`的执行耗时。

``` kotlin
class IdleHandlerWrapper(
    val orgIdleHandler: MessageQueue.IdleHandler,
    private val callback: (Long) -> Unit
) : MessageQueue.IdleHandler {
    override fun queueIdle(): Boolean {
        val startTime = System.currentTimeMillis()
        val ret = orgIdleHandler.queueIdle()
        val costTime = System.currentTimeMillis() - startTime
        if (costTime > 2_000) {
            callback.invoke(costTime)
        }
        return ret
    }
}
```

### 3.2 Native 层面发起的主线程任务耗时监控

先看一个张图

![image-20230309102514703.png](/images/apm_block_1706190538870.png)

如上图是一个`Activity onTouchEvent（）`方法的执行栈，由此可以看出，本次的执行时从`MesssageQueue`的`nativePollOnce`处开始执行；并不是我们惯常的Handler的`dispatchMessage(msg)`处执行而来。

究其原因是，native层把epoll唤醒同时调用了ViewRootImpl里的`InputReceiver.onInputEvent()`方法

``` 
Looper#loop()
    -> MessageQueue#next()
        -> MessageQueue#nativePollOnce()
            -> NativeMessageQueue#pollOnce() //注意，进入 Native 层
                -> Looper.cpp#pollOnce()
                    -> Looper.cpp#pollInner()
                        -> epoll_wait()
```

熟悉Handler机制中epoll机制的同学知道，当`MessageQueue`没有执行的时候主线程会堵塞在`nativePollOnce()`处,被唤醒的时候会从此处执行。**注意：** 被唤醒并不是一定在java层往MessgeQueue里插入消息时，native层也能唤醒，且native层在唤醒时也可能会有任务要执行。

```c++
/system/core/libutils/Lopper.cpp
int pollInner(int timeoutMillis){
        int result = POLL_WAKE;
        // step 1，epoll_wait 方法返回
        int eventCount = epoll_wait(mEpollFd, eventItems, timeoutMillis); 
        if (eventCount == 0) { // 事件数量为0表示，达到设定的超时时间
            result = POLL_TIMEOUT;
        }
        for (int i = 0; i < eventCount; i++) {
           if (seq == WAKE_EVENT_FD_SEQ)) {
                // step 2 ，清空 eventfd，使之重新变为可读监听的 fd
                awoken();
            } else {
                // step 3 ，保存自定义fd触发的事件集合
                mResponses.push(eventItems[i]);
            }
        }
        // step 4 ，执行 native 消息分发
        while (mMessageEnvelopes.size() != 0) {
            if (messageEnvelope.uptime <= now) { // 检查消息是否到期
                messageEnvelope.handler->handleMessage(message);
            }
        }
        // step 5 ，执行 自定义 fd 回调
        for (size_t i = 0; i < mResponses.size(); i++) {
            response.request.callback->handleEvent(fd, events, data);
        }
        return result;
    }
```

native第4步和第5步的都会有任务执行。这些任务执行有可能会回调到java层，如`TouchEvent`事件，传感器事件。

**方案**

针对这类事件的监控，Matrix 的方案是：通过PLT Hook，hook libinput.so中的*recvfrom*和*sendto*方法。

鉴于此类事件接触到的比较多的就是`TouchEvent`和传感器事件，特别是`TouchEvent`事件，我这里提供一种低成本的监控 `TouchEvent` 耗时的方案。

设置`Window.Callback` 代理然后监控

```java
class TouchCostWindowCallback(private val windowCallback: Window.Callback) :
    Window.Callback by windowCallback {
    override fun dispatchTouchEvent(event: MotionEvent?): Boolean {
        val start = System.currentTimeMillis()
        val rst = windowCallback.dispatchTouchEvent(event)
        val cost = System.currentTimeMillis() - start
        // 监控
        return rst
    }
}
```
应用层所有的input事件都是通过`InputEventReceriver`接收，然后再经ViewRootImpl分发，分发的时候要经过	`Window.Callback`,利用这一特性实现`TouchEvent`的监控。
### 3.3 SyncBarrier 泄漏监控

SyncBarrier是一种特殊的Message，其特点是target为空，反射拿到MessageQueue的成员变量`mMessages`，通过message的when和当前时间对比，超过了我们的阈值。

然后再配合发送一个异步消息和同步消息，如果同步消息能够执行，异步消息一直得不到执行，可以判定Message的调度没问题，SyncBarrier产生了泄漏。

解决的方式：可以直接把SyncBarrier移除掉。

## 4 结

-   本文的卡顿监控其实是从主线程耗时角度从一下四个方面进行监控，覆盖主线程里任务的耗时。

    -   Java层Message调度耗时，通过设置Looper 的 Printer 监控java层Message调度执行耗时。
    -   IdleHanlder执行耗时，hook MessageQueue监控Idlehandler的耗时。
    -   native层主线程任务耗时。
    -   SyncBarrier 泄漏监控

-   这个信息是让我们有数可依量化【卡顿】这一主观指标变得更为【客观】。

-   同时，这个信息对于我们三板斧的【ANR监控】有非常重要的参考意义。

-   本文涉及的实现的代码以上传至github <https://github.com/drummor/GetHandsDirty>
