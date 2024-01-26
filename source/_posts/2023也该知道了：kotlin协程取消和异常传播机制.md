---
title: 2023也该知道了：kotlin协程取消和异常传播机制
date: 2024-01-26 11:09:28
tags:
---

- 什么是结构化并发？
- 说好的异常传播为啥失效了？
- 怎么还有async不抛异常的问题？

## 1 结构化并发(Structured Concurrency)

### 1.1 java的"离散性并发"

kotlin 的Coroutine是【结构化并发】，与结构化并发对应的方式是【fire-and-forget 】姑且称之为【离散性并发】吧，可能不太准确。一个例子解释下离散性并发，java里我们开启一个线程之后，是不具备跟踪管理这个线程的能力的。如下

```java
    public void javaThreadFun() {
        Thread thread = new Thread(new Runnable() {
            @Override
            public void run() {
                //do some work
            }
        });
        thread.setName("child-thread");
        thread.start();
    }
```

这个例子中,调用javaThreadFun（）方法所在的线程，创建并启动child-thread线程之后两个线程没有明确的父子关系，javaThreadFun（）方法所在的线程不能天然的感知在自己线程里启动的"子线程"，子线程发生异常之后也不会影响到自己。如果父线程要取消中止在自己线程里启动的那些线程也没有现成的方式去供使用。总之，层级关系管理上很离散。

### 1.2 kotlin 协程的的结构化并发

![image.png](/images/kotlin_coroutine_exc_1706238534065.png)

kotlin的协程天然的具备父协程管理取消子协程、子协程的异常失败影响父协程或者父协程感知子协程错误和失败的能力。如下示例

```kotlin
      GlobalScope.launch {
            val parentJob = launch {
                val childJob = launch {
                    delay(1_000)//子任务做一些事情
                    throw NullPointerException() //会导致父协程任务和兄弟协程任务都会被取消
                }
                delay(5_000)
            }
        }
```

-   childJob失败抛出异常，会影响到父job，进而父job会取消掉其所有的子job。
-   另外，父job也会等待所有的子任务结束后自己才会结束。

与传统的相比

-   有跟踪：在协程作用域里启动一个协程，会把新启动的协程作为该协程的子协程，会跟踪这些子协程的状态。而不是像线程那些开启之后就忘记没有跟踪。父协程的结束也是要在所有子协程都完成之后自己才会完成，颇有家长负责制的感觉。
-   可取消：取消父协程也会把其子协程一并取消掉。如上图，取消掉parent-job会导致从属于他的所有子协程取消。
-   能传播：这特性体现在，子协程发生异常，会通知其父协程，父协程会取消掉自己所有的子协程然后再向上传递直到根协程。当然如果想改变这种既定的传播策略可通过supervisorJob.(这个下文我们会展开分析)

## 2 取消机制

### 2.1 父协程的取消会取消子协程

这一章节我们展开聊下Kotlin协程的取消机制，上一节我们提到，父协程/作用域的取消也会取消其子协程我们看个例子。

```kotlin
 GlobalScope.launch {
        val mParentJOb: Job = this.launch {
            val child1Job: Job = this.launch {
                this.launch {
                    delay(300)
                }.invokeOnCompletion { throwable ->
                    println("child1Job 执行完毕，收到了${throwable}")
                }
                val child2Job = this.launch {
                    delay(500)
                }.invokeOnCompletion { throwable ->
                    println("child2Job 执行完毕，收到了${throwable}")
                }
            }
            delay(100)
        }
        mParentJOb.invokeOnCompletion { throwable ->
            println("mParentJOb 执行完毕，收到了${throwable}")
        }
        println("发起取消 mParentJOb")
        mParentJOb.cancel()
    }.join()
```

运行结果：

