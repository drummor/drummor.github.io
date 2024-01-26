---
title: 横向对比Jetpack、RxJava、Glide框架中对组件生命周期Lifecycle感知原理
date: 2019-07-14 15:29:59
tags:
---
# 前言
在App开发中出于减少内存泄露,合理释放资源，减少内存占用等目的，我们经常要在组件的生命周期回调函数中执行相应的代码比如像这样:

```
class xxActivity extend Activity{
    public void onStart(){
        xxx.init()
    }
    public void onStop(){
        xxx.stop();
    }
    public void onDestoryt(){
       xxx.clean();
    }
}
```
能解决问题但不够优雅，耦合度太高，我们看看我们经常使用的那些优秀的框架是怎样来处理这个问题的。
# 1、Glide中的Lifecycle
使用Glide.with()一系列的重载方法，最终通过组织的图片请求就能感知组件生命周期并做出响应处理。他是怎么做到的呢？
## 1.1、RequestManagerRetriever相关代码
```
 public static RequestManager with(@NonNull Activity activity) {
    return getRetriever(activity).get(activity);
  }
```
- Glide.with(xxx)转交都转交给了RequsetManagerRetriever的一系列get()重载方法；最终返回一个RequestManager对象
- 在RequestManagerRetriever中获取到RequestManager是通过一系列的get（）重载方法，get（）方法的参数可以是Fragment、SupportFragment、Activity、SupportActivity、View或者Context。最终的目的都是尽可能通过这些组件中获取出**FragmentManager**。以参数为Activity为例代码如下：
```
public RequestManager get(@NonNull Activity activity) {
    if (Util.isOnBackgroundThread()) {
      return get(activity.getApplicationContext());
    } else {
      assertNotDestroyed(activity);
      //在Activity中获取到FragmentManager
      android.app.FragmentManager fm = activity.getFragmentManager();
      return fragmentGet(activity, fm, /*parentHint=*/ null, isActivityVisible(activity));
    }
  }
```
## 1.2、获取到RequestManager
通过这些方法获取或者创建Fragment

```
  @NonNull
  private RequestManager supportFragmentGet(
      @NonNull Context context,
      @NonNull FragmentManager fm,
      @Nullable Fragment parentHint,
      boolean isParentVisible) {
    SupportRequestManagerFragment current =
        getSupportRequestManagerFragment(fm, parentHint, isParentVisible);
    RequestManager requestManager = current.getRequestManager();
    if (requestManager == null) {
      // TODO(b/27524013): Factor out this Glide.get() call.
      Glide glide = Glide.get(context);
      requestManager =
          factory.build(
              glide, current.getGlideLifecycle(), current.getRequestManagerTreeNode(), context);
      current.setRequestManager(requestManager);
    }
    return requestManager;
  }
```
- 使用getSupportRequestManagerFragment（）方法获的SupportRequestManagerFragment。
- 如果是第一次，创建RequestManager，并设置设置给SupportRequestManager。如果不是第一次，直接从SupportRequestManagerFragment中获取。
- 返回RequestManager对象

## 1.3、 SupportRequestManager的构建
```
...
 final Map<FragmentManager, SupportRequestManagerFragment> pendingSupportRequestManagerFragments =
      new HashMap<>();
...
  @NonNull
  private SupportRequestManagerFragment getSupportRequestManagerFragment(
      @NonNull final FragmentManager fm, @Nullable Fragment parentHint, boolean isParentVisible) {
      //在Fragment中找ManagerFragment
    SupportRequestManagerFragment current =
        (SupportRequestManagerFragment) fm.findFragmentByTag(FRAGMENT_TAG);
        
    if (current == null) {
    //如果在没找到，就在存储的map中尝试获取
      current = pendingSupportRequestManagerFragments.get(fm);
      if (current == null) {
      //没有就创建新的。
        current = new SupportRequestManagerFragment();
        current.setParentFragmentHint(parentHint);
        if (isParentVisible) {
          current.getGlideLifecycle().onStart();
        }
        pendingSupportRequestManagerFragments.put(fm, current);
        //移除
        handler.obtainMessage(ID_REMOVE_SUPPORT_FRAGMENT_MANAGER, fm).sendToTarget();
      }
    }
    return current;
  }
```

