---
title: Android流畅性三板斧之ANR监控与解决
date: 2024-01-25 21:45:48
tags: APM
---

这是流畅性三板斧的第三篇文章，阅读前两篇会对理解该篇会有帮助，建议一起食用

[**Android 流畅性三板斧之帧率监控**](https://juejin.cn/post/7217801491188809789)（<https://juejin.cn/post/7217801491188809789>）

[**Android 流畅性三板斧之卡顿监控**](https://juejin.cn/post/7218772329034301477)（<https://juejin.cn/post/7218772329034301477>）

[**Android 流畅性三板斧之ANR监控**](https://juejin.cn/post/7220043684292558907) (https://juejin.cn/post/7220043684292558907)
## 1 哪来的ANR

> ANR(Application Not responding):如果 Android 应用的界面线程处于阻塞状态的时间过长，会触发“应用无响应”(ANR) 错误。如果应用位于前台，系统会向用户显示一个对话框。ANR 对话框会为用户提供强制退出应用的选项。
>
> ANR 是一个问题，因为负责更新界面的应用主线程无法处理用户输入事件或绘制操作，这会引起用户的不满

以上是官方对ANR的描述，ANR的目的是从系统层面对严重影响用户直接感知的输入和界面绘制操作的行为进行的一种自我保护。

### 1.1 四种条件

在系统层面触发ANR的就只有四个节点。也就是说即时主线程有一个很长的耗时任务，如果没有触发ANR产生的条件也不会产生ANR。

出现以下任何情况时，系统都会针对您的应用触发 ANR：

-   输入调度的超时，阈值为5秒
-   Service执行超时，无法在阈值内完成服务的创建和启动也会触发ANR，前台任务的阈值为10s后台任务的阈值为60s
-   ContentProvider调度超时，这个阈值为10s
-   BroadcastReceiver 调度超时，这个阈值为10s

### 1.2 系统产生ANR大概流程

以BroadcastReceive超时为例，看下系统如何触发ANR

#### 1.2.1 BroadcastReceiver 产生ANR

BroadcastReceiver处理广播的核心逻辑位于`BroadcastQueue`中

```
public final class BroadcastQueue {
        final void processNextBroadcastLocked(boolean fromMsg, boolean skipOomAdj) {
          
          setBroadcastTimeoutLocked(timeoutTime);
          ...
          performReceiveLocked(...);//内部最终会调用BroadcastReceiver的onReceiver
          ...
         cancelBroadcastTimeoutLocked();//解除超时
          ..
        }

        // 设置超时
        final void setBroadcastTimeoutLocked(long timeoutTime) {
            if (!mPendingBroadcastTimeoutMessage) {
                Message msg = mHandler.obtainMessage(BROADCAST_TIMEOUT_MSG, this);
                mHandler.sendMessageAtTime(msg, timeoutTime);
                mPendingBroadcastTimeoutMessage = true;
            }
        }
  
      //解除超时
      final void cancelBroadcastTimeoutLocked() {
        if (mPendingBroadcastTimeoutMessage) {
            mHandler.removeMessages(BROADCAST_TIMEOUT_MSG, this);
            mPendingBroadcastTimeoutMessage = false;
        }
}
​
```

以上是广播结束者设置、解除、触发ANR的核心逻辑。通过handler机制延迟发送一个【ANR 任务】，在规定时间内完成了你广播接收者任务移除ANR任务。否则触发。

#### 1.2.1 系统处理ANR

实际无论何种条件触发了ANR最终都交给AnrHelper处理，这个类中核心处理ANR的逻辑开启一个名为“AnrConsumer”的线程。执行在ProcessErrorStateRecord中`appNotResponding（)`的方法。

```
 void appNotResponding(String activityShortComponentName, ApplicationInfo aInfo,
                          String parentShortComponentName, WindowProcessController parentProcess,
                          boolean aboveSystem, String annotation, boolean onlyDumpSelf) {
        ArrayList<Integer> firstPids = new ArrayList<>(5);
        SparseArray<Boolean> lastPids = new SparseArray<>(20);
        ...
        setNotResponding(true);//标记ANR标识
         ...
        firstPids.add(pid);
        ...
        isSilentAnr = isSilentAnr();//后台的应用发生ANR
        if (!isSilentAnr && !onlyDumpSelf) {//前台进程和不仅仅dump自身时
            mService.mProcessList.forEachLruProcessesLOSP(false, r -> {
              ...
                firstPids.add(pid);//添加其他进程
            }
        }); 
        ...
        StringBuilder report = new StringBuilder();
        report.append(MemoryPressureUtil.currentPsiState());//内存信息
        ProcessCpuTracker processCpuTracker = new ProcessCpuTracker(true);//cup信息
          
        nativePids.add(..); //添加native进程
        ...
        File tracesFile =  .. 
        report.append(tracesFileException.getBuffer());
        info.append(processCpuTracker.printCurrentState(anrTime));
​
        if (tracesFile == null) {
            Process.sendSignal(pid, Process.SIGNAL_QUIT); //不dump信息时直接发送SIGNAL_QUIT信号
        }
        ...
        File tracesFile = ActivityManagerService.dumpStackTraces(..); //dump栈
          ...
        mService.mUiHandler.sendMessageDelayed(msg, anrDialogDelayMs);//ANR弹窗
    }
​
```

值得注意的点

-   沉默的ANR”，前台ANR会弹无响应的Dialog，后台ANR会直接杀死进程**。
-   dump信息时优先dump发生ANR进程的信息，条件允许dump其他关联进程和native进程。如果系统进程有很多ANR需要处理，且耗时已经超过60s或者是沉默进程就只会dump发生ANR进程信息
-   dump全部进程的总时间不能超过20秒，如果超过了，马上返回，确保ANR弹窗可以及时的弹出（或者被kill掉）
-   `Process.sendSignal(pid, Process.SIGNAL_QUIT);`系统会发出Process.SIGNAL_QUIT信号。这个很重要

![](/images/apm_anr_1706190256769.png)

（图来自微信团队）

当应用发生ANR之后，系统会收集许多进程，来dump堆栈，从而生成ANR Trace文件，收集的第一个，也是一定会被收集到的进程，就是发生ANR的进程，接着系统开始向这些应用进程发送SIGQUIT信号，应用进程收到SIGQUIT后开始dump堆栈。

## 2 应用层怎么监控

Android M(6.0) 版本之后，应用侧不能直接通过监听 `data/anr/trace` 文件，监控是否发生 ANR。

### 2.1 WatchDog方案

该方案我们在卡顿监控文章里也介绍过，主要思路就是超时检测，检测主线程MessageQueue在规定时间（5s）内是否处理了给定的消息。如果规定时间内没有处理掉给定的消息就认为发生了ANR。

该方案用于检测ANR的弊端：

-   不准确：该方案触发了超时条件不一定会产生ANR。5秒超时只是`ToucEvent` 未被消费发生ANR的条件。其他的产生ANR的条件的并不是5s；
-   不优雅：该方案会一直让主线程消息调度一直处于“繁忙状态”，对应用功耗和负载有不必要的影响。

### 2.2 监听信号方案（*SIGQUIT*）

系统发生ANR的时候，发出`SIGQUIT`信号，通过监听这一信号，我们可以判断ANR的发生。该方案也是市面上监听ANR的主要方案。

除Zygote进程外，每个进程有`SignalCatcher`线程，捕获SIGQUIT信号然后做相应的动作。Android默认把SIGQUIT设置为BLOCKED，这意味着只能只有`SignalCatcher`线程能监听到`SIGQUIT`信号，我们注册`sigaction`监听不到。我们把`SIGQUIT`设置为UNBLOCK这样就可能收到信号。但要注意，需要讲信号重新发送出去，不破坏系统的机制。

#### 2.2.1 误报 & 完善

系统发出`SIGQUIT` 信号不一定该应用发生了ANR，其他情况下也会发出'SIGQUIT'信号,比如其他进程发生了ANR

源码里找答案

```
    private void makeAppNotRespondingLSP(String activity, String shortMsg, String longMsg) {
        setNotResponding(true);
        // mAppErrors can be null if the AMS is constructed with injector only. This will only
        // happen in tests.
        if (mService.mAppErrors != null) {
            mNotRespondingReport = mService.mAppErrors.generateProcessError(mApp,
                    ActivityManager.ProcessErrorStateInfo.NOT_RESPONDING, //把发生ANR的进程
                    activity, shortMsg, longMsg, null);
        }
        startAppProblemLSP();
        mApp.getWindowProcessController().stopFreezingActivities();
    }
​
```

发生ANR时系统会把发生ANR的进程标记 `NOT_RESPONDING`,我们可以在应用层通过ActivityManager check该状态，代码乳如下：

```
private static boolean checkErrorState() {
    try {
     
        ActivityManager am = (ActivityManager) application.getSystemService(Context.ACTIVITY_SERVICE);
        List<ActivityManager.ProcessErrorStateInfo> procs = am.getProcessesInErrorState();
        if (procs == null) return false;
        for (ActivityManager.ProcessErrorStateInfo proc : procs) {
            if (proc.pid != android.os.Process.myPid()) continue;
            if (proc.condition != ActivityManager.ProcessErrorStateInfo.NOT_RESPONDING) continue;
            return true;
        }
        return false;
    } catch (Throwable t){
    }
    return false;
}
```

当收到`SIGQUIT`信号之后，在一个时间段内不断的check该状态，如果获取到了该标识，就可以认为当前进程发生了ANR。

#### 2.2.2 漏报&完善

有些ANR发生不会把进程不会设置`NOT_RESPONDING`标识

-   沉默ANR（**SilentAnr**)，SilentANR 会直接kill进程，不会设置该标识。
-   闪退ANR，OPPO VIVO 的机型ANR之后，会直接闪退，也不会设置该标识。

应对方案：结合主线程的卡顿状态。

反射获取主线程`MessageQueue` 的 `mMessages` 对象，此对象的when变量时预期该消息被处理的时间，该变量和当前时间做差就能得到该消息等待的时间，被耽误的耗时，如果该耗过长，就说明主线程‘卡顿’了。

收到了`SIGQUIT`且当前主线程卡顿了，就认为发生了 ANR。

#### 2.2.3 ANR 监控小结

![image.png](/images/apm_anr_1706190257265.png)

通过监听系统`SIGQUIT`信号结合check 当前进程的 `NOT_RESPONDING`标识和主线程的卡顿状态，综合判定为该进程发生了ANR。

这只是我们知道发生了ANR，知道发生了ANR，进一步知道什么导致了ANR，采集ANR发生时的上下文环境信息，解决ANR更重要。

## 3 信息的采集监控

### 3.1 ANR问题定位难点

观察ANR信息采集的难点在于往往信息采集不准确、不全面，当ANR发生的当下采集的信息并不是ANR的真正诱因，因而采集的信息对排查问题的参考价值大折扣。

![image.png](/images/apm_anr_1706190257469.png)

如上图所示，在主线程耗时的任务已经执行完毕，service启动任务在超过了规定的阈值产生了ANR，此时采集的信息是一个正常的任务调用信息。

总的来说，诱发ANR的原因分主线程执行耗时过大和系统负载过重。

主线程任务执行耗时过大又可大概分为一下几种

-   历史消息里有多个耗时较重，触发了ANR。
-   历史消息里有一个耗时极其重的消息。
-   极其多个耗时小消息执行综合起来耗时严重，触发ANR。

系统负载过重，包括系统内存不足，cpu负载，导致任务得不到执行。

如果能较完整记录过完一段时间段内主线程历史消息任务、当前执任务和将要执行的任务以及系统负载情况，对我们更为准确的诊断ANR问题有非常重要的意义。

### 3.2 消息调度监控

主线程中记录监控Looper消息执行方案，我们自然的把目光转移到了Looper的Printer方案上。关于这个在三板斧的前两篇文章都介绍过这里不展开。

Looper分发消息执行的时候，前后都打印消息信息，我们依此可以获取到消息任务的相关信息，包活Message的target`、`what`、`callback、消息执行的耗时等。

消息耗时，需要采集主线程的WallTime和ThreadTime。

-   WallTime：任务占用的时间，包括等待锁，线程休眠时间片流转的时间。
-   ThreadTime（CpuTime）时线程真实执行的时间，不包括等待锁等时间。依次我们可以在侧面推断系统负载情况。

大部分情况下，消息执行都耗时较短，Looper也会有Idel状态，即无消息执行的状态，我们需要对这些消息进行聚合处理。

此外，三板斧系列文章主线程耗时监控里有介绍主线程处理消息除了Looper正常的分发的消息需要监控外，IdleHandler、TouchEvent消息也要纳入到统计记录里才更为完整。

#### 3.2.1 消息聚合以及分类

-   连续的耗时较小的消息聚合统计，连续小于50ms 的消息，聚合成一条记录，该记录里存储消息的数量，和总耗时信息等
-   超过阈值的消息单做一条记录统计。
-   系统调用消息统计（ActivityThread.H Activity 、Service、 ContentProvider），这些对我们分析ANR问题很重要。
-   IDLE状态消息单独统计。
-   IdleHandler 的统计。
-   TouchEvent 等native 层触发的主线程调度任务统计。

综合来说，把消息分类型，聚合类型（Agree），连续的耗时较少的消息。耗时类型（Huge）：超过50ms的消息。系统调用消息（SYSTEM）

#### 3.2.2 消息堆栈采集

除了，统计记录Looper Messge的what、callback和耗时之外，每个消息内到底执行了什么哪些动作也需要采集，这就需要采集每个消息的执行的栈，频繁的采集执行栈对性能影响较大，要进行有策略的采集。

-   开启子线程采集主线程的堆栈。
-   耗时较少的消息任务不采集。
-   超过一定阈值还未执行完毕的消息任务进行一次采集，再隔一段时间如果本次消息任务还未执行完，再进行采集，间隔时间是依此线性增加。
-   【shoppe的非堵塞式高效抓栈】

#### 3.2.3 正在执行的消息和pending消息统计

> 除了监控 ANR 发生之前主线程历史消息调度及耗时之外，也需要知道 ANR 发生时正在调度的消息及其耗时，以便于在看到 ANR 的 Trace 堆栈时，可以清晰的知道当前 Trace 逻辑到底执行了多长时间

MessageQueue中等待执行的消息也很有必要统计

-   对我们知道什么组件诱发了ANR的产生
-   可以统计等待执行的消息等待了多久。判断消息队列繁忙程度。

### 3.3 更全面的信息采集

以上我们比较全面的监控统计主线程调度任务的耗时，

### 3.3.1 获取ANRInfo

应用层可通过AcivityManager获取ANRInfo

```
    val am = application.getSystemService(Context.ACTIVITY_SERVICE) as ActivityManager
    val processesInErrorStates = am.processesInErrorState
```

ProcessesInErrorState中可获取到

```
 shortMsg: ANR Inputdispatching timed out ...
```

-   shortMessage：ANR 产生的直接原因，TouchEvent超时，Servcie启动超时等。

```
Reason: Input dispatching timed out 
xxx is not responding. Waited 5003ms for FocusEvent(hasFocus=false))                                                                                                                                                                          
Load: 3.19 / 2.46 / 2.42
​
----- Output from /proc/pressure/memory -----
some avg10=0.00 avg60=0.00 avg300=0.00 total=144741615
full avg10=0.00 avg60=0.00 avg300=0.00 total=29370150
----- End output from /proc/pressure/memory -----
  
CPU usage from 0ms to xxx ms later with 99% awake:
​
TOTAL: 6.4% user + 8.2% kernel + 0% iowait + 0.6% irq + 0.1% softirq
​
CPU usage from 0ms to xxx ms later with 99% awake:
​
27% TOTAL: 10% user + 14% kernel + 0.3% iowait + 0.9% irq + 0.3% softirq
                                                                                                        
```

-   longMessage：包括系统负载，cup使用情况，IO情况等系统情况。

#### 3.3.2 Logcat 日志

应用运行时采集logcat日志，注意需要控制量有相应的策略，定时清理。

```
String cmd = "logcat -f " + file.getAbsolutePath();
Runtime.getRuntime().exec(cmd);
```

#### 3.3.3 当前进程其他线程的堆栈信息

从 Java 层获取各线程堆栈，或通过反射方式获取到虚拟机内部 Dump 线程堆栈的接口，在内存映射的函数地址，强制调用该接口，并将数据重定向输出到本地。

这样当ANR发生时我们就有丰富的信息供我们参考，包括主线程过去现在和未来的调度信息，系统的信息，线程信息，Logcat信息。

## 4 问题分析定位和解决

### 4.1 分析主线程调度情况

查看我们主线程任务调度，是否有明显的耗时任务执行，诱发ANR产生。

-   分析我们记录的消息调度的wallTime和cputime
-   定位记录的耗时消息堆栈定位出问题
-   注意有可能出现连续的非常多的耗时小的消息也会造成ANR

### 4.2 ANR Info解读

#### 4.2.1 系统负载情况

```
Load: xx/xx/xx
```

ANR发生的前1分钟 5分钟和15分钟时间段内的CPU负载，数值代表着等待系统调度的任务数，数值过高，意味着系统有CPU和IO竞争激烈，我们的应用进程可能收到影响

#### 4.2.2 CPU占用情况

```
CPU usage from 0ms to xxx ms later with xx% awake:
​
14% 1673/system_server: 8% user + 6.7% kernel / faults: 12746 minor
13% 30829/tv.danmaku.bili: 7.3% user + 6.2% kernel / faults: 24286 minor
6.6% 31147/tv.danmaku.bili:ijkservice: 3.7% user + 2.8% kernel / faults: 11880 minor
6% 574/logd: 2.1% user + 3.8% kernel / faults: 64 minor
..
TOTAL: 6.4% user + 8.2% kernel + 0% iowait + 0.6% irq + 0.1% softirq
​
CPU usage from xxms to xxxms later 
73% 1673/system_server: 49% user + 24% kernel / faults: 1695 minor
  33% 2330/AnrConsumer: 12% user + 21% kernel
  15% 1683/HeapTaskDaemon: 15% user + 0% kernel
  9.2% 7013/Binder:1673_12: 6.1% user + 3% kernel
  6.1% 1685/ReferenceQueueD: 6.1% user + 0% kernel
  6.1% 2715/HwBinder:1673_5: 6.1% user + 0% kernel
  3% 2529/PhotonicModulat: 0% user + 3% kernel
25% 30829/tv.danmaku.bili: 4.2% user + 21% kernel / faults: 423 minor
  25% 31050/thread_ad: 4.2% user + 21% kernel
  ...
  ...                                                                                                   
27% TOTAL: 10% user + 14% kernel + 0.3% iowait + 0.9% irq + 0.3% softirq
```

如上，表示ANR发生前后的CPU占用情况，以及这些进程具体占用情况。

-   user：用户态
-   kernel：内核态
-   iowait：io等待。过高可能发生文件读写或内存紧张的情况。
-   irq：硬中断
-   softirq：软中断 占比

注意：单进程CPU的负载并不是以100%为上限，而是有几个核，就有百分之几百，如8核上限为800%

另外，`kswapd`和 `mmcqd`系统关键线程CPU线程过大，往往伴随系统回收资源，影响到应用进程

通过对ANR信息的解读可以更佳全面的帮助我们定位ANR问题。

### 4.3 Logcat消息

线上如果记录了Logcat打印消息，着重从以下方面去看问题

-   `onTrimeMemory`：连续的onTrimMemory 往往说明APP的内存不足可能系统资源不足造成ANR
-   `Slow operation` `Slow delivery` 出现该情况系统性能受限。
-

## 5 结

从ANR产生的原因，系统处理ANR，应用层监听ANR，应对ANR应用侧比较全面的监控主线程的任务调度以及为了解决ANR采集系统信息最后给出了分析解决ANR问题的总体思路。

针对ANR问题，这些还远远不够，这里只是一个总体的框架，希望本文更全面的看待解决ANR问题有帮助。

到这里Android流程性三板斧就就结束了。

希望对你有帮助，不足错误之处海涵指正.