```
发起取消 mParentJOb
child1Job 执行完毕，收到了kotlinx.coroutines.JobCancellationException: StandaloneCoroutine was cancelled; job=StandaloneCoroutine{Cancelling}@100b06de
child2Job 执行完毕，收到了kotlinx.coroutines.JobCancellationException: StandaloneCoroutine was cancelled; job=StandaloneCoroutine{Cancelling}@100b06de
mParentJOb 执行完毕，收到了kotlinx.coroutines.JobCancellationException: StandaloneCoroutine was cancelled; job=StandaloneCoroutine{Cancelled}@100b06de
```

### 2.2 兄弟协程取消不影响

```kotlin
private suspend fun brotherCoroutine() {
    coroutineScope {
        launch {
            delay(500)
            println("is running")
        }
        launch {
            delay(100)
            cancel()
        }.invokeOnCompletion {
            println("job2 is canceled")
        }
    }
}
```

这似乎没有什么可解释的，某个协程的取消并不会影响到其兄弟协程。

### 2.3 协程的取消是协作式的

协程的取消是协作式的体现在，对取消的通知需要主动的感知然后做出处理。举个例子

```kotlin
private suspend fun coroutineCanceling() {
    coroutineScope {
        val job = launch {
            var i = 0
            while (true) {//1
                println(" is running ${i++}")
            }
        }
        job.invokeOnCompletion {
            println("job is completion ${it}")
        }
        delay(50)
        job.cancel()
    }
}
```

会发现上面这个段代码并不能被取消，原因就是协程并没有感知到自己已经被取消了。这一点跟java thead interrupt机制类似，需要我们感知取消。感知取消的方式有

-   可以使用CoroutineScope.isActive（）的方法check是否已经被取消做出反应,代码一处可改成while (isActive)
-   所有的suspend方法内部也会感知cancel。比如delay()方法就是一个suspend方法。

### 2.4 做好善后取消

协程取消后我们可能会做一些诸如回收资源的动作，但在一个已经处于取消状态的协程里再调用suspend方法就抛出CancellationException异常。此时我们要使用 withContext(NonCancellable) 做取消后的工作

```kotlin
private suspend fun handleCanceling() {
    coroutineScope {
        val job = launch {
            try {
                delay(100)//do Something
            } finally {
                withContext(NonCancellable) {
                    delay(100)
                }
            }
        }
        job.invokeOnCompletion {
            println("job is completion ${it}")
        }
        delay(50)
        job.cancel()
    }
}
```

另外，还有特别注意的一点是，被取消的协程会向外抛出异常如果使用try-catch捕获但不抛出异常CancellationException，会影响到异常的传播，也就破坏了协程的异常传播机制，具体下一节异常传播机制展开。

### 2.5 kotlin协程的父子结构

看下面这段代码，思考一个问题，2处字符串会被打印出出来吗，为什么？

```kotlin
private suspend fun parentChildStructTest() {
    coroutineScope {
       val job1 =  launch {
         val job2 =  launch(Job()) {//1
                delay(500)
                println("job2 is finish")//2
            }
            delay(100)
            this.cancel()
        }
    }
}
```

会打印，不知道你有没有答对。

不是说好的，取消父协程的时候会取消掉其子协程吗？而且子协程里还调用了delay()方式，也会响应取消。问题的关键点在于，job1和job2的**父子结构被破坏了**。示例代码里1处传入了一个Job对象，此时job2的父层级已经变成了传入的job对象。我们稍加改造下，这里只是为了理解，不建议这么用，会发现job2可以被取消了。

```kotlin
private suspend fun parentChildStructTest() {
    coroutineScope {
        val job1 = launch {
            val j = Job()
            val job2 = launch(j) {
                delay(500)
                println("job2 is finish")
            }.invokeOnCompletion {
                println("job2 OnCompletion $it")
            }
            delay(100)
            j.cancel() //1
        }
    }
}
```

新协程的context的组成有两个公式

```kotlin
parentContext = scopeContext + AddionalContext(launch方法传入的context)
​
childContext = parentConxtext + job(新建)
```

![1_zuX5Ozc2TwofXlmDajxpzg.webp](/images/kotlin_coroutine_exc_1706238534232.png)(图来自[Roman Elizarov])

