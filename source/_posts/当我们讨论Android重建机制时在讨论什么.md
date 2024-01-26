---
title: 当我们讨论Android重建机制时在讨论什么
date: 2023-01-25 22:18:36
tags:
---


### 前言

Android应用有一个常常被忽略的问题，但问题出现时你又不得不面对。比如

- Activity横竖屏转换时Fragment重影

- 应用长时间处于后台，并用户重新切到前台时，Activity显示异样或者需要等待一段时间才能显示内容

这类问题都与Activity的恢复重建机制相关，如果你想知道怎么解决这类问题，以及Activity恢复重建机制内部原理。这篇文或许能够帮到你。

### 1) 什么时候会重建

并不是任何Activity的销毁行为都会触发Activity数据的保存**。只有销毁行为是被系统发起的并且今后有可能恢复的时候才会触发**。

#### 1.1）不会触发重建机制

- 按返回按键。比如,A Activity启动B Activity，BActivity中返回不会调用BActivity的OnSaveInstanceState()方法
- 最近使用屏幕中滑动关闭 Activity。
- 从设置中【停止】应用
- 完成某种“完成”操作，开发者通过调用Activity #finish()方法完成

#### 1.2）有可能会触发重建机制的

触发恢复重建机制就是两大类

- 系统回收内存时kill掉。
- 横竖屏切换和语言切换等配置发生变化时kill重建。(可以通过 Activity #isChangingConfigurations()方法判断是否为配置更改发生的)。

当由系统发起而非人为手动关闭Activity的时候，Activity有可能在未来的某个时机恢复重建。Android系统提供了两套机制，用以保存和恢复界面状态。
这两套机制我个人分别给其取名为 **Save-Restore InstanceState机制**和**RetainNonConfiguration机制**

### 2）Save-Restore InstanceState机制

![1635401794(1).jpg](/images/android_recreate1706192281232.png)

- Save-Restore InstanceState机制的初衷是保存界面的一些瞬时状态，比如ListView滑动的位置、ViewPager的position一些TextView的文本内容。保证用户进入新建Activity的时候能尽快的看到界面状态的恢复。
- Save-Restore InstanceState是一些比较轻量级的数据，因为保存过程需要经历数据的序列化和反序列化。

对于开发者时机操作层面来说，Save-Restore InstanceState机制的核心就是Activity中 onSaveInstanceState() 、onCreate(）和onRestoreInstanceState(）这三个回调方法。

#### 2.1） onSaveInstanceState()

```java
#Activity
protected void onSaveInstanceState(@NonNull Bundle outState) {
    //A、整个view树中的view相关信息有机会保存到整个bundle中
    outState.putBundle(WINDOW_HIERARCHY_TAG, mWindow.saveHierarchyState());
    outState.putInt(LAST_AUTOFILL_ID, mLastAutofillId);
    Parcelable p = mFragments.saveAllState();
    if (p != null) {
        outState.putParcelable(FRAGMENTS_TAG, p);
    }
    if (mAutoFillResetNeeded) {
        outState.putBoolean(AUTOFILL_RESET_NEEDED, true);
        getAutofillManager().onSaveInstanceState(outState);
    }
    dispatchActivitySaveInstanceState(outState);
}
```

- onSaveInstanceState(outState)的被调用的条件：**非手动杀死**Activity而是系统kill同时可能会在未来重建时。
- 在Activity被系统kill时会调用onSaveInstanceState(outState)方法，允许开发者把一些今后重建时需要的一些状态数据存储到outState里面；这个方法的的**触发时机**是在onStop之前 （**Android P开始会在onDestory之前执行**）。
- 默认地，代码A处，onSaveInstance方法会通过window依次调用整个view树的各个view的onSaveInstanceState()方法，view树的每个符合条件的view都有机会存储一些状态。**需要注意的是**：需要保存view状态的view需要有id作为标识存储在Bundle整个数据结构中。也就是说当view没有id的时候是保存不成功的。

#### 2.2）onCreate(Bundle savedInstanceState)方法

被系统销毁又重建的Activity onCreate(Bundle savedInstanceState)回调方法中savedInstanceState的方法参数不为null。可以在这个位置取出被系统杀死之前保存的一些状态信息用来构建Activity。

#### 2.3）onRestoreInstanceState(Bundle savedInstanceState)

- 如果Activity是被系统重建的，会触发onRestoreInstanceState(savedInstanceState)方法，开发者可以在savedInstanceState中取出之前被系统销毁时存储的数据，用以在新Activity中恢复状态。

- onRestoreInstanceState调用时机是在onStart()之后被调用
- 默认地，onRestoreInstanceState方法会通过 mWindow.restoreHierarchyState()方法把之前保存的view状态信息分发出去，用以恢复view的状态。


```java
protected void onRestoreInstanceState(@NonNull Bundle savedInstanceState) {
    if (mWindow != null) {
        Bundle windowState = savedInstanceState.getBundle(WINDOW_HIERARCHY_TAG);
        if (windowState != null) {
            //window view树有一次机会恢复销毁之前的状态
            mWindow.restoreHierarchyState(windowState); 
        }
    }
}
```

### 3) 配置改变发生的重建

![image.png](/images/android_recreate1706192281499.png)

当如横竖屏的切换、语言切换等配置发生改变时也会触发Activity的重建。这种由配置发生改变而导致的Activity重建除了会触发Save-Restore InstanceState机制之外也会触发**RetainNonConfigurationInstance机制**

**RetainNonConfigurationInstance机制**的核心是Activity中onRetainNonConfigurationInstance（)和 getLastNonConfigurationInstance()这两个回调方法也会回调onRetainNonConfigurationInstance（）方法，



#### 3.1) onRetainNonConfigurationInstance()

- 用于保存配置发生前的数据，这个数据理论上是没有结构和大小限制的甚至可以把旧Activity本身保存其中。

- 触发时机会在onStop之前

```java
public Object onRetainNonConfigurationInstance() {
    return null;
}
```

#### 3.2）getLastNonConfigurationInstance()

- 当Activity 中getLastNonConfigurationInstance()方法返回值不为空的时候，说明当前这个Activity是因为配置发生变化重建而来的,可以使用这个返回值做一些Activity状态恢复的操作。



```java
public Object getLastNonConfigurationInstance() {
    return mLastNonConfigurationInstances != null
            ? mLastNonConfigurationInstances.activity : null;
}
```



### 4）两种机制有什么不同

- 数据上:
    - 通过Save-Restore InstanceState方式保存和恢复界面时只是一些简单的瞬时数据。究其原因这个机制是讲保存的数据传递到了系统进程，在恢复的时候又从系统进程传递到应用进程，数据经历序列化和反序列化，而这些操作又是在主线程。
    -  RetainInstance方式数据可以传递一些大数据甚至可以传递Activity本身。究其原因这个机制保存数据还是在当前应用进程，不会经历数据的序列化和反序列化。
- 触发条件上
    - Save-Restore InstanceState只要Activity有可能被系统kill就会调用onSaveInstance()方法,只要Activity被重建就会在onCreate()方法中传入instanceState数据和调用onRestoreInstaceState()方法。
    - RetaineInstance方式只在系统配置发生变化的时候才生效。

### 5）AndroidX 做了什么

坊间流传Jetpack中Viewmodel会比Activity的生命周期长，是怎么回事？

阅读这个章节之前如果你对ViewModel的创建比较了解读起来可能会省力些

#### 5.1) 横竖屏切换的时候

在androidx.activity:activity包下的ComponentActivity中关键点，
  ```java
  code 5.5.1
  static final class NonConfigurationInstances {
      Object custom;
      ViewModelStore viewModelStore;
  }
  ```

- 引入NonConfigurationInstances类，这个类主要有两个属性，分别用来保存自定义数据和viewModelStore.


  ```java
  code 5.5.2
  public final Object onRetainNonConfigurationInstance() {
      Object custom = onRetainCustomNonConfigurationInstance();
      ViewModelStore viewModelStore = mViewModelStore;
      if (viewModelStore == null) {
          NonConfigurationInstances nc = (NonConfigurationInstances) getLastNonConfigurationInstance();
          if (nc != null) { viewModelStore = nc.viewModelStore; }
      }
      if (viewModelStore == null && custom == null) {
          return null;
      }
      NonConfigurationInstances nci = new NonConfigurationInstances();
      nci.custom = custom;
      nci.viewModelStore = viewModelStore;
      return nci;
  }
  ```
- 重写了onRetainNonConfigurationInstance（）方法并把方法设置为了final。onRetainNonConfigurationInstance()方法内部创建NonConfigurationInstances对象nci，把viewModelStore存放到nci，同时收集onRetainCustomNonConfigurationInstance（）方法的返回值存在nci里
- 开发者可重写onRetainCustomNonConfigurationInstance()这个方法返回需要保存的数据。



  ```java
  code 5.5.3
  public ComponentActivity() {
      ...
  	getLifecycle().addObserver(new LifecycleEventObserver() {
   	   @Override
    	  public void onStateChanged(@NonNull LifecycleOwner source, @NonNull Lifecycle.Event event) {
        	  if (event == Lifecycle.Event.ON_DESTROY) {
          	    mContextAwareHelper.clearAvailableContext()
           	   if (!isChangingConfigurations()) { //不在更改配置状态
           	       getViewModelStore().clear(); //1
           	   }
        	  }
     	 }
  	});
  	getLifecycle().addObserver(new LifecycleEventObserver() {
     		 @Override
      	public void onStateChanged(@NonNull LifecycleOwner source,
              @NonNull Lifecycle.Event event) {
          	ensureViewModelStore();
          	getLifecycle().removeObserver(this);
      		}
  	}); 
    void ensureViewModelStore() { //在NonConfiguration中取出viewModleStore
      if (mViewModelStore == null) {
          NonConfigurationInstances nc =
                  (NonConfigurationInstances) getLastNonConfigurationInstance();
          if (nc != null) {
              mViewModelStore = nc.viewModelStore;
          }
          if (mViewModelStore == null) {
              mViewModelStore = new ViewModelStore();
          }
      }
  }
  ```

- viewmodel中横竖屏转换，横竖屏切换等配置发生变化导致的重建时，新Activity中可听过ensureViewModelStore()方法获取从旧Activity传递过来viewmodelstore，这样就实现了横竖屏切换的时候viewmodel不丢失。

- 另外值得注意的点是,Activity onDestory的时候，会通过**isChangingConfigurations()**方法判断activity是否处于配置变化状态，如果不是就会将viewmodelstores清空掉。



这套方式解决了一个问题当Activity由横竖屏转换等配置原因发生变化导致Activity重建的时候，会将旧Activity的viewModelStore传给新Activity。如果不是由于配置发生变化导致的Activity重建会清除掉viewModelStore


那有什么方式能解决**非配置变化**导致Activity重建时保存ViewModel的数据呢？

#### 5.2）非配置变化引起的Activity重建对ViewModel的保存

结论先行，因配置变化引起的Activity重建可以将ViewModleStore保存，在新Activity中可以直接获取旧Activity中的ViewModel。而对于非配置变化引起的Activity重建不能直接将ViewModelStore对象传递给新Activity。AndroidX中是将ViewModel的数据保存到Bundle中，给Bundle分配一个Key，这样ViewModel的保存和恢复就可以通过Save-Restore Stated Instance机制实现。

稍微展开下实现细节

##### 5.2.1) ViewModel销毁时数据保存

- 数据保存还是通过Activity Save-Restore StateInstace机制，Activity发起saveStatedInstance()时通过调用注册到SavedStateRegistry上SavedStateProvider的saveState（）方法获取到对应的Bundle当然最终存储到saveStatedInstance(outBundle)的outBundle中。
- 通常情况下，ViewModel中会有LiveData，SavedStateHandle中也支持LiveData中数据的保存，SavingStateLiveData继承MutableLiveData复写setValue（）方法，设置到LiveData的数据都会保存到mRegular中一份这样实现LiveData数据的保存。

```java
public final class SavedStateHandle {
..
    final Map<String, Object> mRegular;
    final Map<String, SavedStateProvider> mSavedStateProviders = new HashMap<>();
    private final Map<String, SavingStateLiveData<?>> mLiveDatas = new HashMap<>();
    
	private final SavedStateProvider mSavedStateProvider = new SavedStateProvider() {
  	  @SuppressWarnings("unchecked")
  	  @NonNull
   	 @Override
   	 public Bundle saveState() {
     	...
        Set<String> keySet = mRegular.keySet();
        ArrayList keys = new ArrayList(keySet.size());
        ArrayList value = new ArrayList(keys.size());
        for (String key : keySet) {
            keys.add(key);
            value.add(mRegular.get(key));
        }
        Bundle res = new Bundle();
        //把mRegular保存的数据存放到Bundle中返回
        res.putParcelableArrayList("keys", keys);
        res.putParcelableArrayList("values", value);
        return res;
    }
}
```

##### 5.2.2) ViewModel重建时恢复

- 带恢复功能的Viewmodel是通过SavedStateViewModelFactory创建，当Activity重建时，会在Activity的onCreate(Bundle data)带后旧Activity存的数据，这bundle中可以取出旧ViewModel的SavedStateHandle对象并以此为构造参数构建ViewModel。这样新建ViewModel就有了旧ViewModel的数据，数据是通过SavedStateHandle对象为介质进行传递的，ViewModel中可以使用对应的key恢复ViewModel的基本数据类型和可序列化的数据类型。

- 所以，在具备保存-恢复数据特性的ViewModle中获取数据时使用SavedStateHandle对象上的 get(@NonNull String key)方法。获取LiveData()时使用 MutableLiveData<T> getLiveData(String key)方法。内部方法实现是通过key在mRegular中获取到对应的值，再用值作为LiveData初始值创建LiveData。

##### 5.2.3）其他

- ViewModle中也会存在非序列化的数据(继承了Parcelable或Serializable)或者不能被Bundle存储的对象，如果要保存恢复这些数据怎么实现呢？ [Lifecycle 2.3.0-alpha03](https://developer.android.google.cn/jetpack/androidx/releases/lifecycle#2.3.0-alpha03) 开始允许设置自定义的SavedStateProvider这样我们可以把非序列化的数据转化成可序列化的数据保存到Bundle中，实现非序列化的数据的保存和恢复。

- ViewModel的数据保存和恢复虽然逻辑相对比较简单，但是里面涉及到的类和细节比较繁杂这个章节只是说明了一下实现的核心思想，如果大家想了解内部更多的实现细节，今后可以另开一篇展开聊。



### 6) 最后

- Android销毁重建机制常常会被开发者忽略,进而造成App线上出现非预期问题甚至crash。开发阶段我们可以通过 开发者模式 ->不保留活动选项，尽早的暴露相关的问题。
- 关于此类问题的解决时至今日，我们已经有比较完备的工具箱，如果比较熟悉这些工具内部的实现原理机制，在使用这些工具的时候会更得心应手。





不足处批评指正，望不吝点赞

