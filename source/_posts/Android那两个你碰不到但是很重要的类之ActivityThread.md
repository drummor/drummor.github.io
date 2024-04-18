---
title: Android那两个你碰不到但是很重要的类之ActivityThread
date: 2023-05-06 19:17:02
tags:
category: basic
---

## **前言**

上篇文章我们聊了些`Android`里那些我们平时碰不到但很重要的类`ViewRootImpl`，这一篇我们就来看看另外那个类ActivityThread。

通过本文能了解一下内容

![Alt text](/images/1681706186368_.pic.jpg)

  


## **1、和系统进程打交道的桥头堡**

应用进程起来之后ART(Android Runtime)第一站就是ActivityThread，代码层面上就是ActivityThread的main()方法，是不是很熟悉，爷青回啊，这不就是java的main方法嘛

```
public static void main(String[] args) {
    Looper.prepareMainLooper();
    ActivityThread thread = new ActivityThread();
    thread.attach(false, startSeq);
    sMainThreadHandler = thread.getHandler();
    Looper.loop();
    throw new RuntimeException("Main thread loop unexpectedly exited");
}
```

该方法是一个静态方法，里面做了重要的两件事

-   创建了让主线程Looper开始工作，并创建了一个Handler
-   给system_server【递纸条】告诉他联系方式，告诉sytem_servr进程与应用进程取得联系可以通过ApplicationThread这个binder。看下面这个代码

```
    private void attach(boolean system, long startSeq) {
            final IActivityManager mgr = ActivityManager.getService();
            mgr.attachApplication(mAppThread, startSeq);//调用远端的binder
    }
```

-   通过`ActivityManager.getService()`拿到`system_server`进程的binder，然后把`mAppThread` binder传递过去。`mAppThread`是`ApplicationThread`的一个对象，是ActivityThread的一个内部类。
-   取得联系后的第一站创建Applicaiton。

```
   private class ApplicationThread extends IApplicationThread.Stub {
        @Override
        public final void bindApplication() {
            sendMessage(H.BIND_APPLICATION, data);
        }
```

-   接下来就是H主线程的Hanlder，调用handleBindApplication

```
 private void handleBindApplication(AppBindData data) {
        Application app;
        data.info = getPackageInfoNoCheck(data.appInfo, data.compatInfo, isSdkSandbox);//内部创建LoadedApk
        app = data.info.makeApplicationInner(data.restrictedBackupMode, null);//内部创建Applicaiton对象，调用onCreate()方法
        installContentProviders(app, data.providers); //cotentprovider初始化
        mInstrumentation.callApplicationOnCreate(app);//调用onCreate()方法
    }
```

-   这里找到了为什么使用ContentProvider能够实现初始化，构建的时候会创建ContenProvider。

```
 public Activity newActivity(ClassLoader cl, String className,
            Intent intent)
            throws InstantiationException, IllegalAccessException,
            ClassNotFoundException {
        String pkg = intent != null && intent.getComponent() != null
                ? intent.getComponent().getPackageName() : null;
        return getFactory(pkg).instantiateActivity(cl, className, intent);//加载创建Activity
    }
```

![Alt text](/images/k3u1fbpfcp-zoom-1.png)

-   IActivityManager(binder)：应用进程和SystemServer进程打交道的时候。
-   AppliactionThread(binder)：SystemServer进程与应用进程通信。

## **2、为什么使用ContentProvider可以实现初始化**

```
 private void handleBindApplication(AppBindData data) {
        Application app;
        data.info = getPackageInfoNoCheck(data.appInfo, data.compatInfo, isSdkSandbox);//内部创建LoadedApk
        app = data.info.makeApplicationInner(data.restrictedBackupMode, null);//内部创建Applicaiton对象，调用onCreate()方法
        installContentProviders(app, data.providers); //cotentprovider初始化
        mInstrumentation.callApplicationOnCreate(app);//调用onCreate()方法
    }
```

  