-   新协程的context是【parent context】和【新建job】的相加操作而来。
-   【parent context】是由父层级的context和传入的参数context相加操作而来。
-   子协程的job会和父层级中context的job建立一个父子关系。

当我们使用coroutineScope.launch(Job()){}传入了一个job实例的时候，其实子协程的job和传入的job实例建立了父子结构，破坏了原本的父子结构。

## 3 异常传播机制

### 3.1 异常的传播

```kotlin
private suspend fun destroyCoroutineScope() {
    coroutineScope {
        launch {
            launch {
                delay(500)
                throw NullPointerException()
            }.invokeOnCompletion {
                println("job-1 invokeOnCompletion $it")
            }
​
            launch {
                delay(800)
            }.invokeOnCompletion {
                println("job-2 invokeOnCompletion $it")
            }
        }.invokeOnCompletion {
            println("job-parent completion $it")
        }
    }
}
```

-   子job异常后，传播到父协程，父协程会取消到自己所有的子协程，然后再往上传播。
-   如果是一个取消异常(CancellationException)并不会被父协程消费，父协程的处理器会忽略他。也就是在子协程上抛出取消异常之后，父协程接收到不会做处理。

### 3.2 监督作用域异常传播（Supervision﻿）

**基本表现**：使用supervisorScope启动的子协程发生异常时，不影响父协程和兄弟协程。

```kotlin
private suspend fun supervisorJobTest() {
    supervisorScope {
        launch {
            delay(100)
            throw NullPointerException()
        }
        launch {
            delay(800)
            println("job 2 is running")
        }
    }
}
```

如上代码，supervisor范围内第一个job抛出异常后，并不会影响第二个job；把错误异常控制在范围内。

-   SupervisorCoroutine的子协程发生了异常之后不会影响父协程自身，也不会向上传播。
-   如果 CoroutineContext没有设置CoroutineExceptionHandle，最终异常会传播到ExceptionHandler

但其他的结构化并发特性仍然存在

-   当父协程取消，他的协程也被取消。
-   子协程取消不影响父协程。
-   父协程抛出异常，子协程也会被取消。
-   父协程要等所有子协程完成后才结束。

简单的讲，监督协程具备单向传播的特性，即子协程的异常和取消不影响父协程，父协程的异常和取消会影响子协程

**两种方式**:

-   构建CoroutineScope时传入SupervisorJob()
-   使用supervisorScope{}产生

**注意**：

监督协程中的每一个子作业应该通过异常处理机制处理自身的异常。如果不处理异常会被吞掉。

### 3.3 CoroutineExceptionHandler

用于捕获协程执行过程中未捕获的异常，被用来定义一个全局的异常处理器。

-   不能恢复异常,只是打印、记录、重启应用。
-   只能在【根作用域】或者【supervisorScope的直接子协程】启动协程是传入才生效。

举个例子

```kotlin
suspend fun coroutineExceptionHandlerTest() {
    supervisorScope {
        val handler = CoroutineExceptionHandler { _, _ -> println("handleException in coroutineExceptionHandler") }
        launch(handler) {
            delay(100)
            throw NullPointerException()
        }
    }
}  
```

### 3.4 浅看源码

主从作用域和协作作用域的表现区别上文已经讲到了，通常我们构建一个协程作用域两种方式

```kotlin
val scope = CoroutineScope(Job())
val supervisorJob = CoroutineScope(SupervisorJob())
```

-   CourotineScope()方法(没错这是个方法)，通过传入Job()SupervisorJob生成的对象最终获得主从作用域和协同作用域。

```kotlin
  supervisorScope { scope -> xx }
  coroutineScope { scope ->xx  }
```

-   通过supervisorScope()或者coroutineScope()构建作用域。

```kotlin
​
private class SupervisorCoroutine<in T>(
    context: CoroutineContext,
    uCont: Continuation<T>
) : ScopeCoroutine<T>(context, uCont) {
    override fun childCancelled(cause: Throwable): Boolean = false
}
​
private class SupervisorJobImpl(parent: Job?) : JobImpl(parent) {
    override fun childCancelled(cause: Throwable): Boolean = false
}
​
```