如注释中所言，
- 如果FragmentManager中不存在tag为FRAGMENT_TAG然后返回
- 简而言之，RequestManagerTreeNode用来获取绑定该RequestManagerFragment的Fragment的所有子Fragment所绑定的RequestManagerFragment所绑定的RequestManager
- **值得注意**在FragmentManager中没有发现TAG为fragement_tag的时候会从pendingSupportRMF中获取如果没有就创建新的然后先将新创建的RMF放入pendingSupportRM中然后执行添加transaction紧接着通过handler又将RMF从pendingSupportRM中移除了，思考，为什么？
  因为
```
fm.beginTransaction().add(current, FRAGMENT_TAG).commitAllowingStateLoss();
```
这个操作是异步的！什么概念就是试想：这样的情况

```
public test(){
    Glide.with(activity).load("xxx1").into(target1);//1
    Glide.with(activity).load("xxx1").into(target2);//2
}
```
代码1和代码2被调用假设当前的activity还没有RequestManagerFragemnt，必然就会执行去创建的流程，代码1执行到了  pendingSupportRequestManagerFragments.put(fm, current);异步去添加，也就是使用handler将整个添加操作包装成了Message发送到了主线程的Looper中的messageQueue中而不是立即执行会等到Looper.looper（）中遍历到它然后交给他的handler去处理他。异步添加在RFM没有添加到Activity中的时候，然后代码2就执行了同样也Activity中没有RFM也会去创建，这样就会在同一Activity中有两个RequesManagerFragment就出事了，所以引入了pendingSupportRequestManagerFragments，保证不会有上述情况的发生。向Activity中添加RFM这个异步任务之后，向Handler发送移除从pendingSupportRequestManagerFragments移除，这样就保证，在添加成功之前，都能在pendingSupportRequestManagerFraments中获取到RFM。

## 1.4、SupportRequestManagerFragment
```
public class SupportRequestManagerFragment extends Fragment {

  private final ActivityFragmentLifecycle lifecycle;
  private final RequestManagerTreeNode requestManagerTreeNode = ...
  @Nullable private SupportRequestManagerFragment rootRequestManagerFragment;
  @Nullable private RequestManager requestManager;
    ...
  public SupportRequestManagerFragment() {
    this(new ActivityFragmentLifecycle());
  }
  ActivityFragmentLifecycle getGlideLifecycle() {
    return lifecycle;
  }
  ...
  private void addChildRequestManagerFragment(SupportRequestManagerFragment child) {
    childRequestManagerFragments.add(child);
  }

  private void removeChildRequestManagerFragment(SupportRequestManagerFragment child) {
    childRequestManagerFragments.remove(child);
  }
    ...
    ...
  @Override
  public void onAttach(Context context) {
    super.onAttach(context);
      registerFragmentWithRoot(getActivity());
  }

  @Override
  public void onDetach() {
    super.onDetach();
    unregisterFragmentWithRoot();
  }
  ...
```
- RequestManagerFragment在构造函数中默认创建一个ActivityFragmentLifecycle类型的成员变量。
- 在attach中registerFragmentWithRoot(),在onDetach()中unregisterFragmentWithRoot();
- 在RequestManagerFragment的对象中onStart（），onStop，中调用Lifecycle的响应函数
- 在RequestManager当中会向ActivityFragmentLifecycle注册监听对象，于是RequestManager就会对组件生命周期做出相应的反应。
- 另外当该Fragment作为一个子Fragment被添加到Fragment当中感知Fragment时，涉及到子Fragment管理可参考


## 1.5、RequestManager对Activity/Fragment生命周期感知