上一段分析时已经找打了答案，应用进程被拉起来之后，在创建`Application`对象调用attachBaseContext()和onCreate()方法之间会调用ContentProvider的onCreate(）方法这也是很多第三方SDK使用该特性实现初始化的原理。

## **3、Activity是什么时候开始渲染的**

```
  public void handleResumeActivity() {
        performResumeActivity(r, finalStateRequest, reason)//调用Activity onResume
        final Activity a = r.activity;
        View decor = r.window.getDecorView();
        ViewManager wm = a.getWindowManager();
        a.mWindowAdded = true;
        wm.addView(decor, l);
   }
```

ActivityThread.java`的`handleResumeActivity()`有这样一段代码，我们可以得出结论，Activity渲染的起点是在` `onResume`阶段,在onResume阶段会把decorView交给WindowManager开始执行渲染。

## **4、原来还可以监控组件的生命周期**

```
class H extends Handler {
  
    public static final int RECEIVER                = 113; //广播接收者
  
    @UnsupportedAppUsage
    public static final int CREATE_SERVICE          = 114;//Service创建
  
    public static final int INSTALL_PROVIDER        = 145;//ContentProvider
  
    public static final int RELAUNCH_ACTIVITY = 160; //Activity启动
  
   public void handleMessage(Message msg) {
        if (DEBUG_MESSAGES) Slog.v(TAG, ">>> handling: " + codeToString(msg.what));
        switch (msg.what) {
            case BIND_APPLICATION:
                Trace.traceBegin(Trace.TRACE_TAG_ACTIVITY_MANAGER, "bindApplication");
                AppBindData data = (AppBindData)msg.obj;
                handleBindApplication(data);
                Trace.traceEnd(Trace.TRACE_TAG_ACTIVITY_MANAGER);
                break;
            case RECEIVER:
                handleReceiver((ReceiverData)msg.obj);
                break;
            case CREATE_SERVICE:
                handleCreateService((CreateServiceData)msg.obj);
                break;
            case BIND_SERVICE:
                handleBindService((BindServiceData)msg.obj);
                break;
                
            case RELAUNCH_ACTIVITY:
                handleRelaunchActivityLocally((IBinder) msg.obj);
                break;
        }
    }
}
```

系统进程（system_server）指挥应用进程组件生命周期的第一站其实就在ActivityThread这里，交给H对象其实是主线程的Handler来分发处理，如上。我们可以反射拿到这一信息，可以监控到主线程对于这些组件调度的信息，这一信息对我们监控排查ANR很有帮助。

## **5 、SharedPreference被声讨的根源**

```
 private void handleStopService(IBinder token) {
     QueuedWork.waitToFinish();      
 }
 public void handlePauseActivity(){
      QueuedWork.waitToFinish(); 
 }
 public void handleStopActivity(){
    QueuedWork.waitToFinish(); 
 }
public void handleServiceArgs(){
   QueuedWork.waitToFinish(); 
}
```

ActivityThread的以上方法里会调用 `QueuedWork.waitToFinish();` 该代码会堵塞主线程执行等待SP的写入操作。这也是SP造成ANR的根源。

稍微展开点

  


```
   public static void waitToFinish() {
        while (true) {
                Runnable finisher;
                synchronized (sLock) {
                    finisher = sFinishers.poll();
                }
                if (finisher == null) {
                    break;
                }
                finisher.run();
            }
        } 
    }
```

  


`waitToFinish()`方法里有这样一段代码，sFinishers是一个List里面是存放的SP写入操作，会在SP执行`commit`和apply的时候放入进来。字节跳动团队就是在此处hook了使其`poll()`方法永远放回空，来杜绝此处产生的ANR。

## **7 、结**

通过阅读ActivityThread的源码我们能在其中获取很多有用的知识。系统进程和应用进程通信的桥梁，Activity真正渲染的起始点，`ContentProvider`能实现SDK自动初始化的原理等都在`ActivityThread`看到他们的影子，希望本文对你有所启发有所帮助。