两种作用域在代码上的区别是 fun childCancelled(cause: Throwable) 方法的实现不同，监督作用域直接返回fasle表示不处理子协程的错误异常。让其自己处理

```kotlin
//JobSupport
    private fun cancelParent(cause: Throwable): Boolean {
        ... 
        return parent.childCancelled(cause) || isCancellation //1
    }
​
    private fun finalizeFinishingState(state: Finishing, proposedUpdate: Any?): Any? {
      ...
       val handled = cancelParent(finalException) || handleJobException(finalException)//2
       if (handled) (finalState as CompletedExceptionally).makeHandled()
      ...
    }
```

源代码中的核心逻辑，

-   1处的parent.childCanceled的值的最终来源其实就是我们实现的childCancelled方法的返回值
-   2处当我们是一个监督作用域起cancelParent的返回值为false，这种情况下代码就会执行后半句handleJobException()，这半句的内部其实最终是执行了我们设置的CoroutineExceptionHandler。
-   2处cancelParent除了在我们监督作用域的时候返回fasle，在根协程下会返回fasle，这也就是为什么CoroutineExceptionHandler设置在根协程下生效的原因。

代码很多细节不展开有兴趣的自行研究。

## 4 异常传播需注意问题

### 4.1 supervisorScope的孙子协程

```kotlin
private suspend fun childChildSupervisorJob() {
    supervisorScope { // SupervisorCouroutine
        launch {  // ScopeCoroutine
           val job1 =  launch {
                delay(100)
                throw NullPointerException()
            }
           val job2 = launch {
                delay(800)
                println("job 2 is running")
            }.invokeOnCompletion {
                println("job2 is completion $it")
            }
        }
    }
}
```

-   看上面这个例子job1抛出空指针异常后，job2会不会受影响。
-   是正常的coroutineScope而非supervisorScope，因此supervisorScope的“孙子协程”不遵循互不影响原则

### 4.2 注意不要破坏父子结构

```kotlin
private suspend fun textSupervisorJob() {
    supervisorScope {
        launch(SupervisorJob()) {//1
            launch {
                delay(100)
                throw NullPointerException()
            }
            launch {
                delay(800)
                println("job 2 is running")
            }.invokeOnCompletion {
                println("job2 is completion $it")
            }
        }
    }
}
```

-   job1抛出异常也会影响job2,原因1处虽然传入了SupervisorJob，但是这个实例其实是作为父context的job传入的，真是job1和job2的parentContext还是job类型，而不是SupervisorJob。具体原理可以看**2.5小节**

## 5 关于async的误会

通常构建一个协程除了使用CoroutineScope.launch{}还会使用CoroutineScope.async{}。

经常看到这种说法，async方式启动的协程返回一个Deferred对象，当调用deffered的await()方法的时候才会抛出异常

```kotlin

private suspend fun asyncSample() {
    val h = CoroutineScope(CoroutineExceptionHandler { _, _ -> println("发生了异常") })
    val d = h.launch {
        async {
            delay(100)
            throw NullPointerException()
        }
        launch { //job2
            delay(500)
            println("job 2 is finish")
        }
    }.join()
}
```

这个例子没有调用await()，实际发现也会立马抛出异常，导致jo2都没执行完。跟我们认为的不一样。

**实际情况是这样的**：当async被用作构建根协程（由协程作用域直接管理的协程）或者监督作用域直接管理协程时，异常不会主动抛出，而是在调用.await()时抛出。其他情况不等待await就会抛出异常。

## 6 总结

本文梳理了Kotlin的协程的取消和异常传播处理机制。机制的设置总的来说是服务于结构化并发的。本文应该能让我们了解掌握以下问题才算合格

-   kotlin协程结构化并发的特性
-   协程的context是怎么来的？怎么构成的？父协程的context和协程的parentContext是同一个概念吗？
-   kotlin的协程是怎么传播的？主从作用域监督作用域的区别？怎么实现
-   async方式启动的协程要await()的时候才抛出异常？