```
public class RequestManager implements LifecycleListener
  protected final Glide glide;
  protected final Context context;
  final Lifecycle lifecycle;
  private final RequestTracker requestTracker;
  ...
  RequestManager(...) {
	...
	//RequestManager将自身注册到Lifecycle中也就是RequestManagerFragment中的Lifecycle
    lifecycle.addListener(this);
    lifecycle.addListener(connectivityMonitor);
	  }
  public synchronized boolean isPaused() {
    return requestTracker.isPaused();
  }
  public synchronized void pauseRequests() {
    requestTracker.pauseRequests();
  }
  public synchronized void pauseAllRequests() {
    requestTracker.pauseAllRequests();
  }
  public synchronized void resumeRequests() {
    requestTracker.resumeRequests();
  }
  //相应的生命周期函数中使用处理土拍你请求
  @Override
  public synchronized void onStart() {
    resumeRequests();
    targetTracker.onStart();
  }
  @Override
  public synchronized void onStop() {
    pauseRequests();
    targetTracker.onStop();
  }
  //在onDestoty中取消解除绑定释放请求中的设计的资源
  @Override
  public synchronized void onDestroy() {
    targetTracker.onDestroy();
    targetTracker.clear();
    requestTracker.clearRequests();
    lifecycle.removeListener(this);
	...
    glide.unregisterRequestManager(this);
  }
}
```

- RequestManager实现了LifecycleListener,且创建的时候传入了Lifecycle参数赋值给成员变量。
- 被该RequestManager管理的请求都存放在RequestTracker对象这个成员变量属性中。
- RequestManager通过Lifecycle感知组件生命周期变化，在相应的生命周期状态下实现的LifecyleListener对应的回调函数会被执行，然后通过RequestTracker管理自己所关联的Request对象们。

## Glide中Lifecycle小结
![](/images/android_lifecycle_1706254319128.png)
为一个Request拥有所在组件的感知能力需要以下步骤：  
1.从给定的组件（Fragment/FragmentActivity/Activity...）获取出FragmentManager。

2.创建一个不带界面的Fragment（SupportRequestManagerFragment/RequestManagerFragment),这个不带界面的Frament有个Lifecycle成员变量，在Fragment创建的时候被初始化，用于监听此Fragment的生命周期。

3.将不带界面的Frament添加进给定组件。

4.创建RequestManager，RequestManager实现了LifecycleListener，创建的时候会传入无界面fragment中成员Lifecyle，RequestManager会把自己注册到Lifecycle中，这样RequestManager就拥有了感知组件生命周期的能力。

