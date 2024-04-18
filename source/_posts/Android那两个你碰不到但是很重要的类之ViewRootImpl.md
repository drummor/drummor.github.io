---
title: Android那两个你碰不到但是很重要的类之ViewRootImpl
date: 2024-01-25 19:32:36
tags: 
category: 源码
---

## 前言

这两个类就是ActivityThread和ViewRootImpl，之所以说碰不到是因为我们无法通过正常的方式引用这两个类或者其类的对象，调用方法或者直接拿他的属性。但他们其实又无处不在，应用开发中很多时候都和他们息息相关，阅读他们掌握其内部实现对我们理解Android运行机理有醍醐灌顶之疗效，码读百变其义自见，常读常新。本文就尝试从几个我们经常接触的方面先谈谈ViewRootImpl。

  


## 1.1 ViewRootImpl哪来的？

首先是ViewRootImpl，位于`android.view`包下，从它所处的位置大概能猜到，跟View相关。其作用一句话总结，就是连接Window和View的纽带。

这个要从我们最熟悉的Activity开始，我们知道Activity的设置布局View是通过`setContentView()` 方法这个方法里面也大有文章，我们简单的梳理下。

-   Activity setcontentView（）内部调用了`getWindow().setContentView(layoutResID);`也就是调用了Window的`setContentView`方法,Android里Window的唯一实现类就是PhoneWindow，PhoneWindow setContentView，初始化DecorView和把我们设置的View作为其子类。
-   目光转移到`ActivityThread `没错是我们提及的另外一个主角，先关注他的handleResumeActivity()方法，里面关键的代码如下。



```java

public void handleResumeActivity(){
    r.window = r.activity.getWindow();
    View decor = r.window.getDecorView();
    ViewManager wm = a.getWindowManager();
    ViewManager wm = a.getWindowManager();
    WindowManager.LayoutParams l = r.window.getAttributes();
    wm.addView(decor, l);
}
```

-   `WindowManager`的实现类`WindowManageImpl`的addView方法里调用了`mGlobal.updateViewLayout(view, params);`
-   最后我们在WindowManagerGlobal的addView方法里找到了

```java
public void addView(){
    root = new ViewRootImpl(view.getContext(), display);
    view.setLayoutParams(wparams);
    mViews.add(view);
    mRoots.add(root);
    mParams.add(wparams);
}
```

**小结**

-   通过梳理这个过程我们知道，setContenview()其实只是在Window的下面挂了一个View链，View链的根就是ViewRootImpl。
-   通过Window把View和Activity联系在一起。
-   View链的真正添加操作最终交给了WindowManagerGlobal执行。
-   补充一点：PopupWindow本质就是在当前Window下挂了一个View链，PopupWindow本身没有Window，就如雷锋塔没有雷锋一样；Dialog是有自己的window关于这点可自行查阅源码考证。

## 2 ViewRootImpl 一个View链渲染的中转站

View的渲染是自顶而下、层层向下发起的，大致经历测量布局和绘制，View链的管理者也就是`ViewRootImpl`。通过`scheduleTraversals（）`方法发起渲染动作。交给Choreographer安排真正执行的事件。关于`Choreographer`不熟悉的可以参考我的其他文章。最终执行`performTraversals()` 方法。

```java
private void performTraversals(){
    performMeasure(childWidthMeasureSpec, childHeightMeasureSpec);
    performLayout(lp, mWidth, mHeight);
    performDraw();
}
```

## 3 不能在子线程操作View？

  


ViewRoot的RequestLayout中有这样一段代码：

```java
@Override
public void requestLayout() {
    if (!mHandlingLayoutInLayoutRequest) {
        checkThread();
        mLayoutRequested = true;
        scheduleTraversals();
    }
}

void checkThread() {
    if (mThread != Thread.currentThread()) {
        throw new CalledFromWrongThreadException(
                "Only the original thread that created a view hierarchy can touch its views.");
    }
}
```

-   我们对View的操作，比如给TextView设置text，最终都会触发ViewRootImpl的`requestLayout()` 方法，该方法有如上的一个check逻辑。这就是我们常说的不能在子线程中更新View。
-   其实子线程中可以执行View的操作，但是有个前提是：**View还未挂载时。** View未挂载时不会触发`requestLayout`，只是一个普普通通的java对象。那挂载逻辑在哪？

## 4 View 挂载

-   在ViewRootImpl的`performTraversals()` 里有这个代码

```java
private void performTraversals(){
    host.dispatchAttachedToWindow(mAttachInfo, 0);//此处的host为ViewGroup
}
```

-   ViewGroup的`dispatchAttachedToWindo()`方法会把AttachInfo对象分配每一个View，最终实现我们所谓的挂载。

```java
void dispatchAttachedToWindow(AttachInfo info, int visibility) {
    for (int i = 0; i < count; i++) {
        final View child = children[i];
        child.dispatchAttachedToWindow(info,
                combineVisibility(visibility, child.getVisibility()));
    }
 
```

-   实现挂载的View有任何风吹草动就会把事件传递到大bossViewRootImpl这里了。

通过addView添加进的View也是会收到父View的mAttachInfo这里不展开了。

## 5 View.post()的Runnable最终在哪执行了？

```java
public boolean post(Runnable action) {
    final AttachInfo attachInfo = mAttachInfo;
    if (attachInfo != null) {
        return attachInfo.mHandler.post(action);
    }
    getRunQueue().post(action);
    return true;
}
```

-   以上是View post()的代码，可见如果已经实现挂载的View，会直接把post进来的消息交给Hanlder处理，不然就post了HandlerActionQueue里等待后续被处理。

```java
void dispatchAttachedToWindow(AttachInfo info, int visibility) {
  ..
    if (mRunQueue != null) {
        mRunQueue.executeActions(info.mHandler);//内部也是调用handler.post()
        mRunQueue = null;
    }
    ..
}
```

-   最终这些Runnable会在View挂载的时候执行，也就是`dispatchAttachedToWindow()`方法里执行。

## 6 为什么View.post 可以获取宽高

-   这是一个延伸问题，在Activity的`OnCreate()`方法中直接获取宽高是获取不到的，我们通常会使用view.post一个Runnable来获取。原因就是Activity `onCreate`时通过setContentView只是创建了View而未实现挂载，挂载是在onResume时，未挂载的View没有经历测量过程。
-   而通过post的方式，通过上一小节知道，未挂载的View上post之后，任务会在挂载之后，通过handler重新post，此时iewRootImpl已经执行了`performTraversals()`完成了测量自然就可以得到宽高。

  


## 7 还有一点值得注意

`ViewRootImpl` 不单单是渲染的中转站，还是触摸事件的中转站。

硬件传感器接收到触摸事件经过层层传递分发到应用窗口的第一站就是ViewRootImpl。为什么这么说？因为我有证据~。这是ViewRoot里的代码

```java
public void setView(){
    ..
    mInputEventReceiver = new WindowInputEventReceiver(inputChannel,
        Looper.myLooper());
}
```

-   WindowInputEventReceiver是ViewRootImpl的一个内部类，其接收到input事件后，就会进行事件分发。
-   这里给我们的启发是，并不是**所有的主线程任务执行都是通过Handler机制，** onTouch（）事件是底层直接回调过来的，这就和我们之前卡顿监控说的方案里有一项就是对onTouchEvent的监控。

## 结

-   ViewRoot的代码有一万多行，本文分析的只是冰山一角，里面有大量细节直接研究。
-   通过ViewRootImpl相关几个点，简单的做了介绍分析希望对你有帮助。