# 2、RxLifecycle
对RxLifecycle原理分析主要是依据trello的RxLifecycle，github传送门[点这里](https://github.com/trello/RxLifecycle)
## 2.1、简单使用
在Activity中使用为例，主要是使用以下两个方法：

```
bindUntilEvent(@NonNull ActivityEvent event)

bindToLifecycle()
```
使用的姿势是这样的：当Activity 回调onDestory生命周期函数的时候，就会解除订阅。

```
 Observable.interval(1, TimeUnit.SECONDS)
                .compose(bindUntilEvent(ActivityEvent.DESTROY))
                .subscribe();
```
## 2.2、RxActivity构成
追根溯源看看
要先理解Rxjava2中compose()操作符的含义
compose操作符是在不破坏rxjava流式基础上把当前的Observable转换为另一个Observable，传入的是一个Transformer对象使用。更为详细的关于这个操作符的介绍[点这](https://blog.csdn.net/u013378580/article/details/51607677)

```
public abstract class RxActivity extends Activity implements LifecycleProvider<ActivityEvent> {

    private final BehaviorSubject<ActivityEvent> lifecycleSubject = BehaviorSubject.create();
    @CheckResult
    public final <T> LifecycleTransformer<T> bindUntilEvent(@NonNull ActivityEvent event) {
        return RxLifecycle.bindUntilEvent(lifecycleSubject, event);
    }

    public final <T> LifecycleTransformer<T> bindToLifecycle() {
        return RxLifecycleAndroid.bindActivity(lifecycleSubject);
    }

    protected void onCreate(@Nullable Bundle savedInstanceState) {
        super.onCreate(savedInstanceState);
        lifecycleSubject.onNext(ActivityEvent.CREATE);
    }
    ....
    ....
    protected void onDestroy() {
        lifecycleSubject.onNext(ActivityEvent.DESTROY);
        super.onDestroy();
    }
}
```
- Activity中有个一个BehaviorSubject的成员变量：lifecycleSubject。BehaviorSubject会发送离订阅最近的上一个值，当没有最近值的的时候会发送默认值。
- bindUntilEvent(ActivityEvent avt)最终会返回一个Transformer作为compose()方法的参数。
- bindUtliEvent方法是RxActivity实现了LifecycleProvider接口的方法，他的实现转交到了RxLifecycle.bindUntilEvent()

## 2.3  LifecycleTransformer构建
关于Transformer构建在RxlifeCycle类中主要是以下三个方法：

```
    @CheckReturnValue
    public static <T, R> LifecycleTransformer<T> bindUntilEvent(@Nonnull final Observable<R> lifecycle,@Nonnull final R event) {
        ...判空
        return bind(takeUntilEvent(lifecycle, event));
    }
```
使用filter()操作符，获取一个过滤出传入的指定事件，其他事件不向下游分发的Observer，也就是只发送指定事件的Observable。
```
private static <R> Observable<R> takeUntilEvent(final Observable<R> lifecycle, final R event) {
        return lifecycle.filter(new Predicate<R>() {
            @Override
            public boolean test(R lifecycleEvent) throws Exception {
                return lifecycleEvent.equals(event);
            }
        });
```
将上一步得到的Observable其实是一个BehaviorSubject，当做构造参数传入LifecycleTransformer
```
public static <T, R> LifecycleTransformer<T> bind(@Nonnull final Observable<R> lifecycle) {
        return new LifecycleTransformer<>(lifecycle);
    }
```
## 2.4 LifecycleTransformer原理
看看LifecyclerTranformer里卖的啥药

```
public final class LifecycleTransformer<T> implements ObservableTransformer<T, T>,
                                                      FlowableTransformer<T, T>,
                                                      SingleTransformer<T, T>,
                                                      MaybeTransformer<T, T>,
    ...
   @Override
    public ObservableSource<T> apply(Observable<T> upstream) {
        return upstream.takeUntil(observable);
    }
    ...                                       
                                                          
}
```
真相大白，对upstream也就是我们使用时，xxx.compose()时的那个Observerable进行了takeUtil（）操作。
takeUtil的语义是

---
Returns an Observable that emits the items emitted by the source Observable until a second ObservableSource emits an item.
返回一个发送事件的观察源，直到第二个被观察者发送数据。

**综上**
当给被观察序列compose了Transformer对象后，会在相应的生命周期函数中终止。


## 2.5 小结
- Activity中有个BehaviorSubject 在Activity的生命周期回调函数中发送向其发送相应的事件。
- 主要原理就是通过LifecycleProvider的bindUtilEvent方法构建LifecycleTransformr;
- LifecycleTransformer里面的apply操作就是将Observable进行TakeUtil操作。这个操作的效果就是中断上游Observerable的发送Observer取消。比如调用了bindUtilEvent（DESTORY_EVENT）也就是当原始的Observer接收到Event事件的时候就会取消解除Observer监听。


# 3、Jetpack Lifecycle
## 3.1、SupportActivity中对Lifecycle支持
SupportActivity类实现了LifecycleOwner结构
- Activity onCreate方法中调用了ReportFragment的injectIfNeedIn()方法
```
public class SupportActivity extends Activity implements LifecycleOwner {
    private LifecycleRegistry mLifecycleRegistry = new LifecycleRegistry(this);
    protected void onCreate(@Nullable Bundle savedInstanceState) {
        super.onCreate(savedInstanceState);
        ReportFragment.injectIfNeededIn(this);
    }
  public Lifecycle getLifecycle() {
        return this.mLifecycleRegistry;
    }
```

- SupportActivity实现了LifecleOwner接口，这个接口只有一个方法geLifecycle();
- SupportActivity对这个接口的实现就是返回他的成员变量，LifecycleRegistry类型的成员变量。

## 3.2、ReportFragment生命周期变更
具有感知所在组件的能力在相应的生命周期回调函数里向LifecycleRegistry分发事件。

```
# ReportFragment
  public static void injectIfNeededIn(Activity activity) {
        android.app.FragmentManager manager = activity.getFragmentManager();
        if (manager.findFragmentByTag(REPORT_FRAGMENT_TAG) == null) {
            manager.beginTransaction().add(new ReportFragment(), REPORT_FRAGMENT_TAG).commit();
            //立即执行拒绝异步
            manager.executePendingTransactions();
        }
    }
    
    private void dispatch(Lifecycle.Event event) {
        Activity activity = getActivity();
        if (activity instanceof LifecycleRegistryOwner) {
            ((LifecycleRegistryOwner) activity).getLifecycle().handleLifecycleEvent(event);
            return;
        }
        /**2**/
        if (activity instanceof LifecycleOwner) {
            Lifecycle lifecycle = ((LifecycleOwner) activity).getLifecycle();
            if (lifecycle instanceof LifecycleRegistry) {
                ((LifecycleRegistry) lifecycle).handleLifecycleEvent(event);
            }
        }
    }
```
注释2处
- 如果Activity实现了LifecyclerOwener,LifecycleOwner接口中方法就是返回一个Lifecycle。
- Lifecycle的实现类LifecycleRegistry，LifecycleRegistry负责管理和分发生命周期状态。
- manager.executePendingTransactions();表示立即执行，transaction是异步的。FragmentManager的Transaction是异步执行了，如果想要立即执行就使用commitNow他表示当前的commit直接执行；executePendingTransactions()会将所有pending在队列中还有你新提交的transactions都执行了。

## 3.3、处理生命周期事件LifecycleRegistry
先来一张官方的图

![image](/images/android_lifecycle_1706254319475.png)

Jetpack对组件生命周期的管理有两个核心的概念事件（Event）和状态（State）。
他们直接的关系是**事件驱动状态的转换**。

一共有五种状态，五种状态之间是怎样通过事件驱动的方式实现转换的呢，如上图所示，
- **INITIALIZED**：这是一种初始状态。。
- **DESTROYED**  ：死亡状态，ON_DESTORY事件驱动进入这种状态。
- **CREATED**    ：创建状态，ON_CREATE事件和STOP事件驱动进入这种状态，ON_STOP事件驱动离开这种状态。
- **STARTED** :   开始状态，On_START事件和ON_PAUSE事件驱动进出该种状态，ON_RESUME和ON_STOP驱动离开该种状态。
- **RESUME**:ON_RESUME事件驱动进入该种状态，ON_PAUSE事件驱动离开这种状态。

图看百遍其意自现，其实当我们得知某种事件之后就能准确的得知出他将进入的状态体现就是在LifecycleRegistry的getStateAfter()方法中，就不用文字描述了很代码很能说明问题。

```
    static State getStateAfter(Event event) {
        switch (event) {
            case ON_CREATE:
            case ON_STOP:
                return CREATED;
            case ON_START:
            case ON_PAUSE:
                return STARTED;
            case ON_RESUME:
                return RESUMED;
            case ON_DESTROY:
                return DESTROYED;
            case ON_ANY:
                break;
        }
        throw new IllegalArgumentException("Unexpected event value " + event);
    }

```

LifecycleRegistry实现了Lifecyle抽象类，是生命周期监听者和分发生命周期事件的实际管理和分发者。其中的方法
-  public  void addObserver(LifecycleObserver observer)继承自父类Lifecycle，添加生命周期监听。
-  public  void removeObserver( LifecycleObserver observer)继承自父类Lifecycle,移除某个生命周期监听。
-  public void handleLifecycleEvent(Lifecycle.Event event)通知监听者最新的声明周期，并且存储。

### 3.3.1 通知更改 handleLifecycleEvent

```
   public void handleLifecycleEvent(@NonNull Lifecycle.Event event) {
        State next = getStateAfter(event);
        moveToState(next);
    }
```
根据事件能获取到组件进入的下一个状态，然后将通知监听改变状态 ：moveToState(next);MoveToState（）方中，修改LifecycleRegistry中mState状态，然后调用
sync()方法。

```
   private FastSafeIterableMap<LifecycleObserver, ObserverWithState> mObserverMap =
            new FastSafeIterableMap<>();
```
LifecycleRegistry中有mObserverMap存储这生命周期观察者，FastSafeIterableMap是一个Map的数据结构,key为LifecycleObserver,value为ObserverWithState。

```
 static class ObserverWithState {
     State mState;
     GenericLifecycleObserver mLifecycleObserver;

     ObserverWithState(LifecycleObserver observer, State initialState) {
         mLifecycleObserver = Lifecycling.getCallback(observer);
         mState = initialState;
     }

     void dispatchEvent(LifecycleOwner owner, Event event) {
         State newState = getStateAfter(event);
         mState = min(mState, newState);
         mLifecycleObserver.onStateChanged(owner, event);
         mState = newState;
     }
    }
``` 
# 结
### Glide vs RXJava vs Jetpack
- Glide作为一个加载图片的框架，当我们使用Glide.with(View/Fragment/View)时获取出具有感知组件生命周期的RequestManager并在相应的生命周期中开始/暂停/结束请求，结束是释放相应资源。对组件生命周期的感知的核心原理向Request/Activity中放入一没有界面的RequestManagerFragment，再相应的生命周期回调函数里调用方法通知外界注册了监听函数的监听者。
- Jetpack中对生命周期的管理其核心思想和Glide类似，也是放入向组件中放入一个无界面的ReportFragment，这个ReportFragment就拥有和组件同步的生命周期，依此来向外界通知生命状态，监听者做相应的处理。两个也是有不同，比如Glide关心onStart(),onStop()和onDestory()三个生命周期监听并且在相应的生命周期回调函数中做了相应的处理，在onStart（）中重试暂停或者失败的请求，在onStop中取消正在进行的请求，在destory中释放资源等。而Jetpack对
  onCreate、onStart、onResume、onPause、onStop和onDestroy都做了监听，这样对监听者提供更了更全面的状态通知。
- RxLifecycle中使用Compose和TakeUnitl操作符，告诉在指定的生命周期状态下终止操作，相对于Glide和Jetpack中对生命周期的管理显得单薄，而且如果要直接使用的话还要集成RxActivity或者RxFragment，当然也可以自己实现用BehaviorSubject自己实现，但总的来说侵入性强。takeutil操作符带来的问题就是当操作被终止后还是会发送onComplete或者onError事件，这对于在这两个方法中有业务处理的情况来说不是一个优雅的实现。于是看到了知乎团队基于无界面Fragment感知组件生命周期的思想，实现了一套RxLifecycle有兴趣的可以参考[知乎RxLifecycle](https://github.com/zhihu/RxLifecycle)

### 留点念想
- takeUntil()操作符是内部怎么做到中止操作的？
- Glide除了感知组件的生命周期是怎么感知网络变化并作出相应处理的？
- 关于对Jetpack中对组件生命周期监听的具体应用在LiveData和ViewModule中都有体现，他们是怎么工作的？
- 另外，Jetpack中LifecycleListener还能通过注解的方式回调执行怎么做到的？
- and so on

**这些下回写**
